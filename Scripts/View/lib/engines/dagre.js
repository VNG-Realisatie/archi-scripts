/**
 * Dagre engine adapter.
 *
 * Accepts a normalized LayoutGraph, runs Dagre layout, returns a LayoutResult.
 * Docs: https://github.com/dagrejs/dagre/wiki
 */
console.log("engines/dagre.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Defs = require(REPO_ROOT + "View/lib/defs");
const { mapParams, RANKDIR, RANKING } = Defs;

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
 * Compute layout positions.
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const dagre = _loadDagre();

  const engineOpts = mapParams("Dagre", graph.options);
  const rankdir = RANKDIR[graph.options.direction] || "LR";
  const ranker  = RANKING.find(r => r.val === graph.options.ranking)?.dagreRanker ?? "network-simplex";

  const g = new dagre.graphlib.Graph({ directed: true, compound: true, multigraph: true })
    .setGraph({
      rankdir,
      nodesep: graph.options.elementSpacing || 40,
      ranksep: graph.options.layerSpacing   || 180,
      ranker,
      marginx: 10,
      marginy: 10,
    })
    .setDefaultNodeLabel(() => ({}))
    .setDefaultEdgeLabel(() => ({ minlen: 1, weight: 1 }));

  // Add nodes
  for (const node of graph.nodes) {
    g.setNode(node.id, { label: node.id, width: node.width, height: node.height });
  }

  // Set parent-child relationships
  for (const node of graph.nodes) {
    if (node.parent && g.hasNode(node.id) && g.hasNode(node.parent)) {
      g.setParent(node.id, node.parent);
    }
  }

  // Add edges. Self-loops are not routed by Dagre core — collect them for
  // pass-through to the LayoutResult; the writer synthesises bendpoints.
  const selfLoops = [];
  for (const edge of graph.edges) {
    if (edge.source === edge.target) {
      selfLoops.push(edge);
      continue;
    }
    if (!g.hasNode(edge.source) || !g.hasNode(edge.target)) continue;
    if (!g.hasEdge(edge.source, edge.target, edge.id)) {
      g.setEdge({ v: edge.source, w: edge.target, name: edge.id }, {
        id:    edge.id,
        label: edge.label || "",
      });
    }
  }

  console.log("Calculating Dagre layout...");
  dagre.layout(g);

  // Extract LayoutResult
  const resultNodes = [];
  const resultEdges = [];

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

  // Self-loops: pass-through with empty bendpoints. Writer synthesises.
  for (const edge of selfLoops) {
    resultEdges.push({
      id:         edge.id,
      sourceId:   edge.source,
      targetId:   edge.target,
      bendpoints: [],
      labelX:     0,
      labelY:     0,
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
