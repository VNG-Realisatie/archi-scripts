/**
 * Preset I/O for the View subsystem.
 *
 * Reads and writes preset JSON files, validates against the schema in defs.js,
 * and manages the session file (_session.json).
 *
 * File layout:
 *   Scripts/View/presets/<name>.json          — root presets
 *   Scripts/View/presets/<folder>/<name>.json — foldered presets (name = "folder/name")
 *   Scripts/View/presets/Default.json         — the Default preset: the code defaults, or the user's own
 *   Scripts/View/presets/_session.json        — last-used session (excluded from git)
 */
console.log("Loading preset_io.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
const { validatePreset, SESSION_FILENAME, compareNames } = Defs;

const USER_PARAM_FOLDER    = "presets";
const DEFAULT_PRESET_NAME  = "Default";    // read-only in the dialog; the file may hold the user's own defaults

const VIEW_DIR = (() => {
  const p = __DIR__.replace(/\\/g, "/");
  return p.replace(/\/lib\/?$/, "/");
})();

// ── Low-level JSON I/O ────────────────────────────────────────────────────────

/**
 * @param {string} path
 * @returns {PresetFile | null} parsed JSON, or null when the file does not exist
 */
function readJSON(path) {
  const File           = Java.type("java.io.File");
  const BufferedReader = Java.type("java.io.BufferedReader");
  const FileReader     = Java.type("java.io.FileReader");
  const f = new File(path);
  if (!f.exists()) return null;
  let content = "";
  const reader = new BufferedReader(new FileReader(path));
  let line;
  while ((line = reader.readLine()) !== null) content += line + "\n";
  reader.close();
  return JSON.parse(content);
}

// Presets and the session file: condition lists one condition per line (rel_filter.stringifyPreset).
/**
 * @param {string} path
 * @param {object} obj
 */
function writeJSON(path, obj) {
  const File       = Java.type("java.io.File");
  const FileWriter = Java.type("java.io.FileWriter");
  try {
    new File(path).getParentFile().mkdirs();
    const writer = new FileWriter(path);
    writer.write(ConditionLists.stringifyPreset(obj));
    writer.close();
  } catch (e) {
    console.error(`Failed to write file: ${path} ${e}`);
  }
}

// ── Preset path resolution ────────────────────────────────────────────────────

function presetDir() {
  return VIEW_DIR + USER_PARAM_FOLDER + "/";
}

// name can be "presetName" or "folder/presetName"
/**
 * @param {string} name
 * @returns {string}
 */
function _presetPath(name) {
  if (!name.endsWith(".json")) name += ".json";
  return presetDir() + name;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Walk the preset directory recursively.
 * @returns {{ names: string[], folders: string[] }} preset names ("name", "folder/sub/name")
 *          and the folders that hold at least one preset
 */
function _scanPresets() {
  const File = Java.type("java.io.File");
  /** @type {string[]} */
  const names = [];
  /** @type {Set<string>} */
  const folders = new Set();
  /** @type {(dir: any, prefix: string) => void}  dir: a java.io.File */
  const walk = (dir, prefix) => {
    const files = dir.listFiles();
    if (!files) return;
    for (let i = 0; i < files.length; i++) {
      const f     = files[i];
      const fname = String(f.getName());
      if (f.isDirectory()) walk(f, prefix + fname + "/");
      else if (fname.endsWith(".json") && !fname.startsWith("_")) {   // "_" prefix = not a selectable preset (e.g. _session.json)
        names.push(prefix + fname.replace(/\.json$/, ""));
        if (prefix) folders.add(prefix.slice(0, -1));
      }
    }
  };
  walk(new File(presetDir()), "");
  return { names, folders: Array.from(folders) };
}

/**
 * List named preset files in the preset directory and all its sub-directories
 * (excludes the session file).
 * @returns {string[]} sorted preset names — "name" or "folder/sub/name" ("_" files excluded)
 */
function listPresets() {
  return _scanPresets().names.sort((a, b) => {
    if (a === DEFAULT_PRESET_NAME) return -1;
    if (b === DEFAULT_PRESET_NAME) return 1;
    return compareNames(a, b);
  });
}

/**
 * List the preset folders ("folder" or "folder/sub") that hold at least one preset.
 * @returns {string[]} sorted folder paths
 */
function listFolders() {
  return _scanPresets().folders.sort(compareNames);
}

/**
 * Read and validate a named preset. Preserves description field.
 * @param {string} name  preset name — "name" or "folder/name" (without .json)
 * @returns {Preset} validated preset, with description preserved
 * @throws if file not found
 */
function readPreset(name) {
  if (name === DEFAULT_PRESET_NAME) ensureDefault();
  const path = _presetPath(name);
  const raw  = readJSON(path);
  if (!raw) throw `Preset not found: "${name}" (${path})`;
  const validated = validatePreset(raw);
  if (raw.description !== undefined) validated.description = raw.description;
  return validated;
}

/**
 * Write a preset to disk. Creates parent directories as needed.
 * @param {string} name    preset name — "name" or "folder/name" (without .json)
 * @param {object} preset  preset object (dialog fields starting with "_" are dropped)
 * @param {{quiet?:boolean}} [opts]  quiet: no console line — for callers inside an SWT handler of
 *                                   a modal dialog, where console output blocks until it closes
 */
function writePreset(name, preset, opts) {
  // Dialog/session state (action, _lastTabIndex, …) is not part of a preset.
  const clean = Object.fromEntries(Object.entries(preset).filter(([k]) => k !== "action" && !k.startsWith("_")));
  writeJSON(_presetPath(name), clean);
  if (!(opts && opts.quiet)) console.log(`Preset saved: "${name}"`);
}

/**
 * Delete a preset file.
 * @param {string} name  preset name — "name" or "folder/name" (without .json)
 */
function deletePreset(name) {
  const File = Java.type("java.io.File");
  new File(_presetPath(name)).delete();
}

/**
 * Move/rename a preset file (also handles folder changes).
 * @param {string} oldName  current name — "name" or "folder/name"
 * @param {string} newName  new name — "name" or "folder/name"
 */
function movePreset(oldName, newName) {
  const File    = Java.type("java.io.File");
  const oldFile = new File(_presetPath(oldName));
  const newFile = new File(_presetPath(newName));
  newFile.getParentFile().mkdirs();
  oldFile.renameTo(newFile);
}

/**
 * Ensure the Default preset exists. Creates it from Defs.DEFAULT_PRESET if absent.
 */
function ensureDefault() {
  const File = Java.type("java.io.File");
  if (!new File(_presetPath(DEFAULT_PRESET_NAME)).exists()) {
    const preset = JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
    preset.name = DEFAULT_PRESET_NAME;
    writeJSON(_presetPath(DEFAULT_PRESET_NAME), preset);
    console.log("Created Default preset.");
  }
}

/**
 * The settings in which the Default preset differs from the code defaults (name and description
 * left out), both normalised by validatePreset; condition lists compared in file form, as one value.
 * @returns {{ key: string, file: unknown, code: unknown }[]}  key: a flat path, e.g. "params.padding"
 */
function defaultDifferences() {
  const file = _flatten(ConditionLists.compactPreset(readPreset(DEFAULT_PRESET_NAME)), "", {});
  const code = _flatten(ConditionLists.compactPreset(validatePreset(JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET)))), "", {});
  return Array.from(new Set([...Object.keys(file), ...Object.keys(code)]))
    .filter(key => key !== "name" && key !== "description" && JSON.stringify(file[key]) !== JSON.stringify(code[key]))
    .sort()
    .map(key => ({ key, file: file[key], code: code[key] }));
}

/**
 * Log the settings in which the Default preset differs from the code defaults; nothing when equal.
 * Not from an SWT handler of a modal dialog: console output there blocks until it closes.
 */
function logDefaultDifferences() {
  const diffs = defaultDifferences();
  if (!diffs.length) return;
  const lines = diffs.map(d => `  ${d.key}  ${DEFAULT_PRESET_NAME}.json: ${JSON.stringify(d.file)}  code: ${JSON.stringify(d.code)}`);
  console.log(`Preset "${DEFAULT_PRESET_NAME}" differs from the code defaults:\n` + lines.join("\n"));
}

/**
 * Flatten an object to { "a.b[0].c": value } (leaves only). A condition list, an empty array and
 * an empty object are leaves.
 * @param {unknown} obj
 * @param {string} prefix
 * @param {Record<string, unknown>} out
 * @returns {Record<string, unknown>}
 */
function _flatten(obj, prefix, out) {
  if (Array.isArray(obj) && obj.length && !/onditions$/.test(prefix)) obj.forEach((v, i) => _flatten(v, `${prefix}[${i}]`, out));
  else if (obj && typeof obj === "object" && !Array.isArray(obj) && Object.keys(obj).length) {
    for (const [k, v] of Object.entries(obj)) _flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else out[prefix] = obj;
  return out;
}

/**
 * Read the session file. Returns validated DEFAULT_PRESET if no session exists.
 * @returns {Preset} validated preset with UI-only fields ("_…") preserved
 */
function readSession() {
  const path = presetDir() + SESSION_FILENAME;
  const raw  = readJSON(path);
  if (!raw) return JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
  try {
    const validated = validatePreset(raw);
    Object.keys(raw).forEach(k => { if (k.startsWith("_")) /** @type {Record<string, unknown>} */ (validated)[k] = raw[k]; });   // Cast: UI-only fields
    if (raw.description !== undefined) validated.description = raw.description;
    return validated;
  } catch (e) {
    console.log(`Session file invalid (${e}), using defaults.`);
    return JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
  }
}

/**
 * Write the current configuration as the session file.
 * @param {object} preset  current configuration
 */
function writeSession(preset) {
  writeJSON(presetDir() + SESSION_FILENAME, preset);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEFAULT_PRESET_NAME,
    presetDir,
    listPresets,
    listFolders,
    readPreset,
    writePreset,
    deletePreset,
    movePreset,
    ensureDefault,
    logDefaultDifferences,
    readSession,
    writeSession,
    readJSON,
    writeJSON,
  };
}
