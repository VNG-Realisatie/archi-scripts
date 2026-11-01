/**
 * Properties tab of the View dialog: the Object ID and the view properties written to the generated view(s).
 */
console.log("Loading tab_properties.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../hidden_properties")} */
const HiddenProps = require(REPO_ROOT + "View/lib/hidden_properties");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");

const SWT             = Java.type("org.eclipse.swt.SWT");
const LabelWidget     = Java.type("org.eclipse.swt.widgets.Label");
const ComboWidget     = Java.type("org.eclipse.swt.widgets.Combo");
const GridDataFactory = Java.type("org.eclipse.jface.layout.GridDataFactory");

/**
 * Build the Properties tab: Object ID and one row per property key of the model's views.
 * @param {Swt.TabFolder} tabFolder
 * @param {DialogContext} ctx
 */
function buildPropertiesTab(tabFolder, ctx) {
  const { page, finish } = Widgets.scrolledTab(tabFolder, "Properties");
  const w = ctx.widgets;
  const onChange = () => ctx.markModified();

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

/**
 * Show ctx.config.viewProperties in the tab.
 * @param {DialogContext} ctx
 */
function syncToUI(ctx) {
  const w = ctx.widgets, c = ctx.config;
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

/**
 * Read the tab into ctx.config.viewProperties.
 * @param {DialogContext} ctx
 */
function saveFromUI(ctx) {
  const w = ctx.widgets, c = ctx.config;
  if (w.vpAddObjectId) c.viewProperties.addObjectId = w.vpAddObjectId.getSelection();
  if (w.vpRows) {
    c.viewProperties.properties = w.vpRows.map(row => ({
      key:     row.key,
      value:   row.cmb.getText().trim(),
      enabled: row.chk.getSelection(),
    }));
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { buildPropertiesTab, syncToUI, saveFromUI };
}
