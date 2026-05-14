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

// default settings for generated views
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
const NESTED_LABEL_TOP_EXTRA   = 30; // extra top padding so Archi's container label doesn't overlap children

// Relation type weights for weight-driven layout (elk.priority).
// Higher weight = stronger attraction between connected elements.
const RELATION_WEIGHTS = {
  "composition-relationship":    3.0, // structural containment — tightest coupling
  "aggregation-relationship":    2.5, // structural grouping
  "realization-relationship":    2.0, // interface-to-implementation dependency
  "specialization-relationship": 2.0, // inheritance — strong conceptual coupling
  "assignment-relationship":     1.5, // role-to-behaviour assignment
  "serving-relationship":        1.5, // functional dependency
  "triggering-relationship":     1.5, // ordered behavioural sequence
  "flow-relationship":           1.2, // information or material flow
  "access-relationship":         1.0, // functional use
  "association-relationship":    1.0, // general connection
  "influence-relationship":      0.5, // soft, indirect effect — weakest
};

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

let dagre = null;
try {
  dagre = require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js");
  console.log("dagre-cluster-fix layout engine loaded.\n");
} catch(e) { /* optional — ELK-only mode if absent */ }

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
  if (param.elkAlgorithm === "dagre")    return _layoutAndRenderDagre(param, filteredElements);
  if (param.elkAlgorithm === "graphviz") return _layoutAndRenderGraphviz(param, filteredElements);

  let elkNodeMap   = {};
  let elkEdgeList  = [];
  let elkParentMap = {};
  let elkParentRels = [];
  let occurrenceMap = {};

  _fillGraph(param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, filteredElements);

  const layoutOptions = _buildElkLayoutOptions(param);

  // Two-pass layout when elkSameTypeResize is set:
  // Pass 1 discovers actual container sizes; leaf siblings are equalized (width AND height)
  // to the largest sibling before pass 2 so mixed rows look visually uniform.
  if (param.elkSameTypeResize) {
    // Snapshot original sizes so compound nodes can be reset cleanly before pass 2
    const origSizes = {};
    Object.keys(elkNodeMap).forEach(function(id) {
      origSizes[id] = { width: elkNodeMap[id].width, height: elkNodeMap[id].height };
    });

    const { elkGraph: g1 } = _buildElkGraph(param, layoutOptions, elkNodeMap, elkEdgeList, elkParentMap);
    console.log("\nCalculating the graph layout (pass 1 — equalise siblings)...");
    elk.layout(g1);

    // For each compound node in the result, collect the max sibling width and height,
    // then record equalized sizes for leaf children only.
    // Pass 1a: find global minimum container dimensions across the entire diagram
    let globalMinW = Infinity;
    function collectMinContainerSize(node) {
      if (!node.children || node.children.length === 0) return;
      if (node.id !== "root") {
        if (node.width < globalMinW) globalMinW = node.width;
      }
      node.children.forEach(collectMinContainerSize);
    }
    collectMinContainerSize(g1);

    // Pass 1b: equalize siblings
    // - leaf next to container  → global min size (width + height)
    // - container narrower than globalMinW → extra horizontal padding to reach globalMinW
    const equalizedSizes  = {};  // leaf id       → { width, height }
    const extraHPaddings  = {};  // container id  → extra px per side (left + right)
    function equalizeSiblings(node) {
      if (!node.children || node.children.length === 0) return;
      node.children.forEach(equalizeSiblings);
      let hasContainerSibling = node.children.some(function(c) { return c.children && c.children.length > 0; });
      if (!hasContainerSibling) return;
      var containerType = node._type; // only resize leaf children whose type matches the container
      node.children.forEach(function(c) {
        if (!c.children || c.children.length === 0) {
          if (containerType && c._type === containerType) {
            equalizedSizes[c.id] = { width: globalMinW };
          }
        } else if (c.width < globalMinW) {
          extraHPaddings[c.id] = (globalMinW - c.width) / 2;
        }
      });
    }
    equalizeSiblings(g1);

    // Reset ALL nodes to original sizes (so compound nodes are recomputed freely in pass 2),
    // then apply equalized leaf sizes and extra padding hints for narrow containers.
    Object.keys(elkNodeMap).forEach(function(id) {
      elkNodeMap[id].children = [];
      elkNodeMap[id].edges    = [];
      delete elkNodeMap[id].layoutOptions;
      delete elkNodeMap[id].x;
      delete elkNodeMap[id].y;
      delete elkNodeMap[id]._extraHPadding;
      elkNodeMap[id].width  = origSizes[id].width;
      elkNodeMap[id].height = origSizes[id].height;
    });
    Object.keys(equalizedSizes).forEach(function(id) {
      if (elkNodeMap[id]) {
        elkNodeMap[id].width  = equalizedSizes[id].width;
      }
    });
    Object.keys(extraHPaddings).forEach(function(id) {
      if (elkNodeMap[id]) elkNodeMap[id]._extraHPadding = extraHPaddings[id];
    });
    console.log("Calculating the graph layout (pass 2 — equalised sizes)...");
  } else {
    console.log("\nCalculating the graph layout...");
  }

  const { elkGraph, liftedEdgesMap } = _buildElkGraph(param, layoutOptions, elkNodeMap, elkEdgeList, elkParentMap);
  const layoutedGraph = elk.layout(elkGraph);

  return _drawView(param, layoutedGraph, elkParentRels, liftedEdgesMap, elkParentMap, occurrenceMap);
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function _setDefaultParameters(param) {
  let validFlag = true;

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
  (function() {
    const validDirs = ["", "in", "out", "both"];
    console.log("- includeRelationType:");
    if (param.includeRelationType.length === 0) {
      console.log("  - no filter");
    } else {
      param.includeRelationType.forEach(function(entry) {
        let ci   = entry.indexOf(":");
        let type = ci >= 0 ? entry.substring(0, ci) : entry;
        let dir  = ci >= 0 ? entry.substring(ci + 1) : "";
        if (RELATION_NAMES.includes(type) && validDirs.includes(dir)) {
          console.log("  - " + entry);
        } else {
          console.error("  - " + entry
            + (!RELATION_NAMES.includes(type) ? " (unknown type)" : "")
            + (!validDirs.includes(dir)        ? " (unknown direction)" : ""));
          validFlag = false;
        }
      });
    }
  })();
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
  if (param.elkPadding           === undefined) param.elkPadding           = DEFAULT_ELK_PADDING;
  console.log("- elkPadding = "           + param.elkPadding);
  if (param.elkNestedAlgorithm        === undefined) param.elkNestedAlgorithm        = "";
  console.log("- elkNestedAlgorithm = "        + (param.elkNestedAlgorithm || "(same as root)"));
  if (param.elkNestedSpacingNodeNode  === undefined) param.elkNestedSpacingNodeNode  = DEFAULT_ELK_SPACING;
  if (param.elkSameTypeResize          === undefined) param.elkSameTypeResize          = false;
  if (param.elkSortLeavesOnly         === undefined) param.elkSortLeavesOnly         = false;
  if (param.graphvizBin    === undefined) param.graphvizBin    = "dot";
  if (param.graphvizEngine === undefined) param.graphvizEngine = "dot";
  if (param.graphvizSplines=== undefined) param.graphvizSplines= "ORTHOGONAL";
  if (param.viewMaxWidth    === undefined) param.viewMaxWidth    = 0;
  if (param.viewMaxHeight   === undefined) param.viewMaxHeight   = 0;
  if (param.viewAspectRatio === undefined) param.viewAspectRatio = 0;
  console.log("- viewMaxWidth = "    + param.viewMaxWidth    + (param.viewMaxWidth    > 0 ? " px" : " (no limit)"));
  console.log("- viewMaxHeight = "   + param.viewMaxHeight   + (param.viewMaxHeight   > 0 ? " px" : " (no limit)"));
  console.log("- viewAspectRatio = " + param.viewAspectRatio + (param.viewAspectRatio > 0 ? "" : " (no limit)"));
  if (param.elkNestedAlgorithm) console.log("- elkNestedSpacingNodeNode = " + param.elkNestedSpacingNodeNode + ", sameTypeResize = " + param.elkSameTypeResize);
  if (param.nodeWidth  == undefined) param.nodeWidth  = DEFAULT_NODE_WIDTH;
  console.log("- nodeWidth = "  + param.nodeWidth);
  if (param.nodeHeight == undefined) param.nodeHeight = DEFAULT_NODE_HEIGHT;
  console.log("- nodeHeight = " + param.nodeHeight);

  if (param.useRelationWeights === undefined) param.useRelationWeights = false;
  console.log(`- useRelationWeights = ${param.useRelationWeights}`);

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
    // STRAIGHT: pseudo-value — tell ELK POLYLINE but suppress bendpoints in draw step.
    // SPLINES: unsupported in Archi (bezier control points ≠ polyline waypoints).
    "elk.edgeRouting": (param.elkEdgeRouting === "STRAIGHT" || param.elkEdgeRouting === "SPLINES")
      ? "POLYLINE" : param.elkEdgeRouting,
  };
  if (param.elkNodePlacementAlignment && param.elkNodePlacementAlignment !== "NONE") {
    opts["elk.layered.nodePlacement.bk.fixedAlignment"] = param.elkNodePlacementAlignment;
  }
  if (param.elkAlgorithm === "rectpacking") {
    opts["elk.rectpacking.packing.compaction.iterations"]            = 5;
    opts["elk.rectpacking.packing.compaction.rowHeightReevaluation"] = true;
    if (param.viewMaxWidth > 0) {
      opts["elk.rectpacking.widthApproximation.targetWidth"] = String(param.viewMaxWidth);
      console.log("- elk.rectpacking.widthApproximation.targetWidth = " + param.viewMaxWidth);
    }
    if (param.viewAspectRatio > 0) {
      opts["elk.aspectRatio"] = String(param.viewAspectRatio);
      console.log("- elk.aspectRatio = " + param.viewAspectRatio);
    }
  }
  const ELK_ASPECT_RATIO_ALGOS = ["force", "stress", "radial"];
  if (param.viewAspectRatio > 0 && ELK_ASPECT_RATIO_ALGOS.indexOf(param.elkAlgorithm) >= 0)
    opts["elk.aspectRatio"] = String(param.viewAspectRatio);
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
      const p  = param.elkPadding;
      const ph = p + (parentNode._extraHPadding || 0);
      const top = p + NESTED_LABEL_TOP_EXTRA;
      parentNode.layoutOptions["elk.padding"] = `[top=${top},left=${ph},bottom=${p},right=${ph}]`;
      if (!parentNode.children.some(function(c) { return c.id === childId; })) {
        parentNode.children.push(childNode);
      }
    }
  });

  // Sort children: containers first (sorted by type+name), then leaf nodes (sorted by type+name).
  // With elkSortLeavesOnly: containers keep model order, only leaf nodes are sorted.
  function byTypeName(a, b) {
    return (a._type || '').localeCompare(b._type || '') || (a._name || '').localeCompare(b._name || '');
  }
  function sortChildren(nodes) {
    if (param.elkSortLeavesOnly) {
      // Containers stay in model insertion order — ELK is free to optimise placement.
      // Only leaf nodes are sorted alphabetically, reinserted at their original leaf slots.
      const leafIdxs = [], sortedLeaves = [];
      nodes.forEach(function(n, i) {
        if (!n.children || n.children.length === 0) { leafIdxs.push(i); sortedLeaves.push(n); }
      });
      sortedLeaves.sort(byTypeName);
      const result = nodes.slice();
      leafIdxs.forEach(function(pos, i) { result[pos] = sortedLeaves[i]; });
      return result;
    }
    // Default: containers first (sorted by type+name), then leaves (sorted by type+name)
    const ctrs   = nodes.filter(function(n) { return n.children && n.children.length > 0; });
    const leaves = nodes.filter(function(n) { return !n.children || n.children.length === 0; });
    ctrs.sort(byTypeName);
    leaves.sort(byTypeName);
    return ctrs.concat(leaves);
  }
  Object.keys(elkNodeMap).forEach(function(nodeId) {
    const node = elkNodeMap[nodeId];
    if (node.children && node.children.length > 1) {
      node.children = sortChildren(node.children);
    }
  });

  // Root children = nodes not assigned to a parent
  const rootChildren = sortChildren(
    Object.keys(elkNodeMap)
      .filter(function(id) { return elkParentMap[id] === undefined; })
      .map(function(id) { return elkNodeMap[id]; })
  );

  // Classify edges: internal (both endpoints under the same compound parent) go into
  // the compound node's own edges array so ELK routes them within the container.
  // Cross-level and root-level edges stay in root.
  const rootEdges = [];
  elkEdgeList.forEach(function(edge) {
    const srcParent = elkParentMap[edge.sources[0]];
    const tgtParent = elkParentMap[edge.targets[0]];
    if (srcParent !== undefined && tgtParent !== undefined && srcParent === tgtParent) {
      const parentNode = elkNodeMap[srcParent];
      if (parentNode) {
        parentNode.edges = parentNode.edges || [];
        parentNode.edges.push(edge);
        return;
      }
    }
    rootEdges.push(edge);
  });

  // Propagate root layout options to every compound node that has internal edges,
  // so its sub-layout uses the same algorithm/direction/routing as the root.
  // Preserve the elk.padding that was set during child-parent attachment above.
  Object.keys(elkNodeMap).forEach(function(nodeId) {
    const node = elkNodeMap[nodeId];
    if (node.edges && node.edges.length > 0) {
      const padding = node.layoutOptions && node.layoutOptions["elk.padding"];
      node.layoutOptions = Object.assign({}, layoutOptions);
      if (padding) node.layoutOptions["elk.padding"] = padding;
    }
  });

  // Apply inner gap to all compound nodes (all ELK algorithms).
  if (param.elkNestedSpacingNodeNode !== undefined) {
    Object.keys(elkNodeMap).forEach(function(nodeId) {
      const node = elkNodeMap[nodeId];
      if (node.children && node.children.length > 0) {
        node.layoutOptions = node.layoutOptions || {};
        node.layoutOptions["elk.spacing.nodeNode"] = param.elkNestedSpacingNodeNode;
      }
    });
  }

  // Override algorithm for all compound nodes when elkNestedAlgorithm is set.
  // Runs after the propagation loop so it wins over any inherited root algorithm.
  if (param.elkNestedAlgorithm) {
    Object.keys(elkNodeMap).forEach(function(nodeId) {
      const node = elkNodeMap[nodeId];
      if (node.children && node.children.length > 0) {
        node.layoutOptions = node.layoutOptions || {};
        node.layoutOptions["elk.algorithm"] = param.elkNestedAlgorithm;
        if (param.elkNestedAlgorithm === "rectpacking") {
          node.layoutOptions["elk.rectpacking.orderBySize"]                                = param.elkSortLeavesOnly;
          node.layoutOptions["elk.rectpacking.packing.compaction.iterations"]              = 5;
          node.layoutOptions["elk.rectpacking.packing.compaction.rowHeightReevaluation"]   = true;
          if (param.viewMaxWidth    > 0) node.layoutOptions["elk.rectpacking.widthApproximation.targetWidth"] = String(param.viewMaxWidth);
          if (param.viewAspectRatio > 0) node.layoutOptions["elk.aspectRatio"]                                 = String(param.viewAspectRatio);
        }
      }
    });
  }

  // ELK SEPARATE_CHILDREN ignores cross-hierarchy edges (source/target inside a compound).
  // Lift such endpoints to their root-level ancestor so ELK can use the edges for
  // root-level layering. The original IDs are preserved in liftedEdgesMap for drawing.
  const liftedEdgesMap = {};
  const liftedRootEdges = rootEdges.map(function(edge) {
    const srcId = edge.sources[0];
    const tgtId = edge.targets[0];
    let liftedSrc = srcId;
    let p = elkParentMap[liftedSrc];
    while (p !== undefined) { liftedSrc = p; p = elkParentMap[liftedSrc]; }
    let liftedTgt = tgtId;
    p = elkParentMap[liftedTgt];
    while (p !== undefined) { liftedTgt = p; p = elkParentMap[liftedTgt]; }
    if (liftedSrc === liftedTgt) return null; // both sides same compound after lifting — skip
    if (liftedSrc !== srcId || liftedTgt !== tgtId) {
      liftedEdgesMap[edge.id] = { origSrcId: srcId, origTgtId: tgtId };
      return Object.assign({}, edge, { sources: [liftedSrc], targets: [liftedTgt] });
    }
    return edge;
  }).filter(Boolean);

  const elkGraph = { id: "root", layoutOptions: layoutOptions, children: rootChildren, edges: liftedRootEdges };
  return { elkGraph: elkGraph, liftedEdgesMap: liftedEdgesMap };
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
    .filter(function(rel) { return _filterRelationType(rel, param.includeRelationType, archiEle); })
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
    elkNodeMap[e.id] = { id: e.id, _archiId: e.id, _name: e.name || "", _type: e.type || "", width: w, height: h, children: [], edges: [] };
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
        const weight = param.useRelationWeights ? (RELATION_WEIGHTS[rel.type] || 1.0) : undefined;
        elkEdgeList.push({
          id: edgeId,
          _archiRelId: rel.id,
          sources: [reversed ? tgtId : srcId],
          targets: [reversed ? srcId : tgtId],
          ...(weight !== undefined ? { properties: { "elk.priority": weight } } : {}),
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
        elkNodeMap[occId] = { id: occId, _archiId: childArchiId, _name: baseNode._name || "", _type: baseNode._type || "", width: baseNode.width, height: baseNode.height, children: [], edges: [] };
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

function _filterRelationType(rel, includeRelationType, fromElement) {
  if (includeRelationType.length === 0) return true;
  for (let i = 0; i < includeRelationType.length; i++) {
    let entry = includeRelationType[i];
    let ci    = entry.indexOf(":");
    let type  = ci >= 0 ? entry.substring(0, ci) : entry;
    let dir   = ci >= 0 ? entry.substring(ci + 1) : "";
    if (type !== rel.type) continue;
    if (dir === "" || dir === "both")  return true;
    if (dir === "out") return fromElement.id === rel.source.id;
    if (dir === "in")  return fromElement.id === rel.target.id;
    return true;
  }
  return false;
}

/**
 * Draw the ELK-layouted graph as an Archi view
 */
function _drawView(param, layoutedGraph, elkParentRels, liftedEdgesMap, elkParentMap, occurrenceMap) {
  console.log(`\nDrawing ArchiMate view...  `);

  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder != "") {
    folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);
  }

  let view = _getView(folder, param.viewName);

  let visualElementIndex = {};

  console.log("Drawing graph nodes as elements ...");
  (layoutedGraph.children || []).forEach(function(node) {
    _drawNodeRecursive(param, node, null, visualElementIndex, view);
  });

  console.log("Drawing graph edges as relations ...");
  _drawEdgesRecursive(layoutedGraph, param, visualElementIndex, view, liftedEdgesMap);

  if (elkParentRels.length > 0) console.log("Adding child-parent relations to the view ...");
  elkParentRels.forEach(function(parentRel) {
    const srcId = parentRel.source.id;
    const tgtId = parentRel.target.id;
    let srcVisual, tgtVisual;
    const tgtOccs = (occurrenceMap && occurrenceMap[tgtId]) || [tgtId];
    const tgtOcc  = tgtOccs.find(function(occId) { return elkParentMap && elkParentMap[occId] === srcId; });
    if (tgtOcc) {
      srcVisual = visualElementIndex[srcId];
      tgtVisual = visualElementIndex[tgtOcc];
    } else {
      const srcOccs = (occurrenceMap && occurrenceMap[srcId]) || [srcId];
      const srcOcc  = srcOccs.find(function(occId) { return elkParentMap && elkParentMap[occId] === tgtId; });
      srcVisual = visualElementIndex[srcOcc || srcId];
      tgtVisual = visualElementIndex[tgtId];
    }
    if (srcVisual && tgtVisual) view.add(parentRel, srcVisual, tgtVisual);
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
function _drawEdgesRecursive(elkNode, param, visualElementIndex, view, liftedEdgesMap) {
  // Edges in a compound node (id !== "root") have container-relative ELK coords.
  const containerNodeId = (elkNode.id === "root") ? null : elkNode.id;
  (elkNode.edges || []).forEach(function(edge) {
    _drawEdge(param, edge, visualElementIndex, view, containerNodeId, liftedEdgesMap);
  });
  (elkNode.children || []).forEach(function(child) {
    _drawEdgesRecursive(child, param, visualElementIndex, view, liftedEdgesMap);
  });
}

function _drawEdge(param, edge, visualElementIndex, view, containerNodeId, liftedEdgesMap) {
  Common.debugStackPush(false);
  const archiRelId = edge._archiRelId || edge.id;
  const archiRel   = $("#" + archiRelId).first();
  // Cross-hierarchy edges have their endpoints lifted to compound IDs for root layout;
  // use the original child IDs for drawing the actual Archi connection.
  const liftedIds = liftedEdgesMap && liftedEdgesMap[edge.id];
  const srcId = (liftedIds && liftedIds.origSrcId) || edge.sources[0];
  const tgtId = (liftedIds && liftedIds.origTgtId) || edge.targets[0];
  // For reversed relations, sources/targets in the ELK edge are swapped for layout;
  // swap back so view.add() receives the correct ArchiMate connection direction.
  const isReversed = param.layoutReversed.includes(archiRel.type);
  const srcVisual  = visualElementIndex[isReversed ? tgtId : srcId];
  const tgtVisual  = visualElementIndex[isReversed ? srcId : tgtId];

  if (!srcVisual || !tgtVisual) {
    Common.debug(`>> skip edge ${archiRelId}: missing visual for src=${srcId} or tgt=${tgtId}`);
    Common.debugStackPop();
    return;
  }

  // For internal edges, compute the container's absolute top-left so bendpoints
  // can be converted from container-relative to absolute coords.
  let containerOffset = null;
  if (containerNodeId) {
    const cv = visualElementIndex[containerNodeId];
    if (cv) {
      let ox = cv.bounds.x, oy = cv.bounds.y;
      let p = $(cv).parent().filter("element").first();
      while (p) { ox += p.bounds.x; oy += p.bounds.y; p = $(p).parent().filter("element").first(); }
      containerOffset = { x: ox, y: oy };
    }
  }

  Common.debug(`>> draw edge ${archiRel}`);
  let connection = view.add(archiRel, srcVisual, tgtVisual);
  // Lifted cross-compound edges were routed by ELK between compound boundaries,
  // not between the actual child elements — those bendpoints produce wrong visuals.
  // Skip them: a straight child-to-child line is cleaner than an exit/re-entry path.
  if (!liftedIds) {
    _drawBendpoints(param, edge, connection, containerOffset);
  }
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
function _drawBendpoints(param, edge, connection, containerOffset) {
  Common.debugStackPush(false);

  if (param.elkEdgeRouting === "STRAIGHT") { Common.debugStackPop(); return; }

  let points = (edge.sections && edge.sections[0] && edge.sections[0].bendPoints) || [];
  Common.debug(`ELK bendPoints: ${JSON.stringify(points)}`);

  // Internal edges are routed by ELK in container-relative coordinates.
  // containerOffset (set by _drawEdge) converts them to absolute.
  const offsetX = containerOffset ? containerOffset.x : 0;
  const offsetY = containerOffset ? containerOffset.y : 0;

  let srcCenter = _getCenterBounds(connection.source);
  let tgtCenter = _getCenterBounds(connection.target);

  let bendpoints = points.map(function(p) {
    return _calcBendpoint({ x: p.x + offsetX, y: p.y + offsetY }, srcCenter, tgtCenter);
  });

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

// ── Dagre (dagre-cluster-fix) engine ────────────────────────────────────────

function _layoutAndRenderDagre(param, filteredElements) {
  if (!dagre) throw "dagre-cluster-fix not loaded. Check node_modules/dagre-cluster-fix/index.js.";

  let elkNodeMap = {}, elkEdgeList = [], elkParentMap = {}, elkParentRels = [], occurrenceMap = {};
  _fillGraph(param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, filteredElements);

  const graph = _buildDagreGraph(param, elkNodeMap, elkEdgeList, elkParentMap);
  console.log("\nCalculating the Dagre graph layout...");
  dagre.layout(graph);

  return _drawDagreView(param, graph, elkParentRels, elkParentMap, occurrenceMap);
}

function _buildDagreGraph(param, elkNodeMap, elkEdgeList, elkParentMap) {
  const elkToDir = { RIGHT: "LR", LEFT: "RL", DOWN: "TB", UP: "BT" };
  const graph = new dagre.graphlib.Graph({ directed: true, compound: true, multigraph: true })
    .setGraph({
      rankdir: elkToDir[param.elkDirection] || "LR",
      nodesep: param.elkSpacingNodeNode,
      ranksep: param.elkLayerSpacing,
      ranker:  param.dagreRanker || param.ranker || "network-simplex",
      marginx: 10, marginy: 10,
    })
    .setDefaultNodeLabel(function() { return {}; })
    .setDefaultEdgeLabel(function() { return { minlen: 1, weight: 1 }; });

  Object.keys(elkNodeMap).forEach(function(nodeId) {
    const node = elkNodeMap[nodeId];
    graph.setNode(nodeId, { label: nodeId, width: node.width, height: node.height, _archiId: node._archiId || nodeId });
  });
  Object.keys(elkParentMap).forEach(function(childId) {
    const parentId = elkParentMap[childId];
    if (graph.hasNode(childId) && graph.hasNode(parentId)) graph.setParent(childId, parentId);
  });
  elkEdgeList.forEach(function(edge) {
    const src = edge.sources[0], tgt = edge.targets[0];
    if (src === tgt) return; // skip self-loops — Dagre errors on those
    // Skip edges involving duplicate occurrence nodes — they appear as boxes but get no relations
    const srcIsDup = elkNodeMap[src] && elkNodeMap[src]._archiId !== src;
    const tgtIsDup = elkNodeMap[tgt] && elkNodeMap[tgt]._archiId !== tgt;
    if (srcIsDup || tgtIsDup) return;
    const archiRelId = edge._archiRelId || edge.id;
    if (!graph.hasEdge(src, tgt, edge.id)) {
      graph.setEdge({ v: src, w: tgt, name: edge.id }, { id: archiRelId });
    }
  });
  return graph;
}

function _drawDagreView(param, graph, elkParentRels, elkParentMap, occurrenceMap) {
  console.log("\nDrawing ArchiMate view (Dagre)...");
  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder !== "") folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);

  let view = _getView(folder, param.viewName);

  let visualElementIndex = {}, nodeIndex = {};
  console.log("Drawing graph nodes as elements ...");
  graph.nodes().forEach(function(nodeId) {
    _drawDagreNode(graph, nodeId, nodeIndex, visualElementIndex, view);
  });
  console.log("Drawing graph edges as relations ...");
  graph.edges().forEach(function(edge) {
    _drawDagreEdge(param, graph, edge, visualElementIndex, view);
  });
  if (elkParentRels.length > 0) console.log("Adding child-parent relations to the view ...");
  elkParentRels.forEach(function(parentRel) {
    const srcId = parentRel.source.id;
    const tgtId = parentRel.target.id;
    let srcVisual, tgtVisual;
    // Find the occurrence of tgt that is a direct child of src
    const tgtOccs = (occurrenceMap && occurrenceMap[tgtId]) || [tgtId];
    const tgtOcc  = tgtOccs.find(function(occId) { return elkParentMap && elkParentMap[occId] === srcId; });
    if (tgtOcc) {
      srcVisual = visualElementIndex[srcId];
      tgtVisual = visualElementIndex[tgtOcc];
    } else {
      // Reversed nesting: src is child of tgt
      const srcOccs = (occurrenceMap && occurrenceMap[srcId]) || [srcId];
      const srcOcc  = srcOccs.find(function(occId) { return elkParentMap && elkParentMap[occId] === tgtId; });
      srcVisual = visualElementIndex[srcOcc || srcId];
      tgtVisual = visualElementIndex[tgtId];
    }
    if (srcVisual && tgtVisual) view.add(parentRel, srcVisual, tgtVisual);
  });
  console.log(`\nGenerated view '${param.viewName}' in folder Views > ${folder.name}`);
  _openView(view);
  return view;
}

function _drawDagreNode(graph, nodeId, nodeIndex, visualElementIndex, view) {
  Common.debugStackPush(false);
  if (nodeIndex[nodeId] !== undefined) { Common.debugStackPop(); return; }
  nodeIndex[nodeId] = true;

  const node     = graph.node(nodeId);
  const parentId = graph.parent(nodeId);
  const archiEl  = $("#" + (node._archiId || nodeId)).first();

  try {
    if (parentId === undefined) {
      const x = parseInt(node.x - node.width / 2);
      const y = parseInt(node.y - node.height / 2);
      visualElementIndex[nodeId] = view.add(archiEl, x, y, node.width + 1, node.height + 1);
    } else {
      _drawDagreNode(graph, parentId, nodeIndex, visualElementIndex, view);
      const parentNode = graph.node(parentId);
      const relX = parseInt((node.x - node.width / 2) - (parentNode.x - parentNode.width / 2));
      const relY = parseInt((node.y - node.height / 2) - (parentNode.y - parentNode.height / 2));
      visualElementIndex[nodeId] = visualElementIndex[parentId].add(archiEl, relX, relY, node.width + 1, node.height + 1);
    }
  } catch(e) { console.error("-->" + e + "\n" + e.stack); }
  Common.debugStackPop();
}

function _drawDagreEdge(param, graph, edge, visualElementIndex, view) {
  Common.debugStackPush(false);
  const edgeData  = graph.edge(edge);
  const archiRel  = $("#" + edgeData.id).first();
  // Always use the ArchiMate relation's own source/target for the Archi connection.
  // Dagre edge v/w may be reversed (layoutReversed) to control layout direction —
  // that reversal must NOT carry over to the actual connection endpoints.
  const srcVisual = visualElementIndex[archiRel.source.id];
  const tgtVisual = visualElementIndex[archiRel.target.id];
  if (!srcVisual || !tgtVisual) { Common.debugStackPop(); return; }

  const connection = view.add(archiRel, srcVisual, tgtVisual);
  const points     = edgeData.points || [];
  const srcCenter  = _getCenterBounds(connection.source);
  const tgtCenter  = _getCenterBounds(connection.target);
  // Skip first and last Dagre points (on node boundary); build bendpoint array,
  // then reverse it for reversed relations before adding sequentially.
  const bendpoints = [];
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(_calcBendpoint(points[i], srcCenter, tgtCenter));
  }
  for (let i = 0; i < bendpoints.length; i++) {
    const bp = param.layoutReversed.includes(connection.type)
      ? bendpoints[bendpoints.length - 1 - i]
      : bendpoints[i];
    connection.addRelativeBendpoint(bp, i);
  }
  Common.debugStackPop();
}

// ── end Dagre ────────────────────────────────────────────────────────────────

// ── Graphviz DOT engine ──────────────────────────────────────────────────────

function _layoutAndRenderGraphviz(param, filteredElements) {
  let elkNodeMap = {}, elkEdgeList = [], elkParentMap = {}, elkParentRels = [], occurrenceMap = {};
  _fillGraph(param, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap, filteredElements);

  let dotSource = _buildDotGraph(param, elkNodeMap, elkEdgeList, elkParentMap);
  console.log("\nRunning Graphviz (" + (param.graphvizEngine || "dot") + ")...");

  let jsonOut = _runDot(dotSource, param.graphvizEngine || "dot", param.graphvizBin || "dot");
  return _drawGraphvizView(param, jsonOut, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap);
}

// Build a DOT source string from the graph structures produced by _fillGraph.
// Container nodes (those with children) are wrapped in subgraph cluster_<id> so
// Graphviz routes cross-container edges around cluster bounding boxes (compound=true).
// Edges are declared between the actual child nodes — no lhead/ltail — so the
// returned spline control points represent the complete child-to-child path.
function _buildDotGraph(param, elkNodeMap, elkEdgeList, elkParentMap) {
  const PX_TO_IN  = 1 / 96;
  const rankdir   = ({RIGHT:"LR", LEFT:"RL", DOWN:"TB", UP:"BT"})[param.elkDirection] || "LR";
  const ranksep   = ((param.elkLayerSpacing    || 180) * PX_TO_IN).toFixed(4);
  const nodesep   = ((param.elkSpacingNodeNode || 40)  * PX_TO_IN).toFixed(4);
  const nodeW     = ((param.nodeWidth          || 200) * PX_TO_IN).toFixed(4);
  const nodeH     = ((param.nodeHeight         || 60)  * PX_TO_IN).toFixed(4);
  const padding   = param.elkPadding !== undefined ? param.elkPadding : 20;
  const splines   = _elkRoutingToDot(param.graphvizSplines || param.elkEdgeRouting || "ORTHOGONAL");

  // esep: extra separation between edges and node bounding boxes during routing.
  const esep = (splines === 'ortho') ? '+24' : '+8';

  // View size constraints — translated to native Graphviz size/ratio attributes.
  // size is in inches (px / 96); only one constraint is active at a time.
  let sizeAttr = '', ratioAttr = '';
  if (param.viewMaxWidth > 0 && param.viewMaxHeight > 0) {
    sizeAttr = ' size="' + (param.viewMaxWidth / 96).toFixed(3) + ',' + (param.viewMaxHeight / 96).toFixed(3) + '"';
  } else if (param.viewMaxWidth > 0) {
    sizeAttr = ' size="' + (param.viewMaxWidth / 96).toFixed(3) + ',999"';
  } else if (param.viewMaxHeight > 0) {
    sizeAttr = ' size="999,' + (param.viewMaxHeight / 96).toFixed(3) + '"';
  } else if (param.viewAspectRatio > 0) {
    // Graphviz ratio = height/width; our param stores width/height
    ratioAttr = ' ratio="' + (1 / param.viewAspectRatio).toFixed(4) + '"';
  }

  let lines = [
    'digraph G {',
    '  graph [rankdir=' + rankdir + ' ranksep=' + ranksep + ' nodesep=' + nodesep +
           ' splines=' + splines + ' compound=true margin=0 esep="' + esep + '"' + sizeAttr + ratioAttr + ']',
    '  node [shape=rectangle width=' + nodeW + ' height=' + nodeH + ' fixedsize=true label=""]',
  ];

  // Identify children so we can find roots
  let childSet = new Set(Object.keys(elkParentMap));

  // Write nodes recursively; containers become subgraph cluster_<id> containing
  // both the container node itself (for edge routing) and all child nodes.
  function writeNode(id, indent) {
    let children = Object.keys(elkParentMap).filter(function(k) { return elkParentMap[k] === id; });
    if (children.length > 0) {
      lines.push(indent + 'subgraph "cluster_' + id + '" {');
      lines.push(indent + '  graph [margin=' + padding + ']');
      lines.push(indent + '  "' + id + '"');   // container node inside its own cluster
      children.forEach(function(cid) { writeNode(cid, indent + '  '); });
      lines.push(indent + '}');
    } else {
      lines.push(indent + '"' + id + '"');
    }
  }

  Object.keys(elkNodeMap)
    .filter(function(id) { return !childSet.has(id); })
    .forEach(function(id) { writeNode(id, '  '); });

  // Write edges; swap src/tgt for layoutReversed (same logic as ELK path)
  let reversedSet = new Set(param.layoutReversed || []);
  elkEdgeList.forEach(function(edge) {
    let src = edge.sources[0], tgt = edge.targets[0];
    if (reversedSet.has(edge._relType || "")) { let t = src; src = tgt; tgt = t; }
    lines.push('  "' + src + '" -> "' + tgt + '" [eid="' + edge.id + '"]');
  });

  lines.push('}');
  return lines.join('\n');
}

function _elkRoutingToDot(routing) {
  return { ORTHOGONAL:'ortho', POLYLINE:'polyline', STRAIGHT:'line',
           CURVED:'curved', SPLINE:'spline',
           ortho:'ortho', polyline:'polyline', line:'line',
           curved:'curved', spline:'spline' }[routing] || 'ortho';
}

// Call the dot binary with the given source, returning parsed JSON.
// Throws a human-readable string if the binary is missing or exits non-zero.
function _runDot(dotSource, engine, binPath) {
  let ProcessBuilder = Java.type("java.lang.ProcessBuilder");
  let Arrays         = Java.type("java.util.Arrays");
  let bin = binPath && binPath.trim() !== "" ? binPath.trim() : "dot";
  let proc;
  try {
    let pb = new ProcessBuilder(Arrays.asList(bin, "-Tjson", "-K" + engine));
    pb.redirectErrorStream(false);
    proc = pb.start();
  } catch(e) {
    throw "Graphviz not found at '" + bin + "'.\n" +
          "Install Graphviz (graphviz.org) and ensure 'dot' is on the system PATH,\n" +
          "or set the binary path in Layout → Graphviz binary.";
  }

  // Write DOT source to stdin, then close so dot sees EOF
  let wr = new java.io.OutputStreamWriter(proc.getOutputStream(), "UTF-8");
  wr.write(dotSource); wr.close();

  // Read stdout
  let br = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getInputStream(), "UTF-8"));
  let line, stdout = "";
  while ((line = br.readLine()) !== null) stdout += line + "\n";
  br.close();

  // Read stderr
  let er = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getErrorStream(), "UTF-8"));
  let eline, stderr = "";
  while ((eline = er.readLine()) !== null) stderr += eline + "\n";
  er.close();

  let code = proc.waitFor();
  if (code !== 0) throw "Graphviz exited with code " + code + ".\n" + stderr.trim();

  try { return JSON.parse(stdout); }
  catch(e) { throw "Failed to parse Graphviz JSON output: " + e; }
}

// Walk DOT JSON objects recursively, collecting node positions and cluster bounding
// boxes. All coordinates are converted to Archi pixel space (top-left origin).
function _collectDotObjects(jsonOut) {
  const PT2PX = 96 / 72;
  let rootBb  = _parseDotBb(String(jsonOut.bb || "0,0,0,0"));
  let totalH  = rootBb.ury;   // in DOT points; needed for Y-axis flip
  let nodes = {}, clusters = {};

  // Walk the entire JSON tree. Detect clusters by bb+cluster_ name (not _subgraph_cnt,
  // which is absent in some Graphviz versions). Recurse into any objects sub-array.
  function walk(obj) {
    if (!obj || typeof obj !== "object") return;
    let oname = String(obj.name || "");

    if (obj.bb && oname.indexOf("cluster_") === 0) {
      let nodeId = oname.substring("cluster_".length);
      let bb = _parseDotBb(String(obj.bb));
      clusters[nodeId] = {
        x: Math.round(bb.llx * PT2PX),
        y: Math.round((totalH - bb.ury) * PT2PX),
        w: Math.round((bb.urx - bb.llx) * PT2PX),
        h: Math.round((bb.ury - bb.lly) * PT2PX),
      };
    }

    if (obj.pos && oname) {
      let pos = _parseDotXY(String(obj.pos));
      let nw = obj.width  ? Math.round(parseFloat(String(obj.width))  * 96) : 200;
      let nh = obj.height ? Math.round(parseFloat(String(obj.height)) * 96) : 60;
      nodes[oname] = {
        x: Math.round(pos.x * PT2PX - nw / 2),
        y: Math.round((totalH - pos.y) * PT2PX - nh / 2),
        w: nw, h: nh,
      };
    }

    if (obj.objects) {
      for (let i = 0; i < obj.objects.length; i++) walk(obj.objects[i]);
    }
  }

  walk(jsonOut);
  return { nodes: nodes, clusters: clusters, totalH: totalH };
}

function _parseDotBb(s) {
  let p = s.split(",").map(parseFloat);
  return { llx: p[0], lly: p[1], urx: p[2], ury: p[3] };
}

function _parseDotXY(s) {
  let p = s.split(",");
  return { x: parseFloat(p[0]), y: parseFloat(p[1]) };
}

// Parse a DOT edge pos string into bendpoints.
//
// DOT cubic-Bézier format: "e,ex,ey  sx,sy  cp1 cp2 ep1  cp3 cp4 ep2  ..."
//   pts[0]         = source boundary (skip)
//   pts[1..3]      = first segment (2 ctrl pts + endpoint)
//   pts[3..6]      = second segment …
//   pts[last]      = target boundary (skip)
//
// For ortho/polyline: segment endpoints are the actual corners → use them as-is.
// For spline/curved: the cubic Bézier control pts define the curve. Since Archi only
//   supports straight-line segments between bendpoints, we sample each segment at
//   t = 0.25, 0.5, 0.75 to approximate the curve with a dense polyline.
//   A single direct segment (4 pts total) previously produced zero bendpoints and
//   looked identical to "straight" — the sampling fixes that.
function _flattenDotSpline(posStr, totalH, splineType) {
  const PT2PX = 96 / 72;
  let s = posStr.trim();
  if (s.indexOf("e,") === 0) s = s.substring(s.indexOf(" ") + 1);

  let pts = [];
  s.trim().split(/\s+/).forEach(function(tok) {
    let p = tok.split(",");
    if (p.length >= 2) {
      let x = parseFloat(p[0]), y = parseFloat(p[1]);
      if (!isNaN(x) && !isNaN(y)) pts.push({ x: x * PT2PX, y: (totalH - y) * PT2PX });
    }
  });
  if (pts.length < 4) return [];

  let useBezier = (splineType === "spline" || splineType === "SPLINE" ||
                   splineType === "curved" || splineType === "CURVED");
  let bps = [];

  if (useBezier) {
    // Evaluate each cubic Bézier segment at t = 0.25, 0.5, 0.75 plus the knot.
    // The dense sampling gives Archi enough bendpoints to approximate the curve.
    function bezier(P0, P1, P2, P3, t) {
      let m = 1 - t;
      return {
        x: Math.round(m*m*m*P0.x + 3*m*m*t*P1.x + 3*m*t*t*P2.x + t*t*t*P3.x),
        y: Math.round(m*m*m*P0.y + 3*m*m*t*P1.y + 3*m*t*t*P2.y + t*t*t*P3.y),
      };
    }
    let numSegs = Math.floor((pts.length - 1) / 3);
    for (let seg = 0; seg < numSegs; seg++) {
      let P0 = pts[seg * 3], P1 = pts[seg * 3 + 1],
          P2 = pts[seg * 3 + 2], P3 = pts[seg * 3 + 3];
      bps.push(bezier(P0, P1, P2, P3, 0.25));
      bps.push(bezier(P0, P1, P2, P3, 0.5));
      bps.push(bezier(P0, P1, P2, P3, 0.75));
      // Add the knot between segments (not on the last segment — that's the target boundary).
      if (seg < numSegs - 1) bps.push({ x: Math.round(P3.x), y: Math.round(P3.y) });
    }
  } else {
    // Ortho / polyline: segment endpoints ARE the corners; skip start and end boundaries.
    for (let i = 3; i < pts.length - 1; i += 3) bps.push(pts[i]);
  }
  return bps;
}

// Draw the Graphviz-positioned view.
// Container nodes use their cluster bounding box; leaf nodes use their pos.
// Children are added relative to their parent container so Archi nests them correctly.
function _drawGraphvizView(param, jsonOut, elkNodeMap, elkEdgeList, elkParentMap, elkParentRels, occurrenceMap) {
  console.log("\nDrawing ArchiMate view (Graphviz)...");
  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder !== "") folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);
  let view = _getView(folder, param.viewName);

  let coords = _collectDotObjects(jsonOut);

  // Fallback: for containers whose cluster bb was not in the DOT JSON
  // (force-directed engines like sfdp/neato/fdp never emit cluster bbs),
  // derive the bounding box from the child node positions + padding.
  let _pad = param.elkPadding !== undefined ? param.elkPadding : 20;
  let _bbAcc = {};
  Object.keys(elkParentMap).forEach(function(childId) {
    let cid = elkParentMap[childId];
    if (coords.clusters[cid]) return;        // already have it from JSON
    let cp = coords.nodes[childId];
    let pp = coords.nodes[cid];              // container node itself
    [cp, pp].forEach(function(p) {
      if (!p) return;
      if (!_bbAcc[cid]) _bbAcc[cid] = { minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h };
      else {
        _bbAcc[cid].minX = Math.min(_bbAcc[cid].minX, p.x);
        _bbAcc[cid].minY = Math.min(_bbAcc[cid].minY, p.y);
        _bbAcc[cid].maxX = Math.max(_bbAcc[cid].maxX, p.x + p.w);
        _bbAcc[cid].maxY = Math.max(_bbAcc[cid].maxY, p.y + p.h);
      }
    });
  });
  Object.keys(_bbAcc).forEach(function(cid) {
    let b = _bbAcc[cid];
    coords.clusters[cid] = {
      x: b.minX - _pad, y: b.minY - _pad,
      w: (b.maxX - b.minX) + 2 * _pad,
      h: (b.maxY - b.minY) + 2 * _pad,
    };
    console.log("  cluster bb computed from children for " + cid + " → " + JSON.stringify(coords.clusters[cid]));
  });

  let visualElementIndex = {};
  let reversedSet  = new Set(param.layoutReversed || []);
  let containerIds = new Set();
  Object.keys(elkParentMap).forEach(function(cid) { containerIds.add(elkParentMap[cid]); });

  // Identify root nodes (not a child of any other node)
  let childSet = new Set(Object.keys(elkParentMap));

  // Draw nodes recursively so children are added to their parent visual.
  // parentVisual = null for root elements; parentAbsPos for relative-coord conversion.
  function drawNodes(ids, parentVisual, parentAbsPos) {
    ids.forEach(function(nodeId) {
      let node    = elkNodeMap[nodeId];
      let archiId = node._archiId || nodeId;
      let archiEl = $("#" + archiId).first();
      if (!archiEl) return;

      let absPos = containerIds.has(nodeId) && coords.clusters[nodeId]
                 ? coords.clusters[nodeId]
                 : coords.nodes[nodeId];
      if (!absPos) { console.log("  No position for " + nodeId); return; }

      let rx = absPos.x - (parentAbsPos ? parentAbsPos.x : 0);
      let ry = absPos.y - (parentAbsPos ? parentAbsPos.y : 0);

      let visual = parentVisual
        ? parentVisual.add(archiEl, rx, ry, absPos.w, absPos.h)
        : view.add(archiEl, rx, ry, absPos.w, absPos.h);
      visualElementIndex[nodeId] = visual;

      let children = Object.keys(elkParentMap).filter(function(k) { return elkParentMap[k] === nodeId; });
      if (children.length) drawNodes(children, visual, absPos);
    });
  }

  console.log("Drawing graph nodes as elements...");
  let rootIds = Object.keys(elkNodeMap).filter(function(id) { return !childSet.has(id); });
  drawNodes(rootIds, null, null);

  // Draw edges with bendpoints derived from DOT spline control points.
  console.log("Drawing graph edges as relations...");
  let edgeById = {};
  elkEdgeList.forEach(function(e) { edgeById[e.id] = e; });
  let rootBb = _parseDotBb(String(jsonOut.bb || "0,0,0,0"));
  let totalH = rootBb.ury;
  let skipBendpoints = (param.graphvizSplines === "STRAIGHT" || param.graphvizSplines === "line");

  (jsonOut.edges || []).forEach(function(dotEdge) {
    let elkEdge = edgeById[String(dotEdge.eid || "")];
    if (!elkEdge) return;
    let archiRel = $("#" + elkEdge._archiRelId).first();
    if (!archiRel) return;

    // Use ArchiMate relation endpoints (not reversed DOT endpoints)
    let srcVisual = visualElementIndex[archiRel.source.id];
    let tgtVisual = visualElementIndex[archiRel.target.id];
    if (!srcVisual || !tgtVisual) return;

    let connection = view.add(archiRel, srcVisual, tgtVisual);
    if (!connection || skipBendpoints) return;

    let posStr = String(dotEdge.pos || "");
    if (!posStr) return;
    let bps = _flattenDotSpline(posStr, totalH, param.graphvizSplines || param.elkEdgeRouting);
    if (!bps.length) return;

    let srcCenter = _getCenterBounds(connection.source);
    let tgtCenter = _getCenterBounds(connection.target);
    let isRev     = reversedSet.has(connection.type);
    let calcBps   = bps.map(function(p) { return _calcBendpoint(p, srcCenter, tgtCenter); });
    for (let i = 0; i < calcBps.length; i++) {
      let bp = isRev ? calcBps[calcBps.length - 1 - i] : calcBps[i];
      connection.addRelativeBendpoint(bp, i);
    }
  });

  // Nesting relations drawn as plain connections (same as ELK/Dagre paths)
  if (elkParentRels.length) console.log("Adding nesting relations to the view...");
  elkParentRels.forEach(function(rel) {
    let sv = visualElementIndex[rel.source.id];
    let tv = visualElementIndex[rel.target.id];
    if (sv && tv) view.add(rel, sv, tv);
  });

  console.log("\nGenerated view '" + param.viewName + "' in folder Views > " + folder.name);
  _openView(view);
  return view;
}

// ── end Graphviz ─────────────────────────────────────────────────────────────

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
    PROP_EXCLUDE,
    ELEMENT_NAMES,
    RELATION_NAMES,
  };
}
