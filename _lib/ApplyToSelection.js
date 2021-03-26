/*
 * ApplyToSelection.js
 * 
 * (c) 2019 Mark Backer
 *
 */

/**
 * applyToType
 * 
 * 	Determine what kind of objects are selected
 * 
 * 	@param pSelection - a jArchi collection with the selected objects
 * 
 */
function applyToType(pSelection) {
	_commonShowDebugMessage.push(false);
	_commonShowInfoMessage.push(true);

	var archiCollectionType = [
		'archimate-model',
		'folder',
		'archimate-diagram-model', //  'view' also selects sketch and canvas
		'concept',
		'diagram-model-note', // 
		'diagram-model-group',
		'diagram-model-connection',
		'diagram-model-image',
		'diagram-model-reference'
	];
	var ApplyToType = null;
	var SelectionType = null;
	var SelectionTypeSet = new Set();
	var SelectedIn = "model tree";

	// Determine what kind of objects are present in the selection
	// Determine if object is selected on a view or in the model tree
	debug(`> Selected is/are:`)
	for (var i = 0; i < archiCollectionType.length; i++) {
		// if there is at least one object of the jArchi object type, add the type to the set
		if (pSelection.is(archiCollectionType[i])) {
			SelectionType = archiCollectionType[i];
			SelectionTypeSet.add(SelectionType);
			debug(`>> ${SelectionType}`);
			if (SelectionType.startsWith("diagram")) {
				SelectedIn = "view"
				ApplyToType = "diagram-model-object"
			}
			if (SelectionType == "concept") {
				var selectedConcept = pSelection.filter("concept").first();
				if (selectedConcept.id != selectedConcept.concept.id) {
					SelectedIn = "view"
				}
			}
		}
	}

	// Keep it simple. Just select one objecttypes.  
	if ((SelectedIn == "model tree") && (SelectionTypeSet.size > 1)) {
		throw (`> Select only one objecttype in the model tree (eg. folders, concepts, ..)`)
	}
	// in a view multiple objecttypes can be selected (eg. concepts and diagram-model occurrences)
	// reduce to 
	if (SelectedIn == "view") {
		if (SelectionTypeSet.has("concept")) {
			// Depending on the order of the pSelection collection, ApplyToType could have been a diagram-model type
			// multiple objecttypes on a view are handled as a concept
			ApplyToType = "concept";
		} else {
			ApplyToType = "diagram-model-object"
		}
	} else { // selected in tree
		ApplyToType = SelectionType;
	}
	debug(`> You've selected ${ApplyToType}(s)`)

	if (ApplyToType == "concept") {
		var NumberSelected;
		if (pSelection.size() == 1) {
			NumberSelected = `One concept is`;
		} else {
			NumberSelected = `Multiple concepts are`;
		}
		ApplyToType = `${NumberSelected} selected in ${SelectedIn}`
	}
	console.log(`> ${ApplyToType}`)

	_commonShowDebugMessage.pop();
	_commonShowInfoMessage.pop();

	return ApplyToType
}

/**
 * applyToDiagramContent
 * 
 * Apply a (formatting) function to the diagram content of the selection. 
 * 
 * Behavior
 * 	selection in the model tree
 * 		select model, apply function to all object-references on all views
 * 		select folder(s), apply function to all objects-references on views in selected (sub)folders
 * 		select view(s), apply function to all objects-references on selected view(s)
 *   	select object(s) in model tree, apply function to all object-references of selection on all views
 * 	selection in a view
 * 		select one object in view, apply function to alle objects of same type in the view
 * 		select multiple objects in view, apply function to selected objects
 * 
 * Parameters:
 * 	@param pSelection - a jArchi collection with the selected objects
 * 	@param pFunc - function with formatting for selected objects (function must have a parameter object)
 *  @param pFuncParam - optional parameters for function
 * 
 * Example:
 * 		applyToDiagramContent($(selection), ChangeFont);
 * 	will apply the function to the diagram content of selection
 *		function ChangeFont(pObject) {pObject.fontName = "Aria
 */
function applyToDiagramContent(pSelection, pFunc, pFuncParam) {

	_commonShowDebugMessage.push(false);
	_commonShowInfoMessage.push(true);
	try {
		debug("Call applyToType")
		var ApplyToType = applyToType(pSelection)
		if (ApplyToType) {

			switch (ApplyToType) {
				case 'archimate-model': {
					applyToAllViews(pSelection, pFunc, pFuncParam)
					break;
				}
				case 'folder': {
					applyToViewsInFolder(pSelection, pFunc, pFuncParam)
					break;
				}
				case 'archimate-diagram-model': {
					applyToViews(pSelection, pFunc, pFuncParam)
					break;
				}
				case "One concept is selected in view": {
					var response = window.confirm(`You have selected one concept in the view.\n\nYou can apply ${pFunc.name} to:\n- all objects-references of same type \t> select [Ok]\n- just the selected object-reference \t> select [Cancel]`);
					if (response) {
						applyToConceptTypeInView(pSelection, pFunc, pFuncParam)
					} else {
						console.log("One object in view selected and applied to this object")
						applyToSelectionInView(pSelection, pFunc, pFuncParam)
					}
					break;
				}
				case "diagram-model-object":
				case "Multiple concepts are selected in view": {
					applyToSelectionInView(pSelection, pFunc, pFuncParam)
					break;
				}
				case "One concept is selected in model tree": {
					var response = window.confirm(`You have selected one concept in the model tree.\n\nYou can apply ${pFunc.name} to:\n- all objects-references of the same type in all views \t> select [Ok]\n- all references of the selected object \t\t\t> select [Cancel]`);
					if (response) {
						var selectedConcept = pSelection.first();
						console.log(`> ${pFunc.name} will be applied to [${selectedConcept.type}] on all views in [${model}]\n`);
						applyToConceptTypeReferences(pSelection, pFunc, pFuncParam)
					} else {
						console.log("One concept selected, applied to references of concept")
						applyToConceptReferences(pSelection, pFunc, pFuncParam)
					}
					break;
				}
				case "Multiple concepts are selected in model tree": {
					applyToConceptReferences(pSelection, pFunc, pFuncParam)
					break;
				}
				default:
					throw (`>> Unknown ApplyToType: ${ApplyToType}`);
			}
		}
	}
	catch (error) {
		console.log(`> ${arguments.callee.name}(): ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}
	_commonShowDebugMessage.pop();
	_commonShowInfoMessage.pop();
}

function applyToAllViews(pSelection, pFunc, pFuncParam) {
	var v = 0;
	$('view').each(function (view) {
		applyToView(view, pFunc, pFuncParam);
		v++;
	})
	console.log(`> ${pFunc.name} applied to ${v} views`)
}

function applyToViewsInFolder(pSelection, pFunc, pFuncParam) {
	var v = 0;
	//pSelection.add(pSelection.find('folder'))
	pSelection.filter('folder').each(function (folder) {
		console.log(`> Folder: ${folder.name}`);
		$(folder).find('view').each(function (view) {
			applyToView(view, pFunc, pFuncParam);
			v++;
		})
	})
	console.log(`> ${pFunc.name} applied to ${v} views`)
}

function applyToViews(pSelection, pFunc, pFuncParam) {
	var v = 0;
	$(pSelection).filter('view').each(function (view) {
		applyToView(view, pFunc, pFuncParam);
		v++;
	})
	console.log(`> ${pFunc.name} applied to ${v} views`)
}

function applyToView(pView, pFunc, pFuncParam) {
	var i = 0;
	// apply function to all concepts and diagram notes etc
	$(pView).find().each(function (occurrence) {
		pFunc(occurrence, pFuncParam);
		i++;
	})
	console.log(`>> ${pView.name} with ${i} visual concepts`);
}

function applyToConceptTypeInView(pSelection, pFunc, pFuncParam) {
	var i = 0;

	selectedConcept = pSelection.filter("concept").first();
	$(selectedConcept.view).find(selectedConcept.concept.type).forEach(function (occurrence) {
		pFunc(occurrence, pFuncParam);
		i++;
	})
	console.log(`> ${pFunc.name} applied to ${i} concepts of type ${selectedConcept.type} in view "${selectedConcept.view.name}"`)
}

function applyToSelectionInView(pSelection, pFunc, pFuncParam) {
	var i = 0;
	var v = 0;
	selectedConcept = pSelection.first();

	// BUG: if selectedConcept is a relation, the method .view gives error
	console.log(`> ${pFunc.name} will be applied to selected objects in view "${selectedConcept.view.name}"`);
	console.log(`>> ${pSelection.filter("element").size()} elements"`);
	console.log(`>> ${pSelection.filter("relation").size()} relations"`);
	console.log(`>> ${pSelection.size() -
		pSelection.filter("element").size() -
		pSelection.filter("relation").size()} diagram-model concepts"`);

	pSelection.forEach(function (occurrence) {
		pFunc(occurrence, pFuncParam);
		i++;
	})
	v++;
	console.log(`> ${pFunc.name} applied to ${i} concepts in view "${selectedConcept.view.name}"`)
}

function applyToConceptReferences(pSelection, pFunc, pFuncParam) {
	var v = 0;
	var i = 0;

	let ViewSet = new Set()
	$(pSelection).objectRefs().each(function (occurrence) {

		pFunc(occurrence, pFuncParam);
		ViewSet.add(occurrence.view.name);
		console.log(`>>> ${occurrence.name} in view ${occurrence.view.name}`)
		i++;
	})
	v = ViewSet.size;

	console.log(`> Concepts with references on views:`)
	for (let view of ViewSet) {
		console.log(`>> ${view}`);
	}

	console.log(`> Function applied to ${i} references in ${v} views`)
}

function applyToConceptTypeReferences(pSelection, pFunc, pFuncParam) {
	var v = 0;
	let ViewSet = new Set()

	// all concepts of selected concepttype
	applyToConcepts = $(pSelection.first().type)

	// apply to all views with object of selected type
	applyToConcepts.viewRefs().each(function (view) {
		var i = 0;
		if (!ViewSet.has(view.name)) {
			ViewSet.add(view.name);

			// apply function to all occurences of type
			$(view).find(pSelection.first().type).each(function (occurrence) {
				pFunc(occurrence, pFuncParam);
				i++;
			})
			console.log(`>> ${view.name} with ${i} visual concepts`);
			v++;
		}
	})
	console.log(`> ${pFunc.name} applied to ${v} views`)
}


/**
 * applyToModelContent
 * 
 * Apply a function to the selected objects
 * 
 * Behavior
 * 	selection in the model tree
 * 		select model, apply function to all objects 
 * 		select folder(s), apply function to objects in the selected (sub)folders
 *   	select object(s), apply function to selected objects
 * 	selection in a view
 * 		select one object in view, apply function to alle objects of same type in the view
 * 		select multiple objects in view, apply function to selected objects
 * 
 * Parameters:
 * 	@param pSelection - a jArchi collection with the selected objects
 * 	@param pFunc - function with actions for selected objects (function must have a parameter object)
 *  @param pFuncParam - optional parameters for function
 * 
 * Example:
 * 		applyToDiagramContent($(selection), ChangeFont);
 * 	will apply the function to the diagram content of selection
 *		function ChangeFont(pObject) {pObject.fontName = "Arial";}
  */
 function applyToModelContent(pSelection, pFunc, pFuncParam) {

	_commonShowDebugMessage.push();
	_commonShowInfoMessage.push();
	try {
		var ApplyToType = applyToType(pSelection)
		if (ApplyToType) {

			switch (ApplyToType) {
				case 'archimate-model': {
					applyToConceptsInModel(pSelection, pFunc, pFuncParam)
					break;
				}
				case 'folder': {
					applyToConceptsInFolder(pSelection, pFunc, pFuncParam)
					break;
				}
				case 'archimate-diagram-model': {
					throw (`Can't apply ${pFunc.name} to a view. Select the model or one or multiple folders or concepts`)
				}
				case "One concept is selected in model tree":
				case "One concept is selected in view": {
					var response = window.confirm(`You have selected one concept.\n\nYou can apply ${pFunc.name} to:\n- all objects of same type \t> select [Ok]\n- just the selected object \t> select [Cancel]`);
					if (response) {
						applyToConceptType(pSelection, pFunc, pFuncParam)
					} else {
						console.log("One object in view selected and applied to this object")
						applyToSelectedConcepts(pSelection, pFunc, pFuncParam)
					}
					break;
				}
				case "diagram-model-object":
					throw (`Can't apply ${pFunc.name} to a diagram-model-object. Select the model or one or multiple folders or concepts`)
				case "Multiple concepts are selected in view":
				case "Multiple concepts are selected in model tree": {
					applyToSelectedConcepts(pSelection, pFunc, pFuncParam)
					break;
				}
				default:
					throw (`>> Unknown ApplyToType: ${ApplyToType}`);
			}
		}
	}
	catch (error) {
		console.log(`> ${arguments.callee.name}(): ${typeof error.stack == 'undefined' ? error : error.stack}`);
		throw ('> exiting')
	}
	_commonShowDebugMessage.pop();
	_commonShowInfoMessage.pop();
}

function applyToConceptsInModel(pSelection, pFunc, pFuncParam) {
	var i = 0;

	$("concept").forEach(function (c) {
		pFunc(c, pFuncParam);
		i++;
	})
	console.log(`> ${pFunc.name} applied to ${i} concepts in "${model}"`)
}

function applyToConceptsInFolder(pSelection, pFunc, pFuncParam) {
	var i = 0;
	var f = 0;
	pSelection.filter('folder').each(function (folder) {
		console.log(`> Folder: ${folder.name}`);
		$(folder).find('concept').each(function (c) {
			pFunc(c, pFuncParam);
			i++;
		})
		f++
	})
	console.log(`> ${pFunc.name} applied to ${i} concepts in ${f} folders`)
}

// function applyToConceptsOnView(pSelection, pFunc, pFuncParam) {
// }

function applyToConceptType(pSelection, pFunc, pFuncParam) {
	var i = 0;

	selectedConcept = pSelection.filter("concept").first();
	$(selectedConcept.type).forEach(function (c) {
		pFunc(c, pFuncParam);
		i++;
	})
	console.log(`> ${pFunc.name} applied to ${i} concepts of type ${selectedConcept.type}`)
}

function applyToSelectedConcepts(pSelection, pFunc, pFuncParam) {
	var i = 0;
	selectedConcept = pSelection.first();

	// BUG: if selectedConcept is a relation, the method .view gives error
	console.log(`> ${pFunc.name} will be applied to selected concepts`);
	console.log(`>> ${pSelection.filter("element").size()} elements"`);
	console.log(`>> ${pSelection.filter("relation").size()} relations"`);
	console.log(`>> ${pSelection.size() -
		pSelection.filter("element").size() -
		pSelection.filter("relation").size()} diagram-model concepts"`);

	pSelection.forEach(function (c) {
		pFunc(c, pFuncParam);
		i++;
	})
	console.log(`> ${pFunc.name} applied to ${i} concepts`)
}