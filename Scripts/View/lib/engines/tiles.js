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
 * @typedef {{ tiles: Tile[], best: Shape[][][], tabled?: boolean }} Floorplan  best[i][j]: the shapes of tiles i … j;
 *   tabled: in the table of the background view (tableFloorplan)
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
 * @returns {Floorplan}
 */
function buildFloorplan(tiles, gap, widthCap, finalShapes = MAX_SHAPES, maxWaste = MAX_WASTE) {
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
          cands.push({ w: p.w + gap + q.w, h: Math.max(p.h, q.h), k, dir: "H", a, b, turns: turnsOf(p, "H") + turnsOf(q, "H") });
        }
      }
      best[i][j] = prune(cands, widthCap, i === 0 && j === n - 1 ? finalShapes : MAX_SHAPES, maxWaste);
    }
  }
  return { tiles, best };
}

/**
 * The floorplan of a container's children in the table of the background view: parts side by side
 * or one above the other as the table cuts them, so only the sizes are searched. Children the
 * table does not hold come last, below the rest, tiled freely; a child of the table the view does
 * not hold drops out, and so does a part left empty. `tabled` marks the floorplan: placeRun widens the
 * containers of a part one above the other to its width, so they read as bands.
 * @param {Tile[]}      tiles        in sorted order
 * @param {Table} table  ids: element ids, or the ids of diagram objects
 * @param {number}      gap
 * @param {number}      widthCap
 * @param {number}      [finalShapes]
 * @returns {Floorplan}
 */
function tableFloorplan(tiles, table, gap, widthCap, finalShapes = MAX_SHAPES) {
  /** @type {Map<string, Tile>} */
  const byElement = new Map(tiles.map(t => [elementOf(t.id), t]));
  /** @type {Tile[]} */
  const ordered = [];
  /**
   * The table with the tiles in it: a tile's index in `ordered`, or the parts that hold any.
   * @typedef {number | { cut: "H" | "V", parts: Placed[] }} Placed
   * @param {Table} a
   * @returns {Placed | null}
   */
  const place = a => {
    if (typeof a === "string") {
      const tile = byElement.get(a);
      return tile ? ordered.push(tile) - 1 : null;
    }
    const parts = /** @type {Placed[]} */ (a.parts.map(place).filter(p => p !== null));
    return !parts.length ? null : parts.length === 1 ? parts[0] : { cut: a.cut, parts };
  };
  let root = place(table);
  if (root === null) return buildFloorplan(tiles, gap, widthCap, finalShapes);
  const placed = new Set(ordered);
  const rest = tiles.filter(t => !placed.has(t));
  if (rest.length) {
    const floorplan = buildFloorplan(rest, gap, widthCap);
    const chunk = ordered.push({ id: "", chunk: true, floorplan, shapes: floorplan.best[0][rest.length - 1].map((s, child) => ({ w: s.w, h: s.h, child })) }) - 1;
    root = { cut: "V", parts: [root, chunk] };
  }
  const n = ordered.length;
  /** @type {Shape[][][]} */
  const best = Array.from({ length: n }, () => Array.from({ length: n }, () => /** @type {Shape[]} */ ([])));
  for (let i = 0; i < n; i++) best[i][i] = ordered[i].shapes.map((s, child) => ({ w: s.w, h: s.h, child }));
  /**
   * The shapes of a part, from the shapes of its own parts cut in its direction.
   * @param {Placed}  p
   * @param {number}  keep
   * @returns {number[]}  the run i … j it covers
   */
  const join = (p, keep) => {
    if (typeof p === "number") return [p, p];
    const runs = p.parts.map(q => join(q, MAX_SHAPES));
    const j = runs[runs.length - 1][1];
    for (let t = runs.length - 2; t >= 0; t--) {
      const [i, k] = runs[t];
      const left = best[i][k], right = best[k + 1][j];
      /** @type {Shape[]} */
      const cands = [];
      for (let a = 0; a < left.length; a++) for (let b = 0; b < right.length; b++) {
        const P = left[a], Q = right[b];
        cands.push(p.cut === "H" ? { w: P.w + gap + Q.w, h: Math.max(P.h, Q.h), k, dir: "H", a, b } : { w: Math.max(P.w, Q.w), h: P.h + gap + Q.h, k, dir: "V", a, b });
      }
      best[i][j] = prune(cands, widthCap, t === 0 ? keep : MAX_SHAPES, Infinity);   // the boxes of a table widen for free
    }
    return [runs[0][0], j];
  };
  join(root, finalShapes);
  return { tiles: ordered, best, tabled: true };
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
    // A box of a table (a band) may widen for free: its wide shapes stay, its container chooses.
    const waste = tables[node.parent ? elementOf(node.parent) : ""] ? Infinity : MAX_WASTE;
    const floorplan = tables[elementOf(node.id)]
      ? floorplanOf(elementOf(node.id), kids.map(tileOf))
      : buildFloorplan(kids.map(tileOf), gap, goal, MAX_SHAPES, waste);
    const inner = floorplan.best[0][floorplan.tiles.length - 1];
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
   * @param {Band | null} [band]  the boxes of a part one above the other in a table, collected here
   */
  const placeRun = (out, floorplan, i, j, index, x, y, parentId, column, band = null) => {
    const shape = floorplan.best[i][j][index];
    if (i === j) { placeTile(out, floorplan.tiles[i], /** @type {number} */ (shape.child), x, y, parentId, column, band); return; }
    const k = /** @type {number} */ (shape.k);
    const left = floorplan.best[i][k][/** @type {number} */ (shape.a)];
    const side = shape.dir === "H";
    // In a table, the boxes one above the other become one band (fillBands); beside others it fills only its own part.
    const part = side || !floorplan.tabled ? null : band || _newBand(false);
    placeRun(out, floorplan, i, k, /** @type {number} */ (shape.a), x, y, parentId, side ? ++columns : column, part);
    placeRun(out, floorplan, k + 1, j, /** @type {number} */ (shape.b), side ? x + left.w + gap : x, side ? y : y + left.h + gap, parentId, side ? ++columns : column, part);
  };
  /** @typedef {{ ids: string[], full: boolean }} Band  full: nothing beside it in its container, so it fills the container's width */
  /** @type {Band[]} */
  let bands = [];
  const _newBand = (/** @type {boolean} */ full) => { const b = { ids: /** @type {string[]} */ ([]), full }; bands.push(b); return b; };
  const isDiagram = new Set(graph.nodes.filter(n => n.elementType in DIAGRAM_TYPES).map(n => n.id));
  /**
   * @param {LayoutResultNode[]} out
   * @param {Tile}        tile
   * @param {number}      index   which of its shapes
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column
   * @param {Band | null} [band]  a band of a table this tile is in; a diagram object keeps its size
   */
  const placeTile = (out, tile, index, x, y, parentId, column, band = null) => {
    const shape = tile.shapes[index];
    if (tile.chunk) {   // its tiles go straight into the run's own container
      const floorplan = /** @type {Floorplan} */ (tile.floorplan);   // Cast: every chunk has a floorplan
      placeRun(out, floorplan, 0, floorplan.tiles.length - 1, /** @type {number} */ (shape.child), x, y, parentId, column);
      return;
    }
    columnOf[tile.id] = column;
    if (band && !isDiagram.has(tile.id)) band.ids.push(tile.id);
    out.push({ id: tile.id, x, y, width: shape.w, height: shape.h, parentId });
    if (tile.floorplan) placeRun(out, tile.floorplan, 0, tile.floorplan.tiles.length - 1, /** @type {number} */ (shape.child), x + pad, y + topOf(tile.id), tile.id, ++columns,
      tile.floorplan.tabled ? _newBand(true) : null);
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
   * @param {Floorplan}   floorplan
   * @param {number}  index
   * @param {boolean} quiet  no log
   * @returns {LayoutResultNode[]}
   */
  const build = (floorplan, index, quiet) => {
    /** @type {LayoutResultNode[]} */
    const out = [];
    bands = [];
    placeRun(out, floorplan, 0, floorplan.tiles.length - 1, index, diagramPad, diagramPad, null, ++columns, floorplan.tabled ? _newBand(true) : null);
    const sharers = columnSharers(out);
    // On the grid every leaf fills its track (a leaf beside a container those of its column); without it, a leaf beside a container takes its column's width.
    // A band with nothing beside it is drawn to its container's edge (fillBands): the grid knows it beforehand.
    const stretch = new Set(bands.filter(b => b.full).flatMap(b => b.ids));
    if (gridOn) alignColumnsAcrossContainers(out, o, names, quiet ? () => {} : log, sharers, minWidths, blocks, stretch);
    else widenToColumns(out, sharers);
    fillBands(out);
    return out;
  };
  /**
   * The elements of a band of a table reach as far right as the widest of them, and with
   * nothing beside them to the inside of their container, once the grid has placed them: a band of
   * layers reads as one, also a layer with nothing in it. Outer bands first, so an inner band
   * fills its container as widened.
   * @param {LayoutResultNode[]} out
   */
  const fillBands = out => {
    const byId = new Map(out.map(n => [n.id, n]));
    for (const band of bands) {
      if (!band.ids.length) continue;
      const members = band.ids.map(id => /** @type {LayoutResultNode} */ (byId.get(id)));
      const parent = members[0].parentId ? byId.get(members[0].parentId) : null;
      let right = Math.max(...members.map(n => n.x + n.width));
      if (band.full && parent) right = Math.max(right, parent.x + parent.width - pad);
      for (const n of members) n.width = right - n.x;
    }
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
    for (const leaf of out) {
      if (childrenOf[leaf.id] || isDiagram.has(leaf.id) || typeChange.has(leaf.id)) continue;
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
    const shapes = floorplan.best[0][floorplan.tiles.length - 1];
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
