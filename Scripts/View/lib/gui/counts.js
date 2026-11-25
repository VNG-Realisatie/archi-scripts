/**
 * Dialog counts: the numbers the View dialog shows, computed without widgets (pure; Node loads it).
 *
 * dialogCounts counts what the current settings put on a view: the per-condition counts of the filter,
 * step, nesting and reverse tables, what each step adds, and the totals line. It follows the
 * pipeline (selection_pipeline.js, nesting.js), so a count matches what the action writes.
 * dialog_main.js reads the conditions from its tables, calls it and puts the numbers on the widgets.
 * Also here: selection counts, property lists, the style condition sentence and the saved-preset compare.
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading counts.js");

/** @type {typeof import("../defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../selection_pipeline")} */
const Pipeline  = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("../nesting")} */
const Nesting   = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("../view_template")} */
const ViewTemplate = require(REPO_ROOT + "View/lib/view_template");
/** @type {typeof import("../appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");
/** @type {typeof import("../table")} */
const Table      = require(REPO_ROOT + "View/lib/table");

const { ACTION, DIAGRAM_TYPES, compareNames } = Defs;

// A step's condition count cache is emptied when it holds more entries than this.
const STEP_COUNT_CACHE_MAX = 500;

// ── Totals ────────────────────────────────────────────────────────────────────

/**
 * Everything the dialog's counters show for the current settings.
 * @param {DialogCountInput} input  `objects` not empty (the caller shows nothing for an empty selection)
 * @returns {DialogCounts}
 */
function dialogCounts(input) {
  const { objects, filter, relationsOf } = input;

  // Filtered base — only the elements survive the element filter and feed the steps.
  // Explicit relations in the selection are not counted: the view's relations are derived
  // from the elements (rels-between-filtered-elements, computed below).
  /** @type {DiagramObject[]} */
  const keptDiagramObjects = [];
  /** @type {ArchiElement[]} */
  const filteredElements = [];
  for (const o of objects) {
    const t = o.type || "";
    if (t.endsWith("-relationship")) continue;
    // Cast: a diagram type in the selection is a diagram object.
    if (t in DIAGRAM_TYPES) { if (Pipeline.diagramPasses(filter.diagramConditions, t)) keptDiagramObjects.push(/** @type {DiagramObject} */ (o)); }
    // Casts: neither a relation nor a diagram object, so an element.
    else if (ConditionLists.matchElement(filter.conditions, /** @type {ArchiElement} */ (o))) filteredElements.push(/** @type {ArchiElement} */ (o));
  }
  // As the pipeline: the view template's diagram objects are always on the view, with their diagram-blocks.
  const viewTemplate = input.viewTemplate && (input.params.nestingConditions || []).length ? input.viewTemplate : null;
  const blocksRead = viewTemplate ? {
    diagramBlockOf:       new Map([...input.diagramBlockOf, ...viewTemplate.diagramBlockOf]),
    blockContents:        new Map([...input.blockContents, ...viewTemplate.blockContents]),
    sourceVisualElements: [...input.sourceVisualElements, ...viewTemplate.sourceVisualElements],
  } : input;
  if (viewTemplate) {
    const kept = new Set(keptDiagramObjects.map(o => String(o.id)));
    for (const o of viewTemplate.diagramObjects) if (!kept.has(String(o.id))) keptDiagramObjects.push(o);
  }
  // As the pipeline: a diagram connection is a line; a diagram-block is laid out as one and written with its contents.
  const inBlock = Pipeline.keptDiagramBlocks(blocksRead.diagramBlockOf, keptDiagramObjects);
  const diagramNodes = keptDiagramObjects.filter(o => o.type !== "diagram-model-connection" && !inBlock.has(String(o.id)));
  const diagramConnections = keptDiagramObjects.filter(o => o.type === "diagram-model-connection");

  // Collect relations incrementally: base uses the global relation conditions; each step its own
  // conditions — mirrors the pipeline exactly so Adds: counters match the view.
  // seenRelIds is threaded across calls to prevent double-counting.
  /** @type {Set<string>} */
  const seenRelIds = new Set();
  const finalRels  = Pipeline.findRelationsBetween(relationsOf, filteredElements, Pipeline.globalRelationMatch(filter), seenRelIds);

  const filterConditions = _filterTableCounts(input, filteredElements);

  // Walk steps under chain semantics: step 1's input is the filtered base; step N
  // (N≥2)'s input is step N-1's added elements only. An empty step terminates the chain.
  /** @type {DialogStepCounts[]} */
  const steps = [];
  let cumulative = filteredElements.slice();
  let stepInput  = filteredElements.slice();
  // A step's input, cumulative and seen follow from the selection and relationsOf (fixed while the dialog
  // is open), the element and relation filter and the steps before it: those settings key its count cache.
  // A setting the chain comes to depend on joins this key.
  let chainKey = JSON.stringify(filter.conditions);
  /** @type {ArchiElement[][]} */
  const hops = [];
  for (const s of input.steps) {
    const seenBefore = new Set(seenRelIds);
    const { added, hops: stepHops, rels: stepRels, cumulative: newCumul, runs, capped, candidates } =
      Pipeline.expandStepWithRelations(relationsOf, stepInput, s.step, cumulative, seenRelIds);
    stepHops.forEach(h => hops.push(h));
    const { conditionCounts, runAdds } = stepConditionCounts(relationsOf, s, stepInput, cumulative, seenBefore, chainKey);
    steps.push({ elements: added.length, relations: stepRels.length, runs, capped, candidates, conditionCounts, runAdds });
    cumulative = newCumul;
    stepRels.forEach(r => finalRels.push(r));
    stepInput = added;                                                       // chain advance
    chainKey += JSON.stringify([s.step.repeat, s.step.conditions]);
  }

  // Predict view-level counts (duplicates, containers) using the current params: the totals
  // line must reflect what the writer will produce.
  // An element that appears only inside a diagram-block is written with it, not laid out, as in the pipeline.
  // The view template: its elements always on the view, the selection filling it (lib/view_template.js).
  if (viewTemplate) {
    const filled = ViewTemplate.compose(cumulative, finalRels, viewTemplate, relationsOf, input.params);
    cumulative = filled.elements;
    finalRels.splice(0, finalRels.length, ...filled.relations);
  }
  const onlyInBlocks = Pipeline.mapDiagramBlockVisuals(blocksRead.sourceVisualElements, inBlock);
  const onView = cumulative.filter(el => !onlyInBlocks.has(el.id));
  const diagram = {
    objects:     diagramNodes.length + Pipeline.countDiagramObjectsInBlocks(blocksRead.blockContents, inBlock),
    connections: Pipeline.countDiagramConnections(diagramConnections, diagramNodes, onView, inBlock),
    elements:    onlyInBlocks.size,
  };
  // The nesting is resolved once, for the totals and the Layout tab's counts.
  const joinRun = Pipeline.joinRuns(hops);
  const split   = Nesting.splitNestingRels(finalRels, input.params);
  const nesting = Nesting.resolveNesting(onView, split.nestingRels, input.params, input.algorithm, input.visuals, joinRun);
  const view = Nesting.countView(onView, finalRels, diagram, input.algorithm, split.connectionRels, nesting);
  const layoutConditions = input.layoutConditions ? layoutConditionCounts(input.layoutConditions, finalRels, nesting, onView) : null;

  // Expand view: composed by the pipeline itself from what it read before the dialog opened.
  const expandView = input.expandSnapshot
    ? Pipeline.composeObjectSet(input.expandSnapshot, {
        algorithm: input.algorithm,
        filter,
        relatedElements: { steps: input.steps.map(s => s.step) },
        params: input.params,
      }, ACTION.EXPAND_VIEW.id).view
    : null;

  return { filterConditions, steps, predicted: { elements: cumulative, relations: finalRels }, view, layoutConditions, expandView,
           nestingView: { elements: onView, nesting, viewTemplate } };
}

// ── Nesting style counts ──────────────────────────────────────────────────────

/**
 * The nesting style table's counts and ⚠ on the predicted view, through the nesting chains the
 * appearance pass follows: per condition the parents of the nesting steps it styles ("parents") and
 * the elements it styles directly, root containers included ("children"); ⚠ where Template meets
 * an element without a template look (a view template in use), or Same as parent a root container. A condition that is off
 * gets no counts.
 * @param {NestingStyleCondition[]} conditions  the rows as shown
 * @param {NestingView}   view
 * @param {RelationIndex} relationsOf
 * @returns {NestingStyleCounts}
 */
function nestingStyleCounts(conditions, view, relationsOf) {
  const nodes = _nestingNodes(view, relationsOf);
  const { styles, parentlessRoots, withoutLook } = Appearance.followNestingChains(nodes, conditions);
  const byId = new Map(nodes.map(n => [n.id, n]));
  /** @type {Map<number, { parents: Set<string>, children: number }>} */
  const per = new Map();
  styles.forEach((st, id) => {
    let c = per.get(st.nr);
    if (!c) { c = { parents: new Set(), children: 0 }; per.set(st.nr, c); }
    c.children++;
    const parentId = /** @type {import("../appearance").NestingNode} */ (byId.get(id)).parentId;   // Cast: styles holds node ids
    if (parentId) c.parents.add(parentId);
  });
  const counts = conditions.map((r, i) => {
    if (r.on === false) return {};
    const c = per.get(i + 1);
    return { parents: c ? c.parents.size : 0, children: c ? c.children : 0 };
  });
  /** @type {Map<number, string>} */
  const warnings = new Map();
  const add = (/** @type {number} */ nr, /** @type {string} */ text) => warnings.set(nr - 1, warnings.has(nr - 1) ? `${warnings.get(nr - 1)}\n${text}` : text);
  /** @type {Map<number, number>} */
  const roots = new Map();
  for (const id of parentlessRoots) { const nr = /** @type {{ nr: number }} */ (styles.get(id)).nr; roots.set(nr, (roots.get(nr) || 0) + 1); }   // Cast: a parentless root is styled
  roots.forEach((n, nr) => add(nr, `Same as parent on ${n} root container${n === 1 ? "" : "s"}: there is no parent to take the fill color from. ` +
    "They keep their template look, else Type default."));
  // Without a view template in use the dialog shows Template's fallback itself: no ⚠ for it.
  if (view.viewTemplate) {
    Appearance.withoutLookCounts(withoutLook).forEach((n, nr) => add(nr, `${n} element${n === 1 ? "" : "s"} styled by this condition ${n === 1 ? "is" : "are"} not on the view template. ` +
      "They use default values instead (Type default, 9 pt, normal). The count reflects the predicted view and the configured property match."));
  }
  return { counts, warnings };
}

/**
 * The occurrences of the predicted view as the nesting chains read them (Appearance.NestingNode).
 * @param {NestingView}   view
 * @param {RelationIndex} relationsOf
 * @returns {import("../appearance").NestingNode[]}
 */
function _nestingNodes(view, relationsOf) {
  const { nesting, viewTemplate } = view;
  const byId = new Map(view.elements.map(el => [el.id, el]));
  /** @type {Map<string, ArchiElement>} */
  const elementOf = new Map();
  for (const [elementId, occs] of Object.entries(nesting.occurrenceMap)) {
    const el = byId.get(elementId);
    if (el) for (const occ of occs) elementOf.set(occ, el);
  }
  const containers = new Set(Object.values(nesting.parentMap));
  const onTemplate = viewTemplate ? Table.elementsOf(viewTemplate.tables) : new Set();
  const looks = viewTemplate ? Pipeline.templateLooks(viewTemplate) : new Map();
  /** @type {(id: string) => number} */
  const depthOf = id => { let d = 0; for (let p = nesting.parentMap[id]; p; p = nesting.parentMap[p]) d++; return d; };
  /** @type {import("../appearance").NestingNode[]} */
  const nodes = [];
  for (const [occ, el] of elementOf) {
    const parentId = nesting.parentMap[occ] || null;
    const parentEl = parentId ? elementOf.get(parentId) : undefined;
    const look = Appearance.templateLook(looks, el.id, parentEl ? parentEl.id : null);
    nodes.push({
      id: occ, parentId: parentEl ? parentId : null, type: el.type, element: el,
      rels: parentEl ? Appearance.relsBetween(parentEl, el, relationsOf) : [],
      depth: depthOf(occ), isContainer: containers.has(occ), onTemplate: onTemplate.has(el.id),
      ...(look ? { look: Appearance.lookValues(look) } : {}),
    });
  }
  return nodes;
}

/**
 * The per-condition counts of the two filter tables: after the filter, before any step. An element row
 * counts elements, a relation row counts relations; the rows of the other kind do not take part.
 * @param {DialogCountInput} input
 * @param {ArchiElement[]}   filteredElements
 * @returns {DialogCounts["filterConditions"]}
 */
function _filterTableCounts(input, filteredElements) {
  const { objects, filterTables, relationsOf } = input;
  // Cast: filtered to elements.
  const rawElements = /** @type {ArchiElement[]} */ (objects.filter(o => { const t = o.type || ""; return !t.endsWith("-relationship") && !(t in DIAGRAM_TYPES); }));
  const rawDiagrams = objects.filter(o => (o.type || "") in DIAGRAM_TYPES);
  const rows = filterTables.filter;
  const elementCounts  = filterConditionCounts(ConditionLists.filterRows(rows, "element"), rawElements, (list, o) => ConditionLists.matchElement(list, o));
  const relationCounts = filterConditionCounts(ConditionLists.filterRows(rows, "relation"),
    Pipeline.findRelationsBetween(relationsOf, filteredElements, null, new Set()), (list, r) => ConditionLists.matchFilterRelation(list, r));
  const next = { element: 0, relation: 0 };
  return {
    filter:  rows.map(r => (r.applyTo === "element" ? elementCounts : relationCounts)[next[r.applyTo]++]),
    diagram: filterConditionCounts(filterTables.diagram, rawDiagrams, (list, o) => Pipeline.diagramPasses(list, o.type || "")),
  };
}

// ── Per-condition counts ───────────────────────────────────────────────────────────

/**
 * Per-condition counts of a step, per run. Run 1: what the step adds with this condition alone, from the step
 * input, so adding another condition never changes it. Run k ≥ 2: what this condition alone adds from what all
 * conditions together added in run k − 1, as the step runs; it depends on the other conditions. An Exclude
 * condition: what it removes from the other conditions' result in that run. Runs are shown while the step adds
 * something, at least run 1. Results are cached per condition, run and chain key in the step's cache.
 * @param {RelationIndex}  relationsOf
 * @param {DialogStep}     s
 * @param {ArchiElement[]} input
 * @param {ArchiElement[]} cumulative
 * @param {Set<string>}    seen
 * @param {string}         chainKey  the settings input, cumulative and seen follow from (dialogCounts)
 * @returns {{ conditionCounts: ConditionTableCounts[], runAdds: StepAdds[] }}
 *   conditionCounts — one entry per displayed condition: a number, or "5 + 7 + 2" with more than one run;
 *                     a condition that is off is counted as if it were on
 *   runAdds         — what the step adds per run with all its conditions
 */
function stepConditionCounts(relationsOf, s, input, cumulative, seen, chainKey) {
  const { step, displayedConditions: conditions, cache } = s;
  if (cache.size > STEP_COUNT_CACHE_MAX) cache.clear();
  const once = Object.assign({}, step, { repeat: 1 });
  /** @type {StepAdds[][]} per run, per condition */
  const perRun = [];
  /** @type {StepAdds[]} */
  const runAdds = [];
  let base = input, cumul = cumulative, seenRun = new Set(seen);
  for (let k = 1; k <= Defs.repeatMaxRuns(step.repeat); k++) {
    const state = { base, cumul, seenRun: new Set(seenRun) };   // the run below adds to seenRun
    // Run 1 starts from the step input alone; a later run from what all conditions added before it.
    const runKey = `${chainKey}|${k}|${k === 1 ? "" : JSON.stringify(step.conditions)}`;
    const all = Pipeline.expandStepWithRelations(relationsOf, base, once, cumul, seenRun);
    const total = { elements: all.added.length, relations: all.rels.length };
    if (k > 1 && total.elements === 0) break;
    runAdds.push(total);
    perRun.push(_runConditionCounts(relationsOf, once, conditions, state, total, runKey, cache));
    if (total.elements === 0) break;
    base = all.added; cumul = all.cumulative;
  }
  /** @param {number} i @param {"elements" | "relations"} key */
  const shown = (i, key) => perRun.length === 1 ? perRun[0][i][key] : perRun.map(r => r[i][key]).join(" + ");
  return {
    conditionCounts: conditions.map((_, i) => ({ elements: shown(i, "elements"), relations: shown(i, "relations") })),
    runAdds,
  };
}

/**
 * Per-condition counts of one run of a step (stepConditionCounts).
 * @param {RelationIndex}    relationsOf
 * @param {Step}             once        the step, run once
 * @param {StepCondition[]}  conditions  the displayed conditions
 * @param {{ base: ArchiElement[], cumul: ArchiElement[], seenRun: Set<string> }} state  before the run
 * @param {StepAdds}         total       what the run adds with all conditions
 * @param {string}           runKey
 * @param {Map<string, StepAdds>} cache
 * @returns {StepAdds[]}
 */
function _runConditionCounts(relationsOf, once, conditions, state, total, runKey, cache) {
  /** @param {StepCondition[]} list */
  const run = list => {
    const key = `${runKey}|${JSON.stringify(list)}`;
    let r = cache.get(key);
    if (!r) {
      const res = Pipeline.expandStepWithRelations(relationsOf, state.base, Object.assign({}, once, { conditions: list }), state.cumul, new Set(state.seenRun));
      r = { elements: res.added.length, relations: res.rels.length };
      cache.set(key, r);
    }
    return r;
  };
  return conditions.map((r, i) => {
    const asOn = Object.assign({}, r, { on: true });
    if (r.mode !== "exclude") return run([asOn]);
    const others  = conditions.filter((_, j) => j !== i);
    const without = run(others);
    const withIt  = r.on === false ? run([...others, asOn]) : total;
    return { elements: without.elements - withIt.elements, relations: without.relations - withIt.relations };
  });
}

/**
 * Per-condition counts of a global filter table: how many objects the condition keeps on its own; an
 * Exclude condition: how many it removes from the other conditions' result. A condition that is off is counted
 * as if it were on: what it would keep or remove.
 * @template {FilterCondition | DiagramCondition} R
 * @template T
 * @param {R[]} conditions  the table's rows as shown
 * @param {T[]} objects
 * @param {(conditions: R[], o: T) => boolean} test  the filter list's match function
 * @returns {ConditionTableCounts[]}
 */
function filterConditionCounts(conditions, objects, test) {
  const kept  = objects.filter(o => test(conditions, o)).length;
  return conditions.map((condition, i) => {
    const asOn = Object.assign({}, condition, { on: true });
    if (condition.mode !== "exclude") return { count: objects.filter(o => test([asOn], o)).length };
    const others = conditions.filter((_, j) => j !== i);
    const withIt = condition.on === false ? objects.filter(o => test([...others, asOn], o)).length : kept;
    return { count: objects.filter(o => test(others, o)).length - withIt };
  });
}

/**
 * Per-condition counts of a nesting / reverse table over the predicted view's relations. A condition that is
 * off is counted as if it were on (its Nested count stays empty).
 * @param {RelationCondition[]}     conditions      the table's rows as shown
 * @param {RelationTypes[]}    relations  the relations with their types read (relationTypes)
 * @param {Set<string> | null} nestedIds  relations drawn as nesting; null: no Nested column
 * @returns {ConditionTableCounts[]}
 */
function featureConditionCounts(conditions, relations, nestedIds) {
  /** @type {(list: RelationCondition[], r: RelationTypes) => boolean} */
  const match  = (list, r) => ConditionLists.matchRelation(list, r.type, r.source, r.target, false, r.rel);
  const active = conditions.filter(r => r.on !== false);
  const allHits = relations.filter(r => match(active, r)).length;
  return conditions.map((condition, i) => {
    const asOn = Object.assign({}, condition, { on: true });
    if (condition.mode !== "exclude") {
      const hit = relations.filter(r => match([asOn], r));
      // Nested: only for a condition that is on; what an off condition would nest needs a nesting run of its own.
      return { relations: hit.length, nested: nestedIds && condition.on !== false ? hit.filter(r => nestedIds.has(r.rel.id)).length : undefined };
    }
    const others = conditions.filter((r, j) => j !== i && r.on !== false);
    const withIt = condition.on === false ? relations.filter(r => match([...others, asOn], r)).length : allHits;
    return { relations: relations.filter(r => match(others, r)).length - withIt };
  });
}

/**
 * Each relation with its type and its ends' types, read once: a jArchi relation reads them through the
 * model on every access, and a condition table matches every relation once per condition.
 * @param {ArchiRelation[]} relations
 * @returns {RelationTypes[]}
 */
function relationTypes(relations) {
  return relations.map(rel => ({ rel, type: rel.type, source: rel.source && rel.source.type, target: rel.target && rel.target.type }));
}

/**
 * The counts of the Layout tab's nesting and reverse tables, and the nesting relations that are
 * drawn as a line, on the predicted view.
 * @param {{ nesting: RelationCondition[], reverse: RelationCondition[] }} tables  the rows as shown
 * @param {ArchiRelation[]}    relations  the predicted view's relations
 * @param {NestingResolution}  nest       their nesting (Nesting.resolveNesting)
 * @param {ArchiElement[]}     onView     the laid-out elements: the predicted view without the elements only inside a diagram-block
 * @returns {LayoutConditionCounts}
 */
function layoutConditionCounts(tables, relations, nest, onView) {
  const nestedIds = new Set(nest.parentRels.map(b => b.rel.id));
  const laidOut = new Set(onView.map(el => el.id));
  const isLoop = (/** @type {ArchiRelation} */ r) => r.source.id === r.target.id;
  const outside = (/** @type {ArchiRelation} */ r) => !laidOut.has(r.source.id) || !laidOut.has(r.target.id);
  const loops = nest.notNestedNestingRels.filter(isLoop).length;
  const inBlock = nest.notNestedNestingRels.filter(r => !isLoop(r) && outside(r)).length;
  const typed = relationTypes(relations);
  return {
    nesting: featureConditionCounts(tables.nesting, typed, nestedIds),
    reverse: featureConditionCounts(tables.reverse, typed, null),
    multiParent: nest.notNestedNestingRels.length - loops - inBlock,
    inDiagramBlock: inBlock,
    circular:    nest.circularNestingRels.length,
    cycles:      nest.cycles.length,
    selfLoops:   loops,
    deep:        nest.deepNestingRels.length,
  };
}

// ── Selection counts, property lists ──────────────────────────────────────────

/**
 * Count a selection by kind.
 * @param {ArchiCollection<ArchiObject>} coll
 * @returns {SelectionCounts}
 */
function countSelection(coll) {
  let elems = 0, rels = 0, views = 0, diagrams = 0, folders = 0;
  coll.each(o => {
    const t = o.type || "";
    if      (t === "folder")                     folders++;
    else if (t.endsWith("-relationship"))        rels++;
    else if (t === "archimate-diagram-model")    views++;
    else if (t.startsWith("diagram-model-"))     diagrams++;
    else                                          elems++;
  });
  return { elems, rels, views, diagrams, folders };
}

/**
 * Sorted property names found on the objects.
 * @param {readonly ArchiProxy[]} objs
 */
function propNames(objs) {
  const names = new Set();
  for (const o of objs || []) {
    try { const ks = o.prop(); if (Array.isArray(ks)) ks.forEach(k => { if (k) names.add(String(k)); }); } catch (e) {}   // silent: an object without properties
  }
  return Array.from(names).sort(compareNames);
}

/**
 * Sorted non-empty values of one property on the objects.
 * @param {readonly ArchiProxy[]} objs
 * @param {string} key
 */
function propValues(objs, key) {
  if (!key) return [];
  const vals = new Set();
  for (const o of objs || []) {
    try { const v = o.prop(key); if (v !== null && v !== undefined && v !== "") vals.add(String(v)); } catch (e) {}   // silent: an object without properties
  }
  return Array.from(vals).sort(compareNames);
}

// ── Texts ─────────────────────────────────────────────────────────────────────

// "business-actor" → "Business Actor". Matches the Title-Case form Archi shows in its Properties view.
/** @param {string} t */
function typeToDisplay(t) {
  if (!t) return "";
  return t.split("-").map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(" ");
}

// A style condition as a sentence, for the row tooltip.
/** @param {StyleCondition} r */
function styleConditionSentence(r) {
  const el  = (/** @type {string} */ t) => t ? typeToDisplay(t) : "element";
  const rel = r.relation ? `${typeToDisplay(r.relation.replace(/-relationship$/, ""))} relation` : "relation";
  const pat = `${rel}${r.source ? ` from ${el(r.source)}` : ""}${r.target ? ` to ${el(r.target)}` : ""}`;
  const prop = r.property ? `"${r.property}"` : "(no property chosen)";
  const of = { element: "its own", relation: "the relation's", source: "the source element's", target: "the target element's" };
  const range = `, from the ${r.colorRange} range`;
  const off = r.on === false ? " (off)" : "";
  if (r.applyTo === "element")  return `Color every ${el(r.source)} by its own ${prop}${range}.${off}`;
  if (r.applyTo === "relation") return `Color every ${pat} by ${of[r.propertyOf] || "its own"} ${prop}${range}.${off}`;
  const of2 = r.propertyOf === "element" ? "its own" : of[r.propertyOf];
  return `Color the ${r.applyTo} element of every ${pat} by ${of2} ${prop}${range}.${off}`;
}

// ── Saved preset ──────────────────────────────────────────────────────────────

/**
 * True when the dialog's settings differ from the saved preset they came from (e.g. a session
 * that was changed but not saved). The view name is left out: it is pre-filled from the selection.
 * @param {Preset} saved
 * @param {Preset} config
 */
function differsFromSaved(saved, config) {
  const pick  = (/** @type {Preset} */ c) => JSON.stringify({
    algorithm: c.algorithm, params: c.params, filter: c.filter, relatedElements: c.relatedElements,
    appearance: c.appearance, view: c.view && [c.view.folder, c.view.mirrored],
    // the dialog lists every property of the model; only the enabled ones are settings
    viewProperties: c.viewProperties && [c.viewProperties.addObjectId,
      (c.viewProperties.properties || []).filter(r => r.enabled)],
  });
  return pick(saved) !== pick(config);
}

// ── Count lines ───────────────────────────────────────────────────────────────

// Ordered (key, singular, plural) tuples driving formatCountsBody output order.
/** @type {[keyof SelectionCounts, string, string][]} */
const _COUNT_LABELS = [
  ["elems",    "element",  "elements"],
  ["rels",     "relation", "relations"],
  ["diagrams", "diagram",  "diagrams"],
  ["views",    "view",     "views"],
  ["folders",  "folder",   "folders"],
];

// A count line: "3 elements · 2 relations  (first: …)". Types with count 0 are omitted;
// an empty selection gives "nothing". Used for the right column of 2-col counter rows.
/**
 * @param {SelectionCounts} counts
 * @param {string} [firstObject]
 */
function formatCountsBody(counts, firstObject) {
  const parts = [];
  for (const [key, sg, pl] of _COUNT_LABELS) {
    const n = counts[key] | 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? sg : pl}`);
  }
  const body = parts.length ? parts.join(" · ") : "nothing";
  const tail = firstObject ? `  (first: ${firstObject})` : "";
  return `${body}${tail}`;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    nestingStyleCounts,
    dialogCounts, stepConditionCounts, filterConditionCounts, featureConditionCounts, layoutConditionCounts,
    countSelection, formatCountsBody, propNames, propValues, typeToDisplay, styleConditionSentence, differsFromSaved,
  };
}
