/**
 * Node test of the dialog counts (lib/gui/counts.js) on the test model (test/model/view-test.archimate,
 * preset Test/baseline/baseline): a view selected in the model tree, read as the dialog reads it.
 * The totals, filter and step counts are the ones the dialog shows in Archi for the same views; the
 * nesting and reverse condition counts are the ones the dialog code before counts.js gave. Run from the repo root:
 *   node Scripts/View/tools/counts_test.js
 */
const fs   = require("fs");
const path = require("path");
const H    = require("./view_harness");
const Defs = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");
const Counts    = require("../lib/gui/counts");

const VIEW = path.join(__dirname, "..");
const model  = H.loadModel(path.join(VIEW, "test/model/view-test.archimate"));
const preset = Defs.validatePreset(JSON.parse(fs.readFileSync(path.join(VIEW, "presets/Test/baseline/baseline.json"), "utf8")));
const params = Defs.effectiveParams(preset);

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

/**
 * A view selected in the model tree, as the dialog reads it: its elements, its drawn relations,
 * then its diagram objects by diagram type (rawModelObjects); its element visuals described.
 */
function modelTreeSelection(viewName) {
  const snapshot = H.readSnapshot(model, H.findView(model, "Views/Test/" + viewName), Defs.ACTION.LAYOUT_ONLY.id);
  const relations = [...new Map(snapshot.existing.visualRelations.map(v => [v.concept.id, v.concept])).values()];
  const diagramObjects = Object.keys(Defs.DIAGRAM_TYPES).flatMap(t => snapshot.diagramObjects.filter(o => o.type === t));
  return { objects: [...snapshot.elements, ...relations, ...diagramObjects], visuals: snapshot.visuals, relationsOf: snapshot.relationsOf,
           diagramBlockOf: snapshot.diagramBlockOf, blockContents: snapshot.blockContents, sourceVisualElements: snapshot.existing.visualElements };
}

/** The rows a condition table shows: a filter list shows the default condition when it has none. */
function shown(kind, conditions, filterList) {
  const out = conditions.map(r => Object.assign(ConditionLists.defaultCondition(kind), r));
  return filterList && !out.length ? [ConditionLists.defaultCondition(kind)] : out;
}

/** The count input of the dialog with the preset's conditions in its tables. */
function countInput(selection, expandSnapshot) {
  const f = preset.filter;
  return {
    objects: selection.objects,
    filter: f,
    filterTables: { element: shown("element", f.elementConditions, true), diagram: shown("diagram", f.diagramConditions, true),
                    relation: shown("relation", f.relationConditions, true) },
    steps: preset.relatedElements.steps.map(step => ({ step, displayedConditions: shown("step", step.conditions, true), cache: new Map() })),
    params: { nestingConditions: params.nestingConditions, reverseConditions: params.reverseConditions },
    layoutConditions: { nesting: shown("relation", params.nestingConditions, false), reverse: shown("relation", params.reverseConditions, false) },
    diagramBlockOf: selection.diagramBlockOf,
    blockContents: selection.blockContents,
    sourceVisualElements: selection.sourceVisualElements,
    relationsOf: selection.relationsOf,
    visuals: selection.visuals,
    expandSnapshot,
  };
}

/** The counts the dialog shows, without the step candidates (property lists). */
function counts(viewName, expandSnapshot) {
  const c = Counts.dialogCounts(countInput(modelTreeSelection(viewName), expandSnapshot || null));
  return {
    filterConditions: c.filterConditions,
    steps: c.steps.map(s => ({ elements: s.elements, relations: s.relations, runs: s.runs, capped: s.capped, conditionCounts: s.conditionCounts })),
    predicted: { elements: c.predicted.elements.length, relations: c.predicted.relations.length },
    view: c.view, layoutConditions: c.layoutConditions, expandView: c.expandView,
  };
}

// The step adds nothing: view 1 has no relations to anything outside it.
eq(counts("1 Nesting"), {
  filterConditions: { element: [{ count: 12 }], diagram: [{ count: 4 }], relation: [{ count: 13 }] },
  steps: [{ elements: 0, relations: 0, runs: 0, capped: false, conditionCounts: [{ elements: 0, relations: 0 }] }],
  predicted: { elements: 12, relations: 13 },
  view: { elements: 12, containers: 5, nestedElements: 4, standalones: 3, extraOccurrences: 1, relations: 13, nestings: 6, connections: 7, diagramObjects: 3, diagramConnections: 1 },
  layoutConditions: {
    nesting: [{ relations: 4, nested: 2 }, { relations: 3, nested: 3 }, { relations: 1, nested: 1 }],
    reverse: [{ relations: 1 }, { relations: 1 }],
    multiParent: 0, circular: 2, cycles: 1, selfLoops: 0,
  },
  expandView: null,
}, "1 Nesting, model tree");

// The step adds Reached component and its relation, which are on no view.
eq(counts("2 Edited"), {
  filterConditions: { element: [{ count: 14 }], diagram: [{ count: 4 }], relation: [{ count: 14 }] },
  steps: [{ elements: 1, relations: 1, runs: 1, capped: true, conditionCounts: [{ elements: 1, relations: 1 }] }],
  predicted: { elements: 15, relations: 15 },
  view: { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
  layoutConditions: {
    nesting: [{ relations: 4, nested: 2 }, { relations: 3, nested: 3 }, { relations: 1, nested: 1 }],
    reverse: [{ relations: 1 }, { relations: 1 }],
    multiParent: 0, circular: 2, cycles: 1, selfLoops: 0,
  },
  expandView: null,
}, "2 Edited, model tree");

// The Expand view totals come from composeObjectSet on what readSelection read (compose_test.js).
const expandSnapshot = H.readSnapshot(model, H.findView(model, "Views/Test/2 Edited"), Defs.ACTION.EXPAND_VIEW.id);
eq(counts("2 Edited", expandSnapshot).expandView,
  { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
  "2 Edited, Expand view totals");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all counts tests passed");
