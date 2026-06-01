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
  // ── Step 1: model objects from selection (uniform for canvas + model-tree) ──
  const raw = Selection.getSelection(uiSelection, "*");
  const expanded = _expandViews(raw);
  let collection     = expanded.modelCollection;
  let diagramObjects = expanded.diagramObjects;

  // ── Step 2: filter (skipped for the "Modify selected view" group — EXPAND_VIEW and
  // LAYOUT_ONLY re-layout/expand all elements already on the view; applying the filter
  // would exclude visible element types, causing containers to be sized for only the
  // filtered subset while excluded elements remain at positions outside those bounds) ──
  const _isModifyAction = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  if (!_isModifyAction) {
    _logFilter(preset.filter);
    collection     = _applyFilter(collection, preset.filter);
    diagramObjects = _applyDiagramFilter(diagramObjects, preset.filter);
  } else {
    console.log("Modify-selected-view action: element-type filter skipped");
  }

  // Filtered base counts (for the grouped log block at end of build).
  let _fEl = 0, _fRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _fRel++;
    else _fEl++;
  });
  const filteredCounts = { elems: _fEl, rels: _fRel, diag: diagramObjects.length };

  // Effective rel-type filter (same union used by step 5) — needed up front so the
  // per-step relation deltas in step 3's logging match the final step-5 outcome.
  const globalRelTypes = (preset.filter && preset.filter.relationTypes) || [];
  const relTypeFilter  = _effectiveRelTypeFilter(globalRelTypes,
                          preset.relatedElements && preset.relatedElements.steps);

  // ── Step 3: related-elements expansion (chain semantics; skipped for LAYOUT_ONLY) ──
  // Step 1's input is the filtered base. Step N (N≥2)'s input is step N-1's added
  // elements only — NOT the cumulative selection. An empty step terminates the chain.
  // The cumulative selection is tracked separately for the relation-delta math
  // (Filtered + Σ adds = Total, exactly).
  const stepCounts = [];
  // _filteredElements: elements that survived step 2, used as step 1's input.
  const _filteredElements = [];
  collection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return;
    if (type === "folder" || type === "archimate-diagram-model") return;
    _filteredElements.push(o);
  });
  const filteredBaseRels = _countRelationsBetween(_filteredElements, relTypeFilter);
  let cumulativeRels = filteredBaseRels;

  if (actionId !== ACTION.LAYOUT_ONLY.id &&
      preset.relatedElements && Array.isArray(preset.relatedElements.steps)) {
    let stepInput       = _filteredElements.slice();   // step 1 input = filtered base
    let cumulativeElems = _filteredElements.slice();   // used only for relation delta
    let stepIdx = 0;
    for (const step of preset.relatedElements.steps) {
      stepIdx++;
      const added = _expandStep(stepInput, step);
      // Add to the final selection (collection).
      added.forEach(o => {
        if (collection.filter(a => a.id === o.id).size() === 0) collection.add(o);
      });
      // Cumulative grows; relation delta uses it.
      cumulativeElems = cumulativeElems.concat(added);
      const newCumRels = _countRelationsBetween(cumulativeElems, relTypeFilter);
      const deltaRels  = Math.max(0, newCumRels - cumulativeRels);
      cumulativeRels   = newCumRels;
      stepCounts.push({ idx: stepIdx, elems: added.length, rels: deltaRels });
      // Chain advance: next step's input is THIS step's additions only.
      stepInput = added;
    }
  }

  // ── Step 4: separate elements (drop relations, folders, view nodes) ──
  const elements = [];
  collection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return;
    if (type === "folder" || type === "archimate-diagram-model") return;
    elements.push(o);
  });

  // ── Step 5: relations between elements (effective filter computed above). ──
  const relations = _findRelationsBetween(elements, relTypeFilter);

  // ── Step 6: partition diagram-model-connection (edges) from positional diagram objects ──
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection");

  // ── Step 1 (continued): existing view contents — target identification + per-VO existence (EXPAND_VIEW + LAYOUT_ONLY) ──
  const existing = _collectExistingVisuals(uiSelection, actionId);

  // Predict on-view counts using the same algorithm the writer uses.
  const view = _predictViewCounts(elements, relations, diagramNodes.length, preset.params || {});

  // ── Grouped count log: filtered base → per-step adds (true deltas) → grouped totals.
  // Filtered + Σ adds = Total, exactly, by construction. Canonical vocabulary (ai/rules.md #11). ──
  const rows = [{
    label: _isModifyAction ? "Unfiltered base:" : "Filtered base:",
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
  const elems = (filter.elementTypes  || []);
  const rels  = (filter.relationTypes || []);
  const diag  = (filter.diagramTypes  || []);
  console.log(`Filter element types:  ${elems.length === 0 ? "all" : elems.join(", ")}`);
  console.log(`Filter relation types: ${rels.length  === 0 ? "all" : rels.join(", ")}`);
  console.log(`Filter diagram types:  ${diag.length  === 0 ? "all" : diag.join(", ")}`);
}

/**
 * Replace any ArchimateView objects in the collection with the model elements,
 * relations and diagram objects visible on those views. Returns
 *   { modelCollection, diagramObjects }.
 */
function _expandViews(collection) {
  const views = [];
  collection.each(o => { if (o.type === "archimate-diagram-model") views.push(o); });
  if (views.length === 0) return { modelCollection: collection, diagramObjects: [] };

  let expanded = collection.filter(o => o.type !== "archimate-diagram-model");
  const diagramObjects = [];
  const diagSeen = new Set();
  const addDiagramVO = vo => {
    if (vo && vo.id && !diagSeen.has(vo.id)) { diagSeen.add(vo.id); diagramObjects.push(vo); }
  };

  views.forEach(view => {
    try {
      $(view).find("element").each(ve => {
        // view-reference VOs surface in find("element") with .type "archimate-diagram-model"
        // (jArchi 1.12 quirk). Classify them as diagram objects via DIAGRAM_TYPES membership.
        if (ve.type && ve.type in Defs.DIAGRAM_TYPES) { addDiagramVO(ve); return; }
        const concept = ve.concept || ve;
        if (concept && concept.id && concept.type !== "archimate-diagram-model" &&
            expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
    try {
      $(view).find("relation").each(vr => {
        const concept = vr.concept || vr;
        if (concept && concept.id && expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
      try { $(view).find(dt).each(dvo => { if (dvo && dvo.id) addDiagramVO(dvo); }); } catch (e) {}
    });
  });

  console.log(`Expanded ${views.length} view(s) → ${expanded.size()} model objects · ${diagramObjects.length} diagram objects`);
  return { modelCollection: expanded, diagramObjects };
}

/**
 * For actions that target an existing view (EXPAND_VIEW, LAYOUT_ONLY), collect
 * the visual elements, visual relations, and the view itself from the UI selection.
 * Other actions get all-empty.
 */
function _collectExistingVisuals(uiSelection, actionId) {
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
  }

  console.log(`Existing on view: ${visualElements.length} VEs · ${visualRelations.length} VRs · view: "${existingView && existingView.name || "none"}"`);
  return { existingView, visualElements, visualRelations };
}

function _applyFilter(collection, filter) {
  if (!filter) return collection;
  const { elementTypes = [], relationTypes = [] } = filter;
  return collection.filter(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return _matchesRelationType(type, relationTypes, o);
    if (elementTypes.length > 0 && !elementTypes.includes(type)) return false;
    return true;
  });
}

function _applyDiagramFilter(diagramObjects, filter) {
  if (!filter || !filter.diagramTypes || filter.diagramTypes.length === 0) return diagramObjects;
  const { diagramTypes } = filter;
  return diagramObjects.filter(o => diagramTypes.includes(o.type || ""));
}

/** Type-only relation match (direction ignored). Used by _findRelationsBetween. */
function _matchesRelationType(type, relationTypes, rel) {
  if (relationTypes.length === 0) return true;
  for (const entry of relationTypes) {
    const i = entry.indexOf(":");
    const entryType = i < 0 ? entry : entry.substring(0, i);
    if (entryType === type) return true;
  }
  return false;
}

/**
 * Direction-aware match used by _expandStep.
 * isOutgoing === true when the traversing element is the relation's source.
 *   "type"      → both directions
 *   "type:in"   → only when traversing toward incoming  (isOutgoing === false)
 *   "type:out"  → only when traversing toward outgoing  (isOutgoing === true)
 */
function _matchesRelationTypeDir(type, relationTypes, isOutgoing) {
  if (relationTypes.length === 0) return true;
  for (const entry of relationTypes) {
    const i = entry.indexOf(":");
    const entryType = i < 0 ? entry : entry.substring(0, i);
    if (entryType !== type) continue;
    const dir = i < 0 ? "both" : entry.substring(i + 1);
    if (dir === "both") return true;
    if (dir === "out"  && isOutgoing)  return true;
    if (dir === "in"   && !isOutgoing) return true;
  }
  return false;
}

/** Expand by following relations up to depth hops. Returns newly-found elements. */
function _expandStep(base, step) {
  const { depth = 1, elementTypes = [], relationTypes = [] } = step;
  const baseIds  = new Set(base.map(o => o.id));
  const added    = [];
  const addedIds = new Set();
  let frontier = [...base];

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = [];
    for (const element of frontier) {
      try {
        $(element).rels().each(rel => {
          const type = rel.type || "";
          const isOutgoing = !!(rel.source && rel.source.id === element.id);
          if (!_matchesRelationTypeDir(type, relationTypes, isOutgoing)) return;

          const other = isOutgoing ? rel.target : rel.source;
          if (!other) return;
          if (baseIds.has(other.id) || addedIds.has(other.id)) return;

          const otherType = other.type || "";
          if (elementTypes.length > 0 && !elementTypes.includes(otherType)) return;

          added.push(other);
          addedIds.add(other.id);
          nextFrontier.push(other);
        });
      } catch (e) {}
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }
  return added;
}

/** Live-count wrapper for the dialog. Returns { elements, elemCount, relCount }. */
function _expandStepCounts(base, step) {
  const elements = _expandStep(base, step);
  if (elements.length === 0) return { elements, elemCount: 0, relCount: 0 };

  const allIds = new Set(base.map(e => e.id));
  elements.forEach(e => allIds.add(e.id));

  const seen = new Set();
  let relCount = 0;
  for (const el of elements) {
    try {
      $(el).rels().each(rel => {
        if (seen.has(rel.id)) return;
        const srcId = rel.source && rel.source.id;
        const tgtId = rel.target && rel.target.id;
        if (!srcId || !tgtId) return;
        if (!allIds.has(srcId) || !allIds.has(tgtId)) return;
        if (!_matchesRelationType(rel.type, step.relationTypes || [], rel)) return;
        seen.add(rel.id);
        relCount++;
      });
    } catch (e) {}
  }
  return { elements, elemCount: elements.length, relCount };
}

function _collectionToArray(collection) {
  const arr = [];
  collection.each(o => arr.push(o));
  return arr;
}

/**
 * Compute the effective relation-type filter: union of global filter relationTypes
 * and every step's relationTypes. Empty union ⇒ "all types allowed".
 * Mirrors the step-5 logic so the dialog and the pipeline can share it.
 */
function _effectiveRelTypeFilter(globalRelTypes, steps) {
  const g = globalRelTypes || [];
  const stepRelTypes = [];
  if (Array.isArray(steps)) {
    steps.forEach(s => (s.relationTypes || []).forEach(t => stepRelTypes.push(t)));
  }
  if (g.length === 0 && stepRelTypes.length === 0) return [];
  return Array.from(new Set(g.concat(stepRelTypes)));
}

/** Count rels between elements under the given filter. Cheaper than _findRelationsBetween
 *  for the dialog hot path: no relation-array allocation, just an integer. */
function _countRelationsBetween(elements, relTypeFilter) {
  if (!elements || elements.length === 0) return 0;
  const elementIds = new Set(elements.map(e => e.id));
  const seen = new Set();
  let count = 0;
  for (const element of elements) {
    try {
      $(element).rels().each(rel => {
        if (seen.has(rel.id)) return;
        const srcId = rel.source && rel.source.id;
        const tgtId = rel.target && rel.target.id;
        if (!srcId || !tgtId) return;
        if (!elementIds.has(srcId) || !elementIds.has(tgtId)) return;
        if (relTypeFilter && relTypeFilter.length > 0 &&
            !_matchesRelationType(rel.type, relTypeFilter, rel)) return;
        seen.add(rel.id);
        count++;
      });
    } catch (e) {}
  }
  return count;
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
 *             parentRels: Array<{rel, srcOccId, tgtOccId, isExtra}>,
 *             skippedCycle, skippedMultiParent }}
 *
 * Each parentRels entry binds a nesting relation to the specific occurrence
 * each visual endpoint should use. `srcOccId` is the occurrence id to render
 * at rel.source's end (so `view.add(rel, srcV, tgtV)` direction matches the
 * model); `tgtOccId` likewise for rel.target. For reversed relation types,
 * the child sits on the rel.source side; otherwise on the rel.target side.
 * `isExtra` flags occurrences that go beyond the primary (`_occ_N` form) —
 * used by the writer and counter to support the
 * `showExtraOccurrenceConnections` toggle.
 */
function _resolveNesting(elements, nestingRels, params) {
  const reverseTypes = new Set((params && params.reverseRelationTypes) || []);
  const showInEvery  = !!(params && params.showInEveryContainer);
  const parentMap = {};
  const occurrenceMap = {};
  for (const el of (elements || [])) occurrenceMap[el.id] = [el.id];
  const parentRels = [];
  let skippedCycle = 0;
  let skippedMultiParent = 0;

  function wouldCycle(map, childId, parentId) {
    let cur = parentId;
    while (cur) {
      if (cur === childId) return true;
      cur = map[cur];
    }
    return false;
  }

  for (const rel of (nestingRels || [])) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId) continue;
    const isReversed = reverseTypes.has(rel.type);
    const [parentId, childId] = isReversed ? [tgtId, srcId] : [srcId, tgtId];

    // Build a binding aligned to (rel.source, rel.target) for the writer.
    // The child's occurrence sits on the source side iff the rel is reversed.
    const pushBinding = (boundChildOcc) => {
      const isExtra = boundChildOcc !== childId;
      const srcOccId = isReversed ? boundChildOcc : parentId;
      const tgtOccId = isReversed ? parentId      : boundChildOcc;
      parentRels.push({ rel, srcOccId, tgtOccId, isExtra });
    };

    if (!showInEvery) {
      if (parentMap[childId] === undefined) {
        if (wouldCycle(parentMap, childId, parentId)) {
          skippedCycle++;
        } else {
          parentMap[childId] = parentId;
          pushBinding(childId);
        }
      } else {
        skippedMultiParent++;
      }
    } else {
      const occs = occurrenceMap[childId] || [childId];
      const unassigned = occs.find(id => parentMap[id] === undefined);
      let boundChildOcc = null;
      if (unassigned && !wouldCycle(parentMap, unassigned, parentId)) {
        parentMap[unassigned] = parentId;
        boundChildOcc = unassigned;
      } else {
        const alreadyHere = occs.find(id => parentMap[id] === parentId);
        if (alreadyHere) {
          boundChildOcc = alreadyHere;
        } else {
          const occId = `${childId}_occ_${occs.length}`;
          if (!wouldCycle(parentMap, occId, parentId)) {
            occurrenceMap[childId] = [...occs, occId];
            parentMap[occId] = parentId;
            boundChildOcc = occId;
          }
        }
      }
      if (boundChildOcc) pushBinding(boundChildOcc);
    }
  }

  return { parentMap, occurrenceMap, parentRels, skippedCycle, skippedMultiParent };
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
  const nestingTypes  = new Set((params && params.nestingRelationTypes) || []);
  const nestingRels   = [];
  const connectionRels = [];
  for (const rel of (relations || [])) {
    if (nestingTypes.has(rel.type)) nestingRels.push(rel);
    else                            connectionRels.push(rel);
  }
  const { parentMap, occurrenceMap, parentRels } = _resolveNesting(elements, nestingRels, params);
  // When showExtraOccurrenceConnections is on, each non-primary occurrence nesting
  // gets an ADDITIONAL VisualRelation drawn as a connection line on top of the
  // containment. Containment count is unchanged; connection count grows by the
  // number of extra bindings.
  const showExtra     = !!(params && params.showExtraOccurrenceConnections);
  const extraBindings = showExtra ? parentRels.filter(b => b.isExtra).length : 0;

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
  const stripOcc = id => {
    const i = id.indexOf("_occ_");
    return i < 0 ? id : id.substring(0, i);
  };
  const childIds = new Set();
  for (const k of Object.keys(parentMap)) childIds.add(stripOcc(k));

  let nestedElements = 0, standalones = 0;
  for (const el of (elements || [])) {
    if (containerIds.has(el.id)) continue;          // counted as container
    if (childIds.has(el.id))     nestedElements++;
    else                         standalones++;
  }

  const elementCount    = (elements || []).length;
  const relationCount   = (relations || []).length;

  return {
    elements:         elementCount,
    containers:       containerIds.size,
    nestedElements,
    standalones,
    extraOccurrences,
    relations:        relationCount,
    nestings:         nestingRels.length,
    connections:      connectionRels.length + extraBindings,
    diagramObjects:   diagramNodeCount || 0,
  };
}

/**
 * Find all relations whose source AND target are both in `elements`.
 * Applies type filter (empty = all types allowed).
 */
function _findRelationsBetween(elements, relTypeFilter) {
  if (elements.length === 0) return [];
  const elementIds = new Set(elements.map(e => e.id));
  const seen       = new Set();
  const relations  = [];
  for (const element of elements) {
    try {
      $(element).rels().each(rel => {
        if (seen.has(rel.id)) return;
        const srcId = rel.source && rel.source.id;
        const tgtId = rel.target && rel.target.id;
        if (!srcId || !tgtId) return;
        if (!elementIds.has(srcId) || !elementIds.has(tgtId)) return;
        if (relTypeFilter && relTypeFilter.length > 0 &&
            !_matchesRelationType(rel.type, relTypeFilter, rel)) return;
        seen.add(rel.id);
        relations.push(rel);
      });
    } catch (e) {}
  }
  return relations;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildObjectSet,
    expandStep:              _expandStep,
    expandStepCounts:        _expandStepCounts,
    logCountBlock:           _logCountBlock,
    effectiveRelTypeFilter:  _effectiveRelTypeFilter,
    countRelationsBetween:   _countRelationsBetween,
    findRelationsBetween:    _findRelationsBetween,
    resolveNesting:          _resolveNesting,
    predictViewCounts:       _predictViewCounts,
  };
}
