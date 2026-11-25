/**
 * Node tests for the table read from a view template (lib/table.js): cells, borders, gridlines, table
 * rows and table columns, cell spans, all from overlap alone; the cases come from RC00 and the
 * Informatiearchitectuur of the Applicatieservices view template (GEMMA). Run from the repo root:
 *   node Scripts/View/tools/table_test.js
 */
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log; console.log = () => {};   // the module's "Loading …" line
const Table = require("../lib/table");
console.log = _log;

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}
const box = (id, x, y, width, height, children = []) => ({ id, x, y, width, height, children });
/** A table as one line per cell: `ids@row,column+rows×columns` (spans only when more than 1). */
const shape = t => ({ size: `${t.rows}×${t.columns}`, cells: t.cells.map(c => `${c.ids.join("/")}@${c.row},${c.column}` + (c.rowSpan > 1 || c.columnSpan > 1 ? `+${c.rowSpan}×${c.columnSpan}` : "")) });
const tableOf = boxes => shape(Table.tableOf(boxes));

// RC00 Sturing: Strategie stands higher than Besturing, but nothing is one above the other: four table
// columns, one table row.
eq(tableOf([
  box("Strategie", 770, 20, 304, 197), box("Besturing", 34, 85, 304, 133),
  box("Verantwoording", 2158, 85, 304, 133), box("Samenwerkingsvorming", 3335, 88, 304, 133),
]), { size: "1×4", cells: ["Besturing@0,0", "Strategie@0,1", "Verantwoording@0,2", "Samenwerkingsvorming@0,3"] }, "Sturing: table columns, left to right");

// RC00 Ondersteuning: two boxes at one x, one above the other, beside tall ones: the tall ones span both table rows.
eq(tableOf([
  box("Huisvesting", 1350, 50, 287, 353), box("Informatiseringsmanagement", 1680, 50, 287, 173),
  box("Informatie- en archiefbeheer", 1680, 243, 287, 160), box("Inkoop", 2010, 50, 287, 353),
]), { size: "2×3", cells: ["Huisvesting@0,0+2×1", "Informatiseringsmanagement@0,1", "Inkoop@0,2+2×1", "Informatie- en archiefbeheer@1,1"] }, "Ondersteuning: tall cells span two table rows");

// Bands across the container: table rows, top to bottom, one table column.
eq(tableOf([
  box("Ontwikkeling", 60, 140, 3700, 241), box("Sturing", 60, -180, 3700, 239), box("Bewaking", 60, 404, 3700, 207),
]), { size: "3×1", cells: ["Sturing@0,0", "Ontwikkeling@1,0", "Bewaking@2,0"] }, "bands: table rows top to bottom");

// RC00's top: superlayers in a column beside a column with the legend and the services; the services
// reach over the border between the second and third superlayer.
eq(tableOf([
  box("Besturend", 30, -240, 3770, 319), box("Legenda", 3820, -240, 1582, 320),
  box("Primair", 30, 90, 3770, 2383), box("Services", 3820, 290, 1582, 2741), box("Ondersteunend", 30, 2480, 3770, 550),
]), { size: "3×2", cells: ["Besturend@0,0", "Legenda@0,1", "Primair@1,0", "Services@1,1+2×1", "Ondersteunend@2,0"] }, "RC00 top: borders of both table columns are one gridline");

// RC00 Uitvoering: a wide box below the domains spans both table columns.
eq(tableOf([
  box("Sociaal", 27, 64, 600, 1087), box("Fysiek", 648, 64, 1693, 1087), box("Gegevensmanagement", 30, 1180, 3630, 67),
]), { size: "2×2", cells: ["Sociaal@0,0", "Fysiek@0,1", "Gegevensmanagement@1,0+1×2"] }, "wide box below: spans the table columns");

// Touching edges: a border without space is a gridline too.
eq(tableOf([box("A", 0, 0, 100, 50), box("B", 0, 50, 100, 50)]), { size: "2×1", cells: ["A@0,0", "B@1,0"] }, "touching edges: two table rows");

// Boxes that overlap share a cell as a stack, in reading order (top, then left).
eq(tableOf([
  box("Left", 0, 0, 100, 200), box("Top", 50, 0, 200, 100), box("Bottom", 100, 150, 150, 100),
]), { size: "1×1", cells: ["Left/Top/Bottom@0,0"] }, "overlap: one cell, a stack");

// Same position: the id decides, so the result does not depend on the input order.
eq(Table.tableOf([box("B", 0, 0, 10, 10), box("A", 0, 0, 10, 10)]), Table.tableOf([box("A", 0, 0, 10, 10), box("B", 0, 0, 10, 10)]), "same position: input order plays no part");

// A pinwheel no cut can divide is a 2×2 table: every cell in the table row and table column its box overlaps.
eq(tableOf([
  box("A", 0, 0, 200, 100), box("B", 210, 0, 100, 200), box("C", 110, 210, 200, 100), box("D", 0, 110, 100, 200),
]), { size: "2×2", cells: ["A@0,0", "B@0,1", "D@1,0", "C@1,1"] }, "pinwheel: a 2×2 table");

// An edge a few pixels off: borders whose space overlaps are one gridline; apart, two, and the cell
// between them spans the thin table row.
eq(tableOf([box("A", 0, 0, 100, 50), box("C", 0, 52, 100, 50), box("B", 110, 0, 100, 51), box("D", 110, 51, 100, 50)]),
  { size: "2×2", cells: ["A@0,0", "B@0,1", "C@1,0", "D@1,1"] }, "a few pixels off: one gridline");
eq(tableOf([box("A", 0, 0, 100, 50), box("C", 0, 52, 100, 50), box("B", 110, 0, 100, 60), box("D", 110, 62, 100, 50)]),
  { size: "3×2", cells: ["A@0,0", "B@0,1+2×1", "C@1,0+2×1", "D@2,1"] }, "a few pixels apart: a thin table row the cells span");

// Informatiearchitectuur of the Applicatieservices view template: four table columns (inwoners, gemeente,
// ketenpartners, the right one), nine table rows; Applicatieontwikkeling beside seven of them, Privacy
// over the last two, the generic services over the table rows either side of the gridline between them.
{
  const ia = [
    ["Bestuur inw", 70, 140, 573, 33], ["Bestuur gem", 656, 140, 953, 33], ["Bestuur keten", 1623, 140, 380, 33],
    ["Fysiek inw", 70, 180, 573, 33], ["Fysiek gem", 656, 180, 953, 33], ["Fysiek keten", 1623, 180, 380, 33],
    ["OOV inw", 70, 220, 573, 33], ["OOV gem", 656, 220, 953, 33], ["OOV keten", 1623, 220, 380, 33],
    ["Sociaal inw", 70, 260, 573, 33], ["Sociaal gem", 656, 260, 953, 33], ["Sociaal keten", 1623, 260, 380, 33],
    ["Publiek inw", 70, 300, 573, 33], ["Publiek gem", 656, 300, 953, 33], ["Publiek keten", 1623, 300, 380, 33],
    ["Ondersteuning inw", 70, 340, 573, 33], ["Ondersteuning gem", 656, 340, 953, 33], ["Ondersteuning keten", 1623, 340, 380, 33],
    ["Generiek inw", 70, 380, 573, 400], ["Generiek gem", 656, 380, 953, 400], ["Generiek keten", 1623, 380, 380, 400],
    ["Gedeeld", 70, 794, 1933, 207], ["Applicatieontwikkeling", 2040, 140, 201, 361], ["Privacy", 2040, 550, 201, 451],
  ].map(([id, x, y, w, h]) => box(id, x, y, w, h));
  const t = Table.tableOf(ia), by = Object.fromEntries(t.cells.map(c => [c.ids[0], c]));
  eq([t.rows, t.columns], [9, 4], "IA: nine table rows, four table columns");
  eq(["Bestuur inw", "Bestuur gem", "Bestuur keten"].map(id => [by[id].row, by[id].column]), [[0, 0], [0, 1], [0, 2]], "IA: Bestuur in the first table row");
  eq([by["Generiek inw"].row, by["Generiek inw"].rowSpan, by["Generiek gem"].row, by["Generiek keten"].rowSpan], [6, 2, 6, 2], "IA: the generic services span the table rows either side of the gridline");
  eq([by.Applicatieontwikkeling.row, by.Applicatieontwikkeling.rowSpan, by.Applicatieontwikkeling.column], [0, 7, 3], "IA: Applicatieontwikkeling beside seven table rows, in the last table column");
  eq([by.Privacy.row, by.Privacy.rowSpan, by.Privacy.column], [7, 2, 3], "IA: Privacy over the last two table rows");
  eq([by.Gedeeld.row, by.Gedeeld.column, by.Gedeeld.columnSpan], [8, 0, 3], "IA: Gedeeld over the first three table columns");
}

// A tree: the root and every box with children; leaves have none.
eq(Object.fromEntries(Object.entries(Table.tablesOf([
  box("Primair", 0, 100, 500, 400, [box("Uitvoering", 10, 200, 480, 100), box("Ontwikkeling", 10, 30, 480, 100)]),
  box("Legenda", 600, 0, 200, 80),
])).map(([k, t]) => [k, shape(t)])), {
  "": { size: "2×2", cells: ["Legenda@0,1", "Primair@1,0"] },   // diagonal: a table row and a table column between them
  Primair: { size: "2×1", cells: ["Ontwikkeling@0,0", "Uitvoering@1,0"] },
}, "tree: root and containers");

eq(tableOf([box("Only", 0, 0, 10, 10)]), { size: "1×1", cells: ["Only@0,0"] }, "one box");

// Frames only: a container keeps its table when one of its children holds boxes of its own on
// the view template; a container of leaves leaves its children to the layout.
const column = (...ids) => ({ columns: 1, rows: ids.length, cells: ids.map((id, row) => ({ ids: [id], row, column: 0, rowSpan: 1, columnSpan: 1 })) });
const rowOf = (...ids) => ({ columns: ids.length, rows: 1, cells: ids.map((id, c) => ({ ids: [id], row: 0, column: c, rowSpan: 1, columnSpan: 1 })) });
eq(Object.keys(Table.tablesWithContainers({
  "": column("Besturend", "Primair", "Legenda"),   // holds containers
  Besturend: column("Sturing"),                    // Sturing is a container
  Primair: column("Uitvoering", "Bewaking"),       // one container (Uitvoering) is enough
  Sturing: rowOf("Besturing", "Strategie"),        // leaves only
  Uitvoering: rowOf("Sociaal", "Fysiek"),          // leaves only
})).sort(), ["", "Besturend", "Primair"], "with containers: the containers that hold a container");
eq(Table.idsOf({ columns: 2, rows: 2, cells: [
  { ids: ["A"], row: 0, column: 0, rowSpan: 1, columnSpan: 1 }, { ids: ["B", "C"], row: 0, column: 1, rowSpan: 1, columnSpan: 1 }, { ids: ["D"], row: 1, column: 0, rowSpan: 1, columnSpan: 2 }] }),
  ["A", "B", "C", "D"], "reading order");
eq(Table.describe({ columns: 2, rows: 2, cells: [
  { ids: ["A"], row: 0, column: 0, rowSpan: 1, columnSpan: 1 }, { ids: ["B", "C"], row: 0, column: 1, rowSpan: 1, columnSpan: 1 }, { ids: ["D"], row: 1, column: 0, rowSpan: 1, columnSpan: 2 }] }, id => id.toLowerCase()),
  "2×2: a@1,1 | b / c@1,2 | d@2,1+1×2", "log line");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("table_test: all passed");
