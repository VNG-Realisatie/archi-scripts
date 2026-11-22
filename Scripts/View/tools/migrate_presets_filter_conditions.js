#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 8 (one filter list for elements and relations): rewrites every preset under
 * presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 7 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_filter_conditions.js [--dry-run]
 *
 * Changes:
 *   filter.elementConditions  → filter.conditions, each condition with elementType renamed to source (applyTo "element")
 *   filter.relationConditions → appended to filter.conditions, each condition with applyTo "relation"
 *   schemaVersion: 8
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 7;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// The element conditions' key is replaced where it stood, so a preset's diff shows only this change.
function migrate(preset) {
  const f = preset.filter;
  if (f) {
    const elements  = (f.elementConditions || []).map(({ elementType, ...rest }) => elementType === undefined ? rest : { ...rest, source: elementType });
    const relations = (f.relationConditions || []).map(r => ({ ...r, applyTo: "relation" }));
    preset.filter = Object.fromEntries(Object.entries(f).flatMap(([k, v]) =>
      k === "elementConditions" ? [["conditions", [...elements, ...relations]]]
      : k === "relationConditions" ? []
      : [[k, v]]));
    if (!("conditions" in preset.filter) && relations.length) preset.filter.conditions = relations;
  }
  preset.schemaVersion = Defs.DEFAULT_PRESET.schemaVersion;
  return preset;
}

let changed = 0, failed = 0;
for (const file of walk(PRESETS_DIR)) {
  const rel = path.relative(PRESETS_DIR, file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (raw.schemaVersion !== FROM) continue;
  const preset = migrate(raw);
  // The migrated preset must load.
  try { Defs.validatePreset(JSON.parse(JSON.stringify(preset))); }
  catch (e) { failed++; console.log(`✗ ${rel}: ${e}`); continue; }
  changed++;
  console.log(`${DRY_RUN ? "would migrate" : "migrated"} ${rel}`);
  if (!DRY_RUN) fs.writeFileSync(file, ConditionLists.stringifyPreset(preset));
}
console.log(`\n${changed} presets ${DRY_RUN ? "to migrate" : "migrated"}${failed ? `, ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
