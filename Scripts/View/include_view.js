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
 * - layout of circular relations done outside dagre (dagre throws an error)
 * - dagre buggy?
 *    - layout of connections sometimes ugly (bendpoints 'overshoot')
 *    - for connections to embedded elements, only some get bendpoints
 *    - sometimes this error https://github.com/dagrejs/dagre/issues/234
 */

load(__DIR__ + "../_lib/selection.js");

const GENERATE_SINGLE = "Generate";
const GENERATE_MULTIPLE = "GenerateMultiple";
const EXPAND_HERE = "Expand";
const LAYOUT = "Layout";
const REGENERATE = "Regenerate";
const ACTIONS = [GENERATE_SINGLE, GENERATE_MULTIPLE, EXPAND_HERE, LAYOUT, REGENERATE];

// default settings for generated views
const PROP_SAVE_PARAMETER = "generate_view_param";
const GENERATED_VIEW_FOLDER = "_Generated"; // generated views are created in this folder
const DEFAULT_GRAPHDEPTH = 1;
const DEFAULT_DIRECTION = "LR";
const DEFAULT_NODE_WIDTH = 140; // width of a drawn element
const DEFAULT_NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

const DEFAULT_PARAM_FILE = "default_parameter.js"; // optional file with user defaults, supersedes defaults above
const USER_PARAM_FOLDER = "user_parameter"; // folder with user parameter settings for generating views

const START_LEVEL = 0;

// polyfill for array method includes(), which is not supported in Nashorn ES6
if (!Array.prototype.includes) {
  Array.prototype.includes = function (search) {
    return !!~this.indexOf(search);
  };
}

var graph = {}; // graphlib graph for layout view
var graphParentsIndex = []; // Bookkeeping of parents. Workaround for missing API graph.parents() and graph.parentsCount()
var graphCircular = []; // Bookkeeping of circular relations. Workaround for dagre error and ugly circular relations

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
  // var dagre = require("../_lib/dagre");
  var dagre = require("../_lib/dagre-cluster-fix");

  console.log(`Dagre version:`);
  console.log(`- dagre:    ${dagre.version}`); // dagre-cluster-fix should show version 0.9.3
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw "\nDagre module not loaded";
}

/**
 * set the default param from the DEFAULT_PARAM_FILE
 *
 * Order of setting param
 * - superseded by DEFAULT_PARAM_FILE
 * - superseded by USER_PARAM file
 * - function validateParameters() defaults
 */
function get_default_parameter(file, param) {
  let path = file.substring(0, file.lastIndexOf("\\") + 1);
  let default_parameter_file = `${USER_PARAM_FOLDER}/${DEFAULT_PARAM_FILE}`;
  try {
    load(default_parameter_file);
    param = DEFAULT_PARAM;
    console.log(`Default parameters read from file "${default_parameter_file}"`);
    debug(`Default: ${JSON.stringify(param, null, 2)}\n`);
  } catch (error) {
    console.error(`Default parameters file not found: ${default_parameter_file}\n`);
    throw error;
  }
  return param;
}

/**
 * read parameters
 * - action,
 * - direction and
 * - an optional USER_PARAM file
 * from the filename
 *
 * use the USER_PARAM_FILE to replace attributes in the given param object
 */
function get_user_parameter(file, param) {
  let path = file.substring(0, file.lastIndexOf("\\") + 1);
  let filename = file.replace(/^.*[\\\/]/, "");
  let name = filename.substring(0, filename.lastIndexOf("."));

  let [direction, action, userParamName] = name.split("_");

  if (userParamName) {
    let userParamFile = `${USER_PARAM_FOLDER}/${userParamName}.js`;

    try {
      load(path + userParamFile);

      Object.keys(USER_PARAM).forEach((prop) => {
        param[prop] = USER_PARAM[prop];
        debug(`Set ${prop} = ${USER_PARAM[prop]}`);
      });

      console.log(`User parameters read from file "${userParamFile}"`);
      debug(`With user parameter file: ${JSON.stringify(param, null, 2)}\n`);
    } catch (error) {
      console.error(`User parameters file not found: ${userParamFile}\n`);
      throw error;
    }
  }

  console.log(`Parameters read from filename:`);
  console.log(`- direction = ${direction}`);
  console.log(`- action = ${action}\n`);
  param.graphDirection = direction;
  param.action = action;

  return param;
}

/**
 * generate and layout an ArchiMate view
 *
 * @param {object} param - settings for generating a view
 */
function generate_view(param, selectedObjects = $(selection)) {
  if (param.debug == undefined) param.debug = false;
  debugStackPush(param.debug);

  try {
    if (validateParameters(param, selectedObjects)) {
      let filteredElements = selectElements(param, selectedObjects);

      if (param.action == GENERATE_MULTIPLE) {
        // generate multiple views
        console.log(`\n== Generating ${filteredElements.size()} views ==`);

        filteredElements.each(function (e) {
          // set viewname to the element name
          param.action = GENERATE_SINGLE;
          param.viewName = e.name;
          console.log(`- ${param.viewName}`);
          createGraph(param);
          fillGraph(param, selectedObjects, $(e));
          layoutGraph(param);
          drawView(param, $(e));
        });
      } else {
        createGraph(param);
        fillGraph(param, selectedObjects, filteredElements);
        layoutGraph(param);
        drawView(param, filteredElements);
        // layoutAndRender(param, selectedObjects, filteredElements);
      }
    } else {
      console.error("\nError in parameter. Correct the invalid parameter logged in red");
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  debugStackPop();
}

// function layoutAndRender(param, selectedObjects, filteredElements) {
//   createGraph(param);
//   fillGraph(param, selectedObjects, filteredElements);
//   layoutGraph(param);
//   drawView(param, filteredElements);
// }

/**
 * check and set defaults for parameters
 *
 * @param {object} param - settings for generating a view
 */
function validateParameters(param, selectedObjects) {
  let validFlag = true;

  if (param.action == REGENERATE) {
    // get parameters from the selected view property
    console.log(`Action is ${param.action}`);

    let view = getSelectedView(selectedObjects);
    console.log(`** Reading param from selected ${view} **\n`);

    Object.assign(param, JSON.parse(view.prop(PROP_SAVE_PARAMETER)));
    param.viewName = "";
  }

  console.log("Generate view parameters");
  if (!ACTIONS.includes(param.action)) {
    console.error("Unknown action = " + param.action);
    validFlag = false;
  }
  console.log("  - action = " + param.action);
  if (param.graphDepth === undefined) param.graphDepth = DEFAULT_GRAPHDEPTH;
  console.log("  - graphDepth = " + param.graphDepth);

  if (param.includeElementType === undefined) param.includeElementType = [];
  if (!validArchiConcept(param.includeElementType, ELEMENT_NAMES, "includeElementType:", "no filter"))
    validFlag = false;
  if (param.includeRelationType === undefined) param.includeRelationType = [];
  if (!validArchiConcept(param.includeRelationType, RELATION_NAMES, "includeRelationType:", "no filter"))
    validFlag = false;
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`  - viewName = ${param.viewName}`);

  console.log("How to draw relationships");
  if (param.layoutReversed === undefined) param.layoutReversed = [];
  if (!validArchiConcept(param.layoutReversed, RELATION_NAMES, "layoutReversed:", "none")) validFlag = false;
  if (param.layoutNested === undefined) param.layoutNested = [];
  if (!validArchiConcept(param.layoutNested, RELATION_NAMES, "layoutNested:", "none")) validFlag = false;

  console.log("Developing");
  console.log("  - debug = " + param.debug);
  console.log();

  return validFlag;
}

/**
 * create a list with the selected elements.
 * filter the list according the settings in the param object.
 *
 * @param {object} param - settings for generating a view
 * @param {Archi collection} selectedObjects - object(s) selected in Archi
 */
function selectElements(param, selectedObjects) {
  // create an Archi collection with the selected elements
  let selectedElements = getSelection(selectedObjects, "element");

  // filter the selected elements with the concept filter
  let filteredSelection = selectedElements.filter((obj) => filterObjectType(obj, param.includeElementType));
  console.log(`- ${filteredSelection.size()} elements after filtering`);
  if (filteredSelection.size() === 0) throw "No Archimate element match your criterias.";

  return filteredSelection;
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
  console.log("  - graphDirection = " + param.graphDirection);
  if (param.graphAlign !== undefined) graphLayout.align = param.graphAlign;
  console.log("  - graphAlign (undefined is middle) = " + param.graphAlign);
  if (param.ranker !== undefined) graphLayout.ranker = param.ranker;
  console.log("  - ranker = " + param.ranker);
  if (param.nodeWidth == undefined) param.nodeWidth = DEFAULT_NODE_WIDTH;
  console.log("  - nodeWidth = " + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = DEFAULT_NODE_HEIGHT;
  console.log("  - nodeHeight = " + param.nodeHeight);
  if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
  console.log("  - hSep = " + param.hSep);
  if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
  console.log("  - vSep = " + param.vSep);
  console.log();

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
 * process the selected Archi elements and relations
 */
function fillGraph(param, selectedObjects, filteredElements) {
  let view;
  switch (param.action) {
    case GENERATE_SINGLE:
      console.log(`\nAdding elements and relations to the graph with a depth of ${param.graphDepth}...`);
      filteredElements.each((archiEle) => {
        processElement(START_LEVEL, param, archiEle, filteredElements);
      });
      break;
    case EXPAND_HERE:
      console.log("Expand selected objects on the view");

      // start with existing view
      processViewElements(START_LEVEL, param, selectedObjects);

      // expand the view from the selected elements
      filteredElements.each((archiEle) => processElement(START_LEVEL, param, archiEle, filteredElements));
      break;
    case LAYOUT:
      console.log("Layout objects on the view");

      processViewElements(START_LEVEL, param, selectedObjects);

      break;
    case GENERATE_MULTIPLE:
    default:
      console.error(`Error, wrong action ${param.action}`);
      break;
  }
  console.log("\nAdded to the graph:");
  console.log(`- ${graph.nodeCount()} nodes and`);
  console.log(`- ${graph.edgeCount()} edges`);
  if (graphParentsIndex.length > 0) console.log(`- ${graphParentsIndex.length} parent-child nestings`);
}

/**
 * Add all elements and relations of the given view to the graph
 *
 * ### added filtering of included element and relation types
 */
function processViewElements(level, param, selectedObjects) {
  let view = getSelectedView(selectedObjects);

  view = getSelectedView(selectedObjects);
  param.viewName = view.name;
  $(view)
  .find("element")
  .filter((obj) => filterObjectType(obj, param.includeElementType))
  // ###todo; selectedObjects should be filteredElements. Niet nodig door view parameter
    .each((e) => processElement(START_LEVEL, param, e.concept, selectedObjects, view));
}

/**
 * get the selected view or the view of selected objects
 * @returns Archi view object
 */
function getSelectedView(selectedObjects) {
  let selectedView;
  let obj = selectedObjects.first();
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
 *   recursively process the given elements
 *    select the elements relations to find related elements
 *    add elements and relations to the graph
 *
 * graphDepth=0 generates a view with the selected elements and the elements relations
 * graphDepth=1 generates a view with the selected elements, all related elements and their relations
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} param settings for generating a view
 * @param {object} archiEle Archi element to add to graph
 * @param {array} filteredElements array with Archi elements to draw
 * @param {object} archiView object, only process elements and relation on this view
 */
function processElement(level, param, archiEle, filteredElements, view) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  // stop recursion when the recursion level is larger then the graphDepth
  if ((param.graphDepth > 0 && level > param.graphDepth) || (param.graphDepth == 0 && level > 1)) {
    debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${param.graphDepth}`);
    return STOPPED;
  }
  // add element to the graph
  addNode(level, param, archiEle, view);
  debug(`archiEle: ${archiEle}`);

  $(archiEle)
    .rels()
    .filter((rel) => filterObjectType(rel, param.includeRelationType))
    .filter((rel) => relationIsOnView(rel, view)) // if view is given, only process relation on the view (LAYOUT and EXPAND)
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .each(function (rel) {
      let related_element = rel.source;
      if (archiEle.id != rel.target.id) related_element = rel.target;

      // for graphDepth=0 add all selected elements and their relations
      if (param.graphDepth == 0 && filteredElements.filter((e) => e.id == related_element.id).size() < 1) {
        debug(`${"  ".repeat(level)}> Skip; not in selection ${related_element}`);
      } else {
        // check if the related_element is in the concepts filter
        if (filterObjectType(related_element, param.includeElementType)) {
          // add related_element to the graph (and recurse into its related elements)
          if (processElement(level + 1, param, related_element, filteredElements, view) == NOT_STOPPED) {
            debug(`>>>> rel: ${rel}`);

            // Add relation as edge
            processRelation(level, param, rel);
          }
        }
      }
    });
  return NOT_STOPPED;
}

/**
 * Add the given element as a node to the graph
 *
 * A nested elements (a child) is added as a unique node to the graph for every nested relation
 * - the nodeID of a child is the combination of the elementId and the nested relationId
 * - a parent can be a child in another nested relation
 * Not nested elements are added only once to the graph
 *
 * @param {object} archiEle Archi object
 */
function addNode(level, param, archiEle, view) {
  debugStackPush(true);
  let isNested = false;

  // add nested elements to the graph as a child
  $(archiEle)
    .not("junction") // do not layout junctions as children
    .rels()
    .filter((rel) => filterObjectType(rel, param.includeRelationType))
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .filter((rel) => relationIsOnView(rel, view)) // if view is given, only process relation on the view (for layout and expand)
    .filter((rel) => param.layoutNested.includes(rel.type))
    .each((rel) => {
      isNested = true;

      let nodeIdChild = `${archiEle.id}___${rel.id}`;

      // add element as the parent or the child
      // reversed the source element is the child
      if (param.layoutReversed.includes(rel.type)) {
        if (archiEle.id == rel.source.id) {
          addNodeToGraph(level, param, nodeIdChild, archiEle, " (as a child of reversed relation)");
        } else if (archiEle.id == rel.target.id) {
          addNodeToGraph(level, param, archiEle.id, archiEle, " (as a parent of reversed relation)");
        }
      } else {
        if (archiEle.id == rel.target.id) {
          addNodeToGraph(level, param, nodeIdChild, archiEle, " (as a child)");
        } else if (archiEle.id == rel.source.id) {
          addNodeToGraph(level, param, archiEle.id, archiEle, " (as a parent)");
        }
      }
    });

  if (!isNested) {
    addNodeToGraph(level, param, archiEle.id, archiEle);
  }
  debugStackPop();

  function addNodeToGraph(level, param, nodeId, archiEle, message = "") {
    let nodeWidth = param.nodeWidth;
    let nodeHeight = param.nodeHeight;
    if (!graph.hasNode(nodeId)) {
      if (archiEle.type == "junction") {
        nodeWidth = JUNCTION_DIAMETER;
        nodeHeight = JUNCTION_DIAMETER;
      }

      graph.setNode(nodeId, { label: archiEle.name, width: nodeWidth, height: nodeHeight });
      debug(`${"  ".repeat(level)}> Add ${archiEle}${message}`); // nodeId=${nodeId}`);
    } else {
      debug(`${"  ".repeat(level)}> Skip; already added ${archiEle}${message} (nodeId=${nodeId})`);
    }
  }
}

/**
 * filter if relation is on the view
 *   if no view is given, don't filter
 *
 * @param {*} rel
 * @param {*} view
 * @returns
 */
function relationIsOnView(rel, view) {
  if (view) {
    let nrOfRelations = $(view)
      .find("concept")
      .filter((viewRel) => {
        // console.log(`rel.id=${rel.id}\n`);
        // console.log(`rel.concept.id=${rel.concept.id}`);
        // test with concept
        // else it's connectionIsOnView
        if (viewRel.concept.id == rel.concept.id) return true;
        else return false;
      })
      .size();

    // debug(`nrOfRelation=${nrOfRelations}`);
    if (nrOfRelations > 0) return true;
    else return false;
  } else return true;
}

/**
 * Process the given relation and add to the graph
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} rel Archi relation
 */
function processRelation(level, param, rel) {
  if (rel.source.id == rel.target.id) {
    graphCircular.push(rel);
  } else {
    if (param.layoutNested.includes(rel.type)) {
      addParentChild(level, param, rel);
    } else {
      addEdge(level, param, rel);
    }
  }
}

/**
 * Add the given relation to the graph
 */
function addEdge(level, param, rel) {
  let rel_line;
  // reverse the graph edge for given Archi relation types
  if (param.layoutReversed.includes(rel.type)) {
    if (!graph.hasEdge(rel.target.id, rel.source.id, rel.id)) {
      graph.setEdge(rel.target.id, rel.source.id, { label: rel.id });
      // graph.setEdge(rel.target.id, rel.source.id, rel.id );
      rel_line = `${rel.target.name} <-${rel.type}-- ${rel.source.name}`;
    }
  } else {
    if (!graph.hasEdge(rel.source.id, rel.target.id, rel.id)) {
      graph.setEdge(rel.source.id, rel.target.id, { label: rel.id });
      // graph.setEdge(rel.source.id, rel.target.id, rel.id );
      rel_line = `${rel.source.name} --${rel.type}-> ${rel.target.name}`;
    }
  }

  if (rel_line) debug(`${"  ".repeat(level)}> Add edge ${rel_line}`);
  else debug(`${"  ".repeat(level)}> Skip, edge already in graph ${rel_line}`);
}

/**
 * Add the given relation as a parent/child to the graph
 *
 * graph.setParent(v, parent)
 *   Sets the parent for v to parent if it is defined or removes the parent for v if parent is undefined.
 *   Throws an error if the graph is not compound.
 *   Returns the graph, allowing this to be chained with other functions.
 */
function addParentChild(level, param, rel) {
  debugStackPush(true);
  let rel_line;
  // check if relation is already added
  if (!graphParentsIndex.some((r) => r.id == rel.id)) {
    let nodeIdChild;
    let nodeIdParent;

    // save parent relation
    graphParentsIndex.push(rel);

    if (param.layoutReversed.includes(rel.type)) {
      nodeIdChild = `${rel.source.id}___${rel.id}`;
      nodeIdParent = `${rel.target.id}___${rel.id}`;
      rel_line = `Parent <- Child: ${rel.target.name} <-${rel.type}-- ${rel.source.name}`;
    } else {
      nodeIdChild = `${rel.target.id}___${rel.id}`;
      nodeIdParent = `${rel.source.id}___${rel.id}`;
      rel_line = `Parent -> Child: ${rel.source.name} --${rel.type}-> ${rel.target.name}`;
    }

    nodeParent = graph.node(nodeIdParent);
    debug(`>> nodeParent ${JSON.stringify(nodeParent)}`);

    debug(`graph.node(${nodeIdParent})=${graph.node(nodeIdParent)}`);
    if (!graph.node(nodeIdParent)) {
      nodeIdParent = nodeIdParent.split("___")[0];
    }
    graph.setParent(nodeIdChild, nodeIdParent);
    debug(`${"  ".repeat(level)}> Add ${rel_line} (${nodeIdParent} --> ${nodeIdChild})`);
  } else {
    debug(`${"  ".repeat(level)}> Skip, already in graph = ${rel_line}`);
  }
  debugStackPop();
  return;
}

function filterObjectType(o, objectTypeFilter) {
  if (objectTypeFilter.length == 0) return true;
  return objectTypeFilter.includes(o.type);
}

function layoutGraph(param) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;
  dagre.layout(graph, opts);
}

function drawView(param, filteredElements) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = getFolder("Views", GENERATED_VIEW_FOLDER);
  var generatedView = getView(folder, param.viewName);

  // save generate_view parameter to a view property
  generatedView.prop(PROP_SAVE_PARAMETER, JSON.stringify(param, null, " "));
  // and for debugging also in the views documentation
  // if (param.debug ) {
  //   view.documentation = "View genereated with these settings and selections\n\n";
  //   view.documentation += getTextWithSettings(param, filteredElements);
  // }

  let visualElementsIndex = new Object();
  let nodeIndex = {};

  console.log("Drawing graph nodes as elements ...");
  graph.nodes().forEach((nodeId) => drawElement(param, nodeId, nodeIndex, visualElementsIndex, generatedView));

  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach((edge) => drawRelation(param, edge, visualElementsIndex, generatedView));

  if (graphParentsIndex.length > 0) console.log("Adding child-parent relations to the view ...");
  graphParentsIndex.forEach((parentRel) =>
    layoutNestedConnection(param, parentRel, visualElementsIndex, generatedView)
  );

  if (graphCircular.length > 0) console.log("Drawing circular relations ...");
  graphCircular.forEach((rel) => drawCircularRelation(param, rel, visualElementsIndex, generatedView));

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  openView(generatedView);
  return;
}

function drawCircularRelation(param, rel, visualElementIndex, view) {
  debugStackPush(false);

  let connection = view.add(rel, visualElementIndex[rel.source.id], visualElementIndex[rel.target.id]);

  drawCircularBendpoints(connection);
  debugStackPop();
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
  var v;
  v = $(folder).children("view").filter(`.${viewName}`).first();

  // If the view already exist, empty view
  if (v) {
    console.log(`Found ${v}. Overwriting ...`);
    $(v)
      .find()
      .each((o) => o.delete());
  } else {
    v = model.createArchimateView(viewName);
    console.log(`Creating view: ${v.name}`);

    // move view to the generated views folder
    folder.add(v);
  }
  return v;
}

function drawElement(param, nodeId, nodeIndex, visualElementIndex, genView) {
  debugStackPush(true);
  // if the id has not yet been added to the view
  // check because parents are drawn, at the moment a child node comes by
  if (nodeIndex[nodeId] === undefined) {
    nodeIndex[nodeId] = true;
    let node = graph.node(nodeId);
    let nodeIdParent = graph.parent(nodeId);

    let archiId = nodeId;
    if (nodeId.split("___")[0]) archiId = nodeId.split("___")[0]; // nodeId is a nodeChildId

    let archiElement = $("#" + archiId).first();
    debug(`\n${archiElement} archiId: ${archiId}`);
    debug(`-- nodeId: ${nodeId}; nodeIdParent: ${nodeIdParent}`);

    try {
      if (nodeIdParent === undefined) {
        // archi coordinates for visual element on archi diagram (related to the top left corner of diagram)

        debug(`>> draw ${archiElement}`);
        let elePos = calcElement(node);
        visualElementIndex[nodeId] = genView.add(archiElement, elePos.x, elePos.y, elePos.width, elePos.height);
      } else {
        // first add the parent to the view (the function checks if it's already drawn)
        drawElement(param, nodeIdParent, nodeIndex, visualElementIndex, genView);

        // draw element in parent
        let nodeParent = graph.node(nodeIdParent);
        let archiParent = visualElementIndex[nodeIdParent];

        // calculate the position within the parent
        let y_shift = 10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 0;

        debug(`>> draw nested ${archiElement} in parent ${archiParent}`);
        let elePos = calcElementNested(node, nodeParent);
        visualElementIndex[nodeId] = archiParent.add(
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
 * @param {object} visualElementIndex index object to Archi view occurences
 * @param {object} genView Archi view
 */
function drawRelation(param, edge, visualElementIndex, genView) {
  debugStackPush(false);

  let archiRelation = $("#" + graph.edge(edge).label).first();
  debug(`archiRelation: ${archiRelation}`);

  let connection = genView.add(
    archiRelation,
    visualElementIndex[archiRelation.source.id],
    visualElementIndex[archiRelation.target.id]
  );
  drawBendpoints(param, edge, connection);
  debugStackPop();
}

/**
 * add a connection for a nested relation
 *   depending on the Archi preferences, the connection is or is not drawn
 *   See Edit > preferences > connections > ARM > enable implicit connections
 *
 * @param {object} rel Archi relation
 * @param {object} visualElementIndex index object to Archi view occurences
 * @param {object} genView Archi view
 */
function layoutNestedConnection(param, rel, visualElementIndex, genView) {
  debugStackPush(true);
  debug(`parentRel: ${rel}`);
  if (param.layoutReversed.includes(rel.type)) {
    // reversed; child is source-element
    genView.add(rel, visualElementIndex[`${rel.source.id}___${rel.id}`], visualElementIndex[rel.target.id]);
  } else {
    genView.add(rel, visualElementIndex[rel.source.id], visualElementIndex[`${rel.target.id}___${rel.id}`]);
  }

  debugStackPop();
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
  // ### edges from nested elements don't have points???
  let points = graph.edge(edge).points;

  debug(`dagre points: ${JSON.stringify(points)}`);

  // skip first and last point. These are not bendpoints, but connecting points on the edge of the node
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(calcBendpoint(points[i], srcCenter, tgtCenter));
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

/**
 * add bendpoints for drawing a circular connection
 * ### if an element has more than one circular relation, the are drawn on top of eachotHer
 * ### todo => draw to next corner around with the clock
 *
 * @param {object} connection - Archi connection
 */
function drawCircularBendpoints(connection) {
  // bendpoint coordinates are relative to the center of the element (x,y=0,0)
  let cornerX = connection.source.bounds.width / 2;
  let cornerY = connection.source.bounds.height / 2;
  let rightX = cornerX + 30;
  let down_Y = -cornerY + 15;
  let left_X = cornerX - 50;
  let up___Y = -cornerY - 15;

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
function openView(genView) {
  try {
    // jArchi provides a ArchimateDiagramModelProxy class where then openDiagramEditor requires a ArchimateDiagramModel class
    // unfortunately, the getEObject() method that provides the underlying ArchimateDiagramModel class, is protected
    // so we use reflection to invoke this method.
    var method =
      Packages.com.archimatetool.script.dom.model.ArchimateDiagramModelProxy.class.getDeclaredMethod("getEObject");
    method.setAccessible(true);
    var v = method.invoke(genView);
    Packages.com.archimatetool.editor.ui.services.EditorManager.openDiagramEditor(v);
  } catch (e) {
    console.error(`"Failed to open ${genView}. You may open it manually`);
  }
}

function validArchiConcept(paramList, validNames, label, emptyLabel) {
  let validFlag = true;

  console.log(`  - ${label}`);
  if (paramList.length == 0) {
    console.log(`    - ${emptyLabel}`);
  } else {
    paramList.forEach(function (p) {
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

var script_name;

/**
 * initConsoleLog and finishconsole
 *   first and last call in an Archi script
 *
 * @param pFile : string __FILE__ as current script
 * @param pClear : boolean for clear console
 */
function initConsoleLog(pFile, pClear) {
  script_name = pFile.replace(/^.*[\\\/]/, "");
  console.show();
  if (pClear) console.clear();
  console.log(`\nRunning script "${script_name}"...\n`);
}

function finishConsoleLog() {
  console.log(`\nScript "${script_name}" finished`);
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
