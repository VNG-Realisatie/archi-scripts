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
  includeElementType: [
    "application-component",
    "application-service",
    // "artifact",
    // "assessment",
    // "business-actor",
    // "business-collaboration",
    // "business-event",
    "business-function",
    // "business-interaction",
    // "business-interface",
    // "business-object",
    // "business-process",
    // "business-role",
    // "business-service",
    // "constraint",
    // "grouping",
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
    "serving-relationship",
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
};