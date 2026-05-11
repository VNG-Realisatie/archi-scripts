/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Generate",
  "graphDepth": 2,
  "includeElementType": [
    "business-object",
    "grouping"
  ],
  "includeRelationType": [
    "aggregation-relationship:out",
    "association-relationship",
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
  "nodeWidth": 250,
  "nodeHeight": 30,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "Afval",
  "elkAlgorithm": "dagre",
  "elkDirection": "RIGHT",
  "elkAlignment": "TOP_LEFT",
  "elkEdgeRouting": "ORTHOGONAL",
  "elkSpacingNodeNode": 10,
  "elkLayerSpacing": 150,
  "elkPadding": 20,
  "nestingMultipleOccurrences": false,
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
  "_lastPresetName": "Bedrijfsfuncties en bedrijfsobjecten.js",
  "graphvizEngine": "dot",
  "graphvizBin": "",
  "doc": "Selecteer 1 of meer beleidsdomeinen en genereer 1 view voor ieder"
};
