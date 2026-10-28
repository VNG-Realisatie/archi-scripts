# SWT / JFace dialogs in jArchi (GTK on Linux)

jArchi scripts build UI with SWT and JFace through `Java.type` (classes) and `Java.extend`
(dialog subclasses). These behaviours were found on GTK/Linux; check them on other platforms.

## Threads and console

- **No console output inside an SWT handler of a modal dialog.** `console.log` / `console.error`
  from a listener blocks until that dialog closes; the rest of the handler then runs late (a
  child dialog it opens appears only after the parent is closed). This includes the `Loading …`
  line of a module first `require`d inside a handler: load such modules at top level, before the
  dialog opens.
- **Parent child dialogs on the calling dialog's shell** (`dlg.getShell()`), not on the global
  `shell` (Archi's main window): with the main window as parent the child can open behind the
  modal dialog. `Display.getActiveShell()` is not reliable for this on GTK (it can report the
  main window).
- **Do not add `SWT.ON_TOP`** to a dialog's shell style on GTK: the shell then does not show.

## Colours and rendering

- `setBackground()` / `setForeground()` in `createDialogArea` may not render until the first
  paint: re-apply them with `display.asyncExec(fn)` from the `create()` callback.
- `setBackground(null)` resets to the system default, which on GTK looks like the *active*
  state of a toggle button: set `SWT.COLOR_WIDGET_BACKGROUND` explicitly for the inactive state.
- `setForeground(null)` resets to the default (black): use it for "active"; use
  `SWT.COLOR_DARK_GRAY` for "inactive but enabled".
- `SWT.TOGGLE`: `setSelection(false)` from code fires no Selection event, so deselecting sibling
  toggles needs no re-entry guard.

## Fonts

- Bold: `new SWTFont(display, name, height, SWT.BOLD)` (`SWTFont` = `org.eclipse.swt.graphics.Font`).
- Never dispose a font while a widget uses it (keep it for the dialog's lifetime).
- `group.setFont(boldFont)` on a `Group` sets its title font on GTK.

## Widgets

- **TabFolder** on GTK has no per-tab colours; use `tabFolder.setFont(boldFont)` for emphasis or
  `CTabFolder` (`org.eclipse.swt.custom`) for per-tab styling.
- **Spinner**: lay out with `GridDataFactory.swtDefaults()`, not `fillDefaults()` (which stretches
  it); give all spinners of one kind the same `hint(width, SWT.DEFAULT)`.
- **Small buttons**: GTK enforces a minimum button height; set an explicit height hint
  (e.g. `hint(28, 20)`) or rows grow taller than expected.

## TitleAreaDialog

`createDialogArea()` puts a separator `Label` as the first child of the composite it returns.

- Apply `numColumns(1)` to that `area`: with 2+ columns the separator takes the first cell and
  every later widget shifts one cell.
- Put multi-column layouts in a wrapper composite inside `area`:

```javascript
GridLayoutFactory.fillDefaults().numColumns(1).margins(8, 8).applyTo(area);
const wrapper = new CompositeWidget(area, SWT.NONE);           // CompositeWidget = org.eclipse.swt.widgets.Composite
GridDataFactory.fillDefaults().grab(true, true).applyTo(wrapper);
GridLayoutFactory.fillDefaults().numColumns(2).margins(0, 0).spacing(6, 4).applyTo(wrapper);
// add the columns to wrapper, not to area
```
