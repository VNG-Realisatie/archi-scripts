/**
 * User defined default view parameter
 *
 * This definition is read by function get_default_parameter
 */
module.exports = {
  action: View.GENERATE_SINGLE,
  // action: GENERATE_MULTIPLE,
  // action: EXPAND_HERE,
  // action: View.LAYOUT,

  graphDepth: 1,

  includeElementType: [],
  includeRelationType: [],
  layoutReversed: [
    // "access-relationship",
    // "aggregation-relationship",
    // "assignment-relationship",
    "association-relationship",
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

  // Layout engine + algorithm
  // elkAlgorithm: "layered" | "mrtree" | "force" | "box" | "stress" | "radial"  — ELK engine
  // elkAlgorithm: "dagre"  — Dagre cluster-fix engine (better cross-compound edge routing)
  //   dagre extra: ranker: "network-simplex" | "tight-tree" | "longest-path"
  elkAlgorithm: "layered",
  // elkDirection: "RIGHT" | "DOWN" | "UP" | "LEFT"
  elkDirection: "RIGHT",
  elkSpacingNodeNode: 40,   // space between nodes in same layer (replaces hSep)
  elkLayerSpacing:    180,  // space between layers (replaces vSep)
  // elkNodePlacementAlignment: "NONE" | "LEFTUP" (top) | "BALANCED" (center) | "RIGHTDOWN" (bottom)
  elkNodePlacementAlignment: "NONE",
  // elkEdgeRouting: "ORTHOGONAL" | "POLYLINE" | "STRAIGHT"
  elkEdgeRouting: "ORTHOGONAL",
  elkPadding: 20,           // padding inside nested containers

  nodeWidth:  200,
  nodeHeight: 60,

  // viewName: "gen-custom",
  debug: false,
};
