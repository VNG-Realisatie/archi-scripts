/**
 * Appearance pass — post-write visual styling for generated views.
 *
 * Called from generate_view.js after _writeView. Applies fill colours and
 * fonts to VisualElements based on preset.appearance settings.
 *
 * Rule precedence (later overrides earlier for the same VO):
 *   nesting telescope → colour occurrences → colour by property → colour by relation property
 *
 * Reset on disable: when a feature is disabled and the action is layout_only or
 * expand_view, the elements that feature would have styled are reset to Archi defaults
 * (fillColor = null, font = Segoe UI 9 normal).
 */
console.log("Loading appearance.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Chroma = require("chroma-js");
const Defs   = require(REPO_ROOT + "View/lib/defs");
const { decodeRelType } = Defs;

// ColorBrewer scheme names supported by Chroma.js. Exposed so dialog_main.js
// can build the colour-range combos from a single source.
// Qualitative schemes come first — they are discrete, pastel-friendly, and
// designed for readability on light backgrounds. Sequential/diverging schemes
// follow; _colorScale trims their dark end automatically.
const COLOR_RANGES = Object.freeze([
  // Qualitative — distinct pastel tones, no gradient:
  "Pastel1", "Pastel2", "Set2", "Set3",
  // Sequential — light end kept, dark end trimmed in _colorScale:
  "Blues", "Greens", "Oranges", "Purples", "Reds", "Greys",
  // Diverging — light centre; both dark ends trimmed:
  "RdYlBu", "RdYlGn", "Spectral", "OrRd", "PuBu",
]);

// Qualitative schemes are discrete colour sets; padding is meaningless on them.
const QUALITATIVE_COLOR_RANGES = new Set(["Pastel1", "Pastel2", "Set2", "Set3"]);

// Font sizes for nesting telescope (pt). Archi default is Segoe UI 9pt.
// Root containers (depth 0) and depth-1 containers get explicit sizes + bold.
// All other elements are left untouched.
const TELESCOPE_FONT_ROOT   = 14;  // depth 0
const TELESCOPE_FONT_LEVEL1 = 12;  // depth 1

// Archi default font — used when resetting.
const DEFAULT_FONT_NAME  = "Segoe UI";
const DEFAULT_FONT_SIZE  = 9;
const DEFAULT_FONT_STYLE = "normal";

// ── Public API ────────────────────────────────────────────────────────────────

// actionId: "new_view" | "one_each" | "expand_view" | "layout_only"
// Reset-on-disable applies only when actionId is "layout_only" or "expand_view".
function applyAppearance(view, preset, actionId) {
  const app = preset && preset.appearance;
  if (!app) return;

  const isModify = actionId === "layout_only" || actionId === "expand_view";
  const nt  = app.nestingTelescope;
  const co  = app.colorOccurrences;
  const cp  = app.colorByProperty;
  const crp = app.colorByRelationProperty;

  const anyEnabled = nt.fontEnabled || nt.colorEnabled || co.enabled || cp.enabled || crp.enabled;
  if (!anyEnabled && !isModify) return;

  console.log(`\nAppearance (${actionId || "?"})`);
  console.log(`  telescope  font=${nt.fontEnabled}  color=${nt.colorEnabled}  root=${nt.rootColor}  lighten=${nt.lightenAmount}%/level`);
  console.log(`  occurrences  enabled=${co.enabled}  range=${co.colorRange}`);
  console.log(`  byProperty   enabled=${cp.enabled}  type="${cp.elementType||"any"}"  prop="${cp.property}"  range=${cp.colorRange}`);
  console.log(`  byRelProp    enabled=${crp.enabled}  relTypes=[${(crp.relTypes||[]).join(",")}]  prop="${crp.property}"  range=${crp.colorRange}`);

  const depths = _computeViewDepths(view);
  console.log(`  view: ${depths.depthById.size} VOs  maxContainerDepth=${depths.maxContainerDepth}`);

  _applyNestingTelescope(view, nt, depths, isModify);
  _applyColorOccurrences(view, co, isModify);
  _applyColorByProperty(view, cp, isModify);
  _applyColorByRelationProperty(view, crp, isModify);
}

// ── Depth computation ─────────────────────────────────────────────────────────

// Returns { depthById: Map<voId, depth>, isContainerById: Map<voId, bool>, maxContainerDepth }.
// Keyed by VO id (string) — jArchi creates new proxy objects on each find() call,
// so reference equality cannot be used as a Map key.
function _computeViewDepths(view) {
  const depthById       = new Map();
  const isContainerById = new Map();
  let maxContainerDepth = 0;

  $(view).find("element").each(vo => {
    if (!vo.id) return;
    const depth = _voDepth(vo);
    depthById.set(vo.id, depth);
    const isContainer = $(vo).children("element").length > 0;
    isContainerById.set(vo.id, isContainer);
    if (isContainer && depth > maxContainerDepth) maxContainerDepth = depth;
  });

  return { depthById, isContainerById, maxContainerDepth };
}

function _voDepth(vo) {
  let depth = 0;
  let p = $(vo).parent().filter("element").first();
  while (p) { depth++; p = $(p).parent().filter("element").first(); }
  return depth;
}

// ── Nesting telescope ─────────────────────────────────────────────────────────

function _applyNestingTelescope(view, settings, depths, isModify) {
  const { depthById, isContainerById, maxContainerDepth } = depths;
  let fontSet = 0, fontReset = 0, colorSet = 0, colorReset = 0;

  $(view).find("element").each(vo => {
    if (!vo.id) return;
    const depth       = depthById.get(vo.id);
    const isContainer = isContainerById.get(vo.id);
    if (depth === undefined) return;

    // Font: depth 0 = 14pt bold, depth 1 = 12pt bold, everything else untouched.
    // fontStyle valid values (jArchi API): "normal", "bold", "italic", "bolditalic".
    if (settings.fontEnabled && isContainer) {
      if (depth === 0) {
        vo.fontName = DEFAULT_FONT_NAME; vo.fontSize = TELESCOPE_FONT_ROOT;   vo.fontStyle = "bold"; fontSet++;
      } else if (depth === 1) {
        vo.fontName = DEFAULT_FONT_NAME; vo.fontSize = TELESCOPE_FONT_LEVEL1; vo.fontStyle = "bold"; fontSet++;
      }
    } else if (!settings.fontEnabled && isModify && isContainer && (depth === 0 || depth === 1)) {
      vo.fontName = DEFAULT_FONT_NAME; vo.fontSize = DEFAULT_FONT_SIZE; vo.fontStyle = DEFAULT_FONT_STYLE; fontReset++;
    }

    // Colour: root gets rootColor, each level inward is lightenAmount% lighter.
    // Deepest containers (depth === maxContainerDepth) and leaves: untouched.
    if (settings.colorEnabled && isContainer && depth < maxContainerDepth) {
      vo.fillColor = _lightenHex(settings.rootColor, depth * (settings.lightenAmount / 100));
      colorSet++;
    } else if (!settings.colorEnabled && isModify && isContainer && depth < maxContainerDepth) {
      vo.fillColor = null;
      colorReset++;
    }
  });

  if (settings.fontEnabled  || fontReset  > 0) console.log(`  telescope font:  ${fontSet} set  ${fontReset} reset`);
  if (settings.colorEnabled || colorReset > 0) console.log(`  telescope color: ${colorSet} set  ${colorReset} reset`);
}

// ── Colour multiple occurrences ───────────────────────────────────────────────

function _applyColorOccurrences(view, settings, isModify) {
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
    if (multiIds.length === 0) { console.log(`  occurrences: 0 multi-occurrence elements`); return; }
    const colors = _colorScale(settings.colorRange, multiIds.length);
    let n = 0;
    multiIds.forEach((id, i) => { byConceptId.get(id).forEach(vo => { vo.fillColor = colors[i]; n++; }); });
    console.log(`  occurrences: ${n} VOs colored  (${multiIds.length} elements  range=${settings.colorRange})`);
  } else if (isModify && settings.colorRange && multiIds.length > 0) {
    // Only reset if a colorRange was configured — implies the feature was previously active.
    let n = 0;
    multiIds.forEach(id => { byConceptId.get(id).forEach(vo => { vo.fillColor = null; n++; }); });
    console.log(`  occurrences: ${n} VOs reset`);
  }
}

// ── Colour by element property ────────────────────────────────────────────────

function _applyColorByProperty(view, settings, isModify) {
  // Nothing configured (no property) — nothing was ever applied, nothing to reset.
  if (!settings.property) return;
  if (!settings.enabled && !isModify) return;

  // Collect VOs matching the element type filter.
  // Use vo.type (delegates to concept type, e.g. "application-component") and
  // vo.prop(key) (confirmed working on visual proxies by colorByProperty.ajs).
  const vos = [];
  $(view).find("element").each(vo => {
    if (settings.elementType && vo.type !== settings.elementType) return;
    vos.push(vo);
  });
  console.log(`  byProperty: ${vos.length} VOs match type "${settings.elementType||"any"}"`);

  if (!settings.enabled) {
    if (isModify && vos.length > 0) {
      // Only reset VOs that actually had the property — don't wipe colours set by other features.
      let n = 0;
      vos.forEach(vo => {
        const val = vo.prop(settings.property);
        if (val !== null && val !== undefined && val !== "") { vo.fillColor = null; n++; }
      });
      if (n > 0) console.log(`  byProperty: ${n} VOs reset`);
    }
    return;
  }
  if (vos.length === 0)   { console.log(`  byProperty: no matching elements on view — skipped`); return; }

  const valueSet = new Set();
  vos.forEach(vo => {
    const val = vo.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") valueSet.add(String(val));
  });
  const uniqueValues = Array.from(valueSet).sort((a, b) => a.localeCompare(b));
  console.log(`  byProperty: "${settings.property}" — ${uniqueValues.length} unique values: [${uniqueValues.join(", ")}]`);

  if (uniqueValues.length === 0) return;

  const colors   = _colorScale(settings.colorRange, uniqueValues.length);
  const colorMap = {};
  uniqueValues.forEach((val, i) => { colorMap[val] = colors[i]; });

  let n = 0;
  vos.forEach(vo => {
    const val = vo.prop(settings.property);
    if (val !== null && val !== undefined && val !== "") { vo.fillColor = colorMap[String(val)]; n++; }
  });
  console.log(`  byProperty: ${n} VOs colored  range=${settings.colorRange}`);
}

// ── Colour element by relation property ──────────────────────────────────────

function _applyColorByRelationProperty(view, settings, isModify) {
  if (!settings.enabled && !isModify) return;

  const vosByConceptId = new Map();
  $(view).find("element").each(vo => {
    if (!vo.concept) return;
    const id = vo.concept.id;
    if (!vosByConceptId.has(id)) vosByConceptId.set(id, []);
    vosByConceptId.get(id).push(vo);
  });

  if (!settings.property || !settings.relTypes || settings.relTypes.length === 0) {
    // Nothing configured: nothing was ever applied, nothing to reset.
    return;
  }

  if (!settings.enabled) {
    // Run the match logic to identify exactly which elements to reset —
    // avoids wiping colours set by other features that run after this one.
    const relFilters = settings.relTypes.map(enc => decodeRelType(enc));
    const toReset = new Map();
    vosByConceptId.forEach((_, conceptId) => {
      const el = model.getElementById(conceptId);
      if (!el) return;
      try {
        $(el).rels().each(rel => {
          const isOut = rel.source && rel.source.id === conceptId;
          if (!_matchesRelDir(rel.type, isOut, relFilters)) return;
          const propVal = rel.prop(settings.property);
          if (propVal !== null && propVal !== undefined && propVal !== "")
            toReset.set(conceptId, true);
        });
      } catch (e) {}
    });
    if (isModify && toReset.size > 0) {
      let n = 0;
      toReset.forEach((_, id) => { const vos = vosByConceptId.get(id); if (vos) vos.forEach(vo => { vo.fillColor = null; n++; }); });
      console.log(`  byRelProp: ${n} VOs reset`);
    }
    return;
  }

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
      console.log(`  byRelProp: error reading relations for ${conceptId}: ${e}`);
    }
  });

  console.log(`  byRelProp: ${elementPropValue.size} elements matched  prop="${settings.property}"`);
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
  console.log(`  byRelProp: ${n} VOs colored  ${uniqueValues.length} unique values  range=${settings.colorRange}`);
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
  hex = hex.replace(/^#/, "");
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
  module.exports = { applyAppearance, COLOR_RANGES };
}
