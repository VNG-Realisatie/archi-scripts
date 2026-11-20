/**
 * Expected files of the Node checks (Scripts/View/test/expected/): one line per run, compared exactly.
 *
 * A tool prints its lines, or with --check compares them with the expected file (exit 1 on a difference,
 * each differing line shown), or with --write rewrites the file (a meant change, committed with it).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const EXPECTED_DIR = path.join(__dirname, "..", "test", "expected");

/**
 * The GEMMA runs (--gemma of write_plans.js and layout_checks.js): copies of GEMMA presets (presets/Test/gemma/) on
 * the GEMMA views of the test model (Views/Test/6–8 GEMMA), each with every algorithm: the option combinations,
 * steps, filters, background view and deep nesting GEMMA uses.
 */
const GEMMA_PRESET_DIR = path.join(__dirname, "..", "presets", "Test", "gemma");
const GEMMA_RUNS = Object.freeze([
  { preset: "Bedrijfsfuncties background", view: "6 GEMMA", action: "new_view" },
  { preset: "Bedrijfsfuncties", view: "6 GEMMA", action: "new_view" },
  { preset: "Applicatieservices", view: "6 GEMMA", action: "new_view" },
  { preset: "Bedrijfsobjecten", view: "7 GEMMA functions", action: "new_view" },
  { preset: "Bedrijfsobjecten per beleidsdomein", view: "6 GEMMA", action: "new_view" },   // Use label width, Highlight repeated
  { preset: "Bedrijfsfuncties", view: "8 GEMMA background", action: "layout_only" },
]);

/**
 * The One view each runs (--each of write_plans.js and layout_checks.js, as the Archi baseline runs it on view 3): a preset
 * with every algorithm, one New view per seed element. dir: "baseline" (presets/Test/baseline) or "gemma".
 */
const EACH_RUNS = Object.freeze([
  { dir: "baseline", preset: "baseline", seeds: ["Assess", "Operating system"] },
  { dir: "gemma", preset: "Bedrijfsobjecten", seeds: ["Dienstverlening", "Handhaving"] },
]);

/** @param {string} dir  EACH_RUNS dir */
const presetDirOf = dir => dir === "gemma" ? GEMMA_PRESET_DIR : path.join(__dirname, "..", "presets", "Test", "baseline");

/** Algorithms whose result differs from run to run: their lines keep the counts, the fingerprint is "-". */
const UNSTABLE_ALGORITHMS = { FDP: "ARCHITECTURE Known gap 16" };

/**
 * A 12-character hash of a whole result: equal fingerprints, equal results.
 * @param {string} algorithm
 * @param {string} json
 */
function fingerprint(algorithm, json) {
  if (algorithm in UNSTABLE_ALGORITHMS) return "-".padEnd(12);
  return crypto.createHash("sha1").update(json).digest("hex").slice(0, 12);
}

/**
 * --without-graphviz (CI's fingerprints, a machine without Graphviz): runs of Graphviz algorithms are skipped, and their
 * lines left out of the comparison: Graphviz results depend on its version and build (expected files: dot 14.1.4).
 * @param {string} algorithm
 */
function skipped(algorithm) {
  if (!process.argv.includes("--without-graphviz")) return false;
  const Defs = require(path.join(__dirname, "..", "lib", "defs.js"));   // after the harness: defs needs its Java stand-in
  return Defs.ALGORITHMS[algorithm].engine === "Graphviz";
}

/** @param {string} line */
function _graphvizLine(line) {
  const Defs = require(path.join(__dirname, "..", "lib", "defs.js"));
  return line.split(/\s+|:/).some(token => token in Defs.ALGORITHMS && Defs.ALGORITHMS[token].engine === "Graphviz");
}

/** @returns {"check" | "write" | "print"} */
function mode() {
  if (process.argv.includes("--check")) return "check";
  if (process.argv.includes("--write")) return "write";
  return "print";
}

/**
 * Prints, checks or writes the lines (see the module comment); exits 1 when --check finds a difference.
 * @param {string[]} lines
 * @param {string} name  file name in the expected folder
 * @param {(s: string) => void} log  the real console.log (the tools silence the modules' output)
 */
function report(lines, name, log) {
  const file = path.join(EXPECTED_DIR, name);
  const m = mode();
  if (m === "print") { lines.forEach(l => log(l)); return; }
  if (m === "write" && process.argv.includes("--without-graphviz")) throw new Error("--write needs every algorithm: run it without --without-graphviz");
  if (m === "write") {
    fs.writeFileSync(file, lines.join("\n") + "\n");
    log(`${lines.length} lines written to ${path.relative(process.cwd(), file)}`);
    return;
  }
  const withoutGraphviz = process.argv.includes("--without-graphviz");
  const expected = fs.readFileSync(file, "utf8").split("\n").filter(l => l !== "" && !(withoutGraphviz && _graphvizLine(l)));
  const diff = _diff(expected, lines);
  if (!diff.length) { log(`${name}: ${lines.length} lines as expected`); return; }
  log(`${name}: ${diff.length} lines differ (- expected, + now)`);
  diff.forEach(l => log(l));
  process.exitCode = 1;
}

/**
 * Lines only in one of the two lists, sorted so a changed line's - and + stand together.
 * @param {string[]} expected
 * @param {string[]} actual
 */
function _diff(expected, actual) {
  const now = new Set(actual), before = new Set(expected);
  return [
    ...expected.filter(l => !now.has(l)).map(l => "- " + l),
    ...actual.filter(l => !before.has(l)).map(l => "+ " + l),
  ].sort((a, b) => a.slice(2).localeCompare(b.slice(2)));
}

module.exports = { EXPECTED_DIR, GEMMA_PRESET_DIR, GEMMA_RUNS, EACH_RUNS, presetDirOf, UNSTABLE_ALGORITHMS, fingerprint, skipped, report };
