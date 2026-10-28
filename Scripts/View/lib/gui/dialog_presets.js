/**
 * Preset management dialog.
 * Opened from the main dialog's [Manage…] button.
 * Lists all saved presets with a filter; allows rename and delete.
 */
console.log("Loading dialog_presets.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const PresetIO = require(REPO_ROOT + "View/lib/preset_io");

const SWT               = Java.type("org.eclipse.swt.SWT");
const TextWidget        = Java.type("org.eclipse.swt.widgets.Text");
const ListWidget        = Java.type("org.eclipse.swt.widgets.List");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

function open() {
  let dlg;

  const dlgImpl = {
    createDialogArea: function(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle("Manage Presets");
      dlg.setMessage("Rename or delete saved presets.");

      // 1-column on area (TitleAreaDialog adds a separator as first child — applying numColumns > 1
      // directly to area shifts all our widgets by one cell, putting buttons on the wrong side).
      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).spacing(4, 4).applyTo(area);

      // Wrapper holds our 2-column layout: [filter / list] | [buttons]
      const wrapper = new CompositeWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, true).applyTo(wrapper);
      GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 4).applyTo(wrapper);

      // Row 1, col 1 — filter text
      const txtFilter = new TextWidget(wrapper, SWT.SEARCH | SWT.ICON_CANCEL);
      GridDataFactory.fillDefaults().grab(true, false).applyTo(txtFilter);

      // Col 2, rows 1+2 — buttons (spans both the filter row and the list row)
      const btnCol = new CompositeWidget(wrapper, SWT.NONE);
      GridDataFactory.fillDefaults().grab(false, true).span(1, 2).applyTo(btnCol);
      GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(4, 6).applyTo(btnCol);

      // Row 2, col 1 — list
      const list = new ListWidget(wrapper, SWT.BORDER | SWT.SINGLE | SWT.V_SCROLL);
      GridDataFactory.fillDefaults().grab(true, true).hint(SWT.DEFAULT, 200).applyTo(list);

      // ── Buttons ───────────────────────────────────────────────────────────────
      const btnRename = new ButtonWidget(btnCol, SWT.PUSH);
      btnRename.setText("Rename…");
      GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(btnRename);
      btnRename.addListener(SWT.Selection, e => {
        const idx = list.getSelectionIndex();
        if (idx < 0) return;
        const oldName = list.getItem(idx);
        const newName = window.prompt("New name for preset:", oldName);
        if (newName && newName !== oldName) {
          try {
            const preset = PresetIO.readPreset(oldName);
            preset.name = newName;
            PresetIO.writePreset(newName, preset);
            PresetIO.deletePreset(oldName);
            refreshList();
          } catch (err) { console.error("Rename failed: " + err); }
        }
      });

      const btnDelete = new ButtonWidget(btnCol, SWT.PUSH);
      btnDelete.setText("Delete");
      GridDataFactory.swtDefaults().hint(110, SWT.DEFAULT).applyTo(btnDelete);
      btnDelete.addListener(SWT.Selection, e => {
        const idx = list.getSelectionIndex();
        if (idx < 0) return;
        const name = list.getItem(idx);
        if (window.confirm(`Delete preset "${name}"?`)) {
          PresetIO.deletePreset(name);
          refreshList();
        }
      });

      // ── Filter logic ──────────────────────────────────────────────────────────
      let allNames = PresetIO.listPresets();

      function applyFilter() {
        const q = txtFilter.getText().toLowerCase();
        list.removeAll();
        allNames.filter(n => n.toLowerCase().includes(q)).forEach(n => list.add(n));
        if (list.getItemCount() > 0) list.select(0);
      }

      function refreshList() {
        allNames = PresetIO.listPresets();
        applyFilter();
      }

      txtFilter.addListener(SWT.Modify, () => applyFilter());
      txtFilter.addListener(SWT.DefaultSelection, () => {
        if (list.getItemCount() > 0) { list.select(0); list.setFocus(); }
      });

      applyFilter();

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
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { open };
}
