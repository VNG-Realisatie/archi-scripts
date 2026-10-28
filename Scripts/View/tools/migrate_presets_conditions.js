#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 4 (rule lists renamed to condition lists): rewrites every
 * preset under presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 3 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_conditions.js [--dry-run]
 *
 * Changes (each key keeps its position):
 *   params.nestingRules / reverseRules → params.nestingConditions / reverseConditions
 *   filter.elementRules / diagramRules / relationRules → filter.elementConditions / diagramConditions / relationConditions
 *   relatedElements.steps[].rules → steps[].conditions
 *   appearance.styleByProperty.rules → appearance.styleByProperty.conditions
 *   schemaVersion: 4
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 3;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// Rename a key of obj in place, keeping its position; counts the rename in notes.
function renameKey(obj, from, to, notes) {
  if (!obj || typeof obj !== "object" || !(from in obj)) return;
  const entries = Object.entries(obj).map(([k, v]) => [k === from ? to : k, v]);
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, Object.fromEntries(entries));
  notes.push(to);
}

function migrate(preset) {
  const notes = [];
  renameKey(preset.params, "nestingRules", "nestingConditions", notes);
  renameKey(preset.params, "reverseRules", "reverseConditions", notes);
  renameKey(preset.filter, "elementRules", "elementConditions", notes);
  renameKey(preset.filter, "diagramRules", "diagramConditions", notes);
  renameKey(preset.filter, "relationRules", "relationConditions", notes);
  const steps = preset.relatedElements && preset.relatedElements.steps;
  if (Array.isArray(steps)) steps.forEach(st => renameKey(st, "rules", "conditions", notes));
  renameKey(preset.appearance && preset.appearance.styleByProperty, "rules", "conditions", notes);
  preset.schemaVersion = Defs.DEFAULT_PRESET.schemaVersion;
  return { preset, notes };
}

let changed = 0, failed = 0;
for (const file of walk(PRESETS_DIR)) {
  const rel = path.relative(PRESETS_DIR, file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  if (raw.schemaVersion !== FROM) continue;
  const { preset, notes } = migrate(raw);
  // The migrated preset must load.
  try { Defs.validatePreset(JSON.parse(JSON.stringify(preset))); }
  catch (e) { failed++; console.log(`✗ ${rel}: ${e}`); continue; }
  changed++;
  console.log(`${DRY_RUN ? "would migrate" : "migrated"} ${rel}: ${notes.length} keys`);
  if (!DRY_RUN) fs.writeFileSync(file, ConditionLists.stringifyPreset(preset));
}
console.log(`\n${changed} presets ${DRY_RUN ? "to migrate" : "migrated"}${failed ? `, ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
