/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - defined attributes are inserted (or overwrite) the previous param
 *
 */

module.exports = {
  graphDepth: 2,
  includeElementType: [
    "business-object",
    "grouping",
  ],
  includeRelationType: [
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
    // "influence-relationship",
    // "realization-relationship",
    // "serving-relationship",
    // "specialization-relationship",
    // "triggering-relationship",
  ],
  excludeFromView: true,

  // nodeWidth: 200,
  // nodeHeight: 60,
  // nodeWidth: 116,
  // nodeHeight: 65,

  nodeWidth: 200,
  nodeHeight: 60,
  hSep: 20,
  vSep: 160,
  
};