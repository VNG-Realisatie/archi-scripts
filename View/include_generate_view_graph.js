const { addDummyNode: addNode } = require("dagre-cluster-fix/lib/util");

const GENERATE_SINGLE = "GENERATE_SINGLE";
const GENERATE_MULTIPLE = "GENERATE_MULTIPLE";
const EXPAND_HERE = "EXPAND_HERE";
const LAYOUT = "LAYOUT";
const REGENERATE = "REGENERATE";
const SEPARATOR = "___";

// default settings for generated views
const PROP_SAVE_PARAMETER = "generate_view_param";
const GENERATED_VIEW_FOLDER = "_Generated"; // generated views are created in this folder
const NODE_WIDTH = 140; // width of a drawn element
const NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

var graphCircular = []; // Bookkeeping of circular relations. Workaround for dagre error and ugly circular relations

load(__DIR__ + "../_lib/common.js");

/**
 * Where to find the required dagre-cluster-fix module?
 * Use nodeJS
 * - npm install dagre-cluster-fix
 * Or go to https://unpkg.com/dagre-cluster-fix/
 * - download from the folder /dist the file dagre.js and copy it in the scripts folder
 */
function loadDagre() {
  try {
    load(__DIR__ + "../_lib/jvm-npm.js");
    require.addPath(__DIR__);

    let dagre = require("../_lib/dagre");

    console.log(`Dagre version:`);
    console.log(`- dagre:    ${dagre.version}`); // dagre-cluster-fix should show version 0.9.3
    console.log(`- graphlib: ${dagre.graphlib.version}\n`);
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
    throw "\nDagre module not loaded";
  }
  return dagre;
}

/**
 * generate and layout an ArchiMate view
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  if (param.debug == undefined) param.debug = false;
  debugStackPush(param.debug);

  let dagre = loadDagre();

  try {
    if (setDefaultParameters(param)) {
      let selectedElements = selectObjects(selection, "element");
      let filteredElements = selectedElements.filter((obj) => filterObjectType(obj, param.includeElementType));
      console.log(`- ${filteredElements.length} elements after filtering`);
      if (filteredElements.length === 0) throw "No Archimate element match your criterias.";

      // - first create view
      console.log(`\nDrawing ArchiMate view...  `);

      let graph = createGraph(param, dagre);

      fillGraph(param, graph, view);

      console.log("Layout elements ...");
      layoutGraph(param, dagre, graph);

      drawGraph(param, graph);
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  debugStackPop();
}

/**
 * create a graph with the param settings
 *
 * @param {object} param
 * @returns
 */
function createGraph(param, dagre) {
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
      return { minlen: 1, weight: 1 };
    });
  return graph;
}

function fillGraph(param, graph) {
  // - for every filtered element
  // todo > collection
  let notFilteredElements = $();
  if ((param.graphDepth = 0)) notFilteredElements = $("element").not(filteredElements);
  notFilteredElements = $("element").not(filteredElements);
  //  debug(`notFilteredElements: ${notFilteredElements}`)

  // first proces all parent child relations
  filteredElements
    .rels()
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .filter((rel) => !(rel.source.id == rel.target.id)) // skip cicular relations
    .filter((rel) => relEndsIn(rel, filteredElements)) // depth = 0
    .filter((rel) => filterObjectType(rel, param.layoutNested)) // select nested relations
    .filter((rel) => filterObjectType(rel, param.includeRelationType))
    .each((rel) => {
      debug(`addParentChild rel: ${rel}`);
      addParentChild(param, graph, rel);
    });

  // add elements and their relations
  filteredElements
    .rels()
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .filter((rel) => !(rel.source.id == rel.target.id)) // skip cicular relations
    .filter((rel) => relEndsIn(rel, filteredElements)) // depth = 0
    .filter((rel) => !filterObjectType(rel, param.layoutNested)) // skip nested relation
    .filter((rel) => filterObjectType(rel, param.includeRelationType))
    .each((rel) => {
      debug(`addElementsRelations rel: ${rel}`);
      addElementsRelations(param, graph, rel);
    });

  // also add elements without relation
  filteredElements.filter((e) => $(e).rels().size() == 0).each((e) => addElement(param, graph, e));
}

function drawCircular(param, filteredElements) {
  // add elements and their relations
  filteredElements
    .rels()
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .filter((rel) => rel.source.id == rel.target.id) // select cicular relations
    .filter((rel) => relEndsIn(rel, filteredElements)) // depth = 0
    .filter((rel) => !filterObjectType(rel, param.layoutNested)) // skip nested relation
    .filter((rel) => filterObjectType(rel, param.includeRelationType))
    .each((rel) => {
      debug(`drawCircular rel: ${rel}`);

      // todo: find visual nodes
      let connection = view.add(rel, visualElementIndex[rel.source.id], visualElementIndex[rel.target.id]);
      drawCircularBendpoints(connection);
    });
}

/**
 * add the parent first, then add child to the parent
 * if a child has multiple parents
 *   an occurence of the child is added to the parent
 *   the view will show duplicates off the child element
 *
 * recurse over alle nestedRelation
 *   if the parent is a child in another nested relation
 *     then add the parent to the parents parent
 *   else add the parent to the view
 */
function addParentChild(param, graph, rel) {
  let parent = rel.source;
  let child = rel.target;
  if (param.layoutReversed.includes(rel.type)) {
    // reverse layout of current relation
    parent = rel.target;
    child = rel.source;
  }

  if (!graph.hasNode(parent.id)) {
    graph.setNode(parent.id, {
      label: `${parent.id}${SEPARATOR}${null}${SEPARATOR}${parent.name}`,
      width: param.nodeWidth,
      height: param.nodeHeight,
    });
    debug(`added node with parent.id: ${parent.id} and name ${parent.name}`);
  }

  // add child for every nestedRelation (multiple occurences for element on view)
  let childNodeId = `${child.id}${SEPARATOR}${rel.id}`;
  if (!graph.hasNode(childNodeId)) {
    graph.setNode(childNodeId, {
      label: `${child.id}${SEPARATOR}${rel.id}${SEPARATOR}${child.name}`,
      width: param.nodeWidth,
      height: param.nodeHeight,
    });
    debug(`added node with child.id: ${child.id} and name ${child.name}`);
  }

  graph.setParent(childNodeId, parent.id);
  debug(`Add parent-child: ${parent} -${rel.type}- ${child}`);

  // let parentsParent = createParentChild(param, graph,  rel);
  return;
}

function addElementsRelations(param, graph, rel) {
  addNode(graph, rel.source);
  addNode(graph, rel.target);

  if (param.layoutReversed.includes(rel.type)) {
    // add reversed to the graph for direction in the layout
    graph.setEdge(rel.target.id, rel.source.id, { label: rel.id });
  } else {
    // for default layout of relation
    graph.setEdge(rel.source.id, rel.target.id, { label: rel.id });
  }
}

function addNode(graph, ele) {
  if (!graph.hasNode(ele.id)) {
    graph.setNode(ele.id, {
      label: `${ele.id}${SEPARATOR}${null}${SEPARATOR}${ele.name}`,
      width: param.nodeWidth,
      height: param.nodeHeight,
    });
    debug(`added node with parent.id: ${ele.id} and name ${ele.name}`);
  }
}

function addElements(param, graph, rel) {
  filteredElements.filter((e) => $(e).rels().size() == 0).each((e) => addElement(param, graph, e));
}

function findOnView(view, ele) {
  return $(view)
    .find()
    .filter((visEle) => visEle.concept.id == ele.id)
    .first();
}

function layoutGraph(param, dagre, graph) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function drawGraph(param, graph) {
  let folder = getFolder("Views", GENERATED_VIEW_FOLDER);
  let view = getView(folder, param.viewName);

  // view.find("element").each((e) => {}); not via view, but via graph. nodes, parents etc are defined.
  //   - set coördinates and bendpoints
  //     - for all nodes
  graph.nodes().forEach((nodeId) => {
    let node = graph.node(nodeId);
    let visualElement = $("#" + nodeId).first();

    debug(`>> nodeId ${nodeId}`);
    debug(`>> node ${JSON.stringify(node)}`);
    debug(`>> layout ${visualElement}`);
    let elePos = calcElement(node);
    visualElement.bounds = { x: elePos.x, y: elePos.y, width: elePos.width, height: elePos.height };
  });

  //     - for all edges
  graph.edges().forEach((edge) => {
    debug(`edge: ${JSON.stringify(edge)}`);
    let edgeObj = graph.edge(edge); // get edge label
    debug(`edgeObj: ${JSON.stringify(edgeObj)}`);
    let visualRelation = $("#" + edgeObj.label).first();

    debug(`>> layout ${visualRelation}`);
    drawBendpoints(param, edgeObj, visualRelation);
    //     - for all nestedRelations
  });
}

function relEndsIn(rel, filteredElements) {
  // $(rel).ends
  return true;
}
function eleIn(e, filteredElements) {
  return filteredElements.filter((fe) => fe.id == e.id).size() != 0;
}

function addElement(param, graph, e) {
  let visualElement = findOnView(view, e);

  // check if element is already added to the view
  if (!visualElement) {
    // add to the view
    visualElement = view.add(e, 0, 0, -1, -1);
    debug(`added to view: ${visualElement.name}`);

    // add to the graph for layout
    if (e.type == "junction")
      graph.setNode(visualElement.id, { label: e.name, width: JUNCTION_DIAMETER, height: JUNCTION_DIAMETER });
    else graph.setNode(visualElement.id, { label: e.name, width: param.nodeWidth, height: param.nodeHeight });
  }
  return visualElement;
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
  let view = $(folder)
    .children("view")
    .filter("." + viewName)
    .first();

  // If the view already exist, empty view
  if (view) {
    console.log(`Found view ${folder.name}/${view.name}`);
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

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function setDefaultParameters(param) {
  let validFlag = true;

  if (param.action == REGENERATE) {
    // get parameters from the selected view property
    console.log(`Action is ${param.action}`);

    let view = getSelectedView();
    console.log(`** Reading param from selected ${view} **\n`);

    Object.assign(param, JSON.parse(view.prop(PROP_SAVE_PARAMETER)));
    param.viewName = "";
  }

  console.log("Generate view parameters");
  if (param.action == undefined) param.action = GENERATE_SINGLE;
  console.log("- action = " + param.action);

  if (param.graphDepth === undefined) param.graphDepth = 1;
  console.log("- graphDepth = " + param.graphDepth);

  if (!validArchiConcept(param.includeElementType, ELEMENT_NAMES, "includeElementType:", "no filter")) validFlag = false;
  if (param.includeElementType === undefined) param.includeElementType = [];
  if (!validArchiConcept(param.includeRelationType, RELATION_NAMES, "includeRelationType:", "no filter")) validFlag = false;
  if (param.includeRelationType === undefined) param.includeRelationType = [];
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`- viewName = ${param.viewName}`);

  console.log("How to draw relationships");
  if (!validArchiConcept(param.layoutReversed, RELATION_NAMES, "layoutReversed:", "none")) validFlag = false;
  if (param.layoutReversed === undefined) param.layoutReversed = [];
  if (!validArchiConcept(param.layoutNested, RELATION_NAMES, "layoutNested:", "none")) validFlag = false;
  if (param.layoutNested === undefined) param.layoutNested = [];

  console.log("Developing");
  console.log("- debug = " + param.debug);

  if (!validFlag) console.error("\nCorrect the invalid type names logged in red");
  return validFlag;
}

// calculate the absolute coordinates of the left upper corner of the node
function calcElement(node) {
  debugStackPush(false);

  let elePos = calcElementPosition(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  debug(`>> coördinates (${JSON.stringify(elePos)}`);

  debugStackPop();
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
 * add bendpoints to an Archi connection
 *
 * calculate Archi bendpoint coordinates from a Dagre point
 *  - coordinates of Dagre points are absolute to the diagram
 *  - coordinates of Archi bendpoints are given relative to center of the connections source and target
 *
 * @param {object} edgeObj - graph edge
 * @param {object} connection - Archi connection
 */
function drawBendpoints(param, edgeObj, connection) {
  debugStackPush(false);

  let bendpoints = [];
  let srcCenter = getCenterBounds(connection.source);
  let tgtCenter = getCenterBounds(connection.target);

  debug(`dagre points: ${JSON.stringify(edgeObj.points)}`);

  // skip first and last point. These are not bendpoints, but connecting points on the edge of the node
  for (let i = 1; i < edgeObj.points.length - 1; i++) {
    bendpoints.push(calcBendpoint(edgeObj.points[i], srcCenter, tgtCenter));
  }

  // finaly add the calculated bendpoint to the Archi connection
  for (let i = 0; i < bendpoints.length; i++) {
    if (param.layoutReversed.includes(connection.type)) {
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
    debug(`center ${element}=${JSON.stringify(center)}`);
    center.x += parent.bounds.x;
    center.y += parent.bounds.y;
    getCenterBoundsAbsolute(parent, center);
  }
  return;
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

/**
 * return a collection of  the contained objects in the selection
 *
 * @param {object} startSelection - selection containing Archi objects
 * @param {string} selector - Archi selector for filtering the type of contained objects
 * @returns {object} - collection with selected objects
 */
function selectObjects(startSelection, selector) {
  if (model == null || model.id == null)
    throw "Nothing selected. Select one or more objects in the model tree or a view";

  // create an empty collection
  var selectedColl = $();
  $(startSelection).each((obj) => addObjectInList(obj, selector, selectedColl));

  return selectedColl;
}

/**
 * recursive function
 *   add the selected object to a collection.
 *   if the object is a container (model, view or folder), add all contained objects
 */
function addObjectInList(obj, selector, coll) {
  if ($(obj).is(selector)) {
    let o = obj;
    if (selector != "view") o = concept(obj);
    // check for duplicates, than add element to the list
    if (coll.filter((a) => a.id == o.id).size() == 0) {
      coll.add(o);
    }
  }
  $(obj)
    .children()
    .each((child) => addObjectInList(child, selector, coll));
  return coll;
}

function concept(o) {
  return o.concept ? o.concept : o;
}

function filterObjectType(o, filterArray) {
  if (filterArray.length == 0) return true;
  return filterArray.includes(o.type);
}
