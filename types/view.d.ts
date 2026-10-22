/**
 * View subsystem — shared data shapes for static checking (JSDoc + tsc).
 * Names follow Scripts/View/docs/SPEC.md § Vocabulary. Not loaded at runtime.
 */

// ── Rule lists (Scripts/View/lib/rel_filter.js) ──────────────────────────────────────────────────

type RuleKind = "element" | "diagram" | "relation" | "step" | "style";
type RuleMode = "include" | "exclude";

type ElementRule = {
  mode: RuleMode;
  elementType: string;
  property: string;
  value: string;
};

type DiagramRule = {
  mode: RuleMode;
  diagramType: string;
};

type RelationRule = {
  on: boolean;
  mode: RuleMode;
  source: string;
  relation: string;
  target: string;
  propertyOf: "relation" | "source" | "target";
  property: string;
  value: string;
  everyContainer: boolean;
};

type StepRule = {
  mode: RuleMode;
  previous: string;
  direction: "either" | "outgoing" | "incoming";
  relation: string;
  added: string;
  propertyOf: "added" | "relation" | "previous";
  property: string;
  value: string;
};

type StyleRule = {
  on: boolean;
  color: "element" | "relation" | "source" | "target";
  source: string;
  relation: string;
  target: string;
  propertyOf: "element" | "relation" | "source" | "target";
  property: string;
  colorRange: string;
};

interface RuleByKind {
  element: ElementRule;
  diagram: DiagramRule;
  relation: RelationRule;
  step: StepRule;
  style: StyleRule;
}
type AnyRule = RuleByKind[RuleKind];

/** Type ids a rule may name, per field group (built by defs.validatePreset). */
interface ValidTypeSets {
  elements: Set<string>;
  relations: Set<string>;
  diagrams: Set<string>;
  colorRanges: Set<string>;
}

/** Schema of one rule kind: defaults, which fields hold type ids, which hold enum values. */
interface RuleKindSpec<R> {
  defaults: R;
  types: Record<string, Exclude<keyof ValidTypeSets, "colorRanges">>;
  enums: Record<string, readonly string[]>;
}

/** Step candidate: one relation seen from one element of the previous step. */
interface StepCandidate {
  rel: ArchiRelation;
  /** The previous-step element. */
  frontier: ArchiElement;
  /** The element the relation would add. */
  other: ArchiElement;
  /** The previous-step element is the relation's source. */
  outgoing: boolean;
}

/** Anything with jArchi-style properties: concepts, visuals, or a Node-harness stand-in. */
interface PropertySource {
  prop(key: string): unknown;
}

// ── Presets (Scripts/View/lib/defs.js: DEFAULT_PRESET, validatePreset) ───────────────────────────

/** Repeat of a step: 1–5 runs, or until a run adds nothing (capped at REPEAT_MAX). */
type StepRepeat = 1 | 2 | 3 | 4 | 5 | "untilNothingNew";

/** Expand-selection step: run its rule list `repeat` times. */
interface Step {
  repeat: StepRepeat;
  rules: StepRule[];
}

type ViewSizeMode = "none" | "maxWidth" | "aspectRatio";
type ConnectionsMode = "Between containers" | "Crossing containers";

/** Layout params of a validated preset (DEFAULT_PRESET.params). */
type PresetParams = {
  direction: string;
  nodePlacement: string;
  routing: string;
  labelPosition: string;
  ranking: string;
  acyclicer: string;
  reverseRules: RelationRule[];
  nestingRules: RelationRule[];
  padding: number;
  diagramPadding: number;
  sortContainers: boolean;
  alignWidthSameType: boolean;
  snapColumnsToGrid: boolean;
  containerAlgorithm: string;
  connectionsMode: ConnectionsMode;
  layerSpacing: number;
  elementSpacing: number;
  connectionSpacing: number;
  connectionElementSpacing: number;
  elementWidth: number;
  elementHeight: number;
  maxWidth: number;
  aspectRatio: number;
  viewSizeMode: ViewSizeMode;
  labelSizing: boolean;
  labelMaxLineWidth: number;
  connectionLabelSpacing: boolean;
};

/**
 * The params an algorithm uses (defs.effectiveParams): inactive keys are absent, a view-size
 * param that is not the chosen mode is 0, and viewSizeMode itself is dropped.
 */
type EffectiveParams = Partial<Omit<PresetParams, "viewSizeMode">>;

/** Label-sizing tuning (defs.LABEL_SIZING_DEFAULTS, overridable in engineParams.layout). */
interface LabelSizing {
  labelCharWidth: number;
  labelLineHeight: number;
  labelHPadding: number;
  labelVPadding: number;
  labelMaxLineWidth: number;
  labelMinWidth: number;
  labelMinHeight: number;
}

/** Engine overrides passed through as-is; each adapter merges them over its own defaults. */
interface EngineParams {
  layout?: Partial<LabelSizing>;
  ELK?: Record<string, string | number | boolean>;
  Dagre?: Record<string, string | number>;
  Graphviz?: Record<string, string | number>;
}

interface ViewProperty {
  key: string;
  value: string;
  enabled: boolean;
}

/** A validated preset (defs.validatePreset). */
interface Preset {
  schemaVersion: number;
  name: string;
  algorithm: string;
  params: PresetParams;
  filter: {
    elementRules: ElementRule[];
    diagramRules: DiagramRule[];
    relationRules: RelationRule[];
  };
  relatedElements: { steps: Step[] };
  view: { name: string; folder: string; suffix: string };
  appearance: {
    styleByProperty: { rules: StyleRule[]; mixedValuesColor: string; lineWidth: number };
    nestingLevel: {
      fontEnabled: boolean;
      rootFontSize: number;
      rootFontBold: boolean;
      fontDecreasePerLevel: number;
      colorEnabled: boolean;
      rootColor: string;
      lightenPerLevel: number;
    };
    highlightRepeated: { enabled: boolean; colorRange: string };
  };
  engineParams: EngineParams;
  viewProperties: { addObjectId: boolean; properties: ViewProperty[] };
}

/** A preset after capability masking: params holds only what the algorithm uses. */
type MaskedPreset = Omit<Preset, "params"> & { params: EffectiveParams };

/**
 * Preset JSON as read from a file or the dialog, before validatePreset: untrusted, every field
 * optional and checked one by one. Typed loosely on purpose — this is the validation boundary.
 */
type PresetFile = { [key: string]: any };

// ── Algorithms (defs.ALGORITHMS) ─────────────────────────────────────────────────────────────────

type EngineName = "ELK" | "Dagre" | "Graphviz";

interface AlgorithmSpec {
  engine: EngineName;
  /** Engine-internal identifier, e.g. "layered", "dot". */
  engineAlgorithmId: string;
  /** Style group shown in the dialog (defs.STYLES). */
  style: string;
  supportsNesting: "full" | "partial" | "cluster" | "none";
  supportsSelfLoops: boolean | "partial";
  /** Param keys the dialog enables and effectiveParams keeps. */
  activeParams: readonly string[];
  /** Allowed values per select-type param. */
  supportedOptions: Readonly<Record<string, readonly string[]>>;
  labelPositionDefault: string | null;
  tooltip: string;
  /** Mutually exclusive params: key → keys it zeroes. */
  paramConflicts?: Readonly<Record<string, readonly string[]>>;
}
