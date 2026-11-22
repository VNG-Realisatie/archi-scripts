/**
 * The tree dialog: a window in the middle of the View dialog to choose a view of the model, or a folder of
 * its Views tree, from a tree with a filter. A "…" button beside a text field opens it.
 *
 * treeButton(parent, opts) — the button; its dialog fills the field's value through opts.onChange
 * chooseFromTree(opts)     — the dialog: the chosen name, or null when cancelled
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading dialog_tree.js");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");

const SWT               = Java.type("org.eclipse.swt.SWT");
const TextWidget        = Java.type("org.eclipse.swt.widgets.Text");
const TreeWidget        = Java.type("org.eclipse.swt.widgets.Tree");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");
const TitleAreaDialog   = Java.type("org.eclipse.jface.dialogs.TitleAreaDialog");
const IDialogConstants  = Java.type("org.eclipse.jface.dialogs.IDialogConstants");
const InputDialog       = Java.type("org.eclipse.jface.dialogs.InputDialog");
const MessageDialog     = Java.type("org.eclipse.jface.dialogs.MessageDialog");
const WindowConstants   = Java.type("org.eclipse.jface.window.Window");

const TREE_WIDTH  = 420;
const TREE_HEIGHT = 340;

/**
 * @typedef {object} ChooseFromTreeOptions
 * @property {Swt.Shell} parentShell  the calling dialog's shell: this dialog opens in the middle of it
 * @property {string}   title
 * @property {readonly string[]} names  views: "folder/sub/name"; folders: "/A", "/A/B"
 * @property {string}   current       selected on open: a view's name, a folder ("/" = Views itself), or ""
 * @property {boolean}  [folders]     the names are folders: every folder can be chosen, and a new one made
 */

/**
 * Open the tree dialog.
 * @param {ChooseFromTreeOptions} opts
 * @returns {string | null}  the chosen view's name or folder; null when cancelled
 */
function chooseFromTree({ parentShell, title, names, current, folders = false }) {
  /** @type {JFace.TitleAreaDialog} */
  let dlg;
  /** @type {string | null} */
  let result = null;
  /** @type {Swt.Tree} */
  let tree;
  /** @type {Swt.Text} */
  let txtFilter;
  /** @type {Swt.Button} */
  let btnChoose;
  const added = /** @type {string[]} */ ([]);   // folders made here: in the tree, not yet in the model
  let selected = current;

  const fill = () => {
    const filter = txtFilter.getText().trim().toLowerCase();
    if (folders) Widgets.fillFolderTree(tree, [...names, ...added], filter, selected);
    else Widgets.fillTree(tree, names, [], filter, selected);
    showSelected();
  };

  /** @returns {string | null} the name of the selected item; null for a folder that cannot be chosen */
  const selectedName = () => {
    const item = tree.getSelection()[0];
    const name = item && item.getData("name");
    return name ? String(name) : null;
  };

  const showSelected = () => {
    const name = selectedName();
    if (name !== null) selected = name;
    if (btnChoose) btnChoose.setEnabled(name !== null);
  };

  const newFolder = () => {
    const parent = selectedName() || "/";
    const input = new InputDialog(dlg.getShell(), "New folder", `New folder in ${parent === "/" ? "Views" : parent}:`, "", null);
    if (input.open() !== WindowConstants.OK) return;
    const name = String(input.getValue() || "").trim();
    if (!name) return;
    const path = `${parent === "/" ? "" : parent}/${name}`;
    if (name.includes("/")) { MessageDialog.openWarning(dlg.getShell(), "Name not allowed", "A folder name has no \"/\"."); return; }
    if ([...names, ...added].includes(path)) { MessageDialog.openWarning(dlg.getShell(), "Folder exists", `${path} exists already.`); return; }
    added.push(path);
    selected = path;
    txtFilter.setText("");
    fill();
  };

  const choose = () => {
    const name = selectedName();
    if (name === null) return;
    result = name;
    Java.super(dlg).okPressed();
  };

  const dlgImpl = {
    /** @param {Swt.Composite} parent */
    createDialogArea(parent) {
      /** @type {Swt.Composite} */
      const area = Java.super(dlg).createDialogArea(parent);
      dlg.setTitle(title);
      dlg.setMessage(folders ? "Choose a folder, or make a new one. A new folder is made when the view is saved." : "Choose a view of the model.");
      GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).spacing(4, 6).applyTo(area);

      txtFilter = new TextWidget(area, SWT.SEARCH | SWT.ICON_CANCEL | SWT.BORDER);
      txtFilter.setMessage("Filter");
      GridDataFactory.fillDefaults().grab(true, false).applyTo(txtFilter);
      tree = new TreeWidget(area, SWT.SINGLE | SWT.V_SCROLL | SWT.H_SCROLL | SWT.BORDER);
      GridDataFactory.fillDefaults().grab(true, true).hint(TREE_WIDTH, TREE_HEIGHT).applyTo(tree);

      if (folders) {
        const bar = new CompositeWidget(area, SWT.NONE);
        GridLayoutFactory.fillDefaults().numColumns(1).applyTo(bar);
        GridDataFactory.fillDefaults().grab(true, false).applyTo(bar);
        const btnNew = new ButtonWidget(bar, SWT.PUSH);
        btnNew.setText("New folder…");
        btnNew.addListener(SWT.Selection, newFolder);
      }

      txtFilter.addListener(SWT.Modify, fill);
      txtFilter.addListener(SWT.DefaultSelection, () => {
        const items = tree.getItems();
        const first = items.length ? Widgets.firstName(folders ? items[0].getItems() : items) : null;
        if (!first) return;
        tree.setSelection(first);
        showSelected();
        choose();
      });
      txtFilter.addListener(SWT.KeyDown, e => { if (e.keyCode === SWT.ARROW_DOWN) tree.setFocus(); });
      tree.addListener(SWT.Selection, showSelected);
      tree.addListener(SWT.DefaultSelection, () => {
        const item = tree.getSelection()[0];
        if (!item) return;
        if (item.getData("name")) choose();
        else item.setExpanded(!item.getExpanded());
      });
      return area;
    },

    /** @param {number} buttonId */
    buttonPressed(buttonId) {
      if (buttonId === IDialogConstants.CANCEL_ID) Java.super(dlg).cancelPressed();
      else choose();
    },

    /** @param {Swt.Composite} parent */
    createButtonsForButtonBar(parent) {
      Java.super(dlg).createButton(parent, IDialogConstants.CANCEL_ID, "Cancel", false);
      btnChoose = Java.super(dlg).createButton(parent, IDialogConstants.OK_ID, "Choose", true);
      fill();   // the tree is filled once the button exists: it follows the selection
      txtFilter.setFocus();
    },

    isResizable()     { return true; },
    isHelpAvailable() { return false; },
  };

  const TreeDialog = Java.extend(TitleAreaDialog, dlgImpl);
  // No console output here: called from an SWT handler, where it blocks until the dialog closes.
  dlg = new TreeDialog(parentShell);
  dlg.open();
  return result;
}

/**
 * A "…" button beside a text field: it opens the tree dialog, the field's current value selected; the
 * chosen name goes to onChange (the caller fills the field). With `folders` the names are folder paths.
 * @param {Swt.Composite} parent
 * @param {{ title: string, items: () => readonly string[], current: () => string, onChange: (name: string) => void,
 *           tooltip?: string, folders?: boolean }} opts
 * @returns {Swt.Button}
 */
function treeButton(parent, opts) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText("…");
  if (opts.tooltip) btn.setToolTipText(opts.tooltip);
  btn.addListener(SWT.Selection, () => {
    const chosen = chooseFromTree({ parentShell: btn.getShell(), title: opts.title, names: opts.items(),
                                    current: opts.current(), folders: !!opts.folders });
    if (chosen !== null) opts.onChange(chosen);
  });
  return btn;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { chooseFromTree, treeButton };
}
