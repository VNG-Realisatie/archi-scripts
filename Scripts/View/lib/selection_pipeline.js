/**
 * Selection pipeline for the View subsystem (pure; the Archi reads are in selection_read.js,
 * the nesting in nesting.js).
 *
 * Builds the object set for generate_view from the Snapshot readSelection read.
 * The shape returned is uniform across actions; the write plan decides per visual
 * whether to reposition or create based on existence.
 *
 * Pipeline (uniform for NEW_VIEW / ONE_EACH / EXPAND_VIEW / LAYOUT_ONLY). readSelection reads
 * (1, 7); composeObjectSet does the rest without console output, so the dialog can predict with it:
 *   1. Selection.getSelection(uiSelection, "*") + the views in it expanded
 *   2. Filter (element/relation/diagram types)
 *   3. Related-elements expansion  (skipped for LAYOUT_ONLY only)
 *   4. Separate elements from collection (drop relations, folders, view nodes)
 *   5. Find relations between elements (with union filter)
 *   6. Partition diagram-model-connection (edges) from other diagram objects
 *   7. Collect existing view contents (existingView, visualElements, visualRelations)
 *      for actions that target an existing view (EXPAND_VIEW, LAYOUT_ONLY)
 */
console.log("Loading selection_pipeline.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs        = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./nesting")} */
const Nesting     = require(REPO_ROOT + "View/lib/nesting");
const { ACTION } = Defs;

/**
 * Build the object set for an action from what readSelection read: compose, log what was composed.
 * @param {Snapshot}     snapshot
 * @param {MaskedPreset} preset
 * @param {string}       actionId  ACTION.*.id
 * @returns {ObjectSet}  visuals: visualElements described (chain, managed; describeVisuals)
 */
function buildObjectSet(snapshot, preset, actionId) {
  // The filter is skipped for the "Modify selected view" group — EXPAND_VIEW and LAYOUT_ONLY
  // re-layout/expand all elements already on the view; applying the filter would exclude visible
  // element types, causing containers to be sized for only the filtered subset while excluded
  // elements remain at positions outside those bounds.
  if (!_isModifyAction(actionId)) _logFilter(preset.filter);
  else console.log("  Modify-selected-view action: element-type filter skipped");

  const composed = composeObjectSet(snapshot, preset, actionId);
  _logSteps(preset.relatedElements.steps, composed.stepCounts);
  _logComposed(composed, _isModifyAction(actionId));
  return composed.objectSet;
}

/**
 * EXPAND_VIEW or LAYOUT_ONLY: the actions that change the selected view in place.
 * @param {string} actionId
 */
function _isModifyAction(actionId) {
  return actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
}


/**
 * Compose the object set from what readSelection read: filter, related-elements steps, the
 * elements and relations to put on the view, and the predicted on-view counts. No console
 * output, nothing read from the selection again: the dialog calls it on every change.
 * @param {Snapshot}                                                   snapshot
 * @param {Pick<MaskedPreset, "filter" | "relatedElements" | "params">} preset
 * @param {string}                                                     actionId  ACTION.*.id
 * @returns {ComposedObjectSet}
 */
function composeObjectSet(snapshot, preset, actionId) {
  const isModifyAction = _isModifyAction(actionId);
  const isExpand       = actionId === ACTION.EXPAND_VIEW.id;
  const { existing, relationsOf } = snapshot;

  // Filter (skipped for the Modify actions, see buildObjectSet).
  let filteredElementsArr = snapshot.elements;
  let diagramObjects      = snapshot.diagramObjects;
  if (!isModifyAction) {
    filteredElementsArr = _applyFilter(filteredElementsArr, preset.filter);
    diagramObjects      = _applyDiagramFilter(diagramObjects, preset.filter);
  }

  const filteredCounts = {
    elems: filteredElementsArr.length,
    diag:  diagramObjects.length,
  };

  // Collect relations incrementally: base uses the global relation conditions; each step uses its
  // own conditions so that a step only adds relations it followed.
  // For modify actions the relation-type filter is also skipped — same rationale as the
  // element filter: EXPAND_VIEW / LAYOUT_ONLY must include ALL existing relations on the
  // view (e.g. both configured nesting types), not only those matching the filter.
  // EXPAND_VIEW / LAYOUT_ONLY: the base relations are the ones drawn on the view — no missing
  // relations between elements already on it are added.
  /** @type {Set<string>} */
  const allRelIds    = new Set();
  const allRelations = isModifyAction
    ? _viewRelations(existing.visualRelations, allRelIds)
    : findRelationsBetween(relationsOf, filteredElementsArr, globalRelationMatch(preset.filter), allRelIds);
  const filteredBaseRels = allRelations.length;

  // Related-elements expansion (chain semantics; skipped for LAYOUT_ONLY).
  // Step 1's input is the filtered base. Step N (N≥2)'s input is step N-1's added
  // elements only — NOT the cumulative selection. An empty step terminates the chain.
  const expansion = actionId !== ACTION.LAYOUT_ONLY.id && Array.isArray(preset.relatedElements.steps)
    ? _expandRelatedElements(relationsOf, filteredElementsArr, preset.relatedElements.steps, allRelIds)
    : { addedElements: [], addedRelations: [], stepCounts: [] };
  expansion.addedRelations.forEach(r => allRelations.push(r));

  // Elements are the filtered base plus step additions
  // (EXPAND_VIEW: every element on the view plus step additions, so the whole view is laid out).
  const viewElements = isExpand
    ? _uniqueById([.../** @type {ArchiElement[]} */ (existing.visualElements.map(ve => ve.concept).filter(Boolean)), ...expansion.addedElements])   // Cast: nulls filtered
    : [...filteredElementsArr, ...expansion.addedElements];

  // Diagram-blocks: Create copies only those the diagram filter keeps (the view read is not the target).
  const diagramBlockOf = isModifyAction ? snapshot.diagramBlockOf : keptDiagramBlocks(snapshot.diagramBlockOf, diagramObjects);
  // An element that appears only inside a diagram-block is not laid out.
  const diagramBlockVisualOf = mapDiagramBlockVisuals(isModifyAction ? existing.visualElements : snapshot.sourceVisualElements, diagramBlockOf);
  const elements  = viewElements.filter(el => !diagramBlockVisualOf.has(el.id));
  const relations = allRelations;

  // Partition diagram-model-connection (edges) from positional diagram objects.
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection" && !diagramBlockOf.has(String(o.id)));

  // Predict on-view counts using the same algorithm the writer uses.
  const visuals = snapshot.visuals.filter(v => !diagramBlockOf.has(v.id));
  const diagram = {
    objects:     diagramNodes.length + countDiagramObjectsInBlocks(snapshot.blockContents, diagramBlockOf),
    connections: countDiagramConnections(diagramConnections, diagramNodes, elements, diagramBlockOf),
    elements:    diagramBlockVisualOf.size,
  };
  const view = Nesting.predictViewCounts(elements, relations, diagram, preset.params, visuals);

  return {
    objectSet: {
      elements,
      relations,
      diagramObjects:    diagramNodes,
      diagramConnections,
      visualElements:    existing.visualElements,
      visualRelations:   existing.visualRelations,
      existingView:      existing.existingView,
      positions:         existing.positions,
      diagramBlockOf,
      blockContents:     snapshot.blockContents,
      diagramBlockVisualOf,
      visuals,
    },
    filteredCounts,
    filteredBaseRels,
    stepCounts: expansion.stepCounts,
    view,
  };
}

/**
 * Grouped count log: filtered base → per-step adds (true deltas) → grouped totals.
 * Filtered + Σ adds = Total, exactly, by construction. Canonical vocabulary (AGENTS.md).
 * @param {ComposedObjectSet} composed
 * @param {boolean}           isModifyAction
 */
function _logComposed(composed, isModifyAction) {
  const { filteredCounts, filteredBaseRels, stepCounts, view } = composed;
  const { diagramBlockOf } = composed.objectSet;
  /** @type {CountRow[]} */
  const rows = [{
    label: isModifyAction ? "Unfiltered base:" : "Filtered base:",
    elements: filteredCounts.elems, relations: filteredBaseRels, diagramObjects: filteredCounts.diag,
  }];
  for (const lc of stepCounts) {
    rows.push({ label: `Step ${lc.idx} added:`, elements: lc.elems, relations: lc.rels });
  }
  if (stepCounts.length > 0) rows.push({ rule: true });
  rows.push({
    label: "Total to view:",
    group: [
      { sublabel: "elements:  ", fields: [
          ["containers",       view.containers],
          ["nestedElements",   view.nestedElements],
          ["standalones",      view.standalones],
          ["extraOccurrences", view.extraOccurrences],
        ] },
      { sublabel: "relations: ", fields: [
          ["nestings",         view.nestings],
          ["connections",      view.connections],
        ] },
      { sublabel: "diagram:   ", fields: [
          ["diagramObjects",     view.diagramObjects],
          ["diagramConnections", view.diagramConnections],
        ] },
    ],
  });
  logCountBlock("Pipeline — build object set:", rows);

  if (diagramBlockOf && diagramBlockOf.size > 0) {
    console.log(`  Diagram-blocks: ${new Set(diagramBlockOf.values()).size} diagram objects with contents, moved as one with ${diagramBlockOf.size} objects inside`);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Run the related-elements expansion chain (preset.relatedElements.steps). No console output:
 * buildObjectSet logs the steps from the returned counts (_logSteps).
 * Caller guards on actionId and steps existence.
 * @param {RelationIndex}  relationsOf
 * @param {ArchiElement[]} filteredElementsArr
 * @param {Step[]}         steps
 * @param {Set<string>}    allRelIds   dedup set, mutated
 * @returns {{ addedElements: ArchiElement[], addedRelations: ArchiRelation[], stepCounts: StepCount[] }}
 */
function _expandRelatedElements(relationsOf, filteredElementsArr, steps, allRelIds) {
  /** @type {ArchiElement[]} */
  const addedElements  = [];
  /** @type {ArchiRelation[]} */
  const addedRelations = [];
  /** @type {StepCount[]} */
  const stepCounts     = [];
  let stepInput       = filteredElementsArr.slice();
  let cumulativeElems = filteredElementsArr.slice();
  let stepIdx = 0;
  for (const step of steps) {
    stepIdx++;
    const { added, rels: stepRels, cumulative: newCumul, runs, capped } =
      expandStepWithRelations(relationsOf, stepInput, step, cumulativeElems, allRelIds);
    cumulativeElems = newCumul;
    added.forEach(o => addedElements.push(o));
    stepRels.forEach(r => addedRelations.push(r));
    stepCounts.push({ idx: stepIdx, elems: added.length, rels: stepRels.length, runs, capped });
    // Chain advance: next step's input is THIS step's additions only.
    stepInput = added;
  }
  return { addedElements, addedRelations, stepCounts };
}

/**
 * Log each step's conditions and, for "until nothing new", how its runs ended.
 * @param {Step[]}      steps
 * @param {StepCount[]} stepCounts  one per step run (_expandRelatedElements)
 */
function _logSteps(steps, stepCounts) {
  for (const sc of stepCounts) {
    const step = steps[sc.idx - 1];
    const repeatStr = step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW ? "until nothing new" : `${Defs.repeatMaxRuns(step.repeat)}×`;
    console.log(`Step ${sc.idx} conditions:  repeat: ${repeatStr}`);
    _logConditions(step.conditions, _describeStepCondition, "    ");
    if (step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW) {
      console.log(sc.capped
        ? `Step ${sc.idx}: stopped at the maximum of ${Defs.REPEAT_MAX} runs — more elements may be reachable`
        : `Step ${sc.idx}: nothing new after ${sc.runs}×`);
    }
  }
}

/**
 * Emit an indented block of count rows, label-aligned and counts column-aligned.
 * Used by both the pipeline (per-step) and the dialog (live counters) so the
 * two outputs have the same shape — easy to eyeball that prediction = result.
 *
 * Row shapes (canonical vocabulary; field key = user-facing plural):
 *   { label, elements, relations, containers, nestedElements, standalones,
 *            extraOccurrences, nestings, connections, views, diagramObjects, folders }
 *                                  → a single-line count row
 *   { label, group: [{ sublabel, fields: [[key, value], …] }] }
 *                                  → a grouped row: label on its own line,
 *                                    then one indented sub-line per group entry
 *   { rule: true }                 → a horizontal separator above the total
 *
 * Single-line rows: each field renders only when != null.
 * Grouped rows: every field in `fields` renders (console = full, zeros included).
 * Plural rules: 1 → singular, else plural.
 * @param {string}     title
 * @param {CountRow[]} rows
 */
function logCountBlock(title, rows) {
  const RULE = "──────────────────────────────────────────────";
  // [key (== plural), singular, plural]. The key is the user-facing plural word —
  // no abbreviations, per the canonical-vocabulary rule (AGENTS.md).
  const FIELDS = [
    ["elements",         "element",          "elements"],
    ["relations",        "relation",         "relations"],
    ["containers",       "container",        "containers"],
    ["nestedElements",   "nested element",   "nested elements"],
    ["standalones",      "standalone",       "standalones"],
    ["extraOccurrences", "extra occurrence", "extra occurrences"],
    ["nestings",         "nesting",          "nestings"],
    ["connections",      "connection",       "connections"],
    ["views",            "view",             "views"],
    ["diagramObjects",   "diagram object",   "diagram objects"],
    ["diagramConnections", "diagram connection", "diagram connections"],
    ["folders",          "folder",           "folders"],
  ];
  /** @type {Record<string, string[]>} */
  const FIELD_MAP = Object.create(null);
  for (const f of FIELDS) FIELD_MAP[f[0]] = f;

  /**
   * @param {string}  key
   * @param {unknown} v
   */
  function fmtField(key, v) {
    const f = FIELD_MAP[key];
    if (!f) return `${v} ${key}`;          // unknown key falls through
    return `${String(v).padStart(3)} ${v === 1 ? f[1] : f[2]}`;
  }

  const labelW = rows.filter(r => !r.rule && !r.group).reduce((m, r) => Math.max(m, (r.label || "").length), 0);
  console.log(title);
  for (const r of rows) {
    if (r.rule) { console.log("  " + RULE); continue; }
    if (r.group) {
      console.log(`  ${r.label || ""}`);
      const subW = r.group.reduce((m, g) => Math.max(m, (g.sublabel || "").length), 0);
      for (const g of r.group) {
        const sub = (g.sublabel || "").padEnd(subW);
        const parts = (g.fields || []).map(([key, v]) => fmtField(key, v));
        console.log(`    ${sub}  ${parts.join(" · ")}`);
      }
      continue;
    }
    const lbl   = (r.label || "").padEnd(labelW);
    const parts = [];
    for (const [key] of FIELDS) {
      const v = r[key];
      if (v == null) continue;
      parts.push(fmtField(key, v));
    }
    console.log(`  ${lbl}  ${parts.join(" · ")}`);
  }
}

/** @param {Preset["filter"] | undefined} filter */
function _logFilter(filter) {
  if (!filter) { console.log("Filter: none"); return; }
  console.log("Filter element conditions:");
  _logConditions(filter.elementConditions, r => `${r.elementType || "all"}${r.property ? `  ${r.property}=${r.value}` : ""}`, "  ");
  console.log("Filter relation conditions:");
  _logConditions(filter.relationConditions, _describeRelationCondition, "  ");
  console.log("Filter diagram conditions:");
  _logConditions(filter.diagramConditions, r => r.diagramType || "all", "  ");
}

/** @param {RelationCondition} r */
function _describeRelationCondition(r) {
  return `${r.source || "all"}  ${r.relation || "all"}  ${r.target || "all"}`;
}

/** @param {StepCondition} r */
function _describeStepCondition(r) {
  const prop = r.property ? `  ${r.propertyOf}.${r.property}=${r.value}` : "";
  return `previous: ${r.previous || "all"}  ${r.direction}  relation: ${r.relation || "all"}  added: ${r.added || "all"}${prop}`;
}

/**
 * One console line per condition ("all" when the list is empty). Off conditions are marked.
 * @template {{ on?: boolean, mode?: ConditionMode }} R
 * @param {R[] | undefined}      conditions
 * @param {(condition: R) => string}  describe
 * @param {string}               indent
 */
function _logConditions(conditions, describe, indent) {
  if (!conditions || conditions.length === 0) { console.log(`${indent}all`); return; }
  for (const r of conditions) {
    console.log(`${indent}${r.mode === "exclude" ? "exclude" : "include"}${r.on === false ? " (off)" : ""}  ${describe(r)}`);
  }
}


/**
 * @param {ArchiElement[]}               elements
 * @param {Preset["filter"] | undefined} filter
 * @returns {ArchiElement[]}
 */
function _applyFilter(elements, filter) {
  if (!filter) return elements;
  const { elementConditions = [] } = filter;
  return elements.filter(el => ConditionLists.matchElement(elementConditions, el));
}

/**
 * @param {DiagramObject[]}              diagramObjects
 * @param {Preset["filter"] | undefined} filter
 * @returns {DiagramObject[]}
 */
function _applyDiagramFilter(diagramObjects, filter) {
  if (!filter || !filter.diagramConditions || filter.diagramConditions.length === 0) return diagramObjects;
  return diagramObjects.filter(o => diagramPasses(filter.diagramConditions, o.type || ""));
}

/**
 * The diagram connections drawn on the view: both ends are on it (a diagram object kept, an object
 * inside a kept diagram-block, or a visual of an element on the view).
 * @param {DiagramObject[]}     diagramConnections
 * @param {DiagramObject[]}     diagramObjects  the diagram objects on the view (no connections)
 * @param {ArchiElement[]}      elements        the elements laid out
 * @param {Map<string, string>} diagramBlockOf  the kept diagram-blocks
 * @returns {number}
 */
function countDiagramConnections(diagramConnections, diagramObjects, elements, diagramBlockOf) {
  const objectIds = new Set(diagramObjects.map(o => String(o.id)));
  const elementIds = new Set(elements.map(el => el.id));
  /** @type {(v: VisualObject | VisualConnection) => boolean} */
  const onView = v => objectIds.has(String(v.id)) || diagramBlockOf.has(String(v.id)) || (!!v.concept && elementIds.has(v.concept.id));
  return diagramConnections.filter(o => {
    const dc = /** @type {VisualConnection} */ (o);   // Cast: a diagram connection is a connection
    return onView(dc.source) && onView(dc.target);
  }).length;
}

/**
 * The diagram objects inside the kept diagram-blocks: written with them, so counted too.
 * @param {Map<string, BlockContents>} blockContents
 * @param {Map<string, string>}        diagramBlockOf  the kept diagram-blocks
 * @returns {number}
 */
function countDiagramObjectsInBlocks(blockContents, diagramBlockOf) {
  const kept = new Set(diagramBlockOf.values());
  let n = 0;
  for (const [block, contents] of blockContents) if (kept.has(block)) n += contents.visuals.filter(c => !c.visual.concept).length;
  return n;
}

/**
 * The elements that appear only inside diagram-blocks: element id → its first visual there.
 * @param {VisualObject[]}      visualElements  the element visuals read
 * @param {Map<string, string>} diagramBlockOf
 * @returns {Map<string, string>}
 */
function mapDiagramBlockVisuals(visualElements, diagramBlockOf) {
  /** @type {Map<string, string>} */
  const out = new Map();
  /** @type {Set<string>} */
  const outside = new Set();
  for (const ve of visualElements) {
    const cid = ve.concept && ve.concept.id;
    if (!cid) continue;
    if (!diagramBlockOf.has(String(ve.id))) outside.add(cid);
    else if (!out.has(cid)) out.set(cid, String(ve.id));
  }
  for (const cid of outside) out.delete(cid);
  return out;
}

/**
 * The diagram-blocks whose diagram object is kept: visual id → diagram-block id, for those only.
 * @param {Map<string, string>} diagramBlockOf
 * @param {DiagramObject[]}     kept  diagram objects after the diagram filter
 * @returns {Map<string, string>}
 */
function keptDiagramBlocks(diagramBlockOf, kept) {
  const keptIds = new Set(kept.map(o => String(o.id)));
  return new Map([...diagramBlockOf].filter(([, block]) => keptIds.has(block)));
}

/**
 * Diagram filter test for one diagram object type. jArchi reports a view-reference object as
 * "archimate-diagram-model"; it is matched as "diagram-model-reference" (the type users pick).
 * @param {DiagramCondition[]} conditions
 * @param {string}        type
 */
function diagramPasses(conditions, type) {
  return ConditionLists.matchDiagram(conditions, type === "archimate-diagram-model" ? "diagram-model-reference" : type);
}

/**
 * Predicate for the global relation conditions, or null when they filter nothing.
 * @param {Preset["filter"] | undefined} filter
 * @returns {((rel: ArchiRelation) => boolean) | null}
 */
function globalRelationMatch(filter) {
  const conditions = filter && filter.relationConditions;
  if (ConditionLists.isPassAll("relation", conditions)) return null;
  // Cast: isPassAll is true for an absent list.
  return rel => ConditionLists.matchRelation(/** @type {RelationCondition[]} */ (conditions), rel.type, rel.source && rel.source.type, rel.target && rel.target.type, true, rel);
}

/**
 * Step candidate: one relation seen from one element of the previous step. Null when the other
 * end is a relation (ArchiMate allows a relation on a relation): a step adds elements only.
 * @param {ArchiRelation} rel
 * @param {ArchiElement}  frontier
 * @returns {StepCandidate | null}
 */
function stepCandidate(rel, frontier) {
  const outgoing = !!(rel.source && rel.source.id === frontier.id);
  const other    = outgoing ? rel.target : rel.source;
  if (!other || _isRelation(other)) return null;
  return { rel, frontier, other, outgoing };
}

/**
 * @param {ArchiElement | ArchiRelation} concept
 * @returns {concept is ArchiRelation}
 */
function _isRelation(concept) {
  return concept.type.endsWith("-relationship");
}

/**
 * Single source of truth for one pipeline step: expand from `base`, then collect
 * relations between the resulting cumulative element set.
 * Used by both buildObjectSet and the dialog's live counters so they can never diverge.
 *
 * @param {RelationIndex}  relationsOf
 * @param {ArchiElement[]} base       - Step input elements (frontier for hop 1)
 * @param {Step}           step       - { repeat, conditions }
 * @param {ArchiElement[]} cumulative - Elements accumulated so far (before this step)
 * @param {Set<string>}    seenRelIds - Dedup set threaded across all steps; mutated in place
 * @returns {StepExpansion}
 *   candidates — every (relation, previous-step element, new element) the step saw, before the
 *                conditions; the dialog reads the property lists of the step's conditions from them
 *   runs   — number of runs that added elements
 *   capped — true when the run limit was reached while the last run still added elements
 */
function expandStepWithRelations(relationsOf, base, step, cumulative, seenRelIds) {
  /** @type {StepCandidate[]} */
  const candidates = [];
  const hops   = _expandStepFrontiers(relationsOf, base, step, cumulative, candidates);
  const added  = hops.flat();
  /** @type {ArchiRelation[]} */
  const newRels = [];
  let cumul           = cumulative.slice();
  let prevHopFrontier = base;  // hop 1: step input triggered the frontier
  for (const hopFrontier of hops) {
    cumul = cumul.concat(hopFrontier);
    // Collect relations between this hop's discoveries and the collection that triggered
    // them (prevHopFrontier). Matched with the step's conditions (relation type, direction and
    // previous-step type) so the traversal direction is honoured. This prevents incidental
    // relations from earlier-step elements (outside the triggering collection) being
    // collected as nesting candidates.
    const hopRels = findRelationsBetween(relationsOf, cumul, (/** @type {ArchiRelation} */ rel, /** @type {ArchiElement} */ el) => {
      const cand = stepCandidate(rel, el);
      return !!cand && ConditionLists.matchStepRelation(step.conditions, cand);
    }, seenRelIds, prevHopFrontier);
    hopRels.forEach(r => newRels.push(r));
    prevHopFrontier = hopFrontier;  // next hop: current frontier becomes the trigger
  }
  const runs   = hops.filter(h => h.length > 0).length;
  const capped = hops.length === Defs.repeatMaxRuns(step.repeat) && hops[hops.length - 1].length > 0;
  return { added, rels: newRels, cumulative: cumul, runs, capped, candidates };
}

/**
 * Expand by running the step up to its repeat count; each run starts from the previous
 * run's additions. Stops early when a run adds nothing. Returns per-run frontier arrays.
 * @param {RelationIndex}          relationsOf
 * @param {ArchiElement[]}         base
 * @param {Step}                   step
 * @param {ArchiElement[]}         [cumulative]
 * @param {StepCandidate[] | null} [candidatesOut]  filled with every candidate seen
 * @returns {ArchiElement[][]}
 */
function _expandStepFrontiers(relationsOf, base, step, cumulative = [], candidatesOut = null) {
  const conditions    = step.conditions || [];
  const maxRuns  = Defs.repeatMaxRuns(step.repeat);
  const baseIds  = new Set(base.map(o => o.id));
  const cumulIds = new Set(cumulative.map(o => o.id));
  /** @type {Set<string>} */
  const addedIds = new Set();
  /** @type {ArchiElement[][]} */
  const hops     = [];
  let frontier   = [...base];

  for (let hop = 0; hop < maxRuns; hop++) {
    /** @type {ArchiElement[]} */
    const nextFrontier = [];
    for (const element of frontier) {
      for (const rel of relationsOf(element)) {
        const cand = stepCandidate(rel, element);
        if (!cand) continue;
        const other = cand.other;
        if (baseIds.has(other.id) || cumulIds.has(other.id)) continue;
        if (candidatesOut) candidatesOut.push(cand);
        if (addedIds.has(other.id)) continue;
        if (!ConditionLists.matchStep(conditions, cand)) continue;
        addedIds.add(other.id);
        nextFrontier.push(other);
      }
    }
    hops.push(nextFrontier);
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
  return hops;
}


/**
 * Find all relations whose source AND target are both in `elements`.
 * @param {RelationIndex}  relationsOf
 * @param {ArchiElement[]} elements
 * @param {((rel: ArchiRelation, element: ArchiElement) => boolean) | null} [match]  null = all relations.
 * @param {Set<string>}    [seenRelIds]    Optional external dedup set — mutated in place so the caller
 *                                   can thread it across successive calls to prevent double-counting.
 * @param {ArchiElement[]} [iterateSubset] Optional subset of elements to iterate. Both endpoints are
 *                                   still checked against the full `elements` set. Pass the
 *                                   pre-step cumulative snapshot to exclude new×new relations.
 *                                   Defaults to `elements`.
 * @returns {ArchiRelation[]}
 */
function findRelationsBetween(relationsOf, elements, match, seenRelIds, iterateSubset) {
  if (elements.length === 0) return [];
  const elementIds = new Set(elements.map(e => e.id));
  const seen       = seenRelIds || new Set();
  const toIterate  = iterateSubset || elements;
  /** @type {ArchiRelation[]} */
  const relations  = [];
  for (const element of toIterate) {
    for (const rel of relationsOf(element)) {
      if (seen.has(rel.id)) continue;
      const srcId = rel.source && rel.source.id;
      const tgtId = rel.target && rel.target.id;
      if (!srcId || !tgtId || !elementIds.has(srcId) || !elementIds.has(tgtId)) continue;
      if (match && !match(rel, element)) continue;
      seen.add(rel.id);
      relations.push(rel);
    }
  }
  return relations;
}

/**
 * The model relations of visual relations (each once); their ids are added to `seenRelIds`.
 * @param {VisualConnection[]} visualRelations
 * @param {Set<string>}        seenRelIds
 * @returns {ArchiRelation[]}
 */
function _viewRelations(visualRelations, seenRelIds) {
  /** @type {ArchiRelation[]} */
  const relations = [];
  for (const vr of visualRelations) {
    const rel = vr.concept;
    if (!rel || !rel.id || seenRelIds.has(rel.id)) continue;
    seenRelIds.add(rel.id);
    relations.push(rel);
  }
  return relations;
}

/**
 * Objects with an id, each id once (first occurrence kept).
 * @template {{ id: string }} T
 * @param {T[]} objects
 * @returns {T[]}
 */
function _uniqueById(objects) {
  const seen = new Set();
  return objects.filter(o => o && o.id && !seen.has(o.id) && seen.add(o.id));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildObjectSet,
    composeObjectSet,
    expandStepWithRelations,
    logCountBlock,
    findRelationsBetween,
    globalRelationMatch,
    diagramPasses,
    keptDiagramBlocks,
    mapDiagramBlockVisuals,
    countDiagramConnections,
    countDiagramObjectsInBlocks,
    stepCandidate,
  };
}
