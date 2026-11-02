#!/usr/bin/env node
/**
 * Write-plan fingerprints (Node, no Archi): per preset × algorithm × view × action one hash of the write
 * plan generate_view's plan() makes for the test model, with its counts. --check compares them with
 * test/expected/write-plans.txt, --write rewrites it (expected.js); --full prints the plans as JSON instead.
 *
 * Run: node Scripts/View/tools/write_plans.js [model.archimate] [--check | --write | --full] [--in-process]
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

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const full = process.argv.includes("--full");
const inProcess = process.argv.includes("--in-process");
const VIEW = path.join(__dirname, "..");
const model = H.loadModel(args[0] || path.join(VIEW, "test/model/view-test.archimate"));
const presetDir = path.join(VIEW, "presets/Test/baseline");
const presets = fs.readdirSync(presetDir).filter(f => f.endsWith(".json")).sort();
const VIEWS = ["1 Nesting", "2 Edited", "3 Network"];
const ACTIONS = [Defs.ACTION.NEW_VIEW.id, Defs.ACTION.EXPAND_VIEW.id, Defs.ACTION.LAYOUT_ONLY.id];
const lines = [];

for (const file of presets) {
  for (const algorithm of Object.keys(Defs.ALGORITHMS)) {
    const raw = JSON.parse(fs.readFileSync(path.join(presetDir, file), "utf8"));
    raw.algorithm = algorithm;
    const preset = Defs.validatePreset(raw);
    for (const viewName of VIEWS) {
      for (const action of ACTIONS) {
        const tag = `${file.padEnd(16)} ${algorithm.padEnd(8)} ${viewName.padEnd(10)} ${action.padEnd(11)}`;
        let line;
        try {
          const planned = H.planView(model, H.findView(model, "Views/Test/" + viewName), preset, action, inProcess);
          const json = planned ? H.writePlanJson(planned.writePlan) : "null";
          if (full) { log(`== ${tag}\n${json}`); continue; }
          const wp = planned && planned.writePlan;
          line = Expected.fingerprint(algorithm, json) +
            (wp ? ` ${wp.nodes.length}n ${wp.connections.length}c ${wp.nestings.length + wp.keptNestings}nest ${wp.removedVisuals.length}rm` : "");
        } catch (e) {
          line = `ERROR ${String(e).split("\n")[0].slice(0, 80)}`;
        }
        lines.push(`${tag} ${line}`);
      }
    }
  }
}
if (!full) Expected.report(lines, "write-plans.txt", log);
