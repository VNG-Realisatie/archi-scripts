/**
 * Dagre engine adapter.
 *
 * Accepts a normalized LayoutGraph, runs Dagre layout, returns a LayoutResult.
 * Docs: https://github.com/dagrejs/dagre/wiki
 */
console.log("Loading engines/dagre.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
const { ALGORITHMS, DIRECTION_MAP } = Defs;
/** @type {typeof import("./engine-utils")} */
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { selfLoopResult, sortedNodes, applyParams, dialogKeys, settingProblem, labelPoint } = EngineUtils;

// ── Engine-specific parameter mapping ────────────────────────────────────────

// Dagre ranker identifiers mapped from GUI ranking labels.
/** @type {Record<string, string>} */
const RANKER = {
  "Balanced":    "network-simplex",
  "Uniform":     "longest-path",
  "Top-aligned": "tight-tree",
};

// Settings outside the dialog (engineParams.Dagre): the graph options dagre reads, with dagre's own
// default. The dialog sets all but align (acyclicer only for Greedy); engineParams.Dagre wins over it.
/** @type {Record<string, { default: string | number | undefined, effect: string }>} */
const ENGINE_PARAMS = {
  rankdir:   { default: "tb",              effect: "Direction of the layers: tb, bt, lr, rl" },
  ranker:    { default: "network-simplex", effect: "Layer assignment: network-simplex, tight-tree, longest-path" },
  acyclicer: { default: undefined,         effect: "Cycle breaking: unset = depth-first, greedy" },
  ranksep:   { default: 50,                effect: "Distance between layers (px)" },
  nodesep:   { default: 50,                effect: "Distance between elements in one layer (px)" },
  edgesep:   { default: 20,                effect: "Distance between connections in one layer (px)" },
  marginx:   { default: 0,                 effect: "Margin left and right of the view (px)" },
  marginy:   { default: 0,                 effect: "Margin above and below the view (px)" },
  align:     { default: undefined,         effect: "Alignment in a layer: UL, UR, DL, DR; unset = centred" },
};

/** @type {ParamMapping} */
const PARAM_MAPPING = {
  Dagre: {
    direction:         (v) => ({ rankdir: DIRECTION_MAP[v] }),
    ranking:           (v) => ({ ranker: RANKER[v] ?? "network-simplex" }),
    acyclicer:         (v) => v === "Greedy" ? { acyclicer: "greedy" } : {},
    layerSpacing:      (v) => ({ ranksep: v }),
    elementSpacing:    (v) => ({ nodesep: v }),
    connectionSpacing: (v) => ({ edgesep: v }),
    diagramPadding:    (v) => ({ marginx: v, marginy: v }),
  },
};

// _applyParams — provided by engine-utils.js as applyParams(algName, opts, mapping)

// engineParams values may be numeric strings ("50"); convert those, keep words ("greedy") as-is.
const _num = (/** @type {unknown} */ v) => (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v))) ? Number(v) : v;

/**
 * Dagre keys the dialog sets, each with its param.
 * @param {string}          algorithm
 * @param {EffectiveParams} params
 * @returns {Record<string, string>}
 */
function dialogSettings(algorithm, params) {
  return dialogKeys(algorithm, params, PARAM_MAPPING);
}

/**
 * Settings outside the dialog: one finding per engineParams.Dagre key.
 * @param {MaskedPreset} preset
 * @returns {SettingFinding[]}
 */
function checkEngineParams(preset) {
  /** @type {Record<string, unknown>} */
  const defaults = {};
  for (const [key, s] of Object.entries(ENGINE_PARAMS)) defaults[key] = s.default;
  const dialog  = dialogSettings(preset.algorithm, preset.params);
  const current = applyParams("Dagre", preset.params, PARAM_MAPPING);
  return Object.entries(preset.engineParams.Dagre || {}).map(([key, value]) =>
    ({ key, value, ...settingProblem(key, _num(value), defaults, dialog, current) }));
}

// ─────────────────────────────────────────────────────────────────────────────

/** @type {DagreModule | null} */
let _dagre = null;
/** @returns {DagreModule} */
function _loadDagre() {
  if (_dagre) return _dagre;
  try {
    _dagre = require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js");
    console.log("Dagre layout engine loaded.");
  } catch (e) {
    throw new Error("dagre-cluster-fix not loaded. Check node_modules/dagre-cluster-fix/index.js.");
  }
  return /** @type {DagreModule} */ (_dagre);   // Cast: set by the require above
}

/**
 * Build and populate a dagre graphlib.Graph from nodes and edges.
 * @param {DagreModule}             dagre        loaded dagre module
 * @param {Record<string, unknown>} engineOpts   mapped graph-level options
 * @param {LayoutNode[]}            nodes        LayoutGraph nodes (sorted / equalized)
 * @param {LayoutEdge[]}            edges        edges to add (may include or exclude self-loops)
 * @returns {DagreGraph}                         populated graphlib.Graph
 */
function _buildDagreGraph(dagre, engineOpts, nodes, edges) {
  const g = new dagre.graphlib.Graph({ directed: true, compound: true, multigraph: true })
    .setGraph(engineOpts)
    .setDefaultNodeLabel(() => ({}))
    .setDefaultEdgeLabel(() => ({ minlen: 1, weight: 1 }));

  for (const node of nodes) {
    g.setNode(node.id, { label: node.id, width: node.width, height: node.height });
  }
  for (const node of nodes) {
    if (node.parent && g.hasNode(node.id) && g.hasNode(node.parent)) {
      g.setParent(node.id, node.parent);
    }
  }
  for (const edge of edges) {
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    if (!g.hasEdge(edge.source, edge.target, edge.id)) {
      g.setEdge({ v: edge.source, w: edge.target, name: edge.id }, {
        id:        edge.id,
        conceptId: edge.conceptId,
        label:     edge.label || "",
      });
    }
  }
  return g;
}

/**
 * Compute layout positions.
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const dagre = _loadDagre();

  const parentMap = graph._parentMap || {};

  // Pre-layout: leaves are always sorted; sortContainers also sorts containers.
  // alignWidthSameType is ELK-only (see capability matrix); Dagre's partial nesting does
  // not support the two-pass container measurement.
  const nodes = sortedNodes(graph.nodes, parentMap, graph.sortContainers);

  const engineOpts = Object.assign(
    {},
    applyParams("Dagre", graph.options, PARAM_MAPPING),
    Object.fromEntries(
      Object.entries((graph.engineParams && graph.engineParams.Dagre) || {}).map(([k, v]) => [k, _num(v)])
    )
  );

  // Separate self-loops from regular edges
  /** @type {LayoutEdge[]} */
  const selfLoops    = [];
  /** @type {LayoutEdge[]} */
  const regularEdges = [];
  for (const edge of graph.edges) {
    (edge.source === edge.target ? selfLoops : regularEdges).push(edge);
  }

  // Build graph and run layout.
  // dagre-cluster-fix may throw on self-loop edges during dagre.layout() — attempt routing,
  // rebuild without self-loops and retry on error.
  let g;
  /** @type {LayoutResultEdge[]} */
  const selfLoopEdgeResults = [];

  if (selfLoops.length === 0) {
    g = _buildDagreGraph(dagre, engineOpts, nodes, regularEdges);
    console.log("Calculating Dagre layout...");
    dagre.layout(g);
  } else {
    g = _buildDagreGraph(dagre, engineOpts, nodes, [...regularEdges, ...selfLoops]);
    console.log("Calculating Dagre layout (with self-loops)...");
    try {
      dagre.layout(g);
      // Extract self-loop results — use routed points if dagre-cluster-fix routed them
      for (const edge of selfLoops) {
        const edgeData = g.edge({ v: edge.source, w: edge.target, name: edge.id });
        const points   = edgeData && edgeData.points;
        if (points && points.length > 2) {
          const inner = points.slice(1, -1);
          selfLoopEdgeResults.push({
            id:         edge.id,
            conceptId:  edge.conceptId,
            sourceId:   edge.source,
            targetId:   edge.target,
            bendpoints: inner.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
            labelX:     0,
            labelY:     0,
            isStraight: false,
          });
        } else {
          selfLoopEdgeResults.push(selfLoopResult(edge));
        }
      }
    } catch (e) {
      console.log("Dagre self-loop routing failed (" + /** @type {Error} */ (e).message + "); retrying without self-loops.");
      g = _buildDagreGraph(dagre, engineOpts, nodes, regularEdges);
      dagre.layout(g);
      for (const edge of selfLoops) selfLoopEdgeResults.push(selfLoopResult(edge));
    }
  }

  // Extract LayoutResult
  /** @type {LayoutResultNode[]} */
  const resultNodes = [];
  /** @type {LayoutResultEdge[]} */
  const resultEdges = [...selfLoopEdgeResults];

  for (const nodeId of g.nodes()) {
    const n = g.node(nodeId);
    // Dagre uses center-based coordinates; convert to top-left
    const x = Math.round(n.x - n.width  / 2);
    const y = Math.round(n.y - n.height / 2);
    const parentId = g.parent(nodeId) || null;
    resultNodes.push({ id: nodeId, x, y, width: n.width, height: n.height, parentId });
  }

  const labelPosition = graph.options.labelPosition || "Middle";

  for (const edgeObj of g.edges()) {
    if (edgeObj.v === edgeObj.w) continue;  // self-loops already in selfLoopEdgeResults

    const edgeData = /** @type {DagreEdgeLabel} */ (g.edge(edgeObj));   // Cast: edgeObj comes from g.edges()
    const points   = edgeData.points || [];

    // Skip first and last points (they're on node boundaries — Archi doesn't use them)
    const innerPoints = points.slice(1, points.length - 1);

    const bendpoints = innerPoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));

    const { labelX, labelY } = labelPoint(points[0], points[points.length - 1], bendpoints, labelPosition);

    resultEdges.push({
      id:         edgeData.id || /** @type {string} */ (edgeObj.name),   // Cast: every edge is set with a name
      conceptId:  edgeData.conceptId,
      sourceId:   edgeObj.v,
      targetId:   edgeObj.w,
      bendpoints,
      labelX,
      labelY,
      isStraight: false,
    });
  }

  // Compute view bounding box
  let maxX = 0, maxY = 0;
  for (const n of resultNodes) { maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height); }

  return {
    nodes:      resultNodes,
    edges:      resultEdges,
    viewWidth:  maxX + 20,
    viewHeight: maxY + 20,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout, checkEngineParams, dialogSettings, ENGINE_PARAMS };
}
