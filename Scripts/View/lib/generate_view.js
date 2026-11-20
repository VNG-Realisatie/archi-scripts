/**
 * View generation API.
 *
 * Orchestrator. Read the selection once (Snapshot) → plan (pure: object set, layout graph, the
 * layout — engine calls until the container labels fit — write plan) → apply the write plan to the
 * target view → styling.
 *
 * The writer's rule (SPEC §5): per result object,
 *   exists on target view? → reposition (appearance preserved; parenthood re-derived from the nesting)
 *   else                  → create (default appearance)
 *
 * No per-action branches in the plan or the writer. Action only determines (a) which objects feed
 * the layout and (b) which view is the target.
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading generate_view.js");

/** @type {typeof import("../../_lib/Common")} */
const Common       = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");

/** @type {typeof import("./defs")} */
const Defs       = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./hidden_properties")} */
const HiddenProps = require(REPO_ROOT + "View/lib/hidden_properties");
/** @type {typeof import("./selection_pipeline")} */
const Pipeline   = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("./nesting")} */
const Nesting    = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
/** @type {typeof import("./layout_graph")} */
const LayoutGraph = require(REPO_ROOT + "View/lib/layout_graph");
/** @type {typeof import("./arrangement")} */
const Arrangement = require(REPO_ROOT + "View/lib/arrangement");
/** @type {typeof import("./process_runner")} */
const ProcessRun = require(REPO_ROOT + "View/lib/process_runner");
/** @type {typeof import("./node_layout")} */
const NodeLayout = require(REPO_ROOT + "View/lib/node_layout");
/** @type {typeof import("./view_config")} */
const ViewConfig = require(REPO_ROOT + "View/lib/view_config");
/** @type {typeof import("./text_measure")} */
const TextMeasure = require(REPO_ROOT + "View/lib/text_measure");
/** @type {typeof import("./write_plan")} */
const WritePlan  = require(REPO_ROOT + "View/lib/write_plan");
/** @type {typeof import("./view_writer")} */
const ViewWriter = require(REPO_ROOT + "View/lib/view_writer");
/** @type {typeof import("./view_origin")} */
const ViewOrigin = require(REPO_ROOT + "View/lib/view_origin");
/** @type {typeof import("./appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");
/** @type {typeof import("./engines/engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
/** @type {typeof import("./engines/registry")} */
const Registry = require(REPO_ROOT + "View/lib/engines/registry");

const {
  ACTION, ALGORITHMS, GENERATED_VIEW_FOLDER, PROP_ID,
  validatePreset, effectiveParams, connectionsModeLock,
} = Defs;

// Archi's own Java classes, not the jArchi API: used only by _openView (ARCHITECTURE § Platform constraints).
const EditorManager       = Java.type("com.archimatetool.editor.ui.services.EditorManager");
const IEditorModelManager = Java.type("com.archimatetool.editor.model.IEditorModelManager");
const ArchimateModelUtils = Java.type("com.archimatetool.model.util.ArchimateModelUtils");
const PlatformUI          = Java.type("org.eclipse.ui.PlatformUI");

// ── Settings outside the dialog ───────────────────────────────────────────────

/**
 * Console lines for the preset's engineParams: every key that applies, a ⚠ line per key that is
 * not used, equals its default or overrides a dialog option, and a ✗ line per section that is not an
 * object and per value of the wrong type. Checked: the label sizing and the run's engine; another
 * engine's section is checked by a run with that engine.
 * @param {MaskedPreset} preset
 * @returns {{ lines: string[], invalid: number }}  lines: empty when the preset sets nothing outside
 *   the dialog; invalid: the ✗ lines, on which the run stops
 */
function checkEngineParams(preset) {
  const engine = ALGORITHMS[preset.algorithm].engine;
  const sections = new Set([...Registry.ENGINES, "layout"]);
  const isObject = (/** @type {unknown} */ v) => !!v && typeof v === "object" && !Array.isArray(v);
  /** @type {string[]} */
  const lines = [];
  let invalid = 0;
  for (const [section, value] of Object.entries(preset.engineParams)) {
    if (!sections.has(section)) lines.push(`  ⚠ ${section}: ${EngineUtils.SETTING_UNKNOWN}`);
    else if (!isObject(value)) { lines.push(`  ✗ ${section} = ${JSON.stringify(value)}: must be an object of settings — correct it`); invalid++; }
  }
  /** @type {[string, () => SettingFinding[]][]} */
  const owners = [
    ["layout", () => EngineUtils.checkLabelSizing(preset.engineParams.layout)],
    [engine,   () => Registry.adapterOf(engine).checkEngineParams(preset)],
  ];
  for (const [section, check] of owners) {
    const value = /** @type {Record<string, unknown>} */ (preset.engineParams)[section];   // Cast: section is an EngineParams key
    if (value !== undefined && !isObject(value)) continue;   // reported above
    for (const f of check()) {
      const setting = `${section} "${f.key}" = ${JSON.stringify(f.value)}`;
      if (f.invalid) invalid++;
      lines.push(f.invalid ? `  ✗ ${setting}: ${f.problem}`
        : f.problem ? `  ⚠ ${setting}: ${f.problem}`
        : `  ${setting}${f.without !== undefined ? ` (default ${f.without})` : ""}`);
    }
  }
  return { lines: lines.length ? ["Settings outside the dialog (engineParams):", ...lines] : [], invalid };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate, expand, or re-layout one or more Archi views.
 *
 * @param {PresetFile}      rawPreset   raw preset object (will be validated)
 * @param {ArchiCollection<ArchiObject>} uiSelection $(selection) from Archi UI
 * @param {string}          [actionId]  ACTION.*.id (runtime — not stored in preset files); default NEW_VIEW
 * @param {GenerateOptions} [options]   origin of the run; without it a new view gets no origin
 * @returns {ArchimateView[]}
 * @throws when the run fails; the caller shows the reason (ARCHITECTURE § Errors)
 */
function generate_view(rawPreset, uiSelection, actionId, options = {}) {
  Common.startCounter("generate_view");
  /** @type {MaskedPreset} */
  const preset = validatePreset(rawPreset);   // masked to the algorithm's params a few lines down
  const action = actionId || ACTION.NEW_VIEW.id;

  // SPEC §11: capability masking. Replace preset.params with the effective subset
  // for runtime consumption. Inactive keys are silently dropped here; the raw
  // preset on disk is preserved by validatePreset for UI restoration on
  // algorithm switch.
  // Casts: preset.params is still the full set here.
  const _rawParams = /** @type {PresetParams & Record<string, unknown>} */ (preset.params);
  preset.params = effectiveParams(/** @type {Preset} */ (preset));
  const _dropped = Object.keys(_rawParams).filter(k => !(k in preset.params)
    && _rawParams[k] !== undefined && _rawParams[k] !== null
    && !(Array.isArray(_rawParams[k]) && _rawParams[k].length === 0));
  if (_dropped.length) Log.debug(`Algorithm "${preset.algorithm}" ignores inactive params: ${_dropped.join(", ")}`);
  if (_rawParams.connectionsMode !== preset.params.connectionsMode && preset.params.connectionsMode !== undefined)
    Log.debug(`Connections: "${preset.params.connectionsMode}" (Across containers not possible with ${connectionsModeLock(preset.algorithm, _rawParams)})`);

  Log.debug(`\n=== generate_view ===`);
  Log.debug(`Action: ${action}`);
  Log.debug(`Algorithm: ${preset.algorithm}`);
  {
    const p = preset.params;
    const parts = [
      p.direction        && `dir=${p.direction}`,
      p.routing          && `routing=${p.routing}`,
      p.labelPosition    && `label=${p.labelPosition}`,
      `spacing=el:${p.elementSpacing ?? "—"} layer:${p.layerSpacing ?? "—"}`,
      `size=${p.elementWidth ?? "—"}×${p.elementHeight ?? "—"}`,
      (p.nestingConditions && p.nestingConditions.length) && `nesting=${p.nestingConditions.length}conditions containerAlgo=${p.containerAlgorithm || "(same)"}  connMode=${p.connectionsMode}`,
    ].filter(Boolean);
    Log.debug(`Params: ${parts.join("  ")}`);
  }
  const hidden = _hiddenParams(preset);
  if (hidden.length) Log.debug(`Preset values not in dialog: ${hidden.join("  ")}`);
  if (!options.regenerate) _logStart(preset, _rawParams, action, uiSelection, options);
  const settings = checkEngineParams(preset);
  for (const line of settings.lines) _logEngineParamsLine(line);
  if (settings.invalid) {
    throw new Error(`${settings.invalid} engineParams setting(s) of the wrong type (✗ above). Correct the preset; nothing is written.`);
  }
  Log.debug(`Name: "${preset.view.name}"  Folder: ${preset.view.mirrored ? "Mirrored" : `Custom "${preset.view.folder}"`}${preset.view.underGenerated ? `  under ${GENERATED_VIEW_FOLDER}` : ""}`);
  {
    const vsMode = _rawParams.viewSizeMode || "none";
    const vsVal  = vsMode === "maxWidth"    ? `maxWidth=${_rawParams.maxWidth}`
                 : vsMode === "aspectRatio" ? `aspectRatio=${_rawParams.aspectRatio}`
                 : "none";
    Log.debug(`View size requested: ${vsVal}`);
  }

  /** @type {ArchimateView[]} */
  const views = [];
  try {
    const runtime = _layoutRuntime();
    if (action === ACTION.ONE_EACH.id) {
      views.push(..._generateOneEach(preset, uiSelection, runtime, options));
    } else {
      const target = _singleTarget(uiSelection, action, options);
      const name = target.view ? target.view.name : preset.view.name;
      const view = _generateView(preset, uiSelection, action, target, runtime, name);
      if (view) views.push(view);
    }
  } finally {   // a failure before the views goes to the entry point, which shows it (ARCHITECTURE § Errors)
    Log.debug(`\ngenerate_view: ${Common.endCounter("generate_view")}`);
  }

  // Open the generated view(s) in Archi's UI.
  //   NEW_VIEW / EXPAND_VIEW / LAYOUT_ONLY → exactly one view in `views`; open it.
  //   ONE_EACH                              → potentially many views; open only the first
  //                                           so the user isn't flooded with N tabs.
  // Archi's command line has no window to open them in.
  if (views.length > 0 && PlatformUI.isWorkbenchRunning()) _openView(views[0]);
  return views;
}

/**
 * Open a view in Archi's editor tab, as the focused tab. Not `view.openInUI()`: that first re-announces
 * the model as opened, and Archi's model tree then selects the model instead of the view.
 * @param {ArchimateView} view
 */
function _openView(view) {
  try {
    // Archi returns null instead of throwing at every step
    // Copies of one model file share the model id; the file path tells them apart (null while unsaved)
    const path  = view.model.getPath();
    const model = IEditorModelManager.INSTANCE.getModels().find((/** @type {any} */ m) =>
      m.getId() === view.model.id && (m.getFile() ? m.getFile().getAbsolutePath() : null) === path);
    if (!model) throw new Error(`model ${view.model.id} (${path}) not found among the loaded models`);
    const diagramModel = ArchimateModelUtils.getObjectByID(model, view.id);
    if (!diagramModel) throw new Error(`view ${view.id} not found in the model`);
    if (!EditorManager.openDiagramEditor(diagramModel, true)) throw new Error("Archi opened no editor");
  } catch (e) {
    Log.warn(`View "${view && view.name}" was written but not opened.`, { action: "open it from the model tree." });
    Log.detail("WARN", `Failed to open "${view && view.name}" in the UI: ${e}`);
  }
}

// ── Console: start and per view ───────────────────────────────────────────────

/**
 * The start of a run on the console: action, preset, selection, settings, target and the log file.
 * @param {MaskedPreset}                 preset
 * @param {PresetParams & Record<string, unknown>} rawParams  before masking
 * @param {string}                       action
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {GenerateOptions}              options
 */
function _logStart(preset, rawParams, action, uiSelection, options) {
  const origin = options.origin || {};
  const presetName = origin.preset || options.presetName || "unnamed preset";
  const actionLabel = (Object.values(ACTION).find(a => a.id === action) || { label: action }).label;
  const p = preset.params;
  const nesting = p.nestingConditions && p.nestingConditions.length
    ? `nesting: ${p.nestingConditions.length} condition${p.nestingConditions.length === 1 ? "" : "s"}` : "no nesting";
  const size = rawParams.viewSizeMode === "maxWidth" ? `max width ${rawParams.maxWidth} px`
    : rawParams.viewSizeMode === "aspectRatio" ? `aspect ratio ${rawParams.aspectRatio}` : "view size free";
  const settings = [preset.algorithm, p.direction && `direction ${p.direction}`, nesting, size].filter(Boolean).join(" · ");
  const hidden = _hiddenParams(preset);
  let selection = _describeSelection(uiSelection);
  if (action === ACTION.ONE_EACH.id) {
    const seeds = Pipeline.applyFilter(SelectionRead.getSeedElements(uiSelection), preset.filter).length;
    selection += ` → ${seeds} view${seeds === 1 ? "" : "s"}`;
  }

  Log.info("");
  Log.info(`View generation: ${actionLabel}`);
  Log.info(Log.field("Preset:", `${presetName}${origin.modified ? " (modified, not saved)" : ""}`
    + (origin.direction ? ` · direction ${origin.direction} (script name)` : ""), 2));
  Log.info(Log.field("Selection:", selection, 2));
  Log.info(Log.field("Settings:", settings, 2));
  if (hidden.length) Log.info(Log.field("", `also active, not in the dialog: ${hidden.join(" · ")}`, 2));
  Log.info(Log.field("Target:", _describeTarget(preset, action, uiSelection), 2));
  const logFile = Log.name(presetName);
  if (logFile) Log.info(Log.field("Log file:", logFile, 2));
  Log.info("");
}

/**
 * Params without a dialog control (defs.HIDDEN_PARAMS) whose preset value differs from the default,
 * so it does not act unseen.
 * @param {MaskedPreset} preset
 * @returns {string[]} "key=value"
 */
function _hiddenParams(preset) {
  // Casts: k is a params key.
  const shown    = /** @type {Record<string, unknown>} */ (preset.params);
  const defaults = /** @type {Record<string, unknown>} */ (Defs.DEFAULT_PRESET.params);
  return Defs.HIDDEN_PARAMS.filter(k => k in preset.params && shown[k] !== defaults[k]).map(k => `${k}=${shown[k]}`);
}

/**
 * What is selected in Archi, by kind, and where: "1 view in the model tree: "X"", "3 elements on view "Y"".
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {string}
 */
function _describeSelection(uiSelection) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  /** @type {Set<string>} */
  const views = new Set(), types = new Set();
  let first = "", total = 0;
  uiSelection.each(o => {
    total++;
    if (!first) first = o.name || "";
    if (o.view) views.add(o.view.name);
    const type = String(o.type);
    const kind = type === "folder" ? "folder"
      : !o.view && type.endsWith("-model") ? "view"
      : type.endsWith("-relationship") ? "relation"
      : type in Defs.DIAGRAM_TYPES ? "diagram object" : "element";
    if (kind === "element") types.add(type);
    counts.set(kind, (counts.get(kind) || 0) + 1);
  });
  if (!total) return "nothing selected";
  const parts = [...counts].map(([kind, n]) => `${n} ${kind}${n === 1 ? "" : "s"}`);
  const where = views.size ? `on view ${[...views].map(n => `"${n}"`).join(", ")}` : "in the model tree";
  const detail = total === 1 ? `: "${first}"` : types.size > 1 ? ` (${types.size} element types)` : "";
  return `${parts.join(" · ")} ${where}${detail}`;
}

/**
 * Where the run writes, as the console says it.
 * @param {MaskedPreset}                 preset
 * @param {string}                       action
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {string}
 */
function _describeTarget(preset, action, uiSelection) {
  if (action === ACTION.EXPAND_VIEW.id || action === ACTION.LAYOUT_ONLY.id) {
    const o = uiSelection.first();
    const view = o && (o.view || (String(o.type).endsWith("-model") ? o : null));
    return view ? `the selected view "${view.name}" (in place)` : "the selected view (in place)";
  }
  const what = action === ACTION.ONE_EACH.id ? "a view per element" : `new view${preset.view.name ? ` "${preset.view.name}"` : ""}`;
  if (preset.view.mirrored) return `${what}, in its element's folder${preset.view.underGenerated ? ` under /Views${GENERATED_VIEW_FOLDER}` : ""}`;
  const path = Defs.viewFolderPath(preset.view);
  return `${what} in /Views${path === "/" ? "" : path}`;
}

/**
 * A line of checkEngineParams at its level: ✗ an error, ⚠ a warning, else detail.
 * @param {string} line
 */
function _logEngineParamsLine(line) {
  const t = line.trim();
  if (t.startsWith("✗ ")) Log.error(`Preset setting outside the dialog: engineParams ${t.substring(2)}`);
  else if (t.startsWith("⚠ ")) Log.warn(`Preset setting outside the dialog: engineParams ${t.substring(2)}`);
  else Log.debug(line);
}

/**
 * One view of a run, with its status on the console: generated, skipped (nothing to place, reason
 * given) or failed. A failure stays with this view; the run goes on (ARCHITECTURE § Errors).
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string}                       actionId
 * @param {ViewTarget}                   target
 * @param {LayoutRuntime}                runtime
 * @param {string}                       name  for the console until the view has its own
 * @returns {ArchimateView | null}
 */
function _generateView(preset, uiSelection, actionId, target, runtime, name) {
  Log.beginItem("view", name || "view");
  const subject = name ? `"${name}"` : "no view written";
  try {
    const done = _generateSingle(preset, uiSelection, actionId, target, runtime);
    if (!done) { Log.endItem("skipped", `Skipped: ${subject}`); return null; }
    Log.endItem("done", `${done.status}: "${done.view.name}" in ${ArchiFolders.printFolderPath(done.view).replace(/(.)\/$/, "$1")}`, done.details);
    return done.view;
  } catch (error) {
    const e = /** @type {Error} */ (error);   // Cast: an Error, or a Java exception from Archi
    Log.error(String(e.message || e).trim(), {
      effect: "this view is not written, or only partly (Undo restores the whole run).",
      action: "see the reason above; details in the log file (search for ERROR).",
    });
    Log.detail("ERROR", String(e.stack || e));
    Log.endItem("failed", `Failed: ${subject}`);
    return null;
  }
}

// ── View properties ───────────────────────────────────────────────────────────

/**
 * @param {ArchimateView} view
 * @param {MaskedPreset}  preset
 */
function _applyViewProperties(view, preset) {
  const vp = preset.viewProperties;
  if (!vp) return;

  const hidden = HiddenProps.hiddenKeys();
  /** @type {string[]} */
  const lines = [];
  (vp.properties || []).forEach(p => {
    // docs/reference/gui.md (Properties tab): a ticked row is written (no value clears the key), an unticked row removes the key.
    if (!p.key) return;
    if (hidden.has(p.key)) {
      Log.warn(`View property "${p.key}" is hidden (${HiddenProps.HIDDEN_FILE}) and is left alone.`, { action: "remove it from the preset." });
      return;
    }
    if (p.enabled && p.value) {
      view.prop(p.key, p.value);
      lines.push(`  prop set:     ${p.key} = "${p.value}"`);
    } else if (view.prop(p.key) !== null) {
      view.removeProp(p.key);
      lines.push(`  prop removed: ${p.key}`);
    }
  });

  if (vp.addObjectId && !view.prop(PROP_ID)) {
    const id = Common.generateUUID();
    view.prop(PROP_ID, id);
    lines.push(`  prop set:     ${PROP_ID} = "${id}" (new)`);
  }
  if (lines.length) Log.debug("\nProperties:\n" + lines.join("\n"));   // no heading when nothing changed
}

// ── Single view ───────────────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string}                       actionId
 * @param {ViewTarget}                   target  where a Create action writes, and the origin it leaves
 * @param {LayoutRuntime}                runtime
 * @returns {{ view: ArchimateView, status: string, details: string[] } | null}  status: New, Updated or
 *   Overwritten; details: the console lines under it; null when there is nothing to place
 */
function _generateSingle(preset, uiSelection, actionId, target, runtime) {
  const timer = _phaseTimer();
  const snapshot = SelectionRead.readSelection(uiSelection, actionId);
  snapshot.background = SelectionRead.readBackground(preset.params.backgroundView);
  timer.lap("selection");

  // Determine the target view.
  //   EXPAND_VIEW / LAYOUT_ONLY → the selected existing view, changed in place
  //                               (preset view name and folder apply to new views only).
  //   NEW_VIEW                  → a new view (created or overwritten by name) — only after the
  //                               layout succeeded, so a failed run leaves an existing view as it was.
  const inPlace = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  // Cast: the selected view of a Modify action is an ArchiMate view.
  const existingView = /** @type {ArchimateView | null} */ (snapshot.existing.existingView);
  if (inPlace) {
    Log.debug("\nView target:");
    if (!existingView) throw new Error("Layout only and Expand view: select a view, or objects on a view, to work on.");
    Log.debug(`  Using: "${existingView.name}" (in place)`);
  }

  const planned = plan(preset, snapshot, actionId, runtime, timer);
  if (!planned) return null;

  let view = existingView;
  let status = "Updated";
  if (!view) {   // a Create action (a Modify action without its view returned above)
    Log.debug("\nView target:");
    ({ view, status } = _targetView(preset, planned.objectSet.elements, target));
  }

  Log.debug("\nWrite:");
  const { written, onView, failed } = ViewWriter.applyWritePlan(view, planned.writePlan);
  timer.lap("write");
  if (failed.length) Log.warn(`${failed.length} write step${failed.length === 1 ? "" : "s"} failed: ${failed.slice(0, 3).join("; ")}${failed.length > 3 ? "; …" : ""}`, {
    effect: "the view is not complete.", action: "check the view; details in the log file (search for WARN)." });

  // Appearance pass — post-write styling (colors, fonts). No-op when all features disabled.
  // Visuals inside a diagram-block keep their appearance: on a Create action, their copies.
  /** @type {Map<string, string>} */
  const keep = new Map();
  for (const [id, block] of planned.objectSet.diagramBlockOf || new Map()) {
    const copy = written.get(id);
    keep.set(copy ? String(copy.id) : id, block);
  }
  Appearance.applyAppearance(view, preset, actionId, TextMeasure.defaultViewFont(), keep, Arrangement.elementsOf(planned.objectSet.arrangements));
  _applyViewProperties(view, preset);
  _recordOrigin(view, actionId, target);
  timer.lap("appearance");

  Log.debug(`\nTiming: ${timer.summary()}`);
  return { view, status, details: _viewDetails(planned.counts, onView, actionId, timer.total()) };
}

/**
 * The console lines of a written view: what it started from, what the steps added, what is on it.
 * @param {PlanCounts}   counts
 * @param {ObjectsOnView} onView
 * @param {string}       actionId
 * @param {number}       ms
 * @returns {string[]}
 */
function _viewDetails(counts, onView, actionId, ms) {
  const n = (/** @type {number} */ k, /** @type {string} */ word) => `${k} ${word}${k === 1 ? "" : "s"}`;
  const field = (/** @type {string} */ label, /** @type {string} */ value) => Log.field(label, value, 0, Log.DETAIL_COLUMN);
  const isModify = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  const lines = [];
  if (isModify) lines.push(field("Base:", `${n(counts.base.elements, "element")} · ${n(counts.base.relations, "relation")} on the view (filter not applied)`));
  else {
    const out = counts.selected - counts.base.elements;
    lines.push(field("Filtered base:", `${n(counts.base.elements, "element")} · ${n(counts.base.relations, "relation")}${out > 0 ? ` (${out} filtered out)` : ""}`));
  }
  if (counts.steps.elements || counts.steps.relations) lines.push(field("Step adds:", `${n(counts.steps.elements, "element")} · ${n(counts.steps.relations, "relation")}`));
  const roles = [counts.view.containers && n(counts.view.containers, "container"), counts.view.nestedElements && n(counts.view.nestedElements, "nested element")].filter(Boolean);
  const parts = [`${n(onView.elements, "element")}${roles.length ? ` (${roles.join(", ")})` : ""}`,
    n(onView.nestings, "nesting"), n(onView.connections, "connection")];
  if (onView.diagramObjects) parts.push(n(onView.diagramObjects, "diagram object"));
  lines.push(field("On view:", parts.join(" · ")));
  lines.push(field("Size:", `${counts.size.width} × ${counts.size.height} px · ${Log.seconds(ms)}`));
  return lines;
}

/**
 * Where the layout of a run in Archi runs: in a Node layout process, programs started by the Java
 * runner from the paths of the View configuration (config.js). Read once per run. Labels are
 * measured with SWT in Archi's view fonts.
 * @returns {LayoutRuntime}
 */
function _layoutRuntime() {
  const Files = Java.type("java.nio.file.Files");
  const Paths = Java.type("java.nio.file.Paths");
  const config = ViewConfig.readConfig(path => Files.exists(Paths.get(path)));
  return { runProcess: ViewConfig.programRunner(ProcessRun.runProcess, config), config, inProcess: false,
           measureText: TextMeasure.createTextMeasure(), lineBreaks: TextMeasure.createLineBreaks(), defaultFont: TextMeasure.defaultViewFont(),
           newVisual: TextMeasure.newVisualDefaults() };
}

/**
 * The pure part of one view generation: object set, relation roles, layout graph, layout engine,
 * write plan. Archi runs it on the Snapshot readSelection read; the Node harness on one read from a
 * model file. The target view's contents come from the Snapshot (none for a Create action).
 * @param {MaskedPreset} preset    validated, params masked to the algorithm (effectiveParams)
 * @param {Snapshot}     snapshot
 * @param {string}       actionId  ACTION.*.id
 * @param {LayoutRuntime} runtime  where the layout runs; its runner starts the Node layout process and
 *   Graphviz: Java in Archi, child_process in Node
 * @param {{ lap(name: string): void }} [timer]  phase timing
 * @returns {{ objectSet: ObjectSet, graph: LayoutGraph, result: LayoutResult, writePlan: WritePlan, counts: PlanCounts } | null}
 *   null when there is nothing to place (the reason on the console)
 */
function plan(preset, snapshot, actionId, runtime, timer = { lap() {} }) {
  const composed = Pipeline.buildObjectSet(snapshot, preset, actionId);
  const objectSet = composed.objectSet;
  timer.lap("object set");

  // Assign each relation a role: nesting (drawn as containment) vs routed (drawn as line).
  const split       = Nesting.splitNestingRels(objectSet.relations, preset.params);
  const nestingRels = split.nestingRels;
  const routedRels  = split.connectionRels;

  // Build LayoutGraph (uniform — no action branch). Pairing with the visuals on the view is
  // part of the nesting resolution, so every visual gets a node.
  Log.debug("\nLayout graph:");
  const isModify = actionId === ACTION.LAYOUT_ONLY.id || actionId === ACTION.EXPAND_VIEW.id;
  const labels = { measure: runtime.measureText, breaks: runtime.lineBreaks, defaultFont: runtime.defaultFont, newVisual: runtime.newVisual,
                   relationsOf: snapshot.relationsOf, isModify };
  const graph = LayoutGraph.buildLayoutGraph(preset, objectSet.elements, routedRels, nestingRels, objectSet.diagramObjects,
                                  objectSet.visuals, objectSet.visualRelations, objectSet.diagramConnections, objectSet, labels);
  if (objectSet.arrangements) {
    // Leaves in place: every arrangement of the background view; else only those of containers that hold a container.
    graph.arrangements = preset.params.backgroundLeavesInPlace ? objectSet.arrangements : Arrangement.arrangementsWithContainers(objectSet.arrangements);
    _checkArrangements(graph, objectSet.arrangements, graph.arrangements);
  }
  timer.lap("layout graph");
  if (graph.nodes.length === 0) {
    if (isModify) Log.warn("Nothing to place: the view holds no elements or diagram objects.", { effect: "the view is not changed." });
    else if (snapshot.elements.length === 0) Log.warn("Nothing to place: nothing is selected.", {
      action: "select elements, or a view, in the model tree or on a view." });
    else Log.warn(`Nothing to place: no selected element passes the element filter (${snapshot.elements.length} selected, 0 kept), so the steps add none.`, {
      action: "change the element filter, or select other elements." });
    return null;
  }
  _logRelationRoles(graph, nestingRels, routedRels);
  const sample = runtime.measureText("Archi", null);
  Log.debug(`  Label text in Archi's default view font: "Archi" ${sample.width} px wide, a line ${sample.height} px, font size ${Math.round(sample.em)} px`);

  Log.debug("\nLayout:");
  const engine = ALGORITHMS[preset.algorithm].engine;
  const laid = _layoutFittingLabels(graph, g => NodeLayout.layout(g, engine, runtime));
  timer.lap("layout");
  const size = _logLayoutResult(laid.result);

  const writePlan = WritePlan.planWrite(preset, objectSet, laid.graph, laid.result);
  timer.lap("write plan");
  /** @type {PlanCounts} */
  const counts = {
    selected: snapshot.elements.length,
    base:  { elements: composed.filteredCounts.elems, relations: composed.filteredBaseRels },
    steps: { elements: composed.stepCounts.reduce((a, c) => a + c.elems, 0), relations: composed.stepCounts.reduce((a, c) => a + c.rels, 0) },
    view:  composed.view,
    size,
  };
  return { objectSet, graph: laid.graph, result: laid.result, writePlan, counts };
}

/**
 * Where the model and the background view differ, on the console: a child of a container whose
 * places are kept that is not on the background view in it comes last; one the background view has
 * under another parent goes where the model puts it. The arrangements in the log file.
 * @param {LayoutGraph}  graph
 * @param {Arrangements} arrangements  every arrangement of the background view
 * @param {Arrangements} kept          those whose places the layout keeps
 */
function _checkArrangements(graph, arrangements, kept) {
  const element = (/** @type {string} */ nodeId) => nodeId.replace(/_occ_\d+$/, "");
  const label = new Map(graph.nodes.map(n => [element(n.id), n.label || n.id]));
  /** @type {Map<string, string>} */
  const backgroundParent = new Map();
  for (const [key, arrangement] of Object.entries(arrangements)) {
    for (const id of Arrangement.idsOf(arrangement)) backgroundParent.set(id, key);
    Log.debug(`  Arrangement of ${key === Arrangement.ROOT ? "the view" : `"${label.get(key) || key}"`} on the background view${kept[key] ? "" : " (not kept: placed by the layout)"}: ` +
      Arrangement.describe(arrangement, id => label.get(id) || `(${id}, not on this view)`));
  }
  const name = (/** @type {string} */ id) => id === Arrangement.ROOT ? "the view" : `"${label.get(id) || id}"`;
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const moved = [];
  for (const node of graph.nodes) {
    const id = element(node.id);
    const parent = node.parent ? element(node.parent) : Arrangement.ROOT;
    if (!arrangements[parent]) continue;
    const there = backgroundParent.get(id);
    if (there === parent) continue;
    if (there === undefined) { if (kept[parent]) missing.push(`${name(id)} in ${name(parent)}`); }
    else moved.push(`${name(id)}: in the model under ${name(parent)}, on the background view under ${name(there)}`);
  }
  const list = (/** @type {string[]} */ l) => l.slice(0, 5).join("; ") + (l.length > 5 ? "; …" : "");
  if (missing.length) Log.warn(`Not on the background view: ${list(missing)}.`, {
    effect: "placed after the arranged boxes of their container.", action: "add them to the background view where they belong." });
  if (moved.length) Log.warn(`The background view differs from the model: ${list(moved)}.`, {
    effect: "placed where the model puts them.", action: "move them on the background view." });
  if (missing.length + moved.length > 5) Log.detail("WARN", [...missing, ...moved].join("\n"));
}

// Layouts per run at most to fit the container labels (_layoutFittingLabels).
const LABEL_FIT_RUNS = 6;
/** @typedef {{ height: number, width: number, drawn: number }} LabelNeed  a container label's room and the container's width at the width it was drawn */
/** @typedef {{ graph: LayoutGraph, result: LayoutResult }} LabelAttempt */

/**
 * Lay out until every container's label has its room at the width the layout drew the container.
 * The layout graph reserves a label at the narrowest the container can be; drawn wider, the label can
 * need fewer lines, drawn narrower (another shape) more, and a container whose label's first line runs
 * under the type icon must be wider. Each next layout reserves at least what any layout so far needed
 * (room and width only grow, so a fitting layout comes); from a fitting one, a trim layout reserves
 * the room the labels need at the drawn widths, the containers no narrower than drawn. Kept: the
 * first layout in which every label has exactly its room, else the fitting one with the least room to
 * spare, else the first. At most LABEL_FIT_RUNS layouts.
 * @param {LayoutGraph} graph
 * @param {(graph: LayoutGraph) => LayoutResult} run  one engine call
 * @returns {LabelAttempt}
 */
function _layoutFittingLabels(graph, run) {
  const containerIds = [...new Set(Object.values(graph._parentMap))];
  // A box of an arrangement is drawn as wide as its band (Tiles fillBands), and with Columns across
  // containers every container as wide as its columns: that width is no minimum of its own, else the
  // next layout keeps it, Columns across containers widens a column for it, and that column widens
  // every container in it (GEMMA domeinen: application services 3150 px wide).
  const arrangements = graph.arrangements || {};
  const element = (/** @type {string} */ id) => id.replace(/_occ_\d+$/, "");
  const banded = new Set(graph.columnsAcrossContainers ? containerIds : containerIds.filter(id => arrangements[graph._parentMap[id] ? element(graph._parentMap[id]) : ""]));
  // Casts below: the maps hold every container id, and every container is placed.
  /** @type {(r: LayoutResult) => Map<string, LabelNeed>} */
  const needed = r => {
    const drawnOf = new Map(r.nodes.map(n => [n.id, n.width]));
    return new Map(containerIds.map(id => {
      const drawn = /** @type {number} */ (drawnOf.get(id));
      const width = graph._widthAt(id, drawn);
      return [id, { height: graph._labelHeightAt(id, width), width, drawn }];
    }));
  };
  /** @type {(g: LayoutGraph, need: Map<string, LabelNeed>, room: (n: LayoutNode, nd: LabelNeed) => { labelHeight: number, minWidth: number }) => LayoutGraph} */
  const reserve = (g, need, room) => ({ ...g, nodes: g.nodes.map(n => { const nd = need.get(n.id); return nd ? { ...n, ...room(n, nd) } : n; }) });
  /** @type {(need: Map<string, LabelNeed>, g: LayoutGraph) => number} room to spare; -1 = a label does not fit */
  const spare = (need, g) => {
    let sum = 0;
    for (const n of g.nodes) {
      const nd = need.get(n.id);
      if (!nd) continue;
      if (nd.width > nd.drawn || nd.height > n.labelHeight) return -1;
      sum += n.labelHeight - nd.height;
    }
    return sum;
  };

  /** @type {LabelAttempt} */
  let attempt = { graph, result: run(graph) };
  const first = attempt;
  let need = needed(attempt.result);
  let left = spare(need, graph);
  if (left === 0) return first;
  Log.debug(`  Container labels: ${containerIds.filter(id => /** @type {LabelNeed} */ (need.get(id)).height !== graph.nodes.find(n => n.id === id)?.labelHeight).length} of ${containerIds.length} need other room at the width they were drawn — laid out again`);
  /** @type {{ attempt: LabelAttempt, left: number } | null} */
  let best = null;
  for (let k = 2; k <= LABEL_FIT_RUNS; k++) {
    if (left > 0 && (!best || left < best.left)) best = { attempt, left };
    const g = left >= 0
      // Trim: the room needed at the drawn width, never narrower than drawn.
      ? reserve(attempt.graph, need, (n, nd) => ({ labelHeight: nd.height, minWidth: banded.has(n.id) ? n.minWidth : Math.max(n.minWidth, nd.drawn) }))
      // Grow: at least what this layout needed, a container wider where its label asks.
      : reserve(attempt.graph, need, (n, nd) => ({ labelHeight: Math.max(n.labelHeight, nd.height), minWidth: Math.max(n.minWidth, nd.width > nd.drawn ? nd.width : 0) }));
    attempt = { graph: g, result: run(g) };
    need = needed(attempt.result);
    left = spare(need, g);
    if (left === 0) return attempt;
    if (left > 0 && best && left >= best.left) break;   // trimming no longer helps
  }
  if (left > 0 && (!best || left < best.left)) best = { attempt, left };
  if (best) return best.attempt;
  Log.warn("Not every container label fits in the layout: the first layout is kept.", {
    effect: "a container label can be cut off or have room to spare." });
  return first;
}

/**
 * Relation role split. Nesting relations that could not be applied as containment (multi-parent
 * conflict) are reclassified as connections in buildLayoutGraph, so routedRels.length here
 * reflects the final drawn-connection count.
 * @param {LayoutGraph}     graph
 * @param {ArchiRelation[]} nestingRels
 * @param {ArchiRelation[]} routedRels
 */
function _logRelationRoles(graph, nestingRels, routedRels) {
  const ns = graph._nestingStats;
  Log.debug(`  Relation roles: ${nestingRels.length} nestings · ${routedRels.length} connections`);
  if (ns.candidates > 0) {
    const notes = [];
    if (ns.notNestedNestings > 0) notes.push(`${ns.notNestedNestings} drawn as connection`);
    if (ns.circularNestings  > 0) notes.push(`${ns.circularNestings} circular`);
    const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
    Log.debug(`  Nestings applied: ${ns.applied}/${ns.candidates}${suffix}`);
  }
}

/**
 * @param {LayoutResult} result
 * @returns {{ width: number, height: number }} the view size generated, px
 */
function _logLayoutResult(result) {
  Log.debug(`  Layout result: ${result.nodes.length} elements · ${result.edges.length} connections`);
  if (result.nodes.length === 0) return { width: 0, height: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of result.nodes) {
    if (n.x           < x0) x0 = n.x;
    if (n.y           < y0) y0 = n.y;
    if (n.x + n.width > x1) x1 = n.x + n.width;
    if (n.y + n.height> y1) y1 = n.y + n.height;
  }
  const size = { width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
  Log.debug(`  View size generated: ${size.width} × ${size.height} px`);
  return size;
}

// Phase durations of one view generation, logged as one summary line — shows where the time goes.
function _phaseTimer() {
  /** @type {string[]} */
  const laps = [];
  const t0 = Date.now();
  let t = t0;
  return {
    lap(/** @type {string} */ name) { const now = Date.now(); laps.push(`${name} ${_fmtMs(now - t)}`); t = now; },
    summary() { return `${laps.join(" · ")}  (total ${_fmtMs(t - t0)})`; },
    total() { return t - t0; },
  };
}

/** @param {number} ms */
function _fmtMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// ── One view per element ──────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {LayoutRuntime}                runtime
 * @param {GenerateOptions}              options
 * @returns {ArchimateView[]}
 */
function _generateOneEach(preset, uiSelection, runtime, options) {
  // Seeds = model elements from the Archi selection that pass the preset's filter, before expansion:
  // an element the filter drops would give no view. Each seed gets its own full pipeline run.
  const seeds = Pipeline.applyFilter(SelectionRead.getSeedElements(uiSelection), preset.filter);
  if (seeds.length === 0) {
    Log.warn("No element of the selection passes the element filter, so One view each makes no view.", {
      action: "select elements, or change the element filter." });
    return [];
  }

  const types = new Set(seeds.map(e => e.type));
  if (types.size > 1) {
    Log.warn(`The selection holds ${types.size} element types for One view each (${[...types].sort().join(", ")}).`, {
      effect: "the views of the different types are built differently.",
      action: "select elements of one type, or filter the preset on one type." });
  }

  const siblings = options.siblings;
  const mirror = preset.view.mirrored;
  const start = options.origin && !options.origin.script ? ViewOrigin.describeStart(uiSelection) : [];

  /** @type {ArchimateView[]} */
  const views = [];
  for (const element of seeds) {
    Log.debug(`\nGenerating view for: ${element.name}`);
    /** @type {ViewTarget} */
    const target = { name: element.name + preset.view.suffix, view: siblings && siblings.views.get(String(element.id)) };
    if (mirror) target.folder = () => _mirroredFolder(element, preset.view.underGenerated);
    if (options.origin) target.origin = options.origin.script ? options.origin : {
      ...options.origin, action: ACTION.ONE_EACH.id, selection: start, element: ViewOrigin.describeObject(element),
      ...(!mirror ? { folder: Defs.viewFolderPath(preset.view) } : preset.view.underGenerated ? { underGenerated: true } : {}),
    };
    const view = _generateView(preset, $(element), ACTION.NEW_VIEW.id, target, runtime, target.name || element.name);
    if (view) views.push(view);
  }
  return views;
}

/**
 * The folder under Views, or under /Views/_Generated, that mirrors the element's place in the model
 * tree, the layer included, created when missing. Name by name: a folder name may hold a "/".
 * @param {ArchiElement} element
 * @param {boolean}      underGenerated
 * @returns {Folder}
 */
function _mirroredFolder(element, underGenerated) {
  /** @type {string[]} */
  const names = [];
  for (let f = $(element).parent("folder").first(); f; f = $(f).parent("folder").first()) names.unshift(f.name);
  let folder = _resolveFolder({ folder: "", underGenerated });
  for (const name of names) {
    folder = $(folder).children("folder").filter(f => f.name === name).first() || folder.createFolder(name);
  }
  return folder;
}

// ── View target ───────────────────────────────────────────────────────────────

/**
 * The target of a New view run. Expand view and Layout only have their view, and leave the origin.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string}                       action
 * @param {GenerateOptions}              options
 * @returns {ViewTarget}
 */
function _singleTarget(uiSelection, action, options) {
  if (options.regenerate) return options.regenerate;
  if (action !== ACTION.NEW_VIEW.id || !options.origin) return {};
  return { origin: options.origin.script ? options.origin : { ...options.origin, action, selection: ViewOrigin.describeStart(uiSelection) } };
}

/**
 * @param {MaskedPreset}   preset
 * @param {ArchiElement[]} elements
 * @param {ViewTarget}     target
 * @returns {{ view: ArchimateView, status: string }}  status: New, Updated (regenerated) or Overwritten
 */
function _targetView(preset, elements, target) {
  if (target.view) {
    Log.debug(`  Regenerating view: "${target.view.name}" in ${ArchiFolders.printFolderPath(target.view)}`);
    _emptyView(target.view);
    return { view: target.view, status: "Updated" };
  }
  const folder = target.folder ? target.folder() : _resolveFolder(preset.view);
  return _getOrCreateView(folder, target.name || _resolveViewName(preset, elements));
}

/**
 * A new view gets the origin of its run, or loses one of an earlier run. Expand view changes what
 * a regenerate gives; Layout only does not.
 * @param {ArchimateView} view
 * @param {string}        actionId
 * @param {ViewTarget}    target
 */
function _recordOrigin(view, actionId, target) {
  if (actionId === ACTION.EXPAND_VIEW.id) ViewOrigin.markModified(view);
  else if (actionId === ACTION.NEW_VIEW.id) {
    if (target.origin) ViewOrigin.write(view, target.origin);
    else ViewOrigin.remove(view);
  }
}

/**
 * @param {MaskedPreset}   preset
 * @param {ArchiElement[]} elements
 * @returns {string}
 */
function _resolveViewName(preset, elements) {
  if (preset.view.name) return preset.view.name;
  const first = elements[0];
  return first ? first.name : "Generated";
}

/**
 * The folder for a new view, created when missing. Throws when the model has no "Views" folder
 * (renamed): the run then aborts before anything is written.
 * @param {{ folder: string, underGenerated: boolean }} view  preset view settings
 * @returns {Folder}
 */
function _resolveFolder(view) {
  const views = _viewsFolder();
  const path = Defs.viewFolderPath(view);
  if (path === "/") return views;
  const folder = ArchiFolders.getFolderPath("/Views" + path);   // missing subfolders are created
  if (!folder) throw new Error(`View folder "${path}" not found.`);
  return folder;
}

/**
 * @returns {Folder}
 */
function _viewsFolder() {
  const folder = $("folder.Views").first();
  if (!folder) throw new Error(`The model has no "Views" folder; the new view has nowhere to go. Rename the views folder back to "Views".`);
  return folder;
}

/**
 * @param {ArchimateView} view
 */
function _emptyView(view) {
  $(view).find().each(o => { try { o.delete(); } catch (e) {} });   // silent: Archi already removed it with its parent
}

/**
 * @param {Folder} folder
 * @param {string} viewName
 * @returns {{ view: ArchimateView, status: string }}  status: New or Overwritten
 */
function _getOrCreateView(folder, viewName) {
  let existing = $(folder).children("view").filter(`.${viewName}`).first();
  if (existing) {
    Log.debug(`  Overwriting view: "${viewName}" in ${ArchiFolders.printFolderPath(existing)}`);
    Log.warn("A view of this name was there already and is overwritten; its properties are kept.", {
      effect: "what was on it is replaced (Undo restores it)." });
    _emptyView(existing);
    return { view: existing, status: "Overwritten" };
  }
  const v = model.createArchimateView(viewName);
  folder.add(v);
  Log.debug(`  Created view: "${viewName}" in ${ArchiFolders.printFolderPath(v)}`);
  return { view: v, status: "New" };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generate_view, plan, checkEngineParams };   // plan, checkEngineParams: Node harness
}
