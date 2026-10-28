#!/usr/bin/env node
/**
 * Node harness for the View subsystem without Archi: a view from an .archimate file → selection
 * (elements, relations, visuals with their managed-occurrence records) → nesting resolution and
 * pairing → layout graph → engine. Covers pipeline, nesting, layout graph and adapters — not the
 * writer (simulateWrite models its pairing outcome), not rendering.
 *
 * Run: node Scripts/View/tools/view_harness.js <model.archimate> "<folder/…/view name>" [preset.json]
 *        [--on-view]   relations drawn on the view only (default: every model relation between its elements)
 *        [--new-view]  ignore the visuals on the view, as a Create action does (default: modify the view)
 *        [--reverse]   feed elements and relations in reverse order (order-independence check)
 *        [--layout]    also run the layout engine
 *
 * As a module: loadModel, viewContents, newView, maskPreset, resolve, layoutGraph, layout, simulateWrite (see below).
 * Params are masked to the algorithm's active ones (maskPreset), as generate_view does.
 */
const fs   = require("fs");
const path = require("path");

const LIB = path.join(__dirname, "..", "lib") + "/";
global.__DIR__ = LIB;
global.Java = global.Java || {
  type: n => n.endsWith("Files") ? { readString: p => fs.readFileSync(String(p), "utf8") } : { get: p => p },
};
const _log = console.log;
console.log = (...a) => { if (!(typeof a[0] === "string" && a[0].startsWith("Loading "))) _log(...a); };

const Defs     = require(LIB + "defs");
const Pipeline = require(LIB + "selection_pipeline");

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
 * What the pipeline would see for a view: its elements, relations, visuals (describeVisuals form)
 * and visual relations.
 * @param {{onView?: boolean, reverse?: boolean}} [opts]
 *   onView  — only relations drawn on the view (LAYOUT_ONLY, EXPAND_VIEW); default: all model
 *             relations between the view's elements
 *   reverse — reverse element and relation order
 */
function viewContents(model, view, opts) {
  opts = opts || {};
  const elements = [], seen = new Set(), raw = [], visualRelations = [], drawnRelIds = new Set();
  const walk = (node, parentVisualId) => {
    for (const c of node.children) {
      if (c.tag === "sourceConnection" && c.attrs.archimateRelationship) {
        const rel = model.relations.get(c.attrs.archimateRelationship);
        drawnRelIds.add(c.attrs.archimateRelationship);
        if (rel) visualRelations.push({ id: c.attrs.id, concept: rel, source: { id: c.attrs.source }, target: { id: c.attrs.target } });
      }
      if (c.tag !== "child") continue;
      const el = c.attrs.archimateElement && model.elements.get(c.attrs.archimateElement);
      if (el) {
        if (!seen.has(el.id)) { seen.add(el.id); elements.push(el); }
        raw.push({ id: c.attrs.id, conceptId: el.id, parentVisualId });
      }
      walk(c, el ? c.attrs.id : parentVisualId);
    }
  };
  walk(view.node, null);
  const records = view.node.children
    .filter(c => c.tag === "property" && c.attrs.key === Defs.PROP_MANAGED_OCCURRENCE).map(c => c.attrs.value || "");
  let relations = [...model.relations.values()].filter(r =>
    r.source && r.target && seen.has(r.source.id) && seen.has(r.target.id) && (!opts.onView || drawnRelIds.has(r.id)));
  if (opts.reverse) { elements.reverse(); relations = relations.reverse(); }
  return { elements, relations, visuals: Pipeline.classifyVisuals(raw, records), visualRelations };
}

/** The same contents as a Create action sees them: no visuals on a target view. */
function newView(contents) {
  return { ...contents, visuals: [], visualRelations: [] };
}

/** Nesting split + resolution (with pairing), as the writer and the dialog counters do it. */
function resolve(params, contents) {
  const split = Pipeline.splitNestingRels(contents.relations, params);
  const nesting = Pipeline.resolveNesting(contents.elements, split.nestingRels, params, contents.visuals);
  return { split, nesting };
}

/**
 * The preset as generate_view runs it: params masked to the algorithm's active ones, so an inactive
 * param (e.g. connectionSpacing for Radial) does not change element sizes or spacing.
 */
function maskPreset(preset) {
  return { ...preset, params: Defs.effectiveParams(preset) };
}

/** The LayoutGraph generate_view would hand to the engine. */
function layoutGraph(preset, contents) {
  const GenView = require(LIB + "generate_view");
  preset = maskPreset(preset);
  const split = Pipeline.splitNestingRels(contents.relations, preset.params);
  return GenView.buildLayoutGraph(preset, contents.elements, split.connectionRels.slice(), split.nestingRels, [],
    contents.visuals, contents.visualRelations);
}

/**
 * The visuals and records a write leaves on the view, from a resolution's pairing: paired visuals
 * kept, new ones created (id "new:<occurrence>"), removed ones gone, records rewritten.
 * Connections are not modelled. Returns contents for the next run.
 */
function simulateWrite(contents, nesting) {
  const visualOfOcc = occ => nesting.visualOf[occ] || `new:${occ}`;
  const raw = [];
  for (const el of contents.elements) {
    for (const occ of nesting.occurrenceMap[el.id]) {
      const p = nesting.parentMap[occ];
      raw.push({ id: visualOfOcc(occ), conceptId: el.id, parentVisualId: p ? visualOfOcc(p) : null });
    }
  }
  const records = Pipeline.managedRecords(nesting, () => true);
  return { ...contents, visuals: Pipeline.classifyVisuals(raw, records), visualRelations: [], records };
}

/** Run the preset's engine on a layout graph; returns the LayoutResult. */
function layout(graph) {
  const engine = Defs.ALGORITHMS[graph.algorithm].engine;
  const file = { ELK: "elk", Dagre: "dagre", Graphviz: "graphviz" }[engine];
  return require(LIB + "engines/" + file).layout(graph);
}

/** Order-free summary of a resolution: per element its occurrences' parent elements; cycles; lines. */
function summarize(nesting, byId) {
  const base = id => id.replace(/_occ_\d+$/, "");
  const name = id => { const e = byId.get(base(id)); return e ? e.name : id; };
  const placements = Object.keys(nesting.occurrenceMap).sort().map(id =>
    `${name(id)} ⊂ [${nesting.occurrenceMap[id].map(o => nesting.parentMap[o] ? name(base(nesting.parentMap[o])) : "root").sort().join(", ")}]`);
  return {
    placements,
    nested:   nesting.parentRels.map(b => `${b.rel.id}:${b.srcOccId}>${b.tgtOccId}`).sort(),
    lines:    nesting.notNestedNestingRels.map(r => r.id).sort(),
    circular: nesting.circularNestingRels.map(r => r.id).sort(),
    cycles:   nesting.cycles.map(c => c.elements.map(e => e.name).join(" ↔ ")),
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { parseXml, jarchiType, loadModel, findView, viewContents, newView, maskPreset, resolve, layoutGraph, layout,
                     simulateWrite, summarize };
}

// ── CLI ───────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const args = process.argv.slice(2).filter(a => !a.startsWith("--"));
  const flags = new Set(process.argv.slice(2).filter(a => a.startsWith("--")));
  if (args.length < 2) { _log("usage: view_harness.js <model.archimate> <view path> [preset.json] [--on-view] [--new-view] [--reverse] [--layout]"); process.exit(2); }
  const preset = maskPreset(Defs.validatePreset(args[2] ? JSON.parse(fs.readFileSync(args[2], "utf8")) : {}));
  const model = loadModel(args[0]);
  const view = findView(model, args[1]);
  let contents = viewContents(model, view, { onView: flags.has("--on-view"), reverse: flags.has("--reverse") });
  if (flags.has("--new-view")) contents = newView(contents);
  const { split, nesting } = resolve(preset.params, contents);
  const byId = new Map(contents.elements.map(e => [e.id, e]));
  const s = summarize(nesting, byId);
  _log(`View "${view.path}": ${contents.elements.length} elements · ${contents.relations.length} relations · ` +
       `${split.nestingRels.length} nesting candidates`);
  _log(`Nested ${nesting.parentRels.length} · drawn as a line ${nesting.notNestedNestingRels.length} · circular ${nesting.circularNestingRels.length}`);
  _log(`Visuals ${contents.visuals.length} (${contents.visuals.filter(v => v.managed).length} managed) · paired ${Object.keys(nesting.visualOf).length} · ` +
       `to create ${Object.values(nesting.occurrenceMap).flat().filter(o => !nesting.visualOf[o]).length} · ` +
       `managed to remove ${nesting.removedVisualIds.length} · user content at view root ${nesting.userAtRoot}`);
  for (const c of s.cycles) _log(`  cycle: ${c}`);
  for (const p of s.placements) if (!p.endsWith("[root]")) _log(`  ${p}`);
  if (flags.has("--layout")) {
    const graph = layoutGraph(preset, contents);
    const result = layout(graph);
    let x1 = 0, y1 = 0;
    for (const n of result.nodes) { x1 = Math.max(x1, n.x + n.width); y1 = Math.max(y1, n.y + n.height); }
    _log(`Layout ${preset.algorithm}: ${graph.nodes.length} nodes · ${graph.edges.length} edges → ` +
         `${result.nodes.length} nodes · ${result.edges.length} edges · ${Math.round(x1)} × ${Math.round(y1)} px`);
  }
}
