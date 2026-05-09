/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Generate",
  "graphDepth": 0,
  "includeElementType": [
    "business-object",
    "business-function"
  ],
  "includeRelationType": [
    "aggregation-relationship:out",
    "access-relationship:out"
  ],
  "layoutReversed": [
    "serving-relationship",
    "realization-relationship"
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
  "viewName": "BA01 Bedrijfsfunctiemodel en bedrijfsobjecten",
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
  ],
  "doc": "Voor layout. Werkt misschien ook voor genereren van BF-model laag"
};
