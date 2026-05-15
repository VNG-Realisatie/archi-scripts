/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Generate",
  "graphDepth": 6,
  "includeElementType": [
    "grouping",
    "business-object"
  ],
  "includeRelationType": [
    "aggregation-relationship:in",
    "specialization-relationship"
  ],
  "layoutReversed": [
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship"
  ],
  "layoutNested": [
    "aggregation-relationship"
  ],
  "layoutCircular": true,
  "graphDirection": "LR",
  "ranker": "network-simplex",
  "nodeWidth": 200,
  "nodeHeight": 60,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "Geo-Object",
  "elkAlgorithm": "dot",
  "elkDirection": "RIGHT",
  "elkAlignment": "TOP_LEFT",
  "elkEdgeRouting": "STRAIGHT",
  "elkSpacingNodeNode": 60,
  "elkLayerSpacing": 200,
  "elkPadding": 20,
  "nestingMultipleOccurrences": true,
  "elkNodePlacementAlignment": "BALANCED",
  "dagreRanker": "network-simplex",
  "useRelationWeights": false,
  "elkNestedAlgorithm": "rectpacking",
  "elkNestedSpacingNodeNode": 10,
  "elkNestedExpandToFill": true,
  "elkSortLeavesOnly": true,
  "elkExpandExcludeTypes": [
    "business-object"
  ],
  "elkSameTypeResize": true,
  "_lastTabIndex": 1,
  "_lastPresetName": "GGM specialisaties.js",
  "graphvizBin": "",
  "_windowBounds": {
    "x": 2112,
    "y": 488,
    "width": 1007,
    "height": 1300
  },
  "graphvizSplines": "STRAIGHT"
};
