# Choosing a Layout Algorithm

Set the algorithm via `layoutOptions` on the root node (or any hierarchical node):

```json
{ "layoutOptions": { "elk.algorithm": "layered" } }
```

You can use the short suffix (e.g., `layered`) or the full ID (e.g., `org.eclipse.elk.layered`). The `elk.` prefix is recommended to avoid ambiguity.

## Algorithm Overview

| Algorithm | ID | Best For |
|---|---|---|
| **ELK Layered** | `org.eclipse.elk.layered` | Directed graphs with inherent flow direction, port-based diagrams |
| **ELK Force** | `org.eclipse.elk.force` | Undirected graphs, organic layouts |
| **ELK Stress** | `org.eclipse.elk.stress` | Undirected graphs, preserving graph-theoretic distances |
| **ELK Mr. Tree** | `org.eclipse.elk.mrtree` | Tree structures (hierarchies, org charts) |
| **ELK Radial** | `org.eclipse.elk.radial` | Trees displayed in concentric circles around a root |
| **ELK Box** | `org.eclipse.elk.box` | Packing disconnected boxes (no edges) |
| **ELK Rectangle Packing** | `org.eclipse.elk.rectpacking` | Packing disconnected boxes preserving input order |
| **ELK DisCo** | `org.eclipse.elk.disco` | Arranging disconnected subgraphs (component layout) |
| **ELK Fixed** | `org.eclipse.elk.fixed` | Preserving existing positions (manual layout) |
| **ELK Randomizer** | `org.eclipse.elk.random` | Random placement (testing/demo only) |
| **ELK SPOrE Compaction** | `org.eclipse.elk.sporeCompaction` | Compacting existing layouts while preserving topology |
| **ELK SPOrE Overlap** | `org.eclipse.elk.sporeOverlap` | Removing node overlaps from existing layouts |
| **ELK Top-down Packing** | `org.eclipse.elk.topdownpacking` | Fixed-size box packing with horizontal expansion |
| **ELK VertiFlex** | `org.eclipse.elk.vertiflex` | Trees with user-defined vertical positions |

### Not available in elkjs by default

These algorithms require external tooling (Graphviz installation or native libraries):
- **Graphviz Dot/Neato/FDP/Circo/Twopi** (`org.eclipse.elk.graphviz.*`) — wrappers around Graphviz
- **Libavoid** (`org.eclipse.elk.alg.libavoid`) — connector routing library
- **Draw2D** (`org.eclipse.elk.conn.gmf.layouter.Draw2D`) — Eclipse GMF layout

## Algorithm Details

---

### ELK Layered

**ID:** `org.eclipse.elk.layered`

The flagship algorithm. Arranges nodes into horizontal or vertical layers, emphasizing edge direction. Based on the Sugiyama method (1981). Best for directed node-link diagrams with ports.

**Supported graph features:** Self loops, inside self loops, multi edges, edge labels, ports, compound/hierarchical graphs, clusters.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Direction | `elk.direction` | `UNDEFINED` |
| Edge Routing | `elk.edgeRouting` | `ORTHOGONAL` |
| Node Spacing | `elk.spacing.nodeNode` | `20` |
| Node-Node Between Layers | `elk.layered.spacing.nodeNodeBetweenLayers` | `20` |
| Thoroughness | `elk.layered.thoroughness` | `7` |
| Separate Components | `elk.separateConnectedComponents` | `true` |
| Hierarchy Handling | `elk.hierarchyHandling` | `INHERIT` |

See `elk-layered.md` for the complete option reference.

---

### ELK Force

**ID:** `org.eclipse.elk.force`

Force-directed layout simulating physical forces (attraction/repulsion). Supports Eades and Fruchterman-Reingold models.

**Supported graph features:** Multi edges, edge labels.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Force Model | `elk.force.model` | `FRUCHTERMAN_REINGOLD` |
| Iterations | `elk.force.iterations` | `300` |
| Node Spacing | `elk.spacing.nodeNode` | `80` |
| Eades Repulsion | `elk.force.repulsion` | `5.0` |
| FR Temperature | `elk.force.temperature` | `0.001` |
| Repulsive Power | `elk.force.repulsivePower` | `0` |
| Separate Components | `elk.separateConnectedComponents` | `true` |
| Aspect Ratio | `elk.aspectRatio` | `1.6` |
| Padding | `elk.padding` | `50` |

---

### ELK Stress

**ID:** `org.eclipse.elk.stress`

Minimizes stress using stress majorization — stress exists when euclidean distance between nodes doesn't match their graph-theoretic distance (shortest path). Allows individual edge lengths.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Desired Edge Length | `elk.stress.desiredEdgeLength` | `100.0` |
| Stress Epsilon | `elk.stress.epsilon` | `10e-4` |
| Iteration Limit | `elk.stress.iterationLimit` | `Integer.MAX_VALUE` |
| Fixed Position | `elk.stress.fixed` | `false` |
| Layout Dimension | `elk.stress.dimension` | `XY` |
| Inline Edge Labels | `elk.edgeLabels.inline` | `true` |

---

### ELK Mr. Tree

**ID:** `org.eclipse.elk.mrtree`

Computes a spanning tree of the input and arranges nodes according to the parent-child hierarchy. Supports disconnected graphs.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Direction | `elk.direction` | `UNDEFINED` |
| Node Spacing | `elk.spacing.nodeNode` | `20` |
| Edge Node Spacing | `elk.spacing.edgeNode` | `3` |
| Edge Routing Mode | `elk.mrtree.edgeRoutingMode` | `AVOID_OVERLAP` |
| Edge End Texture Length | `elk.mrtree.edgeEndTextureLength` | `7` |
| Search Order | `elk.mrtree.searchOrder` | `DFS` |
| Weighting | `elk.mrtree.weighting` | `MODEL_ORDER` |
| Compaction | `elk.mrtree.compaction` | `false` |
| Aspect Ratio | `elk.aspectRatio` | `1.6` |
| Padding | `elk.padding` | `20` |
| Separate Components | `elk.separateConnectedComponents` | `true` |

---

### ELK Radial

**ID:** `org.eclipse.elk.radial`

Places tree nodes on concentric circles around a root. Based on Peter Eades's algorithm. Each subtree occupies a wedge proportional to its size.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Node Spacing | `elk.spacing.nodeNode` | `20` |
| Radius | `elk.radial.radius` | `0.0` (auto) |
| Compaction | `elk.radial.compactor` | `NONE` |
| Compaction Step Size | `elk.radial.compactionStepSize` | `1` |
| Rotate | `elk.radial.rotate` | `false` |
| Target Angle | `elk.radial.rotation.targetAngle` | `0` |
| Outgoing Edge Angles | `elk.radial.rotation.outgoingEdgeAngles` | `false` |
| Additional Wedge Space | `elk.radial.rotation.computeAdditionalWedgeSpace` | `false` |
| Center On Root | `elk.radial.centerOnRoot` | `false` |
| Sorter | `elk.radial.sorter` | `NONE` |
| Order ID | `elk.radial.orderId` | `0` |
| Annulus Wedge Criteria | `elk.radial.wedgeCriteria` | `NODE_SIZE` |
| Translation Optimization | `elk.radial.optimizationCriteria` | `NONE` |

---

### ELK Box

**ID:** `org.eclipse.elk.box`

Packs disconnected boxes (graphs without edges). Simple packing into rows.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Box Layout Mode | `elk.box.packingMode` | `SIMPLE` |
| Aspect Ratio | `elk.aspectRatio` | `1.3` |
| Node Spacing | `elk.spacing.nodeNode` | `15` |
| Padding | `elk.padding` | `15` |
| Content Alignment | `elk.contentAlignment` | `topLeft` |
| Expand Nodes | `elk.expandNodes` | `false` |
| Priority | `elk.priority` | `0` |

---

### ELK Rectangle Packing

**ID:** `org.eclipse.elk.rectpacking`

Packs disconnected boxes while preserving input order (left-to-right reading direction). Phases: width approximation, placement, compaction, node expansion.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Aspect Ratio | `elk.aspectRatio` | `1.3` |
| Compaction Strategy | `elk.rectpacking.packing.strategy` | `COMPACTION` |
| Compaction Iterations | `elk.rectpacking.packing.compaction.iterations` | `1` |
| Optimization Goal | `elk.rectpacking.widthApproximation.optimizationGoal` | `MAX_SCALE_DRIVEN` |
| Width Approximation Strategy | `elk.rectpacking.widthApproximation.strategy` | `GREEDY` |
| Target Width | `elk.rectpacking.widthApproximation.targetWidth` | `-1` (auto) |
| Node Spacing | `elk.spacing.nodeNode` | `15` |
| Padding | `elk.padding` | `15` |
| Content Alignment | `elk.contentAlignment` | `topLeft` |
| Order By Size | `elk.rectpacking.orderBySize` | `false` |
| Try Box First | `elk.rectpacking.trybox` | `false` |
| Row Height Reevaluation | `elk.rectpacking.packing.compaction.rowHeightReevaluation` | `false` |
| Shift Last Placed | `elk.rectpacking.widthApproximation.lastPlaceShift` | `true` |
| Current Position | `elk.rectpacking.currentPosition` | `-1` |
| Desired Position | `elk.rectpacking.desiredPosition` | `-1` |
| In New Row | `elk.rectpacking.inNewRow` | `false` |
| White Space Strategy | `elk.rectpacking.whiteSpaceElimination.strategy` | `NONE` |

---

### ELK DisCo

**ID:** `org.eclipse.elk.disco`

Arranges disconnected subgraphs (connected components). Does not lay out subgraphs internally by default — use `elk.disco.componentCompaction.componentLayoutAlgorithm` to specify an internal layout algorithm.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Components Spacing | `elk.spacing.componentComponent` | `20` |
| Compaction Strategy | `elk.disco.componentCompaction.strategy` | `POLYOMINO` |
| Component Layout Algorithm | `elk.disco.componentCompaction.componentLayoutAlgorithm` | not defined |
| Padding | `elk.padding` | `12` |
| Fill Polyominoes | `elk.polyomino.fill` | `true` |
| Primary Sorting | `elk.polyomino.highLevelSort` | `NUM_OF_EXTERNAL_SIDES_THAN_NUM_OF_EXTENSIONS_LAST` |
| Secondary Sorting | `elk.polyomino.lowLevelSort` | `BY_SIZE_AND_SHAPE` |
| Traversal Strategy | `elk.polyomino.traversalStrategy` | `QUADRANTS_LINE_BY_LINE` |

---

### ELK Fixed

**ID:** `org.eclipse.elk.fixed`

Preserves existing positions. Use when you want to keep manually specified coordinates. Optionally set `elk.position` on nodes and `elk.bendPoints` on edges.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Position | `elk.position` | not defined |
| Bend Points | `elk.bendPoints` | not defined |
| Padding | `elk.padding` | `15` |
| Fixed Graph Size | `elk.nodeSize.fixedGraphSize` | `false` |

---

### ELK SPOrE Compaction

**ID:** `org.eclipse.elk.sporeCompaction`

Compacts an existing layout while preserving topology. Uses Delaunay triangulation and spanning tree contraction.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Compaction Strategy | `elk.compaction.compactionStrategy` | `DEPTH_FIRST` |
| Node Spacing | `elk.spacing.nodeNode` | `8` |
| Orthogonal | `elk.compaction.orthogonal` | `false` |
| Padding | `elk.padding` | `8` |
| Structure Extraction | `elk.structure.structureExtractionStrategy` | `DELAUNAY_TRIANGULATION` |
| Tree Construction | `elk.processingOrder.treeConstruction` | `MINIMUM_SPANNING_TREE` |
| Root Selection | `elk.processingOrder.rootSelection` | `CENTER_NODE` |
| Preferred Root | `elk.processingOrder.preferredRoot` | `null` |
| Cost Function | `elk.processingOrder.spanningTreeCostFunction` | `CIRCLE_UNDERLAP` |
| Underlying Algorithm | `elk.underlyingLayoutAlgorithm` | not defined |

---

### ELK SPOrE Overlap Removal

**ID:** `org.eclipse.elk.sporeOverlap`

Removes node overlaps from an existing layout. Based on Nachmanson et al.'s "growing a tree" approach.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Node Spacing | `elk.spacing.nodeNode` | `8` |
| Padding | `elk.padding` | `8` |
| Max Iterations | `elk.overlapRemoval.maxIterations` | `64` |
| Run Scanline Check | `elk.overlapRemoval.runScanline` | `true` |
| Structure Extraction | `elk.structure.structureExtractionStrategy` | `DELAUNAY_TRIANGULATION` |
| Underlying Algorithm | `elk.underlyingLayoutAlgorithm` | not defined |

---

### ELK Top-down Packing

**ID:** `org.eclipse.elk.topdownpacking`

Packs fixed-size boxes with horizontal expansion to fill whitespace. Used in top-down layout for `PARALLEL_NODE` types.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Node Arrangement | `elk.topdownpacking.nodeArrangement.strategy` | `LEFT_RIGHT_TOP_DOWN_NODE_PLACER` |
| Whitespace Elimination | `elk.topdownpacking.whitespaceElimination.strategy` | `BOTTOM_ROW_EQUAL_WHITESPACE_ELIMINATOR` |
| Node Spacing | `elk.spacing.nodeNode` | `20` |
| Padding | `elk.padding` | `12` |
| Topdown Node Type | `elk.topdown.nodeType` | `PARALLEL_NODE` |

---

### ELK VertiFlex

**ID:** `org.eclipse.elk.vertiflex`

Tree layout allowing user-defined vertical positions instead of automatic level assignment.

**Supported graph features:** Multi edges, edge labels.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Fixed Vertical Position | `elk.vertiflex.verticalConstraint` | not defined |
| Edge Layout Strategy | `elk.vertiflex.layoutStrategy` | `STRAIGHT` |
| Layer Distance | `elk.vertiflex.layerDistance` | `50.0` |
| Consider Node Model Order | `elk.vertiflex.considerNodeModelOrder` | `true` |
| Node Spacing | `elk.spacing.nodeNode` | `20` |
| Padding | `elk.padding` | `5` |
| Port Constraints | `elk.portConstraints` | `UNDEFINED` |

---

### ELK Randomizer

**ID:** `org.eclipse.elk.random`

Distributes nodes randomly. Only useful for testing or demonstrating the value of real algorithms.

**Key options:**

| Option | ID | Default |
|---|---|---|
| Aspect Ratio | `elk.aspectRatio` | `1.6` |
| Node Spacing | `elk.spacing.nodeNode` | `15` |
| Padding | `elk.padding` | `15` |
| Randomization Seed | `elk.randomSeed` | `0` |

## Default Algorithms in elkjs

The `ELK` constructor includes these algorithms by default:
- `layered`, `stress`, `mrtree`, `radial`, `force`, `disco`
- Always included: `box`, `fixed`, `random`

To use additional algorithms, pass them in the `algorithms` constructor option.
