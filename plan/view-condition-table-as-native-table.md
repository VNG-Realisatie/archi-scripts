# View: condition table as a native table

Status: proposed 2026-11-13, behaviour to agree (§ To agree). Follows from `view-dialog-open-and-counts-performance.md` § Widgets at open: the dialog opens with 617 native controls and 2 340 combo items, most of them in the eight condition tables, and on Windows every native control costs window events.

## Goal

What: every condition table of the View dialog is one native table (SWT `Table`): cells are drawn text, one combo per table appears in the cell being edited. The eight tables (element, diagram and relation filter; step; nesting; reverse; style; nesting style) change at once; `conditionTable`'s interface and its callers (`tab_selection.js`, `tab_layout.js`, `tab_appearance.js`, `_saveUI`, `_syncToUI`) stay as they are.

Why: one native window per table instead of one per cell. At open on Windows this removes ≈ 250–300 controls and ≈ 2 000 combo items (estimate: open → shown 5.8 → ≈ 4.0–4.3 s at today's event cost). After open: *+ Add condition* and ✕ add or remove a row instead of rebuilding the grid (`rebuild()` disposes and recreates every control), and a count update sets text instead of refilling a combo. Chosen over filling combo items on first use (half the gain, a mechanism on top of the grid) and over a partial version (two table implementations).

Constraint: same behaviour, same look (`docs/reference/gui.md` § Look and feel), both platforms (GTK on Linux, Win32 on Windows); no new mechanism outside `condition_table.js` and the colour-picker menu in `widgets.js`.

## To agree

Behaviour that changes, each needs the user's yes (`Scripts/View/AGENTS.md` § Order of change):

1. **One click edits.** A click on a choice cell opens its list at once (today: the combo is the cell, one click opens it: the same); a click on *On* or a check cell toggles it; a click on a colour cell opens the colour menu; a click on ✕ removes the row.
2. **Keyboard.** Today every combo is reached with Tab. Proposed: Tab enters the table, ↑ ↓ move the row, ← → move the cell (the cell with the keyboard focus is drawn with a frame), Space toggles a check cell, Space or Enter opens a list or colour menu, Esc closes it. Without this a keyboard user cannot change a condition.
3. **Headers on one line.** A Win32 table header is one line. "Previous step\nelements" → "Previous step elements" (column 150 → 160 px so it fits), "Added\nrelations" → "Added relations", "Added\nelements" → "Added elements"; the other headers are one line already. Same words, no line break; `gui.md` already writes them on one line.
4. **Cell editor height.** Rows are as high as the combo (≈ 24 px), a little higher than today's grid rows (combo + 2 px spacing): about the same.

Behaviour that stays (the checklist for the Archi check, per table):

- Columns, widths, order, tooltips per column header and per cell; the first cell of a row carries the row tooltip (style conditions).
- Off condition: grey except *On* and ✕; counts stay visible, grey. Per-cell `enabled` rules (Value needs a property; Relation / Target type off with *Apply to* = Element; Font and Color columns grey while their switch is off). A table disabled as a whole (`enable(false)`) is all grey, *+ Add condition* too.
- Counts in the selected item ("Aggregation (62)", "(14)"), the *Nested* count column, the ⚠ column with its tooltip.
- *Match property*: the optional columns appear and disappear; on and locked while a condition uses a property.
- Filter tables show the default row when nothing is filtered and hand back `[]`; feature tables show the placeholder row switched off; `getConditions` is unchanged.
- Property and value lists come from the caller (`propItems`, `valueItems`) at the moment the list opens; a value not in the list is kept and shown.
- Colour cells: swatch of the chosen range or colour, the palette's menu with Other… and Default where the picker has them today; a value the palette lacks is replaced or shown as missing, as today.
- Nesting and Reverse line up; a table wider than the tab widens the dialog (*Never cut off*); the group background shows through the table.
- Light and dark theme on both platforms.

## Design

`condition_table.js`, same exports. SWT only (no JFace viewer: a table with listeners matches the style of the dialog code and is less code than label providers and editing supports per column).

- **Table**: `Table` with `SWT.FULL_SELECTION | SWT.NO_SCROLL`, header visible, no lines, height = header + rows × item height (set with `SWT.MeasureItem` to the combo's height), width = the sum of the column widths: no scrollbar of its own, the tab scrolls as today. Background = the parent's (group) background. One `TableColumn` per visible column plus the ✕ column; *Match property* disposes and recreates the columns (cheap: no per-row controls).
- **Cells**: text per cell from the condition and the counts (`choiceItems`, `fillList`'s labels, `countText`, "⚠"); grey foreground for a disabled cell (`SWT.EraseItem` / `SWT.PaintItem` draw the text, the tick of a check cell, the swatch of a colour cell, the ✕ glyph and a small ▾ in a choice cell so it reads as editable; the focus cell gets a frame).
- **Editing**: one `TableEditor` per table with one read-only `Combo`, moved to the clicked choice / prop / value cell, filled with that cell's items (the plain names kept beside it, as `data "names"` today) and opened; `SWT.Selection` writes the condition and hides the editor; focus loss or Esc hides it. A check cell toggles on click; a colour cell opens the picker's menu (`widgets.js`: the menu part of `colorPicker` made reusable: `colorMenu(control, opts)`, used by the button picker elsewhere in the dialog and by the table cell). ✕ removes the row.
- **Keyboard**: a cell cursor (row, column) kept by the table; keys as in § To agree 2.
- **Tooltips**: one tooltip text on the table, set on `SWT.MouseMove` from the cell under the mouse (column tooltip, row tooltip on the first cell, warning text on ⚠); column headers keep `TableColumn.setToolTipText`.
- **Columns**: the column sets stay; `kind: "custom"` with `create`/`cells` becomes `kind: "color"` with `items: () => ColorPickerItem[]` and the picker's options (Other…, Default, fallback), since the two custom cells are both colour pickers. Types in `types/view.d.ts` follow.
- **Unchanged**: `getConditions`, `setConditions`, `displayedConditions`, `setCounts`, `setWarnings`, `refreshItems`, `enable`, `footer`, `onChange`, `onLayout`, `rowTooltip`; the conditions as plain objects; `Widgets.canvasCheck` is no longer used by tables (`Widgets.checkBox` elsewhere stays).

Platform notes to check first (`ai/jarchi-scripting/swt-gtk.md`): `Table.setBackground` on GTK3; `MeasureItem` row height on both; the `TableEditor` combo's position on GTK; dark theme header colours.

## Steps

1. The user agrees § To agree (or changes it).
2. `condition_table.js` rewritten, `widgets.js` colour menu, `types/view.d.ts`; `npm run typecheck`; `gui_timing.ajs` on Linux (§ Comparable run of the performance plan): controls and items at open before / after.
3. The user checks in Archi on Linux and Windows with the checklist (§ To agree, "Behaviour that stays"), and runs `gui_timing.ajs` on Windows: open → shown and the widget count.
4. After approval: docs. ARCHITECTURE § Dialog: "One condition-table widget" (now a native table), "every checkbox is drawn on a Canvas" (in a table: drawn in the cell), the Look-and-feel realisation rows that name `canvasCheck`; `gui.md`: the step mock-up (line ≈ 118, two-line headers) and where it names the table's editing (one click, keyboard); README § the step columns stays (one line already). `swt-gtk.md` gets the table mechanics found in step 2. Code and docs in one commit.
5. Performance plan: the Windows numbers after, and the decision on lazy Appearance / Properties tabs on those numbers.
