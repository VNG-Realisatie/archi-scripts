/**
 * Shared utilities for layout engine adapters.
 * 
 * These functions operate on the LayoutGraph data structure (engine-agnostic)
 * and are used by elk.js, dagre.js and graphviz.js (the column snap and the width alignment by elk.js only).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading engines/engine-utils.js");

/** @type {typeof import("../defs")} */
const { LABEL_SIZING_DEFAULTS, compareNames, ALGORITHMS, PARAM_LABELS, SORT_MODE } = require(REPO_ROOT + "View/lib/defs");

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
 * Comparator for LayoutGraph nodes: by element type (code point) first, then by name (Defs.compareNames).
 * @param {{ elementType?: string, label?: string }} a
 * @param {{ elementType?: string, label?: string }} b
 */
function byTypeAndName(a, b) {
  const ta = a.elementType || "";
  const tb = b.elementType || "";
  const na = a.label || "";
  const nb = b.label || "";
  if (ta !== tb) return ta < tb ? -1 : 1;
  return compareNames(na, nb);
}

// Selection order (defs SELECTION_ORDER) → comparator; Selection has none: the order the elements came in.
/** @type {Record<string, (a: LayoutNode, b: LayoutNode) => number>} */
const ORDER_COMPARE = {
  "Name △":          (a, b) => compareNames(a.label || "", b.label || ""),
  "Type and name △": byTypeAndName,
  "Name ▽":          (a, b) => compareNames(b.label || "", a.label || ""),
};

/**
 * Return a sorted copy of LayoutGraph nodes, by `sortMode` (defs SORT_MODE), always ascending, at
 * every level including the root, in a view with containers. Within each parent group: None keeps the order the nodes came in.
 * Elements puts the containers (nodes that have children) first as they came, then the leaves by
 * elementType then label. Containers, then elements orders the containers by type and name too.
 * All together puts containers and leaves of a parent in one list, by type and name.
 * Without a sort mode (the algorithm has no Sort: directed views) the leaves inside containers are
 * ordered by type and name, the containers and the elements outside containers keep their order
 * (Selection order, generate_view.js).
 *
 * @param {LayoutNode[]}            nodes           LayoutGraph nodes
 * @param {Record<string, string>} parentMap       { childId: parentId }
 * @param {string}                 [sortMode]      SORT_MODE value
 * @returns {LayoutNode[]}                         new sorted array
 */
function sortedNodes(nodes, parentMap, sortMode) {
  const childSet = new Set(Object.values(parentMap));
  if (!childSet.size) return nodes.slice();   // no containers: nothing to sort, Selection order orders the elements

  // Group by parent key
  /** @type {Record<string, LayoutNode[]>} */
  const byParent = {};
  for (const node of nodes) {
    const key = node.parent || "__root__";
    (byParent[key] = byParent[key] || []).push(node);
  }

  const result = [];
  for (const [key, group] of Object.entries(byParent)) {
    if (sortMode === SORT_MODE.NONE) { result.push(...group); continue; }
    if (sortMode === SORT_MODE.ALL_TOGETHER) { result.push(...group.slice().sort(byTypeAndName)); continue; }
    const ctrs = group.filter((n) => childSet.has(n.id));
    const leaves = group.filter((n) => !childSet.has(n.id));
    if (sortMode !== undefined || key !== "__root__") leaves.sort(byTypeAndName);
    if (sortMode === SORT_MODE.CONTAINERS_FIRST) ctrs.sort(byTypeAndName);
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
 * Widths **telescope**: each level is one padding `ring` wider than the level it contains
 * (`W[L] = W[L+1] + ring`), and the whole stack is as narrow as it can be while every level is
 * at least as wide as its widest leaf (`Use label width`: the widest label of a level sets
 * the stack, so no label is cut). With equal leaf widths the deepest level is the leaf width
 * and nested containers are concentric — a box at level L is as wide as a single-column container of
 * that depth would be.
 *
 * The caller applies the returned widths as: an **exact** width on leaves, and a
 * **minimum-size floor** on containers (so a container never shrinks below its
 * content — "smallest, but never below content"; a multi-column container bulges
 * past its level width). Only the deepest level's widths are read; that level holds
 * leaves only, whose input widths the engine keeps, so no layout pass is needed.
 *
 * @param {{ id: string }[]}       items             nodes to process
 * @param {Record<string, string>} parentMap         { childId: parentId } — defines levels and subtrees
 * @param {Record<string, number>} widthById         { id: width } for all boxes
 * @param {number}                 ring              width added per nesting level (= 2 × container padding)
 * @param {(msg: string) => void}  [log]             optional logger (e.g. console.log) for diagnostics
 * @returns {Record<string, number>}                 { id: targetWidth } for every item
 */
function alignWidthsByLevel(items, parentMap, widthById, ring, log) {
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

  const widthOf = (/** @type {string} */ id) => {
    const w = widthById[id];
    return w > 0 ? w : 0;
  };

  // Group box ids by level.
  /** @type {Record<number, string[]>} */
  const byLevel = {};
  for (const it of items) (byLevel[level(it.id)] = byLevel[level(it.id)] || []).push(it.id);
  const levels = Object.keys(byLevel)
    .map(Number)
    .sort((a, b) => a - b);

  // Widest leaf per level: leaves are the boxes no other box names as parent.
  const parentIds = new Set(Object.values(parentMap));
  /** @type {Record<number, number>} */
  const widestLeaf = {};
  for (const it of items) {
    if (parentIds.has(it.id)) continue;
    const L = level(it.id);
    widestLeaf[L] = Math.max(widestLeaf[L] || 0, widthOf(it.id));
  }

  // Telescoping widths: the top level is as wide as the widest level needs (its widest leaf plus one
  // ring per level above it), and each level below is one ring narrower. The deepest level sits on
  // its own widest leaf when that is the one that decides.
  const topLevel = levels[0];
  let top = 0;
  for (const L of levels) top = Math.max(top, (widestLeaf[L] || 0) + ring * (L - topLevel));
  /** @type {Record<number, number>} */
  const W = {};
  for (const L of levels) W[L] = top - ring * (L - topLevel);
  const deepestLevel = levels[levels.length - 1];
  const anchor = W[deepestLevel];

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

// ── Edge geometry ─────────────────────────────────────────────────────────────

/**
 * Point at parameter t (0..1) on the cubic Bézier curve p0 → p3 with control points p1, p2.
 * Not rounded: the caller rounds to pixels.
 * @param {Point}  p0
 * @param {Point}  p1
 * @param {Point}  p2
 * @param {Point}  p3
 * @param {number} t
 * @returns {Point}
 */
function cubicPoint(p0, p1, p2, p3, t) {
  const m = 1 - t;
  return {
    x: m*m*m*p0.x + 3*m*m*t*p1.x + 3*m*t*t*p2.x + t*t*t*p3.x,
    y: m*m*m*p0.y + 3*m*m*t*p1.y + 3*m*t*t*p2.y + t*t*t*p3.y,
  };
}

/**
 * Where a connection label sits: at the start or end point, or (Middle) on the middle bendpoint,
 * else on the midpoint between start and end.
 * @param {Point}   start
 * @param {Point}   end
 * @param {Point[]} bendpoints      rounded bendpoints between start and end
 * @param {string}  labelPosition   "Source" | "Target" | "Middle"
 * @returns {{ labelX: number, labelY: number }}
 */
function labelPoint(start, end, bendpoints, labelPosition) {
  if (labelPosition === "Source") return { labelX: Math.round(start.x), labelY: Math.round(start.y) };
  if (labelPosition === "Target") return { labelX: Math.round(end.x),   labelY: Math.round(end.y) };
  if (bendpoints.length > 0) {
    const mid = bendpoints[Math.floor(bendpoints.length / 2)];
    return { labelX: mid.x, labelY: mid.y };
  }
  return { labelX: Math.round((start.x + end.x) / 2), labelY: Math.round((start.y + end.y) / 2) };
}

// ── Column tracks across containers (CSS Grid subgrid model) ───────────────────

/**
 * Line the boxes of a nested view up on one set of column tracks across the whole view, as CSS Grid
 * does for nested subgrids. Mutates x and width in place; heights and y stay.
 *
 * Every leaf takes one track and every container the tracks of its leaves; a box's edges lie on the
 * track lines, so two boxes side by side are always the element distance apart, at every depth. A
 * container's padding counts in the track at its edge, as an extra margin on the leaves there, and
 * adds up through containers that share that edge (CSS Grid 2, subgrid item contribution).
 *
 *   1. Assign tracks: leaves at one x under one parent form a stack. In order of centre, each stack
 *      takes the leftmost track right of every stack whose branch stands beside its own (side by
 *      side under their lowest common container). A leaf beside a leaf in `fit` also stands beside
 *      the leaves of the containers it names, whose tracks that leaf will span.
 *   2. A leaf in `fit` spans the tracks of the narrowest container it names (fewest tracks; none:
 *      its own track). Track width: the widest leaf plus the paddings of the containers whose edge
 *      lies in the track; a leaf that spans containers does not size a track, unless a track holds
 *      nothing else.
 *      A container narrower than its minWidth widens the last of its tracks, inner containers first.
 *   3. Place: a container or a leaf in `fit` spans its tracks less the paddings of its ancestors on
 *      the same edges; any other leaf, a block without contents too, is centred in the part of its
 *      track inside its parent, never resized.
 *
 * A block with its contents in one column is one box to the grid, a leaf with its contents as Tiles
 * placed them: it fills its track, and its contents move with it, centred in it. A block with its
 * contents in more columns spans the grid's columns as a container does. So the blocks of one column
 * stand on the same track lines. A centred leaf is centred in the part of its track inside its nearest
 * ancestor that is no block, so the leaves inside blocks of one track line up.
 *      A box sharing an edge with its parent lies the paddings of its ancestors on that line in; an
 *      edge that faces a sibling lies on the line.
 *
 * @param {LayoutResultNode[]}     resultNodes  flattened nodes { id, x, y, width, height, parentId }
 * @param {EffectiveParams}        options      graph.options (spacing, padding)
 * @param {Record<string, string>} nameById     { id: displayName }
 * @param {(msg: string) => void}  log          logger
 * @param {Map<string, string[]>}  [fit]        leaves that fill their tracks: the containers whose span they take (none: their own track)
 * @param {Record<string, number>} [minWidth]   container id → the narrowest it may be (LayoutNode.minWidth)
 * @param {Set<string>}            [blocks]     boxes at the last nesting type change: one width, laid out as one
 * @param {PlacedTable[]}          [tables]     the tables of a background view as Tiles placed them: per table its container,
 *                                              its table columns and its cells. Cells in disjoint table columns lie on
 *                                              tracks of their own; cells that end (or begin) at one table column border end
 *                                              (begin) on one track line, so the table stays a table
 * @param {Set<string>}            [atomic]     (internal) the blocks the grid takes as one box
 */
function alignColumnsAcrossContainers(resultNodes, options, nameById, log, fit = new Map(), minWidth = {}, blocks = new Set(), tables = [], atomic = _oneColumn(resultNodes, blocks)) {
  const blockOf = _blockOf(resultNodes, atomic);
  if (blockOf.size) {
    const blockX = new Map([...atomic].map(id => [id, (resultNodes.find(n => n.id === id) || { x: 0 }).x]));
    alignColumnsAcrossContainers(resultNodes.filter(n => !blockOf.has(n.id)), options, nameById, log,
      new Map([...[...fit].filter(([id]) => !blockOf.has(id)), ...[...new Set(blockOf.values())].map(id => /** @type {[string, string[]]} */ ([id, []]))]), minWidth, blocks, tables, new Set());   // a block with contents fills its track
    const moved = new Map(resultNodes.filter(n => atomic.has(n.id)).map(n => [n.id, n.x - /** @type {number} */ (blockX.get(n.id))]));
    for (const n of resultNodes) if (blockOf.has(n.id)) n.x += /** @type {number} */ (moved.get(/** @type {string} */ (blockOf.get(n.id))));
    _centreOneColumn(resultNodes.filter(n => blockOf.has(n.id)), resultNodes);
    return;
  }
  /** @type {Record<string, LayoutResultNode>} */
  const byId = {};
  /** @type {Record<string, LayoutResultNode[]>} */
  const childrenByParent = {};
  /** @type {Set<string>} */
  const containerIds = new Set();
  for (const n of resultNodes) {
    byId[n.id] = n;
    if (n.parentId != null) {
      (childrenByParent[n.parentId] = childrenByParent[n.parentId] || []).push(n);
      containerIds.add(n.parentId);
    }
  }
  const isContainer = (/** @type {string} */ id) => containerIds.has(id);
  const centerOf = (/** @type {LayoutResultNode} */ n) => n.x + (n.width || 0) / 2;
  const rightOf  = (/** @type {LayoutResultNode} */ n) => n.x + (n.width || 0);
  const spacing = options.elementSpacing || 0;
  const pad = options.padding || 0;

  const leaves = resultNodes.filter(n => !isContainer(n.id));
  if (leaves.length < 2) { log("[columns] skipped (no columns)"); return; }
  /** @type {Map<string, { table: number, c0: number, c1: number, fixed: boolean }>} */
  const cellOf = new Map();
  tables.forEach((t, table) => { for (const c of t.cells) if (byId[c.id]) cellOf.set(c.id, { table, c0: c.c0, c1: c.c1, fixed: c.fixed }); });
  // A leaf that is a cell fills its cell (a diagram object keeps its size).
  const cellLeaves = new Set([...cellOf].filter(([id, c]) => !c.fixed && !isContainer(id)).map(([id]) => id));
  /**
   * The cells of table `table` that end at one table column border end on one track line, and those
   * that begin at one begin on one (the outermost of each group).
   * @param {number} table
   */
  const squareTable = table => {
    const cells = [...cellOf].filter(([id, c]) => c.table === table && !c.fixed && span[id]).map(([id, c]) => ({ id, ...c }));
    for (let k = 0; k < tables[table].columns; k++) {
      const ending = cells.filter(c => c.c1 === k), beginning = cells.filter(c => c.c0 === k);
      const hi = Math.max(...ending.map(c => span[c.id].hi)), lo = Math.min(...beginning.map(c => span[c.id].lo));
      for (const c of ending) span[c.id].hi = hi;
      for (const c of beginning) span[c.id].lo = lo;
    }
  };
  /** The tables of a container (null: of the view), squared before the container takes the span of its children. */
  const tablesIn = (/** @type {string | null} */ parent) => tables.flatMap((t, i) => t.parent === parent ? [i] : []);
  const yOver = (/** @type {LayoutResultNode} */ a, /** @type {LayoutResultNode} */ b) => a.y < b.y + (b.height || 0) && b.y < a.y + (a.height || 0);
  /** @param {LayoutResultNode} n  the node and its ancestors, the node first */
  const chainOf = n => { const out = [n]; while (out[out.length - 1].parentId != null) out.push(byId[/** @type {string} */ (out[out.length - 1].parentId)]); return out; };
  /**
   * True when the branches of two leaves under their lowest common container overlap in height.
   * @param {LayoutResultNode} a
   * @param {LayoutResultNode} b
   */
  const sideBySide = (a, b) => yOver(...branchesOf(a, b));
  /** The branches of two leaves under their lowest common container.
   * @param {LayoutResultNode} a  @param {LayoutResultNode} b  @returns {[LayoutResultNode, LayoutResultNode]} */
  function branchesOf(a, b) {
    const ca = chainOf(a), cb = chainOf(b);
    let i = ca.length - 1, j = cb.length - 1;
    while (i > 0 && j > 0 && ca[i - 1] === cb[j - 1]) { i--; j--; }
    if (ca[i] === cb[j]) { i--; j--; }   // a common ancestor: step to the branches below it
    return [ca[i], cb[j]];
  }
  /** Cells of one table in disjoint table columns: their leaves share no track, whatever their table rows. */
  const columnsApart = (/** @type {LayoutResultNode} */ a, /** @type {LayoutResultNode} */ b) => {
    const [p, q] = branchesOf(a, b), cp = cellOf.get(p.id), cq = cellOf.get(q.id);
    return !!cp && !!cq && cp.table === cq.table && (cp.c1 < cq.c0 || cq.c1 < cp.c0);
  };

  // 1. Assign tracks: stacks in order of centre, each in the leftmost track its side-by-side neighbours allow.
  /** @type {Map<string, LayoutResultNode[]>} */
  const stackOf = new Map();
  for (const lf of leaves) {
    const key = `${lf.parentId}|${Math.round(lf.x)}`;
    if (!stackOf.has(key)) stackOf.set(key, []);
    /** @type {LayoutResultNode[]} */ (stackOf.get(key)).push(lf);
  }
  const stacks = [...stackOf.values()].sort((a, b) => centerOf(a[0]) - centerOf(b[0]));
  // A leaf in `fit` will span the tracks of the containers it names: a leaf beside it stands beside their leaves too.
  /** @type {[LayoutResultNode, Set<LayoutResultNode>][]} */
  const fitting = [...fit].filter(([, ids]) => ids.length).map(([id, ids]) =>
    [byId[id], new Set(leaves.filter(lf => chainOf(lf).some(n => ids.includes(n.id))))]);
  /** @param {LayoutResultNode} a  @param {LayoutResultNode} b  b beside a leaf in `fit` whose span holds a */
  const besideSpan = (a, b) => fitting.some(([f, under]) => under.has(a) && f !== b && !under.has(b) && sideBySide(f, b));
  /** @param {LayoutResultNode} a  @param {LayoutResultNode} b */
  const apart = (a, b) => sideBySide(a, b) || columnsApart(a, b) || besideSpan(a, b) || besideSpan(b, a);
  /** @type {number[]} */
  const stackTrack = [];
  stacks.forEach((st, i) => {
    let t = 0;
    for (let h = 0; h < i; h++) if (stackTrack[h] >= t && stacks[h].some(m => st.some(lf => apart(m, lf)))) t = stackTrack[h] + 1;
    stackTrack.push(t);
  });
  const tracks = Math.max(0, ...stackTrack) + 1;
  if (tracks < 2) { log("[columns] 1 column — nothing to align"); return; }
  /** @type {Record<string, { lo: number, hi: number }>} */
  const span = {};
  stacks.forEach((st, i) => st.forEach(lf => { span[lf.id] = { lo: stackTrack[i], hi: stackTrack[i] }; }));
  const depthOf = (/** @type {string} */ id) => chainOf(byId[id]).length - 1;
  const containersByDepth = [...containerIds].sort((a, b) => depthOf(b) - depthOf(a));
  /** @param {LayoutResultNode[]} kids  siblings: a leaf in `fit` takes the span of the narrowest container it names */
  const spanFitting = kids => {
    for (const k of kids) {
      const named = (fit.get(k.id) || []).map(c => span[c]);
      if (named.length) span[k.id] = named.reduce((p, q) => q.hi - q.lo < p.hi - p.lo ? q : p);
    }
  };
  for (const cid of containersByDepth) {
    const kids = childrenByParent[cid];
    spanFitting(kids);
    for (const table of tablesIn(cid)) squareTable(table);
    span[cid] = { lo: Math.min(...kids.map(k => span[k.id].lo)), hi: Math.max(...kids.map(k => span[k.id].hi)) };
  }
  spanFitting(resultNodes.filter(n => n.parentId == null));
  for (const table of tablesIn(null)) squareTable(table);
  // The cells at the outer table column borders of a table in a container reach the container's edges
  // (the container may be wider than its cells, drawn to the edge of its own table). Outer first.
  const inContainers = tables.flatMap((t, i) => t.parent != null ? [i] : []).sort((p, q) => depthOf(/** @type {string} */ (tables[p].parent)) - depthOf(/** @type {string} */ (tables[q].parent)));
  for (const table of inContainers) {
    const container = span[/** @type {string} */ (tables[table].parent)];
    if (!container) continue;
    for (const [id, c] of cellOf) {
      if (c.table !== table || c.fixed || !span[id]) continue;
      if (c.c1 === tables[table].columns - 1) span[id].hi = Math.max(span[id].hi, container.hi);
      if (c.c0 === 0) span[id].lo = Math.min(span[id].lo, container.lo);
    }
  }
  // Insets in paddings from the track line, per edge: one more than the parent's where the parent has
  // its edge on the same line; an edge that faces a sibling has none. So every box on a track line
  // lies its own ancestors' paddings in, whatever its depth.
  /** @type {Record<string, { lo: number, hi: number }>} */
  const inset = {};
  for (const n of [...resultNodes].sort((a, b) => depthOf(a.id) - depthOf(b.id))) {
    const p = n.parentId != null ? byId[n.parentId] : null;
    inset[n.id] = { lo: 0, hi: 0 };
    for (const edge of /** @type {("lo" | "hi")[]} */ (["lo", "hi"]))
      inset[n.id][edge] = p && span[p.id][edge] === span[n.id][edge] ? inset[p.id][edge] + 1 : 0;
  }

  // 2. Track widths: the widest leaf plus the paddings on its edges; leaves that fit only where nothing else is.
  /** @type {number[]} */
  const width = new Array(tracks).fill(0);
  /** @type {number[]} */
  const fitWidth = new Array(tracks).fill(0);
  for (const lf of leaves) {
    const t = span[lf.id].lo, need = (lf.width || 0) + pad * (inset[lf.id].lo + inset[lf.id].hi);
    if (!(fit.get(lf.id) || []).length && !cellLeaves.has(lf.id)) width[t] = Math.max(width[t], need);
    else if (span[lf.id].hi === t) fitWidth[t] = Math.max(fitWidth[t], need);
  }
  for (let t = 0; t < tracks; t++) if (!width[t]) width[t] = fitWidth[t];
  const spanned = [...containerIds].sort((a, b) => (span[a].hi - span[a].lo) - (span[b].hi - span[b].lo));
  for (const id of spanned) {
    const { lo, hi } = span[id];
    let w = (hi - lo) * spacing - pad * (inset[id].lo + inset[id].hi);
    for (let t = lo; t <= hi; t++) w += width[t];
    if (w < (minWidth[id] || 0)) width[hi] += minWidth[id] - w;
  }
  const origin = Math.min(...resultNodes.filter(n => n.parentId == null).map(n => n.x));
  /** @type {number[]} */
  const start = [origin];
  for (let t = 1; t < tracks; t++) start.push(start[t - 1] + width[t - 1] + spacing);

  // 3. Place every box on the track lines, inside the paddings of the ancestors on its edges; then
  // centre the other leaves in the part of their track inside their parent.
  /** @type {LayoutResultNode[]} */
  const centred = [];
  for (const n of resultNodes) {
    const left = start[span[n.id].lo] + pad * inset[n.id].lo;
    const right = start[span[n.id].hi] + width[span[n.id].hi] - pad * inset[n.id].hi;
    if (isContainer(n.id) || fit.has(n.id) || cellLeaves.has(n.id)) { n.x = left; n.width = right - left; }
    else centred.push(n);
  }
  for (const n of centred) {
    let p = n.parentId != null ? byId[n.parentId] : null;
    while (p && blocks.has(p.id)) p = p.parentId != null ? byId[p.parentId] : null;
    const left = Math.max(start[span[n.id].lo], p ? p.x + pad : -Infinity);
    const right = Math.min(start[span[n.id].hi] + width[span[n.id].hi], p ? rightOf(p) - pad : Infinity);
    n.x = left + (right - left - (n.width || 0)) / 2;
    const own = n.parentId != null ? byId[n.parentId] : null;   // never in its own parent's padding
    if (own) n.x = Math.max(own.x + pad, Math.min(n.x, rightOf(own) - pad - (n.width || 0)));
  }

  log(`[columns] applied — ${tracks} tracks, widths [${width.map(Math.round).join(", ")}]`);
  // Check: siblings side by side are at least the element distance apart.
  const nm = (/** @type {string} */ id) => nameById[id] || id;
  /** @type {string[]} */
  const overlaps = [];
  for (const sibs of [resultNodes.filter(n => n.parentId == null), ...Object.values(childrenByParent)]) {
    for (const a of sibs) for (const b of sibs) {
      if (a !== b && yOver(a, b) && a.x <= b.x && b.x - rightOf(a) < spacing - 1e-6 && (a.x < b.x || a.id < b.id))
        overlaps.push(`    "${nm(a.id)}" ↔ "${nm(b.id)}" gap=${Math.round(b.x - rightOf(a))}px`);
    }
  }
  if (overlaps.length) { log("[columns] siblings closer than the element distance:"); for (const l of overlaps.slice(0, 20)) log(l); }
  else log(`[columns] overlap scan: clean (all adjacent siblings ≥ ${spacing}px)`);
}

/**
 * Inside blocks: the children of a container that Tiles stacked in one column (one x) are centred in
 * it (Tiles places them at its left); what lies inside a child moves with it.
 * @param {LayoutResultNode[]} inside       the boxes inside blocks
 * @param {LayoutResultNode[]} resultNodes
 */
function _centreOneColumn(inside, resultNodes) {
  const byId = new Map(resultNodes.map(n => [n.id, n]));
  /** @param {LayoutResultNode} n */
  const depth = n => { let d = 0; for (let p = n.parentId; p != null; p = byId.get(p)?.parentId ?? null) d++; return d; };
  /** @type {Map<string, LayoutResultNode[]>} */
  const kids = new Map();
  for (const n of inside) { const p = /** @type {string} */ (n.parentId); kids.set(p, [...(kids.get(p) || []), n]); }
  const parents = [...kids.keys()].sort((a, b) => depth(/** @type {LayoutResultNode} */ (byId.get(a))) - depth(/** @type {LayoutResultNode} */ (byId.get(b))));
  for (const pid of parents) {
    const list = /** @type {LayoutResultNode[]} */ (kids.get(pid));
    if (new Set(list.map(n => n.x)).size !== 1) continue;
    const p = /** @type {LayoutResultNode} */ (byId.get(pid));
    for (const n of list) {
      const dx = p.x + (p.width - n.width) / 2 - n.x;
      for (const d of inside) { for (let a = /** @type {string | null} */ (d.id); a != null; a = byId.get(a)?.parentId ?? null) if (a === n.id) { d.x += dx; break; } }
    }
  }
}

/**
 * The blocks whose contents stand in one column (one x), or that hold nothing.
 * @param {LayoutResultNode[]} resultNodes
 * @param {Set<string>}        blocks
 * @returns {Set<string>}
 */
function _oneColumn(resultNodes, blocks) {
  /** @type {Map<string, Set<number>>} */
  const xs = new Map();
  for (const n of resultNodes) if (n.parentId != null && blocks.has(n.parentId)) xs.set(n.parentId, (xs.get(n.parentId) || new Set()).add(n.x));
  return new Set([...blocks].filter(id => (xs.get(id) || new Set()).size <= 1));
}

/**
 * Per box inside a block (at any depth): its outermost block.
 * @param {LayoutResultNode[]} resultNodes
 * @param {Set<string>}        blocks
 * @returns {Map<string, string>}
 */
function _blockOf(resultNodes, blocks) {
  /** @type {Map<string, string>} */
  const out = new Map();
  if (!blocks.size) return out;
  /** @type {Map<string, string | null>} */
  const parentOf = new Map(resultNodes.map(n => [n.id, n.parentId]));
  for (const n of resultNodes) {
    for (let p = n.parentId; p != null; p = parentOf.get(p) ?? null) if (blocks.has(p)) out.set(n.id, p);   // the outermost
  }
  return out;
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
    const value = /** @type {Record<string, unknown>} */ (opts)[key];   // Cast: key comes from the mapping, whose keys are param names.
    if (value !== undefined) Object.assign(result, fn(value, opts));
  }
  return result;
}

/**
 * Engine keys whose value a dialog option sets through a mapping, each with that param. Each active
 * param is probed with its value, every value the algorithm offers for it, and 1 / 1000 or the other
 * boolean. A key the mapper leaves out for some probes counts as set by the dialog too (Cycles
 * Default sets no acyclicer); a key with one value for every probe is a fixed value the mapper adds
 * (e.g. Pack's compaction iterations with Distance), not set by the dialog.
 * @param {string}          algName
 * @param {EffectiveParams} opts     the run's params (active params only)
 * @param {ParamMapping}    mapping
 * @returns {Record<string, string>} engine key → param key
 */
function dialogKeys(algName, opts, mapping) {
  const offered = ALGORITHMS[algName] ? ALGORITHMS[algName].supportedOptions : {};
  /** @type {Record<string, string>} */
  const keys = {};
  for (const [param, fn] of Object.entries(mapping[algName] || {})) {
    const value = /** @type {Record<string, unknown>} */ (opts)[param];   // Cast: key comes from the mapping, whose keys are param names.
    if (value === undefined) continue;
    const probes = [value, ...(offered[param] || []), ...(typeof value === "boolean" ? [!value] : [1, 1000])];
    const outputs = probes.map(probe => fn(probe, opts));
    for (const key of new Set(outputs.flatMap(out => Object.keys(out)))) {
      if (new Set(outputs.map(out => key in out ? String(out[key]) : undefined)).size > 1) keys[key] = param;
    }
  }
  return keys;
}

// ── Settings outside the dialog ───────────────────────────────────────────────
// engineParams keys a preset sets without a dialog control. Each owner checks its own section
// (adapters: engineParams.<Engine>; label sizing below: engineParams.layout) and returns one
// finding per key; a key without a problem applies.

const SETTING_UNKNOWN = "unknown — not used, remove";
const SETTING_DEFAULT = "same as the default — remove";

// The type an engineParams value must have. `parsed`: the engine also reads the value from a text
// (ELK, dagre), so "20" is a number and "true" a boolean there.
/** @type {Readonly<Record<SettingType, { name: string, accepts(value: unknown, parsed: boolean): boolean }>>} */
const SETTING_TYPES = Object.freeze({
  number:       { name: "a number",           accepts: (v, parsed) => _isNumber(v, parsed) },
  integer:      { name: "a whole number",     accepts: (v, parsed) => _isNumber(v, parsed) && Number.isInteger(Number(v)) },
  boolean:      { name: "true or false",      accepts: (v, parsed) => typeof v === "boolean" || parsed && (v === "true" || v === "false") },
  text:         { name: "a text",             accepts: v => typeof v === "string" },
  numberOrText: { name: "a number or a text", accepts: v => typeof v === "string" || typeof v === "number" && Number.isFinite(v) },
});

/**
 * @param {unknown} value
 * @param {boolean} parsed  a text that holds a number counts
 * @returns {boolean}
 */
function _isNumber(value, parsed) {
  if (typeof value === "number") return Number.isFinite(value);
  return parsed && typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value));
}

/**
 * The finding for an engineParams value of the wrong type (the run stops on it), or null when the
 * type is right.
 * @param {string}      key
 * @param {unknown}     value
 * @param {SettingType} type
 * @param {boolean}     parsed  the engine reads the value from a text too
 * @returns {SettingFinding | null}
 */
function settingTypeFinding(key, value, type, parsed) {
  const t = SETTING_TYPES[type];
  return t.accepts(value, parsed) ? null : { key, value, problem: `must be ${t.name} — correct it`, invalid: true };
}

/**
 * The problem of one engineParams key (null when it applies: unknown, set by a dialog option
 * (the preset wins), or equal to what the run uses without it) and that value.
 * @param {string}                  key
 * @param {unknown}                 value
 * @param {Record<string, unknown>} defaults  every known key with its default
 * @param {Record<string, string>}  dialog    engine key → param key (dialogKeys)
 * @param {Record<string, unknown>} current   what the mapping sets for the run's params (applyParams):
 *                                            dialog values and fixed values, which win over a default
 * @returns {{ problem: string | null, without?: unknown }}
 */
function settingProblem(key, value, defaults, dialog, current) {
  if (!(key in defaults)) return { problem: SETTING_UNKNOWN };
  const without = key in current ? current[key] : defaults[key];
  const same = String(value) === String(without);
  if (key in dialog) {
    const label = /** @type {Record<string, string>} */ (PARAM_LABELS)[dialog[key]];   // Cast: dialog values are param keys
    return { problem: same ? `same as the dialog's "${label}" sets — remove` : `overrides the dialog's "${label}" — set it there`, without };
  }
  return { problem: same ? SETTING_DEFAULT : null, without };
}

/**
 * Findings for engineParams.layout (label sizing). labelMaxLineWidth is a dialog option, which wins.
 * @param {Partial<LabelSizing> | undefined} layout
 * @returns {SettingFinding[]}
 */
function checkLabelSizing(layout) {
  return Object.entries(layout || {}).map(([key, value]) =>
    key === "labelMaxLineWidth" ? { key, value, problem: `the dialog's "${PARAM_LABELS.labelMaxLineWidth}" wins — not used, remove` }
    : key in LABEL_SIZING_DEFAULTS && settingTypeFinding(key, value, "number", false)
      || { key, value, ...settingProblem(key, value, LABEL_SIZING_DEFAULTS, {}, {}) });
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

/**
 * Room above a container's contents: its label with the gap below it (LayoutNode.labelHeight); without
 * a label the padding.
 * @param {number} padding
 * @param {number} labelHeight
 * @returns {number}
 */
function containerTop(padding, labelHeight) {
  return labelHeight > 0 ? labelHeight : padding;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    containerTop,
    selfLoopResult,
    byTypeAndName,
    ORDER_COMPARE,
    sortedNodes,
    alignWidthsByLevel,
    applyParams,
    dialogKeys,
    SETTING_UNKNOWN,
    settingProblem,
    settingTypeFinding,
    checkLabelSizing,
    expandNodeSizesForEdgeDensity,
    cubicPoint,
    labelPoint,
    alignColumnsAcrossContainers,
  };
}
