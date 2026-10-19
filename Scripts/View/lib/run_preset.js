/**
 * Run a preset from a shortcut script whose filename names it:
 *
 *   <preset>_<Action>_<Direction>.ajs     e.g. TAenIA_Layout_LR.ajs
 *
 *   preset     preset name under presets/ (opts.folder is put in front: "GEMMA/TAenIA")
 *   Action     Generate | GenerateMultiple | Expand | Layout
 *   Direction  LR | RL | TB | BT — overrides the preset's direction (optional)
 *
 * A shortcut script is then three lines:
 *   const RunPreset = require(REPO_ROOT + "View/lib/run_preset");
 *   RunPreset.fromFilename(__FILE__, $(selection), { folder: "GEMMA" });
 *
 * The View/_*.ajs scripts run the base preset instead (fromBase), with fixed overrides:
 *   RunPreset.fromBase($(selection), ACTION.LAYOUT_ONLY.id, { direction: "Down" });
 */
console.log("Loading run_preset.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
const GenView  = require(REPO_ROOT + "View/lib/generate_view");
const Defs     = require(REPO_ROOT + "View/lib/defs");
const { ACTION } = Defs;

// Base preset of the View/_*.ajs scripts: a normal preset, so it is edited in the dialog.
// _Default (the code defaults) is used when it does not exist.
const BASE_PRESET_NAME = "all";

const FILENAME_ACTIONS = Object.freeze({
  Generate:         ACTION.NEW_VIEW.id,
  GenerateMultiple: ACTION.ONE_EACH.id,
  Expand:           ACTION.EXPAND_VIEW.id,
  Layout:           ACTION.LAYOUT_ONLY.id,
});
const FILENAME_DIRECTIONS = Object.freeze({ LR: "Right", RL: "Left", TB: "Down", BT: "Up" });

/**
 * Split "<preset>_<Action>_<Direction>[ anything].ajs" into its parts.
 * @param {string} file  script path (__FILE__)
 * @returns {{ preset: string, actionId: string, direction: string|null }}
 */
function parseFilename(file) {
  const base = String(file).replace(/^.*[\\/]/, "").replace(/\.[^.]*$/, "");
  const [preset, action, direction] = base.split("_");
  const actionId = FILENAME_ACTIONS[action];
  if (!preset || !actionId)
    throw `Script name "${base}" must be <preset>_<${Object.keys(FILENAME_ACTIONS).join("|")}>_<${Object.keys(FILENAME_DIRECTIONS).join("|")}>`;
  const dir = (direction || "").split(" ")[0];  // "LR copy" → "LR"
  return { preset, actionId, direction: FILENAME_DIRECTIONS[dir] || null };
}

/**
 * Read the preset the script's filename names and run its action on the selection.
 * @param {string}          file       script path (__FILE__)
 * @param {ArchiCollection} selection  usually $(selection)
 * @param {Object}          [opts]     folder: preset folder; preset: preset name instead of the
 *                                     filename's; edit: function(preset) to adjust it before running
 * @returns {ArchimateView[]} generated / changed views
 */
function fromFilename(file, selection, opts = {}) {
  const parsed = parseFilename(file);
  const name   = opts.preset || (opts.folder ? `${opts.folder}/${parsed.preset}` : parsed.preset);
  const preset = PresetIO.readPreset(name);
  if (parsed.direction) preset.params.direction = parsed.direction;
  if (opts.edit) opts.edit(preset);
  console.log(`Preset "${name}"  action ${parsed.actionId}${parsed.direction ? `  direction ${parsed.direction}` : ""}`);
  return GenView.generate_view(preset, selection, parsed.actionId);
}

/**
 * Run the base preset on the selection, with some params overridden.
 * @param {ArchiCollection} selection  usually $(selection)
 * @param {string}          actionId   ACTION.*.id
 * @param {Object}          [params]   params that replace the preset's, e.g. { direction: "Down", nestingRules: [] }
 * @returns {ArchimateView[]} generated / changed views
 */
function fromBase(selection, actionId, params = {}) {
  const name   = PresetIO.listPresets().includes(BASE_PRESET_NAME) ? BASE_PRESET_NAME : PresetIO.DEFAULT_PRESET_NAME;
  const preset = PresetIO.readPreset(name);
  Object.assign(preset.params, params);
  console.log(`Preset "${name}"  action ${actionId}${Object.keys(params).length ? "  " + JSON.stringify(params) : ""}`);
  return GenView.generate_view(Defs.validatePreset(preset), selection, actionId);  // validate the overrides too
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { fromFilename, fromBase, parseFilename, FILENAME_ACTIONS, FILENAME_DIRECTIONS, BASE_PRESET_NAME };
}
