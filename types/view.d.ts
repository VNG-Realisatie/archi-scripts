/**
 * View subsystem — shared data shapes for static checking (JSDoc + tsc).
 * Names follow Scripts/View/docs/SPEC.md § Vocabulary. Not loaded at runtime.
 */

// ── Rule lists (Scripts/View/lib/rel_filter.js) ──────────────────────────────────────────────────

type RuleKind = "element" | "diagram" | "relation" | "step" | "style";
type RuleMode = "include" | "exclude";

type ElementRule = {
  mode: RuleMode;
  elementType: string;
  property: string;
  value: string;
};

type DiagramRule = {
  mode: RuleMode;
  diagramType: string;
};

type RelationRule = {
  on: boolean;
  mode: RuleMode;
  source: string;
  relation: string;
  target: string;
  propertyOf: "relation" | "source" | "target";
  property: string;
  value: string;
  everyContainer: boolean;
};

type StepRule = {
  mode: RuleMode;
  previous: string;
  direction: "either" | "outgoing" | "incoming";
  relation: string;
  added: string;
  propertyOf: "added" | "relation" | "previous";
  property: string;
  value: string;
};

type StyleRule = {
  on: boolean;
  color: "element" | "relation" | "source" | "target";
  source: string;
  relation: string;
  target: string;
  propertyOf: "element" | "relation" | "source" | "target";
  property: string;
  colorRange: string;
};

interface RuleByKind {
  element: ElementRule;
  diagram: DiagramRule;
  relation: RelationRule;
  step: StepRule;
  style: StyleRule;
}
type AnyRule = RuleByKind[RuleKind];

/** Type ids a rule may name, per field group (built by defs.validatePreset). */
interface ValidTypeSets {
  elements: Set<string>;
  relations: Set<string>;
  diagrams: Set<string>;
  colorRanges: Set<string>;
}

/** Schema of one rule kind: defaults, which fields hold type ids, which hold enum values. */
interface RuleKindSpec<R> {
  defaults: R;
  types: Record<string, Exclude<keyof ValidTypeSets, "colorRanges">>;
  enums: Record<string, readonly string[]>;
}

/** Step candidate: one relation seen from one element of the previous step. */
interface StepCandidate {
  rel: ArchiRelation;
  /** The previous-step element. */
  frontier: ArchiElement;
  /** The element the relation would add. */
  other: ArchiElement;
  /** The previous-step element is the relation's source. */
  outgoing: boolean;
}

/** Anything with jArchi-style properties: concepts, visuals, or a Node-harness stand-in. */
interface PropertySource {
  prop(key: string): unknown;
}
