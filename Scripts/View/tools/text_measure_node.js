/**
 * Text measuring in Node (LayoutRuntime.measureText) for the harness and the Node tests: an estimate
 * from the point size, set to what Archi measures with SWT on the development machine
 * (lib/text_measure.js). Archi's default view font is a user preference; the harness takes the one a
 * fresh Archi has.
 */

/** The default view font of a fresh Archi (Preferences › Appearance › Fonts). */
const HARNESS_DEFAULT_FONT = Object.freeze({ name: "Segoe UI", size: 9, style: "normal" });

// Archi 5.10 on GTK measured (2026-10-31): 9 pt = 15 px (120 dpi), a line 21 px, "Archi" 34 px wide.
const PX_PER_PT      = 120 / 72;
const CHAR_WIDTH_EM  = 0.45;   // average character width
const BOLD_WIDTH     = 1.08;   // bold is this much wider
const LINE_HEIGHT_EM = 1.4;    // one line

/**
 * @param {string} text
 * @param {{ name: string, size: number, style: string } | null} font  null = HARNESS_DEFAULT_FONT
 * @returns {{ width: number, height: number, em: number }}
 */
function measureText(text, font) {
  const f = font || HARNESS_DEFAULT_FONT;
  const em = f.size * PX_PER_PT;
  const bold = f.style.includes("bold") ? BOLD_WIDTH : 1;
  return { width: Math.ceil(text.length * em * CHAR_WIDTH_EM * bold), height: Math.ceil(em * LINE_HEIGHT_EM), em };
}

module.exports = { measureText, HARNESS_DEFAULT_FONT };
