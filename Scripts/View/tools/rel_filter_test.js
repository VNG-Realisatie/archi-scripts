/**
 * Node tests for lib/rel_filter.js.  Run from the repo root:
 *   node Scripts/View/tools/rel_filter_test.js
 */
const path = require("path");
global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const RF = require("../lib/rel_filter");

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const valid = {
  elements:    new Set(["grouping", "business-object", "application-component", "business-service"]),
  relations:   new Set(["aggregation-relationship", "serving-relationship", "association-relationship"]),
  diagrams:    new Set(["archimate-diagram-model"]),
  colorRanges: new Set(["Blues", "Reds"]),
};
const norm = (kind, raw) => RF.normalizeConditions(kind, raw, valid, "test");
const el = (type, props) => ({ id: type, type, prop: k => (props || {})[k] });

// ── normalise / serialise ─────────────────────────────────────────────────────
eq(norm("relation", [{ relation: "serving-relationship" }]),
   [{ on: true, mode: "include", source: "", relation: "serving-relationship", target: "",
      propertyOf: "relation", property: "", value: "", everyContainer: false }], "normalise fills defaults");
eq(norm("relation", [{ relaton: "serving-relationship" }]), [], "unknown key rejects the condition");
eq(norm("relation", [{ relation: "nonsense-relationship" }]), [], "unknown type rejects the condition");
eq(norm("step", [{ direction: "sideways" }]), [], "unknown enum rejects the condition");
eq(norm("style", [{ colorRange: "Nope" }]), [], "unknown colour range rejects the condition");
eq(RF.serializeCondition("step", norm("step", [{ relation: "serving-relationship", added: "business-object" }])[0]),
   { relation: "serving-relationship", added: "business-object" }, "serialise omits defaults");
eq(RF.serializeCondition("relation", norm("relation", [{ on: false, relation: "serving-relationship" }])[0]),
   { on: false, relation: "serving-relationship" }, "serialise keeps on:false");
eq(RF.serializeCondition("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: true }])[0]),
   { relation: "aggregation-relationship", everyContainer: true }, "serialise keeps everyContainer:true");
eq(RF.serializeCondition("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: false }])[0]),
   { relation: "aggregation-relationship" }, "serialise omits everyContainer:false");
eq(norm("relation", [{ everyContainer: "yes" }]), [], "non-boolean everyContainer rejects the condition");
eq(RF.isPassAll("relation", []), true, "empty list passes all");
eq(RF.isPassAll("relation", norm("relation", [{}])), true, "default condition passes all");
eq(RF.isPassAll("relation", norm("relation", [{ relation: "serving-relationship" }])), false, "specific condition filters");

// ── relation matching ─────────────────────────────────────────────────────────
const rel = conditions => (t, s, g, all) => RF.matchRelation(norm("relation", conditions), t, s, g, all);
const only = rel([{ relation: "serving-relationship" }]);
eq(only("serving-relationship", "grouping", "grouping", true), true,  "include match");
eq(only("flow-relationship",    "grouping", "grouping", true), false, "include miss");
const exceptAssoc = rel([{ mode: "exclude", relation: "association-relationship" }]);
eq(exceptAssoc("serving-relationship",     "grouping", "grouping", true),  true,  "only excludes: keeps the rest (filter)");
eq(exceptAssoc("association-relationship", "grouping", "grouping", true),  false, "only excludes: drops the match");
eq(exceptAssoc("serving-relationship",     "grouping", "grouping", false), false, "only excludes: feature list selects nothing");
eq(RF.matchRelation([], "x", "y", "z", true),  true,  "empty filter list keeps everything");
eq(RF.matchRelation([], "x", "y", "z", false), false, "empty feature list selects nothing");
const nest = rel([{ source: "grouping", relation: "aggregation-relationship" }]);
eq(nest("aggregation-relationship", "grouping",        "business-object", false), true,  "source type constrains");
eq(nest("aggregation-relationship", "business-object", "grouping",        false), false, "source type constrains (other side)");
const off = rel([{ on: false, relation: "serving-relationship" }]);
eq(off("serving-relationship", "a", "b", false), false, "off condition is ignored");
const incExc = rel([{ relation: "serving-relationship" }, { mode: "exclude", source: "grouping" }]);
eq(incExc("serving-relationship", "grouping",        "b", true), false, "exclude vetoes include");
eq(incExc("serving-relationship", "business-object", "b", true), true,  "exclude does not apply elsewhere");
// every container: an Include condition with the flag, vetoed by Exclude conditions; condition order is irrelevant
const every = conditions => (t, s, g) => RF.matchEveryContainer(norm("relation", conditions), t, s, g);
const evA = every([{ relation: "aggregation-relationship" }, { relation: "serving-relationship", everyContainer: true }]);
eq(evA("serving-relationship",     "a", "b"), true,  "every: condition with the flag matches");
eq(evA("aggregation-relationship", "a", "b"), false, "every: condition without the flag does not");
eq(every([{ relation: "serving-relationship", everyContainer: true }, { relation: "serving-relationship" }])("serving-relationship", "a", "b"), true,
   "every: a second matching condition without the flag does not cancel it (order-free)");
eq(every([{ relation: "serving-relationship", everyContainer: true }, { mode: "exclude", source: "grouping" }])("serving-relationship", "grouping", "b"), false,
   "every: exclude vetoes");
eq(every([])("serving-relationship", "a", "b"), false, "every: empty list");
// property and value: read from the relation, its source or its target
const pObj = props => ({ prop: k => props[k] });
const pRel = { type: "serving-relationship", source: Object.assign(pObj({ Laag: "A" }), { type: "grouping" }),
               target: Object.assign(pObj({}), { type: "grouping" }) };
Object.assign(pRel, pObj({ Soort: "x" }));
const relP = conditions => RF.matchRelation(norm("relation", conditions), pRel.type, "grouping", "grouping", false, pRel);
eq(relP([{ property: "Soort", value: "x" }]), true,  "relation property matches");
eq(relP([{ property: "Soort", value: "y" }]), false, "relation property differs");
eq(relP([{ propertyOf: "source", property: "Laag", value: "A" }]), true,  "source property matches");
eq(relP([{ propertyOf: "target", property: "Laag", value: "A" }]), false, "target property differs");
eq(norm("relation", [{ propertyOf: "element" }]), [], "unknown propertyOf rejects the condition");

// ── element filter ────────────────────────────────────────────────────────────
const elConditions = norm("element", [{ elementType: "business-object" }, { elementType: "grouping", property: "Status", value: "Active" }]);
eq(RF.matchElement(elConditions, el("business-object")), true, "element type include");
eq(RF.matchElement(elConditions, el("grouping", { Status: "Active" })), true, "element property match");
eq(RF.matchElement(elConditions, el("grouping", { Status: "Closed" })), false, "element property miss");
eq(RF.matchElement(elConditions, el("business-service")), false, "element type miss");
eq(RF.matchElement([], el("anything")), true, "empty element list keeps everything");
eq(RF.matchElement(norm("element", [{ on: false }]), el("business-object")), false, "element Include conditions all off keep nothing");
eq(RF.matchElement(norm("element", [{}, { on: false, elementType: "grouping" }]), el("business-object")), true, "element condition off: others still apply");
eq(RF.matchElement(norm("element", [{}, { on: false, mode: "exclude", elementType: "grouping" }]), el("grouping")), true, "element Exclude condition off removes nothing");

// ── diagram filter ────────────────────────────────────────────────────────────
eq(RF.matchDiagram(norm("diagram", [{ diagramType: "archimate-diagram-model" }]), "archimate-diagram-model"), true, "diagram include");
eq(RF.matchDiagram(norm("diagram", [{ diagramType: "archimate-diagram-model" }]), "canvas"), false, "diagram miss");
eq(RF.matchDiagram(norm("diagram", [{ on: false }]), "canvas"), false, "diagram Include conditions all off keep nothing");

// ── step matching ─────────────────────────────────────────────────────────────
const cand = (relType, frontier, other, outgoing, relProps) => ({
  rel: { id: `${relType}:${frontier.type}:${other.type}`, type: relType, prop: k => (relProps || {})[k] },
  frontier, other, outgoing,
});
const grp = el("grouping"), bo = el("business-object"), ac = el("application-component", { Status: "Active" });
const step = raw => c => RF.matchStep(norm("step", raw), c);

const out = step([{ direction: "outgoing", relation: "aggregation-relationship", previous: "grouping" }]);
eq(out(cand("aggregation-relationship", grp, bo, true)),  true,  "step outgoing from grouping");
eq(out(cand("aggregation-relationship", grp, bo, false)), false, "step outgoing rejects incoming");
eq(out(cand("aggregation-relationship", bo, grp, true)),  false, "step previous type constrains");

const either = step([{ relation: "serving-relationship", added: "business-object" }]);
eq(either(cand("serving-relationship", grp, bo, true)),  true, "either: outgoing, added type");
eq(either(cand("serving-relationship", grp, bo, false)), true, "either: incoming, added type");
eq(either(cand("serving-relationship", bo, grp, true)),  false, "either: added type must match the other end");

const prop = step([{ added: "application-component", propertyOf: "added", property: "Status", value: "Active" }]);
eq(prop(cand("serving-relationship", grp, ac, true)), true, "step property of added element");
eq(prop(cand("serving-relationship", grp, el("application-component", { Status: "Old" }), true)), false, "step property mismatch");
const relProp = step([{ propertyOf: "relation", property: "Kind", value: "x" }]);
eq(relProp(cand("serving-relationship", grp, bo, true, { Kind: "x" })), true, "step property of relation");
eq(relProp(cand("serving-relationship", grp, bo, true, { Kind: "y" })), false, "step property of relation mismatch");

const ex = step([{}, { mode: "exclude", relation: "association-relationship" }]);
eq(ex(cand("association-relationship", grp, bo, true)), false, "step exclude");
eq(ex(cand("serving-relationship",     grp, bo, true)), true,  "step include-all with exclude");
eq(RF.matchStep([], cand("serving-relationship", grp, bo, true)), true, "empty step list follows everything");
eq(RF.matchStep(norm("step", [{ on: false, mode: "exclude" }]), cand("serving-relationship", grp, bo, true)), true, "step Exclude condition off removes nothing");
eq(RF.matchStep(norm("step", [{ on: false }]), cand("serving-relationship", grp, bo, true)), false, "step Include conditions all off follow nothing");

// relation collection ignores Added type and property on Include conditions, applies Exclude in full
const relColl = raw => c => RF.matchStepRelation(norm("step", raw), c);
const toBo = relColl([{ relation: "serving-relationship", added: "business-object" }]);
eq(toBo(cand("serving-relationship", grp, ac, true)), true, "relation collection: include ignores added type");
eq(toBo(cand("aggregation-relationship", grp, bo, true)), false, "relation collection: relation type still applies");
eq(relColl([{ direction: "incoming" }])(cand("serving-relationship", grp, bo, true)), false, "relation collection: direction applies");
eq(relColl([{}, { mode: "exclude", added: "business-object" }])(cand("serving-relationship", grp, bo, true)), false, "relation collection: exclude applies in full");

// ── style conflicts ───────────────────────────────────────────────────────────
eq(RF.detectConditionConflicts(new Map([[0, new Set(["a", "b"])], [1, new Set(["b", "c"])], [2, new Set(["z"])]])),
   [{ condition: 0, with: [1], count: 1 }, { condition: 1, with: [0], count: 1 }], "style condition conflicts");
eq(RF.detectConditionConflicts(new Map([[0, new Set(["a"])], [1, new Set(["b"])]])), [], "no conflicts");

// ── nesting style conditions ──────────────────────────────────────────────────
eq(norm("nestingStyle", [{}]), [{ on: true, parent: "", direction: "either", relation: "", child: "same", color: "", fontSize: 0, bold: false }], "nesting style: defaults");
eq(norm("nestingStyle", [{ fontSize: 14, bold: true }])[0].fontSize, 14, "nesting style: font size");
eq(norm("nestingStyle", [{ fontSize: "14" }]), [], "nesting style: font size must be a number");
eq(norm("nestingStyle", [{ bold: "yes" }]), [], "nesting style: bold must be true or false");
eq(norm("nestingStyle", [{ child: "grouping", color: "Bedrijf gedrag" }])[0].child, "grouping", "nesting style: child type");
eq(norm("nestingStyle", [{ parent: "same" }]), [], "nesting style: same only for child");
eq(RF.serializeCondition("nestingStyle", norm("nestingStyle", [{}])[0]), { child: "same" }, "nesting style: child always written");
const nsm = (raw, pt, ct, rels) => RF.nestingStyleConditionMatches(norm("nestingStyle", [raw])[0], pt, ct, rels);
const agg = [{ type: "aggregation-relationship", outgoing: true }];
eq(nsm({}, "grouping", "grouping", []), true, "nesting style: same type, no relation needed");
eq(nsm({}, "grouping", "business-object", agg), false, "nesting style: same type rejects another type");
eq(nsm({ child: "" }, "grouping", "business-object", []), true, "nesting style: child All");
eq(nsm({ child: "", relation: "aggregation-relationship" }, "grouping", "business-object", []), false, "nesting style: relation needed");
eq(nsm({ child: "", direction: "outgoing" }, "grouping", "business-object", agg), true, "nesting style: outgoing");
eq(nsm({ child: "", direction: "incoming" }, "grouping", "business-object", agg), false, "nesting style: incoming rejects outgoing");

// ── nesting style chains (appearance.followNestingChains) ─────────────────────
global.Java = { type: () => ({}) };
const Appearance = require("../lib/appearance");
const node = (id, parentId, type, depth, isContainer, rels) => ({ id, parentId, type, depth, isContainer, rels: rels || [] });
// grouping › grouping › function › function › service › component; a second root without a matching condition
const chainNodes = [
  node("g0", null, "grouping", 0, true), node("g1", "g0", "grouping", 1, true, agg),
  node("f1", "g1", "business-function", 2, true, agg), node("f2", "f1", "business-function", 3, true, agg),
  node("s1", "f2", "application-service", 4, true, [{ type: "serving-relationship", outgoing: false }]),
  node("c1", "s1", "application-component", 5, false, [{ type: "realization-relationship", outgoing: false }]),
  node("o0", null, "business-object", 0, true), node("o1", "o0", "business-object", 1, false),
];
const NS = raw => raw.map(r => Object.assign(RF.defaultCondition("nestingStyle"), r));
const depthOf = new Map(chainNodes.map(n => [n.id, n.depth]));
const chains = rules => {
  const { styles, conflicts } = Appearance.followNestingChains(chainNodes, NS(rules), 2);
  const out = {}; styles.forEach((v, k) => { out[k] = `${depthOf.get(k)}/${v.segmentDepth}/${v.color}`; });
  return { out, conflicts };
};
const fonts = rules => {
  const out = {}; Appearance.followNestingChains(chainNodes, NS(rules), 2).styles.forEach((v, k) => { out[k] = `${v.fontSize}${v.bold ? "b" : ""}`; });
  return out;
};
eq(chains([{ parent: "grouping", color: "Grijs" }]).out, { g0: "0/0/Grijs", g1: "1/1/Grijs" }, "chains: same-type chain stops at another type");
eq(chains([{}]).out, { g0: "0/0/", o0: "0/0/", g1: "1/1/", o1: "1/1/" }, "chains: default condition = same-type chain from every root");
// the user's case: a condition's colour goes to the children it selects; the component is not selected
eq(chains([
  { parent: "grouping", color: "Grijs" },
  { parent: "", child: "business-function", relation: "aggregation-relationship", color: "Geel" },
  { parent: "business-function", child: "application-service", direction: "incoming", relation: "serving-relationship", color: "Blauw" },
]).out, { g0: "0/0/Grijs", g1: "1/1/Grijs", f1: "2/0/Geel", f2: "3/1/Geel", s1: "4/0/Blauw" },
   "chains: colour per condition to its selection; unselected step (component) stops; a root only by a condition for its type");
eq(chains([{ parent: "", color: "A" }, { parent: "grouping", child: "", color: "B" }, { parent: "", child: "", color: "C" }]).out.g0,
   "0/0/B", "chains: a root takes its own type's condition before parent All");
eq(chains([{ parent: "grouping", child: "", color: "A" }, { parent: "grouping", color: "B" }]).out,
   { g0: "0/0/B", g1: "1/1/B", f1: "2/0/A" }, "chains: the most specific condition wins (= Parent over All), whatever the order");
eq(chains([{ parent: "grouping", child: "grouping", color: "A" }, { parent: "grouping", color: "B" }]).out,
   { g0: "0/0/A", g1: "1/1/A" }, "chains: a child type beats = Parent, for a root too");
eq(chains([{ parent: "", child: "business-function", color: "A" }, { parent: "grouping", color: "B" }]).out.g0,
   "0/0/B", "chains: a root takes the condition that selects its type as child, whatever the order");
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship", color: "A" }, { parent: "grouping", child: "", color: "B" }]).out.f1,
   "2/0/A", "chains: a named relation beats All");
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship", color: "A" }, { parent: "grouping", child: "", direction: "outgoing", color: "B" }]),
   { out: { g0: "0/0/B", g1: "1/1/B", f1: "2/0/B" }, conflicts: ["1, 2"] }, "chains: equally specific conditions (and a root's): the last wins, conflict reported");
eq(chains([{ parent: "", child: "grouping", relation: "aggregation-relationship", color: "B" }, { parent: "grouping", color: "A" }]),
   { out: { g0: "0/0/A", g1: "1/0/B" }, conflicts: ["1, 2"] }, "chains: another colour starts a segment; a root does not count the relation");
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship" }]).out,
   { g0: "0/0/", g1: "1/1/", f1: "2/0/" }, "chains: Default continues a same-type segment, another type starts one");
eq(fonts([{ fontSize: 14, bold: true }]), { g0: "14b", o0: "14b", g1: "12", o1: "12" }, "fonts: a root takes its condition's font, deeper levels smaller and not bold");
eq(fonts([{ parent: "grouping", fontSize: 16, bold: true }, { parent: "", child: "business-function", relation: "aggregation-relationship" },
          { parent: "business-function", child: "application-service", direction: "incoming", relation: "serving-relationship", fontSize: 14, bold: true }]),
   { g0: "16b", g1: "14", f1: "12", f2: "10", s1: "14b" },
   "fonts: a condition without font size continues from its parent; a condition with one restarts where it starts");
eq(fonts([{ parent: "grouping", fontSize: 12 }, { parent: "", child: "business-function", relation: "aggregation-relationship", fontSize: 18 }]),
   { g0: "12", g1: "10", f1: "18", f2: "16" }, "fonts: the size is never below the default 9");
{
  // a leaf beside a container (here a root leaf and a leaf under g0) takes the font; a lone leaf does not
  const side = [node("g0", null, "grouping", 0, true), node("x0", null, "grouping", 0, false),
    node("g1", "g0", "grouping", 1, true, agg), node("g2", "g0", "grouping", 1, false, agg), node("g3", "g1", "grouping", 2, false, agg)];
  const out = {}; Appearance.followNestingChains(side, NS([{ fontSize: 14, bold: true }]), 2).styles.forEach((v, k) => { out[k] = `${v.fontSize}${v.bold ? "b" : ""}/${v.asContainer}`; });
  eq(out, { g0: "14b/true", x0: "14b/true", g1: "12/true", g2: "12/true", g3: "10/false" }, "fonts: a leaf beside a container is styled as a container");
}
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship", fontSize: 12 }, { parent: "grouping", child: "", direction: "outgoing" }]).conflicts,
   ["1, 2"], "chains: equally specific conditions with different fonts: conflict reported");
console.log(failed ? `\n${failed} FAILED` : "all rel_filter tests passed");
process.exit(failed ? 1 : 0);
