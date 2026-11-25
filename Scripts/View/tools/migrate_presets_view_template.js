#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 12 (background view → view template): rewrites every preset under
 * presets/ (recursively, _session.json included) in place. Idempotent — only a preset at schemaVersion 11
 * is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_view_template.js [--dry-run]
 *
 * Changes:
 *   params.backgroundView                  → params.viewTemplate (same { id, path, on })
 *   params.backgroundLeavesInPlace         → params.templateLeavesInPlace
 *   appearance.nestingLevel.conditions[]   color, fontSize, fontStyle "background" → "template"
 *   schemaVersion: 12
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 11;
const OLD_VALUE   = "background";

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

/** Rename a key in place, keeping the key order. */
function renameKey(obj, from, to) {
  if (!obj || !(from in obj)) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[k === from ? to : k] = v;
  return out;
}

function migrate(preset) {
  if (preset.params) {
    preset.params = renameKey(renameKey(preset.params, "backgroundView", "viewTemplate"), "backgroundLeavesInPlace", "templateLeavesInPlace");
  }
  const nl = preset.appearance && preset.appearance.nestingLevel;
  if (nl && Array.isArray(nl.conditions)) nl.conditions = nl.conditions.map(c => {
    const out = { ...c };
    for (const k of ["color", "fontSize", "fontStyle"]) if (out[k] === OLD_VALUE) out[k] = ConditionLists.TEMPLATE;
    return out;
  });
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
