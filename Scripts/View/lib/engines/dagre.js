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

const Defs = require(REPO_ROOT + "View/lib/defs");
const { ALGORITHMS, DIRECTION_MAP } = Defs;
const EngineUtils = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { selfLoopResult, sortedNodes, applyParams } = EngineUtils;

// ── Engine-specific parameter mapping ────────────────────────────────────────

// Dagre ranker identifiers mapped from GUI ranking labels.
const RANKER = {
  "Balanced":    "network-simplex",
  "Uniform":     "longest-path",
  "Top-aligned": "tight-tree",
};

const DEFAULT_DAGRE_PARAMS = {
  acyclicer: "greedy",
  edgesep:   20,
};

const PARAM_MAPPING = {
  Dagre: {
    direction:      (v) => ({ rankdir: DIRECTION_MAP[v] }),
    ranking:        (v) => ({ ranker: RANKER[v] ?? "network-simplex" }),
    acyclicer:      (v) => v === "Greedy" ? { acyclicer: "greedy" } : {},
    layerSpacing:   (v) => ({ ranksep: v }),
    elementSpacing: (v) => ({ nodesep: v }),
    padding:        (v) => ({ marginx: v, marginy: v }),
  },
};

// _applyParams — provided by engine-utils.js as applyParams(algName, opts, mapping)

// ─────────────────────────────────────────────────────────────────────────────

let _dagre = null;
function _loadDagre() {
  if (_dagre) return _dagre;
  try {
    _dagre = require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js");
    console.log("Dagre layout engine loaded.");
  } catch (e) {
    throw new Error("dagre-cluster-fix not loaded. Check node_modules/dagre-cluster-fix/index.js.");
  }
  return _dagre;
}

/**
 * Build and populate a dagre graphlib.Graph from nodes and edges.
 * @param {Object}   dagre        loaded dagre module
 * @param {Object}   engineOpts   mapped graph-level options
 * @param {Object[]} nodes        LayoutGraph nodes (sorted / equalized)
 * @param {Object[]} edges        edges to add (may include or exclude self-loops)
 * @returns {Object}              populated graphlib.Graph
 */
function _buildDagreGraph(dagre, engineOpts, nodes, edges) {
  const g = new dagre.graphlib.Graph({ directed: true, compound: true, multigraph: true })
    .setGraph(Object.assign(
      { rankdir: "LR", nodesep: 40, ranksep: 180, ranker: "network-simplex" },
      engineOpts
    ))
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
        id:    edge.id,
        label: edge.label || "",
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
    applyParams("Dagre", graph.options, PARAM_MAPPING),
    Object.fromEntries(
      Object.entries(Object.assign({}, DEFAULT_DAGRE_PARAMS, (graph.engineParams && graph.engineParams.Dagre) || {})).map(([k, v]) => [k, Number(v)])
    )
  );

  // Separate self-loops from regular edges
  const selfLoops    = [];
  const regularEdges = [];
  for (const edge of graph.edges) {
    (edge.source === edge.target ? selfLoops : regularEdges).push(edge);
  }

  // Build graph and run layout.
  // dagre-cluster-fix may throw on self-loop edges during dagre.layout() — attempt routing,
  // rebuild without self-loops and retry on error.
  let g;
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
      console.log("Dagre self-loop routing failed (" + e.message + "); retrying without self-loops.");
      g = _buildDagreGraph(dagre, engineOpts, nodes, regularEdges);
      dagre.layout(g);
      for (const edge of selfLoops) selfLoopEdgeResults.push(selfLoopResult(edge));
    }
  }

  // Extract LayoutResult
  const resultNodes = [];
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

    const edgeData = g.edge(edgeObj);
    const points   = edgeData.points || [];

    // Skip first and last points (they're on node boundaries — Archi doesn't use them)
    const innerPoints = points.slice(1, points.length - 1);

    const bendpoints = innerPoints.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));

    // Label position
    let labelX = 0, labelY = 0;
    if (labelPosition === "Source" && points.length > 0) {
      labelX = Math.round(points[0].x);
      labelY = Math.round(points[0].y);
    } else if (labelPosition === "Target" && points.length > 0) {
      const last = points[points.length - 1];
      labelX = Math.round(last.x);
      labelY = Math.round(last.y);
    } else if (bendpoints.length > 0) {
      const mid = bendpoints[Math.floor(bendpoints.length / 2)];
      labelX = mid.x;
      labelY = mid.y;
    } else if (points.length >= 2) {
      labelX = Math.round((points[0].x + points[points.length - 1].x) / 2);
      labelY = Math.round((points[0].y + points[points.length - 1].y) / 2);
    }

    resultEdges.push({
      id:         edgeData.id || edgeObj.name,
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
  module.exports = { layout };
}
