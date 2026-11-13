# View: dialog open and counts performance

Status: in progress 2026-11-13. Fix 1, fewer layouts, the log fix and fix 2 committed. Measured on both machines; the Windows widget cost lies in Windows' window events, not in the code (§ Windows: why native widgets are slow). Next, on Linux: count the widgets at open, then fewer native widgets at open.

## Handoff

Done: fix 1, fewer layouts (a0f1933), the log fix (2bda5d5) and fix 2 (53af7de) committed; typecheck and Node tests pass. Comparable run, split and SWT micro-benchmark on both machines. Cause of the Windows widget cost found as far as it goes without admin rights (§ Windows: why native widgets are slow): every native window event costs 100–300 µs on this laptop, spread over Windows' own listeners; not a third-party program, not SWT, not DPI scaling. The dialog cannot change that; it can create fewer native widgets at open.

Next, on Linux (the user changes the dialog there):
1. Count what the dialog creates at open: native widgets per kind (Combo, Text, Button, Label, Composite) and combo items in total, on the comparable run (§ Comparable run). A script like `gui_timing.ajs` that walks the dialog's shell once it is shown; no change to the dialog code.
2. With that count, the user chooses (§ Windows: why native widgets are slow › Options in the dialog): items filled on first use, lazy step bodies and tabs, or one cell editor per condition table.
3. Measure each change on Linux; the Windows effect follows from the widget and item count (≈ 4–7 ms per combo, ≈ 0.12–0.4 ms per item on that laptop).

Open, not for the dialog: a reference measurement of `win32_events.ps1` (§ Windows: why native widgets are slow) on another Windows 11 machine; an event trace only if that machine is fast; a jArchi issue on interpreted JavaScript and per-run parsing.

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

Windows, by id (2026-11-13): `id-ba72ad08…` is not in the Windows clone (0 objects selected): it is one of the two views generated locally on Linux under `_Generated`. The Windows view *GEMMA domeinen* is the original, `id-1b4f4bbfef5c43f49340bd4f71733d70` under `Views/…/Domein en doelgroep/Domeinen`, also 1 613 objects. So Linux and Windows measure two views with the same object count, not the same view; for one view on both, select `id-1b4f4bbfef5c43f49340bd4f71733d70` on Linux too. One run by that id: load 0.95 s, tabs 0.09 · 0.46 · 0.60 · 0.48 s, `addRelatedBlock` ×4 0.97 s, `dialogCounts` 0.91 s, open → shown 8.5 s; the whole machine was ≈ 30 % faster than in the earlier runs (load 0.95 against 1.4–1.6 s), so the table keeps the earlier runs. With nothing selected (the unknown id) open → shown is still 6.7 s on Windows: most of the open time does not depend on the selection.

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

| Line | Linux | Windows (run 1 / run 2) | Factor (third round) |
|---|---|---|---|
| create combos (empty) | 35 · 17 · 14 || 334 · 289 · 292 / 324 · 272 · 301 | 20× |
| create + fill item by item (add loop) | 63 · 52 · 46 || 1342 · 1380 · 1415 / 1306 · 1254 · 1244 | 27–31× |
| create + fill with setItems | 43 · 41 · 40 || 1770 · 977 · 1054 / 1009 · 1065 · 1074 | 26–27× |
| refill: removeAll + add loop | 82 · 77 · 77 || 2280 · 2329 · 2306 / 2062 · 2052 · 2029 | 26–30× |
| refill: setItems | 75 · 72 · 72 || 1813 · 1993 · 1917 / 1694 · 1770 · 1803 | 25–27× |
| computeSize(DEFAULT) per filled combo | 89 · 88 · 86 || 1110 · 1105 · 1187 / 967 · 980 · 1052 | 12–14× |
| computeSize(hint) per filled combo | 87 · 85 · 87 || 1114 · 1099 · 1083 / 1050 · 988 · 1070 | 12× |
| layout, filled combos without width hint | 164 · 163 · 163 || 1297 · 1259 · 1268 / 1153 · 1237 · 1234 | 8× |
| layout, filled combos with width hint | 142 · 141 · 143 || 1194 · 1311 · 1241 / 1168 · 1179 · 1188 | 8× |
| baseline: create labels + setText + layout | 9 · 7 · 7 || 82 · 50 · 43 / 47 · 53 · 46 | 6–7× |
| baseline: 2 400 JS → Java calls | 5 · 2 · 2 || 7 · 8 · 7 / 13 · 4 · 3 | 2–4× |

On Linux no line stands out: `setItems` and a width hint gain little. The candidate fix follows from the Windows column: `setItems` instead of the add loop (4 places, a few lines each, low risk), width hints where `computeSize(DEFAULT)` is asked, or fewer combos (lazy tabs / step bodies).

Windows (2026-11-13, two runs, `Archi.exe` command line): every combo line is far slower, not one way of filling or sizing. Per read-only combo with 60 items, third round:
- creating it, empty: ≈ 7 ms (Linux 0.35 ms), 20×
- filling it: ≈ 25 ms item by item, ≈ 19 ms with `setItems` (Linux ≈ 0.8 ms); refilling (`removeAll` first) ≈ 50 ms either way, 25–30×
- `computeSize`, with or without a width hint: ≈ 27 ms, 12–14×
- `layout`: ≈ 30 ms, with or without a width hint, 8×
- labels (create, `setText`, layout): 6–7×; plain JS → Java calls: no real difference.

So the cost is per combo and per item on Win32, whatever the API: `setItems` gains ≈ 20 % of the fill (create + fill 1.05 against 1.24–1.42 s), refill ≈ 10 %, and a width hint nothing. Dialog code doing the same:
- combo filling: `condition_table.js` `comboItems` / `fillList` (every condition row, filter, step, nesting, style tables), `tab_layout.js` `_setComboItems`, `dialog_main.js` `_paramToWidget`: the fill and refill lines (25–30×), matching "Fill: filter tables / step blocks / layout params" (12–17×) in § Linux against Windows per part;
- natural sizes: `widgets.js` `alignFormColumns`, `resizeScrolled`: the `computeSize` line (12–14×), and the deferred layout (27× in the dialog, 8× here).

Consequence for the candidates: `setItems` alone is a small gain (≈ 20 % of fill time, a few lines, low risk). The real gain is fewer combos or fewer items at open: lazy step bodies and lazy tabs (§ Remaining open time, split), or filling a combo's item list only when it is opened (one mechanism in `condition_table.js`, fewer items to measure and lay out). Not measured: how `computeSize` and `layout` scale with the item count (the benchmark uses 60 items only).

### Windows: why native widgets are slow

Machine: HP EliteBook 8 G1a (AMD Ryzen 7 250, mobile Zen 4, 8 cores), Windows 11 Enterprise, 125 % display scaling, measured on battery in the Balanced power mode; Defender for Endpoint (`MsSense`) running. The Linux machine is a desktop Ryzen 7700 (same generation, higher clocks).

Findings (2026-11-13, no code changed):
- **Not SWT.** Native Win32 combos built outside Java are as slow: WinForms in PowerShell ≈ 8 ms per empty combo, ≈ 50 ms per combo filled with 60 items; raw `CreateWindowEx("COMBOBOX")` from C# ≈ 4.2–4.7 ms per combo, `CB_ADDSTRING` ≈ 120 µs per item, a static label ≈ 0.35 ms.
- **Not DPI scaling.** `swt.autoScale.updateOnRuntime` true or false gives the same benchmark; the command line sets neither (SWT 4965, display zoom 125, `DPIUtil` device zoom 100).
- **Window events are the cost.** `NotifyWinEvent` per event, from the desktop window: ≈ 280–420 µs for foreground (0x0003), create, destroy, show, hide (0x8000–0x8003), selection (0x8006, 0x8007), state change (0x800A), location change (0x800B) and cloaked (0x8017); 0.02 µs for focus (0x8005), name change (0x800C) and value change (0x800E), which nothing listens to. A reported ordinary machine: 1.9 µs per event, 27.6 µs with one wide out-of-process hook, `CB_ADDSTRING` 72 µs ([Twinkle Tray #1352](https://github.com/xanderfrangos/twinkle-tray/issues/1352)). Creating a combo fires several of these events (the combo and its list window), filling and selecting fire selection and state events: ≈ 4 ms per combo.
- **No single culprit.** Closed one by one, the cost per event fell gradually from ≈ 290 to ≈ 105–140 µs (noise ± 30 µs): Citrix Workspace (all processes), Greenshot, Teams, CrossDeviceResume, AppActions, Radeon Software, App-V, Obsidian, Signal, KeePassXC, Syncthing, Adobe, Firefox, Outlook, WebView2, OneDrive, Archi, the security tray icon, the AMD and Realtek helpers. No third-party DLL is injected into a GUI process (in-process hook excluded). The rest is Windows' own listeners (Explorer, shell hosts, search) and VS Code (not tested: it ran the session).
- **Power mode**: likely part of the plain JavaScript factor (2.5–4× against a desktop of the same generation); unlikely to explain 50–150× per event. Not tested (the user skipped it).
- **JavaScript runs interpreted on both machines.** jArchi 1.12 ships GraalJS 24.1 without `truffle-runtime` / compiler jars, so on Archi's OpenJDK 21 GraalJS runs interpreter-only ([GraalVM: embedding languages](https://www.graalvm.org/latest/reference-manual/embed-languages/)); a loop of 3·10⁷ iterations takes 2.0 s on Windows. Each script run also parses every module again (load 0.36 s Linux, 1.4 s Windows). Both are jArchi's to change.

Known issues found: the SWT combo performance bugs are on GTK ([bug 487271](https://bugs.eclipse.org/bugs/show_bug.cgi?id=487271), [bug 489640](https://bugs.eclipse.org/bugs/show_bug.cgi?id=489640), [PR #3401](https://github.com/eclipse-platform/eclipse.platform.swt/pull/3401)); slow Win32 control creation is a known complaint ([wx-users](https://groups.google.com/g/wx-users/c/0QsOCki2CqY)); wide WinEvent hooks slow every other application ([Twinkle Tray #1352](https://github.com/xanderfrangos/twinkle-tray/issues/1352)).

Open on the Windows side (not for the dialog):
- A reference: the test below on another Windows 11 machine. ≈ 2 µs there: this laptop's setup (IT). 100+ µs there too: normal Windows 11.
- An event trace (only if the reference is fast): `wpr -start CPU -start GeneralProfile`, the test, `wpr -stop hook.etl` in an admin terminal, analysed in Windows Performance Analyzer (not installed; Store or ADK) with Microsoft symbols: the waits of `NotifyWinEvent` name the receiving processes. Needs admin rights; ≈ 5 min recording, 1–2 h analysis.
- Accessibility features that listen to window events (Voice Access, Live Captions, text cursor indicator): not checked.

The test (`powershell -ExecutionPolicy Bypass -File win32_events.ps1`); ≈ 2 µs per event is ordinary:

```powershell
Add-Type -TypeDefinition @"
using System; using System.Diagnostics; using System.Runtime.InteropServices;
public static class E {
  [DllImport("user32.dll")] static extern void NotifyWinEvent(int ev, IntPtr h, int obj, int child);
  [DllImport("user32.dll")] static extern IntPtr GetDesktopWindow();
  public static string Run() { string r=""; var h=GetDesktopWindow();
    foreach (int ev in new[]{0x0003,0x8000,0x8001,0x8002,0x8003,0x8005,0x8006,0x8007,0x800A,0x800B,0x800C,0x800E,0x8017}) {
      var sw=Stopwatch.StartNew(); for(int i=0;i<2000;i++) NotifyWinEvent(ev,h,-4,0); r+=String.Format("0x{0:X4} {1,7:F2} us\n",ev,sw.Elapsed.TotalMilliseconds*1000/2000); }
    return r; } }
"@
[E]::Run()
```

Options in the dialog: each native widget costs a fixed number of window events, so the gain the dialog controls is fewer native widgets and items at open. By size:
- Combo items filled on first use (focus or mouse down) instead of at creation: saves ≈ 0.12–0.4 ms per item on that laptop; a few lines in `condition_table.js`; low risk.
- Lazy step bodies (built on expand) and lazy Appearance / Properties tabs (§ Remaining open time, split): fewer widgets; 20–60 lines; medium risk (`_saveUI` reads them).
- One cell editor per condition table (JFace `TableViewer` with a `ComboBoxCellEditor`: cells are drawn text, one combo appears in the cell being edited): one native window per table instead of one combo per cell; the largest gain on every machine; a rewrite of `condition_table.js`.
- `setRedraw(false)` around `_fillWidgets`: may save state and location events; cheap to try in `swt_timing.ajs`; not measured.
- `setItems` instead of the add loop: ≈ 20 % of fill time (§ SWT micro-benchmark).

## Fix 2

`dialogCounts` splits and resolves the nesting once and passes it to the totals (`Nesting.countView`, the counting part of `predictViewCounts`, which the pipeline keeps calling) and to `layoutConditionCounts`. The Layout tab counts now resolve on the laid-out elements (`onView`), as the writer does (`docs/reference/gui.md` § Relation counters already says so); before they used every element, also those only inside a diagram-block. Node tests (`counts_test`, `nesting_test`, `compose_test`) unchanged.

Linux command line, view of 972 objects: one `dialogCounts` while opening 833 → 805 ms (split 48 + resolve 70 ms once instead of twice); open → shown 2.3 → 2.15 s. On Windows a fraction of the 1.4 s counts.

### Fix 2 checked

The Layout tab counts of the code before (`53af7de^`, a worktree) and after, in Node (the dialog's counting, as `counts_test.js` reads a view selected in the model tree), for every view of three models:

| Model · presets | View × preset | With nesting counts | Different |
|---|---|---|---|
| test model · `Test/baseline/baseline` | 19 (8 with diagram-blocks) | – | 0 |
| Bestuurscontext · Capability, Bedrijfsservice, Principe | 7 026 (no diagram-blocks) | 6 294 | 0 |
| GEMMA · Capability, publicerenApplicatieServices, TAenIA | 1 299 (108 with diagram-blocks) | 410 | 18 |

All 18 differences: a view with a diagram-block whose elements are in nesting relations; the totals are unchanged and only *Nested* and the multi-parent note change. Before, *Nested* counted nestings the totals did not have (*Beheerview kennismodel*: 98 nested against 0 nestings in the totals); now the two agree, as the writer draws it.

Found: those relations are counted in the note as "drawn as a line: the child already has a parent", but the reason is that an end sits only inside a diagram-block (`resolveNesting` puts a relation whose end is not laid out in `notNestedNestingRels`, `nesting.js`). A wrong reason in a note, rare (views with nesting relations into a diagram-block); a separate fix (its own count and sentence), after the user's choice.

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
