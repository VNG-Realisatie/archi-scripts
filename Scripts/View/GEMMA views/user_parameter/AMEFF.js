/**
 * genereer view van technische architectuur en link met referentiecomponenten
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
    // "application-service",
    // "constraint",
    // "grouping",
    // "system-software",
    // "technology-collaboration",
    // "technology-event",
    // "technology-function",
    // "technology-interaction",
    // "technology-interface",
    // "technology-process",
    // "technology-service",
  ],
  includeRelationType: [
    "aggregation-relationship",
    "assignment-relationship",
    "association-relationship",
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
    "realization-relationship",
    "serving-relationship",
    "specialization-relationship",
  ],

  layoutNested: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    // "association-relationship",
    // "composition-relationship",
    // "realization-relationship",
    // "serving-relationship"
    "specialization-relationship",
  ],

    // nodeWidth: 270,
    //   nodeHeight: 25,
    //   hSep: 15,
      layerSpacing: 80,
};
