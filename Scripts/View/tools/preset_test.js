/**
 * Node tests for presets (View rule 13, § 12 Invalid preset, § 13 Preset round-trip): every preset file in
 * presets/ loads without unknown keys and survives write → read; an unknown key is reported, a missing key
 * defaulted, a value the algorithm does not offer replaced, another schemaVersion refused; and the adapters in
 * lib/engines/ touch no view, selection or preset (rules 5–6). Run from the repo root:
 *   node Scripts/View/tools/preset_test.js
 */
const fs   = require("fs");
const path = require("path");

global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
const _log = console.log; console.log = () => {};   // the modules' "Loading …" lines
const Defs = require("../lib/defs");
const ConditionLists = require("../lib/rel_filter");
const Log = require("../../_lib/log");
console.log = _log;

let failed = 0;
function eq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) { failed++; _log(`FAIL ${label}\n  expected ${e}\n  actual   ${a}`); }
}
/** The warnings a call logs. @param {() => unknown} f */
function warnings(f) {
  const out = [], warn = Log.warn;
  Log.warn = m => { out.push(String(m)); };
  try { f(); } finally { Log.warn = warn; }
  return out;
}

const PRESETS = path.join(__dirname, "..", "presets");
/** @param {string} dir */
const files = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(dir, e.name))
  : e.name.endsWith(".json") && !e.name.startsWith("_") ? [path.join(dir, e.name)] : []);

// Every committed preset: no unknown keys, valid, and write → read gives the same configuration.
for (const file of files(PRESETS)) {
  const label = path.relative(PRESETS, file);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  eq(Defs.unknownPresetKeys(raw), [], `${label}: keys validation does not read`);
  const preset = Defs.validatePreset(raw);
  const again = Defs.validatePreset(JSON.parse(ConditionLists.stringifyPreset(preset)));
  eq(again, preset, `${label}: round-trip`);
}

// Defaults fill gaps; unknown keys are reported and do not survive.
{
  const preset = Defs.validatePreset({ algorithm: "Tiles", params: { padding: 33 } });
  eq([preset.params.padding, preset.params.elementWidth, preset.filter.conditions], [33, Defs.DEFAULT_PRESET.params.elementWidth, []], "missing keys take the default");
  eq(Defs.unknownPresetKeys({ algorithm: "Tiles", params: { layerSpacng: 5 }, bogus: 1, relatedElements: { steps: [{ nam: "x" }] } }),
     ["params.layerSpacng", "bogus", "relatedElements.steps[0].nam"], "an unknown key is named by its path");
  const survived = JSON.parse(ConditionLists.stringifyPreset(Defs.validatePreset({ algorithm: "Tiles", bogus: 1, params: { layerSpacng: 5 } })));
  eq(["bogus" in survived, "layerSpacng" in survived.params], [false, false], "unknown keys do not survive validation");
}

// Option values are checked against the algorithm.
{
  let preset;
  const warned = warnings(() => { preset = Defs.validatePreset({ algorithm: "Tiles", params: { sameWidth: "Sideways" } }); });
  eq([preset.params.sameWidth, warned.length], [Defs.SAME_WIDTH.OFF, 1], "a value the algorithm does not offer is replaced, with a warning");
  let grid;
  warnings(() => { grid = Defs.validatePreset({ algorithm: "Grid", params: { sameWidth: Defs.SAME_WIDTH.LEVEL_AND_TYPE } }); });
  eq(grid.params.sameWidth, Defs.SAME_WIDTH.OFF, "Per level and type is Tiles only");
  let message = "";
  try { Defs.validatePreset({ algorithm: "Nope" }); } catch (e) { message = String(e.message); }
  eq(message.startsWith('Unknown algorithm: "Nope"'), true, "an unknown algorithm is refused");
}

// Another schemaVersion is refused with the expected one named.
{
  let message = "";
  try { Defs.validatePreset({ schemaVersion: Defs.DEFAULT_PRESET.schemaVersion + 1, algorithm: "Tiles" }); } catch (e) { message = String(e.message); }
  eq(message.includes(`expected ${Defs.DEFAULT_PRESET.schemaVersion}`), true, "another schemaVersion is refused, naming the expected one");
}

// A condition with an unusable key or type is refused with a message naming it, never skipped or widened to All (SPEC § 12).
{
  let message = "";
  try { Defs.validatePreset({ algorithm: "Tiles", params: { nestingConditions: [{ relation: "no-such-relationship" }] } }); } catch (e) { message = String(e.message); }
  eq(message.startsWith('params.nestingConditions[0]: unknown relation "no-such-relationship"'), true, "a condition naming an unknown type is refused");
  message = "";
  try { Defs.validatePreset({ algorithm: "Tiles", relatedElements: { steps: [{ conditions: [{ direction: "sideways" }] }] } }); } catch (e) { message = String(e.message); }
  eq(message.startsWith("relatedElements.steps[0].conditions[0]: "), true, "a step condition with an unknown value is refused, naming where");
}

// Adapters never touch a view, a selection or a preset (View rules 5–6, 18–20).
{
  const FORBIDDEN = [
    [/\$\(/, "the jArchi $()"], [/\bmodel\.(?!exports)/, "the jArchi model"], [/\bwindow\./, "the jArchi window"],
    [/require\([^)]*(selection|generate_view|view_writer|preset_io|appearance|nesting|background|run_preset)/, "a pipeline module"],
  ];
  const dir = path.join(__dirname, "..", "lib", "engines");
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(dir, file), "utf8").split("\n")
      .map(l => l.replace(/\/\/.*$/, "").replace(/^\s*\*.*$/, "").replace(/^\s*\/\*\*.*$/, ""));   // comments say what the adapter never does
    const hits = [];
    code.forEach((l, i) => { for (const [re, what] of FORBIDDEN) if (re.test(l)) hits.push(`${file}:${i + 1} ${what}`); });
    eq(hits, [], `${file} reads no view, selection or preset`);
  }
}

if (failed) { _log(`preset_test: ${failed} failed`); process.exitCode = 1; }
else _log("preset_test: all passed");
