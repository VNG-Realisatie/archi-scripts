/**
 * genereer view met buitengemeentelijke componenten
 */

load(__DIR__ + "../include_view.js");


// workaround for reading multiple USER_PARAM
// https://www.w3docs.com/snippets/javascript/how-to-unset-a-javascript-variable.html
// - If the property is created without let, the operator can delete it

USER_PARAM = {
  includeElementType: [
    "application-component",
    // "application-function",
    // "application-interface",
    "application-service",
    // "business-actor",
    "business-collaboration",
    // "business-event",
    // "business-function",
    // "business-interaction",
    // "business-interface",
    // "business-object",
    // "business-process",
    // "business-role",
    // "business-service",
    // "contract",
    // "product",
    // "representation",
    "constraint",
    "grouping",
  ],

  includeRelationType: [
    "aggregation-relationship",
    // "assignment-relationship",
    // "composition-relationship",
    // "flow-relationship",
    // "serving-relationship",
    // "specialization-relationship",
    "realization-relationship",
  ],
  layoutReversed: [
    // "aggregation-relationship",
    // "assignment-relationship",
    // "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
  ],

  layoutNested: [
    // "access-relationship",
    "aggregation-relationship",
    // "assignment-relationship",
    // "composition-relationship",
    "realization-relationship",
    // "serving-relationship"
    // "specialization-relationship",
  ],
};
