/**
 * Preset I/O for the View subsystem.
 *
 * Reads and writes preset JSON files, validates against the schema in defs.js,
 * and manages the session file (_session.json).
 *
 * File layout:
 *   Scripts/View/user_parameter/<name>.json          — root presets
 *   Scripts/View/user_parameter/<folder>/<name>.json — foldered presets (name = "folder/name")
 *   Scripts/View/user_parameter/_session.json        — last-used session (excluded from git)
 */
console.log("Loading preset_io.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Defs = require(REPO_ROOT + "View/lib/defs");
const { validatePreset, SESSION_FILENAME } = Defs;

const USER_PARAM_FOLDER    = "user_parameter";
const DEFAULT_PRESET_NAME  = "Default";

const VIEW_DIR = (() => {
  const p = __DIR__.replace(/\\/g, "/");
  return p.replace(/\/lib\/?$/, "/");
})();

// ── Low-level JSON I/O ────────────────────────────────────────────────────────

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

function writeJSON(path, obj) {
  const File       = Java.type("java.io.File");
  const FileWriter = Java.type("java.io.FileWriter");
  try {
    new File(path).getParentFile().mkdirs();
    const writer = new FileWriter(path);
    writer.write(JSON.stringify(obj, null, 2));
    writer.close();
  } catch (e) {
    console.error("Failed to write file:", path, e);
  }
}

// ── Preset path resolution ────────────────────────────────────────────────────

function presetDir() {
  return VIEW_DIR + USER_PARAM_FOLDER + "/";
}

// name can be "presetName" or "folder/presetName"
function _presetPath(name) {
  if (!name.endsWith(".json")) name += ".json";
  return presetDir() + name;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List named preset files (excludes session file).
 * Scans root and one level of sub-directories.
 * @returns {string[]} sorted preset names — "name" or "folder/name"
 */
function listPresets() {
  const File  = Java.type("java.io.File");
  const dir   = new File(presetDir());
  const files = dir.listFiles();
  const names = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const f    = files[i];
      const fname = String(f.getName());
      if (f.isFile() && fname.endsWith(".json") && fname !== SESSION_FILENAME) {
        names.push(fname.replace(/\.json$/, ""));
      } else if (f.isDirectory()) {
        const sub = f.listFiles();
        if (sub) {
          for (let j = 0; j < sub.length; j++) {
            const sf    = sub[j];
            const sname = String(sf.getName());
            if (sf.isFile() && sname.endsWith(".json")) {
              names.push(fname + "/" + sname.replace(/\.json$/, ""));
            }
          }
        }
      }
    }
  }
  names.sort((a, b) => {
    // Default always first, rest alphabetical
    if (a === DEFAULT_PRESET_NAME) return -1;
    if (b === DEFAULT_PRESET_NAME) return 1;
    return a.localeCompare(b);
  });
  return names;
}

/**
 * List sub-directory names inside the preset directory.
 * @returns {string[]} sorted folder names
 */
function listFolders() {
  const File  = Java.type("java.io.File");
  const dir   = new File(presetDir());
  const files = dir.listFiles();
  const folders = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].isDirectory()) folders.push(String(files[i].getName()));
    }
  }
  folders.sort();
  return folders;
}

/**
 * Read and validate a named preset. Preserves description field.
 * @param {string} name  preset name — "name" or "folder/name" (without .json)
 * @returns {Object} validated preset, with description preserved
 * @throws if file not found
 */
function readPreset(name) {
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
 * @param {Object} preset  preset object
 */
function writePreset(name, preset) {
  writeJSON(_presetPath(name), preset);
  console.log(`Preset saved: "${name}"`);
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
 * Read the session file. Returns validated DEFAULT_PRESET if no session exists.
 * @returns {Object} validated preset with UI-only fields preserved
 */
function readSession() {
  const path = presetDir() + SESSION_FILENAME;
  const raw  = readJSON(path);
  if (!raw) return JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
  try {
    const validated = validatePreset(raw);
    Object.keys(raw).forEach(k => { if (k.startsWith("_")) validated[k] = raw[k]; });
    if (raw.description !== undefined) validated.description = raw.description;
    return validated;
  } catch (e) {
    console.log(`Session file invalid (${e}), using defaults.`);
    return JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
  }
}

/**
 * Write the current configuration as the session file.
 * @param {Object} preset  current configuration
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
    readSession,
    writeSession,
    readJSON,
    writeJSON,
  };
}
