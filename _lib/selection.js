/**
 * return concepts for:
 *  - generate view => array of concepts
 *  - import export => collection of concepts or views
 * - createProjectmodel => collection of concept and views
 *
 * return visual concepts for
 * - appearance scripts
 *
 */

/**
 * apply a function to the given collection
 *
 * @param {*} collection collection of Archi objects
 * @param {*} pFunc function to apply to Archi (visual) objects
 * @param {*} pArgs optional array with arguments for the function
 */
 function applyToSelection(collection, pFunc, pArgs) {
	console.log(`Apply ${pFunc.name} to selection`);

	collection.each((object) => pFunc(object, pArgs));

	console.log(`${pFunc.name} applied to ${collection.size()} objects`);
}


/**
 * return an array with the in the selection contained objects
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {array} - selected objects
 */
function getSelectionArray(startSelection, selector) {
  let collection = getSelection(startSelection, selector);

  // convert Archi collection to an array
  let selectedList = [];
  collection.each((o) => selectedList.push(o));

  return selectedList;
}

/**
 * return a collection of the in the selection contained objects
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {object} - collection with selected objects
 */
function getSelection(startSelection, selector) {
  console.log(`Selection filter is "${selector}"`);
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an empty collection
  var selectedColl = $();
  $(startSelection).each((obj) => addObject(obj, selector, selectedColl));

  return selectedColl;
}

/**
 * return a collection of the in the selection contained visual objects
 *   selection must contain objects on a view
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {object} - collection with selected objects
 */
 function getVisualSelection(startSelection, selector) {
  console.log(`Selection filter is "${selector}"`);
  if (model == null || model.id == null)
    throw "Nothing selected. Select views or one or more objects on a view";

  // create an empty collection
  var selectedVisualColl = $();
  $(startSelection).each((obj) => addObject(obj, selector, selectedVisualColl));

  return selectedVisualColl;
}

/**
 * recursive function
 *   add the selected object to a collection.
 *   if the object is a container (model, view or folder), add all contained objects
 */
function addObject(obj, selector, coll) {
  if ($(obj).is(selector)) {
    let o = obj;
    if (selector != "view") o = concept(obj);
    // check for duplicates, than add element to the list
    if (coll.filter((a) => a.id == o.id).size() == 0) {
      coll.add(o);
    }
  }
  $(obj)
    .children()
    .each((child) => addObject(child, selector, coll));
  return coll;
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
