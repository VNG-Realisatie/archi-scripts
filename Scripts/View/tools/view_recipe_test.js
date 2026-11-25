/**
 * Node tests for the view recipes (lib/view_recipe.js): recognising recipes and their view templates,
 * and each check on a fixture that is in order but for the one thing the case breaks. Run from the repo root:
 *   node Scripts/View/tools/view_recipe_test.js
 * With a model, the check on that model and the presets in Scripts/View/presets, as in Archi:
 *   node Scripts/View/tools/view_recipe_test.js <model.archimate>
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log; console.log = () => {};   // the modules' "Loading …" lines
const Defs = require("../lib/defs");
const ViewRecipe = require("../lib/view_recipe");
console.log = _log;

// ── The check on a model file ─────────────────────────────────────────────────

/** Every preset in Scripts/View/presets, with its recipe link (view_recipe_read.readPresetLinks). */
function readPresetLinks() {
  const dir = path.join(__dirname, "..", "presets");
  const names = [];
  const walk = (d, prefix) => {
    for (const f of fs.readdirSync(d, { withFileTypes: true })) {
      if (f.isDirectory()) walk(path.join(d, f.name), prefix + f.name + "/");
      else if (f.name.endsWith(".json") && !f.name.startsWith("_")) names.push(prefix + f.name.replace(/\.json$/, ""));
    }
  };
  walk(dir, "");
  return names.sort(Defs.compareNames).map(name => {
    const preset = Defs.validatePreset(JSON.parse(fs.readFileSync(path.join(dir, name + ".json"), "utf8")));
    return { preset: name, recipe: preset.recipe, viewTemplateOn: !!(preset.params.viewTemplate.on && preset.params.viewTemplate.id), filter: preset.filter.conditions };
  });
}

if (process.argv[2]) {
  const H = require("./view_harness");
  const facts = H.readRecipeFacts(H.loadModel(process.argv[2])), presets = readPresetLinks();
  const Log = require("../../_lib/log");
  ViewRecipe.logFindings(facts, presets, ViewRecipe.check(facts, presets));
  void Log;
  process.exit(0);
}

// ── Fixture ───────────────────────────────────────────────────────────────────

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const F = "/Other/View recipes/";
/** A recipe grouping; props: kind, objectId, viewObjectId, viewPreset, aggregates (ids), type. */
const grouping = (id, o = {}) => {
  const props = { [Defs.PROP_VIEW_RECIPE]: o.kind || "view" };
  const g = {
    id, name: id, label: F + id, kind: o.kind || "view", objectId: o.objectId === undefined ? "oid-" + id : o.objectId,
    viewObjectId: o.viewObjectId || "", viewPreset: o.viewPreset === undefined ? "P" : o.viewPreset,
    aggregates: (o.aggregates || []).map(a => ({ id: a, label: F + a })),
    element: { id, name: id, type: o.type || "grouping", prop: k => props[k] },
  };
  return g;
};
const ref = name => ({ id: "v-" + name, label: "/Views/Beheer/View templates/" + name });

/**
 * A model in order: group G (view template T) with view recipes A and B, view recipe C (view template U),
 * presets P linked to G and Q linked to C.
 */
function fixture() {
  const facts = {
    groupings: [grouping("G", { kind: "group", aggregates: ["A", "B"] }), grouping("A"), grouping("B"), grouping("C", { viewPreset: "Q" })],
    recipesViews: 1,
    visuals: [{ recipeId: "G", templates: [ref("T")] }, { recipeId: "A", templates: [] }, { recipeId: "B", templates: [] }, { recipeId: "C", templates: [ref("U")] }],
    objectIds: new Map(["G", "A", "B", "C"].map(id => ["oid-" + id, [F + id]])),
  };
  const presets = [
    { preset: "P", recipe: { id: "G", name: "G" }, viewTemplateOn: true, filter: [] },
    { preset: "Q", recipe: { id: "C", name: "C" }, viewTemplateOn: true, filter: [] },
    { preset: "Ad hoc", recipe: null, viewTemplateOn: false, filter: [] },
  ];
  return { facts, presets };
}
const g = (facts, id) => facts.groupings.find(x => x.id === id);
/** The findings as [section, subject, text]. */
const findings = (facts, presets) => ViewRecipe.check(facts, presets).map(f => [f.section, f.subject.replace(F, ""), f.text]);
const sections = (facts, presets) => findings(facts, presets).map(f => f[0] + ": " + f[1]);

// ── Recognise ─────────────────────────────────────────────────────────────────

{
  const { facts, presets } = fixture();
  const r = ViewRecipe.recognise(facts);
  eq([...r.keys()], ["G", "A", "B", "C"], "recognise: every grouping with a known kind");
  eq(r.get("G").members.map(m => m.id), ["A", "B"], "recognise: a group's view recipes");
  eq(r.get("A").groups.map(m => m.id), ["G"], "recognise: a view recipe's group");
  eq(r.get("A").viewTemplate, ref("T"), "recognise: a view recipe in a group has its group's view template");
  eq(r.get("C").viewTemplate, ref("U"), "recognise: its own view template");
  eq(ViewRecipe.linkedThrough(r.get("A"), r).grouping.id, "G", "linkedThrough: a view recipe in a group is made through the group");
  eq(findings(facts, presets), [], "a model in order: no findings");
}
{
  const { facts } = fixture();
  facts.visuals.find(v => v.recipeId === "A").templates = [ref("Own")];
  eq(ViewRecipe.recognise(facts).get("A").viewTemplate, ref("Own"), "recognise: its own view template goes before its group's");
}

// ── Start ─────────────────────────────────────────────────────────────────────

{
  const { facts } = fixture();
  const r = ViewRecipe.recognise(facts);
  const start = id => {
    const s = ViewRecipe.startOf(r, id);
    return s && { recipe: s.recipe.grouping.id, linked: s.linked.grouping.id, action: s.action, views: s.views.map(v => v.grouping.id), made: s.made.map(m => m.id) };
  };
  eq(start("C"), { recipe: "C", linked: "C", action: Defs.ACTION.NEW_VIEW.id, views: ["C"], made: ["C"] }, "startOf: a view recipe on its own makes one view, New view");
  eq(start("G"), { recipe: "G", linked: "G", action: Defs.ACTION.ONE_EACH.id, views: ["A", "B"], made: ["G", "A", "B"] }, "startOf: a group makes a view per view recipe, One view each");
  eq(start("A"), { recipe: "A", linked: "G", action: Defs.ACTION.ONE_EACH.id, views: ["A"], made: ["G", "A", "B"] }, "startOf: a view recipe in a group makes its own view the group's way");
  eq(start("Loose"), null, "startOf: no recipe");
}

// ── Recipes ───────────────────────────────────────────────────────────────────

{
  const { facts, presets } = fixture();
  facts.groupings.push(grouping("X", { kind: "View" }));
  eq(sections(facts, presets), ["Recipes: X"], "an unknown View recipe value");
  eq(ViewRecipe.recognise(facts).has("X"), false, "an unknown View recipe value is no recipe");
}
{
  const { facts, presets } = fixture();
  g(facts, "C").objectId = "";
  eq(sections(facts, presets), ["Recipes: C"], "a recipe without Object ID");
}
{
  const { facts, presets } = fixture();
  facts.groupings.push(grouping("H", { kind: "group", aggregates: ["A"], viewPreset: "R" }));
  facts.visuals.push({ recipeId: "H", templates: [ref("T")] });
  facts.objectIds.set("oid-H", [F + "H"]);
  presets.push({ preset: "R", recipe: { id: "H", name: "H" }, viewTemplateOn: true, filter: [] });
  eq(sections(facts, presets), ["Recipes: A"], "a view recipe in two groups");
}
{
  const { facts, presets } = fixture();
  g(facts, "G").aggregates = [];
  eq(sections(facts, presets), ["Recipes: G", "Links: A", "Links: B"], "a group without view recipes; its former view recipes are orphaned");
}
{
  const { facts, presets } = fixture();
  g(facts, "G").aggregates.push({ id: "Loose", label: F + "Loose" }, { id: "C", label: F + "C" });
  eq(sections(facts, presets), ["Recipes: G", "Links: C", "Links: Q"], "a group aggregates what is no view recipe; C, a view recipe, joins the group and keeps its own preset");
  facts.groupings.push(grouping("G2", { kind: "group", aggregates: ["G"] }));
  eq(findings(facts, presets).filter(f => f[1] === "G2" && f[0] === "Recipes").length, 2, "a group aggregating a group: no view recipes, and G is none");
}
{
  const { facts, presets } = fixture();
  presets[0].filter = [{ on: true, mode: "exclude", applyTo: "element", source: "grouping", property: Defs.PROP_VIEW_RECIPE, value: "view" }];
  eq(sections(facts, presets), ["Recipes: A", "Recipes: B"], "the preset's element filter drops the group's view recipes");
}

// ── View template ─────────────────────────────────────────────────────────────

{
  const { facts, presets } = fixture();
  facts.recipesViews = 0;
  facts.visuals = [];
  eq(sections(facts, presets), ["View template: View recipes"], "no view View recipes: one finding, none per recipe");
}
{
  const { facts, presets } = fixture();
  facts.recipesViews = 2;
  facts.visuals = [];
  eq(findings(facts, presets).filter(f => f[1] === "View recipes").map(f => f[2]), [`2 views are named "View recipes".`], "two views View recipes");
}
{
  const { facts, presets } = fixture();
  facts.visuals = facts.visuals.filter(v => v.recipeId !== "C");
  eq(sections(facts, presets), ["View template: C", "View template: C"], "a recipe not on View recipes: not on it, and no view template its preset needs");
  presets[1].viewTemplateOn = false;
  eq(sections(facts, presets), ["View template: C"], "a recipe not on View recipes, preset without view template");
}
{
  const { facts, presets } = fixture();
  facts.visuals.push({ recipeId: "C", templates: [] });
  eq(sections(facts, presets), ["View template: C"], "a recipe on View recipes twice");
}
{
  const { facts, presets } = fixture();
  facts.visuals.find(v => v.recipeId === "G").templates.push(ref("T2"));
  eq(sections(facts, presets), ["View template: G"], "several view references: one finding, not also 'none' for the view recipes");
}
{
  const { facts, presets } = fixture();
  facts.visuals.find(v => v.recipeId === "C").templates = [];
  eq(sections(facts, presets), ["View template: C"], "the preset uses a view template, the recipe has none");
}

// ── Links ─────────────────────────────────────────────────────────────────────

{
  const { facts, presets } = fixture();
  presets.push({ preset: "Gone", recipe: { id: "Z", name: "Z" }, viewTemplateOn: false, filter: [] });
  eq(sections(facts, presets), ["Links: Gone"], "a preset whose recipe is not in the model");
}
{
  const { facts, presets } = fixture();
  presets.push({ preset: "Q2", recipe: { id: "C", name: "C" }, viewTemplateOn: true, filter: [] });
  eq(findings(facts, presets).map(f => f[2]), [
    `Recipe "${F}C" has View preset "Q", but preset "Q2" is linked to it.`,
    `Recipe "${F}C" is linked from 2 presets: "Q", "Q2".`,
  ], "two presets linked to one recipe");
}
{
  const { facts, presets } = fixture();
  presets.splice(0, 1);
  eq(sections(facts, presets), ["Links: A", "Links: B", "Links: G"], "an orphaned group: it and its view recipes");
}
{
  const { facts, presets } = fixture();
  presets.splice(0, 2);
  eq(findings(facts, presets), [["Links", "", "No preset is linked to a recipe."]], "no preset linked at all: one finding, not one per recipe");
}
{
  const { facts, presets } = fixture();
  presets[1].recipe.name = "Old name";
  eq(findings(facts, presets), [["Links", "Q", `Preset "Q" names its recipe "Old name"; the recipe is now "${F}C".`]], "a stale label");
}
{
  const { facts, presets } = fixture();
  g(facts, "B").viewPreset = "";
  eq(sections(facts, presets), ["Links: B"], "View preset differs from the linked preset (a view recipe through its group)");
}

// ── Duplicates ────────────────────────────────────────────────────────────────

{
  const { facts, presets } = fixture();
  facts.objectIds.set("oid-C", [F + "C", "/Other/Domeinen/Publieksdiensten"]);
  eq(findings(facts, presets), [["Duplicates", "C", `Recipe "${F}C" has the Object ID of "/Other/Domeinen/Publieksdiensten".`]], "a recipe with a copied Object ID");
}
{
  const { facts, presets } = fixture();
  g(facts, "A").viewObjectId = "vid";
  g(facts, "C").viewObjectId = "vid";
  eq(sections(facts, presets), ["Duplicates: A", "Duplicates: C"], "one View Object ID on two recipes");
}
{
  const { facts, presets } = fixture();
  g(facts, "C").viewObjectId = "oid-A";
  eq(findings(facts, presets).map(f => f[2]), [`The View Object ID of recipe "${F}C" is also the Object ID of "${F}A".`], "a View Object ID that an element carries");
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log("view_recipe_test: all passed");
