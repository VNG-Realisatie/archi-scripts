/**
 * Preset management dialog.
 * Opened from the main dialog's [Manage…] button.
 * Lists all saved presets; allows rename and delete.
 */
console.log("dialog_presets.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const PresetIO = require(REPO_ROOT + "View/lib/preset_io");

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ListWidget        = Java.type("org.eclipse.swt.widgets.List");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

/**
 * Open preset management dialog.
 * Returns the name of the selected preset, or null if cancelled.
 */
function open() {
  let selectedPreset = null;

  let dlg;

  const dlgImpl = {
    createDialogArea: function(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Manage Presets");
      dlg.setMessage("Load, rename, or delete saved presets.");

      GridLayoutFactory.fillDefaults().numColumns(2).margins(8, 8).spacing(6, 6).applyTo(area);

      // Preset list
      const list = new ListWidget(area, SWT.BORDER | SWT.SINGLE | SWT.V_SCROLL);
      GridDataFactory.fillDefaults().grab(true, true).hint(280, 200).applyTo(list);
      dlg._list = list;
      _refreshList(list);

      // Buttons column
      const btnCol = new CompositeWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(false, true).applyTo(btnCol);
      GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 6).applyTo(btnCol);

      const btnLoad = new ButtonWidget(btnCol, SWT.PUSH);
      btnLoad.setText("Load selected");
      GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(btnLoad);
      btnLoad.addListener(SWT.Selection, e => {
        const sel = list.getSelectionIndex();
        if (sel >= 0) { selectedPreset = list.getItem(sel); Java.super(dlg).okPressed(); }
      });

      const btnRename = new ButtonWidget(btnCol, SWT.PUSH);
      btnRename.setText("Rename…");
      GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(btnRename);
      btnRename.addListener(SWT.Selection, e => {
        const sel = list.getSelectionIndex();
        if (sel < 0) return;
        const oldName = list.getItem(sel);
        const newName = window.prompt("New name for preset:", oldName);
        if (newName && newName !== oldName) {
          try {
            const preset = PresetIO.readPreset(oldName);
            preset.name = newName;
            PresetIO.writePreset(newName, preset);
            PresetIO.deletePreset(oldName);
            _refreshList(list);
          } catch (err) { console.error("Rename failed: " + err); }
        }
      });

      const btnDelete = new ButtonWidget(btnCol, SWT.PUSH);
      btnDelete.setText("Delete");
      GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(btnDelete);
      btnDelete.addListener(SWT.Selection, e => {
        const sel = list.getSelectionIndex();
        if (sel < 0) return;
        const name = list.getItem(sel);
        const confirm = window.confirm(`Delete preset "${name}"?`);
        if (confirm) {
          PresetIO.deletePreset(name);
          _refreshList(list);
        }
      });

      return area;
    },

    isResizable:     function() { return true; },
    isHelpAvailable: function() { return false; },

    createButtonsForButtonBar: function(parent) {
      Java.super(dlg).createButton(parent, IDialogConstants.CANCEL_ID, "Close", true);
    },
  };

  const PresetsDialog = Java.extend(TitleAreaDialog, dlgImpl);
  dlg = new PresetsDialog(shell);
  dlg.open();
  return selectedPreset;
}

function _refreshList(list) {
  list.removeAll();
  PresetIO.listPresets().forEach(n => list.add(n));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
