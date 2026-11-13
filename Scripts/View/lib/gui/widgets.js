/**
 * SWT helpers of the View dialog: tab pages, groups, form rows, combos, checks, spinners, colour pickers, fonts.
 * No dialog state; the tabs and dialog_main.js build on them.
 */
console.log("Loading widgets.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../palettes")} */
const Palettes = require(REPO_ROOT + "View/lib/palettes");


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
const ShellWidget             = Java.type("org.eclipse.swt.widgets.Shell");
const TextWidget              = Java.type("org.eclipse.swt.widgets.Text");
const TreeWidget              = Java.type("org.eclipse.swt.widgets.Tree");
const TreeItemWidget          = Java.type("org.eclipse.swt.widgets.TreeItem");
const ListWidget              = Java.type("org.eclipse.swt.widgets.List");
const SWTMenu                 = Java.type("org.eclipse.swt.widgets.Menu");
const MenuItemWidget          = Java.type("org.eclipse.swt.widgets.MenuItem");
const SWTColorDialog          = Java.type("org.eclipse.swt.widgets.ColorDialog");
const SWTColor                = Java.type("org.eclipse.swt.graphics.Color");
const SWTImage                = Java.type("org.eclipse.swt.graphics.Image");
const SWTGC                   = Java.type("org.eclipse.swt.graphics.GC");
const SWTRGB                  = Java.type("org.eclipse.swt.graphics.RGB");
const SWTPoint                = Java.type("org.eclipse.swt.graphics.Point");
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
      // The page reflows to the viewport width, notes included, once the user stops resizing
      // (one layout per pause, not one per resize event). A resize by the user never widens the
      // dialog back: a table wider than the tab then scrolls horizontally.
      let last = 0, pending = false;
      const settle = () => {
        if (scrolled.isDisposed()) { pending = false; return; }
        const idle = Date.now() - last;
        if (idle < RESIZE_SETTLE_MS) { scrolled.getDisplay().timerExec(RESIZE_SETTLE_MS - idle, settle); return; }
        pending = false;
        resizeScrolled(scrolled, page, { growShell: false });
      };
      scrolled.addListener(SWT.Resize, () => {
        last = Date.now();
        if (pending) return;
        pending = true;
        scrolled.getDisplay().timerExec(RESIZE_SETTLE_MS, settle);
      });
    },
  };
}

// Recompute ScrolledComposite min-size after page content changes.
// The page takes the viewport width, unless a control that must be shown whole (a condition table,
// data "fitWidth") is wider: then the dialog grows — only wider, within the monitor — and when
// the monitor is too narrow too the tab scrolls horizontally.
/**
 * @param {Swt.ScrolledComposite} scrolled
 * @param {Swt.Composite} page
 * @param {{ growShell?: boolean }} [opts]  growShell false: the user resized the dialog, keep its width
 */
function resizeScrolled(scrolled, page, opts) {
  if (!scrolled || !page) return;
  // While the dialog holds its layout (_syncToUI) new controls have no size yet and would read as cut
  // off: the dialog fits the shown tab once the layout is released.
  if (page.isLayoutDeferred()) return;
  try {
    let clientW = scrolled.getClientArea().width;
    if (clientW <= 0 || !scrolled.isVisible()) {
      scrolled.setMinSize(page.computeSize(clientW > 0 ? clientW : SWT.DEFAULT, SWT.DEFAULT));
      return;
    }
    _fitNotes(page, clientW);
    // Page width at which every fitWidth control has its natural width.
    const short = _fitShortfall(page);
    const wantW = short === null ? clientW : page.getSize().x + short;
    if (wantW > clientW && !(opts && opts.growShell === false)) {
      _growShell(scrolled.getShell(), wantW - clientW);
      clientW = scrolled.getClientArea().width;
    }
    const pageW = Math.max(clientW, wantW);
    if (pageW !== clientW) _fitNotes(page, pageW);   // the page scrolls: notes wrap at its width
    scrolled.setMinSize(page.computeSize(pageW, SWT.DEFAULT));
  } catch (e) {}   // silent: a resize on widgets that may be disposed (the dialog closing)
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
  const FontDescriptor = Java.type("org.eclipse.jface.resource.FontDescriptor");
  const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
  const fd = FontDescriptor.createFrom(display.getSystemFont()).setStyle(SWT.BOLD);
  _boldFontCache = fd.createFont(display);
  return _boldFontCache;
}

// Module-level group background: the widget background, a little lighter, so groups stand out
// from the page. Lazy-created once per script load. Never disposed (like the bold font).
/** @type {Swt.Color | null} */
let _groupBgCache = null;
function getGroupBackground() {
  if (_groupBgCache) return _groupBgCache;
  const display = Java.type("org.eclipse.swt.widgets.Display").getCurrent();
  const rgb = display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND).getRGB();
  const dark = (rgb.red + rgb.green + rgb.blue) / 3 < 128;
  const f = dark ? 0.08 : 0.5;   // share of the way to white
  const up = (/** @type {number} */ c) => Math.round(c + (255 - c) * f);
  _groupBgCache = new SWTColor(display, up(rgb.red), up(rgb.green), up(rgb.blue));
  return _groupBgCache;
}

// Pause after the last resize event before the tab is laid out again.
const RESIZE_SETTLE_MS = 150;

// Grey explanatory line: an opening line of a group or a note under a control. It wraps at its
// parent's width (resizeScrolled → _fitNotes), also when the dialog gets narrower again.
const NOTE_MIN_WIDTH = 100;
/**
 * @param {Swt.Composite} parent
 * @param {string} text
 */
function noteLabel(parent, text) {
  const lbl = new LabelWidget(parent, SWT.WRAP);
  lbl.setText(text);
  lbl.setForeground(parent.getDisplay().getSystemColor(SWT.COLOR_DARK_GRAY));
  GridDataFactory.fillDefaults().grab(true, false).hint(NOTE_MIN_WIDTH, SWT.DEFAULT).applyTo(lbl);
  lbl.setData("note", true);
  return lbl;
}

// A wrapping label needs a width hint: without one it asks for its text on one line, with a fixed
// one its lines follow the column and its height the hint. So the notes first get the minimum
// hint, the page is laid out at the viewport width, and then each note gets its parent's inner
// width, so its height fits its lines. A note never makes the page wider than the viewport.
/**
 * @param {Swt.Composite} page
 * @param {number} width  viewport width
 */
function _fitNotes(page, width) {
  /** @type {Swt.Label[]} */
  const notes = [];
  /** @param {Swt.Composite} c */
  const collect = c => {
    for (const child of c.getChildren()) {
      if (child.getData("note")) notes.push(/** @type {Swt.Label} */ (child));   // Cast: only noteLabel sets "note"
      else if (child instanceof CompositeWidget) collect(/** @type {Swt.Composite} */ (child));
    }
  };
  collect(page);
  if (!notes.length) return;
  for (const n of notes) n.getLayoutData().widthHint = NOTE_MIN_WIDTH;
  page.setSize(width, page.computeSize(width, SWT.DEFAULT).y);
  page.layout(true, true);
  for (const n of notes) {
    const parent = n.getParent(), lay = parent.getLayout(), gd = n.getLayoutData();
    const inner = parent.getClientArea().width - 2 * lay.marginWidth - lay.marginLeft - lay.marginRight - gd.horizontalIndent;
    if (inner > NOTE_MIN_WIDTH) gd.widthHint = inner;
  }
  page.layout(true, true);
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
const SWATCH_W = 16;

/**
 * Draw a swatch: one colour, a gradient of several, or none (an empty frame).
 * @param {Swt.GC} gc
 * @param {Swt.Display} display
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {readonly string[]} colors  hex values; [] = none
 * @param {boolean} on  false: an empty frame (a disabled control shows no colour)
 */
function drawSwatch(gc, display, x, y, width, colors, on) {
  gc.setBackground(display.getSystemColor(SWT.COLOR_WIDGET_BACKGROUND));
  gc.fillRectangle(x, y, width, SWATCH_H);
  if (on) {
    const seg = width / Math.max(1, colors.length);
    colors.forEach((hex, i) => {
      const col = new SWTColor(display, parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
      gc.setBackground(col);
      gc.fillRectangle(x + Math.round(i * seg), y, Math.ceil(seg), SWATCH_H);
      col.dispose();
    });
  }
  gc.setForeground(display.getSystemColor(SWT.COLOR_WIDGET_NORMAL_SHADOW));
  gc.drawRectangle(x, y, width - 1, SWATCH_H - 1);
}

/**
 * An image of a swatch (drawSwatch), for a button or menu item.
 * @param {Swt.Display} display
 * @param {readonly string[]} colors
 * @param {number} width
 * @param {boolean} on
 */
function _swatchImage(display, colors, width, on) {
  const img = new SWTImage(display, width, SWATCH_H);
  const gc = new SWTGC(img);
  drawSwatch(gc, display, 0, 0, width, colors, on);
  gc.dispose();
  return img;
}

/**
 * The item a colour choice shows for a value. A value the items do not hold: with `fallback` it is
 * replaced (`value` differs from the one given), so the control always shows what the run uses; else
 * it is shown as `missing` gives it. A hex value chosen with Other… is kept.
 * @param {ColorChoice} choice
 * @param {string} value
 * @returns {{ item: ColorPickerItem, value: string }}
 */
function colorItemFor(choice, value) {
  const items = choice.items();
  const found = items.find(it => it.value === value);
  if (found) return { item: found, value };
  if (choice.fallback && !(choice.other && Palettes.HEX.test(value))) {
    const v = choice.fallback(items);
    const item = items.find(it => it.value === v);
    if (item) return { item, value: v };
  }
  return { item: choice.missing(value), value };
}

/**
 * Open the menu of a colour choice at a display point: every item with its swatch, the current one
 * ticked, and with `other` "Other…" (the system colour dialog, whose choice is a hex value). The
 * caller disposes the menu (the images go with it) before opening the next.
 * @param {Swt.Control} control  the control the menu belongs to
 * @param {Swt.Point} at  display coordinates
 * @param {ColorChoice} choice
 * @param {string} value
 * @param {(value: string) => void} choose
 * @returns {Swt.Menu}
 */
function openColorMenu(control, at, choice, value, choose) {
  const display = control.getDisplay();
  const swatchW = choice.swatchWidth || SWATCH_W;
  const menu = new SWTMenu(control);
  /** @type {Swt.Image[]} */
  const images = [];
  for (const it of choice.items()) {
    const mi = new MenuItemWidget(menu, SWT.PUSH);
    mi.setText(it.value === value ? it.label + "   ✓" : it.label);
    const img = _swatchImage(display, it.colors, swatchW, true);
    images.push(img);
    mi.setImage(img);
    mi.addListener(SWT.Selection, () => choose(it.value));
  }
  if (choice.other) {
    new MenuItemWidget(menu, SWT.SEPARATOR);
    const mi = new MenuItemWidget(menu, SWT.PUSH);
    mi.setText("Other…");
    mi.addListener(SWT.Selection, () => {
      const dlg = new SWTColorDialog(control.getShell());
      if (Palettes.HEX.test(value)) {
        dlg.setRGB(new SWTRGB(parseInt(value.slice(1, 3), 16), parseInt(value.slice(3, 5), 16), parseInt(value.slice(5, 7), 16)));
      }
      const rgb = dlg.open();
      if (rgb) choose("#" + [rgb.red, rgb.green, rgb.blue].map(n => ("0" + Number(n).toString(16)).slice(-2)).join(""));
    });
  }
  // silent: an image may be disposed already, with the dialog
  menu.addListener(SWT.Dispose, () => images.forEach(img => { try { img.dispose(); } catch (e) {} }));
  menu.setLocation(at);
  menu.setVisible(true);
  return menu;
}

/**
 * Colour picker (see above). Items are read each time the menu opens or the value is set, so a
 * changed list (another palette) shows at once (colorItemFor).
 * @param {Swt.Composite} parent
 * @param {ColorPickerOptions} opts
 * @returns {ColorPicker}
 */
function colorPicker(parent, opts) {
  const swatchW = opts.swatchWidth || SWATCH_W;
  const btn = new ButtonWidget(parent, SWT.PUSH);
  GridDataFactory.swtDefaults().hint(opts.width || SWT.DEFAULT, SWT.DEFAULT).align(SWT.FILL, SWT.CENTER).applyTo(btn);
  if (opts.tooltip) btn.setToolTipText(opts.tooltip);
  let value = opts.value || "";
  let enabled = true;
  /** @type {Swt.Image | null} */
  let btnImage = null;
  /** @type {Swt.Menu | null} */
  let menu = null;

  // silent: the menu may be disposed already, with the dialog
  const disposeMenu = () => { if (menu) { try { menu.dispose(); } catch (e) {} menu = null; } };
  const show = () => {
    const c = colorItemFor(opts, value);
    if (c.value !== value) { value = c.value; opts.onChange(value); }   // replaced by the fallback: reported
    const old = btnImage;
    btnImage = _swatchImage(btn.getDisplay(), c.item.colors, swatchW, enabled);
    btn.setImage(btnImage);
    btn.setText(c.item.label + "  ▾");
    if (old) old.dispose();
  };
  /** @param {string} v */
  const choose = v => { value = v; show(); opts.onChange(v); };

  btn.addListener(SWT.Selection, () => {
    disposeMenu();
    const b = btn.getBounds();
    menu = openColorMenu(btn, btn.getParent().toDisplay(b.x, b.y + b.height), opts, value, choose);
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

/**
 * The choice of one colour (nesting style conditions, Mixed values color): the palette's colours by
 * name, Other… for a colour of its own (hex), and with `withDefault` the type's default fill ("").
 * A name the palette does not hold becomes its first colour, as the run uses it (palettes.colorOf).
 * @param {() => readonly { name: string, hex: string }[]} colors
 * @param {boolean} [withDefault]
 * @returns {ColorChoice}
 */
function paletteColorChoice(colors, withDefault) {
  return {
    items: () => [...(withDefault ? [{ value: "", label: "Default", colors: [] }] : []),
                  ...colors().map(c => ({ value: c.name, label: c.name, colors: [c.hex] }))],
    missing: v => ({ value: v, label: v, colors: Palettes.HEX.test(v) ? [v] : [] }),
    fallback: list => { const first = list.find(it => it.value !== ""); return first ? first.value : ""; },
    other: true,
  };
}

/**
 * The choice of a colour range (style conditions, highlight repeated): the ranges of the active palette.
 * @param {() => ColorPickerItem[]} items  the palette's ranges with their gradient (rangeItems)
 * @returns {ColorChoice}
 */
function colorRangeChoice(items) {
  return {
    items, swatchWidth: 60,
    missing: v => ({ value: v, label: v, colors: [] }),
    fallback: list => list.length ? list[0].value : "",   // a range the palette does not hold: its first range
  };
}

/**
 * Picker of one colour as a button (paletteColorChoice).
 * @param {Swt.Composite} parent
 * @param {{ colors: () => readonly { name: string, hex: string }[], value: string, onChange: (value: string) => void,
 *           withDefault?: boolean, tooltip?: string, width?: number }} opts
 * @returns {ColorPicker}
 */
function paletteColorPicker(parent, opts) {
  return colorPicker(parent, Object.assign(paletteColorChoice(opts.colors, opts.withDefault),
    { value: opts.value, onChange: opts.onChange, tooltip: opts.tooltip, width: opts.width }));
}

/**
 * Picker of a colour range as a button (colorRangeChoice).
 * @param {Swt.Composite} parent
 * @param {string} value
 * @param {(value: string) => void} onChange
 * @param {() => ColorPickerItem[]} items  the palette's ranges with their gradient (rangeItems)
 * @param {string} [tooltip]
 */
function colorRangePicker(parent, value, onChange, items, tooltip) {
  return colorPicker(parent, Object.assign(colorRangeChoice(items), { value, onChange, tooltip, width: 150 }));
}

/**
 * The items of a colour-range picker: each range of a palette with its gradient.
 * @param {Palette | undefined} palette
 * @returns {ColorPickerItem[]}
 */
function rangeItems(palette) {
  return palette ? palette.ranges.map(r => ({ value: r.name, label: r.name, colors: Palettes.rangeColors(r, 12) })) : [];
}

// ── Tree picker ───────────────────────────────────────────────────────────────
// A choice among names with folders ("folder/sub/name"): a button that shows the chosen name, and a
// pop-up with a filter field over a tree of folders (collapsible) and names. A combo lists them flat.

const TREE_PICKER_HEIGHT = 400;

/**
 * The tree of names: folders first, each level in the order of the names.
 * @param {readonly string[]} names  "name" or "folder/sub/name"
 * @returns {TreePickerFolder}
 */
function _treeOfNames(names) {
  /** @type {TreePickerFolder} */
  const root = { path: "", folders: new Map(), names: [] };
  for (const name of names) {
    const parts = name.split("/");
    let node = root;
    for (const part of parts.slice(0, -1)) {
      let sub = node.folders.get(part);
      if (!sub) {
        sub = { path: node.path ? node.path + "/" + part : part, folders: new Map(), names: [] };
        node.folders.set(part, sub);
      }
      node = sub;
    }
    node.names.push(name);
  }
  return root;
}

/**
 * Tree picker (see above). Names are read each time the pop-up opens. A click, or Enter on a
 * name, chooses it; Enter in the filter field chooses the first name shown; Esc or a click
 * elsewhere closes the pop-up.
 * @param {Swt.Composite} parent
 * @param {TreePickerOptions} opts
 * @returns {TreePicker}
 */
function treePicker(parent, opts) {
  const btn = new ButtonWidget(parent, SWT.PUSH | SWT.LEFT);
  if (opts.tooltip) btn.setToolTipText(opts.tooltip);
  let value = "";

  const show = () => btn.setText(value + "  ▾");
  /** @param {string} v */
  const choose = v => { value = v; show(); opts.onChange(v); };

  btn.addListener(SWT.Selection, () => _openTreePopup(btn, opts.items(), opts.first || [], value, choose));
  show();

  return {
    button: btn,
    get: () => value,
    set: v => { value = v; show(); },
  };
}

/**
 * The pop-up of a tree picker, under its button.
 * @param {Swt.Button} btn
 * @param {readonly string[]} names
 * @param {readonly string[]} first  top-level names shown above the folders
 * @param {string} current
 * @param {(name: string) => void} choose
 */
function _openTreePopup(btn, names, first, current, choose) {
  const popup = new ShellWidget(btn.getShell(), SWT.NO_TRIM);
  GridLayoutFactory.fillDefaults().margins(4, 4).spacing(0, 4).applyTo(popup);

  const txtFilter = new TextWidget(popup, SWT.SEARCH | SWT.ICON_CANCEL | SWT.BORDER);
  txtFilter.setMessage("Filter");
  GridDataFactory.fillDefaults().grab(true, false).applyTo(txtFilter);

  const tree = new TreeWidget(popup, SWT.SINGLE | SWT.V_SCROLL | SWT.H_SCROLL | SWT.BORDER);
  GridDataFactory.fillDefaults().grab(true, true).applyTo(tree);

  const close = () => { if (!popup.isDisposed()) popup.dispose(); };
  /** @param {string} name */
  const pick = name => { close(); choose(name); };
  const fill = () => _fillTree(tree, names, first, txtFilter.getText().trim().toLowerCase(), current);

  txtFilter.addListener(SWT.Modify, fill);
  txtFilter.addListener(SWT.DefaultSelection, () => {
    const first = _firstName(tree.getItems());
    if (first) pick(String(first.getData("name")));
  });
  txtFilter.addListener(SWT.KeyDown, e => {
    if (e.keyCode !== SWT.ARROW_DOWN) return;
    const first = _firstName(tree.getItems());
    if (first) tree.setSelection(first);
    tree.setFocus();
  });
  tree.addListener(SWT.MouseUp, e => {
    if (e.button !== 1) return;
    const item = tree.getItem(new SWTPoint(e.x, e.y));
    if (item && item.getData("name")) pick(String(item.getData("name")));
  });
  tree.addListener(SWT.DefaultSelection, () => {
    const item = tree.getSelection()[0];
    if (!item) return;
    if (item.getData("name")) pick(String(item.getData("name")));
    else item.setExpanded(!item.getExpanded());
  });
  for (const control of [txtFilter, tree]) {
    control.addListener(SWT.Traverse, e => {
      if (e.detail === SWT.TRAVERSE_ESCAPE) { e.doit = false; close(); }
    });
  }
  popup.addListener(SWT.Deactivate, close);

  fill();
  _placeTreePopup(popup, btn);
  popup.open();
  txtFilter.setFocus();
}

/**
 * Fill the tree with the names that contain the filter (in their full name, folders included).
 * Without a filter only the folders of the current name are expanded; with one, every folder.
 * @param {Swt.Tree} tree
 * @param {readonly string[]} names
 * @param {readonly string[]} first  top-level names shown above the folders
 * @param {string} filter  lower case; "" = all
 * @param {string} current
 */
function _fillTree(tree, names, first, filter, current) {
  tree.setRedraw(false);
  tree.removeAll();
  const root = _treeOfNames(filter ? names.filter(n => n.toLowerCase().includes(filter)) : names);
  /** @type {Swt.TreeItem | null} */
  let currentItem = null;
  /**
   * @param {Swt.Tree | Swt.TreeItem} parentItem
   * @param {string} name
   */
  const addName = (parentItem, name) => {
    const item = new TreeItemWidget(parentItem, SWT.NONE);
    item.setText(name.slice(name.lastIndexOf("/") + 1));
    item.setData("name", name);
    if (name === current) currentItem = item;
  };
  /**
   * @param {Swt.Tree | Swt.TreeItem} parentItem
   * @param {TreePickerFolder} node
   */
  const add = (parentItem, node) => {
    if (node === root) node.names.filter(n => first.includes(n)).forEach(n => addName(parentItem, n));
    for (const [label, sub] of node.folders) {
      const item = new TreeItemWidget(parentItem, SWT.NONE);
      item.setText(label);
      item.setFont(getBoldFont());
      add(item, sub);
      item.setExpanded(!!filter || current.startsWith(sub.path + "/"));   // after its children: GTK expands no empty item
    }
    node.names.filter(n => node !== root || !first.includes(n)).forEach(n => addName(parentItem, n));
  };
  add(tree, root);
  tree.setRedraw(true);
  if (currentItem) { tree.setSelection(currentItem); tree.showItem(currentItem); }
}

/**
 * The first name in the tree order, depth first.
 * @param {Swt.TreeItem[]} items
 * @returns {Swt.TreeItem | null}
 */
function _firstName(items) {
  for (const item of items) {
    if (item.getData("name")) return item;
    const found = _firstName(item.getItems());
    if (found) return found;
  }
  return null;
}

/**
 * Put the pop-up under the button, as wide as the button, within the monitor.
 * @param {Swt.Shell} popup
 * @param {Swt.Button} btn
 */
function _placeTreePopup(popup, btn) {
  const b      = btn.getBounds();
  const at     = btn.getParent().toDisplay(b.x, b.y + b.height);
  const area   = btn.getShell().getMonitor().getClientArea();
  const width  = Math.max(b.width, popup.computeSize(SWT.DEFAULT, SWT.DEFAULT).x);
  const height = Math.min(TREE_PICKER_HEIGHT, area.y + area.height - at.y);
  const x      = Math.max(area.x, Math.min(at.x, area.x + area.width - width));
  popup.setBounds(x, at.y, width, height);
}

// ── List pop-up ───────────────────────────────────────────────────────────────
// The list of a condition-table cell: a pop-up under the cell (above it when the monitor has no room
// below), at least as wide as the cell, with the current item selected. A click or Enter chooses;
// Esc or a click elsewhere closes. What a read-only combo's list does, without the combo.

const LIST_POPUP_ROWS = 12;   // visible items at most; the list scrolls for more

/**
 * @param {Swt.Control} control  the control the cell belongs to
 * @param {Swt.Rectangle} cell  the cell in display coordinates
 * @param {string[]} labels
 * @param {number} selected  index of the current item, or -1
 * @param {(index: number) => void} choose
 */
function openListPopup(control, cell, labels, selected, choose) {
  const popup = new ShellWidget(control.getShell(), SWT.NO_TRIM);
  GridLayoutFactory.fillDefaults().margins(0, 0).applyTo(popup);
  const list = new ListWidget(popup, SWT.SINGLE | SWT.V_SCROLL | SWT.BORDER);
  GridDataFactory.fillDefaults().grab(true, true).applyTo(list);
  list.setItems(Java.to(labels, "java.lang.String[]"));
  if (selected >= 0) { list.setSelection(selected); list.showSelection(); }

  const close = () => { if (!popup.isDisposed()) popup.dispose(); };
  // Once: on GTK Enter gives both the KeyDown and DefaultSelection.
  const pick = () => { if (popup.isDisposed()) return; const i = list.getSelectionIndex(); close(); if (i >= 0) choose(i); };
  list.addListener(SWT.MouseUp, e => { if (e.button === 1 && list.getSelectionIndex() >= 0) pick(); });
  list.addListener(SWT.DefaultSelection, pick);
  // Win32 sends DefaultSelection on a double click only; Enter is matched on e.character (SWT.CR is a Java char).
  list.addListener(SWT.KeyDown, e => { if (String(e.character) === "\r") pick(); });
  list.addListener(SWT.Traverse, e => { if (e.detail === SWT.TRAVERSE_ESCAPE) { e.doit = false; close(); } });
  popup.addListener(SWT.Deactivate, close);

  const area   = control.getShell().getMonitor().getClientArea();
  const width  = Math.max(cell.width, popup.computeSize(SWT.DEFAULT, SWT.DEFAULT).x);
  const height = popup.computeTrim(0, 0, width, list.getItemHeight() * Math.min(LIST_POPUP_ROWS, Math.max(1, labels.length))).height
    + list.computeTrim(0, 0, 0, 0).height;
  const below  = cell.y + cell.height;
  const y      = below + height <= area.y + area.height || cell.y - height < area.y ? below : cell.y - height;
  const x      = Math.max(area.x, Math.min(cell.x, area.x + area.width - width));
  popup.setBounds(x, y, width, height);
  popup.open();
  list.setFocus();
}

// Inside a group, the same on every tab (ARCHITECTURE § Dialog, Look and feel realisation).
const GROUP_MARGIN_H = 8;
const GROUP_MARGIN_V = 6;

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
  if (opts.bold !== false) grp.setFont(getBoldFont());
  grp.setBackground(getGroupBackground());
  grp.setBackgroundMode(SWT.INHERIT_DEFAULT);
  GridDataFactory.fillDefaults()
    .grab(opts.grabH !== false, opts.grabV || false)
    .applyTo(grp);
  GridLayoutFactory.fillDefaults()
    .numColumns(numColumns)
    .margins(opts.marginH || GROUP_MARGIN_H, opts.marginV || GROUP_MARGIN_V)
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
  // silent: a dialog update on a widget that may be disposed
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
 * Draw a checkbox of CHECK_SIZE at x, y: blue with a white tick when checked; grey when off.
 * @param {Swt.GC} gc
 * @param {Swt.Display} d
 * @param {number} x
 * @param {number} y
 * @param {boolean} checked
 * @param {boolean} on  enabled
 */
function drawCheck(gc, d, x, y, checked, on) {
  const sys = (/** @type {number} */ c) => d.getSystemColor(c);
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
}

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
    const gc = e.gc;
    const a = canvas.getClientArea();
    const x = Math.floor((a.width - CHECK_SIZE) / 2), y = Math.floor((a.height - CHECK_SIZE) / 2);
    drawCheck(gc, canvas.getDisplay(), x, y, checked, canvas.isEnabled());
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
    scrolledTab, resizeScrolled, getBoldFont, getGroupBackground, noteLabel, hasNestingConditions,
    colorPicker, paletteColorPicker, colorRangePicker, paletteColorChoice, colorRangeChoice, colorItemFor, openColorMenu, drawSwatch, SWATCH_H, SWATCH_W,
    rangeItems, treePicker, openListPopup, group, formRow, alignFormColumns, addCombo, enable, pushBtn, addCheck, checkBox, drawCheck, CHECK_SIZE, addSpinnerRow, SPINNER_WIDTH, GAP_FIELD, GAP_PAIR, GROUP_MARGIN_H,
  };
}
