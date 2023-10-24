/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - the parameter name has to be USER_PARAM
 * - defined attributes are inserted (or overwrite) the previous param
 * 
 */
const USER_PARAM = {
  includeElementType: [
    "application-interface",
    "application-service",
    "constraint",
    "grouping",
  ],
  includeRelationType: [
    // "access-relationship",
    "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    // "flow-relationship",
    // "influence-relationship",
    "realization-relationship",
    // "serving-relationship",
    "specialization-relationship",
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
    // "realization-relationship",
    // "serving-relationship",
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
    "specialization-relationship",
    // "triggering-relationship",
  ],
};
