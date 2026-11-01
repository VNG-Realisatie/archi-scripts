/**
 * Text measuring in Archi (LayoutRuntime.measureText): SWT measures one line in the font Archi draws a
 * label with — FontFactory's view font, so Archi's own font scaling applies. Runs on the UI thread,
 * where jArchi runs scripts. Where a line may break comes from Java too, and how Archi creates a new
 * element visual from its preferences. The Node harness has its own estimate (tools/text_measure_node.js).
 */
console.log("Loading text_measure.js");

const SWT         = Java.type("org.eclipse.swt.SWT");
const Display     = Java.type("org.eclipse.swt.widgets.Display");
const GC          = Java.type("org.eclipse.swt.graphics.GC");
const FontData    = Java.type("org.eclipse.swt.graphics.FontData");
const BreakIterator         = Java.type("java.text.BreakIterator");
const BreakIteratorProvider = Java.type("java.text.spi.BreakIteratorProvider");
const ServiceLoader         = Java.type("java.util.ServiceLoader");
const Locale                = Java.type("java.util.Locale");
// Archi's own class, not the jArchi API (ARCHITECTURE § Platform constraints): the font a figure draws with.
const FontFactory = Java.type("com.archimatetool.editor.ui.FontFactory");
// Archi's own class too: its preference store holds how a new element visual is created.
const ArchiPlugin = Java.type("com.archimatetool.editor.ArchiPlugin");

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
 * Archi's default view font (Preferences › Appearance › Fonts), as jArchi reads a visual without a
 * font of its own.
 * @returns {TextFont}
 */
function defaultViewFont() {
  const fd = FontFactory.getDefaultUserViewFontData();
  const bold = (fd.getStyle() & SWT.BOLD) !== 0, italic = (fd.getStyle() & SWT.ITALIC) !== 0;
  return { name: fd.getName(), size: fd.getHeight(), style: bold ? (italic ? "bolditalic" : "bold") : italic ? "italic" : "normal" };
}

/**
 * How Archi creates a new element visual (ArchimateDiagramModelFactory.createDiagramModelArchimateObject,
 * which jArchi's add uses): text alignment, text position and figure type from Preferences ›
 * Appearance › ArchiMate Figures (IPreferenceConstants). Read once per run.
 * @returns {NewVisualDefaults}
 */
function newVisualDefaults() {
  const store = ArchiPlugin.getInstance().getPreferenceStore();
  /** @type {Map<string, number>} */
  const figureTypes = new Map();
  return {
    textAlignment: store.getInt("defaultArchiMateTextAlignment"),
    textPosition:  store.getInt("defaultArchiMateTextPosition"),
    figureTypeOf: type => {
      if (!figureTypes.has(type)) figureTypes.set(type, store.getInt("defaultFigure" + _eClassName(type)));
      return /** @type {number} */ (figureTypes.get(type));   // Cast: set on the line above
    },
  };
}

/**
 * The EMF class name of a jArchi element type ("business-actor" → "BusinessActor").
 * @param {string} type
 * @returns {string}
 */
function _eClassName(type) {
  return type.split("-").map(part => part.charAt(0).toUpperCase() + part.substring(1)).join("");
}

/**
 * Where Archi breaks label text: the line BreakIterator draw2d's text flow wraps with
 * (FlowUtilities.getLineInstance: the first BreakIteratorProvider registered, else Java's own).
 * @returns {LineBreaks}
 */
function createLineBreaks() {
  const providers = ServiceLoader.load(BreakIteratorProvider.class).iterator();
  const iterator = providers.hasNext() ? providers.next().getLineInstance(Locale.getDefault()) : BreakIterator.getLineInstance();
  return text => {
    iterator.setText(text);
    /** @type {number[]} */
    const offsets = [];
    for (let at = iterator.next(); at !== BreakIterator.DONE; at = iterator.next()) offsets.push(at);
    return offsets;
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

module.exports = { createTextMeasure, createLineBreaks, defaultViewFont, newVisualDefaults };
