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

  // Step 1: get model objects from selection
  // Visual objects are resolved to their model concepts
  let collection = Selection.getSelection(uiSelection, "*");

  // When a view is selected, getSelection() returns only the view node itself —
  // its model contents are not in the model-tree children. Expand selected views
  // to include all model elements and relations visible on those views.
  collection = _expandViews(collection);

  // Step 2: apply filter
  collection = _applyFilter(collection, preset.filter);

  // Step 3: apply related-elements expansion layers (additive)
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

  // Step 4: separate into elements and relations
  const elements  = [];
  const relations = [];
  collection.each(o => {
    const type = o.type || "";
    if (type.endsWith("-relationship") || type === "diagram-model-connection") {
      relations.push(o);
    } else {
      elements.push(o);
    }
  });

  const result = { elements, relations, visualObjects: [] };

  if (actionId === ACTION.EXPAND_VIEW.id) {
    // also include existing visual objects from the view
    const visualColl = Selection.getVisualSelection(uiSelection, "*");
    visualColl.each(o => result.visualObjects.push(o));
  }

  return result;
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Replace any ArchimateView objects in the collection with the model elements
 * and relations visible on those views.
 * getSelection() returns the view node itself when a view is selected —
 * model concepts live in visual objects on the view, not in model-tree children.
 */
function _expandViews(collection) {
  const views = [];
  collection.each(o => { if (o.type === "archimate-diagram-model") views.push(o); });
  if (views.length === 0) return collection;

  // Build a new collection without the view objects
  let expanded = collection.filter(o => o.type !== "archimate-diagram-model");

  views.forEach(view => {
    // Visual elements → concepts
    try {
      $(view).find("element").each(ve => {
        const concept = ve.concept || ve;
        if (concept && concept.id && expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
    // Visual connections → concept relations
    try {
      $(view).find("relation").each(vr => {
        const concept = vr.concept || vr;
        if (concept && concept.id && expanded.filter(a => a.id === concept.id).size() === 0) {
          expanded.add(concept);
        }
      });
    } catch (e) {}
  });

  console.log(`Expanded ${views.length} view(s) → ${expanded.size()} model objects`);
  return expanded;
}

function _layoutOnlySet(uiSelection) {
  const visualObjects = [];
  Selection.getVisualSelection(uiSelection, "*").each(o => visualObjects.push(o));
  return { elements: [], relations: [], visualObjects };
}

/**
 * Apply filter to a collection.
 * Empty arrays mean "all allowed".
 */
function _applyFilter(collection, filter) {
  if (!filter) return collection;
  const { elementTypes = [], relationTypes = [], diagramTypes = [] } = filter;

  return collection.filter(o => {
    const type = o.type || "";

    // diagram objects
    if (Defs.DIAGRAM_TYPES.includes(type)) {
      if (diagramTypes.length > 0 && !diagramTypes.includes(type)) return false;
      return true;
    }

    // relations
    if (type.endsWith("-relationship")) {
      return _matchesRelationType(type, relationTypes, o);
    }

    // elements
    if (elementTypes.length > 0 && !elementTypes.includes(type)) return false;
    return true;
  });
}

/**
 * Check if a relation matches the relation type filter.
 * Filter entries may have ":in" or ":out" suffix for direction.
 */
function _matchesRelationType(type, relationTypes, rel) {
  if (relationTypes.length === 0) return true;
  for (const entry of relationTypes) {
    const [entryType, dir] = entry.split(":");
    if (entryType !== type) continue;
    // direction matches regardless (both directions)
    if (!dir || dir === "in" || dir === "out") return true;
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
          if (!_matchesRelationType(type, relationTypes, rel)) return;

          // visit the other end of the relation
          const other = (rel.source && rel.source.id === element.id) ? rel.target : rel.source;
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

function _collectionToArray(collection) {
  const arr = [];
  collection.each(o => arr.push(o));
  return arr;
}

function _isExcluded(rel) {
  try { return rel.prop(PROP_EXCLUDE) === "true"; } catch (e) { return false; }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildObjectSet };
}
