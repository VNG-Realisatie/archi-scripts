/**
 * The generation record of a generated view: how it was made, in a hidden view property, so the view can be
 * made again (Regenerate). The start only holds in one model, so it travels with the view.
 *
 *   { preset, action, selection: [{ id, name }], folder?, mirrored?, element?, recipe?, direction?, modified?, script? }
 *
 *   preset     preset name, not a copy: a better preset reaches the view
 *   action     ACTION.*.id of the run
 *   selection  the start. An object is found by its id; name is a label for the reader and the
 *              messages, refreshed at every regenerate, never used to find it
 *   folder     One view each: the path under Views the views went to ("/" = Views itself); Mirrored: the root
 *              of the mirrored folders
 *   mirrored   One view each: the views mirror the model tree below folder
 *   element    One view each: the element of this view
 *   recipe     the view recipe the view was made from: { id, name }, as selection
 *   direction  only when the run overruled the preset
 *   modified   made with unsaved settings, or changed by Expand view since: Regenerate differs
 *   script     made by a script that works on after the run: Regenerate names it and refuses
 */

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading generation_record.js");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");
/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
/** @type {typeof import("../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");

/**
 * @param {ArchiObject} object
 * @returns {RecordedObject}
 */
function describeObject(object) {
  return { id: String(object.id), name: `${ArchiFolders.printFolderPath(object)}${object.name}` };
}

/**
 * The start of a run, as the generation record keeps it. A folder stays a folder, so new elements in it join.
 * A view, or a folder of views, is kept as the elements on it now: a view replaced in place would
 * otherwise be its own start and grow with every regenerate. An object on a canvas is kept with the
 * objects nested in it, as the run reads it (Selection.getSelection walks them); diagram objects are left out.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {RecordedObject[]}
 */
function describeStart(uiSelection) {
  /** @type {Map<string, RecordedObject>} */
  const start = new Map();
  const add = (/** @type {ArchiObject} */ o) => { start.set(String(o.id), describeObject(o)); };
  uiSelection.each(o => {
    if (SelectionRead.isViewOrViewFolder(o)) SelectionRead.getSeedElements($(o)).forEach(add);
    else if (o.type === "folder") add(o);
    else Selection.getSelection($(o)).each(c => { if (!Selection.DIAGRAM_OBJECT_TYPES.includes(c.type)) add(c); });
  });
  return [...start.values()];
}

/**
 * @param {ArchimateView} view
 * @returns {GenerationRecord | null}
 */
function read(view) {
  const value = view.prop(Defs.PROP_GENERATION_RECORD);
  return value ? _current(JSON.parse(String(value))) : null;
}

/**
 * A generation record written before view.folder was the root of Mirrored too: One view each, Mirrored, had no
 * folder and an `underGenerated` flag. It is read as the folder and `mirrored` it stands for, so a view
 * made earlier regenerates; the next write leaves the new shape.
 * @param {Record<string, any>} record
 * @returns {GenerationRecord}
 */
function _current(record) {
  const { underGenerated, ...rest } = record;
  if (rest.folder !== undefined || rest.action !== Defs.ACTION.ONE_EACH.id) return /** @type {GenerationRecord} */ (rest);
  return /** @type {GenerationRecord} */ ({ ...rest, folder: underGenerated === true ? Defs.GENERATED_VIEW_FOLDER : "/", mirrored: true });
}

/**
 * @param {ArchimateView} view
 * @param {GenerationRecord} record
 */
function write(view, record) {
  view.prop(Defs.PROP_GENERATION_RECORD, JSON.stringify(record));
}

/**
 * A view written without a generation record keeps no generation record of an earlier run.
 * @param {ArchimateView} view
 */
function remove(view) {
  view.removeProp(Defs.PROP_GENERATION_RECORD);
}

/**
 * Expand view adds to a generated view: Regenerate no longer gives the same view.
 * @param {ArchimateView} view
 */
function markModified(view) {
  const record = read(view);
  if (record && !record.script) write(view, { ...record, modified: true });
}

/**
 * @param {RecordedObject} object
 * @returns {ArchiObject | null}  "#id" searches the whole model; an id is unique, so this is the object itself
 */
function findObject(object) {
  return $(`#${object.id}`).first() || null;
}

/**
 * The start of a generation record in the model.
 * @param {RecordedObject[]} objects
 * @returns {{ start: ArchiCollection<ArchiObject>, missing: RecordedObject[] }}
 */
function resolve(objects) {
  const start = $();
  /** @type {RecordedObject[]} */
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
 * @param {GenerationRecord} record
 * @returns {string}
 */
function siblingKey(record) {
  return JSON.stringify([record.preset, record.action, (record.selection || []).map(o => o.id)]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { describeObject, describeStart, read, write, remove, markModified, findObject, resolve, siblingKey };
}
