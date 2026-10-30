/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Preset row — tree picker (loads on pick) · * modified · Save · Save As… | Rename… · Delete; description
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
const Common = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../hidden_properties")} */
const HiddenProps = require(REPO_ROOT + "View/lib/hidden_properties");
/** @type {typeof import("../preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("../generate_view")} */
const GenView = require(REPO_ROOT + "View/lib/generate_view");
/** @type {typeof import("../selection_pipeline")} */
const Pipeline = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("../selection_read")} */
const SelectionRead = require(REPO_ROOT + "View/lib/selection_read");
/** @type {typeof import("./counts")} */
const Counts = require(REPO_ROOT + "View/lib/gui/counts");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");
/** @type {typeof import("./tab_selection")} */
const TabSelection = require(REPO_ROOT + "View/lib/gui/tab_selection");
/** @type {typeof import("./tab_layout")} */
const TabLayout = require(REPO_ROOT + "View/lib/gui/tab_layout");
/** @type {typeof import("./tab_appearance")} */
const TabAppearance = require(REPO_ROOT + "View/lib/gui/tab_appearance");

// Loaded with this module, not on the first Save As click: console output from inside an SWT
// handler (as the module's "Loading …" line) blocks until this modal dialog closes.
/** @type {typeof import("./dialog_presets")} */
const PresetsDialog = require(REPO_ROOT + "View/lib/gui/dialog_presets");

const { ACTION, AR_OPTIONS, COLOR_RANGES, DEFAULT_PRESET } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const TextWidget              = Java.type("org.eclipse.swt.widgets.Text");
const TabFolderWidget         = Java.type("org.eclipse.swt.widgets.TabFolder");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

// Default dialog dimensions. Width: what the Appearance tab needs (_appearanceDialogWidth), so the
// dialog does not take a wide size from content hints; DEFAULT_DIALOG_WIDTH when it cannot be measured.
// Height: the monitor's usable height, at most DEFAULT_DIALOG_HEIGHT.
const DEFAULT_DIALOG_WIDTH  = 1000;
const DEFAULT_DIALOG_HEIGHT = 1800;   // Layout tab without scrolling

/**
 * Dialog width at which the Appearance tab shows whole: its page's natural width plus the frames
 * around it (area margins, tab folder, scrollbar, window).
 * @param {DialogContext} ctx
 * @param {Swt.Shell} shell
 * @returns {number}
 */
function _appearanceDialogWidth(ctx, shell) {
  try {
    const page = ctx.appearancePage.computeSize(SWT.DEFAULT, SWT.DEFAULT).x;
    const scrollbar = ctx.appearanceScrolled.getVerticalBar().getSize().x;
    const inTabs = ctx.widgets.tabFolder.computeTrim(0, 0, page + scrollbar, 0).width;
    const area = 2 * 8;   // createDialogArea margins
    const window = shell.computeTrim(0, 0, inTabs + area, 0).width;
    return Math.max(window, 0) || DEFAULT_DIALOG_WIDTH;
  } catch (e) { return DEFAULT_DIALOG_WIDTH; }
}

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
  const ctx = /** @type {DialogContext} */ ({ config, widgets: w, uiSelection, firstName: "", relBlocks: /** @type {StepBlock[]} */ ([]),
    recount: () => _updateFilteredCount(ctx), markModified: () => _markModified(ctx) });  // firstName set below

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
  ctx.firstObject = firstName ? `${Counts.typeToDisplay(firstType)}: ${firstName}` : "";

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
          const c    = Counts.countSelection(coll);
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
  ctx.visuals = SelectionRead.describeVisuals(selectedVisuals);
  ctx.relationsOf = SelectionRead.readRelationIndex();
  ctx.diagramBlocks = SelectionRead.readDiagramBlocks(uiSelection);

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
  PresetIO.ensureDefault();
  const defaultAtOpen = _presetName(ctx) === PresetIO.DEFAULT_PRESET_NAME;
  if (defaultAtOpen) PresetIO.logDefaultDifferences();

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
  // Expand view's content is read once, here: the selection is read before the dialog opens, and
  // the totals line composes from it on every change (Pipeline.composeObjectSet).
  ctx.expandSnapshot = target.onCanvas ? SelectionRead.readSelection(uiSelection, ACTION.EXPAND_VIEW.id) : null;

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

      TabSelection.buildSelectionTab(tabFolder, ctx, selectedCount, containingCount);
      TabLayout.buildLayoutTab(tabFolder, ctx);
      TabAppearance.buildAppearanceTab(tabFolder, ctx);
      _buildViewPropertiesTab(tabFolder, ctx);

      ctx.area = area;
      _buildActionArea(area, ctx, dlg, target);
      _syncToUI(ctx);
      _updateFilteredCount(ctx);  // populate the live counters on dialog open
      ctx._ready = true;          // enable modified indicator from here on
      let saved = null;
      try { saved = PresetIO.readPreset(_presetName(ctx)); } catch (e) {}  // preset file gone — nothing to compare with
      if (saved && Counts.differsFromSaved(saved, ctx.config)) _markModified(ctx);  // session changed since the last save

      tabFolder.setSelection(config._lastTabIndex || 0);
      // Fit the shown tab once the dialog is open, and every tab when it is selected.
      const fitTab = () => {
        const i = tabFolder.getSelectionIndex();
        /** @type {[Swt.ScrolledComposite, Swt.Composite][]} */
        const pairs = [[ctx.selectionScrolled, ctx.selectionPage], [ctx.layoutScrolled, ctx.layoutPage],
                       [ctx.appearanceScrolled, ctx.appearancePage]];
        if (pairs[i]) Widgets.resizeScrolled(pairs[i][0], pairs[i][1]);
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
      return new Point(_appearanceDialogWidth(ctx, dlg.getShell()), height);
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

  // Default picked in the dialog: its differences could not be logged there (console blocks)
  if (!defaultAtOpen && _presetName(ctx) === PresetIO.DEFAULT_PRESET_NAME) PresetIO.logDefaultDifferences();
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
 * The global filter's counts appear per condition in its type combos (AFTER the filter, BEFORE any blocks).
 * Each block's counter line shows the additions contributed by THAT block alone.
 * Block N's pruned output is block N+1's base (cumulative cascade).
 */

/**
 * The counts of the totals line, one string per sub-line: elements, relations, diagram ("" = the
 * sub-line is skipped). Hide-zero subfields. Uses the canonical vocabulary (AGENTS.md):
 * containers · nested elements · standalones · extra occurrences for the element role split;
 * nestings · connections for the relation form split; diagram objects for canvas-only objects.
 * "Relation" never appears in the counts (model-side term only). A count and its word are joined
 * by no-break spaces, so a wrapping label breaks only between fields.
 * @param {ViewCounts} view
 * @returns {string[]}
 */
function _totalsLines(view) {
  /** @type {(n: number, s: string, p: string) => string} */
  const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`.replace(/ /g, "\u00A0");

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

  // relations sub-line (never the word "relations" in the counts — model-layer term only)
  const relSub = [];
  if (view.nestings    > 0) relSub.push(plural(view.nestings,    "nesting",    "nestings"));
  if (view.connections > 0) relSub.push(plural(view.connections, "connection", "connections"));

  // diagram sub-line
  const diagramSub = [];
  if (view.diagramObjects     > 0) diagramSub.push(plural(view.diagramObjects,     "diagram object",     "diagram objects"));
  if (view.diagramConnections > 0) diagramSub.push(plural(view.diagramConnections, "diagram connection", "diagram connections"));

  return [elSub.join(" · "), relSub.join(" · "), diagramSub.join(" · ")];
}

/**
 * Show counts in a totals block: the title, and the sub-lines that have counts. No counts: the
 * title with "—".
 * @param {TotalsBlock} block
 * @param {string}      title  e.g. "On the generated view:"
 * @param {ViewCounts}  view
 */
function _setTotals(block, title, view) {
  const lines = _totalsLines(view);
  block.title.setText(lines.some(l => l) ? title : `${title} —`);
  block.rows.forEach((row, i) => {
    row.counts.setText(lines[i]);
    _showRow([row.sub, row.counts], !!lines[i]);
  });
}

/**
 * Show or hide labels that form one grid row; a hidden row takes no space.
 * @param {Swt.Label[]} labels
 * @param {boolean}     show
 */
function _showRow(labels, show) {
  for (const lbl of labels) {
    lbl.setVisible(show);
    lbl.getLayoutData().exclude = !show;
  }
}

/**
 * Recount after a change of the settings (Counts.dialogCounts) and show the counts: per condition in the
 * filter, step, nesting and reverse tables, each step's header and the totals line.
 * @param {DialogContext} ctx
 */
function _updateFilteredCount(ctx) {
  _markModified(ctx);
  const w = ctx.widgets;
  if (!w.tblElementConditions) return;  // Selection tab not built yet

  const objects = ctx.rawModelObjects;
  if (!objects || !objects.length) {
    (ctx.relBlocks || []).forEach(b => _setStepAdds(b, 0, 0));
    ctx.predicted = null;
    TabAppearance.updateStyleWarnings(ctx);
    return;
  }

  try {
    _showCounts(ctx, Counts.dialogCounts(_countInput(ctx, objects)));
  } catch (e) {
    (ctx.relBlocks || []).forEach(b => _setStepAdds(b, 0, 0));
  }
  TabAppearance.updateStyleWarnings(ctx);
}

/**
 * What the counts are computed from: the selection read before the dialog opened and the conditions
 * in the tables built so far.
 * @param {DialogContext} ctx
 * @param {ArchiObject[]} objects  the selection expanded (rawModelObjects)
 * @returns {DialogCountInput}
 */
function _countInput(ctx, objects) {
  const w = ctx.widgets;
  return {
    objects,
    filter: {
      elementConditions:  w.tblElementConditions  ? w.tblElementConditions.getConditions()  : [],
      diagramConditions:  w.tblDiagramConditions  ? w.tblDiagramConditions.getConditions()  : [],
      relationConditions: w.tblRelationConditions ? w.tblRelationConditions.getConditions() : [],
    },
    filterTables: {
      element:  w.tblElementConditions  ? w.tblElementConditions.displayedConditions()  : [],
      diagram:  w.tblDiagramConditions  ? w.tblDiagramConditions.displayedConditions()  : [],
      relation: w.tblRelationConditions ? w.tblRelationConditions.displayedConditions() : [],
    },
    steps: (ctx.relBlocks || []).map(b => ({
      step: { name: b.name, repeat: b.getRepeat(), conditions: b.table.getConditions() }, displayedConditions: b.table.displayedConditions(), cache: b.countCache,
    })),
    params: {
      nestingConditions: w.tblNestingConditions ? w.tblNestingConditions.getConditions() : [],
      reverseConditions: w.tblReverseConditions ? w.tblReverseConditions.getConditions() : [],
    },
    layoutConditions: w.tblNestingConditions && w.tblReverseConditions
      ? { nesting: w.tblNestingConditions.displayedConditions(), reverse: w.tblReverseConditions.displayedConditions() }
      : null,
    diagramBlockOf: ctx.diagramBlocks ? ctx.diagramBlocks.diagramBlockOf : new Map(),
    blockContents: ctx.diagramBlocks ? ctx.diagramBlocks.blockContents : new Map(),
    sourceVisualElements: ctx.diagramBlocks ? ctx.diagramBlocks.sourceVisualElements : [],
    relationsOf: ctx.relationsOf,
    visuals: ctx.visuals,
    expandSnapshot: ctx.expandSnapshot || null,
  };
}

/**
 * Show the counts on the widgets.
 * @param {DialogContext} ctx
 * @param {DialogCounts}  counts
 */
function _showCounts(ctx, counts) {
  const w = ctx.widgets;
  // Global filter counters, per condition in its type combo.
  if (w.tblElementConditions)  w.tblElementConditions.setCounts(counts.filterConditions.element);
  if (w.tblDiagramConditions)  w.tblDiagramConditions.setCounts(counts.filterConditions.diagram);
  if (w.tblRelationConditions) w.tblRelationConditions.setCounts(counts.filterConditions.relation);

  (ctx.relBlocks || []).forEach((b, i) => {
    const s = counts.steps[i];
    // Candidates: everything the step saw before its conditions — the conditions' property lists.
    b.candidates = s.candidates;
    b.table.refreshItems();
    b.table.setCounts(s.conditionCounts);
    const runInfo = b.getRepeat() !== Defs.REPEAT_UNTIL_NOTHING_NEW ? ""
      : s.capped ? `  (stopped at max ${Defs.REPEAT_MAX}×)` : `  (nothing new after ${s.runs}×)`;
    _setStepAdds(b, s.elements, s.relations, runInfo);
  });
  // What the view will hold — Appearance uses it for property lists and the ⚠ conflict check.
  ctx.predicted = counts.predicted;
  if (counts.layoutConditions) TabLayout.updateLayoutConditionCounts(ctx, counts.predicted.relations, counts.layoutConditions);

  // The totals line (always visible, multi-line, hide-zero per the canonical vocabulary).
  if (w.viewTotals) {
    try {
      _setTotals(w.viewTotals, "On the generated view:", counts.view);
      if (counts.expandView) _setTotals(w.expandTotals, "On the expanded view:", counts.expandView);
      if (ctx.area) ctx.area.layout(true, true);  // the line count may change
    } catch (e) {}
  }
}

/**
 * A step header's summary of what the step adds.
 * @param {StepBlock} b
 * @param {number} eCount
 * @param {number} rCount
 * @param {string} [suffix]
 */
function _setStepAdds(b, eCount, rCount, suffix) {
  if (!b || !b.lblBlockCounts) return;
  const cnt = { elems: eCount, rels: rCount, diagrams: 0, views: 0, folders: 0 };
  b.addsText = Counts.formatCountsBody(cnt) + (suffix || "");
  TabSelection.refreshBlockHeader(b);
}

// ── Properties tab ────────────────────────────────────────────────────────────

/**
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function _buildViewPropertiesTab(tabFolder, ctx) {
  const { page, finish } = Widgets.scrolledTab(tabFolder, "Properties");
  const w = ctx.widgets;
  const onChange = () => _markModified(ctx);

  const descLbl = new LabelWidget(page, SWT.WRAP);
  descLbl.setText("Set properties of the generated view(s): a ticked row is written, an unticked row is removed from the view");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(descLbl);

  // ── Object ID ──────────────────────────────────────────────────────────────
  const grpObjId = Widgets.group(page, "Object ID", 1);

  const chkObjId = Widgets.checkBox(grpObjId, "Add unique Object ID");
  chkObjId.setToolTipText("Writes a new UUID as the \"Object ID\" property.\nSkipped if the view already has one.");
  chkObjId.addListener(SWT.Selection, onChange);
  w.vpAddObjectId = chkObjId;

  const objIdNote = new LabelWidget(grpObjId, SWT.NONE);
  objIdNote.setText("Leaves existing Object ID unchanged");
  GridDataFactory.fillDefaults().indent(18, 0).applyTo(objIdNote);

  // ── View properties grid ───────────────────────────────────────────────────
  const grpViewProps = Widgets.group(page, "View properties", 3);

  // Collect all properties from all model views, except the hidden ones
  /** @type {Map<string, Set<string>>} */
  const allViewProps = new Map();  // key → Set<value>
  const hidden = HiddenProps.hiddenKeys();
  try {
    $("archimate-diagram-model").each(v => {
      const keys = v.prop() || [];
      if (!Array.isArray(keys)) return;
      keys.forEach(k => {
        if (!k || hidden.has(k)) return;
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
    const chk = Widgets.checkBox(grpViewProps, "");
    GridDataFactory.swtDefaults().applyTo(chk.control);

    // col 2: property name label
    const lbl = new LabelWidget(grpViewProps, SWT.NONE);
    lbl.setText(key);
    GridDataFactory.fillDefaults().applyTo(lbl);

    // col 3: editable combo with known values
    const cmb = new ComboWidget(grpViewProps, SWT.DROP_DOWN);
    GridDataFactory.fillDefaults().grab(true, false).hint(180, SWT.DEFAULT).applyTo(cmb);
    Array.from(/** @type {Set<string>} */ (allViewProps.get(key))).sort().forEach(v => cmb.add(v));
    Widgets.enable(cmb, false);  // greyed until checkbox is ticked

    chk.addListener(SWT.Selection, () => { Widgets.enable(cmb, chk.getSelection()); onChange(); });
    cmb.addListener(SWT.Modify, onChange);

    rows.push({ key, chk, cmb });
  });

  w.vpRows = rows;
  finish();
}

// ── Action row (below preset) ─────────────────────────────────────────────────

// Save the settings, remember the action and close; generate_view runs after dlg.open() returns.
/**
 * @param {string} actionId
 * @param {JFace.TitleAreaDialog} dlg
 * @param {DialogContext} ctx
 */
function _runAction(actionId, dlg, ctx) {
  _saveUI(ctx);
  const nextOrder = _cycleAlgorithmStart(ctx.config.params, actionId);
  _persistSession(ctx, nextOrder ? { algorithmStart: nextOrder } : {});
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
function _cycleAlgorithmStart(params, actionId) {
  if (!params.cycleAlgorithmStart) return null;
  const creates = actionId === ACTION.NEW_VIEW.id || actionId === ACTION.ONE_EACH.id;
  if (creates) params.algorithmStart = TabLayout.ALGORITHM_START_LABELS[0];
  const i = TabLayout.ALGORITHM_START_LABELS.indexOf(params.algorithmStart);
  return TabLayout.ALGORITHM_START_LABELS[(i + 1) % TabLayout.ALGORITHM_START_LABELS.length];
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


/**
 * The totals line: one totals block above each action group, in two equal columns. The counts wrap:
 * on resize each block's width hint becomes its column's width, so a column never asks for more
 * than its share (a hint that followed the block's own width pushed the other column out).
 * @param {Swt.Composite} area
 * @param {{ name: string, onCanvas: boolean }} target  the view Modify works on
 * @returns {{ viewTotals: TotalsBlock, expandTotals: TotalsBlock }}
 */
function _buildTotalsRow(area, target) {
  const SPACING = 8;
  const totalsRow = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(totalsRow);
  GridLayoutFactory.fillDefaults().numColumns(2).equalWidth(true).margins(0, 2).spacing(SPACING, 6).applyTo(totalsRow);
  const viewTotals = _totalsBlock(totalsRow, "On the generated view: —",
    "What the current settings put on a new view:\n" +
    "containers, nested elements, standalones, extra occurrences (Show in every container),\n" +
    "nestings (box in box), connections (lines) and diagram objects.");
  const expandTotals = _totalsBlock(totalsRow, target.onCanvas ? "On the expanded view: —" : "",
    "What Expand view puts on the selected view:\n" +
    "everything on it, plus the elements and relations the steps add from the selected elements.\n" +
    "The filter does not apply.");
  let fitted = 0;
  totalsRow.addListener(SWT.Resize, () => {
    try {
      const column = Math.floor((totalsRow.getClientArea().width - SPACING) / 2);
      if (column <= 50 || column === fitted) return;
      fitted = column;
      viewTotals.fit(column);
      expandTotals.fit(column);
      // Outside the running layout: the blocks' heights changed.
      totalsRow.getDisplay().asyncExec(() => { if (!totalsRow.isDisposed()) area.layout(true, true); });
    } catch (e) {}
  });
  return { viewTotals, expandTotals };
}

/**
 * One column of the totals line: the title over a grid of sub-lines, each its label and its counts.
 * The counts wrap, so a long sub-line continues under its counts. Sub-lines are hidden until
 * _setTotals fills them.
 * @param {Swt.Composite} parent
 * @param {string}        title
 * @param {string}        tooltip
 * @returns {TotalsBlock}
 */
function _totalsBlock(parent, title, tooltip) {
  const BLOCK_INDENT = 6, INDENT = 12, GAP = 6;
  const block = new CompositeWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).align(SWT.FILL, SWT.BEGINNING).indent(BLOCK_INDENT, 4).hint(200, SWT.DEFAULT).applyTo(block);
  GridLayoutFactory.fillDefaults().numColumns(2).spacing(GAP, 0).applyTo(block);
  const titleLbl = new LabelWidget(block, SWT.NONE);
  titleLbl.setText(title);
  GridDataFactory.fillDefaults().span(2, 1).applyTo(titleLbl);
  const rows = ["elements:", "relations:", "diagram:"].map(text => {
    const sub = new LabelWidget(block, SWT.NONE);
    sub.setText(text);
    GridDataFactory.fillDefaults().indent(INDENT, 0).applyTo(sub);
    const counts = new LabelWidget(block, SWT.WRAP);
    GridDataFactory.fillDefaults().grab(true, false).hint(100, SWT.DEFAULT).applyTo(counts);
    _showRow([sub, counts], false);
    return { sub, counts };
  });
  for (const lbl of [titleLbl, ...rows.flatMap(r => [r.sub, r.counts])]) lbl.setToolTipText(tooltip);
  /** @param {number} column */
  const fit = column => {
    const width = column - BLOCK_INDENT;
    const subWidth = Math.max(...rows.map(r => r.sub.computeSize(SWT.DEFAULT, SWT.DEFAULT).x)) + INDENT;
    block.getLayoutData().widthHint = width;
    for (const r of rows) r.counts.getLayoutData().widthHint = Math.max(50, width - subWidth - GAP);
  };
  return { title: titleLbl, rows, fit };
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

  // Always-visible totals: what the current settings put on a view, each above its action group:
  // Create left, Expand view right (Layout only writes what is on the view: Current selection).
  // Sub-lines for elements / relations / diagram objects (see _totalsLines).
  // Same columns as the action row below, so each line starts at its group.
  const totals = _buildTotalsRow(area, target);
  w.viewTotals   = totals.viewTotals;
  w.expandTotals = totals.expandTotals;

  // 2 columns: Create | Modify, Cancel below Modify. Both groups have the same rows
  // (one field row, one button row), so fields and buttons line up.
  const row = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(2).equalWidth(true).margins(0, 2).spacing(8, 6).applyTo(row);

  // ── Create new view ──
  const grpCreate = Widgets.group(row, "Create new view", 4, { grabV: true, bold: false });

  new LabelWidget(grpCreate, SWT.NONE).setText("Folder:");
  w.txtViewFolder = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewFolder.setToolTipText(`Folder under Views, e.g. /_Generated/Project.\nEmpty = ${Defs.GENERATED_VIEW_FOLDER}.`);
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewFolder);
  w.txtViewFolder.addListener(SWT.Modify, () => _markModified(ctx));

  new LabelWidget(grpCreate, SWT.NONE).setText("Name:");
  w.txtViewName = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewName.setToolTipText("Name of the new view, pre-filled with the first selected object.\nA view with this name in the folder is overwritten.");
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewName);

  w.btnNewView = _actionBtn(grpCreate, "New view",      () => _runAction(ACTION.NEW_VIEW.id, dlg, ctx));
  w.btnOneEach = _actionBtn(grpCreate, "One view each", () => _runAction(ACTION.ONE_EACH.id, dlg, ctx));
  GridDataFactory.fillDefaults().grab(true, false).span(2, 1).applyTo(w.btnNewView);
  GridDataFactory.fillDefaults().grab(true, false).span(2, 1).applyTo(w.btnOneEach);
  w.btnNewView.setToolTipText(ACTION.NEW_VIEW.tooltip);
  w.btnOneEach.setToolTipText(ACTION.ONE_EACH.tooltip + "\nName is not used.");

  // ── Modify view ──
  const grpModify = Widgets.group(row, "Modify selected view", 2, { grabV: true, bold: false });
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
  if (targetViewName) { const f = Widgets.getBoldFont(); if (f) try { lblTarget.setFont(f); } catch (e) {} }

  w.btnExpandView = _actionBtn(grpModify, "Expand view", () => _runAction(ACTION.EXPAND_VIEW.id, dlg, ctx));
  w.btnLayoutOnly = _actionBtn(grpModify, "Layout only", () => _runAction(ACTION.LAYOUT_ONLY.id, dlg, ctx));
  w.btnExpandView.setToolTipText(ACTION.EXPAND_VIEW.tooltip);
  w.btnLayoutOnly.setToolTipText(ACTION.LAYOUT_ONLY.tooltip);
  w.btnExpandView.setEnabled(target.onCanvas);
  w.btnLayoutOnly.setEnabled(!!targetViewName);

  // ── Cancel: bottom right, under Modify, as wide as one of its buttons ──
  new LabelWidget(row, SWT.NONE);
  const cancelRow = new CompositeWidget(row, SWT.NONE);
  // margins / spacing as Widgets.group's defaults, so the columns match the Modify group's buttons
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

const SAVE_TIP    = "Overwrite this preset with the current settings.";
const RENAME_TIP  = "Rename or move the saved preset, or change its description.\nUnsaved changes are kept in the dialog, not written.";
const DELETE_TIP  = "Delete the saved preset and load Default.";
const DEFAULT_TIP = "Default is read-only: Save As… saves the settings as a new preset.";

// Row 1: Preset [picker] *  Save  Save As…  |  Rename…  Delete      Row 2: the preset's description.
// Save / Save As write the current settings; Rename / Delete act on the saved file only.
// Default is read-only here: Save, Rename and Delete are off for it.
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

  w.pickPreset = Widgets.treePicker(row, {
    items:   () => PresetIO.listPresets(),
    first:   [PresetIO.DEFAULT_PRESET_NAME],
    tooltip: "Choosing a preset loads all its settings.\nType in the filter to find a preset by name or folder.",
    onChange: name => _loadPreset(ctx, name),
  });
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(w.pickPreset.button);

  // Modified indicator — shown while the settings differ from the saved preset
  const lblModified = new LabelWidget(row, SWT.NONE);
  lblModified.setText("*");
  lblModified.setToolTipText("Unsaved changes.\nSave overwrites this preset; Save As… creates a new one.");
  lblModified.setVisible(false);
  w.lblModified = lblModified;

  w.btnSave = Widgets.pushBtn(row, "Save", SAVE_TIP, () => {
    _saveUI(ctx);
    PresetIO.writePreset(_presetName(ctx), ctx.config, { quiet: true });
    _afterPresetChange(ctx);
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnSave);

  const btnSaveAs = Widgets.pushBtn(row, "Save As…", "Save the current settings as a new preset.", () => {
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

  w.btnRename = Widgets.pushBtn(row, "Rename…", RENAME_TIP, () => {
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

  w.btnDelete = Widgets.pushBtn(row, "Delete", DELETE_TIP, () => {
    const name = _presetName(ctx);
    if (name === PresetIO.DEFAULT_PRESET_NAME) return;
    if (!_confirm(ctx, "Delete preset", `Delete preset "${name}"?`)) return;
    try {
      PresetIO.deletePreset(name);
      _loadPreset(ctx, PresetIO.DEFAULT_PRESET_NAME);
    } catch (e) { console.error("Delete failed: " + e); }
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnDelete);

  // Row 2: description of the preset (hidden when empty), aligned under the picker.
  new LabelWidget(row, SWT.NONE);
  w.lblPresetDescription = new LabelWidget(row, SWT.WRAP);
  try { w.lblPresetDescription.setForeground(row.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (x) {}
  GridDataFactory.fillDefaults().grab(true, false).span(7, 1).hint(300, SWT.DEFAULT).applyTo(w.lblPresetDescription);

  _afterPresetChange(ctx, { keepModified: true });
}

/** @param {DialogContext} ctx */
function _presetName(ctx) {
  return ctx.config.name || PresetIO.DEFAULT_PRESET_NAME;
}

// Load a saved preset into the dialog (all settings), as when it is picked in the preset picker.
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

// Refresh the preset row after a load / save / rename / delete: the chosen preset,
// description line, Rename/Delete state (not for Default) and the modified indicator.
/**
 * @param {DialogContext} ctx
 * @param {{ keepModified?: boolean }} [opts]
 */
function _afterPresetChange(ctx, opts) {
  const w    = ctx.widgets;
  const name = _presetName(ctx);
  w.pickPreset.set(name);
  const isDefault = name === PresetIO.DEFAULT_PRESET_NAME;
  /** @type {[Swt.Button, string][]} */
  const fileButtons = [[w.btnSave, SAVE_TIP], [w.btnRename, RENAME_TIP], [w.btnDelete, DELETE_TIP]];
  for (const [btn, tip] of fileButtons) {
    btn.setEnabled(!isDefault);
    btn.setToolTipText(isDefault ? DEFAULT_TIP : tip);
  }

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
    reservedNames:      [PresetIO.DEFAULT_PRESET_NAME],
    onConfirm(newName, description) {
      if (newName !== current && PresetIO.listPresets().includes(newName)
          && !_confirm(ctx, "Overwrite preset", `Preset "${newName}" already exists. Overwrite it?`)) return;
      onConfirm(newName, description);
    },
  });
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
  for (const [key, def] of Object.entries(TabLayout.PARAM_WIDGETS)) _paramToWidget(w[def.w], def, /** @type {Record<string, unknown>} */ (p)[key]);   // Cast: key is a params key
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

  // Filter condition tables
  const flt = c.filter;
  if (w.tblElementConditions)  w.tblElementConditions.setConditions(flt.elementConditions);
  if (w.tblDiagramConditions)  w.tblDiagramConditions.setConditions(flt.diagramConditions);
  if (w.tblRelationConditions) w.tblRelationConditions.setConditions(flt.relationConditions);

  // Related elements — rebuild step blocks from preset.
  // Dispose existing blocks first so reapplying a preset (or session load) is clean.
  if (ctx.relBlocks && ctx.widgets.blocksContainer) {
    while (ctx.relBlocks.length > 0) {
      const b = ctx.relBlocks[0];
      try { b.container.dispose(); } catch (e) {}
      ctx.relBlocks.shift();
    }
    const steps = (c.relatedElements && c.relatedElements.steps) || [];
    steps.forEach(step => TabSelection.addRelatedBlock(ctx, step));
    Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  }

  // View name: always pre-fill from the first selected object (captured in open()).
  const viewName  = (ctx && ctx.firstName) || (c.view && c.view.name) || "";
  if (w.txtViewName)   w.txtViewName.setText(viewName);
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder) || Defs.GENERATED_VIEW_FOLDER);

  TabLayout.updateAlgorithmControls(ctx);

  // Appearance tab
  const app  = c.appearance;
  const DA   = DEFAULT_PRESET.appearance;

  const sbp  = app.styleByProperty;
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;

  // Palette: a name that is not in _palettes.json shows as None.
  if (w.cmbPalette) {
    const idx = ctx.palettes.findIndex(p => p.name === app.palette);
    if (app.palette && idx < 0) console.error(`Appearance: palette "${app.palette}" is not in _palettes.json; None is shown. Choose a palette.`);
    w.cmbPalette.select(idx + 1);
  }

  // Style by property — conditions, mixed-values colour, line width
  if (w.tblStyleConditions) w.tblStyleConditions.setConditions(sbp.conditions);
  if (w.pickMixedColor) w.pickMixedColor.set(sbp.mixedValuesColor || DA.styleByProperty.mixedValuesColor);
  if (w.cmbStyleLineWidth) w.cmbStyleLineWidth.select(Math.max(0, Math.min(3, sbp.lineWidth || 0)));

  // Feature 4 — Style by nesting level
  if (w.tblNestingStyleConditions) w.tblNestingStyleConditions.setConditions(nl.conditions);
  if (w.chkNestFont)        w.chkNestFont.setSelection(!!(nl.fontEnabled));
  if (w.spinNestFontDecrease) w.spinNestFontDecrease.setSelection(nl.fontDecreasePerLevel !== undefined ? nl.fontDecreasePerLevel : DA.nestingLevel.fontDecreasePerLevel);
  if (w.chkNestColor)       w.chkNestColor.setSelection(!!(nl.colorEnabled));
  if (w.spinNestDarken)     w.spinNestDarken.setSelection(nl.darkenStart);
  if (w.spinNestLighten)     w.spinNestLighten.setSelection(nl.lightenPerLevel !== undefined ? nl.lightenPerLevel : DA.nestingLevel.lightenPerLevel);

  // Feature 5 — Highlight repeated elements
  if (w.chkHighlightRep)       w.chkHighlightRep.setSelection(!!(hr.enabled));
  if (w.pickHighlightRepRange) w.pickHighlightRepRange.set(COLOR_RANGES.includes(hr.colorRange) ? hr.colorRange : DA.highlightRepeated.colorRange);

  TabAppearance.updateNestingLevelState(ctx);
  TabAppearance.updateAppearancePropStates(ctx);

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
      Widgets.enable(row.cmb, enabled);
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
  if (w.algRadios) c.algorithm = TabLayout.selectedAlgorithm(w);
  for (const [key, def] of Object.entries(TabLayout.PARAM_WIDGETS)) {
    const ctrl = w[def.w];
    if (ctrl) /** @type {Record<string, unknown>} */ (c.params)[key] = _paramFromWidget(ctrl, def);   // Cast: key is a params key
  }
  if (w.spinMaxWidth)         c.params.maxWidth = w.spinMaxWidth.getSelection();
  const arIdx = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  c.params.aspectRatio  = AR_OPTIONS[Math.max(0, arIdx)].val;
  c.params.viewSizeMode = TabLayout.getViewSizeMode(w);

  // Filter
  c.filter = {
    elementConditions:  w.tblElementConditions  ? w.tblElementConditions.getConditions()  : [],
    diagramConditions:  w.tblDiagramConditions  ? w.tblDiagramConditions.getConditions()  : [],
    relationConditions: w.tblRelationConditions ? w.tblRelationConditions.getConditions() : [],
  };

  // Related elements — round-trip the dynamic step-block array.
  c.relatedElements = {
    steps: (ctx.relBlocks || []).map(b => ({ name: b.name, repeat: b.getRepeat(), conditions: b.table.getConditions() })),
  };

  // View
  if (w.txtViewName)   c.view.name   = w.txtViewName.getText().trim();
  if (w.txtViewFolder) c.view.folder = w.txtViewFolder.getText().trim();

  // Appearance
  if (w.cmbPalette) c.appearance.palette = w.cmbPalette.getSelectionIndex() > 0 ? ctx.palettes[w.cmbPalette.getSelectionIndex() - 1].name : "";

  // Style by property
  c.appearance.styleByProperty = {
    conditions:            w.tblStyleConditions ? w.tblStyleConditions.getConditions() : [],
    mixedValuesColor: w.pickMixedColor ? w.pickMixedColor.get() : DEFAULT_PRESET.appearance.styleByProperty.mixedValuesColor,
    lineWidth:        w.cmbStyleLineWidth ? Math.max(0, w.cmbStyleLineWidth.getSelectionIndex()) : 0,
  };

  // Feature 4 — Style by nesting level
  if (w.tblNestingStyleConditions) c.appearance.nestingLevel.conditions = w.tblNestingStyleConditions.getConditions();
  c.appearance.nestingLevel.fontEnabled         = !!(w.chkNestFont  && w.chkNestFont.getSelection());
  c.appearance.nestingLevel.fontDecreasePerLevel = w.spinNestFontDecrease ? w.spinNestFontDecrease.getSelection() : 2;
  c.appearance.nestingLevel.colorEnabled        = !!(w.chkNestColor && w.chkNestColor.getSelection());
  c.appearance.nestingLevel.darkenStart         = w.spinNestDarken ? w.spinNestDarken.getSelection() : DEFAULT_PRESET.appearance.nestingLevel.darkenStart;
  c.appearance.nestingLevel.lightenPerLevel      = w.spinNestLighten ? w.spinNestLighten.getSelection() : 15;

  // Feature 5 — Highlight repeated elements
  c.appearance.highlightRepeated.enabled    = !!(w.chkHighlightRep && w.chkHighlightRep.getSelection());
  c.appearance.highlightRepeated.colorRange = w.pickHighlightRepRange ? w.pickHighlightRepRange.get() : DEFAULT_PRESET.appearance.highlightRepeated.colorRange;

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
    case "conditions": ctrl.setConditions(value); break;
    case "combo": {
      // The value may be outside the current (algorithm-filtered) items: add it so it survives
      // until TabLayout.updateAlgorithmControls sets the items for the newly selected algorithm.
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
    case "conditions":    return ctrl.getConditions();
    case "combo":    return String(ctrl.getText());
  }
}

// ── Small helpers ─────────────────────────────────────────────────────────────

/**
 * @param {Swt.Spinner} spinner
 * @param {number} value
 */
function _spinSet(spinner, value) {
  if (spinner) spinner.setSelection(value);
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
