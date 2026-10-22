/**
 * Vendored libraries without their own declarations — only the members the adapters use.
 * Not loaded at runtime. elkjs ships its own (Scripts/node_modules/elkjs/lib/*.d.ts).
 */

// ── dagre-cluster-fix (Scripts/node_modules/dagre-cluster-fix) — graphlib API, dagre wiki ─────────

interface DagreNodeLabel {
  label?: string;
  width: number;
  height: number;
  /** Centre coordinates after layout. */
  x: number;
  y: number;
}

/** Edge label as the adapter sets it (setEdge always passes id, conceptId and label). */
interface DagreEdgeLabel {
  id: string;
  conceptId: string;
  label: string;
  minlen?: number;
  weight?: number;
  /** Routed points after layout, boundary points included. */
  points?: Point[];
}

interface DagreEdgeObj {
  v: string;
  w: string;
  name?: string;
}

interface DagreGraph {
  setGraph(label: Record<string, unknown>): DagreGraph;
  setDefaultNodeLabel(fn: () => object): DagreGraph;
  setDefaultEdgeLabel(fn: () => object): DagreGraph;
  setNode(id: string, label: Partial<DagreNodeLabel>): DagreGraph;
  hasNode(id: string): boolean;
  node(id: string): DagreNodeLabel;
  nodes(): string[];
  setParent(child: string, parent: string): DagreGraph;
  parent(id: string): string | undefined;
  setEdge(edge: DagreEdgeObj, label: DagreEdgeLabel): DagreGraph;
  hasEdge(v: string, w: string, name?: string): boolean;
  edge(edge: DagreEdgeObj): DagreEdgeLabel | undefined;
  edges(): DagreEdgeObj[];
}

interface DagreModule {
  graphlib: {
    Graph: new (options: { directed?: boolean; compound?: boolean; multigraph?: boolean }) => DagreGraph;
  };
  layout(graph: DagreGraph): void;
}

// ── Graphviz `-Tjson` output (graphviz.org/docs/outputs/json) — fields the adapter reads ─────────

/** A graph, subgraph (cluster) or node object. Coordinates are strings in points. */
interface GraphvizJson {
  name?: string;
  /** "llx,lly,urx,ury" */
  bb?: string;
  /** "x,y" (nodes) */
  pos?: string;
  /** Inches, as strings. */
  width?: string;
  height?: string;
  objects?: GraphvizJson[];
  edges?: GraphvizJsonEdge[];
}

interface GraphvizJsonEdge {
  /** Custom attribute set by the adapter (eid="<edge id>"); Graphviz echoes it at top level or under attrs. */
  eid?: string;
  attrs?: { eid?: string };
  /** Spline control points, "e,x,y x,y …". */
  pos?: string;
  /** Label position "x,y". */
  lp?: string;
}

// ── elkjs — repo's synchronous wrapper (Scripts/node_modules/elkjs/index.js) ────────────────────
// Graph shapes after elkjs's elk-api.d.ts (EPL-2.0), restated here because that file does not
// check cleanly without DOM types. The wrapper returns the laid-out graph directly, not a Promise.

/** ELK layout options: every value is a string. */
type ElkLayoutOptions = Record<string, string>;

interface ElkShape {
  id?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labels?: ElkLabel[];
  layoutOptions?: ElkLayoutOptions;
}

interface ElkNode extends ElkShape {
  id: string;
  children?: ElkNode[];
  ports?: ElkPort[];
  edges?: ElkExtendedEdge[];
}

interface ElkPort extends ElkShape {
  id: string;
}

interface ElkLabel extends ElkShape {
  text?: string;
}

interface ElkEdgeSection {
  id: string;
  startPoint: Point;
  endPoint: Point;
  bendPoints?: Point[];
  incomingShape?: string;
  outgoingShape?: string;
}

interface ElkExtendedEdge extends ElkShape {
  id: string;
  sources: string[];
  targets: string[];
  sections?: ElkEdgeSection[];
  /** Set by ELK on output: the node the edge's coordinates are relative to. */
  container?: string;
}

interface ElkSyncModule {
  /** Lays out `graph` and returns it with positions filled in; extra fields on nodes and edges survive. */
  layout<G extends ElkNode>(graph: G): G;
}

// ── chroma-js (Scripts/node_modules/chroma-js, required as "chroma-js") — gka.github.io/chroma.js ─

declare module "chroma-js" {
  interface ChromaColor {
    hex(mode?: "auto" | "rgb" | "rgba" | "argb"): string;
  }
  interface ChromaScale {
    (value: number): ChromaColor;
    colors(count: number, format?: "hex"): string[];
    padding(pad: number | [number, number]): ChromaScale;
    domain(domain: number[]): ChromaScale;
  }
  interface ChromaStatic {
    scale(colors?: string | string[]): ChromaScale;
    mix(color1: string, color2: string, ratio?: number, mode?: string): ChromaColor;
  }
  const chroma: ChromaStatic;
  export = chroma;
}
