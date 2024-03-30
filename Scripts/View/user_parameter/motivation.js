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
    // "assessment",
    "constraint",
    // "driver",
    // "goal",
    // "meaning",
    // "outcome",
    // "principle",
    // "requirement",
    // "stakeholder",
    // "value",
    "grouping",
  ],
  includeRelationType: [
		"aggregation-relationship",
		// "assignment-relationship",
    // "flow-relationship",
    "specialization-relationship",
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
    "aggregation-relationship",
    // "assignment-relationship",
    // "composition-relationship",
    // "realization-relationship",
    // "serving-relationship"
    "specialization-relationship",
  ],
};
