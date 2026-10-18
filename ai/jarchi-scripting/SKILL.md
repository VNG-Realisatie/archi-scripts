---
name: jarchi-scripting
description: This skill should be used when the user asks to "write a JArchi script", "create an Archi script", "build an .ajs script", "add a dialog to a script", "use SWT widgets", "create a JFace dialog", "use Eclipse UI in JArchi", "extend a Java class in JavaScript", "use Java.type()", "work with ArchiMate elements", "use the jArchi API", "create a library module", "use GraalJS", mentions JArchi, Archi scripting, ArchiMate modeling scripts, SWT/JFace UI, or GraalVM JavaScript for Archi.
---

# JArchi Script Development

Procedural guide for writing JArchi scripts (GraalVM GraalJS, ECMAScript 2024). Requires Archi 5.8+ and Java 21 (jArchi 1.12+); earlier versions support Archi 5.5+ with jArchi 1.8+.

## Reference Documentation

All documentation is in `ai/jarchi-scripting/`:

- **`jarchi-api-reference.md`** — Complete jArchi API (v0.1–1.12): global objects, collection methods, model API, elements & relationships, views, visual objects, constants, version history with breaking changes
- **`jarchi-script-development.md`** — Repo-specific development guide: REPO_ROOT pattern, available `_lib/` modules (Common, selection, archi_folders, doEach, includeMergeConcept), jArchi-specific rules, coding standards, minimal template
- **`graaljs-compatibility.md`** — GraalJS/ECMAScript 2024 runtime: core features, internationalization, modules, `load()` semantics, global functions, debugging
- **`java-interop.md`** — Java interoperability from GraalVM: `Java.type()`, `Java.extend()`, constructing objects, field/method access, argument conversion, explicit overload selection, arrays, maps, exceptions, promises, multithreading

## Quick Start

1. **For complete API reference**: see `jarchi-api-reference.md`
2. **For repo patterns & conventions**: see `jarchi-script-development.md` (REPO_ROOT, `_lib/` modules, coding standards)
3. **For GraalVM/Java details**: see `graaljs-compatibility.md` and `java-interop.md`

## Running external processes (e.g. graphviz dot binary)

Use `Java.type("java.lang.ProcessBuilder")` to invoke CLI tools. No Node.js `child_process` — GraalJS has no such module.

```js
const ProcessBuilder = Java.type("java.lang.ProcessBuilder");
const Arrays         = Java.type("java.util.Arrays");

const pb = new ProcessBuilder(Arrays.asList("dot", "-Tjson", "-Kdot"));
pb.redirectErrorStream(false);  // keep stderr separate so JSON output is clean
const proc = pb.start();

// Write DOT source to stdin
const wr = new java.io.OutputStreamWriter(proc.getOutputStream(), "UTF-8");
wr.write(dotSource);
wr.close();  // closing stdin signals EOF to the process

// Read stdout (JSON) — must read before waitFor() to avoid deadlock on large output
let line, stdout = "";
const br = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getInputStream(), "UTF-8"));
while ((line = br.readLine()) !== null) stdout += line + "\n";
br.close();

// Read stderr separately
let eline, stderr = "";
const er = new java.io.BufferedReader(new java.io.InputStreamReader(proc.getErrorStream(), "UTF-8"));
while ((eline = er.readLine()) !== null) stderr += eline + "\n";
er.close();

const exitCode = proc.waitFor();
if (exitCode !== 0) throw new Error(`Process failed (${exitCode}): ${stderr.trim()}`);

const result = JSON.parse(stdout);
```

**Critical rules:**
- `redirectErrorStream(false)` — if true, stderr mixes into stdout, corrupting JSON.
- Always drain **both** stdout and stderr before `waitFor()`. If the process's output buffer fills and nothing is reading it, the process blocks → deadlock.
- Close `getOutputStream()` before reading — otherwise the process waits for more input.
- Wrap `pb.start()` in try/catch to give a clear "binary not found" error message.
- `Arrays.asList(...)` is required — `ProcessBuilder` expects a Java `List<String>`, not a JS array.

**Not in PATH? Custom binary location:**
```js
const bin = options.graphvizBin || "dot";  // let users configure the path
const pb  = new ProcessBuilder(Arrays.asList(bin, "-Tjson", "-K" + engine));
```

## Key Constraints

- Use `load()` for local files — **never `require()`** (resolves to `node_modules/`)
- No Web Workers, no async I/O, no `setTimeout` (unless shimmed)
- No Node.js modules (`fs`, `path`, `http`) — use `Java.type()` for Java equivalents
- `this` inside `Java.extend()` refers to the Java proxy — use object wrapper pattern (see `jarchi-script-development.md`)

## SWT / GTK Platform Rules

jArchi scripts run on SWT (Standard Widget Toolkit) with GTK native theming on Linux. These platform-specific behaviours and workarounds apply when building dialogs or UI extensions.

### Core SWT Behaviours

- **`SWT.TOGGLE` mutual exclusion**: calling `setSelection(false)` on a TOGGLE button programmatically does **not** fire a Selection event. Safe to iterate and deselect siblings without re-entry guards.
- **GTK rendering timing**: `setBackground()` / `setForeground()` called during `createDialogArea` may not render correctly until after the first paint. Use `display.asyncExec(fn)` in the `create()` callback to re-apply colors after the shell is visible.
- **`setBackground(null)` resets to system default**, but on GTK this is indistinguishable from the "active" appearance of toggle buttons. Always set an explicit `SWT.COLOR_WIDGET_BACKGROUND` for inactive state.
- **No console output inside an SWT handler of a modal dialog.** `console.log` / `console.error` called from a listener while a modal dialog is open blocks until that dialog closes; the rest of the handler then runs late (a child dialog it opens appears only after the parent is closed). This includes the `Loading …` line of a module first `require`d inside a handler: load such modules at top level, before the dialog opens.
- **Parent child dialogs on the calling dialog's shell** (`dlg.getShell()`), not on the global `shell` (Archi's main window): with the main window as parent the child can open behind the modal dialog. `Display.getActiveShell()` is not reliable for this on GTK (it can report the main window). Do not add `SWT.ON_TOP` to a dialog's shell style on GTK: the shell then does not show.
- **`setForeground(null)`** resets to system default (black). Use this for "active" state. Use `SWT.COLOR_DARK_GRAY` for "inactive but enabled" state.

### Bold Fonts

- `group.setFont(boldFont)` on a `GroupWidget` on GTK sets the title font.
- Create bold fonts via `new SWTFont(display, name, height, SWT.BOLD)`.
- **Never dispose** these fonts during dialog lifetime — the font object is referenced by the widget.

### Tab Controls

- Standard `TabFolder` on GTK/Linux does **not** support per-tab foreground/background styling.
- Use `tabFolder.setFont(boldFont)` for prominence.
- For per-tab styling, use `CTabFolder` from `org.eclipse.swt.custom` instead.

### Spinners & Number Inputs

- Use `GridDataFactory.swtDefaults()` on spinners, **not** `fillDefaults()` — `fillDefaults()` sets `SWT.FILL` and stretches the widget beyond intended width.
- Set the same `hint(width, SWT.DEFAULT)` on all spinners of the same category (e.g. `hint(50, SWT.DEFAULT)` fits 3-digit numbers).
- Use explicit height hints `hint(28, 20)` for small toggle buttons; GTK enforces a minimum button height that makes rows taller than expected without the height hint.

### Dialog Layout Rules

How a dialog is laid out. Reference implementation: the Layout tab of `Scripts/View/lib/gui/dialog_main.js` (`_formRow` / `_alignFormColumns`, `_resizeScrolled`, `_wrapToParent`).

1. **Left to right, left-aligned.** Labels, headings, notes and column headers are left-aligned, also when they run over several lines. Nothing is right-aligned or stretched to the right edge — except free-text inputs (name, folder) and wrapping notes.
2. **A label sits right before its control** at its natural width, with a small fixed gap. Labels are not put in columns across rows.
3. **What belongs together sits together.** One row holds options on one subject. The gap between label and control is small, the gap between pairs clearly larger. An option that depends on a switch sits right behind it (*☐ Use label width  Wrap label at [400]*, *○ Max width: [0]*).
4. **One vertical line per tab.** Row headings (*Size:*, *Order:*) form one column, as wide as the widest heading on the tab, so every row's fields start at the same x. No other alignment across groups.
5. **Columns only within a raster.** A real table (rule table, radio choice, a block of checkboxes) aligns its columns — within that one group only. Columns are as wide as their content and do not stretch.
6. **Controls keep their own width.** A combo is as wide as its longest item (or a fixed `hint`), a spinner has one fixed width (65 px fits 4 digits). Never `grab` a combo, spinner or radio.
7. **Text.** Column headers and labels fit on one line; shorten them and put the explanation in the tooltip. Notes are grey (`COLOR_DARK_GRAY`), sit under their subject and wrap at the group width — a fixed `widthHint` gives lines of one width and a height of another, so let the hint follow the parent on resize.
8. **Off is grey — the label too.** A disabled control's label is disabled with it (keep the label with the control, e.g. `control.setData("label", lbl)`, and enable both in one helper).
9. **Fixed gaps:** label → control 6 px · pair → pair 20 px · heading → first pair 12 px · switch → dependent option 10 px · rows 3–4 px · inside a group 8 px · between groups 8 px.
10. **One group, one subject.** The title names the subject; an opening line of explanation is optional. Two subjects get two groups, not one group with a separator.
11. **Never cut content off.** When a table gets wider than the tab (e.g. optional columns switched on), widen the dialog — only wider, within the monitor, never back — and give the tab a horizontal scrollbar as the fallback for a monitor that is too narrow. Do not resize on every change, and keep the default layout narrow enough to fit without it.
12. **Groups stand out.** Give groups a slightly lighter background than the page (blend `COLOR_WIDGET_BACKGROUND` towards white; much less on a dark theme) with `setBackgroundMode(SWT.INHERIT_DEFAULT)`; custom-painted canvases fill with `canvas.getBackground()`, not a system colour.

### Layout Order Within a Group

1. Main control (e.g. list builder) at top
2. Toggles/checkboxes below separator
3. Spinners last
4. Global controls (e.g. container padding) at the very bottom

Logically distinct subjects get their own group (rule 10 above); a `SWT.SEPARATOR | SWT.HORIZONTAL` only divides parts of one subject.

### Button Sizing

- Widen Add/Remove buttons equally (95px) so both "Add >" and "< Remove" labels fit comfortably without text truncation.

### TitleAreaDialog — layout on `area`

`TitleAreaDialog.createDialogArea()` adds a separator `Label` as the **first child** of the returned composite before returning it. Rules:

- **Always apply `numColumns(1)` to `area`** — applying `numColumns(2)` or higher shifts every widget added after the separator by one cell, putting them in the wrong column.
- **Put multi-column layouts in a wrapper composite** nested inside `area`:

```javascript
// ✓ Correct
GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).applyTo(area);
const wrapper = new CompositeWidget(area, SWT.NONE);
GridDataFactory.fillDefaults().grab(true, true).applyTo(wrapper);
GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 4).applyTo(wrapper);
// add left/right columns to wrapper, not area

// ✗ Wrong — separator takes (row 1, col 1), first widget ends up in (row 1, col 2)
GridLayoutFactory.fillDefaults().numColumns(2).margins(8, 8).applyTo(area);
```
