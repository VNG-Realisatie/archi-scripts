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
 *     Archi:       https://www.archimatetool.com
 *     jArchi:      https://www.archimatetool.com/plugins
 *     ELK.js:      bundled in node_modules/elkjs (no npm install needed)
 *
 *  #  date        Author        Comments
 *  1  28/01/2019  Hervé Jouin   File creation.
 *  2  03/04/2021  Mark Backer   Restructure and add parameters
 *  3  25/09/2021  Mark Backer   use dagre-cluster-fix version
 *  4  02/10/2021  Mark Backer   draw connection with bendpoints
 *  5  08/03/2022  Mark Backer   add actions LAYOUT and EXPAND_HERE
 *  6  11/01/2025  Mark Backer   do not add relations with PROP_EXCLUDE = "excludeFromView" to view
 *  7  06/05/2026  Mark Backer   replace dagre with ELK.js layout engine
 *
 * Preferred settings
 * - use the jArchi JavaScript engine GraalVM
 *   - go to Edit > Preferences > Scripting: JavaScript engine: GraalVM
 * - for alignment with the grid use the following settings in Archi
 *   - go to Edit > Preferences > Diagram: set grid = 10
 *   - go to Edit > Preferences > Diagram > Appearance: set figure width=141 and height=61
 */
console.log("include_view.js");

const Common = require(REPO_ROOT + "_lib/Common");
const Selection = require(REPO_ROOT + "_lib/selection");
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");

const GENERATE_SINGLE   = "Generate";
const GENERATE_MULTIPLE = "GenerateMultiple";
const EXPAND_HERE       = "Expand";
const LAYOUT            = "Layout";
const REGENERATE        = "Regenerate";

// default settings for generated views
const PROP_SAVE_PARAMETER  = "generate_view_param";
const PROP_EXCLUDE         = "excludeFromView";
const GENERATED_VIEW_FOLDER = "/_Generated";
const DEFAULT_GRAPHDEPTH   = 1;
const DEFAULT_ACTION       = GENERATE_SINGLE;
const DEFAULT_NODE_WIDTH   = 140;
const DEFAULT_NODE_HEIGHT  = 60;
const JUNCTION_DIAMETER    = 14;

// ELK layout defaults
const DEFAULT_ELK_ALGORITHM    = "layered";
const DEFAULT_ELK_DIRECTION    = "RIGHT";
const DEFAULT_ELK_SPACING      = 40;
const DEFAULT_ELK_LAYER_SEP    = 180;
const DEFAULT_ELK_NODE_PLACEMENT = "NONE";
const DEFAULT_ELK_EDGE_ROUTING = "ORTHOGONAL";
const DEFAULT_ELK_PADDING      = 20;

const DEFAULT_PARAM_FILE = "default_parameter.js";
const USER_PARAM_FOLDER  = "user_parameter";

/**
 * ELK.js is loaded via native jArchi CommonJS require (no jvm-npm).
 * Ensure Archi Preferences > Scripting: CommonJS is enabled and engine is GraalVM.
 */
try {
  var elk = require(REPO_ROOT + "node_modules/elkjs/index.js");
  console.log("ELK.js layout engine loaded.\n");
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw "\nELK module not loaded. Enable CommonJS in Archi Preferences > Scripting and use GraalVM.";
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
 * @param {string} direction - dagre-style direction (LR/TB/RL/BT); migrated to elkDirection by _setDefaultParameters
 * @param {object} param - put values into param object
 * @returns
 */
function read_user_parameter(file, user_param_name, action, direction, param = {}) {
  Common.debugStackPush(false);
  Common.debug(`file:\n- ${file}`);

  let path = file.substring(0, Math.max(file.lastIndexOf("/"), file.lastIndexOf("\\")) + 1);

  if (user_param_name) {
    let userParamFile = `${path}${USER_PARAM_FOLDER}/${user_param_name}.js`;

    console.log(`User parameters read from file: \n- ${userParamFile}`);
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
      console.log(`NOT read user parameters from file`);
      Common.debug(`> ${typeof error.stack == "undefined" ? error : error.stack}\n`);
    }
  } else {
    console.log(`${action} with direction ${direction}\n`);
  }

  // Store direction from filename; _setDefaultParameters will migrate to elkDirection
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

      switch (param.action) {
        case GENERATE_SINGLE:
        case EXPAND_HERE:
        case LAYOUT:
          generatedViews.add(_layoutAndRender(param, filteredElements));
          break;

        case GENERATE_MULTIPLE:
          console.log(`Generating views for elements:`);
          filteredElements.forEach(function (e) {
            console.log(`- ${e}`);
          });
          console.log();

          filteredElements.forEach(function (e) {
            param.viewName = e.name + param.viewNameSuffix;
            console.log(`\nGenerating view "${param.viewName}"`);
            console.log(`------------------${"-".repeat(param.viewName.length)}`);
            generatedViews.add(_layoutAndRender(param, $(e)));
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
 * Build ELK data structures, run layout, draw view.
 *
 * @returns Archi view
 */
function _layoutAndRender(param, filteredElements) {
  let elkNodeMap   = {};  // archi/occ id → ELK node object
  let elkEdgeList  = [];  // all edges at root level
  let elkParentMap = {};  // child elk-id → parent archi-id
  let elkParentRels = []; // archi relations used as nesting (for adding nested connections)
  let occurrenceMap = {}; // archi element id → [elk node id, ...]

  _fillGraph(param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, filteredElements);

  const layoutOptions = _buildElkLayoutOptions(param);
  const elkGraph      = _buildElkGraph(param, layoutOptions, elkNodeMap, elkEdgeList, elkParentMap);

  console.log("\nCalculating the graph layout...");
  const layoutedGraph = elk.layout(elkGraph);

  return _drawView(param, layoutedGraph, elkParentRels);
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function _setDefaultParameters(param) {
  let validFlag = true;

  if (param.action == REGENERATE) {
    let view = _getSelectedView();
    console.log(`Action is ${param.action}`);
    console.log(`** Reading param from selected ${view} **\n`);
    Object.assign(param, JSON.parse(view.prop(PROP_SAVE_PARAMETER)));
    param.viewName = "";
  }

  // Migration shim: convert old dagre param names to ELK equivalents (with warning)
  const dagreToElkDir = { LR: "RIGHT", RL: "LEFT", TB: "DOWN", BT: "UP" };
  if (param.graphDirection !== undefined && param.elkDirection === undefined) {
    param.elkDirection = dagreToElkDir[param.graphDirection] || DEFAULT_ELK_DIRECTION;
    console.log(`> Migrated graphDirection="${param.graphDirection}" → elkDirection="${param.elkDirection}"`);
  }
  if (param.hSep !== undefined && param.elkSpacingNodeNode === undefined) {
    param.elkSpacingNodeNode = param.hSep;
    console.log(`> Migrated hSep=${param.hSep} → elkSpacingNodeNode=${param.elkSpacingNodeNode}`);
  }
  if (param.vSep !== undefined && param.elkLayerSpacing === undefined) {
    param.elkLayerSpacing = param.vSep;
    console.log(`> Migrated vSep=${param.vSep} → elkLayerSpacing=${param.elkLayerSpacing}`);
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
  if (param.nestingMultipleOccurrences === undefined) param.nestingMultipleOccurrences = false;
  console.log(`- nestingMultipleOccurrences = ${param.nestingMultipleOccurrences}`);

  console.log("\nELK layout parameters");
  if (param.elkAlgorithm    === undefined) param.elkAlgorithm    = DEFAULT_ELK_ALGORITHM;
  console.log("- elkAlgorithm = "    + param.elkAlgorithm);
  if (param.elkDirection    === undefined) param.elkDirection    = DEFAULT_ELK_DIRECTION;
  console.log("- elkDirection = "    + param.elkDirection);
  if (param.elkSpacingNodeNode === undefined) param.elkSpacingNodeNode = DEFAULT_ELK_SPACING;
  console.log("- elkSpacingNodeNode = " + param.elkSpacingNodeNode);
  if (param.elkLayerSpacing === undefined) param.elkLayerSpacing = DEFAULT_ELK_LAYER_SEP;
  console.log("- elkLayerSpacing = " + param.elkLayerSpacing);
  if (param.elkNodePlacementAlignment === undefined) param.elkNodePlacementAlignment = DEFAULT_ELK_NODE_PLACEMENT;
  console.log("- elkNodePlacementAlignment = " + param.elkNodePlacementAlignment);
  if (param.elkEdgeRouting  === undefined) param.elkEdgeRouting  = DEFAULT_ELK_EDGE_ROUTING;
  console.log("- elkEdgeRouting = "  + param.elkEdgeRouting);
  if (param.elkPadding      === undefined) param.elkPadding      = DEFAULT_ELK_PADDING;
  console.log("- elkPadding = "      + param.elkPadding);
  if (param.nodeWidth  == undefined) param.nodeWidth  = DEFAULT_NODE_WIDTH;
  console.log("- nodeWidth = "  + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = DEFAULT_NODE_HEIGHT;
  console.log("- nodeHeight = " + param.nodeHeight);

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
 */
function _includedElements(param, drawCollection = $(selection)) {
  Common.debug(`drawCollection: ${drawCollection}`);
  var selectedElements = Selection.getSelectionArray(drawCollection, "element");
  Common.debug(`selectedElements: ${selectedElements}`);

  let filteredSelection = selectedElements.filter((obj) => _filterObjectType(obj, param.includeElementType));
  console.log(`- ${filteredSelection.length} element${filteredSelection.length == 1 ? "" : "s"} after filtering`);
  if (filteredSelection.length === 0) throw "No Archimate element match your criterias.";

  return filteredSelection;
}

/**
 * Build ELK layout options object from param
 */
function _buildElkLayoutOptions(param) {
  const opts = {
    "elk.algorithm":    param.elkAlgorithm,
    "elk.direction":    param.elkDirection,
    "elk.spacing.nodeNode":                      String(param.elkSpacingNodeNode),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(param.elkLayerSpacing),
    "elk.edgeRouting":  param.elkEdgeRouting,
  };
  if (param.elkNodePlacementAlignment && param.elkNodePlacementAlignment !== "NONE") {
    opts["elk.layered.nodePlacement.bk.fixedAlignment"] = param.elkNodePlacementAlignment;
  }
  if (param.layoutNested && param.layoutNested.length > 0) {
    opts["elk.hierarchyHandling"] = "INCLUDE_CHILDREN";
  }
  return opts;
}

/**
 * Assemble the ELK graph object from pre-built maps
 */
function _buildElkGraph(param, layoutOptions, elkNodeMap, elkEdgeList, elkParentMap) {
  // Attach children to their parents and set padding
  Object.keys(elkParentMap).forEach(function(childId) {
    const parentId  = elkParentMap[childId];
    const parentNode = elkNodeMap[parentId];
    const childNode  = elkNodeMap[childId];
    if (parentNode && childNode) {
      parentNode.layoutOptions = parentNode.layoutOptions || {};
      const p = param.elkPadding;
      parentNode.layoutOptions["elk.padding"] = `[top=${p},left=${p},bottom=${p},right=${p}]`;
      if (!parentNode.children.some(function(c) { return c.id === childId; })) {
        parentNode.children.push(childNode);
      }
    }
  });

  // Root children = nodes not assigned to a parent
  const rootChildren = Object.keys(elkNodeMap)
    .filter(function(id) { return elkParentMap[id] === undefined; })
    .map(function(id) { return elkNodeMap[id]; });

  return { id: "root", layoutOptions: layoutOptions, children: rootChildren, edges: elkEdgeList };
}

/**
 * Add the filtered selection to the ELK data structures
 */
function _fillGraph(param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, filteredElements) {
  const START_LEVEL = 0;

  switch (param.action) {
    case GENERATE_SINGLE:
    case GENERATE_MULTIPLE:
      console.log(`\nAdding elements and relations to the graph with a depth of ${param.graphDepth}...`);
      filteredElements.forEach(function(archiEle) {
        _addElement(START_LEVEL, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, archiEle, filteredElements);
      });
      break;
    case EXPAND_HERE:
      console.log("Expand selected objects on the view");
      _addViewObjects(START_LEVEL, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap);
      filteredElements.forEach(function(archiEle) {
        _addElement(START_LEVEL, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, archiEle, filteredElements);
      });
      break;
    case LAYOUT:
      console.log("Layout objects on the view");
      _addViewObjects(START_LEVEL, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap);
      break;
    default:
      break;
  }

  console.log("\nAdded to the graph:");
  console.log(`- ${Object.keys(elkNodeMap).length} nodes and`);
  console.log(`- ${elkEdgeList.length} edges`);
  if (elkParentRels.length > 0) console.log(`- ${elkParentRels.length} parent-child nestings`);
}

/**
 * Add all elements and relations of the selected view to the ELK data structures
 */
function _addViewObjects(level, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap) {
  let view = _getSelectedView();

  $(view)
    .find("element")
    .each(function(e) { _createNode(level, param, elkNodeMap, occurrenceMap, e); });
  $(view)
    .find("relation")
    .filter(function(rel) { return $(rel).ends().is("element"); })
    .each(function(r) {
      _addRelation(0, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, r.concept);
    });
}

/**
 * get the selected view or the view of selected objects
 */
function _getSelectedView() {
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
 * Main recursive function: add the given element and its related elements to the graph
 */
function _addElement(level, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, archiEle, filteredElements) {
  const STOPPED     = false;
  const NOT_STOPPED = true;
  Common.debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  if ((param.graphDepth > 0 && level > param.graphDepth) || (param.graphDepth == 0 && level > 1)) {
    Common.debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${param.graphDepth}`);
    return STOPPED;
  }

  _createNode(level, param, elkNodeMap, occurrenceMap, archiEle);
  Common.debug(`archiEle: ${archiEle}`);

  $(archiEle)
    .rels()
    .filter(function(rel) { return _filterObjectType(rel, param.includeRelationType); })
    .filter(function(rel) { return !(rel.prop(PROP_EXCLUDE) == "true" && param.excludeFromView); })
    .filter(function(rel) { return $(rel).ends().is("element"); })
    .each(function(rel) {
      let related_element = rel.source;
      if (archiEle.id != rel.target.id) related_element = rel.target;

      if (param.graphDepth == 0 && filteredElements.filter(function(e) { return e.id == related_element.id; }).length < 1) {
        Common.debug(`${"  ".repeat(level)}> Skip; not in selection ${related_element}`);
      } else {
        if (_filterObjectType(related_element, param.includeElementType)) {
          if (_addElement(level + 1, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, related_element, filteredElements) == NOT_STOPPED) {
            Common.debug(`>>>> rel: ${rel}`);
            _addRelation(level, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, rel);
          }
        }
      }
    });
  return NOT_STOPPED;
}

/**
 * Add the given element as a node to the ELK node map
 */
function _createNode(level, param, elkNodeMap, occurrenceMap, archiEle) {
  const e = Common.concept(archiEle);
  if (!elkNodeMap[e.id]) {
    const isJunction = e.type === "junction";
    const w = isJunction ? JUNCTION_DIAMETER : param.nodeWidth;
    const h = isJunction ? JUNCTION_DIAMETER : param.nodeHeight;
    elkNodeMap[e.id] = { id: e.id, _archiId: e.id, width: w, height: h, children: [], edges: [] };
    occurrenceMap[e.id] = [e.id];
    Common.debug(`${"  ".repeat(level)}> Add node ${archiEle}`);
  } else {
    Common.debug(`${"  ".repeat(level)}> Skip; already added ${archiEle}`);
  }
}

/**
 * Route a relation to edge or parent creation
 * ELK handles cyclic relations natively — no separate circular list needed.
 */
function _addRelation(level, param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, rel) {
  if (param.layoutNested.includes(rel.type)) {
    _createParent(level, param, elkNodeMap, elkParentMap, occurrenceMap, elkParentRels, rel);
  } else {
    _createEdge(level, param, occurrenceMap, elkEdgeList, rel);
  }
}

/**
 * Add the given relation as an ELK edge
 *
 * In nestingMultipleOccurrences mode, edges are created for each occurrence combination.
 */
function _createEdge(level, param, occurrenceMap, elkEdgeList, rel) {
  Common.debugStackPush(false);
  const reversed = param.layoutReversed.includes(rel.type);

  const srcOccs = occurrenceMap[rel.source.id] || [rel.source.id];
  const tgtOccs = occurrenceMap[rel.target.id] || [rel.target.id];

  srcOccs.forEach(function(srcId, si) {
    tgtOccs.forEach(function(tgtId, ti) {
      const edgeId = (srcOccs.length === 1 && tgtOccs.length === 1)
        ? rel.id
        : `${rel.id}_${si}_${ti}`;

      if (!elkEdgeList.some(function(e) { return e.id === edgeId; })) {
        elkEdgeList.push({
          id: edgeId,
          _archiRelId: rel.id,
          sources: [reversed ? tgtId : srcId],
          targets: [reversed ? srcId : tgtId],
        });
        Common.debug(
          `${"  ".repeat(level)}> Add edge: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, reversed ? Common.FORMAT_REVERSED : Common.FORMAT_NOT_REVERSED)}`
        );
      }
    });
  });
  Common.debugStackPop();
}

/**
 * Record the given relation as a parent-child nesting in elkParentMap.
 *
 * nestingMultipleOccurrences=false (default): child goes into the first parent only.
 * nestingMultipleOccurrences=true:  a separate visual occurrence is created for each parent.
 */
function _createParent(level, param, elkNodeMap, elkParentMap, occurrenceMap, elkParentRels, rel) {
  Common.debugStackPush(false);

  if (elkParentRels.some(function(r) { return r.id === rel.id; })) {
    Common.debug(`${"  ".repeat(level)}> Skip, already in parent-list ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`);
    Common.debugStackPop();
    return;
  }

  const reversed     = param.layoutReversed.includes(rel.type);
  const childArchiId = reversed ? rel.source.id : rel.target.id;
  const parentArchiId = reversed ? rel.target.id : rel.source.id;

  if (!param.nestingMultipleOccurrences) {
    // Default: assign to first parent only
    if (elkParentMap[childArchiId] !== undefined) {
      console.log(`> Multi-parent: ${childArchiId} already in ${elkParentMap[childArchiId]}, skipping ${parentArchiId}. Set nestingMultipleOccurrences=true to render in both.`);
    } else {
      elkParentMap[childArchiId] = parentArchiId;
      Common.debug(`${"  ".repeat(level)}> Add Parent${reversed ? "<-" : "->"}Child: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, reversed ? Common.FORMAT_REVERSED : Common.FORMAT_NOT_REVERSED)}`);
    }
  } else {
    // Multiple occurrences: assign base occurrence if unassigned; else create new occurrence
    const occs = occurrenceMap[childArchiId] || [];
    const unassigned = occs.find(function(occId) { return elkParentMap[occId] === undefined; });
    if (unassigned) {
      elkParentMap[unassigned] = parentArchiId;
      Common.debug(`${"  ".repeat(level)}> Assign occurrence ${unassigned} to parent ${parentArchiId}`);
    } else {
      const alreadyInParent = occs.find(function(occId) { return elkParentMap[occId] === parentArchiId; });
      if (!alreadyInParent) {
        const n = occs.length;
        const occId = `${childArchiId}_occ_${n}`;
        const baseNode = elkNodeMap[childArchiId];
        elkNodeMap[occId] = { id: occId, _archiId: childArchiId, width: baseNode.width, height: baseNode.height, children: [], edges: [] };
        occurrenceMap[childArchiId].push(occId);
        elkParentMap[occId] = parentArchiId;
        Common.debug(`${"  ".repeat(level)}> Create occurrence ${occId} in parent ${parentArchiId}`);
      }
    }
  }

  elkParentRels.push(rel);
  Common.debugStackPop();
}

function _filterObjectType(o, objectTypeFilter) {
  if (objectTypeFilter.length == 0) return true;
  return objectTypeFilter.includes(o.type);
}

/**
 * Draw the ELK-layouted graph as an Archi view
 */
function _drawView(param, layoutedGraph, elkParentRels) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder != "") {
    folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);
  }

  let view = _getView(folder, param.viewName);
  view.prop(PROP_SAVE_PARAMETER, JSON.stringify(param, null, " "));

  let visualElementIndex = {};

  console.log("Drawing graph nodes as elements ...");
  (layoutedGraph.children || []).forEach(function(node) {
    _drawNodeRecursive(param, node, null, visualElementIndex, view);
  });

  console.log("Drawing graph edges as relations ...");
  _drawEdgesRecursive(layoutedGraph, param, visualElementIndex, view);

  if (elkParentRels.length > 0) console.log("Adding child-parent relations to the view ...");
  elkParentRels.forEach(function(parentRel) {
    _layoutNestedConnection(parentRel, visualElementIndex, view);
  });

  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  _openView(view);
  return view;
}

/**
 * Recursively draw an ELK node and its children.
 * ELK coords: x,y = top-left corner; child coords are relative to parent.
 */
function _drawNodeRecursive(param, elkNode, parentVisual, visualElementIndex, view) {
  const archiId      = elkNode._archiId || elkNode.id;
  const archiElement = $("#" + archiId).first();
  const x = parseInt(elkNode.x || 0);
  const y = parseInt(elkNode.y || 0);
  const w = (elkNode.width  || param.nodeWidth)  + 1;
  const h = (elkNode.height || param.nodeHeight) + 1;

  try {
    Common.debug(`>> draw ${archiElement} at (${x},${y}) w=${w} h=${h} parent=${parentVisual ? parentVisual : "view"}`);
    let visual;
    if (parentVisual === null) {
      visual = view.add(archiElement, x, y, w, h);
    } else {
      visual = parentVisual.add(archiElement, x, y, w, h);
    }
    visualElementIndex[elkNode.id] = visual;

    // ELK child x,y are already relative to parent — recurse
    (elkNode.children || []).forEach(function(child) {
      _drawNodeRecursive(param, child, visual, visualElementIndex, view);
    });
  } catch (e) {
    console.error("-->" + e + "\n" + e.stack);
  }
}

/**
 * Recursively draw all ELK edges in the graph tree
 */
function _drawEdgesRecursive(elkNode, param, visualElementIndex, view) {
  (elkNode.edges || []).forEach(function(edge) {
    _drawEdge(param, edge, visualElementIndex, view);
  });
  (elkNode.children || []).forEach(function(child) {
    _drawEdgesRecursive(child, param, visualElementIndex, view);
  });
}

function _drawEdge(param, edge, visualElementIndex, view) {
  Common.debugStackPush(false);
  const archiRelId = edge._archiRelId || edge.id;
  const archiRel   = $("#" + archiRelId).first();
  const srcId      = edge.sources[0];
  const tgtId      = edge.targets[0];
  const srcVisual  = visualElementIndex[srcId];
  const tgtVisual  = visualElementIndex[tgtId];

  if (!srcVisual || !tgtVisual) {
    Common.debug(`>> skip edge ${archiRelId}: missing visual for src=${srcId} or tgt=${tgtId}`);
    Common.debugStackPop();
    return;
  }

  Common.debug(`>> draw edge ${archiRel}`);
  let connection = view.add(archiRel, srcVisual, tgtVisual);
  _drawBendpoints(param, edge, connection);
  Common.debugStackPop();
}

function _getView(folder, viewName) {
  var v;
  v = $(folder).children("view").filter(`.${viewName}`).first();

  if (v) {
    console.log(`Found ${v}. Overwriting ...`);
    $(v)
      .find()
      .each(function(o) { o.delete(); });
  } else {
    v = model.createArchimateView(viewName);
    console.log(`Creating view: ${v.name}`);
    folder.add(v);
  }
  return v;
}

/**
 * add a connection for a nested relation
 *   depending on the Archi preferences, the connection is or is not drawn
 *   See Edit > preferences > connections > ARM > enable implicit connections
 */
function _layoutNestedConnection(parentRel, visualElementIndex, view) {
  Common.debugStackPush(false);
  Common.debug(`parentRel: ${Common.formatRelation(parentRel, Common.FORMAT_WITH_TYPES)}`);
  const srcVisual = visualElementIndex[parentRel.source.id];
  const tgtVisual = visualElementIndex[parentRel.target.id];
  if (srcVisual && tgtVisual) {
    view.add(parentRel, srcVisual, tgtVisual);
  }
  Common.debugStackPop();
}

/**
 * Add bendpoints to an Archi connection from ELK edge sections.
 *
 * ELK sections[0].bendPoints are the intermediate waypoints (absolute coords).
 * Archi bendpoints are relative to the center of source and target.
 */
function _drawBendpoints(param, edge, connection) {
  Common.debugStackPush(false);

  let srcCenter = _getCenterBounds(connection.source);
  let tgtCenter = _getCenterBounds(connection.target);

  let points = (edge.sections && edge.sections[0] && edge.sections[0].bendPoints) || [];
  Common.debug(`ELK bendPoints: ${JSON.stringify(points)}`);

  let bendpoints = points.map(function(p) { return _calcBendpoint(p, srcCenter, tgtCenter); });

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
    endX:   parseInt(point.x - tgtCenter.x),
    endY:   parseInt(point.y - tgtCenter.y),
  };

  Common.debug(`ELK point: ${JSON.stringify(point)}`);
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

// recursive: if element is nested, add parent offsets to get absolute coordinates
function _getCenterBoundsAbsolute(element, center) {
  let parent = $(element).parent().filter("element").first();
  if (parent) {
    Common.debug(`center ${element}=${JSON.stringify(center)}`);
    center.x += parent.bounds.x;
    center.y += parent.bounds.y;
    _getCenterBoundsAbsolute(parent, center);
  }
  return;
}

function _openView(view) {
  try {
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
    DEFAULT_ELK_ALGORITHM,
    DEFAULT_ELK_DIRECTION,
    DEFAULT_ELK_SPACING,
    DEFAULT_ELK_LAYER_SEP,
    DEFAULT_ELK_NODE_PLACEMENT,
    DEFAULT_ELK_EDGE_ROUTING,
    DEFAULT_ELK_PADDING,
    GENERATED_VIEW_FOLDER,
    PROP_SAVE_PARAMETER,
    PROP_EXCLUDE,
    ELEMENT_NAMES,
    RELATION_NAMES,
  };
}
