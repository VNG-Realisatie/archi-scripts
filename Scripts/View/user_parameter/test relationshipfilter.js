/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Generate",
  "graphDepth": 5,
  "includeElementType": [
    "business-object",
    "grouping",
    "business-function"
  ],
  "includeRelationType": [
    "access-relationship:in",
    "aggregation-relationship:in",
    "association-relationship:out"
  ],
  "layoutReversed": [
    "realization-relationship",
    "serving-relationship"
  ],
  "layoutNested": [
    "access-relationship",
    "aggregation-relationship"
  ],
  "layoutCircular": true,
  "graphDirection": "LR",
  "ranker": "network-simplex",
  "nodeWidth": 300,
  "nodeHeight": 60,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "Werkgelegenheid",
  "elkAlgorithm": "box",
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
  ]
};
