#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 11 (Color and font by nesting level without its Color and Font switches;
 * fontSize and fontStyle value "default"): rewrites every preset under presets/ (recursively, _session.json
 * included) in place. Idempotent — only a preset at schemaVersion 10 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_nesting_enabled.js [--dry-run]
 *
 * Changes (appearance.nestingLevel):
 *   colorEnabled, fontEnabled  → removed
 *   both off                   → conditions: [] (they styled nothing; with no switches they would style now)
 *   colorEnabled off only      → every condition color "" (Type default) with darkenStart 0, so only the lighter levels differ
 *   fontEnabled off only       → every condition fontSize "default", fontStyle "default"
 *   fontEnabled on             → a missing fontSize / fontStyle gets its schema 10 default (0 = continues from the parent, "normal")
 *   schemaVersion: 11
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 10;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

function migrate(preset) {
  const nl = preset.appearance && preset.appearance.nestingLevel;
  if (nl) {
    const color = nl.colorEnabled === true, font = nl.fontEnabled === true;
    delete nl.colorEnabled;
    delete nl.fontEnabled;
    if (!color && !font) nl.conditions = [];
    else if (Array.isArray(nl.conditions)) nl.conditions = nl.conditions.map(c => {
      const out = { ...c };
      if (!color) Object.assign(out, { color: "", darkenStart: 0 });
      if (!font)  Object.assign(out, { fontSize: ConditionLists.FONT_DEFAULT, fontStyle: ConditionLists.FONT_DEFAULT });
      else Object.assign(out, { fontSize: c.fontSize === undefined ? 0 : c.fontSize, fontStyle: c.fontStyle === undefined ? "normal" : c.fontStyle });   // the schema 10 defaults, no longer the defaults
      return out;
    });
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
