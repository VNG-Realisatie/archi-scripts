/**
 * User defined parameter
 *
 * This definition is read by function get_user_parameter.
 * - defined attributes are inserted (or overwrite) the previous param
 *
 */

module.exports = {
  includeElementType: [
    // "application-component",
    // "application-function",
    // "application-interface",
    // "application-service",
    "business-actor",
    "business-collaboration",
    "business-event",
    "business-function",
    "business-interaction",
    "business-interface",
    "business-object",
    "business-process",
    "business-role",
    "business-service",
    "contract",
    "product",
    "representation",
    // "constraint",
    // "grouping",
  ],

  includeRelationType: [
    "aggregation-relationship",
    "assignment-relationship",
    "composition-relationship",
    // "flow-relationship",
    "serving-relationship",
    "specialization-relationship",
    "realization-relationship",
  ],
  layoutReversed: [
    // "aggregation-relationship",
    // "assignment-relationship",
    "realization-relationship",
    "serving-relationship",
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
};
