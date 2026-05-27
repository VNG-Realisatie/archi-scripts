/**
 * Preset I/O for the View subsystem.
 *
 * Reads and writes preset JSON files, validates against the schema in defs.js,
 * and manages the session file (_session.json).
 *
 * File layout:
 *   Scripts/View/user_parameter/<name>.json   — named presets
 *   Scripts/View/user_parameter/_session.json — last-used session (excluded from git)
 */
console.log("Loading preset_io.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Defs = require(REPO_ROOT + "View/lib/defs");
const { validatePreset, SESSION_FILENAME } = Defs;

const USER_PARAM_FOLDER = "user_parameter";
const VIEW_DIR = (() => {
  const p = __DIR__.replace(/\\/g, "/");
  // __DIR__ is Scripts/View/lib — go up one level to Scripts/View/
  return p.replace(/\/lib\/?$/, "/");
})();

// ── Low-level JSON I/O ────────────────────────────────────────────────────────

function readJSON(path) {
  const File          = Java.type("java.io.File");
  const BufferedReader = Java.type("java.io.BufferedReader");
  const FileReader    = Java.type("java.io.FileReader");
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
  const FileWriter = Java.type("java.io.FileWriter");
  try {
    const writer = new FileWriter(path);
    writer.write(JSON.stringify(obj, null, 2));
    writer.close();
  } catch (e) {
    console.error("Failed to write file:", path, e);
  }
}

// ── Preset path resolution ────────────────────────────────────────────────────

function _presetDir() {
  return VIEW_DIR + USER_PARAM_FOLDER + "/";
}

function _presetPath(filename) {
  if (!filename.endsWith(".json")) filename += ".json";
  return _presetDir() + filename;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * List named preset files (excludes session file).
 * @returns {string[]} sorted preset names (without .json extension)
 */
function listPresets() {
  const File  = Java.type("java.io.File");
  const dir   = new File(_presetDir());
  const files = dir.listFiles();
  const names = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      const name = String(files[i].getName());
      if (files[i].isFile() && name.endsWith(".json") && name !== SESSION_FILENAME) {
        names.push(name.replace(/\.json$/, ""));
      }
    }
  }
  names.sort();
  return names;
}

/**
 * Read and validate a named preset.
 * @param {string} name  preset name (without .json)
 * @returns {Object} validated preset
 * @throws if file not found or validation fails
 */
function readPreset(name) {
  const path = _presetPath(name);
  const raw  = readJSON(path);
  if (!raw) throw `Preset not found: "${name}" (${path})`;
  return validatePreset(raw);
}

/**
 * Write a preset to disk.
 * @param {string} name    preset name (without .json)
 * @param {Object} preset  validated preset object
 */
function writePreset(name, preset) {
  writeJSON(_presetPath(name), preset);
  console.log(`Preset saved: "${name}"`);
}

/**
 * Delete a preset file.
 * @param {string} name  preset name (without .json)
 */
function deletePreset(name) {
  const File = Java.type("java.io.File");
  new File(_presetPath(name)).delete();
}

/**
 * Read the session file. Returns validated DEFAULT_PRESET if no session exists.
 * @returns {Object} validated preset
 */
function readSession() {
  const path = _presetDir() + SESSION_FILENAME;
  const raw  = readJSON(path);
  if (!raw) return JSON.parse(JSON.stringify(Defs.DEFAULT_PRESET));
  try {
    const validated = validatePreset(raw);
    // Preserve UI state fields (underscore-prefixed) that are not part of the preset schema.
    Object.keys(raw).forEach(k => { if (k.startsWith("_")) validated[k] = raw[k]; });
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
  writeJSON(_presetDir() + SESSION_FILENAME, preset);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    listPresets,
    readPreset,
    writePreset,
    deletePreset,
    readSession,
    writeSession,
    readJSON,
    writeJSON,
  };
}
