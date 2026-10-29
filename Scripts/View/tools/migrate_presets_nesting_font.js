#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 6 (font size and bold per nesting style condition): rewrites
 * every preset under presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 5 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_nesting_font.js [--dry-run]
 *
 * Changes:
 *   appearance.nestingLevel.rootFontSize → fontSize of the first nesting style condition
 *   appearance.nestingLevel.rootFontBold → bold of the first nesting style condition (when true)
 *   schemaVersion: 6
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 5;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// The old root font was the font of every root container: the first condition carries it.
function migrate(preset) {
  const nl = (preset.appearance || {}).nestingLevel;
  if (nl) {
    const first = (nl.conditions || [])[0];
    if (first && typeof nl.rootFontSize === "number") first.fontSize = nl.rootFontSize;
    if (first && nl.rootFontBold === true) first.bold = true;
    delete nl.rootFontSize;
    delete nl.rootFontBold;
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
