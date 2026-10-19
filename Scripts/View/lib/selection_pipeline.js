/**
 * Selection pipeline for the View subsystem.
 *
 * Builds the object set for generate_view from the raw UI selection.
 * The shape returned is uniform across actions; the caller (orchestrator)
 * decides per-VO whether to reposition or create based on existence.
 *
 * Pipeline (uniform for NEW_VIEW / ONE_EACH / EXPAND_VIEW / LAYOUT_ONLY):
 *   1. Selection.getSelection(uiSelection, "*") + _expandViews
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

const Selection = require(REPO_ROOT + "_lib/selection");
const Defs      = require(REPO_ROOT + "View/lib/defs");
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");
const { ACTION } = Defs;

/**
 * @returns {{
 *   elements:           ArchiElement[],
 *   relations:          ArchiRelation[],
 *   diagramObjects:     DiagramObject[],     // non-connection only
 *   diagramConnections: DiagramObject[],     // edges (no positions)
 *   visualElements:     VisualElement[],     // existing on target view
 *   visualRelations:    VisualRelation[],    // existing on target view
 *   existingView:       ArchimateView | null // target view for EXPAND_VIEW / LAYOUT_ONLY
 * }}
 */
function buildObjectSet(uiSelection, preset, actionId) {
  const INDENT     = "  ";
  const debugSteps = !!preset.debug;

  // ── Step 1: model objects from selection (uniform for canvas + model-tree) ──
  console.log("Current selection:");
  const raw = Selection.getSelection(uiSelection, "*", INDENT);
  if (debugSteps) {
    const items = [];
    raw.each(o => items.push(o));
    const CAP = 20;
    items.slice(0, CAP).forEach(o => {
      const kind = (o.type || "").endsWith("-relationship") ? "relation" : "element";
      console.log(`${INDENT}  [${kind}] "${o.name || "(unnamed)"}"  ${o.type}`);
    });
    if (items.length > CAP) console.log(`${INDENT}  … +${items.length - CAP} more`);
  }
  const expanded = _expandViews(raw, INDENT);
  let collection     = expanded.modelCollection;
  let diagramObjects = expanded.diagramObjects;

  const isModifyAction = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  const isExpand       = actionId === ACTION.EXPAND_VIEW.id;

  // ── Step 1 (continued): existing view contents — target identification + per-VO existence (EXPAND_VIEW + LAYOUT_ONLY).
  const existing = _collectExistingVisuals(uiSelection, actionId, INDENT);
  // EXPAND_VIEW expands from elements selected on the view; a view picked in the model tree has no
  // such selection. The whole view is laid out, but only the steps' relations are added to it.
  if (isExpand && (existing.viewFromTree || !existing.existingView)) {
    console.error("Expand view: select one or more elements on the view (not the view in the model tree).");
    return { elements: [], relations: [], diagramObjects: [], diagramConnections: [],
             visualElements: [], visualRelations: [], existingView: null };
  }

  // ── Step 2: filter (skipped for the "Modify selected view" group — EXPAND_VIEW and
  // LAYOUT_ONLY re-layout/expand all elements already on the view; applying the filter
  // would exclude visible element types, causing containers to be sized for only the
  // filtered subset while excluded elements remain at positions outside those bounds) ──
  if (!isModifyAction) {
    _logFilter(preset.filter);
    collection     = _applyFilter(collection, preset.filter);
    diagramObjects = _applyDiagramFilter(diagramObjects, preset.filter);
  } else {
    console.log(`${INDENT}Modify-selected-view action: element-type filter skipped`);
  }

  // Filtered base counts — use jArchi selector API (ai/rules.md #11).
  const filteredElemCount = collection.filter("element").size();
  const filteredRelCount  = collection.filter("relationship").size();
  const filteredCounts    = { elems: filteredElemCount, rels: filteredRelCount, diag: diagramObjects.length };


  // ── Step 3: related-elements expansion (chain semantics; skipped for LAYOUT_ONLY) ──
  // Step 1's input is the filtered base. Step N (N≥2)'s input is step N-1's added
  // elements only — NOT the cumulative selection. An empty step terminates the chain.
  const filteredElements    = collection.filter("element");  // jArchi collection
  const filteredElementsArr = [];
  filteredElements.each(o => filteredElementsArr.push(o));   // plain array for step expansion

  // Collect relations incrementally: base uses the global relation rules; each step uses its
  // own rules so that a step only adds relations it followed.
  // For modify actions the relation-type filter is also skipped — same rationale as the
  // element filter: EXPAND_VIEW / LAYOUT_ONLY must include ALL existing relations on the
  // view (e.g. both configured nesting types), not only those matching the filter.
  // EXPAND_VIEW: the base relations are the ones drawn on the view — no missing relations between
  // elements already on it are added.
  const baseRelMatch = isModifyAction ? null : _globalRelationMatch(preset.filter);
  const allRelIds    = new Set();
  const allRelations = isExpand
    ? _viewRelations(existing.visualRelations, allRelIds)
    : _findRelationsBetween(filteredElementsArr, baseRelMatch, allRelIds);
  const filteredBaseRels = allRelations.length;

  const addedElements = [], addedRelations = [], stepCounts = [];
  if (actionId !== ACTION.LAYOUT_ONLY.id &&
      preset.relatedElements && Array.isArray(preset.relatedElements.steps)) {
    const r = _expandRelatedElements(filteredElementsArr, preset.relatedElements.steps, allRelIds, debugSteps);
    addedElements.push(...r.addedElements);
    addedRelations.push(...r.addedRelations);
    stepCounts.push(...r.stepCounts);
  }
  addedElements.forEach(o => collection.add(o));
  addedRelations.forEach(r => allRelations.push(r));

  // ── Step 4: elements are the filtered base plus step additions
  // (EXPAND_VIEW: every element on the view plus step additions, so the whole view is laid out) ──
  const elements = isExpand
    ? _uniqueById([...existing.visualElements.map(ve => ve.concept).filter(Boolean), ...addedElements])
    : [...filteredElementsArr, ...addedElements];
  if (isExpand) diagramObjects = _expandViews($(existing.existingView)).diagramObjects;

  // ── Step 5: relations collected incrementally in step 3 above (base: global filter; per step: step's filter). ──
  const relations = allRelations;

  // ── Step 6: partition diagram-model-connection (edges) from positional diagram objects ──
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection");

  // Predict on-view counts using the same algorithm the writer uses.
  const view = _predictViewCounts(elements, relations, diagramNodes.length, preset.params);

  // ── Grouped count log: filtered base → per-step adds (true deltas) → grouped totals.
  // Filtered + Σ adds = Total, exactly, by construction. Canonical vocabulary (ai/rules.md #11). ──
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
          ["diagramObjects",   view.diagramObjects],
        ] },
    ],
  });
  _logCountBlock("Pipeline — build object set:", rows);

  if (diagramConnections.length > 0) {
    console.log(`  Diagram-object edges (not laid out): ${diagramConnections.length}`);
  }

  return {
    elements,
    relations,
    diagramObjects:    diagramNodes,
    diagramConnections,
    visualElements:    existing.visualElements,
    visualRelations:   existing.visualRelations,
    existingView:      existing.existingView,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Run the related-elements expansion chain (preset.relatedElements.steps).
 * Caller guards on actionId and steps existence.
 * @returns {{ addedElements: Object[], addedRelations: Object[], stepCounts: Array }}
 */
function _expandRelatedElements(filteredElementsArr, steps, allRelIds, debugSteps) {
  const addedElements  = [];
  const addedRelations = [];
  const stepCounts     = [];
  let stepInput       = filteredElementsArr.slice();
  let cumulativeElems = filteredElementsArr.slice();
  let stepIdx = 0;
  for (const step of steps) {
    stepIdx++;
    const repeatStr = step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW ? "until nothing new" : `${Defs.repeatMaxRuns(step.repeat)}×`;
    console.log(`Step ${stepIdx} rules:  repeat: ${repeatStr}`);
    _logRules(step.rules, _describeStepRule, "    ");
    if (debugSteps) {
      const inLabel = stepInput.length === 0 ? "(empty)"
        : stepInput.length <= 6
          ? stepInput.map(e => `"${e.name}" [${e.type}]`).join(", ")
          : stepInput.slice(0, 5).map(e => `"${e.name}" [${e.type}]`).join(", ") + ` … +${stepInput.length - 5} more`;
      console.log(`Step ${stepIdx} input (${stepInput.length}): ${inLabel}`);
    }
    const { added, rels: stepRels, cumulative: newCumul, runs, capped } =
      _expandStepWithRelations(stepInput, step, cumulativeElems, allRelIds, debugSteps);
    if (step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW) {
      console.log(capped
        ? `Step ${stepIdx}: stopped at the maximum of ${Defs.REPEAT_MAX} runs — more elements may be reachable`
        : `Step ${stepIdx}: nothing new after ${runs}×`);
    }
    cumulativeElems = newCumul;
    added.forEach(o => addedElements.push(o));
    stepRels.forEach(r => addedRelations.push(r));
    stepCounts.push({ idx: stepIdx, elems: added.length, rels: stepRels.length });
    if (debugSteps && added.length > 0) {
      const CAP = 15;
      added.slice(0, CAP).forEach(o => {
        const kind = (o.type || "").endsWith("-relationship") ? "relation" : "element";
        console.log(`    [${kind}] "${o.name || "(unnamed)"}"  ${o.type}`);
      });
      if (added.length > CAP) console.log(`    … +${added.length - CAP} more`);
    }
    // Chain advance: next step's input is THIS step's additions only.
    stepInput = added;
  }
  return { addedElements, addedRelations, stepCounts };
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
 */
function _logCountBlock(title, rows) {
  const RULE = "──────────────────────────────────────────────";
  // [key (== plural), singular, plural]. The key is the user-facing plural word —
  // no abbreviations, per the canonical-vocabulary rule (ai/rules.md #11).
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
    ["folders",          "folder",           "folders"],
  ];
  const FIELD_MAP = Object.create(null);
  for (const f of FIELDS) FIELD_MAP[f[0]] = f;

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

function _logFilter(filter) {
  if (!filter) { console.log("Filter: none"); return; }
  console.log("Filter element rules:");
  _logRules(filter.elementRules, r => `${r.elementType || "all"}${r.property ? `  ${r.property}=${r.value}` : ""}`, "  ");
  console.log("Filter relation rules:");
  _logRules(filter.relationRules, _describeRelationRule, "  ");
  console.log("Filter diagram rules:");
  _logRules(filter.diagramRules, r => r.diagramType || "all", "  ");
}

function _describeRelationRule(r) {
  return `${r.source || "all"}  ${r.relation || "all"}  ${r.target || "all"}`;
}

function _describeStepRule(r) {
  const prop = r.property ? `  ${r.propertyOf}.${r.property}=${r.value}` : "";
  return `previous: ${r.previous || "all"}  ${r.direction}  relation: ${r.relation || "all"}  added: ${r.added || "all"}${prop}`;
}

/** One console line per rule ("all" when the list is empty). Off rules are marked. */
function _logRules(rules, describe, indent) {
  if (!rules || rules.length === 0) { console.log(`${indent}all`); return; }
  for (const r of rules) {
    console.log(`${indent}${r.mode === "exclude" ? "exclude" : "include"}${r.on === false ? " (off)" : ""}  ${describe(r)}`);
  }
}

/**
 * Replace any ArchimateView objects in the collection with the model elements,
 * relations and diagram objects visible on those views. Returns
 *   { modelCollection, diagramObjects }.
 */
function _expandViews(collection, logPrefix = "") {
  const viewColl = collection.filter("view");
  if (viewColl.size() === 0) return { modelCollection: collection, diagramObjects: [] };

  let expanded = collection.not("view");
  const expandedIds = new Set();
  expanded.each(o => expandedIds.add(o.id));

  const diagramObjects = [];
  const diagSeen = new Set();
  const addDiagramVO = vo => {
    if (vo && vo.id && !diagSeen.has(vo.id)) { diagSeen.add(vo.id); diagramObjects.push(vo); }
  };
  const addConcept = concept => {
    if (concept && concept.id && concept.type !== "archimate-diagram-model" &&
        !expandedIds.has(concept.id)) {
      expandedIds.add(concept.id);
      expanded.add(concept);
    }
  };

  viewColl.each(view => {
    try {
      $(view).find("element").each(ve => {
        // view-reference VOs surface in find("element") with .type "archimate-diagram-model"
        // (jArchi 1.12 quirk). Classify them as diagram objects via DIAGRAM_TYPES membership.
        if (ve.type && ve.type in Defs.DIAGRAM_TYPES) { addDiagramVO(ve); return; }
        addConcept(ve.concept || ve);
      });
    } catch (e) {}
    try {
      $(view).find("relation").each(vr => { addConcept(vr.concept || vr); });
    } catch (e) {}
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
      try { $(view).find(dt).each(dvo => { if (dvo && dvo.id) addDiagramVO(dvo); }); } catch (e) {}
    });
  });

  console.log(`${logPrefix}Expanded ${viewColl.size()} view(s) → ${expanded.size()} model objects · ${diagramObjects.length} diagram objects`);
  return { modelCollection: expanded, diagramObjects };
}

/**
 * For actions that target an existing view (EXPAND_VIEW, LAYOUT_ONLY), collect
 * the visual elements, visual relations, and the view itself from the UI selection.
 * Other actions get all-empty.
 */
function _collectExistingVisuals(uiSelection, actionId, logPrefix = "") {
  if (actionId !== ACTION.EXPAND_VIEW.id && actionId !== ACTION.LAYOUT_ONLY.id) {
    return { existingView: null, visualElements: [], visualRelations: [] };
  }

  const visualElements = [];
  const visualRelations = [];
  const seenEl = new Set(), seenRel = new Set();
  let existingView = null;

  const addVE = ve => {
    if (!ve || !ve.id || !ve.view || seenEl.has(ve.id)) return;
    // view-reference VOs sneak in via find("element"); they belong with diagram objects, not VEs.
    if (ve.type && ve.type in Defs.DIAGRAM_TYPES) return;
    seenEl.add(ve.id);
    visualElements.push(ve);
    if (!existingView) existingView = ve.view;
  };
  const addVR = vr => {
    if (!vr || !vr.id || !vr.view || seenRel.has(vr.id)) return;
    seenRel.add(vr.id);
    visualRelations.push(vr);
    if (!existingView) existingView = vr.view;
  };

  // Case 1: view selected from the model tree.
  let viewFound = false;
  try {
    uiSelection.each(o => {
      if (o.type === "archimate-diagram-model" && !o.view) {
        viewFound = true;
        existingView = o;
        try { $(o).find("element").each(addVE); } catch (e) {}
        try { $(o).find("relation").each(addVR); } catch (e) {}
      }
    });
  } catch (e) {}

  // Case 2: visual objects selected on a canvas.
  if (!viewFound) {
    try {
      Selection.getVisualSelection(uiSelection, "*").each(vo => {
        if (!vo || !vo.id || !vo.view) return;
        if (vo.concept && vo.concept.type && vo.concept.type.endsWith("-relationship")) addVR(vo);
        else addVE(vo);
      });
    } catch (e) {}
    // EXPAND_VIEW lays out the whole view, not only the selected visuals.
    if (actionId === ACTION.EXPAND_VIEW.id && existingView) {
      try { $(existingView).find("element").each(addVE); } catch (e) {}
      try { $(existingView).find("relation").each(addVR); } catch (e) {}
    }
  }

  console.log(`${logPrefix}Existing on view: ${visualElements.length} VEs · ${visualRelations.length} VRs · view: "${existingView && existingView.name || "none"}"`);
  return { existingView, visualElements, visualRelations, viewFromTree: viewFound };
}

function _applyFilter(collection, filter) {
  if (!filter) return collection;
  const { elementRules = [], relationRules = [] } = filter;
  return collection.filter(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) {
      return RuleLists.matchRelation(relationRules, type, o.source && o.source.type, o.target && o.target.type, true, o);
    }
    return RuleLists.matchElement(elementRules, o);
  });
}

function _applyDiagramFilter(diagramObjects, filter) {
  if (!filter || !filter.diagramRules || filter.diagramRules.length === 0) return diagramObjects;
  return diagramObjects.filter(o => _diagramPasses(filter.diagramRules, o.type || ""));
}

/**
 * Diagram filter test for one diagram object type. jArchi reports a view-reference object as
 * "archimate-diagram-model"; it is matched as "diagram-model-reference" (the type users pick).
 */
function _diagramPasses(rules, type) {
  return RuleLists.matchDiagram(rules, type === "archimate-diagram-model" ? "diagram-model-reference" : type);
}

/** Predicate for the global relation rules, or null when they filter nothing. */
function _globalRelationMatch(filter) {
  const rules = filter && filter.relationRules;
  if (RuleLists.isPassAll("relation", rules)) return null;
  return rel => RuleLists.matchRelation(rules, rel.type, rel.source && rel.source.type, rel.target && rel.target.type, true, rel);
}

/** Step candidate: one relation seen from one element of the previous step. */
function _stepCandidate(rel, frontier) {
  const outgoing = !!(rel.source && rel.source.id === frontier.id);
  return { rel, frontier, other: outgoing ? rel.target : rel.source, outgoing };
}

/**
 * Single source of truth for one pipeline step: expand from `base`, then collect
 * relations between the resulting cumulative element set.
 * Used by both buildObjectSet and the dialog's live counters so they can never diverge.
 *
 * @param {Object[]} base       - Step input elements (frontier for hop 1)
 * @param {Object}   step       - { repeat, rules }
 * @param {Object[]} cumulative - Elements accumulated so far (before this step)
 * @param {Set}      seenRelIds - Dedup set threaded across all steps; mutated in place
 * @param {boolean}  [verbose]  - Per-hop detail logging (pipeline debug only)
 * @returns {{ added: Object[], rels: Object[], cumulative: Object[], runs: number, capped: boolean,
 *             candidates: Object[] }}
 *   candidates — every (relation, previous-step element, new element) the step saw, before the
 *                rules; the dialog reads the property lists of the step's rules from them
 *   runs   — number of runs that added elements
 *   capped — true when the run limit was reached while the last run still added elements
 */
function _expandStepWithRelations(base, step, cumulative, seenRelIds, verbose = false) {
  const candidates = [];
  const hops   = _expandStepFrontiers(base, step, verbose, cumulative, candidates);
  const added  = hops.flat();
  const newRels = [];
  let cumul           = cumulative.slice();
  let prevHopFrontier = base;  // hop 1: step input triggered the frontier
  for (const hopFrontier of hops) {
    cumul = cumul.concat(hopFrontier);
    // Collect relations between this hop's discoveries and the collection that triggered
    // them (prevHopFrontier). Matched with the step's rules (relation type, direction and
    // previous-step type) so the traversal direction is honoured. This prevents incidental
    // relations from earlier-step elements (outside the triggering collection) being
    // collected as nesting candidates.
    const hopRels = _findRelationsBetween(cumul, (rel, el) => RuleLists.matchStepRelation(step.rules, _stepCandidate(rel, el)), seenRelIds, prevHopFrontier);
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
 */
function _expandStepFrontiers(base, step, verbose = false, cumulative = [], candidatesOut = null) {
  const rules    = step.rules || [];
  const maxRuns  = Defs.repeatMaxRuns(step.repeat);
  const baseIds  = new Set(base.map(o => o.id));
  const cumulIds = new Set(cumulative.map(o => o.id));
  const addedIds = new Set();
  const hops     = [];
  let frontier   = [...base];

  for (let hop = 0; hop < maxRuns; hop++) {
    const nextFrontier = [];
    for (const element of frontier) {
      try {
        const stats = { total: 0, accept: 0, rejected: 0, alreadySeen: 0 };
        const rejectedDetails = [];
        $(element).rels().each(rel => {
          stats.total++;
          const cand = _stepCandidate(rel, element);
          const other = cand.other;
          if (!other) return;
          if (baseIds.has(other.id) || cumulIds.has(other.id)) { stats.alreadySeen++; return; }
          if (candidatesOut) candidatesOut.push(cand);
          if (addedIds.has(other.id)) { stats.alreadySeen++; return; }

          if (!RuleLists.matchStep(rules, cand)) {
            stats.rejected++;
            if (verbose) rejectedDetails.push(`${rel.type || ""}(${cand.outgoing ? "out" : "in"})→"${other.name}"[${other.type || ""}]`);
            return;
          }

          addedIds.add(other.id);
          nextFrontier.push(other);
          stats.accept++;
        });
        if (verbose) {
          const skips = [];
          if (rejectedDetails.length > 0) {
            const shown = rejectedDetails.slice(0, 4).join(", ") + (rejectedDetails.length > 4 ? " …" : "");
            skips.push(`${stats.rejected} no rule matched: [${shown}]`);
          }
          if (stats.alreadySeen > 0) skips.push(`${stats.alreadySeen} already-selected`);
          const skipStr = skips.length ? `  (${skips.join("  |  ")})` : "";
          console.log(`    run${hop + 1} "${element.name}" [${element.type}]: ${stats.total} rels → ${stats.accept} accepted${skipStr}`);
        }
      } catch (e) {}
    }
    hops.push(nextFrontier);
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
  return hops;
}

/** Strip a synthetic occurrence suffix (`${id}_occ_N`) to recover the element id. */
function _baseId(id) {
  const i = id.indexOf("_occ_");
  return i < 0 ? id : id.substring(0, i);
}

/**
 * Walk parentMap upward from parentId; return true if childId would form a cycle.
 * Compares element ids, not occurrence ids: a fresh `X_occ_N` under an ancestor
 * that is (an occurrence of) X is still a cycle.
 */
function _wouldCycle(map, childId, parentId) {
  const childBase = _baseId(childId);
  let cur = parentId;
  while (cur) {
    if (_baseId(cur) === childBase) return true;
    cur = map[cur];
  }
  return false;
}

/**
 * Resolve nesting structure (parentMap, occurrenceMap, parentRels) given a flat
 * list of nesting relations and the relevant preset.params flags. Single source of
 * truth — used by the writer's _buildLayoutGraph AND by predictViewCounts (so dialog/
 * pipeline counters agree with what the writer will actually produce).
 *
 * Behaviour matches _buildLayoutGraph's prior inline logic:
 *   showInEveryContainer=false: first-wins; later candidates for the same child are
 *     either silently skipped (multi-parent) or skipped with a cycle log.
 *   showInEveryContainer=true:  each (child, parent) pair creates a new occurrence
 *     id when needed; cycles still skip.
 *
 * @returns {{ parentMap, occurrenceMap,
 *             parentRels: Array<{rel, srcOccId, tgtOccId}>,
 *             skippedCycle, skippedMultiParent }}
 *
 * Each parentRels entry binds a nesting relation to the specific occurrence
 * each visual endpoint should use. `srcOccId` is the occurrence id to render
 * at rel.source's end (so `view.add(rel, srcV, tgtV)` direction matches the
 * model); `tgtOccId` likewise for rel.target. For reversed relation types,
 * the child sits on the rel.source side; otherwise on the rel.target side.
 */
function _resolveNesting(elements, nestingRels, params) {
  const isReversedRel = rel => isReversed(rel, params);
  const showInEvery  = !!params.showInEveryContainer;
  const parentMap = {};
  const occurrenceMap = {};
  for (const el of elements) occurrenceMap[el.id] = [el.id];
  const parentRels = [];
  const skippedCircularNestingRels = [];
  const notNestedNestingRels = [];

  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId) continue;
    // Self-loops (oortjes) can never be containment: draw them as a connection.
    if (srcId === tgtId) { notNestedNestingRels.push(rel); continue; }
    const reversed = isReversedRel(rel);
    const [parentId, childId] = reversed ? [tgtId, srcId] : [srcId, tgtId];

    // Build a binding aligned to (rel.source, rel.target) for the writer.
    // The child's occurrence sits on the source side iff the rel is reversed.
    const pushBinding = (boundChildOcc) => {
      const srcOccId = reversed ? boundChildOcc : parentId;
      const tgtOccId = reversed ? parentId      : boundChildOcc;
      parentRels.push({ rel, srcOccId, tgtOccId });
    };

    if (!showInEvery) {
      if (parentMap[childId] === undefined) {
        if (_wouldCycle(parentMap, childId, parentId)) {
          skippedCircularNestingRels.push(rel);
        } else {
          parentMap[childId] = parentId;
          pushBinding(childId);
        }
      } else {
        notNestedNestingRels.push(rel);
      }
    } else {
      const occs = occurrenceMap[childId] || [childId];
      const unassigned = occs.find(id => parentMap[id] === undefined);
      let boundChildOcc = null;
      if (unassigned && !_wouldCycle(parentMap, unassigned, parentId)) {
        parentMap[unassigned] = parentId;
        boundChildOcc = unassigned;
      } else {
        const alreadyHere = occs.find(id => parentMap[id] === parentId);
        if (alreadyHere) {
          boundChildOcc = alreadyHere;
        } else {
          const occId = `${childId}_occ_${occs.length}`;
          if (!_wouldCycle(parentMap, occId, parentId)) {
            occurrenceMap[childId] = [...occs, occId];
            parentMap[occId] = parentId;
            boundChildOcc = occId;
          }
        }
      }
      if (boundChildOcc) pushBinding(boundChildOcc);
    }
  }

  // When showInEveryContainer is on, propagate each container's children into
  // every extra occurrence so they don't render as empty boxes.
  if (showInEvery) {
    _propagateExtraOccurrences(elements, nestingRels, isReversedRel, parentMap, occurrenceMap, parentRels);
  }

  return { parentMap, occurrenceMap, parentRels, skippedCircularNestingRels, notNestedNestingRels };
}

/**
 * BFS propagation: replicate each container's direct children into its extra
 * occurrences (created when showInEveryContainer is on). Mutates parentMap,
 * occurrenceMap, and parentRels in place.
 */
function _propagateExtraOccurrences(elements, nestingRels, isReversedRel, parentMap, occurrenceMap, parentRels) {
  // Build parentBaseId → [{rel, childId, reversed}] from the original nesting rels.
  const childRelsByParent = {};
  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId || srcId === tgtId) continue;
    const reversed = isReversedRel(rel);
    const [parentId, childId] = reversed ? [tgtId, srcId] : [srcId, tgtId];
    if (!childRelsByParent[parentId]) childRelsByParent[parentId] = [];
    childRelsByParent[parentId].push({ rel, childId, reversed });
  }

  // Seed queue from every extra occurrence created in the initial pass.
  const queue = [];
  for (const el of elements) {
    const occurrences = occurrenceMap[el.id] || [];
    for (const extraOccId of occurrences.slice(1))  // index 0 is the primary
      queue.push({ primaryBaseId: el.id, extraOccId });
  }

  // BFS: replicate each container's direct children into each extra occurrence.
  while (queue.length > 0) {
    const { primaryBaseId, extraOccId } = queue.shift();
    for (const { rel, childId, reversed } of (childRelsByParent[primaryBaseId] || [])) {
      if (!occurrenceMap[childId]) continue;
      const childOccurrences = occurrenceMap[childId];
      if (childOccurrences.some(id => parentMap[id] === extraOccId)) continue;
      const newOccId = `${childId}_occ_${childOccurrences.length}`;
      if (!_wouldCycle(parentMap, newOccId, extraOccId)) {
        occurrenceMap[childId] = [...childOccurrences, newOccId];
        parentMap[newOccId]    = extraOccId;
        const srcOccId = reversed ? newOccId   : extraOccId;
        const tgtOccId = reversed ? extraOccId : newOccId;
        parentRels.push({ rel, srcOccId, tgtOccId });
        queue.push({ primaryBaseId: childId, extraOccId: newOccId });
      }
    }
  }
}

/**
 * Is this relation reversed (params.reverseRules)? Reversed relations are laid out from target
 * to source and, when nested, have the target as parent. Single source of truth for the
 * writer, the layout graph and the counters.
 */
function isReversed(rel, params) {
  const rules = params.reverseRules;
  if (!rules || rules.length === 0) return false;
  return RuleLists.matchRelation(rules, rel.type, rel.source && rel.source.type, rel.target && rel.target.type, false, rel);
}

/**
 * Split relations into nesting candidates and connections. Single source of truth for
 * the writer (generate_view) and predictViewCounts, so dialog counts match the output.
 *
 * A relation is a nesting candidate when it matches params.nestingRules (relation type,
 * source / target element type and property condition; the parent is the source, or the target for a reversed
 * relation). Every other relation is a connection.
 *
 * @returns {{ nestingRels: Object[], connectionRels: Object[] }}
 */
function _splitNestingRels(relations, params) {
  const rules          = params.nestingRules || [];
  const nestingRels    = [];
  const connectionRels = [];
  for (const rel of relations) {
    const isNesting = rules.length > 0 &&
      RuleLists.matchRelation(rules, rel.type, rel.source && rel.source.type, rel.target && rel.target.type, false, rel);
    (isNesting ? nestingRels : connectionRels).push(rel);
  }
  return { nestingRels, connectionRels };
}

/**
 * Predict the counts that will appear on the generated view, given the pipeline's
 * elements + relations + the current preset.params. Used by both the pipeline log
 * and the dialog's live counter so what the user sees matches what gets written.
 *
 * Returned shape follows the canonical vocabulary (ai/rules.md #11):
 *   elements         — unique model concepts (= containers + nestedElements + standalones)
 *   containers       — elements with ≥1 child
 *   nestedElements   — elements inside a container; not themselves a container
 *   standalones      — elements at view root with no children
 *   extraOccurrences — extra visual appearances (showInEveryContainer)
 *   relations        — total inter-element relations (= nestings + connections)
 *   nestings         — relations drawn as box-in-box
 *   connections      — relations drawn as a line
 *   diagramObjects   — canvas-only positional objects
 */
function _predictViewCounts(elements, relations, diagramNodeCount, params) {
  const { nestingRels, connectionRels } = _splitNestingRels(relations, params);
  const { parentMap, occurrenceMap, parentRels, notNestedNestingRels } = _resolveNesting(elements, nestingRels, params);
  // skippedCircularNestingRels not needed here: circular rels don't affect view counts
  // Sum of (occurrences - 1) over every element — extra appearances.
  let extraOccurrences = 0;
  for (const elId of Object.keys(occurrenceMap)) {
    extraOccurrences += Math.max(0, occurrenceMap[elId].length - 1);
  }

  // Categorise elements by role in the nesting tree. parentMap keys may include
  // synthetic occurrence ids (`${id}_occ_N`); normalise to the underlying element id
  // so the role categorisation is on unique concepts, not visual appearances.
  const containerIds = new Set();
  for (const childId of Object.keys(parentMap)) containerIds.add(parentMap[childId]);
  // `parentMap` keys: ids that have a parent. Normalise occurrence ids back to base.
  const childIds = new Set();
  for (const k of Object.keys(parentMap)) childIds.add(_baseId(k));

  let nestedElements = 0, standalones = 0;
  for (const el of elements) {
    if (containerIds.has(el.id)) continue;          // counted as container
    if (childIds.has(el.id))     nestedElements++;
    else                         standalones++;
  }

  return {
    elements:         elements.length,
    containers:       containerIds.size,
    nestedElements,
    standalones,
    extraOccurrences,
    relations:        relations.length,
    nestings:         parentRels.length,
    connections:      connectionRels.length + notNestedNestingRels.length,
    diagramObjects:   diagramNodeCount || 0,
  };
}

/**
 * Find all relations whose source AND target are both in `elements`.
 * @param {Function|null} [match]    (relation, iteratedElement) => boolean. null = all relations.
 * @param {Set}      [seenRelIds]    Optional external dedup set — mutated in place so the caller
 *                                   can thread it across successive calls to prevent double-counting.
 * @param {Object[]} [iterateSubset] Optional subset of elements to iterate. Both endpoints are
 *                                   still checked against the full `elements` set. Pass the
 *                                   pre-step cumulative snapshot to exclude new×new relations.
 *                                   Defaults to `elements`.
 */
function _findRelationsBetween(elements, match, seenRelIds, iterateSubset) {
  if (elements.length === 0) return [];
  const elementIds = new Set(elements.map(e => e.id));
  const seen       = seenRelIds || new Set();
  const toIterate  = iterateSubset || elements;
  const relations  = [];
  for (const element of toIterate) {
    try {
      $(element).rels().filter(rel => {
        if (seen.has(rel.id)) return false;
        const srcId = rel.source && rel.source.id;
        const tgtId = rel.target && rel.target.id;
        if (!srcId || !tgtId || !elementIds.has(srcId) || !elementIds.has(tgtId)) return false;
        return !match || match(rel, element);
      }).each(rel => {
        seen.add(rel.id);
        relations.push(rel);
      });
    } catch (e) {}
  }
  return relations;
}

/** The model relations of visual relations (each once); their ids are added to `seenRelIds`. */
function _viewRelations(visualRelations, seenRelIds) {
  const relations = [];
  for (const vr of visualRelations) {
    const rel = vr.concept;
    if (!rel || !rel.id || seenRelIds.has(rel.id)) continue;
    seenRelIds.add(rel.id);
    relations.push(rel);
  }
  return relations;
}

/** Objects with an id, each id once (first occurrence kept). */
function _uniqueById(objects) {
  const seen = new Set();
  return objects.filter(o => o && o.id && !seen.has(o.id) && seen.add(o.id));
}

/**
 * Raw model elements from the Archi UI selection, before any preset filter or
 * related-elements expansion. Views in the selection are expanded to their
 * elements (same as buildObjectSet step 1). Relations, folders, and view nodes
 * are excluded. Used by ONE_EACH to determine the seed set.
 *
 * @param {ArchiCollection} uiSelection  $(selection) from Archi UI
 * @returns {Object[]}  array of jArchi model element objects
 */
function getSeedElements(uiSelection) {
  const raw = Selection.getSelection(uiSelection, "*");
  const { modelCollection } = _expandViews(raw);
  const seeds = [];
  modelCollection.filter("element").each(o => seeds.push(o));
  return seeds;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildObjectSet,
    getSeedElements,
    expandStepWithRelations:  _expandStepWithRelations,
    logCountBlock:            _logCountBlock,
    findRelationsBetween:     _findRelationsBetween,
    splitNestingRels:         _splitNestingRels,
    isReversed,
    globalRelationMatch:      _globalRelationMatch,
    diagramPasses:            _diagramPasses,
    stepCandidate:            _stepCandidate,
    resolveNesting:           _resolveNesting,
    predictViewCounts:        _predictViewCounts,
  };
}
