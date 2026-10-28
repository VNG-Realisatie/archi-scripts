/**
 * Layout graph for the View subsystem: the nodes (one per occurrence, diagram objects included) and
 * edges (one per routed relation, ends chosen among the occurrences) the engine lays out, with the
 * nesting resolution it was built from. Pure: reads ids, types, names and ends only, so Node runs it
 * as it is.
 */
console.log("Loading layout_graph.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs    = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./nesting")} */
const Nesting = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("./engines/engine-utils")} */
const { expandNodeSizesForEdgeDensity, sizeLabelBasedNodes, byTypeAndName } = require(REPO_ROOT + "View/lib/engines/engine-utils");
const { ALGORITHMS, RELATION_WEIGHT_MAP, compareNames } = Defs;

const JUNCTION_DIAMETER = 14;

// Element order (defs ELEMENT_ORDER) → comparator; Selection has none: the order the elements came in.
/** @type {Record<string, (a: LayoutNode, b: LayoutNode) => number>} */
const ORDER_COMPARE = {
  "Name △":          (a, b) => compareNames(a.label || "", b.label || ""),
  "Type and name △": byTypeAndName,
  "Name ▽":          (a, b) => compareNames(b.label || "", a.label || ""),
};

/**
 * With a sorted order, put the relations in the order of their elements too: some engines take the
 * order of siblings from the relations (ELK Tree). Selection keeps the order they came in.
 * @param {LayoutNode[]} nodes  already in order (_orderRootLeaves)
 * @param {LayoutEdge[]} edges  changed in place
 * @param {string} [order]
 */
function _orderEdges(nodes, edges, order) {
  if (!order || !ORDER_COMPARE[order]) return;
  const rank = new Map(nodes.map((n, i) => [n.id, i]));
  const at = (/** @type {string} */ id) => rank.get(id) ?? nodes.length;
  edges.sort((a, b) => at(a.source) - at(b.source) || at(a.target) - at(b.target));
}

/**
 * Put the elements outside containers in the chosen order (defs ELEMENT_ORDER), in place: they
 * keep their slots in the list, only their order among themselves changes. Selection keeps the
 * order they came in. A container's contents keep the container's own order (the engines).
 * @param {LayoutNode[]} nodes
 * @param {string} [order]
 */
function _orderRootLeaves(nodes, order) {
  const compare = order ? ORDER_COMPARE[order] : undefined;
  if (!compare) return;
  const containers = new Set(nodes.map(n => n.parent).filter(Boolean));
  /** @type {number[]} */
  const slots = [];
  nodes.forEach((n, i) => { if (!n.parent && !containers.has(n.id)) slots.push(i); });
  const sorted = slots.map(i => nodes[i]).sort(compare);
  slots.forEach((i, k) => { nodes[i] = sorted[k]; });
}

/**
 * @param {MaskedPreset}                     preset
 * @param {ArchiElement[]}                   elements
 * @param {ArchiRelation[]}                  routedRels       drawn as connections (extended with unapplied nestings)
 * @param {ArchiRelation[]}                  nestingRels      nesting candidates
 * @param {DiagramObject[] | undefined}      diagramObjects
 * @param {VisualDescription[] | undefined}  visuals
 * @param {VisualConnection[] | undefined}   visualRelations
 * @param {DiagramObject[] | undefined}      [diagramConnections]  connections of diagram objects (a note's line)
 * @param {{ diagramBlockOf?: Map<string, string>, diagramBlockVisualOf?: Map<string, string>, positions?: Map<string, VisualPosition> }} [diagramBlocks]
 *   contents of diagram-blocks and the target view's objects (ObjectSet)
 * @returns {LayoutGraph}
 */
function buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects, visuals, visualRelations, diagramConnections, diagramBlocks) {
  diagramObjects = diagramObjects || [];
  const params = preset.params;

  // Nesting structure and pairing shared with the pipeline's predictViewCounts so dialog/console
  // counts agree with the writer's actual output. Single source of truth.
  const nesting = Nesting.resolveNesting(elements, nestingRels, params, visuals);
  const parentMap    = nesting.parentMap;
  const occurrenceMap = nesting.occurrenceMap;
  const parentRels   = nesting.parentRels;
  const circularNestingRels  = nesting.circularNestingRels;
  const notNestedNestingRels = nesting.notNestedNestingRels;

  // Name each nesting cycle so the user can find the relations to fix or exclude.
  for (const c of nesting.cycles) {
    const names = c.elements.map(el => `"${el.name || el.id}"`).join(", ");
    console.log(`  Circular nesting (${c.rels.length} relations drawn as connections): ${names}`);
  }

  // Nesting relations not applied as containment (other parent, cycle) are drawn as
  // connections so the model relation stays visible in the view.
  for (const r of notNestedNestingRels) routedRels.push(r);
  for (const r of circularNestingRels)  routedRels.push(r);

  // Nodes: one per occurrence (paired visuals and unpaired user visuals included).
  /** @type {LayoutNode[]} */
  const nodes = [];
  /** @type {Set<string>} */
  const nodeIds = new Set();
  for (const el of elements) {
    const baseNode = {
      label:       el.name || "",
      elementType: el.type || "",
      // Casts: elementWidth / elementHeight are active for every algorithm (ALWAYS_ACTIVE_PARAMS).
      width:       el.type === "junction" ? JUNCTION_DIAMETER : /** @type {number} */ (params.elementWidth),
      height:      el.type === "junction" ? JUNCTION_DIAMETER : /** @type {number} */ (params.elementHeight),
    };
    for (const occId of occurrenceMap[el.id]) {
      nodes.push({ ...baseNode, id: occId, parent: parentMap[occId] || null });
      nodeIds.add(occId);
    }
  }

  // Diagram-object nodes (root-level, sized from current canvas bounds).
  // diagram-model-connection objects are edges, never nodes (docs/reference/selection-nesting.md: Selection run order, 6).
  for (const vo of diagramObjects) {
    if (vo.type === "diagram-model-connection") continue;
    if (nodeIds.has(vo.id)) continue;
    nodes.push({
      id:          vo.id,
      label:       vo.name || "",
      elementType: vo.type || "",
      width:       (vo.bounds && vo.bounds.width)  || params.elementWidth  || 140,
      height:      (vo.bounds && vo.bounds.height) || params.elementHeight || 60,
      parent:      null,
    });
    nodeIds.add(vo.id);
  }

  _orderRootLeaves(nodes, params.elementOrder);

  // Edges from routed relations: each relation once (docs/reference/selection-nesting.md: Connections between occurrences).
  // Connections already on the view keep their ends; otherwise the closest pair of occurrences.
  // An end inside a diagram-block is laid out at the diagram-block; the visual at that end is kept for the writer.
  const removed = new Set(nesting.removedVisualIds);
  const diagramBlockOf       = (diagramBlocks && diagramBlocks.diagramBlockOf)       || new Map();
  const diagramBlockVisualOf = (diagramBlocks && diagramBlocks.diagramBlockVisualOf) || new Map();
  /** The node a visual is laid out as: its occurrence, itself (a diagram object) or its diagram-block. */
  /** @type {(v: { id: string } | null | undefined) => string | null} */
  const end = v => {
    const id = v && String(v.id);
    if (!id || removed.has(id)) return null;
    const diagramBlock = diagramBlockOf.get(id);
    return nesting.occurrenceOf.get(id) || (nodeIds.has(id) ? id : null) || (diagramBlock && nodeIds.has(diagramBlock) ? diagramBlock : null);
  };
  /** @type {(v: { id: string } | null | undefined) => string | null} */
  const inner = v => (v && diagramBlockOf.has(String(v.id)) ? String(v.id) : null);
  /** @typedef {{ src: string, tgt: string, srcVisual: string | null, tgtVisual: string | null }} EdgeEnds */
  /** @type {Map<string, EdgeEnds[]>} */
  const drawnByRel = new Map();   // relation id → the ends of its visual relations
  for (const vr of (visualRelations || [])) {
    const relId = vr.concept && vr.concept.id;
    const src = end(vr.source), tgt = end(vr.target);
    if (!relId || !src || !tgt) continue;
    let drawn = drawnByRel.get(relId);
    if (!drawn) { drawn = []; drawnByRel.set(relId, drawn); }
    drawn.push({ src, tgt, srcVisual: inner(vr.source), tgtVisual: inner(vr.target) });
  }
  /** Occurrences of an element; for one only inside a diagram-block, that diagram-block (with the visual there). */
  /** @type {(id: string) => { occs: string[], visual: string | null } | null} */
  const placesOf = id => {
    if (occurrenceMap[id]) return { occs: occurrenceMap[id], visual: null };
    const v = diagramBlockVisualOf.get(id);
    const diagramBlock = v && diagramBlockOf.get(v);
    return diagramBlock && nodeIds.has(diagramBlock) ? { occs: [diagramBlock], visual: /** @type {string} */ (v) } : null;
  };
  /** @type {LayoutEdge[]} */
  const edges = [];
  /** @type {Map<string, { source: string | null, target: string | null }>} */
  const diagramBlockEnds = new Map();
  /** @type {Set<string>} */
  const edgeIds = new Set();
  for (const rel of routedRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    const srcPlaces = srcId ? placesOf(srcId) : null, tgtPlaces = tgtId ? placesOf(tgtId) : null;
    if (!srcPlaces || !tgtPlaces) continue;
    if (srcId === tgtId && !ALGORITHMS[preset.algorithm].supportsSelfLoops) continue;
    if (edgeIds.has(rel.id)) continue;
    edgeIds.add(rel.id);

    const isReversed = Nesting.isReversed(rel, params);
    const pairs = drawnByRel.get(rel.id) || [(() => {
      const [src, tgt] = _closestPair(srcPlaces.occs, tgtPlaces.occs, parentMap, srcId === tgtId);
      return { src, tgt, srcVisual: srcPlaces.visual, tgtVisual: tgtPlaces.visual };
    })()];
    pairs.forEach((p, k) => {
      if (p.src === p.tgt && srcId !== tgtId) return;   // both ends inside one diagram-block: it moves as a whole
      const id = k === 0 ? rel.id : `${rel.id}_${k}`;   // unique per edge for the layout engine
      // For reversed-typed relations, swap source/target so the layout
      // engine traverses the edge in the reversed direction. The model
      // relation is untouched; Archi draws using its intrinsic direction.
      edges.push({
        id,
        conceptId: rel.id,   // plain model relation id — always used for $() lookup in _writeView
        source: isReversed ? p.tgt : p.src,
        target: isReversed ? p.src : p.tgt,
        label:  rel.name || "",
        weight: RELATION_WEIGHT_MAP[rel.type] || 1.0,
      });
      if (p.srcVisual || p.tgtVisual) diagramBlockEnds.set(id, isReversed
        ? { source: p.tgtVisual, target: p.srcVisual }
        : { source: p.srcVisual, target: p.tgtVisual });
    });
  }

  // Connections of diagram objects (a note's line to an element) are laid out like relations, so a
  // note sits next to what it is about instead of loose beside the view. An end on an element visual
  // of a view that is not the target (a Create action reads it) is laid out at its element.
  const onTarget = (diagramBlocks && diagramBlocks.positions) || new Map();
  /** @type {(v: VisualObject | VisualConnection) => string | null} */
  const dcEnd = v => end(v) || (!onTarget.has(String(v.id)) && v.concept && occurrenceMap[v.concept.id] ? occurrenceMap[v.concept.id][0] : null);
  for (const obj of (diagramConnections || [])) {
    const dc = /** @type {VisualConnection} */ (/** @type {unknown} */ (obj));   // Cast: a diagram connection is a connection
    const src = dcEnd(dc.source);
    const tgt = dcEnd(dc.target);
    if (!src || !tgt || src === tgt) continue;
    edges.push({ id: String(dc.id), conceptId: String(dc.id), source: src, target: tgt, label: "", weight: 1.0 });
  }

  _orderEdges(nodes, edges, params.elementOrder);

  const engineParams = preset.engineParams || {};
  sizeLabelBasedNodes(nodes, params, engineParams);
  expandNodeSizesForEdgeDensity(nodes, edges, params);   // after label sizing, which would overwrite it

  return {
    algorithm:      preset.algorithm,
    nodes, edges,
    options:        params,
    engineParams,
    alignWidthSameType: params.alignWidthSameType || false,
    snapColumnsToGrid: params.snapColumnsToGrid || false,
    sortContainers: params.sortContainers || false,
    _parentMap:     parentMap,
    _parentRels:    parentRels,
    _occurrenceMap: occurrenceMap,
    _nesting:       nesting,
    _diagramBlockEnds:     diagramBlockEnds,
    _nestingStats: {
      candidates:        nestingRels.length,
      applied:           parentRels.length,
      circularNestings:  circularNestingRels.length,
      notNestedNestings: notNestedNestingRels.length,
    },
  };
}

/**
 * The pair of occurrences one connection of a relation is drawn between: neither containing
 * the other, then the deepest common container, then occurrence order. A self-relation stays
 * a loop on the first occurrence.
 * @param {string[]}               srcOccs
 * @param {string[]}               tgtOccs
 * @param {Record<string, string>} parentMap
 * @param {boolean}                selfRelation
 * @returns {[string, string]}
 */
function _closestPair(srcOccs, tgtOccs, parentMap, selfRelation) {
  if (selfRelation) return [srcOccs[0], srcOccs[0]];
  const ancestors = (/** @type {string} */ occ) => { const a = []; for (let p = parentMap[occ]; p; p = parentMap[p]) a.push(p); return a; };
  const tgtAnc = tgtOccs.map(ancestors);
  let best = /** @type {[string, string] | null} */ (null), bestScore = /** @type {number[] | null} */ (null);
  srcOccs.forEach(s => {
    const sAnc = ancestors(s);
    tgtOccs.forEach((t, ti) => {
      const related = sAnc.includes(t) || tgtAnc[ti].includes(s) ? 1 : 0;
      const common = sAnc.find(p => tgtAnc[ti].includes(p));
      const depth = common ? ancestors(common).length + 1 : 0;
      const score = [related, -depth];
      if (!bestScore || score[0] < bestScore[0] || (score[0] === bestScore[0] && score[1] < bestScore[1])) {
        best = [s, t]; bestScore = score;
      }
    });
  });
  return /** @type {[string, string]} */ (best);   // Cast: every element has an occurrence
}

module.exports = { buildLayoutGraph };
