#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 3 (everyContainer per nesting rule): rewrites every preset
 * under presets/ (recursively, _session.json included) in place.
 * Idempotent — a preset already at schemaVersion 3 is left untouched.
 *
 * Run: node Scripts/View/tools/migrate_presets_everycontainer.js [--dry-run]
 *
 * Changes:
 *   params.showInEveryContainer removed; when it was true, every nesting rule gets everyContainer: true
 *   schemaVersion: 3
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs      = require("../lib/defs");
const RuleLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 2;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

function migrate(preset) {
  const notes = [];
  if (preset.schemaVersion !== FROM) return { preset, notes };
  const p = preset.params;
  if (p && "showInEveryContainer" in p) {
    if (p.showInEveryContainer === true && Array.isArray(p.nestingRules)) {
      p.nestingRules.forEach(r => { r.everyContainer = true; });
      notes.push(`everyContainer on ${p.nestingRules.length} nesting rules`);
    }
    delete p.showInEveryContainer;
  }
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
  console.log(`${DRY_RUN ? "would migrate" : "migrated"} ${rel}: ${notes.join(" · ") || "schemaVersion only"}`);
  if (!DRY_RUN) fs.writeFileSync(file, RuleLists.stringifyPreset(preset));
}
console.log(`\n${changed} presets ${DRY_RUN ? "to migrate" : "migrated"}${failed ? `, ${failed} FAILED` : ""}.`);
process.exit(failed ? 1 : 0);
