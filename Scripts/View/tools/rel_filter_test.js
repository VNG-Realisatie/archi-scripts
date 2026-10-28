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
const norm = (kind, raw) => RF.normalizeRules(kind, raw, valid, "test");
const el = (type, props) => ({ id: type, type, prop: k => (props || {})[k] });

// ── normalise / serialise ─────────────────────────────────────────────────────
eq(norm("relation", [{ relation: "serving-relationship" }]),
   [{ on: true, mode: "include", source: "", relation: "serving-relationship", target: "",
      propertyOf: "relation", property: "", value: "", everyContainer: false }], "normalise fills defaults");
eq(norm("relation", [{ relaton: "serving-relationship" }]), [], "unknown key rejects the rule");
eq(norm("relation", [{ relation: "nonsense-relationship" }]), [], "unknown type rejects the rule");
eq(norm("step", [{ direction: "sideways" }]), [], "unknown enum rejects the rule");
eq(norm("style", [{ colorRange: "Nope" }]), [], "unknown colour range rejects the rule");
eq(RF.serializeRule("step", norm("step", [{ relation: "serving-relationship", added: "business-object" }])[0]),
   { relation: "serving-relationship", added: "business-object" }, "serialise omits defaults");
eq(RF.serializeRule("relation", norm("relation", [{ on: false, relation: "serving-relationship" }])[0]),
   { on: false, relation: "serving-relationship" }, "serialise keeps on:false");
eq(RF.serializeRule("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: true }])[0]),
   { relation: "aggregation-relationship", everyContainer: true }, "serialise keeps everyContainer:true");
eq(RF.serializeRule("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: false }])[0]),
   { relation: "aggregation-relationship" }, "serialise omits everyContainer:false");
eq(norm("relation", [{ everyContainer: "yes" }]), [], "non-boolean everyContainer rejects the rule");
eq(RF.isPassAll("relation", []), true, "empty list passes all");
eq(RF.isPassAll("relation", norm("relation", [{}])), true, "default rule passes all");
eq(RF.isPassAll("relation", norm("relation", [{ relation: "serving-relationship" }])), false, "specific rule filters");

// ── relation matching ─────────────────────────────────────────────────────────
const rel = rules => (t, s, g, all) => RF.matchRelation(norm("relation", rules), t, s, g, all);
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
eq(off("serving-relationship", "a", "b", false), false, "off rule is ignored");
const incExc = rel([{ relation: "serving-relationship" }, { mode: "exclude", source: "grouping" }]);
eq(incExc("serving-relationship", "grouping",        "b", true), false, "exclude vetoes include");
eq(incExc("serving-relationship", "business-object", "b", true), true,  "exclude does not apply elsewhere");
// every container: an Include rule with the flag, vetoed by Exclude rules; rule order is irrelevant
const every = rules => (t, s, g) => RF.matchEveryContainer(norm("relation", rules), t, s, g);
const evA = every([{ relation: "aggregation-relationship" }, { relation: "serving-relationship", everyContainer: true }]);
eq(evA("serving-relationship",     "a", "b"), true,  "every: rule with the flag matches");
eq(evA("aggregation-relationship", "a", "b"), false, "every: rule without the flag does not");
eq(every([{ relation: "serving-relationship", everyContainer: true }, { relation: "serving-relationship" }])("serving-relationship", "a", "b"), true,
   "every: a second matching rule without the flag does not cancel it (order-free)");
eq(every([{ relation: "serving-relationship", everyContainer: true }, { mode: "exclude", source: "grouping" }])("serving-relationship", "grouping", "b"), false,
   "every: exclude vetoes");
eq(every([])("serving-relationship", "a", "b"), false, "every: empty list");
// property condition: read from the relation, its source or its target
const pObj = props => ({ prop: k => props[k] });
const pRel = { type: "serving-relationship", source: Object.assign(pObj({ Laag: "A" }), { type: "grouping" }),
               target: Object.assign(pObj({}), { type: "grouping" }) };
Object.assign(pRel, pObj({ Soort: "x" }));
const relP = rules => RF.matchRelation(norm("relation", rules), pRel.type, "grouping", "grouping", false, pRel);
eq(relP([{ property: "Soort", value: "x" }]), true,  "relation property matches");
eq(relP([{ property: "Soort", value: "y" }]), false, "relation property differs");
eq(relP([{ propertyOf: "source", property: "Laag", value: "A" }]), true,  "source property matches");
eq(relP([{ propertyOf: "target", property: "Laag", value: "A" }]), false, "target property differs");
eq(norm("relation", [{ propertyOf: "element" }]), [], "unknown propertyOf rejects the rule");

// ── element filter ────────────────────────────────────────────────────────────
const elRules = norm("element", [{ elementType: "business-object" }, { elementType: "grouping", property: "Status", value: "Active" }]);
eq(RF.matchElement(elRules, el("business-object")), true, "element type include");
eq(RF.matchElement(elRules, el("grouping", { Status: "Active" })), true, "element property match");
eq(RF.matchElement(elRules, el("grouping", { Status: "Closed" })), false, "element property miss");
eq(RF.matchElement(elRules, el("business-service")), false, "element type miss");
eq(RF.matchElement([], el("anything")), true, "empty element list keeps everything");

// ── diagram filter ────────────────────────────────────────────────────────────
eq(RF.matchDiagram(norm("diagram", [{ diagramType: "archimate-diagram-model" }]), "archimate-diagram-model"), true, "diagram include");
eq(RF.matchDiagram(norm("diagram", [{ diagramType: "archimate-diagram-model" }]), "canvas"), false, "diagram miss");

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

// relation collection ignores Added type and property on Include rules, applies Exclude in full
const relColl = raw => c => RF.matchStepRelation(norm("step", raw), c);
const toBo = relColl([{ relation: "serving-relationship", added: "business-object" }]);
eq(toBo(cand("serving-relationship", grp, ac, true)), true, "relation collection: include ignores added type");
eq(toBo(cand("aggregation-relationship", grp, bo, true)), false, "relation collection: relation type still applies");
eq(relColl([{ direction: "incoming" }])(cand("serving-relationship", grp, bo, true)), false, "relation collection: direction applies");
eq(relColl([{}, { mode: "exclude", added: "business-object" }])(cand("serving-relationship", grp, bo, true)), false, "relation collection: exclude applies in full");

// ── style conflicts ───────────────────────────────────────────────────────────
eq(RF.detectRuleConflicts(new Map([[0, new Set(["a", "b"])], [1, new Set(["b", "c"])], [2, new Set(["z"])]])),
   [{ rule: 0, with: [1], count: 1 }, { rule: 1, with: [0], count: 1 }], "style rule conflicts");
eq(RF.detectRuleConflicts(new Map([[0, new Set(["a"])], [1, new Set(["b"])]])), [], "no conflicts");

console.log(failed ? `\n${failed} FAILED` : "all rel_filter tests passed");
process.exit(failed ? 1 : 0);
