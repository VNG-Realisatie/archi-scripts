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
};
const norm = (kind, raw) => RF.normalizeConditions(kind, raw, valid, "test");
/** The message normalising refuses with, "" when it accepts. */
const refused = (kind, raw) => { try { norm(kind, raw); return ""; } catch (e) { return String(e.message); } };
const el = (type, props) => ({ id: type, type, prop: k => (props || {})[k] });

// ── normalise / serialise ─────────────────────────────────────────────────────
eq(norm("relation", [{ relation: "serving-relationship" }]),
   [{ on: true, mode: "include", source: "", relation: "serving-relationship", target: "",
      propertyOf: "relation", property: "", value: "", everyContainer: false }], "normalise fills defaults");
eq(refused("relation", [{ relaton: "serving-relationship" }]).startsWith("test[0]: "), true, "unknown key is refused");
eq(refused("relation", [{ relation: "nonsense-relationship" }]), 'test[0]: unknown relation "nonsense-relationship". Correct the condition in the preset file.', "unknown type is refused, naming it");
eq(refused("step", [{ direction: "sideways" }]).startsWith("test[0]: "), true, "unknown enum is refused");
eq(refused("style", [{ colorRange: "" }]).startsWith("test[0]: "), true, "an empty color range is refused");
eq(RF.serializeCondition("step", norm("step", [{ relation: "serving-relationship", added: "business-object" }])[0]),
   { relation: "serving-relationship", added: "business-object" }, "serialise omits defaults");
eq(RF.serializeCondition("relation", norm("relation", [{ on: false, relation: "serving-relationship" }])[0]),
   { on: false, relation: "serving-relationship" }, "serialise keeps on:false");
eq(RF.serializeCondition("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: true }])[0]),
   { relation: "aggregation-relationship", everyContainer: true }, "serialise keeps everyContainer:true");
eq(RF.serializeCondition("relation", norm("relation", [{ relation: "aggregation-relationship", everyContainer: false }])[0]),
   { relation: "aggregation-relationship" }, "serialise omits everyContainer:false");
eq(refused("relation", [{ everyContainer: "yes" }]).startsWith("test[0]: "), true, "non-boolean everyContainer is refused");
eq(RF.isPassAll("relation", []), true, "empty list passes all");
eq(RF.isPassAll("relation", norm("relation", [{}])), true, "default condition passes all");
eq(RF.isPassAll("relation", norm("relation", [{ relation: "serving-relationship" }])), false, "specific condition filters");
eq(RF.compactPreset({ filter: { conditions: norm("filter", [{}]) }, relatedElements: { steps: [{ conditions: norm("step", [{}]) }] } }),
   { filter: { conditions: [] }, relatedElements: { steps: [{ conditions: [{}] }] } },
   "compact: a pass-all filter becomes [], a pass-all step condition stays (an empty step adds nothing)");

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
eq(refused("relation", [{ propertyOf: "element" }]).startsWith("test[0]: "), true, "unknown propertyOf is refused");

// ── global filter: element and relation rows ──────────────────────────────────
{
  const rows = norm("filter", [{ source: "grouping" }, { applyTo: "relation", relation: "serving-relationship" }]);
  const rel = (type, s, t) => ({ type, source: { type: s }, target: { type: t } });
  eq(RF.matchElement(rows, el("business-object")), false, "an element row does not keep another type");
  eq(RF.matchElement(norm("filter", [{ applyTo: "relation", relation: "serving-relationship" }]), el("business-object")), true, "relation rows alone keep every element");
  eq(RF.matchFilterRelation(rows, rel("serving-relationship", "grouping", "grouping")), true, "relation row keeps its relation type");
  eq(RF.matchFilterRelation(rows, rel("aggregation-relationship", "grouping", "grouping")), false, "relation row drops another relation type");
  eq(RF.matchFilterRelation(norm("filter", [{ source: "grouping" }]), rel("aggregation-relationship", "x", "y")), true, "element rows alone keep every relation");
  eq(RF.isPassAll("filter", norm("filter", [{}, { applyTo: "relation" }])), true, "a default row per kind filters nothing");
  eq(RF.isPassAll("filter", rows), false, "specific rows filter");
  eq(refused("filter", [{ relation: "serving-relationship" }]).startsWith("test[0]: "), true, "an element row with a relation type is refused");
  eq(refused("filter", [{ applyTo: "relation", property: "Status" }]).startsWith("test[0]: "), true, "a relation row with a property is refused");
}

// ── element filter ────────────────────────────────────────────────────────────
const elConditions = norm("filter", [{ source: "business-object" }, { source: "grouping", property: "Status", value: "Active" }]);
eq(RF.matchElement(elConditions, el("business-object")), true, "element type include");
eq(RF.matchElement(elConditions, el("grouping", { Status: "Active" })), true, "element property match");
eq(RF.matchElement(elConditions, el("grouping", { Status: "Closed" })), false, "element property miss");
eq(RF.matchElement(elConditions, el("business-service")), false, "element type miss");
eq(RF.matchElement([], el("anything")), true, "empty element list keeps everything");
eq(RF.matchElement(norm("filter", [{ on: false }]), el("business-object")), false, "element Include conditions all off keep nothing");
eq(RF.matchElement(norm("filter", [{}, { on: false, source: "grouping" }]), el("business-object")), true, "element condition off: others still apply");
eq(RF.matchElement(norm("filter", [{}, { on: false, mode: "exclude", source: "grouping" }]), el("grouping")), true, "element Exclude condition off removes nothing");

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
eq(norm("nestingStyle", [{}]), [{ on: true, parent: "", direction: "either", relation: "", child: "same", propertyOf: "child", property: "", value: "",
  color: "", darkenStart: 1, lightenPerLevel: 15, fontSize: 0, fontStyle: "normal", fontDecreasePerLevel: 2 }], "nesting style: defaults");
eq(norm("nestingStyle", [{ fontSize: 14, fontStyle: "bold" }])[0].fontSize, 14, "nesting style: font size");
eq(norm("nestingStyle", [{ color: "background", fontSize: "background", fontStyle: "background" }]).map(r => [r.color, r.fontSize, r.fontStyle]),
   [["background", "background", "background"]], "nesting style: Background for fill color, font size and font style");
eq(refused("nestingStyle", [{ fontSize: "14" }]).startsWith("test[0]: "), true, "nesting style: font size must be a number");
eq(refused("nestingStyle", [{ fontSize: 30 }]).startsWith("test[0]: "), true, "nesting style: font size from 8 to 24");
eq(refused("nestingStyle", [{ fontStyle: "heavy" }]).startsWith("test[0]: "), true, "nesting style: font style one of the list");
eq(refused("nestingStyle", [{ ["bo" + "ld"]: true }]).startsWith("test[0]: "), true, "nesting style: bold is no key any more (schema 10: fontStyle)");
eq(refused("nestingStyle", [{ lightenPerLevel: 95 }]).startsWith("test[0]: "), true, "nesting style: Lighter per level from 5 to 90");
eq(refused("nestingStyle", [{ darkenStart: 1.5 }]).startsWith("test[0]: "), true, "nesting style: Start darker a whole number");
eq(refused("nestingStyle", [{ propertyOf: "source" }]).startsWith("test[0]: "), true, "nesting style: Property of child, parent or relation");
eq(norm("nestingStyle", [{ child: "grouping", color: "Bedrijf gedrag" }])[0].child, "grouping", "nesting style: child type");
eq(refused("nestingStyle", [{ parent: "same" }]).startsWith("test[0]: "), true, "nesting style: same only for child");
eq(RF.serializeCondition("nestingStyle", norm("nestingStyle", [{}])[0]), { child: "same" }, "nesting style: child always written");
const nsm = (raw, pt, ct, rels, ends = {}) =>
  RF.nestingStyleConditionMatches(norm("nestingStyle", [raw])[0], { type: pt, element: ends.parent }, { type: ct, element: ends.child, rels });
const agg = [{ type: "aggregation-relationship", outgoing: true }];
const withProps = props => ({ prop: k => (k in props ? props[k] : null) });
eq(nsm({}, "grouping", "grouping", []), true, "nesting style: same type, no relation needed");
eq(nsm({}, "grouping", "business-object", agg), false, "nesting style: same type rejects another type");
eq(nsm({ child: "" }, "grouping", "business-object", []), true, "nesting style: child All");
eq(nsm({ child: "", relation: "aggregation-relationship" }, "grouping", "business-object", []), false, "nesting style: relation needed");
eq(nsm({ child: "", direction: "outgoing" }, "grouping", "business-object", agg), true, "nesting style: outgoing");
eq(nsm({ child: "", direction: "incoming" }, "grouping", "business-object", agg), false, "nesting style: incoming rejects outgoing");
{
  const ends = { parent: withProps({ Status: "Oud" }), child: withProps({ Status: "Actief" }) };
  eq(nsm({ child: "", property: "Status", value: "Actief" }, "grouping", "business-object", [], ends), true, "property match: the child's property");
  eq(nsm({ child: "", propertyOf: "parent", property: "Status", value: "Actief" }, "grouping", "business-object", [], ends), false, "property match: the parent's property");
  eq(nsm({ child: "", propertyOf: "parent", property: "Status", value: "Oud" }, "grouping", "business-object", [], ends), true, "property match: the parent's property matches");
  const rels = [{ type: "aggregation-relationship", outgoing: true, relation: withProps({ Status: "Oud" }) },
                { type: "serving-relationship", outgoing: true, relation: withProps({ Status: "Actief" }) }];
  eq(nsm({ child: "", propertyOf: "relation", property: "Status", value: "Actief" }, "grouping", "business-object", rels), true, "property match: a relation with the value");
  eq(nsm({ child: "", relation: "aggregation-relationship", propertyOf: "relation", property: "Status", value: "Actief" }, "grouping", "business-object", rels), false,
     "property match: the relation of the condition's type must have it");
  eq(nsm({ child: "", propertyOf: "relation", property: "Status", value: "Actief" }, "grouping", "business-object", []), false, "property match on a relation needs a relation");
  const root = (raw, props) => RF.nestingStyleConditionMatchesRoot(norm("nestingStyle", [raw])[0], { type: "grouping", element: withProps(props) });
  eq([root({}, {}), root({ property: "Status", value: "Actief" }, { Status: "Actief" }), root({ property: "Status", value: "Actief" }, {}),
      root({ propertyOf: "parent", property: "Status", value: "" }, {}), root({ relation: "serving-relationship" }, {})], [true, true, false, false, true],
     "root container: its child type; a property match on itself only; relation and direction do not count");
}

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
  const { styles, conflicts } = Appearance.followNestingChains(chainNodes, NS(rules));
  const out = {}; styles.forEach((v, k) => { out[k] = `${depthOf.get(k)}/${v.depthSinceChange}/${v.color}`; });
  return { out, conflicts };
};
const BOLD = { normal: "", bold: "b", italic: "i", bolditalic: "bi" };
const fonts = (rules, nodes = chainNodes) => {
  const out = {}; Appearance.followNestingChains(nodes, NS(rules)).styles.forEach((v, k) => { out[k] = `${v.fontSize}${BOLD[v.fontStyle]}`; });
  return out;
};
eq(chains([{ parent: "grouping", color: "Grijs" }]).out, { g0: "0/0/Grijs", g1: "1/1/Grijs" }, "chains: same-type chain stops at another type");
eq(chains([{}]).out, { g0: "0/0/", o0: "0/0/", g1: "1/1/", o1: "1/1/" }, "chains: default condition = same-type chain from every root");
// the user's case: a condition's color goes to the children it selects; the component is not selected
eq(chains([
  { parent: "grouping", color: "Grijs" },
  { parent: "", child: "business-function", relation: "aggregation-relationship", color: "Geel" },
  { parent: "business-function", child: "application-service", direction: "incoming", relation: "serving-relationship", color: "Blauw" },
]).out, { g0: "0/0/Grijs", g1: "1/1/Grijs", f1: "2/0/Geel", f2: "3/1/Geel", s1: "4/0/Blauw" },
   "chains: color per condition to its selection; unselected step (component) stops; a root only by a condition for its type");
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
   { out: { g0: "0/0/A", g1: "1/0/B" }, conflicts: ["1, 2"] }, "chains: another color is a nesting color change; a root does not count the relation");
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship" }]).out,
   { g0: "0/0/", g1: "1/1/", f1: "2/0/" }, "chains: Default continues under the same type, a nesting type change starts again");
eq(fonts([{ fontSize: 14, fontStyle: "bold" }]), { g0: "14b", o0: "14b", g1: "12", o1: "12" }, "fonts: a root takes its condition's font, deeper levels smaller and not bold");
eq(fonts([{ parent: "grouping", fontSize: 16, fontStyle: "bold" }, { parent: "", child: "business-function", relation: "aggregation-relationship" },
          { parent: "business-function", child: "application-service", direction: "incoming", relation: "serving-relationship", fontSize: 14, fontStyle: "bold" }]),
   { g0: "16b", g1: "14", f1: "12", f2: "10", s1: "14b" },
   "fonts: a condition without font size continues from its parent; a condition with one restarts where it starts");
eq(fonts([{ parent: "grouping", fontSize: 12 }, { parent: "", child: "business-function", relation: "aggregation-relationship", fontSize: 18 }]),
   { g0: "12", g1: "10", f1: "18", f2: "16" }, "fonts: the size is never below the default 9");
{
  // a leaf beside a container (here a root leaf and a leaf under g0) takes the font; a lone leaf does not
  const side = [node("g0", null, "grouping", 0, true), node("x0", null, "grouping", 0, false),
    node("g1", "g0", "grouping", 1, true, agg), node("g2", "g0", "grouping", 1, false, agg), node("g3", "g1", "grouping", 2, false, agg)];
  const out = {}; Appearance.followNestingChains(side, NS([{ fontSize: 14, fontStyle: "bold" }])).styles.forEach((v, k) => { out[k] = `${v.fontSize}${BOLD[v.fontStyle]}/${v.asContainer}`; });
  eq(out, { g0: "14b/true", x0: "14b/true", g1: "12/true", g2: "12/true", g3: "10/false" }, "fonts: a leaf beside a container is styled as a container");
}
eq(chains([{ parent: "grouping", child: "", relation: "aggregation-relationship", fontSize: 12 }, { parent: "grouping", child: "", direction: "outgoing" }]).conflicts,
   ["1, 2"], "chains: equally specific conditions with different fonts: conflict reported");
eq(fonts([{ fontSize: 14, fontStyle: "italic", fontDecreasePerLevel: 4 }]), { g0: "14i", o0: "14i", g1: "10", o1: "10" }, "fonts: Smaller per level and font style per condition");
{
  const props = [node("g0", null, "grouping", 0, true), Object.assign(node("f1", "g0", "business-function", 1, false, agg), { element: withProps({ Status: "Actief" }) })];
  const out = {}; Appearance.followNestingChains(props, NS([{ parent: "grouping", child: "", color: "A" }, { parent: "grouping", child: "", property: "Status", value: "Actief", color: "B" },
    { parent: "grouping", child: "", color: "C" }])).styles.forEach((v, k) => { out[k] = v.color; });
  eq(out.f1, "B", "chains: a property match beats an otherwise equal condition, whatever the order");
}
{
  // Background: each element its own value from its background look; without one the fallback (and it is counted)
  const look = (fontSize, fontStyle, fillColor) => ({ fillColor, fontName: "Serif", fontSize, fontStyle });
  const bg = [node("g0", null, "grouping", 0, true), node("g1", "g0", "grouping", 1, true, agg), node("g2", "g1", "grouping", 2, false, agg)];
  bg[0].look = look(18, "bolditalic", "#a6c3dd"); bg[1].look = look(11, "normal", "#a6c3dd");
  eq(fonts([{ fontSize: "background", fontStyle: "background" }], bg), { g0: "18bi", g1: "11", g2: "9" },
     "Background: each element its own font size and style, at every level; without a look 9 pt normal");
  const r = Appearance.followNestingChains(bg, NS([{ color: "background", fontSize: "background", fontStyle: "bold" }]));
  eq([r.styles.get("g1").color, r.withoutLook.color.get(1).size, r.withoutLook.font.get(1).size], ["background", 1, 1], "Background: elements without a look are counted per condition");
  const both = Appearance.followNestingChains(bg, NS([{ color: "background", fontSize: "background", fontStyle: "background" }]));
  eq(Appearance.withoutLookCounts(both.withoutLook, { colorEnabled: true, fontEnabled: true }).get(1), 1, "Background: an element without a look counts once, whatever attributes use Background");
  const mixed = [node("g0", null, "grouping", 0, true), node("o1", "g0", "business-object", 1, false, agg)];
  mixed[0].look = look(14, "bold", null);
  eq(fonts([{ fontSize: "background" }, { child: "business-object", fontSize: 0 }], mixed), { g0: "14", o1: "12" },
     "Background: a start element without a font size continues from the parent's look size");
  const same = Appearance.followNestingChains(bg, NS([{ color: "same" }]));
  eq([same.styles.get("g0").color, same.parentlessRoots, same.withoutLook.color.size], ["background", ["g0"], 0],
     "Same as parent on a root container: it keeps its background look, reported as parentless, not as without a look");
}
{
  // Font style Same as parent: the parent's style; a root takes its background look's, else normal; no Background fallback count
  const sp = [node("g0", null, "grouping", 0, true), node("s1", "g0", "application-service", 1, false, agg), node("s2", "g0", "application-service", 1, false, agg)];
  sp[0].look = { fillColor: null, fontName: "Serif", fontSize: 16, fontStyle: "bold" };
  const r = Appearance.followNestingChains(sp, NS([{ parent: "grouping", child: "grouping", fontSize: 16, fontStyle: "background" },
    { child: "application-service", fontSize: 11, fontStyle: "same" }]));
  eq([r.styles.get("g0").fontStyle, r.styles.get("s1").fontStyle, r.styles.get("s1").fontSize, r.withoutLook.font.has(2)], ["bold", "bold", 11, false],
     "Font style Same as parent: the parent's style, and no Background fallback for the elements");
  const root = Appearance.followNestingChains(sp.slice(0, 1), NS([{ fontStyle: "same", fontSize: 16 }]));
  eq(root.styles.get("g0").fontStyle, "bold", "Font style Same as parent on a root container: its background look's style");
  eq(norm("nestingStyle", [{ fontStyle: "same" }])[0].fontStyle, "same", "nesting style: font style same is valid");
}
console.log(failed ? `\n${failed} FAILED` : "all rel_filter tests passed");
process.exit(failed ? 1 : 0);
