#!/usr/bin/env node
/**
 * Compare the written views of two model files (Node, no Archi): per view in a folder a canonical text,
 * then the lines that differ. Shows that a change leaves what the writer puts on the views as it was.
 *
 * Run: node Scripts/View/tools/compare-views.js --head                                     the test model against HEAD
 *      node Scripts/View/tools/compare-views.js <old.archimate> <new.archimate> "<folder>"   e.g. "Views/Baseline"
 *      node Scripts/View/tools/compare-views.js --text <model.archimate> "<folder>"         print the canonical text
 * --head compares the test model (test/model/view-test.archimate) with its committed version: Views/Baseline
 * (the written views) and Views/Test (the test views, which a run must leave as they are).
 * Exit 0 when every view is the same, 1 when one differs or is missing on one side.
 *
 * Canonical text of a view, one sorted line per object, visual ids left out (they differ per run):
 *   view      its attributes and properties (managed-occurrence records included)
 *   visual    key = parent key / concept name [concept id] (diagram object: its type) #n for the nth visual
 *             with the same parent and concept; bounds; other attributes, features and properties
 *   line      relation name [relation id] (note line: its type) from source key to target key #n;
 *             bendpoints; other attributes
 * Z-order (the order of siblings) is not compared. Baseline procedure: skill view-baseline
 * (ai/view-baseline/SKILL.md).
 */
const path = require("path");
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");

const _log = console.log;
console.log = () => {};   // quiet the "Loading …" lines of the modules the harness loads
const H = require(path.join(__dirname, "view_harness.js"));
console.log = _log;

const TEST_MODEL = path.join(__dirname, "..", "test", "model", "view-test.archimate");
const HEAD_FOLDERS = ["Views/Baseline", "Views/Test"];

// Attributes that hold object ids, or that the key and line already show.
const ID_ATTRS = new Set(["id", "xsi:type", "archimateElement", "archimateRelationship", "source", "target", "targetConnections"]);

/**
 * Canonical text per view under a folder: view path relative to the folder → sorted lines.
 * @param {string} file
 * @param {string} folder  "Views/Baseline"
 * @returns {Map<string, string[]>}
 */
function viewTexts(file, folder) {
  const model = H.loadModel(file);
  const out = new Map();
  for (const v of model.views) {
    if (v.path.startsWith(folder + "/")) out.set(v.path.slice(folder.length + 1), viewText(model, v.node));
  }
  return new Map([...out].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/**
 * @param {{ elements: Map<string, {name: string}>, relations: Map<string, {name: string}> }} model
 * @param {XmlNode} viewNode
 * @returns {string[]}
 */
function viewText(model, viewNode) {
  const lines = [`view ${_attrs(viewNode)}`.trim()];
  /** @type {Map<string, string>} */
  const keyOf = new Map();          // object id → key
  /** @type {Map<string, number>} */
  const seen = new Map();           // key without #n → count so far
  const unique = (/** @type {string} */ k) => { const n = seen.get(k) || 0; seen.set(k, n + 1); return n ? `${k} #${n}` : k; };
  /** @type {XmlNode[]} */
  const connections = [];
  const walk = (/** @type {XmlNode} */ node, /** @type {string} */ parentKey) => {
    for (const c of node.children) {
      if (c.tag === "sourceConnection") connections.push(c);
      if (c.tag !== "child") continue;
      const el = c.attrs.archimateElement && model.elements.get(c.attrs.archimateElement);
      const self = el ? `${el.name} [${c.attrs.archimateElement}]` : H.jarchiType(c.attrs["xsi:type"]);
      const key = unique(parentKey ? `${parentKey} / ${self}` : self);
      keyOf.set(c.attrs.id, key);
      lines.push(`visual ${key}  ${_bounds(c)}  ${_attrs(c)}`.trimEnd());
      walk(c, key);
    }
  };
  walk(viewNode, "");
  for (const c of connections) {
    const rel = c.attrs.archimateRelationship && model.relations.get(c.attrs.archimateRelationship);
    const self = rel ? `${rel.name} [${c.attrs.archimateRelationship}]` : H.jarchiType(c.attrs["xsi:type"]);
    const key = unique(`${self} from ${keyOf.get(c.attrs.source) || "?"} to ${keyOf.get(c.attrs.target) || "?"}`);
    keyOf.set(c.attrs.id, key);
    lines.push(`line ${key}  ${_bendpoints(c)}  ${_attrs(c)}`.trimEnd());
  }
  return lines.sort();
}

/** @param {XmlNode} node */
function _bounds(node) {
  const b = node.children.find(c => c.tag === "bounds");
  const a = (b && b.attrs) || {};
  return `bounds ${a.x || 0},${a.y || 0},${a.width || -1},${a.height || -1}`;
}

/** @param {XmlNode} node */
function _bendpoints(node) {
  const bps = node.children.filter(c => c.tag === "bendpoint")
    .map(c => `(${c.attrs.startX || 0},${c.attrs.startY || 0},${c.attrs.endX || 0},${c.attrs.endY || 0})`);
  return `bendpoints [${bps.join(" ")}]`;
}

/**
 * The attributes, features and properties of a node that are not ids, sorted.
 * @param {XmlNode} node
 */
function _attrs(node) {
  const parts = Object.keys(node.attrs).filter(k => !ID_ATTRS.has(k)).map(k => `${k}=${JSON.stringify(node.attrs[k])}`);
  for (const c of node.children) {
    if (c.tag === "feature")  parts.push(`feature:${c.attrs.name}=${JSON.stringify(c.attrs.value || "")}`);
    if (c.tag === "property") parts.push(`property:${c.attrs.key}=${JSON.stringify(c.attrs.value || "")}`);
  }
  return parts.sort().join(" ");
}

/**
 * Lines only in a or only in b, with their count.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {string[]}  "- line" / "+ line"
 */
function diffLines(a, b) {
  /** @type {Map<string, number>} */
  const count = new Map();
  for (const l of a) count.set(l, (count.get(l) || 0) + 1);
  for (const l of b) count.set(l, (count.get(l) || 0) - 1);
  /** @type {string[]} */
  const out = [];
  for (const [l, n] of count) for (let i = 0; i < Math.abs(n); i++) out.push(`${n > 0 ? "-" : "+"} ${l}`);
  return out.sort((x, y) => (x.slice(2) < y.slice(2) ? -1 : x.slice(2) > y.slice(2) ? 1 : 0));
}

/**
 * @typedef {{ tag: string, attrs: Record<string, string>, children: XmlNode[] }} XmlNode  view_harness parseXml
 */

/**
 * Print the views under a folder that differ between two model files.
 * @param {string} oldFile
 * @param {string} newFile
 * @param {string} folder
 * @returns {number}  views that differ or are missing on one side
 */
function compareFolder(oldFile, newFile, folder) {
  const [oldTexts, newTexts] = [viewTexts(oldFile, folder), viewTexts(newFile, folder)];
  const names = [...new Set([...oldTexts.keys(), ...newTexts.keys()])].sort();
  let differ = 0;
  for (const name of names) {
    const o = oldTexts.get(name), n = newTexts.get(name);
    if (!o || !n) { differ++; _log(`== ${name}: only in ${o ? "old" : "new"}`); continue; }
    const d = diffLines(o, n);
    if (!d.length) continue;
    differ++;
    _log(`== ${name}: ${d.length} lines differ\n${d.join("\n")}`);
  }
  _log(`${names.length} views compared under "${folder}": ${differ ? `${differ} differ` : "all the same"}`);
  return differ;
}

/**
 * The committed version of the test model, written to a temp file.
 * @returns {string}  its path
 */
function _headTestModel() {
  const repo = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: __dirname, encoding: "utf8" }).trim();
  const rel = path.relative(repo, TEST_MODEL).split(path.sep).join("/");
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "compare-views-")), "head.archimate");
  fs.writeFileSync(file, execFileSync("git", ["show", `HEAD:${rel}`], { cwd: repo, maxBuffer: 1 << 28 }));
  return file;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  if (args[0] === "--text" && args.length === 3) {
    for (const [name, lines] of viewTexts(args[1], args[2])) _log(`== ${name}\n${lines.join("\n")}`);
    process.exit(0);
  }
  if (args[0] === "--head" && args.length === 1) {
    const head = _headTestModel();
    let differ = 0;
    for (const folder of HEAD_FOLDERS) differ += compareFolder(head, TEST_MODEL, folder);
    fs.rmSync(path.dirname(head), { recursive: true });
    process.exit(differ ? 1 : 0);
  }
  if (args.length !== 3) { console.error("usage: node Scripts/View/tools/compare-views.js --head | <old.archimate> <new.archimate> <folder> | --text <model.archimate> <folder>"); process.exit(2); }
  process.exit(compareFolder(args[0], args[1], args[2]) ? 1 : 0);
}

module.exports = { viewTexts, viewText, diffLines };
