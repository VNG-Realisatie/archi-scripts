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
  /** Room a container's label takes above its contents (px): Archi's text margin, its lines in its font and the gap below them (label_size.containerLabelRoom); 0 for a node that holds none or a label without text. */
  labelHeight: number;
  /** The narrowest a container may be for its label: the widest piece of it Archi does not break, with its text margin and the type icon (label_size.narrowestForLabel); 0 for a leaf. */
  minWidth: number;
  /** Parent occurrence id (nesting), or null at the root. */
  parent: string | null;
}

/** A font as a label is drawn with it: as jArchi reads a visual's font. */
interface TextFont {
  name: string;
  /** Points. */
  size: number;
  /** jArchi fontStyle: "normal", "bold", "italic" or "bolditalic". */
  style: string;
}

/**
 * One line of text as Archi draws it in a font (px): its width, the line height, and `em`, the font
 * size (its points at the screen's dpi), about the height of the visible text. null = Archi's default
 * view font. Archi measures with SWT (lib/text_measure.js), the Node harness estimates
 * (tools/text_measure_node.js).
 */
type TextMeasure = (text: string, font: TextFont | null) => { width: number; height: number; em: number };

/**
 * Where Archi may break a line of label text: the offsets after which a new line can start, ascending,
 * the text's length last. Archi: Java's line BreakIterator, as draw2d's text flow takes it
 * (lib/text_measure.js); the Node harness follows its rules (tools/text_measure_node.js).
 */
type LineBreaks = (text: string) => number[];

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
  /** Size of the label's text in the connection's font (px): its widest line, and its lines × the font size (the visible text); 0 without a label. */
  labelWidth: number;
  labelHeight: number;
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
  columnsAcrossContainers: boolean;
  /** How the boxes are sorted (defs.SORT_MODE); undefined where the algorithm has no Sort (directed views). */
  sort?: string;
  /** Occurrence id → parent occurrence id (container-ness is derived from this; Scripts/View/AGENTS.md). */
  _parentMap: Record<string, string>;
  _parentRels: ParentRel[];
  /** Element id → its occurrence ids. */
  _occurrenceMap: Record<string, string[]>;
  _nesting: NestingResolution;
  /** A container's labelHeight at a width the engine drew it (label_size.js); not passed to the adapter. */
  _labelHeightAt: (nodeId: string, width: number) => number;
  /** The width a container needs when drawn at a width: wider when its label's first line, as Archi wraps it, runs under the type icon (label_size.clearOfIcon); not passed to the adapter. */
  _widthAt: (nodeId: string, width: number) => number;
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

/** Scripts/View/config.default.js with the machine's config.js over it (lib/view_config.js): the programs a run starts. */
interface ViewConfig {
  nodePath: string;
  dotPath: string;
}

/** Where the layout runs (lib/node_layout.js). */
interface LayoutRuntime {
  /** Starts `node` and `dot` from the config's paths (view_config.programRunner). */
  runProcess: ProcessRunner;
  /** Passed on to the Node layout process, whose runner starts `dot`. */
  config: ViewConfig;
  /** The adapter runs in the script itself, not in a Node layout process (the harness's --in-process). */
  inProcess: boolean;
  /** Measures label text for the layout graph: SWT in Archi, an estimate in Node. */
  measureText: TextMeasure;
  /** Where Archi breaks label text: Java's BreakIterator in Archi, its rules in Node. */
  lineBreaks: LineBreaks;
  /** Archi's default view font: FontFactory's in Archi, a fresh Archi's in Node. */
  defaultFont: TextFont;
  /** How Archi creates a new element visual: its preferences in Archi, a fresh Archi's in Node. */
  newVisual: NewVisualDefaults;
}

/**
 * How Archi creates a new element visual (ArchimateDiagramModelFactory): Preferences › Appearance ›
 * ArchiMate Figures. A grouping is always left-aligned (GroupingUIProvider), whatever the preference.
 */
interface NewVisualDefaults {
  /** Default text alignment of an ArchiMate figure (ITextAlignment). */
  textAlignment: number;
  /** Default text position of an ArchiMate figure (ITextPosition). */
  textPosition: number;
  /** The figure type Archi gives a new visual of a jArchi element type (0 or 1). */
  figureTypeOf(type: string): number;
}

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
  /** Nesting relations below the algorithm's nesting levels: drawn as connections. */
  deepNestingRels: ArchiRelation[];
}

// ── Adapter internals shared through engine-utils ────────────────────────────────────────────────

/**
 * Translates one preset param into engine options. Each mapper knows its own value type, so the
 * parameter is declared bivariantly (method form) rather than as unknown.
 */
type ParamMapper = { map(value: any, opts: EffectiveParams): Record<string, unknown> }["map"];
/** algorithm name → param key → mapper (each adapter's PARAM_MAPPING). */
type ParamMapping = Record<string, Record<string, ParamMapper>>;
