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
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");

// ── Constants ─────────────────────────────────────────────────────────────────

const PROP_ID = "Object ID";
// View property recording one managed occurrence: "<element id> in <container id> [in …]".
const PROP_MANAGED_OCCURRENCE = "Managed occurrence";

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = Object.freeze({
  Flow:      { algorithms: ["Layered", "Dagre", "Dot"],                      tooltip: "Optimized for directional flows, dependencies and process chains.\nInsights: sequences, process models, application flows, service interactions, data models." },
  Hierarchy: { algorithms: ["Tree", "Radial"],                               tooltip: "Optimized for decomposition, containment and nesting structures.\nInsights: ownership, organisation charts, product breakdowns, capability decomposition." },
  Network:   { algorithms: ["Stress", "Neato", "FDP", "SFDP"],               tooltip: "Optimized for interconnected elements without strict hierarchy or direction.\nInsights: connectivity, clustering, impact propagation, integration networks." },
  Circular:  { algorithms: ["Twopi", "Circo"],                               tooltip: "Optimized for cyclic, hub-centred and concentric relationships.\nInsights: central elements, cycles, radial influence, hub-and-spoke structures." },
  Compact:   { algorithms: ["Grid", "Pack", "Tiles"],                        tooltip: "Optimized for overview and space efficiency: tightly arranged containers,\nlittle emphasis on relations. Insights: portfolios, catalogs, inventories." },
});

// ── Algorithm param groups ────────────────────────────────────────────────────
// Shared groups spread into activeParams arrays; each algorithm shows only its unique additions.

// Active in every algorithm — not algorithm-specific.
const ALWAYS_ACTIVE_PARAMS = Object.freeze(["elementWidth", "elementHeight", "diagramPadding", "algorithmStart", "cycleAlgorithmStart"]);

// ELK full-nesting controls — Layered, Tree, Grid, Pack. Sort is not among them: directed views are not sorted.
const PARAMS_ELK_NESTING = Object.freeze([
  "nestingConditions", "padding",
  "alignWidthSameType",
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

// Length (px) of an ArchiMate end symbol (arrowhead, dot, diamond). The writer keeps bendpoints of
// non-orthogonal lines this far from their elements, and closer bendpoints at least
// BENDPOINT_MIN_GAP apart: Archi takes the direction of an end symbol from the last few pixels of
// the line, and zoomed out those round to another angle.
const CONNECTION_END_ROOM = 12;
const BENDPOINT_MIN_GAP   = 5;
// Shortest connection (px) with room for both end symbols, so the relation type stays readable.
// Floor for Element distance where connections run straight between elements
// (connectionsBetweenElements).
const MIN_CONNECTION_LENGTH = 20;

// Dialog label per layout param, and the Layout-tab group it is in. Used for the dialog's
// tooltips and the generated tables in docs/reference/.
const PARAM_LABELS = Object.freeze({
  nestingConditions:        "Nesting",
  reverseConditions:        "Reverse",
  containerAlgorithm:       "Layout inside",
  connectionsMode:          "Connections",
  padding:                  "Padding",
  sort:                     "Sort",
  algorithmStart:           "Algorithm start",
  cycleAlgorithmStart:      "Cycle algorithm start",
  alignWidthSameType:       "Same width per level",
  columnsAcrossContainers:  "Columns across containers",
  direction:                "Direction",
  acyclicer:                "Cycles",
  ranking:                  "Ranking",
  nodePlacement:            "Placement",
  circles:                  "Circles",
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
// Tooltip per layout param: [what it does, unit / detail], two short lines. Which algorithms use a
// param is not in it: the dialog greys the control (Scripts/View/AGENTS.md § Conventions, Tooltips).
/** @type {Readonly<Record<string, string[]>>} */
const PARAM_TOOLTIPS = Object.freeze({
  nestingConditions:        ["Draw matching relations as nesting: the child inside its parent (source; with Reverse, target).",
                             "Include picks relations, Exclude takes some out of those; Every shows a child in all its parents."],
  reverseConditions:        ["Flip matching relations: laid out from target to source; the arrows are unchanged.",
                             "A reversed nesting relation makes the target the parent. Include picks, Exclude takes out."],
  containerAlgorithm:       ["Algorithm that arranges the elements inside each container.",
                             ""],
  connectionsMode:          ["Between containers: each container is laid out on its own; connections enter at its border.",
                             "Crossing containers: the whole view is one layout; connections run straight to the element inside."],
  padding:                  ["Space between a container's border and its contents.", "px"],
  algorithmStart:           ["Order in which the elements enter the layout: another order, another starting point.", ""],
  cycleAlgorithmStart:      ["Each layout of an existing view takes the next algorithm start.",
                             "A new view always starts with Selection."],
  sort:                     ["Ascending order of the boxes in a view with containers. None: as selected.",
                             "Elements: by type and name. Containers, then elements: also the containers. All together: one list."],
  alignWidthSameType:       ["Give all boxes of one nesting level the same width.",
                             "A container is never narrower than its contents; Use label width: the widest label sets it."],
  columnsAcrossContainers:  ["Line up the columns of the tiles on one grid across the whole view.",
                             "Boxes of one level line up along their parent's edge; neighbours stay Distance apart."],
  direction:                ["Direction of the main flow.", ""],
  acyclicer:                ["How relation cycles are broken before layout; no effect without cycles.",
                             "Default: depth-first search. Greedy: reverses as few relations as it can."],
  ranking:                  ["How elements are assigned to layers.",
                             "Balanced: short connections. Uniform and Top-aligned: faster."],
  nodePlacement:            ["Where elements sit within their layer.",
                             "Centred: between the elements they connect to. Straight lines: in line with one neighbour."],
  circles:                  ["How the elements are divided over circles.", ""],
  layerSpacing:             ["Space between successive layers; Tree: between levels; Twopi: between rings.",
                             "px — Tree: at least Distance; with Reserve label space a gap widens to fit its labels."],
  elementWidth:             ["Width of every element.", "px"],
  elementHeight:            ["Height of every element.", "px"],
  labelSizing:              ["Size each element to its label; long labels wrap to two lines.", "Replaces Width and Height."],
  labelMaxLineWidth:        ["Label width at which Use label width wraps to a second line.", "px"],
  elementSpacing:           ["Minimum distance between elements, also between unconnected groups.",
                             "px — Neato, FDP, SFDP, Circo: room for a connection between two elements; the other value follows."],
  routing:                  ["How connection lines are drawn.", ""],
  labelPosition:            ["Where the connection label sits.", ""],
  connectionLabelSpacing:   ["Keep connection labels clear of other labels, connections and elements.",
                             "A layer gap widens where a label needs label + 2 × Between."],
  connectionSpacing:        ["Distance between parallel connections, and between connection points on one side of an element.",
                             "px — elements grow to fit their connections; 0 = no growth."],
  connectionElementSpacing: ["Minimum distance between a connection and the elements it passes.",
                             `px — the first and last bend stay ${CONNECTION_END_CLEARANCE} or more from it; Neato, FDP, SFDP, Circo: Distance follows.`],
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
 * option's explanation) and unit / detail. Which algorithms use it is left out: the dialog greys
 * the control (paramUsedBy is for the docs).
 * @param {string} key
 * @param {string} [extra]
 * @returns {string}
 */
function paramTooltip(key, extra) {
  const [what, detail] = PARAM_TOOLTIPS[key] || ["", ""];
  return [what, extra, detail].filter(Boolean).join("\n");
}

const LAYOUT_GROUPS = Object.freeze({
  Algorithm:   ["algorithmStart", "cycleAlgorithmStart"],
  Nesting:     ["nestingConditions"],
  Reverse:     ["reverseConditions"],
  Containers:  ["containerAlgorithm", "connectionsMode", "padding",
                "sort", "alignWidthSameType", "columnsAcrossContainers"],
  Flow:        ["direction", "acyclicer", "ranking", "nodePlacement", "circles", "layerSpacing"],
  Elements:    ["elementWidth", "elementHeight", "labelSizing", "labelMaxLineWidth", "elementSpacing"],
  Connections: ["routing", "labelPosition", "connectionLabelSpacing", "connectionSpacing", "connectionElementSpacing"],
  "View size": ["aspectRatio", "maxWidth"],
});

// View-size params — maxWidth + aspectRatio (ELK: met by calibrating elk.aspectRatio — elk.js _fitViewSize).
// Graphviz has aspectRatio only: it cannot narrow a layout without scaling elements.
const PARAMS_VIEW_SIZE = Object.freeze(["maxWidth", "aspectRatio"]);
// Grid and Pack arrange columns: the width sets how many fit, so they offer Max width only (Tiles has both).
const PARAMS_VIEW_WIDTH = Object.freeze(["maxWidth"]);

// Graphviz cluster-nesting controls — Dot, FDP. padding = cluster margin (graphviz.js).
const PARAMS_GV_CLUSTER = Object.freeze(["nestingConditions", "padding"]);

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
      "direction", "nodePlacement", "routing", "labelPosition", "reverseConditions", "connectionsMode",
      "layerSpacing", "elementSpacing", "connectionSpacing", "connectionElementSpacing",
      "connectionLabelSpacing",
    ],
    supportedOptions: {
      direction:          DIRECTION_VALUES,
      nodePlacement:      ["Centred", "Straight lines"],
      routing:            ["Orthogonal", "Polyline", "Splines"],
      labelPosition:      LP_ELK,
      containerAlgorithm: ["Layered", "Grid", "Pack"],
      connectionsMode:    ["Between containers", "Crossing containers"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Process models, application flows and service interactions:\nstrong direction, nested containers (ELK)",
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
      "direction", "routing", "labelPosition", "reverseConditions", "layerSpacing",
      "elementSpacing", "connectionSpacing", "connectionElementSpacing",
    ],
    supportedOptions: {
      direction:          DIRECTION_VALUES,
      routing:            ["Straight", "Splines"],   // elk.js _routeTreeEdges
      labelPosition:      LP_ELK,
      containerAlgorithm: ["Grid", "Pack"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Organisation charts, product breakdowns, capability decomposition:\nhierarchical nesting (ELK)",
    paramConflicts: CONFLICTS_VIEW,
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
    style:                "Hierarchy",
    supportsNesting:      "none",   // ELK Radial crashes on compound graphs
    supportsSelfLoops:    false,    // tree-like layout; self-loops not routed
    // No aspectRatio: the bundled elkjs declares no elk.aspectRatio for radial, so the layout never responds to it.
    activeParams:         [...ALWAYS_ACTIVE_PARAMS, "elementSpacing"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Tree radiating from a central element: each depth on its own circle, each subtree its own sector.\nCycles are cut to a tree (ELK Radial)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Grid: {
    engine:               "ELK",
    engineAlgorithmId:    "box",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // box/rectpacking position nodes only — they do not route edges
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_WIDTH,
      "sort", "labelSizing", "labelMaxLineWidth",
      "elementSpacing", "reverseConditions",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "Boxes in regular rows, in their order: simple and easy to scan.\nNesting is supported (ELK Box)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Pack: {
    engine:               "ELK",
    engineAlgorithmId:    "rectpacking",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // pack only positions nodes; no edge routing
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, ...PARAMS_ELK_NESTING, ...PARAMS_VIEW_WIDTH,
      "sort", "labelSizing", "labelMaxLineWidth",
      "elementSpacing", "reverseConditions",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "Packs boxes as tightly as it can; most compact with Use label width.\nNesting is supported (ELK Rectpacking)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Tiles: {
    engine:               "Tiles",
    engineAlgorithmId:    "tiles",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // tiles position nodes only — they do not route edges
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "nestingConditions", "padding", "sort", "alignWidthSameType", "columnsAcrossContainers",
      ...PARAMS_VIEW_SIZE, "labelSizing", "labelMaxLineWidth", "elementSpacing", "reverseConditions",
    ],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Sorted nestings tiled tightly: the order reads left to right and down.\nLittle white space; nesting is supported (no layout engine)",
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
      "direction", "ranking", "acyclicer", "labelPosition", "reverseConditions",
      "nestingConditions",
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
      "layerSpacing", "elementSpacing", "reverseConditions",
      // connectionSpacing / connectionElementSpacing: dot has no equivalent (sep/esep are not used by dot)
    ],
    supportedOptions: {
      direction:     DIRECTION_VALUES,
      routing:       ["Orthogonal", "Polyline", "Straight", "Spline (approximated)"],
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Hierarchical layered layout with strong cluster nesting.\nOrthogonal, polyline and spline routing (Graphviz dot)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Neato: {
    engine:               "Graphviz",
    engineAlgorithmId:    "neato",
    style:                "Network",
    supportsNesting:      "none",   // neato places elements ignoring clusters; mode=ipsep crashes (Graphviz 14.1)
    supportsSelfLoops:    true,   // Graphviz native
    connectionsBetweenElements: true,   // the dialog keeps Element distance ≥ 2 × Distance to element + 2
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
    tooltip: "Spring-model layout for undirected networks; for nesting use FDP (Graphviz neato)",
    paramConflicts: CONFLICTS_VIEW,
  },

  FDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "fdp",
    style:                "Network",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz native
    connectionsBetweenElements: true,   // the dialog keeps Element distance ≥ 2 × Distance to element + 2
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio", ...PARAMS_GV_CLUSTER,
      "routing", "labelPosition",
      "elementSpacing", "connectionElementSpacing", "reverseConditions",
    ],
    supportedOptions: {
      routing:       ROUTING_GV_POLY,
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Force-directed layout with cluster nesting; connections are routed around clusters (Graphviz fdp)",
    paramConflicts: CONFLICTS_VIEW,
  },

  SFDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "sfdp",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    connectionsBetweenElements: true,   // the dialog keeps Element distance ≥ 2 × Distance to element + 2
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
    tooltip: "Force-directed like FDP, built up over coarser versions of the graph.\nOnly gains over FDP on large networks of 100+ elements (Graphviz sfdp)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Twopi: {
    engine:               "Graphviz",
    engineAlgorithmId:    "twopi",
    style:                "Circular",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      ...ALWAYS_ACTIVE_PARAMS, "aspectRatio",
      "labelPosition", "layerSpacing", "elementSpacing",
    ],
    supportedOptions: {
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Network on concentric circles by distance from a central element.\nEvery connection is kept (Graphviz twopi)",
    paramConflicts: CONFLICTS_VIEW,
  },

  Circo: {
    engine:               "Graphviz",
    engineAlgorithmId:    "circo",
    style:                "Circular",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    connectionsBetweenElements: true,   // the dialog keeps Element distance ≥ 2 × Distance to element + 2
    activeParams:         [
      // aspectRatio: a ratio stretches the circle into an ellipse
      ...ALWAYS_ACTIVE_PARAMS,
      "circles", "routing", "labelPosition",
      "elementSpacing", "connectionElementSpacing",
    ],
    supportedOptions: {
      routing:       ROUTING_GV_POLY,
      labelPosition: LP_GV,
    },
    labelPositionDefault: "Natural",
    tooltip: "Elements on circles, ordered so that few connections cross: for cycles such as life cycles and loops.\nNeeds many connections, no dominant hub or hierarchy; up to about 40 elements (Graphviz circo)",
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
    tooltip: "Adds elements related to the elements selected on the view (steps on the Selection tab), then\nlays out the whole view; needs elements selected on the view, not the view in the model tree." },
  LAYOUT_ONLY:   { id: "layout_only",   label: "Layout only",
    tooltip: "Lays out all elements on the view again.\nNothing is added or removed." },
});

// ── Routing ───────────────────────────────────────────────────────────────────

const ROUTING = Object.freeze({
  ORTHOGONAL:    { id: "Orthogonal",           label: "Orthogonal",
    tooltip: "Draws relation lines with right-angle bends." },
  POLYLINE:      { id: "Polyline",             label: "Polyline",
    tooltip: "Draws relation lines with diagonal bends." },
  STRAIGHT:      { id: "Straight",             label: "Straight",
    tooltip: "Draws relation lines as direct straight lines." },
  SPLINE:        { id: "Spline (approximated)", label: "Spline (approximated)",
    tooltip: "Graphviz curves, approximated with bendpoints." },
  SPLINES:       { id: "Splines",              label: "Splines",
    tooltip: "Draws relation lines as smooth curves." },
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
  { val: "Centred", default: true,
    tooltip: "Elements centred between the elements they connect to:\nshortest connections, usually the smallest view." },
  { val: "Straight lines",
    tooltip: "As many straight connections as possible;\nthe layout leans to one side, so parents may sit at the edge of their children." },
]);

// ── Circles (Circo only) ──────────────────────────────────────────────────────
// Engine identifiers (oneblock) live in engines/graphviz.js.

const CIRCLES = Object.freeze([
  { val: "One circle", default: true,
    tooltip: "All elements on one circle; connections run across it. Also fits a model with a hub or without cycles." },
  { val: "Per cycle",
    tooltip: "Each cycle on its own circle, joined where cycles meet in one element or relation.\nElements outside a cycle hang off it, so a hub becomes a star." },
]);

// ── Acyclicer options (Dagre only) ────────────────────────────────────────────

const ACYCLICER = Object.freeze([
  { val: "Default", default: true },
  { val: "Greedy" },
]);

// ── Element order (all algorithms) ────────────────────────────────────────────
// Algorithm start: the order of the elements outside containers as they go into the layout
// (generate_view.js); a sorted view (SORT_MODE) overrules it.

/** How the view is sorted (param sort), always ascending, by type and name. */
const SORT_MODE = Object.freeze({
  NONE:             "None",
  ELEMENTS:         "Elements",
  CONTAINERS_FIRST: "Containers, then elements",
  ALL_TOGETHER:     "All together",
});

const ALGORITHM_START = Object.freeze([
  { val: "Selection", default: true },
  { val: "Name △" },
  { val: "Type and name △" },
  { val: "Name ▽" },
]);

// ── Direction map (shared by Graphviz and Dagre engines) ──────────────────────

/** @type {Readonly<Record<string, string>>} */
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
  { val: "Natural", tooltip: "Graphviz-computed position that avoids overlap." },
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
  schemaVersion: 6,   // 2 = condition lists (rel_filter.js); 3 = everyContainer per nesting condition; 4 = keys *Rules → *Conditions; 5 = nesting style conditions + palette; 6 = font size and bold per nesting style condition; older presets are migrated offline
  name:      "",
  algorithm: "Layered",
  params: {
    direction:             "Right",
    nodePlacement:         "Centred",               // "Centred" | "Straight lines" (Layered only)
    circles:               "One circle",            // "One circle" | "Per cycle" (Circo only)
    routing:               "Orthogonal",
    labelPosition:         "Middle",
    ranking:               "Balanced",
    acyclicer:             "Default",
    reverseConditions:     [                       // condition list (rel_filter "relation"): flipped relations; [] = none
      { relation: "realization-relationship" },
      { relation: "serving-relationship" },
      { relation: "specialization-relationship" },
    ],
    nestingConditions:     [],                     // condition list (rel_filter "relation"): relations drawn as nesting; [] = none
    padding:               20,
    diagramPadding:        10,
    sort:                  "Elements",             // SORT_MODE (Grid, Pack, Tiles)
    algorithmStart:          "Selection",            // ALGORITHM_START: elements outside containers
    cycleAlgorithmStart:     false,                  // each layout of an existing view takes the next algorithmStart
    alignWidthSameType:    false,
    columnsAcrossContainers:     false,
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
  // Filter lists (empty = keep everything); condition shapes in rel_filter.js.
  filter: {
    elementConditions:  [],   // kind "element"
    diagramConditions:  [],   // kind "diagram"
    relationConditions: [],   // kind "relation"
  },
  relatedElements: {
    // each: { name ("" = Step N), repeat, conditions: [kind "step"] }; the default adds one ring: every neighbour
    steps: [{ name: "Directly related elements (1 ring)", repeat: 1, conditions: [{}] }],
  },
  view: {
    name:   "",
    folder: "",   // path under /Views, e.g. "/_Generated/Test"; "" = GENERATED_VIEW_FOLDER
    suffix: "",   // One view each: appended to each element name, e.g. " (GGM)"
  },
  appearance: {
    palette: "",   // palette name in presets/_palettes.json; "" = none
    // Style conditions (kind "style"); a later condition wins where two conditions style the same object.
    styleByProperty: {
      conditions:       [],
      mixedValuesColor: "#FF6B35",   // element / relation that gets more than one value
      lineWidth:        0,           // 0 = no change; 1..3 for relations styled by a Color = Relation condition
    },
    nestingLevel: {
      // Nesting style conditions (kind "nestingStyle"): the nesting steps styling follows from each root container.
      conditions:         [{ child: "same", fontSize: 14 }],
      fontEnabled:        false,
      fontDecreasePerLevel: 2,
      colorEnabled:       false,
      darkenStart:        1,     // steps darker than its colour a segment starts (chroma darken)
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
// What each label-sizing key does (generated table in reference/presets.md). Label sizing = Use label
// width; the connection-label box of Reserve label space uses the first four.
const LABEL_SIZING_EFFECTS = Object.freeze({
  labelCharWidth:    "Width of one character in the label-width estimate (px)",
  labelLineHeight:   "Height of one label line (px)",
  labelHPadding:     "Room left and right of the label (px)",
  labelVPadding:     "Room above and below the label (px)",
  labelMaxLineWidth: "Not used here: the dialog's Wrap label at sets it",
  labelMinWidth:     "Smallest element width with Use label width (px)",
  labelMinHeight:    "Smallest element height with Use label width (px)",
});

// ── Name order ────────────────────────────────────────────────────────────────

/**
 * Key of a name for "by name": accents and case folded (NFD, combining marks dropped, lower case).
 * @param {string} s
 */
function _nameKey(s) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * The one "by name" comparison: folded key first, code-point order as tie-break. Plain JavaScript,
 * so the order is the same on every machine — localeCompare follows the JVM's locale in Archi,
 * and jArchi's GraalJS has no Intl to fix one.
 * @param {string} a
 * @param {string} b
 */
function compareNames(a, b) {
  const ka = _nameKey(a), kb = _nameKey(b);
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

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
  { value: REPEAT_UNTIL_NOTHING_NEW, label: "∞" },
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
 * Valid ids for condition normalisation (rel_filter.normalizeConditions).
 * @returns {ValidTypeSets}
 */
function _conditionValidity() {
  return {
    elements:    new Set(ELEMENT_TYPES),
    relations:   new Set(RELATION_TYPE_IDS),
    diagrams:    new Set(Object.keys(DIAGRAM_TYPES)),
    colorRanges: new Set(COLOR_RANGES),
  };
}

/**
 * Keys of the preset format before condition lists (schemaVersion 2) found in `raw`. Presets are
 * migrated offline (README.md § Presets); loading one unmigrated would silently drop its filters.
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
    throw `Preset uses the old filter format (${legacy.join(", ")}). Migrate it: Scripts/View/README.md § Presets.`;

  /** @type {Preset} */
  const preset = JSON.parse(JSON.stringify(DEFAULT_PRESET));  // deep clone defaults

  // top-level
  if (raw.name    !== undefined) preset.name    = String(raw.name);
  if (raw.algorithm !== undefined) preset.algorithm = raw.algorithm;

  const alg = ALGORITHMS[preset.algorithm];
  if (!alg) throw `Unknown algorithm: "${preset.algorithm}". Valid algorithms: ${Object.keys(ALGORITHMS).join(", ")}`;

  const valid = _conditionValidity();
  /** @type {<K extends ConditionKind>(kind: K, list: unknown, where: string) => ConditionByKind[K][]} */
  const conditions = (kind, list, where) => ConditionLists.normalizeConditions(kind, list, valid, where);

  // DEFAULT_PRESET holds its condition lists in file form; defaults a preset leaves in place get the full shape too.
  preset.params.nestingConditions = conditions("relation", preset.params.nestingConditions, "params.nestingConditions");
  preset.params.reverseConditions = conditions("relation", preset.params.reverseConditions, "params.reverseConditions");
  preset.appearance.nestingLevel.conditions = conditions("nestingStyle", preset.appearance.nestingLevel.conditions, "appearance.nestingLevel.conditions");
  preset.relatedElements.steps.forEach((step, i) => { step.conditions = conditions("step", step.conditions, `relatedElements.steps[${i}].conditions`); });

  // params — merge raw.params over defaults, validate options
  if (raw.params && typeof raw.params === "object") {
    for (const [key, rawVal] of Object.entries(raw.params)) {
      if (!(key in DEFAULT_PRESET.params)) continue;  // unknown key ignored
      if (key === "nestingConditions" || key === "reverseConditions") {
        preset.params[key] = conditions("relation", rawVal, `params.${key}`);
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
    const params = /** @type {Record<string, unknown>} */ (preset.params);
    if (opts.includes(/** @type {string} */ (params[key]))) continue;
    params[key] = (key === "labelPosition" && alg.labelPositionDefault) ? alg.labelPositionDefault : opts[0];
  }

  // filter
  if (raw.filter && typeof raw.filter === "object") {
    preset.filter.elementConditions  = conditions("element",  raw.filter.elementConditions,  "filter.elementConditions");
    preset.filter.diagramConditions  = conditions("diagram",  raw.filter.diagramConditions,  "filter.diagramConditions");
    preset.filter.relationConditions = conditions("relation", raw.filter.relationConditions, "filter.relationConditions");
  }

  // relatedElements — reads `steps` only. No fallback to legacy `layers` (rule #12).
  if (raw.relatedElements && Array.isArray(raw.relatedElements.steps)) {
    preset.relatedElements.steps = raw.relatedElements.steps.map((/** @type {PresetFile} */ step, /** @type {number} */ i) => ({
      name:       step.name !== undefined ? String(step.name) : "",
      repeat: normalizeRepeat(step.repeat),
      conditions:  conditions("step", step.conditions, `relatedElements.steps[${i}].conditions`),
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
      pa.styleByProperty.conditions = conditions("style", rs.conditions, "appearance.styleByProperty.conditions");
      if (typeof rs.mixedValuesColor === "string" && rs.mixedValuesColor.trim()) pa.styleByProperty.mixedValuesColor = rs.mixedValuesColor.trim();   // empty → default
      if (typeof rs.lineWidth === "number")        pa.styleByProperty.lineWidth = Math.max(0, Math.min(3, Math.round(rs.lineWidth)));
    }

    if (typeof ra.palette === "string") pa.palette = ra.palette;

    if (ra.nestingLevel && typeof ra.nestingLevel === "object") {
      const rn = ra.nestingLevel;
      if (Array.isArray(rn.conditions)) pa.nestingLevel.conditions = conditions("nestingStyle", rn.conditions, "appearance.nestingLevel.conditions");
      if (typeof rn.fontEnabled          === "boolean") pa.nestingLevel.fontEnabled          = rn.fontEnabled;
      if (typeof rn.fontDecreasePerLevel === "number")  pa.nestingLevel.fontDecreasePerLevel = rn.fontDecreasePerLevel;
      if (typeof rn.colorEnabled         === "boolean") pa.nestingLevel.colorEnabled         = rn.colorEnabled;
      if (typeof rn.darkenStart          === "number")  pa.nestingLevel.darkenStart          = Math.max(0, Math.min(3, Math.round(rn.darkenStart)));
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
  if (p.viewSizeMode === "aspectRatio" && (p.aspectRatio || 0) > 0) return "view size aspect ratio";
  if (p.viewSizeMode === "maxWidth"    && (p.maxWidth || 0)    > 0) return "view size max width";
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
    RANKING, NODE_PLACEMENT, CIRCLES, ACYCLICER, ALGORITHM_START, SORT_MODE, LABEL_POSITIONS, AR_OPTIONS, AR_DEFAULT,
    RELATION_TYPES, RELATION_TYPE_IDS, RELATION_TYPE_LABELS, RELATION_WEIGHT_MAP,
    ELEMENT_TYPES, ELEMENT_TYPE_LABELS,
    DIAGRAM_TYPES, DIAGRAM_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, DIAGRAM_TYPE_LABEL_TO_ID,
    PROP_ID, PROP_MANAGED_OCCURRENCE,
    GENERATED_VIEW_FOLDER, SESSION_FILENAME, COLOR_RANGES,
    SPLINE_SAMPLE_POINTS,
    CONTAINER_LABEL_CLEARANCE,
    DEFAULT_PRESET,
    LABEL_SIZING_DEFAULTS, LABEL_SIZING_EFFECTS,
    CONNECTION_END_CLEARANCE, CONNECTION_END_ROOM, BENDPOINT_MIN_GAP, MIN_CONNECTION_LENGTH,
    validatePreset, effectiveParams, connectionsModeLock,
    REPEAT_UNTIL_NOTHING_NEW, REPEAT_MAX, REPEAT_OPTIONS, normalizeRepeat, repeatMaxRuns,
    compareNames,
  };
}
