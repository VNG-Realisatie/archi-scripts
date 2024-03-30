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
		// "application-component",
    // "application-function",
    // "application-interface",
    // "application-service",
    // "business-function",
    // "business-object",
    // "constraint",
    "grouping",
    "artifact",
    "communication-network",
    "device",
    "node",
    "path",
    "system-software",
    "technology-collaboration",
    "technology-event",
    "technology-function",
    "technology-interaction",
    "technology-interface",
    "technology-process",
    "technology-service",
  ],
  includeRelationType: [
		// "assignment-relationship",
    // "flow-relationship",
    // "specialization-relationship",
    // "realization-relationship",
    // "serving-relationship"
  ],
  layoutReversed: [
		// "aggregation-relationship",
    // "assignment-relationship",
    "realization-relationship",
    "serving-relationship",
    // "specialization-relationship",
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
