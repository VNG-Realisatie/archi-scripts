

declare var __DIR__: string;
declare var __FILE__: string;
declare var __LINE__: number;

type Selector = string;
type Filter = (e: ArchiObject) => boolean;

interface ArchiObject {
    readonly id: string;
    type: string;
    name: string;
    documentation: string;
    prop(key: string, duplicate?:boolean=false): string|undefined;
    prop(key: string, value: string, duplicate?:boolean=false): void;
    removeProp(key: string, value?: string): void;
    delete(): void;
    readonly model: Model;
}

interface Folder extends ArchiObject {
    add(e: Folder|ArchiObject|ArchimateView): void;
    createFolder(name: string): Folder;
}

interface ArchiElement extends ArchiObject {
    merge(other: ArchiElement): void;
}

interface ArchiRelation extends ArchiObject {
    source: ArchiElement;
    target: ArchiElement;
    accessType?: string; // only for type access-relationship
    influenceStrength?: string; // only for type influence-relationship
    associationDirected?: boolean; // only for type association-relationship
}

interface Rectangle {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

interface ArchimateView {
    createObject(type: string, x: number, y: number, width: number, height: number, autoNest?: boolean): VisualObject;
    createViewReference(view: ArchimateView, x: number, y: number, width: number, height: number): VisualObject;
    add(element: ArchiElement, x: number, y: number, width: number, height: number, autoNest?: boolean): VisualObject;
    add(relationship: ArchiRelation, source: VisualObject, target: VisualObject): VisualConnection;
    viewpoint: string;
    isAllowedConcept(viewpoint: string): boolean;
}

interface Model {
    purpose: string;
    copy(): Model;
    createElement(type: string, name: string, folder?: Folder): ArchiElement;
    createRelationship(type: string, name: string, source: ArchiElement, target: ArchiElement): ArchiRelation;
    createArchimateView(name: string, folder?: Folder): ArchimateView;
    createSketchView(name: string, folder?: Folder): ArchimateView;
    createCanvasView(name: string, folder?: Folder): ArchimateView;
    getPath(): string;
    openInUI(): void;
    save(path?: string): void;
    setAsCurrent(): void;
}

interface VisualObject extends ArchiObject {
    add(element: ArchiElement, x: number, y: number, width: number, height: number): VisualObject;
    createObject(type: string, x: number, y: number, width: number, height: number): VisualObject;
    createViewReference(view: ArchimateView, x: number, y: number, width: number, height: number): VisualObject;
    bounds: Rectangle;
    opacity: number;
    outlineOpacity: number;
    fillColor: string;
    fontColor: string;
    lineColor: string;
    fontSize: number;
    fontName: string;
    fontStyle: string;
    concept: ArchiObject;
    readonly type: string;
    readonly view: ArchimateView;
    text: string;
    figureType: number;
}

interface Bendpoint {
    startX: number;
    startY: number;
    endX: number;
    endY: number;
}

interface VisualConnection extends VisualObject {
    source: VisualObject;
    target: VisualObject;
    lineWidth: number;
    readonly relativeBendpoints: Bendpoint[];
    addRelativeBendpoint(pos: Bendpoint, ix: number): void;
    deleteAllBendpoints(): void;
    deleteBendpoint(ix: number): void;
    labelVisible: boolean;
}

type ModelObject = (ArchiElement|ArchiRelation|VisualObject|VisualConnection);

interface Collection {
    
    parent(selector?: Selector): OCollection;
    parents(selector?: Selector): OCollection;
    find(selector?: Selector):OCollection;
    children(selector?: Selector): OCollection;
    viewRefs(selector?: Selector): OCollection;
    objectRefs(selector?: Selector): OCollection;

    rels(selector?: Selector): OCollection;
    inRels(selector?: Selector): OCollection;
    outRels(selector?: Selector): OCollection;
    ends(selector?:Selector): Collection;
    sourceEnds(selector?: Selector): Collection;
    targetEnds(selector?: Selector): Collection;

    filter(f: Filter|Selector): OCollection;
    not(selector:Selector): OCollection;
    has(selector: Selector): OCollection;
    add(c: Selector|Collection): OCollection;

    attr(key: string): any;
    attr(key: string, value: any): void;
    prop(): string[];
    prop(key: string, duplicate?: boolean = false): string[];
    prop(key: string, value: string, duplicate?:boolean = false): void;
    removeProp(key: string): void;

    each(d: (o: ArchiObject) => any): void;
    clone(): Collection;
    first(): ModelObject;
    get(n: number): ModelObject;
    size(): number;
    is(selector: Selector): boolean;
}

// optional Collection
type OCollection = Collection|null

interface RenderOption {
    scale: number;
    margin: number;
}

interface GlobalModel {
    create(name: string): Model;
    load(path: string): Model;
    isAllowedRelationship(relType: string, sourceType: string, targetType: string): boolean;
    renderViewAsBase64(view: ArchimateView, format: string, options?: RenderOption): string;
    isModelLoaded(model: Model): boolean;
    getLoadedModels(): Model[];
}

declare class jArchi {
    constructor (selector?: Selector): OCollection;
    model: GlobalModel;
    fs: FileSystem;
}

declare const $ = jArchi;
declare const selection = $();

declare function load(path: string): void;
declare function exit(): never;
declare function getArgs(): string[];
declare const shell: any;

interface Console {
    show(): void;
    hide(): void;
    clear(): void;
    setText(t: string): void;
    setTextColor(r: number, g: number, b: number): void;
    setDefaultTextColor(): void;
    log(...m: any): void;
    error(...m: any): void;   
}

declare const console: Console;

interface Window {
    alert(msg: string): void;
    confirm(msg: string): boolean;
    prompt(msg: string, def: string): string;
    promptOpenFile(options?: OpenFileOptions): string;
    promptOpenDirectory(options?: OpenFileOptions): string;
    promptSaveFile(options?: OpenFileOptions): string;
}

// Nashorn specific
class JavaObject {}

class JavaClass {
    constructor();
}

interface Java {
    type: (s: string) => JavaClass;
    extend: (c: JavaClass) => JavaClass
    super: (o: JavaObject) => JavaObject 
}

declare var Java: Java;
