/**
 * Rule lists — one filter model for the whole View subsystem.
 *
 * A rule list is an array of rules. Rules combine as: a match with any active Include rule is
 * kept, unless an active Exclude rule also matches. Order has no meaning (Appearance style
 * rules are the exception: the later rule wins when two styles hit the same object).
 *
 * Rule kinds (field → meaning; "" = All):
 *   element   { mode, elementType, property, value }                      global element filter
 *   diagram   { mode, diagramType }                                       global diagram filter
 *   relation  { on, mode, source, relation, target,                       global relation filter, nesting, reverse
 *               propertyOf, property, value }
 *   step      { mode, previous, direction, relation, added,               expand-selection step
 *               propertyOf, property, value }
 *   style     { on, color, source, relation, target, propertyOf,          Appearance › Style by property
 *               property, colorRange }
 *
 * Empty list: filter lists (global, step) keep everything (emptyMeansAll); feature lists (nesting,
 * reverse, style) select nothing.
 *
 * This module is pure: no Archi, no Java. Type ids are validated against sets the caller passes
 * in (see defs.validatePreset), so it does not depend on defs.js.
 */
console.log("Loading rel_filter.js");

const MODES       = Object.freeze(["include", "exclude"]);
const DIRECTIONS  = Object.freeze(["either", "outgoing", "incoming"]);
const STEP_PROP_OF  = Object.freeze(["added", "relation", "previous"]);
const STYLE_COLOR   = Object.freeze(["element", "relation", "source", "target"]);
const STYLE_PROP_OF = Object.freeze(["element", "relation", "source", "target"]);
const REL_PROP_OF   = Object.freeze(["relation", "source", "target"]);

// kind → { defaults, types: field → valid-set name, enums: field → allowed values }
const KINDS = Object.freeze({
  element: {
    defaults: { mode: "include", elementType: "", property: "", value: "" },
    types:    { elementType: "elements" },
    enums:    { mode: MODES },
  },
  diagram: {
    defaults: { mode: "include", diagramType: "" },
    types:    { diagramType: "diagrams" },
    enums:    { mode: MODES },
  },
  relation: {
    defaults: { on: true, mode: "include", source: "", relation: "", target: "",
                propertyOf: "relation", property: "", value: "" },
    types:    { source: "elements", relation: "relations", target: "elements" },
    enums:    { mode: MODES, propertyOf: REL_PROP_OF },
  },
  step: {
    defaults: { mode: "include", previous: "", direction: "either", relation: "", added: "",
                propertyOf: "added", property: "", value: "" },
    types:    { previous: "elements", relation: "relations", added: "elements" },
    enums:    { mode: MODES, direction: DIRECTIONS, propertyOf: STEP_PROP_OF },
  },
  style: {
    defaults: { on: true, color: "element", source: "", relation: "", target: "",
                propertyOf: "element", property: "", colorRange: "Blues" },
    types:    { source: "elements", relation: "relations", target: "elements" },
    enums:    { color: STYLE_COLOR, propertyOf: STYLE_PROP_OF },
  },
});

// ── Normalise / serialise ─────────────────────────────────────────────────────

/** The default (empty) rule of a kind: matches everything. */
function defaultRule(kind) {
  return Object.assign({}, KINDS[kind].defaults);
}

/**
 * Normalise one raw rule. Returns the full rule, or null (with a console warning) when the rule
 * is unusable. An unknown key, enum value or type id rejects the rule: a typo must never widen
 * the filter to "All".
 * @param {string} kind
 * @param {*}      raw
 * @param {{elements:Set, relations:Set, diagrams:Set, colorRanges:Set}} valid
 * @param {string} where  e.g. "filter.relationRules[2]", for the warning
 */
function normalizeRule(kind, raw, valid, where) {
  const K = KINDS[kind];
  const bad = msg => { console.log(`Warning: ${where}: ${msg}; rule skipped.`); return null; };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("not an object");

  const out = Object.assign({}, K.defaults);
  for (const [key, val] of Object.entries(raw)) {
    if (!(key in K.defaults)) return bad(`unknown key "${key}"`);
    if (key === "on") {
      if (typeof val !== "boolean") return bad(`"on" must be true or false`);
      out.on = val;
    } else if (key in K.types) {
      const s = String(val);
      if (s !== "" && !valid[K.types[key]].has(s)) return bad(`unknown ${key} "${s}"`);
      out[key] = s;
    } else if (K.enums[key]) {
      if (!K.enums[key].includes(val)) return bad(`${key} must be one of ${K.enums[key].join(", ")}`);
      out[key] = val;
    } else if (key === "colorRange") {
      if (!valid.colorRanges.has(String(val))) return bad(`unknown colorRange "${val}"`);
      out.colorRange = String(val);
    } else {
      out[key] = val === undefined || val === null ? "" : String(val);   // property, value
    }
  }
  return out;
}

/** Normalise a raw list; unusable rules are dropped with a warning. A non-array gives []. */
function normalizeRules(kind, raw, valid, where) {
  if (!Array.isArray(raw)) return [];
  return raw.map((r, i) => normalizeRule(kind, r, valid, `${where}[${i}]`)).filter(Boolean);
}

/** A rule as written to a preset file: keys equal to the default are omitted. */
function serializeRule(kind, rule) {
  const d = KINDS[kind].defaults;
  const out = {};
  for (const key of Object.keys(d)) {
    if (rule[key] !== undefined && rule[key] !== d[key]) out[key] = rule[key];
  }
  // A style rule with only defaults would serialise to {}; colour range is always informative.
  if (kind === "style" && out.colorRange === undefined) out.colorRange = rule.colorRange || d.colorRange;
  return out;
}

/** True when a filter list is just the default rule (or empty): it filters nothing. */
function isPassAll(kind, rules) {
  if (!rules || rules.length === 0) return true;
  const d = KINDS[kind].defaults;
  return rules.length === 1 && Object.keys(d).every(k => rules[0][k] === d[k]);
}

// ── Matching ──────────────────────────────────────────────────────────────────

const _typeOk = (want, actual) => want === "" || want === undefined || want === actual;

function _propOf(obj, key) {
  if (!obj || typeof obj.prop !== "function") return undefined;
  try { const v = obj.prop(key); return v === null || v === undefined ? "" : String(v); }
  catch (e) { return undefined; }
}

function _propOk(rule, obj) {
  if (!rule.property) return true;
  return _propOf(obj, rule.property) === String(rule.value || "");
}

/**
 * Evaluate a rule list with a per-rule test. Exclude rules veto; with no active Include rule
 * the list keeps everything (filter lists) or nothing (feature lists).
 * @param {Object[]} rules
 * @param {(rule:Object)=>boolean} test
 * @param {boolean} emptyMeansAll
 */
function evalRules(rules, test, emptyMeansAll) {
  let hasInclude = false, included = false;
  for (const r of rules) {
    if (r.on === false) continue;
    if (r.mode === "exclude") { if (test(r)) return false; }
    else { hasInclude = true; if (!included && test(r)) included = true; }
  }
  return hasInclude ? included : !!emptyMeansAll;
}

/** Global element filter: does this element pass? Empty list keeps everything. */
function matchElement(rules, el) {
  return evalRules(rules, r => _typeOk(r.elementType, el.type) && _propOk(r, el), true);
}

/** Global diagram filter: does this diagram object type pass? Empty list keeps everything. */
function matchDiagram(rules, type) {
  return evalRules(rules, r => _typeOk(r.diagramType, type), true);
}

/** The object a relation rule's property is read from: the relation, its source or its target. */
function relationPropObject(rule, rel) {
  if (!rel) return undefined;
  return rule.propertyOf === "source" ? rel.source : rule.propertyOf === "target" ? rel.target : rel;
}

/**
 * Source / relation / target match, plus the property condition when `rel` (the relation
 * object) is given — without it a rule with a property never matches. Filter lists pass
 * emptyMeansAll=true (global relation filter); feature lists (nesting, reverse) pass false.
 */
function matchRelation(rules, relType, srcType, tgtType, emptyMeansAll, rel) {
  return evalRules(rules, r =>
    _typeOk(r.relation, relType) && _typeOk(r.source, srcType) && _typeOk(r.target, tgtType) &&
    _propOk(r, relationPropObject(r, rel)),
    emptyMeansAll);
}

/**
 * Step candidate: one relation seen from one element of the previous step.
 * @typedef {{rel:Object, frontier:Object, other:Object, outgoing:boolean}} StepCandidate
 *   outgoing = the previous-step element is the relation's source.
 */
function _stepRuleMatches(r, c) {
  if (r.direction === "outgoing" && !c.outgoing) return false;
  if (r.direction === "incoming" &&  c.outgoing) return false;
  if (!_typeOk(r.relation, c.rel.type))      return false;
  if (!_typeOk(r.previous, c.frontier.type)) return false;
  if (!_typeOk(r.added,    c.other.type))    return false;
  if (!r.property) return true;
  const target = r.propertyOf === "relation" ? c.rel : r.propertyOf === "previous" ? c.frontier : c.other;
  return _propOf(target, r.property) === String(r.value || "");
}

/** Does a step's rule list let this candidate through? Empty list follows everything. */
function matchStep(rules, cand) {
  return evalRules(rules, r => _stepRuleMatches(r, cand), true);
}

/** One step rule, relation level: relation type, direction and previous-step type. */
function _stepRuleMatchesRelation(r, c) {
  if (r.direction === "outgoing" && !c.outgoing) return false;
  if (r.direction === "incoming" &&  c.outgoing) return false;
  return _typeOk(r.relation, c.rel.type) && _typeOk(r.previous, c.frontier.type);
}

/**
 * Relation collection for a step: which relations between the step's elements are drawn.
 * An Include rule matches on relation type, direction and previous-step type only, so a
 * relation to an element that was already selected is kept whatever its type (the Added
 * element type and the property condition only decide which elements the step adds). An
 * Exclude rule matches in full. Empty list keeps everything.
 */
function matchStepRelation(rules, cand) {
  return evalRules(rules, r => r.mode === "exclude" ? _stepRuleMatches(r, cand) : _stepRuleMatchesRelation(r, cand), true);
}

// ── Style rules ───────────────────────────────────────────────────────────────

/** Does a style rule's relation pattern match this relation? (types only; the property comes later) */
function styleRuleMatchesRelation(r, relType, srcType, tgtType) {
  return _typeOk(r.relation, relType) && _typeOk(r.source, srcType) && _typeOk(r.target, tgtType);
}

/**
 * Rules that style the same object. `styled` maps rule index → Set of object ids the rule styles.
 * Returns one entry per rule index that overlaps another: { rule, with: [indexes], count }.
 * Pure helper behind the ⚠ column and the console warning.
 */
function detectRuleConflicts(styled) {
  const idx = Array.from(styled.keys());
  const out = [];
  for (const i of idx) {
    const overlap = new Set(), others = [];
    for (const j of idx) {
      if (j === i) continue;
      let hit = false;
      for (const id of styled.get(i)) if (styled.get(j).has(id)) { overlap.add(id); hit = true; }
      if (hit) others.push(j);
    }
    if (others.length) out.push({ rule: i, with: others, count: overlap.size });
  }
  return out;
}

// ── Preset files ────────────────────────────────────────────────────────────────

// Where rule lists live in a preset: [path, kind, filter list (empty = all)].
const PRESET_RULE_LISTS = Object.freeze([
  [["params", "nestingRules"],                 "relation", false],
  [["params", "reverseRules"],                 "relation", false],
  [["filter", "elementRules"],                 "element",  true],
  [["filter", "diagramRules"],                 "diagram",  true],
  [["filter", "relationRules"],                "relation", true],
  [["appearance", "styleByProperty", "rules"], "style",    false],
]);
const INLINE_KEYS = new Set(["nestingRules", "reverseRules", "elementRules", "diagramRules", "relationRules", "rules"]);

function _compactList(kind, list, isFilter) {
  if (!Array.isArray(list)) return list;
  if (isFilter && isPassAll(kind, list)) return [];
  return list.map(r => serializeRule(kind, r));
}

/** Deep copy of a preset with every rule list in file form (defaults omitted, pass-all filters → []). */
function compactPreset(preset) {
  const c = JSON.parse(JSON.stringify(preset));
  for (const [pathKeys, kind, isFilter] of PRESET_RULE_LISTS) {
    let o = c;
    for (const k of pathKeys.slice(0, -1)) o = o && o[k];
    const last = pathKeys[pathKeys.length - 1];
    if (o && last in o) o[last] = _compactList(kind, o[last], isFilter);
  }
  const steps = c.relatedElements && c.relatedElements.steps;
  if (Array.isArray(steps)) steps.forEach(st => { if (st && "rules" in st) st.rules = _compactList("step", st.rules, true); });
  return c;
}

function _inline(obj) {
  const keys = Object.keys(obj);
  return keys.length ? "{" + keys.map(k => `${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(", ") + "}" : "{}";
}

/**
 * Preset JSON as written to presets/: two-space indent, every rule on one line, so a
 * step with 18 rules stays 18 lines and a git diff shows one changed rule as one line.
 */
function stringifyPreset(preset) {
  const write = (v, indent, key) => {
    if (Array.isArray(v)) {
      if (v.length === 0) return "[]";
      const inner = indent + "  ";
      const items = INLINE_KEYS.has(key) && v.every(x => x && typeof x === "object" && !Array.isArray(x))
        ? v.map(x => inner + _inline(x))
        : v.map(x => inner + write(x, inner, ""));
      return "[\n" + items.join(",\n") + "\n" + indent + "]";
    }
    if (v && typeof v === "object") {
      const keys = Object.keys(v);
      if (keys.length === 0) return "{}";
      const inner = indent + "  ";
      return "{\n" + keys.map(k => `${inner}${JSON.stringify(k)}: ${write(v[k], inner, k)}`).join(",\n") + "\n" + indent + "}";
    }
    return JSON.stringify(v);
  };
  return write(compactPreset(preset), "", "") + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MODES, DIRECTIONS, STEP_PROP_OF, STYLE_COLOR, STYLE_PROP_OF, REL_PROP_OF, KINDS,
    defaultRule, normalizeRule, normalizeRules, serializeRule, isPassAll,
    evalRules, matchElement, matchDiagram, matchRelation, relationPropObject, matchStep, matchStepRelation,
    styleRuleMatchesRelation, detectRuleConflicts,
    compactPreset, stringifyPreset,
  };
}
