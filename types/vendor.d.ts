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
