/**
 * Shared utilities for layout engine adapters.
 * 
 * These functions operate on the LayoutGraph data structure (engine-agnostic)
 * and are used by both elk.js and dagre.js.
 */
console.log("Loading engines/engine-utils.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const { LABEL_SIZING_DEFAULTS } = require(REPO_ROOT + "View/lib/defs");

// ── Self-loop pass-through ────────────────────────────────────────────────────

/**
 * Build a pass-through LayoutResultEdge for a self-loop that was not routed by the engine.
 * The writer synthesises bendpoints from the node's bounds.
 * @param {LayoutEdge} edge
 * @returns {LayoutResultEdge}
 */
function selfLoopResult(edge) {
  return {
    id: edge.id,
    conceptId: edge.conceptId,
    sourceId: edge.source,
    targetId: edge.target,
    bendpoints: [],
    labelX: 0,
    labelY: 0,
    isStraight: false,
  };
}

// ── Node sorting ──────────────────────────────────────────────────────────────

/**
 * Comparator for nodes: by element type first, then by name.
 * Works with both LayoutGraph nodes (elementType / label) and
 * ELK nodeMap items (_type / _name).
 * @param {{ elementType?: string, _type?: string, label?: string, _name?: string }} a
 * @param {{ elementType?: string, _type?: string, label?: string, _name?: string }} b
 */
function byTypeAndName(a, b) {
  const ta = a.elementType || a._type || "";
  const tb = b.elementType || b._type || "";
  const na = a.label || a._name || "";
  const nb = b.label || b._name || "";
  return ta.localeCompare(tb) || na.localeCompare(nb);
}

/**
 * Return a sorted copy of LayoutGraph nodes.
 * Within each parent group: containers (nodes that have children) first, then leaves.
 * Leaves are ALWAYS sorted by elementType then label; containers are sorted only when
 * sortContainers is true (otherwise they keep their original order).
 *
 * @param {LayoutNode[]}            nodes           LayoutGraph nodes
 * @param {Record<string, string>} parentMap       { childId: parentId }
 * @param {boolean}                sortContainers  whether to also sort containers
 * @returns {LayoutNode[]}                         new sorted array
 */
function sortedNodes(nodes, parentMap, sortContainers) {
  const childSet = new Set(Object.values(parentMap));

  // Group by parent key
  /** @type {Record<string, LayoutNode[]>} */
  const byParent = {};
  for (const node of nodes) {
    const key = node.parent || "__root__";
    (byParent[key] = byParent[key] || []).push(node);
  }

  const result = [];
  for (const group of Object.values(byParent)) {
    const ctrs = group.filter((n) => childSet.has(n.id));
    const leaves = group.filter((n) => !childSet.has(n.id)).sort(byTypeAndName);
    if (sortContainers) ctrs.sort(byTypeAndName);
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
 * @param {{ id: string, _name?: string, label?: string }[]} items  nodes to process
 * @param {Record<string, string>} parentMap         { childId: parentId } — defines levels and subtrees
 * @param {Record<string, number>} renderedWidthById { id: pass-1 renderedWidth } for all boxes
 * @param {number}                 ring              width added per nesting level (= 2 × container padding)
 * @param {(msg: string) => void}  [log]             optional logger (e.g. console.log) for diagnostics
 * @returns {Record<string, number>}                 { id: targetWidth } for every item
 */
function alignWidthsByLevel(items, parentMap, renderedWidthById, ring, log) {
  // Children index from parentMap.
  /** @type {Record<string, string[]>} */
  const childrenOf = {};
  for (const childId of Object.keys(parentMap)) {
    const p = parentMap[childId];
    (childrenOf[p] = childrenOf[p] || []).push(childId);
  }
  /** @type {Record<string, string>} */
  const nameOf = {};
  for (const it of items) nameOf[it.id] = it._name || it.label || it.id;
  const isContainer = (/** @type {string} */ id) => !!(childrenOf[id] && childrenOf[id].length);

  /** @type {Record<string, number>} */
  const levelCache = {};
  /** @param {string} id */
  function level(id) {
    if (id in levelCache) return levelCache[id];
    let l = 0,
      cur = id;
    while (parentMap[cur] != null) {
      l++;
      cur = parentMap[cur];
    }
    return (levelCache[id] = l);
  }

  // Sub-nesting depth: 0 for a leaf, else 1 + max child depth.
  /** @type {Record<string, number>} */
  const subCache = {};
  /**
   * @param {string} id
   * @returns {number}
   */
  function subtreeDepth(id) {
    if (id in subCache) return subCache[id];
    const kids = childrenOf[id];
    if (!kids || !kids.length) return (subCache[id] = 0);
    let m = 0;
    for (const k of kids) m = Math.max(m, subtreeDepth(k));
    return (subCache[id] = 1 + m);
  }

  const widthOf = (/** @type {string} */ id) => {
    const w = renderedWidthById[id];
    return w > 0 ? w : 0;
  };

  // Group box ids by level.
  /** @type {Record<number, string[]>} */
  const byLevel = {};
  for (const it of items) (byLevel[level(it.id)] = byLevel[level(it.id)] || []).push(it.id);
  const levels = Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => a - b);

  // Telescoping widths: anchor the deepest level at its narrowest box (the leaf base),
  // then each level above is one ring wider than the level it contains.
  const deepestLevel = levels[levels.length - 1];
  let anchor = Infinity;
  for (const id of byLevel[deepestLevel]) {
    const w = widthOf(id);
    if (w > 0 && w < anchor) anchor = w;
  }
  if (!isFinite(anchor)) anchor = 0;

  /** @type {Record<number, number>} */
  const W = {};
  W[deepestLevel] = anchor;
  for (let i = levels.length - 2; i >= 0; i--) {
    const L = levels[i],
      inner = levels[i + 1];
    W[L] = W[inner] + ring * (inner - L); // one ring per nesting level
  }

  /** @type {Record<string, number>} */
  const targetById = {};
  for (const it of items) targetById[it.id] = W[level(it.id)] || 0;

  if (typeof log === "function") {
    log(
      `[alignByLevel] ${items.length} boxes, ${levels.length} level(s); ` +
        `ring=${ring}, anchor=${anchor} @ deepest level ${deepestLevel}`,
    );
    for (const L of levels) log(`  level ${L}: ${byLevel[L].length} box(es)  ⇒ W[${L}]=${W[L]}`);
  }
  return targetById;
}

// ── Parameter mapping ─────────────────────────────────────────────────────────

/**
 * Apply a PARAM_MAPPING for the given algorithm and options.
 * Each engine owns its own mapping object; this function is the shared executor.
 * @param {string}          algName
 * @param {EffectiveParams} opts      graph.options
 * @param {ParamMapping}    mapping   the engine's PARAM_MAPPING
 * @returns {Record<string, unknown>} merged attribute object
 */
function applyParams(algName, opts, mapping) {
  const map = mapping[algName] || {};
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const [key, fn] of Object.entries(map)) {
    // Casts: key comes from the mapping, whose keys are param names.
    if (/** @type {Record<string, unknown>} */ (opts)[key] !== undefined) Object.assign(result, fn(/** @type {Record<string, unknown>} */ (opts)[key], opts));
  }
  return result;
}

// ── Edge-density node sizing ──────────────────────────────────────────────────

// Minimum connections on a node's busiest side before port-spacing enlargement kicks in.
const MIN_CONNECTIONS_FOR_ENLARGEMENT = 2;

/**
 * Pre-layout: expand node height (horizontal direction) or width (vertical direction)
 * so that nodes with many connections have enough space for their edge ports.
 *
 * Controlled by params.connectionSpacing (px per edge on busiest side — the port spacing).
 * 0 or absent = disabled. Only expands — never shrinks below the current size.
 *
 * @param {LayoutNode[]}    nodes   LayoutGraph nodes (mutated in place)
 * @param {LayoutEdge[]}    edges   LayoutGraph edges
 * @param {EffectiveParams | null | undefined} params  preset.params (needs .direction, .connectionSpacing)
 */
function expandNodeSizesForEdgeDensity(nodes, edges, params) {
  const spacing = params && params.connectionSpacing;
  if (!spacing || spacing <= 0) return;

  const dir = (params && params.direction) || "Right";
  const isHorizontal = dir === "Left" || dir === "Right";

  /** @type {Record<string, number>} */
  const inCount = {};
  /** @type {Record<string, number>} */
  const outCount = {};
  for (const edge of edges) {
    if (edge.source === edge.target) continue; // self-loops don't occupy a side
    inCount[edge.target] = (inCount[edge.target] || 0) + 1;
    outCount[edge.source] = (outCount[edge.source] || 0) + 1;
  }

  for (const node of nodes) {
    const maxSide = Math.max(inCount[node.id] || 0, outCount[node.id] || 0);
    if (maxSide < MIN_CONNECTIONS_FOR_ENLARGEMENT) continue;
    const needed = (maxSide + 1) * spacing;
    if (isHorizontal) {
      if (needed > node.height) node.height = needed;
    } else {
      if (needed > node.width) node.width = needed;
    }
  }
}

// ── Label-based node sizing ───────────────────────────────────────────────────

/**
 * Pre-layout: set node width and height based on label text length.
 * Short labels get small nodes; long labels wrap to two lines and get a taller node.
 * Enabled by params.labelSizing (GUI checkbox, active for Pack and Grid).
 * Tuning via engineParams.layout.labelChar*, labelLine*, labelH/VPadding, etc.
 *
 * @param {LayoutNode[]} nodes         LayoutGraph nodes (mutated in place)
 * @param {EffectiveParams | null | undefined} params  preset.params (needs .labelSizing)
 * @param {EngineParams | null | undefined}    engineParams  merged engineParams (tuning keys in .layout)
 */
function sizeLabelBasedNodes(nodes, params, engineParams) {
  if (!params || !params.labelSizing) return;
  /** @type {LabelSizing} */
  const lp = Object.assign({}, LABEL_SIZING_DEFAULTS, engineParams && engineParams.layout);
  if (params.labelMaxLineWidth !== undefined) lp.labelMaxLineWidth = params.labelMaxLineWidth;
  const charW = lp.labelCharWidth;
  const lineH = lp.labelLineHeight;
  const hPad = lp.labelHPadding;
  const vPad = lp.labelVPadding;
  const maxLineW = lp.labelMaxLineWidth;
  const minW = lp.labelMinWidth;
  const minH = lp.labelMinHeight;

  for (const node of nodes) {
    const label = (node.label || "").trim();
    if (!label) continue;

    const rawPx = _textWidth(label, charW);
    const innerMax = maxLineW - 2 * hPad;

    let w, h;
    if (rawPx <= innerMax) {
      // fits on one line
      w = rawPx + 2 * hPad;
      h = lineH + vPad;
    } else {
      const split = _nearestSpace(label, Math.floor(label.length / 2));
      if (split < 0) {
        // no space → cannot wrap; single long line
        w = rawPx + 2 * hPad;
        h = lineH + vPad;
      } else {
        // two lines: split at nearest space to midpoint
        const line1 = label.slice(0, split);
        const line2 = label.slice(split + 1);
        w = Math.max(_textWidth(line1, charW), _textWidth(line2, charW)) + 2 * hPad;
        h = 2 * lineH + vPad;
      }
    }
    node.width = Math.max(minW, Math.ceil(w));
    node.height = Math.max(minH, Math.ceil(h));
  }
}

// Estimated pixel width of a string: uppercase letters count double charW (they are wider),
// every other character counts single. Uppercase detection covers accented letters too.
/**
 * @param {string} str
 * @param {number} charW
 */
function _textWidth(str, charW) {
  let units = 0;
  for (const c of str) {
    const isUpper = c !== c.toLowerCase() && c === c.toUpperCase();
    units += isUpper ? 2 : 1;
  }
  return units * charW;
}

/**
 * @param {string} str
 * @param {number} mid
 */
function _nearestSpace(str, mid) {
  for (let d = 0; d <= mid; d++) {
    if (str[mid - d] === " ") return mid - d;
    if (str[mid + d] === " ") return mid + d;
  }
  return -1;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    selfLoopResult,
    byTypeAndName,
    sortedNodes,
    alignWidthsByLevel,
    applyParams,
    expandNodeSizesForEdgeDensity,
    sizeLabelBasedNodes,
    _textWidth,
  };
}
