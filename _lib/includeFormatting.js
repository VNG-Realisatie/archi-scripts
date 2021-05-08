/**
 * includeFormatting.js
 *
 * In Archi make a selection:
 * - select one or more concepts, views or folders in the model tree or 
 * - select objects on a view or the view itself
 * 
 * The functions in this script will create a collection of (visual) objects based on the selection
 * and apply a function to these objects
 * 
 * (c) 2019 Mark Backer
 */

/**
 * Create a collection of visual objects and 
 * apply a formatting function to these objects
 * 
 * @param {*} selection collection of Archi objects
 * @param {*} pFunc formatting function
 * @param {*} pArgs optional array with arguments for the formatting function
 */
function formatObjects(selection, pFunc, pArgs) {
	if (selection) {
		let views;
		let viewObjects = $();
	
		if (selection.is("archimate-model")) {
			console.log(`Selected ${model}. Formatting all views of the model`);
			views = $("folder").find("view");
		} else if (selection.is("folder")) {
			console.log(`Selected one or more folders. Formatting the views in the folders`);
			views = selection.find("view");
		} else if (selection.is("view")) {
			console.log(`Selected one or more views. Formatting selected views`);
			views = selection;
		}

		if (views) {
			viewObjects = views.find();
		} else {
			if (selection.first().view) {
				console.log(`Selected one or more concepts on a views. Formatting selected concepts`);
				viewObjects = selection;
			} 
			else console.log("You have selected concepts in the model tree. Select concepts on a view...");
		}
		viewObjects.each((object) => pFunc(object, pArgs));
		
		if (views) console.log(`Processed ${views.size()} views`);
		console.log(`${pFunc.name} applied to ${viewObjects.size()} view objects`);
	} else {
		console.log("Nothing selected. Make a selection in the model tree, a view or concepts on a view...");
	}
}

/**
 * The selection must contain one concept, selected in the model tree or on a view
 * 
 * if selected in the model tree, create a collection of visual objects with all references of the object
 * if selected on a view, create a collection of visual objects of the same type on the selected view
 * Apply formatting function to these objects
 * 
 * @param {*} selection collection of Archi objects. must contain only one concept
 * @param {*} pFunc formatting function
 * @param {*} pArgs optional array with arguments for the formatting function
 */
 function formatObjectsOfType(selection, pFunc, pArgs) {

	if (selection.is("concept") && selection.size() == 1) {
		let viewObjects = $();
		let ele = selection.first();
		if (ele.id == ele.concept.id) {
			// console.log(`Selected concept of type ${ele.type} in the model tree`);
			console.log(`=> Apply ${pFunc.name} to all views with references of ${ele.type}`);
			viewObjects = $(ele.type).viewRefs().find(ele.type);
		} else {
			// console.log(`Selected concept of type ${ele.type} on a view`);
			console.log(`Apply ${pFunc.name} to all ${ele.type} on view ${ele.view.name}`);
			viewObjects = $(ele.view).find(ele.type);
		}

		viewObjects.each((object) => pFunc(object, pArgs));

		console.log(`${pFunc.name} applied to ${viewObjects.size()} view objects`);
	} else {
		console.log("Select one concept in the tree or on a view");
		console.log("- if selected in the tree, the function ${formatFunction} will be applied to all view");
		console.log("- if selected on a view, the function ${formatFunction} will be applied to the selected view");
	}
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
