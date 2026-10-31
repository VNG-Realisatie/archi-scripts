/**
 * View configuration: the programs a run starts, from Scripts/View/config.default.js and the
 * machine's own config.js next to it (git-ignored). Pure: runs in Archi and in Node.
 *
 * `programRunner` gives a ProcessRunner that starts `node` and `dot` from the configured paths, so
 * the adapters and the Node layout keep asking for the program by name.
 */
console.log("Loading view_config.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const CONFIG_FILE = "config.js";
const VIEW_DIR = REPO_ROOT + "View/";

/** @type {ViewConfig} */
const DEFAULTS = require(VIEW_DIR + "config.default.js");

// The program name an adapter or the Node layout starts → its config key.
/** @type {Record<string, keyof ViewConfig>} */
const PROGRAM_KEY = { node: "nodePath", dot: "dotPath" };

/**
 * The defaults with config.js over them, validated; logs the keys config.js sets. Throws a
 * descriptive string on an unusable config.js.
 * @param {(path: string) => boolean} fileExists
 * @returns {ViewConfig}
 */
function readConfig(fileExists) {
  const path = VIEW_DIR + CONFIG_FILE;
  if (!fileExists(path)) return Object.assign({}, DEFAULTS);
  const local = validateConfig(require(path));
  for (const [key, value] of Object.entries(local)) console.log(`View config (${CONFIG_FILE}): ${key} = ${value}`);
  return Object.assign({}, DEFAULTS, local);
}

/**
 * config.js's exports: only keys of config.default.js, each a non-empty string.
 * @param {unknown} raw
 * @returns {Partial<ViewConfig>}
 */
function validateConfig(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw `${CONFIG_FILE}: expected module.exports = { … }.`;
  // Cast: an object, checked above.
  const r = /** @type {Record<string, unknown>} */ (raw);
  for (const [key, value] of Object.entries(r)) {
    if (!(key in DEFAULTS)) throw `${CONFIG_FILE}: unknown setting "${key}" (settings: ${Object.keys(DEFAULTS).join(", ")}). Remove it.`;
    if (typeof value !== "string" || !value.trim()) throw `${CONFIG_FILE}: ${key} must be the path of the program.`;
  }
  return /** @type {Partial<ViewConfig>} */ (r);   // Cast: keys and values checked above
}

/**
 * A runner that starts a configured program from its path. A configured path that is not found stops
 * the run: the program's own "not on the PATH" message would point the wrong way.
 * @param {ProcessRunner} runProcess
 * @param {ViewConfig}    config
 * @returns {ProcessRunner}
 */
function programRunner(runProcess, config) {
  return (command, args, input, timeoutSeconds) => {
    const key = PROGRAM_KEY[command];
    const program = key ? config[key] : command;
    const out = runProcess(program, args, input, timeoutSeconds);
    if (out.state === "not-found" && program !== command) {
      throw new Error(`'${program}' (${CONFIG_FILE} › ${key}) not found. Correct or remove ${key}.`);
    }
    return out;
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { CONFIG_FILE, readConfig, validateConfig, programRunner };
}
