/**
 * jArchi function for generating and auto layout of an Archi view
 *
 * Use cases:
 * - quickly generate a starting point for a new view
 * - generate multiple context views (one element and all its related elements)
 * - analyse your model by generating different views
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
 *  2  03/04/2021  Mark Backer   Restructure and add parameters
 *  3  25/09/2021  Mark Backer   use dagre-cluster-fix version
 *  4  02/10/2021  Mark Backer   draw connection with bendpoints
 *  5  08/03/2022  Mark Backer   add actions LAYOUT and EXPAND_HERE
 *
 * Prefered settings
 * - use the jArchi JavaScript engine GraalVM, much faster with large graphs
 *   - go to Edit > Preferences > Scripting: JavaScript engine: GraalVM
 * - for allignment with the grid use the following settings in Archi
 *   - go to Edit > Preferences > Diagram: set grid = 10
 *   - go to Edit > Preferences > Diagram > Appearance: set figure width=141 and height=61
 *
 * Limitations
 * - relationships on relationships are not drawn, they are skipped
 * - layout of connections can be ugly (but for simple layouts it's good)
 * - layout of circular relations on a parent not supported (dagre throws an error)
 */

const GENERATE_SINGLE = "GENERATE_SINGLE";
const GENERATE_MULTIPLE = "GENERATE_MULTIPLE";
const EXPAND_HERE = "EXPAND_HERE";
const LAYOUT = "LAYOUT";

// default settings for generated views
const GENERATED_VIEW_FOLDER = "_Generated"; // generated views are created in this folder
const NODE_WIDTH = 140; // width of a drawn element
const NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

// polyfill for array method includes(), which is not supported in Nashorn ES6
if (!Array.prototype.includes) {
  Array.prototype.includes = function (search) {
    return !!~this.indexOf(search);
  };
}

var graph; // graphlib graph for layout view
var graphParents = []; // Workaround for missing API graph.parents() and graph.parentsCount()

/**
 * Where to find the required dagre-cluster-fix module?
 * Use nodeJS
 * - npm install dagre-cluster-fix
 * Or go to https://unpkg.com/dagre-cluster-fix/
 * - download from the folder /dist the file dagre.js and copy it in the scripts folder
 */
try {
  // here the dagre.js file is located in the folder '_lib' next to this scripts folder
  load(__DIR__ + "../_lib/jvm-npm.js");
  require.addPath(__DIR__);
  var dagre = require("../_lib/dagre");

  console.log(`Dagre version:`);
  console.log(`- dagre:    ${dagre.version}`); // dagre-cluster-fix shows wrong version, should be 0.9.3
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw "\nDagre module not loaded";
}

var DEBUG;

/**
 * generate and layout an ArchiMate view
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  if (param.debug == undefined) param.debug = false;
  const DEBUG = param.debug;

  debugStackPush(DEBUG);

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

function layoutAndRender(param, filteredElements) {
  createGraph(param);
  fillGraph(param, filteredElements);
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

  console.log("Generate view parameters");
  if (param.action == undefined) param.action = GENERATE_SINGLE;
  console.log("- action = " + param.action);
  if (param.graphDepth === undefined) param.graphDepth = 1;
  console.log("- graphDepth = " + param.graphDepth);

  if (!validArchiConcept(param.elementFilter, ELEMENT_NAMES, "elementFilter:", "no filter")) validFlag = false;
  if (param.elementFilter === undefined) param.elementFilter = [];
  if (!validArchiConcept(param.relationFilter, RELATION_NAMES, "relationFilter:", "no filter")) validFlag = false;
  if (param.relationFilter === undefined) param.relationFilter = [];
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`- viewName = ${param.viewName}`);

  console.log("How to draw relationships");
  if (!validArchiConcept(param.drawReversed, RELATION_NAMES, "drawReversed:", "none")) validFlag = false;
  if (param.drawReversed === undefined) param.drawReversed = [];
  if (!validArchiConcept(param.drawNested, RELATION_NAMES, "drawNested:", "none")) validFlag = false;
  if (param.drawNested === undefined) param.drawNested = [];

  console.log("Developing");
  console.log("- debug = " + DEBUG);

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

  // create an array with the selected elements
  var selectedElements = [];
  $(selection).each((obj) => addElementInList(obj, selectedElements));

  console.log(`\nSelection:`);
  console.log(`- ${selectedElements.length} elements selected`);

  // filter the selected elements with the concept filter
  let filteredElements = selectedElements.filter((obj) => filterObjectType(obj, param.elementFilter));
  console.log(`- ${filteredElements.length} elements after filtering`);
  if (filteredElements.length === 0) throw "No Archimate element match your criterias.";

  return filteredElements;
}

/**
 * recursive function
 *   add the selected elements in a list.
 *   if element is a container (model, view or folder), all contained elements are added
 */
function addElementInList(obj, list) {
  if ($(obj).is("element")) {
    let o = concept(obj);
    // check for duplicates, than add element to the list
    if (list.findIndex((a) => a.id == o.id) == -1) list.push(o);
  }
  $(obj)
    .children()
    .each((child) => addElementInList(child, list));
  return list;
}

function concept(o) {
  return o.concept ? o.concept : o;
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

  // settings for dagre layout
  // if parameter is undefined, dagre uses a default
  console.log("\nDagre layout parameters");
  if (param.graphDirection !== undefined) graphLayout.rankdir = param.graphDirection;
  console.log("- graphDirection = " + param.graphDirection);
  if (param.graphAlign !== undefined) graphLayout.align = param.graphAlign;
  console.log("- graphAlign (undefined is middle) = " + param.graphAlign);
  if (param.ranker !== undefined) graphLayout.ranker = param.ranker;
  console.log("- ranker = " + param.ranker);
  if (param.nodeWidth == undefined) param.nodeWidth = NODE_WIDTH;
  console.log("- nodeWidth = " + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = NODE_HEIGHT;
  console.log("- nodeHeight = " + param.nodeHeight);
  if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
  console.log("- hSep = " + param.hSep);
  if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
  console.log("- vSep = " + param.vSep);

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
function fillGraph(param, filteredElements) {
  const START_LEVEL = 0;
  let selectedView = getSelectedView();

  switch (param.action) {
    case GENERATE_SINGLE:
    case GENERATE_MULTIPLE:
      console.log(`\nAdding elements and relations to the graph with a depth of ${param.graphDepth}...`);
      filteredElements.forEach((archiEle) => {
        addElement(START_LEVEL, param, archiEle, filteredElements);
      });
      break;
    case EXPAND_HERE:
      console.log("Expand selected objects on the view");
      addViewObjects(START_LEVEL, param, selectedView);
      // expand the view from the selected elements
      filteredElements.forEach((archiEle) => addElement(START_LEVEL, param, archiEle, filteredElements));
      param.viewName = selectedView.name;
      break;
    case LAYOUT:
      console.log("Layout objects on the view");
      addViewObjects(START_LEVEL, param, selectedView);
      param.viewName = selectedView.name;
      break;

    default:
      break;
  }
  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  if (graphParents.length > 0) console.log(`- ${graphParents.length} parent-child nestings`);
}

/**
 * get the selected view or the view of selected objects
 * @returns Archi view object
 */
function getSelectedView() {
  let selectedView;
  let obj = $(selection).first();
  if (obj.type == "archimate-diagram-model") {
    selectedView = obj;
  } else {
    if (obj.view) selectedView = obj.view;
  }
  if (!selectedView) throw "No view or view elements selected. Select one or more elements on a view";
  return selectedView;
}

/**
 * Add all elements and relations of the given view to the graph
 */
function addViewObjects(level, param, view) {
  $(view)
    .find("element")
    .each((e) => createNode(level, param, e));
  $(view)
    .find("relation")
    .filter((rel) => rel.source.id != rel.target.id) // filter circular relations
    .filter((rel) => $(rel).sourceEnds().is("element")) // skip relations with relations
    .filter((rel) => $(rel).targetEnds().is("element")) // skip relations with relations
    .each((r) => addRelation(0, param, r.concept));

  // add circular relations last. all parent-child relations have to be set
  $(view)
    .find("relation")
    .filter((rel) => rel.source.id == rel.target.id)
    .each((r) => addRelation(0, param, r.concept));
}

/**
 * main recursive function
 *   add the given element to the graph and
 *   recurse into the elements related elements
 *
 * graphDepth=0 generates a view with the selected elements and the elements relations
 * graphDepth=1 generates a view with the selected elements, all related elements and their relations
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} param settings for generating a view
 * @param {object} archiEle Archi element to add to graph
 * @param {array} filteredElements array with Archi elements to draw
 */
function addElement(level, param, archiEle, filteredElements) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  // stop recursion when the recursion level is larger then the graphDepth
  let graphDepth = param.graphDepth;
  if ((graphDepth > 0 && level > graphDepth) || (graphDepth == 0 && level > 1)) {
    debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${graphDepth}`);
    return STOPPED;
  }
  // add element to the graph
  createNode(level, param, archiEle);

  $(archiEle)
    .rels()
    .filter((rel) => filterObjectType(rel, param.relationFilter))
    .filter((rel) => rel.source.id != rel.target.id) // filter circular relations
    .filter((rel) => $(rel).sourceEnds().is("element")) // skip relations with relations
    .filter((rel) => $(rel).targetEnds().is("element")) // skip relations with relations
    .each(function (rel) {
      let related_element;
      if (archiEle.id == rel.target.id) {
        related_element = rel.source;
        debug(`${"  ".repeat(level)}> In going relation; ${rel} <- ${related_element}`);
      } else {
        related_element = rel.target;
        debug(`${"  ".repeat(level)}> Out going relation; ${rel} -> ${related_element}`);
      }

      // for graphDepth=0 add all selected elements and their relations
      if (graphDepth == 0 && filteredElements.filter((e) => e.id == related_element.id).length < 1) {
        debug(`${"  ".repeat(level)}> Skip; not in selection ${related_element}`);
      } else {
        // check if the related_element is in the concepts filter
        if (filterObjectType(related_element, param.elementFilter)) {
          // add related_element to the graph (and recurse into its related elements)
          if (addElement(level + 1, param, related_element, filteredElements) == NOT_STOPPED) {
            // Add relation as edge
            addRelation(level, param, rel);
          }
        }
      }
    });
  // now add circular relations
  $(archiEle)
    .rels()
    .filter((rel) => filterObjectType(rel, param.relationFilter))
    .filter((rel) => rel.source.id == rel.target.id)
    .each(function (rel) {
      addRelation(level, param, rel);
    });
  return NOT_STOPPED;
}

/**
 * Add the given element as a node to the graph
 *
 * @param {object} archiEle Archi object
 */
function createNode(level, param, archiEle) {
  if (!graph.hasNode(archiEle.id)) {
    e = concept(archiEle);
    if (e.type == "junction")
      graph.setNode(e.id, { label: e.name, width: JUNCTION_DIAMETER, height: JUNCTION_DIAMETER });
    else graph.setNode(e.id, { label: e.name, width: param.nodeWidth, height: param.nodeHeight });
    debug(`${"  ".repeat(level)}> Added ${archiEle}`);
  } else {
    debug(`${"  ".repeat(level)}> Skip; already added ${archiEle}`);
  }
}

/**
 * Add the given relation to the graph
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} rel Archi relation
 */
function addRelation(level, param, rel) {
  if (rel.source.id == rel.target.id) {
    createCircularEdge(level, param, rel);
  } else {
    if (param.drawNested.includes(rel.type)) {
      createParent(level, param, rel);
    } else {
      createEdge(level, param, rel);
    }
  }
}

/**
 * Add the given cicular relation to the graph
 */
function createCircularEdge(level, param, rel) {
  if (rel.source.id != rel.target.id) throw "circular with different source and targer";
  let relSourceTarget = rel.source; // source and target are equal
  let rel_line = `<-${rel.type}-> ${relSourceTarget.name}`;

  if (!graph.hasEdge(relSourceTarget.id, relSourceTarget.id, rel.id)) {
    // dagre layout throws an error for circular relation on a parent
    // workaround: find out if the relations source is a parent
    if (isNotParent(relSourceTarget)) {
      graph.setEdge(relSourceTarget.id, relSourceTarget.id, { label: rel.id });
      debug(`${"  ".repeat(level)}> Added circular relation: ${rel_line}`);
    } else {
      console.log(`${"  ".repeat(level)}> Skip, circular relation at parent not supported: ${rel_line}`);
    }
  } else {
    debug(`${"  ".repeat(level)}> Skip, circular relation already in graph ${rel_line}`);
  }
}

function isNotParent(relSourceTarget) {
  debug(`nr of graph.children(${relSourceTarget.name}): ${graph.children(relSourceTarget.id).length}`);
  if (graph.children(relSourceTarget.id).length > 0) return false;
  else return true;
}

/**
 * Add the given relation to the graph
 */
function createEdge(level, param, rel) {
  let rel_line;
  // reverse the graph edge for given Archi relation types
  if (param.drawReversed.includes(rel.type)) {
    if (!graph.hasEdge(rel.target.id, rel.source.id, rel.id)) {
      graph.setEdge(rel.target.id, rel.source.id, { label: rel.id });
      rel_line = `${rel.target.name} <-${rel.type}-- ${rel.source.name}`;
    }
  } else {
    if (!graph.hasEdge(rel.source.id, rel.target.id, rel.id)) {
      graph.setEdge(rel.source.id, rel.target.id, { label: rel.id });
      rel_line = `${rel.source.name} --${rel.type}-> ${rel.target.name}`;
    }
  }

  if (rel_line) debug(`${"  ".repeat(level)}> Added relation ${rel_line}`);
  else debug(`${"  ".repeat(level)}> Skip, edge already in graph ${rel_line}`);
}

/**
 * Add the given relation as a parent/child to the graph
 */
function createParent(level, param, rel) {
  let rel_line;
  // check if relation is already added
  if (!graphParents.some((r) => r.id == rel.id)) {
    // save parent relation
    graphParents.push(rel);

    if (param.drawReversed.includes(rel.type)) {
      graph.setParent(rel.target.id, rel.source.id);
      rel_line = `Parent <- Child: ${rel.target.name} <-${rel.type}-- ${rel.source.name}`;
    } else {
      graph.setParent(rel.source.id, rel.target.id);
      rel_line = `Parent -> Child: ${rel.source.name} --${rel.type}-> ${rel.target.name}`;
    }
    debug(`${"  ".repeat(level)}> Added child->parent = ${rel_line}`);
  } else {
    debug(`${"  ".repeat(level)}> Skip child->parent, already in graph = ${rel_line}`);
  }
  return;
}

function filterObjectType(o, filterArray) {
  if (filterArray.length == 0) return true;
  return filterArray.includes(o.type);
}

function layoutGraph(param) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (DEBUG) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function drawView(param) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = getFolder("Views", GENERATED_VIEW_FOLDER);
  let view = getView(folder, param.viewName);

  let archiViewElement = new Object();
  let nodeIndex = {};

  console.log("Drawing graph nodes as elements ...");
  graph.nodes().forEach((nodeId) => drawElement(param, nodeId, nodeIndex, archiViewElement, view));

  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach((edge) => drawRelation(param, edge, archiViewElement, view));

  if (graphParents.length > 0) console.log("Adding child-parent relations to the view ...");
  graphParents.forEach((parentRel) => drawNestedConnection(parentRel, archiViewElement, view));

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  openView(view);
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

function drawElement(param, nodeId, nodeIndex, archiViewElement, view) {
  debugStackPush(DEBUG);
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
        drawElement(param, parentId, nodeIndex, archiViewElement, view);

        // draw element in parent
        let parentNode = graph.node(parentId);
        let archiParent = archiViewElement[parentId];

        // calculate the position within the parent
        let y_shift = 10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 0;

        debug(`>> draw nested ${archiElement} in parent ${archiParent}`);
        let elePos = calcElementNested(node, parentNode);
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
  let elePos = calcElementPosition(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  debug(`>> coördinates (${JSON.stringify(elePos)}`);

  return elePos;
}

// calculate the relative coordinates of the node to the parent
function calcElementNested(node, parentNode) {
  let nestedPos = calcElementPosition(node);
  debug(`>> element (${JSON.stringify(nestedPos)}`);
  let parentPos = calcElementPosition(parentNode);
  debug(`>> parent (${JSON.stringify(parentPos)}`);

  nestedPos.x = parseInt(nestedPos.x - parentPos.x);
  nestedPos.y = parseInt(nestedPos.y - parentPos.y);

  debug(`>> nested element (relative to parent) (${JSON.stringify(nestedPos)}`);

  return nestedPos;
}

function calcElementPosition(node) {
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
function drawRelation(param, edge, archiViewElement, view) {
  debugStackPush(DEBUG);

  let archiRelation = $("#" + graph.edge(edge).label).first();
  debug(`archiRelation: ${archiRelation}`);

  let connection = view.add(
    archiRelation,
    archiViewElement[archiRelation.source.id],
    archiViewElement[archiRelation.target.id]
  );

  // check for a circular relation
  if (archiRelation.source.id == archiRelation.target.id) {
    drawCircularBendpoints(edge, connection);
  } else {
  drawBendpoints(param, edge, connection);
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
 */
function drawBendpoints(param, edge, connection) {
  debugStackPush(false);

  let srcCenter = getCenterBounds(connection.source);
  let tgtCenter = getCenterBounds(connection.target);

  let bendpoints = [];
  let points = graph.edge(edge).points;

  debug(`dagre points: ${JSON.stringify(points)}`);

  // skip first and last point. These are not bendpoints, but connecting points on the edge of the node
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(calcBendpoint(points[i], srcCenter, tgtCenter));
  }

  // finaly add the calculated bendpoint to the Archi connection
  for (let i = 0; i < bendpoints.length; i++) {
    if (param.drawReversed.includes(connection.type)) {
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
function getCenterBounds(element) {
  let center = {};
  center.x = element.bounds.x + element.bounds.width / 2;
  center.y = element.bounds.y + element.bounds.height / 2;

  getCenterBoundsAbsolute(element, center);

  center.x = parseInt(center.x);
  center.y = parseInt(center.y);
  return center;
}
// recursive function
// if element is nested, coordinates are relative to the parent (and parent's parent)
function getCenterBoundsAbsolute(element, center) {
  let parent = $(element).parent().filter("element").first();
  if (parent) {
    // debug(`coordinates relative to parent ${parent} `);
    console.log(`center ${element}=${JSON.stringify(center)}`);
    center.x += parent.bounds.x;
    center.y += parent.bounds.y;
    getCenterBoundsAbsolute(parent, center);
  }
  return;
}

/**
 * add bendpoints for drawing a circular connection
 *
 * dagre bendpoints for circular relations are ugly, so
 * - ignore edge points
 * - set Archi bendpoints for drawing a 'circle' at the top right corner
 * fingers crossed there's only one circular relation ..
 *
 * @param {object} edge - graph edge
 * @param {object} connection - Archi connection
 */
function drawCircularBendpoints(edge, connection) {
  // bendpoint coordinates are relative to the center of the element (x,y=0,0)
  let cornerX = connection.source.bounds.width / 2;
  let cornerY = connection.source.bounds.height / 2;
  let rightX = cornerX + 40;
  let down_Y = -cornerY + 20;
  let left_X = cornerX - 20;
  let up___Y = -cornerY - 20;

  // Bendpoint with duplicate coördinates: {startX, startY} is equal to {endX, endY}. Don't understand?
  let bendpoints = [];
  bendpoints[0] = { startX: rightX, startY: down_Y, endX: rightX, endY: down_Y };
  bendpoints[1] = { startX: rightX, startY: up___Y, endX: rightX, endY: up___Y };
  bendpoints[2] = { startX: left_X, startY: up___Y, endX: left_X, endY: up___Y };

  for (let i = 0; i < bendpoints.length; i++) {
    connection.addRelativeBendpoint(bendpoints[i], i);
  }
}

// Open the view
function openView(view) {
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

const SCRIPT_NAME = __FILE__.replace(/^.*[\\\/]/, "");

/**
 * initConsoleLog and finishconsole
 *   first and last call in an Archi script
 *
 * @param pFile : string __FILE__ as current script
 * @param pClear : boolean for clear console
 */
function initConsoleLog(pFile, pClear) {
  console.show();
  if (pClear) console.clear();
  console.log(`\nRunning script "${SCRIPT_NAME}"...\n`);
}

function finishConsoleLog() {
  console.log(`\nScript "${SCRIPT_NAME}" finished`);
  console.log("==========================================\n");
}

var debugStack = [false];
function debugStackPush(debugSwitch) {
  debugStack.push(debugSwitch);
}
function debugStackPop() {
  debugStack.pop();
}

/**
 * debug()
 *   show debug message if global debugStack is set
 * @param msg string information message
 */
function debug(msg) {
  logMessage(debugStack, "Debug", msg);
}

/**
 * logMessage()
 *   show message with prefix
 * @param msg string information message
 */
function logMessage(logSwitch, logType, msg) {
  if (logSwitch[logSwitch.length - 1]) {
    if (msg.startsWith("\n")) {
      console.log();
      msg = msg.substring("\n".length);
    }
    console.log(`${">".repeat(logSwitch.length)} ${logType}: ${msg}`);
  }
}
