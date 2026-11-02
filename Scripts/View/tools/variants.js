/**
 * Variants of a test preset (Node checks): one option changed on top of it, per algorithm only where the
 * dialog offers the option (defs.js activeParams), so every option runs where it has an effect.
 *
 *   - every value of an algorithm's select options (supportedOptions) other than the preset's;
 *   - the options below, with values that change the result: no padding, a view-size target, the
 *     booleans flipped, every Sort and Circles value.
 */
const path = require("path");
const Defs = require(path.join(__dirname, "..", "lib", "defs.js"));

/** Each entry: the params it sets; its first key must be active for the algorithm. */
const EXTRA = [
  { padding: 0 },
  { aspectRatio: 0.5, viewSizeMode: "aspectRatio" },
  { aspectRatio: 3, viewSizeMode: "aspectRatio" },
  { maxWidth: 400, viewSizeMode: "maxWidth" },   // narrower than every test view
  { alignWidthSameType: true },
  { columnsAcrossContainers: true },
  { labelSizing: true },
  { connectionLabelSpacing: false },
  ...Object.values(Defs.SORT_MODE).map(sort => ({ sort })),
  ...Defs.CIRCLES.map(c => ({ circles: c.val })),
];

/**
 * The variants of a preset's params for an algorithm, each with a short name ("routing=Splines").
 * @param {string} algorithm
 * @param {Record<string, unknown>} params  the preset's params
 * @returns {{name: string, params: Record<string, unknown>}[]}
 */
function variantsOf(algorithm, params) {
  const spec = Defs.ALGORITHMS[algorithm];
  const active = new Set(spec.activeParams);
  /** @type {Record<string, unknown>[]} */
  const changes = [];
  for (const [key, values] of Object.entries(spec.supportedOptions || {})) {
    if (!active.has(key)) continue;
    for (const value of /** @type {unknown[]} */ (values)) if (value !== params[key]) changes.push({ [key]: value });
  }
  for (const change of EXTRA) {
    const [key] = Object.keys(change);
    if (active.has(key) && !changes.some(c => JSON.stringify(c) === JSON.stringify(change)) && change[key] !== params[key]) changes.push(change);
  }
  return changes.map(change => ({
    name: Object.entries(change).filter(([k]) => k !== "viewSizeMode").map(([k, v]) => `${k}=${v}`).join(","),
    params: { ...params, ...change },
  }));
}

module.exports = { variantsOf };
