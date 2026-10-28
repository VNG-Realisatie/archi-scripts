/**
 * Write plan for the View subsystem: what the writer does to the target view, computed from the
 * layout result and the VisualSet; view_writer.js applies it. One plan for every action, no
 * per-action branch (Scripts/View/AGENTS.md hard rule 7).
 *
 * Per result node (SPEC § 5): a counterpart on the target view → keep it (appearance preserved,
 * container re-derived from the nesting), else → create it; a diagram object read from another view
 * is copied, a diagram-block with its contents. Nodes are written parents first, at positions
 * relative to their container. Per laid-out connection: one on the view between the same visuals →
 * new bendpoints, else a new one or a copy. Pure: reads ids, types, ends and concepts only, so Node
 * runs it as it is.
 */
console.log("Loading write_plan.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs    = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./nesting")} */
const Nesting = require(REPO_ROOT + "View/lib/nesting");
const { ALGORITHMS, CONNECTION_END_ROOM, BENDPOINT_MIN_GAP } = Defs;

/** Archi's CONNECTION_TEXT_POSITION per label position; Natural is drawn in the middle. */
/** @type {Record<string, number>} */
const TEXT_POSITION = { Source: 0, Middle: 1, Target: 2, Natural: 1 };

/**
 * The write plan of one view (docs/reference/selection-nesting.md: Writer parenthood, Managed
 * occurrences). The target view's contents come from objectSet.positions: empty for a Create action.
 * @param {MaskedPreset} preset
 * @param {ObjectSet}    objectSet
 * @param {LayoutGraph}  graph   its nesting resolution and diagram-block ends
 * @param {LayoutResult} result
 * @returns {WritePlan}
 */
function planWrite(preset, objectSet, graph, result) {
  const nesting = graph._nesting;
  const removedSelfLoops = ALGORITHMS[preset.algorithm].supportsSelfLoops ? [] : _selfLoops(objectSet.visualRelations);
  const { nodes, byNode, nodeBox, copiedLines } = _planNodes(objectSet, nesting, result);
  const visualIds = new Set(objectSet.visualElements.map(v => String(v.id)));
  const removedVisuals = nesting.removedVisualIds.map(String).filter(id => visualIds.has(id));
  const remaining = _remainingConnections(objectSet, removedSelfLoops, removedVisuals, byNode);
  const boxOf = _boxes(byNode, nodeBox, objectSet.positions);
  /** @type {Set<string>} */
  const consumed = new Set();   // connections on the view matched to a result edge or a nesting
  const connections = _planConnections(preset, objectSet, graph, result, { byNode, visualIds, remaining, consumed, boxOf });
  const { nestings, keptNestings, removedLines } = _planNestings(nesting, byNode, remaining, consumed);
  return {
    removedSelfLoops,
    nodes,
    removedVisuals,
    connections,
    nestings,
    keptNestings,
    removedLines,
    copiedLines,
    clearedConnections: _unrouted(remaining, consumed, objectSet.diagramBlockOf || new Map()),
    records: Nesting.managedRecords(nesting, occ => byNode.has(occ)),
    userAtRoot: nesting.userAtRoot,
  };
}

/**
 * Visual relations of self-loops (an element related to itself).
 * @param {VisualConnection[]} visualRelations
 * @returns {string[]}
 */
function _selfLoops(visualRelations) {
  return visualRelations.filter(vr => {
    const c = vr.concept;
    return c && c.source && c.target && c.source.id === c.target.id;
  }).map(vr => String(vr.id));
}

/**
 * One write per result node, parents first: the visual paired with its occurrence (a diagram object:
 * itself when on the target view) is kept, an element without one gets a new visual. A diagram object
 * that is not on the target view (a Create action reads it from another view) is copied; a
 * diagram-block's contents and the lines between them are copied with it, where they sit in it.
 * Bounds are whole pixels, as Archi stores them (it truncates), relative to where the container is
 * stored; so the plan holds what the view will hold. nodeBox: a written node's absolute box.
 * @param {ObjectSet}         objectSet
 * @param {NestingResolution} nesting
 * @param {LayoutResult}      result
 * @returns {{ nodes: NodeWrite[], byNode: Map<string, NodeWrite>, nodeBox: (node: string) => Box, copiedLines: CopiedConnection[] }}
 */
function _planNodes(objectSet, nesting, result) {
  /** @type {Record<string, LayoutResultNode>} */
  const nodeById = Object.create(null);
  result.nodes.forEach(n => { nodeById[n.id] = n; });
  const positions = objectSet.positions;
  const visualIds = new Set(objectSet.visualElements.map(v => String(v.id)));
  /** @type {Map<string, VisualObject>} */
  const diagramObjectById = new Map(objectSet.diagramObjects.map(o => [String(o.id), /** @type {VisualObject} */ (o)]));   // Cast: connections are not in diagramObjects
  const blocks = new Set((objectSet.diagramBlockOf || new Map()).values());
  const blockContents = objectSet.blockContents || new Map();
  const elementOf = _elementOfNode(objectSet.elements, nesting.occurrenceMap);
  /** @type {CopiedConnection[]} */
  const copiedLines = [];
  /** @type {Map<string, NodeWrite>} */
  const byNode = new Map();   // in write order
  /** @type {Map<string, Point>} */
  const stored = new Map();   // node id → absolute position as stored
  for (const rn of _sortNodesParentFirst(result.nodes, nodeById)) {
    const parentWrite = rn.parentId ? byNode.get(rn.parentId) : undefined;
    const parent = parentWrite ? /** @type {string} */ (rn.parentId) : null;   // Cast: a parent write means a parentId
    const origin = parent ? /** @type {Point} */ (stored.get(parent)) : { x: 0, y: 0 };   // Cast: the parent was written first
    const bounds = { x: Math.trunc(rn.x - origin.x), y: Math.trunc(rn.y - origin.y), width: Math.trunc(rn.width), height: Math.trunc(rn.height) };
    stored.set(rn.id, { x: origin.x + bounds.x, y: origin.y + bounds.y });
    const paired = nesting.visualOf[rn.id];
    const diagramObject = diagramObjectById.get(rn.id);
    const visual = paired ? (visualIds.has(String(paired)) ? String(paired) : null) : (diagramObject && positions.has(rn.id) ? rn.id : null);
    if (visual) {
      // Every container counts, also a group or a note: nothing stays in one the settings do not ask for.
      const current = /** @type {VisualPosition} */ (positions.get(visual)).parentId;   // Cast: a kept visual is on the target view
      const move = parentWrite ? !("visual" in parentWrite) || parentWrite.visual !== current : current !== null;
      byNode.set(rn.id, { node: rn.id, visual, parent, move, bounds });
      continue;
    }
    if (diagramObject) {
      byNode.set(rn.id, { node: rn.id, source: diagramObject, parent, bounds });
      const contents = blocks.has(rn.id) ? blockContents.get(rn.id) : undefined;
      if (contents) copiedLines.push(..._copyContents(contents, byNode, stored));
      continue;
    }
    const element = elementOf.get(rn.id);
    if (element) byNode.set(rn.id, { node: rn.id, element, parent, bounds });
  }
  /** @type {(node: string) => Box} */
  const nodeBox = node => {
    const at = /** @type {Point} */ (stored.get(node)), b = /** @type {NodeWrite} */ (byNode.get(node)).bounds;   // Cast: a written node
    return { x: at.x, y: at.y, width: b.width, height: b.height };
  };
  return { nodes: [...byNode.values()], byNode, nodeBox, copiedLines };
}

/**
 * A diagram-block's contents copied where they sit in it, parents first: node id = the visual's id
 * on the view read. Returns the lines between them, copied with their own bendpoints.
 * @param {BlockContents}          contents
 * @param {Map<string, NodeWrite>} byNode  extended
 * @param {Map<string, Point>}     stored  node id → absolute position as stored; extended
 * @returns {CopiedConnection[]}
 */
function _copyContents(contents, byNode, stored) {
  for (const c of contents.visuals) {
    const node = String(c.visual.id);
    const origin = /** @type {Point} */ (stored.get(c.parentId));   // Cast: parents first, the diagram-block before its contents
    const bounds = { x: c.bounds.x, y: c.bounds.y, width: c.bounds.width, height: c.bounds.height };
    stored.set(node, { x: origin.x + bounds.x, y: origin.y + bounds.y });
    byNode.set(node, { node, source: c.visual, parent: c.parentId, bounds });
  }
  return contents.connections.map(line => ({ source: line, from: { node: String(line.source.id) }, to: { node: String(line.target.id) } }));
}

/**
 * Occurrence id → its element.
 * @param {ArchiElement[]}           elements
 * @param {Record<string, string[]>} occurrenceMap
 * @returns {Map<string, ArchiElement>}
 */
function _elementOfNode(elements, occurrenceMap) {
  /** @type {Map<string, ArchiElement>} */
  const out = new Map();
  for (const el of elements) for (const occ of occurrenceMap[el.id]) out.set(occ, el);
  return out;
}

/**
 * The visual relations still on the view after the removals, in VisualSet order. Archi removes a
 * visual's connections with it, and its contents with their connections; a kept visual is moved
 * out first, and a line attached to a removed line goes too.
 * @param {ObjectSet}              objectSet
 * @param {string[]}               removedSelfLoops
 * @param {string[]}               removedVisuals
 * @param {Map<string, NodeWrite>} byNode
 * @returns {VisualConnection[]}
 */
function _remainingConnections(objectSet, removedSelfLoops, removedVisuals, byNode) {
  const removed = new Set(removedVisuals);
  const kept = new Set([...byNode.values()].filter(w => "visual" in w).map(w => /** @type {KeptNode} */ (w).visual));
  /** @type {(id: string) => boolean} */
  const goes = id => {
    if (removed.has(id)) return true;
    const pos = objectSet.positions.get(id);
    return !kept.has(id) && !!pos && !!pos.parentId && goes(pos.parentId);
  };
  const gone = new Set(removedSelfLoops);
  let left = objectSet.visualRelations;
  for (let changed = true; changed;) {
    changed = false;
    left = left.filter(vr => {
      const ends = [String(vr.source.id), String(vr.target.id)];
      if (!gone.has(String(vr.id)) && !ends.some(id => gone.has(id) || goes(id))) return true;
      gone.add(String(vr.id));
      changed = true;
      return false;
    });
  }
  return left;
}

/**
 * Absolute box of a written node or a visual after the write. A visual left in place (inside a
 * diagram-block) moves with the nearest container that is written.
 * @param {Map<string, NodeWrite>}      byNode
 * @param {(node: string) => Box}       nodeBox
 * @param {Map<string, VisualPosition>} positions
 * @returns {(ref: VisualRef) => Box}
 */
function _boxes(byNode, nodeBox, positions) {
  /** @type {Map<string, string>} */
  const nodeOfVisual = new Map();
  for (const w of byNode.values()) if ("visual" in w) nodeOfVisual.set(w.visual, w.node);
  /** @type {(visual: string) => Box} */
  const visualBox = visual => {
    const node = nodeOfVisual.get(visual);
    if (node) return nodeBox(node);
    const pos = /** @type {VisualPosition} */ (positions.get(visual));   // Cast: a connection end is on the target view
    let x = pos.bounds.x, y = pos.bounds.y;
    for (let p = pos.parentId; p; p = /** @type {VisualPosition} */ (positions.get(p)).parentId) {
      const container = nodeOfVisual.get(p);
      if (container) { const c = nodeBox(container); x += c.x; y += c.y; break; }
      const pp = /** @type {VisualPosition} */ (positions.get(p));   // Cast: a parent is on the view
      x += pp.bounds.x;
      y += pp.bounds.y;
    }
    return { x, y, width: pos.bounds.width, height: pos.bounds.height };
  };
  return ref => "node" in ref ? nodeBox(ref.node) : visualBox(ref.visual);
}

/**
 * @typedef {object} ConnectionContext
 * @property {Map<string, NodeWrite>}  byNode
 * @property {Set<string>}             visualIds  element visuals on the target view
 * @property {VisualConnection[]}      remaining  visual relations on the view after the removals
 * @property {Set<string>}             consumed   connections on the view already matched; extended
 * @property {(ref: VisualRef) => Box} boxOf
 */

/**
 * One write per laid-out edge: a diagram connection on the view is restyled; a relation's
 * connection between the same two visuals is restyled, else created. Each connection on the view
 * is used once. An end inside a diagram-block was laid out at the diagram-block; the connection
 * keeps its visual there.
 * @param {MaskedPreset}      preset
 * @param {ObjectSet}         objectSet
 * @param {LayoutGraph}       graph
 * @param {LayoutResult}      result
 * @param {ConnectionContext} ctx
 * @returns {ConnectionWrite[]}
 */
function _planConnections(preset, objectSet, graph, result, ctx) {
  const params = preset.params;
  const relationById = new Map(objectSet.relations.map(r => [r.id, r]));
  /** @type {Map<string, VisualConnection>} */
  const diagramConnById = new Map(objectSet.diagramConnections.map(dc =>
    [String(dc.id), /** @type {VisualConnection} */ (/** @type {unknown} */ (dc))]));   // Cast: a diagram connection is a connection
  /** @type {(id: string) => VisualRef | null} */
  const nodeRef = id => (ctx.byNode.has(id) ? { node: id } : null);
  /** An end inside a diagram-block: the visual on the target view, or its copy. */
  /** @type {(id: string | null | undefined) => VisualRef | null} */
  const blockRef = id => (id && ctx.visualIds.has(id) ? { visual: id } : nodeRef(id || ""));
  /** @type {ConnectionWrite[]} */
  const out = [];
  for (const re of result.edges) {
    const dc = diagramConnById.get(re.id);
    if (dc) {
      // A note's line: no relation behind it. One on the target view is restyled; one read from
      // another view is copied, to the copy of its end or the node its end was laid out as.
      if (objectSet.positions.has(String(dc.source.id))) {
        const src = { visual: String(dc.source.id) }, tgt = { visual: String(dc.target.id) };
        out.push({ id: String(dc.id), style: _connectionStyle(re, ctx.boxOf(src), ctx.boxOf(tgt), src.visual === tgt.visual, false, params) });
        continue;
      }
      const from = nodeRef(String(dc.source.id)) || nodeRef(re.sourceId), to = nodeRef(String(dc.target.id)) || nodeRef(re.targetId);
      if (from && to) out.push({ source: dc, from, to, style: _connectionStyle(re, ctx.boxOf(from), ctx.boxOf(to), _sameRef(from, to), false, params) });
      continue;
    }
    // re.id may be "relId_k" (k-th connection of one relation); re.conceptId is the model id.
    const relation = relationById.get(re.conceptId || re.id);
    if (!relation) continue;
    // The edge runs in layout direction: from the model target for a reversed relation.
    const reversed = Nesting.isReversed(relation, params);
    const be = graph._diagramBlockEnds.get(re.id);
    const layoutSrc = be && be.source ? blockRef(be.source) : nodeRef(re.sourceId);
    const layoutTgt = be && be.target ? blockRef(be.target) : nodeRef(re.targetId);
    const source = reversed ? layoutTgt : layoutSrc;
    const target = reversed ? layoutSrc : layoutTgt;
    if (!source || !target) continue;
    const style = _connectionStyle(re, ctx.boxOf(source), ctx.boxOf(target), _sameRef(source, target), reversed, params);
    const id = _matchConnection(relation.id, _visualOf(source, ctx.byNode), _visualOf(target, ctx.byNode), ctx);
    out.push(id ? { id, style } : { relation, source, target, style });
  }
  return out;
}

/**
 * The visual a reference stands for before the write; null for a node that gets a new visual.
 * @param {VisualRef}              ref
 * @param {Map<string, NodeWrite>} byNode
 * @returns {string | null}
 */
function _visualOf(ref, byNode) {
  if ("visual" in ref) return ref.visual;
  const w = /** @type {NodeWrite} */ (byNode.get(ref.node));   // Cast: a node reference is written
  return "visual" in w ? w.visual : null;
}

/**
 * @param {VisualRef} a
 * @param {VisualRef} b
 */
function _sameRef(a, b) {
  return "node" in a ? "node" in b && a.node === b.node : "visual" in b && a.visual === b.visual;
}

/**
 * A connection of the relation on the view between exactly these two visuals, not used yet; marked used.
 * @param {string}            relId
 * @param {string | null}     sourceVisual
 * @param {string | null}     targetVisual
 * @param {ConnectionContext} ctx
 * @returns {string | null}
 */
function _matchConnection(relId, sourceVisual, targetVisual, ctx) {
  if (!sourceVisual || !targetVisual) return null;
  const vr = ctx.remaining.find(c => c.concept && c.concept.id === relId && !ctx.consumed.has(String(c.id)) &&
    String(c.source.id) === sourceVisual && String(c.target.id) === targetVisual);
  if (!vr) return null;
  ctx.consumed.add(String(vr.id));
  return String(vr.id);
}

/**
 * Nesting connections (Nesting.nestingConnections): the one between a binding's two visuals is
 * kept, a missing one is created; every other line of a nested relation is removed.
 * @param {NestingResolution}      nesting
 * @param {Map<string, NodeWrite>} byNode
 * @param {VisualConnection[]}     remaining
 * @param {Set<string>}            consumed   extended with the kept and removed ones
 * @returns {{ nestings: NewConnection[], keptNestings: number, removedLines: string[] }}
 */
function _planNestings(nesting, byNode, remaining, consumed) {
  const nc = Nesting.nestingConnections(nesting.parentRels, nesting.visualOf, remaining);
  /** @type {NewConnection[]} */
  const nestings = [];
  let keptNestings = 0;
  nesting.parentRels.forEach((binding, i) => {
    const kept = nc.keptVrIds[i];
    if (kept) { consumed.add(kept); keptNestings++; return; }
    if (!byNode.has(binding.srcOccId) || !byNode.has(binding.tgtOccId)) return;
    nestings.push({ relation: binding.rel, source: { node: binding.srcOccId }, target: { node: binding.tgtOccId } });
  });
  for (const id of nc.removedVrIds) consumed.add(id);
  return { nestings, keptNestings, removedLines: nc.removedVrIds };
}

/**
 * Connections on the view that no edge or nesting used: their bendpoints are cleared, so switching
 * algorithms leaves no stale routing (e.g. an edge ELK dropped when both ends lift to the same root
 * container). A line inside one diagram-block moves with it and keeps its bendpoints.
 * @param {VisualConnection[]}  remaining
 * @param {Set<string>}         consumed
 * @param {Map<string, string>} diagramBlockOf
 * @returns {string[]}
 */
function _unrouted(remaining, consumed, diagramBlockOf) {
  return remaining.filter(vr => !consumed.has(String(vr.id)) &&
    !(diagramBlockOf.has(String(vr.source.id)) && diagramBlockOf.has(String(vr.target.id)))).map(vr => String(vr.id));
}

// ── Connection style ──────────────────────────────────────────────────────────

/**
 * Label position and bendpoints of one laid-out connection. The bendpoints are Archi relative
 * bendpoints (offsets from the source and target centres), in the model direction.
 * @param {LayoutResultEdge} re
 * @param {Box}              srcBox    the connection's source after the write, absolute
 * @param {Box}              tgtBox    its target
 * @param {boolean}          selfLoop  source and target are one visual
 * @param {boolean}          reversed  laid out from the target: the result's bendpoints run from tgtBox
 * @param {EffectiveParams}  params
 * @returns {ConnectionStyle}
 */
function _connectionStyle(re, srcBox, tgtBox, selfLoop, reversed, params) {
  const lp = TEXT_POSITION[/** @type {string} */ (params.labelPosition)];   // Cast: absent → TEXT_POSITION["undefined"] → none
  return { textPosition: lp === undefined ? null : lp, bendpoints: _bendpoints(re, srcBox, tgtBox, selfLoop, reversed, params) };
}

/**
 * Self-loops (source === target) without an engine route get a synthesised loop: engine routing
 * for self-loops is unreliable across engines, and Archi's default draws the line inside the element.
 * A straight edge, or one without bendpoints, gets none: Archi draws it from border to border.
 * @param {LayoutResultEdge} re
 * @param {Box}              srcBox
 * @param {Box}              tgtBox
 * @param {boolean}          selfLoop
 * @param {boolean}          reversed
 * @param {EffectiveParams}  params
 * @returns {Bendpoint[]}
 */
function _bendpoints(re, srcBox, tgtBox, selfLoop, reversed, params) {
  if (!re.bendpoints || re.bendpoints.length === 0) return selfLoop ? _selfLoopBendpoints(srcBox) : [];
  if (re.isStraight) return [];
  const srcCenter = _center(srcBox), tgtCenter = _center(tgtBox);
  // Room for the end symbols (not on orthogonal lines, whose corners are the route): bendpoints
  // near an element or near each other go, and label points are added from END_ROOM outwards.
  let bps = re.bendpoints, srcPort = re.srcPort, tgtPort = re.tgtPort;
  if (params.routing !== "Orthogonal") {
    const [startBox, endBox] = reversed ? [tgtBox, srcBox] : [srcBox, tgtBox];
    bps = _clearEnds(bps, startBox, endBox);
    if (bps.length === 0) return [];
    srcPort = _roomPoint(startBox, bps[0]);
    tgtPort = _roomPoint(endBox, bps[bps.length - 1]);
  }
  const relative = _insertLabelMidpointBp(bps, srcCenter, tgtCenter, re.labelX, re.labelY, srcPort, tgtPort).map(bp => ({
    startX: Math.round(bp.x - srcCenter.x),
    startY: Math.round(bp.y - srcCenter.y),
    endX:   Math.round(bp.x - tgtCenter.x),
    endY:   Math.round(bp.y - tgtCenter.y),
  }));
  return reversed ? relative.reverse() : relative;
}

/**
 * @param {Box} b
 * @returns {Point}
 */
function _center(b) {
  return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
}

/**
 * A small NE-corner loop: three bendpoints relative to the element's centre (source === target, so
 * the start and end offsets coincide). Verified visually by Scripts/View/test/_test_self_loops.ajs.
 * @param {Box} box
 * @returns {Bendpoint[]}
 */
function _selfLoopBendpoints(box) {
  const w = box.width || 140, h = box.height || 60;
  return [
    { dx: Math.round( w / 2 + 10), dy: Math.round(-h / 2)      },  // exit right edge, going up
    { dx: Math.round( w / 2 + 30), dy: Math.round(-h / 2 - 30) },  // NE corner of loop
    { dx: 0,                       dy: Math.round(-h / 2 - 30) },  // re-enter from top
  ].map(p => ({ startX: p.dx, startY: p.dy, endX: p.dx, endY: p.dy }));
}

// Insert collinear bendpoints so that the computed label position (lx, ly) ends up where Archi
// renders the label for textPosition=1 (Middle). Archi (draw2d ConnectionLocator.MIDDLE) uses
// the middle point of the drawn point list (source anchor, bendpoints, target anchor) by index;
// for an even count it takes the midpoint of the middle segment. So the label sits exactly on a
// bendpoint when the same number of bendpoints lies before and after it.
//
// Strategy: project (lx,ly) onto the nearest path segment (or reuse the bendpoint it coincides
// with), then add evenly-spaced collinear points next to it on the shorter side until both sides
// hold the same number of bendpoints. All added points lie on existing path segments and do not
// change the visual routing.
// srcPort / tgtPort are the physical exit/entry points of the connection on the element
// boundary (ELK section start/end).  Using these instead of element centres ensures
// extra collinear points cannot fall inside source or target elements.
/**
 * @param {Point[]}   bps
 * @param {Point}     src
 * @param {Point}     tgt
 * @param {number}    lx
 * @param {number}    ly
 * @param {Point}     [srcPort]
 * @param {Point}     [tgtPort]
 * @returns {Point[]}
 */
function _insertLabelMidpointBp(bps, src, tgt, lx, ly, srcPort, tgtPort) {
  if (!lx && !ly) return bps;

  // Build path using ports as endpoints (they are on element boundaries, not inside).
  const pathSrc = srcPort || src;
  const pathTgt = tgtPort || tgt;
  const path = [pathSrc, ...bps, pathTgt];
  const n    = path.length;
  if (n < 2) return bps;

  // Find the segment nearest to (lx, ly)
  let seg = 0, minD = Infinity;
  for (let i = 0; i < n - 1; i++) {
    const dx = path[i+1].x - path[i].x, dy = path[i+1].y - path[i].y;
    const len2 = dx*dx + dy*dy;
    if (len2 < 0.001) continue;
    const t  = Math.max(0, Math.min(1, ((lx - path[i].x)*dx + (ly - path[i].y)*dy) / len2));
    const d  = Math.hypot(lx - (path[i].x + t*dx), ly - (path[i].y + t*dy));
    if (d < minD) { minD = d; seg = i; }
  }

  const A = path[seg], B = path[seg + 1];
  // Snap (lx, ly) onto the segment so all interpolated points stay on the segment line.
  const segDx = B.x - A.x, segDy = B.y - A.y;
  const segLen2 = segDx*segDx + segDy*segDy;
  const tSnap = segLen2 > 0.001
    ? Math.max(0, Math.min(1, ((lx - A.x)*segDx + (ly - A.y)*segDy) / segLen2))
    : 0;

  // P = label point; head / tail = bendpoints before / after it; prev / next = its path neighbours.
  let P, head, tail, prev, next;
  const EPS = 0.01;
  if (tSnap > EPS && tSnap < 1 - EPS) {
    // Inside the segment: P becomes a new bendpoint.
    P = { x: Math.round(A.x + tSnap * segDx), y: Math.round(A.y + tSnap * segDy) };
    head = bps.slice(0, seg); tail = bps.slice(seg); prev = A; next = B;
  } else {
    // On a segment end: reuse that vertex instead of inserting a duplicate.
    const v = tSnap <= EPS ? seg : seg + 1;  // path index of the vertex
    if (v === 0 || v === n - 1) {
      return bps;
    }
    P = path[v];
    head = bps.slice(0, v - 1); tail = bps.slice(v); prev = path[v - 1]; next = path[v + 1];
  }

  // Balance: equal bendpoint counts on both sides of P.
  const diff = tail.length - head.length;
  const b = Math.max(0, diff), a = Math.max(0, -diff);
  const befPts = Array.from({ length: b }, (_, i) => ({
    x: Math.round(prev.x + (P.x - prev.x) * (i + 1) / (b + 1)),
    y: Math.round(prev.y + (P.y - prev.y) * (i + 1) / (b + 1)),
  }));
  const aftPts = Array.from({ length: a }, (_, i) => ({
    x: Math.round(P.x + (next.x - P.x) * (i + 1) / (a + 1)),
    y: Math.round(P.y + (next.y - P.y) * (i + 1) / (a + 1)),
  }));

  return [...head, ...befPts, P, ...aftPts, ...tail];
}

/**
 * Bendpoints with room for the end symbols: none within CONNECTION_END_ROOM of the element at either
 * end, and none within BENDPOINT_MIN_GAP of the previous one.
 * @param {Point[]} bps
 * @param {Box}     startBox  element the line starts at (absolute)
 * @param {Box}     endBox    element the line ends at
 * @returns {Point[]}
 */
function _clearEnds(bps, startBox, endBox) {
  /** @type {Point[]} */
  const kept = [];
  for (const p of bps) {
    if (_boxDistance(p, startBox) < CONNECTION_END_ROOM || _boxDistance(p, endBox) < CONNECTION_END_ROOM) continue;
    const q = kept[kept.length - 1];
    if (q && Math.hypot(p.x - q.x, p.y - q.y) < BENDPOINT_MIN_GAP) continue;
    kept.push(p);
  }
  return kept;
}

/**
 * Distance from a point to a box; 0 inside.
 * @param {Point} p
 * @param {Box}   b
 */
function _boxDistance(p, b) {
  const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.width));
  const dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.height));
  return Math.hypot(dx, dy);
}

/**
 * The point CONNECTION_END_ROOM along the line from where Archi lets it leave the box (towards the
 * box centre's line to `toward`) — the end of the stretch kept free for the end symbol.
 * @param {Box}   b
 * @param {Point} toward  first bendpoint outside the box
 * @returns {Point}
 */
function _roomPoint(b, toward) {
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  const dx = toward.x - cx, dy = toward.y - cy;
  const t = Math.min(dx ? b.width / 2 / Math.abs(dx) : Infinity, dy ? b.height / 2 / Math.abs(dy) : Infinity);
  const ax = cx + dx * t, ay = cy + dy * t;   // Archi's anchor on the border
  const len = Math.hypot(toward.x - ax, toward.y - ay);
  const k = len > 0 ? Math.min(1, CONNECTION_END_ROOM / len) : 0;
  return { x: Math.round(ax + (toward.x - ax) * k), y: Math.round(ay + (toward.y - ay) * k) };
}

/**
 * Return a copy of nodes sorted so every node comes after its parent.
 * Stable for same-depth nodes. Engine-agnostic (every adapter sets parentId).
 * @param {LayoutResultNode[]}               nodes
 * @param {Record<string, LayoutResultNode>} nodeById
 * @returns {LayoutResultNode[]}
 */
function _sortNodesParentFirst(nodes, nodeById) {
  /** @type {Record<string, number>} */
  const depth = Object.create(null);
  const VISITING = -1;
  /**
   * @param {LayoutResultNode} n
   * @returns {number}
   */
  function d(n) {
    if (depth[n.id] !== undefined) return depth[n.id] === VISITING ? 0 : depth[n.id];
    depth[n.id] = VISITING;
    const parent = n.parentId && nodeById[n.parentId];
    depth[n.id] = parent ? 1 + d(parent) : 0;
    return depth[n.id];
  }
  nodes.forEach(d);
  return nodes.slice().sort((a, b) => depth[a.id] - depth[b.id]);
}

module.exports = { planWrite };
