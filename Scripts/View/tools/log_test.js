/**
 * Node tests for _lib/log.js: the pure part (wrapping, fields, advice, views and counts, sinks).
 * The log file (Java) is checked in Archi. Run from the repo root:
 *   node Scripts/View/tools/log_test.js
 */
const Log = require("../../_lib/log");

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; console.log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}

// ── Wrapping ──────────────────────────────────────────────────────────────────
const W = Log.CONSOLE_WIDTH;
const long = "word ".repeat(30).trim();
eq(Log._wrap("short line"), "short line", "a short line stays");
eq(Log._wrap(long).split("\n").every(l => l.length <= W), true, "every wrapped line fits");
eq(Log._wrap(long).split("\n")[1].startsWith("  word"), true, "a plain line hangs two spaces in");
const fieldLine = Log.field("Settings:", long, 2);
eq(fieldLine.indexOf("word"), 17, "a field value starts at the value column");
eq(Log._wrap(fieldLine).split("\n")[1].indexOf("word"), 17, "a field wraps under its value");
eq(Log._wrap("⚠ " + long).split("\n")[1].indexOf("word"), 2, "a warning wraps under its text");
const path = "/home/user/.archi/logs/archi-scripts/" + "x".repeat(70) + ".log";
eq(Log._wrap(Log.field("Log file:", path)).includes(path), true, "a path is never broken");
eq(Log.field("A very long label here:", "v"), "A very long label here: v", "a long label keeps one space");

// ── Lines through a sink ──────────────────────────────────────────────────────
const got = [];
Log.setSink((level, text) => got.push([level, text]));
Log.debug("Pipeline — build object set:");
Log.info("Preset saved");
Log.warn("Something happened.", { effect: "the view differs.", action: "change the filter." });
Log.error("It failed.");
eq(got, [
  ["DEBUG", "Pipeline — build object set:"],
  ["INFO", "Preset saved"],
  ["WARN", "Something happened.\n  Effect: the view differs.\n  Action: change the filter."],
  ["ERROR", "It failed."],
], "lines keep level and text; advice on its own lines");

// ── Views and counts ──────────────────────────────────────────────────────────
got.length = 0;
Log.beginItem("view", "A"); Log.endItem("done", 'New: "A"', ["On view: 1 element"]);
Log.beginItem("view", "B"); Log.warn("Overwritten."); Log.endItem("done", 'Overwritten: "B"');
Log.beginItem("view", "C"); Log.endItem("skipped", 'Skipped: "C"');
Log.beginItem("view", "D"); Log.endItem("failed", 'Failed: "D"');
const s = Log.summary();
eq([s.done, s.withWarnings, s.skipped, s.failed], [2, 1, 1, 1], "views counted by status, warnings per view");
eq(got.filter(([l]) => l === "INFO").map(([, t]) => t[0]), ["✓", " ", "⚠", "–", "✗"], "status icon per view (the second line is a detail)");
got.length = 0;
Log.beginItem("view", "E"); Log.warn("Repeated."); Log.warn("Repeated."); Log.endItem("done", 'New: "E"');
eq(got.filter(([l]) => l === "WARN").length, 1, "a warning repeated in a view is shown once");
Log.setSink(null);

eq([Log.versionBelow("1.10.0.202301011200", "1.11"), Log.versionBelow("1.11.0", "1.11"), Log.versionBelow("1.12.0.202604070605", "1.11"), Log.versionBelow("1.9", "1.11"), Log.versionBelow("2.0", "1.11")],
   [true, false, false, true, false], "jArchi versions compare number by number");

eq(Log.seconds(340), "340 ms", "milliseconds");
eq(Log.seconds(2140), "2.1 s", "seconds");
eq(Log.seconds(125000), "2 min 5 s", "minutes");

console.log(failed ? `${failed} failed` : "log_test: all passed");
process.exitCode = failed ? 1 : 0;
