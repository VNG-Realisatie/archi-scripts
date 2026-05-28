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

const Defs = require(REPO_ROOT + "View/lib/defs");
const { ALGORITHMS, SPLINE_SAMPLE_POINTS } = Defs;

// ── Engine-specific parameter mapping ────────────────────────────────────────
// Maps GUI param names to ELK layout option keys/values.
// Each algorithm entry has two scopes:
//   root:      applied to rootLayoutOptions (the ELK root graph)
//   container: applied to each container node's layoutOptions in _buildELKGraph
//
// Parameters handled outside PARAM_MAPPING:
//   maxWidth / maxHeight  → set as elkGraph.width / .height (root graph bounds, not options)
//   nestingRelationTypes, alignWidthSameType, sortContainers → graph structure / strategy

const ELK_DIRECTION = {
  "Left → Right": "RIGHT",
  "Right → Left": "LEFT",
  "Top → Bottom": "DOWN",
  "Bottom → Top": "UP",
};

// Extra top padding inside container nodes so the container label is not covered by children.
const CONTAINER_LABEL_CLEARANCE = 30;

// Shared routing fn used in both root and container scopes for Layered.
// CONSERVATIVE spline mode inlined here — no separate post-mapping special case needed.
const _LAYERED_ROUTING = (v) => ({
  "elk.edgeRouting": v === "Orthogonal" ? "ORTHOGONAL" : v === "Splines" ? "SPLINES" : "POLYLINE",
  ...(v === "Splines" ? { "elk.layered.edgeRouting.splines.mode": "CONSERVATIVE" } : {}),
});

const PARAM_MAPPING = {
  Layered: {
    root: {
      direction:      (v) => ({ "elk.direction": ELK_DIRECTION[v] ?? "RIGHT" }),
      routing:        _LAYERED_ROUTING,
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      layerSpacing:   (v) => ({ "elk.layered.spacing.nodeNodeBetweenLayers": String(v) }),
      aspectRatio:    (v) => v > 0 ? { "elk.aspectRatio": String(v) } : {},
      padding:        (v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    container: {
      direction:      (v) => ({ "elk.direction": ELK_DIRECTION[v] ?? "RIGHT" }),
      routing:        _LAYERED_ROUTING,
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      layerSpacing:   (v) => ({ "elk.layered.spacing.nodeNodeBetweenLayers": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Tree: {
    root: {
      direction:      (v) => ({ "elk.direction": ELK_DIRECTION[v] ?? "RIGHT" }),
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      aspectRatio:    (v) => v > 0 ? { "elk.aspectRatio": String(v) } : {},
      padding:        (v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    container: {
      direction:      (v) => ({ "elk.direction": ELK_DIRECTION[v] ?? "RIGHT" }),
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Force: {
    root: {
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      aspectRatio:    (v) => v > 0 ? { "elk.aspectRatio": String(v) } : {},
    },
    container: {
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Stress: {
    root: {
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      aspectRatio:    (v) => v > 0 ? { "elk.aspectRatio": String(v) } : {},
    },
    container: {
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Radial: {
    root: {
      layerSpacing:   (v) => ({ "elk.radial.radius": String(v) }),
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    container: {
      elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Grid: {
    root: {
      innerSpacing:   (v) => ({ "elk.spacing.nodeNode": String(v) }),
      aspectRatio:    (v) => v > 0 ? { "elk.aspectRatio": String(v) } : {},
      padding:        (v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    container: {
      innerSpacing:   (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Pack: {
    root: {
      innerSpacing:   (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    container: {
      innerSpacing:   (v) => ({ "elk.spacing.nodeNode": String(v) }),
      padding:        (v) => ({ "elk.padding": `[top=${v + CONTAINER_LABEL_CLEARANCE},left=${v},bottom=${v},right=${v}]` }),
    },
  },
};

/**
 * Map GUI params to ELK layout options for a given scope.
 * @param {string} algName   algorithm name (key in PARAM_MAPPING)
 * @param {Object} opts      graph.options
 * @param {string} scope     "root" | "container"
 * @returns {Object}         ELK layout options object
 */
function _mapParamsScoped(algName, opts, scope) {
  const entry = PARAM_MAPPING[algName];
  if (!entry || !entry[scope]) return {};
  const result = {};
  for (const [key, fn] of Object.entries(entry[scope])) {
    if (opts[key] !== undefined) Object.assign(result, fn(opts[key], opts));
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────


let _elk = null;
function _loadELK() {
  if (_elk) return _elk;
  try {
    _elk = require(REPO_ROOT + "node_modules/elkjs/index.js");
    console.log("ELK layout engine loaded.");
  } catch (e) {
    throw new Error("ELK module not loaded. Enable CommonJS in Archi Preferences > Scripting and use GraalVM.");
  }
  return _elk;
}

/**
 * Compute layout positions.
 * @param {LayoutGraph} graph  — { nodes, edges, options, algorithm, alignWidthSameType, sortContainers }
 * @returns {LayoutResult}     — { nodes, edges, viewWidth, viewHeight }
 */
function layout(graph) {
  const elk = _loadELK();
  const alg = ALGORITHMS[graph.algorithm];
  if (!alg) throw `ELK: unknown algorithm "${graph.algorithm}"`;

  // Map GUI params to ELK root options (SPLINES CONSERVATIVE mode inlined in _LAYERED_ROUTING)
  const rootEngineOpts = _mapParamsScoped(graph.algorithm, graph.options, "root");
  const layoutOptions  = Object.assign({ "elk.algorithm": alg.engineAlgorithmId }, rootEngineOpts);

  // Build ELK-internal data structures
  const nodeMap     = {};
  const parentMap   = {};
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

  const edgeList = [];
  const selfLoops = [];
  for (const edge of graph.edges) {
    if (!nodeMap[edge.source] || !nodeMap[edge.target]) continue;
    if (edge.source === edge.target) {
      // Self-loops are not reliably routed by ELK across all algorithms.
      // Collect for pass-through; the writer synthesises bendpoints.
      selfLoops.push(edge);
      continue;
    }
    const entry = {
      id:          edge.id,
      _archiRelId: edge.id,
      _relName:    edge.label || "",
      sources:     [edge.source],
      targets:     [edge.target],
    };
    if (edge.weight) entry.properties = { "elk.priority": edge.weight };
    edgeList.push(entry);
  }

  // Two-pass layout for alignWidthSameType: pass 1 → find max-width per same-type sibling group
  // → pass 2 with equalized leaf widths so ELK sizes containers to the equalized content.
  if (graph.alignWidthSameType && Object.values(parentMap).length > 0) {
    const containerIds = new Set(Object.values(parentMap));
    const origSizes = {};
    for (const id of Object.keys(nodeMap)) {
      if (!containerIds.has(id))  // leaf nodes only — containers are auto-sized by ELK in both passes
        origSizes[id] = { width: nodeMap[id].width, height: nodeMap[id].height };
    }
    const { elkGraph: pass1ElkGraph } = _buildELKGraph(layoutOptions, nodeMap, edgeList, parentMap, graph);
    console.log("Calculating layout (pass 1 — align width same type)...");
    const pass1Layouted = elk.layout(pass1ElkGraph);
    const equalizedSizes = _equalizeSiblings(pass1Layouted);
    _resetNodesForPass2(nodeMap, origSizes, equalizedSizes);
    console.log("Calculating layout (pass 2 — equalized widths)...");
  } else {
    console.log("Calculating layout...");
  }

  // ELK Radial requires a spanning tree (no cycles). Convert here so c2c terminates.
  const processedEdgeList = graph.algorithm === "Radial" ? _spanningTree(nodeMap, edgeList) : edgeList;
  const { elkGraph, liftedEdgesMap } = _buildELKGraph(layoutOptions, nodeMap, processedEdgeList, parentMap, graph);
  const layouted = elk.layout(elkGraph);
  console.log(`ELK result: width=${Math.round(layouted.width || 0)} height=${Math.round(layouted.height || 0)}`);

  // Extract LayoutResult
  const resultNodes = [];
  const resultEdges = [];

  // Flatten nodes with absolute positions
  _collectNodePositions(layouted, 0, 0, resultNodes);

  // Collect edges
  const isSplines = rootEngineOpts["elk.edgeRouting"] === "SPLINES";
  _collectEdgeResults(layouted, liftedEdgesMap, resultNodes, resultEdges, graph.options.labelPosition || "Middle", isSplines);

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

  return {
    nodes:      resultNodes,
    edges:      resultEdges,
    viewWidth:  Math.ceil(layouted.width  || 0) + 20,
    viewHeight: Math.ceil(layouted.height || 0) + 20,
  };
}

// ── Graph building ────────────────────────────────────────────────────────────

function _buildELKGraph(layoutOptions, nodeMap, edgeList, parentMap, graph) {
  _attachChildren(nodeMap, parentMap);
  _sortNodeChildren(nodeMap, graph.sortContainers);
  const rootChildren = _collectRootChildren(nodeMap, parentMap, graph.sortContainers);
  const rootEdges    = _classifyEdges(edgeList, parentMap, nodeMap);

  // Container nodes: let ELK auto-size from children + padding.
  // All per-container ELK options come from PARAM_MAPPING.container — direction, routing,
  // spacing, and padding (with CONTAINER_LABEL_CLEARANCE added to top).
  const containerEngineOpts = _mapParamsScoped(graph.algorithm, graph.options, "container");
  for (const [nodeId, node] of Object.entries(nodeMap)) {
    if (!node.children || node.children.length === 0) continue;
    delete node.width;   // ELK computes container size from children + padding
    delete node.height;
    node.layoutOptions = { "elk.algorithm": ALGORITHMS[graph.algorithm].engineAlgorithmId, ...containerEngineOpts };
  }

  const { liftedRootEdges, liftedEdgesMap } = _liftCrossHierarchyEdges(rootEdges, parentMap);
  const elkGraph = { id: "root", layoutOptions, children: rootChildren, edges: liftedRootEdges };
  // maxWidth / maxHeight as root graph bounds — ELK algorithms that support bounded layout use them.
  if (graph.options.maxWidth  > 0) elkGraph.width  = graph.options.maxWidth;
  if (graph.options.maxHeight > 0) elkGraph.height = graph.options.maxHeight;
  return { elkGraph, liftedEdgesMap };
}

function _spanningTree(nodeMap, edgeList) {
  // BFS spanning tree — removes cycles so ELK Radial's c2c traversal terminates.
  // Disconnected components are connected to the first root via virtual edges.
  const nodeIds = Object.keys(nodeMap);
  if (!nodeIds.length) return edgeList;

  const adj = {};
  for (const edge of edgeList) {
    const s = edge.sources[0], t = edge.targets[0];
    if (!s || !t) continue;
    (adj[s] = adj[s] || []).push({ id: t, edge });
    (adj[t] = adj[t] || []).push({ id: s, edge });
  }

  const visited = new Set();
  const treeEdges = [];
  const componentRoots = [];

  for (const startId of nodeIds) {
    if (visited.has(startId)) continue;
    componentRoots.push(startId);
    visited.add(startId);
    const queue = [startId];
    while (queue.length) {
      const cur = queue.shift();
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

function _attachChildren(nodeMap, parentMap) {
  for (const [childId, parentId] of Object.entries(parentMap)) {
    const parent = nodeMap[parentId];
    const child  = nodeMap[childId];
    if (parent && child && !parent.children.some(c => c.id === childId)) {
      parent.children.push(child);
    }
  }
}

function _sortNodeChildren(nodeMap, sortContainers) {
  for (const node of Object.values(nodeMap)) {
    if (node.children.length > 1) node.children = _sortChildren(node.children, sortContainers);
  }
}

function _sortChildren(children, sortContainers) {
  if (!sortContainers) {
    // Containers keep model order; only leaf nodes are sorted
    const leafIdxs = [], sorted = [];
    children.forEach((n, i) => { if (!n.children.length) { leafIdxs.push(i); sorted.push(n); } });
    sorted.sort(_byTypeName);
    const result = children.slice();
    leafIdxs.forEach((pos, i) => { result[pos] = sorted[i]; });
    return result;
  }
  const ctrs   = children.filter(n => n.children.length > 0).sort(_byTypeName);
  const leaves = children.filter(n => n.children.length === 0).sort(_byTypeName);
  return ctrs.concat(leaves);
}

function _byTypeName(a, b) {
  return (a._type || "").localeCompare(b._type || "") || (a._name || "").localeCompare(b._name || "");
}

function _collectRootChildren(nodeMap, parentMap, sortContainers) {
  const roots = Object.keys(nodeMap)
    .filter(id => parentMap[id] === undefined)
    .map(id => nodeMap[id]);
  return _sortChildren(roots, sortContainers);
}

function _classifyEdges(edgeList, parentMap, nodeMap) {
  const root = [];
  for (const edge of edgeList) {
    const sp = parentMap[edge.sources[0]];
    const tp = parentMap[edge.targets[0]];
    if (sp !== undefined && tp !== undefined && sp === tp) {
      const parent = nodeMap[sp];
      if (parent) { parent.edges = parent.edges || []; parent.edges.push(edge); continue; }
    }
    root.push(edge);
  }
  return root;
}


function _liftCrossHierarchyEdges(rootEdges, parentMap) {
  const liftedEdgesMap = {};
  const liftedRootEdges = rootEdges.map(edge => {
    const srcId = edge.sources[0], tgtId = edge.targets[0];
    let liftedSrc = srcId, p = parentMap[liftedSrc];
    while (p !== undefined) { liftedSrc = p; p = parentMap[liftedSrc]; }
    let liftedTgt = tgtId;
    p = parentMap[liftedTgt];
    while (p !== undefined) { liftedTgt = p; p = parentMap[liftedTgt]; }
    if (liftedSrc === liftedTgt) return null;
    if (liftedSrc !== srcId || liftedTgt !== tgtId) {
      liftedEdgesMap[edge.id] = { origSrcId: srcId, origTgtId: tgtId };
      return Object.assign({}, edge, { sources: [liftedSrc], targets: [liftedTgt] });
    }
    return edge;
  }).filter(Boolean);
  return { liftedRootEdges, liftedEdgesMap };
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
 * @param {object} section  ELK edge section
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
  const abs = p => ({ x: offsetX + p.x, y: offsetY + p.y });

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

function _collectNodePositions(elkNode, offsetX, offsetY, resultNodes, parentId) {
  for (const child of (elkNode.children || [])) {
    const absX = offsetX + (child.x || 0);
    const absY = offsetY + (child.y || 0);
    resultNodes.push({
      id:       child.id,
      x:        absX,
      y:        absY,
      width:    child.width  || 0,
      height:   child.height || 0,
      parentId: parentId || null,
    });
    _collectNodePositions(child, absX, absY, resultNodes, child.id);
  }
}

function _collectEdgeResults(elkNode, liftedEdgesMap, resultNodes, resultEdges, labelPosition, isSplines) {
  const containerNodeId = elkNode.id === "root" ? null : elkNode.id;
  const containerNode   = containerNodeId ? resultNodes.find(n => n.id === containerNodeId) : null;
  const offsetX = containerNode ? containerNode.x : 0;
  const offsetY = containerNode ? containerNode.y : 0;

  for (const edge of (elkNode.edges || [])) {
    const section = edge.sections && edge.sections[0];
    if (!section) continue;

    const lifted = liftedEdgesMap && liftedEdgesMap[edge.id];
    const originalId = edge._archiRelId || edge.id;

    // For SPLINES routing, ELK outputs Bézier control points which Archi would render as
    // polyline waypoints (Archi has no native Bézier rendering). Control points near the
    // element boundary produce a visible segment from the element centre. Fix: sample the
    // actual Bézier curve and give Archi points ON the curve instead.
    const bps = isSplines
      ? _sampleSplineSection(section, offsetX, offsetY, SPLINE_SAMPLE_POINTS)
      : (section.bendPoints || []).map(bp => ({
          x: Math.round(offsetX + bp.x), y: Math.round(offsetY + bp.y),
        }));

    // Label position
    const { labelX, labelY } = _computeLabelPoint(section, bps, offsetX, offsetY, labelPosition, edge._relName);

    resultEdges.push({
      id:            originalId,
      sourceId:      lifted ? lifted.origSrcId : edge.sources[0],
      targetId:      lifted ? lifted.origTgtId : edge.targets[0],
      bendpoints:    bps,
      labelX,
      labelY,
      isStraight:    edge._isStraight || false,
    });
  }

  for (const child of (elkNode.children || [])) {
    _collectEdgeResults(child, liftedEdgesMap, resultNodes, resultEdges, labelPosition, isSplines);
  }
}

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
 * Walk the pass-1 layout result and equalize leaf node widths within each container.
 *
 * Grouping: all children (leaves + sub-containers) are grouped by element type.
 * For each type group, leaf node widths are equalized to the maximum width found in
 * the group — this means a leaf next to a sub-container of the same type is widened
 * to match the sub-container's pass-1 width.
 *
 * Only leaf widths are changed; sub-containers are re-sized by ELK in pass 2.
 *
 * A single leaf with no same-type sibling (leaf or container) is left unchanged.
 *
 * Returns a map of node id → { width } for nodes whose width should be increased.
 */
function _equalizeSiblings(layouted) {
  const equalizedSizes = {};
  function walk(node) {
    if (!node.children || !node.children.length) return;
    node.children.forEach(walk);
    // Group ALL children by element type (leaves AND sub-containers contribute to maxW)
    const byType = {};
    for (const c of node.children) {
      (byType[c._type || ""] = byType[c._type || ""] || []).push(c);
    }
    for (const group of Object.values(byType)) {
      const leaves = group.filter(c => !c.children || !c.children.length);
      if (leaves.length === 0) continue;  // type group has only sub-containers — nothing to equalize
      const hasExtraContext = leaves.length >= 2 || group.some(c => c.children && c.children.length);
      if (!hasExtraContext) continue;     // single leaf, no same-type container sibling — skip
      const maxW = Math.max(...group.map(c => c.width || 0));
      for (const c of leaves) {
        if ((c.width || 0) < maxW) equalizedSizes[c.id] = { width: maxW };
      }
    }
  }
  walk(layouted);
  return equalizedSizes;
}

/**
 * Reset node state between pass 1 and pass 2.
 * Leaf nodes restore their original sizes (with equalization applied on top).
 * Container nodes get no explicit size — ELK auto-sizes them in pass 2 as well.
 */
function _resetNodesForPass2(nodeMap, origSizes, equalizedSizes) {
  for (const [id, node] of Object.entries(nodeMap)) {
    node.children = [];
    node.edges    = [];
    delete node.layoutOptions;
    delete node.x;
    delete node.y;
    if (origSizes[id]) { node.width = origSizes[id].width; node.height = origSizes[id].height; }
    else               { delete node.width; delete node.height; }  // container: ELK auto-sizes
  }
  for (const [id, sz] of Object.entries(equalizedSizes)) {
    if (nodeMap[id]) nodeMap[id].width = sz.width;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
