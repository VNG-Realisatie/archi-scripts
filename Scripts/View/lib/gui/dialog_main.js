/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Preset row — tree picker (loads on pick) · * modified · Save · Save As… | Rename… · Delete; description (preset_row.js)
 *   Tabs       — Selection · Layout · Appearance · Properties (tab_selection.js, tab_layout.js, tab_appearance.js, tab_properties.js)
 *   Actions    — Create new view (New view, One view each; Folder, Name; what it writes) ·
 *                Modify selected view (Expand view, Layout only; View; what it writes); Run and Cancel below
 */
console.log("Loading dialog_main.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../../../_lib/Common")} */
const Common = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");
/** @type {typeof import("../../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("../preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("../generate_view")} */
const GenView = require(REPO_ROOT + "View/lib/generate_view");
/** @type {typeof import("../run_preset")} */
const RunPreset = require(REPO_ROOT + "View/lib/run_preset");
/** @type {typeof import("../view_origin")} */
const ViewOrigin = require(REPO_ROOT + "View/lib/view_origin");
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

/** @type {typeof import("./tab_properties")} */
const TabProperties = require(REPO_ROOT + "View/lib/gui/tab_properties");
/** @type {typeof import("./preset_row")} */
const PresetRow = require(REPO_ROOT + "View/lib/gui/preset_row");

const { ACTION, AR_OPTIONS, DEFAULT_PRESET } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
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
  const page = ctx.appearancePage.computeSize(SWT.DEFAULT, SWT.DEFAULT).x;
  const scrollbar = ctx.appearanceScrolled.getVerticalBar().getSize().x;
  const inTabs = ctx.widgets.tabFolder.computeTrim(0, 0, page + scrollbar, 0).width;
  const area = 2 * 8;   // createDialogArea margins
  const window = shell.computeTrim(0, 0, inTabs + area, 0).width;
  return Math.max(window, 0) || DEFAULT_DIALOG_WIDTH;
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
    recount: () => _updateFilteredCount(ctx), markModified: () => PresetRow.markModified(ctx),
    saveUI: () => _saveUI(ctx), syncToUI: () => _syncToUI(ctx), refreshAction: () => _refreshAction(ctx) });  // firstName set below

  // Compute selection counts before the dialog opens.
  // Raw count: what the user had selected in the UI.
  const selectedCount = { elems: 0, rels: 0, views: 0, folders: 0, diagrams: 0 };
  let firstName = "";
  let firstType = "";
  uiSelection.each(o => {
    const t = o.type || "";
    if (!firstName && o.name) { firstName = o.name; firstType = t; }
    if      (t === "archimate-diagram-model")  selectedCount.views++;
    else if (t.endsWith("-relationship"))      selectedCount.rels++;
    else if (t === "folder")                   selectedCount.folders++;
    else if (t.startsWith("diagram-model-"))   selectedCount.diagrams++;
    else                                       selectedCount.elems++;
  });
  ctx.firstName = firstName;  // propagate for _syncToUI pre-fill
  ctx.holdsView = selectedCount.views > 0;
  ctx.mirrors = SelectionRead.holdsFolderOrView(uiSelection);
  if (selectedCount.views === 1 && uiSelection.size() === 1) {
    ctx.selectedView = /** @type {ArchimateView} */ (uiSelection.first());   // Cast: counted as a view
    ctx.viewFolder = ArchiFolders.printFolderPath(ctx.selectedView).replace(/^\/Views/, "").replace(/(.)\/$/, "$1");
  }
  ctx.firstObject = firstName ? `${Counts.typeToDisplay(firstType)}: ${firstName}` : "";

  // Expanded count: what is contained in the selection (folders expand, views expand to their elements).
  // When a view (archimate-diagram-model) is selected, $(view).find() enumerates visual objects.
  // $(view).children() returns nothing useful from the model tree — find() is the correct API.
  const containingCount = { elems: 0, rels: 0, diagrams: 0, views: 0, folders: 0 };
  uiSelection.each(o => {
    const t = o.type || "";
    if (t === "archimate-diagram-model" && !o.view) {
      // Model-tree view: count its model elements, relations, and diagram objects
      // Skip ArchimateView concepts — view-reference VOs appear in find("element") with
      // .concept pointing to the referenced view; count them as diagram objects instead.
      $(o).find("element").each(ve => {
        if (ve.concept && (ve.concept.type || "") !== "archimate-diagram-model") containingCount.elems++;
      });
      $(o).find("relation").each(() => containingCount.rels++);
      Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => { containingCount.diagrams += SelectionRead.findDiagramObjects(o, dt).length; });
    } else if (o.view || t === "folder") {
      // Canvas VO (may be a container nesting child VOs) or a model-tree folder.
      // Selection.getSelection now handles both: walks $(obj).children() recursively,
      // extracting concepts from canvas VOs and diagram objects.
      const coll = Selection.getSelection($(o), "*");
      const c    = Counts.countSelection(coll);
      containingCount.elems    += c.elems;
      containingCount.rels     += c.rels;
      containingCount.diagrams += c.diagrams;
      containingCount.views    += c.views;
      containingCount.folders  += c.folders;
    } else if (t.endsWith("-relationship")) {
      containingCount.rels++;
    } else if (t.startsWith("diagram-model-")) {
      containingCount.diagrams++;
    } else if (t !== "archimate-diagram-model") {
      containingCount.elems++;
    }
  });
  ctx.containingCount = containingCount;

  // Collect flat array of model objects for live filter statistics.
  // Used by _updateFilteredCount to recount after filter changes.
  /** @type {ArchiObject[]} */
  const rawModelObjects = [];
  /** @type {DiagramObject[]} */
  const selectedVisuals = [];   // visual elements in the selection: one-parent choice and pairing (describeVisuals)
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
      $(o).find("element").each(ve => {
        if (ve.concept && (ve.concept.type || "") !== "archimate-diagram-model") { add(ve.concept); selectedVisuals.push(/** @type {VisualObject} */ (ve)); }   // Cast: on a view, "element" selects visuals
      });
      $(o).find("relation").each(vr => { if (vr.concept) add(vr.concept); });
      Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
        SelectionRead.findDiagramObjects(o, dt).forEach(dvo => { if (dvo && dvo.id) add(dvo); });
      });
    } else if (o.view || t === "folder") {
      // Canvas VO (may be a container) or model-tree folder.
      // Selection.getSelection recurses via $(obj).children() and extracts
      // concepts from canvas VOs and diagram objects in one pass.
      Selection.getSelection($(o), "*").each(add);
      if (o.view && o.concept) selectedVisuals.push(o);
    } else {
      add(o);
    }
  });
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
        elements: selectedCount.elems, relations: selectedCount.rels,
        views: selectedCount.views, diagramObjects: selectedCount.diagrams, folders: selectedCount.folders },
      { label: "Containing:", elements: containingCount.elems, relations: containingCount.rels, diagramObjects: containingCount.diagrams },
      { label: "Filtered:  ", elements: _lEl, relations: _lRel, diagramObjects: _lDiag },
    ]);
  }
  PresetIO.ensureDefault();
  const defaultAtOpen = PresetRow.presetName(ctx) === PresetIO.DEFAULT_PRESET_NAME;
  if (defaultAtOpen) PresetIO.logDefaultDifferences();

  // The view Expand view / Layout only work on: the view of selected canvas objects, or a view
  // selected in the model tree (Layout only). name "" = none, the Modify group is then disabled;
  // onCanvas: objects on the view are selected — Expand view needs them to expand from.
  const target = { name: "", onCanvas: false };
  uiSelection.each(o => {
    if (target.name) return;
    if (o.view)                                    { target.name = String(o.view.name || ""); target.onCanvas = true; }
    else if (o.type === "archimate-diagram-model") target.name = String(o.name || "");
  });
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

      PresetRow.buildPresetRow(area, ctx);

      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      TabSelection.buildSelectionTab(tabFolder, ctx, selectedCount, containingCount);
      TabLayout.buildLayoutTab(tabFolder, ctx);
      TabAppearance.buildAppearanceTab(tabFolder, ctx);
      TabProperties.buildPropertiesTab(tabFolder, ctx);

      ctx.area = area;
      _buildActionArea(area, ctx, dlg, target);
      _syncToUI(ctx);
      _updateFilteredCount(ctx);  // populate the live counters on dialog open
      ctx._ready = true;          // enable modified indicator from here on
      const name = PresetRow.presetName(ctx);
      let saved = null;   // preset file gone: nothing to compare with
      if (PresetIO.listPresets().includes(name)) {
        try { saved = PresetIO.readPreset(name, () => {}); }   // its keys are reported when it is loaded
        catch (e) { console.error(`Preset "${name}" not compared with the session: ${/** @type {Error} */ (e).message}`); }
      }
      if (saved && Counts.differsFromSaved(saved, ctx.config)) PresetRow.markModified(ctx);  // session changed since the last save

      tabFolder.setSelection(config._lastTabIndex || 0);
      // Fit the shown tab once the dialog is open, and every tab when it is selected.
      const fitTab = () => _fitShownTab(ctx);
      tabFolder.addListener(SWT.Selection, fitTab);
      area.getDisplay().asyncExec(() => { try { if (!area.isDisposed()) fitTab(); } catch (e) {} });   // silent: a tab may be disposed meanwhile
      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    getInitialSize: function() {
      const Point = Java.type("org.eclipse.swt.graphics.Point");
      const bounds = _restoredBounds(ctx, dlg.getShell());
      if (bounds) return new Point(bounds.width, bounds.height);
      const height = Math.min(DEFAULT_DIALOG_HEIGHT, dlg.getShell().getMonitor().getClientArea().height);
      return new Point(_appearanceDialogWidth(ctx, dlg.getShell()), height);
    },

    // Top of the monitor's usable area, centred horizontally — the dialog uses the full height.
    getInitialLocation: function(/** @type {Swt.Point} */ size) {
      const Point = Java.type("org.eclipse.swt.graphics.Point");
      const bounds = _restoredBounds(ctx, dlg.getShell());
      if (bounds) return new Point(bounds.x, bounds.y);
      const area = dlg.getShell().getMonitor().getClientArea();
      return new Point(area.x + Math.max(0, Math.round((area.width - size.x) / 2)), area.y);
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

    // Closed with the window's close button or Esc: the same as Cancel.
    handleShellCloseEvent: function() {
      _persistSession(ctx);
      Java.super(dlg).handleShellCloseEvent();
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
  if (!defaultAtOpen && PresetRow.presetName(ctx) === PresetIO.DEFAULT_PRESET_NAME) PresetIO.logDefaultDifferences();
  // Dialog is fully closed here — safe to run generate_view
  if (result === IDialogConstants.CANCEL_ID || result < 0) return;

  if (!RunPreset.confirmViewCount(ctx.uiSelection, ctx._actionId, ctx.config.filter)) { console.log("One view each cancelled: nothing written."); return; }
  try {
    const run = { ...ctx.config, view: { ...ctx.config.view, folder: ctx.runFolder } };
    GenView.generate_view(run, ctx.uiSelection, ctx._actionId, { origin: { preset: PresetRow.presetName(ctx), ...(ctx.modified ? { modified: true } : {}) } });
  } catch (e) {
    RunPreset.showFailure(e);
  }
}

/** @param {DialogContext} ctx */
function _persistSession(ctx, params = {}) {
  const session = JSON.parse(JSON.stringify(ctx.config));
  Object.assign(session.params, params);
  if (ctx.widgets.tabFolder) session._lastTabIndex = ctx.widgets.tabFolder.getSelectionIndex();
  session._lastAction = ctx.action;
  const bounds = ctx.dlg.getShell().getBounds();
  session._dialogBounds = { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
  PresetIO.writeSession(session);
}

/**
 * Where the dialog was when it closed, cut to its monitor; null when that monitor is gone, or on a
 * first open: the dialog then opens at its default place.
 * @param {DialogContext} ctx
 * @param {Swt.Shell} dialogShell
 * @returns {DialogBounds | null}
 */
function _restoredBounds(ctx, dialogShell) {
  const bounds = ctx.config._dialogBounds;
  if (!bounds) return null;
  for (const monitor of dialogShell.getDisplay().getMonitors()) {
    const area = monitor.getClientArea();
    if (area.contains(bounds.x, bounds.y)) {
      return { x: bounds.x, y: bounds.y, width: Math.min(bounds.width, area.width), height: Math.min(bounds.height, area.height) };
    }
  }
  return null;
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
 * Off is grey: the counts of the action that is not chosen.
 * @param {TotalsBlock} block
 * @param {boolean}     grey
 */
function _greyTotals(block, grey) {
  for (const lbl of [block.title, ...block.rows.flatMap(r => [r.sub, r.counts])]) lbl.setEnabled(!grey);
}

/**
 * Show or hide labels that form one grid row; a hidden row takes no space.
 * @param {Swt.Control[]} labels
 * @param {boolean}       show
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
  PresetRow.markModified(ctx);
  const w = ctx.widgets;
  if (!w.tblElementConditions) return;  // Selection tab not built yet

  const objects = ctx.rawModelObjects;
  if (!objects || !objects.length) {
    (ctx.relBlocks || []).forEach(b => _setStepAdds(b, 0, 0));
    ctx.predicted = null;
    TabAppearance.updateStyleWarnings(ctx);
    _refreshAction(ctx);
    return;
  }

  try {
    _showCounts(ctx, Counts.dialogCounts(_countInput(ctx, objects)));
  } catch (e) {
    console.error(`Counts failed: ${/** @type {Error} */ (e).stack || e}`);
    (ctx.relBlocks || []).forEach(b => _setStepAdds(b, 0, 0));
  }
  TabAppearance.updateStyleWarnings(ctx);
  _refreshAction(ctx);
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
    algorithm: TabLayout.selectedAlgorithm(w),
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

  ctx.counts = counts;   // _updateFilteredCount shows them in the totals line, through _refreshAction
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

// ── Action row (below preset) ─────────────────────────────────────────────────

// Save the settings, remember the action and close; generate_view runs after dlg.open() returns.
/**
 * @param {JFace.TitleAreaDialog} dlg
 * @param {DialogContext} ctx
 */
function _runAction(dlg, ctx) {
  _saveUI(ctx);
  const nextOrder = ctx.config.params.cycleSelectionOrder ? RunPreset.cycleSelectionOrder(ctx.config.params, ctx.action) : null;
  _persistSession(ctx, nextOrder ? { selectionOrder: nextOrder } : {});
  ctx._actionId = ctx.action;
  Common.startCounter("generate_view");
  Java.super(dlg).okPressed();
}

/**
 * The action the dialog opens on. With a view selected, *Layout only*: a remembered *New view* would
 * be one click from replacing it.
 * @param {DialogContext} ctx
 * @param {Record<string, boolean>} available  per action id
 * @returns {string}
 */
function _initialAction(ctx, available) {
  if (ctx.holdsView) return ACTION.LAYOUT_ONLY.id;
  const last = ctx.config._lastAction;
  return last && available[last] ? last : ACTION.NEW_VIEW.id;
}

/**
 * The path of every view, read once: a run only adds views after the dialog closes.
 * @param {DialogContext} ctx
 * @returns {Set<string>}
 */
function _viewPaths(ctx) {
  if (!ctx.viewPaths) {
    ctx.viewPaths = new Set();
    $("view").each(v => { /** @type {Set<string>} */ (ctx.viewPaths).add(`${ArchiFolders.printFolderPath(v)}${v.name}`); });
  }
  return ctx.viewPaths;
}

/**
 * @param {string} folder  a path under Views, as in Folder
 * @param {string} name
 * @returns {string} as _viewPaths has it
 */
function _viewPath(folder, name) {
  return `/Views/${folder || Defs.GENERATED_VIEW_FOLDER}/${name}`.replace(/\/+/g, "/");
}

/**
 * The elements of *One view each*: the selection, read once, that passes the filter of now.
 * @param {DialogContext} ctx
 * @returns {ArchiElement[]}
 */
function _seedElements(ctx) {
  if (!ctx.seeds) ctx.seeds = SelectionRead.getSeedElements(ctx.uiSelection);
  const w = ctx.widgets;
  return Pipeline.applyFilter(ctx.seeds, { ...ctx.config.filter, elementConditions: w.tblElementConditions ? w.tblElementConditions.getConditions() : [] });
}

/**
 * What *One view each* will write: the folder of each element when the selection holds a folder
 * or a view, else Folder.
 * @param {DialogContext} ctx
 * @param {string} folder  the text of Folder
 * @returns {ActionState}
 */
function _oneEachState(ctx, folder) {
  const seeds = _seedElements(ctx);
  const suffix = ctx.config.view.suffix;
  if (!ctx.seedFolders) ctx.seedFolders = new Map();
  const seedFolders = ctx.seedFolders;
  const pathOf = (/** @type {ArchiElement} */ e) => {
    if (!ctx.mirrors) return _viewPath(folder, e.name + suffix);
    const id = String(e.id);
    if (!seedFolders.has(id)) seedFolders.set(id, ArchiFolders.printFolderPath(e));
    return `/Views${seedFolders.get(id)}${e.name}${suffix}`;
  };
  const replaced = seeds.filter(e => _viewPaths(ctx).has(pathOf(e))).length;
  const count = `${seeds.length} view${seeds.length === 1 ? "" : "s"}`;
  const where = ctx.mirrors ? "each in the folder of its element." : `in ${folder || Defs.GENERATED_VIEW_FOLDER}, named after the element.`;
  const replaces = replaced ? ` ${replaced} replace${replaced === 1 ? "s" : ""} an existing view.` : "";
  return { label: `Create ${count}`, folder: !ctx.mirrors, name: false, canRun: seeds.length > 0,
           note: seeds.length ? `${count} ${where}${replaces}` : "No selected element passes the filter." };
}

/**
 * What the chosen action uses and will write.
 * @param {DialogContext} ctx
 * @returns {ActionState}
 */
function _actionState(ctx) {
  const w = ctx.widgets;
  const folder = w.txtViewFolder.getText().trim();
  if (ctx.action === ACTION.ONE_EACH.id) return _oneEachState(ctx, folder);
  if (ctx.action === ACTION.NEW_VIEW.id) {
    const replaces = _viewPaths(ctx).has(_viewPath(folder, w.txtViewName.getText().trim()));
    return { label: replaces ? "Replace view" : "Create view", folder: true, name: true, canRun: true, note: "" };
  }
  const label = ctx.action === ACTION.EXPAND_VIEW.id ? ACTION.EXPAND_VIEW.label : ACTION.LAYOUT_ONLY.label;
  return { label, folder: false, name: false, canRun: true, note: "" };
}

/**
 * The note on the origin of the one selected view, "" without one.
 * @param {DialogContext} ctx
 * @returns {string}
 */
function _originNote(ctx) {
  const origin = ctx.selectedView ? ViewOrigin.read(ctx.selectedView) : null;
  if (!origin) return "";
  if (origin.script) return `Made by "${origin.script}".`;
  const start = origin.element ? [origin.element] : origin.selection || [];
  const more = start.length > 1 ? ` and ${start.length - 1} more` : "";
  return `Made from "${start.length ? start[0].name : "nothing"}${more}" with preset "${origin.preset}"`;
}

/**
 * Show what the chosen action uses: Folder and Name are grey when it does not, the run button names
 * the result, each group shows what its action writes.
 * @param {DialogContext} ctx
 */
function _refreshAction(ctx) {
  const w = ctx.widgets;
  if (!w.btnRun) return;   // the action area is built last
  const state = _actionState(ctx);
  Widgets.enable(w.txtViewFolder, state.folder);
  Widgets.enable(w.txtViewName, state.name);
  w.btnRun.setText(state.label);
  w.btnRun.setEnabled(state.canRun);
  w.lblCreateNote.setText(state.note);
  w.lblOriginNote.setText(_originNote(ctx));
  _showTotals(ctx);
}

/**
 * The counts in the groups: New view and Expand view say what they put on the view, in grey when
 * not chosen, so a group keeps its height. One view each has its note instead; Layout only writes
 * what is on the view (Current selection counts it).
 * @param {DialogContext} ctx
 */
function _showTotals(ctx) {
  const w = ctx.widgets;
  const oneEach = ctx.action === ACTION.ONE_EACH.id;
  try {
    if (ctx.counts) _setTotals(w.createTotals, "On the generated view:", ctx.counts.view);
    if (ctx.counts && ctx.counts.expandView) _setTotals(w.expandTotals, "On the expanded view:", ctx.counts.expandView);
    _greyTotals(w.createTotals, ctx.action !== ACTION.NEW_VIEW.id);
    _greyTotals(w.expandTotals, ctx.action !== ACTION.EXPAND_VIEW.id);
    _showRow([w.createTotals.box], !oneEach);
    _showRow([w.lblCreateNote], oneEach);
    _showRow([w.expandTotals.box], !!(ctx.counts && ctx.counts.expandView));
    _showRow([w.lblOriginNote], !!w.lblOriginNote.getText());
    // The line count may change: lay out these labels and their ancestors only, not every tab.
    const changed = [w.createTotals, w.expandTotals].flatMap(t => [t.box, t.title, ...t.rows.flatMap(r => [r.sub, r.counts])]);
    if (ctx.area) ctx.area.layout(Java.to([...changed, w.lblCreateNote, w.lblOriginNote], "org.eclipse.swt.widgets.Control[]"));
  } catch (e) {}   // silent: text and layout during a dialog update, on widgets that may be disposed
}


/**
 * The totals line: the title over a grid of sub-lines, each its label and its counts.
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
  return { box: block, title: titleLbl, rows, fit };
}

// Bottom of the dialog: one group per kind of action, each with its choices, what they use and what
// they write; Run and Cancel below.
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

  /** @type {Record<string, boolean>} */
  const available = { [ACTION.NEW_VIEW.id]: true, [ACTION.ONE_EACH.id]: true, [ACTION.EXPAND_VIEW.id]: target.onCanvas, [ACTION.LAYOUT_ONLY.id]: !!targetViewName };
  ctx.action = _initialAction(ctx, available);
  /** @type {Swt.Button[]} */
  const radios = [];

  // 2 columns: Create | Modify. Both groups have the same rows, so choices and fields line up.
  const row = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(2).equalWidth(true).margins(0, 2).spacing(8, 6).applyTo(row);

  // ── Create new view ──
  const grpCreate = Widgets.group(row, "Create new view", 4, { grabV: true, bold: false });
  _actionChoices(grpCreate, 4, [ACTION.NEW_VIEW, ACTION.ONE_EACH], radios, available, ctx);

  const lblFolder = new LabelWidget(grpCreate, SWT.NONE);
  lblFolder.setText("Folder:");
  w.txtViewFolder = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewFolder.setData("label", lblFolder);
  w.txtViewFolder.setToolTipText(`Folder under Views, e.g. /_Generated/Project.\nEmpty = ${Defs.GENERATED_VIEW_FOLDER}.`);
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewFolder);
  w.txtViewFolder.addListener(SWT.Modify, () => { PresetRow.markModified(ctx); _refreshAction(ctx); });

  const lblName = new LabelWidget(grpCreate, SWT.NONE);
  lblName.setText("Name:");
  w.txtViewName = new TextWidget(grpCreate, SWT.BORDER);
  w.txtViewName.setData("label", lblName);
  w.txtViewName.setToolTipText("Name of the new view, pre-filled with the first selected object.\nA view with this name in the folder is replaced.");
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(w.txtViewName);
  w.txtViewName.addListener(SWT.Modify, () => _refreshAction(ctx));

  w.createTotals = _totalsBlock(grpCreate, "On the generated view: —",
    "What the current settings put on a new view:\n" +
    "containers, nested elements, standalones, extra occurrences (Show in every container),\n" +
    "nestings (box in box), connections (lines) and diagram objects.");
  w.createTotals.box.getLayoutData().horizontalSpan = 4;
  w.lblCreateNote = Widgets.noteLabel(grpCreate, "");
  w.lblCreateNote.getLayoutData().horizontalSpan = 4;

  // ── Modify view ──
  const grpModify = Widgets.group(row, "Modify selected view", 2, { grabV: true, bold: false });
  _actionChoices(grpModify, 2, [ACTION.EXPAND_VIEW, ACTION.LAYOUT_ONLY], radios, available, ctx);

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
  if (targetViewName) lblTarget.setFont(Widgets.getBoldFont());

  w.expandTotals = _totalsBlock(grpModify, "On the expanded view: —",
    "What Expand view puts on the selected view:\n" +
    "everything on it, plus the elements and relations the steps add from the selected elements.\n" +
    "The filter does not apply.");
  w.expandTotals.box.getLayoutData().horizontalSpan = 2;
  w.lblOriginNote = Widgets.noteLabel(grpModify, "");
  w.lblOriginNote.getLayoutData().horizontalSpan = 2;

  _fitGroupOnResize(area, grpCreate, w.createTotals, w.lblCreateNote);
  _fitGroupOnResize(area, grpModify, w.expandTotals, w.lblOriginNote);

  // ── Run and Cancel: bottom right ──
  const buttonRow = new CompositeWidget(area, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(buttonRow);
  GridLayoutFactory.fillDefaults().numColumns(3).margins(0, 2).spacing(8, 0).applyTo(buttonRow);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(new LabelWidget(buttonRow, SWT.NONE));
  w.btnRun = new ButtonWidget(buttonRow, SWT.PUSH);
  GridDataFactory.fillDefaults().hint(160, SWT.DEFAULT).applyTo(w.btnRun);
  w.btnRun.addListener(SWT.Selection, () => _runAction(dlg, ctx));
  const btnCancel = new ButtonWidget(buttonRow, SWT.PUSH);
  btnCancel.setText("Cancel");
  GridDataFactory.fillDefaults().hint(100, SWT.DEFAULT).applyTo(btnCancel);
  btnCancel.addListener(SWT.Selection, () => {
    _persistSession(ctx);  // remember _lastTabIndex even on cancel
    Java.super(dlg).cancelPressed();
  });
}

/**
 * The radios of one group. SWT keeps radios exclusive per parent only, so a choice clears the
 * radios of the other group.
 * @param {Swt.Composite} group
 * @param {number} span  the columns of the group
 * @param {{ id: string, label: string, tooltip: string }[]} actions
 * @param {Swt.Button[]} radios  every radio of the dialog, added to
 * @param {Record<string, boolean>} available  per action id
 * @param {DialogContext} ctx
 */
function _actionChoices(group, span, actions, radios, available, ctx) {
  const choiceRow = new CompositeWidget(group, SWT.NONE);
  GridDataFactory.fillDefaults().span(span, 1).applyTo(choiceRow);
  GridLayoutFactory.fillDefaults().numColumns(actions.length).spacing(Widgets.GAP_PAIR, 0).applyTo(choiceRow);
  for (const action of actions) {
    const radio = new ButtonWidget(choiceRow, SWT.RADIO);
    radio.setText(action.label);
    radio.setToolTipText(action.tooltip);
    radio.setEnabled(available[action.id]);
    radio.setSelection(action.id === ctx.action);
    radio.addListener(SWT.Selection, () => {
      if (!radio.getSelection()) return;
      for (const other of radios) if (other !== radio) other.setSelection(false);
      ctx.action = action.id;
      _refreshAction(ctx);
    });
    radios.push(radio);
  }
}

/**
 * What wraps in a group follows its width: a wrapping label asks for its text on one line otherwise.
 * @param {Swt.Composite} area
 * @param {Swt.Composite} group
 * @param {TotalsBlock}   totals
 * @param {Swt.Label}     note
 */
function _fitGroupOnResize(area, group, totals, note) {
  let fitted = 0;
  group.addListener(SWT.Resize, () => {
    try {
      const width = group.getClientArea().width - 2 * Widgets.GROUP_MARGIN_H;
      if (width <= 50 || width === fitted) return;
      fitted = width;
      totals.fit(width);
      note.getLayoutData().widthHint = width;
      // Outside the running layout: the heights changed.
      group.getDisplay().asyncExec(() => { if (!group.isDisposed()) area.layout(true, true); });
    } catch (e) {}   // silent: a resize while the dialog closes, on widgets that may be disposed
  });
}

// ── Sync config ↔ UI ──────────────────────────────────────────────────────────

/**
 * Fill the widgets from the config. Their layout requests are held until the end: one layout instead
 * of one per step block and table (each a full dialog layout, slow on Windows).
 * @param {DialogContext} ctx
 */
function _syncToUI(ctx) {
  const shell = ctx.area.getShell();
  shell.setLayoutDeferred(true);
  try { _fillWidgets(ctx); }
  finally { shell.setLayoutDeferred(false); }
  _fitShownTab(ctx);
}

/**
 * Fit the shown tab's page to its scrolled area (Widgets.resizeScrolled): the dialog widens for a table.
 * @param {DialogContext} ctx
 */
function _fitShownTab(ctx) {
  const i = ctx.widgets.tabFolder.getSelectionIndex();
  /** @type {[Swt.ScrolledComposite, Swt.Composite][]} */
  const pairs = [[ctx.selectionScrolled, ctx.selectionPage], [ctx.layoutScrolled, ctx.layoutPage],
                 [ctx.appearanceScrolled, ctx.appearancePage]];
  if (pairs[i]) Widgets.resizeScrolled(pairs[i][0], pairs[i][1]);
}

/** @param {DialogContext} ctx */
function _fillWidgets(ctx) {
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
      try { b.container.dispose(); } catch (e) {}   // silent: may be disposed already
      ctx.relBlocks.shift();
    }
    const steps = (c.relatedElements && c.relatedElements.steps) || [];
    steps.forEach(step => TabSelection.addRelatedBlock(ctx, step));
    Widgets.resizeScrolled(ctx.selectionScrolled, ctx.selectionPage);
  }

  // View name: always pre-fill from the first selected object (captured in open()).
  const viewName  = (ctx && ctx.firstName) || (c.view && c.view.name) || "";
  if (w.txtViewName)   w.txtViewName.setText(viewName);
  // One selected view: its own folder, so New view replaces it. Only the run sees it, as with the name.
  if (w.txtViewFolder) w.txtViewFolder.setText(ctx.viewFolder || (c.view && c.view.folder) || Defs.GENERATED_VIEW_FOLDER);

  TabLayout.updateAlgorithmControls(ctx);

  // Appearance tab
  const app  = c.appearance;
  const DA   = DEFAULT_PRESET.appearance;

  const sbp  = app.styleByProperty;
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;

  // Palette: a name that is not in _palettes.json shows the first (default) palette; the run
  // reports it (no console output here: the dialog is modal).
  if (w.cmbPalette && ctx.palettes.length) w.cmbPalette.select(Math.max(0, ctx.palettes.findIndex(p => p.name === app.palette)));

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
  if (w.pickHighlightRepRange) w.pickHighlightRepRange.set(hr.colorRange || DA.highlightRepeated.colorRange);

  TabAppearance.updateNestingLevelState(ctx);
  TabAppearance.updateAppearancePropStates(ctx);

  TabProperties.syncToUI(ctx);

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
  if (w.txtViewFolder) {
    ctx.runFolder = w.txtViewFolder.getText().trim();
    if (ctx.runFolder !== ctx.viewFolder) c.view.folder = ctx.runFolder;
  }

  // Appearance
  if (w.cmbPalette && ctx.palettes.length) c.appearance.palette = ctx.palettes[Math.max(0, w.cmbPalette.getSelectionIndex())].name;

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

  TabProperties.saveFromUI(ctx);

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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
