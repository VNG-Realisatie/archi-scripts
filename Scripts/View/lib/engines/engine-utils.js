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

// ── Width alignment by nesting level ───────────────────────────────────────────

/**
 * Compute a per-box target width that aligns every box at the same nesting level
 * to a common width, across the whole hierarchy.
 *
 * Level = nesting depth (root-level boxes are level 0, their children level 1, …).
 * Widths **telescope**: the deepest level is anchored at its narrowest box (the leaf
 * base width), and each level above is exactly one padding `ring` wider than the
 * level it contains (`W[L] = W[L+1] + ring`). This yields clean concentric frames —
 * a box at level L is as wide as a single-column container of that depth would be.
 *
 * The caller applies the returned widths as: an **exact** width on leaves, and a
 * **minimum-size floor** on containers (so a container never shrinks below its
 * content — "smallest, but never below content"; a multi-column container bulges
 * past its level width). Widths are only known after a first layout pass, so the
 * caller passes pass-1 rendered widths via `renderedWidthById`.
 *
 * @param {Object[]} items             nodes to process — each needs { id }
 * @param {Object}   parentMap         { childId: parentId } — defines levels and subtrees
 * @param {Object}   renderedWidthById { id: pass-1 renderedWidth } for all boxes
 * @param {number}   ring              width added per nesting level (= 2 × container padding)
 * @param {Function} [log]             optional logger (e.g. console.log) for diagnostics
 * @returns {Object}                   { id: targetWidth } for every item
 */
function alignWidthsByLevel(items, parentMap, renderedWidthById, ring, log, debugLog) {
  // Children index from parentMap.
  const childrenOf = {};
  for (const childId of Object.keys(parentMap)) {
    const p = parentMap[childId];
    (childrenOf[p] = childrenOf[p] || []).push(childId);
  }
  const nameOf = {};
  for (const it of items) nameOf[it.id] = it._name || it.label || it.id;
  const isContainer = id => !!(childrenOf[id] && childrenOf[id].length);

  const levelCache = {};
  function level(id) {
    if (id in levelCache) return levelCache[id];
    let l = 0, cur = id;
    while (parentMap[cur] != null) { l++; cur = parentMap[cur]; }
    return (levelCache[id] = l);
  }

  // Sub-nesting depth: 0 for a leaf, else 1 + max child depth.
  const subCache = {};
  function subtreeDepth(id) {
    if (id in subCache) return subCache[id];
    const kids = childrenOf[id];
    if (!kids || !kids.length) return (subCache[id] = 0);
    let m = 0;
    for (const k of kids) m = Math.max(m, subtreeDepth(k));
    return (subCache[id] = 1 + m);
  }

  const widthOf = id => { const w = renderedWidthById[id]; return w > 0 ? w : 0; };

  // Group box ids by level.
  const byLevel = {};
  for (const it of items) (byLevel[level(it.id)] = byLevel[level(it.id)] || []).push(it.id);
  const levels = Object.keys(byLevel).map(Number).sort((a, b) => a - b);

  // Telescoping widths: anchor the deepest level at its narrowest box (the leaf base),
  // then each level above is one ring wider than the level it contains.
  const deepestLevel = levels[levels.length - 1];
  let anchor = Infinity;
  for (const id of byLevel[deepestLevel]) { const w = widthOf(id); if (w > 0 && w < anchor) anchor = w; }
  if (!isFinite(anchor)) anchor = 0;

  const W = {};
  W[deepestLevel] = anchor;
  for (let i = levels.length - 2; i >= 0; i--) {
    const L = levels[i], inner = levels[i + 1];
    W[L] = W[inner] + ring * (inner - L);   // one ring per nesting level
  }

  const targetById = {};
  for (const it of items) targetById[it.id] = W[level(it.id)] || 0;

  if (typeof log === "function") {
    log(`[alignByLevel] ${items.length} boxes, ${levels.length} level(s); ` +
        `ring=${ring}, anchor=${anchor} @ deepest level ${deepestLevel}`);
    for (const L of levels) log(`  level ${L}: ${byLevel[L].length} box(es)  ⇒ W[${L}]=${W[L]}`);
  }
  if (typeof debugLog === "function") {
    for (const it of items) {
      const id = it.id, L = level(it.id);
      const kind = isContainer(id) ? "container" : "leaf     ";
      const nat = widthOf(id), tgt = targetById[id];
      const note = isContainer(id) ? "(floor)" : (tgt > nat ? "(grow)" : tgt < nat ? "(SHRINK?)" : "(same)");
      debugLog(`    ${kind} L${L} sub${subtreeDepth(id)} natural=${nat} target=${tgt} ${note}  "${nameOf[id]}"`);
    }
  }

  return targetById;
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
  module.exports = { selfLoopResult, byTypeAndName, sortedNodes, alignWidthsByLevel, applyParams };
}
