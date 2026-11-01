/**
 * Preset row of the View dialog: the preset picker, the modified indicator (*), Save · Save As… |
 * Rename… · Delete, and the preset's description. Loading a preset fills every tab through the
 * dialog's callbacks (ctx.syncToUI, ctx.saveUI, ctx.recount).
 */
console.log("Loading preset_row.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");
// Loaded with this module, not on the first Save As click: console output from inside an SWT
// handler (as the module's "Loading …" line) blocks until the modal dialog closes.
/** @type {typeof import("./dialog_presets")} */
const PresetsDialog = require(REPO_ROOT + "View/lib/gui/dialog_presets");

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

// ── Modified indicator ────────────────────────────────────────────────────────

/**
 * Show the modified indicator (*) while the settings differ from the saved preset.
 * @param {DialogContext} ctx
 */
function markModified(ctx) {
  if (!ctx._ready || ctx.modified) return;
  ctx.modified = true;
  try { ctx.widgets.lblModified.setVisible(true); } catch (x) {}
}

/** @param {DialogContext} ctx */
function _clearModified(ctx) {
  ctx.modified = false;
  try { ctx.widgets.lblModified.setVisible(false); } catch (x) {}
}

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
 */
function buildPresetRow(parent, ctx) {
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
    ctx.saveUI();
    if (_written(ctx, () => PresetIO.writePreset(presetName(ctx), ctx.config, { quiet: true }))) _afterPresetChange(ctx);
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnSave);

  const btnSaveAs = Widgets.pushBtn(row, "Save As…", "Save the current settings as a new preset.", () => {
    ctx.saveUI();
    _openPresetNameDialog(ctx, "Save As…", "Save the current settings as a new preset.", (newName, description) => {
      if (!_written(ctx, () => PresetIO.writePreset(newName, { ...ctx.config, name: newName, description }, { quiet: true }))) return;
      ctx.config.name        = newName;
      ctx.config.description = description;
      _afterPresetChange(ctx);
    });
  });
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(btnSaveAs);

  const sep = new LabelWidget(row, SWT.SEPARATOR | SWT.VERTICAL);
  GridDataFactory.swtDefaults().hint(SWT.DEFAULT, 20).indent(6, 0).applyTo(sep);

  w.btnRename = Widgets.pushBtn(row, "Rename…", RENAME_TIP, () => {
    const oldName = presetName(ctx);
    _openPresetNameDialog(ctx, "Rename…", `Rename or move preset "${oldName}".`, (newName, description) => {
      const saved = PresetIO.readPreset(oldName, () => {});   // reported when it was loaded
      saved.name        = newName;
      saved.description = description;
      if (!_written(ctx, () => PresetIO.writePreset(newName, saved, { quiet: true }))) return;   // the old one stays
      if (newName !== oldName) PresetIO.deletePreset(oldName);
      ctx.config.name        = newName;
      ctx.config.description = description;
      _afterPresetChange(ctx, { keepModified: true });
    });
  });
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(w.btnRename);

  w.btnDelete = Widgets.pushBtn(row, "Delete", DELETE_TIP, () => {
    const name = presetName(ctx);
    if (name === PresetIO.DEFAULT_PRESET_NAME) return;
    if (!_confirm(ctx, "Delete preset", `Delete preset "${name}"?`)) return;
    try {
      PresetIO.deletePreset(name);
      _loadPreset(ctx, PresetIO.DEFAULT_PRESET_NAME);
    } catch (e) { _warn(ctx, "Preset not deleted", String(/** @type {Error} */ (e).message || e)); }
  });
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnDelete);

  // Row 2: description of the preset (hidden when empty), aligned under the picker.
  new LabelWidget(row, SWT.NONE);
  w.lblPresetDescription = new LabelWidget(row, SWT.WRAP);
  try { w.lblPresetDescription.setForeground(row.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (x) {}
  GridDataFactory.fillDefaults().grab(true, false).span(7, 1).hint(300, SWT.DEFAULT).applyTo(w.lblPresetDescription);

  _afterPresetChange(ctx, { keepModified: true });
}

/**
 * The preset the dialog's settings came from; Default when none.
 * @param {DialogContext} ctx
 * @returns {string}
 */
function presetName(ctx) {
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
    /** @type {string | null} */
    let unknownKeys = null;
    const loaded = PresetIO.readPreset(name, message => { unknownKeys = message; });
    _mergePreset(ctx, loaded);
    ctx.config.name = name;
    ctx.syncToUI();
    ctx.recount();
    if (unknownKeys) _warn(ctx, "Unknown preset keys", unknownKeys);
  } catch (e) {
    _warn(ctx, "Preset not loaded", String(/** @type {Error} */ (e).message || e));
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
  const name = presetName(ctx);
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

// A warning on top of the topmost open dialog: console output would block while it is open.
/**
 * @param {DialogContext} ctx
 * @param {string} title
 * @param {string} message
 */
function _warn(ctx, title, message) {
  const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
  MessageDialog.openWarning(_confirmParent(ctx), title, message);
}

// Run a preset write; a failure is shown, and the dialog does not act as if it was saved (SPEC § 12).
/**
 * @param {DialogContext} ctx
 * @param {() => void} write
 * @returns {boolean} written
 */
function _written(ctx, write) {
  try { write(); return true; }
  catch (e) { _warn(ctx, "Preset not saved", String(/** @type {Error} */ (e).message || e)); return false; }
}

// Name + folder + description dialog for Save As / Rename. Asks before overwriting another preset.
/**
 * @param {DialogContext} ctx
 * @param {string} title
 * @param {string} message
 * @param {(newName: string, description: string) => void} onConfirm
 */
function _openPresetNameDialog(ctx, title, message, onConfirm) {
  const current = presetName(ctx);
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
  module.exports = { buildPresetRow, presetName, markModified };
}
