/**
 * Fill graph with visual id's version
 *
 * todo
 * - selectedElements also with relations
 *    - show filtered elements and relations
 *    - growColl => proces relations, duplicates via ele?
 *
 *
 *
 */
const GENERATE_SINGLE = "GENERATE_SINGLE";
const GENERATE_MULTIPLE = "GENERATE_MULTIPLE";
const EXPAND_HERE = "EXPAND_HERE";
const LAYOUT = "LAYOUT";
const REGENERATE = "REGENERATE";

// default settings for generated views
const PROP_SAVE_PARAMETER = "generate_view_param";
const GENERATED_VIEW_FOLDER = "_Generated"; // generated views are created in this folder
const NODE_WIDTH = 140; // width of a drawn element
const NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

var graphCircular = []; // Bookkeeping of circular relations. Workaround for dagre error and ugly circular relations

load(__DIR__ + "../_lib/Common.js");
load(__DIR__ + "../_lib/selection.js");

/**
 * generate and layout an ArchiMate view
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  const START_LEVEL = 0;
  const EMPTY_RELATION = { id: "0" };
  if (param.debug == undefined) param.debug = false;
  debugStackPush(param.debug);

  try {
    const dagre = loadDagre();
    let graphOptions = new Object();
    if (setDefaultParameters(param, graphOptions)) {
      let selectedElements = selectElements(param);
      let folder = getFolder("Views", GENERATED_VIEW_FOLDER);
      let graph = createGraph(dagre, graphOptions);

      switch (param.action) {
        case GENERATE_SINGLE:
          {
            let collection = $();
            selectedElements.forEach((ele) => growCollection(param, ele, collection));
            collection.add(selectedElements);
            let view = getView(folder, param.viewName);
            drawCollection(param, dagre, graph, collection, view);
          }
          break;
        case GENERATE_MULTIPLE:
          {
            console.log(`\n== Generating ${selectedElements.length} views ==`);
            selectedElements.forEach(function (ele) {
              let collection = $(ele);
              growCollection(param, ele, collection);

              // set viewname to the element name
              let view = getView(folder, ele.name);
              drawCollection(param, dagre, graph, collection, view);
            });
          }
          break;
        case EXPAND_HERE:
          {
            console.log("Expand selected objects on the view");

            // Add all elements and relations of the selected view
            // ### todo filtering circular and rel on rel
            let collection = $();
            let selectedView = getSelectedView();
            $(selectedView)
              .find("concept")
              .each((viewObject) => {
                collection.add(viewObject.concept);
                viewObject.delete();
              });

            // expand the collection by adding all related elements and relations
            selectedElements.forEach((ele) => growCollection(param, ele, collection));
            collection.add(selectedElements);
            drawCollection(param, dagre, graph, collection, selectedView);
          }
          break;
        case LAYOUT:
          {
            console.log("Layout objects on the view");

            // Add all elements and relations of the selected view
            let collection = $();
            let selectedView = getSelectedView();
            $(selectedView)
              .find("concept")
              .each((viewObject) => {
                collection.add(viewObject.concept);
                viewObject.delete();
              });

            drawCollection(param, dagre, graph, collection, selectedView);
          }
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

/**
 * create a list with the selected elements.
 * filter the list according the settings in the param object.
 *
 * @param {object} param - settings for generating a view
 */
function selectElements(param) {
  // // create an array with the selected elements
  let selectedElements;
  selectedElements = getSelection($(selection), "element");
  debug(`selectedElements: ${selectedElements}`);
  // filter the selected elements with the concept filter
  let filteredSelection = selectedElements.filter((obj) => filterObjectType(obj, param.elementFilter));
  console.log(`- ${filteredSelection.length} elements after filtering`);
  if (filteredSelection.length === 0) throw "No Archimate element match your criterias.";

  return filteredSelection;
}

/**
 * grow collection with the elements relations
 * - all filtered relations of the element are added
 * - all elements and related elements are added
 * duplicates are sorted out when drawing
 *
 * @param {object} param settings for generating a view
 * @param {object} ele Archi element to add to graph
 * @param {object} coll Archi collection
 */
function growCollection(param, ele, coll) {
  // loop over the filtered collection of relations of the element
  $(ele)
    .rels()
    .filter((rel) => filterObjectType(rel, param.relationFilter)) // only relation of types in param
    .filter((rel) => $(rel).ends().is("element")) // only relations with elements (relations with relations not supported)
    .each((rel) => {
      // only relations with source and target of type in param
      if (filterObjectType(rel.source, param.elementFilter) && filterObjectType(rel.target, param.elementFilter)) {
        debug(`added to collection: ${rel}`);
        coll.add(rel);

        let relatedEle;
        if (rel.source.id == ele.id) relatedEle = rel.target;
        else relatedEle = rel.source;
        if (coll.filter((a) => a.id == relatedEle.id).size() == 0) {
          debug(`added to collection: ${relatedEle}`);
          coll.add(relatedEle);
        }
      }
    });
  return;
}

function drawCollection(param, dagre, graph, collection, view) {
  collection.filter("relation").forEach((rel) => {
    let visualSource = addVisualElement(param, graph, view, rel.source);
    let visualTarget = addVisualElement(param, graph, view, rel.target);
    // check cyclic nested relation
    let visualRel = addVisualRelation(param, graph, view, visualSource, visualTarget, rel);
  });
  // ### find root parent
  collection.filter("element").forEach((ele) => {
    addVisualElement(param, graph, view, ele);
  });

  calculateLayout(param, dagre, graph);
  layoutView(graph);

  openView(view);

  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  // if (graphParents.length > 0) console.log(`- ${graphParents.length} parent-child nestings`);
}

function addVisualElement(param, graph, view, e) {
  let visualEle = findOnView(view, e);
  if (!visualEle) {
    // add to the view
    visualEle = view.add(e, 0, 0, -1, -1);
    debug(` added to view: ${visualEle}`);

    // add to the graph for layout
    if (e.type == "junction") {
      graph.setNode(visualEle.id, { label: e.name, width: JUNCTION_DIAMETER, height: JUNCTION_DIAMETER });
    } else {
      graph.setNode(visualEle.id, { label: e.name, width: param.nodeWidth, height: param.nodeHeight });
    }
  } else {
    debug(`found on view: ${visualEle}`);
  }
  return visualEle;
}

function addVisualRelation(param, graph, view, visualSource, visualTarget, rel) {
  // if (rel.source.id == rel.target.id) {
  //   // keep circular relations out of the graph because of dagre crashes
  //   graphCircular.push(rel);
  // } else if (param.drawNested.includes(rel.type)) {
  //   // proces nestedRelation with parents en children
  //   createParentChild(param, graph, view, rel);
  // } else {
  //   createRelation(param, graph, view, rel);
  // }

  let visualRel = findOnView(view, rel);
  if (!visualRel) {
    let visualRel = view.add(rel, visualSource, visualTarget);
    debug(`added to view: ${visualRel}`);

    if (param.drawReversed.includes(rel.type)) {
      // add reversed to the graph for direction in the layout
      // graph.setEdge(v, w, [label], [name])
      // graph.setEdge(visualRel.target.id, visualRel.source.id, visualRel.name, visualRel.id);
      // graph.setEdge(visualRel.target.id, visualRel.source.id, undefined, visualRel.id);
      // graph.setEdge(visualRel.target.id, visualRel.source.id, '', visualRel.id);
      graph.setEdge(
        visualRel.target.id,
        visualRel.source.id,
        { label: `Added reversed ${visualRel.id}` },
        visualRel.id
      );
      debug(`added reversed to graph: ${visualRel} (${visualRel.id})`);
      debug(`  graph.edge(): ${graph.edge(visualRel.target.id, visualRel.source.id, visualRel.id)}`);
    } else {
      // for default layout of relation
      // graph.setEdge(v, w, [label], [name])
      // graph.setEdge(visualRel.source.id, visualRel.target.id, undefined, visualRel.id);
      // graph.setEdge(visualRel.source.id, visualRel.target.id, '', visualRel.id);
      graph.setEdge(visualRel.source.id, visualRel.target.id, { label: `Added ${visualRel.id}` }, visualRel.id);
      debug(`added to graph: ${visualRel} (${visualRel.id})`);
      debug(`  graph.edge(): ${graph.edge(visualRel.source.id, visualRel.target.id, visualRel.id)}`);
    }
  } else {
    debug(`found on view: ${visualRel}`);
  }
  return visualRel;
}

/**
 * add the parent first, then add child to the parent
 * if a child has multiple parents
 *   an occurence of the child is added to the parent
 *   the view will show duplicates off the child element
 *
 * recurse over alle nestedRelation until a 'root' parent is found
 *   add the parent to the view
 *   add children to the parent
 * stop for cyclic parents
 *  remember followed parents
 *
 * was
 *   if the parent is a child in another nested relation
 *     then add the parent to the parents parent
 *   else add the parent to the view
 */
function createParentChild(param, graph, view, currentRel) {
  // check if relation is already added to the view
  if (!findOnView(view, currentRel)) {
    let currentParent = currentRel.source;
    let currentChild = currentRel.target;
    if (param.drawReversed.includes(currentRel.type)) {
      // reverse layout of current relation
      currentParent = currentRel.target;
      currentChild = currentRel.source;
    }

    // is currentParent a child in another relation?
    parentIsChild(param, graph, view, child);

    // add child for every nestedRelation (multiple occurences for element on view)
    visualChild = visualParent.add(currentChild, 0, 0, -1, -1);
    debug(`added child: ${visualChild.name} to parent ${visualParent.name}  `);
    let visualRelation;
    // add nestedRelation to the view
    if (param.drawReversed.includes(currentRel.type)) {
      visualRelation = view.add(currentRel, visualChild, visualParent);
    } else {
      visualRelation = view.add(currentRel, visualParent, visualChild);
    }

    // fill the graph
    graph.setNode(visualChild.id, {
      label: visualChild.name,
      width: param.nodeWidth,
      height: param.nodeHeight,
    });
    debug(`added node with child.id: ${visualChild.id} and name ${visualChild.name}`);
    graph.setNode(visualParent.id, {
      label: visualParent.name,
      width: param.nodeWidth,
      height: param.nodeHeight,
    });
    debug(`added node with parent.id: ${visualParent.id} and name ${visualParent.name}`);

    graph.setParent(visualChild.id, visualParent.id);
    debug(`Add parent-child: ${parent} -${rel.type}- ${child}`);

    // let parentsParent = createParentChild(param, graph, view, rel);
  }
  return;
}

function parentIsChild(param, graph, view, child) {
  $(currentParent)
    .rels()
    .filter((rel) => filterObjectType(rel, param.relationFilter))
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .filter((rel) => filterObjectType(rel, param.drawNested))
    .each((rel) => {
      let parent = rel.source;
      let child = rel.target;
      if (param.drawReversed.includes(rel.type)) {
        // reverse layout of relation
        parent = rel.target;
        child = rel.source;
      }
      debug(`\nCurrent  parent: ${currentParent.name}, child: ${currentChild.name}`);
      debug(`Relation parent: ${parent.name}, child: ${child.name}`);

      debug(`Nesting: ${currentParent.id == child.id}`);
      let visualParent;
      // if the current parent is a child in the relation
      if (currentParent.id == child.id) {
        // nest currentParent in the child (the parentParent)
        if (!findOnView(view, child)) {
          debug(`first create parentParents: ${child.name} `);
        }

        visualParent = child.add(currentParent, 0, 0, -1, -1);
        debug(`parentsParent: ${child}, currentParent: ${currentParent}`);
      } else {
        // draw parent on the view
        visualParent = findOnView(view, currentParent);
        if (!visualParent) {
          // add parent to the view
          visualParent = view.add(currentParent, 0, 0, -1, -1);
          debug(`visualParent: ${visualParent}`);
        }
      }
    });
}

/**
 * return first visual object of the given object on the view
 *
 * @param {*} view
 * @param {*} obj
 * @returns
 */
function findOnView(view, obj) {
  return $(view)
    .find()
    .filter((viewObj) => viewObj.concept.id == obj.id)
    .first();
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
    console.log(`Found view, changing view "${folder.name}/${view.name}"`);
    $(view)
      .find()
      .each((o) => o.delete());
  } else {
    view = model.createArchimateView(viewName);
    console.log(`Creating view "${folder.name}/${view.name}"`);

    // move view to the generated views folder
    folder.add(view);
  }
  return view;
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
    if (obj.view) {
      selectedView = obj.view;
    }
  }
  if (!selectedView) throw "No view or view elements selected. Select one or more elements on a view";
  return selectedView;
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function setDefaultParameters(param, graphOptions) {
  let validFlag = true;

  if (param.action == REGENERATE) {
    // get parameters from the selected view property
    console.log(`Action is ${param.action}`);

    let view = getSelectedView();
    console.log(`** Reading param from selected ${view} **\n`);

    Object.assign(param, JSON.parse(view.prop(PROP_SAVE_PARAMETER)));
    param.viewName = "";
  }

  console.log("Parameters");
  console.log("- view(s) to create");
  if (param.action == undefined) param.action = GENERATE_SINGLE;
  console.log("  - action = " + param.action);
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`  - viewName = ${param.viewName}`);
  console.log("- options for selection");
  if (param.graphDepth === undefined) param.graphDepth = 1;
  console.log("  - graphDepth = " + param.graphDepth);
  if (!validArchiConcept(param.elementFilter, ELEMENT_NAMES, "elementFilter:", "no filter")) validFlag = false;
  if (param.elementFilter === undefined) param.elementFilter = [];
  if (!validArchiConcept(param.relationFilter, RELATION_NAMES, "relationFilter:", "no filter")) validFlag = false;
  if (param.relationFilter === undefined) param.relationFilter = [];

  console.log("- options for drawing relationships");
  if (!validArchiConcept(param.drawReversed, RELATION_NAMES, "drawReversed:", "none")) validFlag = false;
  if (param.drawReversed === undefined) param.drawReversed = [];
  if (!validArchiConcept(param.drawNested, RELATION_NAMES, "drawNested:", "none")) validFlag = false;
  if (param.drawNested === undefined) param.drawNested = [];

  graphOptions.marginx = 10;
  graphOptions.marginy = 10;

  // settings for dagre graph
  console.log("- options for layout");
  if (param.graphDirection !== undefined) graphOptions.rankdir = param.graphDirection;
  console.log("  - graphDirection = " + param.graphDirection);
  if (param.graphAlign !== undefined) graphOptions.align = param.graphAlign;
  console.log("  - graphAlign (undefined is middle) = " + param.graphAlign);
  if (param.ranker !== undefined) graphOptions.ranker = param.ranker;
  console.log("  - ranker = " + param.ranker);
  if (param.nodeWidth == undefined) param.nodeWidth = NODE_WIDTH;
  console.log("  - nodeWidth = " + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = NODE_HEIGHT;
  console.log("  - nodeHeight = " + param.nodeHeight);
  if (param.hSep !== undefined) graphOptions.nodesep = param.hSep;
  console.log("  - hSep = " + param.hSep);
  if (param.vSep !== undefined) graphOptions.ranksep = param.vSep;
  console.log("  - vSep = " + param.vSep);

  console.log("- logging for developing");
  console.log("  - debug = " + param.debug);
  console.log();

  if (!validFlag) console.error("\nCorrect the invalid type names logged in red");
  return validFlag;

  function validArchiConcept(paramList, validNames, label, emptyLabel) {
    let validFlag = true;

    console.log(`  - ${label}`);
    if (paramList.length == 0) {
      console.log(`    - ${emptyLabel}`);
    } else {
      paramList.forEach((p) => {
        if (validNames.includes(p)) {
          console.log(`    - ${p}`);
        } else {
          console.error(`    - ${p}`);
          validFlag = false;
        }
      });
    }
    return validFlag;
  }
}

/**
 * Where to find the required dagre-cluster-fix module?
 * Use nodeJS
 * - npm install dagre-cluster-fix
 * Or go to https://unpkg.com/dagre-cluster-fix/
 * - download from the folder /dist the file dagre.js and copy it in the scripts folder
 */
function loadDagre() {
  load(__DIR__ + "../_lib/jvm-npm.js");
  require.addPath(__DIR__);
  // let dagre = require("../_lib/dagre");
  let dagre = require("../_lib/dagre");

  console.log(`Loaded:`);
  console.log(`- dagre:    ${dagre.version}`); // dagre-cluster-fix should show version 0.9.3
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
  return dagre;
}

/**
 * create a graph with the param settings
 *
 * @param {object} param
 * @returns
 */
function createGraph(dagre, graphOptions) {
  let graph = new dagre.graphlib.Graph({
    directed: true, // A directed graph treats the order of nodes in an edge as significant whereas an undirected graph does not.
    compound: true, // A compound graph is one where a node can be the parent of other nodes.
    multigraph: true, // A multigraph is a graph that can have more than one edge between the same pair of nodes.
  });
  graph.setGraph("generate-view-graph");
  graph.setGraph(graphOptions);
  // https://github.com/dagrejs/dagre/issues/296
  graph.setDefaultEdgeLabel(() => ({}));
  // graph.setDefaultEdgeLabel(() => 'no label');
  // graph.setDefaultNodeLabel("no node label");
  // .setDefaultNodeLabel(function () {
  //   return {};
  // })
  // .setDefaultEdgeLabel(function () {
  //   return { minlen: 1, weight: 1 };
  // });
  return graph;
}

function calculateLayout(param, dagre, graph) {
  console.log("\nCalculating the layout...");
  var opts = { debugTiming: false };
  // if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function layoutView(graph) {
  // view.find("element").each((e) => {}); not via view, but via graph. nodes, parents etc are defined.
  //   - set coördinates and bendpoints
  //     - for all nodes
  console.log("\nLayout elements and relations ...");

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
    
    let visualRelation = $("#" + edge.name).first();
    debug(`>> layout ${visualRelation}`);

    let edgeObj = graph.edge(edge); // get edge label
    debug(`edgeObj: ${JSON.stringify(edgeObj)}`);
    drawBendpoints(param, edgeObj, visualRelation);
    //     - for all nestedRelations
  });
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
    debug(`center ${element}=${JSON.stringify(center)}`);
    center.x += parent.bounds.x;
    center.y += parent.bounds.y;
    getCenterBoundsAbsolute(parent, center);
  }
  return;
}

// Open the view
function openView(view) {
  console.log(`\nOpening generated ${view}`);

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

function filterObjectType(o, filterArray) {
  if (filterArray.length == 0) return true;
  return filterArray.includes(o.type);
}

/**
 * process element and all related elements up to graphdepth levels
 *   add the element and its relations to the view and the graph
 *
 * graphDepth=0 generates a view with the selected elements and their (inner) relations
 * graphDepth=1 generates a view with the selected elements, all related elements and their relations
 * etc
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} param settings for generating a view
 * @param {object} graph dagre graph
 * @param {object} ele Archi element to add to graph
 * @param {object} viaRel the relation used to select the element
 * @param {object} view Archi view to generate
 *
 * @returns {object} created visual element
 */
function processElement(level, param, graph, ele, viaRel, view) {
  // stop recursion when the recursion level is larger then the graphDepth
  if (level > param.graphDepth) {
    // debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${param.graphDepth}`);
    return;
  }
  let visualEle;
  // loop over the filtered collection of relations of the element
  $(ele)
    .rels()
    .filter((rel) => filterObjectType(rel, param.relationFilter)) // only relation of types in param
    .filter((rel) => $(rel).ends().is("element")) // only relations with elements (relations with relations not supported)
    .filter((rel) => rel.id != viaRel.id) // skip relation that's being processed in the previous level (relatedEle)
    .each((rel) => {
      // only relations with source and target of type in param
      if (filterObjectType(rel.source, param.elementFilter) && filterObjectType(rel.target, param.elementFilter)) {
        // check if relation already has been processed (via source or target)
        if (!findOnView(view, rel)) {
          //} && rel.id != viaRel.id) {
          let relatedEle;
          if (rel.source.id == ele.id) relatedEle = rel.target;
          else relatedEle = rel.source;

          if (param.drawNested.includes(rel.type)) {
            // draw this relation nested
          }

          let visualRelatedEle = processElement(level + 1, param, graph, relatedEle, rel, view);

          visualEle = addVisualElement(param, graph, view, ele);
          if (visualRelatedEle) {
            // check cyclic nested relation
            let visualRel = addVisualRelation(param, graph, view, visualEle, visualRelatedEle, rel);
          }
        }
      }
    });
  return visualEle;
}
