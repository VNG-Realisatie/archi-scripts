#!/usr/bin/env node
/**
 * Node.js migration to schemaVersion 9 (view.folder is the whole path under Views): rewrites every preset under
 * presets/ (recursively, _session.json included) in place.
 * Idempotent — only a preset at schemaVersion 8 is rewritten.
 *
 * Run: node Scripts/View/tools/migrate_presets_view_folder.js [--dry-run]
 *
 * Changes:
 *   view.underGenerated + view.folder → view.folder: "/_Generated" in front of the folder when underGenerated
 *                                       was on (a preset without the key had it on); "/" = Views itself
 *   schemaVersion: 9
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
global.Java    = { type: () => ({}) };
const Defs           = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");

const PRESETS_DIR = path.join(__dirname, "..", "presets");
const DRY_RUN     = process.argv.includes("--dry-run");
const FROM        = 8;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return e.name.endsWith(".json") ? [p] : [];
  });
}

// The folder takes the place of underGenerated, so a preset's diff shows only this change.
function migrate(preset) {
  const v = preset.view;
  if (v) {
    const under = v.underGenerated !== false;
    const path  = `/${under ? Defs.GENERATED_VIEW_FOLDER : ""}/${v.folder || ""}/`.replace(/\/+/g, "/");
    const folder = path === "/" ? path : path.slice(0, -1);
    preset.view = Object.fromEntries(Object.entries(v).flatMap(([k, val]) =>
      k === "underGenerated" ? [] : k === "folder" ? [[k, folder]] : [[k, val]]));
    if (!("folder" in preset.view)) preset.view.folder = folder;
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
