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
const { SPLINE_SAMPLE_POINTS, ALGORITHMS, DIRECTION_MAP } = Defs;
const { applyParams } = EngineUtils;

// Graphviz output is in points (72 pt/inch); multiply by PT2PX to get pixels (96 px/inch).
const PT2PX = 96 / 72;

// DIRECTION_MAP imported from defs.js — shared with dagre.js.

// Graphviz binary, found on the PATH.
const GRAPHVIZ_BIN = "dot";

// Seconds one Graphviz run may take. dot can hang on a rare bug; it runs on Archi's UI thread,
// so without a limit Archi freezes for good.
const GRAPHVIZ_TIMEOUT_S = 60;

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
// sep and esep are margins in points around each element (px → pt: × 72/96). Element distance is
// shared by two elements, so each gets half; a connection has no margin of its own, so esep is the
// whole Connection–element distance.
const _GV_SEP  = (/** @type {number} */ v) => ({ sep:  `+${(v / 2 * 72 / 96).toFixed(2)}` });
const _GV_ESEP = (/** @type {number} */ v) => ({ esep: `+${(v * 72 / 96).toFixed(2)}` });
// Neato, FDP, SFDP: their own spacing leaves elements closer than sep, and then the router finds
// elements touching within esep and draws every connection straight. prism removes overlap to sep
// and keeps the layout's shape.
const _GV_OVERLAP_SEP = (/** @type {number} */ v) => ({ overlap: "prism", ..._GV_SEP(v) });

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
    elementSpacing:           _GV_OVERLAP_SEP,
    connectionElementSpacing: _GV_ESEP,
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  FDP: {
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           _GV_OVERLAP_SEP,
    connectionElementSpacing: _GV_ESEP,
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  SFDP: {
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           _GV_OVERLAP_SEP,
    connectionElementSpacing: _GV_ESEP,
    diagramPadding:           _GV_PAD,
    aspectRatio:              (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  Twopi: {
    layerSpacing:  (v) => ({ ranksep: (v / 96).toFixed(4) }),
    // twopi alone leaves elements on top of each other when a ring is too small for them; vpsc
    // moves them apart (positions only), so the diameter follows the element size and distance
    // while a larger Layer distance still widens the rings.
    elementSpacing: (v) => ({ overlap: "vpsc", ..._GV_SEP(v) }),
    diagramPadding: _GV_PAD,
    aspectRatio:   (v) => v > 0 ? { ratio: (1/v).toFixed(4) } : {},
  },
  // mindist alone leaves wide elements overlapping on the circle; prism removes that.
  Circo: {
    circles:                  (v) => v === "Per cycle" ? {} : { oneblock: "true" },
    routing:                  (v) => ({ splines: _guiRoutingToGraphviz(v) }),
    elementSpacing:           (v) => ({ mindist: (v / 96).toFixed(4), ..._GV_OVERLAP_SEP(v) }),
    connectionElementSpacing: _GV_ESEP,
    diagramPadding:           _GV_PAD,
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

  // circo removes overlap only in a graph of one part; with more parts (a note, an unconnected
  // element) Graphviz itself removes it in a second run: neato -n1 keeps circo's positions, applies
  // the same overlap and sep, and routes the connections again.
  const secondRun = graph.algorithm === "Circo" && _partCount(graph) > 1;
  if (secondRun) console.log("  More than one part: overlap removed and connections routed in a second run (neato -n1)");
  const jsonOut = secondRun
    ? _runDot(_runGraphviz(dotSource, ["-Kcirco", "-Tdot"]), ["-Kneato", "-n1"])
    : _runDot(dotSource, ["-K" + alg.engineAlgorithmId]);
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

  // Twopi: a centre per connected part, and ring radii wide enough for the elements on them
  const twopi = graph.algorithm === "Twopi" ? _twopiRings(graph, opts) : null;
  if (twopi) engineOpts.ranksep = twopi.ranksep;
  // Circo per cycle: per part the centre of the block tree (one circle has no block tree)
  const circoRoots = graph.algorithm === "Circo" && !engineOpts.oneblock ? _circoRoots(graph) : null;
  // FDP removes overlap within its clusters itself; prism there only spreads the layout out.
  if (graph.algorithm === "FDP" && graph.nodes.some(n => n.parent)) delete engineOpts.overlap;

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
      const rootAttr = (twopi && twopi.roots.has(id)) || (circoRoots && circoRoots.has(id)) ? " root=true" : "";
      lines.push(`${indent}"${id}" [label="${label}"${szAttrs}${rootAttr}]`);
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

/**
 * Centres for circo per cycle: per connected part an element of its largest cycle — the one with
 * the most connections within that cycle, the first in input order on a tie. circo puts the
 * root's cycle in the middle and the other cycles and elements around it, each element at the
 * radius of the largest part hanging from the same element. Its own choice can be an element
 * outside every cycle: then its few neighbours sit as far out as the whole cycle part, with
 * connections across the view. A part without a cycle keeps circo's own choice.
 * @param {LayoutGraph} graph
 * @returns {Set<string>}  root element ids
 */
function _circoRoots(graph) {
  /** @type {Map<string, Set<string>>} */
  const adj = new Map(graph.nodes.map(n => [n.id, new Set()]));
  for (const e of graph.edges) {
    const a = adj.get(e.source), b = adj.get(e.target);
    if (e.source === e.target || !a || !b) continue;
    a.add(e.target);
    b.add(e.source);
  }
  // Blocks (biconnected components, Tarjan): a cycle and every cycle sharing two elements with it.
  /** @type {Map<string, number>} */
  const index = new Map(), low = new Map(), partOf = new Map();
  /** @type {[string, string][]} */
  const stack = [];
  /** @type {{ part: string, ids: Set<string>, edges: [string, string][] }[]} */
  const blocks = [];
  /** @type {(u: string, parent: string | null, part: string) => void} */
  const visit = (u, parent, part) => {
    index.set(u, index.size); low.set(u, index.get(u)); partOf.set(u, part);
    for (const w of /** @type {Set<string>} */ (adj.get(u))) {
      if (w === parent) continue;
      if (!index.has(w)) {
        stack.push([u, w]);
        visit(w, u, part);
        low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (low.get(w))));
        if (/** @type {number} */ (low.get(w)) >= /** @type {number} */ (index.get(u))) {
          /** @type {[string, string][]} */
          const edges = [];
          let top;
          do { top = /** @type {[string, string]} */ (stack.pop()); edges.push(top); } while (top[0] !== u || top[1] !== w);
          blocks.push({ part, ids: new Set(edges.flat()), edges });
        }
      } else if (/** @type {number} */ (index.get(w)) < /** @type {number} */ (index.get(u))) {
        stack.push([u, w]);
        low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (index.get(w))));
      }
    }
  };
  for (const n of graph.nodes) if (!index.has(n.id)) visit(n.id, null, n.id);

  const order = new Map(graph.nodes.map((n, i) => [n.id, i]));
  /** @type {Map<string, { part: string, ids: Set<string>, edges: [string, string][] }>} */
  const largest = new Map();   // part → its largest cycle (first found on a tie)
  for (const b of blocks) {
    const cur = largest.get(b.part);
    if (b.ids.size >= 3 && (!cur || b.ids.size > cur.ids.size)) largest.set(b.part, b);
  }
  /** @type {Set<string>} */
  const roots = new Set();
  for (const b of largest.values()) {
    /** @type {Map<string, number>} */
    const degree = new Map();
    for (const [x, y] of b.edges) { degree.set(x, (degree.get(x) || 0) + 1); degree.set(y, (degree.get(y) || 0) + 1); }
    const best = [...b.ids].sort((x, y) => /** @type {number} */ (degree.get(y)) - /** @type {number} */ (degree.get(x)) ||
                                          /** @type {number} */ (order.get(x)) - /** @type {number} */ (order.get(y)))[0];
    roots.add(best);
  }
  return roots;
}

/**
 * Centres and ring radii for twopi.
 * Centre: per connected part the element with the most connections (first in input order on a
 * tie). twopi's own choice ("most central node") can be an element at the edge, which puts the hub
 * on an outer ring with its connections running across the whole view.
 * Rings: element k steps from its centre lies on ring k, its centre on the circle. Layer distance is
 * the space between elements, as in Layered: a ring lies Layer distance plus the largest half
 * diagonal of each of the two rings outside the previous one (ring 1: outside the centre element),
 * so along the radius the space is at least Layer distance whatever the angle.
 * A full ring (its elements side by side with Element distance between them fill the circumference)
 * is that tight at Layer distance = element height, and grows and shrinks with Layer distance from
 * there; below element height its elements overlap and vpsc pushes them apart, so Layer distance
 * has a visible effect also on a full ring. twopi uses one list of radii for every part, so each
 * ring takes the largest over the parts.
 * @param {LayoutGraph} graph
 * @param {EffectiveParams} opts
 * @returns {{ roots: Set<string>, ranksep: string }}
 */
function _twopiRings(graph, opts) {
  const layerGap = opts.layerSpacing   ?? 96;   // twopi default: 1 inch
  const elemGap  = opts.elementSpacing ?? 0;
  const fullRingOffset = layerGap - (opts.elementHeight || 60);   // a full ring's radius relative to tight

  /** @type {Record<string, string[]>} */
  const adj = {};
  for (const n of graph.nodes) adj[n.id] = [];
  for (const e of graph.edges) {
    if (e.source === e.target || !adj[e.source] || !adj[e.target]) continue;
    adj[e.source].push(e.target);
    adj[e.target].push(e.source);
  }
  const widthOf = Object.fromEntries(graph.nodes.map(n => [n.id, n.width || opts.elementWidth || 140]));
  const halfDiag = Object.fromEntries(graph.nodes.map(n =>
    [n.id, Math.hypot(widthOf[n.id], n.height || opts.elementHeight || 60) / 2]));

  /** @type {Set<string>} */
  const roots = new Set();
  /** @type {Set<string>} */
  const seen  = new Set();
  /** @type {number[]} */
  const ringWidth = [];   // per ring: the largest sum of (width + Element distance) over the parts
  /** @type {number[]} */
  const ringReach = [];   // per ring: the largest half diagonal, ring 0 = the centres
  for (const start of graph.nodes) {
    if (seen.has(start.id)) continue;
    // Collect the connected part, in input order
    const part = [start.id];
    seen.add(start.id);
    for (let i = 0; i < part.length; i++) {
      for (const v of adj[part[i]]) if (!seen.has(v)) { seen.add(v); part.push(v); }
    }
    const inPart = new Set(part);
    const root = graph.nodes.filter(n => inPart.has(n.id))
      .reduce((best, n) => adj[n.id].length > adj[best.id].length ? n : best).id;
    roots.add(root);

    // Ring per element: breadth-first distance from the root
    /** @type {Record<string, number>} */
    const ring = { [root]: 0 };
    const queue = [root];
    /** @type {number[]} */
    const width = [];
    for (let i = 0; i < queue.length; i++) {
      const u = queue[i];
      if (ring[u] > 0) width[ring[u]] = (width[ring[u]] || 0) + widthOf[u] + elemGap;
      ringReach[ring[u]] = Math.max(ringReach[ring[u]] || 0, halfDiag[u]);
      for (const v of adj[u]) if (ring[v] === undefined) { ring[v] = ring[u] + 1; queue.push(v); }
    }
    width.forEach((w, k) => { ringWidth[k] = Math.max(ringWidth[k] || 0, w); });
  }

  // twopi's ranksep list: radius of ring 1, then the step to each next ring
  /** @type {number[]} */
  const steps = [];
  let radius = 0;
  for (let k = 1; k < ringWidth.length; k++) {
    const r = Math.max(radius + ringReach[k - 1] + layerGap + ringReach[k], ringWidth[k] / (2 * Math.PI) + fullRingOffset);
    steps.push(r - radius);
    radius = r;
  }
  if (!steps.length) steps.push(layerGap);
  return { roots, ranksep: steps.map(s => (s / 96).toFixed(4)).join(":") };
}

// ── Dot binary execution ──────────────────────────────────────────────────────

/**
 * @param {string} dotSource
 * @param {string[]} args   engine options, e.g. ["-Kcirco"]
 * @returns {GraphvizJson}
 */
function _runDot(dotSource, args) {
  const stdout = _runGraphviz(dotSource, ["-Tjson", ...args]);
  try { return JSON.parse(stdout); }
  catch (e) { throw new Error("Failed to parse Graphviz JSON output: " + e); }
}

/**
 * Unconnected parts of the layout graph (elements linked by connections or containment).
 * @param {LayoutGraph} graph
 * @returns {number}
 */
function _partCount(graph) {
  /** @type {Map<string, string>} */
  const up = new Map(graph.nodes.map(n => [n.id, n.id]));
  const find = (/** @type {string} */ id) => { let r = id; while (up.get(r) !== r) r = /** @type {string} */ (up.get(r)); return r; };
  const join = (/** @type {string} */ a, /** @type {string} */ b) => { if (up.has(a) && up.has(b)) up.set(find(a), find(b)); };
  for (const e of graph.edges) join(e.source, e.target);
  for (const n of graph.nodes) if (n.parent) join(n.id, n.parent);
  return new Set(graph.nodes.map(n => find(n.id))).size;
}

/**
 * Run the Graphviz binary on DOT source; returns its standard output.
 * @param {string}   dotSource
 * @param {string[]} args  e.g. ["-Tjson", "-Kcirco"]
 * @returns {string}
 */
function _runGraphviz(dotSource, args) {
  const ProcessBuilder   = Java.type("java.lang.ProcessBuilder");
  const Arrays           = Java.type("java.util.Arrays");
  const Files            = Java.type("java.nio.file.Files");
  const StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
  const TimeUnit         = Java.type("java.util.concurrent.TimeUnit");

  // Input and both outputs go through files: no pipe can block, so the timed wait is the only wait.
  const inFile  = Files.createTempFile("graphviz", ".gv");
  const outFile = Files.createTempFile("graphviz", ".out");
  const errFile = Files.createTempFile("graphviz", ".err");
  try {
    Files.writeString(inFile, dotSource, StandardCharsets.UTF_8);
    const pb = new ProcessBuilder(Arrays.asList(GRAPHVIZ_BIN, ...args));
    pb.redirectInput(inFile.toFile());
    pb.redirectOutput(outFile.toFile());
    pb.redirectError(errFile.toFile());
    let proc;
    try { proc = pb.start(); }
    catch (e) {
      throw new Error(`Graphviz '${GRAPHVIZ_BIN}' not found on the PATH.\nInstall Graphviz (graphviz.org) and ensure '${GRAPHVIZ_BIN}' is on the system PATH.`);
    }

    if (!proc.waitFor(GRAPHVIZ_TIMEOUT_S, TimeUnit.SECONDS)) {
      proc.destroyForcibly().waitFor(5, TimeUnit.SECONDS);   // let go of the files before they are deleted
      throw new Error(`Graphviz did not finish within ${GRAPHVIZ_TIMEOUT_S} s and was stopped.\nTry another algorithm or a smaller selection.`);
    }
    const code = proc.exitValue();
    if (code !== 0) throw new Error(`Graphviz exited with code ${code}.\n${String(Files.readString(errFile)).trim()}`);
    return String(Files.readString(outFile, StandardCharsets.UTF_8));
  } finally {
    Files.deleteIfExists(inFile);
    Files.deleteIfExists(outFile);
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
  /** @type {Record<string, GvBox>} */
  const clusters = {};
  _walkJSON(jsonOut, nodes, clusters, totalH);

  // Every engine that nests (dot, fdp) emits a box per cluster; neato, which does not, ignores
  // clusters when placing elements and so does not nest.
  /** @type {LayoutResultNode[]} */
  const resultNodes = [];
  for (const node of graph.nodes) {
    const isContainer = graph.nodes.some(m => m.parent === node.id);
    const pos = (isContainer && clusters[node.id]) ? clusters[node.id] : nodes[node.id];
    if (!pos) continue;
    resultNodes.push({ id: node.id, x: pos.x, y: pos.y, width: pos.w, height: pos.h, parentId: node.parent || null });
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
 * @param {Record<string, GvBox>} clusters  filled: container id → box
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
    /** @type {{ start: Point, end: Point } | null} */
    let ports = null;
    if (!skipBend && dotEdge.pos) {
      // Samples of a short curve round to the same pixel: keep one.
      bendpoints = _flattenSpline(String(dotEdge.pos), totalH, splines)
        .map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))
        .filter((p, i, a) => i === 0 || p.x !== a[i - 1].x || p.y !== a[i - 1].y);
      ports = _splineEnds(String(dotEdge.pos), totalH);
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
      // Where the line leaves and enters the elements, so the writer's label points stay outside them.
      ...(ports ? { srcPort: ports.start, tgtPort: ports.end } : {}),
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
 * Ends of an edge on the element borders, in px: the arrow tips (s, e) when present, else the
 * first and last point of the curve — Graphviz clips the curve at the borders.
 * @param {string} posStr  Graphviz edge pos: [e,x,y] [s,x,y] x,y ...
 * @param {number} totalH
 * @returns {{ start: Point, end: Point } | null}
 */
function _splineEnds(posStr, totalH) {
  /** @type {Point | null} */
  let s = null, e = null;
  /** @type {Point[]} */
  const pts = [];
  for (const tok of posStr.trim().split(/\s+/)) {
    const p = tok.split(",");
    const xy = p.length === 3 ? p.slice(1) : p;
    const pt = { x: Math.round(parseFloat(xy[0]) * PT2PX), y: Math.round((totalH - parseFloat(xy[1])) * PT2PX) };
    if (isNaN(pt.x) || isNaN(pt.y)) continue;
    if (p[0] === "s") s = pt; else if (p[0] === "e") e = pt; else pts.push(pt);
  }
  if (pts.length < 2) return null;
  return { start: s || pts[0], end: e || pts[pts.length - 1] };
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
    .map(([k, v]) => { const s = String(v); return (/[,:\s]/.test(s) || s.charAt(0) === '+') ? `${k}="${s}"` : `${k}=${s}`; })
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { layout };
}
