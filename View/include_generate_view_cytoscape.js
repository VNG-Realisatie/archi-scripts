/**
 * JArchi script with functions to generate views containing Archimate concepts
 * and automates their placement.
 * - generate_view(param) - generate a view for the current selection
 * - generate_multiple_view(param) - generate a view for every selected concept
 *
 * Param is an object that may contain the following properties:
 *	elementFilter (default ["elements"])
 *	- The concept types to include in the view. If empty, all types are included
 *		-	[class,class,...]	array of concept types like business-actor, application-component, technology-collaboration, node, ...
 *
 *	relationFilter (optional, default [])
 *	- The relationship types that will be included in the view. If empty, all types are included
 *		When graphDepth is greater than 0, this also defines which relation will be followed
 *			[class,class,...]	array of relationship types like realization-relationship,assignment-relationship, ...
 *
 *	drawReversed (optional, default [])
 *	- The relations types that will be rendered target to source
 *		-	[class,class,...] array of relationship types like realization-relationship,assignment-relationship, ...
 *
 *	drawNested (optional, default [])
 *	-	The relationship types that will be rendered embedded/nested
 *		All target elements (the children) will be nested inside the source element (the parent)
 *		Use the above parameter drawReversed to switch parent and child for a relationship type
 *		-	[class,class,...] array of relationship types like realization-relationship,assignment-relationship, ...
 *
 *	viewName (optional, default is name of first selected object)
 *	- Name of the view to create
 *
 *	graphDepth (optional, default 0)
 *	-	Depth of the graph to create (numerical)
 *
 *	graphDirection (optional, default "TB")
 *	-	Direction of the graph.
 *				TB		Top-Bottom
 *				BT		Bottom-Top
 *				LR		Left-Right
 *				RL		right-Left
 *
 *	graphAlign (optional, default is none which centers de graph)
 *	- Alignment of the graph.
 *				UL		Up Left
 *				UR		Up Right
 *				DL		Down Left
 *				DR		Down Right
 *
 * 	nodeWidth (optional, default 140)
 *	- Number of pixels for the width of a node
 * 	nodeHeight (optional, default 60)
 *	- Number of pixels for the height of a node
 *	hSep (optional, default 50)
 *	- Number of pixels that separate nodes horizontally
 *	vSep (optional, default 50)
 *	- Number of pixels that separate nodes vertically
 *
 * 	debug (optional, default false)
 *	- Prints debug message on the console
 *
 * Based on the work of Herve Jouin.
 *
 * Requires:
 *     Archi:			https://www.archimatetool.com
 *     jArchi plugin:	https://www.archimatetool.com/plugins
 *
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
 * Usefull links:
 * - https://jsfiddle.net/bababalcksheep/apybnszr/
 *
 */

const VIEWNAME_SUFFIX = " (generated)";
const REVERSED_DELIMITER = "_";

/**
 * hack for missing setTimeout function in GraalVM environment
 *
 * Creating cytoscape object gives
 * 		ReferenceError: "setTimeout" is not defined
 *		probably caused by: at startAnimationLoop (/cytoscape:32)
 */
function setTimeout() {
	debug(`setTimeout called`);
}

function generate_view(param) {
	// debug parameter
	if (param.debug === undefined) debugStackPush(param.debug);
	else debugStackPush(false);

	try {
		if (checkParameters(param)) {
			let containedElements = containedSelection(param);

			let connected = connectedSelection(containedElements, param);
			listElements(`\nAll connected elements:`, connected.elements);
			listRelations(`All connected relations:`, connected.relations);

			var graph = createGraph(param);

			fillGraph(param, connected, graph);

			layoutGraph(param, graph);

			drawView(param, graph, createView(param));
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
}

function generate_multiple_view(param) {
	// debug parameter
	if (param.debug === undefined) debugStackPush(param.debug);
	else debugStackPush(false);

	try {
		if (checkParameters(param)) {
			let containedElements = containedSelection(param);
			console.log(`\n== Generating ${containedElements.length} views ==`);

			containedElements.forEach(function (concept) {
				param.viewName = `${concept.name} (generated)`;
				console.log(`\n== Generate view for ${concept.name} ==`);

				let connected = connectedSelection($(concept), param);
				listElements(`\nAll connected elements:`, connected.elements);
				listRelations(`All connected relations:`, connected.relations);

				var graph = createGraph(param);

				fillGraph(param, connected, graph);
				layoutGraph(param, graph);
				drawView(param, graph, createView(param));

				graph.destroy();
				console.log(`== View '${param.viewName}' generated ==`);
			});
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
}

function checkParameters(param) {
	console.log("Checking parameters ...");

	// default is to select all elements
	if (param.elementFilter.length == 0) param.elementFilter.push("element");

	// defaulting optional parameters
	if (param.relationFilter === undefined) param.relationFilter = [];
	if (param.drawReversed === undefined) param.drawReversed = [];
	if (param.drawNested === undefined) param.drawNested = [];

	// calculating the default view name
	if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
	if (!param.viewName.endsWith(VIEWNAME_SUFFIX)) param.viewName += VIEWNAME_SUFFIX;

	if (param.layout === undefined) {
		console.log("Missing mandatatory parameter 'layout'");
		return false;
	}

	if (param.nodeWidth === undefined) param.nodeWidth = 140;
	if (param.nodeHeight === undefined) param.nodeHeight = 60;
	if (param.hSep === undefined) param.hSep = 50;
	if (param.vSep === undefined) param.vSep = 50;

	console.log("- concepts (mandatory) = " + JSON.stringify(param.elementFilter));
	console.log("- relations =            " + JSON.stringify(param.relationFilter));
	console.log("- drawReversed =    " + JSON.stringify(param.drawReversed));
	console.log("- drawNested =     " + JSON.stringify(param.drawNested));
	console.log("- viewName =             " + param.viewName);

	console.log("- graphDepth =           " + param.graphDepth);
	console.log("- graphDirection =       " + param.graphDirection);
	console.log("- graphAlign (def mid) = " + param.graphAlign);
	console.log("- ranker =            " + param.ranker);
	console.log("- layout =               " + param.layout);
	console.log("- nodeWidth =            " + param.nodeWidth);
	console.log("- nodeHeight =           " + param.nodeHeight);
	console.log("- hSep =                 " + param.hSep);
	console.log("- vSep =                 " + param.vSep);

	console.log("- debug =                " + param.debug);

	return true;
}

/**
 * Create a collection for the current selection.
 * all contained elements of selected folders and views are added
 */
function containedSelection(param) {
	console.log("Checking and creating collection to plot ...");

	if (model == null || model.id == null) {
		throw "\n>> Nothing selected. Make a selection in the model tree or view <<";
	}

	// This function adds an Archimate element filtered by type to a collection
	// if a container is given, then the function recursively adds all the elements in that container
	function addObjectToSelection(obj, concept_type, coll) {
		// filter for concept_type
		if ($(obj).is(concept_type)) {
			// do not add duplicates
			if (!coll.is(`#${obj.concept.id}`)) {
				coll.add(obj.concept);
			}
		}
		$(obj)
			.children()
			.each(function (child) {
				addObjectToSelection(child, concept_type, coll);
			});
		return coll;
	}

	let select_Elements = $(); // empty jArchi collection
	for (let concept_type of param.elementFilter) {
		console.log(`Select objects of type "${concept_type}"`);
		$(selection).each(function (obj) {
			addObjectToSelection(obj, concept_type, select_Elements);
			// console.log(`>> Selected for ${obj}: \n${select_Elements}`);
		});
	}

	console.log(`> Total of ${select_Elements.length} elements selected\n`);

	if (select_Elements.length === 0) {
		throw "\n>> No Archimate element match your criteria <<";
	}

	return select_Elements;
}
/**
 * Expand the selection by following the relation for a given depth
 */
function connectedSelection(containedElements, param) {
	/**
	 * isConnected
	 * 	Filter relations which are connected to the given collection
	 */
	function isConnected(relation, coll_of_elements) {
		if (coll_of_elements.is(`#${relation.source.id}`) && coll_of_elements.is(`#${relation.target.id}`)) {
			return true;
		}
		return false;
	}

	/**
	 * notDuplicate
	 * 	Filter objects not present in given collection
	 */
	function notDuplicate(object, coll_of_objects) {
		if (!coll_of_objects.is(`#${object.id}`)) {
			return true;
		}
		return false;
	}

	// elements and relations found by following relations.
	// the index is the depth where the element or relation was found
	let elementsDepth = [];
	let relationsDepth = [];

	elementsDepth[0] = containedElements;
	relationsDepth[0] = containedElements.rels().filter((rel) => isConnected(rel, containedElements));
	listElements(`Contained elements:`, elementsDepth[0]);
	listRelations(`Contained relations:`, relationsDepth[0]);

	let connected = {};
	connected.elements = elementsDepth[0]; // growing collection of all connected elements
	connected.relations = relationsDepth[0]; // growing collection of all interconnected relations

	console.log(`\nFollow relation for depth ${param.graphDepth}`);
	for (let depth = 1; depth <= param.graphDepth; depth++) {
		console.log(`Depth [${depth}]:`);

		elementsDepth[depth] = $();

		// select related elements of concept_type
		for (let concept_type of param.elementFilter) {
			console.log(`Filter for type "${concept_type}"`);
			elementsDepth[depth].add(elementsDepth[depth - 1].rels().ends(concept_type).not(connected.elements));
			// elementsDepth[depth].add(elementsDepth[depth - 1].rels().ends(concept_type).not(connected.elements));
			listElements(`Connected elements:`, elementsDepth[depth]);
		}

		let connectedElements = $();
		connectedElements.add(elementsDepth[depth - 1]);
		connectedElements.add(elementsDepth[depth]);

		// let connectedElements = elementsDepth[depth - 1].add(elementsDepth[depth]);
		// relations for level depth
		relationsDepth[depth] = connectedElements
			.rels()
			.filter((rel) => isConnected(rel, connectedElements))
			.filter((rel) => notDuplicate(rel, relationsDepth[depth - 1]));

		// console.log(`All relations for level [${depth}]: ${levelElements.rels()}\n`);
		listRelations(`Connected relations:`, relationsDepth[depth]);

		connected.elements.add(elementsDepth[depth]);
		connected.relations.add(relationsDepth[depth]);
	}
	return connected;
}

function createGraph(param) {
	debugStackPush(true);
	// require.addPath(__SCRIPTS_DIR__ + "node_modules/cytoscape/");
	// require.addPath(__SCRIPTS_DIR__ + "node_modules/cytoscape/dist");
	// require.addPath(__SCRIPTS_DIR__ + "node_modules/layout-base/");
	// var cytoscape = require("cytoscape.cjs");

	console.log("Loading cytoscape...");

	load("https://unpkg.com/cytoscape");
	debug("Loaded cytoscape");

	load("https://unpkg.com/layout-base");
	debug("Loaded layout-base");

	console.log(`Loaded cytoscape version ${cytoscape.version}`);
	
	console.log("> Create graph");

	let cy = cytoscape({
		style: [
			{
				selector: "node",
				style: {
					shape: "rectangle",
					width: param.nodeWidth,
					height: param.nodeHeight,
				},
			},
		],
		styleEnabled: true,
		headless: true,
	});

	debug(`Graph style object:\n${JSON.stringify(cy.style().json(), null, 2)}`);
	debugStackPop();
	return cy;
}

/**
 * fill the graph with the selected elements and relations
 * add selectedElements
 * for depth < graphDepth
 * 	find selectedElements[depth] relations
 * 	if not graphdepth reached
 * 		add related nodes for deph + 1
 * 	add relations for selectedElement and added related nodes
 *
 */
function fillGraph(param, connected, graph) {
	console.log("\n> Adding elements and relations to the graph...");

	// add connected elements
	connected.elements.each((archiElement) => {
		graph.add({
			data: {
				id: archiElement.id,
				label: archiElement.name,
			},
		});
	});

	connected.relations.each(function (archiRelation) {
		// addRelation(graph, archiRelation);

		// some archiMate relation can be drawn reversed, for a better layout
		let graphSrc = archiRelation.source;
		let graphTgt = archiRelation.target;
		let start_line = "->";
		let rel_arrow = `--${archiRelation.type}->`;
		let reversed = false;
		if (param.drawReversed.indexOf(archiRelation.type) !== -1) {
			graphSrc = archiRelation.target;
			graphTgt = archiRelation.source;
			start_line = "<- reversed";
			rel_arrow = `<-${archiRelation.type}--`;
			reversed = true;
		}
		let rel_label = `${graphSrc.name} ${rel_arrow} ${graphTgt.name}`;

		// if (param.drawNested.indexOf(rel.type) != -1) {
		// 	// graph.setParent(graphSrc.id, graphTgt.id);
		// 	graph.add({
		// 		data: {
		// 			id: rel.id,
		// 			source: graphSrc.id,
		// 			target: graphTgt.id,
		// 			label: rel_line,
		// 		},
		// 	});

		graph.add({
			data: {
				id: archiRelation.id,
				source: graphSrc.id,
				target: graphTgt.id,
				label: rel_label,
				reversed: reversed,
			},
		});
	});

	console.log("\nThe graph has got:");
	console.log(graph.nodes().length + " nodes and");
	console.log(graph.edges().length + " edges in total.");
}

function layoutGraph(param, graph) {
	debugStackPush(true);
	console.log("Sorting nodes by name...");

	graph = graph.nodes().sort(function (a, b) {
		return a.data("label").localeCompare(b.data("label"));
	});

	let options = {
		name: param.layout,
		directed: true, 
		circle:true,
		fit: true,
		// padding: 10,
		boundingBox: {
			x1: 0,
			y1: 0,
			x2: 100,
			y2: 100,
		},
		nodeSep: param.hSep + param.nodeWidth,
		// clockwise: false,
		// minNodeSpacing: 30,
		animate: false,
		// radius: 200
	};

	debug("Loading jvm-npm for require function ...");
	load(__SCRIPTS_DIR__ + "MyScripts/_lib/jvm-npm.js");

	switch (param.layout) {
		case "grid":
		case "circle":
		case "concentric":
		case "cose":
		case "breadthfirst":
		case "random":
			break;
		case "avsdf":
			console.log(`Loading layout extension ${param.layout}...`);
			load("https://unpkg.com/avsdf-base");
			debug("Loaded avsdf-base");
			load("https://unpkg.com/cytoscape-avsdf");
			debug("Loaded cytoscape-avsdf");
			options.nodeSeparation = param.vSep;
			break;
		case "cose":
			console.log(`Loading layout extension ${param.layout}...`);
			load("https://unpkg.com/cose-base");
			debug("Loaded cose-base");
			break;
		case "fcose":
			console.log(`Loading layout extension ${param.layout}...`);
			require.addPath(__SCRIPTS_DIR__ + "node_modules/cytoscape-fcose/");
			require.addPath(__SCRIPTS_DIR__ + "node_modules/cose-base/");

			var fcose = require("cytoscape-fcose");
			cytoscape.use(fcose); // register extension
			// load("https://unpkg.com/cytoscape-fcose");
			debug("Loaded cytoscape-fcose");
			break;
		case "elk":
			console.log(`Loading layout extension ${param.layout}...`);
			load("https://unpkg.com/cytoscape-elk");
			debug("Loaded cytoscape-elk");
			break;
		case "dagre":
			console.log(`Loading layout extension ${param.layout}...`);
			// load("https://unpkg.com/cytoscape-dagre");
			// debug("Loaded cytoscape-dagre");
			// load("https://unpkg.com/graphlib");
			// debug("Loaded graphlib");

			require.addPath(__SCRIPTS_DIR__ + "node_modules/cytoscape-dagre/");
			require.addPath(__SCRIPTS_DIR__ + "node_modules/dagre/dist/");

			var dagre = require("cytoscape-dagre");
			cytoscape.use(dagre); // register extension

			options.nodeSep = param.hSep;
			options.rankSep = param.vSep;
			options.rankDir = param.graphDirection;
			if (param.ranker !== undefined) options.ranker = param.ranker;
			break;

		default:
			throw new Error(`>> Invalid parameter layout: ${param.layout} <<`);
	}

	console.log(`Calculating the graph layout ${param.layout}...`);
	debug(`Layout options object: \n${JSON.stringify(options, null, 2)}`);
	graph.layout(options).run();
	debugStackPop();
}

/**
 * create or reuse archi view
 */
function createView(param) {
	console.log(`\nCreate an Archi view`);

	// check if the corresponding view already exists
	let view = $("view")
		.filter(function (v) {
			return v.name == param.viewName;
		})
		.first();

	// If the view already exist, overwrite it
	// else create view
	if (view) {
		$(view)
			.find()
			.each(function (visualObject) {
				visualObject.delete();
			});
		console.log(`> View "${view.name}" already exists. Overwriting view`);
	} else {
		view = model.createArchimateView(param.viewName);
		console.log(`> Created "${view.name}"`);
	}
	return view;
}

/**
 * draw the graph in an archi view
 */
function drawView(param, graph, view) {
	console.log(`\nDrawing ArchiMate view`);

	var eles = graph.elements();

	let archiVisualElements = new Object();
	let nodeIndex = {};

	console.log("> Drawing graph nodes as elements ...");
	// graph.nodes().forEach(nodeId => drawNode(nodeId, nodeIndex, archiVisualElements, view));
	debugStackPush(true);
	graph.nodes().forEach((node) => drawViewNode(node, nodeIndex, archiVisualElements, view, eles.boundingBox()));
	debugStackPop();

	console.log("> Drawing graph edges as relations ...");
	// graph.edges().forEach(edgeObject => drawEdge(edgeObject, archiVisualElements, view));
	debugStackPush(false);
	graph.edges().forEach((edge) => drawViewEdge(edge, archiVisualElements, view));
	debugStackPop();

	console.log(`\nFinished: open view "${view.name}"`);
}

function drawViewNode(node, nodeIndex, archiVisualElements, view, boundingbox) {
	// if the id has not yet been added to the view
	// check because parents are drawn, at the moment a child node comes by
	if (nodeIndex[node.id()] === undefined) {
		nodeIndex[node.id()] = true;
		// let node = graph.node(node);
		// let parentId = graph.parent(node);
		let archiElement = $("#" + node.id()).first();

		// archi coördinates for visual element on archi diagram (related to the top left corner of diagram)
		let x = node.position("x") - boundingbox.x1;
		let y = node.position("y") - boundingbox.y1;

		// if (parentId === undefined) {
		// draw element on canvas
		debug(
			`>> Layout node ${node.data("label")}: x=${node.position("x")}, y=${node.position(
				"y"
			)}, width=${node.width()}, height=${node.height()}`
		);
		debug(`>> Archi element ${archiElement.name}: x=${x}, y=${y}, width=${node.width()}, height=${node.height()}\n`);

		archiVisualElements[archiElement.id] = view.add(archiElement, x, y, node.width(), node.height());

		// } else {
		// 	// draw element in parent
		// 	if (nodeIndex[parentId] === undefined) {
		// 		// if the parent is not yet in the view, we add it first
		// 		drawNode(parentId, nodeIndex, archiVisualElements, view);
		// 	}
		// 	let parentNode = graph.node(parentId)

		// 	// calculate the position within the parent
		// 	x = x - parseInt(parentNode.x - (parentNode.width() / 2));
		// 	y = y - parseInt(parentNode.y - (parentNode.outerHeight() / 2) + 10);

		// 	let archiParent = archiVisualElements[parentId];
		// 	debug(`archiParent: ${archiParent}`)
		// 	debug(`>> draw ${archiElement} into parent ${archiParent} (x=${x}, y=${y}, width=${node.width()}, height=${node.outerHeight()})`);
		// 	archiVisualElements[node] = archiParent.add(archiElement, x, y, node.width(), node.outerHeight());
		// }
	}
}

function drawViewEdge(edge, archiVisualElements, view) {
	// we calculate the relationships to add to the view
	// when a relationships indicates that elements should be nested, then no relationship is added to the view for the parent

	debug(`edgeObject: ${JSON.stringify(edge.json())}`);

	// don't draw relations for edges to parents (embedded relations)
	// if (graph.parent(srcId) === tgtId) { // ???
	// 	debug('skip embedded edge')
	// } else {
	let archiRelationID = edge.id();
	let archiRelation = $(`#${archiRelationID}`).first();

	debug(`archiRelation: ${archiRelation}`);

	let srcId = edge.source().id();
	let tgtId = edge.target().id();
	// debug(`edge.data("reversed"): ${edge.data("reversed")}`);
	if (edge.data("reversed")) {
		// reverse back to match source and target of Archi relation
		srcId = edge.target().id();
		tgtId = edge.source().id();
	}

	debug(`source: ${archiVisualElements[srcId]}`);
	debug(`target: ${archiVisualElements[tgtId]}`);

	connection = view.add(archiRelation, archiVisualElements[srcId], archiVisualElements[tgtId]);

	// let nrPoints = Object.keys(graph.edge(edgeObject).points).length;
	// for (let index = 0; index < nrPoints - 1; index++) {
	// 	drawViewBendpoint(graph.edge(edgeObject).points[index], graph.edge(edgeObject).points[index+1], index, connection)
	// }
}

function drawViewBendpoint(startpoint, endpoint, index, connection) {
	let bendpoint = {
		startX: startpoint.x,
		startY: startpoint.y,
		endX: 0,
		endY: 0,
	};

	debug(`bendpoint: ${JSON.stringify(bendpoint)}`);
	debug(`connection: ${connection}`);
	debug(`index: ${index}`);

	connection.addRelativeBendpoint(bendpoint, index);
}

function listElements(text, elements) {
	console.log(text);
	elements.each(function (element) {
		console.log(`- ${element.name}`);
	});
}

function listRelations(text, relations) {
	console.log(text);
	relations.each(function (relation) {
		console.log(`- '${relation.source.name}' ==${relation.name}==> '${relation.target.name}'`);
	});
}
