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

module.exports = { EXPECTED_DIR, UNSTABLE_ALGORITHMS, fingerprint, skipped, report };
