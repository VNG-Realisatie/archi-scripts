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
 * The View/_*.ajs scripts run the base preset instead (fromBase), with fixed overrides:
 *   RunPreset.fromBase($(selection), ACTION.LAYOUT_ONLY.id, { direction: "Down" });
 * or the dialog's last settings with one change, kept in the session (fromSession):
 *   RunPreset.fromSession($(selection), ACTION.LAYOUT_ONLY.id, s => { s.params.direction = "Down"; });
 * or those settings with Cycle selection order on (fromSessionCycling):
 *   RunPreset.fromSessionCycling($(selection), ACTION.LAYOUT_ONLY.id);
 */
console.log("Loading run_preset.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("./preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("./generate_view")} */
const GenView  = require(REPO_ROOT + "View/lib/generate_view");
/** @type {typeof import("./defs")} */
const Defs     = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
const { ACTION } = Defs;

// Base preset of the View/_all_*.ajs scripts: a normal preset, so it is edited in the dialog.
const BASE_PRESET_NAME = "all";

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
    if (parsed.direction) preset.params.direction = parsed.direction;
    if (opts.edit) opts.edit(preset);
    console.log(`Preset "${name}"  action ${parsed.actionId}${parsed.direction ? `  direction ${parsed.direction}` : ""}`);
    return _run(preset, selection, parsed.actionId);
  });
}

/**
 * Run the base preset on the selection, with some params overridden.
 * @param {ArchiCollection<ArchiObject>} selection  usually $(selection)
 * @param {string}                       actionId   ACTION.*.id
 * @param {Partial<PresetParams>}        [params]   params that replace the preset's, e.g. { direction: "Down", nestingConditions: [] }
 * @returns {ArchimateView[]} generated / changed views
 */
function fromBase(selection, actionId, params = {}) {
  return _reported(() => {
    const preset = PresetIO.readPreset(BASE_PRESET_NAME);
    Object.assign(preset.params, params);
    console.log(`Preset "${BASE_PRESET_NAME}"  action ${actionId}${Object.keys(params).length ? "  " + JSON.stringify(params) : ""}`);
    return _run(preset, selection, actionId);   // generate_view validates the overrides too
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
    console.log(`Session  action ${actionId}  selection order ${preset.params.selectionOrder} (next: ${next})`);
    return _run(preset, selection, actionId);
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
    console.log(`Session  action ${actionId}  direction ${session.params.direction}  nesting conditions ${session.params.nestingConditions.length}`);
    return _run(session, selection, actionId);
  });
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
 * @returns {boolean} the run may go on
 */
function confirmViewCount(selection, actionId) {
  if (actionId !== ACTION.ONE_EACH.id) return true;
  const count = SelectionRead.getSeedElements(selection).length;
  return count <= Defs.ONE_EACH_CONFIRM_ABOVE || window.confirm(`This will generate ${count} views. Continue?`);
}

/**
 * Run the action after the confirm; a cancelled run writes nothing.
 * @param {PresetFile} preset
 * @param {ArchiCollection<ArchiObject>} selection
 * @param {string} actionId
 * @returns {ArchimateView[]}
 */
function _run(preset, selection, actionId) {
  if (!confirmViewCount(selection, actionId)) { console.log("One view each cancelled: nothing written."); return []; }
  return GenView.generate_view(preset, selection, actionId);
}

/**
 * Show why a run failed: the reason in a message box, the stack on the console (SPEC § 12). The
 * entry points call it; the code between them throws.
 * @param {unknown} error
 */
function showFailure(error) {
  const e = /** @type {Error} */ (error);   // Cast: an Error, or a Java exception from Archi
  console.error(`Run failed: ${e.stack || e}`);
  const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
  MessageDialog.openError(shell, "View run failed", e.message || String(e));
}

/**
 * Run a shortcut's work; a failure is shown (showFailure).
 * @param {() => ArchimateView[]} work
 * @returns {ArchimateView[]} the views written, none when the run failed
 */
function _reported(work) {
  try { return work(); }
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
  module.exports = { fromFilename, fromBase, fromSession, fromSessionCycling, parkNesting, restoreNesting, showFailure, confirmViewCount, cycleSelectionOrder, parseFilename, FILENAME_ACTIONS, FILENAME_DIRECTIONS, BASE_PRESET_NAME };
}
