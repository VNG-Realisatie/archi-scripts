/**
 * Text measuring in Archi (LayoutRuntime.measureText): SWT measures one line in the font Archi draws a
 * label with — FontFactory's view font, so Archi's own font scaling applies. Runs on the UI thread,
 * where jArchi runs scripts. The Node harness has its own estimate (tools/text_measure_node.js).
 */
console.log("Loading text_measure.js");

const SWT         = Java.type("org.eclipse.swt.SWT");
const Display     = Java.type("org.eclipse.swt.widgets.Display");
const GC          = Java.type("org.eclipse.swt.graphics.GC");
const FontData    = Java.type("org.eclipse.swt.graphics.FontData");
// Archi's own class, not the jArchi API (ARCHITECTURE § Platform constraints): the font a figure draws with.
const FontFactory = Java.type("com.archimatetool.editor.ui.FontFactory");

/**
 * A measurer for one run; it remembers what it measured.
 * @returns {TextMeasure}
 */
function createTextMeasure() {
  const display = Display.getCurrent();
  const pxPerPt = display.getDPI().y / 72;
  /** @type {number} */
  const defaultPt = FontFactory.getDefaultUserViewFontData().getHeight();
  /** @type {Map<string, { width: number, height: number, em: number }>} */
  const measured = new Map();
  return (text, font) => {
    const key = (font ? `${font.name}|${font.size}|${font.style}` : "") + "\n" + text;
    let size = measured.get(key);
    if (size) return size;
    const gc = new GC(display);
    try {
      gc.setFont(_viewFont(font));
      const p = gc.textExtent(text);
      size = { width: p.x, height: p.y, em: (font ? font.size : defaultPt) * pxPerPt };
    } finally {
      gc.dispose();
    }
    measured.set(key, size);
    return size;
  };
}

/**
 * The font Archi draws a label with; FontFactory owns it (never disposed here).
 * @param {TextFont | null} font  null = Archi's default view font
 * @returns {Swt.Font}
 */
function _viewFont(font) {
  if (!font) return FontFactory.getDefaultUserViewFont();
  const style = (font.style.includes("bold") ? SWT.BOLD : SWT.NORMAL) | (font.style.includes("italic") ? SWT.ITALIC : SWT.NORMAL);
  return FontFactory.getViewFont(new FontData(font.name, font.size, style).toString());
}

module.exports = { createTextMeasure };
