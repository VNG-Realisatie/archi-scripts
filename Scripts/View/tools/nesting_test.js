/**
 * Node tests for nesting resolution (selection_pipeline.resolveNesting): several parents,
 * every container, cycles, order independence; managed occurrences (capture, pairing, records)
 * and connections between occurrences (layout graph). Run from the repo root:
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

function resolve(p, elements, rels, visuals) {
  const split = Pipeline.splitNestingRels(rels, p);
  return Pipeline.resolveNesting(elements, split.nestingRels, p, visuals);
}
function run(p, elements, rels, visuals) {
  return H.summarize(resolve(p, elements, rels, visuals), new Map(elements.map(e => [e.id, e])));
}
// Visuals on a view: [visual id, element id, parent visual id], in view order, plus records.
const visuals = (rows, records) =>
  Pipeline.classifyVisuals(rows.map(([id, conceptId, parentVisualId]) => ({ id, conceptId, parentVisualId: parentVisualId || null })), records || []);
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
  const cur = run(params(AGG), [p, q, x], rels, visuals([["vp", "p"], ["vq", "q"], ["vx", "x", "vp"]]));
  eq(placementOf(cur, "X"), "X ⊂ [Beta]", "one parent: the current container wins");
  const mgd = run(params(AGG), [p, q, x], rels,
    visuals([["vp", "p"], ["vq", "q"], ["vx", "x", "vq"], ["vx2", "x", "vp"]], ["x in p"]));
  eq(placementOf(mgd, "X"), "X ⊂ [Alpha]", "one parent: only user content counts as the current container");
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

// ── managed occurrences ──────────────────────────────────────────────────────
{
  const [g1, g2, c, k] = [el("g1", "G1"), el("g2", "G2"), el("c", "C"), el("k", "K", "business-object")];
  const elements = [g1, g2, c, k];
  const rels = [rel("r1", g1, c), rel("r2", g2, c), rel("r3", c, k, "composition-relationship")];
  const every = params([...AGG_EVERY, { relation: "composition-relationship" }]);
  const one   = params([...AGG, { relation: "composition-relationship" }]);
  const contents = vs => ({ elements, relations: rels, visuals: vs, visualRelations: [] });
  const created = n => Object.values(n.occurrenceMap).flat().filter(o => !n.visualOf[o]).length;
  const step = (p, cont) => { const n = resolve(p, elements, rels, cont.visuals); return { n, next: H.simulateWrite(cont, n) }; };

  const fresh = step(every, contents([]));
  eq(fresh.next.records, ["c in g2", "k in c in g2"], "managed: a new view records its extra occurrences");
  const again = step(every, fresh.next);
  eq([created(again.n), again.n.removedVisualIds.length, again.next.records], [0, 0, fresh.next.records],
     "managed: a second run changes nothing");
  const off = step(one, fresh.next);
  eq([off.n.removedVisualIds.sort(), off.next.records], [["new:c_occ_1", "new:k_occ_1"], []],
     "managed: switched off → the extra occurrences are removed");
  const on = step(every, off.next);
  eq([created(on.n), on.next.records], [2, ["c in g2", "k in c in g2"]], "managed: switched back on → restored");

  // The user's own visuals: g1 ⊃ c ⊃ k; a copy of c in g2 placed by hand (no record).
  const hand = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc", "c", "vg1"], ["vk", "k", "vc"], ["vc2", "c", "vg2"]]);
  const h = step(one, contents(hand));
  eq([h.n.removedVisualIds, h.n.userInPlace, h.n.parentMap[h.n.occurrenceOf.get("vc2")]], [[], 1, "g2"],
     "user content the settings place nowhere stays in its container, laid out");
  const he = step(every, contents(hand));
  eq([h.n.removedVisualIds, he.n.visualOf.c_occ_1, he.next.records], [[], "vc2", ["k in c in g2"]],
     "user content fills a placement before a managed one is made");

  // Moved by the user: the managed copy of c is now at the root → user content.
  const moved = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc", "c", "vg1"], ["vc2", "c"]], ["c in g2"]);
  eq(moved.map(v => v.managed), [false, false, false, false], "managed: a moved occurrence is user content");
  // Last occurrence: the user deleted c in g1; the managed copy in g2 is all that is left.
  const last = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc2", "c", "vg2"]], ["c in g2"]);
  eq(last.map(v => v.managed), [false, false, false], "managed: an element's last occurrence is user content");
  const lastOff = step(one, contents(last));
  eq([lastOff.n.removedVisualIds, lastOff.n.visualOf.c, lastOff.n.parentMap.c], [[], "vc2", "g2"],
     "managed: the last occurrence is never removed, and its container is the current one");
  // User content inside a managed container keeps the container.
  const inside = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc", "c", "vg1"], ["vc2", "c", "vg2"], ["vx", "k", "vc2"]],
    ["c in g2"]);
  eq(inside.find(v => v.id === "vc2").managed, false, "managed: a container holding user content is user content");
  const note = Pipeline.classifyVisuals([{ id: "vg2", conceptId: "g2" }, { id: "vc2", conceptId: "c", parentVisualId: "vg2" },
    { id: "vn", conceptId: null, parentVisualId: "vc2" }, { id: "vc", conceptId: "c" }], ["c in g2"]);
  eq(note.map(v => v.managed), [false, false, false, false], "managed: a note inside makes the container user content");
  // Same placement twice: one record, two visuals → the first in view order is managed.
  const twice = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc", "c", "vg1"], ["va", "c", "vg2"], ["vb", "c", "vg2"]],
    ["c in g2"]);
  eq(twice.map(v => v.managed), [false, false, false, true, false], "managed: same placement twice → first managed");
  const tw = step(every, contents(twice));
  eq([tw.n.removedVisualIds, tw.n.visualOf.c_occ_1], [["va"], "vb"], "managed: the user's copy takes the placement");
  // A relation drawn as nesting is not also a line: the line from a one-parent run is removed.
  const lineRun = visuals([["vg1", "g1"], ["vg2", "g2"], ["vc", "c", "vg1"], ["vk", "k", "vc"]]);
  const vrs = [{ id: "n1", concept: rels[0], source: { id: "vg1" }, target: { id: "vc" } },
               { id: "l2", concept: rels[1], source: { id: "vg2" }, target: { id: "vc" } },
               { id: "n3", concept: rels[2], source: { id: "vc" }, target: { id: "vk" } }];
  const ev = resolve(every, elements, rels, lineRun);
  const nc = Pipeline.nestingConnections(ev.parentRels, ev.visualOf, vrs);
  eq([nc.keptVrIds.filter(Boolean).sort(), nc.removedVrIds], [["n1", "n3"], ["l2"]],
     "nesting connections: kept between the paired visuals, the old line of a nested relation removed");
  const on1 = resolve(one, elements, rels, lineRun);
  eq(Pipeline.nestingConnections(on1.parentRels, on1.visualOf, vrs).removedVrIds, [],
     "nesting connections: a relation drawn as a line keeps its line");
  // A record that matches nothing is dropped.
  eq(visuals([["vg1", "g1"]], ["c in g2"]).map(v => v.managed), [false], "managed: a stale record is dropped");
}

// ── connections between occurrences ──────────────────────────────────────────
{
  const [g1, g2, a, b, x] = [el("g1", "G1"), el("g2", "G2"), el("a", "A", "business-actor"),
                             el("b", "B", "business-role"), el("x", "X", "business-role")];
  const elements = [g1, g2, a, b, x];
  const rels = [rel("n1", g1, a), rel("n2", g2, a), rel("n3", g1, b), rel("n4", g2, b),
                rel("s1", a, b, "serving-relationship"), rel("s2", x, a, "serving-relationship"),
                rel("s3", g1, a, "serving-relationship")];
  const preset = Defs.validatePreset({ algorithm: "Layered", params: { nestingRules: AGG_EVERY, reverseRules: [] } });
  const graph = cont => H.layoutGraph(preset, { elements, relations: rels, visuals: [], visualRelations: [], ...cont });
  const edgesOf = g => g.edges.map(e => `${e.id}:${e.source}>${e.target}`).sort();
  eq(edgesOf(graph({})), ["s1:a>b", "s2:x>a", "s3:g1>a_occ_1"],
     "connections: once per relation, closest pair; not between a container and its own content");
  const vs = visuals([["vg1", "g1"], ["vg2", "g2"], ["va", "a", "vg1"], ["va2", "a", "vg2"], ["vb", "b", "vg1"],
                      ["vb2", "b", "vg2"], ["vx", "x"]], ["a in g2", "b in g2"]);
  const vrs = [{ id: "c1", concept: rels[4], source: { id: "va2" }, target: { id: "vb" } },
               { id: "c2", concept: rels[4], source: { id: "va" }, target: { id: "vb" } }];
  eq(edgesOf(graph({ visuals: vs, visualRelations: vrs })).filter(e => e.startsWith("s1")),
     ["s1:a_occ_1>b", "s1_1:a>b"], "connections: those on the view keep their ends, each laid out");
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
      const preset = Defs.validatePreset({ params: { nestingRules: rules, reverseRules: [] } });
      const g = H.layoutGraph(preset, H.newView(fwd));
      eq([g.nodes.length, g.edges.length], [128, 60], `Kennismodel (copy), ${label}: one connection per relation`);
      const first = H.resolve(p, fwd).nesting;
      const next = H.simulateWrite(fwd, first);
      const second = H.resolve(p, next).nesting;
      eq([second.removedVisualIds.length, Object.values(second.occurrenceMap).flat().filter(o => !second.visualOf[o]).length,
          H.simulateWrite(next, second).records], [0, 0, next.records], `Kennismodel (copy), ${label}: a second run is stable`);
    } else {
      eq(groep.split(", ").length, 1, `Kennismodel (copy), ${label}: Groep has one parent`);
    }
  }
} else {
  console.log(`(skipped Kennismodel (copy): ${MODEL} not found)`);
}

console.log(failed ? `\n${failed} FAILED` : "all nesting tests passed");
process.exit(failed ? 1 : 0);
