/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Selection  — current selection info · filter (multi-select lists) · related elements
 *   Layout     — style · algorithm · direction · routing · nesting · sizing
 *   Appearance — style by property · by related property · by connected element · nesting level · highlight repeated
 *   View       — name · folder
 *   Preset     — combo (auto-apply) · ⚙ gear menu · Save · Save As…
 *   Actions    — 4 buttons in button bar (New view, One view each, Expand view, Layout only)
 */
console.log("Loading dialog_main.js");

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
const Chroma    = require("chroma-js");

const {
  STYLES, ALGORITHMS, ACTION, ROUTING, DIRECTIONS, RANKING, ACYCLICER, LABEL_POSITIONS, AR_OPTIONS,
  RELATION_TYPES, RELATION_TYPE_IDS, RELATION_TYPE_LABELS,
  ELEMENT_TYPES, ELEMENT_TYPE_LABELS,
  DIAGRAM_TYPES, DIAGRAM_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, DIAGRAM_TYPE_LABEL_TO_ID,
  COLOR_RANGES,
  DEFAULT_PRESET, validatePreset,
  encodeRelType, decodeRelType,
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
const CanvasWidget            = Java.type("org.eclipse.swt.widgets.Canvas");
const SWTColor                = Java.type("org.eclipse.swt.graphics.Color");
const RowLayout               = Java.type("org.eclipse.swt.layout.RowLayout");
const RowData                 = Java.type("org.eclipse.swt.layout.RowData");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

// ── Derived lists ─────────────────────────────────────────────────────────────
// RELATION_TYPE_IDS, RELATION_TYPE_LABELS, ELEMENT_TYPE_LABELS, DIAGRAM_TYPE_LABELS,
// COLOR_RANGES are imported from Defs above.

const DIRECTION_LABELS        = DIRECTIONS.map(d => d.val);
const ROUTING_ALL             = Object.values(ROUTING).map(r => r.label);
const ROUTING_TOOLTIPS        = Object.fromEntries(Object.values(ROUTING).map(r => [r.label, r.tooltip]));
const LABEL_POS_ALL           = LABEL_POSITIONS.map(lp => lp.val);
const LABEL_POS_TOOLTIPS      = Object.fromEntries(LABEL_POSITIONS.map(lp => [lp.val, lp.tooltip]));
const RANKING_LABELS          = RANKING.map(r => r.val);
const ACYCLICER_LABELS        = ACYCLICER.map(a => a.val);
const AR_LABELS               = AR_OPTIONS.map(a => a.label);
const CONTAINER_ALGO_LABELS   = Defs.ALGORITHMS.Layered.supportedOptions.containerAlgorithm;
const CONNECTIONS_MODE_LABELS = Defs.ALGORITHMS.Layered.supportedOptions.connectionsMode;

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
    const idx  = RELATION_TYPE_IDS.indexOf(base);
    return idx >= 0 ? RELATION_TYPE_LABELS[idx] : base;
  });
}

function _relLabelsToIds(labels) {
  return labels.map(lbl => {
    const idx = RELATION_TYPE_LABELS.indexOf(lbl);
    return idx >= 0 ? RELATION_TYPE_IDS[idx] : lbl;
  });
}

// Wrap a tab's content composite in a ScrolledComposite so it survives dialog resize.
// Returns the inner content composite to add widgets to.
function _scrolledTab(tabFolder, tabLabel) {
  const tab      = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText(tabLabel);
  const scrolled = new ScrolledCompositeWidget(tabFolder, SWT.V_SCROLL);
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

  _lbl(rightCol, "Selected (none = keep all):");

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

  // Outer composite: ncols sub-composites side by side.
  // equalWidth(true) forces all ncols to the same pixel width so corresponding
  // columns align visually between the relation-type and diagram-type filter grids.
  const outer = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(ncols).equalWidth(true).margins(0, 0).spacing(6, 0).applyTo(outer);
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

// Single-line wide label, used for the Selected/Containing/Filtered/Related-N count lines.
function _selLine(parent) {
  const l = new LabelWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// Count selection by type. Returns { elems, rels, views, diagrams, folders }.
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

// Ordered (key, singular, plural) tuples driving _formatCountsLine output order.
const _COUNT_LABELS = [
  ["elems",    "element",  "elements"],
  ["rels",     "relation", "relations"],
  ["diagrams", "diagram",  "diagrams"],
  ["views",    "view",     "views"],
  ["folders",  "folder",   "folders"],
];

// Render a count line: "Prefix: 3 elements, 2 relations; First object: …".
// Types with count 0 are omitted entirely. Empty selection → "Prefix: nothing".
function _formatCountsLine(prefix, counts, firstObject) {
  return `${prefix}: ${_formatCountsBody(counts, firstObject)}`;
}

// The body part only — used for the right column of 2-col counter rows.
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
function _typeToDisplay(t) {
  if (!t) return "";
  return t.split("-").map(s => s ? s[0].toUpperCase() + s.slice(1) : s).join(" ");
}

// Recompute ScrolledComposite min-size after page content changes.
// Width fixed to viewport so only vertical scrolling triggers.
function _resizeScrolled(scrolled, page) {
  if (!scrolled || !page) return;
  try {
    const w = scrolled.getClientArea().width;
    const useW = w > 0 ? w : SWT.DEFAULT;
    scrolled.setMinSize(page.computeSize(useW, SWT.DEFAULT));
  } catch (e) {}
}


// Module-level bold font, lazy-created once per script load. Never disposed (jArchi rule).
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

// Default dialog dimensions. Width set explicitly to avoid SWT computing a wide size from
// content hints; height sized so one Related block fits without scroll.
const DEFAULT_DIALOG_WIDTH  = 925;
const DEFAULT_DIALOG_HEIGHT = 1470;  // height is set to max, then constrained by screen size in open()

// ── open() ────────────────────────────────────────────────────────────────────

/**
 * Open the GUI dialog.
 * @param {ArchiCollection} uiSelection  $(selection) captured before dialog opens
 */
function open(uiSelection) {
  PresetIO.ensureDefault();
  const config = PresetIO.readSession();
  if (!config.action) config.action = ACTION.NEW_VIEW.id;

  const w = {};       // widget map
  const ctx = { config, widgets: w, uiSelection, firstName: "", relBlocks: [] };  // firstName set below

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
      } else if (o.view || t === "folder") {
        // Canvas VO (may be a container) or model-tree folder.
        // Selection.getSelection recurses via $(obj).children() and extracts
        // concepts from canvas VOs and diagram objects in one pass.
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

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 0).spacing(4, 4).applyTo(area);

      _buildPresetRow(area, ctx, dlg);

      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      _buildSelectionTab(tabFolder, ctx, selectedCount, containingCount);
      _buildLayoutTab(tabFolder, ctx);
      _buildAppearanceTab(tabFolder, ctx);

      _buildViewRow(area, ctx);
      _buildActionRow(area, ctx, dlg, hasVisual);
      _syncToUI(ctx);
      _updateFilteredCount(ctx);  // populate Filtered line on dialog open
      ctx._ready = true;          // enable modified indicator from here on

      tabFolder.setSelection(config._lastTabIndex || 0);
      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    getInitialSize: function() {
      const sz = Java.super(dlg).getInitialSize();
      const Point = Java.type("org.eclipse.swt.graphics.Point");
      return new Point(DEFAULT_DIALOG_WIDTH, DEFAULT_DIALOG_HEIGHT);
    },

    createButtonBar: function(parent) {
      // All buttons are in _buildActionRow (custom composite in the dialog area).
      // Return an empty zero-height composite so the JFace button bar adds no space.
      const bar = new CompositeWidget(parent, SWT.NONE);
      GridDataFactory.swtDefaults().hint(0, 0).applyTo(bar);
      return bar;
    },

    createButtonsForButtonBar: function(parent) {
      // Intentionally empty — buttons are in _buildActionRow.
    },

    // JFace routes all button clicks here. Save UI, store action, close dialog.
    // generate_view runs after dlg.open() returns — avoids operating on disposed shell.
    // action is a runtime parameter, NOT stored in config/preset (validatePreset strips unknown keys).
    buttonPressed: function(buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) {
        _persistSession(ctx);  // remember _lastTabIndex even on cancel
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
 * Recount elements/relations/diagram objects after applying current filter settings,
 * then walk the dynamic Related-elements blocks updating each one's counter line.
 *
 * Filtered line meaning: counts AFTER the global Filter group, BEFORE any blocks.
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
 */
function _formatOutputLine(view) {
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

function _updateFilteredCount(ctx) {
  _markModified(ctx);
  const w = ctx.widgets;
  if (!w.lblFilteredCount) return;

  const _setFiltered = (counts) => {
    try { w.lblFilteredCount.setText(_formatCountsBody(counts)); } catch (x) {}
  };
  const _setFilteredError = () => {
    try { w.lblFilteredCount.setText("—"); } catch (x) {}
  };
  const _setRel = (b, eCount, rCount) => {
    if (!b || !b.lblBlockCounts) return;
    const cnt = { elems: eCount, rels: rCount, diagrams: 0, views: 0, folders: 0 };
    try { b.lblBlockCounts.setText(_formatCountsBody(cnt)); } catch (x) {}
  };

  const objects = ctx.rawModelObjects;
  if (!objects || !objects.length) {
    _setFilteredError();
    (ctx.relBlocks || []).forEach(b => _setRel(b, 0, 0));
    return;
  }

  try {
    // Read current global filter from widget controllers
    const elemFilter = new Set(_ctrlGetSelected(w.lstFilterElements));
    const relLabels  = new Set(_ctrlGetSelected(w.lstFilterRelations));
    const diagLabels = new Set(_ctrlGetSelected(w.lstFilterDiagram));

    const relIds  = new Set(_relLabelsToIds(Array.from(relLabels)));
    const diagIds = new Set(Array.from(diagLabels).map(l => DIAGRAM_TYPE_LABEL_TO_ID[l] || l));
    // jArchi still returns .type === "archimate-diagram-model" for view-reference VOs;
    // add the alias so "reference" filter correctly counts them.
    if (diagIds.has("diagram-model-reference")) diagIds.add("archimate-diagram-model");

    // Filtered base — only the elements survive the element-type filter and feed step 3.
    // Per-type relations/diagrams in the raw selection are counted but reported separately
    // (they are NOT what determines the "Filtered base: N relations" row — that's
    // rels-between-filtered-elements, computed below).
    let elems = 0, diagrams = 0;
    const filteredElements = [];
    for (const o of objects) {
      const t = o.type || "";
      if (t.endsWith("-relationship")) {
        // explicit relations in the selection are not propagated to the view as bare
        // edges — step 5 derives all view relations from the elements. So we don't
        // include them in the filtered counter row anymore.
      } else if (t in DIAGRAM_TYPES) {
        if (!diagLabels.size || diagIds.has(t)) diagrams++;
      } else {
        if (!elemFilter.size || elemFilter.has(t)) { elems++; filteredElements.push(o); }
      }
    }

    const globalRelIds = _relLabelsToIds(Array.from(relLabels));
    const steps = (ctx.relBlocks || []).map(b => ({
      depth:         b.depthSpinner.getSelection(),
      elementTypes:  b.typeSelector.getSelected(),
      relationTypes: b.relCheckGrid.getEncoded(),
      diagramTypes:  [],
      propFilter: {
        key:   b.propFilterKey   && b.propFilterKey.getSelectionIndex()   > 0 ? b.propFilterKey.getItem(b.propFilterKey.getSelectionIndex())     : "",
        value: b.propFilterValue && b.propFilterValue.getSelectionIndex() > 0 ? b.propFilterValue.getItem(b.propFilterValue.getSelectionIndex()) : "",
      },
    }));

    // Collect relations incrementally: base uses global filter; each step uses its own
    // relation-type filter — mirrors the pipeline exactly so Adds: counters match the view.
    // seenRelIds is threaded across calls to _findRelationsBetween to prevent double-counting.
    const seenRelIds = new Set();
    const finalRels  = Pipeline.findRelationsBetween(filteredElements, globalRelIds, seenRelIds);
    // Rels-between filtered elements under the global filter (NOT a raw-selection
    // relation count). Honours the user's rule: "you can't have a relation without
    // the elements" — only rels with both endpoints in the surviving element set count.
    const filteredBaseRels = finalRels.length;
    _setFiltered({ elems, rels: filteredBaseRels, diagrams, views: 0, folders: 0 });

    // Walk steps under chain semantics: step 1's input is the filtered base; step N
    // (N≥2)'s input is step N-1's added elements only. An empty step terminates the chain.
    let cumulative = filteredElements.slice();
    let stepInput  = filteredElements.slice();
    const stepCounts = [];
    let stepIdx = 0;
    for (let i = 0; i < (ctx.relBlocks || []).length; i++) {
      stepIdx++;
      const b    = ctx.relBlocks[i];
      const step = steps[i];

      // Dry-run without propFilter: compute reachable candidates for combo population.
      // Snapshot seenRelIds so this pass doesn't affect relation deduplication.
      const stepForCandidates = { ...step, propFilter: { key: "", value: "" } };
      const { added: candidates } = Pipeline.expandStepWithRelations(
        stepInput, stepForCandidates, cumulative, new Set(seenRelIds)
      );
      if (b.refreshPropCombo) b.refreshPropCombo(candidates);

      const { added, rels: stepRels, cumulative: newCumul } =
        Pipeline.expandStepWithRelations(stepInput, step, cumulative, seenRelIds);
      cumulative = newCumul;
      stepRels.forEach(r => finalRels.push(r));
      _setRel(b, added.length, stepRels.length);
      stepCounts.push({ idx: stepIdx, elems: added.length, rels: stepRels.length });
      stepInput = added;                                                       // chain advance
    }

    // Predict view-level counts (duplicates, containers) using the current params.
    // The on-screen Output row + console block must reflect what the writer will produce.
    const livePresetParams = {
      nestingRelationTypes: w.lstNestingTypes ? _relLabelsToIds(_listGetSelected(w.lstNestingTypes)) : [],
      reverseRelationTypes: w.lstReverseTypes ? _relLabelsToIds(_listGetSelected(w.lstReverseTypes)) : [],
      showInEveryContainer:           !!(w.chkShowInEvery     && w.chkShowInEvery.getSelection()),
    };
    const view = Pipeline.predictViewCounts(cumulative, finalRels, diagrams, livePresetParams);

    // Update the on-screen Output line in the "Generated view" group (always visible,
    // multi-line, hide-zero per the canonical-vocabulary plan).
    if (w.lblViewTotals) {
      try {
        w.lblViewTotals.setText(_formatOutputLine(view));
        const parent = w.lblViewTotals.getParent && w.lblViewTotals.getParent();
        if (parent && parent.layout) parent.layout();
      } catch (e) {}
    }

    // Console grouped block — same grouped Total to view shape as the pipeline so
    // dialog prediction and pipeline result can be compared row-by-row.
    const rows = [{
      label: "Filtered base:",
      elements: elems, relations: filteredBaseRels, diagramObjects: diagrams,
    }];
    for (const lc of stepCounts) {
      rows.push({ label: `Step ${lc.idx} adds: `, elements: lc.elems, relations: lc.rels });
    }
    if (stepCounts.length > 0) rows.push({ rule: true });
    rows.push({
      label: "Total to view:",
      group: [
        { sublabel: "elements:  ", fields: [
            ["containers",       view.containers],
            ["nestedElements",   view.nestedElements],
            ["standalones",      view.standalones],
            ["extraOccurrences", view.extraOccurrences],
          ] },
        { sublabel: "relations: ", fields: [
            ["nestings",         view.nestings],
            ["connections",      view.connections],
          ] },
        { sublabel: "diagram:   ", fields: [
            ["diagramObjects",   view.diagramObjects],
          ] },
      ],
    });
  } catch (e) {
    _setFilteredError();
    (ctx.relBlocks || []).forEach(b => _setRel(b, 0, 0));
  }
}

// ── Selection tab ─────────────────────────────────────────────────────────────

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

  new LabelWidget(ctrComp, SWT.NONE).setText("Filtered:");
  w.lblFilteredCount = _selLine(ctrComp);
  w.lblFilteredCount.setText("—");
  w.lblFilteredCount.setToolTipText(
    "After the global filter (element / relation / diagram types) is applied. " +
    "This is the base for any related-elements steps below.");

  // Horizontal rule separating count lines from the filter sub-section.
  const filterSep = new LabelWidget(grpInfo, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(filterSep);

  const onFilterChange = () => _updateFilteredCount(ctx);

  _lbl(grpInfo, "Filter selection by element type:");
  w.lstFilterElements = _typeSelector(grpInfo, ELEMENT_TYPES, 120, onFilterChange);

  _lbl(grpInfo, "Filter selection by relation types (none = keep all):");
  w.lstFilterRelations = _checkboxGrid(grpInfo, RELATION_TYPE_LABELS, 4, onFilterChange);

  _lbl(grpInfo, "Filter selection by diagram types (none = keep all):");
  w.lstFilterDiagram = _checkboxGrid(grpInfo, DIAGRAM_TYPE_LABELS, 4, onFilterChange);

  // ── Related elements ─────────────────────────────────────────────────────────
  // Dynamic multi-block UI. Each block is an independent expansion step with its
  // own relation types (each with two direction checkboxes), element filter, and
  // relation-levels (depth) control.
  const grpRel = _group(page, "Expand selection", 1);

  // Header row: explanation text (grabs width) | [+ Add related…] button on the right.
  const hdrRow = new CompositeWidget(grpRel, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 0).applyTo(hdrRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(hdrRow);

  const lblExplain = new LabelWidget(hdrRow, SWT.WRAP);
  // lblExplain.setText("Expand the selection by following relations to neighbouring elements. Each block below adds a step.");
  // lblExplain.setText("Add related elements to the selection by following relations. Each block below adds a step.");
  lblExplain.setText("Expand the selection with connected elements. Each step defines which relation to follow.");  
  GridDataFactory.fillDefaults().grab(true, false).hint(420, SWT.DEFAULT).applyTo(lblExplain);

  const btnAddBlock = new ButtonWidget(hdrRow, SWT.PUSH);
  btnAddBlock.setText("+ Add step");
  btnAddBlock.setToolTipText("Each step builds on the previous selection.");
  GridDataFactory.swtDefaults().align(SWT.END, SWT.CENTER).applyTo(btnAddBlock);
  btnAddBlock.addListener(SWT.Selection, () => _addRelatedBlock(ctx));

  const blocksContainer = new CompositeWidget(grpRel, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 8).applyTo(blocksContainer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(blocksContainer);
  w.blocksContainer = blocksContainer;

  finish();
}

// ── Related elements: block lifecycle ─────────────────────────────────────────

// Build the relation-type grid. Each cell shows a name checkbox plus two direction
// checkboxes (☐ ← incoming, ☐ → outgoing). At least one direction must be ticked
// while the relation itself is on.
// Returns controller with getEncoded(), setEncoded(arr), enable(bool).
// _relCheckGrid: direction-only checkboxes per relation type.
// Each row: [label] [← in] [→ out]. No per-type selection checkbox.
// Empty selection (no box ticked anywhere) = follow all relation types in all directions.
function _relCheckGrid(parent, numCols, onChange) {
  const rows = Object.values(RELATION_TYPES)
    .map(r => ({ id: r.id, label: r.label }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const ncols = numCols || 4;
  const nrows = Math.ceil(rows.length / ncols);

  const outer = new CompositeWidget(parent, SWT.NONE);
  // spacing(10, 0): at least 10px between columns, as required by UX spec.
  GridLayoutFactory.fillDefaults().numColumns(ncols).margins(0, 0).spacing(10, 0).applyTo(outer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(outer);

  const colComps = Array.from({ length: ncols }, () => {
    const c = new CompositeWidget(outer, SWT.NONE);
    GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(0, 1).applyTo(c);
    GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.BEGINNING).applyTo(c);
    return c;
  });


  
  const relRows = rows.map((r, i) => {
    const cell = new CompositeWidget(colComps[Math.floor(i / nrows)], SWT.NONE);
    GridLayoutFactory.fillDefaults().numColumns(4)
      .margins(0, 0).spacing(0, 0).applyTo(cell);
    GridDataFactory.fillDefaults().grab(true, false).applyTo(cell);

    const lbl = new LabelWidget(cell, SWT.NONE);
    lbl.setText(r.label);
    // Fixed-width column so ← aligns vertically across all rows (longest name ≈ "Specialization").
    GridDataFactory.swtDefaults().hint(105, SWT.DEFAULT).applyTo(lbl);

    // Left checkbox (with text "←")
    const chkIn = new ButtonWidget(cell, SWT.CHECK);
    chkIn.setText("←");
    chkIn.setToolTipText("Follow incoming relations (other → this element)");
    GridDataFactory.swtDefaults()
        .align(SWT.BEGINNING, SWT.CENTER)   // explicit vertical center
        .hint(40, SWT.DEFAULT)              // let height be natural
        .applyTo(chkIn);

    // Arrow label (→)
    const lblOut = new LabelWidget(cell, SWT.NONE);
    lblOut.setText("→");
    GridDataFactory.swtDefaults()
        .align(SWT.BEGINNING, SWT.CENTER)
        .hint(20, SWT.DEFAULT)
        .applyTo(lblOut);

    // Right checkbox – use a non‑breaking space as text to fix baseline alignment
    const chkOut = new ButtonWidget(cell, SWT.CHECK);
    chkOut.setText("\u00A0");   // invisible but reserves text vertical space
    chkOut.setToolTipText("Follow outgoing relations (this element → other)");
    GridDataFactory.swtDefaults()
        .align(SWT.BEGINNING, SWT.CENTER)
        .hint(40, SWT.DEFAULT)   // same width as left checkbox for symmetry
        .applyTo(chkOut);

    // Direction checkboxes are always enabled; no parent relation-type checkbox.
    // Unchecking both is allowed — empty selection across all rows means "follow all".
    chkIn.addListener(SWT.Selection, () => { if (onChange) onChange(); });
    chkOut.addListener(SWT.Selection, () => { if (onChange) onChange(); });

    return { id: r.id, label: r.label, chkIn, chkOut };
  });

  return {
    // Returns encoded array. Empty = all relation types/directions followed.
    getEncoded: () => relRows
      .filter(r => r.chkIn.getSelection() || r.chkOut.getSelection())
      .map(r => encodeRelType(r.id, r.chkIn.getSelection(), r.chkOut.getSelection())),
    setEncoded: (encoded) => {
      const byId = new Map();
      (encoded || []).forEach(e => {
        const dec = decodeRelType(e);
        byId.set(dec.type, dec);
      });
      relRows.forEach(r => {
        const dec = byId.get(r.id);
        if (dec) {
          r.chkIn.setSelection(dec.inSel);
          r.chkOut.setSelection(dec.outSel);
        } else {
          r.chkIn.setSelection(false);
          r.chkOut.setSelection(false);
        }
      });
    },
    enable: (en) => {
      relRows.forEach(r => {
        r.chkIn.setEnabled(en);
        r.chkOut.setEnabled(en);
      });
    },
  };
}

// Append a new block to the Related elements group.
// stepData (optional): { depth, elementTypes, relationTypes } from a preset to restore.
// opts.startCollapsed (optional boolean): if true, build the block in collapsed state.
function _addRelatedBlock(ctx, stepData, opts) {
  const w = ctx.widgets;
  const blocksContainer = w.blocksContainer;
  const idx = ctx.relBlocks.length;
  const onChange = () => _updateFilteredCount(ctx);

  // Outer block: GroupWidget with native title bar ("Step N").
  const block = new GroupWidget(blocksContainer, SWT.NONE);
  block.setText("Step " + (idx + 1));
  const f = _getBoldFont(); if (f) try { block.setFont(f); } catch (e) {}
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).spacing(4, 4).applyTo(block);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(block);

  // Header row: [Added: (static)] [count (grabs)] [▲] [▼] [▾] [✕]
  const header = new CompositeWidget(block, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0, 0).spacing(4, 0).applyTo(header);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(header);

  // "Added:" static prefix label.
  const lblAddedPfx = new LabelWidget(header, SWT.NONE);
  lblAddedPfx.setText("Adds:");
  GridDataFactory.swtDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(lblAddedPfx);

  // Count label grabs the remaining width.
  const lblBlockCounts = new LabelWidget(header, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.CENTER).applyTo(lblBlockCounts);
  lblBlockCounts.setText("nothing");
  lblBlockCounts.setToolTipText(
    "What THIS step adds on top of the base (delta, not cumulative). " +
    "Filtered + every step's added = total on the view.");
  lblAddedPfx.setToolTipText(lblBlockCounts.getToolTipText());

  const _hdrBtn = (txt, tip) => {
    const b = new ButtonWidget(header, SWT.PUSH);
    b.setText(txt);
    b.setToolTipText(tip);
    GridDataFactory.swtDefaults().hint(28, 22).applyTo(b);
    return b;
  };
  const btnUp       = _hdrBtn("▲", "Move this step up");
  const btnDown     = _hdrBtn("▼", "Move this step down");
  const btnCollapse = _hdrBtn("▾", "Collapse / expand this step");
  const btnRemove   = _hdrBtn("✕",  "Remove this step");

  // Horizontal rule separating header from body.
  const blkSep = new LabelWidget(block, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(blkSep);

  // Body (collapsible). Use GridData.exclude on collapse so layout reclaims the space.
  const body = new CompositeWidget(block, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 4).applyTo(body);
  const bodyGd = GridDataFactory.fillDefaults().grab(true, false).create();
  body.setLayoutData(bodyGd);

  _lbl(body, "Follow these relation types and add elements (none = follow all):");
  const relCheckGrid = _relCheckGrid(body, 4, onChange);
  // 5px spacer below the relation check grid before the next section.
  const relSpacer = new LabelWidget(body, SWT.NONE);
  GridDataFactory.fillDefaults().hint(SWT.DEFAULT, 5).applyTo(relSpacer);

  _lbl(body, "Filter added element types:");
  const typeSelector = _typeSelector(body, ELEMENT_TYPES, 90, onChange);

  const depthRow = new CompositeWidget(body, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0, 2).spacing(4, 0).applyTo(depthRow);
  const lblDepth = new LabelWidget(depthRow, SWT.NONE);
  lblDepth.setText("Depth:");
  lblDepth.setToolTipText("The depth controls how many times the expansion is repeated.");
  GridDataFactory.swtDefaults().applyTo(lblDepth);
  const depthSpinner = new SpinnerWidget(depthRow, SWT.BORDER);
  depthSpinner.setValues(1, 1, 5, 0, 1, 1);
  depthSpinner.setToolTipText("The depth controls how many times the expansion is repeated.");
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(depthSpinner);
  // Recompute on arrow click (Selection) and on focus-out (after keyboard edit) —
  // not on Modify, which fires per keystroke.
  depthSpinner.addListener(SWT.Selection, onChange);
  depthSpinner.addListener(SWT.FocusOut, onChange);

  const lblProp = new LabelWidget(depthRow, SWT.NONE);
  lblProp.setText("Property:");
  lblProp.setToolTipText("Only add elements that have this property set to the chosen value.");
  GridDataFactory.swtDefaults().applyTo(lblProp);
  const cmbProp = new ComboWidget(depthRow, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbProp.setToolTipText("Choose a property to filter on. Leave blank to add all elements regardless of properties.");
  GridDataFactory.swtDefaults().hint(130, SWT.DEFAULT).applyTo(cmbProp);

  const lblVal = new LabelWidget(depthRow, SWT.NONE);
  lblVal.setText("Value:");
  lblVal.setToolTipText("Only add elements whose selected property have this value.");
  GridDataFactory.swtDefaults().applyTo(lblVal);
  const cmbVal = new ComboWidget(depthRow, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbVal.setToolTipText("Choose the required property value. Only active when a property is also selected.");
  GridDataFactory.swtDefaults().hint(130, SWT.DEFAULT).applyTo(cmbVal);

  // _candidates: elements reachable by this step (set by _updateFilteredCount dry-run).
  let _candidates = [];

  function refreshPropCombo(candidates) {
    _candidates = candidates || [];
    const prev = cmbProp.getSelectionIndex() > 0 ? cmbProp.getItem(cmbProp.getSelectionIndex()) : "";
    cmbProp.removeAll();
    cmbProp.add("");
    const props = new Set();
    _candidates.forEach(obj => {
      try { const ks = obj.prop(); if (Array.isArray(ks)) ks.forEach(k => { if (k) props.add(String(k)); }); } catch (e) {}
    });
    Array.from(props).sort().forEach(p => cmbProp.add(p));
    const items = Array.from({ length: cmbProp.getItemCount() }, (_, i) => cmbProp.getItem(i));
    cmbProp.select(Math.max(0, items.indexOf(prev)));
    refreshValCombo();
  }

  function refreshValCombo() {
    const propIdx = cmbProp.getSelectionIndex();
    const propKey = propIdx > 0 ? cmbProp.getItem(propIdx) : "";
    const prev = cmbVal.getSelectionIndex() > 0 ? cmbVal.getItem(cmbVal.getSelectionIndex()) : "";
    cmbVal.removeAll();
    cmbVal.add("");
    if (propKey) {
      const vals = new Set();
      _candidates.forEach(obj => {
        try { const v = obj.prop(propKey); if (v !== null && v !== undefined && v !== "") vals.add(String(v)); } catch (e) {}
      });
      Array.from(vals).sort().forEach(v => cmbVal.add(v));
    }
    const items = Array.from({ length: cmbVal.getItemCount() }, (_, i) => cmbVal.getItem(i));
    cmbVal.select(Math.max(0, items.indexOf(prev)));
  }

  cmbProp.addListener(SWT.Selection, () => { refreshValCombo(); onChange(); });
  cmbVal.addListener(SWT.Selection, onChange);

  const blockObj = {
    container: block, body, lblBlockCounts,
    btnUp, btnDown, btnCollapse, btnRemove,
    collapsed: false,
    relCheckGrid, typeSelector, depthSpinner,
    propFilterKey: cmbProp, propFilterValue: cmbVal,
    refreshPropCombo,
  };
  ctx.relBlocks.push(blockObj);

  // Button handlers (capture blockObj after creation)
  btnUp.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, -1));
  btnDown.addListener(SWT.Selection, () => _moveRelatedBlock(ctx, blockObj, +1));
  btnCollapse.addListener(SWT.Selection, () => _toggleCollapseBlock(ctx, blockObj));
  btnRemove.addListener(SWT.Selection, () => _removeRelatedBlock(ctx, blockObj));

  // Restore from preset if provided
  if (stepData) {
    relCheckGrid.setEncoded(stepData.relationTypes || []);
    typeSelector.setSelected(stepData.elementTypes || []);
    depthSpinner.setSelection(Number(stepData.depth) || 1);
    if (stepData.propFilter && stepData.propFilter.key) {
      const pf = stepData.propFilter;
      const pitems = Array.from({ length: cmbProp.getItemCount() }, (_, i) => cmbProp.getItem(i));
      const ki = pitems.indexOf(pf.key);
      if (ki >= 0) { cmbProp.select(ki); } else { cmbProp.add(pf.key); cmbProp.select(cmbProp.getItemCount() - 1); }
      refreshValCombo();
      if (pf.value) {
        const vitems = Array.from({ length: cmbVal.getItemCount() }, (_, i) => cmbVal.getItem(i));
        const vi = vitems.indexOf(pf.value);
        if (vi >= 0) { cmbVal.select(vi); } else { cmbVal.add(pf.value); cmbVal.select(cmbVal.getItemCount() - 1); }
      }
    }
  }

  // Apply initial collapsed state (used when loading presets: step 1 expanded, rest collapsed).
  if (opts && opts.startCollapsed) {
    blockObj.collapsed = true;
    try { body.setVisible(false); } catch (e) {}
    const gd = body.getLayoutData();
    if (gd) gd.exclude = true;
    try { btnCollapse.setText("▸"); } catch (e) {}
  }

  _renumberAndReorderRelBlocks(ctx);
  _updateFilteredCount(ctx);
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

function _removeRelatedBlock(ctx, blockObj) {
  const i = ctx.relBlocks.indexOf(blockObj);
  if (i < 0) return;
  try { blockObj.container.dispose(); } catch (e) {}
  ctx.relBlocks.splice(i, 1);
  _renumberAndReorderRelBlocks(ctx);
  _updateFilteredCount(ctx);
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

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

function _toggleCollapseBlock(ctx, blockObj) {
  blockObj.collapsed = !blockObj.collapsed;
  blockObj.body.setVisible(!blockObj.collapsed);
  const gd = blockObj.body.getLayoutData();
  if (gd) gd.exclude = blockObj.collapsed;
  blockObj.btnCollapse.setText(blockObj.collapsed ? "▸" : "▾");
  try { ctx.selectionPage.layout(true, true); } catch (e) {}
  _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
}

// Reorder block widgets to match ctx.relBlocks order, then update the native Group
// title bar ("Step N") and enabled state of move buttons. The counter line uses the
// invariant "Added:" prefix so reordering doesn't touch it.
function _renumberAndReorderRelBlocks(ctx) {
  ctx.relBlocks.forEach((b, i) => {
    try { b.container.setText("Step " + (i + 1)); } catch (e) {}
    b.btnUp.setEnabled(i > 0);
    b.btnDown.setEnabled(i < ctx.relBlocks.length - 1);
  });

  // Reorder block widgets so display order matches the array.
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

function _buildLayoutTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "Layout");
  const w = ctx.widgets;

  // ── Algorithm ─────────────────────────────────────────────────────────────────
  // Algorithm selection uses a 5-row × 6-col table: [Style label:] [○ Algo] [○ Algo] …
  // All radio buttons are in the same composite so SWT auto-groups them (mutually exclusive).
  const grpAlg = _group(page, "Algorithm", 4, { spaceH: 6 });

  // Algorithm radio table spans all 4 columns of grpAlg.
  const algTableComp = new CompositeWidget(grpAlg, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0, 0).spacing(8, 3).applyTo(algTableComp);
  GridDataFactory.fillDefaults().span(4, 1).grab(true, false).applyTo(algTableComp);

  const algRadios = new Map();
  const maxAlgCols = Math.max(...Object.values(STYLES).map(s => s.algorithms.length));

  Object.entries(STYLES).forEach(([styleName, style]) => {
    // Style label — natural width, tooltip from STYLES.
    const styleLbl = new LabelWidget(algTableComp, SWT.NONE);
    styleLbl.setText(styleName + ":");
    if (style.tooltip) styleLbl.setToolTipText(style.tooltip);
    GridDataFactory.swtDefaults().align(SWT.END, SWT.CENTER).applyTo(styleLbl);

    // Radio buttons for this style's algorithms, then empty labels for vacant slots.
    // Both radio buttons AND empty placeholders grab(true) so all 5 algorithm columns
    // flex equally with the dialog width (same behaviour as the relation checkbox columns).
    for (let i = 0; i < maxAlgCols; i++) {
      const algName = style.algorithms[i];
      if (algName) {
        const alg = ALGORITHMS[algName] || {};
        const radio = new ButtonWidget(algTableComp, SWT.RADIO);
        radio.setText(algName);
        if (alg.tooltip) radio.setToolTipText(alg.tooltip);
        GridDataFactory.fillDefaults().grab(true, false).applyTo(radio);
        algRadios.set(algName, radio);
        radio.addListener(SWT.Selection, () => { if (radio.getSelection()) { _updateAlgorithmControls(ctx); } });
      } else {
        // Empty placeholder: grab so the column still flexes even with no radio button.
        const ph = new LabelWidget(algTableComp, SWT.NONE);
        GridDataFactory.fillDefaults().grab(true, false).applyTo(ph);
      }
    }
  });

  w.algRadios = algRadios;

  // ── Element size and spacing ───────────────────────────────────────────────────
  const grpSize = _group(page, "Element size and spacing", 6);

  _addSpinnerRow(grpSize, "Width:",           "spinElementWidth",   140, 10, 1000, 10, w, "Width of all elements (px).");
  _addSpinnerRow(grpSize, "Height:",          "spinElementHeight",   60, 10,  500, 10, w, "Height of all elements (px).");
  _addSpinnerRow(grpSize, "Element spacing:", "spinElementSpacing",  40,  0,  500,  5, w, "Minimum distance between elements (px).");
  _addSpinnerRow(grpSize, "Layer spacing:",   "spinLayerSpacing",   180,  0, 2000, 20, w, "Distance between hierarchy levels (px). Active in layered, tree, and flow layouts.");
  _addSpinnerRow(grpSize, "Port spacing:",    "spinNodeSizeByEdgeCount", 25, 0, 200, 5, w, "Adds extra element size based on the number of connections on the busiest side.\n" +
    "Use this to prevent ports from overlapping on highly connected elements.\n" +
    "0 = disabled.");

  // Changes to nesting-type / reverse-type / showInEveryContainer alter the on-view
  // role split (nestings vs connections, containers vs nested elements, occurrence
  // duplication) — refresh the live Output counters so the dialog reflects the change.
  const onParamsChange = () => {
    _updateFilteredCount(ctx);
    _updateNestingLevelState(ctx);  // keep nesting level group enabled/disabled in sync
  };

  // ── Direction ─────────────────────────────────────────────────────────────────
  const grpDir = _group(page, "Direction", 1);

  const dirComp = new CompositeWidget(grpDir, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(0, 0).spacing(8, 3).applyTo(dirComp);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(dirComp);
  _addCombo(dirComp, "Flow direction:", DIRECTION_LABELS, 0, 120, "cmbDirection", w, "Direction of the main flow. Active in layered, tree, and directed-flow algorithms.");
  new LabelWidget(dirComp, SWT.NONE); new LabelWidget(dirComp, SWT.NONE);

  _groupSep(grpDir, 1, "Reversed - draw these relation types in other direction");
  w.lstReverseTypes = _checkboxGrid(grpDir, RELATION_TYPE_LABELS, 4, onParamsChange);

  // ── Connections ───────────────────────────────────────────────────────────────
  const grpRout = _group(page, "Connections", 1);

  const routComp = new CompositeWidget(grpRout, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(0, 0).spacing(8, 3).applyTo(routComp);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(routComp);

  _addCombo(routComp, "Routing:",        ROUTING_ALL,      0, 160, "cmbRouting",       w);
  w.cmbRouting.addListener(SWT.Selection, () => _comboTooltipSync(w.cmbRouting, ROUTING_TOOLTIPS));
  _comboTooltipSync(w.cmbRouting, ROUTING_TOOLTIPS);
  _addCombo(routComp, "Label:",          LABEL_POS_ALL,    1,  90, "cmbLabelPosition", w);
  w.cmbLabelPosition.addListener(SWT.Selection, () => _comboTooltipSync(w.cmbLabelPosition, LABEL_POS_TOOLTIPS));
  _comboTooltipSync(w.cmbLabelPosition, LABEL_POS_TOOLTIPS);
  _addCombo(routComp, "Cycle breaking:", ACYCLICER_LABELS, 0,  90, "cmbAcyclicer",     w, "How relation cycles are broken before layout. Greedy reverses the fewest edges; Default uses DFS-based removal. Has no effect when the diagram contains no cycles.");

  _addCombo(routComp, "Layer ranking:",  RANKING_LABELS,   0, 110, "cmbRanking",       w, "How nodes are assigned to rank layers. Balanced minimises edge lengths; Uniform places nodes at the shallowest possible rank; Top-aligned pulls nodes to the deepest rank.");
  new LabelWidget(routComp, SWT.NONE); new LabelWidget(routComp, SWT.NONE);
  new LabelWidget(routComp, SWT.NONE); new LabelWidget(routComp, SWT.NONE);
  // Sub-composite keeps the long "Connection-element spacing:" label out of
  // routComp's shared column pool, preventing it from widening the whole block.
  const spacingComp = new CompositeWidget(routComp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(0, 0).spacing(8, 3).applyTo(spacingComp);
  GridDataFactory.fillDefaults().span(6, 1).grab(true, false).applyTo(spacingComp);
  _addSpinnerRow(spacingComp, "Connection spacing:",         "spinConnectionSpacing",        20, 0, 200, 5, w, "Minimum distance between parallel connections (px). Increase to spread connections apart for better label readability.");
  _addSpinnerRow(spacingComp, "Connection-element spacing:", "spinConnectionElementSpacing", 40, 0, 200, 5, w, "Minimum distance between a connection and elements it passes near (px). Increase to visually separate connections from unrelated elements.");

  // ── Nesting structure ─────────────────────────────────────────────────────────
  const grpNest = _group(page, "Nesting", 1);

  const _nestLbl = new LabelWidget(grpNest, SWT.NONE);
  _nestLbl.setText("Draw these relation types as containers");
  GridDataFactory.fillDefaults().applyTo(_nestLbl);

  w.lstNestingTypes = _checkboxGrid(grpNest, RELATION_TYPE_LABELS, 4, onParamsChange);

  const ctrComp = new CompositeWidget(grpNest, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(0, 0).spacing(6, 4).applyTo(ctrComp);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(ctrComp);

  const _ctrSep = new LabelWidget(ctrComp, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).span(4, 1).hint(SWT.DEFAULT, 6).applyTo(_ctrSep);
  const _ctrLbl = new LabelWidget(ctrComp, SWT.NONE);
  _ctrLbl.setText("Inside container");
  GridDataFactory.fillDefaults().span(4, 1).applyTo(_ctrLbl);

  // Row: Container layout | Connections mode (fills all 4 cols exactly)
  _addCombo(ctrComp, "Container layout:", CONTAINER_ALGO_LABELS,   0, 120, "cmbContainerAlgorithm", w,
    "ELK algorithm used to arrange children inside each container.");
  _addCombo(ctrComp, "Connections:",      CONNECTIONS_MODE_LABELS, 0, 160, "cmbConnectionsMode", w,
    "Between containers: connections route to/from the container box as a whole. " +
    "Crossing containers: connections route through container boundaries to specific elements.");
  if (w.cmbContainerAlgorithm)
    w.cmbContainerAlgorithm.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));
  if (w.cmbConnectionsMode)
    w.cmbConnectionsMode.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));

  // Row: Inner spacing | Padding (fills all 4 cols exactly)
  _addSpinnerRow(ctrComp, "Inner spacing:", "spinInnerSpacing", 20, 0, 200, 5, w, "Minimum distance between elements inside a container (px).");
  _addSpinnerRow(ctrComp, "Padding:",       "spinPadding",      20, 0, 200, 5, w, "Space between container border and its contents (px).");

  // Checkboxes in an 8-col sub-composite spanning all 4 cols of ctrComp.
  const chkComp = new CompositeWidget(ctrComp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(8).equalWidth(true).margins(0, 0).spacing(6, 2).applyTo(chkComp);
  GridDataFactory.fillDefaults().span(4, 1).grab(true, false).applyTo(chkComp);

  // Row 1: Sort containers | Show in every container
  _addCheck(chkComp, "Sort containers",         "Sort containers alphabetically within each level.",                                                                                                                                                             4, w, "chkSortContainers");
  _addCheck(chkComp, "Show in every container", "An element in multiple containers appears in each of them.",                                                                                                                                                    4, w, "chkShowInEvery");
  // Row 2: Size by label (full width)
  _addCheck(chkComp, "Size by label",           "Derive node width and height from label text; long labels wrap to 2 lines.",                                                                                                                                    8, w, "chkLabelSizing");
  // Row 3: Align widths by level | Snap columns to grid
  _addCheck(chkComp, "Align widths by level",   "Use a common width per nesting level, with each parent level one padding step wider than its children.",                                                                                                        4, w, "chkAlignWidthSameType");
  _addCheck(chkComp, "Snap columns to grid",    "Line leaf columns up top-to-bottom on one shared grid across the whole view: each column as wide as its widest leaf, gaps tightened to the minimum the container paddings need. Element sizes are unchanged.", 4, w, "chkSnapColumns");
  // Refresh the live Output counters when 'Show in every container' toggles.
  if (w.chkShowInEvery) {
    w.chkShowInEvery.addListener(SWT.Selection, onParamsChange);
    w.chkShowInEvery.addListener(SWT.Selection, () => _updateAlgorithmControls(ctx));
  }

  // ── View dimensions ────────────────────────────────────────────────────────────
  const grpVS = _group(page, "View dimensions", 6);

  // Inline row: ○ Aspect ratio [combo]  ○ Max width [spinner]  ● None
  // All three radios live in the same composite → SWT mutual exclusion is automatic.
  const hintRow = new CompositeWidget(grpVS, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(0, 0).spacing(8, 0).applyTo(hintRow);
  GridDataFactory.fillDefaults().span(6, 1).grab(true, false).applyTo(hintRow);

  const _vsRadio = (label, extraPx) => {
    const r = new ButtonWidget(hintRow, SWT.RADIO);
    r.setText(label);
    if (extraPx) {
      const sz = r.computeSize(SWT.DEFAULT, SWT.DEFAULT);
      GridDataFactory.swtDefaults().hint(sz.x + extraPx, SWT.DEFAULT).applyTo(r);
    } else {
      GridDataFactory.swtDefaults().applyTo(r);
    }
    r.addListener(SWT.Selection, () => { if (r.getSelection()) _applyViewSizeMode(ctx); });
    return r;
  };

  w.radioViewSizeAspectRatio = _vsRadio("Aspect ratio:", 8);
  w.radioViewSizeAspectRatio.setToolTipText("Spread layout outward to match the target aspect ratio. No compression if already larger.");
  _addCombo(hintRow, null, AR_LABELS, 0, 150, "cmbAspectRatio", w, "Target width-to-height ratio.");

  w.radioViewSizeMaxWidth = _vsRadio("Max width:");
  w.radioViewSizeMaxWidth.setToolTipText("Spread layout outward to reach the target width. No compression if already larger.");
  const _spMaxWidth = new SpinnerWidget(hintRow, SWT.BORDER);
  _spMaxWidth.setValues(0, 0, 99999, 0, 100, 500);
  GridDataFactory.swtDefaults().hint(65, SWT.DEFAULT).applyTo(_spMaxWidth);
  _spMaxWidth.setToolTipText("Target view width (px).");
  w.spinMaxWidth = _spMaxWidth;

  w.radioViewSizeNone = _vsRadio("None", 16);
  w.radioViewSizeNone.setSelection(true);
  w.radioViewSizeNone.setToolTipText("No constraint; layout determines the view bounds.");

  _addSpinnerRow(grpVS, "Diagram padding:", "spinDiagramPadding", 10, 0, 200, 5, w, "Space between the diagram boundary and the outermost elements (px). Applied by all engines.");

  finish();
}

// ── Appearance tab helpers ────────────────────────────────────────────────────

// Sets for fast element/relation type detection within rawModelObjects.
const _ELEM_TYPE_SET   = new Set(ELEMENT_TYPES);
const _REL_TYPE_ID_SET = new Set(RELATION_TYPE_IDS);

// Creates a READ_ONLY combo + gradient Canvas strip side-by-side.
// Registers combo on w[key] and canvas on w[key + "Canvas"]. Returns the combo.
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
      e.gc.setBackground(e.display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND));
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
function _solidColorSwatch(parent, hexColor, key, w) {
  let _hex = (hexColor || "#cccccc").replace(/^#/, "");
  const canvas = new CanvasWidget(parent, SWT.NONE);
  GridDataFactory.swtDefaults().hint(24, 18).applyTo(canvas);
  if (key && w) w[key] = canvas;

  const setColor = (hex) => {
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
      e.gc.setBackground(e.display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND));
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

// Builds a READ_ONLY combo populated with property names found on rawModelObjects.
// getTypes(): () => string[] of type IDs. Empty = all. objKind: "element"|"relation".
// Registers combo on w[key]. Returns { combo, refresh() }.
function _buildDynamicPropCombo(parent, ctx, getTypes, objKind, key, w, tooltip) {
  const cmb = new ComboWidget(parent, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(cmb);
  if (tooltip) cmb.setToolTipText(tooltip);
  w[key] = cmb;

  function refresh() {
    const prevVal = cmb.getSelectionIndex() > 0 ? cmb.getItem(cmb.getSelectionIndex()) : "";
    cmb.removeAll();
    cmb.add(""); // blank placeholder = feature inactive

    const types = getTypes ? getTypes() : [];
    const props = new Set();
    (ctx.rawModelObjects || []).forEach(obj => {
      if (!obj || !obj.type) return;
      const t = String(obj.type);
      if (objKind === "element") {
        if (!_ELEM_TYPE_SET.has(t)) return;
        if (types.length > 0 && !types.includes(t)) return;
      } else {
        if (!_REL_TYPE_ID_SET.has(t)) return;
        if (types.length > 0 && !types.includes(t)) return;
      }
      try {
        const keys = obj.prop();
        if (Array.isArray(keys)) keys.forEach(k => { if (k) props.add(String(k)); });
      } catch (e) {}
    });

    Array.from(props).sort().forEach(p => cmb.add(p));
    const items = Array.from({ length: cmb.getItemCount() }, (_, i) => cmb.getItem(i));
    const ri = items.indexOf(prevVal);
    cmb.select(ri >= 0 ? ri : 0);
  }

  return { combo: cmb, refresh };
}

// Enable or disable all downstream controls that depend on a property being selected.
// Called on property combo selection change and from _syncToUI.
function _updateAppearancePropStates(ctx) {
  const w = ctx.widgets;
  if (!w.sbpElementProp) return; // appearance tab not yet built

  const _rc  = (key) => { try { if (w[key + "Canvas"]) w[key + "Canvas"].redraw(); } catch (e) {} };
  const _en  = (key, on) => _enable(w[key], on);

  // 1a — Style by property: Elements
  const sbpElemOn = !!(w.chkSbpElemEnabled && w.chkSbpElemEnabled.getSelection());
  _en("sbpElementType",     sbpElemOn);
  _en("sbpElementPropLbl",  sbpElemOn);
  _en("sbpElementProp",     sbpElemOn);
  const hasSbpElem = sbpElemOn && w.sbpElementProp.getSelectionIndex() > 0;
  _en("sbpElementRangeLbl", hasSbpElem);
  _en("sbpElementRange",    hasSbpElem); _rc("sbpElementRange");

  // 1b — Style by property: Relations
  const sbpRelOn = !!(w.chkSbpRelEnabled && w.chkSbpRelEnabled.getSelection());
  _en("sbpRelType",         sbpRelOn);
  _en("sbpRelPropLbl",      sbpRelOn);
  _en("sbpRelProp",         sbpRelOn);
  const hasSbpRel = sbpRelOn && w.sbpRelProp && w.sbpRelProp.getSelectionIndex() > 0;
  _en("sbpRelRangeLbl",     hasSbpRel);
  _en("sbpRelRange",        hasSbpRel); _rc("sbpRelRange");
  _en("lblSbpRelWidth",     hasSbpRel);
  _en("sbpRelLineWidth",    hasSbpRel);

  // 2 — Style by related property
  const sbrpOn = !!(w.chkSbrpEnabled && w.chkSbrpEnabled.getSelection());
  _en("sbrpRelTypes",       sbrpOn);
  _en("sbrpPropLbl",        sbrpOn);
  _en("sbrpProp",           sbrpOn);
  const hasSbrp = sbrpOn && w.sbrpProp && w.sbrpProp.getSelectionIndex() > 0;
  _en("sbrpRangeLbl",       hasSbrp);
  _en("sbrpRange",          hasSbrp); _rc("sbrpRange");

  // 3 — Style by connected element
  const sbceOn = !!(w.chkSbceEnabled && w.chkSbceEnabled.getSelection());
  _en("sbceRelTypes",       sbceOn);
  _en("lblSbceElemType",    sbceOn);
  _en("sbceElementType",    sbceOn);
  _en("sbcePropLbl",        sbceOn);
  _en("sbceProp",           sbceOn);
  const hasSbce = sbceOn && w.sbceProp && w.sbceProp.getSelectionIndex() > 0;
  _en("sbceRangeLbl",       hasSbce);
  _en("sbceRange",          hasSbce); _rc("sbceRange");
  _en("lblSbceConflict",    hasSbce);
  _en("sbceConflictColor",  hasSbce);
  _en("sbceConflictSwatch", hasSbce);
  try { if (w.sbceConflictSwatch) w.sbceConflictSwatch.redraw(); } catch (e) {}

  // 5 — Highlight repeated elements
  const hlOn = !!(w.chkHighlightRep && w.chkHighlightRep.getSelection());
  _en("lblHighlightRepRange",   hlOn);
  _en("cmbHighlightRepRange",   hlOn); _rc("cmbHighlightRepRange");
}

// ── Appearance tab helpers ─────────────────────────────────────────────────────

// Creates a "Property: [combo—fills] Color range: [combo][strip]" one-line row.
// Color range is right-aligned because the property combo grabs all spare width.
// Returns { refresh() } for re-scanning model properties.
function _buildPropColorRow(parent, ctx, getTypes, objKind, propKey, rangeDefault, rangeKey, w, propTip, rangeTip, onChange) {
  const row = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(5).margins(0, 0).spacing(4, 0).applyTo(row);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);

  const propLbl = new LabelWidget(row, SWT.NONE);
  propLbl.setText("Property:");
  w[propKey + "Lbl"] = propLbl;
  const propCtrl = _buildDynamicPropCombo(row, ctx, getTypes, objKind, propKey, w, propTip);
  const rangeLbl = new LabelWidget(row, SWT.NONE);
  rangeLbl.setText("Color range:");
  w[rangeKey + "Lbl"] = rangeLbl;
  _colorRangeSelector(row, rangeDefault, rangeKey, w, rangeTip, onChange);

  w[propKey].addListener(SWT.Selection, () => { _updateAppearancePropStates(ctx); onChange(); });
  return propCtrl; // { combo, refresh }
}

// ── Appearance tab ────────────────────────────────────────────────────────────

function _buildAppearanceTab(tabFolder, ctx) {
  const { page, finish } = _scrolledTab(tabFolder, "Appearance");
  const w = ctx.widgets;
  const onChange = () => _markModified(ctx);

  // ── 1. Style by property ──────────────────────────────────────────────────
  const grpSbp = _group(page, "Style by property", 1);

  const sbpDescLbl = new LabelWidget(grpSbp, SWT.WRAP);
  // sbpDescLbl.setText("Apply color to elements or relations based on a selected property value to reveal patterns and intensity differences.");
  sbpDescLbl.setText("Color-code elements or relationships based on property values");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpDescLbl);

  // Elements: enable checkbox (label = "Element type:") + type combo on one row
  const sbpElemHeader = new CompositeWidget(grpSbp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0,0).spacing(4,0).applyTo(sbpElemHeader);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpElemHeader);

  const chkSbpElem = new ButtonWidget(sbpElemHeader, SWT.CHECK);
  chkSbpElem.setText("Element type:");
  chkSbpElem.setToolTipText("Apply color to elements based on a property value");
  w.chkSbpElemEnabled = chkSbpElem;

  const sbpElemType = new ComboWidget(sbpElemHeader, SWT.READ_ONLY | SWT.DROP_DOWN);
  sbpElemType.add("Any"); ELEMENT_TYPE_LABELS.forEach(l => sbpElemType.add(l));
  sbpElemType.select(0);
  GridDataFactory.fillDefaults().applyTo(sbpElemType);
  sbpElemType.setToolTipText("Select which elements are styled");
  w.sbpElementType = sbpElemType;

  const sbpElemBody = new CompositeWidget(grpSbp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(14, 2).spacing(4, 3).applyTo(sbpElemBody);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpElemBody);
  w.sbpElemBody = sbpElemBody;

  let sbpElemPropRefresh = null;
  const getElemTypes = () => {
    const idx = w.sbpElementType ? w.sbpElementType.getSelectionIndex() : 0;
    return idx > 0 && ELEMENT_TYPES[idx - 1] ? [ELEMENT_TYPES[idx - 1]] : [];
  };
  const sbpElemPropCtrl = _buildPropColorRow(sbpElemBody, ctx, getElemTypes, "element",
    "sbpElementProp", "Blues", "sbpElementRange", w,
    "Choose which information is shown as color",
    "Define which colors is used to map to values (low → high)", onChange);
  sbpElemPropRefresh = sbpElemPropCtrl.refresh;
  sbpElemType.addListener(SWT.Selection, () => { if (sbpElemPropRefresh) sbpElemPropRefresh(); onChange(); });

  chkSbpElem.addListener(SWT.Selection, () => { _updateAppearancePropStates(ctx); onChange(); });

  // Relations: enable checkbox (label = "Relation type:") + type combo on one row
  const sbpRelHeader = new CompositeWidget(grpSbp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0,0).spacing(4,0).applyTo(sbpRelHeader);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpRelHeader);

  const chkSbpRel = new ButtonWidget(sbpRelHeader, SWT.CHECK);
  chkSbpRel.setText("Relation type:");
  chkSbpRel.setToolTipText("Apply color to relations based on a property value");
  w.chkSbpRelEnabled = chkSbpRel;

  const sbpRelType = new ComboWidget(sbpRelHeader, SWT.READ_ONLY | SWT.DROP_DOWN);
  sbpRelType.add("Any"); RELATION_TYPE_LABELS.forEach(l => sbpRelType.add(l));
  sbpRelType.select(0);
  GridDataFactory.fillDefaults().applyTo(sbpRelType);
  sbpRelType.setToolTipText("Select which relation type is styled");
  w.sbpRelType = sbpRelType;

  const sbpRelBody = new CompositeWidget(grpSbp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(14, 2).spacing(4, 3).applyTo(sbpRelBody);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbpRelBody);
  w.sbpRelBody = sbpRelBody;

  let sbpRelPropRefresh = null;
  const getRelTypes = () => {
    const idx = w.sbpRelType ? w.sbpRelType.getSelectionIndex() : 0;
    return idx > 0 && RELATION_TYPE_IDS[idx - 1] ? [RELATION_TYPE_IDS[idx - 1]] : [];
  };
  sbpRelType.addListener(SWT.Selection, () => { if (sbpRelPropRefresh) sbpRelPropRefresh(); onChange(); });

  const sbpRelPropCtrl = _buildPropColorRow(sbpRelBody, ctx, getRelTypes, "relation",
    "sbpRelProp", "Reds", "sbpRelRange", w,
    "Choose which relation information is shown as color",
    "Define which colors is used to map to values (low → high)", onChange);
  sbpRelPropRefresh = sbpRelPropCtrl.refresh;

  const sbpRelWidthRow = new CompositeWidget(sbpRelBody, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0,0).spacing(4,0).applyTo(sbpRelWidthRow);
  GridDataFactory.fillDefaults().applyTo(sbpRelWidthRow);
  const sbpRelWidthLbl = new LabelWidget(sbpRelWidthRow, SWT.NONE);
  sbpRelWidthLbl.setText("Set line width:");
  w.lblSbpRelWidth = sbpRelWidthLbl;
  const sbpRelWidthCmb = new ComboWidget(sbpRelWidthRow, SWT.READ_ONLY | SWT.DROP_DOWN);
  sbpRelWidthCmb.add("No change");
  sbpRelWidthCmb.add("1 - Normal");
  sbpRelWidthCmb.add("2 - Medium");
  sbpRelWidthCmb.add("3 - Heavy");
  sbpRelWidthCmb.select(0);
  GridDataFactory.fillDefaults().applyTo(sbpRelWidthCmb);
  sbpRelWidthCmb.setToolTipText("Set a fixed line width on all matched connections");
  sbpRelWidthCmb.addListener(SWT.Selection, onChange);
  w.sbpRelLineWidth = sbpRelWidthCmb;

  chkSbpRel.addListener(SWT.Selection, () => { _updateAppearancePropStates(ctx); onChange(); });

  // ── 2. Style by related property ─────────────────────────────────────────
  const grpSbrp = _group(page, "Style by related property", 1);

  const chkSbrp = new ButtonWidget(grpSbrp, SWT.CHECK);
  chkSbrp.setText("Color elements based on properties of their related relations.");
  w.chkSbrpEnabled = chkSbrp;

  const sbrpBody = new CompositeWidget(grpSbrp, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(14, 2).spacing(4, 3).applyTo(sbrpBody);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbrpBody);
  w.sbrpBody = sbrpBody;

  let sbrpPropRefresh = null;
  const getSbrpRelTypes = () => (w.sbrpRelTypes ? w.sbrpRelTypes.getEncoded() : []).map(e => e.replace(/:in$|:out$/, ""));
  const sbrpRelGridOnChange = () => { if (sbrpPropRefresh) sbrpPropRefresh(); onChange(); };
  w.sbrpRelTypes = _relCheckGrid(sbrpBody, 4, sbrpRelGridOnChange);

  const sbrpPropCtrl = _buildPropColorRow(sbrpBody, ctx, getSbrpRelTypes, "relation",
    "sbrpProp", "OrRd", "sbrpRange", w,
    "Choose which relation property is used for coloring",
    "Define which colors is used to map to values (low → high)", onChange);
  sbrpPropRefresh = sbrpPropCtrl.refresh;

  chkSbrp.addListener(SWT.Selection, () => { _updateAppearancePropStates(ctx); onChange(); });

  // ── 3. Style by connected element ────────────────────────────────────────
  const grpSbce = _group(page, "Style by connected element", 1);

  const chkSbce = new ButtonWidget(grpSbce, SWT.CHECK);
  chkSbce.setText("Color elements based on properties of connected elements through relations.");
  w.chkSbceEnabled = chkSbce;

  const sbceBody = new CompositeWidget(grpSbce, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(14, 2).spacing(4, 3).applyTo(sbceBody);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sbceBody);
  w.sbceBody = sbceBody;

  let sbcePropRefresh = null;
  const getSbceRelTypes = () => (w.sbceRelTypes ? w.sbceRelTypes.getEncoded() : []).map(e => e.replace(/:in$|:out$/, ""));
  const sbceRelGridOnChange = () => { if (sbcePropRefresh) sbcePropRefresh(); onChange(); };
  w.sbceRelTypes = _relCheckGrid(sbceBody, 4, sbceRelGridOnChange);

  const sbceElemTypeRow = new CompositeWidget(sbceBody, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(0,0).spacing(4,0).applyTo(sbceElemTypeRow);
  GridDataFactory.fillDefaults().applyTo(sbceElemTypeRow);
  const sbceElemTypeLbl = new LabelWidget(sbceElemTypeRow, SWT.NONE);
  sbceElemTypeLbl.setText("Element type:");
  w.lblSbceElemType = sbceElemTypeLbl;
  const sbceElemType = new ComboWidget(sbceElemTypeRow, SWT.READ_ONLY | SWT.DROP_DOWN);
  sbceElemType.add("Any"); ELEMENT_TYPE_LABELS.forEach(l => sbceElemType.add(l));
  sbceElemType.select(0);
  GridDataFactory.fillDefaults().applyTo(sbceElemType);
  sbceElemType.setToolTipText("Select which connected elements are used for coloring");
  w.sbceElementType = sbceElemType;

  const getSbceElemTypes = () => {
    const idx = w.sbceElementType ? w.sbceElementType.getSelectionIndex() : 0;
    return idx > 0 && ELEMENT_TYPES[idx - 1] ? [ELEMENT_TYPES[idx - 1]] : [];
  };
  const sbcePropCtrl = _buildPropColorRow(sbceBody, ctx, getSbceElemTypes, "element",
    "sbceProp", "Purples", "sbceRange", w,
    "Choose which property of connected elements is used for coloring",
    "Define which colors is used to map to values (low → high)", onChange);
  sbcePropRefresh = sbcePropCtrl.refresh;
  sbceElemType.addListener(SWT.Selection, () => { if (sbcePropRefresh) sbcePropRefresh(); onChange(); });

  const sbceConflictRow = new CompositeWidget(sbceBody, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(3).margins(0,2).spacing(4,0).applyTo(sbceConflictRow);
  GridDataFactory.fillDefaults().applyTo(sbceConflictRow);
  const sbceConflictLbl = new LabelWidget(sbceConflictRow, SWT.NONE);
  sbceConflictLbl.setText("Multiple targets:");
  w.lblSbceConflict = sbceConflictLbl;
  const txtSbceConflict = new TextWidget(sbceConflictRow, SWT.BORDER);
  txtSbceConflict.setToolTipText("Color for elements connected to more than one target element");
  GridDataFactory.swtDefaults().hint(80, SWT.DEFAULT).applyTo(txtSbceConflict);
  txtSbceConflict.setText("#FF6B35");
  w.sbceConflictColor = txtSbceConflict;
  const sbceConflictSwatch = _solidColorSwatch(sbceConflictRow, "#FF6B35", "sbceConflictSwatch", w);
  const sbceConflictOnChange = () => { sbceConflictSwatch.setColor(txtSbceConflict.getText().trim()); onChange(); };
  txtSbceConflict.addListener(SWT.FocusOut, sbceConflictOnChange);
  txtSbceConflict.addListener(SWT.DefaultSelection, sbceConflictOnChange);

  chkSbce.addListener(SWT.Selection, () => { _updateAppearancePropStates(ctx); onChange(); });

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
  GridDataFactory.swtDefaults().hint(40, SWT.DEFAULT).applyTo(nestRootFontSp);
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
  GridDataFactory.swtDefaults().hint(40, SWT.DEFAULT).applyTo(nestFontDecreaseSp);
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
  GridDataFactory.swtDefaults().hint(40, SWT.DEFAULT).applyTo(nestLightenSp);
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
  chkHighlightRep.setToolTipText("Elements that appear more than once on this view receive a shared color per identity.");
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

  // Initial population of dynamic property combos
  sbpElemPropCtrl.refresh();
  sbpRelPropCtrl.refresh();
  sbrpPropCtrl.refresh();
  sbcePropCtrl.refresh();

  _updateNestingLevelState(ctx);
  _updateAppearancePropStates(ctx);
  finish();
}

// Enable/disable the "Style by nesting level" controls based on whether any nesting
// relation types are configured in the Layout tab. Called from _syncToUI and when
// nesting types change, so both tabs stay in sync.
function _updateNestingLevelState(ctx) {
  const w = ctx.widgets;
  if (!w.chkNestFont) return; // Appearance tab not yet built — skip

  const nestingTypes = w.lstNestingTypes ? _listGetSelected(w.lstNestingTypes) : [];
  const hasNesting   = nestingTypes.length > 0;

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

  const hasColor = hasNesting && w.chkNestColor.getSelection();
  _enable(w.txtRootColor,         hasColor);
  _enable(w.nestRootSwatch,       hasColor);
  _enable(w.lblNestLighten,        hasColor);
  _enable(w.spinNestLighten,       hasColor);
  _enable(w.lblNestLightenPct,     hasColor);
  try { if (w.nestRootSwatch) w.nestRootSwatch.redraw(); } catch (e) {}
}

// ── View tab ──────────────────────────────────────────────────────────────────

// ── Action row (below preset) ─────────────────────────────────────────────────

function _runAction(buttonId, dlg, ctx) {
  const ACTION_MAP = {};
  ACTION_MAP[IDialogConstants.OK_ID] = ACTION.NEW_VIEW.id;
  ACTION_MAP[101] = ACTION.LAYOUT_ONLY.id;
  ACTION_MAP[102] = ACTION.EXPAND_VIEW.id;
  ACTION_MAP[103] = ACTION.ONE_EACH.id;
  _saveUI(ctx);
  _persistSession(ctx);
  ctx._actionId = ACTION_MAP[buttonId] || ACTION.NEW_VIEW.id;
  Common.startCounter("generate_view");
  Java.super(dlg).okPressed();
}

// Action-row button: fills cell width, bottom-aligned within group.
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
function _group(parent, label, numColumns, opts) {
  opts = opts || {};
  const grp = new GroupWidget(parent, SWT.NONE);
  grp.setText(label);
  if (opts.bold !== false) { const f = _getBoldFont(); if (f) try { grp.setFont(f); } catch (e) {} }
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

// Horizontal separator + sub-section label inside a multi-col group.
// span = number of columns in the parent group's GridLayout.
function _groupSep(parent, span, label) {
  const sep = new LabelWidget(parent, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).span(span, 1).hint(SWT.DEFAULT, 6).applyTo(sep);
  const lbl = new LabelWidget(parent, SWT.NONE);
  lbl.setText(label);
  GridDataFactory.fillDefaults().span(span, 1).applyTo(lbl);
}

// Label + read-only combo + items + selection + width hint + widget registration.
function _addCombo(parent, label, items, selectedIdx, widthHint, key, w, tooltip) {
  if (label) new LabelWidget(parent, SWT.NONE).setText(label);
  const cmb = new ComboWidget(parent, SWT.READ_ONLY | SWT.DROP_DOWN);
  items.forEach(it => cmb.add(it));
  cmb.select(selectedIdx);
  GridDataFactory.swtDefaults().hint(widthHint, SWT.DEFAULT).applyTo(cmb);
  if (tooltip) cmb.setToolTipText(tooltip);
  w[key] = cmb;
  return cmb;
}

function _buildActionRow(area, ctx, dlg, hasVisual) {
  const w = ctx.widgets;

  const sep = new LabelWidget(area, SWT.SEPARATOR | SWT.HORIZONTAL);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(sep);

  const btnRow = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(btnRow);
  GridLayoutFactory.fillDefaults().numColumns(3).margins(0, 2).spacing(8, 0).applyTo(btnRow);

  // " " (not "") so GTK reserves the title-bar slot — matches labelled siblings' height.
  const grpCancel = _group(btnRow, " ",                    1, { grabV: true, spaceV: 0, bold: false });
  const grpCreate = _group(btnRow, "Create new view",      2, { grabV: true, spaceV: 0, bold: false });
  const grpModify = _group(btnRow, "Modify selected view", 2, { grabV: true, spaceV: 0, bold: false });

  _actionBtn(grpCancel, "Cancel", () => {
    _persistSession(ctx);  // remember _lastTabIndex even on cancel
    Java.super(dlg).cancelPressed();
  });

  w.btnNewView = _actionBtn(grpCreate, "New view",      () => _runAction(IDialogConstants.OK_ID, dlg, ctx));
  w.btnOneEach = _actionBtn(grpCreate, "One view each", () => _runAction(103, dlg, ctx));

  w.btnExpandView = _actionBtn(grpModify, "Expand view", () => _runAction(102, dlg, ctx));
  w.btnLayoutOnly = _actionBtn(grpModify, "Layout only", () => _runAction(101, dlg, ctx));
  w.btnExpandView.setEnabled(hasVisual);
  w.btnLayoutOnly.setEnabled(hasVisual);
}

// ── View name and location ────────────────────────────────────────────────────

function _buildViewRow(area, ctx) {
  const w = ctx.widgets;

  // 4-column grid: [Folder lbl] [Folder field] [Name lbl] [Name field] on row 1;
  // a single-cell totals strip spanning all columns on row 2.
  const grpView = _group(area, "Generated view", 4);

  new LabelWidget(grpView, SWT.NONE).setText("Folder:");
  const txtFolder = new TextWidget(grpView, SWT.BORDER);
  txtFolder.setToolTipText("Archi folder path under /Views (e.g. /Project/Generated).");
  GridDataFactory.fillDefaults().grab(true, false).hint(200, SWT.DEFAULT).applyTo(txtFolder);
  w.txtViewFolder = txtFolder;

  new LabelWidget(grpView, SWT.NONE).setText("Name:");
  const txtName = new TextWidget(grpView, SWT.BORDER);
  txtName.setToolTipText("View name. Pre-filled from the first selected object.");
  GridDataFactory.fillDefaults().grab(true, false).hint(200, SWT.DEFAULT).applyTo(txtName);
  w.txtViewName = txtName;

  // Row 2: always-visible totals strip. Multi-line; sub-lines for elements / relations /
  // diagram objects. Hide-zero subfields, skip empty sub-lines (see _formatOutputLine).
  const lblTotals = new LabelWidget(grpView, SWT.NONE);
  lblTotals.setText("On the generated view: —");
  lblTotals.setToolTipText(
    "What will be on the generated view. "  +
    "Number of containers, nested elements, standalones; extra occurrences when 'Show in every container' " +
    "is on; nestings (drawn as box-in-box) and connections (drawn as lines); " +
    "diagram objects (canvas-only).");
  // Vertical grab so multi-line text doesn't clip; span 4 columns of the parent grid.
  GridDataFactory.fillDefaults().span(4, 1).grab(true, false)
    .hint(SWT.DEFAULT, SWT.DEFAULT).applyTo(lblTotals);
  w.lblViewTotals = lblTotals;
}

// ── Modified indicator ────────────────────────────────────────────────────────

function _markModified(ctx) {
  if (!ctx._ready || ctx.modified) return;
  ctx.modified = true;
  try { ctx.widgets.lblModified.setVisible(true); } catch (x) {}
}

function _clearModified(ctx) {
  ctx.modified = false;
  try { ctx.widgets.lblModified.setVisible(false); } catch (x) {}
}

// ── Preset row ────────────────────────────────────────────────────────────────

function _buildPresetRow(parent, ctx, dlg) {
  const w   = ctx.widgets;
  const row = new CompositeWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  // columns: delete | label | combo | modified-star | save | save-as
  GridLayoutFactory.fillDefaults().numColumns(6).margins(9, 2).spacing(4, 0).applyTo(row);

  // Delete — left, disabled for Default, with confirm
  const btnDelete = _pushBtn(row, "Delete", "Delete the selected preset", () => {
    const name      = ctx.config.name || PresetIO.DEFAULT_PRESET_NAME;
    const isDefault = name === PresetIO.DEFAULT_PRESET_NAME;
    if (isDefault) return;
    if (!window.confirm("Delete preset \"" + name + "\"?")) return;
    try {
      PresetIO.deletePreset(name);
      const fallback = PresetIO.readPreset(PresetIO.DEFAULT_PRESET_NAME);
      _mergePreset(ctx, fallback);
      ctx.config.name = PresetIO.DEFAULT_PRESET_NAME;
      _refreshPresetCombo(cmbPreset, PresetIO.DEFAULT_PRESET_NAME);
      btnDelete.setEnabled(false);
      _syncToUI(ctx);
      _clearModified(ctx);
      _updateFilteredCount(ctx);
    } catch (e) { console.error("Delete failed: " + e); }
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(btnDelete);
  w.btnDelete = btnDelete;

  new LabelWidget(row, SWT.NONE).setText("Preset:");

  const cmbPreset = new ComboWidget(row, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(cmbPreset);
  _refreshPresetCombo(cmbPreset, ctx.config.name);
  w.cmbPreset = cmbPreset;

  // Modified indicator — hidden until user changes a setting
  const lblModified = new LabelWidget(row, SWT.NONE);
  lblModified.setText("*");
  lblModified.setToolTipText("Unsaved changes — click Save to overwrite, Save As… to create a new preset");
  lblModified.setVisible(false);
  w.lblModified = lblModified;

  // Save — silent overwrite
  const btnSave = _pushBtn(row, "Save", "Overwrite the current preset with these settings", () => {
    _saveUI(ctx);
    const name = ctx.config.name || PresetIO.DEFAULT_PRESET_NAME;
    PresetIO.writePreset(name, ctx.config);
    _refreshPresetCombo(cmbPreset, name);
    _clearModified(ctx);
  });
  GridDataFactory.swtDefaults().hint(60, SWT.DEFAULT).applyTo(btnSave);

  // Save As… — new name + folder + description
  const btnSaveAs = _pushBtn(row, "Save As…", "Save these settings as a new preset", () => {
    const PresetsDialog = require(REPO_ROOT + "View/lib/gui/dialog_presets");
    _saveUI(ctx);
    PresetsDialog.openSaveAs({
      title:              "Save As…",
      message:            "Save current settings as a new preset.",
      defaultName:        ctx.config.name || "",
      defaultDescription: ctx.config.description || "",
      onConfirm(newName, description) {
        ctx.config.name        = newName;
        ctx.config.description = description;
        try { cmbPreset.setToolTipText(description); } catch (x) {}
        PresetIO.writePreset(newName, ctx.config);
        _refreshPresetCombo(cmbPreset, newName);
        _clearModified(ctx);
      },
    });
  });
  GridDataFactory.swtDefaults().hint(80, SWT.DEFAULT).applyTo(btnSaveAs);

  // Auto-apply on dropdown selection; suppress modified during load
  cmbPreset.addListener(SWT.Selection, () => {
    const idx = cmbPreset.getSelectionIndex();
    if (idx < 0) return;
    const name = cmbPreset.getItem(idx);
    try {
      ctx._ready = false;
      const loaded = PresetIO.readPreset(name);
      _mergePreset(ctx, loaded);
      ctx.config.name = name;
      _syncToUI(ctx);
      _clearModified(ctx);
      _updateFilteredCount(ctx);
      try { cmbPreset.setToolTipText(loaded.description || ""); } catch (x) {}
      // Delete disabled for Default
      const isDefault = name === PresetIO.DEFAULT_PRESET_NAME;
      try { w.btnDelete.setEnabled(!isDefault); } catch (x) {}
    } catch (e) {
      console.error("Load preset: " + e);
    } finally {
      ctx._ready = true;
    }
  });

  // Set initial delete-button state
  try {
    const isDefault = (ctx.config.name || PresetIO.DEFAULT_PRESET_NAME) === PresetIO.DEFAULT_PRESET_NAME;
    btnDelete.setEnabled(!isDefault);
  } catch (x) {}
}

// ── Sync config ↔ UI ──────────────────────────────────────────────────────────

function _syncToUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;
  const p = c.params || {};

  // Algorithm radio selection
  const algName = c.algorithm || "Layered";
  if (w.algRadios) {
    w.algRadios.forEach(r => r.setSelection(false));
    const r = w.algRadios.get(algName);
    if (r) r.setSelection(true);
  }

  // Direction / routing / label / ranking
  const DP     = DEFAULT_PRESET.params;
  const algDef = ALGORITHMS[algName] || {};
  _comboSelect(w.cmbDirection,    DIRECTION_LABELS, p.direction     || DP.direction);
  _comboSelect(w.cmbRouting,      ROUTING_ALL,      p.routing       || DP.routing);
  _comboSelect(w.cmbLabelPosition,LABEL_POS_ALL,    p.labelPosition || algDef.labelPositionDefault || DP.labelPosition);
  _comboSelect(w.cmbRanking,      RANKING_LABELS,   p.ranking       || DP.ranking);
  _comboSelect(w.cmbAcyclicer,    ACYCLICER_LABELS, p.acyclicer     || DP.acyclicer);

  // Nesting / reverse multi-select lists
  if (w.lstNestingTypes) _listSelectLabels(w.lstNestingTypes, _relIdsToLabels(p.nestingRelationTypes || []));
  if (w.lstReverseTypes) _listSelectLabels(w.lstReverseTypes, _relIdsToLabels(p.reverseRelationTypes || []));

  // Container appearance
  _spinSet(w.spinInnerSpacing, p.innerSpacing  !== undefined ? p.innerSpacing  : DP.innerSpacing);
  _spinSet(w.spinPadding,      p.padding       !== undefined ? p.padding       : DP.padding);
  _chkSet(w.chkSortContainers, !!(p.sortContainers));
  _chkSet(w.chkAlignWidthSameType, !!(p.alignWidthSameType));
  _chkSet(w.chkSnapColumns, !!(p.snapColumnsToGrid));
  _chkSet(w.chkShowInEvery,  !!(p.showInEveryContainer));
  _chkSet(w.chkLabelSizing,  !!(p.labelSizing));
  if (w.cmbContainerAlgorithm) {
    const idx = CONTAINER_ALGO_LABELS.indexOf(p.containerAlgorithm || "Layered");
    w.cmbContainerAlgorithm.select(idx >= 0 ? idx : 0);
  }
  if (w.cmbConnectionsMode) {
    const idx = CONNECTIONS_MODE_LABELS.indexOf(p.connectionsMode || "Between containers");
    w.cmbConnectionsMode.select(idx >= 0 ? idx : 0);
  }

  // Sizes
  _spinSet(w.spinElementWidth,   p.elementWidth   !== undefined ? p.elementWidth   : DP.elementWidth);
  _spinSet(w.spinElementHeight,  p.elementHeight  !== undefined ? p.elementHeight  : DP.elementHeight);
  _spinSet(w.spinElementSpacing,       p.elementSpacing       !== undefined ? p.elementSpacing       : DP.elementSpacing);
  _spinSet(w.spinLayerSpacing,         p.layerSpacing         !== undefined ? p.layerSpacing         : DP.layerSpacing);
  _spinSet(w.spinDiagramPadding,           p.diagramPadding           !== undefined ? p.diagramPadding           : DP.diagramPadding);
  _spinSet(w.spinConnectionSpacing,        p.connectionSpacing        !== undefined ? p.connectionSpacing        : DP.connectionSpacing);
  _spinSet(w.spinConnectionElementSpacing, p.connectionElementSpacing !== undefined ? p.connectionElementSpacing : DP.connectionElementSpacing);
  _spinSet(w.spinNodeSizeByEdgeCount,  p.nodeSizeByEdgeCount  !== undefined ? p.nodeSizeByEdgeCount  : DP.nodeSizeByEdgeCount);
  _spinSet(w.spinMaxWidth,       p.maxWidth       !== undefined ? p.maxWidth       : DP.maxWidth);

  const arIdx = AR_OPTIONS.findIndex(a => a.val === (p.aspectRatio !== undefined ? p.aspectRatio : DP.aspectRatio));
  if (w.cmbAspectRatio) w.cmbAspectRatio.select(Math.max(0, arIdx));

  // View size radio — restore from config; infer from non-zero values for old presets without viewSizeMode.
  {
    const _vsAlg  = ALGORITHMS[c.algorithm] || {};
    const _vsMode = p.viewSizeMode || _inferViewSizeMode(p, _vsAlg.paramConflicts);
    const _vsMap  = {
      none:        w.radioViewSizeNone,
      maxWidth:    w.radioViewSizeMaxWidth,
      aspectRatio: w.radioViewSizeAspectRatio,
    };
    Object.entries(_vsMap).forEach(([k, r]) => { if (r) r.setSelection(k === _vsMode); });
  }

  // Filter multi-select lists
  if (w.lstFilterElements)  _listSelectLabels(w.lstFilterElements,  c.filter ? c.filter.elementTypes  : []);
  if (w.lstFilterRelations) _listSelectLabels(w.lstFilterRelations, c.filter ? _relIdsToLabels(c.filter.relationTypes || []) : []);
  if (w.lstFilterDiagram)   _listSelectLabels(w.lstFilterDiagram,   c.filter ? (c.filter.diagramTypes || []).map(id => DIAGRAM_TYPE_ID_TO_LABEL[id] || id) : []);

  // Related elements — rebuild step blocks from preset.
  // Dispose existing blocks first so reapplying a preset (or session load) is clean.
  if (ctx.relBlocks && ctx.widgets.blocksContainer) {
    while (ctx.relBlocks.length > 0) {
      const b = ctx.relBlocks[0];
      try { b.container.dispose(); } catch (e) {}
      ctx.relBlocks.shift();
    }
    const steps = (c.relatedElements && c.relatedElements.steps) || [];
    steps.forEach((step, idx) => _addRelatedBlock(ctx, step, { startCollapsed: idx > 0 }));
    _resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  }

  // View name: always pre-fill from the first selected object (captured in open()).
  const viewName  = (ctx && ctx.firstName) || (c.view && c.view.name) || "";
  if (w.txtViewName)   w.txtViewName.setText(viewName);
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder) || Defs.GENERATED_VIEW_FOLDER);

  _updateAlgorithmControls(ctx);

  // Appearance tab
  const app  = c.appearance || {};
  const DA   = DEFAULT_PRESET.appearance;

  const sbp  = app.styleByProperty        || {};
  const sbpe = sbp.element                || {};
  const sbpr = sbp.relation               || {};
  const sbrp = app.styleByRelatedProperty || {};
  const sbce = app.styleByConnectedElement || {};
  const nl   = app.nestingLevel           || {};
  const hr   = app.highlightRepeated      || {};

  // Restore a saved property name into a dynamic combo: if the name isn't in the
  // current items (selection changed since last run), add it so _saveUI can read it back.
  const _restorePropCombo = (combo, savedProp) => {
    if (!combo || !savedProp) return;
    const n = combo.getItemCount();
    const items = Array.from({ length: n }, (_, i) => combo.getItem(i));
    let idx = items.indexOf(savedProp);
    if (idx < 0) { combo.add(savedProp); idx = combo.getItemCount() - 1; }
    combo.select(idx);
  };

  // Feature 1 — Style by property (element)
  if (w.chkSbpElemEnabled) w.chkSbpElemEnabled.setSelection(!!(sbpe.enabled));
  if (w.sbpElementType) {
    const typeLabel = sbpe.elementType ? ELEMENT_TYPE_LABELS[ELEMENT_TYPES.indexOf(sbpe.elementType)] : "";
    const items = Array.from({ length: w.sbpElementType.getItemCount() }, (_, i) => w.sbpElementType.getItem(i));
    const idx = typeLabel ? items.indexOf(typeLabel) : 0;
    w.sbpElementType.select(idx >= 0 ? idx : 0);
  }
  _restorePropCombo(w.sbpElementProp, sbpe.property);
  if (w.sbpElementRange) {
    const idx = COLOR_RANGES.indexOf(sbpe.colorRange || DA.styleByProperty.element.colorRange);
    w.sbpElementRange.select(idx >= 0 ? idx : COLOR_RANGES.indexOf("Blues"));
    try { if (w.sbpElementRangeCanvas) w.sbpElementRangeCanvas.redraw(); } catch (e) {}
  }

  // Feature 1 — Style by property (relation)
  if (w.chkSbpRelEnabled) w.chkSbpRelEnabled.setSelection(!!(sbpr.enabled));
  if (w.sbpRelType) {
    const typeId = (sbpr.relTypes && sbpr.relTypes.length > 0) ? sbpr.relTypes[0].replace(/:in$|:out$/, "") : "";
    const labelIdx = typeId ? RELATION_TYPE_IDS.indexOf(typeId) : -1;
    w.sbpRelType.select(labelIdx >= 0 ? labelIdx + 1 : 0);
  }
  _restorePropCombo(w.sbpRelProp, sbpr.property);
  if (w.sbpRelRange) {
    const idx = COLOR_RANGES.indexOf(sbpr.colorRange || DA.styleByProperty.relation.colorRange);
    w.sbpRelRange.select(idx >= 0 ? idx : COLOR_RANGES.indexOf("Reds"));
    try { if (w.sbpRelRangeCanvas) w.sbpRelRangeCanvas.redraw(); } catch (e) {}
  }
  if (w.sbpRelLineWidth) w.sbpRelLineWidth.select(Math.max(0, Math.min(3, sbpr.lineWidth || 0)));

  // Feature 2 — Style by related property
  if (w.chkSbrpEnabled) w.chkSbrpEnabled.setSelection(!!(sbrp.enabled));
  if (w.sbrpRelTypes)  w.sbrpRelTypes.setEncoded(sbrp.relTypes || []);
  _restorePropCombo(w.sbrpProp, sbrp.property);
  if (w.sbrpRange) {
    const idx = COLOR_RANGES.indexOf(sbrp.colorRange || DA.styleByRelatedProperty.colorRange);
    w.sbrpRange.select(idx >= 0 ? idx : COLOR_RANGES.indexOf("OrRd"));
    try { if (w.sbrpRangeCanvas) w.sbrpRangeCanvas.redraw(); } catch (e) {}
  }

  // Feature 3 — Style by connected element
  if (w.chkSbceEnabled) w.chkSbceEnabled.setSelection(!!(sbce.enabled));
  if (w.sbceRelTypes)  w.sbceRelTypes.setEncoded(sbce.relTypes || []);
  if (w.sbceElementType) {
    const typeLabel = sbce.elementType ? ELEMENT_TYPE_LABELS[ELEMENT_TYPES.indexOf(sbce.elementType)] : "";
    const items = Array.from({ length: w.sbceElementType.getItemCount() }, (_, i) => w.sbceElementType.getItem(i));
    const idx = typeLabel ? items.indexOf(typeLabel) : 0;
    w.sbceElementType.select(idx >= 0 ? idx : 0);
  }
  _restorePropCombo(w.sbceProp, sbce.property);
  if (w.sbceRange) {
    const idx = COLOR_RANGES.indexOf(sbce.colorRange || DA.styleByConnectedElement.colorRange);
    w.sbceRange.select(idx >= 0 ? idx : COLOR_RANGES.indexOf("Purples"));
    try { if (w.sbceRangeCanvas) w.sbceRangeCanvas.redraw(); } catch (e) {}
  }
  if (w.sbceConflictColor) {
    const hex = sbce.conflictColor || DA.styleByConnectedElement.conflictColor;
    w.sbceConflictColor.setText(hex);
    try { if (w.sbceConflictSwatchSet) w.sbceConflictSwatchSet(hex); } catch (e) {}
  }

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
}

function _saveUI(ctx) {
  const c = ctx.config;
  const w = ctx.widgets;
  if (!c.params) c.params = {};
  if (!c.view)   c.view   = {};
  if (!c.filter) c.filter = { elementTypes: [], relationTypes: [], diagramTypes: [] };

  // Algorithm — read from radio buttons
  if (w.algRadios) {
    c.algorithm = "Layered"; // fallback
    for (const [name, r] of w.algRadios) { if (r.getSelection()) { c.algorithm = name; break; } }
  }

  // Direction / routing / label / ranking
  if (w.cmbDirection)     c.params.direction     = DIRECTION_LABELS[w.cmbDirection.getSelectionIndex()]    || "Right";
  if (w.cmbRouting)       { const _ri = w.cmbRouting.getSelectionIndex(); c.params.routing = (_ri >= 0 ? w.cmbRouting.getItem(_ri) : null) || "Orthogonal"; }
  if (w.cmbLabelPosition) c.params.labelPosition = LABEL_POS_ALL[w.cmbLabelPosition.getSelectionIndex()]  || "Middle";
  if (w.cmbRanking)       c.params.ranking       = RANKING_LABELS[w.cmbRanking.getSelectionIndex()]        || "Balanced";
  if (w.cmbAcyclicer)     c.params.acyclicer     = ACYCLICER_LABELS[w.cmbAcyclicer.getSelectionIndex()]   || "Default";

  // Nesting / reverse
  if (w.lstNestingTypes)  c.params.nestingRelationTypes = _relLabelsToIds(_listGetSelected(w.lstNestingTypes));
  if (w.lstReverseTypes)  c.params.reverseRelationTypes = _relLabelsToIds(_listGetSelected(w.lstReverseTypes));

  // Container
  if (w.spinInnerSpacing) c.params.innerSpacing       = w.spinInnerSpacing.getSelection();
  if (w.spinPadding)      c.params.padding            = w.spinPadding.getSelection();
  if (w.chkSortContainers) c.params.sortContainers    = w.chkSortContainers.getSelection();
  if (w.chkAlignWidthSameType) c.params.alignWidthSameType = w.chkAlignWidthSameType.getSelection();
  if (w.chkSnapColumns) c.params.snapColumnsToGrid = w.chkSnapColumns.getSelection();
  if (w.chkShowInEvery)          c.params.showInEveryContainer = w.chkShowInEvery.getSelection();
  if (w.chkLabelSizing)          c.params.labelSizing          = w.chkLabelSizing.getSelection();
  if (w.cmbContainerAlgorithm)   c.params.containerAlgorithm   = w.cmbContainerAlgorithm.getText();
  if (w.cmbConnectionsMode)      c.params.connectionsMode      = w.cmbConnectionsMode.getText();

  // Sizes
  if (w.spinElementWidth)   c.params.elementWidth   = w.spinElementWidth.getSelection();
  if (w.spinElementHeight)  c.params.elementHeight  = w.spinElementHeight.getSelection();
  if (w.spinElementSpacing)       c.params.elementSpacing       = w.spinElementSpacing.getSelection();
  if (w.spinLayerSpacing)         c.params.layerSpacing         = w.spinLayerSpacing.getSelection();
  if (w.spinDiagramPadding)           c.params.diagramPadding           = w.spinDiagramPadding.getSelection();
  if (w.spinConnectionSpacing)        c.params.connectionSpacing        = w.spinConnectionSpacing.getSelection();
  if (w.spinConnectionElementSpacing) c.params.connectionElementSpacing = w.spinConnectionElementSpacing.getSelection();
  if (w.spinNodeSizeByEdgeCount)  c.params.nodeSizeByEdgeCount  = w.spinNodeSizeByEdgeCount.getSelection();
  if (w.spinMaxWidth)       c.params.maxWidth       = w.spinMaxWidth.getSelection();
  const arIdx = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  c.params.aspectRatio  = AR_OPTIONS[Math.max(0, arIdx)] ? AR_OPTIONS[Math.max(0, arIdx)].val : 0;
  c.params.viewSizeMode = _getViewSizeMode(w);

  // Filter
  if (w.lstFilterElements)  c.filter.elementTypes  = _listGetSelected(w.lstFilterElements);
  if (w.lstFilterRelations) c.filter.relationTypes = _relLabelsToIds(_listGetSelected(w.lstFilterRelations));
  if (w.lstFilterDiagram)   c.filter.diagramTypes  = _listGetSelected(w.lstFilterDiagram).map(l => DIAGRAM_TYPE_LABEL_TO_ID[l] || l);

  // Related elements — round-trip the dynamic step-block array.
  c.relatedElements = {
    steps: (ctx.relBlocks || []).map(b => ({
      depth:         b.depthSpinner.getSelection(),
      elementTypes:  b.typeSelector.getSelected(),
      relationTypes: b.relCheckGrid.getEncoded(),
      diagramTypes:  [],
      propFilter: {
        key:   b.propFilterKey   && b.propFilterKey.getSelectionIndex()   > 0 ? b.propFilterKey.getItem(b.propFilterKey.getSelectionIndex())     : "",
        value: b.propFilterValue && b.propFilterValue.getSelectionIndex() > 0 ? b.propFilterValue.getItem(b.propFilterValue.getSelectionIndex()) : "",
      },
    })),
  };

  // View
  if (w.txtViewName)   c.view.name   = w.txtViewName.getText().trim();
  if (w.txtViewFolder) c.view.folder = w.txtViewFolder.getText().trim();

  // Appearance
  if (!c.appearance) c.appearance = JSON.parse(JSON.stringify(DEFAULT_PRESET.appearance));
  const _cmbVal = (cmb, def) => cmb && cmb.getSelectionIndex() >= 0 ? cmb.getItem(cmb.getSelectionIndex()) : def;

  // Feature 1 — Style by property (element)
  c.appearance.styleByProperty.element.enabled  = !!(w.chkSbpElemEnabled && w.chkSbpElemEnabled.getSelection());
  if (w.sbpElementType) {
    const typeIdx = w.sbpElementType.getSelectionIndex();
    c.appearance.styleByProperty.element.elementType = typeIdx > 0 ? (ELEMENT_TYPES[typeIdx - 1] || "") : "";
  }
  if (w.sbpElementProp) {
    const idx = w.sbpElementProp.getSelectionIndex();
    c.appearance.styleByProperty.element.property = idx > 0 ? w.sbpElementProp.getItem(idx) : "";
  }
  c.appearance.styleByProperty.element.colorRange = _cmbVal(w.sbpElementRange, "Blues");

  // Feature 1 — Style by property (relation)
  c.appearance.styleByProperty.relation.enabled   = !!(w.chkSbpRelEnabled && w.chkSbpRelEnabled.getSelection());
  const sbpRelTypeIdx = w.sbpRelType ? w.sbpRelType.getSelectionIndex() : 0;
  c.appearance.styleByProperty.relation.relTypes  = sbpRelTypeIdx > 0 && RELATION_TYPE_IDS[sbpRelTypeIdx - 1] ? [RELATION_TYPE_IDS[sbpRelTypeIdx - 1]] : [];
  if (w.sbpRelProp) {
    const idx = w.sbpRelProp.getSelectionIndex();
    c.appearance.styleByProperty.relation.property = idx > 0 ? w.sbpRelProp.getItem(idx) : "";
  }
  c.appearance.styleByProperty.relation.colorRange = _cmbVal(w.sbpRelRange, "Reds");
  c.appearance.styleByProperty.relation.lineWidth   = w.sbpRelLineWidth ? w.sbpRelLineWidth.getSelectionIndex() : 0;

  // Feature 2 — Style by related property
  c.appearance.styleByRelatedProperty.enabled   = !!(w.chkSbrpEnabled && w.chkSbrpEnabled.getSelection());
  c.appearance.styleByRelatedProperty.relTypes  = w.sbrpRelTypes ? w.sbrpRelTypes.getEncoded() : [];
  if (w.sbrpProp) {
    const idx = w.sbrpProp.getSelectionIndex();
    c.appearance.styleByRelatedProperty.property = idx > 0 ? w.sbrpProp.getItem(idx) : "";
  }
  c.appearance.styleByRelatedProperty.colorRange = _cmbVal(w.sbrpRange, "OrRd");

  // Feature 3 — Style by connected element
  c.appearance.styleByConnectedElement.enabled      = !!(w.chkSbceEnabled && w.chkSbceEnabled.getSelection());
  c.appearance.styleByConnectedElement.relTypes     = w.sbceRelTypes ? w.sbceRelTypes.getEncoded() : [];
  if (w.sbceElementType) {
    const typeIdx = w.sbceElementType.getSelectionIndex();
    c.appearance.styleByConnectedElement.elementType = typeIdx > 0 ? (ELEMENT_TYPES[typeIdx - 1] || "") : "";
  }
  if (w.sbceProp) {
    const idx = w.sbceProp.getSelectionIndex();
    c.appearance.styleByConnectedElement.property = idx > 0 ? w.sbceProp.getItem(idx) : "";
  }
  c.appearance.styleByConnectedElement.colorRange    = _cmbVal(w.sbceRange, "Purples");
  c.appearance.styleByConnectedElement.conflictColor = w.sbceConflictColor ? w.sbceConflictColor.getText().trim() : "#FF6B35";

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
}

// ── Algorithm controls ────────────────────────────────────────────────────────


function _updateAlgorithmControls(ctx) {
  _markModified(ctx);
  const w = ctx.widgets;
  if (!w.algRadios) return;
  let algName = "Layered";
  for (const [name, r] of w.algRadios) { if (r.getSelection()) { algName = name; break; } }
  const alg = ALGORITHMS[algName] || ALGORITHMS.Layered;

  const active = new Set(alg.activeParams || []);
  _enable(w.cmbDirection,       active.has("direction"));
  _enable(w.cmbRouting,         active.has("routing"));
  _enable(w.cmbLabelPosition,   active.has("labelPosition"));
  _enable(w.cmbRanking,         active.has("ranking"));
  _enable(w.cmbAcyclicer,       active.has("acyclicer"));
  _enable(w.lstNestingTypes,    active.has("nestingRelationTypes"));
  _enable(w.lstReverseTypes,    active.has("reverseRelationTypes"));
  _enable(w.spinInnerSpacing,   active.has("innerSpacing"));
  _enable(w.spinPadding,        active.has("padding"));
  _enable(w.chkSortContainers,  active.has("sortContainers"));
  _enable(w.chkAlignWidthSameType, active.has("alignWidthSameType"));
  _enable(w.chkSnapColumns, active.has("snapColumnsToGrid"));
  _enable(w.chkShowInEvery,          active.has("showInEveryContainer"));
  _enable(w.chkLabelSizing,          active.has("labelSizing"));
  _enable(w.cmbContainerAlgorithm,   active.has("containerAlgorithm"));
  _enable(w.cmbConnectionsMode,      active.has("connectionsMode"));
  // "Crossing containers" (INCLUDE_CHILDREN) requires the same algorithm at all hierarchy
  // levels. The two combos enforce this constraint on each other:
  //   • container algo ≠ root  → disable connections mode, reset to "Between containers"
  //   • connections mode = "Crossing containers"  → filter container algo to root only
  if (w.cmbConnectionsMode && w.cmbContainerAlgorithm) {
    const crossingSelected = w.cmbConnectionsMode.isEnabled()
      && w.cmbConnectionsMode.getText() === "Crossing containers";

    if (crossingSelected) {
      // Filter container algo dropdown to root algorithm only.
      const curCtr = w.cmbContainerAlgorithm.getText();
      w.cmbContainerAlgorithm.removeAll();
      w.cmbContainerAlgorithm.add(algName);
      w.cmbContainerAlgorithm.select(0);
    } else {
      // Restore full container algo list (may have been narrowed by the branch above).
      const fullList = (alg.supportedOptions && alg.supportedOptions.containerAlgorithm) || [];
      if (fullList.length > 0) {
        const curCtr = w.cmbContainerAlgorithm.getText();
        w.cmbContainerAlgorithm.removeAll();
        fullList.forEach(a => w.cmbContainerAlgorithm.add(a));
        const ni = fullList.indexOf(curCtr);
        w.cmbContainerAlgorithm.select(ni >= 0 ? ni : 0);
      }
      // If container algo ≠ root, connections mode cannot be "Crossing containers".
      const ctrAlgo = w.cmbContainerAlgorithm.getText();
      if (w.cmbConnectionsMode.isEnabled() && ctrAlgo && ctrAlgo !== algName) {
        _enable(w.cmbConnectionsMode, false);
        const idx = CONNECTIONS_MODE_LABELS.indexOf("Between containers");
        if (idx >= 0) w.cmbConnectionsMode.select(idx);
      }
    }
  }
  _enable(w.spinLayerSpacing,           active.has("layerSpacing"));
  _enable(w.spinDiagramPadding,           active.has("diagramPadding"));
  _enable(w.spinConnectionSpacing,        active.has("connectionSpacing"));
  _enable(w.spinConnectionElementSpacing, active.has("connectionElementSpacing"));
  _enable(w.spinNodeSizeByEdgeCount,    active.has("nodeSizeByEdgeCount"));

  // View size radios: enable/disable each option based on algorithm support.
  // The spinners/combo are controlled by _applyViewSizeMode, not directly here.
  _enable(w.radioViewSizeMaxWidth,    active.has("maxWidth"));
  _enable(w.radioViewSizeAspectRatio, active.has("aspectRatio"));
  // If the currently selected mode is no longer supported, fall back to None.
  const _vsMode = _getViewSizeMode(w);
  const _vsModeStillActive = _vsMode === "none"
    || (_vsMode === "maxWidth"    && active.has("maxWidth"))
    || (_vsMode === "aspectRatio" && active.has("aspectRatio"));
  if (!_vsModeStillActive && w.radioViewSizeNone) {
    w.radioViewSizeNone.setSelection(true);
    [w.radioViewSizeMaxWidth, w.radioViewSizeAspectRatio]
      .forEach(r => { if (r) r.setSelection(false); });
  }
  _applyViewSizeMode(ctx);

  // Filter routing options to what this algorithm supports
  if (w.cmbRouting && alg.supportedOptions && alg.supportedOptions.routing) {
    const supported = alg.supportedOptions.routing;
    const cur       = w.cmbRouting.getSelectionIndex();
    const curLabel  = cur >= 0 ? w.cmbRouting.getItem(cur) : "";
    w.cmbRouting.removeAll();
    supported.forEach(r => w.cmbRouting.add(r));
    const ni = supported.indexOf(curLabel);
    w.cmbRouting.select(ni >= 0 ? ni : 0);
    _comboTooltipSync(w.cmbRouting, ROUTING_TOOLTIPS);
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
    _comboTooltipSync(w.cmbLabelPosition, LABEL_POS_TOOLTIPS);
  }
}

function _getViewSizeMode(w) {
  if (w.radioViewSizeMaxWidth    && w.radioViewSizeMaxWidth.getSelection())    return "maxWidth";
  if (w.radioViewSizeAspectRatio && w.radioViewSizeAspectRatio.getSelection()) return "aspectRatio";
  return "none";
}

function _inferViewSizeMode(params, conflicts) {
  if (!conflicts || !params) return "none";
  for (const param of Object.keys(conflicts)) {
    if ((params[param] || 0) > 0) return param;
  }
  return "none";
}

function _applyViewSizeMode(ctx) {
  const w    = ctx.widgets;
  const mode = _getViewSizeMode(w);
  _enable(w.spinMaxWidth,   mode === "maxWidth");
  _enable(w.cmbAspectRatio, mode === "aspectRatio");
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function _comboSelect(combo, items, value) {
  if (!combo) return;
  const idx = items.indexOf(value);
  combo.select(idx >= 0 ? idx : 0);
}

function _comboTooltipSync(combo, tooltipMap) {
  if (!combo) return;
  const idx = combo.getSelectionIndex();
  const tip = idx >= 0 ? tooltipMap[combo.getItem(idx)] : null;
  if (tip) combo.setToolTipText(tip);
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

function _addSpinnerRow(parent, label, key, defVal, min, max, step, w, tooltip) {
  new LabelWidget(parent, SWT.NONE).setText(label);
  const sp = new SpinnerWidget(parent, SWT.BORDER);
  sp.setValues(defVal, min, max, 0, step, step * 5);
  GridDataFactory.swtDefaults().hint(65, SWT.DEFAULT).applyTo(sp);
  if (tooltip) sp.setToolTipText(tooltip);
  w[key] = sp;
}

// Merge a loaded preset onto ctx.config, but preserve current session values
// for params that are INACTIVE in the new algorithm. Greyed-in-UI params keep
// their values across preset switches; the engine ignores them via activeParams.
function _mergePreset(ctx, validated) {
  const oldParams = ctx.config.params ? Object.assign({}, ctx.config.params) : {};
  const newAlg    = validated.algorithm;
  const activeSet = new Set((ALGORITHMS[newAlg] && ALGORITHMS[newAlg].activeParams) || []);

  Object.assign(ctx.config, validated);

  if (ctx.config.params) {
    Object.keys(oldParams).forEach(key => {
      if (!activeSet.has(key)) ctx.config.params[key] = oldParams[key];
    });
  }
}

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
