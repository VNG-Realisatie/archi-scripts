/**
 * Appearance pass — post-write visual styling for generated views.
 *
 * Called from generate_view.js after _writeView. Applies fill colours, fonts,
 * and line widths to VisualElements/VisualConnections based on preset.appearance.
 *
 * Condition precedence (later overrides earlier for the same VO):
 *   nestingLevel → highlightRepeated → styleByProperty conditions (in list order)
 *
 * Reset on Modify (layout_only, expand_view): a disabled nesting-level or highlight feature
 * resets the elements it would have styled to Archi defaults (fillColor = null, font = Segoe UI
 * 9 normal); with style conditions, every element fill and relation line colour / width not styled
 * earlier in the pass is reset before the conditions colour (SPEC §10, Style by property).
 */
console.log("Loading appearance.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Chroma = require("chroma-js");
/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
/** @type {typeof import("./palettes")} */
const Palettes  = require(REPO_ROOT + "View/lib/palettes");
const { COLOR_RANGES, compareNames } = Defs;

// Qualitative schemes are discrete colour sets; padding is meaningless on them.
const QUALITATIVE_COLOR_RANGES = new Set(["Pastel1", "Pastel2", "Set2", "Set3"]);

/**
 * @typedef {object} NestingNode  an element visual, for followNestingChains
 * @property {string}        id
 * @property {string | null} parentId     parent element visual; null = a root
 * @property {string}        type         element type
 * @property {{ type: string, outgoing: boolean }[]} rels  model relations between parent and element; outgoing = the parent is the source
 * @property {number}        depth
 * @property {boolean}       isContainer
 *
 * @typedef {object} NestingStyle  how followNestingChains styles a visual
 * @property {number}  segmentDepth  from the segment start: lightening
 * @property {string}  color         the colour name of the condition that selected it; "" = Default
 * @property {number}  fontSize      pt; DEFAULT_FONT_SIZE = unchanged
 * @property {boolean} bold          the condition starts here and is bold
 * @property {number}  nr            the number of the condition that selected it
 * @property {boolean} asContainer   a container, or a leaf beside one: it takes the font
 *
 * @typedef {{ kind: "element" | "relation", values: Set<string> }} ConditionTarget
 */

// Archi default font — used when resetting.
const DEFAULT_FONT_NAME  = "Segoe UI";
const DEFAULT_FONT_SIZE  = 9;
const DEFAULT_FONT_STYLE = "normal";

// ── Public API ────────────────────────────────────────────────────────────────

// actionId: "new_view" | "one_each" | "expand_view" | "layout_only"
// Resets apply only when actionId is "layout_only" or "expand_view".
/**
 * @param {ArchimateView} view
 * @param {MaskedPreset}  preset  params masked to the algorithm (defs.effectiveParams)
 * @param {string}        actionId
 * @param {Map<string, string>} [diagramBlockOf]  visuals inside a diagram-block: they keep their appearance
 */
function applyAppearance(view, preset, actionId, diagramBlockOf) {
  const keep = diagramBlockOf || new Map();
  const app  = preset.appearance;
  const isModify = actionId === "layout_only" || actionId === "expand_view";
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;
  const sbp  = app.styleByProperty;

  const anyEnabled =
    nl.fontEnabled || nl.colorEnabled || hr.enabled ||
    sbp.conditions.some(r => r.on !== false && r.property);

  if (!anyEnabled && !isModify) return;

  console.log(`\nAppearance (${actionId || "?"})`);
  // params is the algorithm's effective subset: nestingConditions is absent when the algorithm does not nest.
  const hasNestingTypes = (preset.params.nestingConditions || []).length > 0;
  if ((nl.fontEnabled || nl.colorEnabled) && hasNestingTypes)
    console.log(`  nestingLevel  font=${nl.fontEnabled}  color=${nl.colorEnabled}  colorList=${app.palette || "none"}  darkenStart=${nl.darkenStart}  lighten=${nl.lightenPerLevel}%/level  conditions=${nl.conditions.filter(r => r.on !== false).length}`);
  if (hr.enabled)
    console.log(`  highlightRepeated  range=${hr.colorRange}`);
  sbp.conditions.forEach((r, i) => {
    if (r.on === false || !r.property) return;
    console.log(`  styleByProperty condition ${i + 1}  color=${r.color}  ${r.source || "all"} ${r.relation || "all"} ${r.target || "all"}  prop=${r.propertyOf}."${r.property}"  range=${r.colorRange}`);
  });

  // VOs colored by an active feature are protected from being cleared by later disabled-feature
  // resets (which would otherwise overwrite earlier colors). Built incrementally: each active
  // feature adds its styled VO ids so subsequent resets can skip them.
  /** @type {Set<string>} */
  const styledVoIds = new Set();

  _applyNestingLevel(view, nl, _colorLookup(app.palette, nl), isModify, styledVoIds, keep);
  _applyHighlightRepeated(view, hr, isModify, styledVoIds, keep);
  _applyStyleConditions(view, sbp, isModify, styledVoIds, keep);
}

/**
 * Hex of a colour name in the chosen palette. The file is read only when a nesting style
 * condition names a colour; an unreadable file or unknown list is reported, and Default is used.
 * @param {string} paletteName
 * @param {Preset["appearance"]["nestingLevel"]} nl
 * @returns {(colorName: string) => string | null}
 */
function _colorLookup(paletteName, nl) {
  if (!nl.colorEnabled || !nl.conditions.some(r => r.on !== false && r.color)) return () => null;
  /** @type {Palette[]} */
  let palettes = [];
  try { palettes = Palettes.readPalettes(); }
  catch (e) { console.error(`Appearance: ${e} Nesting style colours use Default.`); return () => null; }
  if (!palettes.some(p => p.name === paletteName)) {
    console.error(`Appearance: palette "${paletteName}" is not in ${Palettes.PALETTES_FILE}; nesting style colours use Default. Choose a palette on the Appearance tab.`);
    return () => null;
  }
  return name => Palettes.colorHex(palettes, paletteName, name);
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

// ── Style by nesting level ────────────────────────────────────────────────────

/**
 * Follow the nesting style conditions from every root container (pure). A condition selects the
 * nesting steps it matches; the child of a selected step takes the condition's colour, provided its
 * parent is styled. A root container takes the colour of the last condition whose parent is its
 * type, else of the last with parent All. An element no condition selects stops the chain for
 * itself and everything inside it. Of conditions that select the same element the most specific wins
 * (_specificity); of equally specific ones the last. A child with the colour and type of its parent
 * continues the parent's segment one level deeper; otherwise it starts a segment.
 * Font: where a condition starts (a root, or a child selected by another condition than its parent)
 * the element takes the condition's font size and bold; elsewhere, and where the condition has no
 * font size, the size is its parent's less fontDecreasePerLevel, never below DEFAULT_FONT_SIZE.
 * A leaf beside a container (same parent, or both roots) is styled as a container.
 * @param {NestingNode[]}           nodes       every element visual; order = view order (determinism)
 * @param {NestingStyleCondition[]} conditions
 * @param {number}                  fontDecreasePerLevel
 * @returns {{ styles: Map<string, NestingStyle>, conflicts: string[] }}  conflicts: equally specific conditions ("2, 3") that select the same elements with different styles
 */
function followNestingChains(nodes, conditions, fontDecreasePerLevel) {
  const active = conditions.map((r, i) => ({ r, nr: i + 1 })).filter(x => x.r.on !== false);
  const byId   = new Map(nodes.map(n => [n.id, n]));
  /** @type {Map<string, NestingStyle>} */
  const styles = new Map();
  /** @type {Set<string>} */
  const conflicts = new Set();
  /** @type {Set<string | null>} */
  const withContainer = new Set(nodes.filter(n => n.isContainer).map(n => n.parentId));
  // Stable sort: parents before children, view order within a depth.
  for (const n of nodes.slice().sort((a, b) => a.depth - b.depth)) {
    const asContainer = n.isContainer || withContainer.has(n.parentId);
    if (!n.parentId) {
      if (!asContainer) continue;
      const own = active.filter(x => x.r.parent === n.type);
      const sel = own.length ? own : active.filter(x => !x.r.parent);
      if (sel.length === 0) continue;
      const win = _lastOf(sel, conflicts);
      styles.set(n.id, Object.assign({ segmentDepth: 0, color: win.r.color, nr: win.nr, asContainer }, _font(win.r, DEFAULT_FONT_SIZE)));
      continue;
    }
    const ps = styles.get(n.parentId);
    const parent = byId.get(n.parentId);
    if (!ps || !parent) continue;
    const sel = active.filter(x => ConditionLists.nestingStyleConditionMatches(x.r, parent.type, n.type, n.rels));
    if (sel.length === 0) continue;
    const win = _mostSpecific(sel, conflicts);
    const color = win.r.color;
    const segmentDepth = n.type === parent.type && color === ps.color ? ps.segmentDepth + 1 : 0;
    const smaller = Math.max(DEFAULT_FONT_SIZE, ps.fontSize - fontDecreasePerLevel);
    const font = win.nr === ps.nr ? { fontSize: smaller, bold: false } : _font(win.r, smaller);
    styles.set(n.id, Object.assign({ segmentDepth, color, nr: win.nr, asContainer }, font));
  }
  return { styles, conflicts: [...conflicts] };
}

/**
 * The font where condition r starts: its own size, or `inherited` when it has none.
 * @param {NestingStyleCondition} r
 * @param {number}                inherited
 */
function _font(r, inherited) {
  return { fontSize: r.fontSize || inherited, bold: r.bold };
}

/**
 * The condition that wins among those selecting one element: the most specific, of equally specific
 * ones the last. Equally specific winners with different styles are added to conflicts.
 * @param {{ r: NestingStyleCondition, nr: number }[]} sel  non-empty, in list order
 * @param {Set<string>} conflicts
 */
function _mostSpecific(sel, conflicts) {
  const top = Math.max(...sel.map(x => _specificity(x.r)));
  return _lastOf(sel.filter(x => _specificity(x.r) === top), conflicts);
}

/**
 * The last of equally specific conditions; different styles among them are added to conflicts.
 * @param {{ r: NestingStyleCondition, nr: number }[]} best  non-empty, in list order
 * @param {Set<string>} conflicts
 */
function _lastOf(best, conflicts) {
  if (new Set(best.map(x => `${x.r.color}/${x.r.fontSize}/${x.r.bold}`)).size > 1) conflicts.add(best.map(x => x.nr).join(", "));
  return best[best.length - 1];
}

/**
 * How narrowly a condition selects: one point per named parent type, relation type and direction
 * (outgoing / incoming); child: a type 2, = Parent 1, All 0.
 * @param {NestingStyleCondition} r
 */
function _specificity(r) {
  const child = r.child === ConditionLists.SAME_TYPE ? 1 : r.child ? 2 : 0;
  return (r.parent ? 1 : 0) + (r.relation ? 1 : 0) + (r.direction !== "either" ? 1 : 0) + child;
}

/**
 * A visual as followNestingChains sees it: its parent element visual and the model relations
 * between the two elements.
 * @param {VisualObject} vo
 * @param {Map<string, string>} keep  visuals inside a diagram-block: not a parent
 * @returns {NestingNode}
 */
function _nestingNode(vo, keep) {
  const parentVo = $(vo).parent().filter("element").first();
  const parentId = parentVo && !keep.has(String(parentVo.id)) ? String(parentVo.id) : null;
  /** @type {{ type: string, outgoing: boolean }[]} */
  const rels = [];
  if (parentVo && parentVo.concept && vo.concept) {
    const childId = vo.concept.id;
    $(parentVo.concept).outRels().each(r => { if (r.target.id === childId) rels.push({ type: r.type, outgoing: true }); });
    $(parentVo.concept).inRels().each(r => { if (r.source.id === childId) rels.push({ type: r.type, outgoing: false }); });
  }
  return {
    id: String(vo.id), parentId, type: (vo.concept && vo.concept.type) || "", rels,
    depth: _voDepth(vo), isContainer: $(vo).children("element").length > 0,
  };
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
 * @param {(colorName: string) => string | null}   colorOf  hex of a colour of the chosen palette
 * @param {boolean}                                isModify
 * @param {Set<string>}                            styledVoIds
 * @param {Map<string, string>}                    keep  visuals inside a diagram-block: left out
 */
function _applyNestingLevel(view, settings, colorOf, isModify, styledVoIds, keep) {
  let fontSet = 0, fontReset = 0, colorSet = 0, colorReset = 0;
  const vos = _onView(view, "element", keep).filter(vo => !!vo.id);
  const nodes = vos.map(vo => _nestingNode(vo, keep));
  const { styles, conflicts } = followNestingChains(nodes, settings.conditions, settings.fontDecreasePerLevel);
  if (conflicts.length > 0)
    console.log(`  nestingLevel: conditions ${conflicts.join(" · ")} are equally specific and select the same elements with different styles; the last condition wins.`);
  /** @type {Set<string>} */
  const unknownColors = new Set();

  vos.forEach((vo, i) => {
    const st = styles.get(nodes[i].id);
    // Modify: a visual the chain no longer reaches loses the fill of an earlier run (SPEC: replaces earlier styling).
    if (!st) {
      if (isModify && settings.colorEnabled) { vo.fillColor = null; colorReset++; }
      return;
    }
    // Font (followNestingChains): containers, and leaves beside one.
    if (st.asContainer && (st.fontSize > DEFAULT_FONT_SIZE || st.bold)) {
      if (settings.fontEnabled) {
        vo.fontName  = DEFAULT_FONT_NAME;
        vo.fontSize  = st.fontSize;
        vo.fontStyle = st.bold ? "bold" : DEFAULT_FONT_STYLE;
        fontSet++;
      } else if (isModify) {
        vo.fontName  = DEFAULT_FONT_NAME;
        vo.fontSize  = DEFAULT_FONT_SIZE;
        vo.fontStyle = DEFAULT_FONT_STYLE;
        fontReset++;
      }
    }

    // Colour: the segment's colour (its condition's colour, or Default = the element type's default
    // fill), shaded by segmentDepth − darkenStart levels: darkenStart levels darker at the segment start.
    if (settings.colorEnabled) {
      let start = st.color ? colorOf(st.color) : null;
      if (st.color && !start) unknownColors.add(st.color);
      vo.fillColor = null;                       // reading it back gives the type's default fill
      if (!start) start = vo.fillColor;
      vo.fillColor = _shadeHex(start, st.segmentDepth - settings.darkenStart, settings.lightenPerLevel / 100);
      styledVoIds.add(vo.id);
      colorSet++;
    } else if (isModify) {
      vo.fillColor = null;
      colorReset++;
    }
  });

  unknownColors.forEach(c => console.error(`Appearance: colour "${c}" is not in the chosen palette; Default used. Choose a colour of the palette in the nesting style condition.`));
  if (settings.fontEnabled  || fontReset  > 0) console.log(`  nestingLevel font:  ${fontSet} set  ${fontReset} reset`);
  if (settings.colorEnabled || colorReset > 0) console.log(`  nestingLevel color: ${colorSet} set  ${colorReset} reset`);
}

// ── Highlight repeated elements ───────────────────────────────────────────────

/**
 * @param {ArchimateView}                              view
 * @param {Preset["appearance"]["highlightRepeated"]}  settings
 * @param {boolean}                                    isModify
 * @param {Set<string>}                                styledVoIds
 * @param {Map<string, string>}                        keep  visuals inside a diagram-block: left out
 */
function _applyHighlightRepeated(view, settings, isModify, styledVoIds, keep) {
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
    if (multiIds.length === 0) { console.log(`  highlightRepeated: 0 multi-occurrence elements`); return; }
    const colors = _colorScale(settings.colorRange, multiIds.length);
    let n = 0;
    multiIds.forEach((id, i) => { /** @type {VisualObject[]} */ (byConceptId.get(id)).forEach(vo => { vo.fillColor = colors[i]; styledVoIds.add(vo.id); n++; }); });
    console.log(`  highlightRepeated: ${n} VOs colored  (${multiIds.length} elements  range=${settings.colorRange})`);
  } else if (isModify && settings.colorRange && multiIds.length > 0) {
    let n = 0;
    multiIds.forEach(id => { /** @type {VisualObject[]} */ (byConceptId.get(id)).forEach(vo => { if (styledVoIds.has(vo.id)) return; vo.fillColor = null; n++; }); });
    console.log(`  highlightRepeated: ${n} VOs reset`);
  }
}

// ── Style by property ─────────────────────────────────────────────────────────

/**
 * Which objects does a style condition reach, and which property values do they get?
 * Pure over model objects, so the dialog's conflict check (predicted view contents) and the
 * writer (objects on the generated view) share one implementation.
 *
 * Condition.color decides what is styled:
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
    try {
      const v = obj.prop(condition.property);
      if (v !== null && v !== undefined && v !== "") h.values.add(String(v));
    } catch (e) {}
  };
  const matches = (/** @type {ArchiRelation} */ r) => ConditionLists.styleConditionMatchesRelation(condition, r.type, r.source && r.source.type, r.target && r.target.type);
  // Whose property supplies the value: the relation, one of its ends, or (propertyOf "element")
  // the styled element itself.
  /** @type {(r: ArchiRelation, el: ArchiElement | null) => PropertySource} */
  const readFrom = (r, el) => condition.propertyOf === "source" ? r.source
                            : condition.propertyOf === "target" ? r.target
                            : condition.propertyOf === "element" && el ? el : r;

  if (condition.color === "element") {
    for (const el of elements) {
      if (condition.source && el.type !== condition.source) continue;
      hit(el.id, "element", el);
    }
  } else if (condition.color === "relation") {
    for (const r of relations) {
      if (!r.source || !r.target || !matches(r)) continue;
      hit(r.id, "relation", readFrom(r, null));
    }
  } else {
    const wantSource = condition.color === "source";
    for (const el of elements) {
      try {
        $(el).rels().each(r => {
          if (!r.source || !r.target) return;
          if ((r.source.id === el.id) !== wantSource) return;
          if (!matches(r)) return;
          hit(el.id, "element", readFrom(r, el));
        });
      } catch (e) {
        console.log(`  styleByProperty: error reading relations for ${el.id}: ${e}`);
      }
    }
  }
  return out;
}

/**
 * @param {ArchimateView}                            view
 * @param {Preset["appearance"]["styleByProperty"]}  settings
 * @param {boolean}                                  isModify
 * @param {Set<string>}                              styledVoIds
 * @param {Map<string, string>}                      keep  visuals inside a diagram-block: left out
 */
function _applyStyleConditions(view, settings, isModify, styledVoIds, keep) {
  const conditions = settings.conditions || [];
  if (conditions.length === 0) return;
  const mixedColor = settings.mixedValuesColor;
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

  // Modify actions: reset every fill and line first, so a changed condition leaves no colours of an
  // earlier run behind. Objects colored earlier in this pass (nesting level, highlight) are kept.
  if (isModify) {
    let n = 0;
    vosByElementId.forEach(vos => vos.forEach(vo => {
      if (styledVoIds.has(vo.id)) return;
      vo.fillColor = null; n++;
    }));
    vcsByRelationId.forEach(vcs => vcs.forEach(vc => { vc.lineColor = null; vc.lineWidth = 1; n++; }));
    if (n > 0) console.log(`  styleByProperty: ${n} objects reset`);
  }

  /** @type {Map<number, Set<string>>} */
  const styledByCondition = new Map();     // condition index → Set("element:id" | "relation:id") it colored

  conditions.forEach((condition, i) => {
    if (condition.on === false || !condition.property) return;
    const targets = computeConditionTargets(condition, elements, relations);

    // One value → its colour from the range; several different values → the mixed-values colour.
    const unique = Array.from(new Set(
      Array.from(targets.values()).filter(h => h.values.size === 1).map(h => Array.from(h.values)[0])
    )).sort(compareNames);
    const colors   = unique.length ? _colorScale(condition.colorRange, unique.length) : [];
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
    console.log(`  styleByProperty condition ${i + 1}: ${targets.size} matched  ${colored} colored  ${mixed} mixed values  ${unique.length} unique values`);
  });

  ConditionLists.detectConditionConflicts(styledByCondition).forEach(c =>
    console.log(`  ⚠ styleByProperty condition ${c.condition + 1} also styles ${c.count} objects of condition${c.with.length > 1 ? "s" : ""} ${c.with.map(j => j + 1).join(", ")}; the last condition wins`));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build a Chroma colour scale and return n evenly spaced hex strings.
// Qualitative schemes (Pastel1, Set2, …) are discrete — no padding.
// Sequential/diverging schemes trim their dark end with padding([0.1, 0.4])
// to keep colours in the light-to-medium range readable on light backgrounds.
/**
 * @param {string} rangeName
 * @param {number} n
 * @returns {string[]}
 */
function _colorScale(rangeName, n) {
  try {
    const scale = Chroma.scale(rangeName);
    if (QUALITATIVE_COLOR_RANGES.has(rangeName)) return scale.colors(n);
    return scale.padding([0.1, 0.4]).colors(n);
  } catch (e) {
    console.log(`appearance: unknown colour range "${rangeName}", falling back to Pastel1`);
    return Chroma.scale("Pastel1").colors(n);
  }
}

// Darker yellow turns ochre, not lemon (HSL) or olive (Lab): per darker level the hue of a yellow
// moves this many degrees toward orange, as in the GEMMA KK01 views (#fff29b → #fff8b7 → #ffffcc).
const YELLOW_HUES       = [40, 80];   // HSL hue range that shifts; the shift stops at its lower end
const OCHRE_DEG_PER_LEVEL = 4;
// A darker level never goes below the lighter of: the exact inverse of a lighter level, and closing the same
// fraction of the distance to this HSL lightness. Light colours follow the inverse (KK01); a middle
// colour such as orange #f9c268 stays light (#f8bd5a, #f8b951) instead of turning brown.
const DARKEN_FLOOR = 0.6;

/**
 * Shade a colour by nesting levels in HSL lightness, saturation kept: each level up closes `step`
 * of the distance to white, each level down (levels < 0) is the exact inverse, bounded by
 * DARKEN_FLOOR, and a darker yellow also shifts toward ochre. So the colour itself sits at level 0; yellow #ffffcc goes
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
  module.exports = { applyAppearance, computeConditionTargets, followNestingChains };
}
