#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 5 (nesting style conditions, colour list): rewrites every
 * preset under presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 4 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_nesting_style.js [--dry-run]
 *
 * Changes:
 *   appearance.palette: ""                                     (first key of appearance)
 *   appearance.nestingLevel.conditions: [{ child: "same" }]    (first key; today's same-type chain)
 *   appearance.nestingLevel.darkenStart: 0                     (keeps today's colours)
 *   appearance.nestingLevel.rootColor removed                  (jArchi always reads a fill, so it was never used)
 *   schemaVersion: 5
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 4;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// Each existing key keeps its position.
function migrate(preset) {
  const app = preset.appearance || {};
  const nl  = Object.assign({ conditions: [{ child: ConditionLists.SAME_TYPE }] }, app.nestingLevel || {}, { darkenStart: 0 });
  delete nl.rootColor;
  const entries = Object.entries(app).map(([k, v]) => [k, k === "nestingLevel" ? nl : v]);
  if (!("nestingLevel" in app)) entries.push(["nestingLevel", nl]);
  preset.appearance = Object.fromEntries([["palette", ""], ...entries]);
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
