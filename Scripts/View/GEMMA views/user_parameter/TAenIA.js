/**
 * genereer view van technische architectuur en link met referentiecomponenten
 */

USER_PARAM = {
  includeElementType: [
    // "application-collaboration",
    "application-component",
    // "application-event",
    // "application-function",
    // "application-interaction",
    // "application-interface",
    // "application-process",
    "application-service",
    "constraint",
    // "grouping",
    "system-software",
    // "technology-collaboration",
    // "technology-event",
    // "technology-function",
    // "technology-interaction",
    // "technology-interface",
    // "technology-process",
    "technology-service",
  ],
  includeRelationType: [
    "aggregation-relationship",
    // "assignment-relationship",
    "association-relationship",
    "composition-relationship",
    "realization-relationship",
    "serving-relationship",
    // "specialization-relationship",
  ],
  layoutReversed: [
    // "aggregation-relationship",
    // "assignment-relationship",
    "association-relationship",
    // "composition-relationship",
    // "realization-relationship",
    "serving-relationship",
    // "specialization-relationship",
  ],

  layoutNested: [
    // "access-relationship",
    "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    // "realization-relationship",
    // "serving-relationship"
    // "specialization-relationship",
  ],

  // viewName: "gen-custom",

  graphDepth: 1,
  // graphDepth: 0, // layout selected elements and relations of these elements

  // graphDirection: BottomTop, LeftRight, ... "TB", "BT", "LR", "RL"
  // graphDirection: "LR",
  graphDirection: "LR",

  // graphAlign: UpLeft, DownRight "UL", "UR", "DL", "DR"
  // graphAlign: "UL",

  // ranker: "longest-path",
  // ranker: "tight-tree",
  ranker: "network-simplex", // default

  nodeWidth: 200,
  nodeHeight: 60,
  hSep: 20,
  vSep: 180,

  debug: false,
};
