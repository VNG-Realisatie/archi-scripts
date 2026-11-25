# View: dialog open and counts performance

Status: code done and checked on Linux and Windows. Decided 2026-11-24: no lazy tabs. Open, not for the dialog: § Handoff.

## Goal

What: the View dialog opens faster and its counters follow a change faster, especially for a large selection and on Windows.
Why: opening the dialog on a large selection took up to 24 s on Windows, and every change of a condition recounted the whole pipeline.
Constraint: the most gain for the least code; no new mechanism in the GUI; the measurement stays repeatable (§ Measuring).

## What was done, and why

| Change | Why | Commit |
|---|---|---|
| One recount while opening and loading a preset (`addRelatedBlock` no longer recounts; *Add step* does) | each step block triggered a full recount that the final recount repeats | a0f1933 |
| Fewer layouts: `_syncToUI` defers the shell's layout to one at the end; `_showTotals` lays out only the totals and notes | on Windows a full dialog layout per step block cost ≈ 0.6 s, and one on every change ≈ 0.5 s | a0f1933 |
| Nesting resolved once per recount, on the laid-out elements | counted twice; the Layout tab counts now follow what the writer draws | 53af7de |
| Every condition table a native table (`view-condition-table-as-native-table.md`) | on Windows each native window costs a fixed number of window events (§ Why Windows is slow); one table instead of one combo per cell | 7ee32fc |
| Step count cache keyed on the settings (`chainKey`), relation types read once (`relationTypes`) | hashing every id per recount cost almost what the cache saved; the proxies were read once per condition | 8106548 |
| Log block "GUI — before dialog" typed (`CountRow`) | it showed no counts: wrong keys, now caught by the typecheck | 2bda5d5 |
| Nesting note: relations with an end only inside a diagram-block get their own reason | the note counted them as "the child already has a parent" (found while checking the nesting-once change) | d3a5af5 |

Not done, and why: `setRedraw(false)` (no gain on either platform); lazy step bodies (steps always open expanded); Layout tab built lazily (the counts read its widgets); bundling modules (parsing stays).

## Results

*GEMMA domeinen* (1 613 objects), preset `Bestuurscontext/Capability`.

| | Before | After |
|---|---|---|
| Windows open → shown | 24.3 s | 4.2–4.6 s |
| Linux open → shown | 2.8–3.0 s | 1.75–1.81 s |
| Windows recount after a click | 0.31–0.46 s | 0.25–0.37 s |
| Windows `dialogCounts` at open | 0.77 s | 0.54 s |
| Controls · combo items at open | 617 · 2 340 | 429 · 159 |

Windows open → shown per change: 24.3 s → 12.2–12.9 s (one recount, fewer layouts) → 11.6 s (nesting once) → 4.2–4.6 s (native tables). Part of the step from 11.6 s down came from the laptop, not from code (window-event cost 280–420 → 90–130 µs, fewer programs open). On Linux the first two changes took a 972-object view from 3.5–3.7 s to 2.15 s.

What remains at open on Windows (≈ 4.5 s): tabs built 1.5 s (Appearance 0.55, Layout 0.38, Properties 0.28), filling the widgets 0.9 s, the final recount 0.73 s, the deferred layout 0.3 s; no single call stands out.

## Why Windows is slow

On the user's laptop (HP EliteBook 8 G1a, Windows 11 Enterprise) every native window event costs 100–300 µs, against ≈ 2 µs on an ordinary machine. That cost comes from Windows' own listeners, not from SWT, DPI scaling or one third-party program. The dialog cannot change it; it can only create fewer native widgets. JavaScript runs interpreted and every module is parsed again per run (jArchi 1.12 ships GraalJS without its compiler), so plain JavaScript is 2.5–4× slower there.

## Measuring

`Scripts/View/tools/gui_timing.ajs` opens the dialog as `_gui.ajs` does, times the modules, the exported functions and open → shown, counts the controls and combo items, closes the dialog and does not save the session. Model: a copy of the GEMMA model; preset `Bestuurscontext/Capability`; run twice. The view *GEMMA domeinen* has a different id per clone: Linux `id-ba72ad08ad1b475390125ad1938fd298`, Windows `id-1b4f4bbfef5c43f49340bd4f71733d70` (both 1 613 objects).

    SELECT_ID=<id> PRESET="Bestuurscontext/Capability" Scripts/View/tools/archi_cli.sh Scripts/View/tools/gui_timing.ajs <model copy>

Windows (Git Bash): the same environment variables, then `Archi.exe -application com.archimatetool.commandline.app -consoleLog -nosplash --loadModel <copy> --script.runScript "$(pwd -W)/Scripts/View/tools/gui_timing.ajs"`.

## Handoff

Decided 2026-11-24: no lazy Appearance / Properties tabs and no Properties-on-show; the dialog stays as it is (estimated gain ≈ 0.2–0.8 s of 4.5 s did not justify the risk).

Open, not for the dialog:
- A reference run of the script below on another Windows 11 machine. If it gives ≈ 2 µs per event, the laptop's setup is the cause (IT); 100+ µs would mean Windows 11 is normally this slow. Only if the other machine is fast: an event trace (`wpr`, admin rights) to name the processes that receive the events.
- A jArchi issue on interpreted JavaScript and on parsing every module per run.

`win32_events.ps1` (`powershell -ExecutionPolicy Bypass -File win32_events.ps1`), µs per event:

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
