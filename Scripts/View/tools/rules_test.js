/**
 * Node tests for rules of SPEC § 11 that no other test holds, on the test model: 2 position spread only (nothing after
 * the engine moves or resizes an element: the result is the adapter's own, and the write plan places every element where
 * the result does), 7 container-ness is derived
 * (no node carries a flag; a node is a container exactly when the parent map names it), 8 relations are never modified
 * (their ends stay, a reversed relation's edge is swapped in the layout graph only and nothing marks it), 10 no silent
 * data loss (a Modify action drops only managed occurrences, lines of relations drawn as nesting and self-loops the
 * algorithm does not draw), 14 inactive options are ignored (changing them changes nothing), 15 a preset holds
 * only what affects generation, 11 appearance preservation (the writer sets only the bounds of a visual it keeps, and only
 * the label position and bendpoints of a connection it keeps; a stand-in of jArchi records every change). Run from the repo root:
 *   node Scripts/View/tools/rules_test.js [model.archimate]
 */
const fs   = require("fs");
const path = require("path");

const _log = console.log;
const H        = require("./view_harness");
const Defs     = require("../lib/defs");
const Expected = require("./expected");
const NodeLayout = require("../lib/node_layout");
const Writer     = require("../lib/view_writer");
const Log      = require("../../_lib/log");
console.log = _log;
Log.warn = () => {};   // validation warns about an option an algorithm does not offer: expected here

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; _log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

const VIEW  = path.join(__dirname, "..");
const model = H.loadModel(process.argv[2] || path.join(VIEW, "test/model/view-test.archimate"));
const BASELINE = path.join(VIEW, "presets/Test/baseline");
const presetFile = file => Defs.validatePreset(JSON.parse(fs.readFileSync(file, "utf8")));
const baseline = algorithm => Defs.validatePreset({ ...JSON.parse(fs.readFileSync(path.join(BASELINE, "baseline.json"), "utf8")), algorithm });
const ALGORITHMS = Object.keys(Defs.ALGORITHMS);

/** The plan of a run, its console silenced; null when nothing is placed. */
function plan(preset, viewName, action) {
  const quiet = console.log; console.log = () => {};
  try { return H.planView(model, H.findView(model, "Views/Test/" + viewName), preset, action, true); }
  finally { console.log = quiet; }
}
const NEW = Defs.ACTION.NEW_VIEW.id, LAYOUT = Defs.ACTION.LAYOUT_ONLY.id;

// ── 2: position spread only — nothing after the engine changes its result ──────────────────────────────────────────
{
  const quietLoad = console.log; console.log = () => {};
  const runtime = H.layoutRuntime(true);
  console.log = quietLoad;
  const runs = [["1 Nesting", null], ["4 Parts", null], ["6 GEMMA", "Bedrijfsfuncties background"], ["7 GEMMA functions", "Bedrijfsobjecten"]];
  for (const algorithm of ALGORITHMS.filter(a => !(a in Expected.UNSTABLE_ALGORITHMS))) for (const [viewName, gemma] of runs) {
    const preset = gemma ? Defs.validatePreset({ ...JSON.parse(fs.readFileSync(path.join(Expected.GEMMA_PRESET_DIR, gemma + ".json"), "utf8")), algorithm }) : baseline(algorithm);
    const planned = plan(preset, viewName, NEW);
    const label = `${algorithm} ${viewName}`;
    const quiet = console.log; console.log = () => {};
    const again = NodeLayout.layout(planned.graph, Defs.ALGORITHMS[algorithm].engine, runtime);
    console.log = quiet;
    eq(JSON.stringify(planned.result) === JSON.stringify(again), true, `${label}: the result is the adapter's own, unchanged after it`);
    const box = new Map(planned.result.nodes.map(n => [n.id, n]));
    const byNode = new Map(planned.writePlan.nodes.map(w => [w.node, w]));
    const absolute = w => { const p = w.parent ? absolute(byNode.get(w.parent)) : { x: 0, y: 0 }; return { x: p.x + w.bounds.x, y: p.y + w.bounds.y }; };
    const moved = planned.writePlan.nodes.filter(w => box.has(w.node)).filter(w => {
      const a = absolute(w), b = box.get(w.node);
      return Math.abs(a.x - b.x) > 1 || Math.abs(a.y - b.y) > 1 || Math.abs(w.bounds.width - b.width) > 1 || Math.abs(w.bounds.height - b.height) > 1;
    }).map(w => w.node);
    eq(moved, [], `${label}: the write plan puts every element where the result has it, at its size`);
  }
}

// ── 7: container-ness is derived ─────────────────────────────────────────────────────────────────────────────────────
{
  const NODE_KEYS = ["id", "label", "elementType", "width", "height", "labelHeight", "minWidth", "parent"].sort();
  for (const [viewName, preset] of [["1 Nesting", baseline("Tiles")], ["4 Parts", baseline("Layered")], ["6 GEMMA", presetFile(path.join(Expected.GEMMA_PRESET_DIR, "Bedrijfsfuncties.json"))]]) {
    const { graph } = plan(preset, viewName, NEW);
    const label = `${viewName} ${preset.algorithm}`;
    eq([...new Set(graph.nodes.flatMap(n => Object.keys(n)))].sort().filter(k => !NODE_KEYS.includes(k)), [], `${label}: a layout node carries no flag, only ${NODE_KEYS.join(", ")}`);
    const parents = new Set(graph.nodes.map(n => n.parent).filter(Boolean));
    eq([...parents].sort(), [...new Set(Object.values(graph._parentMap))].sort(), `${label}: the containers are the nodes the parent map names`);
    eq(graph.nodes.filter(n => !parents.has(n.id)).every(n => !Object.values(graph._parentMap).includes(n.id)), true, `${label}: a node nothing is inside is no container`);
  }
}

// ── 8: relations are never modified ─────────────────────────────────────────────────────────────────────────────────
{
  const ends = () => JSON.stringify([...model.relations.values()].map(r => [r.id, r.type, r.source && r.source.id, r.target && r.target.id]));
  const before = ends();
  const preset = baseline("Layered");
  eq(preset.params.reverseConditions.map(c => c.relation), ["realization-relationship", "serving-relationship"], "the baseline reverses realization and serving");
  const planned = plan(preset, "3 Network", NEW);
  const rel = [...model.relations.values()].find(r => r.type === "serving-relationship" && planned.graph.edges.some(e => e.conceptId === r.id));
  eq(!!rel, true, "view 3 draws a serving relation as a line");
  const edge = planned.graph.edges.find(e => e.conceptId === rel.id);
  const occ = id => id.replace(/_occ_\d+$/, "");
  eq([occ(edge.source), occ(edge.target)], [rel.target.id, rel.source.id], "a reversed relation's edge (serving) runs from the model target to its source in the layout graph");
  eq([rel.source.id !== rel.target.id, ends() === before], [true, true], "and the model relation keeps its ends");
  const flagged = key => /revers|flip|direction|swap/i.test(key);
  eq([...new Set([...planned.graph.edges, ...planned.writePlan.connections].flatMap(c => Object.keys(c)))].filter(flagged), [], "no layout edge or connection write carries a reversed or flipped flag");
  for (const algorithm of ALGORITHMS) plan(baseline(algorithm), "3 Network", NEW);
  eq(ends(), before, "no run changes a model relation");
}

// ── 10: a Modify action drops only what the rules allow ─────────────────────────────────────────────────────────────
{
  const viewName = "2 Edited", view = H.findView(model, "Views/Test/" + viewName);
  const snapshot = H.readSnapshot(model, view, LAYOUT);
  const managed = new Set(snapshot.visuals.filter(v => v.managed).map(v => v.id));
  const inBlock = new Set(snapshot.diagramBlockOf.keys());   // a diagram-block's contents are not laid out: they stay as they are
  const user = snapshot.visuals.filter(v => !v.managed && !inBlock.has(v.id)).map(v => v.id);
  const diagramObjects = snapshot.diagramObjects.filter(o => !o.source && !inBlock.has(o.id)).map(o => o.id);
  const loops = new Set(snapshot.existing.visualRelations.filter(v => v.concept.source && v.concept.source.id === v.concept.target.id).map(v => v.id));
  const lineOf = new Map(snapshot.existing.visualRelations.map(v => [v.id, v.concept]));
  const files = ["baseline.json", "AlgoTwopi.json"].map(f => path.join(BASELINE, f));
  for (const file of files) for (const algorithm of ALGORITHMS) {
    const preset = Defs.validatePreset({ ...JSON.parse(fs.readFileSync(file, "utf8")), algorithm });
    const planned = plan(preset, viewName, LAYOUT);
    const label = `${path.basename(file)} ${algorithm}`;
    const kept = new Set(planned.writePlan.nodes.map(n => n.visual).filter(Boolean));
    eq(user.concat(diagramObjects).filter(id => !kept.has(id)), [], `${label}: every user visual and diagram object stays on the view`);
    eq(planned.writePlan.removedVisuals.filter(id => !managed.has(id)), [], `${label}: only managed occurrences are removed`);
    eq(planned.writePlan.removedSelfLoops.filter(id => !loops.has(id)), [], `${label}: only self-loops are removed with their own line`);
    const nestingTypes = new Set(preset.params.nestingConditions ? preset.params.nestingConditions.map(c => c.relation) : []);
    eq(planned.writePlan.removedLines.filter(id => !nestingTypes.has(lineOf.get(id).type)), [], `${label}: only lines of relations drawn as nesting are removed`);
  }
}

// ── 11: the writer keeps the appearance of what it repositions ──────────────────────────────────────────────────────
{
  const VISUAL_SET = ["bounds"], CONNECTION_SET = ["textPosition"], CONNECTION_CALLS = ["deleteAllBendpoints", "addRelativeBendpoint"];
  /**
   * A stand-in of the view as jArchi gives it to the writer: every visual and connection on it records what is set on it
   * and which method is called; add() makes new objects, which are not recorded.
   */
  function standIn(view) {
    /** @type {{ id: string, kind: string, set: string[], calls: string[] }[]} */
    const existing = [];
    let created = 0;
    const fresh = () => new Proxy({ id: `new-${++created}` }, { get: (t, k) => k in t ? t[k] : () => fresh(), set: () => true });
    const record = (id, kind) => {
      const r = { id, kind, set: [], calls: [] };
      existing.push(r);
      return new Proxy({ id }, {
        get: (t, k) => (k in t ? t[k] : typeof k === "symbol" ? undefined : (...args) => { r.calls.push(String(k)); return k === "add" ? fresh() : undefined; }),
        set: (t, k) => { r.set.push(String(k)); return true; },
      });
    };
    const objects = [];
    const walk = node => {
      for (const c of node.children) {
        if (c.tag === "sourceConnection") objects.push(record(c.attrs.id, "connection"));
        else if (c.tag === "child") { objects.push(record(c.attrs.id, "visual")); walk(c); }
      }
    };
    walk(view.node);
    const target = record(view.id, "view");
    global.$ = o => ({ find: sel => ({ each: f => (o === target && sel === undefined ? objects : []).forEach(f) }) });
    return { target, existing: existing.filter(r => r.kind !== "view") };
  }
  const runs = [["2 Edited", path.join(BASELINE, "baseline.json")], ["2 Edited", path.join(BASELINE, "AlgoTwopi.json")],
                ["8 GEMMA background", path.join(Expected.GEMMA_PRESET_DIR, "Bedrijfsfuncties.json")]];
  for (const [viewName, file] of runs) for (const algorithm of ALGORITHMS) {
    const preset = Defs.validatePreset({ ...JSON.parse(fs.readFileSync(file, "utf8")), algorithm });
    const planned = plan(preset, viewName, LAYOUT);
    const { target, existing } = standIn(H.findView(model, "Views/Test/" + viewName));
    const quiet = console.log; console.log = () => {};
    const { failed: steps } = Writer.applyWritePlan(/** @type {any} */ (target), planned.writePlan);
    console.log = quiet;
    const label = `${path.basename(file)} ${algorithm} ${viewName}`;
    const removed = new Set([...planned.writePlan.removedSelfLoops, ...planned.writePlan.removedVisuals, ...planned.writePlan.removedLines]);
    eq(steps, [], `${label}: every write step succeeds on the stand-in`);
    eq(existing.filter(r => r.kind === "visual").flatMap(r => r.set.filter(k => !VISUAL_SET.includes(k)).map(k => `${r.id}.${k}`)), [],
       `${label}: a visual it keeps gets only new bounds`);
    eq(existing.filter(r => r.kind === "connection").flatMap(r => r.set.filter(k => !CONNECTION_SET.includes(k)).map(k => `${r.id}.${k}`)), [],
       `${label}: a connection it keeps gets only a label position`);
    eq(existing.filter(r => r.kind === "connection").flatMap(r => r.calls.filter(c => !CONNECTION_CALLS.includes(c) && !(c === "delete" && removed.has(r.id))).map(c => `${r.id}.${c}()`)), [],
       `${label}: and only new bendpoints, or is removed as the plan says`);
    eq(existing.filter(r => r.kind === "visual").flatMap(r => r.calls.filter(c => c !== "add" && !(c === "delete" && removed.has(r.id))).map(c => `${r.id}.${c}()`)), [],
       `${label}: a visual is only added to (a child moved in) or removed as the plan says`);
    eq(existing.filter(r => r.kind === "visual" && r.set.includes("bounds")).length > 0, true, `${label}: the stand-in sees the writer reposition`);
  }
}

// ── 14: inactive options are ignored ────────────────────────────────────────────────────────────────────────────────
{
  const options = key => [...new Set(ALGORITHMS.flatMap(a => Defs.ALGORITHMS[a].supportedOptions[key] || []))];
  for (const algorithm of ALGORITHMS.filter(a => !(a in Expected.UNSTABLE_ALGORITHMS))) {
    const base = baseline(algorithm);
    const active = new Set(Defs.ALGORITHMS[algorithm].activeParams);
    /** @type {Record<string, unknown>} */
    const changed = {};
    for (const [key, value] of Object.entries(base.params)) {
      if (active.has(key) || key === "viewSizeMode" || key === "backgroundView") continue;
      if (typeof value === "number") changed[key] = value + 7;
      else if (typeof value === "boolean") changed[key] = !value;
      else if (typeof value === "string" && options(key).length) changed[key] = options(key).find(o => o !== value) || value;
    }
    const other = { ...base, params: { ...base.params, ...changed } };
    eq(Object.keys(changed).length > 0, true, `${algorithm}: there are inactive options to change`);
    eq(Defs.effectiveParams(other), Defs.effectiveParams(base), `${algorithm}: the effective params do not hold inactive options`);
    const json = p => { try { return JSON.stringify(H.writePlanJson(plan(p, "1 Nesting", NEW).writePlan)); } catch (e) { return `ERROR ${String(e.message || e)}`; } };
    eq(json(other) === json(base), true, `${algorithm}: changing every inactive option (${Object.keys(changed).join(", ")}) leaves the write plan as it was`);
  }
}

// ── 15: a preset holds only what affects generation ─────────────────────────────────────────────────────────────────
{
  const UI = /^(action|_.*|tab|activeTab|lastTab|window|windowSize|windowPosition|collapsed|collapsedSteps)$/i;
  eq(Object.keys(Defs.DEFAULT_PRESET).filter(k => UI.test(k)), [], "the default preset has no UI-only key");
  eq(Object.keys(Defs.DEFAULT_PRESET.params).filter(k => UI.test(k)), [], "the default params have no UI-only key");
  const raw = { algorithm: "Tiles", action: "new_view", _lastTabIndex: 2, _collapsed: [1] };
  eq(Defs.unknownPresetKeys(raw), ["action", "_lastTabIndex", "_collapsed"], "a UI-only key in a preset file is reported");
  eq(Object.keys(Defs.validatePreset(raw)).filter(k => UI.test(k)), [], "validation does not carry it into the preset");
}

if (failed) { _log(`rules_test: ${failed} failed`); process.exitCode = 1; }
else _log("rules_test: all passed");
