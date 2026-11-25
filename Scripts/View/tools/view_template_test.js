/**
 * Node tests for the view template (lib/view_template.js): the view template is always on the view, the
 * path up to it comes along without the parents' other children, an element that reaches it by no
 * path is left out, and the view template brings only the nesting it shows. Run from
 * the repo root:
 *   node Scripts/View/tools/view_template_test.js
 */
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log; console.log = () => {};   // the modules' "Loading …" lines
const Defs = require("../lib/defs");
const ViewTemplate = require("../lib/view_template");
console.log = _log;

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const el = (id, type) => ({ id, name: id, type: type || "business-function", prop: () => undefined });
const rel = (id, s, t, type) => ({ id, type: type || "aggregation-relationship", source: s, target: t, name: "", prop: () => undefined });
const params = Defs.validatePreset({ params: {
  nestingConditions: [{ relation: "aggregation-relationship" }, { relation: "serving-relationship" }],
  reverseConditions: [{ relation: "serving-relationship" }],
} }).params;

// A GEMMA-like model: superlayer ⊃ layer ⊃ function ⊃ subfunction; a domain grouping aggregates a
// function and a subfunction; an application service serves the subfunction.
const Primair = el("Primair", "grouping"), Uitvoering = el("Uitvoering"), Sturing = el("Sturing");
const UFL = el("UFL"), USD = el("USD"), Beheren = el("Beheren"), Strategie = el("Strategie"), Kader = el("Kader");
const Domein = el("Domein", "grouping"), Service = el("Service", "application-service"), Los = el("Los");
const all = [Primair, Uitvoering, Sturing, UFL, USD, Beheren, Strategie, Kader, Domein, Service, Los];
const rels = [
  rel("r01", Primair, Uitvoering), rel("r02", Primair, Sturing), rel("r03", Uitvoering, UFL), rel("r04", Uitvoering, USD),
  rel("r05", UFL, Beheren), rel("r06", Sturing, Strategie), rel("r07", Strategie, Kader),
  rel("r08", Domein, UFL), rel("r09", Domein, Strategie), rel("r10", Service, Beheren, "serving-relationship"),
];
const relationsOf = e => rels.filter(r => r.source.id === e.id || r.target.id === e.id).sort((a, b) => a.id < b.id ? -1 : 1);
const ids = list => list.map(e => e.id);
const relIds = list => list.map(r => r.id).sort();
// A view template: its elements, each box in the box of its parent (tables as selection_read reads them).
const tpl = (elements, nested) => ({ elements, tables: Object.fromEntries(Object.entries(nested).map(([p, cs]) =>
  [p, { columns: 1, rows: cs.length, cells: cs.map((id, row) => ({ ids: [id], row, column: 0, rowSpan: 1, columnSpan: 1 })) }])) });
const viewTemplate = tpl([Primair, Uitvoering, Sturing], { "": ["Primair"], Primair: ["Uitvoering", "Sturing"] });

// FL plate: the domain grouping starts, the steps reach its functions and what lies below them.
{
  const selected = [Domein, UFL, Strategie, Beheren, Kader, Service];
  const collected = [rels[7], rels[8], rels[4], rels[6], rels[9]];
  const c = ViewTemplate.compose(selected, collected, viewTemplate, relationsOf, params);
  eq(ids(c.dropped), ["Domein"], "FL: the domain grouping hangs under nothing on the view template: left out");
  eq(ids(c.parents), [], "FL: functions whose parent is on the view template need no path");
  eq(ids(c.elements), ["UFL", "Strategie", "Beheren", "Kader", "Service", "Primair", "Uitvoering", "Sturing"], "FL: selection first, then the view template");
  eq(relIds(c.relations), ["r01", "r02", "r03", "r05", "r06", "r07", "r10"], "FL: every nesting relation on the view; the grouping's own go with it");
  eq(c.elements.some(e => e.id === "USD"), false, "FL: a sibling on the view template's level does not come along");
}

// The model nests a function also under another template element than the selection's parent: the
// selection decides, so it does not appear there too (GEMMA: Autorisatievaststelling under Ontvangst and
// under Automatiseringsmanagement).
{
  const Ondersteuning = el("Ondersteuning"), Autom = el("Autom"), Autor = el("Autor");
  const extra = [rel("x1", Ondersteuning, Autom), rel("x2", Strategie, Autor), rel("x3", Autom, Autor)];
  const of = e => [...rels, ...extra].filter(r => r.source.id === e.id || r.target.id === e.id).sort((a, b) => a.id < b.id ? -1 : 1);
  const c = ViewTemplate.compose([Domein, Strategie, Autor], [rels[8], extra[1]], tpl([...viewTemplate.elements, Ondersteuning, Autom], { "": ["Primair", "Ondersteuning"], Primair: ["Uitvoering", "Sturing"], Ondersteuning: ["Autom"] }), of, params);
  eq(relIds(c.relations), ["r01", "r02", "r06", "x1", "x2"], "selection decides: no relation from another template parent (x3)");
}

// A function deeper than the view template: its parents come along up to the view template, their other children not.
{
  const c = ViewTemplate.compose([Beheren], [], tpl([Primair, Uitvoering], { "": ["Primair"], Primair: ["Uitvoering"] }), relationsOf, params);
  eq(ids(c.parents), ["UFL"], "path: the parent up to the view template");
  eq(ids(c.elements), ["Beheren", "Primair", "Uitvoering", "UFL"], "path: selection, viewTemplate, path");
  eq(relIds(c.relations), ["r01", "r03", "r05"], "path: the nesting relations along it");
}

// An element with no parent on any path to the view template is left out; the view template stays.
{
  const c = ViewTemplate.compose([Los], [], viewTemplate, relationsOf, params);
  eq(ids(c.dropped), ["Los"], "no path: left out");
  eq(ids(c.elements), ["Primair", "Uitvoering", "Sturing"], "no path: the view template alone");
}

// The poster: the start is the view template itself; everything hangs under it, nothing is left out.
{
  const selected = [Primair, Uitvoering, Sturing, UFL, USD, Strategie];
  const c = ViewTemplate.compose(selected, [], viewTemplate, relationsOf, params);
  eq([ids(c.dropped), ids(c.parents)], [[], []], "poster: nothing left out, no path needed");
  eq(ids(c.elements), ids(selected), "poster: the selection as it is");
}

// A cycle of parents reaches nothing through itself.
{
  const A = el("A"), B = el("B");
  const cyc = [rel("c1", A, B), rel("c2", B, A)];
  const of = e => cyc.filter(r => r.source.id === e.id || r.target.id === e.id);
  const c = ViewTemplate.compose([A], [], tpl([Primair], { "": ["Primair"] }), of, params);
  eq(ids(c.dropped), ["A"], "cycle: left out, no endless climb");
}

// A model nesting relation between two elements of the view template that the view template does
// not show (the child is in the box of another parent) is not drawn unless the selection follows it
// (GEMMA: Klanttevredenheidsmeting under Generieke applicatieservices, also aggregated by Publieksdiensten).
{
  const Generiek = el("Generiek", "grouping"), Publiek = el("Publiek", "grouping"), Svc = el("Svc", "application-service");
  const gp = [rel("g1", Generiek, Svc), rel("g2", Publiek, Svc)];
  const of = e => gp.filter(r => r.source.id === e.id || r.target.id === e.id);
  const view = tpl([Generiek, Publiek, Svc], { "": ["Generiek", "Publiek"], Generiek: ["Svc"] });
  eq(relIds(ViewTemplate.compose([], [], view, of, params).relations), ["g1"], "shown: only the nesting the view template shows");
  eq(relIds(ViewTemplate.compose([Publiek, Svc], [gp[1]], view, of, params).relations), ["g1", "g2"], "shown: a relation the selection follows is drawn");
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("view_template_test: all passed");
