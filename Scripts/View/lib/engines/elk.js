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
const { mapParams, ALGORITHMS, SPLINE_SAMPLE_POINTS } = Defs;

const NESTED_LABEL_TOP_EXTRA = 30; // extra top padding to avoid container label overlap

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
 * @param {LayoutGraph} graph  — { nodes, edges, options, algorithm, alignSameType, sortContainers }
 * @returns {LayoutResult}     — { nodes, edges, viewWidth, viewHeight }
 */
function layout(graph) {
  const elk = _loadELK();
  const alg = ALGORITHMS[graph.algorithm];
  if (!alg) throw `ELK: unknown algorithm "${graph.algorithm}"`;

  // Map GUI params to ELK options
  const engineOpts = mapParams(graph.algorithm, graph.options);
  const layoutOptions = Object.assign(
    { "elk.algorithm": alg.engineAlgorithmId },
    engineOpts
  );

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

  // Two-pass layout for alignSameType
  if (graph.alignSameType && Object.values(parentMap).length > 0) {
    const origSizes = {};
    for (const id of Object.keys(nodeMap)) {
      origSizes[id] = { width: nodeMap[id].width, height: nodeMap[id].height };
    }
    const { elkGraph: pass1ElkGraph } = _buildELKGraph(layoutOptions, nodeMap, edgeList, parentMap, graph);
    console.log("Calculating layout (pass 1 — align same type)...");
    const pass1Layouted = elk.layout(pass1ElkGraph);
    const globalMinW = _collectMinContainerW(pass1Layouted, graph.options.maxWidth || 0, graph.options.padding || 0);
    const { equalizedSizes, extraHPaddings } = _equalizeSiblings(pass1Layouted, globalMinW);
    _resetNodesForPass2(nodeMap, origSizes, equalizedSizes, extraHPaddings);
    console.log("Calculating layout (pass 2 — equalized sizes)...");
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
  _collectEdgeResults(layouted, liftedEdgesMap, resultNodes, resultEdges, graph.options.labelPosition || "Middle");

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
  _dimensionCompounds(nodeMap, parentMap, graph);
  const { liftedRootEdges, liftedEdgesMap } = _liftCrossHierarchyEdges(rootEdges, parentMap);
  return {
    elkGraph: { id: "root", layoutOptions, children: rootChildren, edges: liftedRootEdges },
    liftedEdgesMap,
  };
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

function _dimensionCompounds(nodeMap, parentMap, graph) {
  const padding  = graph.options.padding        || 20;
  const spacing  = graph.options.innerSpacing   || 20;
  const nodeW    = graph.options.elementWidth   || 140;
  const nodeH    = graph.options.elementHeight  || 60;
  const maxWidth = graph.options.maxWidth       || 0;

  for (const [nodeId, node] of Object.entries(nodeMap)) {
    if (!node.children || node.children.length === 0) continue;
    let depth = 0, pp = parentMap[nodeId];
    while (pp !== undefined) { depth++; pp = parentMap[pp]; }

    const ph   = padding + (node._extraHPadding || 0);
    const top  = padding + NESTED_LABEL_TOP_EXTRA;
    const n    = node.children.length;
    const kSqrt = Math.max(1, Math.floor(1.2 * Math.sqrt(n)));
    const capW  = maxWidth > 0 ? maxWidth - 2 * ph : 0;
    const kMax  = capW > 0 ? Math.max(1, Math.floor(capW / (nodeW + spacing))) : kSqrt;
    const k     = Math.min(kSqrt, kMax);
    const rows  = Math.ceil(n / k);

    node.width  = k * nodeW + (k - 1) * spacing + 2 * ph;
    node.height = rows * nodeH + (rows - 1) * spacing + top + padding;

    node.layoutOptions = {
      "elk.padding":          `[top=${top},left=${ph},bottom=${padding},right=${ph}]`,
      "elk.spacing.nodeNode": String(spacing),
      "elk.algorithm":        ALGORITHMS[graph.algorithm].engineAlgorithmId,
      "elk.nodeSize.constraints": "FIXED_SIZE",
    };
    // Propagate direction and routing for algorithms that support it
    if (graph.options.direction) {
      const elkDir = Defs.ELK_DIRECTION[graph.options.direction];
      if (elkDir) node.layoutOptions["elk.direction"] = elkDir;
    }
  }
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

function _collectEdgeResults(elkNode, liftedEdgesMap, resultNodes, resultEdges, labelPosition) {
  const containerNodeId = elkNode.id === "root" ? null : elkNode.id;
  const containerNode   = containerNodeId ? resultNodes.find(n => n.id === containerNodeId) : null;
  const offsetX = containerNode ? containerNode.x : 0;
  const offsetY = containerNode ? containerNode.y : 0;

  for (const edge of (elkNode.edges || [])) {
    const section = edge.sections && edge.sections[0];
    if (!section) continue;

    const lifted = liftedEdgesMap && liftedEdgesMap[edge.id];
    const originalId = edge._archiRelId || edge.id;

    const bps = [];
    for (const bp of (section.bendPoints || [])) {
      bps.push({ x: Math.round(offsetX + bp.x), y: Math.round(offsetY + bp.y) });
    }

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
    _collectEdgeResults(child, liftedEdgesMap, resultNodes, resultEdges, labelPosition);
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

function _collectMinContainerW(layoutPass1, maxWidth, padding) {
  let minW = Infinity;
  const walk = node => {
    if (!node.children || !node.children.length) return;
    if (node.id !== "root" && node.width < minW) minW = node.width;
    node.children.forEach(walk);
  };
  walk(layoutPass1);
  if (maxWidth > 0 && isFinite(minW)) {
    const capW = maxWidth - 2 * padding;
    if (capW > 0 && minW > capW) minW = capW;
  }
  return minW;
}

function _equalizeSiblings(layout, globalMinW) {
  const equalizedSizes = {}, extraHPaddings = {};
  const walk = node => {
    if (!node.children || !node.children.length) return;
    node.children.forEach(walk);
    const hasContainerSibling = node.children.some(c => c.children && c.children.length);
    if (!hasContainerSibling) return;
    const containerType = node._type;
    for (const c of node.children) {
      if (!c.children || !c.children.length) {
        if (containerType && c._type === containerType) equalizedSizes[c.id] = { width: globalMinW };
      } else if (c.width < globalMinW) {
        extraHPaddings[c.id] = (globalMinW - c.width) / 2;
      }
    }
  };
  walk(layout);
  return { equalizedSizes, extraHPaddings };
}

function _resetNodesForPass2(nodeMap, origSizes, equalizedSizes, extraHPaddings) {
  for (const [id, node] of Object.entries(nodeMap)) {
    node.children = [];
    node.edges = [];
    delete node.layoutOptions;
    delete node.x;
    delete node.y;
    delete node._extraHPadding;
    node.width  = origSizes[id].width;
    node.height = origSizes[id].height;
  }
  for (const [id, sz] of Object.entries(equalizedSizes)) {
    if (nodeMap[id]) nodeMap[id].width = sz.width;
  }
  for (const [id, ep] of Object.entries(extraHPaddings)) {
    if (nodeMap[id]) nodeMap[id]._extraHPadding = ep;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
