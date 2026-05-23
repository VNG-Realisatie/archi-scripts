/**
 * Given a selection, create a collection of the contained (visual) objects for further processing.
 *
 * The selection can be one or more concepts, views, folders, or canvas visual objects.
 * - getSelection()       returns a collection of MODEL objects (concepts)
 * - getVisualSelection() returns a collection of VISUAL objects (canvas placements)
 *
 * Both functions walk the selection recursively via $(obj).children(), so containers
 * (folders, views, canvas groupings) are expanded transparently.
 *
 * (c) 2021-2026 Mark Backer
 */
console.log("Loading selection.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common = require(REPO_ROOT + "_lib/Common");

const DIAGRAM_OBJECT_TYPES = [
  "diagram-model-group",
  "diagram-model-connection",
  "diagram-model-note",
  "diagram-model-image",
  "diagram-model-legend",
  "diagram-model-reference",
  "archimate-diagram-model", // jArchi returns this type for a diagram-model-reference VO
];

/**
 * apply a function to the given collection
 *
 * @param {object} collection collection of Archi objects
 * @param {Function} pFunc function to apply to Archi (visual) objects
 * @param {array} pArgs optional array with arguments for the function
 */
function applyToCollection(collection, pFunc, pArgs) {
  console.log(`Apply ${pFunc.name} to selection`);
  collection.each((object) => pFunc(object, pArgs));
  console.log(`${pFunc.name} applied to ${collection.size()} objects`);
}

/**
 * return an array with the in the selection contained objects
 * wrapper function for getSelection()
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of objects
 * @returns {array} - selected objects
 */
function getSelectionArray(startSelection, selector) {
  const collection = getSelection(startSelection, selector);
  /** @type {any[]} */
  const list = [];
  collection.each((o) => list.push(o));
  return list;
}

/**
 * Return a collection of the model objects in the selection.
 * Containers (folders, views, canvas groupings) are recursively expanded.
 *
 * @param {object} startSelection - selection containing Archi objects (model tree or canvas)
 * @param {string} selector - Archi selector for filtering the type of objects (default "*")
 * @returns {object} - collection of model concepts (ArchiElement/ArchiRelation/Folder/ArchimateView)
 */
function getSelection(startSelection, selector = "*") {
  if (model == null || model.id == null) {
    throw "Nothing selected. Select one or more objects in the model tree or a view";
  }
  _logSelected(startSelection);

  /** @type {any} */
  const coll = _walkAndCollect(startSelection, (/** @type {any} */ o) => {
    // Canvas visual objects: $(visualObj).is(selector) returns false in jArchi.
    // Test against the .concept instead — that is the model object the caller wants.
    // Diagram-model-* VOs have no concept; the VO itself is what callers want.
    const test = o.view && o.concept ? o.concept : o;
    if (!test) return null;
    // "*" matches anything (incl. diagram-model-* VOs that fail $(vo).is("*")).
    const matches = selector === "*" || $(test).is(selector);
    if (!matches) return null;
    return $(test).is("concept") ? Common.concept(test) : test;
  });

  console.log(`Collection: ${coll.size()} object${coll.size() === 1 ? "" : "s"} of type "${selector}"`);
  return coll;
}

/**
 * Return a collection of the visual objects in the selection.
 * Containers (folders, views, canvas groupings) are recursively expanded.
 * If exactly one visual object matches, expands to all visual objects of its type on the same view.
 *
 * @param {object} startSelection - selection containing Archi objects (must include canvas VOs)
 * @param {string} selector - Archi selector OR "diagram" pseudo-selector for diagram-model-* types
 * @returns {object} - collection of visual objects
 */
function getVisualSelection(startSelection, selector = "*") {
  if (model == null || model.id == null) {
    throw "Nothing selected. Select views or one or more objects on a view";
  }
  _logSelected(startSelection);
  console.log(`Select "${selector}"`);

  /** @type {any} */
  let coll = _walkAndCollect(startSelection, (/** @type {any} */ o) => {
    if (!o.view) return null;
    const matches = selector === "*"
      // @ts-ignore — selector has a default of "*", TS narrowing can flag it as possibly null
      || (selector === "diagram" ? DIAGRAM_OBJECT_TYPES.includes(o.type) : $(o).is(selector));
    return matches ? o : null;
  });

  // Preserve existing behaviour: if exactly one VO selected, expand to all of its type on the view.
  if (coll.size() === 1) {
    const obj = coll.first();
    console.log(`One concept selected, apply to all concepts of type ${obj.type}`);
    // @ts-ignore — obj is a jArchi VisualObject with .view and .type
    coll = $(obj.view).find(obj.type);
  }
  return coll;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Walk startSelection + all descendants via $(obj).children().
 * For each visited obj, call decide(obj); add the returned value (if any) to the result.
 * Dedup by .id via internal Set.
 *
 * @param {object}   startSelection - Archi collection to walk
 * @param {Function} decide         - (obj) => object-to-add or null/undefined to skip
 * @returns {object} Archi collection of unique results
 */
function _walkAndCollect(startSelection, decide) {
  /** @type {any} */
  const coll = $();
  const seen = new Set();
  function walk(/** @type {any} */ obj) {
    const target = decide(obj);
    if (target && target.id && !seen.has(target.id)) {
      seen.add(target.id);
      coll.add(target);
    }
    $(obj).children().each(walk);
  }
  startSelection.each(walk);
  return coll;
}

function _logSelected(/** @type {any} */ startSelection) {
  if (startSelection.size() === 1) {
    console.log(`Selected ${startSelection.first()}`);
  } else {
    console.log(`Selected ${startSelection.size()} objects, first is ${startSelection.first()}`);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getSelection,
    getSelectionArray,
    getVisualSelection,
    applyToCollection,
    DIAGRAM_OBJECT_TYPES,
  };
}
