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

const Defs    = require(REPO_ROOT + "View/include_view_defs");
const Presets = require(REPO_ROOT + "View/include_view_presets");
const { ALGO, ACTION, ROUTING, GV_ALGORITHMS, DEFAULTS, RELATION_TYPES, ELEMENT_TYPES } = Defs;

const PROP_EXCLUDE          = "excludeFromView";
const GENERATED_VIEW_FOLDER = "/_Generated";
const JUNCTION_DIAMETER     = 14;
const NESTED_LABEL_TOP_EXTRA = 30; // extra top padding so Archi's container label doesn't overlap children
const PT2PX = 96 / 72;            // Graphviz: points → pixels (96 DPI screen, 72 pt/inch)

// Direction map shared by Dagre and Graphviz engines (ELK uses its own string keys)
const RANKDIR = { RIGHT: "LR", LEFT: "RL", DOWN: "TB", UP: "BT" };

// Extra separation (px) between edge paths and node bounding boxes in Graphviz.
// Orthogonal routing needs more room because right-angle bends hug node corners.
const GV_EDGE_CLEARANCE_ORTHO  = '+24';
const GV_EDGE_CLEARANCE_CURVED = '+8';

// Algorithm capabilities — each engine defines only what it supports (true);
// caps() fills the rest with false. One block per engine for readability.
const CAP_FIELDS = ["dir","routing","layerSep","ranker","weights","maxW","maxH","ar","packRow","nesting","curvedSplines","labelPos"];
const _capFalse  = Object.fromEntries(CAP_FIELDS.map(k => [k, false]));
function caps(supported) { return Object.assign({}, _capFalse, supported); }

const ELK_CAPABILITIES = {
  [ALGO.ELK_LAYERED.id]:     caps({ dir: true, routing: true, layerSep: true, nesting: true, labelPos: true }),
  [ALGO.ELK_MRTREE.id]:      caps({ dir: true, routing: true, nesting: true,                labelPos: true }),
  [ALGO.ELK_FORCE.id]:       caps({ weights: true, ar: true }),
  [ALGO.ELK_BOX.id]:         caps({ maxW: true, ar: true, nesting: true }),
  [ALGO.ELK_STRESS.id]:      caps({ weights: true, ar: true, nesting: true }),
  [ALGO.ELK_RADIAL.id]:      caps({ layerSep: true, weights: true, ar: true, nesting: true }),
  [ALGO.ELK_RECTPACKING.id]: caps({ maxW: true, ar: true, packRow: true, nesting: true }),
};
const GV_CAPABILITIES = {
  [ALGO.GV_DOT.id]:   caps({ dir: true, routing: true, layerSep: true, maxW: true, maxH: true, ar: true, nesting: true, curvedSplines: true, labelPos: true }),
  [ALGO.GV_NEATO.id]: caps({ routing: true, layerSep: true, maxW: true, maxH: true, ar: true, nesting: true, curvedSplines: true, labelPos: true }),
  [ALGO.GV_FDP.id]:   caps({ routing: true, layerSep: true, maxW: true, maxH: true, ar: true, nesting: true, curvedSplines: true, labelPos: true }),
  [ALGO.GV_SFDP.id]:  caps({ routing: true, layerSep: true, maxW: true, maxH: true, ar: true,               labelPos: true }),
  [ALGO.GV_TWOPI.id]: caps({ routing: true, layerSep: true, maxW: true, maxH: true, ar: true,               labelPos: true }),
  [ALGO.GV_CIRCO.id]: caps({ routing: true, layerSep: true, maxW: true, maxH: true, ar: true,               labelPos: true }),
};
const DAGRE_CAPABILITIES = {
  [ALGO.DAGRE.id]: caps({ dir: true, layerSep: true, ranker: true, nesting: true, labelPos: true }),
};
// Single exported table — GUI and engine both use this
const CAPABILITIES = Object.assign({}, ELK_CAPABILITIES, GV_CAPABILITIES, DAGRE_CAPABILITIES);

// Derived from RELATION_TYPES — used for validation and weight lookup
const _relTypeIds   = Object.values(RELATION_TYPES).map(v => v.id);
const _relWeightMap = Object.fromEntries(Object.values(RELATION_TYPES).map(v => [v.id, v.weight]));

/**
 * ELK.js is loaded via native jArchi CommonJS require (no jvm-npm).
 * Ensure Archi Preferences > Scripting: CommonJS is enabled and engine is GraalVM.
 */
try {
  var elk = require(REPO_ROOT + "node_modules/elkjs/index.js");
  console.log("\nELK.js layout engine loaded.");
} catch (error) {
  console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  throw new Error("\nELK module not loaded. Enable CommonJS in Archi Preferences > Scripting and use GraalVM.");
}

let dagre = null;
try {
  dagre = require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js");
  console.log("dagre-cluster-fix layout engine loaded.\n");
} catch(e) { /* optional — ELK-only mode if absent */ }

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
        case ACTION.GENERATE_SINGLE.id:
        case ACTION.EXPAND_HERE.id:
        case ACTION.LAYOUT.id:
          generatedViews.add(_layoutAndRender(param,filteredElements));
          break;

        case ACTION.GENERATE_MULTIPLE.id:
          console.log(`Generating views for elements:`);
          filteredElements.forEach(function (e) {
            console.log(`- ${e}`);
          });
          console.log();

          filteredElements.forEach(function (e) {
            param.viewName = e.name + param.viewNameSuffix;
            console.log(`\nGenerating view "${param.viewName}"`);
            console.log(`------------------${"-".repeat(param.viewName.length)}`);
            generatedViews.add(_layoutAndRender(param,$(e)));
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
 * Dispatch to the correct layout engine based on param.algorithm.
 * @returns Archi view
 */
function _layoutAndRender(param, filteredElements) {
  if (param.algorithm === ALGO.DAGRE.id) return _layoutAndRenderDagre(param, filteredElements);
  if (GV_ALGORITHMS.has(param.algorithm)) return _layoutAndRenderGraphviz(param, filteredElements);
  return _layoutAndRenderELK(param, filteredElements);
}

/**
 * Build ELK data structures, run layout, draw view.
 * @returns Archi view
 */
// Find the smallest compound-node width in the pass-1 layout result.
// Caps at viewMaxWidth − 2*padding so equalized leaves still fit inside depth-0 containers.
function _collectMinContainerW(elkLayoutPass1, param) {
  let globalMinW = Infinity;
  function walk(node) {
    if (!node.children || node.children.length === 0) return;
    if (node.id !== "root" && node.width < globalMinW) globalMinW = node.width;
    node.children.forEach(walk);
  }
  walk(elkLayoutPass1);
  if (param.viewMaxWidth > 0 && isFinite(globalMinW)) {
    const maxLeafW = param.viewMaxWidth - 2 * _getPadding(param);
    if (maxLeafW > 0 && globalMinW > maxLeafW) globalMinW = maxLeafW;
  }
  return globalMinW;
}

// For each compound node that mixes leaves and sub-containers:
// - leaf children of matching type → target width = globalMinW
// - sub-containers narrower than globalMinW → extra horizontal padding to reach globalMinW
function _equalizeSiblings(elkLayoutPass1, globalMinW) {
  const equalizedSizes = {};  // leaf id      → { width }
  const extraHPaddings = {};  // container id → extra px per side (left + right)
  function walk(node) {
    if (!node.children || node.children.length === 0) return;
    node.children.forEach(walk);
    const hasContainerSibling = node.children.some(function(c) { return c.children && c.children.length > 0; });
    if (!hasContainerSibling) return;
    const containerType = node._type; // only resize leaves whose type matches their parent container
    node.children.forEach(function(c) {
      if (!c.children || c.children.length === 0) {
        if (containerType && c._type === containerType) equalizedSizes[c.id] = { width: globalMinW };
      } else if (c.width < globalMinW) {
        extraHPaddings[c.id] = (globalMinW - c.width) / 2;
      }
    });
  }
  walk(elkLayoutPass1);
  return { equalizedSizes, extraHPaddings };
}

// Reset all nodes to their original sizes and clear ELK-computed state,
// then apply the equalized leaf sizes and extra-padding hints for pass 2.
function _resetNodesForPass2(nodeMap, origSizes, equalizedSizes, extraHPaddings) {
  Object.keys(nodeMap).forEach(function(id) {
    nodeMap[id].children = [];
    nodeMap[id].edges    = [];
    delete nodeMap[id].layoutOptions;
    delete nodeMap[id].x;
    delete nodeMap[id].y;
    delete nodeMap[id]._extraHPadding;
    nodeMap[id].width  = origSizes[id].width;
    nodeMap[id].height = origSizes[id].height;
  });
  Object.keys(equalizedSizes).forEach(function(id) {
    if (nodeMap[id]) nodeMap[id].width = equalizedSizes[id].width;
  });
  Object.keys(extraHPaddings).forEach(function(id) {
    if (nodeMap[id]) nodeMap[id]._extraHPadding = extraHPaddings[id];
  });
}

// Run pass 1 to discover actual container sizes, equalize siblings, then reset nodes for pass 2.
function _runELKTwoPassLayout(param, layoutOptions, nodeMap, edgeList, parentMap) {
  const origSizes = {};
  Object.keys(nodeMap).forEach(function(id) {
    origSizes[id] = { width: nodeMap[id].width, height: nodeMap[id].height };
  });

  const { elkGraph: elkLayoutPass1 } = _buildGraphELK(param, layoutOptions, nodeMap, edgeList, parentMap);
  console.log("\nCalculating the graph layout (pass 1 — equalise siblings)...");
  elk.layout(elkLayoutPass1);

  const globalMinW = _collectMinContainerW(elkLayoutPass1, param);
  const { equalizedSizes, extraHPaddings } = _equalizeSiblings(elkLayoutPass1, globalMinW);
  _resetNodesForPass2(nodeMap, origSizes, equalizedSizes, extraHPaddings);
  console.log("Calculating the graph layout (pass 2 — equalised sizes)...");
}

function _layoutAndRenderELK(param, filteredElements) {
  Common.debug(`_layoutAndRenderELK: algorithm=${param.algorithm} elements=${filteredElements.length}`);

  let { nodeMap, edgeList, parentMap, parentRels, occurrenceMap } = _buildGraphData(param, filteredElements);

  // Runtime-only: total node count used by _buildCompoundOptsELK to scale aspectRatio.
  param._totalNodes = Object.keys(nodeMap).length;

  const layoutOptions = _buildLayoutOptionsELK(param);

  // Two-pass layout when sameTypeResize is set:
  // Pass 1 discovers actual container sizes; leaf siblings are equalized
  // to the smallest container before pass 2 so mixed rows look visually uniform.
  if (param.sameTypeResize) {
    _runELKTwoPassLayout(param, layoutOptions, nodeMap, edgeList, parentMap);
  } else {
    console.log("\nCalculating the graph layout...");
  }

  const { elkGraph, liftedEdgesMap } = _buildGraphELK(param, layoutOptions, nodeMap, edgeList, parentMap);
  const layoutedGraph = elk.layout(elkGraph);
  console.log("- ELK result: width=" + Math.round(layoutedGraph.width || 0) + " height=" + Math.round(layoutedGraph.height || 0));

  return _drawViewELK(param, layoutedGraph, parentRels, liftedEdgesMap, parentMap, occurrenceMap);
}

/**
 * set defaults for undefined parameters
 *
 * @param {object} param - settings for generating a view
 */
function _setDefaultParameters(param) {
  let validFlag = true;

  // Fill undefined fields from DEFAULTS (single source of truth for all defaults)
  Object.keys(DEFAULTS).forEach(function(k) {
    if (param[k] === undefined) param[k] = DEFAULTS[k];
  });

  // viewName: override empty string with current selection name
  if (param.viewName === "") param.viewName = $(selection).first().name;

  if (!CAPABILITIES[param.algorithm]) throw new Error("Unknown algorithm: " + param.algorithm);

  // Zero view-size params not supported by this algorithm (safety net for direct API callers;
  // the GUI already zeroes these in saveInput via _currentCaps).
  const _caps = CAPABILITIES[param.algorithm] || {};
  if (!_caps.maxW) param.viewMaxWidth  = 0;
  if (!_caps.maxH) param.viewMaxHeight = 0;
  if (!_caps.ar)   param.viewAspectRatio = 0;

  console.log("Generate view parameters");
  console.log("- action = " + param.action);
  console.log("- graphDepth = " + param.graphDepth);

  if (!_validArchiConcept(param.includeElementType, ELEMENT_TYPES, "includeElementType:", "no filter")) validFlag = false;
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
        if (_relTypeIds.includes(type) && validDirs.includes(dir)) {
          console.log("  - " + entry);
        } else {
          console.error("  - " + entry
            + (!_relTypeIds.includes(type) ? " (unknown type)" : "")
            + (!validDirs.includes(dir)        ? " (unknown direction)" : ""));
          validFlag = false;
        }
      });
    }
  })();
  console.log(`- excludeFromView = ${param.excludeFromView} (exclude objects with property ${PROP_EXCLUDE}=true)`);
  console.log(`- viewName = ${param.viewName}`);
  console.log(`- viewNameSuffix = ${param.viewNameSuffix}`);
  console.log(`- viewFolder = ${param.viewFolder}`);
  param.viewName = param.viewName + param.viewNameSuffix;

  console.log("How to draw relationships");
  if (!_validArchiConcept(param.layoutReversed, _relTypeIds, "layoutReversed:", "none")) validFlag = false;
  if (!_validArchiConcept(param.layoutNested, _relTypeIds, "layoutNested:", "none")) validFlag = false;
  console.log(`- nestingMultipleOccurrences = ${param.nestingMultipleOccurrences}`);

  console.log("\nLayout parameters");
  console.log("- algorithm = "             + param.algorithm);
  console.log("- layoutDirection = "             + param.layoutDirection);
  console.log("- nodeSpacing = "        + param.nodeSpacing);
  console.log("- layerSpacing = "           + param.layerSpacing);
  console.log("- nodePlacement = " + param.nodePlacement);
  console.log("- edgeRouting = "            + param.edgeRouting);
  console.log("- padding = "                + param.padding);
  console.log("- nestedAlgorithm = "        + (param.nestedAlgorithm || "(same as root)"));
  if (param.nestedAlgorithm) console.log("- nestedNodeSpacing = " + param.nestedNodeSpacing + ", sameTypeResize = " + param.sameTypeResize);
  console.log("- viewMaxWidth = "    + param.viewMaxWidth    + (param.viewMaxWidth    > 0 ? " px" : " (no limit)"));
  console.log("- viewMaxHeight = "   + param.viewMaxHeight   + (param.viewMaxHeight   > 0 ? " px" : " (no limit)"));
  console.log("- viewAspectRatio = " + param.viewAspectRatio + (param.viewAspectRatio > 0 ? "" : " (no limit)"));
  console.log("- nodeWidth = "  + param.nodeWidth);
  console.log("- nodeHeight = " + param.nodeHeight);

  if (param.useRelationWeights === undefined) param.useRelationWeights = false;
  console.log(`- useRelationWeights = ${param.useRelationWeights}`);

  console.log("Developing");
  console.log("- debug = " + param.debug);
  console.log();
  switch (param.action) {
    case ACTION.GENERATE_SINGLE.id:
      console.log(`Create or update view:\n- /Views${param.viewFolder}/${param.viewName}`);
      break;
    case ACTION.GENERATE_MULTIPLE.id:
      console.log(`Create or update view(s):\n- /Views${param.viewFolder}/<elementName>${param.viewNameSuffix}`);
      break;
    case ACTION.EXPAND_HERE.id:
    case ACTION.LAYOUT.id:
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
  if (filteredSelection.length === 0) throw new Error("No Archimate element match your criterias.");

  return filteredSelection;
}

/**
 * Build ELK layout options object from param
 */
function _buildLayoutOptionsELK(param) {
  const opts = {
    "elk.algorithm":    param.algorithm,
    "elk.direction":    param.layoutDirection,
    "elk.spacing.nodeNode":                      String(param.nodeSpacing),
    "elk.layered.spacing.nodeNodeBetweenLayers": String(param.layerSpacing),
    // STRAIGHT: pseudo-value — tell ELK POLYLINE but suppress bendpoints in draw step.
    // SPLINES: unsupported in Archi (bezier control points ≠ polyline waypoints).
    "elk.edgeRouting": (param.edgeRouting === ROUTING.STRAIGHT.id || param.edgeRouting === "SPLINES")
      ? ROUTING.POLYLINE.id : param.edgeRouting,
  };
  if (param.nodePlacement && param.nodePlacement !== "NONE") {
    opts["elk.layered.nodePlacement.bk.fixedAlignment"] = param.nodePlacement;
  }
  if (param.algorithm === ALGO.ELK_RECTPACKING.id) {
    opts["elk.rectpacking.packing.compaction.iterations"]            = 5;
    opts["elk.rectpacking.packing.compaction.rowHeightReevaluation"] = true;
    if (param.viewMaxWidth > 0) {
      opts["elk.rectpacking.widthApproximation.targetWidth"] = String(param.viewMaxWidth);
      console.log("- elk.rectpacking.widthApproximation.targetWidth = " + param.viewMaxWidth);
    }
  }
  // Apply aspect ratio for any algorithm. CAPS ar:true/false + saveInput zeroing ensure
  // param.viewAspectRatio is 0 for algorithms that don't support it — no list needed here.
  if (param.viewAspectRatio > 0) {
    opts["elk.aspectRatio"] = String(param.viewAspectRatio);
    console.log("- elk.aspectRatio = " + param.viewAspectRatio);
  }
  Common.debug(`_buildLayoutOptionsELK: ${JSON.stringify(opts)}`);
  return opts;
}

/**
 * Assemble the ELK graph object from pre-built maps
 */
/**
 * All layout options for a single compound node — one call, complete result.
 * @param {object} param        layout parameters
 * @param {number} depth        nesting depth (0 = direct child of root)
 * @param {number} extraHPadding extra horizontal padding from equalizeSiblings
 */
function _buildCompoundOptsELK(param, depth, extraHPadding, childCount) {
  const p       = _getPadding(param);
  const ph      = p + (extraHPadding || 0);
  const top     = p + NESTED_LABEL_TOP_EXTRA;
  const spacing = param.nestedNodeSpacing !== undefined
    ? param.nestedNodeSpacing : DEFAULTS.nestedNodeSpacing;

  const algo = param.nestedAlgorithm || param.algorithm;

  const opts = {
    "elk.padding":          `[top=${top},left=${ph},bottom=${p},right=${ph}]`,
    "elk.spacing.nodeNode": String(spacing),
    "elk.algorithm":        algo,
  };

  if (algo === ALGO.ELK_BOX.id) {
    opts["elk.box.packingMode"]      = "SIMPLE";
    opts["elk.nodeSize.constraints"] = "FIXED_SIZE";

  } else if (algo === ALGO.ELK_RECTPACKING.id) {
    opts["elk.nodeSize.constraints"] = "FIXED_SIZE";
    opts["elk.rectpacking.packing.compaction.iterations"]            = 5;
    opts["elk.rectpacking.packing.compaction.rowHeightReevaluation"] = true;
    opts["elk.rectpacking.orderBySize"] = !!param.sortLeavesOnly;

  } else {
    // layered / other: propagate root options into sub-layout.
    opts["elk.nodeSize.constraints"] = "FIXED_SIZE";
    opts["elk.direction"]   = param.layoutDirection;
    opts["elk.edgeRouting"] = (param.edgeRouting === ROUTING.STRAIGHT.id || param.edgeRouting === "SPLINES")
                               ? ROUTING.POLYLINE.id : param.edgeRouting;
    if (param.layerSpacing !== undefined)
      opts["elk.layered.spacing.nodeNodeBetweenLayers"] = String(param.layerSpacing);
  }

  Common.debug(`_buildCompoundOptsELK depth=${depth} n=${childCount} algo=${algo} ph=${ph}`);
  return opts;
}

function _byTypeName(a, b) {
  return (a._type || '').localeCompare(b._type || '') || (a._name || '').localeCompare(b._name || '');
}

// Sort children: containers first (sorted by type+name), then leaves (sorted by type+name).
// sortLeavesOnly: containers keep model insertion order, only leaves are sorted.
function _sortChildren(nodes, param) {
  if (param.sortLeavesOnly) {
    // Containers stay in model insertion order — ELK is free to optimise placement.
    // Only leaf nodes are sorted alphabetically, reinserted at their original leaf slots.
    const leafIdxs = [], sortedLeaves = [];
    nodes.forEach(function(n, i) {
      if (!n.children || n.children.length === 0) { leafIdxs.push(i); sortedLeaves.push(n); }
    });
    sortedLeaves.sort(_byTypeName);
    const result = nodes.slice();
    leafIdxs.forEach(function(pos, i) { result[pos] = sortedLeaves[i]; });
    return result;
  }
  const ctrs   = nodes.filter(function(n) { return n.children && n.children.length > 0; });
  const leaves = nodes.filter(function(n) { return !n.children || n.children.length === 0; });
  ctrs.sort(_byTypeName);
  leaves.sort(_byTypeName);
  return ctrs.concat(leaves);
}

function _attachChildrenToParents(nodeMap, parentMap) {
  Object.keys(parentMap).forEach(function(childId) {
    const parentNode = nodeMap[parentMap[childId]];
    const childNode  = nodeMap[childId];
    if (parentNode && childNode && !parentNode.children.some(function(c) { return c.id === childId; })) {
      parentNode.children.push(childNode);
    }
  });
}

function _sortAllNodeChildren(nodeMap, param) {
  Object.keys(nodeMap).forEach(function(nodeId) {
    const node = nodeMap[nodeId];
    if (node.children && node.children.length > 1) node.children = _sortChildren(node.children, param);
  });
}

function _collectRootChildren(nodeMap, parentMap, param) {
  return _sortChildren(
    Object.keys(nodeMap).filter(function(id) { return parentMap[id] === undefined; }).map(function(id) { return nodeMap[id]; }),
    param
  );
}

// Classify edges: internal (both endpoints in the same compound) go into that compound's
// edges array so ELK routes them within the container. All others become rootEdges.
function _classifyEdgesToContainers(edgeList, parentMap, nodeMap) {
  const rootEdges = [];
  edgeList.forEach(function(edge) {
    const srcParent = parentMap[edge.sources[0]];
    const tgtParent = parentMap[edge.targets[0]];
    if (srcParent !== undefined && tgtParent !== undefined && srcParent === tgtParent) {
      const parentNode = nodeMap[srcParent];
      if (parentNode) { parentNode.edges = parentNode.edges || []; parentNode.edges.push(edge); return; }
    }
    rootEdges.push(edge);
  });
  return rootEdges;
}

// Set FIXED_SIZE dimensions and compound layout options for each container node.
// k = min(kSqrt, kMax) columns: kSqrt ≈ square root of child count, kMax limited by viewMaxWidth.
function _dimensionCompoundNodes(nodeMap, parentMap, param) {
  Common.debug(`_dimensionCompoundNodes: ${Object.keys(parentMap).length} nestings`);
  Object.keys(nodeMap).forEach(function(nodeId) {
    const node = nodeMap[nodeId];
    if (!node.children || node.children.length === 0) return;
    let depth = 0, pp = parentMap[nodeId];
    while (pp !== undefined) { depth++; pp = parentMap[pp]; }

    const p2   = param.padding || DEFAULTS.padding;
    const ph2  = p2 + (node._extraHPadding || 0);
    const top2 = p2 + NESTED_LABEL_TOP_EXTRA;
    const sp   = param.nestedNodeSpacing !== undefined ? param.nestedNodeSpacing : DEFAULTS.nestedNodeSpacing;
    const nw2  = param.nodeWidth  || DEFAULTS.nodeWidth;
    const nh2  = param.nodeHeight || DEFAULTS.nodeHeight;
    const n    = node.children.length;

    const kSqrt = Math.max(1, Math.floor(1.2 * Math.sqrt(n)));
    const capW  = param.viewMaxWidth > 0 ? param.viewMaxWidth - 2 * ph2 : 0;
    const kMax  = capW > 0 ? Math.max(1, Math.floor(capW / (nw2 + sp))) : kSqrt;
    const k     = Math.min(kSqrt, kMax);
    const rows  = Math.ceil(n / k);

    node.width  = k * nw2 + (k - 1) * sp + 2 * ph2;
    node.height = rows * nh2 + (rows - 1) * sp + top2 + p2;
    console.log(`  compound n=${n} k=${k} rows=${rows} w=${Math.round(node.width)} h=${Math.round(node.height)}`);

    node.layoutOptions = _buildCompoundOptsELK(param, depth, node._extraHPadding || 0, n);
  });
}

// ELK SEPARATE_CHILDREN ignores cross-hierarchy edges (source/target inside a compound).
// Lift such endpoints to their root-level ancestor so ELK uses them for root-level layering.
// The original IDs are preserved in liftedEdgesMap for drawing.
function _liftCrossHierarchyEdges(rootEdges, parentMap) {
  const liftedEdgesMap = {};
  const liftedRootEdges = rootEdges.map(function(edge) {
    const srcId = edge.sources[0];
    const tgtId = edge.targets[0];
    let liftedSrc = srcId, p = parentMap[liftedSrc];
    while (p !== undefined) { liftedSrc = p; p = parentMap[liftedSrc]; }
    let liftedTgt = tgtId;
    p = parentMap[liftedTgt];
    while (p !== undefined) { liftedTgt = p; p = parentMap[liftedTgt]; }
    if (liftedSrc === liftedTgt) return null; // both sides in the same compound after lifting — skip
    if (liftedSrc !== srcId || liftedTgt !== tgtId) {
      liftedEdgesMap[edge.id] = { origSrcId: srcId, origTgtId: tgtId };
      return Object.assign({}, edge, { sources: [liftedSrc], targets: [liftedTgt] });
    }
    return edge;
  }).filter(Boolean);
  return { liftedRootEdges, liftedEdgesMap };
}

function _buildGraphELK(param, layoutOptions, nodeMap, edgeList, parentMap) {
  Common.debug(`_buildGraphELK: ${Object.keys(parentMap).length} nestings, ${edgeList.length} edges`);
  _attachChildrenToParents(nodeMap, parentMap);
  _sortAllNodeChildren(nodeMap, param);
  const rootChildren                    = _collectRootChildren(nodeMap, parentMap, param);
  const rootEdges                       = _classifyEdgesToContainers(edgeList, parentMap, nodeMap);
  _dimensionCompoundNodes(nodeMap, parentMap, param);
  const { liftedRootEdges, liftedEdgesMap } = _liftCrossHierarchyEdges(rootEdges, parentMap);
  const elkGraph = { id: "root", layoutOptions: layoutOptions, children: rootChildren, edges: liftedRootEdges };
  return { elkGraph: elkGraph, liftedEdgesMap: liftedEdgesMap };
}

/**
 * Add the filtered selection to Archi collections for layout and rendering, according to the action type and graph depth.
 */
function _fillGraph(param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, filteredElements) {
  const START_LEVEL = 0;

  switch (param.action) {
    case ACTION.GENERATE_SINGLE.id:
    case ACTION.GENERATE_MULTIPLE.id:
      console.log(`\nAdding elements and relations to the graph with a depth of ${param.graphDepth}...`);
      filteredElements.forEach(function(archiEle) {
        _addElement(START_LEVEL, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, archiEle, filteredElements);
      });
      break;
    case ACTION.EXPAND_HERE.id:
      console.log("Expand selected objects on the view");
      _addViewObjects(START_LEVEL, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap);
      filteredElements.forEach(function(archiEle) {
        _addElement(START_LEVEL, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, archiEle, filteredElements);
      });
      break;
    case ACTION.LAYOUT.id:
      console.log("Layout objects on the view");
      _addViewObjects(START_LEVEL, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap);
      break;
    default:
      break;
  }

  console.log("\nAdded to the graph:");
  console.log(`- ${Object.keys(nodeMap).length} nodes and`);
  console.log(`- ${edgeList.length} edges`);
  if (parentRels.length > 0) console.log(`- ${parentRels.length} parent-child nestings`);
  Common.debug(`_fillGraph: occurrences=${Object.keys(occurrenceMap).length} parentRels=${parentRels.length}`);
}

function _buildGraphData(param, filteredElements) {
  let g = { nodeMap: {}, edgeList: [], parentMap: {}, parentRels: [], occurrenceMap: {} };
  _fillGraph(param, g.nodeMap, g.edgeList, g.parentMap, g.parentRels, g.occurrenceMap, filteredElements);
  return g;
}

/**
 * Add all elements and relations of the selected view to the ELK data structures
 */
function _addViewObjects(level, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap) {
  let view = _getSelectedView();

  $(view)
    .find("element")
    .each(function(e) { _createNode(level, param, nodeMap, occurrenceMap, e); });
  $(view)
    .find("relation")
    .filter(function(rel) { return $(rel).ends().is("element"); })
    .each(function(r) {
      _addRelation(0, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, r.concept);
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
  if (!selectedView) throw new Error("No view or view elements selected. Select one or more elements on a view");
  return selectedView;
}

/**
 * Main recursive function: add the given element and its related elements to the graph
 */
function _addElement(level, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, archiEle, filteredElements) {
  const STOPPED     = false;
  const NOT_STOPPED = true;
  Common.debug(`${"  ".repeat(level)}> Start ${archiEle}`);

  if ((param.graphDepth > 0 && level > param.graphDepth) || (param.graphDepth == 0 && level > 1)) {
    Common.debug(`${"  ".repeat(level)}> Stop level=${level} > graphDepth=${param.graphDepth}`);
    return STOPPED;
  }

  _createNode(level, param, nodeMap, occurrenceMap, archiEle);
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
          if (_addElement(level + 1, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, related_element, filteredElements) == NOT_STOPPED) {
            Common.debug(`>>>> rel: ${rel}`);
            _addRelation(level, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, rel);
          }
        }
      }
    });
  return NOT_STOPPED;
}

/**
 * Add the given element as a node to the ELK node map
 */
function _createNode(level, param, nodeMap, occurrenceMap, archiEle) {
  const e = Common.concept(archiEle);
  if (!nodeMap[e.id]) {
    const isJunction = e.type === "junction";
    const w = isJunction ? JUNCTION_DIAMETER : param.nodeWidth;
    const h = isJunction ? JUNCTION_DIAMETER : param.nodeHeight;
    nodeMap[e.id] = { id: e.id, _archiId: e.id, _name: e.name || "", _type: e.type || "", width: w, height: h, children: [], edges: [] };
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
function _addRelation(level, param, nodeMap, edgeList, parentMap, parentRels, occurrenceMap, rel) {
  if (param.layoutNested.includes(rel.type)) {
    _createParent(level, param, nodeMap, parentMap, occurrenceMap, parentRels, rel);
  } else {
    _createEdge(level, param, occurrenceMap, edgeList, rel);
  }
}

/**
 * Add the given relation as an ELK edge
 *
 * In nestingMultipleOccurrences mode, edges are created for each occurrence combination.
 */
function _createEdge(level, param, occurrenceMap, edgeList, rel) {
  Common.debugStackPush(false);
  const reversed = param.layoutReversed.includes(rel.type);

  const srcOccs = occurrenceMap[rel.source.id] || [rel.source.id];
  const tgtOccs = occurrenceMap[rel.target.id] || [rel.target.id];

  srcOccs.forEach(function(srcId, si) {
    tgtOccs.forEach(function(tgtId, ti) {
      const edgeId = (srcOccs.length === 1 && tgtOccs.length === 1)
        ? rel.id
        : `${rel.id}_${si}_${ti}`;

      if (!edgeList.some(function(e) { return e.id === edgeId; })) {
        const weight = param.useRelationWeights ? (_relWeightMap[rel.type] || 1.0) : undefined;
        edgeList.push({
          id: edgeId,
          _archiRelId: rel.id,
          _relName:    (rel.name && rel.name.trim()) || "",
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
 * Record the given relation as a parent-child nesting in parentMap.
 *
 * nestingMultipleOccurrences=false (default): child goes into the first parent only.
 * nestingMultipleOccurrences=true:  a separate visual occurrence is created for each parent.
 */
function _createParent(level, param, nodeMap, parentMap, occurrenceMap, parentRels, rel) {
  Common.debugStackPush(false);

  if (parentRels.some(function(r) { return r.id === rel.id; })) {
    Common.debug(`${"  ".repeat(level)}> Skip, already in parent-list ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, Common.FORMAT_NOT_REVERSED)}`);
    Common.debugStackPop();
    return;
  }

  const reversed     = param.layoutReversed.includes(rel.type);
  const childArchiId = reversed ? rel.source.id : rel.target.id;
  const parentArchiId = reversed ? rel.target.id : rel.source.id;

  if (!param.nestingMultipleOccurrences) {
    // Default: assign to first parent only
    if (parentMap[childArchiId] !== undefined) {
      console.log(`> Multi-parent: ${childArchiId} already in ${parentMap[childArchiId]}, skipping ${parentArchiId}. Set nestingMultipleOccurrences=true to render in both.`);
    } else {
      parentMap[childArchiId] = parentArchiId;
      Common.debug(`${"  ".repeat(level)}> Add Parent${reversed ? "<-" : "->"}Child: ${Common.formatRelation(rel, Common.FORMAT_NO_TYPES, reversed ? Common.FORMAT_REVERSED : Common.FORMAT_NOT_REVERSED)}`);
    }
  } else {
    // Multiple occurrences: assign base occurrence if unassigned; else create new occurrence
    const occs = occurrenceMap[childArchiId] || [];
    const unassigned = occs.find(function(occId) { return parentMap[occId] === undefined; });
    if (unassigned) {
      parentMap[unassigned] = parentArchiId;
      Common.debug(`${"  ".repeat(level)}> Assign occurrence ${unassigned} to parent ${parentArchiId}`);
    } else {
      const alreadyInParent = occs.find(function(occId) { return parentMap[occId] === parentArchiId; });
      if (!alreadyInParent) {
        const n = occs.length;
        const occId = `${childArchiId}_occ_${n}`;
        const baseNode = nodeMap[childArchiId];
        nodeMap[occId] = { id: occId, _archiId: childArchiId, _name: baseNode._name || "", _type: baseNode._type || "", width: baseNode.width, height: baseNode.height, children: [], edges: [] };
        occurrenceMap[childArchiId].push(occId);
        parentMap[occId] = parentArchiId;
        Common.debug(`${"  ".repeat(level)}> Create occurrence ${occId} in parent ${parentArchiId}`);
      }
    }
  }

  parentRels.push(rel);
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
 * Create an Archi view, draw nodes/edges via engine callbacks, add nesting relations, open view.
 * Shared entry point for all three layout engines — identical Archi API calls regardless of engine.
 *
 * @param {object}   param         - layout parameters (viewFolder, viewName)
 * @param {function} drawNodesFn   - (view, visualElementIndex) → void; engine-specific node draw
 * @param {function} drawEdgesFn   - (view, visualElementIndex) → void; engine-specific edge draw
 * @param {Array}    parentRels    - nesting relations to add to the view
 * @param {object}   parentMap     - child-id → parent-id
 * @param {object}   occurrenceMap - archi-id → [occurrence ids]
 * @returns {object} Archi view
 */
function _drawView(param, drawNodesFn, drawEdgesFn, parentRels, parentMap, occurrenceMap) {
  let folder = ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  if (param.viewFolder !== "") folder = ArchiFolders.getFolderPath("/Views" + param.viewFolder);
  const view = _getView(folder, param.viewName);
  const visualElementIndex = {};

  console.log("Drawing graph nodes as elements ...");
  drawNodesFn(view, visualElementIndex);
  console.log("Drawing graph edges as relations ...");
  drawEdgesFn(view, visualElementIndex);

  if (parentRels.length > 0) console.log("Adding child-parent relations to the view ...");
  parentRels.forEach(function(parentRel) {
    const srcId = parentRel.source.id;
    const tgtId = parentRel.target.id;
    let srcVisual, tgtVisual;
    const tgtOccs = (occurrenceMap && occurrenceMap[tgtId]) || [tgtId];
    const tgtOcc  = tgtOccs.find(function(occId) { return parentMap && parentMap[occId] === srcId; });
    if (tgtOcc) {
      srcVisual = visualElementIndex[srcId];
      tgtVisual = visualElementIndex[tgtOcc];
    } else {
      const srcOccs = (occurrenceMap && occurrenceMap[srcId]) || [srcId];
      const srcOcc  = srcOccs.find(function(occId) { return parentMap && parentMap[occId] === tgtId; });
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
 * Draw the ELK-layouted graph as an Archi view.
 */
function _drawViewELK(param, layoutedGraph, parentRels, liftedEdgesMap, parentMap, occurrenceMap) {
  console.log("\nDrawing ArchiMate view (ELK)...");
  return _drawView(param,
    function(view, vIdx) {
      (layoutedGraph.children || []).forEach(function(node) {
        _drawNodeRecursiveELK(param, node, null, vIdx, view);
      });
    },
    function(view, vIdx) {
      let _elkBounds = [], _elkLabelRects = [];
      if (param.labelPosition === "middle" || param.labelPosition === "auto") {
        _elkBounds = Object.values(vIdx).map(function(v) {
          return { x: v.bounds.x, y: v.bounds.y, w: v.bounds.width, h: v.bounds.height };
        });
      }
      _drawEdgesRecursiveELK(layoutedGraph, param, vIdx, view, liftedEdgesMap, _elkBounds, _elkLabelRects);
    },
    parentRels, parentMap, occurrenceMap
  );
}

/**
 * Recursively draw an ELK node and its children.
 * ELK coords: x,y = top-left corner; child coords are relative to parent.
 */
function _drawNodeRecursiveELK(param, elkNode, parentVisual, visualElementIndex, view) {
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
      _drawNodeRecursiveELK(param, child, visual, visualElementIndex, view);
    });
  } catch (e) {
    console.error("-->" + e + "\n" + e.stack);
  }
}

/**
 * Recursively draw all ELK edges in the graph tree
 */
function _drawEdgesRecursiveELK(elkNode, param, visualElementIndex, view, liftedEdgesMap, elkBounds, elkLabelRects) {
  // Edges in a compound node (id !== "root") have container-relative ELK coords.
  const containerNodeId = (elkNode.id === "root") ? null : elkNode.id;
  (elkNode.edges || []).forEach(function(edge) {
    _drawEdgeELK(param, edge, visualElementIndex, view, containerNodeId, liftedEdgesMap, elkBounds, elkLabelRects);
  });
  (elkNode.children || []).forEach(function(child) {
    _drawEdgesRecursiveELK(child, param, visualElementIndex, view, liftedEdgesMap, elkBounds, elkLabelRects);
  });
}

// Resolve the Archi visual elements for both endpoints of an ELK edge.
// Returns { archiRel, liftedIds, srcVisual, tgtVisual } or null if either visual is missing.
function _resolveEdgeVisuals(edge, liftedEdgesMap, param, visualElementIndex) {
  const archiRelId = edge._archiRelId || edge.id;
  const archiRel   = $("#" + archiRelId).first();
  // Cross-hierarchy edges have their endpoints lifted to compound IDs for root layout;
  // use the original child IDs for drawing the actual Archi connection.
  const liftedIds  = liftedEdgesMap && liftedEdgesMap[edge.id];
  const srcId      = (liftedIds && liftedIds.origSrcId) || edge.sources[0];
  const tgtId      = (liftedIds && liftedIds.origTgtId) || edge.targets[0];
  // For reversed relations, sources/targets in the ELK edge are swapped for layout;
  // swap back so view.add() receives the correct ArchiMate connection direction.
  const isReversed = param.layoutReversed.includes(archiRel.type);
  const srcVisual  = visualElementIndex[isReversed ? tgtId : srcId];
  const tgtVisual  = visualElementIndex[isReversed ? srcId : tgtId];
  if (!srcVisual || !tgtVisual) return null;
  return { archiRel, liftedIds, srcVisual, tgtVisual };
}

// Compute the absolute top-left offset of a container node so bendpoints can be
// converted from container-relative to absolute coordinates.
function _computeContainerOffset(containerNodeId, visualElementIndex) {
  if (!containerNodeId) return null;
  const cv = visualElementIndex[containerNodeId];
  if (!cv) return null;
  let ox = cv.bounds.x, oy = cv.bounds.y;
  let p = $(cv).parent().filter("element").first();
  while (p) { ox += p.bounds.x; oy += p.bounds.y; p = $(p).parent().filter("element").first(); }
  return { x: ox, y: oy };
}

// Find the midpoint of the ELK-computed edge path in absolute coordinates.
// Used as the baseline position for label overlap detection.
function _edgeMiddlePoint(edge, containerOffset) {
  const section = edge.sections && edge.sections[0];
  if (!section) return null;
  const offsetX = containerOffset ? containerOffset.x : 0;
  const offsetY = containerOffset ? containerOffset.y : 0;
  const bps = section.bendPoints || [];
  return bps.length > 0
    ? { x: bps[Math.floor(bps.length / 2)].x + offsetX, y: bps[Math.floor(bps.length / 2)].y + offsetY }
    : { x: (section.startPoint.x + section.endPoint.x) / 2 + offsetX,
        y: (section.startPoint.y + section.endPoint.y) / 2 + offsetY };
}

// Decide whether the label will land in the middle, and if so find a non-overlapping
// position and pre-adjust the middle bendpoint so _drawBendpointsELK places the label there.
// Returns { willBeMiddle, lpFixed }.
function _adjustLabelBendpoint(edge, param, elkAlgoPt, srcCenter, tgtCenter, containerOffset, elkBounds, elkLabelRects, relName, liftedIds) {
  const lpFixed      = { source: 0, middle: 1, target: 2 }[param.labelPosition];
  const willBeMiddle = (lpFixed === 1) ||
    (param.labelPosition === "auto" && elkAlgoPt && _labelPositionFromPoint(elkAlgoPt, srcCenter, tgtCenter) === 1);

  if (willBeMiddle && elkAlgoPt && elkBounds && !liftedIds) {
    const edgeDir = { dx: tgtCenter.x - srcCenter.x, dy: tgtCenter.y - srcCenter.y };
    const adj     = _findClearLabelPos(elkAlgoPt, edgeDir, elkBounds, elkLabelRects, relName);
    // Pre-adjust the middle bendpoint in section.bendPoints so _drawBendpointsELK uses it.
    const section = edge.sections && edge.sections[0];
    if (section) {
      const offsetX = containerOffset ? containerOffset.x : 0;
      const offsetY = containerOffset ? containerOffset.y : 0;
      const bps     = section.bendPoints || [];
      const adjRel  = { x: adj.x - offsetX, y: adj.y - offsetY };
      if (bps.length === 0) { section.bendPoints = [adjRel]; }
      else { bps[Math.floor(bps.length / 2)] = adjRel; }
    }
    elkLabelRects.push(_labelRect(adj, relName));
  }
  return { willBeMiddle, lpFixed };
}

function _setConnectionTextPosition(connection, param, willBeMiddle, lpFixed, elkAlgoPt, srcCenter, tgtCenter) {
  if (willBeMiddle) {
    connection.textPosition = 1;
  } else if (lpFixed !== undefined) {
    connection.textPosition = lpFixed;
  } else if (param.labelPosition === "auto" && elkAlgoPt) {
    connection.textPosition = _labelPositionFromPoint(elkAlgoPt, srcCenter, tgtCenter);
  }
}

function _drawEdgeELK(param, edge, visualElementIndex, view, containerNodeId, liftedEdgesMap, elkBounds, elkLabelRects) {
  Common.debugStackPush(false);

  const visuals = _resolveEdgeVisuals(edge, liftedEdgesMap, param, visualElementIndex);
  if (!visuals) {
    Common.debug(`>> skip edge ${edge._archiRelId || edge.id}: missing visual`);
    Common.debugStackPop();
    return;
  }
  const { archiRel, liftedIds, srcVisual, tgtVisual } = visuals;

  const containerOffset = _computeContainerOffset(containerNodeId, visualElementIndex);

  Common.debug(`>> draw edge ${archiRel}`);
  const connection = view.add(archiRel, srcVisual, tgtVisual);

  const elkAlgoPt = _edgeMiddlePoint(edge, containerOffset);
  const srcCenter = _getCenterBounds(connection.source);
  const tgtCenter = _getCenterBounds(connection.target);
  const { willBeMiddle, lpFixed } = _adjustLabelBendpoint(
    edge, param, elkAlgoPt, srcCenter, tgtCenter, containerOffset, elkBounds, elkLabelRects, archiRel.name, liftedIds
  );

  // Lifted cross-compound edges were routed by ELK between compound boundaries,
  // not between the actual child elements — those bendpoints produce wrong visuals.
  // Skip them: a straight child-to-child line is cleaner than an exit/re-entry path.
  if (!liftedIds) _drawBendpointsELK(param, edge, connection, containerOffset);

  _setConnectionTextPosition(connection, param, willBeMiddle, lpFixed, elkAlgoPt, srcCenter, tgtCenter);

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
function _drawBendpointsELK(param, edge, connection, containerOffset) {
  Common.debugStackPush(false);

  if (param.edgeRouting === ROUTING.STRAIGHT.id) { Common.debugStackPop(); return; }

  let points = (edge.sections && edge.sections[0] && edge.sections[0].bendPoints) || [];
  Common.debug(`ELK bendPoints: ${JSON.stringify(points)}`);

  // Internal edges are routed by ELK in container-relative coordinates.
  // containerOffset (set by _drawEdgeELK) converts them to absolute.
  const offsetX = containerOffset ? containerOffset.x : 0;
  const offsetY = containerOffset ? containerOffset.y : 0;

  let srcCenter = _getCenterBounds(connection.source);
  let tgtCenter = _getCenterBounds(connection.target);

  let bendpoints = points.map(function(p) {
    return _calcBendpoint({ x: p.x + offsetX, y: p.y + offsetY }, srcCenter, tgtCenter);
  });

  _addBendpoints(connection, bendpoints, param.layoutReversed.includes(connection.type));
  Common.debugStackPop();
}

function _getPadding(param) {
  return param.padding !== undefined ? param.padding : DEFAULTS.padding;
}

function _getEffectiveSplines(param) {
  return param.graphvizSplines || param.edgeRouting || ROUTING.ORTHOGONAL.id;
}

function _addBendpoints(connection, bendpoints, isReversed) {
  for (let i = 0; i < bendpoints.length; i++) {
    connection.addRelativeBendpoint(
      isReversed ? bendpoints[bendpoints.length - 1 - i] : bendpoints[i], i
    );
  }
}

// Project a point onto the source→target vector and return the Archi textPosition
// (0=source third, 1=middle third, 2=target third) that best represents it.
function _labelPositionFromPoint(pt, srcCenter, tgtCenter) {
  let dx = tgtCenter.x - srcCenter.x, dy = tgtCenter.y - srcCenter.y;
  let len2 = dx * dx + dy * dy;
  if (len2 === 0) return 1;
  let t = ((pt.x - srcCenter.x) * dx + (pt.y - srcCenter.y) * dy) / len2;
  if (t < 0.33) return 0;
  if (t > 0.67) return 2;
  return 1;
}

function _labelRect(pt, relName) {
  let w = Math.max(30, (relName ? relName.length : 0) * 7 + 10);
  return { x: pt.x - w / 2, y: pt.y - 7, w: w, h: 14 };
}

function _rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Start at algoPt (algo's natural label position). Try perpendicular offsets
// until the estimated label rectangle does not intersect any element or placed label.
function _findClearLabelPos(algoPt, edgeDir, allBounds, labelRects, relName) {
  let len = Math.sqrt(edgeDir.dx * edgeDir.dx + edgeDir.dy * edgeDir.dy);
  if (len === 0) return algoPt;
  let px = -edgeDir.dy / len, py = edgeDir.dx / len;
  let offsets = [0, 20, -20, 40, -40, 60, -60];
  for (let i = 0; i < offsets.length; i++) {
    let pt = { x: algoPt.x + px * offsets[i], y: algoPt.y + py * offsets[i] };
    let lr = _labelRect(pt, relName), ok = true;
    for (let j = 0; ok && j < allBounds.length;  j++) ok = !_rectsOverlap(lr, allBounds[j]);
    for (let j = 0; ok && j < labelRects.length; j++) ok = !_rectsOverlap(lr, labelRects[j]);
    if (ok) return pt;
  }
  return algoPt;
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
  Common.debug(`_layoutAndRenderDagre: elements=${filteredElements.length}`);
  if (!dagre) throw new Error("dagre-cluster-fix not loaded. Check node_modules/dagre-cluster-fix/index.js.");

  let { nodeMap, edgeList, parentMap, parentRels, occurrenceMap } = _buildGraphData(param, filteredElements);

  const graph = _buildGraphDagre(param, nodeMap, edgeList, parentMap);
  console.log("\nCalculating the Dagre graph layout...");
  dagre.layout(graph);

  return _drawViewDagre(param, graph, parentRels, parentMap, occurrenceMap);
}

function _buildGraphDagre(param, nodeMap, edgeList, parentMap) {
  const graph = new dagre.graphlib.Graph({ directed: true, compound: true, multigraph: true })
    .setGraph({
      rankdir: RANKDIR[param.layoutDirection] || "LR",
      nodesep: param.nodeSpacing,
      ranksep: param.layerSpacing,
      ranker:  param.dagreRanker || param.ranker || "network-simplex",
      marginx: 10, marginy: 10,
    })
    .setDefaultNodeLabel(function() { return {}; })
    .setDefaultEdgeLabel(function() { return { minlen: 1, weight: 1 }; });

  Object.keys(nodeMap).forEach(function(nodeId) {
    const node = nodeMap[nodeId];
    graph.setNode(nodeId, { label: nodeId, width: node.width, height: node.height, _archiId: node._archiId || nodeId });
  });
  Object.keys(parentMap).forEach(function(childId) {
    const parentId = parentMap[childId];
    if (graph.hasNode(childId) && graph.hasNode(parentId)) graph.setParent(childId, parentId);
  });
  edgeList.forEach(function(edge) {
    const src = edge.sources[0], tgt = edge.targets[0];
    if (src === tgt) return; // skip self-loops — Dagre errors on those
    // Skip edges involving duplicate occurrence nodes — they appear as boxes but get no relations
    const srcIsDup = nodeMap[src] && nodeMap[src]._archiId !== src;
    const tgtIsDup = nodeMap[tgt] && nodeMap[tgt]._archiId !== tgt;
    if (srcIsDup || tgtIsDup) return;
    const archiRelId = edge._archiRelId || edge.id;
    if (!graph.hasEdge(src, tgt, edge.id)) {
      graph.setEdge({ v: src, w: tgt, name: edge.id }, { id: archiRelId });
    }
  });
  return graph;
}

function _drawViewDagre(param, graph, parentRels, parentMap, occurrenceMap) {
  console.log("\nDrawing ArchiMate view (Dagre)...");
  const nodeIndex = {};
  let _dagreBounds = [], _dagreLabelRects = [];
  if (param.labelPosition === "middle" || param.labelPosition === "auto") {
    _dagreBounds = graph.nodes().map(function(id) {
      let n = graph.node(id);
      return { x: n.x - n.width / 2, y: n.y - n.height / 2, w: n.width, h: n.height };
    });
  }
  return _drawView(param,
    function(view, vIdx) {
      graph.nodes().forEach(function(nodeId) {
        _drawNodeDagre(graph, nodeId, nodeIndex, vIdx, view);
      });
    },
    function(view, vIdx) {
      graph.edges().forEach(function(edge) {
        _drawEdgeDagre(param, graph, edge, vIdx, view, _dagreBounds, _dagreLabelRects);
      });
    },
    parentRels, parentMap, occurrenceMap
  );
}

function _drawNodeDagre(graph, nodeId, nodeIndex, visualElementIndex, view) {
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
      _drawNodeDagre(graph, parentId, nodeIndex, visualElementIndex, view);
      const parentNode = graph.node(parentId);
      const relX = parseInt((node.x - node.width / 2) - (parentNode.x - parentNode.width / 2));
      const relY = parseInt((node.y - node.height / 2) - (parentNode.y - parentNode.height / 2));
      visualElementIndex[nodeId] = visualElementIndex[parentId].add(archiEl, relX, relY, node.width + 1, node.height + 1);
    }
  } catch(e) { console.error("-->" + e + "\n" + e.stack); }
  Common.debugStackPop();
}

function _drawEdgeDagre(param, graph, edge, visualElementIndex, view, dagreBounds, dagreLabelRects) {
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
  let   points     = edgeData.points || [];
  const srcCenter  = _getCenterBounds(connection.source);
  const tgtCenter  = _getCenterBounds(connection.target);

  // Current middle of the actual edge path — used as baseline for overlap detection.
  const inner = points.slice(1, points.length - 1);
  let _dagAlgoPt = inner.length > 0
    ? inner[Math.floor(inner.length / 2)]
    : { x: (srcCenter.x + tgtCenter.x) / 2, y: (srcCenter.y + tgtCenter.y) / 2 };

  const _lpFixed = { source: 0, middle: 1, target: 2 }[param.labelPosition];
  const _willBeMiddle = (_lpFixed === 1) ||
    (param.labelPosition === "auto" && points.length > 0 &&
     _labelPositionFromPoint(_dagAlgoPt, srcCenter, tgtCenter) === 1);

  if (_willBeMiddle && dagreBounds) {
    let edgeDir = { dx: tgtCenter.x - srcCenter.x, dy: tgtCenter.y - srcCenter.y };
    let adj = _findClearLabelPos(_dagAlgoPt, edgeDir, dagreBounds, dagreLabelRects, archiRel.name);
    // Substitute adjusted point as the middle of inner points.
    if (inner.length === 0) {
      // Straight edge: inject one bendpoint so Archi renders label at adj.
      points = points.length >= 2
        ? [points[0], adj, points[points.length - 1]]
        : [adj];
    } else {
      inner[Math.floor(inner.length / 2)] = adj;
      points = [points[0]].concat(inner).concat([points[points.length - 1]]);
    }
    dagreLabelRects.push(_labelRect(adj, archiRel.name));
  }

  // Skip first and last Dagre points (on node boundary); build bendpoint array,
  // then reverse it for reversed relations before adding sequentially.
  const bendpoints = [];
  for (let i = 1; i < points.length - 1; i++) {
    bendpoints.push(_calcBendpoint(points[i], srcCenter, tgtCenter));
  }
  _addBendpoints(connection, bendpoints, param.layoutReversed.includes(connection.type));

  if (_willBeMiddle) {
    connection.textPosition = 1;
  } else if (_lpFixed !== undefined) {
    connection.textPosition = _lpFixed;
  } else if (param.labelPosition === "auto" && points.length > 0) {
    connection.textPosition = _labelPositionFromPoint(_dagAlgoPt, srcCenter, tgtCenter);
  }
  Common.debugStackPop();
}

// ── end Dagre ────────────────────────────────────────────────────────────────

// ── Graphviz DOT engine ──────────────────────────────────────────────────────

function _layoutAndRenderGraphviz(param, filteredElements) {
  Common.debug(`_layoutAndRenderGraphviz: engine=${param.graphvizEngine || param.algorithm} elements=${filteredElements.length}`);
  let { nodeMap, edgeList, parentMap, parentRels, occurrenceMap } = _buildGraphData(param, filteredElements);

  let dotSource = _buildGraphGraphviz(param, nodeMap, edgeList, parentMap);
  Common.debug("_buildGraphGraphviz result:\n" + dotSource);
  console.log("\nRunning Graphviz (" + (param.graphvizEngine || "dot") + ")...");

  let jsonOut = _runDot(dotSource, param.algorithm, param.graphvizBin || DEFAULTS.graphvizBin);
  return _drawViewGraphviz(param, jsonOut, nodeMap, edgeList, parentMap, parentRels, occurrenceMap);
}

// Build a DOT source string from the graph structures produced by _fillGraph.
// Container nodes (those with children) are wrapped in subgraph cluster_<id> so
// Graphviz routes cross-container edges around cluster bounding boxes (compound=true).
// Edges are declared between the actual child nodes — no lhead/ltail — so the
// returned spline control points represent the complete child-to-child path.
function _buildGraphGraphviz(param, nodeMap, edgeList, parentMap) {
  const PX_TO_IN  = 1 / 96;
  const rankdir   = RANKDIR[param.layoutDirection] || "LR";
  const ranksep   = ((param.layerSpacing    || 180) * PX_TO_IN).toFixed(4);
  const nodesep   = ((param.nodeSpacing || 40)  * PX_TO_IN).toFixed(4);
  const nodeW     = ((param.nodeWidth   || DEFAULTS.nodeWidth)  * PX_TO_IN).toFixed(4);
  const nodeH     = ((param.nodeHeight  || DEFAULTS.nodeHeight) * PX_TO_IN).toFixed(4);
  const padding   = _getPadding(param);
  const splines   = _elkRoutingToDot(_getEffectiveSplines(param));

  // esep: extra separation between edge paths and node bounding boxes during routing.
  const esep = (splines === 'ortho') ? GV_EDGE_CLEARANCE_ORTHO : GV_EDGE_CLEARANCE_CURVED;

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
  let childSet = new Set(Object.keys(parentMap));

  // Write nodes recursively; containers become subgraph cluster_<id> containing
  // both the container node itself (for edge routing) and all child nodes.
  function writeNode(id, indent) {
    let children = Object.keys(parentMap).filter(function(k) { return parentMap[k] === id; });
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

  Object.keys(nodeMap)
    .filter(function(id) { return !childSet.has(id); })
    .forEach(function(id) { writeNode(id, '  '); });

  // When there are no real edges (all relations are nesting), DOT places nodes
  // at (0,0) — no ranking structure. Add invisible edges between root containers
  // so DOT produces a proper spaced layout.
  if (edgeList.length === 0 && Object.keys(parentMap).length > 0) {
    let rootIds = Object.keys(nodeMap).filter(function(id) { return !childSet.has(id); });
    for (let i = 0; i < rootIds.length - 1; i++) {
      lines.push('  "' + rootIds[i] + '" -> "' + rootIds[i + 1] + '" [style=invis weight=1]');
    }
  }

  // Write edges; swap src/tgt for layoutReversed (same logic as ELK path)
  let reversedSet = new Set(param.layoutReversed || []);
  edgeList.forEach(function(edge) {
    let src = edge.sources[0], tgt = edge.targets[0];
    if (reversedSet.has(edge._relType || "")) { let t = src; src = tgt; tgt = t; }
    let _gvXlabel = edge._relName
      ? edge._relName.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
      : '';
    let _gvEdgeAttrs = 'eid="' + edge.id + '"';
    if (_gvXlabel) _gvEdgeAttrs += ' xlabel="' + _gvXlabel + '"';
    lines.push('  "' + src + '" -> "' + tgt + '" [' + _gvEdgeAttrs + ']');
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
  let bin = binPath && binPath.trim() !== "" ? binPath.trim() : DEFAULTS.graphvizBin;
  let proc;
  try {
    let pb = new ProcessBuilder(Arrays.asList(bin, "-Tjson", "-K" + engine));
    pb.redirectErrorStream(false);
    proc = pb.start();
  } catch(e) {
    throw new Error("Graphviz not found at '" + bin + "'.\n" +
          "Install Graphviz (graphviz.org) and ensure 'dot' is on the system PATH,\n" +
          "or set the binary path in Layout → Graphviz binary.");
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
  if (code !== 0) throw new Error("Graphviz exited with code " + code + ".\n" + stderr.trim());

  try { return JSON.parse(stdout); }
  catch(e) { throw new Error("Failed to parse Graphviz JSON output: " + e); }
}

// Walk DOT JSON objects recursively, collecting node positions and cluster bounding
// boxes. All coordinates are converted to Archi pixel space (top-left origin).
function _collectDotObjects(jsonOut) {
  let rootBb  = _parseDotBb(String(jsonOut.bb || "0,0,0,0"));
  let totalH  = rootBb.ury;           // in DOT points; needed for Y-axis flip
  let totalW  = rootBb.urx * PT2PX;  // view width in pixels (after any Graphviz size scaling)
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
      let nw = obj.width  ? Math.round(parseFloat(String(obj.width))  * 96) : DEFAULTS.nodeWidth;
      let nh = obj.height ? Math.round(parseFloat(String(obj.height)) * 96) : DEFAULTS.nodeHeight;
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
  return { nodes: nodes, clusters: clusters, totalH: totalH, totalW: totalW };
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
    // Sample each cubic Bézier segment at t=0.25, 0.5, 0.75 to approximate the curve.
    function bezier(P0, P1, P2, P3, t) {
      let m = 1 - t;
      return {
        x: Math.round(m*m*m*P0.x + 3*m*m*t*P1.x + 3*m*t*t*P2.x + t*t*t*P3.x),
        y: Math.round(m*m*m*P0.y + 3*m*m*t*P1.y + 3*m*t*t*P2.y + t*t*t*P3.y),
      };
    }
    let numSegs = Math.floor((pts.length - 1) / 3);
    for (let seg = 0; seg < numSegs; seg++) {
      let P0 = pts[seg*3], P1 = pts[seg*3+1], P2 = pts[seg*3+2], P3 = pts[seg*3+3];
      bps.push(bezier(P0, P1, P2, P3, 0.25));
      bps.push(bezier(P0, P1, P2, P3, 0.5));
      bps.push(bezier(P0, P1, P2, P3, 0.75));
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
// Compute cluster bounding boxes from child node positions when the Graphviz engine
// does not emit them (force-directed engines: neato, fdp, sfdp).
function _deriveClusterBoundingBoxes(parentMap, existingClusters, nodes, padding) {
  let acc = {};
  Object.keys(parentMap).forEach(function(childId) {
    let cid = parentMap[childId];
    if (existingClusters[cid]) return;
    [nodes[childId], nodes[cid]].forEach(function(p) {
      if (!p) return;
      if (!acc[cid]) acc[cid] = { minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h };
      else {
        acc[cid].minX = Math.min(acc[cid].minX, p.x); acc[cid].minY = Math.min(acc[cid].minY, p.y);
        acc[cid].maxX = Math.max(acc[cid].maxX, p.x + p.w); acc[cid].maxY = Math.max(acc[cid].maxY, p.y + p.h);
      }
    });
  });
  let result = {};
  Object.keys(acc).forEach(function(cid) {
    let b = acc[cid];
    result[cid] = { x: b.minX - padding, y: b.minY - padding, w: (b.maxX - b.minX) + 2 * padding, h: (b.maxY - b.minY) + 2 * padding };
    console.log("  cluster bb computed from children for " + cid + " → " + JSON.stringify(result[cid]));
  });
  return result;
}

// Scale all node/cluster positions to fit within viewMaxWidth and return the scale factor.
// Acts as a fallback when Graphviz 'size' doesn't fully constrain compound/cluster graphs.
// Returns 1 when no scaling is needed (coords.totalW ≤ viewMaxWidth).
function _scaleGraphvizCoords(coords, param) {
  if (!(param.viewMaxWidth > 0 && coords.totalW > param.viewMaxWidth + 1)) return 1;
  const gvScale = param.viewMaxWidth / coords.totalW;
  console.log("- Graphviz view scaled to fit viewMaxWidth=" + param.viewMaxWidth + " (scale=" + gvScale.toFixed(3) + ")");
  [coords.nodes, coords.clusters].forEach(function(dict) {
    Object.keys(dict).forEach(function(id) {
      const o = dict[id]; o.x = Math.round(o.x * gvScale); o.y = Math.round(o.y * gvScale);
      o.w = Math.round(o.w * gvScale); o.h = Math.round(o.h * gvScale);
    });
  });
  return gvScale;
}

// Draw ArchiMate element visuals recursively, containers before their children.
function _drawGraphvizNodes(ids, parentVisual, parentAbsPos, view, vIdx, nodeMap, coords, containerIds, parentMap) {
  ids.forEach(function(nodeId) {
    const node    = nodeMap[nodeId];
    const archiEl = $("#" + (node._archiId || nodeId)).first();
    if (!archiEl) return;
    const absPos = containerIds.has(nodeId) && coords.clusters[nodeId] ? coords.clusters[nodeId] : coords.nodes[nodeId];
    if (!absPos) { console.log("  No position for " + nodeId); return; }
    const rx     = absPos.x - (parentAbsPos ? parentAbsPos.x : 0);
    const ry     = absPos.y - (parentAbsPos ? parentAbsPos.y : 0);
    const visual = parentVisual ? parentVisual.add(archiEl, rx, ry, absPos.w, absPos.h)
                                : view.add(archiEl, rx, ry, absPos.w, absPos.h);
    vIdx[nodeId] = visual;
    const children = Object.keys(parentMap).filter(function(k) { return parentMap[k] === nodeId; });
    if (children.length) _drawGraphvizNodes(children, visual, absPos, view, vIdx, nodeMap, coords, containerIds, parentMap);
  });
}

function _drawViewGraphviz(param, jsonOut, nodeMap, edgeList, parentMap, parentRels, occurrenceMap) {
  console.log("\nDrawing ArchiMate view (Graphviz)...");

  const coords   = _collectDotObjects(jsonOut);
  const gvScale  = _scaleGraphvizCoords(coords, param);

  // Fallback: force-directed engines (neato/fdp/sfdp) never emit cluster bbs — derive from children.
  Object.assign(coords.clusters, _deriveClusterBoundingBoxes(parentMap, coords.clusters, coords.nodes, _getPadding(param)));

  const reversedSet  = new Set(param.layoutReversed || []);
  const containerIds = new Set(Object.values(parentMap));
  const rootIds      = Object.keys(nodeMap).filter(function(id) { return !parentMap.hasOwnProperty(id); });

  const edgeById     = {};
  edgeList.forEach(function(e) { edgeById[e.id] = e; });
  const totalH       = _parseDotBb(String(jsonOut.bb || "0,0,0,0")).ury;
  const effSplines   = _getEffectiveSplines(param);
  const skipBendpoints = (effSplines === ROUTING.STRAIGHT.id || effSplines === "line");

  // Element bounds + label tracking for middle-bendpoint placement.
  const gvBounds = [], gvLabelRects = [];
  if (param.labelPosition === "middle" || param.labelPosition === "auto") {
    [coords.nodes, coords.clusters].forEach(function(dict) {
      Object.values(dict).forEach(function(b) { gvBounds.push(b); });
    });
  }

  function _drawGraphvizEdge(dotEdge, view, vIdx) {
    const gvEdge   = edgeById[String(dotEdge.eid || "")];
    if (!gvEdge) return;
    const archiRel = $("#" + gvEdge._archiRelId).first();
    if (!archiRel) return;
    const srcVisual = vIdx[archiRel.source.id];
    const tgtVisual = vIdx[archiRel.target.id];
    if (!srcVisual || !tgtVisual) return;
    const connection = view.add(archiRel, srcVisual, tgtVisual);
    if (!connection) return;

    // Use Graphviz-computed positions for centers — element.bounds can be stale in
    // jArchi when the same view is being re-laid-out. coords is in the same pixel space.
    const sc = coords.nodes[String(archiRel.source.id)] || coords.clusters[String(archiRel.source.id)];
    const tc = coords.nodes[String(archiRel.target.id)] || coords.clusters[String(archiRel.target.id)];
    const srcCenter = sc ? { x: Math.round(sc.x + sc.w / 2), y: Math.round(sc.y + sc.h / 2) } : _getCenterBounds(srcVisual);
    const tgtCenter = tc ? { x: Math.round(tc.x + tc.w / 2), y: Math.round(tc.y + tc.h / 2) } : _getCenterBounds(tgtVisual);

    // xlp: Graphviz's algo-computed external label position (from xlabel=).
    // Unlike lp (label=), xlabel= doesn't create a dummy node so layout is unaffected.
    // xlp is only present when the relation has a name; fallback uses path midpoint.
    let xlpPx = null;
    if (dotEdge.xlp) {
      const xlp = _parseDotXY(String(dotEdge.xlp));
      xlpPx = { x: Math.round(xlp.x * PT2PX), y: Math.round((totalH - xlp.y) * PT2PX) };
      if (gvScale !== 1) { xlpPx.x = Math.round(xlpPx.x * gvScale); xlpPx.y = Math.round(xlpPx.y * gvScale); }
    }

    const lpFixed = { source: 0, middle: 1, target: 2 }[param.labelPosition];

    if (skipBendpoints) { if (lpFixed !== undefined) connection.textPosition = lpFixed; return; }
    const posStr = String(dotEdge.pos || "");
    if (!posStr)  { if (lpFixed !== undefined) connection.textPosition = lpFixed; return; }
    let bps = _flattenDotSpline(posStr, totalH, effSplines);
    if (gvScale !== 1) bps = bps.map(function(p) { return { x: Math.round(p.x * gvScale), y: Math.round(p.y * gvScale) }; });
    if (!bps.length)   { if (lpFixed !== undefined) connection.textPosition = lpFixed; return; }

    // Reference point for textPosition decision: xlp (algo) or path midpoint (fallback).
    const refPt        = xlpPx || bps[Math.floor(bps.length / 2)];
    const willBeMiddle = (lpFixed === 1) ||
      (param.labelPosition === "auto" && refPt && _labelPositionFromPoint(refPt, srcCenter, tgtCenter) === 1);

    if (lpFixed !== undefined && !willBeMiddle) connection.textPosition = lpFixed;

    if (willBeMiddle) {
      // Find on-path bps point nearest to xlp (algo's preferred position).
      // Falls back to geometric midpoint when xlp is unavailable (unnamed relation).
      let midIdx = Math.floor(bps.length / 2);
      if (xlpPx && bps.length > 0) {
        let minD = Infinity;
        bps.forEach(function(p, i) {
          const d = (p.x - xlpPx.x) * (p.x - xlpPx.x) + (p.y - xlpPx.y) * (p.y - xlpPx.y);
          if (d < minD) { minD = d; midIdx = i; }
        });
      }
      const adj = _findClearLabelPos(bps[midIdx], { dx: tgtCenter.x - srcCenter.x, dy: tgtCenter.y - srcCenter.y }, gvBounds, gvLabelRects, gvEdge._relName);
      bps[midIdx] = adj;
      gvLabelRects.push(_labelRect(adj, gvEdge._relName));
      connection.textPosition = 1;
    }

    const calcBps = bps.map(function(p) { return _calcBendpoint(p, srcCenter, tgtCenter); });
    _addBendpoints(connection, calcBps, reversedSet.has(connection.type));
  }

  return _drawView(param,
    function(view, vIdx) { _drawGraphvizNodes(rootIds, null, null, view, vIdx, nodeMap, coords, containerIds, parentMap); },
    function(view, vIdx) { (jsonOut.edges || []).forEach(function(dotEdge) { _drawGraphvizEdge(dotEdge, view, vIdx); }); },
    parentRels, parentMap, occurrenceMap
  );
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = Object.assign({ generate_view, CAPABILITIES }, Defs, Presets);
}
