/**
 * Appearance pass — post-write visual styling for generated views.
 *
 * Called from generate_view.js after _writeView. Applies fill colours, fonts,
 * and line widths to VisualElements/VisualConnections based on preset.appearance.
 *
 * Rule precedence (later overrides earlier for the same VO):
 *   nestingLevel → highlightRepeated → styleByProperty → styleByRelatedProperty → styleByConnectedElement
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
const Defs   = require(REPO_ROOT + "View/lib/defs");
const { decodeRelType, COLOR_RANGES } = Defs;

// Qualitative schemes are discrete colour sets; padding is meaningless on them.
const QUALITATIVE_COLOR_RANGES = new Set(["Pastel1", "Pastel2", "Set2", "Set3"]);

// Archi default font — used when resetting.
const DEFAULT_FONT_NAME  = "Segoe UI";
const DEFAULT_FONT_SIZE  = 9;
const DEFAULT_FONT_STYLE = "normal";

// ── Public API ────────────────────────────────────────────────────────────────

// actionId: "new_view" | "one_each" | "expand_view" | "layout_only"
// Reset-on-disable applies only when actionId is "layout_only" or "expand_view".
function applyAppearance(view, preset, actionId) {
  const app  = preset.appearance;
  const isModify = actionId === "layout_only" || actionId === "expand_view";
  const nl   = app.nestingLevel;
  const hr   = app.highlightRepeated;
  const sbp  = app.styleByProperty;
  const sbpe = sbp.element;
  const sbpr = sbp.relation;
  const sbrp = app.styleByRelatedProperty;
  const sbce = app.styleByConnectedElement;

  const anyEnabled =
    nl.fontEnabled || nl.colorEnabled || hr.enabled ||
    (sbpe.enabled && sbpe.property) ||
    (sbpr.enabled && sbpr.property) ||
    (sbrp.enabled && sbrp.property) ||
    (sbce.enabled && sbce.property);

  if (!anyEnabled && !isModify) return;

  console.log(`\nAppearance (${actionId || "?"})`);
  const hasNestingTypes = preset.params.nestingRelationTypes.length > 0;
  if ((nl.fontEnabled || nl.colorEnabled) && hasNestingTypes)
    console.log(`  nestingLevel  font=${nl.fontEnabled}  color=${nl.colorEnabled}  rootColor=${nl.rootColor}  darken=${nl.darkenPerLevel}%/level`);
  if (hr.enabled)
    console.log(`  highlightRepeated  range=${hr.colorRange}`);
  if (sbpe.enabled && sbpe.property)
    console.log(`  styleByProperty.element  prop="${sbpe.property}"  type="${sbpe.elementType||"any"}"  range=${sbpe.colorRange}`);
  if (sbpr.enabled && sbpr.property)
    console.log(`  styleByProperty.relation  prop="${sbpr.property}"  resize=${sbpr.resize}  range=${sbpr.colorRange}`);
  if (sbrp.enabled && sbrp.property)
    console.log(`  styleByRelatedProperty  prop="${sbrp.property}"  relTypes=[${sbrp.relTypes.join(",")}]  range=${sbrp.colorRange}`);
  if (sbce.enabled && sbce.property)
    console.log(`  styleByConnectedElement  prop="${sbce.property}"  relTypes=[${sbce.relTypes.join(",")}]  range=${sbce.colorRange}`);

  const depths = _computeViewDepths(view);
  console.log(`  view: ${depths.depthById.size} VOs  maxContainerDepth=${depths.maxContainerDepth}`);

  _applyNestingLevel(view, nl, depths, isModify);
  _applyHighlightRepeated(view, hr, isModify);
  _applyStyleByProperty(view, sbpe, sbpr, isModify);
  _applyStyleByRelatedProperty(view, sbrp, isModify);
  _applyStyleByConnectedElement(view, sbce, isModify);
}

// ── Depth computation ─────────────────────────────────────────────────────────

// Returns { depthById, isContainerById, inSameTypeChainById, maxContainerDepth }.
// All maps are keyed by VO id (string) — jArchi creates new proxy objects on each
// find() call, so reference equality cannot be used as a Map key.
//
// inSameTypeChainById — true when a container is in an unbroken same-element-type
// chain from its depth-0 root ancestor (see "Type chain rule" in ARCHITECTURE.md).
function _computeViewDepths(view) {
  const depthById       = new Map();
  const isContainerById = new Map();
  const parentIdById    = new Map();  // voId → parent voId | null
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

  // Compute inSameTypeChainById top-down (shallowest first).
  // A container is in the chain iff its element type equals that of its depth-0 root
  // ancestor AND every ancestor between them is also in the chain.
  // Stops propagating as soon as a type mismatch is encountered ("stop the tree").
  const inSameTypeChainById = new Map();
  const byDepth = [...depthById.entries()].sort((a, b) => a[1] - b[1]);
  for (const [voId, depth] of byDepth) {
    if (!isContainerById.get(voId)) { inSameTypeChainById.set(voId, false); continue; }
    if (depth === 0)                { inSameTypeChainById.set(voId, true);  continue; }
    const parentId      = parentIdById.get(voId);
    if (!parentId)                  { inSameTypeChainById.set(voId, true);  continue; }
    const parentInChain = inSameTypeChainById.get(parentId) === true;
    const voType        = elementTypeById.get(voId);
    const parentType    = elementTypeById.get(parentId);
    inSameTypeChainById.set(voId, parentInChain && !!(voType && voType === parentType));
  }

  return { depthById, isContainerById, inSameTypeChainById, maxContainerDepth };
}

function _voDepth(vo) {
  let depth = 0;
  let p = $(vo).parent().filter("element").first();
  while (p) { depth++; p = $(p).parent().filter("element").first(); }
  return depth;
}

// ── Style by nesting level ────────────────────────────────────────────────────

function _applyNestingLevel(view, settings, depths, isModify) {
  const { depthById, isContainerById, inSameTypeChainById, maxContainerDepth } = depths;
  let fontSet = 0, fontReset = 0, colorSet = 0, colorReset = 0;

  const rootFontSize       = settings.rootFontSize        !== undefined ? settings.rootFontSize        : 14;
  const rootFontBold       = settings.rootFontBold        !== undefined ? settings.rootFontBold        : true;
  const fontDecPerLevel    = settings.fontDecreasePerLevel !== undefined ? settings.fontDecreasePerLevel : 2;
  const darkenPerLevel     = settings.darkenPerLevel       !== undefined ? settings.darkenPerLevel       : 15;

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

    // Color: root (depth 0) gets rootColor unchanged (lightenFactor = 0 = darkest).
    // Each level deeper is progressively lighter (rootColor lightened by depth * darkenPerLevel%).
    // Deepest containers (depth === maxContainerDepth) and leaves: untouched.
    // Only containers in the same-type chain from their root ancestor are affected.
    if (settings.colorEnabled && isContainer && inChain && depth < maxContainerDepth) {
      const lightenFactor = depth * (darkenPerLevel / 100);
      vo.fillColor = _lightenHex(settings.rootColor || "#2B5796", lightenFactor);
      colorSet++;
    } else if (!settings.colorEnabled && isModify && isContainer && inChain && depth < maxContainerDepth) {
      vo.fillColor = null;
      colorReset++;
    }
  });

  if (settings.fontEnabled  || fontReset  > 0) console.log(`  nestingLevel font:  ${fontSet} set  ${fontReset} reset`);
  if (settings.colorEnabled || colorReset > 0) console.log(`  nestingLevel color: ${colorSet} set  ${colorReset} reset`);
}

// ── Highlight repeated elements ───────────────────────────────────────────────

function _applyHighlightRepeated(view, settings, isModify) {
  const byConceptId = new Map();
  $(view).find("element").each(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    if (!byConceptId.has(id)) byConceptId.set(id, []);
    byConceptId.get(id).push(vo);
  });

  const multiIds = [];
  byConceptId.forEach((vos, id) => { if (vos.length > 1) multiIds.push(id); });

  if (settings.enabled) {
    if (multiIds.length === 0) { console.log(`  highlightRepeated: 0 multi-occurrence elements`); return; }
    const colors = _colorScale(settings.colorRange, multiIds.length);
    let n = 0;
    multiIds.forEach((id, i) => { byConceptId.get(id).forEach(vo => { vo.fillColor = colors[i]; n++; }); });
    console.log(`  highlightRepeated: ${n} VOs colored  (${multiIds.length} elements  range=${settings.colorRange})`);
  } else if (isModify && settings.colorRange && multiIds.length > 0) {
    let n = 0;
    multiIds.forEach(id => { byConceptId.get(id).forEach(vo => { vo.fillColor = null; n++; }); });
    console.log(`  highlightRepeated: ${n} VOs reset`);
  }
}

// ── Style by property ─────────────────────────────────────────────────────────

function _applyStyleByProperty(view, elemSettings, relSettings, isModify) {
  _applyStyleByPropertyElement(view, elemSettings, isModify);
  _applyStyleByPropertyRelation(view, relSettings, isModify);
}

function _applyStyleByPropertyElement(view, settings, isModify) {
  if (!settings.enabled || !settings.property) return;

  const vos = [];
  $(view).find("element").each(vo => {
    if (settings.elementType && vo.type !== settings.elementType) return;
    vos.push(vo);
  });
  console.log(`  styleByProperty.element: ${vos.length} VOs match type "${settings.elementType||"any"}"`);


  const valueSet = new Set();
  vos.forEach(vo => {
    const val = vo.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") valueSet.add(String(val));
  });
  const uniqueValues = Array.from(valueSet).sort((a, b) => a.localeCompare(b));
  console.log(`  styleByProperty.element: "${settings.property}" — ${uniqueValues.length} unique values: [${uniqueValues.join(", ")}]`);

  if (uniqueValues.length === 0) return;

  const colors   = _colorScale(settings.colorRange, uniqueValues.length);
  const colorMap = {};
  uniqueValues.forEach((val, i) => { colorMap[val] = colors[i]; });

  let n = 0;
  vos.forEach(vo => {
    const val = vo.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") { vo.fillColor = colorMap[String(val)]; n++; }
  });
  console.log(`  styleByProperty.element: ${n} VOs colored  range=${settings.colorRange}`);
}

function _applyStyleByPropertyRelation(view, settings, isModify) {
  if (!settings.enabled || !settings.property) return;

  // Collect matching visual connections
  const relFilters = settings.relTypes.map(enc => decodeRelType(enc));
  const vos = [];
  $(view).find("relation").each(vc => {
    if (!vc.type) return;
    // If relTypes empty → match all; otherwise filter by type
    if (relFilters.length > 0 && !relFilters.some(f => f.type === vc.type)) return;
    vos.push(vc);
  });
  console.log(`  styleByProperty.relation: ${vos.length} connections match`);

  if (vos.length === 0) return;

  const valueSet = new Set();
  vos.forEach(vc => {
    const val = vc.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") valueSet.add(String(val));
  });
  const uniqueValues = Array.from(valueSet).sort((a, b) => a.localeCompare(b));
  if (uniqueValues.length === 0) return;

  const colors   = _colorScale(settings.colorRange, uniqueValues.length);
  const colorMap = {};
  uniqueValues.forEach((val, i) => { colorMap[val] = colors[i]; });

  const fixedWidth = (settings.lineWidth > 0) ? Math.min(3, Math.max(1, settings.lineWidth)) : 0;

  let n = 0;
  vos.forEach(vc => {
    const val = vc.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") {
      vc.lineColor = colorMap[String(val)];
      if (fixedWidth > 0) vc.lineWidth = fixedWidth;
      n++;
    }
  });
  console.log(`  styleByProperty.relation: ${n} connections colored  lineWidth=${fixedWidth || "no change"}  range=${settings.colorRange}`);
}

// ── Style by related property ─────────────────────────────────────────────────

function _applyStyleByRelatedProperty(view, settings, isModify) {
  if (!settings.enabled || !settings.property) return;
  if (!settings.relTypes || settings.relTypes.length === 0) return;

  const vosByConceptId = new Map();
  $(view).find("element").each(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    if (!vosByConceptId.has(id)) vosByConceptId.set(id, []);
    vosByConceptId.get(id).push(vo);
  });


  const relFilters = settings.relTypes.map(enc => decodeRelType(enc));
  const elementPropValue = new Map();

  vosByConceptId.forEach((_, conceptId) => {
    const el = model.getElementById(conceptId);
    if (!el) return;
    try {
      $(el).rels().each(rel => {
        const isOut = rel.source && rel.source.id === conceptId;
        if (!_matchesRelDir(rel.type, isOut, relFilters)) return;
        const propVal = rel.prop(settings.property);
        if (propVal !== null && propVal !== undefined && propVal !== "") {
          elementPropValue.set(conceptId, String(propVal));
        }
      });
    } catch (e) {
      console.log(`  styleByRelatedProperty: error reading relations for ${conceptId}: ${e}`);
    }
  });

  console.log(`  styleByRelatedProperty: ${elementPropValue.size} elements matched  prop="${settings.property}"`);
  if (elementPropValue.size === 0) return;

  const uniqueValues = Array.from(new Set(elementPropValue.values())).sort((a, b) => a.localeCompare(b));
  const colors   = _colorScale(settings.colorRange, uniqueValues.length);
  const colorMap = {};
  uniqueValues.forEach((val, i) => { colorMap[val] = colors[i]; });

  let n = 0;
  elementPropValue.forEach((val, conceptId) => {
    const vos = vosByConceptId.get(conceptId);
    if (vos) { vos.forEach(vo => { vo.fillColor = colorMap[val]; n++; }); }
  });
  console.log(`  styleByRelatedProperty: ${n} VOs colored  ${uniqueValues.length} unique values  range=${settings.colorRange}`);
}

// ── Style by connected element ────────────────────────────────────────────────

function _applyStyleByConnectedElement(view, settings, isModify) {
  if (!settings.enabled || !settings.property) return;

  const relFilters   = settings.relTypes.map(enc => decodeRelType(enc));
  const targetType   = settings.elementType || "";  // "" = any
  const conflictColor = settings.conflictColor || "#FF6B35";

  // Build a map: viewElement conceptId → visual element VOs
  const vosByConceptId = new Map();
  $(view).find("element").each(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    if (!vosByConceptId.has(id)) vosByConceptId.set(id, []);
    vosByConceptId.get(id).push(vo);
  });

  // For each source concept, find connected target concepts via matching relations
  const sourcePropValue = new Map(); // conceptId → propValue | "__conflict__"

  vosByConceptId.forEach((_, conceptId) => {
    const el = model.getElementById(conceptId);
    if (!el) return;

    const targets = new Set(); // unique target concept IDs whose property we'll read
    try {
      $(el).rels().each(rel => {
        const isOut = rel.source && rel.source.id === conceptId;
        if (relFilters.length > 0 && !_matchesRelDir(rel.type, isOut, relFilters)) return;
        // The "other end" of the relation
        const otherId = isOut
          ? (rel.target && rel.target.id)
          : (rel.source && rel.source.id);
        if (!otherId || otherId === conceptId) return;
        const other = model.getElementById(otherId);
        if (!other) return;
        if (targetType && other.type !== targetType) return;
        targets.add(otherId);
      });
    } catch (e) {
      console.log(`  styleByConnectedElement: error reading relations for ${conceptId}: ${e}`);
    }

    if (targets.size === 0) return;
    if (targets.size > 1) {
      sourcePropValue.set(conceptId, "__conflict__");
      return;
    }

    // Exactly one target
    const targetId = Array.from(targets)[0];
    const target   = model.getElementById(targetId);
    if (!target) return;
    try {
      const val = target.prop(settings.property);
      if (val !== null && val !== undefined && val !== "") {
        sourcePropValue.set(conceptId, String(val));
      }
    } catch (e) {}
  });

  console.log(`  styleByConnectedElement: ${sourcePropValue.size} source elements matched  prop="${settings.property}"`);
  if (sourcePropValue.size === 0) return;

  // Build color scale from non-conflict values
  const uniqueValues = Array.from(
    new Set(Array.from(sourcePropValue.values()).filter(v => v !== "__conflict__"))
  ).sort((a, b) => a.localeCompare(b));

  const colors   = _colorScale(settings.colorRange, Math.max(1, uniqueValues.length));
  const colorMap = {};
  uniqueValues.forEach((val, i) => { colorMap[val] = colors[i]; });

  let n = 0, conflicts = 0;
  sourcePropValue.forEach((val, conceptId) => {
    const vos = vosByConceptId.get(conceptId);
    if (!vos) return;
    if (val === "__conflict__") {
      vos.forEach(vo => { vo.fillColor = conflictColor; conflicts++; });
    } else {
      vos.forEach(vo => { vo.fillColor = colorMap[val]; n++; });
    }
  });
  console.log(`  styleByConnectedElement: ${n} VOs colored  ${conflicts} conflicts  range=${settings.colorRange}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _matchesRelDir(relType, isOut, relFilters) {
  return relFilters.some(f => {
    if (f.type !== relType) return false;
    if (f.inSel && f.outSel) return true;
    if (f.outSel && isOut)   return true;
    if (f.inSel  && !isOut)  return true;
    return false;
  });
}

// Build a Chroma colour scale and return n evenly spaced hex strings.
// Qualitative schemes (Pastel1, Set2, …) are discrete — no padding.
// Sequential/diverging schemes trim their dark end with padding([0.1, 0.4])
// to keep colours in the light-to-medium range readable on light backgrounds.
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
function _lightenHex(hex, factor) {
  hex = (hex || "#000000").replace(/^#/, "");
  if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
  const r = parseInt(hex.substring(0, 2), 16) || 0;
  const g = parseInt(hex.substring(2, 4), 16) || 0;
  const b = parseInt(hex.substring(4, 6), 16) || 0;
  factor = Math.max(0, Math.min(1, factor));
  const nr = Math.round(r + (255 - r) * factor);
  const ng = Math.round(g + (255 - g) * factor);
  const nb = Math.round(b + (255 - b) * factor);
  return "#" + nr.toString(16).padStart(2, "0")
             + ng.toString(16).padStart(2, "0")
             + nb.toString(16).padStart(2, "0");
}

// ── Module exports ────────────────────────────────────────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { applyAppearance };
}
