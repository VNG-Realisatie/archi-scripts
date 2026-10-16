#!/usr/bin/env node
/**
 * Consistency check: defs.js registry ↔ DEFAULT_PRESET ↔ dialog widgets (PARAM_WIDGETS).
 * Run from the repo root: node Scripts/View/tools/check_registry.js
 * Exit code 1 when a problem is found.
 */
const fs   = require("fs");
const path = require("path");

const VIEW = path.join(__dirname, "..");
global.Java    = { type: () => ({}) };
global.__DIR__ = path.join(VIEW, "lib") + "/";
const _log = console.log; console.log = () => {};  // silence "Loading …" lines
const Defs = require(path.join(VIEW, "lib", "defs.js"));
console.log = _log;

const { ALGORITHMS, DEFAULT_PRESET, validatePreset, effectiveParams } = Defs;
const problems = [];

// Params the dialog handles with its own code instead of PARAM_WIDGETS.
const OWN_HANDLING = ["nestingContainerTypes", "maxWidth", "aspectRatio", "viewSizeMode"];
const HIDDEN = Defs.HIDDEN_PARAMS || [];

// Widget table, read from the dialog source (the dialog itself needs SWT and cannot load in Node).
const src   = fs.readFileSync(path.join(VIEW, "lib", "gui", "dialog_main.js"), "utf8");
const table = src.slice(src.indexOf("const PARAM_WIDGETS"), src.indexOf("});", src.indexOf("const PARAM_WIDGETS")));
const widgetParams = [...table.matchAll(/^\s+(\w+):\s+\{ w: "(\w+)"/gm)].map(m => ({ param: m[1], widget: m[2] }));
for (const { param, widget } of widgetParams)
  if (!new RegExp(`w\\.${widget}\\b|"${widget}"`).test(src.replace(table, ""))) problems.push(`PARAM_WIDGETS.${param}: widget ${widget} is never built`);
const inGui = new Set([...widgetParams.map(x => x.param), ...OWN_HANDLING]);

for (const [name, a] of Object.entries(ALGORITHMS)) {
  if (new Set(a.activeParams).size !== a.activeParams.length) problems.push(`${name}: duplicate activeParams`);
  for (const k of a.activeParams) {
    if (!(k in DEFAULT_PRESET.params)) problems.push(`${name}: active param ${k} missing from DEFAULT_PRESET`);
    if (!inGui.has(k) && !HIDDEN.includes(k)) problems.push(`${name}: active param ${k} has no widget and is not in HIDDEN_PARAMS`);
  }
  for (const k of Object.keys(a.supportedOptions))
    if (!a.activeParams.includes(k)) problems.push(`${name}: supportedOptions.${k} is not an active param`);
  const v = validatePreset({ algorithm: name });
  for (const [k, opts] of Object.entries(a.supportedOptions))
    if (!opts.includes(v.params[k])) problems.push(`${name}: default ${k}="${v.params[k]}" is not a supported option`);
  effectiveParams(v);
}

const active = new Set(Object.values(ALGORITHMS).flatMap(a => a.activeParams));
for (const k of Object.keys(DEFAULT_PRESET.params))
  if (!active.has(k) && k !== "viewSizeMode") problems.push(`DEFAULT_PRESET.params.${k} is active in no algorithm`);
for (const k of inGui)
  if (!active.has(k) && k !== "viewSizeMode") problems.push(`GUI param ${k} is active in no algorithm`);
for (const k of HIDDEN)
  if (inGui.has(k)) problems.push(`HIDDEN_PARAMS.${k} still has a widget`);

// Labels and Layout groups (dialog hints, tooltips, docs matrix)
const grouped = Object.values(Defs.LAYOUT_GROUPS || {}).flat();
for (const k of inGui) {
  if (k === "viewSizeMode") continue;
  if (!(Defs.PARAM_LABELS || {})[k]) problems.push(`GUI param ${k} has no PARAM_LABELS entry`);
  if (!grouped.includes(k)) problems.push(`GUI param ${k} is in no LAYOUT_GROUPS group`);
}
for (const k of grouped) if (!inGui.has(k)) problems.push(`LAYOUT_GROUPS lists ${k}, which has no widget`);

if (problems.length) { problems.forEach(p => console.log("✗ " + p)); process.exit(1); }
console.log(`✓ registry consistent — ${Object.keys(ALGORITHMS).length} algorithms, ${active.size} params, ${widgetParams.length} widgets`);
