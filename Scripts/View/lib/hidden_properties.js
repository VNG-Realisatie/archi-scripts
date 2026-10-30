/**
 * Hidden view properties — keys the Properties tab does not show and generation never touches,
 * in presets/_hidden_properties.json.
 *
 *   { "hidden": [ "GEMMA URL", "path", … ] }
 *
 * "Object ID" and "Managed occurrence" are always hidden (the tool owns them) and are not listed.
 * The file is read once per run and validated as a whole: an unusable file stops the run with a message.
 */
console.log("Loading hidden_properties.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");

const HIDDEN_FILE = "_hidden_properties.json";
const PRESETS_DIR = __DIR__.replace(/\\/g, "/").replace(/\/lib\/?$/, "/") + "presets/";

/**
 * Validate the parsed file. Throws a descriptive string on the first error.
 * @param {unknown} raw
 * @returns {string[]}
 */
function validateHidden(raw) {
  // Cast: shape is checked below.
  const r = /** @type {{ hidden?: unknown }} */ (raw);
  if (!r || typeof r !== "object" || !Array.isArray(r.hidden)) throw `${HIDDEN_FILE}: expected { "hidden": [ … ] }.`;
  /** @type {Set<string>} */
  const seen = new Set();
  return r.hidden.map((/** @type {unknown} */ k, /** @type {number} */ i) => {
    if (typeof k !== "string" || !k.trim()) throw `${HIDDEN_FILE}: hidden[${i}] must be a property name.`;
    if (seen.has(k)) throw `${HIDDEN_FILE}: "${k}" appears twice. Remove one.`;
    seen.add(k);
    return k;
  });
}

/**
 * Read and validate presets/_hidden_properties.json. No file: nothing hidden beyond the always-hidden keys.
 * @returns {string[]}
 */
function readHidden() {
  const Files = Java.type("java.nio.file.Files");
  const Paths = Java.type("java.nio.file.Paths");
  const path = Paths.get(PRESETS_DIR + HIDDEN_FILE);
  if (!Files.exists(path)) return [];
  return validateHidden(JSON.parse(String(Files.readString(path))));
}

/**
 * Every key the tab hides and generation leaves alone: the tool's own plus the file's. Logs them.
 * @returns {Set<string>}
 */
function hiddenKeys() {
  const keys = new Set([Defs.PROP_ID, Defs.PROP_MANAGED_OCCURRENCE, ...readHidden()]);
  console.log(`Hidden view properties (${HIDDEN_FILE}): ${[...keys].join(", ")}`);
  return keys;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { HIDDEN_FILE, validateHidden, readHidden, hiddenKeys };
}
