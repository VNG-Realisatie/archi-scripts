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

// The arrangement of a background view: the view's rows one above the other whatever their width, a
// container's columns side by side in the arrangement's order, a stack one above the other; children
// the arrangement does not hold come last; an arranged child the view does not hold drops out.
{
  const g = graph(3, 3);   // G0, G1 (with G1S), G2; G1 holds leaves G1L0…G1L2 and G1S
  g.arrangements = {
    "": { cut: "V", parts: ["G2", "G0", "G1"] },
    G1: { cut: "H", parts: ["G1L2", { cut: "V", parts: ["G1L0", "G1S"] }, "missing"] },
  };
  const r = run(g);
  checkTree(g, r, "arranged", new Set(["G1L0"]));
  const by = boxes(r);
  ok(bottom(by.G2) <= by.G0.y && bottom(by.G0) <= by.G1.y, "arranged: root rows one above the other, in order");
  ok(right(by.G1L2) <= by.G1L0.x, "arranged: G1's columns in the arrangement's order");
  ok(by.G1S.x === by.G1L0.x && bottom(by.G1L0) <= by.G1S.y, "arranged: a stack one above the other");
  ok(by.G1L1.y >= Math.max(bottom(by.G1L2), bottom(by.G1S)), "arranged: a child not on the background view comes last");
  eq(r, run(g), "arranged: same graph, same result");
  eq([by.G2.width, by.G0.width], [by.G1.width, by.G1.width], "arranged: boxes one above the other as wide as their stack (bands)");
  eq([by.G1L0.width, by.G1L0.height], [by.G1S.width, 60], "arranged: a leaf in a band beside others takes the band's width, not its parent's");
  eq(by.G1S.width, 340, "arranged: a band beside others keeps the width of its own part");
  // An extra occurrence follows its element's place.
  const occ = graph(1, 2);
  occ.nodes.push({ id: "X", label: "X", elementType: "grouping", width: 300, height: 60, parent: null },
    { id: "G0L1_occ_1", label: "Leaf B", elementType: "business-function", width: 300, height: 60, parent: "X" },
    { id: "XL", label: "Leaf X", elementType: "business-function", width: 300, height: 60, parent: "X" });
  occ._parentMap.G0L1_occ_1 = "X"; occ._parentMap.XL = "X";
  occ.arrangements = { X: { cut: "H", parts: ["G0L1", "XL"] } };
  const ro = boxes(run(occ));
  ok(right(ro.G0L1_occ_1) <= ro.XL.x, "arranged: an extra occurrence takes its element's place");
  // A box alone in an arranged container fills it, a leaf too; a diagram object keeps its size.
  const one = graph(2, 1);
  one.nodes.push({ id: "legend", label: "", elementType: "diagram-model-group", width: 200, height: 50, parent: null });
  one.arrangements = { "": { cut: "V", parts: ["G0", "G1", "legend"] }, G0: "G0L0" };
  const b1 = boxes(run(one));
  eq(right(b1.G0L0), right(b1.G0) - 20, "arranged: a leaf alone in its container fills it (padding 20)");
  eq([b1.legend.width, b1.legend.height], [200, 50], "arranged: a diagram object in a band keeps its size");
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

if (failed) { console.log(`${failed} tiles test(s) failed`); process.exit(1); }
console.log("all tiles tests passed");
