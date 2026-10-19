#!/usr/bin/env node
/**
 * Node.js migration to rule lists (schemaVersion 2, lib/rel_filter.js): rewrites every preset
 * under presets/ (recursively, _session.json included) in place.
 * Idempotent — a preset already at schemaVersion 2 is left untouched.
 *
 * Run: node Scripts/View/tools/migrate_presets_relrows.js [--dry-run]
 *
 * Changes:
 *   params.nestingRelationTypes + nestingContainerTypes → params.nestingRules
 *       one rule per relation type × container type; the container type is the parent:
 *       the source, or the target when the relation type is also reversed
 *   params.reverseRelationTypes → params.reverseRules (one rule per relation type)
 *   filter.elementTypes / relationTypes / diagramTypes → filter.elementRules / relationRules / diagramRules
 *   relatedElements.steps[].relationTypes × elementTypes (+ propFilter) → steps[].rules
 *       "type:out" → direction outgoing, "type:in" → incoming, "type" → either;
 *       the property filter is copied to every rule of the step (only when key and value are set)
 *   appearance.styleByProperty.element / .relation, styleByRelatedProperty, styleByConnectedElement
 *       → appearance.styleByProperty.rules (+ mixedValuesColor, lineWidth); only an enabled feature
 *       with a property gives rules (a disabled one had no effect beyond the old reset-on-modify)
 *   schemaVersion: 2 added as the first key
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs      = require("../lib/defs");
const RuleLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

/** "type:in" → { type, direction } */
function decode(enc) {
  const i = String(enc).indexOf(":");
  if (i < 0) return { type: enc, direction: "either", inSel: true, outSel: true };
  const type = enc.substring(0, i), dir = enc.substring(i + 1);
  return { type, direction: dir === "out" ? "outgoing" : "incoming", inSel: dir === "in", outSel: dir === "out" };
}

const arr = v => Array.isArray(v) ? v : [];
const orAll = list => list.length ? list : [""];
const set = (o, k, v) => { if (v !== "" && v !== undefined) o[k] = v; };

function migrateParams(p, notes) {
  const nesting = arr(p.nestingRelationTypes), reverse = arr(p.reverseRelationTypes), containers = arr(p.nestingContainerTypes);
  if (!("nestingRelationTypes" in p) && !("reverseRelationTypes" in p) && !("nestingContainerTypes" in p)) return;
  const reversed = new Set(reverse);
  p.nestingRules = [];
  for (const t of nesting) {
    for (const c of orAll(containers)) {
      const r = { relation: t };
      if (c) r[reversed.has(t) ? "target" : "source"] = c;
      p.nestingRules.push(r);
    }
  }
  p.reverseRules = reverse.map(t => ({ relation: t }));
  delete p.nestingRelationTypes; delete p.reverseRelationTypes; delete p.nestingContainerTypes;
  notes.push(`nesting ${p.nestingRules.length} rules, reverse ${p.reverseRules.length} rules`);
}

function migrateFilter(f, notes) {
  if (!f) return;
  if ("elementTypes" in f)  { f.elementRules  = arr(f.elementTypes).map(t => ({ elementType: t })); delete f.elementTypes; }
  if ("relationTypes" in f) { f.relationRules = arr(f.relationTypes).map(t => ({ relation: decode(t).type })); delete f.relationTypes; }
  if ("diagramTypes" in f)  { f.diagramRules  = arr(f.diagramTypes).map(t => ({ diagramType: t })); delete f.diagramTypes; }
  notes.push(`filter ${arr(f.elementRules).length}/${arr(f.relationRules).length}/${arr(f.diagramRules).length} element/relation/diagram rules`);
}

function migrateSteps(re, notes) {
  const steps = re && arr(re.steps);
  if (!steps) return;
  steps.forEach((st, i) => {
    if (!("relationTypes" in st) && !("elementTypes" in st) && !("propFilter" in st)) return;
    const rels = arr(st.relationTypes).map(decode);
    const els  = orAll(arr(st.elementTypes));
    const pf   = st.propFilter && st.propFilter.key && st.propFilter.value ? st.propFilter : null;
    const rules = [];
    for (const r of rels.length ? rels : [{ type: "", direction: "either" }]) {
      for (const e of els) {
        const rule = {};
        if (r.direction !== "either") rule.direction = r.direction;
        set(rule, "relation", r.type);
        set(rule, "added", e);
        if (pf) { rule.property = String(pf.key); rule.value = String(pf.value); }
        rules.push(rule);
      }
    }
    // A step that followed everything is the pass-all list.
    const passAll = rules.length === 1 && Object.keys(rules[0]).length === 0;
    steps[i] = { repeat: st.repeat === undefined ? 1 : st.repeat, rules: passAll ? [] : rules };
    notes.push(`step ${i + 1}: ${passAll ? 0 : rules.length} rules`);
  });
}

function migrateAppearance(a, notes) {
  if (!a) return;
  const sbp = a.styleByProperty || {};
  const legacy = "element" in sbp || "relation" in sbp || "styleByRelatedProperty" in a || "styleByConnectedElement" in a;
  if (!legacy) return;
  const rules = [];
  let lineWidth = 0, mixedValuesColor = "#FF6B35";
  const use = f => f && f.enabled === true && f.property;

  const e = sbp.element;
  if (use(e)) rules.push(Object.assign({ color: "element" }, e.elementType ? { source: e.elementType } : {},
    { property: e.property, colorRange: e.colorRange || "Blues" }));

  const r = sbp.relation;
  if (r) lineWidth = typeof r.lineWidth === "number" ? r.lineWidth : 0;
  if (use(r)) {
    for (const t of orAll(arr(r.relTypes).map(x => decode(x).type))) {
      rules.push(Object.assign({ color: "relation" }, t ? { relation: t } : {},
        { propertyOf: "relation", property: r.property, colorRange: r.colorRange || "Reds" }));
    }
  }

  // Related property: the element is the source of the relation (outgoing) or its target (incoming).
  const rp = a.styleByRelatedProperty;
  if (use(rp)) {
    for (const d of arr(rp.relTypes).map(decode)) {
      for (const color of [d.outSel && "source", d.inSel && "target"].filter(Boolean)) {
        rules.push({ color, relation: d.type, propertyOf: "relation", property: rp.property, colorRange: rp.colorRange || "OrRd" });
      }
    }
  }

  // Connected element: the element at the other end supplies the property and has elementType.
  const ce = a.styleByConnectedElement;
  if (use(ce)) {
    if (ce.conflictColor) mixedValuesColor = ce.conflictColor;
    const dirs = arr(ce.relTypes).length ? arr(ce.relTypes).map(decode) : [{ type: "", inSel: true, outSel: true }];
    for (const d of dirs) {
      if (d.outSel) rules.push(Object.assign({ color: "source" }, d.type ? { relation: d.type } : {},
        ce.elementType ? { target: ce.elementType } : {}, { propertyOf: "target", property: ce.property, colorRange: ce.colorRange || "Purples" }));
      if (d.inSel) rules.push(Object.assign({ color: "target" }, d.type ? { relation: d.type } : {},
        ce.elementType ? { source: ce.elementType } : {}, { propertyOf: "source", property: ce.property, colorRange: ce.colorRange || "Purples" }));
    }
  }

  // Rebuild appearance with styleByProperty in the old position of the style block.
  const rebuilt = {};
  for (const k of Object.keys(a)) {
    if (k === "styleByRelatedProperty" || k === "styleByConnectedElement") continue;
    rebuilt[k] = k === "styleByProperty" ? { rules, mixedValuesColor, lineWidth } : a[k];
  }
  if (!("styleByProperty" in rebuilt)) rebuilt.styleByProperty = { rules, mixedValuesColor, lineWidth };
  for (const k of Object.keys(a)) delete a[k];
  Object.assign(a, rebuilt);
  notes.push(`appearance ${rules.length} style rules`);
}

function migrate(preset) {
  const notes = [];
  if (preset.schemaVersion === Defs.DEFAULT_PRESET.schemaVersion) return { preset, notes };
  if (preset.params) migrateParams(preset.params, notes);
  migrateFilter(preset.filter, notes);
  migrateSteps(preset.relatedElements, notes);
  migrateAppearance(preset.appearance, notes);
  return { preset: Object.assign({ schemaVersion: Defs.DEFAULT_PRESET.schemaVersion }, preset), notes };
}

let changed = 0, failed = 0;
for (const file of walk(PRESETS_DIR)) {
  const rel = path.relative(PRESETS_DIR, file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const { preset, notes } = migrate(raw);
  if (notes.length === 0 && raw.schemaVersion === Defs.DEFAULT_PRESET.schemaVersion) continue;
  // The migrated preset must load: validatePreset rejects any unusable rule or leftover old key.
  try { Defs.validatePreset(JSON.parse(JSON.stringify(preset))); }
  catch (e) { failed++; console.log(`✗ ${rel}: ${e}`); continue; }
  changed++;
  console.log(`${DRY_RUN ? "would migrate" : "migrated"} ${rel}: ${notes.join(" · ") || "schemaVersion only"}`);
  if (!DRY_RUN) fs.writeFileSync(file, RuleLists.stringifyPreset(preset));
}
console.log(`\n${changed} presets ${DRY_RUN ? "to migrate" : "migrated"}${failed ? `, ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
