#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 10 (per nesting style condition its numbers, font style and property match;
 * Background; backgroundView.on): rewrites every preset under presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 9 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_nesting_style.js [--dry-run]
 *
 * Changes:
 *   appearance.nestingLevel.darkenStart, lightenPerLevel, fontDecreasePerLevel → into every condition (schema 9
 *                                       defaults 1, 15, 2 where the preset has none), removed from nestingLevel
 *   condition bold                    → fontStyle: "bold" when true, else "normal"
 *   params.backgroundKeepAppearance   → removed; true: every condition color "background" and fontStyle "background"
 *                                       (its font size stays), so the views keep the look of the background view
 *   params.backgroundView             → on: true
 *   schemaVersion: 10
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 9;
// The schema 9 defaults of the global numbers of Style by nesting level.
const NUMBERS_9   = Object.freeze({ darkenStart: 1, lightenPerLevel: 15, fontDecreasePerLevel: 2 });

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

/** One condition in schema 10: the global numbers, fontStyle for bold, Background for Keep appearance. */
function migrateCondition(c, numbers, keepAppearance) {
  const out = Object.fromEntries(Object.entries(c).filter(([k]) => k !== "bold"));
  Object.assign(out, numbers);
  out.fontStyle = c.bold === true ? "bold" : "normal";
  if (keepAppearance) Object.assign(out, { color: ConditionLists.BACKGROUND, fontStyle: ConditionLists.BACKGROUND });
  return out;
}

function migrate(preset) {
  const params = preset.params || {};
  const keepAppearance = params.backgroundKeepAppearance === true;
  if (params.backgroundView) params.backgroundView = { ...params.backgroundView, on: true };
  delete params.backgroundKeepAppearance;
  const nl = preset.appearance && preset.appearance.nestingLevel;
  if (nl) {
    const numbers = Object.fromEntries(Object.entries(NUMBERS_9).map(([k, d]) => [k, typeof nl[k] === "number" ? nl[k] : d]));
    for (const k of Object.keys(NUMBERS_9)) delete nl[k];
    if (Array.isArray(nl.conditions)) nl.conditions = nl.conditions.map(c => migrateCondition(c, numbers, keepAppearance));
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
