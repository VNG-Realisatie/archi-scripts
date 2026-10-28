/**
 * Selection tab of the View dialog: the current selection, its filters and the Expand selection step blocks.
 */
console.log("Loading tab_selection.js");

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
/** @type {typeof import("./condition_table")} */
const { conditionTable, ELEMENT_CONDITION_COLUMNS, DIAGRAM_CONDITION_COLUMNS, FILTER_RELATION_CONDITION_COLUMNS, STEP_CONDITION_COLUMNS } = require(REPO_ROOT + "View/lib/gui/condition_table");

const { ELEMENT_TYPES, DIAGRAM_TYPES } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const GroupWidget       = Java.type("org.eclipse.swt.widgets.Group");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

// Single-line wide label, used for the Selected/Containing/Filtered/Related-N count lines.
/** @param {Swt.Composite} parent */
function _selLine(parent) {
  const l = new LabelWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// ── Selection tab ─────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 * @param {SelectionCounts} selectedCount
 * @param {SelectionCounts} containingCount
 */
function buildSelectionTab(tabFolder, ctx, selectedCount, containingCount) {
  const { page, scrolled, finish } = Widgets.scrolledTab(tabFolder, "Selection");
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
    scrolled.addControlListener(ControlListenerJ.controlResizedAdapter(e => Widgets.resizeScrolled(scrolled, page)));
  } catch (e) {}

  // ── Current selection ────────────────────────────────────────────────────────
  // Three 2-col counter rows (Selected / Containing / Filtered) + the global Filter
  // as a labelled section directly underneath, all inside one Group.
  const grpInfo = Widgets.group(page, "Current selection", 1, { marginH: 8, marginV: 6, spaceH: 0, spaceV: 3 });

  // 2-col sub-composite: [fixed-width label] [count text, grabs width]
  const ctrComp = new CompositeWidget(grpInfo, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 2).applyTo(ctrComp);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(ctrComp);

  new LabelWidget(ctrComp, SWT.NONE).setText("Selected in Archi:");
  w.lblSelectedCount = _selLine(ctrComp);
  w.lblSelectedCount.setText(Counts.formatCountsBody(selected, ctx.firstObject));
  w.lblSelectedCount.setToolTipText(
    "Raw count of what you picked in Archi (model tree or canvas), before expansion or filtering.");

  new LabelWidget(ctrComp, SWT.NONE).setText("Containing:");
  w.lblContainingCount = _selLine(ctrComp);
  w.lblContainingCount.setText(Counts.formatCountsBody(containing));
  w.lblContainingCount.setToolTipText(
    "After recursively expanding folders to their elements and views to their visual contents.");

  // Horizontal rule separating count lines from the filter sub-section.
  const filterSep = new LabelWidget(grpInfo, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(filterSep);

  const onFilterChange = () => ctx.recount();

  const onSelLayout = () => {
    try { ctx.selectionPage.layout(true, true); } catch (e) {}
    Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  };

  Widgets.lbl(grpInfo, "Filter selection by element type (no Include condition = keep all, minus Exclude):");
  w.tblElementConditions = conditionTable(grpInfo, {
    kind: "element", columns: ELEMENT_CONDITION_COLUMNS, filterList: true, propCondition: true,
    onChange: onFilterChange, onLayout: onSelLayout,
    propItems:  r => Counts.propNames(rawElements(ctx, r.elementType)),
    valueItems: r => Counts.propValues(rawElements(ctx, r.elementType), r.property),
  });

  // Diagram objects only come from selected views: without them the diagram filter is hidden
  // (its conditions are kept and saved).
  const diagBox = new CompositeWidget(grpInfo, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 4).applyTo(diagBox);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(diagBox);
  Widgets.lbl(diagBox, "Filter selection by diagram type (no Include condition = keep all, minus Exclude):");
  w.tblDiagramConditions = conditionTable(diagBox, {
    kind: "diagram", columns: DIAGRAM_CONDITION_COLUMNS, filterList: true, onChange: onFilterChange, onLayout: onSelLayout,
  });
  const hasDiagramObjects = (ctx.rawModelObjects || []).some(o => (o.type || "") in DIAGRAM_TYPES);
  diagBox.setVisible(hasDiagramObjects);
  diagBox.getLayoutData().exclude = !hasDiagramObjects;

  Widgets.lbl(grpInfo, "Filter selection by relations (no Include condition = keep all, minus Exclude):");
  w.tblRelationConditions = conditionTable(grpInfo, {
    kind: "relation", columns: FILTER_RELATION_CONDITION_COLUMNS, filterList: true, onChange: onFilterChange, onLayout: onSelLayout,
  });

  // ── Expand selection ─────────────────────────────────────────────────────────
  // One block per step; each holds a condition table. "+ Add step" sits below the steps.
  const grpRel = Widgets.group(page, "Expand selection", 1);

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
  btnAddBlock.addListener(SWT.Selection, () => addRelatedBlock(ctx));

  finish();
}

// ── Property lists for condition tables ───────────────────────────────────────────

/**
 * Elements of the raw selection, optionally of one type.
 * @param {DialogContext} ctx
 * @param {string} type
 */
function rawElements(ctx, type) {
  return (ctx.rawModelObjects || []).filter(o => _ELEM_TYPE_SET.has(o.type) && (!type || o.type === type));
}

/**
 * The objects a step condition's property is read from, among the step's candidates.
 * @param {StepBlock} b
 * @param {StepCondition} condition
 */
function _stepPropObjects(b, condition) {
  const probe = [Object.assign({}, condition, { mode: "include", property: "", value: "" })];
  return (b.candidates || []).filter(c => ConditionLists.matchStep(probe, c)).map(c =>
    condition.propertyOf === "relation" ? c.rel : condition.propertyOf === "previous" ? c.frontier : c.other);
}

// ── Expand selection: step blocks ─────────────────────────────────────────────

// Append a new step block.
// stepData (optional): { repeat, conditions } from a preset to restore.
/**
 * @param {DialogContext} ctx
 * @param {Step} [stepData]
 */
function addRelatedBlock(ctx, stepData) {
  const w = ctx.widgets;
  const blocksContainer = w.blocksContainer;
  const onChange = () => ctx.recount();
  const onLayout = () => {
    try { ctx.selectionPage.layout(true, true); } catch (e) {}
    Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
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
  const f = Widgets.getBoldFont(); if (f) try { lblTitle.setFont(f); } catch (e) {}
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
    collapsed: false, addsText: "nothing", candidates: /** @type {StepCandidate[]} */ ([]), countCache: new Map(),
    getRepeat: () => Defs.REPEAT_OPTIONS[Math.max(0, cmbRepeat ? cmbRepeat.getSelectionIndex() : 0)].value,
  });

  blockObj.table = conditionTable(body, {
    kind: "step", columns: STEP_CONDITION_COLUMNS, filterList: true, propCondition: true,
    onChange: () => { refreshBlockHeader(blockObj); onChange(); }, onLayout,
    propItems:  r => Counts.propNames(_stepPropObjects(blockObj, r)),
    valueItems: r => Counts.propValues(_stepPropObjects(blockObj, r), r.property),
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
  blockObj.table.setConditions(stepData ? stepData.conditions : []);
  if (stepData) {
    const r = Defs.normalizeRepeat(stepData.repeat);
    // Cast: set by the footer callback, which conditionTable calls before it returns.
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
  ctx.recount();
  Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

// Header summary: "· Adds: …"; collapsed, it also names the number of conditions.
/** @param {StepBlock} b */
function refreshBlockHeader(b) {
  if (!b || !b.lblBlockCounts) return;
  const n = b.table ? b.table.displayedConditions().length : 0;
  const conditionsPart = b.collapsed ? `${n} condition${n === 1 ? "" : "s"} · ` : "";
  try { b.lblBlockCounts.setText(`·  ${conditionsPart}Adds: ${b.addsText || "nothing"}`); } catch (e) {}
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
  refreshBlockHeader(b);
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
  ctx.recount();
  Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
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
  ctx.recount();
}

/**
 * @param {DialogContext} ctx
 * @param {StepBlock} blockObj
 */
function _toggleCollapseBlock(ctx, blockObj) {
  _setBlockCollapsed(blockObj, !blockObj.collapsed);
  try { ctx.selectionPage.layout(true, true); } catch (e) {}
  Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
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

/** @type {Set<string>} */
const _ELEM_TYPE_SET   = new Set(ELEMENT_TYPES);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    buildSelectionTab, addRelatedBlock, refreshBlockHeader, rawElements,
  };
}
