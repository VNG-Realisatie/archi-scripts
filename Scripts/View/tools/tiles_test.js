/**
 * Node tests for the Tiles engine (engines/tiles.js) on synthetic layout graphs: leaves keep
 * their size, containers wrap their children, siblings do not overlap, the order of the sorted
 * children reads left to right and down, Same width gives one width per level (and per type at a
 * nesting type change), every leaf fills its column across containers, Max width is kept, the result is the same on every run. Run from the repo root:
 *   node Scripts/View/tools/tiles_test.js
 */
const path = require("path");

global.Java    = { type: () => ({}) };
global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log; console.log = () => {};   // the modules' "Loading …" lines
const Defs    = require("../lib/defs");
const Tiles = require("../lib/engines/tiles");
console.log = _log;

let failed = 0;
function ok(cond, label) { if (!cond) { failed++; console.log(`FAIL ${label}`); } }
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

/**
 * A layout graph: `groups` containers named G0…, each with `leaves` leaves; G1 also holds a container.
 */
function graph(groups, leaves, extra) {
  const nodes = [];
  for (let g = 0; g < groups; g++) {
    nodes.push({ id: `G${g}`, label: `G${g}`, elementType: "grouping", width: 300, height: 60, parent: null });
    for (let l = 0; l < leaves; l++)
      nodes.push({ id: `G${g}L${l}`, label: `Leaf ${String.fromCharCode(65 + l)}`, elementType: "business-function", width: 300, height: 60, parent: `G${g}` });
  }
  if (groups > 1) {
    nodes.push({ id: "G1S", label: "Sub", elementType: "grouping", width: 300, height: 60, parent: "G1" });
    nodes.push({ id: "G1S0", label: "Sub leaf", elementType: "business-function", width: 300, height: 60, parent: "G1S" });
  }
  const parentMap = {};
  for (const n of nodes) if (n.parent) parentMap[n.id] = n.parent;
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), extra);
  return { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: (extra && extra.sameWidth) || "Off",
    columnsAcrossContainers: !!(extra && extra.columnsAcrossContainers), sort: (extra && extra.sort) || "Containers, then elements", _parentMap: parentMap };
}

// The label height the layout graph gives a container (label_size.js): about one line of a 9 pt label.
const LABEL_HEIGHT = 20;
const withLabelHeights = g => ({ ...g, nodes: g.nodes.map(n => ({ labelHeight: g.nodes.some(c => c.parent === n.id) ? LABEL_HEIGHT : 0, minWidth: 0, ...n })) });
const run = g => { console.log = () => {}; try { return Tiles.layout(withLabelHeights(g)); } finally { console.log = _log; } };
const boxes = result => Object.fromEntries(result.nodes.map(n => [n.id, n]));
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const right = n => n.x + n.width;
const bottom = n => n.y + n.height;

function checkTree(g, result, label, widened = new Set()) {
  const by = boxes(result);
  eq(result.nodes.length, g.nodes.length, `${label}: every node placed`);
  for (const n of g.nodes) {
    const b = by[n.id];
    const isContainer = g.nodes.some(c => c.parent === n.id);
    if (!isContainer && !widened.has(n.id)) { eq([b.width, b.height], [n.width, n.height], `${label}: leaf ${n.id} keeps its size`); }
    const p = n.parent && by[n.parent];
    if (p) ok(b.x >= p.x && b.y >= p.y && right(b) <= right(p) && bottom(b) <= bottom(p), `${label}: ${n.id} inside ${n.parent}`);
  }
  const byParent = {};
  for (const n of result.nodes) (byParent[n.parentId] = byParent[n.parentId] || []).push(n);
  for (const [pid, sibs] of Object.entries(byParent))
    for (let i = 0; i < sibs.length; i++) for (let j = i + 1; j < sibs.length; j++)
      ok(!overlap(sibs[i], sibs[j]), `${label}: ${sibs[i].id} and ${sibs[j].id} do not overlap in ${pid}`);
}

// Layout holds together and keeps leaf sizes.
for (const [groups, leaves] of [[1, 1], [3, 4], [6, 9]]) {
  const g = graph(groups, leaves);
  checkTree(g, run(g), `${groups} groups × ${leaves} leaves`);
}

// Deterministic.
eq(run(graph(4, 7)), run(graph(4, 7)), "same graph, same result");

// A container with one child has one column; many children share columns without holes: the view is
// not a single tall column.
{
  const r = run(graph(5, 8));
  const widest = Math.max(...r.nodes.map(n => right(n))), highest = Math.max(...r.nodes.map(n => bottom(n)));
  ok(widest > 2 * 300 && highest < 40 * 70, `tiles use both directions (${Math.round(widest)}×${Math.round(highest)})`);
}

// Sorted leaves read left to right, then down: a leaf is never left of an earlier one in the same row.
{
  const g = graph(1, 8);
  const by = boxes(run(g));
  const leaves = g.nodes.filter(n => n.parent === "G0").sort((a, b) => a.label < b.label ? -1 : 1).map(n => by[n.id]);
  for (let i = 1; i < leaves.length; i++) ok(leaves[i].y >= leaves[i - 1].y || leaves[i].x > leaves[i - 1].x, `leaf ${i} follows leaf ${i - 1}`);
}

// Sort inside containers: always ascending. None keeps the selection order, Elements sorts the
// leaves only, Containers, then elements puts the containers first, All together sorts all.
{
  const mk = () => [
    { id: "P", label: "P", elementType: "grouping", width: 300, height: 60, parent: null },
    { id: "C", label: "Ccc", elementType: "business-function", width: 300, height: 60, parent: "P" },
    { id: "A", label: "Aaa", elementType: "business-function", width: 300, height: 60, parent: "P" },
    { id: "B", label: "Bbb", elementType: "business-function", width: 300, height: 60, parent: "P" },
    { id: "B1", label: "Bbb child", elementType: "business-function", width: 300, height: 60, parent: "B" },
  ];
  const parentMap = { A: "P", B: "P", B1: "B", C: "P" };
  const readingOrder = sort => {
    const options = Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" }));
    const g = { algorithm: "Tiles", nodes: mk(), edges: [], engineParams: {}, sameWidth: "Off", columnsAcrossContainers: false, _parentMap: parentMap, options, sort };
    const by = boxes(run(g));
    return ["A", "B", "C"].sort((a, b) => by[a].y - by[b].y || by[a].x - by[b].x);
  };
  eq(readingOrder("None"), ["C", "A", "B"], "None: selection order");
  eq(readingOrder("Elements"), ["B", "A", "C"], "Elements: the container keeps its place, the leaves are sorted");
  eq(readingOrder("Containers, then elements"), ["B", "A", "C"], "Containers, then elements: the container goes first");
  eq(readingOrder("All together"), ["A", "B", "C"], "All together: the container sits among the leaves by name");
}

// A view without containers is not sorted: Selection order orders the elements.
{
  const nodes = ["C", "A", "B"].map(id => ({ id, label: id, elementType: "business-function", width: 300, height: 60, parent: null }));
  const options = Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" }));
  const by = boxes(run({ algorithm: "Tiles", nodes, edges: [], engineParams: {}, sameWidth: "Off", columnsAcrossContainers: false, _parentMap: {}, options, sort: "All together" }));
  eq(["A", "B", "C"].sort((a, b) => by[a].y - by[b].y || by[a].x - by[b].x), ["C", "A", "B"], "no containers: the selection order stays");
}

// Same width (Per level): leaves of one level are equally wide, a container is as wide as its level.
{
  const g = graph(2, 3, { sameWidth: "Per level", padding: 20 });
  g.nodes.find(n => n.id === "G0L0").width = 220;   // a narrower leaf is brought to the level width
  const r = run(g), by = boxes(r);
  const widths = lvl => [...new Set(g.nodes.filter(n => lvl(n)).map(n => by[n.id].width))];
  eq(widths(n => n.parent && !g.nodes.some(c => c.parent === n.id) && n.parent !== "G1S"), [340], "leaves one level down share a width");
}

// Same width (Per level): a leaf beside a container takes the width of its column; without Same width it keeps its size.
{
  const g = on => {
    const nodes = [{ id: "A", label: "A", width: 300, height: 60, parent: null }, { id: "Leaf", label: "Leaf", width: 300, height: 60, parent: null }];
    for (let i = 0; i < 12; i++) nodes.push({ id: `A${i}`, label: `A${i}`, width: 300, height: 60, parent: "A" });
    const parentMap = {}; for (const n of nodes) if (n.parent) parentMap[n.id] = n.parent;
    const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 20 });
    return { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: on ? "Per level" : "Off", columnsAcrossContainers: false, sort: "None", _parentMap: parentMap };
  };
  const by = boxes(run(g(true)));
  ok(by.A.width > 340 && by.Leaf.x === by.A.x && by.Leaf.y > by.A.y, "column: the leaf sits below the wide container");
  eq(by.Leaf.width, by.A.width, "column: a leaf beside a container is as wide as its column");
  eq(boxes(run(g(false))).Leaf.width, 300, "column: without Same width the leaf keeps its size");
  const grid = run(Object.assign(g(true), { columnsAcrossContainers: true })), gb = boxes(grid);
  eq([gb.Leaf.x, gb.Leaf.width], [gb.A.x, gb.A.width], "column: after Columns across containers the leaf still spans its column");
}

// Same width (Per level): a leaf takes the width of a container in its own column only, so no siblings overlap.
{
  const nodes = [{ id: "R", label: "R", width: 300, height: 60, parent: null }];
  [0, 6, 0, 0, 0, 0].forEach((n, c) => {
    nodes.push({ id: `C${c}`, label: `C${c}`, width: 300, height: 60, parent: "R" });
    for (let i = 0; i < n; i++) nodes.push({ id: `C${c}K${i}`, label: `C${c}K${i}`, width: 300, height: 60, parent: `C${c}` });
  });
  const parentMap = {}; for (const n of nodes) if (n.parent) parentMap[n.id] = n.parent;
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 20 });
  const r = run({ algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: "Per level", columnsAcrossContainers: false, sort: "None", _parentMap: parentMap });
  const kids = r.nodes.filter(n => n.parentId === "R");
  const hits = kids.flatMap((a, i) => kids.slice(i + 1).filter(b => overlap(a, b)).map(b => `${a.id}/${b.id}`));
  eq(hits, [], "column: leaves among containers do not overlap a sibling");
}

// Columns across containers: leaves whose branches stand side by side never share a grid column, even
// when leaves elsewhere chain their centres together.
{
  const EU = require("../lib/engines/engine-utils");
  const box = (id, x, y, width, height, parentId) => ({ id, x, y, width, height, parentId });
  const nodes = [
    box("P", 0, 0, 1600, 1000, null),
    box("A", 20, 40, 500, 300, "P"), box("a1", 40, 80, 460, 60, "A"),
    box("B", 540, 40, 1000, 300, "P"), box("b1", 560, 80, 460, 60, "B"), box("b2", 1060, 80, 460, 60, "B"),
    box("C", 20, 400, 1500, 300, "P"),
    box("c1", 170, 440, 460, 60, "C"), box("c2", 320, 520, 460, 60, "C"), box("c3", 470, 600, 460, 60, "C"),
  ];
  console.log = () => {}; EU.alignColumnsAcrossContainers(nodes, { elementSpacing: 20, padding: 20 }, {}, () => {}); console.log = _log;
  const by = boxes({ nodes });
  ok(!overlap(by.A, by.B), "grid: containers side by side do not share a column");
}
// Columns across containers: a stack takes the leftmost column its side-by-side neighbours allow,
// not a column of its own because it stood further right.
{
  const EU = require("../lib/engines/engine-utils");
  const box = (id, x, y, width, height, parentId) => ({ id, x, y, width, height, parentId });
  const nodes = [
    box("P", 0, 0, 2000, 800, null),
    box("X", 20, 40, 1460, 120, "P"), box("x1", 40, 80, 460, 60, "X"), box("x2", 520, 80, 460, 60, "X"), box("x3", 1000, 80, 460, 60, "X"),
    box("Y", 20, 400, 1960, 120, "P"), box("y1", 40, 440, 460, 60, "Y"), box("y2", 1500, 440, 460, 60, "Y"),
  ];
  console.log = () => {}; EU.alignColumnsAcrossContainers(nodes, { elementSpacing: 20, padding: 20 }, {}, () => {}); console.log = _log;
  const by = boxes({ nodes });
  ok(by.y2.x < by.x3.x && Math.abs(by.y2.x - by.x2.x) <= 20, "grid: a stack moves left into the first column its neighbours allow");
}

// Columns across containers: boxes of one level line up on a track line where their parent's edge is
// on it too (the largest inset of that level); an edge facing a sibling keeps the element distance.
{
  const EU = require("../lib/engines/engine-utils");
  const box = (id, x, y, width, height, parentId) => ({ id, x, y, width, height, parentId });
  const nodes = [
    box("P", 0, 0, 1200, 400, null),
    box("A", 20, 40, 500, 160, "P"), box("A1", 40, 80, 460, 100, "A"), box("a1", 60, 110, 420, 60, "A1"), box("L", 540, 40, 540, 60, "P"),
    box("B", 20, 220, 1100, 160, "P"),
    box("C1", 40, 260, 460, 100, "B"), box("c1", 60, 290, 420, 60, "C1"),
    box("C2", 520, 260, 460, 100, "B"), box("c2", 540, 290, 420, 60, "C2"),
  ];
  console.log = () => {}; EU.alignColumnsAcrossContainers(nodes, { elementSpacing: 20, padding: 20 }, {}, () => {}); console.log = _log;
  const by = boxes({ nodes });
  eq(by.A1.x, by.C1.x, "grid: boxes of one level line up where their parent's edge is on the track line");
  eq([by.L.x - right(by.A), by.C2.x - right(by.C1)], [20, 20], "grid: siblings stay the element distance apart");
  eq([by.a1.width, by.c1.width, by.L.width], [420, 420, 540], "grid: leaves keep their size");
}

// Max width is kept when it can be; otherwise the narrowest layout is returned.
{
  const wide = run(graph(8, 6)), widthOf = r => Math.max(...r.nodes.map(right));
  const goal = Math.round(widthOf(wide) * 0.6);
  const fitted = run(graph(8, 6, { maxWidth: goal }));
  ok(widthOf(fitted) <= goal + 2 * 10, `Max width ${goal} kept (${Math.round(widthOf(fitted))})`);
  const impossible = run(graph(8, 6, { maxWidth: 100 }));
  ok(widthOf(impossible) <= widthOf(wide), "an impossible Max width gives the narrowest layout");
}

// Aspect ratio: the view comes closer to a wide target than to a tall one.
{
  const ratio = r => { const w = Math.max(...r.nodes.map(right)), h = Math.max(...r.nodes.map(bottom)); return w / h; };
  const tall = ratio(run(graph(8, 6, { aspectRatio: 0.4 }))), wide = ratio(run(graph(8, 6, { aspectRatio: 2.5 })));
  ok(wide > tall * 2, `aspect ratio: 0.4 → ${tall.toFixed(2)}, 2.5 → ${wide.toFixed(2)}`);
}

// Connections are not routed: straight lines, a self-loop for the writer.
{
  const g = graph(2, 2);
  g.edges = [
    { id: "e1", conceptId: "r1", source: "G0L0", target: "G1L0", label: "", weight: 1 },
    { id: "e2", conceptId: "r2", source: "G0L1", target: "G0L1", label: "", weight: 1 },
    { id: "e3", conceptId: "r3", source: "G0L1", target: "missing", label: "", weight: 1 },
  ];
  const r = run(g);
  eq(r.edges.map(e => [e.id, e.isStraight, e.bendpoints.length]), [["e1", true, 0], ["e2", false, 0]], "edges: straight line and self-loop; unknown end dropped");
}

// The table of a background view: the cells in their table rows and table columns, a cell spanning
// several; every cell fills its table columns and table rows; a stack one above the other; children
// the table does not hold come last; a child of the table the view does not hold drops out.
const cell = (ids, row, column, rowSpan = 1, columnSpan = 1) => ({ ids, row, column, rowSpan, columnSpan });
const tableOf = (rows, columns, cells) => ({ rows, columns, cells });
{
  const g = graph(3, 3);   // G0, G1 (with G1S), G2; G1 holds leaves G1L0…G1L2 and G1S
  g.tables = {
    "": tableOf(3, 1, [cell(["G2"], 0, 0), cell(["G0"], 1, 0), cell(["G1"], 2, 0)]),
    G1: tableOf(2, 2, [cell(["G1L2"], 0, 0), cell(["G1L0", "missing"], 0, 1), cell(["G1S"], 1, 1), cell(["gone"], 1, 0)]),
  };
  const r = run(g);
  checkTree(g, r, "tabled", new Set(["G1L0", "G1S0", "G1L2", "G1S"]));
  const by = boxes(r);
  ok(bottom(by.G2) <= by.G0.y && bottom(by.G0) <= by.G1.y, "tabled: table rows one above the other, in order");
  eq([by.G2.x, by.G0.x, by.G1.x], [by.G2.x, by.G2.x, by.G2.x], "tabled: table rows start at one x");
  eq([by.G2.width, by.G0.width], [by.G1.width, by.G1.width], "tabled: cells in one table column as wide as each other");
  ok(right(by.G1L2) <= by.G1L0.x, "tabled: G1's table columns in the table's order");
  eq([by.G1S.x, by.G1S.width], [by.G1L0.x, by.G1L0.width], "tabled: cells in one table column are as wide as each other");
  ok(bottom(by.G1L0) <= by.G1S.y, "tabled: a table row below the other");
  eq(by.G1L2.x - by.G1.x, 20, "tabled: the first table column starts at the padding");
  ok(by.G1L1.y >= Math.max(bottom(by.G1L2), bottom(by.G1S)), "tabled: a child not in the table comes last");
  eq(by.G1L2.height, by.G1L0.height, "tabled: the cells in one table row are as high as each other");
  eq(r, run(g), "tabled: same graph, same result");
  // An extra occurrence follows its element's place.
  const occ = graph(1, 2);
  occ.nodes.push({ id: "X", label: "X", elementType: "grouping", width: 300, height: 60, parent: null },
    { id: "G0L1_occ_1", label: "Leaf B", elementType: "business-function", width: 300, height: 60, parent: "X" },
    { id: "XL", label: "Leaf X", elementType: "business-function", width: 300, height: 60, parent: "X" });
  occ._parentMap.G0L1_occ_1 = "X"; occ._parentMap.XL = "X";
  occ.tables = { X: tableOf(1, 2, [cell(["G0L1"], 0, 0), cell(["XL"], 0, 1)]) };
  const ro = boxes(run(occ));
  ok(right(ro.G0L1_occ_1) <= ro.XL.x, "tabled: an extra occurrence takes its element's place");
  // A diagram object keeps its size in its cell.
  const one = graph(2, 1);
  one.nodes.push({ id: "legend", label: "", elementType: "diagram-model-group", width: 200, height: 50, parent: null });
  one.tables = { "": tableOf(3, 1, [cell(["G0"], 0, 0), cell(["G1"], 1, 0), cell(["legend"], 2, 0)]) };
  const b1 = boxes(run(one));
  eq([b1.legend.width, b1.legend.height], [200, 50], "tabled: a diagram object in a cell keeps its size");
}

// Cell spans: a cell over two table columns is as wide as both with the element distance, a cell over
// two table rows as high as both; every table row and table column is as large as its cells need.
{
  const n = (id, parent, width = 300, height = 60) => ({ id, label: id, elementType: "business-function", width, height, parent });
  const nodes = [n("wide", null, 800, 60), n("a", null, 300, 60), n("b", null, 300, 200), n("tall", null, 300, 60), n("c", null, 300, 60)];
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 20, elementSpacing: 10 });
  const g = { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: "Off", columnsAcrossContainers: false, sort: "None", _parentMap: {},
    tables: { "": tableOf(3, 3, [cell(["wide"], 0, 0, 1, 3), cell(["a"], 1, 0), cell(["b"], 1, 1), cell(["tall"], 1, 2, 2, 1), cell(["c"], 2, 0, 1, 2)]) } };
  const by = boxes(run(g));
  eq(by.wide.width, right(by.tall) - by.wide.x, "spans: a cell over three table columns reaches the last");
  eq(by.c.width, right(by.b) - by.c.x, "spans: a cell over two table columns is as wide as both");
  eq(by.tall.height, bottom(by.c) - by.b.y, "spans: a cell over two table rows is as high as both");
  eq([by.a.height, by.b.height], [200, 200], "spans: the cells of a table row are as high as the highest");
  eq(by.b.x - right(by.a), 10, "spans: table columns the element distance apart");
  eq(by.a.y - bottom(by.wide), 10, "spans: table rows the element distance apart");
}

// What a cell over several table rows lacks goes into its last table row, so the table is as low as
// its cells allow: beside a tall cell over three table rows, small cells keep their own height and
// stand one below the other (the RC background: Primaire functies beside the legends).
{
  const n = (id, height) => ({ id, label: id, elementType: "business-function", width: 300, height, parent: null });
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 20, elementSpacing: 10 });
  const g = { algorithm: "Tiles", nodes: [n("top", 60), n("tall", 900), n("s1", 60), n("s2", 60), n("big", 600)], edges: [], options,
    engineParams: {}, sameWidth: "Off", columnsAcrossContainers: false, sort: "None", _parentMap: {},
    tables: { "": tableOf(4, 2, [cell(["top"], 0, 0), cell(["tall"], 1, 0, 3, 1), cell(["s1"], 0, 1, 2, 1), cell(["s2"], 2, 1), cell(["big"], 3, 1)]) } };
  const by = boxes(run(g));
  eq([by.s1.height, by.s2.height], [70, 60], "lowest: small cells beside a tall span get no share of what it lacks");
  eq(by.s2.y - bottom(by.s1), 10, "lowest: small cells one below the other, the element distance apart");
  eq(bottom(by.tall), bottom(by.big), "lowest: the tall cell's lack goes into its last table row");
  eq(bottom(by.tall) - by.top.y, 60 + 10 + 900, "lowest: the table is as low as its cells allow");
}

// A table in a cell that grows grows with it: the extra width goes equally to its table columns and
// the cells there are packed again; the content stays at the top of a cell that grows in height.
{
  const g = graph(3, 3);
  g.nodes.push({ id: "big", label: "big", elementType: "business-function", width: 2400, height: 60, parent: null });
  g.tables = {
    "": tableOf(2, 2, [cell(["big"], 0, 0, 1, 2), cell(["G0"], 1, 0), cell(["G1"], 1, 1)]),
    G0: tableOf(1, 3, [cell(["G0L0"], 0, 0), cell(["G0L1"], 0, 1), cell(["G0L2"], 0, 2)]),
  };
  const by = boxes(run(g));
  eq(right(by.G1), right(by.big), "grows: the cells reach the table's far edge");
  eq(by.G1.x - right(by.G0), 40, "grows: the table columns the element distance apart");
  eq(right(by.G0L2), right(by.G0) - 20, "grows: its table reaches the container's padding");
  const w = [by.G0L0, by.G0L1, by.G0L2].map(b => b.width);
  ok(w[0] > 300 && Math.abs(w[0] - w[1]) < 1e-6 && Math.abs(w[1] - w[2]) < 1e-6, `grows: the extra width is shared equally by the table columns (${w.map(Math.round)})`);
}

// A table on the column grid (Columns across containers): the cells of one table column are as wide
// as each other and stand on the same table column borders, whatever their content; a cell spanning
// table columns reaches the borders of both; nothing overlaps.
{
  const n = (id, type, parent, width = 200, height = 60) => ({ id, label: id, elementType: type, width, height, parent });
  const nodes = [
    n("b0", "grouping", null, 100, 30), n("b1", "grouping", null, 100, 30), n("wide", "grouping", null, 100, 30),
    n("A", "grouping", null), n("A0", "business-function", "A"), n("A1", "business-function", "A"),
    n("B", "grouping", null), n("B0", "business-function", "B"), n("B1", "business-function", "B"), n("B2", "business-function", "B"), n("B3", "business-function", "B"),
    n("C", "grouping", null), n("C0", "business-function", "C"), n("C1", "business-function", "C"), n("C2", "business-function", "C"),
  ];
  const parentMap = Object.fromEntries(nodes.filter(x => x.parent).map(x => [x.id, x.parent]));
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 10, elementSpacing: 10, maxWidth: 3000, viewSizeMode: "maxWidth" });
  const g = { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: "Off", columnsAcrossContainers: true, sort: "None", _parentMap: parentMap,
    tables: { "": tableOf(3, 2, [cell(["b0"], 0, 0), cell(["b1"], 0, 1), cell(["A"], 1, 0), cell(["B"], 1, 1), cell(["wide"], 2, 0, 1, 2), cell(["C"], 3, 0, 1, 2)]) } };
  g.tables[""].rows = 4;
  const by = boxes(run(g));
  checkTree(g, run(g), "grid table", new Set(["b0", "b1", "wide", "C0", "C1", "C2"]));
  eq([by.b0.x, by.b0.width], [by.A.x, by.A.width], "grid table: a leaf cell is as wide as the container below it");
  eq([by.b1.x, by.b1.width], [by.B.x, by.B.width], "grid table: the same in the other table column");
  eq(by.B.x - right(by.A), 10, "grid table: table columns the element distance apart");
  eq([by.wide.x, right(by.wide)], [by.A.x, right(by.B)], "grid table: a cell over both table columns reaches both borders");
  eq([by.C.x, right(by.C)], [by.A.x, right(by.B)], "grid table: a container over both table columns reaches both borders");
  eq(by.b0.height, by.b1.height, "grid table: the cells of one table row are as high as each other");
  ok(by.A.y > bottom(by.b0), "grid table: table rows in order");
}

// Same width (Per level): a diagram object keeps its size; it neither takes nor sets a level width.
{
  const g = graph(2, 2, { sameWidth: "Per level" });
  g.nodes.push({ id: "note", label: "", elementType: "diagram-model-note", width: 1500, height: 300, parent: null });
  const by = boxes(run(g));
  eq([by.note.width, by.note.height], [1500, 300], "diagram object: keeps its size");
  ok(by.G0.width < 1500, "diagram object: does not set the level width");
}

// Columns across containers: every leaf fills its column, so a row of leaves has the element distance
// between its leaves; Per level and type: a box at the last nesting type change is a block, one width
// per type as narrow as the type allows, centred in its column.
{
  const mk = (/** @type {string} */ sameWidth) => {
    const n = (id, type, parent) => ({ id, label: id, elementType: type, width: 200, height: 60, parent });
    const nodes = [
      n("R", "grouping", null),
      n("C", "business-function", "R"), n("C0", "business-function", "C"), n("C1", "business-function", "C"), n("C2", "business-function", "C"),
      n("A", "business-function", "R"), n("B", "business-function", "R"),
      n("D", "business-function", "R"), n("S1", "application-service", "D"),
      n("E", "business-function", "D"), n("S2", "application-service", "E"),
    ];
    const parentMap = Object.fromEntries(nodes.filter(x => x.parent).map(x => [x.id, x.parent]));
    const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 10, elementSpacing: 10, maxWidth: 1000, viewSizeMode: "maxWidth" });
    return { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth, columnsAcrossContainers: true, sort: "None", _parentMap: parentMap };
  };
  const level = boxes(run(mk("Per level"))), type = boxes(run(mk("Per level and type")));
  for (const [by, name] of [[level, "Per level"], [type, "Per level and type"]]) {
    for (const a of Object.values(by)) for (const b of Object.values(by)) {
      if (a.parentId !== b.parentId || b.x <= a.x || !(a.y < bottom(b) && b.y < bottom(a))) continue;
      if (Object.values(by).some(c => c.parentId === a.parentId && c.x > a.x && c.x < b.x && c.y < bottom(a) && a.y < bottom(c))) continue;
      if (![a, b].some(n => Object.values(by).some(c => c.parentId === n.id)) && !["S1", "S2"].includes(a.id) && !["S1", "S2"].includes(b.id))
        eq(b.x - right(a), 10, `columns ${name}: leaves ${a.id} → ${b.id} side by side the element distance apart`);
    }
    for (const p of ["C", "D", "E"]) for (const k of Object.values(by).filter(x => x.parentId === p))
      for (const q of Object.values(by).filter(x => x.parentId === p && x !== k)) ok(!overlap(k, q), `columns ${name}: ${k.id} and ${q.id} apart`);
  }
  eq(type.S1.width, type.S2.width, "Per level and type: one width for the application services at a nesting type change");
  eq(type.S1.width, 200, "Per level and type: as narrow as the type allows (its own width)");
  ok(type.S1.x > type.D.x + 10, "Per level and type: a block is centred in its column, not at its left");
}

// Per level and type: a container at the last nesting type change is a block: its leaves of one type one
// width, the block one column of them wide or more; a root's child is no block.
{
  const n = (id, type, parent) => ({ id, label: id, elementType: type, width: 200, height: 60, parent });
  const nodes = [
    n("R", "grouping", null), n("F", "business-function", "R"), n("G", "business-function", "F"),
    n("P", "application-service", "F"), n("K1", "application-component", "P"), n("K2", "application-component", "P"),
    n("Q", "application-service", "F"), n("K3", "application-component", "Q"),
  ];
  const parentMap = Object.fromEntries(nodes.filter(x => x.parent).map(x => [x.id, x.parent]));
  const options = Object.assign({}, Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" })), { padding: 10, elementSpacing: 10, maxWidth: 1000, viewSizeMode: "maxWidth" });
  const by = boxes(run({ algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, sameWidth: "Per level and type", columnsAcrossContainers: true, sort: "None", _parentMap: parentMap }));
  eq(["K1", "K2", "K3"].map(id => by[id].width), [200, 200, 200], "block: its components one width");
  eq(by.Q.width, 220, "block: one column of components and the padding");
  ok([220, 430].includes(by.P.width), "block: one or two columns of components wide");
  for (const k of ["K1", "K2"]) ok(by[k].x >= by.P.x + 10 && right(by[k]) <= right(by.P) - 10, `block: ${k} inside its service`);
  ok(by.F.width > 220, "a root's child is no block");
}

// Per level and type, on the grid: a block in one column fills its track like the blocks around it
// (its contents centred in it), so the containers of a column line up left and right; a block over
// more columns spans them from the first track line on.
{
  const EngineUtils = require("../lib/engines/engine-utils");
  const nodes = [
    { id: "R", x: 0, y: 0, width: 560, height: 400, parentId: null },
    { id: "P", x: 10, y: 30, width: 200, height: 80, parentId: "R" }, { id: "K1", x: 20, y: 40, width: 180, height: 60, parentId: "P" },
    { id: "Q", x: 10, y: 130, width: 540, height: 100, parentId: "R" },
    { id: "K2", x: 45, y: 140, width: 180, height: 60, parentId: "Q" }, { id: "L1", x: 20, y: 210, width: 250, height: 60, parentId: "Q" },
    { id: "L2", x: 290, y: 140, width: 250, height: 60, parentId: "Q" },
  ];
  console.log = () => {};
  try { EngineUtils.alignColumnsAcrossContainers(nodes, { elementSpacing: 10, padding: 10 }, {}, () => {}, new Map(), {}, new Set(["P", "Q"])); }
  finally { console.log = _log; }
  const by = boxes({ nodes });
  eq(by.P.x, by.Q.x, "blocks on the grid: a one-column block starts where the block below it starts");
  eq(right(by.P), right(by.L1), "blocks on the grid: it fills its track, to the track line the column below it ends on");
  eq(by.K1.x - by.P.x, right(by.P) - right(by.K1), "blocks on the grid: its contents centred in it");
}

// A table with more than FULL_SEARCH_MAX children outside its cells: they are tiled in chunks, below the cells.
{
  const many = graph(1, 60);
  many.tables = { "": tableOf(1, 1, [cell(["G0"], 0, 0)]) };
  many.nodes.push(...Array.from({ length: 60 }, (_, i) => ({ id: `R${i}`, label: `Rest ${i}`, elementType: "business-function", width: 300, height: 60, parent: null })));
  const rm = boxes(run(many));
  ok(rm.R0 && rm.R59 && rm.R59.y >= bottom(rm.G0), "tabled: more than 48 children outside the cells come below the cells");
}

if (failed) { console.log(`${failed} tiles test(s) failed`); process.exit(1); }
console.log("all tiles tests passed");
