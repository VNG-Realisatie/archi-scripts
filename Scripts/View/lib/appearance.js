/**
 * Appearance pass — post-write visual styling for generated views.
 *
 * Called from generate_view.js after _writeView. Applies fill colours, fonts,
 * and line widths to VisualElements/VisualConnections based on preset.appearance.
 *
 * Rule precedence (later overrides earlier for the same VO):
 *   nestingLevel → highlightRepeated → styleByProperty rules (in list order)
 *
 * Reset on disable: when a feature is disabled and the action is layout_only or
 * expand_view, the elements that feature would have styled are reset to Archi defaults
 * (fillColor = null, font = Segoe UI 9 normal, lineWidth = 1).
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
const RuleLists = require(REPO_ROOT + "View/lib/rel_filter");
const { COLOR_RANGES } = Defs;

// Qualitative schemes are discrete colour sets; padding is meaningless on them.
const QUALITATIVE_COLOR_RANGES = new Set(["Pastel1", "Pastel2", "Set2", "Set3"]);

/**
 * @typedef {object} ViewDepths
 * @property {Map<string, number>}         depthById
 * @property {Map<string, boolean>}        isContainerById
 * @property {Map<string, boolean>}        inSameTypeChainById
 * @property {Map<string, string | null | undefined>}  rootIdById  undefined: parent not on the view
 * @property {number}                      maxContainerDepth
 *
 * @typedef {{ kind: "element" | "relation", values: Set<string> }} RuleTarget
 */

// Archi default font — used when resetting.
const DEFAULT_FONT_NAME  = "Segoe UI";
const DEFAULT_FONT_SIZE  = 9;
const DEFAULT_FONT_STYLE = "normal";

// ── Public API ────────────────────────────────────────────────────────────────

// actionId: "new_view" | "one_each" | "expand_view" | "layout_only"
// Reset-on-disable applies only when actionId is "layout_only" or "expand_view".
/**
 * @param {ArchimateView} view
 * @param {MaskedPreset}  preset  params masked to the algorithm (defs.effectiveParams)
 * @param {string}        actionId
 */
function applyAppearance(view, preset, actionId) {
  const app  = preset.appearance;
  const isModify = actionId === "layout_only" || actionId === "expand_view";
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;
  const sbp  = app.styleByProperty;

  const anyEnabled =
    nl.fontEnabled || nl.colorEnabled || hr.enabled ||
    sbp.rules.some(r => r.on !== false && r.property);

  if (!anyEnabled && !isModify) return;

  console.log(`\nAppearance (${actionId || "?"})`);
  // params is the algorithm's effective subset: nestingRules is absent when the algorithm does not nest.
  const hasNestingTypes = (preset.params.nestingRules || []).length > 0;
  if ((nl.fontEnabled || nl.colorEnabled) && hasNestingTypes)
    console.log(`  nestingLevel  font=${nl.fontEnabled}  color=${nl.colorEnabled}  rootColor=${nl.rootColor}  lighten=${nl.lightenPerLevel}%/level`);
  if (hr.enabled)
    console.log(`  highlightRepeated  range=${hr.colorRange}`);
  sbp.rules.forEach((r, i) => {
    if (r.on === false || !r.property) return;
    console.log(`  styleByProperty rule ${i + 1}  color=${r.color}  ${r.source || "all"} ${r.relation || "all"} ${r.target || "all"}  prop=${r.propertyOf}."${r.property}"  range=${r.colorRange}`);
  });

  const depths = _computeViewDepths(view);
  console.log(`  view: ${depths.depthById.size} VOs  maxContainerDepth=${depths.maxContainerDepth}`);

  // VOs colored by an active feature are protected from being cleared by later disabled-feature
  // resets (which would otherwise overwrite earlier colors). Built incrementally: each active
  // feature adds its styled VO ids so subsequent resets can skip them.
  /** @type {Set<string>} */
  const styledVoIds = new Set();

  _applyNestingLevel(view, nl, depths, isModify, styledVoIds);
  _applyHighlightRepeated(view, hr, isModify, styledVoIds);
  _applyStyleRules(view, sbp, isModify, styledVoIds);
}

// ── Depth computation ─────────────────────────────────────────────────────────

// Returns { depthById, isContainerById, inSameTypeChainById, rootIdById, maxContainerDepth }.
// All maps are keyed by VO id (string) — jArchi creates new proxy objects on each
// find() call, so reference equality cannot be used as a Map key.
//
// inSameTypeChainById — true when a VO (container or leaf) is in an unbroken same-element-type
// chain from its depth-0 root ancestor (see "Type chain" in SPEC.md, Appearance tab).
// rootIdById — maps each in-chain VO to the VO id of its depth-0 chain root (null if not in chain).
/**
 * @param {ArchimateView} view
 * @returns {ViewDepths}
 */
function _computeViewDepths(view) {
  /** @type {Map<string, number>} */
  const depthById       = new Map();
  /** @type {Map<string, boolean>} */
  const isContainerById = new Map();
  /** @type {Map<string, string | null>} */
  const parentIdById    = new Map();  // voId → parent voId | null
  /** @type {Map<string, string | null>} */
  const elementTypeById = new Map();  // voId → vo.concept.type | null
  let maxContainerDepth = 0;

  $(view).find("element").each(vo => {
    if (!vo.id) return;
    const depth = _voDepth(vo);
    depthById.set(vo.id, depth);
    const isContainer = $(vo).children("element").length > 0;
    isContainerById.set(vo.id, isContainer);
    if (isContainer && depth > maxContainerDepth) maxContainerDepth = depth;
    const parentVo = $(vo).parent().filter("element").first();
    parentIdById.set(vo.id, parentVo ? String(parentVo.id) : null);
    elementTypeById.set(vo.id, (vo.concept && vo.concept.type) || null);
  });

  // Compute inSameTypeChainById and rootIdById top-down (shallowest first).
  // A VO is in the chain iff its element type equals that of its depth-0 root
  // ancestor AND every ancestor between them is also in the chain.
  // Stops propagating as soon as a type mismatch is encountered ("stop the tree").
  /** @type {Map<string, boolean>} */
  const inSameTypeChainById = new Map();
  /** @type {Map<string, string | null | undefined>} */
  const rootIdById          = new Map();  // voId → depth-0 root VO id | null
  const byDepth = [...depthById.entries()].sort((a, b) => a[1] - b[1]);
  for (const [voId, depth] of byDepth) {
    if (!isContainerById.get(voId)) {
      // Leaf: in chain only if its parent container is in the chain and types match.
      // Depth-0 leaves (no parent container) never start a chain.
      const parentId = parentIdById.get(voId);
      if (!parentId) { inSameTypeChainById.set(voId, false); rootIdById.set(voId, null); continue; }
      const parentInChain = inSameTypeChainById.get(parentId) === true;
      const voType        = elementTypeById.get(voId);
      const parentType    = elementTypeById.get(parentId);
      const inChain = parentInChain && !!(voType && voType === parentType);
      inSameTypeChainById.set(voId, inChain);
      rootIdById.set(voId, inChain ? rootIdById.get(parentId) : null);
      continue;
    }
    if (depth === 0)   { inSameTypeChainById.set(voId, true); rootIdById.set(voId, voId); continue; }
    const parentId      = parentIdById.get(voId);
    if (!parentId)      { inSameTypeChainById.set(voId, true); rootIdById.set(voId, voId); continue; }
    const parentInChain = inSameTypeChainById.get(parentId) === true;
    const voType        = elementTypeById.get(voId);
    const parentType    = elementTypeById.get(parentId);
    const inChain = parentInChain && !!(voType && voType === parentType);
    inSameTypeChainById.set(voId, inChain);
    rootIdById.set(voId, inChain ? rootIdById.get(parentId) : null);
  }

  return { depthById, isContainerById, inSameTypeChainById, rootIdById, maxContainerDepth };
}

/** @param {VisualObject} vo */
function _voDepth(vo) {
  let depth = 0;
  let p = $(vo).parent().filter("element").first();
  while (p) { depth++; p = $(p).parent().filter("element").first(); }
  return depth;
}

// ── Style by nesting level ────────────────────────────────────────────────────

/**
 * @param {ArchimateView}                          view
 * @param {Preset["appearance"]["nestingLevel"]}   settings
 * @param {ViewDepths}                             depths
 * @param {boolean}                                isModify
 * @param {Set<string>}                            styledVoIds
 */
function _applyNestingLevel(view, settings, depths, isModify, styledVoIds) {
  const { depthById, isContainerById, inSameTypeChainById, rootIdById, maxContainerDepth } = depths;
  let fontSet = 0, fontReset = 0, colorSet = 0, colorReset = 0;

  const rootFontSize       = settings.rootFontSize        !== undefined ? settings.rootFontSize        : 14;
  const rootFontBold       = settings.rootFontBold        !== undefined ? settings.rootFontBold        : true;
  const fontDecPerLevel    = settings.fontDecreasePerLevel !== undefined ? settings.fontDecreasePerLevel : 2;
  const lightenPerLevel     = settings.lightenPerLevel       !== undefined ? settings.lightenPerLevel       : 15;
  const fallbackColor      = settings.rootColor || null;

  // Snapshot fill colors of depth-0 chain roots before any modification so that
  // each chain's gradient is anchored to the root container's existing fill color.
  /** @type {Map<string, string | null>} */
  const chainRootFillById = new Map();  // rootVoId → fill color string | null
  $(view).find("element").each(vo => {
    if (!vo.id) return;
    if (depthById.get(vo.id) === 0 && inSameTypeChainById.get(vo.id) === true)
      chainRootFillById.set(vo.id, vo.fillColor || null);
  });

  // Returns the gradient anchor color for a VO: its chain root's current fill, or fallbackColor.
  // Returns null when neither is available — those VOs are skipped.
  const anchorColor = (/** @type {string} */ voId) => {
    const rootId = rootIdById ? rootIdById.get(voId) : null;
    return (rootId ? chainRootFillById.get(rootId) : null) || fallbackColor;
  };

  $(view).find("element").each(vo => {
    if (!vo.id) return;
    const depth       = depthById.get(vo.id);
    const isContainer = isContainerById.get(vo.id);
    const inChain     = inSameTypeChainById.get(vo.id) === true;
    if (depth === undefined) return;

    // Font: root gets rootFontSize (+ bold if rootFontBold), each deeper level decreases
    // by fontDecPerLevel pt, clamped at DEFAULT_FONT_SIZE.
    // Only containers in the same-type chain from their root ancestor are affected.
    if (settings.fontEnabled && isContainer && inChain) {
      const size = Math.max(DEFAULT_FONT_SIZE, rootFontSize - depth * fontDecPerLevel);
      if (size > DEFAULT_FONT_SIZE || (depth === 0 && rootFontBold)) {
        vo.fontName  = DEFAULT_FONT_NAME;
        vo.fontSize  = size;
        vo.fontStyle = (depth === 0 && rootFontBold) ? "bold" : DEFAULT_FONT_STYLE;
        fontSet++;
      }
    } else if (!settings.fontEnabled && isModify && isContainer && inChain) {
      const wouldHaveSize = Math.max(DEFAULT_FONT_SIZE, rootFontSize - depth * fontDecPerLevel);
      if (wouldHaveSize > DEFAULT_FONT_SIZE || (depth === 0 && rootFontBold)) {
        vo.fontName  = DEFAULT_FONT_NAME;
        vo.fontSize  = DEFAULT_FONT_SIZE;
        vo.fontStyle = DEFAULT_FONT_STYLE;
        fontReset++;
      }
    }

    // Color: each chain uses its depth-0 root container's current fill color as the
    // gradient anchor (darkest). Deeper elements are lightened by depth × lightenPerLevel%.
    // Falls back to settings.rootColor when the root has no fill set.
    // Containers and same-type leaves in the chain are affected.
    if (settings.colorEnabled && inChain) {
      const anchor = anchorColor(vo.id);
      if (anchor) {
        const lightenFactor = depth * (lightenPerLevel / 100);
        vo.fillColor = _lightenHex(anchor, lightenFactor);
        styledVoIds.add(vo.id);
        colorSet++;
      }
    } else if (!settings.colorEnabled && isModify && inChain) {
      vo.fillColor = null;
      colorReset++;
    }
  });

  if (settings.fontEnabled  || fontReset  > 0) console.log(`  nestingLevel font:  ${fontSet} set  ${fontReset} reset`);
  if (settings.colorEnabled || colorReset > 0) console.log(`  nestingLevel color: ${colorSet} set  ${colorReset} reset`);
}

// ── Highlight repeated elements ───────────────────────────────────────────────

/**
 * @param {ArchimateView}                              view
 * @param {Preset["appearance"]["highlightRepeated"]}  settings
 * @param {boolean}                                    isModify
 * @param {Set<string>}                                styledVoIds
 */
function _applyHighlightRepeated(view, settings, isModify, styledVoIds) {
  /** @type {Map<string, VisualObject[]>} */
  const byConceptId = new Map();
  $(view).find("element").each(vo => {
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
    multiIds.forEach(id => { /** @type {VisualObject[]} */ (byConceptId.get(id)).forEach(vo => { vo.fillColor = null; n++; }); });
    console.log(`  highlightRepeated: ${n} VOs reset`);
  }
}

// ── Style by property ─────────────────────────────────────────────────────────

/**
 * Which objects does a style rule reach, and which property values do they get?
 * Pure over model objects, so the dialog's conflict check (predicted view contents) and the
 * writer (objects on the generated view) share one implementation.
 *
 * Rule.color decides what is styled:
 *   element    the element itself, by its own property (type = rule.source)
 *   relation   the relation, by the property of rule.propertyOf (relation / source / target)
 *   source     the source element of every relation matching the rule (model-wide relations),
 *              by the property of rule.propertyOf (element = itself, relation, source, target)
 *   target     the target element likewise
 *
 * @param {StyleRule}       rule       normalised style rule (rel_filter kind "style")
 * @param {ArchiElement[]}  elements   element concepts in scope
 * @param {ArchiRelation[]} relations  relation concepts in scope (used by color = relation)
 * @returns {Map<string, RuleTarget>}  object id → hit; values is empty
 *          when the property is unset on the object(s)
 */
function computeRuleTargets(rule, elements, relations) {
  /** @type {Map<string, RuleTarget>} */
  const out = new Map();
  /** @type {(id: string, kind: RuleTarget["kind"], obj: PropertySource | null | undefined) => void} */
  const hit = (id, kind, obj) => {
    let h = out.get(id);
    if (!h) { h = { kind, values: new Set() }; out.set(id, h); }
    if (!rule.property || !obj) return;
    try {
      const v = obj.prop(rule.property);
      if (v !== null && v !== undefined && v !== "") h.values.add(String(v));
    } catch (e) {}
  };
  const matches = (/** @type {ArchiRelation} */ r) => RuleLists.styleRuleMatchesRelation(rule, r.type, r.source && r.source.type, r.target && r.target.type);
  // Whose property supplies the value: the relation, one of its ends, or (propertyOf "element")
  // the styled element itself.
  /** @type {(r: ArchiRelation, el: ArchiElement | null) => PropertySource} */
  const readFrom = (r, el) => rule.propertyOf === "source" ? r.source
                            : rule.propertyOf === "target" ? r.target
                            : rule.propertyOf === "element" && el ? el : r;

  if (rule.color === "element") {
    for (const el of elements) {
      if (rule.source && el.type !== rule.source) continue;
      hit(el.id, "element", el);
    }
  } else if (rule.color === "relation") {
    for (const r of relations) {
      if (!r.source || !r.target || !matches(r)) continue;
      hit(r.id, "relation", readFrom(r, null));
    }
  } else {
    const wantSource = rule.color === "source";
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
 */
function _applyStyleRules(view, settings, isModify, styledVoIds) {
  const rules = settings.rules || [];
  if (rules.length === 0) return;
  const mixedColor = settings.mixedValuesColor || "#FF6B35";
  const fixedWidth = settings.lineWidth > 0 ? Math.min(3, Math.max(1, settings.lineWidth)) : 0;

  // The objects on the view, by model concept id.
  /** @type {Map<string, VisualObject[]>} */
  const vosByElementId = new Map();
  /** @type {Map<string, ArchiElement>} */
  const elementById = new Map();
  $(view).find("element").each(vo => {
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
  $(view).find("relation").each(vc => {
    if (!vc.concept || !vc.concept.id) return;
    const id = vc.concept.id;
    let vcs = vcsByRelationId.get(id);
    if (!vcs) { vcs = []; vcsByRelationId.set(id, vcs); relationById.set(id, vc.concept); }
    vcs.push(vc);
  });
  const elements  = Array.from(elementById.values());
  const relations = Array.from(relationById.values());

  /** @type {Map<number, Set<string>>} */
  const styledByRule = new Map();     // rule index → Set("element:id" | "relation:id") it colored
  /** @type {Set<string>} */
  const styledVcIds  = new Set();
  /** @type {Map<string, RuleTarget>[]} */
  const inactive     = [];

  rules.forEach((rule, i) => {
    const targets = computeRuleTargets(rule, elements, relations);
    if (rule.on === false) { inactive.push(targets); return; }
    if (!rule.property) return;

    // One value → its colour from the range; several different values → the mixed-values colour.
    const unique = Array.from(new Set(
      Array.from(targets.values()).filter(h => h.values.size === 1).map(h => Array.from(h.values)[0])
    )).sort((a, b) => a.localeCompare(b));
    const colors   = unique.length ? _colorScale(rule.colorRange, unique.length) : [];
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
          styledVcIds.add(vc.id);
        });
      } else {
        (vosByElementId.get(id) || []).forEach(vo => { vo.fillColor = color; styledVoIds.add(vo.id); });
      }
      mine.add(`${h.kind}:${id}`);
      colored++;
    });
    styledByRule.set(i, mine);
    console.log(`  styleByProperty rule ${i + 1}: ${targets.size} matched  ${colored} colored  ${mixed} mixed values  ${unique.length} unique values`);
  });

  // Modify actions: a switched-off rule resets what it would have styled, unless another rule styled it.
  if (isModify) {
    let n = 0;
    inactive.forEach(targets => targets.forEach((h, id) => {
      if (h.kind === "relation") {
        (vcsByRelationId.get(id) || []).forEach(vc => {
          if (styledVcIds.has(vc.id)) return;
          vc.lineColor = null; vc.lineWidth = 1; n++;
        });
      } else {
        (vosByElementId.get(id) || []).forEach(vo => {
          if (styledVoIds.has(vo.id)) return;
          vo.fillColor = null; n++;
        });
      }
    }));
    if (n > 0) console.log(`  styleByProperty: ${n} objects reset (rules switched off)`);
  }

  RuleLists.detectRuleConflicts(styledByRule).forEach(c =>
    console.log(`  ⚠ styleByProperty rule ${c.rule + 1} also styles ${c.count} objects of rule${c.with.length > 1 ? "s" : ""} ${c.with.map(j => j + 1).join(", ")}; the last rule wins`));
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

// Blend hex colour toward white by factor (0 = unchanged, 1 = white).
/**
 * @param {string | null} hex
 * @param {number}        factor
 * @returns {string}
 */
function _lightenHex(hex, factor) {
  return Chroma.mix(hex || "#000000", "#ffffff", Math.max(0, Math.min(1, factor)), "rgb").hex();
}

// ── Module exports ────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyAppearance, computeRuleTargets };
}
