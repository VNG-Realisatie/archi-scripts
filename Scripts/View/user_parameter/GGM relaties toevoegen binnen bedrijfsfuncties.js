/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Expand",
  "graphDepth": 0,
  "includeElementType": [
    "business-object",
    "business-function",
    "grouping"
  ],
  "includeRelationType": [
    "association-relationship",
    "specialization-relationship"
  ],
  "layoutReversed": [
    "serving-relationship",
    "realization-relationship",
    "specialization-relationship"
  ],
  "layoutNested": [
    "aggregation-relationship",
    "access-relationship"
  ],
  "layoutCircular": true,
  "graphDirection": "LR",
  "ranker": "network-simplex",
  "nodeWidth": 300,
  "nodeHeight": 30,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "Uitvoering Sociaal Domein",
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
  "useRelationWeights": false
};
