/**
 * Shared definitions for the View subsystem.
 *
 * Single source of truth for all IDs, labels, tooltips, defaults, and option lists.
 * No imports — pure data. Consumed by include_view.js (engine) and _GUI.ajs (rendering).
 *
 * Conventions:
 *   ALGO, ACTION, ROUTING   — Object.freeze maps: key → { id, label, tooltip, ... }
 *   ELEMENT_TYPES           — array of element type id strings
 *   RELATION_TYPES          — Object.freeze map: key → { id, label, weight }
 *   DIRECTIONS, RANKERS,
 *   LABEL_POSITIONS, AR_OPTIONS — ordered arrays of { val, label, [tooltip], [default] }
 *   DEFAULTS                — single combined defaults object, values derived from markers above
 */
console.log("include_view_defs.js");

// ── Algorithm definitions ─────────────────────────────────────────────────────
// Each entry: id (param value), label (GUI button), tooltip, engine, group, default.
// Definition order controls button order within each group; group order follows
// first appearance of each group name.

const ALGO = Object.freeze({
  ELK_LAYERED:     { id: "layered",     label: "Layered", engine: "elk",      group: "Flow",      default: true,
    tooltip: "Process models, application flows, service interactions with strong directionality and nested containers (ELK)" },
  ELK_MRTREE:      { id: "mrtree",      label: "Tree",    engine: "elk",      group: "Hierarchy",
    tooltip: "Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK)" },
  ELK_FORCE:       { id: "force",       label: "Force",   engine: "elk",      group: "Network",
    tooltip: "Application landscapes and integration networks emphasising emergent connectivity without nesting (ELK)" },
  ELK_STRESS:      { id: "stress",      label: "Stress",  engine: "elk",      group: "Network",
    tooltip: "Dependency maps and impact analysis emphasising relational distance (ELK)" },
  ELK_RADIAL:      { id: "radial",      label: "Radial",  engine: "elk",      group: "Circular",
    tooltip: "Domain overviews and hub-and-spoke structures with strong nesting support (ELK)" },
  ELK_BOX:         { id: "box",         label: "Grid",    engine: "elk",      group: "Compact",
    tooltip: "Portfolio overviews, catalogs and inventories with strong nesting support (ELK)" },
  ELK_RECTPACKING: { id: "rectpacking", label: "Pack",    engine: "elk",      group: "Compact",
    tooltip: "High-level landscape summaries and grouped overviews with strong nesting support (ELK)" },
  DAGRE:           { id: "dagre",       label: "Dagre",   engine: "dagre",    group: "Flow",
    tooltip: "Fast process and application flows with limited nesting support (Dagre)" },
  GV_DOT:          { id: "dot",         label: "Dot",     engine: "graphviz", group: "Flow",
    tooltip: "Structured process models and dependency flows with strong nesting support (Graphviz)" },
  GV_NEATO:        { id: "neato",       label: "Neato",   engine: "graphviz", group: "Network",
    tooltip: "Integration networks and application landscapes with partial nesting support (Graphviz)" },
  GV_FDP:          { id: "fdp",         label: "FDP",     engine: "graphviz", group: "Network",
    tooltip: "Clustered integration networks with partial nesting support (Graphviz)" },
  GV_SFDP:         { id: "sfdp",        label: "SFDP",    engine: "graphviz", group: "Network",
    tooltip: "Large-scale integration networks and dependency maps without nesting support (Graphviz)" },
  GV_TWOPI:        { id: "twopi",       label: "Twopi",   engine: "graphviz", group: "Circular",
    tooltip: "Radial hierarchies like organisation charts and capability maps with limited nesting support (Graphviz)" },
  GV_CIRCO:        { id: "circo",       label: "Circo",   engine: "graphviz", group: "Circular",
    tooltip: "Cyclic dependency and domain overviews with limited nesting support (Graphviz)" },
});

// Derived: set of Graphviz algorithm IDs (from engine field — no separate maintenance)
const GV_ALGORITHMS = new Set(Object.values(ALGO).filter(v => v.engine === "graphviz").map(v => v.id));

// Tooltips for the algorithm group category labels in the GUI (Flow:, Hierarchy:, etc.)
const ALGO_GROUP_TOOLTIPS = Object.freeze({
  Flow:      "Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models.",
  Hierarchy: "Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition.",
  Network:   "Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks.",
  Circular:  "Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures.",
  Compact:   "Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries.",
});

// ── Action definitions ────────────────────────────────────────────────────────

const ACTION = Object.freeze({
  GENERATE_SINGLE:   { id: "Generate",         label: "New view",      default: true,
    tooltip: "Creates or updates a single view from the selected elements and their relations. Use 'View name' to set the view title." },
  GENERATE_MULTIPLE: { id: "GenerateMultiple", label: "One view each",
    tooltip: "Creates one view per selected element. Each view is named after its element." },
  EXPAND_HERE:       { id: "Expand",           label: "Expand view",
    tooltip: "Adds elements related to the current selection to the open view. Existing elements are kept in place." },
  LAYOUT:            { id: "Layout",           label: "Re-layout",
    tooltip: "Re-lays out all elements on the selected view. No elements or relations are added or removed." },
});

// ── Routing style definitions ─────────────────────────────────────────────────

const ROUTING = Object.freeze({
  ORTHOGONAL: { id: "ORTHOGONAL", label: "Orthogonal", default: true,
    tooltip: "Draws relation lines with right-angle bends. Best results with Layered layout." },
  POLYLINE:   { id: "POLYLINE",   label: "Polyline",
    tooltip: "Draws relation lines with diagonal bends. Works with all algorithms." },
  STRAIGHT:   { id: "STRAIGHT",   label: "Straight",
    tooltip: "Draws relation lines as straight lines." },
  CURVED:     { id: "CURVED",     label: "Curved",
    tooltip: "Smooth curves (Graphviz only). Note: may fall back to straight lines with the Dot engine — use Spline instead for reliable curves." },
  SPLINE:     { id: "SPLINE",     label: "Spline",
    tooltip: "Graphviz B-splines — the classic curved Graphviz look. Most reliable curved option with the Dot engine (Graphviz only)." },
});

// ── Ordered combo option arrays ───────────────────────────────────────────────
// Each array is the single definition for its concept — order, label, val, default marker.

const DIRECTIONS = Object.freeze([
  { val: "RIGHT", label: "Right", default: true },
  { val: "DOWN",  label: "Down"                 },
  { val: "UP",    label: "Up"                   },
  { val: "LEFT",  label: "Left"                 },
]);
const DIRECTIONS_TOOLTIP = "Flow direction for layered and tree algorithms.";

const RANKERS_TOOLTIP = "Row arrangement strategy for the Dagre algorithm. Only active when Dagre is selected.";
const RANKERS = Object.freeze([
  { val: "network-simplex", label: "Balanced",    default: true },
  { val: "tight-tree",      label: "Uniform"                    },
  { val: "longest-path",    label: "Top-aligned"                },
]);

const LABEL_POSITIONS_TOOLTIP =
  "Where to place relation labels along the line.\n" +
  "Auto: uses the algorithm's computed position — Graphviz uses its external label\n" +
  "      point (xlabel), ELK and Dagre use the connection path midpoint.\n" +
  "Middle: places label at the middle bendpoint; adjusts to avoid element overlap.\n" +
  "Source / Target: fixed position for all relations.\n" +
  "Only active for algorithms that route relations.";
const LABEL_POSITIONS = Object.freeze([
  { val: "auto",   label: "Auto"   },
  { val: "source", label: "Source" },
  { val: "middle", label: "Middle", default: true },
  { val: "target", label: "Target" },
]);

const AR_OPTIONS = Object.freeze([
  { val: 0.00, label: "free"             },
  { val: 3.00, label: "3:1  landscape"   },
  { val: 2.00, label: "2:1  wide"        },
  { val: 1.78, label: "16:9  widescreen" },
  { val: 1.33, label: "4:3  classic"     },
  { val: 1.25, label: "5:4"              },
  { val: 1.00, label: "1:1  square"      },
  { val: 0.80, label: "4:5"              },
  { val: 0.75, label: "3:4  portrait"    },
  { val: 0.56, label: "9:16  portrait"   },
  { val: 0.50, label: "1:2  tall"        },
  { val: 0.33, label: "1:3  very tall"   },
]);

// ── Relation type definitions ─────────────────────────────────────────────────
// id: ArchiMate type string used in params and arrays
// label: display name for GUI checkboxes and filter lists
// weight: relative pull strength for weight-driven layout (elk.priority)

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

// ── Element type identifiers ──────────────────────────────────────────────────
// Used for element type filter validation and GUI list builder available items.

const ELEMENT_TYPES = [
  "application-collaboration",
  "application-component",
  "application-event",
  "application-function",
  "application-interaction",
  "application-interface",
  "application-process",
  "application-service",
  "artifact",
  "assessment",
  "business-actor",
  "business-collaboration",
  "business-event",
  "business-function",
  "business-interaction",
  "business-interface",
  "business-object",
  "business-process",
  "business-role",
  "business-service",
  "canvas-model-block",
  "canvas-model-image",
  "canvas-model-sticky",
  "capability",
  "communication-network",
  "constraint",
  "contract",
  "course-of-action",
  "data-object",
  "deliverable",
  "device",
  "diagram-model-connection",
  "diagram-model-group",
  "diagram-model-image",
  "diagram-model-note",
  "diagram-model-reference",
  "distribution-network",
  "driver",
  "equipment",
  "facility",
  "gap",
  "goal",
  "grouping",
  "implementation-even",
  "junction",
  "location",
  "material",
  "meaning",
  "node",
  "outcome",
  "path",
  "plateau",
  "principle",
  "product",
  "representation",
  "requirement",
  "resource",
  "sketch-model-actor",
  "sketch-model-sticky",
  "stakeholder",
  "system-software",
  "technology-collaboration",
  "technology-event",
  "technology-function",
  "technology-interaction",
  "technology-interface",
  "technology-process",
  "technology-service",
  "value",
  "work-package",
];

// ── Defaults ──────────────────────────────────────────────────────────────────
// Single combined defaults object — replaces both DEFAULTS and DEFAULT_PRESET.
// String fields derived from the default markers in the concept definitions above.

const DEFAULTS = Object.freeze({
  action:          Object.values(ACTION).find(v => v.default).id,
  algorithm:       Object.values(ALGO).find(v => v.default).id,
  layoutDirection: DIRECTIONS.find(v => v.default).val,
  edgeRouting:     Object.values(ROUTING).find(v => v.default).id,
  graphvizSplines: Object.values(ROUTING).find(v => v.default).id,
  graphvizEngine:  ALGO.GV_DOT.id,
  labelPosition:   LABEL_POSITIONS.find(v => v.default).val,
  dagreRanker:     RANKERS.find(v => v.default).val,
  nodePlacement:   "NONE",
  graphvizBin:     "dot",
  nodeWidth:       140,
  nodeHeight:      60,
  graphDepth:      1,
  nodeSpacing:     40,
  layerSpacing:    180,
  padding:         20,
  // preset fields (previously DEFAULT_PRESET)
  includeElementType:         [],
  includeRelationType:        [],
  excludeFromView:            false,
  layoutReversed:             [],
  layoutNested:               [],
  nestingMultipleOccurrences: false,
  viewName:                   "",
  viewNameSuffix:             "",
  viewFolder:                 "",
  nestedAlgorithm:            "",
  nestedNodeSpacing:          40,
  nestedAspectRatio:          0,
  sameTypeResize:             false,
  sortLeavesOnly:             false,
  useRelationWeights:         false,
  viewMaxWidth:               0,
  viewMaxHeight:              0,
  viewAspectRatio:            0,
  debug:                      false,
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ALGO, GV_ALGORITHMS, ALGO_GROUP_TOOLTIPS,
    ACTION,
    ROUTING,
    DIRECTIONS, DIRECTIONS_TOOLTIP, RANKERS, RANKERS_TOOLTIP,
    LABEL_POSITIONS, LABEL_POSITIONS_TOOLTIP, AR_OPTIONS,
    RELATION_TYPES, ELEMENT_TYPES,
    DEFAULTS,
  };
}
