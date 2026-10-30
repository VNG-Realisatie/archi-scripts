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
const MenuWidget        = Java.type("org.eclipse.swt.widgets.Menu");
const MenuItemWidget    = Java.type("org.eclipse.swt.widgets.MenuItem");
const TextWidget        = Java.type("org.eclipse.swt.widgets.Text");
const Listener          = Java.type("org.eclipse.swt.widgets.Listener");
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
// stepData (optional): { name, repeat, conditions } from a preset to restore.
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

  // Header row: [▾] [repeat] name or Step N (double-click: rename in place) · summary (grabs) [↑] [↓]   [✕]
  const header = new CompositeWidget(block, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(7).margins(0, 0).spacing(4, 0).applyTo(header);
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

  // Repeat belongs to the whole step, so it sits in the header, visible when collapsed;
  // before the title, so it keeps one place whatever the name's length.
  const repeatPicker = _repeatPicker(header, onChange);

  const lblTitle = new LabelWidget(header, SWT.NONE);
  const f = Widgets.getBoldFont(); if (f) try { lblTitle.setFont(f); } catch (e) {}
  lblTitle.setToolTipText("Click: collapse / expand this step.\nDouble-click: rename it.");
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

  // Cast: table is set right below.
  const blockObj = /** @type {StepBlock} */ ({
    container: block, header, body, blkSep, lblTitle, lblBlockCounts,
    btnUp, btnDown, btnCollapse, btnRemove,
    collapsed: false, addsText: "nothing", candidates: /** @type {StepCandidate[]} */ ([]), countCache: new Map(),
    name: stepData ? stepData.name : "",
    getRepeat: () => repeatPicker.get(),
  });

  blockObj.table = conditionTable(body, {
    kind: "step", columns: STEP_CONDITION_COLUMNS, filterList: true, propCondition: true,
    onChange: () => { refreshBlockHeader(blockObj); onChange(); }, onLayout,
    propItems:  r => Counts.propNames(_stepPropObjects(blockObj, r)),
    valueItems: r => Counts.propValues(_stepPropObjects(blockObj, r), r.property),
  });
  blockObj.table.setConditions(stepData ? stepData.conditions : []);
  if (stepData) {
    repeatPicker.set(Defs.normalizeRepeat(stepData.repeat));
  }
  ctx.relBlocks.push(blockObj);

  btnUp.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, -1));
  btnDown.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, +1));
  btnCollapse.addListener(SWT.Selection, () => _toggleCollapseBlock(ctx, blockObj));
  _addNameEditor(ctx, blockObj);
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
  // A named step says what it is; without a name, a collapsed step names its number of conditions.
  const conditionsPart = b.collapsed && !b.name ? `${n} condition${n === 1 ? "" : "s"} · ` : "";
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

// Repeat picker: a push button with the chosen repeat and a pop-up menu, the current one ticked.
// A button, not a combo: a GTK combo is taller than the header buttons.
/**
 * @param {Swt.Composite} parent
 * @param {() => void} onChange
 * @returns {{ get: () => StepRepeat, set: (v: StepRepeat) => void }}
 */
function _repeatPicker(parent, onChange) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setToolTipText(
    "How many times this step runs; each run starts from the previous run's additions.\n" +
    `∞: until a run adds nothing (at most ${Defs.REPEAT_MAX}×).`);
  GridDataFactory.swtDefaults().hint(44, 22).align(SWT.BEGINNING, SWT.CENTER).applyTo(btn);
  let value = Defs.REPEAT_OPTIONS[0].value;
  /** @type {Swt.Menu | null} */
  let menu = null;
  const show = () => {
    const opt = Defs.REPEAT_OPTIONS.find(o => o.value === value) || Defs.REPEAT_OPTIONS[0];
    btn.setText(opt.label + " ▾");
  };

  btn.addListener(SWT.Selection, () => {
    if (menu) menu.dispose();
    const m = menu = new MenuWidget(btn);
    for (const o of Defs.REPEAT_OPTIONS) {
      const mi = new MenuItemWidget(m, SWT.PUSH);
      mi.setText(o.value === value ? o.label + "   ✓" : o.label);
      mi.addListener(SWT.Selection, () => { value = o.value; show(); onChange(); });
    }
    const b = btn.getBounds();
    m.setLocation(btn.getParent().toDisplay(b.x, b.y + b.height));
    m.setVisible(true);
  });
  btn.addListener(SWT.Dispose, () => { if (menu) menu.dispose(); });
  show();
  return { get: () => value, set: v => { value = v; show(); } };
}

// In-place rename: double-click on the title puts a text field in its place; Enter, a click
// outside the field or leaving it keeps the name, Esc cancels. A single click still collapses,
// after the double-click time, so a double-click does not collapse and expand the step first.
/**
 * @param {DialogContext} ctx
 * @param {StepBlock} b
 */
function _addNameEditor(ctx, b) {
  const display = b.lblTitle.getDisplay();
  const txtName = new TextWidget(b.header, SWT.BORDER | SWT.SINGLE);
  txtName.moveBelow(b.lblTitle);
  txtName.setToolTipText("Enter: keep · Esc: cancel.\nEmpty = Step N.");
  GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).hint(200, SWT.DEFAULT).exclude(true).applyTo(txtName);
  txtName.setVisible(false);
  // The field is taller than the header row: pad the row to the field's height, so the
  // header keeps one height while editing.
  const pad = Math.max(0, Math.ceil(
    (txtName.computeSize(SWT.DEFAULT, SWT.DEFAULT).y - b.header.computeSize(SWT.DEFAULT, SWT.DEFAULT).y) / 2));
  b.header.getLayout().marginHeight = pad;
  let editing = false;
  // A click elsewhere takes no focus from the field on a label or the background, so a display
  // filter ends the edit. One Java object, so removeFilter finds the listener that was added.
  const clickOutside = new (Java.extend(Listener))({
    handleEvent: (/** @type {Swt.Event} */ e) => { if (e.widget !== txtName) finish(true); },
  });

  /** @param {boolean} on */
  const show = on => {
    editing = on;
    txtName.getLayoutData().exclude = !on;
    b.lblTitle.getLayoutData().exclude = on;
    txtName.setVisible(on);
    b.lblTitle.setVisible(!on);
    b.header.getLayout().marginHeight = on ? 0 : pad;
    if (on) display.addFilter(SWT.MouseDown, clickOutside);
    else display.removeFilter(SWT.MouseDown, clickOutside);
    try { b.header.layout(true, true); } catch (e) {}
  };
  /** @param {boolean} keep */
  const finish = keep => {
    if (!editing) return;
    show(false);
    const name = txtName.getText().trim();
    if (!keep || name === b.name) return;
    b.name = name;
    _setBlockTitle(b, ctx.relBlocks.indexOf(b));
    refreshBlockHeader(b);
    ctx.markModified();
  };

  b.lblTitle.addListener(SWT.MouseUp, () => {
    display.timerExec(display.getDoubleClickTime(), () => {
      if (!editing && !b.container.isDisposed()) _toggleCollapseBlock(ctx, b);
    });
  });
  b.lblTitle.addListener(SWT.MouseDoubleClick, () => {
    txtName.setText(b.name);
    txtName.setMessage("Step " + (ctx.relBlocks.indexOf(b) + 1));
    show(true);
    txtName.setFocus();
    txtName.selectAll();
  });
  // doit = false: Enter and Esc must not reach the dialog (default button, close).
  txtName.addListener(SWT.Traverse, e => {
    if (e.detail === SWT.TRAVERSE_RETURN) { e.doit = false; finish(true); }
    else if (e.detail === SWT.TRAVERSE_ESCAPE) { e.doit = false; finish(false); }
  });
  txtName.addListener(SWT.FocusOut, () => finish(true));
  txtName.addListener(SWT.Dispose, () => display.removeFilter(SWT.MouseDown, clickOutside));
}

// Header title: the step's name, or "Step N" without one.
/**
 * @param {StepBlock} b
 * @param {number} i  index in ctx.relBlocks
 */
function _setBlockTitle(b, i) {
  try { b.lblTitle.setText(b.name || "Step " + (i + 1)); } catch (e) {}
}

// Reorder block widgets to match ctx.relBlocks order, then update the title and
// the enabled state of the move buttons.
/** @param {DialogContext} ctx */
function _renumberAndReorderRelBlocks(ctx) {
  ctx.relBlocks.forEach((b, i) => {
    _setBlockTitle(b, i);
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
