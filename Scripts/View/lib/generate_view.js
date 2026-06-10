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

const Defs       = require(REPO_ROOT + "View/lib/defs");
const Pipeline   = require(REPO_ROOT + "View/lib/selection_pipeline");
const Appearance = require(REPO_ROOT + "View/lib/appearance");

const {
  ACTION, ALGORITHMS, RELATION_WEIGHT_MAP, GENERATED_VIEW_FOLDER,
  validatePreset, effectiveParams,
} = Defs;

const JUNCTION_DIAMETER = 14;

const { expandNodeSizesForEdgeDensity, sizeLabelBasedNodes } = require(REPO_ROOT + "View/lib/engines/engine-utils");

// ── Engine loaders (lazy) ─────────────────────────────────────────────────────
// require() is memoised by jvm-npm (Require.cache), so repeated calls return the same module.

function _getAdapter(engine) {
  if (engine === "ELK")      return require(REPO_ROOT + "View/lib/engines/elk");
  if (engine === "Dagre")    return require(REPO_ROOT + "View/lib/engines/dagre");
  if (engine === "Graphviz") return require(REPO_ROOT + "View/lib/engines/graphviz");
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

  console.log(`\n=== generate_view ===`);
  console.log(`Action: ${action}`);
  console.log(`Algorithm: ${preset.algorithm}`);
  {
    const p = preset.params;
    const parts = [
      p.direction        && `dir=${p.direction}`,
      p.routing          && `routing=${p.routing}`,
      p.labelPosition    && `label=${p.labelPosition}`,
      `spacing=el:${p.elementSpacing ?? "—"} layer:${p.layerSpacing ?? "—"}`,
      `size=${p.elementWidth ?? "—"}×${p.elementHeight ?? "—"}`,
      (p.nestingRelationTypes && p.nestingRelationTypes.length) && `nesting=${p.nestingRelationTypes.length}types containerAlgo=${p.containerAlgorithm || "(same)"}  connMode=${p.connectionsMode || "Between containers"}`,
    ].filter(Boolean);
    console.log(`Params: ${parts.join("  ")}`);
  }
  console.log(`Name: "${preset.view.name}"  Folder: "${preset.view.folder}"`);
  {
    const vsMode = _rawParams.viewSizeMode || "none";
    const vsVal  = vsMode === "maxWidth"    ? `maxWidth=${_rawParams.maxWidth}`
                 : vsMode === "aspectRatio" ? `aspectRatio=${_rawParams.aspectRatio}`
                 : "none";
    console.log(`View size requested: ${vsVal}`);
  }

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
  console.log(`\ngenerate_view: ${Common.endCounter("generate_view")}`);

  // Open the generated view(s) in Archi's UI.
  //   NEW_VIEW / EXPAND_VIEW / LAYOUT_ONLY → exactly one view in `views`; open it.
  //   ONE_EACH                              → potentially many views; open only the first
  //                                           so the user isn't flooded with N tabs.
  if (views.length > 0) _openView(views[0]);
  return views;
}

/**
 * Open a view in Archi's editor tab. The jArchi proxy's openInUI() does not work
 * reliably for views that were just created in the same script run, so we reach
 * past the proxy via reflection and call EditorManager.openDiagramEditor on the
 * underlying EMF model object directly.
 */
function _openView(view) {
  try {
    const ProxyClass = Packages.com.archimatetool.script.dom.model.ArchimateDiagramModelProxy.class;
    const method     = ProxyClass.getDeclaredMethod("getEObject");
    method.setAccessible(true);
    const eObject = method.invoke(view);
    // 2-arg form with bringToTop=true matches DiagramModelProxy.openInUI()'s final call,
    // so the newly generated view becomes the focused editor tab.
    Packages.com.archimatetool.editor.ui.services.EditorManager.openDiagramEditor(eObject, true);
  } catch (e) {
    console.error(`Failed to open "${view && view.name}" in the UI — open it manually. (${e})`);
  }
}

// ── Single view ───────────────────────────────────────────────────────────────

function _generateSingle(preset, uiSelection, actionId, viewNameOverride) {
  const objectSet = Pipeline.buildObjectSet(uiSelection, preset, actionId);
  const { elements, diagramObjects, diagramConnections, existingView } = objectSet;

  // LAYOUT_ONLY: keep only relations that already have a visual on the view.
  // _findRelationsBetween returns all model relations between the elements, but
  // LAYOUT_ONLY must not add missing relations — it only re-lays out what is there.
  // Note: the dialog live counter shows all model relations in the selection
  // (action-agnostic); this filter is the action-level step that narrows the set
  // at generation time. The counter difference is by design, not an inaccuracy.
  let relations = objectSet.relations;
  if (actionId === ACTION.LAYOUT_ONLY.id) {
    const onViewRelIds = new Set(
      (objectSet.visualRelations || []).map(vr => vr.concept && vr.concept.id).filter(Boolean)
    );
    relations = relations.filter(r => onViewRelIds.has(r.id));
  }

  // Assign each relation a role: nesting (drawn as containment) vs routed (drawn as line).
  const nestingTypes = new Set(preset.params.nestingRelationTypes || []);
  const nestingRels  = [];
  const routedRels   = [];
  for (const rel of relations) {
    if (nestingTypes.has(rel.type)) nestingRels.push(rel);
    else                            routedRels.push(rel);
  }

  // Determine the target view.
  //   EXPAND_VIEW / LAYOUT_ONLY → the selected existing view, unless the preset names a
  //                               specific location — then copy the view there and use the copy.
  //   NEW_VIEW                  → a new view (created or overwritten by name).
  console.log("\nView target:");
  let view;
  if (actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id) {
    view = existingView;
    if (!view) {
      console.error(`${actionId}: no existing view in selection`);
      return null;
    }

    // If the preset names an explicit target view, the location is never ignored.
    // Check whether the existing view already lives there; if not, copy it.
    if (preset.view.name) {
      const targetName   = preset.view.name;
      const targetFolder = _resolveFolder(preset.view.folder);
      const viewAtTarget = $(targetFolder).children("view").filter(`.${targetName}`).first();
      const sameView     = viewAtTarget && String(viewAtTarget.id) === String(view.id);
      if (!sameView) {
        // Remove the stale view at the target location (if any) before copying.
        if (viewAtTarget) {
          try { $(viewAtTarget).find().each(o => o.delete()); viewAtTarget.delete(); } catch (e) { console.error(`Failed to remove stale view "${viewAtTarget.name}" before copy: ${e}`); }
        }
        const copy = view.duplicate(targetFolder);
        copy.name  = targetName;
        // Re-collect VOs from the copy: the duplicate has its own new VO ids.
        const reCollected = _collectVisualsFrom(copy);
        objectSet.visualElements  = reCollected.visualElements;
        objectSet.visualRelations = reCollected.visualRelations;
        view = copy;
        console.log(`  Copied "${existingView.name}" → "${copy.name}"`);
      } else {
        console.log(`  Using: "${view.name}"`);
      }
    } else {
      console.log(`  Using: "${view.name}"`);
    }
  } else {
    const viewName = viewNameOverride || _resolveViewName(preset, elements);
    view = _getOrCreateView(_resolveFolder(preset.view.folder), viewName);
  }

  // Build concept→VOs map once; used by both _buildLayoutGraph (LAYOUT_ONLY cap) and _writeView (VO pairing).
  const existingVosByConcept = new Map();
  for (const ve of (objectSet.visualElements || [])) {
    if (ve.concept && ve.concept.id) {
      const list = existingVosByConcept.get(ve.concept.id);
      if (list) list.push(ve);
      else existingVosByConcept.set(ve.concept.id, [ve]);
    }
  }

  // _buildLayoutGraph caps extra-occurrence nodes for LAYOUT_ONLY only (EXPAND_VIEW allows new VOs).
  // Without the cap, BFS-propagated _occ_N nodes have no matching VO → _writeView creates new VOs,
  // and their nesting VRs render as connection lines because the parent is not yet in position.
  const graphVosCap = actionId === ACTION.LAYOUT_ONLY.id ? existingVosByConcept : null;

  // Build LayoutGraph (uniform — no action branch).
  console.log("\nLayout graph:");
  const graph = _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects, graphVosCap);
  if (graph.nodes.length === 0) {
    console.log("  No elements to place — view not generated.");
    return null;
  }

  // Relation role split. Nesting candidates can be dropped by Archi's one-parent-per-child
  // rule (when !showInEveryContainer) — that's why the on-view relation count can be lower
  // than the pipeline's "Total to view" relations.
  const ns = graph._nestingStats;
  console.log(`  Relation roles: ${nestingRels.length} nestings · ${routedRels.length} connections`);
  if (ns.candidates > 0) {
    const extras = [];
    if (ns.skippedMultiParent > 0) extras.push(`${ns.skippedMultiParent} multi-parent`);
    if (ns.skippedCycle       > 0) extras.push(`${ns.skippedCycle} cycle`);
    const skip = extras.length > 0 ? ` (skipped: ${extras.join(", ")})` : "";
    console.log(`  Nestings applied: ${ns.applied}/${ns.candidates}${skip}`);
  }

  // Run engine.
  console.log("\nLayout:");
  const alg = ALGORITHMS[preset.algorithm];
  const result = _getAdapter(alg.engine).layout(graph);
  console.log(`  Layout result: ${result.nodes.length} elements · ${result.edges.length} connections`);
  if (result.nodes.length > 0) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of result.nodes) {
      if (n.x           < x0) x0 = n.x;
      if (n.y           < y0) y0 = n.y;
      if (n.x + n.width > x1) x1 = n.x + n.width;
      if (n.y + n.height> y1) y1 = n.y + n.height;
    }
    console.log(`  View size generated: ${Math.round(x1 - x0)} × ${Math.round(y1 - y0)} px`);
  }

  // Write — single function, action-agnostic.
  console.log("\nWrite:");
  const writtenView = _writeView(preset, result, objectSet, view, graph._parentRels, existingVosByConcept);

  // Appearance pass — post-write styling (colours, fonts). No-op when all features disabled.
  if (writtenView) Appearance.applyAppearance(writtenView, preset, actionId);

  return writtenView;
}

// ── One view per element ──────────────────────────────────────────────────────

function _generateOneEach(preset, uiSelection) {
  // Seeds = raw model elements from the Archi selection, before preset filter and expansion.
  // Each seed gets its own full pipeline run (filter + expansion + layout + write).
  const seeds = Pipeline.getSeedElements(uiSelection);
  if (seeds.length === 0) { console.log("No elements selected."); return []; }
  if (seeds.length > 20) {
    const cont = window.confirm(`This will generate ${seeds.length} views. Continue?`);
    if (!cont) return [];
  }

  const types = new Set(seeds.map(e => e.type));
  if (types.size > 1) {
    console.log(`Warning: ${types.size} element types selected for One view each. Consider filtering to one type.`);
  }

  const views = [];
  for (const element of seeds) {
    console.log(`\nGenerating view for: ${element.name}`);
    const view = _generateSingle(preset, $(element), ACTION.NEW_VIEW.id, element.name);
    if (view) views.push(view);
  }
  return views;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── LayoutGraph builder ───────────────────────────────────────────────────────

function _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects, existingVosByConcept) {
  diagramObjects = diagramObjects || [];
  const params = preset.params;

  const reverseTypes = new Set(params.reverseRelationTypes || []);

  // Nesting structure shared with the pipeline's predictViewCounts so dialog/console
  // counts agree with the writer's actual output. Single source of truth.
  const nesting = Pipeline.resolveNesting(elements, nestingRels, params);
  const parentMap = nesting.parentMap;
  const occurrenceMap = nesting.occurrenceMap;
  const parentRels = nesting.parentRels;
  const nestingSkippedCycle = nesting.skippedCycle;
  const nestingSkippedMultiParent = nesting.skippedMultiParent;

  // Per-cycle log: surface skipped-cycle rels so users can investigate problematic relations.
  if (nestingSkippedCycle > 0) {
    console.log(`  Nesting skipped: ${nestingSkippedCycle} relation(s) would create a cycle`);
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
    // Cap: for LAYOUT_ONLY, only add as many extra occurrence nodes as there are VOs on the
    // view. Excess nodes have no VO to pair with, so _writeView would create new VOs whose
    // nesting VRs render as connection lines when the parent isn't positioned yet.
    const voCount = existingVosByConcept ? (existingVosByConcept.get(el.id) || []).length : Infinity;
    let addedOccs = 1;  // primary already pushed
    for (const occId of occs) {
      if (occId === el.id) continue;
      if (addedOccs >= voCount) break;
      nodes.push({ ...baseNode, id: occId, parent: parentMap[occId] || null });
      nodeIds.add(occId);
      addedOccs++;
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

  // Extra-occurrence augmentation for LAYOUT_ONLY.
  // Handles manually placed repeated elements at view root that _resolveNesting doesn't
  // know about (no nesting relation drove the repeat). Only root-level VOs are safe to
  // augment: container-level repeats require occurrence-level parent mapping that isn't
  // available here, so they are left in-place (not repositioned).
  if (existingVosByConcept) {
    for (const [conceptId, vos] of existingVosByConcept) {
      const currentOccs = occurrenceMap[conceptId];
      if (!currentOccs || vos.length <= currentOccs.length) continue;
      const baseNode = nodes.find(n => n.id === currentOccs[0]);
      if (!baseNode) continue;
      for (let i = currentOccs.length; i < vos.length; i++) {
        const occId = `${conceptId}_occ_${i}`;
        if (nodeIds.has(occId)) continue;
        const parentConceptId = _currentParentConceptId(vos[i]);
        if (parentConceptId) continue;  // skip: container-level repeats need occurrence-level pairing
        occurrenceMap[conceptId] = [...occurrenceMap[conceptId], occId];
        parentMap[occId] = null;
        nodes.push({ ...baseNode, id: occId, parent: null });
        nodeIds.add(occId);
      }
    }
  }

  // Edges from routed relations.
  const edges = [];
  const edgeIds = new Set();
  for (const rel of routedRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId || !nodeIds.has(srcId) || !nodeIds.has(tgtId)) continue;
    if (srcId === tgtId && !ALGORITHMS[preset.algorithm].supportsSelfLoops) continue;
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
          id:        edgeId,   // occurrence-unique id for the layout engine
          conceptId: rel.id,   // plain model relation id — always used for $() lookup in _writeView
          source: isReversed ? tgtOccId : srcOccId,
          target: isReversed ? srcOccId : tgtOccId,
          label:  rel.name || "",
          weight: RELATION_WEIGHT_MAP[rel.type] || 1.0,
        });
      });
    });
  }

  const engineParams = preset.engineParams || {};
  expandNodeSizesForEdgeDensity(nodes, edges, params);
  sizeLabelBasedNodes(nodes, params, engineParams);

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
    _nestingStats:  {
      candidates:        nestingRels.length,
      applied:           parentRels.length,
      skippedCycle:      nestingSkippedCycle,
      skippedMultiParent: nestingSkippedMultiParent,
    },
  };
}

// ── View writer ───────────────────────────────────────────────────────────────

// Strip the synthetic occurrence suffix added by Pipeline.resolveNesting
// ("conceptId_occ_N") to recover the underlying model concept id.
function _stripOccSuffix(id) {
  const i = id.lastIndexOf("_occ_");
  return i >= 0 ? id.substring(0, i) : id;
}

// Concept id of a VisualElement's current parent VO, or null at view root.
function _currentParentConceptId(ve) {
  const p = $(ve).parent().filter("element").first();
  if (!p) return null;
  return (p.concept && p.concept.id) || p.id || null;
}

// Pick the existing VO that this result node should reposition, or null if
// it must be created fresh. Under multi-occurrence (K VOs for one concept),
// pair by (concept, new-parent concept); tie-break by VisualSet capture order.
// Bound VOs are recorded in consumedVoIds so each VO is written at most once.
// DiagramObjects (no concept) fall through to lookup by VO id.
function _pickExistingVo(rn, archiId, nodeById, existingVosByConcept, existingVoByVoId, consumedVoIds) {
  const candidates = existingVosByConcept.get(archiId);
  if (!candidates || candidates.length === 0) {
    return existingVoByVoId.get(archiId) || null;
  }
  const available = candidates.filter(ve => !consumedVoIds.has(ve.id));
  if (available.length === 0) return null;

  const newParentRn = rn.parentId ? nodeById[rn.parentId] : null;
  const newParentArchiId = newParentRn ? _stripOccSuffix(newParentRn.id) : null;

  let pick = null;
  for (const ve of available) {
    if (_currentParentConceptId(ve) === newParentArchiId) { pick = ve; break; }
  }
  if (!pick) pick = available[0];
  consumedVoIds.add(pick.id);
  return pick;
}

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
function _writeView(preset, result, objectSet, view, parentRels, existingVosByConcept) {
  // Index result nodes once. Sort parent-first (engine output may be arbitrary order).
  const nodeById = Object.create(null);
  result.nodes.forEach(n => { nodeById[n.id] = n; });
  const sortedNodes = _sortNodesParentFirst(result.nodes, nodeById);

  // existingVosByConcept (conceptId → VisualElement[]) is built once in _generateSingle and passed in.
  const existingVoByVoId     = new Map();  // VO id → DiagramObject (or VisualElement)
  const existingRelByConcept = new Map();  // conceptId → VisualRelation

  (objectSet.visualElements || []).forEach(ve => existingVoByVoId.set(ve.id, ve));
  // Diagram objects: only register VOs that currently live on the target view.
  // Guards against referencing deleted VOs when the view was just overwritten (NEW_VIEW).
  const _voIdsOnView = new Set();
  try { $(view).find().each(o => { if (o && o.id) _voIdsOnView.add(String(o.id)); }); } catch(e) { console.error(`Failed to index existing VOs on view "${view.name}": ${e}`); }
  (objectSet.diagramObjects || []).forEach(dvo => {
    if (dvo && dvo.id && _voIdsOnView.has(String(dvo.id))) existingVoByVoId.set(dvo.id, dvo);
  });
  (objectSet.visualRelations || []).forEach(vr => {
    if (vr.concept && vr.concept.id) existingRelByConcept.set(vr.concept.id, vr);
  });

  // Remove existing self-loop connections for algorithms that don't route them.
  if (!ALGORITHMS[preset.algorithm].supportsSelfLoops) {
    existingRelByConcept.forEach((vr, conceptId) => {
      const c = vr.concept;
      if (c && c.source && c.target && c.source.id === c.target.id) {
        try { vr.delete(); } catch (e) {}
        existingRelByConcept.delete(conceptId);
      }
    });
  }

  const visualIndex = {};  // result-node id → VisualObject (existing or freshly added)
  const consumedVoIds = new Set();  // VO ids already bound to a result node

  // ── Nodes: reposition existing, add new ──
  {
    const containerNodeIds = new Set();
    sortedNodes.forEach(n => { if (n.parent) containerNodeIds.add(n.parent); });
    const extraOccurrenceNodes = sortedNodes.filter(n => n.id.includes("_occ_"));
    let nodeLogLine = `  Writing ${sortedNodes.length} nodes`;
    if (extraOccurrenceNodes.length > 0) {
      const xContainers = extraOccurrenceNodes.filter(n => containerNodeIds.has(n.id)).length;
      const xElements   = extraOccurrenceNodes.length - xContainers;
      const parts = [];
      if (xContainers > 0) parts.push(`${xContainers} container${xContainers !== 1 ? "s" : ""}`);
      if (xElements   > 0) parts.push(`${xElements} element${xElements !== 1 ? "s" : ""}`);
      nodeLogLine += ` (${extraOccurrenceNodes.length} extra multiple occurrence${extraOccurrenceNodes.length !== 1 ? "s" : ""}: ${parts.join(" · ")})`;
    }
    console.log(nodeLogLine + "...");
  }
  const _dbgW = preset.params.alignDebug;
  if (_dbgW) console.log(`  [write-nodes] node | path | result-abs | parent-offset | written-rel(bounds)`);
  for (const rn of sortedNodes) {
    const archiId = _stripOccSuffix(rn.id);
    const existing = _pickExistingVo(rn, archiId, nodeById, existingVosByConcept, existingVoByVoId, consumedVoIds);

    if (existing) {
      // Derive desired parent from this run's nesting decisions (§A.6.6, §A.11.9).
      const newParentVisual = rn.parentId ? visualIndex[rn.parentId] : null;
      const currentParentVO = $(existing).parent().filter("element").first() || null;
      const newParentId = newParentVisual ? String(newParentVisual.id) : null;
      const curParentId = currentParentVO ? String(currentParentVO.id) : null;

      if (newParentId !== curParentId) {
        const newParentConceptId = newParentVisual && newParentVisual.concept ? newParentVisual.concept.id : null;
        const curParentConceptId = currentParentVO && currentParentVO.concept ? currentParentVO.concept.id : null;
        // When the parent CONCEPT is unchanged but a different VO of that concept was picked,
        // do NOT move the child to the new VO: the existing nesting VR's endpoint still points
        // to the old VO, and moving the child would make Archi render it as a connection line.
        const sameParentConcept = newParentConceptId !== null && newParentConceptId === curParentConceptId;
        const parentRn = newParentVisual ? nodeById[rn.parentId] : null;
        const relX = parentRn ? rn.x - parentRn.x : rn.x;
        const relY = parentRn ? rn.y - parentRn.y : rn.y;
        if (sameParentConcept) {
          // Stay in current parent VO — update bounds only. Must NOT call add() here:
          // jArchi throws "Target already contains object" when the element is already
          // in that VO. visualIndex is set unconditionally so children can find this
          // node as their parent even if the bounds update fails.
          if (_dbgW) console.log(`    ${_dbgName(rn)} | same-parent-concept | abs=(${Math.round(rn.x)},${Math.round(rn.y)}) | parentRn=${parentRn ? `(${Math.round(parentRn.x)},${Math.round(parentRn.y)})` : "—"} | rel=(${Math.round(relX)},${Math.round(relY)}) ${Math.round(rn.width)}×${Math.round(rn.height)}`);
          try {
            existing.bounds = { x: relX, y: relY, width: rn.width, height: rn.height };
          } catch (e) { console.error(`Failed to update bounds for ${archiId}: ${e}`); }
          visualIndex[rn.id] = existing;
        } else {
          // jArchi 1.10 move API: parent.add(existingVO, x, y) moves without deletion.
          const target = newParentVisual || view;
          if (_dbgW) console.log(`    ${_dbgName(rn)} | re-parent | abs=(${Math.round(rn.x)},${Math.round(rn.y)}) | parentRn=${parentRn ? `(${Math.round(parentRn.x)},${Math.round(parentRn.y)})` : "—"} | rel=(${Math.round(relX)},${Math.round(relY)}) ${Math.round(rn.width)}×${Math.round(rn.height)}`);
          try {
            target.add(existing, relX, relY);
            existing.bounds = { x: relX, y: relY, width: rn.width, height: rn.height };
            visualIndex[rn.id] = existing;
          } catch (e) { console.error(`Failed to re-parent element ${archiId}: ${e}`); }
        }
        continue;
      }

      // Same parent — reposition within current container.
      const off = _getParentAbsOffset(existing);
      if (_dbgW) {
        const parentRn = rn.parentId ? nodeById[rn.parentId] : null;
        const parentRnStr = parentRn ? `(${Math.round(parentRn.x)},${Math.round(parentRn.y)})` : "—";
        const mismatch = (parentRn && (Math.round(parentRn.x) !== Math.round(off.x) || Math.round(parentRn.y) !== Math.round(off.y))) ? "  ⚠ OFFSET≠parentRn" : "";
        console.log(`    ${_dbgName(rn)} | same-parent | abs=(${Math.round(rn.x)},${Math.round(rn.y)}) | off=(${Math.round(off.x)},${Math.round(off.y)}) parentRn=${parentRnStr} | rel=(${Math.round(rn.x - off.x)},${Math.round(rn.y - off.y)}) ${Math.round(rn.width)}×${Math.round(rn.height)}${mismatch}`);
      }
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
    if (_dbgW) console.log(`    ${_dbgName(rn)} | create | abs=(${Math.round(rn.x)},${Math.round(rn.y)}) | parentRn=${parentRn ? `(${Math.round(parentRn.x)},${Math.round(parentRn.y)})` : "—"} | rel=(${Math.round(relX)},${Math.round(relY)}) ${Math.round(rn.width)}×${Math.round(rn.height)}`);
    try {
      visualIndex[rn.id] = target.add(el, relX, relY, rn.width, rn.height);
    } catch (e) {
      console.error(`Failed to add element ${archiId}: ${e}`);
    }
  }

  // Concept over-supply: more existing VOs than result nodes for a concept
  // (e.g. user toggled showInEveryContainer off, or EXPAND_VIEW added a
  // narrower nesting). Surplus VOs are left in place — deletion is forbidden
  // outside the explicit name-overwrite path (Invariant 4).
  let unpaired = 0;
  existingVosByConcept.forEach(list => {
    for (const ve of list) if (!consumedVoIds.has(ve.id)) unpaired++;
  });
  if (unpaired > 0) {
    console.log(`  Unpaired VOs: ${unpaired} (concept over-supply — kept in place)`);
  }

  // ── Edges: reposition existing relations (rewrite bendpoints), add new ──
  console.log(`  Writing ${result.edges.length} connections · ${(parentRels || []).length} nestings...`);
  const _processedRelIds = new Set();
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
    _processedRelIds.add(archiRel.id);
  }

  // Clear bendpoints on existing routed connections that the engine did not include
  // in result.edges (e.g. edges dropped by ELK when both endpoints lift to the same
  // root container). Without this, switching algorithms leaves stale routing on those
  // connections. Nesting relations are skipped — they have no bendpoints to clear.
  const _nestingRelIds = new Set((parentRels || []).map(b => b.rel && b.rel.id).filter(Boolean));
  existingRelByConcept.forEach((vr, conceptId) => {
    if (_processedRelIds.has(conceptId)) return;
    if (_nestingRelIds.has(conceptId)) return;
    try { vr.deleteAllBendpoints(); } catch (e) {}
  });

  // ── Nesting connections (parent-child boxes): existing → skip, new → add ──
  let _nestCreated = 0, _nestSkipped = 0;
  for (const binding of (parentRels || [])) {
    const { rel, srcOccId, tgtOccId } = binding;

    // Containment: skip if already on view (LAYOUT_ONLY preserves existing).
    if (!existingRelByConcept.has(rel.id)) {
      const srcV = visualIndex[srcOccId];
      const tgtV = visualIndex[tgtOccId];
      if (srcV && tgtV) {
        try { view.add(rel, srcV, tgtV); _nestCreated++; } catch (e) { console.error(`Failed to add nesting rel ${rel.id}: ${e}`); }
      }
    } else {
      _nestSkipped++;
    }
  }
  console.log(`  Nestings: ${_nestCreated} created · ${_nestSkipped} existing`);

  // Log: count objects on the view. The total visual relation count via find("relation")
  // = connections + nestings. A mismatch vs the pipeline's "Total to view" usually
  // means nesting candidates were dropped by Archi's one-parent-per-child rule (see
  // "Nestings applied" line above).
  try {
    let _vEl = 0, _vRel = 0, _vDiag = 0;
    $(view).find("element").each(() => _vEl++);
    $(view).find("relation").each(() => _vRel++);
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => { try { $(view).find(dt).each(() => _vDiag++); } catch(e) {} });
    console.log(`  Objects on view: ${_vEl} elements · ${result.edges.length} connections · ${_vRel - result.edges.length} nestings · ${_vDiag} diagram objects`);
  } catch (e) {}
  console.log(`View "${view.name}" written`);
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

  try { connection.deleteAllBendpoints(); } catch (e) { console.error(`Failed to clear bendpoints on ${connection && connection.id}: ${e}`); }

  const _dbg = preset.params.alignDebug;

  // Self-loop: use engine bendpoints when the engine routed the connection
  // (Graphviz native, ELK Layered, Dagre partial). Synthesise a NE-corner loop only
  // when the engine provided none.
  // When bendpoints exist, fall through — source === target so srcCenter === tgtCenter,
  // making startX/Y = endX/Y in the relative-bendpoint formula below.
  if (connection.source && connection.target
      && connection.source.id === connection.target.id
      && (!re.bendpoints || re.bendpoints.length === 0)) {
    _synthesiseSelfLoopBendpoints(connection);
    return;
  }

  if (re.isStraight || !re.bendpoints || re.bendpoints.length === 0) {
    if (_dbg) console.log(`    [edge-bp] ${re.id}  bps=0${re.isStraight ? " (isStraight)" : ""}  → straight line`);
    return;
  }

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

  if (_dbg) {
    console.log(`    [edge-bp] ${re.id}  src=(${srcCenter.x},${srcCenter.y}) tgt=(${tgtCenter.x},${tgtCenter.y})  bps=${re.bendpoints.length}${isReversed ? "  reversed" : ""}`);
    re.bendpoints.forEach((bp, i) => {
      const r = archiBps[i];
      console.log(`      bp[${i}] abs=(${bp.x},${bp.y})  → start=(${r.startX},${r.startY}) end=(${r.endX},${r.endY})`);
    });
  }

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
  const VISITING = -1;
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

/**
 * Walk a visual object's parent chain in the view tree, summing parent bounds.x/y.
 * Returns the absolute (x, y) of the immediate parent in the view's frame, or
 * (0, 0) if the visual is at root. Under parent-first iteration, callers can rely
 * on parents having been repositioned before children read this.
 */
// Compact node label for write-path debug lines: short id + parent marker.
function _dbgName(rn) {
  const tag = rn.parentId ? `child-of[${String(rn.parentId).substring(0, 8)}]` : "root";
  return `[${String(rn.id).substring(0, 8)}] ${tag}`;
}

function _getParentAbsOffset(vo) {
  let x = 0, y = 0;
  try {
    let p = $(vo).parent().filter("element").first();
    while (p) {
      x += p.bounds.x || 0;
      y += p.bounds.y || 0;
      p = $(p).parent().filter("element").first();
    }
  } catch (e) { console.error(`Parent offset traversal failed for VO ${vo && vo.id}: ${e}`); }
  return { x, y };
}


function _resolveViewName(preset, elements) {
  if (preset.view.name) return preset.view.name;
  const first = elements[0];
  return first ? first.name : "Generated";
}

/**
 * Collect visual elements and visual relations directly from a view object.
 * Used after view.duplicate() to rebuild the VO index from the copy's own VOs.
 */
function _collectVisualsFrom(view) {
  const visualElements = [], visualRelations = [];
  const seenEl = new Set(), seenRel = new Set();
  try {
    $(view).find("element").each(ve => {
      if (!ve || !ve.id || seenEl.has(ve.id)) return;
      if (ve.type && ve.type in Defs.DIAGRAM_TYPES) return;
      seenEl.add(ve.id); visualElements.push(ve);
    });
  } catch (e) { console.error(`Failed to collect visual elements from view "${view && view.name}": ${e}`); }
  try {
    $(view).find("relation").each(vr => {
      if (!vr || !vr.id || seenRel.has(vr.id)) return;
      seenRel.add(vr.id); visualRelations.push(vr);
    });
  } catch (e) { console.error(`Failed to collect visual relations from view "${view && view.name}": ${e}`); }
  return { visualElements, visualRelations };
}

function _resolveFolder(viewFolder) {
  const path = viewFolder ? "/Views" + viewFolder : "/Views" + GENERATED_VIEW_FOLDER;
  try { return ArchiFolders.getFolderPath(path); }
  catch (e) {
    console.log(`Folder "${path}" not found — using default. (${e})`);
    return ArchiFolders.getFolderPath("/Views" + GENERATED_VIEW_FOLDER);
  }
}

function _getOrCreateView(folder, viewName) {
  let existing = $(folder).children("view").filter(`.${viewName}`).first();
  if (existing) {
    console.log(`  Overwriting view: "${viewName}"`);
    try { $(existing).find().each(o => o.delete()); } catch (e) { console.error(`Failed to clear view "${viewName}" before overwrite: ${e}`); }
    return existing;
  }
  const v = model.createArchimateView(viewName);
  folder.add(v);
  console.log(`  Created view: "${viewName}"`);
  return v;
}

function _getAbsCenter(visual) {
  let x = (visual.bounds.x || 0) + (visual.bounds.width  || 0) / 2;
  let y = (visual.bounds.y || 0) + (visual.bounds.height || 0) / 2;
  try {
    let p = $(visual).parent().filter("element").first();
    while (p) {
      x += p.bounds.x || 0;
      y += p.bounds.y || 0;
      p = $(p).parent().filter("element").first();
    }
  } catch (e) { console.error(`Parent offset traversal failed for VO ${visual && visual.id}: ${e}`); }
  return { x: Math.round(x), y: Math.round(y) };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { generate_view };
}
