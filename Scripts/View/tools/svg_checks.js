#!/usr/bin/env node
/**
 * Rendering checks (Node): the SVGs Archi drew (test/render_views.ajs) tested for what the model file cannot
 * show. Archi's SVG (Batik) holds each element as a <rect>, each text as glyph paths with its own clip
 * rectangle, a line as a <path> and an end symbol as a <polygon>; elements are drawn before the lines.
 * The element boxes come from the model file and are matched to the SVG's rects.
 *
 *   text cut      a text's glyphs reach outside its clip rectangle (a name or connection label cut off)
 *   clipped       an element drawn smaller than its box: its container cuts it off
 *   end symbol    an arrowhead or diamond more than 10° off the direction of the line's last 20 px (Archi aims
 *                 it along the last segment: a short stub at an angle turns it), or its tip not on an element
 *   label over    a connection label over an element or over another label
 *   line through  a line through an element it does not start or end at (or, a self-loop, through its own)
 *
 * Run: node Scripts/View/tools/svg_checks.js <render dir> <model.archimate> [--check[=<file>] | --write[=<file>]]
 *        render dir: the folder render_views.ajs wrote (its SVGs and index.json)
 * Exit 1 on a violation; --check compares them with the known ones in test/expected/svg-violations.txt
 * (findings not fixed yet), or in another file of that folder.
 */
const fs = require("fs");
const path = require("path");

const log = console.log;
console.log = () => {};
const H = require(path.join(__dirname, "view_harness.js"));
const Expected = require(path.join(__dirname, "expected.js"));

const TOLERANCE = 1.5;   // px: Batik rounds coordinates, draw2d draws lines 1 px wide
const MAX_TURN = 10;     // degrees between an end symbol and its segment
const SEEN_LENGTH = 20;  // px of line before an end that give the direction it is seen to arrive from
const OUTLINE_INSET = 4; // px: how far inside its box a rounded figure's outline can meet a line (corner radius 10)

const [dir, modelFile] = process.argv.slice(2).filter(a => !a.startsWith("--"));
if (!dir || !modelFile) { log("usage: node Scripts/View/tools/svg_checks.js <render dir> <model.archimate> [--check | --write]"); process.exit(2); }
const model = H.loadModel(modelFile);
const index = JSON.parse(fs.readFileSync(path.join(dir, "index.json"), "utf8"));

/** @type {string[]} */
const violations = [];
for (const [file, viewPath] of Object.entries(index)) {
  const svg = _parseSvg(fs.readFileSync(path.join(dir, file), "utf8"));
  const boxes = _boxes(model, H.findView(model, viewPath).node);
  const name = viewPath.replace(/^Views\/Baseline\//, "");
  for (const v of checkView(svg, boxes)) violations.push(`${name}: ${v}`);
}
log(`${Object.keys(index).length} views, ${violations.length ? violations.length + " violations" : "no violations"}`);
// --check=<name> / --write=<name>: another expected file (test/svg_checks_probe.ajs: svg-probe.txt)
const named = process.argv.find(a => /^--(check|write)=/.test(a));
if (named) process.argv.push(named.split("=")[0]);
if (process.argv.includes("--check") || process.argv.includes("--write")) Expected.report(violations, named ? named.split("=")[1] : "svg-violations.txt", log);
else { violations.forEach(v => log(v)); if (violations.length) process.exitCode = 1; }

/**
 * @typedef {{x: number, y: number, width: number, height: number}} Rect
 * @typedef {{name: string, box: Rect, parent: ElementBox | null, leaf: boolean}} ElementBox
 * @typedef {{tag: string, attrs: Record<string, string>, clip: Rect | null, bbox: Rect | null, points: Point[]}} Op
 */

/**
 * Every rule on one view.
 * @param {Op[]} ops  the SVG's drawing operations in order
 * @param {ElementBox[]} modelBoxes  absolute, model coordinates
 * @returns {string[]}
 */
function checkView(ops, modelBoxes) {
  const boxes = _mapToSvg(modelBoxes, ops);
  const out = [];
  // Elements are drawn first: the line layer starts at the first drawing clipped outside every element.
  const first = ops.findIndex(o => o.clip && !boxes.some(b => _contains(_grow(b.box, TOLERANCE), o.clip)));
  const elementOps = first < 0 ? ops : ops.slice(0, first), lineOps = first < 0 ? [] : ops.slice(first);

  for (const o of ops.filter(_isGlyphs)) {
    const cut = _outside(o.bbox, o.clip);
    if (cut) out.push(`text cut: ${_where(o.clip, boxes)} ${cut}`);
  }
  for (const b of boxes) {
    const drawn = elementOps.find(o => o.tag === "rect" && _same(_rectOf(o), b.box));
    const cut = drawn && drawn.clip && _outside(b.box, drawn.clip);
    if (cut) out.push(`clipped: ${b.name} ${cut}`);
  }
  out.push(..._lines(lineOps, boxes));
  return out;
}

/**
 * End symbols, labels and line crossings of the line layer.
 * @param {Op[]} ops
 * @param {ElementBox[]} boxes
 */
function _lines(ops, boxes) {
  const out = [];
  const leaves = boxes.filter(b => b.leaf);
  /** @type {Rect[]} */
  const labels = [];
  /** @type {Op | null} */
  let line = null;
  for (const o of ops) {
    const straight = o.tag === "path" && /^[ML\d\s.-]+$/.test(o.attrs.d || "") && o.points.length >= 2;
    if (straight && line && _isOpenSymbol(o.points, line.points)) {
      const v = _endSymbol(o.points, line.points, boxes);
      if (v) out.push(`end symbol: ${v}`);
    } else if (straight) {   // a line
      line = o;
      out.push(..._through(o.points, boxes, leaves));
    } else if (o.tag === "polygon" && line && o.attrs.fill === "none") {   // a closed end symbol (its outline)
      const v = _endSymbol(o.points, line.points, boxes);
      if (v) out.push(`end symbol: ${v}`);
    } else if (_isGlyphs(o) && o.bbox) {
      const over = leaves.find(b => _overlap(b.box, /** @type {Rect} */ (o.bbox)) > TOLERANCE);
      if (over) out.push(`label over: label at ${_at(o.bbox)} over ${over.name}`);
      const other = labels.find(l => _overlap(l, /** @type {Rect} */ (o.bbox)) > TOLERANCE);
      if (other) out.push(`label over: label at ${_at(o.bbox)} over the label at ${_at(other)}`);
      labels.push(o.bbox);
    }
  }
  return out;
}

/**
 * A line through an element other than the ones it starts and ends at; a self-loop through its own.
 * @param {Point[]} pts
 * @param {ElementBox[]} boxes
 * @param {ElementBox[]} leaves
 */
function _through(pts, boxes, leaves) {
  const startBox = _onBorder(pts[0], boxes), endBox = _onBorder(pts[pts.length - 1], boxes);
  const selfLoop = startBox && startBox === endBox;
  const out = [];
  for (const b of leaves) {
    if ((b === startBox || b === endBox) && !selfLoop) continue;
    const inner = _grow(b.box, -2);
    if (pts.some((p, i) => i > 0 && _segmentHits(pts[i - 1], p, inner))) {
      out.push(`line through: ${selfLoop && b === startBox ? "self-loop of " + b.name + " drawn inside it" : `line from ${_name(startBox)} to ${_name(endBox)} through ${b.name}`}`);
    }
  }
  return out;
}

/**
 * An open end symbol (an open arrowhead): three points, the middle one at an end of the line before it.
 * @param {Point[]} pts
 * @param {Point[]} line
 */
function _isOpenSymbol(pts, line) {
  return pts.length === 3 && [line[0], line[line.length - 1]].some(e => _dist(pts[1], e) <= TOLERANCE);
}

/**
 * @param {Point[]} polygon
 * @param {Point[]} line
 * @param {ElementBox[]} boxes
 * @returns {string | null}
 */
function _endSymbol(polygon, line, boxes) {
  const ends = [{ end: line[line.length - 1], before: _back(line, line.length - 1, -1) },
                { end: line[0], before: _back(line, 0, 1) }];
  for (const { end, before } of ends) {
    const tipIndex = polygon.findIndex(p => _dist(p, end) <= TOLERANCE);
    if (tipIndex < 0 || !before) continue;
    const tip = polygon[tipIndex], rest = polygon.filter((_, i) => i !== tipIndex);
    const back = { x: rest.reduce((s, p) => s + p.x, 0) / rest.length, y: rest.reduce((s, p) => s + p.y, 0) / rest.length };
    const turn = _angle(back, tip, before, end);
    const at = _onBorder(tip, boxes);
    if (turn > MAX_TURN) return `at ${_at(tip)} (${_name(at)}) ${Math.round(turn)}° off its segment`;
    if (!at) return `at ${_at(tip)} not on an element's border`;
    return null;
  }
  return null;
}

// ── SVG ───────────────────────────────────────────────────────────────────────

/** @param {string} text @returns {Op[]} */
function _parseSvg(text) {
  /** @type {Record<string, Rect>} */
  const clips = {};
  for (const m of text.matchAll(/<clipPath[^>]*id="([^"]+)"[^>]*>\s*<path d="([^"]+)"/g)) clips[m[1]] = _bbox(_numbers(m[2]));
  const body = text.slice(text.lastIndexOf("</defs>"));
  /** @type {Op[]} */
  const ops = [];
  for (const m of body.matchAll(/<(rect|path|polygon|line)\b([^>]*?)\/>/g)) {
    /** @type {Record<string, string>} */
    const attrs = {};
    for (const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const clipId = (attrs["clip-path"] || "").replace(/^url\(#|\)$/g, "");
    const points = m[1] === "path" ? _pairs(_numbers(attrs.d))   // a curve's control points too: its bbox : m[1] === "polygon" ? _pairs(_numbers(attrs.points))
      : m[1] === "line" ? [{ x: +attrs.x1, y: +attrs.y1 }, { x: +attrs.x2, y: +attrs.y2 }] : [];
    ops.push({ tag: m[1], attrs, clip: clips[clipId] || null, bbox: points.length ? _bbox(points.flatMap(p => [p.x, p.y])) : null, points });
  }
  return ops;
}

/** Glyphs: a filled path with curves, its own clip. @param {Op} o */
function _isGlyphs(o) {
  return o.tag === "path" && o.attrs.fill !== "none" && /Q/.test(o.attrs.d || "");
}

/** @param {string} s */
function _numbers(s) {
  return (s.match(/-?\d+(\.\d+)?/g) || []).map(Number);
}

/** @param {number[]} n @returns {Point[]} */
function _pairs(n) {
  const out = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ x: n[i], y: n[i + 1] });
  return out;
}

/** @param {number[]} n @returns {Rect} */
function _bbox(n) {
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** @param {Op} o @returns {Rect} */
function _rectOf(o) {
  return { x: +o.attrs.x, y: +o.attrs.y, width: +o.attrs.width, height: +o.attrs.height };
}

// ── Model ─────────────────────────────────────────────────────────────────────

/**
 * Every visual of the view with its absolute box (model coordinates).
 * @param {{elements: Map<string, {name: string}>}} model
 * @param {any} viewNode
 * @returns {ElementBox[]}
 */
function _boxes(model, viewNode) {
  /** @type {ElementBox[]} */
  const out = [];
  const walk = (/** @type {any} */ node, /** @type {ElementBox | null} */ parent) => {
    for (const c of node.children) {
      if (c.tag !== "child") continue;
      const b = c.children.find((/** @type {any} */ k) => k.tag === "bounds");
      const a = b ? b.attrs : {};
      const box = { x: (parent ? parent.box.x : 0) + +(a.x || 0), y: (parent ? parent.box.y : 0) + +(a.y || 0), width: +(a.width || 0), height: +(a.height || 0) };
      const el = c.attrs.archimateElement && model.elements.get(c.attrs.archimateElement);
      const self = { name: el ? el.name : H.jarchiType(c.attrs["xsi:type"]), box, parent, leaf: !c.children.some((/** @type {any} */ k) => k.tag === "child") };
      out.push(self);
      walk(c, self);
    }
  };
  walk(viewNode, null);
  return out;
}

/**
 * The boxes moved into SVG coordinates: Archi draws the view with a margin, so the SVG is the model
 * shifted. The shift is the one most rects of the same size agree on.
 * @param {ElementBox[]} boxes
 * @param {Op[]} ops
 */
function _mapToSvg(boxes, ops) {
  /** @type {Map<string, number>} */
  const votes = new Map();
  const rects = ops.filter(o => o.tag === "rect").map(_rectOf);
  for (const b of boxes) {
    for (const r of rects) {
      if (r.width === b.box.width && r.height === b.box.height) {
        const k = `${r.x - b.box.x},${r.y - b.box.y}`;
        votes.set(k, (votes.get(k) || 0) + 1);
      }
    }
  }
  const best = [...votes].sort((a, b) => b[1] - a[1])[0];
  const [dx, dy] = best ? best[0].split(",").map(Number) : [0, 0];
  /** @type {Map<ElementBox, ElementBox>} */
  const moved = new Map();
  for (const b of boxes) moved.set(b, { ...b, box: { ...b.box, x: b.box.x + dx, y: b.box.y + dy }, parent: null });
  for (const [b, m] of moved) m.parent = b.parent ? /** @type {ElementBox} */ (moved.get(b.parent)) : null;
  return [...moved.values()];
}

// ── Geometry ──────────────────────────────────────────────────────────────────

/** How far a rect reaches outside a clip, per side, or "" when inside. @param {Rect | null} r @param {Rect | null} clip */
function _outside(r, clip) {
  if (!r || !clip) return "";
  const sides = { left: clip.x - r.x, top: clip.y - r.y, right: r.x + r.width - clip.x - clip.width, bottom: r.y + r.height - clip.y - clip.height };
  return Object.entries(sides).filter(([, d]) => d > TOLERANCE).map(([s, d]) => `${Math.round(d)} px at the ${s}`).join(", ");
}

/** The innermost element whose box holds the rect, by name; else its place. @param {Rect | null} r @param {ElementBox[]} boxes */
function _where(r, boxes) {
  if (!r) return "?";
  const holders = boxes.filter(b => _contains(_grow(b.box, TOLERANCE), r));
  return holders.length ? `${holders[holders.length - 1].name}:` : `label at ${_at(r)}:`;
}

/**
 * The element whose outline the point lies on: on its border, or a few px inside it where a rounded or
 * oval figure's outline runs inside the box (Archi anchors a line on the figure's outline). Innermost wins.
 * @param {Point} p
 * @param {ElementBox[]} boxes
 */
function _onBorder(p, boxes) {
  const on = boxes.filter(b => {
    const r = b.box;
    const inside = Math.min(p.x - r.x, r.x + r.width - p.x, p.y - r.y, r.y + r.height - p.y);   // < 0 outside
    return inside >= -TOLERANCE && inside <= OUTLINE_INSET;
  });
  return on.length ? on[on.length - 1] : null;
}

/**
 * The point SEEN_LENGTH back along the line from its end at index i (step -1: from the last point,
 * 1: from the first): the direction the eye takes the line to arrive from. Archi aims the end symbol
 * along the last segment alone, so a short stub at an angle turns it away from the line.
 * @param {Point[]} pts
 * @param {number} i
 * @param {number} step
 */
function _back(pts, i, step) {
  let left = SEEN_LENGTH;
  for (let j = i + step; j >= 0 && j < pts.length; j += step) {
    const a = pts[j - step], b = pts[j], d = _dist(a, b);
    if (d >= left) return { x: a.x + (b.x - a.x) * left / d, y: a.y + (b.y - a.y) * left / d };
    left -= d;
  }
  const far = pts[step < 0 ? 0 : pts.length - 1];   // a line shorter than that: its other end
  return _dist(far, pts[i]) > TOLERANCE ? far : null;
}

/** Whether a segment crosses the inside of a rect. @param {Point} a @param {Point} b @param {Rect} r */
function _segmentHits(a, b, r) {
  if (r.width <= 0 || r.height <= 0) return false;
  let t0 = 0, t1 = 1;
  const dx = b.x - a.x, dy = b.y - a.y;
  for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.width - a.x], [-dy, a.y - r.y], [dy, r.y + r.height - a.y]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
    if (t0 > t1) return false;
  }
  return t1 - t0 > 1e-6;
}

/** Degrees between direction a→b and c→d. @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
function _angle(a, b, c, d) {
  const x = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(d.y - c.y, d.x - c.x)) * 180 / Math.PI;
  return Math.min(x, 360 - x);
}

/** @param {Rect} outer @param {Rect} inner */
function _contains(outer, inner) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

/** @param {Rect} r @param {number} d */
function _grow(r, d) {
  return { x: r.x - d, y: r.y - d, width: r.width + 2 * d, height: r.height + 2 * d };
}

/** The smaller of the two overlaps of two rects, 0 when apart. @param {Rect} a @param {Rect} b */
function _overlap(a, b) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? Math.min(ox, oy) : 0;
}

/** @param {Rect} a @param {Rect} b */
function _same(a, b) {
  return Math.abs(a.x - b.x) <= TOLERANCE && Math.abs(a.y - b.y) <= TOLERANCE && a.width === b.width && a.height === b.height;
}

/** @param {Point} a @param {Point} b */
function _dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** @param {Point | Rect} p */
function _at(p) {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

/** @param {ElementBox | null} b */
function _name(b) {
  return b ? b.name : "nothing";
}
