/**
 * Appearance pass — post-write visual styling for generated views.
 *
 * Called from generate_view.js after _writeView. Applies fill colors, fonts,
 * and line widths to VisualElements/VisualConnections based on preset.appearance.
 *
 * Pass order (later overrides earlier for the same VO):
 *   template look → Color and font by nesting level → Style by property (in list order) → Highlight repeated
 *
 * Reset on Modify (layout_only, expand_view): a nesting-level condition giving Type default / Default, or a disabled
 * highlight feature, resets the elements it would have styled to their template look, else Archi defaults (fillColor = null,
 * font = Archi's default view font); with style conditions, every element fill and relation line color / width
 * not styled earlier in the pass is reset before the conditions color (SPEC §10, Style by property).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading appearance.js");

const Chroma = require("chroma-js");
/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./palettes")} */
const Palettes  = require(REPO_ROOT + "View/lib/palettes");
const { compareNames } = Defs;
const { SAME_TYPE, TEMPLATE, FONT_DEFAULT } = ConditionLists;

// The template look: what an element of the view template takes from its visual there. Not a note's
// text and border, nor a label expression.
const LOOK_ATTRIBUTES = Defs.VISUAL_ATTRIBUTES.filter(a => !["text", "labelExpression", "borderType"].includes(a));

/**
 * @typedef {object} LookValues  the values of a template look a nesting style condition can take (Template)
 * @property {string | null} fillColor  null = Type default
 * @property {string}        fontName
 * @property {number}        fontSize
 * @property {string}        fontStyle
 *
 * @typedef {object} NestingNode  an element visual, for followNestingChains
 * @property {string}        id
 * @property {string | null} parentId     parent element visual; null = a root
 * @property {string}        type         element type
 * @property {PropertySource | null} [element]  the element: a property match reads it
 * @property {NestingRel[]}  rels         model relations between parent and element; outgoing = the parent is the source
 * @property {number}        depth
 * @property {boolean}       isContainer
 * @property {boolean}       [onTemplate]  an element of the view template: styled as a container, also with nothing in it
 * @property {LookValues}    [look]          its template look; absent: not on the view template, or no view template
 *
 * @typedef {object} NestingStyle  how followNestingChains styles a visual
 * @property {number}  depthSinceChange  levels since the last nesting type or color change: lightening
 * @property {string}  color         the fill color of the condition that selected it: a palette color or hex; "" = Type default;
 *                                   SAME_TYPE = the parent's fill color, one level lighter (a child only); TEMPLATE = its template look
 * @property {number}  darkenStart   of that condition
 * @property {number}  lightenPerLevel  of that condition (%)
 * @property {number}  fontSize      pt; DEFAULT_FONT_SIZE = unchanged
 * @property {string}  fontStyle     normal, bold, italic or bolditalic
 * @property {number}  nr            the number of the condition that selected it
 * @property {boolean} asContainer   a container, or a leaf beside one: it takes the font
 *
 * @typedef {{ color: Map<number, Set<string>>, font: Map<number, Set<string>> }} WithoutLook  per condition number, the
 *   visuals it styles with a Template value that have no template look (they get the fallback)
 *
 * @typedef {{ kind: "element" | "relation", values: Set<string> }} ConditionTarget
 */

// The font size a nesting condition without one keeps, the smallest Smaller per level gives, and the fallback of Template.
const DEFAULT_FONT_SIZE  = 9;
const DEFAULT_FONT_STYLE = "normal";

// ── Public API ────────────────────────────────────────────────────────────────

// actionId: "new_view" | "one_each" | "expand_view" | "layout_only"
// Resets apply only when actionId is "layout_only" or "expand_view".
/**
 * @param {ArchimateView} view
 * @param {MaskedPreset}  preset  params masked to the algorithm (defs.effectiveParams)
 * @param {string}        actionId
 * @param {TextFont}      defaultFont  Archi's default view font: the name of a nesting font, and a reset
 * @param {Map<string, string>} [diagramBlockOf]  visuals inside a diagram-block: they keep their appearance
 * @param {{ elements: Set<string>, looks: Map<string, TemplateLook[]> }} [viewTemplate]  elements of the view template
 *   view, styled as containers; looks: element id → its visuals there (templateLook), empty when the view template is off
 */
function applyAppearance(view, preset, actionId, defaultFont, diagramBlockOf, viewTemplate = { elements: new Set(), looks: new Map() }) {
  const keep = diagramBlockOf || new Map();
  const app  = preset.appearance;
  const isModify = actionId === "layout_only" || actionId === "expand_view";
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;
  const sbp  = app.styleByProperty;

  const anyEnabled =
    nl.conditions.some(r => r.on !== false) || hr.enabled ||
    sbp.conditions.some(r => r.on !== false && r.property) || viewTemplate.looks.size > 0;

  if (!anyEnabled && !isModify) return;

  Log.debug(`\nAppearance (${actionId || "?"})`);
  const palette = Palettes.paletteOf(Palettes.readPalettes(), app.palette, message => Log.warn(`Appearance: ${message}`));
  // params is the algorithm's effective subset: nestingConditions is absent when the algorithm does not nest.
  const hasNestingTypes = (preset.params.nestingConditions || []).length > 0;
  if (nl.conditions.some(r => r.on !== false) && hasNestingTypes)
    Log.debug(`  nestingLevel  palette=${palette.name}  conditions=${nl.conditions.filter(r => r.on !== false).length}`);
  if (hr.enabled)
    Log.debug(`  highlightRepeated  range=${hr.colorRange}`);
  sbp.conditions.forEach((r, i) => {
    if (r.on === false || !r.property) return;
    Log.debug(`  styleByProperty condition ${i + 1}  applyTo=${r.applyTo}  ${r.source || "all"} ${r.relation || "all"} ${r.target || "all"}  prop=${r.propertyOf}."${r.property}"  range=${r.colorRange}`);
  });

  // VOs colored by an active feature are protected from being cleared by later disabled-feature
  // resets (which would otherwise overwrite earlier colors). Built incrementally: each active
  // feature adds its styled VO ids so subsequent resets can skip them.
  /** @type {Set<string>} */
  const styledVoIds = new Set();

  _applyTemplateLooks(view, viewTemplate.looks, styledVoIds, keep);
  _applyNestingLevel(view, nl, palette, isModify, defaultFont, styledVoIds, keep, viewTemplate);
  _applyStyleConditions(view, sbp, palette, isModify, styledVoIds, keep);
  _applyHighlightRepeated(view, hr, palette, isModify, styledVoIds, keep);
}

/**
 * The run-wide warning for Template values without a view template to take them from: none chosen
 * (or the algorithm has none), or it is off. Null when there is a view template, or no enabled
 * condition uses Template.
 * @param {MaskedPreset} preset
 * @returns {string | null}
 */
function templateWithoutView(preset) {
  const ref = preset.params.viewTemplate;
  const chosen = !!ref && (!!ref.id || !!ref.path);
  if (chosen && ref.on) return null;
  const nl = preset.appearance.nestingLevel;
  const nrs = nl.conditions.map((r, i) => ({ r, nr: i + 1 })).filter(({ r }) => r.on !== false &&
    (r.color === TEMPLATE || r.fontSize === TEMPLATE || r.fontStyle === TEMPLATE)).map(x => x.nr);
  if (nrs.length === 0) return null;
  return `${chosen ? "View template off" : "No view template"}: condition${nrs.length > 1 ? "s" : ""} ${nrs.join(", ")} of Color and font by nesting level use${nrs.length > 1 ? "" : "s"} the default for Template (Type default, ${DEFAULT_FONT_SIZE} pt, normal).`;
}

/**
 * The element or relation visuals on a view, without those inside a diagram-block (SPEC: Diagram-blocks).
 * @template {"element" | "relation"} S
 * @param {ArchimateView}       view
 * @param {S}                   selector
 * @param {Map<string, string>} keep
 * @returns {(S extends "element" ? VisualObject : VisualConnection)[]}
 */
function _onView(view, selector, keep) {
  /** @type {any[]} */
  const out = [];
  $(view).find(selector).each(o => { if (!keep.has(String(o.id))) out.push(o); });
  return out;
}

// ── Template look ───────────────────────────────────────────────────────────

/**
 * The visual on the view template whose look an occurrence takes: the one in the element
 * its occurrence lies in, else the first.
 * @param {Map<string, TemplateLook[]>} looks  element id → its visuals on the view template, in view order
 * @param {string}        elementId
 * @param {string | null} parentId  the element the occurrence lies in; null at the view root
 * @returns {VisualObject | undefined}  undefined: not an element of the view template
 */
function templateLook(looks, elementId, parentId) {
  const list = looks.get(elementId);
  if (!list) return undefined;
  return (list.find(l => l.parentId === parentId) || list[0]).visual;
}

/**
 * The values of a template look a nesting style condition can take.
 * @param {VisualObject} look
 * @returns {LookValues}
 */
function lookValues(look) {
  return { fillColor: look.fillColor ? String(look.fillColor).toLowerCase() : null, fontName: look.fontName, fontSize: look.fontSize, fontStyle: look.fontStyle };
}

/**
 * The element of the element visual a visual lies in; null at the view root.
 * @param {VisualObject} vo
 * @returns {string | null}
 */
function _parentElementId(vo) {
  const p = /** @type {VisualObject | null} */ ($(vo).parent().filter("element").first());   // Cast: on a view, "element" selects element visuals
  return p && p.concept ? String(p.concept.id) : null;
}

/**
 * The base layer: each occurrence of an element of the view template takes its template look
 * (templateLook: LOOK_ATTRIBUTES, and a custom image); the nesting style conditions, Style by
 * property and Highlight repeated come over it.
 * @param {ArchimateView}              view
 * @param {Map<string, TemplateLook[]>} looks  element id → its visuals on the view template
 * @param {Set<string>}                styledVoIds
 * @param {Map<string, string>}        keep  visuals inside a diagram-block: left out
 */
function _applyTemplateLooks(view, looks, styledVoIds, keep) {
  if (looks.size === 0) return;
  let n = 0;
  for (const vo of _onView(view, "element", keep)) {
    const look = vo.concept ? templateLook(looks, String(vo.concept.id), _parentElementId(vo)) : undefined;
    if (!look) continue;
    // Casts: the attributes are read and set by name.
    const from = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (look));
    const to   = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (vo));
    for (const a of LOOK_ATTRIBUTES) if (from[a] !== undefined && from[a] !== to[a]) to[a] = from[a];
    const image = $(look).attr("image");
    if (image) $(vo).attr("image", image);
    styledVoIds.add(vo.id);
    n++;
  }
  Log.debug(`  templateLook: ${n} VOs take their look from the view template`);
}

// ── Color and font by nesting level ───────────────────────────────────────────

/**
 * Follow the nesting style conditions from every root container (pure). A condition selects the
 * nesting steps it matches; the child of a selected step takes the condition's fill color and font,
 * provided its parent is styled. A condition also styles a root container of its child type; relation,
 * direction and a property match on the parent or a relation do not count for it. An element no condition
 * selects stops the chain for itself and everything inside it. Of conditions that select the same element
 * the most specific wins (_specificity); of equally specific ones the last. A child with the fill color
 * and type of its parent is one level further from the last nesting type or color change; otherwise it is
 * at one (depth 0). Template: each element its own value from its template look (the fallback without
 * one: Type default, DEFAULT_FONT_SIZE, normal); a root container whose condition says Same as parent keeps
 * its template look too.
 * Font: at a start element (a root, or a child selected by another condition than its parent) the element
 * takes the condition's font size and font style; where the condition has no font size, and deeper within
 * the condition, the size is its parent's less the condition's Smaller per level, never below DEFAULT_FONT_SIZE,
 * and deeper levels are normal. A leaf beside a container (same parent, or both roots), and an element of
 * the view template, is styled as a container.
 * @param {NestingNode[]}           nodes       every element visual; order = view order (determinism)
 * @param {NestingStyleCondition[]} conditions
 * @returns {{ styles: Map<string, NestingStyle>, conflicts: string[], parentlessRoots: string[], withoutLook: WithoutLook }}
 *   conflicts: equally specific conditions ("2, 3") that select the same elements with different styles; parentlessRoots:
 *   root containers whose condition says Same as parent, which keep their template look, else Type default
 */
function followNestingChains(nodes, conditions) {
  const active = conditions.map((r, i) => ({ r, nr: i + 1 })).filter(x => x.r.on !== false);
  const byId   = new Map(nodes.map(n => [n.id, n]));
  /** @type {Map<string, NestingStyle>} */
  const styles = new Map();
  /** @type {Set<string>} */
  const conflicts = new Set();
  /** @type {string[]} */
  const parentlessRoots = [];
  /** @type {WithoutLook} */
  const withoutLook = { color: new Map(), font: new Map() };
  const withContainer = new Set(nodes.filter(n => n.isContainer).map(n => n.parentId));
  // Stable sort: parents before children, view order within a depth.
  for (const n of nodes.slice().sort((a, b) => a.depth - b.depth)) {
    const asContainer = n.isContainer || !!n.onTemplate || withContainer.has(n.parentId);
    if (!n.parentId) {
      if (!asContainer) continue;
      const sel = active.filter(x => ConditionLists.nestingStyleConditionMatchesRoot(x.r, n));
      if (sel.length === 0) continue;
      const win = _mostSpecific(sel, conflicts, _rootSpecificity);
      if (win.r.color === SAME_TYPE) parentlessRoots.push(n.id);
      const color = win.r.color === SAME_TYPE ? TEMPLATE : win.r.color;
      const font  = _startFont(win, n, DEFAULT_FONT_SIZE, withoutLook);   // no parent style: a root
      styles.set(n.id, Object.assign({ depthSinceChange: 0, color, nr: win.nr, asContainer }, _numbers(win.r), font));
      if (win.r.color === TEMPLATE) _countWithoutLook(withoutLook.color, win.nr, n);
      continue;
    }
    const ps = styles.get(n.parentId);
    const parent = byId.get(n.parentId);
    if (!ps || !parent) continue;
    const sel = active.filter(x => ConditionLists.nestingStyleConditionMatches(x.r, parent, n));
    if (sel.length === 0) continue;
    const win = _mostSpecific(sel, conflicts);
    const color = win.r.color;
    const sameColor = color === ps.color && color !== TEMPLATE;
    const depthSinceChange = n.type === parent.type && sameColor ? ps.depthSinceChange + 1 : 0;
    const smaller = Math.max(DEFAULT_FONT_SIZE, ps.fontSize - win.r.fontDecreasePerLevel);
    const font = win.nr === ps.nr ? _deeperFont(win, n, smaller, withoutLook, ps.fontStyle) : _startFont(win, n, smaller, withoutLook, ps.fontStyle);
    styles.set(n.id, Object.assign({ depthSinceChange, color, nr: win.nr, asContainer }, _numbers(win.r), font));
    if (color === TEMPLATE) _countWithoutLook(withoutLook.color, win.nr, n);
  }
  return { styles, conflicts: [...conflicts], parentlessRoots, withoutLook };
}

/**
 * The shading numbers of a condition.
 * @param {NestingStyleCondition} r
 */
function _numbers(r) {
  return { darkenStart: r.darkenStart, lightenPerLevel: r.lightenPerLevel };
}

/**
 * The font at a start element: the condition's font size, or `inherited` when it has none, and its font style.
 * @param {{ r: NestingStyleCondition, nr: number }} win
 * @param {NestingNode} n
 * @param {number}      inherited
 * @param {WithoutLook} withoutLook
 * @param {string} [parentStyle]  the parent's font style; undefined: a root container
 */
function _startFont(win, n, inherited, withoutLook, parentStyle) {
  const size  = win.r.fontSize === TEMPLATE ? _lookFontSize(win.nr, n, withoutLook)
    : win.r.fontSize === FONT_DEFAULT ? DEFAULT_FONT_SIZE : (win.r.fontSize || inherited);
  const style = _style(win, n, withoutLook, parentStyle);
  return { fontSize: size, fontStyle: style };
}

/**
 * The font deeper within a condition: `smaller` and normal, or the element's own value where the condition says Template.
 * @param {{ r: NestingStyleCondition, nr: number }} win
 * @param {NestingNode} n
 * @param {number}      smaller
 * @param {WithoutLook} withoutLook
 * @param {string} [parentStyle]  the parent's font style
 */
function _deeperFont(win, n, smaller, withoutLook, parentStyle) {
  const size  = win.r.fontSize === TEMPLATE ? _lookFontSize(win.nr, n, withoutLook) : smaller;
  const style = win.r.fontStyle === TEMPLATE || win.r.fontStyle === SAME_TYPE ? _style(win, n, withoutLook, parentStyle) : DEFAULT_FONT_STYLE;
  return { fontSize: size, fontStyle: style };
}

/**
 * The font style of a start element: the condition's, its template look's (Template), or its parent's
 * (Same as parent; a root container has no parent: its template look's, else normal).
 * @param {{ r: NestingStyleCondition, nr: number }} win
 * @param {NestingNode} n
 * @param {WithoutLook} withoutLook
 * @param {string} [parentStyle]  undefined: a root container
 * @returns {string}
 */
function _style(win, n, withoutLook, parentStyle) {
  const s = win.r.fontStyle;
  if (s === FONT_DEFAULT) return DEFAULT_FONT_STYLE;
  if (s === SAME_TYPE) return parentStyle !== undefined ? parentStyle : n.look ? n.look.fontStyle : DEFAULT_FONT_STYLE;
  return s === TEMPLATE ? _lookFontStyle(win.nr, n, withoutLook) : s;
}

/** @type {(nr: number, n: NestingNode, withoutLook: WithoutLook) => number} */
const _lookFontSize  = (nr, n, withoutLook) => { _countWithoutLook(withoutLook.font, nr, n); return n.look ? n.look.fontSize : DEFAULT_FONT_SIZE; };
/** @type {(nr: number, n: NestingNode, withoutLook: WithoutLook) => string} */
const _lookFontStyle = (nr, n, withoutLook) => { _countWithoutLook(withoutLook.font, nr, n); return n.look ? n.look.fontStyle : DEFAULT_FONT_STYLE; };

/**
 * Note a visual a condition styles with Template when it has no template look.
 * @param {Map<number, Set<string>>} found
 * @param {number}      nr
 * @param {NestingNode} n
 */
function _countWithoutLook(found, nr, n) {
  if (n.look) return;
  const ids = found.get(nr);
  if (ids) ids.add(n.id); else found.set(nr, new Set([n.id]));
}

/**
 * The font Color and font by nesting level gives a visual with this style (followNestingChains):
 * containers, and leaves beside one, with a larger or styled font, in the font name of its template
 * look, else Archi's default view font (its name at this run, so a changed default carries over). A
 * Modify action resets a visual a condition reaches but gives no font (Default) to the template look,
 * which the base layer wrote (undefined), else to Archi's default view font. Otherwise the visual keeps
 * its font (undefined).
 * @param {NestingStyle | undefined} st  undefined: no condition reaches the visual
 * @param {boolean} isModify
 * @param {TextFont} defaultFont  Archi's default view font
 * @param {LookValues} [look]  the visual's template look
 * @returns {TextFont | undefined}
 */
function nestingFont(st, isModify, defaultFont, look) {
  const styled = !!st && st.asContainer && (st.fontSize > DEFAULT_FONT_SIZE || st.fontStyle !== DEFAULT_FONT_STYLE);
  if (styled) return { name: look ? look.fontName : defaultFont.name, size: st.fontSize, style: st.fontStyle };
  if (isModify && st) return look ? undefined : defaultFont;
  return undefined;
}

/**
 * The fonts Color and font by nesting level will give the element visuals (pure): for the layout, which
 * reserves room for the labels before the appearance pass writes them.
 * @param {NestingNode[]} nodes  every element visual (followNestingChains)
 * @param {Preset["appearance"]["nestingLevel"]} settings
 * @param {boolean} isModify
 * @param {TextFont} defaultFont  Archi's default view font
 * @returns {Map<string, TextFont>}  visual id → font; a visual that keeps its font (or its template look's) is absent
 */
function nestingFonts(nodes, settings, isModify, defaultFont) {
  /** @type {Map<string, TextFont>} */
  const fonts = new Map();
  const { styles } = followNestingChains(nodes, settings.conditions);
  for (const n of nodes) {
    const font = nestingFont(styles.get(n.id), isModify, defaultFont, n.look);
    if (font) fonts.set(n.id, font);
  }
  return fonts;
}

/**
 * The condition that wins among those selecting one element: the most specific, of equally specific
 * ones the last. Equally specific winners with different styles are added to conflicts.
 * @param {{ r: NestingStyleCondition, nr: number }[]} sel  non-empty, in list order
 * @param {Set<string>} conflicts
 * @param {(r: NestingStyleCondition) => number} [specificity]
 */
function _mostSpecific(sel, conflicts, specificity = _specificity) {
  const top = Math.max(...sel.map(x => specificity(x.r)));
  return _lastOf(sel.filter(x => specificity(x.r) === top), conflicts);
}

/**
 * The last of equally specific conditions; different styles among them are added to conflicts.
 * @param {{ r: NestingStyleCondition, nr: number }[]} best  non-empty, in list order
 * @param {Set<string>} conflicts
 */
function _lastOf(best, conflicts) {
  const style = (/** @type {NestingStyleCondition} */ r) =>
    [r.color, r.darkenStart, r.lightenPerLevel, r.fontSize, r.fontStyle, r.fontDecreasePerLevel].join("/");
  if (new Set(best.map(x => style(x.r))).size > 1) conflicts.add(best.map(x => x.nr).join(", "));
  return best[best.length - 1];
}

/**
 * How narrowly a condition selects: one point per named parent type, relation type, direction
 * (outgoing / incoming) and property match; child: a type 2, Same as parent 1, All 0.
 * @param {NestingStyleCondition} r
 */
function _specificity(r) {
  return _rootSpecificity(r) + (r.relation ? 1 : 0) + (r.direction !== "either" ? 1 : 0);
}

/**
 * How narrowly a condition selects a root container: a root has no relation to its parent.
 * @param {NestingStyleCondition} r
 */
function _rootSpecificity(r) {
  const child = r.child === SAME_TYPE ? 1 : r.child ? 2 : 0;
  return (r.parent ? 1 : 0) + child + (r.property ? 1 : 0);
}

/**
 * A visual as followNestingChains sees it: its parent element visual, the model relations between
 * the two elements, and its template look.
 * @param {VisualObject} vo
 * @param {Map<string, string>} keep  visuals inside a diagram-block: not a parent
 * @param {{ elements: Set<string>, looks: Map<string, TemplateLook[]> }} viewTemplate  elements of the view template, and their looks
 * @returns {NestingNode}
 */
function _nestingNode(vo, keep, viewTemplate) {
  const parentVo = $(vo).parent().filter("element").first();
  const parentId = parentVo && !keep.has(String(parentVo.id)) ? String(parentVo.id) : null;
  const look = vo.concept ? templateLook(viewTemplate.looks, String(vo.concept.id), _parentElementId(vo)) : undefined;
  /** @type {NestingRel[]} */
  const rels = [];
  if (parentVo && parentVo.concept && vo.concept) {
    const childId = vo.concept.id;
    $(parentVo.concept).outRels().each(r => { if (r.target.id === childId) rels.push({ type: r.type, outgoing: true, relation: r }); });
    $(parentVo.concept).inRels().each(r => { if (r.source.id === childId) rels.push({ type: r.type, outgoing: false, relation: r }); });
  }
  return {
    id: String(vo.id), parentId, type: (vo.concept && vo.concept.type) || "", element: vo.concept || null, rels,
    depth: _voDepth(vo), isContainer: $(vo).children("element").length > 0,
    onTemplate: !!vo.concept && viewTemplate.elements.has(String(vo.concept.id)),
    ...(look ? { look: lookValues(look) } : {}),
  };
}

/**
 * The model relations between a parent element and its child, as Color and font by nesting level reads them.
 * @param {ArchiElement}  parent
 * @param {ArchiElement}  child
 * @param {RelationIndex} relationsOf
 * @returns {NestingRel[]}  outgoing = the parent is the source
 */
function relsBetween(parent, child, relationsOf) {
  /** @type {NestingRel[]} */
  const rels = [];
  for (const r of relationsOf(parent)) {
    const src = r.source && r.source.id, tgt = r.target && r.target.id;
    if (src === parent.id && tgt === child.id) rels.push({ type: r.type, outgoing: true, relation: r });
    else if (tgt === parent.id && src === child.id) rels.push({ type: r.type, outgoing: false, relation: r });
  }
  return rels;
}

/** @param {VisualObject} vo */
function _voDepth(vo) {
  let depth = 0;
  let p = $(vo).parent().filter("element").first();
  while (p) { depth++; p = $(p).parent().filter("element").first(); }
  return depth;
}

/**
 * @param {ArchimateView}                          view
 * @param {Preset["appearance"]["nestingLevel"]}   settings
 * @param {Palette}                                palette  the run's palette: the colors
 * @param {boolean}                                isModify
 * @param {TextFont}                               defaultFont  Archi's default view font
 * @param {Set<string>}                            styledVoIds
 * @param {Map<string, string>}                    keep  visuals inside a diagram-block: left out
 * @param {{ elements: Set<string>, looks: Map<string, TemplateLook[]> }} viewTemplate  elements of the view template, and their looks
 */
function _applyNestingLevel(view, settings, palette, isModify, defaultFont, styledVoIds, keep, viewTemplate) {
  let fontSet = 0, fontReset = 0, colorSet = 0;
  const vos = _onView(view, "element", keep).filter(vo => !!vo.id);
  const nodes = vos.map(vo => _nestingNode(vo, keep, viewTemplate));
  // One message per color name the palette does not hold.
  /** @type {Set<string>} */
  const reported = new Set();
  const reportOnce = (/** @type {string} */ m) => { if (!reported.has(m)) { reported.add(m); Log.warn(`Appearance: ${m}`); } };
  const { styles, conflicts, parentlessRoots, withoutLook } = followNestingChains(nodes, settings.conditions);
  _warnNesting(conflicts, parentlessRoots, withoutLook, viewTemplate.looks.size > 0);

  // Parents before children: a fill color Same as parent shades the fill color its parent was given.
  /** @type {Map<string, string>} */
  const written = new Map();
  const order = vos.map((_, i) => i).sort((a, b) => nodes[a].depth - nodes[b].depth);
  order.forEach(i => {
    const vo = vos[i];
    const n = nodes[i];
    const st = styles.get(n.id);
    const font = nestingFont(st, isModify, defaultFont, n.look);
    if (font) {
      vo.fontName  = font.name;
      vo.fontSize  = font.size;
      vo.fontStyle = font.style;
      if (font === defaultFont) fontReset++; else fontSet++;
    }
    // Modify: a visual the chain no longer reaches loses the fill of an earlier run (SPEC: replaces earlier
    // styling); one with a template look keeps it.
    if (!st) return;
    // Template with a template look: the base layer wrote it.
    if (st.color !== TEMPLATE || !n.look) vo.fillColor = _nestingFill(vo, n, st, written, palette, reportOnce);
    written.set(n.id, String(vo.fillColor));
    styledVoIds.add(vo.id);
    colorSet++;
  });

  Log.debug(`  nestingLevel font:  ${fontSet} set  ${fontReset} reset`);
  Log.debug(`  nestingLevel color: ${colorSet} set`);
}

/**
 * The fill color a nesting style gives a visual without a template look to keep. Template: Type default.
 * Same as parent: the parent's fill color, one level lighter by the condition's
 * Lighter per level. Otherwise its condition's color, or Type default; shaded by depthSinceChange −
 * darkenStart levels: darkenStart levels darker at a nesting type or color change.
 * @param {VisualObject}        vo
 * @param {NestingNode}         n
 * @param {NestingStyle}        st
 * @param {Map<string, string>} written  visual id → the fill color written so far
 * @param {Palette}             palette
 * @param {(message: string) => void} report
 * @returns {string | null}  null = Type default
 */
function _nestingFill(vo, n, st, written, palette, report) {
  if (st.color === TEMPLATE) return null;
  const parentHex = st.color === SAME_TYPE ? written.get(String(n.parentId)) : undefined;
  if (parentHex) return _shadeHex(parentHex, 1, st.lightenPerLevel / 100);
  let start = st.color && st.color !== SAME_TYPE ? Palettes.colorOf(palette, st.color, report) : null;
  if (!start) {
    vo.fillColor = null;                     // reading it back gives the type's default fill
    start = vo.fillColor;
  }
  return _shadeHex(start, st.depthSinceChange - st.darkenStart, st.lightenPerLevel / 100);
}

/**
 * Per condition number, how many visuals it styles with a Template value that have no template look.
 * @param {WithoutLook} withoutLook
 * @returns {Map<number, number>}
 */
function withoutLookCounts(withoutLook) {
  /** @type {Map<number, Set<string>>} */
  const ids = new Map();
  const take = (/** @type {Map<number, Set<string>>} */ m) => m.forEach((set, nr) => ids.set(nr, new Set([...(ids.get(nr) || []), ...set])));
  take(withoutLook.color);
  take(withoutLook.font);
  return new Map([...ids].map(([nr, set]) => [nr, set.size]));
}

/**
 * The console warnings of Color and font by nesting level for one view.
 * @param {string[]}    conflicts
 * @param {string[]}    parentlessRoots
 * @param {WithoutLook} withoutLook
 * @param {boolean}     hasLooks  a view template is on: without one the run warned once (templateWithoutView)
 */
function _warnNesting(conflicts, parentlessRoots, withoutLook, hasLooks) {
  const GROUP = "Color and font by nesting level";
  if (conflicts.length > 0)
    Log.warn(`${GROUP}: conditions ${conflicts.join(" · ")} are equally specific and select the same elements with different styles; the last condition wins.`);
  if (parentlessRoots.length > 0)
    Log.warn(`${GROUP}: ${parentlessRoots.length} root container(s) have a condition with fill color Same as parent, but no parent; they keep their template look, else Type default.`,
      { action: "choose another fill color for that condition, or Parent type other than the root's." });
  if (!hasLooks) return;
  const counts = withoutLookCounts(withoutLook);
  for (const nr of [...counts.keys()].sort((a, b) => a - b))
    Log.warn(`${GROUP}: condition ${nr} styles ${counts.get(nr)} element(s) with Template that are not on the view template.`,
      { effect: `they get Type default, ${DEFAULT_FONT_SIZE} pt, normal.`, action: "choose a value for that condition, or add the elements to the view template." });
}

// ── Highlight repeated elements ───────────────────────────────────────────────

/**
 * @param {ArchimateView}                              view
 * @param {Preset["appearance"]["highlightRepeated"]}  settings
 * @param {Palette}                                   palette  the run's palette: the ranges
 * @param {boolean}                                    isModify
 * @param {Set<string>}                                styledVoIds
 * @param {Map<string, string>}                        keep  visuals inside a diagram-block: left out
 */
function _applyHighlightRepeated(view, settings, palette, isModify, styledVoIds, keep) {
  /** @type {Map<string, VisualObject[]>} */
  const byConceptId = new Map();
  _onView(view, "element", keep).forEach(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    let vos = byConceptId.get(id);
    if (!vos) { vos = []; byConceptId.set(id, vos); }
    vos.push(vo);
  });

  /** @type {string[]} */
  const multiIds = [];
  byConceptId.forEach((vos, id) => { if (vos.length > 1) multiIds.push(id); });

  if (settings.enabled) {
    if (multiIds.length === 0) { Log.debug(`  highlightRepeated: 0 multi-occurrence elements`); return; }
    const colors = _colorScale(palette, settings.colorRange, multiIds.length);
    let n = 0;
    multiIds.forEach((id, i) => { /** @type {VisualObject[]} */ (byConceptId.get(id)).forEach(vo => { vo.fillColor = colors[i]; styledVoIds.add(vo.id); n++; }); });
    Log.debug(`  highlightRepeated: ${n} VOs colored  (${multiIds.length} elements  range=${settings.colorRange})`);
  } else if (isModify && settings.colorRange && multiIds.length > 0) {
    let n = 0;
    multiIds.forEach(id => { /** @type {VisualObject[]} */ (byConceptId.get(id)).forEach(vo => { if (styledVoIds.has(vo.id)) return; vo.fillColor = null; n++; }); });
    Log.debug(`  highlightRepeated: ${n} VOs reset`);
  }
}

// ── Style by property ─────────────────────────────────────────────────────────

/**
 * Which objects does a style condition reach, and which property values do they get?
 * Pure over model objects, so the dialog's conflict check (predicted view contents) and the
 * writer (objects on the generated view) share one implementation.
 *
 * Condition.applyTo decides what is styled:
 *   element    the element itself, by its own property (type = condition.source)
 *   relation   the relation, by the property of condition.propertyOf (relation / source / target)
 *   source     the source element of every relation matching the condition (model-wide relations),
 *              by the property of condition.propertyOf (element = itself, relation, source, target)
 *   target     the target element likewise
 *
 * @param {StyleCondition}       condition       normalised style condition (rel_filter kind "style")
 * @param {ArchiElement[]}  elements   element concepts in scope
 * @param {ArchiRelation[]} relations  relation concepts in scope (used by color = relation)
 * @returns {Map<string, ConditionTarget>}  object id → hit; values is empty
 *          when the property is unset on the object(s)
 */
function computeConditionTargets(condition, elements, relations) {
  /** @type {Map<string, ConditionTarget>} */
  const out = new Map();
  /** @type {(id: string, kind: ConditionTarget["kind"], obj: PropertySource | null | undefined) => void} */
  const hit = (id, kind, obj) => {
    let h = out.get(id);
    if (!h) { h = { kind, values: new Set() }; out.set(id, h); }
    if (!condition.property || !obj) return;
    const v = obj.prop(condition.property);
    if (v !== null && v !== undefined && v !== "") h.values.add(String(v));
  };
  const matches = (/** @type {ArchiRelation} */ r) => ConditionLists.styleConditionMatchesRelation(condition, r.type, r.source && r.source.type, r.target && r.target.type);
  // Whose property supplies the value: the relation, one of its ends, or (propertyOf "element")
  // the styled element itself.
  /** @type {(r: ArchiRelation, el: ArchiElement | null) => PropertySource} */
  const readFrom = (r, el) => condition.propertyOf === "source" ? r.source
                            : condition.propertyOf === "target" ? r.target
                            : condition.propertyOf === "element" && el ? el : r;

  if (condition.applyTo === "element") {
    for (const el of elements) {
      if (condition.source && el.type !== condition.source) continue;
      hit(el.id, "element", el);
    }
  } else if (condition.applyTo === "relation") {
    for (const r of relations) {
      if (!r.source || !r.target || !matches(r)) continue;
      hit(r.id, "relation", readFrom(r, null));
    }
  } else {
    const wantSource = condition.applyTo === "source";
    for (const el of elements) {
      try {
        $(el).rels().each(r => {
          if (!r.source || !r.target) return;
          if ((r.source.id === el.id) !== wantSource) return;
          if (!matches(r)) return;
          hit(el.id, "element", readFrom(r, el));
        });
      } catch (e) {
        Log.warn(`Style by property: the relations of element ${el.id} could not be read (${e}).`, { effect: "it is styled without them." });
      }
    }
  }
  return out;
}

/**
 * @param {ArchimateView}                            view
 * @param {Preset["appearance"]["styleByProperty"]}  settings
 * @param {Palette}                                   palette  the run's palette: the ranges
 * @param {boolean}                                  isModify
 * @param {Set<string>}                              styledVoIds
 * @param {Map<string, string>}                      keep  visuals inside a diagram-block: left out
 */
function _applyStyleConditions(view, settings, palette, isModify, styledVoIds, keep) {
  const conditions = settings.conditions || [];
  if (conditions.length === 0) return;
  const mixedColor = Palettes.colorOf(palette, settings.mixedValuesColor, m => Log.warn(`Appearance: ${m}`))
    || Defs.DEFAULT_PRESET.appearance.styleByProperty.mixedValuesColor;
  const fixedWidth = settings.lineWidth > 0 ? Math.min(3, Math.max(1, settings.lineWidth)) : 0;

  // The objects on the view, by model concept id.
  /** @type {Map<string, VisualObject[]>} */
  const vosByElementId = new Map();
  /** @type {Map<string, ArchiElement>} */
  const elementById = new Map();
  _onView(view, "element", keep).forEach(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    let vos = vosByElementId.get(id);
    if (!vos) { vos = []; vosByElementId.set(id, vos); elementById.set(id, vo.concept); }
    vos.push(vo);
  });
  /** @type {Map<string, VisualConnection[]>} */
  const vcsByRelationId = new Map();
  /** @type {Map<string, ArchiRelation>} */
  const relationById = new Map();
  _onView(view, "relation", keep).forEach(vc => {
    if (!vc.concept || !vc.concept.id) return;
    const id = vc.concept.id;
    let vcs = vcsByRelationId.get(id);
    if (!vcs) { vcs = []; vcsByRelationId.set(id, vcs); relationById.set(id, vc.concept); }
    vcs.push(vc);
  });
  const elements  = Array.from(elementById.values());
  const relations = Array.from(relationById.values());

  // Modify actions: reset every fill and line first, so a changed condition leaves no colors of an
  // earlier run behind. Objects colored earlier in this pass (nesting level, highlight) are kept.
  if (isModify) {
    let n = 0;
    vosByElementId.forEach(vos => vos.forEach(vo => {
      if (styledVoIds.has(vo.id)) return;
      vo.fillColor = null; n++;
    }));
    vcsByRelationId.forEach(vcs => vcs.forEach(vc => { vc.lineColor = null; vc.lineWidth = 1; n++; }));
    if (n > 0) Log.debug(`  styleByProperty: ${n} objects reset`);
  }

  /** @type {Map<number, Set<string>>} */
  const styledByCondition = new Map();     // condition index → Set("element:id" | "relation:id") it colored

  conditions.forEach((condition, i) => {
    if (condition.on === false || !condition.property) return;
    const targets = computeConditionTargets(condition, elements, relations);

    // One value → its color from the range; several different values → the mixed-values color.
    const unique = Array.from(new Set(
      Array.from(targets.values()).filter(h => h.values.size === 1).map(h => Array.from(h.values)[0])
    )).sort(compareNames);
    const colors   = unique.length ? _colorScale(palette, condition.colorRange, unique.length) : [];
    /** @type {Record<string, string>} */
    const colorMap = {};
    unique.forEach((val, k) => { colorMap[val] = colors[k]; });

    /** @type {Set<string>} */
    const mine = new Set();
    let colored = 0, mixed = 0;
    targets.forEach((h, id) => {
      if (h.values.size === 0) return;
      const isMixed = h.values.size > 1;
      const color   = isMixed ? mixedColor : colorMap[Array.from(h.values)[0]];
      if (isMixed) mixed++;
      if (h.kind === "relation") {
        (vcsByRelationId.get(id) || []).forEach(vc => {
          vc.lineColor = color;
          if (fixedWidth > 0) vc.lineWidth = fixedWidth;
        });
      } else {
        (vosByElementId.get(id) || []).forEach(vo => { vo.fillColor = color; styledVoIds.add(vo.id); });
      }
      mine.add(`${h.kind}:${id}`);
      colored++;
    });
    styledByCondition.set(i, mine);
    Log.debug(`  styleByProperty condition ${i + 1}: ${targets.size} matched  ${colored} colored  ${mixed} mixed values  ${unique.length} unique values`);
  });

  ConditionLists.detectConditionConflicts(styledByCondition).forEach(c =>
    Log.warn(`Style by property: condition ${c.condition + 1} also styles ${c.count} objects of condition${c.with.length > 1 ? "s" : ""} ${c.with.map(j => j + 1).join(", ")}; the last condition wins`));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// n evenly spaced colors of a range of the run's palette; a range the palette does not hold is
// reported and its first range used.
/**
 * @param {Palette} palette
 * @param {string}  rangeName
 * @param {number}  n
 * @returns {string[]}
 */
function _colorScale(palette, rangeName, n) {
  let range = palette.ranges.find(r => r.name === rangeName);
  if (!range) {
    range = palette.ranges[0];
    Log.warn(`Appearance: color range "${rangeName}" is not in palette "${palette.name}"; its first range "${range.name}" is used, as the dialog shows. Save the preset to keep it.`);
  }
  return Palettes.rangeColors(range, n);
}

// Darker yellow turns ochre, not lemon (HSL) or olive (Lab): per darker level the hue of a yellow
// moves this many degrees toward orange, as in the GEMMA KK01 views (#fff29b → #fff8b7 → #ffffcc).
const YELLOW_HUES       = [40, 80];   // HSL hue range that shifts; the shift stops at its lower end
const OCHRE_DEG_PER_LEVEL = 4;
// A darker level never goes below the lighter of: the exact inverse of a lighter level, and closing the same
// fraction of the distance to this HSL lightness. Light colors follow the inverse (KK01); a middle
// color such as orange #f9c268 stays light (#f8bd5a, #f8b951) instead of turning brown.
const DARKEN_FLOOR = 0.6;

/**
 * Shade a color by nesting levels in HSL lightness, saturation kept: each level up closes `step`
 * of the distance to white, each level down (levels < 0) is the exact inverse, bounded by
 * DARKEN_FLOOR, and a darker yellow also shifts toward ochre. So the color itself sits at level 0; yellow #ffffcc goes
 * #fff197 → #fffab6 → #ffffcc → #ffffdb at 30 %.
 * @param {string} hex
 * @param {number} levels  > 0 lighter, < 0 darker
 * @param {number} step    0..1, fraction of the distance to white per level
 * @returns {string}
 */
function _shadeHex(hex, levels, step) {
  const l = Chroma(hex).get("hsl.l");
  const keep = 1 - Math.max(0, Math.min(0.95, step));
  let shaded = 1 - (1 - l) * Math.pow(keep, levels);
  if (levels < 0 && l > DARKEN_FLOOR) shaded = Math.max(shaded, DARKEN_FLOOR + (l - DARKEN_FLOOR) * Math.pow(keep, -levels));
  else if (levels < 0) shaded = l;
  let c = Chroma(hex).set("hsl.l", Math.max(0, Math.min(1, shaded)));
  const hue = Chroma(hex).get("hsl.h");
  if (levels < 0 && hue >= YELLOW_HUES[0] && hue <= YELLOW_HUES[1])
    c = c.set("hsl.h", Math.max(YELLOW_HUES[0], hue + OCHRE_DEG_PER_LEVEL * levels));
  return c.hex();
}

// ── Module exports ────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyAppearance, templateWithoutView, templateLook, lookValues, relsBetween, withoutLookCounts, DEFAULT_FONT_SIZE, DEFAULT_FONT_STYLE, computeConditionTargets, followNestingChains, nestingFonts };
}
