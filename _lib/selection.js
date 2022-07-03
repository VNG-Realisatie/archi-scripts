/**
 * Given a selection, create a collection of (visual) objects for further processing
 *
 * The selection can be one or more concepts, views or folders.
 * - getSelection() returns a collection of objects
 * - getVisualSelection() return a collection of visual objects
 *
 * (c) 2021 Mark Backer
 *
 */

// polyfill for array method includes(), which is not supported in Nashorn ES6
if (!Array.prototype.includes) {
  Array.prototype.includes = function (search) {
    return !!~this.indexOf(search);
  };
}

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
 * @param {string} selector - Archi selector for filtering the type of objects
 * @returns {object} - collection with selected objects
 */
function getSelection(startSelection, selector = "*") {
  console.log(`Selection filter is "${selector}"`);
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an empty collection
  var selectedColl = $();
  $(startSelection).each((obj) => addObject(obj, selector, selectedColl));

  return selectedColl;

  /**
   * recursive function
   *   add the selected object to a collection.
   *   if the object is a container (model, view or folder), add all contained objects
   */
  function addObject(obj, selector, coll) {
    if ($(obj).is(selector)) {
      let o = obj;
      // ### if ($(obj).is("concept")) { o = concept(obj); ##
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
}

/**
 * return a collection of the in the selection contained visual objects
 *   selection must contain objects on a view
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {object} - collection with selected objects
 */
function getVisualSelection(startSelection, selector = "*") {
  console.log(`Selection filter is "${selector}"`);
  if (model == null || model.id == null) throw "Nothing selected. Select views or one or more objects on a view";

  // create an empty collection
  var selectedVisualColl = $();
  $(startSelection).each((obj) => addVisualObject(obj, selector, selectedVisualColl));

  return selectedVisualColl;

  /**
   * recursive function
   *   add the selected visual object to a collection.
   *   if the object is a container (group with embedded objects or a view), add all contained objects
   *   visual objects exist on a view
   *
   * @param {Archi object} obj - selected object or container
   * @param {string} selector - type of objects to add to collection (see Archi doc)
   * @param {Archi collection} coll - collection of selected objects
   * @returns
   */
  function addVisualObject(obj, selector, coll) {
    const DIAGRAM_OBJECTS = [
      "diagram-model-group",
      "diagram-model-connection",
      "diagram-model-note",
      "diagram-model-image",
      "diagram-model-reference",
      "archimate-diagram-model", // jArchi return this for a reference
    ];

    // visual objects must have a view
    if (obj.view) {
      let addFlag = false;
      switch (selector) {
        case "*":
          addFlag = true;
          break;
        case "diagram":
          if (DIAGRAM_OBJECTS.includes(obj.type)) addFlag = true;
          break;
        default:
          if ($(obj).is(selector)) addFlag = true;
          break;
      }
      if (addFlag) {
        // check for duplicates, than add element to the list
        if (coll.filter((a) => a.id == obj.id).size() == 0) {
          coll.add(obj);
        } else {
          console.log(`DUPLICATE VISUAL OBJECT (not possible ..): ${obj}`);
        }
      }
    }
    $(obj)
      .children()
      .each((child) => addVisualObject(child, selector, coll));
    return coll;
  }
}

/**
 * Create a collection of visual objects of one type
 * The selection must contain one concept, selected in the model tree or on a view
 * - if selected in the model tree, create a collection of visual objects with all references of the object
 * - if selected on a view, create a collection of visual objects of the same type on the selected view
 *
 * @param {*} selection collection of Archi objects. must contain only one concept
 */
 function selectVisualObjectsOfType(selection) {
	let viewObjects = $();

	if (selection.is("concept") && selection.size() == 1) {
		let obj = selection.first();
		if (obj.id == obj.concept.id) {
			console.log(`Creating collection of all view references to concepts of type ${obj.type}`);
			viewObjects = $(obj.type).viewRefs().find(obj.type);
		} else {
			console.log(`Creating collection of all concepts in the view of type ${obj.type}`);
			viewObjects = $(obj.view).find(obj.type);
		}
	} else {
		console.error("Select one concept in the tree or on a view");
		console.error("- if selected in the tree, the selected type will be selected on all views");
		console.error("- if selected on a view, the selected type will be selected on the view");
	}
	return viewObjects;
}


/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
