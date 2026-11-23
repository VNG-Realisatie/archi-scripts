/**
 * Condition table — the one widget for every condition list in the View dialog (condition kinds: rel_filter.js).
 *
 *   ┌ header ───────────────────────────────────────────┐
 *   │ one row per condition: one cell per column      ✕ │   one native table; every cell is drawn
 *   └───────────────────────────────────────────────────┘
 *   [+ Add condition]  (caller's footer controls)
 *
 * The table keeps its conditions as plain objects and draws every cell from them (SWT owner draw), so a
 * changed value, count or enabled state is a redraw, not a widget update, and a table is one native
 * window whatever its size (plan/view-condition-table-as-native-table.md). A click edits a cell: a
 * choice, property or value cell opens a list under the cell, a check cell toggles, a color cell opens
 * the palette menu, a compound cell a window with its fields, ✕ removes the condition. Keyboard: ↑ ↓ row, ← → cell, Space or Enter edits.
 * Structural changes (add, remove) add or remove rows; value changes redraw.
 *
 * Filter lists (opts.filterList) always show at least the default condition (= keep everything) and
 * hand back [] for it; feature lists may be empty. With opts.placeholder an empty feature list
 * shows the default condition switched off, as an example to switch on; untouched, it is handed back
 * as [].
 *
 * Also here: the column sets of the dialog's condition tables (filter, step, nesting, reverse, style, nesting style).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading condition_table.js");

/** @type {typeof import("../rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./widgets")} */
const Widgets = require(REPO_ROOT + "View/lib/gui/widgets");
/** @type {typeof import("../appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");

const { RELATION_TYPE_IDS, RELATION_TYPE_LABELS, ELEMENT_TYPES, ELEMENT_TYPE_LABELS, DIAGRAM_TYPE_ID_TO_LABEL, compareNames } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const TableWidget       = Java.type("org.eclipse.swt.widgets.Table");
const TableColumnWidget = Java.type("org.eclipse.swt.widgets.TableColumn");
const TableItemWidget   = Java.type("org.eclipse.swt.widgets.TableItem");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const TextWidget        = Java.type("org.eclipse.swt.widgets.Text");
const ListWidget        = Java.type("org.eclipse.swt.widgets.List");
const ToolTipWidget     = Java.type("org.eclipse.swt.widgets.ToolTip");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const RowLayout         = Java.type("org.eclipse.swt.layout.RowLayout");
const SWTGC             = Java.type("org.eclipse.swt.graphics.GC");
const SWTPoint          = Java.type("org.eclipse.swt.graphics.Point");
const GridDataFactory   = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

const CELL_PAD   = 3;    // px between a cell's edge and its content (GTK's cell is already 3 px narrower than its column)
const ARROW_PAD  = 2;    // px between the text and the ▾
const COLUMN_GAP = 6;    // px added to every column, the gap the grid had between its cells
const ROW_PAD    = 5;    // px above and below the text of a row
const ARROW      = "▾";  // marks a cell that opens a list
const HEADER_PAD = 6;    // px a header keeps beside its text
const DEL_WIDTH  = 28;   // the ✕ column
const DEL_TIP    = "Remove this condition.";
const ANY        = "Any";       // the empty item of a property list in a pop-up: no property match
const EMPTY      = "(empty)";   // the empty item of a value list: the property has no value
const LIST_FIELD_WIDTH = 200;   // px of a property or value list in a pop-up
const LIST_FIELD_ROWS  = 10;    // visible items of that list
const NOTE_WIDTH = 220;  // px a field's note wraps at in a pop-up
const TIP_DELAY  = 500;  // ms the mouse rests on a cell before its tooltip shows
const TIP_OFFSET = 20;   // px between the mouse and the tooltip below it
/** Column width when the column gives none. */
const WIDTH_BY_KIND = { check: 44, count: 36, warn: 24, prop: 100, value: 100, choice: 150, color: 150, compound: 190 };

/**
 * Column definition:
 *   key       condition field (count columns: "relations" | "elements")
 *   header    heading, one line
 *   tooltip   heading + cell tooltip
 *   kind      choice  a list of items: [{ value, label }]
 *             check   a drawn checkbox (boolean field; col.default false: unchecked when the condition has no value)
 *             prop    a list of property names (opts.propItems(condition, key))
 *             value   a list of property values (opts.valueItems(condition, key))
 *             count   read-only count, set with setCounts; "(n)" or col.format(n)
 *             warn    read-only "⚠", set with setWarnings
 *             color   a swatch and name; the palette menu of a ColorChoice (widgets.js): items, missing, fallback, other
 *             compound  col.summary(condition) in the cell, after col.swatch(condition) when the column has it,
 *                     and col.note(condition) in its tooltip; a click opens a small window with col.fields, one column per
 *                     field (choice: a combo; prop, value: a filtered list; color: the palette menu; spin: a
 *                     number; check: a checkbox; a field's get / set read and write it, note a line under it),
 *                     OK and Cancel; OK applies the fields and recounts, Cancel undoes them
 *   width     width (px); cells keep it, nothing stretches with the dialog
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
  let conditions = [];
  /** @type {ConditionTableCounts[]} */
  let counts     = [];
  /** @type {Map<number, string>} */
  let warnings   = new Map();
  let enabled    = true;
  /** @type {ConditionTableColumn<ConditionByKind[K]>[]} the columns in the table; the ✕ column follows them */
  let vcols      = [];
  const cursor   = { row: 0, col: 0 };   // the cell with the keyboard focus; col === vcols.length is ✕
  /** @type {Swt.Menu | null} */
  let colorMenu  = null;
  let tipCell    = "";   // "row:col" of the cell under the mouse, "" outside the cells
  let tipClicked = false;   // that cell was clicked: its tooltip stays hidden

  const outer = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(0, 0).spacing(0, 3).applyTo(outer);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(outer);
  outer.setData("fitWidth", true);   // the dialog widens rather than cut a condition off (_resizeScrolled)

  const table = new TableWidget(outer, SWT.FULL_SELECTION | SWT.NO_SCROLL);
  table.setHeaderVisible(true);
  table.setLinesVisible(false);
  table.setBackground(outer.getBackground());         // the group's background shows through
  table.setHeaderBackground(outer.getBackground());
  table.setHeaderForeground(outer.getDisplay().getSystemColor(SWT.COLOR_WIDGET_FOREGROUND));   // as the grid's header labels
  // As wide as its columns, not the group: GTK would stretch the last column (✕) over the rest.
  GridDataFactory.swtDefaults().applyTo(table);       // its hints follow the columns and rows (syncRows)
  const gcText = new SWTGC(table);
  const textH = gcText.getFontMetrics().getHeight();
  /** @type {Map<string, number>} header text widths */
  const headerW = new Map(cols.map(c => [c.key, gcText.textExtent(c.header || "").x]));
  // A choice column that shows a count is as wide as its longest item with a 3-digit count, "(123)".
  /** @type {Map<string, number>} */
  const itemW = new Map();
  for (const c of cols) {
    if (c.kind !== "choice" || !c.count) continue;
    const widest = Math.max(...c.items.map(it => gcText.textExtent(`${it.label} (123)`).x));
    itemW.set(c.key, widest + 2 * CELL_PAD + ARROW_PAD + gcText.textExtent(ARROW).x + 4);
  }
  gcText.dispose();
  const rowH = Math.max(Widgets.CHECK_SIZE, textH) + 2 * ROW_PAD;

  const lblEmpty = new LabelWidget(outer, SWT.NONE);
  lblEmpty.setText(opts.emptyText || "No conditions.");
  lblEmpty.setForeground(outer.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY));
  GridDataFactory.fillDefaults().applyTo(lblEmpty);

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
    syncRows();
    changed();
  });

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

  // ── Cell contents ─────────────────────────────────────────────────────────────

  /**
   * @param {ConditionTableChoiceColumn<ConditionByKind[K]>} col
   * @param {unknown} value
   */
  const choiceLabel = (col, value) => {
    const it = col.items.find(i => i.value === value);
    return it ? it.label : String(value);
  };
  // The list of a choice cell for row i, and the label of its current item (with col.count the count).
  // An item the column does not hold is appended, so the current value always shows.
  /**
   * @param {ConditionTableChoiceColumn<ConditionByKind[K]>} col
   * @param {Record<string, any>} condition
   * @param {number} i
   * @returns {{ labels: string[], idx: number }}
   */
  const choiceItems = (col, condition, i) => {
    const labels = col.items.map(it => it.label);
    let idx = col.items.findIndex(it => it.value === condition[col.key]);
    let selected = choiceLabel(col, condition[col.key]);
    const n = col.count && counts[i] ? counts[i][col.count] : undefined;
    if (n !== undefined && n !== null) selected = `${selected} (${n})`;
    if (idx < 0) { labels.push(selected); idx = labels.length - 1; } else labels[idx] = selected;
    return { labels, idx };
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
  // The list of a property / value cell: the plain names (the first is "", none) and their labels,
  // the current one decorated with its count ("Status (14)"); a decorated label never ends up in
  // the condition.
  /**
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {number} i
   * @returns {{ names: string[], labels: string[], idx: number }}
   */
  const listItems = (col, condition, i) => {
    const fn = col.kind === "prop" ? opts.propItems : opts.valueItems;
    const names = [""].concat((fn ? fn(condition, col.key) : []) || []);
    const value = condition[col.key] || "";
    if (value && names.indexOf(value) < 0) names.push(value);
    const labels = names.slice();
    const n = col.count && counts[i] ? counts[i][col.count] : undefined;
    const idx = names.indexOf(value);
    if (n !== undefined && n !== null) labels[idx] = value ? `${value} (${n})` : `(${n})`;
    return { names, labels, idx };
  };
  /**
   * @param {ConditionTableColorColumn<ConditionByKind[K]>} col
   * @param {Record<string, any>} condition
   */
  const colorItem = (col, condition) => Widgets.colorItemFor(col, condition[col.key] || "").item;
  /**
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} col
   * @param {Record<string, any>} condition
   */
  const checked = (col, condition) => condition[col.key] === undefined ? col.default !== false : !!condition[col.key];

  /**
   * The text of a cell; check and color cells draw more than text (paintCell).
   * @param {ConditionTableColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {number} i
   */
  function cellText(col, condition, i) {
    switch (col.kind) {
      case "choice": { const c = choiceItems(col, condition, i); return c.labels[c.idx]; }
      case "prop": case "value": { const l = listItems(col, condition, i); return l.labels[l.idx]; }
      case "count": return countText(col, counts[i]);
      case "warn":  return warnings.has(i) ? "⚠" : "";
      case "color": return colorItem(col, condition).label;
      case "compound": return col.summary(condition);
      case "check": return "";
    }
    return "";
  }

  // A cell is on when the table is enabled, the column's rule allows it, and the condition is on
  // (its "on" cell and ✕ stay on). col null: the ✕ cell.
  /**
   * @param {ConditionTableColumn<ConditionByKind[K]> | null} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   */
  const cellOn = (col, condition) =>
    enabled && (!col || ((!col.enabled || col.enabled(condition)) && (condition.on !== false || col.key === "on")));

  // ── Drawing ───────────────────────────────────────────────────────────────────

  /** @type {Map<string, Swt.Font>} the table's font in bold, italic and both, made when first drawn */
  const styledFonts = new Map();
  /**
   * The table's font in a font style; null for normal or an unknown style.
   * @param {string} style  normal, bold, italic or bolditalic
   */
  const styledFont = style => {
    const bits = (style.includes("bold") ? SWT.BOLD : 0) | (style.includes("italic") ? SWT.ITALIC : 0);
    if (!bits) return null;
    let f = styledFonts.get(style);
    if (!f) {
      const FontDescriptor = Java.type("org.eclipse.jface.resource.FontDescriptor");
      f = FontDescriptor.createFrom(table.getFont()).setStyle(bits).createFont(table.getDisplay());
      styledFonts.set(style, f);
    }
    return f;
  };
  table.addListener(SWT.Dispose, () => styledFonts.forEach(f => f.dispose()));

  table.addListener(SWT.MeasureItem, e => { e.height = rowH; });
  // The table draws nothing of its own: no selection, hover or focus highlight, no text.
  table.addListener(SWT.EraseItem, e => { e.detail &= ~(SWT.SELECTED | SWT.HOT | SWT.FOCUSED | SWT.FOREGROUND); });
  table.addListener(SWT.PaintItem, e => {
    const i = table.indexOf(e.item);
    if (i < 0 || i >= conditions.length) return;
    paintCell(e.gc, e.item.getBounds(e.index), i, e.index);
  });

  /**
   * Shorten a text to the width with "…".
   * @param {Swt.GC} gc
   * @param {string} text
   * @param {number} width
   */
  function fitText(gc, text, width) {
    if (gc.textExtent(text).x <= width) return text;
    let n = text.length;
    while (n > 1 && gc.textExtent(text.slice(0, n) + "…").x > width) n--;
    return text.slice(0, n) + "…";
  }

  /**
   * @param {Swt.GC} gc
   * @param {Swt.Rectangle} r  the cell
   * @param {number} i  row
   * @param {number} ci  column in the table; vcols.length is ✕
   */
  function paintCell(gc, r, i, ci) {
    const d = table.getDisplay();
    const condition = conditions[i];
    const col = ci < vcols.length ? vcols[ci] : null;
    const on = cellOn(col, condition);
    const fg = () => d.getSystemColor(on ? SWT.COLOR_WIDGET_FOREGROUND : SWT.COLOR_WIDGET_NORMAL_SHADOW);
    gc.setForeground(fg());
    const ty = r.y + Math.floor((r.height - textH) / 2);
    let x = r.x + CELL_PAD, w = r.width - 2 * CELL_PAD;
    if (!col) {
      gc.drawText("✕", r.x + Math.floor((r.width - gc.textExtent("✕").x) / 2), ty, SWT.DRAW_TRANSPARENT);
    } else if (col.kind === "check") {
      Widgets.drawCheck(gc, d, r.x + Math.floor((r.width - Widgets.CHECK_SIZE) / 2), r.y + Math.floor((r.height - Widgets.CHECK_SIZE) / 2),
        checked(col, condition), on);
    } else {
      const swatch = col.kind === "color" ? colorItem(col, condition).colors : col.kind === "compound" && col.swatch ? col.swatch(condition) : null;
      if (swatch) {
        const sw = (col.kind === "color" && col.swatchWidth) || Widgets.SWATCH_W;
        Widgets.drawSwatch(gc, d, x, r.y + Math.floor((r.height - Widgets.SWATCH_H) / 2), sw, swatch, on);
        gc.setForeground(fg());
        x += sw + CELL_PAD; w -= sw + CELL_PAD;
      }
      const opens = col.kind === "choice" || col.kind === "prop" || col.kind === "value" || col.kind === "color" || col.kind === "compound";
      if (opens) {
        const aw = gc.textExtent(ARROW).x;
        gc.drawText(ARROW, r.x + r.width - CELL_PAD - aw, ty, SWT.DRAW_TRANSPARENT);
        w -= aw + ARROW_PAD;
      }
      const styled = col.kind === "compound" && col.textStyle ? styledFont(col.textStyle(condition)) : null;
      if (styled) gc.setFont(styled);
      gc.drawText(fitText(gc, cellText(col, condition, i), w), x, ty, SWT.DRAW_TRANSPARENT);
      if (styled) gc.setFont(table.getFont());
    }
    if (table.isFocusControl() && cursor.row === i && cursor.col === ci) drawCursor(gc, r);
  }

  /**
   * The keyboard cursor: a dotted frame of its own. GC.drawFocus is the theme's: Breeze draws
   * nothing, Win32 nothing until the keyboard cues are on (Tab, Alt).
   * @param {Swt.GC} gc
   * @param {Swt.Rectangle} r  the cell
   */
  function drawCursor(gc, r) {
    gc.setForeground(table.getDisplay().getSystemColor(SWT.COLOR_WIDGET_FOREGROUND));
    gc.setLineWidth(1);
    gc.setLineStyle(SWT.LINE_DOT);
    gc.drawRectangle(r.x + 1, r.y + 1, r.width - 3, r.height - 3);
    gc.setLineStyle(SWT.LINE_SOLID);
  }

  // ── Editing ───────────────────────────────────────────────────────────────────

  /**
   * The cell at a point of the table, or null.
   * @param {number} x
   * @param {number} y
   * @returns {{ row: number, col: number } | null}
   */
  function cellAt(x, y) {
    const item = table.getItem(new SWTPoint(x, y));
    if (!item) return null;
    const row = table.indexOf(item);
    for (let ci = 0; ci <= vcols.length; ci++) if (item.getBounds(ci).contains(x, y)) return { row, col: ci };
    return null;
  }

  /** The cell in display coordinates. @param {number} row @param {number} ci */
  function cellOnScreen(row, ci) {
    const r = table.getItem(row).getBounds(ci);
    const at = table.toDisplay(r.x, r.y);
    r.x = at.x; r.y = at.y;
    return r;
  }

  /**
   * After a cell changed its condition: the column's normalisation, a redraw and the caller.
   * @param {ConditionTableColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   */
  function afterChange(col, condition) {
    if (col.onChange) col.onChange(condition);
    refresh();
    changed();
    table.setFocus();
  }

  /** Edit the cell: open its list or menu, toggle it, or remove its row. @param {{ row: number, col: number }} cell */
  function activate(cell) {
    const condition = conditions[cell.row];
    if (!condition) return;
    if (cell.col === vcols.length) {
      if (!enabled) return;
      conditions.splice(cell.row, 1);
      fillEmpty();
      syncRows(); changed();
      return;
    }
    const col = vcols[cell.col];
    if (!cellOn(col, condition)) return;
    switch (col.kind) {
      case "check":
        condition[col.key] = !checked(col, condition);
        afterChange(col, condition);
        break;
      case "choice": {
        const c = choiceItems(col, condition, cell.row);
        Widgets.openListPopup(table, cellOnScreen(cell.row, cell.col), c.labels, c.idx, k => {
          const it = col.items[k];
          if (it) condition[col.key] = it.value;   // the appended unknown item keeps the value
          afterChange(col, condition);
        });
        break;
      }
      case "prop": case "value": {
        const l = listItems(col, condition, cell.row);
        Widgets.openListPopup(table, cellOnScreen(cell.row, cell.col), l.labels, l.idx, k => {
          condition[col.key] = k > 0 ? l.names[k] : "";
          if (col.kind === "prop" && !condition.property) condition.value = "";
          afterChange(col, condition);
        });
        break;
      }
      case "color": {
        // silent: the menu may be disposed already, with the dialog
        if (colorMenu) { try { colorMenu.dispose(); } catch (e) {} }
        const r = cellOnScreen(cell.row, cell.col);
        colorMenu = Widgets.openColorMenu(table, new SWTPoint(r.x, r.y + r.height), col, condition[col.key] || "", v => {
          condition[col.key] = v;
          afterChange(col, condition);
        });
        break;
      }
      case "compound":
        hideTip();   // a tooltip of the cell would lie over the window
        openCompound(cell, col, condition);
        break;
    }
  }

  // ── Compound cell ─────────────────────────────────────────────────────────────

  /**
   * The title of a compound cell's window: the field and which condition it edits, by its choice cells that apply.
   * @param {ConditionTableColumn<ConditionByKind[K]>} col
   * @param {number} row
   * @param {ConditionByKind[K] & Record<string, any>} condition
   */
  const windowTitle = (col, row, condition) => {
    const parts = vcols.filter(c => c.kind === "choice" && c.key !== "mode" && cellOn(c, condition))
      .map(c => choiceLabel(/** @type {ConditionTableChoiceColumn<ConditionByKind[K]>} */ (c), condition[c.key]));
    return `${col.header} · condition ${row + 1}: ${parts.join(" · ")}`;
  };

  /**
   * The window of a compound cell: its fields side by side; OK applies them and recounts, Cancel undoes them.
   * @param {{ row: number, col: number }} cell
   * @param {ConditionTableCompoundColumn<ConditionByKind[K]>} col
   * @param {ConditionByKind[K] & Record<string, any>} condition
   */
  function openCompound(cell, col, condition) {
    const before = Object.assign({}, condition);
    const panel = Widgets.openFieldsWindow(table, cellOnScreen(cell.row, cell.col), {
      title: windowTitle(col, cell.row, condition),
      columns: col.fields.filter(f => !f.visible || f.visible(condition)).length,
      onOk: () => afterChange(col, condition),
      onCancel: () => { Object.assign(condition, before); table.redraw(); },
      onClose: () => { if (!table.isDisposed()) table.setFocus(); },
    });
    /** @type {(() => void)[]} the fields re-read the condition after each change */
    const updates = [];
    // A choice changes the condition and the other fields; the dialog recounts once, on OK: counting
    // a large selection takes seconds, too long per click in a list.
    const commit = (/** @type {ConditionTableField<ConditionByKind[K]>} */ field) => {
      if (field.onChange) field.onChange(condition);
      if (col.onChange) col.onChange(condition);
      updates.forEach(u => u());
      const win = panel.body.getShell();   // a note that appeared or went: the window fits its fields again
      const size = win.computeSize(SWT.DEFAULT, SWT.DEFAULT);
      const area = win.getMonitor().getClientArea(), at = win.getBounds();
      win.setBounds(Math.max(area.x, Math.min(at.x, area.x + area.width - size.x)), at.y, size.x, size.y);   // stays on its monitor
      win.layout(true, true);
    };
    /** @type {Swt.Control | null} */
    let first = null;
    for (const field of col.fields.filter(f => !f.visible || f.visible(condition))) {
      const box = new CompositeWidget(panel.body, SWT.NONE);
      GridLayoutFactory.fillDefaults().numColumns(1).spacing(0, 4).applyTo(box);
      GridDataFactory.fillDefaults().align(SWT.FILL, SWT.FILL).applyTo(box);
      const lbl = new LabelWidget(box, SWT.NONE);
      lbl.setText(field.header || "");
      if (field.tooltip) lbl.setToolTipText(field.tooltip);
      const f = field.kind === "choice" ? _choiceField(box, field, condition, commit)
              : field.kind === "color" ? _colorField(box, field, condition, commit)
              : field.kind === "spin" ? _spinField(box, field, condition, commit)
              : field.kind === "check" ? _checkField(box, field, condition, commit)
              : _listField(box, field, condition, cell.row, commit);
      f.controls.forEach(c => { if (field.tooltip) c.setToolTipText(field.tooltip); });
      const note = field.note ? Widgets.noteLabel(box, "") : null;
      if (note) GridDataFactory.fillDefaults().hint(NOTE_WIDTH, SWT.DEFAULT).applyTo(note);
      const update = () => {
        f.update();
        const on = !field.enabled || field.enabled(condition);
        lbl.setEnabled(on);
        f.controls.forEach(c => { c.setEnabled(on); if (!on && c instanceof ListWidget) c.deselectAll(); });
        if (note && field.note) {
          const text = field.note(condition);
          note.setText(text);
          note.setVisible(!!text);
          note.getLayoutData().exclude = !text;   // an empty note takes no room
        }
      };
      updates.push(update);
      update();
      if (!first && f.controls[0].isEnabled()) first = f.controls[0];
    }
    panel.open(first);
  }

  /**
   * The value of a field of a compound cell: its get, else the condition's field by key.
   * @param {ConditionTableField<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   */
  const fieldValue = (field, condition) => (field.get ? field.get(condition) : condition[field.key]);
  /**
   * @param {ConditionTableField<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {unknown} value
   */
  const setField = (field, condition, value) => { if (field.set) field.set(condition, value); else condition[field.key] = value; };

  /**
   * A color field of a compound cell: the palette menu of its ColorChoice.
   * @param {Swt.Composite} box
   * @param {ConditionTableColorColumn<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {(field: ConditionTableField<ConditionByKind[K]>) => void} commit
   */
  function _colorField(box, field, condition, commit) {
    const picker = Widgets.colorPicker(box, Object.assign({}, field, {
      value: String(fieldValue(field, condition) || ""), width: field.width,
      onChange: (/** @type {string} */ v) => { if (v !== fieldValue(field, condition)) { setField(field, condition, v); commit(field); } },
    }));
    return { controls: [picker.button], update: () => picker.set(String(fieldValue(field, condition) || "")) };
  }

  /**
   * A number field of a compound cell: a spinner with its unit behind it.
   * @param {Swt.Composite} box
   * @param {ConditionTableSpinColumn<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {(field: ConditionTableField<ConditionByKind[K]>) => void} commit
   */
  function _spinField(box, field, condition, commit) {
    const cellBox = new CompositeWidget(box, SWT.NONE);
    GridLayoutFactory.fillDefaults().numColumns(2).spacing(4, 0).applyTo(cellBox);
    const spinner = new SpinnerWidget(cellBox, SWT.BORDER);
    spinner.setValues(Number(fieldValue(field, condition)), field.min, field.max, 0, field.step || 1, field.step || 1);
    GridDataFactory.swtDefaults().hint(Widgets.SPINNER_WIDTH, SWT.DEFAULT).applyTo(spinner);
    const unit = new LabelWidget(cellBox, SWT.NONE);
    unit.setText(field.unit || "");
    spinner.addListener(SWT.Modify, () => {
      const v = spinner.getSelection();
      if (v !== fieldValue(field, condition)) { setField(field, condition, v); commit(field); }
    });
    return { controls: [spinner, unit], update: () => { if (spinner.getSelection() !== fieldValue(field, condition)) spinner.setSelection(Number(fieldValue(field, condition))); } };
  }

  /**
   * A switch of a compound cell: a checkbox with its text.
   * @param {Swt.Composite} box
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {(field: ConditionTableField<ConditionByKind[K]>) => void} commit
   */
  function _checkField(box, field, condition, commit) {
    const btn = new ButtonWidget(box, SWT.CHECK);
    btn.setText(field.text || "");
    btn.addListener(SWT.Selection, () => { setField(field, condition, btn.getSelection()); commit(field); });
    return { controls: [btn], update: () => btn.setSelection(!!fieldValue(field, condition)) };
  }

  /**
   * A choice field of a compound cell: a read-only combo.
   * @param {Swt.Composite} box
   * @param {ConditionTableChoiceColumn<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {(field: ConditionTableField<ConditionByKind[K]>) => void} commit
   */
  function _choiceField(box, field, condition, commit) {
    const combo = new ComboWidget(box, SWT.READ_ONLY | SWT.DROP_DOWN);
    combo.setItems(Java.to(field.items.map(it => it.label), "java.lang.String[]"));
    GridDataFactory.swtDefaults().applyTo(combo);
    combo.addListener(SWT.Selection, () => {
      const it = field.items[combo.getSelectionIndex()];
      if (it) { setField(field, condition, it.value); commit(field); }
    });
    const update = () => combo.select(field.items.findIndex(it => it.value === fieldValue(field, condition)));
    return { controls: [combo], update };
  }

  /**
   * A property or value field of a compound cell: a filter and the list of names, "Any" first.
   * @param {Swt.Composite} box
   * @param {ConditionTablePlainColumn<ConditionByKind[K]>} field
   * @param {ConditionByKind[K] & Record<string, any>} condition
   * @param {number} row
   * @param {(field: ConditionTableField<ConditionByKind[K]>) => void} commit
   */
  function _listField(box, field, condition, row, commit) {
    const txt = new TextWidget(box, SWT.SEARCH | SWT.ICON_CANCEL | SWT.BORDER);
    txt.setMessage("Filter");
    GridDataFactory.fillDefaults().grab(true, false).applyTo(txt);
    const list = new ListWidget(box, SWT.SINGLE | SWT.V_SCROLL | SWT.BORDER);
    GridDataFactory.fillDefaults().grab(true, true).hint(LIST_FIELD_WIDTH, list.getItemHeight() * LIST_FIELD_ROWS).applyTo(list);
    // Reading the names walks the objects' properties, slow on a large selection: read them again only
    // when another field of the condition changed, not per keystroke in the filter or on the field's own choice.
    /** @type {string[]} every name, "" first */
    let names = [];
    /** @type {string | null} the condition without this field's own choice, as names were read for */
    let readFor = null;
    const read = () => {
      const key = JSON.stringify(Object.assign({}, condition, field.kind === "prop" ? { property: "", value: "" } : { [field.key]: "" }));
      if (key === readFor) return;
      readFor = key;
      names = field.enabled && !field.enabled(condition) ? [""] : listItems(field, condition, row).names;
    };
    /** @type {string[]} the names the list shows, "" = any */
    let shown = [];
    const show = () => {
      const filter = txt.getText().trim().toLowerCase();
      const value = condition[field.key] || "";
      shown = names.filter(n => n === "" || n === value || !filter || n.toLowerCase().includes(filter));
      list.setItems(Java.to(shown.map(n => n !== "" ? n : field.kind === "prop" ? ANY : EMPTY), "java.lang.String[]"));
      const at = shown.indexOf(value);
      if (at >= 0) { list.setSelection(at); list.showSelection(); }
    };
    const update = () => { read(); show(); };
    txt.addListener(SWT.Modify, show);
    list.addListener(SWT.Selection, () => {
      const i = list.getSelectionIndex();
      if (i < 0) return;
      if (shown[i] === (condition[field.key] || "")) return;
      condition[field.key] = shown[i];
      if (field.kind === "prop") condition.value = "";   // a value of the previous property does not belong to this one
      commit(field);
    });
    return { controls: [txt, list], update };
  }

  table.addListener(SWT.MouseUp, e => {
    if (e.button !== 1) return;
    const cell = cellAt(e.x, e.y);
    if (!cell) return;
    cursor.row = cell.row; cursor.col = cell.col;
    table.redraw();
    activate(cell);
  });
  // The table keeps no selection (GTK would paint it over the cells): the cursor is the table's own.
  table.addListener(SWT.Selection, () => table.deselectAll());
  table.addListener(SWT.Traverse, e => { if (e.detail === SWT.TRAVERSE_RETURN) e.doit = false; });   // Enter edits, not the dialog's default button
  table.addListener(SWT.KeyDown, e => {
    if (!conditions.length) return;
    const n = vcols.length + 1;
    const move = (/** @type {number} */ row, /** @type {number} */ col) => { cursor.row = row; cursor.col = col; e.doit = false; table.redraw(); };
    if (e.keyCode === SWT.ARROW_UP)         move(Math.max(0, cursor.row - 1), cursor.col);
    else if (e.keyCode === SWT.ARROW_DOWN)  move(Math.min(conditions.length - 1, cursor.row + 1), cursor.col);
    else if (e.keyCode === SWT.ARROW_LEFT)  move(cursor.row, (cursor.col + n - 1) % n);
    else if (e.keyCode === SWT.ARROW_RIGHT) move(cursor.row, (cursor.col + 1) % n);
    else if (String(e.character) === "\r" || String(e.character) === " ") { e.doit = false; activate(cursor); }   // Enter, Space
  });
  table.addListener(SWT.FocusIn,  () => table.redraw());
  table.addListener(SWT.FocusOut, () => table.redraw());
  // silent: the menu may be disposed already, with the dialog
  table.addListener(SWT.Dispose, () => { if (colorMenu) { try { colorMenu.dispose(); } catch (e) {} } });

  // The tooltip of the cell under the mouse: the column's, the row's on the first cell, the warning's
  // on ⚠. A table's own tooltip does not show over its rows on Win32, so the table shows a ToolTip of
  // its own once the mouse rests on a cell; the column headers keep their native tooltips.
  /** @param {{ row: number, col: number }} cell */
  const cellTip = cell => {
    const condition = conditions[cell.row];
    const col = cell.col < vcols.length ? vcols[cell.col] : null;
    if (!condition) return "";
    if (!col) return DEL_TIP;
    if (col.kind === "warn") return warnings.get(cell.row) || "";
    if (col.kind === "compound") {   // the whole summary, also when the cell cuts it off, and what it stands for
      const s = col.summary(condition);
      return [s && s !== ANY ? s : "", col.note ? col.note(condition) : "", col.tooltip || ""].filter(Boolean).join("\n");
    }
    if (cell.col === 0 && opts.rowTooltip) return opts.rowTooltip(condition);
    return col.tooltip || "";
  };
  const tip = new ToolTipWidget(table.getShell(), SWT.NONE);
  const hideTip = () => { if (!tip.isDisposed()) tip.setVisible(false); };
  table.addListener(SWT.MouseMove, e => {
    const cell = cellAt(e.x, e.y);
    const key = cell ? `${cell.row}:${cell.col}` : "";
    if (key === tipCell) return;
    tipCell = key;
    tipClicked = false;
    hideTip();
    if (!cell) return;
    const at = table.toDisplay(e.x, e.y);
    table.getDisplay().timerExec(TIP_DELAY, () => {
      if (table.isDisposed() || tipCell !== key || tipClicked) return;
      const text = cellTip(cell);
      if (!text) return;
      tip.setMessage(text);
      tip.setLocation(at.x, at.y + TIP_OFFSET);
      tip.setVisible(true);
    });
  });
  table.addListener(SWT.MouseExit, () => { tipCell = ""; hideTip(); });
  // A click edits the cell: no tooltip over its list or menu until the mouse moves to another cell.
  table.addListener(SWT.MouseDown, () => { tipClicked = true; hideTip(); });
  table.addListener(SWT.Dispose, () => tip.dispose());

  // ── Structure ─────────────────────────────────────────────────────────────────

  // A column is at least as wide as its header (a table clips a header to its column).
  /** @param {ConditionTableColumn<ConditionByKind[K]>} col */
  const colWidth = col => Math.max(col.width || WIDTH_BY_KIND[col.kind], (headerW.get(col.key) || 0) + 2 * HEADER_PAD, itemW.get(col.key) || 0) + COLUMN_GAP;

  // The table's columns follow the visible columns; disposing them keeps the rows.
  function rebuildColumns() {
    for (const c of table.getColumns()) c.dispose();
    vcols = cols.slice();
    for (const col of vcols) {
      const tc = new TableColumnWidget(table, SWT.LEFT);
      tc.setText(col.header || "");
      if (col.tooltip) tc.setToolTipText(col.tooltip);
      tc.setWidth(colWidth(col));
      tc.setResizable(false);
    }
    const del = new TableColumnWidget(table, SWT.CENTER);
    del.setWidth(DEL_WIDTH);
    del.setResizable(false);
    del.setToolTipText(DEL_TIP);
    cursor.col = Math.min(cursor.col, vcols.length);
  }

  // One table row per condition (the rows carry no data: every cell is drawn from the condition), the
  // table sized to its rows, the empty text when there are none.
  function syncRows() {
    const n = conditions.length;
    if (table.getItemCount() > n) {
      table.remove(n, table.getItemCount() - 1);
      table.deselectAll();   // GTK selects a neighbour of the removed rows, without a Selection event
    }
    while (table.getItemCount() < n) new TableItemWidget(table, SWT.NONE);
    cursor.row = Math.min(cursor.row, Math.max(0, n - 1));
    lblEmpty.setVisible(n === 0);
    lblEmpty.getLayoutData().exclude = n > 0;
    const width = vcols.reduce((s, c) => s + colWidth(c), DEL_WIDTH);
    // GTK makes a row taller than MeasureItem asks (31 px for 29): size the table by the row height it uses.
    const itemH = Math.max(rowH, table.getItemHeight());
    const trim = table.computeTrim(0, 0, width, table.getHeaderHeight() + n * itemH);
    const gd = table.getLayoutData();
    gd.widthHint = trim.width; gd.heightHint = trim.height;
    refresh();
    try { outer.layout(true, true); } catch (e) {}   // silent: layout on a table that may be disposed
    if (opts.onLayout) opts.onLayout();
  }

  // A color the palette does not hold is replaced as the run replaces it (colorItemFor), and reported.
  function normalizeColors() {
    let any = false;
    for (const col of cols) {
      if (col.kind !== "color") continue;
      for (const r of conditions) {
        const v = Widgets.colorItemFor(col, r[col.key] || "").value;
        if (v !== (r[col.key] || "")) { r[col.key] = v; any = true; }
      }
    }
    return any;
  }

  // Enabled states, labels, counts and property lists: a redraw, the cells read the conditions.
  function refresh() {
    const replaced = normalizeColors();
    btnAdd.setEnabled(enabled);
    table.redraw();
    if (replaced) changed();
  }

  rebuildColumns();

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
      counts = []; warnings = new Map();
      rebuildColumns();
      syncRows();
    },
    /** The rows as shown (normalised; a filter list's default row included), for per-row data. */
    displayedConditions() { return conditions.map(r => Object.assign(ConditionLists.defaultCondition(kind), r)); },
    /** Per-condition counts: [{ relations, elements }] in condition order. */
    setCounts(list) {
      counts = list || [];
      table.redraw();
    },
    /** Map condition index → tooltip for the ⚠ column. */
    setWarnings(map) {
      warnings = map || new Map();
      table.redraw();
    },
    /** Re-read property and value lists and the palette (after the dialog's dry run, another palette). */
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
  { value: "added", label: "Added element", short: "Added" }, { value: "relation", label: "Added relation", short: "Relation" },
  { value: "previous", label: "Previous element", short: "Previous" },
]);
const STYLE_APPLY_TO_ITEMS = Object.freeze([
  { value: "element", label: "Element" }, { value: "relation", label: "Relation" },
  { value: "source", label: "Source element" }, { value: "target", label: "Target element" },
]);
const REL_PROP_OF_ITEMS = Object.freeze([
  { value: "relation", label: "Relation" }, { value: "source", label: "Source element", short: "Source" },
  { value: "target", label: "Target element", short: "Target" },
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
 * The property match of a condition as one compound cell: Property of (when the kind has it), Property
 * and Value. The cell shows "Status = Actief", with Property of its short label "Source: Status = Actief"; "Any" without one, as the window's list names it.
 * @param {string} tooltip
 * @param {ConditionTableChoiceColumn} [propOf]  the Property of field
 * @returns {ConditionTableCompoundColumn<any>}
 */
const _propCol = (tooltip, propOf) => ({
  key: "property", header: "Property", kind: "compound", width: 300, tooltip,
  fields: [
    ...(propOf ? [propOf] : []),
    { key: "property", header: "Property", kind: "prop", tooltip: "The property to match. Any: no property match." },
    { key: "value", header: "Value", kind: "value", enabled: r => !!r.property, tooltip: "The value the property must have." },
  ],
  summary: r => {
    if (!r.property) return ANY;
    const it = propOf ? propOf.items.find(i => i.value === r.propertyOf) : undefined;
    return `${it ? (it.short || it.label) + ": " : ""}${r.property} = ${r.value === "" ? EMPTY : r.value}`;
  },
});
const _COUNT_TIP = "(n): relations / elements this step adds with only this condition. Conditions can overlap, so the sum can " +
                   "exceed the step total. For an Exclude condition: how many it removes from the other conditions' result.";

// Global filter: the type cell shows the condition's count, "Business Actor (12)".
const _FILTER_COUNT_TIP = "\n(n): how many this condition keeps on its own; for an Exclude condition, how many it removes " +
                          "from the other conditions' result.";
const FILTER_APPLY_TO_ITEMS = Object.freeze([{ value: "element", label: "Element" }, { value: "relation", label: "Relation" }]);
const _isElementRow  = (/** @type {FilterCondition} */ r) => r.applyTo === "element";
const _isRelationRow = (/** @type {FilterCondition} */ r) => r.applyTo === "relation";
// An element row has no relation or target type, a relation row no property: the cells that do not apply are emptied.
/** @type {readonly ConditionTableColumn<FilterCondition>[]} */
const FILTER_CONDITION_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  { key: "applyTo", header: "Apply to", kind: "choice", items: FILTER_APPLY_TO_ITEMS, width: 100,
    tooltip: "Element: the condition keeps elements of a type, optionally with a property value.\n" +
             "Relation: it keeps relations between the filtered elements by source, relation and target type.",
    onChange: (/** @type {FilterCondition} */ r) => {
      if (r.applyTo === "element") { r.relation = ""; r.target = ""; } else { r.property = ""; r.value = ""; }
    } },
  Object.assign(_typeCol("source", "Element / source type", "Element: the type to match. Relation: the type at the start of the relation. All = any type."), { width: 190 }),
  Object.assign(_relCol("relation", "Relation type", "Relationship type. All = any type."), { enabled: _isRelationRow }),
  Object.assign(_typeCol("target", "Target type", "Element type at the end of the relation. All = any type."), { enabled: _isRelationRow }),
  Object.assign(_propCol("Match only when the element has the specified property value. Click to configure. Empty: any value."),
    { enabled: _isElementRow }),
  { key: "count", header: "Count", kind: "count", width: 50,
    tooltip: "(n): elements or relations this condition keeps on its own; for an Exclude condition, how many it removes " +
             "from the other conditions' result." },
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
// Nesting / reverse: the relation-type cell shows the condition's count, "Aggregation (62)".
const _countedRelCol = Object.assign({}, RELATION_CONDITION_COLUMNS[2], { count: "relations", width: 166,
  tooltip: "Relationship type; All = any type.\n" +
           "(n): relations on the view this condition matches on its own; Exclude: how many it removes." });
/** @type {ConditionTableColumn<RelationCondition>[]} */
const _COUNTED_FEATURE_COLUMNS = [_onCol, _featureModeCol, RELATION_CONDITION_COLUMNS[1], _countedRelCol, RELATION_CONDITION_COLUMNS[3],
  _propCol("Match only when the relation, its source or its target has the specified property value. Click to configure. Empty: any value.",
    { key: "propertyOf", header: "Property of", kind: "choice", items: REL_PROP_OF_ITEMS,
      tooltip: "Where the property is read: the relation, its source or its target element." })];
/** @type {readonly ConditionTableColumn<RelationCondition>[]} */
const NESTING_CONDITION_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "everyContainer", header: "Every", kind: "check", width: 48, default: false,
    enabled: r => r.mode !== "exclude",
    tooltip: "A child with several parents: on = it appears in every parent;\n" +
             "off = in one parent, and the other relations are drawn as a line." },
  { key: "nested", header: "Nested", kind: "count", width: 60, format: n => String(n),
    tooltip: "How many of those relations are drawn as nesting; the others are lines:\n" +
             "their child already has a parent, or the nesting would be circular." }]);
// Reverse: an empty cell where Nesting has its Nested count, so both tables line up.
/** @type {readonly ConditionTableColumn<RelationCondition>[]} */
const REVERSE_CONDITION_COLUMNS = Object.freeze([..._COUNTED_FEATURE_COLUMNS,
  { key: "_spacer", header: "", kind: "count", width: 48 },
  { key: "_spacer2", header: "", kind: "count", width: 60 }]);
/** @type {readonly ConditionTableColumn<StepCondition>[]} */
const STEP_CONDITION_COLUMNS = Object.freeze([
  _onCol, _modeCol,
  _typeCol("previous", "Previous step elements",
    "Only elements of this type from the previous step are expanded (step 1: the filtered selection). All = any.", 200),
  { key: "direction", header: "Direction", kind: "choice", items: DIRECTION_ITEMS, width: 90,
    tooltip: "Outgoing: the relation starts at an element of the previous step.\n" +
             "Incoming: the relation ends at an element of the previous step.\nEither: both (default)." },
  // The condition's counts sit after the chosen type: "Aggregation (18)", "Business Service (5)".
  Object.assign(_relCol("relation", "Added relations", "Relationship types to follow from the previous step.\n" + _COUNT_TIP),
    { count: "relations", width: 260 }),
  Object.assign(_typeCol("added", "Added elements", "Types of the elements this step adds.\n" + _COUNT_TIP, 280),
    { count: "elements" }),
  _propCol("Match only when the added element, the followed relation or the previous element has the specified property value. Click to configure. Empty: any value.",
    { key: "propertyOf", header: "Property of", kind: "choice", items: STEP_PROP_OF_ITEMS,
      tooltip: "Where the property is read: the added element, the followed relation or the previous step's element." }),
]);
/**
 * Columns of the style table; the range cell lists the ranges of the chosen palette.
 * @param {() => ColorPickerItem[]} ranges  the palette's ranges (Widgets.rangeItems); a new condition takes the first
 * @returns {readonly ConditionTableColumn<StyleCondition>[]}
 */
function styleConditionColumns(ranges) {
  /** @type {readonly ConditionTableColumn<StyleCondition>[]} */
  const columns = [
    _onCol,
    { key: "applyTo", header: "Apply to", kind: "choice", items: STYLE_APPLY_TO_ITEMS, width: 150,
      tooltip: "What gets the color: the element itself (using its own property), the relation, " +
               "or the source / target element of a matching relation.",
      // Element colors by its own property; a relation has no "element" to read from.
      onChange: r => {
        if (r.applyTo === "element") r.propertyOf = "element";
        else if (r.applyTo === "relation" && r.propertyOf === "element") r.propertyOf = "relation";
      } },
    _typeCol("source", "Source type", "Element type at the start of the relation (Apply to = Element: the element type). All = any.", 140),
    Object.assign(_relCol("relation", "Relation type", "Relationship type. All = any type."),
      { width: 105, enabled: (/** @type {StyleCondition} */ r) => r.applyTo !== "element" }),
    Object.assign(_typeCol("target", "Target type", "Element type at the end of the relation. All = any.", 140),
      { enabled: (/** @type {StyleCondition} */ r) => r.applyTo !== "element" }),
    { key: "propertyOf", header: "Property of", kind: "choice", items: STYLE_PROP_OF_ITEMS, width: 120,
      enabled: r => r.applyTo !== "element",
      tooltip: "Whose property supplies the value: the element, the relation, its source or its target." },
    { key: "property", header: "Property", kind: "prop", width: 140, count: "count",
      tooltip: "The property whose values give the colors.\n" +
               "(n): objects on the view this condition colors (no property yet: objects it reaches)." },
    { key: "colorRange", header: "Color range", kind: "color", width: 150,
      tooltip: "Colors from low to high value of the property: a range of the palette.", ...Widgets.colorRangeChoice(ranges) },
    { key: "warn", kind: "warn" },
  ];
  return Object.freeze(columns);
}

const BACKGROUND_ITEM = Object.freeze({ value: ConditionLists.BACKGROUND, label: "Background" });
const SAME_AS_PARENT = Object.freeze({ value: ConditionLists.SAME_TYPE, label: "Same as parent" });
const CHILD_ITEMS = Object.freeze([SAME_AS_PARENT, ...ELEMENT_ITEMS]);
/** The fill color's items before the palette's: the background look, the child type's default fill, and the parent's fill color. */
const COLOR_LEADING = Object.freeze([BACKGROUND_ITEM, { value: "", label: "Type default" }, SAME_AS_PARENT]);
/** @type {readonly ConditionTableItem[]} */
const FONT_SIZE_ITEMS = Object.freeze([BACKGROUND_ITEM, { value: 0, label: "Same as parent" }, ...Array.from({ length: 17 }, (_, i) => ({ value: i + 8, label: String(i + 8) }))]);
/** @type {readonly ConditionTableItem[]} */
const FONT_STYLE_ITEMS = Object.freeze([BACKGROUND_ITEM, SAME_AS_PARENT, { value: "normal", label: "Normal" }, { value: "bold", label: "Bold" },
  { value: "italic", label: "Italic" }, { value: "bolditalic", label: "Bold italic" }]);
const NEST_PROP_OF_ITEMS = Object.freeze([
  { value: "child", label: "Child element", short: "Child" }, { value: "parent", label: "Parent element", short: "Parent" },
  { value: "relation", label: "Relation", short: "Relation" },
]);
// The descriptions of the choice values, under the field in the window (worded alike: Background is the same for every field).
const NOTE_BACKGROUND = "Use the value from the element's background look.";


/**
 * A nesting style condition as the dialog shows it: without a background view in use, a Background value
 * shows its fallback (Type default, 9 pt, normal), which the preset does not take until another value is chosen.
 * @param {() => boolean} background  a background view is chosen and on
 */
function _shown(background) {
  const BG = ConditionLists.BACKGROUND;
  const standIn = (/** @type {unknown} */ v) => v === BG && !background();
  return {
    standIn,
    color:     (/** @type {NestingStyleCondition} */ r) => (standIn(r.color) ? "" : r.color),
    fontSize:  (/** @type {NestingStyleCondition} */ r) => (standIn(r.fontSize) ? Appearance.DEFAULT_FONT_SIZE : r.fontSize),
    fontStyle: (/** @type {NestingStyleCondition} */ r) => (standIn(r.fontStyle) ? Appearance.DEFAULT_FONT_STYLE : r.fontStyle),
  };
}
const NOTE_STAND_IN = "Background, but the background view is off (Layout tab): this default is used. The preset keeps Background.";

/**
 * The Color cell of a nesting style condition: the fill color, Start darker and Lighter per level.
 * @param {() => readonly { name: string, hex: string }[]} colors
 * @param {{ color: () => boolean, background: () => boolean }} switches
 * @returns {ConditionTableCompoundColumn<NestingStyleCondition>}
 */
function _nestColorCol(colors, switches) {
  const BG = ConditionLists.BACKGROUND;
  const shown = _shown(switches.background);
  const withBackground = Widgets.paletteColorChoice(colors, COLOR_LEADING);
  const withoutBackground = Widgets.paletteColorChoice(colors, COLOR_LEADING.filter(it => it !== BACKGROUND_ITEM));
  /** @type {ColorChoice} the items without Background while no background view is in use */
  const choice = Object.assign({}, withBackground, { items: () => (switches.background() ? withBackground : withoutBackground).items() });
  const darker  = (/** @type {NestingStyleCondition} */ r) => (r.darkenStart > 0 ? ` −${r.darkenStart}` : "");
  const lighter = (/** @type {NestingStyleCondition} */ r) => ` +${r.lightenPerLevel}%`;
  const label   = (/** @type {NestingStyleCondition} */ r) => Widgets.colorItemFor(choice, shown.color(r)).item.label;
  return {
    key: "color", header: "Color", kind: "compound", width: 170, enabled: () => switches.color(),
    tooltip: "Fill color applied to the child. Click to configure.",
    note: r => (shown.standIn(r.color) ? NOTE_STAND_IN : ""),
    fields: [
      Object.assign({ key: "color", header: "Fill color", kind: /** @type {"color"} */ ("color"), width: 190,
        tooltip: "Fill color applied to the child.", get: shown.color,
        note: (/** @type {NestingStyleCondition} */ r) => shown.standIn(r.color) ? NOTE_STAND_IN
          : r.color === BG ? NOTE_BACKGROUND
          : r.color === ConditionLists.SAME_TYPE ? "Use the parent's fill color, one step lighter."
          : r.color === "" ? "Use the default fill color defined for the element type in Archi." : "" }, choice),
      { key: "darkenStart", header: "Start darker", kind: "spin", min: 0, max: 3, unit: "levels",
        enabled: r => shown.color(r) !== BG && r.color !== ConditionLists.SAME_TYPE,
        tooltip: "Darken the fill color by this many levels where the type or the fill color changes from parent to child." },
      { key: "lightenPerLevel", header: "Lighter per level", kind: "spin", min: 5, max: 90, step: 5, unit: "%",
        enabled: r => shown.color(r) !== BG,
        tooltip: "Move the fill color this percentage closer to white at each deeper level." },
    ],
    summary: r => shown.color(r) === BG ? label(r)
      : r.color === ConditionLists.SAME_TYPE ? label(r) + lighter(r)
      : label(r) + darker(r) + lighter(r),
    swatch: r => Widgets.colorItemFor(choice, shown.color(r)).item.colors,
  };
}

/**
 * The Font cell of a nesting style condition: font size, font style (Background, Bold, Italic) and Smaller per level.
 * @param {{ font: () => boolean, background: () => boolean }} switches
 * @returns {ConditionTableCompoundColumn<NestingStyleCondition>}
 */
function _nestFontCol(switches) {
  const BG = ConditionLists.BACKGROUND;
  const shown = _shown(switches.background);
  const STYLE_WORDS = { normal: "normal", bold: "bold", italic: "italic", bolditalic: "bold italic" };
  const STYLE_TIP = "Font style applied to the start element. Deeper levels use normal style.";
  return {
    key: "fontSize", header: "Font", kind: "compound", width: 210, enabled: () => switches.font(),
    tooltip: "Font applied to the child. Click to configure.",
    note: r => (shown.standIn(r.fontSize) || shown.standIn(r.fontStyle) ? NOTE_STAND_IN : ""),
    fields: [
      { key: "fontSize", header: "Font size", kind: "choice", get: shown.fontSize,
        get items() { return switches.background() ? FONT_SIZE_ITEMS : FONT_SIZE_ITEMS.filter(it => it !== BACKGROUND_ITEM); },
        tooltip: "Font size applied to the start element.",
        note: r => shown.standIn(r.fontSize) ? NOTE_STAND_IN : r.fontSize === BG ? NOTE_BACKGROUND
          : r.fontSize === 0 ? "Use the parent's font size, smaller by Smaller per level." : "" },
      { key: "fontStyle", header: "Font style", kind: "choice", tooltip: STYLE_TIP,
        get: shown.fontStyle,
        get items() { return switches.background() ? FONT_STYLE_ITEMS : FONT_STYLE_ITEMS.filter(it => it !== BACKGROUND_ITEM); },
        note: r => shown.standIn(r.fontStyle) && !shown.standIn(r.fontSize) ? NOTE_STAND_IN : r.fontStyle === BG ? NOTE_BACKGROUND
          : r.fontStyle === ConditionLists.SAME_TYPE ? "Use the parent's font style." : "" },
      { key: "fontDecreasePerLevel", header: "Smaller per level", kind: "spin", min: 1, max: 6, unit: "pt",
        enabled: r => shown.fontSize(r) !== BG,
        tooltip: "Reduce the font size by this many points at each deeper level, down to a minimum of 9 pt." },
    ],
    summary: r => {
      const size = shown.fontSize(r), style = shown.fontStyle(r);
      if (size === BG && style === BG) return "Background";
      const sizeText = size === BG ? "Background" : size ? String(size) : "Same as parent";
      const smaller = size === BG ? "" : ` −${r.fontDecreasePerLevel}`;
      // A chosen style is the cell's own font (textStyle); Background and Same as parent are named.
      const named = style === BG ? ", Background style" : style === ConditionLists.SAME_TYPE ? ", style Same as parent" : "";
      if (size === 0 && style === ConditionLists.SAME_TYPE) return "Same as parent" + smaller;
      return `${sizeText}${smaller}${named}`;
    },
    textStyle: r => { const s = shown.fontStyle(r); return s in STYLE_WORDS ? s : "normal"; },
  };
}

/**
 * Columns of the nesting style table (Color and font by nesting level): the nesting step, the property match,
 * and the Color and Font cells, greyed while their switch (Color, Font) is off.
 * @param {() => readonly { name: string, hex: string }[]} colors  the colors of the chosen palette
 * @param {{ color: () => boolean, font: () => boolean, background: () => boolean }} switches  background: a background view is chosen and on
 * @returns {readonly ConditionTableColumn<NestingStyleCondition>[]}
 */
function nestingStyleConditionColumns(colors, switches) {
  return Object.freeze([
    _onCol,
    Object.assign(_typeCol("parent", "Parent type", "Type of the parent container.\n" +
      "(n): number of containers on the predicted view whose children this condition styles.", 140), { count: "parents" }),
    { key: "direction", header: "Direction", kind: "choice", items: DIRECTION_ITEMS, width: 80,
      tooltip: "Outgoing: the relation starts at the parent; Incoming: it ends there; Either: both (default).\n" +
               "Either with relation All also matches a nesting without a relation." },
    _relCol("relation", "Relation type", "The model relation between parent and child. All = any type."),
    { key: "child", header: "Child type", kind: "choice", items: CHILD_ITEMS, width: 160, count: "children",
      tooltip: "Type of the child element this condition styles; Same as parent: the parent's type.\n" +
               "(n): number of matching elements on the predicted view, one nesting level deep." },
    Object.assign(_propCol("Match only when the child, parent or relation has the specified property value. Click to configure. Empty: any value.",
      { key: "propertyOf", header: "Property of", kind: "choice", items: NEST_PROP_OF_ITEMS,
        tooltip: "Whose property is read: the child, the parent or the relation between them." }), { width: 160 }),
    _nestColorCol(colors, switches),
    _nestFontCol(switches),
    { key: "warn", kind: "warn" },
  ]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    conditionTable, nestingStyleConditionColumns,
    FILTER_CONDITION_COLUMNS, DIAGRAM_CONDITION_COLUMNS, NESTING_CONDITION_COLUMNS, REVERSE_CONDITION_COLUMNS, STEP_CONDITION_COLUMNS, styleConditionColumns,
  };
}
