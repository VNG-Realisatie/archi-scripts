/**
 * Archi side of the selection pipeline: reads what an action works on from the selection and the
 * model (jArchi `$` calls), once, into a Snapshot that selection_pipeline.js composes from.
 */
console.log("Loading selection_read.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("../../_lib/selection")} */
const Selection = require(REPO_ROOT + "_lib/selection");
/** @type {typeof import("./defs")} */
const Defs      = require(REPO_ROOT + "View/lib/defs");
/** @type {typeof import("./nesting")} */
const Nesting   = require(REPO_ROOT + "View/lib/nesting");
const { ACTION } = Defs;

/** @typedef {import("./nesting").RawVisual} RawVisual */

/**
 * EXPAND_VIEW or LAYOUT_ONLY: the actions that change the selected view in place.
 * @param {string} actionId
 */
function _isModifyAction(actionId) {
  return actionId === ACTION.EXPAND_VIEW.id || actionId === ACTION.LAYOUT_ONLY.id;
}

/**
 * Read what an action works on from the selection (jArchi reads; logs what it read). The model
 * elements of the selection (views expanded), its diagram objects, the relations per element, and
 * for the Modify actions the target view's visuals and diagram-blocks. EXPAND_VIEW without objects
 * selected on a view: null, the reason on the console.
 * @param {ArchiCollection<ArchiObject>} uiSelection  $(selection) from Archi UI
 * @param {string}                       actionId     ACTION.*.id
 * @returns {Snapshot | null}
 */
function readSelection(uiSelection, actionId) {
  const INDENT = "  ";
  const isExpand = actionId === ACTION.EXPAND_VIEW.id;

  // Model objects from the selection (uniform for canvas + model tree).
  console.log("Current selection:");
  const raw = Selection.getSelection(uiSelection, "*", INDENT);
  const expanded = _expandViews(raw, INDENT);

  // Existing view contents — target identification + per-VO existence (EXPAND_VIEW + LAYOUT_ONLY).
  const existing = _collectExistingVisuals(uiSelection, actionId, INDENT);
  // EXPAND_VIEW expands from elements selected on the view; a view picked in the model tree has no
  // such selection. The whole view is laid out, but only the steps' relations are added to it.
  if (isExpand && (existing.viewFromTree || !existing.existingView)) {
    console.error("Expand view: select one or more elements on the view (not the view in the model tree).");
    return null;
  }
  // Diagram-blocks: a diagram object with contents (a legend, a frame) moves as one object with all it
  // holds; its contents are not laid out. Modify: on the target view; Create: on the view(s) read, to copy.
  const isModify = _isModifyAction(actionId);
  const blocks = _readDiagramBlocks(isModify ? (existing.existingView ? [existing.existingView] : []) : _viewsRead(uiSelection));
  // EXPAND_VIEW lays out the whole view, so every diagram object on it; Create also the diagram objects selected on a canvas.
  const diagramObjects = isExpand
    ? _expandViews($(/** @type {ArchiView} */ (existing.existingView))).diagramObjects   // Cast: checked above
    : isModify ? expanded.diagramObjects : _canvasDiagramObjects(raw, expanded.diagramObjects);
  /** @type {ArchiElement[]} */
  const elements = [];
  // Cast: the model collection holds concepts (diagram objects were split off), so "element" selects model elements.
  /** @type {ArchiCollection<ArchiElement>} */ (expanded.modelCollection.filter("element")).each(o => elements.push(o));
  const visuals = describeVisuals(existing.visualElements);
  return {
    elements, diagramObjects, relationsOf: readRelationIndex(), existing,
    diagramBlockOf: blocks.diagramBlockOf, blockContents: blocks.blockContents,
    sourceVisualElements: isModify ? [] : _elementVisualsRead(uiSelection),
    visuals,
  };
}

/**
 * The views a Create action reads from: the views selected in the model tree, and the view of
 * objects selected on a canvas.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {ArchiView[]}
 */
function _viewsRead(uiSelection) {
  /** @type {Map<string, ArchiView>} */
  const views = new Map();
  uiSelection.each(o => {
    // Cast: an object without a view that has type archimate-diagram-model is a view.
    const view = o.view ? o.view : o.type === "archimate-diagram-model" ? /** @type {ArchiView} */ (o) : null;
    if (view) views.set(String(view.id), view);
  });
  return [...views.values()];
}

/**
 * The element visuals a Create action reads: every one on a view selected in the model tree, and
 * those selected on a canvas with everything inside them.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {VisualObject[]}
 */
function _elementVisualsRead(uiSelection) {
  /** @type {VisualObject[]} */
  const out = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const add = (/** @type {VisualObject} */ ve) => {
    if (!ve.concept || ve.type in Defs.DIAGRAM_TYPES || seen.has(String(ve.id))) return;   // a view reference is found as "element"
    seen.add(String(ve.id));
    out.push(ve);
  };
  uiSelection.each(o => {
    // Casts: on a view, "element" selects element visuals; an object with a view is a visual.
    if (o.type === "archimate-diagram-model" && !o.view) /** @type {ArchiCollection<VisualObject>} */ ($(o).find("element")).each(add);
    else if (o.view) {
      if (o.concept) add(/** @type {VisualObject} */ (o));
      /** @type {ArchiCollection<VisualObject>} */ ($(o).find("element")).each(add);
    }
  });
  return out;
}

/**
 * The diagram objects of the selected views, then those selected on a canvas (with the diagram
 * objects inside a selected visual), each once: getSelection also walks a view selected in the
 * model tree, so its diagram objects come both ways.
 * @param {ArchiCollection<ArchiObject>} raw       Selection.getSelection: diagram objects as themselves
 * @param {DiagramObject[]}              ofViews   the diagram objects of the selected views
 * @returns {DiagramObject[]}
 */
function _canvasDiagramObjects(raw, ofViews) {
  const out = [...ofViews];
  const seen = new Set(out.map(o => String(o.id)));
  raw.each(o => {
    if (!o.view || !(o.type in Defs.DIAGRAM_TYPES) || seen.has(String(o.id))) return;
    seen.add(String(o.id));
    out.push(/** @type {DiagramObject} */ (o));   // Cast: a diagram type with a view is a visual
  });
  return out;
}

/**
 * The relations of an element, read from the model on first use and kept: the model does not
 * change while a snapshot is in use.
 * @returns {RelationIndex}
 */
function readRelationIndex() {
  /** @type {Map<string, ArchiRelation[]>} */
  const cache = new Map();
  return element => {
    let rels = cache.get(element.id);
    if (!rels) {
      /** @type {ArchiRelation[]} */
      const read = [];
      try { $(element).rels().each(rel => read.push(rel)); } catch (e) {}
      rels = read;
      cache.set(element.id, rels);
    }
    return rels;
  };
}

/**
 * Replace any ArchimateView objects in the collection with the model elements,
 * relations and diagram objects visible on those views. Returns
 *   { modelCollection, diagramObjects }.
 * @param {ArchiCollection<ArchiObject>} collection
 * @param {string} [logPrefix]
 * @returns {{ modelCollection: ArchiCollection<ArchiObject>, diagramObjects: DiagramObject[] }}
 */
function _expandViews(collection, logPrefix = "") {
  const viewColl = collection.filter("view");
  if (viewColl.size() === 0) return { modelCollection: collection, diagramObjects: [] };

  let expanded = collection.not("view");
  /** @type {Set<string>} */
  const expandedIds = new Set();
  expanded.each(o => expandedIds.add(o.id));

  /** @type {DiagramObject[]} */
  const diagramObjects = [];
  /** @type {Set<string>} */
  const diagSeen = new Set();
  const addDiagramVO = (/** @type {DiagramObject} */ vo) => {
    if (vo && vo.id && !diagSeen.has(vo.id)) { diagSeen.add(vo.id); diagramObjects.push(vo); }
  };
  const addConcept = (/** @type {ArchiObject} */ concept) => {
    if (concept && concept.id && concept.type !== "archimate-diagram-model" &&
        !expandedIds.has(concept.id)) {
      expandedIds.add(concept.id);
      expanded.add(concept);
    }
  };

  viewColl.each(view => {
    try {
      $(view).find("element").each(ve => {
        // view-reference VOs surface in find("element") with .type "archimate-diagram-model"
        // (jArchi 1.12 quirk). Classify them as diagram objects via DIAGRAM_TYPES membership.
        if (ve.type && ve.type in Defs.DIAGRAM_TYPES) { addDiagramVO(ve); return; }
        addConcept(ve.concept || ve);
      });
    } catch (e) {}
    try {
      $(view).find("relation").each(vr => { addConcept(vr.concept || vr); });
    } catch (e) {}
    Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => {
      try { $(view).find(dt).each(dvo => { if (dvo && dvo.id) addDiagramVO(dvo); }); } catch (e) {}
    });
  });

  console.log(`${logPrefix}Expanded ${viewColl.size()} view(s) → ${expanded.size()} model objects · ${diagramObjects.length} diagram objects`);
  return { modelCollection: expanded, diagramObjects };
}

/**
 * Diagram-blocks of the given views: every diagram object with no diagram object above it (a group,
 * a note) and with contents holds a diagram-block of everything inside it.
 * @param {ArchiView[]} views
 * @returns {{ diagramBlockOf: Map<string, string>, blockContents: Map<string, BlockContents> }}
 *   diagramBlockOf: visual id → diagram-block id, for the visuals inside one; blockContents: what each holds
 */
function _readDiagramBlocks(views) {
  /** @type {Map<string, string>} */
  const diagramBlockOf = new Map();
  /** @type {Map<string, BlockContents>} */
  const blockContents = new Map();
  /** @type {(o: ArchiObject | null | undefined) => boolean} */
  const isDiagramObject = o => !!o && !!o.type && o.type in Defs.DIAGRAM_TYPES;
  for (const view of views) {
    for (const dt of Object.keys(Defs.DIAGRAM_TYPES)) {
      if (dt === "diagram-model-connection") continue;
      try {
        $(view).find(dt).each(d => {
          if (blockContents.has(String(d.id))) return;   // a view reference is found under two types
          // Cast: parent() of a visual is a visual, or the view (which has no .view).
          for (let p = /** @type {VisualObject | null} */ ($(d).parent().first()); p && p.view; p = /** @type {VisualObject | null} */ ($(p).parent().first())) {
            if (isDiagramObject(p)) return;   // inside another diagram object: part of that diagram-block
          }
          const contents = _blockContents(/** @type {VisualObject} */ (d));   // Cast: found on a view, so a visual
          if (contents.visuals.length === 0) return;
          blockContents.set(String(d.id), contents);
          for (const c of contents.visuals) diagramBlockOf.set(String(c.visual.id), String(d.id));
        });
      } catch (e) {}
    }
  }
  return { diagramBlockOf, blockContents };
}

/**
 * What the dialog counts diagram-blocks with, as a Create action reads them: the diagram-blocks of
 * the view(s) read (visual id → diagram-block id, and what each holds) and their element visuals.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @returns {{ diagramBlockOf: Map<string, string>, blockContents: Map<string, BlockContents>, sourceVisualElements: VisualObject[] }}
 */
function readDiagramBlocks(uiSelection) {
  return { ..._readDiagramBlocks(_viewsRead(uiSelection)), sourceVisualElements: _elementVisualsRead(uiSelection) };
}

/**
 * Everything inside one diagram-block, parents first, and the connections between the diagram-block
 * and its contents.
 * @param {VisualObject} block
 * @returns {BlockContents}
 */
function _blockContents(block) {
  /** @type {BlockContents["visuals"]} */
  const visuals = [];
  // children(), not find(): find() on a visual lists only element visuals, so notes and groups would be missed.
  const addContents = (/** @type {VisualObject} */ parent) => {
    $(parent).children().each(o => {
      const b = o.bounds;
      if (!o || !o.id || !b) return;   // a connection has no bounds
      const visual = /** @type {VisualObject} */ (o);   // Cast: it has bounds
      visuals.push({ visual, parentId: String(parent.id), bounds: { x: b.x, y: b.y, width: b.width, height: b.height } });
      addContents(visual);
    });
  };
  addContents(block);
  const inside = new Set([String(block.id), ...visuals.map(v => String(v.visual.id))]);
  /** @type {VisualConnection[]} */
  const connections = [];
  /** @type {Set<string>} */
  const seen = new Set();
  for (const v of [block, ...visuals.map(c => c.visual)]) {
    // Cast: the connections of a visual on a view are connections.
    /** @type {ArchiCollection<VisualConnection>} */ ($(v).outRels()).each(c => {
      if (seen.has(String(c.id)) || !inside.has(String(c.target.id))) return;
      seen.add(String(c.id));
      connections.push(c);
    });
  }
  return { visuals, connections };
}

/**
 * For actions that target an existing view (EXPAND_VIEW, LAYOUT_ONLY), collect
 * the visual elements, visual relations, and the view itself from the UI selection.
 * Other actions get all-empty.
 * @param {ArchiCollection<ArchiObject>} uiSelection
 * @param {string} actionId
 * @param {string} [logPrefix]
 * @returns {ExistingView}
 */
function _collectExistingVisuals(uiSelection, actionId, logPrefix = "") {
  if (!_isModifyAction(actionId)) {
    return { existingView: null, visualElements: [], visualRelations: [], positions: new Map() };
  }

  /** @type {VisualObject[]} */
  const visualElements = [];
  /** @type {VisualConnection[]} */
  const visualRelations = [];
  /** @type {Set<string>} */
  const seenEl = new Set();
  /** @type {Set<string>} */
  const seenRel = new Set();
  // Cast: assigned inside addVE / addVR, which tsc does not follow; keep the declared type wide.
  let existingView = /** @type {ArchiView | null} */ (null);

  const addVE = (/** @type {VisualObject} */ ve) => {
    if (!ve || !ve.id || !ve.view || seenEl.has(ve.id)) return;
    // view-reference VOs sneak in via find("element"); they belong with diagram objects, not VEs.
    if (ve.type && ve.type in Defs.DIAGRAM_TYPES) return;
    seenEl.add(ve.id);
    visualElements.push(ve);
    if (!existingView) existingView = ve.view;
  };
  const addVR = (/** @type {VisualConnection} */ vr) => {
    if (!vr || !vr.id || !vr.view || seenRel.has(vr.id)) return;
    seenRel.add(vr.id);
    visualRelations.push(vr);
    if (!existingView) existingView = vr.view;
  };

  // Case 1: view selected from the model tree.
  let viewFound = false;
  try {
    uiSelection.each(o => {
      if (o.type === "archimate-diagram-model" && !o.view) {
        viewFound = true;
        const view = /** @type {ArchiView} */ (o);   // Cast: type is archimate-diagram-model and it is not a visual
        existingView = view;
        try { $(view).find("element").each(addVE); } catch (e) {}
        try { $(view).find("relation").each(addVR); } catch (e) {}
      }
    });
  } catch (e) {}

  // Case 2: visual objects selected on a canvas.
  if (!viewFound) {
    try {
      Selection.getVisualSelection(uiSelection, "*").each(vo => {
        if (!vo || !vo.id || !vo.view) return;
        // Casts: a visual whose concept is a relationship is a connection.
        if (vo.concept && vo.concept.type && vo.concept.type.endsWith("-relationship")) addVR(/** @type {VisualConnection} */ (vo));
        else addVE(/** @type {VisualObject} */ (vo));
      });
    } catch (e) {}
    // EXPAND_VIEW lays out the whole view, not only the selected visuals.
    if (actionId === ACTION.EXPAND_VIEW.id && existingView) {
      try { $(existingView).find("element").each(addVE); } catch (e) {}
      try { $(existingView).find("relation").each(addVR); } catch (e) {}
    }
  }

  console.log(`${logPrefix}Existing on view: ${visualElements.length} VEs · ${visualRelations.length} VRs · view: "${existingView && existingView.name || "none"}"`);
  const positions = existingView ? _readPositions(existingView) : new Map();
  return { existingView, visualElements, visualRelations, positions, viewFromTree: viewFound };
}

/**
 * Where every object on a view sits, for the write plan: its parent visual (an element, a group or
 * a note; null at view root) and its bounds. Connections are left out.
 * @param {ArchiView} view
 * @returns {Map<string, VisualPosition>}
 */
function _readPositions(view) {
  /** @type {Map<string, VisualPosition>} */
  const out = new Map();
  $(view).find().each(o => {
    const b = o.bounds;
    if (!b) return;   // a connection has no bounds
    const p = $(o).parent().first();
    out.set(String(o.id), { parentId: p && p.view ? String(p.id) : null, bounds: { x: b.x, y: b.y, width: b.width, height: b.height } });
  });
  return out;
}

/**
 * Describe visual elements for nesting resolution and pairing: per visual its element, parent
 * visual, container chain and whether it is managed. Classified over the whole view (records,
 * contents of containers), returned for the given visuals only, in view order.
 * @param {DiagramObject[]} visualElements  visual elements of one view (the VisualSet, or the dialog's
 *   selection); other visuals in the list (a selected connection) are left out
 * @returns {VisualDescription[]}
 */
function describeVisuals(visualElements) {
  const wanted = new Set((visualElements || []).filter(ve => ve && ve.id).map(ve => String(ve.id)));
  if (wanted.size === 0) return [];
  const first = visualElements.find(ve => ve && ve.view);
  if (!first) return [];
  const view = first.view;
  /** @type {RawVisual[]} */
  const raw = [];
  /** @type {Set<string>} */
  const seen = new Set();
  const parentOf = (/** @type {DiagramObject} */ o) => { try { const p = $(o).parent().filter("element").first(); return p ? String(p.id) : null; } catch (e) { return null; } };
  try {
    $(view).find("element").each(ve => {
      if (!ve.concept || !ve.concept.id || ve.type in Defs.DIAGRAM_TYPES) return;
      seen.add(String(ve.id));
      raw.push({ id: String(ve.id), conceptId: ve.concept.id, parentVisualId: parentOf(ve) });
    });
    // Notes, groups, view references: user content, so a managed container holding one is kept.
    for (const dt of Object.keys(Defs.DIAGRAM_TYPES)) {
      if (dt === "diagram-model-connection") continue;
      try { $(view).find(dt).each(o => {
        if (seen.has(String(o.id))) return;   // a view reference is found under two types
        seen.add(String(o.id));
        raw.push({ id: String(o.id), conceptId: null, parentVisualId: parentOf(o) });
      }); } catch (e) {}
    }
  } catch (e) { console.error(`Failed to read the visuals of view "${view && view.name}": ${e}`); }
  /** @type {string[]} */
  let records = [];
  try { records = [...(view.prop(Defs.PROP_MANAGED_OCCURRENCE, true) || [])].map(String); } catch (e) {}
  return Nesting.classifyVisuals(raw, records).filter(v => wanted.has(v.id));
}

/**
 * Raw model elements from the Archi UI selection, before any preset filter or
 * related-elements expansion. Views in the selection are expanded to their
 * elements (same as buildObjectSet step 1). Relations, folders, and view nodes
 * are excluded. Used by ONE_EACH to determine the seed set.
 *
 * @param {ArchiCollection<ArchiObject>} uiSelection  $(selection) from Archi UI
 * @returns {ArchiElement[]}  array of jArchi model element objects
 */
function getSeedElements(uiSelection) {
  const raw = Selection.getSelection(uiSelection, "*");
  const { modelCollection } = _expandViews(raw);
  /** @type {ArchiElement[]} */
  const seeds = [];
  modelCollection.filter("element").each(o => seeds.push(/** @type {ArchiElement} */ (o)));   // Cast: in the model collection "element" selects model elements
  return seeds;
}

module.exports = {
  readSelection,
  readRelationIndex,
  readDiagramBlocks,
  describeVisuals,
  getSeedElements,
};
