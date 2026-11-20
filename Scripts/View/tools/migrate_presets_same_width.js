#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 7 (Same width as a choice, Leaves in place): rewrites every preset under
 * presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 6 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_same_width.js [--dry-run]
 *
 * Changes:
 *   params.alignWidthSameType true / false → params.sameWidth "Per level" / "Off", in its place
 *   params.backgroundEveryBox → params.backgroundLeavesInPlace, same value, in its place
 *   schemaVersion: 7
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 6;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// A key is replaced where it stood, so a preset's diff shows only this change.
function migrate(preset) {
  if (preset.params) {
    preset.params = Object.fromEntries(Object.entries(preset.params).map(([k, v]) =>
      k === "alignWidthSameType" ? ["sameWidth", v === true ? Defs.SAME_WIDTH.LEVEL : Defs.SAME_WIDTH.OFF]
      : k === "backgroundEveryBox" ? ["backgroundLeavesInPlace", v]
      : [k, v]));
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
