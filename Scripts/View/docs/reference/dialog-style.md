# Dialog style — archi-scripts

How dialogs in this repo realise the look-and-feel principles in [`Scripts/View/docs/reference/gui.md` § Look and feel](gui.md#look-and-feel). Those principles hold for every dialog in the repo; this file holds only the SWT realisation and the numbers. Reference implementation: the Layout tab of `Scripts/View/lib/gui/dialog_main.js` (`_group`, `_formRow` / `_alignFormColumns`, `_noteLabel` / `_wrapToParent`, `_resizeScrolled`). SWT/GTK mechanics: `../../../../ai/jarchi-scripting/swt-gtk.md`.

## Realisation per principle

| Principle | Realisation |
|---|---|
| Left-aligned | Labels and headers `SWT.LEFT`; only free-text inputs and wrapping notes `grab` horizontally. |
| One group, one subject | One `Group` per subject. A `SWT.SEPARATOR \| SWT.HORIZONTAL` only divides parts of one subject, e.g. the switches below the main control. |
| Groups stand out | Background = `COLOR_WIDGET_BACKGROUND` blended towards white (much less on a dark theme), with `setBackgroundMode(SWT.INHERIT_DEFAULT)`. Custom-painted canvases fill with `canvas.getBackground()`, not a system colour. |
| Label before its control, one vertical line per tab, columns only within a raster | Form rows (`_formRow`): heading + label/control pairs; `_alignFormColumns` sizes the heading column for the whole tab and the columns of rows that share a raster. A label in a single row has its natural width; in a raster it is as wide as the widest label of its column. Columns are as wide as their widest content and do not stretch; a spinner keeps its fixed width inside a wider column. |
| Controls keep their own width | A combo is as wide as its longest item (or a fixed `hint`); every spinner is 65 px wide (4 digits). Never `grab` a combo, spinner or radio. |
| Fixed spacing | Label → control 6 px · pair → pair 20 px · heading → first pair 12 px · switch → dependent option 10 px · rows 3–4 px · inside a group 8 px · between groups 8 px. |
| Notes | Grey (`COLOR_DARK_GRAY`), `SWT.WRAP`. The width hint follows the parent on resize (`_wrapToParent`): a fixed `widthHint` gives lines of one width and a height of another. |
| Off is grey, the label too | Keep the label with its control (`control.setData("label", lbl)`) and enable both in one helper. A checkbox that must look disabled is drawn on a Canvas: a disabled GTK checkbox keeps its blue tick. |
| Never cut off | Widen the shell when a table outgrows the tab (only wider, within the monitor, never back) and give the tab a horizontal scrollbar as the fallback. Do not resize on every change, and keep the default layout narrow enough to fit without it. |

## Colour choices

Every colour or colour range is chosen with the colour picker (`Widgets.colorPicker`, `colorRangePicker`): a push button with the chosen item's swatch image (16 px; a range: a 60 px gradient strip) and name, followed by ▾, and a pop-up `Menu` whose items carry their own swatch image, the current one ticked. An SWT `Combo` shows text only on GTK, so no combo for colours. The button has a fixed width hint, so the layout does not shift with the chosen name. A disabled picker shows an empty swatch frame (off is grey). The swatch images are disposed with the menu or the button. A free colour comes from *Other…*: the system `ColorDialog`, parented on the dialog's shell.

## Buttons

Add / Remove buttons are equally wide (95 px), so both "Add >" and "< Remove" fit.
