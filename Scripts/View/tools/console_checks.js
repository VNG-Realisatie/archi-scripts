#!/usr/bin/env node
/**
 * Checks the log file of a run in Archi's command line (tools/archi_cli.sh copies it to <out dir>/<script>.log):
 *   - count promise: per written view the pipeline's "Total to view" equals the writer's "Objects on view"
 *     (elements with their extra occurrences, connections, nestings, diagram objects, diagram connections);
 *   - no ERROR line;
 *   - the WARN lines equal test/expected/<script>-warnings.txt (expected.js: --check / --write);
 *   - prints Archi's time per view (the "Timing" lines), for the record only.
 * Each log line is "<LEVEL> [<context>] <text>" (Scripts/_lib/log.js); the header and footer have no level.
 *
 * Run: node Scripts/View/tools/console_checks.js <script.log> [--check | --write]
 * Exit 1 on a count difference, an error line, or (with --check) other warnings.
 */
const fs = require("fs");
const path = require("path");
const Expected = require(path.join(__dirname, "expected.js"));

const FIELDS = ["elements", "connections", "nestings", "diagram objects", "diagram connections"];

const file = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!file) { console.error("usage: node Scripts/View/tools/console_checks.js <script.log> [--check | --write]"); process.exit(2); }
const LINE = /^(DEBUG|INFO|WARN|ERROR) +\[[^\]]*\] ?(.*)$/;
const lines = fs.readFileSync(file, "utf8").split("\n").map(l => { const m = l.match(LINE); return m ? { level: m[1], text: m[2] } : { level: "", text: l }; });
const scriptLine = lines.find(l => l.level === "INFO" && l.text.startsWith("Script:"));
if (!scriptLine) { console.error(`${file}: no "Script:" line, not the log file of a jArchi script`); process.exit(2); }
const script = scriptLine.text.replace(/^Script:\s*/, "").replace(/\.ajs\s*$/, "");

const { views, errors, warnings, timings } = parse(lines);
const mismatches = views.filter(v => FIELDS.some(f => v.predicted[f] !== v.written[f]));
const unpredicted = views.filter(v => !v.predicted.found);

console.log(`Count promise: ${views.length} views, ${mismatches.length + unpredicted.length ? "differences" : "all equal"}`);
for (const v of unpredicted) console.log(`  ${v.run} / ${v.view}: no "Total to view" before it`);
for (const v of mismatches) {
  const diff = FIELDS.filter(f => v.predicted[f] !== v.written[f]).map(f => `${f} ${v.predicted[f]} predicted, ${v.written[f]} written`);
  console.log(`  ${v.run} / ${v.view}: ${diff.join(" · ")}`);
}
console.log(`Errors: ${errors.length || "none"}`);
errors.forEach(e => console.log("  " + e));
console.log("Archi time per view (ms):");
timings.forEach(t => console.log(`  ${t.ms.toString().padStart(6)}  ${t.run} / ${t.view}`));
Expected.report(warnings, `${script}-warnings.txt`, s => console.log(s));
if (mismatches.length || unpredicted.length || errors.length) process.exitCode = 1;

/**
 * Walks the log once: the current run (a "##### <name>" header), the last "Total to view" block,
 * each "Objects on view" line with the view written after it.
 * @param {{ level: string, text: string }[]} lines
 */
function parse(lines) {
  /** @type {{run: string, view: string, predicted: Record<string, number> & {found?: boolean}, written: Record<string, number>}[]} */
  const views = [];
  /** @type {string[]} */
  const errors = [], warnings = [];
  /** @type {{run: string, view: string, ms: number}[]} */
  const timings = [];
  let run = "", predicted = /** @type {Record<string, number> & {found?: boolean}} */ ({});
  /** @type {Record<string, number> | null} */
  let written = null;
  for (const { level, text } of lines) {
    const t = text.trim();
    const advice = /^(Effect|Action):/.test(t);
    if (t.startsWith("##### ")) run = t.slice(6);
    else if (t === "Total to view:") predicted = { found: true };
    else if (t.startsWith("elements:") && predicted.found) predicted.elements = _sum(t);
    else if (t.startsWith("relations:") && predicted.found) Object.assign(predicted, _fields(t, ["nestings", "connections"]));
    else if (t.startsWith("diagram:") && predicted.found) Object.assign(predicted, _fields(t, ["diagram objects", "diagram connections"]));
    else if (t.startsWith("Objects on view:")) written = _fields(t, FIELDS);
    else if (written && /^View ".*" written$/.test(t)) {
      views.push({ run, view: t.slice(6, -9), predicted, written });
      predicted = {}; written = null;
    }
    else if (level === "ERROR" && !advice) errors.push(`${run}: ${t}`);
    else if (level === "WARN" && !advice) { if (!warnings.includes(`${run}: ${t}`)) warnings.push(`${run}: ${t}`); }
    else if (t.startsWith("Timing:")) { const m = t.match(/\(total ([\d.]+) (ms|s)\)/); if (m) timings.push({ run, view: views.length ? views[views.length - 1].view : "", ms: Math.round(Number(m[1]) * (m[2] === "s" ? 1000 : 1)) }); }
  }
  return { views, errors, warnings, timings };
}

/**
 * The numbers before each field name, singular or plural ("1 diagram connection", "8 connections").
 * @param {string} line
 * @param {string[]} names
 */
function _fields(line, names) {
  /** @type {Record<string, number>} */
  const out = {};
  for (const name of names) {
    const m = line.match(new RegExp(`(\\d+) ${name.replace(/s$/, "")}s?\\b`));
    out[name] = m ? Number(m[1]) : NaN;
  }
  return out;
}

/** The sum of the numbers on a line ("5 containers · 4 nested elements · 3 standalones · 1 extra occurrence"). @param {string} line */
function _sum(line) {
  return (line.match(/\d+/g) || []).reduce((a, n) => a + Number(n), 0);
}
