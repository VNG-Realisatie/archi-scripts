/**
 * View generation API.
 *
 * Orchestrator. One pipeline → one layout engine call → one writer (action-agnostic).
 *
 * The writer's rule (SPEC §5): per result object,
 *   exists on target view? → reposition (appearance preserved; parenthood re-derived from the nesting)
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

/** @type {typeof import("../../_lib/Common")} */
const Common       = require(REPO_ROOT + "_lib/Common");
/** @type {typeof import("../../_lib/archi_folders")} */
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders");

/** @type {typeof import("./defs")} */
const Defs       = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./selection_pipeline")} */
const Pipeline   = require(REPO_ROOT + "View/lib/selection_pipeline");
/** @type {typeof import("./appearance")} */
const Appearance = require(REPO_ROOT + "View/lib/appearance");

const {
  ACTION, ALGORITHMS, RELATION_WEIGHT_MAP, GENERATED_VIEW_FOLDER, PROP_ID, PROP_MANAGED_OCCURRENCE,
  validatePreset, effectiveParams, connectionsModeLock,
} = Defs;

const JUNCTION_DIAMETER = 14;

/** @type {typeof import("./engines/engine-utils")} */
const { expandNodeSizesForEdgeDensity, sizeLabelBasedNodes } = require(REPO_ROOT + "View/lib/engines/engine-utils");

// ── Engine loaders (lazy) ─────────────────────────────────────────────────────
// require() is memoised by jvm-npm (Require.cache), so repeated calls return the same module.

/**
 * @param {string} engine
 * @returns {LayoutAdapter}
 */
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
 * @param {PresetFile}      rawPreset   raw preset object (will be validated)
 * @param {ArchiCollection<ArchiObject>} uiSelection $(selection) from Archi UI
 * @param {string}          [actionId]  ACTION.*.id (runtime — not stored in preset files);
 *                                      falls back to rawPreset.action (set by CLI scripts), then NEW_VIEW
 * @returns {ArchimateView[]}
 */
function generate_view(rawPreset, uiSelection, actionId) {
  Common.startCounter("generate_view");
  /** @type {MaskedPreset} */
  const preset = validatePreset(rawPreset);   // masked to the algorithm's params a few lines down
  // CLI scripts set preset.action instead of passing actionId; validatePreset drops it, so read it here.
  const action = actionId || rawPreset.action || ACTION.NEW_VIEW.id;

  // SPEC §11: capability masking. Replace preset.params with the effective subset
  // for runtime consumption. Inactive keys are silently dropped here; the raw
  // preset on disk is preserved by validatePreset for UI restoration on
  // algorithm switch.
  // Casts: preset.params is still the full set here.
  const _rawParams = /** @type {PresetParams & Record<string, unknown>} */ (preset.params);
  preset.params = effectiveParams(/** @type {Preset} */ (preset));
  const _dropped = Object.keys(_rawParams).filter(k => !(k in preset.params)
    && _rawParams[k] !== undefined && _rawParams[k] !== null
    && !(Array.isArray(_rawParams[k]) && _rawParams[k].length === 0));
  if (_dropped.length) console.log(`Algorithm "${preset.algorithm}" ignores inactive params: ${_dropped.join(", ")}`);
  if (_rawParams.connectionsMode !== preset.params.connectionsMode && preset.params.connectionsMode !== undefined)
    console.log(`Connections: "${preset.params.connectionsMode}" (Crossing containers not possible with ${connectionsModeLock(preset.algorithm, _rawParams)})`);

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
      (p.nestingRules && p.nestingRules.length) && `nesting=${p.nestingRules.length}rules containerAlgo=${p.containerAlgorithm || "(same)"}  connMode=${p.connectionsMode || "Between containers"}`,
    ].filter(Boolean);
    console.log(`Params: ${parts.join("  ")}`);
  }
  {
    // Params without a dialog control (defs.HIDDEN_PARAMS): show a preset value that differs
    // from the default, so it does not act unseen.
    const hidden = Defs.HIDDEN_PARAMS
      // Casts: k is a params key.
      .filter(k => k in preset.params && /** @type {Record<string, unknown>} */ (preset.params)[k] !== /** @type {Record<string, unknown>} */ (Defs.DEFAULT_PRESET.params)[k])
      .map(k => `${k}=${/** @type {Record<string, unknown>} */ (preset.params)[k]}`);
    if (hidden.length) console.log(`Preset values not in dialog: ${hidden.join("  ")}`);
  }
  console.log(`Name: "${preset.view.name}"  Folder: "${preset.view.folder}"`);
  {
    const vsMode = _rawParams.viewSizeMode || "none";
    const vsVal  = vsMode === "maxWidth"    ? `maxWidth=${_rawParams.maxWidth}`
                 : vsMode === "aspectRatio" ? `aspectRatio=${_rawParams.aspectRatio}`
                 : "none";
    console.log(`View size requested: ${vsVal}`);
  }

  /** @type {ArchimateView[]} */
  const views = [];
  try {
    if (action === ACTION.ONE_EACH.id) {
      views.push(..._generateOneEach(preset, uiSelection));
    } else {
      const view = _generateSingle(preset, uiSelection, action, null);
      if (view) views.push(view);
    }
  } catch (error) {
    console.error(`generate_view error: ${typeof /** @type {Error} */ (error).stack === "undefined" ? error : /** @type {Error} */ (error).stack}`);
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
 * @param {ArchimateView} view
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

// ── View properties ───────────────────────────────────────────────────────────

/**
 * @param {ArchimateView} view
 * @param {MaskedPreset}  preset
 */
function _applyViewProperties(view, preset) {
  const vp = preset.viewProperties;
  if (!vp) return;

  /** @type {string[]} */
  const lines = [];
  (vp.properties || []).forEach(p => {
    // SPEC (Properties tab): disabled rows are ignored. An enabled row without a value clears the key.
    if (!p.key || p.key === PROP_ID || !p.enabled) return;
    if (p.value) {
      view.prop(p.key, p.value);
      lines.push(`  prop set:     ${p.key} = "${p.value}"`);
    } else if (view.prop(p.key) !== null) {
      view.removeProp(p.key);
      lines.push(`  prop removed: ${p.key}`);
    }
  });

  if (vp.addObjectId && !view.prop(PROP_ID)) {
    const id = Common.generateUUID();
    view.prop(PROP_ID, id);
    lines.push(`  prop set:     ${PROP_ID} = "${id}" (new)`);
  }
  if (lines.length) console.log("\nProperties:\n" + lines.join("\n"));   // no heading when nothing changed
}

// ── Single view ───────────────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string}                       actionId
 * @param {string | null}                viewNameOverride
 * @returns {ArchimateView | null}
 */
function _generateSingle(preset, uiSelection, actionId, viewNameOverride) {
  const timer = _phaseTimer();
  const objectSet = Pipeline.buildObjectSet(uiSelection, preset, actionId);
  timer.lap("selection");
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
  const split       = Pipeline.splitNestingRels(relations, preset.params);
  const nestingRels = split.nestingRels;
  const routedRels  = split.connectionRels;

  // Determine the target view.
  //   EXPAND_VIEW / LAYOUT_ONLY → the selected existing view, changed in place
  //                               (preset view name and folder apply to new views only).
  //   NEW_VIEW                  → a new view (created or overwritten by name) — only after the
  //                               layout succeeded, so a failed run leaves an existing view as it was.
  let view = null;
  const inPlace = actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
  if (inPlace) {
    console.log("\nView target:");
    view = existingView;
    if (!view) {
      console.error(`${actionId}: no existing view in selection`);
      return null;
    }
    console.log(`  Using: "${view.name}" (in place)`);
  }
  timer.lap("view target");

  // Build LayoutGraph (uniform — no action branch). Pairing with the visuals on the view is
  // part of the nesting resolution, so every visual gets a node.
  console.log("\nLayout graph:");
  const graph = _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects,
                                  objectSet.visuals, objectSet.visualRelations);
  timer.lap("layout graph");
  if (graph.nodes.length === 0) {
    console.log("  No elements to place — view not generated.");
    return null;
  }

  // Relation role split. Nesting relations that could not be applied as containment
  // (multi-parent conflict) are reclassified as connections in _buildLayoutGraph, so
  // routedRels.length here reflects the final drawn-connection count.
  const ns = graph._nestingStats;
  console.log(`  Relation roles: ${nestingRels.length} nestings · ${routedRels.length} connections`);
  if (ns.candidates > 0) {
    const notes = [];
    if (ns.notNestedNestings > 0) notes.push(`${ns.notNestedNestings} drawn as connection`);
    if (ns.circularNestings  > 0) notes.push(`${ns.circularNestings} circular`);
    const suffix = notes.length > 0 ? ` (${notes.join(", ")})` : "";
    console.log(`  Nestings applied: ${ns.applied}/${ns.candidates}${suffix}`);
  }

  // Run engine.
  console.log("\nLayout:");
  const alg = ALGORITHMS[preset.algorithm];
  const result = _getAdapter(alg.engine).layout(graph);
  timer.lap("layout");
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

  if (!inPlace) {
    console.log("\nView target:");
    const viewName = viewNameOverride || _resolveViewName(preset, elements);
    view = _getOrCreateView(_resolveFolder(preset.view.folder), viewName);
  }

  // Write — single function, action-agnostic.
  console.log("\nWrite:");
  // Cast: the in-place target (a missing one returned above) or the view just created — an ArchiMate view.
  const writtenView = _writeView(preset, result, objectSet, /** @type {ArchimateView} */ (view), graph._nesting);
  timer.lap("write");

  // Appearance pass — post-write styling (colours, fonts). No-op when all features disabled.
  if (writtenView) {
    Appearance.applyAppearance(writtenView, preset, actionId);
    _applyViewProperties(writtenView, preset);
    timer.lap("appearance");
  }

  console.log(`\nTiming: ${timer.summary()}`);
  return writtenView;
}

// Phase durations of one view generation, logged as one summary line — shows where the time goes.
function _phaseTimer() {
  /** @type {string[]} */
  const laps = [];
  const t0 = Date.now();
  let t = t0;
  return {
    lap(/** @type {string} */ name) { const now = Date.now(); laps.push(`${name} ${_fmtMs(now - t)}`); t = now; },
    summary() { return `${laps.join(" · ")}  (total ${_fmtMs(t - t0)})`; },
  };
}

/** @param {number} ms */
function _fmtMs(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// ── One view per element ──────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                 preset
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {ArchimateView[]}
 */
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

  /** @type {ArchimateView[]} */
  const views = [];
  for (const element of seeds) {
    console.log(`\nGenerating view for: ${element.name}`);
    const view = _generateSingle(preset, $(element), ACTION.NEW_VIEW.id, element.name + preset.view.suffix);
    if (view) views.push(view);
  }
  return views;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ── LayoutGraph builder ───────────────────────────────────────────────────────

/**
 * @param {MaskedPreset}                     preset
 * @param {ArchiElement[]}                   elements
 * @param {ArchiRelation[]}                  routedRels       drawn as connections (extended with unapplied nestings)
 * @param {ArchiRelation[]}                  nestingRels      nesting candidates
 * @param {DiagramObject[] | undefined}      diagramObjects
 * @param {VisualDescription[] | undefined}  visuals
 * @param {VisualConnection[] | undefined}   visualRelations
 * @returns {LayoutGraph}
 */
function _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects, visuals, visualRelations) {
  diagramObjects = diagramObjects || [];
  const params = preset.params;

  // Nesting structure and pairing shared with the pipeline's predictViewCounts so dialog/console
  // counts agree with the writer's actual output. Single source of truth.
  const nesting = Pipeline.resolveNesting(elements, nestingRels, params, visuals);
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
  // diagram-model-connection objects are edges, never nodes (SPEC appendix: Selection run order, 6).
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

  // Edges from routed relations: each relation once (SPEC: Connections between occurrences).
  // Connections already on the view keep their ends; otherwise the closest pair of occurrences.
  const removed = new Set(nesting.removedVisualIds);
  /** @type {Map<string, [string, string][]>} */
  const drawnByRel = new Map();   // relation id → [[source occ, target occ]] of its visual relations
  for (const vr of (visualRelations || [])) {
    const relId = vr.concept && vr.concept.id;
    const srcOcc = vr.source && nesting.occurrenceOf.get(String(vr.source.id));
    const tgtOcc = vr.target && nesting.occurrenceOf.get(String(vr.target.id));
    if (!relId || !srcOcc || !tgtOcc || removed.has(String(vr.source.id)) || removed.has(String(vr.target.id))) continue;
    if (!drawnByRel.has(relId)) drawnByRel.set(relId, []);
    /** @type {[string, string][]} */ (drawnByRel.get(relId)).push([srcOcc, tgtOcc]);   // Cast: set just above
  }
  /** @type {LayoutEdge[]} */
  const edges = [];
  /** @type {Set<string>} */
  const edgeIds = new Set();
  for (const rel of routedRels) {
    const srcId = rel.source && rel.source.id;
    const tgtId = rel.target && rel.target.id;
    if (!srcId || !tgtId || !occurrenceMap[srcId] || !occurrenceMap[tgtId]) continue;
    if (srcId === tgtId && !ALGORITHMS[preset.algorithm].supportsSelfLoops) continue;
    if (edgeIds.has(rel.id)) continue;
    edgeIds.add(rel.id);

    const isReversed = Pipeline.isReversed(rel, params);
    const pairs = drawnByRel.get(rel.id)
               || [_closestPair(occurrenceMap[srcId], occurrenceMap[tgtId], parentMap, srcId === tgtId)];
    pairs.forEach(([srcOccId, tgtOccId], k) => {
      // For reversed-typed relations, swap source/target so the layout
      // engine traverses the edge in the reversed direction. The model
      // relation is untouched; Archi draws using its intrinsic direction.
      edges.push({
        id:        k === 0 ? rel.id : `${rel.id}_${k}`,   // unique per edge for the layout engine
        conceptId: rel.id,   // plain model relation id — always used for $() lookup in _writeView
        source: isReversed ? tgtOccId : srcOccId,
        target: isReversed ? srcOccId : tgtOccId,
        label:  rel.name || "",
        weight: RELATION_WEIGHT_MAP[rel.type] || 1.0,
      });
    });
  }

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

// ── View writer ───────────────────────────────────────────────────────────────

// Strip the synthetic occurrence suffix added by Pipeline.resolveNesting
// ("conceptId_occ_N") to recover the underlying model concept id.
/** @param {string} id */
function _stripOccSuffix(id) {
  const i = id.lastIndexOf("_occ_");
  return i >= 0 ? id.substring(0, i) : id;
}

/**
 * Apply a layout result to a target view. Action-agnostic.
 *
 * Per-object rule (SPEC §5):
 *   - exists → reposition (appearance preserved; parenthood re-derived from the nesting).
 *   - Otherwise → create (default appearance).
 * Which visual an occurrence repositions comes from the pairing in the nesting resolution;
 * managed visuals left without an occurrence are removed, and the view's managed-occurrence
 * records are rewritten (SPEC: Managed extra occurrences).
 *
 * Same rule for visual relations: existing → rewrite bendpoints; new → add.
 *
 * Parent-first iteration (SPEC §11) guarantees a child's parent VO is in place
 * (added or repositioned) before the child is processed.
 * @param {MaskedPreset}      preset
 * @param {LayoutResult}      result
 * @param {ObjectSet}         objectSet
 * @param {ArchimateView}     view
 * @param {NestingResolution} nesting
 * @returns {ArchimateView}
 */
function _writeView(preset, result, objectSet, view, nesting) {
  const parentRels = nesting.parentRels;
  // Index result nodes once. Sort parent-first (engine output may be arbitrary order).
  /** @type {Record<string, LayoutResultNode>} */
  const nodeById = Object.create(null);
  result.nodes.forEach(n => { nodeById[n.id] = n; });
  const sortedNodes = _sortNodesParentFirst(result.nodes, nodeById);

  /** @type {Map<string, VisualObject>} */
  const visualById = new Map();             // visual id → VisualElement (VisualSet)
  (objectSet.visualElements || []).forEach(ve => visualById.set(String(ve.id), ve));
  // Diagram objects: only register VOs that currently live on the target view.
  // Guards against referencing deleted VOs when the view was just overwritten (NEW_VIEW).
  /** @type {Map<string, VisualObject>} */
  const existingVoByVoId = new Map();       // VO id → DiagramObject
  /** @type {Set<string>} */
  const _voIdsOnView = new Set();
  try { $(view).find().each(o => { if (o && o.id) _voIdsOnView.add(String(o.id)); }); } catch(e) { console.error(`Failed to index existing VOs on view "${view.name}": ${e}`); }
  (objectSet.diagramObjects || []).forEach(dvo => {
    // Cast: objectSet.diagramObjects holds positional objects only (connections were split off).
    if (dvo && dvo.id && _voIdsOnView.has(String(dvo.id))) existingVoByVoId.set(dvo.id, /** @type {VisualObject} */ (dvo));
  });

  // Remove existing self-loop connections for algorithms that don't route them.
  /** @type {Set<string>} */
  const deletedVrIds = new Set();
  if (!ALGORITHMS[preset.algorithm].supportsSelfLoops) {
    (objectSet.visualRelations || []).forEach(vr => {
      const c = vr.concept;
      if (c && c.source && c.target && c.source.id === c.target.id) {
        try { vr.delete(); deletedVrIds.add(String(vr.id)); } catch (e) {}
      }
    });
  }

  /** @type {Record<string, VisualObject>} */
  const visualIndex = {};  // result-node id → VisualObject (existing or freshly added)

  // ── Nodes: reposition existing, add new ──
  {
    /** @type {Set<string>} */
    const containerNodeIds = new Set();
    sortedNodes.forEach(n => { if (n.parentId) containerNodeIds.add(n.parentId); });
    const extraOccurrenceNodes = sortedNodes.filter(n => n.id.includes("_occ_"));
    let nodeLogLine = `  Writing ${sortedNodes.length} nodes`;
    if (extraOccurrenceNodes.length > 0) {
      const xContainers = extraOccurrenceNodes.filter(n => containerNodeIds.has(n.id)).length;
      const xElements   = extraOccurrenceNodes.length - xContainers;
      /** @type {string[]} */
      const parts = [];
      if (xContainers > 0) parts.push(`${xContainers} container${xContainers !== 1 ? "s" : ""}`);
      if (xElements   > 0) parts.push(`${xElements} element${xElements !== 1 ? "s" : ""}`);
      nodeLogLine += ` (${extraOccurrenceNodes.length} extra multiple occurrence${extraOccurrenceNodes.length !== 1 ? "s" : ""}: ${parts.join(" · ")})`;
    }
    console.log(nodeLogLine + "...");
  }
  let _kept = 0, _created = 0;
  for (const rn of sortedNodes) {
    const archiId = _stripOccSuffix(rn.id);
    const pairedId = nesting.visualOf[rn.id];
    const existing = pairedId ? visualById.get(String(pairedId)) : existingVoByVoId.get(rn.id) || null;

    if (existing) {
      _kept++;
      // Derive desired parent from this run's nesting decisions (SPEC: Writer parenthood).
      const newParentVisual = rn.parentId ? visualIndex[rn.parentId] : null;
      const currentParentVO = $(existing).parent().filter("element").first() || null;
      const newParentId = newParentVisual ? String(newParentVisual.id) : null;
      const curParentId = currentParentVO ? String(currentParentVO.id) : null;

      if (newParentId !== curParentId) {
        // jArchi 1.10 move API: parent.add(existingVO, x, y) moves without deletion.
        const parentRn = newParentVisual ? nodeById[/** @type {string} */ (rn.parentId)] : null;   // Cast: a parent visual means a parentId
        const relX = parentRn ? rn.x - parentRn.x : rn.x;
        const relY = parentRn ? rn.y - parentRn.y : rn.y;
        const target = newParentVisual || view;
        try {
          target.add(existing, relX, relY);
          existing.bounds = { x: relX, y: relY, width: rn.width, height: rn.height };
          visualIndex[rn.id] = existing;
        } catch (e) { console.error(`Failed to re-parent element ${archiId}: ${e}`); }
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
    // Cast: the node of an element (diagram objects are skipped just below, before el is used).
    const el = /** @type {ArchiElement | null} */ ($(`#${archiId}`).first());
    if (!el || !el.id) continue;
    if (el.type in Defs.DIAGRAM_TYPES) continue;

    const parentVisual = rn.parentId ? visualIndex[rn.parentId] : null;
    const target = parentVisual || view;
    const parentRn = parentVisual ? nodeById[/** @type {string} */ (rn.parentId)] : null;   // Cast: a parent visual means a parentId
    const relX = parentRn ? rn.x - parentRn.x : rn.x;
    const relY = parentRn ? rn.y - parentRn.y : rn.y;
    try {
      visualIndex[rn.id] = target.add(el, relX, relY, rn.width, rn.height);
      _created++;
    } catch (e) {
      console.error(`Failed to add element ${archiId}: ${e}`);
    }
  }

  // Managed occurrences the settings no longer ask for. Removed after the nodes are written, so
  // a child moved elsewhere is out first; Archi removes their connections with them.
  let _removed = 0;
  for (const id of nesting.removedVisualIds) {
    const ve = visualById.get(String(id));
    if (!ve) continue;
    try { ve.delete(); _removed++; } catch (e) { console.error(`Failed to remove managed occurrence ${id}: ${e}`); }
  }
  /** @type {Set<string>} */
  const _vrIdsOnView = new Set();
  try { $(view).find("relation").each(vr => _vrIdsOnView.add(String(vr.id))); } catch (e) {}
  /** @type {Map<string, VisualConnection[]>} */
  const existingRelsByConcept = new Map();  // conceptId → VisualRelation[] still on the view
  (objectSet.visualRelations || []).forEach(vr => {
    if (!vr.concept || !vr.concept.id) return;
    if (deletedVrIds.has(String(vr.id)) || !_vrIdsOnView.has(String(vr.id))) return;
    const list = existingRelsByConcept.get(vr.concept.id) || [];
    list.push(vr);
    existingRelsByConcept.set(vr.concept.id, list);
  });
  /** @type {Set<string>} */
  const _consumedVrIds = new Set();  // VR ids already matched to a result edge or nesting
  /** @type {(relId: string, srcVisual: VisualObject, tgtVisual: VisualObject) => VisualConnection | null} */
  const _findVr = (relId, srcVisual, tgtVisual) => {
    const vr = (existingRelsByConcept.get(relId) || []).find(c =>
      !_consumedVrIds.has(String(c.id)) && c.source && c.target &&
      String(c.source.id) === String(srcVisual.id) && String(c.target.id) === String(tgtVisual.id));
    if (vr) _consumedVrIds.add(String(vr.id));
    return vr || null;
  };

  // ── Edges: reposition existing relations (rewrite bendpoints), add new ──
  console.log(`  Writing ${result.edges.length} connections · ${(parentRels || []).length} nestings...`);
  for (const re of result.edges) {
    // re.id may be "relId_k" (k-th connection of one relation); re.conceptId is always the model id.
    const conceptId = re.conceptId || re.id;
    const archiRel  = /** @type {ArchiRelation | null} */ ($(`#${conceptId}`).first());   // Cast: a relation id
    if (!archiRel || !archiRel.id) continue;

    // re.sourceId/targetId are in layout direction; reversed-typed relations swap them.
    // Un-reverse to obtain the model's source→target order for view.add().
    const isRev         = Pipeline.isReversed(archiRel, preset.params);
    const modelSrcOccId = isRev ? re.targetId : re.sourceId;
    const modelTgtOccId = isRev ? re.sourceId : re.targetId;
    const srcVisual = visualIndex[modelSrcOccId];
    const tgtVisual = visualIndex[modelTgtOccId];
    if (!srcVisual || !tgtVisual) continue;

    let connection = _findVr(archiRel.id, srcVisual, tgtVisual);
    if (!connection) {
      try { connection = view.add(archiRel, srcVisual, tgtVisual); }
      catch (e) { console.error(`Failed to add relation ${conceptId}: ${e}`); continue; }
    }
    _applyEdgeStyle(connection, re, preset);
  }

  // ── Nesting connections (parent-child boxes): existing between the paired visuals → keep, new → add.
  // Other lines of a nested relation are removed: what is shown as nesting is not also a line. ──
  /** @type {Map<string, VisualConnection>} */
  const _vrById = new Map();
  existingRelsByConcept.forEach(list => list.forEach(vr => _vrById.set(String(vr.id), vr)));
  const nc = Pipeline.nestingConnections(parentRels || [], nesting.visualOf, [..._vrById.values()]);
  let _nestCreated = 0, _nestSkipped = 0, _nestLinesRemoved = 0;
  (parentRels || []).forEach((binding, i) => {
    if (nc.keptVrIds[i]) { _consumedVrIds.add(nc.keptVrIds[i]); _nestSkipped++; return; }
    const { rel, srcOccId, tgtOccId } = binding;
    const srcV = visualIndex[srcOccId];
    const tgtV = visualIndex[tgtOccId];
    if (!srcV || !tgtV) return;
    try { view.add(rel, srcV, tgtV); _nestCreated++; } catch (e) { console.error(`Failed to add nesting rel ${rel.id}: ${e}`); }
  });
  for (const id of nc.removedVrIds) {
    _consumedVrIds.add(id);
    // Cast: removedVrIds come from _vrById.
    try { /** @type {VisualConnection} */ (_vrById.get(id)).delete(); _nestLinesRemoved++; } catch (e) { console.error(`Failed to remove line of nested relation ${id}: ${e}`); }
  }
  const _linesNote = _nestLinesRemoved ? ` · ${_nestLinesRemoved} line${_nestLinesRemoved !== 1 ? "s" : ""} of nested relations removed` : "";
  console.log(`  Nestings: ${_nestCreated} created · ${_nestSkipped} existing${_linesNote}`);

  // Clear bendpoints on existing connections not matched above (e.g. edges dropped by ELK when
  // both endpoints lift to the same root container, or a nesting connection to another visual).
  // Without this, switching algorithms leaves stale routing on those connections.
  existingRelsByConcept.forEach(vrList => {
    for (const vr of vrList) {
      if (_consumedVrIds.has(String(vr.id))) continue;
      try { vr.deleteAllBendpoints(); } catch (e) {}
    }
  });

  // ── Managed-occurrence records: exactly the managed occurrences now on the view ──
  const records = Pipeline.managedRecords(nesting, occ => !!visualIndex[occ]);
  try {
    view.removeProp(PROP_MANAGED_OCCURRENCE);
    for (const r of records) view.prop(PROP_MANAGED_OCCURRENCE, r, true);
  } catch (e) { console.error(`Failed to write the managed-occurrence records: ${e}`); }
  const inPlace = nesting.userInPlace ? ` · ${nesting.userInPlace} user content in its current container` : "";
  console.log(`  Occurrences: ${_kept} kept · ${_created} created · ${_removed} managed removed · ${records.length} managed on view${inPlace}`);

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
  const N = bps.length;

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

  const result = [...head, ...befPts, P, ...aftPts, ...tail];
  return result;
}

/**
 * @param {VisualConnection} connection
 * @param {LayoutResultEdge} re
 * @param {MaskedPreset}     preset
 */
function _applyEdgeStyle(connection, re, preset) {
  /** @type {Record<string, number>} */
  const lpMap = { Source: 0, Middle: 1, Target: 2, Natural: 1 };
  const lp = lpMap[/** @type {string} */ (preset.params.labelPosition)];   // Cast: absent → lpMap["undefined"] → skipped
  if (lp !== undefined) {
    try { connection.textPosition = lp; } catch (e) {}
  }

  try { connection.deleteAllBendpoints(); } catch (e) { console.error(`Failed to clear bendpoints on ${connection && connection.id}: ${e}`); }

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
    return;
  }

  // Casts: the ends of a relation's connection are element visuals.
  const srcCenter = _getAbsCenter(/** @type {VisualObject} */ (connection.source));
  const tgtCenter = _getAbsCenter(/** @type {VisualObject} */ (connection.target));
  const isReversed = !!connection.concept && Pipeline.isReversed(connection.concept, preset.params);
  const balancedBps = _insertLabelMidpointBp(re.bendpoints, srcCenter, tgtCenter, re.labelX, re.labelY, re.srcPort, re.tgtPort);
  const archiBps = balancedBps.map(bp => ({
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
 * @param {VisualConnection} connection
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

/**
 * Walk a visual object's parent chain in the view tree, summing parent bounds.x/y.
 * Returns the absolute (x, y) of the immediate parent in the view's frame, or
 * (0, 0) if the visual is at root. Under parent-first iteration, callers can rely
 * on parents having been repositioned before children read this.
 * @param {VisualObject} vo
 * @returns {Point}
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
  } catch (e) { console.error(`Parent offset traversal failed for VO ${vo && vo.id}: ${e}`); }
  return { x, y };
}


/**
 * @param {MaskedPreset}   preset
 * @param {ArchiElement[]} elements
 * @returns {string}
 */
function _resolveViewName(preset, elements) {
  if (preset.view.name) return preset.view.name;
  const first = elements[0];
  return first ? first.name : "Generated";
}

/**
 * The folder for a new view, created when missing. Throws when the model has no "Views" folder
 * (renamed): the run then aborts before anything is written.
 * @param {string} viewFolder
 * @returns {Folder}
 */
function _resolveFolder(viewFolder) {
  if (!$("folder.Views").first()) throw `The model has no "Views" folder; the new view has nowhere to go. Rename the views folder back to "Views".`;
  // viewFolder is a path under /Views ("/_Generated/Test"); "" = GENERATED_VIEW_FOLDER.
  const path = "/Views" + (viewFolder || GENERATED_VIEW_FOLDER);
  const folder = ArchiFolders.getFolderPath(path);   // missing subfolders are created
  if (!folder) throw `View folder "${path}" not found.`;
  return folder;
}

/**
 * @param {Folder} folder
 * @param {string} viewName
 * @returns {ArchimateView}
 */
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

/**
 * @param {VisualObject} visual
 * @returns {Point}
 */
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
  module.exports = { generate_view, buildLayoutGraph: _buildLayoutGraph };   // buildLayoutGraph: Node harness
}
