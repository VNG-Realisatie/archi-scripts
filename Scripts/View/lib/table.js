/**
 * Table: which boxes of a container stand side by side and which one above the other, read
 * from the boxes of a background view by cuts that cross no box, so no tolerance in pixels decides it
 * (recursive XY-cut):
 *   - columns: a vertical line that crosses no box splits the boxes into columns, left to right;
 *   - rows:    else a horizontal line that crosses no box splits them into rows, top to bottom;
 *   - each part is cut again the same way, until one box is left.
 * Columns come first: a band that spans the container leaves no vertical cut, so bands become rows,
 * and a column of bands beside another column stays a column. Boxes no line separates (they overlap,
 * or interlock) form a stack in reading order (top, then left).
 * a table holds no sizes or positions, and not which objects are drawn: the selection decides
 * that. Tiles places the children of a container that has one in this table.
 *
 * Pure: Node loads it (tools/table_test.js).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading table.js");

/**
 * @typedef {{ id: string, x: number, y: number, width: number, height: number }} Box
 * @typedef {{ id: string, x: number, y: number, width: number, height: number, children: BoxTree[] }} BoxTree
 */

/** The key of the view itself in an Tables record: its root has no id. */
const ROOT = "";

/**
 * The table of sibling boxes.
 * @param {Box[]} boxes  at least one
 * @returns {Table}
 */
function tableOf(boxes) {
  if (boxes.length === 1) return boxes[0].id;
  const columns = _bands(boxes, b => b.x, b => b.width);
  if (columns.length > 1) return { cut: "H", parts: columns.map(tableOf) };
  const rows = _bands(boxes, b => b.y, b => b.height);
  if (rows.length > 1) return { cut: "V", parts: rows.map(tableOf) };
  return { cut: "V", parts: boxes.slice().sort((p, q) => p.y - q.y || p.x - q.x || _byId(p, q)).map(b => b.id) };
}

/**
 * The table of every box with children, and of the root, in a tree of boxes.
 * @param {BoxTree[]} roots
 * @returns {Tables}  ROOT for the view itself
 */
function tablesOf(roots) {
  /** @type {Tables} */
  const out = {};
  /** @param {string} key @param {BoxTree[]} boxes */
  const visit = (key, boxes) => {
    if (!boxes.length) return;
    out[key] = tableOf(boxes);
    for (const b of boxes) visit(b.id, b.children);
  };
  visit(ROOT, roots);
  return out;
}

/**
 * Boxes in bands along one axis: a box whose extent overlaps the band so far joins it, so a line
 * between two bands crosses no box.
 * @param {Box[]}                  boxes
 * @param {(b: Box) => number}     start
 * @param {(b: Box) => number}     size
 * @returns {Box[][]}
 */
function _bands(boxes, start, size) {
  const sorted = boxes.slice().sort((p, q) => start(p) - start(q) || _byId(p, q));
  /** @type {Box[][]} */
  const bands = [];
  let end = -Infinity;
  for (const b of sorted) {
    if (start(b) < end) bands[bands.length - 1].push(b);
    else bands.push([b]);
    end = Math.max(end, start(b) + size(b));
  }
  return bands;
}

/** @param {Box} p @param {Box} q */
function _byId(p, q) {
  return p.id < q.id ? -1 : p.id > q.id ? 1 : 0;
}

/**
 * The ids of a table in reading order.
 * @param {Table} table
 * @returns {string[]}
 */
function idsOf(table) {
  return typeof table === "string" ? [table] : table.parts.flatMap(idsOf);
}

/**
 * a table on one line for the log file: side by side joined by " | ", one above the other
 * by " / ", a nested part in brackets.
 * @param {Table}            table
 * @param {(id: string) => string} name
 * @returns {string}
 */
function describe(table, name) {
  if (typeof table === "string") return name(table);
  const inner = table.parts.map(p => typeof p === "string" ? name(p) : `[${describe(p, name)}]`);
  return inner.join(table.cut === "H" ? " | " : " / ");
}

/**
 * The tables of the containers that hold a container of the background view. Their children
 * keep their places; the children of the other containers are only there, and the layout places them.
 * One container among the children is enough to keep a container's table.
 * @param {Tables} tables
 * @returns {Tables}
 */
function tablesWithContainers(tables) {
  /** @type {Tables} */
  const out = {};
  for (const [key, a] of Object.entries(tables)) if (idsOf(a).some(id => id in tables)) out[key] = a;
  return out;
}

/**
 * Every element of the background view the tables name: the containers and their children.
 * @param {Tables | undefined} tables
 * @returns {Set<string>}
 */
function elementsOf(tables) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const [key, a] of Object.entries(tables || {})) {
    if (key !== ROOT) out.add(key);
    for (const id of idsOf(a)) out.add(id);
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ROOT, tableOf, tablesOf, idsOf, tablesWithContainers, elementsOf, describe };
}
