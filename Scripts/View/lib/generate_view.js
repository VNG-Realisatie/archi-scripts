/**
 * View generation API.
 *
 * Orchestrates: validate preset → build object set → assign nesting roles →
 * build LayoutGraph → call engine adapter → write Archi view.
 *
 * Entry points call this module; GUI calls it after collecting a preset.
 */
console.log("generate_view.js");

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
  validatePreset,
} = Defs;

const JUNCTION_DIAMETER = 14;

// ── Engine loaders (lazy) ─────────────────────────────────────────────────────

let _elkAdapter = null, _dagreAdapter = null, _dotAdapter = null;
function _getAdapter(engine) {
  if (engine === "ELK")      { if (!_elkAdapter)   _elkAdapter   = require(REPO_ROOT + "View/lib/engines/elk");   return _elkAdapter; }
  if (engine === "Dagre")    { if (!_dagreAdapter) _dagreAdapter = require(REPO_ROOT + "View/lib/engines/dagre"); return _dagreAdapter; }
  if (engine === "Graphviz") { if (!_dotAdapter)   _dotAdapter   = require(REPO_ROOT + "View/lib/engines/dot");   return _dotAdapter; }
  throw `Unknown engine: "${engine}"`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate, expand, or re-layout one or more Archi views.
 *
 * @param {Object}          rawPreset    raw preset object (will be validated)
 * @param {ArchiCollection} uiSelection  $(selection) from Archi UI
 * @returns {ArchimateView[]}            created or modified views
 */
function generate_view(rawPreset, uiSelection) {
  const preset = validatePreset(rawPreset);

  const timer = Common.startCounter ? Common.startCounter() : null;

  console.log(`\n=== generate_view ===`);
  console.log(`Algorithm: ${preset.algorithm}  Action: ${preset.action || ACTION.NEW_VIEW.id}`);
  console.log(`Name: "${preset.view.name}"  Folder: "${preset.view.folder}"`);

  const actionId = preset.action || ACTION.NEW_VIEW.id;
  const views    = [];

  try {
    if (actionId === ACTION.ONE_EACH.id) {
      views.push(..._generateOneEach(preset, uiSelection));
    } else {
      const view = _generateSingle(preset, uiSelection, actionId, null);
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
  const { elements, relations, diagramObjects, diagramConnections, visualObjects } =
    Pipeline.buildObjectSet(uiSelection, preset, actionId);

  console.log(`\nObject set: ${elements.length} elements, ${relations.length} relations, ${diagramObjects.length} diagram objects, ${diagramConnections.length} diagram connections`);

  // Nesting pre-processing: assign each relation a role
  const nestingTypes  = new Set(preset.params.nestingRelationTypes || []);
  const reverseTypes  = new Set(preset.params.reverseRelationTypes || []);
  const nestingRels   = [];
  const routedRels    = [];
  for (const rel of relations) {
    if (nestingTypes.has(rel.type)) nestingRels.push(rel);
    else                            routedRels.push(rel);
  }

  if (actionId === ACTION.LAYOUT_ONLY.id) {
    return _layoutOnlyView(preset, visualObjects);
  }

  // Build existingVoMap for EXPAND_VIEW: maps conceptId/voId → existing VisualObject.
  // Used in _writeView to reposition existing VOs instead of re-adding them.
  const existingVoMap = {};
  if (actionId === ACTION.EXPAND_VIEW.id) {
    (visualObjects || []).forEach(vo => {
      existingVoMap[vo.id] = vo;
      if (vo.concept && vo.concept.id) existingVoMap[vo.concept.id] = vo;
    });
  }

  // Build LayoutGraph
  const graph = _buildLayoutGraph(preset, elements, routedRels, nestingRels, visualObjects, diagramObjects);
  if (graph.nodes.length === 0) {
    console.log("No elements to place — view not generated.");
    return null;
  }

  // Run layout
  const alg     = ALGORITHMS[preset.algorithm];
  const adapter = _getAdapter(alg.engine);
  const result  = adapter.layout(graph);
  console.log(`Layout result: ${result.nodes.length} nodes, ${result.edges.length} edges`);

  // Write view
  const viewName = viewNameOverride || _resolveViewName(preset, elements);
  return _writeView(preset, result, elements, routedRels, nestingRels, viewName,
                    diagramObjects, diagramConnections, existingVoMap);
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
    const view = _generateSingle(preset, $(element), ACTION.NEW_VIEW.id, element.name + (preset.view.suffix || ""));
    if (view) views.push(view);
  }
  return views;
}

// ── Layout only ───────────────────────────────────────────────────────────────

function _layoutOnlyView(preset, visualObjects) {
  if (visualObjects.length === 0) throw "Layout only: no visual objects in selection";

  // Rebuild elements and relations from visual objects.
  // Diagram objects (no model concept) are included as proxy nodes so the layout
  // engine positions them alongside elements instead of leaving them behind.
  const elements   = [];
  const relations  = [];
  const voById     = {};  // id → visual object for applying results back

  for (const vo of visualObjects) {
    voById[vo.id] = vo;
    const t = vo.type || "";
    // Check DIAGRAM_TYPES first — view-references may have a non-null .concept (the ArchimateView),
    // but must still be treated as diagram proxies, not as model elements.
    if (t in Defs.DIAGRAM_TYPES) {
      elements.push({ id: vo.id, type: t, name: vo.name || t,
                      _width:  (vo.bounds && vo.bounds.width)  || preset.params.elementWidth  || 140,
                      _height: (vo.bounds && vo.bounds.height) || preset.params.elementHeight || 60 });
    } else {
      const concept = vo.concept;
      if (concept && concept.type && concept.type.endsWith("-relationship")) {
        relations.push(concept);
      } else if (concept) {
        // Layout algorithm controls size; visual properties are saved/restored by _applyResultToView.
        elements.push(concept);
        voById[concept.id] = vo;
      }
    }
  }

  const nestingTypes = new Set(preset.params.nestingRelationTypes || []);
  const nestingRels  = relations.filter(r => nestingTypes.has(r.type));
  const routedRels   = relations.filter(r => !nestingTypes.has(r.type));

  const graph  = _buildLayoutGraph(preset, elements, routedRels, nestingRels, visualObjects);
  const alg    = ALGORITHMS[preset.algorithm];
  const result = _getAdapter(alg.engine).layout(graph);

  // Update existing view in-place: reposition both ArchiMate elements and diagram objects
  const view = visualObjects[0].view;
  _applyResultToView(result, view, voById);
  console.log(`Layout only applied to "${view.name}"`);
  model.openInUI(view);
  return view;
}

// ── LayoutGraph builder ───────────────────────────────────────────────────────

function _buildLayoutGraph(preset, elements, routedRels, nestingRels, visualObjects, diagramObjects) {
  diagramObjects = diagramObjects || [];
  const params = preset.params;

  // Determine parent-child relationships from nesting relations
  const nestingTypes = new Set(preset.params.nestingRelationTypes || []);
  const reverseTypes = new Set(preset.params.reverseRelationTypes || []);

  // Build occurrenceMap for showInEveryContainer
  const occurrenceMap = {};  // archiId → [nodeIds]
  for (const el of elements) occurrenceMap[el.id] = [el.id];

  // Build parent map from nesting relations
  const parentMap = {};
  const parentRels = [];
  for (const rel of nestingRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId) continue;

    // By convention: the source contains the target
    // (reverseTypes flips this so target contains source)
    const [parentId, childId] = reverseTypes.has(rel.type) ? [tgtId, srcId] : [srcId, tgtId];

    if (!params.showInEveryContainer) {
      if (parentMap[childId] === undefined) {
        parentMap[childId] = parentId;
        parentRels.push(rel);
      }
    } else {
      // Create additional occurrence nodes for elements in multiple containers
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

  // Build nodes
  const nodes = [];
  const nodeIds = new Set();
  for (const el of elements) {
    const baseNode = {
      id:          el.id,
      label:       el.name || "",
      elementType: el.type || "",
      // Diagram object proxies carry _width/_height from their current visual bounds.
      width:       el._width  || (el.type === "junction" ? JUNCTION_DIAMETER : params.elementWidth),
      height:      el._height || (el.type === "junction" ? JUNCTION_DIAMETER : params.elementHeight),
      parent:      parentMap[el.id] || null,
    };
    nodes.push(baseNode);
    nodeIds.add(el.id);

    // Occurrence nodes for showInEveryContainer
    const occs = occurrenceMap[el.id] || [];
    for (const occId of occs) {
      if (occId !== el.id) {
        nodes.push({ ...baseNode, id: occId, parent: parentMap[occId] || null });
        nodeIds.add(occId);
      }
    }
  }

  // Add diagram objects as root-level nodes using their current visual bounds
  for (const vo of diagramObjects) {
    if (nodeIds.has(vo.id)) continue;
    nodes.push({
      id:          vo.id,
      label:       vo.name || "",
      elementType: vo.type || "",
      width:       (vo.bounds && vo.bounds.width)  || params.elementWidth  || 140,
      height:      (vo.bounds && vo.bounds.height) || params.elementHeight || 60,
      parent:      null,  // diagram objects are not part of nesting relations
    });
    nodeIds.add(vo.id);
  }

  // Build edges from routed relations
  const edges = [];
  const edgeIds = new Set();
  for (const rel of routedRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId || !nodeIds.has(srcId) || !nodeIds.has(tgtId)) continue;
    if (edgeIds.has(rel.id)) continue;
    edgeIds.add(rel.id);

    const srcOccs = occurrenceMap[srcId] || [srcId];
    const tgtOccs = occurrenceMap[tgtId] || [tgtId];

    srcOccs.forEach((srcOccId, si) => {
      tgtOccs.forEach((tgtOccId, ti) => {
        const edgeId = (srcOccs.length === 1 && tgtOccs.length === 1)
          ? rel.id
          : `${rel.id}_${si}_${ti}`;
        edges.push({
          id:          edgeId,
          source:      srcOccId,
          target:      tgtOccId,
          label:       rel.name || "",
          weight:      RELATION_WEIGHT_MAP[rel.type] || 1.0,
          reversed:    reverseTypes.has(rel.type),
        });
      });
    });
  }

  return {
    algorithm:      preset.algorithm,
    nodes,
    edges,
    options:        params,
    alignSameType:  params.alignSameType || false,
    sortContainers: !params.sortContainers,  // GUI "sort" checked = containers sorted = sortLeavesOnly=false
    _parentMap:     parentMap,
    _parentRels:    parentRels,
    _occurrenceMap: occurrenceMap,
  };
}

// ── View writer ───────────────────────────────────────────────────────────────

/**
 * Recreate a source diagram VisualObject in the target view at the layout position.
 * Returns the new VisualObject, or null on failure.
 */
function _recreateDiagramObject(view, sourceVo, rn) {
  const def = Defs.DIAGRAM_TYPES[sourceVo.type];
  if (!def || !def.createFn) {
    console.log(`  Skipping ${sourceVo.type} "${sourceVo.name || ""}" (no creation API)`);
    return null;
  }
  try {
    let newVo;
    if (def.createFn === "createViewReference") {
      const refView = sourceVo.refView;
      if (!refView) {
        console.log(`  Skipping view-reference: no refView`);
        return null;
      }
      newVo = view.createViewReference(refView, rn.x, rn.y, rn.width, rn.height);
    } else if (def.createFn === "createConnection") {
      // Requires source and target VisualObjects — not available at this call site; skip.
      console.log(`  Skipping diagram-model-connection (source/target resolution not yet implemented)`);
      return null;
    } else {
      // createObject: note, group, legend
      newVo = view.createObject(def.createType, rn.x, rn.y, rn.width, rn.height);
      if (newVo) {
        for (const prop of def.copyProps) {
          try {
            const val = sourceVo[prop];
            if (val !== undefined && val !== null) newVo[prop] = val;
          } catch (e) {}
        }
      }
    }
    console.log(`  Added ${sourceVo.type} "${sourceVo.name || sourceVo.type}" at (${rn.x}, ${rn.y})`);
    return newVo;
  } catch (e) {
    console.log(`  Failed to recreate ${sourceVo.type}: ${e}`);
    return null;
  }
}

/**
 * Find the new VisualObject in visualIndex that corresponds to an endpoint of a
 * diagram-model-connection. The endpoint is a VisualObject from the source view.
 */
function _findVOForEndpoint(endpointVO, visualIndex) {
  if (!endpointVO) return null;
  // ArchiMate element VOs are keyed by concept.id; diagram object VOs by their own id.
  return (endpointVO.concept ? visualIndex[endpointVO.concept.id] : null)
      || visualIndex[endpointVO.id];
}

function _writeView(preset, result, elements, routedRels, nestingRels, viewName,
                    diagramObjects, diagramConnections, existingVoMap) {
  const folder = _resolveFolder(preset.view.folder);
  const view   = _getOrCreateView(folder, viewName);

  const visualIndex  = {};  // nodeId → VisualObject
  const diagramVoById = {};
  (diagramObjects || []).forEach(vo => { diagramVoById[vo.id] = vo; });

  // Draw nodes
  console.log(`Drawing ${result.nodes.length} nodes...`);
  for (const rn of result.nodes) {
    const archiId = rn.id.includes("_occ_") ? rn.id.substring(0, rn.id.lastIndexOf("_occ_")) : rn.id;

    // EXPAND_VIEW: check if the visual object already exists on the view.
    // If so, reposition it rather than adding a fresh copy (which would lose visual properties).
    const existingVO = existingVoMap && existingVoMap[archiId];
    if (existingVO) {
      existingVO.bounds = { x: rn.x, y: rn.y, width: rn.width, height: rn.height };
      visualIndex[rn.id] = existingVO;
      continue;
    }

    const el = $(`#${archiId}`).first();

    // Find parent visual if this node has a parent
    const parentNodeId = _findParentNodeId(rn.id, result);
    const parentVisual = parentNodeId ? visualIndex[parentNodeId] : null;

    // el found by $('#archiId') may be a diagram VO (group, note, view-reference) — those have IDs
    // but require view.createObject() / createViewReference(), not view.add(el, x, y, w, h).
    const elIsDiagram = el && el.id && el.type && (el.type in Defs.DIAGRAM_TYPES);

    if (el && el.id && !elIsDiagram) {
      // New ArchiMate model element: add to view
      try {
        if (parentVisual) {
          const parentRn  = result.nodes.find(n => n.id === parentNodeId);
          const relX = rn.x - (parentRn ? parentRn.x : 0);
          const relY = rn.y - (parentRn ? parentRn.y : 0);
          visualIndex[rn.id] = parentVisual.add(el, relX, relY, rn.width, rn.height);
        } else {
          visualIndex[rn.id] = view.add(el, rn.x, rn.y, rn.width, rn.height);
        }
      } catch (e) {
        console.error(`Failed to add element ${archiId}: ${e}`);
      }
    } else {
      // New diagram object: recreate in the target view.
      // sourceVo comes from diagramVoById; if el was found by $() it's the same VO.
      const sourceVo = diagramVoById[archiId] || (elIsDiagram ? el : null);
      if (!sourceVo) continue;
      const newVo = _recreateDiagramObject(view, sourceVo, rn);
      if (newVo) visualIndex[rn.id] = newVo;
    }
  }

  // Draw edges
  console.log(`Drawing ${result.edges.length} relations...`);
  for (const re of result.edges) {
    const archiRel = $(`#${re.id}`).first();
    if (!archiRel || !archiRel.id) {
      // occurrence edge — find original
      const baseId = re.id.includes("_") ? re.id.split("_")[0] : re.id;
      // skip if no archi relation found
      continue;
    }

    const srcVisual = visualIndex[re.sourceId] || visualIndex[archiRel.source && archiRel.source.id];
    const tgtVisual = visualIndex[re.targetId] || visualIndex[archiRel.target && archiRel.target.id];
    if (!srcVisual || !tgtVisual) continue;

    try {
      const connection = view.add(archiRel, srcVisual, tgtVisual);

      // Set label position
      const lpMap = { Source: 0, Middle: 1, Target: 2, Natural: 1 };
      const lp = lpMap[preset.params.labelPosition];
      if (lp !== undefined) connection.textPosition = lp;

      // Set bendpoints (skip if straight routing)
      if (!re.isStraight && re.bendpoints && re.bendpoints.length > 0) {
        const srcCenter = _getAbsCenter(srcVisual);
        const tgtCenter = _getAbsCenter(tgtVisual);
        const isReversed = (preset.params.reverseRelationTypes || []).includes(archiRel.type);

        const archiBps = re.bendpoints.map(bp => ({
          startX: Math.round(bp.x - srcCenter.x),
          startY: Math.round(bp.y - srcCenter.y),
          endX:   Math.round(bp.x - tgtCenter.x),
          endY:   Math.round(bp.y - tgtCenter.y),
        }));

        const ordered = isReversed ? archiBps.reverse() : archiBps;
        ordered.forEach((bp, i) => connection.addRelativeBendpoint(bp, i));
      }
    } catch (e) {
      console.error(`Failed to add relation ${re.id}: ${e}`);
    }
  }

  // Draw nesting (parent-child) connections
  for (const rel of (nestingRels || [])) {
    const srcV = visualIndex[rel.source && rel.source.id];
    const tgtV = visualIndex[rel.target && rel.target.id];
    if (srcV && tgtV) {
      try { view.add(rel, srcV, tgtV); } catch (e) {}
    }
  }

  // Draw diagram-model-connections (non-ArchiMate connections between diagram objects).
  // Must run after all nodes are placed so visualIndex is fully populated.
  for (const conn of (diagramConnections || [])) {
    const srcVO = _findVOForEndpoint(conn.source, visualIndex);
    const tgtVO = _findVOForEndpoint(conn.target, visualIndex);
    if (!srcVO || !tgtVO) {
      console.log(`  Skipping diagram-model-connection: source or target not on view`);
      continue;
    }
    try {
      const newConn = view.createConnection(srcVO, tgtVO);
      if (newConn) {
        const def = Defs.DIAGRAM_TYPES["diagram-model-connection"];
        for (const p of (def ? def.copyProps : [])) {
          try { if (conn[p] != null) newConn[p] = conn[p]; } catch(e) {}
        }
      }
    } catch(e) { console.log(`  Failed to create diagram-model-connection: ${e}`); }
  }

  // Log: count objects actually on the new view
  try {
    let _vEl = 0, _vRel = 0, _vDiag = 0;
    $(view).find("element").each(() => _vEl++);
    $(view).find("relation").each(() => _vRel++);
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => { try { $(view).find(dt).each(() => _vDiag++); } catch(e) {} });
    console.log(`Objects on view: ${_vEl} elements · ${_vRel} relations · ${_vDiag} diagram objects`);
  } catch(e) {}

  console.log(`\nView "${viewName}" written to "${folder.name}"`);
  try { model.openInUI(view); } catch (e) {}
  return view;
}

const _VISUAL_PROPS = ["fillColor", "lineColor", "fontColor", "fontSize", "fontName", "fontStyle", "opacity"];

function _applyResultToView(result, view, extraVoById) {
  // Index visual elements by concept ID (ArchiMate elements)
  const visualIndex = {};
  $(view).find("element").each(el => { visualIndex[el.concept && el.concept.id] = el; });
  // Also use the explicit voById map from _layoutOnlyView (for diagram objects indexed by their own id)
  const voById = extraVoById || {};

  for (const rn of result.nodes) {
    const vo = visualIndex[rn.id] || voById[rn.id];  // ArchiMate element or diagram object
    if (!vo) continue;
    // Save visual properties — jArchi resets them when bounds are changed
    const saved = {};
    _VISUAL_PROPS.forEach(p => { try { const v = vo[p]; if (v != null) saved[p] = v; } catch(e) {} });
    vo.bounds = { x: rn.x, y: rn.y, width: rn.width, height: rn.height };
    // Restore visual properties
    _VISUAL_PROPS.forEach(p => { try { if (saved[p] != null) vo[p] = saved[p]; } catch(e) {} });
  }

  for (const re of result.edges) {
    let connection = null;
    $(view).find("relation").each(rel => {
      if (rel.concept && rel.concept.id === re.id) connection = rel;
    });
    if (!connection || re.isStraight || !re.bendpoints.length) continue;
    try {
      connection.deleteAllBendpoints();
      const srcCenter = _getAbsCenter(connection.source);
      const tgtCenter = _getAbsCenter(connection.target);
      re.bendpoints.forEach((bp, i) => {
        connection.addRelativeBendpoint({
          startX: Math.round(bp.x - srcCenter.x),
          startY: Math.round(bp.y - srcCenter.y),
          endX:   Math.round(bp.x - tgtCenter.x),
          endY:   Math.round(bp.y - tgtCenter.y),
        }, i);
      });
    } catch (e) {}
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _findParentNodeId(nodeId, result) {
  // Check the graph's parent map embedded in result (passed through via _buildLayoutGraph)
  // We rely on the fact that the parent relationship is encoded in the node.parent field
  const node = result.nodes.find(n => n.id === nodeId);
  return (node && node.parent) ? node.parent : null;
}

function _resolveViewName(preset, elements) {
  if (preset.view.name) return preset.view.name + (preset.view.suffix || "");
  const first = elements[0];
  const alg   = ALGORITHMS[preset.algorithm];
  const base  = first ? first.name : "Generated";
  return base + (preset.view.suffix || "") + " — " + (alg ? alg.engineAlgorithmId : preset.algorithm);
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
