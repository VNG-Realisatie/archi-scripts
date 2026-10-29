# View Generation — Architecture Reference

The design decisions serve the purpose and use cases in [SPEC.md § 1](SPEC.md#1-purpose--scope). This document first gives the [quality goals](#quality-goals), the [context](#context) and the [structure](#structure) of the implementation: layers, modules, the public API, the run flow, and why it is cut this way. Then, per subject, the **decisions** with their reason, followed by the **realisation**: how jArchi 1.12 (GraalVM JS), SWT and Archi 5 carry them out, and where. The [cross-cutting concepts](#cross-cutting-concepts), [risks](#risks) and [known gaps](#known-gaps) close it.

## Division

One owner per fact; others link to it, never restate it. The order of change (approval first) is in [`Scripts/View/AGENTS.md`](../AGENTS.md) § Docs.

| Owner | Holds | Never holds |
|---|---|---|
| Code: `lib/defs.js` (SSOT) | Values: defaults (`DEFAULT_PRESET`), enums and value lists, labels, tooltips, algorithm capabilities and active params, constants | Reasons spanning modules |
| Code: module header and comments | What one module or function does and why, locally; a pointer to the SPEC section for the contract it serves | The contract itself |
| Code: adapters | Engine option names, units and mappings | — |
| Generated tables (`tools/gen_docs_tables.js`) | Every doc table that mirrors `defs.js`: styles, algorithms, layout options with defaults, preset-only options, capability matrix | Hand edits |
| [SPEC.md](SPEC.md) body | The *what*: functional behaviour, contracts, vocabulary, invariants. Implementation-free; user-visible numbers appear once, here | File, function and engine-option names; values that `defs.js` holds |
| [`reference/`](reference/) | Functional detail per subject, needed for a rebuild: dialog, presets, selection and nesting, engines | Reasons, realisation, generated values |
| ARCHITECTURE.md | Per subject: decision + why, then the realisation choices that span modules or are not obvious from one file (file and exported names); quality goals, context, the structure (layers, modules, public API, run flow, and why), cross-cutting concepts, persistent state, platform constraints, development and testing, risks, known gaps | Restated code, internal names, values, numbers already in SPEC, change history |
| [test-cases.md](test-cases.md) | Measurements and findings from reported views | Rules |
| [README.md](../README.md) | User guide | Design |
| [`Scripts/View/AGENTS.md`](../AGENTS.md) | Binding rules and the doc process | Descriptions |

On a conflict SPEC.md wins. A changed decision changes SPEC.md in the same commit.

## Quality goals

Ranked: where two conflict, the higher one wins. The decisions below serve them.

| # | Goal | Scenario that shows it | SPEC |
|---|---|---|---|
| 1 | No data loss | *Layout only* on a hand-made view with a legend, notes and a hand-placed duplicate keeps all three; one undo restores the view as it was before the run. | rules 10–11, § 12 |
| 2 | Count promise | The dialog's totals equal the console's `Total to view` after the action and what is on the view, object for object. | § 6, § 13 |
| 3 | Determinism | The same model, view and preset give the same layout digest on any machine and in either relation order (`nesting_test.js`, `tools/compare-layouts.js`). | rule 12 |
| 4 | Readable views | Elements keep their exact size; at 50 % zoom every end symbol points along its line. | rules 1–2, § 7 |
| 5 | Replaceable engines | A new algorithm is one registry entry plus one adapter mapping; `check_registry.js` passes and no other module changes. | § 3 |

Readability outranks engine purity: the named exceptions to SPEC rule 18 exist because the engine alone gave an unusable view.

## Context

What the subsystem needs around it. Scripts run straight from a clone, with no install step (repo rule 6).

```
 user ──► Archi 5 + jArchi 1.12 ─ runs ─► entry scripts ──► View subsystem ──► Graphviz `dot` (PATH)
          model, views, selection,        _gui.ajs, _*.ajs,   │     │
          undo stack, console             shortcuts/**        │     └──► presets/**/*.json, _session.json
                                          calling scripts ────┘          Scripts/node_modules/ (libraries)
                                          (Scripts/GEMMA/GGM)
```

| Neighbour | Tested with | Contract | Without it |
|---|---|---|---|
| Archi + jArchi | Archi 5, jArchi 1.12: GraalJS 24.1.2, CommonJS on | The jArchi API (`ai/jarchi-scripting/jarchi.d.ts`), SWT / JFace for the dialog, one undo step per script run | Nothing runs; without CommonJS the libraries do not load, and ELK says so |
| Graphviz | 14.1 | `dot -K<engine> -Tjson` from the PATH; the `-Tjson` shape in `types/vendor.d.ts` | Dot, Neato, FDP, SFDP, Twopi and Circo stop with an error; the other algorithms work. Started by `lib/process_runner.js` in Archi and `tools/process_runner_node.js` in Node. Behaviour differs per version (test case 10) |
| Vendored libraries | Versions in [`ai/repo-guide.md`](../../../ai/repo-guide.md) § Vendored libraries | elkjs (synchronous `layout`), dagre-cluster-fix (compound graphs), chroma-js (colour scales); the members used are typed in `types/vendor.d.ts` | The engine's algorithms fail; an update can change every layout |
| Files | — | Presets and the session, plain JSON with a `schemaVersion` ([Persistent state](#persistent-state)) | The Default preset comes from the code; the dialog starts from the defaults |
| Calling scripts | — | The [public API](#public-api) | — |
| Node | 22 (CI) | Development only: `tools/`, the harness ([Runtimes](#runtimes)) | Tests do not run; Archi is unaffected |

## Structure

How the modules realise the three layers of [SPEC.md § 3](SPEC.md#3-architecture), how a run flows through them, and why the code is cut this way.

### Layers and modules

```
Layer 1 — Entry points ──────────────────────────────────────────────────────────────────────
  _gui.ajs ─► gui/dialog_main.js  (+ gui/tab_*.js, widgets.js, condition_table.js, counts.js, dialog_presets.js)
                │ edits presets and the session; live counts through gui/counts.js
  View/_*.ajs, shortcuts/**/<preset>_<Action>_<Dir>.ajs ─► run_preset.js   (headless)
  other scripts (e.g. Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs) ─► generate_view directly
                │ (selection, preset, action)
Layer 2 — View-generation API ───────────────────────────────────────────────────────────────
  generate_view.js   orchestrator: read → plan() → apply → styling
     ├─ selection_read.js       Archi reads → Snapshot (the only selection code that uses `$`)
     ├─ selection_pipeline.js   Snapshot → object set; filter, steps, relations; predicted counts
     ├─ nesting.js              nesting split and resolution; pairing with the visuals; counts
     ├─ layout_graph.js         object set + nesting → LayoutGraph (nodes, edges)
     ├─ write_plan.js           layout result + target view → WritePlan; bendpoints
     ├─ view_writer.js          applies a WritePlan to the view (the only view writer)
     ├─ process_runner.js       starts an external process (Graphviz) with Java; Node has its own
     └─ appearance.js           styling pass on the written view
                │ LayoutGraph                       ▲ LayoutResult
Layer 3 — Engine adapters ───────────────────────────────────────────────────────────────────
  engines/elk.js · engines/dagre.js · engines/graphviz.js   (+ engines/engine-utils.js)
     └─ vendored libraries: elkjs, dagre-cluster-fix; Graphviz `dot` as an external process, started by a runner passed in

Shared (Layers 1–2) ─────────────────────────────────────────────────────────────────────────
  defs.js        SSOT: algorithm registry, params, labels, tooltips, defaults; preset validation
  rel_filter.js  the condition model of every condition list (pure)
  preset_io.js   preset and session files
  palettes.js    the palettes file (named colours)
  _lib/*         repo-wide helpers: selection, logging, folders
```

| Module | Layer | Responsibility | Uses |
|---|---|---|---|
| `View/_*.ajs`, `shortcuts/**/<preset>_<Action>_<Dir>.ajs` | 1 | Entry scripts: base or named preset + fixed overrides → API | `run_preset` |
| `lib/run_preset.js` | 1 | Preset, action and direction from the file name, or the base preset `all` | `preset_io`, `generate_view`, `defs` |
| `lib/gui/dialog_main.js` | 1 | Generate View dialog: opening, preset row, Properties tab, action area, settings ↔ widgets sync, putting the counts on the widgets | the gui modules, `preset_io`, `generate_view`, `selection_read`, `defs` |
| `lib/gui/tab_selection.js`, `tab_layout.js`, `tab_appearance.js` | 1 | One tab each: Selection (filters, step blocks), Layout (algorithm, nesting, containers, flow, elements, connections, view size; the param → widget table `PARAM_WIDGETS`; controls that follow the algorithm), Appearance | `widgets`, `condition_table`, `counts`, `defs`, `appearance`, `rel_filter`, `palettes` |
| `lib/gui/widgets.js` | 1 | SWT helpers without dialog state: tab pages, groups, form rows, combos, checks, spinners, colour pickers | `defs` |
| `lib/gui/condition_table.js` | 1 | The widget for every condition list, and the column sets of the dialog's condition tables | `rel_filter`, `widgets`, `defs` |
| `lib/gui/counts.js` | 1 | Everything the dialog's counters show: per-condition counts, what each step adds, the predicted view, the totals, the saved-preset compare. No widgets; Node loads it | `defs`, `selection_pipeline`, `nesting`, `rel_filter` |
| `lib/gui/dialog_presets.js` | 1 | Save As / Rename dialog | `preset_io` |
| `lib/generate_view.js` | 2 | The API and the orchestration: `generate_view` (read, target view, apply, styling, view properties) and the pure `plan(preset, snapshot, actionId, runProcess)` (object set, relation roles, layout graph, engine call, write plan) | `selection_pipeline`, `selection_read`, `layout_graph`, `write_plan`, `view_writer`, `process_runner`, `nesting`, `defs`, `appearance`, adapters, `_lib/*` |
| `lib/layout_graph.js` | 2 | Object set + nesting resolution → `LayoutGraph`: a node per occurrence, an edge per routed relation, element order, sizing. Pure | `defs`, `nesting`, `engine-utils` |
| `lib/write_plan.js` | 2 | Layout result + the target view's positions → `WritePlan`: nodes parents first (keep, move, create), removals, connections with their bendpoints, nestings, records. Pure | `defs`, `nesting` |
| `lib/view_writer.js` | 2 | Applies a `WritePlan` to the view; decides nothing. The **only** code that changes what is on a view | `defs` |
| `lib/process_runner.js` | 2 | The `ProcessRunner` for Archi: starts an external process with Java `ProcessBuilder`, input and output through temp files, a time limit. `tools/process_runner_node.js` is its Node twin | — |
| `lib/selection_read.js` | 2 | Archi reads of the selection and the target view (its visuals and their positions) into a `Snapshot`; the relations index; the seed elements. The only selection code that uses `$` | `_lib/selection`, `defs`, `nesting` |
| `lib/selection_pipeline.js` | 2 | Snapshot → object set: filter, related-elements steps, relation collection, predicted counts. Pure. Shared by API and dialog | `defs`, `rel_filter`, `nesting`, `selection_read` |
| `lib/nesting.js` | 2 | Nesting split and resolution; pairing with the visuals; managed-occurrence records; predicted counts. Pure | `defs`, `rel_filter` |
| `lib/appearance.js` | 2 | Post-write styling pass | `defs`, `rel_filter`, `palettes`, chroma-js |
| `lib/engines/elk.js`, `dagre.js`, `graphviz.js` | 3 | One adapter per engine: layout graph → layout result | `defs`, `engine-utils`, engine library |
| `lib/engines/engine-utils.js` | 3 | Engine-independent sizing and ordering | `defs` |
| `lib/defs.js` | shared | SSOT: algorithms, params, labels, tooltips, defaults, enums; preset validation; effective params | `_lib/selection`, `rel_filter` |
| `lib/rel_filter.js` | shared | Condition model: normalise, match, file form | — |
| `lib/preset_io.js` | shared | Preset and session files | `defs`, `rel_filter` |
| `lib/palettes.js` | shared | The palettes file: read, validate, colour lookup | — |
| `tools/`, `test/` | — | Checks, generators, migrations, harness; Archi test scripts | — |

### Subjects and layers

The sections below describe the implementation per functional subject, grouped by the layer that carries it. Where each subject lives:

| Subject | Layer | Modules (exported names) | What | Detail |
|---|---|---|---|---|
| [Dialog](#dialog) | 1 | `gui/dialog_main.js`, `gui/tab_*.js`, `gui/widgets.js`, `gui/condition_table.js`, `gui/counts.js` (`dialogCounts`), `gui/dialog_presets.js` | [SPEC § 9](SPEC.md#9-ux--generate-view-dialog) | [gui.md](reference/gui.md) |
| Entry scripts | 1 | `View/_*.ajs`, `shortcuts/**`, `run_preset.js` (`fromFilename`, `fromBase`) | [SPEC § 3](SPEC.md#3-architecture), [§ 5](SPEC.md#5-actions) | [README](../README.md) |
| [Model and actions](#model-and-actions) | 2 | `generate_view.js` (`generate_view`) | [SPEC § 4](SPEC.md#4-data-model), [§ 5](SPEC.md#5-actions) | — |
| [Selection](#selection) | 2 | `selection_read.js` (`readSelection`, `readRelationIndex`), `selection_pipeline.js` (`buildObjectSet` = `readSelection` + `composeObjectSet`, step helpers), `_lib/selection.js` | [SPEC § 6](SPEC.md#6-selection) | [selection-nesting.md](reference/selection-nesting.md#selection-run-order) |
| [Nesting](#nesting) | 2 | `nesting.js` (`splitNestingRels`, `resolveNesting`); `layout_graph.js` (`buildLayoutGraph`) | [SPEC § 7](SPEC.md#7-layout-options) | [selection-nesting.md](reference/selection-nesting.md#nesting-reference) |
| [Managed occurrences](#managed-occurrences) | 2 | `selection_read.js` (`describeVisuals`), `nesting.js` (`classifyVisuals`, `managedRecords`); the writer | [SPEC § 7](SPEC.md#7-layout-options), [§ 12](SPEC.md#12-resilience--error-model) | [selection-nesting.md](reference/selection-nesting.md#managed-occurrences) |
| [Writer](#writer) | 2 | `write_plan.js` (`planWrite`), `view_writer.js` (`applyWritePlan`); `nesting.js` (`nestingConnections`) | [SPEC § 5](SPEC.md#5-actions), [§ 11](SPEC.md#11-rules--invariants) | [selection-nesting.md](reference/selection-nesting.md#writer-parenthood) |
| [Appearance](#appearance) | 2 | `appearance.js` (`applyAppearance`, `computeConditionTargets`, `followNestingChains`), `palettes.js` | [SPEC § 10](SPEC.md#10-colouring--appearance) | [gui.md](reference/gui.md#appearance-tab) |
| [Engines](#layer-3--engine-adapters) | 3 | `engines/elk.js`, `dagre.js`, `graphviz.js` (`layout`), `engine-utils.js` | [SPEC § 7](SPEC.md#7-layout-options), [§ 8](SPEC.md#8-engine-contract) | [engines.md](reference/engines.md) |
| [Sizing](#sizing) | 3 | `engines/elk.js`, `engine-utils.js` (`alignWidthsByLevel`) | [SPEC § 7](SPEC.md#7-layout-options) | [selection-nesting.md](reference/selection-nesting.md#sizing-refinements) |
| [SSOT and presets](#ssot-and-presets) | shared | `defs.js` (`validatePreset`, `effectiveParams`), `rel_filter.js`, `preset_io.js` | [SPEC § 3](SPEC.md#3-architecture), [§ 14](SPEC.md#14-development-rules) | [presets.md](reference/presets.md) |

### Typed contracts

The code stays plain JavaScript; TypeScript only checks it (JSDoc annotations, `tsc --noEmit`, in CI). The type files describe the boundaries between the layers, so a change to a contract shows up in every module that depends on it:

| Boundary | Types | Used by |
|---|---|---|
| Archi ↔ every layer | `ai/jarchi-scripting/jarchi.d.ts`: jArchi globals, collections, proxies | all checked modules |
| Archi reader → pure pipeline: the `Snapshot` | `types/view.d.ts`: `Snapshot`, `RelationIndex`, `ExistingView`; `readSelection` and the harness's `readSnapshot` both produce it | `selection_read`, `selection_pipeline`, `nesting`, the harness |
| Layer 1 → 2: preset, conditions, object set, write plan | `types/view.d.ts`: conditions, presets, algorithm specs, pipeline shapes, `WritePlan` | dialog, pipeline, API, `defs`, `rel_filter` |
| Inside the dialog: counts, widgets, context | `types/view.d.ts`: `DialogCountInput`, `DialogCounts`, `DialogWidgets`, `DialogContext`, `StepBlock` | `gui/*` |
| Layer 2 → 3: the engine contract | `types/layout.d.ts`: `LayoutGraph` → `LayoutResult`, nesting resolution | API, adapters |
| Layer 3 ↔ libraries | `types/vendor.d.ts`: the members used of elkjs, dagre-cluster-fix, chroma-js, Graphviz `-Tjson` | adapters, appearance |
| Layer 1 ↔ SWT | `types/swt.d.ts`: the SWT / JFace members the dialog uses | dialog |

The scope is `Scripts/View/lib/**` plus three `_lib` modules; the `.ajs` entry scripts and `tools/` are not checked, so entry scripts stay thin. Scope, casts and limits: [`types/README.md`](../../../types/README.md).

### Public API

Code outside the subsystem uses only these exports (SPEC § 3); everything else is internal.

| Export | Contract | Callers |
|---|---|---|
| `generate_view.generate_view(preset, selection, actionId?)` | Validates the preset, runs the action (default `NEW_VIEW`), returns the written views | `run_preset`, the dialog, `Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs` |
| `run_preset.fromFilename(file, selection, opts?)` | Preset, action and direction from the script's file name; `opts.folder`, `opts.preset`, `opts.edit` | `shortcuts/**`, `Scripts/GEMMA/GGM/*_<Action>_<Dir>.ajs` |
| `run_preset.fromBase(selection, actionId, params?)` | The base preset `all` (else `_Default`) with params replaced | `View/_*.ajs` |
| `preset_io.readPreset(name)` | A validated preset; throws when it is missing or has another schema version | scripts that change a preset before `generate_view` (GGM) |
| `defs.ACTION` | The four action ids | every caller of `generate_view` |
| `gui/dialog_main.open(selection)` | Opens the dialog; runs the chosen action after it closes | `_gui.ajs` |

Internal exports serve the dialog, the harness and the tests: the other functions of `preset_io`, `run_preset`, `selection_pipeline`, `selection_read`, `nesting`, `layout_graph`, `write_plan` and `view_writer`, `generate_view.plan` (pure; the harness and tests) and the adapters' `layout`.

**Policy.** A change to a public signature updates every caller in the same commit (repo rule 3: no alias, no fallback). Callers are `.ajs` files outside the typecheck, so a broken call shows only at run time: find them with `grep -rn "generate_view\|run_preset" Scripts --include=*.ajs --include=*.js`. Those outside `Scripts/View/` are in `Scripts/GEMMA/GGM/`; `shortcuts/GEMMA/` is git-ignored, so a clone may hold callers the grep of another clone does not see.

### Why this structure

| Decision | Why |
|---|---|
| Three layers; each talks only to the one below. | The dialog, the headless scripts and other scripts (the GGM pipeline) drive one API, so a view comes out the same however it was started. The API is the one place where a view changes. Engines can be swapped without touching selection or writing. |
| Adapters see only the layout graph: no `$`, selection, preset file or view; an engine that starts a process is passed its runner. | All knowledge of an engine sits in one file, and an adapter runs unchanged in Node, so layouts can be reproduced and tested without Archi ([test levels](#test-levels)). Adding an engine touches no other module. |
| One SSOT (`defs.js`) for functional metadata; engine option names only in the adapters. | Dialog controls, enabling, validation, capability masking and the generated doc tables all derive from one registry: nothing to keep in sync, no mirrored constants. |
| The selection pipeline is a module of its own, shared by API and dialog. | The dialog's counts call the same exported helpers as the action, so a count is a promise ([SPEC § 6](SPEC.md#6-selection)) by construction, not by keeping two copies alike. |
| One write plan and one apply for all four actions; the plan is pure, the apply only follows it. | Behaviour differs only in the object set and the target view; one write path cannot drift per action (SPEC rule 9). Positions, pairing, removals and bendpoints are decided in Node-testable code; the part that needs Archi is a list of jArchi calls. |
| The condition model (`rel_filter`) is pure: no Archi, no Java. | Six condition lists share one matcher and one file form, tested in Node; the pipeline, the dialog and the styling pass cannot read a condition differently. |
| Pure parts are split from the parts that touch Archi (`resolveNesting`, `classifyVisuals`, `nestingConnections`). | The hard logic (nesting, managed occurrences, pairing) is tested in Node; what touches Archi stays thin. |
| Appearance is a separate pass after the write. | It reads only the written view and the model, so it behaves the same for every action and can never move or resize anything. |
| The action runs after the dialog closes. | No view changes under a modal dialog; the settings are saved to the session first, so a failed run loses nothing. |
| Only the entry points interact with the user: a question, a confirm, a message box. Layers 2 and 3 report through return values, the console and thrown errors. | The API runs headless in batch scripts (GGM) and in Node (harness); a question there blocks the batch or cannot be answered at all. One layer that asks and reports makes a run behave the same however it was started. |
| Adapters are loaded on first use, by the algorithm's engine name. | A run loads only the engine it needs; elkjs is large, and Graphviz needs an external process. |
| Contracts are typed with JSDoc and checked by `tsc`, not written in TypeScript. | Scripts run straight from a clone in GraalJS, with no build step (repo rule 6). JSDoc keeps them plain JavaScript while the editor and CI catch a broken contract between layers; executable code never changes for the checker. |

### Run flow

```
Dialog (_gui.ajs → gui/dialog_main · open)
  1 capture the selection before anything opens (focus loss can clear it)
  2 read the session (else the defaults), validate it       preset_io · readSession
  3 a view selected on the canvas: read it once             selection_read · readSelection, readRelationIndex
  4 build the tabs; recount on every committed change       (the helpers below)
  5 an action closes the dialog; save the session
    (Cycle algorithm start: the next one), then call the API generate_view

Headless (run_preset · fromFilename, fromBase)
  1 file name → preset, action, direction; or the base preset
  2 read the preset; apply the direction, fixed overrides,  preset_io · readPreset
    opts.edit
  3 call the API                                            generate_view

API (generate_view)                                         module · exported name
  1 validate the preset, mask inactive params               defs · validatePreset, effectiveParams
  2 read the selection and, on Modify, the target view     selection_read · readSelection → Snapshot (jArchi, logged)
  3 Modify: identify the target view
  4 plan(preset, snapshot, action, runProcess), pure:     generate_view · plan
    a object set: filter, steps, relations, predicted       selection_pipeline · buildObjectSet → composeObjectSet
      counts
    b relation roles: nesting candidates | connections      nesting · splitNestingRels
    c layout graph: resolve nesting, pair with the          layout_graph · buildLayoutGraph
      visuals; nodes = occurrences, edges = routed            → nesting · resolveNesting
      relations
    d engine                                                adapter · layout
    e write plan: nodes parents first (keep / move /        write_plan · planWrite
      create), removals, connections with bendpoints,         → nesting · nestingConnections, managedRecords
      nestings, managed-occurrence records
  5 Create: create or empty the view (only now)
  6 apply the write plan                                    view_writer · applyWritePlan
  7 styling pass                                            appearance · applyAppearance
  8 view properties                                         generate_view

Dialog (live counts, before the run) — gui/counts · dialogCounts calls the same helpers:
  steps          selection_pipeline · expandStepWithRelations, findRelationsBetween
  nesting        nesting · splitNestingRels, resolveNesting; selection_read · describeVisuals
  totals         nesting · predictViewCounts; selection_pipeline · logCountBlock
  Expand view    selection_pipeline · composeObjectSet on the Snapshot readSelection returned before the dialog opened
  ⚠ style check  appearance · computeConditionTargets
```

### Identities

| Id | Value | Valid in |
|---|---|---|
| model id | element or relation id | object set, nesting bindings, model lookup |
| occurrence id | element id for the first occurrence, `<element id>_occ_N` for extra ones (an unpaired user visual continues the numbering) | layout graph, layout result, nesting bindings |
| visual id | id of an object on the view | VisualSet, writer |

- An edge carries an edge id **and** the relation id; the writer looks up the model by the relation id. The edge id is the relation id, or `<relation id>_<k>` for the k-th further connection of a relation drawn more than once on the view.
- Pairing maps occurrence → visual once, in the pipeline; coordinates, bendpoints and nestings all go through that map.
- **Every nesting binding names occurrences that exist as nodes.** A binding whose occurrence has no node is turned into a connection when the graph is built. Otherwise the relation is neither nested nor routed, and its visual keeps stale bendpoints.

## Layer 1 — Entry points

`gui/*`, `run_preset.js` and the entry scripts collect (selection, preset, action) and call the API; only the dialog edits presets. The headless path has no decisions of its own beyond SPEC § 5.

### Dialog

| Decision | Why |
|---|---|
| Selecting a preset applies it at once; there is no Apply button. | The universal pattern for preset pickers (DAWs, IDEs, Lightroom). Apply adds a click without adding safety, since overwriting a preset is a separate Save. |
| A `*` marks settings that differ from the saved preset; switching presets discards changes without a confirm. | Users need to know when Save would do something. With Save and Save As explicit, a confirm on every switch annoys more than it helps; the `*` shows the loss before it happens. |
| A Default preset always exists and cannot be renamed or deleted. | The combo is never empty, and there is always a safe fallback. |
| Algorithm selection uses a style-grouped radio table, not a combo. | All algorithms of all styles are visible at once: users scan the full option space without opening a combo, and the style/algorithm relation shows at a glance. |
| Steps start expanded when a preset is loaded. | All conditions and their counts are visible at once; a block is collapsed on demand. |
| Live counts recompute on value-commit, not per keystroke. | Counting can be expensive (relation traversal); recomputing per keystroke is wasteful and flickers. |

**Realisation.**
- **The configuration is the source of truth**; widgets are a view on it, with one sync in and one save out. Layout params are table-driven (`PARAM_WIDGETS`: param → widget kind), so loading, saving, enabling and tooltips are one loop. Labels, tooltips and "used by" come from `defs`.
- **The dialog is cut along its tabs.** `dialog_main` owns the settings, the sync between them and the widgets, the preset row, the action area and the counters; each tab file builds its tab. A tab cannot require `dialog_main`, so the context carries two callbacks, `recount()` and `markModified()`, set when the dialog opens. Helpers shared by tabs live in `widgets.js`; the Layout and Appearance tabs need each other's state, which is why the nesting query is there.
- **Counting has no widgets.** `counts.dialogCounts` takes the conditions as the tables show them and the selection read before the dialog opened, and returns every number; `dialog_main` reads the tables, calls it and puts the numbers on the widgets. Node tests it (`counts_test.js`).
- **One condition-table widget** serves every condition list. Every checkbox of the dialog is drawn on a Canvas (`Widgets.checkBox`, `Widgets.canvasCheck`), so it can turn grey ([`dialog-style.md`](reference/dialog-style.md)). Counts of an off condition are computed with the condition switched on.
- **Commit events**: selection events and spinner focus-out.
- **The action runs after the dialog closes.** The settings are saved to the session, then `generate_view` runs. With *Cycle algorithm start* on, the run's start is set first (Selection for a Create action), and the session gets the next one.
- **Coupled distances** react to the spinners' Selection event, which only the user fires (not `setSelection`), and to every algorithm update, which also runs after a preset is loaded.

## Layer 2 — View-generation API

`generate_view.js`, with `selection_pipeline.js` and `appearance.js`. The subjects follow the [run flow](#run-flow): the model and actions, selection, nesting, managed occurrences, writing and styling.

### Model and actions

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling in filtering, traversal and rendering; the filter UI and iteration rely on a closed set. |
| Relations, VisualRelations and diagram-model-connections are kept apart from positional objects throughout the pipeline. | An edge has endpoints, not coordinates; as a node it would corrupt the layout graph. One rule covers all three kinds. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*, an action a *verb*; sharing presets across selections needs action-agnosticism. |
| The view name is one user-controlled field; `view.suffix` applies to One view each only. | An algorithm-derived suffix once rewrote the typed name on algorithm switch. The suffix is a fixed preset value appended to each element name (e.g. `" (GGM)"`); the Name field is never changed. |
| Expand view's target comes from the existing visuals, not from the preset name. | The preset name is for *creating* a view; expanding acts on that specific view (SPEC rule 10). |

### Selection

| Decision | Why |
|---|---|
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| Related elements come in steps with chain semantics; an empty step ends the chain. | Exploration is stepped ("from processes → applications → services"); one step cannot express it. An empty step stops step N+1 from bypassing step N's intent. |
| A step condition's direction is *either*, *outgoing* or *incoming*, default *either*; an empty step condition list follows every relation. | All three are common and *either* most of all, so the default asks nothing. No conditions means no restriction, as in every condition list. |
| A step's Include condition draws a relation on type, direction and previous-step type only. | A step's drawn relations stay predictable from its relation column, and migrated steps kept exactly their old form. |
| Modify actions skip the element filter. | It would hide element types already drawn and size containers for a subset, leaving the hidden elements outside their bounds. |
| Step relations come from the collection that reached the new elements, not from everything selected so far. | Relations back to earlier steps would be drawn and could create spurious extra occurrences. |

**Realisation.**
- **Snapshot.** `readSelection` reads the selection, the target view and the relations once into a `Snapshot` (elements, diagram objects, `relationsOf`, the existing view, diagram-blocks, described visuals); `composeObjectSet` and every step, relation and nesting helper work on it and read no jArchi. `relationsOf` follows jArchi's `rels()` order (source relations, then target relations; a self-loop twice, verified with `probeJArchiApi.ajs`), cached per element. The harness builds the same `Snapshot` from an `.archimate` file (`readSnapshot`).
- **Prediction = result.** The dialog's counts and the API call the same exported helpers: step expansion, relation collection, nesting split and resolution, predicted counts.
- **Diagram-blocks** are found from the parent chain on the view read: the target view of a Modify action, or the view(s) a Create action copies from (a view selected in the model tree, the view of a canvas selection). A diagram-block is a diagram object with no diagram object above it, with everything below it (`children()`, recursively) and the lines between them. Their contents stay out of the pairing and the layout graph; an element that appears only inside diagram-blocks is not laid out. A Create action keeps only the diagram-blocks the diagram filter keeps.
- **Diagram objects of a Create action**: those of the selected views and those selected on a canvas, each once (`getSelection` walks a view's `children()`, which lists its connections too).

### Nesting

| Decision | Why |
|---|---|
| *Every container* is a flag per nesting condition, not a global switch. | Whether a child may have several parents depends on the relation: a composition has one whole; an aggregation or grouping may have many. |
| A relation matching several nesting conditions gets *every container* if any of them has it. | Condition order then has no meaning, as in every condition list; an extra condition can only add occurrences. |
| The one-parent choice uses the current view, then names; never model or condition order. | Re-layout keeps elements where the user has them; a fresh view is reproducible. |
| A relation drawn as nesting loses its other lines on the view. | Containment already shows it; a left-over line shows it twice and reads as a second relation. |
| Nesting relations forming a cycle are all drawn as connections. | A cycle is nearly always a modelling error or a double relation. Lines make it visible, where breaking it at one relation would hide it. Nothing disappears, and the rule is order-independent. |
| A connection is drawn once per relation, between the occurrences closest together; one already on the view keeps its ends. | A relation is one fact; every pair of occurrences multiplied the lines (3,918 for 60 relations on a 128-occurrence view). The closest pair keeps the line local; keeping the user's ends means re-layout never moves a line to other boxes. |

**Realisation.**
- **One resolution** (`resolveNesting`) serves the predicted counts, the dialog's condition counts and the layout graph. No step depends on relation, condition or element order: candidates are taken in relation-id order, and every choice compares names and ids.
- **Cycles first.** The strongly connected components (Tarjan) of the candidate graph parent → child are found first. Every candidate inside a component is routed, and the cycle is logged by its element names. What remains is acyclic, so later steps need no cycle checks.
- **Parents per child**:
  - every parent reached by a relation matching a condition with `everyContainer` (`ConditionLists.matchEveryContainer`; Exclude conditions still veto);
  - plus at most one parent from the other relations: a container the child sits in on the target view (`currentContainers`, from the VisualSet; the dialog takes it from the selected view), else by name, then id.

  All candidates between a chosen parent and the child nest; the rest are routed.
- **Occurrences, parents first.** An element gets one occurrence under each occurrence of each of its parents, so an extra occurrence of a container gets copies of all its children. Extra occurrences are numbered in parent order.
- **Pairing is part of the resolution**, so the predicted counts, the dialog and the layout graph see the same occurrences. That includes unpaired user visuals, each a node at view root.
- **Connections between occurrences**, in the layout graph: an existing visual relation maps its two visuals to their nodes; otherwise the pair follows the order in [the reference](reference/selection-nesting.md#connections-between-occurrences), with occurrence order as the last tie-break.

### Managed occurrences

| Decision | Why |
|---|---|
| Extra occurrences are managed and reconciled by every action, *Layout only* included. | *Layout only* tries layouts without changing content, and extra occurrences follow from the settings, not content. Stale or missing ones made *every container* seem broken on re-layout. |
| Managed occurrences are recorded on the view as placements (element and container chain), not as visual-object ids. | A view copy gives every visual a new id; placements survive it. Only recorded occurrences are removed, so hand-placed duplicates are never lost. |

**Realisation.**
- **Record**: one view property per managed occurrence (duplicate keys, `prop(key, value, true)`):
  ```
  key   : "Managed occurrence"
  value : "<element id> in <container element id> [in <its container element id> …]"
  ```
  The container chain runs from the direct container up to the view root. It holds model ids, which survive a view copy; visual ids would not.
- **Capture** (`describeVisuals`, pipeline): per visual, its element, parent visual and container chain, and whether it is managed. It is matched against the records before anything changes; then the edge cases are applied (no user content → first visual; user content inside → its containers). The pure part (`classifyVisuals`) runs in Node. The dialog captures the same from the selected view.
- **Pairing** (`resolveNesting`), **adding and removing** (writer) and **records** follow the [reference steps](reference/selection-nesting.md#managed-occurrences). The writer adds and removes after the nodes are written, so a moved child is out first; the records are rewritten at the end of the write.
- **Removal** deletes the visual, and Archi removes its connections and children with it; by construction it holds no user content.

### Writer

| Decision | Why |
|---|---|
| Expand view and Layout only lay everything out again by the Layout tab; user content is kept, but its container and position come from the layout. | One source: laying out twice gives the same view, and a setting always shows its effect. Keeping the old container showed a relation both nested and as a line when its nesting condition was off. With an algorithm that does not nest, it left objects outside their container's box, hidden by Archi. |
| A diagram-block keeps its size, appearance and contents; only its position is laid out. | A legend or titled frame is made by hand; its contents have no relation a nesting condition could select. Laid out one by one, a legend fell apart (test case 14). |
| A diagram object's connection is laid out with the relations. | Left out, a note was placed loose beside the view, its line running across it (test case 13). |
| A Create action copies the diagram objects it read with the public jArchi API: the object is created, then the attributes that differ from a fresh one are copied. | Model changes go only through the supported jArchi API (user decision, test case 16): no jArchi or Archi internals. Copying only what differs keeps a default a default. |
| Non-orthogonal lines keep room for the end symbols (SPEC § 7); a line left without bendpoints is drawn straight. | Archi takes an end symbol's direction from the last few pixels of the line. Graphviz's curves start on the element border, so the first sampled bendpoint lay 0–4 px from it: fine at 100 % zoom, a turned arrowhead at 50 % (test case 13). Orthogonal corners are the route itself and stay. |
| A Create action creates or empties its view only after the layout succeeded. | An engine failure must not leave an empty view or destroy the one being overwritten (SPEC § 12). |
| Coordinates are converted engine-agnostically, by `parentId` on the result nodes. | Each engine nests differently; parent info on the result keeps engine-specific code out of the orchestrator. |
| What the writer does is computed first, as a plan (`write_plan.js`, pure), and applied after (`view_writer.js`). | Positions, pairing, removals and bendpoints run and are checked in Node (`tools/write_plans.js` digests); the Archi part is a list of jArchi calls. |
| Bounds in the plan are whole pixels, relative to where the container is stored. | jArchi truncates a fraction toward zero, so the plan holds what the view holds. A new or moved child lands against its container as stored, not as laid out: ≤ 1 px from the layout in fractional layouts (ELK Stress, Radial, Tree, Pack; Dagre), none in the others. |

**Realisation.**
- **Plan, then apply.** `planWrite` returns the steps in order: self-loops removed, nodes, managed occurrences removed, connections, nestings, unrouted connections cleared, records. `applyWritePlan` follows it; a step that fails is logged and the write goes on, and a node whose container was not written is left out.
- **Parent-first.** Nodes are planned after their parent, so a child's bounds are relative to where its parent is stored.
- **What the plan reads.** The target view's objects come from the Snapshot (`ExistingView.positions`: parent visual and bounds), not from jArchi: the plan knows a visual's current container and which connections Archi removes with a removed visual.
- **Pairing** comes from the resolution; the plan only follows it. Diagram objects are matched by their own id: one on the target view is kept, one read from another view is copied (`CopiedNode`), a diagram-block with its contents where they sit in it and the lines between them (`copiedLines`, with their own bendpoints).
- **Copies** (`view_writer.js`): an element visual with `add(element, …)`, a note, group or legend with `createObject`, a view reference with `createViewReference`, a line with `view.add(relation, …)` or `createConnection`; then text, name, documentation, properties, colours, font, line, border, alignment, opacity, gradient, figure, icon, image and legend options where they differ. An element visual's name, documentation and properties are its element's and are left alone. `applyWritePlan` returns the written visuals, so the appearance pass skips the copies inside a diagram-block.
- **Re-parenting** uses the jArchi 1.10 move (`parent.add(existingVisual, x, y)`), which keeps the visual, its appearance and its connections.
- **Every container counts** when the writer decides whether a visual must move: an element, a group or a note. Otherwise an element inside a group is written at view-root coordinates while it stays in the group.
- **Connections** are matched per visual pair, and each visual relation is used once; a visual relation between other visuals is not reused for another pair.
- **Ends inside a diagram-block.** An edge with such an end is laid out at the diagram-block; the layout graph keeps the visual at that end, and the writer connects to it. A line with both ends inside one diagram-block keeps its bendpoints.
- **Bendpoints** are Archi relative bendpoints: offsets from the source and target centres, computed in the plan from the boxes the connection's ends have after the write. For reversed relations their order is flipped back to the model direction.
- **End room.** Before the label points are added, bendpoints of non-orthogonal lines too close to their element or to the previous bendpoint are dropped (`CONNECTION_END_ROOM`, `BENDPOINT_MIN_GAP`). Label points start that far outside the point where Archi lets the line leave the element (the line from its centre towards the first bendpoint).
- **Middle labels.** Archi puts a Middle label at the middle point *by index* of source anchor, bendpoints and target anchor. To put it where the engine reserved space, the writer makes the label point a bendpoint and adds collinear bendpoints on the shorter side until both sides hold as many. The drawn route is unchanged.
- **Self-loops** are deleted from the view for algorithms without self-loop support. Otherwise the engine's route is used, or a small corner loop when the engine returns none.
- **Connections the engine did not route** get their bendpoints cleared, so switching algorithms leaves no stale routing.
- **Nesting connections** (`nestingConnections`, pipeline; pure, tested in Node): per binding, the visual relation between the two paired visuals is kept; every other visual relation of a nested relation is deleted.
- **Every visual gets a node.** An unpaired user visual is laid out at view root; nothing is left behind unpositioned.
- A Create action does not restyle the diagram connections of the view it read from: it copies them, to the copy of each end or to the node an element end was laid out as.
- Appearance and view properties run after the write. Setting bounds keeps a visual's appearance (`test/test_visual_props.ajs`).

### Appearance

**Realisation.**
- A separate pass that reads only the written view and the model, so it behaves the same for every action.
- Objects inside a diagram-block are skipped and keep their appearance; on a Create action, their copies.
- Style by property shares its target computation with the dialog's ⚠ check.
- Style by nesting level splits in two: `followNestingChains` is pure (visuals as id, parent, type, depth and the model relations to the parent → segment depth, colour name, font size and bold per styled visual) and tested in Node; `_applyNestingLevel` reads the view and writes font and fill.
- Font size and bold belong to a nesting style condition, not to the root: a condition starts where it selects an element its parent's condition did not, so a deeper level such as application services can restart the size. The global root size and bold went (schema version 6); a condition without a size continues from its parent. A leaf beside a container is styled as a container, so a domain without sub-functions reads as its sibling domains; automatic rather than a column, which would widen the table.
- *Default* is the element type's default fill, read back after `fillColor = null`, not the current fill: a rerun with Layout only would otherwise shade a fill that an earlier run set.
- Shading works in HSL lightness (chroma-js), so a darker level keeps hue and saturation; Lab darkening turned light yellow brown. One level darker is the inverse of one level lighter, bounded by closing the same fraction toward lightness 0.6, so middle colours such as orange stay light. Darker yellows (hue 40–80) shift 4° per level toward orange, matching the GEMMA KK01 views (#fff29b → #fff8b7 → #ffffcc).
- A nesting style colour belongs to the condition that selects the child, not to a type: the earlier per-parent-type colour gave a step's colour to its parent, so a function → service condition coloured the functions. The most specific condition wins instead of the last, so the list has no order, like the other condition lists. A root container counts as a child under a parent of its own type, so a condition styles the element it selects there too: taking the condition whose parent was the root's type gave a business-function root the colour of a function → service condition, and made the order of conditions matter.
- The dialog has no ⚠ for nesting style conditions that select one element with different colours: its predicted view has no nesting tree. The run logs the condition numbers instead.
- On a Modify action the pass resets the fill of every element the chain does not reach, and Highlight repeated's reset skips what an earlier group styled; otherwise the fill of an earlier run stayed.
- Palettes live in one file (`presets/_palettes.json`, `palettes.js`) that a preset names, so a colour is defined once for every preset. The run reads it only when a nesting style condition names a colour.
- Every colour choice in the dialog is the colour picker (`widgets.js`): a button and a menu with swatch images, since an SWT Combo shows text only on GTK ([dialog-style.md](reference/dialog-style.md#colour-choices)).

## Layer 3 — Engine adapters

`engines/*`: one adapter per engine behind the contract in `types/layout.d.ts`. What all adapters share comes first; sizing is realised in the ELK adapter.

### Options across engines

| Decision | Why |
|---|---|
| Option labels and values name the result, not the engine technique; each value's tooltip gives its trade-off (SPEC § 9). | Users choose by what they see. *Straight* and *Compact* named techniques: in a tree *Straight* gave no straighter lines than *Compact*, and its lean towards one corner was not visible from the name. |
| An option is offered for an algorithm only where it has its effect; where the engine lacks it, the adapter provides it only as a named exception (SPEC rule 18). | One control must behave the same in every algorithm. With Tree's layer distance and routing greyed out, levels sat at element distance with slanted lines, and nothing could be set (test cases 1–2). |
| An adapter sets only the engine's own options; it may compute their values from the layout graph, but adds no placement, ordering or crossing reduction of its own (SPEC rule 18). | Otherwise the algorithms converge: Twopi, Circo and Radial would each become the adapter's own radial layout, and choosing an algorithm would stop mattering. |
| Layer distance is the space between elements, border to border, in every algorithm (SPEC rule 19). | Twopi's own ring distance is centre to centre, so the same value gave a far tighter view than Layered; one meaning lets a user switch algorithms without re-tuning. |
| **Algorithm start** (elements outside containers, in the Algorithm box) is separate from **Sort** (Containers box; Grid, Pack, Tiles; always ascending); where Sort sorts, it wins and Algorithm start is greyed. *Cycle algorithm start* starts every new view with the selection order. | Sorting makes a grid or the tiles read alphabetically; Algorithm start gives the algorithm another starting point; one Order meaning both was ambiguous. Sort needs containers: a flat view is ordered by Algorithm start, which also sorts by name. Directed views are not sorted. |

**Realisation.**
- **Engine options, last wins:** engine defaults → GUI params through the adapter's mapping → `engineParams.<Engine>` from the preset (expert override, no dialog control). `engineParams.layout` tunes the engine-independent label sizing.
- **Settings outside the dialog are checked at the run, not in `validatePreset`:** `validatePreset` also runs when the dialog loads a preset, and console output inside the modal dialog blocks until it closes. `generate_view.checkEngineParams` checks `layout` (`engine-utils.checkLabelSizing`) and the run's engine (the adapter's `checkEngineParams`), never another engine's section, which only a run with that engine uses. Each adapter owns its table (`ENGINE_PARAMS`: keys, defaults, effect) and `dialogSettings`, the keys its mapping sets with the param that sets them. `engine-utils.dialogKeys` finds those by probing each mapper: a key whose value varies, or that is left out for some value, is set by the dialog; a key with one value for every probe is a fixed value of the adapter, which counts as a default. ELK option ids, targets and algorithms come from the bundled ELK's registry (`metadata()` in the elkjs wrapper). The check rebuilds the run's root, container and leaf options with `_engineOptions` and `_elkNode`, so an option the adapter sets after the preset shows as not used. Only an algorithm's own options (`elk.<algorithm>.*`) are checked against the algorithm: ELK declares fewer core options than an algorithm reads (measured: Stress uses `elk.padding` and `elk.aspectRatio` undeclared). Not detected: a core option that has no effect in this run (`elk.spacing.nodeSelfLoop` with Pack, which passes no self-loops to ELK). Reference: [presets § Settings outside the dialog](reference/presets.md#settings-outside-the-dialog).
- **Algorithm start** is applied while building the layout graph: the elements outside containers are sorted among themselves, and with a sorted order the relations follow the order of their elements. **Sort** is applied by the adapters through `engine-utils.sortedNodes` (ELK, Dagre, Tiles), by type and name: `graph.sort` is absent for an algorithm without Sort (then only the elements inside containers are sorted), and a view without containers is left as it is. ELK Pack sets `orderBySize` only for *Elements*.

### Sizing

| Decision | Why |
|---|---|
| Same width per level telescopes from the deepest level, one padding ring per level, and floors containers. | It is the width a single-column container of that depth would have: well defined at every level and independent of how wide one busy branch packs. A container that needs more bulges instead of clipping. |
| Columns across containers follows the CSS Grid Level 2 subgrid model: box edges on track lines, a container's padding counted as margin in its edge track and added up through containers on the same edge; it is offered for Tiles only. | One centre distance per column boundary for the whole view put deeper neighbours 2 × padding further apart where a row one level less deep shared the boundary (60 instead of 20 in Niet domeingebonden). Subgrid track sizing is the existing algorithm for nested boxes on one grid: neighbours stand Distance apart at every depth. On Pack the columns do not exist: ELK Pack gave no column structure on a view of 800 elements. |
| Boxes of one depth line up on a track line only at edges they share with their parent (the largest inset of that depth there); an edge facing a sibling keeps its own. | Insetting only for a box's own ancestors left boxes of one level in one track 20 off (Risicomanagement's children against Klantenservice's). Aligning every edge of a level, or every box in one track, opened strips of 60–100 between neighbours (GEMMA domeinen 62× 60, 18× 100). The parent edge gives the alignment without strips; the cost is that an edge facing a sibling does not align (Risicomanagement's right child 1620, Klantondersteuning 1640). |
| Each stack of leaves (one parent, one x) takes the leftmost grid column right of every stack whose branch stands beside its own (side by side under their lowest common container). | Columns came from leaf centres alone, compared with the previous leaf: centres a little apart chained across the view, and two containers side by side landed in one column on top of each other (Klant- en keteninteractie, Niet domeingebonden). Splitting only on that left a stack in a column of its own because it stood further right: an empty column next to Informering (520 px). |
| Same width per level takes the widest leaf of a level into account. | With Use label width the leaves differ; the stack is as narrow as it can be while every level holds its widest label. |

Realisation: [ELK](#elk).

### ELK

| Decision | Why |
|---|---|
| Placement offers *Centred* (default) and *Straight lines*, without a balanced straight-line variant. | Measured, the balanced variant equals *Centred* in a tree and gives the fewest straight lines elsewhere: a choice without a distinct result. *Centred* is at least as good in a tree and puts the root in the middle. |
| Tree routing offers *Straight* (no bendpoints; Archi draws the line) and *Splines*. | Adapter-drawn orthogonal and polyline lines between mrtree's end points looked poor next to Layered (test case 6); a straight line is what the tree itself implies. |
| Stress runs ELK SPOrE after the layout. | ELK Stress ignores the element distance and has no overlap removal (test case 8). SPOrE moves elements apart, positions only, within the no-scaling rule. |
| Network has no ELK Force. | Same principle as FDP, but slower, messier, without overlap removal or routing around elements (test case 8). Stress stays as the Network algorithm that needs no Graphviz. |

**Realisation.**
- **Hierarchy.** *Crossing containers* = `INCLUDE_CHILDREN`: one layered graph, with crossing minimisation across levels. *Between containers* = `SEPARATE_CHILDREN`: each container on its own.
- **Edges live in their lowest common ancestor container.** ELK's coordinates are relative to it and are offset back.
- **Hierarchical ports.**
  - With *Between containers* and Layered at root and in the container, a cross-container edge is split into segments, joined by a port on every crossed container. The inner layout reserves the port, the outer layout connects to it, and the writer gets one joined path.
  - A connection that ends on a container itself also gets an explicit port; otherwise ELK puts it in the container's top-left corner.
  - With other algorithms, the ends are lifted to the containers directly under the common ancestor.
- **Connections-mode lock.** Grid or Pack inside containers forces *Between containers*, because ELK rejects connections into `box` / `rectpacking`. So does an active view size, because a hierarchical layout does not pack unconnected children into rows.
- An edge between a container and its own descendant cannot be laid out; it is drawn unrouted.
- **View size.** ELK has no width bound for nested layouts, and top-down layout scales (forbidden). The lever is `elk.aspectRatio` in every scope: it sets how wide unconnected children pack, and its effect compounds over levels.
  - The adapter searches one ratio for all scopes: it starts from the target, estimates the next ratio from the closest run (a slope measured from the two closest), and keeps every run with its log, so the chosen run is the result (no repeat). At most 6 runs, 10% accepted; Max width is the same search toward the ratio at which the view would be that wide. Grid and Pack offer Max width only.
  - Rectpacking hangs at high ratios, so Pack is capped at 3.
  - Where the ratio has no effect (connection chains set the width, or *Crossing containers*), the target is logged as not reachable.
  - Radial has no *Aspect ratio*: the bundled elkjs declares no `elk.aspectRatio` for `radial`, so the layout never responds to it, and the control is disabled.
- **Reserve label space** (Layered). Each connection label is an inline ELK label with its estimated size. Layer spacing becomes the connection spacing, and every edge gets a label box (empty ones invisible), so a gap between element layers is `max(layer spacing, label + 2 × connection spacing)`.
- **Jogs** under 5 px right after a port, left by node placement, are straightened onto the longer segment.
- **Same width per level** sets leaf widths and container minimum sizes before the one ELK run: the widths come from the leaf widths of the layout graph, whose input width ELK keeps.
- **Placement.** *Centred* = network-simplex placement: the shortest total connection length centres an element between its neighbours. *Straight lines* = Brandes-Köpf: each element is aligned with one neighbour, computed from four corners, and the smallest result is kept; hence the lean towards a corner.
- **Tree** (mrtree) has one spacing for siblings and levels, and only two line styles of its own: a stub then a diagonal, or centre to centre. It ignores the general edge-routing option; ELK silently ignores every option an algorithm does not declare.
  - **Layer distance:** every root-level box is widened in the flow direction by layer distance − element distance (a container by padding on both flow sides), then narrowed back after layout, centred: positions only, sizes unchanged. Connection ends in the widened part move onto the real side.
  - **Routing:** *Straight* sends no bendpoints, so Archi draws a straight line between the elements. *Splines* is a cubic curve between the end points mrtree chose, sampled to bendpoints.
  - mrtree takes the order of siblings from the order of the relations, not of the elements.
- **Radial** cannot take compound graphs and needs a tree. The adapter builds a breadth-first spanning tree from the best-connected element, with virtual edges joining the components; those are never written. Every tree edge points away from the root, because ELK takes each node without an incoming edge as a root and stacks those subtrees on one spot. In the result each edge is turned back to the relation's direction.
- **Radial rings.**
  - ELK puts ring *k* at *k* × step, where step is the largest element diagonal. When the first ring is too small for its elements, ELK widens it and moves only the second ring along, so deeper rings stay inside the first.
  - The adapter then runs ELK a second time with a fixed radius *R* = (first ring + step) / 2. The first ring keeps its size, the second lands at first ring + *R*, and ring *k* ≥ 3 at *k* × *R*, one step outside the ring before.
  - No layer distance: a fixed radius from the dialog has the same flaw.
  - No compactor: radial compaction depends on input order and can pull a child inside its parent's ring; wedge compaction spreads a depth over several radii.
  - How wide each element's sector on a ring is follows its subtree (Eades) and cannot be adjusted.

### Dagre

**Realisation.** `dagre-cluster-fix` for compound graphs; straight and polyline routing only; Dagre itself drops self-loops.

### Graphviz

| Decision | Why |
|---|---|
| Twopi's centre is the best-connected element of each connected part. | Twopi's own "most central node" can be an element at the edge, putting the hub on an outer ring with every line crossing the view (test case 4). |
| A full Twopi ring is tight at layer distance = element height and follows the layer distance from there, also below it. | With a fixed minimum, the layer distance did nothing on a star (SPEC rule 20). Element height as the reference makes the default spacing a good start. |
| Circo offers **Circles**: *One circle* (default) or *Per cycle*. | Per cycle is circo's own behaviour: on a model with a hub it gave a star with arcs. One circle gives a readable overview with the fewest crossings (6 against 13 on that view); Per cycle shows separate cycles joined at a shared element or relation. Both are legitimate, so the user chooses (test case 11). |
| Circo *Per cycle* puts an element of each part's largest cycle in the middle. | Circo's own choice can be an element outside every cycle, which then pushes everything hanging from it far out. With the largest cycle in the middle, the longest line went from 732 to 343 px and the view from 1772 × 2242 to 1272 × 1317 px (test case 13). |
| Circo runs a second time when its graph has unconnected parts (SPEC rule 18, named exception). | Circo removes overlap only in a graph of one part; one loose note left elements overlapping and every line straight (test case 13). The second run is Graphviz's own overlap removal and routing on circo's positions. A graph of one part gets no second run: it only spread a good layout further. |
| Circo has no aspect ratio. | A ratio stretches the circles into ellipses, and the circle is what circo is for. |
| Neato does not nest; FDP does. | Neato places elements ignoring clusters in every mode, so a container's box covers elements outside it; `mode=ipsep`, meant for this, crashes in Graphviz 14.1 (test case 10). |
| For Neato, FDP, SFDP and Circo, the dialog keeps element distance ≥ 2 × connection–element distance + 2 px, and at least the shortest connection; the value the user changed wins. Layered and Tree are free. | Graphviz's router gives up, silently drawing straight lines, when a connection with its clearance on both sides does not fit between two elements (test case 8). Correcting this at run time would hide the dependency (SPEC rule 20). In Layered and Tree, connections run between the layers, not between elements of one layer. At exactly 2 ×, overlap removal leaves elements exactly `sep` apart, which the router reads as touching; +1 px still failed, +2 px routed in every combination measured on two views. The shortest connection keeps two end symbols apart: on a 15 px line an assignment's dot and arrowhead overlapped (test case 13). |

**Realisation.**
- **Process.** The `dot` binary runs from the PATH (`-K<engine> -Tjson`). Input, output and errors go through temp files, so no pipe can fill and block it, and a run that exceeds `GRAPHVIZ_TIMEOUT_S` is stopped ([Performance](#performance)). Nesting uses clusters.
- **View size.** No max width, because Graphviz `size` scales nodes. The aspect ratio is passed as `ratio`.
- **Line ends.** The start and end of each line (the arrow tips when present) are passed to the writer as the points where it leaves and enters the elements. Samples of a short curve that round to the same pixel are merged.
- **Spacing in Graphviz units.** `sep` and `esep` are margins in points on every side of an element. `sep` is half the element distance, because two elements share it; `esep` is the whole connection–element distance, because a line has no margin of its own. When `esep` is not below `sep`, the router falls back to straight lines with only a warning on stderr, hence the dialog coupling.
- **Overlap removal.** Neato, FDP and SFDP get `overlap=prism`, which keeps the layout's shape; `vpsc` turned a test view into one tall column. Without it, Neato keeps overlapping elements, and FDP / SFDP leave some closer than `sep`, so the router draws straight lines. FDP with clusters gets none: it removes overlap within clusters itself, and prism only spread the view (+30 %).
- **Cluster boxes** come from Graphviz (dot and fdp emit one per cluster); they are not derived from member positions.
- **Twopi.**
  - Per connected part, the best-connected element gets `root=true`.
  - The ring radii go as a `ranksep` list (the radius of ring 1, then each step), computed from a breadth-first walk from the centres:
    - step = layer distance + the largest half diagonal on both rings (a rectangle on a slant reaches further than half its width);
    - a full ring's radius = Σ(width + element distance) / 2π + (layer distance − element height).
  - One list serves every part, so each ring takes the largest radius over the parts.
  - `overlap=vpsc` with `sep` pushes elements that still touch apart, positions only; this is needed because twopi divides a ring by subtree size, not evenly. `prism` was rejected: it re-spreads the whole layout and pulls the rings together.
- **Circo.**
  - *One circle* is `oneblock=true`.
  - Element distance goes to `mindist` and, as for Neato, to `overlap=prism` with `sep`: `mindist` alone left wide elements overlapping.
  - *Per cycle*: per connected part, the element with the most connections inside the largest biconnected component (Tarjan; first in input order on a tie) gets `root=true`. A part without a cycle keeps circo's choice.
  - A graph of more than one part runs `-Kcirco -Tdot`, then `-Kneato -n1` on that output: neato keeps the positions, applies the same `overlap` and `sep`, and routes the lines.

### Tiles

| Decision | Why |
|---|---|
| Tiles has no layout engine: an adapter (`engines/tiles.js`) tiles the nesting itself, as an ordered slicing floorplan. | Sorted nestings are what it is for, and ELK Pack places by size: it cannot keep an order and leaves holes next to tall boxes. A search over column counts (first attempt) was brute force and gave ragged results; the dynamic programme finds the best shapes without guessing. |
| Every box has a list of shapes (width, height) that no other shape beats in both; a run of neighbours is cut in two, side by side or one above the other, and the best shapes of every run follow. | A container settles on its shape only when its parent knows the room, so two small containers can sit side by side when that saves space. The order of the children is the reading order (left to right, then down). |
| The lists keep the shapes with at most 1.5 times the least area, at most 32, spread over the widths on a log scale. | Without the waste filter the thinning dropped the useful widths (a list from 460 to 15260 px). |
| The view: with Max width the widest root shape that fits once Columns across containers is applied; with Aspect ratio the closest of the 8 nearest shapes, placed and measured; Free: area × (1 + ln²(ratio / 0.75)). The root keeps 96 shapes. | Max width as an upper bound with a portrait preference gave under 2000 px for a limit of 3000; the grid widens a view, so it is judged after the grid. The smallest area alone is one tall column of 500 px. |
| Connections are not routed (straight lines), as with Pack. | The adapter sets positions only. |
| With Same width, a leaf beside a container takes the x and width of the narrowest sibling container of its column, after the grid. | At level width it looked out of place among wider containers. A container's narrowest shape is its level width, so only the placed widths tell; the leaf is placed at its own width, else the grid took it as a column of its own and widened only the containers. The narrowest, not the column's span: a column with a container of two children side by side made the leaf wider than its other neighbour. The column comes from the tiling (parts cut one above the other share one), not from x ranges: a wide container in another row overlapped the leaves below it in x, and they took its width. |

Realisation: `buildTable` (the programme over the runs), `prune` (the shape lists), `build` (one root shape placed, grid applied, leaves widened to their column through `columnSharers` and `widenToColumns`), `layout` (sorting through `sortedNodes`, Same width through `alignWidthsByLevel`, placement from the back-pointers). *Columns across containers* runs after it through `engine-utils.alignColumnsAcrossContainers`. Test: `tools/tiles_test.js`.

## SSOT and presets

Shared by layers 1 and 2: `defs.js` (registry, defaults, validation), `rel_filter.js` (condition model) and `preset_io.js` (files).

| Decision | Why |
|---|---|
| Presets are plain JSON, never code. | No code runs from a preset, so a shared one is safe to load; a change is a readable diff; validation and the one-shot migrations can read and rewrite every preset. Old JavaScript presets are converted offline, never loaded. |
| Defaults live in one place, overrides come before validation, engine options only in the adapters. | Every value has one source, and every override is validated like a preset file. |

Where a value comes from, last wins:

```
DEFAULT_PRESET (defs.js)                      code defaults
 ← preset file   presets/<name>.json          headless: the named preset, or `all`, else `_Default`
 ← session       presets/_session.json        dialog: the last settings; a picked preset replaces them
 ← overrides     entry script or caller       direction from the file name, fixed params of View/_*.ajs,
                                              opts.edit, a calling script's own changes
 → validatePreset                             missing keys defaulted, unknown keys stripped, conditions checked
 → effectiveParams                            inactive params dropped, locks applied (connections mode)
 → adapter: engine defaults ← GUI params (mapping) ← engineParams.<Engine>
```

**Realisation.**
- **One registry per algorithm** in `defs.js`: engine, style, nesting and self-loop capability, active params, allowed values. Dialog enabling, validation and the generated tables derive from it; `tools/check_registry.js` checks registry ↔ defaults ↔ dialog widgets.
- **Effective params.** Inactive params are dropped and locks applied (connections mode) before the pipeline, adapter or writer sees the preset.
- **File form.** Plain JSON, one condition per line, defaults omitted, so a changed condition is one changed line in a diff.
- **The schema version gates loading.** A different `schemaVersion` is refused with a message. A shape change ships with a one-shot, idempotent Node migration in `tools/` that rewrites every preset, `_session.json` included; there is no conversion at load time. Version 3 replaced `params.showInEveryContainer` with `everyContainer` per nesting condition. Version 4 renamed the *rule* keys to *condition*. Version 5 added the nesting style conditions and the palette and dropped `rootColor`, which was never used because jArchi always reads an effective fill (the default condition and `darkenStart: 0`, so existing presets keep their colours). Version 6 moved `rootFontSize` and `rootFontBold` to `fontSize` and `bold` of the first nesting style condition (`tools/migrate_presets_nesting_font.js`). Only the latest migration is kept: an older one stamps the current version on its own output, which loading then strips or refuses; the migrations to versions 2 and 3 run from commit `61c9c52`, the one to version 4 from `deb432c`, the one to version 5 from `8e13b2e` ([README](../README.md#presets)).

## Cross-cutting concepts

Concerns that span the layers.

### Errors

| Decision | Why |
|---|---|
| Failures are caught only at the boundaries: the entry point (dialog run, headless script), preset load and save, the engine call, the external process. Code between them throws and does not catch. | One place decides what the user sees; the code between stays straight, and the typecheck covers its contracts (repo conventions, Errors). |
| One error form: an `Error` whose message says what failed and what to try; the stack goes to the console. | A thrown string has no stack. The user needs the reason, the maintainer the stack. |
| The entry point shows the reason in a message box (SPEC § 12). | The console can be closed or scrolled away; a run that writes nothing without a word looks like a hang. |
| Silent catches form a closed list: an SWT call on a widget that may be disposed (layout, redraw, text during a dialog update); a jArchi lookup that may find nothing (a diagram-object type a view cannot hold, a property that is absent); deleting a visual that Archi already removed with its parent. Every other catch logs what failed and on which object. | These cases are expected and harmless. Anything else hidden in an empty catch shows up only later, as a wrong view without a reason. |

Realisation today: `generate_view` catches every failure of a run, logs it with its stack and returns normally; the dialog has a second catch around the call. The adapters throw `Error` (ELK not loaded, Graphviz not found, its exit code, the timeout; the adapter builds these messages from the runner's outcome). What does not meet the decisions yet: [Known gaps](#known-gaps).

### Unit of work

| Decision | Why |
|---|---|
| One script run is the unit of work: jArchi puts all of a run's changes on Archi's undo stack as one step, a failed run included (SPEC § 12). | The user undoes a run the way they started it, with one undo; the writer needs no compensation code. |
| A Create action still creates or empties its view only after the layout succeeded. | The common failure, in the engine, then leaves nothing to undo. |

A failure after the engine (write, styling, view properties) leaves the view partly written; the console says where it stopped, and the undo step restores it. *One view each* writes all its views in that one step; *New view* onto an existing name empties it in the same step.

### Runtimes

The same modules run in two runtimes.

| Runtime | What runs | Globals |
|---|---|---|
| Archi: jArchi 1.12, GraalJS 24.1.2, CommonJS | Everything | `$`, `selection`, `model`, `__DIR__`, `__FILE__`, `Java`, `Packages`, `window`; `console` with `log` and `error`, one argument each |
| Node 22, development | `defs`, `rel_filter`, `nesting`, `selection_pipeline`, `layout_graph`, `write_plan`, `generate_view` (`plan`), `engine-utils`, the ELK, Dagre and Graphviz adapters; `tools/` (Graphviz needs `dot` on the PATH, started by `tools/process_runner_node.js`) | The harness's stand-ins: a global `__DIR__`, a `Java` that only reads files (the vendored elkjs reads its worker that way), a console that drops the `Loading …` lines |

- A pure file uses no `$`, `model`, `selection`, `Java`, `Packages` or `window`; checked by `jsconfig.pure.json`. Files not yet on its list still use them inside functions the Node path does not call. `nesting.js`, `selection_pipeline.js`, `layout_graph.js` and `write_plan.js` are pure but not on the list: their type import of `defs` pulls `_lib/selection.js` and `Common.js` (which use `$`) into the pure program. They join when `defs.js` stops requiring `selection.js`; `selection_read.js` is Archi code by design. A module that Node loads exports under `typeof module !== "undefined"`.
- The harness reads the model with its own `.archimate` reader: a second path to the model, which can drift from what jArchi returns.
- Only in Archi: the dialog, `view_writer.js` (applying a plan), `generate_view`'s own entry (reading and opening views), the styling pass, preset files and the Java process runner (`lib/process_runner.js`; Node has its own runner, so Graphviz runs there too).
- Sorting by name is the same in both ([Determinism](#determinism)); speed is not ([Performance](#performance)).

### Determinism

| Decision | Why |
|---|---|
| No result depends on hash order, on Map or Set iteration over unsorted input, or on the order the model stores things in; every choice compares names, then ids. | SPEC rule 12: a fresh view is reproducible, and the tests can compare layouts by digest. |
| One name comparison, `Defs.compareNames`: on a key with accents removed (`normalize("NFD")`, combining marks dropped) and lower case; equal keys fall back to the code-point order of the names. | It reads as a user expects (`aanvraag, Ångström, e-Depot, Émile, Eva, eva, Zaakregistratie`) and gives the same order in Archi and in Node. `localeCompare` and `Intl` were rejected: jArchi's GraalJS has no `Intl` and ignores the locale argument, so the order followed the JVM's default locale and could differ per machine. `java.text.Collator` could fix a locale, but would make the pure modules Archi-only. |

Sources of order: the selection (Order *as selected*), ids (relations are taken in id order for nesting), Map and Set insertion (filled from sorted input) and sorting. Names go through `compareNames`: the parent "first by name", Order by name and by type and name, the order inside containers, the value → colour order of Style by property, the preset and folder lists and the property lists in the dialog. Ids and type ids compare by code point. Checked by `nesting_test.js` (both relation orders) and `tools/compare-layouts.js`.

### Performance

| Decision | Why |
|---|---|
| The action runs on the UI thread, after the dialog closes, without progress or cancel. | jArchi scripts are synchronous: no timers, no event loop, and model changes belong on the UI thread. Archi does not respond during a run. |
| ELK runs in-process; Graphviz runs as an external process with a time limit (`GRAPHVIZ_TIMEOUT_S` in the adapter, 60 s). | ELK can be slow but ends (Pack is capped where rectpacking hangs); in-process it cannot be stopped. `dot` is fast but can hang for good on a rare bug, and a process can be stopped. The limit is engine-specific, so the adapter owns it; the runner, passed in (Java in Archi, `child_process` in Node), only enforces it. |
| Live counts recompute on commit, with a cache per step condition. | Counting traverses relations; per keystroke it is wasted work and flickers. |

**Realisation.**
- **Interpreted JavaScript.** jArchi's GraalJS runs on Archi's own JVM without the Graal compiler, so scripts are interpreted, never compiled. ELK, a large transpiled library, is therefore much slower in Archi than in Node; the harness is the place to try a large layout.
- **Multi-pass layouts.** The ELK view-size search (log-scale steps, then bisection, each a full layout; the best is run again with routing); the Radial and Stress second runs; Circo's second process for a graph of several parts. *One view each* runs the whole pipeline per element.
- **Reading once.** Required modules are memoised and adapters load on first use. The dialog reads the relations index (`readRelationIndex`, per element on first use) and Expand view's `Snapshot` (`readSelection`) once before it opens, and composes (`composeObjectSet`) on every change; the target view's visuals are described once per read.
- **Count cache.** A step condition's count is cached per condition and input (repeat plus FNV-1a signatures of the id lists), and the cache is emptied above 500 entries.
- **Measuring.** `generate_view` logs the time per phase (`Timing:`). Budget numbers follow once SPEC § 13 defines them.

### Logging

- Entry scripts open and close the console with `Common.initConsoleLog(__FILE__, true)` (shows and clears it, prints the Archi and jArchi versions) and `Common.finishConsoleLog()`.
- jArchi's console takes one argument and has `log` and `error`, no `warn`: each call builds one string.
- The steps and count blocks are functional ([console logging](reference/engines.md#console-logging)); the dialog and the API share `logCountBlock`.
- There is no debug flag: the View code does not use `Common.debug`, and mismatches are always logged with `⚠`.
- Console output from an SWT handler blocks while a modal dialog is open, so `writePreset` takes `quiet`.

## Persistent state

| What | Where | Notes |
|---|---|---|
| Presets | `presets/**/*.json` | Folders allowed. `_Default` = the code defaults, hidden. `all` = base preset of `View/_*.ajs`. |
| Session | `presets/_session.json` | Last settings plus UI state (`_`-prefixed keys); git-ignored |
| Palettes | `presets/_palettes.json` | Named colours the presets pick from (`appearance.palette`); tracked |
| View properties | the generated view | From the Properties tab; optional object-id property |
| Managed-occurrence records | view property `Managed occurrence` | Rewritten by every run; not for editing |

Overwriting a view by name (`NEW_VIEW`) empties it but keeps the view and its properties.

- **Write safety.** `preset_io.writeJSON` writes a file in place, with no temp file and rename: a crash mid-write leaves a broken preset, which then fails to load. Reading and writing use the JVM's default charset, UTF-8 on Archi 5 (Java 21, and `Archi.ini` sets `-Dfile.encoding=UTF-8`).
- **One session.** Two Archi instances share `_session.json`; the last to save wins.
- **Ownership.** Tracked presets are shared through the repo. Local, git-ignored: `_session.json`, `presets/GEMMA/*` except `GGM`, and the shortcut scripts in `shortcuts/GEMMA/`.

## Platform constraints

View-specific jArchi behaviour. General jArchi rules are in [`ai/jarchi-scripting/SKILL.md`](../../../ai/jarchi-scripting/SKILL.md), SWT / GTK in [`swt-gtk.md`](../../../ai/jarchi-scripting/swt-gtk.md), and the repo's dialog style in [`dialog-style.md`](reference/dialog-style.md).

- `$(view).children()` misses view references; find them per diagram type.
- A view reference reports type `"archimate-diagram-model"` instead of `"diagram-model-reference"`; both are in `DIAGRAM_TYPES`.
- `view.add(obj, x, y, w, h)` works for elements only; diagram objects take the 2-argument form.
- `$(view).children()` lists the view's top-level objects and all its connections (`DiagramModelProxy.children()`).
- `createObject` makes a note, group or legend only (wiki, jArchi 1.12); a `diagram-model-image` cannot be created.
- Bounds are relative to the parent visual. Setting bounds keeps the appearance.
- `view.openInUI()` first fires Archi's "model opened" event (`ModelUtil.openModelInUI`), so the model tree goes to its root and selects the model. `generate_view._openView` therefore calls Archi's `EditorManager.openDiagramEditor(view, true)` directly, with the view found through `IEditorModelManager` (model id and file path: copies of one file share the id) and `ArchimateModelUtils.getObjectByID`: Archi's own Java classes, not the jArchi API (user decision, Known gap 12). This opens the view as the focused tab and leaves the model tree as it was. It only opens an editor and changes nothing in the model.

## Development and testing

How a change is designed, built and checked. The binding steps are in [`Scripts/View/AGENTS.md`](../AGENTS.md) § Docs (approval first), and the repo rules on plans (rule 8) and the typecheck (rule 5) are in [`AGENTS.md`](../../../AGENTS.md); a reported view follows the skill [`view-testing`](../../../ai/view-testing/SKILL.md).

### Cycle

| Phase | What happens | Result |
|---|---|---|
| Design | Agree on the behaviour with the user. A change of more than one step gets a plan: steps with dependencies and status, the doc sections it builds on, the test data, and a dated step log. | `plan/<title>.md` |
| Build | Registry first: a new option or value goes into `defs.js` (defaults, labels, tooltips, capability), then the pipeline, adapter, writer or dialog. | Code |
| Test | The levels below, from cheap to Archi; a step is done when its levels pass. Checks only the user can do in Archi stay open in the plan's status until confirmed. | Test output, plan status |
| Approve | The user checks the result in Archi and approves. | — |
| Document | SPEC, `reference/` and this file per the [Division](#division); regenerate the tables; docs and code in one commit. | Commit |

### Extension recipes

| Change | Touch, in this order | Check |
|---|---|---|
| Layout option | `defs.js`: default in `DEFAULT_PRESET.params`, label, tooltip, active params per algorithm → dialog `PARAM_WIDGETS` → adapter mapping | `check_registry.js`, `gen_docs_tables.js --write`, typecheck; SPEC § 7 |
| Value of an option | `defs.js` value list, label, tooltip → adapter mapping | as above |
| Algorithm | `defs.js` registry entry (engine, style, capabilities, active params) → adapter mapping | as above; harness `--layout`; `tools/compare-layouts.js` for the other algorithms |
| Engine | an adapter in `engines/` (`layout(LayoutGraph) → LayoutResult`) → the engine switch in `generate_view` (Known gap 2); its library in `Scripts/node_modules/`, its members in `types/vendor.d.ts` | as for an algorithm; `ai/repo-guide.md` § Vendored libraries |
| Condition list | `defs.js` default (empty list) → `rel_filter` when it needs another column → a `condition_table` in the dialog → the pipeline or styling pass that reads it | `rel_filter_test.js`, `check_registry.js`, typecheck |
| Diagram-object type | `defs.js` `DIAGRAM_TYPES` (closed set) → pipeline filter and traversal → writer | `nesting_test.js`; in Archi |
| Action | `defs.js` `ACTION` → `run_preset` file-name map → dialog button → object set in the pipeline; the writer stays action-agnostic (SPEC rule 9) | every level; SPEC § 5 |
| Styling group | `defs.js` appearance defaults → `appearance.js` → Appearance tab | in Archi; SPEC § 10 |
| Preset shape | `DEFAULT_PRESET`, `schemaVersion` + 1, a one-shot migration in `tools/` that rewrites every preset and `_session.json` | `preset_diff.js`; every preset loads |

### Test levels

| Level | How | Covers | Does not cover |
|---|---|---|---|
| Static | `npm run typecheck` (CI) | The [typed contracts](#typed-contracts) and jArchi API use in `lib/` | Behaviour; `.ajs` entry scripts, `tools/` |
| Unit, Node | `node Scripts/View/tools/rel_filter_test.js`, `nesting_test.js [model.archimate]` (CI); `compose_test.js` (object set and predicted counts on the test model, per view and action); `counts_test.js` (the dialog's counts on the test model) | Condition model; nesting resolution: several parents, every container, cycles, order independence (also on a model's view in both relation orders); managed occurrences: capture, pairing, connections between occurrences | Engines, writer |
| Consistency, Node | `check_registry.js`; `gen_docs_tables.js [--write]` (check by default) | Registry ↔ defaults ↔ dialog widgets; generated doc tables up to date | — |
| Plan on a real view, Node | `view_harness.js <model.archimate> <view path> [preset] [--action=<id>] [--write-plan]`; as a module `readSnapshot` gives the `Snapshot` and `planView` runs `generate_view.plan` on it | A view from a model file → the run's own plan: object set → nesting → layout graph → engine → write plan; params masked as in Archi | Applying the plan (`view_writer.js`), rendering. Graphviz needs `dot` on the PATH |
| Write plans, Node | `node Scripts/View/tools/write_plans.js [--full]`: one digest per preset × algorithm × view × action on the test model; the baseline digests are in `plan/view-testability-baseline-write-plans.md` | The writer's decisions: positions relative to the container, keep / move / create / remove, pairing, connections, bendpoints, records; Graphviz needs `dot` on the PATH | Applying them |
| Layout regression, Node | `node tools/compare-layouts.js <checkout> <model> <view> [presets…]` (repo root `tools/`) on two checkouts, then diff; it lays out what a New view run makes (`planView`), so both checkouts need a harness with `planView`; the baseline digests of the [test model](#test-data) are in `plan/view-testability-baseline-layout-digests.md` | One digest per preset × algorithm, Graphviz included (a different `dot` version can change them): a change leaves layouts as they were | Writer |
| Written views, Archi + Node | `test/run_baseline.ajs` in Archi replaces `Views/Baseline` of the test model with the action × view × preset matrix and saves the model; `node Scripts/View/tools/compare-views.js --head` diffs it with the committed one (visual ids left out). Procedure: skill `view-baseline` | The writer as Archi applies it: parent-first placement, keep / create / remove, connections, bendpoints, managed-occurrence records, appearance | Rendering |
| No behaviour change | `node tools/same-code.js <file…>` (repo root `tools/`) | Only comments or JSDoc changed | — |
| In Archi | Run the action on a test view: golden path plus empty selection, one element, deep nesting; `test/test_visual_props.ajs`, `test/_test_self_loops.ajs`; `Scripts/Develop/probeJArchiApi.ajs` | Writer, rendering, dialog, the Java process runner, jArchi API assumptions | — |

### Judging a result

| Source | What it shows |
|---|---|
| The view in the model file (`.archimate`; with coArchi the saved working copy `temp.archimate`) | Bounds and bendpoints as Archi wrote them, so gaps, overlaps, line lengths and view size can be measured. Reading them: the skill, § Reading a view. |
| `preset_diff.js <preset.json> [other.json]` | What actually ran: the dialog's last run (`_session.json`) against the preset, after defaults; params the algorithm does not use are marked. |
| The console log ([steps](reference/engines.md#console-logging)) | The predicted counts against what was written (the count promise), relation roles, cycles, engine passes, view size; ⚠ for width-alignment and container-offset mismatches; preset-only values. `elk.js` logs the ELK options and `graphviz.js` the DOT attributes, so a run can be replayed outside Archi. |
| Archi itself | What only rendering shows: end symbols at 50 % zoom, labels, clipping by a container. |
| [test-cases.md](test-cases.md) | Every reported case: view, preset, finding, cause, change, status. Measurements in the decisions above refer to it. |

### Test data

- **Test model** `test/model/view-test.archimate`, in the repo, built by `test/build_test_model.ajs` (edit the script, rerun it in Archi, take a new baseline, commit both): three views in `Views/Test` — `1 Nesting` (composition and aggregation chains, two parents, a cycle, a reversed type, a self-loop, a note and a group), `2 Edited` (view 1 generated, then edited by hand: a moved visual, a user connection, an added element, a note and a diagram-block) and `3 Network` (20 elements in two parts, labelled relations, no nesting). `Views/Baseline` in the same file is the written result of the 10-run matrix; commit a new one only when a change is meant to alter the views. A second run in the same Archi session writes the same views (checked), so the model need not be reopened between runs.
- **Real models** are outside the repo; the paths and the coArchi working copy are in the skill.
- **Views** of a real model for testing are in the folder `Views/Test`.
- **Presets** for testing are in `presets/Test/`; `presets/Test/baseline/` holds the two the Archi baseline runs (`baseline.json`, `AlgoTwopi.json`) and `counters.json` (`baseline` with an empty step, the check of test case 16); `write_plans.js` takes all three. It is not edited without taking a new baseline. What the dialog last ran is in `presets/_session.json`.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The tabs share one widget map and one context (`DialogWidgets`, `DialogContext`) | A change to one tab's widgets can break another tab's update functions | The types in `types/view.d.ts`; every dialog change is checked in Archi |
| `dagre-cluster-fix` is a fork of unrecorded origin | A bug in it stays; there is no upstream to update from | Dagre is one algorithm; ELK covers compound layouts |
| Graphviz is installed by the user, and its behaviour differs per version | An update can change a layout or crash an option (`mode=ipsep` in 14.1) | The tested version in [Context](#context); the time limit stops a hang |
| jArchi behaviour that is not documented ([Platform constraints](#platform-constraints)) | A jArchi update can break the writer or the dialog | The constraints in one place; `Scripts/Develop/probeJArchiApi.ajs` |
| ELK runs on the UI thread and cannot be stopped | A large selection freezes Archi until ELK ends | Pack capped; the scale budget of SPEC § 13 is still to define |
| No test model in the repo | The harness and the layout regression cannot run in CI; a regression is found late | `tools/compare-layouts.js` by hand before a layout change |
| Empty catches | A failure leaves a wrong view without a reason | The closed list in [Errors](#errors); Known gap 8 |

## Known gaps

Where the code, its tests or its tooling do not yet meet SPEC.md, `reference/` or this document: the to-do list. Fixing one removes it here.

1. Unknown preset keys are dropped without a warning (SPEC § 12, § 14).
2. A fixed switch in `generate_view` picks the adapter, not a registry (SPEC § 3).
3. The Properties tab and the preset row are not modules of their own; they are in `gui/dialog_main.js` (SPEC § 3, § 9).
4. `engineParams` is passed through as-is, not typed per engine; a run checks its keys, but a value of the wrong type (e.g. a string for `ELK`) is not reported ([presets](reference/presets.md#settings-outside-the-dialog)).
5. There is no master *Apply styling* switch: `appearance.enabled` is not in `DEFAULT_PRESET`, so validation drops it (SPEC § 10).
6. Look and feel ([principles](reference/gui.md#look-and-feel)); seen in the code, still to check in Archi:
   - The Appearance and Properties tabs lay out their rows on their own, without the tab's heading column (Look 6).
   - The opening explanations of *Expand selection* and the Appearance groups are black, not grey; two have a fixed width instead of wrapping at the group width (Look 9).
   - Group margins differ: the Layout tab uses wider inner margins than the other tabs (Look 8).
   - Style by nesting level: the root-size spinner has no label (Look 4). Its info line says "nesting types" instead of *Nesting condition* (SPEC rule 16).
   - The preset row, the totals line and the action area have not been checked against the principles yet.
7. Testing:
   - SPEC § 13 acceptance is not automated: the count promise (predicted = written) is checked only in Archi, and no scale budget is defined.
   - CI runs the typecheck and the two unit tests, not `check_registry.js` or `gen_docs_tables.js`.
   - The test model and its baseline are in the repo, but CI does not use them yet: the harness, the layout regression, `write_plans.js` and `compare-views.js` run by hand.
   - Applying a plan (`view_writer.js`) has no Node test; only Archi runs it. `nesting_test.js` models a write for the pairing tests (`simulateWrite`, local to the test) instead of using the real plan.
8. Errors ([Errors](#errors), SPEC § 12):
   - A failed run reaches only the console: `generate_view` catches every failure itself, so no entry point can show a message box.
   - About 90 empty catches in `lib/`, many outside the closed list.
   - Strings are thrown instead of `Error`: `generate_view` (engine switch, view folder), `preset_io.readPreset`, `defs.validatePreset`, `run_preset.parseFilename`.
   - A failed preset save is only logged: `writeJSON` catches it, and `writePreset` still logs `Preset saved`.
9. The confirm before *One view each* writes more than 20 views is asked by `generate_view` (`window.confirm`), not by the entry point (SPEC § 3, § 5); a headless caller gets it too.
10. Step expansion and relation collection follow the order of jArchi's `rels()` (the order the model stores relations in), so *Order as selected* layouts depend on it; Determinism says no result does. Sorting by id would change those layouts and the Archi baseline. The order is also not stable within an Archi session: drawing a connection (`view.add(relation, …)`) moves its relation to the end of `rels()` (probed), so the harness's relation index matches only a freshly opened model.
11. *New view* does not copy an image object (SPEC § 5 "What Create takes from a view"): jArchi's `createObject` cannot make one, and model changes go only through the public jArchi API (§ Writer). It is laid out and counted, then left out with a console line, so its place stays empty.
12. Opening the written view uses Archi's own Java classes, outside the supported jArchi API (§ Platform constraints): a later Archi version may change them. `view.openInUI()` would make the model tree select the model after every action.
