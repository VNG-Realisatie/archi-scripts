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
- Step 2: `tools/archi_cli.sh` (5 s for the baseline; `compare-views.js` on its copy: `Views/Baseline` 12 views and `Views/Test` 3 views the same as committed). The view opener is skipped when Archi runs without a window (`PlatformUI.isWorkbenchRunning()`), so no "Failed to open" lines. The CLI prints `console.error` like `console.log`; `run_baseline.ajs` replaces `console` in a CLI run so error lines start with `ERROR: ` (replacing only `console.error` has no effect). The "6 nestings" against "5 nestings" was the writer's log, not the promise: it subtracted every laid-out connection, the note's diagram connection included, and counted that connection as a diagram object; "Objects on view" now prints the five fields of "Total to view". `console_checks.js`: count promise on all 12 written views equal, no errors, the two "Warning:" lines of One view each in `test/expected/run_baseline-warnings.txt`; a changed count, an error line and a changed warning each give exit 1 (edited copy of the console).
- Step 3: `tools/layout_checks.js`, 378 runs in 9 s (in-process). Rules on the layout result (size, overlap, outside, padding, same, view size) and on the lines as the writer will draw them (end room, label, self-loop). Two refinements after judging the first output: a Middle label is compared with the nearest point of the drawn line, not the engine's label point (Archi's chopbox ends make the line slope away from ELK's port, 3–10 px), and a line without bendpoints is not checked (Archi's middle is the label's place); a short end segment that runs on within 10° of the next is not a violation (collinear label points). Mutation test: ELK container padding 0 → 288 padding violations. The writer's corner loop is not used by any run of views 1–3 (every engine that keeps self-loops routes them): view 4 must reach it. Two findings, in `test/expected/layout-violations.txt` (`--check` passes on them) until fixed: F1 and F2 below.
- Step 4: `tools/variants.js`: per algorithm every offered value of its select options, plus no padding, aspect ratio 0.5 and 3, max width 400, the booleans flipped, every Sort and Circles value, each only where the algorithm offers the option, on top of `baseline.json` as the algorithm runs it (an unoffered value already replaced). 336 runs (Radial offers none). `write_plans.js --variants` → `test/expected/write-plans-variants.txt`, ending with the 17 variants whose plan equals the base on views 1–3 ("no effect", hard rule 10); `layout_checks.js --variants` → `layout-violations-variants.txt`. Judged: *Same width per level* widens leaves by design, so the size rule checks only that widths grow; a label point in the end room is not checked (the writer keeps it free). "No effect" judged: Layered *Aspect ratio* 3 is S4; *Container algorithm* (Tree, Grid, Pack) and Dagre *Cycles* / *Ranking* cannot show on views 1–3 (no container with several children, no cycle): views 4–5 must; *Max width* 800 was wider than the Grid and Pack views, now 400. Findings F3–F5 below; F2 also shows in FDP (a port 66 px inside the container).
- Step 5: `test/render_views.ajs` (SVG of every view under `Views/Baseline` into `<model folder>/render/` with `index.json`; `RENDER_PNG=1` adds PNGs) and `tools/svg_checks.js`: text cut, clipped, end symbol, label over, line through. Element boxes come from the model and are matched to the SVG's rects (Archi draws with a 10 px margin); the line layer starts at the first drawing clipped outside every element. Learned from Archi's SVG: an open arrowhead is a 3-point path after its line, not a polygon; a line ends up to 3 px inside the box of a rounded figure (Archi anchors on the outline); Archi aims an end symbol along the last segment alone, so the rule compares it with the last 20 px of line (a short stub at an angle is what turns it). `test/svg_checks_probe.ajs` builds one case of each defect in a copy; all six are found (`test/expected/svg-probe.txt`). `archi_cli.sh` now writes `<script>.console.txt` (a second script on the same copy kept overwriting the first's console) and uses a model already in the out dir as it is. Baseline: 12 views, 2 violations, one finding (F6, `svg-violations.txt`).
- Step 6: views `4 Parts` (33 elements, 29 relations, 10 parts, 3 self-loops, a container with 4 children, a cycle, a late source) and `5 Large` (300 elements, 442 relations, seed 20261102) in `test/test_model_views.js`, used by `build_test_model.ajs`. A rebuild gives every object a new id (every expected line and baseline view changes), so the two views were added to the committed model by a one-off CLI run on a copy: `compare-views.js` shows views 1–3 and the 12 baseline views unchanged. `run_baseline.ajs`: + 2 runs on view 4 (Layered, Grid), 14 views. Expected files regenerated: only additions for views 1–3 (126 write-plan lines, 42 layout lines, view 4 in the variants; the 17 "no effect on views 1–3" lines became "1–4": view 4 gives Layered *Aspect ratio* and Grid / Pack *Container algorithm* their effect). New rule `count` in `layout_checks.js` (New view: the plan writes the connections the totals promise). `layout_checks.js --large` (Node, s): Layered 4.1, Stress 2.2, Dagre 1.6, Circo 15.7, the rest ≤ 0.4. `test/run_large.ajs` in Archi: 4.6 s for a New view of view 5 with `baseline.json`, count promise equal. `test/cli_console.js` holds the error marking (two users). Findings F7–F10 below. Still without effect on views 1–4: Dagre *Ranking* Top-aligned (= `tight-tree`, which equals network simplex on graphs this simple) and *Cycles* Greedy, Tree *Container algorithm* Pack: test data or option, open. The writer's corner loop is still not reached by any run (the mutation test does not see it): every engine that keeps loops routes them; F1's fix makes Dot Polyline reach it.
- Step 7: `.github/workflows/check.yml`: typecheck, the five unit tests, consistency, fingerprints and known violations `--without-graphviz` (runs of Graphviz algorithms skipped, their lines left out), Graphviz rule checks reported only (`continue-on-error`) while F1 and F2 are open; then blocking. Simulated locally with only `node` on the PATH: all exit 0.

## Findings for the user

| # | Finding | Cause | Proposed fix |
|---|---|---|---|
| F1 | Dot, Polyline (`AlgoTwopi`), views 1 and 2: the self-loop is written without bendpoints, so Archi draws it inside the element | Graphviz's loop has one bendpoint 11 px above the element; the writer drops bendpoints within `CONNECTION_END_ROOM` (12 px) of the element, none is left, and the line goes out without any | `write_plan._bendpoints`: a self-loop left without bendpoints, after clearing or as a straight line, gets the writer's corner loop, as one the engine did not route |
| F2 | Dot, Orthogonal (`baseline`, `counters`), views 1 and 2: *reads* from a container starts with a 7 px stub at 18° before its horizontal run; the access arrowhead sits on that stub | For a connection to a container Graphviz routes from the container's own node inside its cluster: the port lies 20 px (*Padding*) inside the container, and the one bendpoint 7 px outside its border. The writer keeps orthogonal bendpoints as they are | `graphviz.js`: clip a route that starts or ends inside a container at the container's border (drop the points inside, put the port on the border), so the writer gets the line Archi draws |
| F3 | *Natural* label has no effect in any Graphviz algorithm (Dot, Neato, SFDP, Twopi, Circo; FDP too, hidden by its noise): the plan equals *Middle* | The adapter reads the edge's `lp`; the edges carry their text as `xlabel`, whose position Graphviz writes as `xlp` | `graphviz.js`: read `xlp` |
| F4 | *Aspect ratio* has no effect in Neato and SFDP: `ratio=2.0000` / `0.3333` is in the DOT, the result is the same, and nothing is logged as not reached | Not yet known (likely `overlap=prism`, which runs after the ratio, or `ratio` without `size` in these engines) | Investigate; then make it work, or log it as not reachable, or stop offering it for these two |
| F5 | Layered, direction Down or Up, views 1 and 2: *Handle request*, the element with the self-loop, is 75 px high instead of 60 (SPEC rule 1) | ELK makes room for the self-loop in a vertical layout by enlarging the node | `elk.js`: fix the node size (`elk.nodeSize.constraints` empty / fixed), or route the loop without resizing; check with the self-loop rules |
| F6 | Twopi, Layout only on view 2 (`AlgoTwopi`): the straight line *Domain 1* → *Data Y* runs across *Module A* and *Component A1* (seen in the PNG too) | Not yet known: Graphviz gave one straight route (its polyline should go around elements), or the route came back around them and the writer lost it | Investigate the DOT and the route |
| F7 | Grid and Pack write no connections on a New view, except those inside a container laid out by Layered (view 4: 24 promised, 2 written; views 1–3: 0). *Total to view* promises them all (count promise, SPEC § 6) | The engines place elements only; the writer creates a connection only for an edge in the layout result | Writer: a relation in the layout graph without a result edge is written straight (no bendpoints), as Archi draws it; or, if Grid and Pack are meant to show no connections, the totals say so. Your choice |
| F8 | Radial loses 3 of 21 connections on view 3 (and on views 1, 2, 5) | ELK Radial returns 19 edges of 21; the writer drops one more (*offers*) | With F7's fix the 2 lost in ELK are written straight; the one the writer drops: investigate |
| F9 | Radial, view 5: 39 pairs of elements overlap (30–59 px) | ELK Radial places 300 elements on rings without overlap removal | Overlap removal after Radial (positions only, as Stress's SPOrE) |
| F10 | Dagre, view 5: 6 children outside their container, one 1640 px above it | dagre-cluster-fix with three nesting levels (Known gap 15) | Investigate; may be a reason to leave the fork (Known gap 15) |
| — | Algorithms without self-loops (Tree, Stress, Tiles, Grid, Pack, Radial) still count the removed self-loop in *Total to view* (views 1, 2, 4: one more promised than written) | The totals count it before the algorithm removes it | The totals leave out a self-loop the algorithm does not draw |

## Docs (step 8, approved 2026-11-02, done)

ARCHITECTURE § Development and testing:
- Test levels: *Write plans* gets `--variants` (one option at a time where offered, and the options without effect); *Layout regression* runs on views 1–4. New rows: **Rule checks, Node** (`layout_checks.js [--variants | --large] --check`: the rules and what they cover, known violations in `test/expected/`); **Written views, Archi CLI + Node** replaces the run in Archi: `tools/archi_cli.sh test/run_baseline.ajs`, then `compare-views.js` and `console_checks.js` (count promise, errors, warnings, time); **Rendering, Archi CLI + Node** (`render_views.ajs` + `svg_checks.js`: text cut, clipped, end symbol, label over, line through; `svg_checks_probe.ajs` checks the checks); **Archi time** (`run_large.ajs`, logged). *In Archi* shrinks to the dialog and what is judged by eye (readability).
- The CLI's display settings (why `GDK_BACKEND=x11`), that it runs next to the user's Archi on a copy, and that `console.error` is marked `ERROR: ` there.
- Judging a result: *Archi itself* → the SVG checks and a PNG on request; expected files: `--check` / `--write`, FDP lines counts only.
- Test data: views 4 and 5 (from `test_model_views.js`), the baseline's 14 views, views added to the model without a rebuild keep the ids.
- Known gap 7 rewritten: the count promise is now checked (Node rule `count`, Archi console); CI runs the units, consistency, fingerprints and rule checks without Graphviz; open: the Graphviz rule checks are not blocking in CI (F1, F2), no time budget (T2), the writer's corner loop is reached by no run.
- CI: what it adds over local runs (choice 8), in one line.

Skill `view-baseline`: the agent runs the baseline through `archi_cli.sh` and compares; the user only closes the test model when a new one is committed. `ai/repo-guide.md`: the new tools in the test row.

## Handoff

- Done: steps 1–7 committed (the extended model in the repo; `compare-views.js --head`: only views 4, 5 and the two view-4 baseline runs are new).
- Next: fixes F1–F10 one by one (approved; F7: straight lines), each updating the known violations and, where views change, the baseline.
- User: nothing.
