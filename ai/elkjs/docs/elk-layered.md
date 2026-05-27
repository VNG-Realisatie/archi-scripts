# ELK Layered Deep Dive

**ID:** `org.eclipse.elk.layered`

The flagship ELK algorithm. Arranges nodes into layers emphasizing edge direction, based on the Sugiyama method (1981). Supports orthogonal, polyline, and spline edge routing. Handles compound/hierarchical graphs with cross-hierarchy edges.

## Supported Graph Features

- Self loops (and inside self loops)
- Multi edges
- Edge labels
- Ports
- Compound/hierarchical graphs
- Clusters

## Algorithm Phases

ELK Layered operates in 5 main phases, each with configurable strategies:

1. **Cycle Breaking** — remove edge cycles to enable layering
2. **Layering** — assign nodes to layers
3. **Crossing Minimization** — reorder nodes within layers to reduce edge crossings
4. **Node Placement** — assign concrete y-coordinates to nodes
5. **Edge Routing** — compute edge bend points

## 1. Cycle Breaking

| Option | ID | Default | Values |
|---|---|---|---|
| Strategy | `elk.layered.cycleBreaking.strategy` | `GREEDY` | `GREEDY`, `DEPTH_FIRST`, `INTERACTIVE`, `MODEL_ORDER` |
| Feedback Edges | `elk.layered.feedbackEdges` | `false` | Whether to allow feedback edges |

## 2. Layering

| Option | ID | Default | Values |
|---|---|---|---|
| Strategy | `elk.layered.layering.strategy` | `NETWORK_SIMPLEX` | `NETWORK_SIMPLEX`, `LONGEST_PATH`, `COFFMAN_GRAHAM`, `INTERACTIVE`, `MIN_WIDTH`, `STRETCH_WIDTH`, `BF_MODEL_ORDER`, `DF_MODEL_ORDER` |
| Layer Constraint | `elk.layered.layering.layerConstraint` | `NONE` | `NONE`, `FIRST`, `FIRST_SEPARATE`, `LAST`, `LAST_SEPARATE` |
| Layer Choice Constraint | `elk.layered.layering.layerChoiceConstraint` | `null` | Integer — force node into specific layer |
| Layer ID | `elk.layered.layering.layerId` | `-1` | Output: which layer the node was placed in |
| Layer Bound (Coffman-Graham) | `elk.layered.layering.coffmanGraham.layerBound` | `Integer.MAX_VALUE` | Max nodes per layer |
| Node Promotion Strategy | `elk.layered.layering.nodePromotion.strategy` | `NONE` | `NONE`, `NIKOLOV`, `NIKOLOV_IMPROVED`, `NIKOLOV_PIXEL`, `NIKOLOV_SIZE`, `DUMMYNODE_PERCENTAGE`, `NODECOUNT_PERCENTAGE` |
| Max Promotion Iterations | `elk.layered.layering.nodePromotion.maxIterations` | `0` | Max iterations for node promotion |
| Min Width Upper Bound | `elk.layered.layering.minWidth.upperBoundOnWidth` | `4` | Width bound for min-width layerer |
| Min Width Scaling Factor | `elk.layered.layering.minWidth.upperLayerEstimationScalingFactor` | `2` | Scaling factor for min-width layerer |

### Layer Unzipping

| Option | ID | Default | Description |
|---|---|---|---|
| Strategy | `elk.layered.layerUnzipping.strategy` | `NONE` | `NONE` or unzipping strategy |
| Layer Split | `elk.layered.layerUnzipping.layerSplit` | `2` | Split factor for unzipping |
| Minimize Edge Length | `elk.layered.layerUnzipping.minimizeEdgeLength` | `false` | Minimize edge length during unzipping |
| Reset on Long Edges | `elk.layered.layerUnzipping.resetOnLongEdges` | `true` | Reset alternation for long edges |

## 3. Crossing Minimization

| Option | ID | Default | Values |
|---|---|---|---|
| Strategy | `elk.layered.crossingMinimization.strategy` | `LAYER_SWEEP` | `LAYER_SWEEP`, `INTERACTIVE`, `NONE` |
| Greedy Switch Type | `elk.layered.crossingMinimization.greedySwitch.type` | `TWO_SIDED` | `OFF`, `ONE_SIDED`, `TWO_SIDED` |
| Greedy Switch (Hierarchical) | `elk.layered.crossingMinimization.greedySwitchHierarchical.type` | `OFF` | Same values as above |
| Greedy Switch Threshold | `elk.layered.crossingMinimization.greedySwitch.activationThreshold` | `40` | Min graph size to activate greedy switch |
| Force Node Model Order | `elk.layered.crossingMinimization.forceNodeModelOrder` | `false` | Force model order in crossing minimization |
| Semi-Interactive | `elk.layered.crossingMinimization.semiInteractive` | `false` | Consider existing positions |
| Hierarchical Sweepiness | `elk.layered.crossingMinimization.hierarchicalSweepiness` | `0.1` | How much hierarchy influences sweep |
| In-Layer Predecessor Of | `elk.layered.crossingMinimization.inLayerPredOf` | `null` | Force node ordering constraint |
| In-Layer Successor Of | `elk.layered.crossingMinimization.inLayerSuccOf` | `null` | Force node ordering constraint |
| Position Choice Constraint | `elk.layered.crossingMinimization.positionChoiceConstraint` | `null` | Force position within layer |
| Position ID | `elk.layered.crossingMinimization.positionId` | `-1` | Output: position within layer |

## 4. Node Placement

| Option | ID | Default | Values |
|---|---|---|---|
| Strategy | `elk.layered.nodePlacement.strategy` | `BRANDES_KOEPF` | `BRANDES_KOEPF`, `LINEAR_SEGMENTS`, `INTERACTIVE`, `NETWORK_SIMPLEX`, `SIMPLE` |
| BK Edge Straightening | `elk.layered.nodePlacement.bk.edgeStraightening` | `IMPROVE_STRAIGHTNESS` | `NONE`, `IMPROVE_STRAIGHTNESS` |
| BK Fixed Alignment | `elk.layered.nodePlacement.bk.fixedAlignment` | `NONE` | `NONE`, `LEFTUP`, `RIGHTUP`, `LEFTDOWN`, `RIGHTDOWN`, `BALANCED` |
| Favor Straight Edges | `elk.layered.nodePlacement.favorStraightEdges` | not defined | Prefer straight edges over balanced placement |
| Linear Segments Dampening | `elk.layered.nodePlacement.linearSegments.deflectionDampening` | `0.3` | Dampening for linear segments |
| Network Simplex Flexibility | `elk.layered.nodePlacement.networkSimplex.nodeFlexibility` | not defined | Per-node flexibility |
| Network Simplex Flexibility Default | `elk.layered.nodePlacement.networkSimplex.nodeFlexibility.default` | `NONE` | Default node flexibility |

## 5. Edge Routing

| Option | ID | Default | Values |
|---|---|---|---|
| Edge Routing | `elk.edgeRouting` | `ORTHOGONAL` | `UNDEFINED`, `POLYLINE`, `ORTHOGONAL`, `SPLINES` |
| Spline Routing Mode | `elk.layered.edgeRouting.splines.mode` | `SLOPPY` | `CONSERVATIVE`, `SLOPPY` |
| Sloppy Spline Spacing Factor | `elk.layered.edgeRouting.splines.sloppy.layerSpacingFactor` | `0.2` | Layer spacing factor for sloppy splines |
| Polyline Sloped Edge Zone | `elk.layered.edgeRouting.polyline.slopedEdgeZoneWidth` | `2.0` | Width of sloped edge zone |
| Self-Loop Distribution | `elk.layered.edgeRouting.selfLoopDistribution` | `NORTH` | `NORTH`, `EQUALLY` |
| Self-Loop Ordering | `elk.layered.edgeRouting.selfLoopOrdering` | `STACKED` | `STACKED`, `SEQUENCED` |

## Spacing Options (Layered-Specific)

| Option | ID | Default | Description |
|---|---|---|---|
| Node-Node Between Layers | `elk.layered.spacing.nodeNodeBetweenLayers` | `20` | Horizontal gap between layers |
| Edge-Edge Between Layers | `elk.layered.spacing.edgeEdgeBetweenLayers` | `10` | Edge spacing between layers |
| Edge-Node Between Layers | `elk.layered.spacing.edgeNodeBetweenLayers` | `10` | Edge-node spacing between layers |
| Spacing Base Value | `elk.layered.spacing.baseValue` | not defined | Base value for deriving all spacings |

### Spacing Notes

- `elk.spacing.nodeNode` controls spacing within a layer (vertical gap for `RIGHT`/`LEFT` direction)
- `elk.layered.spacing.nodeNodeBetweenLayers` controls spacing between layers (horizontal gap for `RIGHT`/`LEFT` direction)
- Setting `elk.layered.spacing.baseValue` overrides all individual spacing options with derived values

## Edge Labels

| Option | ID | Default | Values |
|---|---|---|---|
| Center Label Strategy | `elk.layered.edgeLabels.centerLabelPlacementStrategy` | `MEDIAN_LAYER` | `MEDIAN_LAYER`, `HEAD_LAYER`, `TAIL_LAYER`, `WIDEST_LAYER` |
| Side Selection | `elk.layered.edgeLabels.sideSelection` | `SMART_DOWN` | `ALWAYS_UP`, `ALWAYS_DOWN`, `SMART_UP`, `SMART_DOWN`, `DIRECTION_UP`, `DIRECTION_DOWN` |

## Model Order

Controls how the input order of nodes/edges influences the layout.

| Option | ID | Default | Values |
|---|---|---|---|
| Strategy | `elk.layered.considerModelOrder.strategy` | `NONE` | `NONE`, `NODES_AND_EDGES`, `PREFER_EDGES`, `PREFER_NODES` |
| Components | `elk.layered.considerModelOrder.components` | `NONE` | `NONE`, `INSIDE`, `OUTSIDE` |
| Port Model Order | `elk.layered.considerModelOrder.portModelOrder` | `false` | Consider port ordering |
| No Model Order | `elk.layered.considerModelOrder.noModelOrder` | `false` | Disable model order for specific nodes |
| Long Edge Strategy | `elk.layered.considerModelOrder.longEdgeStrategy` | `DUMMY_NODE_OVER` | Strategy for long edge ordering |
| Crossing Counter Node Influence | `elk.layered.considerModelOrder.crossingCounterNodeInfluence` | `0` | How much node order affects crossing count |
| Crossing Counter Port Influence | `elk.layered.considerModelOrder.crossingCounterPortInfluence` | `0` | How much port order affects crossing count |

### Group Model Order

| Option | ID | Default |
|---|---|---|
| CM Group Strategy | `elk.layered.considerModelOrder.groupModelOrder.cmGroupOrderStrategy` | `ONLY_WITHIN_GROUP` |
| CB Group Strategy | `elk.layered.considerModelOrder.groupModelOrder.cbGroupOrderStrategy` | `ONLY_WITHIN_GROUP` |
| CM Enforced Group Orders | `elk.layered.considerModelOrder.groupModelOrder.cmEnforcedGroupOrders` | `#[1, 2, 6, 7, 10, 11]` |
| CB Preferred Source ID | `elk.layered.considerModelOrder.groupModelOrder.cbPreferredSourceId` | not defined |
| CB Preferred Target ID | `elk.layered.considerModelOrder.groupModelOrder.cbPreferredTargetId` | not defined |
| Cycle Breaking Group ID | `elk.layered.considerModelOrder.groupModelOrder.cycleBreakingId` | `0` |
| Crossing Min Group ID | `elk.layered.considerModelOrder.groupModelOrder.crossingMinimizationId` | `0` |
| Component Group ID | `elk.layered.considerModelOrder.groupModelOrder.componentGroupId` | `0` |

## Compaction

| Option | ID | Default | Values |
|---|---|---|---|
| Connected Components | `elk.layered.compaction.connectedComponents` | `false` | Compact connected components |
| Post Compaction Strategy | `elk.layered.compaction.postCompaction.strategy` | `NONE` | `NONE`, `LEFT`, `RIGHT`, `LEFT_OR_RIGHT_CONSTRAINT_LOCKING`, `LEFT_RIGHT_CONSTRAINT_LOCKING` |
| Post Compaction Constraints | `elk.layered.compaction.postCompaction.constraints` | `SCANLINE` | `SCANLINE`, `QUADRATIC` |

## Graph Wrapping

Wraps wide layered layouts into multiple rows.

| Option | ID | Default | Description |
|---|---|---|---|
| Strategy | `elk.layered.wrapping.strategy` | `OFF` | `OFF`, `SINGLE_EDGE`, `MULTI_EDGE` |
| Additional Edge Spacing | `elk.layered.wrapping.additionalEdgeSpacing` | `10` | Extra spacing for wrapped edges |
| Correction Factor | `elk.layered.wrapping.correctionFactor` | `1.0` | Width correction factor |
| Cutting Strategy | `elk.layered.wrapping.cutting.strategy` | `MSD` | `MSD`, `MANUAL` |
| Manual Cuts | `elk.layered.wrapping.cutting.cuts` | not defined | Manually specified cut indices |
| MSD Freedom | `elk.layered.wrapping.cutting.msd.freedom` | `1` | Freedom for MSD cutting |
| Improve Cuts | `elk.layered.wrapping.multiEdge.improveCuts` | `true` | Optimize cut positions |
| Improve Wrapped Edges | `elk.layered.wrapping.multiEdge.improveWrappedEdges` | `true` | Optimize wrapped edge routing |
| Distance Penalty | `elk.layered.wrapping.multiEdge.distancePenalty` | `2.0` | Penalty for distance when improving |
| Valid Indices | `elk.layered.wrapping.validify.forbiddenIndices` | not defined | Forbidden wrapping indices |
| Validification Strategy | `elk.layered.wrapping.validify.strategy` | `GREEDY` | `GREEDY`, `LOOK_BACK` |

## High Degree Nodes

| Option | ID | Default | Description |
|---|---|---|---|
| Treatment | `elk.layered.highDegreeNodes.treatment` | `false` | Enable special high-degree node handling |
| Threshold | `elk.layered.highDegreeNodes.threshold` | `16` | Degree threshold for treatment |
| Tree Height | `elk.layered.highDegreeNodes.treeHeight` | `5` | Max tree height for high-degree treatment |

## Miscellaneous

| Option | ID | Default | Description |
|---|---|---|---|
| Direction Congruency | `elk.layered.directionCongruency` | `READING_DIRECTION` | `READING_DIRECTION`, `ROTATION` |
| Thoroughness | `elk.layered.thoroughness` | `7` | Thoroughness of crossing minimization (higher = slower but better) |
| Unnecessary Bendpoints | `elk.layered.unnecessaryBendpoints` | `false` | Add unnecessary bend points for uniformity |
| Merge Edges | `elk.layered.mergeEdges` | `false` | Merge edges with same source/target |
| Merge Hierarchy Edges | `elk.layered.mergeHierarchyEdges` | `true` | Merge hierarchy-crossing edges |
| Allow Non-Flow Ports to Switch Sides | `elk.layered.allowNonFlowPortsToSwitchSides` | `false` | Allow ports to switch sides |
| Port Sorting Strategy | `elk.layered.portSortingStrategy` | `INPUT_ORDER` | `INPUT_ORDER`, `PORT_DEGREE` |
| Generate Position and Layer IDs | `elk.layered.generatePositionAndLayerIds` | `false` | Output layer/position info |
| Interactive Reference Point | `elk.layered.interactiveReferencePoint` | `CENTER` | `CENTER`, `TOP_LEFT` |

## Priority Options

| Option | ID | Default | Description |
|---|---|---|---|
| Priority | `elk.priority` | `0` | General priority for layered layout |
| Direction Priority | `elk.layered.priority.direction` | `0` | Priority for edge direction |
| Shortness Priority | `elk.layered.priority.shortness` | `0` | Priority for short edges |
| Straightness Priority | `elk.layered.priority.straightness` | `0` | Priority for straight edges |

## Common Configurations

### Left-to-right directed graph with orthogonal edges (default)
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT"
  }
}
```

### Top-to-bottom with spline edges
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.edgeRouting": "SPLINES"
  }
}
```

### Compact layout with tight spacing
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.spacing.nodeNode": "10",
    "elk.layered.spacing.nodeNodeBetweenLayers": "15",
    "elk.spacing.edgeNode": "5"
  }
}
```

### Preserve input node order
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES"
  }
}
```

### Hierarchical layout (children laid out with parent)
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN"
  }
}
```

### Fixed port sides with justified alignment
```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.portConstraints": "FIXED_SIDE",
    "elk.portAlignment.default": "JUSTIFIED"
  }
}
```

### Mixed algorithms per hierarchy level

Different hierarchical nodes can use different layout algorithms. When using `INCLUDE_CHILDREN`, nodes with a different algorithm are automatically excluded and laid out separately.

```json
{
  "id": "root",
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.hierarchyHandling": "INCLUDE_CHILDREN"
  },
  "children": [
    { "id": "source", "width": 30, "height": 30 },
    {
      "id": "group",
      "children": [
        {
          "id": "cyclic_subgraph",
          "layoutOptions": {
            "elk.algorithm": "stress",
            "elk.stress.desiredEdgeLength": "50",
            "elk.padding": "[top=10,left=10,bottom=10,right=10]"
          },
          "children": [
            { "id": "a", "width": 30, "height": 30 },
            { "id": "b", "width": 30, "height": 30 },
            { "id": "c", "width": 30, "height": 30 }
          ],
          "edges": [
            { "id": "e_ab", "sources": ["a"], "targets": ["b"] },
            { "id": "e_bc", "sources": ["b"], "targets": ["c"] },
            { "id": "e_ca", "sources": ["c"], "targets": ["a"] }
          ]
        },
        {
          "id": "different_direction",
          "layoutOptions": {
            "elk.direction": "DOWN",
            "elk.hierarchyHandling": "SEPARATE_CHILDREN"
          },
          "children": [
            { "id": "x", "width": 30, "height": 30 },
            { "id": "y", "width": 30, "height": 30 }
          ],
          "edges": [
            { "id": "e_xy", "sources": ["x"], "targets": ["y"] }
          ]
        }
      ]
    }
  ],
  "edges": [
    { "id": "e_cross", "sources": ["source"], "targets": ["a"] }
  ]
}
```

**Key points from this pattern:**
- Set `elk.hierarchyHandling: "SEPARATE_CHILDREN"` on a child node to exclude it from the parent's `INCLUDE_CHILDREN` processing — required when mixing directions
- A child with a different `elk.algorithm` is automatically laid out separately
- Hierarchical edges (cross-boundary) only work within the `INCLUDE_CHILDREN` scope

### Partitioning nodes into groups

Force nodes into specific layers/rows using partitions:

```json
{
  "id": "root",
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "DOWN",
    "elk.partitioning.activate": "true"
  },
  "children": [
    { "id": "n1", "width": 30, "height": 30, "layoutOptions": { "elk.partitioning.partition": "1" } },
    { "id": "n2", "width": 30, "height": 30, "layoutOptions": { "elk.partitioning.partition": "1" } },
    { "id": "n3", "width": 30, "height": 30, "layoutOptions": { "elk.partitioning.partition": "2" } },
    { "id": "n4", "width": 30, "height": 30, "layoutOptions": { "elk.partitioning.partition": "3" } }
  ],
  "edges": [
    { "id": "e1", "sources": ["n1"], "targets": ["n3"] },
    { "id": "e2", "sources": ["n2"], "targets": ["n3"] },
    { "id": "e3", "sources": ["n3"], "targets": ["n4"] }
  ]
}
```

### Inside self-loops

When a node has inside self-loops, ELK internally treats it as hierarchical. You must use `nodeSize.minimum` + `nodeSize.constraints` to control its size:

```json
{
  "id": "n1",
  "width": 200,
  "height": 100,
  "layoutOptions": {
    "elk.insideSelfLoops.activate": "true",
    "elk.portConstraints": "FIXED_SIDE",
    "elk.nodeSize.minimum": "(100, 50)",
    "elk.nodeSize.constraints": "MINIMUM_SIZE"
  },
  "ports": [
    { "id": "p1", "layoutOptions": { "elk.port.side": "WEST" } },
    { "id": "p2", "layoutOptions": { "elk.port.side": "EAST" } }
  ]
}
```

Then create edges — a regular self-loop and an inside self-loop:
```json
{ "id": "e_normal", "sources": ["p1"], "targets": ["p2"] },
{ "id": "e_inside", "sources": ["p1"], "targets": ["p2"], "layoutOptions": { "elk.insideSelfLoops.yo": "true" } }
```

## Spacing Direction Relationship

**Critical:** For left-to-right layouts (`elk.direction: RIGHT`), the layered algorithm creates vertical layers. This means:

- `elk.spacing.nodeNode` = **vertical** spacing (within a layer)
- `elk.layered.spacing.nodeNodeBetweenLayers` = **horizontal** spacing (between layers)
- `elk.spacing.edgeEdge` = **vertical** edge spacing (within a layer)
- `elk.layered.spacing.edgeEdgeBetweenLayers` = **horizontal** edge spacing (between layers)

For top-to-bottom layouts (`elk.direction: DOWN`), the relationship is transposed:

- `elk.spacing.nodeNode` = **horizontal** spacing (within a layer)
- `elk.layered.spacing.nodeNodeBetweenLayers` = **vertical** spacing (between layers)
