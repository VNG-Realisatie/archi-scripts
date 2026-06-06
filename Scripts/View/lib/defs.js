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
const { DIAGRAM_OBJECT_TYPES } = require(REPO_ROOT + "_lib/selection");

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = Object.freeze({
  Flow:      { algorithms: ["Layered", "Dagre", "Dot"],                      tooltip: "Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models." },
  Hierarchy: { algorithms: ["Tree", "Twopi"],                                tooltip: "Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition." },
  Network:   { algorithms: ["Force", "Stress", "Neato", "FDP", "SFDP"],      tooltip: "Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks." },
  Circular:  { algorithms: ["Radial", "Circo"],                              tooltip: "Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures." },
  Compact:   { algorithms: ["Grid", "Pack"],                                 tooltip: "Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries." },
});

// ── Algorithms ────────────────────────────────────────────────────────────────
// supportsNesting: "full" | "partial" | "cluster" | "none"
// activeParams: GUI param keys active for this algorithm (others greyed out)
// supportedOptions: allowed values per select-type param (undefined = free value)
// engineAlgorithmId: engine-internal identifier
// labelPositionDefault: default for the labelPosition param

const ALGORITHMS = Object.freeze({
  Layered: {
    engine:               "ELK",
    engineAlgorithmId:    "layered",
    style:                "Flow",
    supportsNesting:      "full",
    supportsSelfLoops:    true,   // ELK layered routes self-loops (SelfLoopDistribution / SelfLoopOrdering)
    activeParams:         [
      "direction", "routing", "labelPosition", "reverseRelationTypes",
      "nestingRelationTypes", "padding",
      "sortContainers", "alignWidthSameType", "alignDebug",
      "showInEveryContainer", "containerAlgorithm", "connectionsMode",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions: {
      direction:          ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      routing:            ["Orthogonal", "Polyline", "Splines"],
      labelPosition:      ["Source", "Middle", "Target"],
      containerAlgorithm: ["Layered", "Grid", "Pack"],
      connectionsMode:    ["Between containers", "Crossing containers"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Process models, application flows, service interactions with strong directionality and nested containers (ELK)",
    paramConflicts: { aspectRatio: ["maxWidth"], maxWidth: ["aspectRatio"] },
  },

  Tree: {
    engine:               "ELK",
    engineAlgorithmId:    "mrtree",
    style:                "Hierarchy",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // mrtree is acyclic-by-construction; self-loops not routed
    activeParams:         [
      "direction", "labelPosition", "reverseRelationTypes",
      "nestingRelationTypes", "padding",
      "sortContainers", "alignWidthSameType", "alignDebug",
      "showInEveryContainer", "containerAlgorithm",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions: {
      direction:          ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      labelPosition:      ["Source", "Middle", "Target"],
      containerAlgorithm: ["Grid", "Pack"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK)",
    paramConflicts: { aspectRatio: ["maxWidth"], maxWidth: ["aspectRatio"] },
  },

  Force: {
    engine:               "ELK",
    engineAlgorithmId:    "force",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    false,  // physics-based; self-loops collapse to a point
    activeParams:         ["elementSpacing", "elementWidth", "elementHeight", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Application landscapes and integration networks emphasising emergent connectivity without nesting (ELK)",
  },

  Stress: {
    engine:               "ELK",
    engineAlgorithmId:    "stress",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    false,  // stress model has no notion of self-loop distance
    activeParams:         ["elementSpacing", "elementWidth", "elementHeight", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Dependency maps and impact analysis emphasising relational distance (ELK)",
  },

  Radial: {
    engine:               "ELK",
    engineAlgorithmId:    "radial",
    style:                "Circular",
    supportsNesting:      "none",   // ELK Radial crashes on compound graphs
    supportsSelfLoops:    false,    // tree-like layout; self-loops not routed
    activeParams:         [
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight", "aspectRatio",
    ],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Domain overviews and hub-and-spoke structures (ELK)",
  },

  Grid: {
    engine:               "ELK",
    engineAlgorithmId:    "box",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // box/rectpacking position nodes only — they do not route edges
    activeParams:         [
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignWidthSameType", "alignDebug", "snapColumnsToGrid",
      "showInEveryContainer", "containerAlgorithm",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "Portfolio overviews, catalogs and inventories with strong nesting support (ELK)",
    paramConflicts: { aspectRatio: ["maxWidth"], maxWidth: ["aspectRatio"] },
  },

  Pack: {
    engine:               "ELK",
    engineAlgorithmId:    "rectpacking",
    style:                "Compact",
    supportsNesting:      "full",
    supportsSelfLoops:    false,  // pack only positions nodes; no edge routing
    activeParams:         [
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignWidthSameType", "alignDebug", "snapColumnsToGrid",
      "showInEveryContainer", "containerAlgorithm",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions:     { containerAlgorithm: ["Layered", "Grid", "Pack"] },
    labelPositionDefault: null,
    tooltip: "High-level landscape summaries and grouped overviews with strong nesting support (ELK)",
    paramConflicts: { aspectRatio: ["maxWidth"], maxWidth: ["aspectRatio"] },
  },

  Dagre: {
    engine:               "Dagre",
    engineAlgorithmId:    "dagre",
    style:                "Flow",
    supportsNesting:      "partial",
    supportsSelfLoops:    "partial",  // dagre-cluster-fix attempts routing; falls back to writer synthesis on error
    activeParams:         [
      "direction", "ranking", "acyclicer", "labelPosition", "reverseRelationTypes",
      "nestingRelationTypes", "padding",
      "sortContainers",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      ranking:       ["Balanced", "Uniform", "Top-aligned"],
      acyclicer:     ["Default", "Greedy"],
      labelPosition: ["Source", "Middle", "Target"],
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
      "direction", "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      routing:       ["Orthogonal", "Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Hierarchical layered layout with direction control and strong cluster nesting. Supports orthogonal, polyline and spline routing (Graphviz dot)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },

  Neato: {
    engine:               "Graphviz",
    engineAlgorithmId:    "neato",
    style:                "Network",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions: {
      routing:       ["Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Spring-model layout for undirected networks with partial cluster nesting. No direction control (Graphviz neato)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },

  FDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "fdp",
    style:                "Network",
    supportsNesting:      "cluster",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions: {
      routing:       ["Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Force-directed layout with better cluster support than Neato. Unique compound edge routing around clusters (Graphviz fdp)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },

  SFDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "sfdp",
    style:                "Network",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      "routing", "labelPosition",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      routing:       ["Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Scalable force-directed layout for large undirected graphs (100+ nodes). No nesting (Graphviz sfdp)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },

  Twopi: {
    engine:               "Graphviz",
    engineAlgorithmId:    "twopi",
    style:                "Hierarchy",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      "labelPosition",
      "layerSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio", "reverseRelationTypes",
    ],
    supportedOptions: {
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Radial layout radiating outward from a central root node. No direction control or nesting (Graphviz twopi)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },

  Circo: {
    engine:               "Graphviz",
    engineAlgorithmId:    "circo",
    style:                "Circular",
    supportsNesting:      "none",
    supportsSelfLoops:    true,   // Graphviz native
    activeParams:         [
      "labelPosition",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Circular layout placing nodes on concentric circles. Best for ring topologies and cyclic dependency patterns (Graphviz circo)",
    paramConflicts: {
      aspectRatio: ["maxWidth", "maxHeight"],
      maxWidth:    ["aspectRatio", "maxHeight"],
      maxHeight:   ["aspectRatio", "maxWidth"],
    },
  },
});

// Derived: algorithm name → engine name
const ALGO_ENGINE = Object.freeze(
  Object.fromEntries(Object.entries(ALGORITHMS).map(([k, v]) => [k, v.engine]))
);

// ── Actions ───────────────────────────────────────────────────────────────────

const ACTION = Object.freeze({
  NEW_VIEW:      { id: "new_view",      label: "New view",      default: true,
    tooltip: "Creates a new view from the selected elements and their relations." },
  ONE_EACH:      { id: "one_each",      label: "One view each",
    tooltip: "Creates one view per selected element. Each view is named after its element." },
  EXPAND_VIEW:   { id: "expand_view",   label: "Expand view",
    tooltip: "Adds elements related to the current selection to the open view. Existing elements are kept in place." },
  LAYOUT_ONLY:   { id: "layout_only",   label: "Layout only",
    tooltip: "Re-positions all elements on the selected view. No elements or relations are added or removed." },
});

// ── Routing ───────────────────────────────────────────────────────────────────

const ROUTING = Object.freeze({
  ORTHOGONAL:    { id: "Orthogonal",           label: "Orthogonal",
    tooltip: "Draws relation lines with right-angle bends. Best results with Layered layout." },
  POLYLINE:      { id: "Polyline",             label: "Polyline",
    tooltip: "Draws relation lines with diagonal bends. Works with all algorithms." },
  STRAIGHT:      { id: "Straight",             label: "Straight",
    tooltip: "Draws relation lines as direct straight lines." },
  SPLINE:        { id: "Spline (approximated)", label: "Spline (approximated)",
    tooltip: "Graphviz B-splines converted to bendpoints. Only available with Graphviz algorithms." },
  SPLINES:       { id: "Splines",              label: "Splines",
    tooltip: "Smooth Bézier curve edges. Available with Layered and Tree algorithms." },
});

// ── Directions ────────────────────────────────────────────────────────────────

const DIRECTIONS = Object.freeze([
  { val: "Left → Right", default: true },
  { val: "Right → Left" },
  { val: "Top → Bottom" },
  { val: "Bottom → Top" },
]);

// ── Ranking (Dagre only) ──────────────────────────────────────────────────────
// Dialog display values and defaults only.
// Engine-specific ranker identifiers live in engines/dagre.js.

const RANKING = Object.freeze([
  { val: "Balanced",    default: true },
  { val: "Uniform" },
  { val: "Top-aligned" },
]);

// ── Acyclicer options (Dagre only) ────────────────────────────────────────────

const ACYCLICER = Object.freeze([
  { val: "Default", default: true },
  { val: "Greedy" },
]);

// ── Direction map (shared by Graphviz and Dagre engines) ──────────────────────

const DIRECTION_MAP = Object.freeze({
  "Left → Right": "LR",
  "Right → Left": "RL",
  "Top → Bottom": "TB",
  "Bottom → Top": "BT",
});

// ── Label positions ───────────────────────────────────────────────────────────

const LABEL_POSITIONS = Object.freeze([
  { val: "Source",  tooltip: "Near the source element." },
  { val: "Middle",  tooltip: "At the midpoint of the connection." },
  { val: "Target",  tooltip: "Near the target element." },
  { val: "Natural", tooltip: "Graphviz-computed position avoiding overlap. Only available with Graphviz algorithms." },
]);

// ── Aspect ratio options ──────────────────────────────────────────────────────

const AR_OPTIONS = Object.freeze([
  { val: 0.00, label: "free"            },
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
  "grouping", "implementation-even", "junction", "location", "material",
  "meaning", "node", "outcome", "path", "plateau", "principle", "product",
  "representation", "requirement", "resource", "stakeholder", "system-software",
  "technology-collaboration", "technology-event", "technology-function",
  "technology-interaction", "technology-interface", "technology-process",
  "technology-service", "value", "work-package",
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

const GENERATED_VIEW_FOLDER = "/View/_Generated";
const SESSION_FILENAME     = "_session.json";
// Spline sampling: number of points per cubic Bézier segment
const SPLINE_SAMPLE_POINTS = 8;

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
  name:      "",
  algorithm: "Layered",
  params: {
    direction:             "Left → Right",
    routing:               "Orthogonal",
    labelPosition:         "Middle",
    ranking:               "Balanced",
    acyclicer:             "Default",
    reverseRelationTypes:  [],
    nestingRelationTypes:  [],
    innerSpacing:          20,
    padding:               20,
    sortContainers:        false,
    alignWidthSameType:    false,
    alignDebug:            false,
    snapColumnsToGrid:     false,
    showInEveryContainer:  false,
    containerAlgorithm:    "Layered",              // "Layered" | "Grid" | "Pack"
    connectionsMode:       "Between containers",   // "Between containers" | "Crossing containers"
    layerSpacing:          180,
    elementSpacing:        40,
    elementWidth:          140,
    elementHeight:         60,
    maxWidth:              0,
    maxHeight:             0,
    aspectRatio:           0,
    viewSizeMode:          "none",  // "none" | "maxWidth" | "maxHeight" | "aspectRatio"
  },
  filter: {
    elementTypes:  [],
    relationTypes: [],
    diagramTypes:  [],
  },
  relatedElements: {
    steps: [],  // each: { depth: 1, elementTypes: [], relationTypes: [], diagramTypes: [] }
  },
  view: {
    name:   "",
    folder: "",
  },
  appearance: {
    styleByProperty: {
      element:  { enabled: false, elementType: "", property: "", colorRange: "Blues" },
      relation: { enabled: false, relTypes: [], property: "", colorRange: "Reds", lineWidth: 0 },
    },
    styleByRelatedProperty: { enabled: false, relTypes: [], property: "", colorRange: "OrRd" },
    styleByConnectedElement: {
      enabled: false, relTypes: [], elementType: "", property: "",
      colorRange: "Purples", conflictColor: "#FF6B35",
    },
    nestingLevel: {
      fontEnabled:        false,
      rootFontSize:       14,
      rootFontBold:       true,
      fontDecreasePerLevel: 2,
      colorEnabled:       false,
      rootColor:          "#2B5796",
      darkenPerLevel:     15,
    },
    highlightRepeated: { enabled: false, colorRange: "Pastel1" },
  },
  engineParams: {
    ELK: {
      "elk.spacing.nodeSelfLoop": 25,  // clearance from node boundary to self-loop wire, and between stacked self-loops
      "elk.layered.edgeRouting.selfLoopDistribution": "EQUALLY",  // NORTH | EQUALLY | NORTH_SOUTH
      "elk.layered.edgeRouting.selfLoopOrdering": "STACKED",      // STACKED | SEQUENCED
    },
  },
});

// ── Engine parameter mapping (GUI param → engine param) ───────────────────────
// Engine parameter mappings have moved to the engine adapters:
//   ELK params    → Scripts/View/lib/engines/elk.js    (PARAM_MAPPING)
//   Dagre params  → Scripts/View/lib/engines/dagre.js  (PARAM_MAPPING)
//   Graphviz params → Scripts/View/lib/engines/graphviz.js  (PARAM_MAPPING)

// ── Relation-direction encoding ───────────────────────────────────────────────
// Encoded forms (per Phase 2 / Scripts/View/CLAUDE.md):
//   "type"      → both directions
//   "type:in"   → incoming only (other → element)
//   "type:out"  → outgoing only (element → other)
// The UI disallows "neither direction" — at least one of inSel/outSel is always true.
function encodeRelType(typeId, inSel, outSel) {
  if (inSel && outSel) return typeId;
  if (inSel)           return typeId + ":in";
  if (outSel)          return typeId + ":out";
  return typeId;  // defensive — UI should never produce this
}

function decodeRelType(encoded) {
  const i = encoded.indexOf(":");
  if (i < 0) return { type: encoded, inSel: true, outSel: true };
  const type = encoded.substring(0, i);
  const dir  = encoded.substring(i + 1);
  return { type, inSel: dir === "in", outSel: dir === "out" };
}

// ── Preset validation ─────────────────────────────────────────────────────────

/**
 * Validate and normalise a preset object.
 * - Fills missing params from DEFAULT_PRESET
 * - Validates algorithm exists
 * - Validates option values against supportedOptions
 * - Applies algorithm-specific labelPosition default
 * Throws a descriptive string if validation fails.
 * @param {Object} raw  raw preset object (from JSON)
 * @returns {Object}    normalised preset
 */
function validatePreset(raw) {
  const preset = JSON.parse(JSON.stringify(DEFAULT_PRESET));  // deep clone defaults

  // top-level
  if (raw.name    !== undefined) preset.name    = String(raw.name);
  if (raw.algorithm !== undefined) preset.algorithm = raw.algorithm;

  const alg = ALGORITHMS[preset.algorithm];
  if (!alg) throw `Unknown algorithm: "${preset.algorithm}". Valid algorithms: ${Object.keys(ALGORITHMS).join(", ")}`;

  // params — merge raw.params over defaults, validate options
  if (raw.params && typeof raw.params === "object") {
    for (const [key, val] of Object.entries(raw.params)) {
      if (!(key in DEFAULT_PRESET.params)) continue;  // unknown key ignored
      const opts = alg.supportedOptions[key];
      if (opts && !opts.includes(val)) {
        console.log(`Warning: param "${key}" value "${val}" not supported by ${preset.algorithm}. Using default.`);
        continue;
      }
      preset.params[key] = val;
    }
  }

  // apply labelPosition default if not set or not supported
  const lpOpts = alg.supportedOptions.labelPosition;
  if (lpOpts && !lpOpts.includes(preset.params.labelPosition)) {
    preset.params.labelPosition = alg.labelPositionDefault;
  }

  // filter
  if (raw.filter && typeof raw.filter === "object") {
    if (Array.isArray(raw.filter.elementTypes))  preset.filter.elementTypes  = raw.filter.elementTypes;
    if (Array.isArray(raw.filter.relationTypes)) preset.filter.relationTypes = raw.filter.relationTypes;
    if (Array.isArray(raw.filter.diagramTypes))  preset.filter.diagramTypes  = raw.filter.diagramTypes;
  }

  // relatedElements — reads `steps` only. No fallback to legacy `layers` (rule #12).
  if (raw.relatedElements && Array.isArray(raw.relatedElements.steps)) {
    preset.relatedElements.steps = raw.relatedElements.steps.map(step => ({
      depth:         Number(step.depth)         || 1,
      elementTypes:  Array.isArray(step.elementTypes)  ? step.elementTypes  : [],
      relationTypes: Array.isArray(step.relationTypes) ? step.relationTypes : [],
      diagramTypes:  Array.isArray(step.diagramTypes)  ? step.diagramTypes  : [],
    }));
  }

  // view
  if (raw.view && typeof raw.view === "object") {
    if (raw.view.name   !== undefined) preset.view.name   = String(raw.view.name);
    if (raw.view.folder !== undefined) preset.view.folder = String(raw.view.folder);
  }

  // appearance
  if (raw.appearance && typeof raw.appearance === "object") {
    const ra = raw.appearance;
    const pa = preset.appearance;

    if (ra.styleByProperty && typeof ra.styleByProperty === "object") {
      if (ra.styleByProperty.element && typeof ra.styleByProperty.element === "object") {
        const re = ra.styleByProperty.element;
        if (typeof re.enabled    === "boolean") pa.styleByProperty.element.enabled    = re.enabled;
        if (typeof re.elementType === "string") pa.styleByProperty.element.elementType = re.elementType;
        if (typeof re.property   === "string")  pa.styleByProperty.element.property   = re.property;
        if (typeof re.colorRange === "string")  pa.styleByProperty.element.colorRange  = re.colorRange;
      }
      if (ra.styleByProperty.relation && typeof ra.styleByProperty.relation === "object") {
        const rr = ra.styleByProperty.relation;
        if (typeof rr.enabled    === "boolean") pa.styleByProperty.relation.enabled   = rr.enabled;
        if (Array.isArray(rr.relTypes))         pa.styleByProperty.relation.relTypes  = rr.relTypes;
        if (typeof rr.property   === "string")  pa.styleByProperty.relation.property  = rr.property;
        if (typeof rr.colorRange === "string")  pa.styleByProperty.relation.colorRange = rr.colorRange;
        if (typeof rr.lineWidth  === "number")  pa.styleByProperty.relation.lineWidth  = Math.max(0, Math.min(3, Math.round(rr.lineWidth)));
        if (typeof rr.resize     === "boolean") pa.styleByProperty.relation.lineWidth  = rr.resize ? 1 : 0; // back-compat: old boolean → 0 or 1
      }
    }

    if (ra.styleByRelatedProperty && typeof ra.styleByRelatedProperty === "object") {
      const rp = ra.styleByRelatedProperty;
      if (typeof rp.enabled    === "boolean") pa.styleByRelatedProperty.enabled    = rp.enabled;
      if (Array.isArray(rp.relTypes))         pa.styleByRelatedProperty.relTypes   = rp.relTypes;
      if (typeof rp.property   === "string")  pa.styleByRelatedProperty.property   = rp.property;
      if (typeof rp.colorRange === "string")  pa.styleByRelatedProperty.colorRange = rp.colorRange;
    }

    if (ra.styleByConnectedElement && typeof ra.styleByConnectedElement === "object") {
      const rc = ra.styleByConnectedElement;
      if (typeof rc.enabled      === "boolean") pa.styleByConnectedElement.enabled      = rc.enabled;
      if (Array.isArray(rc.relTypes))           pa.styleByConnectedElement.relTypes      = rc.relTypes;
      if (typeof rc.elementType  === "string")  pa.styleByConnectedElement.elementType   = rc.elementType;
      if (typeof rc.property     === "string")  pa.styleByConnectedElement.property      = rc.property;
      if (typeof rc.colorRange   === "string")  pa.styleByConnectedElement.colorRange    = rc.colorRange;
      if (typeof rc.conflictColor === "string") pa.styleByConnectedElement.conflictColor = rc.conflictColor;
    }

    if (ra.nestingLevel && typeof ra.nestingLevel === "object") {
      const rn = ra.nestingLevel;
      if (typeof rn.fontEnabled          === "boolean") pa.nestingLevel.fontEnabled          = rn.fontEnabled;
      if (typeof rn.rootFontSize         === "number")  pa.nestingLevel.rootFontSize         = rn.rootFontSize;
      if (typeof rn.rootFontBold         === "boolean") pa.nestingLevel.rootFontBold         = rn.rootFontBold;
      if (typeof rn.fontDecreasePerLevel === "number")  pa.nestingLevel.fontDecreasePerLevel = rn.fontDecreasePerLevel;
      if (typeof rn.colorEnabled         === "boolean") pa.nestingLevel.colorEnabled         = rn.colorEnabled;
      if (typeof rn.rootColor            === "string")  pa.nestingLevel.rootColor            = rn.rootColor;
      if (typeof rn.darkenPerLevel       === "number")  pa.nestingLevel.darkenPerLevel       = rn.darkenPerLevel;
    }

    if (ra.highlightRepeated && typeof ra.highlightRepeated === "object") {
      const rh = ra.highlightRepeated;
      if (typeof rh.enabled    === "boolean") pa.highlightRepeated.enabled    = rh.enabled;
      if (typeof rh.colorRange === "string")  pa.highlightRepeated.colorRange = rh.colorRange;
    }
  }

  return preset;
}

/**
 * Return the subset of `preset.params` that the chosen algorithm declares as
 * active. Inactive keys are omitted (not zeroed) so consumers that read with
 * `|| default` degrade cleanly. The raw `preset.params` is never mutated —
 * it stays intact for UI restoration on algorithm switch (§A.9, §A.10).
 *
 * @param {Object} preset  validated preset
 * @returns {Object}       masked params subset
 */
function effectiveParams(preset) {
  const alg = ALGORITHMS[preset.algorithm];
  if (!alg) return {};
  const active       = new Set(alg.activeParams || []);
  const viewSizeMode = (preset.params && preset.params.viewSizeMode) || "none";
  const conflictKeys = new Set(Object.keys(alg.paramConflicts || {}));
  const out = {};
  for (const key of Object.keys(preset.params || {})) {
    if (key === "viewSizeMode") continue;
    if (!active.has(key))       continue;
    out[key] = (conflictKeys.has(key) && key !== viewSizeMode) ? 0 : preset.params[key];
  }
  return out;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STYLES, ALGORITHMS, ALGO_ENGINE,
    ACTION, ROUTING,
    DIRECTIONS, DIRECTION_MAP,
    RANKING, ACYCLICER, LABEL_POSITIONS, AR_OPTIONS,
    RELATION_TYPES, RELATION_TYPE_IDS, RELATION_TYPE_LABELS, RELATION_WEIGHT_MAP,
    ELEMENT_TYPES, ELEMENT_TYPE_LABELS,
    DIAGRAM_TYPES, DIAGRAM_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, DIAGRAM_TYPE_LABEL_TO_ID,
    GENERATED_VIEW_FOLDER, SESSION_FILENAME, COLOR_RANGES,
    SPLINE_SAMPLE_POINTS,
    DEFAULT_PRESET,
    validatePreset, effectiveParams,
    encodeRelType, decodeRelType,
  };
}
