/**
 * Rule table — the one widget for every rule list in the View dialog (rule kinds: rel_filter.js).
 *
 *   ┌ header labels ──────────────────────────────┐
 *   │ one row per rule: one control per column  ✕ │
 *   └─────────────────────────────────────────────┘
 *   [+ Add rule]  ☐ Property condition  (caller's footer controls)
 *
 * The table keeps its rules as plain objects; every control writes straight into its rule.
 * Structural changes (add, remove, Property condition) rebuild the grid; value changes only
 * refresh enabled states and property lists.
 *
 * Filter lists (opts.filterList) always show at least the default rule (= keep everything) and
 * hand back [] for it; feature lists may be empty. With opts.placeholder an empty feature list
 * shows the default rule switched off, as an example to switch on; untouched, it is handed back
 * as [].
 */
console.log("Loading rule_table.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../rel_filter")} */
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");

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
 * @returns {Required<RuleTableCell> & { canvas: Swt.Canvas }}
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
 *   key       rule field (count columns: "relations" | "elements")
 *   header    heading; "\n" for two lines
 *   tooltip   heading + cell tooltip
 *   kind      choice  read-only combo; items: [{ value, label }]
 *             check   checkbox (boolean field; col.default false: unchecked when the rule has no value);
 *                     drawn, so a disabled tick is grey (a GTK checkbox keeps its blue)
 *             prop    read-only combo of property names (opts.propItems(rule, key))
 *             value   read-only combo of property values (opts.valueItems(rule, key))
 *             count   read-only count label, set with setCounts; "(n)" or col.format(n)
 *             warn    read-only "⚠" label, set with setWarnings
 *             custom  create(parent, value, onChange) → { set(v), enable(on) }; cells = grid cells used
 *   width     width (px); cells keep it, nothing stretches with the dialog
 *   optional  true: shown only with Property condition (or when a rule has a property)
 *   enabled   (rule) => boolean; the cell is greyed when false
 *             A rule that is off (on: false) greys its whole row except the "on" cell and ✕.
 *   onChange  (rule) => void; normalise related fields after this column changed
 *   count     (choice, prop) count key from setCounts shown after the selected item:
 *             "Aggregation (62)"; an empty property shows just "(n)"
 *
 * Types: RuleTableColumn, RuleTableOptions, RuleTable (types/view.d.ts).
 *
 * @template {RuleKind} K
 * @param {Swt.Composite} parent
 * @param {RuleTableOptions<K>} opts
 * @returns {RuleTable<K>}
 */
function ruleTable(parent, opts) {
  const kind = opts.kind;
  const cols = opts.columns;
  // Rules are read and written by column key, hence the Record view of the rule shape.
  /** @type {(RuleByKind[K] & Record<string, any>)[]} */
  let rules    = [];
  /** @type {RuleTableCounts[]} */
  let counts   = [];
  /** @type {Map<number, string>} */
  let warnings = new Map();
  let propOn   = false;
  let enabled  = true;
  // ctrl: the SWT control or custom cell of the column; its type follows col.kind.
  /** @type {Map<string, { col: RuleTableColumn<RuleByKind[K]> | null, ctrl: any, first?: boolean }>[]} */
  let rows     = [];   // per rule: Map key → { col, ctrl, first }
  let optionalShown = false;  // optional columns are in the current grid

  const outer = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(0, 3).applyTo(outer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(outer);
  outer.setData("fitWidth", true);   // the dialog widens rather than cut a rule off (_resizeScrolled)

  // Set by rebuild() before any cell is built.
  let grid = /** @type {Swt.Composite} */ (/** @type {unknown} */ (null));

  const footer = new CompositeWidget(outer, SWT.NONE);
  const rl = new RowLayout(SWT.HORIZONTAL);
  rl.center = true; rl.spacing = 10; rl.marginWidth = 0; rl.marginHeight = 0; rl.wrap = true;
  footer.setLayout(rl);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(footer);

  const btnAdd = new ButtonWidget(footer, SWT.PUSH);
  btnAdd.setText("+ Add rule");
  btnAdd.setToolTipText(opts.addTooltip ||
    "Add a rule. Rules combine: a match with any Include rule is kept, unless an Exclude rule also matches.");
  btnAdd.addListener(SWT.Selection, () => {
    rules.push(RuleLists.defaultRule(kind));
    rebuild();
    changed();
  });

  /** @type {Swt.Button | null} */
  let chkProp = null;
  if (opts.propCondition) {
    chkProp = new ButtonWidget(footer, SWT.CHECK);
    chkProp.setText("Property condition");
    chkProp.setToolTipText("Show columns to match by a property value. Always on when a rule uses it.");
    // Cast: assigned just above; tsc does not keep the narrowing inside the listener.
    chkProp.addListener(SWT.Selection, () => { propOn = /** @type {Swt.Button} */ (chkProp).getSelection(); rebuild(); });
  }
  if (opts.footer) opts.footer(footer);

  const changed = () => { if (opts.onChange) opts.onChange(); };
  // The placeholder rule: the default rule, switched off.
  /** @returns {RuleByKind[K] & Record<string, any>} */
  const placeholderRule = () => Object.assign(RuleLists.defaultRule(kind), { on: false });
  /** @param {Record<string, any>} r */
  const isPlaceholder = r => {
    const p = placeholderRule();
    return Object.keys(p).every(k => r[k] === p[k]);
  };
  const fillEmpty = () => {
    if (rules.length > 0) return;
    if (opts.filterList)  rules.push(RuleLists.defaultRule(kind));
    else if (opts.placeholder) rules.push(placeholderRule());
  };
  const anyProperty = () => rules.some(r => !!r.property);
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
   * @param {RuleTableChoiceColumn<RuleByKind[K]>} col
   * @param {unknown} value
   */
  const choiceLabel = (col, value) => {
    const it = col.items.find(i => i.value === value);
    return it ? it.label : String(value);
  };
  // Item labels of a choice combo for row i; with col.count the selected item carries the count.
  /**
   * @param {RuleTableChoiceColumn<RuleByKind[K]>} col
   * @param {Record<string, any>} rule
   * @param {number} i
   */
  const choiceItems = (col, rule, i) => {
    const labels = col.items.map(it => it.label);
    let selected = choiceLabel(col, rule[col.key]);
    const n = col.count && counts[i] ? counts[i][col.count] : undefined;
    if (n !== undefined && n !== null) {
      const idx = col.items.findIndex(it => it.value === rule[col.key]);
      selected = `${selected} (${n})`;
      if (idx >= 0) labels[idx] = selected;
    }
    return { labels, selected };
  };
  /**
   * @param {RuleTablePlainColumn<RuleByKind[K]>} col
   * @param {RuleTableCounts | undefined} c
   */
  const countText = (col, c) => {
    const n = c ? c[col.key] : null;
    if (n === null || n === undefined) return "";
    return col.format ? col.format(n) : `(${n})`;
  };
  /**
   * @param {RuleTablePlainColumn<RuleByKind[K]>} col
   * @param {RuleByKind[K]} rule
   */
  const listItems = (col, rule) => {
    const fn = col.kind === "prop" ? opts.propItems : opts.valueItems;
    return [""].concat((fn ? fn(rule, col.key) : []) || []);
  };
  // Fill a property / value combo. The plain names stay on the control (data "names", as JSON:
  // a JS property on a Java object is dropped) so a decorated label ("Status (14)") never ends
  // up in the rule.
  /**
   * @param {Swt.Combo} c
   * @param {RuleTablePlainColumn<RuleByKind[K]>} col
   * @param {RuleByKind[K] & Record<string, any>} rule
   * @param {number} i
   */
  const fillList = (c, col, rule, i) => {
    const names = listItems(col, rule);
    const value = rule[col.key] || "";
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
   * @param {RuleTableColumn<RuleByKind[K]>} col
   * @param {RuleByKind[K] & Record<string, any>} rule
   * @param {number} i
   * @returns {any} the column's SWT control or custom cell
   */
  function buildCell(col, rule, i) {
    const tip = col.tooltip || "";
    const span = col.cells || 1;
    const gd = () => GridDataFactory.fillDefaults().align(SWT.FILL, SWT.CENTER);
    switch (col.kind) {
      case "choice": {
        const c = new ComboWidget(grid, SWT.READ_ONLY | SWT.DROP_DOWN);
        const ci = choiceItems(col, rule, i);
        comboItems(c, ci.labels, ci.selected);
        gd().hint(col.width || SWT.DEFAULT, SWT.DEFAULT).applyTo(c);
        c.setToolTipText(tip);
        c.addListener(SWT.Selection, () => {
          const it = col.items[c.getSelectionIndex()];
          rule[col.key] = it ? it.value : rule[col.key];
          if (col.onChange) col.onChange(rule);
          refresh(); changed();
        });
        return c;
      }
      case "check": {
        const box = checkBox(grid, rule[col.key] === undefined ? col.default !== false : !!rule[col.key],
          v => { rule[col.key] = v; refresh(); changed(); });
        gd().align(SWT.CENTER, SWT.CENTER).hint(CHECK_SIZE + 2, CHECK_SIZE + 2).applyTo(box.canvas);
        box.setToolTipText(tip);
        return box;
      }
      case "prop":
      case "value": {
        const c = new ComboWidget(grid, SWT.READ_ONLY | SWT.DROP_DOWN);
        fillList(c, col, rule, i);
        gd().hint(col.width || 100, SWT.DEFAULT).applyTo(c);
        c.setToolTipText(tip);
        c.addListener(SWT.Selection, () => {
          const k = c.getSelectionIndex();
          const names = c.getData("names");
          rule[col.key] = k > 0 && names ? String(JSON.parse(String(names))[k]) : "";
          if (col.kind === "prop" && !rule.property) rule.value = "";
          if (col.onChange) col.onChange(rule);
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
        const ctrl = col.create(grid, rule[col.key], v => { rule[col.key] = v; refresh(); changed(); });
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

    rows = rules.map((rule, i) => {
      /** @type {Map<string, { col: RuleTableColumn<RuleByKind[K]> | null, ctrl: any, first?: boolean }>} */
      const cells = new Map();
      vc.forEach((col, ci) => {
        const ctrl = buildCell(col, rule, i);
        cells.set(col.key + "#" + ci, { col, ctrl, first: ci === 0 });
      });
      const btnDel = new ButtonWidget(grid, SWT.PUSH);
      btnDel.setText("✕");
      btnDel.setToolTipText("Remove this rule.");
      GridDataFactory.swtDefaults().hint(28, 22).align(SWT.CENTER, SWT.CENTER).applyTo(btnDel);
      btnDel.addListener(SWT.Selection, () => {
        rules.splice(rules.indexOf(rule), 1);
        fillEmpty();
        rebuild(); changed();
      });
      cells.set("#del", { col: null, ctrl: btnDel });
      return cells;
    });

    if (rules.length === 0) {
      const l = new LabelWidget(grid, SWT.NONE);
      l.setText(opts.emptyText || "No rules.");
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
      const rule = rules[i];
      for (const { col, ctrl, first } of cells.values()) {
        if (!ctrl) continue;
        // The first cell of a row carries the row tooltip (e.g. a style rule as a sentence).
        if (first && opts.rowTooltip && ctrl.setToolTipText) { try { ctrl.setToolTipText(opts.rowTooltip(rule)); } catch (e) {} }
        const on = enabled && (!col || ((!col.enabled || col.enabled(rule)) && (rule.on !== false || col.key === "on")));
        if (ctrl.enable) ctrl.enable(on); else { try { ctrl.setEnabled(on); } catch (e) {} }
        if (!col) continue;
        if (col.kind === "choice") {
          const ci = choiceItems(col, rule, i);
          if (String(ctrl.getText()) !== ci.selected) comboItems(ctrl, ci.labels, ci.selected);
        } else if (col.kind === "prop" || col.kind === "value") {
          fillList(ctrl, col, rule, i);
        } else if (col.kind === "custom" && ctrl.set) {
          ctrl.set(rule[col.key]);
        }
      }
    });
    btnAdd.setEnabled(enabled);
    syncPropToggle();
  }

  // Property condition: checked and locked while a rule uses a property. When the last property
  // is cleared the columns stay (they are on screen), so the toggle becomes checked and free.
  function syncPropToggle() {
    if (!chkProp) return;
    const locked = anyProperty();
    if (!locked && optionalShown) propOn = true;
    chkProp.setSelection(propOn || locked);
    chkProp.setEnabled(enabled && !locked);
  }

  return {
    /** Normalised rules; a filter list that keeps everything gives []. */
    getRules() {
      const out = rules.map(r => Object.assign(RuleLists.defaultRule(kind), r));
      if (opts.filterList) return RuleLists.isPassAll(kind, out) ? [] : out;
      return opts.placeholder && out.length === 1 && isPlaceholder(out[0]) ? [] : out;
    },
    setRules(list) {
      rules = (list || []).map(r => Object.assign(RuleLists.defaultRule(kind), r));
      fillEmpty();
      counts = []; warnings = new Map(); propOn = false;
      rebuild();
    },
    /** The rows as shown (normalised; a filter list's default row included), for per-row data. */
    displayedRules() { return rules.map(r => Object.assign(RuleLists.defaultRule(kind), r)); },
    /** Per-rule counts: [{ relations, elements }] in rule order. */
    setCounts(list) {
      counts = list || [];
      rows.forEach((cells, i) => {
        for (const { col, ctrl } of cells.values()) {
          if (!col) continue;
          if (col.kind === "count") { try { ctrl.setText(countText(col, counts[i])); } catch (e) {} }
          else if (col.kind === "choice" && col.count) {
            const ci = choiceItems(col, rules[i], i);
            if (String(ctrl.getText()) !== ci.selected) comboItems(ctrl, ci.labels, ci.selected);
          } else if ((col.kind === "prop" || col.kind === "value") && col.count) {
            fillList(ctrl, col, rules[i], i);
          }
        }
      });
    },
    /** Map rule index → tooltip for the ⚠ column. */
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ruleTable };
}
