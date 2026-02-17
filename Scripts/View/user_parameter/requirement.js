/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - the parameter name has to be USER_PARAM
 * - defined attributes are inserted (or overwrite) the previous param
 *
 */

// workaround for reading multiple USER_PARAM
// https://www.w3docs.com/snippets/javascript/how-to-unset-a-javascript-variable.html
// - If the property is created without let, the operator can delete it

USER_PARAM = {
  action: LAYOUT,
  includeElementType: [],
  includeRelationType: [],
  layoutReversed: [
    // "aggregation-relationship",
    "assignment-relationship",
    "association-relationship",
    // "composition-relationship",
    // "realization-relationship",
    // "serving-relationship",
    // "specialization-relationship",
  ],

  layoutNested: [
    // "access-relationship",
    "aggregation-relationship",
    "assignment-relationship",
    "association-relationship",
    // "composition-relationship",
    "realization-relationship",
    // "serving-relationship"
    // "specialization-relationship",
  ],

  // viewName: "gen-custom",

  // graphDepth: 1,
  graphDepth: 0, // layout selected elements and relations of these elements

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
