/**
 * Condition lists — one filter model for the whole View subsystem.
 *
 * A condition list is an array of conditions. Conditions combine as: a match with any active Include condition is
 * kept, unless an active Exclude condition also matches. Order has no meaning (Appearance style
 * conditions are the exception: the later condition wins when two styles hit the same object).
 *
 * Condition kinds (field → meaning; "" = All):
 *   element   { on, mode, elementType, property, value }                  global element filter
 *   diagram   { on, mode, diagramType }                                   global diagram filter
 *   relation  { on, mode, source, relation, target,                       global relation filter, nesting, reverse
 *               propertyOf, property, value }
 *   step      { on, mode, previous, direction, relation, added,           expand-selection step
 *               propertyOf, property, value }
 *   style     { on, color, source, relation, target, propertyOf,          Appearance › Style by property
 *               property, colorRange }
 *   nestingStyle { on, parent, direction, relation, child, color,         Appearance › Style by nesting level
 *               fontSize, bold }
 *               (child "same" = the parent's type; color: a colour name of the palette, "" = Default;
 *               fontSize, bold: the container where the condition starts; fontSize 0 = continue from the parent)
 *
 * Empty list: filter lists (global, step) keep everything (emptyMeansAll); feature lists (nesting,
 * reverse, style) select nothing. A condition that is off adds nothing and removes nothing, but an
 * Include condition that is off still counts as an Include condition: a list whose Include conditions are all
 * off keeps nothing.
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
const SAME_TYPE     = "same";   // nestingStyle child: the same type as the parent

// kind → { defaults, types: field → valid-set name, enums: field → allowed values }
/** @type {Readonly<{ [K in ConditionKind]: ConditionKindSpec<ConditionByKind[K]> }>} */
const KINDS = Object.freeze({
  element: {
    defaults: { on: true, mode: "include", elementType: "", property: "", value: "" },
    types:    { elementType: "elements" },
    enums:    { mode: MODES },
  },
  diagram: {
    defaults: { on: true, mode: "include", diagramType: "" },
    types:    { diagramType: "diagrams" },
    enums:    { mode: MODES },
  },
  relation: {
    defaults: { on: true, mode: "include", source: "", relation: "", target: "",
                propertyOf: "relation", property: "", value: "", everyContainer: false },
    types:    { source: "elements", relation: "relations", target: "elements" },
    enums:    { mode: MODES, propertyOf: REL_PROP_OF },
  },
  step: {
    defaults: { on: true, mode: "include", previous: "", direction: "either", relation: "", added: "",
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
  nestingStyle: {
    defaults: { on: true, parent: "", direction: "either", relation: "", child: SAME_TYPE, color: "", fontSize: 0, bold: false },
    types:    { parent: "elements", relation: "relations", child: "elements" },
    enums:    { direction: DIRECTIONS },
    specials: { child: [SAME_TYPE] },
  },
});

// ── Normalise / serialise ─────────────────────────────────────────────────────

/**
 * The default (empty) condition of a kind: matches everything.
 * @template {ConditionKind} K
 * @param {K} kind
 * @returns {ConditionByKind[K]}
 */
function defaultCondition(kind) {
  return Object.assign({}, KINDS[kind].defaults);
}

/**
 * Normalise one raw condition. Returns the full condition, or null (with a console warning) when the condition
 * is unusable. An unknown key, enum value or type id rejects the condition: a typo must never widen
 * the filter to "All".
 * @template {ConditionKind} K
 * @param {K}             kind
 * @param {unknown}       raw
 * @param {ValidTypeSets} valid
 * @param {string}        where  e.g. "filter.relationConditions[2]", for the warning
 * @returns {ConditionByKind[K] | null}
 */
function normalizeCondition(kind, raw, valid, where) {
  const K = KINDS[kind];
  const bad = (/** @type {string} */ msg) => { console.log(`Warning: ${where}: ${msg}; condition skipped.`); return null; };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return bad("not an object");

  /** @type {Record<string, unknown>} */
  const out = Object.assign({}, K.defaults);
  for (const [key, val] of Object.entries(raw)) {
    if (!(key in K.defaults)) return bad(`unknown key "${key}"`);
    if (key === "on" || key === "everyContainer" || key === "bold") {
      if (typeof val !== "boolean") return bad(`"${key}" must be true or false`);
      out[key] = val;
    } else if (key in K.types) {
      const s = String(val);
      const special = K.specials && K.specials[key] && K.specials[key].includes(s);
      if (s !== "" && !special && !valid[K.types[key]].has(s)) return bad(`unknown ${key} "${s}"`);
      out[key] = s;
    } else if (key === "fontSize") {
      if (!Number.isInteger(val) || /** @type {number} */ (val) < 0) return bad(`"fontSize" must be a whole number of points (0 = continue from the parent)`);
      out.fontSize = val;
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
  // Cast: every key was checked against the kind's defaults above.
  return /** @type {ConditionByKind[K]} */ (out);
}

/**
 * Normalise a raw list; unusable conditions are dropped with a warning. A non-array gives [].
 * @template {ConditionKind} K
 * @param {K}             kind
 * @param {unknown}       raw
 * @param {ValidTypeSets} valid
 * @param {string}        where
 * @returns {ConditionByKind[K][]}
 */
function normalizeConditions(kind, raw, valid, where) {
  if (!Array.isArray(raw)) return [];
  // Cast: filter(Boolean) drops the nulls, which tsc cannot see.
  return /** @type {ConditionByKind[K][]} */ (raw.map((r, i) => normalizeCondition(kind, r, valid, `${where}[${i}]`)).filter(Boolean));
}

/**
 * A condition as written to a preset file: keys equal to the default are omitted.
 * @param {ConditionKind}                kind
 * @param {Record<string, unknown>} condition
 * @returns {Record<string, unknown>}
 */
function serializeCondition(kind, condition) {
  /** @type {Record<string, unknown>} */
  const d = KINDS[kind].defaults;
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(d)) {
    if (condition[key] !== undefined && condition[key] !== d[key]) out[key] = condition[key];
  }
  // A style condition with only defaults would serialise to {}; colour range is always informative.
  if (kind === "style" && out.colorRange === undefined) out.colorRange = condition.colorRange || d.colorRange;
  // Likewise the child of a nesting style condition: the default row reads "child: same", not {}.
  if (kind === "nestingStyle" && out.child === undefined) out.child = condition.child || d.child;
  return out;
}

/**
 * True when a filter list is just the default condition (or empty): it filters nothing.
 * @param {ConditionKind}                            kind
 * @param {Record<string, unknown>[] | null | undefined} conditions
 */
function isPassAll(kind, conditions) {
  if (!conditions || conditions.length === 0) return true;
  /** @type {Record<string, unknown>} */
  const d = KINDS[kind].defaults;
  return conditions.length === 1 && Object.keys(d).every(k => conditions[0][k] === d[k]);
}

// ── Matching ──────────────────────────────────────────────────────────────────

/** @type {(want: string | undefined, actual: string) => boolean} */
const _typeOk = (want, actual) => want === "" || want === undefined || want === actual;

/**
 * @param {PropertySource | null | undefined} obj
 * @param {string} key
 * @returns {string | undefined}
 */
function _propOf(obj, key) {
  if (!obj || typeof obj.prop !== "function") return undefined;
  try { const v = obj.prop(key); return v === null || v === undefined ? "" : String(v); }
  catch (e) { return undefined; }
}

/**
 * @param {{ property: string, value?: string }} condition
 * @param {PropertySource | null | undefined}    obj
 */
function _propOk(condition, obj) {
  if (!condition.property) return true;
  return _propOf(obj, condition.property) === String(condition.value || "");
}

/**
 * Evaluate a condition list with a per-condition test. Exclude conditions veto; with no Include condition the list
 * keeps everything (filter lists) or nothing (feature lists). Conditions that are off never match,
 * so Include conditions that are all off keep nothing.
 * @template {{ on?: boolean, mode?: ConditionMode }} R
 * @param {R[]}                conditions
 * @param {(condition: R) => boolean} test
 * @param {boolean}            emptyMeansAll
 */
function evalConditions(conditions, test, emptyMeansAll) {
  let hasInclude = false, included = false;
  for (const r of conditions) {
    if (r.mode !== "exclude") hasInclude = true;
    if (r.on === false) continue;
    if (r.mode === "exclude") { if (test(r)) return false; }
    else if (!included && test(r)) included = true;
  }
  return hasInclude ? included : !!emptyMeansAll;
}

/**
 * Global element filter: does this element pass? Empty list keeps everything.
 * @param {ElementCondition[]} conditions
 * @param {ArchiElement}  el
 */
function matchElement(conditions, el) {
  return evalConditions(conditions, r => _typeOk(r.elementType, el.type) && _propOk(r, el), true);
}

/**
 * Global diagram filter: does this diagram object type pass? Empty list keeps everything.
 * @param {DiagramCondition[]} conditions
 * @param {string}        type
 */
function matchDiagram(conditions, type) {
  return evalConditions(conditions, r => _typeOk(r.diagramType, type), true);
}

/**
 * Does the relation match a nesting condition with everyContainer? Exclude conditions still veto, so an
 * excluded relation is never "every container". Condition order has no meaning.
 * @param {RelationCondition[]} conditions
 * @param {string} relType
 * @param {string} srcType
 * @param {string} tgtType
 * @param {ArchiRelation} [rel]
 */
function matchEveryContainer(conditions, relType, srcType, tgtType, rel) {
  const every = conditions.filter(r => r.mode === "exclude" || r.everyContainer === true);
  return matchRelation(every, relType, srcType, tgtType, false, rel);
}

/**
 * The object a relation condition's property is read from: the relation, its source or its target.
 * @overload
 * @param {{ propertyOf: string }} condition
 * @param {ArchiRelation} rel
 * @returns {ArchiConcept}
 */
/**
 * @overload
 * @param {{ propertyOf: string }} condition
 * @param {ArchiRelation | null} [rel]
 * @returns {ArchiConcept | undefined}
 */
/**
 * @param {{ propertyOf: string }}     condition
 * @param {ArchiRelation | null} [rel]
 */
function relationPropObject(condition, rel) {
  if (!rel) return undefined;
  return condition.propertyOf === "source" ? rel.source : condition.propertyOf === "target" ? rel.target : rel;
}

/**
 * Source / relation / target match, plus the property and value when `rel` (the relation
 * object) is given — without it a condition with a property never matches. Filter lists pass
 * emptyMeansAll=true (global relation filter); feature lists (nesting, reverse) pass false.
 * @param {RelationCondition[]} conditions
 * @param {string}  relType
 * @param {string}  srcType
 * @param {string}  tgtType
 * @param {boolean} emptyMeansAll
 * @param {ArchiRelation} [rel]
 */
function matchRelation(conditions, relType, srcType, tgtType, emptyMeansAll, rel) {
  return evalConditions(conditions, r =>
    _typeOk(r.relation, relType) && _typeOk(r.source, srcType) && _typeOk(r.target, tgtType) &&
    _propOk(r, relationPropObject(r, rel)),
    emptyMeansAll);
}

/**
 * One step condition against a step candidate (StepCandidate: one relation seen from one element of
 * the previous step).
 * @param {StepCondition}      r
 * @param {StepCandidate} c
 */
function _stepConditionMatches(r, c) {
  if (r.direction === "outgoing" && !c.outgoing) return false;
  if (r.direction === "incoming" &&  c.outgoing) return false;
  if (!_typeOk(r.relation, c.rel.type))      return false;
  if (!_typeOk(r.previous, c.frontier.type)) return false;
  if (!_typeOk(r.added,    c.other.type))    return false;
  if (!r.property) return true;
  const target = r.propertyOf === "relation" ? c.rel : r.propertyOf === "previous" ? c.frontier : c.other;
  return _propOf(target, r.property) === String(r.value || "");
}

/**
 * Does a step's condition list let this candidate through? Empty list follows everything.
 * @param {StepCondition[]}    conditions
 * @param {StepCandidate} cand
 */
function matchStep(conditions, cand) {
  return evalConditions(conditions, r => _stepConditionMatches(r, cand), true);
}

/**
 * One step condition, relation level: relation type, direction and previous-step type.
 * @param {StepCondition}      r
 * @param {StepCandidate} c
 */
function _stepConditionMatchesRelation(r, c) {
  if (r.direction === "outgoing" && !c.outgoing) return false;
  if (r.direction === "incoming" &&  c.outgoing) return false;
  return _typeOk(r.relation, c.rel.type) && _typeOk(r.previous, c.frontier.type);
}

/**
 * Relation collection for a step: which relations between the step's elements are drawn.
 * An Include condition matches on relation type, direction and previous-step type only, so a
 * relation to an element that was already selected is kept whatever its type (the Added
 * element type and the property only decide which elements the step adds). An
 * Exclude condition matches in full. Empty list keeps everything.
 * @param {StepCondition[]}    conditions
 * @param {StepCandidate} cand
 */
function matchStepRelation(conditions, cand) {
  return evalConditions(conditions, r => r.mode === "exclude" ? _stepConditionMatches(r, cand) : _stepConditionMatchesRelation(r, cand), true);
}

// ── Style conditions ───────────────────────────────────────────────────────────────

/**
 * Does a style condition's relation pattern match this relation? (types only; the property comes later)
 * @param {{ relation: string, source: string, target: string }} r
 * @param {string} relType
 * @param {string} srcType
 * @param {string} tgtType
 */
function styleConditionMatchesRelation(r, relType, srcType, tgtType) {
  return _typeOk(r.relation, relType) && _typeOk(r.source, srcType) && _typeOk(r.target, tgtType);
}

/**
 * Conditions that style the same object. `styled` maps condition index → Set of object ids the condition styles.
 * Returns one entry per condition index that overlaps another: { condition, with: [indexes], count }.
 * Pure helper behind the ⚠ column and the console warning.
 * @param {Map<number, Set<string>>} styled
 * @returns {{ condition: number, with: number[], count: number }[]}
 */
function detectConditionConflicts(styled) {
  const idx = Array.from(styled.keys());
  const out = [];
  for (const i of idx) {
    const overlap = new Set(), others = [];
    for (const j of idx) {
      if (j === i) continue;
      let hit = false;
      // Casts: i and j come from styled.keys(), so get() is defined.
      for (const id of /** @type {Set<string>} */ (styled.get(i))) if (/** @type {Set<string>} */ (styled.get(j)).has(id)) { overlap.add(id); hit = true; }
      if (hit) others.push(j);
    }
    if (others.length) out.push({ condition: i, with: others, count: overlap.size });
  }
  return out;
}

// ── Nesting style conditions ──────────────────────────────────────────────────

/**
 * One nesting style condition against a nesting step parent → child. `rels` are the model relations
 * between the two elements, each with `outgoing` = the parent is its source. Relation All with
 * direction Either needs no relation (a nesting drawn by hand); otherwise a relation must match.
 * @param {NestingStyleCondition} r
 * @param {string} parentType
 * @param {string} childType
 * @param {{ type: string, outgoing: boolean }[]} rels
 */
function nestingStyleConditionMatches(r, parentType, childType, rels) {
  if (!_typeOk(r.parent, parentType)) return false;
  if (r.child === SAME_TYPE ? childType !== parentType : !_typeOk(r.child, childType)) return false;
  if (!r.relation && r.direction === "either") return true;
  return rels.some(x => _typeOk(r.relation, x.type) &&
    (r.direction === "either" || (r.direction === "outgoing") === x.outgoing));
}

// ── Preset files ────────────────────────────────────────────────────────────────

// Where condition lists live in a preset: [path, kind, filter list (empty = all)].
/** @type {ReadonlyArray<[string[], ConditionKind, boolean]>} */
const PRESET_CONDITION_LISTS = Object.freeze([
  [["params", "nestingConditions"],                 "relation", false],
  [["params", "reverseConditions"],                 "relation", false],
  [["filter", "elementConditions"],                 "element",  true],
  [["filter", "diagramConditions"],                 "diagram",  true],
  [["filter", "relationConditions"],                "relation", true],
  [["appearance", "styleByProperty", "conditions"], "style",    false],
  [["appearance", "nestingLevel", "conditions"],    "nestingStyle", false],
]);
const INLINE_KEYS = new Set(["nestingConditions", "reverseConditions", "elementConditions", "diagramConditions", "relationConditions", "conditions"]);

/**
 * @param {ConditionKind} kind
 * @param {unknown}  list
 * @param {boolean}  isFilter
 */
function _compactList(kind, list, isFilter) {
  if (!Array.isArray(list)) return list;
  if (isFilter && isPassAll(kind, list)) return [];
  return list.map(r => serializeCondition(kind, r));
}

/**
 * Deep copy of a preset with every condition list in file form (defaults omitted, pass-all filters → []).
 * @param {object} preset
 * @returns {object}
 */
function compactPreset(preset) {
  const c = JSON.parse(JSON.stringify(preset));
  for (const [pathKeys, kind, isFilter] of PRESET_CONDITION_LISTS) {
    let o = c;
    for (const k of pathKeys.slice(0, -1)) o = o && o[k];
    const last = pathKeys[pathKeys.length - 1];
    if (o && last in o) o[last] = _compactList(kind, o[last], isFilter);
  }
  const steps = c.relatedElements && c.relatedElements.steps;
  if (Array.isArray(steps)) steps.forEach((/** @type {{ conditions?: unknown }} */ st) => { if (st && "conditions" in st) st.conditions = _compactList("step", st.conditions, true); });
  return c;
}

/** @param {Record<string, unknown>} obj */
function _inline(obj) {
  const keys = Object.keys(obj);
  return keys.length ? "{" + keys.map(k => `${JSON.stringify(k)}: ${JSON.stringify(obj[k])}`).join(", ") + "}" : "{}";
}

/**
 * Preset JSON as written to presets/: two-space indent, every condition on one line, so a
 * step with 18 conditions stays 18 lines and a git diff shows one changed condition as one line.
 * @param {object} preset
 * @returns {string}
 */
function stringifyPreset(preset) {
  /** @type {(v: unknown, indent: string, key: string) => string} */
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
      // Cast: v is a non-null, non-array object here.
      return "{\n" + keys.map(k => `${inner}${JSON.stringify(k)}: ${write(/** @type {Record<string, unknown>} */ (v)[k], inner, k)}`).join(",\n") + "\n" + indent + "}";
    }
    return JSON.stringify(v);
  };
  return write(compactPreset(preset), "", "") + "\n";
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    MODES, DIRECTIONS, STEP_PROP_OF, STYLE_COLOR, STYLE_PROP_OF, REL_PROP_OF, KINDS,
    defaultCondition, normalizeCondition, normalizeConditions, serializeCondition, isPassAll,
    evalConditions, matchElement, matchDiagram, matchRelation, matchEveryContainer, relationPropObject, matchStep, matchStepRelation,
    styleConditionMatchesRelation, detectConditionConflicts, SAME_TYPE, nestingStyleConditionMatches,
    compactPreset, stringifyPreset,
  };
}
