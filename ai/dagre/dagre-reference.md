# dagre & dagre-cluster-fix Reference

## Packages

Two packages — same top-level API, different compound-graph support:

| Package | Install | Use when |
|---------|---------|----------|
| `@dagrejs/dagre` | `npm install @dagrejs/dagre` | No compound graphs needed |
| `dagre-cluster-fix` | vendored in `Scripts/node_modules/` | Compound/cluster graphs (this project's default) |

Both expose `dagre.layout(g)` and `dagre.graphlib`.

**CommonJS loading:**
```js
// Standard dagre
const dagre = require('@dagrejs/dagre');

// dagre-cluster-fix (this project — use REPO_ROOT pattern)
const dagre = require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js");
```

---

## graphlib.Graph

```js
const g = new dagre.graphlib.Graph({
  directed:   true,   // default: true  — directed edges
  multigraph: false,  // default: false — allow multiple edges between same node pair
  compound:   false,  // default: false — allow parent–child node relationships
});
```

Use `compound: true` when calling `setParent()`. Use `multigraph: true` when multiple edges can exist between the same pair of nodes.

### Configuration

```js
g.setGraph({ /* graph-level layout options */ });
g.setDefaultNodeLabel(() => ({}));  // function or static value
g.setDefaultEdgeLabel(() => ({}));
```

### Node operations

```js
g.setNode(id, { label, width, height });  // width/height required for layout
g.node(id);       // returns node label object, or undefined
g.hasNode(id);    // boolean — O(1)
g.nodes();        // array of all node IDs
g.removeNode(id); // removes node and all its incident edges; returns graph
g.nodeCount();    // integer
```

### Edge operations

```js
// Simple edge
g.setEdge(v, w, label);

// Named edge — required in multigraphs to distinguish parallel edges
g.setEdge({ v, w, name }, label);

g.edge(v, w);           // returns edge label, or undefined
g.edge({ v, w, name }); // named edge variant
g.hasEdge(v, w);
g.hasEdge({ v, w, name });
g.edges();              // array of edge objects: { v, w, name }
g.removeEdge(v, w);
g.removeEdge(v, w, name);
g.edgeCount();
```

### Traversal

```js
g.predecessors(v);      // array of predecessor IDs; undefined if v absent
g.successors(v);        // array of successor IDs
g.neighbors(v);         // all adjacent nodes (in + out)
g.inEdges(v, [u]);      // incoming edges; optional filter by source u
g.outEdges(v, [w]);     // outgoing edges; optional filter by target w
g.nodeEdges(v, [w]);    // all edges regardless of direction
g.sources();            // nodes with no in-edges
g.sinks();              // nodes with no out-edges
```

### Compound operations

```js
// Add ALL nodes first, then set parents
g.setParent(child, parent);  // requires compound: true
g.parent(v);                 // returns parent node ID, or undefined
g.children(v);               // returns array of child node IDs (or [] if none)
```

### Graph label & serialization

```js
g.setGraph(label);    // set graph-level label object (also used for layout options)
g.graph();            // returns graph label
g.isDirected();
g.isMultigraph();
g.isCompound();

const { json } = dagre.graphlib;
const serialized = json.write(g);
const restored   = json.read(serialized);
```

---

## dagre.layout()

```js
dagre.layout(g);
```

Mutates `g` in place — adds `x`, `y` to every node and `points` to every edge. Returns `undefined`.

Call once per graph. Layout is not idempotent.

---

## Graph-level options (`setGraph`)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rankdir` | `"TB"\|"BT"\|"LR"\|"RL"` | `"tb"` | Direction of layout. Case-insensitive. |
| `nodesep` | number | `50` | Minimum px between adjacent nodes on the same rank |
| `ranksep` | number | `50` | Minimum px between ranks (layers) |
| `edgesep` | number | `20` | Minimum px between adjacent edges on the same rank |
| `marginx` | number | `0` | Extra margin added to left and right of the final layout |
| `marginy` | number | `0` | Extra margin added to top and bottom of the final layout |
| `acyclicer` | `"greedy"\|undefined` | `undefined` | Cycle removal strategy. `"greedy"` uses a greedy heuristic; default (undefined) uses DFS. |
| `ranker` | `"network-simplex"\|"tight-tree"\|"longest-path"` | `"network-simplex"` | Algorithm for assigning nodes to ranks |
| `align` | `"UL"\|"UR"\|"DL"\|"DR"\|undefined` | `undefined` | Node alignment within a rank: Up/Down + Left/Right |

---

## Node input properties (`setNode`)

| Property | Type | Default | Notes |
|----------|------|---------|-------|
| `width` | number | `0` | **Required** for meaningful layout |
| `height` | number | `0` | **Required** for meaningful layout |
| `label` | any | — | User data; not used by dagre |

Any additional properties set on a node are preserved through layout.

## Node output (after `layout`)

| Property | Type | Description |
|----------|------|-------------|
| `x` | number | **Center** x coordinate |
| `y` | number | **Center** y coordinate |
| `width` | number | Unchanged from input |
| `height` | number | Unchanged from input |

**Center-based coordinates** — convert to top-left: `left = x - width/2`, `top = y - height/2`.

---

## Edge input properties (`setEdge`)

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `minlen` | number | `1` | Minimum number of ranks between source and target |
| `weight` | number | `1` | Preference for keeping the edge short and straight; higher = more emphasis |
| `width` | number | `0` | Width of edge label box (0 = no label) |
| `height` | number | `0` | Height of edge label box |
| `labelpos` | `"l"\|"c"\|"r"` | `"r"` | Label position relative to edge: left, center, right |
| `labeloffset` | number | `10` | Margin in px between label box and edge |

## Edge output (after `layout`)

| Property | Type | Description |
|----------|------|-------------|
| `points` | `{x,y}[]` | Waypoints along the edge path |
| `x` | number | Label center x (only when `width > 0`) |
| `y` | number | Label center y (only when `width > 0`) |

**`points` includes boundary points**: index `0` and the last element are the points where the edge meets the node boundaries. These are not useful as Archi bendpoints. Strip them: `points.slice(1, -1)`.

---

## dagre-cluster-fix divergences

`dagre-cluster-fix` is a fork that adds compound (cluster) graph support. It bundles lodash and overrides the compound node placement logic.

| Behavior | `@dagrejs/dagre` | `dagre-cluster-fix` |
|----------|-----------------|---------------------|
| Compound/cluster nodes | Not supported | Supported via `setParent()` |
| Cluster node sizing | N/A | Derived from children — cannot be overridden as hard constraints |
| Self-loop routing | Silently skips — `points` is empty | Throws `"k.toLowerCase is not a function"` |
| Extra dependency | None | Bundles lodash |

**Self-loop handling (both packages):**
```js
// Filter self-loops BEFORE calling layout() — dagre-cluster-fix throws, standard dagre silently drops
const selfLoops = [];
for (const edge of inputEdges) {
  if (edge.source === edge.target) { selfLoops.push(edge); continue; }
  g.setEdge(edge.source, edge.target, ...);
}
dagre.layout(g);
// Handle selfLoops separately after layout (e.g., synthesise bendpoints)
```

---

## Known limitations

1. **Self-loops not routed** — Standard dagre produces an empty `points` array for self-loops. `dagre-cluster-fix` throws. Filter before `layout()` in both cases; synthesise bendpoints manually afterward.

2. **`edgesep` scope** — Controls spacing only between edges on the same rank, not between edges and unrelated nodes.

3. **`points` includes boundary points** — Always strip first and last: `points.slice(1, -1)` before applying as Archi bendpoints. Keeping them places waypoints exactly on the node boundary.

4. **`ranker: "tight-tree"` can produce wide graphs** — Tends to assign many nodes to the same rank in deep hierarchies, resulting in very wide layouts.

5. **Cluster node sizing (dagre-cluster-fix)** — Compound node sizes are computed from children. Setting explicit `width`/`height` on a compound node is overridden by the algorithm. Size is not a controllable input.
