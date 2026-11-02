#!/usr/bin/env node
/**
 * Write-plan fingerprints (Node, no Archi): per preset × algorithm × view × action one hash of the write
 * plan generate_view's plan() makes for the test model, with its counts. --check compares them with
 * test/expected/write-plans.txt, --write rewrites it (expected.js); --full prints the plans as JSON instead.
 * --variants: one option changed on baseline.json per algorithm where the dialog offers it (variants.js),
 * New view on views 1–4, against test/expected/write-plans-variants.txt; it ends with the variants whose
 * plan equals the base on every test view ("no effect": an option without a visible effect, or test
 * views that cannot show it).
 *
 * Run: node Scripts/View/tools/write_plans.js [model.archimate] [--variants] [--check | --write | --full] [--in-process] [--without-graphviz]
 *        --in-process: the adapters run in this process (about 10× faster), not in a Node layout process
 *        default model: Scripts/View/test/model/view-test.archimate; presets: presets/Test/baseline/*.json
 * Graphviz algorithms need the dot binary on the PATH (the harness runs it with child_process).
 */
const fs = require("fs");
const path = require("path");

const log = console.log;
console.log = () => {};   // the modules' and the plan's console output
const H    = require(path.join(__dirname, "view_harness.js"));
const Defs = require(path.join(__dirname, "..", "lib", "defs.js"));
const Expected = require(path.join(__dirname, "expected.js"));
const Variants = require(path.join(__dirname, "variants.js"));

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const full = process.argv.includes("--full");
const inProcess = process.argv.includes("--in-process");
const VIEW = path.join(__dirname, "..");
const model = H.loadModel(args[0] || path.join(VIEW, "test/model/view-test.archimate"));
const presetDir = path.join(VIEW, "presets/Test/baseline");
const presets = fs.readdirSync(presetDir).filter(f => f.endsWith(".json")).sort();
const VIEWS = ["1 Nesting", "2 Edited", "3 Network", "4 Parts"];
const ACTIONS = [Defs.ACTION.NEW_VIEW.id, Defs.ACTION.EXPAND_VIEW.id, Defs.ACTION.LAYOUT_ONLY.id];
const VARIANT_PRESET = "baseline.json";
/** @type {string[]} */
const lines = [], noEffect = [];

if (process.argv.includes("--variants")) {
  // One option changed on baseline.json, New view only: the Modify actions share the layout.
  const raw = JSON.parse(fs.readFileSync(path.join(presetDir, VARIANT_PRESET), "utf8"));
  for (const algorithm of Object.keys(Defs.ALGORITHMS).filter(a => !Expected.skipped(a))) {
    // The base as the algorithm runs it: a value it does not offer is already replaced (validatePreset).
    const base = Defs.validatePreset({ ...raw, algorithm }).params;
    const baseLines = VIEWS.map(viewName => _run("", Defs.validatePreset({ ...raw, algorithm }), algorithm, viewName, Defs.ACTION.NEW_VIEW.id));
    for (const variant of Variants.variantsOf(algorithm, base)) {
      const preset = Defs.validatePreset({ ...raw, algorithm, params: variant.params });
      const variantLines = VIEWS.map(viewName => _run(`${algorithm.padEnd(8)} ${viewName.padEnd(10)} ${variant.name.padEnd(36)}`, preset, algorithm, viewName, Defs.ACTION.NEW_VIEW.id));
      // An option has a visible effect wherever it is offered (Scripts/View/AGENTS.md, hard rule 10).
      if (!full && !(algorithm in Expected.UNSTABLE_ALGORITHMS) && variantLines.every((l, i) => l.slice(-baseLines[i].length) === baseLines[i])) {
        noEffect.push(`${algorithm.padEnd(8)} no effect on views 1–4: ${variant.name}`);
      }
    }
  }
  lines.push(...noEffect);
  if (!full) Expected.report(lines, "write-plans-variants.txt", log);
} else {
  for (const file of presets) {
    for (const algorithm of Object.keys(Defs.ALGORITHMS).filter(a => !Expected.skipped(a))) {
      const raw = JSON.parse(fs.readFileSync(path.join(presetDir, file), "utf8"));
      raw.algorithm = algorithm;
      const preset = Defs.validatePreset(raw);
      for (const viewName of VIEWS) {
        for (const action of ACTIONS) {
          _run(`${file.padEnd(16)} ${algorithm.padEnd(8)} ${viewName.padEnd(10)} ${action.padEnd(11)}`, preset, algorithm, viewName, action);
        }
      }
    }
  }
  if (!full) Expected.report(lines, "write-plans.txt", log);
}

/**
 * One run: its line (fingerprint and counts) in `lines` unless the tag is empty, or with --full its plan
 * printed. Returns the fingerprint and counts.
 * @param {string} tag
 * @param {object} preset
 * @param {string} algorithm
 * @param {string} viewName
 * @param {string} action
 */
function _run(tag, preset, algorithm, viewName, action) {
  let line = "";
  try {
    const planned = H.planView(model, H.findView(model, "Views/Test/" + viewName), preset, action, inProcess);
    const json = planned ? H.writePlanJson(planned.writePlan) : "null";
    if (full) { if (tag) log(`== ${tag}\n${json}`); return ""; }
    const wp = planned && planned.writePlan;
    line = Expected.fingerprint(algorithm, json) +
      (wp ? ` ${wp.nodes.length}n ${wp.connections.length}c ${wp.nestings.length + wp.keptNestings}nest ${wp.removedVisuals.length}rm` : "");
  } catch (e) {
    line = `ERROR ${String(e).split("\n")[0].slice(0, 80)}`;
  }
  if (tag) lines.push(`${tag} ${line}`);
  return line;
}
