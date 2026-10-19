/**
 * Node tests for nesting resolution (selection_pipeline.resolveNesting): several parents,
 * every container, cycles, order independence. Run from the repo root:
 *   node Scripts/View/tools/nesting_test.js [model.archimate]
 * With a model file (default /home/mark/temp/wiki-gemma-model.archimate, skipped when absent)
 * the view "Views/_Generated/Kennismodel (copy)" is resolved in both relation orders.
 */
const fs = require("fs");
const H  = require("./view_harness");
const Defs = require("../lib/defs");
const Pipeline = require("../lib/selection_pipeline");

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const el = (id, name, type) => ({ id, name: name || id, type: type || "grouping", prop: () => undefined });
const rel = (id, s, t, type) => ({ id, type: type || "aggregation-relationship", source: s, target: t, name: "", prop: () => undefined });
const params = rules => Defs.validatePreset({ params: { nestingRules: rules, reverseRules: [] } }).params;
const AGG = [{ relation: "aggregation-relationship" }];
const AGG_EVERY = [{ relation: "aggregation-relationship", everyContainer: true }];

function run(p, elements, rels, current) {
  const split = Pipeline.splitNestingRels(rels, p);
  const nesting = Pipeline.resolveNesting(elements, split.nestingRels, p, current);
  return H.summarize(nesting, new Map(elements.map(e => [e.id, e])));
}
const placementOf = (s, name) => s.placements.find(x => x.startsWith(name + " ⊂"));

// ── cycles ────────────────────────────────────────────────────────────────────
{
  const [a, b, c, d] = [el("a", "A"), el("b", "B"), el("c", "C"), el("d", "D")];
  const rels = [rel("r1", a, b), rel("r2", b, c), rel("r3", c, a), rel("r4", a, d)];
  const s = run(params(AGG), [a, b, c, d], rels);
  eq(s.circular, ["r1", "r2", "r3"], "cycle: every relation of the cycle is drawn as a line");
  eq(s.cycles, ["A ↔ B ↔ C"], "cycle: named by its elements");
  eq(placementOf(s, "D"), "D ⊂ [A]", "cycle: a relation leaving the cycle still nests");
  eq(placementOf(s, "A"), "A ⊂ [root]", "cycle: its elements stay at the root");
  const r = run(params(AGG), [d, c, b, a], rels.slice().reverse());
  eq(r, s, "cycle: same result in reverse order");
  const two = run(params(AGG), [a, b], [rel("x", a, b), rel("y", b, a)]);
  eq(two.circular, ["x", "y"], "cycle: two elements containing each other");
}

// ── one parent: current container, else name, then id ────────────────────────
{
  const [p, q, x] = [el("p", "Beta"), el("q", "Alpha"), el("x", "X")];
  const rels = [rel("r1", p, x), rel("r2", q, x)];
  const s = run(params(AGG), [p, q, x], rels);
  eq(placementOf(s, "X"), "X ⊂ [Alpha]", "one parent: first by name");
  eq(s.lines, ["r1"], "one parent: the other relation is drawn as a line");
  eq(run(params(AGG), [x, q, p], rels.slice().reverse()), s, "one parent: order-free");
  const cur = run(params(AGG), [p, q, x], rels, new Map([["x", new Set(["p"])]]));
  eq(placementOf(cur, "X"), "X ⊂ [Beta]", "one parent: the current container wins");
  const [s1, s2] = [el("s2", "Same"), el("s1", "Same")];
  const tie = run(params(AGG), [s1, s2, x], [rel("t1", s1, x), rel("t2", s2, x)]);
  eq(tie.nested, ["t2:s1>x"], "one parent: same name → by id");
}

// ── every container ──────────────────────────────────────────────────────────
{
  const [g1, g2, c, k] = [el("g1", "G1"), el("g2", "G2"), el("c", "C"), el("k", "K", "business-object")];
  const rels = [rel("r1", g1, c), rel("r2", g2, c), rel("r3", c, k, "composition-relationship")];
  const rules = [...AGG_EVERY, { relation: "composition-relationship" }];
  const s = run(params(rules), [g1, g2, c, k], rels);
  eq(placementOf(s, "C"), "C ⊂ [G1, G2]", "every: the child appears in each parent");
  eq(placementOf(s, "K"), "K ⊂ [C, C]", "every: an extra container occurrence gets copies of its children");
  eq(run(params(rules), [k, c, g2, g1], rels.slice().reverse()), s, "every: order-free");
  // A relation matching a rule with and one without everyContainer: every container wins.
  const both = run(params([...AGG, ...AGG_EVERY]), [g1, g2, c], rels.slice(0, 2));
  eq(placementOf(both, "C"), "C ⊂ [G1, G2]", "every: wins over a rule without it");
  // One composition parent (no every) plus every aggregation parent.
  const [p1, p2, ch] = [el("p1", "P1"), el("p2", "P2"), el("ch", "Child")];
  const mixed = run(params([{ relation: "composition-relationship" }, ...AGG_EVERY]), [p1, p2, ch],
    [rel("m1", p1, ch, "composition-relationship"), rel("m2", p2, ch)]);
  eq(placementOf(mixed, "Child"), "Child ⊂ [P1, P2]", "every: plus the one parent of the other rules");
  // Self-loop: never containment.
  const loop = run(params(AGG_EVERY), [g1], [rel("l", g1, g1)]);
  eq(loop.lines, ["l"], "self-relation is drawn as a line");
}

// ── Kennismodel (copy) ───────────────────────────────────────────────────────
const MODEL = process.argv[2] || "/home/mark/temp/wiki-gemma-model.archimate";
if (fs.existsSync(MODEL)) {
  const m = H.loadModel(MODEL);
  const view = H.findView(m, "Views/_Generated/Kennismodel (copy)");
  for (const [label, rules] of [["one parent", AGG], ["every container", AGG_EVERY]]) {
    const p = params(rules);
    const fwd = H.viewContents(m, view);
    const rev = H.viewContents(m, view, { reverse: true });
    const byId = new Map(fwd.elements.map(e => [e.id, e]));
    const s = H.summarize(H.resolve(p, fwd).nesting, byId);
    eq(H.summarize(H.resolve(p, rev).nesting, byId), s, `Kennismodel (copy), ${label}: same result in reverse order`);
    const groep = placementOf(s, "Groep"), cap = placementOf(s, "Capability");
    if (label === "every container") {
      eq([groep, cap.split(", ").length], ["Groep ⊂ [Kennismodel, Kennismodel-wiki]", 5], `Kennismodel (copy), ${label}: every parent`);
    } else {
      eq(groep.split(", ").length, 1, `Kennismodel (copy), ${label}: Groep has one parent`);
    }
  }
} else {
  console.log(`(skipped Kennismodel (copy): ${MODEL} not found)`);
}

console.log(failed ? `\n${failed} FAILED` : "all nesting tests passed");
process.exit(failed ? 1 : 0);
