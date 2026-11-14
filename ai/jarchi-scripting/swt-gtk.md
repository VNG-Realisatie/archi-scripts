# SWT / JFace dialogs in jArchi (GTK on Linux)

jArchi scripts build UI with SWT and JFace through `Java.type` (classes) and `Java.extend` (dialog subclasses). These behaviours were found on GTK/Linux; check them on other platforms.

## Threads and console

- **No console output inside an SWT handler of a modal dialog.** `console.log` / `console.error` from a listener blocks until that dialog closes; the rest of the handler then runs late (a child dialog it opens appears only after the parent is closed). This includes the `Loading …` line of a module first `require`d inside a handler: load such modules at top level, before the dialog opens.
- **Parent child dialogs on the calling dialog's shell** (`dlg.getShell()`), not on the global `shell` (Archi's main window): with the main window as parent the child can open behind the modal dialog. `Display.getActiveShell()` is not reliable for this on GTK (it can report the main window).
- **Do not add `SWT.ON_TOP`** to a dialog's shell style on GTK: the shell then does not show.

## Colours and rendering

- `setBackground()` / `setForeground()` in `createDialogArea` may not render until the first paint: re-apply them with `display.asyncExec(fn)` from the `create()` callback.
- `setBackground(null)` resets to the system default, which on GTK looks like the *active* state of a toggle button: set `SWT.COLOR_WIDGET_BACKGROUND` explicitly for the inactive state.
- `setForeground(null)` resets to the default (black): use it for "active"; use `SWT.COLOR_DARK_GRAY` for "inactive but enabled".
- `SWT.TOGGLE`: `setSelection(false)` from code fires no Selection event, so deselecting sibling toggles needs no re-entry guard.

## Fonts

- Bold: `new SWTFont(display, name, height, SWT.BOLD)` (`SWTFont` = `org.eclipse.swt.graphics.Font`).
- Never dispose a font while a widget uses it (keep it for the dialog's lifetime).
- `group.setFont(boldFont)` on a `Group` sets its title font on GTK.

## Widgets

- **TabFolder** on GTK has no per-tab colours; use `tabFolder.setFont(boldFont)` for emphasis or `CTabFolder` (`org.eclipse.swt.custom`) for per-tab styling.
- **Spinner**: lay out with `GridDataFactory.swtDefaults()`, not `fillDefaults()` (which stretches it); give all spinners of one kind the same `hint(width, SWT.DEFAULT)`.
- **Small buttons**: GTK enforces a minimum button height; set an explicit height hint (e.g. `hint(28, 20)`) or rows grow taller than expected.

## Owner-drawn Table

Found building the View dialog's condition tables (`Scripts/View/lib/gui/condition_table.js`), on GTK and Win32.

- **Owner draw.** `SWT.MeasureItem` sets the row height (`e.height`); `SWT.EraseItem` clears `SWT.SELECTED | SWT.HOT | SWT.FOCUSED | SWT.FOREGROUND` from `e.detail`; `SWT.PaintItem` draws the cell in `e.item.getBounds(e.index)`. GTK: that cell is 3 px narrower than its column.
- **No selection.** GTK paints the selection over owner-drawn cells: `deselectAll()` on `SWT.Selection`. `Table.remove` on GTK selects a neighbour of the removed rows without a Selection event: `deselectAll()` after it too.
- **Keyboard cursor.** `GC.drawFocus` follows the platform: Breeze draws nothing, Win32 nothing until the keyboard cues are on (Tab, Alt). Draw a frame of your own (`SWT.LINE_DOT`, the widget foreground).
- **Enter.** `SWT.CR` is a Java char, not a JS string: match `String(e.character) === "\r"`. In a dialog Enter also presses the default button: `SWT.Traverse` with `TRAVERSE_RETURN` → `e.doit = false`.
- **Tooltips.** A Win32 `Table` shows its own tooltip over the header, never over its rows (also with a fixed text): show an `SWT.ToolTip` (`org.eclipse.swt.widgets.ToolTip`) for the cell under the mouse from `MouseMove`, after a delay with `timerExec`; hide it on `MouseExit` and `MouseDown`. `TableColumn.setToolTipText` works on both. GTK centres a tooltip on the pointer.
- **A list under a cell** (what a read-only combo's list does): a `Shell(parent, SWT.NO_TRIM)` holding a `List`, closed on `SWT.Deactivate`. A Win32 `List` sends `DefaultSelection` on a double click only, not on Enter: pick on KeyDown `"\r"` too, once (GTK sends both).

## TitleAreaDialog

`createDialogArea()` puts a separator `Label` as the first child of the composite it returns.

- Apply `numColumns(1)` to that `area`: with 2+ columns the separator takes the first cell and every later widget shifts one cell.
- Put multi-column layouts in a wrapper composite inside `area`:

```javascript
GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).applyTo(area);
const wrapper = new CompositeWidget(area, SWT.NONE);           // CompositeWidget = org.eclipse.swt.widgets.Composite
GridDataFactory.fillDefaults().grab(true, true).applyTo(wrapper);
GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 4).applyTo(wrapper);
// add the columns to wrapper, not to area
```
