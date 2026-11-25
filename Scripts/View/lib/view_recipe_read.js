/**
 * Reads what view_recipe.js checks from the open model and the presets: the recipe groupings, their
 * visuals and view references on the view View recipes, every Object ID, and each preset's recipe link.
 * Also the recipe a run starts from, and the View preset that Save writes on it.
 */
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading view_recipe_read.js");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");
/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./view_recipe")} */
const ViewRecipe = require(REPO_ROOT + "View/lib/view_recipe");
/** @type {typeof import("./preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");

/**
 * @param {ArchiObject} object
 * @returns {string} folder path and name
 */
const _label = object => `${ArchiFolders.printFolderPath(object)}${object.name}`;

/**
 * The facts of the open model.
 * @returns {RecipeFacts}
 */
function readFacts() {
  /** @type {RecipeGrouping[]} */
  const groupings = [];
  /** @type {ArchiCollection<ArchiElement>} */ ($("grouping")).each(g => {
    const kind = g.prop(Defs.PROP_VIEW_RECIPE);
    if (kind !== null) groupings.push(_grouping(g, kind));
  });
  const ids = new Set(groupings.map(g => g.id));
  /** @type {ArchiView[]} */
  const views = [];
  $("view").each(v => { if (v.name === Defs.RECIPES_VIEW) views.push(/** @type {ArchiView} */ (v)); });
  /** @type {RecipeFacts["visuals"]} */
  const visuals = [];
  if (views.length === 1) $(views[0]).find("grouping").each(vo => {
    if (vo.concept && ids.has(vo.concept.id))
      visuals.push({ recipeId: vo.concept.id, templates: _references(/** @type {VisualObject} */ (vo)) });   // Cast: a grouping's visual is a box
  });
  return { groupings, recipesViews: views.length, visuals, objectIds: _objectIds() };
}

/**
 * The views referenced directly inside a visual.
 * @param {VisualObject} vo
 * @returns {RecipeNamed[]}
 */
function _references(vo) {
  return /** @type {ArchiCollection<VisualObject>} */ ($(vo).children("diagram-model-reference")).map(r => ({ id: r.refView.id, label: _label(r.refView) }));
}

/**
 * @param {ArchiElement} g
 * @param {string}       kind
 * @returns {RecipeGrouping}
 */
function _grouping(g, kind) {
  const aggregates = $(g).outRels("aggregation-relationship").map(r => r).sort((a, b) => Defs.compareIds(a.id, b.id))
    .map(r => ({ id: r.target.id, label: _label(r.target) }));
  return {
    id: g.id, name: g.name, label: _label(g), kind,
    objectId: g.prop(Defs.PROP_ID) || "", viewObjectId: g.prop(Defs.PROP_VIEW_OBJECT_ID) || "", viewPreset: g.prop(Defs.PROP_VIEW_PRESET) || "",
    aggregates, element: g,
  };
}

/** @returns {Map<string, string[]>} Object ID → the labels of the concepts that carry it */
function _objectIds() {
  /** @type {Map<string, string[]>} */
  const out = new Map();
  $("concept").each(c => {
    const id = c.prop(Defs.PROP_ID);
    if (id) out.set(id, [...(out.get(id) || []), _label(c)]);
  });
  return out;
}

/**
 * Every preset, with its recipe link.
 * @returns {PresetLink[]}
 */
function readPresetLinks() {
  return PresetIO.listPresets().map(name => {
    const preset = Defs.validatePreset(/** @type {PresetFile} */ (PresetIO.readJSON(`${PresetIO.presetDir()}${name}.json`)));   // Cast: listPresets names existing files
    return { preset: name, recipe: preset.recipe, viewTemplateOn: !!(preset.params.viewTemplate.on && preset.params.viewTemplate.id), filter: preset.filter.conditions };
  });
}

// ── A recipe as the start ─────────────────────────────────────────────────────

/**
 * The recipe the selection is, when it is exactly one: a recipe grouping in the model tree or on a view.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {RecipeStart | null}
 */
function readStart(uiSelection) {
  if (uiSelection.size() !== 1) return null;
  const o = uiSelection.first();
  const g = o && (o.view ? o.concept : o);
  if (!g || g.type !== "grouping" || g.prop(Defs.PROP_VIEW_RECIPE) === null) return null;
  return ViewRecipe.startOf(ViewRecipe.recognise(readFacts()), String(g.id));
}

/**
 * The start a recipe run reads: the groupings of its view recipes, in the order of the start.
 * @param {RecipeStart} start
 * @returns {ArchiCollection<ArchiObject>}
 */
function startSelection(start) {
  const order = start.views.map(v => v.grouping.id);
  /** @type {ArchiObject[]} */
  const found = [];
  $("grouping").each(g => { if (order.includes(String(g.id))) found.push(g); });
  found.sort((a, b) => order.indexOf(String(a.id)) - order.indexOf(String(b.id)));
  const out = $();
  for (const g of found) out.add(g);
  return out;
}

/**
 * The recipe a link names, by its id: its name now, or null when the model does not have it.
 * @param {RecipeLink} link
 * @returns {string | null}
 */
function linkedName(link) {
  const g = $(`#${link.id}`).first();
  return g && g.type === "grouping" ? String(g.name) : null;
}

/**
 * Write View preset on every recipe the linked preset makes (information only: nothing reads it).
 * @param {RecipeStart} start
 * @param {string}      preset  its name
 * @returns {number} recipes changed
 */
function writeViewPreset(start, preset) {
  let changed = 0;
  for (const m of start.made) {
    if (m.element.prop(Defs.PROP_VIEW_PRESET) === preset) continue;
    m.element.prop(Defs.PROP_VIEW_PRESET, preset);
    changed++;
  }
  return changed;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { readFacts, readPresetLinks, readStart, startSelection, linkedName, writeViewPreset };
}
