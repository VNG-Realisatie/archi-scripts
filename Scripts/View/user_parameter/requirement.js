/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - defined attributes are inserted (or overwrite) the previous param
 *
 */

module.exports = {
  action: View.LAYOUT,
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

  // elkDirection: "RIGHT" | "DOWN" | "UP" | "LEFT"
  elkDirection: "RIGHT",

  nodeWidth: 200,
  nodeHeight: 60,
  elkSpacingNodeNode: 20,
  elkLayerSpacing:    180,

  debug: false,
};
