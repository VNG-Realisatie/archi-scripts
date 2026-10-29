/**
 * Shared utilities for layout engine adapters.
 * 
 * These functions operate on the LayoutGraph data structure (engine-agnostic)
 * and are used by elk.js, dagre.js and graphviz.js (the column snap and the width alignment by elk.js only).
 */
console.log("Loading engines/engine-utils.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

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

// Algorithm start (defs ALGORITHM_START) → comparator; Selection has none: the order the elements came in.
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
 * (Algorithm start, generate_view.js).
 *
 * @param {LayoutNode[]}            nodes           LayoutGraph nodes
 * @param {Record<string, string>} parentMap       { childId: parentId }
 * @param {string}                 [sortMode]      SORT_MODE value
 * @returns {LayoutNode[]}                         new sorted array
 */
function sortedNodes(nodes, parentMap, sortMode) {
  const childSet = new Set(Object.values(parentMap));
  if (!childSet.size) return nodes.slice();   // no containers: nothing to sort, Algorithm start orders the elements

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
 * and the frames are concentric — a box at level L is as wide as a single-column container of
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

// ── Center-snap column alignment to a global grid ──────────────────────────────

/** Most passes of placing the grid and widening the gaps that collide. */
const MAX_WIDEN_PASSES = 80;

/**
 * Align leaf columns top-to-bottom across the view as a **global variable-width table**.
 * Mutates absolute x of resultNodes in place and re-wraps containers around their moved
 * children; **leaves are never resized** (position-only — see [No post-layout scaling]).
 *
 * Every leaf column is placed on one shared set of vertical bands so columns line up across
 * the whole view; each column is as wide as its widest leaf. Gaps start at the element
 * distance and widen **only where siblings actually collide**, by exactly the overlap, so a
 * boundary is as narrow as the rows that cross it allow (a deeply nested view gets no wider gaps
 * than a flat one unless its containers need them).
 *
 * Algorithm:
 *   1. Detect columns: sort leaves by centre, split on a >½-leaf gap (consecutive compare).
 *   2. Column width = widest member leaf.
 *   3. Every gap starts at the element distance.
 *   4. Iterate: place leaves on the column grid + re-wrap containers; find adjacent siblings
 *      (containers and leaves) that overlap; widen each offending boundary by the overlap;
 *      repeat until nothing overlaps (or MAX_WIDEN_PASSES).
 *
 * @param {LayoutResultNode[]}     resultNodes  flattened nodes { id, x, y, width, height, parentId }
 * @param {EffectiveParams}        options      graph.options (spacing, padding)
 * @param {Record<string, string>} nameById     { id: displayName }
 * @param {(msg: string) => void}  log          logger
 */
function alignColumnsAcrossContainers(resultNodes, options, nameById, log) {
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

  // 1. Detect columns (consecutive-centre compare; split on >½-leaf gap).
  const sorted = leaves.slice().sort((a, b) => centerOf(a) - centerOf(b));
  /** @type {{ members: LayoutResultNode[], w: number }[]} */
  const cols = [];
  /** @type {LayoutResultNode | null} */
  let prev = null;
  for (const lf of sorted) {
    const thr = prev ? Math.min(lf.width || 0, prev.width || 0) / 2 : 0;
    if (prev && centerOf(lf) - centerOf(prev) <= thr + 1e-6) {
      const c = cols[cols.length - 1]; c.members.push(lf); c.w = Math.max(c.w, lf.width || 0);
    } else {
      cols.push({ members: [lf], w: lf.width || 0 });
    }
    prev = lf;
  }
  if (cols.length < 2) { log("[columns] 1 column — nothing to align"); return; }
  /** @type {Record<string, number>} */
  const colOf = {};
  cols.forEach((c, i) => c.members.forEach(m => { colOf[m.id] = i; }));

  // 3. Every gap starts at the element distance; the loop below widens the boundaries that collide.
  const yOver = (/** @type {LayoutResultNode} */ a, /** @type {LayoutResultNode} */ b) => a.y < b.y + (b.height || 0) && b.y < a.y + (a.height || 0);
  /** @type {number[]} */
  const gap = new Array(cols.length - 1).fill(spacing);

  const origin = Math.min(...cols[0].members.map(m => m.x));
  const nm = (/** @type {string} */ id) => nameById[id] || id;
  const ROOT = "__root__";
  const parents = [...new Set(resultNodes.map(n => (n.parentId == null ? ROOT : n.parentId)))];
  const depthOf = (/** @type {string} */ id) => { let d = 0, p = byId[id] ? byId[id].parentId : null; while (p != null) { d++; p = byId[p] ? byId[p].parentId : null; } return d; };
  const containersByDepth = [...containerIds].sort((a, b) => depthOf(b) - depthOf(a));
  // First and last leaf column of every box (a container: of its subtree). Widening the boundary after
  // the last column of the left box only separates it from a box that starts in a later column.
  /** @type {Record<string, { lo: number, hi: number }>} */
  const colRange = {};
  for (const lf of leaves) colRange[lf.id] = { lo: colOf[lf.id], hi: colOf[lf.id] };
  for (const cid of containersByDepth) {
    const kids = childrenByParent[cid] || [];
    colRange[cid] = { lo: Math.min(...kids.map(k => colRange[k.id].lo)), hi: Math.max(...kids.map(k => colRange[k.id].hi)) };
  }

  // Position every leaf on the column grid defined by `gap`, then re-wrap containers.
  function applyGrid() {
    const colCenter = [origin + cols[0].w / 2];
    let left = origin;
    for (let k = 1; k < cols.length; k++) { left += cols[k - 1].w + gap[k - 1]; colCenter.push(left + cols[k].w / 2); }
    for (const lf of leaves) lf.x += colCenter[colOf[lf.id]] - centerOf(lf);   // idempotent (absolute target)
    for (const cid of containersByDepth) {
      const kids = childrenByParent[cid] || []; if (!kids.length) continue;
      byId[cid].x = Math.min(...kids.map(k => k.x)) - pad;
      byId[cid].width = (Math.max(...kids.map(k => rightOf(k))) + pad) - byId[cid].x;
    }
  }
  // Find adjacent siblings (containers and leaves) that overlap; return { boundaryIndex: maxNeededWiden }.
  function findOverlaps() {
    /** @type {Record<string, number>} */
    const widen = {};
    /** @type {string[]} */
    const list = [];
    for (const pid of parents) {
      const sibs = (pid === ROOT ? resultNodes.filter(n => n.parentId == null) : (childrenByParent[pid] || []))
                     .sort((a, b) => a.x - b.x);
      for (let i = 1; i < sibs.length; i++) {
        let nearRight = -Infinity, nb = null;
        for (let j = 0; j < i; j++) if (yOver(sibs[i], sibs[j]) && rightOf(sibs[j]) > nearRight) { nearRight = rightOf(sibs[j]); nb = sibs[j]; }
        if (!nb) continue;
        const g = sibs[i].x - nearRight;
        if (g < spacing - 1e-6) {
          const b = colRange[nb.id].hi;                 // widen the boundary at the left box's right edge
          const fixable = b < gap.length && colRange[sibs[i].id].lo > b;
          if (fixable) widen[b] = Math.max(widen[b] || 0, spacing - g);
          list.push(`    overlap in "${pid === ROOT ? "(root)" : nm(pid)}": "${nm(nb.id)}" ↔ "${nm(sibs[i].id)}" gap=${Math.round(g)}px` +
                    (fixable ? ` → widen gap ${b}` : " (share a column: a wider gap does not separate them)"));
        }
      }
    }
    return { widen, list };
  }

  // 4. Iterate: lay out tight, find collisions, widen exactly those boundaries, repeat.
  let iters = 0;
  /** @type {string[]} */
  let lastList = [];
  for (; iters < MAX_WIDEN_PASSES; iters++) {
    applyGrid();
    const { widen, list } = findOverlaps();
    lastList = list.filter(l => !l.includes("→ widen gap"));   // what a wider gap does not fix
    const keys = Object.keys(widen);
    if (!keys.length) break;
    for (const k of keys) gap[+k] += widen[k];
  }

  log(`[columns] applied — ${cols.length} columns, widths [${cols.map(c => c.w).join(", ")}]; ` +
      `${iters} widen-iteration(s); gaps [${gap.map(Math.round).join(", ")}]`);
  if (lastList.length) { log(`[columns] unresolved overlaps after ${iters} iters:`); for (const l of lastList.slice(0, 20)) log(l); }
  else log(`[columns] overlap scan: clean (all adjacent siblings ≥ ${spacing}px)`);
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
  return Object.entries(layout || {}).map(([key, value]) => ({ key, value,
    ...(key === "labelMaxLineWidth" ? { problem: `the dialog's "${PARAM_LABELS.labelMaxLineWidth}" wins — not used, remove` }
      : settingProblem(key, value, LABEL_SIZING_DEFAULTS, {}, {})) }));
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

    const rawPx = textWidth(label, charW);
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
        w = Math.max(textWidth(line1, charW), textWidth(line2, charW)) + 2 * hPad;
        h = 2 * lineH + vPad;
      }
    }
    node.width = Math.max(minW, Math.ceil(w));
    node.height = Math.max(minH, Math.ceil(h));
  }
}

/**
 * Estimated pixel width of a string: uppercase letters count double charW (they are wider),
 * every other character counts single. Uppercase detection covers accented letters too.
 * @param {string} str
 * @param {number} charW
 */
function textWidth(str, charW) {
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
    ORDER_COMPARE,
    sortedNodes,
    alignWidthsByLevel,
    applyParams,
    dialogKeys,
    SETTING_UNKNOWN,
    settingProblem,
    checkLabelSizing,
    expandNodeSizesForEdgeDensity,
    sizeLabelBasedNodes,
    textWidth,
    cubicPoint,
    labelPoint,
    alignColumnsAcrossContainers,
  };
}
