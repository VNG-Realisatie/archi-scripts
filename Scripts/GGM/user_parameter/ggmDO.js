// workaround for reading multiple USER_PARAM
// https://www.w3docs.com/snippets/javascript/how-to-unset-a-javascript-variable.html
// - If the property is created without let, the operator can delete it

USER_PARAM = {
  graphDepth: 2,
  includeElementType: [
    "data-object",
     "grouping"
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

  nodeWidth: 160,
  nodeHeight: 60,
  hSep: 20,
  vSep: 50,
};
