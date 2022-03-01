/**
 * JArchi function for auto layout of an Archi view
 *
 * Use cases:
 * - quickly generate a starting point for a new view
 * - generate context views (the element and all its related elements)
 * - analyse your model by generating different views. 
 * - Use nesting to find unexpected relations, see double relations, etc.
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
 * Configure the behavior of generate_view with the param object properties:
 *  elementFilter (optional, default is no filter)
 *    Archimate concept types that will be included in the view
 *    -  [] (empty array) all concept types are included
 *    -  [type, type, ...]  array of concept types like business-actor, application-component, technology-collaboration, node, ...
 *  relationFilter (optional, default is no filter)
 *  - The relationship types that will be included in the view.
 *      - [] (empty array)  all relationship types in the model
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  drawReversed (optional, default none)
 *  - The relationship types which are reversed in the layout. The Archi relations are not changed.
 *      - [] (empty array)  no relationships are reversed
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  drawNested (optional, default none)
 *  - The relationship types which will be rendered nested.
 *  - The target elements (all children) will be embedded in the source element (the parent)
 *      - [] (empty array)  no relationships are nested
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  viewName (optional, default is "<selection> (generated)")
 *  - Name of the view to create
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
 *  hSep (optional, defaults to 50)
 *  - Number of pixels that separate nodes horizontally
 *  vSep (optional, defaults to 50)
 *  - Number of pixels that separate nodes vertically
 *  action (optional, default is SINGLE)
 *  - SINGLE   generate a view with the selected elements
 *  - MULTIPLE generate a view for every selected element
 *  debug (optional, default is false)
 *  - Print debug messages on the console
 *
 * Limitations
 * - relationships on relationships are not drawn, they are skipped
 * - layout of connections can be ugly (but for simple layouts it's good)
 * - generating views with 'nested' relations is not stable
 *    - with many nesting, dagre layout sometimes throws an error (a bug in this script or dagre-cluster-fix)
 *    - try with less nested relations or split your set of concepts ..
 */
const SINGLE = 1;
const MULTIPLE = 2;
const GENERATED_VIEW_FOLDER = "_Generated";

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

// polyfill for array method includes(), which is not supported in Nashorn ES6
if (!Array.prototype.includes) {
  Array.prototype.includes = function (search) {
    return !!~this.indexOf(search);
  };
}

/**
 * How to load the required dagre module?
 *
 * Use nodeJS to install dagre
 * - install nodejs (nodejs is only used for installing the modules, it's not necesary for running the script)
 * - open a command prompt
 *   - cd to Archi scripts folder as set in Archi Edit > preferences > Scripting
 *   - npm install dagre-cluster-fix (in 'Scripts folder'\node_modules)
 * Or go to https://unpkg.com/dagre-cluster-fix/
 * - download from the folder /dist the file dagre.js and copy it in the scripts folder
 * - Point the require function to the file dagre.js
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
 * generate a view for every selected element or
 * generate a view with the selected elements
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  if (param.debug !== undefined) _logDebugMessage.push(param.debug);
  try {
    if (checkParameters(param)) {
      let filteredSelection = [];
      filteredSelection = selectElements(param);

      if (param.action == MULTIPLE) {
        console.log(`\n== Generating ${filteredSelection.length} views ==`);

        filteredSelection.forEach(function (e) {
          console.log(`== Generate view for ${e.name} ==`);
          param.viewName = e.name;
          layoutAndRender(param, $(e));
        });
      } else {
        layoutAndRender(param, filteredSelection);
      }
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  if (param.debug !== undefined) _logDebugMessage.pop();
}

function layoutAndRender(param, filteredSelection) {
  createGraph(param);
  fillGraph(param, filteredSelection);
  layoutGraph(param);
  drawView(param);
}

/**
 * validate the settings in the param object
 *
 * @param {object} param - settings for generating a view
 */
function checkParameters(param) {
  // defaulting optional parameters
  if (param.elementFilter === undefined) param.elementFilter = [];
  if (param.relationFilter === undefined) param.relationFilter = [];
  if (param.drawReversed === undefined) param.drawReversed = [];
  if (param.drawNested === undefined) param.drawNested = [];

  // setting the default view name
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;

  // setting default layout options
  if (param.nodeWidth == undefined) param.nodeWidth = NODE_WIDTH;
  if (param.nodeHeight == undefined) param.nodeHeight = NODE_HEIGHT;

  if (param.action == undefined) param.action = SINGLE;

  const INDENT = "  - ";
  console.log("Function called with parameters");
  console.log("- elements filter (mandatory)");
  param.elementFilter.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- relations filter");
  param.relationFilter.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- drawReversed");
  param.drawReversed.forEach((p) => console.log(`${INDENT}${p}`));
  console.log("- drawNested");
  param.drawNested.forEach((p) => console.log(`${INDENT}${p}`));
  console.log(`- viewName = "${param.viewName}"`);
  console.log("- graphDepth = " + param.graphDepth);
  console.log("- graphDirection = " + param.graphDirection);
  console.log("- graphAlign (def mid) = " + param.graphAlign);
  console.log("- algorithm = " + param.algorithm);
  console.log("- nodeWidth = " + param.nodeWidth);
  console.log("- nodeHeight = " + param.nodeHeight);
  console.log("- hSep = " + param.hSep);
  console.log("- vSep = " + param.vSep);
  console.log("- action = " + param.action);
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
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // add the selected elements in a list. if a container is given, the elements in that container are added
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
  var selectedElements = [];
  if ($(selection).first().type === "archimate-model") {
    selectedElements = $("element");
  } else {
    $(selection).each((obj) => addElementInList(selectedElements, obj));
  }
  console.log(`\nSelection:`);
  console.log(`- ${selectedElements.length} selected elements`);

  // filter the selected elements with the concept filter
  let filteredSelection = selectedElements.filter((obj) => filter_object_type(obj, param.elementFilter));
  console.log(`- ${filteredSelection.length} filtered elements kept`);
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
  if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
  if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
  if (param.algorithm !== undefined) graphLayout.ranker = param.algorithm;

  console.log("\nCreate graph");

  // graph is globally defined
  graph = new dagre.graphlib.Graph({
    directed: true, // A directed graph treats the order of nodes in an edge as significant whereas an undirected graph does not.
    compound: true, // A compound graph is one where a node can be the parent of other nodes.
    multigraph: true, // A multigraph is a graph that can have more than one edge between the same pair of nodes.
  })
    .setGraph(graphLayout)
    .setDefaultNodeLabel(function () {
      return {};
    })
    .setDefaultEdgeLabel(function () {
      return { minlen: 1, weight: 1 };
    });
  return;
}

/**
 * add the filtered selection to the graph
 */
function fillGraph(param, filteredSelection) {
  console.log(`Adding elements and relations to the graph with a depth of ${param.graphDepth}...`);

  let startLevel = 0;
  filteredSelection.forEach((archiElement) => {
    // add all selected elements to the graph
    addElement(startLevel, param, archiElement, filteredSelection);
  });

  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  if (graphParents.length > 0) console.log(`- ${graphParents.length} parent-child nestings`);
}

/**
 * addElement - recursive function
 *   add given Archi elements to the graph
 *   recurse into all relations until the recursion level is equal or larger then the given graphDepth
 *      add found elements to the graph
 *      add relations to the graph
 *
 * @param {*} level integer for counting depth of recursion
 * @param {*} param integer with maximum depth of graph
 * @param {*} archiEle Archi object to add to graph
 * @param {*} filteredSelection array with selected elements, filtered with param.elementFilter
 */
function addElement(level, param, archiEle, filteredSelection) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  debug(`${">".repeat(level + 1)} Start ${archiEle}`);

  // stop if the graphDepth is reached
  // depth=0 means generate a view with selected elements only;
  // to add relations between selected elements you need to recurse once (until level=1)
  let graphDepth = param.graphDepth;
  if ((graphDepth > 0 && level > graphDepth) || (graphDepth == 0 && level > 1)) {
    debug(`== Stop; depth reached level=${level} graphDepth=${graphDepth} ==`);
    return STOPPED;
  } else {
    debug(`== Don't stop for graphDepth=${graphDepth} level=${level} ==`);
  }

  if (!graph.hasNode(archiEle.id)) {
    graph.setNode(archiEle.id, { label: archiEle.name, width: param.nodeWidth, height: param.nodeHeight });
    debug(`${">".repeat(level + 1)} Added "${archiEle}"`);
  } else {
    debug(`${">".repeat(level + 1)} Already added "${archiEle}"`);
  }

  $(archiEle)
    .rels()
    .filter((rel) => filter_object_type(rel, param.relationFilter))
    .each(function (rel) {
      // only relation between elements (skip relations with relations)
      if ($(rel).sourceEnds().is("element") && $(rel).targetEnds().is("element")) {
        let src = $(rel).sourceEnds().first();
        let tgt = $(rel).targetEnds().first();
        let related_element = tgt;
        // if ingoing relation
        if (tgt.id == archiEle.id) {
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
          if (filter_object_type(related_element, param.elementFilter)) {
            // add related_element to the graph
            if (addElement(level + 1, param, related_element, filteredSelection) == NOT_STOPPED) {
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
  if (param.drawReversed.includes(rel.type)) {
    relSrc = $(rel).targetEnds().first();
    relTgt = $(rel).sourceEnds().first();
    arrow = ARROW_REVERSED;
    rel_line = `${relSrc.name} <-${rel.type}-- ${relTgt.name}`;
  }

  if (param.drawNested.includes(rel.type)) {
    if (relSrc.id == relTgt.id) {
      // circular relations cannot be drawn nested
      createEdge(level, relSrc, relTgt, rel, arrow, rel_line);
      console.log(`${">".repeat(level + 1)} created an edge for nested circular relation ${rel_line}`);
    } else {
      createParentRelation(level, relSrc, relTgt, rel, arrow);
    }
  } else {
    createEdge(level, relSrc, relTgt, rel, arrow, rel_line);
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
  if (!graphParents.some((r) => r.id == rel.id)) {
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
  if (objects.length == 0) return true;
  return objects.includes(o.type);
}

function layoutGraph(param) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function drawView(param) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = getFolder("Views", GENERATED_VIEW_FOLDER);
  let view = getView(folder, param.viewName);

  let archiViewElement = new Object();
  let nodeIndex = {};

  console.log("Drawing graph nodes as elements ...");
  graph.nodes().forEach((nodeId) => drawNode(nodeId, nodeIndex, archiViewElement, view));

  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach((edge) => drawEdge(edge, archiViewElement, view));

  console.log("Adding child-parent relations to the view ...");
  graphParents.forEach((parentRel) => drawParent(parentRel, archiViewElement, view));

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  open_view(view);
}

function getFolder(layer, folderName) {
  let folder = $(model)
    .children("folder")
    .filter((f) => f.name == layer)
    .children("folder")
    .filter((f) => f.name == folderName)
    .first();

  if (!folder) {
    folder = $(model)
      .children("folder")
      .filter((f) => f.name == layer)
      .first();

    folder = folder.createFolder(folderName);
    console.log(`Created ${folder}`);
  }
  return folder;
}

function getView(folder, viewName) {
  // check if the corresponding view already exists in the given folder
  let view = $(folder)
    .children("view")
    .filter((v) => v.name == viewName)
    .first();

  // If the view already exist, empty view
  if (view) {
    console.log(`Found ${view}. Overwriting ...`);
    $(view)
      .find()
      .each((o) => o.delete());
  } else {
    view = model.createArchimateView(viewName);
    console.log(`Creating view: ${view.name}`);

    // move view to the generated views folder
    folder.add(view);
  }
  return view;
}

function drawNode(nodeId, nodeIndex, archiViewElement, view) {
  _logDebugMessage.push(false);
  // if the id has not yet been added to the view
  // check because parents are drawn, at the moment a child node comes by
  if (nodeIndex[nodeId] === undefined) {
    nodeIndex[nodeId] = true;
    let node = graph.node(nodeId);
    let parentId = graph.parent(nodeId);
    let archiElement = $("#" + nodeId).first();

    try {
      if (parentId === undefined) {
        // archi coordinates for visual element on archi diagram (related to the top left corner of diagram)

        debug(`>> draw ${archiElement} )`);
        let elePos = calcElement(node);
        archiViewElement[nodeId] = view.add(archiElement, elePos.x, elePos.y, elePos.width, elePos.height);
      } else {
        // first add the parent to the view (the function checks if it's already drawn)
        drawNode(parentId, nodeIndex, archiViewElement, view);

        // draw element in parent
        let parentNode = graph.node(parentId);
        let archiParent = archiViewElement[parentId];

        // calculate the position within the parent
        let y_shift = -10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 10;

        debug(`>> draw nested ${archiElement} in parent ${archiParent})`);
        let elePos = calcNestedElement(node, parentNode);
        archiViewElement[nodeId] = archiParent.add(archiElement, elePos.x, elePos.y, elePos.width, elePos.height);
      }
    } catch (e) {
      console.error("-->" + e + "\n" + e.stack);
    }
  }
  _logDebugMessage.pop();
}

// calculate the absolute coordinates of the left upper corner of the node
function calcElement(node) {
  let elePos = calcElementExact(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  debug(`>> corner (${JSON.stringify(elePos)}`);

  return elePos;
}

// calculate the relative coordinates of the node to the parent
function calcNestedElement(node, parentNode) {
  let nestedPos = calcElementExact(node);
  debug(`>> element (${JSON.stringify(nestedPos)}`);
  let parentPos = calcElementExact(parentNode);
  debug(`>> parent (${JSON.stringify(parentPos)}`);

  nestedPos.x = parseInt(nestedPos.x - parentPos.x);
  nestedPos.y = parseInt(nestedPos.y - parentPos.y);

  debug(`>> nested element (relative to parent) (${JSON.stringify(nestedPos)}`);

  return nestedPos;
}

function calcElementExact(node) {
  let elePos = {};
  elePos.x = node.x - node.width / 2;
  elePos.y = node.y - node.height / 2;

  // the +1 is for alignment of right bottom conrner on grid in Archi
  elePos.width = node.width + 1;
  elePos.height = node.height + 1;
  return elePos;
}

/**
 * draw an Archi connection for the given edge
 *
 * @param {object} edge graphlib edge object
 * @param {object} archiViewElement index object to Archi view occurences
 * @param {object} view Archi view
 */
function drawEdge(edge, archiViewElement, view) {
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

  let connection = view.add(archiRelation, archiViewElement[srcId], archiViewElement[tgtId]);

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
 * @param {object} archiViewElement index object to Archi view occurences
 * @param {object} view Archi view
 */
function drawParent(parentRel, archiViewElement, view) {
  debug(`parentRel: ${parentRel}`);
  let connection = view.add(parentRel, archiViewElement[parentRel.source.id], archiViewElement[parentRel.target.id]);
}

/**
 * add bendpoints to an Archi connection
 *
 * calculate Archi bendpoint coordinates from a Dagre point
 *  - coordinates of Archi bendpoints are given relative to center of the connections source and target
 *  - coordinates of Dagre points are absolute to the diagram
 *
 * @param {object} edge - graph edge
 * @param {object} connection - Archi connection
 * @param {boolean} reversed - edge is reversed
 */
function addBendpoints(edge, connection, reversed) {
  _logDebugMessage.push(false);

  let srcCenter = calcCenter(connection.source);
  let tgtCenter = calcCenter(connection.target);

  let bendpoints = [];
  let points = graph.edge(edge).points;

  // skip first and last point. These are not bendpoints, but connecting points on the edge of the node
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(calcBendpoint(points[i], srcCenter, tgtCenter));
  }

  // finaly add the calculated bendpoint to the Archi connection
  for (let i = 0; i < bendpoints.length; i++) {
    if (reversed) {
      connection.addRelativeBendpoint(bendpoints[bendpoints.length - i - 1], i);
    } else {
      connection.addRelativeBendpoint(bendpoints[i], i);
    }
  }
  _logDebugMessage.pop();
}

function calcBendpoint(point, srcCenter, tgtCenter) {
  let bendpoint = {
    startX: parseInt(point.x - srcCenter.x),
    startY: parseInt(point.y - srcCenter.y),
    endX: parseInt(point.x - tgtCenter.x),
    endY: parseInt(point.y - tgtCenter.y),
  };

  debug(`point: "x"=${point.x} "y"=${point.y}`);
  debug(`bendpoint: ${JSON.stringify(bendpoint)}`);

  return bendpoint;
}

// get the absolute coordinates of the center of the element
function calcCenter(element) {
  let center = {};
  center.x = element.bounds.x + element.bounds.width / 2;
  center.y = element.bounds.y + element.bounds.height / 2;

  shiftNesting(element, center);

  debug(`bounds "${element}"=${JSON.stringify(element.bounds)}`);
  debug(`center "${element}"=${JSON.stringify(center)}`);

  center.x = parseInt(center.x);
  center.y = parseInt(center.y);
  return center;

  // recursive function
  // if element is nested, coordinates are relative to the parent (and parent's parent)
  function shiftNesting(element, center) {
    let parent = $(element).parent().filter("element").first();
    if (parent) {
      // debug(`coordinates relative to parent ${parent} `);
      center.x += parent.bounds.x;
      center.y += parent.bounds.y;
      shiftNesting(parent, center);
    }
  }
}

function addCircularBendpoints(edge, connection) {
  // relative coordinates from center of element to top right corner
  let rightTopX = connection.source.bounds.width / 2;
  let rightTopY = connection.source.bounds.height / 2;
  let rightX = rightTopX + 40;
  let down_Y = -rightTopY + 20;
  let left_X = rightTopX - 20;
  let up___Y = -rightTopY - 20;

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
    var method =
      Packages.com.archimatetool.script.dom.model.ArchimateDiagramModelProxy.class.getDeclaredMethod("getEObject");
    method.setAccessible(true);
    var v = method.invoke(view);
    Packages.com.archimatetool.editor.ui.services.EditorManager.openDiagramEditor(v);
  } catch (e) {
    console.error(`"Failed to open ${view}. You may open it manually`);
  }
}
