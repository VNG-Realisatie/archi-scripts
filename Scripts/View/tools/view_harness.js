#!/usr/bin/env node
/**
 * Node harness for the View subsystem without Archi: a view from an .archimate file read into the
 * Snapshot readSelection would give (readSnapshot), then generate_view's own plan() on it: object
 * set, nesting, layout graph, engine, write plan. Covers everything but rendering; Graphviz needs the dot
 * binary on the PATH (process_runner_node.js); the .archimate reader is a second path to the model, which can drift from jArchi.
 *
 * Run: node Scripts/View/tools/view_harness.js <model.archimate> "<folder/…/view name>" [preset.json]
 *        [--action=<action id>]  default: layout_only (the view's contents as they are)
 *        [--write-plan]          print the write plan as JSON instead of the summary
 *
 * As a module: loadModel, findView, readSnapshot, relationIndex, planView, writePlanJson
 * and the parsers (see below).
 */
const fs   = require("fs");
const path = require("path");

const LIB = path.join(__dirname, "..", "lib") + "/";
global.__DIR__ = LIB;
// The vendored elkjs reads its worker through Java I/O (node_modules/elkjs/index.js).
global.Java = global.Java || {
  type: n => n.endsWith("Files") ? { readString: p => fs.readFileSync(String(p), "utf8") } : { get: p => p },
};
const _log = console.log;
console.log = (...a) => { if (!(typeof a[0] === "string" && a[0].startsWith("Loading "))) _log(...a); };

const Defs     = require(LIB + "defs");
const Nesting  = require(LIB + "nesting");   // classifyVisuals, as describeVisuals

// ── .archimate reader ─────────────────────────────────────────────────────────

const _ENTITIES = { quot: '"', amp: "&", lt: "<", gt: ">", apos: "'" };
const _decode = s => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10))
               : (_ENTITIES[e] !== undefined ? _ENTITIES[e] : m));

/** Minimal XML parser for Archi model files: tags and attributes, text ignored. */
function parseXml(xml) {
  const root = { tag: "#root", attrs: {}, children: [], parent: null };
  let cur = root;
  const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const attrRe = /([\w:.-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = tagRe.exec(xml))) {
    if (!m[2]) continue;                       // comment, declaration, CDATA
    if (m[1]) { cur = cur.parent || root; continue; }
    const attrs = {};
    let a;
    attrRe.lastIndex = 0;
    while ((a = attrRe.exec(m[3]))) attrs[a[1]] = _decode(a[2]);
    const node = { tag: m[2], attrs, children: [], parent: cur };
    cur.children.push(node);
    if (!m[4]) cur = node;
  }
  return root;
}

/** "archimate:BusinessObject" → "business-object" (jArchi type ids). */
function jarchiType(xsiType) {
  const t = String(xsiType || "").replace(/^archimate:/, "");
  const special = { DiagramObject: "diagram-object", Group: "diagram-model-group", Note: "diagram-model-note",
                    DiagramModelReference: "diagram-model-reference", Connection: "connection",
                    ArchimateDiagramModel: "archimate-diagram-model", SketchModel: "sketch-model" };
  if (special[t]) return special[t];
  return t.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function _props(node) {
  const p = {};
  for (const c of node.children) if (c.tag === "property" && c.attrs.key !== undefined) p[c.attrs.key] = c.attrs.value || "";
  return p;
}

/** A visual's bounds as jArchi reads them (absent attributes are 0). */
function _bounds(node) {
  const b = node.children.find(c => c.tag === "bounds");
  const n = k => (b && b.attrs[k] !== undefined ? Number(b.attrs[k]) : 0);
  return { x: n("x"), y: n("y"), width: n("width"), height: n("height") };
}

/**
 * Model objects shaped like jArchi's: element { id, type, name, prop(k) },
 * relation { id, type, name, source, target, prop(k) }, view { id, name, path, node }.
 */
function loadModel(file) {
  const root = parseXml(fs.readFileSync(file, "utf8"));
  const elements = new Map(), relations = new Map(), views = [];
  const pending = [];
  const walk = (node, folders) => {
    for (const c of node.children) {
      if (c.tag === "folder") { walk(c, [...folders, c.attrs.name || ""]); continue; }
      if (c.tag !== "element") { if (c.tag.endsWith("model")) walk(c, folders); continue; }
      const type = jarchiType(c.attrs["xsi:type"]);
      const props = _props(c);
      const obj = { id: c.attrs.id, type, name: c.attrs.name || "", prop: k => props[k] };
      if (type === "archimate-diagram-model" || type === "sketch-model") {
        views.push({ id: obj.id, name: obj.name, path: [...folders, obj.name].join("/"), node: c });
      } else if (type.endsWith("-relationship")) {
        relations.set(obj.id, obj);
        pending.push([obj, c.attrs.source, c.attrs.target]);
      } else {
        elements.set(obj.id, obj);
      }
    }
  };
  walk(root, []);
  for (const [rel, s, t] of pending) {
    rel.source = elements.get(s) || relations.get(s) || null;
    rel.target = elements.get(t) || relations.get(t) || null;
  }
  return { elements, relations, views };
}

/** A view by full folder path ("Views/_Generated/Kennismodel (copy)") or by name when unique. */
function findView(model, viewPath) {
  const exact = model.views.filter(v => v.path === viewPath);
  if (exact.length === 1) return exact[0];
  const byName = model.views.filter(v => v.name === viewPath || v.path.endsWith("/" + viewPath));
  if (byName.length === 1) return byName[0];
  throw `View "${viewPath}": ${exact.length + byName.length ? "ambiguous" : "not found"}`;
}

/**
 * The contents of a view as the jArchi reader sees them (selection_read.js): element visuals, diagram
 * objects (notes, groups with their bounds, connections without a relation with their ends),
 * diagram-blocks, visual relations, the positions of every object, and the managed-occurrence
 * records on the view. A visual's parent is its direct parent when that is an element visual.
 */
function _walkView(model, view) {
  const elements = [], seen = new Set(), raw = [], visualElements = [], visualRelations = [], drawnRelIds = new Set();
  const diagramObjects = [], diagramBlockOf = new Map(), blockContents = new Map(), positions = new Map(), connections = [];
  const walk = (node, parentVisual, blockId) => {
    for (const c of node.children) {
      if (c.tag === "sourceConnection") {
        const ends = { source: { id: c.attrs.source }, target: { id: c.attrs.target } };
        connections.push({ id: c.attrs.id, ...ends });
        if (c.attrs.archimateRelationship) {
          const rel = model.relations.get(c.attrs.archimateRelationship);
          drawnRelIds.add(c.attrs.archimateRelationship);
          if (rel) visualRelations.push({ id: c.attrs.id, concept: rel, ...ends });
        } else {
          diagramObjects.push({ id: c.attrs.id, type: "diagram-model-connection", name: c.attrs.name || "", ...ends });
        }
      }
      if (c.tag !== "child") continue;
      const el = c.attrs.archimateElement && model.elements.get(c.attrs.archimateElement);
      const type = jarchiType(c.attrs["xsi:type"]);
      const isDiagramObject = !el && type in Defs.DIAGRAM_TYPES;
      if (!el && !isDiagramObject) continue;
      positions.set(c.attrs.id, { parentId: parentVisual ? parentVisual.id : null, bounds: _bounds(c) });
      const record = el
        ? { id: c.attrs.id, type: "archimate-element", concept: el, bounds: _bounds(c) }
        : { id: c.attrs.id, type, name: c.attrs.name || "", bounds: _bounds(c) };
      if (blockId) {
        diagramBlockOf.set(c.attrs.id, blockId);
        if (!blockContents.has(blockId)) blockContents.set(blockId, { visuals: [], connections: [] });
        blockContents.get(blockId).visuals.push({ visual: record, parentId: parentVisual.id, bounds: _bounds(c) });
      }
      const parentVisualId = parentVisual && parentVisual.isElement ? parentVisual.id : null;
      if (el) {
        if (!seen.has(el.id)) { seen.add(el.id); elements.push(el); }
        raw.push({ id: c.attrs.id, conceptId: el.id, parentVisualId, isElement: true });
        visualElements.push({ id: c.attrs.id, concept: el });
      } else {
        diagramObjects.push(record);
        raw.push({ id: c.attrs.id, conceptId: null, parentVisualId, isElement: false });
      }
      walk(c, { id: c.attrs.id, isElement: !!el }, blockId || (isDiagramObject ? c.attrs.id : null));
    }
  };
  walk(view.node, null, null);
  // A diagram connection's ends with their concept, so an end on an element visual finds its element.
  const conceptOf = new Map(visualElements.map(v => [v.id, v.concept]));
  for (const o of diagramObjects) if (o.source) { o.source.concept = conceptOf.get(o.source.id) || null; o.target.concept = conceptOf.get(o.target.id) || null; }
  for (const [blockId, block] of blockContents) {
    const inside = new Set([blockId, ...block.visuals.map(v => v.visual.id)]);
    block.connections = connections.filter(c => inside.has(c.source.id) && inside.has(c.target.id));
  }
  const records = view.node.children
    .filter(c => c.tag === "property" && c.attrs.key === Defs.PROP_MANAGED_OCCURRENCE).map(c => c.attrs.value || "");
  // describeVisuals: classified over the whole view, returned for the element visuals; elements first, then diagram objects.
  const ordered = [...raw.filter(v => v.isElement), ...raw.filter(v => !v.isElement)]
    .map(v => ({ id: v.id, conceptId: v.conceptId, parentVisualId: v.parentVisualId }));
  const elementVisualIds = new Set(visualElements.map(v => v.id));
  const visuals = Nesting.classifyVisuals(ordered, records).filter(v => elementVisualIds.has(v.id));
  return { elements, seen, visualElements, visualRelations, drawnRelIds, diagramObjects, diagramBlockOf, blockContents, positions, visuals, records };
}

/**
 * The relations of an element as jArchi's rels() gives them:
 * its source relations, then its target relations, each in file order; a self-loop is listed twice (verified in Archi).
 * That is the order of a freshly opened model: in Archi, drawing a connection moves its relation to the end.
 * @returns {(element: {id: string}) => object[]}
 */
function relationIndex(model) {
  const bySource = new Map(), byTarget = new Map();
  const push = (map, id, rel) => { if (!map.has(id)) map.set(id, []); map.get(id).push(rel); };
  for (const rel of model.relations.values()) {
    if (rel.source) push(bySource, rel.source.id, rel);
    if (rel.target) push(byTarget, rel.target.id, rel);
  }
  return element => [...(bySource.get(element.id) || []), ...(byTarget.get(element.id) || [])];
}

/**
 * The Snapshot readSelection would give for a view (types/view.d.ts): the view selected on its canvas,
 * for the Modify actions (EXPAND_VIEW, LAYOUT_ONLY) with the view's visuals; for the Create actions the
 * view is read from (its diagram-blocks and element visuals), not written to.
 * @param {string} actionId  ACTION.*.id
 */
function readSnapshot(model, view, actionId) {
  const w = _walkView(model, view);
  const modify = actionId === Defs.ACTION.EXPAND_VIEW.id || actionId === Defs.ACTION.LAYOUT_ONLY.id;
  return {
    elements: w.elements,
    diagramObjects: w.diagramObjects,
    relationsOf: relationIndex(model),
    existing: modify
      ? { existingView: view, visualElements: w.visualElements, visualRelations: w.visualRelations, positions: w.positions, viewFromTree: false }
      : { existingView: null, visualElements: [], visualRelations: [], positions: new Map() },
    diagramBlockOf: w.diagramBlockOf,
    blockContents: w.blockContents,
    sourceVisualElements: modify ? [] : w.visualElements,
    visuals: modify ? w.visuals : [],
  };
}

/**
 * generate_view's plan for a view of the model file, as Archi would run it on that view selected on
 * its canvas: object set, layout graph, layout result and write plan; null when nothing is placed.
 * @param preset    a validated preset (validatePreset); masked here as generate_view does
 * @param actionId  ACTION.*.id
 */
function planView(model, view, preset, actionId) {
  const GenView = require(LIB + "generate_view");
  return GenView.plan({ ...preset, params: Defs.effectiveParams(preset) }, readSnapshot(model, view, actionId), actionId, require("./process_runner_node").runProcess);
}

/** A write plan as JSON: elements and relations by id. */
function writePlanJson(writePlan) {
  return JSON.stringify(writePlan, (k, v) => ((k === "element" || k === "relation" || k === "source") && v && v.id ? v.id : v), 1);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseXml, jarchiType, loadModel, findView, readSnapshot, relationIndex, planView, writePlanJson };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const flag = name => process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
  if (args.length < 2) { _log("usage: view_harness.js <model.archimate> <view path> [preset.json] [--action=<action id>] [--write-plan]"); process.exit(2); }
  const preset = Defs.validatePreset(args[2] ? JSON.parse(fs.readFileSync(args[2], "utf8")) : {});
  const model = loadModel(args[0]);
  const view = findView(model, args[1]);
  const action = flag("action") ? flag("action").split("=")[1] : Defs.ACTION.LAYOUT_ONLY.id;
  const log = console.log;
  console.log = () => {};   // the plan's console output
  const planned = planView(model, view, preset, action);
  console.log = log;
  if (!planned) _log("Nothing to place.");
  else if (flag("write-plan")) _log(writePlanJson(planned.writePlan));
  else {
    const { objectSet, graph, result, writePlan } = planned;
    let x1 = 0, y1 = 0;
    for (const n of result.nodes) { x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); }
    const ns = graph._nestingStats;
    _log(`View "${view.path}" · ${action} · ${preset.algorithm}: ${objectSet.elements.length} elements · ${objectSet.relations.length} relations · ${objectSet.diagramObjects.length} diagram objects`);
    _log(`Nestings ${ns.applied}/${ns.candidates} (${ns.circularNestings} circular, ${ns.notNestedNestings} drawn as a line) · ` +
         `visuals ${objectSet.visuals.length} (${objectSet.visuals.filter(v => v.managed).length} managed)`);
    _log(`Layout: ${graph.nodes.length} nodes · ${graph.edges.length} edges → ${result.nodes.length} nodes · ${result.edges.length} edges · ${Math.round(x1)} × ${Math.round(y1)} px`);
    _log(`Write plan: ${writePlan.nodes.length} nodes (${writePlan.nodes.filter(w => "element" in w).length} created) · ${writePlan.connections.length} connections · ` +
         `${writePlan.nestings.length + writePlan.keptNestings} nestings · ${writePlan.removedVisuals.length} managed removed · ${writePlan.userAtRoot} user content at view root`);
  }
}
