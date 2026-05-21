/**
 * View generation dialog (SWT/JFace).
 *
 * Uses defs.js for all parameter definitions and preset_io.js for persistence.
 * Exports open(uiSelection) → calls generate_view on OK.
 *
 * Dialog layout:
 *   Selection  — current selection info · filter · related elements
 *   Layout     — style · algorithm · direction · routing · nesting · sizing
 *   View       — name · folder
 *   Preset     — load · save · manage
 *   Actions    — New view · One view each · Expand view · Layout only
 */
console.log("dialog_main.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Common      = require(REPO_ROOT + "_lib/Common");
const Selection   = require(REPO_ROOT + "_lib/selection");
const Defs        = require(REPO_ROOT + "View/lib/defs");
const PresetIO    = require(REPO_ROOT + "View/lib/preset_io");
const GenView     = require(REPO_ROOT + "View/lib/generate_view");

const {
  STYLES, ALGORITHMS, ACTION, ROUTING, DIRECTIONS, RANKING, LABEL_POSITIONS, AR_OPTIONS,
  RELATION_TYPES, ELEMENT_TYPES, DIAGRAM_TYPES,
  DEFAULT_PRESET, validatePreset,
} = Defs;

// ── SWT imports ───────────────────────────────────────────────────────────────

const SWT                 = Java.type("org.eclipse.swt.SWT");
const LabelWidget         = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget     = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget       = Java.type("org.eclipse.swt.widgets.Spinner");
const GroupWidget         = Java.type("org.eclipse.swt.widgets.Group");
const ButtonWidget        = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget         = Java.type("org.eclipse.swt.widgets.Combo");
const TextWidget          = Java.type("org.eclipse.swt.widgets.Text");
const TabFolderWidget     = Java.type("org.eclipse.swt.widgets.TabFolder");
const TabItemWidget       = Java.type("org.eclipse.swt.widgets.TabItem");
const GridDataFactory     = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory   = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog     = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants    = Java.type("org.eclipse.jface.dialogs.IDialogConstants");
const SWTFont             = Java.type("org.eclipse.swt.graphics.Font");

const BTN_W = 95;  // Add/Remove button width

// ── Direction and routing display lists ──────────────────────────────────────

const DIRECTION_LABELS = DIRECTIONS.map(d => d.val);
const ROUTING_ALL      = Object.values(ROUTING).map(r => r.label);
const LABEL_POS_ALL    = LABEL_POSITIONS.map(lp => lp.val);
const RANKING_LABELS   = RANKING.map(r => r.val);
const AR_LABELS        = AR_OPTIONS.map(a => a.label);
const RELATION_TYPE_LABELS = Object.values(RELATION_TYPES).map(r => r.label);
const RELATION_TYPE_IDS    = Object.values(RELATION_TYPES).map(r => r.id);

// ── Relation type encoding (same format as preset schema) ─────────────────────

function _encodeRelType(typeId, inOn, outOn) {
  if (inOn && !outOn) return typeId + ":in";
  if (!inOn && outOn) return typeId + ":out";
  return typeId;
}

function _decodeRelType(entry) {
  if (entry.endsWith(":in"))  return { typeId: entry.slice(0, -3), inOn: true,  outOn: false };
  if (entry.endsWith(":out")) return { typeId: entry.slice(0, -4), inOn: false, outOn: true  };
  return { typeId: entry, inOn: true, outOn: true };
}

// ── Main dialog export ────────────────────────────────────────────────────────

/**
 * Open the GUI dialog.
 * @param {ArchiCollection} uiSelection  $(selection) captured before dialog opens
 */
function open(uiSelection) {
  // Load session as starting config
  const config = PresetIO.readSession();
  // Ensure action is set
  if (!config.action) config.action = ACTION.NEW_VIEW.id;

  const w = {};  // widget map

  const ConfigDialog = Java.extend(TitleAreaDialog);

  const dlg = Object.assign(new ConfigDialog(shell), {
    config,
    widgets: w,

    createDialogArea: function(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Generate View");
      dlg.setMessage("Configure layout and run.");

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).applyTo(area);

      // Tab folder: Selection / Layout / View
      const tabFolder = new TabFolderWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(tabFolder);
      w.tabFolder = tabFolder;

      _buildSelectionTab(tabFolder, dlg);
      _buildLayoutTab(tabFolder, dlg);
      _buildViewTab(tabFolder, dlg);

      // Preset row
      _buildPresetRow(area, dlg);

      // Sync config → widgets
      _syncToUI(dlg);

      // Restore last tab
      const lastTab = config._lastTabIndex || 0;
      tabFolder.setSelection(Math.min(lastTab, 2));

      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    createButtonsForButtonBar: function(parent) {
      Java.super(dlg).createButton(parent, IDialogConstants.CANCEL_ID, "Cancel", false);
      const ok = Java.super(dlg).createButton(parent, IDialogConstants.OK_ID, _actionLabel(config.action), true);
      GridDataFactory.swtDefaults().hint(150, SWT.DEFAULT).applyTo(ok);
      w.okBtn = ok;
    },

    okPressed: function() {
      _saveUI(dlg);
      // Save session
      const session = Object.assign({}, config);
      session._lastTabIndex = w.tabFolder ? w.tabFolder.getSelectionIndex() : 0;
      PresetIO.writeSession(session);
      Java.super(dlg).okPressed();
    },
  });

  const result = dlg.open();
  if (result !== 0) {  // CANCEL
    console.log("Cancelled.");
    return;
  }

  // Run generate_view
  GenView.generate_view(config, uiSelection);
  Common.finishConsoleLog && Common.finishConsoleLog();
}

// ── Tab builders ──────────────────────────────────────────────────────────────

function _buildSelectionTab(tabFolder, dlg) {
  const tab = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText("Selection");
  const page = new CompositeWidget(tabFolder, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);
  tab.setControl(page);
  const w = dlg.widgets;

  // Current selection info
  const grpInfo = new GroupWidget(page, SWT.NONE);
  grpInfo.setText("Current selection");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpInfo);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 4).applyTo(grpInfo);
  const lblInfo = new LabelWidget(grpInfo, SWT.NONE);
  lblInfo.setText("—");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(lblInfo);
  w.lblSelectionInfo = lblInfo;

  // Filter
  const grpFilter = new GroupWidget(page, SWT.NONE);
  grpFilter.setText("Filter");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpFilter);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(6, 4).spacing(4, 4).applyTo(grpFilter);

  new LabelWidget(grpFilter, SWT.NONE).setText("Elements:");
  const cmbFilterEl = new ComboWidget(grpFilter, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbFilterEl.add("All");
  ELEMENT_TYPES.forEach(t => cmbFilterEl.add(t));
  cmbFilterEl.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbFilterEl);
  w.cmbFilterElement = cmbFilterEl;

  new LabelWidget(grpFilter, SWT.NONE).setText("Relations:");
  const cmbFilterRel = new ComboWidget(grpFilter, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbFilterRel.add("All");
  Object.values(RELATION_TYPES).forEach(r => cmbFilterRel.add(r.label));
  cmbFilterRel.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbFilterRel);
  w.cmbFilterRelation = cmbFilterRel;

  new LabelWidget(grpFilter, SWT.NONE).setText("Diagram:");
  const cmbFilterDiag = new ComboWidget(grpFilter, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbFilterDiag.add("All");
  cmbFilterDiag.add("None");
  DIAGRAM_TYPES.forEach(t => cmbFilterDiag.add(t));
  cmbFilterDiag.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbFilterDiag);
  w.cmbFilterDiagram = cmbFilterDiag;

  // Related elements
  const grpRelated = new GroupWidget(page, SWT.NONE);
  grpRelated.setText("Related elements");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpRelated);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(4, 4).applyTo(grpRelated);

  new LabelWidget(grpRelated, SWT.NONE).setText("Depth:");
  const spinDepth = new SpinnerWidget(grpRelated, SWT.BORDER);
  spinDepth.setValues(1, 0, 5, 0, 1, 1);
  spinDepth.setToolTipText("Number of relation hops to follow (0 = selection only)");
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(spinDepth);
  w.spinRelDepth = spinDepth;

  new LabelWidget(grpRelated, SWT.NONE).setText("Relations:");
  const cmbRelType = new ComboWidget(grpRelated, SWT.READ_ONLY | SWT.DROP_DOWN);
  cmbRelType.add("All");
  Object.values(RELATION_TYPES).forEach(r => cmbRelType.add(r.label));
  cmbRelType.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbRelType);
  w.cmbRelatedRelType = cmbRelType;
}

function _buildLayoutTab(tabFolder, dlg) {
  const tab = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText("Layout");
  const page = new CompositeWidget(tabFolder, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);
  tab.setControl(page);
  const w = dlg.widgets;

  // Style + Algorithm row
  const grpAlg = new GroupWidget(page, SWT.NONE);
  grpAlg.setText("Algorithm");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpAlg);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(6, 4).applyTo(grpAlg);

  new LabelWidget(grpAlg, SWT.NONE).setText("Style:");
  const cmbStyle = new ComboWidget(grpAlg, SWT.READ_ONLY | SWT.DROP_DOWN);
  Object.keys(STYLES).forEach(s => cmbStyle.add(s));
  cmbStyle.select(0);
  GridDataFactory.swtDefaults().hint(130, SWT.DEFAULT).applyTo(cmbStyle);
  w.cmbStyle = cmbStyle;

  new LabelWidget(grpAlg, SWT.NONE).setText("Algorithm:");
  const cmbAlg = new ComboWidget(grpAlg, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(cmbAlg);
  w.cmbAlgorithm = cmbAlg;

  // Engine label
  const lblEngine = new LabelWidget(grpAlg, SWT.NONE);
  lblEngine.setText("");
  GridDataFactory.fillDefaults().span(4, 1).applyTo(lblEngine);
  w.lblEngine = lblEngine;

  // Algorithm tooltip
  const lblAlgTip = new LabelWidget(grpAlg, SWT.WRAP);
  lblAlgTip.setText("");
  GridDataFactory.fillDefaults().span(4, 1).grab(true, false).hint(400, SWT.DEFAULT).applyTo(lblAlgTip);
  w.lblAlgTooltip = lblAlgTip;

  // Update algorithm combo when style changes
  cmbStyle.addListener(SWT.Selection, e => {
    _fillAlgorithmCombo(dlg);
    _updateAlgorithmControls(dlg);
  });
  cmbAlg.addListener(SWT.Selection, e => _updateAlgorithmControls(dlg));

  // Direction + Routing
  const grpDir = new GroupWidget(page, SWT.NONE);
  grpDir.setText("Direction and routing");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpDir);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(6, 4).spacing(6, 4).applyTo(grpDir);

  new LabelWidget(grpDir, SWT.NONE).setText("Flow direction:");
  const cmbDir = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  DIRECTION_LABELS.forEach(d => cmbDir.add(d));
  cmbDir.select(0);
  GridDataFactory.swtDefaults().hint(130, SWT.DEFAULT).applyTo(cmbDir);
  w.cmbDirection = cmbDir;

  new LabelWidget(grpDir, SWT.NONE).setText("Relation lines:");
  const cmbRouting = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  ROUTING_ALL.forEach(r => cmbRouting.add(r));
  cmbRouting.select(0);
  GridDataFactory.swtDefaults().hint(170, SWT.DEFAULT).applyTo(cmbRouting);
  w.cmbRouting = cmbRouting;

  new LabelWidget(grpDir, SWT.NONE).setText("Label:");
  const cmbLabelPos = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  LABEL_POS_ALL.forEach(lp => cmbLabelPos.add(lp));
  cmbLabelPos.select(1);
  GridDataFactory.swtDefaults().hint(100, SWT.DEFAULT).applyTo(cmbLabelPos);
  w.cmbLabelPosition = cmbLabelPos;

  // Ranking (Dagre only)
  new LabelWidget(grpDir, SWT.NONE).setText("Layer ranking:");
  const cmbRanking = new ComboWidget(grpDir, SWT.READ_ONLY | SWT.DROP_DOWN);
  RANKING_LABELS.forEach(r => cmbRanking.add(r));
  cmbRanking.select(0);
  GridDataFactory.swtDefaults().hint(130, SWT.DEFAULT).applyTo(cmbRanking);
  w.cmbRanking = cmbRanking;

  // Nesting structure
  const grpNestStruct = new GroupWidget(page, SWT.NONE);
  grpNestStruct.setText("Nesting structure — relation types that define containment");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpNestStruct);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(4, 4).applyTo(grpNestStruct);
  w.grpNestingStructure = grpNestStruct;

  new LabelWidget(grpNestStruct, SWT.NONE).setText("Types:");
  const lstNested = new ComboWidget(grpNestStruct, SWT.READ_ONLY | SWT.DROP_DOWN);
  lstNested.add("None");
  Object.values(RELATION_TYPES).forEach(r => lstNested.add(r.label));
  lstNested.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(lstNested);
  w.cmbNestingType = lstNested;

  new LabelWidget(grpNestStruct, SWT.NONE).setText("Reverse:");
  const lstReversed = new ComboWidget(grpNestStruct, SWT.READ_ONLY | SWT.DROP_DOWN);
  lstReversed.add("None");
  Object.values(RELATION_TYPES).forEach(r => lstReversed.add(r.label));
  lstReversed.select(0);
  GridDataFactory.swtDefaults().hint(160, SWT.DEFAULT).applyTo(lstReversed);
  w.cmbReverseType = lstReversed;

  // Container appearance
  const grpContainer = new GroupWidget(page, SWT.NONE);
  grpContainer.setText("Container appearance");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpContainer);
  GridLayoutFactory.fillDefaults().numColumns(8).margins(6, 4).spacing(4, 4).applyTo(grpContainer);
  w.grpContainer = grpContainer;

  new LabelWidget(grpContainer, SWT.NONE).setText("Inner spacing:");
  const spinInner = new SpinnerWidget(grpContainer, SWT.BORDER);
  spinInner.setValues(20, 0, 200, 0, 5, 20);
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(spinInner);
  w.spinInnerSpacing = spinInner;

  new LabelWidget(grpContainer, SWT.NONE).setText("Padding:");
  const spinPad = new SpinnerWidget(grpContainer, SWT.BORDER);
  spinPad.setValues(20, 0, 200, 0, 5, 20);
  GridDataFactory.swtDefaults().hint(50, SWT.DEFAULT).applyTo(spinPad);
  w.spinPadding = spinPad;

  const chkSort = new ButtonWidget(grpContainer, SWT.CHECK);
  chkSort.setText("Sort containers");
  chkSort.setToolTipText("Sort containers alphabetically within each level.");
  GridDataFactory.fillDefaults().span(2, 1).applyTo(chkSort);
  w.chkSortContainers = chkSort;

  const chkAlign = new ButtonWidget(grpContainer, SWT.CHECK);
  chkAlign.setText("Align same type");
  chkAlign.setToolTipText("Resize leaf elements to match the tallest item in their row, within same-type containers.");
  GridDataFactory.fillDefaults().span(2, 1).applyTo(chkAlign);
  w.chkAlignSameType = chkAlign;

  const chkEvery = new ButtonWidget(grpContainer, SWT.CHECK);
  chkEvery.setText("Show in every container");
  chkEvery.setToolTipText("An element in multiple containers appears in each of them.");
  GridDataFactory.fillDefaults().span(4, 1).applyTo(chkEvery);
  w.chkShowInEvery = chkEvery;

  // Size and spacing
  const grpSize = new GroupWidget(page, SWT.NONE);
  grpSize.setText("Size and spacing");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpSize);
  GridLayoutFactory.fillDefaults().numColumns(8).margins(6, 4).spacing(4, 4).applyTo(grpSize);

  _addSpinner(grpSize, "Element width:",  "spinElementWidth",   140, 10, 1000, 10, w);
  _addSpinner(grpSize, "Height:",         "spinElementHeight",   60, 10,  500, 10, w);
  _addSpinner(grpSize, "Element spacing:","spinElementSpacing",  40,  0,  500,  5, w);
  _addSpinner(grpSize, "Level spacing:",  "spinLayerSpacing",   180,  0, 2000, 20, w);

  // View size
  const grpViewSize = new GroupWidget(page, SWT.NONE);
  grpViewSize.setText("View size");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpViewSize);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(6, 4).spacing(4, 4).applyTo(grpViewSize);

  _addSpinner(grpViewSize, "Max width:",  "spinMaxWidth",  0, 0, 99999, 100, w);
  _addSpinner(grpViewSize, "Max height:", "spinMaxHeight", 0, 0, 99999, 100, w);

  new LabelWidget(grpViewSize, SWT.NONE).setText("Aspect ratio:");
  const cmbAR = new ComboWidget(grpViewSize, SWT.READ_ONLY | SWT.DROP_DOWN);
  AR_OPTIONS.forEach(a => cmbAR.add(a.label));
  cmbAR.select(0);
  GridDataFactory.swtDefaults().hint(120, SWT.DEFAULT).applyTo(cmbAR);
  w.cmbAspectRatio = cmbAR;
}

function _buildViewTab(tabFolder, dlg) {
  const tab = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText("View");
  const page = new CompositeWidget(tabFolder, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);
  tab.setControl(page);
  const w = dlg.widgets;

  const grpView = new GroupWidget(page, SWT.NONE);
  grpView.setText("View name and location");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpView);
  GridLayoutFactory.fillDefaults().numColumns(2).margins(6, 4).spacing(4, 4).applyTo(grpView);

  new LabelWidget(grpView, SWT.NONE).setText("Name:");
  const txtName = new TextWidget(grpView, SWT.BORDER);
  txtName.setToolTipText("View name. Pre-filled from the first selected element. Leave blank for auto-naming.");
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(txtName);
  w.txtViewName = txtName;

  new LabelWidget(grpView, SWT.NONE).setText("Suffix:");
  const txtSuffix = new TextWidget(grpView, SWT.BORDER);
  txtSuffix.setToolTipText("Appended to view name.");
  GridDataFactory.fillDefaults().grab(true, false).hint(150, SWT.DEFAULT).applyTo(txtSuffix);
  w.txtViewSuffix = txtSuffix;

  new LabelWidget(grpView, SWT.NONE).setText("Folder:");
  const txtFolder = new TextWidget(grpView, SWT.BORDER);
  txtFolder.setToolTipText("Archi folder path (e.g. /Application/Generated). Empty = /_Generated.");
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(txtFolder);
  w.txtViewFolder = txtFolder;

  // Action selection
  const grpAction = new GroupWidget(page, SWT.NONE);
  grpAction.setText("Action");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(grpAction);
  GridLayoutFactory.fillDefaults().numColumns(4).margins(6, 4).spacing(6, 4).applyTo(grpAction);

  Object.values(ACTION).forEach(act => {
    const btn = new ButtonWidget(grpAction, SWT.RADIO);
    btn.setText(act.label);
    btn.setToolTipText(act.tooltip);
    btn.setData("actionId", act.id);
    btn.addListener(SWT.Selection, e => {
      if (btn.getSelection()) {
        dlg.config.action = act.id;
        if (dlg.widgets.okBtn) dlg.widgets.okBtn.setText(_actionLabel(act.id));
      }
    });
    dlg.widgets["radAction_" + act.id] = btn;
  });
}

function _buildPresetRow(parent, dlg) {
  const w = dlg.widgets;

  const row = new CompositeWidget(parent, SWT.NONE);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  GridLayoutFactory.fillDefaults().numColumns(6).margins(4, 2).spacing(4, 0).applyTo(row);

  new LabelWidget(row, SWT.NONE).setText("Preset:");
  const cmbPreset = new ComboWidget(row, SWT.READ_ONLY | SWT.DROP_DOWN);
  GridDataFactory.swtDefaults().hint(200, SWT.DEFAULT).applyTo(cmbPreset);
  _refreshPresetCombo(cmbPreset);
  w.cmbPreset = cmbPreset;

  cmbPreset.addListener(SWT.Selection, e => {
    const idx = cmbPreset.getSelectionIndex();
    if (idx >= 0) {
      const name = cmbPreset.getItem(idx);
      try {
        const loaded = PresetIO.readPreset(name);
        Object.assign(dlg.config, loaded);
        _syncToUI(dlg);
      } catch (err) {
        console.error("Failed to load preset: " + err);
      }
    }
  });

  const btnLoad = new ButtonWidget(row, SWT.PUSH);
  btnLoad.setText("Load…");
  btnLoad.setToolTipText("Browse for a preset JSON file");
  btnLoad.addListener(SWT.Selection, e => {
    const path = window.promptOpenFile({ title: "Load preset", filterExtensions: ["*.json"] });
    if (path) {
      try {
        const raw = PresetIO.readJSON(path);
        if (raw) {
          const loaded = validatePreset(raw);
          Object.assign(dlg.config, loaded);
          _syncToUI(dlg);
        }
      } catch (err) { console.error("Load preset error: " + err); }
    }
  });

  const btnSave = new ButtonWidget(row, SWT.PUSH);
  btnSave.setText("Save");
  btnSave.setToolTipText("Save current settings as a preset");
  btnSave.addListener(SWT.Selection, e => {
    const name = window.prompt("Save preset as:", dlg.config.name || "");
    if (name) {
      _saveUI(dlg);
      dlg.config.name = name;
      PresetIO.writePreset(name, dlg.config);
      _refreshPresetCombo(cmbPreset);
    }
  });

  const btnManage = new ButtonWidget(row, SWT.PUSH);
  btnManage.setText("Manage…");
  btnManage.setToolTipText("Rename or delete presets");
  btnManage.addListener(SWT.Selection, e => {
    // Simple manage: show list and allow delete
    const names = PresetIO.listPresets();
    if (names.length === 0) { window.alert("No presets saved."); return; }
    const del = window.prompt("Delete preset (enter name):\n" + names.join(", "), "");
    if (del && names.includes(del)) {
      PresetIO.deletePreset(del);
      _refreshPresetCombo(cmbPreset);
    }
  });
}

// ── Sync config ↔ UI ──────────────────────────────────────────────────────────

function _syncToUI(dlg) {
  const c = dlg.config;
  const w = dlg.widgets;
  const p = c.params || {};

  // Style and algorithm
  const algName = c.algorithm || "Layered";
  const alg     = ALGORITHMS[algName];
  const styleName = (alg && alg.style) || "Flow";
  const styleIdx  = Object.keys(STYLES).indexOf(styleName);
  if (w.cmbStyle && styleIdx >= 0) w.cmbStyle.select(styleIdx);
  _fillAlgorithmCombo(dlg);
  const algIdx = alg ? STYLES[styleName].algorithms.indexOf(algName) : 0;
  if (w.cmbAlgorithm && algIdx >= 0) w.cmbAlgorithm.select(algIdx);

  // Direction
  const dirIdx = DIRECTION_LABELS.indexOf(p.direction || "Left → Right");
  if (w.cmbDirection) w.cmbDirection.select(Math.max(0, dirIdx));

  // Routing
  const routingLabel = p.routing || "Orthogonal";
  const routingIdx   = ROUTING_ALL.indexOf(routingLabel);
  if (w.cmbRouting) w.cmbRouting.select(Math.max(0, routingIdx));

  // Label position
  const lpIdx = LABEL_POS_ALL.indexOf(p.labelPosition || "Middle");
  if (w.cmbLabelPosition) w.cmbLabelPosition.select(Math.max(0, lpIdx));

  // Ranking
  const rankIdx = RANKING_LABELS.indexOf(p.ranking || "Balanced");
  if (w.cmbRanking) w.cmbRanking.select(Math.max(0, rankIdx));

  // Nesting
  const nestTypes = p.nestingRelationTypes || [];
  const nestLabel = nestTypes.length > 0
    ? Object.values(RELATION_TYPES).find(r => r.id === nestTypes[0])?.label || "None"
    : "None";
  if (w.cmbNestingType) {
    const ni = w.cmbNestingType.indexOf(nestLabel);
    w.cmbNestingType.select(ni >= 0 ? ni : 0);
  }

  const revTypes = p.reverseRelationTypes || [];
  const revLabel = revTypes.length > 0
    ? Object.values(RELATION_TYPES).find(r => r.id === revTypes[0])?.label || "None"
    : "None";
  if (w.cmbReverseType) {
    const ri = w.cmbReverseType.indexOf(revLabel);
    w.cmbReverseType.select(ri >= 0 ? ri : 0);
  }

  // Container
  if (w.spinInnerSpacing) w.spinInnerSpacing.setSelection(p.innerSpacing || 20);
  if (w.spinPadding)      w.spinPadding.setSelection(p.padding || 20);
  if (w.chkSortContainers) w.chkSortContainers.setSelection(!!(p.sortContainers));
  if (w.chkAlignSameType)  w.chkAlignSameType.setSelection(!!(p.alignSameType));
  if (w.chkShowInEvery)    w.chkShowInEvery.setSelection(!!(p.showInEveryContainer));

  // Size
  if (w.spinElementWidth)   w.spinElementWidth.setSelection(p.elementWidth   || 140);
  if (w.spinElementHeight)  w.spinElementHeight.setSelection(p.elementHeight  || 60);
  if (w.spinElementSpacing) w.spinElementSpacing.setSelection(p.elementSpacing || 40);
  if (w.spinLayerSpacing)   w.spinLayerSpacing.setSelection(p.layerSpacing    || 180);
  if (w.spinMaxWidth)       w.spinMaxWidth.setSelection(p.maxWidth  || 0);
  if (w.spinMaxHeight)      w.spinMaxHeight.setSelection(p.maxHeight || 0);
  const arIdx = AR_OPTIONS.findIndex(a => a.val === (p.aspectRatio || 0));
  if (w.cmbAspectRatio) w.cmbAspectRatio.select(Math.max(0, arIdx));

  // View
  if (w.txtViewName)   w.txtViewName.setText((c.view && c.view.name)   || "");
  if (w.txtViewSuffix) w.txtViewSuffix.setText((c.view && c.view.suffix) || "");
  if (w.txtViewFolder) w.txtViewFolder.setText((c.view && c.view.folder) || "");

  // Action radio
  const actionId = c.action || ACTION.NEW_VIEW.id;
  Object.values(ACTION).forEach(act => {
    const btn = w["radAction_" + act.id];
    if (btn) btn.setSelection(act.id === actionId);
  });

  // Related elements depth
  const layers = (c.relatedElements && c.relatedElements.layers) || [];
  if (w.spinRelDepth) w.spinRelDepth.setSelection(layers.length > 0 ? (layers[0].depth || 1) : 0);

  _updateAlgorithmControls(dlg);
}

function _saveUI(dlg) {
  const c = dlg.config;
  const w = dlg.widgets;
  if (!c.params) c.params = {};
  if (!c.view)   c.view   = {};

  // Algorithm
  if (w.cmbAlgorithm) {
    const styleName = w.cmbStyle ? Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] : "Flow";
    const algNames  = STYLES[styleName] ? STYLES[styleName].algorithms : [];
    const algIdx    = w.cmbAlgorithm.getSelectionIndex();
    c.algorithm     = (algIdx >= 0 && algNames[algIdx]) ? algNames[algIdx] : "Layered";
  }

  // Direction, routing
  if (w.cmbDirection)   c.params.direction    = DIRECTION_LABELS[w.cmbDirection.getSelectionIndex()];
  if (w.cmbRouting)     c.params.routing      = ROUTING_ALL[w.cmbRouting.getSelectionIndex()];
  if (w.cmbLabelPosition) c.params.labelPosition = LABEL_POS_ALL[w.cmbLabelPosition.getSelectionIndex()];
  if (w.cmbRanking)     c.params.ranking      = RANKING_LABELS[w.cmbRanking.getSelectionIndex()];

  // Nesting
  const nestSel  = w.cmbNestingType ? w.cmbNestingType.getSelectionIndex() : 0;
  const nestType = nestSel > 0 ? RELATION_TYPE_IDS[nestSel - 1] : null;
  c.params.nestingRelationTypes = nestType ? [nestType] : [];

  const revSel  = w.cmbReverseType ? w.cmbReverseType.getSelectionIndex() : 0;
  const revType = revSel > 0 ? RELATION_TYPE_IDS[revSel - 1] : null;
  c.params.reverseRelationTypes = revType ? [revType] : [];

  // Container
  if (w.spinInnerSpacing) c.params.innerSpacing        = w.spinInnerSpacing.getSelection();
  if (w.spinPadding)      c.params.padding             = w.spinPadding.getSelection();
  if (w.chkSortContainers) c.params.sortContainers     = w.chkSortContainers.getSelection();
  if (w.chkAlignSameType)  c.params.alignSameType      = w.chkAlignSameType.getSelection();
  if (w.chkShowInEvery)    c.params.showInEveryContainer = w.chkShowInEvery.getSelection();

  // Size
  if (w.spinElementWidth)   c.params.elementWidth   = w.spinElementWidth.getSelection();
  if (w.spinElementHeight)  c.params.elementHeight  = w.spinElementHeight.getSelection();
  if (w.spinElementSpacing) c.params.elementSpacing = w.spinElementSpacing.getSelection();
  if (w.spinLayerSpacing)   c.params.layerSpacing   = w.spinLayerSpacing.getSelection();
  if (w.spinMaxWidth)       c.params.maxWidth       = w.spinMaxWidth.getSelection();
  if (w.spinMaxHeight)      c.params.maxHeight      = w.spinMaxHeight.getSelection();
  const arIdx = w.cmbAspectRatio ? w.cmbAspectRatio.getSelectionIndex() : 0;
  c.params.aspectRatio = AR_OPTIONS[Math.max(0, arIdx)] ? AR_OPTIONS[Math.max(0, arIdx)].val : 0;

  // View
  if (w.txtViewName)   c.view.name   = w.txtViewName.getText().trim();
  if (w.txtViewSuffix) c.view.suffix = w.txtViewSuffix.getText().trim();
  if (w.txtViewFolder) c.view.folder = w.txtViewFolder.getText().trim();

  // Related elements
  const depth = w.spinRelDepth ? w.spinRelDepth.getSelection() : 0;
  c.relatedElements = depth > 0
    ? { layers: [{ depth, elementTypes: [], relationTypes: [], diagramTypes: [] }] }
    : { layers: [] };
}

// ── Algorithm controls ────────────────────────────────────────────────────────

function _fillAlgorithmCombo(dlg) {
  const w = dlg.widgets;
  if (!w.cmbAlgorithm || !w.cmbStyle) return;
  const styleName = Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] || "Flow";
  const algs = STYLES[styleName] ? STYLES[styleName].algorithms : [];
  w.cmbAlgorithm.removeAll();
  algs.forEach(a => w.cmbAlgorithm.add(a));
  w.cmbAlgorithm.select(0);
}

function _updateAlgorithmControls(dlg) {
  const w = dlg.widgets;
  if (!w.cmbAlgorithm) return;

  const styleName = w.cmbStyle ? Object.keys(STYLES)[w.cmbStyle.getSelectionIndex()] : "Flow";
  const algNames  = STYLES[styleName] ? STYLES[styleName].algorithms : [];
  const algIdx    = w.cmbAlgorithm.getSelectionIndex();
  const algName   = (algIdx >= 0 && algNames[algIdx]) ? algNames[algIdx] : "Layered";
  const alg       = ALGORITHMS[algName] || ALGORITHMS.Layered;

  if (w.lblEngine)     w.lblEngine.setText("Engine: " + alg.engine);
  if (w.lblAlgTooltip) w.lblAlgTooltip.setText(alg.tooltip || "");

  const active = new Set(alg.activeParams || []);
  _setEnabled(w.cmbDirection,     active.has("direction"));
  _setEnabled(w.cmbRouting,       active.has("routing"));
  _setEnabled(w.cmbLabelPosition, active.has("labelPosition"));
  _setEnabled(w.cmbRanking,       active.has("ranking"));
  _setEnabled(w.cmbNestingType,   active.has("nestingRelationTypes"));
  _setEnabled(w.cmbReverseType,   active.has("reverseRelationTypes"));
  _setEnabled(w.spinInnerSpacing, active.has("innerSpacing"));
  _setEnabled(w.spinPadding,      active.has("padding"));
  _setEnabled(w.chkSortContainers,active.has("sortContainers"));
  _setEnabled(w.chkAlignSameType, active.has("alignSameType"));
  _setEnabled(w.chkShowInEvery,   active.has("showInEveryContainer"));
  _setEnabled(w.spinLayerSpacing, active.has("layerSpacing"));
  _setEnabled(w.spinMaxWidth,     active.has("maxWidth"));
  _setEnabled(w.spinMaxHeight,    active.has("maxHeight"));
  _setEnabled(w.cmbAspectRatio,   active.has("aspectRatio"));

  // Filter routing options to supported only
  if (w.cmbRouting && alg.supportedOptions && alg.supportedOptions.routing) {
    const supported = alg.supportedOptions.routing;
    const cur = w.cmbRouting.getSelectionIndex();
    const curLabel = cur >= 0 ? w.cmbRouting.getItem(cur) : "";
    w.cmbRouting.removeAll();
    supported.forEach(r => w.cmbRouting.add(r));
    const newIdx = supported.indexOf(curLabel);
    w.cmbRouting.select(newIdx >= 0 ? newIdx : 0);
  }

  // Label position: add Natural only for Graphviz
  if (w.cmbLabelPosition) {
    const supported = (alg.supportedOptions && alg.supportedOptions.labelPosition) || ["Source", "Middle", "Target"];
    const cur = w.cmbLabelPosition.getSelectionIndex();
    const curLabel = cur >= 0 ? w.cmbLabelPosition.getItem(cur) : "Middle";
    w.cmbLabelPosition.removeAll();
    supported.forEach(lp => w.cmbLabelPosition.add(lp));
    const newIdx = supported.indexOf(curLabel);
    w.cmbLabelPosition.select(newIdx >= 0 ? newIdx : 0);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _setEnabled(widget, enabled) {
  if (widget) widget.setEnabled(enabled);
}

function _addSpinner(container, label, name, defVal, min, max, step, w) {
  new LabelWidget(container, SWT.NONE).setText(label);
  const sp = new SpinnerWidget(container, SWT.BORDER);
  sp.setValues(defVal, min, max, 0, step, step * 5);
  GridDataFactory.swtDefaults().hint(60, SWT.DEFAULT).applyTo(sp);
  w[name] = sp;
}

function _refreshPresetCombo(combo) {
  combo.removeAll();
  PresetIO.listPresets().forEach(n => combo.add(n));
}

function _actionLabel(actionId) {
  const act = Object.values(ACTION).find(a => a.id === actionId);
  return act ? act.label + "  →" : "Run  →";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
