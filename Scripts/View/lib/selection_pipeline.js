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

/** @type {typeof import("../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");
const { ACTION } = Defs;

/**
 * @param {ArchiCollection<ArchiObject>} uiSelection  $(selection) from Archi UI
 * @param {MaskedPreset}                 preset
 * @param {string}                       actionId     ACTION.*.id
 * @returns {ObjectSet}  visuals: visualElements described (chain, managed; describeVisuals)
 */
function buildObjectSet(uiSelection, preset, actionId) {
  const INDENT     = "  ";

  // ── Step 1: model objects from selection (uniform for canvas + model-tree) ──
  console.log("Current selection:");
  const raw = Selection.getSelection(uiSelection, "*", INDENT);
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
             visualElements: [], visualRelations: [], existingView: null, visuals: [],
             diagramBlockOf: new Map(), diagramBlockVisualOf: new Map() };
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
  // Cast: the model collection holds concepts (diagram objects were split off), so "element" selects model elements.
  const filteredElements    = /** @type {ArchiCollection<ArchiElement>} */ (collection.filter("element"));  // jArchi collection
  /** @type {ArchiElement[]} */
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
  /** @type {Set<string>} */
  const allRelIds    = new Set();
  const allRelations = isExpand
    ? _viewRelations(existing.visualRelations, allRelIds)
    : _findRelationsBetween(filteredElementsArr, baseRelMatch, allRelIds);
  const filteredBaseRels = allRelations.length;

  /** @type {ArchiElement[]} */
  const addedElements = [];
  /** @type {ArchiRelation[]} */
  const addedRelations = [];
  /** @type {StepCount[]} */
  const stepCounts = [];
  if (actionId !== ACTION.LAYOUT_ONLY.id &&
      preset.relatedElements && Array.isArray(preset.relatedElements.steps)) {
    const r = _expandRelatedElements(filteredElementsArr, preset.relatedElements.steps, allRelIds);
    addedElements.push(...r.addedElements);
    addedRelations.push(...r.addedRelations);
    stepCounts.push(...r.stepCounts);
  }
  addedElements.forEach(o => collection.add(o));
  addedRelations.forEach(r => allRelations.push(r));

  // ── Step 4: elements are the filtered base plus step additions
  // (EXPAND_VIEW: every element on the view plus step additions, so the whole view is laid out) ──
  const viewElements = isExpand
    ? _uniqueById([.../** @type {ArchiElement[]} */ (existing.visualElements.map(ve => ve.concept).filter(Boolean)), ...addedElements])   // Cast: nulls filtered
    : [...filteredElementsArr, ...addedElements];

  // Diagram-blocks: a diagram object with contents (a legend, a frame) moves as one object with all it
  // holds; its contents are not laid out. An element that appears only inside a diagram-block is not laid out.
  const diagramBlockOf = isModifyAction ? _diagramBlockContents(existing.existingView) : new Map();
  /** @type {Map<string, string>} */
  const diagramBlockVisualOf = new Map();
  /** @type {Set<string>} */
  const outsideDiagramBlocks = new Set();
  for (const ve of existing.visualElements) {
    const cid = ve.concept && ve.concept.id;
    if (!cid) continue;
    if (!diagramBlockOf.has(String(ve.id))) outsideDiagramBlocks.add(cid);
    else if (!diagramBlockVisualOf.has(cid)) diagramBlockVisualOf.set(cid, String(ve.id));
  }
  for (const cid of outsideDiagramBlocks) diagramBlockVisualOf.delete(cid);
  const elements = viewElements.filter(el => !diagramBlockVisualOf.has(el.id));
  if (isExpand) diagramObjects = _expandViews($(/** @type {ArchiView} */ (existing.existingView))).diagramObjects;   // Cast: checked at the start

  // ── Step 5: relations collected incrementally in step 3 above (base: global filter; per step: step's filter). ──
  const relations = allRelations;

  // ── Step 6: partition diagram-model-connection (edges) from positional diagram objects ──
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection" && !diagramBlockOf.has(String(o.id)));

  // Predict on-view counts using the same algorithm the writer uses.
  const visuals = _describeVisuals(existing.visualElements.filter(ve => !diagramBlockOf.has(String(ve.id))));
  const view = _predictViewCounts(elements, relations, diagramNodes.length, preset.params, visuals);

  // ── Grouped count log: filtered base → per-step adds (true deltas) → grouped totals.
  // Filtered + Σ adds = Total, exactly, by construction. Canonical vocabulary (ai/rules.md #11). ──
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
          ["diagramObjects",   view.diagramObjects],
        ] },
    ],
  });
  _logCountBlock("Pipeline — build object set:", rows);

  if (diagramConnections.length > 0) {
    console.log(`  Diagram-object edges (laid out with the connections): ${diagramConnections.length}`);
  }
  if (diagramBlockOf.size > 0) {
    console.log(`  Diagram-blocks: ${new Set(diagramBlockOf.values()).size} diagram objects with contents, moved as one with ${diagramBlockOf.size} objects inside`);
  }

  return {
    elements,
    relations,
    diagramObjects:    diagramNodes,
    diagramConnections,
    visualElements:    existing.visualElements,
    visualRelations:   existing.visualRelations,
    existingView:      existing.existingView,
    diagramBlockOf,
    diagramBlockVisualOf,
    visuals,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Run the related-elements expansion chain (preset.relatedElements.steps).
 * Caller guards on actionId and steps existence.
 * @param {ArchiElement[]} filteredElementsArr
 * @param {Step[]}         steps
 * @param {Set<string>}    allRelIds   dedup set, mutated
 * @returns {{ addedElements: ArchiElement[], addedRelations: ArchiRelation[], stepCounts: StepCount[] }}
 */
function _expandRelatedElements(filteredElementsArr, steps, allRelIds) {
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
    const repeatStr = step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW ? "until nothing new" : `${Defs.repeatMaxRuns(step.repeat)}×`;
    console.log(`Step ${stepIdx} rules:  repeat: ${repeatStr}`);
    _logRules(step.rules, _describeStepRule, "    ");
    const { added, rels: stepRels, cumulative: newCumul, runs, capped } =
      _expandStepWithRelations(stepInput, step, cumulativeElems, allRelIds);
    if (step.repeat === Defs.REPEAT_UNTIL_NOTHING_NEW) {
      console.log(capped
        ? `Step ${stepIdx}: stopped at the maximum of ${Defs.REPEAT_MAX} runs — more elements may be reachable`
        : `Step ${stepIdx}: nothing new after ${runs}×`);
    }
    cumulativeElems = newCumul;
    added.forEach(o => addedElements.push(o));
    stepRels.forEach(r => addedRelations.push(r));
    stepCounts.push({ idx: stepIdx, elems: added.length, rels: stepRels.length });
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
 * @param {string}     title
 * @param {CountRow[]} rows
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
  console.log("Filter element rules:");
  _logRules(filter.elementRules, r => `${r.elementType || "all"}${r.property ? `  ${r.property}=${r.value}` : ""}`, "  ");
  console.log("Filter relation rules:");
  _logRules(filter.relationRules, _describeRelationRule, "  ");
  console.log("Filter diagram rules:");
  _logRules(filter.diagramRules, r => r.diagramType || "all", "  ");
}

/** @param {RelationRule} r */
function _describeRelationRule(r) {
  return `${r.source || "all"}  ${r.relation || "all"}  ${r.target || "all"}`;
}

/** @param {StepRule} r */
function _describeStepRule(r) {
  const prop = r.property ? `  ${r.propertyOf}.${r.property}=${r.value}` : "";
  return `previous: ${r.previous || "all"}  ${r.direction}  relation: ${r.relation || "all"}  added: ${r.added || "all"}${prop}`;
}

/**
 * One console line per rule ("all" when the list is empty). Off rules are marked.
 * @template {{ on?: boolean, mode?: RuleMode }} R
 * @param {R[] | undefined}      rules
 * @param {(rule: R) => string}  describe
 * @param {string}               indent
 */
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
 * @param {ArchiCollection<ArchiObject>} collection
 * @param {string} [logPrefix]
 * @returns {{ modelCollection: ArchiCollection<ArchiObject>, diagramObjects: DiagramObject[] }}
 */
function _expandViews(collection, logPrefix = "") {
  const viewColl = collection.filter("view");
  if (viewColl.size() === 0) return { modelCollection: collection, diagramObjects: [] };

  let expanded = collection.not("view");
  /** @type {Set<string>} */
  const expandedIds = new Set();
  expanded.each(o => expandedIds.add(o.id));

  /** @type {DiagramObject[]} */
  const diagramObjects = [];
  /** @type {Set<string>} */
  const diagSeen = new Set();
  const addDiagramVO = (/** @type {DiagramObject} */ vo) => {
    if (vo && vo.id && !diagSeen.has(vo.id)) { diagSeen.add(vo.id); diagramObjects.push(vo); }
  };
  const addConcept = (/** @type {ArchiObject} */ concept) => {
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
 * Contents of diagram-blocks: every diagram object with no diagram object above it (a group, a note) holds
 * a diagram-block of everything inside it. Returns visual id → diagram-block id, for the visuals inside a diagram-block.
 * @param {ArchiView | null} view
 * @returns {Map<string, string>}
 */
function _diagramBlockContents(view) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!view) return out;
  /** @type {(o: ArchiObject | null | undefined) => boolean} */
  const isDiagramObject = o => !!o && !!o.type && o.type in Defs.DIAGRAM_TYPES;
  for (const dt of Object.keys(Defs.DIAGRAM_TYPES)) {
    if (dt === "diagram-model-connection") continue;
    try {
      $(view).find(dt).each(d => {
        // Cast: parent() of a visual is a visual, or the view (which has no .view).
        for (let p = /** @type {VisualObject | null} */ ($(d).parent().first()); p && p.view; p = /** @type {VisualObject | null} */ ($(p).parent().first())) {
          if (isDiagramObject(p)) return;   // inside another diagram object: part of that diagram-block
        }
        $(d).find().each(o => {
          if (!o || !o.id || o.type === "diagram-model-connection" || (o.type || "").endsWith("-relationship")) return;
          out.set(String(o.id), String(d.id));
        });
      });
    } catch (e) {}
  }
  return out;
}

/**
 * For actions that target an existing view (EXPAND_VIEW, LAYOUT_ONLY), collect
 * the visual elements, visual relations, and the view itself from the UI selection.
 * Other actions get all-empty.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string} actionId
 * @param {string} [logPrefix]
 * @returns {{ existingView: ArchiView | null, visualElements: VisualObject[], visualRelations: VisualConnection[], viewFromTree?: boolean }}
 */
function _collectExistingVisuals(uiSelection, actionId, logPrefix = "") {
  if (actionId !== ACTION.EXPAND_VIEW.id && actionId !== ACTION.LAYOUT_ONLY.id) {
    return { existingView: null, visualElements: [], visualRelations: [] };
  }

  /** @type {VisualObject[]} */
  const visualElements = [];
  /** @type {VisualConnection[]} */
  const visualRelations = [];
  /** @type {Set<string>} */
  const seenEl = new Set();
  /** @type {Set<string>} */
  const seenRel = new Set();
  // Cast: assigned inside addVE / addVR, which tsc does not follow; keep the declared type wide.
  let existingView = /** @type {ArchiView | null} */ (null);

  const addVE = (/** @type {VisualObject} */ ve) => {
    if (!ve || !ve.id || !ve.view || seenEl.has(ve.id)) return;
    // view-reference VOs sneak in via find("element"); they belong with diagram objects, not VEs.
    if (ve.type && ve.type in Defs.DIAGRAM_TYPES) return;
    seenEl.add(ve.id);
    visualElements.push(ve);
    if (!existingView) existingView = ve.view;
  };
  const addVR = (/** @type {VisualConnection} */ vr) => {
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
        const view = /** @type {ArchiView} */ (o);   // Cast: type is archimate-diagram-model and it is not a visual
        existingView = view;
        try { $(view).find("element").each(addVE); } catch (e) {}
        try { $(view).find("relation").each(addVR); } catch (e) {}
      }
    });
  } catch (e) {}

  // Case 2: visual objects selected on a canvas.
  if (!viewFound) {
    try {
      Selection.getVisualSelection(uiSelection, "*").each(vo => {
        if (!vo || !vo.id || !vo.view) return;
        // Casts: a visual whose concept is a relationship is a connection.
        if (vo.concept && vo.concept.type && vo.concept.type.endsWith("-relationship")) addVR(/** @type {VisualConnection} */ (vo));
        else addVE(/** @type {VisualObject} */ (vo));
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

/**
 * @param {ArchiCollection<ArchiObject>} collection
 * @param {Preset["filter"] | undefined} filter
 * @returns {ArchiCollection<ArchiObject>}
 */
function _applyFilter(collection, filter) {
  if (!filter) return collection;
  const { elementRules = [], relationRules = [] } = filter;
  return collection.filter(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) {
      const rel = /** @type {ArchiRelation} */ (o);   // Cast: the type tells relations from elements.
      return RuleLists.matchRelation(relationRules, type, rel.source && rel.source.type,
        rel.target && rel.target.type, true, rel);
    }
    return RuleLists.matchElement(elementRules, /** @type {ArchiElement} */ (o));
  });
}

/**
 * @param {DiagramObject[]}              diagramObjects
 * @param {Preset["filter"] | undefined} filter
 * @returns {DiagramObject[]}
 */
function _applyDiagramFilter(diagramObjects, filter) {
  if (!filter || !filter.diagramRules || filter.diagramRules.length === 0) return diagramObjects;
  return diagramObjects.filter(o => _diagramPasses(filter.diagramRules, o.type || ""));
}

/**
 * Diagram filter test for one diagram object type. jArchi reports a view-reference object as
 * "archimate-diagram-model"; it is matched as "diagram-model-reference" (the type users pick).
 * @param {DiagramRule[]} rules
 * @param {string}        type
 */
function _diagramPasses(rules, type) {
  return RuleLists.matchDiagram(rules, type === "archimate-diagram-model" ? "diagram-model-reference" : type);
}

/**
 * Predicate for the global relation rules, or null when they filter nothing.
 * @param {Preset["filter"] | undefined} filter
 * @returns {((rel: ArchiRelation) => boolean) | null}
 */
function _globalRelationMatch(filter) {
  const rules = filter && filter.relationRules;
  if (RuleLists.isPassAll("relation", rules)) return null;
  // Cast: isPassAll is true for an absent list.
  return rel => RuleLists.matchRelation(/** @type {RelationRule[]} */ (rules), rel.type, rel.source && rel.source.type, rel.target && rel.target.type, true, rel);
}

/**
 * Step candidate: one relation seen from one element of the previous step. Null when the other
 * end is a relation (ArchiMate allows a relation on a relation): a step adds elements only.
 * @param {ArchiRelation} rel
 * @param {ArchiElement}  frontier
 * @returns {StepCandidate | null}
 */
function _stepCandidate(rel, frontier) {
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
 * @param {ArchiElement[]} base       - Step input elements (frontier for hop 1)
 * @param {Step}           step       - { repeat, rules }
 * @param {ArchiElement[]} cumulative - Elements accumulated so far (before this step)
 * @param {Set<string>}    seenRelIds - Dedup set threaded across all steps; mutated in place
 * @returns {StepExpansion}
 *   candidates — every (relation, previous-step element, new element) the step saw, before the
 *                rules; the dialog reads the property lists of the step's rules from them
 *   runs   — number of runs that added elements
 *   capped — true when the run limit was reached while the last run still added elements
 */
function _expandStepWithRelations(base, step, cumulative, seenRelIds) {
  /** @type {StepCandidate[]} */
  const candidates = [];
  const hops   = _expandStepFrontiers(base, step, cumulative, candidates);
  const added  = hops.flat();
  /** @type {ArchiRelation[]} */
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
    const hopRels = _findRelationsBetween(cumul, (/** @type {ArchiRelation} */ rel, /** @type {ArchiElement} */ el) => {
      const cand = _stepCandidate(rel, el);
      return !!cand && RuleLists.matchStepRelation(step.rules, cand);
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
 * @param {ArchiElement[]}         base
 * @param {Step}                   step
 * @param {ArchiElement[]}         [cumulative]
 * @param {StepCandidate[] | null} [candidatesOut]  filled with every candidate seen
 * @returns {ArchiElement[][]}
 */
function _expandStepFrontiers(base, step, cumulative = [], candidatesOut = null) {
  const rules    = step.rules || [];
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
      try {
        $(element).rels().each(rel => {
          const cand = _stepCandidate(rel, element);
          if (!cand) return;
          const other = cand.other;
          if (baseIds.has(other.id) || cumulIds.has(other.id)) return;
          if (candidatesOut) candidatesOut.push(cand);
          if (addedIds.has(other.id)) return;
          if (!RuleLists.matchStep(rules, cand)) return;
          addedIds.add(other.id);
          nextFrontier.push(other);
        });
      } catch (e) {}
    }
    hops.push(nextFrontier);
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
  return hops;
}

/**
 * Strip a synthetic occurrence suffix (`${id}_occ_N`) to recover the element id.
 * @param {string} id
 */
function _baseId(id) {
  const i = id.indexOf("_occ_");
  return i < 0 ? id : id.substring(0, i);
}

/**
 * Order elements by name, then id — plain code-point order, so it never depends on the locale.
 * @param {{ id: string, name?: string } | undefined} a
 * @param {{ id: string, name?: string } | undefined} b
 */
function _byNameThenId(a, b) {
  const na = (a && a.name) || "", nb = (b && b.name) || "";
  if (na !== nb) return na < nb ? -1 : 1;
  // Casts: callers compare elements that exist.
  return /** @type {{ id: string }} */ (a).id < /** @type {{ id: string }} */ (b).id ? -1 : /** @type {{ id: string }} */ (a).id > /** @type {{ id: string }} */ (b).id ? 1 : 0;
}

/**
 * Placement of an occurrence: element id and its container chain up to the view root.
 * @template {string | null} E
 * @param {E}        elementId
 * @param {string[]} chain
 * @returns {string | E}
 */
function _placementKey(elementId, chain) {
  return chain.length ? `${elementId} in ${chain.join(" in ")}` : elementId;
}

/**
 * @typedef {{ id: string, conceptId: string | null, parentVisualId: string | null }} RawVisual  one visual as read from the view
 */

/**
 * Classify the element visuals of one view as managed or user content (SPEC: Managed
 * occurrences, step 1). Pure — runs in Node.
 *   1. A visual whose placement matches a record is managed; each record matches one visual,
 *      the first in view order.
 *   2. An element without user content: its first visual becomes user content.
 *   3. A managed visual holding user content becomes user content.
 * @param {RawVisual[]} raw  all element visuals of the view, view order;
 *   diagram objects (notes, groups) with conceptId null — never managed, always user content
 * @param {string[]} records  PROP_MANAGED_OCCURRENCE values on the view
 * @returns {VisualDescription[]}  view order
 */
function _classifyVisuals(raw, records) {
  // Map keys include null (no parent visual): get(null) is simply undefined.
  /** @type {Map<string | null, RawVisual>} */
  const byId = new Map(raw.map(v => [v.id, v]));
  /** @type {Map<string | null, number>} */
  const left = new Map();
  for (const r of (records || [])) left.set(r, (left.get(r) || 0) + 1);
  const out = raw.map(v => {
    /** @type {string[]} */
    const chain = [];
    // Cast: a parent visual is an element visual (describeVisuals filters parents on "element").
    for (let p = byId.get(v.parentVisualId); p; p = byId.get(p.parentVisualId)) chain.push(/** @type {string} */ (p.conceptId));
    const key = _placementKey(v.conceptId, chain);
    const managed = !!v.conceptId && chain.length > 0 && (left.get(key) || 0) > 0;
    if (managed) left.set(key, /** @type {number} */ (left.get(key)) - 1);   // Cast: > 0 checked above
    return { id: v.id, conceptId: v.conceptId, parentVisualId: v.parentVisualId || null, chain, managed };
  });
  /** @type {Map<string | null, VisualDescription>} */
  const outById = new Map(out.map(v => [v.id, v]));
  const hasUser = new Set(out.filter(v => !v.managed).map(v => v.conceptId));
  for (const v of out) {
    if (!v.conceptId || hasUser.has(v.conceptId)) continue;
    v.managed = false;
    hasUser.add(v.conceptId);
  }
  for (const v of out) {
    if (v.managed) continue;
    for (let p = outById.get(v.parentVisualId); p && p.managed; p = outById.get(p.parentVisualId)) p.managed = false;
  }
  return out;
}

/**
 * Describe visual elements for nesting resolution and pairing: per visual its element, parent
 * visual, container chain and whether it is managed. Classified over the whole view (records,
 * contents of containers), returned for the given visuals only, in view order.
 * @param {DiagramObject[]} visualElements  visual elements of one view (the VisualSet, or the dialog's
 *   selection); other visuals in the list (a selected connection) are left out
 * @returns {VisualDescription[]}
 */
function _describeVisuals(visualElements) {
  const wanted = new Set((visualElements || []).filter(ve => ve && ve.id).map(ve => String(ve.id)));
  if (wanted.size === 0) return [];
  const first = visualElements.find(ve => ve && ve.view);
  if (!first) return [];
  const view = first.view;
  /** @type {RawVisual[]} */
  const raw = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const parentOf = (/** @type {DiagramObject} */ o) => { try { const p = $(o).parent().filter("element").first(); return p ? String(p.id) : null; } catch (e) { return null; } };
  try {
    $(view).find("element").each(ve => {
      if (!ve.concept || !ve.concept.id || ve.type in Defs.DIAGRAM_TYPES) return;
      seen.add(String(ve.id));
      raw.push({ id: String(ve.id), conceptId: ve.concept.id, parentVisualId: parentOf(ve) });
    });
    // Notes, groups, view references: user content, so a managed container holding one is kept.
    for (const dt of Object.keys(Defs.DIAGRAM_TYPES)) {
      if (dt === "diagram-model-connection") continue;
      try { $(view).find(dt).each(o => {
        if (seen.has(String(o.id))) return;   // a view reference is found under two types
        seen.add(String(o.id));
        raw.push({ id: String(o.id), conceptId: null, parentVisualId: parentOf(o) });
      }); } catch (e) {}
    }
  } catch (e) { console.error(`Failed to read the visuals of view "${view && view.name}": ${e}`); }
  /** @type {string[]} */
  let records = [];
  try { records = [...(view.prop(Defs.PROP_MANAGED_OCCURRENCE, true) || [])].map(String); } catch (e) {}
  return _classifyVisuals(raw, records).filter(v => wanted.has(v.id));
}

/**
 * Pair occurrences with the visuals on the view (SPEC: Managed occurrences, step 3).
 * Per element user content first, then managed visuals; each takes a free occurrence with its own
 * container chain, else one with the same direct container, else any. A user visual left over
 * becomes an extra occurrence at view root — only the settings nest; a managed one is removed.
 * Extends occurrenceMap and parentMap in place.
 * @param {ArchiElement[]}               elements
 * @param {Record<string, string[]>}     occurrenceMap  extended in place
 * @param {Record<string, string>}       parentMap      extended in place
 * @param {VisualDescription[] | undefined} visuals
 * @returns {VisualPairing}
 *   visualOf: occurrence id → visual id; occurrenceOf: visual id → occurrence id;
 *   managedOccs: occurrences that are managed after the run (paired with a managed visual, or new
 *   while the element has other content); userAtRoot: user visuals the settings place nowhere, laid out at view root
 */
function _pairVisuals(elements, occurrenceMap, parentMap, visuals) {
  const chainOf = (/** @type {string} */ occ) => { const c = []; for (let p = parentMap[occ]; p; p = parentMap[p]) c.push(_baseId(p)); return c; };
  /** @type {Map<string, VisualDescription[]>} */
  const byConcept = new Map();
  for (const v of (visuals || [])) {
    // Cast: a visual without a concept (note, group) has no occurrence, so the first test skips it.
    const conceptId = /** @type {string} */ (v.conceptId);
    if (!occurrenceMap[conceptId]) continue;   // element not laid out: visual left as it is
    _pushTo(byConcept, conceptId, v);
  }
  /** @type {Record<string, string>} */
  const visualOf = {};
  /** @type {Map<string, string>} */
  const occurrenceOf = new Map();
  /** @type {string[]} */
  const removedVisualIds = [];
  /** @type {Set<string>} */
  const managedOccs = new Set();
  /** @type {VisualDescription[]} */
  const leftover = [];
  for (const el of elements) {
    const occs = occurrenceMap[el.id];
    const vis = byConcept.get(el.id) || [];
    const free = occs.map(occ => ({ occ, key: _placementKey(el.id, chainOf(occ)), direct: _baseId(parentMap[occ] || "") }));
    /** @type {(v: VisualDescription, test: (f: { occ: string, key: string | null, direct: string }) => boolean) => boolean} */
    const take = (v, test) => {
      const i = free.findIndex(test);
      if (i < 0) return false;
      const { occ } = free.splice(i, 1)[0];
      visualOf[occ] = v.id;
      occurrenceOf.set(v.id, occ);
      if (v.managed) managedOccs.add(occ);
      return true;
    };
    for (const group of [vis.filter(v => !v.managed), vis.filter(v => v.managed)]) {
      let rest = group.filter(v => !take(v, f => f.key === _placementKey(el.id, v.chain)));
      rest = rest.filter(v => !take(v, f => f.direct === (v.chain[0] || "")));
      rest = rest.filter(v => !take(v, () => true));
      for (const v of rest) (v.managed ? removedVisualIds.push(v.id) : leftover.push(v));
    }
    // New occurrences are managed — except the first while the element has no user content.
    const user = vis.some(v => !v.managed);
    free.forEach((f, i) => { if (user || i > 0) managedOccs.add(f.occ); });
  }
  // Leftover user visuals: an occurrence of their own at view root. Only the settings nest: the
  // container a visual sits in on the view is not kept.
  for (const v of leftover) {
    const conceptId = /** @type {string} */ (v.conceptId);   // Cast: leftovers are element visuals
    const occ = `${conceptId}_occ_${occurrenceMap[conceptId].length}`;
    occurrenceMap[conceptId] = [...occurrenceMap[conceptId], occ];
    visualOf[occ] = v.id;
    occurrenceOf.set(v.id, occ);
  }
  return { visualOf, occurrenceOf, removedVisualIds, managedOccs, userAtRoot: leftover.length };
}

/**
 * Visual relations of the nested relations (SPEC: Writer parenthood): per binding the one
 * between its two paired visuals is kept; every other visual relation of a nested relation is
 * removed — what is shown as nesting is not also shown as a line. Pure — runs in Node.
 * @param {ParentRel[]}            parentRels  nesting bindings
 * @param {Record<string, string>} visualOf  occurrence id → visual id (pairing)
 * @param {VisualConnection[] | undefined} visualRelations  visual relations on the view
 * @returns {{ keptVrIds: Array<string|null>, removedVrIds: string[] }}
 *   keptVrIds per binding (null: none on the view, to be added)
 */
function _nestingConnections(parentRels, visualOf, visualRelations) {
  /** @type {Map<string, VisualConnection[]>} */
  const byRel = new Map();
  for (const vr of (visualRelations || [])) {
    const relId = vr.concept && vr.concept.id;
    if (!relId) continue;
    _pushTo(byRel, relId, vr);
  }
  /** @type {Set<string>} */
  const used = new Set();
  const keptVrIds = parentRels.map(b => {
    const s = visualOf[b.srcOccId], t = visualOf[b.tgtOccId];
    if (!s || !t) return null;
    const vr = (byRel.get(b.rel.id) || []).find(c => !used.has(String(c.id)) && c.source && c.target &&
      String(c.source.id) === String(s) && String(c.target.id) === String(t));
    if (!vr) return null;
    used.add(String(vr.id));
    return String(vr.id);
  });
  /** @type {string[]} */
  const removedVrIds = [];
  for (const relId of new Set(parentRels.map(b => b.rel.id))) {
    for (const vr of (byRel.get(relId) || [])) if (!used.has(String(vr.id))) removedVrIds.push(String(vr.id));
  }
  return { keptVrIds, removedVrIds };
}

/**
 * Records of the managed occurrences that exist after a write (PROP_MANAGED_OCCURRENCE values),
 * sorted. `exists(occ)` tells whether the occurrence got a visual.
 * @param {NestingResolution}        nesting
 * @param {(occ: string) => boolean} exists
 * @returns {string[]}
 */
function _managedRecords(nesting, exists) {
  /** @type {string[]} */
  const out = [];
  for (const occ of nesting.managedOccs) {
    if (!exists(occ)) continue;
    /** @type {string[]} */
    const chain = [];
    for (let p = nesting.parentMap[occ]; p; p = nesting.parentMap[p]) chain.push(_baseId(p));
    if (chain.length) out.push(_placementKey(_baseId(occ), chain));
  }
  return out.sort();
}

/**
 * Strongly connected components (Tarjan, iterative). Returns node id → component number.
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} succ  node id → successor ids
 */
function _stronglyConnected(nodeIds, succ) {
  /** @type {Map<string, number>} */
  const idx = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {Set<string>} */
  const onStack = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @type {Map<string, number>} */
  const comp = new Map();
  let next = 0, nComp = 0;
  // Casts below: every node on the work list was opened, so idx and low hold it.
  const open = (/** @type {string} */ v) => { idx.set(v, next); low.set(v, next); next++; stack.push(v); onStack.add(v); };
  for (const root of nodeIds) {
    if (idx.has(root)) continue;
    open(root);
    /** @type {[string, number][]} */
    const work = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0], ns = succ.get(v) || [];
      if (top[1] < ns.length) {
        const w = ns[top[1]++];
        if (!idx.has(w)) { open(w); work.push([w, 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (idx.get(w))));
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (low.get(v)))); }
      if (low.get(v) === idx.get(v)) {
        let w;
        do { w = /** @type {string} */ (stack.pop()); onStack.delete(w); comp.set(w, nComp); } while (w !== v);
        nComp++;
      }
    }
  }
  return comp;
}

/**
 * Resolve nesting structure (parentMap, occurrenceMap, parentRels) from the nesting
 * candidates. Single source of truth — used by the writer's _buildLayoutGraph AND by
 * predictViewCounts, so dialog and pipeline counters agree with what the writer produces.
 * No step depends on relation, rule or element order (SPEC: Roles and parents).
 *
 *   1. Cycles: nesting relations inside one strongly connected component of the graph
 *      parent → child are all drawn as connections (circularNestingRels, cycles).
 *      What remains is acyclic.
 *   2. Parents per child: every parent reached by a relation that matches a nesting rule
 *      with everyContainer; plus at most one parent from the other relations — a container
 *      a user-content visual of the child sits in on the view, else the first by name, then id.
 *      The other relations are drawn as connections (notNestedNestingRels).
 *   3. Occurrences: an element appears once under each occurrence of each of its parents,
 *      so an extra occurrence of a container gets its own copies of the container's children.
 *      The first occurrence has the element id, the others `${id}_occ_N`.
 *   4. Pairing with the visuals on the view (_pairVisuals): unpaired user visuals add occurrences.
 *
 * @param {ArchiElement[]}      elements
 * @param {ArchiRelation[]}     nestingRels   nesting candidates (splitNestingRels)
 * @param {EffectiveParams}     params        preset.params (nestingRules, reverseRules)
 * @param {VisualDescription[]} [visuals]     visuals on the target view (describeVisuals); none for a new view
 * @returns {NestingResolution}  parentMap, occurrenceMap, parentRels, circularNestingRels, cycles,
 *             notNestedNestingRels, and the pairing (see _pairVisuals)
 *
 * Each parentRels entry binds a nesting relation to the specific occurrence
 * each visual endpoint should use. `srcOccId` is the occurrence id to render
 * at rel.source's end (so `view.add(rel, srcV, tgtV)` direction matches the
 * model); `tgtOccId` likewise for rel.target. For reversed relation types,
 * the child sits on the rel.source side; otherwise on the rel.target side.
 */
function _resolveNesting(elements, nestingRels, params, visuals) {
  const rules = params.nestingRules || [];
  // The containers user content sits in on the view: element id → container element ids.
  /** @type {Map<string | null, Set<string>>} */
  const currentContainers = new Map();
  for (const v of (visuals || [])) {
    if (v.managed || !v.chain.length) continue;
    let containers = currentContainers.get(v.conceptId);
    if (!containers) { containers = new Set(); currentContainers.set(v.conceptId, containers); }
    containers.add(v.chain[0]);
  }
  const byId  = new Map(elements.map(el => [el.id, el]));
  /** @type {ArchiRelation[]} */
  const notNestedNestingRels = [];

  // Candidates, in relation-id order so every output list is order-free.
  /** @typedef {{ rel: ArchiRelation, reversed: boolean, parentId: string, childId: string, every: boolean }} NestingCandidate */
  /** @type {NestingCandidate[]} */
  const cands = [];
  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    // Self-loops (oortjes) can never be containment; an end outside the view neither.
    if (!srcId || !tgtId || srcId === tgtId || !byId.has(srcId) || !byId.has(tgtId)) {
      notNestedNestingRels.push(rel);
      continue;
    }
    const reversed = isReversed(rel, params);
    cands.push({
      rel, reversed,
      parentId: reversed ? tgtId : srcId,
      childId:  reversed ? srcId : tgtId,
      every:    RuleLists.matchEveryContainer(rules, rel.type, rel.source.type, rel.target.type, rel),
    });
  }
  cands.sort((a, b) => a.rel.id < b.rel.id ? -1 : a.rel.id > b.rel.id ? 1 : 0);

  // 1. Cycles.
  /** @type {Map<string, string[]>} */
  const succ = new Map();
  for (const c of cands) {
    _pushTo(succ, c.parentId, c.childId);
  }
  const comp = _stronglyConnected([...succ.keys()].sort(), succ);
  /** @type {ArchiRelation[]} */
  const circularNestingRels = [];
  /** @type {Map<number, ArchiRelation[]>} */
  const cycleRels = new Map();   // component → rels
  /** @type {NestingCandidate[]} */
  const acyclic = [];
  for (const c of cands) {
    const k = comp.get(c.parentId);
    if (k !== undefined && k === comp.get(c.childId)) {
      circularNestingRels.push(c.rel);
      _pushTo(cycleRels, k, c.rel);
    } else {
      acyclic.push(c);
    }
  }
  const cycles = [...cycleRels.entries()].map(([k, rels]) => ({
    elements: elements.filter(el => comp.get(el.id) === k).sort(_byNameThenId),
    rels,
  })).sort((a, b) => _byNameThenId(a.elements[0], b.elements[0]));

  // 2. Parents per child.
  /** @type {Map<string, NestingCandidate[]>} */
  const byChild = new Map();
  for (const c of acyclic) {
    _pushTo(byChild, c.childId, c);
  }
  /** @type {Map<string, string[]>} */
  const parentsOf = new Map();   // child id → parent ids, in placement order
  /** @type {Set<string>} */
  const nestedPair = new Set();  // "parent child" pairs that nest
  const pairKey = (/** @type {string} */ p, /** @type {string} */ ch) => p + " " + ch;
  for (const [childId, list] of byChild) {
    const current = currentContainers.get(childId) || new Set();
    /** @type {(a: string, b: string) => number} */
    // @ts-expect-error -- boolean arithmetic is intended: true − false = 1 puts current containers first
    const order = (a, b) => (current.has(b) - current.has(a)) || _byNameThenId(byId.get(a), byId.get(b));
    const parents = new Set(list.filter(c => c.every).map(c => c.parentId));
    const one = [...new Set(list.filter(c => !c.every).map(c => c.parentId))].sort(order);
    if (one.length) parents.add(one[0]);
    parentsOf.set(childId, [...parents].sort(order));
    for (const p of parents) nestedPair.add(pairKey(p, childId));
  }
  /** @type {Map<string, NestingCandidate[]>} */
  const relsByPair = new Map();
  for (const c of acyclic) {
    const k = pairKey(c.parentId, c.childId);
    if (!nestedPair.has(k)) { notNestedNestingRels.push(c.rel); continue; }
    _pushTo(relsByPair, k, c);
  }

  // 3. Occurrences, parents first (the remaining graph is acyclic).
  /** @type {Record<string, string>} */
  const parentMap = {};
  /** @type {Record<string, string[]>} */
  const occurrenceMap = {};
  /** @type {ParentRel[]} */
  const parentRels = [];
  /** @type {(id: string) => string[]} */
  const visit = id => {
    if (occurrenceMap[id]) return occurrenceMap[id];
    const parents = parentsOf.get(id);
    if (!parents) return (occurrenceMap[id] = [id]);
    /** @type {string[]} */
    const occs = [];
    for (const p of parents) {
      for (const pOcc of visit(p)) {
        const occ = occs.length ? `${id}_occ_${occs.length}` : id;
        occs.push(occ);
        parentMap[occ] = pOcc;
        for (const c of /** @type {NestingCandidate[]} */ (relsByPair.get(pairKey(p, id)))) {   // Cast: p nests id
          parentRels.push({ rel: c.rel, srcOccId: c.reversed ? occ : pOcc, tgtOccId: c.reversed ? pOcc : occ });
        }
      }
    }
    return (occurrenceMap[id] = occs);
  };
  for (const el of elements) visit(el.id);

  // 4. Pairing with the visuals on the view.
  const pairing = _pairVisuals(elements, occurrenceMap, parentMap, visuals);

  return { parentMap, occurrenceMap, parentRels, circularNestingRels, cycles, notNestedNestingRels, ...pairing };
}

/**
 * Is this relation reversed (params.reverseRules)? Reversed relations are laid out from target
 * to source and, when nested, have the target as parent. Single source of truth for the
 * writer, the layout graph and the counters.
 * @param {ArchiRelation}   rel
 * @param {EffectiveParams} params
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
 * @param {ArchiRelation[]}  relations
 * @param {EffectiveParams}  params
 * @returns {{ nestingRels: ArchiRelation[], connectionRels: ArchiRelation[] }}
 */
function _splitNestingRels(relations, params) {
  const rules          = params.nestingRules || [];
  /** @type {ArchiRelation[]} */
  const nestingRels    = [];
  /** @type {ArchiRelation[]} */
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
 *   extraOccurrences — extra visual appearances (nesting rules with everyContainer; visuals of
 *                      user content the settings place nowhere)
 *   relations        — total inter-element relations (= nestings + connections)
 *   nestings         — relations drawn as box-in-box
 *   connections      — relations drawn as a line
 *   diagramObjects   — canvas-only positional objects
 * @param {ArchiElement[]}      elements
 * @param {ArchiRelation[]}     relations
 * @param {number}              diagramNodeCount
 * @param {EffectiveParams}     params
 * @param {VisualDescription[]} [visuals]
 * @returns {ViewCounts}
 */
function _predictViewCounts(elements, relations, diagramNodeCount, params, visuals) {
  const { nestingRels, connectionRels } = _splitNestingRels(relations, params);
  const { parentMap, occurrenceMap, parentRels, notNestedNestingRels, circularNestingRels } =
    _resolveNesting(elements, nestingRels, params, visuals);
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
    connections:      connectionRels.length + notNestedNestingRels.length + circularNestingRels.length,
    diagramObjects:   diagramNodeCount || 0,
  };
}

/**
 * Find all relations whose source AND target are both in `elements`.
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
function _findRelationsBetween(elements, match, seenRelIds, iterateSubset) {
  if (elements.length === 0) return [];
  const elementIds = new Set(elements.map(e => e.id));
  const seen       = seenRelIds || new Set();
  const toIterate  = iterateSubset || elements;
  /** @type {ArchiRelation[]} */
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
 * Append to the array under a key, creating it first.
 * @template K, V
 * @param {Map<K, V[]>} map
 * @param {K} key
 * @param {V} value
 */
function _pushTo(map, key, value) {
  let list = map.get(key);
  if (!list) { list = []; map.set(key, list); }
  list.push(value);
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

/**
 * Raw model elements from the Archi UI selection, before any preset filter or
 * related-elements expansion. Views in the selection are expanded to their
 * elements (same as buildObjectSet step 1). Relations, folders, and view nodes
 * are excluded. Used by ONE_EACH to determine the seed set.
 *
 * @param {ArchiCollection<ArchiObject>} uiSelection  $(selection) from Archi UI
 * @returns {ArchiElement[]}  array of jArchi model element objects
 */
function getSeedElements(uiSelection) {
  const raw = Selection.getSelection(uiSelection, "*");
  const { modelCollection } = _expandViews(raw);
  /** @type {ArchiElement[]} */
  const seeds = [];
  modelCollection.filter("element").each(o => seeds.push(/** @type {ArchiElement} */ (o)));   // Cast: in the model collection "element" selects model elements
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
    describeVisuals:          _describeVisuals,
    classifyVisuals:          _classifyVisuals,
    managedRecords:           _managedRecords,
    nestingConnections:       _nestingConnections,
    predictViewCounts:        _predictViewCounts,
  };
}
