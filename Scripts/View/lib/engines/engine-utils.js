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

// ── Leaf width equalization ───────────────────────────────────────────────────

/**
 * Equalize leaf node widths within same-type sibling groups (in place).
 *
 * Groups leaf nodes (nodes that are not containers) sharing the same parent and
 * element type. For each group with 2+ members, reduces all widths to the group
 * minimum. Container nodes are left untouched.
 *
 * Works with both LayoutGraph nodes (elementType / parent) and ELK nodeMap
 * items (_type) when called with a matching parentMap.
 *
 * @param {Object[]} items      nodes to process — each needs { id, width } plus
 *                              elementType or _type for grouping
 * @param {Object}   parentMap  { childId: parentId } — used to identify leaves and group siblings
 * @returns {Object[]}          same array (mutated)
 */
function equalizeLeafWidths(items, parentMap) {
  const childSet = new Set(Object.values(parentMap));

  // Group leaf siblings by parentKey + elementType.
  // Use parentMap[item.id] for the parent key — works for both LayoutGraph nodes
  // (parentMap keyed by childId) and ELK nodeMap items (same parentMap).
  const groups = {};
  for (const item of items) {
    if (childSet.has(item.id)) continue;  // skip containers
    const pKey = parentMap[item.id] || "__root__";
    const type = item.elementType || item._type || "";
    const key  = pKey + "::" + type;
    (groups[key] = groups[key] || []).push(item);
  }

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue;
    const minW = Math.min(...group.map(n => n.width || 0));
    for (const item of group) {
      if ((item.width || 0) > minW) item.width = minW;
    }
  }
  return items;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { selfLoopResult, byTypeAndName, sortedNodes, equalizeLeafWidths };
}
