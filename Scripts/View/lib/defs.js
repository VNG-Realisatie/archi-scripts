/**
 * View subsystem — Single Source of Truth
 *
 * Defines: styles, algorithms, GUI parameters, algorithm→activeParams,
 * algorithm→supportedOptions, engine parameter mapping, relation/element types,
 * preset schema defaults, action and routing constants.
 *
 * Single shared import: the diagram-object type list from _lib/selection.js
 * (SSOT for what counts as a canvas diagram object).
 */
console.log("Loading defs.js");

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../../_lib/selection")} */
const { DIAGRAM_OBJECT_TYPES } = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("./rel_filter")} */
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROP_ID = "Object ID";
// View property recording one managed extra occurrence: "<element id> in <container id> [in …]".
const PROP_MANAGED_OCCURRENCE = "Managed occurrence";

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = Object.freeze({
  Flow:      { algorithms: ["Layered", "Dagre", "Dot"],                      tooltip: "Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models." },
  Hierarchy: { algorithms: ["Tree", "Twopi"],                                tooltip: "Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition." },
  Network:   { algorithms: ["Force", "Stress", "Neato", "FDP", "SFDP"],      tooltip: "Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks." },
  Circular:  { algorithms: ["Radial", "Circo"],                              tooltip: "Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures." },
  Compact:   { algorithms: ["Grid", "Pack"],                                 tooltip: "Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries." },
});

// ── Algorithm param groups ────────────────────────────────────────────────────
// Shared groups spread into activeParams arrays; each algorithm shows only its unique additions.

// Active in every algorithm — not algorithm-specific.
const ALWAYS_ACTIVE_PARAMS = Object.freeze(["elementWidth", "elementHeight", "diagramPadding"]);

// ELK full-nesting controls — Layered, Tree, Grid, Pack.
const PARAMS_ELK_NESTING = Object.freeze([
  "nestingRules", "padding",
  "sortContainers", "alignWidthSameType",
  "containerAlgorithm",
]);

// Params without a dialog control: no or minimal effect on the view. They stay in DEFAULT_PRESET
// and activeParams (the engines use them), so a preset can still set them; generate_view logs a
// value that differs from the default. diagramPadding only offsets the whole diagram on the canvas.
const HIDDEN_PARAMS = Object.freeze(["diagramPadding"]);

// Minimum distance (px) between an element and the first / last bendpoint of a connection,
// so the bend never falls inside the end decoration Archi draws there (diamond, arrowhead).
// Floor for connectionElementSpacing between layers (ELK Layered: edgeNodeBetweenLayers).
const CONNECTION_END_CLEARANCE = 25;

// Dialog label per layout param, and the Layout-tab group it is in. Used for the dialog's
// "Not used by …" hints, tooltips and the capability matrix in SPEC.md.
const PARAM_LABELS = Object.freeze({
  nestingRules:             "Nesting",
  reverseRules:             "Reverse",
  containerAlgorithm:       "Layout inside",
  connectionsMode:          "Connections",
  padding:                  "Padding",
  sortContainers:           "Sort containers",
  alignWidthSameType:       "Same width per level",
  snapColumnsToGrid:        "Snap columns to grid",
  direction:                "Direction",
  acyclicer:                "Cycles",
  ranking:                  "Ranking",
  nodePlacement:            "Placement",
  layerSpacing:             "Layer distance",
  elementWidth:             "Width",
  elementHeight:            "Height",
  labelSizing:              "Use label width",
  labelMaxLineWidth:        "Wrap label at",
  elementSpacing:           "Distance",
  routing:                  "Routing",
  labelPosition:            "Label",
  connectionLabelSpacing:   "Reserve label space",
  connectionSpacing:        "Between",
  connectionElementSpacing: "Distance to element",
  aspectRatio:              "Aspect ratio",
  maxWidth:                 "Max width",
  diagramPadding:           "Diagram padding",
});
// Tooltip per layout param: [what it does, unit / detail]. The dialog adds a third line
// "Used by: …" computed from activeParams, so tooltips never contradict the registry.
/** @type {Readonly<Record<string, string[]>>} */
const PARAM_TOOLTIPS = Object.freeze({
  nestingRules:             ["Draw matching relations as nesting: the child inside its parent.",
                             "Parent = source of the relation; with Reverse, the target. A child with several parents is nested in one of them; " +
                             "a rule with Every shows it in every parent."],
  reverseRules:             ["Flips matching relations. Flow: laid out from target to source, against the Direction in the Flow box; arrows are unchanged.",
                             "Nesting: if the relation is also nested, the target becomes the parent."],
  containerAlgorithm:       ["Algorithm that arranges the elements inside each container.",
                             "Grid or Pack: Connections is locked to Between containers."],
  connectionsMode:          ["Between containers: each container is laid out on its own; connections enter at its border.",
                             "Crossing containers: the whole view is one layout; connections run straight to the element inside."],
  padding:                  ["Space between a container's border and its contents.", "px"],
  sortContainers:           ["Order containers by type and name, as elements always are.",
                             "Grid and Pack keep this order; the other algorithms start from it."],
  alignWidthSameType:       ["Give all boxes of one nesting level the same width.",
                             "Each parent level is one padding step wider; a container never gets narrower than its contents."],
  snapColumnsToGrid:        ["Line columns up top to bottom on one grid across the whole view.",
                             "Each column is as wide as its widest element; element sizes are unchanged."],
  direction:                ["Direction of the main flow.", ""],
  acyclicer:                ["How relation cycles are broken before layout.",
                             "Default: depth-first search. Greedy: a heuristic that reverses few relations. No effect without cycles."],
  ranking:                  ["How elements are assigned to layers.",
                             "Balanced (network simplex): short connections. Uniform (longest path) and Top-aligned (tight tree): faster."],
  nodePlacement:            ["Where elements sit within their layer.", ""],
  layerSpacing:             ["Distance between layers along the flow; Radial and Twopi: between rings.",
                             "px — with Reserve label space a gap widens to fit its labels."],
  elementWidth:             ["Width of every element.", "px — not used with Use label width."],
  elementHeight:            ["Height of every element.", "px — not used with Use label width."],
  labelSizing:              ["Size each element to its label; long labels wrap to two lines.", "Replaces Width and Height."],
  labelMaxLineWidth:        ["Label width at which Use label width wraps to a second line.", "px — only with Use label width."],
  elementSpacing:           ["Minimum distance between elements, also between unconnected groups.", "px"],
  routing:                  ["How connection lines are drawn.", ""],
  labelPosition:            ["Where the connection label sits.", ""],
  connectionLabelSpacing:   ["Keep connection labels clear of other labels, connections and elements.",
                             "A layer gap widens where a label needs label + 2 × Between."],
  connectionSpacing:        ["Distance between parallel connections, and between connection points on one side of an element.",
                             "px — elements grow to fit their connections; 0 = no growth."],
  connectionElementSpacing: ["Minimum distance between a connection and the elements it passes.",
                             `px — the first and last bend stay at least ${CONNECTION_END_CLEARANCE} from the element, clear of the end symbol.`],
  aspectRatio:              ["Arrange the layout toward this width-to-height ratio.", "Element sizes are unchanged."],
  maxWidth:                 ["The view is at most this wide: a wider layout is arranged in more rows.",
                             "px — element sizes are unchanged."],
});

/**
 * "Used by: …" line for a param, from activeParams.
 * @param {string} key  param name
 * @returns {string}    e.g. "Used by: Layered, Dagre" or "Used by: all algorithms except Twopi"
 */
function paramUsedBy(key) {
  const names = Object.keys(ALGORITHMS);
  const users = names.filter(n => ALGORITHMS[n].activeParams.includes(key));
  const rest  = names.filter(n => !users.includes(n));
  if (!rest.length)                     return "Used by: all algorithms";
  if (rest.length <= 3 && users.length) return `Used by: all algorithms except ${rest.join(", ")}`;
  return `Used by: ${users.join(", ") || "none"}`;
}

/**
 * Full tooltip for a layout param: what it does, an optional extra line (e.g. the selected
 * option's explanation), unit / detail, and "Used by".
 * @param {string} key
 * @param {string} [extra]
 * @returns {string}
 */
function paramTooltip(key, extra) {
  const [what, detail] = PARAM_TOOLTIPS[key] || ["", ""];
  return [what, extra, detail, paramUsedBy(key)].filter(Boolean).join("\n");
}

const LAYOUT_GROUPS = Object.freeze({
  Nesting:     ["nestingRules"],
  Reverse:     ["reverseRules"],
  Containers:  ["containerAlgorithm", "connectionsMode", "padding",
                "sortContainers", "alignWidthSameType", "snapColumnsToGrid"],
  Flow:        ["direction", "acyclicer", "ranking", "nodePlacement", "layerSpacing"],
  Elements:    ["elementWidth", "elementHeight", "labelSizing", "labelMaxLineWidth", "elementSpacing"],
  Connections: ["routing", "labelPosition", "connectionLabelSpacing", "connectionSpacing", "connectionElementSpacing"],
  "View size": ["aspectRatio", "maxWidth"],
});

// View-size params — maxWidth + aspectRatio (ELK: met by calibrating elk.aspectRatio — elk.js _fitViewSize).
// Graphviz has aspectRatio only: it cannot narrow a layout without scaling elements.
const PARAMS_VIEW_SIZE = Object.freeze(["maxWidth", "aspectRatio"]);

// Graphviz cluster-nesting controls — Dot, Neato, FDP. padding = cluster margin (graphviz.js).
const PARAMS_GV_CLUSTER = Object.freeze(["nestingRules", "padding"]);

// Shared supportedOptions arrays — defined before ALGORITHMS so they can be referenced inline.
const DIRECTION_VALUES = Object.freeze(["Right", "Left", "Down", "Up"]);
const LP_ELK           = Object.freeze(["Source", "Middle", "Target"]);
const LP_GV            = Object.freeze(["Source", "Middle", "Target", "Natural"]);
const ROUTING_GV_POLY  = Object.freeze(["Polyline", "Straight", "Spline (approximated)"]);

// View-size paramConflicts — aspectRatio and maxWidth are mutually exclusive.
// Single constant covers all algorithms (maxHeight removed).
const CONFLICTS_VIEW = Object.freeze({ aspectRatio: ["maxWidth"], maxWidth: ["aspectRatio"] });

// ── Algorithms ────────────────────────────────────────────────────────────────
// supportsNesting: "full" | "partial" | "cluster" | "none"
// activeParams: GUI param keys active for this algorithm (others greyed out).
//   Spreads ALWAYS_ACTIVE_PARAMS and shared group constants; remaining entries are algorithm-specific.
// supportedOptions: allowed values per select-type param (undefined = free value)
// engineAlgorithmId: engine-internal identifier
// labelPositionDefault: default for the labelPosition param

/** @type {Readonly<Record<string, AlgorithmSpec>>} */
const ALGORITHMS = Object.freeze({
  Layered: {
    engine:               "ELK",
    engineAlgorithmId:    "layered",
    style:                "Flow",
    supportsNesting:      "full",
    supportsSelfLoops:    true,   // ELK layered routes self-loops (SelfLoopDistribution / SelfLoopOrdering)
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_SIZE,
      "direction", "nodePlacement", "routing", "labelPosition", "reverseRules", "connectionsMode",
      "layerSpacing", "elementSpacing", "connectionSpacing", "connectionElementSpacing",
      "connectionLabelSpacing",
    ],
    supportedOptions: {
      direction:          DIRECTION_VALUES,
      nodePlacement:      ["Straight", "Compact"],
      routing:            ["Orthogonal", "Polyline", "Splines"],
      labelPosition:      LP_ELK,
      containerAlgorithm: ["Layered", "Grid", "Pack"],
      connectionsMode:    ["Between containers", "Crossing containers"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Process models, application flows, service interactions with strong directionality and nested containers (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Tree: {
    engine:               "ELK",
    engineAlgorithmId:    "mrtree",
    style:                "Hierarchy",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // mrtree is acyclic-by-construction; self-loops not routed
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_SIZE,
      "direction", "labelPosition", "reverseRules",
      "elementSpacing", "connectionSpacing", "connectionElementSpacing",
    ],
    supportedOptions: {
      direction:          DIRECTION_VALUES,
      labelPosition:      LP_ELK,
      containerAlgorithm: ["Grid", "Pack"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Force: {
    engine:               "ELK",
    engineAlgorithmId:    "force",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    false,  // physics-based; self-loops collapse to a point
    activeParams:         [...ALWAYS_ACTIVE_PARAMS, "elementSpacing", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Application landscapes and integration networks emphasising emergent connectivity without nesting (ELK)",
    paramConflicts: CONFLICTS_VIEW,  // view-size mode "none" zeroes aspectRatio
  },

  Stress: {
    engine:               "ELK",
    engineAlgorithmId:    "stress",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    false,  // stress model has no notion of self-loop distance
    activeParams:         [...ALWAYS_ACTIVE_PARAMS, "elementSpacing", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Dependency maps and impact analysis emphasising relational distance (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Radial: {
    engine:               "ELK",
    engineAlgorithmId:    "radial",
    style:                "Circular",
    supportsNesting:      "none",   // ELK Radial crashes on compound graphs
    supportsSelfLoops:    false,    // tree-like layout; self-loops not routed
    activeParams:         [...ALWAYS_ACTIVE_PARAMS, "layerSpacing", "elementSpacing", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Domain overviews and hub-and-spoke structures (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Grid: {
    engine:               "ELK",
    engineAlgorithmId:    "box",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // box/rectpacking position nodes only — they do not route edges
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_SIZE,
      "snapColumnsToGrid", "labelSizing", "labelMaxLineWidth",
      "elementSpacing", "reverseRules",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "Portfolio overviews, catalogs and inventories with strong nesting support (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Pack: {
    engine:               "ELK",
    engineAlgorithmId:    "rectpacking",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // pack only positions nodes; no edge routing
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_SIZE,
      "snapColumnsToGrid", "labelSizing", "labelMaxLineWidth",
      "elementSpacing", "reverseRules",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "High-level landscape summaries and grouped overviews with strong nesting support (ELK)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Dagre: {
    engine:               "Dagre",
    engineAlgorithmId:    "dagre",
    style:                "Flow",
    supportsNesting:      "partial",
    supportsSelfLoops:    "partial",  // dagre-cluster-fix attempts routing; falls back to writer synthesis on error
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS,
      "direction", "ranking", "acyclicer", "labelPosition", "reverseRules",
      "nestingRules", "sortContainers",
      "layerSpacing", "elementSpacing", "connectionSpacing",
    ],
    supportedOptions: {
      direction:     DIRECTION_VALUES,
      ranking:       ["Balanced", "Uniform", "Top-aligned"],
      acyclicer:     ["Default", "Greedy"],
      labelPosition: LP_ELK,
    },
    labelPositionDefault: "Middle",
    tooltip: "Fast process and application flows with limited nesting support (Dagre)",
  },

  Dot: {
    engine:               "Graphviz",
    engineAlgorithmId:    "dot",
    style:                "Flow",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz routes self-loops natively across all algorithms
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio", ...PARAMS_GV_CLUSTER,
      "direction", "routing", "labelPosition",
      "layerSpacing", "elementSpacing", "reverseRules",
      // connectionSpacing / connectionElementSpacing: dot has no equivalent (sep/esep are not used by dot)
    ],
    supportedOptions: {
      direction:     DIRECTION_VALUES,
      routing:       ["Orthogonal", "Polyline", "Straight", "Spline (approximated)"],
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Hierarchical layered layout with direction control and strong cluster nesting. Supports orthogonal, polyline and spline routing (Graphviz dot)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Neato: {
    engine:               "Graphviz",
    engineAlgorithmId:    "neato",
    style:                "Network",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio", ...PARAMS_GV_CLUSTER,
      "routing", "labelPosition",
      "elementSpacing", "connectionElementSpacing", "reverseRules",
    ],
    supportedOptions: {
      routing:       ROUTING_GV_POLY,
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Spring-model layout for undirected networks, with cluster nesting. No direction control (Graphviz neato)",
    paramConflicts: CONFLICTS_VIEW,
  },

  FDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "fdp",
    style:                "Network",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio", ...PARAMS_GV_CLUSTER,
      "routing", "labelPosition",
      "elementSpacing", "connectionElementSpacing", "reverseRules",
    ],
    supportedOptions: {
      routing:       ROUTING_GV_POLY,
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Force-directed layout with better cluster support than Neato. Unique compound edge routing around clusters (Graphviz fdp)",
    paramConflicts: CONFLICTS_VIEW,
  },

  SFDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "sfdp",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio",
      "routing", "labelPosition",
      "elementSpacing", "connectionElementSpacing",
    ],
    supportedOptions: {
      routing:       ROUTING_GV_POLY,
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Scalable force-directed layout for large undirected graphs (100+ nodes). No nesting (Graphviz sfdp)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Twopi: {
    engine:               "Graphviz",
    engineAlgorithmId:    "twopi",
    style:                "Hierarchy",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio",
      "labelPosition", "layerSpacing",
    ],
    supportedOptions: {
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Radial layout radiating outward from a central root node. No direction control or nesting (Graphviz twopi)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Circo: {
    engine:               "Graphviz",
    engineAlgorithmId:    "circo",
    style:                "Circular",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio",
      "labelPosition", "elementSpacing",
    ],
    supportedOptions: {
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Circular layout: places connected groups of elements on circles. Best for rings and cyclic dependencies (Graphviz circo)",
    paramConflicts: CONFLICTS_VIEW,
  },
});

// Derived: algorithm name → engine name
const ALGO_ENGINE = Object.freeze(
  Object.fromEntries(Object.entries(ALGORITHMS).map(([k, v]) => [k, v.engine]))
);

// ── Actions ───────────────────────────────────────────────────────────────────

const ACTION = Object.freeze({
  NEW_VIEW:      { id: "new_view",      label: "New view",      default: true,
    tooltip: "Creates a view from the selection, the Selection tab steps and their relations." },
  ONE_EACH:      { id: "one_each",      label: "One view each",
    tooltip: "Creates one view per selected element, named after the element." },
  EXPAND_VIEW:   { id: "expand_view",   label: "Expand view",
    tooltip: "Adds elements related to the elements selected on the view (steps on the Selection tab),\nwith the relations the steps follow, and lays out the whole view.\nNeeds elements selected on the view, not the view in the model tree." },
  LAYOUT_ONLY:   { id: "layout_only",   label: "Layout only",
    tooltip: "Lays out all elements on the view again.\nNothing is added or removed." },
});

// ── Routing ───────────────────────────────────────────────────────────────────

const ROUTING = Object.freeze({
  ORTHOGONAL:    { id: "Orthogonal",           label: "Orthogonal",
    tooltip: "Draws relation lines with right-angle bends. Best results with Layered layout." },
  POLYLINE:      { id: "Polyline",             label: "Polyline",
    tooltip: "Draws relation lines with diagonal bends." },
  STRAIGHT:      { id: "Straight",             label: "Straight",
    tooltip: "Draws relation lines as direct straight lines." },
  SPLINE:        { id: "Spline (approximated)", label: "Spline (approximated)",
    tooltip: "Graphviz curves, approximated with bendpoints. Graphviz only." },
  SPLINES:       { id: "Splines",              label: "Splines",
    tooltip: "Draws relation lines as smooth curves. Layered only." },
});

// ── Directions ────────────────────────────────────────────────────────────────

const DIRECTIONS = Object.freeze([
  { val: "Right", default: true },
  { val: "Left" },
  { val: "Down" },
  { val: "Up" },
]);

// ── Ranking (Dagre only) ──────────────────────────────────────────────────────
// Dialog display values and defaults only.
// Engine-specific ranker identifiers live in engines/dagre.js.

const RANKING = Object.freeze([
  { val: "Balanced",    default: true },
  { val: "Uniform" },
  { val: "Top-aligned" },
]);

// ── Element placement within a layer (Layered only) ───────────────────────────
// Engine-specific strategy identifiers live in engines/elk.js.

const NODE_PLACEMENT = Object.freeze([
  { val: "Straight", default: true,
    tooltip: "Aligns elements so connections run as straight as possible (fewest bends)." },
  { val: "Compact",
    tooltip: "Shortest total connection length; usually a smaller view, with a few more bends." },
]);

// ── Acyclicer options (Dagre only) ────────────────────────────────────────────

const ACYCLICER = Object.freeze([
  { val: "Default", default: true },
  { val: "Greedy" },
]);

// ── Direction map (shared by Graphviz and Dagre engines) ──────────────────────

const DIRECTION_MAP = Object.freeze({
  "Right": "LR",
  "Left":  "RL",
  "Down":  "TB",
  "Up":    "BT",
});

// ── Label positions ───────────────────────────────────────────────────────────

const LABEL_POSITIONS = Object.freeze([
  { val: "Source",  tooltip: "Near the source element." },
  { val: "Middle",  tooltip: "At the midpoint of the connection." },
  { val: "Target",  tooltip: "Near the target element." },
  { val: "Natural", tooltip: "Graphviz-computed position avoiding overlap. Only available with Graphviz algorithms." },
]);

// ── Aspect ratio options ──────────────────────────────────────────────────────

// No "free" entry: View size › Free is the no-ratio choice. AR_DEFAULT is shown when a preset
// has no ratio yet (aspectRatio 0).
const AR_DEFAULT = 1.78;
const AR_OPTIONS = Object.freeze([
  { val: 3.00, label: "3:1  landscape"  },
  { val: 2.00, label: "2:1  wide"       },
  { val: 1.78, label: "16:9 widescreen" },
  { val: 1.33, label: "4:3  classic"    },
  { val: 1.25, label: "5:4"             },
  { val: 1.00, label: "1:1  square"     },
  { val: 0.75, label: "3:4  portrait"   },
  { val: 0.56, label: "9:16 portrait"   },
]);

// ── Relation types ────────────────────────────────────────────────────────────

/** @type {Readonly<Record<string, { id: ArchimateRelationType, label: string, weight: number }>>} */
const RELATION_TYPES = Object.freeze({
  COMPOSITION:    { id: "composition-relationship",    label: "Composition",    weight: 3.0 },
  AGGREGATION:    { id: "aggregation-relationship",    label: "Aggregation",    weight: 2.5 },
  REALIZATION:    { id: "realization-relationship",    label: "Realization",    weight: 2.0 },
  SPECIALIZATION: { id: "specialization-relationship", label: "Specialization", weight: 2.0 },
  ASSIGNMENT:     { id: "assignment-relationship",     label: "Assignment",     weight: 1.5 },
  SERVING:        { id: "serving-relationship",        label: "Serving",        weight: 1.5 },
  TRIGGERING:     { id: "triggering-relationship",     label: "Triggering",     weight: 1.5 },
  FLOW:           { id: "flow-relationship",           label: "Flow",           weight: 1.2 },
  ACCESS:         { id: "access-relationship",         label: "Access",         weight: 1.0 },
  ASSOCIATION:    { id: "association-relationship",    label: "Association",    weight: 1.0 },
  INFLUENCE:      { id: "influence-relationship",      label: "Influence",      weight: 0.5 },
});

// Derived
const RELATION_TYPE_IDS    = Object.freeze(Object.values(RELATION_TYPES).map(v => v.id));
const RELATION_TYPE_LABELS = Object.freeze(Object.values(RELATION_TYPES).map(v => v.label));
const RELATION_WEIGHT_MAP  = Object.freeze(Object.fromEntries(Object.values(RELATION_TYPES).map(v => [v.id, v.weight])));

// ── Element types ─────────────────────────────────────────────────────────────

/** @type {readonly ArchimateElementType[]} */
const ELEMENT_TYPES = Object.freeze([
  "application-collaboration", "application-component", "application-event",
  "application-function", "application-interaction", "application-interface",
  "application-process", "application-service", "artifact", "assessment",
  "business-actor", "business-collaboration", "business-event",
  "business-function", "business-interaction", "business-interface",
  "business-object", "business-process", "business-role", "business-service",
  "capability", "communication-network", "constraint", "contract",
  "course-of-action", "data-object", "deliverable", "device",
  "distribution-network", "driver", "equipment", "facility", "gap", "goal",
  "grouping", "implementation-event", "junction", "location", "material",
  "meaning", "node", "outcome", "path", "plateau", "principle", "product",
  "representation", "requirement", "resource", "stakeholder", "system-software",
  "technology-collaboration", "technology-event", "technology-function",
  "technology-interaction", "technology-interface", "technology-process",
  "technology-service", "value", "value-stream", "work-package",
]);

// "business-actor" → "Business Actor"
const ELEMENT_TYPE_LABELS = Object.freeze(
  ELEMENT_TYPES.map(t => t.split("-").map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(" "))
);

// Set-like frozen object: keys are the jArchi .type strings for visual diagram objects
// placed on a view canvas. Source list lives in _lib/selection.js (SSOT).
// Use `type in DIAGRAM_TYPES` to test membership and `Object.keys(DIAGRAM_TYPES)` to iterate.
//
// "archimate-diagram-model" is included as an alias because jArchi 1.12's
// find("diagram-model-reference") locates view-reference DiagramObjects but the returned
// object's .type still reports "archimate-diagram-model" (the ArchimateView node type).
// Keeping it in the set ensures view-reference VOs classify as DiagramObjects everywhere.
const DIAGRAM_TYPES = Object.freeze(
  Object.fromEntries(DIAGRAM_OBJECT_TYPES.map(t => [t, true]))
);

// Display labels for diagram object types. Excludes "archimate-diagram-model" (internal alias);
// strips the "diagram-model-" prefix.
const DIAGRAM_TYPE_LABELS = Object.freeze(
  Object.keys(DIAGRAM_TYPES)
    .filter(k => k !== "archimate-diagram-model")
    .map(k => k.replace("diagram-model-", ""))
);

// Bidirectional maps between jArchi type IDs and display labels (excludes internal alias).
const DIAGRAM_TYPE_ID_TO_LABEL = Object.freeze(
  Object.fromEntries(
    Object.keys(DIAGRAM_TYPES)
      .filter(k => k !== "archimate-diagram-model")
      .map(k => [k, k.replace("diagram-model-", "")])
  )
);
const DIAGRAM_TYPE_LABEL_TO_ID = Object.freeze(
  Object.fromEntries(Object.entries(DIAGRAM_TYPE_ID_TO_LABEL).map(([k, v]) => [v, k]))
);

// ── Constants ─────────────────────────────────────────────────────────────────

const GENERATED_VIEW_FOLDER = "/_Generated";  // under /Views, like preset view.folder
const SESSION_FILENAME     = "_session.json";
// Spline sampling: number of points per cubic Bézier segment
const SPLINE_SAMPLE_POINTS = 8;
// Extra top padding inside container nodes so the container label is not covered by children.
const CONTAINER_LABEL_CLEARANCE = 30;

// ColorBrewer scheme names supported by Chroma.js.
// Qualitative schemes (discrete, pastel) come first; sequential/diverging follow.
// appearance.js uses these for colour interpolation; the UI uses them for combo box population.
const COLOR_RANGES = Object.freeze([
  // Qualitative — distinct pastel tones, no gradient:
  "Pastel1", "Pastel2", "Set2", "Set3",
  // Sequential — light end kept, dark end trimmed in _colorScale:
  "Blues", "Greens", "Oranges", "Purples", "Reds", "Greys",
  // Diverging — light centre; both dark ends trimmed:
  "RdYlBu", "RdYlGn", "Spectral", "OrRd", "PuBu",
]);
// ── Preset schema defaults ────────────────────────────────────────────────────

const DEFAULT_PRESET = Object.freeze({
  schemaVersion: 3,   // 2 = rule lists (rel_filter.js); 3 = everyContainer per nesting rule; older presets are migrated offline
  name:      "",
  algorithm: "Layered",
  params: {
    direction:             "Right",
    nodePlacement:         "Straight",              // "Straight" | "Compact" (Layered only)
    routing:               "Orthogonal",
    labelPosition:         "Middle",
    ranking:               "Balanced",
    acyclicer:             "Default",
    reverseRules:          [                       // rule list (rel_filter "relation"): flipped relations; [] = none
      { relation: "realization-relationship" },
      { relation: "serving-relationship" },
      { relation: "specialization-relationship" },
    ],
    nestingRules:          [],                     // rule list (rel_filter "relation"): relations drawn as nesting; [] = none
    padding:               20,
    diagramPadding:        10,
    sortContainers:        false,
    alignWidthSameType:    false,
    snapColumnsToGrid:     false,
    containerAlgorithm:    "Layered",              // "Layered" | "Grid" | "Pack"
    connectionsMode:       "Between containers",   // "Crossing containers" | "Between containers"
    layerSpacing:          60,
    elementSpacing:        40,
    connectionSpacing:        25,              // also the port spacing on elements (ELK: portPort)
    connectionElementSpacing: 40,
    elementWidth:          200,
    elementHeight:         60,
    maxWidth:              0,
    aspectRatio:           1.78,
    viewSizeMode:          "none",  // "none" | "maxWidth" | "aspectRatio"
    labelSizing:           false,   // derive node width/height from label text (Pack & Grid only)
    labelMaxLineWidth:     400,    // max label pixel width before wrapping to two lines (Pack & Grid only)
    connectionLabelSpacing:      true,   // reserve space for connection labels in ELK Layered (prevents overlap)
  },
  // Filter lists (empty = keep everything); rule shapes in rel_filter.js.
  filter: {
    elementRules:  [],   // kind "element"
    diagramRules:  [],   // kind "diagram"
    relationRules: [],   // kind "relation"
  },
  relatedElements: {
    steps: [{ repeat: 1, rules: [] }],  // each: { repeat, rules: [kind "step"] }
  },
  view: {
    name:   "",
    folder: "",   // path under /Views, e.g. "/_Generated/Test"; "" = GENERATED_VIEW_FOLDER
    suffix: "",   // One view each: appended to each element name, e.g. " (GGM)"
  },
  appearance: {
    // Style rules (kind "style"); a later rule wins where two rules style the same object.
    styleByProperty: {
      rules:            [],
      mixedValuesColor: "#FF6B35",   // element / relation that gets more than one value
      lineWidth:        0,           // 0 = no change; 1..3 for relations styled by a Color = Relation rule
    },
    nestingLevel: {
      fontEnabled:        false,
      rootFontSize:       14,
      rootFontBold:       false,
      fontDecreasePerLevel: 2,
      colorEnabled:       false,
      rootColor:          "#2B5796",
      lightenPerLevel:     15,
    },
    highlightRepeated: { enabled: false, colorRange: "Pastel1" },
  },
  engineParams: {},  // overrides only — defaults live in each adapter (elk.js, dagre.js, graphviz.js) and engine-utils.js
  viewProperties: {
    addObjectId: false,
    properties:  [],  // [{ key, value, enabled }] — enabled rows are written to the view on generation
  },
});

// ── Label-based node sizing defaults ─────────────────────────────────────────
// Fallback tuning values for sizeLabelBasedNodes (engine-utils.js).
// labelMaxLineWidth is also a GUI-exposed params key (DEFAULT_PRESET.params) and
// takes priority when set; the remaining keys are engineParams.layout-only.
const LABEL_SIZING_DEFAULTS = Object.freeze({
  labelCharWidth:    8,
  labelLineHeight:  24,
  labelHPadding:    16,
  labelVPadding:     8,
  labelMaxLineWidth: 400,
  labelMinWidth:    60,
  labelMinHeight:   30,
});

// ── Step repeat ───────────────────────────────────────────────────────────────
// A step's `repeat` is 1–5 (run the step that many times, each run starting from the
// previous run's additions) or REPEAT_UNTIL_NOTHING_NEW (run until a run adds nothing,
// capped at REPEAT_MAX so a broad filter cannot walk the whole model).
const REPEAT_UNTIL_NOTHING_NEW = "untilNothingNew";
const REPEAT_MAX               = 10;
/** @type {readonly { value: StepRepeat, label: string }[]} */
const REPEAT_OPTIONS = Object.freeze([
  { value: 1, label: "1×" },
  { value: 2, label: "2×" },
  { value: 3, label: "3×" },
  { value: 4, label: "4×" },
  { value: 5, label: "5×" },
  { value: REPEAT_UNTIL_NOTHING_NEW, label: "until nothing new" },
]);

/**
 * Normalise a preset/GUI repeat value to a REPEAT_OPTIONS value; anything unknown → 1.
 * @param {unknown} v
 * @returns {StepRepeat}
 */
function normalizeRepeat(v) {
  const opt = REPEAT_OPTIONS.find(o => o.value === v || String(o.value) === String(v));
  return opt ? opt.value : 1;
}

/**
 * Number of runs a repeat value allows (REPEAT_MAX for until-nothing-new).
 * @param {unknown} v
 * @returns {number}
 */
function repeatMaxRuns(v) {
  const r = normalizeRepeat(v);
  return r === REPEAT_UNTIL_NOTHING_NEW ? REPEAT_MAX : r;
}

// ── Preset validation ─────────────────────────────────────────────────────────

/**
 * Valid ids for rule normalisation (rel_filter.normalizeRules).
 * @returns {ValidTypeSets}
 */
function _ruleValidity() {
  return {
    elements:    new Set(ELEMENT_TYPES),
    relations:   new Set(RELATION_TYPE_IDS),
    diagrams:    new Set(Object.keys(DIAGRAM_TYPES)),
    colorRanges: new Set(COLOR_RANGES),
  };
}

/**
 * Keys of the pre-rule-list preset format found in `raw`. Presets are migrated offline
 * (tools/migrate_presets_relrows.js); loading one unmigrated would silently drop its filters.
 * @param {PresetFile} raw
 * @returns {string[]}
 */
function _legacyKeys(raw) {
  const found = [];
  const has = (/** @type {unknown} */ o, /** @type {string} */ k) => o && typeof o === "object" && k in o;
  for (const k of ["nestingRelationTypes", "reverseRelationTypes", "nestingContainerTypes"])
    if (has(raw.params, k)) found.push(`params.${k}`);
  for (const k of ["elementTypes", "relationTypes", "diagramTypes"])
    if (has(raw.filter, k)) found.push(`filter.${k}`);
  const steps = raw.relatedElements && raw.relatedElements.steps;
  if (Array.isArray(steps) && steps.some(st => st && (has(st, "elementTypes") || has(st, "relationTypes") || has(st, "propFilter"))))
    found.push("relatedElements.steps[].elementTypes/relationTypes/propFilter");
  for (const k of ["styleByRelatedProperty", "styleByConnectedElement"])
    if (has(raw.appearance, k)) found.push(`appearance.${k}`);
  if (raw.appearance && raw.appearance.styleByProperty &&
      ("element" in raw.appearance.styleByProperty || "relation" in raw.appearance.styleByProperty))
    found.push("appearance.styleByProperty.element/relation");
  return found;
}

/**
 * Validate and normalise a preset object.
 * - Fills missing params from DEFAULT_PRESET
 * - Validates algorithm exists
 * - Validates option values against supportedOptions
 * - Replaces unsupported option values (labelPosition: algorithm default; others: first option)
 * Throws a descriptive string if validation fails.
 * @param {PresetFile} raw  raw preset object (from JSON)
 * @returns {Preset}        normalised preset
 */
function validatePreset(raw) {
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== DEFAULT_PRESET.schemaVersion)
    throw `Preset schemaVersion ${raw.schemaVersion} is not supported (expected ${DEFAULT_PRESET.schemaVersion}).`;
  const legacy = _legacyKeys(raw);
  if (legacy.length)
    throw `Preset uses the old filter format (${legacy.join(", ")}). Run: node Scripts/View/tools/migrate_presets_relrows.js`;

  /** @type {Preset} */
  const preset = JSON.parse(JSON.stringify(DEFAULT_PRESET));  // deep clone defaults

  // top-level
  if (raw.name    !== undefined) preset.name    = String(raw.name);
  if (raw.algorithm !== undefined) preset.algorithm = raw.algorithm;

  const alg = ALGORITHMS[preset.algorithm];
  if (!alg) throw `Unknown algorithm: "${preset.algorithm}". Valid algorithms: ${Object.keys(ALGORITHMS).join(", ")}`;

  const valid = _ruleValidity();
  /** @type {<K extends RuleKind>(kind: K, list: unknown, where: string) => RuleByKind[K][]} */
  const rules = (kind, list, where) => RuleLists.normalizeRules(kind, list, valid, where);

  // params — merge raw.params over defaults, validate options
  if (raw.params && typeof raw.params === "object") {
    for (const [key, rawVal] of Object.entries(raw.params)) {
      if (!(key in DEFAULT_PRESET.params)) continue;  // unknown key ignored
      if (key === "nestingRules" || key === "reverseRules") {
        preset.params[key] = rules("relation", rawVal, `params.${key}`);
        continue;
      }
      // Migrate old direction labels (e.g. "Left → Right" → "Left") so old presets remain valid.
      /** @type {Record<string, string>} */
      const _DIR_MIGRATE = { "Left → Right": "Right", "Right → Left": "Left", "Top → Bottom": "Down", "Bottom → Top": "Up" };
      const val = (key === "direction" && _DIR_MIGRATE[rawVal]) ? _DIR_MIGRATE[rawVal] : rawVal;
      const opts = alg.supportedOptions[key];
      if (opts && !opts.includes(val)) {
        console.log(`Warning: param "${key}" value "${val}" not supported by ${preset.algorithm}. Using default.`);
        continue;
      }
      /** @type {Record<string, unknown>} */ (preset.params)[key] = val;   // Cast: key is a DEFAULT_PRESET.params key
    }
  }

  // Every select-type param must hold a supported value — also when the value is the
  // DEFAULT_PRESET default (e.g. containerAlgorithm "Layered" is not an option for Tree).
  // labelPosition falls back to the algorithm's own default, the others to their first option.
  for (const [key, opts] of Object.entries(alg.supportedOptions)) {
    // Casts: dynamic key into preset.params.
    if (opts.includes(/** @type {string} */ (/** @type {Record<string, unknown>} */ (preset.params)[key]))) continue;
    /** @type {Record<string, unknown>} */ (preset.params)[key] = (key === "labelPosition" && alg.labelPositionDefault) ? alg.labelPositionDefault : opts[0];
  }

  // filter
  if (raw.filter && typeof raw.filter === "object") {
    preset.filter.elementRules  = rules("element",  raw.filter.elementRules,  "filter.elementRules");
    preset.filter.diagramRules  = rules("diagram",  raw.filter.diagramRules,  "filter.diagramRules");
    preset.filter.relationRules = rules("relation", raw.filter.relationRules, "filter.relationRules");
  }

  // relatedElements — reads `steps` only. No fallback to legacy `layers` (rule #12).
  if (raw.relatedElements && Array.isArray(raw.relatedElements.steps)) {
    preset.relatedElements.steps = raw.relatedElements.steps.map((/** @type {PresetFile} */ step, /** @type {number} */ i) => ({
      repeat: normalizeRepeat(step.repeat),
      rules:  rules("step", step.rules, `relatedElements.steps[${i}].rules`),
    }));
  }

  // view
  if (raw.view && typeof raw.view === "object") {
    if (raw.view.name   !== undefined) preset.view.name   = String(raw.view.name);
    if (raw.view.folder !== undefined) preset.view.folder = String(raw.view.folder);
    if (raw.view.suffix !== undefined) preset.view.suffix = String(raw.view.suffix);
  }

  // appearance
  if (raw.appearance && typeof raw.appearance === "object") {
    const ra = raw.appearance;
    const pa = preset.appearance;

    if (ra.styleByProperty && typeof ra.styleByProperty === "object") {
      const rs = ra.styleByProperty;
      pa.styleByProperty.rules = rules("style", rs.rules, "appearance.styleByProperty.rules");
      if (typeof rs.mixedValuesColor === "string") pa.styleByProperty.mixedValuesColor = rs.mixedValuesColor;
      if (typeof rs.lineWidth === "number")        pa.styleByProperty.lineWidth = Math.max(0, Math.min(3, Math.round(rs.lineWidth)));
    }

    if (ra.nestingLevel && typeof ra.nestingLevel === "object") {
      const rn = ra.nestingLevel;
      if (typeof rn.fontEnabled          === "boolean") pa.nestingLevel.fontEnabled          = rn.fontEnabled;
      if (typeof rn.rootFontSize         === "number")  pa.nestingLevel.rootFontSize         = rn.rootFontSize;
      if (typeof rn.rootFontBold         === "boolean") pa.nestingLevel.rootFontBold         = rn.rootFontBold;
      if (typeof rn.fontDecreasePerLevel === "number")  pa.nestingLevel.fontDecreasePerLevel = rn.fontDecreasePerLevel;
      if (typeof rn.colorEnabled         === "boolean") pa.nestingLevel.colorEnabled         = rn.colorEnabled;
      if (typeof rn.rootColor            === "string")  pa.nestingLevel.rootColor            = rn.rootColor;
      if (typeof rn.lightenPerLevel === "number") pa.nestingLevel.lightenPerLevel = rn.lightenPerLevel;
      else if (typeof rn.darkenPerLevel === "number") pa.nestingLevel.lightenPerLevel = rn.darkenPerLevel; // migration
    }

    if (ra.highlightRepeated && typeof ra.highlightRepeated === "object") {
      const rh = ra.highlightRepeated;
      if (typeof rh.enabled    === "boolean") pa.highlightRepeated.enabled    = rh.enabled;
      if (typeof rh.colorRange === "string")  pa.highlightRepeated.colorRange = rh.colorRange;
    }
  }

  // engineParams: pass overrides through as-is; adapters/utils merge with their own defaults.
  if (raw.engineParams && typeof raw.engineParams === "object")
    preset.engineParams = raw.engineParams;

  // viewProperties
  if (raw.viewProperties && typeof raw.viewProperties === "object") {
    const rv = raw.viewProperties;
    if (typeof rv.addObjectId === "boolean") preset.viewProperties.addObjectId = rv.addObjectId;
    if (Array.isArray(rv.properties)) {
      preset.viewProperties.properties = rv.properties
        .filter((/** @type {PresetFile} */ p) => p && typeof p.key === "string" && p.key !== PROP_ID && p.key !== PROP_MANAGED_OCCURRENCE)
        .map((/** @type {PresetFile} */ p) => ({
          key:     String(p.key),
          value:   p.value !== undefined ? String(p.value) : "",
          enabled: typeof p.enabled === "boolean" ? p.enabled : false,
        }));
    }
  }

  return preset;
}

/**
 * Why "Crossing containers" cannot be used with these params, or null when it can.
 * Crossing containers lays the whole hierarchy out as one layered graph (ELK INCLUDE_CHILDREN):
 *   - Grid / Pack inside containers: ELK rejects connections into those containers
 *     (UnsupportedGraphException), and the root stacks unconnected containers in one column;
 *   - view size: a hierarchical layout does not pack unconnected elements into rows, so they
 *     stack in one column and aspect ratio / max width have no effect.
 * "Between containers" is then used and the choice is locked in the dialog.
 * @param {string} algorithm  root algorithm name
 * @param {Partial<PresetParams> | null | undefined} params  raw preset params (with viewSizeMode)
 * @returns {string|null}     reason, for log and tooltip
 */
function connectionsModeLock(algorithm, params) {
  /** @type {Partial<PresetParams>} */
  const p = params || {};
  if (p.containerAlgorithm && p.containerAlgorithm !== algorithm) return `container layout ${p.containerAlgorithm}`;
  // Casts: an absent value compares as undefined > 0, i.e. false, which is intended.
  if (p.viewSizeMode === "aspectRatio" && /** @type {number} */ (p.aspectRatio) > 0) return "view size aspect ratio";
  if (p.viewSizeMode === "maxWidth"    && /** @type {number} */ (p.maxWidth)    > 0) return "view size max width";
  return null;
}

/**
 * Return the subset of `preset.params` that the chosen algorithm declares as
 * active. Inactive keys are omitted (not zeroed) so consumers that read with
 * `|| default` degrade cleanly. The raw `preset.params` is never mutated —
 * it stays intact for UI restoration on algorithm switch (SPEC §11, capability masking).
 *
 * @param {Preset} preset  validated preset
 * @returns {EffectiveParams} masked params subset
 */
function effectiveParams(preset) {
  const alg = ALGORITHMS[preset.algorithm];
  if (!alg) return {};
  const active       = new Set(alg.activeParams || []);
  const viewSizeMode = (preset.params && preset.params.viewSizeMode) || "none";
  const conflictKeys = new Set(Object.keys(alg.paramConflicts || {}));
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(preset.params || {})) {
    if (key === "viewSizeMode") continue;
    if (!active.has(key))       continue;
    out[key] = (conflictKeys.has(key) && key !== viewSizeMode) ? 0 : /** @type {Record<string, unknown>} */ (preset.params)[key];
  }
  if (out.connectionsMode === "Crossing containers" && connectionsModeLock(preset.algorithm, preset.params))
    out.connectionsMode = "Between containers";
  return /** @type {EffectiveParams} */ (out);   // Cast: a subset of preset.params, as built above
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STYLES, ALGORITHMS, ALGO_ENGINE, HIDDEN_PARAMS, PARAM_LABELS, PARAM_TOOLTIPS, LAYOUT_GROUPS,
    paramUsedBy, paramTooltip,
    ACTION, ROUTING,
    DIRECTIONS, DIRECTION_MAP,
    RANKING, NODE_PLACEMENT, ACYCLICER, LABEL_POSITIONS, AR_OPTIONS, AR_DEFAULT,
    RELATION_TYPES, RELATION_TYPE_IDS, RELATION_TYPE_LABELS, RELATION_WEIGHT_MAP,
    ELEMENT_TYPES, ELEMENT_TYPE_LABELS,
    DIAGRAM_TYPES, DIAGRAM_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, DIAGRAM_TYPE_LABEL_TO_ID,
    PROP_ID, PROP_MANAGED_OCCURRENCE,
    GENERATED_VIEW_FOLDER, SESSION_FILENAME, COLOR_RANGES,
    SPLINE_SAMPLE_POINTS,
    CONTAINER_LABEL_CLEARANCE,
    DEFAULT_PRESET,
    LABEL_SIZING_DEFAULTS,
    CONNECTION_END_CLEARANCE,
    validatePreset, effectiveParams, connectionsModeLock,
    REPEAT_UNTIL_NOTHING_NEW, REPEAT_MAX, REPEAT_OPTIONS, normalizeRepeat, repeatMaxRuns,
  };
}
