/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Selection  — current selection info · filter (multi-select lists) · related elements
 *   Layout     — style · algorithm · direction · routing · nesting · sizing
 *   View       — name · folder
 *   Preset     — load · save · manage
 *   Actions    — 4 buttons in button bar (New view, One view each, Expand view, Layout only)
 */
console.log("dialog_main.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Common    = require(REPO_ROOT + "_lib/Common");
const Selection = require(REPO_ROOT + "_lib/selection");
const Defs      = require(REPO_ROOT + "View/lib/defs");
const PresetIO  = require(REPO_ROOT + "View/lib/preset_io");
const GenView   = require(REPO_ROOT + "View/lib/generate_view");

const {
  STYLES, ALGORITHMS, ACTION, ROUTING, DIRECTIONS, RANKING, LABEL_POSITIONS, AR_OPTIONS,
  RELATION_TYPES, ELEMENT_TYPES, DIAGRAM_TYPES,
  DEFAULT_PRESET, validatePreset,
} = Defs;

// ── SWT imports ───────────────────────────────────────────────────────────────

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const GroupWidget       = Java.type("org.eclipse.swt.widgets.Group");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const ListWidget              = Java.type("org.eclipse.swt.widgets.List");
const TextWidget              = Java.type("org.eclipse.swt.widgets.Text");
const TabFolderWidget         = Java.type("org.eclipse.swt.widgets.TabFolder");
const TabItemWidget           = Java.type("org.eclipse.swt.widgets.TabItem");
const ScrolledCompositeWidget = Java.type("org.eclipse.swt.custom.ScrolledComposite");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

// ── Derived lists ─────────────────────────────────────────────────────────────

const DIRECTION_LABELS   = DIRECTIONS.map(d => d.val);
const ROUTING_ALL        = Object.values(ROUTING).map(r => r.label);
const LABEL_POS_ALL      = LABEL_POSITIONS.map(lp => lp.val);
const RANKING_LABELS     = RANKING.map(r => r.val);
const AR_LABELS          = AR_OPTIONS.map(a => a.label);
const REL_TYPE_LABELS    = Object.values(RELATION_TYPES).map(r => r.label);
const REL_TYPE_IDS       = Object.values(RELATION_TYPES).map(r => r.id);
const DIAG_TYPE_LABELS   = ["group", "note", "connection", "image", "reference"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Select items in a ListWidget whose labels appear in `labels`.
// Java.to forces int[] so GraalVM resolves the correct setSelection overload.
// Also updates _selectedSet on searchable lists so the count label stays correct.
function _listSelectLabels(list, labels) {
  // Sync selectedSet on searchable lists
  if (list._selectedSet) {
    list._selectedSet.clear();
    (labels || []).forEach(l => list._selectedSet.add(String(l)));
    if (list._refreshList) { list._refreshList(); return; }
  }

  if (!labels || labels.length === 0) {
    list.setSelection(Java.to([], "int[]"));
    return;
  }
  const items = Array.from({ length: list.getItemCount() }, (_, i) => String(list.getItem(i)));
  const idxs  = [];
  labels.forEach(lbl => { const i = items.indexOf(String(lbl)); if (i >= 0) idxs.push(i); });
  list.setSelection(Java.to(idxs, "int[]"));
  if (list._countLabel) list._countLabel.setText(idxs.length + " selected");
}

// Return selected item labels from a ListWidget as a plain JS array.
// Searchable lists expose _selectedSet which survives filter changes.
function _listGetSelected(list) {
  if (!list) return [];
  if (list._selectedSet) return Array.from(list._selectedSet);
  const sel = list.getSelection();
  return sel ? Array.from(sel).map(s => String(s)) : [];
}

// Map relation type IDs → labels (for multi-select lists).
function _relIdsToLabels(ids) {
  return ids.map(id => {
    const base = id.replace(/:in$|:out$/, "");
    const rt = Object.values(RELATION_TYPES).find(r => r.id === base);
    return rt ? rt.label : base;
  });
}

// Map relation type labels → IDs.
function _relLabelsToIds(labels) {
  return labels.map(lbl => {
    const rt = Object.values(RELATION_TYPES).find(r => r.label === lbl);
    return rt ? rt.id : lbl;
  });
}

// Map diagram type IDs → display labels.
const DIAG_ID_TO_LABEL = {
  "diagram-model-group":      "group",
  "diagram-model-note":       "note",
  "diagram-model-connection": "connection",
  "diagram-model-image":      "image",
  "diagram-model-reference":  "reference",
};
const DIAG_LABEL_TO_ID = Object.fromEntries(Object.entries(DIAG_ID_TO_LABEL).map(([k, v]) => [v, k]));

// Wrap a tab's content composite in a ScrolledComposite so it survives dialog resize.
// Returns the inner content composite to add widgets to.
function _scrolledTab(tabFolder, tabLabel) {
  const tab      = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText(tabLabel);
  const scrolled = new ScrolledCompositeWidget(tabFolder, SWT.H_SCROLL | SWT.V_SCROLL);
  scrolled.setExpandHorizontal(true);
  scrolled.setExpandVertical(true);
  tab.setControl(scrolled);

  const page = new CompositeWidget(scrolled, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);

  // Recompute scroll min-size after layout — called once at end of tab builder.
  return {
    page,
    finish: () => {
      scrolled.setContent(page);
      scrolled.setMinSize(page.computeSize(SWT.DEFAULT, SWT.DEFAULT));
    },
  };
}

// Build a searchable multi-select ListWidget with a count label.
// Returns { list, updateSearch } — call updateSearch() if the available items change.
function _searchableList(parent, allItems, heightHint, key, w) {
  // Search box
  const searchBox = new TextWidget(parent, SWT.BORDER | SWT.SEARCH | SWT.ICON_SEARCH | SWT.ICON_CANCEL);
  searchBox.setMessage("Filter…");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(searchBox);

  // List
  const list = new ListWidget(parent, SWT.BORDER | SWT.MULTI | SWT.V_SCROLL);
  allItems.forEach(i => list.add(i));
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, heightHint || 90).applyTo(list);

  // Count label below list
  const lblCount = new LabelWidget(parent, SWT.NONE);
  lblCount.setText("0 selected");
  GridDataFactory.fillDefaults().applyTo(lblCount);

  if (w && key) w[key] = list;

  // Track selected labels across filter changes
  const selectedSet = new Set();

  const refreshList = () => {
    const query = searchBox.getText().toLowerCase();
    const prev  = list.getSelection();
    // Update selectedSet from current visual selection before rebuilding
    Array.from(prev).forEach(s => selectedSet.add(String(s)));

    list.removeAll();
    allItems.filter(i => !query || i.toLowerCase().includes(query)).forEach(i => list.add(i));

    // Re-select items that are in selectedSet
    const filtered = Array.from({ length: list.getItemCount() }, (_, i) => String(list.getItem(i)));
    const idxs = [];
    filtered.forEach((item, i) => { if (selectedSet.has(item)) idxs.push(i); });
    if (idxs.length) list.setSelection(Java.to(idxs, "int[]"));

    lblCount.setText(selectedSet.size + " selected");
  };

  // Update count when selection changes
  list.addListener(SWT.Selection, () => {
    // Sync selectedSet with current visible selection
    const visible = Array.from({ length: list.getItemCount() }, (_, i) => String(list.getItem(i)));
    const selIdxs = list.getSelectionIndices();
    // Remove items that are visible but deselected
    visible.forEach((item, i) => {
      if (selIdxs.includes ? selIdxs.includes(i) : Array.from(selIdxs).includes(i)) selectedSet.add(item);
      else selectedSet.delete(item);
    });
    lblCount.setText(selectedSet.size + " selected");
  });

  searchBox.addListener(SWT.Modify, refreshList);
  searchBox.addListener(SWT.DefaultSelection, refreshList);  // clear icon pressed

  // Expose a way to set selection from outside (e.g. syncToUI)
  list._selectedSet = selectedSet;
  list._refreshList = refreshList;

  return list;
}

// Multi-select list with a "N selected" count label below it.
function _multiListWithCount(parent, items, heightHint) {
  const list = new ListWidget(parent, SWT.BORDER | SWT.MULTI | SWT.V_SCROLL);
  items.forEach(i => list.add(i));
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, heightHint || 80).applyTo(list);

  const lbl = new LabelWidget(parent, SWT.NONE);
  lbl.setText("0 selected");
  GridDataFactory.fillDefaults().applyTo(lbl);

  list.addListener(SWT.Selection, () => {
    lbl.setText(list.getSelectionCount() + " selected");
  });

  // Expose count label for external updates (e.g. syncToUI)
  list._countLabel = lbl;
  return list;
}

// Build a scrollable multi-select ListWidget (without search or count).
function _multiList(parent, items, heightHint) {
  const list = new ListWidget(parent, SWT.BORDER | SWT.MULTI | SWT.V_SCROLL);
  items.forEach(i => list.add(i));
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, heightHint || 80).applyTo(list);
  return list;
}

// Count elements and relations in a collection.
function _countSelection(coll) {
  let elems = 0, rels = 0, views = 0, diagrams = 0;
  coll.each(o => {
    const t = o.type || "";
    if (t.endsWith("-relationship"))             rels++;
    else if (t === "archimate-diagram-model")    views++;
    else if (t.startsWith("diagram-model-"))     diagrams++;
    else                                          elems++;
  });
  return { elems, rels, views, diagrams };
}

// ── open() ────────────────────────────────────────────────────────────────────

/**
 * Open the GUI dialog.
 * @param {ArchiCollection} uiSelection  $(selection) captured before dialog opens
 */
function open(uiSelection) {
  const config = PresetIO.readSession();
  if (!config.action) config.action = ACTION.NEW_VIEW.id;

  const w = {};       // widget map
  const ctx = { config, widgets: w, uiSelection };

  // Compute selection info once; used to populate the info label.
  let selectionInfo = "Nothing selected";
  try {
    const coll = Selection.getSelection(uiSelection, "*");
    const c    = _countSelection(coll);
    selectionInfo = `Containing: ${c.elems} elements · ${c.rels} relations · ${c.views} views · ${c.diagrams} diagram objects`;
  } catch (e) {}

  // Has visual objects? Controls Expand view / Layout only availability.
  let hasVisual = false;
  try { uiSelection.each(o => { if (o.view) hasVisual = true; }); } catch (e) {}

  // GraalVM two-argument Java.extend: bake methods in at class definition time.
  let dlg;

  const ConfigDialog = Java.extend(TitleAreaDialog, {
    createDialogArea: function(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Generate View");
      dlg.setMessage(selectionInfo);

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).spacing(4, 4).applyTo(area);

      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      _buildSelectionTab(tabFolder, ctx);
      _buildLayoutTab(tabFolder, ctx);
      _buildViewTab(tabFolder, ctx);

      _buildPresetRow(area, ctx, dlg);
      _syncToUI(ctx);

      tabFolder.setSelection(config._lastTabIndex || 0);
      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    createButtonsForButtonBar: function(parent) {
      Java.super(dlg).createButton(parent, IDialogConstants.CANCEL_ID, "Cancel", false);
      // Buttons added right-to-left in JFace button bar.
      // NO addListener — buttonPressed() override handles all clicks.
      const btnLayout = Java.super(dlg).createButton(parent, 101, "Layout only", false);
      btnLayout.setEnabled(hasVisual);
      w.btnLayoutOnly = btnLayout;

      const btnExpand = Java.super(dlg).createButton(parent, 102, "Expand view", false);
      btnExpand.setEnabled(hasVisual);
      w.btnExpandView = btnExpand;

      Java.super(dlg).createButton(parent, 103, "One view each", false);
      Java.super(dlg).createButton(parent, IDialogConstants.OK_ID, "New view", true);
    },

    // JFace routes all button clicks here. Save UI, store action, close dialog.
    // generate_view runs after dlg.open() returns — avoids operating on disposed shell.
    buttonPressed: function(buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) {
        Java.super(dlg).cancelPressed();
        return;
      }
      _saveUI(ctx);
      _persistSession(ctx);
      if      (buttonId === IDialogConstants.OK_ID) config.action = ACTION.NEW_VIEW.id;
      else if (buttonId === 101)                     config.action = ACTION.LAYOUT_ONLY.id;
      else if (buttonId === 102)                     config.action = ACTION.EXPAND_VIEW.id;
      else if (buttonId === 103)                     config.action = ACTION.ONE_EACH.id;
      Java.super(dlg).okPressed();  // sets returnCode = OK and closes dialog
    },
  });

  dlg = new ConfigDialog(shell);
  const result = dlg.open();  // blocks until dialog closes

  // Dialog is fully closed here — safe to run generate_view
  if (result === IDialogConstants.CANCEL_ID || result < 0) return;

  try {
    GenView.generate_view(ctx.config, ctx.uiSelection);
  } catch (e) {
    console.error("generate_view error: " + (e.message || e));
  }
}

function _persistSession(ctx) {
  const session = JSON.parse(JSON.stringify(ctx.config));
  if (ctx.widgets.tabFolder) session._lastTabIndex = ctx.widgets.tabFolder.getSelectionIndex();
  PresetIO.writeSession(session);
}


// ── Selection tab ─────────────────────────────────────────────────────────────

function _buildSelectionTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "Selection");
  const w = ctx.widgets;

  // ── Filter ──────────────────────────────────────────────────────────────────
  const grpFilter = new GroupWidget(page, SWT.NONE);
  grpFilter.setText("Filter  (Ctrl+click = multi-select · empty = all)");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpFilter);
  GridLayoutFactory.fillDefaults().numColumns(3).margins(6, 4).spacing(8, 4).applyTo(grpFilter);

  // Element types — searchable (long list)
  const colEl = new CompositeWidget(grpFilter, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 2).applyTo(colEl);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(colEl);
  new LabelWidget(colEl, SWT.NONE).setText("Element types:");
  w.lstFilterElements = _searchableList(colEl, ELEMENT_TYPES, 100, null, null);

  // Relation types
  const colRel = new CompositeWidget(grpFilter, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 2).applyTo(colRel);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(colRel);
  new LabelWidget(colRel, SWT.NONE).setText("Relation types:");
  w.lstFilterRelations = _multiListWithCount(colRel, REL_TYPE_LABELS, 100);

  // Diagram types
  const colDiag = new CompositeWidget(grpFilter, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 2).applyTo(colDiag);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(colDiag);
  new LabelWidget(colDiag, SWT.NONE).setText("Diagram types:");
  w.lstFilterDiagram = _multiListWithCount(colDiag, DIAG_TYPE_LABELS, 100);

  // ── Related elements ─────────────────────────────────────────────────────────
  const grpRel = new GroupWidget(page, SWT.NONE);
  grpRel.setText("Related elements");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpRel);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(8, 4).applyTo(grpRel);

  new LabelWidget(grpRel, SWT.NONE).setText("Depth (0 = off):");
  new LabelWidget(grpRel, SWT.NONE).setText("Relation types to follow:");

  const spinDepth = new SpinnerWidget(grpRel, SWT.BORDER);
  spinDepth.setValues(0, 0, 5, 0, 1, 1);
  spinDepth.setToolTipText("Number of relation hops to add. 0 = disabled.");
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(spinDepth);
  w.spinRelDepth = spinDepth;

  w.lstRelatedRelations = _multiListWithCount(grpRel, REL_TYPE_LABELS, 80);

  finish();
}

// ── Layout tab ────────────────────────────────────────────────────────────────

function _buildLayoutTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "Layout");
  const w = ctx.widgets;

  // ── Algorithm ────────────────────────────────────────────────────────────────
  const grpAlg = new GroupWidget(page, SWT.NONE);
  grpAlg.setText("Algorithm");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpAlg);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(6, 4).applyTo(grpAlg);

  new LabelWidget(grpAlg, SWT.NONE).setText("Style:");
  const cmbStyle = new ComboWidget(grpAlg, SWT.READ_ONLY | SWT.DROP_DOWN);
  Object.keys(STYLES).forEach(s => cmbStyle.add(s));
  cmbStyle.select(0);
  GridDataFactory.swtDefaults().hint(120, SWT.DEFAULT).applyTo(cmbStyle);
  w.cmbStyle = cmbStyle;

  new LabelWidget(grpAlg, SWT.NONE).setText("Algorithm:");
  const cmbAlg = new ComboWidget(grpAlg, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.swtDefaults().hint(150, SWT.DEFAULT).applyTo(cmbAlg);
  w.cmbAlgorithm = cmbAlg;

  const lblEngine = new LabelWidget(grpAlg, SWT.NONE);
  GridDataFactory.fillDefaults().span(4, 1).applyTo(lblEngine);
  w.lblEngine = lblEngine;

  const lblTip = new LabelWidget(grpAlg, SWT.WRAP);
  GridDataFactory.fillDefaults().span(4, 1).grab(true, false).hint(380, SWT.DEFAULT).applyTo(lblTip);
  w.lblAlgTooltip = lblTip;

  cmbStyle.addListener(SWT.Selection, () => { _fillAlgorithmCombo(ctx); _updateAlgorithmControls(ctx); });
  cmbAlg.addListener(SWT.Selection,   () => _updateAlgorithmControls(ctx));

  // ── Direction / Routing / Label ──────────────────────────────────────────────
  const grpDir = new GroupWidget(page, SWT.NONE);
  grpDir.setText("Direction and routing");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpDir);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(6, 4).spacing(6, 4).applyTo(grpDir);

  new LabelWidget(grpDir, SWT.NONE).setText("Flow direction:");
  const cmbDir = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  DIRECTION_LABELS.forEach(d => cmbDir.add(d));
  cmbDir.select(0);
  GridDataFactory.swtDefaults().hint(120, SWT.DEFAULT).applyTo(cmbDir);
  w.cmbDirection = cmbDir;

  new LabelWidget(grpDir, SWT.NONE).setText("Relation lines:");
  const cmbRouting = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  ROUTING_ALL.forEach(r => cmbRouting.add(r));
  cmbRouting.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbRouting);
  w.cmbRouting = cmbRouting;

  new LabelWidget(grpDir, SWT.NONE).setText("Label:");
  const cmbLabelPos = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  LABEL_POS_ALL.forEach(lp => cmbLabelPos.add(lp));
  cmbLabelPos.select(1);
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(cmbLabelPos);
  w.cmbLabelPosition = cmbLabelPos;

  new LabelWidget(grpDir, SWT.NONE).setText("Layer ranking:");
  const cmbRanking = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  RANKING_LABELS.forEach(r => cmbRanking.add(r));
  cmbRanking.select(0);
  GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(cmbRanking);
  w.cmbRanking = cmbRanking;

  // ── Nesting structure ─────────────────────────────────────────────────────────
  const grpNest = new GroupWidget(page, SWT.NONE);
  grpNest.setText("Nesting structure  (Ctrl+click to multi-select)");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpNest);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(8, 4).applyTo(grpNest);
  w.grpNestingStructure = grpNest;

  new LabelWidget(grpNest, SWT.NONE).setText("Relation types that define containment:");
  new LabelWidget(grpNest, SWT.NONE).setText("Reverse layout direction for:");

  w.lstNestingTypes = _multiListWithCount(grpNest, REL_TYPE_LABELS, 80);
  w.lstReverseTypes = _multiListWithCount(grpNest, REL_TYPE_LABELS, 80);

  // ── Container appearance ───────────────────────────────────────────────────────
  const grpCtr = new GroupWidget(page, SWT.NONE);
  grpCtr.setText("Container appearance");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpCtr);
  GridLayoutFactory.fillDefaults().numColumns(8).margins(6, 4).spacing(4, 4).applyTo(grpCtr);
  w.grpContainer = grpCtr;

  _addSpinnerRow(grpCtr, "Inner spacing:", "spinInnerSpacing",  20, 0, 200, 5, w);
  _addSpinnerRow(grpCtr, "Padding:",        "spinPadding",        20, 0, 200, 5, w);

  const chkSort  = _addCheck(grpCtr, "Sort containers",             "Sort containers alphabetically within each level.", 4, w, "chkSortContainers");
  const chkAlign = _addCheck(grpCtr, "Align same type",             "Resize leaf elements to match the tallest in their row (same-type containers).", 4, w, "chkAlignSameType");
  const chkEvery = _addCheck(grpCtr, "Show in every container",     "An element in multiple containers appears in each of them.", 4, w, "chkShowInEvery");

  // ── Size and spacing ───────────────────────────────────────────────────────────
  const grpSize = new GroupWidget(page, SWT.NONE);
  grpSize.setText("Size and spacing");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpSize);
  GridLayoutFactory.fillDefaults().numColumns(8).margins(6, 4).spacing(4, 4).applyTo(grpSize);

  _addSpinnerRow(grpSize, "Width:",           "spinElementWidth",   140, 10, 1000, 10, w);
  _addSpinnerRow(grpSize, "Height:",          "spinElementHeight",   60, 10,  500, 10, w);
  _addSpinnerRow(grpSize, "Element spacing:", "spinElementSpacing",  40,  0,  500,  5, w);
  _addSpinnerRow(grpSize, "Level spacing:",   "spinLayerSpacing",   180,  0, 2000, 20, w);

  // ── View size ──────────────────────────────────────────────────────────────────
  const grpVS = new GroupWidget(page, SWT.NONE);
  grpVS.setText("View size");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpVS);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(6, 4).spacing(4, 4).applyTo(grpVS);

  _addSpinnerRow(grpVS, "Max width:",  "spinMaxWidth",  0, 0, 99999, 100, w);
  _addSpinnerRow(grpVS, "Max height:", "spinMaxHeight", 0, 0, 99999, 100, w);

  new LabelWidget(grpVS, SWT.NONE).setText("Aspect ratio:");
  const cmbAR = new ComboWidget(grpVS, SWT.READ_ONLY | SWT.DROP_DOWN);
  AR_LABELS.forEach(a => cmbAR.add(a));
  cmbAR.select(0);
  GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(cmbAR);
  w.cmbAspectRatio = cmbAR;

  finish();
}

// ── View tab ──────────────────────────────────────────────────────────────────

function _buildViewTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "View");
  const w = ctx.widgets;

  const grpView = new GroupWidget(page, SWT.NONE);
  grpView.setText("View name and location");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpView);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(4, 4).applyTo(grpView);

  new LabelWidget(grpView, SWT.NONE).setText("Name:");
  const txtName = new TextWidget(grpView, SWT.BORDER);
  txtName.setToolTipText("View name. Pre-filled from the first selected element.");
  GridDataFactory.fillDefaults().grab(true, false).hint(280, SWT.DEFAULT).applyTo(txtName);
  w.txtViewName = txtName;

  new LabelWidget(grpView, SWT.NONE).setText("Suffix:");
  const txtSuffix = new TextWidget(grpView, SWT.BORDER);
  txtSuffix.setToolTipText("Appended to the view name.");
  GridDataFactory.fillDefaults().grab(true, false).hint(120, SWT.DEFAULT).applyTo(txtSuffix);
  w.txtViewSuffix = txtSuffix;

  new LabelWidget(grpView, SWT.NONE).setText("Folder:");
  const txtFolder = new TextWidget(grpView, SWT.BORDER);
  txtFolder.setToolTipText("Archi folder path (e.g. /Application/Generated). Empty = /_Generated.");
  GridDataFactory.fillDefaults().grab(true, false).hint(280, SWT.DEFAULT).applyTo(txtFolder);
  w.txtViewFolder = txtFolder;
  finish();
}

// ── Preset row ────────────────────────────────────────────────────────────────

function _buildPresetRow(parent, ctx, dlg) {
  const w   = ctx.widgets;
  const row = new CompositeWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(4, 2).spacing(4, 0).applyTo(row);

  new LabelWidget(row, SWT.NONE).setText("Preset:");
  const cmbPreset = new ComboWidget(row, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.swtDefaults().hint(200, SWT.DEFAULT).applyTo(cmbPreset);
  _refreshPresetCombo(cmbPreset);
  w.cmbPreset = cmbPreset;

  cmbPreset.addListener(SWT.Selection, () => {
    const idx = cmbPreset.getSelectionIndex();
    if (idx < 0) return;
    try {
      const loaded = PresetIO.readPreset(cmbPreset.getItem(idx));
      Object.assign(ctx.config, loaded);
      _syncToUI(ctx);
    } catch (e) { console.error("Load preset: " + e); }
  });

  const btnLoad = _pushBtn(row, "Load…", "Browse for a preset JSON file", () => {
    const path = window.promptOpenFile({ title: "Load preset", filterExtensions: ["*.json"] });
    if (path) {
      try {
        const raw = PresetIO.readJSON(path);
        if (raw) { Object.assign(ctx.config, validatePreset(raw)); _syncToUI(ctx); }
      } catch (e) { console.error("Load: " + e); }
    }
  });

  const btnSave = _pushBtn(row, "Save", "Save current settings as a preset", () => {
    const name = window.prompt("Preset name:", ctx.config.name || "");
    if (!name) return;
    _saveUI(ctx);
    ctx.config.name = name;
    PresetIO.writePreset(name, ctx.config);
    _refreshPresetCombo(cmbPreset);
  });

  const btnManage = _pushBtn(row, "Manage…", "Rename or delete saved presets", () => {
    const PresetsDialog = require(REPO_ROOT + "View/lib/gui/dialog_presets");
    PresetsDialog.open();
    _refreshPresetCombo(cmbPreset);
  });
}

// ── Sync config ↔ UI ──────────────────────────────────────────────────────────

function _syncToUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;
  const p = c.params || {};

  // Style + algorithm
  const algName   = c.algorithm || "Layered";
  const alg       = ALGORITHMS[algName];
  const styleName = (alg && alg.style) || "Flow";
  const styleIdx  = Object.keys(STYLES).indexOf(styleName);
  if (w.cmbStyle && styleIdx >= 0) w.cmbStyle.select(styleIdx);
  _fillAlgorithmCombo(ctx);
  const algIdx = STYLES[styleName] ? STYLES[styleName].algorithms.indexOf(algName) : 0;
  if (w.cmbAlgorithm && algIdx >= 0) w.cmbAlgorithm.select(algIdx);

  // Direction / routing / label / ranking
  _comboSelect(w.cmbDirection,    DIRECTION_LABELS, p.direction    || "Left → Right");
  _comboSelect(w.cmbRouting,      ROUTING_ALL,      p.routing      || "Orthogonal");
  _comboSelect(w.cmbLabelPosition,LABEL_POS_ALL,    p.labelPosition|| "Middle");
  _comboSelect(w.cmbRanking,      RANKING_LABELS,   p.ranking      || "Balanced");

  // Nesting / reverse multi-select lists
  if (w.lstNestingTypes) _listSelectLabels(w.lstNestingTypes, _relIdsToLabels(p.nestingRelationTypes || []));
  if (w.lstReverseTypes) _listSelectLabels(w.lstReverseTypes, _relIdsToLabels(p.reverseRelationTypes || []));

  // Container appearance
  _spinSet(w.spinInnerSpacing, p.innerSpacing  !== undefined ? p.innerSpacing  : 20);
  _spinSet(w.spinPadding,      p.padding       !== undefined ? p.padding       : 20);
  _chkSet(w.chkSortContainers, !!(p.sortContainers));
  _chkSet(w.chkAlignSameType,  !!(p.alignSameType));
  _chkSet(w.chkShowInEvery,    !!(p.showInEveryContainer));

  // Sizes
  _spinSet(w.spinElementWidth,   p.elementWidth   !== undefined ? p.elementWidth   : 140);
  _spinSet(w.spinElementHeight,  p.elementHeight  !== undefined ? p.elementHeight  : 60);
  _spinSet(w.spinElementSpacing, p.elementSpacing !== undefined ? p.elementSpacing : 40);
  _spinSet(w.spinLayerSpacing,   p.layerSpacing   !== undefined ? p.layerSpacing   : 180);
  _spinSet(w.spinMaxWidth,       p.maxWidth       !== undefined ? p.maxWidth       : 0);
  _spinSet(w.spinMaxHeight,      p.maxHeight      !== undefined ? p.maxHeight      : 0);
  const arIdx = AR_OPTIONS.findIndex(a => a.val === (p.aspectRatio || 0));
  if (w.cmbAspectRatio) w.cmbAspectRatio.select(Math.max(0, arIdx));

  // Filter multi-select lists
  if (w.lstFilterElements)  _listSelectLabels(w.lstFilterElements,  c.filter ? c.filter.elementTypes  : []);
  if (w.lstFilterRelations) _listSelectLabels(w.lstFilterRelations, c.filter ? _relIdsToLabels(c.filter.relationTypes || []) : []);
  if (w.lstFilterDiagram)   _listSelectLabels(w.lstFilterDiagram,   c.filter ? (c.filter.diagramTypes || []).map(id => DIAG_ID_TO_LABEL[id] || id) : []);

  // Related elements
  const layers = (c.relatedElements && c.relatedElements.layers) || [];
  _spinSet(w.spinRelDepth, layers.length > 0 ? (layers[0].depth || 0) : 0);
  if (w.lstRelatedRelations) _listSelectLabels(w.lstRelatedRelations, layers.length > 0 ? _relIdsToLabels(layers[0].relationTypes || []) : []);

  // View
  if (w.txtViewName)   w.txtViewName.setText((c.view && c.view.name)   || "");
  if (w.txtViewSuffix) w.txtViewSuffix.setText((c.view && c.view.suffix)|| "");
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder)|| "");

  _updateAlgorithmControls(ctx);
}

function _saveUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;
  if (!c.params) c.params = {};
  if (!c.view)   c.view   = {};
  if (!c.filter) c.filter = { elementTypes: [], relationTypes: [], diagramTypes: [] };

  // Algorithm
  if (w.cmbAlgorithm && w.cmbStyle) {
    const sty  = Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] || "Flow";
    const algs = STYLES[sty] ? STYLES[sty].algorithms : [];
    c.algorithm = algs[w.cmbAlgorithm.getSelectionIndex()] || "Layered";
  }

  // Direction / routing / label / ranking
  if (w.cmbDirection)     c.params.direction     = DIRECTION_LABELS[w.cmbDirection.getSelectionIndex()]    || "Left → Right";
  if (w.cmbRouting)       c.params.routing       = ROUTING_ALL[w.cmbRouting.getSelectionIndex()]           || "Orthogonal";
  if (w.cmbLabelPosition) c.params.labelPosition = LABEL_POS_ALL[w.cmbLabelPosition.getSelectionIndex()]  || "Middle";
  if (w.cmbRanking)       c.params.ranking       = RANKING_LABELS[w.cmbRanking.getSelectionIndex()]        || "Balanced";

  // Nesting / reverse
  if (w.lstNestingTypes)  c.params.nestingRelationTypes = _relLabelsToIds(_listGetSelected(w.lstNestingTypes));
  if (w.lstReverseTypes)  c.params.reverseRelationTypes = _relLabelsToIds(_listGetSelected(w.lstReverseTypes));

  // Container
  if (w.spinInnerSpacing) c.params.innerSpacing       = w.spinInnerSpacing.getSelection();
  if (w.spinPadding)      c.params.padding            = w.spinPadding.getSelection();
  if (w.chkSortContainers) c.params.sortContainers    = w.chkSortContainers.getSelection();
  if (w.chkAlignSameType)  c.params.alignSameType     = w.chkAlignSameType.getSelection();
  if (w.chkShowInEvery)    c.params.showInEveryContainer = w.chkShowInEvery.getSelection();

  // Sizes
  if (w.spinElementWidth)   c.params.elementWidth   = w.spinElementWidth.getSelection();
  if (w.spinElementHeight)  c.params.elementHeight  = w.spinElementHeight.getSelection();
  if (w.spinElementSpacing) c.params.elementSpacing = w.spinElementSpacing.getSelection();
  if (w.spinLayerSpacing)   c.params.layerSpacing   = w.spinLayerSpacing.getSelection();
  if (w.spinMaxWidth)       c.params.maxWidth       = w.spinMaxWidth.getSelection();
  if (w.spinMaxHeight)      c.params.maxHeight      = w.spinMaxHeight.getSelection();
  const arIdx = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  c.params.aspectRatio = AR_OPTIONS[Math.max(0, arIdx)] ? AR_OPTIONS[Math.max(0, arIdx)].val : 0;

  // Filter
  if (w.lstFilterElements)  c.filter.elementTypes  = _listGetSelected(w.lstFilterElements);
  if (w.lstFilterRelations) c.filter.relationTypes = _relLabelsToIds(_listGetSelected(w.lstFilterRelations));
  if (w.lstFilterDiagram)   c.filter.diagramTypes  = _listGetSelected(w.lstFilterDiagram).map(l => DIAG_LABEL_TO_ID[l] || l);

  // Related elements
  const depth = w.spinRelDepth ? w.spinRelDepth.getSelection() : 0;
  c.relatedElements = depth > 0 ? {
    layers: [{ depth, elementTypes: [], relationTypes: _relLabelsToIds(_listGetSelected(w.lstRelatedRelations || [])), diagramTypes: [] }]
  } : { layers: [] };

  // View
  if (w.txtViewName)   c.view.name   = w.txtViewName.getText().trim();
  if (w.txtViewSuffix) c.view.suffix = w.txtViewSuffix.getText().trim();
  if (w.txtViewFolder) c.view.folder = w.txtViewFolder.getText().trim();
}

// ── Algorithm controls ────────────────────────────────────────────────────────

function _fillAlgorithmCombo(ctx) {
  const w = ctx.widgets;
  if (!w.cmbAlgorithm || !w.cmbStyle) return;
  const sty  = Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] || "Flow";
  const algs = STYLES[sty] ? STYLES[sty].algorithms : [];
  w.cmbAlgorithm.removeAll();
  algs.forEach(a => w.cmbAlgorithm.add(a));
  w.cmbAlgorithm.select(0);
}

function _updateAlgorithmControls(ctx) {
  const w = ctx.widgets;
  if (!w.cmbAlgorithm) return;
  const sty    = w.cmbStyle ? Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] : "Flow";
  const algs   = STYLES[sty] ? STYLES[sty].algorithms : [];
  const algIdx = w.cmbAlgorithm.getSelectionIndex();
  const algName= (algIdx >= 0 && algs[algIdx]) ? algs[algIdx] : "Layered";
  const alg    = ALGORITHMS[algName] || ALGORITHMS.Layered;

  if (w.lblEngine)     w.lblEngine.setText("Engine: " + alg.engine);
  if (w.lblAlgTooltip) w.lblAlgTooltip.setText(alg.tooltip || "");

  const active = new Set(alg.activeParams || []);
  _enable(w.cmbDirection,       active.has("direction"));
  _enable(w.cmbRouting,         active.has("routing"));
  _enable(w.cmbLabelPosition,   active.has("labelPosition"));
  _enable(w.cmbRanking,         active.has("ranking"));
  _enable(w.lstNestingTypes,    active.has("nestingRelationTypes"));
  _enable(w.lstReverseTypes,    active.has("reverseRelationTypes"));
  _enable(w.spinInnerSpacing,   active.has("innerSpacing"));
  _enable(w.spinPadding,        active.has("padding"));
  _enable(w.chkSortContainers,  active.has("sortContainers"));
  _enable(w.chkAlignSameType,   active.has("alignSameType"));
  _enable(w.chkShowInEvery,     active.has("showInEveryContainer"));
  _enable(w.spinLayerSpacing,   active.has("layerSpacing"));
  _enable(w.spinMaxWidth,       active.has("maxWidth"));
  _enable(w.spinMaxHeight,      active.has("maxHeight"));
  _enable(w.cmbAspectRatio,     active.has("aspectRatio"));

  // Filter routing options to what this algorithm supports
  if (w.cmbRouting && alg.supportedOptions && alg.supportedOptions.routing) {
    const supported = alg.supportedOptions.routing;
    const cur       = w.cmbRouting.getSelectionIndex();
    const curLabel  = cur >= 0 ? w.cmbRouting.getItem(cur) : "";
    w.cmbRouting.removeAll();
    supported.forEach(r => w.cmbRouting.add(r));
    const ni = supported.indexOf(curLabel);
    w.cmbRouting.select(ni >= 0 ? ni : 0);
  }

  // Label position: add Natural only for Graphviz
  if (w.cmbLabelPosition && alg.supportedOptions && alg.supportedOptions.labelPosition) {
    const supported = alg.supportedOptions.labelPosition;
    const cur       = w.cmbLabelPosition.getSelectionIndex();
    const curLabel  = cur >= 0 ? w.cmbLabelPosition.getItem(cur) : "Middle";
    w.cmbLabelPosition.removeAll();
    supported.forEach(lp => w.cmbLabelPosition.add(lp));
    const ni = supported.indexOf(curLabel);
    w.cmbLabelPosition.select(ni >= 0 ? ni : 0);
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function _comboSelect(combo, items, value) {
  if (!combo) return;
  const idx = items.indexOf(value);
  combo.select(idx >= 0 ? idx : 0);
}

function _spinSet(spinner, value) {
  if (spinner) spinner.setSelection(value);
}

function _chkSet(btn, value) {
  if (btn) btn.setSelection(value);
}

function _enable(widget, enabled) {
  if (widget) widget.setEnabled(enabled);
}

function _pushBtn(parent, label, tip, handler) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText(label);
  if (tip) btn.setToolTipText(tip);
  btn.addListener(SWT.Selection, handler);
  return btn;
}

function _addCheck(parent, label, tip, span, w, key) {
  const btn = new ButtonWidget(parent, SWT.CHECK);
  btn.setText(label);
  if (tip) btn.setToolTipText(tip);
  GridDataFactory.fillDefaults().span(span, 1).applyTo(btn);
  w[key] = btn;
  return btn;
}

function _addSpinnerRow(parent, label, key, defVal, min, max, step, w) {
  new LabelWidget(parent, SWT.NONE).setText(label);
  const sp = new SpinnerWidget(parent, SWT.BORDER);
  sp.setValues(defVal, min, max, 0, step, step * 5);
  GridDataFactory.swtDefaults().hint(65, SWT.DEFAULT).applyTo(sp);
  w[key] = sp;
}

function _refreshPresetCombo(combo) {
  combo.removeAll();
  PresetIO.listPresets().forEach(n => combo.add(n));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
