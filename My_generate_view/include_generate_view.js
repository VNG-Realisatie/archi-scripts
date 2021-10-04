/*
 * JArchi script to create one or several views containing Archimate concepts, and automates their placement.
 *
 * Based on "generate views using graphlib" by Herve Jouin.
 * See https://forum.archimatetool.com/index.php?topic=639.msg3563#msg3563
 *
 * Requires:
 *     Archi:      https://www.archimatetool.com
 *     jArchi plugin:  https://www.archimatetool.com/plugins
 *     nodejs:
 *      jvm-npm:  https://github.com/nodyn/jvm-npm
 *      dagre:    https://github.com/dagrejs/dagre
 *
 *  #  date    Author      Comments
 *  1  28/01/2019  Hervé Jouin   File creation.
 *  2  03/04/2021  Mark Backer   Some more parameters and restructure.
 *  3  25/09/2021  Mark Backer   use dagre-cluster-fix version
 *  4  02/10/2021  Mark Backer   draw connection with bendpoints
 *
 * Param is an object that may contain the following properties:
 *  conceptFilter (mandatory)
 *  - Archimate concept types that will be included in the view
 *    -  [] (empty array) all concept types are included
 *    -  [type, type, ...]  array of concept types like business-actor, application-component, technology-collaboration, node, ...
 *  relationFilter (optional)
 *  - The relationship types that will be included in the view.
 *    When graphDepth is greater than 0, this also defines which relation will be followed
 *      - [] (empty array)  all relationship types in the model
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  reverseRelation (optional)
 *  - The relationship types which will be rendered target to source
 *      - [] (empty array)  no relationships are reversed
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  nestedRelation (optional)
 *  - The relationship types which will be rendered nested.
 *  - The target elements (all children) will be embedded in the source element (the parent)
 *      - [] (empty array)  no relationships are nested
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  viewName (optional)
 *  - Name of the view to create
 *  - Defaults to: name of selected concept
 *  graphDepth (optional, default is 0)
 *  -  Depth of the graph to create (numerical)
 *  graphDirection (optional, default "TB")
 *  -  Direction of the graph.
 *        TB    Top-Bottom
 *        BT    Bottom-Top
 *        LR    Left-Right
 *        RL    right-Left
 *  graphAlign (optional, default is none which centers de graph)
 *  - Alignment of the graph.
 *        UL    Up Left
 *        UR    Up Right
 *        DL    Down Left
 *        DR    Down Right
 *  hSep (optional, Defaults to 50)
 *  - Number of pixels that separate nodes horizontally
 *  vSep (optional, Defaults to 50)
 *  - Number of pixels that separate nodes vertically
 *  debug (optional, default is false)
 *  - Print debug messages on the console
 *
 * ToDo
 * - what about relationships on relationships ?
 */

const VIEWNAME_SUFFIX = " (generated)";
const ARROW_DELIMITER = "_";
const ARROW = "->";
const ARROW_REVERSED = "<-";

// For allignment with the grid:
// - use the following settings for in Archi
//    - go to Edit > Preferences > Diagram: set grid = 10
//    - go to Edit > Preferences > Diagram > Appearance: set figure width=141 and height=61
// - or change the node width and height here
const NODE_WIDTH = 140;
const NODE_HEIGHT = 60;

var graph; // graphlib graph for layout view
var graphParents = []; // global variable for bookkeeping a parent's relations

_logDebugMessage.push(true);

/**
 * How to install the required node modules in Windows?
 *
 * Use nodeJS to install dagre
 * - install nodejs (nodejs is only used for installing the modules, it's not necesary for running the script)
 * - open a command prompt
 *   - cd to Archi scripts folder as set in Archi Edit > preferences > Scripting
 *   - npm install dagre-cluster-fix (in 'Scripts folder'\node_modules)
 * Or find de dagre distribution script and copy it somewhere in the scripts folder
 * - Point the require function to the dagre.js
 * - see code below for example
 */
try {
  load(__DIR__ + "../_lib/jvm-npm.js");
  // uncomment if installed with nodeJS the dagre dist file is located in a node_modules folder
  //  const NODE_MODULES_DIR = __SCRIPTS_DIR__ + "node_modules";
  //  require.addPath(NODE_MODULES_DIR);
  //  var dagre = require("./dagre-cluster-fix/dist/dagre");

  // uncomment if you have copied the dagre file into the folder "_lib" next to the scripts folder
  require.addPath(__DIR__);
  var dagre = require("../_lib/dagre");

  console.log(`Dagre version:`);
  console.log(`- dagre:    ${dagre.version}`);
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw "\nDagre module not loaded";
}

/**
 * generate a view for every selected element
 *
 * @param {object} param - settings for generating a view
 */
function generate_multiple_view(param) {
  try {
    if (checkParameters(param)) {
      let filteredSelection = selectElements(param);
      console.log(`\n== Generating ${filteredSelection.length} views ==`);

      filteredSelection.forEach(function (element) {
        param.viewName = `${element.name} (generated)`;

        console.log(`\n== Generate view for ${element.name} ==`);

        graph = createGraph(param);
        fillGraph(param, $(element));
        layoutGraph(param);
        renderArchiView(param);
      });
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
}

/**
 * generate a view with the selected elements
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  // debug parameters
  if (param.debug !== undefined) _logDebugMessage.push(param.debug);

  try {
    if (checkParameters(param)) {
      let filteredSelection = selectElements(param);

      graph = createGraph(param);
      fillGraph(param, filteredSelection);
      layoutGraph(param);
      renderArchiView(param);
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }

  if (param.debug !== undefined) _logDebugMessage.pop();
}

/**
 * validate the settings in the param object
 *
 * @param {object} param - settings for generating a view
 */
function checkParameters(param) {
  // checking mandatory parameters
  // TODO check for valid Archi element en relation names or pop-up window with pull-downs
  if (param.conceptFilter === undefined) {
    console.log("Missing mandatatory parameter 'concepts'");
    return false;
  }

  // defaulting optional parameters
  if (param.relationFilter === undefined) param.relationFilter = [];
  if (param.reverseRelation === undefined) param.reverseRelation = [];
  if (param.nestedRelation === undefined) param.nestedRelation = [];

  // setting the default view name
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  if (!param.viewName.endsWith(VIEWNAME_SUFFIX)) param.viewName += VIEWNAME_SUFFIX;

  const INDENT = "  - ";
  console.log("Function called with parameters");
  console.log("- concepts filter (mandatory)");
  param.conceptFilter.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- relations filter");
  param.relationFilter.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- reverseRelation");
  param.reverseRelation.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- nestedRelation");
  param.nestedRelation.forEach((p) => console.log(`${INDENT}${p}`));
  console.log(`- viewName = "${param.viewName}"`);
  console.log("- graphDepth = " + param.graphDepth);
  console.log("- graphDirection = " + param.graphDirection);
  console.log("- graphAlign (def mid) = " + param.graphAlign);
  console.log("- algorithm = " + param.algorithm);
  console.log("- hSep = " + param.hSep);
  console.log("- vSep = " + param.vSep);
  console.log("- debug = " + param.debug);
  return true;
}

/**
 * create a list with the selected elements.
 * filter the list according the settings in the param object.
 *
 * @param {object} param - settings for generating a view
 */
function selectElements(param) {
  if (model == null || model.id == null) throw "No model selected. Select one or more objects in the model tree or a view";

  // add the selected elements in a list.
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

  // create an array with the selected elements
  let selectedElements = [];
  if ($(selection).first().type === "archimate-model") {
    selectedElements = $("element");
  } else {
    $(selection).each((obj) => addElementInList(selectedElements, obj));
  }
  console.log(`\n> ${selectedElements.length} elements selected before filtering`);

  // filter the selected elements with the concept filter
  let filteredSelection = selectedElements.filter((obj) => filter_object_type(obj, param.conceptFilter));
  console.log(`> ${filteredSelection.length} elements after filtering`);
  if (filteredSelection.length === 0) throw "No Archimate element match your criterias.";

  return filteredSelection;
}

/**
 * create a graph with the param settings
 *
 * @param {object} param
 * @returns empty graph
 */
function createGraph(param) {
  graphLayout = new Object();
  graphLayout.marginx = 10;
  graphLayout.marginy = 10;
  if (param.graphDirection !== undefined) graphLayout.rankdir = param.graphDirection;
  if (param.graphAlign !== undefined) graphLayout.align = param.graphAlign;
  // if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
  // if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
  if (param.algorithm !== undefined) graphLayout.ranker = param.algorithm;

  console.log("\n> Create graph");

  let graph = new dagre.graphlib.Graph({
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
 * add the filtered selection to the graph
 */
function fillGraph(param, filteredSelection) {
  console.log("\n> Adding elements and relations to the graph...");

  let startLevel = 0;
  filteredSelection.forEach((archiElement) => {
    // add all selected elements to the graph
    addElement(startLevel, param.graphDepth, archiElement, filteredSelection);
  });

  console.log("\nAdded to the graph:");
  console.log(graph.nodeCount() + " nodes and");
  console.log(graph.edgeCount() + " edges");
  if (graphParents.length > 0) console.log(graphParents.length + " parent-child nestings");
}

/**
 * addElement - recursive function
 *   add given Archi elements to the graph
 *   recurse into all relations until the recursion level is equal or larger then the given graphDepth
 *      add found elements to the graph
 *      add relations to the graph
 *
 * @param {*} archiElement Archi object to add to graph
 * @param {*} filteredSelection array with selected elements, filtered with param.conceptFilter
 * @param {*} level integer for counting depth of recursion
 * @param {*} graphDepth integer with maximum depth of graph
 */
function addElement(level, graphDepth, archiElement, filteredSelection) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  debug(`${">".repeat(level + 1)} Start ${archiElement}`);

  // stop if the graphDepth is reached
  // depth=0 means generate a view with selected elements only;
  // to add relations between selected elements you need to recurse once (until level=1)
  if ((graphDepth > 0 && level > graphDepth) || (graphDepth == 0 && level > 1)) {
    debug(`== Stop; depth reached level=${level} graphDepth=${graphDepth} ==`);
    return STOPPED;
  } else {
    debug(`== Don't stop for graphDepth=${graphDepth} level=${level} ==`);
  }

  if (!graph.hasNode(archiElement.id)) {
    graph.setNode(archiElement.id, {
      label: archiElement.name,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    });
    debug(`${">".repeat(level + 1)} Added "${archiElement}"`);
  } else {
    debug(`${">".repeat(level + 1)} Already added "${archiElement}"`);
  }

  $(archiElement)
    .rels()
    .filter((rel) => filter_object_type(rel, param.relationFilter))
    .each(function (rel) {
      // only relation between elements (skip relations with relations)
      if ($(rel).sourceEnds().is("element") && $(rel).targetEnds().is("element")) {
        let src = $(rel).sourceEnds().first();
        let tgt = $(rel).targetEnds().first();
        let related_element = tgt;
        // if ingoing relation
        if (tgt.id == archiElement.id) {
          related_element = src;
          debug(`In going relation; rel=${rel} related element="${related_element}"`);
        } else {
          debug(`Out going relation; rel=${rel} related element="${related_element}"`);
        }

        // if graphDepth=0; check if related_element is in the selection
        if (graphDepth == 0 && filteredSelection.filter((e) => related_element.id == e.id).length < 1) {
          debug(`== skip; related_element "${related_element}" is not in selection ==`);
        } else {
          // check if the related_element is in the concepts filter
          if (filter_object_type(related_element, param.conceptFilter)) {
            // add related_element to the graph
            if (addElement(level + 1, graphDepth, related_element, filteredSelection) == NOT_STOPPED) {
              // Add relation as edge
              addRelation(level, rel);
            }
          }
        }
      }
    });
  return NOT_STOPPED;
}

/**
 * Add the given relation to the graph
 *
 * @param {*} level integer, depth of recursion
 * @param {*} rel Archi relation
 */
function addRelation(level, rel) {
  let relSrc = $(rel).sourceEnds().first();
  let relTgt = $(rel).targetEnds().first();

  let arrow = ARROW;
  let rel_line = `${relSrc.name} --${rel.type}-> ${relTgt.name}`;

  // reverse the graph edge for given Archi relation types
  if (param.reverseRelation.indexOf(rel.type) !== -1) {
    relSrc = $(rel).targetEnds().first();
    relTgt = $(rel).sourceEnds().first();
    arrow = ARROW_REVERSED;
    rel_line = `${relSrc.name} <-${rel.type}-- ${relTgt.name}`;
  }

  if (param.nestedRelation.indexOf(rel.type) == -1) {
    createEdge(level, relSrc, relTgt, rel, arrow, rel_line);
  } else {
    // circular relations cannot be drawn nested
    if (relSrc.id == relTgt.id) {
      createEdge(level, relSrc, relTgt, rel, arrow, rel_line);
      console.log(`${">".repeat(level + 1)} created an edge for nested circular relation ${rel_line}`);
    } else {
      createParentRelation(level, relSrc, relTgt, rel, arrow);
    }
  }
}

function createEdge(level, relSrc, relTgt, rel, arrow, rel_line) {
  let edge_name = rel.id;
  if (!graph.hasEdge(relSrc.id, relTgt.id, edge_name)) {
    let edge_label = { label: `${arrow}${ARROW_DELIMITER}${rel.id}` };
    graph.setEdge(relSrc.id, relTgt.id, edge_label, edge_name);
    debug(`${">".repeat(level + 1)} Added relation "${arrow} ${rel_line}"`);
  } else {
    debug(`${">".repeat(level + 1)} skip, edge already in graph "${arrow} ${rel_line}"`);
  }
}

function createParentRelation(level, parent, child, rel, arrow) {
  debug(`graph.parent(child.id)=${graph.parent(child.id)}`);
  debug(`parent.id=${parent.id}`);

  // check if relation is already added
  if (!(graph.parent(child.id) == parent.id)) {
    // save parent relation
    graphParents.push(rel);

    graph.setParent(child.id, parent.id);
    debug(`${">".repeat(level + 1)} Added child->parent = "${child}"->"${parent}" (${rel})`);
  } else {
    debug(`${">".repeat(level + 1)} Skip child->parent, already in graph = "${child}"->"${parent}" (${rel})`);
  }
  return;
}

function filter_object_type(o, objects) {
  if (objects.length > 0) {
    if (objects.indexOf(o.type) !== -1) return true;
    else return false;
  } else {
    return true;
  }
}

function layoutGraph(param) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function renderArchiView(param) {
  console.log(`\nDrawing ArchiMate view...  `);

  // we check if the corresponding view already exists
  let view = $("view")
    .filter((v) => v.name == param.viewName)
    .first();

  // If the view already exist, make view empty
  if (view) {
    $(view)
      .find()
      .each((o) => o.delete());
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
  // graph.edges().forEach(function (e) {
  //   console.log("Edge " + e.v + " -> " + e.w + ": " + JSON.stringify(graph.edge(e), null, "  "));
  // });
  graph.edges().forEach((edge) => drawEdge(edge, archiVisualElements, view));

  console.log("Drawing child-parent relations ...");
  graphParents.forEach((parentRel) => drawParent(parentRel, archiVisualElements, view));

  console.log(`\nGenerated view '${param.viewName}'`);
  open_view(view);
}

function drawNode(nodeId, nodeIndex, archiVisualElements, view) {
  _logDebugMessage.push(false);
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
        archiVisualElements[nodeId] = view.add(archiElement, x, y, node.width + 1, node.height + 1);
      } else {
        // draw element in parent
        // first add the the parent to the view (the function checks if it's already drawn)
        drawNode(parentId, nodeIndex, archiVisualElements, view);

        let parentNode = graph.node(parentId);

        // calculate the position within the parent
        let y_shift = -10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 10;

        x = x - parseInt(parentNode.x - parentNode.width / 2);
        y = y - parseInt(parentNode.y - parentNode.height / 2 + y_shift);

        let archiParent = archiVisualElements[parentId];
        debug(`archiParent: ${archiParent}`);
        debug(`>> draw ${archiElement} in parent ${archiParent} (x=${x}, y=${y}, width=${node.width}, height=${node.height})`);

        archiVisualElements[nodeId] = archiParent.add(archiElement, x, y, node.width, node.height);
      }
    } catch (e) {
      console.error("-->" + e + "\n" + e.stack);
    }
  }
  _logDebugMessage.pop();
}

/**
 * draw an Archi connection for the given edge
 *
 * @param {object} edge graphlib edge object
 * @param {object} archiVisualElements index object to Archi view occurences
 * @param {object} view Archi view
 */
function drawEdge(edge, archiVisualElements, view) {
  _logDebugMessage.push(false);

  let srcId = edge.v;
  let tgtId = edge.w;

  let arrow = graph.edge(edge).label.split(ARROW_DELIMITER)[0];
  if (arrow === ARROW_REVERSED) {
    tgtId = edge.v;
    srcId = edge.w;
  }
  let archiRelationID = graph.edge(edge).label.split(ARROW_DELIMITER)[1];
  let archiRelation = $("#" + archiRelationID).first();
  debug(`archiRelation: ${archiRelation}`);

  let connection = view.add(archiRelation, archiVisualElements[srcId], archiVisualElements[tgtId]);

  // dagre bendpoints for circular relations are ugly
  if (archiRelation.source.id == archiRelation.target.id) {
    addCircularBendpoints(edge, connection);
  } else {
    addBendpoints(edge, connection, arrow === ARROW_REVERSED);
  }
  _logDebugMessage.pop();
}

/**
 * add a connection for a nested relation
 *   depending on the Archi preferences, the connection is or is not drawn
 *   See Edit > preferences > connections > ARM > enable implicit connections
 *
 * @param {object} parentRel Archi relation
 * @param {object} archiVisualElements index object to Archi view occurences
 * @param {object} view Archi view
 */
function drawParent(parentRel, archiVisualElements, view) {
  debug(`parentRel: ${parentRel}`);
  let connection;
  connection = view.add(parentRel, archiVisualElements[parentRel.source.id], archiVisualElements[parentRel.target.id]);
}

/**
 * Archi connection bendpoints
 * - startX and Y; positon relative to center of source element
 * - endX and Y; position relative to center of target
 * Dagre edge points
 * - points.x and y; absolute position of bendpoint
 *
 * @param {object} edge - graph edge
 * @param {object} connection - Archi connection
 * @param {boolean} reversed - edge is reversed
 */
function addBendpoints(edge, connection, reversed) {
  _logDebugMessage.push(false);
  // center coordinates of source element
  let srcCenterX = parseInt(connection.source.bounds.x + connection.source.bounds.width / 2);
  let srcCenterY = parseInt(connection.source.bounds.y + connection.source.bounds.height / 2);
  let tgtCenterX = parseInt(connection.target.bounds.x + connection.target.bounds.width / 2);
  let tgtCenterY = parseInt(connection.target.bounds.y + connection.target.bounds.height / 2);
  debug(`source ${connection.source} \nbounds ${JSON.stringify(connection.source.bounds, null, "  ")}`);
  debug(`srcCenter (x,y)= (${srcCenterX}, ${srcCenterY})`);
  debug(`target ${connection.target} \nbounds ${JSON.stringify(connection.target.bounds, null, "  ")}`);
  debug(`tgtCenter (x,y)= (${tgtCenterX}, ${tgtCenterY})`);

  // calculate of Archi bendpoint (relative coordinates) from points (absolute coordinates)
  // skip first and last point. These are not bendpoints, but edge connection to node
  let bendpoints = [];
  let points = graph.edge(edge).points;
  for (let i = 1; i < points.length - 1; i++) {
    debug(`Points: "x"=${points[i].x} "y"=${points[i].y}`);

    bendpoints.push({
      startX: parseInt(points[i].x - srcCenterX),
      startY: parseInt(points[i].y - srcCenterY),
      endX: parseInt(points[i].x - tgtCenterX),
      endY: parseInt(points[i].y - tgtCenterY),
    });
    debug(`bendpoint: ${JSON.stringify(bendpoints[i - 1], null, "  ")}`);
  }
  debug(" ");
  if (points.length < 3) debug(`Edge with ${points.length} points: ${graph.edge(edge).label}`);

  for (let i = 0; i < bendpoints.length; i++) {
    if (!reversed) {
      connection.addRelativeBendpoint(bendpoints[i], i);
    } else {
      connection.addRelativeBendpoint(bendpoints[bendpoints.length - i - 1], i);
    }
  }
  _logDebugMessage.pop();
}

function addCircularBendpoints(edge, connection) {
  // relative coordinates from center of element to top right corner
  let rightTopX = connection.source.bounds.width / 2;
  let rightTopY = connection.source.bounds.height / 2;
  let rightX = rightTopX + 30;
  let down_Y = -rightTopY + 20;
  let left_X = rightTopX - 20;
  let up___Y = -rightTopY - 10;

  let bendpoints = [];
  bendpoints[0] = { startX: rightX, startY: down_Y, endX: rightX, endY: down_Y };
  bendpoints[1] = { startX: rightX, startY: up___Y, endX: rightX, endY: up___Y };
  bendpoints[2] = { startX: left_X, startY: up___Y, endX: left_X, endY: up___Y };

  for (let i = 0; i < bendpoints.length; i++) {
    connection.addRelativeBendpoint(bendpoints[i], i);
  }
}

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
    console.error(`"Failed to open ${view}. You may open it manually`);
  }
}
