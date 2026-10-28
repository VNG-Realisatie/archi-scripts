#!/usr/bin/env node
/**
 * Generate the doc tables that mirror defs.js, so the docs cannot drift from the registry. Each table
 * sits between markers in its file under docs/reference/ (DOCS below):
 *   <!-- generated:<name> -->  …  <!-- /generated:<name> -->
 *
 * Run from the repo root:
 *   node Scripts/View/tools/gen_docs_tables.js           # check: exit 1 when a table is out of date
 *   node Scripts/View/tools/gen_docs_tables.js --write   # rewrite the tables in place
 */
const fs   = require("fs");
const path = require("path");

const VIEW = path.join(__dirname, "..");
global.Java    = { type: () => ({}) };
global.__DIR__ = path.join(VIEW, "lib") + "/";
const _log = console.log; console.log = () => {};
const Defs = require(path.join(VIEW, "lib", "defs.js"));
console.log = _log;

const { STYLES, ALGORITHMS, PARAM_LABELS, PARAM_TOOLTIPS, LAYOUT_GROUPS, HIDDEN_PARAMS, DEFAULT_PRESET } = Defs;
const ALGS = Object.keys(ALGORITHMS);
const cell = t => String(t).replace(/\|/g, "\\|").replace(/\n/g, " ");
const usedBy = k => cell(Defs.paramUsedBy(k).replace(/^Used by: /, ""));

// Default value of a param as the preset file holds it; a rule list shows its relation types.
const defaultOf = k => {
  const v = DEFAULT_PRESET.params[k];
  if (Array.isArray(v)) return v.length ? v.map(r => r.relation.replace(/-relationship$/, "")).join(", ") : "none";
  return typeof v === "boolean" ? (v ? "on" : "off") : cell(v);
};

const tables = {
  styles: () => [
    "| Style | Algorithms | Tooltip |",
    "|---|---|---|",
    ...Object.entries(STYLES).map(([n, s]) => `| ${n} | ${s.algorithms.join(", ")} | ${cell(s.tooltip)} |`),
  ],

  algorithms: () => [
    "| Algorithm | Engine | Nesting | Self-loops | Tooltip |",
    "|---|---|---|---|---|",
    ...ALGS.map(n => { const a = ALGORITHMS[n];
      return `| ${n} | ${a.engine} | ${a.supportsNesting} | ${a.supportsSelfLoops === true ? "✓" : a.supportsSelfLoops === "partial" ? "~" : "—"} | ${cell(a.tooltip)} |`; }),
  ],

  "layout-params": () => Object.entries(LAYOUT_GROUPS).flatMap(([group, params]) => [
    `**${group}**`, "",
    "| Field | Parameter | Default | Tooltip | Used by |",
    "|---|---|---|---|---|",
    ...params.map(k => { const [what, detail] = PARAM_TOOLTIPS[k] || ["", ""];
      return `| ${PARAM_LABELS[k]} | \`${k}\` | ${defaultOf(k)} | ${cell([what, detail].filter(Boolean).join(" — "))} | ${usedBy(k)} |`; }),
    "",
  ]).slice(0, -1),

  "preset-only": () => [
    "| Parameter | Default | Used by |",
    "|---|---|---|",
    ...HIDDEN_PARAMS.map(k => `| \`${k}\` (${PARAM_LABELS[k]}) | ${defaultOf(k)} | ${usedBy(k)} |`),
  ],

  "capability-matrix": () => {
    const rows = [...Object.values(LAYOUT_GROUPS).flat(), ...HIDDEN_PARAMS];
    const head = `| Parameter | ${ALGS.join(" | ")} |`;
    const line = `|---|${ALGS.map(() => "---").join("|")}|`;
    const body = rows.map(k => `| ${PARAM_LABELS[k]}${HIDDEN_PARAMS.includes(k) ? " (preset only)" : ""} \`${k}\` | ` +
      ALGS.map(n => ALGORITHMS[n].activeParams.includes(k) ? "✓" : "—").join(" | ") + " |");
    const loops = "| **Self-loops** (capability) | " + ALGS.map(n => {
      const v = ALGORITHMS[n].supportsSelfLoops; return v === true ? "✓" : v === "partial" ? "~" : "—"; }).join(" | ") + " |";
    return [head, line, ...body, loops];
  },
};

// The file each table is written to.
const DOCS = {
  "reference/gui.md":     ["styles", "algorithms", "layout-params", "preset-only"],
  "reference/engines.md": ["capability-matrix"],
};

const stale = [];
for (const [file, names] of Object.entries(DOCS)) {
  const docPath = path.join(VIEW, "docs", file);
  let doc = fs.readFileSync(docPath, "utf8");
  const before = doc;
  for (const name of names) {
    const open = `<!-- generated:${name} -->`, close = `<!-- /generated:${name} -->`;
    const i = doc.indexOf(open), j = doc.indexOf(close);
    if (i < 0 || j < 0) { console.log(`✗ markers for "${name}" not found in ${file}`); process.exitCode = 1; continue; }
    const fresh = `${open}\n${tables[name]().join("\n")}\n${close}`;
    if (doc.slice(i, j + close.length) !== fresh) { stale.push(`${file}: ${name}`); doc = doc.slice(0, i) + fresh + doc.slice(j + close.length); }
  }
  if (process.argv.includes("--write") && doc !== before) fs.writeFileSync(docPath, doc, "utf8");
}
if (process.argv.includes("--write")) {
  console.log(stale.length ? `✓ rewrote: ${stale.join(", ")}` : "✓ tables already up to date");
} else if (stale.length) {
  console.log(`✗ out of date: ${stale.join(", ")} — run with --write`); process.exitCode = 1;
} else if (!process.exitCode) console.log("✓ tables up to date");
