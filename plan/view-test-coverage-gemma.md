# View test coverage: GEMMA situations and nesting style

Coverage check of 2026-11-20: the Node tests ran only the baseline presets on test views 1–4, so the option combinations and model shapes GEMMA uses (Tiles with Same width, Columns across containers, Max width; a background view; several steps with previous, exclude by property and repeat; filters; deep nesting with every container through aggregation, serving and realization) had no end-to-end test, and `appearance.js` (nesting style) had no Node test at all.

## Steps

| # | Step | Status |
|---|---|---|
| 1 | `variants.js` follows `supportedOptions`; expected files rewritten after commit 6a12d3c | done |
| 2 | `arrangement_test`, `background_test`, `log_test` in CI and ARCHITECTURE § Test levels | done |
| 3a | Test model: views `6 GEMMA` (the root grouping), `7 GEMMA functions` (two functions) and `8 GEMMA background` (nested bands and functions, aggregations drawn), built by `buildGemma` in `test_model_views.js`, added on a copy (ids kept; Archi baseline on the copy unchanged) | done on the copy; the copy replaces the committed model once the user has closed it in Archi |
| 3b | Harness reads a background view (`snapshot.background`), as `selection_read.readBackground` does in Archi | done |
| 3c | Presets `presets/Test/gemma/`: copies of four GEMMA presets (Bedrijfsfunctiemodel met referentiecomponenten with and without background, Applicatieservices met referentiecomponenten, Bedrijfsfuncties en bedrijfsobjecten) | done |
| 3d | `write_plans.js --gemma` and `layout_checks.js --gemma` (`expected.js` `GEMMA_RUNS`): 5 runs × every algorithm; expected files; CI | done |
| 4 | `appearance_test.js`: the pure functions of `appearance.js` (`followNestingChains`, `nestingFonts`, `computeConditionTargets`) with the shapes of test cases 17, 21, 23, 28; applyAppearance on a stand-in view; each fix reverted once to see the test fail | done |
| 5 | `preset_test.js` (SPEC rule 13, § 13 round-trip over every preset file) and a static check that `engines/` reads no view (rules 5–6) | done |

## Not covered by this plan

Appearance as Archi applies it, view properties and Layout only on a generated GEMMA view stay Archi checks (baseline, in Archi).

## Log

- 2026-11-20: steps 1 and 2 done (not committed).
- 2026-11-20: steps 3 and 4 done (not committed). Findings: a step expands only from what the step before it added, so a start that already holds what the steps reach gets less (view 7 exists for that); Layout only on a view nested by hand without the nesting relations drawn lays everything out flat (it follows the relations drawn, SPEC § 6), so a hand-made background view loses its nesting under Layout only.
- 2026-11-20: step 5 done. The static check looks for the jArchi `$()`, `model.`, `window.` and requires of pipeline modules; the word "preset" is not forbidden: `checkEngineParams(preset)` takes the validated engineParams section. Not done: `computeConditionTargets`.
- 2026-11-20: a condition with an unknown key, type or value is refused (the preset is not loaded), not skipped: `rel_filter.normalizeCondition` throws; SPEC § 12 (§ 6 links to it), `reference/presets.md` and ARCHITECTURE say so. `computeConditionTargets` tested in `appearance_test.js` (applyTo element, relation, source, target; each broken once to see the test fail).
- 2026-11-20: `rules_test.js`: SPEC § 11 rules 7, 8, 10, 14 and 15, each broken once to see it fail. Left: rule 11 (appearance kept; needs a view with hand-set appearance, Opus), rule 2 (no compression: the spread's contract needs reading first, Opus), rule 9 for One view each (Archi baseline only), § 12 engine failure writes nothing (the writer, in Archi), § 13 scale budget (the user defines it, Known gap 7).
- 2026-11-20: rule 2 (the result is the adapter's own run on the final layout graph; the write plan's absolute positions and sizes are the result's; no centre spread exists in the code, so there is no post-layout adjustment at all) and rule 11 (`view_writer` on a stand-in that records every change) in `rules_test.js`; GEMMA run with Use label width and Highlight repeated (copy of Bedrijfsobjecten per beleidsdomein); Highlight repeated and view properties (`generate_view.applyViewProperties`, exported for the test) in `appearance_test.js`. Each broken once to see it fail. Left: rule 9 for One view each, § 12 engine failure, § 13 scale budget.
- 2026-11-20: § 12 engine failure: `test/engine_failure.ajs` in Archi's command line (every action, a layout that fails in ELK; a write before the layout, put in on purpose, failed 6 checks). The scale budget is dropped (user, 2026-11-20): removed from SPEC § 13 and Known gap 7. Left: rule 9 for One view each in Node.
- 2026-11-20: rule 9 for One view each in Node: `view_harness.planEach` (the seeds that pass the element filter, each a New view from the element alone, as `_generateOneEach`), `write_plans.js --each` and `layout_checks.js --each` (`expected.js` `EACH_RUNS`); the counts equal the views the Archi baseline wrote for the same seeds. Engine failure in Node: not tested (user: not useful; `engine_failure.ajs` covers it in Archi).
