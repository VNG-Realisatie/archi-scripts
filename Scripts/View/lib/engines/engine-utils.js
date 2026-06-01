/**
 * Shared utilities for layout engine adapters.
 *
 * These functions operate on the LayoutGraph data structure (engine-agnostic)
 * and are used by both elk.js and dagre.js.
 */
console.log("Loading engines/engine-utils.js");

// ── Self-loop pass-through ────────────────────────────────────────────────────

/**
 * Build a pass-through LayoutResultEdge for a self-loop that was not routed by the engine.
 * The writer synthesises bendpoints from the node's bounds.
 * @param {Object} edge  LayoutGraph edge
 * @returns {Object}     LayoutResultEdge
 */
function selfLoopResult(edge) {
  return {
    id:         edge.id,
    sourceId:   edge.source,
    targetId:   edge.target,
    bendpoints: [],
    labelX:     0,
    labelY:     0,
    isStraight: false,
  };
}

// ── Node sorting ──────────────────────────────────────────────────────────────

/**
 * Comparator for nodes: by element type first, then by name.
 * Works with both LayoutGraph nodes (elementType / label) and
 * ELK nodeMap items (_type / _name).
 */
function byTypeAndName(a, b) {
  const ta = a.elementType || a._type || "";
  const tb = b.elementType || b._type || "";
  const na = a.label       || a._name || "";
  const nb = b.label       || b._name || "";
  return ta.localeCompare(tb) || na.localeCompare(nb);
}

/**
 * Return a sorted copy of LayoutGraph nodes.
 * Within each parent group: containers (nodes that have children) first, then leaves.
 * Both sub-groups sorted by elementType then label.
 *
 * @param {Object[]} nodes      LayoutGraph nodes ({ id, elementType, label, parent, ... })
 * @param {Object}   parentMap  { childId: parentId }
 * @returns {Object[]}          new sorted array
 */
function sortedNodes(nodes, parentMap) {
  const childSet = new Set(Object.values(parentMap));

  // Group by parent key
  const byParent = {};
  for (const node of nodes) {
    const key = node.parent || "__root__";
    (byParent[key] = byParent[key] || []).push(node);
  }

  const result = [];
  for (const group of Object.values(byParent)) {
    const ctrs   = group.filter(n =>  childSet.has(n.id)).sort(byTypeAndName);
    const leaves = group.filter(n => !childSet.has(n.id)).sort(byTypeAndName);
    result.push(...ctrs, ...leaves);
  }
  return result;
}

// ── Leaf-to-sibling-container width alignment ──────────────────────────────────

/**
 * Align bare leaf widths to neighbouring container boxes of the same element type
 * (in place).
 *
 * For each leaf node L, look at L's sibling sub-containers (other direct children
 * of L's parent that themselves have children). Among those whose element type
 * equals L's type, take the narrowest rendered width and set L.width to it.
 * Leaves with no same-type sibling container are left untouched. Sub-containers
 * are never resized — only leaves change. A leaf typically grows, since a
 * container box (children + padding) is wider than a bare element.
 *
 * Container widths are computed by the engine, so they are only known after a
 * first layout pass; the caller supplies them via `containerWidthById`.
 *
 * Works with both LayoutGraph nodes (elementType / parent) and ELK nodeMap
 * items (_type) when called with a matching parentMap.
 *
 * @param {Object[]} items              nodes to process — each needs { id, width } plus
 *                                      elementType or _type for grouping
 * @param {Object}   parentMap          { childId: parentId } — identifies leaves and groups siblings
 * @param {Object}   containerWidthById { containerId: renderedWidth } from pass 1
 * @returns {Object[]}                  same array (mutated)
 */
function alignLeavesToSiblingContainers(items, parentMap, containerWidthById) {
  const containerIds = new Set(Object.values(parentMap));

  // Index sibling sub-containers by parentKey + type → list of rendered widths.
  const siblingContainerWidths = {};
  for (const item of items) {
    if (!containerIds.has(item.id)) continue;        // containers only
    const w = containerWidthById[item.id];
    if (!(w > 0)) continue;                          // no rendered width → skip
    const pKey = parentMap[item.id] || "__root__";
    const type = item.elementType || item._type || "";
    const key  = pKey + "::" + type;
    (siblingContainerWidths[key] = siblingContainerWidths[key] || []).push(w);
  }

  for (const item of items) {
    if (containerIds.has(item.id)) continue;         // skip containers — leaves only
    const pKey = parentMap[item.id] || "__root__";
    const type = item.elementType || item._type || "";
    const widths = siblingContainerWidths[pKey + "::" + type];
    if (widths && widths.length) item.width = Math.min(...widths);
  }
  return items;
}

// ── Parameter mapping ─────────────────────────────────────────────────────────

/**
 * Apply a PARAM_MAPPING for the given algorithm and options.
 * Each engine owns its own mapping object; this function is the shared executor.
 * @param {string} algName
 * @param {Object} opts      graph.options
 * @param {Object} mapping   the engine's PARAM_MAPPING
 * @returns {Object}         merged attribute object
 */
function applyParams(algName, opts, mapping) {
  const map = mapping[algName] || {};
  const result = {};
  for (const [key, fn] of Object.entries(map)) {
    if (opts[key] !== undefined) Object.assign(result, fn(opts[key], opts));
  }
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { selfLoopResult, byTypeAndName, sortedNodes, alignLeavesToSiblingContainers, applyParams };
}
