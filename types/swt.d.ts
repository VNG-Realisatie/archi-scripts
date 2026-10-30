/**
 * SWT / JFace — the members the View dialog uses (Scripts/View/lib/gui/), for static checking.
 * Not loaded at runtime. Source: SWT and JFace Javadoc (Eclipse 4.x); only what the code calls.
 *
 * `Java.type("<class>")` returns these types for the classes listed in JavaInterop below; any
 * other class name stays `any`. Java getters also read as properties in GraalJS (`b.width`); the
 * typings list the form the code uses.
 *
 * Layouts: the dialog lays out with GridLayout only, so getLayout() / getLayoutData() are typed
 * as GridLayout / GridData.
 */

declare namespace Swt {
  /** org.eclipse.swt.SWT — the style bits, event types and colour ids used. */
  interface Constants {
    // styles
    readonly NONE: number; readonly BORDER: number; readonly PUSH: number; readonly CHECK: number;
    readonly RADIO: number; readonly READ_ONLY: number; readonly DROP_DOWN: number;
    readonly SINGLE: number; readonly MULTI: number; readonly WRAP: number;
    readonly SEPARATOR: number; readonly HORIZONTAL: number; readonly VERTICAL: number;
    readonly H_SCROLL: number; readonly V_SCROLL: number; readonly BOLD: number;
    readonly INHERIT_DEFAULT: number;
    // alignment and sizes
    readonly BEGINNING: number; readonly LEAD: number; readonly CENTER: number; readonly END: number;
    readonly FILL: number; readonly TOP: number; readonly DEFAULT: number;
    // event types
    readonly Selection: number; readonly DefaultSelection: number; readonly Modify: number;
    readonly FocusOut: number; readonly MouseUp: number; readonly Paint: number; readonly Resize: number;
    readonly FocusIn: number; readonly KeyDown: number; readonly Traverse: number; readonly Dispose: number;
    readonly MouseDown: number; readonly MouseDoubleClick: number;
    // traversal details
    readonly TRAVERSE_RETURN: number; readonly TRAVERSE_ESCAPE: number;
    // GC
    readonly ON: number;
    // system colours
    readonly COLOR_DARK_GRAY: number; readonly COLOR_WIDGET_BACKGROUND: number; readonly COLOR_WHITE: number;
    readonly COLOR_LIST_BACKGROUND: number; readonly COLOR_LIST_SELECTION: number;
    readonly COLOR_WIDGET_NORMAL_SHADOW: number; readonly COLOR_WIDGET_DARK_SHADOW: number;
  }

  interface Point { x: number; y: number }
  interface Rectangle { x: number; y: number; width: number; height: number }
  interface RGB { red: number; green: number; blue: number }
  interface Color { getRGB(): RGB; dispose(): void }
  interface Image { dispose(): void }
  interface Font {}
  interface Monitor { getClientArea(): Rectangle }

  interface GC {
    setBackground(color: Color): void;
    setForeground(color: Color): void;
    setAntialias(antialias: number): void;
    setLineWidth(width: number): void;
    fillRectangle(x: number, y: number, width: number, height: number): void;
    fillRoundRectangle(x: number, y: number, width: number, height: number, arcWidth: number, arcHeight: number): void;
    drawRoundRectangle(x: number, y: number, width: number, height: number, arcWidth: number, arcHeight: number): void;
    drawLine(x1: number, y1: number, x2: number, y2: number): void;
    drawFocus(x: number, y: number, width: number, height: number): void;
    drawRectangle(x: number, y: number, width: number, height: number): void;
    dispose(): void;
  }

  /** The listener argument; Paint events carry gc and display, mouse / key / traverse events the rest. */
  interface Event { gc: GC; display: Display; button: number; character: string; detail: number; doit: boolean; widget: Widget }

  interface Display {
    getSystemColor(id: number): Color;
    getSystemFont(): Font;
    getActiveShell(): Shell | null;
    asyncExec(runnable: () => void): void;
    timerExec(milliseconds: number, runnable: () => void): void;
    getDoubleClickTime(): number;
    addFilter(eventType: number, listener: unknown): void;
    removeFilter(eventType: number, listener: unknown): void;
  }

  interface GridData {
    exclude: boolean;
    widthHint: number;
    horizontalSpan: number;
  }
  interface GridLayout {
    verticalSpacing: number;
    marginWidth: number;
    marginHeight: number;
    marginLeft: number;
    marginRight: number;
  }
  interface RowLayout {
    center: boolean; spacing: number; marginWidth: number; marginHeight: number; wrap: boolean;
  }

  interface Widget {
    dispose(): void;
    isDisposed(): boolean;
    getData(key: string): any;
    setData(key: string, value: unknown): void;
    addListener(eventType: number, listener: (e: Event) => void): void;
    getDisplay(): Display;
  }

  interface Control extends Widget {
    getParent(): Composite;
    getShell(): Shell;
    setToolTipText(text: string): void;
    setEnabled(enabled: boolean): void;
    isEnabled(): boolean;
    setVisible(visible: boolean): void;
    setFocus(): boolean;
    getVisible(): boolean;
    isVisible(): boolean;
    setFont(font: Font): void;
    setForeground(color: Color | null): void;
    setBackground(color: Color | null): void;
    getBackground(): Color;
    getLayoutData(): GridData;
    setLayoutData(data: GridData): void;
    computeSize(wHint: number, hHint: number): Point;
    getSize(): Point;
    moveAbove(control: Control | null): void;
    moveBelow(control: Control | null): void;
    redraw(): void;
    isFocusControl(): boolean;
    addControlListener(listener: unknown): void;
    getBounds(): Rectangle;
    toDisplay(x: number, y: number): Point;
  }

  interface Scrollable extends Control {
    getClientArea(): Rectangle;
  }

  interface Composite extends Scrollable {
    getChildren(): Control[];
    getLayout(): GridLayout;
    setLayout(layout: GridLayout | RowLayout): void;
    layout(changed: boolean, all: boolean): void;
    setBackgroundMode(mode: number): void;
  }

  interface Shell extends Composite {
    getMonitor(): Monitor;
    getBounds(): Rectangle;
    setBounds(x: number, y: number, width: number, height: number): void;
  }

  interface Label extends Control {
    getText(): string;
    setText(text: string): void;
  }

  interface Button extends Control {
    setText(text: string): void;
    setImage(image: Swt.Image | null): void;
    getSelection(): boolean;
    setSelection(selected: boolean): void;
  }

  interface Text extends Scrollable {
    getText(): string;
    setText(text: string): void;
    selectAll(): void;
    setMessage(message: string): void;
  }

  interface Menu extends Widget {
    setLocation(location: Point): void;
    setVisible(visible: boolean): void;
  }
  interface MenuItem extends Widget {
    setText(text: string): void;
    setImage(image: Image): void;
  }
  interface ColorDialog {
    setRGB(rgb: RGB): void;
    open(): RGB | null;
  }

  interface Combo extends Composite {
    add(item: string): void;
    removeAll(): void;
    select(index: number): void;
    getSelectionIndex(): number;
    getItem(index: number): string;
    getItemCount(): number;
    indexOf(item: string): number;
    getText(): string;
  }

  interface Spinner extends Composite {
    getSelection(): number;
    setSelection(value: number): void;
    setValues(selection: number, minimum: number, maximum: number, digits: number,
              increment: number, pageIncrement: number): void;
  }

  interface Group extends Composite { setText(text: string): void }
  interface Canvas extends Composite {}

  interface TabFolder extends Composite {
    getSelectionIndex(): number;
    setSelection(index: number): void;
  }
  interface TabItem extends Widget {
    setText(text: string): void;
    setControl(control: Control): void;
  }

  interface ScrolledComposite extends Composite {
    setExpandHorizontal(expand: boolean): void;
    setExpandVertical(expand: boolean): void;
    setContent(content: Control): void;
    getContent(): Control;
    setMinSize(size: Point): void;
  }

  /** A widget class: `new Class(parent, style)`; also usable with instanceof. */
  interface WidgetClass<P, T> {
    new (parent: P, style: number): T;
    prototype: T;
  }
}

declare namespace JFace {
  interface GridDataFactory {
    align(hAlign: number, vAlign: number): GridDataFactory;
    grab(horizontal: boolean, vertical: boolean): GridDataFactory;
    hint(xHint: number, yHint: number): GridDataFactory;
    indent(hIndent: number, vIndent: number): GridDataFactory;
    span(hSpan: number, vSpan: number): GridDataFactory;
    exclude(shouldExclude: boolean): GridDataFactory;
    applyTo(control: Swt.Control): void;
    create(): Swt.GridData;
  }
  interface GridDataFactoryClass { fillDefaults(): GridDataFactory; swtDefaults(): GridDataFactory }

  interface GridLayoutFactory {
    numColumns(n: number): GridLayoutFactory;
    margins(marginWidth: number, marginHeight: number): GridLayoutFactory;
    spacing(hSpacing: number, vSpacing: number): GridLayoutFactory;
    equalWidth(equal: boolean): GridLayoutFactory;
    applyTo(composite: Swt.Composite): void;
  }
  interface GridLayoutFactoryClass { fillDefaults(): GridLayoutFactory }

  interface FontDescriptor { setStyle(style: number): FontDescriptor; createFont(display: Swt.Display): Swt.Font }

  /** A dialog subclass made with Java.extend(TitleAreaDialog, …); protected members through Java.super. */
  interface TitleAreaDialog {
    open(): number;
    getShell(): Swt.Shell;
    setTitle(title: string): void;
    setMessage(message: string): void;
  }

  interface InputDialog { open(): number; getValue(): string | null }
}

interface JavaInterop {
  type(className: "org.eclipse.swt.SWT"): Swt.Constants;
  type(className: "org.eclipse.swt.widgets.Label"): Swt.WidgetClass<Swt.Composite, Swt.Label>;
  type(className: "org.eclipse.swt.widgets.Composite"): Swt.WidgetClass<Swt.Composite, Swt.Composite>;
  type(className: "org.eclipse.swt.widgets.Button"): Swt.WidgetClass<Swt.Composite, Swt.Button>;
  type(className: "org.eclipse.swt.widgets.Combo"): Swt.WidgetClass<Swt.Composite, Swt.Combo>;
  type(className: "org.eclipse.swt.widgets.Text"): Swt.WidgetClass<Swt.Composite, Swt.Text>;
  type(className: "org.eclipse.swt.widgets.Spinner"): Swt.WidgetClass<Swt.Composite, Swt.Spinner>;
  type(className: "org.eclipse.swt.widgets.Group"): Swt.WidgetClass<Swt.Composite, Swt.Group>;
  type(className: "org.eclipse.swt.widgets.Canvas"): Swt.WidgetClass<Swt.Composite, Swt.Canvas>;
  type(className: "org.eclipse.swt.widgets.TabFolder"): Swt.WidgetClass<Swt.Composite, Swt.TabFolder>;
  type(className: "org.eclipse.swt.widgets.TabItem"): Swt.WidgetClass<Swt.TabFolder, Swt.TabItem>;
  type(className: "org.eclipse.swt.custom.ScrolledComposite"): Swt.WidgetClass<Swt.Composite, Swt.ScrolledComposite>;
  type(className: "org.eclipse.swt.widgets.Display"): { getCurrent(): Swt.Display };
  type(className: "org.eclipse.swt.graphics.Color"): new (display: Swt.Display, red: number, green: number, blue: number) => Swt.Color;
  type(className: "org.eclipse.swt.graphics.Point"): new (x: number, y: number) => Swt.Point;
  type(className: "org.eclipse.swt.graphics.Image"): new (display: Swt.Display, width: number, height: number) => Swt.Image;
  type(className: "org.eclipse.swt.graphics.GC"): new (image: Swt.Image) => Swt.GC;
  type(className: "org.eclipse.swt.graphics.RGB"): new (red: number, green: number, blue: number) => Swt.RGB;
  type(className: "org.eclipse.swt.widgets.Menu"): new (parent: Swt.Control) => Swt.Menu;
  type(className: "org.eclipse.swt.widgets.MenuItem"): new (parent: Swt.Menu, style: number) => Swt.MenuItem;
  type(className: "org.eclipse.swt.widgets.ColorDialog"): new (parent: Swt.Shell) => Swt.ColorDialog;
  type(className: "org.eclipse.swt.layout.RowLayout"): new (type: number) => Swt.RowLayout;
  type(className: "org.eclipse.swt.events.ControlListener"): { controlResizedAdapter(fn: (e: Swt.Event) => void): unknown };
  type(className: "org.eclipse.jface.layout.GridDataFactory"): JFace.GridDataFactoryClass;
  type(className: "org.eclipse.jface.layout.GridLayoutFactory"): JFace.GridLayoutFactoryClass;
  type(className: "org.eclipse.jface.resource.FontDescriptor"): { createFrom(font: Swt.Font): JFace.FontDescriptor };
  type(className: "org.eclipse.jface.dialogs.IDialogConstants"): { readonly OK_ID: number; readonly CANCEL_ID: number };
  type(className: "org.eclipse.jface.dialogs.MessageDialog"): { openConfirm(parent: Swt.Shell, title: string, message: string): boolean };
  type(className: "org.eclipse.jface.dialogs.InputDialog"): new (parent: Swt.Shell, title: string, message: string, initial: string, validator: null) => JFace.InputDialog;
  type(className: "org.eclipse.jface.window.Window"): { readonly OK: number; readonly CANCEL: number };
}
