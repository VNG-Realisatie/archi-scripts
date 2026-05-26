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
console.log("selection_pipeline.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Selection = require(REPO_ROOT + "_lib/selection");
const Defs      = require(REPO_ROOT + "View/lib/defs");
const { ACTION } = Defs;

const PROP_EXCLUDE = "excludeFromView";

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
  _logFilter(preset.filter);

  // ── Step 1: model objects from selection (uniform for canvas + model-tree) ──
  const raw = Selection.getSelection(uiSelection, "*");
  const expanded = _expandViews(raw);
  let collection     = expanded.modelCollection;
  let diagramObjects = expanded.diagramObjects;

  let _cntEl = 0, _cntRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _cntRel++;
    else _cntEl++;
  });
  console.log(`Current selection: ${_cntEl} elements · ${_cntRel} relations · ${diagramObjects.length} diagram objects`);

  // ── Step 2: filter ──
  collection     = _applyFilter(collection, preset.filter);
  diagramObjects = _applyDiagramFilter(diagramObjects, preset.filter);

  let _fEl = 0, _fRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _fRel++;
    else _fEl++;
  });
  console.log(`Filtered selection: ${_fEl} elements · ${_fRel} relations · ${diagramObjects.length} diagram objects`);

  // ── Step 3: related-elements expansion (skipped for LAYOUT_ONLY: re-layout what's there) ──
  if (actionId !== ACTION.LAYOUT_ONLY.id &&
      preset.relatedElements && Array.isArray(preset.relatedElements.layers)) {
    let base = _collectionToArray(collection);
    for (const layer of preset.relatedElements.layers) {
      const added = _expandLayer(base, layer);
      added.forEach(o => {
        if (collection.filter(a => a.id === o.id).size() === 0) collection.add(o);
      });
      base = _collectionToArray(collection);
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

  // ── Step 5: relations between elements (union filter: global ∪ block relationTypes) ──
  const globalRelTypes = (preset.filter && preset.filter.relationTypes) || [];
  let relTypeFilter = globalRelTypes;
  if (globalRelTypes.length > 0 && preset.relatedElements && Array.isArray(preset.relatedElements.layers)) {
    const blockRelTypes = [];
    preset.relatedElements.layers.forEach(l => {
      (l.relationTypes || []).forEach(t => blockRelTypes.push(t));
    });
    if (blockRelTypes.length > 0) {
      relTypeFilter = Array.from(new Set(globalRelTypes.concat(blockRelTypes)));
    }
  }
  const relations = _findRelationsBetween(elements, relTypeFilter);
  console.log(`Relations found between elements: ${relations.length}`);

  // ── Step 6: partition diagram-model-connection (edges) from positional diagram objects ──
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection");
  console.log(`Diagram objects: ${diagramNodes.length} nodes · ${diagramConnections.length} connections`);

  // ── Step 1 (continued): existing view contents — target identification + per-VO existence (EXPAND_VIEW + LAYOUT_ONLY) ──
  const existing = _collectExistingVisuals(uiSelection, actionId);

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
 * Direction-aware match used by _expandLayer.
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
function _expandLayer(base, layer) {
  const { depth = 1, elementTypes = [], relationTypes = [] } = layer;
  const baseIds  = new Set(base.map(o => o.id));
  const added    = [];
  const addedIds = new Set();
  let frontier = [...base];

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = [];
    for (const element of frontier) {
      try {
        $(element).rels().each(rel => {
          if (_isExcluded(rel)) return;
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
function _expandLayerCounts(base, layer) {
  const elements = _expandLayer(base, layer);
  if (elements.length === 0) return { elements, elemCount: 0, relCount: 0 };

  const allIds = new Set(base.map(e => e.id));
  elements.forEach(e => allIds.add(e.id));

  const seen = new Set();
  let relCount = 0;
  for (const el of elements) {
    try {
      $(el).rels().each(rel => {
        if (seen.has(rel.id)) return;
        if (_isExcluded(rel)) return;
        const srcId = rel.source && rel.source.id;
        const tgtId = rel.target && rel.target.id;
        if (!srcId || !tgtId) return;
        if (!allIds.has(srcId) || !allIds.has(tgtId)) return;
        if (!_matchesRelationType(rel.type, layer.relationTypes || [], rel)) return;
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
        if (_isExcluded(rel)) return;
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

function _isExcluded(rel) {
  try { return rel.prop(PROP_EXCLUDE) === "true"; } catch (e) { return false; }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildObjectSet,
    expandLayer:       _expandLayer,
    expandLayerCounts: _expandLayerCounts,
  };
}
