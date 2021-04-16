/*
 * JArchi script that allows to create one or several views containing Archimate concepts, and automates their placement.
 *
 * Written by Herve Jouin.
 *
 * Requires:
 *     Archi:			https://www.archimatetool.com
 *     jArchi plugin:	https://www.archimatetool.com/plugins
 *     librairies:
 *			jvm-npm:	https://github.com/nodyn/jvm-npm
 *			Dagre:		https://github.com/dagrejs/dagre
 *				Graphlib:	https://github.com/dagrejs/graphlib
 *				Lodash:		https://github.com/lodash/lodash
 *
 *  #	date		Author			Comments
 *  1	28/01/2019	Hervé Jouin		File creation.
 *  2	03/04/2021	Mark Backer		Some more parameters and restructure.
 * 
 * Param is an object that may contain the following properties:
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
									
		reverse_relations (optional)	The relations types which will be rendered target to source
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

		debug (optional)				Prints debug message on the console
										defaults to value of G_debug variable defined at begining of script
*/

try {
	load(__DIR__ + "../_lib/jvm-npm.js");
	require.addPath(__SCRIPTS_DIR__ + "node_modules/dagre/dist/");
	var dagre = require("dagre");
} catch (error) {
	console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
}

const VIEWNAME_SUFFIX = " (generated)";
const REVERSED_DELIMITER = "_";
const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;

function generate_multiple_view(param) {
	try {
		if (checkParameters(param)) {
			let filteredElements = selectElements(param);
			console.log(`\n== Generating ${filteredElements.length} views ==`);

			filteredElements.forEach(function (concept) {
				param.viewName = `${concept.name} (generated)`;

				console.log(`\n== Generate view for ${concept.name} ==`);

				graph = createGraph(param);

				fillGraph(param, $(concept), graph);

				layoutGraph(param, graph);

				createView(param);
				console.log(`== View '${param.viewName}' generated ==`);
			});
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
}

function generate_view(param) {
	// debug parameters
	if (param.debug !== undefined) _commonShowDebugMessage.push(param.debug);

	try {
		if (checkParameters(param)) {
			let filteredElements = selectElements(param);

			graph = createGraph(param);

			fillGraph(param, filteredElements, graph);

			layoutGraph(param, graph);

			createView(param);
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}

	if (param.debug !== undefined) _commonShowDebugMessage.pop();
}

function checkParameters(param) {
	// checking mandatory parameters
	if (param.concepts === undefined) {
		console.log("Missing mandatatory parameter 'concepts'");
		return false;
	}

	// defaulting optional parameters
	if (param.relations === undefined) param.relations = [];
	// TODO else
	// 	for each in ARCHI_RELATION_TYPE
	if (param.reverse_relations === undefined) param.reverse_relations = [];
	// TODO else
	// 	for each in ARCHI_RELATION_TYPE
	if (param.nested_relations === undefined) param.nested_relations = [];
	// TODO else
	// 	for each in ARCHI_RELATION_TYPE

	// calculating the default view name
	if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
	if (!param.viewName.endsWith(VIEWNAME_SUFFIX)) param.viewName += VIEWNAME_SUFFIX;

	debug("Function called with parameters");
	debug("     - concepts (mandatory) = " + JSON.stringify(param.concepts));
	debug("     - relations =            " + JSON.stringify(param.relations));
	debug("     - reverse_relations =    " + JSON.stringify(param.reverse_relations));
	debug("     - nested_relations =     " + JSON.stringify(param.nested_relations));
	debug("     - viewName =             " + param.viewName);

	debug("     - graphDepth =           " + param.graphDepth);
	debug("     - graphDirection =       " + param.graphDirection);
	debug("     - graphAlign (def mid) = " + param.graphAlign);
	debug("     - algorithm =            " + param.algorithm);
	debug("     - hSep =                 " + param.hSep);
	debug("     - vSep =                 " + param.vSep);

	debug("     - debug =                " + param.debug);

	return true;
}

function selectElements(param) {
	if (model == null || model.id == null) throw "No model selected.";

	// This function adds an Archimate element in a list
	// if a container is given, then the function recursively adds all the elements in that container
	function addElementInList(list, obj) {
		if ($(obj).is("element")) list.push(obj.concept);
		$(obj)
			.children()
			.each(function (child) {
				addElementInList(list, child);
			});
		return list;
	}

	// we get an array with all the selected elements
	var selectedElements = [];
	for (var i in $(selection)) {
		var obj = $(selection)[i];
		if (obj.type === "archimate-model") {
			selectedElements = $("element");
			break;
		} else addElementInList(selectedElements, obj);
	}

	console.log(`\n> ${selectedElements.length} elements selected before filtering`);

	var filteredElements = [];
	if (param.concepts.length > 0) {
		console.log("> selection filter: " + param.concepts);
		for (var i in selectedElements) {
			var obj = selectedElements[i];
			if (param.concepts[0] == "selected") {
				if ($(obj).is("element")) filteredElements.push(obj);
			} else {
				if ($(obj).is("element") && param.concepts.indexOf(obj.type) !== -1) filteredElements.push(obj);
			}
		}
	} else {
		filteredElements = selectedElements;
	}

	console.log(`> ${filteredElements.length} elements left to process`);

	if (filteredElements.length === 0) {
		throw "No Archimate element match your criterias.";
	}
	return filteredElements;
}

function createGraph(param) {
	graphLayout = new Object();
	graphLayout.marginx = 10;
	graphLayout.marginy = 10;
	if (param.graphDirection !== undefined) graphLayout.rankdir = param.graphDirection;
	if (param.graphAlign !== undefined) graphLayout.align = param.graphAlign;
	if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
	if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
	if (param.algorithm !== undefined) graphLayout.ranker = param.algorithm;

	console.log("> Create graph");
	debug(`graphLayout: ${JSON.stringify(graphLayout)}`);

	var graph = new dagre.graphlib.Graph({
		directed: true, // A directed graph treats the order of nodes in an edge as significant whereas an undirected graph does not.
		compound: true, // A compound graph is one where a node can be the parent of other nodes.
		multigraph: true, // A multigraph is a graph that can have more than one edge between the same pair of nodes.
	})
		.setGraph(graphLayout)
		.setDefaultNodeLabel(function () {
			return {};
		})
		.setDefaultEdgeLabel(function () {
			return {
				minlen: 1,
				weight: 1,
			};
		});
	return graph;
}
/**
 * add selected nodes
 *
 * add related nodes
 *
 *
 *
 */
function fillGraph(param, filteredElements, graph) {
	var elementsIndex = {};

	console.log("\n> Adding elements and relations to the graph...");

	debug(`viewElements.length: ${filteredElements.length}`);

	let startLevel = 0;
	filteredElements.forEach((archiElement) => {
		addNode(archiElement, filteredElements, elementsIndex, startLevel, param.graphDepth);
	});

	console.log("\nThe graph has got:");
	console.log(graph.nodeCount() + " nodes and");
	console.log(graph.edgeCount() + " edges in total.");
}

// recursive function to add viewElements and targets of elements
function addNode(archiElement, filteredElements, elementsIndex, level, depth) {
	if (elementsIndex[archiElement.id] === undefined) {
		graph.setNode(archiElement.id, {
			label: archiElement.name,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
		});
		elementsIndex[archiElement.id] = archiElement;
		debug(`${">".repeat(level + 3)}: ${archiElement}`);
	}
	/**
	 *
	 * 		// TODO: what about relationships on relationships ?
	 *
	 * 	follow outgoing relation
	 * 		if target is in selected elementents
	 * 			add selected nodes to graph
	 * 			add relation
	 * 		else
	 * 			if depth > level
	 * 				add related nodes to graph. nodes are not not selected,
	 * 				rel
	 */
	$(archiElement)
		.outRels()
		.filter((rel) => filter_relations(rel, param.relations))
		.each(function (rel) {
			let tgt = $(rel).targetEnds().first();
			let src = archiElement;
			// always add outgoing relation between elements in selection
			// Considering outRels() is sufficient, as inRels() for this element is part of an ourRels() of another element.
			// debug(`filteredElements.length = ${filteredElements.length}`)
			if (
				$(tgt).is("element") &&
				(param.concepts.length === 0 || param.concepts.indexOf(tgt.type) !== -1) &&
				filteredElements.filter((e) => tgt.id == e.id).length == 1
			) {
				// if tgt node not yet in graph, add it
				addNode(tgt, filteredElements, elementsIndex, level + 1, depth);
				// Add relation as edge
				addEdge(src, tgt, rel, level);
			} else {
				// follow outgoing relations if depth > 0
				if (depth > level) {
					// if tgt node not yet in graph, add it
					addNode(tgt, filteredElements, elementsIndex, level + 1, depth);
					// Add relation as edge
					addEdge(src, tgt, rel, level);
				} // else skip relation ..
			}
		});
	/**
	 *  follow ingoing relations
	 * 		if sources not in selection
	 * 			if depth > level
	 * 				add nodes
	 * 				add rel
	 *
	 * */

	$(archiElement)
		.inRels()
		.filter((rel) => filter_relations(rel, param.relations))
		.each(function (rel) {
			let src = $(rel).sourceEnds().first();
			let tgt = archiElement;
			if ($(src).is("element") && (param.concepts.length === 0 || param.concepts.indexOf(src.type) !== -1)) {
				if (depth > level) {
					addNode(src, filteredElements, elementsIndex, level + 1, depth);

					// Add relation as edge
					addEdge(src, tgt, rel, level);
				}
			}
		});
}

function addEdge(src, tgt, rel, level) {
	if (typeof this.addEdgeFlag == "undefined") {
		// JS functions are also objects -- which means they can have (static) properties
		this.addEdgeFlag = true;
		this.parentIndex = {};
	}

	let graphSrc = src;
	let graphTgt = tgt;
	let start_line = "->";
	let rel_line = `${graphSrc.name} --${rel.type}-> ${graphTgt.name}`;
	if (param.reverse_relations.indexOf(rel.type) !== -1) {
		graphSrc = tgt;
		graphTgt = src;
		start_line = "<- reversed";
		rel_line = `${graphSrc.name} <-${rel.type}-- ${graphTgt.name}`;
	}

	if (param.nested_relations.indexOf(rel.type) != -1) {
		graph.setParent(graphSrc.id, graphTgt.id);
		// ### save rel.id for parent
		debug(`${">".repeat(level + 3)}: ${start_line} parent ${graphTgt.name} (${rel})`);
		// save id of parent because of limitation graphlayout. A parent cannot have another relation.
		this.parentIndex[graphTgt.id] = true;
	} else {
		if (this.parentIndex[graphSrc.id] || this.parentIndex[graphTgt.id]) {
			debug(`${">".repeat(level + 3)}: Skipped ${rel_line}`);
		} else {
			graph.setEdge(graphSrc.id, graphTgt.id, {
				label: `${start_line}${REVERSED_DELIMITER}${rel.id}`,
			});
			debug(`${">".repeat(level + 3)}: ${start_line} ${rel_line}`);
		}
	}
}

function filter_relations(r, relations) {
	if (relations.length > 0) {
		if (relations.indexOf(r.type) !== -1) {
			return true;
		} else {
			return false;
		}
	} else {
		return true;
	}
}

function layoutGraph(param, graph) {
	console.log("Calculating the graph layout...");

	try {
		var opts = {};
		opts.debugTiming = false;
		// if (param.debug)
		// 	opts.debugTiming = true

		dagre.layout(graph, opts);
	} catch (e) {
		console.error(e.stack);
		throw e;
	}
}

function createView(param) {
	console.log(`\nDrawing ArchiMate view`);

	// we check if the corresponding view already exists
	let view = $("view")
		.filter(function (v) {
			return v.name == param.viewName;
		})
		.first();

	// If the view already exist, make view empty
	if (view) {
		$(view)
			.find()
			.each(function (visualObject) {
				visualObject.delete();
			});
		console.log(`View ${view} already exists. Overwriting view`);
	} else {
		view = model.createArchimateView(param.viewName);
		console.log(`Created ${view}`);
	}

	let archiVisualElements = new Object();
	let nodeIndex = {};

	console.log("Drawing graph nodes as elements ...");
	graph.nodes().forEach((nodeId) => drawNode(nodeId, nodeIndex, archiVisualElements, view));

	console.log("Drawing graph edges as relations ...");
	graph.edges().forEach((edgeObject) => drawEdge(edgeObject, archiVisualElements, view));
}

function drawNode(nodeId, nodeIndex, archiVisualElements, view) {
	// if the id has not yet been added to the view
	// check because parents are drawn, at the moment a child node comes by
	if (nodeIndex[nodeId] === undefined) {
		nodeIndex[nodeId] = true;
		let node = graph.node(nodeId);
		let parentId = graph.parent(nodeId);
		let archiElement = $("#" + nodeId).first();

		try {
			// archi coördinates for visual element on archi diagram (related to the top left corner of diagram)
			let x = parseInt(node.x - node.width / 2);
			let y = parseInt(node.y - node.height / 2);

			if (parentId === undefined) {
				// draw element on canvas
				debug(`>> draw ${archiElement.name} (x=${x}, y=${y}, width=${node.width}, height=${node.height})`);
				debug(`archiVisualElements: ${archiVisualElements}`);
				debug(`view: ${view}`);
				archiVisualElements[nodeId] = view.add(archiElement, x, y, node.width, node.height);
			} else {
				// draw element in parent
				if (nodeIndex[parentId] === undefined) {
					// if the parent is not yet in the view, we add it first
					drawNode(parentId, nodeIndex, archiVisualElements, view);
				}
				let parentNode = graph.node(parentId);

				// calculate the position within the parent
				x = x - parseInt(parentNode.x - parentNode.width / 2);
				y = y - parseInt(parentNode.y - parentNode.height / 2 + 10);

				let archiParent = archiVisualElements[parentId];
				debug(`archiParent: ${archiParent}`);
				debug(
					`>> draw ${archiElement} into parent ${archiParent} (x=${x}, y=${y}, width=${node.width}, height=${node.height})`
				);
				archiVisualElements[nodeId] = archiParent.add(archiElement, x, y, node.width, node.height);
			}
		} catch (e) {
			console.error("-->" + e + "\n" + e.stack);
			// console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
		}
	}
}

function drawEdge(edgeObject, archiVisualElements, view) {
	// we calculate the relationships to add to the view
	// when a relationships indicates that elements should be nested, then no relationship is added to the view for the parent

	// debug(`graph.edge(edgeObject): ${JSON.stringify(graph.edge(edgeObject))}`);

	let srcId = edgeObject.v;
	let tgtId = edgeObject.w;

	// don't draw relations for edges to parents (embedded relations)
	if (graph.parent(srcId) === tgtId) {
		// ???
		debug("skip embedded edge");
	} else {
		let edgeReverse = graph.edge(edgeObject).label.split(REVERSED_DELIMITER)[0];
		let archiRelationID = graph.edge(edgeObject).label.split(REVERSED_DELIMITER)[1];
		let archiRelation = $("#" + archiRelationID).first();

		debug(`archiRelation: ${archiRelation}`);
		let connection;
		if (edgeReverse === "->")
			connection = view.add(archiRelation, archiVisualElements[srcId], archiVisualElements[tgtId]);
		else connection = view.add(archiRelation, archiVisualElements[tgtId], archiVisualElements[srcId]);

		// let nrPoints = Object.keys(graph.edge(edgeObject).points).length;
		// for (let index = 0; index < nrPoints - 1; index++) {
		// 	addBendpoint(graph.edge(edgeObject).points[index], graph.edge(edgeObject).points[index+1], index, connection)
		// }
	}
}

function addBendpoint(startpoint, endpoint, index, connection) {
	let bendpoint = {
		startX: startpoint.x,
		startY: startpoint.y,
		endX: 0,
		endY: 0,
	};
	// let bendpoint = {
	// 	startX: startpoint.x /2,
	// 	startY: startpoint.y /2,
	// 	endX: endpoint.x /2,
	// 	endY: endpoint.y /2
	// }
	debug(`bendpoint: ${JSON.stringify(bendpoint)}`);
	debug(`connection: ${connection}`);
	debug(`index: ${index}`);

	connection.addRelativeBendpoint(bendpoint, index);
}
