/**
 * Layout tab of the View dialog: algorithm, nesting and reverse conditions, containers, flow, elements, connections, view size.
 * Also the layout param → widget table (PARAM_WIDGETS) and the controls that follow the chosen algorithm.
 */
console.log("Loading tab_layout.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./counts")} */
const Counts = require(REPO_ROOT + "View/lib/gui/counts");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");
/** @type {typeof import("./tab_appearance")} */
const TabAppearance = require(REPO_ROOT + "View/lib/gui/tab_appearance");
/** @type {typeof import("./condition_table")} */
const { conditionTable, NESTING_CONDITION_COLUMNS, REVERSE_CONDITION_COLUMNS } = require(REPO_ROOT + "View/lib/gui/condition_table");

const { STYLES, ALGORITHMS, ROUTING, DIRECTIONS, RANKING, NODE_PLACEMENT, CIRCLES, ACYCLICER, ELEMENT_ORDER, LABEL_POSITIONS, AR_OPTIONS, DEFAULT_PRESET } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

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
const CIRCLES_LABELS          = CIRCLES.map(c => c.val);
const CIRCLES_TOOLTIPS        = Object.fromEntries(CIRCLES.map(c => [c.val, c.tooltip]));
const ACYCLICER_LABELS        = ACYCLICER.map(a => a.val);
const ELEMENT_ORDER_LABELS    = ELEMENT_ORDER.map(o => o.val);
const AR_LABELS               = AR_OPTIONS.map(a => a.label);
const CONTAINER_ALGO_LABELS   = Defs.ALGORITHMS.Layered.supportedOptions.containerAlgorithm;
const CONNECTIONS_MODE_LABELS = Defs.ALGORITHMS.Layered.supportedOptions.connectionsMode;
const DP = DEFAULT_PRESET.params;

// Layout params with one plain widget: loaded (_syncToUI), saved (_saveUI) and enabled per
// algorithm (updateAlgorithmControls) from this table, so every param follows defs.activeParams.
//   kind: spin | check | combo (items = full list; the algorithm's supportedOptions narrow it) |
//         conditions (condition table, gui/condition_table.js)
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
  circles:                  { w: "cmbCircles",                   kind: "combo", items: CIRCLES_LABELS },
  reverseConditions:        { w: "tblReverseConditions",         kind: "conditions" },
  routing:                  { w: "cmbRouting",                   kind: "combo", items: ROUTING_ALL },
  labelPosition:            { w: "cmbLabelPosition",             kind: "combo", items: LABEL_POS_ALL },
  connectionLabelSpacing:   { w: "chkConnectionLabelSpacing",    kind: "check" },
  connectionSpacing:        { w: "spinConnectionSpacing",        kind: "spin" },
  connectionElementSpacing: { w: "spinConnectionElementSpacing", kind: "spin" },
  nestingConditions:        { w: "tblNestingConditions",         kind: "conditions" },
  containerAlgorithm:       { w: "cmbContainerAlgorithm",        kind: "combo", items: CONTAINER_ALGO_LABELS },
  connectionsMode:          { w: "cmbConnectionsMode",           kind: "combo", items: CONNECTIONS_MODE_LABELS },
  padding:                  { w: "spinPadding",                  kind: "spin" },
  sortContainers:           { w: "chkSortContainers",            kind: "check" },
  alignWidthSameType:       { w: "chkAlignWidthSameType",        kind: "check" },
  snapColumnsToGrid:        { w: "chkSnapColumns",               kind: "check" },
});

/**
 * The objects a nesting / reverse condition's property is read from, among the predicted view's relations.
 * @param {DialogContext} ctx
 * @param {RelationCondition} condition
 */
function _relPropObjects(ctx, condition) {
  const probe = [Object.assign({}, condition, { on: true, mode: "include", property: "", value: "" })];
  return (ctx.viewRelations || [])
    .filter(r => ConditionLists.matchRelation(probe, r.type, r.source && r.source.type, r.target && r.target.type, false))
    .map(r => ConditionLists.relationPropObject(condition, r));
}

// ── Layout tab ────────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function buildLayoutTab(tabFolder, ctx) {
  const { page, scrolled, finish } = Widgets.scrolledTab(tabFolder, "Layout");
  const w = ctx.widgets;
  ctx.layoutScrolled = scrolled;
  ctx.layoutPage     = page;
  page.getLayout().verticalSpacing = 8;          // between boxes
  const BOX = { marginH: 8, marginV: 6 };       // inside a box

  // ── Algorithm ─────────────────────────────────────────────────────────────────
  // Algorithm selection is a table, one row per style: [Style label:] [○ Algo] [○ Algo] …
  // All radio buttons are in the same composite so SWT auto-groups them (mutually exclusive).
  const grpAlg = Widgets.group(page, "Algorithm", 4, Object.assign({ spaceH: 6 }, BOX));

  // Algorithm radio table spans all 4 columns of grpAlg: a label column plus one per algorithm
  // of the largest style.
  const maxAlgCols = Math.max(...Object.values(STYLES).map(s => s.algorithms.length));
  const algTableComp = new CompositeWidget(grpAlg, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1 + maxAlgCols).margins(0, 0).spacing(Widgets.GAP_PAIR, 3).applyTo(algTableComp);
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
        radio.addListener(SWT.Selection, () => { if (radio.getSelection()) { updateAlgorithmControls(ctx); } });
      } else {
        new LabelWidget(algTableComp, SWT.NONE);  // empty slot
      }
    }
  });

  w.algRadios = algRadios;

  // Groups in the order of deciding: structure (Relations, Containers), then Flow, Elements,
  // Connections, View size. Settings the chosen algorithm does not use are greyed out.
  // Containers, Flow, Elements and Connections share one heading column (heading | label
  // control | …) — see Widgets.formRow / Widgets.alignFormColumns.
  /** @type {Swt.Composite[]} */
  const formRows = [];
  /** @type {Swt.Composite} */
  let row;

  // Nesting / reverse / show-in-every alter the on-view role split (nestings vs connections,
  // containers vs nested elements, occurrences): refresh the live counters and dependent controls.
  const onParamsChange = () => {
    ctx.recount();
    TabAppearance.updateNestingLevelState(ctx);  // Appearance: nesting level needs a nesting type
    updateAlgorithmControls(ctx);  // Containers / Container types need a nesting type
  };

  // ── Nesting · Reverse ─────────────────────────────────────────────────────────
  const grpNest = Widgets.group(page, "Nesting", 1, BOX);
  const onLayoutPage = () => {
    try { ctx.layoutPage.layout(true, true); } catch (e) {}
    Widgets.resizeScrolled(ctx.layoutScrolled, ctx.layoutPage);
  };
  Widgets.lbl(grpNest, "Draw these relations as nesting, child inside its parent:")
    .setToolTipText(Defs.paramTooltip("nestingConditions"));
  /** @type {Partial<ConditionTableOptions<"relation">>} */
  const relPropItems = {
    propCondition: true, placeholder: true,
    propItems:  r => Counts.propNames(_relPropObjects(ctx, r)),
    valueItems: r => Counts.propValues(_relPropObjects(ctx, r), r.property),
  };
  // Casts: Object.assign widens kind to string.
  w.tblNestingConditions = conditionTable(grpNest, /** @type {ConditionTableOptions<"relation">} */ (Object.assign({
    kind: "relation", columns: NESTING_CONDITION_COLUMNS, onChange: onParamsChange, onLayout: onLayoutPage,
    emptyText: "No nesting: every relation is drawn as a line.",
    addTooltip: "Add a condition. Include picks relations to nest; Exclude takes relations out of those. " +
                "Without an Include condition nothing is nested.",
  }, relPropItems)));
  grpNest.setToolTipText("The parent is the source — or the target if the relation is also in Reverse.");
  w.lblNestingNote = Widgets.noteLabel(grpNest, "");
  w.lblNestingNote.getLayoutData().exclude = true;
  w.lblNestingNote.setVisible(false);


  const grpRev = Widgets.group(page, "Reverse", 1, BOX);
  Widgets.lbl(grpRev, "Flip these relations:")
    .setToolTipText(Defs.paramTooltip("reverseConditions"));
  w.tblReverseConditions = conditionTable(grpRev, /** @type {ConditionTableOptions<"relation">} */ (Object.assign({
    kind: "relation", columns: REVERSE_CONDITION_COLUMNS, onChange: onParamsChange, onLayout: onLayoutPage,
    emptyText: "No relations are reversed.",
    addTooltip: "Add a condition. Include picks relations to reverse; Exclude takes relations out of those. " +
                "Without an Include condition nothing is reversed.",
  }, relPropItems)));
  w.lblReverseNote = Widgets.noteLabel(grpRev, "");
  w.lblReverseNote.getLayoutData().exclude = true;
  w.lblReverseNote.setVisible(false);
  grpRev.setToolTipText("Flow: laid out from target to source, against the Direction in the Flow box (arrows unchanged).\n" +
                        "Nesting: if the relation is also nested, the target becomes the parent.");

  // ── Containers ────────────────────────────────────────────────────────────────
  const grpCtr = Widgets.group(page, "Containers", 1, BOX);
  row = Widgets.formRow(grpCtr, "Layout:", formRows);
  Widgets.addCombo(row, "Layout inside", CONTAINER_ALGO_LABELS,   0, SWT.DEFAULT, "cmbContainerAlgorithm", w);
  Widgets.addCombo(row, "Connections",   CONNECTIONS_MODE_LABELS, 0, SWT.DEFAULT, "cmbConnectionsMode", w);
  Widgets.addSpinnerRow(row, "Padding", "spinPadding", DP.padding, 0, 200, 5, w);
  w.cmbContainerAlgorithm.addListener(SWT.Selection, () => updateAlgorithmControls(ctx));
  w.cmbConnectionsMode.addListener(SWT.Selection, () => updateAlgorithmControls(ctx));

  row = Widgets.formRow(grpCtr, "Options:", formRows, "ctrOptions");
  Widgets.addCheck(row, "Sort containers", null, 2, w, "chkSortContainers");
  row = Widgets.formRow(grpCtr, "", formRows, "ctrOptions");
  Widgets.addCheck(row, "Same width per level", null, 2, w, "chkAlignWidthSameType");
  Widgets.addCheck(row, "Snap columns to grid", null, 2, w, "chkSnapColumns");
  w.grpContainers = grpCtr;

  // ── Flow ──────────────────────────────────────────────────────────────────────
  const grpFlow = Widgets.group(page, "Flow", 1, BOX);
  row = Widgets.formRow(grpFlow, "Order:", formRows, "form", 2);
  Widgets.addCombo(row, "Direction", DIRECTION_LABELS, 0, SWT.DEFAULT, "cmbDirection", w);
  Widgets.addCombo(row, "Cycles",    ACYCLICER_LABELS, 0, SWT.DEFAULT, "cmbAcyclicer", w);
  Widgets.addCombo(row, "Ranking",   RANKING_LABELS,   0, SWT.DEFAULT, "cmbRanking",   w);
  row = Widgets.formRow(grpFlow, "Layers:", formRows, "form", 2);
  Widgets.addCombo(row, "Placement", NODE_PLACEMENT_LABELS, 0, SWT.DEFAULT, "cmbNodePlacement", w);
  w.cmbNodePlacement.addListener(SWT.Selection, () => _updateComboTooltips(w));
  Widgets.addCombo(row, "Circles",   CIRCLES_LABELS,        0, SWT.DEFAULT, "cmbCircles",       w);
  w.cmbCircles.addListener(SWT.Selection, () => _updateComboTooltips(w));
  Widgets.addSpinnerRow(row, "Layer distance", "spinLayerSpacing", DP.layerSpacing, 0, 2000, 20, w);

  // ── Elements ──────────────────────────────────────────────────────────────────
  const grpEl = Widgets.group(page, "Elements", 1, BOX);
  row = Widgets.formRow(grpEl, "Size:", formRows, "form", 2);
  Widgets.addSpinnerRow(row, "Width",  "spinElementWidth",  DP.elementWidth,  10, 1000, 10, w);
  Widgets.addCheck(row, "Use label width", null, 2, w, "chkLabelSizing");
  Widgets.addSpinnerRow(row, "Wrap label at", "spinLabelMaxLineWidth", DP.labelMaxLineWidth, 60, 2000, 20, w);
  row = Widgets.formRow(grpEl, "", formRows, "form", 2);
  Widgets.addSpinnerRow(row, "Height", "spinElementHeight", DP.elementHeight, 10,  500, 10, w);
  w.chkLabelSizing.addListener(SWT.Selection, () => updateAlgorithmControls(ctx));
  row = Widgets.formRow(grpEl, "Spacing:", formRows, "form", 2);
  Widgets.addSpinnerRow(row, "Distance", "spinElementSpacing", DP.elementSpacing, 0, 500, 5, w);
  row = Widgets.formRow(grpEl, "Order:", formRows, "form", 2);
  Widgets.addCombo(row, null, ELEMENT_ORDER_LABELS, 0, SWT.DEFAULT, "cmbElementOrder", w);
  Widgets.addCheck(row, "Cycle", null, 2, w, "chkCycleElementOrder");

  // ── Connections ───────────────────────────────────────────────────────────────
  const grpCon = Widgets.group(page, "Connections", 1, BOX);
  row = Widgets.formRow(grpCon, "Line:", formRows, "form", 2);
  Widgets.addCombo(row, "Routing", ROUTING_ALL,   0, SWT.DEFAULT, "cmbRouting",       w);
  w.cmbRouting.addListener(SWT.Selection, () => _updateComboTooltips(w));
  Widgets.addCombo(row, "Label",   LABEL_POS_ALL, 1, SWT.DEFAULT, "cmbLabelPosition", w);
  w.cmbLabelPosition.addListener(SWT.Selection, () => _updateComboTooltips(w));
  Widgets.addCheck(row, "Reserve label space", null, 2, w, "chkConnectionLabelSpacing");
  row = Widgets.formRow(grpCon, "Spacing:", formRows, "form", 2);
  Widgets.addSpinnerRow(row, "Between",    "spinConnectionSpacing",        DP.connectionSpacing, 0, 200, 5, w);
  Widgets.addSpinnerRow(row, "Distance to element", "spinConnectionElementSpacing", DP.connectionElementSpacing, 0, 200, 5, w);
  // Selection: changed by the user only (not by setSelection while a preset is loaded)
  w.spinElementSpacing.addListener(SWT.Selection, () => _keepConnectionRoom(ctx, "element"));
  w.spinConnectionElementSpacing.addListener(SWT.Selection, () => _keepConnectionRoom(ctx, "connection"));

  Widgets.alignFormColumns(formRows);

  // ── View size ─────────────────────────────────────────────────────────────────
  const grpVS = Widgets.group(page, "View size", 1, BOX);

  // Inline row: ● Free  ○ Aspect ratio [combo]  ○ Max width [spinner]
  // All three radios live in the same composite → SWT mutual exclusion is automatic.
  const hintRow = new CompositeWidget(grpVS, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(0, 0).spacing(Widgets.GAP_FIELD, 0).applyTo(hintRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hintRow);

  /**
   * @param {string} label
   * @param {boolean} [first]
   */
  const _vsRadio = (label, first) => {
    const r = new ButtonWidget(hintRow, SWT.RADIO);
    r.setText(label);
    GridDataFactory.swtDefaults().indent(first ? 0 : Widgets.GAP_PAIR - Widgets.GAP_FIELD, 0).applyTo(r);
    r.addListener(SWT.Selection, () => { if (r.getSelection()) _applyViewSizeMode(ctx); });
    return r;
  };

  w.radioViewSizeNone = _vsRadio("Free", true);
  w.radioViewSizeNone.setSelection(true);
  w.radioViewSizeNone.setToolTipText("No size constraint: the layout determines the view size.");

  w.radioViewSizeAspectRatio = _vsRadio("Aspect ratio:");
  Widgets.addCombo(hintRow, null, AR_LABELS, 0, 150, "cmbAspectRatio", w);
  w.cmbAspectRatio.addListener(SWT.Selection, () => _updateConnectionsMode(ctx));

  w.radioViewSizeMaxWidth = _vsRadio("Max width:");
  const _spMaxWidth = new SpinnerWidget(hintRow, SWT.BORDER);
  _spMaxWidth.setValues(0, 0, 99999, 0, 100, 500);
  GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(_spMaxWidth);
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
  // condition tables are controllers: tooltip on their heading instead
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
                                   [w.cmbNodePlacement, "nodePlacement", NODE_PLACEMENT_TOOLTIPS],
                                   [w.cmbCircles, "circles", CIRCLES_TOOLTIPS]])) {
    if (!ctrl) continue;
    const item = String(ctrl.getText());
    ctrl.setToolTipText(Defs.paramTooltip(key, tips[item] ? `${item}: ${tips[item]}` : ""));
  }
}

/**
 * Layout › Relations counters: per nesting / reverse condition the relations on the predicted view it
 * matches (condition alone; an Exclude condition: what it removes from the other conditions' matches) and, for
 * nesting, how many of them become a nesting. A note explains nesting relations drawn as a line.
 * @param {DialogContext}    ctx
 * @param {ArchiRelation[]}  relations  of the predicted view
 * @param {LayoutConditionCounts} counts     (Counts.layoutConditionCounts)
 */
function updateLayoutConditionCounts(ctx, relations, counts) {
  const w = ctx.widgets;
  ctx.viewRelations = relations;   // property lists of the nesting / reverse conditions
  w.tblNestingConditions.refreshItems();
  w.tblReverseConditions.refreshItems();
  w.tblNestingConditions.setCounts(counts.nesting);
  w.tblReverseConditions.setCounts(counts.reverse);

  const { multiParent: multi, circular: circ, cycles, selfLoops: loops } = counts;
  /** @type {(n: number, s: string, p: string) => string} */
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
  const parts = [];
  if (multi) parts.push(`${plural(multi, "matching relation is", "matching relations are")} drawn as a line: the child already has a parent. ` +
                        "A condition with Every shows such a child in every parent.");
  if (circ)  parts.push(`${plural(circ, "matching relation forms", "matching relations form")} a circular nesting ` +
                        `(${plural(cycles, "cycle", "cycles")}, named in the log) and ${circ === 1 ? "is" : "are"} drawn as a line.`);
  if (loops) parts.push(`${plural(loops, "self-relation is", "self-relations are")} drawn as a line.`);
  const nestNone = _noIncludeNote(w.tblNestingConditions, "nested");
  const changed = [
    _setNote(w.lblNestingNote, nestNone || parts.join("\n")),
    _setNote(w.lblReverseNote, _noIncludeNote(w.tblReverseConditions, "reversed")),
  ];
  if (!changed.some(Boolean)) return;
  try { ctx.layoutPage.layout(true, true); } catch (e) {}
  Widgets.resizeScrolled(ctx.layoutScrolled, ctx.layoutPage);
}

/**
 * A feature list starts from nothing: with Exclude conditions but no Include condition that is on, it picks
 * nothing. The note says so; "" when the list has an Include condition that is on, or no conditions.
 * @param {ConditionTable<"relation">} table
 * @param {string} verb  "nested" | "reversed"
 */
function _noIncludeNote(table, verb) {
  const conditions = table.getConditions();
  if (!conditions.some(r => r.mode === "exclude") || conditions.some(r => r.on !== false && r.mode !== "exclude")) return "";
  return `No Include condition is on: nothing is ${verb}. Exclude conditions only take relations out of what Include conditions pick — ` +
         `add an Include condition for the relations to be ${verb}.`;
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

// True when the algorithm nests and a Nesting condition is on.
/**
 * @param {DialogWidgets} w
 * @param {AlgorithmSpec} alg
 */
function _nestingOn(w, alg) {
  return alg.activeParams.includes("nestingConditions") && Widgets.hasNestingConditions(w);
}

// Containers settings are greyed out until a Nesting condition is on; the box's tooltip says why.
/**
 * @param {DialogContext} ctx
 * @param {string} algName
 */
function _updateContainersHint(ctx, algName) {
  const w = ctx.widgets;
  if (!w.grpContainers) return;
  const alg = ALGORITHMS[algName];
  const usesContainers = Defs.LAYOUT_GROUPS.Containers.some(k => alg.activeParams.includes(k));
  try { w.grpContainers.setToolTipText(usesContainers && !_nestingOn(w, alg) ? "Add a Nesting condition to use these settings." : ""); } catch (e) {}
}

// ── Algorithm controls ────────────────────────────────────────────────────────


/** @param {DialogContext} ctx */
function updateAlgorithmControls(ctx) {
  ctx.markModified();
  const w = ctx.widgets;
  if (!w.algRadios) return;
  const alg    = ALGORITHMS[selectedAlgorithm(w)];
  const active = new Set(alg.activeParams);
  _keepConnectionRoom(ctx, "element");

  // Select-type params offer the algorithm's supported values; inactive ones keep the full list.
  for (const [key, def] of Object.entries(PARAM_WIDGETS))
    if (def.kind === "combo" && w[def.w]) _setComboItems(w[def.w], alg.supportedOptions[key] || def.items);
  _updateComboTooltips(w);

  for (const [key, def] of Object.entries(PARAM_WIDGETS)) Widgets.enable(w[def.w], active.has(key));
  // Use label width replaces the fixed element size; its max width only applies with Use label width on.
  const labelSizingOn = active.has("labelSizing") && w.chkLabelSizing && w.chkLabelSizing.getSelection();
  Widgets.enable(w.spinElementWidth,      active.has("elementWidth")  && !labelSizingOn);
  Widgets.enable(w.spinElementHeight,     active.has("elementHeight") && !labelSizingOn);
  Widgets.enable(w.spinLabelMaxLineWidth, labelSizingOn);
  // Containers settings only matter once a Nesting condition is on.
  if (!_nestingOn(w, alg))
    for (const k of Defs.LAYOUT_GROUPS.Containers) if (PARAM_WIDGETS[k]) Widgets.enable(w[PARAM_WIDGETS[k].w], false);
  _updateContainersHint(ctx, selectedAlgorithm(w));

  // View size radios: unsupported options are greyed; a selected unsupported option falls back to None.
  Widgets.enable(w.radioViewSizeMaxWidth,    active.has("maxWidth"));
  Widgets.enable(w.radioViewSizeAspectRatio, active.has("aspectRatio"));
  const vsMode = getViewSizeMode(w);
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
function selectedAlgorithm(w) {
  for (const [name, r] of (w.algRadios || new Map())) if (r.getSelection()) return name;
  return DEFAULT_PRESET.algorithm;
}

const CONNECTION_ROOM_SLACK = 2;   // px

/**
 * Algorithms that route connections between the elements (defs connectionsBetweenElements) need
 * Element distance ≥ 2 × Distance to element + CONNECTION_ROOM_SLACK: at exactly 2 × Graphviz finds
 * elements touching within the connection margin and draws every connection straight. The value
 * the user changed wins; the other follows. Element distance is also at least the shortest
 * connection that shows both end symbols (MIN_CONNECTION_LENGTH).
 * @param {DialogContext} ctx
 * @param {"element" | "connection"} changed
 */
function _keepConnectionRoom(ctx, changed) {
  const w = ctx.widgets;
  if (!w.algRadios || !w.spinElementSpacing || !w.spinConnectionElementSpacing) return;
  if (!ALGORITHMS[selectedAlgorithm(w)].connectionsBetweenElements) return;
  if (w.spinElementSpacing.getSelection() < Defs.MIN_CONNECTION_LENGTH) w.spinElementSpacing.setSelection(Defs.MIN_CONNECTION_LENGTH);
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
 * @param {DialogWidgets} w
 * @returns {ViewSizeMode}
 */
function getViewSizeMode(w) {
  if (w.radioViewSizeMaxWidth    && w.radioViewSizeMaxWidth.getSelection())    return "maxWidth";
  if (w.radioViewSizeAspectRatio && w.radioViewSizeAspectRatio.getSelection()) return "aspectRatio";
  return "none";
}

/** @param {DialogContext} ctx */
function _applyViewSizeMode(ctx) {
  const w    = ctx.widgets;
  const mode = getViewSizeMode(w);
  Widgets.enable(w.spinMaxWidth,   mode === "maxWidth");
  Widgets.enable(w.cmbAspectRatio, mode === "aspectRatio");
  _updateConnectionsMode(ctx);
}

// Connections mode follows Defs.connectionsModeLock: Grid / Pack inside containers or an active
// view size force "Between containers" and lock the combo; the tooltip names the reason.
/** @param {DialogContext} ctx */
function _updateConnectionsMode(ctx) {
  const w = ctx.widgets;
  if (!w.cmbConnectionsMode || !w.algRadios) return;
  const algName = selectedAlgorithm(w);
  const alg     = ALGORITHMS[algName];
  if (!alg.activeParams.includes("connectionsMode") || !_nestingOn(w, alg)) { Widgets.enable(w.cmbConnectionsMode, false); return; }
  const arIdx  = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  const reason = Defs.connectionsModeLock(algName, {
    containerAlgorithm: w.cmbContainerAlgorithm ? w.cmbContainerAlgorithm.getText() : "",
    viewSizeMode:       getViewSizeMode(w),
    aspectRatio:        AR_OPTIONS[Math.max(0, arIdx)] ? AR_OPTIONS[Math.max(0, arIdx)].val : 0,
    maxWidth:           w.spinMaxWidth ? w.spinMaxWidth.getSelection() : 0,
  });
  Widgets.enable(w.cmbConnectionsMode, !reason);
  if (reason) w.cmbConnectionsMode.select(CONNECTIONS_MODE_LABELS.indexOf("Between containers"));
  w.cmbConnectionsMode.setToolTipText(Defs.paramTooltip("connectionsMode",
    reason ? `Locked to Between containers: Crossing containers is not possible with ${reason}.` : ""));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildLayoutTab, updateAlgorithmControls, updateLayoutConditionCounts, selectedAlgorithm, getViewSizeMode, PARAM_WIDGETS, ELEMENT_ORDER_LABELS,
  };
}
