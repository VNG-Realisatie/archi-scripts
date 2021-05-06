/**
 * includeFormatting.js
 *
 * create selection and call formatting function based on filename of calling script
 *
 * Select in the model tree , a view or concepts on a viewand run this script
 * (c) 2019 Mark Backer
 */

function formatObjects(selection, pFunc, pArgs) {
	let views;

	if (selection) {
		if (selection.is("archimate-model")) views = $("folder").find("view");
		if (selection.is("folder")) views = selection.find("view");
		if (selection.is("view")) views = selection;

		let viewObjects = $();

		if (views) {
			viewObjects = views.find();
		} else {
			if (selection.first().view) viewObjects = selection;
			else console.log("You have selected concepts in the model tree. Select concepts on a view...");
		}

		viewObjects.each((object) => pFunc(object, pArgs));
		
		if (views) console.log(`Processed ${views.size()} views`);
		console.log(`${pFunc.name} applied to ${viewObjects.size()} view objects`);
	} else {
		console.log("Nothing selected. Make a selection in the model tree, a view or concepts on a view...");
	}
}

function formatObjectsOfType(selection, pFunc, pArgs) {

	if (selection.is("concept") && selection.size() == 1) {
		let viewObjects = $();
		let ele = selection.first();
		if (ele.id == ele.concept.id) {
			console.log(`Selected in tree`);
			// select in all views all view references of the selected type
			viewObjects = $(ele.type).viewRefs().find();
		} else {
			console.log(`Selected on view ${ele.view}`);
			// select on the selected view all references of the type
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