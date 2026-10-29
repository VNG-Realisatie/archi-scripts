/**
 * ELK engine adapter.
 *
 * Accepts a normalized LayoutGraph, runs ELK layout, returns a LayoutResult.
 * All Archi view creation is handled by generate_view.js — this module only computes positions.
 *
 * Docs: https://eclipse.dev/elk/reference/
 */
console.log("Loading engines/elk.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
const { ALGORITHMS, SPLINE_SAMPLE_POINTS, CONTAINER_LABEL_CLEARANCE, CONNECTION_END_CLEARANCE } = Defs;
/** @type {typeof import("./engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { selfLoopResult, sortedNodes, alignWidthsByLevel, applyParams, dialogKeys, settingProblem, SETTING_UNKNOWN, cubicPoint, labelPoint, alignColumnsAcrossContainers } = EngineUtils;

/**
 * ELK graph objects as this adapter builds them, fresh for every ELK run. ELK ignores the `_`
 * fields and returns them unchanged on the laid-out graph.
 * @typedef {object} ElkWorkNode
 * @property {string}           id
 * @property {number}           [width]      absent on containers: ELK sizes them
 * @property {number}           [height]
 * @property {number}           [x]          set by ELK
 * @property {number}           [y]
 * @property {ElkWorkNode[]}    children
 * @property {ElkWorkEdge[]}    edges
 * @property {ElkPort[]}        [ports]
 * @property {ElkLayoutOptions} [layoutOptions]
 *
 * @typedef {object} ElkWorkEdge
 * @property {string}           id
 * @property {string | null}    _archiRelId  model relation id (null for a spanning-tree helper edge)
 * @property {string[]}         sources
 * @property {string[]}         targets
 * @property {boolean}          [_treeReversed]  spanning-tree edge turned away from the root (Radial); turned back in the result
 * @property {Record<string, unknown>} [properties]
 * @property {ElkWorkLabel[]}   [labels]
 * @property {ElkEdgeSection[]} [sections]   set by ELK
 *
 * @typedef {ElkLabel & { id: string }} ElkWorkLabel
 * @typedef {{ id: string, layoutOptions: ElkLayoutOptions, children: ElkWorkNode[], edges: ElkWorkEdge[], width?: number, height?: number }} ElkRoot
 * @typedef {{ origSrcId: string, origTgtId: string, segOf?: string, segIdx?: number, segCount?: number }} ElkEdgeMeta
 * @typedef {{ startPoint: Point, endPoint: Point, bendPoints: Point[] }} AbsSection
 * @typedef {{ edge: ElkWorkEdge, sections: AbsSection[], label: Point | null, segCount?: number }} CollectedEdge
 * @typedef {(msg: string) => void} Logger
 *
 * Box handed to ELK: a leaf's size; for a container its minimum width (0 = none; ELK sizes containers)
 * and, for a root-level container in Tree, its elk.padding (layer distance).
 * @typedef {{ width: number, height: number, padding?: string }} ElkBox
 *
 * ELK options of one layout run, assembled once (_engineOptions).
 * @typedef {object} ElkOptions
 * @property {ElkLayoutOptions} root       the root graph
 * @property {ElkLayoutOptions} container  every container
 * @property {ElkLayoutOptions} leaf       every leaf (node-level options, e.g. self-loop placement)
 * @property {boolean}          ports      uniform port spacing on leaves (_elkNode)
 * @property {string}           algorithmId
 * @property {string}           containerAlgorithmId
 * @property {string}           hierarchyMode
 * @property {"include" | "ports" | "lift"} edgeMode  see _placeEdges
 * @property {boolean}          reserveLabels  Reserve label space: a label box on every connection (_labelBox)
 * @property {boolean}          splines
 * @property {boolean}          vertical   flow Up / Down
 */

// ── Engine-specific parameter mapping ────────────────────────────────────────
// Maps GUI param names to ELK layout option keys/values, per algorithm, in two scopes:
//   ROOT_MAPPING:      the ELK root graph
//   CONTAINER_MAPPING: each container node (by the container algorithm)
//
// Parameters handled outside the mappings:
//   maxWidth / aspectRatio → view-size calibration in layout() (re-runs ELK with a searched
//                           elk.aspectRatio; see _fitViewSize)
//   nestingConditions     → graph structure (parentMap)
//   sort  → node sort order via engine-utils.sortedNodes
//   alignWidthSameType    → per-level target widths from the input widths
//                           (engine-utils.alignWidthsByLevel): leaves get exact width,
//                           containers a MINIMUM_SIZE floor (_boxSizes)

/** @type {Record<string, string>} */
const ELK_DIRECTION = {
  "Right": "RIGHT",
  "Left":  "LEFT",
  "Down":  "DOWN",
  "Up":    "UP",
};

const MIN_NODE_SIZE = 8;  // fallback for degenerate ELK output (zero/undefined dimension) — see _collectNodePositions

// Settings outside the dialog (engineParams.ELK): the adapter's own defaults. Merged first in every
// scope: the GUI mapping and engineParams.ELK override these. Any other ELK option id can be set too.
/** @type {Record<string, { default: string | number, effect: string }>} */
const ENGINE_PARAMS = {
  "elk.layered.cycleBreaking.strategy":           { default: "GREEDY",    effect: "Layered: how cycles are broken before layering" },
  "elk.layered.edgeRouting.selfLoopDistribution": { default: "EQUALLY",   effect: "Layered: self-loops spread over the element's sides" },
  "elk.layered.edgeRouting.selfLoopOrdering":     { default: "SEQUENCED", effect: "Layered: order of the self-loops on one side" },
  // INTERACTIVE keeps the existing order (needs prior positions). NB: an invalid value is silently ignored by ELK
  "elk.layered.crossingMinimization.strategy":    { default: "LAYER_SWEEP", effect: "Layered: crossing reduction by layer-by-layer sweeps" },
  // Greedy switch post-pass (swaps adjacent nodes while crossings drop) is by default only active
  // for graphs < 40 nodes; 0 = always active.
  // Measured on 60–80 node test graphs: ~15% fewer crossings, ~4× layout time (still ~1 s).
  "elk.layered.crossingMinimization.greedySwitch.activationThreshold":
                                                  { default: 0,  effect: "Layered: element swaps that remove crossings, from this element count up (ELK: 40)" },
  // 25: on 7 test views (Crossing containers) as few or fewer crossings than 50; 15 or lower
  // leaves extra crossings. Layout time in Archi (interpreted GraalJS) ~45% less than 50.
  "elk.layered.thoroughness":                     { default: 25, effect: "Layered: random restarts of the crossing reduction (ELK: 7)" },
  "elk.layered.considerModelOrder.strategy":      { default: "NONE", effect: "Layered: the input order is not kept" },
  "elk.layered.feedbackEdges":                    { default: "true", effect: "Layered: connections against the flow leave and enter on the flow sides" },
  "elk.spacing.nodeSelfLoop":                     { default: 40, effect: "Distance between an element and its self-loops (px)" },
};
const DEFAULT_ELK_PARAMS = Object.fromEntries(Object.entries(ENGINE_PARAMS).map(([k, s]) => [k, s.default]));

// Shared aspect-ratio mapping reused wherever both root and container scopes carry the same fn.
const _AR = (/** @type {number} */ v) => v > 0 ? { "elk.aspectRatio": String(v) } : {};
// Pack: rectpacking's width approximation loops forever on mixed box sizes at high ratios
// (elkjs 0.11.1 and 0.12.0, both optimization goals; e.g. one 3000–3660 px wide box among
// twenty 220 px boxes hangs from ratio 4, never at ≤ 3 in any probe) — a hang that freezes
// Archi. The ratio is capped at PACK_ASPECT_RATIO_MAX (= the widest GUI option, 3:1).
// ASPECT_RATIO_DRIVEN: row width chosen to match the ratio (default MAX_SCALE_DRIVEN
// maximises scale in a viewport of that ratio).
const PACK_ASPECT_RATIO_MAX = 3;
const _AR_PACK = (/** @type {number} */ v) => v > 0 ? {
  "elk.aspectRatio": String(Math.min(v, PACK_ASPECT_RATIO_MAX)),
  "elk.rectpacking.widthApproximation.optimizationGoal": "ASPECT_RATIO_DRIVEN",
} : {};

// Shared routing fn used in both root and container scopes for Layered.
// CONSERVATIVE spline mode inlined here — no separate post-mapping special case needed.
const _LAYERED_ROUTING = (/** @type {string} */ v) => ({
  "elk.edgeRouting": v === "Orthogonal" ? "ORTHOGONAL" : v === "Splines" ? "SPLINES" : "POLYLINE",
  ...(v === "Splines" ? { "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE" } : {}),
});

// Shared param-mapping functions — referenced in multiple algorithm root/container scopes.
const _DIRECTION     = (/** @type {string} */ v) => ({ "elk.direction": ELK_DIRECTION[v] ?? "RIGHT" });
// Element spacing is the minimum distance between elements — also between unconnected groups,
// which layered / mrtree / stress lay out separately and pack with spacing.componentComponent.
const _ELEM_SPACING  = (/** @type {number} */ v) => ({ "elk.spacing.nodeNode": String(v), "elk.spacing.componentComponent": String(v) });
// Centred:        NETWORK_SIMPLEX — minimises total connection length, which centres an element
//                 between its neighbours; measured on nested views: up to ~30% shorter connections
//                 and a smaller view, a few more bends, same crossings.
// Straight lines: BRANDES_KOEPF — aligns each element with one neighbour, from one of four corners
//                 (fixedAlignment NONE: the smallest result), so the layout leans to that corner.
const _NODE_PLACEMENT = (/** @type {string} */ v) => ({ "elk.layered.nodePlacement.strategy": v === "Straight lines" ? "BRANDES_KOEPF" : "NETWORK_SIMPLEX" });
const LAYER_SPACING_KEY = "elk.layered.spacing.nodeNodeBetweenLayers";
const _LAYER_SPACING = (/** @type {number} */ v) => ({ [LAYER_SPACING_KEY]: String(v) });
const _PAD_DIAGRAM   = (/** @type {number} */ v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` });
// Container padding p, plus flow on both flow sides (Tree layer distance, _boxSizes).
const _containerPadding = (/** @type {number} */ p, /** @type {number} */ flow, /** @type {boolean} */ vertical) => {
  const v = vertical ? flow : 0, h = vertical ? 0 : flow;
  return `[top=${p + CONTAINER_LABEL_CLEARANCE + v},left=${p + h},bottom=${p + v},right=${p + h}]`;
};
const _PAD_CONTAINER = (/** @type {number} */ v) => ({ "elk.padding": _containerPadding(v, 0, false) });

// edgeEdge + edgeEdgeBetweenLayers: within-layer and between-layer channels both need spacing.
const _LAYERED_CONN_SPACING      = (/** @type {number} */ v) => ({
  "elk.spacing.edgeEdge":                      String(v),
  "elk.layered.spacing.edgeEdgeBetweenLayers": String(v),
});
// edgeNodeBetweenLayers is also the distance from an element to the first / last bendpoint:
// floored at CONNECTION_END_CLEARANCE so the bend stays clear of Archi's end decoration.
const _LAYERED_CONN_ELEM_SPACING = (/** @type {number} */ v) => ({
  "elk.spacing.edgeNode":                      String(v),
  "elk.layered.spacing.edgeNodeBetweenLayers": String(Math.max(v, CONNECTION_END_CLEARANCE)),
});
// Label placement only; "elk.edgeLabels.inline" is a per-label option, set on each label in _labelBox.
const _CONN_LABEL_SPACING = (/** @type {boolean} */ v) => v ? {
  "elk.layered.edgeLabels.centerLabelPlacementStrategy": "CENTER",
} : {};

// Shared base objects — spread into root/container; padding and aspectRatio are added per scope.
const _LAYERED_BASE = {
  direction:                _DIRECTION,
  nodePlacement:            _NODE_PLACEMENT,
  routing:                  _LAYERED_ROUTING,
  connectionLabelSpacing:   _CONN_LABEL_SPACING,
  elementSpacing:           _ELEM_SPACING,
  layerSpacing:             _LAYER_SPACING,
  connectionSpacing:        _LAYERED_CONN_SPACING,
  connectionElementSpacing: _LAYERED_CONN_ELEM_SPACING,
};
const _TREE_BASE = {
  direction:                _DIRECTION,
  elementSpacing:           _ELEM_SPACING,
  // mrtree does not use layered between-layer spacing options; within-layer only.
  connectionSpacing:        (/** @type {number} */ v) => ({ "elk.spacing.edgeEdge": String(v) }),
  connectionElementSpacing: (/** @type {number} */ v) => ({ "elk.spacing.edgeNode": String(v) }),
};

// rectpacking tight-packing options:
//   packing.strategy                       COMPACTION (default) — row compaction; alternatives: SIMPLE
//   packing.compaction.iterations          passes of row compaction; more = tighter (default 1)
//   packing.compaction.rowHeightReevaluation re-evaluates row height after each move (default false)
//   orderBySize                            sort nodes largest-first before placement (default false)
//     → set in _engineOptions: only when the containers are not sorted (they conflict)
//   whiteSpaceElimination.strategy         post-pass to fill gaps; NONE = off (default)
//   widthApproximation.optimizationGoal    MAX_SCALE_DRIVEN (default) — maximises use of target width
//     → ASPECT_RATIO_DRIVEN whenever an aspect ratio is set (_AR_PACK)

/** @type {ParamMapping} */
const ROOT_MAPPING = {
  Layered: { ..._LAYERED_BASE, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
  Tree:    { ..._TREE_BASE,    aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
  Stress:  { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
  // No layerSpacing: elk.radial.radius is set only by the second run (_radialSecondRunRadius),
  // which keeps every ring outside the one before.
  // No elk.radial.compactor: RADIAL_COMPACTION depends on the input order and can pull a child
  // inside its parent's ring (also with optimizationCriteria); WEDGE_COMPACTION scatters a depth
  // over several radii.
  Radial:  { elementSpacing: _ELEM_SPACING, diagramPadding: _PAD_DIAGRAM },
  Grid:    { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
  Pack: {
    // maxWidth is NOT mapped to rectpacking.widthApproximation.targetWidth: with
    // SEPARATE_CHILDREN the container boxes are pre-sized bottom-up, so a target narrower
    // than the widest container is ignored and a too-narrow target can yield zero-width
    // nodes. maxWidth goes through view-size calibration instead (_fitViewSize).
    aspectRatio:    _AR_PACK,
    elementSpacing: (v) => ({
      "elk.spacing.nodeNode": String(v),
      "elk.rectpacking.packing.compaction.iterations": "5",
      // NB: whiteSpaceElimination EQUAL_BETWEEN_STRUCTURES is intentionally NOT used — it
      // distributes whitespace between nodes (widening boxes, offsetting content negative)
      // which pushed children outside their container's left edge. Compaction handles tightening.
    }),
    diagramPadding: _PAD_DIAGRAM,
  },
};

/** @type {ParamMapping} */
const CONTAINER_MAPPING = {
  Layered: { ..._LAYERED_BASE, aspectRatio: _AR, padding: _PAD_CONTAINER },
  Tree:    { ..._TREE_BASE,    aspectRatio: _AR, padding: _PAD_CONTAINER },
  Stress:  { elementSpacing: _ELEM_SPACING,      padding: _PAD_CONTAINER },
  Radial:  { elementSpacing: _ELEM_SPACING,      padding: _PAD_CONTAINER },
  Grid:    { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, padding: _PAD_CONTAINER },
  Pack: {
    // aspectRatio propagated to containers so their internal layout matches the root AR,
    // producing a more consistent overall shape.
    aspectRatio:    _AR_PACK,
    elementSpacing: (v) => ({
      "elk.spacing.nodeNode": String(v),
      "elk.rectpacking.packing.compaction.iterations": "5",
      "elk.rectpacking.trybox": "true",  // trybox is a lightweight pre-compaction pass that reduces the number of moves needed in compaction, improving performance with minimal impact on tightness
    }),
    padding:        _PAD_CONTAINER,
  },
};

// ─────────────────────────────────────────────────────────────────────────────


/** @type {ElkSyncModule | null} */
let _elk = null;
/** @returns {ElkSyncModule} */
function _loadELK() {
  if (_elk) return _elk;
  try {
    const t0 = Date.now();
    _elk = require(REPO_ROOT + "node_modules/elkjs/index.js");
    console.log(`ELK layout engine loaded (${Date.now() - t0} ms).`);
  } catch (e) {
    throw new Error("ELK module not loaded. Enable CommonJS in Archi Preferences > Scripting and use GraalVM.");
  }
  return /** @type {ElkSyncModule} */ (_elk);   // Cast: set by the require above
}

/**
 * Compute layout positions.
 * @param {LayoutGraph} graph  — { nodes, edges, options, algorithm, alignWidthSameType, sort }
 * @returns {LayoutResult}     — { nodes, edges, viewWidth, viewHeight }
 */
function layout(graph) {
  const logger = (/** @type {string} */ msg) => console.log("  " + msg);
  const fit = _fitViewSize(graph);
  if (!fit) return _layoutOnce(graph, logger);
  for (const line of fit.lines) logger(line);
  return fit.result;
}

/**
 * @param {LayoutGraph} graph
 * @param {number}      k      elk.aspectRatio for every scope
 * @returns {LayoutGraph}
 */
function _withAspectRatio(graph, k) {
  return Object.assign({}, graph, { options: Object.assign({}, graph.options, { aspectRatio: k }) });
}

// ── View size ─────────────────────────────────────────────────────────────────
// ELK has no size bound for these layouts: containers are laid out bottom-up and the root
// graph's width is output only. The lever is elk.aspectRatio — in every scope (root and each
// container) it sets how wide ELK packs unconnected children into rows. Its effect on the view
// is coarse and compounds across nesting levels (0.75 on every level gave a 0.27 view), so the
// adapter calibrates: it re-runs ELK with one ratio k for all scopes and searches k on a log
// scale until the measured view meets the target. Element sizes are never touched.
//   aspectRatio  k whose view width / height is closest to the target
//   maxWidth     natural layout when it fits; otherwise the widest layout that fits
// Measured size = bounding box of all elements (as logged by "View size generated").
// Views whose width is set by connection chains (layer count) have no lever: logged, not met.
const VIEW_SIZE_K_MIN     = 0.1;
const VIEW_SIZE_K_MAX     = 10;
const VIEW_SIZE_TOLERANCE = 0.1;   // accepted miss: relative ratio error, or below Max width
const VIEW_SIZE_MAX_RUNS  = 6;     // ELK runs per search; the chosen run is the result, there is no final run

/** @typedef {{ width: number, height: number, k: number, result: LayoutResult, lines: string[] }} ViewSizeRun */

/**
 * Search the elk.aspectRatio that meets the active view-size target. Every run is a full layout
 * and keeps its log lines, so the chosen run is the result: no extra run to repeat it.
 *
 * The next ratio comes from the closest run so far, assuming the view ratio follows
 * k^slope (slope 1 at first, then measured from the two closest runs; row counts are integers, so
 * the ratio moves in steps). Max width is the same search toward the ratio at which the view
 * would be exactly that wide, re-estimated from each run's area.
 * @param {LayoutGraph} graph
 * @returns {{ result: LayoutResult, lines: string[] } | null}  the chosen run; null = no target
 */
function _fitViewSize(graph) {
  const o = graph.options;
  const target = (o.aspectRatio || 0) > 0 ? "aspectRatio" : (o.maxWidth || 0) > 0 ? "maxWidth" : null;
  if (!target) return null;
  // Cast: the target is set only when its param is > 0.
  const goal = /** @type {number} */ (target === "aspectRatio" ? o.aspectRatio : o.maxWidth);
  const t0 = Date.now();
  const kMax = ALGORITHMS[graph.algorithm].engineAlgorithmId === "rectpacking" ? PACK_ASPECT_RATIO_MAX : VIEW_SIZE_K_MAX;
  /** @type {ViewSizeRun[]} */
  const runs = [];
  const measure = (/** @type {number} */ k) => {
    /** @type {string[]} */
    const lines = [];
    const result = _layoutOnce(_withAspectRatio(graph, k), msg => lines.push(msg));
    /** @type {ViewSizeRun} */
    const run = Object.assign(_boundingBox(result.nodes), { k, result, lines });
    runs.push(run);
    return run;
  };
  const size  = (/** @type {ViewSizeRun} */ m) => `${m.width}×${m.height} px`;
  const ratio = (/** @type {ViewSizeRun} */ m) => m.width / m.height;
  const choose = (/** @type {ViewSizeRun} */ best, /** @type {string} */ msg) => {
    const header = `View size: ${msg}  (${runs.length} layout runs, ${Date.now() - t0} ms)`;
    return { result: best.result, lines: [header, ...best.lines] };
  };

  // The ratio the view should have to meet the target, from one run's area.
  const wanted = (/** @type {ViewSizeRun} */ m) => target === "aspectRatio" ? goal : goal * goal / (m.width * m.height);
  const miss   = (/** @type {ViewSizeRun} */ m) => Math.abs(Math.log(ratio(m) / wanted(m)));
  const fits   = (/** @type {ViewSizeRun} */ m) => target === "aspectRatio" ? miss(m) <= VIEW_SIZE_TOLERANCE
                                                  : m.width <= goal && m.width >= goal * (1 - VIEW_SIZE_TOLERANCE);
  // Aspect ratio: the smallest miss. Max width: the widest run that fits, else the narrowest.
  const better = (/** @type {ViewSizeRun} */ a, /** @type {ViewSizeRun} */ b) => {
    if (target === "aspectRatio") return miss(a) < miss(b);
    if ((a.width <= goal) !== (b.width <= goal)) return a.width <= goal;
    return a.width <= goal ? a.width > b.width : a.width < b.width;
  };
  const best = () => runs.reduce((a, b) => (better(b, a) ? b : a));

  // First run: Max width starts from the natural layout, and stops there when it fits.
  const first = measure(target === "aspectRatio" ? Math.min(goal, kMax) : 0);
  if (target === "maxWidth" && first.width <= goal) return choose(first, `max width ${goal} px — natural layout fits (${size(first)})`);
  while (runs.length < VIEW_SIZE_MAX_RUNS && !fits(best())) {
    const near = best();
    const t = wanted(near);
    // Slope of ln(ratio) over ln(k) between the two closest runs with distinct k (the natural run has no k).
    const sorted = runs.filter(r => r.k > 0).sort((a, b) => miss(a) - miss(b));
    let slope = 1;
    if (sorted.length >= 2 && sorted[0].k !== sorted[1].k) {
      const s = Math.log(ratio(sorted[0]) / ratio(sorted[1])) / Math.log(sorted[0].k / sorted[1].k);
      if (s > 0.2 && isFinite(s)) slope = Math.min(s, 4);
    }
    const from = near.k > 0 ? near.k : ratio(near);   // the natural layout has no k: its own ratio stands in
    let k = Math.min(kMax, Math.max(VIEW_SIZE_K_MIN, from * Math.pow(t / ratio(near), 1 / slope)));
    // Stay inside the runs that bracket the target; bisect when the step leaves them.
    const below = runs.filter(r => r.k > 0 && ratio(r) < t), above = runs.filter(r => r.k > 0 && ratio(r) > t);
    if (below.length && above.length) {
      const lo = Math.max(...below.map(r => r.k)), hi = Math.min(...above.map(r => r.k));
      if (lo < hi && (k <= lo || k >= hi)) k = Math.sqrt(lo * hi);
    }
    // No new k to try (the ratio is out of reach, or the layout does not respond to it).
    if (runs.some(r => r.k > 0 && Math.abs(Math.log(r.k / k)) < 0.02)) break;
    measure(k);
  }
  const chosen = best();
  if (target === "maxWidth") {
    return choose(chosen, chosen.width <= goal
      ? `max width ${goal} px → ${size(chosen)}  (elk.aspectRatio ${chosen.k.toFixed(2)})`
      : `⚠ max width ${goal} px not reachable — narrowest layout ${size(chosen)} (connection chains or the widest container set the minimum)`);
  }
  return choose(chosen, fits(chosen)
    ? `aspect ratio ${goal} → ${ratio(chosen).toFixed(2)}, ${size(chosen)}  (elk.aspectRatio ${chosen.k.toFixed(2)})`
    : `⚠ aspect ratio ${goal} not reached — closest: ${ratio(chosen).toFixed(2)}, ${size(chosen)}`);
}

/**
 * Bounding box of all elements, rounded.
 * @param {LayoutResultNode[]} nodes
 * @returns {{ width: number, height: number }}
 */
function _boundingBox(nodes) {
  if (!nodes.length) return { width: 0, height: 0 };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const n of nodes) {
    x0 = Math.min(x0, n.x);           y0 = Math.min(y0, n.y);
    x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height);
  }
  return { width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
}

// ── One layout run ────────────────────────────────────────────────────────────

/**
 * One ELK layout: options → boxes and edges → ELK run(s) → LayoutResult.
 * @param {LayoutGraph} graph
 * @param {Logger}      log    progress output (the view-size search collects it per run)
 * @returns {LayoutResult}
 */
function _layoutOnce(graph, log) {
  /** @type {Record<string, string>} */
  const parentMap = {};
  for (const node of graph.nodes) if (node.parent) parentMap[node.id] = node.parent;
  const containerIds = new Set(Object.values(parentMap));
  const nesting = containerIds.size > 0;

  const eo = _engineOptions(graph.algorithm, graph.options, (graph.engineParams && graph.engineParams.ELK) || {}, nesting);
  log(`ELK config:  root=${graph.algorithm}(${eo.algorithmId})  routing=${eo.root["elk.edgeRouting"] || "(engine default)"}` +
      `  hierarchy=${nesting ? eo.hierarchyMode : "n/a (no nesting)"}` +
      (nesting ? `  container=${graph.options.containerAlgorithm || graph.algorithm}(${eo.containerAlgorithmId})` : ""));
  log(`ELK layoutOptions: ${JSON.stringify(eo.root)}`);
  // Tree layer distance: mrtree has one spacing (elk.spacing.nodeNode) for siblings and levels
  // alike. Every root-level box is widened in the flow direction by layerSpacing − elementSpacing
  // (_boxSizes; a container by padding on both flow sides); after layout each box gets its own
  // size back, centred in the widened one (positions only), and connection ends move onto the
  // real sides.
  const treeExtra = eo.algorithmId === "mrtree"
    ? Math.max(0, (graph.options.layerSpacing || 0) - (graph.options.elementSpacing || 0)) : 0;
  const boxes = _boxSizes(graph, parentMap, containerIds, treeExtra, eo.vertical, log);
  const { edges, selfLoops } = _workEdges(graph, eo.reserveLabels);
  log("Calculating layout...");
  const { layouted, edgeMeta } = _runELK(graph, eo, parentMap, boxes, edges, log);

  /** @type {LayoutResultNode[]} */
  const nodes = [];
  _collectNodePositions(layouted, 0, 0, nodes, log);
  /** @type {Record<string, string>} */
  const names = {};
  for (const node of graph.nodes) names[node.id] = node.label || node.id;
  if (graph.alignWidthSameType && nesting) _logWidthMismatches(nodes, boxes, containerIds, names, log);
  // Center-snap columns to a global grid (position-only; grows containers, never resizes
  // leaves). Aligns leaf columns top-to-bottom across the view. Gated on its own toggle.
  if (graph.columnsAcrossContainers && nesting) alignColumnsAcrossContainers(nodes, graph.options, names, log);
  // Tree layer distance: connections are collected against the widened boxes ELK placed.
  const elkBoxes = treeExtra > 0 ? nodes.map(n => Object.assign({}, n)) : nodes;
  if (treeExtra > 0) _narrowTreeBoxes(nodes, treeExtra, eo.vertical);

  /** @type {LayoutResultEdge[]} */
  const resultEdges = [];
  _collectEdgeResults(layouted, edgeMeta, elkBoxes, resultEdges, graph.options.labelPosition || "Middle", eo.splines, log);
  if (treeExtra > 0) _clampEndsToTreeBoxes(resultEdges, nodes, eo.vertical);
  if (eo.algorithmId === "mrtree") _routeTreeEdges(resultEdges, graph.options, eo.vertical);
  // Self-loops: pass-through with empty bendpoints. Writer synthesises.
  resultEdges.push(...selfLoops.map(selfLoopResult));

  return {
    nodes,
    edges:      resultEdges,
    viewWidth:  Math.ceil(layouted.width  || 0) + 20,
    viewHeight: Math.ceil(layouted.height || 0) + 20,
  };
}

/**
 * ELK options for every scope. Merge order per scope: engine defaults → GUI mapping →
 * engineParams.ELK, then the options the adapter itself needs (ports, hierarchy, ordering).
 * @param {string}          algorithm
 * @param {EffectiveParams} o
 * @param {Record<string, string | number | boolean>} elkParams  engineParams.ELK
 * @param {boolean}         nesting  the graph has containers
 * @returns {ElkOptions}
 */
function _engineOptions(algorithm, o, elkParams, nesting) {
  const algorithmId = ALGORITHMS[algorithm].engineAlgorithmId;
  // Container options follow the container algorithm, so e.g. rectpacking compaction follows
  // "Layout inside", not the root "Algorithm".
  const containerAlgorithm = o.containerAlgorithm || algorithm;
  const containerAlgorithmId = ALGORITHMS[containerAlgorithm].engineAlgorithmId;
  const vertical = o.direction === "Up" || o.direction === "Down";
  const hierarchyMode = o.connectionsMode === "Crossing containers" ? "INCLUDE_CHILDREN" : "SEPARATE_CHILDREN";

  const strings = (/** @type {Record<string, string | number | boolean>} */ p) =>
    Object.fromEntries(Object.entries(p).map(([k, v]) => [k, String(v)]));
  const defaults = strings(DEFAULT_ELK_PARAMS);
  const preset   = strings(elkParams);
  // Casts: the ELK mappers return string values.
  const rootGui = /** @type {ElkLayoutOptions} */ (applyParams(algorithm, o, ROOT_MAPPING));
  const ctrGui  = /** @type {ElkLayoutOptions} */ (applyParams(containerAlgorithm, o, CONTAINER_MAPPING));
  // Reserve label space (Layered): every connection gets a label box in its own label layer, so
  // ELK's layer spacing becomes the element ↔ label distance (= connectionSpacing) — see _labelBox.
  const reserveLabels = !!o.connectionLabelSpacing && algorithmId === "layered";
  if (reserveLabels) for (const gui of [rootGui, ctrGui]) {
    if (LAYER_SPACING_KEY in gui) gui[LAYER_SPACING_KEY] = String(o.connectionSpacing || 0);
  }

  // Uniform port spacing (= connectionSpacing): ports exactly that far apart, centred on the side —
  // independent of node height, so ports of neighbouring nodes share one grid and parallel
  // connections keep the same spacing all the way into the ports. portPort / portsSurrounding are
  // read from the parent graph (root / container); the leaf side is in _elkNode.
  const portSpacing = algorithmId === "layered" ? (o.connectionSpacing || 0) : 0;
  const portOpts = portSpacing > 0 ? {
    "elk.spacing.portPort":         String(portSpacing),
    "elk.spacing.portsSurrounding": `[top=${portSpacing},left=${portSpacing},bottom=${portSpacing},right=${portSpacing}]`,
  } : {};
  // orderBySize: only for Pack, and only when the containers are not sorted — they conflict because
  // sorting them pre-sorts by type+name and orderBySize overrides that with size-first order.
  const orderBySize = algorithm === "Pack" && o.sort === Defs.SORT_MODE.ELEMENTS ? { "elk.rectpacking.orderBySize": "true" } : {};

  return {
    root: Object.assign({ "elk.algorithm": algorithmId }, defaults, rootGui, preset, portOpts,
      nesting ? { "elk.hierarchyHandling": hierarchyMode } : {}, orderBySize),
    container: Object.assign({ "elk.algorithm": containerAlgorithmId, "elk.hierarchyHandling": hierarchyMode },
      defaults, ctrGui, preset, portOpts, containerAlgorithmId === "rectpacking" ? orderBySize : {}),
    // Node-level options (e.g. selfLoopDistribution, selfLoopOrdering) are target:NODES in ELK:
    // they must be on each node, not only on the root graph.
    leaf: Object.assign({}, defaults, preset),
    ports: portSpacing > 0,
    algorithmId,
    containerAlgorithmId,
    hierarchyMode,
    // Hierarchical ports need an edge-routing algorithm on both sides of every container boundary;
    // ELK layered honours the port positions the inner layout chose. Other algorithms: lift instead.
    edgeMode: hierarchyMode === "INCLUDE_CHILDREN" ? "include"
      : algorithmId === "layered" && containerAlgorithmId === "layered" ? "ports" : "lift",
    reserveLabels,
    splines: rootGui["elk.edgeRouting"] === "SPLINES",
    vertical,
  };
}

/**
 * Boxes handed to ELK, per node id.
 * Same width per level: every box at one nesting level gets the level's width — exact on leaves,
 * a minimum on containers (MINIMUM_SIZE: never below content). The widths telescope from the
 * narrowest leaf at the deepest level, which is a leaf ELK does not resize, so the input widths
 * suffice. Tree layer distance: root-level boxes widened in the flow direction by treeExtra (a
 * container by treeExtra / 2 padding on both flow sides, and its minimum width with it).
 * @param {LayoutGraph}            graph
 * @param {Record<string, string>} parentMap
 * @param {Set<string>}            containerIds
 * @param {number}                 treeExtra
 * @param {boolean}                vertical
 * @param {Logger}                 log
 * @returns {Record<string, ElkBox>}
 */
function _boxSizes(graph, parentMap, containerIds, treeExtra, vertical, log) {
  /** @type {Record<string, number>} */
  let levelWidth = {};
  if (graph.alignWidthSameType && containerIds.size > 0) {
    /** @type {Record<string, number>} */
    const widths = {};
    for (const node of graph.nodes) widths[node.id] = node.width;
    // One nesting level adds left+right container padding to the width (label clearance is top-only).
    levelWidth = alignWidthsByLevel(graph.nodes, parentMap, widths, 2 * (graph.options.padding || 0), log);
  }
  /** @type {Record<string, ElkBox>} */
  const boxes = {};
  for (const node of graph.nodes) {
    const w = levelWidth[node.id] > 0 ? levelWidth[node.id] : 0;
    const widen = treeExtra > 0 && !node.parent;
    if (containerIds.has(node.id)) {
      boxes[node.id] = !widen ? { width: w, height: 0 } : {
        width:   w > 0 && !vertical ? w + treeExtra : w,
        height:  0,
        padding: _containerPadding(graph.options.padding || 0, treeExtra / 2, vertical),
      };
      continue;
    }
    const box = { width: w || node.width, height: node.height };
    if (widen) {
      if (vertical) box.height += treeExtra; else box.width += treeExtra;
    }
    boxes[node.id] = box;
  }
  return boxes;
}

/**
 * Same width per level: log every leaf whose final width differs from its box, and every
 * container ELK left narrower than its minimum.
 * @param {LayoutResultNode[]}     nodes
 * @param {Record<string, ElkBox>} boxes
 * @param {Set<string>}            containerIds
 * @param {Record<string, string>} names
 * @param {Logger}                 log
 */
function _logWidthMismatches(nodes, boxes, containerIds, names, log) {
  log("[alignByLevel] target vs final rendered width — mismatches:");
  for (const n of nodes) {
    const target = boxes[n.id].width, isC = containerIds.has(n.id);
    const bad = isC ? n.width + 0.5 < target : Math.abs(n.width - target) > 0.5;  // leaf must equal; container must be ≥
    if (bad) log(`    ${isC ? "container" : "leaf     "} target=${target} final=${Math.round(n.width)}  ⚠ MISMATCH  "${names[n.id]}"`);
  }
}

/**
 * ELK edges for the graph's connections (Radial: a spanning tree). Self-loops the algorithm does
 * not route are returned apart; the writer synthesises them.
 * @param {LayoutGraph} graph
 * @param {boolean}     reserveLabels
 * @returns {{ edges: ElkWorkEdge[], selfLoops: LayoutEdge[] }}
 */
function _workEdges(graph, reserveLabels) {
  const nodeIds = graph.nodes.map(n => n.id), known = new Set(nodeIds);
  // Connection-label sizing uses the same text estimate and tuning as label-based node sizing
  // (defaults + preset engineParams.layout).
  /** @type {LabelSizing} */
  const lp = Object.assign({}, Defs.LABEL_SIZING_DEFAULTS, graph.engineParams && graph.engineParams.layout);
  /** @type {ElkWorkEdge[]} */
  const edges = [];
  /** @type {LayoutEdge[]} */
  const selfLoops = [];
  for (const edge of graph.edges) {
    if (!known.has(edge.source) || !known.has(edge.target)) continue;
    if (edge.source === edge.target && !ALGORITHMS[graph.algorithm].supportsSelfLoops) { selfLoops.push(edge); continue; }
    /** @type {ElkWorkEdge} */
    const entry = { id: edge.id, _archiRelId: edge.conceptId || edge.id, sources: [edge.source], targets: [edge.target] };
    if (edge.weight) entry.properties = { "elk.priority": edge.weight };
    if (reserveLabels) entry.labels = [_labelBox(edge, lp, graph.options)];
    edges.push(entry);
  }
  // ELK Radial requires a spanning tree (no cycles), so its c2c traversal terminates.
  return { edges: graph.algorithm === "Radial" ? _spanningTree(nodeIds, edges) : edges, selfLoops };
}

/**
 * The ELK runs: the layout, then the Radial second run and Stress overlap removal where they apply.
 * @param {LayoutGraph}            graph
 * @param {ElkOptions}             eo
 * @param {Record<string, string>} parentMap
 * @param {Record<string, ElkBox>} boxes
 * @param {ElkWorkEdge[]}          edges
 * @param {Logger}                 log
 * @returns {{ layouted: ElkRoot, edgeMeta: Record<string, ElkEdgeMeta> }}
 */
function _runELK(graph, eo, parentMap, boxes, edges, log) {
  const elk = _loadELK();
  const run = (/** @type {ElkRoot} */ elkGraph, /** @type {string} */ what) => {
    const t0 = Date.now(), r = elk.layout(elkGraph);
    log(`${what}: width=${Math.round(r.width || 0)} height=${Math.round(r.height || 0)}  (${Date.now() - t0} ms)`);
    return r;
  };
  let { elkGraph, edgeMeta } = _buildELKGraph(graph, eo, parentMap, boxes, edges, {});
  let layouted = run(elkGraph, "ELK result");

  // Radial: a second run with a fixed radius when deeper rings landed inside the first.
  const radius = graph.algorithm === "Radial" ? _radialSecondRunRadius(layouted, edges) : 0;
  if (radius > 0) {
    ({ elkGraph, edgeMeta } = _buildELKGraph(graph, eo, parentMap, boxes, edges, { "elk.radial.radius": String(radius) }));
    layouted = run(elkGraph, `ELK result (Radial second run, radius ${radius})`);
  }

  // Stress places elements by connection length only and leaves them on top of each other. ELK SPOrE
  // moves them apart to Element distance (positions only) and draws the connections straight again.
  if (eo.algorithmId === "stress") {
    layouted.layoutOptions = Object.assign({}, layouted.layoutOptions, { "elk.algorithm": "sporeOverlap" });
    layouted = run(layouted, "ELK result (Stress overlap removal)");
  }
  return { layouted, edgeMeta };
}

/**
 * Label box for one connection in Reserve-label-space mode. Every connection gets one, so every
 * gap between two element layers holds a label layer and its width is decided per gap:
 *   gap = 2 × connectionSpacing + box length in the flow direction
 * The box is stretched in the flow direction to at least layerSpacing − 2 × connectionSpacing, so
 *   gap without labels  = layerSpacing
 *   gap with a label    = max(layerSpacing, label + 2 × connectionSpacing)
 *   element → label     = max(connectionSpacing, (layerSpacing − label) / 2)
 * Connections without a label get an invisible box (GAP_LABEL_SUFFIX; ignored by _collectEdgeResults).
 * ELK ignores labels with empty text, hence the placeholder text.
 * Label size: same text estimate and tuning as label-based node sizing; hPad / vPad are its margin.
 * inline: ELK centres the label on the line and reserves that box — where Archi draws it.
 */
const GAP_LABEL_SUFFIX = "_gap";
/**
 * @param {LayoutEdge}      edge
 * @param {LabelSizing}     lp
 * @param {EffectiveParams} opts
 * @returns {ElkWorkLabel}
 */
function _labelBox(edge, lp, opts) {
  const flowIsX  = opts.direction !== "Up" && opts.direction !== "Down";
  const minFlow  = Math.max(0, (opts.layerSpacing || 0) - 2 * (opts.connectionSpacing || 0));
  let w = 0, h = 0;
  if (edge.label) {
    const lines = edge.label.split("\n");
    w = Math.max(...lines.map(l => EngineUtils.textWidth(l, lp.labelCharWidth))) + lp.labelHPadding;
    h = lines.length * lp.labelLineHeight + lp.labelVPadding;
  }
  if (flowIsX) w = Math.max(w, minFlow); else h = Math.max(h, minFlow);
  return {
    id:            edge.id + (edge.label ? "_lbl" : GAP_LABEL_SUFFIX),
    text:          edge.label || "_",
    width:         w,
    height:        h,
    layoutOptions: { "elk.edgeLabels.inline": "true" },
  };
}

// ── Graph building ────────────────────────────────────────────────────────────

/**
 * A fresh ELK graph from the layout graph: ELK writes its result into the objects it gets, so
 * every run builds its own. Children in engine-utils.sortedNodes order.
 * @param {LayoutGraph}            graph
 * @param {ElkOptions}             eo
 * @param {Record<string, string>} parentMap
 * @param {Record<string, ElkBox>} boxes
 * @param {ElkWorkEdge[]}          edges
 * @param {ElkLayoutOptions}       rootExtra  added to the root options (Radial second run)
 * @returns {{ elkGraph: ElkRoot, edgeMeta: Record<string, ElkEdgeMeta> }}
 */
function _buildELKGraph(graph, eo, parentMap, boxes, edges, rootExtra) {
  const containerIds = new Set(Object.values(parentMap));
  /** @type {Record<string, ElkWorkNode>} */
  const byId = {};
  for (const node of graph.nodes) byId[node.id] = _elkNode(node.id, boxes[node.id], containerIds.has(node.id), eo);
  /** @type {ElkWorkNode[]} */
  const rootChildren = [];
  for (const node of sortedNodes(graph.nodes, parentMap, graph.sort))
    (node.parent ? byId[node.parent].children : rootChildren).push(byId[node.id]);
  const { rootEdges, edgeMeta } = _placeEdges(edges, parentMap, byId, eo.edgeMode);
  const layoutOptions = Object.assign({}, eo.root, rootExtra);
  return { elkGraph: { id: "root", layoutOptions, children: rootChildren, edges: rootEdges }, edgeMeta };
}

/**
 * @param {string}     id
 * @param {ElkBox}     box
 * @param {boolean}    isContainer
 * @param {ElkOptions} eo
 * @returns {ElkWorkNode}
 */
function _elkNode(id, box, isContainer, eo) {
  if (isContainer) {
    // Same width per level: floor the container width to its level width; MINIMUM_SIZE keeps it
    // from shrinking below content. Otherwise ELK sizes it from children + padding.
    const minimum = box.width > 0 ? { "elk.nodeSize.constraints": "[MINIMUM_SIZE]", "elk.nodeSize.minimum": `(${box.width}, 0)` } : {};
    const padding = box.padding ? { "elk.padding": box.padding } : {};
    return { id, children: [], edges: [], layoutOptions: Object.assign({}, eo.container, minimum, padding) };
  }
  // Uniform port spacing: portAlignment and nodeSize are read from the leaf itself.
  // [PORTS, MINIMUM_SIZE] lets ELK grow a leaf until its actual ports (+ one spacing margin at both
  // ends) fit — never shrinking below the given size. Without it, ports beyond the side make
  // Archi's orthogonal anchor fall back to a corner.
  const ports = eo.ports ? {
    "elk.portAlignment.default": "CENTER",
    "elk.nodeSize.constraints":  "[PORTS, MINIMUM_SIZE]",
    "elk.nodeSize.minimum":      `(${box.width}, ${box.height})`,
  } : {};
  return { id, width: box.width, height: box.height, children: [], edges: [], layoutOptions: Object.assign({}, eo.leaf, ports) };
}

/**
 * ELK Radial puts ring k at k × step (step = largest element diagonal). When the first ring is too
 * small for its elements ELK widens it and moves the second ring out with it, but leaves ring 3
 * and deeper where they were — inside the first. A second run with a fixed radius R keeps ring 1 at
 * the size it needs (r1), ring 2 at r1 + R and ring k ≥ 3 at k × R; R = (r1 + step) / 2 puts ring
 * 3 one step outside ring 2.
 * @param {ElkRoot}       layouted   first-run result
 * @param {ElkWorkEdge[]} treeEdges  spanning tree, every edge pointing away from the root
 * @returns {number} radius for the second run; 0 when the first run needs none
 */
function _radialSecondRunRadius(layouted, treeEdges) {
  const kids = layouted.children || [];
  /** @type {Record<string, ElkWorkNode>} */
  const byId = {};
  for (const c of kids) byId[c.id] = c;
  const hasIncoming = new Set(treeEdges.map(e => e.targets[0]));
  const root = kids.find(c => !hasIncoming.has(c.id));
  if (!root) return 0;

  /** @type {Record<string, string[]>} */
  const out = {};
  for (const e of treeEdges) (out[e.sources[0]] = out[e.sources[0]] || []).push(e.targets[0]);
  /** @type {Record<string, number>} */
  const depth = { [root.id]: 0 };
  const queue = [root.id];
  let maxDepth = 0;
  while (queue.length) {
    const cur = /** @type {string} */ (queue.shift());   // Cast: the queue is not empty
    for (const nb of (out[cur] || [])) {
      if (depth[nb] !== undefined) continue;
      depth[nb] = depth[cur] + 1;
      maxDepth = Math.max(maxDepth, depth[nb]);
      queue.push(nb);
    }
  }
  if (maxDepth < 3) return 0;

  // Casts: ELK sets x, y on every node; leaves keep their size.
  const centre = (/** @type {ElkWorkNode} */ n) => ({
    x: /** @type {number} */ (n.x) + /** @type {number} */ (n.width)  / 2,
    y: /** @type {number} */ (n.y) + /** @type {number} */ (n.height) / 2,
  });
  const c0 = centre(root);
  const step = Math.max(...kids.map(n => Math.hypot(/** @type {number} */ (n.width), /** @type {number} */ (n.height))));
  let ring1 = 0;
  for (const id of Object.keys(depth)) {
    if (depth[id] !== 1 || !byId[id]) continue;
    const c = centre(byId[id]);
    ring1 = Math.max(ring1, Math.hypot(c.x - c0.x, c.y - c0.y));
  }
  if (ring1 <= step + 1) return 0;   // first ring not widened: every ring at k × step
  return Math.ceil((ring1 + step) / 2);
}

/**
 * @param {string[]}      nodeIds   in input order
 * @param {ElkWorkEdge[]} edgeList
 * @returns {ElkWorkEdge[]}
 */
function _spanningTree(nodeIds, edgeList) {
  // BFS spanning tree — removes cycles so ELK Radial's c2c traversal terminates. Every tree edge
  // points away from its component root: ELK Radial takes each node without an incoming edge as a
  // root, so edges in the relation's own direction give several roots and stack their subtrees on
  // one spot. Each component starts at its best-connected element, which keeps the tree shallow.
  // Disconnected components are connected to the first root via virtual edges.
  if (!nodeIds.length) return edgeList;

  /** @type {Record<string, { id: string, edge: ElkWorkEdge }[]>} */
  const adj = {};
  for (const edge of edgeList) {
    const s = edge.sources[0], t = edge.targets[0];
    if (!s || !t) continue;
    (adj[s] = adj[s] || []).push({ id: t, edge });
    (adj[t] = adj[t] || []).push({ id: s, edge });
  }

  /** @type {Set<string>} */
  const visited = new Set();
  /** @type {ElkWorkEdge[]} */
  const treeEdges = [];
  /** @type {string[]} */
  const componentRoots = [];

  const degree = (/** @type {string} */ id) => (adj[id] || []).length;
  const byDegree = nodeIds.slice().sort((a, b) => degree(b) - degree(a));   // stable: ties keep input order
  for (const startId of byDegree) {
    if (visited.has(startId)) continue;
    componentRoots.push(startId);
    visited.add(startId);
    const queue = [startId];
    while (queue.length) {
      const cur = /** @type {string} */ (queue.shift());   // Cast: the queue is not empty
      for (const { id: nbId, edge } of (adj[cur] || [])) {
        if (!visited.has(nbId)) {
          visited.add(nbId);
          const away = edge.sources[0] === cur;
          treeEdges.push(away ? edge : Object.assign({}, edge, { sources: [cur], targets: [nbId], _treeReversed: true }));
          queue.push(nbId);
        }
      }
    }
  }

  for (let i = 1; i < componentRoots.length; i++) {
    treeEdges.push({
      id: `__span_${i}`, sources: [componentRoots[0]], targets: [componentRoots[i]],
      _archiRelId: null,
    });
  }
  return treeEdges;
}

/**
 * Place every edge in the edges[] of its lowest common ancestor container (LCA) — ELK's
 * default edge coordinates (elk.json.edgeCoords CONTAINER) are relative to that container,
 * so _collectEdgeResults can offset by the container the edge is stored in.
 *
 * Edges whose endpoints are not both direct children of the LCA cross container boundaries:
 *   include  INCLUDE_CHILDREN — keep the real endpoints; ELK routes the full path.
 *   ports    SEPARATE_CHILDREN + layered — split into segments joined by a hierarchical port
 *            on each crossed container. The inner segment makes the inner layout reserve port
 *            space on the element and route up to the container border; the outer layout
 *            connects to the port position the inner layout chose.
 *   lift     SEPARATE_CHILDREN otherwise — replace each nested endpoint by its ancestor that
 *            is a direct child of the LCA; ELK routes between opaque container boxes.
 *
 * Edges between a container and one of its own descendants cannot be laid out and are dropped
 * (the writer draws them unrouted).
 *
 * @returns {{ rootEdges: ElkWorkEdge[], edgeMeta: Record<string, ElkEdgeMeta> }}  edgeMeta per ELK edge id:
 *   lifted  { origSrcId, origTgtId }
 *   segment { segOf, segIdx, segCount, origSrcId, origTgtId }
 * @param {ElkWorkEdge[]}               edgeList
 * @param {Record<string, string>}      parentMap
 * @param {Record<string, ElkWorkNode>} byId       the run's fresh ELK nodes, children attached
 * @param {"include" | "ports" | "lift"} mode
 */
function _placeEdges(edgeList, parentMap, byId, mode) {
  const ROOT = "root";
  /** @type {ElkWorkEdge[]} */
  const rootEdges = [];
  /** @type {Record<string, ElkEdgeMeta>} */
  const edgeMeta  = {};
  const addTo = (/** @type {string} */ ctrId, /** @type {ElkWorkEdge} */ e) => (ctrId === ROOT ? rootEdges : byId[ctrId].edges).push(e);
  // A copy per run: ELK writes sections and label positions into the edges and labels it gets.
  const labelsOf = (/** @type {ElkWorkEdge} */ e) => e.labels ? { labels: e.labels.map(l => Object.assign({}, l)) } : {};
  // Ancestor chain of a node, nearest first, ending in ROOT.
  const ancestors = (/** @type {string} */ id) => {
    const out = []; let p = parentMap[id];
    while (p !== undefined) { out.push(p); p = parentMap[p]; }
    out.push(ROOT);
    return out;
  };

  for (const edge of edgeList) {
    const srcId = edge.sources[0], tgtId = edge.targets[0];
    const srcAnc = ancestors(srcId), tgtAnc = ancestors(tgtId);
    if (srcAnc.includes(tgtId) || tgtAnc.includes(srcId)) continue;  // container ↔ own descendant
    const lca = /** @type {string} */ (srcAnc.find(a => tgtAnc.includes(a)));   // Cast: both chains end in ROOT
    // Containers crossed below the LCA, nearest the endpoint first.
    const srcChain = srcAnc.slice(0, srcAnc.indexOf(lca));
    const tgtChain = tgtAnc.slice(0, tgtAnc.indexOf(lca));
    // ports: a connection ending on a container itself also gets a port on it — once a container
    // has hierarchical ports, ELK puts the implicit port of a direct connection in its top-left corner.
    const isCtr  = (/** @type {string} */ id) => mode === "ports" && srcId !== tgtId && byId[id].children.length > 0;
    const ctrEnd = isCtr(srcId) || isCtr(tgtId);

    if (mode === "include" || (srcChain.length === 0 && tgtChain.length === 0 && !ctrEnd)) {
      addTo(lca, Object.assign({}, edge, labelsOf(edge)));
      continue;
    }

    if (mode === "lift") {
      const liftedSrc = srcChain.length ? srcChain[srcChain.length - 1] : srcId;
      const liftedTgt = tgtChain.length ? tgtChain[tgtChain.length - 1] : tgtId;
      edgeMeta[edge.id] = { origSrcId: srcId, origTgtId: tgtId };
      addTo(lca, Object.assign({}, edge, labelsOf(edge), { sources: [liftedSrc], targets: [liftedTgt] }));
      continue;
    }

    // ports: endpoint → port(src parent) → … → port(tgt parent) → endpoint.
    // Each segment lives in the container that owns it; the label goes on the LCA segment.
    const portOf = (/** @type {string} */ ctrId) => {
      const port = { id: `${edge.id}__p_${ctrId}` };
      (byId[ctrId].ports = byId[ctrId].ports || []).push(port);
      return port.id;
    };
    const stops = [isCtr(srcId) ? portOf(srcId) : srcId];
    /** @type {string[]} */
    const owners = [];
    for (const c of srcChain)                 { stops.push(portOf(c)); owners.push(c); }
    owners.push(lca);
    for (const c of tgtChain.slice().reverse()) { stops.push(portOf(c)); owners.push(c); }
    stops.push(isCtr(tgtId) ? portOf(tgtId) : tgtId);
    const segCount = stops.length - 1;
    for (let i = 0; i < segCount; i++) {
      /** @type {ElkWorkEdge} */
      const seg = {
        id:          `${edge.id}__seg${i}`,
        _archiRelId: edge._archiRelId,
        sources:     [stops[i]],
        targets:     [stops[i + 1]],
      };
      if (edge.properties) seg.properties = edge.properties;
      if (owners[i] === lca) Object.assign(seg, labelsOf(edge));
      edgeMeta[seg.id] = { segOf: edge.id, segIdx: i, segCount, origSrcId: srcId, origTgtId: tgtId };
      addTo(owners[i], seg);
    }
  }
  return { rootEdges, edgeMeta };
}

// ── Result extraction ─────────────────────────────────────────────────────────

/**
 * Sample N points on the cubic Bézier spline described by an ELK section.
 *
 * ELK SPLINES sections store Bézier *control points*, not curve points.
 * Format: section.bendPoints = [c1, c2, k1, c3, c4, k2, ...] where each
 * triple (c_a, c_b, knot) defines one cubic segment; the last pair (c_a, c_b)
 * has no trailing knot — the section's endPoint is the final anchor.
 *
 * Archi has no Bézier renderer; it draws polyline segments between bend points.
 * Giving it control points (which can be at the element boundary) produces a
 * visible segment inside the element. Sampling the actual curve avoids this.
 *
 * @param {{ startPoint?: Point, endPoint?: Point, bendPoints?: Point[] }} section  ELK edge section (absolute)
 * @param {number} nSamples total sample count spread across all segments
 * @returns {{ x: number, y: number }[]}
 */
function _sampleSplineSection(section, nSamples) {
  const rawBps = section.bendPoints;
  if (!rawBps || rawBps.length < 2) {
    // No control points → straight segment; no bend points needed.
    return [];
  }

  const sp  = section.startPoint || { x: 0, y: 0 };
  const ep  = section.endPoint   || { x: 0, y: 0 };

  // ELK CONSERVATIVE mode uses a clamped-endpoint B-spline representation for
  // multi-layer edges: it prepends one or more copies of startPoint and appends
  // copies of endPoint into bendPoints as anchor sentinels. These are NOT
  // Bézier control handles. Strip them before parsing, or the first/last
  // segments become degenerate (P0=P1=P2=boundary) and sampled points land on
  // — or just inside — the element edge.
  const EPS = 0.5;
  let trimStart = 0;
  while (trimStart < rawBps.length - 1
      && Math.abs(rawBps[trimStart].x - sp.x) < EPS
      && Math.abs(rawBps[trimStart].y - sp.y) < EPS) {
    trimStart++;
  }
  let trimEnd = rawBps.length - 1;
  while (trimEnd > trimStart
      && Math.abs(rawBps[trimEnd].x - ep.x) < EPS
      && Math.abs(rawBps[trimEnd].y - ep.y) < EPS) {
    trimEnd--;
  }
  const bps = rawBps.slice(trimStart, trimEnd + 1);
  if (bps.length < 2) return [];

  const n = bps.length;

  // Build cubic Bézier segments.
  // Each group of 3 from bps: (ctrl_a, ctrl_b, knot) defines one segment.
  // The final group has only (ctrl_a, ctrl_b); the anchor is the end point.
  /** @type {[Point, Point, Point, Point][]} */
  const segments = [];
  let p0 = sp;
  for (let i = 0; i < n; i += 3) {
    const p1 = bps[i];
    const p2 = bps[i + 1];              // always present: n >= 2 after trim
    const p3 = (i + 2 < n) ? bps[i + 2] : ep;
    if (p1 && p2) segments.push([p0, p1, p2, p3]);
    p0 = p3;
  }
  if (segments.length === 0) return [];

  /** @type {Point[]} */
  const result = [];
  const sps    = Math.max(1, Math.round(nSamples / segments.length));

  for (let si = 0; si < segments.length; si++) {
    const [p0, p1, p2, p3] = segments[si];
    for (let j = 1; j <= sps; j++) {
      const p = cubicPoint(p0, p1, p2, p3, j / (sps + 1));
      result.push({ x: Math.round(p.x), y: Math.round(p.y) });
    }
  }
  return result;
}

/**
 * @param {ElkWorkNode | ElkRoot} elkNode
 * @param {number}                offsetX
 * @param {number}                offsetY
 * @param {LayoutResultNode[]}    resultNodes  filled
 * @param {Logger}                log
 * @param {string}                [parentId]
 */
function _collectNodePositions(elkNode, offsetX, offsetY, resultNodes, log, parentId) {
  for (const child of (elkNode.children || [])) {
    const absX = offsetX + (child.x || 0);
    const absY = offsetY + (child.y || 0);
    // Guard against degenerate ELK output (an external engine): rectpacking with aggressive
    // compaction can occasionally emit a node with a zero/undefined dimension.
    // A non-positive width/height crashes the writer's setBounds ("Width or height cannot be
    // zero or less"). Clamp to a minimum and warn with the node id so the cause stays visible.
    // Casts: either may be undefined; the !(w > 0) guard below handles that.
    let w = /** @type {number} */ (child.width), h = /** @type {number} */ (child.height);
    if (!(w > 0) || !(h > 0)) {
      log(`⚠ [elk] node "${child.id}" has non-positive size (w=${w}, h=${h}); clamping to ${MIN_NODE_SIZE}px`);
      if (!(w > 0)) w = MIN_NODE_SIZE;
      if (!(h > 0)) h = MIN_NODE_SIZE;
    }
    resultNodes.push({
      id:       child.id,
      x:        absX,
      y:        absY,
      width:    w,
      height:   h,
      parentId: parentId || null,
    });
    _collectNodePositions(child, absX, absY, resultNodes, log, child.id);
  }
}

/**
 * Tree layer distance: give every root-level box its own size back, centred in the widened box
 * ELK placed (flow direction only). Nested boxes keep their absolute positions.
 * @param {LayoutResultNode[]} resultNodes  changed in place
 * @param {number}             extra        widening in the flow direction
 * @param {boolean}            vertical     flow Up / Down
 */
function _narrowTreeBoxes(resultNodes, extra, vertical) {
  for (const n of resultNodes) {
    if (n.parentId) continue;
    if (vertical) { n.y += extra / 2; n.height -= extra; }
    else          { n.x += extra / 2; n.width  -= extra; }
  }
}

/**
 * Tree layer distance: move connection ends that lie in the widened part of a root-level box
 * onto the box's real side (flow coordinate clamped into the narrowed box).
 * @param {LayoutResultEdge[]} resultEdges  changed in place
 * @param {LayoutResultNode[]} resultNodes  narrowed boxes
 * @param {boolean}            vertical     flow Up / Down
 */
function _clampEndsToTreeBoxes(resultEdges, resultNodes, vertical) {
  /** @type {Record<string, LayoutResultNode>} */
  const byId = {};
  for (const n of resultNodes) byId[n.id] = n;
  const rootOf = (/** @type {string} */ id) => {
    let n = byId[id];
    while (n && n.parentId && byId[n.parentId]) n = byId[n.parentId];
    return n;
  };
  const clamp = (/** @type {Point | undefined} */ p, /** @type {string} */ id) => {
    const n = rootOf(id);
    if (!p || !n) return;
    if (vertical) p.y = Math.min(Math.max(p.y, n.y), n.y + n.height);
    else          p.x = Math.min(Math.max(p.x, n.x), n.x + n.width);
  };
  for (const e of resultEdges) { clamp(e.srcPort, e.sourceId); clamp(e.tgtPort, e.targetId); }
}

/**
 * Tree routing: mrtree draws a short stub and then a diagonal to the target (AVOID_OVERLAP; it
 * has no orthogonal or spline routing).
 *   Straight  no bendpoints: Archi draws a straight line between the elements
 *   Splines   between the ports mrtree chose, a cubic S-curve (control points halfway along the
 *             flow), sampled to bendpoints
 * @param {LayoutResultEdge[]} resultEdges  changed in place
 * @param {EffectiveParams}    opts
 * @param {boolean}            vertical     flow Up / Down
 */
function _routeTreeEdges(resultEdges, opts, vertical) {
  // Flow axis f, cross axis c: Right / Left → f = x; Up / Down → f = y.
  const f = vertical ? "y" : "x", c = vertical ? "x" : "y";
  const pt = (/** @type {number} */ fv, /** @type {number} */ cv) => vertical
    ? { x: Math.round(cv), y: Math.round(fv) } : { x: Math.round(fv), y: Math.round(cv) };
  for (const e of resultEdges) {
    const s = e.srcPort, t = e.tgtPort;
    if (!s || !t || e.sourceId === e.targetId) continue;
    if (opts.routing !== "Splines") { e.bendpoints = []; e.isStraight = true; continue; }
    const mid = (s[f] + t[f]) / 2;
    /** @type {Point[]} */
    let bps;
    if (Math.abs(s[c] - t[c]) < 1) {
      bps = [pt(mid, s[c])];
    } else {
      bps = [];
      // P0 = s, P1 = (mid, s.c), P2 = (mid, t.c), P3 = t
      const p1 = vertical ? { x: s.x, y: mid } : { x: mid, y: s.y };
      const p2 = vertical ? { x: t.x, y: mid } : { x: mid, y: t.y };
      for (let j = 1; j <= SPLINE_SAMPLE_POINTS; j++) {
        const p = cubicPoint(s, p1, p2, t, j / (SPLINE_SAMPLE_POINTS + 1));
        bps.push({ x: Math.round(p.x), y: Math.round(p.y) });
      }
    }
    e.bendpoints = bps;
    const lbl = labelPoint(s, t, bps, opts.labelPosition || "Middle");
    e.labelX = lbl.labelX; e.labelY = lbl.labelY;
  }
}

/**
 * Collect routed edges from the ELK result into LayoutResult edges (absolute coordinates).
 * Edge sections are relative to the container whose edges[] holds the edge (see _placeEdges).
 * Hierarchical-port segments (edgeMeta.segOf) are buffered and joined into one path, in
 * segment order, once all segments of the relation are collected.
 * @param {ElkRoot}                     layouted
 * @param {Record<string, ElkEdgeMeta>} edgeMeta
 * @param {LayoutResultNode[]}          resultNodes
 * @param {LayoutResultEdge[]}          resultEdges  filled
 * @param {string}                      labelPosition
 * @param {boolean}                     isSplines
 * @param {Logger}                      log
 */
function _collectEdgeResults(layouted, edgeMeta, resultNodes, resultEdges, labelPosition, isSplines, log) {
  /** @type {Record<string, LayoutResultNode>} */
  const byId = {};
  for (const n of resultNodes) byId[n.id] = n;
  /** @type {Record<string, { meta: ElkEdgeMeta, recs: CollectedEdge[] }>} */
  const segGroups = {};

  (function walk(/** @type {ElkWorkNode | ElkRoot} */ elkNode) {
    const container = elkNode.id === "root" ? null : byId[elkNode.id];
    const offsetX = container ? container.x : 0;
    const offsetY = container ? container.y : 0;

    const abs = (/** @type {Point | undefined} */ p) => ({ x: offsetX + ((p && p.x) || 0), y: offsetY + ((p && p.y) || 0) });
    for (const edge of (elkNode.edges || [])) {
      if (!edge.sections || edge.sections.length === 0) continue;
      const lbl = edge.labels && edge.labels.find(l => !l.id.endsWith(GAP_LABEL_SUFFIX));
      /** @type {CollectedEdge} */
      const rec = {
        edge,
        sections: edge.sections.map(s => ({
          startPoint: abs(s.startPoint),
          endPoint:   abs(s.endPoint),
          bendPoints: (s.bendPoints || []).map(abs),
        })),
        label: lbl && lbl.x !== undefined
          ? { x: offsetX + lbl.x + (lbl.width || 0) / 2, y: offsetY + /** @type {number} */ (lbl.y) + (lbl.height || 0) / 2 }   // Cast: y is set with x
          : null,
      };
      const meta = edgeMeta && edgeMeta[edge.id];
      if (meta && meta.segOf !== undefined) {
        const grp = segGroups[meta.segOf] = segGroups[meta.segOf] || { meta, recs: [] };
        grp.recs[/** @type {number} */ (meta.segIdx)] = rec;   // Cast: segment meta has segIdx
        continue;
      }
      _emitEdgeResult(rec, meta, resultEdges, labelPosition, isSplines);
    }
    for (const child of (elkNode.children || [])) walk(child);
  })(layouted);

  for (const [relId, { meta, recs }] of Object.entries(segGroups)) {
    const complete = recs.filter(Boolean).length === meta.segCount;
    if (!complete) {
      log(`⚠ [elk] relation "${relId}": ${recs.filter(Boolean).length}/${meta.segCount} port segments routed — left unrouted`);
      continue;
    }
    const label = (recs.find(r => r.label) || {}).label || null;
    const joined = { edge: recs[0].edge, sections: recs.flatMap(r => r.sections), label, segCount: meta.segCount };
    _emitEdgeResult(joined, meta, resultEdges, labelPosition, isSplines);
  }
}

/**
 * Remove tiny jogs ELK leaves between two parallel segments — e.g. a port 1–3 px off the line it
 * joins, because node placement could not put the long segment exactly in line with the port.
 * The shorter of the two parallel segments moves onto the longer one's line (shifting a path end
 * along the element side by < JOG_MAX), so the jog disappears. Then duplicate and collinear
 * interior points are dropped; the two path ends are always kept.
 */
const JOG_MAX = 5;  // px
/**
 * @param {Point[]} path  [start, ...bendpoints, end] (absolute)
 * @returns {Point[]}
 */
function _straightenJogs(path) {
  const p = path.map(q => ({ x: q.x, y: q.y }));
  /** @typedef {(u: Point, v: Point) => boolean} PointTest */
  /** @type {(u: Point, v: Point) => number} */
  const len  = (u, v) => Math.abs(u.x - v.x) + Math.abs(u.y - v.y);
  /** @type {PointTest} */
  const horz = (u, v) => Math.abs(u.y - v.y) < 0.5 && Math.abs(u.x - v.x) >= 0.5;
  /** @type {PointTest} */
  const vert = (u, v) => Math.abs(u.x - v.x) < 0.5 && Math.abs(u.y - v.y) >= 0.5;
  /** @type {[PointTest, PointTest, "x" | "y"][]} */
  const axes = [[horz, vert, "y"], [vert, horz, "x"]];
  for (let i = 1; i + 2 < p.length; i++) {
    const a = p[i - 1], b = p[i], c = p[i + 1], d = p[i + 2];
    for (const [par, perp, k] of axes) {
      if (!(par(a, b) && perp(b, c) && par(c, d) && len(b, c) < JOG_MAX)) continue;
      if (len(a, b) <= len(c, d)) a[k] = b[k] = c[k];
      else                        c[k] = d[k] = b[k];
    }
  }
  /** @type {Point[]} */
  const out = [];
  p.forEach((q, i) => {
    const prev = out[out.length - 1];
    if (prev && len(prev, q) < 0.5) { if (i === p.length - 1) out[out.length - 1] = q; return; }
    out.push(q);
  });
  for (let i = out.length - 2; i >= 1; i--) {
    const a = out[i - 1], b = out[i], c = out[i + 1];
    const collinear = (Math.abs(a.x - b.x) < 0.5 && Math.abs(b.x - c.x) < 0.5)
                   || (Math.abs(a.y - b.y) < 0.5 && Math.abs(b.y - c.y) < 0.5);
    if (collinear) out.splice(i, 1);
  }
  return out;
}

/**
 * Turn one collected edge (absolute sections) into a LayoutResult edge.
 * @param {CollectedEdge}            rec
 * @param {ElkEdgeMeta | undefined}  meta    edgeMeta entry (lifted or segment) — restores the original endpoints
 * @param {LayoutResultEdge[]}       resultEdges  filled
 * @param {string}                   labelPosition
 * @param {boolean}                  isSplines
 */
function _emitEdgeResult(rec, meta, resultEdges, labelPosition, isSplines) {
  const { edge, sections } = rec;
  const originalId = edge._archiRelId || edge.id;
  const first = sections[0], last = sections[sections.length - 1];
  const rnd = (/** @type {Point} */ p) => ({ x: Math.round(p.x), y: Math.round(p.y) });

  // Collect bendpoints from ALL sections. INCLUDE_CHILDREN may produce one section per hierarchy
  // level crossing, and hierarchical-port segments are joined here as consecutive sections.
  // Junctions between sections become bendpoints, except where the path runs straight through.
  /** @type {Point[]} */
  let bps = [];
  /** @type {Set<number>} */
  const junctions = new Set();
  for (let si = 0; si < sections.length; si++) {
    const sec = sections[si];
    if (si > 0) {
      const prev = sections[si - 1].endPoint, cur = sec.startPoint;
      junctions.add(bps.length); bps.push(rnd(prev));
      if (Math.abs(cur.x - prev.x) > 0.5 || Math.abs(cur.y - prev.y) > 0.5) { junctions.add(bps.length); bps.push(rnd(cur)); }
    }
    if (isSplines) bps.push(..._sampleSplineSection(sec, SPLINE_SAMPLE_POINTS));
    else           bps.push(...sec.bendPoints.map(rnd));
  }
  if (junctions.size) {
    /** @type {Point[]} */
    const kept = [];
    for (let i = 0; i < bps.length; i++) {
      const a = kept.length ? kept[kept.length - 1] : rnd(first.startPoint);
      const b = i + 1 < bps.length ? bps[i + 1] : rnd(last.endPoint);
      const p = bps[i];
      const straight = (Math.abs(a.x - p.x) <= 1 && Math.abs(p.x - b.x) <= 1)
                    || (Math.abs(a.y - p.y) <= 1 && Math.abs(p.y - b.y) <= 1);
      if (junctions.has(i) && straight) continue;
      kept.push(p);
    }
    bps = kept;
  }

  // Straighten tiny jogs (orthogonal / polyline only). The path ends may shift along the element
  // side by less than JOG_MAX, so the ports below are taken from the straightened path.
  let pathStart = rnd(first.startPoint), pathEnd = rnd(last.endPoint);
  if (!isSplines) {
    const path = _straightenJogs([pathStart, ...bps, pathEnd]);
    pathStart = path[0]; pathEnd = path[path.length - 1]; bps = path.slice(1, -1);
  }

  // If the layout computed a straight segment (no bendpoints), inject the edge
  // midpoint so Archi routes along the layout's spacing rather than through the
  // element centres.
  if (bps.length === 0) {
    bps.push(rnd({ x: (pathStart.x + pathEnd.x) / 2, y: (pathStart.y + pathEnd.y) / 2 }));
  }

  // Section start/end (absolute) — the physical exit/entry ports of the connection.
  // Passed to the writer so extra label-alignment bendpoints stay outside elements.
  // A spanning-tree edge laid out against its relation's direction (Radial) is turned back.
  const flip    = !!edge._treeReversed && !meta;
  const srcPort = flip ? pathEnd : pathStart;
  const tgtPort = flip ? pathStart : pathEnd;
  if (flip) bps = bps.slice().reverse();

  // Label position — use ELK's computed result when available (connectionLabelSpacing mode),
  // otherwise derive from geometry.
  let { labelX, labelY } = labelPoint(first.startPoint, last.endPoint, bps, labelPosition);
  if (rec.label) { labelX = Math.round(rec.label.x); labelY = Math.round(rec.label.y); }

  resultEdges.push({
    id:            originalId,
    conceptId:     originalId,
    sourceId:      meta ? meta.origSrcId : (flip ? edge.targets[0] : edge.sources[0]),
    targetId:      meta ? meta.origTgtId : (flip ? edge.sources[0] : edge.targets[0]),
    bendpoints:    bps,
    srcPort,
    tgtPort,
    labelX,
    labelY,
    isStraight:    false,
  });
}

// ── Settings outside the dialog ───────────────────────────────────────────────

/**
 * ELK options the dialog sets, root and container scope together, each with its param.
 * @param {string}          algorithm
 * @param {EffectiveParams} params
 * @returns {Record<string, string>}
 */
function dialogSettings(algorithm, params) {
  return Object.assign({}, dialogKeys(algorithm, params, ROOT_MAPPING),
    dialogKeys(params.containerAlgorithm || algorithm, params, CONTAINER_MAPPING));
}

/**
 * One finding per engineParams.ELK key. Option ids and targets come from the bundled ELK's registry;
 * ELK also accepts the end of an id ("elk.spacing.nodeNode"). Not used: an unknown id; an option
 * ELK reads only on connections, ports or labels (the preset reaches the root, containers and
 * leaves); an option of another ELK algorithm wherever ELK reads it (its id names the algorithm,
 * e.g. elk.layered.* in a Pack run); an option the adapter sets after the preset wherever ELK reads
 * it; a second key for one option.
 * Other options are not checked against the algorithm: ELK declares fewer than an algorithm reads
 * (Stress uses elk.padding and elk.aspectRatio undeclared).
 * @param {MaskedPreset} preset
 * @returns {SettingFinding[]}
 */
function checkEngineParams(preset) {
  const elkParams = preset.engineParams.ELK || {};
  if (!Object.keys(elkParams).length) return [];
  const meta = _loadELK().metadata();
  /** @type {Record<string, string[]>} */
  const targets = {};
  for (const o of meta.options) targets[o.id] = o.targets || [];
  const ids = Object.keys(targets);
  const idOf = (/** @type {string} */ key) => ids.find(id => id === key || id.endsWith("." + key));
  // By option id; a later key for the same option wins, as in ELK.
  const byId = (/** @type {Record<string, unknown>} */ opts) => {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [key, value] of Object.entries(opts)) out[idOf(key) || key] = value;
    return out;
  };
  const p = preset.params;
  const containerAlgorithm = p.containerAlgorithm || preset.algorithm;
  const algorithms = new Set(meta.algorithms.map(a => a.id.split(".").pop()));
  const usedBy = preset.algorithm + (containerAlgorithm !== preset.algorithm ? ` or ${containerAlgorithm} inside` : "");

  // Root, container and leaf options of a run with containers, the preset included, with the
  // targets ELK reads in each and the algorithms that read them (a leaf: its parent's).
  const eo = _engineOptions(preset.algorithm, p, elkParams, true);
  const scopes = [
    { reads: ["PARENTS"],          by: [eo.algorithmId],
      options: byId(eo.root) },
    { reads: ["PARENTS", "NODES"], by: [eo.containerAlgorithmId],
      options: byId(_elkNode("", { width: p.alignWidthSameType ? 1 : 0, height: 0 }, true, eo).layoutOptions || {}) },
    { reads: ["NODES"],            by: [eo.algorithmId, eo.containerAlgorithmId],
      options: byId(_elkNode("", { width: 1, height: 1 }, false, eo).layoutOptions || {}) },
  ];
  /** @type {Record<string, unknown>} */
  const defaults = Object.fromEntries(ids.map(id => [id, undefined]));
  Object.assign(defaults, byId(DEFAULT_ELK_PARAMS));
  const dialog  = /** @type {Record<string, string>} */ (byId(dialogSettings(preset.algorithm, p)));
  const current = byId(Object.assign({},
    applyParams(preset.algorithm, p, ROOT_MAPPING), applyParams(containerAlgorithm, p, CONTAINER_MAPPING)));
  const keys = Object.keys(elkParams);

  return Object.entries(elkParams).map(([key, value], i) => {
    const finding = (/** @type {string | null} */ problem) => ({ key, value, problem });
    const id = idOf(key);
    if (!id) return finding(SETTING_UNKNOWN);
    const later = keys.slice(i + 1).find(k => idOf(k) === id);
    if (later) return finding(`the same ELK option as "${later}", which wins — remove one`);
    const targeted = scopes.filter(scope => scope.reads.some(t => targets[id].includes(t)));
    if (!targeted.length) return finding(`ELK reads it on connections, ports or labels only — not used, remove`);
    const part = id.split(".");
    const owner = part.length > 4 && algorithms.has(part[3]) ? part[3] : null;   // an algorithm's own option
    const read = owner ? targeted.filter(scope => scope.by.includes(owner)) : targeted;
    if (!read.length) return finding(`an ELK ${owner} option — not used by ${usedBy}, remove`);
    if (read.every(scope => scope.options[id] !== String(value))) return finding("set by the adapter itself — not used, remove");
    return { key, value, ...settingProblem(id, value, defaults, dialog, current) };
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout, checkEngineParams, dialogSettings, ENGINE_PARAMS };
}
