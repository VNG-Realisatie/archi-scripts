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
 *     nodejs modules:
 *      jvm-npm:  https://github.com/nodyn/jvm-npm
 *      dagre with cluster fix:
 *       see https://github.com/dagrejs/dagre and
 *       download from https://unpkg.com/dagre-cluster-fix/
 *
 *  #  date    Author      Comments
 *  1  28/01/2019  Hervé Jouin   File creation.
 *  2  03/04/2021  Mark Backer   Some more parameters and restructure.
 *  3  25/09/2021  Mark Backer   use dagre-cluster-fix version
 *  4  02/10/2021  Mark Backer   draw connection with bendpoints
 *
 * Limitations
 * - relationships on relationships are not drawn, they are skipped
 * - layout of connections can be ugly (but for simple layouts it's good)
 * - generating views with 'nested' relations is not stable
 *    - with many nesting, dagre layout sometimes throws an error (a bug in this script or dagre-cluster-fix)
 *    - try with less nested relations or split your set of concepts ..
 */
const GENERATE_SINGLE = "single";
const GENERATE_MULTIPLE = "multiple";
const EXPAND_HERE = "expand";
const LAYOUT = "layout";

const GENERATED_VIEW_FOLDER = "_Generated";

const ARROW_DELIMITER = "_";
const ARROW_REVERSED = "<-";

// For allignment with the grid use the following settings in Archi
//  - go to Edit > Preferences > Diagram: set grid = 10
//  - go to Edit > Preferences > Diagram > Appearance: set figure width=141 and height=61
// or change the default width and height here
const NODE_WIDTH = 140; // width of a drawn element
const NODE_HEIGHT = 60; // height of a drawn element

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
 * generate and layout an ArchiMate view
 *
 * Configure the behavior of generate_view with the param object properties:
 *
 * What ArchiMate object types to include the view
 *  action (optional, default is GENERATE_SINGLE)
 *    Generate one or multiple views
 *      - GENERATE_SINGLE   generate a view with the selected elements and THEIR related elements (add elements and relations <graphDepth> relations deep)
 *      - GENERATE_MULTIPLE generate a view for every selected element and ITS related elements (add elements and relations <graphDepth> relations deep)
 *      - EXPAND_HERE expand in the view the selected element(s) with their related elements (add elements and relations 1 relation deep)
 *      - LAYOUT      layout the selected view. Do not add elements or relations
 *
 *  graphDepth (optional, default is 0)
 *    Add elements and relation to the selection <graphDepth> relation deep
 *    Used for the GENERATE_SINGLE and GENERATE_MULTIPLE actions
 *      - integer -  number of relations to follow
 *
 *  elementFilter (optional, default is no filter)
 *    Archimate concept types that will be included in the view
 *    -  [] (empty array) all concept types are included
 *    -  [type, type, ...]  array of concept types like business-actor, application-component, technology-collaboration, node, ...
 *
 *  relationFilter (optional, default is no filter)
 *    The relationship types that will be included in the view.
 *      - [] (empty array)  all relationship types in the model
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *
 *  viewName (optional, default is "<name of first selected element> (generated)")
 *    Name of the view to create.
 *    Used for the GENERATE_SINGLE action
 *      - string - viewname
 *
 * How to draw certain relation types
 *  drawReversed (optional, default none)
 *    The relationship types which are reversed in the layout. The Archi relations are not changed.
 *      - [] (empty array)  no relationships are reversed
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *  drawNested (optional, default none)
 *    The relationship types that will be rendered nested (target elements (children) are embedded in the source element (parent))
 *      - [] (empty array)  no relationships are nested
 *      - [type, type, ...]  array of relationship types like realization-relationship,assignment-relationship, ...
 *
 * Layout options for dagre
 *  graphDirection (optional, default "TB")
 *    Direction of the graph.
 *        TB    Top-Bottom
 *        BT    Bottom-Top
 *        LR    Left-Right
 *        RL    right-Left
 *  graphAlign (optional, default is none which centers de graph)
 *    Alignment of the graph.
 *        UL    Up Left
 *        UR    Up Right
 *        DL    Down Left
 *        DR    Down Right
 *  nodeWidth: (optional, default NODE_WIDTH)
 *    The width of a drawn element
 *    - integer - Number of pixels for the width
 *  nodeHeight: (optional, default NODE_HEIGHT)
 *    The height of a drawn element
 *    - integer - number of pixels for the height
 *  hSep (optional, defaults to 50)
 *    The horizontal distance between two drawn elements
 *    - integer - number of pixels that separate nodes horizontally
 *  vSep (optional, defaults to 50)
 *    The vertical distance between two drawn elements
 *    - integer - number of pixels that separate nodes vertically
 *
 * For jArchi script development
 *  debug (optional, default is false)
 *  - Print debug messages on the console
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  if (param.debug == undefined) param.debug = false;
  debugStackPush(param.debug);

  try {
    if (setDefaultParameters(param)) {
      let filteredElements = selectElements(param);

      switch (param.action) {
        case GENERATE_SINGLE:
        case EXPAND_HERE:
        case LAYOUT:
          // generate one view
          layoutAndRender(param, filteredElements);
          break;

        case GENERATE_MULTIPLE:
          // generate multiple views
          console.log(`\n== Generating ${filteredElements.length} views ==`);

          filteredElements.forEach(function (e) {
            // set viewname to the element name
            param.viewName = e.name;
            console.log(`- ${param.viewName}`);
            layoutAndRender(param, $(e));
          });
          break;

        default:
          break;
      }
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  debugStackPop();
}

function layoutAndRender(param, startElements) {
  createGraph(param);
  fillGraph(param, startElements);
  layoutGraph(param);
  drawView(param);
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function setDefaultParameters(param) {
  let validFlag = true;

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

  if (param.action == undefined) param.action = GENERATE_SINGLE;

  console.log("Function called with parameters");
  if (!validArchiConcept(param.elementFilter, ELEMENT_NAMES, "elementFilter", "no filter")) validFlag = false;
  if (!validArchiConcept(param.relationFilter, RELATION_NAMES, "relationFilter", "no filter")) validFlag = false;
  if (!validArchiConcept(param.drawReversed, RELATION_NAMES, "drawReversed", "none")) validFlag = false;
  if (!validArchiConcept(param.drawNested, RELATION_NAMES, "drawNested", "none")) validFlag = false;
  console.log(`- viewName = ${param.viewName}`);
  console.log("- graphDepth = " + param.graphDepth);
  console.log("- graphDirection = " + param.graphDirection);
  console.log("- graphAlign (undefined is middle) = " + param.graphAlign);
  console.log("- algorithm = " + param.algorithm);
  console.log("- nodeWidth = " + param.nodeWidth);
  console.log("- nodeHeight = " + param.nodeHeight);
  console.log("- hSep = " + param.hSep);
  console.log("- vSep = " + param.vSep);
  console.log("- action = " + param.action);
  console.log("- debug = " + param.debug);

  if (!validFlag) console.error("\nCorrect the invalid type names logged in red");
  return validFlag;
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
      .each((child) => addElementInList(list, child));
    return list;
  }

  // create an array with the selected elements
  var selectedElements = [];
  // if ($(selection).first().type === "archimate-model") {
  //   selectedElements = $("element");
  // } else {
  $(selection).each((obj) => addElementInList(selectedElements, obj));
  // }
  console.log(`\nSelection:`);
  console.log(`- ${selectedElements.length} selected elements`);

  // filter the selected elements with the concept filter
  let filteredElements = selectedElements.filter((obj) => filter_object_type(obj, param.elementFilter));
  console.log(`- ${filteredElements.length} filtered elements kept`);
  if (filteredElements.length === 0) throw "No Archimate element match your criterias.";

  return filteredElements;
}

/**
 * create a graph with the param settings
 *
 * @param {object} param
 * @returns
 */
function createGraph(param) {
  graphLayout = new Object();
  graphLayout.marginx = 10;
  graphLayout.marginy = 10;

  // if parameter is not set, there is a dagre default
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
function fillGraph(param, startElements) {
  console.log(`Adding elements and relations to the graph with a depth of ${param.graphDepth}...`);

  let selectedView;
  let obj = $(selection).first();
  if (obj.type == "archimate-diagram-model") {
    selectedView = obj;
  } else {
    if (obj.concept.id != obj.id) selectedView = obj.view;
  }
  // console.log(`obj = ${obj}, selectedView = ${selectedView}`);

  let startLevel = 0;
  switch (param.action) {
    case GENERATE_SINGLE:
    case GENERATE_MULTIPLE:
      // add selected and related elements to the graph
      startElements.forEach((archiEle) => {
        addElement(startLevel, param, archiEle, startElements);
      });
      break;
    case EXPAND_HERE:
      if (selectedView) {
        console.log("expand selected objects on the view");

        // add all object of the view to the graph
        addViewObjects(param, selectedView);

        // and expand selected and related elements to the graph
        startElements.forEach((archiEle) => {
          addElement(startLevel, param, archiEle, startElements);
        });
        param.viewName = selectedView.name
      } else {
        throw "No view elements selected. For the EXPAND_HERE action, select one or more elements on a view";
      }
      break;
    case LAYOUT:
      // check if view or object on a view is selected
      if (selectedView) {
        console.log("only layout objects on the view");

        // add all object of the view to the graph
        addViewObjects(param, selectedView);
        param.viewName = selectedView.name
      } else {
        throw "No view selected. For the LAYOUT action, select a view or an object on a view";
      }
      break;

    default:
      break;
  }

  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  if (graphParents.length > 0) console.log(`- ${graphParents.length} parent-child nestings`);
}

function addViewObjects(param, selectedView) {
  $(selectedView)
    .find("element")
    .each((e) => {
      // add all selected elements to the graph
      debug(`> element ${e}`);
      graph.setNode(e.concept.id, { label: e.name, width: param.nodeWidth, height: param.nodeHeight });
    });
  $(selectedView)
    .find("relation")
    .each((r) => addRelation(0, r.concept));
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
 * @param {*} startElements array with elements to draw
 */
function addElement(level, param, archiEle, startElements) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  // stop if the graphDepth is reached
  // depth=0 means generate a view with selected elements only;
  // to add relations between selected elements you need to recurse once (until level=1)
  let graphDepth = param.graphDepth;
  if ((graphDepth > 0 && level > graphDepth) || (graphDepth == 0 && level > 1)) {
    debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${graphDepth}`);
    return STOPPED;
  }

  if (!graph.hasNode(archiEle.id)) {
    // create a node for the element
    graph.setNode(archiEle.id, { label: archiEle.name, width: param.nodeWidth, height: param.nodeHeight });
    debug(`${"  ".repeat(level)}> Added ${archiEle}`);
  } else {
    debug(`${"  ".repeat(level)}> Skip; already added ${archiEle}`);
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
          debug(`${"  ".repeat(level)}> In going relation; ${rel} <- ${related_element}`);
        } else {
          debug(`${"  ".repeat(level)}> Out going relation; ${rel} -> ${related_element}`);
        }

        // if graphDepth=0; check if related_element is in the selection
        if (graphDepth == 0 && startElements.filter((e) => related_element.id == e.id).length < 1) {
          debug(`${"  ".repeat(level)}> Skip; not in selection ${related_element}`);
        } else {
          // check if the related_element is in the concepts filter
          if (filter_object_type(related_element, param.elementFilter)) {
            // add related_element to the graph
            if (addElement(level + 1, param, related_element, startElements) == NOT_STOPPED) {
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
  // rel = r.concept
  let relSrc = $(rel).sourceEnds().first();
  let relTgt = $(rel).targetEnds().first();

  let arrow = "->";
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
      createEdgeForRelation(level, relSrc, relTgt, rel, arrow, rel_line);
      console.log(`${"  ".repeat(level)}> NOT NESTED circular relation ${rel_line}`);
    } else {
      createParentForRelation(level, relSrc, relTgt, rel, arrow);
    }
  } else {
    createEdgeForRelation(level, relSrc, relTgt, rel, arrow, rel_line);
  }
}

function createEdgeForRelation(level, relSrc, relTgt, rel, arrow, rel_line) {
  let edge_name = rel.id;
  if (!graph.hasEdge(relSrc.id, relTgt.id, edge_name)) {
    let edge_label = { label: `${arrow}${ARROW_DELIMITER}${rel.id}` };
    graph.setEdge(relSrc.id, relTgt.id, edge_label, edge_name);
    debug(`${"  ".repeat(level)}> Added relation ${arrow} ${rel_line}`);
  } else {
    debug(`${"  ".repeat(level)}> Skip, edge already in graph ${arrow} ${rel_line}`);
  }
}

function createParentForRelation(level, parent, child, rel, arrow) {
  debug(`${"  ".repeat(level)}> graph.parent(child.id)=${graph.parent(child.id)}`);
  debug(`${"  ".repeat(level)}> parent.id=${parent.id}`);

  // check if relation is already added
  if (!graphParents.some((r) => r.id == rel.id)) {
    // save parent relation
    graphParents.push(rel);

    graph.setParent(child.id, parent.id);
    debug(`${"  ".repeat(level)}> Added child->parent = ${child} -> ${parent} (${rel})`);
  } else {
    debug(`${"  ".repeat(level)}> Skip child->parent, already in graph = ${child} -> ${parent} (${rel})`);
  }
  return;
}

function filter_object_type(o, filterArray) {
  if (filterArray.length == 0) return true;
  return filterArray.includes(o.type);
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
  graph.nodes().forEach((nodeId) => drawElement(nodeId, nodeIndex, archiViewElement, view));

  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach((edge) => drawRelation(edge, archiViewElement, view));

  console.log("Adding child-parent relations to the view ...");
  graphParents.forEach((parentRel) => drawNestedConnection(parentRel, archiViewElement, view));

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  open_view(view);
}

function getFolder(mainFolderName, folderName) {
  // let mainFolder = $(model).children(`.${mainFolderName}`).first();
  let mainFolder = $(`folder.${mainFolderName}`).first();
  let folder = $(mainFolder).children("folder").filter(`.${folderName}`).first();

  if (!folder) {
    folder = mainFolder.createFolder(folderName);
    console.log(`Created ${folder}`);
  }
  return folder;
}

function getView(folder, viewName) {
  // check if the corresponding view already exists in the given folder
  let view = $(folder).children("view").filter(`.${viewName}`).first();

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

function drawElement(nodeId, nodeIndex, archiViewElement, view) {
  debugStackPush(param.debug);
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

        debug(`>> draw ${archiElement}`);
        let elePos = calcElement(node);
        archiViewElement[nodeId] = view.add(archiElement, elePos.x, elePos.y, elePos.width, elePos.height);
      } else {
        // first add the parent to the view (the function checks if it's already drawn)
        drawElement(parentId, nodeIndex, archiViewElement, view);

        // draw element in parent
        let parentNode = graph.node(parentId);
        let archiParent = archiViewElement[parentId];

        // calculate the position within the parent
        let y_shift = 10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 0;

        debug(`>> draw nested ${archiElement} in parent ${archiParent}`);
        let elePos = calcNestedElement(node, parentNode);
        archiViewElement[nodeId] = archiParent.add(
          archiElement,
          elePos.x,
          elePos.y + y_shift,
          elePos.width,
          elePos.height
        );
      }
    } catch (e) {
      console.error("-->" + e + "\n" + e.stack);
    }
  }
  debugStackPop();
}

// calculate the absolute coordinates of the left upper corner of the node
function calcElement(node) {
  let elePos = calcElementExact(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  debug(`>> coördinates (${JSON.stringify(elePos)}`);

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
function drawRelation(edge, archiViewElement, view) {
  debugStackPush(param.debug);

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

  // check for a circular relation
  if (archiRelation.source.id == archiRelation.target.id) {
    drawCircularBendpoints(edge, connection);
  } else {
    drawBendpoints(edge, connection, arrow === ARROW_REVERSED);
  }
  debugStackPop();
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
function drawNestedConnection(parentRel, archiViewElement, view) {
  debug(`parentRel: ${parentRel}`);
  let connection = view.add(parentRel, archiViewElement[parentRel.source.id], archiViewElement[parentRel.target.id]);
}

/**
 * add bendpoints to an Archi connection
 *
 * calculate Archi bendpoint coordinates from a Dagre point
 *  - coordinates of Dagre points are absolute to the diagram
 *  - coordinates of Archi bendpoints are given relative to center of the connections source and target
 *
 * @param {object} edge - graph edge
 * @param {object} connection - Archi connection
 * @param {boolean} reversed - edge is reversed
 */
function drawBendpoints(edge, connection, reversed) {
  debugStackPush(false);

  let srcCenter = calcCenter(connection.source);
  let tgtCenter = calcCenter(connection.target);

  let bendpoints = [];
  let points = graph.edge(edge).points;

  debug(`dagre points: ${JSON.stringify(points)}`);

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
  debugStackPop();
}

function calcBendpoint(point, srcCenter, tgtCenter) {
  let bendpoint = {
    startX: parseInt(point.x - srcCenter.x),
    startY: parseInt(point.y - srcCenter.y),
    endX: parseInt(point.x - tgtCenter.x),
    endY: parseInt(point.y - tgtCenter.y),
  };

  debug(`dagre point: ${JSON.stringify(point)}`);
  debug(`Archi bendpoint: ${JSON.stringify(bendpoint)}`);

  return bendpoint;
}

// get the absolute coordinates of the center of the element
function calcCenter(element) {
  let center = {};
  center.x = element.bounds.x + element.bounds.width / 2;
  center.y = element.bounds.y + element.bounds.height / 2;

  shiftNesting(element, center);

  // debug(`bounds ${element}=${JSON.stringify(element.bounds)}`);
  // debug(`center ${element}=${JSON.stringify(center)}`);

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

/**
 * add bendpoints for drawing a circular connection
 *
 * dagre bendpoints for circular relations are ugly
 * quick fix:
 * - ignore edge points
 * - set Archi bendpoints for drawing a 'circle' at the top right corner
 * fingers crossed there's only one circular relation ..
 *
 * @param {object} edge - graph edge
 * @param {object} connection - Archi connection
 */
function drawCircularBendpoints(edge, connection) {
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

function validArchiConcept(paramList, validNames, label, emptyLabel) {
  let validFlag = true;

  console.log(`- ${label}`);
  if (paramList.length == 0) {
    console.log(`  - ${emptyLabel}`);
  } else {
    paramList.forEach(function (p) {
      if (validNames.includes(p)) {
        console.log(`  - ${p}`);
      } else {
        console.error(`  - ${p}`);
        validFlag = false;
      }
    });
  }
  return validFlag;
}

const ELEMENT_NAMES = [
  "application-collaboration",
  "application-component",
  "application-event",
  "application-function",
  "application-interaction",
  "application-interface",
  "application-process",
  "application-service",
  "artifact",
  "assessment",
  "business-actor",
  "business-collaboration",
  "business-event",
  "business-function",
  "business-interaction",
  "business-interface",
  "business-object",
  "business-process",
  "business-role",
  "business-service",
  "canvas-model-block",
  "canvas-model-image",
  "canvas-model-sticky",
  "capability",
  "communication-network",
  "constraint",
  "contract",
  "course-of-action",
  "data-object",
  "deliverable",
  "device",
  "diagram-model-connection",
  "diagram-model-group",
  "diagram-model-image",
  "diagram-model-note",
  "diagram-model-reference",
  "distribution-network",
  "driver",
  "equipment",
  "facility",
  "gap",
  "goal",
  "grouping",
  "implementation-even",
  "junction",
  "location",
  "material",
  "meaning",
  "node",
  "outcome",
  "path",
  "plateau",
  "principle",
  "product",
  "representation",
  "requirement",
  "resource",
  "sketch-model-actor",
  "sketch-model-sticky",
  "stakeholder",
  "system-software",
  "technology-collaboration",
  "technology-event",
  "technology-function",
  "technology-interaction",
  "technology-interface",
  "technology-process",
  "technology-service",
  "value",
  "work-package",
];

const RELATION_NAMES = [
  "access-relationship",
  "aggregation-relationship",
  "assignment-relationship",
  "association-relationship",
  "composition-relationship",
  "flow-relationship",
  "influence-relationship",
  "realization-relationship",
  "serving-relationship",
  "specialization-relationship",
  "triggering-relationship",
];
