/**
 * Preset row of the View dialog: the preset picker, the modified indicator (*), Save · Save As… |
 * Rename… · Delete, and the preset's description (a field). Loading a preset fills every tab through the
 * dialog's callbacks (ctx.syncToUI, ctx.saveUI, ctx.recount).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading preset_row.js");

/** @type {typeof import("../preset_io")} */
const PresetIO = require(REPO_ROOT + "View/lib/preset_io");
/** @type {typeof import("../view_recipe_read")} */
const ViewRecipeRead = require(REPO_ROOT + "View/lib/view_recipe_read");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const GC                = Java.type("org.eclipse.swt.graphics.GC");
const InputDialog       = Java.type("org.eclipse.jface.dialogs.InputDialog");
const WindowConstants   = Java.type("org.eclipse.jface.window.Window");
const FileDialog        = Java.type("org.eclipse.swt.widgets.FileDialog");
const File              = Java.type("java.io.File");
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
  try { ctx.widgets.lblModified.setVisible(true); } catch (x) {}   // silent: may be disposed
  ctx.refreshAction();
}

/** @param {DialogContext} ctx */
function _clearModified(ctx) {
  ctx.modified = false;
  try { ctx.widgets.lblModified.setVisible(false); } catch (x) {}   // silent: may be disposed
  ctx.refreshAction();
}

const SAVE_TIP    = "Overwrite this preset with the current settings.";
const RENAME_TIP  = "Rename or move the saved preset.\nUnsaved changes are kept in the dialog, not written.";
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

  w.btnSave = Widgets.pushBtn(row, "Save", SAVE_TIP, () => _save(ctx));
  GridDataFactory.swtDefaults().hint(70, SWT.DEFAULT).applyTo(w.btnSave);

  const btnSaveAs = Widgets.pushBtn(row, "Save As…", "Save the current settings as a new preset.", () => _saveAs(ctx));
  GridDataFactory.swtDefaults().hint(90, SWT.DEFAULT).applyTo(btnSaveAs);

  const sep = new LabelWidget(row, SWT.SEPARATOR | SWT.VERTICAL);
  GridDataFactory.swtDefaults().hint(SWT.DEFAULT, 20).indent(6, 0).applyTo(sep);

  w.btnRename = Widgets.pushBtn(row, "Rename…", RENAME_TIP, () => {
    const oldName = presetName(ctx);
    const newName = _chooseFile(ctx, "Rename…", oldName);
    if (!newName || newName === oldName) return;
    const saved = PresetIO.readPreset(oldName, () => {});   // reported when it was loaded
    saved.name = newName;
    if (!_written(ctx, () => PresetIO.writePreset(newName, saved, { quiet: true }))) return;   // the old one stays
    PresetIO.deletePreset(oldName);
    ctx.config.name = newName;
    _afterPresetChange(ctx, { keepModified: true });
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

  // Row 2: the preset's description as text, room for two lines, with Edit… behind it; saved with Save.
  new LabelWidget(row, SWT.NONE);
  w.lblPresetDescription = new LabelWidget(row, SWT.WRAP);
  w.lblPresetDescription.setForeground(row.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY));
  const gc = new GC(w.lblPresetDescription);
  const lineHeight = gc.getFontMetrics().getHeight();
  gc.dispose();
  GridDataFactory.fillDefaults().grab(true, false).span(6, 1).hint(300, 2 * lineHeight).applyTo(w.lblPresetDescription);
  w.btnEditDescription = Widgets.pushBtn(row, "Edit…", "Edit the description of the preset; Save writes it.", () => _editDescription(ctx));
  GridDataFactory.swtDefaults().align(SWT.FILL, SWT.TOP).applyTo(w.btnEditDescription);

  _afterPresetChange(ctx, { keepModified: true });
}

// ── Save and the recipe link ──────────────────────────────────────────────────

/**
 * Save: overwrite the preset. With a recipe as the start the preset is linked to it; a preset linked to
 * another recipe asks first: move the link, or save as a new preset.
 * @param {DialogContext} ctx
 */
function _save(ctx) {
  ctx.saveUI();
  const start = ctx.recipeStart, link = ctx.config.recipe;
  if (start && link && link.id !== start.linked.grouping.id) {
    const choice = _moveOrNew(ctx, link, start);
    if (choice === 1) { _saveAs(ctx); return; }
    if (choice !== 0) return;
  }
  const name = presetName(ctx);
  const recipe = _recipeLink(ctx, start);
  if (!_written(ctx, () => PresetIO.writePreset(name, { ...ctx.config, recipe }, { quiet: true }))) return;
  ctx.config.recipe = recipe;
  if (start) ViewRecipeRead.writeViewPreset(start, name);
  _afterPresetChange(ctx);
}

/**
 * Save As: the settings as a new preset, linked to the recipe of the start; with any other start it is
 * linked to none, so two presets never share a recipe by a copy.
 * @param {DialogContext} ctx
 */
function _saveAs(ctx) {
  ctx.saveUI();
  const current = presetName(ctx);
  const newName = _chooseFile(ctx, "Save As…", current === PresetIO.DEFAULT_PRESET_NAME ? "" : current);
  if (!newName) return;
  const start = ctx.recipeStart;
  const recipe = start ? _recipeLink(ctx, start) : null;
  if (!_written(ctx, () => PresetIO.writePreset(newName, { ...ctx.config, name: newName, recipe }, { quiet: true }))) return;
  ctx.config.name = newName;
  ctx.config.recipe = recipe;
  if (start) ViewRecipeRead.writeViewPreset(start, newName);
  _afterPresetChange(ctx);
}

/**
 * The recipe link Save writes: the recipe of the start, else the preset's own with the recipe's name now.
 * @param {DialogContext} ctx
 * @param {RecipeStart | null | undefined} start
 * @returns {RecipeLink | null}
 */
function _recipeLink(ctx, start) {
  if (start) return { id: start.linked.grouping.id, name: start.linked.grouping.name };
  const link = ctx.config.recipe;
  if (!link) return null;
  const name = ViewRecipeRead.linkedName(link);
  return { id: link.id, name: name === null ? link.name : name };
}

/**
 * The preset belongs to another recipe than the start's: move the link, or save as a new preset.
 * @param {DialogContext} ctx
 * @param {RecipeLink}    link
 * @param {RecipeStart}   start
 * @returns {number} 0 move the link, 1 save as a new preset, else cancel
 */
function _moveOrNew(ctx, link, start) {
  const MessageDialog = Java.type("org.eclipse.jface.dialogs.MessageDialog");
  const own = ViewRecipeRead.linkedName(link);
  const to = start.linked.grouping.name;
  const message = `Preset "${presetName(ctx)}" belongs to recipe "${own === null ? link.name : own}"; the start is recipe "${to}".\n\n` +
    `Move the link: the preset makes "${to}" from now on, and "${own === null ? link.name : own}" has no preset (the check reports it).\n` +
    `Save As…: a new preset for "${to}"; this preset stays as it is.`;
  const dlg = new MessageDialog(_confirmParent(ctx), "Preset of another recipe", null, message, MessageDialog.QUESTION,
    Java.to(["Move the link", "Save As…", "Cancel"], "java.lang.String[]"), 0);
  return dlg.open();
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
    w.lblPresetDescription.setToolTipText(desc);
    w.btnEditDescription.setEnabled(!isDefault);
    w.btnEditDescription.setToolTipText(isDefault ? DEFAULT_TIP : "Edit the description of the preset; Save writes it.");
  } catch (x) {}   // silent: a dialog update on widgets that may be disposed

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
  const sh = ctx.dlg && ctx.dlg.getShell();
  return sh && !sh.isDisposed() ? sh : shell;
}

// Parent for a confirmation: the Save As dialog when it is open (Overwrite?), else this dialog.
/**
 * @param {DialogContext} ctx
 * @returns {Swt.Shell}
 */
function _confirmParent(ctx) {
  const Display = Java.type("org.eclipse.swt.widgets.Display");
  const own = _dialogShell(ctx);
  const active = Display.getCurrent().getActiveShell();
  if (active && active.getParent && active.getParent() === own) return active;
  return own;
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

// The description in a small dialog of its own: several lines, OK or Cancel. It goes to the settings; Save writes it.
/** @param {DialogContext} ctx */
function _editDescription(ctx) {
  /** @type {JFace.InputDialog} */
  let dlg;
  const Impl = Java.extend(InputDialog, {
    getInputTextStyle() { return SWT.MULTI | SWT.WRAP | SWT.V_SCROLL | SWT.BORDER; },
    /** @param {Swt.Composite} parent */
    createDialogArea(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      const gd = dlg.getText().getLayoutData();
      gd.heightHint = 90;
      gd.widthHint  = 420;
      return area;
    },
  });
  dlg = new Impl(_dialogShell(ctx), "Description", "Description of the preset:", String(ctx.config.description || ""), null);
  if (dlg.open() !== WindowConstants.OK) return;
  ctx.config.description = String(dlg.getValue() || "").trim();
  _afterPresetChange(ctx, { keepModified: true });
  markModified(ctx);
}

// The OS save dialog on the preset folder: name and folder in one step, a new folder with the OS's own
// button. Returns the preset name ("name" or "folder/sub/name"), or null when cancelled or not allowed.
/**
 * @param {DialogContext} ctx
 * @param {string} title
 * @param {string} current  the preset's name, or "" for none
 * @returns {string | null}
 */
function _chooseFile(ctx, title, current) {
  const root  = new File(PresetIO.presetDir()).getCanonicalFile();
  const slash = current.lastIndexOf("/");
  const dlg   = new FileDialog(_dialogShell(ctx), SWT.SAVE);
  dlg.setText(title);
  dlg.setFilterPath(String(new File(root, slash >= 0 ? current.slice(0, slash) : "").getPath()));
  dlg.setFilterNames(Java.to(["Presets (*.json)"], "java.lang.String[]"));
  dlg.setFilterExtensions(Java.to(["*.json"], "java.lang.String[]"));
  dlg.setFileName(current ? current.slice(slash + 1) + ".json" : "");
  dlg.setOverwrite(false);   // asked below, in the dialog's own words
  const chosen = dlg.open();
  if (!chosen) return null;

  const prefix = String(root.getPath()).replace(/\\/g, "/") + "/";
  const path   = String(new File(String(chosen)).getCanonicalPath()).replace(/\\/g, "/");
  if (!path.startsWith(prefix)) {
    _warn(ctx, "Folder not allowed", `A preset is kept in the preset folder or a folder in it:\n${prefix}`);
    return null;
  }
  const name = path.slice(prefix.length).replace(/\.json$/, "");
  if (name === PresetIO.DEFAULT_PRESET_NAME) { _warn(ctx, "Name not allowed", `"${name}" is reserved; choose another name.`); return null; }
  if (name.slice(name.lastIndexOf("/") + 1).startsWith("_")) { _warn(ctx, "Name not allowed", "A name starting with _ is not a preset; choose another name."); return null; }
  if (name !== current && PresetIO.listPresets().includes(name)
      && !_confirm(ctx, "Overwrite preset", `Preset "${name}" already exists. Overwrite it?`)) return null;
  return name;
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
