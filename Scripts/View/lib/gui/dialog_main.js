/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Preset row — combo (loads on pick) · * modified · Save · Save As… | Rename… · Delete; description
 *   Tabs       — Selection · Layout · Appearance · Properties
 *   Totals     — what the current settings put on a view
 *   Actions    — Create new view (Folder, Name, New view, One view each) ·
 *                Modify selected view (View, Expand view, Layout only — in place); Cancel below
 */
console.log("Loading dialog_main.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../../../_lib/Common")} */
const Common    = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("../defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../preset_io")} */
const PresetIO  = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("../generate_view")} */
const GenView   = require(REPO_ROOT + "View/lib/generate_view");
/** @type {typeof import("../selection_pipeline")} */
const Pipeline  = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("../appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");
/** @type {typeof import("../rel_filter")} */
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./rule_table")} */
const { ruleTable } = require(REPO_ROOT + "View/lib/gui/rule_table");
// Loaded with this module, not on the first Save As click: console output from inside an SWT
// handler (as the module's "Loading …" line) blocks until this modal dialog closes.
/** @type {typeof import("./dialog_presets")} */
const PresetsDialog = require(REPO_ROOT + "View/lib/gui/dialog_presets");
const Chroma    = require("chroma-js");

const {
  STYLES, ALGORITHMS, ACTION, ROUTING, DIRECTIONS, RANKING, NODE_PLACEMENT, ACYCLICER, ELEMENT_ORDER, LABEL_POSITIONS, AR_OPTIONS,
  RELATION_TYPE_IDS, RELATION_TYPE_LABELS,
  ELEMENT_TYPES, ELEMENT_TYPE_LABELS,
  DIAGRAM_TYPES, DIAGRAM_TYPE_ID_TO_LABEL,
  COLOR_RANGES, PROP_ID,
  DEFAULT_PRESET, validatePreset,
} = Defs;

// ── Dialog state ──────────────────────────────────────────────────────────────

/**
 * The dialog's settings: a validated preset plus dialog-state fields ("_…", kept by preset_io).
 * @typedef {Preset & { _lastTabIndex?: number }} DialogConfig
 */

/**
 * Counts of a selection by kind (_countSelection).
 * @typedef {{ elems: number, rels: number, views: number, diagrams: number, folders: number }} SelectionCounts
 */

/**
 * One Expand selection step block (_addRelatedBlock).
 * @typedef {object} StepBlock
 * @property {Swt.Group}       container
 * @property {Swt.Composite}   header
 * @property {Swt.Composite}   body
 * @property {Swt.Label}       blkSep
 * @property {Swt.Label}       lblTitle
 * @property {Swt.Label}       lblBlockCounts
 * @property {Swt.Button}      btnUp
 * @property {Swt.Button}      btnDown
 * @property {Swt.Button}      btnCollapse
 * @property {Swt.Button}      btnRemove
 * @property {boolean}         collapsed
 * @property {string}          addsText    header summary of what the step adds
 * @property {StepCandidate[]} candidates  what the step saw before its rules (property lists)
 * @property {() => StepRepeat} getRepeat
 * @property {RuleTable<"step">} table
 * @property {Map<string, { elements: number, relations: number }>} [countCache]  _stepRuleCounts
 */

/**
 * One row of the Properties tab.
 * @typedef {{ key: string, chk: Swt.Button, cmb: Swt.Combo }} ViewPropertyRow
 */

/**
 * The dialog's widgets by name. Set while the tabs are built; an update function that can run
 * before a tab exists guards on that tab's widgets.
 * @typedef {object} DialogWidgets
 * @property {Swt.TabFolder} tabFolder
 * @property {Swt.Combo}     cmbPreset
 * @property {Swt.Label}     lblModified
 * @property {Swt.Button}    btnRename
 * @property {Swt.Button}    btnDelete
 * @property {Swt.Label}     lblPresetDescription
 * — Selection tab
 * @property {Swt.Label}     lblSelectedCount
 * @property {Swt.Label}     lblContainingCount
 * @property {RuleTable<"element">}  tblElementRules
 * @property {RuleTable<"diagram">}  tblDiagramRules
 * @property {RuleTable<"relation">} tblRelationRules
 * @property {Swt.Composite} blocksContainer
 * — Layout tab
 * @property {Map<string, Swt.Button>} algRadios
 * @property {Swt.Group}     grpContainers
 * @property {RuleTable<"relation">} tblNestingRules
 * @property {RuleTable<"relation">} tblReverseRules
 * @property {Swt.Label}     lblNestingNote
 * @property {Swt.Label}     lblReverseNote
 * @property {Swt.Combo}     cmbContainerAlgorithm
 * @property {Swt.Combo}     cmbConnectionsMode
 * @property {Swt.Spinner}   spinPadding
 * @property {Swt.Button}    chkSortContainers
 * @property {Swt.Button}    chkAlignWidthSameType
 * @property {Swt.Button}    chkSnapColumns
 * @property {Swt.Combo}     cmbDirection
 * @property {Swt.Combo}     cmbAcyclicer
 * @property {Swt.Combo}     cmbRanking
 * @property {Swt.Combo}     cmbNodePlacement
 * @property {Swt.Spinner}   spinLayerSpacing
 * @property {Swt.Spinner}   spinElementWidth
 * @property {Swt.Button}    chkLabelSizing
 * @property {Swt.Spinner}   spinLabelMaxLineWidth
 * @property {Swt.Spinner}   spinElementHeight
 * @property {Swt.Spinner}   spinElementSpacing
 * @property {Swt.Combo}     cmbElementOrder
 * @property {Swt.Button}    chkCycleElementOrder
 * @property {Swt.Combo}     cmbRouting
 * @property {Swt.Combo}     cmbLabelPosition
 * @property {Swt.Button}    chkConnectionLabelSpacing
 * @property {Swt.Spinner}   spinConnectionSpacing
 * @property {Swt.Spinner}   spinConnectionElementSpacing
 * @property {Swt.Button}    radioViewSizeNone
 * @property {Swt.Button}    radioViewSizeAspectRatio
 * @property {Swt.Button}    radioViewSizeMaxWidth
 * @property {Swt.Combo}     cmbAspectRatio
 * @property {Swt.Spinner}   spinMaxWidth
 * — Appearance tab
 * @property {RuleTable<"style">} tblStyleRules
 * @property {Swt.Label}     lblStyleConflicts
 * @property {Swt.Text}      txtMixedColor
 * @property {Swt.Canvas}    mixedSwatch
 * @property {(hex: string) => void} mixedSwatchSet
 * @property {Swt.Combo}     cmbStyleLineWidth
 * @property {Swt.Label}     lblNestingInfo
 * @property {Swt.Label}     nestDescLbl
 * @property {Swt.Button}    chkNestFont
 * @property {Swt.Spinner}   spinNestRootFontSize
 * @property {Swt.Button}    chkNestRootBold
 * @property {Swt.Label}     lblNestDecrease
 * @property {Swt.Spinner}   spinNestFontDecrease
 * @property {Swt.Label}     lblNestFontPt
 * @property {Swt.Label}     nestMidSep
 * @property {Swt.Button}    chkNestColor
 * @property {Swt.Text}      txtRootColor
 * @property {Swt.Canvas}    nestRootSwatch
 * @property {(hex: string) => void} nestRootSwatchSet
 * @property {Swt.Label}     lblNestLighten
 * @property {Swt.Spinner}   spinNestLighten
 * @property {Swt.Label}     lblNestLightenPct
 * @property {Swt.Button}    chkHighlightRep
 * @property {Swt.Label}     lblHighlightRepRange
 * @property {Swt.Combo}     cmbHighlightRepRange
 * @property {Swt.Canvas}    cmbHighlightRepRangeCanvas
 * — Properties tab
 * @property {Swt.Button}    vpAddObjectId
 * @property {ViewPropertyRow[]} vpRows
 * — Action area
 * @property {Swt.Label}     lblViewTotals
 * @property {Swt.Text}      txtViewFolder
 * @property {Swt.Text}      txtViewName
 * @property {Swt.Button}    btnNewView
 * @property {Swt.Button}    btnOneEach
 * @property {Swt.Button}    btnExpandView
 * @property {Swt.Button}    btnLayoutOnly
 */

/**
 * The names of the widgets of type T.
 * @template T
 * @typedef {{ [K in keyof DialogWidgets]: DialogWidgets[K] extends T ? K : never }[keyof DialogWidgets]} WidgetName
 */

/**
 * A layout param's widget (PARAM_WIDGETS).
 * @typedef {{ kind: "spin", w: WidgetName<Swt.Spinner> } | { kind: "check", w: WidgetName<Swt.Button> } |
 *           { kind: "combo", w: WidgetName<Swt.Combo>, items: readonly string[] } |
 *           { kind: "rules", w: WidgetName<RuleTable<"relation">> }} ParamWidget
 */

/**
 * State shared by the tab builders and handlers: created in open(), filled while building.
 * @typedef {object} DialogContext
 * @property {DialogConfig}       config
 * @property {DialogWidgets}      widgets
 * @property {ArchiCollection<ArchiObject>} uiSelection
 * @property {string}             firstName        the first selected object's name (view name)
 * @property {string}             firstObject      "Type: name" of that object, or ""
 * @property {SelectionCounts}    containingCount
 * @property {ArchiObject[]}      rawModelObjects  the selection expanded: concepts and diagram objects
 * @property {VisualDescription[]} visuals         selected visual elements (describeVisuals)
 * @property {StepBlock[]}        relBlocks
 * @property {JFace.TitleAreaDialog} dlg
 * @property {Swt.Composite}      area
 * @property {Swt.ScrolledComposite} selectionScrolled
 * @property {Swt.Composite}      selectionPage
 * @property {Swt.ScrolledComposite} layoutScrolled
 * @property {Swt.Composite}      layoutPage
 * @property {Swt.ScrolledComposite} appearanceScrolled
 * @property {Swt.Composite}      appearancePage
 * @property {boolean}            [_ready]     the modified indicator is on
 * @property {boolean}            [modified]
 * @property {string}             [_actionId]  ACTION.*.id of the pressed action button
 * @property {{ elements: ArchiElement[], relations: ArchiRelation[] } | null} [predicted]  what the view will hold
 * @property {ArchiRelation[]}    [viewRelations]  relations of the predicted view
 */

/**
 * _group options.
 * @typedef {{ bold?: boolean, grabH?: boolean, grabV?: boolean, marginH?: number, marginV?: number,
 *             spaceH?: number, spaceV?: number }} GroupOptions
 */

// ── SWT imports ───────────────────────────────────────────────────────────────

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const GroupWidget       = Java.type("org.eclipse.swt.widgets.Group");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const TextWidget              = Java.type("org.eclipse.swt.widgets.Text");
const TabFolderWidget         = Java.type("org.eclipse.swt.widgets.TabFolder");
const TabItemWidget           = Java.type("org.eclipse.swt.widgets.TabItem");
const ScrolledCompositeWidget = Java.type("org.eclipse.swt.custom.ScrolledComposite");
const CanvasWidget            = Java.type("org.eclipse.swt.widgets.Canvas");
const SWTColor                = Java.type("org.eclipse.swt.graphics.Color");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

// ── Derived lists ─────────────────────────────────────────────────────────────
// RELATION_TYPE_IDS, RELATION_TYPE_LABELS, ELEMENT_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL,
// COLOR_RANGES are imported from Defs above.

const DIRECTION_LABELS        = DIRECTIONS.map(d => d.val);
const ROUTING_ALL             = Object.values(ROUTING).map(r => r.label);
const ROUTING_TOOLTIPS        = Object.fromEntries(Object.values(ROUTING).map(r => [r.label, r.tooltip]));
const LABEL_POS_ALL           = LABEL_POSITIONS.map(lp => lp.val);
const LABEL_POS_TOOLTIPS      = Object.fromEntries(LABEL_POSITIONS.map(lp => [lp.val, lp.tooltip]));
const RANKING_LABELS          = RANKING.map(r => r.val);
const NODE_PLACEMENT_LABELS   = NODE_PLACEMENT.map(n => n.val);
const NODE_PLACEMENT_TOOLTIPS = Object.fromEntries(NODE_PLACEMENT.map(n => [n.val, n.tooltip]));
const ACYCLICER_LABELS        = ACYCLICER.map(a => a.val);
const ELEMENT_ORDER_LABELS    = ELEMENT_ORDER.map(o => o.val);
const AR_LABELS               = AR_OPTIONS.map(a => a.label);
const CONTAINER_ALGO_LABELS   = Defs.ALGORITHMS.Layered.supportedOptions.containerAlgorithm;
const CONNECTIONS_MODE_LABELS = Defs.ALGORITHMS.Layered.supportedOptions.connectionsMode;
const DP = DEFAULT_PRESET.params;

// ── Rule tables ───────────────────────────────────────────────────────────────
// Column sets of the rule tables (widget: gui/rule_table.js; rule kinds: rel_filter.js).
/** @type {RuleTableItem} */
const _ALL = { value: "", label: "All" };
const ELEMENT_ITEMS  = Object.freeze([_ALL, ...ELEMENT_TYPES.map((t, i) => ({ value: t, label: ELEMENT_TYPE_LABELS[i] }))]);
const RELATION_ITEMS = Object.freeze([_ALL, ...RELATION_TYPE_IDS.map((t, i) => ({ value: t, label: RELATION_TYPE_LABELS[i] }))
  .sort((a, b) => a.label.localeCompare(b.label))]);
const DIAGRAM_ITEMS  = Object.freeze([_ALL, ...Object.keys(DIAGRAM_TYPE_ID_TO_LABEL).map(k => ({ value: k, label: DIAGRAM_TYPE_ID_TO_LABEL[k] }))]);
const MODE_ITEMS = Object.freeze([{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }]);
const DIRECTION_ITEMS = Object.freeze([
  { value: "either", label: "Either" }, { value: "outgoing", label: "Outgoing" }, { value: "incoming", label: "Incoming" },
]);
const STEP_PROP_OF_ITEMS = Object.freeze([
  { value: "added", label: "Added element" }, { value: "relation", label: "Added relation" },
  { value: "previous", label: "Previous element" },
]);
const STYLE_COLOR_ITEMS = Object.freeze([
  { value: "element", label: "Element (own property)" }, { value: "relation", label: "Relation" },
  { value: "source", label: "Source element" }, { value: "target", label: "Target element" },
]);
const REL_PROP_OF_ITEMS = Object.freeze([
  { value: "relation", label: "Relation" }, { value: "source", label: "Source element" },
  { value: "target", label: "Target element" },
]);
const STYLE_PROP_OF_ITEMS = Object.freeze([
  { value: "element", label: "Element" }, { value: "relation", label: "Relation" },
  { value: "source", label: "Source element" }, { value: "target", label: "Target element" },
]);

// Filter lists start from everything, feature lists (Nesting, Reverse) from nothing (rel_filter.js).
/** @type {RuleTableChoiceColumn} */
const _modeCol = { key: "mode", header: "Mode", kind: "choice", items: MODE_ITEMS, width: 93,
  tooltip: "Include keeps what matches; Exclude removes it.\n" +
           "No Include rule: all is kept, minus Exclude. All Include rules off: nothing is kept." };
/** @type {RuleTableChoiceColumn} */
const _featureModeCol = Object.assign({}, _modeCol, {
  tooltip: "Include picks the matching relations; Exclude takes them out again.\n" +
           "No Include rule that is on: nothing is picked." });
/** @type {RuleTablePlainColumn} */
const _onCol = { key: "on", header: "On", kind: "check", tooltip: "Switch this rule on or off without deleting it." };
/**
 * @param {string} key
 * @param {string} header
 * @param {string} tooltip
 * @param {number} [width]
 * @returns {RuleTableChoiceColumn}
 */
const _typeCol = (key, header, tooltip, width) => ({ key, header, tooltip, kind: "choice", items: ELEMENT_ITEMS, width: width || 150 });
/**
 * @param {string} key
 * @param {string} header
 * @param {string} tooltip
 * @returns {RuleTableChoiceColumn}
 */
const _relCol  = (key, header, tooltip) => ({ key, header, tooltip, kind: "choice", items: RELATION_ITEMS, width: 136 });
/**
 * @param {string} what
 * @returns {RuleTableColumn<{ property: string }>[]}
 */
const _propCols = what => [
  { key: "property", header: "Property", kind: "prop", width: 110, optional: true,
    tooltip: `Only ${what} whose property has this value. Leave empty for no condition.` },
  { key: "value", header: "Value", kind: "value", width: 100, optional: true, enabled: r => !!r.property,
    tooltip: `Only ${what} whose property has this value.` },
];
const _COUNT_TIP = "(n): relations / elements this step adds with only this rule. Rules can overlap, so the sum can " +
                   "exceed the step total. For an Exclude rule: how many it removes from the other rules' result.";

// Global filter: the type combo shows the rule's count, "Business Actor (12)".
const _FILTER_COUNT_TIP = "\n(n): how many this rule keeps on its own; for an Exclude rule, how many it removes " +
                          "from the other rules' result.";
/** @type {readonly RuleTableColumn<ElementRule>[]} */
const ELEMENT_RULE_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  Object.assign(_typeCol("elementType", "Element type", "Type to match. All = any type." + _FILTER_COUNT_TIP, 200), { count: "count" }),
  ..._propCols("match elements"),
]);
/** @type {readonly RuleTableColumn<DiagramRule>[]} */
const DIAGRAM_RULE_COLUMNS = Object.freeze([
  _onCol, _modeCol, { key: "diagramType", header: "Diagram type", kind: "choice", items: DIAGRAM_ITEMS, width: 180, count: "count",
              tooltip: "Type to match. All = any type." + _FILTER_COUNT_TIP },
]);
/** @type {readonly RuleTableChoiceColumn[]} */
const RELATION_RULE_COLUMNS = Object.freeze([
  _modeCol,
  _typeCol("source", "Source type", "Element type at the start of the relation. All = any type."),
  _relCol("relation", "Relation type", "Relationship type. All = any type."),
  _typeCol("target", "Target type", "Element type at the end of the relation. All = any type."),
]);
// Nesting / reverse: the relation-type combo shows the rule's count, "Aggregation (62)".
const _countedRelCol = Object.assign({}, RELATION_RULE_COLUMNS[2], { count: "relations", width: 166,
  tooltip: "Relationship type. All = any type.\n(n): relations on the view this rule matches on its own; " +
           "for an Exclude rule, how many it removes from the other rules' matches." });
/** @type {RuleTableColumn<RelationRule>[]} */
const _COUNTED_FEATURE_COLUMNS = [_onCol, _featureModeCol, RELATION_RULE_COLUMNS[1], _countedRelCol, RELATION_RULE_COLUMNS[3],
  { key: "propertyOf", header: "Property of", kind: "choice", items: REL_PROP_OF_ITEMS, width: 120, optional: true,
    tooltip: "Where the property is read: the relation, its source or its target element." },
  ..._propCols("relations")];
/** @type {readonly RuleTableColumn<RelationRule>[]} */
const NESTING_RULE_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "everyContainer", header: "Every", kind: "check", width: 40, default: false,
    enabled: r => r.mode !== "exclude",
    tooltip: "A child with several parents: on = it appears in every parent; off = it appears in one parent " +
             "and the other relations are drawn as a line." },
  { key: "nested", header: "Nested", kind: "count", width: 50, format: n => String(n),
    tooltip: "Of those relations, how many are drawn as nesting. The others are drawn as a line: " +
             "their child already has a parent, or they form a circular nesting." }]);
// Reverse: an empty cell where Nesting has its Nested count, so both tables line up.
/** @type {readonly RuleTableColumn<RelationRule>[]} */
const REVERSE_RULE_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "_spacer", header: "", kind: "count", width: 40 },
  { key: "_spacer2", header: "", kind: "count", width: 50 }]);
/** @type {readonly RuleTableColumn<RelationRule>[]} */
const FILTER_RELATION_RULE_COLUMNS = Object.freeze([_onCol, RELATION_RULE_COLUMNS[0], RELATION_RULE_COLUMNS[1],
  Object.assign({}, RELATION_RULE_COLUMNS[2], { count: "count", width: 166,
    tooltip: "Relationship type. All = any type.\n(n): relations between the filtered elements this rule keeps on its own; " +
             "for an Exclude rule, how many it removes from the other rules' result." }),
  RELATION_RULE_COLUMNS[3]]);
/** @type {readonly RuleTableColumn<StepRule>[]} */
const STEP_RULE_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  _typeCol("previous", "Previous step\nelements",
    "Only elements of this type from the previous step are expanded (step 1: the filtered selection). All = any.", 150),
  { key: "direction", header: "Direction", kind: "choice", items: DIRECTION_ITEMS, width: 90,
    tooltip: "Outgoing: the relation starts at an element of the previous step.\n" +
             "Incoming: the relation ends at an element of the previous step.\nEither: both (default)." },
  // The rule's counts sit after the chosen type: "Aggregation (18)", "Business Service (5)".
  Object.assign(_relCol("relation", "Added\nrelations", "Relationship types to follow from the previous step.\n" + _COUNT_TIP),
    { count: "relations", width: 166 }),
  Object.assign(_typeCol("added", "Added\nelements", "Types of the elements this step adds.\n" + _COUNT_TIP, 180),
    { count: "elements" }),
  { key: "propertyOf", header: "Property of", kind: "choice", items: STEP_PROP_OF_ITEMS, width: 120, optional: true,
    tooltip: "Where the property is read: the added element, the followed relation or the element from the previous step." },
  ..._propCols("add elements"),
]);
/** @type {readonly RuleTableColumn<StyleRule>[]} */
const STYLE_RULE_COLUMNS = Object.freeze([
  _onCol,
  { key: "color", header: "Color", kind: "choice", items: STYLE_COLOR_ITEMS, width: 150,
    tooltip: "What gets the color: the element itself (using its own property), the relation, " +
             "or the source / target element of a matching relation.",
    // Element colors by its own property; a relation has no "element" to read from.
    onChange: r => {
      if (r.color === "element") r.propertyOf = "element";
      else if (r.color === "relation" && r.propertyOf === "element") r.propertyOf = "relation";
    } },
  _typeCol("source", "Source", "Element type at the start of the relation (Color = Element: the element type). All = any.", 140),
  Object.assign(_relCol("relation", "Relation", "Relationship type. All = any type."),
    { width: 105, enabled: (/** @type {StyleRule} */ r) => r.color !== "element" }),
  Object.assign(_typeCol("target", "Target", "Element type at the end of the relation. All = any.", 140),
    { enabled: (/** @type {StyleRule} */ r) => r.color !== "element" }),
  { key: "propertyOf", header: "Property of", kind: "choice", items: STYLE_PROP_OF_ITEMS, width: 120,
    enabled: r => r.color !== "element",
    tooltip: "Whose property supplies the value: the element, the relation, its source or its target." },
  { key: "property", header: "Property", kind: "prop", width: 140, count: "count",
    tooltip: "The property whose values give the colors.\n(n): objects on the view this rule colors " +
             "(no property chosen yet: objects it reaches)." },
  { key: "colorRange", header: "Range", kind: "custom", cells: 2, create: (p, v, on) => _rangeCell(p, v, on),
    tooltip: "Colors from low to high value of the property." },
  { key: "warn", kind: "warn" },
]);

// Layout params with one plain widget: loaded (_syncToUI), saved (_saveUI) and enabled per
// algorithm (_updateAlgorithmControls) from this table, so every param follows defs.activeParams.
//   kind: spin | check | combo (items = full list; the algorithm's supportedOptions narrow it) |
//         rules (rule table, gui/rule_table.js)
// Params with their own handling: the view size (maxWidth / aspectRatio / viewSizeMode radios).
/** @type {Readonly<Record<string, ParamWidget>>} */
const PARAM_WIDGETS = Object.freeze({
  elementWidth:             { w: "spinElementWidth",             kind: "spin" },
  elementHeight:            { w: "spinElementHeight",            kind: "spin" },
  labelSizing:              { w: "chkLabelSizing",               kind: "check" },
  labelMaxLineWidth:        { w: "spinLabelMaxLineWidth",        kind: "spin" },
  elementSpacing:           { w: "spinElementSpacing",           kind: "spin" },
  elementOrder:             { w: "cmbElementOrder",              kind: "combo", items: ELEMENT_ORDER_LABELS },
  cycleElementOrder:        { w: "chkCycleElementOrder",         kind: "check" },
  layerSpacing:             { w: "spinLayerSpacing",             kind: "spin" },
  direction:                { w: "cmbDirection",                 kind: "combo", items: DIRECTION_LABELS },
  acyclicer:                { w: "cmbAcyclicer",                 kind: "combo", items: ACYCLICER_LABELS },
  ranking:                  { w: "cmbRanking",                   kind: "combo", items: RANKING_LABELS },
  nodePlacement:            { w: "cmbNodePlacement",             kind: "combo", items: NODE_PLACEMENT_LABELS },
  reverseRules:             { w: "tblReverseRules",              kind: "rules" },
  routing:                  { w: "cmbRouting",                   kind: "combo", items: ROUTING_ALL },
  labelPosition:            { w: "cmbLabelPosition",             kind: "combo", items: LABEL_POS_ALL },
  connectionLabelSpacing:   { w: "chkConnectionLabelSpacing",    kind: "check" },
  connectionSpacing:        { w: "spinConnectionSpacing",        kind: "spin" },
  connectionElementSpacing: { w: "spinConnectionElementSpacing", kind: "spin" },
  nestingRules:             { w: "tblNestingRules",              kind: "rules" },
  containerAlgorithm:       { w: "cmbContainerAlgorithm",        kind: "combo", items: CONTAINER_ALGO_LABELS },
  connectionsMode:          { w: "cmbConnectionsMode",           kind: "combo", items: CONNECTIONS_MODE_LABELS },
  padding:                  { w: "spinPadding",                  kind: "spin" },
  sortContainers:           { w: "chkSortContainers",            kind: "check" },
  alignWidthSameType:       { w: "chkAlignWidthSameType",        kind: "check" },
  snapColumnsToGrid:        { w: "chkSnapColumns",               kind: "check" },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

// Wrap a tab's content composite in a ScrolledComposite so it survives dialog resize.
// Returns the inner content composite to add widgets to.
/**
 * @param {Swt.TabFolder} tabFolder
 * @param {string} tabLabel
 */
function _scrolledTab(tabFolder, tabLabel) {
  const tab      = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText(tabLabel);
  const scrolled = new ScrolledCompositeWidget(tabFolder, SWT.V_SCROLL | SWT.H_SCROLL);
  scrolled.setExpandHorizontal(true);
  scrolled.setExpandVertical(true);
  tab.setControl(scrolled);

  const page = new CompositeWidget(scrolled, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);

  // Recompute scroll min-size after layout — called once at end of tab builder.
  // `scrolled` is returned so callers can re-run _resizeScrolled when the page mutates
  // (e.g. related-elements blocks added/removed/collapsed at runtime).
  return {
    page,
    scrolled,
    finish: () => {
      scrolled.setContent(page);
      _resizeScrolled(scrolled, page);
    },
  };
}

/**
 * @param {Swt.Composite} parent
 * @param {string} text
 */
function _lbl(parent, text) {
  const l = new LabelWidget(parent, SWT.NONE);
  l.setText(text || "");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// Single-line wide label, used for the Selected/Containing/Filtered/Related-N count lines.
/** @param {Swt.Composite} parent */
function _selLine(parent) {
  const l = new LabelWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// Count selection by type. Returns { elems, rels, views, diagrams, folders }.
/**
 * @param {ArchiCollection<ArchiObject>} coll
 * @returns {SelectionCounts}
 */
function _countSelection(coll) {
  let elems = 0, rels = 0, views = 0, diagrams = 0, folders = 0;
  coll.each(o => {
    const t = o.type || "";
    if      (t === "folder")                     folders++;
    else if (t.endsWith("-relationship"))        rels++;
    else if (t === "archimate-diagram-model")    views++;
    else if (t.startsWith("diagram-model-"))     diagrams++;
    else                                          elems++;
  });
  return { elems, rels, views, diagrams, folders };
}

// Ordered (key, singular, plural) tuples driving _formatCountsBody output order.
/** @type {[keyof SelectionCounts, string, string][]} */
const _COUNT_LABELS = [
  ["elems",    "element",  "elements"],
  ["rels",     "relation", "relations"],
  ["diagrams", "diagram",  "diagrams"],
  ["views",    "view",     "views"],
  ["folders",  "folder",   "folders"],
];

// A count line: "3 elements · 2 relations  (first: …)". Types with count 0 are omitted;
// an empty selection gives "nothing". Used for the right column of 2-col counter rows.
/**
 * @param {SelectionCounts} counts
 * @param {string} [firstObject]
 */
function _formatCountsBody(counts, firstObject) {
  const parts = [];
  for (const [key, sg, pl] of _COUNT_LABELS) {
    const n = counts[key] | 0;
    if (n > 0) parts.push(`${n} ${n === 1 ? sg : pl}`);
  }
  const body = parts.length ? parts.join(" · ") : "nothing";
  const tail = firstObject ? `  (first: ${firstObject})` : "";
  return `${body}${tail}`;
}

// "business-actor" → "Business Actor". Matches the Title-Case form Archi shows in its Properties view.
/** @param {string} t */
function _typeToDisplay(t) {
  if (!t) return "";
  return t.split("-").map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(" ");
}

// Recompute ScrolledComposite min-size after page content changes.
// The page takes the viewport width, unless a control that must be shown whole (a rule table,
// data "fitWidth") is wider: then the dialog grows — only wider, within the monitor — and when
// the monitor is too narrow too the tab scrolls horizontally.
/**
 * @param {Swt.ScrolledComposite} scrolled
 * @param {Swt.Composite} page
 */
function _resizeScrolled(scrolled, page) {
  if (!scrolled || !page) return;
  try {
    let clientW = scrolled.getClientArea().width;
    if (clientW <= 0 || !scrolled.isVisible()) {
      scrolled.setMinSize(page.computeSize(clientW > 0 ? clientW : SWT.DEFAULT, SWT.DEFAULT));
      return;
    }
    // Page width at which every fitWidth control has its natural width.
    const short = _fitShortfall(page);
    let wantW = short === null ? clientW : page.getSize().x + short;
    if (wantW > clientW) {
      _growShell(scrolled.getShell(), wantW - clientW);
      clientW = scrolled.getClientArea().width;
    }
    scrolled.setMinSize(page.computeSize(Math.max(clientW, wantW), SWT.DEFAULT));
  } catch (e) {}
}

// Largest (natural width − current width) over the visible fitWidth controls under root;
// null when there are none.
/**
 * @param {Swt.Composite} root
 * @returns {number | null}
 */
function _fitShortfall(root) {
  /** @type {number | null} */
  let short = null;
  /** @param {Swt.Composite} c */
  const walk = c => {
    for (const k of c.getChildren()) {
      if (k.isDisposed() || !k.getVisible()) continue;
      if (k.getData("fitWidth")) {
        const d = k.computeSize(SWT.DEFAULT, SWT.DEFAULT).x - k.getSize().x;
        short = short === null ? d : Math.max(short, d);
      } else if (k instanceof CompositeWidget) walk(k);
    }
  };
  walk(root);
  return short;
}

// Widen the (visible) shell by dx, kept within the monitor; it never shrinks.
/**
 * @param {Swt.Shell} shell
 * @param {number} dx
 */
function _growShell(shell, dx) {
  if (!shell || !shell.isVisible() || dx <= 0) return;
  const area = shell.getMonitor().getClientArea();
  const b = shell.getBounds();
  const newW = Math.min(area.width, b.width + dx);
  if (newW <= b.width) return;
  const newX = Math.max(area.x, Math.min(b.x - Math.round((newW - b.width) / 2), area.x + area.width - newW));
  shell.setBounds(newX, b.y, newW, b.height);
  shell.layout(true, true);
}


// Module-level bold font, lazy-created once per script load. Never disposed (jArchi rule).
/** @type {Swt.Font | null} */
let _boldFontCache = null;
function _getBoldFont() {
  if (_boldFontCache) return _boldFontCache;
  try {
    const FontDescriptor = Java.type("org.eclipse.jface.resource.FontDescriptor");
    const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
    const fd = FontDescriptor.createFrom(display.getSystemFont()).setStyle(SWT.BOLD);
    _boldFontCache = fd.createFont(display);
  } catch (e) {}
  return _boldFontCache;
}

// Module-level group background: the widget background, a little lighter, so groups stand out
// from the page. Lazy-created once per script load. Never disposed (like the bold font).
/** @type {Swt.Color | null} */
let _groupBgCache = null;
function _getGroupBackground() {
  if (_groupBgCache) return _groupBgCache;
  try {
    const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
    const rgb = display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND).getRGB();
    const dark = (rgb.red + rgb.green + rgb.blue) / 3 < 128;
    const f = dark ? 0.08 : 0.5;   // share of the way to white
    const up = (/** @type {number} */ c) => Math.round(c + (255 - c) * f);
    _groupBgCache = new SWTColor(display, up(rgb.red), up(rgb.green), up(rgb.blue));
  } catch (e) {}
  return _groupBgCache;
}

// Default dialog dimensions. Width set explicitly to avoid SWT computing a wide size from
// content hints. Height: the monitor's usable height, at most DEFAULT_DIALOG_HEIGHT.
const DEFAULT_DIALOG_WIDTH  = 1000;
const DEFAULT_DIALOG_HEIGHT = 1800;   // Layout tab without scrolling

// ── open() ────────────────────────────────────────────────────────────────────

/**
 * Open the GUI dialog.
 * @param {ArchiCollection<ArchiObject>} uiSelection  $(selection) captured before dialog opens
 */
function open(uiSelection) {
  /** @type {DialogConfig} */
  const config = PresetIO.readSession();

  // Casts: the widget map and the context are filled while the dialog is built (DialogContext).
  const w = /** @type {DialogWidgets} */ ({});       // widget map
  const ctx = /** @type {DialogContext} */ ({ config, widgets: w, uiSelection, firstName: "", relBlocks: /** @type {StepBlock[]} */ ([]) });  // firstName set below

  // Compute selection counts before the dialog opens.
  // Raw count: what the user had selected in the UI.
  const selectedCount = { elems: 0, rels: 0, views: 0, folders: 0, diagrams: 0 };
  let firstName = "";
  let firstType = "";
  try {
    uiSelection.each(o => {
      const t = o.type || "";
      if (!firstName && o.name) { firstName = o.name; firstType = t; }
      if      (t === "archimate-diagram-model")  selectedCount.views++;
      else if (t.endsWith("-relationship"))      selectedCount.rels++;
      else if (t === "folder")                   selectedCount.folders++;
      else if (t.startsWith("diagram-model-"))   selectedCount.diagrams++;
      else                                       selectedCount.elems++;
    });
  } catch (e) {}
  ctx.firstName = firstName;  // propagate for _syncToUI pre-fill
  ctx.firstObject = firstName ? `${_typeToDisplay(firstType)}: ${firstName}` : "";

  // Expanded count: what is contained in the selection (folders expand, views expand to their elements).
  // When a view (archimate-diagram-model) is selected, $(view).find() enumerates visual objects.
  // $(view).children() returns nothing useful from the model tree — find() is the correct API.
  const containingCount = { elems: 0, rels: 0, diagrams: 0, views: 0, folders: 0 };
  try {
    uiSelection.each(o => {
      const t = o.type || "";
      if (t === "archimate-diagram-model" && !o.view) {
        // Model-tree view: count its model elements, relations, and diagram objects
        // Skip ArchimateView concepts — view-reference VOs appear in find("element") with
        // .concept pointing to the referenced view; count them as diagram objects instead.
        try { $(o).find("element").each(ve => {
          if (ve.concept && (ve.concept.type || "") !== "archimate-diagram-model") containingCount.elems++;
        }); } catch (e) {}
        try { $(o).find("relation").each(() => containingCount.rels++); } catch (e) {}
        try {
          Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
            try { $(o).find(dt).each(() => containingCount.diagrams++); } catch (e2) {}
          });
        } catch (e) {}
      } else if (o.view || t === "folder") {
        // Canvas VO (may be a container nesting child VOs) or a model-tree folder.
        // Selection.getSelection now handles both: walks $(obj).children() recursively,
        // extracting concepts from canvas VOs and diagram objects.
        try {
          const coll = Selection.getSelection($(o), "*");
          const c    = _countSelection(coll);
          containingCount.elems    += c.elems;
          containingCount.rels     += c.rels;
          containingCount.diagrams += c.diagrams;
          containingCount.views    += c.views;
          containingCount.folders  += c.folders;
        } catch (e) {}
      } else if (t.endsWith("-relationship")) {
        containingCount.rels++;
      } else if (t.startsWith("diagram-model-")) {
        containingCount.diagrams++;
      } else if (t !== "archimate-diagram-model") {
        containingCount.elems++;
      }
    });
  } catch (e) {}
  ctx.containingCount = containingCount;

  // Collect flat array of model objects for live filter statistics.
  // Used by _updateFilteredCount to recount after filter changes.
  /** @type {ArchiObject[]} */
  const rawModelObjects = [];
  /** @type {DiagramObject[]} */
  const selectedVisuals = [];   // visual elements in the selection: one-parent choice and pairing (describeVisuals)
  try {
    const seen = new Set();
    /** @param {ArchiObject | null} o */
    const add = o => {
      if (!o || !o.id || seen.has(o.id)) return;
      if ((o.type || "") === "folder") return;  // folder = container, skip
      seen.add(o.id);
      rawModelObjects.push(o);
    };
    uiSelection.each(o => {
      const t = o.type || "";
      if (t === "archimate-diagram-model" && !o.view) {
        // Model-tree view: expand to model elements, relations, AND diagram objects
        // Skip ArchimateView concepts — view-reference VOs may appear in find("element")
        // with their .concept pointing to the referenced view (type "archimate-diagram-model")
        try { $(o).find("element").each(ve => {
          if (ve.concept && (ve.concept.type || "") !== "archimate-diagram-model") { add(ve.concept); selectedVisuals.push(/** @type {VisualObject} */ (ve)); }   // Cast: on a view, "element" selects visuals
        }); } catch (e) {}
        try { $(o).find("relation").each(vr => { if (vr.concept) add(vr.concept); }); } catch (e) {}
        Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
          try { $(o).find(dt).each(dvo => { if (dvo && dvo.id) add(dvo); }); } catch (e) {}
        });
      } else if (o.view || t === "folder") {
        // Canvas VO (may be a container) or model-tree folder.
        // Selection.getSelection recurses via $(obj).children() and extracts
        // concepts from canvas VOs and diagram objects in one pass.
        try { Selection.getSelection($(o), "*").each(add); } catch (e) {}
        if (o.view && o.concept) selectedVisuals.push(o);
      } else {
        add(o);
      }
    });
  } catch (e) {}
  ctx.rawModelObjects = rawModelObjects;
  ctx.visuals = Pipeline.describeVisuals(selectedVisuals);

  // Log to Archi console BEFORE dialog opens (dialog blocks; console.log inside SWT handlers is unreliable).
  {
    let _lEl = 0, _lRel = 0, _lDiag = 0;
    for (const o of rawModelObjects) {
      const t = o.type || "";
      if (t.endsWith("-relationship"))   _lRel++;
      else if (t in Defs.DIAGRAM_TYPES)  _lDiag++;
      else                               _lEl++;
    }
    console.log("");
    Pipeline.logCountBlock("GUI — before dialog:", [
      // "Selected" reflects the raw UI pick — show views and folders too so users
      // who clicked a view see "1 view" instead of all-zeros.
      { label: "Selected:  ",
        elems: selectedCount.elems, rels: selectedCount.rels,
        views: selectedCount.views, diag: selectedCount.diagrams, folders: selectedCount.folders },
      { label: "Containing:", elems: containingCount.elems, rels: containingCount.rels, diag: containingCount.diagrams },
      { label: "Filtered:  ", elems: _lEl, rels: _lRel, diag: _lDiag },
    ]);
  }

  // The view Expand view / Layout only work on: the view of selected canvas objects, or a view
  // selected in the model tree (Layout only). name "" = none, the Modify group is then disabled;
  // onCanvas: objects on the view are selected — Expand view needs them to expand from.
  const target = { name: "", onCanvas: false };
  try {
    uiSelection.each(o => {
      if (target.name) return;
      if (o.view)                                    { target.name = String(o.view.name || ""); target.onCanvas = true; }
      else if (o.type === "archimate-diagram-model") target.name = String(o.name || "");
    });
  } catch (e) {}

  // GraalVM two-argument Java.extend: bake methods in at class definition time.
  /** @type {JFace.TitleAreaDialog} */
  let dlg;

  const ConfigDialog = Java.extend(TitleAreaDialog, {
    createDialogArea: function(/** @type {Swt.Composite} */ parent) {
      /** @type {Swt.Composite} */
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Generate View");
      dlg.setMessage("Choose what to include (Selection) and how to arrange it (Layout), then an action below.");

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 0).spacing(4, 4).applyTo(area);

      _buildPresetRow(area, ctx, dlg);

      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      _buildSelectionTab(tabFolder, ctx, selectedCount, containingCount);
      _buildLayoutTab(tabFolder, ctx);
      _buildAppearanceTab(tabFolder, ctx);
      _buildViewPropertiesTab(tabFolder, ctx);

      ctx.area = area;
      _buildActionArea(area, ctx, dlg, target);
      _syncToUI(ctx);
      _updateFilteredCount(ctx);  // populate the live counters on dialog open
      ctx._ready = true;          // enable modified indicator from here on
      if (_differsFromSaved(ctx)) _markModified(ctx);  // session changed since the last save

      tabFolder.setSelection(config._lastTabIndex || 0);
      // Fit the shown tab once the dialog is open, and every tab when it is selected.
      const fitTab = () => {
        const i = tabFolder.getSelectionIndex();
        /** @type {[Swt.ScrolledComposite, Swt.Composite][]} */
        const pairs = [[ctx.selectionScrolled, ctx.selectionPage], [ctx.layoutScrolled, ctx.layoutPage],
                       [ctx.appearanceScrolled, ctx.appearancePage]];
        if (pairs[i]) _resizeScrolled(pairs[i][0], pairs[i][1]);
      };
      tabFolder.addListener(SWT.Selection, fitTab);
      area.getDisplay().asyncExec(() => { try { if (!area.isDisposed()) fitTab(); } catch (e) {} });
      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    getInitialSize: function() {
      const Point = Java.type("org.eclipse.swt.graphics.Point");
      let height = DEFAULT_DIALOG_HEIGHT;
      try { height = Math.min(height, dlg.getShell().getMonitor().getClientArea().height); } catch (e) {}
      return new Point(DEFAULT_DIALOG_WIDTH, height);
    },

    // Top of the monitor's usable area, centred horizontally — the dialog uses the full height.
    getInitialLocation: function(/** @type {Swt.Point} */ size) {
      const Point = Java.type("org.eclipse.swt.graphics.Point");
      try {
        const area = dlg.getShell().getMonitor().getClientArea();
        return new Point(area.x + Math.max(0, Math.round((area.width - size.x) / 2)), area.y);
      } catch (e) { return Java.super(dlg).getInitialLocation(size); }
    },

    createButtonBar: function(/** @type {Swt.Composite} */ parent) {
      // All buttons are in _buildActionArea (custom composite in the dialog area).
      // Return an empty zero-height composite so the JFace button bar adds no space.
      const bar = new CompositeWidget(parent, SWT.NONE);
      GridDataFactory.swtDefaults().hint(0, 0).applyTo(bar);
      return bar;
    },

    createButtonsForButtonBar: function(/** @type {Swt.Composite} */ parent) {
      // Intentionally empty — buttons are in _buildActionArea.
    },

    // The action buttons are custom (see _buildActionArea → _runAction); only Cancel ends up here.
    buttonPressed: function(/** @type {number} */ buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) _persistSession(ctx);  // remember _lastTabIndex
      Java.super(dlg).buttonPressed(buttonId);
    },
  });

  dlg = new ConfigDialog(shell);
  ctx.dlg = dlg;  // its shell parents the dialogs opened from it (Save As, confirmations)
  const result = dlg.open();  // blocks until dialog closes

  // Dialog is fully closed here — safe to run generate_view
  if (result === IDialogConstants.CANCEL_ID || result < 0) return;

  try {
    GenView.generate_view(ctx.config, ctx.uiSelection, ctx._actionId);
  } catch (e) {
    console.error("generate_view error: " + (/** @type {Error} */ (e).message || e));   // Cast: a thrown Error or a string
  }
}

/** @param {DialogContext} ctx */
function _persistSession(ctx, params = {}) {
  const session = JSON.parse(JSON.stringify(ctx.config));
  Object.assign(session.params, params);
  if (ctx.widgets.tabFolder) session._lastTabIndex = ctx.widgets.tabFolder.getSelectionIndex();
  PresetIO.writeSession(session);
}


// ── Live filter count ─────────────────────────────────────────────────────────

/**
 * Recount elements/relations/diagram objects after applying current filter settings,
 * then walk the dynamic Related-elements blocks updating each one's counter line.
 *
 * The global filter's counts appear per rule in its type combos (AFTER the filter, BEFORE any blocks).
 * Each block's counter line shows the additions contributed by THAT block alone.
 * Block N's pruned output is block N+1's base (cumulative cascade).
 */

/**
 * Format the on-screen "Output:" strip for the Generated view group. Multi-line,
 * grouped by element/relation/diagram, hide-zero subfields, skip empty sub-lines.
 * Uses the canonical vocabulary (ai/rules.md #11): containers · nested elements ·
 * standalones · extra occurrences for the element role split; nestings · connections
 * for the relation form split; diagram objects for canvas-only objects. "Relation"
 * never appears on view-side rows (model-side term only).
 * @param {ViewCounts} view
 */
function _formatOutputLine(view) {
  /** @type {(n: number, s: string, p: string) => string} */
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const lines = ["On the generated view:"];

  // elements sub-line
  const elSub = [];
  if (view.containers > 0) {
    elSub.push(plural(view.containers, "container", "containers"));
    if (view.nestedElements   > 0) elSub.push(plural(view.nestedElements,   "nested element",    "nested elements"));
    if (view.standalones      > 0) elSub.push(plural(view.standalones,      "standalone",        "standalones"));
    if (view.extraOccurrences > 0) elSub.push(plural(view.extraOccurrences, "extra occurrence",  "extra occurrences"));
  } else if (view.elements > 0) {
    elSub.push(plural(view.elements, "element", "elements"));
  }
  if (elSub.length) lines.push(`  elements:    ${elSub.join(" · ")}`);

  // relations sub-line (never the word "relations" — model-layer term only)
  const relSub = [];
  if (view.nestings    > 0) relSub.push(plural(view.nestings,    "nesting",    "nestings"));
  if (view.connections > 0) relSub.push(plural(view.connections, "connection", "connections"));
  if (relSub.length) lines.push(`  relations:   ${relSub.join(" · ")}`);

  // diagram sub-line
  if (view.diagramObjects > 0) lines.push(`  diagram:     ${plural(view.diagramObjects, "diagram object", "diagram objects")}`);

  return lines.length === 1 ? "On the generated view: —" : lines.join("\n");
}

/** @param {DialogContext} ctx */
function _updateFilteredCount(ctx) {
  _markModified(ctx);
  const w = ctx.widgets;
  if (!w.tblElementRules) return;  // Selection tab not built yet

  /**
   * @param {StepBlock} b
   * @param {number} eCount
   * @param {number} rCount
   * @param {string} [suffix]
   */
  const _setRel = (b, eCount, rCount, suffix) => {
    if (!b || !b.lblBlockCounts) return;
    const cnt = { elems: eCount, rels: rCount, diagrams: 0, views: 0, folders: 0 };
    b.addsText = _formatCountsBody(cnt) + (suffix || "");
    _refreshBlockHeader(b);
  };

  const objects = ctx.rawModelObjects;
  if (!objects || !objects.length) {
    (ctx.relBlocks || []).forEach(b => _setRel(b, 0, 0));
    ctx.predicted = null;
    _updateStyleWarnings(ctx);
    return;
  }

  try {
    const filter = {
      elementRules:  w.tblElementRules  ? w.tblElementRules.getRules()  : [],
      diagramRules:  w.tblDiagramRules  ? w.tblDiagramRules.getRules()  : [],
      relationRules: w.tblRelationRules ? w.tblRelationRules.getRules() : [],
    };

    // Filtered base — only the elements survive the element filter and feed the steps.
    // Explicit relations in the selection are not counted: the view's relations are derived
    // from the elements (rels-between-filtered-elements, computed below).
    let diagrams = 0;
    /** @type {ArchiElement[]} */
    const filteredElements = [];
    for (const o of objects) {
      const t = o.type || "";
      if (t.endsWith("-relationship")) continue;
      if (t in DIAGRAM_TYPES) { if (Pipeline.diagramPasses(filter.diagramRules, t)) diagrams++; }
      // Casts: neither a relation nor a diagram object, so an element.
      else if (RuleLists.matchElement(filter.elementRules, /** @type {ArchiElement} */ (o))) filteredElements.push(/** @type {ArchiElement} */ (o));
    }

    // Collect relations incrementally: base uses the global relation rules; each step its own
    // rules — mirrors the pipeline exactly so Adds: counters match the view.
    // seenRelIds is threaded across calls to prevent double-counting.
    /** @type {Set<string>} */
    const seenRelIds = new Set();
    const finalRels  = Pipeline.findRelationsBetween(filteredElements, Pipeline.globalRelationMatch(filter), seenRelIds);

    // Global filter counters, per rule in its type combo.
    // Cast: filtered to elements.
    const rawElements = /** @type {ArchiElement[]} */ (objects.filter(o => { const t = o.type || ""; return !t.endsWith("-relationship") && !(t in DIAGRAM_TYPES); }));
    const rawDiagrams = objects.filter(o => (o.type || "") in DIAGRAM_TYPES);
    if (w.tblElementRules) w.tblElementRules.setCounts(_filterRuleCounts(w.tblElementRules, rawElements,
      (list, o) => RuleLists.matchElement(list, o)));
    if (w.tblDiagramRules) w.tblDiagramRules.setCounts(_filterRuleCounts(w.tblDiagramRules, rawDiagrams,
      (list, o) => Pipeline.diagramPasses(list, o.type || "")));
    if (w.tblRelationRules) w.tblRelationRules.setCounts(_filterRuleCounts(w.tblRelationRules,
      Pipeline.findRelationsBetween(filteredElements, null, new Set()),
      (list, r) => RuleLists.matchRelation(list, r.type, r.source && r.source.type, r.target && r.target.type, true)));

    // Walk steps under chain semantics: step 1's input is the filtered base; step N
    // (N≥2)'s input is step N-1's added elements only. An empty step terminates the chain.
    let cumulative = filteredElements.slice();
    let stepInput  = filteredElements.slice();
    for (const b of (ctx.relBlocks || [])) {
      const step = { repeat: b.getRepeat(), rules: b.table.getRules() };
      const seenBefore = new Set(seenRelIds);
      const { added, rels: stepRels, cumulative: newCumul, runs, capped, candidates } =
        Pipeline.expandStepWithRelations(stepInput, step, cumulative, seenRelIds);
      // Candidates: everything the step saw before its rules — the rules' property lists.
      b.candidates = candidates;
      b.table.refreshItems();
      b.table.setCounts(_stepRuleCounts(b, step, stepInput, cumulative, seenBefore,
        { elements: added.length, relations: stepRels.length }));
      cumulative = newCumul;
      stepRels.forEach(r => finalRels.push(r));
      const runInfo = step.repeat !== Defs.REPEAT_UNTIL_NOTHING_NEW ? ""
        : capped ? `  (stopped at max ${Defs.REPEAT_MAX}×)` : `  (nothing new after ${runs}×)`;
      _setRel(b, added.length, stepRels.length, runInfo);
      stepInput = added;                                                       // chain advance
    }
    // What the view will hold — Appearance uses it for property lists and the ⚠ conflict check.
    ctx.predicted = { elements: cumulative, relations: finalRels };

    // Predict view-level counts (duplicates, containers) using the current params.
    // The on-screen Output row + console block must reflect what the writer will produce.
    const livePresetParams = {
      nestingRules:         w.tblNestingRules ? w.tblNestingRules.getRules() : [],
      reverseRules:         w.tblReverseRules ? w.tblReverseRules.getRules() : [],
    };
    const view = Pipeline.predictViewCounts(cumulative, finalRels, diagrams, livePresetParams, ctx.visuals);
    _updateLayoutRuleCounts(ctx, cumulative, finalRels, livePresetParams);

    // Update the on-screen Output line in the "Generated view" group (always visible,
    // multi-line, hide-zero per the canonical-vocabulary plan).
    if (w.lblViewTotals) {
      try {
        w.lblViewTotals.setText(_formatOutputLine(view));
        if (ctx.area) ctx.area.layout(true, true);  // the line count may change
      } catch (e) {}
    }
  } catch (e) {
    (ctx.relBlocks || []).forEach(b => _setRel(b, 0, 0));
  }
  _updateStyleWarnings(ctx);
}

// ── Selection tab ─────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 * @param {SelectionCounts} selectedCount
 * @param {SelectionCounts} containingCount
 */
function _buildSelectionTab(tabFolder, ctx, selectedCount, containingCount) {
  const { page, scrolled, finish } = _scrolledTab(tabFolder, "Selection");
  const w = ctx.widgets;
  const selected   = selectedCount   || { elems: 0, rels: 0, views: 0, folders: 0, diagrams: 0 };
  const containing = containingCount || { elems: 0, rels: 0, diagrams: 0, views: 0, folders: 0 };

  // Stash for runtime resize hooks (block add/remove/collapse, shell resize).
  ctx.selectionScrolled = scrolled;
  ctx.selectionPage     = page;

  // Recompute the ScrolledComposite's min-size whenever the shell width changes,
  // so the page reflows to the current viewport width before scrolling kicks in.
  try {
    const ControlListenerJ = Java.type("org.eclipse.swt.events.ControlListener");
    scrolled.addControlListener(ControlListenerJ.controlResizedAdapter(e => _resizeScrolled(scrolled, page)));
  } catch (e) {}

  // ── Current selection ────────────────────────────────────────────────────────
  // Three 2-col counter rows (Selected / Containing / Filtered) + the global Filter
  // as a labelled section directly underneath, all inside one Group.
  const grpInfo = _group(page, "Current selection", 1, { marginH: 8, marginV: 6, spaceH: 0, spaceV: 3 });

  // 2-col sub-composite: [fixed-width label] [count text, grabs width]
  const ctrComp = new CompositeWidget(grpInfo, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 2).applyTo(ctrComp);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(ctrComp);

  new LabelWidget(ctrComp, SWT.NONE).setText("Selected in Archi:");
  w.lblSelectedCount = _selLine(ctrComp);
  w.lblSelectedCount.setText(_formatCountsBody(selected, ctx.firstObject));
  w.lblSelectedCount.setToolTipText(
    "Raw count of what you picked in Archi (model tree or canvas), before expansion or filtering.");

  new LabelWidget(ctrComp, SWT.NONE).setText("Containing:");
  w.lblContainingCount = _selLine(ctrComp);
  w.lblContainingCount.setText(_formatCountsBody(containing));
  w.lblContainingCount.setToolTipText(
    "After recursively expanding folders to their elements and views to their visual contents.");

  // Horizontal rule separating count lines from the filter sub-section.
  const filterSep = new LabelWidget(grpInfo, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(filterSep);

  const onFilterChange = () => _updateFilteredCount(ctx);

  const onSelLayout = () => {
    try { ctx.selectionPage.layout(true, true); } catch (e) {}
    _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  };

  _lbl(grpInfo, "Filter selection by element type (no Include rule = keep all, minus Exclude):");
  w.tblElementRules = ruleTable(grpInfo, {
    kind: "element", columns: ELEMENT_RULE_COLUMNS, filterList: true, propCondition: true,
    onChange: onFilterChange, onLayout: onSelLayout,
    propItems:  r => _propNames(_rawElements(ctx, r.elementType)),
    valueItems: r => _propValues(_rawElements(ctx, r.elementType), r.property),
  });

  // Diagram objects only come from selected views: without them the diagram filter is hidden
  // (its rules are kept and saved).
  const diagBox = new CompositeWidget(grpInfo, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 4).applyTo(diagBox);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(diagBox);
  _lbl(diagBox, "Filter selection by diagram type (no Include rule = keep all, minus Exclude):");
  w.tblDiagramRules = ruleTable(diagBox, {
    kind: "diagram", columns: DIAGRAM_RULE_COLUMNS, filterList: true, onChange: onFilterChange, onLayout: onSelLayout,
  });
  const hasDiagramObjects = (ctx.rawModelObjects || []).some(o => (o.type || "") in DIAGRAM_TYPES);
  diagBox.setVisible(hasDiagramObjects);
  diagBox.getLayoutData().exclude = !hasDiagramObjects;

  _lbl(grpInfo, "Filter selection by relations (no Include rule = keep all, minus Exclude):");
  w.tblRelationRules = ruleTable(grpInfo, {
    kind: "relation", columns: FILTER_RELATION_RULE_COLUMNS, filterList: true, onChange: onFilterChange, onLayout: onSelLayout,
  });

  // ── Expand selection ─────────────────────────────────────────────────────────
  // One block per step; each holds a rule table. "+ Add step" sits below the steps.
  const grpRel = _group(page, "Expand selection", 1);

  const lblExplain = new LabelWidget(grpRel, SWT.WRAP);
  lblExplain.setText("Expand the selection with connected elements. Each step defines which relation to follow.");
  GridDataFactory.fillDefaults().grab(true, false).hint(420, SWT.DEFAULT).applyTo(lblExplain);

  const blocksContainer = new CompositeWidget(grpRel, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 8).applyTo(blocksContainer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(blocksContainer);
  w.blocksContainer = blocksContainer;

  const btnAddBlock = new ButtonWidget(grpRel, SWT.PUSH);
  btnAddBlock.setText("+ Add step");
  btnAddBlock.setToolTipText("Each step builds on the previous selection.");
  GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(btnAddBlock);
  btnAddBlock.addListener(SWT.Selection, () => _addRelatedBlock(ctx));

  finish();
}

// ── Property lists for rule tables ───────────────────────────────────────────

/**
 * Sorted property names found on the objects.
 * @param {readonly ArchiProxy[]} objs
 */
function _propNames(objs) {
  const names = new Set();
  for (const o of objs || []) {
    try { const ks = o.prop(); if (Array.isArray(ks)) ks.forEach(k => { if (k) names.add(String(k)); }); } catch (e) {}
  }
  return Array.from(names).sort((a, b) => a.localeCompare(b));
}

/**
 * Sorted non-empty values of one property on the objects.
 * @param {readonly ArchiProxy[]} objs
 * @param {string} key
 */
function _propValues(objs, key) {
  if (!key) return [];
  const vals = new Set();
  for (const o of objs || []) {
    try { const v = o.prop(key); if (v !== null && v !== undefined && v !== "") vals.add(String(v)); } catch (e) {}
  }
  return Array.from(vals).sort((a, b) => a.localeCompare(b));
}

/**
 * Elements of the raw selection, optionally of one type.
 * @param {DialogContext} ctx
 * @param {string} type
 */
function _rawElements(ctx, type) {
  return (ctx.rawModelObjects || []).filter(o => _ELEM_TYPE_SET.has(o.type) && (!type || o.type === type));
}

/**
 * Per-rule counts of a step: what the step adds with this rule alone — same input, same repeat —
 * so a rule's count changes only when the rule or the step input changes, never because another
 * rule was added. An Exclude rule: what it removes from the other rules' result. Results are
 * cached per rule and input, so adding a rule computes only the new one.
 * @param {StepBlock}      b
 * @param {Step}           step
 * @param {ArchiElement[]} input
 * @param {ArchiElement[]} cumulative
 * @param {Set<string>}    seen
 * @param {{elements:number, relations:number}} total  what the step adds with all its rules
 * @returns {{elements:number, relations:number}[]}  one entry per displayed rule; a rule that is
 *   off is counted as if it were on
 */
function _stepRuleCounts(b, step, input, cumulative, seen, total) {
  const rules = b.table.displayedRules();
  if (!b.countCache || b.countCache.size > 500) b.countCache = new Map();
  const sig = `${step.repeat}|${_idsSig(input)}|${_idsSig(cumulative)}|${_idsSig(Array.from(seen))}`;
  /** @param {StepRule[]} list */
  const run = list => {
    const key = `${sig}|${JSON.stringify(list)}`;
    let r = /** @type {Map<string, { elements: number, relations: number }>} */ (b.countCache).get(key);   // Cast: created above
    if (!r) {
      const res = Pipeline.expandStepWithRelations(input, { repeat: step.repeat, rules: list }, cumulative, new Set(seen));
      r = { elements: res.added.length, relations: res.rels.length };
      /** @type {Map<string, { elements: number, relations: number }>} */ (b.countCache).set(key, r);
    }
    return r;
  };
  return rules.map((r, i) => {
    const asOn = Object.assign({}, r, { on: true });
    if (r.mode !== "exclude") return run([asOn]);
    const others  = rules.filter((_, j) => j !== i);
    const without = run(others);
    const withIt  = r.on === false ? run([...others, asOn]) : total;
    return { elements: without.elements - withIt.elements, relations: without.relations - withIt.relations };
  });
}

/**
 * Short signature of a list of objects (or ids) for cache keys: count + FNV-1a hash of the ids.
 * @param {readonly any[]} list  objects with an id, or ids
 */
function _idsSig(list) {
  let h = 0x811c9dc5;
  for (const o of list) {
    const id = String(o && o.id !== undefined ? o.id : o);
    for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    h ^= 0x2c; h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${list.length}:${h.toString(16)}`;
}

/**
 * The objects a step rule's property is read from, among the step's candidates.
 * @param {StepBlock} b
 * @param {StepRule} rule
 */
function _stepPropObjects(b, rule) {
  const probe = [Object.assign({}, rule, { mode: "include", property: "", value: "" })];
  return (b.candidates || []).filter(c => RuleLists.matchStep(probe, c)).map(c =>
    rule.propertyOf === "relation" ? c.rel : rule.propertyOf === "previous" ? c.frontier : c.other);
}

/**
 * The objects a nesting / reverse rule's property is read from, among the predicted view's relations.
 * @param {DialogContext} ctx
 * @param {RelationRule} rule
 */
function _relPropObjects(ctx, rule) {
  const probe = [Object.assign({}, rule, { on: true, mode: "include", property: "", value: "" })];
  return (ctx.viewRelations || [])
    .filter(r => RuleLists.matchRelation(probe, r.type, r.source && r.source.type, r.target && r.target.type, false))
    .map(r => RuleLists.relationPropObject(rule, r));
}

// ── Expand selection: step blocks ─────────────────────────────────────────────

// Append a new step block.
// stepData (optional): { repeat, rules } from a preset to restore.
/**
 * @param {DialogContext} ctx
 * @param {Step} [stepData]
 */
function _addRelatedBlock(ctx, stepData) {
  const w = ctx.widgets;
  const blocksContainer = w.blocksContainer;
  const onChange = () => _updateFilteredCount(ctx);
  const onLayout = () => {
    try { ctx.selectionPage.layout(true, true); } catch (e) {}
    _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  };

  // Frame without a native title: the header row below carries the title, so collapsing
  // (triangle left) and moving (arrows right) look different and sit apart.
  const block = new GroupWidget(blocksContainer, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 4).applyTo(block);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(block);

  // Header row: [▾] Step N · summary (grabs) [↑] [↓]   [✕]
  const header = new CompositeWidget(block, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0, 0).spacing(4, 0).applyTo(header);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(header);

  /**
   * @param {string} txt
   * @param {string} tip
   * @param {number} [indent]
   */
  const _hdrBtn = (txt, tip, indent) => {
    const b = new ButtonWidget(header, SWT.PUSH);
    b.setText(txt);
    b.setToolTipText(tip);
    GridDataFactory.swtDefaults().hint(28, 22).indent(indent || 0, 0).applyTo(b);
    return b;
  };
  const btnCollapse = _hdrBtn("▾", "Collapse / expand this step");

  const lblTitle = new LabelWidget(header, SWT.NONE);
  const f = _getBoldFont(); if (f) try { lblTitle.setFont(f); } catch (e) {}
  lblTitle.setToolTipText("Collapse / expand this step");
  GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(lblTitle);

  const lblBlockCounts = new LabelWidget(header, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.CENTER).applyTo(lblBlockCounts);
  lblBlockCounts.setToolTipText(
    "What THIS step adds on top of the base (delta, not cumulative). " +
    "Filtered + every step's added = total on the view.");

  const btnUp     = _hdrBtn("↑", "Move this step up");
  const btnDown   = _hdrBtn("↓", "Move this step down");
  const btnRemove = _hdrBtn("✕", "Remove this step", 12);

  // Horizontal rule separating header from body.
  const blkSep = new LabelWidget(block, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(blkSep);

  // Body (collapsible). Use GridData.exclude on collapse so layout reclaims the space.
  const body = new CompositeWidget(block, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 4).applyTo(body);
  body.setLayoutData(GridDataFactory.fillDefaults().grab(true, false).create());

  const repeatTip =
    "How many times this step runs. Each run starts from the previous run's additions. " +
    `"until nothing new" runs until a run adds nothing (at most ${Defs.REPEAT_MAX}×).`;
  // Typed initializer: tsc would otherwise narrow it to null, as it is set inside the footer callback.
  let cmbRepeat = /** @type {Swt.Combo | null} */ (null);
  // Cast: table is set right below.
  const blockObj = /** @type {StepBlock} */ ({
    container: block, header, body, blkSep, lblTitle, lblBlockCounts,
    btnUp, btnDown, btnCollapse, btnRemove,
    collapsed: false, addsText: "nothing", candidates: /** @type {StepCandidate[]} */ ([]),
    getRepeat: () => Defs.REPEAT_OPTIONS[Math.max(0, cmbRepeat ? cmbRepeat.getSelectionIndex() : 0)].value,
  });

  blockObj.table = ruleTable(body, {
    kind: "step", columns: STEP_RULE_COLUMNS, filterList: true, propCondition: true,
    onChange: () => { _refreshBlockHeader(blockObj); onChange(); }, onLayout,
    propItems:  r => _propNames(_stepPropObjects(blockObj, r)),
    valueItems: r => _propValues(_stepPropObjects(blockObj, r), r.property),
    footer: footer => {
      const lblRepeat = new LabelWidget(footer, SWT.NONE);
      lblRepeat.setText("Repeat:");
      lblRepeat.setToolTipText(repeatTip);
      cmbRepeat = new ComboWidget(footer, SWT.READ_ONLY | SWT.DROP_DOWN);
      // Cast: assigned just above; tsc does not keep the narrowing inside the callback.
      Defs.REPEAT_OPTIONS.forEach(o => /** @type {Swt.Combo} */ (cmbRepeat).add(o.label));
      cmbRepeat.select(0);
      cmbRepeat.setToolTipText(repeatTip);
      cmbRepeat.addListener(SWT.Selection, onChange);
    },
  });
  blockObj.table.setRules(stepData ? stepData.rules : []);
  if (stepData) {
    const r = Defs.normalizeRepeat(stepData.repeat);
    // Cast: set by the footer callback, which ruleTable calls before it returns.
    /** @type {Swt.Combo} */ (cmbRepeat).select(Math.max(0, Defs.REPEAT_OPTIONS.findIndex(o => o.value === r)));
  }
  ctx.relBlocks.push(blockObj);

  btnUp.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, -1));
  btnDown.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, +1));
  btnCollapse.addListener(SWT.Selection, () => _toggleCollapseBlock(ctx, blockObj));
  lblTitle.addListener(SWT.MouseUp, () => _toggleCollapseBlock(ctx, blockObj));
  lblBlockCounts.addListener(SWT.MouseUp, () => _toggleCollapseBlock(ctx, blockObj));
  btnRemove.addListener(SWT.Selection, () => _removeRelatedBlock(ctx, blockObj));


  _renumberAndReorderRelBlocks(ctx);
  _updateFilteredCount(ctx);
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

// Header summary: "· Adds: …"; collapsed, it also names the number of rules.
/** @param {StepBlock} b */
function _refreshBlockHeader(b) {
  if (!b || !b.lblBlockCounts) return;
  const n = b.table ? b.table.displayedRules().length : 0;
  const rulesPart = b.collapsed ? `${n} rule${n === 1 ? "" : "s"} · ` : "";
  try { b.lblBlockCounts.setText(`·  ${rulesPart}Adds: ${b.addsText || "nothing"}`); } catch (e) {}
}

/**
 * @param {StepBlock} b
 * @param {boolean} collapsed
 */
function _setBlockCollapsed(b, collapsed) {
  b.collapsed = collapsed;
  for (const part of [b.body, b.blkSep]) {
    try { part.setVisible(!collapsed); } catch (e) {}
    const gd = part.getLayoutData();
    if (gd) gd.exclude = collapsed;
  }
  try { b.btnCollapse.setText(collapsed ? "▸" : "▾"); } catch (e) {}
  _refreshBlockHeader(b);
}

/**
 * @param {DialogContext} ctx
 * @param {StepBlock} blockObj
 */
function _removeRelatedBlock(ctx, blockObj) {
  const i = ctx.relBlocks.indexOf(blockObj);
  if (i < 0) return;
  try { blockObj.container.dispose(); } catch (e) {}
  ctx.relBlocks.splice(i, 1);
  _renumberAndReorderRelBlocks(ctx);
  _updateFilteredCount(ctx);
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

/**
 * @param {DialogContext} ctx
 * @param {StepBlock} blockObj
 * @param {number} direction  -1 up, +1 down
 */
function _moveRelatedBlock(ctx, blockObj, direction) {
  const i = ctx.relBlocks.indexOf(blockObj);
  if (i < 0) return;
  const j = i + direction;
  if (j < 0 || j >= ctx.relBlocks.length) return;
  const tmp = ctx.relBlocks[i];
  ctx.relBlocks[i] = ctx.relBlocks[j];
  ctx.relBlocks[j] = tmp;
  _renumberAndReorderRelBlocks(ctx);
  _updateFilteredCount(ctx);
}

/**
 * @param {DialogContext} ctx
 * @param {StepBlock} blockObj
 */
function _toggleCollapseBlock(ctx, blockObj) {
  _setBlockCollapsed(blockObj, !blockObj.collapsed);
  try { ctx.selectionPage.layout(true, true); } catch (e) {}
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

// Reorder block widgets to match ctx.relBlocks order, then update the title ("Step N") and
// the enabled state of the move buttons.
/** @param {DialogContext} ctx */
function _renumberAndReorderRelBlocks(ctx) {
  ctx.relBlocks.forEach((b, i) => {
    try { b.lblTitle.setText("Step " + (i + 1)); } catch (e) {}
    b.btnUp.setEnabled(i > 0);
    b.btnDown.setEnabled(i < ctx.relBlocks.length - 1);
  });

  // Reorder block widgets so display order matches the array.
  /** @type {Swt.Group | null} */
  let prevBlk = null;
  for (const b of ctx.relBlocks) {
    if (prevBlk) { try { b.container.moveBelow(prevBlk); } catch (e) {} }
    prevBlk = b.container;
  }

  if (ctx.widgets.blocksContainer) {
    try { ctx.widgets.blocksContainer.layout(true, true); } catch (e) {}
    try { ctx.widgets.blocksContainer.getShell().layout(true, true); } catch (e) {}
  }
}

// ── Layout tab ────────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function _buildLayoutTab(tabFolder, ctx) {
  const { page, scrolled, finish } = _scrolledTab(tabFolder, "Layout");
  const w = ctx.widgets;
  ctx.layoutScrolled = scrolled;
  ctx.layoutPage     = page;
  page.getLayout().verticalSpacing = 8;          // between boxes
  const BOX = { marginH: 8, marginV: 6 };       // inside a box

  // ── Algorithm ─────────────────────────────────────────────────────────────────
  // Algorithm selection is a table, one row per style: [Style label:] [○ Algo] [○ Algo] …
  // All radio buttons are in the same composite so SWT auto-groups them (mutually exclusive).
  const grpAlg = _group(page, "Algorithm", 4, Object.assign({ spaceH: 6 }, BOX));

  // Algorithm radio table spans all 4 columns of grpAlg: a label column plus one per algorithm
  // of the largest style.
  const maxAlgCols = Math.max(...Object.values(STYLES).map(s => s.algorithms.length));
  const algTableComp = new CompositeWidget(grpAlg, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1 + maxAlgCols).margins(0, 0).spacing(GAP_PAIR, 3).applyTo(algTableComp);
  GridDataFactory.swtDefaults().span(4, 1).applyTo(algTableComp);

  /** @type {Map<string, Swt.Button>} */
  const algRadios = new Map();

  Object.entries(STYLES).forEach(([styleName, style]) => {
    // Style label — natural width, tooltip from STYLES.
    const styleLbl = new LabelWidget(algTableComp, SWT.NONE);
    styleLbl.setText(styleName + ":");
    if (style.tooltip) styleLbl.setToolTipText(style.tooltip);
    GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(styleLbl);

    // Radio buttons for this style's algorithms, then empty labels for vacant slots. Columns
    // are as wide as their widest radio; nothing stretches with the dialog.
    for (let i = 0; i < maxAlgCols; i++) {
      const algName = style.algorithms[i];
      if (algName) {
        const alg = ALGORITHMS[algName];
        const radio = new ButtonWidget(algTableComp, SWT.RADIO);
        radio.setText(algName);
        if (alg.tooltip) radio.setToolTipText(alg.tooltip);
        GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(radio);
        algRadios.set(algName, radio);
        radio.addListener(SWT.Selection, () => { if (radio.getSelection()) { _updateAlgorithmControls(ctx); } });
      } else {
        new LabelWidget(algTableComp, SWT.NONE);  // empty slot
      }
    }
  });

  w.algRadios = algRadios;

  // Groups in the order of deciding: structure (Relations, Containers), then Flow, Elements,
  // Connections, View size. Settings the chosen algorithm does not use are greyed out.
  // Containers, Flow, Elements and Connections share one heading column (heading | label
  // control | …) — see _formRow / _alignFormColumns.
  /** @type {Swt.Composite[]} */
  const formRows = [];
  /** @type {Swt.Composite} */
  let row;

  // Nesting / reverse / show-in-every alter the on-view role split (nestings vs connections,
  // containers vs nested elements, occurrences): refresh the live counters and dependent controls.
  const onParamsChange = () => {
    _updateFilteredCount(ctx);
    _updateNestingLevelState(ctx);  // Appearance: nesting level needs a nesting type
    _updateAlgorithmControls(ctx);  // Containers / Container types need a nesting type
  };

  // ── Nesting · Reverse ─────────────────────────────────────────────────────────
  const grpNest = _group(page, "Nesting", 1, BOX);
  const onLayoutPage = () => {
    try { ctx.layoutPage.layout(true, true); } catch (e) {}
    _resizeScrolled(ctx.layoutScrolled, ctx.layoutPage);
  };
  _lbl(grpNest, "Draw these relations as nesting, child inside its parent:")
    .setToolTipText(Defs.paramTooltip("nestingRules"));
  /** @type {Partial<RuleTableOptions<"relation">>} */
  const relPropItems = {
    propCondition: true, placeholder: true,
    propItems:  r => _propNames(_relPropObjects(ctx, r)),
    valueItems: r => _propValues(_relPropObjects(ctx, r), r.property),
  };
  // Casts: Object.assign widens kind to string.
  w.tblNestingRules = ruleTable(grpNest, /** @type {RuleTableOptions<"relation">} */ (Object.assign({
    kind: "relation", columns: NESTING_RULE_COLUMNS, onChange: onParamsChange, onLayout: onLayoutPage,
    emptyText: "No nesting: every relation is drawn as a line.",
    addTooltip: "Add a rule. Include picks relations to nest; Exclude takes relations out of those. " +
                "Without an Include rule nothing is nested.",
  }, relPropItems)));
  grpNest.setToolTipText("The parent is the source — or the target if the relation is also in Reverse.");
  w.lblNestingNote = _noteLabel(grpNest, "");
  w.lblNestingNote.getLayoutData().exclude = true;
  w.lblNestingNote.setVisible(false);


  const grpRev = _group(page, "Reverse", 1, BOX);
  _lbl(grpRev, "Flip these relations:")
    .setToolTipText(Defs.paramTooltip("reverseRules"));
  w.tblReverseRules = ruleTable(grpRev, /** @type {RuleTableOptions<"relation">} */ (Object.assign({
    kind: "relation", columns: REVERSE_RULE_COLUMNS, onChange: onParamsChange, onLayout: onLayoutPage,
    emptyText: "No relations are reversed.",
    addTooltip: "Add a rule. Include picks relations to reverse; Exclude takes relations out of those. " +
                "Without an Include rule nothing is reversed.",
  }, relPropItems)));
  w.lblReverseNote = _noteLabel(grpRev, "");
  w.lblReverseNote.getLayoutData().exclude = true;
  w.lblReverseNote.setVisible(false);
  grpRev.setToolTipText("Flow: laid out from target to source, against the Direction in the Flow box (arrows unchanged).\n" +
                        "Nesting: if the relation is also nested, the target becomes the parent.");

  // ── Containers ────────────────────────────────────────────────────────────────
  const grpCtr = _group(page, "Containers", 1, BOX);
  row = _formRow(grpCtr, "Layout:", formRows);
  _addCombo(row, "Layout inside", CONTAINER_ALGO_LABELS,   0, SWT.DEFAULT, "cmbContainerAlgorithm", w);
  _addCombo(row, "Connections",   CONNECTIONS_MODE_LABELS, 0, SWT.DEFAULT, "cmbConnectionsMode", w);
  _addSpinnerRow(row, "Padding", "spinPadding", DP.padding, 0, 200, 5, w);
  w.cmbContainerAlgorithm.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));
  w.cmbConnectionsMode.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));

  row = _formRow(grpCtr, "Options:", formRows, "ctrOptions");
  _addCheck(row, "Sort containers", null, 2, w, "chkSortContainers");
  row = _formRow(grpCtr, "", formRows, "ctrOptions");
  _addCheck(row, "Same width per level", null, 2, w, "chkAlignWidthSameType");
  _addCheck(row, "Snap columns to grid", null, 2, w, "chkSnapColumns");
  w.grpContainers = grpCtr;

  // ── Flow ──────────────────────────────────────────────────────────────────────
  const grpFlow = _group(page, "Flow", 1, BOX);
  row = _formRow(grpFlow, "Order:", formRows, "form", 2);
  _addCombo(row, "Direction", DIRECTION_LABELS, 0, SWT.DEFAULT, "cmbDirection", w);
  _addCombo(row, "Cycles",    ACYCLICER_LABELS, 0, SWT.DEFAULT, "cmbAcyclicer", w);
  _addCombo(row, "Ranking",   RANKING_LABELS,   0, SWT.DEFAULT, "cmbRanking",   w);
  row = _formRow(grpFlow, "Layers:", formRows, "form", 2);
  _addCombo(row, "Placement", NODE_PLACEMENT_LABELS, 0, SWT.DEFAULT, "cmbNodePlacement", w);
  w.cmbNodePlacement.addListener(SWT.Selection, () => _updateComboTooltips(w));
  _addSpinnerRow(row, "Layer distance", "spinLayerSpacing", DP.layerSpacing, 0, 2000, 20, w);

  // ── Elements ──────────────────────────────────────────────────────────────────
  const grpEl = _group(page, "Elements", 1, BOX);
  row = _formRow(grpEl, "Size:", formRows, "form", 2);
  _addSpinnerRow(row, "Width",  "spinElementWidth",  DP.elementWidth,  10, 1000, 10, w);
  _addCheck(row, "Use label width", null, 2, w, "chkLabelSizing");
  _addSpinnerRow(row, "Wrap label at", "spinLabelMaxLineWidth", DP.labelMaxLineWidth, 60, 2000, 20, w);
  row = _formRow(grpEl, "", formRows, "form", 2);
  _addSpinnerRow(row, "Height", "spinElementHeight", DP.elementHeight, 10,  500, 10, w);
  w.chkLabelSizing.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));
  row = _formRow(grpEl, "Spacing:", formRows, "form", 2);
  _addSpinnerRow(row, "Distance", "spinElementSpacing", DP.elementSpacing, 0, 500, 5, w);
  row = _formRow(grpEl, "Order:", formRows, "form", 2);
  _addCombo(row, null, ELEMENT_ORDER_LABELS, 0, SWT.DEFAULT, "cmbElementOrder", w);
  _addCheck(row, "Cycle", null, 2, w, "chkCycleElementOrder");

  // ── Connections ───────────────────────────────────────────────────────────────
  const grpCon = _group(page, "Connections", 1, BOX);
  row = _formRow(grpCon, "Line:", formRows, "form", 2);
  _addCombo(row, "Routing", ROUTING_ALL,   0, SWT.DEFAULT, "cmbRouting",       w);
  w.cmbRouting.addListener(SWT.Selection, () => _updateComboTooltips(w));
  _addCombo(row, "Label",   LABEL_POS_ALL, 1, SWT.DEFAULT, "cmbLabelPosition", w);
  w.cmbLabelPosition.addListener(SWT.Selection, () => _updateComboTooltips(w));
  _addCheck(row, "Reserve label space", null, 2, w, "chkConnectionLabelSpacing");
  row = _formRow(grpCon, "Spacing:", formRows, "form", 2);
  _addSpinnerRow(row, "Between",    "spinConnectionSpacing",        DP.connectionSpacing, 0, 200, 5, w);
  _addSpinnerRow(row, "Distance to element", "spinConnectionElementSpacing", DP.connectionElementSpacing, 0, 200, 5, w);
  // Selection: changed by the user only (not by setSelection while a preset is loaded)
  w.spinElementSpacing.addListener(SWT.Selection, () => _keepConnectionRoom(ctx, "element"));
  w.spinConnectionElementSpacing.addListener(SWT.Selection, () => _keepConnectionRoom(ctx, "connection"));

  _alignFormColumns(formRows);

  // ── View size ─────────────────────────────────────────────────────────────────
  const grpVS = _group(page, "View size", 1, BOX);

  // Inline row: ● Free  ○ Aspect ratio [combo]  ○ Max width [spinner]
  // All three radios live in the same composite → SWT mutual exclusion is automatic.
  const hintRow = new CompositeWidget(grpVS, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(0, 0).spacing(GAP_FIELD, 0).applyTo(hintRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hintRow);

  /**
   * @param {string} label
   * @param {boolean} [first]
   */
  const _vsRadio = (label, first) => {
    const r = new ButtonWidget(hintRow, SWT.RADIO);
    r.setText(label);
    GridDataFactory.swtDefaults().indent(first ? 0 : GAP_PAIR - GAP_FIELD, 0).applyTo(r);
    r.addListener(SWT.Selection, () => { if (r.getSelection()) _applyViewSizeMode(ctx); });
    return r;
  };

  w.radioViewSizeNone = _vsRadio("Free", true);
  w.radioViewSizeNone.setSelection(true);
  w.radioViewSizeNone.setToolTipText("No size constraint: the layout determines the view size.");

  w.radioViewSizeAspectRatio = _vsRadio("Aspect ratio:");
  _addCombo(hintRow, null, AR_LABELS, 0, 150, "cmbAspectRatio", w);
  w.cmbAspectRatio.addListener(SWT.Selection, () => _updateConnectionsMode(ctx));

  w.radioViewSizeMaxWidth = _vsRadio("Max width:");
  const _spMaxWidth = new SpinnerWidget(hintRow, SWT.BORDER);
  _spMaxWidth.setValues(0, 0, 99999, 0, 100, 500);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(_spMaxWidth);
  w.spinMaxWidth = _spMaxWidth;
  _spMaxWidth.addListener(SWT.Modify, () => _updateConnectionsMode(ctx));


  _applyLayoutTooltips(w);
  finish();
}

// Layout-tab tooltips from defs (Defs.paramTooltip: what · detail · Used by …).
// Combos with per-option explanations get theirs from _updateComboTooltips.
/** @param {DialogWidgets} w */
function _applyLayoutTooltips(w) {
  for (const [key, def] of Object.entries(PARAM_WIDGETS))
    if (w[def.w] && w[def.w].setToolTipText) /** @type {Swt.Control} */ (w[def.w]).setToolTipText(Defs.paramTooltip(key));   // Cast: checked just before
  // rule tables are controllers: tooltip on their heading instead
  // Cast: a list of (control, param) pairs.
  for (const [ctrl, key] of /** @type {[Swt.Control, string][]} */ ([[w.radioViewSizeAspectRatio, "aspectRatio"], [w.cmbAspectRatio, "aspectRatio"],
                             [w.radioViewSizeMaxWidth, "maxWidth"], [w.spinMaxWidth, "maxWidth"]]))
    if (ctrl) ctrl.setToolTipText(Defs.paramTooltip(key));
  _updateComboTooltips(w);
}

// Tooltip of a combo whose options each have an explanation: param text + the selected option's.
/** @param {DialogWidgets} w */
function _updateComboTooltips(w) {
  // Cast: a list of (combo, param, option tooltips) triples.
  for (const [ctrl, key, tips] of /** @type {[Swt.Combo, string, Record<string, string>][]} */ ([[w.cmbRouting, "routing", ROUTING_TOOLTIPS],
                                   [w.cmbLabelPosition, "labelPosition", LABEL_POS_TOOLTIPS],
                                   [w.cmbNodePlacement, "nodePlacement", NODE_PLACEMENT_TOOLTIPS]])) {
    if (!ctrl) continue;
    const item = String(ctrl.getText());
    ctrl.setToolTipText(Defs.paramTooltip(key, tips[item] ? `${item}: ${tips[item]}` : ""));
  }
}

// Grey explanatory line under a control.
/**
 * @param {Swt.Composite} parent
 * @param {string} text
 */
function _noteLabel(parent, text) {
  const lbl = new LabelWidget(parent, SWT.WRAP);
  lbl.setText(text);
  try { lbl.setForeground(parent.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (e) {}
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(lbl);
  _wrapToParent(lbl);
  return lbl;
}

// A wrapping label breaks at its parent's width: the width hint follows the parent on resize, so
// the label's height fits its lines (a fixed hint gives lines of one width and a height of another).
/** @param {Swt.Label} lbl */
function _wrapToParent(lbl) {
  const parent = lbl.getParent();
  parent.addListener(SWT.Resize, () => {
    try {
      const lay = parent.getLayout();
      const inner = parent.getClientArea().width - 2 * lay.marginWidth - lay.marginLeft - lay.marginRight;
      const gd = lbl.getLayoutData();
      if (inner > 50 && gd.widthHint !== inner) {
        gd.widthHint = inner;
        parent.layout(true, false);
        // The label's height changed: let the tab's scrolled area follow.
        for (let c = parent; c; c = c.getParent())
          // Cast: a tab's content is its page composite (_scrolledTab).
          if (c instanceof ScrolledCompositeWidget) { _resizeScrolled(c, /** @type {Swt.Composite} */ (c.getContent())); break; }
      }
    } catch (e) {}
  });
}

/**
 * Layout › Relations counters: per nesting / reverse rule the relations on the predicted view it
 * matches (rule alone; an Exclude rule: what it removes from the other rules' matches) and, for
 * nesting, how many of them become a nesting. A note explains nesting relations drawn as a line.
 * @param {DialogContext}   ctx
 * @param {ArchiElement[]}  elements
 * @param {ArchiRelation[]} relations
 * @param {EffectiveParams} params
 */
function _updateLayoutRuleCounts(ctx, elements, relations, params) {
  const w = ctx.widgets;
  if (!w.tblNestingRules || !w.tblReverseRules) return;
  ctx.viewRelations = relations;   // property lists of the nesting / reverse rules
  w.tblNestingRules.refreshItems();
  w.tblReverseRules.refreshItems();
  const split = Pipeline.splitNestingRels(relations, params);
  const nest  = Pipeline.resolveNesting(elements, split.nestingRels, params, ctx.visuals);
  const nestedIds = new Set(nest.parentRels.map(b => b.rel.id));
  w.tblNestingRules.setCounts(_featureRuleCounts(w.tblNestingRules, relations, nestedIds));
  w.tblReverseRules.setCounts(_featureRuleCounts(w.tblReverseRules, relations, null));

  const loops  = nest.notNestedNestingRels.filter(r => r.source && r.target && r.source.id === r.target.id).length;
  const multi  = nest.notNestedNestingRels.length - loops;
  const circ   = nest.circularNestingRels.length;
  /** @type {(n: number, s: string, p: string) => string} */
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const parts = [];
  if (multi) parts.push(`${plural(multi, "matching relation is", "matching relations are")} drawn as a line: the child already has a parent. ` +
                        "A rule with Every shows such a child in every parent.");
  if (circ)  parts.push(`${plural(circ, "matching relation forms", "matching relations form")} a circular nesting ` +
                        `(${plural(nest.cycles.length, "cycle", "cycles")}, named in the log) and ${circ === 1 ? "is" : "are"} drawn as a line.`);
  if (loops) parts.push(`${plural(loops, "self-relation is", "self-relations are")} drawn as a line.`);
  const nestNone = _noIncludeNote(w.tblNestingRules, "nested");
  const changed = [
    _setNote(w.lblNestingNote, nestNone || parts.join("\n")),
    _setNote(w.lblReverseNote, _noIncludeNote(w.tblReverseRules, "reversed")),
  ];
  if (!changed.some(Boolean)) return;
  try { ctx.layoutPage.layout(true, true); } catch (e) {}
  _resizeScrolled(ctx.layoutScrolled, ctx.layoutPage);
}

/**
 * A feature list starts from nothing: with Exclude rules but no Include rule that is on, it picks
 * nothing. The note says so; "" when the list has an Include rule that is on, or no rules.
 * @param {RuleTable<"relation">} table
 * @param {string} verb  "nested" | "reversed"
 */
function _noIncludeNote(table, verb) {
  const rules = table.getRules();
  if (!rules.some(r => r.mode === "exclude") || rules.some(r => r.on !== false && r.mode !== "exclude")) return "";
  return `No Include rule is on: nothing is ${verb}. Exclude rules only take relations out of what Include rules pick — ` +
         `add an Include rule for the relations to be ${verb}.`;
}

/**
 * Show a note label with this text, hidden when empty.
 * @param {Swt.Label | undefined} lbl
 * @param {string} text
 * @returns {boolean} whether the text changed
 */
function _setNote(lbl, text) {
  if (!lbl || String(lbl.getText()) === text) return false;
  lbl.setText(text);
  lbl.setVisible(!!text);
  lbl.getLayoutData().exclude = !text;
  return true;
}

/**
 * Per-rule counts of a global filter table: how many objects the rule keeps on its own; an
 * Exclude rule: how many it removes from the other rules' result. A rule that is off is counted
 * as if it were on: what it would keep or remove.
 * @template {"element" | "diagram" | "relation"} K
 * @template T
 * @param {RuleTable<K>} table
 * @param {T[]} objects
 * @param {(rules: RuleByKind[K][], o: T) => boolean} test  the filter list's match function
 * @returns {RuleTableCounts[]}
 */
function _filterRuleCounts(table, objects, test) {
  const rules = table.displayedRules();
  const kept  = objects.filter(o => test(rules, o)).length;
  return rules.map((rule, i) => {
    const asOn = Object.assign({}, rule, { on: true });
    if (rule.mode !== "exclude") return { count: objects.filter(o => test([asOn], o)).length };
    const others = rules.filter((_, j) => j !== i);
    const withIt = rule.on === false ? objects.filter(o => test([...others, asOn], o)).length : kept;
    return { count: objects.filter(o => test(others, o)).length - withIt };
  });
}

/**
 * Per-rule counts of a nesting / reverse table over the predicted view's relations. A rule that is
 * off is counted as if it were on (its Nested count stays empty).
 * @param {RuleTable<"relation">} table
 * @param {ArchiRelation[]} relations
 * @param {Set<string> | null} nestedIds  relations drawn as nesting; null: no Nested column
 * @returns {RuleTableCounts[]}
 */
function _featureRuleCounts(table, relations, nestedIds) {
  const rules  = table.displayedRules();
  /** @type {(list: RelationRule[], r: ArchiRelation) => boolean} */
  const match  = (list, r) => RuleLists.matchRelation(list, r.type, r.source && r.source.type, r.target && r.target.type, false, r);
  const active = rules.filter(r => r.on !== false);
  const allHits = relations.filter(r => match(active, r)).length;
  return rules.map((rule, i) => {
    const asOn = Object.assign({}, rule, { on: true });
    if (rule.mode !== "exclude") {
      const hit = relations.filter(r => match([asOn], r));
      // Nested: only for a rule that is on; what an off rule would nest needs a nesting run of its own.
      return { relations: hit.length, nested: nestedIds && rule.on !== false ? hit.filter(r => nestedIds.has(r.id)).length : undefined };
    }
    const others = rules.filter((r, j) => j !== i && r.on !== false);
    const withIt = rule.on === false ? relations.filter(r => match([...others, asOn], r)).length : allHits;
    return { relations: relations.filter(r => match(others, r)).length - withIt };
  });
}

/**
 * True when an active nesting Include rule has Every (a child appears in every parent).
 * @param {DialogWidgets} w
 */
function _hasEveryContainer(w) {
  return !!w.tblNestingRules && w.tblNestingRules.getRules().some(r => r.on !== false && r.mode !== "exclude" && r.everyContainer === true);
}

/**
 * True when a nesting rule list nests anything: an Include rule that is on.
 * @param {DialogWidgets} w
 */
function _hasNestingRules(w) {
  return !!w.tblNestingRules && w.tblNestingRules.getRules().some(r => r.on !== false && r.mode !== "exclude");
}

// True when the algorithm nests and a Nesting rule is on.
/**
 * @param {DialogWidgets} w
 * @param {AlgorithmSpec} alg
 */
function _nestingOn(w, alg) {
  return alg.activeParams.includes("nestingRules") && _hasNestingRules(w);
}

// Containers settings are greyed out until a Nesting rule is on; the box's tooltip says why.
/**
 * @param {DialogContext} ctx
 * @param {string} algName
 */
function _updateContainersHint(ctx, algName) {
  const w = ctx.widgets;
  if (!w.grpContainers) return;
  const alg = ALGORITHMS[algName];
  const usesContainers = Defs.LAYOUT_GROUPS.Containers.some(k => alg.activeParams.includes(k));
  try { w.grpContainers.setToolTipText(usesContainers && !_nestingOn(w, alg) ? "Add a Nesting rule to use these settings." : ""); } catch (e) {}
}

// ── Appearance tab helpers ────────────────────────────────────────────────────

// Sets for fast element/relation type detection within rawModelObjects.
/** @type {Set<string>} */
const _ELEM_TYPE_SET   = new Set(ELEMENT_TYPES);
/** @type {Set<string>} */
const _REL_TYPE_ID_SET = new Set(RELATION_TYPE_IDS);

// Creates a READ_ONLY combo + gradient Canvas strip side-by-side.
// Registers combo on w[key] and canvas on w[key + "Canvas"]. Returns the combo.
/**
 * @param {Swt.Composite} parent
 * @param {string} defaultName
 * @param {string} key
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string | null} tooltip
 * @param {(e: Swt.Event) => void} [onChange]
 */
function _colorRangeSelector(parent, defaultName, key, w, tooltip, onChange) {
  const cmb = new ComboWidget(parent, SWT.READ_ONLY | SWT.DROP_DOWN);
  COLOR_RANGES.forEach(r => cmb.add(r));
  const di = COLOR_RANGES.indexOf(defaultName);
  cmb.select(di >= 0 ? di : 0);
  GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(cmb);
  if (tooltip) cmb.setToolTipText(tooltip);
  w[key] = cmb;

  const canvas = new CanvasWidget(parent, SWT.NONE);
  GridDataFactory.swtDefaults().hint(100, 18).applyTo(canvas);
  w[key + "Canvas"] = canvas;

  canvas.addListener(SWT.Paint, e => {
    const bounds = canvas.getClientArea();
    // When disabled (intrinsic or inherited via parent), paint flat background.
    if (!cmb.isEnabled()) {
      e.gc.setBackground(canvas.getBackground());
      e.gc.fillRectangle(0, 0, bounds.width, bounds.height);
      return;
    }
    const idx = cmb.getSelectionIndex();
    if (idx < 0) return;
    const colors = Chroma.scale(cmb.getItem(idx)).colors(12);
    const segW = bounds.width / colors.length;
    for (let i = 0; i < colors.length; i++) {
      const hex = String(colors[i]).replace(/^#/, "");
      const col = new SWTColor(e.display,
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16));
      e.gc.setBackground(col);
      e.gc.fillRectangle(Math.round(i * segW), 0, Math.ceil(segW), bounds.height);
      col.dispose();
    }
  });

  cmb.addListener(SWT.Selection, e => { canvas.redraw(); if (onChange) onChange(e); });
  return cmb;
}

// Creates a small Canvas (24×18) showing a solid hex color.
// Registers canvas on w[key] if provided. Returns { canvas, setColor(hex) }.
/**
 * @param {Swt.Composite} parent
 * @param {string} hexColor
 * @param {string} key
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 */
function _solidColorSwatch(parent, hexColor, key, w) {
  let _hex = (hexColor || "#cccccc").replace(/^#/, "");
  const canvas = new CanvasWidget(parent, SWT.NONE);
  GridDataFactory.swtDefaults().hint(24, 18).applyTo(canvas);
  if (key && w) w[key] = canvas;

  const setColor = (/** @type {string} */ hex) => {
    if (hex && /^#[0-9a-fA-F]{6}$/.test(String(hex))) {
      _hex = String(hex).slice(1);
      canvas.redraw();
    }
  };
  // Also register setColor under key+"Set" so _syncToUI can update on preset load.
  if (key && w) w[key + "Set"] = setColor;

  canvas.addListener(SWT.Paint, e => {
    const b = canvas.getClientArea();
    if (!canvas.isEnabled()) {
      e.gc.setBackground(canvas.getBackground());
      e.gc.fillRectangle(0, 0, b.width, b.height);
      return;
    }
    const col = new SWTColor(e.display,
      parseInt(_hex.slice(0, 2), 16) || 0,
      parseInt(_hex.slice(2, 4), 16) || 0,
      parseInt(_hex.slice(4, 6), 16) || 0);
    e.gc.setBackground(col);
    e.gc.fillRectangle(0, 0, b.width, b.height);
    col.dispose();
  });

  return { canvas, setColor };
}

// Enable or disable the controls that depend on a feature being on (Highlight repeated).
// Called from the feature's checkbox and from _syncToUI.
/** @param {DialogContext} ctx */
function _updateAppearancePropStates(ctx) {
  const w = ctx.widgets;
  if (!w.chkHighlightRep) return; // appearance tab not yet built
  const hlOn = !!w.chkHighlightRep.getSelection() && _hasEveryContainer(w);
  _enable(w.lblHighlightRepRange, hlOn);
  _enable(w.cmbHighlightRepRange, hlOn);
  try { if (w.cmbHighlightRepRangeCanvas) w.cmbHighlightRepRangeCanvas.redraw(); } catch (e) {}
}

// Range cell of a style rule: colour-range combo + gradient strip (two grid cells).
/**
 * @param {Swt.Composite} parent
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @returns {RuleTableCell}
 */
function _rangeCell(parent, value, onChange) {
  // Cast: _colorRangeSelector registers the strip as rangeCanvas.
  const tmp = /** @type {{ rangeCanvas: Swt.Canvas }} */ ({});
  const cmb = _colorRangeSelector(parent, value || "Blues", "range", tmp, null,
    () => onChange(String(cmb.getText())));
  GridDataFactory.swtDefaults().hint(95, SWT.DEFAULT).align(SWT.FILL, SWT.CENTER).applyTo(cmb);
  GridDataFactory.swtDefaults().hint(36, 18).align(SWT.FILL, SWT.CENTER).applyTo(tmp.rangeCanvas);
  return {
    set: v => {
      const i = COLOR_RANGES.indexOf(v);
      if (i >= 0 && cmb.getSelectionIndex() !== i) { cmb.select(i); try { tmp.rangeCanvas.redraw(); } catch (e) {} }
    },
    enable: on => { cmb.setEnabled(on); try { tmp.rangeCanvas.redraw(); } catch (e) {} },
    setToolTipText: t => cmb.setToolTipText(t),
  };
}

// A style rule as a sentence, for the row tooltip.
/** @param {StyleRule} r */
function _styleRuleSentence(r) {
  const el  = (/** @type {string} */ t) => t ? _typeToDisplay(t) : "element";
  const rel = r.relation ? `${_typeToDisplay(r.relation.replace(/-relationship$/, ""))} relation` : "relation";
  const pat = `${rel}${r.source ? ` from ${el(r.source)}` : ""}${r.target ? ` to ${el(r.target)}` : ""}`;
  const prop = r.property ? `"${r.property}"` : "(no property chosen)";
  const of = { element: "its own", relation: "the relation's", source: "the source element's", target: "the target element's" };
  const range = `, from the ${r.colorRange} range`;
  const off = r.on === false ? " (off)" : "";
  if (r.color === "element")  return `Color every ${el(r.source)} by its own ${prop}${range}.${off}`;
  if (r.color === "relation") return `Color every ${pat} by ${of[r.propertyOf] || "its own"} ${prop}${range}.${off}`;
  const of2 = r.propertyOf === "element" ? "its own" : of[r.propertyOf];
  return `Color the ${r.color} element of every ${pat} by ${of2} ${prop}${range}.${off}`;
}

// Property names for a style rule: from the objects the predicted view holds (falls back to
// the raw selection before the first count).
/**
 * @param {DialogContext} ctx
 * @param {StyleRule} r
 */
function _stylePropItems(ctx, r) {
  const pred = ctx.predicted;
  const els  = pred ? pred.elements  : _rawElements(ctx, "");
  const rels = pred ? pred.relations : (ctx.rawModelObjects || []).filter(o => _REL_TYPE_ID_SET.has(o.type));
  const of = r.color === "element" ? "element" : r.propertyOf === "element" ? r.color : r.propertyOf;
  if (of === "relation") return _propNames(rels.filter(x => !r.relation || x.type === r.relation));
  const type = of === "target" ? r.target : r.source;
  return _propNames(els.filter(x => !type || x.type === type));
}

// ⚠ column of the style rules: rules that style the same object on the predicted view.
/** @param {DialogContext} ctx */
function _updateStyleWarnings(ctx) {
  const w = ctx.widgets;
  const t = w.tblStyleRules;
  if (!t) return;
  t.refreshItems();
  /** @type {Map<number, string>} */
  const warnings = new Map();
  /** @type {RuleTableCounts[]} */
  const counts = [];
  const pred = ctx.predicted;
  if (pred) {
    /** @type {Map<number, Set<string>>} */
    const styled = new Map();
    t.displayedRules().forEach((r, i) => {
      counts[i] = {};
      try {
        // A rule that is off is counted as if it were on, but takes no part in the conflict check.
        const targets = Appearance.computeRuleTargets(Object.assign({}, r, { on: true }), pred.elements, pred.relations);
        /** @type {Set<string>} */
        const ids = new Set();
        targets.forEach((h, id) => { if (h.values.size > 0) ids.add(`${h.kind}:${id}`); });
        // Feedback in the Property combo: colored objects, or reached objects before a property is chosen.
        counts[i] = { count: r.property ? ids.size : targets.size };
        if (r.property && r.on !== false) styled.set(i, ids);
      } catch (e) {}
    });
    RuleLists.detectRuleConflicts(styled).forEach(c => warnings.set(c.rule,
      `Rule ${c.with.map(j => j + 1).join(", ")} also styles ${c.count} of these objects. ` +
      "The last rule wins. Change a rule or switch one off."));
  }
  t.setCounts(counts);
  t.setWarnings(warnings);

  const lbl = w.lblStyleConflicts;
  if (!lbl) return;
  const text = warnings.size === 0 ? ""
    : `⚠ Rules ${Array.from(warnings.keys()).map(i => i + 1).join(", ")} style the same objects. ` +
      "The last rule wins. Change a rule or switch one off.";
  if (String(lbl.getText()) === text) return;
  lbl.setText(text);
  lbl.setVisible(!!text);
  lbl.getLayoutData().exclude = !text;
  try { ctx.appearancePage.layout(true, true); } catch (e) {}
  _resizeScrolled(ctx.appearanceScrolled, ctx.appearancePage);
}

// ── Appearance tab ────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function _buildAppearanceTab(tabFolder, ctx) {
  const { page, scrolled, finish } = _scrolledTab(tabFolder, "Appearance");
  const w = ctx.widgets;
  const onChange = () => _markModified(ctx);
  ctx.appearancePage     = page;
  ctx.appearanceScrolled = scrolled;

  // ── 1. Style by property: style rules ──────────────────────────────────────
  const grpSbp = _group(page, "Style by property", 1);

  const sbpDescLbl = new LabelWidget(grpSbp, SWT.WRAP);
  sbpDescLbl.setText("Color elements or relations by property values. Each rule says what gets the color and whose property gives the value.");
  GridDataFactory.fillDefaults().grab(true, false).hint(420, SWT.DEFAULT).applyTo(sbpDescLbl);

  const onStyleChange = () => { _markModified(ctx); _updateStyleWarnings(ctx); };
  w.tblStyleRules = ruleTable(grpSbp, {
    kind: "style", columns: STYLE_RULE_COLUMNS, onChange: onStyleChange,
    onLayout: () => {
      try { ctx.appearancePage.layout(true, true); } catch (e) {}
      _resizeScrolled(ctx.appearanceScrolled, ctx.appearancePage);
    },
    propItems: r => _stylePropItems(ctx, r),
    rowTooltip: _styleRuleSentence,
    emptyText: "No style rules.",
    addTooltip: "Add a style rule. Where two rules style the same object, the last rule wins (⚠).",
  });

  w.lblStyleConflicts = _noteLabel(grpSbp, "");
  w.lblStyleConflicts.getLayoutData().exclude = true;
  w.lblStyleConflicts.setVisible(false);

  const sbpFoot = new CompositeWidget(grpSbp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(0, 2).spacing(6, 0).applyTo(sbpFoot);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpFoot);
  const mixedTip = "Used when an element or relation gets more than one different value for the property, " +
                   "so no single color from the range applies.";
  const lblMixed = new LabelWidget(sbpFoot, SWT.NONE);
  lblMixed.setText("Mixed values color:");
  lblMixed.setToolTipText(mixedTip);
  const txtMixed = new TextWidget(sbpFoot, SWT.BORDER);
  txtMixed.setToolTipText(mixedTip);
  GridDataFactory.swtDefaults().hint(80, SWT.DEFAULT).applyTo(txtMixed);
  txtMixed.setText(DEFAULT_PRESET.appearance.styleByProperty.mixedValuesColor);
  w.txtMixedColor = txtMixed;
  const mixedSwatch = _solidColorSwatch(sbpFoot, txtMixed.getText(), "mixedSwatch", w);
  const mixedOnChange = () => { mixedSwatch.setColor(txtMixed.getText().trim()); onChange(); };
  txtMixed.addListener(SWT.FocusOut, mixedOnChange);
  txtMixed.addListener(SWT.DefaultSelection, mixedOnChange);

  const widthTip = "Line width for all relations colored by a rule with Color = Relation.";
  const lblWidth = new LabelWidget(sbpFoot, SWT.NONE);
  lblWidth.setText("Line width of styled relations:");
  lblWidth.setToolTipText(widthTip);
  GridDataFactory.swtDefaults().indent(16, 0).applyTo(lblWidth);
  const cmbWidth = new ComboWidget(sbpFoot, SWT.READ_ONLY | SWT.DROP_DOWN);
  ["No change", "1 - Normal", "2 - Medium", "3 - Heavy"].forEach(t => cmbWidth.add(t));
  cmbWidth.select(0);
  cmbWidth.setToolTipText(widthTip);
  cmbWidth.addListener(SWT.Selection, onChange);
  w.cmbStyleLineWidth = cmbWidth;

  // ── 4. Style by nesting level ─────────────────────────────────────────────
  const grpNest = _group(page, "Style by nesting level", 1);

  // Info label — shown/hidden via _updateNestingLevelState (hidden when nesting types are configured).
  const lblNestingInfo = new LabelWidget(grpNest, SWT.WRAP);
  lblNestingInfo.setText("Configure nesting types in the Layout tab to activate this feature.");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(lblNestingInfo);
  w.lblNestingInfo = lblNestingInfo;

  const nestDescLbl = new LabelWidget(grpNest, SWT.WRAP);
  nestDescLbl.setText("Adjust font size and color based on nesting level. Containers at the same level look the same.");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(nestDescLbl);
  w.nestDescLbl = nestDescLbl;

  // Font row — all controls on one line
  const nestFontRow = new CompositeWidget(grpNest, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0,2).spacing(6,0).applyTo(nestFontRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(nestFontRow);

  const chkNestFont = new ButtonWidget(nestFontRow, SWT.CHECK);
  chkNestFont.setText("Change font size with nesting level");
  chkNestFont.setToolTipText("Adjust font size based on nesting depth. Root gets the largest size.");
  chkNestFont.addListener(SWT.Selection, onChange);
  w.chkNestFont = chkNestFont;

  const nestRootFontSp = new SpinnerWidget(nestFontRow, SWT.BORDER);
  nestRootFontSp.setValues(14, 8, 24, 0, 1, 2);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestRootFontSp);
  nestRootFontSp.setToolTipText("Font size for root containers (depth 0)");
  nestRootFontSp.addListener(SWT.Selection, onChange);
  w.spinNestRootFontSize = nestRootFontSp;

  const chkNestBold = new ButtonWidget(nestFontRow, SWT.CHECK);
  chkNestBold.setText("Bold");
  chkNestBold.setToolTipText("Make root containers bold");
  chkNestBold.setSelection(true);
  chkNestBold.addListener(SWT.Selection, onChange);
  w.chkNestRootBold = chkNestBold;

  const lblNestDecrease = new LabelWidget(nestFontRow, SWT.NONE);
  lblNestDecrease.setText("Decrease/level:");
  w.lblNestDecrease = lblNestDecrease;
  const nestFontDecreaseSp = new SpinnerWidget(nestFontRow, SWT.BORDER);
  nestFontDecreaseSp.setValues(2, 1, 6, 0, 1, 1);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestFontDecreaseSp);
  nestFontDecreaseSp.setToolTipText("Reduce font size by this many points per nesting level");
  nestFontDecreaseSp.addListener(SWT.Selection, onChange);
  w.spinNestFontDecrease = nestFontDecreaseSp;

  const lblNestFontPt = new LabelWidget(nestFontRow, SWT.NONE);
  lblNestFontPt.setText("pt");
  w.lblNestFontPt = lblNestFontPt;

  // Separator between font and color
  const nestMidSep = new LabelWidget(grpNest, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, 6).applyTo(nestMidSep);
  w.nestMidSep = nestMidSep;

  // Color row — all controls on one line
  const nestColorRow = new CompositeWidget(grpNest, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0,2).spacing(6,0).applyTo(nestColorRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(nestColorRow);

  const chkNestColor = new ButtonWidget(nestColorRow, SWT.CHECK);
  chkNestColor.setText("Change color by nesting level");
  chkNestColor.setToolTipText("Lighten container fill color from root based on nesting depth.");
  chkNestColor.addListener(SWT.Selection, () => { _updateNestingLevelState(ctx); onChange(); });
  w.chkNestColor = chkNestColor;

  const nestRootColorTxt = new TextWidget(nestColorRow, SWT.BORDER);
  nestRootColorTxt.setToolTipText("Fallback color used when the chain root container has no fill color set");
  GridDataFactory.swtDefaults().hint(72, SWT.DEFAULT).applyTo(nestRootColorTxt);
  w.txtRootColor = nestRootColorTxt;
  const nestRootSwatch = _solidColorSwatch(nestColorRow, "", "nestRootSwatch", w);
  const nestRootOnChange = () => {
    nestRootSwatch.setColor(nestRootColorTxt.getText().trim());
    onChange();
  };
  nestRootColorTxt.addListener(SWT.FocusOut, nestRootOnChange);
  nestRootColorTxt.addListener(SWT.DefaultSelection, nestRootOnChange);

  const lblNestLighten = new LabelWidget(nestColorRow, SWT.NONE);
  lblNestLighten.setText("Lighten/level:");
  w.lblNestLighten = lblNestLighten;
  const nestLightenSp = new SpinnerWidget(nestColorRow, SWT.BORDER);
  nestLightenSp.setValues(15, 5, 40, 0, 5, 5);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestLightenSp);
  nestLightenSp.setToolTipText("Percentage to lighten fill color per level toward root");
  nestLightenSp.addListener(SWT.Selection, onChange);
  w.spinNestLighten = nestLightenSp;

  const lblNestLightenPct = new LabelWidget(nestColorRow, SWT.NONE);
  lblNestLightenPct.setText("%");
  w.lblNestLightenPct = lblNestLightenPct;

  // ── 5. Highlight repeated elements ───────────────────────────────────────
  const grpHighlight = _group(page, "Highlight repeated elements", 1);

  const hlDescLbl = new LabelWidget(grpHighlight, SWT.WRAP);
  hlDescLbl.setText("Elements that have multiple occurrences get the same color. Repetition becomes visible across the model.");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hlDescLbl);

  const hlRow = new CompositeWidget(grpHighlight, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(0,2).spacing(6,0).applyTo(hlRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hlRow);

  const chkHighlightRep = new ButtonWidget(hlRow, SWT.CHECK);
  chkHighlightRep.setText("Enable");
  chkHighlightRep.setToolTipText("Elements that appear more than once on this view receive a shared color per identity.\nNeeds a Nesting rule with Every.");
  chkHighlightRep.addListener(SWT.Selection, () => {
    _updateAppearancePropStates(ctx);
    onChange();
  });
  w.chkHighlightRep = chkHighlightRep;

  const hlRangeLbl = new LabelWidget(hlRow, SWT.NONE);
  hlRangeLbl.setText("Color range:");
  w.lblHighlightRepRange = hlRangeLbl;
  _colorRangeSelector(hlRow, "Pastel1", "cmbHighlightRepRange", w,
    "Color scale for assigning distinct colors to repeated element identities.", onChange);

  _updateNestingLevelState(ctx);
  _updateAppearancePropStates(ctx);
  finish();
}

// Enable/disable the "Style by nesting level" controls based on whether any nesting
// rules are configured in the Layout tab. Called from _syncToUI and when the nesting rules
// change, so both tabs stay in sync.
/** @param {DialogContext} ctx */
function _updateNestingLevelState(ctx) {
  const w = ctx.widgets;
  if (!w.chkNestFont) return; // Appearance tab not yet built — skip

  const hasNesting = _hasNestingRules(w);

  try { w.lblNestingInfo.setVisible(!hasNesting); } catch (e) {}
  try {
    const gd = w.lblNestingInfo.getLayoutData();
    gd.exclude = hasNesting;
    w.lblNestingInfo.setLayoutData(gd);
    const parent = w.lblNestingInfo.getParent && w.lblNestingInfo.getParent();
    if (parent) parent.layout(true, true);
  } catch (e) {}

  _enable(w.nestDescLbl,          hasNesting);
  _enable(w.chkNestFont,          hasNesting);
  _enable(w.spinNestRootFontSize, hasNesting);
  _enable(w.chkNestRootBold,      hasNesting);
  _enable(w.lblNestDecrease,      hasNesting);
  _enable(w.spinNestFontDecrease, hasNesting);
  _enable(w.lblNestFontPt,        hasNesting);
  _enable(w.nestMidSep,           hasNesting);
  _enable(w.chkNestColor,         hasNesting);
  _enable(w.chkHighlightRep,      _hasEveryContainer(w));  // repeats only come from rules with Every
  _updateAppearancePropStates(ctx);

  const hasColor = hasNesting && w.chkNestColor.getSelection();
  _enable(w.txtRootColor,         hasColor);
  _enable(w.nestRootSwatch,       hasColor);
  _enable(w.lblNestLighten,        hasColor);
  _enable(w.spinNestLighten,       hasColor);
  _enable(w.lblNestLightenPct,     hasColor);
  try { if (w.nestRootSwatch) w.nestRootSwatch.redraw(); } catch (e) {}
}

// ── Properties tab ───────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function _buildViewPropertiesTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "Properties");
  const w = ctx.widgets;
  const onChange = () => _markModified(ctx);

  const descLbl = new LabelWidget(page, SWT.WRAP);
  descLbl.setText("Add or update properties of the generated view(s)");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(descLbl);

  // ── Object ID ──────────────────────────────────────────────────────────────
  const grpObjId = _group(page, "Object ID", 1);

  const chkObjId = new ButtonWidget(grpObjId, SWT.CHECK);
  chkObjId.setText("Add unique Object ID");
  chkObjId.setToolTipText("Generates a UUID and writes it as the \"Object ID\" property. Skipped if the view already has one.");
  chkObjId.addListener(SWT.Selection, onChange);
  w.vpAddObjectId = chkObjId;

  const objIdNote = new LabelWidget(grpObjId, SWT.NONE);
  objIdNote.setText("Leaves existing Object ID unchanged");
  GridDataFactory.fillDefaults().indent(18, 0).applyTo(objIdNote);

  // ── View properties grid ───────────────────────────────────────────────────
  const grpViewProps = _group(page, "View properties", 3);

  // Collect all properties from all model views (excluding Object ID)
  /** @type {Map<string, Set<string>>} */
  const allViewProps = new Map();  // key → Set<value>
  try {
    $("archimate-diagram-model").each(v => {
      const keys = v.prop() || [];
      if (!Array.isArray(keys)) return;
      keys.forEach(k => {
        if (!k || k === PROP_ID) return;
        if (!allViewProps.has(k)) allViewProps.set(k, new Set());
        try {
          const val = v.prop(k);
          if (val !== null && val !== undefined && val !== "") /** @type {Set<string>} */ (allViewProps.get(k)).add(String(val));   // Cast: set above
        } catch (e) {}
      });
    });
  } catch (e) {}

  /** @type {ViewPropertyRow[]} */
  const rows = [];
  const sortedKeys = Array.from(allViewProps.keys()).sort();

  if (sortedKeys.length === 0) {
    const emptyLbl = new LabelWidget(grpViewProps, SWT.NONE);
    emptyLbl.setText("No view properties found in the current model.");
    GridDataFactory.fillDefaults().span(3, 1).applyTo(emptyLbl);
  }

  sortedKeys.forEach(key => {
    // col 1: checkbox
    const chk = new ButtonWidget(grpViewProps, SWT.CHECK);
    GridDataFactory.swtDefaults().applyTo(chk);

    // col 2: property name label
    const lbl = new LabelWidget(grpViewProps, SWT.NONE);
    lbl.setText(key);
    GridDataFactory.fillDefaults().applyTo(lbl);

    // col 3: editable combo with known values
    const cmb = new ComboWidget(grpViewProps, SWT.DROP_DOWN);
    GridDataFactory.fillDefaults().grab(true, false).hint(180, SWT.DEFAULT).applyTo(cmb);
    Array.from(/** @type {Set<string>} */ (allViewProps.get(key))).sort().forEach(v => cmb.add(v));
    _enable(cmb, false);  // greyed until checkbox is ticked

    chk.addListener(SWT.Selection, () => { _enable(cmb, chk.getSelection()); onChange(); });
    cmb.addListener(SWT.Modify, onChange);

    rows.push({ key, chk, cmb });
  });

  w.vpRows = rows;
  finish();
}

// ── View tab ──────────────────────────────────────────────────────────────────

// ── Action row (below preset) ─────────────────────────────────────────────────

// Save the settings, remember the action and close; generate_view runs after dlg.open() returns.
/**
 * @param {string} actionId
 * @param {JFace.TitleAreaDialog} dlg
 * @param {DialogContext} ctx
 */
function _runAction(actionId, dlg, ctx) {
  _saveUI(ctx);
  const nextOrder = _cycleElementOrder(ctx.config.params, actionId);
  _persistSession(ctx, nextOrder ? { elementOrder: nextOrder } : {});
  ctx._actionId = actionId;
  Common.startCounter("generate_view");
  Java.super(dlg).okPressed();
}

/**
 * Cycle: a new view starts with the selection order; each layout of an existing view takes the
 * session's order, and the session gets the next one. Sets the run's order in params.
 * @param {PresetParams} params  changed in place
 * @param {string} actionId
 * @returns {string|null} the order for the next run, or null without Cycle
 */
function _cycleElementOrder(params, actionId) {
  if (!params.cycleElementOrder) return null;
  const creates = actionId === ACTION.NEW_VIEW.id || actionId === ACTION.ONE_EACH.id;
  if (creates) params.elementOrder = ELEMENT_ORDER_LABELS[0];
  const i = ELEMENT_ORDER_LABELS.indexOf(params.elementOrder);
  return ELEMENT_ORDER_LABELS[(i + 1) % ELEMENT_ORDER_LABELS.length];
}

// Action-row button: fills cell width, bottom-aligned within group.
/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {() => void} onClick
 */
function _actionBtn(parent, label, onClick) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText(label);
  GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.END).applyTo(btn);
  btn.addListener(SWT.Selection, onClick);
  return btn;
}

// Group container with the project's standard GridData + GridLayout.
// Pass " " (single space) as label for an unlabelled-but-title-bar-reserved group.
// By default the title bar font is made bold; pass bold: false to opt out (e.g. action row groups).
/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {number} numColumns
 * @param {GroupOptions} [opts]
 */
function _group(parent, label, numColumns, opts) {
  opts = opts || {};
  const grp = new GroupWidget(parent, SWT.NONE);
  grp.setText(label);
  if (opts.bold !== false) { const f = _getBoldFont(); if (f) try { grp.setFont(f); } catch (e) {} }
  const bg = _getGroupBackground();
  if (bg) try { grp.setBackground(bg); grp.setBackgroundMode(SWT.INHERIT_DEFAULT); } catch (e) {}
  GridDataFactory.fillDefaults()
    .grab(opts.grabH !== false, opts.grabV || false)
    .applyTo(grp);
  GridLayoutFactory.fillDefaults()
    .numColumns(numColumns)
    .margins(opts.marginH || 6, opts.marginV || 4)
    .spacing(opts.spaceH || 4, opts.spaceV || 4)
    .applyTo(grp);
  return grp;
}

// Form row: heading | label control | label control | label control (FORM_COLS cells).
// _alignFormColumns lines up only the headings (one column for every registered row, also across
// groups); after the heading, each label sits right before its control and pairs follow each other.
// A checkbox takes a whole label/control pair (span 2). Rows that share a `raster` key form a
// table: every column starts at the same x — labels as wide as the widest label of their column,
// so the controls line up below each other. Controls keep their own width (spinners one width,
// combos their natural width); a checkbox spanning a pair takes its natural width. `rasterCols`
// limits the raster to the first columns (2 = the first label/control pair); cells after them
// follow each other as in a plain row.
const SPINNER_WIDTH = 65;  // every number spinner — fits 4 digits
const FORM_COLS     = 7;   // heading + 3 label/control pairs
const GAP_FIELD     = 6;   // label → its control
const GAP_PAIR      = 20;  // pair → next pair on the same row
const GAP_HEADING   = 12;  // heading → first pair
/**
 * @param {Swt.Composite} parent
 * @param {string} heading
 * @param {Swt.Composite[]} rows  every form row, for _alignFormColumns
 * @param {string} [raster]
 * @param {number} [rasterCols]
 */
function _formRow(parent, heading, rows, raster, rasterCols) {
  const row = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(FORM_COLS).margins(0, 0).spacing(0, 3).applyTo(row);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  new LabelWidget(row, SWT.NONE).setText(heading);
  row.setData("raster", raster || null);
  row.setData("rasterCols", rasterCols || FORM_COLS - 1);
  rows.push(row);
  return row;
}

/** @param {Swt.Composite[]} rows */
function _alignFormColumns(rows) {
  const cells = (/** @type {Swt.Composite} */ row) => {
    let col = 0;
    return Array.from(row.getChildren()).map(c => {
      const gd = c.getLayoutData();
      const span = (gd && gd.horizontalSpan) || 1;
      const cell = { c, col, span, natural: c.computeSize(SWT.DEFAULT, SWT.DEFAULT).x };
      col += span;
      return cell;
    });
  };
  const headingW = Math.max(0, ...rows.map(r => cells(r)[0].natural));
  const gapBefore = (/** @type {number} */ col) => col === 1 ? GAP_HEADING : col % 2 === 0 ? GAP_FIELD : GAP_PAIR;
  /** @type {(c: Swt.Control, natural: number) => number} */
  const ownWidth = (c, natural) => { const gd = c.getLayoutData(); return gd && gd.widthHint > 0 ? gd.widthHint : natural; };
  // Raster rows: per raster key, the widest single-column cell of each column, and from that
  // the x at which each column starts (x = 0 right after the heading column).
  /** @type {Map<string, { ws: number[], xs?: number[] }>} */
  const rasterX = new Map();
  for (const row of rows) {
    const key = row.getData("raster");
    if (!key) continue;
    const r = rasterX.get(key) || { ws: [] };
    const n = row.getData("rasterCols");
    for (const { c, col, span, natural } of cells(row))
      if (col > 0 && col <= n && span === 1) r.ws[col] = Math.max(r.ws[col] || 0, ownWidth(c, natural));
    rasterX.set(key, r);
  }
  // A cell spanning columns (a checkbox over a pair) widens the first of them when it does not fit.
  for (const row of rows) {
    const r = rasterX.get(row.getData("raster"));
    if (!r) continue;
    for (const { c, col, span, natural } of cells(row)) {
      if (col === 0 || span === 1 || col > row.getData("rasterCols")) continue;
      let room = r.ws[col] || 0;
      for (let k = col + 1; k < col + span; k++) room += gapBefore(k) + (r.ws[k] || 0);
      const need = ownWidth(c, natural);
      if (need > room) r.ws[col] = (r.ws[col] || 0) + need - room;
    }
  }
  for (const r of rasterX.values()) {
    r.xs = [];
    let x = 0;
    for (let col = 1; col < FORM_COLS; col++) { x += gapBefore(col); r.xs[col] = x; x += r.ws[col] || 0; }
  }
  for (const row of rows) {
    const r = rasterX.get(row.getData("raster"));
    const n = row.getData("rasterCols");
    let x = 0;   // where the previous cell ended
    for (const { c, col, span, natural } of cells(row)) {
      const gd = GridDataFactory.swtDefaults().span(span, 1).align(SWT.BEGINNING, SWT.CENTER);
      if (col === 0) { gd.hint(headingW, SWT.DEFAULT).applyTo(c); continue; }
      const own = ownWidth(c, natural);
      // Labels fill their raster column, so the control after them starts at the column's x.
      const isLabel = col % 2 === 1 && span === 1;
      const inRaster = r && col <= n;
      const w = inRaster && isLabel ? Math.max(own, r.ws[col] || 0) : own;
      const start = inRaster ? /** @type {number[]} */ (r.xs)[col] : x + gapBefore(col);   // Cast: xs is set for every raster above
      gd.hint(w, SWT.DEFAULT).indent(Math.max(0, start - x), 0).applyTo(c);
      x = Math.max(x, start) + w;
    }
  }
}

// Label + read-only combo + items + selection + width hint + widget registration.
/**
 * @param {Swt.Composite} parent
 * @param {string | null} label
 * @param {readonly string[]} items
 * @param {number} selectedIdx
 * @param {number} widthHint
 * @param {string} key
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} [tooltip]
 */
function _addCombo(parent, label, items, selectedIdx, widthHint, key, w, tooltip) {
  const lbl = label ? new LabelWidget(parent, SWT.NONE) : null;
  if (lbl) lbl.setText(/** @type {string} */ (label));   // Cast: lbl exists only with a label
  const cmb = new ComboWidget(parent, SWT.READ_ONLY | SWT.DROP_DOWN);
  if (lbl) cmb.setData("label", lbl);
  items.forEach(it => cmb.add(it));
  cmb.select(selectedIdx);
  GridDataFactory.swtDefaults().hint(widthHint, SWT.DEFAULT).applyTo(cmb);
  if (tooltip) cmb.setToolTipText(tooltip);
  w[key] = cmb;
  return cmb;
}

// Bottom of the dialog: the totals line, then one group per kind of action, Cancel on the right.
//   Create new view — Folder and Name apply to these actions only.
//   Modify view     — works on the selected view in place.
/**
 * @param {Swt.Composite} area
 * @param {DialogContext} ctx
 * @param {JFace.TitleAreaDialog} dlg
 * @param {{ name: string, onCanvas: boolean }} target  the view Modify works on
 */
function _buildActionArea(area, ctx, dlg, target) {
  const targetViewName = target.name;
  const w = ctx.widgets;

  // Always-visible totals: what the current settings put on a view. Multi-line; sub-lines for
  // elements / relations / diagram objects (see _formatOutputLine).
  const lblTotals = new LabelWidget(area, SWT.NONE);
  lblTotals.setText("On the generated view: —");
  lblTotals.setToolTipText(
    "What the current settings put on the view:\n" +
    "containers, nested elements, standalones, extra occurrences (Show in every container),\n" +
    "nestings (box in box), connections (lines) and diagram objects.");
  GridDataFactory.fillDefaults().grab(true, false).indent(6, 4).applyTo(lblTotals);
  w.lblViewTotals = lblTotals;

  // 2 columns: Create | Modify, Cancel below Modify. Both groups have the same rows
  // (one field row, one button row), so fields and buttons line up.
  const row = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(2).equalWidth(true).margins(0, 2).spacing(8, 6).applyTo(row);

  // ── Create new view ──
  const grpCreate = _group(row, "Create new view", 4, { grabV: true, bold: false });

  new LabelWidget(grpCreate, SWT.NONE).setText("Folder:");
  w.txtViewFolder = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewFolder.setToolTipText(`Folder under Views, e.g. /_Generated/Project.\nEmpty = ${Defs.GENERATED_VIEW_FOLDER}.`);
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewFolder);

  new LabelWidget(grpCreate, SWT.NONE).setText("Name:");
  w.txtViewName = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewName.setToolTipText("Name of the new view.\nPre-filled with the first selected object.\nA view with this name in the folder is overwritten.");
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewName);

  w.btnNewView = _actionBtn(grpCreate, "New view",      () => _runAction(ACTION.NEW_VIEW.id, dlg, ctx));
  w.btnOneEach = _actionBtn(grpCreate, "One view each", () => _runAction(ACTION.ONE_EACH.id, dlg, ctx));
  GridDataFactory.fillDefaults().grab(true, false).span(2, 1).applyTo(w.btnNewView);
  GridDataFactory.fillDefaults().grab(true, false).span(2, 1).applyTo(w.btnOneEach);
  w.btnNewView.setToolTipText(ACTION.NEW_VIEW.tooltip);
  w.btnOneEach.setToolTipText(ACTION.ONE_EACH.tooltip + "\nName is not used.");

  // ── Modify view ──
  const grpModify = _group(row, "Modify selected view", 2, { grabV: true, bold: false });
  // "View: <name>" as text, right after the label, in a row as high as a text field (centred),
  // so it lines up with Folder / Name. A long name is cut off; the tooltip shows it in full.
  const viewRow = new CompositeWidget(grpModify, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).spacing(6, 0).applyTo(viewRow);
  GridDataFactory.fillDefaults().span(2, 1).grab(true, false)
    .hint(150, w.txtViewFolder.computeSize(SWT.DEFAULT, SWT.DEFAULT).y).applyTo(viewRow);
  const lblView = new LabelWidget(viewRow, SWT.NONE);
  lblView.setText("View:");
  GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).grab(false, true).applyTo(lblView);
  const lblTarget = new LabelWidget(viewRow, SWT.NONE);
  lblTarget.setText(targetViewName || "— select a view, or elements on a view");
  lblTarget.setToolTipText(targetViewName
    ? `${targetViewName}\nExpand view and Layout only change this view in place.`
      + (target.onCanvas ? "" : "\nExpand view needs elements selected on the view.")
    : "Expand view and Layout only need a selected view, or elements on a view.");
  GridDataFactory.fillDefaults().align(SWT.FILL, SWT.CENTER).grab(true, true).hint(100, SWT.DEFAULT).applyTo(lblTarget);
  if (targetViewName) { const f = _getBoldFont(); if (f) try { lblTarget.setFont(f); } catch (e) {} }

  w.btnExpandView = _actionBtn(grpModify, "Expand view", () => _runAction(ACTION.EXPAND_VIEW.id, dlg, ctx));
  w.btnLayoutOnly = _actionBtn(grpModify, "Layout only", () => _runAction(ACTION.LAYOUT_ONLY.id, dlg, ctx));
  w.btnExpandView.setToolTipText(ACTION.EXPAND_VIEW.tooltip);
  w.btnLayoutOnly.setToolTipText(ACTION.LAYOUT_ONLY.tooltip);
  w.btnExpandView.setEnabled(target.onCanvas);
  w.btnLayoutOnly.setEnabled(!!targetViewName);

  // ── Cancel: bottom right, under Modify, as wide as one of its buttons ──
  new LabelWidget(row, SWT.NONE);
  const cancelRow = new CompositeWidget(row, SWT.NONE);
  // margins / spacing as _group's defaults, so the columns match the Modify group's buttons
  GridLayoutFactory.fillDefaults().numColumns(2).equalWidth(true).margins(6, 0).spacing(4, 0).applyTo(cancelRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(cancelRow);
  new LabelWidget(cancelRow, SWT.NONE);
  const btnCancel = new ButtonWidget(cancelRow, SWT.PUSH);
  btnCancel.setText("Cancel");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(btnCancel);
  btnCancel.addListener(SWT.Selection, () => {
    _persistSession(ctx);  // remember _lastTabIndex even on cancel
    Java.super(dlg).cancelPressed();
  });
}

// ── Modified indicator ────────────────────────────────────────────────────────

/** @param {DialogContext} ctx */
function _markModified(ctx) {
  if (!ctx._ready || ctx.modified) return;
  ctx.modified = true;
  try { ctx.widgets.lblModified.setVisible(true); } catch (x) {}
}

/** @param {DialogContext} ctx */
function _clearModified(ctx) {
  ctx.modified = false;
  try { ctx.widgets.lblModified.setVisible(false); } catch (x) {}
}

// ── Preset row ────────────────────────────────────────────────────────────────

// Row 1: Preset [combo] *  Save  Save As…  |  Rename…  Delete      Row 2: the preset's description.
// Save / Save As write the current settings; Rename / Delete act on the saved file only.
/**
 * @param {Swt.Composite} parent
 * @param {DialogContext} ctx
 * @param {JFace.TitleAreaDialog} dlg
 */
function _buildPresetRow(parent, ctx, dlg) {
  const w   = ctx.widgets;
  const row = new CompositeWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(8).margins(9, 2).spacing(4, 2).applyTo(row);

  new LabelWidget(row, SWT.NONE).setText("Preset:");

  const cmbPreset = new ComboWidget(row, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(cmbPreset);
  cmbPreset.setToolTipText("Choosing a preset loads all its settings.");
  w.cmbPreset = cmbPreset;

  // Modified indicator — shown while the settings differ from the saved preset
  const lblModified = new LabelWidget(row, SWT.NONE);
  lblModified.setText("*");
  lblModified.setToolTipText("Unsaved changes.\nSave overwrites this preset; Save As… creates a new one.");
  lblModified.setVisible(false);
  w.lblModified = lblModified;

  const btnSave = _pushBtn(row, "Save", "Overwrite this preset with the current settings.", () => {
    _saveUI(ctx);
    PresetIO.writePreset(_presetName(ctx), ctx.config, { quiet: true });
    _afterPresetChange(ctx);
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(btnSave);

  const btnSaveAs = _pushBtn(row, "Save As…", "Save the current settings as a new preset.", () => {
    _saveUI(ctx);
    _openPresetNameDialog(ctx, "Save As…", "Save the current settings as a new preset.", (newName, description) => {
      ctx.config.name        = newName;
      ctx.config.description = description;
      PresetIO.writePreset(newName, ctx.config, { quiet: true });
      _afterPresetChange(ctx);
    });
  });
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(btnSaveAs);

  const sep = new LabelWidget(row, SWT.SEPARATOR | SWT.VERTICAL);
  GridDataFactory.swtDefaults().hint(SWT.DEFAULT, 20).indent(6, 0).applyTo(sep);

  w.btnRename = _pushBtn(row, "Rename…", "Rename or move the saved preset, or change its description.\nUnsaved changes are kept in the dialog, not written.", () => {
    const oldName = _presetName(ctx);
    _openPresetNameDialog(ctx, "Rename…", `Rename or move preset "${oldName}".`, (newName, description) => {
      const saved = PresetIO.readPreset(oldName);
      saved.name        = newName;
      saved.description = description;
      PresetIO.writePreset(newName, saved, { quiet: true });
      if (newName !== oldName) PresetIO.deletePreset(oldName);
      ctx.config.name        = newName;
      ctx.config.description = description;
      _afterPresetChange(ctx, { keepModified: true });
    });
  });
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(w.btnRename);

  w.btnDelete = _pushBtn(row, "Delete", "Delete the saved preset and load Default.", () => {
    const name = _presetName(ctx);
    if (name === PresetIO.DEFAULT_PRESET_NAME) return;
    if (!_confirm(ctx, "Delete preset", `Delete preset "${name}"?`)) return;
    try {
      PresetIO.deletePreset(name);
      _loadPreset(ctx, PresetIO.DEFAULT_PRESET_NAME);
    } catch (e) { console.error("Delete failed: " + e); }
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnDelete);

  // Row 2: description of the preset (hidden when empty), aligned under the combo.
  new LabelWidget(row, SWT.NONE);
  w.lblPresetDescription = new LabelWidget(row, SWT.WRAP);
  try { w.lblPresetDescription.setForeground(row.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (x) {}
  GridDataFactory.fillDefaults().grab(true, false).span(7, 1).hint(300, SWT.DEFAULT).applyTo(w.lblPresetDescription);

  cmbPreset.addListener(SWT.Selection, () => {
    const idx = cmbPreset.getSelectionIndex();
    if (idx >= 0) _loadPreset(ctx, String(cmbPreset.getItem(idx)));
  });

  _afterPresetChange(ctx, { keepModified: true });
}

/** @param {DialogContext} ctx */
function _presetName(ctx) {
  return ctx.config.name || PresetIO.DEFAULT_PRESET_NAME;
}

// Load a saved preset into the dialog (all settings), as when it is picked in the combo.
/**
 * @param {DialogContext} ctx
 * @param {string} name
 */
function _loadPreset(ctx, name) {
  try {
    ctx._ready = false;  // no modified indicator while the widgets are filled
    const loaded = PresetIO.readPreset(name);
    _mergePreset(ctx, loaded);
    ctx.config.name = name;
    _syncToUI(ctx);
    _updateFilteredCount(ctx);
  } catch (e) {
    console.error("Load preset: " + e);
  } finally {
    ctx._ready = true;
  }
  _afterPresetChange(ctx);
}

// Refresh the preset row after a load / save / rename / delete: combo items and selection,
// description line, Rename/Delete state (not for Default) and the modified indicator.
/**
 * @param {DialogContext} ctx
 * @param {{ keepModified?: boolean }} [opts]
 */
function _afterPresetChange(ctx, opts) {
  const w    = ctx.widgets;
  const name = _presetName(ctx);
  _refreshPresetCombo(w.cmbPreset, name);
  const isDefault = name === PresetIO.DEFAULT_PRESET_NAME;
  try { w.btnDelete.setEnabled(!isDefault); w.btnRename.setEnabled(!isDefault); } catch (x) {}

  const desc = String(ctx.config.description || "");
  try {
    w.lblPresetDescription.setText(desc);
    const gd = w.lblPresetDescription.getLayoutData();
    if (gd) { gd.exclude = !desc; w.lblPresetDescription.setVisible(!!desc); }
    w.lblPresetDescription.getParent().getParent().layout(true, true);
  } catch (x) {}

  if (!(opts && opts.keepModified)) _clearModified(ctx);
}

// Name + folder + description dialog for Save As / Rename. Asks before overwriting another preset.
// Shell of the Generate View dialog: parent for the dialogs it opens, so they appear on top.
// Shell of the Generate View dialog: the parent of the dialogs opened from it, so they open on
// top of it. (Archi's main window as parent puts them behind this modal dialog; on GTK the
// active shell can also be the main window, so it is taken from the dialog itself.)
/**
 * @param {DialogContext} ctx
 * @returns {Swt.Shell}
 */
function _dialogShell(ctx) {
  try { const sh = ctx.dlg && ctx.dlg.getShell(); if (sh && !sh.isDisposed()) return sh; } catch (e) {}
  return shell;
}

// Parent for a confirmation: the Save As dialog when it is open (Overwrite?), else this dialog.
/**
 * @param {DialogContext} ctx
 * @returns {Swt.Shell}
 */
function _confirmParent(ctx) {
  try {
    const Display = Java.type("org.eclipse.swt.widgets.Display");
    const own = _dialogShell(ctx);
    const active = Display.getCurrent().getActiveShell();
    if (active && active.getParent && active.getParent() === own) return active;
    return own;
  } catch (e) { return _dialogShell(ctx); }
}

// Yes/no question on top of the topmost open dialog (window.confirm would open behind it).
/**
 * @param {DialogContext} ctx
 * @param {string} title
 * @param {string} message
 */
function _confirm(ctx, title, message) {
  const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
  return MessageDialog.openConfirm(_confirmParent(ctx), title, message);
}

/**
 * @param {DialogContext} ctx
 * @param {string} title
 * @param {string} message
 * @param {(newName: string, description: string) => void} onConfirm
 */
function _openPresetNameDialog(ctx, title, message, onConfirm) {
  const current = _presetName(ctx);
  PresetsDialog.openSaveAs({
    title, message,
    defaultName:        current === PresetIO.DEFAULT_PRESET_NAME ? "" : current,
    defaultDescription: ctx.config.description || "",
    parentShell:        _dialogShell(ctx),
    onConfirm(newName, description) {
      if (newName !== current && PresetIO.listPresets().includes(newName)
          && !_confirm(ctx, "Overwrite preset", `Preset "${newName}" already exists. Overwrite it?`)) return;
      onConfirm(newName, description);
    },
  });
}

// True when the dialog's settings differ from the saved preset they came from (e.g. a session
// that was changed but not saved). The view name is left out: it is pre-filled from the selection.
/** @param {DialogContext} ctx */
function _differsFromSaved(ctx) {
  try {
    const saved = PresetIO.readPreset(_presetName(ctx));
    const pick  = (/** @type {Preset} */ c) => JSON.stringify({
      algorithm: c.algorithm, params: c.params, filter: c.filter, relatedElements: c.relatedElements,
      appearance: c.appearance, folder: c.view && c.view.folder,
      // the dialog lists every property of the model; only the enabled ones are settings
      viewProperties: c.viewProperties && [c.viewProperties.addObjectId,
        (c.viewProperties.properties || []).filter(r => r.enabled)],
    });
    return pick(saved) !== pick(ctx.config);
  } catch (e) { return false; }  // preset file gone — nothing to compare with
}

// ── Sync config ↔ UI ──────────────────────────────────────────────────────────

/** @param {DialogContext} ctx */
function _syncToUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;
  const p = c.params;

  // Algorithm radio selection
  const algName = c.algorithm;
  if (w.algRadios) {
    w.algRadios.forEach(r => r.setSelection(false));
    const r = w.algRadios.get(algName);
    if (r) r.setSelection(true);
  }

  // Layout params (validatePreset guarantees every key is present)
  for (const [key, def] of Object.entries(PARAM_WIDGETS)) _paramToWidget(w[def.w], def, /** @type {Record<string, unknown>} */ (p)[key]);   // Cast: key is a params key
  _spinSet(w.spinMaxWidth, p.maxWidth);
  let arIdx = AR_OPTIONS.findIndex(a => a.val === p.aspectRatio);
  if (arIdx < 0) arIdx = AR_OPTIONS.findIndex(a => a.val === Defs.AR_DEFAULT);  // no ratio yet
  if (w.cmbAspectRatio) w.cmbAspectRatio.select(Math.max(0, arIdx));

  // View size radio
  {
    const _vsMode = p.viewSizeMode;
    const _vsMap  = {
      none:        w.radioViewSizeNone,
      maxWidth:    w.radioViewSizeMaxWidth,
      aspectRatio: w.radioViewSizeAspectRatio,
    };
    Object.entries(_vsMap).forEach(([k, r]) => { if (r) r.setSelection(k === _vsMode); });
  }

  // Filter rule tables
  const flt = c.filter;
  if (w.tblElementRules)  w.tblElementRules.setRules(flt.elementRules);
  if (w.tblDiagramRules)  w.tblDiagramRules.setRules(flt.diagramRules);
  if (w.tblRelationRules) w.tblRelationRules.setRules(flt.relationRules);

  // Related elements — rebuild step blocks from preset.
  // Dispose existing blocks first so reapplying a preset (or session load) is clean.
  if (ctx.relBlocks && ctx.widgets.blocksContainer) {
    while (ctx.relBlocks.length > 0) {
      const b = ctx.relBlocks[0];
      try { b.container.dispose(); } catch (e) {}
      ctx.relBlocks.shift();
    }
    const steps = (c.relatedElements && c.relatedElements.steps) || [];
    steps.forEach(step => _addRelatedBlock(ctx, step));
    _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  }

  // View name: always pre-fill from the first selected object (captured in open()).
  const viewName  = (ctx && ctx.firstName) || (c.view && c.view.name) || "";
  if (w.txtViewName)   w.txtViewName.setText(viewName);
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder) || Defs.GENERATED_VIEW_FOLDER);

  _updateAlgorithmControls(ctx);

  // Appearance tab
  const app  = c.appearance;
  const DA   = DEFAULT_PRESET.appearance;

  const sbp  = app.styleByProperty;
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;

  // Style by property — rules, mixed-values colour, line width
  if (w.tblStyleRules) w.tblStyleRules.setRules(sbp.rules);
  if (w.txtMixedColor) {
    const hex = sbp.mixedValuesColor || DA.styleByProperty.mixedValuesColor;
    w.txtMixedColor.setText(hex);
    try { if (w.mixedSwatchSet) w.mixedSwatchSet(hex); } catch (e) {}
  }
  if (w.cmbStyleLineWidth) w.cmbStyleLineWidth.select(Math.max(0, Math.min(3, sbp.lineWidth || 0)));

  // Feature 4 — Style by nesting level
  if (w.chkNestFont)        w.chkNestFont.setSelection(!!(nl.fontEnabled));
  if (w.spinNestRootFontSize) w.spinNestRootFontSize.setSelection(nl.rootFontSize !== undefined ? nl.rootFontSize : DA.nestingLevel.rootFontSize);
  if (w.chkNestRootBold)    w.chkNestRootBold.setSelection(nl.rootFontBold !== undefined ? nl.rootFontBold : DA.nestingLevel.rootFontBold);
  if (w.spinNestFontDecrease) w.spinNestFontDecrease.setSelection(nl.fontDecreasePerLevel !== undefined ? nl.fontDecreasePerLevel : DA.nestingLevel.fontDecreasePerLevel);
  if (w.chkNestColor)       w.chkNestColor.setSelection(!!(nl.colorEnabled));
  if (w.txtRootColor) {
    const hex = nl.rootColor || "";
    w.txtRootColor.setText(hex);
    try { if (w.nestRootSwatchSet) w.nestRootSwatchSet(hex); } catch (e) {}
  }
  if (w.spinNestLighten)     w.spinNestLighten.setSelection(nl.lightenPerLevel !== undefined ? nl.lightenPerLevel : DA.nestingLevel.lightenPerLevel);

  // Feature 5 — Highlight repeated elements
  if (w.chkHighlightRep)       w.chkHighlightRep.setSelection(!!(hr.enabled));
  if (w.cmbHighlightRepRange) {
    const idx = COLOR_RANGES.indexOf(hr.colorRange || DA.highlightRepeated.colorRange);
    w.cmbHighlightRepRange.select(idx >= 0 ? idx : COLOR_RANGES.indexOf("Pastel1"));
    try { if (w.cmbHighlightRepRangeCanvas) w.cmbHighlightRepRangeCanvas.redraw(); } catch (e) {}
  }

  _updateNestingLevelState(ctx);
  _updateAppearancePropStates(ctx);

  // View properties tab
  if (w.vpAddObjectId) {
    w.vpAddObjectId.setSelection(!!(c.viewProperties && c.viewProperties.addObjectId));
  }
  if (w.vpRows) {
    const saved = (c.viewProperties && c.viewProperties.properties) || [];
    w.vpRows.forEach(row => {
      const entry = saved.find(p => p.key === row.key);
      const enabled = !!(entry && entry.enabled);
      row.chk.setSelection(enabled);
      _enable(row.cmb, enabled);
      if (entry && entry.value) {
        const items = Array.from({ length: row.cmb.getItemCount() }, (_, i) => row.cmb.getItem(i));
        const idx = items.indexOf(entry.value);
        if (idx >= 0) {
          row.cmb.select(idx);
        } else {
          row.cmb.add(entry.value);
          row.cmb.select(row.cmb.getItemCount() - 1);
        }
      }
    });
  }
}

/** @param {DialogContext} ctx */
function _saveUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;

  // Algorithm and layout params
  if (w.algRadios) c.algorithm = _selectedAlgorithm(w);
  for (const [key, def] of Object.entries(PARAM_WIDGETS)) {
    const ctrl = w[def.w];
    if (ctrl) /** @type {Record<string, unknown>} */ (c.params)[key] = _paramFromWidget(ctrl, def);   // Cast: key is a params key
  }
  if (w.spinMaxWidth)         c.params.maxWidth = w.spinMaxWidth.getSelection();
  const arIdx = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  c.params.aspectRatio  = AR_OPTIONS[Math.max(0, arIdx)].val;
  c.params.viewSizeMode = _getViewSizeMode(w);

  // Filter
  c.filter = {
    elementRules:  w.tblElementRules  ? w.tblElementRules.getRules()  : [],
    diagramRules:  w.tblDiagramRules  ? w.tblDiagramRules.getRules()  : [],
    relationRules: w.tblRelationRules ? w.tblRelationRules.getRules() : [],
  };

  // Related elements — round-trip the dynamic step-block array.
  c.relatedElements = {
    steps: (ctx.relBlocks || []).map(b => ({ repeat: b.getRepeat(), rules: b.table.getRules() })),
  };

  // View
  if (w.txtViewName)   c.view.name   = w.txtViewName.getText().trim();
  if (w.txtViewFolder) c.view.folder = w.txtViewFolder.getText().trim();

  // Appearance
  /** @type {(cmb: Swt.Combo, def: string) => string} */
  const _cmbVal = (cmb, def) => cmb && cmb.getSelectionIndex() >= 0 ? cmb.getItem(cmb.getSelectionIndex()) : def;

  // Style by property
  c.appearance.styleByProperty = {
    rules:            w.tblStyleRules ? w.tblStyleRules.getRules() : [],
    mixedValuesColor: w.txtMixedColor ? w.txtMixedColor.getText().trim() : DEFAULT_PRESET.appearance.styleByProperty.mixedValuesColor,
    lineWidth:        w.cmbStyleLineWidth ? Math.max(0, w.cmbStyleLineWidth.getSelectionIndex()) : 0,
  };

  // Feature 4 — Style by nesting level
  c.appearance.nestingLevel.fontEnabled         = !!(w.chkNestFont  && w.chkNestFont.getSelection());
  c.appearance.nestingLevel.rootFontSize        = w.spinNestRootFontSize ? w.spinNestRootFontSize.getSelection() : 14;
  c.appearance.nestingLevel.rootFontBold        = !!(w.chkNestRootBold && w.chkNestRootBold.getSelection());
  c.appearance.nestingLevel.fontDecreasePerLevel = w.spinNestFontDecrease ? w.spinNestFontDecrease.getSelection() : 2;
  c.appearance.nestingLevel.colorEnabled        = !!(w.chkNestColor && w.chkNestColor.getSelection());
  c.appearance.nestingLevel.rootColor           = w.txtRootColor ? w.txtRootColor.getText().trim() : "";
  c.appearance.nestingLevel.lightenPerLevel      = w.spinNestLighten ? w.spinNestLighten.getSelection() : 15;

  // Feature 5 — Highlight repeated elements
  c.appearance.highlightRepeated.enabled    = !!(w.chkHighlightRep && w.chkHighlightRep.getSelection());
  c.appearance.highlightRepeated.colorRange = _cmbVal(w.cmbHighlightRepRange, "Pastel1");

  // View properties
  if (w.vpAddObjectId) c.viewProperties.addObjectId = w.vpAddObjectId.getSelection();
  if (w.vpRows) {
    c.viewProperties.properties = w.vpRows.map(row => ({
      key:     row.key,
      value:   row.cmb.getText().trim(),
      enabled: row.chk.getSelection(),
    }));
  }
}

// ── Algorithm controls ────────────────────────────────────────────────────────


/** @param {DialogContext} ctx */
function _updateAlgorithmControls(ctx) {
  _markModified(ctx);
  const w = ctx.widgets;
  if (!w.algRadios) return;
  const alg    = ALGORITHMS[_selectedAlgorithm(w)];
  const active = new Set(alg.activeParams);
  _keepConnectionRoom(ctx, "element");

  // Select-type params offer the algorithm's supported values; inactive ones keep the full list.
  for (const [key, def] of Object.entries(PARAM_WIDGETS))
    if (def.kind === "combo" && w[def.w]) _setComboItems(w[def.w], alg.supportedOptions[key] || def.items);
  _updateComboTooltips(w);

  for (const [key, def] of Object.entries(PARAM_WIDGETS)) _enable(w[def.w], active.has(key));
  // Use label width replaces the fixed element size; its max width only applies with Use label width on.
  const labelSizingOn = active.has("labelSizing") && w.chkLabelSizing && w.chkLabelSizing.getSelection();
  _enable(w.spinElementWidth,      active.has("elementWidth")  && !labelSizingOn);
  _enable(w.spinElementHeight,     active.has("elementHeight") && !labelSizingOn);
  _enable(w.spinLabelMaxLineWidth, labelSizingOn);
  // Containers settings only matter once a Nesting rule is on.
  if (!_nestingOn(w, alg))
    for (const k of Defs.LAYOUT_GROUPS.Containers) if (PARAM_WIDGETS[k]) _enable(w[PARAM_WIDGETS[k].w], false);
  _updateContainersHint(ctx, _selectedAlgorithm(w));

  // View size radios: unsupported options are greyed; a selected unsupported option falls back to None.
  _enable(w.radioViewSizeMaxWidth,    active.has("maxWidth"));
  _enable(w.radioViewSizeAspectRatio, active.has("aspectRatio"));
  const vsMode = _getViewSizeMode(w);
  if (vsMode !== "none" && !active.has(vsMode) && w.radioViewSizeNone) {
    w.radioViewSizeNone.setSelection(true);
    [w.radioViewSizeMaxWidth, w.radioViewSizeAspectRatio].forEach(r => { if (r) r.setSelection(false); });
  }
  _applyViewSizeMode(ctx);  // also locks the connections mode when needed
}

// Name of the algorithm whose radio is selected.
/**
 * @param {DialogWidgets} w
 * @returns {string}
 */
function _selectedAlgorithm(w) {
  for (const [name, r] of (w.algRadios || new Map())) if (r.getSelection()) return name;
  return DEFAULT_PRESET.algorithm;
}

const CONNECTION_ROOM_SLACK = 2;   // px

/**
 * Algorithms that route connections between the elements (defs connectionsBetweenElements) need
 * Element distance ≥ 2 × Distance to element + CONNECTION_ROOM_SLACK: at exactly 2 × Graphviz finds
 * elements touching within the connection margin and draws every connection straight. The value
 * the user changed wins; the other follows.
 * @param {DialogContext} ctx
 * @param {"element" | "connection"} changed
 */
function _keepConnectionRoom(ctx, changed) {
  const w = ctx.widgets;
  if (!w.algRadios || !w.spinElementSpacing || !w.spinConnectionElementSpacing) return;
  if (!ALGORITHMS[_selectedAlgorithm(w)].connectionsBetweenElements) return;
  const elem = w.spinElementSpacing.getSelection(), conn = w.spinConnectionElementSpacing.getSelection();
  if (elem >= 2 * conn + CONNECTION_ROOM_SLACK) return;
  if (changed === "element") w.spinConnectionElementSpacing.setSelection(Math.max(0, Math.floor((elem - CONNECTION_ROOM_SLACK) / 2)));
  else                       w.spinElementSpacing.setSelection(2 * conn + CONNECTION_ROOM_SLACK);
}

// Replace a read-only combo's items, keeping the current value when it is still offered.
/**
 * @param {Swt.Combo} combo
 * @param {readonly string[]} items
 */
function _setComboItems(combo, items) {
  const cur = String(combo.getText());
  combo.removeAll();
  items.forEach(i => combo.add(i));
  const idx = items.indexOf(cur);
  combo.select(idx >= 0 ? idx : 0);
}

/**
 * @param {any} ctrl  the param's widget; its type follows def.kind
 * @param {ParamWidget} def
 * @param {unknown} value
 */
function _paramToWidget(ctrl, def, value) {
  if (!ctrl || value === undefined || value === null) return;
  switch (def.kind) {
    case "spin":  ctrl.setSelection(value); break;
    case "check": ctrl.setSelection(!!value); break;
    case "rules": ctrl.setRules(value); break;
    case "combo": {
      // The value may be outside the current (algorithm-filtered) items: add it so it survives
      // until _updateAlgorithmControls sets the items for the newly selected algorithm.
      let idx = ctrl.indexOf(String(value));
      if (idx < 0) { ctrl.add(String(value)); idx = ctrl.getItemCount() - 1; }
      ctrl.select(idx);
      break;
    }
  }
}

/**
 * @param {any} ctrl  the param's widget; its type follows def.kind
 * @param {ParamWidget} def
 */
function _paramFromWidget(ctrl, def) {
  switch (def.kind) {
    case "spin":     return ctrl.getSelection();
    case "check":    return ctrl.getSelection();
    case "rules":    return ctrl.getRules();
    case "combo":    return String(ctrl.getText());
  }
}

/**
 * @param {DialogWidgets} w
 * @returns {ViewSizeMode}
 */
function _getViewSizeMode(w) {
  if (w.radioViewSizeMaxWidth    && w.radioViewSizeMaxWidth.getSelection())    return "maxWidth";
  if (w.radioViewSizeAspectRatio && w.radioViewSizeAspectRatio.getSelection()) return "aspectRatio";
  return "none";
}

/** @param {DialogContext} ctx */
function _applyViewSizeMode(ctx) {
  const w    = ctx.widgets;
  const mode = _getViewSizeMode(w);
  _enable(w.spinMaxWidth,   mode === "maxWidth");
  _enable(w.cmbAspectRatio, mode === "aspectRatio");
  _updateConnectionsMode(ctx);
}

// Connections mode follows Defs.connectionsModeLock: Grid / Pack inside containers or an active
// view size force "Between containers" and lock the combo; the tooltip names the reason.
/** @param {DialogContext} ctx */
function _updateConnectionsMode(ctx) {
  const w = ctx.widgets;
  if (!w.cmbConnectionsMode || !w.algRadios) return;
  const algName = _selectedAlgorithm(w);
  const alg     = ALGORITHMS[algName];
  if (!alg.activeParams.includes("connectionsMode") || !_nestingOn(w, alg)) { _enable(w.cmbConnectionsMode, false); return; }
  const arIdx  = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  const reason = Defs.connectionsModeLock(algName, {
    containerAlgorithm: w.cmbContainerAlgorithm ? w.cmbContainerAlgorithm.getText() : "",
    viewSizeMode:       _getViewSizeMode(w),
    aspectRatio:        AR_OPTIONS[Math.max(0, arIdx)] ? AR_OPTIONS[Math.max(0, arIdx)].val : 0,
    maxWidth:           w.spinMaxWidth ? w.spinMaxWidth.getSelection() : 0,
  });
  _enable(w.cmbConnectionsMode, !reason);
  if (reason) w.cmbConnectionsMode.select(CONNECTIONS_MODE_LABELS.indexOf("Between containers"));
  w.cmbConnectionsMode.setToolTipText(Defs.paramTooltip("connectionsMode",
    reason ? `Locked to Between containers: Crossing containers is not possible with ${reason}.` : ""));
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/**
 * @param {Swt.Spinner} spinner
 * @param {number} value
 */
function _spinSet(spinner, value) {
  if (spinner) spinner.setSelection(value);
}

/**
 * @param {any} widget  an SWT control, or a controller with enable() (rule table, colour-range cell)
 * @param {boolean} enabled
 */
function _enable(widget, enabled) {
  if (!widget) return;
  if (widget.enable) { widget.enable(enabled); return; }  // controller (rule table, colour-range cell)
  try { widget.setEnabled(enabled); } catch (e) {}
  // The label in front of a combo / spinner greys with it (see _addCombo, _addSpinnerRow).
  try { const lbl = widget.getData("label"); if (lbl) lbl.setEnabled(enabled); } catch (e) {}
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string} tip
 * @param {() => void} handler
 */
function _pushBtn(parent, label, tip, handler) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText(label);
  if (tip) btn.setToolTipText(tip);
  btn.addListener(SWT.Selection, handler);
  return btn;
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string | null} tip
 * @param {number} span
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} key
 */
function _addCheck(parent, label, tip, span, w, key) {
  const btn = new ButtonWidget(parent, SWT.CHECK);
  btn.setText(label);
  if (tip) btn.setToolTipText(tip);
  GridDataFactory.fillDefaults().span(span, 1).applyTo(btn);
  w[key] = btn;
  return btn;
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string} key
 * @param {number} defVal
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} [tooltip]
 */
function _addSpinnerRow(parent, label, key, defVal, min, max, step, w, tooltip) {
  const lbl = new LabelWidget(parent, SWT.NONE);
  lbl.setText(label);
  const sp = new SpinnerWidget(parent, SWT.BORDER);
  sp.setData("label", lbl);
  sp.setValues(defVal, min, max, 0, step, step * 5);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(sp);
  if (tooltip) sp.setToolTipText(tooltip);
  w[key] = sp;
}

// Load a validated preset into ctx.config. The preset replaces every setting — values of
// params that are inactive for its algorithm included, so a later Save writes back exactly
// what was loaded. Dialog-state fields (_lastTabIndex) are kept.
/**
 * @param {DialogContext} ctx
 * @param {Preset} validated
 */
function _mergePreset(ctx, validated) {
  for (const k of Object.keys(ctx.config)) if (!k.startsWith("_")) delete /** @type {Record<string, unknown>} */ (ctx.config)[k];   // Cast: emptied and refilled below
  Object.assign(ctx.config, JSON.parse(JSON.stringify(validated)));
}

/**
 * @param {Swt.Combo} combo
 * @param {string} currentName
 */
function _refreshPresetCombo(combo, currentName) {
  combo.removeAll();
  PresetIO.listPresets().forEach(n => combo.add(n));
  if (currentName) {
    const i = combo.indexOf(currentName);
    if (i >= 0) combo.select(i);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
