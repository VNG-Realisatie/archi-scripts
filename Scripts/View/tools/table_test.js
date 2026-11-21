/**
 * Node tests for the table read from a background view (lib/table.js): cuts that cross
 * no box, columns before rows, each part cut again; the cases come from RC00 (GEMMA). Run from the
 * repo root:
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
const H = (...parts) => ({ cut: "H", parts });
const V = (...parts) => ({ cut: "V", parts });

// RC00 Sturing: Strategie stands higher than Besturing, but no horizontal line separates them; vertical
// lines do: columns, left to right.
eq(Table.tableOf([
  box("Strategie", 770, 20, 304, 197), box("Besturing", 34, 85, 304, 133),
  box("Verantwoording", 2158, 85, 304, 133), box("Samenwerkingsvorming", 3335, 88, 304, 133),
]), H("Besturing", "Strategie", "Verantwoording", "Samenwerkingsvorming"), "Sturing: columns, left to right");

// RC00 Ondersteuning: two boxes at one x, one above the other, beside tall ones: that column a stack.
eq(Table.tableOf([
  box("Huisvesting", 1350, 50, 287, 353), box("Informatiseringsmanagement", 1680, 50, 287, 173),
  box("Informatie- en archiefbeheer", 1680, 243, 287, 160), box("Inkoop", 2010, 50, 287, 353),
]), H("Huisvesting", V("Informatiseringsmanagement", "Informatie- en archiefbeheer"), "Inkoop"), "Ondersteuning: a stack in a column");

// Bands across the container leave no vertical cut: rows, top to bottom.
eq(Table.tableOf([
  box("Ontwikkeling", 60, 140, 3700, 241), box("Sturing", 60, -180, 3700, 239), box("Bewaking", 60, 404, 3700, 207),
]), V("Sturing", "Ontwikkeling", "Bewaking"), "bands: rows top to bottom");

// RC00's top: superlayers in a column beside a column with the legend and the services, though the
// legend lines up with the first superlayer: columns come first.
eq(Table.tableOf([
  box("Besturend", 30, -240, 3770, 319), box("Legenda", 3820, -240, 1582, 320),
  box("Primair", 30, 90, 3770, 2383), box("Services", 3820, 290, 1582, 2741), box("Ondersteunend", 30, 2480, 3770, 550),
]), H(V("Besturend", "Primair", "Ondersteunend"), V("Legenda", "Services")), "RC00 top: two columns");

// RC00 Uitvoering: a wide box below the domains leaves no vertical cut: rows, the first in columns.
eq(Table.tableOf([
  box("Sociaal", 27, 64, 600, 1087), box("Fysiek", 648, 64, 1693, 1087), box("Gegevensmanagement", 30, 1180, 3630, 67),
]), V(H("Sociaal", "Fysiek"), "Gegevensmanagement"), "wide box below: rows");

// Touching edges do not overlap: a line between them crosses no box.
eq(Table.tableOf([box("A", 0, 0, 100, 50), box("B", 0, 50, 100, 50)]), V("A", "B"), "touching edges: a cut");

// Boxes no line separates: a stack in reading order.
eq(Table.tableOf([
  box("Left", 0, 0, 100, 200), box("Top", 50, 0, 200, 100), box("Bottom", 100, 150, 150, 100),
]), V("Left", "Top", "Bottom"), "no cut: reading order");

// Same position: the id decides, so the result does not depend on the input order.
eq(Table.tableOf([box("B", 0, 0, 10, 10), box("A", 0, 0, 10, 10)]),
   Table.tableOf([box("A", 0, 0, 10, 10), box("B", 0, 0, 10, 10)]), "same position: input order plays no part");

// A tree: the root and every box with children; leaves have none.
eq(Table.tablesOf([
  box("Primair", 0, 100, 500, 400, [box("Uitvoering", 10, 200, 480, 100), box("Ontwikkeling", 10, 30, 480, 100)]),
  box("Legenda", 600, 0, 200, 80),
]), { "": H("Primair", "Legenda"), Primair: V("Ontwikkeling", "Uitvoering") }, "tree: root and containers");

eq(Table.tableOf([box("Only", 0, 0, 10, 10)]), "Only", "one box");

// Frames only: a container keeps its table when one of its children holds boxes of its own on
// the background view; a container of leaves leaves its children to the layout.
eq(Object.keys(Table.tablesWithContainers({
  "": V("Besturend", "Primair", "Legenda"),   // holds containers
  Besturend: "Sturing",                        // Sturing is a container
  Primair: V("Uitvoering", "Bewaking"),        // one container (Uitvoering) is enough
  Sturing: H("Besturing", "Strategie"),        // leaves only
  Uitvoering: H("Sociaal", "Fysiek"),          // leaves only
})).sort(), ["", "Besturend", "Primair"], "with containers: the containers that hold a container");
eq(Table.idsOf(H("A", V("B", "C"), "D")), ["A", "B", "C", "D"], "reading order");
eq(Table.describe(H("A", V("B", "C")), id => id.toLowerCase()), "a | [b / c]", "log line");

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("table_test: all passed");
