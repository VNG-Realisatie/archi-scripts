#!/usr/bin/env node
/**
 * Differences between two presets after normalisation (validatePreset: defaults filled in,
 * unsupported options replaced) — by default a preset file against presets/_session.json, the
 * parameters the dialog last ran with. Params the algorithm does not use are marked "inactive".
 *
 * Run: node Scripts/View/tools/preset_diff.js <preset.json> [other.json]
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log;
console.log = (...a) => { if (!(typeof a[0] === "string" && a[0].startsWith("Loading "))) _log(...a); };
const Defs = require("../lib/defs");

/** Flatten an object to { "a.b[0].c": value } (leaves only). */
function flatten(obj, prefix, out) {
  out = out || {};
  if (Array.isArray(obj)) {
    if (obj.length === 0) out[prefix] = "[]";
    obj.forEach((v, i) => flatten(v, `${prefix}[${i}]`, out));
  } else if (obj && typeof obj === "object") {
    if (Object.keys(obj).length === 0) out[prefix] = "{}";
    for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  } else {
    out[prefix] = obj;
  }
  return out;
}

const load = file => Defs.validatePreset(JSON.parse(fs.readFileSync(file, "utf8")));

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length < 1) { console.log("usage: preset_diff.js <preset.json> [other.json]"); process.exit(2); }
  const fileA = args[0];
  const fileB = args[1] || path.join(__dirname, "..", "presets", "_session.json");
  const a = load(fileA), b = load(fileB);
  const fa = flatten(a), fb = flatten(b);
  const active = new Set(Defs.ALGORITHMS[b.algorithm].activeParams);
  const keys = [...new Set([...Object.keys(fa), ...Object.keys(fb)])].filter(k => k !== "name")
    .filter(k => JSON.stringify(fa[k]) !== JSON.stringify(fb[k]));
  const nameA = path.basename(fileA), nameB = path.basename(fileB);
  const mtime = f => { const d = fs.statSync(f).mtime; return `${d.toLocaleDateString("sv")} ${d.toLocaleTimeString("sv")}`; };
  console.log(`A ${fileA} ("${a.name}", ${mtime(fileA)})`);
  console.log(`B ${fileB} ("${b.name}", ${mtime(fileB)})`);
  if (keys.length === 0) { console.log("No differences."); process.exit(0); }
  const w = Math.max(...keys.map(k => k.length));
  for (const k of keys) {
    const m = /^params\.(\w+)/.exec(k);
    const note = m && !active.has(m[1]) ? `   (inactive for ${b.algorithm})` : "";
    console.log(`${k.padEnd(w)}  ${nameA}: ${JSON.stringify(fa[k])}  ${nameB}: ${JSON.stringify(fb[k])}${note}`);
  }
}

module.exports = { flatten };
