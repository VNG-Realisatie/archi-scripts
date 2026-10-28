#!/usr/bin/env node
/**
 * Write-plan digests (Node, no Archi): per preset × algorithm × view × action one hash of the write
 * plan generate_view's plan() makes for the test model. Run it on two checkouts and diff the output
 * to show a change leaves what the writer does as it was; --full prints the plans as JSON instead.
 *
 * Run: node Scripts/View/tools/write_plans.js [model.archimate] [--full]
 *        default model: Scripts/View/test/model/view-test.archimate; presets: presets/Test/baseline/*.json
 * Graphviz algorithms need the dot binary on the PATH (the harness runs it with child_process).
 *
 * Compare with the current HEAD:
 *   git worktree add /tmp/old HEAD
 *   node /tmp/old/Scripts/View/tools/write_plans.js > old.txt
 *   node Scripts/View/tools/write_plans.js > new.txt
 *   diff old.txt new.txt; git worktree remove /tmp/old
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const log = console.log;
console.log = () => {};   // the modules' and the plan's console output
const H    = require(path.join(__dirname, "view_harness.js"));
const Defs = require(path.join(__dirname, "..", "lib", "defs.js"));

const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const full = process.argv.includes("--full");
const VIEW = path.join(__dirname, "..");
const model = H.loadModel(args[0] || path.join(VIEW, "test/model/view-test.archimate"));
const presetDir = path.join(VIEW, "presets/Test/baseline");
const presets = fs.readdirSync(presetDir).filter(f => f.endsWith(".json")).sort();
const VIEWS = ["1 Nesting", "2 Edited", "3 Network"];
const ACTIONS = [Defs.ACTION.NEW_VIEW.id, Defs.ACTION.EXPAND_VIEW.id, Defs.ACTION.LAYOUT_ONLY.id];

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
          const planned = H.planView(model, H.findView(model, "Views/Test/" + viewName), preset, action);
          const json = planned ? H.writePlanJson(planned.writePlan) : "null";
          if (full) { log(`== ${tag}\n${json}`); continue; }
          const wp = planned && planned.writePlan;
          line = `${crypto.createHash("sha1").update(json).digest("hex").slice(0, 12)}` +
            (wp ? ` ${wp.nodes.length}n ${wp.connections.length}c ${wp.nestings.length + wp.keptNestings}nest ${wp.removedVisuals.length}rm` : "");
        } catch (e) {
          line = `ERROR ${String(e).split("\n")[0].slice(0, 80)}`;
        }
        log(`${tag} ${line}`);
      }
    }
  }
}
