/**
 * View subsystem — shared data shapes for static checking (JSDoc + tsc).
 * Names follow Scripts/View/docs/SPEC.md § Vocabulary. Not loaded at runtime.
 */

// ── Rule lists (Scripts/View/lib/rel_filter.js) ──────────────────────────────────────────────────

type RuleKind = "element" | "diagram" | "relation" | "step" | "style";
type RuleMode = "include" | "exclude";

type ElementRule = {
  on: boolean;
  mode: RuleMode;
  elementType: string;
  property: string;
  value: string;
};

type DiagramRule = {
  on: boolean;
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
  on: boolean;
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
  elementOrder: string;
  cycleElementOrder: boolean;
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

/** A validated preset (defs.validatePreset). A type alias, so it can be read by key. */
type Preset = {
  schemaVersion: number;
  name: string;
  /** Free text, kept when a preset file is read (preset_io). */
  description?: string;
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
};

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
  /**
   * Connections are routed between the elements, with Distance to element on both sides of the
   * line; the router gives up when elements are closer (Graphviz esep < sep). The dialog keeps
   * Element distance ≥ 2 × Distance to element.
   */
  connectionsBetweenElements?: boolean;
  /** Param keys the dialog enables and effectiveParams keeps. */
  activeParams: readonly string[];
  /** Allowed values per select-type param. */
  supportedOptions: Readonly<Record<string, readonly string[]>>;
  labelPositionDefault: string | null;
  tooltip: string;
  /** Mutually exclusive params: key → keys it zeroes. */
  paramConflicts?: Readonly<Record<string, readonly string[]>>;
}

// ── Selection pipeline (Scripts/View/lib/selection_pipeline.js) ─────────────────────────────────

/** A diagram object on a view: note, group, view reference, image, … or a diagram-model-connection. */
type DiagramObject = VisualObject | VisualConnection;

/** What buildObjectSet hands to the layout graph and the writer. */
interface ObjectSet {
  elements: ArchiElement[];
  relations: ArchiRelation[];
  /** Positional diagram objects (not diagram-model-connection). */
  diagramObjects: DiagramObject[];
  /** diagram-model-connection objects: laid out as edges between the objects they join. */
  diagramConnections: DiagramObject[];
  /** Element visuals already on the target view (Expand view / Layout only). */
  visualElements: VisualObject[];
  visualRelations: VisualConnection[];
  /** Target view for Expand view / Layout only. */
  existingView: ArchiView | null;
  visuals?: VisualDescription[];
  /** Diagram-blocks: visual id → id of the diagram object with contents it sits in (Expand view / Layout only). */
  diagramBlockOf?: Map<string, string>;
  /** Elements that appear only inside a diagram-block: element id → its visual there. */
  diagramBlockVisualOf?: Map<string, string>;
}

/** One expand-selection step's result (expandStepWithRelations). */
interface StepExpansion {
  added: ArchiElement[];
  rels: ArchiRelation[];
  cumulative: ArchiElement[];
  /** Runs that added elements. */
  runs: number;
  /** The run limit was reached while the last run still added elements. */
  capped: boolean;
  /** Every candidate the step saw, before its rules. */
  candidates: StepCandidate[];
}

interface StepCount {
  idx: number;
  elems: number;
  rels: number;
}

/** Predicted counts on the generated view (predictViewCounts); SPEC § Vocabulary. */
interface ViewCounts {
  elements: number;
  containers: number;
  nestedElements: number;
  standalones: number;
  extraOccurrences: number;
  relations: number;
  nestings: number;
  connections: number;
  diagramObjects: number;
}

/** One row of logCountBlock: counts by field name, a grouped row, or a separator. */
type CountRow = {
  label?: string;
  rule?: boolean;
  group?: { sublabel: string; fields: [string, number][] }[];
  [field: string]: unknown;
};

// ── Dialog rule tables (Scripts/View/lib/gui/rule_table.js) ─────────────────────────────────────

/** One choice of a "choice" column: the rule value and its label. */
interface RuleTableItem {
  value: string;
  label: string;
}

/** Per-rule counts shown in a rule table, by count key (column key or column `count`). */
type RuleTableCounts = Record<string, number | undefined>;

/** A "custom" cell: a controller the table drives instead of an SWT control. */
interface RuleTableCell {
  set(value: any): void;
  enable(on: boolean): void;
  setToolTipText?(text: string): void;
}

/** Fields every rule-table column has (the column kinds are documented at ruleTable). R: the rule shape. */
interface RuleTableColumnBase<R> {
  /** Rule field; count / warn columns: the count key or a placeholder. */
  key: string;
  header?: string;
  tooltip?: string;
  width?: number;
  /** Grid cells the column uses (custom: more than one). */
  cells?: number;
  optional?: boolean;
  enabled?: (rule: R) => boolean;
  onChange?: (rule: R) => void;
  /** Count key shown after the selected item (choice, prop) or in the cell (count). */
  count?: string;
}

interface RuleTableChoiceColumn<R = AnyRule> extends RuleTableColumnBase<R> {
  kind: "choice";
  items: readonly RuleTableItem[];
}

interface RuleTableCustomColumn<R = AnyRule> extends RuleTableColumnBase<R> {
  kind: "custom";
  create: (parent: Swt.Composite, value: any, onChange: (value: any) => void) => RuleTableCell;
}

interface RuleTablePlainColumn<R = AnyRule> extends RuleTableColumnBase<R> {
  kind: "check" | "prop" | "value" | "count" | "warn";
  /** check: false = unchecked when the rule has no value. */
  default?: boolean;
  /** count: the cell text for n (default "(n)"). */
  format?: (n: number) => string;
}

type RuleTableColumn<R = AnyRule> = RuleTableChoiceColumn<R> | RuleTableCustomColumn<R> | RuleTablePlainColumn<R>;

interface RuleTableOptions<K extends RuleKind> {
  kind: K;
  columns: readonly RuleTableColumn<RuleByKind[K]>[];
  /** At least the default rule (= keep everything); hands back [] for it. */
  filterList?: boolean;
  propCondition?: boolean;
  /** An empty feature list shows the default rule switched off. */
  placeholder?: boolean;
  onChange?: () => void;
  onLayout?: () => void;
  propItems?: (rule: RuleByKind[K], key: string) => string[];
  valueItems?: (rule: RuleByKind[K], key: string) => string[];
  rowTooltip?: (rule: RuleByKind[K]) => string;
  emptyText?: string;
  addTooltip?: string;
  footer?: (footer: Swt.Composite) => void;
}

/** The controller ruleTable returns. */
interface RuleTable<K extends RuleKind> {
  getRules(): RuleByKind[K][];
  setRules(list: readonly Partial<RuleByKind[K]>[] | null | undefined): void;
  displayedRules(): RuleByKind[K][];
  setCounts(list: RuleTableCounts[] | null | undefined): void;
  setWarnings(map: Map<number, string> | null | undefined): void;
  refreshItems(): void;
  enable(on: boolean): void;
  footer: Swt.Composite;
  /** Not an SWT control: code that sets tooltips on a mix of widgets checks for it. */
  setToolTipText?: undefined;
}
