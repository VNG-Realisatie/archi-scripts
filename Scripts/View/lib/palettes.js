/**
 * Palettes — named lists of named colours, in presets/_palettes.json.
 *
 *   { "palettes": [ { "name": "GEMMA", "colors": [ { "name": "Bedrijf gedrag", "hex": "#ffffcc" }, … ] } ] }
 *
 * A preset names a list (appearance.palette) and, per nesting style condition, a colour of it.
 * The file is read once per run and validated as a whole: an unusable file stops the run with a message.
 */
console.log("Loading palettes.js");

const PALETTES_FILE = "_palettes.json";
const PRESETS_DIR = __DIR__.replace(/\\/g, "/").replace(/\/lib\/?$/, "/") + "presets/";
const HEX = /^#[0-9a-fA-F]{6}$/;

/**
 * Validate the parsed file. Throws a descriptive string on the first error.
 * @param {unknown} raw
 * @returns {Palette[]}
 */
function validatePalettes(raw) {
  const where = PALETTES_FILE;
  // Cast: shape is checked field by field below.
  const r = /** @type {{ palettes?: unknown }} */ (raw);
  if (!r || typeof r !== "object" || !Array.isArray(r.palettes)) throw `${where}: expected { "palettes": [ … ] }.`;
  /** @type {Set<string>} */
  const names = new Set();
  return r.palettes.map((/** @type {any} */ p, /** @type {number} */ i) => {
    if (!p || typeof p.name !== "string" || !p.name.trim()) throw `${where}: palettes[${i}] needs a name.`;
    if (names.has(p.name)) throw `${where}: palette "${p.name}" appears twice.`;
    names.add(p.name);
    if (!Array.isArray(p.colors)) throw `${where}: palette "${p.name}" needs a colors list.`;
    /** @type {Set<string>} */
    const colorNames = new Set();
    const colors = p.colors.map((/** @type {any} */ c, /** @type {number} */ j) => {
      if (!c || typeof c.name !== "string" || !c.name.trim()) throw `${where}: palette "${p.name}" colors[${j}] needs a name.`;
      if (colorNames.has(c.name)) throw `${where}: palette "${p.name}" has colour "${c.name}" twice.`;
      colorNames.add(c.name);
      if (typeof c.hex !== "string" || !HEX.test(c.hex)) throw `${where}: colour "${c.name}" needs a hex value like #ffffcc.`;
      return { name: c.name, hex: c.hex.toLowerCase() };
    });
    return { name: p.name, colors };
  });
}

/**
 * Read and validate presets/_palettes.json. No file: no palettes.
 * @returns {Palette[]}
 */
function readPalettes() {
  const Files = Java.type("java.nio.file.Files");
  const Paths = Java.type("java.nio.file.Paths");
  const path = Paths.get(PRESETS_DIR + PALETTES_FILE);
  if (!Files.exists(path)) return [];
  return validatePalettes(JSON.parse(String(Files.readString(path))));
}

/**
 * The hex of a colour in a list, or null when the list or the colour is not there.
 * @param {Palette[]} palettes
 * @param {string}    paletteName
 * @param {string}    colorName
 * @returns {string | null}
 */
function colorHex(palettes, paletteName, colorName) {
  const p = palettes.find(x => x.name === paletteName);
  const c = p && p.colors.find(x => x.name === colorName);
  return c ? c.hex : null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PALETTES_FILE, validatePalettes, readPalettes, colorHex };
}
