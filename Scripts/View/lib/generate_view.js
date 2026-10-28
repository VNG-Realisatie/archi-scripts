/**
 * View generation API.
 *
 * Orchestrator. Read the selection once (Snapshot) → plan (pure: object set, layout graph, one
 * layout engine call, write plan) → apply the write plan to the target view → styling.
 *
 * The writer's rule (SPEC §5): per result object,
 *   exists on target view? → reposition (appearance preserved; parenthood re-derived from the nesting)
 *   else                  → create (default appearance)
 *
 * No per-action branches in the plan or the writer. Action only determines (a) which objects feed
 * the layout and (b) which view is the target.
 */
console.log("Loading generate_view.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../../_lib/Common")} */
const Common       = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");

/** @type {typeof import("./defs")} */
const Defs       = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_pipeline")} */
const Pipeline   = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("./nesting")} */
const Nesting    = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
/** @type {typeof import("./layout_graph")} */
const LayoutGraph = require(REPO_ROOT + "View/lib/layout_graph");
/** @type {typeof import("./process_runner")} */
const ProcessRun = require(REPO_ROOT + "View/lib/process_runner");
/** @type {typeof import("./write_plan")} */
const WritePlan  = require(REPO_ROOT + "View/lib/write_plan");
/** @type {typeof import("./view_writer")} */
const ViewWriter = require(REPO_ROOT + "View/lib/view_writer");
/** @type {typeof import("./appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");
/** @type {typeof import("./engines/engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");

const {
  ACTION, ALGORITHMS, GENERATED_VIEW_FOLDER, PROP_ID,
  validatePreset, effectiveParams, connectionsModeLock,
} = Defs;

// ── Engine loaders (lazy) ─────────────────────────────────────────────────────
// require() is memoised by jvm-npm (Require.cache), so repeated calls return the same module.

/**
 * @param {string} engine
 * @returns {LayoutAdapter}
 */
function _getAdapter(engine) {
  if (engine === "ELK")      return require(REPO_ROOT + "View/lib/engines/elk");
  if (engine === "Dagre")    return require(REPO_ROOT + "View/lib/engines/dagre");
  if (engine === "Graphviz") return require(REPO_ROOT + "View/lib/engines/graphviz");
  throw `Unknown engine: "${engine}"`;
}

// ── Settings outside the dialog ───────────────────────────────────────────────

/**
 * Console lines for the preset's engineParams: every key that applies, and a ⚠ line per key that is
 * not used, equals its default or overrides a dialog option. Checked: the label sizing and the run's
 * engine; another engine's section is checked by a run with that engine.
 * @param {MaskedPreset} preset
 * @returns {string[]}  empty when the preset sets nothing outside the dialog
 */
function checkEngineParams(preset) {
  const engine = ALGORITHMS[preset.algorithm].engine;
  const sections = new Set([...Object.values(ALGORITHMS).map(a => a.engine), "layout"]);
  const lines = Object.keys(preset.engineParams)
    .filter(section => !sections.has(section))
    .map(section => `  ⚠ ${section}: ${EngineUtils.SETTING_UNKNOWN}`);
  /** @type {[string, SettingFinding[]][]} */
  const checked = [
    ["layout", EngineUtils.checkLabelSizing(preset.engineParams.layout)],
    [engine,   _getAdapter(engine).checkEngineParams(preset)],
  ];
  for (const [section, findings] of checked) for (const f of findings) {
    const setting = `${section} "${f.key}" = ${f.value}`;
    lines.push(f.problem ? `  ⚠ ${setting}: ${f.problem}`
      : `  ${setting}${f.without !== undefined ? ` (default ${f.without})` : ""}`);
  }
  return lines.length ? ["Settings outside the dialog (engineParams):", ...lines] : [];
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate, expand, or re-layout one or more Archi views.
 *
 * @param {PresetFile}      rawPreset   raw preset object (will be validated)
 * @param {ArchiCollection<ArchiObject>} uiSelection $(selection) from Archi UI
 * @param {string}          [actionId]  ACTION.*.id (runtime — not stored in preset files); default NEW_VIEW
 * @returns {ArchimateView[]}
 */
function generate_view(rawPreset, uiSelection, actionId) {
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
  if (_dropped.length) console.log(`Algorithm "${preset.algorithm}" ignores inactive params: ${_dropped.join(", ")}`);
  if (_rawParams.connectionsMode !== preset.params.connectionsMode && preset.params.connectionsMode !== undefined)
    console.log(`Connections: "${preset.params.connectionsMode}" (Crossing containers not possible with ${connectionsModeLock(preset.algorithm, _rawParams)})`);

  console.log(`\n=== generate_view ===`);
  console.log(`Action: ${action}`);
  console.log(`Algorithm: ${preset.algorithm}`);
  {
    const p = preset.params;
    const parts = [
      p.direction        && `dir=${p.direction}`,
      p.routing          && `routing=${p.routing}`,
      p.labelPosition    && `label=${p.labelPosition}`,
      `spacing=el:${p.elementSpacing ?? "—"} layer:${p.layerSpacing ?? "—"}`,
      `size=${p.elementWidth ?? "—"}×${p.elementHeight ?? "—"}`,
      (p.nestingConditions && p.nestingConditions.length) && `nesting=${p.nestingConditions.length}conditions containerAlgo=${p.containerAlgorithm || "(same)"}  connMode=${p.connectionsMode || "Between containers"}`,
    ].filter(Boolean);
    console.log(`Params: ${parts.join("  ")}`);
  }
  {
    // Params without a dialog control (defs.HIDDEN_PARAMS): show a preset value that differs
    // from the default, so it does not act unseen.
    // Casts: k is a params key.
    const shown    = /** @type {Record<string, unknown>} */ (preset.params);
    const defaults = /** @type {Record<string, unknown>} */ (Defs.DEFAULT_PRESET.params);
    const hidden = Defs.HIDDEN_PARAMS
      .filter(k => k in preset.params && shown[k] !== defaults[k])
      .map(k => `${k}=${shown[k]}`);
    if (hidden.length) console.log(`Preset values not in dialog: ${hidden.join("  ")}`);
  }
  for (const line of checkEngineParams(preset)) console.log(line);
  console.log(`Name: "${preset.view.name}"  Folder: "${preset.view.folder}"`);
  {
    const vsMode = _rawParams.viewSizeMode || "none";
    const vsVal  = vsMode === "maxWidth"    ? `maxWidth=${_rawParams.maxWidth}`
                 : vsMode === "aspectRatio" ? `aspectRatio=${_rawParams.aspectRatio}`
                 : "none";
    console.log(`View size requested: ${vsVal}`);
  }

  /** @type {ArchimateView[]} */
  const views = [];
  try {
    if (action === ACTION.ONE_EACH.id) {
      views.push(..._generateOneEach(preset, uiSelection));
    } else {
      const view = _generateSingle(preset, uiSelection, action, null);
      if (view) views.push(view);
    }
  } catch (error) {
    console.error(`generate_view error: ${typeof /** @type {Error} */ (error).stack === "undefined" ? error : /** @type {Error} */ (error).stack}`);
  }
  console.log(`\ngenerate_view: ${Common.endCounter("generate_view")}`);

  // Open the generated view(s) in Archi's UI.
  //   NEW_VIEW / EXPAND_VIEW / LAYOUT_ONLY → exactly one view in `views`; open it.
  //   ONE_EACH                              → potentially many views; open only the first
  //                                           so the user isn't flooded with N tabs.
  if (views.length > 0) _openView(views[0]);
  return views;
}

/**
 * Open a view in Archi's editor tab, as the focused tab.
 * @param {ArchimateView} view
 */
function _openView(view) {
  try {
    view.openInUI();
  } catch (e) {
    console.error(`Failed to open "${view && view.name}" in the UI — open it manually. (${e})`);
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

  /** @type {string[]} */
  const lines = [];
  (vp.properties || []).forEach(p => {
    // docs/reference/gui.md (Properties tab): disabled rows are ignored. An enabled row without a value clears the key.
    if (!p.key || p.key === PROP_ID || !p.enabled) return;
    if (p.value) {
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
  if (lines.length) console.log("\nProperties:\n" + lines.join("\n"));   // no heading when nothing changed
}

// ── Single view ───────────────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string}                       actionId
 * @param {string | null}                viewNameOverride
 * @returns {ArchimateView | null}
 */
function _generateSingle(preset, uiSelection, actionId, viewNameOverride) {
  const timer = _phaseTimer();
  const snapshot = SelectionRead.readSelection(uiSelection, actionId);
  timer.lap("selection");
  if (!snapshot) return null;   // the reason is on the console

  // Determine the target view.
  //   EXPAND_VIEW / LAYOUT_ONLY → the selected existing view, changed in place
  //                               (preset view name and folder apply to new views only).
  //   NEW_VIEW                  → a new view (created or overwritten by name) — only after the
  //                               layout succeeded, so a failed run leaves an existing view as it was.
  const inPlace = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  // Cast: the selected view of a Modify action is an ArchiMate view.
  const existingView = /** @type {ArchimateView | null} */ (snapshot.existing.existingView);
  if (inPlace) {
    console.log("\nView target:");
    if (!existingView) {
      console.error(`${actionId}: no existing view in selection`);
      return null;
    }
    console.log(`  Using: "${existingView.name}" (in place)`);
  }

  const planned = plan(preset, snapshot, actionId, ProcessRun.runProcess, timer);
  if (!planned) return null;

  let view = existingView;
  if (!view) {   // a Create action (a Modify action without its view returned above)
    console.log("\nView target:");
    const viewName = viewNameOverride || _resolveViewName(preset, planned.objectSet.elements);
    view = _getOrCreateView(_resolveFolder(preset.view.folder), viewName);
  }

  console.log("\nWrite:");
  const written = ViewWriter.applyWritePlan(view, planned.writePlan);
  timer.lap("write");

  // Appearance pass — post-write styling (colours, fonts). No-op when all features disabled.
  // Visuals inside a diagram-block keep their appearance: on a Create action, their copies.
  /** @type {Map<string, string>} */
  const keep = new Map();
  for (const [id, block] of planned.objectSet.diagramBlockOf || new Map()) {
    const copy = written.get(id);
    keep.set(copy ? String(copy.id) : id, block);
  }
  Appearance.applyAppearance(view, preset, actionId, keep);
  _applyViewProperties(view, preset);
  timer.lap("appearance");

  console.log(`\nTiming: ${timer.summary()}`);
  return view;
}

/**
 * The pure part of one view generation: object set, relation roles, layout graph, layout engine,
 * write plan. Archi runs it on the Snapshot readSelection read; the Node harness on one read from a
 * model file. The target view's contents come from the Snapshot (none for a Create action).
 * @param {MaskedPreset} preset    validated, params masked to the algorithm (effectiveParams)
 * @param {Snapshot}     snapshot
 * @param {string}       actionId  ACTION.*.id
 * @param {ProcessRunner} runProcess  starts the Graphviz binary: Java in Archi, child_process in Node
 * @param {{ lap(name: string): void }} [timer]  phase timing
 * @returns {{ objectSet: ObjectSet, graph: LayoutGraph, result: LayoutResult, writePlan: WritePlan } | null}
 *   null when there is nothing to place
 */
function plan(preset, snapshot, actionId, runProcess, timer = { lap() {} }) {
  const objectSet = Pipeline.buildObjectSet(snapshot, preset, actionId);
  timer.lap("object set");

  // Assign each relation a role: nesting (drawn as containment) vs routed (drawn as line).
  const split       = Nesting.splitNestingRels(objectSet.relations, preset.params);
  const nestingRels = split.nestingRels;
  const routedRels  = split.connectionRels;

  // Build LayoutGraph (uniform — no action branch). Pairing with the visuals on the view is
  // part of the nesting resolution, so every visual gets a node.
  console.log("\nLayout graph:");
  const graph = LayoutGraph.buildLayoutGraph(preset, objectSet.elements, routedRels, nestingRels, objectSet.diagramObjects,
                                  objectSet.visuals, objectSet.visualRelations, objectSet.diagramConnections, objectSet);
  timer.lap("layout graph");
  if (graph.nodes.length === 0) {
    console.log("  No elements to place — view not generated.");
    return null;
  }
  _logRelationRoles(graph, nestingRels, routedRels);

  console.log("\nLayout:");
  const result = _getAdapter(ALGORITHMS[preset.algorithm].engine).layout(graph, runProcess);
  timer.lap("layout");
  _logLayoutResult(result);

  const writePlan = WritePlan.planWrite(preset, objectSet, graph, result);
  timer.lap("write plan");
  return { objectSet, graph, result, writePlan };
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
  console.log(`  Relation roles: ${nestingRels.length} nestings · ${routedRels.length} connections`);
  if (ns.candidates > 0) {
    const notes = [];
    if (ns.notNestedNestings > 0) notes.push(`${ns.notNestedNestings} drawn as connection`);
    if (ns.circularNestings  > 0) notes.push(`${ns.circularNestings} circular`);
    const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
    console.log(`  Nestings applied: ${ns.applied}/${ns.candidates}${suffix}`);
  }
}

/** @param {LayoutResult} result */
function _logLayoutResult(result) {
  console.log(`  Layout result: ${result.nodes.length} elements · ${result.edges.length} connections`);
  if (result.nodes.length === 0) return;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of result.nodes) {
    if (n.x           < x0) x0 = n.x;
    if (n.y           < y0) y0 = n.y;
    if (n.x + n.width > x1) x1 = n.x + n.width;
    if (n.y + n.height> y1) y1 = n.y + n.height;
  }
  console.log(`  View size generated: ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} px`);
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
 * @returns {ArchimateView[]}
 */
function _generateOneEach(preset, uiSelection) {
  // Seeds = raw model elements from the Archi selection, before preset filter and expansion.
  // Each seed gets its own full pipeline run (filter + expansion + layout + write).
  const seeds = SelectionRead.getSeedElements(uiSelection);
  if (seeds.length === 0) { console.log("No elements selected."); return []; }
  if (seeds.length > 20) {
    const cont = window.confirm(`This will generate ${seeds.length} views. Continue?`);
    if (!cont) return [];
  }

  const types = new Set(seeds.map(e => e.type));
  if (types.size > 1) {
    console.log(`Warning: ${types.size} element types selected for One view each. Consider filtering to one type.`);
  }

  /** @type {ArchimateView[]} */
  const views = [];
  for (const element of seeds) {
    console.log(`\nGenerating view for: ${element.name}`);
    const view = _generateSingle(preset, $(element), ACTION.NEW_VIEW.id, element.name + preset.view.suffix);
    if (view) views.push(view);
  }
  return views;
}

// ── View target ───────────────────────────────────────────────────────────────

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
 * @param {string} viewFolder
 * @returns {Folder}
 */
function _resolveFolder(viewFolder) {
  if (!$("folder.Views").first()) throw `The model has no "Views" folder; the new view has nowhere to go. Rename the views folder back to "Views".`;
  // viewFolder is a path under /Views ("/_Generated/Test"); "" = GENERATED_VIEW_FOLDER.
  const path = "/Views" + (viewFolder || GENERATED_VIEW_FOLDER);
  const folder = ArchiFolders.getFolderPath(path);   // missing subfolders are created
  if (!folder) throw `View folder "${path}" not found.`;
  return folder;
}

/**
 * @param {Folder} folder
 * @param {string} viewName
 * @returns {ArchimateView}
 */
function _getOrCreateView(folder, viewName) {
  let existing = $(folder).children("view").filter(`.${viewName}`).first();
  if (existing) {
    console.log(`  Overwriting view: "${viewName}"`);
    try { $(existing).find().each(o => o.delete()); } catch (e) { console.error(`Failed to clear view "${viewName}" before overwrite: ${e}`); }
    return existing;
  }
  const v = model.createArchimateView(viewName);
  folder.add(v);
  console.log(`  Created view: "${viewName}"`);
  return v;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generate_view, plan, checkEngineParams };   // plan, checkEngineParams: Node harness
}
