/**
 * Table: how the containers, leaves and diagram objects of a container (or of the view) on a
 * view template stand: table rows and table columns of cells, a cell possibly spanning several of
 * each. Read from their boxes by overlap alone, so no tolerance in pixels decides it:
 *   1. Cells. A box is a cell; boxes that overlap share one cell as a stack, in reading order.
 *   2. Borders. Two cells side by side (they overlap in height, nothing lies between) have a column
 *      border in the space between them; two cells one above the other (they overlap in width,
 *      nothing lies between) a row border; two cells diagonal to each other (no overlap either way)
 *      both, when nothing lies between them.
 *   3. Gridlines. Borders whose space overlaps or touches are one gridline, also when they come from
 *      different parts of the table.
 *   4. Table rows and table columns. The space between consecutive gridlines, numbered left to
 *      right and top to bottom.
 *   5. Cell span. A cell lies in the table columns and table rows its box overlaps, so a cell that
 *      reaches over a gridline spans both sides.
 * A table holds no sizes or positions, and not which objects are drawn: the selection decides that.
 * Tiles places the children of a container that has one in this table.
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
 * @typedef {{ x: number, y: number, right: number, bottom: number, ids: string[] }} _Rect  a cell's box and its boxes' ids
 * @typedef {[number, number]} _Interval
 */

/** The key of the view itself in a Tables record: its root has no id. */
const ROOT = "";

/**
 * The table of sibling boxes.
 * @param {Box[]} boxes  at least one
 * @returns {Table}
 */
function tableOf(boxes) {
  const rects = _cells(boxes);
  const columnLines = _gridlines(_borders(rects, "x"));
  const rowLines = _gridlines(_borders(rects, "y"));
  const cells = rects.map(r => {
    const [column, last] = _tracksOf(columnLines, r.x, r.right);
    const [row, lastRow] = _tracksOf(rowLines, r.y, r.bottom);
    return { ids: r.ids, column, columnSpan: last - column + 1, row, rowSpan: lastRow - row + 1 };
  });
  cells.sort((p, q) => p.row - q.row || p.column - q.column || (p.ids[0] < q.ids[0] ? -1 : p.ids[0] > q.ids[0] ? 1 : 0));
  return { columns: columnLines.length + 1, rows: rowLines.length + 1, cells };
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
 * The cells: the boxes, boxes that overlap joined into one cell (its box the union of theirs, so a
 * box that overlaps the union joins too), the ids of a cell in reading order (top, then left, then id).
 * @param {Box[]} boxes
 * @returns {_Rect[]}
 */
function _cells(boxes) {
  /** @type {_Rect[]} */
  const cells = boxes.slice().sort(_reading).map(b => ({ x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height, ids: [b.id] }));
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < cells.length && !merged; i++) for (let j = i + 1; j < cells.length && !merged; j++) {
      const a = cells[i], b = cells[j];
      if (a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom) {
        cells[i] = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom), ids: [...a.ids, ...b.ids] };
        cells.splice(j, 1);
        merged = true;
      }
    }
  }
  return cells;
}

/**
 * The space between every two cells side by side (axis "x": a column border) or one above the other
 * (axis "y": a row border) with nothing between them.
 * @param {_Rect[]} cells
 * @param {"x" | "y"} axis
 * @returns {_Interval[]}
 */
function _borders(cells, axis) {
  const across = axis === "x";
  /** @type {(c: _Rect) => number} */
  const lo = c => across ? c.x : c.y, hi = c => across ? c.right : c.bottom, crossLo = c => across ? c.y : c.x, crossHi = c => across ? c.bottom : c.right;
  /** @type {_Interval[]} */
  const out = [];
  for (const a of cells) for (const b of cells) {
    if (a === b || hi(a) > lo(b)) continue;   // b lies after a along the axis
    // Cells that overlap across the axis look at each other there; cells that do not (diagonal) look along the whole stretch they span.
    const overlapping = Math.max(crossLo(a), crossLo(b)) < Math.min(crossHi(a), crossHi(b));
    const from = overlapping ? Math.max(crossLo(a), crossLo(b)) : Math.min(crossLo(a), crossLo(b));
    const to = overlapping ? Math.min(crossHi(a), crossHi(b)) : Math.max(crossHi(a), crossHi(b));
    const between = cells.some(c => c !== a && c !== b && lo(c) < lo(b) && hi(c) > hi(a) && crossLo(c) < to && crossHi(c) > from);
    if (!between) out.push([hi(a), lo(b)]);
  }
  return out;
}

/**
 * Borders whose space overlaps or touches are one gridline.
 * @param {_Interval[]} borders
 * @returns {_Interval[]}  in order
 */
function _gridlines(borders) {
  /** @type {_Interval[]} */
  const lines = [];
  for (const [from, to] of borders.slice().sort((p, q) => p[0] - q[0] || p[1] - q[1])) {
    const last = lines[lines.length - 1];
    if (last && from <= last[1]) last[1] = Math.max(last[1], to);
    else lines.push([from, to]);
  }
  return lines;
}

/**
 * The first and last table track (column or row) a box overlaps: the tracks are the spaces between
 * the gridlines. A box that lies inside a gridline takes the track after the gridlines before it.
 * @param {_Interval[]} lines
 * @param {number} from  the box's start along the axis
 * @param {number} to    its end
 * @returns {[number, number]}
 */
function _tracksOf(lines, from, to) {
  let first = -1, last = -1;
  for (let k = 0; k <= lines.length; k++) {
    const start = k === 0 ? -Infinity : lines[k - 1][1], end = k === lines.length ? Infinity : lines[k][0];
    if (to > start && from < end) { if (first < 0) first = k; last = k; }
  }
  if (first >= 0) return [first, last];
  const after = lines.filter(l => l[1] <= (from + to) / 2).length;
  return [after, after];
}

/** @param {Box} p @param {Box} q */
function _reading(p, q) {
  return p.y - q.y || p.x - q.x || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0);
}

/**
 * The ids of a table in reading order (by table row, then table column).
 * @param {Table} table
 * @returns {string[]}
 */
function idsOf(table) {
  return table.cells.flatMap(c => c.ids);
}

/**
 * The tables with the ids `map` names replaced by their value.
 * @param {Tables}              tables
 * @param {Map<string, string>} map
 * @returns {Tables}
 */
function withIds(tables, map) {
  /** @type {Tables} */
  const out = {};
  for (const [key, t] of Object.entries(tables)) out[key] = { ...t, cells: t.cells.map(c => ({ ...c, ids: c.ids.map(id => map.get(id) || id) })) };
  return out;
}

/**
 * A table on one line for the log file: its size, then every cell as `name@row,column`, with its
 * spans as `+rows×columns`; a stack of boxes joined by " / ".
 * @param {Table}                  table
 * @param {(id: string) => string} name
 * @returns {string}
 */
function describe(table, name) {
  const cells = table.cells.map(c => `${c.ids.map(name).join(" / ")}@${c.row + 1},${c.column + 1}` +
    (c.rowSpan > 1 || c.columnSpan > 1 ? `+${c.rowSpan}×${c.columnSpan}` : ""));
  return `${table.rows}×${table.columns}: ${cells.join(" | ")}`;
}

/**
 * The tables of the containers that hold a container of the view template. Their children keep
 * their places; the children of the other containers are only there, and the layout places them.
 * One container among the children is enough to keep a container's table.
 * @param {Tables} tables
 * @returns {Tables}
 */
function tablesWithContainers(tables) {
  /** @type {Tables} */
  const out = {};
  for (const [key, t] of Object.entries(tables)) if (idsOf(t).some(id => id in tables)) out[key] = t;
  return out;
}

/**
 * Every element of the view template the tables name: the containers and their children.
 * @param {Tables | undefined} tables
 * @returns {Set<string>}
 */
function elementsOf(tables) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const [key, t] of Object.entries(tables || {})) {
    if (key !== ROOT) out.add(key);
    for (const id of idsOf(t)) out.add(id);
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ROOT, tableOf, tablesOf, idsOf, withIds, tablesWithContainers, elementsOf, describe };
}
