/**
 * Graphviz (dot binary) engine adapter.
 *
 * Accepts a normalized LayoutGraph, builds DOT source, runs the dot binary,
 * parses the JSON output, returns a LayoutResult.
 *
 * Docs: https://graphviz.org/docs/attrs/
 * Spline sampling: converts cubic Bézier control points to SPLINE_SAMPLE_POINTS
 * intermediate points per segment, approximating curves in Archi via bendpoints.
 */
console.log("engines/dot.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Defs = require(REPO_ROOT + "View/lib/defs");
const { GV_BIN_DEFAULT, PT2PX, SPLINE_SAMPLE_POINTS, RANKDIR, ALGORITHMS } = Defs;

const GV_EDGE_CLEARANCE_ORTHO  = '+24';
const GV_EDGE_CLEARANCE_CURVED = '+8';

/**
 * Compute layout positions.
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const alg = ALGORITHMS[graph.algorithm];
  if (!alg || alg.engine !== "Graphviz") throw `Graphviz adapter: unknown algorithm "${graph.algorithm}"`;

  const dotSource = _buildDOT(graph);
  console.log(`Running Graphviz (${alg.engineAlgorithmId})...`);

  const jsonOut = _runDot(dotSource, alg.engineAlgorithmId, graph.options.graphvizBin || GV_BIN_DEFAULT);
  return _extractResult(graph, jsonOut);
}

// ── DOT source builder ────────────────────────────────────────────────────────

function _buildDOT(graph) {
  const PX_TO_IN = 1 / 96;
  const alg      = ALGORITHMS[graph.algorithm];
  const opts     = graph.options;
  const splines  = _guiRoutingToGv(opts.routing || "Polyline");
  const esep     = splines === "ortho" ? GV_EDGE_CLEARANCE_ORTHO : GV_EDGE_CLEARANCE_CURVED;

  const nodeW    = ((opts.elementWidth  || 140) * PX_TO_IN).toFixed(4);
  const nodeH    = ((opts.elementHeight || 60)  * PX_TO_IN).toFixed(4);
  const ranksep  = ((opts.layerSpacing  || 180) * PX_TO_IN).toFixed(4);
  const nodesep  = ((opts.elementSpacing || 40) * PX_TO_IN).toFixed(4);
  const padding  = opts.padding || 20;

  let graphAttrs = `rankdir=${RANKDIR[opts.direction] || "LR"} ranksep=${ranksep} nodesep=${nodesep} splines=${splines} compound=true margin=0 esep="${esep}"`;

  const maxWidth  = opts.maxWidth  || 0;
  const maxHeight = opts.maxHeight || 0;
  const ar        = opts.aspectRatio || 0;
  if (maxWidth > 0 && maxHeight > 0) {
    graphAttrs += ` size="${(maxWidth / 96).toFixed(3)},${(maxHeight / 96).toFixed(3)}"`;
  } else if (maxWidth > 0) {
    graphAttrs += ` size="${(maxWidth / 96).toFixed(3)},999"`;
  } else if (maxHeight > 0) {
    graphAttrs += ` size="999,${(maxHeight / 96).toFixed(3)}"`;
  } else if (ar > 0) {
    graphAttrs += ` ratio="${(1 / ar).toFixed(4)}"`;
  }

  // Build nodeId → children map from parent references
  const childrenOf = {};
  const childSet   = new Set();
  for (const node of graph.nodes) {
    if (node.parent) {
      if (!childrenOf[node.parent]) childrenOf[node.parent] = [];
      childrenOf[node.parent].push(node.id);
      childSet.add(node.id);
    }
  }

  const lines = [
    'digraph G {',
    `  graph [${graphAttrs}]`,
    `  node [shape=rectangle width=${nodeW} height=${nodeH} fixedsize=true label=""]`,
  ];

  function writeNode(id, indent) {
    const children = childrenOf[id] || [];
    const node     = graph.nodes.find(n => n.id === id);
    const label    = node ? (node.label || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') : "";
    if (children.length > 0) {
      lines.push(`${indent}subgraph "cluster_${id}" {`);
      lines.push(`${indent}  graph [margin=${padding} label="${label}"]`);
      lines.push(`${indent}  "${id}"`);
      children.forEach(cid => writeNode(cid, indent + "  "));
      lines.push(`${indent}}`);
    } else {
      lines.push(`${indent}"${id}" [label="${label}"]`);
    }
  }

  // Write root nodes (not children)
  for (const node of graph.nodes) {
    if (!childSet.has(node.id)) writeNode(node.id, "  ");
  }

  // Invisible edges when no real edges exist (ensures proper layout spacing)
  if (graph.edges.length === 0 && childSet.size > 0) {
    const rootIds = graph.nodes.filter(n => !childSet.has(n.id)).map(n => n.id);
    for (let i = 0; i < rootIds.length - 1; i++) {
      lines.push(`  "${rootIds[i]}" -> "${rootIds[i + 1]}" [style=invis weight=1]`);
    }
  }

  // Write edges
  for (const edge of graph.edges) {
    const srcId = edge.reversed ? edge.target : edge.source;
    const tgtId = edge.reversed ? edge.source : edge.target;
    const lbl   = (edge.label || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    let attrs   = `eid="${edge.id}"`;
    if (lbl) attrs += ` xlabel="${lbl}"`;
    lines.push(`  "${srcId}" -> "${tgtId}" [${attrs}]`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ── Dot binary execution ──────────────────────────────────────────────────────

function _runDot(dotSource, engine, binPath) {
  const ProcessBuilder = Java.type("java.lang.ProcessBuilder");
  const Arrays         = Java.type("java.util.Arrays");
  const bin = (binPath && binPath.trim()) ? binPath.trim() : GV_BIN_DEFAULT;

  let proc;
  try {
    const pb = new ProcessBuilder(Arrays.asList(bin, "-Tjson", "-K" + engine));
    pb.redirectErrorStream(false);
    proc = pb.start();
  } catch (e) {
    throw new Error(`Graphviz not found at '${bin}'.\nInstall Graphviz (graphviz.org) and ensure 'dot' is on the system PATH.`);
  }

  const wr = new java.io.OutputStreamWriter(proc.getOutputStream(), "UTF-8");
  wr.write(dotSource);
  wr.close();

  let line, stdout = "";
  const br = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getInputStream(), "UTF-8"));
  while ((line = br.readLine()) !== null) stdout += line + "\n";
  br.close();

  let eline, stderr = "";
  const er = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getErrorStream(), "UTF-8"));
  while ((eline = er.readLine()) !== null) stderr += eline + "\n";
  er.close();

  const code = proc.waitFor();
  if (code !== 0) throw new Error(`Graphviz exited with code ${code}.\n${stderr.trim()}`);

  try { return JSON.parse(stdout); }
  catch (e) { throw new Error("Failed to parse Graphviz JSON output: " + e); }
}

// ── Result extraction ─────────────────────────────────────────────────────────

function _extractResult(graph, jsonOut) {
  const bb     = _parseBb(String(jsonOut.bb || "0,0,0,0"));
  const totalH = bb.ury;
  const totalW = bb.urx * PT2PX;

  const nodes    = {};
  const clusters = {};
  _walkJSON(jsonOut, nodes, clusters, totalH);

  // Derive cluster bounding boxes for engines that don't emit them (neato/fdp/sfdp)
  const childSet = new Set();
  for (const node of graph.nodes) { if (node.parent) childSet.add(node.id); }
  const padding = graph.options.padding || 20;
  _deriveClusterBBs(graph.nodes, nodes, clusters, childSet, padding);

  // Scale to maxWidth if needed
  const maxWidth = graph.options.maxWidth || 0;
  let scale = 1;
  if (maxWidth > 0 && totalW > maxWidth + 1) {
    scale = maxWidth / totalW;
    for (const d of [nodes, clusters]) {
      for (const o of Object.values(d)) {
        o.x = Math.round(o.x * scale); o.y = Math.round(o.y * scale);
        o.w = Math.round(o.w * scale); o.h = Math.round(o.h * scale);
      }
    }
  }

  const resultNodes = [];
  const containerIds = new Set(graph.nodes.filter(n => childSet.has(n.id) || (graph.nodes.some(m => m.parent === n.id))).map(n => n.id));

  for (const node of graph.nodes) {
    const isContainer = graph.nodes.some(m => m.parent === node.id);
    const pos = (isContainer && clusters[node.id]) ? clusters[node.id] : nodes[node.id];
    if (!pos) continue;
    resultNodes.push({ id: node.id, x: pos.x, y: pos.y, width: pos.w, height: pos.h });
  }

  const splines      = _guiRoutingToGv(graph.options.routing || "Polyline");
  const skipBend     = splines === "line";
  const labelPos     = graph.options.labelPosition || "Natural";

  const resultEdges  = [];
  _walkEdges(jsonOut, graph.edges, totalH, splines, skipBend, labelPos, resultEdges, scale);

  let maxX = 0, maxY = 0;
  for (const n of resultNodes) { maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height); }

  return { nodes: resultNodes, edges: resultEdges, viewWidth: maxX + 20, viewHeight: maxY + 20 };
}

function _walkJSON(obj, nodes, clusters, totalH) {
  if (!obj || typeof obj !== "object") return;
  const name = String(obj.name || "");

  if (obj.bb && name.startsWith("cluster_")) {
    const id = name.substring("cluster_".length);
    const bb = _parseBb(String(obj.bb));
    clusters[id] = {
      x: Math.round(bb.llx * PT2PX),
      y: Math.round((totalH - bb.ury) * PT2PX),
      w: Math.round((bb.urx - bb.llx) * PT2PX),
      h: Math.round((bb.ury - bb.lly) * PT2PX),
    };
  }

  if (obj.pos && name && !name.startsWith("cluster_")) {
    const pos = _parseXY(String(obj.pos));
    const nw  = obj.width  ? Math.round(parseFloat(String(obj.width))  * 96) : 140;
    const nh  = obj.height ? Math.round(parseFloat(String(obj.height)) * 96) : 60;
    nodes[name] = {
      x: Math.round(pos.x * PT2PX - nw / 2),
      y: Math.round((totalH - pos.y) * PT2PX - nh / 2),
      w: nw, h: nh,
    };
  }

  if (obj.objects) {
    for (let i = 0; i < obj.objects.length; i++) _walkJSON(obj.objects[i], nodes, clusters, totalH);
  }
}

function _walkEdges(jsonOut, graphEdges, totalH, splines, skipBend, labelPos, resultEdges, scale) {
  if (!jsonOut.edges) return;
  for (const dotEdge of jsonOut.edges) {
    const eid = String((dotEdge.attrs && dotEdge.attrs.eid) || dotEdge.eid || "");
    if (!eid) continue;

    const originalEdge = graphEdges.find(e => e.id === eid);
    if (!originalEdge) continue;

    const headId = String(dotEdge.head || "");
    const tailId = String(dotEdge.tail || "");

    let bendpoints = [];
    if (!skipBend && dotEdge.pos) {
      bendpoints = _flattenSpline(String(dotEdge.pos), totalH, splines).map(p => ({
        x: Math.round(p.x * scale), y: Math.round(p.y * scale),
      }));
    }

    // Natural label position from Graphviz lp attribute
    let labelX = 0, labelY = 0;
    if (labelPos === "Natural" && dotEdge.lp) {
      const lp = _parseXY(String(dotEdge.lp));
      labelX = Math.round(lp.x * PT2PX * scale);
      labelY = Math.round((totalH - lp.y) * PT2PX * scale);
    } else if (bendpoints.length > 0) {
      const pos  = labelPos === "Source" ? 0
                 : labelPos === "Target" ? bendpoints.length - 1
                 : Math.floor(bendpoints.length / 2);
      labelX = bendpoints[pos].x;
      labelY = bendpoints[pos].y;
    }

    const isReversed = originalEdge.reversed || false;
    resultEdges.push({
      id:         eid,
      sourceId:   isReversed ? originalEdge.target : originalEdge.source,
      targetId:   isReversed ? originalEdge.source : originalEdge.target,
      bendpoints,
      labelX,
      labelY,
      isStraight: skipBend,
    });
  }
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

function _parseBb(s) {
  const p = s.split(",").map(parseFloat);
  return { llx: p[0], lly: p[1], urx: p[2], ury: p[3] };
}

function _parseXY(s) {
  const p = s.split(",");
  return { x: parseFloat(p[0]), y: parseFloat(p[1]) };
}

function _deriveClusterBBs(graphNodes, nodes, clusters, childSet, padding) {
  const parentOf = {};
  for (const n of graphNodes) { if (n.parent) parentOf[n.id] = n.parent; }
  for (const [childId, parentId] of Object.entries(parentOf)) {
    if (clusters[parentId]) continue;
    const childPos  = nodes[childId];
    const parentPos = nodes[parentId];
    for (const p of [childPos, parentPos]) {
      if (!p) continue;
      const acc = clusters[parentId] || { x: Infinity, y: Infinity, maxX: -Infinity, maxY: -Infinity };
      acc.x    = Math.min(acc.x,    p.x);
      acc.y    = Math.min(acc.y,    p.y);
      acc.maxX = Math.max(acc.maxX || -Infinity, p.x + p.w);
      acc.maxY = Math.max(acc.maxY || -Infinity, p.y + p.h);
      clusters[parentId] = acc;
    }
  }
  for (const [id, bb] of Object.entries(clusters)) {
    if (bb.maxX !== undefined) {
      clusters[id] = {
        x: bb.x - padding, y: bb.y - padding,
        w: (bb.maxX - bb.x) + 2 * padding,
        h: (bb.maxY - bb.y) + 2 * padding,
      };
    }
  }
}

function _flattenSpline(posStr, totalH, splineType) {
  let s = posStr.trim();
  if (s.startsWith("e,")) s = s.substring(s.indexOf(" ") + 1);

  const pts = [];
  for (const tok of s.trim().split(/\s+/)) {
    const p = tok.split(",");
    if (p.length >= 2) {
      const x = parseFloat(p[0]), y = parseFloat(p[1]);
      if (!isNaN(x) && !isNaN(y)) pts.push({ x: x * PT2PX, y: (totalH - y) * PT2PX });
    }
  }
  if (pts.length < 4) return [];

  const useBezier = splineType === "spline" || splineType === "curved";
  const bps = [];

  if (useBezier) {
    const numSegs = Math.floor((pts.length - 1) / 3);
    for (let seg = 0; seg < numSegs; seg++) {
      const P0 = pts[seg*3], P1 = pts[seg*3+1], P2 = pts[seg*3+2], P3 = pts[seg*3+3];
      const n = SPLINE_SAMPLE_POINTS;
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const m = 1 - t;
        bps.push({
          x: Math.round(m*m*m*P0.x + 3*m*m*t*P1.x + 3*m*t*t*P2.x + t*t*t*P3.x),
          y: Math.round(m*m*m*P0.y + 3*m*m*t*P1.y + 3*m*t*t*P2.y + t*t*t*P3.y),
        });
      }
      if (seg < numSegs - 1) bps.push({ x: Math.round(P3.x), y: Math.round(P3.y) });
    }
  } else {
    // Ortho / polyline: segment endpoints are corners; skip first and last boundaries
    for (let i = 3; i < pts.length - 1; i += 3) bps.push(pts[i]);
  }
  return bps;
}

function _guiRoutingToGv(routing) {
  switch (routing) {
    case "Orthogonal":          return "ortho";
    case "Polyline":            return "polyline";
    case "Straight":            return "line";
    case "Spline (approximated)": return "spline";
    default:                    return "polyline";
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
