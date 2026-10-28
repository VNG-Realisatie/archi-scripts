# View architecture: subjects missing from the docs

Findings list and decisions; no doc or code changes yet (approval first, `Scripts/View/AGENTS.md` §
Docs). Base: commit 5567b6a.

## Context

The request was a completeness audit of the View docs and the AI environment. Re-scoped by the user
(2026-10-24): more important than gaps in the current docs are **subjects the docs do not cover at all**,
seen through a software-architecture lens. Checklist used: the arc42 sections (context, quality goals,
constraints, building blocks, runtime, deployment, cross-cutting concepts, decisions, risks), checked
against the code in `Scripts/View/lib/**`, `tools/`, the entry scripts and the external callers.

Detailed per-line completeness (check 1–5 of the original request) and the AI environment are **not**
done in this pass; incidental drift found on the way is in § Side findings.

Placement follows the Division table (`docs/ARCHITECTURE.md` § Division): behaviour in SPEC, decisions
and realisation in ARCHITECTURE, user prerequisites in README, repo-wide facts in `ai/repo-guide.md`.
Where SPEC describes a target the code does not meet yet, the gap goes in ARCHITECTURE § Known gaps.

## Decisions (user, 2026-10-24)

| # | Subject | Decision | Where |
|---|---|---|---|
| M1 | Error handling | Documented in SPEC and ARCHITECTURE. A run that fails shows a message box with the reason at the entry point (dialog run and headless scripts); the detail stays in the console | SPEC § 12, ARCHITECTURE § Errors; Known gaps: empty catches, message box |
| M2 | Unit of work | One script run is the unit of work: one Ctrl-Z undoes a whole run, also a failed one | SPEC § 12, ARCHITECTURE § Unit of work |
| M3 | Context, prerequisites, maintenance | Documented. Scripts run straight from a clone (repo rule 6); vendored library versions and their maintenance get a home. Graphviz is the one prerequisite outside the repo, needed only for the Graphviz algorithms | ARCHITECTURE § Context, README § Requirements, `ai/repo-guide.md` § Vendored libraries |
| M4 | Public API | Documented in SPEC and ARCHITECTURE | SPEC § 3, ARCHITECTURE § Public API |
| M5 | User interaction | A confirm or other prompt belongs to the top layer (entry points) only. Decision documented; the confirm in `generate_view` is a Known gap | ARCHITECTURE § Structure, Known gaps |
| M6 | Two runtimes | Documented | ARCHITECTURE § Runtimes |
| M7 | Determinism | One shared name comparator for every "by name" that reads like a user expects and does not depend on the machine. A fixed locale is not possible in Archi (step 3), so: one shared comparator on a folded key (accents and case folded, code point as tie-break), decided 2026-10-24 | Code change, then ARCHITECTURE § Determinism |
| — | Totals line (side finding, count promise) | The dialog's totals line keeps predicting the Create actions; once the Modify group is enabled a second line predicts *Expand view* / *Layout only* from the selected view. The pipeline takes the relations on the view for both Modify actions (decided 2026-10-24) | Code, then SPEC § 6, § 9, gui.md § Totals line |
| M8 | Performance | Documented, including: jArchi's GraalJS runs the JavaScript without compiling it, so ELK is far faster in Node than in Archi. ELK freezes Archi by slowness (in-process, on the UI thread, cannot be aborted); `dot` only on a rare bug, but then for ever: add a timeout to `dot` | ARCHITECTURE § Performance; code change (timeout) |
| M9 | Configuration flow | Docs only: the implementation is layered correctly (defaults in one place, overrides before validation, engine options in the adapters). Small deviations are side findings | ARCHITECTURE § SSOT and presets |
| M10 | Runtime view Layer 1 | Documented, concise | ARCHITECTURE § Run flow |
| M11, M12 | Risks, quality goals | In | ARCHITECTURE § Risks, § Quality goals |
| M13 | Extension recipes | In | ARCHITECTURE § Development and testing |
| M14–M16 | Persistence, presets as data, logging | In | ARCHITECTURE § Persistent state, § SSOT and presets; `reference/engines.md` § Console logging |
| — | Side findings | Kept as a list in this plan | § Side findings |

## Missing subjects

### High — a wrong change or a lost view is likely without them

**M1. Error-handling strategy** (cross-cutting).
- Code: 88 empty `catch (e) {}` in `lib/` (`gui/dialog_main.js` 59, `selection_pipeline.js` 14, `generate_view.js` 7, `gui/rule_table.js` 7, `appearance.js` 1). Errors are thrown both as `Error` and as strings (`generate_view.js:54`, `run_preset.js` filename check). The only catch-all boundary is `gui/dialog_main.js:917-921`, which logs to the console after the dialog has closed; the headless path (`run_preset.js`) has none. `preset_io.writeJSON` (`preset_io.js:58-69`) logs a failed write and returns, so Save looks successful.
- Docs: SPEC § 12 lists functional error cases; nothing says which layer catches, what type an error has, which silent catches are allowed (disposed widgets, jArchi proxies) and how the user learns of a failure.
- Conflicts with `~/ai/shared/coding-standards.md` § Error handling (no broad catch-all, add context, fail fast).
- To write: SPEC § 12: a failed run shows its reason in a message box, the detail in the console; a failed preset save says so. ARCHITECTURE § Errors: the boundaries (entry script, preset load/save, engine call, external process), one error form (`Error` with context), the closed list of allowed silent catches with their reason. Known gaps: the empty catches, string throws, the message box, the silent save failure.

**M2. Unit of work and undo.**
- Code: a run writes directly through jArchi; changes to an open model go on Archi's undo stack (`ai/jarchi-scripting/SKILL.md` rule 17). SPEC § 12 guarantees no partial view only for an *engine* failure: a throw during write, styling or view properties leaves a half-written view, which one Ctrl-Z undoes. *New view* empties an existing view by name; *One view each* writes N views in one run (`generate_view.js:339-361`).
- To write: SPEC § 12: one run is one undo step, a failed run included. ARCHITECTURE § Unit of work: why "no partial view" is still kept for engine failures (no undo needed for the common failure) and what a failure mid-write leaves.

**M3. System context, prerequisites and maintenance** (context and deployment view).
- Code depends on: Archi 5 / jArchi 1.12 with GraalVM and CommonJS enabled (only in the error text at `engines/elk.js:289`); Graphviz `dot` on the PATH (`engines/graphviz.js:468`), version-sensitive (test case 10: `mode=ipsep` crashes in 14.1); vendored elkjs 0.11.1, dagre-cluster-fix (a fork), chroma-js; the file system (`presets/`, `_session.json`); coArchi (test data); external callers (7 scripts in `Scripts/GEMMA/GGM/`).
- Docs: ARCHITECTURE § Layers names the libraries without versions; README has no requirements section; no context diagram; nowhere a procedure to update a vendored library or a record of which version is vendored and why.
- To write: ARCHITECTURE § Context: one diagram (user, Archi/jArchi, Graphviz, files, calling scripts) and a table per neighbour: version tested, contract, what breaks without it. README § Requirements: CommonJS + GraalVM setting; Graphviz on the PATH, only for Dot, Neato, FDP, SFDP, Twopi, Circo. `ai/repo-guide.md` § Vendored libraries (repo-wide, `Scripts/node_modules/` serves every script): per library version, source (fork for dagre-cluster-fix), who uses it, and how to update it (replace, run the checks, test in Archi).

**M4. Public API and its consumers.**
- Code: `generate_view.js:1258` exports `generate_view` and `buildLayoutGraph` (the latter for the harness only); `preset_io.js:232-245` exports 12 functions; `run_preset.js:91` 6, with an undocumented `opts.edit` hook. `generate_view` reads an undocumented `rawPreset.action` fallback (`generate_view.js:65`, `:73`); seven old shortcut scripts in `presets/` use it and call `generate_view` directly instead of `run_preset` (`application_`, `business_`, `grouping_`, `hiddenRel_Generate_LR.ajs`, `kolom_Layout_TB.ajs`, `regels_`, `requirement_Layout_LR.ajs`). Callers in `Scripts/GEMMA/GGM/` change the preset object before the call (README § Scripting); `.ajs` files are outside the typecheck, so a signature change is not caught.
- Docs: SPEC § 3 Boundary 1 states `generateView(selection, preset, action)`: name and argument order differ from the code `generate_view(rawPreset, uiSelection, actionId)`. No statement which exports are public, which internal, and how a breaking change reaches the callers.
- To write: SPEC § 3: the boundary as the code has it. ARCHITECTURE § Public API: public functions with their contract, the known callers, the policy (every caller updated in the same commit, repo rule 3; how to find them). Internal exports marked as such.
- Decided (2026-10-24): rewrite the seven old scripts to `RunPreset.fromFilename` and drop the `rawPreset.action` fallback (repo rule 3: no compatibility path for in-repo callers). See also side finding on their directions.

### Medium — design intent invisible, drift likely

**M5. Layer purity: user interaction outside the dialog.**
- Code: Layer 2 asks the user: `window.confirm` above 20 views in *One view each* (`generate_view.js:344-346`), and warns on mixed element types. This blocks headless and Node use of the API and contradicts SPEC § 3 (Layer 1 is the only UI). The behaviour is in neither SPEC § 5 nor gui.md.
- To write: ARCHITECTURE § Structure: decision "only entry points interact with the user", with the reason. SPEC § 5: the confirm for many views, as behaviour of the entry points. Known gaps: the confirm sits in `generate_view`.

**M6. Two runtimes: GraalJS in Archi, Node for tests.**
- Code: `tools/view_harness.js:20-26` sets a global `__DIR__`, a `Java` stand-in and filters "Loading" lines; modules guard `typeof module !== "undefined"`; the harness has its own `.archimate` XML reader (a second model-access path that can drift from jArchi's semantics); Graphviz does not run there.
- To write: ARCHITECTURE § Runtimes: table module → Archi / Node; allowed globals per class of module (`$`, `Java`, `__DIR__`, `window`, single-argument `console`); the harness stand-ins; known differences (string collation until M7 is built, Graphviz, speed — M8).

**M7. Determinism: one meaning of "by name".**
- The rule exists (SPEC rule 12, `Scripts/View/AGENTS.md` hard rule 8: same inputs → same view); no rule says how names are compared, and the code does it two ways:
  ```
  code point   (pipeline: parent "first by name"):   Eva | Zaakregistratie | aanvraag | e-Depot | Émile
  localeCompare (Order Name △, Sort containers,       aanvraag | e-Depot | Émile | Eva | Zaakregistratie
                 value → colour in Style by property)
  ```
  Code point: `selection_pipeline.js:694-697` (`_byNameThenId`); `localeCompare`: `generate_view.js:371-373`, `engines/engine-utils.js:52`, `appearance.js:449`, also preset and value lists in `preset_io.js` and `gui/dialog_main.js`. `localeCompare` without a locale follows the machine's locale, so another machine or Node can give another order.
- Decision: one shared comparator. Changes the parent choice "first by name" for new placements only; an existing view keeps its containers.
- Step 3 (2026-10-24), run with jArchi 1.12's own GraalJS 24.1.2 jars through `jrunscript` of Archi's JRE: jArchi sets only `commonjs-require`, `ecmascript-version` and `nashorn-compat`, so `Intl` is undefined and `localeCompare` ignores its locale argument (`"sv"` sorts `äpple` like `"en"`); it follows the JVM's default locale. A fixed locale therefore cannot be set from JavaScript; `java.text.Collator` could, but would make the pure modules Archi-only (M6).
- Realisation (decided): compare on a folded key — `normalize("NFD")`, combining marks removed, lower case — with the code-point order as tie-break. Same result in GraalJS and Node: `aanvraag | Ångström | e-Depot | Émile | Eva | eva | Zaakregistratie | zebra`. Plain JavaScript (ES2018), no locale data.
- To write after the change: ARCHITECTURE § Determinism: the sources of order (selection, model, Map insertion, sorting) and the comparator decision with its reason.

**M8. Performance, scale and responsiveness.**
- Code: everything runs on the SWT UI thread after the dialog closes: no progress, no cancel. jArchi's GraalJS runs the scripts without compiling them, so ELK is much faster in Node than in Archi. Multi-pass layouts: ELK view-size search (`engines/elk.js:334-344`), same width per level (two runs), Radial and Stress second runs, Circo second process; *One view each* runs N full pipelines. Live counts on every commit with a per-rule cache (`gui/dialog_main.js:1243-1290`, FNV-1a key, reset above 500 entries). A phase timer logs `Timing:` (`generate_view.js:311`, `:316`). ELK can also truly hang (rectpacking at a high ratio; Pack is capped at 3). `proc.waitFor()` has no timeout (`engines/graphviz.js:476`): a hanging `dot` freezes Archi for ever.
- To write: ARCHITECTURE § Performance: the interpreter-only runtime and its consequence (measure one view in Node and in Archi for an indication), cost per phase, the multi-pass layouts, the caches and their invalidation, the UI-thread decision, ELK slowness versus the `dot` hang. Code: a `dot` timeout with a clear error (M1); Known gap until built. Budget numbers follow once SPEC § 13 defines them.

**M9. Configuration flow and precedence** — docs only.
- Code: `DEFAULT_PRESET` → preset file (or base preset `all`, else `_Default`) → session (dialog) → entry-script overrides (direction from the file name, fixed overrides in `View/_*.ajs`, `opts.edit`) → `validatePreset` (defaults, strip) → `effectiveParams` (masking, locks) → adapter defaults → `engineParams.<Engine>`.
- To write: one diagram in ARCHITECTURE § SSOT and presets: every source of a value, in order, last wins; § Options across engines and README link to it.

**M10. Runtime view of Layer 1.**
- The dialog lifecycle (capture the selection before the dialog, `_gui.ajs:3-5`; load session; validate; build tabs; count loop; close; save session; run) and the headless sequence (`run_preset`: name → preset → overrides → API) are not described, though decisions depend on the order (selection lost on focus change, session saved before the run, Cycle order written after).
- To write: § Run flow gets the two sequences, concise.

### Low

**M11. Risks and technical debt.** Known gaps lists conformance gaps to SPEC, not risks: `gui/dialog_main.js` at 3,471 lines; the forked dagre-cluster-fix; Graphviz version behaviour; undocumented jArchi behaviour (§ Platform constraints); no test model in the repo; the empty catches (M1). To write: ARCHITECTURE § Risks next to Known gaps: risk, impact, mitigation.

**M12. Quality goals.** Determinism, the count promise, readable views, no data loss and engine replaceability steer the decisions but are nowhere ranked; trade-offs such as the named exceptions to rule 18 (readability over engine purity) are argued per case. To write: ARCHITECTURE § Quality goals, top 3–5 with one measurable scenario each, linking to the SPEC rules (SPEC § 1 is `@keep`).

**M13. Extension recipes.** § Cycle says only "registry first". To write: one table in ARCHITECTURE § Development and testing: per kind of change (option, algorithm, engine, rule list, diagram type, action, styling group) the places to touch and the checks. Example row, new layout option: `defs.js` (default in `DEFAULT_PRESET.params`, label, tooltip, active params per algorithm) → dialog `PARAM_WIDGETS` → adapter mapping → `check_registry.js`, `gen_docs_tables.js --write`, typecheck → SPEC § 7.

**M14. Persistence safety.** `preset_io.writeJSON` writes in place (no temp file and rename) with `FileWriter`'s platform charset, while reading is UTF-8; a failed write is only logged (M1). Two Archi instances share `_session.json`. Which presets are shared (git-tracked) and which local (`presets/Test`, `presets/GEMMA/*` ignored) is only in `.gitignore`. To write: ARCHITECTURE § Persistent state: write safety, preset ownership. Charset checked in step 3: Archi 5 runs Java 21 (default charset UTF-8 since Java 18) and `Archi.ini` sets `-Dfile.encoding=UTF-8`, so writing and reading agree; no change needed.

**M15. Presets are data, not code.** `Scripts/View/AGENTS.md` says "plain JSON, no `module.exports`" without a reason; old JS presets remain (`presets/GEMMA/user_parameter/*.js`, ignored; `test/convert_old_js_presets.js`). To write: one decision row in § SSOT and presets (no code runs from a preset; diffable; validatable).

**M16. Logging infrastructure.** `reference/engines.md` § Console logging covers the steps; missing: the `Timing:` line, `Common.initConsoleLog` / `Common.debug`, the single-argument console. To write: § Console logging (functional), § Errors (M1).

## Side findings

| Where | Kind | Code vs doc | Proposal |
|---|---|---|---|
| `presets/kolom_Layout_TB.ajs:10`, `regels_Layout_LR.ajs:10`, `requirement_Layout_LR.ajs:10` | error | Direction `"Top → Bottom"` / `"Left → Right"`; `defs.js:203` allows `Right`, `Left`, `Down`, `Up` only, so the script's direction does not apply | With M4: rewrite to `RunPreset.fromFilename` (direction from the file name). |
| `lib/selection_pipeline.js:97-102`, `lib/generate_view.js:214-223` | drift, confirmed | SPEC § 6, § 9, § 13: predicted = written, object for object. (1) The pipeline collects every model relation between the elements for *Layout only* (only *Expand view* takes the relations on the view), so its console block "Total to view" counts relations that `generate_view` then filters out. (2) The dialog's totals line (`gui/dialog_main.js:1050-1079`) is computed as for a Create action (filter + steps); for *Expand view* and *Layout only* the action skips the filter, *Layout only* also the steps, so the line can differ from the result | (1) Code: the pipeline takes the relations on the view for both Modify actions; the filter in `generate_view` goes. (2) Behaviour decision: which action the totals line predicts (e.g. Create totals, and Modify totals once a Modify group is enabled) — then SPEC § 9. |
| `docs/SPEC.md:96` | drift | `generateView(selection, preset, action)` vs `generate_view(rawPreset, uiSelection, actionId)` | With M4. |
| `lib/generate_view.js:344-351` | missing | Confirm above 20 views, warning on mixed types: in neither SPEC § 5 nor gui.md | With M5. |
| `lib/run_preset.js:85` | double | `fromBase` validates, and `generate_view` validates again; `fromFilename` does not | Drop the validation in `fromBase`; `generate_view` is the boundary. |
| `README.md` § Shortcut scripts | missing | `fromFilename` takes `opts.edit` (adjust the preset before the run) | One line in README. |
| `docs/ARCHITECTURE.md:461-462` | unclear | `tools/compare-layouts.js`, `tools/same-code.js` are in the repo-root `tools/`; the rest of the table is `Scripts/View/tools/` | Write the path from the repo root. |
| `Scripts/View/COLOR.md` | wrong place | An Archi colour-preference file (`.prefs` format, 72 keys), read by no script; differs from every file in `_ConfigFiles/` (same format, no equal value) | Decided: move to `_ConfigFiles/` beside the others, as `_ConfigFiles/Brewer Set3.prefs`. |
| `lib/appearance.js:398` | double | `settings.mixedValuesColor \|\| "#FF6B35"` repeats the default of `defs.js:766`; `validatePreset` already fills it | Drop the fallback (SSOT; no fallback for a case that cannot happen). |
| `docs/reference/selection-nesting.md:244-252` | error | The example names B, B1 as containers; the table shows neither at levels 0–1 | Complete the table or the text. |

## What is already good

- **Building blocks**: layers, modules, responsibilities and uses (§ Layers and modules), subjects ↔ modules ↔ SPEC (§ Subjects and layers), typed contracts per boundary.
- **Decisions with reasons**: per subject, many backed by measured test cases; the named exceptions to rule 18 are explicit.
- **Run flow of the API**, identities (model / occurrence / visual id) and the nesting resolution order.
- **Configuration layering in the code** (M9): defaults in one place, validation at the boundary, engine options in the adapters.
- **Data lifecycle of presets**: schema version gate and one-shot migrations.
- **Platform constraints** of jArchi, gathered in one place.
- **Development and testing**: cycle, test levels with what they do not cover, how to judge a result, test data.
- **Known gaps** as a living to-do list; the generated tables are current (`gen_docs_tables.js`: ✓) and the registry is consistent (`check_registry.js`: ✓).

## Steps

| # | Step | Depends on | Status |
|---|---|---|---|
| 1 | Decisions on M1–M16 and side findings | — | done 2026-10-24 |
| 2 | Confirm the M4 proposal (old scripts → `run_preset`, drop `rawPreset.action`) and COLOR.md | 1 | done 2026-10-24 |
| 3 | Verify: GraalJS honours a fixed locale (M7, in Archi); `FileWriter` charset on Archi's JVM (M14); dialog count for *Layout only* (side finding, code) | 1 | done 2026-10-24: no fixed locale (M7 realisation to confirm); charset fine; count drift confirmed (decision on the totals line open) |
| 4 | Code changes, each its own commit, approval first: M7 comparator; M8 `dot` timeout; M4 old scripts; side findings in code (`fromBase`, `appearance.js:398`); move COLOR.md | 2, 3 | code done 2026-10-24 (10 commits, fbe9233..0bc01cf); Archi checks open, see § Status after step 4 |
| 5 | Docs: SPEC § 3, § 5, § 12; ARCHITECTURE new sections (Context, Public API, Errors, Unit of work, Runtimes, Determinism, Performance, Quality goals, Risks, extension recipes, configuration diagram, Layer 1 run flow); README § Requirements, `opts.edit`; `ai/repo-guide.md` § Vendored libraries; Known gaps for M1, M5 and what step 4 does not build. Check SPEC body ≤ 550 lines | 4 | done 2026-10-24 (4 commits, 7f9f83b..82421ee); open: the items in the step log entry below |

## Step log

- 2026-10-24: analysis on 5567b6a; scope changed from completeness to missing subjects.
- 2026-10-24: user decisions recorded (§ Decisions); M4 old scripts and invalid directions found.
- 2026-10-24: step 3 done. GraalJS test with jArchi's jars via `jrunscript -l graal.js -J-Dpolyglot.js.nashorn-compat=true` (Archi's JRE); count drift for Modify actions confirmed in code.
- 2026-10-24: step 4 code done, one commit each: `Defs.compareNames` (fbe9233; home `defs.js`, every caller already requires it; `compare-layouts.js` on Kennismodel (copy): no digest difference); Modify relations from the view (36c40c2); old scripts → `fromFilename` (db0d5f9); `rawPreset.action` dropped (1bdfebf); `fromBase` validation (c0d8d54); mixed-values colour (ea9249b: `validatePreset` now also turns an empty value into the default, the case the fallback covered); COLOR.md moved (c6377d8); `dot` timeout (56fa3d7); dialog Expand view totals (0bc01cf).
- 2026-10-24: user decisions in step 4: totals in two columns above the action groups; the right column predicts **Expand view only** — Layout only writes what is on the view, which Current selection already counts. The prediction uses the pipeline itself: `buildObjectSet` split into `readSelection` (jArchi reads, logs) and `composeObjectSet` (silent); the dialog reads Expand view's content once before it opens and composes on every change.
- 2026-10-24: shortcut scripts moved from `presets/` to `shortcuts/` (b794454; README, ARCHITECTURE and `run_preset.js` paths already updated there); the duplicate `publicerenStandaarden_Layout_LR copy.ajs` deleted. Step 4 approved; step 5 next in a new session.
- 2026-10-24: `dot` timeout: stdout was read with `readAllBytes()` before `waitFor`, so a timed `waitFor` alone would never fire; input, output and errors now go through temp files. Checked with jArchi's GraalJS 24.1.2 via `jrunscript` (Archi's JRE, `-J-Dpolyglot.js.ecmascript-version=2022`): real `dot` returns output; a sleeping stub stops after the limit with the message; no temp files left. The constant `GRAPHVIZ_TIMEOUT_S` (60) is in the adapter.

## Handoff step 4 — code (new session)

Start a **new session**; open it with: "Execute step 4 of `plan/view-architecture-missing-subjects.md` (§ Handoff step 4)." Read `AGENTS.md`, `Scripts/View/AGENTS.md`, and the plan sections M4, M7, M8, § Side findings. Repo rules that bite here: each item below is **its own commit**, **no co-author line and no AI mention** (rule 4, overrides any tool default), `npm run typecheck` at exit 0 after every change under `jsconfig.json` › `include` (rule 5), no compatibility shim (rule 3). Docs are **not** touched in step 4 (approval first); a changed behaviour is listed under "Docs to write" in step 5.

### 4a — Opus (determinism and count promise: design care needed)

Model: **Opus**. Order: 1, 2, 3.

1. **M7 shared name comparator.**
   - One function, one home (`lib/engines/engine-utils.js` already has `byTypeAndName`; or a pure `_lib` module if the pipeline and `preset_io` must not depend on engines — decide by the dependency direction, the pipeline must not require an engine module).
   - Key: `s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()`; compare keys with `<`/`>`; tie-break on the original string by code point. Expected sort of `Zaakregistratie, aanvraag, Émile, Eva, e-Depot, eva, Ångström, zebra`: `aanvraag | Ångström | e-Depot | Émile | Eva | eva | Zaakregistratie | zebra` (same in Node and in jArchi's GraalJS).
   - Replace the "by name" sites: `lib/selection_pipeline.js:694` (`_byNameThenId`, keep the id tie-break), `lib/generate_view.js:371-373` (`Name △`, `Name ▽`), `lib/engines/engine-utils.js:52` (`byTypeAndName`: type and name), `lib/appearance.js:449` (value → colour order), `lib/preset_io.js:127,136`, `lib/gui/dialog_main.js:278,1213,1227`. Leave id comparisons (`selection_pipeline.js:1040`, `.sort()` of ids at `:926`, `:1048`) as they are.
   - Check each site: sorting of ids or type ids stays code point; only names and labels change.
   - Tests: add the example above to `tools/nesting_test.js` (or a new section in it): the parent choice "first by name" gives the same child placement in both relation orders. Run `rel_filter_test.js`, `nesting_test.js` (also with a model: `nesting_test.js [model.archimate]`), `check_registry.js`, typecheck.
   - Effect to report: for a **new** placement the parent can differ from before when names differ only by case or accent; an existing view keeps its containers. Run `tools/compare-layouts.js` on two checkouts for one view/preset set if a model is at hand (skill `view-testing` has the model paths) and report digest differences.
2. **Count promise for the Modify actions** (side finding, confirmed).
   - `lib/selection_pipeline.js:97-102`: for **both** Modify actions the base relations are the ones drawn on the view (`_viewRelations(existing.visualRelations, …)`, today only `isExpand`). Then remove the *Layout only* relation filter in `lib/generate_view.js:214-223` and its comment.
   - Dialog totals line (`lib/gui/dialog_main.js` around `:1050-1085`, `Pipeline.predictViewCounts`): keep predicting the Create actions; when the Modify group is enabled show a **second** line predicting *Expand view* / *Layout only* from the selected view (same helpers as the action: no second counting logic). Zeros hidden, console-vocabulary labels (SPEC § 2 counter rule: nestings and connections, never "relations"). Read `Scripts/View/docs/reference/gui.md` § Totals line and action area and `ai/dialog-style.md` before changing the layout; the SWT result must be checked by the user in Archi.
   - Verify with the harness (`tools/view_harness.js <model> <view> [preset] --on-view`): predicted = written for *Layout only* on a view with an extra hand-drawn connection. In-Archi check stays open in this plan's status.
3. **Report back** what the user must check in Archi (second totals line, *Layout only* count in the console block "Total to view").

### 4b — Sonnet (mechanical, small, well-specified)

Model: **Sonnet**. Can run in the same new session after 4a, or its own session. Each bullet is one commit.

1. **Seven old shortcut scripts → `RunPreset.fromFilename`.** Files in `Scripts/View/presets/`: `application_Generate_LR.ajs`, `business_Generate_LR.ajs`, `grouping_Generate_LR.ajs`, `hiddenRel_Generate_LR.ajs`, `kolom_Layout_TB.ajs`, `regels_Layout_LR.ajs`, `requirement_Layout_LR.ajs`. Use the three-line body in `Scripts/View/README.md` § Shortcut scripts (look at `presets/GEMMA/TAenIA_Layout_TB.ajs` as the working example; no `folder` option, the presets are in `presets/` itself). Keep each header comment, drop `PresetIO`, `GenView`, `ACTION` requires and `preset.action`. The direction now comes from the file name (`LR` → `Right`, `TB` → `Down`), which also fixes the invalid `"Top → Bottom"` / `"Left → Right"` values. Read each file first; if one carries something else than preset name, action and direction, stop and ask.
2. **Drop `rawPreset.action`** in `lib/generate_view.js:65` (JSDoc) and `:73` (`actionId || rawPreset.action || …` → `actionId || ACTION.NEW_VIEW.id`); remove the comment on `:71`. `grep -rn "\.action" Scripts --include=*.ajs --include=*.js | grep -v node_modules` must show no other caller that sets `preset.action` (GGM scripts pass the action as third argument). Typecheck.
3. **`fromBase` double validation:** `lib/run_preset.js:85`, return `GenView.generate_view(preset, selection, actionId)` (`generate_view` validates). Check that `Defs` is still used in the file; typecheck.
4. **Duplicate default:** `lib/appearance.js:398`, `settings.mixedValuesColor || "#FF6B35"` → `settings.mixedValuesColor`. `validatePreset` fills it from `defs.js:766`. Typecheck.
5. **COLOR.md:** `git mv Scripts/View/COLOR.md "_ConfigFiles/Brewer Set3.prefs"` (a plain move; content unchanged). Check no file links to `COLOR.md` (`grep -rn "COLOR.md" .` outside `node_modules`); fix any.
6. **`dot` timeout** is **not** here: it is Opus work (4c).

### 4c — Opus (external process)

Model: **Opus**, small.
- `lib/engines/graphviz.js:476`: `proc.waitFor()` → `proc.waitFor(GRAPHVIZ_TIMEOUT_S, TimeUnit.SECONDS)` (`Java.type("java.util.concurrent.TimeUnit")`), on `false`: `proc.destroyForcibly()`, then throw an `Error` with a clear message (Graphviz did not finish within N s; try another algorithm or a smaller selection). `GRAPHVIZ_TIMEOUT_S` a named constant (60) — decide whether it belongs in `defs.js` (constants are listed there in the Division table) or the adapter (engine-specific, adapters own units and mappings: the adapter is the better owner; say why in the commit message). stderr is read after `waitFor`; make sure a killed process does not leave the temp file behind.
- The error reaches the existing `generate_view` catch of the dialog; the headless path has none yet (Known gap M1) — do not build the message box here.
- Test: cannot run in Node (the Java stand-in cannot start `dot`); verify in Archi with a `dot` stub: put an executable `dot` script that sleeps on the PATH, run once, check the message and that Archi stays usable. List this check in the plan status.

### Status after step 4

Code committed and approved by the user (2026-10-24): step 5 may start. Checks in Archi, all confirmed by the user 2026-10-24:
- [x] Dialog with elements selected on a view: two totals columns, "On the expanded view" above the Modify group, equal to the console block "Total to view" after *Expand view*; with a view picked in the model tree the right column is empty. Dialog still opens fast on a large view (Expand view content is read before it opens).
- [x] *Layout only* on a view with a hand-drawn connection between elements: console "Total to view" = what is written (no relations that are not on the view).
- [x] `dot` timeout: an executable `dot` stub that sleeps on the PATH, run a Graphviz algorithm once: message after 60 s, Archi usable afterwards. (A shell stub's child `sleep` outlives the stop; a real `dot` has no child.)
- [x] The seven old shortcut scripts (now in `shortcuts/`, b794454; GEMMA ones in `shortcuts/GEMMA/`, local) run once each (`kolom` now Down, `regels` / `requirement` Right).
- [x] Console order of a run: step rules are now logged after the steps ran (from their counts), before the count block.

Docs to write in step 5, on top of § Handoff step 5: gui.md § Totals line (two columns, Expand view only, why no Layout only line); SPEC § 9 (prediction per action); ARCHITECTURE: `readSelection` / `composeObjectSet` split in § Run flow and § Performance (dialog reads once); `GRAPHVIZ_TIMEOUT_S` in § Performance with the file-redirect reason; `compareNames` in § Determinism; `validatePreset` empty mixed colour in presets.md if it lists the default rule.

## Handoff step 5 — docs (new session, after approval of step 4)

Start a **new session**; open it with: "Execute step 5 of `plan/view-architecture-missing-subjects.md` (§ Handoff step 5)." Read `Scripts/View/AGENTS.md` § Docs (writing rules: SPEC implementation-free, body ≤ 550 lines now 504, technology names only in `reference/` and ARCHITECTURE, one fact one place), `docs/ARCHITECTURE.md` § Division, and the plan's M-sections. Docs and code of a behaviour go in one commit; step 4's code is already committed, so docs commits reference it. Finish with `node Scripts/View/tools/gen_docs_tables.js --write` and `check_registry.js`. No co-author line.

### 5a — Opus (new text with design content)

Model: **Opus**. One commit per group.

1. **SPEC** (behaviour only, no function or engine names):
   - § 3 Boundary 1: the signature as the code has it (rename the abstract name to match the API: preset, selection, action; the order of arguments as in `generate_view`); the user-interaction rule (only the entry points talk to the user; a confirm for many views belongs to them); public vs internal.
   - § 5: confirm before *One view each* above 20 views, as behaviour of the entry points; warning on mixed element types.
   - § 9 + `reference/gui.md` § Totals line: two lines, Create and (when enabled) Modify; § 6 count promise per action.
   - § 12: a failed run shows its reason in a message box and the detail in the console; a failed preset save says so; one run is one undo step, a failed run included; what a failure mid-write leaves.
   - § 7 or rule 12: "by name" is one comparison (accents and case folded), same on every machine.
2. **ARCHITECTURE** new sections, each decision with its why, realisation after it (file and exported names allowed here): Context (diagram + table per neighbour: Archi/jArchi 1.12 with GraalJS 24.1.2 and CommonJS on, Graphviz on the PATH only for the Graphviz algorithms, vendored libraries, files, calling scripts), Public API (public exports, callers, policy), Errors (boundaries, one error form, closed list of allowed silent catches), Unit of work, Runtimes (Archi vs Node: module → runtime, allowed globals, harness stand-ins, differences), Determinism (sources of order, the comparator and why not `localeCompare`/`Intl`: jArchi's GraalJS has no `Intl` and ignores the locale argument), Performance (interpreter-only GraalJS, ELK slowness versus the `dot` hang and its timeout, multi-pass layouts, caches, UI thread; a measured indication Node vs Archi if the user can run one view), Quality goals (3–5 with one scenario each, linking to SPEC rules), Risks, Layer 1 sequences in § Run flow, configuration-precedence diagram in § SSOT and presets, extension-recipe table in § Development and testing, persistence safety (in-place write, shared `_session.json`, preset ownership: git-tracked vs ignored) in § Persistent state, "presets are data, not code" decision row, Logging infrastructure.
3. **Known gaps** (ARCHITECTURE): add M1 (empty catches, string throws, no message box, silent save failure), M5 (confirm in `generate_view`), M8 if the timeout was not built; remove what step 4 built.

### 5b — Sonnet (mechanical docs)

Model: **Sonnet**. Independent of 5a; can run first.

1. `README.md`: § Requirements (jArchi with CommonJS and GraalVM enabled in Archi Preferences › Scripting; Graphviz on the PATH, only for Dot, Neato, FDP, SFDP, Twopi, Circo — list as in `lib/defs.js` registry, engine `Graphviz`); one line for `opts.edit` of `fromFilename` in § Shortcut scripts; second totals line wording only if the dialog text changed (copy from the dialog).
2. `ai/repo-guide.md` § Vendored libraries: a table per library in `Scripts/node_modules/` — name, version (read `package.json` in each folder; `elkjs` is 0.11.1), source (dagre-cluster-fix is a fork: record from its `package.json`/readme what is known, mark unknown as "to fill in" instead of guessing), used by (grep `require(` for it), how to update (replace the folder, run `check_registry.js`, `nesting_test.js`, the harness, test in Archi). Ask the user for anything not derivable.
3. `docs/ARCHITECTURE.md` § Test levels (lines ~461-462): write `tools/compare-layouts.js` and `tools/same-code.js` as repo-root paths (`tools/…` at the repo root, not `Scripts/View/tools/`).
4. `docs/reference/selection-nesting.md` § Same width per level (~244-252): the example names B and B1 but the table does not show them at levels 0 and 1; complete the table (or the text) so the numbers `W[L]` follow `W[L] = W[L+1] + ring`.
5. `Scripts/View/docs/test-cases.md`: nothing to add unless the user reports a case.
6. Checks: `grep -c` the SPEC body length (≤ 550 lines), `grep -n` technology names in SPEC body (jArchi, SWT, ELK, Dagre, Graphviz allowed only in `reference/` and ARCHITECTURE; SPEC § 2 may keep the vocabulary), `gen_docs_tables.js` check, and every link in the touched files points to an existing heading.

### Closing

Update this plan's Steps table and Step log after each part. When 4 and 5 are done and the Archi checks are confirmed, the plan stays in `plan/` as the record.
- 2026-10-24: step 5 done, docs only: README § Requirements and `opts.edit`, `ai/repo-guide.md` § Vendored libraries (7f9f83b); Test levels paths, same-width example (3de7ceb); SPEC § 3, § 5, § 6, § 9, rule 12, § 12 and gui.md totals (f83bc02); ARCHITECTURE Quality goals, Context, Public API, Cross-cutting concepts (Errors, Unit of work, Runtimes, Determinism, Performance, Logging), configuration diagram, presets-as-data, persistence safety, extension recipes, Risks, Known gaps 8–9; engines.md `Timing:` (82421ee). Known gaps 8–9 in one commit with the sections they refer to. SPEC body 505 lines; no technology names; tables and registry ✓; links ✓. Open for the user: the ranking of the quality goals; origins marked "to fill in" in § Vendored libraries; a measured Node vs Archi time for one ELK view (§ Performance has no number); side finding: `Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs` and `ggmBO_Generate_LR.ajs` read `gemma/ggm/…` while the folder is `presets/GEMMA/GGM/`, which fails on a case-sensitive file system.
- 2026-10-24: user: all Archi checks of step 4 confirmed, GGM preset path fix (b95849e) included; library origins stay empty; the Node vs Archi timing (§ Performance) is for later. Markdown paragraphs unwrapped (7747135).
