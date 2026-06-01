/**
 * Preset dialogs.
 *
 * openSaveAs(opts) — Save As… dialog (name + folder + description)
 */
console.log("Loading dialog_presets.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const PresetIO = require(REPO_ROOT + "View/lib/preset_io");

const SWT               = Java.type("org.eclipse.swt.SWT");
const TextWidget        = Java.type("org.eclipse.swt.widgets.Text");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");

// ── Save As / Rename dialog ───────────────────────────────────────────────────

/**
 * Open the Save As… / Rename… dialog.
 *
 * @param {Object} opts
 *   title              {string}   dialog title
 *   message            {string}   subtitle line
 *   defaultName        {string}   pre-filled preset name (may include "folder/" prefix)
 *   defaultFolder      {string}   pre-selected folder, or "" for root
 *   defaultDescription {string}   pre-filled description
 *   showDescription    {boolean}  show description field (default true)
 *   onConfirm          {function(fullName, description)} called on OK
 */
function openSaveAs({
  title, message, defaultName, defaultFolder, defaultDescription,
  showDescription = true, onConfirm,
}) {
  let dlg;

  // Split folder prefix from name
  const slashIdx      = (defaultName || "").lastIndexOf("/");
  const bareName      = slashIdx >= 0 ? defaultName.slice(slashIdx + 1) : (defaultName || "");
  const initialFolder = defaultFolder !== undefined ? defaultFolder
                      : (slashIdx >= 0 ? defaultName.slice(0, slashIdx) : "");

  const ROOT_LABEL       = "(root)";
  const NEW_FOLDER_LABEL = "New folder…";

  // folders is built fresh each time the dialog is created; new folders added via prompt are
  // appended immediately so the combo shows them before the user clicks OK.
  let folders = PresetIO.listFolders();

  const dlgState = {
    txtName:   null,
    cmbFolder: null,
    txtDesc:   null,
  };

  function _rebuildFolderCombo(cmbFolder, selectFolder) {
    cmbFolder.removeAll();
    cmbFolder.add(ROOT_LABEL);
    folders.forEach(f => cmbFolder.add(f));
    cmbFolder.add(NEW_FOLDER_LABEL);
    const idx = selectFolder ? folders.indexOf(selectFolder) + 1 : 0;
    cmbFolder.select(idx >= 0 ? idx : 0);
  }

  const dlgImpl = {
    createDialogArea(parent) {
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle(title || "Save As…");
      dlg.setMessage(message || "");

      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).spacing(4, 6).applyTo(area);

      const wrapper = new CompositeWidget(area, SWT.NONE);
      GridDataFactory.fillDefaults().grab(true, false).applyTo(wrapper);
      const numCols = 2;
      GridLayoutFactory.fillDefaults().numColumns(numCols).margins(0, 0).spacing(8, 6).applyTo(wrapper);

      // ── Name ──
      new LabelWidget(wrapper, SWT.NONE).setText("Name:");
      const txtName = new TextWidget(wrapper, SWT.BORDER | SWT.SINGLE);
      GridDataFactory.fillDefaults().grab(true, false).applyTo(txtName);
      txtName.setText(bareName);
      txtName.selectAll();
      dlgState.txtName = txtName;

      // ── Folder ──
      new LabelWidget(wrapper, SWT.NONE).setText("Folder:");
      const cmbFolder = new ComboWidget(wrapper, SWT.READ_ONLY | SWT.DROP_DOWN);
      GridDataFactory.fillDefaults().grab(true, false).applyTo(cmbFolder);
      _rebuildFolderCombo(cmbFolder, initialFolder);
      dlgState.cmbFolder = cmbFolder;

      // Handle "New folder…" selection immediately so the user sees the result
      cmbFolder.addListener(SWT.Selection, () => {
        const idx   = cmbFolder.getSelectionIndex();
        const count = cmbFolder.getItemCount();
        if (idx !== count - 1) return;  // not "New folder…"
        const newFolder = window.prompt("New folder name:", "");
        if (newFolder && newFolder.trim()) {
          const f = newFolder.trim();
          if (folders.indexOf(f) < 0) folders.push(f);
          _rebuildFolderCombo(cmbFolder, f);
        } else {
          // Revert to previous selection
          _rebuildFolderCombo(cmbFolder, initialFolder);
        }
      });

      // ── Description (optional) ──
      if (showDescription) {
        const lblDesc = new LabelWidget(wrapper, SWT.NONE);
        lblDesc.setText("Description:");
        GridDataFactory.swtDefaults().align(SWT.LEAD, SWT.TOP).applyTo(lblDesc);

        const txtDesc = new TextWidget(wrapper, SWT.BORDER | SWT.MULTI | SWT.WRAP | SWT.V_SCROLL);
        GridDataFactory.fillDefaults().grab(true, false).hint(SWT.DEFAULT, 50).applyTo(txtDesc);
        txtDesc.setText(defaultDescription || "");
        dlgState.txtDesc = txtDesc;
      }

      return area;
    },

    buttonPressed(buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) {
        Java.super(dlg).cancelPressed();
        return;
      }
      // OK
      const name = (dlgState.txtName.getText() || "").trim();
      if (!name) return;

      const idx    = dlgState.cmbFolder.getSelectionIndex();
      const count  = dlgState.cmbFolder.getItemCount();
      let folder   = "";
      if (idx > 0 && idx < count - 1) {
        folder = dlgState.cmbFolder.getItem(idx);
      }
      // idx === 0 → root, idx === count-1 → "New folder…" but that's handled at selection time
      // so it should never be the last item when OK is pressed; fall back to root if it is.

      const fullName    = folder ? folder + "/" + name : name;
      const description = dlgState.txtDesc ? dlgState.txtDesc.getText() : (defaultDescription || "");
      onConfirm(fullName, description);
      Java.super(dlg).okPressed();
    },

    isResizable()     { return false; },
    isHelpAvailable() { return false; },

    createButtonsForButtonBar(parent) {
      Java.super(dlg).createButton(parent, IDialogConstants.CANCEL_ID, "Cancel", false);
      Java.super(dlg).createButton(parent, IDialogConstants.OK_ID,     "OK",     true);
    },
  };

  const SaveAsDialog = Java.extend(TitleAreaDialog, dlgImpl);
  dlg = new SaveAsDialog(shell);
  dlg.open();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { openSaveAs };
}
