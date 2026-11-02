#!/usr/bin/env node
/**
 * Rule checks (Node, no Archi): every preset × algorithm × view × action of the test model, as write_plans.js
 * runs them, tested against the SPEC rules instead of an earlier run. Says what is wrong, not only that
 * something changed.
 *
 * Elements (the layout result):
 *   size       a leaf keeps the size of the layout graph (SPEC rule 1); Same width per level only widens
 *   overlap    no two siblings overlap
 *   outside    a child lies inside its container
 *   padding    and at least Padding from its sides
 *   same       the same input twice gives the same result (SPEC rule 12; not FDP, Known gap 16)
 *   view size  a Max width / Max height the result exceeds is logged as not reached
 * Lines (as the writer will draw them: its bendpoints from the element centres, Archi's chopbox ends):
 *   end room   the first and last segment are at least CONNECTION_END_ROOM long, or run on in the
 *              direction of the next, so the end symbol takes its direction from the line (test case 13)
 *   label      a Middle label sits where the line passes closest to the engine's label point: Archi puts it
 *              at the middle of the drawn points (not checked: a line without bendpoints, whose label is at
 *              Archi's middle, and a label point in the end room, which the writer keeps free)
 *   self-loop  an algorithm without self-loops writes none; with them, the loop has bendpoints, none
 *              inside the element (else Archi draws it inside)
 *
 * --variants: the variants of baseline.json instead (variants.js, as write_plans.js --variants).
 *
 * Run: node Scripts/View/tools/layout_checks.js [model.archimate] [--variants] [--in-process] [--check | --write]
 * Exit 1 when a rule is broken; each violation is one line. --check compares them with the known violations
 * in test/expected/layout-violations[-variants].txt (findings not fixed yet; expected.js), --write rewrites it.
 */
const fs = require("fs");
const path = require("path");

const log = console.log;
/** @type {string[]} */
let captured = [];
console.log = (/** @type {any} */ m) => { captured.push(String(m)); };   // the plan's console, read by "view size"
const H        = require(path.join(__dirname, "view_harness.js"));
const Defs     = require(path.join(__dirname, "..", "lib", "defs.js"));
const Expected = require(path.join(__dirname, "expected.js"));
const Variants = require(path.join(__dirname, "variants.js"));

const TOLERANCE = 1;   // px: rounding in the adapters and the writer
const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
const inProcess = process.argv.includes("--in-process");
const VIEW = path.join(__dirname, "..");
const model = H.loadModel(args[0] || path.join(VIEW, "test/model/view-test.archimate"));
const presetDir = path.join(VIEW, "presets/Test/baseline");
const presets = fs.readdirSync(presetDir).filter(f => f.endsWith(".json")).sort();
const VIEWS = ["1 Nesting", "2 Edited", "3 Network"];
const ACTIONS = [Defs.ACTION.NEW_VIEW.id, Defs.ACTION.EXPAND_VIEW.id, Defs.ACTION.LAYOUT_ONLY.id];

const variants = process.argv.includes("--variants");
/** @type {string[]} */
const violations = [];
let runs = 0;
for (const run of variants ? _variantRuns() : _presetRuns()) {
  const view = H.findView(model, "Views/Test/" + run.viewName);
  captured = [];
  const planned = H.planView(model, view, run.preset, run.action, inProcess);
  if (!planned) continue;
  runs++;
  const again = run.algorithm in Expected.UNSTABLE_ALGORITHMS ? null : H.planView(model, view, run.preset, run.action, inProcess);
  for (const v of checkRun(planned, again, captured, run.algorithm)) violations.push(`${run.tag}: ${v}`);
}
log(`${runs} runs, ${violations.length ? violations.length + " violations" : "no violations"}`);
// --check: the known violations (findings not fixed yet) in test/expected/layout-violations[-variants].txt
const knownFile = variants ? "layout-violations-variants.txt" : "layout-violations.txt";
if (process.argv.includes("--check") || process.argv.includes("--write")) Expected.report(violations, knownFile, log);
else { violations.forEach(v => log(v)); if (violations.length) process.exitCode = 1; }

/** @typedef {{tag: string, preset: object, algorithm: string, viewName: string, action: string}} Run */

/** Every preset × algorithm × view × action, as write_plans.js. @returns {Run[]} */
function _presetRuns() {
  /** @type {Run[]} */
  const out = [];
  for (const file of presets) {
    for (const algorithm of Object.keys(Defs.ALGORITHMS)) {
      const raw = JSON.parse(fs.readFileSync(path.join(presetDir, file), "utf8"));
      const preset = Defs.validatePreset({ ...raw, algorithm });
      for (const viewName of VIEWS) {
        for (const action of ACTIONS) out.push({ tag: `${file} ${algorithm} ${viewName} ${action}`, preset, algorithm, viewName, action });
      }
    }
  }
  return out;
}

/** The variants of baseline.json, New view, as write_plans.js --variants. @returns {Run[]} */
function _variantRuns() {
  const raw = JSON.parse(fs.readFileSync(path.join(presetDir, "baseline.json"), "utf8"));
  /** @type {Run[]} */
  const out = [];
  for (const algorithm of Object.keys(Defs.ALGORITHMS)) {
    for (const variant of Variants.variantsOf(algorithm, Defs.validatePreset({ ...raw, algorithm }).params)) {
      const preset = Defs.validatePreset({ ...raw, algorithm, params: variant.params });
      for (const viewName of VIEWS) out.push({ tag: `${algorithm} ${viewName} ${variant.name}`, preset, algorithm, viewName, action: Defs.ACTION.NEW_VIEW.id });
    }
  }
  return out;
}

/**
 * Every rule on one run.
 * @param {{graph: LayoutGraph, result: LayoutResult, writePlan: WritePlan}} planned
 * @param {{result: LayoutResult} | null} again  the same run once more, null when not compared
 * @param {string[]} console  the run's console lines
 * @param {string} algorithm
 * @returns {string[]}
 */
function checkRun(planned, again, console, algorithm) {
  const { graph, result, writePlan } = planned;
  const byId = new Map(result.nodes.map(n => [n.id, n]));
  return [
    ..._sizes(graph, byId),
    ..._siblings(result),
    ..._containment(result, byId, graph.options),
    ...(again && JSON.stringify(again.result) !== JSON.stringify(result) ? ["same: a second run gives another result"] : []),
    ..._viewSize(result, graph.options, console),
    ..._lines(writePlan, result, byId, graph.options),
    ..._selfLoops(writePlan, result, algorithm),
  ];
}

/**
 * @param {LayoutGraph} graph
 * @param {Map<string, LayoutResultNode>} byId
 */
function _sizes(graph, byId) {
  const parents = new Set(Object.values(graph._parentMap));
  // Same width per level widens leaves to their level's width in the engine (ARCHITECTURE § Sizing).
  const widthOk = graph.alignWidthSameType ? (/** @type {number} */ w, /** @type {number} */ w0) => w >= w0 : (/** @type {number} */ w, /** @type {number} */ w0) => w === w0;
  return graph.nodes.filter(n => !parents.has(n.id)).flatMap(n => {
    const r = byId.get(n.id);
    if (!r) return [`size: ${n.label} not in the result`];
    return widthOk(r.width, n.width) && r.height === n.height ? [] : [`size: ${n.label} ${n.width}×${n.height} became ${r.width}×${r.height}`];
  });
}

/** @param {LayoutResult} result */
function _siblings(result) {
  /** @type {Map<string | null, LayoutResultNode[]>} */
  const byParent = new Map();
  for (const n of result.nodes) byParent.set(n.parentId, [...(byParent.get(n.parentId) || []), n]);
  const out = [];
  for (const kids of byParent.values()) {
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const o = _overlap(kids[i], kids[j]);
        if (o > TOLERANCE) out.push(`overlap: ${kids[i].id} and ${kids[j].id} by ${o} px`);
      }
    }
  }
  return out;
}

/**
 * @param {LayoutResult} result
 * @param {Map<string, LayoutResultNode>} byId
 * @param {EffectiveParams} params
 */
function _containment(result, byId, params) {
  const padding = Number(params.padding) || 0;
  const out = [];
  for (const n of result.nodes) {
    const p = n.parentId && byId.get(n.parentId);
    if (!p) continue;
    const gaps = { left: n.x - p.x, top: n.y - p.y, right: p.x + p.width - n.x - n.width, bottom: p.y + p.height - n.y - n.height };
    const side = /** @type {(keyof typeof gaps)[]} */ (Object.keys(gaps));
    const outside = side.filter(s => gaps[s] < -TOLERANCE);
    const tight = side.filter(s => gaps[s] >= -TOLERANCE && gaps[s] < padding - TOLERANCE);
    if (outside.length) out.push(`outside: ${n.id} out of ${p.id} at ${outside.map(s => `${s} ${-gaps[s]} px`).join(", ")}`);
    if (tight.length) out.push(`padding: ${n.id} in ${p.id} ${tight.map(s => `${s} ${gaps[s]} px`).join(", ")} (Padding ${padding})`);
  }
  return out;
}

/**
 * @param {LayoutResult} result
 * @param {EffectiveParams} params
 * @param {string[]} console
 */
function _viewSize(result, params, console) {
  const roots = result.nodes.filter(n => !n.parentId);
  if (!roots.length) return [];
  const width = Math.max(...roots.map(n => n.x + n.width)) - Math.min(...roots.map(n => n.x));
  const height = Math.max(...roots.map(n => n.y + n.height)) - Math.min(...roots.map(n => n.y));
  const logged = console.some(l => /not reach/i.test(l));
  const out = [];
  const maxWidth = Number(params.maxWidth) || 0, maxHeight = Number(params.maxHeight) || 0;
  if (maxWidth && width > maxWidth + TOLERANCE && !logged) out.push(`view size: ${width} px wide, Max width ${maxWidth}, not logged as not reached`);
  if (maxHeight && height > maxHeight + TOLERANCE && !logged) out.push(`view size: ${height} px high, Max height ${maxHeight}, not logged as not reached`);
  return out;
}

/**
 * The lines the plan creates between two laid-out nodes, as Archi draws them.
 * @param {WritePlan} writePlan
 * @param {LayoutResult} result
 * @param {Map<string, LayoutResultNode>} byId
 * @param {EffectiveParams} params
 */
function _lines(writePlan, result, byId, params) {
  const middle = params.labelPosition === "Middle";
  const edgeById = new Map(result.edges.map(e => [e.conceptId, e]));
  const out = [];
  for (const c of writePlan.connections) {
    if (!("relation" in c) || !("node" in c.source) || !("node" in c.target)) continue;
    const src = byId.get(c.source.node), tgt = byId.get(c.target.node);
    if (!src || !tgt || src === tgt) continue;
    const name = `${c.relation.name || c.relation.type} ${src.id}→${tgt.id}`;
    const points = _drawnPoints(src, tgt, c.style.bendpoints);
    if (c.style.bendpoints.length) {
      const n = points.length;
      for (const [end, a, b, next] of /** @type {[string, Point, Point, Point][]} */ ([["first", points[0], points[1], points[2]], ["last", points[n - 1], points[n - 2], points[n - 3]]])) {
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        if (length < Defs.CONNECTION_END_ROOM - TOLERANCE && _turn(a, b, next) > 10) {
          out.push(`end room: ${name} ${end} segment ${Math.round(length)} px, ${Math.round(_turn(a, b, next))}° off the next`);
        }
      }
    }
    const re = edgeById.get(c.relation.id);
    // A line without bendpoints gets no label points: Archi's middle is the label's place. Nor does a
    // label point in the end room the writer keeps free (or inside an element).
    const label = re ? { x: re.labelX, y: re.labelY } : null;
    if (middle && re && label && (re.labelX || re.labelY) && c.relation.name && c.style.bendpoints.length &&
        Math.min(_boxDistance(label, src), _boxDistance(label, tgt)) >= Defs.CONNECTION_END_ROOM) {
      const m = _middle(points);
      const off = Math.hypot(m.x - label.x, m.y - label.y) - _lineDistance(label, points);
      if (off > 2) out.push(`label: ${name} drawn ${Math.round(off)} px further from the label point than the line`);
    }
  }
  return out;
}

/**
 * @param {WritePlan} writePlan
 * @param {LayoutResult} result
 * @param {string} algorithm
 */
function _selfLoops(writePlan, result, algorithm) {
  const supports = Defs.ALGORITHMS[algorithm].supportsSelfLoops;
  const byId = new Map(result.nodes.map(n => [n.id, n]));
  const out = [];
  for (const c of writePlan.connections) {
    if (!("relation" in c) || !_sameRef(c.source, c.target)) continue;
    if (!supports) { out.push(`self-loop: ${c.relation.id} written, the algorithm has no self-loops`); continue; }
    const box = "node" in c.source ? byId.get(c.source.node) : null;
    if (!box) continue;
    if (!c.style.bendpoints.length) { out.push(`self-loop: ${c.relation.id} without bendpoints, drawn inside ${box.id}`); continue; }
    const c0 = _center(box);
    const inside = c.style.bendpoints.filter(b => _inside({ x: c0.x + b.startX, y: c0.y + b.startY }, box));
    if (inside.length) out.push(`self-loop: ${c.relation.id} has ${inside.length} bendpoints inside ${box.id}`);
  }
  return out;
}

/**
 * Archi's point list of a line: the chopbox anchors on both elements and the bendpoints between.
 * @param {Box} src
 * @param {Box} tgt
 * @param {Bendpoint[]} bendpoints  relative to the element centres
 * @returns {Point[]}
 */
function _drawnPoints(src, tgt, bendpoints) {
  const sc = _center(src);
  const bps = bendpoints.map(b => ({ x: sc.x + b.startX, y: sc.y + b.startY }));
  const toSrc = bps.length ? bps[0] : _center(tgt), toTgt = bps.length ? bps[bps.length - 1] : sc;
  return [_chopbox(src, toSrc), ...bps, _chopbox(tgt, toTgt)];
}

/**
 * Where a line from the box centre toward a point leaves the box (draw2d ChopboxAnchor).
 * @param {Box} b
 * @param {Point} toward
 */
function _chopbox(b, toward) {
  const c = _center(b);
  const dx = toward.x - c.x, dy = toward.y - c.y;
  if (!dx && !dy) return c;
  const t = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity);
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/**
 * Where Archi puts a Middle label: the middle point of the list, or the middle of the middle segment.
 * @param {Point[]} points
 */
function _middle(points) {
  const n = points.length;
  if (n % 2) return points[(n - 1) / 2];
  const a = points[n / 2 - 1], b = points[n / 2];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Distance from a point to a polyline.
 * @param {Point} p
 * @param {Point[]} points
 */
function _lineDistance(p, points) {
  let best = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}

/**
 * The angle (degrees) between segment a→b and segment b→c.
 * @param {Point} a
 * @param {Point} b
 * @param {Point} c
 */
function _turn(a, b, c) {
  const d = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(c.y - b.y, c.x - b.x)) * 180 / Math.PI;
  return Math.min(d, 360 - d);
}

/** The writer's centre (write_plan.js rounds it). @param {Box} b */
function _center(b) {
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
}

/** Distance from a point to a box; 0 inside (as write_plan.js). @param {Point} p @param {Box} b */
function _boxDistance(p, b) {
  return Math.hypot(Math.max(b.x - p.x, 0, p.x - (b.x + b.width)), Math.max(b.y - p.y, 0, p.y - (b.y + b.height)));
}

/** @param {Point} p @param {Box} b */
function _inside(p, b) {
  return p.x > b.x && p.x < b.x + b.width && p.y > b.y && p.y < b.y + b.height;
}

/** The smaller of the two overlaps of two boxes, 0 when apart. @param {Box} a @param {Box} b */
function _overlap(a, b) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.round(Math.min(ox, oy)) : 0;
}

/** @param {VisualRef} a @param {VisualRef} b */
function _sameRef(a, b) {
  return ("node" in a && "node" in b && a.node === b.node) || ("visual" in a && "visual" in b && a.visual === b.visual);
}
