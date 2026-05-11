/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "GenerateMultiple",
  "graphDepth": 4,
  "includeElementType": [
    "business-object",
    "business-function"
  ],
  "includeRelationType": [
    "access-relationship:out",
    "aggregation-relationship:out"
  ],
  "layoutReversed": [
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship"
  ],
  "layoutNested": [
    "access-relationship",
    "aggregation-relationship"
  ],
  "layoutCircular": true,
  "graphDirection": "LR",
  "ranker": "network-simplex",
  "nodeWidth": 250,
  "nodeHeight": 30,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "BF en BO views start",
  "elkAlgorithm": "layered",
  "elkDirection": "RIGHT",
  "elkAlignment": "TOP_LEFT",
  "elkEdgeRouting": "ORTHOGONAL",
  "elkSpacingNodeNode": 10,
  "elkLayerSpacing": 150,
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
  "_lastTabIndex": 1
};
