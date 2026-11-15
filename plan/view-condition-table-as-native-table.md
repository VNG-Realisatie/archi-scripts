# View: condition table as a native table

Status: done, checked on Linux and Windows, approved by the user. Docs updated (ARCHITECTURE § Dialog, `gui.md`, `swt-gtk.md`).

## Goal

What: every condition table of the View dialog is one native SWT `Table`. Cells are drawn text, and one combo per table appears in the cell being edited. The table is used for the element, diagram and relation filters, the steps, nesting, reverse, style and nesting style. `conditionTable`'s interface and its callers stay as they are.

Why: one native window per table instead of one per cell. On Windows every native window costs a fixed number of window events (`view-dialog-open-and-counts-performance.md` § Why Windows is slow), so the number of native widgets at open decides the open time. *+ Add condition* and ✕ add or remove a row instead of rebuilding the grid, and a count update sets text instead of refilling a combo. This was chosen over filling the combo items on first use (half the gain, a mechanism on top of the grid) and over a partial version (two table implementations).

Constraint: same behaviour and look (`docs/reference/gui.md` § Look and feel), on GTK and Win32; no new mechanism outside `condition_table.js` and the colour menu in `widgets.js`.

## Behaviour (agreed with the user)

- **One click edits.** A choice cell opens its list, *On* or a check cell toggles, a colour cell opens the colour menu, ✕ removes the row.
- **Keyboard.** A table is one Tab stop. ↑ ↓ move the row, ← → move the cell (a dotted frame marks the cursor cell), Space toggles a check cell, Space or Enter opens a list or the colour menu, Esc closes it. Esc in the table itself closes the dialog, as Esc on a combo did.
- **Headers on one line** (a Win32 header has one line): "Previous step elements" (step column 200 px), "Added relations", "Added elements".
- **Row height** = the combo's height (≈ 24 px).
- Everything else as before: columns, tooltips, greyed off conditions and cells, counts, ⚠, *Match property* columns, filter default rows, colour swatches and menu, Nesting and Reverse aligned, *Never cut off*.
- Light theme only. Archi's dark theme leaves several dialog controls unreadable and is out of scope. Linux needs Adwaita; Breeze is not supported (Archi's own tables break in it).

## Design

`condition_table.js`, same exports, SWT only (no JFace viewer).

- `Table` with `FULL_SELECTION | NO_SCROLL`, as high as its rows and as wide as its columns: the tab scrolls, not the table. Background = the group's.
- Cells drawn in `EraseItem` / `PaintItem`: text, check tick, colour swatch, ✕, a small ▾ in a choice cell, the cursor frame. A disabled cell is drawn grey.
- One `TableEditor` per table with one read-only `Combo`, moved to the clicked cell and filled with that cell's items. Colour cells use `Widgets.openColorMenu`, which the colour button picker uses too.
- Cell tooltips: an SWT `ToolTip` for the cell under the mouse after 500 ms, because a Win32 table shows no tooltip over its rows. Column headers keep native tooltips.
- Column kind `color` (`items`, Other…, Default) replaces `custom`; types in `types/view.d.ts`.

## Results

*GEMMA domeinen* (1 613 objects), preset `Bestuurscontext/Capability`, `gui_timing.ajs`:

| | Before | After |
|---|---|---|
| Controls at open | 617 | 429 (11 tables) |
| Combo items at open | 2 340 | 159 |
| Linux open → shown | 2.8–3.0 s | 1.75–1.81 s |
| Windows open → shown | 5.8 s | 4.2–4.6 s |

## Handoff

Nothing open.
