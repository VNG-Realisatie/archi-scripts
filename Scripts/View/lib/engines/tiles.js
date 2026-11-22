/**
 * Tiles engine adapter.
 *
 * Accepts a normalized LayoutGraph and returns a LayoutResult without an external layout engine:
 * the children of every container are tiled in their sorted order, so the order reads left to right
 * and top to bottom. Leaves keep the size the graph gives them; containers take the shape the room
 * asks for.
 *
 * Ordered slicing floorplan (Stockmeyer): a sequence of boxes is cut in two, side by side or one
 * above the other, and the best shapes of every run of neighbours follow by dynamic programming.
 * Each box has a list of shapes (width, height) no other shape beats in both; a container's list
 * comes from its children, so it settles on a shape only when its parent knows the room. The view
 * takes the widest root shape that fits Max width (after Columns across containers), the one
 * closest to the Aspect ratio, or, when both are off, the one closest to portrait (a preference, not a target).
 * Connections are not routed (straight lines), as with Pack.
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading engines/tiles.js");

/** @type {typeof import("./engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { containerTop, selfLoopResult, sortedNodes, alignWidthsByLevel, alignColumnsAcrossContainers } = EngineUtils;
const { DIAGRAM_TYPES, SAME_WIDTH } = require(REPO_ROOT + "View/lib/defs");

/** Width / height the whole view is shaped toward (portrait: the tiles read down). */
const VIEW_RATIO = 0.75;
/** Shapes kept per run of boxes; more only slows the search down. */
const MAX_SHAPES = 32;
/** Shapes placed and measured to find the one closest to an Aspect ratio (the grid can change the ratio). */
const RATIO_CANDIDATES = 8;
/** Shapes kept for the whole view: the choice among them places each one, so it stays modest. */
const VIEW_SHAPES = 96;
/** A shape with more than this times the least area of its run is too wasteful to be worth keeping. */
const MAX_WASTE = 1.5;
// The search over every cut of every run grows with about n⁴ (Node: 48 tiles 0.7 s, 100 tiles 20 s,
// 561 tiles hours). A longer run is cut into consecutive chunks of at most CHUNK_SIZE tiles, each chunk
// tiled as a run, then the chunks tiled as one: 561 tiles in 1 s, 2–3 % less of the area filled.
/** Longest run tiled by the full search. */
const FULL_SEARCH_MAX = 48;
/** Tiles per chunk of a longer run. */
const CHUNK_SIZE = 24;

/**
 * A size a run of boxes can take, with how it is built.
 * Single box: `child` is the index of the box's own shape. Two parts: the run is cut after box `k`
 * (side by side `H` or one above the other `V`); `a` and `b` index the shapes of the two parts.
 * @typedef {{ w: number, h: number, child?: number, k?: number, dir?: "H" | "V", a?: number, b?: number, turns?: number }} Shape
 *   turns: how often the cuts inside switch between side by side and one above the other (turnsOf)
 * @typedef {{ id: string, shapes: Shape[], floorplan?: Floorplan, chunk?: boolean }} Tile  one box of a run: a leaf, a
 *   container, or a chunk of a long run (no node of its own, no padding)
 * @typedef {{ tile: Tile, c0: number, c1: number, r0: number, r1: number }} TableCellPlan  a cell of a table: its tile and the
 *   table columns and table rows it spans (first and last)
 * @typedef {{ w: number, h: number, cols: number[], rows: number[], pick: number[] }} TableShape  a size of a table: the width of
 *   every table column, the height of every table row, and per cell the index of the shape of its tile
 * @typedef {{ cells: TableCellPlan[], columns: number, rows: number, shapes: TableShape[] }} TablePlan
 * @typedef {{ tiles: Tile[], best: Shape[][][], table?: TablePlan }} Floorplan  best[i][j]: the shapes of tiles i … j;
 *   table: the floorplan is a table of the background view (tableFloorplan), the tiles its cells
 */

/**
 * The shapes no other shape beats in both width and height, without the wasteful ones, at most
 * `maxShapes` of them spread evenly over the widths (on a log scale). Shapes wider than `widthCap` go,
 * unless that leaves none: then the narrowest stays.
 * @param {Shape[]} shapes
 * @param {number}  widthCap  0 = no cap
 * @param {number}  [maxShapes]
 * @param {number}  [maxWaste]  Infinity: keep the wasteful shapes too (a box of a table, see tileOf)
 * @returns {Shape[]}
 */
function prune(shapes, widthCap, maxShapes = MAX_SHAPES, maxWaste = MAX_WASTE) {
  // Of shapes the same size the simplest wins (fewest turns): rows of boxes, not a patchwork of the same size.
  const sorted = shapes.slice().sort((p, q) => p.w - q.w || p.h - q.h || (p.turns || 0) - (q.turns || 0));
  /** @type {Shape[]} */
  const front = [];
  for (const s of sorted) if (!front.length || s.h < front[front.length - 1].h - 1e-9) front.push(s);
  let kept = widthCap ? front.filter(s => s.w <= widthCap + 1e-9) : front;
  if (!kept.length) return [front[0]];
  const least = Math.min(...kept.map(s => s.w * s.h));
  kept = kept.filter(s => s.w * s.h <= maxWaste * least);
  if (kept.length <= maxShapes) return kept;
  const first = Math.log(kept[0].w), span = Math.log(kept[kept.length - 1].w) - first;
  /** @type {Set<Shape>} */
  const picked = new Set();
  for (let t = 0; t < maxShapes; t++) {
    const want = first + span * t / (maxShapes - 1);
    let nearest = kept[0];
    for (const s of kept) if (Math.abs(Math.log(s.w) - want) < Math.abs(Math.log(nearest.w) - want)) nearest = s;
    picked.add(nearest);
  }
  return kept.filter(s => picked.has(s));
}

/**
 * The turns a part brings into a cut: its own, and one more when it is cut the other way.
 * @param {Shape}      s
 * @param {"H" | "V"}  dir
 */
function turnsOf(s, dir) {
  return (s.turns || 0) + (s.dir && s.dir !== dir ? 1 : 0);
}

/**
 * The best shapes of every run of tiles, by dynamic programming over the runs; a run longer than
 * FULL_SEARCH_MAX as a run of chunks.
 * @param {Tile[]} tiles
 * @param {number} gap
 * @param {number} widthCap
 * @param {number} [finalShapes]  shapes kept for the whole run (the view: more, so Max width can come close)
 * @param {number} [maxWaste]
 * @param {boolean} [stackOnly]  only one above the other (the boxes of a cell)
 * @returns {Floorplan}
 */
function buildFloorplan(tiles, gap, widthCap, finalShapes = MAX_SHAPES, maxWaste = MAX_WASTE, stackOnly = false) {
  if (tiles.length > FULL_SEARCH_MAX) return buildFloorplan(chunksOf(tiles, gap, widthCap, maxWaste), gap, widthCap, finalShapes, maxWaste);
  const n = tiles.length;
  /** @type {Shape[][][]} */
  const best = Array.from({ length: n }, () => Array.from({ length: n }, () => /** @type {Shape[]} */ ([])));
  for (let i = 0; i < n; i++) best[i][i] = tiles[i].shapes.map((s, child) => ({ w: s.w, h: s.h, child }));
  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len - 1;
      /** @type {Shape[]} */
      const cands = [];
      // Last cut first: of shapes the same size, the one with full parts first and the rest last wins (prune keeps the first).
      for (let k = j - 1; k >= i; k--) {
        const left = best[i][k], right = best[k + 1][j];
        for (let a = 0; a < left.length; a++) for (let b = 0; b < right.length; b++) {
          const p = left[a], q = right[b];
          // One above the other first: of equally simple shapes, rows win, so the order reads left to right and down.
          cands.push({ w: Math.max(p.w, q.w), h: p.h + gap + q.h, k, dir: "V", a, b, turns: turnsOf(p, "V") + turnsOf(q, "V") });
          if (!stackOnly) cands.push({ w: p.w + gap + q.w, h: Math.max(p.h, q.h), k, dir: "H", a, b, turns: turnsOf(p, "H") + turnsOf(q, "H") });
        }
      }
      best[i][j] = prune(cands, widthCap, i === 0 && j === n - 1 ? finalShapes : MAX_SHAPES, maxWaste);
    }
  }
  return { tiles, best };
}

/**
 * The index of the lowest shape of a tile that fits `width`: the widest that does not exceed it, the
 * narrowest when none does.
 * @param {Shape[]} shapes  by width, narrow first
 * @param {number}  width
 */
function _fit(shapes, width) {
  let index = 0;
  for (let i = 1; i < shapes.length; i++) if (shapes[i].w <= width + 1e-9) index = i;
  return index;
}

/**
 * The size of table tracks (columns or rows) `from` … `to` together, with the gaps between them.
 * @param {number[]} sizes
 * @param {number}   from
 * @param {number}   to
 * @param {number}   gap
 */
function _trackSize(sizes, from, to, gap) {
  let size = gap * (to - from);
  for (let i = from; i <= to; i++) size += sizes[i];
  return size;
}

/**
 * Grow the tracks `from` … `to` together by `extra`, each by the same.
 * @param {number[]} sizes  changed
 * @param {number}   from
 * @param {number}   to
 * @param {number}   extra
 */
function _spread(sizes, from, to, extra) {
  for (let i = from; i <= to; i++) sizes[i] += extra / (to - from + 1);
}

/**
 * A table as wide as its narrowest cells allow: a cell over several table columns shares what it
 * lacks equally over them, the cells over the fewest first (as CSS Grid sizes its tracks).
 * @param {TableCellPlan[]} cells
 * @param {number}          columns
 * @param {number}          gap
 * @returns {number[]}  the width of every table column
 */
function _leastColumns(cells, columns, gap) {
  /** @type {number[]} */
  const widths = new Array(columns).fill(0);
  for (const c of cells.slice().sort((p, q) => (p.c1 - p.c0) - (q.c1 - q.c0))) {
    const lack = c.tile.shapes[0].w - _trackSize(widths, c.c0, c.c1, gap);
    if (lack > 0) _spread(widths, c.c0, c.c1, lack);
  }
  return widths;
}

/**
 * The size a table takes at the widths of its table columns: every cell the lowest shape that fits
 * the table columns it spans, every table row as high as its cells need: the cells in the order of
 * their last table row, what a cell lacks goes into its last table row (so the table is as low as
 * its cells allow).
 * @param {TableCellPlan[]} cells
 * @param {number}          rows
 * @param {number[]}        cols  the width of every table column
 * @param {number}          gap
 * @returns {TableShape}
 */
function _tableAt(cells, rows, cols, gap) {
  const pick = cells.map(c => _fit(c.tile.shapes, _trackSize(cols, c.c0, c.c1, gap)));
  /** @type {number[]} */
  const heights = new Array(rows).fill(0);
  for (const i of cells.map((c, k) => k).sort((p, q) => cells[p].r1 - cells[q].r1 || cells[q].r0 - cells[p].r0 || p - q)) {
    const c = cells[i];
    const lack = c.tile.shapes[pick[i]].h - _trackSize(heights, c.r0, c.r1, gap);
    if (lack > 0) heights[c.r1] += lack;
  }
  return { w: _trackSize(cols, 0, cols.length - 1, gap), h: _trackSize(heights, 0, rows - 1, gap), cols: cols.slice(), rows: heights, pick };
}

/**
 * The sizes a table can take, from its narrowest: widen one cell at a time to its next shape, its
 * table columns by the same, and take the widening that costs the least width (`cheapest`: so every
 * width at which a cell changes shape comes by) or that saves the most height per pixel of width
 * (`best`: the least white space). Every step is a size; the steps end when no cell can grow.
 * @param {TableCellPlan[]} cells
 * @param {number}          columns
 * @param {number}          rows
 * @param {number}          gap
 * @param {number}          widthCap  0 = no cap
 * @param {"cheapest" | "best"} choose
 * @returns {TableShape[]}
 */
function _tableShapes(cells, columns, rows, gap, widthCap, choose) {
  let shape = _tableAt(cells, rows, _leastColumns(cells, columns, gap), gap);
  const shapes = [shape];
  while (!(widthCap && shape.w > widthCap)) {
    /** @type {{ next: TableShape, gain: number, widen: number } | null} */
    let best = null;
    cells.forEach((c, i) => {
      const next = c.tile.shapes[shape.pick[i] + 1];
      if (!next) return;
      const cols = shape.cols.slice();
      _spread(cols, c.c0, c.c1, next.w - _trackSize(cols, c.c0, c.c1, gap));
      const grown = _tableAt(cells, rows, cols, gap), widen = grown.w - shape.w;
      if (widen <= 1e-9) return;
      const gain = (shape.h - grown.h) / widen;
      const better = !best || (choose === "cheapest" ? widen < best.widen - 1e-9 || (Math.abs(widen - best.widen) <= 1e-9 && gain > best.gain)
        : gain > best.gain + 1e-12 || (Math.abs(gain - best.gain) <= 1e-12 && widen < best.widen));
      if (better) best = { next: grown, gain, widen };
    });
    if (!best) break;
    shape = /** @type {{ next: TableShape }} */ (best).next;
    shapes.push(shape);
  }
  return shapes;
}

/**
 * A table size stretched to fill a room: the extra width equally over its table columns (every cell
 * takes the lowest shape that fits again, so a table inside a cell is stretched in turn), then the
 * extra height equally over its table rows. The content stays at the top of its cell.
 * @param {TablePlan}  plan
 * @param {TableShape} shape
 * @param {number}     width
 * @param {number}     height
 * @param {number}     gap
 * @returns {TableShape}
 */
function _stretch(plan, shape, width, height, gap) {
  let out = shape;
  const wider = width - shape.w;
  if (wider > 1e-9) out = _tableAt(plan.cells, plan.rows, shape.cols.map(w => w + wider / plan.columns), gap);
  const higher = height - out.h;
  if (higher > 1e-9) out = { ...out, rows: out.rows.map(h => h + higher / plan.rows), h: height };
  return out;
}

/**
 * The shapes of a floorplan: the sizes it can take.
 * @param {Floorplan} floorplan
 * @returns {Shape[] | TableShape[]}
 */
function shapesOf(floorplan) {
  return floorplan.table ? floorplan.table.shapes : floorplan.best[0][floorplan.tiles.length - 1];
}

/**
 * The tiles of boxes that overlap on the background view, one above the other in reading order, as
 * one tile (no node of its own).
 * @param {Tile[]} tiles
 * @param {number} gap
 * @param {number} widthCap
 * @returns {Tile}
 */
function _stackTile(tiles, gap, widthCap) {
  const floorplan = buildFloorplan(tiles, gap, widthCap, MAX_SHAPES, Infinity, true);
  return { id: "", chunk: true, floorplan, shapes: floorplan.best[0][tiles.length - 1].map((s, child) => ({ w: s.w, h: s.h, child })) };
}

/**
 * The floorplan of a container's children in the table of the background view: every child a cell in
 * its table rows and table columns, so only the sizes are searched. Children the table does not hold
 * come last, in a table row below the rest, tiled freely; a child of the table the view does not hold
 * drops out, and a table row or table column left without cells with it.
 * @param {Tile[]}  tiles   in sorted order
 * @param {Table}   table   ids: element ids, or the ids of diagram objects
 * @param {number}  gap
 * @param {number}  widthCap
 * @param {number}  [finalShapes]
 * @returns {Floorplan}
 */
function tableFloorplan(tiles, table, gap, widthCap, finalShapes = MAX_SHAPES) {
  /** @type {Map<string, Tile>} */
  const byElement = new Map(tiles.map(t => [elementOf(t.id), t]));
  /** @type {Set<Tile>} */
  const placed = new Set();
  /** @type {TableCellPlan[]} */
  let cells = [];
  for (const c of table.cells) {
    const stack = /** @type {Tile[]} */ (c.ids.map(id => byElement.get(id)).filter(t => t && !placed.has(t)));   // Cast: the filter drops the missing
    if (!stack.length) continue;
    for (const t of stack) placed.add(t);
    cells.push({ tile: stack.length === 1 ? stack[0] : _stackTile(stack, gap, widthCap),
      c0: c.column, c1: c.column + c.columnSpan - 1, r0: c.row, r1: c.row + c.rowSpan - 1 });
  }
  if (!cells.length) return buildFloorplan(tiles, gap, widthCap, finalShapes);
  /** @param {(c: TableCellPlan) => number} from  @param {(c: TableCellPlan) => number} to  @returns {Map<number, number>} the tracks left, renumbered */
  const squeeze = (from, to) => {
    /** @type {Set<number>} */
    const used = new Set();
    for (const c of cells) for (let k = from(c); k <= to(c); k++) used.add(k);
    return new Map([...used].sort((p, q) => p - q).map((k, i) => [k, i]));
  };
  const columnOf = squeeze(c => c.c0, c => c.c1), rowOf = squeeze(c => c.r0, c => c.r1);
  const at = (/** @type {Map<number, number>} */ map, /** @type {number} */ k) => /** @type {number} */ (map.get(k));
  cells = cells.map(c => ({ tile: c.tile, c0: at(columnOf, c.c0), c1: at(columnOf, c.c1), r0: at(rowOf, c.r0), r1: at(rowOf, c.r1) }));
  const columns = columnOf.size;
  let rows = rowOf.size;
  const rest = tiles.filter(t => !placed.has(t));
  if (rest.length) {
    const floorplan = buildFloorplan(rest, gap, widthCap);
    cells.push({ tile: { id: "", chunk: true, floorplan, shapes: floorplan.best[0][rest.length - 1].map((s, child) => ({ w: s.w, h: s.h, child })) },
      c0: 0, c1: columns - 1, r0: rows, r1: rows });
    rows++;
  }
  const walked = [..._tableShapes(cells, columns, rows, gap, widthCap, "cheapest"), ..._tableShapes(cells, columns, rows, gap, widthCap, "best")];
  const shapes = prune(/** @type {Shape[]} */ (walked), widthCap, finalShapes, Infinity);   // the boxes of a table widen for free
  return { tiles: cells.map(c => c.tile), best: [], table: { cells, columns, rows, shapes: /** @type {TableShape[]} */ (shapes) } };
}

/**
 * The element an occurrence id is of: an extra occurrence is `<element id>_occ_N` (LayoutNode.id).
 * @param {string} nodeId
 */
function elementOf(nodeId) {
  return nodeId.replace(/_occ_\d+$/, "");
}

/**
 * A long run as consecutive chunks of at most CHUNK_SIZE tiles, of near-equal length, in order.
 * @param {Tile[]} tiles
 * @param {number} gap
 * @param {number} widthCap
 * @param {number} [maxWaste]
 * @returns {Tile[]}
 */
function chunksOf(tiles, gap, widthCap, maxWaste = MAX_WASTE) {
  const count = Math.ceil(tiles.length / CHUNK_SIZE);
  /** @type {Tile[]} */
  const chunks = [];
  for (let c = 0; c < count; c++) {
    const part = tiles.slice(Math.floor(c * tiles.length / count), Math.floor((c + 1) * tiles.length / count));
    const floorplan = buildFloorplan(part, gap, widthCap, MAX_SHAPES, maxWaste);
    chunks.push({ id: "", chunk: true, floorplan, shapes: floorplan.best[0][part.length - 1].map((s, child) => ({ w: s.w, h: s.h, child })) });
  }
  return chunks;
}

/**
 * Same width (Per level and type): one width per element type at a nesting type change, as narrow as
 * the boxes of that type there allow: a leaf its own width, a block with contents one column of them
 * and its padding (or its label's minWidth). A wider block widens for its contents.
 * @param {LayoutNode[]}                    leaves      the leaves at a nesting type change
 * @param {LayoutNode[]}                    containers  the blocks with only leaves inside
 * @param {Record<string, LayoutNode[]>}    childrenOf
 * @param {Record<string, number>}          levelWidth  per node: its level width
 * @param {number}                          pad
 * @param {(msg: string) => void}           log
 * @returns {Record<string, number>} per box: its type's width (a container: its least width)
 */
function typeWidths(leaves, containers, childrenOf, levelWidth, pad, log) {
  /** @type {Map<string, number>} */
  const need = new Map();
  const widen = (/** @type {string} */ type, /** @type {number} */ w) => need.set(type, Math.max(need.get(type) || 0, w));
  for (const n of leaves) widen(n.elementType, n.width);
  /** @param {LayoutNode} k */
  const kidWidth = k => leaves.includes(k) ? /** @type {number} */ (need.get(k.elementType)) : levelWidth[k.id] || k.width;
  for (const n of containers) widen(n.elementType, Math.max(n.minWidth, Math.max(...childrenOf[n.id].map(kidWidth)) + 2 * pad));
  /** @type {Record<string, number>} */
  const out = {};
  for (const n of [...leaves, ...containers]) out[n.id] = /** @type {number} */ (need.get(n.elementType));
  for (const type of [...need.keys()].sort()) {
    const count = [...leaves, ...containers].filter(n => n.elementType === type).length;
    log(`Tiles: Same width per level and type — ${type}: ${count} at a nesting type change, ${need.get(type)} px`);
  }
  return out;
}

/**
 * Tiles in the sorted order of their nodes: a leaf at its size, a container with the shapes its
 * children give it (padding added, never narrower than its level).
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const log = (/** @type {string} */ msg) => Log.debug("  " + msg);
  const o = graph.options;
  const parentMap = graph._parentMap || {};
  const gap = o.elementSpacing || 0;
  const pad = o.padding || 0;
  const labelHeight = Object.fromEntries(graph.nodes.map(n => [n.id, n.labelHeight]));
  const topOf = (/** @type {string} */ id) => containerTop(pad, labelHeight[id]);
  const diagramPad = o.diagramPadding || 0;
  const goal = o.maxWidth ? o.maxWidth - 2 * diagramPad : 0;

  // Reading order: containers (sorted when asked) before leaves, leaves sorted inside a container.
  const ordered = sortedNodes(graph.nodes, parentMap, graph.sort);
  /** @type {Record<string, LayoutNode[]>} */
  const childrenOf = {};
  for (const node of ordered) (childrenOf[node.parent || ""] = childrenOf[node.parent || ""] || []).push(node);
  const longRuns = Object.values(childrenOf).filter(kids => kids.length > FULL_SEARCH_MAX);
  if (longRuns.length) {
    log(`Tiles: ${longRuns.length} container(s) or view with more than ${FULL_SEARCH_MAX} elements side by side (largest ${Math.max(...longRuns.map(k => k.length))}) — ` +
        `tiled in chunks of at most ${CHUNK_SIZE}, a little less compact`);
  }

  // Same width (Per level): leaves get the level width, containers a minimum; a leaf beside a
  // container takes the width of the narrowest container of its column (widenToColumns).
  // Per level and type: a box at a nesting type change with no container at a nesting type change
  // inside it is a block (the last nesting type change), unless it is a root's child (a root holds
  // the rest): one width per type, as narrow as its type allows, also for the boxes of that type inside
  // it; to the grid one box with its contents, centred in its column.
  /** @type {Record<string, number>} */
  const levelWidth = {};
  /** @type {Set<string>} */
  const columnWide = new Set();
  /** @type {Set<string>} */
  const typeChange = new Set();   // leaves at a nesting type change
  /** @type {Set<string>} */
  const blocks = new Set();
  /** @type {Record<string, number>} */
  const columnOf = {};   // per placed tile: its column (parts one above the other share one)
  let columns = 0;
  if (graph.sameWidth !== SAME_WIDTH.OFF && Object.keys(parentMap).length) {
    // A diagram object keeps its size: it neither takes nor sets a level width (a legend beside the
    // containers would otherwise widen every level).
    const sized = graph.nodes.filter(n => !(n.elementType in DIAGRAM_TYPES));
    /** @type {Record<string, number>} */
    const widths = {};
    for (const node of sized) widths[node.id] = node.width;
    Object.assign(levelWidth, alignWidthsByLevel(sized, parentMap, widths, 2 * pad, log));
    if (graph.sameWidth === SAME_WIDTH.LEVEL_AND_TYPE) {
      const byId = new Map(sized.map(n => [n.id, n]));
      /** @param {LayoutNode} n */
      const atChange = n => { const parent = n.parent ? byId.get(n.parent) : null; return !!parent && parent.elementType !== n.elementType; };
      /** @type {(id: string) => LayoutNode[]} */
      const below = id => (childrenOf[id] || []).flatMap(k => [k, ...below(k.id)]);
      for (const n of sized) {
        if (!childrenOf[n.id] && atChange(n)) typeChange.add(n.id);
        const underRoot = !byId.get(/** @type {string} */ (n.parent))?.parent;
        if (atChange(n) && !underRoot && !below(n.id).some(d => childrenOf[d.id] && atChange(d))) blocks.add(n.id);
      }
      /** @type {(n: LayoutNode) => boolean} */
      const inBlock = n => { for (let p = n.parent; p; p = byId.get(p)?.parent || null) if (blocks.has(p)) return true; return false; };
      for (const id of [...blocks]) if (inBlock(/** @type {LayoutNode} */ (byId.get(id)))) blocks.delete(id);   // the outermost only
      const width = typeWidths(sized.filter(n => typeChange.has(n.id)),
        sized.filter(n => blocks.has(n.id) && childrenOf[n.id] && childrenOf[n.id].every(k => !childrenOf[k.id])), childrenOf, levelWidth, pad, log);
      // Every element of a block takes its type's width (a container: as its least).
      const ofType = new Map(sized.filter(n => n.id in width).map(n => [n.elementType, width[n.id]]));
      for (const n of sized) if ((blocks.has(n.id) || inBlock(n)) && ofType.has(n.elementType)) levelWidth[n.id] = /** @type {number} */ (ofType.get(n.elementType));
    }
    for (const kids of Object.values(childrenOf)) {
      if (!kids.some(k => childrenOf[k.id])) continue;
      for (const k of kids) if (!childrenOf[k.id] && !(k.elementType in DIAGRAM_TYPES) && !typeChange.has(k.id)) columnWide.add(k.id);
    }
  }

  const tables = graph.tables || {};
  /**
   * The floorplan of a run of children: in the table of the background view when it has one for
   * their container, else searched.
   * @param {string} key  the container's element id, "" for the view
   * @param {Tile[]} tiles
   * @param {number} [finalShapes]
   * @returns {Floorplan}
   */
  const floorplanOf = (key, tiles, finalShapes) => tables[key]
    ? tableFloorplan(tiles, tables[key], gap, goal, finalShapes)
    : buildFloorplan(tiles, gap, goal, finalShapes);
  if (Object.keys(tables).length) log(`Tiles: ${Object.keys(tables).length} table(s) from the background view`);

  /**
   * A node as a tile. A container's shapes come from the floorplan of its children; `child` of a shape
   * is the index of the floorplan shape it is built from.
   * @param {LayoutNode} node
   * @returns {Tile}
   */
  const tileOf = node => {
    const kids = childrenOf[node.id];
    if (!kids) return { id: node.id, shapes: [{ w: levelWidth[node.id] || node.width, h: node.height }] };
    // A box in a table (a cell) may widen for free: its wide shapes stay, the table chooses.
    const waste = tables[node.parent ? elementOf(node.parent) : ""] ? Infinity : MAX_WASTE;
    const floorplan = tables[elementOf(node.id)]
      ? floorplanOf(elementOf(node.id), kids.map(tileOf))
      : buildFloorplan(kids.map(tileOf), gap, goal, MAX_SHAPES, waste);
    const inner = shapesOf(floorplan);
    const shapes = inner.map((s, child) => ({ w: Math.max(s.w + 2 * pad, levelWidth[node.id] || 0, node.minWidth), h: s.h + topOf(node.id) + pad, child }));
    return { id: node.id, shapes: prune(shapes, goal, MAX_SHAPES, waste), floorplan };
  };
  const rootTiles = (childrenOf[""] || []).map(tileOf);
  /**
   * Place tiles i … j of a floorplan in the shape `index`, with its top left corner at (x, y), in
   * `column`: parts one above the other share it, parts side by side each get their own.
   * @param {LayoutResultNode[]} out
   * @param {Floorplan}       floorplan
   * @param {number}      i
   * @param {number}      j
   * @param {number}      index
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column
   */
  const placeRun = (out, floorplan, i, j, index, x, y, parentId, column) => {
    const shape = floorplan.best[i][j][index];
    if (i === j) { placeTile(out, floorplan.tiles[i], /** @type {number} */ (shape.child), x, y, parentId, column); return; }
    const k = /** @type {number} */ (shape.k);
    const left = floorplan.best[i][k][/** @type {number} */ (shape.a)];
    const side = shape.dir === "H";
    placeRun(out, floorplan, i, k, /** @type {number} */ (shape.a), x, y, parentId, side ? ++columns : column);
    placeRun(out, floorplan, k + 1, j, /** @type {number} */ (shape.b), side ? x + left.w + gap : x, side ? y : y + left.h + gap, parentId, side ? ++columns : column);
  };
  /**
   * The tables placed in this layout, for the grid: per table the box they lie in, its table columns,
   * and its cells (a leaf or container with the table columns it spans).
   * @type {PlacedTable[]}
   */
  let tablesPlaced = [];
  const isDiagram = new Set(graph.nodes.filter(n => n.elementType in DIAGRAM_TYPES).map(n => n.id));
  /**
   * Place a floorplan in the shape `index`. A table in a room larger than its shape is stretched to
   * fill it; any other floorplan keeps its places.
   * @param {LayoutResultNode[]} out
   * @param {Floorplan}   floorplan
   * @param {number}      index
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column
   * @param {{ w: number, h: number } | null} [room]  the room inside the container the floorplan is in
   */
  const placeFloorplan = (out, floorplan, index, x, y, parentId, column, room = null) => {
    const table = floorplan.table;
    if (!table) { placeRun(out, floorplan, 0, floorplan.tiles.length - 1, index, x, y, parentId, column); return; }
    const shape = room ? _stretch(table, table.shapes[index], room.w, room.h, gap) : table.shapes[index];
    const columnIds = Array.from({ length: table.columns }, () => ++columns);
    /** @param {number[]} sizes */
    const starts = sizes => { let at = 0; return sizes.map(size => { const start = at; at += size + gap; return start; }); };
    const columnAt = starts(shape.cols), rowAt = starts(shape.rows);
    /** @type {PlacedTable} */
    const placed = { parent: parentId, columns: table.columns, cells: [] };
    table.cells.forEach((c, i) => {
      const width = _trackSize(shape.cols, c.c0, c.c1, gap), height = _trackSize(shape.rows, c.r0, c.r1, gap);
      placeTile(out, c.tile, shape.pick[i], x + columnAt[c.c0], y + rowAt[c.r0], parentId, columnIds[c.c0], { w: width, h: height });
      if (!c.tile.chunk) placed.cells.push({ id: c.tile.id, c0: c.c0, c1: c.c1 });
    });
    tablesPlaced.push(placed);
  };
  /**
   * @param {LayoutResultNode[]} out
   * @param {Tile}        tile
   * @param {number}      index   which of its shapes
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column
   * @param {{ w: number, h: number } | null} [cell]  the cell the tile fills (a diagram object keeps its size)
   */
  const placeTile = (out, tile, index, x, y, parentId, column, cell = null) => {
    const shape = tile.shapes[index];
    if (tile.chunk) {   // its tiles go straight into the run's own container
      placeFloorplan(out, /** @type {Floorplan} */ (tile.floorplan), /** @type {number} */ (shape.child), x, y, parentId, column);   // Cast: every chunk has a floorplan
      return;
    }
    columnOf[tile.id] = column;
    const fills = cell && !isDiagram.has(tile.id);
    const width = fills ? Math.max(shape.w, /** @type {{ w: number }} */ (cell).w) : shape.w;
    const height = fills ? Math.max(shape.h, /** @type {{ h: number }} */ (cell).h) : shape.h;
    out.push({ id: tile.id, x, y, width, height, parentId });
    const top = topOf(tile.id);
    if (tile.floorplan) placeFloorplan(out, tile.floorplan, /** @type {number} */ (shape.child), x + pad, y + top, tile.id, ++columns, { w: width - 2 * pad, h: height - top - pad });
  };

  // Columns across containers: the leaf columns of the tiles on one grid, as after Pack.
  const gridOn = graph.columnsAcrossContainers && Object.keys(parentMap).length > 0;
  /** @type {Record<string, string>} */
  const names = {};
  for (const node of graph.nodes) names[node.id] = node.label || node.id;
  const minWidths = Object.fromEntries(graph.nodes.map(n => [n.id, n.minWidth]));
  /**
   * The view for one shape of the root: placed, then on the column grid when asked (that can make
   * it wider, so Max width is judged on this).
   * @param {Floorplan} floorplan
   * @param {number}  index
   * @param {boolean} quiet  no log
   * @returns {LayoutResultNode[]}
   */
  const build = (floorplan, index, quiet) => {
    /** @type {LayoutResultNode[]} */
    const out = [];
    tablesPlaced = [];
    placeFloorplan(out, floorplan, index, diagramPad, diagramPad, null, ++columns);
    const sharers = columnSharers(out);
    // On the grid every leaf fills its track (a leaf beside a container those of its column); without it, a leaf beside a container takes its column's width.
    // The cells of a table reach the table column borders: the grid knows them.
    if (gridOn) alignColumnsAcrossContainers(out, o, names, quiet ? () => {} : log, sharers, minWidths, blocks, tablesPlaced, isDiagram);
    else widenToColumns(out, sharers);
    return out;
  };
  /**
   * Per leaf, the containers whose tracks it fills on the grid: a leaf beside a container fills those
   * of the containers in its column; any other leaf, also one beside a container whose nearest sibling
   * to its left or right (overlapping in height) is a leaf (a row of leaves), none: its own track.
   * A diagram object and a leaf at a nesting type change (Per level and type) keep their size.
   * @param {LayoutResultNode[]} out
   * @returns {Map<string, string[]>}
   */
  const columnSharers = out => {
    /** @type {Map<string, string[]>} */
    const sharers = new Map();
    /** @param {LayoutResultNode} leaf */
    const inRow = leaf => {
      const row = out.filter(n => n !== leaf && n.parentId === leaf.parentId && !isDiagram.has(n.id) &&
        n.y < leaf.y + leaf.height && leaf.y < n.y + n.height);
      const left = row.filter(n => n.x < leaf.x).sort((a, b) => b.x - a.x)[0];
      const right = row.filter(n => n.x > leaf.x).sort((a, b) => a.x - b.x)[0];
      return [left, right].some(n => n && !childrenOf[n.id]);
    };
    const cellIds = new Set(tablesPlaced.flatMap(t => t.cells.map(c => c.id)));   // a leaf that is a cell fills its cell, not a column
    for (const leaf of out) {
      if (childrenOf[leaf.id] || isDiagram.has(leaf.id) || typeChange.has(leaf.id) || cellIds.has(leaf.id)) continue;
      sharers.set(leaf.id, columnWide.has(leaf.id) && !inRow(leaf)
        ? out.filter(n => childrenOf[n.id] && columnOf[n.id] === columnOf[leaf.id]).map(n => n.id) : []);
    }
    return sharers;
  };
  /**
   * A leaf beside a container takes the x and width of the narrowest container of its column (the
   * grid may have moved and widened them); a leaf no container shares a column with keeps its width.
   * @param {LayoutResultNode[]} out
   * @param {Map<string, string[]>} sharers
   */
  const widenToColumns = (out, sharers) => {
    const byId = new Map(out.map(n => [n.id, n]));
    for (const [id, ids] of sharers) {
      if (!ids.length) continue;
      const leaf = /** @type {LayoutResultNode} */ (byId.get(id));
      const narrowest = ids.map(c => /** @type {LayoutResultNode} */ (byId.get(c))).reduce((p, q) => q.width < p.width ? q : p);
      if (narrowest.width > leaf.width) { leaf.x = narrowest.x; leaf.width = narrowest.width; }
    }
  };
  const viewWidth = (/** @type {LayoutResultNode[]} */ list) => Math.max(0, ...list.map(n => n.x + n.width)) + diagramPad;

  /** @type {LayoutResultNode[]} */
  let nodes = [];
  if (rootTiles.length) {
    const floorplan = floorplanOf("", rootTiles, VIEW_SHAPES);
    const shapes = shapesOf(floorplan);
    let chosen = 0;
    let note = "";
    if (o.maxWidth) {
      // Max width is the width the view takes: the widest shape that still fits once the grid is on.
      const widest = shapes.map((s, i) => i).sort((p, q) => shapes[q].w - shapes[p].w);
      let narrowest = widest[widest.length - 1], least = Infinity, found = false;
      for (const index of widest) {
        const w = viewWidth(build(floorplan, index, true));
        if (w <= o.maxWidth) { chosen = index; found = true; break; }
        if (w < least) { least = w; narrowest = index; }
      }
      if (!found) { chosen = narrowest; note = " — not reachable, narrowest layout"; }
    } else if (o.aspectRatio) {
      // Aspect ratio: the shapes closest to it, placed and measured (the grid can change the ratio); the closest wins.
      const target = o.aspectRatio, miss = (/** @type {number} */ w, /** @type {number} */ h) => Math.abs(Math.log(w / h / target));
      const near = shapes.map((s, i) => i).sort((p, q) => miss(shapes[p].w, shapes[p].h) - miss(shapes[q].w, shapes[q].h)).slice(0, RATIO_CANDIDATES);
      let least = Infinity;
      for (const index of near) {
        const list = build(floorplan, index, true);
        const m = miss(viewWidth(list), Math.max(...list.map(n => n.y + n.height)) + diagramPad);
        if (m < least - 1e-9) { least = m; chosen = index; }
      }
    } else {
      let chosenScore = Infinity;
      shapes.forEach((s, index) => {
        const score = s.w * s.h * (1 + Math.pow(Math.log(s.w / s.h / VIEW_RATIO), 2));
        if (score < chosenScore) { chosen = index; chosenScore = score; }
      });
    }
    nodes = build(floorplan, chosen, false);
    const maxY = Math.max(0, ...nodes.map(n => n.y + n.height));
    log(`Tiles: ${shapes.length} shape(s) for the view, chosen ${Math.round(viewWidth(nodes))}×${Math.round(maxY + diagramPad)} px` +
        (o.maxWidth ? `  (max width ${o.maxWidth} px${note})` : o.aspectRatio ? `  (aspect ratio ${o.aspectRatio} → ${(viewWidth(nodes) / (maxY + diagramPad)).toFixed(2)})` : ""));
  }

  // Connections are not routed: a straight line, or the writer's own loop for a self-loop.
  /** @type {Set<string>} */
  const known = new Set(graph.nodes.map(n => n.id));
  /** @type {LayoutResultEdge[]} */
  const edges = [];
  for (const edge of graph.edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    edges.push(edge.source === edge.target ? selfLoopResult(edge) : {
      id: edge.id, conceptId: edge.conceptId, sourceId: edge.source, targetId: edge.target,
      bendpoints: [], labelX: 0, labelY: 0, isStraight: true,
    });
  }

  return { nodes, edges };
}

/**
 * Settings outside the dialog: Tiles has no engineParams section.
 * @param {MaskedPreset} preset
 * @returns {SettingFinding[]}
 */
function checkEngineParams(preset) {
  return Object.keys(preset.engineParams.Tiles || {}).map(key => ({ key, value: "", problem: EngineUtils.SETTING_UNKNOWN }));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout, checkEngineParams };
}
