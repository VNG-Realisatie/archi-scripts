/**
 * Node tests for the Tiles engine (engines/tiles.js) on synthetic layout graphs: leaves keep
 * their size, containers wrap their children, siblings do not overlap, the order of the sorted
 * children reads left to right and down, Same width gives one width per level, Max width is
 * kept, the result is the same on every run. Run from the repo root:
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
  return { algorithm: "Tiles", nodes, edges: [], options, engineParams: {}, alignWidthSameType: !!(extra && extra.alignWidthSameType),
    columnsAcrossContainers: !!(extra && extra.columnsAcrossContainers), sort: (extra && extra.sort) || "Containers, then elements", _parentMap: parentMap };
}

const run = g => { console.log = () => {}; try { return Tiles.layout(g); } finally { console.log = _log; } };
const boxes = result => Object.fromEntries(result.nodes.map(n => [n.id, n]));
const overlap = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const right = n => n.x + n.width;
const bottom = n => n.y + n.height;

function checkTree(g, result, label) {
  const by = boxes(result);
  eq(result.nodes.length, g.nodes.length, `${label}: every node placed`);
  for (const n of g.nodes) {
    const b = by[n.id];
    const isContainer = g.nodes.some(c => c.parent === n.id);
    if (!isContainer) { eq([b.width, b.height], [n.width, n.height], `${label}: leaf ${n.id} keeps its size`); }
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
    const g = { algorithm: "Tiles", nodes: mk(), edges: [], engineParams: {}, alignWidthSameType: false, columnsAcrossContainers: false, _parentMap: parentMap, options, sort };
    const by = boxes(run(g));
    return ["A", "B", "C"].sort((a, b) => by[a].y - by[b].y || by[a].x - by[b].x);
  };
  eq(readingOrder("None"), ["C", "A", "B"], "None: selection order");
  eq(readingOrder("Elements"), ["B", "A", "C"], "Elements: the container keeps its place, the leaves are sorted");
  eq(readingOrder("Containers, then elements"), ["B", "A", "C"], "Containers, then elements: the container goes first");
  eq(readingOrder("All together"), ["A", "B", "C"], "All together: the container sits among the leaves by name");
}

// A view without containers is not sorted: Algorithm start orders the elements.
{
  const nodes = ["C", "A", "B"].map(id => ({ id, label: id, elementType: "business-function", width: 300, height: 60, parent: null }));
  const options = Defs.effectiveParams(Defs.validatePreset({ algorithm: "Tiles" }));
  const by = boxes(run({ algorithm: "Tiles", nodes, edges: [], engineParams: {}, alignWidthSameType: false, columnsAcrossContainers: false, _parentMap: {}, options, sort: "All together" }));
  eq(["A", "B", "C"].sort((a, b) => by[a].y - by[b].y || by[a].x - by[b].x), ["C", "A", "B"], "no containers: the selection order stays");
}

// Same width per level: leaves of one level are equally wide, a container is as wide as its level.
{
  const g = graph(2, 3, { alignWidthSameType: true, padding: 20 });
  g.nodes.find(n => n.id === "G0L0").width = 220;   // a narrower leaf is brought to the level width
  const r = run(g), by = boxes(r);
  const widths = lvl => [...new Set(g.nodes.filter(n => lvl(n)).map(n => by[n.id].width))];
  eq(widths(n => n.parent && !g.nodes.some(c => c.parent === n.id) && n.parent !== "G1S"), [340], "leaves one level down share a width");
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

if (failed) { console.log(`${failed} tiles test(s) failed`); process.exit(1); }
console.log("all tiles tests passed");
