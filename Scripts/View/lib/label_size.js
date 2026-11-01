/**
 * Label sizes for the layout graph: how Archi lays out a node's label (font, the width the text gets)
 * and the room it takes, from its text measured in that font. Pure: the measuring is passed in
 * (LayoutRuntime.measureText), so Node runs it as it is.
 *
 * Archi 5.10 (com.archimatetool.editor): the text keeps a margin of ARCHI_TEXT_MARGIN to the figure's
 * border (AbstractTextControlContainerFigure.getTextControlMarginWidth / Height). With the text at the
 * top, figure type 0 and the type icon shown, it also keeps clear of the icon in the top right corner
 * (calculateTextControlBounds): centred text by `iconOffset − margin` on both sides, right-aligned
 * text on the right only, left-aligned text not at all.
 */
console.log("Loading label_size.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");

const ARCHI_TEXT_MARGIN = 4;

// Archi's text alignment and position values (ITextAlignment, ITextPosition) and the icon state
// that hides the icon (IIconic.ICON_VISIBLE_NEVER).
const TEXT_ALIGNMENT_LEFT   = 1;
const TEXT_ALIGNMENT_CENTER = 2;
const TEXT_ALIGNMENT_RIGHT  = 4;
const TEXT_POSITION_TOP     = 0;
const ICON_VISIBLE_NEVER    = 2;

// getIconOffset of the figure Archi draws each element type with (figure type 0), by jArchi type
// (Archi 5.10: the element UI providers and their figures). Absent: no icon in the corner.
/** @type {Readonly<Record<string, number>>} */
const ICON_OFFSET = Object.freeze({
  "business-actor": 17, "business-role": 20, "business-collaboration": 20, "business-interface": 22,
  "business-process": 20, "business-function": 20, "business-interaction": 20, "business-event": 22,
  "business-service": 22, "business-object": 20, "contract": 20, "representation": 21, "product": 20,
  "application-component": 20, "application-collaboration": 20, "application-interface": 22,
  "application-function": 20, "application-interaction": 20, "application-process": 20,
  "application-event": 22, "application-service": 22, "data-object": 20,
  "node": 20, "device": 20, "system-software": 20, "technology-collaboration": 20, "technology-interface": 22,
  "path": 22, "communication-network": 22, "technology-function": 20, "technology-process": 20,
  "technology-interaction": 20, "technology-event": 22, "technology-service": 22, "artifact": 22,
  "equipment": 22, "facility": 20, "distribution-network": 22, "material": 22,
  "stakeholder": 23, "driver": 23, "assessment": 21, "goal": 22, "outcome": 27, "principle": 23,
  "requirement": 22, "constraint": 23, "meaning": 19, "value": 21,
  "resource": 22, "capability": 19, "value-stream": 25, "course-of-action": 25,
  "work-package": 19, "deliverable": 21, "implementation-event": 22, "plateau": 17, "gap": 23,
  "grouping": 20, "location": 16,
});

/**
 * @typedef {object} LabelInput  what the label sizes are read from besides the layout graph
 * @property {TextMeasure}   measure
 * @property {LineBreaks}    breaks       where Archi may break label text
 * @property {TextFont}      defaultFont  Archi's default view font (Style by nesting level writes its name)
 * @property {RelationIndex} relationsOf  the model relations of an element (Style by nesting level)
 * @property {boolean}       isModify     Layout only / Expand view: Style by nesting level resets a font it no longer sets
 *
 * @typedef {object} LabelSources  where a node's label layout comes from
 * @property {(nodeId: string) => ArchiElement | undefined} elementOf  the element of an occurrence; undefined for a diagram object
 * @property {(nodeId: string) => VisualObject | undefined} visualOf   the visual on the target view paired with the occurrence
 * @property {Preset["appearance"]["nestingLevel"]} nestingLevel
 * @property {LabelInput} input
 *
 * @typedef {object} LabelLayout  how Archi lays out one node's label
 * @property {TextFont | null} font     null = Archi's default view font
 * @property {number}          iconCut    what the type icon takes off the text width (px)
 * @property {number}          iconClear  room the icon needs right of text Archi does not keep clear of it (left-aligned; px)
 * @property {LineBreaks}      breaks   where the text may break
 */

/**
 * How each element node's label is laid out. Font: the one Style by nesting level sets or resets,
 * else the visual's, else Archi's default view font. Text width: the visual's figure type, text
 * alignment, text position and icon; a new visual as Archi creates it (a grouping left-aligned,
 * another element taken as centred, the narrower of Archi's choices; text at the top; icon shown).
 * @param {LayoutNode[]}           nodes
 * @param {Record<string, string>} parentMap
 * @param {LabelSources}           src
 * @returns {(nodeId: string) => LabelLayout}
 */
function labelLayouts(nodes, parentMap, src) {
  const containers = new Set(Object.values(parentMap));
  /** @type {(id: string) => number} */
  const depthOf = id => { let d = 0; for (let p = parentMap[id]; p; p = parentMap[p]) d++; return d; };
  /** @type {import("./appearance").NestingNode[]} */
  const nestingNodes = [];
  for (const n of nodes) {
    const el = src.elementOf(n.id);
    if (!el) continue;   // a diagram object: no nesting style
    const parentEl = n.parent ? src.elementOf(n.parent) : undefined;
    nestingNodes.push({
      id: n.id, parentId: n.parent, type: el.type,
      rels: parentEl ? _relsBetween(parentEl, el, src.input.relationsOf) : [],
      depth: depthOf(n.id), isContainer: containers.has(n.id),
    });
  }
  const styled = Appearance.nestingFonts(nestingNodes, src.nestingLevel, src.input.isModify, src.input.defaultFont);
  return id => {
    const vo = src.visualOf(id);
    const el = src.elementOf(id);
    const font = styled.get(id) || (vo ? { name: vo.fontName, size: vo.fontSize, style: vo.fontStyle } : null);
    return { font, ...(el ? _iconRoom(el.type, vo) : { iconCut: 0, iconClear: 0 }), breaks: src.input.breaks };
  };
}

/**
 * The room the type icon takes from an element's text: what Archi takes off the text width
 * (calculateTextControlBounds: centred text both sides, right-aligned the right), and for left-aligned
 * text, which Archi lets run under the icon, the room it needs on the right of the first line.
 * @param {string} type  jArchi element type
 * @param {VisualObject | undefined} vo  undefined = a new visual
 * @returns {{ iconCut: number, iconClear: number }}
 */
function _iconRoom(type, vo) {
  const offset = ICON_OFFSET[type];
  const figureType = vo ? vo.figureType : 0;
  const position   = vo ? vo.textPosition : TEXT_POSITION_TOP;
  const shown      = vo ? vo.showIcon !== ICON_VISIBLE_NEVER : true;
  if (!offset || figureType !== 0 || position !== TEXT_POSITION_TOP || !shown) return { iconCut: 0, iconClear: 0 };
  const alignment = vo ? vo.textAlignment : type === "grouping" ? TEXT_ALIGNMENT_LEFT : TEXT_ALIGNMENT_CENTER;
  const clear = offset - ARCHI_TEXT_MARGIN;
  if (alignment === TEXT_ALIGNMENT_LEFT) return { iconCut: 0, iconClear: clear };
  return { iconCut: alignment === TEXT_ALIGNMENT_CENTER ? 2 * clear : clear, iconClear: 0 };
}

/**
 * The model relations between a parent element and its child, as Style by nesting level reads them.
 * @param {ArchiElement}  parent
 * @param {ArchiElement}  child
 * @param {RelationIndex} relationsOf
 * @returns {{ type: string, outgoing: boolean }[]}  outgoing = the parent is the source
 */
function _relsBetween(parent, child, relationsOf) {
  /** @type {{ type: string, outgoing: boolean }[]} */
  const rels = [];
  for (const r of relationsOf(parent)) {
    const src = r.source && r.source.id, tgt = r.target && r.target.id;
    if (src === parent.id && tgt === child.id) rels.push({ type: r.type, outgoing: true });
    else if (tgt === parent.id && src === child.id) rels.push({ type: r.type, outgoing: false });
  }
  return rels;
}

/**
 * The narrowest each container can be: its widest child and padding on both sides, at least its
 * minWidth, as `fit` widens it for its label.
 * @param {LayoutNode[]} nodes  leaves at their final size
 * @param {number}       padding
 * @param {(nodeId: string, width: number) => number} fit  the width a container needs drawn at a width (LayoutGraph._widthAt)
 * @returns {Map<string, number>}  container id → width (px)
 */
function narrowestContainers(nodes, padding, fit) {
  /** @type {Map<string, LayoutNode[]>} */
  const childrenOf = new Map();
  for (const n of nodes) if (n.parent) {
    const kids = childrenOf.get(n.parent);
    if (kids) kids.push(n); else childrenOf.set(n.parent, [n]);
  }
  /** @type {Map<string, number>} */
  const widths = new Map();
  /** @type {(n: LayoutNode) => number} */
  const narrowest = n => {
    const kids = childrenOf.get(n.id);
    if (!kids) return n.width;
    let w = widths.get(n.id);
    if (w === undefined) { w = fit(n.id, Math.max(n.minWidth, Math.max(...kids.map(narrowest)) + 2 * padding)); widths.set(n.id, w); }
    return w;
  };
  for (const n of nodes) if (childrenOf.has(n.id)) narrowest(n);
  return widths;
}

/**
 * Height of a label at the top of a figure of this width: Archi's text margin and its wrapped lines;
 * 0 without text.
 * @param {string}      text
 * @param {number}      width   the figure's width (px)
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}
 */
function labelHeight(text, width, layout, measure) {
  const lines = lineCount(text, width - 2 * ARCHI_TEXT_MARGIN - layout.iconCut, layout, measure);
  if (lines === 0) return 0;
  const lineHeight = measure(text.split(/\r?\n/)[0], layout.font).height;   // one line: a line break would count twice
  return ARCHI_TEXT_MARGIN + Math.ceil(lines * lineHeight);
}

/**
 * Room a container's label takes above its contents (LayoutNode.labelHeight): the label at the top and
 * the gap below it, half the padding at Archi's default view font size and as much more as the font
 * is larger, so a large title keeps its proportion; 0 without text.
 * @param {string}      text
 * @param {number}      width    the container's width (px)
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @param {number}      padding  container padding (px)
 * @returns {number}
 */
function containerLabelRoom(text, width, layout, measure, padding) {
  const h = labelHeight(text, width, layout, measure);
  if (h === 0) return 0;
  const scale = measure(text, layout.font).em / measure(text, null).em;
  return h + Math.ceil(padding / 2 * scale);
}

/**
 * Height an element needs for its label: the label and Archi's text margin below it.
 * @param {string}      text
 * @param {number}      width
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}  0 without text
 */
function leafHeightForLabel(text, width, layout, measure) {
  const h = labelHeight(text, width, layout, measure);
  return h === 0 ? 0 : h + ARCHI_TEXT_MARGIN;
}

/**
 * An element's size from its label (Use label width): the fewest lines that fit in maxLineWidth, at
 * the narrowest width that keeps that many lines, so the lines come out even; a piece between two of
 * Archi's break points is never broken, so a wider one widens the element past maxLineWidth. Around the
 * text Archi's text margin, the type icon and the padding; the first line ends before the icon.
 * @param {string}      text
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @param {LabelSizing} sizing
 * @returns {{ width: number, height: number } | null}  null without text
 */
function labelSizedLeaf(text, layout, measure, sizing) {
  if (!text.trim()) return null;
  const around = 2 * (ARCHI_TEXT_MARGIN + sizing.labelHPadding) + layout.iconCut + layout.iconClear;
  const narrowest = _widestPiece(text, layout, measure);   // Archi breaks a piece only when it must
  const widest = Math.max(narrowest, sizing.labelMaxLineWidth - around);
  const lines = lineCount(text, widest, layout, measure);
  let lo = narrowest, hi = widest;   // the narrowest text width with `lines` lines; less width never gives fewer lines
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (lineCount(text, mid, layout, measure) <= lines) hi = mid; else lo = mid + 1;
  }
  const width = clearOfIcon(text, Math.max(sizing.labelMinWidth, hi + around), layout, measure, sizing.labelHPadding);
  const height = leafHeightForLabel(text, width - 2 * sizing.labelHPadding, layout, measure) + 2 * sizing.labelVPadding;
  return { width, height: Math.max(sizing.labelMinHeight, height) };
}

/**
 * The narrowest a figure of at least this width can be with the first line of its label, as Archi
 * wraps it, ending `gap` before the type icon; the width itself when the label keeps clear of the icon
 * (layout.iconClear 0: Archi already does).
 * @param {string}      text
 * @param {number}      width
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @param {number}      gap
 * @returns {number}
 */
function clearOfIcon(text, width, layout, measure, gap) {
  if (!layout.iconClear || !text.trim()) return width;
  let w = width;
  const textWidth = () => w - 2 * ARCHI_TEXT_MARGIN - layout.iconCut;
  while (_firstLineWidth(text, textWidth(), layout, measure) > textWidth() - layout.iconClear - gap) w++;
  return w;
}

/**
 * The narrowest a figure can be without Archi breaking its label inside a piece (between two break
 * points) or running it under the type icon: the widest piece, Archi's text margin on both sides and
 * the icon; 0 without text.
 * @param {string}      text
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}
 */
function narrowestForLabel(text, layout, measure) {
  if (!text.trim()) return 0;
  return _widestPiece(text, layout, measure) + 2 * ARCHI_TEXT_MARGIN + layout.iconCut + layout.iconClear;
}

/**
 * Size of a connection's label text (LayoutEdge.labelWidth / labelHeight): its widest line, and its
 * lines × the font size, the height of the visible text. Archi does not wrap a connection label.
 * @param {string}          text
 * @param {TextFont | null} font
 * @param {TextMeasure}     measure
 * @returns {{ width: number, height: number }}  0 × 0 without text
 */
function connectionLabelSize(text, font, measure) {
  if (!text.trim()) return { width: 0, height: 0 };
  const lines = text.split(/\r?\n/).map(line => measure(line, font));
  return { width: Math.max(...lines.map(l => l.width)), height: Math.ceil(lines.length * lines[0].em) };
}

/**
 * Lines a text takes wrapped at a width, as draw2d's text flow wraps it: at the break points Archi's
 * line BreakIterator gives (layout.breaks), a piece wider than the width over as many lines as it
 * then needs, and a line break in the text starts a line; spaces at a line's end take no width.
 * @param {string}      text
 * @param {number}      width
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}  0 without text
 */
function lineCount(text, width, layout, measure) {
  if (!text.trim()) return 0;
  const w = Math.max(1, width);
  /** @type {(t: string) => number} */
  const widthOf = t => measure(t.trimEnd(), layout.font).width;
  let lines = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    if (!paragraph.trim()) { lines++; continue; }   // an empty line
    let line = "";   // the open line; "" = none
    for (const piece of _pieces(paragraph, layout.breaks)) {
      if (line && widthOf(line + piece) <= w) { line += piece; continue; }
      if (line) lines++;   // the piece does not fit: close the open line
      const pieceWidth = widthOf(piece);
      if (pieceWidth <= w) { line = piece; continue; }
      lines += Math.ceil(pieceWidth / w);   // a piece wider than the line fills lines of its own
      line = "";
    }
    if (line) lines++;
  }
  return lines;
}

/**
 * Width of a text's first line wrapped at a width (as lineCount wraps); a piece wider than the width
 * fills it.
 * @param {string}      text
 * @param {number}      width
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}
 */
function _firstLineWidth(text, width, layout, measure) {
  /** @type {(t: string) => number} */
  const widthOf = t => measure(t.trimEnd(), layout.font).width;
  let line = "";
  for (const piece of _pieces(text.split(/\r?\n/)[0], layout.breaks)) {
    if (line && widthOf(line + piece) > width) break;
    line += piece;
  }
  return Math.min(width, widthOf(line));
}

/**
 * A line of text cut at its break points, spaces kept with the piece before them.
 * @param {string}     paragraph
 * @param {LineBreaks} breaks
 * @returns {string[]}
 */
function _pieces(paragraph, breaks) {
  /** @type {string[]} */
  const pieces = [];
  let start = 0;
  for (const end of breaks(paragraph)) { pieces.push(paragraph.slice(start, end)); start = end; }
  return pieces.filter(p => p.trim());
}

/**
 * The widest piece of a text between two break points (_pieces), measured.
 * @param {string}      text
 * @param {LabelLayout} layout
 * @param {TextMeasure} measure
 * @returns {number}
 */
function _widestPiece(text, layout, measure) {
  let widest = 0;
  for (const paragraph of text.split(/\r?\n/)) {
    for (const piece of _pieces(paragraph, layout.breaks)) widest = Math.max(widest, measure(piece.trimEnd(), layout.font).width);
  }
  return widest;
}

module.exports = { labelLayouts, narrowestContainers, labelHeight, containerLabelRoom, leafHeightForLabel, labelSizedLeaf, clearOfIcon, narrowestForLabel, connectionLabelSize, lineCount };
