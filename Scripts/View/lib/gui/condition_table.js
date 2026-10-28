/**
 * Condition table — the one widget for every condition list in the View dialog (condition kinds: rel_filter.js).
 *
 *   ┌ header labels ───────────────────────────────────┐
 *   │ one row per condition: one control per column  ✕ │
 *   └──────────────────────────────────────────────────┘
 *   [+ Add condition]  ☐ Match property  (caller's footer controls)
 *
 * The table keeps its conditions as plain objects; every control writes straight into its condition.
 * Structural changes (add, remove, Match property) rebuild the grid; value changes only
 * refresh enabled states and property lists.
 *
 * Filter lists (opts.filterList) always show at least the default condition (= keep everything) and
 * hand back [] for it; feature lists may be empty. With opts.placeholder an empty feature list
 * shows the default condition switched off, as an example to switch on; untouched, it is handed back
 * as [].
 *
 * Also here: the column sets of the dialog's condition tables (filter, step, nesting, reverse, style).
 */
console.log("Loading condition_table.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");

const { RELATION_TYPE_IDS, RELATION_TYPE_LABELS, ELEMENT_TYPES, ELEMENT_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, compareNames } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const CanvasWidget      = Java.type("org.eclipse.swt.widgets.Canvas");
const RowLayout         = Java.type("org.eclipse.swt.layout.RowLayout");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

const CHECK_SIZE = 16;

/**
 * A drawn checkbox. A disabled GTK checkbox keeps its blue tick and still looks active; this one
 * turns grey when disabled. Mouse click and Space toggle it; Tab moves past it.
 * @param {Swt.Composite} parent
 * @param {boolean} value
 * @param {(value: boolean) => void} onChange
 * @returns {Required<ConditionTableCell> & { canvas: Swt.Canvas }}
 */
function checkBox(parent, value, onChange) {
  const canvas = new CanvasWidget(parent, SWT.NONE);
  let checked = !!value;
  const toggle = () => { if (!canvas.isEnabled()) return; checked = !checked; canvas.redraw(); onChange(checked); };
  canvas.addListener(SWT.Paint, e => {
    const gc = e.gc, d = canvas.getDisplay(), on = canvas.isEnabled();
    const sys = (/** @type {number} */ c) => d.getSystemColor(c);
    const a = canvas.getClientArea();
    const x = Math.floor((a.width - CHECK_SIZE) / 2), y = Math.floor((a.height - CHECK_SIZE) / 2);
    gc.setAntialias(SWT.ON);
    if (checked) {
      gc.setBackground(sys(on ? SWT.COLOR_LIST_SELECTION : SWT.COLOR_WIDGET_NORMAL_SHADOW));
      gc.fillRoundRectangle(x, y, CHECK_SIZE, CHECK_SIZE, 5, 5);
      gc.setForeground(sys(SWT.COLOR_WHITE));
      gc.setLineWidth(2);
      gc.drawLine(x + 4, y + 8, x + 7, y + 11);
      gc.drawLine(x + 7, y + 11, x + 12, y + 5);
    } else {
      gc.setBackground(sys(on ? SWT.COLOR_LIST_BACKGROUND : SWT.COLOR_WIDGET_BACKGROUND));
      gc.fillRoundRectangle(x, y, CHECK_SIZE, CHECK_SIZE, 5, 5);
      gc.setForeground(sys(on ? SWT.COLOR_WIDGET_DARK_SHADOW : SWT.COLOR_WIDGET_NORMAL_SHADOW));
      gc.setLineWidth(1);
      gc.drawRoundRectangle(x, y, CHECK_SIZE - 1, CHECK_SIZE - 1, 5, 5);
    }
    if (canvas.isFocusControl()) { gc.setLineWidth(1); gc.drawFocus(x - 1, y - 1, CHECK_SIZE + 2, CHECK_SIZE + 2); }
  });
  canvas.addListener(SWT.MouseUp, e => { if (e.button === 1) toggle(); });
  canvas.addListener(SWT.KeyDown, e => { if (String(e.character) === " ") toggle(); });
  canvas.addListener(SWT.Traverse, e => { e.doit = true; });
  canvas.addListener(SWT.FocusIn,  () => canvas.redraw());
  canvas.addListener(SWT.FocusOut, () => canvas.redraw());
  return {
    canvas,
    set(v) { checked = !!v; canvas.redraw(); },
    enable(on) { canvas.setEnabled(on); canvas.redraw(); },
    setToolTipText(text) { canvas.setToolTipText(text); },
  };
}

/**
 * Column definition:
 *   key       condition field (count columns: "relations" | "elements")
 *   header    heading; "\n" for two lines
 *   tooltip   heading + cell tooltip
 *   kind      choice  read-only combo; items: [{ value, label }]
 *             check   checkbox (boolean field; col.default false: unchecked when the condition has no value);
 *                     drawn, so a disabled tick is grey (a GTK checkbox keeps its blue)
 *             prop    read-only combo of property names (opts.propItems(condition, key))
 *             value   read-only combo of property values (opts.valueItems(condition, key))
 *             count   read-only count label, set with setCounts; "(n)" or col.format(n)
 *             warn    read-only "⚠" label, set with setWarnings
 *             custom  create(parent, value, onChange) → { set(v), enable(on) }; cells = grid cells used
 *   width     width (px); cells keep it, nothing stretches with the dialog
 *   optional  true: shown only with Match property (or when a condition has a property)
 *   enabled   (condition) => boolean; the cell is greyed when false
 *             A condition that is off (on: false) greys its whole row except the "on" cell and ✕.
 *   onChange  (condition) => void; normalise related fields after this column changed
 *   count     (choice, prop) count key from setCounts shown after the selected item:
 *             "Aggregation (62)"; an empty property shows just "(n)"
 *
 * Types: ConditionTableColumn, ConditionTableOptions, ConditionTable (types/view.d.ts).
 *
 * @template {ConditionKind} K
 * @param {Swt.Composite} parent
 * @param {ConditionTableOptions<K>} opts
 * @returns {ConditionTable<K>}
 */
function conditionTable(parent, opts) {
  const kind = opts.kind;
  const cols = opts.columns;
  // Conditions are read and written by column key, hence the Record view of the condition shape.
  /** @type {(ConditionByKind[K] & Record<string, any>)[]} */
  let conditions    = [];
  /** @type {ConditionTableCounts[]} */
  let counts   = [];
  /** @type {Map<number, string>} */
  let warnings = new Map();
  let propOn   = false;
  let enabled  = true;
  // ctrl: the SWT control or custom cell of the column; its type follows col.kind.
  /** @type {Map<string, { col: ConditionTableColumn<ConditionByKind[K]> | null, ctrl: any, first?: boolean }>[]} */
  let rows     = [];   // per condition: Map key → { col, ctrl, first }
  let optionalShown = false;  // optional columns are in the current grid

  const outer = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(0, 3).applyTo(outer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(outer);
  outer.setData("fitWidth", true);   // the dialog widens rather than cut a condition off (_resizeScrolled)

  // Set by rebuild() before any cell is built.
  let grid = /** @type {Swt.Composite} */ (/** @type {unknown} */ (null));

  const footer = new CompositeWidget(outer, SWT.NONE);
  const rl = new RowLayout(SWT.HORIZONTAL);
  rl.center = true; rl.spacing = 10; rl.marginWidth = 0; rl.marginHeight = 0; rl.wrap = true;
  footer.setLayout(rl);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(footer);

  const btnAdd = new ButtonWidget(footer, SWT.PUSH);
  btnAdd.setText("+ Add condition");
  btnAdd.setToolTipText(opts.addTooltip ||
    "Add a condition. Conditions combine: a match with any Include condition is kept, unless an Exclude condition also matches.");
  btnAdd.addListener(SWT.Selection, () => {
    conditions.push(ConditionLists.defaultCondition(kind));
    rebuild();
    changed();
  });

  /** @type {Swt.Button | null} */
  let chkProp = null;
  if (opts.propCondition) {
    chkProp = new ButtonWidget(footer, SWT.CHECK);
    chkProp.setText("Match property");
    chkProp.setToolTipText("Show columns to match by a property value. Always on when a condition uses it.");
    // Cast: assigned just above; tsc does not keep the narrowing inside the listener.
    chkProp.addListener(SWT.Selection, () => { propOn = /** @type {Swt.Button} */ (chkProp).getSelection(); rebuild(); });
  }
  if (opts.footer) opts.footer(footer);

  const changed = () => { if (opts.onChange) opts.onChange(); };
  // The placeholder condition: the default condition, switched off.
  /** @returns {ConditionByKind[K] & Record<string, any>} */
  const placeholderCondition = () => Object.assign(ConditionLists.defaultCondition(kind), { on: false });
  /** @param {Record<string, any>} r */
  const isPlaceholder = r => {
    const p = placeholderCondition();
    return Object.keys(p).every(k => r[k] === p[k]);
  };
  const fillEmpty = () => {
    if (conditions.length > 0) return;
    if (opts.filterList)  conditions.push(ConditionLists.defaultCondition(kind));
    else if (opts.placeholder) conditions.push(placeholderCondition());
  };
  const anyProperty = () => conditions.some(r => !!r.property);
  const visibleCols = () => {
    const showOptional = propOn || anyProperty();
    return cols.filter(c => !c.optional || showOptional);
  };

  /**
   * @param {Swt.Combo} combo
   * @param {string[]} labels
   * @param {string} selectedLabel
   */
  const comboItems = (combo, labels, selectedLabel) => {
    combo.removeAll();
    labels.forEach(l => combo.add(String(l)));
    let idx = labels.indexOf(selectedLabel);
    if (idx < 0 && selectedLabel) { combo.add(String(selectedLabel)); idx = combo.getItemCount() - 1; }
    combo.select(Math.max(0, idx));
  };
  /**
   * @param {ConditionTableChoiceColumn<ConditionByKind[K]>} col
   * @param {unknown} value
   */
  const choiceLabel = (col, value) => {
    const it = col.items.find(i => i.value === value);
    return it ? it.label : String(value);
  };
  // Item labels of a choice combo for row i; with col.count the selected item carries the count.
  /**
   * @param {ConditionTableChoiceColumn<ConditionByKind[K]>} col
   * @param {Record<string, any>} condition
   * @param {number} i
   */
  const choiceItems = (col, condition, i) => {
    const labels = col.items.map(it => it.label);
    let selected = choiceLabel(col, condition[col.key]);
    const n = col.count && counts[i] ? counts[i][col.count] : undefined;
    if (n !== undefined && n !== null) {
      const idx = col.items.findIndex(it => it.value === condition[col.key]);
      selected = `${selected} (${n})`;
      if (idx >= 0) labels[idx] = selected;
    }
    return { labels, selected };
  };
  /**
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} col
   * @param {ConditionTableCounts | undefined} c
   */
  const countText = (col, c) => {
    const n = c ? c[col.key] : null;
    if (n === null || n === undefined) return "";
    return col.format ? col.format(n) : `(${n})`;
  };
  /**
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K]} condition
   */
  const listItems = (col, condition) => {
    const fn = col.kind === "prop" ? opts.propItems : opts.valueItems;
    return [""].concat((fn ? fn(condition, col.key) : []) || []);
  };
  // Fill a property / value combo. The plain names stay on the control (data "names", as JSON:
  // a JS property on a Java object is dropped) so a decorated label ("Status (14)") never ends
  // up in the condition.
  /**
   * @param {Swt.Combo} c
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {number} i
   */
  const fillList = (c, col, condition, i) => {
    const names = listItems(col, condition);
    const value = condition[col.key] || "";
    if (value && names.indexOf(value) < 0) names.push(value);
    const labels = names.slice();
    const n = col.count && counts[i] ? counts[i][col.count] : undefined;
    const idx = names.indexOf(value);
    if (n !== undefined && n !== null) labels[idx] = value ? `${value} (${n})` : `(${n})`;
    c.setData("names", JSON.stringify(names));
    if (String(c.getText()) === labels[idx] && c.getItemCount() === labels.length) return;
    c.removeAll();
    labels.forEach(l => c.add(String(l)));
    c.select(Math.max(0, idx));
  };

  /**
   * @param {ConditionTableColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {number} i
   * @returns {any} the column's SWT control or custom cell
   */
  function buildCell(col, condition, i) {
    const tip = col.tooltip || "";
    const span = col.cells || 1;
    const gd = () => GridDataFactory.fillDefaults().align(SWT.FILL, SWT.CENTER);
    switch (col.kind) {
      case "choice": {
        const c = new ComboWidget(grid, SWT.READ_ONLY | SWT.DROP_DOWN);
        const ci = choiceItems(col, condition, i);
        comboItems(c, ci.labels, ci.selected);
        gd().hint(col.width || SWT.DEFAULT, SWT.DEFAULT).applyTo(c);
        c.setToolTipText(tip);
        c.addListener(SWT.Selection, () => {
          const it = col.items[c.getSelectionIndex()];
          condition[col.key] = it ? it.value : condition[col.key];
          if (col.onChange) col.onChange(condition);
          refresh(); changed();
        });
        return c;
      }
      case "check": {
        const box = checkBox(grid, condition[col.key] === undefined ? col.default !== false : !!condition[col.key],
          v => { condition[col.key] = v; refresh(); changed(); });
        gd().align(SWT.CENTER, SWT.CENTER).hint(CHECK_SIZE + 2, CHECK_SIZE + 2).applyTo(box.canvas);
        box.setToolTipText(tip);
        return box;
      }
      case "prop":
      case "value": {
        const c = new ComboWidget(grid, SWT.READ_ONLY | SWT.DROP_DOWN);
        fillList(c, col, condition, i);
        gd().hint(col.width || 100, SWT.DEFAULT).applyTo(c);
        c.setToolTipText(tip);
        c.addListener(SWT.Selection, () => {
          const k = c.getSelectionIndex();
          const names = c.getData("names");
          condition[col.key] = k > 0 && names ? String(JSON.parse(String(names))[k]) : "";
          if (col.kind === "prop" && !condition.property) condition.value = "";
          if (col.onChange) col.onChange(condition);
          refresh(); changed();
        });
        return c;
      }
      case "count": {
        const l = new LabelWidget(grid, SWT.NONE);
        l.setText(countText(col, counts[i]));
        gd().hint(col.width || 36, SWT.DEFAULT).applyTo(l);
        l.setToolTipText(tip);
        return l;
      }
      case "warn": {
        const l = new LabelWidget(grid, SWT.NONE);
        l.setText(warnings.has(i) ? "⚠" : "");
        l.setToolTipText(warnings.get(i) || "");
        gd().hint(col.width || 18, SWT.DEFAULT).applyTo(l);
        return l;
      }
      case "custom": {
        const ctrl = col.create(grid, condition[col.key], v => { condition[col.key] = v; refresh(); changed(); });
        if (ctrl.setToolTipText) ctrl.setToolTipText(tip);
        return ctrl;
      }
    }
    return null;
  }

  function rebuild() {
    if (grid) { try { grid.dispose(); } catch (e) {} }
    grid = new CompositeWidget(outer, SWT.NONE);
    grid.moveAbove(footer);
    GridDataFactory.fillDefaults().grab(true, false).applyTo(grid);
    const vc = visibleCols();
    optionalShown = vc.some(c => c.optional);
    const ncells = vc.reduce((n, c) => n + (c.cells || 1), 0) + 1;
    GridLayoutFactory.fillDefaults().numColumns(ncells).margins(0, 0).spacing(6, 2).applyTo(grid);

    for (const col of vc) {
      const h = new LabelWidget(grid, SWT.NONE);
      h.setText(col.header || "");
      if (col.tooltip) h.setToolTipText(col.tooltip);
      GridDataFactory.fillDefaults().span(col.cells || 1, 1).align(SWT.FILL, SWT.END).applyTo(h);
    }
    new LabelWidget(grid, SWT.NONE);  // header of the ✕ column

    rows = conditions.map((condition, i) => {
      /** @type {Map<string, { col: ConditionTableColumn<ConditionByKind[K]> | null, ctrl: any, first?: boolean }>} */
      const cells = new Map();
      vc.forEach((col, ci) => {
        const ctrl = buildCell(col, condition, i);
        cells.set(col.key + "#" + ci, { col, ctrl, first: ci === 0 });
      });
      const btnDel = new ButtonWidget(grid, SWT.PUSH);
      btnDel.setText("✕");
      btnDel.setToolTipText("Remove this condition.");
      GridDataFactory.swtDefaults().hint(28, 22).align(SWT.CENTER, SWT.CENTER).applyTo(btnDel);
      btnDel.addListener(SWT.Selection, () => {
        conditions.splice(conditions.indexOf(condition), 1);
        fillEmpty();
        rebuild(); changed();
      });
      cells.set("#del", { col: null, ctrl: btnDel });
      return cells;
    });

    if (conditions.length === 0) {
      const l = new LabelWidget(grid, SWT.NONE);
      l.setText(opts.emptyText || "No conditions.");
      try { l.setForeground(grid.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (e) {}
      GridDataFactory.fillDefaults().span(ncells, 1).applyTo(l);
    }

    refresh();
    try { outer.layout(true, true); } catch (e) {}
    if (opts.onLayout) opts.onLayout();
  }

  // Enabled states, choice selections (a column's onChange may have changed another field)
  // and property lists, without rebuilding.
  function refresh() {
    rows.forEach((cells, i) => {
      const condition = conditions[i];
      for (const { col, ctrl, first } of cells.values()) {
        if (!ctrl) continue;
        // The first cell of a row carries the row tooltip (e.g. a style condition as a sentence).
        if (first && opts.rowTooltip && ctrl.setToolTipText) { try { ctrl.setToolTipText(opts.rowTooltip(condition)); } catch (e) {} }
        const on = enabled && (!col || ((!col.enabled || col.enabled(condition)) && (condition.on !== false || col.key === "on")));
        if (ctrl.enable) ctrl.enable(on); else { try { ctrl.setEnabled(on); } catch (e) {} }
        if (!col) continue;
        if (col.kind === "choice") {
          const ci = choiceItems(col, condition, i);
          if (String(ctrl.getText()) !== ci.selected) comboItems(ctrl, ci.labels, ci.selected);
        } else if (col.kind === "prop" || col.kind === "value") {
          fillList(ctrl, col, condition, i);
        } else if (col.kind === "custom" && ctrl.set) {
          ctrl.set(condition[col.key]);
        }
      }
    });
    btnAdd.setEnabled(enabled);
    syncPropToggle();
  }

  // Match property: checked and locked while a condition uses a property. When the last property
  // is cleared the columns stay (they are on screen), so the toggle becomes checked and free.
  function syncPropToggle() {
    if (!chkProp) return;
    const locked = anyProperty();
    if (!locked && optionalShown) propOn = true;
    chkProp.setSelection(propOn || locked);
    chkProp.setEnabled(enabled && !locked);
  }

  return {
    /** Normalised conditions; a filter list that keeps everything gives []. */
    getConditions() {
      const out = conditions.map(r => Object.assign(ConditionLists.defaultCondition(kind), r));
      if (opts.filterList) return ConditionLists.isPassAll(kind, out) ? [] : out;
      return opts.placeholder && out.length === 1 && isPlaceholder(out[0]) ? [] : out;
    },
    setConditions(list) {
      conditions = (list || []).map(r => Object.assign(ConditionLists.defaultCondition(kind), r));
      fillEmpty();
      counts = []; warnings = new Map(); propOn = false;
      rebuild();
    },
    /** The rows as shown (normalised; a filter list's default row included), for per-row data. */
    displayedConditions() { return conditions.map(r => Object.assign(ConditionLists.defaultCondition(kind), r)); },
    /** Per-condition counts: [{ relations, elements }] in condition order. */
    setCounts(list) {
      counts = list || [];
      rows.forEach((cells, i) => {
        for (const { col, ctrl } of cells.values()) {
          if (!col) continue;
          if (col.kind === "count") { try { ctrl.setText(countText(col, counts[i])); } catch (e) {} }
          else if (col.kind === "choice" && col.count) {
            const ci = choiceItems(col, conditions[i], i);
            if (String(ctrl.getText()) !== ci.selected) comboItems(ctrl, ci.labels, ci.selected);
          } else if ((col.kind === "prop" || col.kind === "value") && col.count) {
            fillList(ctrl, col, conditions[i], i);
          }
        }
      });
    },
    /** Map condition index → tooltip for the ⚠ column. */
    setWarnings(map) {
      warnings = map || new Map();
      rows.forEach((cells, i) => {
        for (const { col, ctrl } of cells.values()) {
          if (!col || col.kind !== "warn") continue;
          try { ctrl.setText(warnings.has(i) ? "⚠" : ""); ctrl.setToolTipText(warnings.get(i) || ""); } catch (e) {}
        }
      });
    },
    /** Re-read property and value lists (after the dialog's dry run). */
    refreshItems() { refresh(); },
    enable(on) { enabled = !!on; refresh(); },
    footer,
  };
}

// ── Column sets ───────────────────────────────────────────────────────────────
// The condition tables of the View dialog (condition kinds: rel_filter.js).
/** @type {ConditionTableItem} */
const _ALL = { value: "", label: "All" };
const ELEMENT_ITEMS  = Object.freeze([_ALL, ...ELEMENT_TYPES.map((t, i) => ({ value: t, label: ELEMENT_TYPE_LABELS[i] }))]);
const RELATION_ITEMS = Object.freeze([_ALL, ...RELATION_TYPE_IDS.map((t, i) => ({ value: t, label: RELATION_TYPE_LABELS[i] }))
  .sort((a, b) => compareNames(a.label, b.label))]);
const DIAGRAM_ITEMS  = Object.freeze([_ALL, ...Object.keys(DIAGRAM_TYPE_ID_TO_LABEL).map(k => ({ value: k, label: DIAGRAM_TYPE_ID_TO_LABEL[k] }))]);
const MODE_ITEMS = Object.freeze([{ value: "include", label: "Include" }, { value: "exclude", label: "Exclude" }]);
const DIRECTION_ITEMS = Object.freeze([
  { value: "either", label: "Either" }, { value: "outgoing", label: "Outgoing" }, { value: "incoming", label: "Incoming" },
]);
const STEP_PROP_OF_ITEMS = Object.freeze([
  { value: "added", label: "Added element" }, { value: "relation", label: "Added relation" },
  { value: "previous", label: "Previous element" },
]);
const STYLE_COLOR_ITEMS = Object.freeze([
  { value: "element", label: "Element (own property)" }, { value: "relation", label: "Relation" },
  { value: "source", label: "Source element" }, { value: "target", label: "Target element" },
]);
const REL_PROP_OF_ITEMS = Object.freeze([
  { value: "relation", label: "Relation" }, { value: "source", label: "Source element" },
  { value: "target", label: "Target element" },
]);
const STYLE_PROP_OF_ITEMS = Object.freeze([
  { value: "element", label: "Element" }, { value: "relation", label: "Relation" },
  { value: "source", label: "Source element" }, { value: "target", label: "Target element" },
]);

// Filter lists start from everything, feature lists (Nesting, Reverse) from nothing (rel_filter.js).
/** @type {ConditionTableChoiceColumn} */
const _modeCol = { key: "mode", header: "Mode", kind: "choice", items: MODE_ITEMS, width: 93,
  tooltip: "Include keeps what matches; Exclude removes it.\n" +
           "No Include condition: all is kept, minus Exclude. All Include conditions off: nothing is kept." };
/** @type {ConditionTableChoiceColumn} */
const _featureModeCol = Object.assign({}, _modeCol, {
  tooltip: "Include picks the matching relations; Exclude takes them out again.\n" +
           "No Include condition that is on: nothing is picked." });
/** @type {ConditionTablePlainColumn} */
const _onCol = { key: "on", header: "On", kind: "check", tooltip: "Switch this condition on or off without deleting it." };
/**
 * @param {string} key
 * @param {string} header
 * @param {string} tooltip
 * @param {number} [width]
 * @returns {ConditionTableChoiceColumn}
 */
const _typeCol = (key, header, tooltip, width) => ({ key, header, tooltip, kind: "choice", items: ELEMENT_ITEMS, width: width || 150 });
/**
 * @param {string} key
 * @param {string} header
 * @param {string} tooltip
 * @returns {ConditionTableChoiceColumn}
 */
const _relCol  = (key, header, tooltip) => ({ key, header, tooltip, kind: "choice", items: RELATION_ITEMS, width: 136 });
/**
 * @param {string} what
 * @returns {ConditionTableColumn<{ property: string }>[]}
 */
const _propCols = what => [
  { key: "property", header: "Property", kind: "prop", width: 110, optional: true,
    tooltip: `Only ${what} whose property has this value. Leave empty to match any property.` },
  { key: "value", header: "Value", kind: "value", width: 100, optional: true, enabled: r => !!r.property,
    tooltip: `Only ${what} whose property has this value.` },
];
const _COUNT_TIP = "(n): relations / elements this step adds with only this condition. Conditions can overlap, so the sum can " +
                   "exceed the step total. For an Exclude condition: how many it removes from the other conditions' result.";

// Global filter: the type combo shows the condition's count, "Business Actor (12)".
const _FILTER_COUNT_TIP = "\n(n): how many this condition keeps on its own; for an Exclude condition, how many it removes " +
                          "from the other conditions' result.";
/** @type {readonly ConditionTableColumn<ElementCondition>[]} */
const ELEMENT_CONDITION_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  Object.assign(_typeCol("elementType", "Element type", "Type to match. All = any type." + _FILTER_COUNT_TIP, 200), { count: "count" }),
  ..._propCols("match elements"),
]);
/** @type {readonly ConditionTableColumn<DiagramCondition>[]} */
const DIAGRAM_CONDITION_COLUMNS = Object.freeze([
  _onCol, _modeCol, { key: "diagramType", header: "Diagram type", kind: "choice", items: DIAGRAM_ITEMS, width: 180, count: "count",
              tooltip: "Type to match. All = any type." + _FILTER_COUNT_TIP },
]);
/** @type {readonly ConditionTableChoiceColumn[]} */
const RELATION_CONDITION_COLUMNS = Object.freeze([
  _modeCol,
  _typeCol("source", "Source type", "Element type at the start of the relation. All = any type."),
  _relCol("relation", "Relation type", "Relationship type. All = any type."),
  _typeCol("target", "Target type", "Element type at the end of the relation. All = any type."),
]);
// Nesting / reverse: the relation-type combo shows the condition's count, "Aggregation (62)".
const _countedRelCol = Object.assign({}, RELATION_CONDITION_COLUMNS[2], { count: "relations", width: 166,
  tooltip: "Relationship type. All = any type.\n(n): relations on the view this condition matches on its own; " +
           "for an Exclude condition, how many it removes from the other conditions' matches." });
/** @type {ConditionTableColumn<RelationCondition>[]} */
const _COUNTED_FEATURE_COLUMNS = [_onCol, _featureModeCol, RELATION_CONDITION_COLUMNS[1], _countedRelCol, RELATION_CONDITION_COLUMNS[3],
  { key: "propertyOf", header: "Property of", kind: "choice", items: REL_PROP_OF_ITEMS, width: 120, optional: true,
    tooltip: "Where the property is read: the relation, its source or its target element." },
  ..._propCols("relations")];
/** @type {readonly ConditionTableColumn<RelationCondition>[]} */
const NESTING_CONDITION_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "everyContainer", header: "Every", kind: "check", width: 40, default: false,
    enabled: r => r.mode !== "exclude",
    tooltip: "A child with several parents: on = it appears in every parent; off = it appears in one parent " +
             "and the other relations are drawn as a line." },
  { key: "nested", header: "Nested", kind: "count", width: 50, format: n => String(n),
    tooltip: "Of those relations, how many are drawn as nesting. The others are drawn as a line: " +
             "their child already has a parent, or they form a circular nesting." }]);
// Reverse: an empty cell where Nesting has its Nested count, so both tables line up.
/** @type {readonly ConditionTableColumn<RelationCondition>[]} */
const REVERSE_CONDITION_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "_spacer", header: "", kind: "count", width: 40 },
  { key: "_spacer2", header: "", kind: "count", width: 50 }]);
/** @type {readonly ConditionTableColumn<RelationCondition>[]} */
const FILTER_RELATION_CONDITION_COLUMNS = Object.freeze([_onCol, RELATION_CONDITION_COLUMNS[0], RELATION_CONDITION_COLUMNS[1],
  Object.assign({}, RELATION_CONDITION_COLUMNS[2], { count: "count", width: 166,
    tooltip: "Relationship type. All = any type.\n(n): relations between the filtered elements this condition keeps on its own; " +
             "for an Exclude condition, how many it removes from the other conditions' result." }),
  RELATION_CONDITION_COLUMNS[3]]);
/** @type {readonly ConditionTableColumn<StepCondition>[]} */
const STEP_CONDITION_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  _typeCol("previous", "Previous step\nelements",
    "Only elements of this type from the previous step are expanded (step 1: the filtered selection). All = any.", 150),
  { key: "direction", header: "Direction", kind: "choice", items: DIRECTION_ITEMS, width: 90,
    tooltip: "Outgoing: the relation starts at an element of the previous step.\n" +
             "Incoming: the relation ends at an element of the previous step.\nEither: both (default)." },
  // The condition's counts sit after the chosen type: "Aggregation (18)", "Business Service (5)".
  Object.assign(_relCol("relation", "Added\nrelations", "Relationship types to follow from the previous step.\n" + _COUNT_TIP),
    { count: "relations", width: 166 }),
  Object.assign(_typeCol("added", "Added\nelements", "Types of the elements this step adds.\n" + _COUNT_TIP, 180),
    { count: "elements" }),
  { key: "propertyOf", header: "Property of", kind: "choice", items: STEP_PROP_OF_ITEMS, width: 120, optional: true,
    tooltip: "Where the property is read: the added element, the followed relation or the element from the previous step." },
  ..._propCols("add elements"),
]);
/** @type {readonly ConditionTableColumn<StyleCondition>[]} */
const STYLE_CONDITION_COLUMNS = Object.freeze([
  _onCol,
  { key: "color", header: "Color", kind: "choice", items: STYLE_COLOR_ITEMS, width: 150,
    tooltip: "What gets the color: the element itself (using its own property), the relation, " +
             "or the source / target element of a matching relation.",
    // Element colors by its own property; a relation has no "element" to read from.
    onChange: r => {
      if (r.color === "element") r.propertyOf = "element";
      else if (r.color === "relation" && r.propertyOf === "element") r.propertyOf = "relation";
    } },
  _typeCol("source", "Source", "Element type at the start of the relation (Color = Element: the element type). All = any.", 140),
  Object.assign(_relCol("relation", "Relation", "Relationship type. All = any type."),
    { width: 105, enabled: (/** @type {StyleCondition} */ r) => r.color !== "element" }),
  Object.assign(_typeCol("target", "Target", "Element type at the end of the relation. All = any.", 140),
    { enabled: (/** @type {StyleCondition} */ r) => r.color !== "element" }),
  { key: "propertyOf", header: "Property of", kind: "choice", items: STYLE_PROP_OF_ITEMS, width: 120,
    enabled: r => r.color !== "element",
    tooltip: "Whose property supplies the value: the element, the relation, its source or its target." },
  { key: "property", header: "Property", kind: "prop", width: 140, count: "count",
    tooltip: "The property whose values give the colors.\n(n): objects on the view this condition colors " +
             "(no property chosen yet: objects it reaches)." },
  { key: "colorRange", header: "Range", kind: "custom", cells: 2, create: (p, v, on) => Widgets.rangeCell(p, v, on),
    tooltip: "Colors from low to high value of the property." },
  { key: "warn", kind: "warn" },
]);

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    conditionTable,
    ELEMENT_CONDITION_COLUMNS, DIAGRAM_CONDITION_COLUMNS, NESTING_CONDITION_COLUMNS, REVERSE_CONDITION_COLUMNS, FILTER_RELATION_CONDITION_COLUMNS, STEP_CONDITION_COLUMNS, STYLE_CONDITION_COLUMNS,
  };
}
