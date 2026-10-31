# View — layout in Node

## Goal

Run the layout step (`adapter.layout(graph, runProcess)`) in a Node child process instead of in Archi's GraalJS. jArchi 1.12 ships Truffle 24.1.2 without `truffle-runtime`, so GraalJS runs interpreter-only (and jArchi suppresses the warning with `polyglot.engine.WarnInterpreterOnly`). Measured on the GEMMA model, view `Beleidsdomeinen ingedeeld in Iv3`, Tiles, 561 elements: Archi 8.6 s, Node 0.2 s (≈ 40×). The gain applies to every engine (Tiles, ELK, Dagre; Graphviz only for its adapter code), and Archi no longer parses `elk-worker.min.js` per run.

Portability: Node is a system requirement like Graphviz's `dot` (found on the PATH). The repo stays npm-free at runtime (repo hard rule 6); the engines and vendored libraries already run in Node (the harness proves it).

## Facts the design rests on

- `generate_view.plan` makes one engine call: `_getAdapter(engine).layout(graph, runProcess)` (`Scripts/View/lib/generate_view.js:344`). Everything before and after stays in Archi.
- The adapters read only the serialisable part of `LayoutGraph` plus `_parentMap` (Dagre, Tiles). `_parentRels` (holds jArchi relations), `_nesting`, `_occurrenceMap`, `_diagramBlockEnds` (a `Map`) and `_nestingStats` are not read by any adapter.
- `LayoutResult` is plain data (`nodes`, `edges`, `viewWidth`, `viewHeight`).
- Adapters log through `console.log` / `console.error`; those lines must appear in Archi's console in the same order.
- The ProcessRunner contract (`types/layout.d.ts`) already has an Archi runner (`lib/process_runner.js`) and a Node runner (`tools/process_runner_node.js`); Graphviz inside the child uses the Node runner.
- `node_modules/elkjs/index.js` reads its worker through `Java.type` Files/Paths; the harness shims that (`tools/view_harness.js`). The child needs the same shim.

## Decisions for the user

1. **When Node is used.** Recommended: always when `node` is found, so Archi and the Node harness run identical code for every view size. Alternative: only above a node count.
2. **Node not found.** Recommended: lay out in Archi as now, with one log line (`Layout in Archi: 'node' not found on the PATH — install Node for faster layouts`). Alternative: an error, as with Graphviz.
3. **Node path.** Recommended for now: PATH only, as with `dot`. A configurable path (needed on macOS, where Archi does not inherit the shell PATH, and for nvm/fnm installs) is a later step.
4. **Canonical name** (repo hard rule 2), for logs, docs and code: proposed "Node layout"; the log says `Layout in Node` / `Layout in Archi`.

## Steps

1. **Serialise.** A function that returns the layout input: the `LayoutGraph` fields the adapters read, `_parentMap` included, nothing else. Typecheck it as a type (`LayoutInput` in `types/layout.d.ts`) so an adapter that starts reading a new field fails the check instead of silently getting `undefined`.
2. **Child entry** `Scripts/View/tools/layout_node.js`: reads the input JSON from stdin, sets `REPO_ROOT` / `__DIR__` and the elkjs `Java` shim, captures `console.log` / `console.error` into an ordered list, runs the adapter's `layout` with the Node ProcessRunner, writes `{ lines, result }` or `{ lines, error }` as JSON to stdout. Exit code 0 in both cases; a non-zero exit means the child itself crashed (stderr is reported).
3. **Archi side** `Scripts/View/lib/layout_run.js`: `runLayout(graph, engine, runProcess)` — starts `node <repo>/Scripts/View/tools/layout_node.js` through the given ProcessRunner, replays the lines to the console, rethrows an engine error with its own message, returns the result. On `not-found` it runs the adapter in-process (decision 2). Timeout: one constant, generous (e.g. 600 s), with a clear message; Graphviz keeps its own timeout inside the child.
4. **Wire in** `generate_view.plan`: the engine call becomes `runLayout(...)`. The harness passes the Node ProcessRunner, so `view_harness.js` and `compare-layouts.js` exercise the same path; an in-process switch stays for debugging an adapter.
5. **Timing.** The phase line keeps `layout`; the Node layout logs its own line: total ms and the part spent starting the process.
6. **Typecheck.** `layout_run.js` in `jsconfig.json` (it is in `lib/`); the child entry is under `tools/`, which is not checked (types/README.md), same as `process_runner_node.js`. `npm run typecheck` at exit 0.

## Verification

1. **Node, same result.** `node tools/compare-layouts.js` on the test model, all baseline presets × algorithms: digests via Node layout equal the in-process digests (same V8 both ways, so they must be identical).
2. **Archi baseline** (skill `view-baseline`): the user runs `run_baseline.ajs`; the layouts now come from V8 instead of GraalJS. Expected identical; any difference can only come from floating-point `Math` functions that differ between engines — judged per case, not accepted blindly.
3. **Speed.** The user reruns `Beleidsdomeinen ingedeeld in Iv3` in Archi; expected layout ≈ 0.2 s plus process start, instead of 8.6 s.
4. **Fallback.** Run once with `node` not on the PATH (e.g. start Archi with a PATH without it): the layout runs in Archi with the log line.
5. **Errors.** A Graphviz algorithm with `dot` missing: the same message as now reaches the console.

## Docs (after the user's approval, `Scripts/View/AGENTS.md` § Order of change)

- `docs/ARCHITECTURE.md`: the decision (why: interpreter-only GraalJS, measurement) and the realisation (input subset, child protocol, fallback) under the engines subject.
- `docs/reference/engines.md`: where the layout runs, the log lines.
- `Scripts/View/README.md` § requirements: Node (current LTS) recommended for large views, next to Graphviz.
- SPEC: technology-free; only if the user wants a rule "the result does not depend on where the layout runs".

## Out of scope

- The harness/Archi size difference seen in the measurement (harness 3760–4070 × 5030 px, Archi 2190 × 2882 px for the same view and preset): separate investigation (skill `view-testing`).
- JIT in jArchi (feature request to jArchi), native Java ELK.

## Follow-ups found in Archi (2026-10-31)

- **Stress** (agreed, done): ELK Stress starts from a full ELK Force layout (300 iterations, ~25 of 29 s on 561 elements) and SPOrE runs up to 64 iterations (~9 s). Adapter defaults `elk.force.iterations` 30 and `elk.overlapRemoval.maxIterations` 16: 38 s → 6.8 s, 2 element pairs left overlapping. Only the Stress digests change.
- **Orphaned process** (agreed, done): a Node layout whose Archi was closed or killed went on computing (one ran 9 h 47 min). `node_layout_run.js` runs the layout in a worker thread; the main thread checks the parent every second and exits when it is gone. Tested: the process stopped 0.6 s after its parent.
- **Time limit** (agreed, done): 600 → 120 s; Archi waits on its UI thread.
- **Tiles with many siblings** (agreed, built: `FULL_SEARCH_MAX` 48, `CHUNK_SIZE` 24, `chunksOf` in `engines/tiles.js`; test views and the nested Iv3 view unchanged, 561 flat elements 1.0 s; Tiles tests pass). Also fixed: `node_layout_run.js` exits only once stdout is written (a pipe cut the output at 64 KB): `buildTable` tries every split of every run, ~n⁴ (50 → 0.8 s, 100 → 21 s, 150 → 106 s, 561 ≈ 6 h). Happens after Stress + Layout only (the view is flat then, which is intended). Proposal: a run of more than 48 tiles is cut into consecutive blocks of at most 24; each block is tiled as now, then the blocks are tiled as now (a block is transparent: no node, no padding). Prototype (`scratchpad/tiles_blocked48.js`): 561 flat elements 0.97 s, fill 62 % vs 64–65 % exact (measured up to 100); the nested Iv3 view (max 41 children) and the test views unchanged. One log line when blocks are used.

## Handoff

Finished 2026-10-31, approved by the user. In Archi: Tiles Iv3 layout 8.6 s → 0.7 s, flat 561 Tiles 1.2 s. Archi baseline: positions all the same; `2 Edited` expand_view / layout_only differ only in a written default font, from the appearance reset of commits `ea00aaf` / `6b7be22` after the baseline (`deb432c`): the baseline model is updated in a commit of its own. Stress is not in the baseline matrix (checked by the layout digests only). Docs: ARCHITECTURE (Context, Runtimes, Performance, ELK, Tiles, Risks), `reference/engines.md`, README, `graaljs-java.md`, generated tables.

Earlier log: decisions 1–4 taken as recommended. Done: `lib/node_layout.js` (Archi side: field subset `ADAPTER_FIELDS`, start, replay, fallback), `tools/node_layout_run.js` (process side), `generate_view.js` (`ENGINE_MODULE` table, engine call through `NodeLayout.layout`). Deviations from the steps: no `LayoutInput` type (the field list is `ADAPTER_FIELDS`); no in-process switch in the harness. Verification 1 done: `compare-layouts.js` (3 test views × baseline presets × algorithms, 126 lines) and `write_plans.js` (378 lines) identical to before; the fallback (no `node` on the PATH) and the Graphviz error (no `dot`) checked in Node; typecheck exit 0. Cost: `write_plans.js` 5.5 s → 52 s (one Node process per layout). Next: the user runs the speed check and the Archi baseline (verification 2–3), then approves; then docs and one commit.
