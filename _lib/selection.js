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

console.log(`selection.js !!!`);

/**
 * ==============================================================================================
 * from generate view
 *
 * creates an array with selected concepts
 */

/**
 * create a list with the selected elements.
 * filter the list according the settings in the param object.
 *
 * @param {object} param - settings for generating a view
 */
function selectElements(param) {
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an array with the selected elements
  var selectedElements = [];
  $(selection).each((obj) => addElementInList(obj, selectedElements));

  console.log(`\nSelection:`);
  console.log(`- ${selectedElements.length} elements selected`);

  // filter the selected elements with the concept filter
  let filteredElements = selectedElements.filter((obj) => filterObjectType(obj, param.elementFilter));
  console.log(`- ${filteredElements.length} elements after filtering`);
  if (filteredElements.length === 0) throw "No Archimate element match your criterias.";

  return filteredElements;
}

/**
 * recursive function
 *   add the selected elements in a list.
 *   if element is a container (model, view or folder), all contained elements are added
 */
function addElementInList(obj, list) {
  if ($(obj).is("element")) {
    let o = concept(obj);
    // check for duplicates, than add element to the list
    if (list.findIndex((a) => a.id == o.id) == -1) list.push(o);
  }
  $(obj)
    .children()
    .each((child) => addElementInList(child, list));
  return list;
}

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
function selectObjects(startSelection, selector) {
  console.log(`selector: ${selector}`);
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an empty collection
  var selectedColl = $();
  $(startSelection).each((obj) => addObjectInCollection(obj, selector, selectedColl));

  return selectedColl;
}

/**
 * recursive function
 *   add the selected object to a collection.
 *   if the object is a container (model, view or folder), add all contained objects
 */
function addObjectInCollection(obj, selector, coll) {
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
    .each((child) => addObjectInCollection(child, selector, coll));
  return coll;
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
