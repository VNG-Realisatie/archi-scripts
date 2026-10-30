/**
 * Dialog counts: the numbers the View dialog shows, computed without widgets (pure; Node loads it).
 *
 * dialogCounts counts what the current settings put on a view: the per-condition counts of the filter,
 * step, nesting and reverse tables, what each step adds, and the totals line. It follows the
 * pipeline (selection_pipeline.js, nesting.js), so a count matches what the action writes.
 * dialog_main.js reads the conditions from its tables, calls it and puts the numbers on the widgets.
 * Also here: selection counts, property lists, the style condition sentence and the saved-preset compare.
 */
console.log("Loading counts.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../selection_pipeline")} */
const Pipeline  = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("../nesting")} */
const Nesting   = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");

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
    else if (ConditionLists.matchElement(filter.elementConditions, /** @type {ArchiElement} */ (o))) filteredElements.push(/** @type {ArchiElement} */ (o));
  }
  // As the pipeline: a diagram connection is a line; a diagram-block is laid out as one and written with its contents.
  const inBlock = Pipeline.keptDiagramBlocks(input.diagramBlockOf, keptDiagramObjects);
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
  for (const s of input.steps) {
    const seenBefore = new Set(seenRelIds);
    const { added, rels: stepRels, cumulative: newCumul, runs, capped, candidates } =
      Pipeline.expandStepWithRelations(relationsOf, stepInput, s.step, cumulative, seenRelIds);
    const adds = { elements: added.length, relations: stepRels.length };
    steps.push({ ...adds, runs, capped, candidates,
      conditionCounts: stepConditionCounts(relationsOf, s, stepInput, cumulative, seenBefore, adds) });
    cumulative = newCumul;
    stepRels.forEach(r => finalRels.push(r));
    stepInput = added;                                                       // chain advance
  }

  // Predict view-level counts (duplicates, containers) using the current params: the totals
  // line must reflect what the writer will produce.
  // An element that appears only inside a diagram-block is written with it, not laid out, as in the pipeline.
  const onlyInBlocks = Pipeline.mapDiagramBlockVisuals(input.sourceVisualElements, inBlock);
  const onView = cumulative.filter(el => !onlyInBlocks.has(el.id));
  const diagram = {
    objects:     diagramNodes.length + Pipeline.countDiagramObjectsInBlocks(input.blockContents, inBlock),
    connections: Pipeline.countDiagramConnections(diagramConnections, diagramNodes, onView, inBlock),
    elements:    onlyInBlocks.size,
  };
  const view = Nesting.predictViewCounts(onView, finalRels, diagram, input.params, input.visuals);
  const layoutConditions = input.layoutConditions
    ? layoutConditionCounts(input.layoutConditions, cumulative, finalRels, input.params, input.visuals)
    : null;

  // Expand view: composed by the pipeline itself from what it read before the dialog opened.
  const expandView = input.expandSnapshot
    ? Pipeline.composeObjectSet(input.expandSnapshot, {
        filter,
        relatedElements: { steps: input.steps.map(s => s.step) },
        params: input.params,
      }, ACTION.EXPAND_VIEW.id).view
    : null;

  return { filterConditions, steps, predicted: { elements: cumulative, relations: finalRels }, view, layoutConditions, expandView };
}

/**
 * The per-condition counts of the three filter tables (each condition in its type combo): after the
 * filter, before any step.
 * @param {DialogCountInput} input
 * @param {ArchiElement[]}   filteredElements
 * @returns {DialogCounts["filterConditions"]}
 */
function _filterTableCounts(input, filteredElements) {
  const { objects, filterTables, relationsOf } = input;
  // Cast: filtered to elements.
  const rawElements = /** @type {ArchiElement[]} */ (objects.filter(o => { const t = o.type || ""; return !t.endsWith("-relationship") && !(t in DIAGRAM_TYPES); }));
  const rawDiagrams = objects.filter(o => (o.type || "") in DIAGRAM_TYPES);
  return {
    element:  filterConditionCounts(filterTables.element, rawElements, (list, o) => ConditionLists.matchElement(list, o)),
    diagram:  filterConditionCounts(filterTables.diagram, rawDiagrams, (list, o) => Pipeline.diagramPasses(list, o.type || "")),
    relation: filterConditionCounts(filterTables.relation,
      Pipeline.findRelationsBetween(relationsOf, filteredElements, null, new Set()),
      (list, r) => ConditionLists.matchRelation(list, r.type, r.source && r.source.type, r.target && r.target.type, true)),
  };
}

// ── Per-condition counts ───────────────────────────────────────────────────────────

/**
 * Per-condition counts of a step: what the step adds with this condition alone — same input, same repeat —
 * so a condition's count changes only when the condition or the step input changes, never because another
 * condition was added. An Exclude condition: what it removes from the other conditions' result. Results are
 * cached per condition and input in the step's cache, so adding a condition computes only the new one.
 * @param {RelationIndex}  relationsOf
 * @param {DialogStep}     s
 * @param {ArchiElement[]} input
 * @param {ArchiElement[]} cumulative
 * @param {Set<string>}    seen
 * @param {StepAdds}       total  what the step adds with all its conditions
 * @returns {StepAdds[]}  one entry per displayed condition; a condition that is off is counted as if it were on
 */
function stepConditionCounts(relationsOf, s, input, cumulative, seen, total) {
  const { step, displayedConditions: conditions, cache } = s;
  if (cache.size > STEP_COUNT_CACHE_MAX) cache.clear();
  const sig = `${step.repeat}|${_idsSig(input)}|${_idsSig(cumulative)}|${_idsSig(Array.from(seen))}`;
  /** @param {StepCondition[]} list */
  const run = list => {
    const key = `${sig}|${JSON.stringify(list)}`;
    let r = cache.get(key);
    if (!r) {
      const res = Pipeline.expandStepWithRelations(relationsOf, input, Object.assign({}, step, { conditions: list }), cumulative, new Set(seen));
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
 * Short signature of a list of objects (or ids) for cache keys: count + FNV-1a hash of the ids.
 * @param {readonly any[]} list  objects with an id, or ids
 */
function _idsSig(list) {
  let h = 0x811c9dc5;
  for (const o of list) {
    const id = String(o && o.id !== undefined ? o.id : o);
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x2c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${list.length}:${h.toString(16)}`;
}

/**
 * Per-condition counts of a global filter table: how many objects the condition keeps on its own; an
 * Exclude condition: how many it removes from the other conditions' result. A condition that is off is counted
 * as if it were on: what it would keep or remove.
 * @template {ElementCondition | DiagramCondition | RelationCondition} R
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
 * @param {ArchiRelation[]}    relations
 * @param {Set<string> | null} nestedIds  relations drawn as nesting; null: no Nested column
 * @returns {ConditionTableCounts[]}
 */
function featureConditionCounts(conditions, relations, nestedIds) {
  /** @type {(list: RelationCondition[], r: ArchiRelation) => boolean} */
  const match  = (list, r) => ConditionLists.matchRelation(list, r.type, r.source && r.source.type, r.target && r.target.type, false, r);
  const active = conditions.filter(r => r.on !== false);
  const allHits = relations.filter(r => match(active, r)).length;
  return conditions.map((condition, i) => {
    const asOn = Object.assign({}, condition, { on: true });
    if (condition.mode !== "exclude") {
      const hit = relations.filter(r => match([asOn], r));
      // Nested: only for a condition that is on; what an off condition would nest needs a nesting run of its own.
      return { relations: hit.length, nested: nestedIds && condition.on !== false ? hit.filter(r => nestedIds.has(r.id)).length : undefined };
    }
    const others = conditions.filter((r, j) => j !== i && r.on !== false);
    const withIt = condition.on === false ? relations.filter(r => match([...others, asOn], r)).length : allHits;
    return { relations: relations.filter(r => match(others, r)).length - withIt };
  });
}

/**
 * The counts of the Layout tab's nesting and reverse tables, and the nesting relations that are
 * drawn as a line, on the predicted view.
 * @param {{ nesting: RelationCondition[], reverse: RelationCondition[] }} tables  the rows as shown
 * @param {ArchiElement[]}      elements
 * @param {ArchiRelation[]}     relations
 * @param {EffectiveParams}     params
 * @param {VisualDescription[]} visuals
 * @returns {LayoutConditionCounts}
 */
function layoutConditionCounts(tables, elements, relations, params, visuals) {
  const split = Nesting.splitNestingRels(relations, params);
  const nest  = Nesting.resolveNesting(elements, split.nestingRels, params, visuals);
  const nestedIds = new Set(nest.parentRels.map(b => b.rel.id));
  const loops = nest.notNestedNestingRels.filter(r => r.source && r.target && r.source.id === r.target.id).length;
  return {
    nesting: featureConditionCounts(tables.nesting, relations, nestedIds),
    reverse: featureConditionCounts(tables.reverse, relations, null),
    multiParent: nest.notNestedNestingRels.length - loops,
    circular:    nest.circularNestingRels.length,
    cycles:      nest.cycles.length,
    selfLoops:   loops,
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
    try { const ks = o.prop(); if (Array.isArray(ks)) ks.forEach(k => { if (k) names.add(String(k)); }); } catch (e) {}
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
    try { const v = o.prop(key); if (v !== null && v !== undefined && v !== "") vals.add(String(v)); } catch (e) {}
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
  if (r.color === "element")  return `Color every ${el(r.source)} by its own ${prop}${range}.${off}`;
  if (r.color === "relation") return `Color every ${pat} by ${of[r.propertyOf] || "its own"} ${prop}${range}.${off}`;
  const of2 = r.propertyOf === "element" ? "its own" : of[r.propertyOf];
  return `Color the ${r.color} element of every ${pat} by ${of2} ${prop}${range}.${off}`;
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
    appearance: c.appearance, folder: c.view && c.view.folder,
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
    dialogCounts, stepConditionCounts, filterConditionCounts, featureConditionCounts, layoutConditionCounts,
    countSelection, formatCountsBody, propNames, propValues, typeToDisplay, styleConditionSentence, differsFromSaved,
  };
}
