/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - defined attributes are inserted (or overwrite) the previous param
 * 
 */

module.exports = {
  action: View.LAYOUT,
  layoutReversed: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
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
    "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    // "flow-relationship",
    "influence-relationship",
    // "realization-relationship",
    // "serving-relationship",
    "specialization-relationship",
    // "triggering-relationship",
  ],
  nodeWidth: 200,
  nodeHeight: 60,
  elkSpacingNodeNode: 40,  // space between nodes in same layer
  elkLayerSpacing:    20,  // space between layers

};
