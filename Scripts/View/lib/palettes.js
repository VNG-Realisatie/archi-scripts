/**
 * Palettes — named colours and colour ranges that belong together, in presets/_palettes.json.
 *
 *   { "palettes": [ { "name": "Brewer",
 *       "colors": [ { "name": "Blue", "hex": "#b3cde3" }, … ],
 *       "ranges": [ { "name": "Blues", "colors": ["#f7fbff", …, "#08306b"], "padding": [0.1, 0.4] }, … ] } ] }
 *
 * A preset names one palette (appearance.palette); every colour of the Appearance tab comes from it:
 * a nesting style condition names one of its colours, a style condition and Highlight repeated
 * elements one of its ranges. A range interpolates between its colours; `padding` leaves out that
 * fraction at the start and the end (so a dark end does not hide black text). The first palette is
 * the default. The file is read once per run and validated as a whole: an unusable file stops the
 * run with a message.
 */
console.log("Loading palettes.js");

const Chroma = require("chroma-js");

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
    if (!Array.isArray(p.ranges) || !p.ranges.length) throw `${where}: palette "${p.name}" needs a ranges list.`;
    /** @type {Set<string>} */
    const rangeNames = new Set();
    const ranges = p.ranges.map((/** @type {any} */ r, /** @type {number} */ j) => {
      if (!r || typeof r.name !== "string" || !r.name.trim()) throw `${where}: palette "${p.name}" ranges[${j}] needs a name.`;
      if (rangeNames.has(r.name)) throw `${where}: palette "${p.name}" has range "${r.name}" twice.`;
      rangeNames.add(r.name);
      if (!Array.isArray(r.colors) || r.colors.length < 2 || !r.colors.every((/** @type {unknown} */ h) => typeof h === "string" && HEX.test(h)))
        throw `${where}: range "${r.name}" needs two or more hex colours like #ffffcc.`;
      const pad = r.padding === undefined ? [0, 0] : r.padding;
      if (!Array.isArray(pad) || pad.length !== 2 || !pad.every((/** @type {unknown} */ x) => typeof x === "number" && x >= 0 && x < 0.5))
        throw `${where}: range "${r.name}" padding must be [start, end], each from 0 to below 0.5.`;
      return { name: r.name, colors: r.colors.map((/** @type {string} */ h) => h.toLowerCase()), padding: /** @type {[number, number]} */ (pad) };
    });
    return { name: p.name, colors, ranges };
  });
}

/**
 * Read and validate presets/_palettes.json. A palette is always active, so the file must hold one.
 * @returns {Palette[]}
 */
function readPalettes() {
  const Files = Java.type("java.nio.file.Files");
  const Paths = Java.type("java.nio.file.Paths");
  const path = Paths.get(PRESETS_DIR + PALETTES_FILE);
  if (!Files.exists(path)) throw `${PALETTES_FILE} not found in the presets folder: the Appearance colours come from it.`;
  const palettes = validatePalettes(JSON.parse(String(Files.readString(path))));
  if (!palettes.length) throw `${PALETTES_FILE}: no palettes.`;
  return palettes;
}

/**
 * The palette a preset names; an unknown name is reported and the first palette (the default) used.
 * @param {Palette[]} palettes
 * @param {string}    name
 * @param {(message: string) => void} report
 * @returns {Palette}
 */
function paletteOf(palettes, name, report) {
  const p = palettes.find(x => x.name === name);
  if (p) return p;
  report(`palette "${name}" is not in ${PALETTES_FILE}; "${palettes[0].name}" is used. Choose a palette on the Appearance tab.`);
  return palettes[0];
}

/**
 * The hex of a colour setting: a colour of the palette by name, or a colour of its own (Other…) as
 * hex. A name the palette does not hold gives its first colour, as the dialog shows it, and is
 * reported; a palette without colours gives null (the caller's default).
 * @param {Palette} palette
 * @param {string}  value
 * @param {(message: string) => void} report
 * @returns {string | null}
 */
function colorOf(palette, value, report) {
  if (HEX.test(value)) return value.toLowerCase();
  const c = palette.colors.find(x => x.name === value);
  if (c) return c.hex;
  const first = palette.colors[0];
  report(`colour "${value}" is not in palette "${palette.name}"; ${first ? `its first colour "${first.name}"` : "the default"} is used, as the dialog shows. Save the preset to keep it.`);
  return first ? first.hex : null;
}

/**
 * n colours of a range, evenly spaced between its padded ends.
 * @param {PaletteRange} range
 * @param {number} n
 * @returns {string[]}
 */
function rangeColors(range, n) {
  return Chroma.scale(range.colors).padding(range.padding).colors(n);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { PALETTES_FILE, HEX, validatePalettes, readPalettes, paletteOf, colorOf, rangeColors };
}
