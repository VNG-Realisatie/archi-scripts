/**
 * Node tests for Style by nesting level (lib/appearance.js) on the GEMMA runs of the test model (views 6 and 7 GEMMA,
 * presets presets/Test/gemma/): the nesting chains and fonts (followNestingChains, nestingFonts) on the nested result
 * of a New view, and applyAppearance on a stand-in of that view (a small jArchi $ below): what test cases 17, 21, 23
 * and 28 fixed, the background look as base layer with Background per appearance attribute, the pass order, and
 * Highlight repeated; which objects a style condition reaches and with which property values
 * (computeConditionTargets); and the view properties a run writes (generate_view.applyViewProperties). Run from the repo root:
 *   node Scripts/View/tools/appearance_test.js [model.archimate]
 */
const fs   = require("fs");
const path = require("path");

// palettes.js reads presets/_palettes.json through Java; the harness's stand-in has no Files.exists.
global.Java = {
  type: n => n.endsWith("Files") ? { readString: p => fs.readFileSync(String(p), "utf8"), exists: p => fs.existsSync(String(p)) } : { get: p => p },
};
const H    = require("./view_harness");
const Defs = require("../lib/defs");
const Appearance = require("../lib/appearance");
const Expected   = require("./expected");
const RF         = require("../lib/rel_filter");
const Chroma     = require("chroma-js");

const _log = console.log;
let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; _log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const VIEW  = path.join(__dirname, "..");
const model = H.loadModel(process.argv[2] || path.join(VIEW, "test/model/view-test.archimate"));
const relationsOf = H.relationIndex(model);
/** @param {string} name */
const presetOf = name => Defs.validatePreset(JSON.parse(fs.readFileSync(path.join(Expected.GEMMA_PRESET_DIR, name + ".json"), "utf8")));
const SYMBOL_FONT = { name: "Segoe UI Symbol", size: 9, style: "normal" };   // Archi's default view font of test case 28

/**
 * The nested New view a GEMMA preset makes: per occurrence its element, parent occurrence and depth, in write order.
 * @param {string} presetName
 * @param {string} viewName
 */
function newView(presetName, viewName) {
  const preset = presetOf(presetName);
  const quiet = console.log; console.log = () => {};
  const planned = H.planView(model, H.findView(model, "Views/Test/" + viewName), preset, Defs.ACTION.NEW_VIEW.id, true);
  console.log = quiet;
  const nodes = planned.writePlan.nodes.filter(n => "element" in n);
  const byNode = new Map(nodes.map(n => [n.node, n]));
  const depth = n => (n.parent ? 1 + depth(byNode.get(n.parent)) : 0);
  return { preset, nodes: nodes.map(n => ({ id: n.node, element: n.element, parentId: n.parent, depth: depth(n) })) };
}

/**
 * The NestingNodes appearance.js reads from a view (_nestingNode): type, relations to the parent, depth, container.
 * @param {{ id: string, element: any, parentId: string | null, depth: number }[]} nodes
 */
function nestingNodes(nodes) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const parents = new Set(nodes.map(n => n.parentId));
  return nodes.map(n => {
    const parent = n.parentId ? byId.get(n.parentId).element : null;
    const rels = parent ? relationsOf(parent).filter(r => r.source.id === parent.id && r.target.id === n.element.id).map(r => ({ type: r.type, outgoing: true }))
      .concat(relationsOf(parent).filter(r => r.target.id === parent.id && r.source.id === n.element.id).map(r => ({ type: r.type, outgoing: false }))) : [];
    return { id: n.id, parentId: n.parentId, type: n.element.type, rels, depth: n.depth, isContainer: parents.has(n.id) };
  });
}

/** Per element name, the styles of its occurrences, sorted: "size bold color #condition dLevels" or "-" (no condition reaches it). */
function stylesByName(run) {
  const nl = run.preset.appearance.nestingLevel;
  const { styles } = Appearance.followNestingChains(nestingNodes(run.nodes), nl.conditions);
  /** @type {Record<string, string[]>} */
  const out = {};
  for (const n of run.nodes) {
    const st = styles.get(n.id);
    (out[n.element.name] = out[n.element.name] || []).push(st ? `${st.fontSize}${st.fontStyle === "bold" ? " bold" : ""} ${st.color || "Default"} #${st.nr} d${st.depthSinceChange}` : "-");
  }
  for (const k of Object.keys(out)) out[k].sort();
  return out;
}

// ── Test case 23: 16 / 14 / 12 / 10 pt from the root down, bold where a condition starts ─────────────────────────────
{
  const s = stylesByName(newView("Bedrijfsfuncties", "6 GEMMA"));
  eq(s["Bedrijfsfunctiemodel"], ["16 bold Grouping #1 d0"], "23: the root grouping starts condition 1");
  eq(s["Uitvoering"], ["14 Grouping #1 d1"], "23: a grouping under it continues condition 1, one size smaller, one level lighter");
  eq(s["Dienstverlening"], ["14 bold Bedrijf gedrag #2 d0"], "23: a function under a grouping starts condition 2 at its own size");
  eq(s["Behandeling"], ["12 Bedrijf gedrag #2 d1"], "23: a function under a function continues condition 2");
  eq(s["Beoordeling"], ["10 Bedrijf gedrag #2 d2"], "23: and one level deeper again");
  eq(s["Zaakafhandelservice"], ["10 Applicatie gedrag #3 d0", "9 Applicatie gedrag #3 d0"],
     "23: a service starts condition 3 without a size of its own: its parent's less the decrease, never below 9 pt");
  eq(s["Zaakafhandelcomponent"], ["-", "-"], "a component no condition selects stops the chain");
  eq(s["Werk en inkomen"], undefined, "the steps leave the Beleidsdomein grouping out");
  eq(s["Ontvangst"], ["12 Bedrijf gedrag #2 d1", "12 Bedrijf gedrag #2 d1"], "17: both occurrences of a function in two parents take the same style");
}

// ── Test case 21: a root container counts as a child under a parent of its own type ──────────────────────────────────
{
  const s = stylesByName(newView("Applicatieservices", "6 GEMMA"));
  eq(s["Bedrijfsfunctiemodel"], ["16 bold Grouping #1 d0"], "21: the root grouping takes condition 1 (parent grouping, child Same), not condition 2");
  eq(s["Sociaal domein"], ["14 Grouping #1 d1"], "21: a domain grouping continues condition 1");
  eq(s["Klantcontactservice"], ["10 bold Applicatie gedrag #2 d0"], "21: a service under a grouping starts condition 2");
  eq(s["Zaakafhandelcomponent"], ["-", "-"], "21: the components inside stay unstyled");
}

// ── Fonts: only containers and leaves beside a container get one; Modify resets the rest ─────────────────────────────
{
  const run = newView("Bedrijfsobjecten", "7 GEMMA functions");
  const nl = run.preset.appearance.nestingLevel;
  const nodes = nestingNodes(run.nodes);
  const fontOf = (fonts, name) => run.nodes.filter(n => n.element.name === name).map(n => fonts.get(n.id) || null);
  const fonts = Appearance.nestingFonts(nodes, nl, false, SYMBOL_FONT);
  eq(fontOf(fonts, "Dienstverlening"), [{ name: "Segoe UI Symbol", size: 12, style: "bold" }], "28: a nesting font takes the name of Archi's default view font");
  eq(fontOf(fonts, "Behandeling"), [{ name: "Segoe UI Symbol", size: 10, style: "normal" }], "a container one level down: smaller, not bold");
  eq(fontOf(fonts, "Beoordeling"), [null], "a leaf with only leaves beside it keeps its font");
  eq(fontOf(fonts, "Klantdossier"), [null, null], "an element no condition selects keeps its font");
  const reset = Appearance.nestingFonts(nodes, nl, true, SYMBOL_FONT);
  eq(fontOf(reset, "Beoordeling"), [SYMBOL_FONT], "Modify resets a visual a condition reaches but gives no font to Archi's default view font");
}

// ── Equally specific conditions with different styles: the last wins and the conflict is reported ────────────────────
{
  const conditions = [{ child: "business-function", color: "A" }, { child: "business-function", color: "B" }]
    .map(c => ({ ...RF.defaultCondition("nestingStyle"), ...c }));
  const nodes = [
    { id: "p", parentId: null, type: "business-function", rels: [], depth: 0, isContainer: true },
    { id: "c", parentId: "p", type: "business-function", rels: [{ type: "aggregation-relationship", outgoing: true }], depth: 1, isContainer: false },
  ];
  const { styles, conflicts } = Appearance.followNestingChains(nodes, conditions);
  eq([styles.get("c").color, conflicts], ["B", ["1, 2"]], "equally specific conditions: the last wins, the conflict is reported");
}

// ── applyAppearance on a stand-in view: test cases 17 and 28 ─────────────────────────────────────────────────────────
const DEFAULT_FILL = "#f5deaa";   // what Archi reads back after fillColor = null: the type's default fill (any constant here)

/** A jArchi collection over items: each, filter("element"), first, length. */
function collection(items) {
  return {
    each: f => items.forEach(f), first: () => items[0] || null, length: items.length, size: () => items.length,
    filter: sel => collection(sel === "element" ? items.filter(o => o.concept) : items),
  };
}

/** A view of element visuals nested as the run's nodes, and the $ that reads it (what appearance.js calls). */
function standInView(run) {
  const visuals = new Map();
  for (const n of run.nodes) {
    const vo = { id: n.id, concept: n.element, children: [], parent: null, fontName: "", fontSize: 9, fontStyle: "normal", _fill: null,
                 get fillColor() { return this._fill === null ? DEFAULT_FILL : this._fill; }, set fillColor(v) { this._fill = v; } };
    if (n.parentId) { vo.parent = visuals.get(n.parentId); vo.parent.children.push(vo); }
    visuals.set(n.id, vo);
  }
  const view = { isView: true, all: [...visuals.values()] };
  global.$ = o => o === view ? { find: sel => collection(sel === "element" ? view.all : []) }
    : o.isLook ? { attr: () => o.image || null }
    : visuals.has(o.id) && o.concept ? { parent: () => collection(o.parent ? [o.parent] : []), children: () => collection(o.children), attr: (k, v) => { if (v !== undefined) o.image = v; return o.image || null; } }
    : { outRels: () => collection(relationsOf(o).filter(r => r.source.id === o.id)), inRels: () => collection(relationsOf(o).filter(r => r.target.id === o.id)),
        rels: () => collection(relationsOf(o)) };
  return { view, visuals: [...visuals.values()] };
}

{
  const run = newView("Bedrijfsfuncties background", "6 GEMMA");
  const { view, visuals } = standInView(run);
  const preset = { ...run.preset, params: Defs.effectiveParams(run.preset) };
  eq([preset.appearance.highlightRepeated.enabled, !!preset.appearance.highlightRepeated.colorRange], [false, true], "17: the preset has Highlight repeated off, with a range");
  const quiet = console.log; console.log = () => {};
  Appearance.applyAppearance(view, preset, Defs.ACTION.LAYOUT_ONLY.id, SYMBOL_FONT);
  console.log = quiet;
  const fills = name => visuals.filter(v => v.concept.name === name).map(v => v._fill);
  const ontvangst = fills("Ontvangst");
  eq([ontvangst.length, ontvangst[0] !== null, ontvangst[0] === ontvangst[1], ontvangst[0] === fills("Behandeling")[0]], [2, true, true, true],
     "17: Layout only keeps the nesting color of a repeated element (Highlight repeated off resets only what nothing styled)");
  eq(fills("Zaakafhandelservice").every(f => f !== null), true, "17: and of the repeated services inside it");
  const root = visuals.find(v => v.concept.name === "Bedrijfsfunctiemodel");
  eq([root.fontName, root.fontSize, root.fontStyle, root._fill], ["Segoe UI Symbol", 16, "bold", "#ffffff"],
     "28: the root takes Archi's default view font name at its condition's size; white shaded by darkenStart stays white");
  eq(fills("Zaakafhandelcomponent"), [null, null], "a Modify action resets the fill of what no condition reaches");
}

// ── Highlight repeated: every occurrence of a repeated element one color of the range, over the nesting color ─────────
{
  const run = newView("Bedrijfsfuncties background", "6 GEMMA");
  const fillsOf = highlight => {
    const { view, visuals } = standInView(run);
    const preset = { ...run.preset, params: Defs.effectiveParams(run.preset),
                     appearance: { ...run.preset.appearance, highlightRepeated: { enabled: highlight, colorRange: "Lagen" } } };
    const quiet = console.log; console.log = () => {};
    Appearance.applyAppearance(view, preset, Defs.ACTION.NEW_VIEW.id, SYMBOL_FONT);
    console.log = quiet;
    /** @type {Record<string, (string | null)[]>} */
    const out = {};
    for (const v of visuals) (out[v.concept.name] = out[v.concept.name] || []).push(v._fill);
    return out;
  };
  const off = fillsOf(false), on = fillsOf(true);
  const repeated = Object.keys(on).filter(n => on[n].length > 1).sort();
  eq(repeated, ["Gegevensmagazijn", "Gegevensservice", "Klantcontactcomponent", "Klantcontactservice", "Ontvangst", "Zaakafhandelcomponent", "Zaakafhandelservice"],
     "the GEMMA run repeats the function in two parents and what lies inside it, and the shared services and components");
  eq(repeated.every(n => new Set(on[n]).size === 1 && on[n][0] !== null), true, "Highlight repeated: all occurrences of a repeated element take one color");
  eq(new Set(repeated.map(n => on[n][0])).size, repeated.length, "Highlight repeated: each repeated element its own color");
  eq(on["Ontvangst"][0] !== off["Ontvangst"][0], true, "Highlight repeated: its color replaces the nesting color");
  eq(Object.keys(on).filter(n => on[n].length === 1).every(n => on[n][0] === off[n][0]), true, "Highlight repeated: an element on the view once keeps its nesting color");
}

// ── Background look: the base layer; a condition overrides per appearance attribute, Background keeps it ───────────
{
  const run = newView("Bedrijfsfuncties background", "6 GEMMA");
  const look = { isLook: true, fillColor: "#123456", fontName: "Serif", fontSize: 30, fontStyle: "italic", fontColor: "#ff0000", figureType: 1, image: "img-1" };
  /** applyAppearance with the root grouping on the background view; the first condition changed by `first`. */
  const rootWith = (first, actionId = Defs.ACTION.NEW_VIEW.id) => {
    const { view, visuals } = standInView(run);
    const nl = run.preset.appearance.nestingLevel;
    const conditions = nl.conditions.map((c, i) => (i === 0 ? { ...c, ...first } : c));
    const preset = { ...run.preset, params: Defs.effectiveParams(run.preset), appearance: { ...run.preset.appearance, nestingLevel: { ...nl, conditions } } };
    const root = visuals.find(v => v.concept.name === "Bedrijfsfunctiemodel");
    const quiet = console.log; console.log = () => {};
    Appearance.applyAppearance(view, preset, actionId, SYMBOL_FONT, new Map(),
      { elements: new Set([root.concept.id]), looks: new Map([[root.concept.id, [{ visual: look, parentId: null }]]]) });
    console.log = quiet;
    return { root, visuals };
  };
  const bg = rootWith({ color: "background", fontSize: "background", fontStyle: "background" }).root;
  eq([bg._fill, bg.fontName, bg.fontSize, bg.fontStyle, bg.fontColor, bg.figureType, bg.image], ["#123456", "Serif", 30, "italic", "#ff0000", 1, "img-1"],
     "background look: Background for every attribute keeps the whole look: fill color, font name, size and style, font color, figure, image");
  const own = rootWith({ color: "#00ff00", fontSize: 16, fontStyle: "bold", darkenStart: 0 }).root;
  eq([own._fill, own.fontName, own.fontSize, own.fontStyle, own.fontColor, own.figureType], ["#00ff00", "Serif", 16, "bold", "#ff0000", 1],
     "background look: a condition's own values override fill color, font size and font style; font name, color and figure stay the look's");
  const mixed = rootWith({ color: "background", fontSize: 12, fontStyle: "background" }).root;
  eq([mixed._fill, mixed.fontSize, mixed.fontStyle], ["#123456", 12, "italic"], "background look: overridden per appearance attribute");
  const { root: under, visuals } = rootWith({ color: "background" });
  const child = visuals.find(v => v.parent === under && v.concept.type === "grouping");
  const fn = visuals.find(v => v.concept.type === "business-function");
  eq([child._fill, fn && fn._fill !== null], [null, true],
     "background look: an element not on the background view gets Type default for Background, and its condition's fill color otherwise");
  const modify = rootWith({ color: "background", fontSize: "background", fontStyle: "background" }, Defs.ACTION.LAYOUT_ONLY.id).root;
  eq([modify._fill, modify.fontSize, modify.fontStyle], ["#123456", 30, "italic"], "background look: a Modify action does not reset it");
}
{
  const looks = new Map([["e", [{ visual: "under A", parentId: "A" }, { visual: "under B", parentId: "B" }]]]);
  eq([Appearance.backgroundLook(looks, "e", "B"), Appearance.backgroundLook(looks, "e", "C"), Appearance.backgroundLook(looks, "x", "A")], ["under B", "under A", undefined],
     "background look: an occurrence takes the look of the element's visual in the same container on the background view, else the first");
}
{
  const planWith = on => {
    const preset = presetOf("Bedrijfsfuncties background");
    preset.params.backgroundView = { ...preset.params.backgroundView, on };
    const quiet = console.log; console.log = () => {};
    const planned = H.planView(model, H.findView(model, "Views/Test/6 GEMMA"), preset, Defs.ACTION.NEW_VIEW.id, true);
    console.log = quiet;
    return planned.objectSet;
  };
  const on = planWith(true), off = planWith(false);
  eq([on.backgroundLooks.size, [...on.backgroundLooks].every(([id, list]) => list.every(l => l.visual.concept.id === id))], [20, true],
     "background view on: one visual of the background view per element of it");
  eq([off.backgroundLooks, off.tables], [undefined, undefined], "background view off: no background looks, no table");
}
{
  // Background in a preset without a background view, or with it off: one warning per run
  const preset = presetOf("Bedrijfsfuncties background");
  preset.appearance.nestingLevel.conditions[0].color = "background";
  const masked = { ...preset, params: Defs.effectiveParams(preset) };
  eq(Appearance.backgroundWithoutView(masked), null, "Background with the background view on: no run warning");
  masked.params = { ...masked.params, backgroundView: { ...masked.params.backgroundView, on: false } };
  eq(String(Appearance.backgroundWithoutView(masked)).startsWith("Background view off: condition 1 "), true, "Background with the background view off: a run warning naming the condition");
  masked.params = { ...masked.params, backgroundView: { id: "", path: "", on: true } };
  eq(String(Appearance.backgroundWithoutView(masked)).startsWith("No background view: condition 1 "), true, "Background without a background view: a run warning");
}
{
  // Pass order: Highlight repeated comes after Style by property, so it wins on a repeated element
  const run = newView("Bedrijfsfuncties background", "6 GEMMA");
  const { view, visuals } = standInView(run);
  const style = { ...RF.defaultCondition("style"), applyTo: "element", source: "business-function", propertyOf: "element", property: "GEMMA type", colorRange: "Lagen" };
  const preset = { ...run.preset, params: Defs.effectiveParams(run.preset), appearance: { ...run.preset.appearance,
    styleByProperty: { ...run.preset.appearance.styleByProperty, conditions: [style] }, highlightRepeated: { enabled: true, colorRange: "Pastel1" } } };
  const functions = [...new Set(visuals.filter(v => v.concept.type === "business-function").map(v => v.concept))];
  const props = functions.map(f => f.prop);
  functions.forEach(f => { f.prop = () => "x"; });
  const quiet = console.log; console.log = () => {};
  try { Appearance.applyAppearance(view, preset, Defs.ACTION.NEW_VIEW.id, SYMBOL_FONT); }
  finally { console.log = quiet; functions.forEach((f, i) => { f.prop = props[i]; }); }
  const ontvangst = visuals.filter(v => v.concept.name === "Ontvangst").map(v => v._fill);
  const single = visuals.find(v => v.concept.name === "Behandeling")._fill;
  eq([ontvangst[0] === ontvangst[1], ontvangst[0] !== single], [true, true], "pass order: Highlight repeated colors a repeated element over Style by property");
}

// ── View properties: a ticked row written, an unticked or empty one removed, a hidden key left alone, an id once ──────
{
  const GenView = require("../lib/generate_view");
  const Log = require("../../_lib/log");
  /** A view's properties as jArchi gives them: prop(key) reads (null when absent), prop(key, value) writes. */
  const viewWith = props => {
    const map = new Map(Object.entries(props));
    return { map, prop: (k, v) => { if (v === undefined) return map.has(k) ? map.get(k) : null; map.set(k, v); return undefined; }, removeProp: k => { map.delete(k); } };
  };
  const preset = presetOf("Bedrijfsfuncties background");
  preset.viewProperties.properties.push({ key: "GEMMA URL", value: "https://example.org", enabled: true });   // hidden (presets/_hidden_properties.json)
  const view = viewWith({ Model: "oud", Beleidsdomein: "Werk", "GEMMA URL": "kept", Scope: "x" });
  const warnings = [], warn = Log.warn;
  Log.warn = m => { warnings.push(String(m)); };
  const quiet = console.log; console.log = () => {};
  try { GenView.applyViewProperties(view, preset); } finally { Log.warn = warn; console.log = quiet; }
  const id = view.map.get(Defs.PROP_ID);
  eq(Object.fromEntries([...view.map].filter(([k]) => k !== Defs.PROP_ID).sort()),
     { Architectuurlaag: "Applicatiearchitectuur", "GEMMA URL": "kept", Publiceren: "GEMMA Online en redactie" },
     "ticked rows with a value are written; a ticked row without one, and an unticked row, remove the key; a hidden key stays");
  eq([typeof id === "string" && id.length > 0, warnings.length, warnings[0] && warnings[0].includes("GEMMA URL")], [true, 1, true],
     "Add object id writes an id; the hidden key is reported once");
  console.log = () => {};
  try { GenView.applyViewProperties(view, preset); } finally { console.log = quiet; }
  eq(view.map.get(Defs.PROP_ID), id, "a second run keeps the view's id");
}

// ── Style by property: which objects a condition reaches, with which values (computeConditionTargets) ────────────────
{
  const elements = [...model.elements.values()], relations = [...model.relations.values()];
  const rel = r => relationsOf(r);
  global.$ = o => ({ rels: () => collection(rel(o)), outRels: () => collection(rel(o).filter(r => r.source.id === o.id)), inRels: () => collection(rel(o).filter(r => r.target.id === o.id)) });
  /** The condition as validation normalises it. */
  const condition = c => Defs.validatePreset({ algorithm: "Tiles", appearance: { styleByProperty: { conditions: [c] } } }).appearance.styleByProperty.conditions[0];
  const targets = c => Appearance.computeConditionTargets(condition(c), elements, relations);
  const byName = hits => Object.fromEntries([...hits].map(([id, h]) => [(model.elements.get(id) || model.relations.get(id)).name || id, [h.kind, [...h.values].sort()]]));

  // applyTo element: the element itself by its own property; source narrows it to a type.
  const groupings = targets({ applyTo: "element", source: "grouping", propertyOf: "element", property: "GEMMA type", colorRange: "Set2" });
  eq([groupings.size, groupings.get(elements.find(e => e.name === "Sturing").id).values], [elements.filter(e => e.type === "grouping").length, new Set(["Bedrijfsfunctie laag"])],
     "applyTo element: every grouping is reached, with its own value");
  const noValue = targets({ applyTo: "element", source: "grouping", propertyOf: "element", property: "GEMMA type", colorRange: "Set2" }).get(elements.find(e => e.name === "Bedrijfsfunctiemodel").id);
  eq([...noValue.values], ["Groep"], "applyTo element: the root grouping's value");
  const unset = targets({ applyTo: "element", source: "business-function", propertyOf: "element", property: "GEMMA type", colorRange: "Set2" });
  eq([unset.size > 0, [...unset.values()].every(h => h.values.size === 0)], [true, true], "applyTo element: an element without the property is reached, with no value");

  // applyTo relation: the relation, narrowed by its type; the value from the relation, or from one of its ends.
  const access = targets({ applyTo: "relation", relation: "access-relationship", propertyOf: "relation", property: "Confidence", colorRange: "Greens" });
  eq([access.size, [...access.values()].every(h => h.kind === "relation" && h.values.size === 0)],
     [relations.filter(r => r.type === "access-relationship").length, true], "applyTo relation: every relation of the type, with no value when it has none");
  const fromSource = targets({ applyTo: "relation", relation: "aggregation-relationship", source: "grouping", propertyOf: "source", property: "GEMMA type", colorRange: "Set2" });
  eq([...new Set([...fromSource.values()].flatMap(h => [...h.values]))].sort(), ["Bedrijfsfunctie laag", "Groep"],
     "applyTo relation: the value of the relation's source, for aggregations from a grouping");
  const fromTarget = targets({ applyTo: "relation", relation: "aggregation-relationship", source: "grouping", target: "grouping", propertyOf: "target", property: "GEMMA type", colorRange: "Set2" });
  const rootToSturing = relations.find(r => r.source.name === "Bedrijfsfunctiemodel" && r.target.name === "Sturing");
  eq([...fromTarget.get(rootToSturing.id).values], ["Bedrijfsfunctie laag"], "applyTo relation: propertyOf target takes the value of the relation's target, not its source");
  eq(fromSource.size, relations.filter(r => r.type === "aggregation-relationship" && r.source.type === "grouping").length, "applyTo relation: the source type narrows the relations");

  // applyTo target: the target element of every matching relation, valued by the relation, its source or the element.
  const tgt = byName(targets({ applyTo: "target", relation: "aggregation-relationship", source: "grouping", propertyOf: "source", property: "GEMMA type", colorRange: "Set2" }));
  eq([tgt["Strategie"], tgt["Bedrijfsfunctiemodel"], tgt["Sturing"]], [["element", ["Bedrijfsfunctie laag"]], undefined, ["element", ["Groep"]]],
     "applyTo target: the targets of aggregations from a grouping, with the value of their source; the root is no target");
  const objects = byName(targets({ applyTo: "target", relation: "access-relationship", propertyOf: "relation", property: "Confidence", colorRange: "Greens" }));
  eq(["Archiefstuk", "Basisregistratie", "Klantdossier", "Zaak"].every(n => n in objects), true, "applyTo target: the objects the GEMMA functions access are reached (the model's other access relations too)");
  eq(["Ontvangst", "Sturing", "Zaakafhandelservice"].some(n => n in objects), false, "applyTo target: an element that is only a source, or has no access relation, is not");

  // applyTo source: the source element of every matching relation.
  const src = byName(targets({ applyTo: "source", relation: "access-relationship", propertyOf: "element", property: "GEMMA type", colorRange: "Set2" }));
  eq(["Archivering", "Behandeling", "Gegevensmagazijn", "Ontvangst", "Toezicht"].every(n => n in src), true, "applyTo source: the functions and the component that access something are reached");
  eq(["Klantdossier", "Zaak", "Sturing"].some(n => n in src), false, "applyTo source: the accessed objects are not");
}

// ── Color Same as parent: the parent's written fill, one level lighter, whatever the types ───────────────────────────
{
  const sameNodes = [
    { id: "r", parentId: null, type: "grouping", rels: [], depth: 0, isContainer: true },
    { id: "c", parentId: "r", type: "application-service", rels: [], depth: 1, isContainer: true },
    { id: "g", parentId: "c", type: "business-actor", rels: [], depth: 2, isContainer: false },
  ];
  const cond = { ...RF.defaultCondition("nestingStyle"), child: "", color: "same", darkenStart: 0, lightenPerLevel: 30 };
  const r = Appearance.followNestingChains(sameNodes, [cond]);
  eq([r.styles.get("c").color, r.styles.get("g").color], ["same", "same"], "Same as parent: a child keeps the marker, whatever its type");
  eq([r.styles.get("r").color, r.parentlessRoots], ["background", ["r"]], "Same as parent: a root has no parent: its background look, else Type default, and it is reported");

  const run = newView("Bedrijfsfuncties background", "6 GEMMA");
  const { view, visuals } = standInView(run);
  const nl = { ...run.preset.appearance.nestingLevel, conditions: [cond] };
  const preset = { ...run.preset, params: Defs.effectiveParams(run.preset), appearance: { ...run.preset.appearance, nestingLevel: nl } };
  /** @type {string[]} */
  const warnings = [];
  const quiet = console.log; console.log = m => warnings.push(String(m));
  Appearance.applyAppearance(view, preset, Defs.ACTION.NEW_VIEW.id, SYMBOL_FONT);
  console.log = quiet;
  const light = hex => Chroma(hex).get("hsl.l");
  const root = visuals.find(v => v.concept.name === "Bedrijfsfunctiemodel");
  const child = visuals.find(v => v.parent === root);
  const grand = visuals.find(v => v.parent && v.parent.parent === root && v._fill !== null);
  eq(root._fill, null, "Same as parent: the root without a background look gets Type default");
  eq(child._fill, Chroma(DEFAULT_FILL).set("hsl.l", 1 - (1 - light(DEFAULT_FILL)) * 0.7).hex(), "Same as parent: the child is the parent's fill one level lighter");
  eq(!!grand && light(grand._fill) > light(grand.parent._fill), true, "Same as parent: each level deeper is lighter again");
  eq(warnings.some(m => /Same\s+as\s+parent/.test(m)) && !warnings.some(m => /not in palette/.test(m)), true, "Same as parent: one warning for the root, and no palette-color warning");
}

if (failed) { _log(`appearance_test: ${failed} failed`); process.exitCode = 1; }
else _log("appearance_test: all passed");
