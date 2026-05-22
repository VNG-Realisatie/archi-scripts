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
const Pipeline  = require(REPO_ROOT + "View/lib/selection_pipeline");

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
const SashFormWidget          = Java.type("org.eclipse.swt.custom.SashForm");
const RowLayout               = Java.type("org.eclipse.swt.layout.RowLayout");
const RowData                 = Java.type("org.eclipse.swt.layout.RowData");
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
const DIAG_TYPE_LABELS   = ["connection", "group", "image", "legend", "note", "reference"];

// ── Helpers ───────────────────────────────────────────────────────────────────

// Unified get/set for all type-selection controls (checkboxes, type-selector, plain lists).
// Each control exposes getSelected() / setSelected(labels) — duck-typed at call time.
function _ctrlSetSelected(ctrl, labels) {
  if (!ctrl) return;
  if (ctrl.setSelected) { ctrl.setSelected(labels || []); return; }
  // fallback: plain ListWidget
  if (!labels || !labels.length) { ctrl.setSelection(Java.to([], "int[]")); return; }
  const items = Array.from({ length: ctrl.getItemCount() }, (_, i) => String(ctrl.getItem(i)));
  const idxs  = labels.map(l => items.indexOf(String(l))).filter(i => i >= 0);
  ctrl.setSelection(Java.to(idxs, "int[]"));
}
function _ctrlGetSelected(ctrl) {
  if (!ctrl) return [];
  if (ctrl.getSelected) return ctrl.getSelected();
  const sel = ctrl.getSelection();
  return sel ? Array.from(sel).map(s => String(s)) : [];
}

// Keep old names as aliases — used in several places.
const _listSelectLabels = _ctrlSetSelected;
const _listGetSelected  = _ctrlGetSelected;

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
  "diagram-model-legend":     "legend",
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

// ── Type selector: search+list on left, chip panel on right ────────────────────────────────────
// Click an item in the available list to add it as a chip.
// Click a chip (shows "Label ×") to remove it.
// Returns controller with getSelected/setSelected/enable.
function _typeSelector(parent, allItems, availHeight, onChange) {
  const h = availHeight || 180;

  // SashForm maintains a fixed 50/50 split regardless of chip content changes.
  // GridLayout would reallocate width as chips grow; SashForm weights prevent that.
  const ctr = new SashFormWidget(parent, SWT.HORIZONTAL);
  ctr.setSashWidth(6);
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, h + 26).applyTo(ctr);

  // ── Left column: search + available list ──────────────────────────────────────
  const leftCol = new CompositeWidget(ctr, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 3).applyTo(leftCol);

  const srch = new TextWidget(leftCol, SWT.BORDER | SWT.SEARCH | SWT.ICON_CANCEL);
  srch.setMessage("Search…");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(srch);

  const availList = new ListWidget(leftCol, SWT.BORDER | SWT.SINGLE | SWT.V_SCROLL);
  allItems.forEach(i => availList.add(i));
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, h).applyTo(availList);

  // ── Right column: label + chip panel (wrapped RowLayout) ─────────────────────
  const rightCol = new CompositeWidget(ctr, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 3).applyTo(rightCol);

  _lbl(rightCol, "Selected (empty=all):");

  // Chip panel: RowLayout with wrap. No border, fixed height — chips wrap inside the space.
  const chipPanel = new CompositeWidget(rightCol, SWT.NONE);
  const chipRL = new RowLayout(SWT.HORIZONTAL);
  chipRL.wrap         = true;
  chipRL.pack         = true;
  chipRL.spacing      = 3;
  chipRL.marginWidth  = 0;
  chipRL.marginHeight = 2;
  chipPanel.setLayout(chipRL);
  // grab(true, false) + hint height: panel fills horizontally but never grows vertically
  GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, h).applyTo(chipPanel);

  const selectedSet = new Set();
  let currentFilter = "";

  // Re-layout after chip add/remove: reflow the shell so ScrolledComposite updates.
  const reflow = () => {
    try { chipPanel.layout(true, true); } catch (e) {}
    try { ctr.getShell().layout(true, true); } catch (e) {}
  };

  const addChip = (item) => {
    const btn = new ButtonWidget(chipPanel, SWT.PUSH);
    btn.setText(item + "  ×");
    btn.setToolTipText("Click to remove");
    btn.addListener(SWT.Selection, () => {
      selectedSet.delete(item);
      btn.dispose();
      reflow();
      if (onChange) onChange();
    });
  };

  const refreshAvail = () => {
    const q = currentFilter.toLowerCase();
    availList.removeAll();
    allItems.filter(i => !q || i.toLowerCase().includes(q)).forEach(i => availList.add(i));
  };

  // Click available → add chip
  availList.addListener(SWT.Selection, () => {
    const idx = availList.getSelectionIndex();
    if (idx < 0) return;
    const item = String(availList.getItem(idx));
    if (!selectedSet.has(item)) {
      selectedSet.add(item);
      addChip(item);
      reflow();
      if (onChange) onChange();
    }
  });

  srch.addListener(SWT.Modify, () => { currentFilter = srch.getText(); refreshAvail(); });
  srch.addListener(SWT.DefaultSelection, () => { srch.setText(""); currentFilter = ""; refreshAvail(); });

  // 50/50 split — set after both children are created
  ctr.setWeights(Java.to([1, 1], "int[]"));

  return {
    getSelected: () => Array.from(selectedSet),
    setSelected: (items) => {
      // Dispose all existing chips, rebuild from items
      const existing = chipPanel.getChildren();
      for (let i = 0; i < existing.length; i++) existing[i].dispose();
      selectedSet.clear();
      (items || []).forEach(item => {
        const s = String(item);
        selectedSet.add(s);
        addChip(s);
      });
      reflow();
    },
    enable: (en) => {
      srch.setEnabled(en);
      availList.setEnabled(en);
      chipPanel.setEnabled(en);
      const ch = chipPanel.getChildren();
      for (let i = 0; i < ch.length; i++) ch[i].setEnabled(en);
    },
  };
}

// ── Checkbox grid: sorted alpha, column-major distribution across numCols columns ─────────────
// For 11 relation types with numCols=4: distribution is 3,3,3,2 per column.
// Single-click to toggle. Returns controller with getSelected/setSelected/enable.
function _checkboxGrid(parent, labels, numCols, onChange) {
  const sorted = [...labels].sort();
  const ncols  = numCols || 4;
  const nrows  = Math.ceil(sorted.length / ncols);

  // Outer composite: ncols sub-composites side by side
  const outer = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(ncols).margins(0, 0).spacing(6, 0).applyTo(outer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(outer);

  // One vertical sub-composite per column.
  // fillDefaults + grab(true,false) + align BEGINNING: equal share of width, top-aligned.
  const colComps = Array.from({ length: ncols }, () => {
    const c = new CompositeWidget(outer, SWT.NONE);
    GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(0, 1).applyTo(c);
    GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.BEGINNING).applyTo(c);
    return c;
  });

  // Add checkboxes in column-major order: item i → column Math.floor(i / nrows)
  const boxes = sorted.map((lbl, i) => {
    const chk = new ButtonWidget(colComps[Math.floor(i / nrows)], SWT.CHECK);
    chk.setText(lbl);
    GridDataFactory.fillDefaults().applyTo(chk);
    if (onChange) chk.addListener(SWT.Selection, onChange);
    return { lbl, chk };
  });

  return {
    getSelected: () => boxes.filter(b => b.chk.getSelection()).map(b => b.lbl),
    setSelected: (items) => {
      const s = new Set((items || []).map(String));
      boxes.forEach(b => b.chk.setSelection(s.has(b.lbl)));
    },
    enable: (en) => boxes.forEach(b => b.chk.setEnabled(en)),
  };
}

// ── Column wrapper: keeps label + control in one grid cell ──────────────────────────────────
function _col(parent) {
  const c = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(2, 3).applyTo(c);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(c);
  return c;
}

function _lbl(parent, text) {
  const l = new LabelWidget(parent, SWT.NONE);
  l.setText(text || "");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// Count elements and relations in a collection.
// Folders and views are containers — they are not counted, only their contents are.
function _countSelection(coll) {
  let elems = 0, rels = 0, views = 0, diagrams = 0;
  coll.each(o => {
    const t = o.type || "";
    if (t === "folder")                          return;  // folder is a container, not an element
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
  const ctx = { config, widgets: w, uiSelection, firstName: "" };  // firstName set below

  // Compute selection counts before the dialog opens.
  // Raw count: what the user had selected in the UI.
  const selectedCount = { elems: 0, rels: 0, views: 0, folders: 0, diagrams: 0 };
  let firstName = "";
  try {
    uiSelection.each(o => {
      const t = o.type || "";
      if (!firstName && o.name) firstName = o.name;
      if      (t === "archimate-diagram-model")  selectedCount.views++;
      else if (t.endsWith("-relationship"))      selectedCount.rels++;
      else if (t === "folder")                   selectedCount.folders++;
      else if (t.startsWith("diagram-model-"))   selectedCount.diagrams++;
      else                                       selectedCount.elems++;
    });
  } catch (e) {}
  ctx.firstName = firstName;  // propagate for _syncToUI pre-fill

  // Expanded count: what is contained in the selection (folders expand, views expand to their elements).
  // When a view (archimate-diagram-model) is selected, $(view).find() enumerates visual objects.
  // $(view).children() returns nothing useful from the model tree — find() is the correct API.
  const containingCount = { elems: 0, rels: 0, diagrams: 0 };
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
      } else if (t.endsWith("-relationship")) {
        containingCount.rels++;
      } else if (t.startsWith("diagram-model-")) {
        containingCount.diagrams++;
      } else if (t !== "archimate-diagram-model" && t !== "folder") {
        containingCount.elems++;
      } else if (t === "folder") {
        // Recurse: count folder contents via getSelection
        try {
          const coll = Selection.getSelection($(o), "*");
          const c    = _countSelection(coll);
          containingCount.elems    += c.elems;
          containingCount.rels     += c.rels;
          containingCount.diagrams += c.diagrams;
        } catch (e) {}
      }
    });
  } catch (e) {}

  // Collect flat array of model objects for live filter statistics.
  // Used by _updateFilteredCount to recount after filter changes.
  const rawModelObjects = [];
  try {
    const seen = new Set();
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
          if (ve.concept && (ve.concept.type || "") !== "archimate-diagram-model") add(ve.concept);
        }); } catch (e) {}
        try { $(o).find("relation").each(vr => { if (vr.concept) add(vr.concept); }); } catch (e) {}
        Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
          try { $(o).find(dt).each(dvo => { if (dvo && dvo.id) add(dvo); }); } catch (e) {}
        });
      } else if (t.startsWith("diagram-model-")) {
        // Canvas diagram object: add the visual object directly (not .concept).
        add(o);
      } else if (o.view) {
        // Canvas ArchiMate visual object → use model concept
        add(o.concept || o);
      } else if (t === "folder") {
        try { Selection.getSelection($(o), "*").each(add); } catch (e) {}
      } else {
        add(o);
      }
    });
  } catch (e) {}
  ctx.rawModelObjects = rawModelObjects;

  // Log to Archi console BEFORE dialog opens (dialog blocks; console.log inside SWT handlers is unreliable).
  {
    let _lEl = 0, _lRel = 0, _lDiag = 0;
    for (const o of rawModelObjects) {
      const t = o.type || "";
      if (t.endsWith("-relationship"))   _lRel++;
      else if (t in Defs.DIAGRAM_TYPES)  _lDiag++;
      else                               _lEl++;
    }
    console.log(`\nGUI — before dialog:`);
    console.log(`  Selected:  ${selectedCount.elems} elements · ${selectedCount.rels} relations · ${selectedCount.views} views · ${selectedCount.diagrams} diagram objects · ${selectedCount.folders} folders`);
    console.log(`  Containing: ${containingCount.elems} elements · ${containingCount.rels} relations · ${containingCount.diagrams} diagram objects`);
    console.log(`  Raw model objects for Filtered count: ${_lEl} elements · ${_lRel} relations · ${_lDiag} diagram objects`);
  }

  // Has visual context: enables Expand view / Layout only buttons.
  // True when visual objects are on a canvas OR when a view is selected from the model tree.
  let hasVisual = false;
  try {
    uiSelection.each(o => {
      if (o.view)                              hasVisual = true;  // canvas visual object
      if (o.type === "archimate-diagram-model") hasVisual = true;  // view from model tree
    });
  } catch (e) {}

  // GraalVM two-argument Java.extend: bake methods in at class definition time.
  let dlg;

  const ConfigDialog = Java.extend(TitleAreaDialog, {
    createDialogArea: function(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Generate View");
      dlg.setMessage("Select an action to generate or layout a view.");

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).spacing(4, 4).applyTo(area);

      _buildPresetRow(area, ctx, dlg);

      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      _buildSelectionTab(tabFolder, ctx, selectedCount, containingCount, firstName);
      _buildLayoutTab(tabFolder, ctx);

      _buildViewRow(area, ctx);
      _buildActionRow(area, ctx, dlg, hasVisual);
      _syncToUI(ctx);
      _updateFilteredCount(ctx);  // populate Filtered line on dialog open

      tabFolder.setSelection(config._lastTabIndex || 0);
      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    createButtonsForButtonBar: function(parent) {
      // All buttons are in _buildActionRow (custom composite in dialog area).
      // JFace button bar is intentionally left empty.
    },

    // JFace routes all button clicks here. Save UI, store action, close dialog.
    // generate_view runs after dlg.open() returns — avoids operating on disposed shell.
    // action is a runtime parameter, NOT stored in config/preset (validatePreset strips unknown keys).
    buttonPressed: function(buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) {
        Java.super(dlg).cancelPressed();
        return;
      }
      _saveUI(ctx);
      _persistSession(ctx);
      const ACTION_MAP = {};
      ACTION_MAP[IDialogConstants.OK_ID] = ACTION.NEW_VIEW.id;
      ACTION_MAP[101] = ACTION.LAYOUT_ONLY.id;
      ACTION_MAP[102] = ACTION.EXPAND_VIEW.id;
      ACTION_MAP[103] = ACTION.ONE_EACH.id;
      ctx._actionId = ACTION_MAP[buttonId] || ACTION.NEW_VIEW.id;
      Java.super(dlg).okPressed();  // sets returnCode = OK and closes dialog
    },
  });

  dlg = new ConfigDialog(shell);
  const result = dlg.open();  // blocks until dialog closes

  // Dialog is fully closed here — safe to run generate_view
  if (result === IDialogConstants.CANCEL_ID || result < 0) return;

  try {
    GenView.generate_view(ctx.config, ctx.uiSelection, ctx._actionId);
  } catch (e) {
    console.error("generate_view error: " + (e.message || e));
  }
}

function _persistSession(ctx) {
  const session = JSON.parse(JSON.stringify(ctx.config));
  if (ctx.widgets.tabFolder) session._lastTabIndex = ctx.widgets.tabFolder.getSelectionIndex();
  PresetIO.writeSession(session);
}


// ── Live filter count ─────────────────────────────────────────────────────────

/**
 * Recount elements/relations/diagram objects after applying current filter settings.
 * Called whenever a filter or related elements control changes.
 * Updates the Related and Filtered rows in the selection info table.
 */
function _updateFilteredCount(ctx) {
  const w = ctx.widgets;
  if (!w.lblFlt_elems) return;

  const _setRelated  = (e, r, d) => { try { w.lblRel_elems.setText(e); w.lblRel_rels.setText(r); w.lblRel_diags.setText(d); } catch(x) {} };
  const _setFiltered = (e, r, d) => { try { w.lblFlt_elems.setText(e); w.lblFlt_rels.setText(r); w.lblFlt_diags.setText(d); } catch(x) {} };

  const objects = ctx.rawModelObjects;
  if (!objects || !objects.length) {
    _setRelated("—", "—", "—");
    _setFiltered("—", "—", "—");
    return;
  }
  try {
    // Read current filter from widget controllers
    const elemFilter = new Set(_ctrlGetSelected(w.lstFilterElements));
    const relLabels  = new Set(_ctrlGetSelected(w.lstFilterRelations));
    const diagLabels = new Set(_ctrlGetSelected(w.lstFilterDiagram));

    const relIds  = new Set(_relLabelsToIds(Array.from(relLabels)));
    const diagIds = new Set(Array.from(diagLabels).map(l => DIAG_LABEL_TO_ID[l] || l));
    // jArchi still returns .type === "archimate-diagram-model" for view-reference VOs;
    // add the alias so "reference" filter correctly counts them.
    if (diagIds.has("diagram-model-reference")) diagIds.add("archimate-diagram-model");

    // Step 1: count filtered base (current selection only, no related expansion)
    let elems = 0, rels = 0, diagrams = 0;
    const filteredElements = [];  // for expansion base
    for (const o of objects) {
      const t = o.type || "";
      if (t.endsWith("-relationship")) {
        if (!relLabels.size || relIds.has(t)) rels++;
      } else if (t in DIAGRAM_TYPES) {
        if (!diagLabels.size || diagIds.has(t)) diagrams++;
      } else {
        if (!elemFilter.size || elemFilter.has(t)) { elems++; filteredElements.push(o); }
      }
    }

    // Step 2: compute related elements additions for live preview
    const depth     = w.spinRelDepth ? w.spinRelDepth.getSelection() : 0;
    const relRelLabels = new Set(_ctrlGetSelected(w.lstRelatedRelations));
    const relRelIds    = new Set(_relLabelsToIds(Array.from(relRelLabels)));

    let relAddedElems = 0, relAddedRels = 0;
    if (depth > 0 && filteredElements.length > 0) {
      try {
        const layer = {
          depth,
          elementTypes:  [],
          relationTypes: Array.from(relRelIds),
          diagramTypes:  [],
        };
        const added = Pipeline.expandLayer(filteredElements, layer);
        relAddedElems = added.length;
        // Count relations between (filteredElements + added) — lightweight approximation
        const allIds = new Set([...filteredElements.map(e => e.id), ...added.map(e => e.id)]);
        const seenRel = new Set();
        for (const el of [...filteredElements, ...added]) {
          try {
            $(el).rels().each(rel => {
              if (seenRel.has(rel.id)) return;
              const srcId = rel.source && rel.source.id;
              const tgtId = rel.target && rel.target.id;
              if (srcId && tgtId && allIds.has(srcId) && allIds.has(tgtId)) {
                seenRel.add(rel.id);
                relAddedRels++;
              }
            });
          } catch(e) {}
        }
        // Subtract base relations already counted
        let baseRels = 0;
        const baseIds = new Set(filteredElements.map(e => e.id));
        const baseSeen = new Set();
        for (const el of filteredElements) {
          try {
            $(el).rels().each(rel => {
              if (baseSeen.has(rel.id)) return;
              const srcId = rel.source && rel.source.id;
              const tgtId = rel.target && rel.target.id;
              if (srcId && tgtId && baseIds.has(srcId) && baseIds.has(tgtId)) {
                baseSeen.add(rel.id);
                baseRels++;
              }
            });
          } catch(e) {}
        }
        relAddedRels = Math.max(0, relAddedRels - baseRels);
      } catch(e) {}
    }

    // Update Related row
    if (depth === 0) {
      _setRelated("—", "—", "—");
    } else {
      _setRelated(String(relAddedElems), String(relAddedRels), "0");
    }

    // Update Filtered row (base + related additions)
    _setFiltered(String(elems + relAddedElems), String(rels + relAddedRels), String(diagrams));
  } catch (e) {
    _setRelated("—", "—", "—");
    _setFiltered("—", "—", "—");
  }
}

// ── Selection tab ─────────────────────────────────────────────────────────────

function _buildSelectionTab(tabFolder, ctx, selectedCount, containingCount, firstName) {
  const { page, finish } = _scrolledTab(tabFolder, "Selection");
  const w = ctx.widgets;
  const selected   = selectedCount   || { elems: 0, rels: 0, views: 0, folders: 0 };
  const containing = containingCount || { elems: 0, rels: 0, diagrams: 0 };

  // ── Current selection info table ─────────────────────────────────────────────
  // Columns: label | Elements | Relations | Diagrams | (filler)
  // Rows:    header | Selected | Containing | Related | Filtered
  // Count cells are right-aligned.
  // Below table: first selected object name.
  const grpInfo = new GroupWidget(page, SWT.NONE);
  grpInfo.setText("Current selection");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpInfo);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(8, 6).spacing(8, 3).applyTo(grpInfo);

  const _cnt = (parent, txt) => {
    const l = new LabelWidget(parent, SWT.RIGHT);
    l.setText(txt);
    GridDataFactory.swtDefaults().hint(42, SWT.DEFAULT).applyTo(l);
    return l;
  };

  // Header row
  _lbl(grpInfo, "");
  _lbl(grpInfo, "Elements"); _lbl(grpInfo, "Relations"); _lbl(grpInfo, "Diagrams");
  _lbl(grpInfo, "");  // filler

  // Selected row (static, from direct selection)
  const selLabel = (selected.views || selected.folders)
    ? "Selected" + (selected.views   ? ` (${selected.views} view${selected.views   > 1 ? "s" : ""})` : "")
                 + (selected.folders ? ` (${selected.folders} folder${selected.folders > 1 ? "s" : ""})` : "")
    : "Selected";
  _lbl(grpInfo, selLabel);
  _cnt(grpInfo, String(selected.elems)); _cnt(grpInfo, String(selected.rels)); _cnt(grpInfo, String(selected.diagrams));
  _lbl(grpInfo, "");

  // Containing row (static, expanded from folders/views)
  _lbl(grpInfo, "Containing");
  _cnt(grpInfo, String(containing.elems)); _cnt(grpInfo, String(containing.rels)); _cnt(grpInfo, String(containing.diagrams));
  _lbl(grpInfo, "");

  // Related row (live-updated)
  _lbl(grpInfo, "Related");
  w.lblRel_elems = _cnt(grpInfo, "—"); w.lblRel_rels = _cnt(grpInfo, "—"); w.lblRel_diags = _cnt(grpInfo, "—");
  _lbl(grpInfo, "");

  // Filtered row (live-updated)
  _lbl(grpInfo, "Filtered");
  w.lblFlt_elems = _cnt(grpInfo, "—"); w.lblFlt_rels = _cnt(grpInfo, "—"); w.lblFlt_diags = _cnt(grpInfo, "—");
  _lbl(grpInfo, "");

  // Keep legacy refs null (code now uses per-cell widgets)
  w.lblRelated = null; w.lblFiltered = null;

  // ── Filter ──────────────────────────────────────────────────────────────────
  const grpFilter = new GroupWidget(page, SWT.NONE);
  grpFilter.setText("Filter  (empty = all included)");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpFilter);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 6).applyTo(grpFilter);

  // onChange fires whenever a filter control changes → recount
  const onFilterChange = () => _updateFilteredCount(ctx);

  // Element types: search+available (left) | selected (right, bottom-aligned)
  _lbl(grpFilter, "Element types:");
  w.lstFilterElements = _typeSelector(grpFilter, ELEMENT_TYPES, 180, onFilterChange);

  // Relation types: 4-column checkbox grid
  _lbl(grpFilter, "Relation types:");
  w.lstFilterRelations = _checkboxGrid(grpFilter, REL_TYPE_LABELS, 4, onFilterChange);

  // Diagram types: 4 columns to align with relation types above.
  _lbl(grpFilter, "Diagram types:");
  w.lstFilterDiagram = _checkboxGrid(grpFilter, DIAG_TYPE_LABELS, 4, onFilterChange);

  // ── Related elements ─────────────────────────────────────────────────────────
  const grpRel = new GroupWidget(page, SWT.NONE);
  grpRel.setText("Related elements");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpRel);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 4).applyTo(grpRel);

  // Relation types to follow — first, full width; changes trigger live Related count update
  _lbl(grpRel, "Relation types to follow:");
  w.lstRelatedRelations = _checkboxGrid(grpRel, REL_TYPE_LABELS, 4, onFilterChange);

  // Depth — label and spinner on same row, left-aligned (label uses swtDefaults = minimum width)
  const rowDepth = new CompositeWidget(grpRel, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 2).spacing(4, 0).applyTo(rowDepth);
  GridDataFactory.fillDefaults().applyTo(rowDepth);
  const lblDepth = new LabelWidget(rowDepth, SWT.NONE);
  lblDepth.setText("Depth (0 = off):");
  GridDataFactory.swtDefaults().applyTo(lblDepth);  // minimum width — spinner appears next to it
  const spinDepth = new SpinnerWidget(rowDepth, SWT.BORDER);
  spinDepth.setValues(0, 0, 5, 0, 1, 1);
  spinDepth.setToolTipText("Number of relation hops to add beyond the current selection. 0 = disabled.");
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(spinDepth);
  spinDepth.addListener(SWT.Selection, () => _updateFilteredCount(ctx));
  w.spinRelDepth = spinDepth;

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

  cmbStyle.addListener(SWT.Selection, () => {
    _fillAlgorithmCombo(ctx);
    _updateAlgorithmControls(ctx);
    _updateViewNameAlgorithm(ctx);
  });
  cmbAlg.addListener(SWT.Selection, () => {
    _updateAlgorithmControls(ctx);
    _updateViewNameAlgorithm(ctx);
  });

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
  grpNest.setText("Nesting structure  —  relations drawn as containment boxes, not lines");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpNest);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 4).applyTo(grpNest);
  w.grpNestingStructure = grpNest;
  w.lstNestingTypes = _checkboxGrid(grpNest, REL_TYPE_LABELS, 4);

  // ── Reverse layout direction ──────────────────────────────────────────────────
  const grpRev = new GroupWidget(page, SWT.NONE);
  grpRev.setText("Reverse layout direction for relation types");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpRev);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 4).applyTo(grpRev);
  w.lstReverseTypes = _checkboxGrid(grpRev, REL_TYPE_LABELS, 4);

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

// ── Action row (below preset) ─────────────────────────────────────────────────

function _updateActionPreview(ctx) {
  const w = ctx.widgets;
  if (!w.lblActionPreview) return;
  const name   = w.txtViewName   ? w.txtViewName.getText().trim()   : "";
  const suffix = w.txtViewSuffix ? w.txtViewSuffix.getText().trim() : "";
  const sep    = Defs.VIEW_NAME_SEPARATOR || " — ";
  const preview = name ? name + (suffix ? sep + suffix : "") : "—";
  try { w.lblActionPreview.setText("New view name:   " + preview); } catch(e) {}
}

function _runAction(buttonId, dlg, ctx) {
  const ACTION_MAP = {};
  ACTION_MAP[IDialogConstants.OK_ID] = ACTION.NEW_VIEW.id;
  ACTION_MAP[101] = ACTION.LAYOUT_ONLY.id;
  ACTION_MAP[102] = ACTION.EXPAND_VIEW.id;
  ACTION_MAP[103] = ACTION.ONE_EACH.id;
  _saveUI(ctx);
  _persistSession(ctx);
  ctx._actionId = ACTION_MAP[buttonId] || ACTION.NEW_VIEW.id;
  Java.super(dlg).okPressed();
}

function _actionBtn(parent, label, buttonId, dlg, ctx) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText(label);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(btn);  // fill group width
  btn.addListener(SWT.Selection, () => _runAction(buttonId, dlg, ctx));
  return btn;
}

function _buildActionRow(area, ctx, dlg, hasVisual) {
  const w = ctx.widgets;

  // One row: [Cancel] [Create new view group (equal share)] [Modify selected view group (equal share)]
  const btnRow = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(btnRow);
  GridLayoutFactory.fillDefaults().numColumns(3).margins(0, 2).spacing(8, 0).applyTo(btnRow);

  // Left: Cancel
  const btnCancel = new ButtonWidget(btnRow, SWT.PUSH);
  btnCancel.setText("Cancel");
  GridDataFactory.swtDefaults().hint(80, SWT.DEFAULT).align(SWT.BEGINNING, SWT.CENTER).applyTo(btnCancel);
  btnCancel.addListener(SWT.Selection, () => Java.super(dlg).cancelPressed());

  // Middle group: Create new view — grabs equal share of available width
  const grpCreate = new GroupWidget(btnRow, SWT.NONE);
  grpCreate.setText("Create new view");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpCreate);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(4, 0).applyTo(grpCreate);
  w.btnNewView = _actionBtn(grpCreate, "New view",      IDialogConstants.OK_ID, dlg, ctx);
  w.btnOneEach = _actionBtn(grpCreate, "One view each", 103,                    dlg, ctx);

  // Right group: Modify selected view — grabs equal share of available width
  const grpModify = new GroupWidget(btnRow, SWT.NONE);
  grpModify.setText("Modify selected view");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpModify);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(4, 0).applyTo(grpModify);
  w.btnExpandView = _actionBtn(grpModify, "Expand view", 102, dlg, ctx);
  w.btnLayoutOnly = _actionBtn(grpModify, "Layout only", 101, dlg, ctx);
  w.btnExpandView.setEnabled(hasVisual);
  w.btnLayoutOnly.setEnabled(hasVisual);
}

// ── View name and location ────────────────────────────────────────────────────

function _buildViewRow(area, ctx) {
  const w = ctx.widgets;

  const grpView = new GroupWidget(area, SWT.NONE);
  grpView.setText("View name and location");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpView);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(4, 4).applyTo(grpView);

  // Row 1: Name | name field | Suffix | suffix field
  new LabelWidget(grpView, SWT.NONE).setText("Name:");
  const txtName = new TextWidget(grpView, SWT.BORDER);
  txtName.setToolTipText("View name. Pre-filled from the first selected object.");
  GridDataFactory.fillDefaults().grab(true, false).hint(200, SWT.DEFAULT).applyTo(txtName);
  
  w.txtViewName = txtName;

  new LabelWidget(grpView, SWT.NONE).setText("Suffix:");
  const txtSuffix = new TextWidget(grpView, SWT.BORDER);
  txtSuffix.setToolTipText("Appended to view name. Auto-updated when algorithm changes.");
  GridDataFactory.fillDefaults().grab(false, false).hint(120, SWT.DEFAULT).applyTo(txtSuffix);
  
  w.txtViewSuffix = txtSuffix;

  // Row 2: Folder | folder field (span 3)
  new LabelWidget(grpView, SWT.NONE).setText("Folder:");
  const txtFolder = new TextWidget(grpView, SWT.BORDER);
  txtFolder.setToolTipText("Archi folder path (e.g. /Application/Generated). Empty = /_Generated.");
  GridDataFactory.fillDefaults().grab(true, false).span(3, 1).hint(280, SWT.DEFAULT).applyTo(txtFolder);
  w.txtViewFolder = txtFolder;
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
      _updateFilteredCount(ctx);
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

  // View name: always pre-fill from the first selected object (captured in open()).
  // Suffix: algorithm display name only (separator VIEW_NAME_SEPARATOR is added when building the view name).
  const viewName  = (ctx && ctx.firstName) || (c.view && c.view.name) || "";
  const viewSuffix = (c.view && c.view.suffix) || c.algorithm || "Layered";
  if (w.txtViewName)   w.txtViewName.setText(viewName);
  if (w.txtViewSuffix) w.txtViewSuffix.setText(viewSuffix);
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder) || Defs.GENERATED_VIEW_FOLDER);

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

// When algorithm changes, always update the suffix field with the new algorithm name.
// The suffix field shows only the algorithm name (no separator — separator is in VIEW_NAME_SEPARATOR).
function _updateViewNameAlgorithm(ctx) {
  const w = ctx.widgets;
  if (!w.txtViewSuffix || !w.cmbAlgorithm) return;

  const sty     = w.cmbStyle ? Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] : "Flow";
  const algs    = STYLES[sty] ? STYLES[sty].algorithms : [];
  const algName = algs[w.cmbAlgorithm.getSelectionIndex()] || "Layered";
  w.txtViewSuffix.setText(algName);
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
  if (!widget) return;
  if (widget.enable) { widget.enable(enabled); return; }  // controller (checkboxGrid, typeSelector)
  try { widget.setEnabled(enabled); } catch (e) {}
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
