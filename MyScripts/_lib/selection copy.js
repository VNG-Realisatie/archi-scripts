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
 * ==============================================================================================
 * from createProjectmodel
 *
 * creates an Archi collection with selected concepts
 */

/**
 * return an array of the contained objects in the selection
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {array} - selected objects
 */
function selectObjectsInArray(startSelection, selector) {

  let collection = selectObjects(startSelection, selector);

  // convert Archi collection to an array
  let selectedList = [];
  collection.each((o) => selectedList.push(o));

  return selectedList;
}

/**
 * return a collection of the contained objects in the selection
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {object} - collection with selected objects
 */
function selectObjects(startSelection, selector = null) {
  console.log(`selector: ${(selector)}`);
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an empty collection
  let selectedColl = $();
  $(startSelection).each((obj) => addObjectInCollection(obj, selector, selectedColl));

  console.log(`\nSelection:`);
  console.log(`- ${selectedColl.size()} ${selector ? selector : "object"}s selected`);

  return selectedColl;
}

/**
 * recursive function
 *   add the selected object to a collection.
 *   if the object is a container (model, view or folder), add all contained objects
 */
function addObjectInCollection(obj, selector, coll) {
  if (!selector || $(obj).is(selector)) {
    // if the obj is selected on a view, change the obj to the concept
    let objConcept = obj;
    if (obj.type == "concept") objConcept = concept(obj);

    // check for duplicates, than add element to the list
    if (coll.filter((objColl) => objColl.id == objConcept.id).size() == 0) {
      coll.add(objConcept);
    }
  }
  $(obj)
    .children()
    .each((child) => addObjectInCollection(child, selector, coll));
  return coll;
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
