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

// Java's line BreakIterator (JDK 21, as Archi 5.10 runs; checked 2026-11-01): a break after spaces, and
// after - – — , . ; : ? ! ) unless another of them follows ("--") or a digit-dot/comma-digit ("2.0",
// "1,5"); before ( after anything but a space; none after / \ _ & + ' nor at a no-break space.
const PUNCT_AFTER  = /[\-\u2013\u2014,.;:?!)]/;
const DIGIT_JOINED = /[.,]/;

/**
 * Where a line of label text may break, as Java's line BreakIterator says (an estimate of its rules).
 * @param {string} text
 * @returns {number[]}  offsets after which a new line can start, ascending, text.length last
 */
function lineBreaks(text) {
  /** @type {number[]} */
  const offsets = [];
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1], c = text[i];
    if (c === " " || c === "\t") continue;   // spaces stay with the piece before them
    const digits = DIGIT_JOINED.test(prev) && /\d/.test(c) && i >= 2 && /\d/.test(text[i - 2]);
    const after = prev === " " || prev === "\t" || (PUNCT_AFTER.test(prev) && !PUNCT_AFTER.test(c) && !digits);
    const before = c === "(" && prev !== "(";
    if (after || before) offsets.push(i);
  }
  offsets.push(text.length);
  return offsets;
}

module.exports = { measureText, lineBreaks, HARNESS_DEFAULT_FONT };
