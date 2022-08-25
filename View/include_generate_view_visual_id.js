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
const PROP_SAVE_ROUNDROBIN = "generate_view_roundRobin";
const GENERATED_VIEW_FOLDER = "_Generated"; // generated views are created in this folder
const NODE_WIDTH = 140; // width of a drawn element
const NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

const START_LEVEL = 1;
var graphCircular = []; // Bookkeeping of circular relations. Workaround for dagre error and ugly circular relations

load(__DIR__ + "../_lib/Common.js");
load(__DIR__ + "../_lib/selection.js");

/**
 * generate and layout an ArchiMate view
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param) {
  if (param.debug == undefined) param.debug = false;
  debugStackPush(param.debug);

  try {
    const dagre = loadDagre();
    if (setDefaultParameters(param)) {
      let selectedElements = selectElements(param);
      let folder = getFolder("Views", GENERATED_VIEW_FOLDER);

      switch (param.action) {
        case GENERATE_SINGLE:
          {
            console.log("\nGenerate a view with the selected objects");
            let view = getEmptyView(folder, param.viewName);
            let collection = $();
            selectedElements.forEach((ele) => growCollection(param, ele, collection));
            collection.add(selectedElements);

            drawCollection(param, dagre, collection, view);
          }
          break;
        case GENERATE_MULTIPLE:
          console.log(`\n== Generating ${selectedElements.length} views ==`);
          selectedElements.forEach(function (ele) {
            // create a view for each element
            let view = getEmptyView(folder, ele.name);
            let collection = $(ele);
            growCollection(param, ele, collection);

            drawCollection(param, dagre, collection, view);
          });
          break;
        case LAYOUT:
          console.log("\nLayout objects on the selected view");
          {
            let view = getSelectedView();
            let collection = getLayoutCollection(view);
            $(view)
              .find()
              .each((o) => o.delete());

            drawCollection(param, dagre, collection, view);
          }
          break;
        case EXPAND_HERE:
          console.log("\nAdd objects to the view for the selected object");
          {
            let view = getSelectedView();
            let collection = getLayoutCollection(view);
            $(view)
              .find()
              .each((o) => o.delete());

            // expand the collection by adding all related elements and relations
            selectedElements.forEach((ele) => growCollection(param, ele, collection));
            collection.add(selectedElements);

            drawCollection(param, dagre, collection, view);
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
 * Add all elements and relations of the selected view
 */
function getLayoutCollection(selectedView) {
  // ### todo filtering circular and rel on rel
  // ### todo also layout diagram objects
  let layoutCollection = $();
  // let selectedView = getSelectedView();
  $(selectedView)
    .find("concept")
    .each((viewObject) => {
      layoutCollection.add(viewObject.concept);
    });
  return layoutCollection;
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

  // only elements of given element type
  let filteredSelection = selectedElements.filter((obj) => filterObjectType(obj, param.includeElementType));
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
    .filter((rel) => filterObjectType(rel, param.includeRelationType)) // only relation of given relation types
    .filter((rel) => $(rel).ends().is("element")) // only relations with elements (relations with relations not supported)
    .each((rel) => {
      // only relations with source and target of given element type
      if (
        filterObjectType(rel.source, param.includeElementType) &&
        filterObjectType(rel.target, param.includeElementType)
      ) {
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

/**
 * add the collected objects to the view and to the graph for layout calculation
 * - sorting the collection can result in a different layout
 *
 * - the view is used as the container with objects to layout
 */
function drawCollection(param, dagre, collection, view) {
  // ### this only works for layout where also relation are part of collection.
  // growCollection with recursion?????
  // recursion filters for selected elements

  let graph = createGraph(dagre, param);

  // create a different start for the layout by sortings of the collection
  let sortCollectionText = sortCollection(collection, view);

  // add nested relations to the graph
  let nestedCollection = collection.filter("relation").filter((rel) => param.layoutNested.includes(rel.type));
  checkNestedCollection(dagre, graph, nestedCollection, view);
  nestedCollection.forEach((rel) => {
    procesNestedRel(START_LEVEL, param, graph, nestedCollection, view, rel);
  });

  // then add all other relations
  collection
    .not(nestedCollection)
    .filter("relation")
    .forEach((rel) => {
      let visualSource = addVisualElement(param, graph, view, rel.source);
      let visualTarget = addVisualElement(param, graph, view, rel.target);
      // check cyclic nested relation
      addVisualRelation(param, graph, view, visualSource, visualTarget, rel);
    });

  // One more time to add elements that do not have a relation
  collection.filter("element").forEach((ele) => {
    addVisualElement(param, graph, view, ele);
  });

  layoutGraph(param, dagre, graph);
  layoutView(graph, view);

  console.log(`\n${sortCollectionText}`);

  // save used settings to property PROP_SAVE_PARAMETER of view
  view.prop(PROP_SAVE_PARAMETER, JSON.stringify(param, null, " "));

  openView(view);

  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  if (nestedCollection.size() > 0) console.log(`- ${nestedCollection.size()} parent-child nestings`);

  /**
   * sort the collection in three different orders
   */
  function sortCollection(collection, view) {
    let roundRobin = view.prop(PROP_SAVE_ROUNDROBIN);
    roundRobin = roundRobin ? ((parseInt(roundRobin) + 1) % 3) + 1 : 1;
    view.prop(PROP_SAVE_ROUNDROBIN, `${roundRobin}`);

    let JavaCollections = Java.type("java.util.Collections");
    let sortAction = "";
    switch (roundRobin) {
      case 1:
        sortAction = "sorted in ascending order";
        JavaCollections.sort(collection);
        break;
      case 2:
        sortAction = "sorted in descending order";
        JavaCollections.sort(collection, JavaCollections.reverseOrder());
        break;
      case 3:
        sortAction = "not sorted";
        break;
    }
    return `Layout started with objects ${sortAction} (roundRobin=${roundRobin})`;
  }
}

/**
 * for nested relations, the 'root' parent is added to the view
 * the children are added to the parent(s)
 */
function checkNestedCollection(dagre, graph, nestedCollection, view) {
  // create a graph for finding parents
  let nestedGraph = new dagre.graphlib.Graph({
    directed: true,
    compound: true,
    multigraph: true,
  });

  // Add the given relation as a parent/child to the graph
  nestedCollection.forEach((rel) => {
    if (param.layoutReversed.includes(rel.type)) {
      nestedGraph.setParent(rel.target.id, rel.source.id);
    } else {
      nestedGraph.setParent(rel.source.id, rel.target.id);
    }
    debug(`> checked nestedGraph = ${printRel(rel)}`);
  });

  let cycles = dagre.graphlib.alg.findCycles(nestedGraph);
  if (cycles.length > 0) {
    console.log("Cycles:");
    cycles.each((cycle) => console.log(`- ${cycle}`));
    throw "\nThere are cycles in the nested relation(s). To draw the elements nested, they have to be related hierarchic";
  }
}

function procesNestedRel(level, param, graph, nestedCollection, view, startRel) {
  let currentParent = startRel.source;
  let child = startRel.target;
  if (param.layoutReversed.includes(startRel.type)) {
    currentParent = startRel.target;
    child = startRel.source;
  }
  $(currentParent)
    .rels()
    .not($(startRel)) // skip incoming relation
    .filter((rel) => param.layoutNested.includes(rel.type)) // only nested relations
    .each((nextRel) => {
      // only process relations part of the nested collection
      if (nestedCollection.filter((rel) => rel.id == nextRel.id).size() > 0) {
        let visualRel = findOnView(view, startRel);
        if (!visualRel) {
          // determine the child element
          let nextRelChild = nextRel.target;
          let nextRelParent = nextRel.source;
          if (param.layoutReversed.includes(nextRel.type)) {
            nextRelChild = nextRel.source;
            nextRelParent = nextRel.target;
          }
          // if parent is a child in one of its nested relation, first proces the parents parents
          if (currentParent.id == nextRelChild.id) {
            // first add the parents parent
            debug(`${"  ".repeat(level)}>> nextRel: ${nextRelParent} -> ${nextRelChild}`);
            procesNestedRel(level + 1, param, graph, nestedCollection, view, nextRel);

            addVisualNestedRel(param, graph, view, nextRel, nextRelParent, nextRelChild);
          }
        }
      }
    });
  addVisualNestedRel(param, graph, view, startRel, currentParent, child);
}

function addVisualNestedRel(param, graph, view, rel, parent, child) {
  let visualRel = findOnView(view, rel);
  debug(`rel: ${printRel(rel)}`);
  if (!visualRel) {
    // add a root parent to the view
    // now all parents are added, but skipped if already added to the view
    debug(`parent: ${parent}`);
    let visualParent = addVisualElement(param, graph, view, parent);

    // add visual child
    debug(`child: ${child}`);
    let visualChild = addVisualChild(param, graph, view, visualParent, child);
    // check cyclic nested relation

    if (param.layoutReversed.includes(rel.type)) {
      visualRel = view.add(rel, visualChild, visualParent);
    } else {
      visualRel = view.add(rel, visualParent, visualChild);
    }
    // debug(`added nested relation to view: ${visualRel}`);

    graph.setParent(visualChild.id, visualParent.id);
    // debug(`graph.setParent(visualChild.id, visualParent.id): ${visualChild.id}, ${visualParent.id}`);
  }
}

function addVisualElement(param, graph, view, e) {
  let visualEle = findOnView(view, e);
  if (!visualEle) {
    // add to the view
    visualEle = view.add(e, 0, 0, -1, -1);
    debug(`\nadded: ${visualEle}`);

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

function addVisualChild(param, graph, view, visualParent, child) {
  // let visualChild = findOnView(view, child);
  // if (!visualChild) {
  // add to the view
  visualChild = visualParent.add(child, 0, 0, -1, -1);
  debug(`\nadded child ${visualChild.name} to parent ${visualParent.name} `);

  // add to the graph for layout
  if (child.type == "junction") {
    graph.setNode(visualChild.id, { label: child.name, width: JUNCTION_DIAMETER, height: JUNCTION_DIAMETER });
  } else {
    graph.setNode(visualChild.id, { label: child.name, width: param.nodeWidth, height: param.nodeHeight });
  }
  // } else {
  //   debug(`found on view: ${visualChild}`);
  // }
  return visualChild;
}

/**
 *
 * weight
 */
function addVisualRelation(param, graph, view, visualSource, visualTarget, rel) {
  // if (rel.source.id == rel.target.id) {
  //   // keep circular relations out of the graph because of dagre crashes
  //   graphCircular.push(rel);
  // }

  let visualRel = findOnView(view, rel);
  if (!visualRel) {
    let visualRel = view.add(rel, visualSource, visualTarget);
    debug(`\nadded: ${printRel(visualRel)}`);

    if (param.layoutReversed.includes(rel.type)) {
      // add reversed to the graph for direction in the layout
      // graph.setEdge(v, w, [label], [name])
      // g.setEdge(prev, curr, { weight: 1 });
      graph.setEdge(
        visualRel.target.id,
        visualRel.source.id,
        { label: `Added reversed ${printRel(visualRel)}`, weight: RELATION_WEIGHT[rel.type] },
        visualRel.id
      );
      // debug(`added reversed to graph: ${printRel(visualRel)})`);
      // g.edge("a", "b", "edge1"); // returns "edge1-label"
      // debug(`  graph.edge(): ${JSON.stringify(graph.edge(visualRel.target.id, visualRel.source.id, visualRel.id))}`);
    } else {
      graph.setEdge(
        visualRel.source.id,
        visualRel.target.id,
        { label: `Added ${printRel(visualRel)}`, weight: RELATION_WEIGHT[rel.type] },
        visualRel.id
      );
      // debug(`added to graph: ${printRel(visualRel)})`);
      // debug(`  graph.edge(): ${JSON.stringify(graph.edge(visualRel.source.id, visualRel.target.id, visualRel.id))}`);
    }
  } else {
    debug(`found on view: ${printRel(visualRel)}`);
  }
}

/**
 * return first visual object of the given object on the view
 *
 * @param {*} view
 * @param {*} obj
 * @returns
 */
function findOnView(view, obj) {
  let viewElement = $(view)
    .find()
    .filter("concept") // no diagram-objects, no concept.id ### todo
    .filter((viewObj) => viewObj.concept.id == obj.id)
    .first();

  // debug(`obj: ${obj} found: ${viewElement}`);
  return viewElement;
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

function getEmptyView(folder, viewName) {
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
  if (!selectedView) throw "No view or view objects selected. Select a view or objects on a view";
  return selectedView;
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

  console.log("Parameters");
  console.log("- view(s) to create");
  if (param.action == undefined) param.action = GENERATE_SINGLE;
  console.log("  - action = " + param.action);
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`  - viewName = ${param.viewName}`);
  console.log("- options for selection");
  if (param.graphDepth === undefined) param.graphDepth = 1;
  console.log("  - graphDepth = " + param.graphDepth);
  if (!validArchiConcept(param.includeElementType, ELEMENT_TYPES, "includeElementType:", "no filter"))
    validFlag = false;
  if (param.includeElementType === undefined) param.includeElementType = [];
  if (!validArchiConcept(param.includeRelationType, RELATION_TYPES, "includeRelationType:", "no filter"))
    validFlag = false;
  if (param.includeRelationType === undefined) param.includeRelationType = [];

  console.log("- options for drawing relationships");
  if (!validArchiConcept(param.layoutReversed, RELATION_TYPES, "layoutReversed:", "none")) validFlag = false;
  if (param.layoutReversed === undefined) param.layoutReversed = [];
  if (!validArchiConcept(param.layoutNested, RELATION_TYPES, "layoutNested:", "none")) validFlag = false;
  if (param.layoutNested === undefined) param.layoutNested = [];

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
 * load the Dagre module
 *
 * How to get the required dagre-cluster-fix module?
 * - with node: npm install dagre-cluster-fix
 * - or go to https://unpkg.com/dagre-cluster-fix/ and download /dist/dagre.js
 */
function loadDagre() {
  load(__DIR__ + "../_lib/jvm-npm.js");
  require.addPath(__DIR__);
  // let dagre = require("../_lib/dagre");
  let dagre = require("../_lib/dagre-cluster-fix");

  console.log(`Loaded:`);
  // dagre-cluster-fix shows 0.9.0, should be 0.9.3
  console.log(`- dagre:    ${dagre.version}`);
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
  return dagre;
}

/**
 * create a graph with the param settings
 *
 * @param {object} param
 * @returns
 */
function createGraph(dagre, param) {
  // settings for dagre graph
  let graphOptions = new Object();
  if (typeof this.only_once == "undefined") {
    graphOptions.marginx = 10;
    graphOptions.marginy = 10;

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
    console.log();
    this.only_once = true;
  }

  let graph = new dagre.graphlib.Graph({
    directed: true, // A directed graph treats the order of nodes in an edge as significant whereas an undirected graph does not.
    compound: true, // A compound graph is one where a node can be the parent of other nodes.
    multigraph: true, // A multigraph is a graph that can have more than one edge between the same pair of nodes.
  });
  graph.setGraph("generate-view-graph");
  graph.setGraph(graphOptions);
  // https://github.com/dagrejs/dagre/issues/296
  graph.setDefaultEdgeLabel(() => ({}));
  return graph;
}

/**
 * let dagre do its work
 */
function layoutGraph(param, dagre, graph) {
  console.log("\nCalculating the layout...");

  // graph = graph.nodes().sort((a, b) => 0.5 - Math.random());
  // graph = graph.nodes().sort(function (a, b) {
  // 	return a.data("label").localeCompare(b.data("label"));
  // });

  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

/**
 *
 */
function layoutView(graph, view) {
  console.log("\nLayout elements and relations ...");

  debug(`view children:   ${$(view).children("element")}`);
  debug(`view find:       ${$(view).find("element")}`);

  // layout elements
  $(view)
    .children("element")
    .each((visualElement) => {
      // layout visualElement on the view
      debug(`>> set coördinates of element: ${visualElement}`);
      let node = graph.node(visualElement.id);
      debug(`>> node ${JSON.stringify(node)}`);
      let elePos = getElementPosition(node);
      visualElement.bounds = { x: elePos.x, y: elePos.y, width: elePos.width, height: elePos.height };

      layoutNestedElements(START_LEVEL, graph, view, visualElement);
    });

  // layout relations
  graph.edges().forEach((edge) => {
    debug(`edge: ${JSON.stringify(edge)}`);

    let visualRelation = $("#" + edge.name).first();
    debug(`>> layout ${visualRelation}`);

    let edgeObj = graph.edge(edge); // get edge label
    debug(`edgeObj: ${JSON.stringify(edgeObj)}`);
    drawBendpoints(param, edgeObj, visualRelation);
  });
}

/**
 * layout visualElement's nested children recursively
 */
function layoutNestedElements(level, graph, view, visualElement) {
  debugStackPush(true);
  $(visualElement)
    .children("element")
    .each((visualChild) => {
      debug(`visualChild = ${visualChild}`);
      layoutNestedElements(level + 1, graph, view, visualChild);

      let parentNode = graph.node(visualElement.id);
      debug(`parentNode = ${parentNode}`);
      let node = graph.node(visualChild.id);

      debug(`${"  ".repeat(level)}>> layout ${visualChild}`);
      debug(`${"  ".repeat(level)}>> node ${JSON.stringify(node)}`);
      let elePos = getNestedElementPosition(node, parentNode);
      visualChild.bounds = { x: elePos.x, y: elePos.y, width: elePos.width, height: elePos.height };
    });
  debugStackPop();
}

/**
 * get the position of the element on a Archi view
 */
function getElementPosition(node) {
  debugStackPush(false);

  let elePos = calcElementPosition(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  debug(`>> coördinates (${JSON.stringify(elePos)}`);

  debugStackPop();
  return elePos;
}

/**
 * get the calculated relative position of the node to the parent
 */
function getNestedElementPosition(node, parentNode) {
  let nestedPos = calcElementPosition(node);
  debug(``);
  debug(`>> child node ${node.label} (${JSON.stringify(nestedPos)}`);
  let parentPos = calcElementPosition(parentNode);
  debug(`>> parent ${parentNode.label} (${JSON.stringify(parentPos)}`);

  nestedPos.x = parseInt(nestedPos.x - parentPos.x);
  // dagre position children to high in the parent, adding 10 solves this
  nestedPos.y = parseInt(nestedPos.y - parentPos.y) + 10;

  debug(`>> calulated coörd child element (relative to parent) (${JSON.stringify(nestedPos)}`);

  return nestedPos;
}

/**
 * calculate position of the top left corner of the node at a Archi view
 */
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

const ELEMENT_TYPES = [
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

const RELATION_TYPES = [
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

const RELATION_WEIGHT = {
  // Structural Relationships
  "composition-relationship": 1,
  "aggregation-relationship": 1,
  "assignment-relationship": 0.8,
  "realization-relationship": 0.6,

  //  Dependency Relationships
  "serving-relationship": 0.6,
  "access-relationship": 0.4,
  "influence-relationship": 0.4,
  "association-relationship": 0,

  // Dynamic Relationships
  "triggering-relationship": 0.6,
  "flow-relationship": 0.2,

  // Other Relationships
  "specialization-relationship": 0.8,
};

function filterObjectType(o, filterArray) {
  if (filterArray.length == 0) return true;
  return filterArray.includes(o.type);
}

function printRel(rel) {
  return `${rel.type}: ${rel.source.name} -> ${rel.target.name} (${rel.id})`;
}
