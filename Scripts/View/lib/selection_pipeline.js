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
  const LOG = "  ";
  // ── Step 1: model objects from selection (uniform for canvas + model-tree) ──
  console.log("Current selection:");
  const raw = Selection.getSelection(uiSelection, "*", LOG);
  const expanded = _expandViews(raw, LOG);
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
    console.log(`${LOG}Modify-selected-view action: element-type filter skipped`);
  }

  // Filtered base counts (for the grouped log block at end of build).
  let _fEl = 0, _fRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _fRel++;
    else _fEl++;
  });
  const filteredCounts = { elems: _fEl, rels: _fRel, diag: diagramObjects.length };

  const globalRelTypes = preset.filter.relationTypes;

  // ── Step 3: related-elements expansion (chain semantics; skipped for LAYOUT_ONLY) ──
  // Step 1's input is the filtered base. Step N (N≥2)'s input is step N-1's added
  // elements only — NOT the cumulative selection. An empty step terminates the chain.
  const stepCounts = [];
  // _filteredElements: elements that survived step 2, used as step 1's input.
  const _filteredElements = [];
  collection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return;
    if (type === "folder" || type === "archimate-diagram-model") return;
    _filteredElements.push(o);
  });

  // Collect relations incrementally: base uses global filter; each step uses its own
  // relation-type filter so that a step only adds relations of the types it followed.
  const allRelIds    = new Set();
  const allRelations = _findRelationsBetween(_filteredElements, globalRelTypes, allRelIds);
  const filteredBaseRels = allRelations.length;

  if (actionId !== ACTION.LAYOUT_ONLY.id &&
      preset.relatedElements && Array.isArray(preset.relatedElements.steps)) {
    let stepInput       = _filteredElements.slice();   // step 1 input = filtered base
    let cumulativeElems = _filteredElements.slice();
    let stepIdx = 0;
    for (const step of preset.relatedElements.steps) {
      stepIdx++;
      // Log which relation types / directions this step traverses.
      const stepRelStr  = (step.relationTypes && step.relationTypes.length > 0)
        ? step.relationTypes.join(", ") : "all";
      const stepElemStr = (step.elementTypes  && step.elementTypes.length > 0)
        ? step.elementTypes.join(", ")  : "all";
      console.log(`Step ${stepIdx} filter:  relation types: ${stepRelStr}  ·  depth: ${step.depth || 1}  ·  element types: ${stepElemStr}`);
      const added = _expandStep(stepInput, step);
      // Add to the final selection (collection).
      added.forEach(o => {
        if (collection.filter(a => a.id === o.id).size() === 0) collection.add(o);
      });
      // Snapshot cumulative BEFORE adding new elements so the iterate set excludes new×new:
      // iterateSubset = cumulativeBefore finds old×old, old→new, and new→old but never new×new.
      const cumulativeBefore = cumulativeElems.slice();
      cumulativeElems = cumulativeElems.concat(added);
      const stepRels = _findRelationsBetween(cumulativeElems, step.relationTypes, allRelIds, cumulativeBefore);
      stepRels.forEach(r => allRelations.push(r));
      stepCounts.push({ idx: stepIdx, elems: added.length, rels: stepRels.length });
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

  // ── Step 5: relations collected incrementally in step 3 above (base: global filter; per step: step's filter). ──
  const relations = allRelations;

  // ── Step 6: partition diagram-model-connection (edges) from positional diagram objects ──
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection");

  // ── Step 1 (continued): existing view contents — target identification + per-VO existence (EXPAND_VIEW + LAYOUT_ONLY) ──
  const existing = _collectExistingVisuals(uiSelection, actionId, LOG);

  // Predict on-view counts using the same algorithm the writer uses.
  const view = _predictViewCounts(elements, relations, diagramNodes.length, preset.params);

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
  const elems = filter.elementTypes;
  const rels  = filter.relationTypes;
  const diag  = filter.diagramTypes;
  console.log(`Filter element types:  ${elems.length === 0 ? "all" : elems.join(", ")}`);
  console.log(`Filter relation types: ${rels.length  === 0 ? "all" : rels.join(", ")}`);
  console.log(`Filter diagram types:  ${diag.length  === 0 ? "all" : diag.join(", ")}`);
}

/**
 * Replace any ArchimateView objects in the collection with the model elements,
 * relations and diagram objects visible on those views. Returns
 *   { modelCollection, diagramObjects }.
 */
function _expandViews(collection, logPrefix = "") {
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

  console.log(`${logPrefix}Expanded ${views.length} view(s) → ${expanded.size()} model objects · ${diagramObjects.length} diagram objects`);
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
  }

  console.log(`${logPrefix}Existing on view: ${visualElements.length} VEs · ${visualRelations.length} VRs · view: "${existingView && existingView.name || "none"}"`);
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

function _collectionToArray(collection) {
  const arr = [];
  collection.each(o => arr.push(o));
  return arr;
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
  const reverseTypes = new Set(params.reverseRelationTypes);
  const showInEvery  = !!params.showInEveryContainer;
  const parentMap = {};
  const occurrenceMap = {};
  for (const el of elements) occurrenceMap[el.id] = [el.id];
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

  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId) continue;
    const isReversed = reverseTypes.has(rel.type);
    const [parentId, childId] = isReversed ? [tgtId, srcId] : [srcId, tgtId];

    // Build a binding aligned to (rel.source, rel.target) for the writer.
    // The child's occurrence sits on the source side iff the rel is reversed.
    const pushBinding = (boundChildOcc) => {
      const srcOccId = isReversed ? boundChildOcc : parentId;
      const tgtOccId = isReversed ? parentId      : boundChildOcc;
      parentRels.push({ rel, srcOccId, tgtOccId });
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

  // When showInEveryContainer is on, a container that itself has multiple occurrences
  // would otherwise render as empty extra boxes — its children were only assigned to
  // the primary occurrence. Propagate the full sub-tree into every extra occurrence
  // via BFS so each occurrence of a container holds the same children.
  if (showInEvery) {
    // Build parentBaseId → [{rel, childId, isReversed}] from the original nesting rels.
    const childRelsByParent = {};
    for (const rel of nestingRels) {
      const srcId = rel.source && rel.source.id;
      const tgtId = rel.target && rel.target.id;
      if (!srcId || !tgtId) continue;
      const isReversed = reverseTypes.has(rel.type);
      const [parentId, childId] = isReversed ? [tgtId, srcId] : [srcId, tgtId];
      if (!childRelsByParent[parentId]) childRelsByParent[parentId] = [];
      childRelsByParent[parentId].push({ rel, childId, isReversed });
    }

    // Seed queue from every extra occurrence created in the initial pass above.
    const queue = [];
    for (const el of elements) {
      const occurrences = occurrenceMap[el.id] || [];
      for (const extraOccId of occurrences.slice(1))  // index 0 is the primary
        queue.push({ primaryBaseId: el.id, extraOccId });
    }

    // BFS: replicate each container's direct children into each extra occurrence.
    while (queue.length > 0) {
      const { primaryBaseId, extraOccId } = queue.shift();
      for (const { rel, childId, isReversed } of (childRelsByParent[primaryBaseId] || [])) {
        if (!occurrenceMap[childId]) continue;
        const childOccurrences = occurrenceMap[childId];
        if (childOccurrences.some(id => parentMap[id] === extraOccId)) continue;
        const newOccId = `${childId}_occ_${childOccurrences.length}`;
        if (!wouldCycle(parentMap, newOccId, extraOccId)) {
          occurrenceMap[childId] = [...childOccurrences, newOccId];
          parentMap[newOccId]    = extraOccId;
          const srcOccId = isReversed ? newOccId   : extraOccId;
          const tgtOccId = isReversed ? extraOccId : newOccId;
          parentRels.push({ rel, srcOccId, tgtOccId });
          queue.push({ primaryBaseId: childId, extraOccId: newOccId });
        }
      }
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
  const nestingTypes  = new Set(params.nestingRelationTypes);
  const nestingRels   = [];
  const connectionRels = [];
  for (const rel of relations) {
    if (nestingTypes.has(rel.type)) nestingRels.push(rel);
    else                            connectionRels.push(rel);
  }
  const { parentMap, occurrenceMap, parentRels } = _resolveNesting(elements, nestingRels, params);
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
  for (const el of elements) {
    if (containerIds.has(el.id)) continue;          // counted as container
    if (childIds.has(el.id))     nestedElements++;
    else                         standalones++;
  }

  const elementCount    = elements.length;
  const relationCount   = relations.length;

  return {
    elements:         elementCount,
    containers:       containerIds.size,
    nestedElements,
    standalones,
    extraOccurrences,
    relations:        relationCount,
    nestings:         nestingRels.length,
    connections:      connectionRels.length,
    diagramObjects:   diagramNodeCount || 0,
  };
}

/**
 * Find all relations whose source AND target are both in `elements`.
 * Applies type filter (empty = all types allowed).
 * @param {Set}      [seenRelIds]    Optional external dedup set — mutated in place so the caller
 *                                   can thread it across successive calls to prevent double-counting.
 * @param {Object[]} [iterateSubset] Optional subset of elements to iterate. Both endpoints are
 *                                   still checked against the full `elements` set. Pass the
 *                                   pre-step cumulative snapshot to exclude new×new relations.
 *                                   Defaults to `elements`.
 */
function _findRelationsBetween(elements, relTypeFilter, seenRelIds, iterateSubset) {
  if (elements.length === 0) return [];
  const elementIds = new Set(elements.map(e => e.id));
  const seen       = seenRelIds || new Set();
  const toIterate  = iterateSubset || elements;
  const relations  = [];
  for (const element of toIterate) {
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
  modelCollection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return;
    if (type === "folder" || type === "archimate-diagram-model") return;
    seeds.push(o);
  });
  return seeds;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildObjectSet,
    getSeedElements,
    expandStep:           _expandStep,
    logCountBlock:        _logCountBlock,
    findRelationsBetween: _findRelationsBetween,
    resolveNesting:       _resolveNesting,
    predictViewCounts:    _predictViewCounts,
  };
}
