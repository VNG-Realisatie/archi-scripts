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
console.log("Loading engines/graphviz.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs         = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./engine-utils")} */
const EngineUtils  = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { SPLINE_SAMPLE_POINTS, ALGORITHMS, DIRECTION_MAP, CONTAINER_LABEL_CLEARANCE } = Defs;
const { applyParams } = EngineUtils;

// Graphviz output is in points (72 pt/inch); multiply by PT2PX to get pixels (96 px/inch).
const PT2PX = 96 / 72;

// DIRECTION_MAP imported from defs.js — shared with dagre.js.

// Graphviz binary, found on the PATH.
const GRAPHVIZ_BIN = "dot";

// Derived: set of Graphviz algorithm names (used for engine validation guard).
const GRAPHVIZ_ALGORITHMS = new Set(
  Object.entries(ALGORITHMS).filter(([, v]) => v.engine === "Graphviz").map(([k]) => k)
);

const GRAPHVIZ_EDGE_CLEARANCE_ORTHO  = '+24';
const GRAPHVIZ_EDGE_CLEARANCE_CURVED = '+8';

// ── Engine-specific parameter mapping ────────────────────────────────────────
// Maps GUI param names to Graphviz graph attribute key/value pairs.
// Defined after _guiRoutingToGraphviz so that function can be referenced here.
// Note: px → inches conversion uses / 96 (96 DPI screen).

// maxWidth is not supported: Graphviz 'size' scales node sizes (forbidden — SPEC §8, no post-layout scaling),
// and spreading positions afterwards can only widen, never narrow. View size = aspectRatio only.
const _GV_PAD = (/** @type {number} */ v) => ({ pad: (v / 96).toFixed(4) });

/** @type {ParamMapping} */
const PARAM_MAPPING = {
  Dot: {
    direction:                (v) => ({ rankdir: DIRECTION_MAP[v] }),
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    layerSpacing:             (v) => ({ ranksep: (v / 96).toFixed(4) }),
    elementSpacing:           (v) => ({ nodesep: (v / 96).toFixed(4) }),
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  Neato: {
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           (v) => ({ sep: `+${(v / 96).toFixed(4)}` }),
    connectionElementSpacing: (v) => ({ esep: `+${(v / 96).toFixed(4)}` }),
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  FDP: {
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           (v) => ({ sep: `+${(v / 96).toFixed(4)}` }),
    connectionElementSpacing: (v) => ({ esep: `+${(v / 96).toFixed(4)}` }),
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  SFDP: {
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           (v) => ({ sep: `+${(v / 96).toFixed(4)}` }),
    connectionElementSpacing: (v) => ({ esep: `+${(v / 96).toFixed(4)}` }),
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  Twopi: {
    layerSpacing:  (v) => ({ ranksep: (v / 96).toFixed(4) }),
    // twopi alone leaves elements on top of each other when a ring is too small for them; vpsc
    // moves them apart (positions only), so the diameter follows the element size and distance
    // while a larger Layer distance still widens the rings.
    elementSpacing: (v) => ({ overlap: "vpsc", sep: `+${(v / 96).toFixed(4)}` }),
    diagramPadding: _GV_PAD,
    aspectRatio:   (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  Circo: {
    elementSpacing: (v) => ({ mindist: (v / 96).toFixed(4) }),
    diagramPadding: _GV_PAD,
    aspectRatio:    (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
};

// _applyParams — provided by engine-utils.js as applyParams(algName, opts, mapping)

/**
 * Compute layout positions.
 * @param {LayoutGraph} graph
 * @returns {LayoutResult}
 */
function layout(graph) {
  const alg = ALGORITHMS[graph.algorithm];
  if (!alg || alg.engine !== "Graphviz") throw `Graphviz adapter: unknown algorithm "${graph.algorithm}"`;

  const dotSource = _buildDOT(graph);
  const _graphLine = dotSource.split("\n").find(l => l.trim().startsWith("graph [")) || "";
  console.log(`Running Graphviz (${alg.engineAlgorithmId})...`);
  console.log(`  DOT graph attrs: ${_graphLine.trim()}`);

  const jsonOut = _runDot(dotSource, alg.engineAlgorithmId);
  const _rawBb  = String(jsonOut.bb || "—");
  const _bbParts = _rawBb.split(",").map(parseFloat);
  const _bbWpx  = _bbParts.length === 4 ? Math.round((_bbParts[2] - _bbParts[0]) * (96 / 72)) : "?";
  const _bbHpx  = _bbParts.length === 4 ? Math.round((_bbParts[3] - _bbParts[1]) * (96 / 72)) : "?";
  console.log(`  Graphviz bb: ${_rawBb}  →  ${_bbWpx} × ${_bbHpx} px`);

  return _extractResult(graph, jsonOut);
}

// ── DOT source builder ────────────────────────────────────────────────────────

/**
 * @typedef {{ x: number, y: number, w: number, h: number }} GvBox  a node or cluster box in px
 * @typedef {{ x: number, y: number, w?: number, h?: number, maxX?: number, maxY?: number }} GvCluster
 *   a cluster box, or (inside _deriveClusterBBs) an accumulator still being grown
 */

/**
 * @param {LayoutGraph} graph
 * @returns {string} DOT source
 */
function _buildDOT(graph) {
  const PX_TO_IN = 1 / 96;
  const opts     = graph.options;

  // Map GUI params to Graphviz graph attributes
  const engineOpts = applyParams(graph.algorithm, opts, PARAM_MAPPING);
  const splines    = engineOpts.splines || "polyline";
  const gvEP       = graph.engineParams && graph.engineParams.Graphviz;
  // esep priority: engineParams.Graphviz.esep > connectionElementSpacing mapping > routing-based default.
  // engineOpts.esep (from connectionElementSpacing) must be extracted and deleted before _renderGraphvizAttrs
  // to avoid duplication — esep is placed explicitly in graphAttrs below.
  const esep       = (gvEP && gvEP.esep != null)
    ? String(gvEP.esep)
    : (engineOpts.esep != null)
    ? String(engineOpts.esep)
    : (splines === "ortho" ? GRAPHVIZ_EDGE_CLEARANCE_ORTHO : GRAPHVIZ_EDGE_CLEARANCE_CURVED);
  delete engineOpts.esep;

  // Node dimensions — not graph-level attributes; kept inline
  const nodeW        = ((opts.elementWidth  || 140) * PX_TO_IN).toFixed(4);
  const nodeH        = ((opts.elementHeight || 60)  * PX_TO_IN).toFixed(4);
  const clusterMargin = Math.round((opts.padding ?? 20) * 0.75);  // container padding, px → pt (96dpi → 72pt/inch)

  const gAttrStr   = _renderGraphvizAttrs(engineOpts);

  const graphAttrs = `${gAttrStr} compound=true margin=0 esep="${esep}"`;

  // Build nodeId → children map from parent references
  /** @type {Record<string, string[]>} */
  const childrenOf = {};
  /** @type {Set<string>} */
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

  /**
   * @param {string}      id
   * @param {string}      indent
   * @param {Set<string>} [visiting]
   */
  function writeNode(id, indent, visiting) {
    if (!visiting) visiting = new Set();
    if (visiting.has(id)) return;
    visiting.add(id);
    const children = childrenOf[id] || [];
    const node     = graph.nodes.find(n => n.id === id);
    const label    = node ? (node.label || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"') : "";
    if (children.length > 0) {
      lines.push(`${indent}subgraph "cluster_${id}" {`);
      lines.push(`${indent}  graph [margin=${clusterMargin} label="${label}"]`);
      lines.push(`${indent}  "${id}"`);
      children.forEach(cid => writeNode(cid, indent + "  ", visiting));
      lines.push(`${indent}}`);
    } else {
      // Per-node size override: add width/height when they differ from the global default
      // (e.g. when expandNodeSizesForEdgeDensity inflated a hub node).
      let szAttrs = "";
      if (node) {
        const w = (node.width  * PX_TO_IN), h = (node.height * PX_TO_IN);
        if (Math.abs(w - parseFloat(nodeW)) > 0.001 || Math.abs(h - parseFloat(nodeH)) > 0.001)
          szAttrs = ` width=${w.toFixed(4)} height=${h.toFixed(4)} fixedsize=true`;
      }
      lines.push(`${indent}"${id}" [label="${label}"${szAttrs}]`);
    }
    visiting.delete(id);
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
    const lbl = (edge.label || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
    let attrs = `eid="${edge.id}"`;
    if (lbl) attrs += ` xlabel="${lbl}"`;
    lines.push(`  "${edge.source}" -> "${edge.target}" [${attrs}]`);
  }

  lines.push("}");
  return lines.join("\n");
}

// ── Dot binary execution ──────────────────────────────────────────────────────

/**
 * @param {string} dotSource
 * @param {string} engine   Graphviz layout engine (-K)
 * @returns {GraphvizJson}
 */
function _runDot(dotSource, engine) {
  const ProcessBuilder   = Java.type("java.lang.ProcessBuilder");
  const Arrays           = Java.type("java.util.Arrays");
  const Files            = Java.type("java.nio.file.Files");
  const StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
  const JString          = Java.type("java.lang.String");
  const Writer           = Java.type("java.io.OutputStreamWriter");

  // stderr goes to a file: left unread in a pipe while stdout is read, a full pipe blocks dot.
  const errFile = Files.createTempFile("graphviz", ".err");
  try {
    const pb = new ProcessBuilder(Arrays.asList(GRAPHVIZ_BIN, "-Tjson", "-K" + engine));
    pb.redirectError(ProcessBuilder.Redirect.to(errFile.toFile()));
    let proc;
    try { proc = pb.start(); }
    catch (e) {
      throw new Error(`Graphviz '${GRAPHVIZ_BIN}' not found on the PATH.\nInstall Graphviz (graphviz.org) and ensure '${GRAPHVIZ_BIN}' is on the system PATH.`);
    }

    const wr = new Writer(proc.getOutputStream(), StandardCharsets.UTF_8);
    wr.write(dotSource);
    wr.close();

    const stdout = String(new JString(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
    const code = proc.waitFor();
    if (code !== 0) throw new Error(`Graphviz exited with code ${code}.\n${String(Files.readString(errFile)).trim()}`);

    try { return JSON.parse(stdout); }
    catch (e) { throw new Error("Failed to parse Graphviz JSON output: " + e); }
  } finally {
    Files.deleteIfExists(errFile);
  }
}

// ── Origin normalisation ──────────────────────────────────────────────────────
// Shift all coordinates so no position is negative (min(x) >= 0, min(y) >= 0) and round them.
// Node sizes and relative positions are unchanged. Graphviz has no max-width control: view
// size is set by aspect ratio only (Graphviz 'size' would scale elements — SPEC §8).
/**
 * @param {LayoutResultNode[]} resultNodes
 * @param {LayoutResultEdge[]} resultEdges
 */
function _normalizeOrigin(resultNodes, resultEdges) {
  if (!resultNodes.length) return;
  let nx0 = Infinity, ny0 = Infinity;
  for (const n of resultNodes) { if (n.x < nx0) nx0 = n.x; if (n.y < ny0) ny0 = n.y; }
  const shiftX = Math.min(nx0, 0);
  const shiftY = Math.min(ny0, 0);

  for (const n of resultNodes) {
    n.x = Math.round(n.x - shiftX);
    n.y = Math.round(n.y - shiftY);
  }
  for (const e of resultEdges) {
    e.bendpoints = e.bendpoints.map(bp => ({ x: Math.round(bp.x - shiftX), y: Math.round(bp.y - shiftY) }));
    e.labelX = Math.round((e.labelX || 0) - shiftX);
    e.labelY = Math.round(e.labelY - shiftY);
  }
}

// ── Result extraction ─────────────────────────────────────────────────────────

/**
 * @param {LayoutGraph}  graph
 * @param {GraphvizJson} jsonOut
 * @returns {LayoutResult}
 */
function _extractResult(graph, jsonOut) {
  const bb     = _parseBb(String(jsonOut.bb || "0,0,0,0"));
  const totalH = bb.ury;

  /** @type {Record<string, GvBox>} */
  const nodes    = {};
  /** @type {Record<string, GvCluster>} */
  const clusters = {};
  _walkJSON(jsonOut, nodes, clusters, totalH);

  // Derive cluster bounding boxes for engines that don't emit them (neato/fdp/sfdp)
  const childSet = new Set();
  for (const node of graph.nodes) { if (node.parent) childSet.add(node.id); }
  const padding = graph.options.padding ?? 20;
  _deriveClusterBBs(graph.nodes, nodes, clusters, childSet, padding);

  /** @type {LayoutResultNode[]} */
  const resultNodes = [];
  for (const node of graph.nodes) {
    const isContainer = graph.nodes.some(m => m.parent === node.id);
    const pos = (isContainer && clusters[node.id]) ? clusters[node.id] : nodes[node.id];
    if (!pos) continue;
    // Casts: after _deriveClusterBBs every cluster is a full box.
    resultNodes.push({ id: node.id, x: pos.x, y: pos.y, width: /** @type {number} */ (pos.w), height: /** @type {number} */ (pos.h), parentId: node.parent || null });
  }

  const splines  = _guiRoutingToGraphviz(graph.options.routing || "Polyline");
  const skipBend = splines === "line";
  const labelPos = graph.options.labelPosition || "Natural";

  /** @type {LayoutResultEdge[]} */
  const resultEdges = [];
  _walkEdges(jsonOut, graph.edges, totalH, splines, skipBend, labelPos, resultEdges);

  _normalizeOrigin(resultNodes, resultEdges);

  let maxX = 0, maxY = 0;
  for (const n of resultNodes) { maxX = Math.max(maxX, n.x + n.width); maxY = Math.max(maxY, n.y + n.height); }

  return { nodes: resultNodes, edges: resultEdges, viewWidth: maxX + 20, viewHeight: maxY + 20 };
}

/**
 * @param {GraphvizJson | undefined}  obj
 * @param {Record<string, GvBox>}     nodes     filled: node name → box
 * @param {Record<string, GvCluster>} clusters  filled: container id → box
 * @param {number}                    totalH    graph height in points (y is flipped)
 */
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

/**
 * @param {GraphvizJson}       jsonOut
 * @param {LayoutEdge[]}       graphEdges
 * @param {number}             totalH
 * @param {string}             splines      Graphviz splines value
 * @param {boolean}            skipBend     straight lines: no bendpoints
 * @param {string}             labelPos     labelPosition param
 * @param {LayoutResultEdge[]} resultEdges  filled
 */
function _walkEdges(jsonOut, graphEdges, totalH, splines, skipBend, labelPos, resultEdges) {
  if (!jsonOut.edges) return;
  for (const dotEdge of jsonOut.edges) {
    const eid = String((dotEdge.attrs && dotEdge.attrs.eid) || dotEdge.eid || "");
    if (!eid) continue;

    const originalEdge = graphEdges.find(e => e.id === eid);
    if (!originalEdge) continue;

    /** @type {Point[]} */
    let bendpoints = [];
    if (!skipBend && dotEdge.pos) {
      bendpoints = _flattenSpline(String(dotEdge.pos), totalH, splines).map(p => ({
        x: Math.round(p.x), y: Math.round(p.y),
      }));
    }

    // Natural label position from Graphviz lp attribute
    let labelX = 0, labelY = 0;
    if (labelPos === "Natural" && dotEdge.lp) {
      const lp = _parseXY(String(dotEdge.lp));
      labelX = Math.round(lp.x * PT2PX);
      labelY = Math.round((totalH - lp.y) * PT2PX);
    } else if (bendpoints.length > 0) {
      const pos  = labelPos === "Source" ? 0
                 : labelPos === "Target" ? bendpoints.length - 1
                 : Math.floor(bendpoints.length / 2);
      labelX = bendpoints[pos].x;
      labelY = bendpoints[pos].y;
    }

    resultEdges.push({
      id:         eid,
      conceptId:  originalEdge.conceptId,
      sourceId:   originalEdge.source,
      targetId:   originalEdge.target,
      bendpoints,
      labelX,
      labelY,
      isStraight: skipBend,
    });
  }
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

/** @param {string} s */
function _parseBb(s) {
  const p = s.split(",").map(parseFloat);
  return { llx: p[0], lly: p[1], urx: p[2], ury: p[3] };
}

/** @param {string} s */
function _parseXY(s) {
  const p = s.split(",");
  return { x: parseFloat(p[0]), y: parseFloat(p[1]) };
}

/**
 * @param {LayoutNode[]}              graphNodes
 * @param {Record<string, GvBox>}     nodes
 * @param {Record<string, GvCluster>} clusters  extended in place
 * @param {Set<string>}               childSet
 * @param {number}                    padding
 */
function _deriveClusterBBs(graphNodes, nodes, clusters, childSet, padding) {
  /** @type {Record<string, string>} */
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
        x: bb.x - padding, y: bb.y - (padding + CONTAINER_LABEL_CLEARANCE),
        w: (bb.maxX - bb.x) + 2 * padding,
        h: (/** @type {number} */ (bb.maxY) - bb.y) + 2 * padding + CONTAINER_LABEL_CLEARANCE,   // Cast: set with maxX
      };
    }
  }
}

/**
 * @param {string} posStr      Graphviz edge pos
 * @param {number} totalH
 * @param {string} splineType  Graphviz splines value
 * @returns {Point[]}
 */
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
  if (pts.length < 2) return [];
  if (pts.length < 4) {
    const f = pts[0], l = pts[pts.length - 1];
    return [{ x: Math.round((f.x + l.x) / 2), y: Math.round((f.y + l.y) / 2) }];
  }

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
  // Ortho/polyline straight segment: 4-point path with no interior bends.
  if (bps.length === 0) {
    const f = pts[0], l = pts[pts.length - 1];
    return [{ x: Math.round((f.x + l.x) / 2), y: Math.round((f.y + l.y) / 2) }];
  }
  return bps;
}

/**
 * @param {string} routing  routing param
 * @returns {string}        Graphviz splines value
 */
function _guiRoutingToGraphviz(routing) {
  switch (routing) {
    case "Orthogonal":          return "ortho";
    case "Polyline":            return "polyline";
    case "Straight":            return "line";
    case "Spline (approximated)": return "spline";
    default:                    return "polyline";
  }
}

/**
 * Render a {key: value} object as a DOT graph attribute string.
 * Values containing commas or spaces are double-quoted; others are unquoted.
 * @param {Record<string, unknown>} attrs
 * @returns {string}
 */
function _renderGraphvizAttrs(attrs) {
  return Object.entries(attrs)
    .filter(([, v]) => v !== null && v !== undefined && String(v) !== '')
    .map(([k, v]) => { const s = String(v); return (/[,\s]/.test(s) || s.charAt(0) === '+') ? `${k}="${s}"` : `${k}=${s}`; })
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
