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
/** The global filter table with no conditions here shows an element and a relation default row, so both are counted. */
const shownFilter = conditions => conditions.length ? shown("filter", conditions, true)
  : [ConditionLists.defaultCondition("filter"), { ...ConditionLists.defaultCondition("filter"), applyTo: "relation" }];

/** The count input of the dialog with the preset's conditions in its tables. */
function countInput(selection, expandSnapshot) {
  const f = preset.filter;
  return {
    objects: selection.objects,
    filter: f,
    filterTables: { filter: shownFilter(f.conditions), diagram: shown("diagram", f.diagramConditions, true) },
    steps: preset.relatedElements.steps.map(step => ({ step, displayedConditions: shown("step", step.conditions, true), cache: new Map() })),
    params: { nestingConditions: params.nestingConditions, reverseConditions: params.reverseConditions },
    algorithm: preset.algorithm,
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
  filterConditions: { filter: [{ count: 12 }, { count: 13 }], diagram: [{ count: 4 }] },
  steps: [{ elements: 0, relations: 0, runs: 0, capped: false, conditionCounts: [{ elements: 0, relations: 0 }] }],
  predicted: { elements: 12, relations: 13 },
  view: { elements: 12, containers: 5, nestedElements: 4, standalones: 3, extraOccurrences: 1, relations: 13, nestings: 6, connections: 7, diagramObjects: 3, diagramConnections: 1 },
  layoutConditions: {
    nesting: [{ relations: 4, nested: 2 }, { relations: 3, nested: 3 }, { relations: 1, nested: 1 }],
    reverse: [{ relations: 1 }, { relations: 1 }],
    multiParent: 0, inDiagramBlock: 0, circular: 2, cycles: 1, selfLoops: 0, deep: 0,
  },
  expandView: null,
}, "1 Nesting, model tree");

// The step adds Reached component and its relation, which are on no view.
eq(counts("2 Edited"), {
  filterConditions: { filter: [{ count: 14 }, { count: 14 }], diagram: [{ count: 4 }] },
  steps: [{ elements: 1, relations: 1, runs: 1, capped: true, conditionCounts: [{ elements: 1, relations: 1 }] }],
  predicted: { elements: 15, relations: 15 },
  view: { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
  layoutConditions: {
    nesting: [{ relations: 4, nested: 2 }, { relations: 3, nested: 3 }, { relations: 1, nested: 1 }],
    reverse: [{ relations: 1 }, { relations: 1 }],
    multiParent: 0, inDiagramBlock: 0, circular: 2, cycles: 1, selfLoops: 0, deep: 0,
  },
  expandView: null,
}, "2 Edited, model tree");

// The Expand view totals come from composeObjectSet on what readSelection read (compose_test.js).
const expandSnapshot = H.readSnapshot(model, H.findView(model, "Views/Test/2 Edited"), Defs.ACTION.EXPAND_VIEW.id);
eq(counts("2 Edited", expandSnapshot).expandView,
  { elements: 15, containers: 5, nestedElements: 4, standalones: 6, extraOccurrences: 1, relations: 15, nestings: 6, connections: 9, diagramObjects: 3, diagramConnections: 1 },
  "2 Edited, Expand view totals");

// A step block keeps its count cache across recounts: a changed element filter changes the step's input,
// so its condition counts must follow, not come from the cache. An Include of a type the view does not
// hold leaves no input: the step adds nothing.
{
  const selection = modelTreeSelection("2 Edited");
  const before = countInput(selection, null);
  Counts.dialogCounts(before);
  const filter = { ...preset.filter, conditions: [{ ...ConditionLists.defaultCondition("filter"), source: "location" }] };
  const after = { ...countInput(selection, null), filter, steps: before.steps };
  eq(Counts.dialogCounts(after).steps.map(s => s.conditionCounts), [[{ elements: 0, relations: 0 }]], "2 Edited, step count cache after a filter change");
}

// A repeated step counts per run: the runs add up to what the step adds, and a condition shows its count per run.
{
  const input = countInput(modelTreeSelection("6 GEMMA"), null);
  const all = { ...ConditionLists.defaultCondition("step"), on: true };
  const noComposition = { ...all, mode: "exclude", relation: "composition-relationship" };
  const conditions = [all, noComposition];
  input.steps = [{ step: { repeat: Defs.REPEAT_UNTIL_NOTHING_NEW, conditions }, displayedConditions: conditions, cache: new Map() }];
  const s = Counts.dialogCounts(input).steps[0];
  eq({ elements: s.elements, relations: s.relations, runAdds: s.runAdds, conditionCounts: s.conditionCounts }, {
    elements: 35, relations: 49,
    runAdds: [{ elements: 6, relations: 6 }, { elements: 12, relations: 14 }, { elements: 12, relations: 22 }, { elements: 4, relations: 6 }, { elements: 1, relations: 1 }],
    conditionCounts: [{ elements: "6 + 12 + 12 + 4 + 1", relations: "6 + 14 + 22 + 6 + 1" }, { elements: "0 + 0 + 0 + 0 + 0", relations: "0 + 0 + 0 + 0 + 0" }],
  }, "6 GEMMA, repeated step per run");
}

// ── Nesting style table: parents and children per condition, as the appearance pass styles the written view ──────
{
  global.Java = global.Java || { type: n => n.endsWith("Files") ? { readString: p => fs.readFileSync(String(p), "utf8"), exists: p => fs.existsSync(String(p)) } : { get: p => p } };
  const Appearance = require("../lib/appearance");
  const gemma = Defs.validatePreset(JSON.parse(fs.readFileSync(path.join(VIEW, "presets/Test/gemma/Bedrijfsfuncties template.json"), "utf8")));
  const gp = Defs.effectiveParams(gemma);
  const sel = modelTreeSelection("6 GEMMA");
  const input = { ...countInput(sel, null), filter: gemma.filter,
    steps: gemma.relatedElements.steps.map(step => ({ step, displayedConditions: shown("step", step.conditions, true), cache: new Map() })),
    params: { nestingConditions: gp.nestingConditions, reverseConditions: gp.reverseConditions }, algorithm: gemma.algorithm,
    layoutConditions: null, viewTemplate: H.readViewTemplate(model, gp.viewTemplate) };
  const quiet = console.log; console.log = () => {};
  const c = Counts.dialogCounts(input);
  console.log = quiet;
  const nl = gemma.appearance.nestingLevel;
  const got = Counts.nestingStyleCounts(nl.conditions, c.nestingView, sel.relationsOf);

  // The same chains on the New view the pipeline plans.
  console.log = () => {};
  const planned = H.planView(model, H.findView(model, "Views/Test/6 GEMMA"), gemma, Defs.ACTION.NEW_VIEW.id, true);
  console.log = quiet;
  const nodes = planned.writePlan.nodes.filter(n => "element" in n);
  const byNode = new Map(nodes.map(n => [n.node, n]));
  const depth = n => (n.parent ? 1 + depth(byNode.get(n.parent)) : 0);
  const parents = new Set(nodes.map(n => n.parent));
  const chainNodes = nodes.map(n => {
    const parentEl = n.parent ? byNode.get(n.parent).element : null;
    return { id: n.node, parentId: n.parent || null, type: n.element.type, element: n.element,
             rels: parentEl ? Appearance.relsBetween(parentEl, n.element, sel.relationsOf) : [], depth: depth(n), isContainer: parents.has(n.node) };
  });
  const { styles } = Appearance.followNestingChains(chainNodes, nl.conditions);
  const expected = nl.conditions.map((r, i) => {
    const mine = [...styles].filter(([, st]) => st.nr === i + 1).map(([id]) => id);
    return { parents: new Set(mine.map(id => byNode.get(id).parent).filter(Boolean)).size, children: mine.length };
  });
  eq(got.counts, expected, "nesting style: parents and children per condition match the chains on the planned view");
  eq(got.counts.every(x => x.children > 0), true, "nesting style: every condition of the GEMMA preset styles something");

  const tplConditions = nl.conditions.map((r, i) => (i === 2 ? { ...r, color: "template" } : r));
  const tpl = Counts.nestingStyleCounts(tplConditions, c.nestingView, sel.relationsOf);
  eq([...tpl.warnings.keys()], [2], "nesting style: ⚠ on Template for elements not on the view template (the services)");
  const noTpl = Counts.nestingStyleCounts(tplConditions, { ...c.nestingView, viewTemplate: null }, sel.relationsOf);
  eq(noTpl.warnings.size, 0, "nesting style: no ⚠ on Template without a view template in use (the dialog shows the fallback)");
  const same = Counts.nestingStyleCounts(nl.conditions.map((r, i) => (i === 0 ? { ...r, color: "same" } : r)), c.nestingView, sel.relationsOf);
  eq(/root container/.test(same.warnings.get(0) || ""), true, "nesting style: ⚠ on Same as parent for a root container");
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("all counts tests passed");
