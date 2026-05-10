# CLAUDE.md — Scripts/View technical rules

See also: `PROMPT.md` (data structures, ELK/Dagre path, parameter reference)
See also: `../../CLAUDE.md` (vocabulary and pipeline model)

## SWT / jArchi platform rules

- **SWT.TOGGLE mutual exclusion**: calling `setSelection(false)` on a TOGGLE button programmatically does NOT fire a Selection event. Safe to iterate and deselect siblings without re-entry guards.
- **GTK rendering**: `setBackground()` / `setForeground()` called during `createDialogArea` may not render correctly until after the first paint. Use `display.asyncExec(fn)` in the `create()` callback to re-apply colors after the shell is visible.
- **`setBackground(null)`** resets to system default, but on GTK this is indistinguishable from the "active" appearance of toggle buttons. Always set an explicit `SWT.COLOR_WIDGET_BACKGROUND` for inactive state.
- **Bold fonts**: `group.setFont(boldFont)` on a `GroupWidget` on GTK sets the title font. Create bold fonts via `new SWTFont(display, name, height, SWT.BOLD)`. Never dispose these during dialog lifetime.
- **Tab styling**: Standard `TabFolder` on GTK/Linux does not support per-tab foreground/background. Use `tabFolder.setFont(boldFont)` for prominence. Further per-tab styling requires `CTabFolder` from `org.eclipse.swt.custom`.

## layoutDialog architecture

- `layoutDialog.config` — the live parameter object; source of truth between runs.
- `layoutDialog.widgets` — flat map of named widget references.
- `syncConfigToUI()` — pushes `config` → widgets. Called after `createDialogArea` and after preset apply.
- `saveInput()` — reads widgets → `config`. Called before run and before preset save.
- `updateActionControls(action)` — enables/disables depth spinner and view name field based on action.
- `updateAlgoControls(algo)` — enables/disables direction/routing/ranker/weights controls based on algorithm capabilities.
- `_updateActionColors()` — stored closure; sets white bg + default fg for active action toggle, widget-bg + dark-grey fg for inactive. Must call from listener AND from `syncConfigToUI`.

## Relation filter direction encoding

Stored in `param.includeRelationType` as strings with optional suffix:

| Value | Meaning |
|---|---|
| `"type"` | both directions (no suffix) |
| `"type:in"` | incoming only (traversed element is target) |
| `"type:out"` | outgoing only (traversed element is source) |

Rules:
- Both `←` and `→` toggles lit → encode as no suffix (both directions).
- Neither lit → also no suffix. Same result; visually "both lit" is the default for active relations.
- When a relation checkbox is first checked → both direction toggles activate automatically.

## _relTypeRows data structure

Each row in the relationship filter:
```js
{ type: string, chk: ButtonWidget, rdoIn: ButtonWidget, rdoOut: ButtonWidget, updateDirColors: fn }
```
- `rdoIn` / `rdoOut` are `SWT.TOGGLE` buttons, not radio buttons — they are independent (not mutually exclusive).
- `updateDirColors()` is a per-row closure; call it after any programmatic state change.

## Checkbox grids (Reverse, Nesting)

Stored in `layoutDialog.widgets.lstReversed_checks` and `layoutDialog.widgets.lstNested_checks`:
```js
[{ type: string, chk: ButtonWidget }, ...]
```
`createRelCheckGrid(name, container, cols, initialSelected)` builds the grid and stores to `widgets[name + "_checks"]`.

## elkSortLeavesOnly / chkSortContainers

The UI checkbox "Sort containers alphabetically" is **inverted**:
- checkbox checked → `elkSortLeavesOnly = false` (containers are sorted, default behaviour)
- checkbox unchecked → `elkSortLeavesOnly = true` (only leaf elements sorted, containers keep model order)

## elkSameTypeResize / chkSameTypeResize

Replaces the old `elkNestedExpandToFill` + `elkExpandExcludeTypes` pair.
- Single checkbox: "Align elements within same-type containers"
- When on: two-pass layout runs; in `equalizeSiblings`, a leaf child is resized to `globalMinW` only when `child._type === container._type`
- Root-level nodes (`_type` is undefined) are never resized (guard: `if (containerType && ...)`)
- `elkExpandExcludeTypes` is removed — no per-type exclusion list exists anymore

## Known GTK behaviours to account for

- Calling `asyncExec` in `create()` is needed to refresh toggle colors after dialog is shown.
- `GridDataFactory.swtDefaults().hint(w, h)` — use explicit height hints (e.g. `hint(28, 20)`) for small toggle buttons; GTK enforces a minimum button height that makes rows taller than expected without the height hint.
- `setForeground(null)` resets to system default (black). Use this for "active" state. Use `SWT.COLOR_DARK_GRAY` foreground for "inactive but enabled" state.
