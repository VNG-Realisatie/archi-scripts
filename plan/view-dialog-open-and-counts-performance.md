# View: dialog open and counts performance

Status: in progress 2026-11-13. Fix 1, fewer layouts, the log fix and fix 2 committed. Comparable run and split on both machines: the Windows cost is widget filling and layout (§ Linux against Windows per part). Next: the SWT micro-benchmark on Windows (§ Handoff), then the user chooses the next fix; the user's check of the Layout tab counts in Archi is still open.

## Handoff

Done: fix 1, fewer layouts (a0f1933), the log fix (2bda5d5) and fix 2 (53af7de) committed; typecheck and Node tests pass. Windows comparable run and split done (25b3e7e); Linux measured the same view and split (§ Comparable run, § Linux against Windows per part). Finding: plain JavaScript is ≈ 3× slower on Windows, widget filling and layout 12–27×. Which SWT call causes it is open: `tools/swt_timing.ajs` measures it in isolation.

Task for the Windows session (Git Bash in the repo clone, branch `GEMMAviews`). Measure and report, change no code.

1. `git pull`. Copy the GEMMA model (`gemma-archi-repository`, the coArchi clone; its path is in Archi's `models.xml`) to a scratch folder, as before.
2. The comparable run once more, now by id (§ Comparable run, Windows command): one run is enough; fill the Windows column if it differs from the run by name.
3. The SWT micro-benchmark, twice:

       ~/scoop/apps/archi/current/Archi.exe -application com.archimatetool.commandline.app -consoleLog -nosplash \
         --script.runScript "$(pwd -W)/Scripts/View/tools/swt_timing.ajs" > swt_timing.txt 2>&1

   Add the Windows numbers next to the Linux ones in § SWT micro-benchmark (the third round of each line; the first warms up).
4. Under § SWT micro-benchmark, name the line(s) that are far slower than on Linux, and the dialog code that does the same (combo filling: `condition_table.js` `comboItems` / `fillList`, `tab_layout.js` `_setComboItems`, `dialog_main.js` `_paramToWidget`; natural sizes: `widgets.js` `alignFormColumns`, `resizeScrolled`).
5. Commit only this plan (`docs(plan): …`, no co-author line, AGENTS.md hard rule 4) and push.

Still open for the user: the check of the Layout tab counts in Archi (fix 2): open the dialog on a selection with nesting conditions and compare the Nesting / Reverse counts with a run before 53af7de.

Optional: a Defender exclusion for the `Scripts/` folder (needs admin) and rerun step 2; only module load (1.4–1.6 s there vs 0.36 s on Linux) is expected to change.

## Comparable run

Same model, selection and preset on both machines; the measuring script does the rest. The local session is not used (it differs per machine) and not changed; the dialog closes itself once shown.

- Model: the GEMMA model (`gemma-archi-repository`, opened from its coArchi clone), on a copy.
- Selection: the view *GEMMA domeinen* in `Views/_Generated/Referentiecomponenten/Bedrijfsfuncties en referentiecomponenten`, by id: `id-ba72ad08ad1b475390125ad1938fd298` (1 613 objects). By name the Linux model holds 3 views of that name, Windows 1.
- Preset: `Bestuurscontext/Capability` (committed; 4 steps, 4 nesting conditions, Layered).
- The script's first line names OS, model, preset and selection: `Measured: … · selection 1 object(s), 1613 objects on its views`. A different selection or object count means a different model state: note it.

Linux (`Scripts/View/tools/archi_cli.sh`):

    SELECT_ID=id-ba72ad08ad1b475390125ad1938fd298 PRESET="Bestuurscontext/Capability" \
      Scripts/View/tools/archi_cli.sh Scripts/View/tools/gui_timing.ajs <copy of the GEMMA model>

Windows (Git Bash; `archi_cli.sh` is Linux only), on a copy of the model:

    SELECT_ID=id-ba72ad08ad1b475390125ad1938fd298 PRESET="Bestuurscontext/Capability" \
      ~/scoop/apps/archi/current/Archi.exe -application com.archimatetool.commandline.app -consoleLog -nosplash \
      --loadModel <copy> --script.runScript "$(pwd -W)/Scripts/View/tools/gui_timing.ajs" > gui_timing.txt 2>&1

Run it twice (the first run of a session can be slower) and keep both.

Both columns: the view by id, 1 613 objects (Windows by name, which there is the same view); three runs on Linux, two on Windows.

| After fix 2 (53af7de) | Linux | Windows | Factor |
|---|---|---|---|
| Load all modules | 0.35–0.37 s | 1.41–1.58 s | 4× |
| Tabs built (Selection · Layout · Appearance · Properties) | 0.03 · 0.13 · 0.24 · 0.09 s | 0.11–0.14 · 0.65–0.66 · 0.89–0.94 · 0.55–0.57 s | 4–6× |
| `addRelatedBlock` ×4 | 0.10 s | 1.33–1.44 s | 14× |
| `dialogCounts` ×1 | 0.56–0.59 s | 1.35–1.39 s | 2.4× |
| Dialog open → shown | 2.7–3.0 s | 11.6–11.7 s | 4× |

"Open → shown" is the first runnable of the dialog's event loop; on Linux it comes ≈ 0.8 s after the first paint (§ Linux against Windows per part), so the first paint is the better end mark for a split.

By name, the Linux model holds 3 views *GEMMA domeinen* (2 903 objects; two generated locally under `_Generated`), the Windows clone 1: the same view as by id. Hence the selection by id.

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

### Remaining open time, split (Windows, after fix 2)

Comparable run (§ Comparable run, Windows selection), two runs, open → shown 12.1 and 11.0 s. Temporary `Date.now()` marks in `dialog_main.js`, logged after the dialog closed, reverted. Each part is the time since the previous mark; largest first:

| Part | Run 1 · run 2 | Candidate fix · gain · lines · risk |
|---|---|---|
| Four tabs and preset row built | 2.45 · 1.82 s (Appearance 0.9, Layout 0.65, Properties 0.55) | Lazy Appearance and Properties tabs, built when first shown · ≈ 1.4 s · 40–60 (a "built" guard in `_saveUI` and `_fillWidgets` per appearance key) · medium: a tab not built must not write defaults over the session. Smaller first step: Properties reads the properties of every view in the model; read them when the tab is shown · ≈ 0.5 s · ≈ 10 · low |
| Before the dialog: `open()` up to `new ConfigDialog` (selection read, expand snapshot, preset, log block) | ≈ 1.7 · 1.6 s; the `gui_timing` readers account for 0.3 s (`describeVisuals` 0.21, `readDiagramBlocks` 0.05) | Split first (the rest of `open()` is private) · unknown |
| Deferred layout on release (one layout of the whole dialog) | 1.52 · 1.49 s | Inherent to the widget count; lazy tabs (above) shrink it too · part of the 1.4 s above · – · – |
| Step blocks: 4 condition tables built and filled | 1.36 · 1.50 s | Build a collapsed step's body when it is expanded · ≈ 1 s with collapsed steps, nothing when expanded · ≈ 20 · medium (`_saveUI` reads the table) |
| `dialogCounts` (final recount) | 1.41 · 1.45 s | § Proposal 3: wrap `featureConditionCounts` and the cache signatures (`_idsSig`) in `gui_timing.ajs`, measure, then decide · est. 0.3–0.5 s · unknown · low (Node tests) |
| Fill: algorithm, layout params, view size | 1.23 · 0.84 s | Unexpected for setting radios, spinners and a combo: probably a listener doing work per set. Split first (per widget) · up to ≈ 1 s · likely a few lines · low |
| First paint after `getInitialLocation` (shell open, layout, paint) | 0.48 · 0.45 s | Inherent · – · – · – |
| Fill: appearance tables and pickers | 0.40 · 0.35 s | Goes with lazy Appearance tab |
| `_showCounts` (counters on the widgets) | 0.33 · 0.38 s | Low priority; counters on hidden tabs could wait until shown · ≈ 0.2 s · stale flag · medium |
| Fill: filter tables | 0.32 · 0.36 s | – |
| JFace before `createDialogArea` (shell, title area) | 0.25 · 0.19 s | Inherent |
| Fill: `updateAlgorithmControls` 0.20 · 0.19, `updateNestingLevelState` 0.11 · 0.10, `updateAppearancePropStates` 0.07 · 0.05; `buildActionArea` 0.05; refresh action 0.04; rest of `createDialogArea` 0.06; `getInitialSize` 0.02 | < 0.2 s each | – |

Not in "open → shown": module load 1.4–1.6 s (Defender exclusion: user, no code).

Order by gain per line: (1) split "fill: layout params" and "before the dialog", both cheap to look at and possibly a one-line cause; (2) Properties tab read on show; (3) Proposal 3 measured; (4) lazy Appearance tab, only if still needed.

### Linux against Windows per part

The same marks on Linux (same view by id, same preset; two runs, temporary, reverted):

| Part | Linux | Windows | Factor |
|---|---|---|---|
| Before the dialog (`open()` → `new ConfigDialog`) | 0.26 s | 1.65 s | 6× |
| JFace before `createDialogArea` | 0.11 s | 0.22 s | 2× |
| Tabs and preset row | 0.50 s | 2.1 s | 4× |
| Fill: algorithm, layout params, view size | 0.09 s | 1.0 s | 12× |
| Fill: filter tables | 0.02 s | 0.34 s | 17× |
| Fill: step blocks | 0.10 s | 1.43 s | 14× |
| Fill: appearance tables, pickers | 0.04 s | 0.37 s | 9× |
| Fill: `update*` states | 0.04 s | 0.38 s | 10× |
| Deferred layout on release | 0.055 s | 1.5 s | 27× |
| `dialogCounts` (plain JavaScript) | 0.51 s | 1.43 s | 2.8× |
| `_showCounts` (counters into the combos) | 0.014 s | 0.35 s | 25× |
| First paint after `getInitialLocation` | 0.10 s | 0.46 s | 4.5× |

Conclusion: plain JavaScript (counts, module load) is 2.5–4× slower on Windows; filling widgets and laying them out 9–27×. That is where the Windows time is, and what Linux measurements cannot show. The widgets filled and laid out are mostly read-only combos with many items (condition tables, layout params), filled item by item (`combo.add` per item, after `removeAll`); and natural sizes (`computeSize(SWT.DEFAULT, …)`), which on Win32 may measure the text of every item, are asked by `alignFormColumns` and the scroll pages. Which of these is the cost: § SWT micro-benchmark. Lazy tabs and lazy step bodies (§ Remaining open time, split) cut the widget count and so help either way, at more code.

### SWT micro-benchmark

`Scripts/View/tools/swt_timing.ajs`: 40 read-only combos × 60 items in an unshown shell, three rounds per line (ms per round; the first warms up), each way of filling and sizing, and labels as a baseline.

| Line | Linux | Windows |
|---|---|---|
| create combos (empty) | 35 · 17 · 14 | |
| create + fill item by item (add loop) | 63 · 52 · 46 | |
| create + fill with setItems | 43 · 41 · 40 | |
| refill: removeAll + add loop | 82 · 77 · 77 | |
| refill: setItems | 75 · 72 · 72 | |
| computeSize(DEFAULT) per filled combo | 89 · 88 · 86 | |
| computeSize(hint) per filled combo | 87 · 85 · 87 | |
| layout, filled combos without width hint | 164 · 163 · 163 | |
| layout, filled combos with width hint | 142 · 141 · 143 | |
| baseline: create labels + setText + layout | 9 · 7 · 7 | |
| baseline: 2 400 JS → Java calls | 5 · 2 · 2 | |

On Linux no line stands out: `setItems` and a width hint gain little. The candidate fix follows from the Windows column: `setItems` instead of the add loop (4 places, a few lines each, low risk), width hints where `computeSize(DEFAULT)` is asked, or fewer combos (lazy tabs / step bodies).

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
