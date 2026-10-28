# ELK adapter size analysis

Why `Scripts/View/lib/engines/elk.js` is 1730 lines and what to simplify rather than split. Findings and proposed steps; no code change before approval. Todo of `plan/view-testability-readability-refactor.md`; base commit 7309335.

## Answer in short

- About a third is not code: 564 comment and JSDoc lines (257 of them type annotations and casts) and 118 blank lines. About 1050 lines are code.
- About 400 code lines do what ELK cannot and are documented decisions or named exceptions (SPEC rule 18): view-size search, Tree layer distance and curved routing, Radial spanning tree and second run, hierarchical ports, label boxes, spline sampling, jog straightening. They stay; some can be shorter.
- About 250 lines are bookkeeping, duplication and dead code: the ELK graph is built by mutating shared node objects (so it must be reset between runs), engine options are assembled twice, child sorting duplicates `engine-utils.sortedNodes`, the parameter executor duplicates `applyParams`, a measure-only overload, unused parameters and fields. These can go without a layout change.
- *Same width per level* runs ELK twice, but the first run is not needed (measured below).
- *Snap columns to grid* (170 lines with its comment) is adapter placement that the SPEC rules forbid; a decision is needed before anything else is done with it.

Expected result: about 1730 → 1280 lines in `elk.js` (snap columns moved to `engine-utils`, D1).

## Where the lines go

| Lines | Part | Verdict |
|---|---|---|
| 1–60 | Header, requires, typedefs | Typedefs shrink with the dead fields (F6) |
| 61–275 | Parameter mapping: `DEFAULT_ELK_PARAMS`, mappers, `PARAM_MAPPING`, `_mapParamsScoped` | Executor duplicates `applyParams` (F4); one dead mapping (F5); commented-out options |
| 276–304 | `_loadELK`, `layout` | Keep |
| 305–407 | View size: `_fitViewSize` | Needed (C1); can be shorter |
| 408–666 | `_layoutOnce` (259 lines) | Every phase inline; options assembled twice (F2); two-pass block (C2) |
| 667–692 | `_labelBox` | Keep (Reserve label space) |
| 693–1075 | Graph building: `_buildELKGraph`, Radial, sorting, `_placeEdges` | Mutating build (F1); sorting duplicates `sortedNodes` (F3) |
| 1076–1513 | Result extraction: spline sampling, node and edge collection, Tree post-passes, jogs, label point | Needed; Bézier and label point repeated in other adapters (C4, F7) |
| 1514–1557 | Two-pass helpers | Go with C2 and F1 |
| 1558–1730 | `_snapColumnsToGrid` | Decision D1 |

## The five candidates of the Todo

For each: still needed with the current ELK options (hard rule 10), does an ELK option replace it, is it duplicated elsewhere.

### C1. View-size search (`_fitViewSize`, `_layoutOnce` 259 lines)

- **Needed.** ELK has no width bound for nested layouts; `rectpacking.widthApproximation.targetWidth` is ignored under `SEPARATE_CHILDREN` and top-down layout scales (forbidden, rule 1). `elk.aspectRatio` in every scope is the only lever (ARCHITECTURE § ELK › View size). Not duplicated: Graphviz passes `ratio` and has no max width.
- **Measured** (probe on the three test views, aspect ratio 0 / 0.5 / 1 / 3): Grid, Pack and Stress respond; Tree responds on views 1–2.
- **Radial never responds**: the same layout for every ratio on all three views, and the console says "layout does not respond". The bundled elkjs declares no `elk.aspectRatio` for `radial`, and `PARAM_MAPPING.Radial` maps none, yet `defs.js` offers *Aspect ratio* for Radial. That breaks hard rule 10 (an option has a visible effect in every algorithm that offers it, else it is disabled). See D2.
- **Shorter:**
  - The `measureOnly` overload (17 lines of `@overload` JSDoc and a union return type) can go. `_layoutOnce` takes a `quiet` flag, and `_fitViewSize` measures the bounding box of `result.nodes` itself. Measure runs then also collect edges, which is cheap next to an ELK run.
  - The two searches (max width, aspect ratio) are both geometric bisections on *k* with the same run limit. One `_bisect(lo, hi, measure, isBelow)` serves both, keeping each target's own "best" rule. Optional, about 15 lines.
- `_layoutOnce` itself is long because every phase is inline. After F1, F2 and C2 it becomes a sequence of calls: options → ELK graph → run(s) → result. That is a split *within* the file, as the Todo asks.

### C2. Two-pass helpers (`_resetNodesForPass2`) and the Radial and Stress second runs

- **Same width per level: the first ELK run is not needed.** `alignWidthsByLevel` uses the rendered widths only for its anchor, the narrowest box at the deepest level, and a box at the deepest level is always a leaf. Containers get *W[L]* as a minimum size that ELK applies in the final run. ELK does not change a leaf's width, so the anchor is the narrowest input width.
- **Measured:** Layered, Tree, Grid and Pack × views 1–2 × Right / Down, with `baseline.json`. No leaf's rendered width differs from its input width, and targets computed from input widths alone equal the current targets in every case.
- **Proposal:** compute the targets from the layout graph and run ELK once. This drops the pass-1 build, `_collectRenderedWidths` and `_resetNodesForPass2` (about 55 lines), and halves the layout time with the option on (also inside every view-size measure run).
- **Unused code in `engine-utils.alignWidthsByLevel`:** `subtreeDepth`, `isContainer` and `nameOf` are never used.
- **Docs follow:** `reference/selection-nesting.md` § Same width per level says "It needs each container's natural width, so a first sizing pass measures it". The formula never uses a container's width. ARCHITECTURE § ELK says "runs ELK twice".
- **Radial second run: needed.** It is a named exception (SPEC rule 18). `elk.radial.radius` from the dialog has the same flaw (ARCHITECTURE § ELK › Radial rings). The bundled elkjs has no other radial option that keeps deeper rings outside the first. 49 lines, keep.
- **Stress second run (`sporeOverlap`): needed.** It is ELK's own algorithm, inside the rule, and only 6 lines. Keep.

### C3. `_snapColumnsToGrid` (145 lines)

- **No ELK option** does it: `box` and `rectpacking` pack each container on its own and have no grid shared across containers. **Not ELK-specific:** it works on `LayoutResultNode`s only, so it is an engine-independent pass sitting in the ELK adapter.
- **It conflicts with three rules:**
  - Hard rule 10 / SPEC rule 18: it places elements itself, and it is not in rule 18's list of accepted exceptions.
  - Rule 2 (position spread only): it starts with tight gaps, `max(spacing, need − 2·padding)`, which is tighter than ELK's gap between leaves in sibling containers. So it compresses first and then widens where containers collide.
  - Rule 18's own reason ("so the algorithms keep their own character"): with the option on, Grid and Pack both become the same column grid.
- SPEC § Layout (line 232) accepts it as a refinement that "only positions", so the SPEC contradicts itself. See D1.

### C4. Spline sampling (`_sampleSplineSection`) and `_straightenJogs`

- **Spline sampling: needed.** Archi draws polylines, and ELK returns Bézier control points with clamped end copies. No ELK option returns sample points.
- **The cubic Bézier formula is written three times:** `_sampleSplineSection`, the inline curve in `_routeTreeEdges`, and `graphviz.js _flattenSpline`. Each caller samples differently (ELK: `j/(n+1)` per segment; Graphviz: `k/n` plus the knots). A shared `cubicPoint(p0, p1, p2, p3, t)` in `engine-utils` removes the duplicated formula and changes no output.
- **Unused parameters:** `_sampleSplineSection`'s `offsetX` / `offsetY` are always 0 (the sections are already absolute).
- **`_straightenJogs`: needed.** The ELK option that could replace it, `elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default = PORT_POSITION`, was measured:
  - On views 1–2 (nested) ELK throws `IllegalStateException: NEdge must have a source and target NNode specified` in every combination tried (both presets × Orthogonal / Polyline × both connection modes).
  - On view 3 it adds a jog (0 → 1) instead of removing one.
- **Measured without straightening:** jogs under 5 px occur only with Orthogonal routing (2 per view on views 1–2 with `test-preset.json`; 0 with Polyline). Not duplicated elsewhere. Keep.

### C5. Tree-edge routing (`_routeTreeEdges`, `_narrowTreeBoxes`, `_clampEndsToTreeBoxes`)

- **Needed: named exceptions** (SPEC rule 18: "Tree's layer distance and curved routing"). The bundled elkjs declares only these `mrtree` options: `compaction`, `edgeEndTextureLength`, `edgeRoutingMode`, `positionConstraint`, `searchOrder`, `treeLevel`, `weighting`. That gives no spacing between levels apart from `spacing.nodeNode`, and no orthogonal or spline routing.
- **Duplicated:** only the Bézier formula (C4) and the label point (F7).
- **Small cleanup:** `_routeTreeEdges` builds `nameById` only to pass a name to `_computeLabelPoint`, which never uses it (F6).

## Further findings (not in the Todo)

- **F1. Mutating graph build.** `_buildELKGraph` changes the shared `nodeMap` objects: it attaches children, deletes container sizes, sets `layoutOptions`, and `_placeEdges` clears `edges` / `ports`. ELK then writes `x` / `y` into the same objects, and it also extends the root `layoutOptions` in place. That is why there is a reset between passes, a duplicate guard in `_attachChildren`, and a rebuild for the Radial second run. **Proposal:** build fresh ELK objects from the layout graph on each run (a pure `graph + options → ElkRoot` function). The reset, the guard and the clearing go, and a second run is just another call.
- **F2. Engine options assembled twice.** `_layoutOnce` and `_buildELKGraph` repeat the same pieces:
  - the merge of `DEFAULT_ELK_PARAMS` with `engineParams.ELK`, word for word;
  - the `portConstraints` delete;
  - `_isVertical` (three times), `containerAlgoId` (also in the config log), `hierarchyMode`, and the *Reserve label space* override (once per scope).

  **Proposal:** one `_engineOptions(graph)` → `{ root, container, node, hierarchyMode, containerAlgoId, edgeMode, vertical }`, used by the build and by the config log.
- **F3. Child sorting duplicates `engine-utils.sortedNodes`.** `_sortNodeChildren` + `_collectRootChildren` apply the same rule that Dagre gets from `sortedNodes`: containers first, leaves inside a container by type and name, leaves outside containers in input order, containers sorted only with *Sort containers*. **Proposal:** attach children in `sortedNodes` order and drop both functions (about 35 lines). Equal order is to be confirmed by identical digests.
- **F4. `_mapParamsScoped` duplicates `EngineUtils.applyParams`.** It is the same loop, with one extra key level. **Proposal:** `applyParams(alg, opts, ROOT_MAPPING)` and `applyParams(alg, opts, CONTAINER_MAPPING)`.
- **F5. Merge order hides one mapping.** `DEFAULT_ELK_PARAMS` is merged *after* the GUI mapping (root, containers and leaves). Its `elk.spacing.nodeSelfLoop: 40` therefore always overwrites `_LAYERED_CONN_ELEM_SPACING`'s `nodeSelfLoop = connectionElementSpacing`; the comment in `DEFAULT_ELK_PARAMS` warns against exactly that. ARCHITECTURE § Options across engines states the order as engine defaults → GUI → `engineParams.<Engine>`. The tooltip of *Distance to element* does not mention self-loops. **Proposal:** drop `nodeSelfLoop` from the mapping (keeps today's layouts) and merge in the documented order, so the clash cannot come back. No other key appears in both.
- **F6. Dead code and impossible cases.**
  - `ElkWorkEdge._isStraight` is never set.
  - `_computeLabelPoint`'s `relName` is unused, and its `offsetX` / `offsetY` are always 0.
  - "container not in resultNodes" cannot happen.
  - The string throw for an unknown algorithm cannot happen, because `validatePreset` is the boundary (it is also one of the string throws listed under Known gap M1).
  - `flag = bad ? … : ""` comes after `if (!bad) continue`.
  - There are commented-out alternatives in `_CONN_LABEL_SPACING` and Pack.
  - The `MIN_NODE_SIZE` comment refers to `whiteSpaceElimination`, which is no longer used; the guard itself stays, as a boundary to an external engine.
- **F7. Label point repeated in Dagre.** `_computeLabelPoint` (ELK) and `dagre.js` lines 212–226 implement the same *Source / Target / Middle* rule. **Proposal:** one `labelPoint(start, end, bendpoints, position)` in `engine-utils`. Graphviz differs (side finding S2).
- **F8. `portConstraints` silently removed.** For Up / Down the adapter deletes `org.eclipse.elk.portConstraints` from a preset's `engineParams.ELK`, so an expert override is ignored without notice ("do not silently ignore configuration"). The only preset that sets it, `presets/Bedrijfsobjecten/Bedrijfsobjectmodel.json` (`FIXED_SIDE`), uses direction Right, so removing the delete changes no existing run. See D3.

## Decisions for the user

| # | Subject | Decision |
|---|---|---|
| D1 | *Snap columns to grid* (C3) | User, 2026-10-28: move it unchanged to `engine-utils` as a `LayoutResult` pass for now; the user retests the option and decides later whether it stays (rule 18 / rule 2 conflict stays open until then). |
| D2 | *Aspect ratio* for Radial (C1) | User, 2026-10-28: disable it for Radial (`defs.js` `activeParams`; generated tables). |
| D3 | `portConstraints` delete (F8) | User, 2026-10-28: option (a), remove the delete: the preset's setting always applies. Principle (user): never silently ignore a setting; signal when a setting should be removed or changed. That principle reaches beyond ELK: § Settings outside the dialog. |

## Steps

Each step is one commit and changes no layout unless stated. Checks for every step:

- `npm run typecheck` at exit 0;
- `rel_filter_test`, `nesting_test`, `compose_test`, `counts_test` and `check_registry` pass;
- `node Scripts/View/tools/write_plans.js` gives the same output as the last digests in `plan/view-testability-baseline-write-plans.md`;
- `node tools/compare-layouts.js` on views 1–3 gives the same output as HEAD;
- Archi baseline (skill `view-baseline`) once at the end, or after any step that changes output.

| # | Step | Expected output | Model, effort |
|---|---|---|---|
| 1 | Inside `elk.js`: dead code and comments (F6), `nodeSelfLoop` mapping and merge order (F5), options once (F2), executor via `applyParams` (F4), sorting via `sortedNodes` (F3), fresh ELK graph per run (F1), `measureOnly` → `quiet` + bounding box (C1), `_layoutOnce` as a sequence of phase functions, *Same width per level* in one ELK run (C2) | Identical; if an order or a digest changes, stop and report | Opus, high |
| 2 | Shared code and options: `cubicPoint` and `labelPoint` in `engine-utils` (C4, F7) for ELK, Dagre and Graphviz; `_textWidth` → `textWidth` (S3); unused locals in `alignWidthsByLevel`; snap columns moved to `engine-utils` (D1); Radial without *Aspect ratio* (D2); `portConstraints` as decided (D3); docs and generated tables for both steps; Archi baseline | Identical layouts; Radial loses the control | Sonnet, high |
| 3 | Settings outside the dialog (§ Settings outside the dialog, agreed by the user 2026-10-28): one check at the preset boundary with a ⚠ line per unknown key, default value, dialog override or unused ELK option; one table of known keys and defaults per engine; generated table "Settings outside the dialog" in `reference/presets.md` (fix "deep-merged"); then clean the two `Bedrijfsobjecten` presets with the user | Layouts identical; new console lines; preset changes only as the user decides | Opus, high |

Docs follow `Scripts/View/AGENTS.md` § Docs (approval first, docs and code in one commit): step 1's docs (selection-nesting.md § Same width per level, ARCHITECTURE § ELK, § Performance) go with step 1's commit; ARCHITECTURE changes elsewhere only where it names a moved or removed function.

## Side findings

| Where | Finding | Proposal |
|---|---|---|
| S1 `types/layout.d.ts` `LayoutResult.viewWidth` / `viewHeight` | Every adapter computes them; only `tools/compare-layouts.js` reads them (in its digest), not the write plan. ELK's value is also stale after snap columns and the Tree narrowing | Drop from the contract, and from the digest in the same commit (new digest lines) |
| S2 `graphviz.js` `_walkEdges` | Label *Source* / *Target* = first / last bendpoint; ELK and Dagre use the connection's end points. One option, two meanings (hard rule 10) | Decide together with step 5 |
| S3 `engine-utils.js` `_textWidth` | Exported with `_`, used by `elk.js` (convention: an exported function has no `_`) | Rename to `textWidth` in step 5 |
| S4 Layered + *Aspect ratio* | View 3 (two unconnected parts, *Between containers*, no nesting) does not respond at any ratio. ARCHITECTURE explains a non-response only by connection chains or *Crossing containers* | Check why ELK layered's component packing ignores the ratio before claiming the lever for Layered |

## Settings outside the dialog (found 2026-10-28)

The user has no overview of what a preset can set outside the dialog. Inventory:

**Where it is documented.** Only `reference/presets.md` (schema line `engineParams { ELK?, Dagre?, Graphviz?, layout? } // per-engine expert overrides, deep-merged`) and ARCHITECTURE § Options across engines (the merge order). There is no list of keys, defaults or effects. "Deep-merged" is wrong: `validatePreset` passes `engineParams` through as-is (Known gap 4, untyped). Preset-only *params* (`diagramPadding`) do have a generated table (gui.md) and a console line ("Preset values not in dialog").

**Defaults in code that no dialog control shows.**

| Where | Settings | Overridable by |
|---|---|---|
| `elk.js` `DEFAULT_ELK_PARAMS` | `cycleBreaking.strategy` GREEDY, `selfLoopDistribution` EQUALLY, `selfLoopOrdering` SEQUENCED, `crossingMinimization.strategy` LAYER_SWEEP, `greedySwitch.activationThreshold` 0, `thoroughness` 25, `considerModelOrder.strategy` NONE, `feedbackEdges` true, `spacing.nodeSelfLoop` 40 | `engineParams.ELK` (any ELK option id) |
| `elk.js` fixed values | Pack ratio cap 3, compaction iterations 5, `trybox`, label placement CENTER, `portAlignment` CENTER | Some by `engineParams.ELK` (it is merged last), not documented |
| `graphviz.js` | `esep` +24 (ortho) / +8 (curved), `margin=0`, `compound=true`, timeout 60 s | Only `esep` by `engineParams.Graphviz` |
| `dagre.js` `DEFAULT_DAGRE_PARAMS` | empty | `engineParams.Dagre` (any dagre graph option) |
| `defs.js` `LABEL_SIZING_DEFAULTS` | `labelCharWidth` 8, `labelLineHeight` 24, `labelHPadding` 16, `labelVPadding` 8, `labelMinWidth` 60, `labelMinHeight` 30 (`labelMaxLineWidth` is a dialog option) | `engineParams.layout` |
| `defs.js` constants | `CONNECTION_END_CLEARANCE` 25, `CONTAINER_LABEL_CLEARANCE`, `SPLINE_SAMPLE_POINTS` | Not settable |

**Used in the current presets** (all presets, tracked and local): only two, both in `presets/Bedrijfsobjecten/`.

| Preset | Setting | Effect today |
|---|---|---|
| `Bedrijfsobjecten per domein.json` | `ELK`: `cycleBreaking.strategy` GREEDY, `selfLoopDistribution` EQUALLY, `selfLoopOrdering` SEQUENCED, `feedbackEdges` true | Equal to the defaults: no effect, can be removed |
| both | `ELK` `spacing.nodeSelfLoop` 20 | Overrides the default 40 |
| `Bedrijfsobjectmodel.json` | `ELK` `portConstraints` FIXED_SIDE | Applies (direction Right); would be dropped silently for Up / Down (D3) |
| `Bedrijfsobjecten per domein.json` | `Dagre` `acyclicer` greedy | Overrides the dialog's *Cycle breaking* without notice: the dialog shows one value, the run uses another |
| both | `Graphviz` `esep` +20 / +8 | Applies; overrides *Distance to element* without notice |
| `Bedrijfsobjecten per domein.json` | `layout`: six label-sizing keys | Only `labelCharWidth` 9 differs from the default; five can be removed |

**Silently ignored today** (against the user's principle):
- Any `engineParams.Graphviz` key other than `esep`.
- An ELK option id that ELK does not know, or a value it rejects (ELK ignores both; see the comment in `DEFAULT_ELK_PARAMS`).
- An ELK option the chosen algorithm does not declare.
- An unknown `engineParams.layout` key, or an unknown engine name under `engineParams`.
- `portConstraints` for Up / Down (D3).
- An `engineParams` key that overrides a dialog option (Dagre `acyclicer`, Graphviz `esep`, ELK options that the mapping also sets): the run differs from the dialog without a word.

**Proposal (step 3, needs the user's go):**
- One check at the preset boundary (`validatePreset`), per engine, with a console ⚠ line per finding:
  - unknown engine or key → "not used, remove";
  - a value equal to the default → "same as the default, can be removed";
  - a key that overrides a dialog option → "overrides <dialog label>; set it in the dialog";
  - for ELK, an option id the chosen algorithm does not declare → "not used by <algorithm>".
- The known keys and defaults come from one table per engine (the adapter's defaults plus the option ids it allows). The ELK ids can be read from the bundled elkjs's option registry at check time, or listed.
- A generated table "Settings outside the dialog" in `reference/presets.md`, from the same tables, with default and effect per key.
- Then clean the two `Bedrijfsobjecten` presets with the user (which overrides stay).

## Probes used

A scratch script (not committed) ran `view_harness.planView` on `Scripts/View/test/model/view-test.archimate`, views `Views/Test/1 Nesting`, `2 Edited` and `3 Network`, presets `Test/baseline/baseline.json` and `Test/test-preset.json`. It ran three probes:

- Aspect ratio 0 / 0.5 / 1 / 3 per ELK algorithm, comparing layout digests.
- A wrapper around `alignWidthsByLevel` that compares pass-1 widths with input widths and with targets computed from input widths only.
- A copy of `elk.js` whose `_straightenJogs` counts jogs under 5 px and returns the path unchanged; once without and once with `nodeFlexibility.default = PORT_POSITION` through `engineParams.ELK`.

Bundled elkjs option ids were read from `Scripts/node_modules/elkjs/lib/elk-worker.js`.

## Progress

**Step 1 — done, 2026-10-28 (approved by the user; code and docs in one commit).** `elk.js` 1730 → 1530 lines; `engine-utils.js`: `byTypeAndName` without the ELK `_type` / `_name` fallback, `alignWidthsByLevel` takes plain widths (contract text updated).
- Done: F1 (fresh ELK graph per run: `_buildELKGraph` from the layout graph, edges and labels copied per run), F2 (`_engineOptions` once), F3 (`sortedNodes`), F4 (`ROOT_MAPPING` / `CONTAINER_MAPPING` through `applyParams`), F5 (`nodeSelfLoop` out of the mapping; defaults → GUI → `engineParams.ELK`), F6, C1 (`quiet` + `_boundingBox`), C2 (one ELK run; `_boxSizes`), `_layoutOnce` as phases (`_engineOptions`, `_boxSizes`, `_workEdges`, `_runELK`, result passes).
- Checks: typecheck 0; the five test scripts pass; `write_plans.js` = the 351 lines of `plan/view-testability-baseline-write-plans.md`; `compare-layouts.js` on views 1–3 identical to HEAD for the baseline presets, `test-preset.json` and every preset under `presets/`; a scratch matrix (6 ELK algorithms × 3 views × 2 presets × 36 option variants: same width per level with Down / view size / padding 0, sort containers, crossing, four directions, routings, view-size targets, snap, container algorithms, label positions, `engineParams.ELK` / `.layout`) gives 1296 identical digests.
- Log lines changed (not in any digest): no pass-1 lines; the "ELK spacing" line dropped (the options JSON shows the same values); the options JSON is the complete root set; ⚠ lines of measuring runs are silent.
- Found, not fixed (a layout change, needs a decision): Tree layer distance never padded root-level containers (`_flowPad` was set only when children were attached, which they never were at that point), yet `_narrowTreeBoxes` narrows them by layer distance − element distance. With that above 2 × padding children stick out of their container (baseline preset, layer distance 180: 5 children on views 1 and 2; same at HEAD). ARCHITECTURE § ELK › Tree describes the intended padding. The dead `_flowPad` code is removed.
- Docs: `reference/selection-nesting.md` § Same width per level (no sizing pass), SPEC § Adapter contract "between two sizing passes", ARCHITECTURE § ELK (Same width per level: one run) and § Performance (drop "same width per level (two runs)").

**Step 2 — done, 2026-10-28 (approved by the user; code and docs in one commit).** `elk.js` 1530 → 1334 lines; `engine-utils.js` 362 → 546 (snap columns in).
- Done: `cubicPoint` and `labelPoint` in `engine-utils` (ELK `_sampleSplineSection` and `_routeTreeEdges`, Graphviz `_flattenSpline`; ELK and Dagre labels; `_computeLabelPoint` removed; Graphviz keeps its own label rule, S2); `_textWidth` → `textWidth`; `alignWidthsByLevel` without `childrenOf`, `nameOf`, `isContainer`, `subtreeDepth` (items typed `{ id }[]`); `_snapColumnsToGrid` moved unchanged to `engine-utils.snapColumnsToGrid` (D1); Radial without `aspectRatio` in `defs.js` `activeParams` (D2; `effectiveParams` then hands the engine no ratio, so the view-size search is skipped); the `portConstraints` delete removed (D3).
- Checks: typecheck 0; the five test scripts pass; `write_plans.js` identical to HEAD; `compare-layouts.js` on views 1–3 identical to HEAD (130 lines each); a scratch matrix (13 algorithms × 3 views × 2 presets × 24 option variants: label positions, routings, four directions, snap, same width per level, label sizing, containers, view size) gives 1872 identical digests. D3 probe (baseline preset with `portConstraints FIXED_SIDE`): Right identical; Down and Up change, as decided.
- Archi baseline: not run, because no layout changes.
- Docs done: `gen_docs_tables.js --write` (gui.md Aspect ratio row, engines.md capability matrix), `reference/engines.md` § Per-engine view-size (Radial row: aspect ratio not supported), ARCHITECTURE § ELK › View size (Radial has no ratio). No doc names a moved or removed function.

**Step 3 — done, 2026-10-28 (approved by the user; code, docs and presets in one commit).**
- Done: `generate_view.checkEngineParams` at the start of every run (not in `validatePreset`: it also runs when the dialog loads a preset, and console output inside the modal dialog blocks): a block "Settings outside the dialog (engineParams):" with each key that applies (with the default it replaces where known) and a ⚠ line per unknown section or key, not-used key, second key for one ELK option, dialog override or value equal to the dialog or the default. Checked: `layout` (`engine-utils.checkLabelSizing`) and the run's engine (adapter `checkEngineParams`). Per adapter `ENGINE_PARAMS` (ELK: was `DEFAULT_ELK_PARAMS`, now derived from it; Dagre: the 9 graph options dagre reads; Graphviz: `esep`, not used by Dot) and `dialogSettings`; `engine-utils.dialogKeys` (probing the mappers), `settingProblem`; `defs.LABEL_SIZING_EFFECTS`. ELK ids, targets and algorithms from the bundled registry: `metadata()` in `Scripts/node_modules/elkjs/index.js` (the repo's wrapper, kept on an upgrade). `_engineOptions(algorithm, params, elkParams, nesting)` instead of the layout graph. Dagre: the empty `DEFAULT_DAGRE_PARAMS` and the dead inline graph defaults removed.
- Found while checking: ELK's registry declares fewer core options than an algorithm reads (Stress honours `elk.padding` and `elk.aspectRatio` undeclared), so only `elk.<algorithm>.*` options are checked against the algorithm; not detected: `elk.spacing.nodeSelfLoop` with Pack (no self-loops reach ELK). Graphviz docs: `esep` is not used by dot; `ai/graphviz/docs/attributes.md` said "all".
- Presets (user's decisions): *Bedrijfsobjecten per domein*: `engineParams` = `layout.labelCharWidth` 9 only; *Cycles* = Greedy in params (was Dagre `acyclicer` greedy). *Bedrijfsobjectmodel*: ELK `nodeSelfLoop` 20 and `portConstraints` FIXED_SIDE only (two default keys, Graphviz `esep +8`, empty `Dagre` / `layout` removed).
- Checks: typecheck 0; the five test scripts pass; `gen_docs_tables.js` up to date; `write_plans.js` identical to HEAD; `compare-layouts.js` on views 1–3 identical to HEAD for every other preset and the baseline preset under all 13 algorithms; both cleaned presets identical to their old version with HEAD's code (also *per domein* run as Dagre). Their layouts change only under Graphviz force-directed algorithms (`esep` removed), as decided. Archi baseline not run (no layout change); the console block is seen only in Archi (Node runs `plan()`).
- Docs: `reference/presets.md` (schema line, § Settings outside the dialog with the generated table `engine-params`), SPEC § 7 (Settings outside the dialog), ARCHITECTURE § Options across engines (realisation) and Known gap 4, `ai/elkjs/SKILL.md` (`metadata()`), `ai/graphviz/docs/attributes.md` (`esep` engines).

All steps of this plan are done. Open: D1 (the user retests *Snap columns to grid*), side findings S1, S2, S4.

**Tree layer distance, root-level containers — investigated and fixed, 2026-10-28 (approved by the user; one commit).**
- Cause: `_boxSizes` widens only root-level *leaves* by `treeExtra` = layer distance − element distance; a root-level container gets no extra size. `_narrowTreeBoxes` then narrows *every* root-level box by `treeExtra` (centred), so a root-level container loses `treeExtra / 2` of padding on both flow sides while its children keep their positions. At HEAD before step 1 the container branch (`_flowPad`) existed but tested `node.children.length` before the children were attached, so it never ran: the bug dates from 928f5a4 (Tree layer distance). ARCHITECTURE § ELK › Tree describes the intended behaviour ("a container by padding on both flow sides").
- Reach: every Tree layout with a root-level container and layer distance > element distance, not only at 180. Measured with the baseline preset (padding 20, element distance 40): layer 60 → flow padding 10 instead of 20; padding 0 at layer 60 → children 10 px out; layer 180 → padding −50 (5 children out on views 1 and 2); `requirement.json` (layer 180, element 20) → −60 (2 children out on view 1, 3 on view 3). Nested containers are not affected. The gap between levels is right (layer distance, border to border); only the container is too small.
- Proposed fix (`elk.js`, prototype at `/tmp/claude-1000/-home-mark-Documents-GitHub-archi-scripts/1a5334b2-1fb3-4551-aad5-4fdd5477047d/scratchpad/tree-flow-padding.patch`): `_boxSizes` gives a root-level container in Tree an `elk.padding` with `treeExtra / 2` added on both flow sides (`ElkBox.padding`, built by a `_containerPadding(p, flow, vertical)` that `_PAD_CONTAINER` also uses), and with *Same width per level* and Right / Left its minimum width + `treeExtra` (as root-level leaves); `_elkNode` puts that padding after `eo.container`. `_narrowTreeBoxes` and `_clampEndsToTreeBoxes` stay. Tree's levels stay at layer distance. A preset's `engineParams.ELK` `elk.padding` no longer reaches root-level Tree containers (`checkEngineParams` already flags it as overriding *Padding*).
- Prototype checks: typecheck 0; the five test scripts pass. A scratch matrix (Tree × views 1–3 × 4 directions × layer 60 / 180 × 9 variants: default, *Crossing containers*, *Same width per level*, container algorithm Pack / Grid / Tree, padding 0, Splines, *Sort containers*): HEAD reduces the root padding in all 144 runs that have a root-level container, with children outside in 80; the fix has 0 outside, root padding = *Padding* on every side, smallest level gap = layer distance in all 216. `compare-layouts.js` (views 1–3, every preset under `presets/`, the baseline presets, `test-preset.json`): only Tree changes (`baseline.json`, `counters.json`, `requirement.json` on views 1–2; `requirement.json` on view 3). `write_plans.js`: only the 12 Tree lines of `baseline.json` / `counters.json` (views 1–2, three actions each); the digests in `plan/view-testability-baseline-write-plans.md` follow in the commit.
- Archi baseline: the matrix runs Layered and Twopi only, so `compare-views.js --head` is expected to show `Views/Baseline` unchanged (no regression, but it does not show the fix). The fix itself is checked by eye in Archi: view `1 Nesting`, preset `Test/baseline/baseline`, algorithm Tree, layer distance 180.
- Docs: none; ARCHITECTURE § ELK › Tree already states the intended padding.
- Applied as prototyped (comment rewrapped). Checks: typecheck 0; the five test scripts pass; `write_plans.js` equal to the prototype, digests updated in `plan/view-testability-baseline-write-plans.md` (12 Tree rows). Archi baseline: `compare-views.js --head` shows `Views/Test` and the 12 baseline runs unchanged; the one extra view, `Views/Baseline/1 Nesting`, is the user's check run (Tree, layer distance 180): every container padded 20 / 20 / 50 / 20, no child outside (read from the saved model). The model file is not committed (no baseline change).

## Next step

No step left in this plan. Open items (D1 retest, S1, S2, S4) each need the user's decision first.
