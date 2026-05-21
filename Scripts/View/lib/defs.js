/**
 * View subsystem — Single Source of Truth
 *
 * Defines: styles, algorithms, GUI parameters, algorithm→activeParams,
 * algorithm→supportedOptions, engine parameter mapping, relation/element types,
 * preset schema defaults, action and routing constants.
 *
 * No imports — pure data. Consumed by generate_view.js, preset_io.js,
 * selection_pipeline.js, engine adapters, and GUI dialog.
 */
console.log("defs.js");

// ── Styles ────────────────────────────────────────────────────────────────────

const STYLES = Object.freeze({
  Flow:      { algorithms: ["Layered", "Dagre", "Dot"],                      tooltip: "Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models." },
  Hierarchy: { algorithms: ["Tree", "Twopi"],                                tooltip: "Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition." },
  Network:   { algorithms: ["Force", "Stress", "Neato", "FDP", "SFDP"],     tooltip: "Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks." },
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
    activeParams:         [
      "direction", "routing", "labelPosition", "reverseRelationTypes",
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignSameType", "showInEveryContainer",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      routing:       ["Orthogonal", "Polyline", "Straight"],
      labelPosition: ["Source", "Middle", "Target"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Process models, application flows, service interactions with strong directionality and nested containers (ELK)",
  },

  Tree: {
    engine:               "ELK",
    engineAlgorithmId:    "mrtree",
    style:                "Hierarchy",
    supportsNesting:      "full",
    activeParams:         [
      "direction", "routing", "labelPosition", "reverseRelationTypes",
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignSameType", "showInEveryContainer",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      routing:       ["Orthogonal", "Polyline", "Straight"],
      labelPosition: ["Source", "Middle", "Target"],
    },
    labelPositionDefault: "Middle",
    tooltip: "Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK)",
  },

  Force: {
    engine:               "ELK",
    engineAlgorithmId:    "force",
    style:                "Network",
    supportsNesting:      "none",
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
    activeParams:         ["elementSpacing", "elementWidth", "elementHeight", "aspectRatio"],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Dependency maps and impact analysis emphasising relational distance (ELK)",
  },

  Radial: {
    engine:               "ELK",
    engineAlgorithmId:    "radial",
    style:                "Circular",
    supportsNesting:      "partial",
    activeParams:         [
      "nestingRelationTypes", "innerSpacing", "padding", "showInEveryContainer",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight", "aspectRatio",
    ],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Domain overviews and hub-and-spoke structures with strong nesting support (ELK)",
  },

  Grid: {
    engine:               "ELK",
    engineAlgorithmId:    "box",
    style:                "Compact",
    supportsNesting:      "full",
    activeParams:         [
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignSameType", "showInEveryContainer",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "Portfolio overviews, catalogs and inventories with strong nesting support (ELK)",
  },

  Pack: {
    engine:               "ELK",
    engineAlgorithmId:    "rectpacking",
    style:                "Compact",
    supportsNesting:      "full",
    activeParams:         [
      "nestingRelationTypes", "innerSpacing", "padding",
      "sortContainers", "alignSameType", "showInEveryContainer",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "aspectRatio",
    ],
    supportedOptions:     {},
    labelPositionDefault: null,
    tooltip: "High-level landscape summaries and grouped overviews with strong nesting support (ELK)",
  },

  Dagre: {
    engine:               "Dagre",
    engineAlgorithmId:    "dagre",
    style:                "Flow",
    supportsNesting:      "partial",
    activeParams:         [
      "direction", "ranking", "labelPosition", "reverseRelationTypes",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      ranking:       ["Balanced", "Uniform", "Top-aligned"],
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
    activeParams:         [
      "direction", "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      direction:     ["Left → Right", "Right → Left", "Top → Bottom", "Bottom → Top"],
      routing:       ["Orthogonal", "Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Structured process models and dependency flows with strong nesting support (Graphviz)",
  },

  Neato: {
    engine:               "Graphviz",
    engineAlgorithmId:    "neato",
    style:                "Network",
    supportsNesting:      "cluster",
    activeParams:         [
      "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      routing:       ["Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Integration networks and application landscapes with partial nesting support (Graphviz)",
  },

  FDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "fdp",
    style:                "Network",
    supportsNesting:      "cluster",
    activeParams:         [
      "routing", "labelPosition",
      "nestingRelationTypes", "innerSpacing", "padding",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      routing:       ["Polyline", "Straight", "Spline (approximated)"],
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Clustered integration networks with partial nesting support (Graphviz)",
  },

  SFDP: {
    engine:               "Graphviz",
    engineAlgorithmId:    "sfdp",
    style:                "Network",
    supportsNesting:      "none",
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
    tooltip: "Large-scale integration networks and dependency maps without nesting support (Graphviz)",
  },

  Twopi: {
    engine:               "Graphviz",
    engineAlgorithmId:    "twopi",
    style:                "Hierarchy",
    supportsNesting:      "none",
    activeParams:         [
      "labelPosition",
      "layerSpacing", "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Radial hierarchies like organisation charts and capability maps with limited nesting support (Graphviz)",
  },

  Circo: {
    engine:               "Graphviz",
    engineAlgorithmId:    "circo",
    style:                "Circular",
    supportsNesting:      "none",
    activeParams:         [
      "labelPosition",
      "elementSpacing", "elementWidth", "elementHeight",
      "maxWidth", "maxHeight", "aspectRatio",
    ],
    supportedOptions: {
      labelPosition: ["Source", "Middle", "Target", "Natural"],
    },
    labelPositionDefault: "Natural",
    tooltip: "Cyclic dependency and domain overviews with limited nesting support (Graphviz)",
  },
});

// Derived: algorithm name → engine name
const ALGO_ENGINE = Object.freeze(
  Object.fromEntries(Object.entries(ALGORITHMS).map(([k, v]) => [k, v.engine]))
);

// Derived: set of Graphviz algorithm names
const GV_ALGORITHMS = new Set(
  Object.entries(ALGORITHMS).filter(([, v]) => v.engine === "Graphviz").map(([k]) => k)
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
});

// ── Directions ────────────────────────────────────────────────────────────────

const DIRECTIONS = Object.freeze([
  { val: "Left → Right", default: true },
  { val: "Right → Left" },
  { val: "Top → Bottom" },
  { val: "Bottom → Top" },
]);

// ELK direction values
const ELK_DIRECTION = Object.freeze({
  "Left → Right": "RIGHT",
  "Right → Left": "LEFT",
  "Top → Bottom": "DOWN",
  "Bottom → Top": "UP",
});

// Dagre / Graphviz rankdir values
const RANKDIR = Object.freeze({
  "Left → Right": "LR",
  "Right → Left": "RL",
  "Top → Bottom": "TB",
  "Bottom → Top": "BT",
});

// ── Ranking (Dagre only) ──────────────────────────────────────────────────────

const RANKING = Object.freeze([
  { val: "Balanced",    dagreRanker: "network-simplex", default: true },
  { val: "Uniform",     dagreRanker: "longest-path" },
  { val: "Top-aligned", dagreRanker: "tight-tree" },
]);

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
const RELATION_TYPE_IDS   = Object.freeze(Object.values(RELATION_TYPES).map(v => v.id));
const RELATION_WEIGHT_MAP = Object.freeze(Object.fromEntries(Object.values(RELATION_TYPES).map(v => [v.id, v.weight])));

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

const DIAGRAM_TYPES = Object.freeze([
  "diagram-model-group",
  "diagram-model-connection",
  "diagram-model-note",
  "diagram-model-image",
  "diagram-model-reference",
]);

// ── Constants ─────────────────────────────────────────────────────────────────

const GV_BIN_DEFAULT       = "dot";
const GENERATED_VIEW_FOLDER = "/_Generated";
const SESSION_FILENAME     = "_session.json";
const PT2PX                = 96 / 72;   // Graphviz: points → pixels
// Spline sampling: number of points per cubic Bézier segment
const SPLINE_SAMPLE_POINTS = 8;

// ── Preset schema defaults ────────────────────────────────────────────────────

const DEFAULT_PRESET = Object.freeze({
  name:      "",
  algorithm: "Layered",
  params: {
    direction:             "Left → Right",
    routing:               "Orthogonal",
    labelPosition:         "Middle",
    ranking:               "Balanced",
    reverseRelationTypes:  [],
    nestingRelationTypes:  [],
    innerSpacing:          20,
    padding:               20,
    sortContainers:        false,
    alignSameType:         false,
    showInEveryContainer:  false,
    layerSpacing:          180,
    elementSpacing:        40,
    elementWidth:          140,
    elementHeight:         60,
    maxWidth:              0,
    maxHeight:             0,
    aspectRatio:           0,
  },
  filter: {
    elementTypes:  [],
    relationTypes: [],
    diagramTypes:  [],
  },
  relatedElements: {
    layers: [],  // each: { depth: 1, elementTypes: [], relationTypes: [], diagramTypes: [] }
  },
  view: {
    name:   "",
    suffix: "",
    folder: "",
  },
});

// ── Engine parameter mapping (GUI param → engine param) ───────────────────────
// Each entry is a function (guiValue, preset) → plain object of engine-specific params.
// Adapters call mapParams(algorithm, preset.params) to get their engine options.

const ENGINE_MAPPING = Object.freeze({
  ELK: {
    Layered: {
      direction:    (v)    => ({ "elk.direction": ELK_DIRECTION[v] }),
      routing:      (v)    => ({
        "elk.edgeRouting": v === "Orthogonal" ? "ORTHOGONAL"
                          : v === "Straight"  ? "POLYLINE"
                          :                    "POLYLINE",
        ...(v === "Straight" ? { "elk.layered.unnecessaryBendpoints": "true" } : {}),
      }),
      layerSpacing: (v)    => ({ "elk.layered.spacing.nodeNodeBetweenLayers": String(v) }),
      elementSpacing:(v)   => ({ "elk.spacing.nodeNode": String(v) }),
      padding:      (v)    => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
      // nestingRelationTypes → handled as graph structure (parent-child), not an ELK option
    },
    Tree: {
      direction:     (v)   => ({ "elk.direction": ELK_DIRECTION[v] }),
      routing:       (v)   => ({
        "elk.edgeRouting": v === "Orthogonal" ? "ORTHOGONAL" : "POLYLINE",
      }),
      layerSpacing:  (v)   => ({ "elk.mrtree.spacing.nodePlacementBetweenLayers": String(v) }),
      elementSpacing:(v)   => ({ "elk.spacing.nodeNode": String(v) }),
      padding:       (v)   => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    Force:  { elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }) },
    Stress: { elementSpacing: (v) => ({ "elk.spacing.nodeNode": String(v) }) },
    Radial: {
      layerSpacing:  (v)   => ({ "elk.radial.radius": String(v) }),
      elementSpacing:(v)   => ({ "elk.spacing.nodeNode": String(v) }),
      padding:       (v)   => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    Grid: {
      elementSpacing:(v)   => ({ "elk.spacing.nodeNode": String(v) }),
      padding:       (v)   => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
    Pack: {
      elementSpacing:(v)   => ({ "elk.spacing.nodeNode": String(v) }),
      padding:       (v)   => ({ "elk.padding": `[top=${v},left=${v},bottom=${v},right=${v}]` }),
    },
  },

  Dagre: {
    Dagre: {
      direction:     (v)   => ({ rankdir: RANKDIR[v] }),
      ranking:       (v)   => ({ ranker: RANKING.find(r => r.val === v)?.dagreRanker ?? "network-simplex" }),
      layerSpacing:  (v)   => ({ ranksep: v }),
      elementSpacing:(v)   => ({ nodesep: v }),
    },
  },

  Graphviz: {
    Dot: {
      direction:     (v)   => ({ rankdir: RANKDIR[v] }),
      routing:       (v)   => ({ splines: _gvSplines(v) }),
      layerSpacing:  (v)   => ({ ranksep: v / PT2PX / (96 / 72) }),  // px → inches
      elementSpacing:(v)   => ({ nodesep: v / PT2PX / (96 / 72) }),
      padding:       (v)   => ({ pad: v / PT2PX / (96 / 72) }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
      maxHeight:     ()    => ({}),  // handled together with maxWidth
      aspectRatio:   (v)   => v > 0 ? { ratio: String(v) } : {},
    },
    Neato: {
      routing:       (v)   => ({ splines: _gvSplines(v) }),
      elementSpacing:(v)   => ({ sep: `+${v / 96}` }),
      padding:       (v)   => ({ pad: v / 96 }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
      aspectRatio:   (v)   => v > 0 ? { ratio: String(v) } : {},
    },
    FDP: {
      routing:       (v)   => ({ splines: _gvSplines(v) }),
      elementSpacing:(v)   => ({ sep: `+${v / 96}` }),
      padding:       (v)   => ({ pad: v / 96 }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
      aspectRatio:   (v)   => v > 0 ? { ratio: String(v) } : {},
    },
    SFDP: {
      routing:       (v)   => ({ splines: _gvSplines(v) }),
      elementSpacing:(v)   => ({ sep: `+${v / 96}` }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
      aspectRatio:   (v)   => v > 0 ? { ratio: String(v) } : {},
    },
    Twopi: {
      layerSpacing:  (v)   => ({ ranksep: v / 96 }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
      aspectRatio:   (v)   => v > 0 ? { ratio: String(v) } : {},
    },
    Circo: {
      elementSpacing:(v)   => ({ mindist: v / 96 }),
      maxWidth:      (v, p) => v > 0 ? { size: `${v / 96},${p.maxHeight > 0 ? p.maxHeight / 96 : 999}` } : {},
    },
  },
});

function _gvSplines(v) {
  switch (v) {
    case "Orthogonal":          return "ortho";
    case "Polyline":            return "polyline";
    case "Straight":            return "line";
    case "Spline (approximated)": return "spline";
    default:                    return "polyline";
  }
}

/**
 * Map a preset's params to engine-specific options for a given algorithm.
 * Only active params with a mapping function are applied.
 * @param {string} algorithmName
 * @param {Object} params  preset.params
 * @returns {Object} engine option object
 */
function mapParams(algorithmName, params) {
  const alg  = ALGORITHMS[algorithmName];
  if (!alg) return {};
  const map  = (ENGINE_MAPPING[alg.engine] || {})[algorithmName] || {};
  const out  = {};
  for (const key of alg.activeParams) {
    if (map[key] && params[key] !== undefined) {
      Object.assign(out, map[key](params[key], params));
    }
  }
  return out;
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

  // relatedElements
  if (raw.relatedElements && Array.isArray(raw.relatedElements.layers)) {
    preset.relatedElements.layers = raw.relatedElements.layers.map(layer => ({
      depth:         Number(layer.depth)         || 1,
      elementTypes:  Array.isArray(layer.elementTypes)  ? layer.elementTypes  : [],
      relationTypes: Array.isArray(layer.relationTypes) ? layer.relationTypes : [],
      diagramTypes:  Array.isArray(layer.diagramTypes)  ? layer.diagramTypes  : [],
    }));
  }

  // view
  if (raw.view && typeof raw.view === "object") {
    if (raw.view.name   !== undefined) preset.view.name   = String(raw.view.name);
    if (raw.view.suffix !== undefined) preset.view.suffix = String(raw.view.suffix);
    if (raw.view.folder !== undefined) preset.view.folder = String(raw.view.folder);
  }

  return preset;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    STYLES, ALGORITHMS, ALGO_ENGINE, GV_ALGORITHMS,
    ACTION, ROUTING,
    DIRECTIONS, ELK_DIRECTION, RANKDIR,
    RANKING, LABEL_POSITIONS, AR_OPTIONS,
    RELATION_TYPES, RELATION_TYPE_IDS, RELATION_WEIGHT_MAP,
    ELEMENT_TYPES, DIAGRAM_TYPES,
    GV_BIN_DEFAULT, GENERATED_VIEW_FOLDER, SESSION_FILENAME,
    PT2PX, SPLINE_SAMPLE_POINTS,
    DEFAULT_PRESET,
    ENGINE_MAPPING, mapParams,
    validatePreset,
  };
}
