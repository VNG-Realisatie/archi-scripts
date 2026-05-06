/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Expand",
  "graphDepth": 1,
  "includeElementType": [
    "grouping",
    "business-function",
    "business-object"
  ],
  "includeRelationType": [
    "association-relationship",
    "specialization-relationship",
    "aggregation-relationship"
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
  "nodeWidth": 150,
  "nodeHeight": 30,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "NatuurlijkPersoon",
  "elkAlgorithm": "layered",
  "elkDirection": "RIGHT",
  "elkNodePlacementAlignment": "NONE",
  "elkEdgeRouting": "POLYLINE",
  "elkSpacingNodeNode": 80,
  "elkLayerSpacing": 150,
  "elkPadding": 20,
  "nestingMultipleOccurrences": true
};
