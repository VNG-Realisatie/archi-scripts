/*
 * JArchi script that allows to create one or several views containing Archimate concepts, and automates their placement.
 *
 * Written by Herve Jouin.
 *
 * Requires:
 *     Archi:			https://www.archimatetool.com
 *     jArchi plugin:	https://www.archimatetool.com/plugins
 *     librairies:
 *			Dagre:		https://github.com/dagrejs/dagre
 *			Graphlib:	https://github.com/dagrejs/graphlib
 *			Lodash:		https://github.com/lodash/lodash
 *			jvm-npm:	https://github.com/nodyn/jvm-npm
 *
 *  #	date		Author			Comments
 *  1	28/01/2019	Hervé Jouin		File creation.
 */

load(__DIR__ + "counter.js");
load(__DIR__ + "jvm-npm.js");

debug("Loading dependencies...");
require.addPath(__DIR__);
require.addPath(__DIR__ + "/lib");
var G__dagre = require('dagre');


// types of actions
var TYPE_ACTION = {
	ONE_SINGLE_VIEW: 1, // Create one single view with all Archimate param.concepts
	ONE_VIEW_PER_CONCEPT: 2 // Create one view per Archimate concept
};

// const REVERSE_RELATIONS = ["realization-relationship", "specialization-relationship", "assignment-relationship", "serving-relationship"]
const REVERSE_RELATIONS = ["realization-relationship", "specialization-relationship", "serving-relationship"]

const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;

// verbose and debug values (may be overriden by the param.verbose and param.debug parameters)
var G_verbose = true;
var G_debug = false;

// This function adds an Archimate element in a list
// if a container is given, then the function recursively adds all the elements in that container
function addElementInList(list, obj) {
	if ($(obj).is("element")) list.push(obj.concept);
	$(obj).children().each(function (child) {
		addElementInList(list, child);
	});
	return list;
}

var G__allViews;

/*
	Param is an object that may contain the following properties:
		concepts (mandatory)			Class of Archimate concepts that must be included in the created view
										May be one of:
											*	all objects in the model
											selected		selected objects from the model
											class,class,...	list of Archimate classes (comma-separated) like business-actor, application-component, technology-collaboration, node, ...
									
		relations (optional)			The relations types that will be included in the view. 
										When graphDepth is greater than 0, this also defines which relation will be followed
										May be one of:
											*	all relation types in the model
											class,class,...	list of Archimate classes (comma-separated) like realization-relationship,assignment-relationship, ...
									
		reverseRelation (optional)	The relations types which will be rendered target to source
										May be one of:
											*	all relation types in the model
											class,class,...	list of Archimate classes (comma-separated) like realization-relationship,assignment-relationship, ...
									
		action (optional)				The type of action that the script should do.
										May be one of:
											actionType.ONE_SINGLE_VIEW		--> create one single view that includes all the Archimate concepts,
											actionType.ONE_VIEW_PER_CONCEPT	--> create one view per Archimate concept
										Defaults to actionType.ONE_SINGLE_VIEW
	
		viewName (optional)				Name of the view to create
										Used only if action = ONE_SINGLE_VIEW, else each view is named by the corresponding concept
										Defaults to:
											"whole model"        if concepts = "*"
											"selected concepts"  in all other cases
									
		graphDepth (optional)			Depth of the graph to create (numerical)
										Defaults to 0
									
		nested_relations (optional)	Array if relationships names which will conduct to nested elements.
										Defaults to []
										
		graphDirection (optional)		Direction of the graph.
											May be one of:
												TB		Top-Bottom
												BT		Bottom-Top
												LR		Left-Right
												RL		right-Left
										Defaults "TB"
										
		graphAlign (optional)			Alignment of the graph.
											May be one of:
												UL		Up Left
												UR		Up Right
												DL		Down Left
												DR		Down Right
										Default to no default alignment

		hSep (optional)					Number of pixels that separate nodes horizontally
										Defaults to 50
										
		vSep (optional)					Number of pixels that separate nodes vertically
										Defaults to 50
										
		verbose (optional)				Prints verbose message on the console
										defaults to value of G_verbose variable defined at begining of script
										
		debug (optional)				Prints debug message on the console
										defaults to value of G_debug variable defined at begining of script
*/
function generate_view(param) {

	if (model == null || model.id == null)
		throw "No model selected.";

	// verbose and debug parameters
	if (param.debug !== undefined)
		G_debug = param.debug;
	if (param.verbose !== undefined)
		G_verbose = param.verbose;
	else
	if (G_debug) G_verbose = true;

	globalCounter = startCounter();

	debug("Function generate_view() called with following parameters");
	debug("     - concepts = " + param.concepts);
	debug("     - relations = " + param.relations);
	debug("     - reverseRelation = " + param.reverseRelation);
	debug("     - action = " + param.action);
	debug("     - viewName = " + param.viewName);
	debug("     - graphDepth = " + param.graphDepth);
	debug("     - graphDirection = " + param.graphDirection);
	debug("     - graphAlign = " + param.graphAlign);
	debug("     - nested_relations = " + JSON.stringify(param.nested_relations));
	debug("     - algorithm = " + param.algorithm);
	debug("     - hSep = " + param.hSep);
	debug("     - vSep = " + param.vSep);
	debug("     - verbose = " + param.verbose);
	debug("     - debug = " + param.debug);

	// checking mandatory parameters
	if (param.concepts === undefined)
		throw "Missing mandatatory concepts parameter";
	if (param.relations === undefined)
		param.relations = ''
	if (param.reverseRelation === undefined)
		param.reverseRelation = ''
	// defaulting optional parameters
	if (param.nested_relations === undefined)
		param.nested_relations = [];

	// calculating the default view name
	if ((param.viewName === undefined) || (param.viewName === ""))
		var viewName = (param.concepts === "*" ? "whole model" : $(selection).first().name);
	else 
		var viewName = param.viewName;

// selectElements
	// we get an array with all the selected elements
	var selectedElements = [] // will contain all the elements selected in the model (ie. no view, folder, relationship, object nor connection)
	if (param.selection === "*") { // --> all the elements in the model
		selectedElements = $("element");
	} else {
		for (var i in $(selection)) {
			var obj = $(selection)[i];
			if (obj.type === "archimate-model") {
				selectedElements = allElements;
				break;
			} else
				addElementInList(selectedElements, obj);
		}
	}

	var filteredElements = [];
	var searchedTypes = param.concepts.split(",");
	if (searchedTypes.length > 0) {
		console.log("*********** searched type = " + searchedTypes);
		for (var i in selectedElements) {
			var obj = selectedElements[i];
			if (param.concepts == 'selected') {
				if ($(obj).is("element"))
				filteredElements.push(obj);
			} else {
				if ($(obj).is("element") && (searchedTypes.indexOf(obj.type) !== -1))
					filteredElements.push(obj);
			}
		}
	} else {
		filteredElements = selectedElements
	}

	console.log("INFO: " + filteredElements.length + " Archimate elements to process.");

	if (filteredElements.length === 0) {
		throw "No Archimate element match your criterias.";
	}

// prepareView
	// required as we need to check if the view already exist before creating it
	var counter = startCounter();
	G__allViews = $("view");
	counter = endCounter(counter);
	debug("Found " + G__allViews.size() + " view in the model in " + (counter.minutes !== 0 ? (counter.minutes + "m") : "") + counter.seconds + "s");

	var view;
	if (param.action === undefined || param.action === TYPE_ACTION.ONE_SINGLE_VIEW) {
		if (param.concepts === "*") param.graphDepth = undefined;
		view = _generate_view(filteredElements, param.concepts, param.relations, param.nested_relations, param.graphDirection, param.graphAlign, param.hSep, param.vSep, param.algorithm, param.graphDepth, viewName);
	} else {
		filteredElements.forEach(function (concept) {
			view = _generate_view(concept, param.concepts, param.relations, param.nested_relations, param.graphDirection, param.graphAlign, param.hSep, param.vSep, param.algorithm, param.graphDepth);
		});
	}

	globalCounter = endCounter(globalCounter);
	debug("Total duration: " + (globalCounter.minutes !== 0 ? (globalCounter.minutes + "m") : "") + globalCounter.seconds + "s");

	verbose("Done.");

	return view;
}

function _generate_view(elem, concepts, relations, nested_relations, graphDirection, graphAlign, hSep, vSep, algorithm, graphDepth, viewName) {
	var counter = startCounter();

	var elements = [];
	if (elem.name !== undefined) { // one single concept
		elements.push(elem);
		if ((viewName === undefined) || (viewName === null) || (viewName === ""))
			viewName = elem.name;
	} else {
		elements = elem;
	}

	console.log("INFO: Generating view \"" + viewName + "\"");

	let view = check_and_create_view(viewName)

// createGraph
	// creation of the graph
	debug("     - Création of the graph.");
	graphLayout = new Object;
	graphLayout.marginx = 10;
	graphLayout.marginy = 10;
	if (graphDirection !== undefined) graphLayout.rankdir = graphDirection;
	if (graphAlign !== undefined) graphLayout.align = graphAlign;
	if (hSep !== undefined) graphLayout.nodesep = hSep;
	if (vSep !== undefined) graphLayout.ranksep = vSep;
	if (algorithm !== undefined) graphLayout.ranker = algorithm;

	var graph = new G__dagre.graphlib.Graph({
			compound: true,
			multigraph: true
		})
		.setGraph(graphLayout)
		.setDefaultNodeLabel(function () {
			return {};
		})
		.setDefaultEdgeLabel(function () {
			return {
				minlen: 1,
				weight: 1
			};
		});

// addNodes
		// we add elements to the graph
	debug("Adding selected elements to the graph...");
	var elementsInGraph = {};
	elements.forEach(function (e) {
		if (elementsInGraph[e.id] === undefined) {
			elementsInGraph[e.id] = e;
			graph.setNode(e.id, {
				label: e.name,
				width: NODE_WIDTH,
				height: NODE_HEIGHT
			});
			debug("     - " + e + " (" + e.class + ")");
		}
	});
	var originalLength = Object.keys(elementsInGraph).length;
	debug(originalLength + " elements have been added to the graph.")

// addRelatedNodes
	// if the whole model is not selected and param.graphDepth is not zero,
	// then we loop on all the elements and follow the relationships to complete the list
	if ((graphDepth !== undefined) && (graphDepth > 0)) {

		debug("Following relationships (depth = " + graphDepth + ")");
		var searchedTypes = concepts.split(",");
		debug("Filter found sources and targest for " + searchedTypes);

		for (id in elementsInGraph) {
			function addRelatedTo(elem, depth) {
				if (elementsInGraph[elem.id] === undefined) {
					elementsInGraph[elem.id] = elem;
					graph.setNode(elem.id, {
						label: elem.name,
						width: NODE_WIDTH,
						height: NODE_HEIGHT
					});
					debug("     - " + elem + " (" + elem.class + ")");
				}
				if (depth > 0) {
					// TODO: what about relationships on relationships ?

					$(elem).inRels().filter(r => filter_relations(r, relations)).each(function (rel) {
						var src = $(rel).sourceEnds().first();
						if ($(src).is("element") && (searchedTypes.indexOf(src.type) !== -1))
							addRelatedTo(src, depth - 1);
					});
					$(elem).outRels().filter(r => filter_relations(r, relations)).each(function (rel) {
						var tgt = $(rel).targetEnds().first();
						if ($(tgt).is("element") && (searchedTypes.indexOf(tgt.type) !== -1))
							addRelatedTo(tgt, depth - 1);
					})
				}
			}
			addRelatedTo(elementsInGraph[id], graphDepth);
		};
		debug((Object.keys(elementsInGraph).length - originalLength) + " more elements have been added to the graph.");
	}
	debug("The graph has got " + graph.nodeCount() + " nodes in total.");

// createListOfEdges 
	// we calculate the relationships to add to the graph
	// when a relationships indicates that elements should be nested, then no relationship is added to the graph for the parent
	verbose("Calculating hierarchy and relationships between elements in the graph...");
	var relationshipsToAdd = {};
	var parents = [];
	for (id in elementsInGraph) {
		sourceElement = elementsInGraph[id];
		// Considering outRels() is sufficient, as inRels() for this element is part of an ourRels() of another element.
		$(sourceElement).outRels().filter(r => filter_relations(r, relations)).each(function (rel) {
			var targetElement = $(rel).targetEnds().first();
			if ($(targetElement).is("element")) {
				// we have to manually loop on the array as the proxy object is different from the one in the array
				// so the indexOf() function always fails
				var trouve = false;
				for (e in elementsInGraph) {
					if (elementsInGraph[e].id === targetElement.id) {
						trouve = true;
						break;
					}
				}
				if (trouve) {
					if (nested_relations.indexOf(rel.type) != -1) {
						if (REVERSE_RELATIONS.indexOf(rel.type) == -1) {
							debug("     - " + sourceElement + " is parent of " + targetElement);
							graph.setParent(targetElement.id, sourceElement.id);
							parents.push(sourceElement.id); // source is parent of target

						} else { // for specialiazation embedding other way around
							debug("     - " + targetElement + " is parent of " + sourceElement);
							graph.setParent(sourceElement.id, targetElement.id);
							parents.push(targetElement.id); // target is parent of source
						}
					}
					if (relationshipsToAdd[rel.id] === undefined)
						relationshipsToAdd[rel.id] = rel;
				}
			}
		});
	};
	originalLength = Object.keys(relationshipsToAdd).length;
	debug("Found " + originalLength + " relationships.");

	// we remove the relationships that source or target a parent
	for (id in relationshipsToAdd) {
		rel = relationshipsToAdd[id];
		var src = $(rel).sourceEnds().first();
		var tgt = $(rel).targetEnds().first();

		if ((parents.indexOf(src.id) !== -1) || (parents.indexOf(tgt.id) !== -1)) { // if source or target is parent
			debug("     - nested relation " + rel);
			//			relationshipsToAddLength--;
			Object.keys(relationshipsToAdd).length--;
			delete relationshipsToAdd[id];
		}
	};

	if (Object.keys(relationshipsToAdd).length !== originalLength)
		warning((originalLength - Object.keys(relationshipsToAdd).length) + " relationships are ignored because of graphlib limitations.");

// addEdges
		verbose("Adding " + Object.keys(relationshipsToAdd).length + " relationships to the graph...");
	for (id in relationshipsToAdd) {
		rel = relationshipsToAdd[id];
		var src = $(rel).sourceEnds().first();
		var tgt = $(rel).targetEnds().first();
		debug("     - adding " + rel + " from " + src + " to " + tgt);
		if (REVERSE_RELATIONS.indexOf(rel.type) == -1) {
			graph.setEdge(src.id, tgt.id, {
				label: rel.id
			});
		} else {
			graph.setEdge(tgt.id, src.id, {
				label: rel.id
			});
		}
	};

// layoutGraph
	verbose("Calculating the graph layout...");
	debug("     - rankdir: " + graphDirection);
	debug("     - align: " + graphAlign);
	debug("     - nodesep: " + hSep);
	debug("     - ranksep: " + vSep);
	debug("     - ranker: " + algorithm);
	try {
		var opts = {}
		// opts.debugTiming = true
		opts.debugTiming = false
		G__dagre.layout(graph, opts);
	} catch (e) {
		console.error(e.stack);
		throw e;
	}

// drawElementsFromGraph
	verbose("Converting graph nodes to Archimate objects...");
	var viewObjectsIds = {};
	var viewObjects = {}
	graph.nodes().forEach(function addElement(nodeId) {
		if (viewObjectsIds[nodeId] === undefined) { // if the id has not yet been added to the view
			viewObjectsIds[nodeId] = true;
			var node = graph.node(nodeId);
			var parentId = graph.parent(nodeId);
			var archiElement = $("#" + nodeId).first()

			try {
				var x = parseInt(node.x - node.width / 2);
				var y = parseInt(node.y - node.height / 2);
				if (parentId === undefined) {
					debug("     - Adding " + archiElement + " (x=" + x + ", y=" + y + ", width=" + node.width + ", height" + node.height + ")");
					viewObjects[nodeId] = view.add(archiElement, x, y, node.width, node.height);
				} else {
					if (viewObjectsIds[parentId] === undefined) {
						// if the parent is not yet in the view, we add it first
						addElement(parentId);
					}
					var archiParent = viewObjects[parentId];
					do {
						// we calculate the coordinates of the Archi object:
						// Archi coordinates are related to the parent, while the graph coordinates are related to the top left corner
						var grandParent = viewObjects[parentId];
						x = x - grandParent.bounds.x;
						y = y - grandParent.bounds.y + 10;
						parentId = graph.parent(parentId);
					} while (parentId !== undefined);
					debug("     - Adding " + archiElement + " (x=" + x + ", y=" + y + ", width=" + node.width + ", height" + node.height + ") into parent " + archiParent);
					viewObjects[nodeId] = archiParent.add(archiElement, x, y, node.width, node.height);
				}
			} catch (e) {
				console.error("-->" + e);
			}
		}
	});

// drawRelations
	// we calculate the relationships to add to the view
	// when a relationships indicates that elements should be nested, then no relationship is added to the view for the parent
	verbose("Converting graph edges to Archimate connections...");
	addedRelationships = [];
	for (id in elementsInGraph) {
		sourceElement = elementsInGraph[id];
		$(sourceElement).outRels().filter(r => filter_relations(r, relations)).each(function (rel) {
			var targetElement = $(rel).targetEnds().first();
			if ((viewObjects[targetElement.id] !== undefined) && (nested_relations.indexOf(rel.type) == -1)) {
				// if the target element is in the view and that the objects are not nested
				if (addedRelationships.indexOf(rel.id) === -1) {
					debug("     - connecting " + sourceElement + " to " + targetElement);
					addedRelationships.push(rel.id);
					var connection = view.add(rel, viewObjects[sourceElement.id], viewObjects[targetElement.id]);
					// TODO: if the graph contains control points for edges, use them as connection corners
				}
			}
		});
	};

	graph = null;
	relationships = null;
	viewObjects = null;
	viewObjectsIds = null;
	elementsInGraph = null;

	console.log("INFO: View generated.");

	counter = endCounter(counter);
	console.log("Duration: " + counter.minutes + "m" + counter.seconds + "s");

	return view;
}

function verbose(msg) {
	if (G_verbose) console.log("VERB: " + msg);
}

function debug(msg) {
	if (G_debug) console.log("DEBG: " + msg);
}

function warning(msg) {
	console.error("WARN: " + msg)
};

// Open the view	
function open_view(view) {
	try {
		// jArchi provides a ArchimateDiagramModelProxy class where then openDiagramEditor requires a ArchimateDiagramModel class
		// unfortunately, the getEObject() method that provides the underlying ArchimateDiagramModel class, is protected
		// so we use reflection to invoke this method.
		var method = Packages.com.archimatetool.script.dom.model.ArchimateDiagramModelProxy.class.getDeclaredMethod("getEObject");
		method.setAccessible(true);
		var v = method.invoke(view);
		Packages.com.archimatetool.editor.ui.services.EditorManager.openDiagramEditor(v);
	} catch (e) {
		console.error("Failed to open the view. You may open it manually.");
	}
}

function filter_relations(r, relations) {

	if (relations == '') return true

	let filterTypes = relations.split(",");

	if (filterTypes.length > 0) {
		if (filterTypes.indexOf(r.type) !== -1) {
			return true
		} else {
			return false
		}
	} else {
		return true
	}
}

function check_and_create_view(viewName) {

	// we check if the corresponding view already exists
	let theView = G__allViews.filter(function (diagram) {
		return diagram.name == viewName;
	}).first();

	// If the view already exist, make view empty
	if (theView) {
		warning("     - The view already exists. Make view empty");
		console.log(`View ${theView}`)
		$(theView).find().each(function(o) {
			// console.log(`Delete ${o}`)
			o.delete()
		})	
	} else {
		warning("     - Creating new view.");
		theView = model.createArchimateView(viewName);
	}

	return theView
}