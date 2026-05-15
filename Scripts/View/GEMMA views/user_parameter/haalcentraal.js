/**
 * Layout voor Haal Centraal view
 */

module.exports = {
  action: View.LAYOUT,
  includeElementType: [],
  includeRelationType: [],
  layoutReversed: [
    // "aggregation-relationship",
    // "assignment-relationship",
    // "composition-relationship",
    "realization-relationship",
    // "serving-relationship",
    "specialization-relationship",
  ],

  layoutNested: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    // "composition-relationship",
    // "realization-relationship",
    // "serving-relationship"
    // "specialization-relationship",
  ],

  // viewName: "gen-custom",

  // graphDepth: 1,
  graphDepth: 0, // layout selected elements and relations of these elements

  // layoutDirection: "RIGHT" | "DOWN" | "UP" | "LEFT"
  layoutDirection: "RIGHT",

  nodeWidth: 200,
  nodeHeight: 60,
  nodeSpacing: 20,
  layerSpacing:    200,

  debug: false,
};
