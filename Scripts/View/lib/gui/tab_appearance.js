/**
 * Appearance tab of the View dialog: style by property, style by nesting level, highlight repeated elements.
 */
console.log("Loading tab_appearance.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");
/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./counts")} */
const Counts = require(REPO_ROOT + "View/lib/gui/counts");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");
/** @type {typeof import("./tab_selection")} */
const TabSelection = require(REPO_ROOT + "View/lib/gui/tab_selection");
/** @type {typeof import("./condition_table")} */
const { conditionTable, STYLE_CONDITION_COLUMNS } = require(REPO_ROOT + "View/lib/gui/condition_table");

const { RELATION_TYPE_IDS, DEFAULT_PRESET } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const TextWidget              = Java.type("org.eclipse.swt.widgets.Text");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

/**
 * True when an active nesting Include condition has Every (a child appears in every parent).
 * @param {DialogWidgets} w
 */
function _hasEveryContainer(w) {
  return !!w.tblNestingConditions && w.tblNestingConditions.getConditions().some(r => r.on !== false && r.mode !== "exclude" && r.everyContainer === true);
}

/** @type {Set<string>} */
const _REL_TYPE_ID_SET = new Set(RELATION_TYPE_IDS);

// Enable or disable the controls that depend on a feature being on (Highlight repeated).
// Called from the feature's checkbox and from _syncToUI.
/** @param {DialogContext} ctx */
function updateAppearancePropStates(ctx) {
  const w = ctx.widgets;
  if (!w.chkHighlightRep) return; // appearance tab not yet built
  const hlOn = !!w.chkHighlightRep.getSelection() && _hasEveryContainer(w);
  Widgets.enable(w.lblHighlightRepRange, hlOn);
  Widgets.enable(w.cmbHighlightRepRange, hlOn);
  try { if (w.cmbHighlightRepRangeCanvas) w.cmbHighlightRepRangeCanvas.redraw(); } catch (e) {}
}

// Property names for a style condition: from the objects the predicted view holds (falls back to
// the raw selection before the first count).
/**
 * @param {DialogContext} ctx
 * @param {StyleCondition} r
 */
function _stylePropItems(ctx, r) {
  const pred = ctx.predicted;
  const els  = pred ? pred.elements  : TabSelection.rawElements(ctx, "");
  const rels = pred ? pred.relations : (ctx.rawModelObjects || []).filter(o => _REL_TYPE_ID_SET.has(o.type));
  const of = r.color === "element" ? "element" : r.propertyOf === "element" ? r.color : r.propertyOf;
  if (of === "relation") return Counts.propNames(rels.filter(x => !r.relation || x.type === r.relation));
  const type = of === "target" ? r.target : r.source;
  return Counts.propNames(els.filter(x => !type || x.type === type));
}

// ⚠ column of the style conditions: conditions that style the same object on the predicted view.
/** @param {DialogContext} ctx */
function updateStyleWarnings(ctx) {
  const w = ctx.widgets;
  const t = w.tblStyleConditions;
  if (!t) return;
  t.refreshItems();
  /** @type {Map<number, string>} */
  const warnings = new Map();
  /** @type {ConditionTableCounts[]} */
  const counts = [];
  const pred = ctx.predicted;
  if (pred) {
    /** @type {Map<number, Set<string>>} */
    const styled = new Map();
    t.displayedConditions().forEach((r, i) => {
      counts[i] = {};
      try {
        // A condition that is off is counted as if it were on, but takes no part in the conflict check.
        const targets = Appearance.computeConditionTargets(Object.assign({}, r, { on: true }), pred.elements, pred.relations);
        /** @type {Set<string>} */
        const ids = new Set();
        targets.forEach((h, id) => { if (h.values.size > 0) ids.add(`${h.kind}:${id}`); });
        // Feedback in the Property combo: colored objects, or reached objects before a property is chosen.
        counts[i] = { count: r.property ? ids.size : targets.size };
        if (r.property && r.on !== false) styled.set(i, ids);
      } catch (e) {}
    });
    ConditionLists.detectConditionConflicts(styled).forEach(c => warnings.set(c.condition,
      `Condition ${c.with.map(j => j + 1).join(", ")} also styles ${c.count} of these objects. ` +
      "The last condition wins. Change a condition or switch one off."));
  }
  t.setCounts(counts);
  t.setWarnings(warnings);

  const lbl = w.lblStyleConflicts;
  if (!lbl) return;
  const text = warnings.size === 0 ? ""
    : `⚠ Conditions ${Array.from(warnings.keys()).map(i => i + 1).join(", ")} style the same objects. ` +
      "The last condition wins. Change a condition or switch one off.";
  if (String(lbl.getText()) === text) return;
  lbl.setText(text);
  lbl.setVisible(!!text);
  lbl.getLayoutData().exclude = !text;
  try { ctx.appearancePage.layout(true, true); } catch (e) {}
  Widgets.resizeScrolled(ctx.appearanceScrolled, ctx.appearancePage);
}

// ── Appearance tab ────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function buildAppearanceTab(tabFolder, ctx) {
  const { page, scrolled, finish } = Widgets.scrolledTab(tabFolder, "Appearance");
  const w = ctx.widgets;
  const onChange = () => ctx.markModified();
  ctx.appearancePage     = page;
  ctx.appearanceScrolled = scrolled;

  // ── 1. Style by property: style conditions ──────────────────────────────────────
  const grpSbp = Widgets.group(page, "Style by property", 1);

  const sbpDescLbl = new LabelWidget(grpSbp, SWT.WRAP);
  sbpDescLbl.setText("Color elements or relations by property values. Each condition says what gets the color and whose property gives the value.");
  GridDataFactory.fillDefaults().grab(true, false).hint(420, SWT.DEFAULT).applyTo(sbpDescLbl);

  const onStyleChange = () => { ctx.markModified(); updateStyleWarnings(ctx); };
  w.tblStyleConditions = conditionTable(grpSbp, {
    kind: "style", columns: STYLE_CONDITION_COLUMNS, onChange: onStyleChange,
    onLayout: () => {
      try { ctx.appearancePage.layout(true, true); } catch (e) {}
      Widgets.resizeScrolled(ctx.appearanceScrolled, ctx.appearancePage);
    },
    propItems: r => _stylePropItems(ctx, r),
    rowTooltip: Counts.styleConditionSentence,
    emptyText: "No style conditions.",
    addTooltip: "Add a style condition. Where two conditions style the same object, the last condition wins (⚠).",
  });

  w.lblStyleConflicts = Widgets.noteLabel(grpSbp, "");
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
  const mixedSwatch = Widgets.solidColorSwatch(sbpFoot, txtMixed.getText(), "mixedSwatch", w);
  const mixedOnChange = () => { mixedSwatch.setColor(txtMixed.getText().trim()); onChange(); };
  txtMixed.addListener(SWT.FocusOut, mixedOnChange);
  txtMixed.addListener(SWT.DefaultSelection, mixedOnChange);

  const widthTip = "Line width for all relations colored by a condition with Color = Relation.";
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
  const grpNest = Widgets.group(page, "Style by nesting level", 1);

  // Info label — shown/hidden via updateNestingLevelState (hidden when nesting types are configured).
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
  GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestRootFontSp);
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
  GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestFontDecreaseSp);
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
  chkNestColor.addListener(SWT.Selection, () => { updateNestingLevelState(ctx); onChange(); });
  w.chkNestColor = chkNestColor;

  const nestRootColorTxt = new TextWidget(nestColorRow, SWT.BORDER);
  nestRootColorTxt.setToolTipText("Fallback color used when the chain root container has no fill color set");
  GridDataFactory.swtDefaults().hint(72, SWT.DEFAULT).applyTo(nestRootColorTxt);
  w.txtRootColor = nestRootColorTxt;
  const nestRootSwatch = Widgets.solidColorSwatch(nestColorRow, "", "nestRootSwatch", w);
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
  GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(nestLightenSp);
  nestLightenSp.setToolTipText("Percentage to lighten fill color per level toward root");
  nestLightenSp.addListener(SWT.Selection, onChange);
  w.spinNestLighten = nestLightenSp;

  const lblNestLightenPct = new LabelWidget(nestColorRow, SWT.NONE);
  lblNestLightenPct.setText("%");
  w.lblNestLightenPct = lblNestLightenPct;

  // ── 5. Highlight repeated elements ───────────────────────────────────────
  const grpHighlight = Widgets.group(page, "Highlight repeated elements", 1);

  const hlDescLbl = new LabelWidget(grpHighlight, SWT.WRAP);
  hlDescLbl.setText("Elements that have multiple occurrences get the same color. Repetition becomes visible across the model.");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hlDescLbl);

  const hlRow = new CompositeWidget(grpHighlight, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(0,2).spacing(6,0).applyTo(hlRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hlRow);

  const chkHighlightRep = new ButtonWidget(hlRow, SWT.CHECK);
  chkHighlightRep.setText("Enable");
  chkHighlightRep.setToolTipText("Elements that appear more than once on this view receive a shared color per identity.\nNeeds a Nesting condition with Every.");
  chkHighlightRep.addListener(SWT.Selection, () => {
    updateAppearancePropStates(ctx);
    onChange();
  });
  w.chkHighlightRep = chkHighlightRep;

  const hlRangeLbl = new LabelWidget(hlRow, SWT.NONE);
  hlRangeLbl.setText("Color range:");
  w.lblHighlightRepRange = hlRangeLbl;
  Widgets.colorRangeSelector(hlRow, "Pastel1", "cmbHighlightRepRange", w,
    "Color scale for assigning distinct colors to repeated element identities.", onChange);

  updateNestingLevelState(ctx);
  updateAppearancePropStates(ctx);
  finish();
}

// Enable/disable the "Style by nesting level" controls based on whether any nesting
// conditions are configured in the Layout tab. Called from _syncToUI and when the nesting conditions
// change, so both tabs stay in sync.
/** @param {DialogContext} ctx */
function updateNestingLevelState(ctx) {
  const w = ctx.widgets;
  if (!w.chkNestFont) return; // Appearance tab not yet built — skip

  const hasNesting = Widgets.hasNestingConditions(w);

  try { w.lblNestingInfo.setVisible(!hasNesting); } catch (e) {}
  try {
    const gd = w.lblNestingInfo.getLayoutData();
    gd.exclude = hasNesting;
    w.lblNestingInfo.setLayoutData(gd);
    const parent = w.lblNestingInfo.getParent && w.lblNestingInfo.getParent();
    if (parent) parent.layout(true, true);
  } catch (e) {}

  Widgets.enable(w.nestDescLbl,          hasNesting);
  Widgets.enable(w.chkNestFont,          hasNesting);
  Widgets.enable(w.spinNestRootFontSize, hasNesting);
  Widgets.enable(w.chkNestRootBold,      hasNesting);
  Widgets.enable(w.lblNestDecrease,      hasNesting);
  Widgets.enable(w.spinNestFontDecrease, hasNesting);
  Widgets.enable(w.lblNestFontPt,        hasNesting);
  Widgets.enable(w.nestMidSep,           hasNesting);
  Widgets.enable(w.chkNestColor,         hasNesting);
  Widgets.enable(w.chkHighlightRep,      _hasEveryContainer(w));  // repeats only come from conditions with Every
  updateAppearancePropStates(ctx);

  const hasColor = hasNesting && w.chkNestColor.getSelection();
  Widgets.enable(w.txtRootColor,         hasColor);
  Widgets.enable(w.nestRootSwatch,       hasColor);
  Widgets.enable(w.lblNestLighten,        hasColor);
  Widgets.enable(w.spinNestLighten,       hasColor);
  Widgets.enable(w.lblNestLightenPct,     hasColor);
  try { if (w.nestRootSwatch) w.nestRootSwatch.redraw(); } catch (e) {}
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildAppearanceTab, updateNestingLevelState, updateAppearancePropStates, updateStyleWarnings,
  };
}
