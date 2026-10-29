/**
 * SWT helpers of the View dialog: tab pages, groups, form rows, combos, checks, spinners, colour pickers, fonts.
 * No dialog state; the tabs and dialog_main.js build on them.
 */
console.log("Loading widgets.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
const Chroma = require("chroma-js");

const { COLOR_RANGES } = Defs;

const SWT               = Java.type("org.eclipse.swt.SWT");
const LabelWidget       = Java.type("org.eclipse.swt.widgets.Label");
const CompositeWidget   = Java.type("org.eclipse.swt.widgets.Composite");
const SpinnerWidget     = Java.type("org.eclipse.swt.widgets.Spinner");
const GroupWidget       = Java.type("org.eclipse.swt.widgets.Group");
const ButtonWidget      = Java.type("org.eclipse.swt.widgets.Button");
const ComboWidget       = Java.type("org.eclipse.swt.widgets.Combo");
const CanvasWidget      = Java.type("org.eclipse.swt.widgets.Canvas");
const TabItemWidget           = Java.type("org.eclipse.swt.widgets.TabItem");
const ScrolledCompositeWidget = Java.type("org.eclipse.swt.custom.ScrolledComposite");
const SWTMenu                 = Java.type("org.eclipse.swt.widgets.Menu");
const MenuItemWidget          = Java.type("org.eclipse.swt.widgets.MenuItem");
const SWTColorDialog          = Java.type("org.eclipse.swt.widgets.ColorDialog");
const SWTColor                = Java.type("org.eclipse.swt.graphics.Color");
const SWTImage                = Java.type("org.eclipse.swt.graphics.Image");
const SWTGC                   = Java.type("org.eclipse.swt.graphics.GC");
const SWTRGB                  = Java.type("org.eclipse.swt.graphics.RGB");
const GridDataFactory         = Java.type("org.eclipse.jface.layout.GridDataFactory");
const GridLayoutFactory       = Java.type("org.eclipse.jface.layout.GridLayoutFactory");

// ── Options ───────────────────────────────────────────────────────────────────

/**
 * group options.
 * @typedef {{ bold?: boolean, grabH?: boolean, grabV?: boolean, marginH?: number, marginV?: number,
 *             spaceH?: number, spaceV?: number }} GroupOptions
 */

// Wrap a tab's content composite in a ScrolledComposite so it survives dialog resize.
// Returns the inner content composite to add widgets to.
/**
 * @param {Swt.TabFolder} tabFolder
 * @param {string} tabLabel
 */
function scrolledTab(tabFolder, tabLabel) {
  const tab      = new TabItemWidget(tabFolder, SWT.NONE);
  tab.setText(tabLabel);
  const scrolled = new ScrolledCompositeWidget(tabFolder, SWT.V_SCROLL | SWT.H_SCROLL);
  scrolled.setExpandHorizontal(true);
  scrolled.setExpandVertical(true);
  tab.setControl(scrolled);

  const page = new CompositeWidget(scrolled, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(1).margins(6, 6).spacing(4, 4).applyTo(page);

  // Recompute scroll min-size after layout — called once at end of tab builder.
  // `scrolled` is returned so callers can re-run resizeScrolled when the page mutates
  // (e.g. related-elements blocks added/removed/collapsed at runtime).
  return {
    page,
    scrolled,
    finish: () => {
      scrolled.setContent(page);
      resizeScrolled(scrolled, page);
    },
  };
}

/**
 * @param {Swt.Composite} parent
 * @param {string} text
 */
function lbl(parent, text) {
  const l = new LabelWidget(parent, SWT.NONE);
  l.setText(text || "");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(l);
  return l;
}

// Recompute ScrolledComposite min-size after page content changes.
// The page takes the viewport width, unless a control that must be shown whole (a condition table,
// data "fitWidth") is wider: then the dialog grows — only wider, within the monitor — and when
// the monitor is too narrow too the tab scrolls horizontally.
/**
 * @param {Swt.ScrolledComposite} scrolled
 * @param {Swt.Composite} page
 */
function resizeScrolled(scrolled, page) {
  if (!scrolled || !page) return;
  try {
    let clientW = scrolled.getClientArea().width;
    if (clientW <= 0 || !scrolled.isVisible()) {
      scrolled.setMinSize(page.computeSize(clientW > 0 ? clientW : SWT.DEFAULT, SWT.DEFAULT));
      return;
    }
    // Page width at which every fitWidth control has its natural width.
    const short = _fitShortfall(page);
    let wantW = short === null ? clientW : page.getSize().x + short;
    if (wantW > clientW) {
      _growShell(scrolled.getShell(), wantW - clientW);
      clientW = scrolled.getClientArea().width;
    }
    scrolled.setMinSize(page.computeSize(Math.max(clientW, wantW), SWT.DEFAULT));
  } catch (e) {}
}

// Largest (natural width − current width) over the visible fitWidth controls under root;
// null when there are none.
/**
 * @param {Swt.Composite} root
 * @returns {number | null}
 */
function _fitShortfall(root) {
  /** @type {number | null} */
  let short = null;
  /** @param {Swt.Composite} c */
  const walk = c => {
    for (const k of c.getChildren()) {
      if (k.isDisposed() || !k.getVisible()) continue;
      if (k.getData("fitWidth")) {
        const d = k.computeSize(SWT.DEFAULT, SWT.DEFAULT).x - k.getSize().x;
        short = short === null ? d : Math.max(short, d);
      } else if (k instanceof CompositeWidget) walk(k);
    }
  };
  walk(root);
  return short;
}

// Widen the (visible) shell by dx, kept within the monitor; it never shrinks.
/**
 * @param {Swt.Shell} shell
 * @param {number} dx
 */
function _growShell(shell, dx) {
  if (!shell || !shell.isVisible() || dx <= 0) return;
  const area = shell.getMonitor().getClientArea();
  const b = shell.getBounds();
  const newW = Math.min(area.width, b.width + dx);
  if (newW <= b.width) return;
  const newX = Math.max(area.x, Math.min(b.x - Math.round((newW - b.width) / 2), area.x + area.width - newW));
  shell.setBounds(newX, b.y, newW, b.height);
  shell.layout(true, true);
}

// Module-level bold font, lazy-created once per script load. Never disposed (jArchi condition).
/** @type {Swt.Font | null} */
let _boldFontCache = null;
function getBoldFont() {
  if (_boldFontCache) return _boldFontCache;
  try {
    const FontDescriptor = Java.type("org.eclipse.jface.resource.FontDescriptor");
    const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
    const fd = FontDescriptor.createFrom(display.getSystemFont()).setStyle(SWT.BOLD);
    _boldFontCache = fd.createFont(display);
  } catch (e) {}
  return _boldFontCache;
}

// Module-level group background: the widget background, a little lighter, so groups stand out
// from the page. Lazy-created once per script load. Never disposed (like the bold font).
/** @type {Swt.Color | null} */
let _groupBgCache = null;
function getGroupBackground() {
  if (_groupBgCache) return _groupBgCache;
  try {
    const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
    const rgb = display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND).getRGB();
    const dark = (rgb.red + rgb.green + rgb.blue) / 3 < 128;
    const f = dark ? 0.08 : 0.5;   // share of the way to white
    const up = (/** @type {number} */ c) => Math.round(c + (255 - c) * f);
    _groupBgCache = new SWTColor(display, up(rgb.red), up(rgb.green), up(rgb.blue));
  } catch (e) {}
  return _groupBgCache;
}

// Grey explanatory line under a control.
/**
 * @param {Swt.Composite} parent
 * @param {string} text
 */
function noteLabel(parent, text) {
  const lbl = new LabelWidget(parent, SWT.WRAP);
  lbl.setText(text);
  try { lbl.setForeground(parent.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY)); } catch (e) {}
  GridDataFactory.fillDefaults().grab(true, false).hint(300, SWT.DEFAULT).applyTo(lbl);
  _wrapToParent(lbl);
  return lbl;
}

// A wrapping label breaks at its parent's width: the width hint follows the parent on resize, so
// the label's height fits its lines (a fixed hint gives lines of one width and a height of another).
/** @param {Swt.Label} lbl */
function _wrapToParent(lbl) {
  const parent = lbl.getParent();
  parent.addListener(SWT.Resize, () => {
    try {
      const lay = parent.getLayout();
      const inner = parent.getClientArea().width - 2 * lay.marginWidth - lay.marginLeft - lay.marginRight;
      const gd = lbl.getLayoutData();
      if (inner > 50 && gd.widthHint !== inner) {
        gd.widthHint = inner;
        parent.layout(true, false);
        // The label's height changed: let the tab's scrolled area follow.
        for (let c = parent; c; c = c.getParent())
          // Cast: a tab's content is its page composite (scrolledTab).
          if (c instanceof ScrolledCompositeWidget) { resizeScrolled(c, /** @type {Swt.Composite} */ (c.getContent())); break; }
      }
    } catch (e) {}
  });
}

/**
 * True when a nesting condition list nests anything: an Include condition that is on.
 * @param {DialogWidgets} w
 */
function hasNestingConditions(w) {
  return !!w.tblNestingConditions && w.tblNestingConditions.getConditions().some(r => r.on !== false && r.mode !== "exclude");
}

// ── Colour picker ─────────────────────────────────────────────────────────────
// The one control for choosing a colour or a colour range: a button that shows the chosen item's
// swatch (or gradient strip) and name, and a menu that shows every item with its own swatch. An SWT
// Combo shows text only on GTK, so a menu is the way to see the colours before choosing.

const SWATCH_H = 14;

/**
 * An image of a swatch: one colour, a gradient of several, or none (an empty frame).
 * @param {Swt.Display} display
 * @param {readonly string[]} colors  hex values; [] = none
 * @param {number} width
 * @param {boolean} on  false: an empty frame (a disabled control shows no colour)
 */
function _swatchImage(display, colors, width, on) {
  const img = new SWTImage(display, width, SWATCH_H);
  const gc = new SWTGC(img);
  gc.setBackground(display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND));
  gc.fillRectangle(0, 0, width, SWATCH_H);
  if (on) {
    const seg = width / Math.max(1, colors.length);
    colors.forEach((hex, i) => {
      const col = new SWTColor(display, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
      gc.setBackground(col);
      gc.fillRectangle(Math.round(i * seg), 0, Math.ceil(seg), SWATCH_H);
      col.dispose();
    });
  }
  gc.setForeground(display.getSystemColor(SWT.COLOR_WIDGET_NORMAL_SHADOW));
  gc.drawRectangle(0, 0, width - 1, SWATCH_H - 1);
  gc.dispose();
  return img;
}

/**
 * Colour picker (see above). Items are read each time the menu opens or the value is set, so a
 * changed list (another palette) shows at once. A value that is not among the items stays,
 * shown as `missing(value)`. With `other`, the menu ends in "Other…": the system colour dialog,
 * whose choice is a hex value.
 * @param {Swt.Composite} parent
 * @param {ColorPickerOptions} opts
 * @returns {ColorPicker}
 */
function colorPicker(parent, opts) {
  const swatchW = opts.swatchWidth || 16;
  const btn = new ButtonWidget(parent, SWT.PUSH);
  GridDataFactory.swtDefaults().hint(opts.width || SWT.DEFAULT, SWT.DEFAULT).align(SWT.FILL, SWT.CENTER).applyTo(btn);
  if (opts.tooltip) btn.setToolTipText(opts.tooltip);
  let value = opts.value || "";
  let enabled = true;
  /** @type {Swt.Image | null} */
  let btnImage = null;
  /** @type {Swt.Menu | null} */
  let menu = null;
  /** @type {Swt.Image[]} */
  let menuImages = [];

  /** @returns {ColorPickerItem} */
  const current = () => opts.items().find(it => it.value === value) || opts.missing(value);
  const disposeMenu = () => {
    if (menu) { try { menu.dispose(); } catch (e) {} menu = null; }
    menuImages.forEach(img => { try { img.dispose(); } catch (e) {} });
    menuImages = [];
  };
  const show = () => {
    const it = current();
    const old = btnImage;
    btnImage = _swatchImage(btn.getDisplay(), it.colors, swatchW, enabled);
    btn.setImage(btnImage);
    btn.setText(it.label + "  ▾");
    if (old) old.dispose();
  };
  /** @param {string} v */
  const choose = v => { value = v; show(); opts.onChange(v); };

  btn.addListener(SWT.Selection, () => {
    disposeMenu();
    menu = new SWTMenu(btn);
    const m = menu;
    for (const it of opts.items()) {
      const mi = new MenuItemWidget(m, SWT.PUSH);
      mi.setText(it.value === value ? it.label + "   ✓" : it.label);
      const img = _swatchImage(btn.getDisplay(), it.colors, swatchW, true);
      menuImages.push(img);
      mi.setImage(img);
      mi.addListener(SWT.Selection, () => choose(it.value));
    }
    if (opts.other) {
      new MenuItemWidget(m, SWT.SEPARATOR);
      const mi = new MenuItemWidget(m, SWT.PUSH);
      mi.setText("Other…");
      mi.addListener(SWT.Selection, () => {
        const dlg = new SWTColorDialog(btn.getShell());
        if (/^#[0-9a-fA-F]{6}$/.test(value)) {
          dlg.setRGB(new SWTRGB(parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)));
        }
        const rgb = dlg.open();
        if (rgb) choose("#" + [rgb.red, rgb.green, rgb.blue].map(n => ("0" + Number(n).toString(16)).slice(-2)).join(""));
      });
    }
    const b = btn.getBounds();
    m.setLocation(btn.getParent().toDisplay(b.x, b.y + b.height));
    m.setVisible(true);
  });
  btn.addListener(SWT.Dispose, () => { disposeMenu(); if (btnImage) btnImage.dispose(); });
  show();

  return {
    button: btn,
    get: () => value,
    set: v => { value = v || ""; show(); },
    refresh: () => show(),
    enable: on => { enabled = !!on; btn.setEnabled(enabled); show(); },
    setToolTipText: t => btn.setToolTipText(t),
  };
}

/** Items of a colour-range picker: every ColorBrewer range with its gradient. */
function colorRangeItems() {
  return COLOR_RANGES.map(r => ({ value: r, label: r, colors: Chroma.scale(r).colors(12) }));
}

/**
 * Colour-range picker (style conditions, highlight repeated).
 * @param {Swt.Composite} parent
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {string} [tooltip]
 */
function colorRangePicker(parent, value, onChange, tooltip) {
  return colorPicker(parent, {
    items: colorRangeItems, value, onChange, tooltip, swatchWidth: 60, width: 150,
    missing: v => ({ value: v, label: v, colors: [] }),
  });
}

// Group container with the project's standard GridData + GridLayout.
// Pass " " (single space) as label for an unlabelled-but-title-bar-reserved group.
// By default the title bar font is made bold; pass bold: false to opt out (e.g. action row groups).
/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {number} numColumns
 * @param {GroupOptions} [opts]
 */
function group(parent, label, numColumns, opts) {
  opts = opts || {};
  const grp = new GroupWidget(parent, SWT.NONE);
  grp.setText(label);
  if (opts.bold !== false) { const f = getBoldFont(); if (f) try { grp.setFont(f); } catch (e) {} }
  const bg = getGroupBackground();
  if (bg) try { grp.setBackground(bg); grp.setBackgroundMode(SWT.INHERIT_DEFAULT); } catch (e) {}
  GridDataFactory.fillDefaults()
    .grab(opts.grabH !== false, opts.grabV || false)
    .applyTo(grp);
  GridLayoutFactory.fillDefaults()
    .numColumns(numColumns)
    .margins(opts.marginH || 6, opts.marginV || 4)
    .spacing(opts.spaceH || 4, opts.spaceV || 4)
    .applyTo(grp);
  return grp;
}

// Form row: heading | label control | label control | label control (FORM_COLS cells).
// alignFormColumns lines up only the headings (one column for every registered row, also across
// groups); after the heading, each label sits right before its control and pairs follow each other.
// A checkbox takes a whole label/control pair (span 2). Rows that share a `raster` key form a
// table: every column starts at the same x — labels as wide as the widest label of their column,
// so the controls line up below each other. Controls keep their own width (spinners one width,
// combos their natural width); a checkbox spanning a pair takes its natural width. `rasterCols`
// limits the raster to the first columns (2 = the first label/control pair); cells after them
// follow each other as in a plain row.
const SPINNER_WIDTH = 65;  // every number spinner — fits 4 digits
const FORM_COLS     = 7;   // heading + 3 label/control pairs
const GAP_FIELD     = 6;   // label → its control
const GAP_PAIR      = 20;  // pair → next pair on the same row
const GAP_HEADING   = 12;  // heading → first pair
/**
 * @param {Swt.Composite} parent
 * @param {string} heading
 * @param {Swt.Composite[]} rows  every form row, for alignFormColumns
 * @param {string} [raster]
 * @param {number} [rasterCols]
 */
function formRow(parent, heading, rows, raster, rasterCols) {
  const row = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(FORM_COLS).margins(0, 0).spacing(0, 3).applyTo(row);
  GridDataFactory.fillDefaults().grab(true, false).applyTo(row);
  new LabelWidget(row, SWT.NONE).setText(heading);
  row.setData("raster", raster || null);
  row.setData("rasterCols", rasterCols || FORM_COLS - 1);
  rows.push(row);
  return row;
}

/** @param {Swt.Composite[]} rows */
function alignFormColumns(rows) {
  const cells = (/** @type {Swt.Composite} */ row) => {
    let col = 0;
    return Array.from(row.getChildren()).map(c => {
      const gd = c.getLayoutData();
      const span = (gd && gd.horizontalSpan) || 1;
      const cell = { c, col, span, natural: c.computeSize(SWT.DEFAULT, SWT.DEFAULT).x };
      col += span;
      return cell;
    });
  };
  const headingW = Math.max(0, ...rows.map(r => cells(r)[0].natural));
  const gapBefore = (/** @type {number} */ col) => col === 1 ? GAP_HEADING : col % 2 === 0 ? GAP_FIELD : GAP_PAIR;
  /** @type {(c: Swt.Control, natural: number) => number} */
  const ownWidth = (c, natural) => { const gd = c.getLayoutData(); return gd && gd.widthHint > 0 ? gd.widthHint : natural; };
  // Raster rows: per raster key, the widest single-column cell of each column, and from that
  // the x at which each column starts (x = 0 right after the heading column).
  /** @type {Map<string, { ws: number[], xs?: number[] }>} */
  const rasterX = new Map();
  for (const row of rows) {
    const key = row.getData("raster");
    if (!key) continue;
    const r = rasterX.get(key) || { ws: [] };
    const n = row.getData("rasterCols");
    for (const { c, col, span, natural } of cells(row))
      if (col > 0 && col <= n && span === 1) r.ws[col] = Math.max(r.ws[col] || 0, ownWidth(c, natural));
    rasterX.set(key, r);
  }
  // A cell spanning columns (a checkbox over a pair) widens the first of them when it does not fit.
  for (const row of rows) {
    const r = rasterX.get(row.getData("raster"));
    if (!r) continue;
    for (const { c, col, span, natural } of cells(row)) {
      if (col === 0 || span === 1 || col > row.getData("rasterCols")) continue;
      let room = r.ws[col] || 0;
      for (let k = col + 1; k < col + span; k++) room += gapBefore(k) + (r.ws[k] || 0);
      const need = ownWidth(c, natural);
      if (need > room) r.ws[col] = (r.ws[col] || 0) + need - room;
    }
  }
  for (const r of rasterX.values()) {
    r.xs = [];
    let x = 0;
    for (let col = 1; col < FORM_COLS; col++) { x += gapBefore(col); r.xs[col] = x; x += r.ws[col] || 0; }
  }
  for (const row of rows) {
    const r = rasterX.get(row.getData("raster"));
    const n = row.getData("rasterCols");
    let x = 0;   // where the previous cell ended
    for (const { c, col, span, natural } of cells(row)) {
      const gd = GridDataFactory.swtDefaults().span(span, 1).align(SWT.BEGINNING, SWT.CENTER);
      if (col === 0) { gd.hint(headingW, SWT.DEFAULT).applyTo(c); continue; }
      const own = ownWidth(c, natural);
      // Labels fill their raster column, so the control after them starts at the column's x.
      const isLabel = col % 2 === 1 && span === 1;
      const inRaster = r && col <= n;
      const w = inRaster && isLabel ? Math.max(own, r.ws[col] || 0) : own;
      const start = inRaster ? /** @type {number[]} */ (r.xs)[col] : x + gapBefore(col);   // Cast: xs is set for every raster above
      gd.hint(w, SWT.DEFAULT).indent(Math.max(0, start - x), 0).applyTo(c);
      x = Math.max(x, start) + w;
    }
  }
}

// Label + read-only combo + items + selection + width hint + widget registration.
/**
 * @param {Swt.Composite} parent
 * @param {string | null} label
 * @param {readonly string[]} items
 * @param {number} selectedIdx
 * @param {number} widthHint
 * @param {string} key
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} [tooltip]
 */
function addCombo(parent, label, items, selectedIdx, widthHint, key, w, tooltip) {
  const lbl = label ? new LabelWidget(parent, SWT.NONE) : null;
  if (lbl) lbl.setText(/** @type {string} */ (label));   // Cast: lbl exists only with a label
  const cmb = new ComboWidget(parent, SWT.READ_ONLY | SWT.DROP_DOWN);
  if (lbl) cmb.setData("label", lbl);
  items.forEach(it => cmb.add(it));
  cmb.select(selectedIdx);
  GridDataFactory.swtDefaults().hint(widthHint, SWT.DEFAULT).applyTo(cmb);
  if (tooltip) cmb.setToolTipText(tooltip);
  w[key] = cmb;
  return cmb;
}

/**
 * @param {any} widget  an SWT control, or a controller with enable() (condition table, colour-range cell)
 * @param {boolean} enabled
 */
function enable(widget, enabled) {
  if (!widget) return;
  if (widget.enable) { widget.enable(enabled); return; }  // controller (condition table, colour-range cell)
  try { widget.setEnabled(enabled); } catch (e) {}
  // The label in front of a combo / spinner greys with it (see addCombo, addSpinnerRow).
  try { const lbl = widget.getData("label"); if (lbl) lbl.setEnabled(enabled); } catch (e) {}
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string} tip
 * @param {() => void} handler
 */
function pushBtn(parent, label, tip, handler) {
  const btn = new ButtonWidget(parent, SWT.PUSH);
  btn.setText(label);
  if (tip) btn.setToolTipText(tip);
  btn.addListener(SWT.Selection, handler);
  return btn;
}

const CHECK_SIZE = 16;

/**
 * A drawn checkbox. A disabled GTK checkbox keeps its blue tick and still looks active; this one
 * turns grey when disabled. Mouse click and Space toggle it; Tab moves past it.
 * @param {Swt.Composite} parent
 * @param {boolean} value
 * @param {(value: boolean) => void} onChange
 * @returns {Required<ConditionTableCell> & { canvas: Swt.Canvas, get(): boolean, toggle(): void }}
 */
function canvasCheck(parent, value, onChange) {
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
    get() { return checked; },
    toggle,
    set(v) { checked = !!v; canvas.redraw(); },
    enable(on) { canvas.setEnabled(on); canvas.redraw(); },
    setToolTipText(text) { canvas.setToolTipText(text); },
  };
}

/**
 * A checkbox with its label, drawn, so it turns grey when disabled (see canvasCheck). Behaves like
 * the SWT button it replaces: getSelection / setSelection / addListener(SWT.Selection) / setEnabled;
 * `control` is the composite to lay out.
 * @param {Swt.Composite} parent
 * @param {string} label  "" for a box without text
 * @returns {CheckBox}
 */
function checkBox(parent, label) {
  const box = new CompositeWidget(parent, SWT.NONE);
  GridLayoutFactory.fillDefaults().numColumns(label ? 2 : 1).margins(0, 0).spacing(4, 0).applyTo(box);
  /** @type {(() => void)[]} */
  const listeners = [];
  const cell = canvasCheck(box, false, () => listeners.forEach(fn => fn()));
  GridDataFactory.swtDefaults().hint(CHECK_SIZE + 2, CHECK_SIZE + 2).applyTo(cell.canvas);
  /** @type {Swt.Label | null} */
  let text = null;
  if (label) {
    text = new LabelWidget(box, SWT.NONE);
    text.setText(label);
    GridDataFactory.fillDefaults().align(SWT.BEGINNING, SWT.CENTER).applyTo(text);
    text.addListener(SWT.MouseUp, e => { if (e.button === 1) cell.toggle(); });
  }
  const setEnabled = (/** @type {boolean} */ on) => { cell.enable(on); if (text) text.setEnabled(on); };
  return {
    control: box,
    getSelection: () => cell.get(),
    setSelection: v => cell.set(v),
    addListener: (type, fn) => { listeners.push(fn); },
    setText: t => { if (text) text.setText(t); },
    setToolTipText: t => { box.setToolTipText(t); cell.canvas.setToolTipText(t); if (text) text.setToolTipText(t); },
    setEnabled,
    enable: setEnabled,
    isEnabled: () => cell.canvas.isEnabled(),
  };
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string | null} tip
 * @param {number} span
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} key
 */
function addCheck(parent, label, tip, span, w, key) {
  const chk = checkBox(parent, label);
  if (tip) chk.setToolTipText(tip);
  GridDataFactory.fillDefaults().span(span, 1).applyTo(chk.control);
  w[key] = chk;
  return chk;
}

/**
 * @param {Swt.Composite} parent
 * @param {string} label
 * @param {string} key
 * @param {number} defVal
 * @param {number} min
 * @param {number} max
 * @param {number} step
 * @param {Record<string, unknown>} w  widget map (DialogWidgets), filled by name
 * @param {string} [tooltip]
 */
function addSpinnerRow(parent, label, key, defVal, min, max, step, w, tooltip) {
  const lbl = new LabelWidget(parent, SWT.NONE);
  lbl.setText(label);
  const sp = new SpinnerWidget(parent, SWT.BORDER);
  sp.setData("label", lbl);
  sp.setValues(defVal, min, max, 0, step, step * 5);
  GridDataFactory.swtDefaults().hint(SPINNER_WIDTH, SWT.DEFAULT).applyTo(sp);
  if (tooltip) sp.setToolTipText(tooltip);
  w[key] = sp;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    scrolledTab, lbl, resizeScrolled, getBoldFont, getGroupBackground, noteLabel, hasNestingConditions, colorPicker, colorRangePicker, colorRangeItems, group, formRow, alignFormColumns, addCombo, enable, pushBtn, addCheck, checkBox, canvasCheck, CHECK_SIZE, addSpinnerRow, SPINNER_WIDTH, GAP_FIELD, GAP_PAIR,
  };
}
