/**
 * Saved from _GUI.ajs
 */

module.exports = {
  "action": "Layout",
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
    "serving-relationship"
  ],
  "layoutNested": [
    "aggregation-relationship"
  ],
  "layoutCircular": true,
  "graphDirection": "LR",
  "ranker": "network-simplex",
  "nodeWidth": 250,
  "nodeHeight": 80,
  "hSep": 20,
  "vSep": 180,
  "debug": false,
  "excludeFromView": false,
  "viewName": "Dienstverlening",
  "elkAlgorithm": "dagre",
  "elkDirection": "RIGHT",
  "elkAlignment": "TOP_LEFT",
  "elkEdgeRouting": "ORTHOGONAL",
  "elkSpacingNodeNode": 50,
  "elkLayerSpacing": 200,
  "elkPadding": 20,
  "nestingMultipleOccurrences": false,
  "elkNodePlacementAlignment": "BALANCED",
  "dagreRanker": "network-simplex",
  "useRelationWeights": false,
  "elkNestedAlgorithm": "rectpacking",
  "elkNestedSpacingNodeNode": 30,
  "elkNestedExpandToFill": true,
  "elkSortLeavesOnly": false,
  "elkExpandExcludeTypes": [
    "business-object"
  ],
  "elkSameTypeResize": true,
  "_lastTabIndex": 1,
  "_lastPresetName": "Per beleidsdomein.js",
  "graphvizEngine": "dot",
  "graphvizBin": "",
  "_windowBounds": {
    "x": 1641,
    "y": 709,
    "width": 1007,
    "height": 1300
  },
  "graphvizSplines": "ORTHOGONAL",
  "doc": "Selecteer 1 of meer beleidsdomeinen en genereer 1 view voor ieder"
};
