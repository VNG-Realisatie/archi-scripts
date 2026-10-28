#!/usr/bin/env node
/**
 * Layout digests for a checkout of this repo: per preset × algorithm one hash of the LayoutResult
 * the View pipeline produces for a view of a model file (Node, no Archi). Run it on two checkouts
 * and diff the output to show a change leaves layouts as they were.
 *
 * Run: node tools/compare-layouts.js <checkout root> <model.archimate> "<folder/…/view>" [preset.json…]
 *        default presets: every Scripts/View/presets/*.json of the checkout
 *        --keep-concept-id   include conceptId in the hash (left out by default)
 * Graphviz algorithms report ERROR in Node (the adapter needs Java's ProcessBuilder).
 *
 * Compare with the current HEAD:
 *   git worktree add /tmp/old HEAD
 *   node tools/compare-layouts.js /tmp/old  model.archimate "Views/Test/X" > old.txt
 *   node tools/compare-layouts.js .         model.archimate "Views/Test/X" > new.txt
 *   diff old.txt new.txt; git worktree remove /tmp/old
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const keepConceptId = process.argv.includes("--keep-concept-id");
if (args.length < 3) { console.error("usage: node tools/compare-layouts.js <checkout root> <model.archimate> <view path> [preset.json…]"); process.exit(2); }
const [root, modelFile, viewPath, ...presetArgs] = args;

// Quiet the "Loading …" lines and engine progress the modules print.
const log = console.log;
console.log = () => {};
const H    = require(path.resolve(root, "Scripts/View/tools/view_harness.js"));
const Defs = require(path.resolve(root, "Scripts/View/lib/defs.js"));

const presetDir = path.resolve(root, "Scripts/View/presets");
const presets = presetArgs.length ? presetArgs.map(p => path.resolve(p))
  : fs.readdirSync(presetDir).filter(f => f.endsWith(".json") && f !== "_session.json").sort().map(f => path.join(presetDir, f));
const algorithms = Object.keys(Defs.ALGORITHMS);

const model = H.loadModel(modelFile);
const view = H.findView(model, viewPath);

/** @param {{nodes: object[], edges: {conceptId?: string}[], viewWidth: number, viewHeight: number}} r */
const digest = r => crypto.createHash("sha1").update(JSON.stringify({
  nodes: r.nodes,
  edges: keepConceptId ? r.edges : r.edges.map(e => { const { conceptId, ...rest } = e; return rest; }),
  w: r.viewWidth, h: r.viewHeight,
})).digest("hex").slice(0, 12);

for (const file of presets) {
  for (const algorithm of algorithms) {
    let line;
    try {
      const raw = JSON.parse(fs.readFileSync(file, "utf8"));
      raw.algorithm = algorithm;
      const preset = Defs.validatePreset(raw);
      preset.params = Defs.effectiveParams(preset);   // masked, as generate_view does
      const graph = H.layoutGraph(preset, H.viewContents(model, view, {}));
      const result = H.layout(graph);
      line = `${digest(result)} ${result.nodes.length}n ${result.edges.length}e`;
    } catch (e) {
      line = `ERROR ${String(e).split("\n")[0].slice(0, 80)}`;
    }
    log(`${path.basename(file).padEnd(24)} ${algorithm.padEnd(8)} ${line}`);
  }
}
