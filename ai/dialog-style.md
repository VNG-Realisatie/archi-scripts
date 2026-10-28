# Dialog style — archi-scripts

How dialogs in this repo are laid out. Reference implementation: the Layout tab of
`Scripts/View/lib/gui/dialog_main.js` (`_formRow` / `_alignFormColumns`, `_resizeScrolled`,
`_wrapToParent`). SWT/GTK mechanics: `ai/jarchi-scripting/swt-gtk.md`.

## Layout rules

1. **Left to right, left-aligned.** Labels, headings, notes and column headers are left-aligned, also when they run over several lines. Nothing is right-aligned or stretched to the right edge — except free-text inputs (name, folder) and wrapping notes.
2. **A label sits right before its control**, with a small fixed gap. In a single row the label has its natural width; in a raster of form rows (rule 5) it is as wide as the widest label of its column, so the controls stand below each other.
3. **What belongs together sits together.** One row holds options on one subject. The gap between label and control is small, the gap between pairs clearly larger. An option that depends on a switch sits right behind it (*☐ Use label width  Wrap label at [400]*, *○ Max width: [0]*).
4. **One vertical line per tab.** Row headings (*Size:*, *Order:*) form one column, as wide as the widest heading on the tab, so every row's fields start at the same x. No other alignment across groups.
5. **Columns only within a raster.** A real table (rule table, radio choice, a block of checkboxes) aligns its columns, and so may the first label/control pair of a set of related form groups (e.g. Flow, Elements, Connections), so their first fields stand below each other; what follows on the row stays close behind. Columns are as wide as their widest content and do not stretch; a spinner keeps its fixed width inside a wider column.
6. **Controls keep their own width.** A combo is as wide as its longest item (or a fixed `hint`), a spinner has one fixed width (65 px fits 4 digits). Never `grab` a combo, spinner or radio.
7. **Text.** Column headers and labels fit on one line; shorten them and put the explanation in the tooltip. Notes are grey (`COLOR_DARK_GRAY`), sit under their subject and wrap at the group width — a fixed `widthHint` gives lines of one width and a height of another, so let the hint follow the parent on resize.
8. **Off is grey — the label too.** A disabled control's label is disabled with it (keep the label with the control, e.g. `control.setData("label", lbl)`, and enable both in one helper).
9. **Fixed gaps:** label → control 6 px · pair → pair 20 px · heading → first pair 12 px · switch → dependent option 10 px · rows 3–4 px · inside a group 8 px · between groups 8 px.
10. **One group, one subject.** The title names the subject; an opening line of explanation is optional. Two subjects get two groups, not one group with a separator.
11. **Never cut content off.** When a table gets wider than the tab (e.g. optional columns switched on), widen the dialog — only wider, within the monitor, never back — and give the tab a horizontal scrollbar as the fallback for a monitor that is too narrow. Do not resize on every change, and keep the default layout narrow enough to fit without it.
12. **Groups stand out.** Give groups a slightly lighter background than the page (blend `COLOR_WIDGET_BACKGROUND` towards white; much less on a dark theme) with `setBackgroundMode(SWT.INHERIT_DEFAULT)`; custom-painted canvases fill with `canvas.getBackground()`, not a system colour.

## Order within a group

1. Main control (e.g. list builder) at the top
2. Toggles / checkboxes below a separator
3. Spinners last
4. Global controls (e.g. container padding) at the very bottom

Logically distinct subjects get their own group (rule 10); a `SWT.SEPARATOR | SWT.HORIZONTAL` only divides parts of one subject.

## Buttons

Add / Remove buttons are equally wide (95 px), so both "Add >" and "< Remove" fit.
