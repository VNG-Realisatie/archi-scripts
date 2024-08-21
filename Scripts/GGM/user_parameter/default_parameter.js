/**
 * User defined default view parameter
 *
 * This definition is read by function get_default_parameter
 */
const DEFAULT_PARAM = {
  action: GENERATE_SINGLE,
  // action: GENERATE_MULTIPLE,
  // action: EXPAND_HERE,
  // action: LAYOUT,

  // graphDepth: 1,
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
  // layoutCircular: LAYOUT_CIRCULAR_WORKAROUND, // layout circular relation with script (try this when dagre crashes)
  layoutCircular: LAYOUT_CIRCULAR_DAGRE, // default: layout circular relation with dagre

  // graphDirection: BottomTop, LeftRight, ... "TB", "BT", "LR", "RL"
  graphDirection: "LR",
  // graphDirection: "TB",
  
  // graphAlign: UpLeft, DownRight "UL", "UR", "DL", "DR"
  // graphAlign: "UL",
  
  // ranker: "longest-path",
  // ranker: "tight-tree",
  ranker: "network-simplex",
  
  nodeWidth: 200,
  nodeHeight: 60,
  hSep: 40,
  vSep: 180,
  
  // viewName: "gen-custom",
  debug: false,
};
