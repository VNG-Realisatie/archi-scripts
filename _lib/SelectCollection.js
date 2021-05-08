/**
 * SelectCollection.js
 *
 * Based on (user) selection, create a collection of objects for further processing
 * Selection can be one or more concepts, views or folders in the model tree or on a view
 *
 * Behavior
 * 	selection in the model tree
 * 		select model, collection with all object-references on all views
 * 		select folder(s), collection with all objects-references on views in selected (sub)folders
 * 		select view(s), collection with all objects-references on selected view(s)
 *   	select object(s) in model tree, collection with all object-references of selection on all views
 * 	selection in a view
 * 		select one object in view, collection with alle objects of same type in the view
 * 		select multiple objects in view, collection with selected objects
 *
 * (c) 2021 Mark Backer
 */

/**
 * apply a function to the given collection
 *
 * @param {*} collection collection of Archi objects
 * @param {*} pFunc function to apply to Archi (visual) objects
 * @param {*} pArgs optional array with arguments for the function
 */
function applyToCollection(collection, pFunc, pArgs) {
	console.log(`> Apply ${pFunc.name} to collection`);

	collection.each((object) => pFunc(object, pArgs));

	console.log(`> ${pFunc.name} applied to ${collection.size()} objects`);
}

/**
 * Create a collection of concepts (elements and relations)
 *
 * @param {*} selection collection of Archi (visual) objects
 */
function selectConcepts(selection) {
	let concepts = $();
	let viewObjects = $();

	console.log(`Creating collection for selection`);
	if (selection) {
		if (selection.is("archimate-model")) {
			console.log(`Selected ${model}.\n- Adding all concepts of the model`);
			concepts = $("concept");
		} else if (selection.is("folder")) {
			console.log(`Selected one or more folders.\n- Adding the concepts in the folders`);
			concepts = selection.find("concept");
		} else if (selection.is("view")) {
			console.log(`Selected one or more views.\n- Adding concepts from the selected views`);
			viewObjects = selection.find("concept");
		}
		if (concepts.size() == 0 && viewObjects.size() == 0) {
			console.log(`Selected one or more objects.\n- Adding selected concepts`);
			viewObjects = selection.filter("concept");
		}
	} else {
		console.log("Nothing selected. Make a selection in the model tree on a view...");
	}

	if (viewObjects.size() > 0) {
		console.log(`- Changing visual concepts to concepts`);
		viewObjects.each((vo) => concepts.add(vo.concept));
	}
	return concepts;
}

/**
 * Create a collection of visual objects (references of elements, relations and visual objects)
 *
 * @param {*} selection collection of Archi (visual) objects
 */
function selectVisualObjects(selection) {
	let viewObjects = $();
	if (selection) {
		let views;

		if (selection.is("archimate-model")) {
			console.log(`Selected ${model}.\n- Adding all views of the model`);
			views = $("folder").find("view");
		} else if (selection.is("folder")) {
			console.log(`Selected one or more folders.\n- Adding the views in the folders`);
			views = selection.find("view");
		} else if (selection.is("view")) {
			console.log(`Selected one or more views.\n- Adding selected views`);
			views = selection;
		}

		if (views) {
			console.log(`- Adding all visual objects on the views to the collection`);
			viewObjects = views.find();
		} else {
			if (selection.first().view) {
				console.log(`Selected one or more objects on a views.\n- Adding objects to the collection`);
				viewObjects = selection;
			} else {
				console.log("Selection not valid");
				console.log("- select the model, folders or views in the model tree or");
				console.log("- select objects on a view");
			}
		}
	} else {
		console.log("Nothing selected. Make a selection in the model tree on a view...");
	}
	return viewObjects;
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
			console.log(`Selected concept of type ${obj.type} in the model tree`);
			console.log(`- Adding all references to concepts of type ${obj.type}`);
			viewObjects = $(obj.type).viewRefs().find(obj.type);
		} else {
			console.log(`Selected concept of type ${obj.type} on a view`);
			console.log(`- Adding all concepts in the view of type ${obj.type}`);
			viewObjects = $(obj.view).find(obj.type);
		}
	} else {
		console.log("Select one concept in the tree or on a view");
		console.log("- if selected in the tree, the function ${formatFunction} will be applied to all view");
		console.log("- if selected on a view, the function ${formatFunction} will be applied to the selected view");
	}
	return viewObjects;
}

function getFunctionCall(pathname) {
	console.log(`\nScript ${pathname}`);

	let filename = pathname.replace(/^.*[\\\/]/, "").replace(/\.ajs$/, "");
	let fields = filename.split(/_/);
	var name = fields[0];
	var arg1 = fields[1];
	console.log(`\n${name}(${arg1})`);

	return { name, arg1 };
}
