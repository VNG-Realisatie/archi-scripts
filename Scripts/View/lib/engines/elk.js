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
const { selfLoopResult, byTypeAndName, alignWidthsByLevel } = EngineUtils;

/**
 * ELK graph objects as this adapter builds them. ELK ignores the `_` fields and returns them
 * unchanged on the laid-out graph.
 * @typedef {object} ElkWorkNode
 * @property {string}           id
 * @property {string}           _name
 * @property {string}           _type
 * @property {number}           [width]      absent on containers: ELK sizes them
 * @property {number}           [height]
 * @property {number}           [x]          set by ELK
 * @property {number}           [y]
 * @property {number}           [_minWidth]  alignWidthSameType pass 2: container width floor
 * @property {number}           [_flowPad]   Tree layer distance: extra padding on both flow sides
 * @property {ElkWorkNode[]}    children
 * @property {ElkWorkEdge[]}    edges
 * @property {ElkPort[]}        [ports]
 * @property {ElkLayoutOptions} [layoutOptions]
 *
 * @typedef {object} ElkWorkEdge
 * @property {string}           id
 * @property {string | null}    _archiRelId  model relation id (null for a spanning-tree helper edge)
 * @property {string}           _relName
 * @property {string[]}         sources
 * @property {string[]}         targets
 * @property {Record<string, unknown>} [properties]
 * @property {ElkWorkLabel[]}   [labels]
 * @property {ElkEdgeSection[]} [sections]   set by ELK
 * @property {boolean}          [_isStraight]
 *
 * @typedef {ElkLabel & { id: string }} ElkWorkLabel
 * @typedef {{ id: string, layoutOptions: ElkLayoutOptions, children: ElkWorkNode[], edges: ElkWorkEdge[], width?: number, height?: number }} ElkRoot
 * @typedef {{ origSrcId: string, origTgtId: string, segOf?: string, segIdx?: number, segCount?: number }} ElkEdgeMeta
 * @typedef {{ startPoint: Point, endPoint: Point, bendPoints: Point[] }} AbsSection
 * @typedef {{ edge: ElkWorkEdge, sections: AbsSection[], label: Point | null, segCount?: number }} CollectedEdge
 * @typedef {(msg: string) => void} Logger
 */

// ── Engine-specific parameter mapping ────────────────────────────────────────
// Maps GUI param names to ELK layout option keys/values.
// Each algorithm entry has two scopes:
//   root:      applied to rootLayoutOptions (the ELK root graph)
//   container: applied to each container node's layoutOptions in _buildELKGraph
//
// Parameters handled outside PARAM_MAPPING:
//   maxWidth / aspectRatio → view-size calibration in layout() (re-runs ELK with a searched
//                           elk.aspectRatio; see _fitViewSize)
//   nestingRules          → graph structure (parentMap)
//   sortContainers        → node sort order via engine-utils.sortedNodes (ELK: _sortNodeChildren)
//   alignWidthSameType    → two-pass layout; pass 1 measures natural widths, then every box is
//                           aligned by nesting level via engine-utils.alignWidthsByLevel
//                           (leaves get exact width, containers a MINIMUM_SIZE floor)

/** @type {Record<string, string>} */
const ELK_DIRECTION = {
  "Right": "RIGHT",
  "Left":  "LEFT",
  "Down":  "DOWN",
  "Up":    "UP",
};

const MIN_NODE_SIZE = 8;  // fallback for degenerate ELK output (zero/undefined dimension) — see _collectNodePositions

/** @type {Record<string, string | number>} */
const DEFAULT_ELK_PARAMS = {
  "elk.layered.cycleBreaking.strategy":           "GREEDY",
  "elk.layered.edgeRouting.selfLoopDistribution": "EQUALLY",
  "elk.layered.edgeRouting.selfLoopOrdering":     "SEQUENCED",
  "elk.layered.crossingMinimization.strategy":    "LAYER_SWEEP",  // default — iterative layer-by-layer sweeps; INTERACTIVE keeps existing order (needs prior positions). NB: an invalid value is silently ignored by ELK
  // Greedy switch post-pass (swaps adjacent nodes while crossings drop) is by default only active
  // for graphs < 40 nodes; 0 = always active. Thoroughness = number of random sweep restarts (default 7).
  // Measured on 60–80 node test graphs: ~15% fewer crossings, ~4× layout time (still ~1 s).
  "elk.layered.crossingMinimization.greedySwitch.activationThreshold": 0,
  // 25: on 7 test views (Crossing containers) as few or fewer crossings than 50; 15 or lower
  // leaves extra crossings. Layout time in Archi (interpreted GraalJS) ~45% less than 50.
  "elk.layered.thoroughness":                     25,
  "elk.layered.considerModelOrder.strategy":      "NONE",
  "elk.layered.feedbackEdges":                    "true",
  "elk.spacing.nodeSelfLoop":                     40,
  // elk.layered.nodePlacement.strategy is intentionally absent: driven by nodePlacement via PARAM_MAPPING.
  // elk.spacing.edgeEdge, elk.spacing.edgeNode, elk.layered.spacing.edgeEdgeBetweenLayers,
  // elk.layered.spacing.edgeNodeBetweenLayers are intentionally absent: they are driven by
  // connectionSpacing / connectionElementSpacing via PARAM_MAPPING. DEFAULT_ELK_PARAMS is
  // merged after rootEngineOpts and would overwrite, so these must not appear here.
};

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
// which layered / mrtree / force lay out separately and pack with spacing.componentComponent.
const _ELEM_SPACING  = (/** @type {number} */ v) => ({ "elk.spacing.nodeNode": String(v), "elk.spacing.componentComponent": String(v) });
// Centred:        NETWORK_SIMPLEX — minimises total connection length, which centres an element
//                 between its neighbours; measured on nested views: up to ~30% shorter connections
//                 and a smaller view, a few more bends, same crossings.
// Straight lines: BRANDES_KOEPF — aligns each element with one neighbour, from one of four corners
//                 (fixedAlignment NONE: the smallest result), so the layout leans to that corner.
const _NODE_PLACEMENT = (/** @type {string} */ v) => ({ "elk.layered.nodePlacement.strategy": v === "Straight lines" ? "BRANDES_KOEPF" : "NETWORK_SIMPLEX" });
const _LAYER_SPACING = (/** @type {number} */ v) => ({ "elk.layered.spacing.nodeNodeBetweenLayers": String(v) });
const _PAD_DIAGRAM   = (/** @type {number} */ v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` });
const _PAD_CONTAINER = (/** @type {number} */ v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` });

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
  "elk.spacing.nodeSelfLoop":                  String(v),
});
// Label placement only; "elk.edgeLabels.inline" is a per-label option, set on each label in layout().
const _CONN_LABEL_SPACING = (/** @type {boolean} */ v) => v ? {
  // "elk.layered.edgeLabels.centerLabelPlacementStrategy": "MEDIAN_LAYER",
  "elk.layered.edgeLabels.centerLabelPlacementStrategy": "CENTER",
} : {};

// Shared base objects — spread into root/container; padding and aspectRatio are added per scope.
const _LAYERED_BASE = {
  direction:                _DIRECTION,
  nodePlacement:            _NODE_PLACEMENT,
  routing:                  _LAYERED_ROUTING,
  connectionLabelSpacing:         _CONN_LABEL_SPACING,
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

/** @type {Record<string, { root: Record<string, ParamMapper>, container: Record<string, ParamMapper> }>} */
const PARAM_MAPPING = {
  Layered: {
    root:      { ..._LAYERED_BASE, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
    container: { ..._LAYERED_BASE, aspectRatio: _AR,                                padding: _PAD_CONTAINER },
  },

  Tree: {
    root:      { ..._TREE_BASE, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
    container: { ..._TREE_BASE, aspectRatio: _AR,                                padding: _PAD_CONTAINER },
  },

  Force: {
    root:      { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
    container: { elementSpacing: _ELEM_SPACING,                                    padding: _PAD_CONTAINER },
  },

  Stress: {
    root:      { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
    container: { elementSpacing: _ELEM_SPACING,                                    padding: _PAD_CONTAINER },
  },

  Radial: {
    root:      { layerSpacing: (/** @type {number} */ v) => ({ "elk.radial.radius": String(v) }), elementSpacing: _ELEM_SPACING, diagramPadding: _PAD_DIAGRAM },
    container: {                                                              elementSpacing: _ELEM_SPACING, padding: _PAD_CONTAINER },
  },

  Grid: {
    root:      { elementSpacing: _ELEM_SPACING, aspectRatio: _AR, diagramPadding: _PAD_DIAGRAM },
    container: { elementSpacing: _ELEM_SPACING, aspectRatio: _AR,                                padding: _PAD_CONTAINER },
  },

  // rectpacking tight-packing options:
  //   packing.strategy                       COMPACTION (default) — row compaction; alternatives: SIMPLE
  //   packing.compaction.iterations          passes of row compaction; more = tighter (default 1)
  //   packing.compaction.rowHeightReevaluation re-evaluates row height after each move (default false)
  //   orderBySize                            sort nodes largest-first before placement (default false)
  //     → set conditionally in _buildELKGraph: only when sortContainers is off (they conflict)
  //   whiteSpaceElimination.strategy         post-pass to fill gaps; NONE = off (default)
  //   widthApproximation.optimizationGoal    MAX_SCALE_DRIVEN (default) — maximises use of target width
  //     → ASPECT_RATIO_DRIVEN whenever an aspect ratio is set (_AR_PACK)
  Pack: {
    root: {
      // maxWidth is NOT mapped to rectpacking.widthApproximation.targetWidth: with
      // SEPARATE_CHILDREN the container boxes are pre-sized bottom-up, so a target narrower
      // than the widest container is ignored and a too-narrow target can yield zero-width
      // nodes. maxWidth goes through view-size calibration instead (_fitViewSize).
      aspectRatio:    _AR_PACK,
      elementSpacing: (v) => ({
        "elk.spacing.nodeNode": String(v),
        "elk.rectpacking.packing.compaction.iterations": "5",
        // "elk.rectpacking.packing.compaction.rowHeightReevaluation": "true",
        // "elk.rectpacking.widthApproximation.optimizationGoal": "AREA_DRIVEN",
        // NB: whiteSpaceElimination EQUAL_BETWEEN_STRUCTURES is intentionally NOT used — it
        // distributes whitespace between nodes (widening boxes, offsetting content negative)
        // which pushed children outside their container's left edge. Compaction handles tightening.
      }),
      diagramPadding: _PAD_DIAGRAM,
    },
    container: {
      // aspectRatio propagated to containers so their internal layout matches the root AR,
      // producing a more consistent overall shape.
      aspectRatio:    _AR_PACK,
      elementSpacing: (v) => ({
        "elk.spacing.nodeNode": String(v),
        "elk.rectpacking.packing.compaction.iterations": "5",
        "elk.rectpacking.trybox": "true",  // trybox is a lightweight pre-compaction pass that reduces the number of moves needed in compaction, improving performance with minimal impact on tightness
        // "elk.rectpacking.packing.compaction.rowHeightReevaluation": "true",
        // "elk.rectpacking.widthApproximation.optimizationGoal": "AREA_DRIVEN",
      }),
      padding:        _PAD_CONTAINER,
    },
  },
};

/**
 * Map GUI params to ELK layout options for a given scope.
 * @param {string}                  algName   algorithm name (key in PARAM_MAPPING)
 * @param {EffectiveParams}         opts      graph.options
 * @param {"root" | "container"}    scope
 * @returns {Record<string, string>}          ELK layout options object
 */
function _mapParamsScoped(algName, opts, scope) {
  const entry = PARAM_MAPPING[algName];
  if (!entry || !entry[scope]) return {};
  /** @type {Record<string, string>} */
  const result = {};
  for (const [key, fn] of Object.entries(entry[scope])) {
    const value = /** @type {Record<string, unknown>} */ (opts)[key];   // Cast: key comes from the mapping, whose keys are param names.
    if (value !== undefined) Object.assign(result, fn(value, opts));
  }
  return result;
}

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
 * @param {LayoutGraph} graph  — { nodes, edges, options, algorithm, alignWidthSameType, sortContainers }
 * @returns {LayoutResult}     — { nodes, edges, viewWidth, viewHeight }
 */
function layout(graph) {
  const k = _fitViewSize(graph);
  if (k === null) return _layoutOnce(graph);
  return _layoutOnce(Object.assign({}, graph, { options: Object.assign({}, graph.options, { aspectRatio: k }) }));
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
const VIEW_SIZE_TOLERANCE = 0.03;  // relative aspect-ratio error accepted as a match
const VIEW_SIZE_MAX_RUNS  = 10;    // measuring ELK runs per search, before the final run

/**
 * Search the elk.aspectRatio that meets the active view-size target.
 * @param {LayoutGraph} graph
 * @returns {number|null}  ratio for the final run; null = no target (or natural layout fits)
 */
function _fitViewSize(graph) {
  const o = graph.options;
  /** @typedef {{ width: number, height: number, k: number }} ViewSizeRun */
  const target = (o.aspectRatio || 0) > 0 ? "aspectRatio" : (o.maxWidth || 0) > 0 ? "maxWidth" : null;
  if (!target) return null;
  // Cast: the target is set only when its param is > 0.
  const goal = /** @type {number} */ (target === "aspectRatio" ? o.aspectRatio : o.maxWidth);
  const log = (/** @type {string} */ msg) => console.log("  " + msg);
  const t0 = Date.now();
  const kMax = ALGORITHMS[graph.algorithm].engineAlgorithmId === "rectpacking" ? PACK_ASPECT_RATIO_MAX : VIEW_SIZE_K_MAX;
  let runs = 0;
  const measure = (/** @type {number} */ k) => {
    runs++;
    const m = /** @type {ViewSizeRun} */ (_layoutOnce(Object.assign({}, graph, { options: Object.assign({}, o, { aspectRatio: k }) }), true));   // Cast: k is added below
    m.k = k;
    return m;
  };
  const size = (/** @type {ViewSizeRun} */ m) => `${m.width}×${m.height} px`;
  const done = (/** @type {string} */ msg) => log(`View size: ${msg}  (${runs} layout runs, ${Date.now() - t0} ms)`);

  if (target === "maxWidth") {
    const natural = measure(0);
    if (natural.width <= goal) { done(`max width ${o.maxWidth} px — natural layout fits (${size(natural)})`); return null; }
    let lo = VIEW_SIZE_K_MIN, hi = kMax;
    let best = measure(lo);
    if (best.width > goal) {
      done(`⚠ max width ${o.maxWidth} px not reachable — narrowest layout ${size(best)} (connection chains or the widest container set the minimum)`);
      return lo;
    }
    while (runs < VIEW_SIZE_MAX_RUNS && hi / lo > 1.02) {
      const k = Math.sqrt(lo * hi), m = measure(k);
      if (m.width <= goal) { lo = k; if (m.width > best.width) best = m; }
      else hi = k;
    }
    done(`max width ${o.maxWidth} px → ${size(best)}  (natural ${size(natural)}, elk.aspectRatio ${best.k.toFixed(2)})`);
    return best.k;
  }

  // aspectRatio: bisection on k; the view ratio grows with k (in steps — row counts are integers).
  const ratio = (/** @type {ViewSizeRun} */ m) => m.width / m.height;
  const err   = (/** @type {ViewSizeRun} */ m) => Math.abs(Math.log(ratio(m) / goal));
  let best = measure(goal);
  const report = () => done(`aspect ratio ${goal} → ${ratio(best).toFixed(2)}, ${size(best)}  (elk.aspectRatio ${best.k.toFixed(2)})`);
  if (err(best) <= VIEW_SIZE_TOLERANCE) { report(); return best.k; }
  const first = best, up = ratio(first) < goal;
  const edge    = up ? kMax : VIEW_SIZE_K_MIN;
  const extreme = first.k === edge ? first : measure(edge);
  if (err(extreme) < err(best)) best = extreme;
  // The extreme is still on the same side of the goal: no k gets closer than it.
  if ((ratio(extreme) < goal) === up) {
    const still = extreme !== first && extreme.width === first.width && extreme.height === first.height;
    done(`⚠ aspect ratio ${goal} not reachable — ${still ? "layout does not respond" : "closest"}: ${ratio(best).toFixed(2)}, ${size(best)}`);
    return best.k;
  }
  let lo = up ? Math.min(goal, kMax) : VIEW_SIZE_K_MIN, hi = up ? kMax : goal;
  while (runs < VIEW_SIZE_MAX_RUNS && err(best) > VIEW_SIZE_TOLERANCE && hi / lo > 1.02) {
    const k = Math.sqrt(lo * hi), m = measure(k);
    if (err(m) < err(best)) best = m;
    if (ratio(m) < goal) lo = k; else hi = k;
  }
  report();
  return best.k;
}

/**
 * @overload
 * @param {LayoutGraph} graph
 * @param {true} measureOnly
 * @returns {{ width: number, height: number }}
 */
/**
 * @overload
 * @param {LayoutGraph} graph
 * @param {false} [measureOnly]
 * @returns {LayoutResult}
 */
/**
 * One ELK layout run.
 * @param {LayoutGraph} graph
 * @param {boolean} [measureOnly]  quiet run that returns only the element bounding box { width, height }
 * @returns {LayoutResult|{width:number,height:number}}
 */
function _layoutOnce(graph, measureOnly) {
  const elk = _loadELK();
  const alg = ALGORITHMS[graph.algorithm];
  if (!alg) throw `ELK: unknown algorithm "${graph.algorithm}"`;

  // Map GUI params to ELK root options (SPLINES CONSERVATIVE mode inlined in _LAYERED_ROUTING)
  const rootEngineOpts  = _mapParamsScoped(graph.algorithm, graph.options, "root");
  // Reserve label space (Layered): every connection gets a label box in its own label layer, so
  // ELK's layer spacing becomes the element ↔ label distance (= connectionSpacing) — see _labelBoxes.
  const reserveLabels = graph.options.connectionLabelSpacing && alg.engineAlgorithmId === "layered";
  if (reserveLabels)
    rootEngineOpts["elk.layered.spacing.nodeNodeBetweenLayers"] = String(graph.options.connectionSpacing || 0);
  const elkEngineParams = Object.fromEntries(
    Object.entries(Object.assign({}, DEFAULT_ELK_PARAMS, (graph.engineParams && graph.engineParams.ELK) || {})).map(([k, v]) => [k, String(v)])
  );
  // FIXED_SIDE portConstraints locks cross-container ports to EAST/WEST sides, causing edges
  // to route around container sides instead of through the top/bottom in UP/DOWN layouts.
  const _isVertical = graph.options.direction === "Up" || graph.options.direction === "Down";
  if (_isVertical) delete elkEngineParams["org.eclipse.elk.portConstraints"];
  const layoutOptions = Object.assign({ "elk.algorithm": alg.engineAlgorithmId }, rootEngineOpts, elkEngineParams);

  // Build ELK-internal data structures
  /** @type {Record<string, ElkWorkNode>} */
  const nodeMap     = {};
  /** @type {Record<string, string>} */
  const parentMap   = {};
  /** @type {Record<string, string[]>} */
  const occurrenceMap = {};

  for (const node of graph.nodes) {
    nodeMap[node.id] = {
      id:       node.id,
      _name:    node.label || "",
      _type:    node.elementType || "",
      width:    node.width,
      height:   node.height,
      children: [],
      edges:    [],
    };
    occurrenceMap[node.id] = [node.id];
  }
  for (const node of graph.nodes) {
    if (node.parent) parentMap[node.id] = node.parent;
  }

  // Connection-label sizing uses the same text estimate and tuning as label-based node sizing
  // (defaults + preset engineParams.layout).
  /** @type {LabelSizing} */
  const lp = Object.assign({}, Defs.LABEL_SIZING_DEFAULTS, graph.engineParams && graph.engineParams.layout);
  /** @type {ElkWorkEdge[]} */
  const edgeList = [];
  /** @type {LayoutEdge[]} */
  const selfLoops = [];
  for (const edge of graph.edges) {
    if (!nodeMap[edge.source] || !nodeMap[edge.target]) continue;
    if (edge.source === edge.target && !alg.supportsSelfLoops) {
      // Algorithm does not route self-loops — collect for synthesis by the writer.
      selfLoops.push(edge);
      continue;
    }
    /** @type {ElkWorkEdge} */
    const entry = {
      id:          edge.id,
      _archiRelId: edge.conceptId || edge.id,
      _relName:    edge.label || "",
      sources:     [edge.source],
      targets:     [edge.target],
    };
    if (edge.weight) entry.properties = { "elk.priority": edge.weight };
    if (reserveLabels) entry.labels = [_labelBox(edge, lp, graph.options)];
    edgeList.push(entry);
  }

  // All layout-step output is indented under the "Layout:" header logged by the orchestrator.
  /** @type {Logger} */
  const log      = measureOnly ? () => {} : msg => console.log("  " + msg);

  // ── ELK config log (permanent) ────────────────────────────────────────────────
  {
    const containerAlgName = graph.options.containerAlgorithm;
    const containerAlgoId  = (containerAlgName && ALGORITHMS[containerAlgName])
      ? ALGORITHMS[containerAlgName].engineAlgorithmId
      : alg.engineAlgorithmId;
    const hasNesting = Object.keys(parentMap).length > 0;
    const hierMode   = !hasNesting ? "n/a (no nesting)"
      : graph.options.connectionsMode === "Crossing containers" ? "INCLUDE_CHILDREN" : "SEPARATE_CHILDREN";
    const rootRouting = rootEngineOpts["elk.edgeRouting"] || "(engine default)";
    log(`ELK config:  root=${graph.algorithm}(${alg.engineAlgorithmId})  routing=${rootRouting}  hierarchy=${hierMode}` +
        (hasNesting ? `  container=${containerAlgName || graph.algorithm}(${containerAlgoId})` : ""));
    log(`ELK spacing:  connSpacing(edgeEdge=${layoutOptions["elk.spacing.edgeEdge"]}, edgeEdgeBetweenLayers=${layoutOptions["elk.layered.spacing.edgeEdgeBetweenLayers"] || "(default)"})` +
        `  connElemSpacing(edgeNode=${layoutOptions["elk.spacing.edgeNode"]}, edgeNodeBetweenLayers=${layoutOptions["elk.layered.spacing.edgeNodeBetweenLayers"] || "(default)"})`);
    log(`ELK layoutOptions: ${JSON.stringify(layoutOptions)}`);
  }

  // Two-pass layout for alignWidthSameType (width alignment by nesting level):
  // pass 1 renders every box at its natural width → compute a per-level target width
  // (engine-utils.alignWidthsByLevel) → pass 2 with leaves set to that width and
  // containers floored by it (MINIMUM_SIZE), so same-level boxes line up.
  /** @type {Record<string, number> | null} */
  let alignTargets = null;
  /** @type {Set<string> | null} */
  let alignContainerIds = null;
  /** @type {Record<string, number> | null} */
  let alignPass1Widths = null;
  if (graph.alignWidthSameType && Object.values(parentMap).length > 0) {
    const containerIds = new Set(Object.values(parentMap));
    /** @type {Record<string, { width?: number, height?: number }>} */
    const origSizes = {};
    for (const id of Object.keys(nodeMap)) {
      if (!containerIds.has(id))  // leaf nodes only — containers are auto-sized by ELK in both passes
        origSizes[id] = { width: nodeMap[id].width, height: nodeMap[id].height };
    }

    const { elkGraph: pass1ElkGraph } = _buildELKGraph(layoutOptions, nodeMap, edgeList, parentMap, graph);
    log("Calculating layout (pass 1 — measure natural widths)...");
    const t1 = Date.now();
    const pass1Layouted = elk.layout(pass1ElkGraph);
    log(`ELK pass 1: ${Date.now() - t1} ms`);

    // Per-level target widths from pass-1 rendered sizes. Apply as an exact width on
    // leaves, and a min-size floor on containers (never shrink below content).
    const renderedWidths = _collectRenderedWidths(pass1Layouted);
    _resetNodesForPass2(nodeMap, origSizes, containerIds);
    // One nesting level adds left+right container padding to the width (label clearance is top-only).
    const ring = 2 * (graph.options.padding || 0);
    const targetWidths = alignWidthsByLevel(Object.values(nodeMap), parentMap, renderedWidths, ring, log);
    for (const id of Object.keys(nodeMap)) {
      const w = targetWidths[id];
      if (!(w > 0)) continue;
      if (containerIds.has(id)) nodeMap[id]._minWidth = w;  // container: min-size floor in _buildELKGraph
      else                      nodeMap[id].width    = w;   // leaf: exact width
    }
    alignTargets = targetWidths; alignContainerIds = containerIds; alignPass1Widths = renderedWidths;
    log("Calculating layout (pass 2 — widths aligned by level)...");
  } else {
    log("Calculating layout...");
  }

  // Tree layer distance: mrtree has one spacing (elk.spacing.nodeNode) for siblings and levels
  // alike. Every root-level box is widened in the flow direction by layerSpacing − elementSpacing
  // (containers: extra padding on both flow sides); after layout each box gets its own size back,
  // centred in the widened one (positions only), and connection ends move onto the real sides.
  const treeExtra = alg.engineAlgorithmId === "mrtree"
    ? Math.max(0, (graph.options.layerSpacing || 0) - (graph.options.elementSpacing || 0)) : 0;
  if (treeExtra > 0) {
    const half = treeExtra / 2;
    for (const node of Object.values(nodeMap)) {
      if (parentMap[node.id]) continue;
      if (node.children && node.children.length > 0) node._flowPad = half;   // container: _buildELKGraph
      else if (_isVertical) node.height = /** @type {number} */ (node.height) + treeExtra;   // Cast: leaves have a size
      else                  node.width  = /** @type {number} */ (node.width)  + treeExtra;
    }
  }

  // ELK Radial requires a spanning tree (no cycles). Convert here so c2c terminates.
  const processedEdgeList = graph.algorithm === "Radial" ? _spanningTree(nodeMap, edgeList) : edgeList;
  const { elkGraph, edgeMeta } = _buildELKGraph(layoutOptions, nodeMap, processedEdgeList, parentMap, graph);
  const tLayout = Date.now();
  const layouted = elk.layout(elkGraph);
  log(`ELK result: width=${Math.round(layouted.width || 0)} height=${Math.round(layouted.height || 0)}  (${Date.now() - tLayout} ms)`);

  // Align-by-level diagnostics: compare each box's target to its final rendered width.
  // A container final < target means the MINIMUM_SIZE floor was not honoured by the engine.
  if (alignTargets) {
    const finalWidths = _collectRenderedWidths(layouted);
    log("[alignByLevel] target vs final rendered width — mismatches:");
    for (const id of Object.keys(alignTargets)) {
      const tgt = alignTargets[id]; if (!(tgt > 0)) continue;
      const fin = finalWidths[id] || 0;
      const isC = /** @type {Set<string>} */ (alignContainerIds).has(id);   // Casts: set together with alignTargets
      const bad = isC ? fin + 0.5 < tgt : Math.abs(fin - tgt) > 0.5;  // leaf must equal; container must be ≥
      if (!bad) continue;
      const flag = bad ? "  ⚠ MISMATCH" : "";
      const name = (nodeMap[id] && nodeMap[id]._name) || id;
      log(`    ${isC ? "container" : "leaf     "} pass1=${/** @type {Record<string, number>} */ (alignPass1Widths)[id] || 0} target=${tgt} final=${Math.round(fin)}${flag}  "${name}"`);
    }
  }

  // Extract LayoutResult
  /** @type {LayoutResultNode[]} */
  const resultNodes = [];
  /** @type {LayoutResultEdge[]} */
  const resultEdges = [];

  // Flatten nodes with absolute positions
  _collectNodePositions(layouted, 0, 0, resultNodes);

  // Center-snap columns to a global grid (position-only; grows containers, never resizes
  // leaves). Aligns leaf columns top-to-bottom across the view. Gated on its own toggle.
  const _hasContainers = Object.keys(parentMap).length > 0;
  if (graph.snapColumnsToGrid && _hasContainers) {
    /** @type {Record<string, string>} */
    const nameById = {};
    for (const id of Object.keys(nodeMap)) nameById[id] = nodeMap[id]._name || id;
    _snapColumnsToGrid(resultNodes, graph.options, nameById, log);
  }

  // Tree layer distance: connections are collected against the widened boxes ELK placed.
  const elkBoxes = treeExtra > 0 ? resultNodes.map(n => Object.assign({}, n)) : resultNodes;
  if (treeExtra > 0) _narrowTreeBoxes(resultNodes, treeExtra, _isVertical);

  if (measureOnly) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of resultNodes) {
      x0 = Math.min(x0, n.x);           y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height);
    }
    return resultNodes.length ? { width: Math.round(x1 - x0), height: Math.round(y1 - y0) } : { width: 0, height: 0 };
  }

  // Collect edges
  const isSplines = rootEngineOpts["elk.edgeRouting"] === "SPLINES";
  _collectEdgeResults(layouted, edgeMeta, elkBoxes, resultEdges, graph.options.labelPosition || "Middle", isSplines, log);
  if (treeExtra > 0) _clampEndsToTreeBoxes(resultEdges, resultNodes, _isVertical);
  if (alg.engineAlgorithmId === "mrtree" && graph.options.routing !== "Polyline")
    _routeTreeEdges(resultEdges, graph, _isVertical);

  // Self-loops: pass-through with empty bendpoints. Writer synthesises.
  resultEdges.push(...selfLoops.map(selfLoopResult));

  return {
    nodes:      resultNodes,
    edges:      resultEdges,
    viewWidth:  Math.ceil(layouted.width  || 0) + 20,
    viewHeight: Math.ceil(layouted.height || 0) + 20,
  };
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
    w = Math.max(...lines.map(l => EngineUtils._textWidth(l, lp.labelCharWidth))) + lp.labelHPadding;
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
 * @param {ElkLayoutOptions}            layoutOptions  root options (extended in place)
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {ElkWorkEdge[]}               edgeList
 * @param {Record<string, string>}      parentMap
 * @param {LayoutGraph}                 graph
 * @returns {{ elkGraph: ElkRoot, edgeMeta: Record<string, ElkEdgeMeta> }}
 */
function _buildELKGraph(layoutOptions, nodeMap, edgeList, parentMap, graph) {
  _attachChildren(nodeMap, parentMap);
  _sortNodeChildren(nodeMap, graph.sortContainers);
  const rootChildren = _collectRootChildren(nodeMap, parentMap, graph.sortContainers);

  // Container nodes: let ELK auto-size from children + padding.
  // containerAlgorithm param selects the ELK algorithm used inside each container.
  // connectionsMode param selects SEPARATE_CHILDREN (default) or INCLUDE_CHILDREN.
  // Scope container params to the CONTAINER algorithm (not the root) so e.g. rectpacking
  // compaction options follow the "Container layout" choice, not the root "Algorithm".
  const containerAlgName = graph.options.containerAlgorithm;
  const containerEngineOpts = _mapParamsScoped(containerAlgName || graph.algorithm, graph.options, "container");
  // Reserve label space: element ↔ label distance inside Layered containers too (see _labelBox).
  if (graph.options.connectionLabelSpacing && ALGORITHMS[graph.algorithm].engineAlgorithmId === "layered"
      && "elk.layered.spacing.nodeNodeBetweenLayers" in containerEngineOpts)
    containerEngineOpts["elk.layered.spacing.nodeNodeBetweenLayers"] = String(graph.options.connectionSpacing || 0);
  const containerAlgoId  = containerAlgName
    ? ALGORITHMS[containerAlgName].engineAlgorithmId
    : ALGORITHMS[graph.algorithm].engineAlgorithmId;
  const hierarchyMode = graph.options.connectionsMode === "Crossing containers"
    ? "INCLUDE_CHILDREN" : "SEPARATE_CHILDREN";
  const ctrEngineParams = Object.fromEntries(
    Object.entries(Object.assign({}, DEFAULT_ELK_PARAMS, (graph.engineParams && graph.engineParams.ELK) || {})).map(([k, v]) => [k, String(v)])
  );
  const _isVertical = graph.options.direction === "Up" || graph.options.direction === "Down";
  if (_isVertical) delete ctrEngineParams["org.eclipse.elk.portConstraints"];
  const hasContainers = Object.keys(parentMap).length > 0;
  for (const [nodeId, node] of Object.entries(nodeMap)) {
    if (!node.children || node.children.length === 0) continue;
    delete node.width;   // ELK computes container size from children + padding
    delete node.height;
    node.layoutOptions = {
      "elk.algorithm":         containerAlgoId,
      "elk.hierarchyHandling": hierarchyMode,
      ...containerEngineOpts,
      ...ctrEngineParams,
    };
    // alignWidthSameType pass 2: floor the container width to its per-level target
    // (computed in layout()). MINIMUM_SIZE keeps it from shrinking below content.
    if (/** @type {number} */ (node._minWidth) > 0) {   // Cast: absent compares as false
      node.layoutOptions["elk.nodeSize.constraints"] = "[MINIMUM_SIZE]";
      node.layoutOptions["elk.nodeSize.minimum"]     = `(${node._minWidth}, 0)`;
    }
    // Tree layer distance (_layoutOnce): extra padding on both flow sides of a root-level container.
    if (/** @type {number} */ (node._flowPad) > 0) {   // Cast: absent compares as false
      const p = graph.options.padding || 0, f = /** @type {number} */ (node._flowPad);
      const v = _isVertical ? f : 0, h = _isVertical ? 0 : f;
      node.layoutOptions["elk.padding"] =
        `[top=${p + CONTAINER_LABEL_CLEARANCE + v},left=${p + h},bottom=${p + v},right=${p + h}]`;
    }
  }

  // Node-level engine params (e.g. selfLoopDistribution, selfLoopOrdering) are target:NODES
  // in ELK — they must be on each individual node, not the root graph. Leaf nodes have no
  // layoutOptions yet, so create them here. Containers already received ctrEngineParams above.
  if (Object.keys(ctrEngineParams).length > 0) {
    for (const node of Object.values(nodeMap)) {
      if (node.children && node.children.length > 0) continue;
      node.layoutOptions = Object.assign({}, node.layoutOptions, ctrEngineParams);
    }
  }

  // Uniform port spacing (= connectionSpacing): ports exactly that far apart, centred on the side —
  // independent of node height, so ports of neighbouring nodes share one grid and parallel
  // connections keep the same spacing all the way into the ports.
  // portPort / portsSurrounding are read from the parent graph (root / container); portAlignment
  // and nodeSize from the leaf itself. [PORTS, MINIMUM_SIZE] lets ELK grow a leaf until its actual
  // ports (+ one spacing margin at both ends) fit — never shrinking below the given size.
  // Without it, ports beyond the side make Archi's orthogonal anchor fall back to a corner.
  const portSpacing = graph.options.connectionSpacing;
  if (portSpacing !== undefined && portSpacing > 0 && ALGORITHMS[graph.algorithm].engineAlgorithmId === "layered") {
    const parentOpts = {
      "elk.spacing.portPort":         String(portSpacing),
      "elk.spacing.portsSurrounding": `[top=${portSpacing},left=${portSpacing},bottom=${portSpacing},right=${portSpacing}]`,
    };
    Object.assign(layoutOptions, parentOpts);
    for (const node of Object.values(nodeMap)) {
      if (node.children.length > 0) {
        node.layoutOptions = Object.assign({}, node.layoutOptions, parentOpts);
        continue;
      }
      node.layoutOptions = Object.assign({}, node.layoutOptions, {
        "elk.portAlignment.default": "CENTER",
        "elk.nodeSize.constraints":  "[PORTS, MINIMUM_SIZE]",
        "elk.nodeSize.minimum":      `(${node.width}, ${node.height})`,
      });
    }
  }

  // Set hierarchyHandling on root when containers are present.
  if (hasContainers) layoutOptions["elk.hierarchyHandling"] = hierarchyMode;

  // orderBySize: only for Pack root, and only when sortContainers is off — they conflict because
  // sortContainers pre-sorts by type+name and orderBySize overrides that with size-first order.
  if (graph.algorithm === "Pack" && !graph.sortContainers) {
    layoutOptions["elk.rectpacking.orderBySize"] = "true";
    for (const node of Object.values(nodeMap)) {
      if (node.layoutOptions && containerAlgoId === "rectpacking")
        node.layoutOptions["elk.rectpacking.orderBySize"] = "true";
    }
  }

  // Hierarchical ports need an edge-routing algorithm on both sides of every container boundary;
  // ELK layered honours the port positions the inner layout chose. Other algorithms: lift instead.
  const edgeMode = hierarchyMode === "INCLUDE_CHILDREN" ? "include"
    : (ALGORITHMS[graph.algorithm].engineAlgorithmId === "layered" && containerAlgoId === "layered") ? "ports"
    : "lift";
  const { rootEdges, edgeMeta } = _placeEdges(edgeList, parentMap, nodeMap, edgeMode);
  const elkGraph = { id: "root", layoutOptions, children: rootChildren, edges: rootEdges };
  return { elkGraph, edgeMeta };
}

/**
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {ElkWorkEdge[]}               edgeList
 * @returns {ElkWorkEdge[]}
 */
function _spanningTree(nodeMap, edgeList) {
  // BFS spanning tree — removes cycles so ELK Radial's c2c traversal terminates.
  // Disconnected components are connected to the first root via virtual edges.
  const nodeIds = Object.keys(nodeMap);
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

  for (const startId of nodeIds) {
    if (visited.has(startId)) continue;
    componentRoots.push(startId);
    visited.add(startId);
    const queue = [startId];
    while (queue.length) {
      const cur = /** @type {string} */ (queue.shift());   // Cast: the queue is not empty
      for (const { id: nbId, edge } of (adj[cur] || [])) {
        if (!visited.has(nbId)) {
          visited.add(nbId);
          treeEdges.push(edge);
          queue.push(nbId);
        }
      }
    }
  }

  for (let i = 1; i < componentRoots.length; i++) {
    treeEdges.push({
      id: `__span_${i}`, sources: [componentRoots[0]], targets: [componentRoots[i]],
      _archiRelId: null, _relName: "",
    });
  }
  return treeEdges;
}

/**
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {Record<string, string>}      parentMap
 */
function _attachChildren(nodeMap, parentMap) {
  for (const [childId, parentId] of Object.entries(parentMap)) {
    const parent = nodeMap[parentId];
    const child  = nodeMap[childId];
    if (parent && child && !parent.children.some(c => c.id === childId)) {
      parent.children.push(child);
    }
  }
}

// Leaves are ALWAYS sorted by type+name; sortContainers only controls whether containers
// are also sorted (off = containers keep their original order). Containers are grouped
// before leaves in both cases.
/**
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {boolean}                     sortContainers
 */
function _sortNodeChildren(nodeMap, sortContainers) {
  for (const node of Object.values(nodeMap)) {
    if (node.children.length > 1) {
      const ctrs   = node.children.filter(n => n.children.length > 0);
      const leaves = node.children.filter(n => n.children.length === 0).sort(byTypeAndName);
      if (sortContainers) ctrs.sort(byTypeAndName);
      node.children = ctrs.concat(leaves);
    }
  }
}

/**
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {Record<string, string>}      parentMap
 * @param {boolean}                     sortContainers
 * @returns {ElkWorkNode[]}
 */
function _collectRootChildren(nodeMap, parentMap, sortContainers) {
  const roots = Object.keys(nodeMap)
    .filter(id => parentMap[id] === undefined)
    .map(id => nodeMap[id]);
  const ctrs   = roots.filter(n => n.children.length > 0);
  const leaves = roots.filter(n => n.children.length === 0).sort(byTypeAndName);
  if (sortContainers) ctrs.sort(byTypeAndName);
  return ctrs.concat(leaves);
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
 * @param {Record<string, ElkWorkNode>} nodeMap
 * @param {"include" | "ports" | "lift"} mode
 */
function _placeEdges(edgeList, parentMap, nodeMap, mode) {
  const ROOT = "root";
  /** @type {ElkWorkEdge[]} */
  const rootEdges = [];
  /** @type {Record<string, ElkEdgeMeta>} */
  const edgeMeta  = {};
  for (const node of Object.values(nodeMap)) { node.edges = []; delete node.ports; }
  const addTo = (/** @type {string} */ ctrId, /** @type {ElkWorkEdge} */ e) => (ctrId === ROOT ? rootEdges : nodeMap[ctrId].edges).push(e);
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
    const isCtr  = (/** @type {string} */ id) => mode === "ports" && srcId !== tgtId && nodeMap[id].children.length > 0;
    const ctrEnd = isCtr(srcId) || isCtr(tgtId);

    if (mode === "include" || (srcChain.length === 0 && tgtChain.length === 0 && !ctrEnd)) {
      addTo(lca, edge);
      continue;
    }

    if (mode === "lift") {
      const liftedSrc = srcChain.length ? srcChain[srcChain.length - 1] : srcId;
      const liftedTgt = tgtChain.length ? tgtChain[tgtChain.length - 1] : tgtId;
      edgeMeta[edge.id] = { origSrcId: srcId, origTgtId: tgtId };
      addTo(lca, Object.assign({}, edge, { sources: [liftedSrc], targets: [liftedTgt] }));
      continue;
    }

    // ports: endpoint → port(src parent) → … → port(tgt parent) → endpoint.
    // Each segment lives in the container that owns it; the label goes on the LCA segment.
    const portOf = (/** @type {string} */ ctrId) => {
      const port = { id: `${edge.id}__p_${ctrId}` };
      (nodeMap[ctrId].ports = nodeMap[ctrId].ports || []).push(port);
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
        _relName:    edge._relName,
        sources:     [stops[i]],
        targets:     [stops[i + 1]],
      };
      if (edge.properties) seg.properties = edge.properties;
      if (edge.labels && owners[i] === lca) seg.labels = edge.labels;
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
 * @param {{ startPoint?: Point, endPoint?: Point, bendPoints?: Point[] }} section  ELK edge section
 * @param {number} offsetX  absolute x of the container node
 * @param {number} offsetY  absolute y of the container node
 * @param {number} nSamples total sample count spread across all segments
 * @returns {{ x: number, y: number }[]}
 */
function _sampleSplineSection(section, offsetX, offsetY, nSamples) {
  const rawBps = section.bendPoints;
  if (!rawBps || rawBps.length < 2) {
    // No control points → straight segment; no bend points needed.
    return [];
  }

  const sp  = section.startPoint || { x: 0, y: 0 };
  const ep  = section.endPoint   || { x: 0, y: 0 };
  const abs = (/** @type {Point} */ p) => ({ x: offsetX + p.x, y: offsetY + p.y });

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

  const n     = bps.length;
  const start = abs(sp);
  const end   = abs(ep);
  const pts   = bps.map(abs);

  // Build cubic Bézier segments.
  // Each group of 3 from pts: (ctrl_a, ctrl_b, knot) defines one segment.
  // The final group has only (ctrl_a, ctrl_b); the anchor is end.
  /** @type {[Point, Point, Point, Point][]} */
  const segments = [];
  let p0 = start;
  for (let i = 0; i < n; i += 3) {
    const p1 = pts[i];
    const p2 = pts[i + 1];              // always present: n >= 2 after trim
    const p3 = (i + 2 < n) ? pts[i + 2] : end;
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
      const t  = j / (sps + 1);
      const mt = 1 - t;
      result.push({
        x: Math.round(mt*mt*mt*p0.x + 3*mt*mt*t*p1.x + 3*mt*t*t*p2.x + t*t*t*p3.x),
        y: Math.round(mt*mt*mt*p0.y + 3*mt*mt*t*p1.y + 3*mt*t*t*p2.y + t*t*t*p3.y),
      });
    }
  }
  return result;
}

/**
 * @param {ElkWorkNode | ElkRoot} elkNode
 * @param {number}                offsetX
 * @param {number}                offsetY
 * @param {LayoutResultNode[]}    resultNodes  filled
 * @param {string}                [parentId]
 */
function _collectNodePositions(elkNode, offsetX, offsetY, resultNodes, parentId) {
  for (const child of (elkNode.children || [])) {
    const absX = offsetX + (child.x || 0);
    const absY = offsetY + (child.y || 0);
    // Guard against degenerate ELK output: rectpacking (esp. with aggressive compaction /
    // whiteSpaceElimination) can occasionally emit a node with a zero/undefined dimension.
    // A non-positive width/height crashes the writer's setBounds ("Width or height cannot be
    // zero or less"). Clamp to a minimum and warn with the node id so the cause stays visible.
    // Casts: either may be undefined; the !(w > 0) guard below handles that.
    let w = /** @type {number} */ (child.width), h = /** @type {number} */ (child.height);
    if (!(w > 0) || !(h > 0)) {
      console.log(`  ⚠ [elk] node "${child.id}" has non-positive size (w=${w}, h=${h}); clamping to ${MIN_NODE_SIZE}px`);
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
    _collectNodePositions(child, absX, absY, resultNodes, child.id);
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
 * has no orthogonal or spline routing). Between the ports mrtree chose, the adapter draws
 *   Orthogonal  two bends halfway along the flow: out, across, in
 *   Splines     a cubic S-curve (control points halfway along the flow), sampled to bendpoints
 * Polyline keeps mrtree's own route.
 * @param {LayoutResultEdge[]} resultEdges  changed in place
 * @param {LayoutGraph}        graph
 * @param {boolean}            vertical     flow Up / Down
 */
function _routeTreeEdges(resultEdges, graph, vertical) {
  /** @type {Record<string, string>} */
  const nameById = {};
  for (const e of graph.edges) nameById[e.conceptId || e.id] = e.label || "";
  // Flow axis f, cross axis c: Right / Left → f = x; Up / Down → f = y.
  const f = vertical ? "y" : "x", c = vertical ? "x" : "y";
  const pt = (/** @type {number} */ fv, /** @type {number} */ cv) => vertical
    ? { x: Math.round(cv), y: Math.round(fv) } : { x: Math.round(fv), y: Math.round(cv) };
  for (const e of resultEdges) {
    const s = e.srcPort, t = e.tgtPort;
    if (!s || !t || e.sourceId === e.targetId) continue;
    const mid = (s[f] + t[f]) / 2;
    /** @type {Point[]} */
    let bps;
    if (Math.abs(s[c] - t[c]) < 1) {
      bps = [pt(mid, s[c])];
    } else if (graph.options.routing === "Splines") {
      bps = [];
      for (let j = 1; j <= SPLINE_SAMPLE_POINTS; j++) {
        const u = j / (SPLINE_SAMPLE_POINTS + 1), mu = 1 - u;
        // P0 = s, P1 = (mid, s.c), P2 = (mid, t.c), P3 = t
        const fv = mu * mu * mu * s[f] + 3 * mu * mu * u * mid + 3 * mu * u * u * mid + u * u * u * t[f];
        const cv = mu * mu * mu * s[c] + 3 * mu * mu * u * s[c] + 3 * mu * u * u * t[c] + u * u * u * t[c];
        bps.push(pt(fv, cv));
      }
    } else {
      bps = [pt(mid, s[c]), pt(mid, t[c])];
    }
    e.bendpoints = bps;
    const lbl = _computeLabelPoint({ startPoint: s, endPoint: t }, bps, 0, 0,
      graph.options.labelPosition || "Middle", nameById[e.id] || "");
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
    const containerNodeId = elkNode.id === "root" ? null : elkNode.id;
    const containerNode   = containerNodeId ? byId[containerNodeId] : null;
    const offsetX = containerNode ? containerNode.x : 0;
    const offsetY = containerNode ? containerNode.y : 0;

    if (containerNodeId && !containerNode)
      log(`⚠ [edge-collect] container "${containerNodeId}" not in resultNodes — offset forced to (0,0)`);

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
      console.log(`  ⚠ [elk] relation "${relId}": ${recs.filter(Boolean).length}/${meta.segCount} port segments routed — left unrouted`);
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
    if (isSplines) bps.push(..._sampleSplineSection(sec, 0, 0, SPLINE_SAMPLE_POINTS));
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
  const srcPort = pathStart;
  const tgtPort = pathEnd;

  // Label position — use ELK's computed result when available (connectionLabelSpacing mode),
  // otherwise derive from geometry.
  let { labelX, labelY } = _computeLabelPoint({ startPoint: first.startPoint, endPoint: last.endPoint }, bps, 0, 0, labelPosition, edge._relName);
  if (rec.label) { labelX = Math.round(rec.label.x); labelY = Math.round(rec.label.y); }

  resultEdges.push({
    id:            originalId,
    conceptId:     originalId,
    sourceId:      meta ? meta.origSrcId : edge.sources[0],
    targetId:      meta ? meta.origTgtId : edge.targets[0],
    bendpoints:    bps,
    srcPort,
    tgtPort,
    labelX,
    labelY,
    isStraight:    edge._isStraight || false,
  });
}

/**
 * @param {{ startPoint?: Point, endPoint?: Point }} section
 * @param {Point[]} bendpoints
 * @param {number}  offsetX
 * @param {number}  offsetY
 * @param {string}  labelPosition
 * @param {string}  relName
 * @returns {{ labelX: number, labelY: number }}
 */
function _computeLabelPoint(section, bendpoints, offsetX, offsetY, labelPosition, relName) {
  const startX = offsetX + (section.startPoint ? section.startPoint.x : 0);
  const startY = offsetY + (section.startPoint ? section.startPoint.y : 0);
  const endX   = offsetX + (section.endPoint   ? section.endPoint.x   : 0);
  const endY   = offsetY + (section.endPoint   ? section.endPoint.y   : 0);

  if (labelPosition === "Source") return { labelX: Math.round(startX), labelY: Math.round(startY) };
  if (labelPosition === "Target") return { labelX: Math.round(endX),   labelY: Math.round(endY) };

  // Middle: midpoint of bendpoints or midpoint of start→end
  if (bendpoints.length > 0) {
    const mid = bendpoints[Math.floor(bendpoints.length / 2)];
    return { labelX: mid.x, labelY: mid.y };
  }
  return { labelX: Math.round((startX + endX) / 2), labelY: Math.round((startY + endY) / 2) };
}

// ── Two-pass layout helpers ───────────────────────────────────────────────────


/**
 * Collect rendered widths of every box (containers and leaves) from pass-1 ELK output.
 * Feeds alignWidthsByLevel, which derives per-level target widths for pass 2.
 * @param {ElkWorkNode | ElkRoot} layouted
 * @returns {Record<string, number>}  { id: renderedWidth }
 */
function _collectRenderedWidths(layouted) {
  /** @type {Record<string, number>} */
  const widths = {};
  /** @param {ElkWorkNode | ElkRoot} node */
  function walk(node) {
    for (const child of (node.children || [])) {
      const cw = /** @type {number} */ (child.width);   // Cast: absent compares as false
      if (cw > 0) widths[child.id] = cw;
      walk(child);
    }
  }
  walk(layouted);
  return widths;
}

/**
 * Reset node state between pass 1 and pass 2.
 * Leaf nodes restore their original sizes; containers get no explicit size so ELK auto-sizes them.
 * Caller then applies per-level target widths (via alignWidthsByLevel).
 * @param {Record<string, ElkWorkNode>}                            nodeMap
 * @param {Record<string, { width?: number, height?: number }>}   origSizes
 * @param {Set<string>}                                            containerIds
 */
function _resetNodesForPass2(nodeMap, origSizes, containerIds) {
  for (const [id, node] of Object.entries(nodeMap)) {
    node.children = [];
    node.edges    = [];
    delete node.layoutOptions;
    delete node.x;
    delete node.y;
    if (origSizes[id]) { node.width = origSizes[id].width; node.height = origSizes[id].height; }
    else               { delete node.width; delete node.height; }  // container: ELK auto-sizes
  }
}

// ── Center-snap column alignment to a global grid ──────────────────────────────

/**
 * Align leaf columns top-to-bottom across the view as a **global variable-width table**.
 * Mutates absolute x of resultNodes in place and re-wraps containers around their moved
 * children; **leaves are never resized** (position-only — see [No post-layout scaling]).
 *
 * Every leaf column is placed on one shared set of vertical bands so columns line up across
 * the whole view; each column is as wide as its widest leaf. Gaps start **tight** and are
 * then **widened only where containers actually collide**, by exactly the overlap amount —
 * so most boundaries stay minimal and only the few that genuinely need a deep gap get one,
 * while every column stays on the shared grid (widening a boundary just shifts everything
 * to its right).
 *
 * Algorithm:
 *   1. Detect columns: sort leaves by centre, split on a >½-leaf gap (consecutive compare).
 *   2. Column width = widest member leaf.
 *   3. Initial gap per boundary = max row need (`spacing + padding × symmetric ancestor
 *      difference`) − 2×padding, floored at spacing.
 *   4. Iterate: place leaves on the column grid + re-wrap containers; find adjacent sibling
 *      containers that overlap; widen each offending boundary by the overlap; repeat until
 *      no container overlaps (or a few iterations).
 *
 * @param {LayoutResultNode[]}     resultNodes  flattened nodes { id, x, y, width, height, parentId }
 * @param {EffectiveParams}        options      graph.options (spacing, padding)
 * @param {Record<string, string>} nameById     { id: displayName }
 * @param {Logger}                 log          logger
 */
function _snapColumnsToGrid(resultNodes, options, nameById, log) {
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
  if (leaves.length < 2) { log("[colSnap] skipped (no columns)"); return; }

  // Container-ancestor set per leaf, and symmetric-difference count between two leaves.
  /** @type {Record<string, Set<string>>} */
  const anc = {};
  for (const lf of leaves) {
    const s = new Set(); let p = lf.parentId;
    while (p != null) { s.add(p); p = byId[p] ? byId[p].parentId : null; }
    anc[lf.id] = s;
  }
  const symDiff = (/** @type {string} */ a, /** @type {string} */ b) => {
    let d = 0;
    for (const x of anc[a]) if (!anc[b].has(x)) d++;
    for (const x of anc[b]) if (!anc[a].has(x)) d++;
    return d;
  };

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
  if (cols.length < 2) { log("[colSnap] 1 column — nothing to align"); return; }
  /** @type {Record<string, number>} */
  const colOf = {};
  cols.forEach((c, i) => c.members.forEach(m => { colOf[m.id] = i; }));

  // 3. Initial gap per boundary = max row need − slack (2·padding), floored at spacing.
  //    Tight first; the loop below widens only the boundaries that actually collide.
  const yOver = (/** @type {LayoutResultNode} */ a, /** @type {LayoutResultNode} */ b) => a.y < b.y + (b.height || 0) && b.y < a.y + (a.height || 0);
  const slack = 2 * pad;
  /** @type {number[]} */
  const gap = [];
  /** @type {number[]} */
  const rawGap = [];
  for (let k = 0; k < cols.length - 1; k++) {
    let need = spacing;
    for (const a of cols[k].members) for (const b of cols[k + 1].members) {
      if (!yOver(a, b)) continue;
      const req = spacing + pad * symDiff(a.id, b.id);
      if (req > need) need = req;
    }
    rawGap.push(need);
    gap.push(Math.max(spacing, need - slack));
  }

  const origin = Math.min(...cols[0].members.map(m => m.x));
  const nm = (/** @type {string} */ id) => nameById[id] || id;
  const ROOT = "__root__";
  const parents = [...new Set(resultNodes.map(n => (n.parentId == null ? ROOT : n.parentId)))];
  const depthOf = (/** @type {string} */ id) => { let d = 0, p = byId[id] ? byId[id].parentId : null; while (p != null) { d++; p = byId[p] ? byId[p].parentId : null; } return d; };
  const containersByDepth = [...containerIds].sort((a, b) => depthOf(b) - depthOf(a));
  // Rightmost leaf-column index within a container's subtree (the boundary to its right).
  const rightCol = (/** @type {string} */ cid) => { let hi = -1; (function w(/** @type {string} */ id){ for (const c of (childrenByParent[id] || [])) { if (!isContainer(c.id)) hi = Math.max(hi, colOf[c.id]); else w(c.id); } })(cid); return hi; };

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
  // Find adjacent sibling containers that overlap; return { boundaryIndex: maxNeededWiden }.
  function findOverlaps() {
    /** @type {Record<string, number>} */
    const widen = {};
    /** @type {string[]} */
    const list = [];
    for (const pid of parents) {
      const sibs = (pid === ROOT ? resultNodes.filter(n => n.parentId == null) : (childrenByParent[pid] || []))
                     .filter(k => isContainer(k.id)).sort((a, b) => a.x - b.x);
      for (let i = 1; i < sibs.length; i++) {
        let nearRight = -Infinity, nb = null;
        for (let j = 0; j < i; j++) if (yOver(sibs[i], sibs[j]) && rightOf(sibs[j]) > nearRight) { nearRight = rightOf(sibs[j]); nb = sibs[j]; }
        if (!nb) continue;
        const g = sibs[i].x - nearRight;
        if (g < spacing - 1e-6) {
          const b = rightCol(nb.id);                    // widen the boundary at the left container's right edge
          if (b >= 0 && b < gap.length) widen[b] = Math.max(widen[b] || 0, spacing - g);
          list.push(`    overlap in "${pid === ROOT ? "(root)" : nm(pid)}": "${nm(nb.id)}" ↔ "${nm(sibs[i].id)}" gap=${Math.round(g)}px → widen gap ${b}`);
        }
      }
    }
    return { widen, list };
  }

  // 4. Iterate: lay out tight, find collisions, widen exactly those boundaries, repeat.
  let iters = 0;
  /** @type {string[]} */
  let lastList = [];
  for (; iters < 8; iters++) {
    applyGrid();
    const { widen, list } = findOverlaps();
    lastList = list;
    const keys = Object.keys(widen);
    if (!keys.length) break;
    for (const k of keys) gap[+k] += widen[k];
  }

  log(`[colSnap] applied — ${cols.length} columns, widths [${cols.map(c => c.w).join(", ")}]; ` +
      `slack=${slack}px (2·padding); ${iters} widen-iteration(s); final gaps [${gap.map(Math.round).join(", ")}]`);
  for (let k = 0; k < gap.length; k++) log(`    gap ${k}→${k + 1}: raw need ${Math.round(rawGap[k])} ⇒ final ${Math.round(gap[k])}`);
  if (lastList.length) { log(`[colSnap] unresolved overlaps after ${iters} iters:`); for (const l of lastList) log(l); }
  else log(`[colSnap] overlap scan: clean (all adjacent containers ≥ ${spacing}px)`);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
