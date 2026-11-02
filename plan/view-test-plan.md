# View test plan

The one test plan for `Scripts/View/`: goal, the choices and why, what is tested, who does what, and the steps that add to the existing tests. Status 2026-11-02: approved; T1 300, T2 log only, T3 as in choice 8. It replaces `plan/view-testability-baseline-layout-digests.md` and `plan/view-testability-baseline-write-plans.md` (their expected lines move into the repo in step 1, then the two files go). Working notes, not rules (`AGENTS.md` § Hierarchy); the test levels themselves are documented in `Scripts/View/docs/ARCHITECTURE.md` § Development and testing.

## Goal

- A change to `Scripts/View/` is known to be right or wrong before it is committed, without the user checking it by hand.
- Every check is a script with a pass / fail result. An LLM (the agent) or the user is needed only where a script cannot decide; each such place is named below.
- The user does only what needs a person: decisions, approvals, and the few checks no script can make.

## Terms

| Term | Meaning |
|---|---|
| **Result** | What one run produces: the *layout result* (positions, sizes, bendpoints from the engine) or the *write plan* (what the writer will do on the view: create, keep, move, remove, bendpoints, records). |
| **Fingerprint** | A short code (12 characters, a hash) computed from a whole result. Two runs with the same fingerprint have exactly the same result; a different fingerprint says only *that* something changed, not what or whether it is wrong. Was called *digest*. |
| **Expected file** | A committed text file with one line per run (setting, algorithm, view, action, fingerprint, counts) as a correct run prints it. A script compares a new run against it. |
| **Rule check** | A script that tests a result against the SPEC rules (no overlap, children inside their container, …). Says *what* is wrong, independent of earlier runs. |
| **Variant** | One option set on top of a test preset (e.g. label *Target*, routing *Splines*). |
| **Baseline** | The views Archi's writer puts in `Views/Baseline` of the test model for a fixed list of runs; the committed model file is the expected result. |
| **Archi CLI** | Archi started from the command line without its window ([Archi CLI](https://github.com/archimatetool/archi/wiki/Archi-Command-Line-Interface)): it loads a model, runs a jArchi script and prints the script's console to standard output. |

## Archi CLI: what the probe showed (2026-11-02)

Archi 5.10, jArchi 1.12, at `~/Tools/Archi`, while the user's Archi was open:

- **It runs next to the open Archi.** `--loadModel <file> --script.runScript <script>` worked; `~/.archi/models.xml` (the user's open models) was not touched.
- **The baseline is identical.** `run_baseline.ajs` on a copy of the test model: 10/10 runs, `compare-views.js` against the committed model: `Views/Baseline` and `Views/Test` the same. 6 s for the whole run, Archi start included.
- **It needs the same display settings as the user's Archi.** Without `GDK_BACKEND=x11` (what `Archi.sh` sets) GTK runs on Wayland at 96 dpi: text measured 27 px instead of 34 px for "Archi", so every element size and the whole baseline differ. With `GDK_BACKEND=x11 GTK_THEME=Adwaita SWT_GTK3=1` (the user's Archi process environment) the text sizes and the baseline match. The run uses the user's display (`DISPLAY=:0`); a virtual display would give other fonts.
- **The console is readable.** Every `console.log` and `console.error` line arrives on standard output: the predicted totals ("Total to view"), what was written ("Objects on view"), ⚠ lines, errors and the timing line ("Timing: … (total 472 ms)").
- **Rendering works.** `$.model.renderViewToSVG` and `renderViewToFile` (PNG) wrote files. The SVG (Batik) holds every element as a `<rect>` at its absolute position, each text as glyph paths with its own clip rectangle (the area Archi lets the text use), lines as `<line>` / `<path>` and end symbols as `<polygon>`.
- **Noise to remove.** Each run logs "Failed to open … in the UI": the view opener has no window in the CLI.

## Choices and why

1. **Rule checks next to fingerprints.** Fingerprints catch any change but cannot tell right from wrong, and a wrong layout that never changes passes forever (the Tree container padding bug, 2026-10-28: children outside their container, found by measuring by hand). Rule checks catch that kind of error on every run.
2. **Expected files in the repo, compared by script.** Today the expected lines are in plan files and the agent compares them by reading. A script (`--check`) makes the comparison exact and needs no LLM; a meant change rewrites the file (`--write`) in the same commit.
3. **Variants instead of throwaway probes.** The presets set one option set; S2 (*Source* / *Target* labels) and S4 (*Aspect ratio*) were invisible to every check, and each time a scratch matrix was built and thrown away. A fixed variant list runs each option where the dialog offers it.
4. **New test views instead of changing views 1–3.** Changing them changes every expected line and the baseline at once; new views add cases without losing the comparison with the past.
5. **Archi through the CLI, run by the agent.** The probe shows it gives the same baseline as the user's Archi, in seconds. One wrapper script holds the command and the display settings, so no run can use the wrong ones. It always works on a copy of the test model in a scratch folder: the user may have the test model open, and Archi would not see a file changed underneath it. The repo's model file is replaced only for a new baseline that is meant to be committed.
6. **Rendering checked by script from SVG.** SVG is the drawing as Archi makes it, in numbers: a script can check what coordinates in the model file cannot show. A PNG would need an LLM to look at it; SVG makes it a pass / fail check. What stays for an LLM: whether a view *reads well* (balance, crossings that could be avoided), which no rule captures; the agent looks at a PNG only when a change is about that, or when an SVG check fails in a way it cannot explain.
7. **The console checked by script.** The CLI output is a log a script can read. The count promise (SPEC § 13: the predicted totals equal what is written) is today checked only by a person in Archi (Known gap 7); a script compares the two blocks per run. The same parser collects ⚠ lines, errors and Archi's run times.
8. **CI runs what does not depend on the machine.** Locally the agent runs everything, but only when it remembers to and only on this machine. CI runs on every push to GitHub from a clean clone, so it also catches a file that was not committed, a vendored library missing from `Scripts/node_modules/`, a different Node version, and changes from other people or tools. It runs the rule checks with Graphviz (installed from the runner's packages; a rule holds whatever the version) and compares fingerprints only for ELK, Dagre and Tiles: Graphviz fingerprints depend on the Graphviz version (local 14.1.4), so they are compared locally only. CI does not run Archi: it would need Archi, jArchi and a display on the runner, and fonts other than the user's, so its baseline would differ anyway.
9. **FDP is a known exception.** It gives different results from run to run (ARCHITECTURE Known gap 16). The checks list it as an exception (rule checks run, fingerprints are skipped) until the gap is fixed, so it is no longer noise that has to be filtered by eye.
10. **The large view stays out of the baseline.** It would make every Archi run slower and the model file large; the Node checks and one timed Archi CLI run cover it.

## What is tested

### Test data

`Scripts/View/test/model/view-test.archimate`, built by `test/build_test_model.ajs`. Test presets: `presets/Test/baseline/` (`baseline`, `AlgoTwopi`, `counters`).

| View | Holds | Tests | Status |
|---|---|---|---|
| `1 Nesting` | Composition and aggregation chains, an element with two parents, a nesting cycle, a reversed type, one self-loop, cross-container relations, a note and a group | Nesting, containers, writer parenthood | Exists |
| `2 Edited` | View 1 generated, then edited: a moved visual, a user connection, an added element, a note, a diagram-block | Modify actions, managed occurrences, keep / move / remove | Exists |
| `3 Network` | 20 elements in two unconnected parts, labelled relations, no nesting | Flat layouts, labels, Graphviz | Exists |
| `4 Parts` | 8–12 unconnected parts of different shape and size (two chains, a small tree, a star, a cycle, four single elements); self-loops: two on one element, one labelled, one on a single element | *Aspect ratio* and *Max width* (view 3 allows two arrangements only, S4); self-loops per algorithm | New |
| `5 Large` | 300 elements in three nesting levels, a few hundred relations, self-loops on a nested element and on a container; generated from a fixed seed | Speed and scale (SPEC § 13); rule checks at size | New, not in the baseline |

**Self-loops** are tested on three points: an algorithm without self-loop support removes them from the view and logs it; one with support writes a loop whose bendpoints lie outside the element (else Archi draws it inside); a loop the engine does not route gets the writer's corner loop. In the SVG: the loop's line runs outside the element's rectangle and its end symbol sits on the border. Today only view 1's single loop and the manual `test/_test_self_loops.ajs` cover them.

### Checks

Who is needed: **script** = pass / fail without judgement; **LLM** = the agent judges; **user** = a person.

| Check | Script | What it covers | Who is needed | Status |
|---|---|---|---|---|
| Types | `npm run typecheck` | Typed contracts, jArchi API use | Script | Exists (CI) |
| Unit | `rel_filter_test.js`, `nesting_test.js`, `compose_test.js`, `counts_test.js`, `tiles_test.js` | Conditions, nesting, object set, counts, Tiles | Script | Exists (CI runs two) |
| Consistency | `check_registry.js`, `gen_docs_tables.js` | Registry, defaults, dialog widgets, generated doc tables | Script | Exists |
| Write plans | `write_plans.js --check` | Every preset × algorithm × view × action against the expected file | Script; LLM only to explain a difference | Exists; `--check` and the expected file new |
| Variants | `write_plans.js --variants --check` | Every option where the dialog offers it | Script; LLM to explain a difference | New |
| Rule checks | `layout_checks.js` | Sizes unchanged (SPEC rule 1); no sibling overlap; children inside their container with *Padding*; same input twice gives the same result (rule 12); view-size target met or logged as not reached; line ends on the element border, label point on the line; last segment long enough for the end symbol (the 50 % zoom case, test case 13); self-loops as above | Script | New |
| Layout regression | `tools/compare-layouts.js --check` | Layout results per preset × algorithm against the expected file | Script | Exists; `--check` new |
| Scale | `layout_checks.js --large` | View 5: rule checks and time per algorithm in Node | Script; limit per T2 | New |
| Baseline | `archi_cli.sh run_baseline.ajs`, then `compare-views.js` | The writer as Archi applies it (`view_writer.js`, the only part without a Node test) | Script runs and compares; LLM judges a difference against what the change meant | Exists, run by the user today |
| Console | `console_checks.js` on the CLI output | Count promise per run (predicted totals = written objects); no error; ⚠ lines against an expected list; Archi run times | Script | New |
| Rendering | `render_views.ajs` (CLI) writes an SVG per baseline view; `svg_checks.js` | No text cut off by its clip rectangle (element names, connection labels); no element clipped by its container; end symbol in line with the last segment and on the border; no connection label over an element or another label; no line through an element it does not connect | Script | New |
| Readability | PNG of a named view (`render_views.ajs --png`) | Whether a view reads well: balance, avoidable crossings, spacing | LLM, only when a change is about this; user when the agent is unsure | New |
| Dialog | — | SWT dialog on GTK: controls, greying, counts while editing | User | Exists |
| Archi time | `archi_cli.sh` on view 5 with the default preset; `console_checks.js` reads the timing line | How long Archi freezes (GraalJS and the layout process, not Node's time) | Script; user decides the budget (T2) | New |

## Who does what

### Agent

- **Writes** the checks, variants, test views and fixes (LLM).
- **Runs** every script above after each change in its scope, including the Archi CLI runs (no LLM: the scripts decide).
- **Judges** where a script cannot (LLM): a fingerprint or baseline difference against what the change was meant to do; readability, only when a change is about it.
- **Probes** a question with a scratch script (LLM writes it, script runs it). When a probe finds something, it becomes a variant or a rule check, so the next run covers it without an LLM.

### User

| What | Why it needs a person | When |
|---|---|---|
| Decide and approve | Behaviour, rules and docs are the user's call (`Scripts/View/AGENTS.md` § Order of change) | Each change |
| Try a changed control in the dialog | The SWT dialog is interactive; no script operates it | Only after a dialog change |
| Close the test model in Archi | The agent replaces the repo's model file only for a new baseline, and Archi must not hold an older copy open | Only when a new baseline is committed, and only if it is open |
| Look at a named view | Readability, when the agent is unsure | Rarely |

A change that touches only an engine adapter, `defs.js` options, the writer or docs needs nothing from the user but the approval.

## Steps

Only what is added; each step is one commit after the user's approval.

| # | Step | Expected output | Who is needed | Model, effort |
|---|---|---|---|---|
| 1 | Expected files: `Scripts/View/test/expected/` with the write-plan and layout lines; `--check` / `--write` in `write_plans.js` and `compare-layouts.js`; FDP as exception; the two old plan files removed, their references updated (ARCHITECTURE, `ai/repo-guide.md`, `tools/compare-layouts.js`) | Same lines as today; `--check` exit 0 | Agent | Sonnet, high |
| 2 | Archi CLI: `Scripts/View/tools/archi_cli.sh` (Archi path from `ARCHI_HOME`, default `~/Tools/Archi`; the display settings above; a scratch copy of the model; output to a file); no "open in the UI" in a CLI run; `console_checks.js` (count promise, errors, ⚠, timing) | The baseline through the CLI equal to the committed one; console check passes, or shows where predicted and written differ | Agent | Opus, high |
| 3 | `layout_checks.js` with the rules, self-loops included; run on presets × algorithms × views 1–3 | A list of violations, ideally empty; a real bug gets its own fix after approval | Agent; user approves fixes | Opus, high |
| 4 | Variants in `write_plans.js` (only where the option is active) with the rule checks | Expected lines for the variants; any rule failures listed | Agent | Sonnet, high |
| 5 | `render_views.ajs` (SVG, `--png` on request) and `svg_checks.js`; run on the baseline | SVG checks pass on the baseline, or name what Archi draws wrong | Agent | Opus, high |
| 6 | Views `4 Parts` and `5 Large` in `build_test_model.ajs`, built through the CLI; baseline gets two runs on view 4 (Layered: engine loop; Grid: loop removed); `layout_checks.js --large` with timing; one Archi time run on view 5 | Model with views 4 and 5; views 1–3 and the old baseline runs unchanged; expected files extended; times per algorithm | Agent; user decides T1, T2, closes the test model if open | Opus, high |
| 7 | CI: unit, consistency, rule checks (Graphviz from the runner's packages), fingerprints without Graphviz | A green run on GitHub | Agent; user decides T3 | Sonnet, medium |
| 8 | Docs: ARCHITECTURE § Development and testing (levels, test data, Known gap 7), skill `view-baseline` (the agent runs it through the CLI) | Docs after approval | Agent | Sonnet, medium |

## Decisions for the user

| # | Subject | Options |
|---|---|---|
| T1 | Size of `5 Large` | **300** (decided) |
| T2 | Time on view 5 | **Log only** (decided) |
| T3 | CI | **As in choice 8** (decided) |

## Progress log

- Step 1: `Scripts/View/test/expected/write-plans.txt` (378 lines) and `layouts.txt` (126 lines: views 1–3 × the three baseline presets × 14 algorithms) from HEAD 571e149; `tools/expected.js` holds the fingerprint, the FDP exception and `--check` / `--write`. The lines in the two old plan files were stale (151 of 351 write-plan lines differed from HEAD after the refactors since; Tiles was missing); the last three commits account for 7 changed lines (4 Graphviz label, 3 label points), as meant. FDP changes its fingerprint from run to run with the same counts, so its lines keep the counts only. Two runs each, in-process and in a layout process: `--check` exit 0. References in ARCHITECTURE, `ai/repo-guide.md`, skill `view-baseline`; *digest* → *fingerprint* there.

## Handoff

- Done: steps up to the last one in the progress log.
- Next: the next step in the table.
- User: nothing.
