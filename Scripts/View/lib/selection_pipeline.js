/**
 * Selection pipeline for the View subsystem.
 *
 * Builds the element and relation set for generate_view from:
 *   1. The raw Archi UI selection (via selection.js)
 *   2. A filter (element types, relation types + direction, diagram types)
 *   3. One or more related-elements expansion layers
 *
 * For layout_only action: returns existing visual objects from the view unchanged.
 * For expand_view action: returns visual objects merged with model additions.
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
 * Build the element and relation set for generate_view.
 *
 * @param {ArchiCollection} uiSelection  raw selection from Archi UI ($(selection))
 * @param {Object}          preset       validated preset
 * @param {string}          actionId     ACTION.*.id
 * @returns {{
 *   elements:      ArchiElement[],
 *   relations:     ArchiRelation[],
 *   visualObjects: VisualObject[]
 * }}
 */
function buildObjectSet(uiSelection, preset, actionId) {
  if (actionId === ACTION.LAYOUT_ONLY.id) {
    return _layoutOnlySet(uiSelection);
  }

  // Log active filters so the user can see what is applied
  _logFilter(preset.filter);

  // Step 1: get model objects from selection.
  //
  // Selection.getSelection now handles canvas VOs correctly (extracts .concept,
  // recurses into nested VOs via $(obj).children()). So the model-tree and
  // canvas paths converge — one call expands every container type.
  const raw = Selection.getSelection(uiSelection, "*");
  const expanded = _expandViews(raw);
  let collection      = expanded.modelCollection;
  let diagramObjects  = expanded.diagramObjects;

  // Log: current selection before filter
  let _cntEl = 0, _cntRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _cntRel++;
    else _cntEl++;
  });
  console.log(`Current selection: ${_cntEl} elements · ${_cntRel} relations · ${diagramObjects.length} diagram objects`);

  // Step 2: apply filter — model collection and diagram objects separately
  collection = _applyFilter(collection, preset.filter);
  diagramObjects = _applyDiagramFilter(diagramObjects, preset.filter);

  // Log: after filter
  let _fEl = 0, _fRel = 0;
  collection.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship")) _fRel++;
    else _fEl++;
  });
  console.log(`Filtered selection: ${_fEl} elements · ${_fRel} relations · ${diagramObjects.length} diagram objects`);

  // Step 3: apply related-elements expansion layers (additive, model elements only)
  if (preset.relatedElements && Array.isArray(preset.relatedElements.layers)) {
    let base = _collectionToArray(collection);
    for (const layer of preset.relatedElements.layers) {
      const added = _expandLayer(base, layer);
      // add to collection without duplicates
      added.forEach(o => {
        if (collection.filter(a => a.id === o.id).size() === 0) collection.add(o);
      });
      base = _collectionToArray(collection);
    }
  }

  // Step 4: separate elements from the model collection (relations stay separate).
  // Folders and view nodes (archimate-diagram-model) are containers — they cannot be
  // placed on a view and must never reach the layout engine or _writeView.
  const elements = [];
  collection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) return;
    if (type === "folder" || type === "archimate-diagram-model") return;
    elements.push(o);
  });

  // Step 5: find all relations whose source AND target are both in the element set.
  // Apply the relation type filter (empty = all relation types allowed).
  const relations = _findRelationsBetween(elements, preset.filter ? preset.filter.relationTypes : []);

  console.log(`Relations found between elements: ${relations.length}`);

  // Separate diagram-model-connection (edges, no layout position) from other diagram objects.
  // Connections are drawn in a second pass after all nodes are placed.
  const diagramConnections = diagramObjects.filter(o => o.type === "diagram-model-connection");
  const diagramNodes       = diagramObjects.filter(o => o.type !== "diagram-model-connection");
  console.log(`Diagram objects: ${diagramNodes.length} nodes · ${diagramConnections.length} connections`);

  const result = {
    elements, relations,
    diagramObjects: diagramNodes, diagramConnections,
    visualElements: [],   // VisualElements on the existing view (EXPAND_VIEW)
    visualRelations: [],  // VisualRelations on the existing view (EXPAND_VIEW)
  };

  if (actionId === ACTION.EXPAND_VIEW.id) {
    const seenEl  = new Set();
    const seenRel = new Set();
    const addVE = ve => {
      if (ve && ve.id && !seenEl.has(ve.id) && ve.view) { seenEl.add(ve.id); result.visualElements.push(ve); }
    };
    const addVR = vr => {
      if (vr && vr.id && !seenRel.has(vr.id) && vr.view) { seenRel.add(vr.id); result.visualRelations.push(vr); }
    };

    let viewFound = false;
    try {
      uiSelection.each(o => {
        if (o.type === "archimate-diagram-model" && !o.view) {
          viewFound = true;
          try { $(o).find("element").each(ve => addVE(ve)); } catch(e) {}
          try { $(o).find("relation").each(vr => addVR(vr)); } catch(e) {}
        }
      });
    } catch (e) {}
    if (!viewFound) {
      try {
        Selection.getVisualSelection(uiSelection, "*").each(vo => {
          if (vo && vo.concept && vo.concept.type && vo.concept.type.endsWith("-relationship")) addVR(vo);
          else addVE(vo);
        });
      } catch (e) {}
    }
  }

  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Log the active filter settings to the console.
 */
function _logFilter(filter) {
  if (!filter) { console.log("Filter: none"); return; }
  const elems = (filter.elementTypes  || []);
  const rels  = (filter.relationTypes || []);
  const diag  = (filter.diagramTypes  || []);
  console.log(`Filter element types:  ${elems.length  === 0 ? "all" : elems.join(", ")}`);
  console.log(`Filter relation types: ${rels.length   === 0 ? "all" : rels.join(", ")}`);
  console.log(`Filter diagram types:  ${diag.length   === 0 ? "all" : diag.join(", ")}`);
}

/**
 * Replace any ArchimateView objects in the collection with the model elements,
 * relations and diagram objects visible on those views.
 *
 * Returns { modelCollection, diagramObjects } where:
 *   modelCollection — ArchiElement/ArchiRelation concepts (jArchi Collection)
 *   diagramObjects  — VisualObject[] for diagram-model-* types (no model concept)
 *
 * When no views are present the diagramObjects array is empty and the original
 * collection is returned as modelCollection unchanged.
 */
function _expandViews(collection) {
  const views = [];
  collection.each(o => { if (o.type === "archimate-diagram-model") views.push(o); });
  if (views.length === 0) return { modelCollection: collection, diagramObjects: [] };

  // Start with non-view objects already in the collection
  let expanded = collection.filter(o => o.type !== "archimate-diagram-model");
  const diagramObjects = [];
  const diagSeen = new Set();

  const addDiagramVO = vo => {
    if (vo && vo.id && !diagSeen.has(vo.id)) {
      diagSeen.add(vo.id);
      diagramObjects.push(vo);
    }
  };

  views.forEach(view => {
    // Visual elements → model concepts
    try {
      $(view).find("element").each(ve => {
        // view-reference VOs (type "archimate-diagram-model") appear in find("element") results
        // because jArchi treats them as element-like. Capture them as diagram objects here;
        // find("archimate-diagram-model") / find("diagram-model-reference") may not return them.
        if (ve.type && ve.type in Defs.DIAGRAM_TYPES) {
          addDiagramVO(ve);
          return;
        }
        const concept = ve.concept || ve;
        if (concept && concept.id && concept.type !== "archimate-diagram-model" &&
            expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
    // Visual connections → model relations
    try {
      $(view).find("relation").each(vr => {
        const concept = vr.concept || vr;
        if (concept && concept.id && expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
    // Diagram objects via find() per type — more reliable than children() which misses view-references
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
      try {
        $(view).find(dt).each(dvo => { if (dvo && dvo.id) addDiagramVO(dvo); });
      } catch (e) {}
    });
  });

  console.log(`Expanded ${views.length} view(s) → ${expanded.size()} model objects · ${diagramObjects.length} diagram objects`);
  return { modelCollection: expanded, diagramObjects };
}

function _layoutOnlySet(uiSelection) {
  const visualElements = [];
  const visualRelations = [];
  const diagramObjects = [];
  const seenEl = new Set(), seenRel = new Set(), seenDiag = new Set();

  const addVE   = ve  => { if (ve  && ve.id  && !seenEl.has(ve.id)   && ve.view)  { seenEl.add(ve.id);   visualElements.push(ve); } };
  const addVR   = vr  => { if (vr  && vr.id  && !seenRel.has(vr.id)  && vr.view)  { seenRel.add(vr.id);  visualRelations.push(vr); } };
  const addDiag = dvo => { if (dvo && dvo.id && !seenDiag.has(dvo.id) && dvo.view) { seenDiag.add(dvo.id); diagramObjects.push(dvo); } };

  // Case 1: view node selected from the model tree.
  // Use find() per type — children() misses view-references in jArchi 1.12.
  let viewFound = false;
  try {
    uiSelection.each(o => {
      if (o.type === "archimate-diagram-model" && !o.view) {
        viewFound = true;
        try { $(o).find("element").each(addVE); } catch(e) {}
        try { $(o).find("relation").each(addVR); } catch(e) {}
        Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
          try { $(o).find(dt).each(addDiag); } catch(e) {}
        });
      }
    });
  } catch (e) {}

  // Case 2: visual objects selected on a canvas.
  if (!viewFound) {
    try {
      Selection.getVisualSelection(uiSelection, "*").each(vo => {
        if (!vo || !vo.id || !vo.view) return;
        if (vo.type in Defs.DIAGRAM_TYPES) addDiag(vo);
        else if (vo.concept && vo.concept.type && vo.concept.type.endsWith("-relationship")) addVR(vo);
        else addVE(vo);
      });
    } catch (e) {}
  }

  console.log(`Layout only: ${visualElements.length} VisualElements · ${visualRelations.length} VisualRelations · ${diagramObjects.length} DiagramObjects`);
  return { elements: [], relations: [], diagramObjects, diagramConnections: [], visualElements, visualRelations };
}

/**
 * Apply element/relation filter to a model-only collection.
 * Diagram objects must be filtered separately via _applyDiagramFilter.
 * Empty arrays mean "all allowed".
 */
function _applyFilter(collection, filter) {
  if (!filter) return collection;
  const { elementTypes = [], relationTypes = [] } = filter;

  return collection.filter(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship")) {
      return _matchesRelationType(type, relationTypes, o);
    }
    if (elementTypes.length > 0 && !elementTypes.includes(type)) return false;
    return true;
  });
}

/**
 * Apply diagram type filter to an array of VisualObjects.
 * Empty diagramTypes array means "all allowed".
 */
function _applyDiagramFilter(diagramObjects, filter) {
  if (!filter || !filter.diagramTypes || filter.diagramTypes.length === 0) return diagramObjects;
  const { diagramTypes } = filter;
  return diagramObjects.filter(o => diagramTypes.includes(o.type || ""));
}

/**
 * Check if a relation matches the relation type filter (type-only, direction ignored).
 * Used where both endpoints are already known to be in the element set so direction
 * is moot (e.g. _findRelationsBetween).
 */
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
 * `isOutgoing` is true when the *traversing* element is the relation's source
 * (element → other); false when it's the target (other → element).
 *
 * Encoded entry → match rule:
 *   "type"      → both directions
 *   "type:in"   → only when traversing toward incoming (isOutgoing === false)
 *   "type:out"  → only when traversing toward outgoing (isOutgoing === true)
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

/**
 * Expand a set of model objects by following relations up to layer.depth hops.
 * Returns array of newly found elements (not in base set).
 */
function _expandLayer(base, layer) {
  const { depth = 1, elementTypes = [], relationTypes = [], diagramTypes = [] } = layer;
  const baseIds  = new Set(base.map(o => o.id));
  const added    = [];
  const addedIds = new Set();

  let frontier = [...base];

  for (let hop = 0; hop < depth; hop++) {
    const nextFrontier = [];
    for (const element of frontier) {
      // follow all relations from this element
      try {
        $(element).rels().each(rel => {
          if (_isExcluded(rel)) return;
          const type = rel.type || "";
          const isOutgoing = !!(rel.source && rel.source.id === element.id);
          if (!_matchesRelationTypeDir(type, relationTypes, isOutgoing)) return;

          // visit the other end of the relation
          const other = isOutgoing ? rel.target : rel.source;
          if (!other) return;
          if (baseIds.has(other.id) || addedIds.has(other.id)) return;

          const otherType = other.type || "";
          if (elementTypes.length > 0 && !elementTypes.includes(otherType)) return;

          added.push(other);
          addedIds.add(other.id);
          nextFrontier.push(other);
        });
      } catch (e) {
        // element may not support .rels() (e.g. diagram objects)
      }
    }
    frontier = nextFrontier;
    if (frontier.length === 0) break;
  }

  return added;
}

/**
 * Live-count wrapper around _expandLayer. Returns the added elements plus the count
 * of new relations contributed by the expansion: relations between (base ∪ added)
 * that touch at least one added element. Applies the layer's relationTypes filter
 * (type-only — direction was already honoured during expansion).
 */
function _expandLayerCounts(base, layer) {
  const elements = _expandLayer(base, layer);
  if (elements.length === 0) return { elements, elemCount: 0, relCount: 0 };

  const addedIds = new Set(elements.map(e => e.id));
  const allIds   = new Set(base.map(e => e.id));
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
 * Find all ArchiRelations where both source and target are in `elements`.
 * Traverses each element's relations via jArchi's .rels() API.
 * Applies relation type filter (empty = all types allowed).
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

        // Relation type filter (empty = all)
        if (relTypeFilter && relTypeFilter.length > 0) {
          if (!_matchesRelationType(rel.type, relTypeFilter, rel)) return;
        }

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
