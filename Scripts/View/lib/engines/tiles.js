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
console.log("Loading engines/tiles.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
const { CONTAINER_LABEL_CLEARANCE } = Defs;
/** @type {typeof import("./engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { selfLoopResult, sortedNodes, alignWidthsByLevel, alignColumnsAcrossContainers } = EngineUtils;

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

/**
 * A size a run of boxes can take, with how it is built.
 * Single box: `child` is the index of the box's own shape. Two parts: the run is cut after box `k`
 * (side by side `H` or one above the other `V`); `a` and `b` index the shapes of the two parts.
 * @typedef {{ w: number, h: number, child?: number, k?: number, dir?: "H" | "V", a?: number, b?: number }} Shape
 * @typedef {{ id: string, shapes: Shape[], table?: Table }} Tile  one box of a run: a leaf, or a container
 * @typedef {{ tiles: Tile[], best: Shape[][][] }} Table  best[i][j]: the shapes of tiles i … j
 */

/**
 * The shapes no other shape beats in both width and height, without the wasteful ones, at most
 * `maxShapes` of them spread evenly over the widths (on a log scale). Shapes wider than `widthCap` go,
 * unless that leaves none: then the narrowest stays.
 * @param {Shape[]} shapes
 * @param {number}  widthCap  0 = no cap
 * @param {number}  [maxShapes]
 * @returns {Shape[]}
 */
function prune(shapes, widthCap, maxShapes = MAX_SHAPES) {
  const sorted = shapes.slice().sort((p, q) => p.w - q.w || p.h - q.h);
  /** @type {Shape[]} */
  const front = [];
  for (const s of sorted) if (!front.length || s.h < front[front.length - 1].h - 1e-9) front.push(s);
  let kept = widthCap ? front.filter(s => s.w <= widthCap + 1e-9) : front;
  if (!kept.length) return [front[0]];
  const least = Math.min(...kept.map(s => s.w * s.h));
  kept = kept.filter(s => s.w * s.h <= MAX_WASTE * least);
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
 * The best shapes of every run of tiles, by dynamic programming over the runs.
 * @param {Tile[]} tiles
 * @param {number} gap
 * @param {number} widthCap
 * @param {number} [finalShapes]  shapes kept for the whole run (the view: more, so Max width can come close)
 * @returns {Table}
 */
function buildTable(tiles, gap, widthCap, finalShapes = MAX_SHAPES) {
  const n = tiles.length;
  /** @type {Shape[][][]} */
  const best = Array.from({ length: n }, () => Array.from({ length: n }, () => /** @type {Shape[]} */ ([])));
  for (let i = 0; i < n; i++) best[i][i] = tiles[i].shapes.map((s, child) => ({ w: s.w, h: s.h, child }));
  for (let len = 2; len <= n; len++) {
    for (let i = 0; i + len <= n; i++) {
      const j = i + len - 1;
      /** @type {Shape[]} */
      const cands = [];
      for (let k = i; k < j; k++) {
        const left = best[i][k], right = best[k + 1][j];
        for (let a = 0; a < left.length; a++) for (let b = 0; b < right.length; b++) {
          const p = left[a], q = right[b];
          cands.push({ w: p.w + gap + q.w, h: Math.max(p.h, q.h), k, dir: "H", a, b });
          cands.push({ w: Math.max(p.w, q.w), h: p.h + gap + q.h, k, dir: "V", a, b });
        }
      }
      best[i][j] = prune(cands, widthCap, i === 0 && j === n - 1 ? finalShapes : MAX_SHAPES);
    }
  }
  return { tiles, best };
}

/**
 * Tiles in the sorted order of their nodes: a leaf at its size, a container with the shapes its
 * children give it (padding added, never narrower than its level).
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const log = (/** @type {string} */ msg) => console.log("  " + msg);
  const o = graph.options;
  const parentMap = graph._parentMap || {};
  const gap = o.elementSpacing || 0;
  const pad = o.padding || 0;
  const top = pad + CONTAINER_LABEL_CLEARANCE;
  const diagramPad = o.diagramPadding || 0;
  const goal = o.maxWidth ? o.maxWidth - 2 * diagramPad : 0;

  // Reading order: containers (sorted when asked) before leaves, leaves sorted inside a container.
  const ordered = sortedNodes(graph.nodes, parentMap, graph.sort);
  /** @type {Record<string, LayoutNode[]>} */
  const childrenOf = {};
  for (const node of ordered) (childrenOf[node.parent || ""] = childrenOf[node.parent || ""] || []).push(node);

  // Same width per level: leaves get the level width, containers a minimum; a leaf beside a
  // container takes the width of the narrowest container of its column (widenToColumns).
  /** @type {Record<string, number>} */
  const levelWidth = {};
  /** @type {Set<string>} */
  const columnWide = new Set();
  /** @type {Record<string, { x: number, width: number }>} */
  const columnOf = {};
  if (graph.alignWidthSameType && Object.keys(parentMap).length) {
    /** @type {Record<string, number>} */
    const widths = {};
    for (const node of graph.nodes) widths[node.id] = node.width;
    Object.assign(levelWidth, alignWidthsByLevel(graph.nodes, parentMap, widths, 2 * pad, log));
    for (const kids of Object.values(childrenOf)) {
      if (!kids.some(k => childrenOf[k.id])) continue;
      for (const k of kids) if (!childrenOf[k.id]) columnWide.add(k.id);
    }
  }

  /**
   * A node as a tile. A container's shapes come from the table of its children; `child` of a shape
   * is the index of the table shape it is built from.
   * @param {LayoutNode} node
   * @returns {Tile}
   */
  const tileOf = node => {
    const kids = childrenOf[node.id];
    if (!kids) return { id: node.id, shapes: [{ w: levelWidth[node.id] || node.width, h: node.height }] };
    const table = buildTable(kids.map(tileOf), gap, goal);
    const inner = table.best[0][kids.length - 1];
    const shapes = inner.map((s, child) => ({ w: Math.max(s.w + 2 * pad, levelWidth[node.id] || 0), h: s.h + top + pad, child }));
    return { id: node.id, shapes: prune(shapes, goal), table };
  };
  const rootTiles = (childrenOf[""] || []).map(tileOf);
  /**
   * Place tiles i … j of a table in the shape `index`, with its top left corner at (x, y), in a
   * column `column` wide: parts one above the other share it, parts side by side each have their own.
   * @param {LayoutResultNode[]} out
   * @param {Table}       table
   * @param {number}      i
   * @param {number}      j
   * @param {number}      index
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column
   */
  const placeRun = (out, table, i, j, index, x, y, parentId, column) => {
    const shape = table.best[i][j][index];
    if (i === j) { placeTile(out, table.tiles[i], /** @type {number} */ (shape.child), x, y, parentId, column); return; }
    const k = /** @type {number} */ (shape.k);
    const left = table.best[i][k][/** @type {number} */ (shape.a)], right = table.best[k + 1][j][/** @type {number} */ (shape.b)];
    const side = shape.dir === "H";
    placeRun(out, table, i, k, /** @type {number} */ (shape.a), x, y, parentId, side ? left.w : column);
    placeRun(out, table, k + 1, j, /** @type {number} */ (shape.b), side ? x + left.w + gap : x, side ? y : y + left.h + gap, parentId, side ? right.w : column);
  };
  /**
   * @param {LayoutResultNode[]} out
   * @param {Tile}        tile
   * @param {number}      index   which of its shapes
   * @param {number}      x
   * @param {number}      y
   * @param {string|null} parentId
   * @param {number}      column  the width of its column
   */
  const placeTile = (out, tile, index, x, y, parentId, column) => {
    const shape = tile.shapes[index];
    if (columnWide.has(tile.id)) columnOf[tile.id] = { x, width: column };
    out.push({ id: tile.id, x, y, width: shape.w, height: shape.h, parentId });
    if (tile.table) placeRun(out, tile.table, 0, tile.table.tiles.length - 1, /** @type {number} */ (shape.child), x + pad, y + top, tile.id, shape.w - 2 * pad);
  };

  // Columns across containers: the leaf columns of the tiles on one grid, as after Pack.
  const gridOn = graph.columnsAcrossContainers && Object.keys(parentMap).length > 0;
  /** @type {Record<string, string>} */
  const names = {};
  for (const node of graph.nodes) names[node.id] = node.label || node.id;
  /**
   * The view for one shape of the root: placed, then on the column grid when asked (that can make
   * it wider, so Max width is judged on this).
   * @param {Table}   table
   * @param {number}  index
   * @param {boolean} quiet  no log
   * @returns {LayoutResultNode[]}
   */
  const build = (table, index, quiet) => {
    /** @type {LayoutResultNode[]} */
    const out = [];
    placeRun(out, table, 0, rootTiles.length - 1, index, diagramPad, diagramPad, null, table.best[0][rootTiles.length - 1][index].w);
    const sharers = columnSharers(out);
    if (gridOn) alignColumnsAcrossContainers(out, o, names, quiet ? () => {} : log);
    widenToColumns(out, sharers);
    return out;
  };
  /**
   * Per leaf beside a container: the sibling containers in its column, as placed (before the grid).
   * @param {LayoutResultNode[]} out
   * @returns {Map<string, string[]>}
   */
  const columnSharers = out => {
    /** @type {Map<string, string[]>} */
    const sharers = new Map();
    for (const leaf of out) {
      const col = columnOf[leaf.id];
      if (!col) continue;
      sharers.set(leaf.id, out.filter(n => n.parentId === leaf.parentId && childrenOf[n.id] &&
        n.x < col.x + col.width && col.x < n.x + n.width).map(n => n.id));
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
    const table = buildTable(rootTiles, gap, goal, VIEW_SHAPES);
    const shapes = table.best[0][rootTiles.length - 1];
    let chosen = 0;
    let note = "";
    if (o.maxWidth) {
      // Max width is the width the view takes: the widest shape that still fits once the grid is on.
      const widest = shapes.map((s, i) => i).sort((p, q) => shapes[q].w - shapes[p].w);
      let narrowest = widest[widest.length - 1], least = Infinity, found = false;
      for (const index of widest) {
        const w = viewWidth(build(table, index, true));
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
        const list = build(table, index, true);
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
    nodes = build(table, chosen, false);
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

  const maxX = Math.max(0, ...nodes.map(n => n.x + n.width));
  const maxY = Math.max(0, ...nodes.map(n => n.y + n.height));
  return { nodes, edges, viewWidth: Math.ceil(maxX + diagramPad) + 20, viewHeight: Math.ceil(maxY + diagramPad) + 20 };
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
