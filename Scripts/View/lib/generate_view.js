/**
 * View generation API.
 *
 * Orchestrator. One pipeline → one layout engine call → one writer (action-agnostic).
 *
 * The writer's rule (§A.11.11): per result object,
 *   exists on target view? → reposition (appearance preserved; parenthood re-derived from §A.6)
 *   else                  → create (default appearance)
 *
 * No per-action branches inside the writer. Action only determines (a) which
 * objects feed the layout and (b) which view is the target.
 */
console.log("Loading generate_view.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const Common       = require(REPO_ROOT + "_lib/Common");
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");

const Defs     = require(REPO_ROOT + "View/lib/defs");
const Pipeline = require(REPO_ROOT + "View/lib/selection_pipeline");

const {
  ACTION, ALGORITHMS, RELATION_WEIGHT_MAP, GENERATED_VIEW_FOLDER,
  validatePreset, effectiveParams,
} = Defs;

const JUNCTION_DIAMETER = 14;

// ── Engine loaders (lazy) ─────────────────────────────────────────────────────

let _elkAdapter = null, _dagreAdapter = null, _graphvizAdapter = null;
function _getAdapter(engine) {
  if (engine === "ELK")      { if (!_elkAdapter)       _elkAdapter       = require(REPO_ROOT + "View/lib/engines/elk");       return _elkAdapter; }
  if (engine === "Dagre")    { if (!_dagreAdapter)     _dagreAdapter     = require(REPO_ROOT + "View/lib/engines/dagre");     return _dagreAdapter; }
  if (engine === "Graphviz") { if (!_graphvizAdapter)  _graphvizAdapter  = require(REPO_ROOT + "View/lib/engines/graphviz");  return _graphvizAdapter; }
  throw `Unknown engine: "${engine}"`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate, expand, or re-layout one or more Archi views.
 *
 * @param {Object}          rawPreset   raw preset object (will be validated)
 * @param {ArchiCollection} uiSelection $(selection) from Archi UI
 * @param {string}          actionId    ACTION.*.id (runtime — not stored in preset)
 * @returns {ArchimateView[]}
 */
function generate_view(rawPreset, uiSelection, actionId) {
  const preset = validatePreset(rawPreset);
  const action = actionId || ACTION.NEW_VIEW.id;

  // §A.10: capability masking. Replace preset.params with the effective subset
  // for runtime consumption. Inactive keys are silently dropped here; the raw
  // preset on disk is preserved by validatePreset for UI restoration on
  // algorithm switch.
  const _rawParams = preset.params;
  preset.params = effectiveParams(preset);
  const _dropped = Object.keys(_rawParams).filter(k => !(k in preset.params)
    && _rawParams[k] !== undefined && _rawParams[k] !== null
    && !(Array.isArray(_rawParams[k]) && _rawParams[k].length === 0));
  if (_dropped.length) console.log(`Algorithm "${preset.algorithm}" ignores inactive params: ${_dropped.join(", ")}`);

  const timer = Common.startCounter ? Common.startCounter() : null;

  console.log(`\n=== generate_view ===`);
  console.log(`Algorithm: ${preset.algorithm}  Action: ${action}`);
  console.log(`Name: "${preset.view.name}"  Folder: "${preset.view.folder}"`);

  const views = [];
  try {
    if (action === ACTION.ONE_EACH.id) {
      views.push(..._generateOneEach(preset, uiSelection));
    } else {
      const view = _generateSingle(preset, uiSelection, action, null);
      if (view) views.push(view);
    }
  } catch (error) {
    console.error(`generate_view error: ${typeof error.stack === "undefined" ? error : error.stack}`);
  }
  if (timer) Common.endCounter(timer, "generate_view");
  return views;
}

// ── Single view ───────────────────────────────────────────────────────────────

function _generateSingle(preset, uiSelection, actionId, viewNameOverride) {
  const objectSet = Pipeline.buildObjectSet(uiSelection, preset, actionId);
  const { elements, relations, diagramObjects, diagramConnections, existingView } = objectSet;
  console.log(`Object set: ${elements.length} elements, ${relations.length} relations, ${diagramObjects.length} diagram objects, ${diagramConnections.length} diagram connections`);

  // Assign each relation a role: nesting (drawn as containment) vs routed (drawn as line).
  const nestingTypes = new Set(preset.params.nestingRelationTypes || []);
  const nestingRels  = [];
  const routedRels   = [];
  for (const rel of relations) {
    if (nestingTypes.has(rel.type)) nestingRels.push(rel);
    else                            routedRels.push(rel);
  }

  // Determine the target view.
  //   EXPAND_VIEW / LAYOUT_ONLY → the selected existing view.
  //   NEW_VIEW                  → a new view (created or overwritten by name).
  let view;
  if (actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id) {
    view = existingView;
    if (!view) {
      console.error(`${actionId}: no existing view in selection`);
      return null;
    }
  } else {
    const viewName = viewNameOverride || _resolveViewName(preset, elements);
    view = _getOrCreateView(_resolveFolder(preset.view.folder), viewName);
  }

  // Build LayoutGraph (uniform — no action branch).
  const graph = _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects);
  if (graph.nodes.length === 0) {
    console.log("No elements to place — view not generated.");
    return null;
  }

  // Run engine.
  const alg = ALGORITHMS[preset.algorithm];
  const result = _getAdapter(alg.engine).layout(graph);
  console.log(`Layout result: ${result.nodes.length} nodes, ${result.edges.length} edges`);

  // Write — single function, action-agnostic.
  return _writeView(preset, result, objectSet, view, graph._parentRels);
}

// ── One view per element ──────────────────────────────────────────────────────

function _generateOneEach(preset, uiSelection) {
  const { elements } = Pipeline.buildObjectSet(uiSelection, preset, ACTION.NEW_VIEW.id);
  if (elements.length === 0) { console.log("No elements selected."); return []; }
  if (elements.length > 20) {
    const cont = window.confirm(`This will generate ${elements.length} views. Continue?`);
    if (!cont) return [];
  }

  const types = new Set(elements.map(e => e.type));
  if (types.size > 1) {
    console.log(`Warning: ${types.size} element types selected for One view each. Consider filtering to one type.`);
  }

  const views = [];
  for (const element of elements) {
    console.log(`\nGenerating view for: ${element.name}`);
    const sep    = Defs.VIEW_NAME_SEPARATOR || " — ";
    const suffix = preset.view.suffix ? sep + preset.view.suffix : "";
    const view = _generateSingle(preset, $(element), ACTION.NEW_VIEW.id, element.name + suffix);
    if (view) views.push(view);
  }
  return views;
}

// ── LayoutGraph builder ───────────────────────────────────────────────────────

function _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects) {
  diagramObjects = diagramObjects || [];
  const params = preset.params;

  const reverseTypes = new Set(preset.params.reverseRelationTypes || []);

  // occurrenceMap: archiId → [nodeIds]   (supports showInEveryContainer)
  const occurrenceMap = {};
  for (const el of elements) occurrenceMap[el.id] = [el.id];

  // parentMap from nesting relations.
  const parentMap = {};
  const parentRels = [];
  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId) continue;
    const [parentId, childId] = reverseTypes.has(rel.type) ? [tgtId, srcId] : [srcId, tgtId];

    if (!params.showInEveryContainer) {
      if (parentMap[childId] === undefined) {
        parentMap[childId] = parentId;
        parentRels.push(rel);
      }
    } else {
      const occs = occurrenceMap[childId] || [childId];
      const unassigned = occs.find(id => parentMap[id] === undefined);
      if (unassigned) {
        parentMap[unassigned] = parentId;
      } else {
        const alreadyHere = occs.find(id => parentMap[id] === parentId);
        if (!alreadyHere) {
          const occId = `${childId}_occ_${occs.length}`;
          occurrenceMap[childId] = [...occs, occId];
          parentMap[occId] = parentId;
        }
      }
      parentRels.push(rel);
    }
  }

  // Nodes from elements.
  const nodes = [];
  const nodeIds = new Set();
  for (const el of elements) {
    const baseNode = {
      id:          el.id,
      label:       el.name || "",
      elementType: el.type || "",
      width:       el._width  || (el.type === "junction" ? JUNCTION_DIAMETER : params.elementWidth),
      height:      el._height || (el.type === "junction" ? JUNCTION_DIAMETER : params.elementHeight),
      parent:      parentMap[el.id] || null,
    };
    nodes.push(baseNode);
    nodeIds.add(el.id);

    const occs = occurrenceMap[el.id] || [];
    for (const occId of occs) {
      if (occId !== el.id) {
        nodes.push({ ...baseNode, id: occId, parent: parentMap[occId] || null });
        nodeIds.add(occId);
      }
    }
  }

  // Diagram-object nodes (root-level, sized from current canvas bounds).
  // diagram-model-connection objects are edges, never nodes (§A.5 step 6).
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

  // Edges from routed relations.
  const edges = [];
  const edgeIds = new Set();
  for (const rel of routedRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId || !nodeIds.has(srcId) || !nodeIds.has(tgtId)) continue;
    if (edgeIds.has(rel.id)) continue;
    edgeIds.add(rel.id);

    const isReversed = reverseTypes.has(rel.type);
    const srcOccs = occurrenceMap[srcId] || [srcId];
    const tgtOccs = occurrenceMap[tgtId] || [tgtId];
    srcOccs.forEach((srcOccId, si) => {
      tgtOccs.forEach((tgtOccId, ti) => {
        const edgeId = (srcOccs.length === 1 && tgtOccs.length === 1)
          ? rel.id
          : `${rel.id}_${si}_${ti}`;
        // For reversed-typed relations, swap source/target so the layout
        // engine traverses the edge in the reversed direction. The model
        // relation is untouched; Archi draws using its intrinsic direction.
        edges.push({
          id:     edgeId,
          source: isReversed ? tgtOccId : srcOccId,
          target: isReversed ? srcOccId : tgtOccId,
          label:  rel.name || "",
          weight: RELATION_WEIGHT_MAP[rel.type] || 1.0,
        });
      });
    });
  }

  return {
    algorithm:      preset.algorithm,
    nodes, edges,
    options:        params,
    alignSameType:  params.alignSameType || false,
    sortContainers: !params.sortContainers,
    _parentMap:     parentMap,
    _parentRels:    parentRels,
    _occurrenceMap: occurrenceMap,
  };
}

// ── View writer ───────────────────────────────────────────────────────────────

/**
 * Apply a layout result to a target view. Action-agnostic.
 *
 * Per-object rule (§A.11.11):
 *   - exists → reposition (appearance preserved; parenthood re-derived from §A.6).
 *   - Otherwise → create (default appearance).
 *
 * Same rule for visual relations: existing → rewrite bendpoints; new → add.
 *
 * Parent-first iteration (§A.11.10) guarantees a child's parent VO is in place
 * (added or repositioned) before the child is processed.
 */
function _writeView(preset, result, objectSet, view, parentRels) {
  // Index result nodes once. Sort parent-first (engine output may be arbitrary order).
  const nodeById = Object.create(null);
  result.nodes.forEach(n => { nodeById[n.id] = n; });
  const sortedNodes = _sortNodesParentFirst(result.nodes, nodeById);

  // Existence maps from the pipeline output.
  const existingVoByConcept = new Map();   // conceptId → VisualElement
  const existingVoByVoId    = new Map();   // VO id     → DiagramObject (or VisualElement)
  const existingRelByConcept = new Map();  // conceptId → VisualRelation

  (objectSet.visualElements || []).forEach(ve => {
    if (ve.concept && ve.concept.id) existingVoByConcept.set(ve.concept.id, ve);
    existingVoByVoId.set(ve.id, ve);
  });
  (objectSet.diagramObjects || []).forEach(dvo => { existingVoByVoId.set(dvo.id, dvo); });
  (objectSet.visualRelations || []).forEach(vr => {
    if (vr.concept && vr.concept.id) existingRelByConcept.set(vr.concept.id, vr);
  });

  const visualIndex = {};  // result-node id → VisualObject (existing or freshly added)

  // ── Nodes: reposition existing, add new ──
  console.log(`Writing ${sortedNodes.length} nodes...`);
  for (const rn of sortedNodes) {
    const archiId = rn.id.includes("_occ_") ? rn.id.substring(0, rn.id.lastIndexOf("_occ_")) : rn.id;
    const existing = existingVoByConcept.get(archiId) || existingVoByVoId.get(archiId);

    if (existing) {
      // Derive desired parent from this run's nesting decisions (§A.6.6, §A.11.9).
      const newParentVisual = rn.parentId ? visualIndex[rn.parentId] : null;
      const currentParentVO = $(existing).parent().filter("element").first() || null;
      const newParentId = newParentVisual ? String(newParentVisual.id) : null;
      const curParentId = currentParentVO ? String(currentParentVO.id) : null;

      if (newParentId !== curParentId) {
        // jArchi 1.10 move API: parent.add(existingVO, x, y) moves without deletion.
        const target = newParentVisual || view;
        const parentRn = newParentVisual ? nodeById[rn.parentId] : null;
        const relX = parentRn ? rn.x - parentRn.x : rn.x;
        const relY = parentRn ? rn.y - parentRn.y : rn.y;
        try {
          target.add(existing, relX, relY);
          existing.bounds = { x: relX, y: relY, width: rn.width, height: rn.height };
          visualIndex[rn.id] = existing;
        } catch (e) {
          console.error(`Failed to re-parent element ${archiId}: ${e}`);
        }
        continue;
      }

      // Same parent — reposition within current container.
      const off = _getParentAbsOffset(existing);
      existing.bounds = {
        x: rn.x - off.x,
        y: rn.y - off.y,
        width: rn.width,
        height: rn.height,
      };
      visualIndex[rn.id] = existing;
      continue;
    }

    // Create. Resolve the model element; skip phantom diagram-VO matches from $('#id').
    const el = $(`#${archiId}`).first();
    if (!el || !el.id) continue;
    if (el.type in Defs.DIAGRAM_TYPES) continue;

    const parentVisual = rn.parentId ? visualIndex[rn.parentId] : null;
    const target = parentVisual || view;
    const parentRn = parentVisual ? nodeById[rn.parentId] : null;
    const relX = parentRn ? rn.x - parentRn.x : rn.x;
    const relY = parentRn ? rn.y - parentRn.y : rn.y;
    try {
      visualIndex[rn.id] = target.add(el, relX, relY, rn.width, rn.height);
    } catch (e) {
      console.error(`Failed to add element ${archiId}: ${e}`);
    }
  }

  // ── Edges: reposition existing relations (rewrite bendpoints), add new ──
  console.log(`Writing ${result.edges.length} relations...`);
  for (const re of result.edges) {
    const archiRel = $(`#${re.id}`).first();
    if (!archiRel || !archiRel.id) continue;

    let connection = existingRelByConcept.get(archiRel.id);
    if (!connection) {
      // Always look up visuals via the model relation's own source/target —
      // re.sourceId/targetId may be in layout direction (swapped) for
      // reversed-typed relations.
      const srcVisual = visualIndex[archiRel.source && archiRel.source.id];
      const tgtVisual = visualIndex[archiRel.target && archiRel.target.id];
      if (!srcVisual || !tgtVisual) continue;
      try { connection = view.add(archiRel, srcVisual, tgtVisual); }
      catch (e) { console.error(`Failed to add relation ${re.id}: ${e}`); continue; }
    }
    _applyEdgeStyle(connection, re, preset);
  }

  // ── Nesting connections (parent-child boxes): existing → skip, new → add ──
  for (const rel of (parentRels || [])) {
    if (existingRelByConcept.has(rel.id)) continue;
    const srcV = visualIndex[rel.source && rel.source.id];
    const tgtV = visualIndex[rel.target && rel.target.id];
    if (srcV && tgtV) {
      try { view.add(rel, srcV, tgtV); } catch (e) {}
    }
  }

  // Log: count objects on the view.
  try {
    let _vEl = 0, _vRel = 0, _vDiag = 0;
    $(view).find("element").each(() => _vEl++);
    $(view).find("relation").each(() => _vRel++);
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => { try { $(view).find(dt).each(() => _vDiag++); } catch(e) {} });
    console.log(`Objects on view: ${_vEl} elements · ${_vRel} relations · ${_vDiag} diagram objects`);
  } catch (e) {}
  console.log(`\nView "${view.name}" written`);
  try { $(view).openInUI(); } catch (e) {}
  return view;
}

/**
 * Apply layout-determined edge style: label position + bendpoints. Rewrites
 * existing bendpoints (deleteAll + set new) so the connection routing matches
 * the new layout. Style properties (colour, line width) are untouched.
 *
 * Self-loops (source === target) are always synthesised — engine routing for
 * self-loops is unreliable across engines, and Archi's default rendering
 * places the line inside the element. Synthesis is the single source of truth.
 */
function _applyEdgeStyle(connection, re, preset) {
  const lpMap = { Source: 0, Middle: 1, Target: 2, Natural: 1 };
  const lp = lpMap[preset.params.labelPosition];
  if (lp !== undefined) {
    try { connection.textPosition = lp; } catch (e) {}
  }

  try { connection.deleteAllBendpoints(); } catch (e) {}

  // Self-loop: always synthesise (NE-corner loop). Skip engine bendpoints.
  if (connection.source && connection.target
      && connection.source.id === connection.target.id) {
    _synthesiseSelfLoopBendpoints(connection);
    return;
  }

  if (re.isStraight || !re.bendpoints || re.bendpoints.length === 0) return;

  const srcCenter = _getAbsCenter(connection.source);
  const tgtCenter = _getAbsCenter(connection.target);
  const relType = connection.concept && connection.concept.type;
  const isReversed = (preset.params.reverseRelationTypes || []).includes(relType);
  const archiBps = re.bendpoints.map(bp => ({
    startX: Math.round(bp.x - srcCenter.x),
    startY: Math.round(bp.y - srcCenter.y),
    endX:   Math.round(bp.x - tgtCenter.x),
    endY:   Math.round(bp.y - tgtCenter.y),
  }));
  const ordered = isReversed ? archiBps.reverse() : archiBps;
  ordered.forEach((bp, i) => { try { connection.addRelativeBendpoint(bp, i); } catch (e) {} });
}

/**
 * Synthesise a small NE-corner loop on a self-relation. Three bendpoints
 * placed relative to the element's centre (since source === target, the
 * startX/Y and endX/Y components of each Archi relative-bendpoint coincide).
 *
 * Verified visually by [Scripts/View/_test_self_loops.ajs](_test_self_loops.ajs).
 */
function _synthesiseSelfLoopBendpoints(connection) {
  const ve = connection.source;
  const w = (ve && ve.bounds && ve.bounds.width)  || 140;
  const h = (ve && ve.bounds && ve.bounds.height) || 60;
  const offsets = [
    { dx: Math.round( w / 2 + 10), dy: Math.round(-h / 2)      },  // exit right edge, going up
    { dx: Math.round( w / 2 + 30), dy: Math.round(-h / 2 - 30) },  // NE corner of loop
    { dx: 0,                       dy: Math.round(-h / 2 - 30) },  // re-enter from top
  ];
  offsets.forEach((p, i) => {
    try {
      connection.addRelativeBendpoint(
        { startX: p.dx, startY: p.dy, endX: p.dx, endY: p.dy },
        i
      );
    } catch (e) {}
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Return a copy of nodes sorted so every node comes after its parent.
 * Stable for same-depth nodes. Engine-agnostic (every adapter sets parentId).
 */
function _sortNodesParentFirst(nodes, nodeById) {
  const depth = Object.create(null);
  function d(n) {
    if (depth[n.id] !== undefined) return depth[n.id];
    const parent = n.parentId && nodeById[n.parentId];
    depth[n.id] = parent ? 1 + d(parent) : 0;
    return depth[n.id];
  }
  nodes.forEach(d);
  return nodes.slice().sort((a, b) => depth[a.id] - depth[b.id]);
}

/**
 * Walk a visual object's parent chain in the view tree, summing parent bounds.x/y.
 * Returns the absolute (x, y) of the immediate parent in the view's frame, or
 * (0, 0) if the visual is at root. Under parent-first iteration, callers can rely
 * on parents having been repositioned before children read this.
 */
function _getParentAbsOffset(vo) {
  let x = 0, y = 0;
  try {
    let p = $(vo).parent().filter("element").first();
    while (p) {
      x += p.bounds.x || 0;
      y += p.bounds.y || 0;
      p = $(p).parent().filter("element").first();
    }
  } catch (e) {}
  return { x, y };
}


function _resolveViewName(preset, elements) {
  const sep    = Defs.VIEW_NAME_SEPARATOR || " — ";
  const suffix = preset.view.suffix ? sep + preset.view.suffix : "";
  if (preset.view.name) return preset.view.name + suffix;
  const first = elements[0];
  const base  = first ? first.name : "Generated";
  return base + suffix;
}

function _resolveFolder(viewFolder) {
  const path = viewFolder ? "/Views" + viewFolder : "/Views" + GENERATED_VIEW_FOLDER;
  try { return ArchiFolders.getFolderPath(path); }
  catch (e) { return ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER); }
}

function _getOrCreateView(folder, viewName) {
  let existing = $(folder).children("view").filter(`.${viewName}`).first();
  if (existing) {
    console.log(`Overwriting view: "${viewName}"`);
    $(existing).find().each(o => o.delete());
    return existing;
  }
  const v = model.createArchimateView(viewName);
  folder.add(v);
  console.log(`Created view: "${viewName}"`);
  return v;
}

function _getAbsCenter(visual) {
  let x = (visual.bounds.x || 0) + (visual.bounds.width  || 0) / 2;
  let y = (visual.bounds.y || 0) + (visual.bounds.height || 0) / 2;
  let p = $(visual).parent().filter("element").first();
  while (p) {
    x += p.bounds.x || 0;
    y += p.bounds.y || 0;
    p = $(p).parent().filter("element").first();
  }
  return { x: Math.round(x), y: Math.round(y) };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generate_view };
}
