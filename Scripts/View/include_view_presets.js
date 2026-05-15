/**
 * Preset/parameter-file loading utilities for include_view.js.
 *
 * Provides three functions that read parameter files from disk and merge them
 * into a param object for use with View.generate_view().
 * Re-exports everything from include_view.js so callers need only one require().
 *
 * Preset file resolution order (lowest to highest precedence):
 *   1. include_view.js DEFAULTS (engine built-ins)
 *   2. user_parameter/default_parameter.json  ← get_default_parameter()
 *   3. user_parameter/<name>.json             ← get_user_parameter() / read_user_parameter()
 *   4. inline overrides in the calling .ajs script
 */
console.log("include_view_presets.js");

const View    = require(REPO_ROOT + "View/include_view.js");
const Common  = require(REPO_ROOT + "_lib/Common.js");

const DEFAULT_PARAM_FILE = "default_parameter.json";
const USER_PARAM_FOLDER  = "user_parameter";

/**
 * Read a JSON file via Java IO. No require() — avoids module cache.
 * @param {string} path - absolute file path
 * @returns {object|null} parsed object or null if file does not exist or parse fails
 */
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

/**
 * Write an object as JSON to a file via Java IO.
 * @param {string} path - absolute file path
 * @param {object} obj  - object to serialize
 */
function writeJSON(path, obj) {
  const FileWriter = Java.type("java.io.FileWriter");
  try {
    const writer = new FileWriter(path);
    writer.write(JSON.stringify(obj, null, 2));
    writer.close();
  } catch (e) {
    console.error("Failed to write file:", e);
  }
}

/**
 * Read a preset file from <scriptDir>/user_parameter/<filename>.
 * @param {string} scriptDir - absolute directory path ending with "/"
 * @param {string} filename  - preset filename (with or without .json)
 * @returns {object|null} parsed preset or null if not found
 */
function readPreset(scriptDir, filename) {
  if (!filename.endsWith(".json")) filename += ".json";
  return readJSON(scriptDir + USER_PARAM_FOLDER + "/" + filename);
}

/**
 * Write a preset object to <scriptDir>/user_parameter/<filename>.
 * @param {string} scriptDir - absolute directory path ending with "/"
 * @param {string} filename  - preset filename (with or without .json)
 * @param {object} obj       - preset object to save
 */
function writePreset(scriptDir, filename, obj) {
  if (!filename.endsWith(".json")) filename += ".json";
  writeJSON(scriptDir + USER_PARAM_FOLDER + "/" + filename, obj);
}

/**
 * List .json preset files in <scriptDir>/user_parameter/.
 * @param {string} scriptDir - absolute directory path ending with "/"
 * @returns {string[]} sorted filenames
 */
function getPresetFiles(scriptDir) {
  const File  = Java.type("java.io.File");
  const dir   = new File(scriptDir + USER_PARAM_FOLDER);
  const files = dir.listFiles();
  const names = [];
  if (files) {
    for (let i = 0; i < files.length; i++) {
      if (files[i].isFile() && String(files[i].getName()).endsWith(".json"))
        names.push(String(files[i].getName()));
    }
  }
  names.sort();
  return names;
}

/**
 * Load the shared default preset file for the script's folder.
 * File: <script-dir>/user_parameter/default_parameter.json
 *
 * @param {string} file  - calling script path (__FILE__)
 * @returns {object} param loaded from default preset, or {} if not found
 */
function get_default_parameter(file) {
  Common.debugStackPush(false);

  let param = {};
  try {
    let path = file.substring(0, file.lastIndexOf("/") + 1);
    let default_param_file = path + `${USER_PARAM_FOLDER}/${DEFAULT_PARAM_FILE}`;
    Common.debug(`default_param_file: ${default_param_file}`);
    const loaded = readJSON(default_param_file);
    if (loaded) {
      param = loaded;
      console.log(`Default parameter read from file "${default_param_file}"`);
      Common.debug(`Default: \n${JSON.stringify(param, null, 2)}\n`);
    } else {
      console.log(`NOT read default parameters ${DEFAULT_PARAM_FILE} (file not found)\n`);
    }
  } catch (error) {
    console.log(`NOT read default parameters ${DEFAULT_PARAM_FILE}\n`);
    Common.debug(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  Common.debugStackPop();
  return param;
}

/**
 * Parse the calling script's filename into param values and load its preset.
 * Filename format: <preset-name>_<action>_<direction>.ajs
 *
 * @param {string} file   - calling script path (__FILE__)
 * @param {object} param  - param object to merge into
 * @returns {object} merged param
 */
function get_user_parameter(file, param) {
  let filename = file.replace(/^.*[\\\/]/, "");
  let name = filename.substring(0, filename.lastIndexOf("."));
  let [user_param_name, action, direction] = name.split("_");

  return read_user_parameter(file, user_param_name, action, direction, param);
}

/**
 * Load a named preset file and merge it into param.
 * File: <script-dir>/user_parameter/<user_param_name>.json
 *
 * @param {string} file            - script path (used to resolve folder)
 * @param {string} user_param_name - preset filename (without .json)
 * @param {string} action          - e.g. "Generate", "Layout"
 * @param {string} direction       - dagre-style direction (LR/TB/RL/BT); migrated to layoutDirection
 * @param {object} param           - param object to merge into
 * @returns {object} merged param
 */
function read_user_parameter(file, user_param_name, action, direction, param = {}) {
  Common.debugStackPush(false);
  Common.debug(`file:\n- ${file}`);

  let path = file.substring(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);

  if (user_param_name) {
    let userParamFile = `${path}${USER_PARAM_FOLDER}/${user_param_name}.json`;

    console.log(`User parameters read from file: \n- ${userParamFile}`);
    console.log(`User parameter "${user_param_name}", action "${action}" with direction "${direction}"`);
    console.log();
    try {
      const USER_PARAM = readJSON(userParamFile);
      if (USER_PARAM) {
        Object.keys(USER_PARAM).forEach((prop) => {
          param[prop] = USER_PARAM[prop];
          Common.debug(`Read_user_parameter: Set ${prop} = ${USER_PARAM[prop]}`);
        });
        Common.debug(`With user parameter file: \n${JSON.stringify(param, null, 2)}\n`);
      } else {
        console.log(`NOT read user parameters from file (file not found)`);
      }
    } catch (error) {
      console.log(`NOT read user parameters from file`);
      Common.debug(`> ${typeof error.stack == "undefined" ? error : error.stack}\n`);
    }
  } else {
    console.log(`${action} with direction ${direction}\n`);
  }

  // Store direction from filename; _setDefaultParameters will migrate to layoutDirection
  param.graphDirection = direction;
  param.action = action;

  Common.debugStackPop();
  return param;
}

// Re-export everything from the engine + the preset functions
// so callers need only one require().
if (typeof module !== "undefined" && module.exports) {
  module.exports = Object.assign({
    get_default_parameter,
    get_user_parameter,
    read_user_parameter,
    getPresetFiles,
    readJSON,
    writeJSON,
    readPreset,
    writePreset,
    USER_PARAM_FOLDER,
  }, View);
}
