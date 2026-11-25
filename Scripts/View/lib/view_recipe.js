/**
 * View recipes: recognise them in the facts read from the model, and check recipes, view templates,
 * preset links and Object IDs before anything is written. No Archi: the facts come from
 * view_recipe_read.js in Archi, from a fixture or the .archimate reader in Node.
 *
 *   view recipe        a grouping with View recipe = view: the description of one generated view
 *   view recipe group  a grouping with View recipe = group: it aggregates view recipes, one view each
 *   view template      the view referenced inside the recipe's visual on View recipes, else its group's
 *   recipe link        the preset's recipe: id, and the name as a label
 *
 * Findings name objects by folder path and name, never by id.
 */
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading view_recipe.js");
/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");

/** @type {readonly RecipeKind[]} */
const KINDS = Object.freeze(["view", "group"]);
/** @type {readonly RecipeSection[]} */
const SECTIONS = Object.freeze(["Recipes", "View template", "Links", "Duplicates"]);

// ── Recognise ─────────────────────────────────────────────────────────────────

/**
 * The recipes in the facts, by grouping id; a grouping with an unknown View recipe is none.
 * @param {RecipeFacts} facts
 * @returns {Map<string, Recipe>}
 */
function recognise(facts) {
  /** @type {Map<string, Recipe>} */
  const recipes = new Map();
  for (const g of facts.groupings) {
    if (!_isKind(g.kind)) continue;
    const own = facts.visuals.filter(v => v.recipeId === g.id);
    recipes.set(g.id, { grouping: g, kind: g.kind, members: [], groups: [], templates: own.flatMap(v => v.templates), visuals: own.length, viewTemplate: null });
  }
  for (const r of recipes.values()) {
    if (r.kind !== "group") continue;
    for (const a of r.grouping.aggregates) {
      const member = recipes.get(a.id);
      if (!member || member.kind !== "view") continue;
      r.members.push(member.grouping);
      member.groups.push(r.grouping);
    }
  }
  for (const r of recipes.values()) r.viewTemplate = _viewTemplate(r, recipes);
  return recipes;
}

/**
 * @param {string} kind
 * @returns {kind is RecipeKind}
 */
function _isKind(kind) {
  return /** @type {readonly string[]} */ (KINDS).includes(kind);
}

/**
 * Its own view template, else its group's; null when there is none or more than one.
 * @param {Recipe}              recipe
 * @param {Map<string, Recipe>} recipes
 * @returns {RecipeNamed | null}
 */
function _viewTemplate(recipe, recipes) {
  if (recipe.templates.length) return recipe.templates.length === 1 ? recipe.templates[0] : null;
  if (recipe.groups.length !== 1) return null;
  const group = /** @type {Recipe} */ (recipes.get(recipe.groups[0].id));   // Cast: groups holds recognised groups only
  return group.templates.length === 1 ? group.templates[0] : null;
}

/**
 * The recipe a preset link names, through which a view recipe in a group is made: the group.
 * @param {Recipe} recipe
 * @param {Map<string, Recipe>} recipes
 * @returns {Recipe}
 */
function linkedThrough(recipe, recipes) {
  const group = recipe.groups.length === 1 ? recipes.get(recipe.groups[0].id) : undefined;
  return group || recipe;
}

/**
 * The recipes a linked preset makes: the recipe and, for a group, its view recipes that are in no
 * other group (one in more groups is reported by the check).
 * @param {Recipe}              recipe
 * @param {Map<string, Recipe>} recipes
 * @returns {Recipe[]}
 */
function made(recipe, recipes) {
  const members = recipe.members.map(m => /** @type {Recipe} */ (recipes.get(m.id)));   // Cast: members are recognised recipes
  return [recipe, ...members.filter(m => m.groups.length === 1)];
}

/**
 * A recipe as the start of a run: a view recipe on its own makes one view (New view); a group makes
 * one view per view recipe, and a view recipe in one group makes its own view the group's way (One
 * view each), linked through the group.
 * @param {Map<string, Recipe>} recipes
 * @param {string}              id  the selected grouping
 * @returns {RecipeStart | null}  null when it is no recipe
 */
function startOf(recipes, id) {
  const recipe = recipes.get(id);
  if (!recipe) return null;
  const linked = linkedThrough(recipe, recipes);
  const all = made(linked, recipes);
  const views = recipe.kind === "group" ? all.slice(1) : [recipe];
  const action = linked.kind === "group" ? Defs.ACTION.ONE_EACH.id : Defs.ACTION.NEW_VIEW.id;
  return { recipe, linked, action, views, made: all.map(r => r.grouping) };
}

// ── Check ─────────────────────────────────────────────────────────────────────

/**
 * Every inconsistency, by section, then by subject in name order.
 * @param {RecipeFacts}  facts
 * @param {PresetLink[]} presets
 * @returns {RecipeFinding[]}
 */
function check(facts, presets) {
  const recipes = recognise(facts);
  const findings = [
    ..._checkRecipes(facts, recipes),
    ..._checkViewTemplates(facts, recipes),
    ..._checkLinks(facts, recipes, presets),
    ..._checkDuplicates(facts, recipes),
  ];
  return findings.map((f, i) => ({ f, i })).sort((a, b) =>
    SECTIONS.indexOf(a.f.section) - SECTIONS.indexOf(b.f.section) || Defs.compareNames(a.f.subject, b.f.subject) || a.i - b.i).map(x => x.f);
}

/**
 * @param {RecipeSection} section
 * @param {string}        subject  folder path and name of what the finding is about; it is sorted by it
 * @param {string}        text     what is wrong
 * @param {string}        effect   what it means for generate
 * @param {string}        action   what the user does
 * @returns {RecipeFinding}
 */
const _finding = (section, subject, text, effect, action) => ({ section, subject, text, effect, action });

const P = Defs.PROP_VIEW_RECIPE, V = Defs.RECIPES_VIEW;

/**
 * Kinds, Object IDs and group membership.
 * @param {RecipeFacts}         facts
 * @param {Map<string, Recipe>} recipes
 * @returns {RecipeFinding[]}
 */
function _checkRecipes(facts, recipes) {
  /** @type {RecipeFinding[]} */
  const out = [];
  for (const g of facts.groupings) {
    if (!_isKind(g.kind))
      out.push(_finding("Recipes", g.label, `"${g.label}" has ${P} "${g.kind}".`, "It is no recipe.", `Set ${P} to "view" or "group".`));
  }
  for (const r of recipes.values()) {
    const g = r.grouping;
    if (!g.objectId)
      out.push(_finding("Recipes", g.label, `Recipe "${g.label}" has no ${Defs.PROP_ID}.`, "The model repository requires one on every element.", `Give it an ${Defs.PROP_ID} of its own.`));
    if (r.kind === "view" && r.groups.length > 1)
      out.push(_finding("Recipes", g.label, `View recipe "${g.label}" is in ${r.groups.length} groups: ${_labels(r.groups)}.`, "It has no one group to be made with.", "Keep the aggregation from one group and remove the others."));
    if (r.kind !== "group") continue;
    if (!r.members.length)
      out.push(_finding("Recipes", g.label, `Recipe group "${g.label}" aggregates no view recipe.`, "It makes no view.", `Aggregate its view recipes from it, or set ${P} to "view".`));
    for (const a of g.aggregates) {
      const target = recipes.get(a.id);
      if (!target || target.kind !== "view")
        out.push(_finding("Recipes", g.label, `Recipe group "${g.label}" aggregates "${a.label}", which is no view recipe.`, "That element gets no view.", `Set ${P} to "view" on it, or remove the aggregation.`));
    }
  }
  return out;
}

/**
 * The view View recipes, and each recipe's visual and view references on it.
 * @param {RecipeFacts}         facts
 * @param {Map<string, Recipe>} recipes
 * @returns {RecipeFinding[]}
 */
function _checkViewTemplates(facts, recipes) {
  if (facts.recipesViews !== 1)
    return [_finding("View template", V, facts.recipesViews ? `${facts.recipesViews} views are named "${V}".` : `No view is named "${V}".`,
      "No recipe has a view template.", `Keep one view "${V}" with the recipes on it.`)];
  /** @type {RecipeFinding[]} */
  const out = [];
  for (const r of recipes.values()) {
    const g = r.grouping;
    if (!r.visuals)
      out.push(_finding("View template", g.label, `Recipe "${g.label}" is not on the view "${V}".`, "Its view template is not known.", `Add it to "${V}", with its view template as a view reference inside it.`));
    else if (r.visuals > 1)
      out.push(_finding("View template", g.label, `Recipe "${g.label}" is on "${V}" ${r.visuals} times.`, "Its view references are read from each.", "Keep it there once."));
    if (r.templates.length > 1)
      out.push(_finding("View template", g.label, `Recipe "${g.label}" holds ${r.templates.length} view references: ${_labels(r.templates)}.`, "It has no view template.", "Keep the view reference to its view template and remove the others."));
  }
  return out;
}

/**
 * The presets' recipe links, and what a linked preset asks of its recipe.
 * @param {RecipeFacts}         facts
 * @param {Map<string, Recipe>} recipes
 * @param {PresetLink[]}        presets
 * @returns {RecipeFinding[]}
 */
function _checkLinks(facts, recipes, presets) {
  /** @type {RecipeFinding[]} */
  const out = [];
  /** @type {Map<string, string[]>} recipe id → names of the presets linked to it */
  const linked = new Map();
  for (const p of presets) {
    if (!p.recipe) continue;
    const r = recipes.get(p.recipe.id);
    if (!r) {
      out.push(_finding("Links", p.preset, `Preset "${p.preset}" is linked to recipe "${p.recipe.name}", which is not in this model.`, "Generate skips the preset.",
        "Open the model the preset belongs to, or save the preset with a recipe of this model as the start."));
      continue;
    }
    linked.set(r.grouping.id, [...(linked.get(r.grouping.id) || []), p.preset]);
    if (r.groups.length)
      out.push(_finding("Links", p.preset, `Preset "${p.preset}" is linked to view recipe "${r.grouping.label}", which its group ${_labels(r.groups)} makes.`, "The view recipe has two presets.", "Link the preset to the group, or take the view recipe out of the group."));
    else out.push(..._checkLinkedPreset(facts, p, r, recipes));
  }
  if (!presets.some(p => p.recipe))
    return [_finding("Links", "", `No preset is linked to a recipe.`, "Generate makes no view.", "For each recipe, open the dialog with the recipe as the start, choose its preset and save it.")];
  for (const r of recipes.values()) {
    const g = r.grouping, names = linked.get(g.id) || [];
    if (names.length > 1)
      out.push(_finding("Links", g.label, `Recipe "${g.label}" is linked from ${names.length} presets: ${names.map(n => `"${n}"`).join(", ")}.`, "It has no one preset.", "Keep one; save the others with another recipe as the start, or as new presets."));
    if (!names.length && r.groups.length < 2 && !linked.has(linkedThrough(r, recipes).grouping.id))
      out.push(_finding("Links", g.label, `No preset is linked to recipe "${g.label}".`, "Generate makes no view for it.", "Open the dialog with the recipe as the start, choose its preset and save it."));
  }
  return out;
}

/**
 * One linked preset against its recipe and, for a group, its view recipes. A view recipe in more than
 * one group is left out: that is reported once, under Recipes.
 * @param {RecipeFacts}         facts
 * @param {PresetLink}          p
 * @param {Recipe}              r
 * @param {Map<string, Recipe>} recipes
 * @returns {RecipeFinding[]}
 */
function _checkLinkedPreset(facts, p, r, recipes) {
  /** @type {RecipeFinding[]} */
  const out = [];
  const g = r.grouping;
  const byPreset = made(r, recipes);
  if (p.recipe && p.recipe.name !== g.name)
    out.push(_finding("Links", p.preset, `Preset "${p.preset}" names its recipe "${p.recipe.name}"; the recipe is now "${g.label}".`, "Only the label is old; the link holds.", "Save the preset once to update the name."));
  for (const m of byPreset) {
    if (m.grouping.viewPreset !== p.preset)
      out.push(_finding("Links", m.grouping.label, `Recipe "${m.grouping.label}" has ${Defs.PROP_VIEW_PRESET} "${m.grouping.viewPreset}", but preset "${p.preset}" is linked to it.`, "The model shows the wrong preset; generate is not affected.", "Generate, or save the preset; both write the property."));
    if (p.viewTemplateOn && facts.recipesViews === 1 && _referencesNone(m, recipes))
      out.push(_finding("View template", m.grouping.label, `Preset "${p.preset}" uses a view template, but recipe "${m.grouping.label}" has none on "${V}".`, "Generate skips the recipe.", "Put a view reference to its view template inside the recipe's visual, or inside its group's."));
  }
  for (const m of byPreset.slice(1).map(x => x.grouping)) {
    if (!ConditionLists.matchElement(p.filter, m.element))
      out.push(_finding("Recipes", m.label, `The element filter of preset "${p.preset}" drops view recipe "${m.label}".`, "Its group makes no view for it.", "Change the preset's element filter, or take the view recipe out of the group."));
  }
  return out;
}

/**
 * Neither the recipe nor its group holds a view reference. Several are reported apart, as is a view
 * recipe in more than one group.
 * @param {Recipe}              r
 * @param {Map<string, Recipe>} recipes
 */
function _referencesNone(r, recipes) {
  if (r.templates.length || r.groups.length > 1) return false;
  const group = r.groups.length ? recipes.get(r.groups[0].id) : undefined;
  return !group || !group.templates.length;
}

/**
 * Object IDs of recipes and of their views that are not unique.
 * @param {RecipeFacts}         facts
 * @param {Map<string, Recipe>} recipes
 * @returns {RecipeFinding[]}
 */
function _checkDuplicates(facts, recipes) {
  /** @type {RecipeFinding[]} */
  const out = [];
  /** @type {Map<string, string[]>} View Object ID → labels of the recipes that carry it */
  const viewIds = new Map();
  for (const r of recipes.values()) {
    const g = r.grouping;
    const others = (facts.objectIds.get(g.objectId) || []).filter(l => l !== g.label);
    if (g.objectId && others.length)
      out.push(_finding("Duplicates", g.label, `Recipe "${g.label}" has the ${Defs.PROP_ID} of ${others.map(l => `"${l}"`).join(", ")}.`, "Two elements share one Object ID.", `Give the recipe a new ${Defs.PROP_ID} of its own.`));
    if (g.viewObjectId) viewIds.set(g.viewObjectId, [...(viewIds.get(g.viewObjectId) || []), g.label]);
  }
  for (const [id, labels] of viewIds) {
    const concepts = facts.objectIds.get(id) || [];
    if (labels.length < 2 && !concepts.length) continue;
    for (const label of labels) {
      const others = [...labels.filter(l => l !== label).map(l => `the ${Defs.PROP_VIEW_OBJECT_ID} of recipe "${l}"`), ...concepts.map(l => `the ${Defs.PROP_ID} of "${l}"`)];
      out.push(_finding("Duplicates", label, `The ${Defs.PROP_VIEW_OBJECT_ID} of recipe "${label}" is also ${others.join(", ")}.`, "Its view would share an Object ID with another object.", `Give the recipe a new ${Defs.PROP_VIEW_OBJECT_ID}, or remove it so generate writes one.`));
    }
  }
  return out;
}

// ── Report ────────────────────────────────────────────────────────────────────

/**
 * The check on the console: what was read, then each finding under its section, then the result.
 * @param {RecipeFacts}     facts
 * @param {PresetLink[]}    presets
 * @param {RecipeFinding[]} findings
 */
function logFindings(facts, presets, findings) {
  const recipes = [...recognise(facts).values()];
  const count = (/** @type {RecipeKind} */ kind) => recipes.filter(r => r.kind === kind).length;
  Log.info(`${count("view")} view recipes, ${count("group")} recipe groups; ${presets.filter(p => p.recipe).length} of ${presets.length} presets linked to a recipe.`);
  for (const section of SECTIONS) {
    const own = findings.filter(f => f.section === section);
    if (!own.length) continue;
    Log.info(`${section}: ${own.length}`);
    for (const f of own) Log.warn(f.text, { effect: f.effect, action: f.action });
  }
  Log.info(findings.length ? `${findings.length} inconsistencies.` : "No inconsistencies.");
}

/**
 * @param {{ label: string }[]} named
 * @returns {string}
 */
function _labels(named) {
  return named.map(n => `"${n.label}"`).join(", ");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { KINDS, SECTIONS, recognise, linkedThrough, made, startOf, check, logFindings };
}
