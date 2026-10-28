/**
 * jArchi globals that exist only inside Archi: the `$` / `jArchi` API, the current model and selection, the
 * JFace `window` dialogs, `exit` / `load`, and Java interop (`Java`, `Packages`, SWT roots).
 *
 * Split from jarchi.d.ts so that `jsconfig.pure.json` can leave them out: a pure file that uses one is a type
 * error. The types they return (ArchiCollection, CurrentModel, …) stay in jarchi.d.ts; `console`, `__DIR__`,
 * `require` and the constants exist in the Node harness as well and stay there too.
 * Same sources and tags as jarchi.d.ts.
 */

declare var $: JArchiStatic;
declare var jArchi: JArchiStatic;
/** Current model (check `model.isSet()` first). */
declare var model: CurrentModel;
/** Objects selected in the model tree or on a view when the script started. */
declare var selection: ArchiCollection<ArchiObject>;

interface FileDialogOptions {
  title?: string;
  filterExtensions?: string[];
  fileName?: string;
}
/** Simple JFace dialogs on Archi's main window (js/init.js). */
declare var window: {
  alert(message: string): void;
  confirm(message: string): boolean;
  /** Entered text, or null when cancelled. */
  prompt(message: string, defaultText?: string): string | null;
  promptOpenFile(options?: FileDialogOptions): string | null;
  promptOpenDirectory(options?: { title?: string; filterPath?: string }): string | null;
  promptSaveFile(options?: FileDialogOptions): string | null;
  /** @since 1.4 */
  promptSelection(title: string, choices: string[]): string | null;
};

/** Stop the script (throws "__EXIT__", shown as "Exited"). */
declare function exit(): never;
/** @since 1.8 — alias of exit(). */
declare function quit(): never;
/** Run another script file in the global scope. */
declare function load(source: string | { name: string; script: string }): unknown;

/**
 * Java interop (GraalJS). Results are Java objects whose shape tsc cannot know, hence `any`:
 * annotate the variable that receives a Java value when you need checking. An interface, so a
 * typings file can add `type()` overloads per class name (types/swt.d.ts does for SWT / JFace).
 */
interface JavaInterop {
  type(className: string): any;
  from(javaArray: any): any[];
  to(jsArray: unknown[], javaType?: string | object): any;
  extend(...types: any[]): any;
  /** The superclass methods of an object made with Java.extend, e.g. Java.super(dlg).okPressed(). */
  super(object: unknown): any;
  isJavaObject(value: unknown): boolean;
  isType(value: unknown): boolean;
  typeName(value: unknown): string | undefined;
}
declare var Java: JavaInterop;
/** Nashorn-compat package roots, e.g. Packages.java.io.File or java.io.File (prefer Java.type). */
declare var Packages: any;
declare var java: any;
declare var javax: any;
/** Archi's main SWT Shell (org.eclipse.swt.widgets.Shell). */
declare var shell: any;
declare var workbench: any;
declare var workbenchwindow: any;
