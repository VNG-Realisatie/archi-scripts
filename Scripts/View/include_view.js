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
 *  6  11/01/2025  Mark Backer   do not add relations with PROP_EXCLUDE = "excludeFromView" to view
 *  7  30/03/2026  Mark Backer   multi-parent nesting: create duplicate visual occurrences per parent;
 *                               propagate occurrences to children of occurrence nodes;
 *                               draw connections to/from all visual occurrences;
 *                               dagre robustness: virtual connectivity edges, ranker fallback chain,
 *                               simple hierarchical positional layout as last resort
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
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common");
const Selection = require(__SCRIPTS_DIR__ + "Scripts/_lib/selection");
const ArchiFolders = require(__SCRIPTS_DIR__ + "Scripts/_lib/archi_folders");

const GENERATE_SINGLE = "Generate";
const GENERATE_MULTIPLE = "GenerateMultiple";
const EXPAND_HERE = "Expand";
const LAYOUT = "Layout";
const REGENERATE = "Regenerate";

const LAYOUT_CIRCULAR_DAGRE = false; // default
const LAYOUT_CIRCULAR_WORKAROUND = true;

// default settings for generated views
const PROP_SAVE_PARAMETER = "generate_view_param";
const PROP_EXCLUDE = "excludeFromView";
const GENERATED_VIEW_FOLDER = "/_Generated"; // generated views are created in this folder
const DEFAULT_GRAPHDEPTH = 1;
const DEFAULT_ACTION = GENERATE_SINGLE;
const DEFAULT_NODE_WIDTH = 140; // width of a drawn element
const DEFAULT_NODE_HEIGHT = 60; // height of a drawn element
const JUNCTION_DIAMETER = 14; // size of a junction

const DEFAULT_PARAM_FILE = "default_parameter.js"; // optional file with user defaults, supersedes defaults above
const USER_PARAM_FOLDER = "user_parameter"; // folder with user parameter settings for generating views

/**
 * Dagre is loaded via native jArchi CommonJS require (no jvm-npm).
 * Ensure Archi Preferences > Scripting: CommonJS is enabled and engine is GraalVM.
 */
try {
  var dagre = require(__SCRIPTS_DIR__ + "Scripts/node_modules/dagre-cluster-fix");
  console.log(`Dagre version:`);
  console.log(`- dagre:    ${dagre.version}`);
  console.log(`- graphlib: ${dagre.graphlib.version}\n`);
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw "\nDagre module not loaded. Enable CommonJS in Archi Preferences > Scripting and use GraalVM.";
}

/**
 * Get parameter from filename to generate a view
 *
 * Order of setting param
 * - include-view.js defaults
 * - superseded by DEFAULT_PARAM_FILE
 * - superseded by 'wrapper'.ajs file
 */
function get_default_parameter(file) {
  Common.debugStackPush(false);

  let param = {};
  try {
    let path = file.substring(0, file.lastIndexOf("/") + 1);
    let default_param_file = path + `${USER_PARAM_FOLDER}/${DEFAULT_PARAM_FILE}`;
    Common.debug(`default_param_file: ${default_param_file}`);
    param = require(default_param_file);
    console.log(`Default parameter read from file "${default_param_file}"`);
    Common.debug(`Default: \n${JSON.stringify(param, null, 2)}\n`);
  } catch (error) {
    console.log(`NOT read default parameters ${DEFAULT_PARAM_FILE}\n`);
    Common.debug(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  Common.debugStackPop();
  return param;
}

/**
 * parse script filename into param values
 * - filename format <filename of PARAM_FILE>_<action>_<direction>.ajs
 *
 * @param {string} file - script filename (use __FILE__)
 * @param {object} param - put values into param object
 * @returns param object
 */
function get_user_parameter(file, param) {
  let filename = file.replace(/^.*[\\\/]/, "");
  let name = filename.substring(0, filename.lastIndexOf("."));
  let [user_param_name, action, direction] = name.split("_");

  return read_user_parameter(file, user_param_name, action, direction, param);
}

/**
 * Read PARAM_FILE and overwrite param with given user_param.values
 *
 * @param {string} file - to deduct path
 * @param {string} user_param_name - filename of PARAM_FILE
 * @param {string} action
 * @param {string} direction
 * @param {object} param - put values into param object
 * @returns
 */
function read_user_parameter(file, user_param_name, action, direction, param = {}) {
  Common.debugStackPush(false);
  // let path = file.substring(0, file.lastIndexOf("\\") + 1);
  let path = file.substring(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);

  if (user_param_name) {
    let userParamFile = `${path}${USER_PARAM_FOLDER}/${user_param_name}.js`;
    let printUserParamFile = userParamFile.substring(__DIR__.length - 1);
    console.log(`User parameters read from file "${printUserParamFile}"`);
    console.log(`User parameter "${user_param_name}", action "${action}" with direction "${direction}"`);
    console.log();
    try {
      const USER_PARAM = require(userParamFile);

      Object.keys(USER_PARAM).forEach((prop) => {
        param[prop] = USER_PARAM[prop];
        Common.debug(`Read_user_parameter: Set ${prop} = ${USER_PARAM[prop]}`);
      });

      Common.debug(`With user parameter file: \n${JSON.stringify(param, null, 2)}\n`);
    } catch (error) {
      console.log(`NOT read user parameters from file "${printUserParamFile}"`);
      Common.debug(`> ${typeof error.stack == "undefined" ? error : error.stack}\n`);
    }
  } else {
    console.log(`${action} with direction ${direction}\n`);
  }

  param.graphDirection = direction;
  param.action = action;

  Common.debugStackPop();
  return param;
}

/**
 * generate and layout an ArchiMate view
 *
 * @param {object}     param - settings for generating a view
 * @param {collection} drawCollection - collection to draw (optional, default is $(selection))
 * @returns {collection} archi views
 */
function generate_view(param, drawCollection) {
  if (param.debug == undefined) param.debug = false;
  Common.debugStackPush(param.debug);
  let generatedViews = $();

  try {
    if (_setDefaultParameters(param)) {
      let filteredElements = _includedElements(param, drawCollection);
      let graphLayout = _setGraphLayout(param);

      switch (param.action) {
        case GENERATE_SINGLE:
        case EXPAND_HERE:
        case LAYOUT:
          // generate one view
          generatedViews.add(_layoutAndRender(param, graphLayout, filteredElements));
          break;

        case GENERATE_MULTIPLE:
          // generate multiple views
          console.log(`Generating views for elements:`);
          filteredElements.forEach(function (e) {
            console.log(`- ${e}`);
          });
          console.log();

          filteredElements.forEach(function (e) {
            // set viewname to the element name
            param.viewName = e.name + param.viewNameSuffix;
            console.log(`\nGenerating view "${param.viewName}"`);
            console.log(`------------------${"-".repeat(param.viewName.length)}`);
            generatedViews.add(_layoutAndRender(param, graphLayout, $(e)));
          });
          break;

        default:
          throw `unknown action=${param.action}`;
      }
    } else {
      console.error("\nError in parameter. Correct the invalid type names logged in red");
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  Common.debugStackPop();
  return generatedViews;
}

/**
 * @returns Archi view
 */
function _layoutAndRender(param, graphLayout, filteredElements) {
  let graphParents = []; // Bookkeeping of parents. Workaround for missing API graph.parents() and graph.parentsCount()
  let graphCircular = []; // Bookkeeping of circular relations. Workaround for dagre error and ugly circular relations

  let graph = _createGraph(graphLayout); // graphlib graph for layout view
  _fillGraph(param, graph, graphParents, graphCircular, filteredElements);
  _layoutGraph(param, graph);
  return _drawView(param, graph, graphParents, graphCircular);
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function _setDefaultParameters(param) {
  let validFlag = true;

  if (param.action == REGENERATE) {
    // get parameters from the selected view property
    console.log(`Action is ${param.action}`);

    let view = _getSelectedView();
    console.log(`** Reading param from selected ${view} **\n`);

    Object.assign(param, JSON.parse(view.prop(PROP_SAVE_PARAMETER)));
    param.viewName = "";
  }

  console.log("Generate view parameters");
  if (param.action == undefined) param.action = DEFAULT_ACTION;
  console.log("- action = " + param.action);

  if (param.graphDepth === undefined) param.graphDepth = DEFAULT_GRAPHDEPTH;
  console.log("- graphDepth = " + param.graphDepth);

  if (param.includeElementType === undefined) param.includeElementType = [];
  if (!_validArchiConcept(param.includeElementType, ELEMENT_NAMES, "includeElementType:", "no filter")) validFlag = false;
  if (param.includeRelationType === undefined) param.includeRelationType = [];
  if (!_validArchiConcept(param.includeRelationType, RELATION_NAMES, "includeRelationType:", "no filter")) validFlag = false;
  if (param.excludeFromView === undefined) param.excludeFromView = false;
  console.log(`- excludeFromView = ${param.excludeFromView} (exclude objects with property ${PROP_EXCLUDE}=true)`);
  if (param.viewName === undefined || param.viewName === "") param.viewName = $(selection).first().name;
  console.log(`- viewName = ${param.viewName}`);
  if (param.viewNameSuffix === undefined || param.viewNameSuffix === "") param.viewNameSuffix = "";
  console.log(`- viewNameSuffix = ${param.viewNameSuffix}`);
  if (param.viewFolder === undefined || param.viewFolder === "") param.viewFolder = "";
  console.log(`- viewFolder = ${param.viewFolder}`);
  param.viewName = param.viewName + param.viewNameSuffix;

  console.log("How to draw relationships");
  if (param.layoutReversed === undefined) param.layoutReversed = [];
  if (!_validArchiConcept(param.layoutReversed, RELATION_NAMES, "layoutReversed:", "none")) validFlag = false;
  if (param.layoutNested === undefined) param.layoutNested = [];
  if (!_validArchiConcept(param.layoutNested, RELATION_NAMES, "layoutNested:", "none")) validFlag = false;
  if (param.layoutCircular === undefined) param.layoutCircular = LAYOUT_CIRCULAR_DAGRE;
  console.log(`- layoutCircular = ${param.layoutCircular ? "LAYOUT_CIRCULAR_WORKAROUND" : "LAYOUT_CIRCULAR_DAGRE"}`);

  console.log("Developing");
  console.log("- debug = " + param.debug);
  console.log();
  switch (param.action) {
    case GENERATE_SINGLE:
      console.log(`Create or update view:\n- /Views${param.viewFolder}/${param.viewName}`);
      break;
    case GENERATE_MULTIPLE:
      console.log(`Create or update view(s):\n- /Views${param.viewFolder}/<elementName>${param.viewNameSuffix}`);
      break;
    case EXPAND_HERE:
    case LAYOUT:
    case REGENERATE:
      console.log("Update selected view");
      break;
    default:
      break;
  }
  console.log();

  return validFlag;
}

/**
 * create a list with the selected elements.
 * filter the list according the settings in the param object.
 *
 * @param {object} param - settings for generating a view
 * @param {collection} drawCollection - collection to draw (optional, default is $(selection))
 *
 */
function _includedElements(param, drawCollection = $(selection)) {
  // create an array with the selected elements
  Common.debug(`drawCollection: ${drawCollection}`);
  var selectedElements;
  selectedElements = Selection.getSelectionArray(drawCollection, "element");
  Common.debug(`selectedElements: ${selectedElements}`);

  // filter the selected elements with the concept filter
  let filteredSelection = [];
  filteredSelection = selectedElements.filter((obj) => _filterObjectType(obj, param.includeElementType));
  console.log(`- ${filteredSelection.length} element${filteredSelection.length == 1 ? "" : "s"} after filtering`);
  if (filteredSelection.length === 0) throw "No Archimate element match your criterias.";

  return filteredSelection;
}

/**
 * create a graphLayout settings object from param
 *
 * @param {object} param
 * @returns {object} graphLayout
 */
function _setGraphLayout(param) {
  let graphLayout = new Object();
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
  if (param.nodeWidth == undefined) param.nodeWidth = DEFAULT_NODE_WIDTH;
  console.log("- nodeWidth = " + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = DEFAULT_NODE_HEIGHT;
  console.log("- nodeHeight = " + param.nodeHeight);
  if (param.hSep !== undefined) graphLayout.nodesep = param.hSep;
  console.log("- hSep = " + param.hSep);
  if (param.vSep !== undefined) graphLayout.ranksep = param.vSep;
  console.log("- vSep = " + param.vSep);
  console.log();
  return graphLayout;
}

/**
 * create a graph
 *
 * @param {object} graphLayout
 * @returns {object} graph
 */
function _createGraph(graphLayout) {
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

/**
 * add the filtered selection to the graph
 */
function _fillGraph(param, graph, graphParents, graphCircular, filteredElements) {
  const START_LEVEL = 0;

  switch (param.action) {
    case GENERATE_SINGLE:
    case GENERATE_MULTIPLE:
      console.log(`\nAdding elements and relations to the graph with a depth of ${param.graphDepth}...`);
      filteredElements.forEach((archiEle) => {
        _addElement(START_LEVEL, param, graph, graphParents, graphCircular, archiEle, filteredElements);
      });
      break;
    case EXPAND_HERE:
      console.log("Expand selected objects on the view");
      _addViewObjects(START_LEVEL, param, graph, graphParents, graphCircular);
      // expand the view from the selected elements
      filteredElements.forEach((archiEle) =>
        _addElement(START_LEVEL, param, graph, graphParents, graphCircular, archiEle, filteredElements),
      );
      break;
    case LAYOUT:
      console.log("Layout objects on the view");
      _addViewObjects(START_LEVEL, param, graph, graphParents, graphCircular);
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
 * Add all elements and relations of the given view to the graph
 */
function _addViewObjects(level, param, graph, graphParents, graphCircular) {
  let view = _getSelectedView();

  $(view)
    .find("element")
    .each((e) => _createNode(level, param, graph, e));
  $(view)
    .find("relation")
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .each((r) => _addRelation(0, param, graph, graphParents, graphCircular, r.concept));

  // Do not override param.viewName here, so the user-provided name from the GUI is respected
  // param.viewName = view.name;
}

/**
 * get the selected view or the view of selected objects
 * @returns Archi view object
 */
function _getSelectedView() {
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
function _addElement(level, param, graph, graphParents, graphCircular, archiEle, filteredElements) {
  const STOPPED = false;
  const NOT_STOPPED = true;
  Common.debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  // stop recursion when the recursion level is larger then the graphDepth
  if ((param.graphDepth > 0 && level > param.graphDepth) || (param.graphDepth == 0 && level > 1)) {
    Common.debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${param.graphDepth}`);
    return STOPPED;
  }
  // add element to the graph
  _createNode(level, param, graph, archiEle);
  Common.debug(`archiEle: ${archiEle}`);

  $(archiEle)
    .rels()
    .filter((rel) => _filterObjectType(rel, param.includeRelationType))
    .filter((rel) => !(rel.prop(PROP_EXCLUDE) == "true" && param.excludeFromView)) // skip object with PROP_EXCLUDE
    .filter((rel) => $(rel).ends().is("element")) // skip relations with relations
    .each(function (rel) {
      let related_element = rel.source;
      if (archiEle.id != rel.target.id) related_element = rel.target;

      // for graphDepth=0 add all selected elements and their relations
      if (param.graphDepth == 0 && filteredElements.filter((e) => e.id == related_element.id).length < 1) {
        Common.debug(`${"  ".repeat(level)}> Skip; not in selection ${related_element}`);
      } else {
        // check if the related_element is in the concepts filter
        if (_filterObjectType(related_element, param.includeElementType)) {
          // add related_element to the graph (and recurse into its related elements)
          if (
            _addElement(level + 1, param, graph, graphParents, graphCircular, related_element, filteredElements) == NOT_STOPPED
          ) {
            Common.debug(`>>>> rel: ${rel}`);

            // Add relation as edge
            _addRelation(level, param, graph, graphParents, graphCircular, rel);

            // graph
            //   .nodes()
            //   .forEach((nodeId) => console.log(`graph.nodes().forEach((node): ${JSON.stringify(graph.node(nodeId))}`));
          }
        }
      }
    });
  return NOT_STOPPED;
}

/**
 * Add the given element as a node to the graph
 *
 * @param {object} archiEle Archi object
 */
function _createNode(level, param, graph, archiEle) {
  if (!graph.hasNode(archiEle.id)) {
    e = Common.concept(archiEle);
    if (e.type == "junction") graph.setNode(e.id, { label: e.name, width: JUNCTION_DIAMETER, height: JUNCTION_DIAMETER });
    else graph.setNode(e.id, { label: e.name, width: param.nodeWidth, height: param.nodeHeight });
    Common.debug(`${"  ".repeat(level)}> Add ${archiEle}`);
  } else {
    Common.debug(`${"  ".repeat(level)}> Skip; already added ${archiEle}`);
  }
}

/**
 * Add the given relation to the graph
 *
 * @param {integer} level counter for depth of recursion
 * @param {object} rel Archi relation
 */
function _addRelation(level, param, graph, graphParents, graphCircular, rel) {
  if (rel.source.id == rel.target.id && param.layoutCircular) {
    // don't use Dagre for layout circular relation, use function drawlayoutCircular
    graphCircular.push(rel);
  } else {
    if (param.layoutNested.includes(rel.type)) {
      _createParent(level, param, graph, graphParents, rel);
    } else {
      _createEdge(level, param, graph, rel);
    }
  }
}

/**
 * Add the given relation to the graph
 */
function _createEdge(level, param, graph, rel) {
  Common.debugStackPush(false);
  // reverse the graph edge for given Archi relation types
  if (param.layoutReversed.includes(rel.type)) {
    if (!graph.hasEdge(rel.target.id, rel.source.id, rel.id)) {
      graph.setEdge({ v: rel.target.id, w: rel.source.id, name: rel.id }, { id: rel.id });
      // graph.setEdge(rel.target.id, rel.source.id, rel.id );
      Common.debug(
        `${"  ".repeat(level)}> Add edge reversed: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_REVERSED)}`,
      );
    } else {
      Common.debug(
        `${"  ".repeat(level)}> Skip, edge found: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_REVERSED)}`,
      );
    }
  } else {
    if (!graph.hasEdge(rel.source.id, rel.target.id, rel.id)) {
      graph.setEdge({ v: rel.source.id, w: rel.target.id, name: rel.id }, { id: rel.id });
      // graph.setEdge(rel.source.id, rel.target.id, rel.id );
      Common.debug(
        `${"  ".repeat(level)}> Add edge : ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
      );
    } else {
      Common.debug(
        `${"  ".repeat(level)}> Skip, edge found: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
      );
    }
  }
  Common.debugStackPop();
}

/**
 * Ensure an occurrence node exists in the graph for the given conceptId.
 * Creates the node (copying label/size from the concept) and a virtual zero-weight edge
 * back to the concept node so dagre's networkSimplex ranker keeps it connected.
 */
function _ensureOccurrenceNode(graph, conceptId, occurrenceId) {
  if (!graph.hasNode(occurrenceId)) {
    let origNode = graph.node(conceptId);
    if (!origNode) return;
    graph.setNode(occurrenceId, { label: origNode.label, width: origNode.width, height: origNode.height });
    graph.setEdge(
      { v: conceptId, w: occurrenceId, name: "__virt__" + occurrenceId },
      { id: null, _virtual: true, minlen: 0, weight: 0 },
    );
  }
}

/**
 * Forward propagation: a child is being nested in a parent.
 * If the parent already has occurrence nodes (parent__occ__X), create corresponding
 * occurrence nodes for the child nested inside each parent occurrence.
 * This ensures the entire subtree is mirrored in each visual context of the parent.
 */
function _addChildToParentOccurrences(graph, graphParents, rel, childId, parentId) {
  graph.nodes().forEach((nodeId) => {
    if (nodeId.startsWith(parentId + "__occ__")) {
      let childOccId = childId + "__occ__" + nodeId;
      _ensureOccurrenceNode(graph, childId, childOccId);
      graph.setParent(childOccId, nodeId);
      graphParents.push({ rel: rel, childVisualId: childOccId, parentVisualId: nodeId });
      Common.debug(`> Propagate child occurrence ${childOccId} into parent occurrence ${nodeId}`);
    }
  });
}

/**
 * Backward propagation: a new occurrence of a parent was just created (parentOccId).
 * If the parent concept already had children nested inside it, create corresponding
 * occurrence nodes for each child inside the new parent occurrence.
 * Recurses so that grandchildren are also propagated correctly.
 */
function _addExistingChildrenToOccurrence(graph, graphParents, parentConceptId, parentOccId) {
  (graph.children(parentConceptId) || [])
    .filter((c) => !c.includes("__occ__")) // only concept nodes, skip occurrence nodes
    .forEach((childId) => {
      let childOccId = childId + "__occ__" + parentOccId;
      _ensureOccurrenceNode(graph, childId, childOccId);
      graph.setParent(childOccId, parentOccId);
      // Look up the original graphParents entry to carry the correct relation
      let entry = graphParents.find((e) => e.childVisualId === childId && e.parentVisualId === parentConceptId);
      if (entry) {
        graphParents.push({ rel: entry.rel, childVisualId: childOccId, parentVisualId: parentOccId });
      }
      Common.debug(`> Propagate existing child ${childOccId} into new parent occurrence ${parentOccId}`);
      // Recurse: propagate grandchildren into childOccId
      _addExistingChildrenToOccurrence(graph, graphParents, childId, childOccId);
    });
}

/**
 * Add the given relation as a parent/child to the graph.
 *
 * In jArchi a concept can have multiple visual objects (view occurrences) on a diagram.
 * When a child concept already has a parent in the graph (dagre supports only one parent
 * per node), an extra occurrence node is created with id "<conceptId>__occ__<parentId>".
 * This occurrence node is nested in the new parent while the original node stays nested
 * in the first parent. Both occurrence nodes reference the same ArchiMate concept.
 *
 * Occurrence propagation ensures the whole subtree is mirrored in every visual context:
 * - Forward: when child D is added to parent C that already has occurrence C__occ__B,
 *   D__occ__C__occ__B is created inside C__occ__B.
 * - Backward: when occurrence C__occ__B is created and C already has child D,
 *   D__occ__C__occ__B is created inside C__occ__B.
 */
function _createParent(level, param, graph, graphParents, rel) {
  Common.debugStackPush(false);
  // check if this relation is already processed (dedup by relation id)
  if (!graphParents.some((e) => (e.rel !== undefined ? e.rel.id : e.id) === rel.id)) {
    // determine child and parent concept ids based on layout direction
    let isReversed = param.layoutReversed.includes(rel.type);
    let childId  = isReversed ? rel.source.id : rel.target.id;
    let parentId = isReversed ? rel.target.id : rel.source.id;

    let existingParent = graph.parent(childId);

    if (existingParent === undefined) {
      // No parent yet — normal nesting
      graph.setParent(childId, parentId);
      graphParents.push({ rel: rel, childVisualId: childId, parentVisualId: parentId });
      // Forward propagation: if parentId already has occurrences, mirror child into each
      _addChildToParentOccurrences(graph, graphParents, rel, childId, parentId);
      if (isReversed) {
        Common.debug(
          `${"  ".repeat(level)}> Add Parent<-Child: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_REVERSED)}`,
        );
      } else {
        Common.debug(
          `${"  ".repeat(level)}> Add Parent->Child: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
        );
      }
    } else if (existingParent === parentId) {
      // Same parent already set — skip
      Common.debug(
        `${"  ".repeat(level)}> Skip, already nested in same parent: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
      );
    } else {
      // Child already has a DIFFERENT parent → create a view-occurrence node for this parent
      let occurrenceId = childId + "__occ__" + parentId;
      _ensureOccurrenceNode(graph, childId, occurrenceId);
      Common.debug(`${"  ".repeat(level)}> Create occurrence node ${occurrenceId}`);
      graph.setParent(occurrenceId, parentId);
      graphParents.push({ rel: rel, childVisualId: occurrenceId, parentVisualId: parentId });
      // Backward propagation: mirror existing children of childId into this new occurrence
      _addExistingChildrenToOccurrence(graph, graphParents, childId, occurrenceId);
      Common.debug(
        `${"  ".repeat(level)}> Add occurrence Parent->Child: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
      );
    }
  } else {
    Common.debug(
      `${"  ".repeat(level)}> Skip, already in graph ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`,
    );
  }
  Common.debugStackPop();
  return;
}

function _filterObjectType(o, objectTypeFilter) {
  if (objectTypeFilter.length == 0) return true;
  return objectTypeFilter.includes(o.type);
}

/**
 * Ensure the dagre graph is fully connected for the networkSimplex ranker.
 *
 * networkSimplex builds a spanning tree over edges and crashes when the graph has
 * disconnected components. Nodes that only participate in parent-child nesting
 * (graph.setParent) have NO dagre edges and form isolated components.
 *
 * longest-path and tight-tree handle disconnected graphs natively and must NOT
 * receive these virtual edges (weight:0 edges cause zero-length edge intersections).
 *
 * Returns the list of added virtual edge descriptors so they can be removed on fallback.
 */
function _connectDisconnectedComponents(graph) {
  if (!dagre.graphlib.alg || typeof dagre.graphlib.alg.components !== "function") {
    console.log("> _connectDisconnectedComponents: graphlib.alg.components not available, skipping");
    return [];
  }

  let components = dagre.graphlib.alg.components(graph);
  if (components.length <= 1) return []; // already connected

  console.log(`> Connecting ${components.length} disconnected graph components for dagre layout`);
  let anchorId = components[0][0]; // anchor: first node of the first component
  let virtualEdges = [];
  for (let i = 1; i < components.length; i++) {
    let nodeId = components[i][0];
    let edgeName = "__virt_comp__" + i;
    graph.setEdge(
      { v: anchorId, w: nodeId, name: edgeName },
      { id: null, _virtual: true, minlen: 0, weight: 0 },
    );
    virtualEdges.push({ v: anchorId, w: nodeId, name: edgeName });
  }
  return virtualEdges;
}

/**
 * Simple recursive hierarchical positional layout — last-resort fallback when all dagre
 * rankers fail on heavily-nested compound graphs.
 *
 * Recursively sizes and positions children within their parents (stacked vertically),
 * then arranges top-level nodes in a row. No edge routing is performed.
 */
function _simpleLayout(graph) {
  const PAD = 15;
  const GAP = 8;
  const LABEL_H = 30; // vertical room for the parent element's label

  // Recursively position children inside a parent node and expand the parent to fit.
  function layoutChildren(nodeId) {
    let children = (graph.children(nodeId) || []).filter((c) => !!graph.node(c));
    if (children.length === 0) return;

    let childY = LABEL_H + PAD;
    let maxChildW = 0;

    children.forEach((childId) => {
      layoutChildren(childId); // size children first (bottom-up)
      let child = graph.node(childId);
      child.x = PAD + child.width / 2;
      child.y = childY + child.height / 2;
      childY += child.height + GAP;
      if (child.width > maxChildW) maxChildW = child.width;
    });

    // Expand parent to contain all children
    let node = graph.node(nodeId);
    node.width = Math.max(node.width || 0, maxChildW + 2 * PAD);
    node.height = childY + PAD;
  }

  // Arrange top-level nodes (no parent) left-to-right
  let topNodes = graph.nodes().filter((n) => !graph.parent(n) && !!graph.node(n));
  let x = 10;
  topNodes.forEach((nodeId) => {
    layoutChildren(nodeId);
    let node = graph.node(nodeId);
    node.x = x + node.width / 2;
    node.y = 10 + node.height / 2;
    x += node.width + 20;
  });
}

/**
 * Remove all edges from the graph that are marked as virtual layout edges.
 * Called before switching dagre rankers — virtual edges cause their own dagre crashes.
 */
function _removeVirtualEdges(graph) {
  let toRemove = graph.edges().filter((e) => graph.edge(e) && graph.edge(e)._virtual);
  toRemove.forEach((e) => graph.removeEdge(e.v, e.w, e.name));
  if (toRemove.length > 0) Common.debug(`> Removed ${toRemove.length} virtual layout edges`);
}

function _layoutGraph(param, graph) {
  console.log("\nCalculating the graph layout...");
  var opts = { debugTiming: false };
  if (param.debug) opts.debugTiming = true;

  // networkSimplex requires a connected edge graph; longest-path and tight-tree do not.
  // Only add virtual connectivity edges for networkSimplex — they cause intersection
  // crashes ("Not possible to find intersection inside of the rectangle") with other rankers.
  let startRanker = graph.graph().ranker; // undefined = dagre default = network-simplex
  let needsConnectivity = !startRanker || startRanker === "network-simplex";
  if (needsConnectivity) _connectDisconnectedComponents(graph);

  // Try all dagre rankers in order; fall back to simple layout if all fail.
  let rankers = ["network-simplex", "tight-tree", "longest-path"];
  // Start with the user-configured ranker; then try the others
  if (startRanker && startRanker !== "network-simplex") {
    rankers = [startRanker, ...rankers.filter((r) => r !== startRanker)];
  }

  for (let i = 0; i < rankers.length; i++) {
    let ranker = rankers[i];
    graph.graph().ranker = ranker;
    try {
      dagre.layout(graph, opts);
      if (i > 0) console.log(`> Succeeded with '${ranker}' ranker.`);
      return; // layout succeeded
    } catch (e) {
      console.log(`> Layout failed with '${ranker}' (${e.message})`);
      // Remove all virtual edges before trying the next ranker
      _removeVirtualEdges(graph);
      if (i + 1 < rankers.length) {
        console.log(`> Retrying with '${rankers[i + 1]}' ranker...`);
      }
    }
  }

  // All dagre rankers failed — apply simple hierarchical positional layout
  console.log("> All dagre rankers failed. Applying simple hierarchical positional layout.");
  console.log("> Note: edge bendpoints will not be computed in this fallback mode.");
  _simpleLayout(graph);
}


function _drawView(param, graph, graphParents, graphCircular) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder != "") {
    folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);
  }

  var view = _getView(folder, param.viewName);

  // save generate_view parameter to a view property
  view.prop(PROP_SAVE_PARAMETER, JSON.stringify(param, null, " "));

  let visualElementsIndex = new Object();
  let nodeIndex = {};

  console.log("Drawing graph nodes as elements ...");
  graph.nodes().forEach((nodeId) => _drawElement(param, graph, nodeId, nodeIndex, visualElementsIndex, view));

  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach((edge) => _drawRelation(param, graph, edge, visualElementsIndex, view));

  if (graphParents.length > 0) console.log("Adding child-parent relations to the view ...");
  graphParents.forEach((parentRel) => _layoutNestedConnection(parentRel, visualElementsIndex, view));

  if (graphCircular.length > 0) console.log("Drawing circular relations ...");
  graphCircular.forEach((rel) => _drawlayoutCircular(param, rel, visualElementsIndex, view));

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  _openView(view);
  return view;
}

function _drawlayoutCircular(param, rel, visualElementIndex, view) {
  Common.debugStackPush(false);

  let connection = view.add(rel, visualElementIndex[rel.source.id], visualElementIndex[rel.target.id]);

  _drawCircularBendpoints(connection);
  Common.debugStackPop();
}

function _getView(folder, viewName) {
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

function _drawElement(param, graph, nodeId, nodeIndex, visualElementIndex, view) {
  Common.debugStackPush(false);
  // if the id has not yet been added to the view
  // check because parents are drawn, at the moment a child node comes by
  if (nodeIndex[nodeId] === undefined) {
    nodeIndex[nodeId] = true;
    let node = graph.node(nodeId);
    let parentId = graph.parent(nodeId);
    // For occurrence nodes (id = "<conceptId>__occ__<parentId>"), strip the suffix to look up
    // the ArchiMate concept. jArchi supports multiple visual objects per concept on a diagram.
    let conceptId = nodeId.includes("__occ__") ? nodeId.split("__occ__")[0] : nodeId;
    let archiElement = $("#" + conceptId).first();

    try {
      if (parentId === undefined) {
        // archi coordinates for visual element on archi diagram (related to the top left corner of diagram)

        Common.debug(`>> draw ${archiElement}`);
        let elePos = _calcElement(node);
        visualElementIndex[nodeId] = view.add(archiElement, elePos.x, elePos.y, elePos.width, elePos.height);
      } else {
        // first add the parent to the view (the function checks if it's already drawn)
        _drawElement(param, graph, parentId, nodeIndex, visualElementIndex, view);

        // draw element in parent
        let parentNode = graph.node(parentId);
        let archiParent = visualElementIndex[parentId];

        // calculate the position within the parent
        let y_shift = 10; // shift to better center the child element(s) in the parent
        if (param.graphDirection == "TB" || param.graphDirection == "BT") y_shift = 0;

        Common.debug(`>> draw nested ${archiElement} in parent ${archiParent}`);
        let elePos = _calcElementNested(node, parentNode);
        visualElementIndex[nodeId] = archiParent.add(archiElement, elePos.x, elePos.y + y_shift, elePos.width, elePos.height);
      }
    } catch (e) {
      console.error("-->" + e + "\n" + e.stack);
    }
  }
  Common.debugStackPop();
}

// calculate the absolute coordinates of the left upper corner of the node
function _calcElement(node) {
  let elePos = _calcElementPosition(node);
  elePos.x = parseInt(elePos.x);
  elePos.y = parseInt(elePos.y);

  Common.debug(`>> coördinates (${JSON.stringify(elePos)}`);

  return elePos;
}

// calculate the relative coordinates of the node to the parent
function _calcElementNested(node, parentNode) {
  let nestedPos = _calcElementPosition(node);
  Common.debug(`>> element (${JSON.stringify(nestedPos)}`);
  let parentPos = _calcElementPosition(parentNode);
  Common.debug(`>> parent (${JSON.stringify(parentPos)}`);

  nestedPos.x = parseInt(nestedPos.x - parentPos.x);
  nestedPos.y = parseInt(nestedPos.y - parentPos.y);

  Common.debug(`>> nested element (relative to parent) (${JSON.stringify(nestedPos)}`);

  return nestedPos;
}

function _calcElementPosition(node) {
  let elePos = {};
  elePos.x = node.x - node.width / 2;
  elePos.y = node.y - node.height / 2;

  // the +1 is for alignment of right bottom conrner on grid in Archi
  elePos.width = node.width + 1;
  elePos.height = node.height + 1;
  return elePos;
}

/**
 * Return all node ids in the graph that are visual occurrences of the given concept.
 * The primary node (concept id itself) comes first, followed by any __occ__ nodes.
 *
 * @param {object} graph       dagre graph
 * @param {string} conceptId   ArchiMate concept id
 * @param {object} visualElementIndex  keyed by nodeId
 * @returns {string[]} one or more node ids
 */
function _getOccurrenceNodeIds(graph, conceptId, visualElementIndex) {
  let ids = [];
  // Primary node (concept id as-is)
  if (visualElementIndex[conceptId] !== undefined) ids.push(conceptId);
  // Additional occurrence nodes created for multi-parent nesting
  graph.nodes().forEach((nodeId) => {
    if (nodeId.startsWith(conceptId + "__occ__") && visualElementIndex[nodeId] !== undefined) {
      ids.push(nodeId);
    }
  });
  // Fallback: return concept id even if not in index (preserves original error behaviour)
  return ids.length > 0 ? ids : [conceptId];
}

/**
 * draw an Archi connection for the given edge
 *
 * When source or target has multiple visual occurrences (view objects for the same concept),
 * a connection is drawn for every occurrence combination so each visual object stays connected.
 * The primary pair (first source × first target) receives dagre bendpoints; extras do not.
 *
 * @param {object} edge graphlib edge object
 * @param {object} visualElementIndex index object to Archi view occurrences
 * @param {object} view Archi view
 */
function _drawRelation(param, graph, edge, visualElementIndex, view) {
  Common.debugStackPush(false);
  // Skip virtual layout edges (added to keep occurrence nodes connected in dagre's edge graph)
  if (graph.edge(edge)._virtual) {
    Common.debugStackPop();
    return;
  }
  Common.debug(`graph.edge(edge): ${JSON.stringify(graph.edge(edge))}`);

  let archiRelation = $("#" + graph.edge(edge).id).first();
  Common.debug(`archiRelation: ${Common.formatRelation(archiRelation, Common.FORMAT_WITH_TYPES)}`);

  let sourceIds = _getOccurrenceNodeIds(graph, archiRelation.source.id, visualElementIndex);
  let targetIds = _getOccurrenceNodeIds(graph, archiRelation.target.id, visualElementIndex);

  // Primary connection — first source occurrence to first target occurrence — gets bendpoints
  let connection = view.add(
    archiRelation,
    visualElementIndex[sourceIds[0]],
    visualElementIndex[targetIds[0]],
  );
  _drawBendpoints(param, graph, edge, connection);

  // Draw plain connections for all additional occurrence combinations
  for (let si = 0; si < sourceIds.length; si++) {
    for (let ti = 0; ti < targetIds.length; ti++) {
      if (si === 0 && ti === 0) continue; // already drawn as primary
      Common.debug(`> Add occurrence connection: ${sourceIds[si]} -> ${targetIds[ti]}`);
      view.add(archiRelation, visualElementIndex[sourceIds[si]], visualElementIndex[targetIds[ti]]);
    }
  }

  Common.debugStackPop();
}

/**
 * add a connection for a nested relation
 *   depending on the Archi preferences, the connection is or is not drawn
 *   See Edit > preferences > connections > ARM > enable implicit connections
 *
 * @param {object} entry { rel, childVisualId, parentVisualId } — the nesting entry from graphParents
 * @param {object} visualElementIndex index object to Archi view occurrences (keyed by nodeId)
 * @param {object} view Archi view
 */
function _layoutNestedConnection(entry, visualElementIndex, view) {
  Common.debugStackPush(false);
  // entry is { rel, childVisualId, parentVisualId }
  // childVisualId is either the concept id (normal nesting) or "<conceptId>__occ__<parentId>" (occurrence)
  let rel = entry.rel !== undefined ? entry.rel : entry;
  let srcVisualId, tgtVisualId;

  if (entry.childVisualId !== undefined) {
    // Determine which side of the relation is the child by matching its concept id
    let childConceptId = entry.childVisualId.split("__occ__")[0];
    if (rel.source.id === childConceptId) {
      // child is the source (reversed layout) — rare case
      srcVisualId = entry.childVisualId;
      tgtVisualId = entry.parentVisualId;
    } else {
      // child is the target (normal layout)
      srcVisualId = entry.parentVisualId;
      tgtVisualId = entry.childVisualId;
    }
  } else {
    // Legacy: plain rel object — fall back to concept ids
    srcVisualId = rel.source.id;
    tgtVisualId = rel.target.id;
  }

  Common.debug(`parentRel: ${Common.formatRelation(rel, Common.FORMAT_WITH_TYPES)}`);
  view.add(rel, visualElementIndex[srcVisualId], visualElementIndex[tgtVisualId]);
  Common.debugStackPop();
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
function _drawBendpoints(param, graph, edge, connection) {
  Common.debugStackPush(false);

  let srcCenter = _getCenterBounds(connection.source);
  let tgtCenter = _getCenterBounds(connection.target);

  let bendpoints = [];
  // ### edges from nested elements don't have points???
  let points = graph.edge(edge).points;

  Common.debug(`dagre points: ${JSON.stringify(points)}`);

  // skip first and last point. These are not bendpoints, but connecting points on the edge of the node
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(_calcBendpoint(points[i], srcCenter, tgtCenter));
  }

  // finaly add the calculated bendpoint to the Archi connection
  for (let i = 0; i < bendpoints.length; i++) {
    if (param.layoutReversed.includes(connection.type)) {
      connection.addRelativeBendpoint(bendpoints[bendpoints.length - i - 1], i);
    } else {
      connection.addRelativeBendpoint(bendpoints[i], i);
    }
  }
  Common.debugStackPop();
}

function _calcBendpoint(point, srcCenter, tgtCenter) {
  let bendpoint = {
    startX: parseInt(point.x - srcCenter.x),
    startY: parseInt(point.y - srcCenter.y),
    endX: parseInt(point.x - tgtCenter.x),
    endY: parseInt(point.y - tgtCenter.y),
  };

  Common.debug(`dagre point: ${JSON.stringify(point)}`);
  Common.debug(`Archi bendpoint: ${JSON.stringify(bendpoint)}`);

  return bendpoint;
}

// get the absolute coordinates of the center of the element
function _getCenterBounds(element) {
  let center = {};
  center.x = element.bounds.x + element.bounds.width / 2;
  center.y = element.bounds.y + element.bounds.height / 2;

  _getCenterBoundsAbsolute(element, center);

  center.x = parseInt(center.x);
  center.y = parseInt(center.y);
  return center;
}
// recursive function
// if element is nested, coordinates are relative to the parent (and parent's parent)
function _getCenterBoundsAbsolute(element, center) {
  let parent = $(element).parent().filter("element").first();
  if (parent) {
    // Common.debug(`coordinates relative to parent ${parent} `);
    Common.debug(`center ${element}=${JSON.stringify(center)}`);
    center.x += parent.bounds.x;
    center.y += parent.bounds.y;
    _getCenterBoundsAbsolute(parent, center);
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
function _drawCircularBendpoints(connection) {
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
function _openView(view) {
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

function _validArchiConcept(paramList, validNames, label, emptyLabel) {
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    generate_view,
    get_default_parameter,
    get_user_parameter,
    read_user_parameter,
    GENERATE_SINGLE,
    GENERATE_MULTIPLE,
    EXPAND_HERE,
    LAYOUT,
    REGENERATE,
    DEFAULT_GRAPHDEPTH,
    DEFAULT_ACTION,
    DEFAULT_NODE_WIDTH,
    DEFAULT_NODE_HEIGHT,
    LAYOUT_CIRCULAR_DAGRE,
    LAYOUT_CIRCULAR_WORKAROUND,
    GENERATED_VIEW_FOLDER,
    PROP_SAVE_PARAMETER,
    PROP_EXCLUDE,
    ELEMENT_NAMES,
    RELATION_NAMES,
  };
}
