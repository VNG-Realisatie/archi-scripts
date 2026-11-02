#!/usr/bin/env node
/**
 * Checks the console of a run in Archi's command line (tools/archi_cli.sh writes it to <out dir>/<script>.console.txt):
 *   - count promise: per written view the pipeline's "Total to view" equals the writer's "Objects on view"
 *     (elements with their extra occurrences, connections, nestings, diagram objects, diagram connections);
 *   - no line marked "ERROR: " (the test script marks console.error, which the command line does not);
 *   - the ⚠ and "Warning:" lines equal test/expected/<script>-warnings.txt (expected.js: --check / --write);
 *   - prints Archi's time per view (the "Timing" lines), for the record only.
 *
 * Run: node Scripts/View/tools/console_checks.js <script.console.txt> [--check | --write]
 * Exit 1 on a count difference, an error line, or (with --check) other warnings.
 */
const fs = require("fs");
const path = require("path");
const Expected = require(path.join(__dirname, "expected.js"));

const FIELDS = ["elements", "connections", "nestings", "diagram objects", "diagram connections"];

const file = process.argv.slice(2).find(a => !a.startsWith("--"));
if (!file) { console.error("usage: node Scripts/View/tools/console_checks.js <script.console.txt> [--check | --write]"); process.exit(2); }
const lines = fs.readFileSync(file, "utf8").split("\n");
const scriptLine = lines.find(l => l.startsWith("Running script:"));
if (!scriptLine) { console.error(`${file}: no "Running script:" line, not a jArchi script's console`); process.exit(2); }
const script = scriptLine.replace(/^Running script:\s*/, "").replace(/\.ajs\s*$/, "");

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
 * Walks the console once: the current run (a "##### <name>" header), the last "Total to view" block,
 * each "Objects on view" line with the view written after it.
 * @param {string[]} lines
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
  for (const line of lines) {
    const t = line.trim();
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
    else if (t.startsWith("ERROR: ")) errors.push(`${run}: ${t.slice(7)}`);
    else if (t.includes("⚠") || t.startsWith("Warning:")) { if (!warnings.includes(`${run}: ${t}`)) warnings.push(`${run}: ${t}`); }
    else if (t.startsWith("Timing:")) { const m = t.match(/\(total (\d+) ms\)/); if (m) timings.push({ run, view: views.length ? views[views.length - 1].view : "", ms: Number(m[1]) }); }
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
