/**
 * Run a preset from a shortcut script whose filename names it:
 *
 *   <preset>_<action>_<direction>.ajs     e.g. TAenIA_layout_right.ajs, in shortcuts/ or a sub-folder
 *
 *   preset     preset name under presets/ (opts.folder is put in front: "GEMMA/TAenIA")
 *   action     new_view | one_view_each | expand_view | layout
 *   direction  right | left | down | up — overrides the preset's direction (optional)
 *
 * A shortcut script is then three lines:
 *   const RunPreset = require(REPO_ROOT + "View/lib/run_preset");
 *   RunPreset.fromFilename(__FILE__, $(selection), { folder: "GEMMA" });
 *
 * The View/_default_*.ajs scripts run the preset Default instead (fromDefault), with fixed overrides:
 *   RunPreset.fromDefault($(selection), ACTION.LAYOUT_ONLY.id, { direction: "Down" });
 * or the dialog's last settings with one change, kept in the session (fromSession):
 *   RunPreset.fromSession($(selection), ACTION.LAYOUT_ONLY.id, s => { s.params.direction = "Down"; });
 * or those settings with Cycle selection order on (fromSessionCycling):
 *   RunPreset.fromSessionCycling($(selection), ACTION.LAYOUT_ONLY.id);
 * Regenerate runs what a view remembers instead (fromView, fromViewSiblings):
 *   RunPreset.fromView($(selection));
 * A recipe as the start sets the action, the start, and each view's view template and Object ID (fromRecipe).
 */

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading run_preset.js");
/** @type {typeof import("./preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("./generate_view")} */
const GenView  = require(REPO_ROOT + "View/lib/generate_view");
/** @type {typeof import("./defs")} */
const Defs     = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
/** @type {typeof import("./selection_pipeline")} */
const Pipeline = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("./generation_record")} */
const GenerationRecord = require(REPO_ROOT + "View/lib/generation_record");
/** @type {typeof import("./view_recipe_read")} */
const ViewRecipeRead = require(REPO_ROOT + "View/lib/view_recipe_read");
/** @type {typeof import("../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");
const { ACTION } = Defs;


/** @type {Readonly<Record<string, string>>} */
const FILENAME_ACTIONS = Object.freeze({
  new_view:      ACTION.NEW_VIEW.id,
  one_view_each: ACTION.ONE_EACH.id,
  expand_view:   ACTION.EXPAND_VIEW.id,
  layout:        ACTION.LAYOUT_ONLY.id,
});
/** @type {Readonly<Record<string, string>>} */
const FILENAME_DIRECTIONS = Object.freeze({ right: "Right", left: "Left", down: "Down", up: "Up" });
// An action holds a "_" itself, so the name is matched on the known words, not split. " copy" after the name is allowed.
const FILENAME_PATTERN = new RegExp(`^(.+?)_(${Object.keys(FILENAME_ACTIONS).join("|")})(?:_(${Object.keys(FILENAME_DIRECTIONS).join("|")}))?(?: .*)?$`);

/**
 * Split "<preset>_<action>_<direction>[ anything].ajs" into its parts.
 * @param {string} file  script path (__FILE__)
 * @returns {{ preset: string, actionId: string, direction: string|null }}
 */
function parseFilename(file) {
  const base = String(file).replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  const match = base.match(FILENAME_PATTERN);
  if (!match)
    throw new Error(`Script name "${base}" must be <preset>_<${Object.keys(FILENAME_ACTIONS).join("|")}>_<${Object.keys(FILENAME_DIRECTIONS).join("|")}>`);
  const [, preset, action, direction] = match;
  return { preset, actionId: FILENAME_ACTIONS[action], direction: FILENAME_DIRECTIONS[direction] || null };
}

/**
 * Read the preset the script's filename names and run its action on the selection.
 * @param {string}                       file       script path (__FILE__)
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @param {{ folder?: string, preset?: string, edit?: (preset: Preset) => void }} [opts]
 *   folder: preset folder; preset: preset name instead of the filename's; edit: adjust it before running
 * @returns {ArchimateView[]} generated / changed views
 */
function fromFilename(file, selection, opts = {}) {
  return _reported(() => {
    const parsed = parseFilename(file);
    const name   = opts.preset || (opts.folder ? `${opts.folder}/${parsed.preset}` : parsed.preset);
    const preset = PresetIO.readPreset(name);
    /** @type {RunRecord} */
    const record = { preset: name };
    if (parsed.direction && parsed.direction !== preset.params.direction) {
      Log.debug(`Direction ${parsed.direction} from the script name overrules ${preset.params.direction} of the preset.`);
      record.direction = parsed.direction;
    }
    if (parsed.direction) preset.params.direction = parsed.direction;
    if (opts.edit) { opts.edit(preset); record.modified = true; }
    Log.debug(`Preset "${name}"  action ${parsed.actionId}${parsed.direction ? `  direction ${parsed.direction}` : ""}`);
    return _run(preset, selection, parsed.actionId, record);
  });
}

/**
 * Run the preset Default on the selection, with some params overridden.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @param {string}                       actionId   ACTION.*.id
 * @param {Partial<PresetParams>}        [params]   params that replace the preset's, e.g. { direction: "Down", nestingConditions: [] }
 * @returns {ArchimateView[]} generated / changed views
 */
function fromDefault(selection, actionId, params = {}) {
  return _reported(() => {
    const preset = PresetIO.readPreset(PresetIO.DEFAULT_PRESET_NAME);
    Object.assign(preset.params, params);
    Log.debug(`Preset "${PresetIO.DEFAULT_PRESET_NAME}"  action ${actionId}${Object.keys(params).length ? "  " + JSON.stringify(params) : ""}`);
    return _run(preset, selection, actionId, { preset: PresetIO.DEFAULT_PRESET_NAME, ...(Object.keys(params).length ? { modified: true } : {}) });   // generate_view validates the overrides too
  });
}

/**
 * Run the session (the dialog's last settings) on the selection with Cycle selection order on,
 * whatever the dialog's checkbox says; the session gets the next order, so each run tries another.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @param {string}                       actionId   ACTION.*.id
 * @returns {ArchimateView[]} generated / changed views
 */
function fromSessionCycling(selection, actionId) {
  return _reported(() => {
    const preset = PresetIO.readSession();
    const next   = cycleSelectionOrder(preset.params, actionId);
    const session = JSON.parse(JSON.stringify(preset));
    session.params.selectionOrder = next;
    PresetIO.writeSession(session);
    Log.debug(`Session  action ${actionId}  selection order ${preset.params.selectionOrder} (next: ${next})`);
    return _run(preset, selection, actionId, undefined, "session");
  });
}

/**
 * Run the session with one change, and keep the change in the session: changes stack from run to
 * run, and the dialog shows them.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @param {string}                       actionId   ACTION.*.id
 * @param {(session: DialogConfig) => void} change  changes the session in place
 * @returns {ArchimateView[]} generated / changed views
 */
function fromSession(selection, actionId, change) {
  return _reported(() => {
    const session = PresetIO.readSession();
    change(session);
    PresetIO.writeSession(session);
    Log.debug(`Session  action ${actionId}  direction ${session.params.direction}  nesting conditions ${session.params.nestingConditions.length}`);
    return _run(session, selection, actionId, undefined, "session");
  });
}

/**
 * Regenerate: make the selected views, or the views in a selected folder, again from their generation record.
 * A view stays where it is; a view of One view each regenerates only itself.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @returns {ArchimateView[]} regenerated views
 */
function fromView(selection) {
  return _reported(() => {
    /** @type {ArchimateView[]} */
    const done = [];
    const views = _selectedViews(selection);
    Log.info("");
    Log.info("View generation: Regenerate");
    Log.info(Log.field("Selection:", `${views.length} view${views.length === 1 ? "" : "s"}`, 2));
    const logFile = Log.name();
    if (logFile) Log.info(Log.field("Log file:", logFile, 2));
    Log.info("");
    for (const view of views) {
      Log.beginItem("view", view.name);   // generate_view goes on with it
      const run = _regeneration(view);
      if (!run) { Log.endItem("skipped", `Skipped: "${view.name}"`); continue; }
      done.push(...GenView.generate_view(run.preset, run.start, ACTION.NEW_VIEW.id, { regenerate: { view, generationRecord: run.generationRecord } }));
    }
    Log.debug(`Regenerated ${done.length} of ${views.length} views.`);
    return done;
  });
}

/**
 * Regenerate with siblings: run the start and action of each selected view of One view each again.
 * Its views are updated wherever they are now, a new element gets a view, a view whose element is
 * gone is reported and stays.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @returns {ArchimateView[]} regenerated views
 */
function fromViewSiblings(selection) {
  return _reported(() => {
    /** @type {Map<string, GenerationRecord>} */
    const groups = new Map();
    for (const view of _selectedViews(selection)) {
      const record = GenerationRecord.read(view);
      if (record && record.action === ACTION.ONE_EACH.id) groups.set(GenerationRecord.siblingKey(record), record);
      else _skip(view, "It was not made by One view each, so it has no siblings.", "use Regenerate for this view.");
    }
    return [...groups.entries()].flatMap(([key, record]) => _regenerateSiblings(key, record));
  });
}

/**
 * @param {string}           key     GenerationRecord.siblingKey
 * @param {GenerationRecord} record  of one of the siblings
 * @returns {ArchimateView[]}
 */
function _regenerateSiblings(key, record) {
  const preset = _recordPreset(record, `Siblings of "${record.element && record.element.name}"`);
  if (!preset) return [];
  const { start, missing } = GenerationRecord.resolve(record.selection || []);
  for (const object of missing) Log.warn(`Part of the start is gone from the model: ${object.name}.`, { effect: "the siblings are made from the rest of the start." });
  // The record keeps where the views went: their folder under Views, and whether they mirror the model tree below it.
  preset.view.mirrored = record.mirrored === true;
  preset.view.folder = record.folder === undefined ? preset.view.folder : record.folder;
  _logRegeneration(`siblings of "${record.element && record.element.name}"`, record, record.selection || [],
    `New views: ${record.mirrored ? "in the folder of their element below " : "in "}/Views${preset.view.folder === "/" ? "" : preset.view.folder}`);

  /** @type {Map<string, ArchimateView>} */
  const views = new Map();
  $("view").each(v => {
    const view = /** @type {ArchimateView} */ (v);   // Cast: selected by "view"
    const o = GenerationRecord.read(view);
    if (o && o.element && GenerationRecord.siblingKey(o) === key) views.set(o.element.id, view);
  });
  const seeds = new Set(SelectionRead.getSeedElements(start).map(e => String(e.id)));
  for (const [id, view] of views) if (!seeds.has(id)) Log.warn(`"${view.name}": its element is gone from the start.`, { effect: "the view stays as it is.", action: "delete it when it is no longer needed." });

  if (!confirmViewCount(start, ACTION.ONE_EACH.id, preset.filter)) { cancelled(); return []; }
  return GenView.generate_view(preset, start, ACTION.ONE_EACH.id, {
    generationRecord: { preset: record.preset, ...(record.direction ? { direction: record.direction } : {}) },
    siblings: { views },
  });
}

/**
 * @param {ArchiCollection<ArchiObject>} selection
 * @returns {ArchimateView[]} the views in the selection, folders opened up
 */
function _selectedViews(selection) {
  return /** @type {ArchimateView[]} */ (Selection.getSelectionArray(selection, "view"));   // Cast: selected by "view"
}

/**
 * What it takes to regenerate one view; what is in the way is reported and nothing is written.
 * @param {ArchimateView} view
 * @returns {{ preset: Preset, start: ArchiCollection<ArchiObject>, generationRecord: GenerationRecord } | null}
 */
function _regeneration(view) {
  const record = GenerationRecord.read(view);
  if (!record) { Log.warn("It has no generation record: it was not generated, or before views kept one.", { action: "make it again with New view." }); return null; }
  const preset = _recordPreset(record, `"${view.name}"`);
  if (!preset) return null;
  const objects = record.element ? [record.element] : record.selection || [];
  const { start, missing } = GenerationRecord.resolve(objects);
  if (missing.length) { Log.warn(`Its start is gone from the model: ${missing.map(o => o.name).join(", ")}.`, { action: "make it again with New view from another selection." }); return null; }
  _logRegeneration(`"${view.name}"`, record, objects, `Stays in:  ${ArchiFolders.printFolderPath(view)}`);
  const { modified, ...kept } = record;
  const refreshed = objects.map(o => GenerationRecord.describeObject(/** @type {ArchiObject} */ (GenerationRecord.findObject(o))));   // Cast: resolved above
  return { preset, start, generationRecord: record.element ? { ...kept, element: refreshed[0] } : { ...kept, selection: refreshed } };
}

/**
 * What a regenerate uses and does not use, so the run explains itself on the console.
 * @param {string}           subject
 * @param {GenerationRecord} record
 * @param {RecordedObject[]}   start
 * @param {string}           destination  a line on where the views go
 */
function _logRegeneration(subject, record, start, destination) {
  Log.debug(`\nRegenerate ${subject}`);
  const names = start.map(o => o.name);
  Log.info(Log.field("Preset:", `${record.preset} (saved settings)${record.direction ? `, direction ${record.direction}` : ""}`, 0, Log.DETAIL_COLUMN));
  Log.info(Log.field("Start:", names.length > 3 ? `${names.length} objects: ${names.slice(0, 3).join(", ")}, …` : names.join(", "), 0, Log.DETAIL_COLUMN));
  Log.debug(`  Start:     ${names.join(", ")}`);
  Log.debug(`  ${destination}`);
  Log.debug(`  Not used:  the dialog's settings, Folder, Name`);
  if (record.modified) Log.warn("It was made with unsaved settings, or expanded since.", { effect: "the result can differ from the view as it was." });
}

/**
 * The preset of a generation record, with the direction of the run; a script's view or a missing preset is reported.
 * @param {GenerationRecord} record
 * @param {string}     subject  for the message
 * @returns {Preset | null}
 */
function _recordPreset(record, subject) {
  if (record.script) { Log.warn(`${subject} was made by a script that works on after the run.`, { action: `run ${record.script}.` }); return null; }
  if (!PresetIO.listPresets().includes(String(record.preset))) {
    Log.warn(`${subject}: preset "${record.preset}" is not found.`, { action: "if it was renamed, a new run with the new name repairs the view." });
    return null;
  }
  const preset = PresetIO.readPreset(String(record.preset));
  if (record.direction) preset.params.direction = record.direction;
  return preset;
}

/**
 * Run a preset with a recipe as the start: the recipe's action on its view recipes, each view with
 * its recipe's view template and Object ID. The dialog runs it; the caller reports the outcome.
 * @param {PresetFile}  preset
 * @param {RecipeStart} start
 * @param {RunRecord}   record  what the run leaves on each view
 * @returns {ArchimateView[]}
 */
function fromRecipe(preset, start, record) {
  const selection = ViewRecipeRead.startSelection(start);
  if (!confirmViewCount(selection, start.action, preset.filter)) { cancelled(); return []; }
  /** @type {Map<string, RecipeView>} */
  const recipes = new Map(start.views.map(v => [v.grouping.id, { element: v.grouping.element, viewTemplate: v.viewTemplate }]));
  return GenView.generate_view(preset, selection, start.action, { generationRecord: record, recipes });
}

/**
 * Set the nesting conditions aside in the session, so *flat* loses nothing.
 * @param {DialogConfig} session  changed in place
 */
function parkNesting(session) {
  if (!session.params.nestingConditions.length) return;
  session._parkedNestingConditions = session.params.nestingConditions;
  session.params.nestingConditions = [];
}

/**
 * Bring back the parked nesting conditions; without any, aggregation is drawn as nesting.
 * @param {DialogConfig} session  changed in place
 */
function restoreNesting(session) {
  if (session.params.nestingConditions.length) return;
  // Cast: generate_view fills in the rest of the condition
  session.params.nestingConditions = session._parkedNestingConditions || /** @type {PresetParams["nestingConditions"]} */ ([{ relation: "aggregation-relationship" }]);
  delete session._parkedNestingConditions;
}

/**
 * Ask before *One view each* writes more than ONE_EACH_CONFIRM_ABOVE views (SPEC § 5). The entry
 * point asks, not generate_view, so the API runs without a user (the baseline, a calling script).
 * @param {ArchiCollection<ArchiObject>} selection
 * @param {string} [actionId]  ACTION.*.id; absent = New view (generate_view's default)
 * @param {Preset["filter"]} [filter]  the preset's filter: an element it drops gets no view
 * @returns {boolean} the run may go on
 */
function confirmViewCount(selection, actionId, filter) {
  if (actionId !== ACTION.ONE_EACH.id) return true;
  const count = Pipeline.applyFilter(SelectionRead.getSeedElements(selection), filter).length;
  return count <= Defs.ONE_EACH_CONFIRM_ABOVE || window.confirm(`This will generate ${count} views. Continue?`);
}

/**
 * Run the action after the confirm; a cancelled run writes nothing.
 * @param {PresetFile} preset
 * @param {ArchiCollection<ArchiObject>} selection
 * @param {string} actionId
 * @param {RunRecord} [record]  what the run leaves on a new view
 * @param {string}    [presetName]  for the console and the log file when the run leaves no generation record
 * @returns {ArchimateView[]}
 */
function _run(preset, selection, actionId, record, presetName) {
  if (!confirmViewCount(selection, actionId, preset.filter)) { cancelled(); return []; }
  return GenView.generate_view(preset, selection, actionId, { generationRecord: record, presetName });
}

/**
 * Show why a run failed: the reason on the console and in a message box, the stack in the log file
 * (SPEC § 12). The entry points call it; the code between them throws.
 * @param {unknown} error
 */
function showFailure(error) {
  const e = /** @type {Error} */ (error);   // Cast: an Error, or a Java exception from Archi
  const reason = String(e.message || e).trim();
  Log.error(`Run failed: ${reason}`, { effect: "the run stopped here (Undo restores anything it wrote).",
    action: "see the reason; details in the log file (search for ERROR)." });
  Log.detail("ERROR", String(e.stack || e));
  _messageBox("error", "View run failed", `${reason}${_logFileLine()}`);
}

/**
 * End of a run: the result on the console, and a message box when a view failed or was skipped, or
 * no view was written, so the user does not look for a view that is not there. A cancelled run
 * says so itself and gets no box.
 */
function reportOutcome() {
  if (_cancelled) { _cancelled = false; return; }
  const s = Log.summary();
  const line = `${s.done} generated${s.withWarnings ? ` (${s.withWarnings} with warnings)` : ""} · ${s.skipped} skipped · ${s.failed} failed`;
  Log.info("");
  Log.info(Log.field("Result:", line));
  if (!s.failed && !s.skipped && s.done) return;
  const title = s.failed ? `View run: ${s.failed} failed${s.skipped ? `, ${s.skipped} skipped` : ""}`
    : s.skipped ? `View run: ${s.skipped} skipped` : "View run: no view written";
  const problems = s.problems.slice(0, 10).map(p => `${p.headline}${p.reason ? `\n    ${p.reason}` : ""}`);
  if (s.problems.length > 10) problems.push(`… and ${s.problems.length - 10} more`);
  _messageBox(s.failed ? "error" : "warning", title, [line, ...problems].join("\n\n") + "\n\nSee the console for details." + _logFileLine());
}

/**
 * A run starts from a selection in a model: without a selected model jArchi has nothing to work on.
 * The entry points check it first, so the user gets this message instead of jArchi's.
 * @throws when no model is selected
 */
function requireModel() {
  if (!model.isSet()) throw new Error("No model selected. Select a starting point in a model (elements, a view or a folder) before running this script.");
}

let _cancelled = false;
/** The user cancelled the run before anything was written. */
function cancelled() {
  _cancelled = true;
  Log.info("One view each cancelled: nothing written.");
}

/**
 * A selected view that is skipped before it is generated, with the reason.
 * @param {ArchimateView} view
 * @param {string}        reason
 * @param {string}        action
 */
function _skip(view, reason, action) {
  Log.beginItem("view", view.name);
  Log.warn(reason, { action });
  Log.endItem("skipped", `Skipped: "${view.name}"`);
}

/** "\n\nLog file: …", or nothing without a log file. */
function _logFileLine() {
  const path = Log.path();
  return path ? `\n\nLog file: ${path}` : "";
}

/**
 * A message box in Archi's window; none on Archi's command line.
 * @param {"error" | "warning"} kind
 * @param {string} title
 * @param {string} message
 */
function _messageBox(kind, title, message) {
  if (!Java.type("org.eclipse.ui.PlatformUI").isWorkbenchRunning()) return;
  const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
  if (kind === "error") MessageDialog.openError(shell, title, message);
  else MessageDialog.openWarning(shell, title, message);
}

/**
 * Run a shortcut's work and report its outcome; a failure is shown (showFailure).
 * @param {() => ArchimateView[]} work
 * @returns {ArchimateView[]} the views written, none when the run failed
 */
function _reported(work) {
  try {
    requireModel();
    const views = work();
    reportOutcome();
    return views;
  }
  catch (e) { showFailure(e); return []; }
}

/**
 * Cycle: a new view starts with the selection order; each layout of an existing view takes the
 * session's order, and the session gets the next one. Sets the run's order in params.
 * @param {PresetParams} params  changed in place
 * @param {string} actionId
 * @returns {string} the order for the next run
 */
function cycleSelectionOrder(params, actionId) {
  const orders  = Defs.SELECTION_ORDER.map(o => o.val);
  const creates = actionId === ACTION.NEW_VIEW.id || actionId === ACTION.ONE_EACH.id;
  if (creates) params.selectionOrder = orders[0];
  return orders[(orders.indexOf(params.selectionOrder) + 1) % orders.length];
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fromFilename, fromDefault, fromSession, fromSessionCycling, fromView, fromViewSiblings, fromRecipe, parkNesting, restoreNesting, showFailure, reportOutcome, cancelled, requireModel, confirmViewCount, cycleSelectionOrder, parseFilename, FILENAME_ACTIONS, FILENAME_DIRECTIONS };
}
