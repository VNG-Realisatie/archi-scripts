/**
 * View subsystem — shared data shapes for static checking (JSDoc + tsc).
 * Names follow Scripts/View/docs/SPEC.md § Vocabulary. Not loaded at runtime.
 */

// ── Condition lists (Scripts/View/lib/rel_filter.js) ──────────────────────────────────────────────────

type ConditionKind = "element" | "diagram" | "relation" | "step" | "style" | "nestingStyle";
type ConditionMode = "include" | "exclude";

type ElementCondition = {
  on: boolean;
  mode: ConditionMode;
  elementType: string;
  property: string;
  value: string;
};

type DiagramCondition = {
  on: boolean;
  mode: ConditionMode;
  diagramType: string;
};

type RelationCondition = {
  on: boolean;
  mode: ConditionMode;
  source: string;
  relation: string;
  target: string;
  propertyOf: "relation" | "source" | "target";
  property: string;
  value: string;
  everyContainer: boolean;
};

type StepCondition = {
  on: boolean;
  mode: ConditionMode;
  previous: string;
  direction: "either" | "outgoing" | "incoming";
  relation: string;
  added: string;
  propertyOf: "added" | "relation" | "previous";
  property: string;
  value: string;
};

type StyleCondition = {
  on: boolean;
  color: "element" | "relation" | "source" | "target";
  source: string;
  relation: string;
  target: string;
  propertyOf: "element" | "relation" | "source" | "target";
  property: string;
  colorRange: string;
};

type NestingStyleCondition = {
  on: boolean;
  parent: string;
  direction: "either" | "outgoing" | "incoming";
  relation: string;
  /** A type id, "" = All, "same" = the parent's type. */
  child: string;
  /** A colour name of the chosen palette; "" = Default (the element type's default fill). */
  color: string;
  /** Font size (pt) of the container where the condition starts; 0 = continue from the parent. */
  fontSize: number;
  /** Bold for the container where the condition starts. */
  bold: boolean;
};

interface ConditionByKind {
  element: ElementCondition;
  diagram: DiagramCondition;
  relation: RelationCondition;
  step: StepCondition;
  style: StyleCondition;
  nestingStyle: NestingStyleCondition;
}
type AnyCondition = ConditionByKind[ConditionKind];

/** A palette: a named list of named colours (presets/_palettes.json, Scripts/View/lib/palettes.js). */
interface Palette {
  name: string;
  colors: { name: string; hex: string }[];
}

/** One choice of a colour picker (gui/widgets.js colorPicker). colors: one hex = a swatch, several = a gradient, none = an empty frame. */
interface ColorPickerItem { value: string; label: string; colors: readonly string[] }
interface ColorPickerOptions {
  items: () => readonly ColorPickerItem[];
  /** The item shown for a value that is not among the items. */
  missing: (value: string) => ColorPickerItem;
  value: string;
  onChange: (value: string) => void;
  tooltip?: string;
  /** End the menu with "Other…": the system colour dialog, chosen as a hex value. */
  other?: boolean;
  /** px; default 16. */
  swatchWidth?: number;
  /** Button width hint (px), so the layout does not shift with the chosen label. */
  width?: number;
}
/** The controller colorPicker returns; also a condition-table cell. */
interface ColorPicker extends ConditionTableCell {
  button: Swt.Button;
  get(): string;
  set(value: string): void;
  refresh(): void;
}

/** Options of a tree picker (gui/widgets.js treePicker): names are "name" or "folder/sub/name". */
interface TreePickerOptions {
  items: () => readonly string[];
  onChange: (name: string) => void;
  tooltip?: string;
  /** Top-level names shown above the folders (e.g. Default). */
  first?: readonly string[];
}
/** The controller treePicker returns. */
interface TreePicker {
  button: Swt.Button;
  get(): string;
  set(name: string): void;
}
/** One folder in a tree picker's pop-up: its path, sub-folders by label, and the names it holds. */
interface TreePickerFolder { path: string; folders: Map<string, TreePickerFolder>; names: string[] }

/** Type ids a condition may name, per field group (built by defs.validatePreset). */
interface ValidTypeSets {
  elements: Set<string>;
  relations: Set<string>;
  diagrams: Set<string>;
  colorRanges: Set<string>;
}

/** Schema of one condition kind: defaults, which fields hold type ids, which hold enum values. */
interface ConditionKindSpec<R> {
  defaults: R;
  types: Record<string, Exclude<keyof ValidTypeSets, "colorRanges">>;
  enums: Record<string, readonly string[]>;
  /** Extra values a type field accepts besides type ids (nestingStyle child: "same"). */
  specials?: Record<string, readonly string[]>;
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

/** Expand-selection step: run its condition list `repeat` times. */
interface Step {
  name: string; // "" = shown as Step N
  repeat: StepRepeat;
  conditions: StepCondition[];
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
  reverseConditions: RelationCondition[];
  nestingConditions: RelationCondition[];
  padding: number;
  diagramPadding: number;
  sort: string;
  algorithmStart: string;
  cycleAlgorithmStart: boolean;
  alignWidthSameType: boolean;
  columnsAcrossContainers: boolean;
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
  /** No setting applies: every key is reported as unknown. */
  Tiles?: Record<string, string | number | boolean>;
}

/** One engineParams key checked before a run (Settings outside the dialog); problem null = it applies. */
interface SettingFinding {
  key: string;
  value: unknown;
  problem: string | null;
  /** The value the run uses without the key, where the adapter knows it. */
  without?: unknown;
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
    elementConditions: ElementCondition[];
    diagramConditions: DiagramCondition[];
    relationConditions: RelationCondition[];
  };
  relatedElements: { steps: Step[] };
  view: { name: string; folder: string; suffix: string };
  appearance: {
    /** Name of a palette in presets/_palettes.json; "" = none. */
    palette: string;
    styleByProperty: { conditions: StyleCondition[]; mixedValuesColor: string; lineWidth: number };
    nestingLevel: {
      conditions: NestingStyleCondition[];
      fontEnabled: boolean;
      fontDecreasePerLevel: number;
      colorEnabled: boolean;
      darkenStart: number;
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

type EngineName = "ELK" | "Dagre" | "Graphviz" | "Tiles";

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

// ── Selection pipeline (Scripts/View/lib/selection_pipeline.js, selection_read.js, nesting.js) ─────────────────────────────────

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
  /** Where every object on the target view sits (ExistingView.positions). */
  positions: Map<string, VisualPosition>;
  visuals?: VisualDescription[];
  /** Diagram-blocks: visual id → id of the diagram object with contents it sits in (Create: only diagram-blocks the diagram filter keeps). */
  diagramBlockOf?: Map<string, string>;
  /** What each diagram-block holds (Snapshot.blockContents). */
  blockContents?: Map<string, BlockContents>;
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
  /** Every candidate the step saw, before its conditions. */
  candidates: StepCandidate[];
}

interface StepCount {
  idx: number;
  elems: number;
  rels: number;
  /** Runs that added elements. */
  runs: number;
  /** The run limit was reached while the last run still added elements. */
  capped: boolean;
}

/** The relations of an element, incoming and outgoing, in the order jArchi's rels() gives them. */
type RelationIndex = (element: ArchiElement) => ArchiRelation[];

/** Where an object on the target view sits before the run. */
interface VisualPosition {
  /** The visual it sits in: an element, a group or a note; null at view root. */
  parentId: string | null;
  /** Relative to the parent. */
  bounds: Bounds;
}

/** The target view of a Modify action and what is on it; empty for the Create actions. */
interface ExistingView {
  existingView: ArchiView | null;
  visualElements: VisualObject[];
  visualRelations: VisualConnection[];
  /** Every object on the target view except the connections: visual id → where it sits. */
  positions: Map<string, VisualPosition>;
  /** The view was picked in the model tree, not on the canvas. */
  viewFromTree?: boolean;
}

/**
 * What the pipeline reads from the model for one action, read once: by readSelection from the
 * Archi selection, by the harness from a .archimate file. Concepts and visuals are jArchi proxies
 * in Archi and look-alike records in Node; pure code reads only ids, types, names, ends,
 * concepts and prop(). composeObjectSet works on it without reading again.
 */
interface Snapshot {
  /** Model elements of the selection, views expanded, in selection order. */
  elements: ArchiElement[];
  /** Diagram objects of the selection (Expand view: of the whole view). */
  diagramObjects: DiagramObject[];
  /** Relations per element; each element is read at most once. */
  relationsOf: RelationIndex;
  /** The target view and its visuals (Expand view / Layout only; empty otherwise). */
  existing: ExistingView;
  /** Diagram-blocks of the view read (Modify: the target view; Create: the selected view or the canvas selection's view): visual id → id of the diagram object with contents it sits in. */
  diagramBlockOf: Map<string, string>;
  /** What each diagram-block holds, by diagram-block id: what a Create action copies with it. */
  blockContents: Map<string, BlockContents>;
  /** Create: the element visuals of the view read, to find the elements only inside a diagram-block; [] for Modify (existing.visualElements). */
  sourceVisualElements: VisualObject[];
  /** Every element visual on the target view, described (describeVisuals); [] for a new view. */
  visuals: VisualDescription[];
}

/** Everything inside one diagram-block, as read. */
interface BlockContents {
  /** Parents first: each visual, the visual it sits in (the diagram-block or one of its contents) and its bounds there. */
  visuals: { visual: VisualObject; parentId: string; bounds: Bounds }[];
  /** Connections with both ends in the diagram-block: its diagram object or its contents. */
  connections: VisualConnection[];
}

/** composeObjectSet's result: the object set and the counts the console block shows. */
interface ComposedObjectSet {
  objectSet: ObjectSet;
  filteredCounts: { elems: number; diag: number };
  filteredBaseRels: number;
  stepCounts: StepCount[];
  view: ViewCounts;
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
  diagramConnections: number;
}

// ── Write plan (Scripts/View/lib/write_plan.js → view_writer.js) ─────────────────────────────────

/** A parent or connection end in a write plan: a node the plan writes, or a visual it leaves in place (inside a diagram-block). */
type VisualRef = { node: string } | { visual: string };

/** An existing visual repositioned: kept, and moved when its container changes. */
interface KeptNode {
  /** Occurrence id, or a diagram object's id. */
  node: string;
  /** The visual on the view. */
  visual: string;
  /** Node id of the container; null at view root. */
  parent: string | null;
  /** The container changes: the visual is moved into it, not only repositioned. */
  move: boolean;
  /** Relative to the container. */
  bounds: Bounds;
}

/** A new visual of an element. */
interface CreatedNode {
  /** Occurrence id. */
  node: string;
  element: ArchiElement;
  /** Node id of the container; null at view root. */
  parent: string | null;
  /** Relative to the container. */
  bounds: Bounds;
}

/** A copy of a visual on the view read: a diagram object not on the target view, or the contents of its diagram-block. */
interface CopiedNode {
  /** The diagram object's id, or a diagram-block content's visual id. */
  node: string;
  /** The visual copied: its kind, text and appearance. */
  source: VisualObject;
  /** Node id of the container; null at view root. */
  parent: string | null;
  /** Relative to the container. */
  bounds: Bounds;
}

type NodeWrite = KeptNode | CreatedNode | CopiedNode;

/** What the layout sets on a connection: label position and bendpoints, in the model direction. */
interface ConnectionStyle {
  /** CONNECTION_TEXT_POSITION; null: left as it is. */
  textPosition: number | null;
  bendpoints: Bendpoint[];
}

/** A connection to create: the relation and its two ends in the model direction. */
interface NewConnection {
  relation: ArchiRelation;
  source: VisualRef;
  target: VisualRef;
}

/** A copy of a connection on the view read (a diagram connection, or a line inside a diagram-block) between two written visuals. */
interface CopiedConnection {
  source: VisualConnection;
  from: VisualRef;
  to: VisualRef;
}

/** A laid-out connection: one on the view (a visual relation or a diagram connection) restyled, a new one, or a copy. */
type ConnectionWrite = ({ id: string } | NewConnection | CopiedConnection) & { style: ConnectionStyle };

/** What the writer does to the target view, step by step in this order (write_plan.planWrite). */
interface WritePlan {
  /** Self-loops removed first, for an algorithm that does not route them (visual relation ids). */
  removedSelfLoops: string[];
  /** Every node to write, parents first. */
  nodes: NodeWrite[];
  /** Managed occurrences left without a placement (visual ids), removed after the nodes. */
  removedVisuals: string[];
  /** Laid-out connections, in result order. */
  connections: ConnectionWrite[];
  /** Nesting connections to create. */
  nestings: NewConnection[];
  /** Nesting connections already on the view. */
  keptNestings: number;
  /** Other lines of nested relations (visual relation ids), removed. */
  removedLines: string[];
  /** Lines inside a copied diagram-block, copied with their own bendpoints. */
  copiedLines: CopiedConnection[];
  /** Connections on the view the layout did not route (visual relation ids): their bendpoints are cleared. */
  clearedConnections: string[];
  /** The view's managed-occurrence records after the write. */
  records: string[];
  /** User visuals the settings place nowhere, written at view root. */
  userAtRoot: number;
}

/** One row of logCountBlock: counts by field name, a grouped row, or a separator. */
type CountRow = {
  label?: string;
  rule?: boolean;
  group?: { sublabel: string; fields: [string, number][] }[];
  [field: string]: unknown;
};

// ── Dialog counts (Scripts/View/lib/gui/counts.js) ──────────────────────────────────────────────

/** Counts of a selection by kind (countSelection). */
interface SelectionCounts {
  elems: number;
  rels: number;
  views: number;
  diagrams: number;
  folders: number;
}

/** What a step adds: per condition (stepConditionCounts) or with all its conditions. A type alias, so it is a ConditionTableCounts. */
type StepAdds = {
  elements: number;
  relations: number;
};

/** One step as the dialog shows it. */
interface DialogStep {
  /** The step as it runs: its repeat and its conditions (getConditions). */
  step: Step;
  /** Its rows as shown (displayedConditions): one per-condition count each. */
  displayedConditions: StepCondition[];
  /** Per-condition counts by condition and input, kept by the step block across recounts. */
  cache: Map<string, StepAdds>;
}

/** What dialogCounts counts from: the selection read before the dialog opened and the conditions in the tables. */
interface DialogCountInput {
  /** The selection expanded: concepts and diagram objects (rawModelObjects). */
  objects: ArchiObject[];
  /** The filter tables' conditions (getConditions). */
  filter: Preset["filter"];
  /** The filter tables' rows as shown (displayedConditions): one per-condition count each. */
  filterTables: { element: ElementCondition[]; diagram: DiagramCondition[]; relation: RelationCondition[] };
  steps: DialogStep[];
  /** The nesting and reverse conditions (getConditions). */
  params: EffectiveParams;
  /** The nesting and reverse tables' rows as shown; null before the Layout tab is built. */
  layoutConditions: { nesting: RelationCondition[]; reverse: RelationCondition[] } | null;
  /** Diagram-blocks of the view(s) read (readDiagramBlocks): their contents are not counted on their own. */
  diagramBlockOf: Map<string, string>;
  /** What each diagram-block holds: its contents are counted with it. */
  blockContents: Map<string, BlockContents>;
  /** Element visuals of the view(s) read: an element only inside a diagram-block is a standalone. */
  sourceVisualElements: VisualObject[];
  relationsOf: RelationIndex;
  /** Selected visual elements (describeVisuals). */
  visuals: VisualDescription[];
  /** What Expand view works on (readSelection); null when it is disabled. */
  expandSnapshot: Snapshot | null;
}

/** One step's counts in the dialog. */
type DialogStepCounts = StepAdds & {
  /** Runs that added elements. */
  runs: number;
  /** The run limit was reached while the last run still added elements. */
  capped: boolean;
  /** What the step saw before its conditions: the conditions' property lists. */
  candidates: StepCandidate[];
  conditionCounts: StepAdds[];
};

/** The Layout tab's counts on the predicted view (layoutConditionCounts). */
interface LayoutConditionCounts {
  nesting: ConditionTableCounts[];
  reverse: ConditionTableCounts[];
  /** Matching relations drawn as a line because the child already has a parent. */
  multiParent: number;
  /** Matching relations drawn as a line because they form a circular nesting. */
  circular: number;
  cycles: number;
  /** Matching self-relations, drawn as a line. */
  selfLoops: number;
}

/** Everything the dialog's counters show (dialogCounts). */
interface DialogCounts {
  /** Per-condition counts of the filter tables. */
  filterConditions: { element: ConditionTableCounts[]; diagram: ConditionTableCounts[]; relation: ConditionTableCounts[] };
  steps: DialogStepCounts[];
  /** What the view will hold. */
  predicted: { elements: ArchiElement[]; relations: ArchiRelation[] };
  /** The totals line: on the generated view. */
  view: ViewCounts;
  /** Null when the input has no layoutConditions. */
  layoutConditions: LayoutConditionCounts | null;
  /** The totals line: on the expanded view; null without an expandSnapshot. */
  expandView: ViewCounts | null;
}

// ── Dialog condition tables (Scripts/View/lib/gui/condition_table.js) ─────────────────────────────────────

/** One choice of a "choice" column: the condition value and its label. */
interface ConditionTableItem {
  value: string | number;
  label: string;
}

/** Per-condition counts shown in a condition table, by count key (column key or column `count`). */
type ConditionTableCounts = Record<string, number | undefined>;

/** A drawn checkbox with its label (gui/widgets.js checkBox): grey when disabled, unlike a GTK checkbox. `control` is what gets laid out. */
interface CheckBox {
  control: Swt.Composite;
  getSelection(): boolean;
  setSelection(value: boolean): void;
  addListener(type: number, fn: () => void): void;
  setText(text: string): void;
  setToolTipText(text: string): void;
  setEnabled(on: boolean): void;
  enable(on: boolean): void;
  isEnabled(): boolean;
}

/** A "custom" cell: a controller the table drives instead of an SWT control. */
interface ConditionTableCell {
  set(value: any): void;
  enable(on: boolean): void;
  setToolTipText?(text: string): void;
}

/** Fields every condition-table column has (the column kinds are documented at conditionTable). R: the condition shape. */
interface ConditionTableColumnBase<R> {
  /** Condition field; count / warn columns: the count key or a placeholder. */
  key: string;
  header?: string;
  tooltip?: string;
  width?: number;
  /** Grid cells the column uses (custom: more than one). */
  cells?: number;
  optional?: boolean;
  enabled?: (condition: R) => boolean;
  onChange?: (condition: R) => void;
  /** Count key shown after the selected item (choice, prop) or in the cell (count). */
  count?: string;
}

interface ConditionTableChoiceColumn<R = AnyCondition> extends ConditionTableColumnBase<R> {
  kind: "choice";
  items: readonly ConditionTableItem[];
}

interface ConditionTableCustomColumn<R = AnyCondition> extends ConditionTableColumnBase<R> {
  kind: "custom";
  create: (parent: Swt.Composite, value: any, onChange: (value: any) => void) => ConditionTableCell;
}

interface ConditionTablePlainColumn<R = AnyCondition> extends ConditionTableColumnBase<R> {
  kind: "check" | "prop" | "value" | "count" | "warn";
  /** check: false = unchecked when the condition has no value. */
  default?: boolean;
  /** count: the cell text for n (default "(n)"). */
  format?: (n: number) => string;
}

type ConditionTableColumn<R = AnyCondition> = ConditionTableChoiceColumn<R> | ConditionTableCustomColumn<R> | ConditionTablePlainColumn<R>;

interface ConditionTableOptions<K extends ConditionKind> {
  kind: K;
  columns: readonly ConditionTableColumn<ConditionByKind[K]>[];
  /** At least the default condition (= keep everything); hands back [] for it. */
  filterList?: boolean;
  propCondition?: boolean;
  /** An empty feature list shows the default condition switched off. */
  placeholder?: boolean;
  onChange?: () => void;
  onLayout?: () => void;
  propItems?: (condition: ConditionByKind[K], key: string) => string[];
  valueItems?: (condition: ConditionByKind[K], key: string) => string[];
  rowTooltip?: (condition: ConditionByKind[K]) => string;
  emptyText?: string;
  addTooltip?: string;
  footer?: (footer: Swt.Composite) => void;
}

/** The controller conditionTable returns. */
interface ConditionTable<K extends ConditionKind> {
  getConditions(): ConditionByKind[K][];
  setConditions(list: readonly Partial<ConditionByKind[K]>[] | null | undefined): void;
  displayedConditions(): ConditionByKind[K][];
  setCounts(list: ConditionTableCounts[] | null | undefined): void;
  setWarnings(map: Map<number, string> | null | undefined): void;
  refreshItems(): void;
  enable(on: boolean): void;
  footer: Swt.Composite;
  /** Not an SWT control: code that sets tooltips on a mix of widgets checks for it. */
  setToolTipText?: undefined;
}

// ── Dialog (Scripts/View/lib/gui) ────────────────────────────────────────────────────────────────

/** The dialog's settings: a validated preset plus dialog-state fields ("_…", kept by preset_io). */
type DialogConfig = Preset & { _lastTabIndex?: number };

/** One Expand selection step block (tab_selection.js addRelatedBlock). */
interface StepBlock {
  container: Swt.Group;
  header: Swt.Composite;
  body: Swt.Composite;
  blkSep: Swt.Label;
  lblTitle: Swt.Label;
  lblBlockCounts: Swt.Label;
  btnUp: Swt.Button;
  btnDown: Swt.Button;
  btnCollapse: Swt.Button;
  btnRemove: Swt.Button;
  collapsed: boolean;
  addsText: string; // header summary of what the step adds
  candidates: StepCandidate[]; // what the step saw before its conditions (property lists)
  name: string; // "" = shown as Step N
  getRepeat: () => StepRepeat;
  table: ConditionTable<"step">;
  countCache: Map<string, StepAdds>; // per-condition counts (Counts.stepConditionCounts)
}

/** One row of the Properties tab. */
type ViewPropertyRow = { key: string; chk: CheckBox; cmb: Swt.Combo };

/**
 * One column of the totals line: the title, then per sub-line (elements, relations, diagram) its
 * label and its counts; fit(column) sets the width hints for a column that wide.
 */
type TotalsBlock = { title: Swt.Label; rows: { sub: Swt.Label; counts: Swt.Label }[]; fit: (column: number) => void };

/**
 * The dialog's widgets by name. Set while the tabs are built; an update function that can run
 * before a tab exists guards on that tab's widgets.
 */
type DialogWidgets = {
  tabFolder: Swt.TabFolder;
  pickPreset: TreePicker;
  lblModified: Swt.Label;
  btnSave: Swt.Button;
  btnRename: Swt.Button;
  btnDelete: Swt.Button;
  lblPresetDescription: Swt.Label;
  // Selection tab
  lblSelectedCount: Swt.Label;
  lblContainingCount: Swt.Label;
  tblElementConditions: ConditionTable<"element">;
  tblDiagramConditions: ConditionTable<"diagram">;
  tblRelationConditions: ConditionTable<"relation">;
  blocksContainer: Swt.Composite;
  // Layout tab
  algRadios: Map<string, Swt.Button>;
  grpContainers: Swt.Group;
  tblNestingConditions: ConditionTable<"relation">;
  tblReverseConditions: ConditionTable<"relation">;
  lblNestingNote: Swt.Label;
  lblReverseNote: Swt.Label;
  cmbContainerAlgorithm: Swt.Combo;
  cmbConnectionsMode: Swt.Combo;
  spinPadding: Swt.Spinner;
  cmbSort: Swt.Combo;
  chkAlignWidthSameType: CheckBox;
  chkColumnsAcrossContainers: CheckBox;
  cmbDirection: Swt.Combo;
  cmbAcyclicer: Swt.Combo;
  cmbRanking: Swt.Combo;
  cmbNodePlacement: Swt.Combo;
  cmbCircles: Swt.Combo;
  spinLayerSpacing: Swt.Spinner;
  spinElementWidth: Swt.Spinner;
  chkLabelSizing: CheckBox;
  spinLabelMaxLineWidth: Swt.Spinner;
  spinElementHeight: Swt.Spinner;
  spinElementSpacing: Swt.Spinner;
  cmbAlgorithmStart: Swt.Combo;
  chkCycleAlgorithmStart: CheckBox;
  cmbRouting: Swt.Combo;
  cmbLabelPosition: Swt.Combo;
  chkConnectionLabelSpacing: CheckBox;
  spinConnectionSpacing: Swt.Spinner;
  spinConnectionElementSpacing: Swt.Spinner;
  radioViewSizeNone: Swt.Button;
  radioViewSizeAspectRatio: Swt.Button;
  radioViewSizeMaxWidth: Swt.Button;
  cmbAspectRatio: Swt.Combo;
  spinMaxWidth: Swt.Spinner;
  // Appearance tab
  cmbPalette: Swt.Combo;
  tblNestingStyleConditions: ConditionTable<"nestingStyle">;
  tblStyleConditions: ConditionTable<"style">;
  lblStyleConflicts: Swt.Label;
  pickMixedColor: ColorPicker;
  cmbStyleLineWidth: Swt.Combo;
  lblNestingInfo: Swt.Label;
  nestDescLbl: Swt.Label;
  chkNestFont: CheckBox;
  lblNestDecrease: Swt.Label;
  spinNestFontDecrease: Swt.Spinner;
  lblNestFontPt: Swt.Label;
  chkNestColor: CheckBox;
  lblNestDarken: Swt.Label;
  spinNestDarken: Swt.Spinner;
  lblNestDarkenSteps: Swt.Label;
  lblNestLighten: Swt.Label;
  spinNestLighten: Swt.Spinner;
  lblNestLightenPct: Swt.Label;
  chkHighlightRep: CheckBox;
  lblHighlightRepRange: Swt.Label;
  pickHighlightRepRange: ColorPicker;
  // Properties tab
  vpAddObjectId: CheckBox;
  vpRows: ViewPropertyRow[];
  // Action area
  viewTotals: TotalsBlock;
  expandTotals: TotalsBlock;
  txtViewFolder: Swt.Text;
  txtViewName: Swt.Text;
  btnNewView: Swt.Button;
  btnOneEach: Swt.Button;
  btnExpandView: Swt.Button;
  btnLayoutOnly: Swt.Button;
};

/** The names of the widgets of type T. */
type WidgetName<T> = { [K in keyof DialogWidgets]: DialogWidgets[K] extends T ? K : never }[keyof DialogWidgets];

/** A layout param's widget (tab_layout.js PARAM_WIDGETS). */
type ParamWidget = { kind: "spin"; w: WidgetName<Swt.Spinner> } | { kind: "check"; w: WidgetName<CheckBox> } |
                   { kind: "combo"; w: WidgetName<Swt.Combo>; items: readonly string[] } |
                   { kind: "conditions"; w: WidgetName<ConditionTable<"relation">> };

/**
 * State shared by the tab builders and handlers: created in dialog_main.js open(), filled while building.
 * recount and markModified call back into dialog_main.js, which the tabs cannot require.
 */
interface DialogContext {
  config: DialogConfig;
  widgets: DialogWidgets;
  uiSelection: ArchiCollection<ArchiObject>;
  firstName: string; // the first selected object's name (view name)
  firstObject: string; // "Type: name" of that object, or ""
  containingCount: SelectionCounts;
  rawModelObjects: ArchiObject[]; // the selection expanded: concepts and diagram objects
  visuals: VisualDescription[]; // selected visual elements (describeVisuals)
  relationsOf: RelationIndex; // relations per element, read once (readRelationIndex)
  /** Diagram-blocks of the view(s) read and their element visuals (readDiagramBlocks), for the totals. */
  diagramBlocks?: { diagramBlockOf: Map<string, string>; blockContents: Map<string, BlockContents>; sourceVisualElements: VisualObject[] };
  relBlocks: StepBlock[];
  dlg: JFace.TitleAreaDialog;
  area: Swt.Composite;
  selectionScrolled: Swt.ScrolledComposite;
  selectionPage: Swt.Composite;
  layoutScrolled: Swt.ScrolledComposite;
  layoutPage: Swt.Composite;
  appearanceScrolled: Swt.ScrolledComposite;
  appearancePage: Swt.Composite;
  palettes: Palette[]; // palettes (presets/_palettes.json), read when the Appearance tab is built
  _ready?: boolean; // the modified indicator is on
  modified?: boolean;
  _actionId?: string; // ACTION.*.id of the pressed action button
  predicted?: { elements: ArchiElement[], relations: ArchiRelation[] } | null; // what the view will hold
  viewRelations?: ArchiRelation[]; // relations of the predicted view
  expandSnapshot?: Snapshot | null; // what Expand view works on (readSelection), null when it is disabled
  recount: () => void; // recount after a change of the settings (marks the dialog modified)
  markModified: () => void;
}
