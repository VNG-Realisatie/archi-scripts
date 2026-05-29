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

### Radio Button Alignment

- For multi-row radio blocks: fix the label column width (e.g. 115px) and pass a `colWidth` to `createRadios` (e.g. 90px) so options align across rows.

### Layout Order Within a Group

1. Main control (e.g. list builder) at top
2. Toggles/checkboxes below separator
3. Spinners last
4. Global controls (e.g. container padding) at the very bottom

Use `SWT.SEPARATOR | SWT.HORIZONTAL` spanning full width to divide logically distinct sub-sections.

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
