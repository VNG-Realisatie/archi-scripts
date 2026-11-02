#!/usr/bin/env node
/**
 * Layout fingerprints for a checkout of this repo: per preset × algorithm one hash of the LayoutResult
 * the View pipeline produces for a view of a model file (Node, no Archi), with its counts.
 *
 * The layout is the one a New view run makes (the harness's planView on the view selected on its canvas: filter,
 * steps, diagram objects, nesting), so a checkout needs a harness with planView (from milestone 3 of the
 * testability refactor).
 *
 * Run: node tools/compare-layouts.js --check | --write
 *        this checkout, the test model's views 1–3, presets/Test/baseline/*.json, against
 *        Scripts/View/test/expected/layouts.txt (Scripts/View/tools/expected.js)
 *      node tools/compare-layouts.js <checkout root> <model.archimate> "<folder/…/view>" [preset.json…]
 *        default presets: every Scripts/View/presets/*.json of the checkout
 *        --keep-concept-id   include conceptId in the hash (left out by default)
 *        --in-process        the adapters run in this process, not in a Node layout process
 * Graphviz algorithms need the dot binary on the PATH (the harness runs it with child_process).
 *
 * Compare two checkouts on another model or view:
 *   git worktree add /tmp/old HEAD
 *   node tools/compare-layouts.js /tmp/old  model.archimate "Views/Test/X" > old.txt
 *   node tools/compare-layouts.js .         model.archimate "Views/Test/X" > new.txt
 *   diff old.txt new.txt; git worktree remove /tmp/old
 */
const fs = require("fs");
const path = require("path");

const Expected = require(path.join(__dirname, "../Scripts/View/tools/expected.js"));

const TEST_VIEWS = ["1 Nesting", "2 Edited", "3 Network"];
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const keepConceptId = process.argv.includes("--keep-concept-id");
const inProcess = process.argv.includes("--in-process");
const testSet = process.argv.includes("--check") || process.argv.includes("--write");
if (!testSet && args.length < 3) { console.error("usage: node tools/compare-layouts.js --check | --write | <checkout root> <model.archimate> <view path> [preset.json…]"); process.exit(2); }
const [root, modelFile, viewPath, ...presetArgs] = testSet
  ? [path.join(__dirname, ".."), path.join(__dirname, "../Scripts/View/test/model/view-test.archimate"), ""]
  : args;

// Quiet the "Loading …" lines and engine progress the modules print.
const log = console.log;
console.log = () => {};
const H    = require(path.resolve(root, "Scripts/View/tools/view_harness.js"));
const Defs = require(path.resolve(root, "Scripts/View/lib/defs.js"));

const presetDir = path.resolve(root, testSet ? "Scripts/View/presets/Test/baseline" : "Scripts/View/presets");
const presets = presetArgs.length ? presetArgs.map(p => path.resolve(p))
  : fs.readdirSync(presetDir).filter(f => f.endsWith(".json") && f !== "_session.json").sort().map(f => path.join(presetDir, f));
const algorithms = Object.keys(Defs.ALGORITHMS);

const model = H.loadModel(modelFile);

/**
 * @param {string} algorithm
 * @param {{nodes: object[], edges: {conceptId?: string}[]}} r
 */
const resultFingerprint = (algorithm, r) => Expected.fingerprint(algorithm, JSON.stringify({
  nodes: r.nodes,
  edges: keepConceptId ? r.edges : r.edges.map(e => { const { conceptId, ...rest } = e; return rest; }),
}));

/**
 * One line per preset × algorithm for a view.
 * @param {object} view
 * @param {string} prefix  put before each line
 */
function viewLines(view, prefix) {
  const lines = [];
  for (const file of presets) {
    for (const algorithm of algorithms) {
      let line;
      try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));
        raw.algorithm = algorithm;
        const preset = Defs.validatePreset(raw);
        const planned = H.planView(model, view, preset, Defs.ACTION.NEW_VIEW.id, inProcess);
        if (!planned) throw new Error("nothing to place");
        const result = planned.result;
        line = `${resultFingerprint(algorithm, result)} ${result.nodes.length}n ${result.edges.length}e`;
      } catch (e) {
        line = `ERROR ${String(e).split("\n")[0].slice(0, 80)}`;
      }
      lines.push(`${prefix}${path.basename(file).padEnd(24)} ${algorithm.padEnd(8)} ${line}`);
    }
  }
  return lines;
}

if (testSet) {
  Expected.report(TEST_VIEWS.flatMap(v => viewLines(H.findView(model, "Views/Test/" + v), v.padEnd(10) + " ")), "layouts.txt", log);
} else {
  viewLines(H.findView(model, viewPath), "").forEach(l => log(l));
}
