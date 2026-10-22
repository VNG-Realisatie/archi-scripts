/**
 * jArchi scripting API — type declarations for static checking of jArchi scripts (JSDoc + tsc --noEmit).
 *
 * Source: archi-scripting-plugin source (com.archimatetool.script, April 2026, jArchi 1.12):
 *   dom/model/*Proxy.java, dom/model/EObjectProxyCollection.java, dom/ui/Console.java, js/init.js,
 *   RunArchiScript.java, JSProvider.java, plugin.xml. Wiki: github.com/archimatetool/archi-scripting-plugin/wiki
 *
 * Runtime model (JSProvider.java): GraalJS via JSR-223 with nashorn-compat and ECMAScript "latest";
 * Java getters/setters read and write as JS properties (getName() → .name); CommonJS `require` when the
 * preference is on, with the scripts folder as require-cwd.
 *
 * Tags: `@since` = first jArchi version. `@remarks unverified` = taken from source or wiki, not yet
 * observed in a running Archi; check before relying on edge-case behaviour.
 */

// ── Proxies ──────────────────────────────────────────────────────────────────────────────────────

/** Common base of every model object (EObjectProxy). */
interface ArchiProxy {
  readonly id: string;
  name: string;
  documentation: string;
  /** Kebab-case type, e.g. "business-actor", "diagram-model-note", "archimate-diagram-model". */
  readonly type: string;
  readonly model: ArchiModel;
  labelExpression: string;
  readonly labelValue: string;
  /** All property keys. */
  prop(): string[];
  /** First value of the property, or null when absent. */
  prop(key: string): string | null;
  /** All values of the property (allowDuplicate=true), or the first value (false). */
  prop(key: string, allowDuplicate: boolean): string[] | string | null;
  /** Set (or add, with allowDuplicate) a property. */
  prop(key: string, value: string, allowDuplicate?: boolean): this;
  removeProp(key: string, value?: string): this;
  delete(): void;
}

/** An ArchiMate concept: element or relationship (ArchimateConceptProxy). */
interface ArchiConcept extends ArchiProxy {
  specialization: string;
  readonly concept: this;
}

interface ArchiElement extends ArchiConcept {
  /** Setting the type converts the element (diagram references follow). */
  type: string;
  /** "and" | "or" — junctions only. */
  junctionType: string;
  merge(other: ArchiElement): this;
  /** @since 1.8 */
  duplicate(folder?: Folder): ArchiElement;
}

interface ArchiRelation extends ArchiConcept {
  type: string;
  /** A relationship can connect to another relationship, so the ends are concepts. */
  source: ArchiElement | ArchiRelation;
  target: ArchiElement | ArchiRelation;
  /** access-relationship only: "write" | "read" | "access" | "readwrite". */
  accessType: string;
  /** influence-relationship only. */
  influenceStrength: string;
  /** association-relationship only. */
  associationDirected: boolean;
  merge(other: ArchiRelation): this;
  /** @since 1.8 */
  duplicate(folder?: Folder): ArchiRelation;
}

interface Folder extends ArchiProxy {
  createFolder(name: string): Folder;
  add(child: ArchiConcept | ArchiView | Folder): this;
}

/** Bounds of a visual object; width/height -1 means "default size" (since 1.10). */
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shared by visual objects and connections on a view (DiagramModelComponentProxy). */
interface DiagramComponent extends ArchiProxy {
  readonly view: ArchiView;
  /** The model concept drawn by this visual; null for notes, groups and other diagram objects. */
  readonly concept: ArchiConcept | null;
  specialization: string;
  fontColor: string;
  fontName: string;
  fontSize: number;
  fontStyle: string;
  lineColor: string;
  lineWidth: number;
}

/** A box on a view: element, note, group, view reference, … (DiagramModelObjectProxy). */
interface VisualObject extends DiagramComponent {
  readonly concept: ArchiElement | null;
  /** Reading returns a fresh copy; write a whole or partial object to change it. */
  get bounds(): Bounds;
  set bounds(value: Partial<Bounds>);
  /** Create a child visual for an element; x/y relative to this object. */
  add(element: ArchiElement, x: number, y: number, width: number, height: number): VisualObject;
  /** Move an existing visual into this object, keeping its children and connections. @since 1.10 */
  add(visual: VisualObject, x: number, y: number): VisualObject;
  createObject(type: string, x: number, y: number, width: number, height: number): VisualObject;
  createViewReference(view: ArchiView, x: number, y: number, width: number, height: number): VisualObject;
  /** Z-order position among siblings. @since 1.7 */
  index: number;
  bringToFront(): this;
  bringForward(): this;
  sendToBack(): this;
  sendBackward(): this;
  fillColor: string | null;
  /** @since 1.5 */
  iconColor: string;
  opacity: number;
  outlineOpacity: number;
  gradient: number;
  figureType: number;
  textAlignment: number;
  textPosition: number;
  showIcon: number;
  imageSource: number;
  imagePosition: number;
  /** @since 1.6 */
  deriveLineColor: boolean;
  /** @since 1.8 */
  lineStyle: number;
  /** Notes only. */
  text: string;
  /** Notes and groups only (BORDER constants). */
  borderType: number;
  /** View references only. */
  readonly refView: ArchiView;
  /**
   * Delete this visual. Default true: children and attached connections go too.
   * false: children are re-parented to this object's parent. @since 1.8 (argument)
   */
  delete(deleteChildren?: boolean): void;
}

/** Relative bendpoint: start offsets from the source centre, end offsets from the target centre. */
interface Bendpoint {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** A line on a view (DiagramModelConnectionProxy). */
interface VisualConnection extends DiagramComponent {
  readonly concept: ArchiRelation | null;
  readonly source: VisualObject | VisualConnection;
  readonly target: VisualObject | VisualConnection;
  labelVisible: boolean;
  /** CONNECTION_TEXT_POSITION constants. */
  textPosition: number;
  textAlignment: number;
  /** CONNECTION_STYLE bit flags. */
  style: number;
  readonly relativeBendpoints: Bendpoint[];
  addRelativeBendpoint(bendpoint: Bendpoint, index: number): this;
  /** @since 1.1 */
  setRelativeBendpoint(bendpoint: Bendpoint, index: number): this;
  deleteBendpoint(index: number): this;
  deleteAllBendpoints(): this;
}

/** Any view: ArchiMate, sketch or canvas (DiagramModelProxy). */
interface ArchiView extends ArchiProxy {
  /** Move an existing visual to the top level of this view. @since 1.10 */
  add(visual: VisualObject, x: number, y: number): VisualObject;
  createObject(type: string, x: number, y: number, width: number, height: number, autoNest?: boolean): VisualObject;
  createViewReference(view: ArchiView, x: number, y: number, width: number, height: number, autoNest?: boolean): VisualObject;
  createConnection(source: DiagramComponent, target: DiagramComponent): VisualConnection;
  /** CONNECTION_ROUTER: 0 = bendpoint (manual), 1 = manhattan. */
  connectionRouter: number;
  /** @since 1.5 */
  openInUI(): this;
  /** @since 1.8 */
  duplicate(folder?: Folder): ArchiView;
}

interface ArchimateView extends ArchiView {
  add(element: ArchiElement, x: number, y: number, width: number, height: number, autoNest?: boolean): VisualObject;
  add(relation: ArchiRelation, source: DiagramComponent, target: DiagramComponent): VisualConnection;
  add(visual: VisualObject, x: number, y: number): VisualObject;
  /** Reads as { id, name }; assign a viewpoint id string to change it. */
  get viewpoint(): { id: string; name: string };
  set viewpoint(id: string);
  isAllowedConceptForViewpoint(conceptType: string): boolean;
}

interface Specialization {
  name: string;
  conceptType: string;
  image: { [key: string]: unknown } | null;
  delete(): void;
}

/** A loaded model (ArchimateModelProxy). */
interface ArchiModel extends ArchiProxy {
  purpose: string;
  readonly specializations: Specialization[];
  createElement(type: string, name: string, folder?: Folder): ArchiElement;
  createRelationship(type: string, name: string, source: ArchiConcept, target: ArchiConcept, folder?: Folder): ArchiRelation;
  createArchimateView(name: string, folder?: Folder): ArchimateView;
  createSketchView(name: string, folder?: Folder): ArchiView;
  createCanvasView(name: string, folder?: Folder): ArchiView;
  createSpecialization(name: string, conceptType: string, image?: { [key: string]: unknown }): Specialization;
  findSpecialization(name: string, conceptType: string): Specialization | null;
  createImage(filePath: string): { [key: string]: unknown };
  getPath(): string | null;
  save(path?: string): this;
  copy(): ArchiModel;
  openInUI(): this;
  setAsCurrent(): this;
  /** @since 1.5 */
  merge(source: string | ArchiModel, update: boolean, updateAll: boolean, messages?: unknown[]): this;
  find(selector?: string | ArchiProxy): ArchiCollection<ArchiObject>;
}

/** The global `model`: the current model, or an unset placeholder. */
interface CurrentModel extends ArchiModel {
  /** False when no model is selected; any other access then throws. @since 1.9 */
  isSet(): boolean;
}

/** Every proxy kind a collection can hold. */
type ArchiObject = ArchiElement | ArchiRelation | Folder | ArchiView | ArchimateView | VisualObject | VisualConnection | ArchiModel;

// ── Collections ──────────────────────────────────────────────────────────────────────────────────
//
// A collection is a java.util.ArrayList of proxies (EObjectProxyCollection). Traversals keep their
// side: on a view, "element"/"relation" select visuals; in the model they select concepts.

type OnView = DiagramComponent | ArchiView;
type ElementsOf<T> = T extends OnView ? VisualObject : ArchiElement;
type RelationsOf<T> = T extends OnView ? VisualConnection : ArchiRelation;
type DescendantsOf<T> = T extends OnView ? VisualObject | VisualConnection : ArchiObject;
type ParentsOf<T> = T extends OnView ? VisualObject | ArchiView : Folder | ArchiModel;
type EndsOf<T> = T extends OnView ? VisualObject | VisualConnection : ArchiElement | ArchiRelation;
type ElementSelector = "element";
type RelationSelector = "relation" | "relationship";

interface ArchiCollection<T extends ArchiProxy = ArchiObject> {
  /** Number of objects (ArrayList.size). */
  size(): number;
  /** List length via GraalJS host list access. @remarks unverified — prefer size(). */
  readonly length: number;
  /** nth object (ArrayList.get); throws when out of range. */
  get(index: number): T;
  isEmpty(): boolean;
  /** First object, or null when the collection is empty. */
  first(): T | null;
  /**
   * Call `fn` for every object. The return value is ignored (java Consumer): `return false`
   * does NOT stop the iteration — use a plain loop over size()/get() to break early.
   */
  each(fn: (object: T) => void): this;
  is(selector: string): boolean;
  clone(): ArchiCollection<T>;

  /** Descendants (recursive). */
  find(): ArchiCollection<DescendantsOf<T>>;
  find(selector: ElementSelector): ArchiCollection<ElementsOf<T>>;
  find(selector: RelationSelector): ArchiCollection<RelationsOf<T>>;
  find(selector: string): ArchiCollection<DescendantsOf<T>>;
  /** Direct children. */
  children(): ArchiCollection<DescendantsOf<T>>;
  children(selector: ElementSelector): ArchiCollection<ElementsOf<T>>;
  children(selector: "view"): ArchiCollection<ArchimateView>;
  children(selector: "folder"): ArchiCollection<Folder>;
  children(selector: string): ArchiCollection<DescendantsOf<T>>;
  parent(): ArchiCollection<ParentsOf<T>>;
  parent(selector: "folder"): ArchiCollection<Folder>;
  parent(selector: string): ArchiCollection<ParentsOf<T>>;
  /** All ancestors. @since 1.7 */
  parents(selector?: string): ArchiCollection<ParentsOf<T>>;

  rels(selector?: string): ArchiCollection<RelationsOf<T>>;
  inRels(selector?: string): ArchiCollection<RelationsOf<T>>;
  outRels(selector?: string): ArchiCollection<RelationsOf<T>>;
  ends(selector?: string): ArchiCollection<EndsOf<T>>;
  sourceEnds(selector?: string): ArchiCollection<EndsOf<T>>;
  targetEnds(selector?: string): ArchiCollection<EndsOf<T>>;
  /** Views in which the concepts appear. */
  viewRefs(selector?: string): ArchiCollection<ArchimateView>;
  /** Visuals that reference the concepts. */
  objectRefs(selector?: string): ArchiCollection<VisualObject | VisualConnection>;

  filter(selector: ElementSelector): ArchiCollection<Extract<T, ArchiElement | VisualObject>>;
  filter(selector: RelationSelector): ArchiCollection<Extract<T, ArchiRelation | VisualConnection>>;
  filter(selector: "folder"): ArchiCollection<Extract<T, Folder>>;
  filter(selector: "view"): ArchiCollection<Extract<T, ArchiView>>;
  filter(selector: string): ArchiCollection<T>;
  /** Keep the objects for which `predicate` returns true (java Predicate). */
  filter(predicate: (object: T) => boolean): ArchiCollection<T>;
  not(selector: string | ArchiCollection<ArchiProxy>): ArchiCollection<T>;
  has(selector: string): ArchiCollection<T>;
  /** Union; the original collection is not changed. */
  add<U extends ArchiProxy>(other: ArchiCollection<U>): ArchiCollection<T | U>;
  add(selector: string): ArchiCollection<T | ArchiObject>;

  attr(name: string): unknown;
  attr(name: string, value: unknown): this;
  prop(): string[];
  prop(key: string): string | null;
  prop(key: string, allowDuplicate: boolean): string[] | string | null;
  prop(key: string, value: string, allowDuplicate?: boolean): this;
  removeProp(key: string, value?: string): this;
  /** Delete every object in the collection. */
  delete(): this;
}

// ── $ / jArchi ───────────────────────────────────────────────────────────────────────────────────

interface JArchiStatic {
  /** `$(selection)` returns the selection itself. */
  <T extends ArchiProxy>(collection: ArchiCollection<T>): ArchiCollection<T>;
  <T extends ArchiProxy>(object: T): ArchiCollection<T>;
  /**
   * model.find(selector): "element", "relation", "view", "folder", a type ("business-actor"),
   * ".Name", "#id", "*". `#id` can match visuals as well as concepts.
   */
  (selector: string): ArchiCollection<ArchiObject>;
  readonly model: {
    /** @since 1.2 */
    renderViewAsBase64(view: ArchiView, format: string, options?: object): string;
    /** @since 1.7 */
    renderViewToSVG(view: ArchiView, filePath: string, options?: object): void;
    [member: string]: unknown;
  };
  readonly fs: { [member: string]: unknown };
  readonly process: {
    /** Java class name of the script engine. */
    readonly engine: string;
    readonly argv: string[];
    readonly platform: string;
    readonly release: {
      readonly archiName: string;
      readonly archiVersion: string;
      readonly jArchiName: string;
      readonly jArchiVersion: string;
    };
  };
  readonly child_process: { exec(...args: string[]): void };
}

declare var $: JArchiStatic;
declare var jArchi: JArchiStatic;
/** Current model (check `model.isSet()` first). */
declare var model: CurrentModel;
/** Objects selected in the model tree or on a view when the script started. */
declare var selection: ArchiCollection<ArchiObject>;

// ── Console and dialogs ──────────────────────────────────────────────────────────────────────────

/** jArchi Script Console (dom/ui/Console.java). Not the browser/Node console: there is no warn/info/debug. */
interface JArchiConsole {
  show(): void;
  hide(): void;
  setText(text: string): void;
  log(...objects: unknown[]): void;
  print(object: unknown): void;
  println(object: unknown): void;
  /** Writes in red. */
  error(error: unknown): void;
  clear(): void;
  setTextColor(red: number, green: number, blue: number): void;
  setDefaultTextColor(): void;
}
declare var console: JArchiConsole;

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

// ── Script environment ───────────────────────────────────────────────────────────────────────────

/** Directory of the running script file, with a trailing separator (nashorn-compat). */
declare var __DIR__: string;
/** Path of the running script file (nashorn-compat). */
declare var __FILE__: string;
declare var __LINE__: number;
/** User scripts folder from the jArchi preferences, with a trailing separator. */
declare var __SCRIPTS_DIR__: string;

/**
 * Java interop (GraalJS). Results are Java objects whose shape tsc cannot know, hence `any`:
 * annotate the variable that receives a Java value when you need checking.
 */
declare var Java: {
  type(className: string): any;
  from(javaArray: any): any[];
  to(jsArray: unknown[], javaType?: string | object): any;
  extend(...types: any[]): any;
  isJavaObject(value: unknown): boolean;
  isType(value: unknown): boolean;
  typeName(value: unknown): string | undefined;
};
/** Nashorn-compat package root, e.g. Packages.java.io.File. */
declare var Packages: any;
/** Archi's main SWT Shell (org.eclipse.swt.widgets.Shell). */
declare var shell: any;
declare var workbench: any;
declare var workbenchwindow: any;

// CommonJS (GraalJS commonjs-require, enabled in the jArchi preferences)
declare function require(id: string): any;
declare var module: { exports: any; id: string; filename: string; loaded: boolean };
declare var exports: any;
declare var __filename: string;
declare var __dirname: string;

// ── Constants (js/init.js) ───────────────────────────────────────────────────────────────────────

declare const TEXT_ALIGNMENT: { readonly LEFT: 1; readonly CENTER: 2; readonly RIGHT: 4 };
declare const TEXT_POSITION: { readonly TOP: 0; readonly CENTER: 1; readonly BOTTOM: 2 };
declare const CONNECTION_TEXT_POSITION: { readonly SOURCE: 0; readonly MIDDLE: 1; readonly TARGET: 2 };
declare const CONNECTION_STYLE: {
  readonly LINE_SOLID: 0; readonly ARROW_FILL_TARGET: 1; readonly LINE_DASHED: 2; readonly LINE_DOTTED: 4;
  readonly ARROW_NONE: 0; readonly ARROW_FILL_SOURCE: 8; readonly ARROW_HOLLOW_TARGET: 16;
  readonly ARROW_HOLLOW_SOURCE: 32; readonly ARROW_LINE_TARGET: 64; readonly ARROW_LINE_SOURCE: 128;
};
/** @since 1.8 */
declare const LINE_STYLE: { readonly SOLID: 0; readonly DASHED: 1; readonly DOTTED: 2; readonly NONE: 3 };
declare const BORDER: { readonly TABBED: 0; readonly DOGEAR: 0; readonly RECTANGLE: 1; readonly NONE: 2 };
declare const GRADIENT: { readonly NONE: -1; readonly TOP: 0; readonly LEFT: 1; readonly RIGHT: 2; readonly BOTTOM: 3 };
declare const SHOW_ICON: { readonly IF_NO_IMAGE: 0; readonly ALWAYS: 1; readonly NEVER: 2 };
declare const IMAGE_SOURCE: { readonly SPECIALIZATION: 0; readonly CUSTOM: 1 };
declare const IMAGE_POSITION: {
  readonly TOP_LEFT: 0; readonly TOP_CENTER: 1; readonly TOP_RIGHT: 2;
  readonly MIDDLE_LEFT: 3; readonly MIDDLE_CENTER: 4; readonly MIDDLE_RIGHT: 5;
  readonly BOTTOM_LEFT: 6; readonly BOTTOM_CENTER: 7; readonly BOTTOM_RIGHT: 8; readonly FILL: 9;
};
declare const CONNECTION_ROUTER: { readonly BENDPOINT: 0; readonly MANHATTAN: 1 };
