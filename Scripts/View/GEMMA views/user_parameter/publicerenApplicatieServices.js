/**
 * genereer view voor het publiceren van API-standaarden
 * - selecteer API-standaarden
 * - genereer view
 * - _layout_API-standaarden
 */


module.exports = {
  includeElementType: [
    // "application-collaboration",
    // "application-component",
    // "application-event",
    // "application-function",
    // "application-interaction",
    // "application-interface",
    // "application-process",
    "application-service",
    // "constraint",
    "grouping",
  ],
  includeRelationType: [
    "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    "composition-relationship",
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
  ],
  layoutReversed: [
    // "aggregation-relationship",
    // "assignment-relationship",
    "association-relationship",
    // "composition-relationship",
    // "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
  ],
  
  layoutNested: [
    // "access-relationship",
    "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
  ],
};
