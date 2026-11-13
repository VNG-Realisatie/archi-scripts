# View: dialog open and counts performance

Status: in progress 2026-11-13. Fix 1, fewer layouts, the log fix and fix 2 committed. Next: a comparable run on Windows (§ Comparable run) and the user's check of the Layout tab counts in Archi; then split the remaining open time.

## Handoff

Done: fix 1, fewer layouts (a0f1933), the log fix (2bda5d5) and fix 2 (53af7de) committed; typecheck and Node tests pass. Windows before fix 2 (session preset): open → shown on *GEMMA domeinen* 24.3 → 12.9 s.

Task for the Windows session (Git Bash in the repo clone, branch `GEMMAviews`). Measure and report, change no code; a fix comes after the user's choice.

1. `git pull`. Find the GEMMA model (`gemma-archi-repository`, the coArchi clone; its path is in Archi's `models.xml`) and copy its `.archimate` to a scratch folder.
2. Comparable run, twice (§ Comparable run, Windows command). Check the `Measured:` line; fill the Windows column of the table there; note a different selection or object count.
3. Split the remaining open time. `gui_timing.ajs` does not see private functions, so add temporary `Date.now()` timing, logged once after the dialog closes (console output inside the dialog is unreliable), in `dialog_main.js`:
   - `_fillWidgets`, per section: layout params, filter tables, step blocks, view name, appearance tables, `updateNestingLevelState`, `updateAppearancePropStates`, `TabProperties.syncToUI`;
   - `_syncToUI`: the deferred layout when `setLayoutDeferred(false)` releases it;
   - the final recount: `_countInput`, `dialogCounts`, `_showCounts`, `_refreshAction`;
   - the end of `createDialogArea` → shown, split by wrapping JFace's `getInitialSize`, `getInitialLocation` and the first paint (`SWT.Paint` listener on the shell).
   Run twice with the comparable run's command, then revert the timing (`git checkout`).
4. Write the numbers into this plan: the table in § Comparable run and a list under § After fix 1 and fewer layouts › Remaining open time, with the largest parts first and a candidate fix per part (gain, lines of code, risk).
5. Commit only this plan (`docs(plan): …`, no co-author line, AGENTS.md hard rule 4) and push.

The user also checks the Layout tab counts in Archi (fix 2): open the dialog on a selection with nesting conditions and compare the Nesting / Reverse counts with a run before 53af7de.

Optional: a Defender exclusion for the `Scripts/` folder (needs admin) and rerun step 2; only module load (1–2 s there vs 0.4 s on Linux) is expected to change.

## Comparable run

Same model, selection and preset on both machines; the measuring script does the rest. The local session is not used (it differs per machine) and not changed; the dialog closes itself once shown.

- Model: the GEMMA model (`gemma-archi-repository`, opened from its coArchi clone), on a copy.
- Selection: the views named *GEMMA domeinen* (3 views in the model).
- Preset: `Bestuurscontext/Capability` (committed; 4 steps, 4 nesting conditions, Layered).
- The script's first line names OS, model, preset and selection: `Measured: … · selection 3 object(s), 2903 objects on its views`. A different selection or object count means a different model state: note it.

Linux (`Scripts/View/tools/archi_cli.sh`):

    SELECT_TYPE=view SELECT_NAME="GEMMA domeinen" PRESET="Bestuurscontext/Capability" \
      Scripts/View/tools/archi_cli.sh Scripts/View/tools/gui_timing.ajs <copy of the GEMMA model>

Windows (Git Bash; `archi_cli.sh` is Linux only), on a copy of the model:

    SELECT_TYPE=view SELECT_NAME="GEMMA domeinen" PRESET="Bestuurscontext/Capability" \
      ~/scoop/apps/archi/current/Archi.exe -application com.archimatetool.commandline.app -consoleLog -nosplash \
      --loadModel <copy> --script.runScript "$(pwd -W)/Scripts/View/tools/gui_timing.ajs" > gui_timing.txt 2>&1

Run it twice (the first run of a session can be slower) and keep both.

| After fix 2 (53af7de) | Linux | Windows |
|---|---|---|
| Load all modules | 0.36 s | |
| Tabs built (Selection · Layout · Appearance · Properties) | 0.03 · 0.13 · 0.25 · 0.10 s | |
| `addRelatedBlock` ×4 | 0.10 s | |
| `dialogCounts` ×1 | 0.71 s | |
| Dialog open → shown | 2.9–4.0 s | |

## Goal

What: the View dialog opens faster and its counters follow a change faster, especially for a large selection and on Windows.
Why: opening the dialog on a large selection takes seconds; every change of a condition recounts the whole pipeline.
Constraint: the most gain for the least code; no new mechanism in the GUI. The measurement stays repeatable.

## Measurements

Archi's command line (`View/tools/archi_cli.sh`) on Linux, model *Gemeentelijke bestuurscontext — Sociaal domein* (13 511 elements, 7 892 relations), session preset (Default, 3 steps). Windows: § Measurements on Windows.

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

## Measurements on Windows

Archi's command line on Windows 11 (`Archi.exe` 5.9, jArchi 1.12), the Windows clone of the model, view *UWV-administratiegegevens voor aangewezen wettelijke derden beschikbaar stellen* (553 objects), session preset (4 steps). Three runs; the split below comes from temporary timing in `tab_selection.js` / `dialog_main.js`, reverted.

| | Windows, 553 objects | Linux, 972 objects |
|---|---|---|
| Load all modules | 1.4–2.2 s | 0.38 s |
| Build the four tabs | ≈ 1.5 s (Layout 0.6–0.8, Appearance 0.7–0.9) | ≈ 0.5 s |
| `_syncToUI` | 13.9 s | 1.9 s |
| of which `addRelatedBlock` ×4 | 10.4–11.1 s | 1.75 s (×3) |
| Final recount | 0.7 s | 0.5 s |
| End of `createDialogArea` → shown | 2.9 s | – |
| Dialog open → shown | 18.4 s | 3.7 s |

One `addRelatedBlock` (≈ 2.7 s):
- condition table built and filled: 0.3–1.3 s
- `_renumberAndReorderRelBlocks`: 0.6–0.85 s, nearly all `shell.layout(true, true)` (0.5–0.7 s)
- `ctx.recount()`: 0.8–2.3 s
- `resizeScrolled`: 0.01–0.2 s

One recount (`_updateFilteredCount`, ≈ 0.9–1.7 s):
- `dialogCounts` with its input: 0.25 s (0.7 s the first time)
- `_showCounts` (counters on the widgets): 0.1–0.3 s
- `_refreshAction` → `_showTotals` → `area.layout(true, true)`: 0.45–0.8 s, the largest part

Not split yet: ≈ 3.5 s of `_syncToUI` outside `addRelatedBlock` (filter tables, `updateNestingLevelState` 0.16 s, …).

Consequence:
- On Windows the cost is SWT layout and widget work, not counting: per change of a condition ≈ 0.25 s counts against ≈ 0.6 s layout and counters.
- Fix 1 gains more on Windows: −3 recounts ≈ −4.9 s per open and per preset load.
- "Fewer layouts" (Not proposed below) is no longer small: `shell.layout` per step block ≈ 2.5 s per open, and `area.layout` in `_showTotals` ≈ 0.5 s on every change. Laying out once after `_syncToUI`, and laying out the action area only when its line count changes, become candidates next to fix 1.
- Fix 2 (−53 ms on Linux) is minor on Windows.

## After fix 1 and fewer layouts

Changes:
- Fix 1: `addRelatedBlock` no longer recounts; the *Add step* button recounts after it. `_syncToUI`'s callers recount once.
- `_syncToUI` holds the shell's layout requests (`setLayoutDeferred`) while it fills the widgets: one layout at the end instead of a full dialog layout per step block and table.
- `_showTotals` lays out only the totals labels, the notes and their ancestors (`area.layout(Control[])`) instead of `area.layout(true, true)`.

Both SWT calls checked headless in GraalJS (a label grows after `layout(Control[])`; a deferred layout runs on release).

Windows command line, GEMMA model (`gemma-archi-repository`), its largest view *GEMMA domeinen* (1 613 objects), session preset (4 steps); before = same run with the changes stashed:

| | before | after |
|---|---|---|
| Dialog open → shown | 24.3 s | 12.2–12.9 s |
| `addRelatedBlock` ×4 | 13.2 s | 1.8–2.0 s |
| `dialogCounts` while opening | 5 calls, 3.8 s | 1 call, 1.4 s |
| `_refreshAction` per recount (layout on every change) | 0.45–0.8 s (553-object view) | 32 ms |

Linux command line, same check as § Measurements (view of 972 objects): open → shown 3.5–3.7 s → 2.3 s; `addRelatedBlock` ×3 1.7 s → 62 ms; one `dialogCounts` while opening (833 ms, the first call).

Remaining open time (after, 12.2 s):
- load modules 1.0–1.5 s (not in "open → shown")
- tabs built: 1.9 s (Appearance 0.75, Layout 0.5–0.65, Properties 0.5)
- `_syncToUI` 5.6 s: filling the widgets 3.9 s (step blocks 2.0, the rest not split), the one deferred layout 1.7 s
- the final recount 2.0 s: counts 1.4 s, counters on the widgets 0.5 s
- end of `createDialogArea` → shown 3.4 s (JFace: initial size, layout, first paint)

Next candidates: the per-condition counts (§ Proposal 3) for the 1.4 s; the 3.4 s after `createDialogArea` and the 1.9 s of filling widgets outside the step blocks are not split yet.

## Fix 2

`dialogCounts` splits and resolves the nesting once and passes it to the totals (`Nesting.countView`, the counting part of `predictViewCounts`, which the pipeline keeps calling) and to `layoutConditionCounts`. The Layout tab counts now resolve on the laid-out elements (`onView`), as the writer does (`docs/reference/gui.md` § Relation counters already says so); before they used every element, also those only inside a diagram-block. Node tests (`counts_test`, `nesting_test`, `compose_test`) unchanged.

Linux command line, view of 972 objects: one `dialogCounts` while opening 833 → 805 ms (split 48 + resolve 70 ms once instead of twice); open → shown 2.3 → 2.15 s. On Windows a fraction of the 1.4 s counts.

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
- Fewer layouts: rejected on the Linux numbers (≈ 30 ms per change); applied after the Windows numbers, see § After fix 1 and fewer layouts.
- Bundling or minifying modules: load is 0.4 s of 4 s, and parsing stays.
- Windows: first try a Defender exclusion for the `Scripts/` folder (no code). Then compare the measuring script on Windows against these numbers.

## Measuring without code in the GUI

One script, `Scripts/View/tools/gui_timing.ajs`, measures the unchanged code; the in-code instrumentation used first is dropped (local `git stash` "View GUI timing: in-code instrumentation").

- **Same dialog**: it opens the dialog as `_gui.ajs` does and logs one table when the dialog closes: calls, total, average and max per label.
- **Module load**: it requires the modules leaf-first, so each line costs that module alone. A module missing from the list is counted with the first one that requires it.
- **Wraps exported functions** of the modules it loaded: the tab builders, `addRelatedBlock`, `dialogCounts`, the `selection_read` readers, `Pipeline.expandStepWithRelations` / `findRelationsBetween`, the `Nesting` functions, `PresetIO`. Module objects are shared, so every `Module.fn(…)` call goes through the wrapper. A listed name that is not a function stops the script, so a rename cannot silently drop a measurement.
- **Dialog open → shown**: the first runnable of the dialog's event loop.
- **Command line**: `SELECT_TYPE` / `SELECT_NAME` pick the selection (there is none there), `PRESET` replaces the session; the dialog closes once shown, as its close button does (Cancel, no run), and the session is not saved.
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
2. Done: fix 1 and fewer layouts; measured (command line, *GEMMA domeinen*); the user checks in Archi: open, preset load, add / move / remove step, a condition change.
3. Done: fix 2; Node tests, typecheck, measured. The user checks the Layout tab counts in Archi.
4. Done: the "GUI — before dialog" log fix (`CountRow` fields typed, so an unknown key fails the typecheck).
5. With the Windows numbers (Handoff): decide on 3 and the not-proposed items.
