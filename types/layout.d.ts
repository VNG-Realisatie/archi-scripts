/**
 * View subsystem — engine contract: layout(LayoutGraph) → LayoutResult (SPEC §8, appendix
 * "Layout graph and result"), plus the nesting resolution the graph carries. Not loaded at runtime.
 * Adapters (engines/*.js) see only these shapes: no $, no selection, no view (Scripts/View/AGENTS.md).
 */

/** One occurrence of an element (or a diagram object) to place. */
interface LayoutNode {
  /** Occurrence id: the element id for the first occurrence, `<element id>_occ_N` for extra ones. */
  id: string;
  label: string;
  elementType: string;
  /** Leaf size; the engine sizes containers from their children. */
  width: number;
  height: number;
  /** Parent occurrence id (nesting), or null at the root. */
  parent: string | null;
}

/** One relation to route, between two occurrences. */
interface LayoutEdge {
  /** Unique per edge: the relation id, or `<relation id>_N` for its extra connections; a diagram connection's own id. */
  id: string;
  /** The model relation id; for a diagram connection (a note's line) its own id. */
  conceptId: string;
  /** Occurrence ids; already swapped for reversed relation types. */
  source: string;
  target: string;
  label: string;
  /** Layout weight per relation type (defs.RELATION_WEIGHT_MAP). */
  weight: number;
}

interface LayoutGraph {
  algorithm: string;
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  /** The algorithm's active params (defs.effectiveParams). */
  options: EffectiveParams;
  engineParams: EngineParams;
  alignWidthSameType: boolean;
  snapColumnsToGrid: boolean;
  sortContainers: boolean;
  /** Occurrence id → parent occurrence id (container-ness is derived from this; Scripts/View/AGENTS.md). */
  _parentMap: Record<string, string>;
  _parentRels: ParentRel[];
  /** Element id → its occurrence ids. */
  _occurrenceMap: Record<string, string[]>;
  _nesting: NestingResolution;
  /** Edges with an end inside a diagram-block: edge id → the visual at that end (layout direction). */
  _diagramBlockEnds: Map<string, { source: string | null; target: string | null }>;
  _nestingStats: { candidates: number; applied: number; circularNestings: number; notNestedNestings: number };
}

interface Point {
  x: number;
  y: number;
}

/** An element's box on the canvas, absolute coordinates. */
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A placed node, absolute coordinates. */
interface LayoutResultNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  parentId: string | null;
}

/** A routed edge, absolute bendpoints. */
interface LayoutResultEdge {
  id: string;
  conceptId: string;
  sourceId: string;
  targetId: string;
  bendpoints: Point[];
  isStraight: boolean;
  /** Label position; 0,0 = no placement. */
  labelX: number;
  labelY: number;
  /** ELK, Graphviz: the connection's exit and entry points on the elements (absolute). */
  srcPort?: Point;
  tgtPort?: Point;
}

interface LayoutResult {
  nodes: LayoutResultNode[];
  edges: LayoutResultEdge[];
  /** Natural bounding box. */
  viewWidth: number;
  viewHeight: number;
}

/** An engine adapter (engines/elk.js, dagre.js, graphviz.js). Only an engine that starts a process uses `runProcess`. */
interface LayoutAdapter {
  layout(graph: LayoutGraph, runProcess: ProcessRunner): LayoutResult;
  /** Settings outside the dialog: one finding per key of the engine's engineParams section. */
  checkEngineParams(preset: MaskedPreset): SettingFinding[];
}

/** How a process run ended; `exitCode` is meaningful for "finished" only. */
interface ProcessOutcome {
  state: "finished" | "timeout" | "not-found";
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Runs `command` with `args`, `input` on its standard input, and stops it after `timeoutSeconds`.
 * Java ProcessBuilder in Archi (lib/process_runner.js), child_process in Node (tools/process_runner_node.js);
 * both pass input and output through temp files and delete them again. Never throws for the three states.
 */
type ProcessRunner = (command: string, args: string[], input: string, timeoutSeconds: number) => ProcessOutcome;

// ── Nesting resolution (nesting.resolveNesting) ───────────────────────────────────────

/** A nesting relation bound to the occurrences at its two ends. */
interface ParentRel {
  rel: ArchiRelation;
  /** Occurrence drawn at rel.source's end. */
  srcOccId: string;
  /** Occurrence drawn at rel.target's end. */
  tgtOccId: string;
}

/** One element visual on the target view, classified (selection_read.describeVisuals). */
interface VisualDescription {
  id: string;
  /** The element; null for a note, group or view reference. */
  conceptId: string | null;
  parentVisualId: string | null;
  /** Container element ids up to the view root. */
  chain: string[];
  managed: boolean;
}

/** Pairing of occurrences with the visuals on the view. */
interface VisualPairing {
  /** Occurrence id → visual id. */
  visualOf: Record<string, string>;
  /** Visual id → occurrence id. */
  occurrenceOf: Map<string, string>;
  removedVisualIds: string[];
  /** Occurrences that are managed after the run. */
  managedOccs: Set<string>;
  /** User visuals the settings place nowhere: laid out at view root. */
  userAtRoot: number;
}

interface NestingResolution extends VisualPairing {
  parentMap: Record<string, string>;
  occurrenceMap: Record<string, string[]>;
  parentRels: ParentRel[];
  circularNestingRels: ArchiRelation[];
  cycles: { elements: ArchiElement[]; rels: ArchiRelation[] }[];
  notNestedNestingRels: ArchiRelation[];
}

// ── Adapter internals shared through engine-utils ────────────────────────────────────────────────

/**
 * Translates one preset param into engine options. Each mapper knows its own value type, so the
 * parameter is declared bivariantly (method form) rather than as unknown.
 */
type ParamMapper = { map(value: any, opts: EffectiveParams): Record<string, unknown> }["map"];
/** algorithm name → param key → mapper (each adapter's PARAM_MAPPING). */
type ParamMapping = Record<string, Record<string, ParamMapper>>;
