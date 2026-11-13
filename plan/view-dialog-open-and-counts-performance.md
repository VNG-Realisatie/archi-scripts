# View: dialog open and counts performance

Status: proposal 2026-11-13. Measuring script committed (`Scripts/View/tools/gui_timing.ajs`); no fix applied. Next: measure on Windows, then choose the fixes.

## Handoff: measuring on Windows

1. `git pull` on branch `GEMMAviews`; open the model *Gemeentelijke bestuurscontext — Sociaal domein* in Archi.
2. Select the view *Requirements View — gemeentelijke selectie* (972 objects) in the model tree, run `Scripts/View/tools/gui_timing.ajs`, close the dialog with Cancel, copy the table from the console. Repeat with the principle *Belang betrokkene bij cliëntondersteuning voorop* (small selection).
3. Repeat both with a Windows Defender exclusion for the `Scripts/` folder: separates Windows overhead from code cost.
4. Compare with the Linux numbers below, and choose among the proposals.

A Claude Code session on Windows: read this plan, run the script in Archi as above, or through Archi's command line (`~/scoop/apps/archi/current/Archi.exe`, skill `jarchi-scripting` § Running headless; `archi_cli.sh` is bash, Linux only) with `SELECT_TYPE`, `SELECT_NAME` set.

## Goal

What: the View dialog opens faster and its counters follow a change faster, especially for a large selection and on Windows.
Why: opening the dialog on a large selection takes seconds; every change of a condition recounts the whole pipeline.
Constraint: the most gain for the least code; no new mechanism in the GUI. The measurement stays repeatable.

## Measurements

Archi's command line (`View/tools/archi_cli.sh`) on Linux, model *Gemeentelijke bestuurscontext — Sociaal domein* (13 511 elements, 7 892 relations), session preset (Default, 3 steps). Windows not measured yet.

| | 1 principle (16 on the view) | view, 341 objects | view, 972 objects |
|---|---|---|---|
| Load all modules | 457 ms | ≈ same | 376 ms |
| Build the four tabs | ≈ 590 ms | ≈ 500 ms | ≈ 500 ms |
| One recount (`dialogCounts`) | 12 ms | 196 ms | 490 ms |
| Recounts while opening | 4 | 4 | 4 |
| Dialog open → shown | 1.8 s | 2.4 s | 3.7 s |

Large view, per part:

- **Load**: chroma-js 58 ms, `defs.js` 43, `Common.js` 21; the rest under 15 ms each.
- **Tabs**: Appearance 232 ms, Layout 130, Properties 111 (reads the properties of every view in the model), Selection 25, preset row 17.
- **`_syncToUI`** 1.9 s, of which `addRelatedBlock` ×3 = 1.75 s: each step block triggers a full recount (`tab_selection.js` `addRelatedBlock` → `ctx.recount()`), then the dialog recounts once more.
- **One recount** (490 ms):
  - steps expanded: 133 ms
  - layout condition counts: 140 ms, of which `splitNestingRels` + `resolveNesting` 53 and the per-condition matching (`featureConditionCounts`) ≈ 87
  - `predictViewCounts`: 61 ms (resolves the nesting again)
  - filter table counts: 25 ms
  - relations between: 22 ms
  - ≈ 110 ms not attributed: step condition counts, among them the cache signatures (`_idsSig` hashes every id of input, cumulative and seen per step)
- **Setting the counters on the widgets**: under 6 ms per recount. The layouts around them cost more: `_showTotals` → `area.layout(true, true)` 28 ms per refresh, and `_renumberAndReorderRelBlocks` → `shell.layout(true, true)` 30 ms per step block.

## When the dialog needs what

| Needed for | When | Cost today |
|---|---|---|
| Totals line (action area, always visible) | open, every change | full pipeline incl. `predictViewCounts` |
| Filter table counts, step counts | Selection tab visible | in every recount |
| Nesting / reverse table counts | Layout tab visible | 140 ms in every recount, on any tab |
| Predicted elements (style property lists, ⚠ warnings) | Appearance tab, dropdown | by-product of the recount |
| Layout tab widgets (algorithm, nesting conditions) | every recount reads them (`_countInput`) | built at open |
| Appearance and Properties tabs | only when shown and at save (`_saveUI` writes every appearance key from its widgets) | 343 ms at open |

Conclusions:
- The step-block recounts while opening do nothing the final recount does not do again: pure waste, and the biggest cost (75 % of the recount time while opening).
- The Layout tab cannot be built lazily: the counts read its widgets.
- Appearance and Properties could be built lazily, but `_saveUI` and `_syncToUI` then need a per-tab "built" guard, or a closed tab would write defaults over the session. That is spread over two functions and every appearance key: more code for ≈ 0.35 s.

## Proposal, by gain per line of code

1. **One recount while opening and loading a preset.** Move `ctx.recount()` out of `addRelatedBlock` to the *Add step* button handler, its only other caller. `_syncToUI`'s callers already recount once afterwards (dialog open, `_loadPreset`). One line moved; −3 recounts per open and per preset load (−1.45 s on the large view; more on Windows). No behaviour change.
2. **Resolve the nesting once per recount.** `predictViewCounts` and `layoutConditionCounts` both split and resolve the nesting of the same predicted view. Resolve once in `dialogCounts` and pass it to both: −53 ms per recount (≈ 10 %). Small refactor in `counts.js` / `nesting.js`. Check first: `predictViewCounts` gets `onView` (without elements that appear only inside a diagram-block), `layoutConditionCounts` gets `cumulative`. With one resolve, the Layout tab counts follow `onView`, which is what is written. This only differs when a diagram-block holds elements.
3. **Measure before optimising the rest of the recount.** The ≈ 110 ms not attributed (cache signatures) and `featureConditionCounts` (87 ms) are the next candidates. With the measuring script they can be wrapped and measured first.

Not proposed:
- Layout condition counts only when the Layout tab is shown: −140 ms per change on other tabs, but needs a stale flag and a tab listener; reconsider after 2 and 3.
- Lazy Appearance / Properties tabs: see the conclusions above.
- Fewer layouts (`requestLayout` instead of `layout(true, true)`): ≈ 30 ms per change after fix 1; a GTK layout risk for little gain.
- Bundling or minifying modules: load is 0.4 s of 4 s, and parsing stays.
- Windows: first try a Defender exclusion for the `Scripts/` folder (no code). Then compare the measuring script on Windows against these numbers.

## Measuring without code in the GUI

One script, `Scripts/View/tools/gui_timing.ajs`, measures the unchanged code; the in-code instrumentation used first is dropped (local `git stash` "View GUI timing: in-code instrumentation").

- **Same dialog**: it opens the dialog as `_gui.ajs` does and logs one table when the dialog closes: calls, total, average and max per label.
- **Module load**: it requires the modules leaf-first, so each line costs that module alone. A module missing from the list is counted with the first one that requires it.
- **Wraps exported functions** of the modules it loaded: the tab builders, `addRelatedBlock`, `dialogCounts`, the `selection_read` readers, `Pipeline.expandStepWithRelations` / `findRelationsBetween`, the `Nesting` functions, `PresetIO`. Module objects are shared, so every `Module.fn(…)` call goes through the wrapper. A listed name that is not a function stops the script, so a rename cannot silently drop a measurement.
- **Dialog open → shown**: the first runnable of the dialog's event loop.
- **Command line**: `SELECT_TYPE` / `SELECT_NAME` pick the selection (there is none there), `CLOSE_AFTER_MS` closes the dialog as its close button does (Cancel, no run).
- **In Archi** (Windows): select and run it from the Scripts Manager.

Limits:
- Private functions (`_syncToUI`, `_refreshAction`, the `layout` calls) and destructured imports are not measured; the difference between "open → shown" and the measured parts is their time.
- A wrapper adds a few µs per call; do not wrap per-object functions (`matchElement`, `matchRelation`).

The CLI quirks found, to note in the jarchi-scripting skill § Running headless:
- `shell` is not defined (`dialog_main.js` passes it to the dialog).
- A bare `require("chroma-js")` from a script outside `Scripts/` is not resolved.
- Closing with `Window.close()` returns OK and runs the action; close the shell instead.

## Found on the way

- The console block "GUI — before dialog" never shows elements, relations or diagram objects. `dialog_main.js` passes `elems` / `rels` / `diag`; `Pipeline.logCountBlock` knows only `elements` / `relations` / `diagramObjects` (rule 2: one name per concept). Fix in its own commit.

## Steps after approval

1. Done: `tools/gui_timing.ajs` replaces the in-code instrumentation.
2. Fix 1; measure (command line, large view); the user checks in Archi: open, preset load, add / remove step.
3. Fix 2; `counts_test.js`, typecheck, measure.
4. The "GUI — before dialog" log fix.
5. With the Windows numbers (Handoff): decide on 3 and the not-proposed items.
