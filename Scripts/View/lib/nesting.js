/**
 * Nesting for the View subsystem: which relations nest, the parents and occurrences of every
 * element, the pairing of occurrences with the visuals on a view, and the predicted counts.
 * Pure: reads ids, types, names and ends only, so Node runs it as it is (jsconfig.pure.json).
 */
console.log("Loading nesting.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./rel_filter")} */
const ConditionLists = require(REPO_ROOT + "View/lib/rel_filter");
const { compareNames } = Defs;

/**
 * Strip a synthetic occurrence suffix (`${id}_occ_N`) to recover the element id.
 * @param {string} id
 */
function _baseId(id) {
  const i = id.indexOf("_occ_");
  return i < 0 ? id : id.substring(0, i);
}

/**
 * Order elements by name (Defs.compareNames), then id (code point).
 * @param {{ id: string, name?: string } | undefined} a
 * @param {{ id: string, name?: string } | undefined} b
 */
function _byNameThenId(a, b) {
  const na = (a && a.name) || "", nb = (b && b.name) || "";
  if (na !== nb) return compareNames(na, nb);
  // Casts: callers compare elements that exist.
  return /** @type {{ id: string }} */ (a).id < /** @type {{ id: string }} */ (b).id ? -1 : /** @type {{ id: string }} */ (a).id > /** @type {{ id: string }} */ (b).id ? 1 : 0;
}

/**
 * Placement of an occurrence: element id and its container chain up to the view root.
 * @template {string | null} E
 * @param {E}        elementId
 * @param {string[]} chain
 * @returns {string | E}
 */
function _placementKey(elementId, chain) {
  return chain.length ? `${elementId} in ${chain.join(" in ")}` : elementId;
}

/**
 * @typedef {{ id: string, conceptId: string | null, parentVisualId: string | null }} RawVisual  one visual as read from the view
 */

/**
 * Classify the element visuals of one view as managed or user content
 * (docs/reference/selection-nesting.md: Managed occurrences, step 1). Pure — runs in Node.
 *   1. A visual whose placement matches a record is managed; each record matches one visual,
 *      the first in view order.
 *   2. An element without user content: its first visual becomes user content.
 *   3. A managed visual holding user content becomes user content.
 * @param {RawVisual[]} raw  all element visuals of the view, view order;
 *   diagram objects (notes, groups) with conceptId null — never managed, always user content
 * @param {string[]} records  PROP_MANAGED_OCCURRENCE values on the view
 * @returns {VisualDescription[]}  view order
 */
function classifyVisuals(raw, records) {
  // Map keys include null (no parent visual): get(null) is simply undefined.
  /** @type {Map<string | null, RawVisual>} */
  const byId = new Map(raw.map(v => [v.id, v]));
  /** @type {Map<string | null, number>} */
  const left = new Map();
  for (const r of (records || [])) left.set(r, (left.get(r) || 0) + 1);
  const out = raw.map(v => {
    /** @type {string[]} */
    const chain = [];
    // Cast: a parent visual is an element visual (describeVisuals filters parents on "element").
    for (let p = byId.get(v.parentVisualId); p; p = byId.get(p.parentVisualId)) chain.push(/** @type {string} */ (p.conceptId));
    const key = _placementKey(v.conceptId, chain);
    const managed = !!v.conceptId && chain.length > 0 && (left.get(key) || 0) > 0;
    if (managed) left.set(key, /** @type {number} */ (left.get(key)) - 1);   // Cast: > 0 checked above
    return { id: v.id, conceptId: v.conceptId, parentVisualId: v.parentVisualId || null, chain, managed };
  });
  /** @type {Map<string | null, VisualDescription>} */
  const outById = new Map(out.map(v => [v.id, v]));
  const hasUser = new Set(out.filter(v => !v.managed).map(v => v.conceptId));
  for (const v of out) {
    if (!v.conceptId || hasUser.has(v.conceptId)) continue;
    v.managed = false;
    hasUser.add(v.conceptId);
  }
  for (const v of out) {
    if (v.managed) continue;
    for (let p = outById.get(v.parentVisualId); p && p.managed; p = outById.get(p.parentVisualId)) p.managed = false;
  }
  return out;
}

/**
 * Pair occurrences with the visuals on the view (docs/reference/selection-nesting.md: Managed occurrences, step 3).
 * Per element user content first, then managed visuals; each takes a free occurrence with its own
 * container chain, else one with the same direct container, else any. A user visual left over
 * becomes an extra occurrence at view root — only the settings nest; a managed one is removed.
 * Extends occurrenceMap and parentMap in place.
 * @param {ArchiElement[]}               elements
 * @param {Record<string, string[]>}     occurrenceMap  extended in place
 * @param {Record<string, string>}       parentMap      extended in place
 * @param {VisualDescription[] | undefined} visuals
 * @returns {VisualPairing}
 *   visualOf: occurrence id → visual id; occurrenceOf: visual id → occurrence id;
 *   managedOccs: occurrences that are managed after the run (paired with a managed visual, or new
 *   while the element has other content); userAtRoot: user visuals the settings place nowhere, laid out at view root
 */
function _pairVisuals(elements, occurrenceMap, parentMap, visuals) {
  const chainOf = (/** @type {string} */ occ) => { const c = []; for (let p = parentMap[occ]; p; p = parentMap[p]) c.push(_baseId(p)); return c; };
  /** @type {Map<string, VisualDescription[]>} */
  const byConcept = new Map();
  for (const v of (visuals || [])) {
    // Cast: a visual without a concept (note, group) has no occurrence, so the first test skips it.
    const conceptId = /** @type {string} */ (v.conceptId);
    if (!occurrenceMap[conceptId]) continue;   // element not laid out: visual left as it is
    _pushTo(byConcept, conceptId, v);
  }
  /** @type {Record<string, string>} */
  const visualOf = {};
  /** @type {Map<string, string>} */
  const occurrenceOf = new Map();
  /** @type {string[]} */
  const removedVisualIds = [];
  /** @type {Set<string>} */
  const managedOccs = new Set();
  /** @type {VisualDescription[]} */
  const leftover = [];
  for (const el of elements) {
    const occs = occurrenceMap[el.id];
    const vis = byConcept.get(el.id) || [];
    const free = occs.map(occ => ({ occ, key: _placementKey(el.id, chainOf(occ)), direct: _baseId(parentMap[occ] || "") }));
    /** @type {(v: VisualDescription, test: (f: { occ: string, key: string | null, direct: string }) => boolean) => boolean} */
    const take = (v, test) => {
      const i = free.findIndex(test);
      if (i < 0) return false;
      const { occ } = free.splice(i, 1)[0];
      visualOf[occ] = v.id;
      occurrenceOf.set(v.id, occ);
      if (v.managed) managedOccs.add(occ);
      return true;
    };
    for (const group of [vis.filter(v => !v.managed), vis.filter(v => v.managed)]) {
      let rest = group.filter(v => !take(v, f => f.key === _placementKey(el.id, v.chain)));
      rest = rest.filter(v => !take(v, f => f.direct === (v.chain[0] || "")));
      rest = rest.filter(v => !take(v, () => true));
      for (const v of rest) (v.managed ? removedVisualIds.push(v.id) : leftover.push(v));
    }
    // New occurrences are managed — except the first while the element has no user content.
    const user = vis.some(v => !v.managed);
    free.forEach((f, i) => { if (user || i > 0) managedOccs.add(f.occ); });
  }
  // Leftover user visuals: an occurrence of their own at view root. Only the settings nest: the
  // container a visual sits in on the view is not kept.
  for (const v of leftover) {
    const conceptId = /** @type {string} */ (v.conceptId);   // Cast: leftovers are element visuals
    const occ = `${conceptId}_occ_${occurrenceMap[conceptId].length}`;
    occurrenceMap[conceptId] = [...occurrenceMap[conceptId], occ];
    visualOf[occ] = v.id;
    occurrenceOf.set(v.id, occ);
  }
  return { visualOf, occurrenceOf, removedVisualIds, managedOccs, userAtRoot: leftover.length };
}

/**
 * Visual relations of the nested relations (docs/reference/selection-nesting.md: Writer parenthood): per binding the one
 * between its two paired visuals is kept; every other visual relation of a nested relation is
 * removed — what is shown as nesting is not also shown as a line. Pure — runs in Node.
 * @param {ParentRel[]}            parentRels  nesting bindings
 * @param {Record<string, string>} visualOf  occurrence id → visual id (pairing)
 * @param {VisualConnection[] | undefined} visualRelations  visual relations on the view
 * @returns {{ keptVrIds: Array<string|null>, removedVrIds: string[] }}
 *   keptVrIds per binding (null: none on the view, to be added)
 */
function nestingConnections(parentRels, visualOf, visualRelations) {
  /** @type {Map<string, VisualConnection[]>} */
  const byRel = new Map();
  for (const vr of (visualRelations || [])) {
    const relId = vr.concept && vr.concept.id;
    if (!relId) continue;
    _pushTo(byRel, relId, vr);
  }
  /** @type {Set<string>} */
  const used = new Set();
  const keptVrIds = parentRels.map(b => {
    const s = visualOf[b.srcOccId], t = visualOf[b.tgtOccId];
    if (!s || !t) return null;
    const vr = (byRel.get(b.rel.id) || []).find(c => !used.has(String(c.id)) && c.source && c.target &&
      String(c.source.id) === String(s) && String(c.target.id) === String(t));
    if (!vr) return null;
    used.add(String(vr.id));
    return String(vr.id);
  });
  /** @type {string[]} */
  const removedVrIds = [];
  for (const relId of new Set(parentRels.map(b => b.rel.id))) {
    for (const vr of (byRel.get(relId) || [])) if (!used.has(String(vr.id))) removedVrIds.push(String(vr.id));
  }
  return { keptVrIds, removedVrIds };
}

/**
 * Records of the managed occurrences that exist after a write (PROP_MANAGED_OCCURRENCE values),
 * sorted. `exists(occ)` tells whether the occurrence got a visual.
 * @param {NestingResolution}        nesting
 * @param {(occ: string) => boolean} exists
 * @returns {string[]}
 */
function managedRecords(nesting, exists) {
  /** @type {string[]} */
  const out = [];
  for (const occ of nesting.managedOccs) {
    if (!exists(occ)) continue;
    /** @type {string[]} */
    const chain = [];
    for (let p = nesting.parentMap[occ]; p; p = nesting.parentMap[p]) chain.push(_baseId(p));
    if (chain.length) out.push(_placementKey(_baseId(occ), chain));
  }
  return out.sort();
}

/**
 * Strongly connected components (Tarjan, iterative). Returns node id → component number.
 * @param {string[]} nodeIds
 * @param {Map<string, string[]>} succ  node id → successor ids
 */
function _stronglyConnected(nodeIds, succ) {
  /** @type {Map<string, number>} */
  const idx = new Map();
  /** @type {Map<string, number>} */
  const low = new Map();
  /** @type {Set<string>} */
  const onStack = new Set();
  /** @type {string[]} */
  const stack = [];
  /** @type {Map<string, number>} */
  const comp = new Map();
  let next = 0, nComp = 0;
  // Casts below: every node on the work list was opened, so idx and low hold it.
  const open = (/** @type {string} */ v) => { idx.set(v, next); low.set(v, next); next++; stack.push(v); onStack.add(v); };
  for (const root of nodeIds) {
    if (idx.has(root)) continue;
    open(root);
    /** @type {[string, number][]} */
    const work = [[root, 0]];
    while (work.length) {
      const top = work[work.length - 1];
      const v = top[0], ns = succ.get(v) || [];
      if (top[1] < ns.length) {
        const w = ns[top[1]++];
        if (!idx.has(w)) { open(w); work.push([w, 0]); }
        else if (onStack.has(w)) low.set(v, Math.min(/** @type {number} */ (low.get(v)), /** @type {number} */ (idx.get(w))));
        continue;
      }
      work.pop();
      if (work.length) { const u = work[work.length - 1][0]; low.set(u, Math.min(/** @type {number} */ (low.get(u)), /** @type {number} */ (low.get(v)))); }
      if (low.get(v) === idx.get(v)) {
        let w;
        do { w = /** @type {string} */ (stack.pop()); onStack.delete(w); comp.set(w, nComp); } while (w !== v);
        nComp++;
      }
    }
  }
  return comp;
}

/**
 * Resolve nesting structure (parentMap, occurrenceMap, parentRels) from the nesting
 * candidates. Single source of truth — used by the writer's _buildLayoutGraph AND by
 * predictViewCounts, so dialog and pipeline counters agree with what the writer produces.
 * No step depends on relation, condition or element order (docs/reference/selection-nesting.md: Roles and parents).
 *
 *   1. Cycles: nesting relations inside one strongly connected component of the graph
 *      parent → child are all drawn as connections (circularNestingRels, cycles).
 *      What remains is acyclic.
 *   2. Parents per child: every parent reached by a relation that matches a nesting condition
 *      with everyContainer; plus at most one parent from the other relations — a container
 *      a user-content visual of the child sits in on the view, else the first by name, then id.
 *      The other relations are drawn as connections (notNestedNestingRels).
 *   3. Occurrences: an element appears once under each occurrence of each of its parents,
 *      so an extra occurrence of a container gets its own copies of the container's children.
 *      The first occurrence has the element id, the others `${id}_occ_N`.
 *   4. Pairing with the visuals on the view (_pairVisuals): unpaired user visuals add occurrences.
 *
 * @param {ArchiElement[]}      elements
 * @param {ArchiRelation[]}     nestingRels   nesting candidates (splitNestingRels)
 * @param {EffectiveParams}     params        preset.params (nestingConditions, reverseConditions)
 * @param {VisualDescription[]} [visuals]     visuals on the target view (describeVisuals); none for a new view
 * @returns {NestingResolution}  parentMap, occurrenceMap, parentRels, circularNestingRels, cycles,
 *             notNestedNestingRels, and the pairing (see _pairVisuals)
 *
 * Each parentRels entry binds a nesting relation to the specific occurrence
 * each visual endpoint should use. `srcOccId` is the occurrence id to render
 * at rel.source's end (so `view.add(rel, srcV, tgtV)` direction matches the
 * model); `tgtOccId` likewise for rel.target. For reversed relation types,
 * the child sits on the rel.source side; otherwise on the rel.target side.
 */
function resolveNesting(elements, nestingRels, params, visuals) {
  const conditions = params.nestingConditions || [];
  // The containers user content sits in on the view: element id → container element ids.
  /** @type {Map<string | null, Set<string>>} */
  const currentContainers = new Map();
  for (const v of (visuals || [])) {
    if (v.managed || !v.chain.length) continue;
    let containers = currentContainers.get(v.conceptId);
    if (!containers) { containers = new Set(); currentContainers.set(v.conceptId, containers); }
    containers.add(v.chain[0]);
  }
  const byId  = new Map(elements.map(el => [el.id, el]));
  /** @type {ArchiRelation[]} */
  const notNestedNestingRels = [];

  // Candidates, in relation-id order so every output list is order-free.
  /** @typedef {{ rel: ArchiRelation, reversed: boolean, parentId: string, childId: string, every: boolean }} NestingCandidate */
  /** @type {NestingCandidate[]} */
  const cands = [];
  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    // Self-loops (oortjes) can never be containment; an end outside the view neither.
    if (!srcId || !tgtId || srcId === tgtId || !byId.has(srcId) || !byId.has(tgtId)) {
      notNestedNestingRels.push(rel);
      continue;
    }
    const reversed = isReversed(rel, params);
    cands.push({
      rel, reversed,
      parentId: reversed ? tgtId : srcId,
      childId:  reversed ? srcId : tgtId,
      every:    ConditionLists.matchEveryContainer(conditions, rel.type, rel.source.type, rel.target.type, rel),
    });
  }
  cands.sort((a, b) => a.rel.id < b.rel.id ? -1 : a.rel.id > b.rel.id ? 1 : 0);

  // 1. Cycles.
  /** @type {Map<string, string[]>} */
  const succ = new Map();
  for (const c of cands) {
    _pushTo(succ, c.parentId, c.childId);
  }
  const comp = _stronglyConnected([...succ.keys()].sort(), succ);
  /** @type {ArchiRelation[]} */
  const circularNestingRels = [];
  /** @type {Map<number, ArchiRelation[]>} */
  const cycleRels = new Map();   // component → rels
  /** @type {NestingCandidate[]} */
  const acyclic = [];
  for (const c of cands) {
    const k = comp.get(c.parentId);
    if (k !== undefined && k === comp.get(c.childId)) {
      circularNestingRels.push(c.rel);
      _pushTo(cycleRels, k, c.rel);
    } else {
      acyclic.push(c);
    }
  }
  const cycles = [...cycleRels.entries()].map(([k, rels]) => ({
    elements: elements.filter(el => comp.get(el.id) === k).sort(_byNameThenId),
    rels,
  })).sort((a, b) => _byNameThenId(a.elements[0], b.elements[0]));

  // 2. Parents per child.
  /** @type {Map<string, NestingCandidate[]>} */
  const byChild = new Map();
  for (const c of acyclic) {
    _pushTo(byChild, c.childId, c);
  }
  /** @type {Map<string, string[]>} */
  const parentsOf = new Map();   // child id → parent ids, in placement order
  /** @type {Set<string>} */
  const nestedPair = new Set();  // "parent child" pairs that nest
  const pairKey = (/** @type {string} */ p, /** @type {string} */ ch) => p + " " + ch;
  for (const [childId, list] of byChild) {
    const current = currentContainers.get(childId) || new Set();
    /** @type {(a: string, b: string) => number} */
    // @ts-expect-error -- boolean arithmetic is intended: true − false = 1 puts current containers first
    const order = (a, b) => (current.has(b) - current.has(a)) || _byNameThenId(byId.get(a), byId.get(b));
    const parents = new Set(list.filter(c => c.every).map(c => c.parentId));
    const one = [...new Set(list.filter(c => !c.every).map(c => c.parentId))].sort(order);
    if (one.length) parents.add(one[0]);
    parentsOf.set(childId, [...parents].sort(order));
    for (const p of parents) nestedPair.add(pairKey(p, childId));
  }
  /** @type {Map<string, NestingCandidate[]>} */
  const relsByPair = new Map();
  for (const c of acyclic) {
    const k = pairKey(c.parentId, c.childId);
    if (!nestedPair.has(k)) { notNestedNestingRels.push(c.rel); continue; }
    _pushTo(relsByPair, k, c);
  }

  // 3. Occurrences, parents first (the remaining graph is acyclic).
  /** @type {Record<string, string>} */
  const parentMap = {};
  /** @type {Record<string, string[]>} */
  const occurrenceMap = {};
  /** @type {ParentRel[]} */
  const parentRels = [];
  /** @type {(id: string) => string[]} */
  const visit = id => {
    if (occurrenceMap[id]) return occurrenceMap[id];
    const parents = parentsOf.get(id);
    if (!parents) return (occurrenceMap[id] = [id]);
    /** @type {string[]} */
    const occs = [];
    for (const p of parents) {
      for (const pOcc of visit(p)) {
        const occ = occs.length ? `${id}_occ_${occs.length}` : id;
        occs.push(occ);
        parentMap[occ] = pOcc;
        for (const c of /** @type {NestingCandidate[]} */ (relsByPair.get(pairKey(p, id)))) {   // Cast: p nests id
          parentRels.push({ rel: c.rel, srcOccId: c.reversed ? occ : pOcc, tgtOccId: c.reversed ? pOcc : occ });
        }
      }
    }
    return (occurrenceMap[id] = occs);
  };
  for (const el of elements) visit(el.id);

  // 4. Pairing with the visuals on the view.
  const pairing = _pairVisuals(elements, occurrenceMap, parentMap, visuals);

  return { parentMap, occurrenceMap, parentRels, circularNestingRels, cycles, notNestedNestingRels, ...pairing };
}

/**
 * Is this relation reversed (params.reverseConditions)? Reversed relations are laid out from target
 * to source and, when nested, have the target as parent. Single source of truth for the
 * writer, the layout graph and the counters.
 * @param {ArchiRelation}   rel
 * @param {EffectiveParams} params
 */
function isReversed(rel, params) {
  const conditions = params.reverseConditions;
  if (!conditions || conditions.length === 0) return false;
  return ConditionLists.matchRelation(conditions, rel.type, rel.source && rel.source.type, rel.target && rel.target.type, false, rel);
}

/**
 * Split relations into nesting candidates and connections. Single source of truth for
 * the writer (generate_view) and predictViewCounts, so dialog counts match the output.
 *
 * A relation is a nesting candidate when it matches params.nestingConditions (relation type,
 * source / target element type and property; the parent is the source, or the target for a reversed
 * relation). Every other relation is a connection.
 *
 * @param {ArchiRelation[]}  relations
 * @param {EffectiveParams}  params
 * @returns {{ nestingRels: ArchiRelation[], connectionRels: ArchiRelation[] }}
 */
function splitNestingRels(relations, params) {
  const conditions          = params.nestingConditions || [];
  /** @type {ArchiRelation[]} */
  const nestingRels    = [];
  /** @type {ArchiRelation[]} */
  const connectionRels = [];
  for (const rel of relations) {
    const isNesting = conditions.length > 0 &&
      ConditionLists.matchRelation(conditions, rel.type, rel.source && rel.source.type, rel.target && rel.target.type, false, rel);
    (isNesting ? nestingRels : connectionRels).push(rel);
  }
  return { nestingRels, connectionRels };
}

/**
 * Predict the counts that will appear on the generated view, given the pipeline's
 * elements + relations + the current preset.params. Used by both the pipeline log
 * and the dialog's live counter so what the user sees matches what gets written.
 *
 * Returned shape follows the canonical vocabulary (AGENTS.md):
 *   elements         — unique model concepts (= containers + nestedElements + standalones)
 *   containers       — elements with ≥1 child
 *   nestedElements   — elements inside a container; not themselves a container
 *   standalones      — elements at view root with no children
 *   extraOccurrences — extra visual appearances (nesting conditions with everyContainer; visuals of
 *                      user content the settings place nowhere)
 *   relations        — total inter-element relations (= nestings + connections)
 *   nestings         — relations drawn as box-in-box
 *   connections      — relations drawn as a line
 *   diagramObjects     — canvas-only positional objects, also those inside a diagram-block
 *   diagramConnections — lines without a relation behind them (a note's line)
 * An element only inside a diagram-block is not laid out but written with it: an element and a standalone.
 * @param {ArchiElement[]}      elements
 * @param {ArchiRelation[]}     relations
 * @param {{ objects: number, connections: number, elements: number }} diagram  diagram objects and diagram
 *   connections on the view, and the elements only inside a diagram-block
 * @param {EffectiveParams}     params
 * @param {VisualDescription[]} [visuals]
 * @returns {ViewCounts}
 */
function predictViewCounts(elements, relations, diagram, params, visuals) {
  const { nestingRels, connectionRels } = splitNestingRels(relations, params);
  const { parentMap, occurrenceMap, parentRels, notNestedNestingRels, circularNestingRels } =
    resolveNesting(elements, nestingRels, params, visuals);
  // Sum of (occurrences - 1) over every element — extra appearances.
  let extraOccurrences = 0;
  for (const elId of Object.keys(occurrenceMap)) {
    extraOccurrences += Math.max(0, occurrenceMap[elId].length - 1);
  }

  // Categorise elements by role in the nesting tree. parentMap keys may include
  // synthetic occurrence ids (`${id}_occ_N`); normalise to the underlying element id
  // so the role categorisation is on unique concepts, not visual appearances.
  const containerIds = new Set();
  for (const childId of Object.keys(parentMap)) containerIds.add(parentMap[childId]);
  // `parentMap` keys: ids that have a parent. Normalise occurrence ids back to base.
  const childIds = new Set();
  for (const k of Object.keys(parentMap)) childIds.add(_baseId(k));

  let nestedElements = 0, standalones = 0;
  for (const el of elements) {
    if (containerIds.has(el.id)) continue;          // counted as container
    if (childIds.has(el.id))     nestedElements++;
    else                         standalones++;
  }

  return {
    elements:         elements.length + diagram.elements,
    containers:       containerIds.size,
    nestedElements,
    standalones:      standalones + diagram.elements,
    extraOccurrences,
    relations:        relations.length,
    nestings:         parentRels.length,
    connections:      connectionRels.length + notNestedNestingRels.length + circularNestingRels.length,
    diagramObjects:     diagram.objects,
    diagramConnections: diagram.connections,
  };
}

/**
 * Append to the array under a key, creating it first.
 * @template K, V
 * @param {Map<K, V[]>} map
 * @param {K} key
 * @param {V} value
 */
function _pushTo(map, key, value) {
  let list = map.get(key);
  if (!list) { list = []; map.set(key, list); }
  list.push(value);
}

module.exports = {
  isReversed,
  splitNestingRels,
  resolveNesting,
  classifyVisuals,
  managedRecords,
  nestingConnections,
  predictViewCounts,
};
