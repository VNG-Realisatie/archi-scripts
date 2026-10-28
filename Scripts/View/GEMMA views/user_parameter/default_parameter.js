/**
 * User defined default view parameter
 *
 * This definition is read by function get_default_parameter
 */
module.exports = {
  action: View.GENERATE_SINGLE,
  // action: GENERATE_MULTIPLE,
  // action: EXPAND_HERE,
  // action: View.LAYOUT,

  // graphDepth: 1,
  graphDepth: 1,

  includeElementType: [],
  includeRelationType: [],
  layoutReversed: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    "association-relationship",
    // "composition-relationship",
    // "flow-relationship",
    // "influence-relationship",
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
    // "triggering-relationship",
  ],
  layoutNested: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    // "flow-relationship",
    // "influence-relationship",
    // "realization-relationship",
    // "serving-relationship",
    // "specialization-relationship",
    // "triggering-relationship",
  ],

  // layoutDirection: "RIGHT" | "DOWN" | "UP" | "LEFT"
  layoutDirection: "RIGHT",

  nodeWidth: 200,
  nodeHeight: 60,
  nodeSpacing: 20,
  layerSpacing:    180,

  // viewName: "gen-custom",
  debug: false,
};
