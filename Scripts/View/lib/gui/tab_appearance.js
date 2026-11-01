/**
 * Appearance tab of the View dialog: palette, style by property, style by nesting level, highlight repeated elements.
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
const { conditionTable, styleConditionColumns, nestingStyleConditionColumns } = require(REPO_ROOT + "View/lib/gui/condition_table");
/** @type {typeof import("../palettes")} */
const Palettes = require(REPO_ROOT + "View/lib/palettes");

const { RELATION_TYPE_IDS, DEFAULT_PRESET } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
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
  Widgets.enable(w.pickHighlightRepRange, hlOn);
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
  const of = r.applyTo === "element" ? "element" : r.propertyOf === "element" ? r.applyTo : r.propertyOf;
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
  const relayout = () => {
    try { ctx.appearancePage.layout(true, true); } catch (e) {}
    Widgets.resizeScrolled(ctx.appearanceScrolled, ctx.appearancePage);
  };

  // The rows of the groups share one heading column (Widgets.formRow / alignFormColumns).
  /** @type {Swt.Composite[]} */
  const formRows = [];

  // ── Colors: the palette every colour and colour range of the tab comes from ──
  try { ctx.palettes = Palettes.readPalettes(); }
  catch (e) { ctx.palettes = []; console.error(`Appearance: ${e}`); }
  const grpColors = Widgets.group(page, "Colors", 1);
  Widgets.noteLabel(grpColors, "Every color and color range on this tab comes from the palette.");
  const paletteRow = Widgets.formRow(grpColors, "Palette:", formRows);
  const cmbPalette = new ComboWidget(paletteRow, SWT.READ_ONLY | SWT.DROP_DOWN);
  ctx.palettes.forEach(p => cmbPalette.add(p.name));
  if (ctx.palettes.length) cmbPalette.select(0);
  cmbPalette.setToolTipText(`Colors and color ranges that belong together (${Palettes.PALETTES_FILE} in the presets folder).`);
  cmbPalette.addListener(SWT.Selection, () => {
    w.tblNestingStyleConditions.refreshItems();
    w.tblStyleConditions.refreshItems();
    w.pickMixedColor.refresh();
    w.pickHighlightRepRange.refresh();
    onChange();
  });
  w.cmbPalette = cmbPalette;
  const palette = () => ctx.palettes[Math.max(0, cmbPalette.getSelectionIndex())];
  const paletteColors = () => { const p = palette(); return p ? p.colors : []; };
  const paletteRanges = () => Widgets.rangeItems(palette());

  // ── 1. Style by property: style conditions ──────────────────────────────────────
  const grpSbp = Widgets.group(page, "Style by property", 1);

  Widgets.noteLabel(grpSbp, "Color elements or relations by property values. Each condition says what gets the color and whose property gives the value.");

  const onStyleChange = () => { ctx.markModified(); updateStyleWarnings(ctx); };
  w.tblStyleConditions = conditionTable(grpSbp, {
    kind: "style", columns: styleConditionColumns(paletteRanges), onChange: onStyleChange,
    onLayout: relayout,
    propItems: r => _stylePropItems(ctx, r),
    rowTooltip: Counts.styleConditionSentence,
    emptyText: "No style conditions.",
    addTooltip: "Add a style condition. Where two conditions style the same object, the last condition wins (⚠).",
  });

  w.lblStyleConflicts = Widgets.noteLabel(grpSbp, "");
  w.lblStyleConflicts.getLayoutData().exclude = true;
  w.lblStyleConflicts.setVisible(false);

  const sbpFoot = Widgets.formRow(grpSbp, "Options:", formRows);
  const mixedTip = "Used when an element or relation has more than one value for the property,\n" +
                   "so no single color of the range applies.";
  const lblMixed = new LabelWidget(sbpFoot, SWT.NONE);
  lblMixed.setText("Mixed values color");
  lblMixed.setToolTipText(mixedTip);
  w.pickMixedColor = Widgets.paletteColorPicker(sbpFoot, {
    colors: paletteColors, value: DEFAULT_PRESET.appearance.styleByProperty.mixedValuesColor, onChange, tooltip: mixedTip, width: 170,
  });

  const widthTip = "Line width for all relations colored by a condition with Apply to = Relation.";
  const lblWidth = new LabelWidget(sbpFoot, SWT.NONE);
  lblWidth.setText("Line width");
  lblWidth.setToolTipText(widthTip);
  const cmbWidth = new ComboWidget(sbpFoot, SWT.READ_ONLY | SWT.DROP_DOWN);
  ["No change", "1 - Normal", "2 - Medium", "3 - Heavy"].forEach(t => cmbWidth.add(t));
  cmbWidth.select(0);
  cmbWidth.setToolTipText(widthTip);
  cmbWidth.addListener(SWT.Selection, onChange);
  w.cmbStyleLineWidth = cmbWidth;

  // ── 4. Style by nesting level ─────────────────────────────────────────────
  const grpNest = Widgets.group(page, "Style by nesting level", 1);

  // Info label — shown/hidden via updateNestingLevelState (hidden when a Nesting condition is on).
  w.lblNestingInfo = Widgets.noteLabel(grpNest, "Turn on a Nesting condition in the Layout tab to use this.");
  w.nestDescLbl = Widgets.noteLabel(grpNest, "Emphasize significant nesting levels with color and font. " +
    "Each condition marks a level; deeper levels get lighter and smaller.");

  // Switches first, then the conditions both use. One raster: the first label after each
  // switch lines up.
  let nestRow = Widgets.formRow(grpNest, "Apply:", formRows, "nestSwitches", 3);
  /** @param {string} text */
  const nestLabel = text => {
    const l = new LabelWidget(nestRow, SWT.NONE);
    l.setText(text);
    return l;
  };

  // Font row
  const chkNestFont = Widgets.checkBox(nestRow, "Font");
  GridDataFactory.fillDefaults().span(2, 1).applyTo(chkNestFont.control);
  chkNestFont.setToolTipText("Where a condition starts, the container takes its Font size and Bold;\n" +
                             "each level deeper is smaller and not bold.");
  chkNestFont.addListener(SWT.Selection, () => { updateNestingLevelState(ctx); onChange(); });
  w.chkNestFont = chkNestFont;

  const decreaseTip = "Points smaller per level deeper, never below the default size.";
  w.lblNestDecrease = nestLabel("Smaller per level");
  w.lblNestDecrease.setToolTipText(decreaseTip);
  const decrease = _spinnerWithUnit(nestRow, "pt");
  decrease.spinner.setValues(2, 1, 6, 0, 1, 1);
  decrease.spinner.setToolTipText(decreaseTip);
  decrease.spinner.addListener(SWT.Selection, onChange);
  w.spinNestFontDecrease = decrease.spinner;
  w.lblNestFontPt = decrease.unit;

  // Color row
  nestRow = Widgets.formRow(grpNest, "", formRows, "nestSwitches", 3);
  const chkNestColor = Widgets.checkBox(nestRow, "Color");
  GridDataFactory.fillDefaults().span(2, 1).applyTo(chkNestColor.control);
  chkNestColor.setToolTipText("The elements a condition selects take its color; each level deeper in that color is lighter.\n" +
                              "When conditions select the same element, the most specific wins.");
  chkNestColor.addListener(SWT.Selection, () => { updateNestingLevelState(ctx); onChange(); });
  w.chkNestColor = chkNestColor;

  const lightenTip = "Per level inside a segment, the fill moves this percentage closer to white\n" +
                     "(hue and saturation kept).";
  w.lblNestLighten = nestLabel("Lighter per level");
  w.lblNestLighten.setToolTipText(lightenTip);
  const lighten = _spinnerWithUnit(nestRow, "%");
  lighten.spinner.setValues(15, 5, 40, 0, 5, 5);
  lighten.spinner.setToolTipText(lightenTip);
  lighten.spinner.addListener(SWT.Selection, onChange);
  w.spinNestLighten = lighten.spinner;
  w.lblNestLightenPct = lighten.unit;

  const darkenTip = "A segment starts this many levels darker than its color,\n" +
                    "so its color is reached this many levels in.";
  w.lblNestDarken = nestLabel("Start darker");
  w.lblNestDarken.setToolTipText(darkenTip);
  const darken = _spinnerWithUnit(nestRow, "levels");
  darken.spinner.setValues(DEFAULT_PRESET.appearance.nestingLevel.darkenStart, 0, 3, 0, 1, 1);
  darken.spinner.setToolTipText(darkenTip);
  darken.spinner.addListener(SWT.Selection, onChange);
  w.spinNestDarken = darken.spinner;
  w.lblNestDarkenSteps = darken.unit;

  w.tblNestingStyleConditions = conditionTable(grpNest, {
    kind: "nestingStyle", onChange,
    columns: nestingStyleConditionColumns(paletteColors, { color: () => chkNestColor.getSelection(), font: () => chkNestFont.getSelection() }),
    onLayout: relayout,
    emptyText: "No conditions: nothing is styled by nesting level.",
    addTooltip: "Add a nesting step to follow. When conditions select the same element, the most specific wins.",
  });

  // ── 5. Highlight repeated elements ───────────────────────────────────────
  const grpHighlight = Widgets.group(page, "Highlight repeated elements", 1);

  Widgets.noteLabel(grpHighlight, "Elements that have multiple occurrences get the same color. Repetition becomes visible across the model.");

  const hlRow = Widgets.formRow(grpHighlight, "", formRows);
  const chkHighlightRep = Widgets.checkBox(hlRow, "Highlight");
  GridDataFactory.fillDefaults().span(2, 1).applyTo(chkHighlightRep.control);
  chkHighlightRep.setToolTipText("Elements that appear more than once on this view receive a shared color per identity.\nNeeds a Nesting condition with Every.");
  chkHighlightRep.addListener(SWT.Selection, () => {
    updateAppearancePropStates(ctx);
    onChange();
  });
  w.chkHighlightRep = chkHighlightRep;

  const hlRangeLbl = new LabelWidget(hlRow, SWT.NONE);
  hlRangeLbl.setText("Color range");
  w.lblHighlightRepRange = hlRangeLbl;
  w.pickHighlightRepRange = Widgets.colorRangePicker(hlRow, DEFAULT_PRESET.appearance.highlightRepeated.colorRange, onChange,
    paletteRanges, "Colors of the palette's range, one per repeated element.");

  Widgets.alignFormColumns(formRows);
  updateNestingLevelState(ctx);
  updateAppearancePropStates(ctx);
  finish();
}

/**
 * A spinner with its unit right behind it: one control cell of a form row (Look 4).
 * @param {Swt.Composite} row
 * @param {string} unit
 * @returns {{ spinner: Swt.Spinner, unit: Swt.Label }}
 */
function _spinnerWithUnit(row, unit) {
  const cell = new CompositeWidget(row, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).spacing(4, 0).applyTo(cell);
  const spinner = new SpinnerWidget(cell, SWT.BORDER);
  GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(spinner);
  const lbl = new LabelWidget(cell, SWT.NONE);
  lbl.setText(unit);
  return { spinner, unit: lbl };
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
  w.tblNestingStyleConditions.enable(hasNesting);
  Widgets.enable(w.chkNestFont,          hasNesting);
  Widgets.enable(w.chkNestColor,         hasNesting);
  Widgets.enable(w.chkHighlightRep,      _hasEveryContainer(w));  // repeats only come from conditions with Every
  updateAppearancePropStates(ctx);

  const hasFont = hasNesting && w.chkNestFont.getSelection();
  Widgets.enable(w.lblNestDecrease,      hasFont);
  Widgets.enable(w.spinNestFontDecrease, hasFont);
  Widgets.enable(w.lblNestFontPt,        hasFont);

  const hasColor = hasNesting && w.chkNestColor.getSelection();
  Widgets.enable(w.lblNestDarken,        hasColor);
  Widgets.enable(w.spinNestDarken,       hasColor);
  Widgets.enable(w.lblNestDarkenSteps,   hasColor);
  Widgets.enable(w.lblNestLighten,        hasColor);
  Widgets.enable(w.spinNestLighten,       hasColor);
  Widgets.enable(w.lblNestLightenPct,     hasColor);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildAppearanceTab, updateNestingLevelState, updateAppearancePropStates, updateStyleWarnings,
  };
}
