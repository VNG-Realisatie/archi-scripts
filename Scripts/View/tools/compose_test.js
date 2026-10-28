/**
 * Node test of composeObjectSet on the test model (test/model/view-test.archimate, preset
 * Test/baseline/baseline): the object set and the predicted counts per view and action. The
 * numbers are the ones the Archi baseline and the dialog show for the same views. Run from the repo root:
 *   node Scripts/View/tools/compose_test.js
 */
const fs   = require("fs");
const path = require("path");
const H    = require("./view_harness");
const Defs = require("../lib/defs");
const Pipeline = require("../lib/selection_pipeline");

const VIEW = path.join(__dirname, "..");
const model  = H.loadModel(path.join(VIEW, "test/model/view-test.archimate"));
const validated = Defs.validatePreset(JSON.parse(fs.readFileSync(path.join(VIEW, "presets/Test/baseline/baseline.json"), "utf8")));
const preset = { ...validated, params: Defs.effectiveParams(validated) };

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

/** Counts of the composed object set for one view and action. */
function compose(viewName, action) {
  const snapshot = H.readSnapshot(model, H.findView(model, "Views/Test/" + viewName), action.id);
  const c = Pipeline.composeObjectSet(snapshot, preset, action.id);
  const os = c.objectSet;
  return {
    elements: os.elements.length, relations: os.relations.length, diagramObjects: os.diagramObjects.length,
    diagramConnections: os.diagramConnections.length, inDiagramBlocks: os.diagramBlockOf.size,
    steps: c.stepCounts.map(s => [s.elems, s.rels]), view: c.view,
  };
}

const { NEW_VIEW, LAYOUT_ONLY, EXPAND_VIEW } = Defs.ACTION;

// The group "Frame" is copied with its note: one diagram-block.
eq(compose("1 Nesting", NEW_VIEW), {
  elements: 12, relations: 13, diagramObjects: 2, diagramConnections: 1, inDiagramBlocks: 1, steps: [[0, 0]],
  view: { elements: 12, containers: 5, nestedElements: 4, standalones: 3, extraOccurrences: 1, relations: 13, nestings: 6, connections: 7, diagramObjects: 3, diagramConnections: 1 },
}, "1 Nesting, NEW_VIEW");

// The step adds Reached component and its relation, which are on no view. "Data in block" is only
// inside the diagram-block "Block": written with it, not laid out, counted as a standalone.
eq(compose("2 Edited", NEW_VIEW), {
  elements: 14, relations: 15, diagramObjects: 2, diagramConnections: 1, inDiagramBlocks: 2, steps: [[1, 1]],
  view: { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
}, "2 Edited, NEW_VIEW");

// Data in block sits in a diagram-block: not laid out, counted as a standalone. The relations are the ones drawn on the view.
eq(compose("2 Edited", LAYOUT_ONLY), {
  elements: 13, relations: 14, diagramObjects: 2, diagramConnections: 1, inDiagramBlocks: 2, steps: [],
  view: { elements: 14, containers: 5, nestedElements: 4, standalones: 5, extraOccurrences: 1, relations: 14, nestings: 6, connections: 8, diagramObjects: 3, diagramConnections: 1 },
}, "2 Edited, LAYOUT_ONLY");

eq(compose("2 Edited", EXPAND_VIEW), {
  elements: 14, relations: 15, diagramObjects: 2, diagramConnections: 1, inDiagramBlocks: 2, steps: [[1, 1]],
  view: { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
}, "2 Edited, EXPAND_VIEW");

eq(compose("3 Network", NEW_VIEW), {
  elements: 20, relations: 21, diagramObjects: 0, diagramConnections: 0, inDiagramBlocks: 0, steps: [[0, 0]],
  view: { elements: 20, containers: 0, nestedElements: 0, standalones: 20, extraOccurrences: 0, relations: 21, nestings: 0, connections: 21, diagramObjects: 0, diagramConnections: 0 },
}, "3 Network, NEW_VIEW");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all compose tests passed");
