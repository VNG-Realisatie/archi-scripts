/**
 * The origin of a generated view: how it was made, in a hidden view property, so the view can be
 * made again (Regenerate). The start only holds in one model, so it travels with the view.
 *
 *   { preset, action, selection: [{ id, name }], folder?, element?, direction?, modified?, script? }
 *
 *   preset     preset name, not a copy: a better preset reaches the view
 *   action     ACTION.*.id of the run
 *   selection  the start. An object is found by its id; name is a label for the reader and the
 *              messages, refreshed at every regenerate, never used to find it
 *   folder     One view each: the Folder of the run; absent when the views mirror the model tree
 *   element    One view each: the element of this view
 *   direction  only when the run overruled the preset
 *   modified   made with unsaved settings, or changed by Expand view since: Regenerate differs
 *   script     made by a script that works on after the run: Regenerate names it and refuses
 */
console.log("Loading view_origin.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");
/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");

/**
 * @param {ArchiObject} object
 * @returns {OriginObject}
 */
function describeObject(object) {
  return { id: String(object.id), name: `${ArchiFolders.printFolderPath(object)}${object.name}` };
}

/**
 * The start of a run, as the origin keeps it. A folder stays a folder, so new elements in it join.
 * A view, or a folder of views, is kept as the elements on it now: a view replaced in place would
 * otherwise be its own start and grow with every regenerate.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {OriginObject[]}
 */
function describeStart(uiSelection) {
  /** @type {Map<string, OriginObject>} */
  const start = new Map();
  const add = (/** @type {ArchiObject} */ o) => { start.set(String(o.id), describeObject(o)); };
  uiSelection.each(o => {
    if (SelectionRead.isViewOrViewFolder(o)) SelectionRead.getSeedElements($(o)).forEach(add);
    else if (o.type === "folder") add(o);
    else {
      const concept = /** @type {VisualObject} */ (o).concept || o;   // Cast: a canvas object holds its concept
      if (!String(concept.type).startsWith("diagram-model-")) add(concept);
    }
  });
  return [...start.values()];
}

/**
 * @param {ArchimateView} view
 * @returns {ViewOrigin | null}
 */
function read(view) {
  const value = view.prop(Defs.PROP_ORIGIN);
  return value ? JSON.parse(String(value)) : null;
}

/**
 * @param {ArchimateView} view
 * @param {ViewOrigin}    origin
 */
function write(view, origin) {
  view.prop(Defs.PROP_ORIGIN, JSON.stringify(origin));
}

/**
 * A view written without an origin keeps no origin of an earlier run.
 * @param {ArchimateView} view
 */
function remove(view) {
  view.removeProp(Defs.PROP_ORIGIN);
}

/**
 * Expand view adds to a generated view: Regenerate no longer gives the same view.
 * @param {ArchimateView} view
 */
function markModified(view) {
  const origin = read(view);
  if (origin && !origin.script) write(view, { ...origin, modified: true });
}

/**
 * @param {OriginObject} object
 * @returns {ArchiObject | null}  "#id" searches the whole model; an id is unique, so this is the object itself
 */
function findObject(object) {
  return $(`#${object.id}`).first() || null;
}

/**
 * The start of an origin in the model.
 * @param {OriginObject[]} objects
 * @returns {{ start: ArchiCollection<ArchiObject>, missing: OriginObject[] }}
 */
function resolve(objects) {
  const start = $();
  /** @type {OriginObject[]} */
  const missing = [];
  for (const object of objects) {
    const found = findObject(object);
    if (found) start.add(found);
    else missing.push(object);
  }
  return { start, missing };
}

/**
 * What the views of one run of One view each share. Their elements differ.
 * @param {ViewOrigin} origin
 * @returns {string}
 */
function siblingKey(origin) {
  return JSON.stringify([origin.preset, origin.action, (origin.selection || []).map(o => o.id)]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { describeObject, describeStart, read, write, remove, markModified, findObject, resolve, siblingKey };
}
