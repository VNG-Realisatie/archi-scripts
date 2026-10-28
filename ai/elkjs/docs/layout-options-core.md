# Core Layout Options

These options are shared across multiple algorithms. Algorithm-specific options are documented in `algorithm-selection.md` (per algorithm) and `elk-layered.md` (for the layered algorithm).

Layout options are set as key-value pairs in a `layoutOptions` object on any graph element. Use the `elk.` prefix (e.g., `elk.direction`) to avoid ambiguity with short suffixes.

## Layout Algorithm Selection

| Option | ID | Default | Description |
|---|---|---|---|
| Layout Algorithm | `org.eclipse.elk.algorithm` | — | Algorithm to use (e.g., `layered`, `stress`, `force`) |
| Resolved Algorithm | `org.eclipse.elk.resolvedAlgorithm` | — | Internal: resolved algorithm reference |

## Direction & Flow

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Direction | `org.eclipse.elk.direction` | Enum | `UNDEFINED` | Main layout direction. Values: `UNDEFINED`, `RIGHT`, `LEFT`, `DOWN`, `UP` |
| Content Alignment | `org.eclipse.elk.contentAlignment` | EnumSet | `topLeft` | How to align content within the parent. Combinations of `H_LEFT`, `H_CENTER`, `H_RIGHT`, `V_TOP`, `V_CENTER`, `V_BOTTOM` |
| Aspect Ratio | `org.eclipse.elk.aspectRatio` | Float | varies | Target width/height ratio for the drawing |

## Spacing Options

All spacing values are numeric (doubles). Spacing is measured between element margins, not borders.

### Between Elements (Same Layer)

| Option | ID | Default | Description |
|---|---|---|---|
| Node Spacing | `org.eclipse.elk.spacing.nodeNode` | `20` | Space between nodes |
| Edge Spacing | `org.eclipse.elk.spacing.edgeEdge` | `10` | Space between edges |
| Edge-Node Spacing | `org.eclipse.elk.spacing.edgeNode` | `10` | Space between edges and nodes |
| Edge-Label Spacing | `org.eclipse.elk.spacing.edgeLabel` | `2` | Space between edges and labels |
| Label Spacing | `org.eclipse.elk.spacing.labelLabel` | `0` | Space between labels |
| Label-Node Spacing | `org.eclipse.elk.spacing.labelNode` | `5` | Space between labels and nodes |
| Port Spacing | `org.eclipse.elk.spacing.portPort` | `10` | Space between ports |
| Label-Port Horizontal | `org.eclipse.elk.spacing.labelPortHorizontal` | `1` | Horizontal space between labels and ports |
| Label-Port Vertical | `org.eclipse.elk.spacing.labelPortVertical` | `1` | Vertical space between labels and ports |
| Comment-Comment Spacing | `org.eclipse.elk.spacing.commentComment` | `10` | Space between comments |
| Comment-Node Spacing | `org.eclipse.elk.spacing.commentNode` | `10` | Space between comments and nodes |
| Components Spacing | `org.eclipse.elk.spacing.componentComponent` | `20` | Space between connected components |
| Node Self Loop Spacing | `org.eclipse.elk.spacing.nodeSelfLoop` | `10` | Space for self-loop edges |
| Additional Port Space | `org.eclipse.elk.spacing.portsSurrounding` | `ElkMargin(0)` | Extra space around ports |

### Individual Spacing Override

| Option | ID | Description |
|---|---|---|
| Individual Spacing | `org.eclipse.elk.spacing.individual` | Per-element spacing override. Set on a specific element to override compound node spacing. |

### Padding & Margins

| Option | ID | Default | Description |
|---|---|---|---|
| Padding | `org.eclipse.elk.padding` | varies by algo | Insets inside a node (space between node border and its contents) |
| Margins | `org.eclipse.elk.margins` | `ElkMargin()` | Space outside a node (affects spacing calculations) |
| Node Label Padding | `org.eclipse.elk.nodeLabels.padding` | `ElkPadding(5)` | Padding around node labels |

**Important:** Spacing is measured from margin borders, not node borders. Edge spacing disregards edge thickness.

## Edge Configuration

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Edge Routing | `org.eclipse.elk.edgeRouting` | Enum | `ORTHOGONAL` | Values: `UNDEFINED`, `POLYLINE`, `ORTHOGONAL`, `SPLINES` |
| Edge Label Placement | `org.eclipse.elk.edgeLabels.placement` | Enum | `CENTER` | Values: `UNDEFINED`, `HEAD`, `CENTER`, `TAIL` |
| Inline Edge Labels | `org.eclipse.elk.edgeLabels.inline` | Boolean | `false` | Place labels directly on edge paths |
| Edge Thickness | `org.eclipse.elk.edge.thickness` | Double | `1` | Thickness of edges (for rendering, not spacing) |
| Edge Type | `org.eclipse.elk.edge.type` | Enum | — | Internal edge type classification |
| Junction Points | `org.eclipse.elk.junctionPoints` | KVectorChain | `[]` | Computed junction points for hyperedges |
| Bend Points | `org.eclipse.elk.bendPoints` | — | Predefined bend points (used by Fixed layout) |

## Port Configuration

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Port Constraints | `org.eclipse.elk.portConstraints` | Enum | `UNDEFINED` | How strictly ports are constrained. Values: `UNDEFINED`, `FREE`, `FIXED_SIDE`, `FIXED_ORDER`, `FIXED_RATIO`, `FIXED_POS` |
| Port Side | `org.eclipse.elk.port.side` | Enum | `UNDEFINED` | Which side of the node. Values: `UNDEFINED`, `NORTH`, `SOUTH`, `EAST`, `WEST` |
| Port Alignment | `org.eclipse.elk.portAlignment.default` | Enum | `JUSTIFIED` | Values: `DISTRIBUTED`, `BEGIN`, `CENTER`, `END`, `JUSTIFIED` |
| Port Alignment (North) | `org.eclipse.elk.portAlignment.north` | Enum | — | Override for north side |
| Port Alignment (South) | `org.eclipse.elk.portAlignment.south` | Enum | — | Override for south side |
| Port Alignment (East) | `org.eclipse.elk.portAlignment.east` | Enum | — | Override for east side |
| Port Alignment (West) | `org.eclipse.elk.portAlignment.west` | Enum | — | Override for west side |
| Port Border Offset | `org.eclipse.elk.port.borderOffset` | Double | `0` | Offset from the node border |
| Port Anchor Offset | `org.eclipse.elk.port.anchor` | — | Anchor point offset within the port |
| Port Index | `org.eclipse.elk.port.index` | Integer | — | Order index for port ordering |
| Port Label Placement | `org.eclipse.elk.portLabels.placement` | EnumSet | `outside` | Values: `INSIDE`, `OUTSIDE`, `ALWAYS_OTHER_SAME_SIDE`, `SPACE_EFFICIENT` |
| Port Labels Next to Port | `org.eclipse.elk.portLabels.nextToPortIfPossible` | Boolean | `false` | Place labels next to port instead of at default position |
| Treat Port Labels as Group | `org.eclipse.elk.portLabels.treatAsGroup` | Boolean | `true` | Treat all port labels as a single group for placement |

### Port Constraints Values Explained

- `UNDEFINED` — no constraints, algorithm chooses freely
- `FREE` — ports can be placed anywhere
- `FIXED_SIDE` — ports stay on their assigned side but can move along it
- `FIXED_ORDER` — port order on each side is preserved
- `FIXED_RATIO` — port positions are preserved as a ratio of the node side length
- `FIXED_POS` — port positions are absolute (will not be moved)

### Port Configuration Examples

**Fixed-side ports with per-side alignment:**
```json
{
  "id": "n1",
  "width": 100,
  "height": 100,
  "layoutOptions": {
    "elk.portConstraints": "FIXED_SIDE",
    "elk.spacing.portPort": "10",
    "elk.portAlignment.west": "BEGIN",
    "elk.portAlignment.north": "CENTER",
    "elk.portAlignment.east": "DISTRIBUTED",
    "elk.portAlignment.south": "JUSTIFIED"
  },
  "ports": [
    { "id": "pw1", "layoutOptions": { "elk.port.side": "WEST" } },
    { "id": "pw2", "layoutOptions": { "elk.port.side": "WEST" } },
    { "id": "pe1", "layoutOptions": { "elk.port.side": "EAST" } }
  ]
}
```

**Port spacing note:** `elk.spacing.portPort` is only respected by `BEGIN`, `END`, and `CENTER` alignments (if the node's size permits). For `JUSTIFIED` and `DISTRIBUTED`, ports are evenly spaced regardless.

**Auto-resize node to fit ports:**
```json
{
  "id": "n1",
  "layoutOptions": {
    "elk.portConstraints": "FIXED_SIDE",
    "elk.portAlignment.default": "CENTER",
    "elk.nodeSize.minimum": "(40, 40)",
    "elk.nodeSize.constraints": "[PORTS, MINIMUM_SIZE]"
  },
  "ports": [
    { "id": "p1", "layoutOptions": { "elk.port.side": "WEST" } },
    { "id": "p2", "layoutOptions": { "elk.port.side": "WEST" } },
    { "id": "p3", "layoutOptions": { "elk.port.side": "WEST" } }
  ]
}
```

Without `nodeSize.constraints`, ports are squeezed together if the node is too small. Adding `[PORTS, MINIMUM_SIZE]` lets the algorithm enlarge the node.

**Port border offset:** Move a port away from the node border:
```json
{
  "id": "p1",
  "layoutOptions": {
    "elk.port.side": "WEST",
    "elk.port.borderOffset": "15"
  }
}
```

## Node Configuration

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Node Label Placement | `org.eclipse.elk.nodeLabels.placement` | EnumSet | `fixed` | Values include: `INSIDE`, `OUTSIDE`, `H_LEFT`, `H_CENTER`, `H_RIGHT`, `V_TOP`, `V_CENTER`, `V_BOTTOM` |
| Node Size Constraints | `org.eclipse.elk.nodeSize.constraints` | EnumSet | `none` | Values: `NODE_LABELS`, `PORTS`, `PORT_LABELS`, `MINIMUM_SIZE`. Controls what drives node sizing. |
| Node Size Minimum | `org.eclipse.elk.nodeSize.minimum` | KVector | `(0, 0)` | Minimum node size |
| Node Size Options | `org.eclipse.elk.nodeSize.options` | EnumSet | `DEFAULT_MINIMUM_SIZE` | Additional size options |
| Fixed Graph Size | `org.eclipse.elk.nodeSize.fixedGraphSize` | Boolean | `false` | Whether the graph size is fixed |
| Alignment | `org.eclipse.elk.alignment` | Enum | `AUTOMATIC` | Node alignment within its layer/position |
| Hypernode | `org.eclipse.elk.hypernode` | Boolean | `false` | Mark a node as a hypernode |
| Comment Box | `org.eclipse.elk.commentBox` | Boolean | `false` | Mark a node as a comment |
| No Layout | `org.eclipse.elk.noLayout` | Boolean | `false` | Exclude element from layout |
| Omit Node Micro Layout | `org.eclipse.elk.omitNodeMicroLayout` | Boolean | `false` | Skip internal node layout (label/port placement) |
| Expand Nodes | `org.eclipse.elk.expandNodes` | Boolean | `false` | Expand nodes to fill available space |
| Position | `org.eclipse.elk.position` | KVector | — | Predefined position |

### Node Label Placement

`nodeLabels.placement` combines three components: vertical alignment, horizontal alignment, and inside/outside. Set on the node or on individual labels.

```json
{
  "id": "n1",
  "width": 200,
  "height": 75,
  "labels": [
    {
      "text": "Title",
      "width": 30,
      "height": 15,
      "layoutOptions": { "elk.nodeLabels.placement": "INSIDE V_TOP H_CENTER" }
    },
    {
      "text": "Status: OK",
      "width": 60,
      "height": 15,
      "layoutOptions": { "elk.nodeLabels.placement": "INSIDE V_BOTTOM H_RIGHT" }
    }
  ]
}
```

Common placements:
- `"INSIDE V_TOP H_CENTER"` — centered title at top of node
- `"OUTSIDE V_TOP H_LEFT"` — label above node, left-aligned
- `"INSIDE V_BOTTOM H_LEFT"` — bottom-left inside node
- `"OUTSIDE H_PRIORITY V_TOP H_LEFT"` — outside, horizontal position takes priority

**Important:** The algorithm computes label position relative to the node's top-left corner. Label `width` and `height` must be set manually.

### Auto-sizing Nodes

Use `nodeSize.constraints` to let the algorithm resize nodes to fit their contents:

```json
{
  "id": "n1",
  "layoutOptions": {
    "elk.nodeSize.constraints": "[NODE_LABELS, MINIMUM_SIZE]",
    "elk.nodeSize.minimum": "(50, 30)",
    "elk.nodeLabels.placement": "INSIDE V_CENTER H_CENTER"
  },
  "labels": [{ "text": "A long node title", "width": 110, "height": 15 }]
}
```

- `NODE_LABELS` — resize to fit node labels
- `PORTS` — resize to fit ports with their spacing
- `PORT_LABELS` — resize to fit port labels
- `MINIMUM_SIZE` — enforce the minimum size

These can be combined: `"[NODE_LABELS, PORTS, MINIMUM_SIZE]"`

### Padding and Labels Interaction

Padding (`elk.padding`) defines space between the node border and its children. When combined with `nodeLabels.placement: INSIDE`, padding and label space are cumulative:

```json
{
  "id": "parent",
  "layoutOptions": {
    "elk.padding": "[top=20,left=20,bottom=20,right=20]",
    "elk.nodeLabels.placement": "INSIDE V_TOP H_CENTER"
  },
  "labels": [{ "text": "Container", "width": 60, "height": 15 }],
  "children": [{ "id": "child", "width": 30, "height": 30 }]
}
```

The label occupies space above the children area, and padding adds space around it. Without `nodeLabels.placement`, the default padding (12px each side) is used.

## Hierarchy & Partitioning

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Hierarchy Handling | `org.eclipse.elk.hierarchyHandling` | Enum | `INHERIT` | Values: `INHERIT`, `INCLUDE_CHILDREN`, `SEPARATE_CHILDREN` |
| Layout Partitioning | `org.eclipse.elk.partitioning.activate` | Boolean | `false` | Enable partition-based layout |
| Layout Partition | `org.eclipse.elk.partitioning.partition` | Integer | — | Partition ID for a node |
| Separate Connected Components | `org.eclipse.elk.separateConnectedComponents` | Boolean | `true` | Lay out connected components separately |
| Layout Ancestors | `org.eclipse.elk.layoutAncestors` | Boolean | — | Also lay out ancestor nodes |

### Hierarchy Handling Values

- `INHERIT` — inherit from parent
- `INCLUDE_CHILDREN` — lay out this node and its children as one combined graph
- `SEPARATE_CHILDREN` — lay out children independently from the parent level

## Top-down Layout Options

| Option | ID | Default | Description |
|---|---|---|---|
| Topdown Layout | `org.eclipse.elk.topdownLayout` | `false` | Enable top-down layout |
| Topdown Node Type | `org.eclipse.elk.topdown.nodeType` | `HIERARCHICAL_NODE` | Values: `HIERARCHICAL_NODE`, `PARALLEL_NODE`, `ROOT_NODE` |
| Topdown Scale Factor | `org.eclipse.elk.topdown.scaleFactor` | `1` | Scale factor for top-down children |
| Topdown Scale Cap | `org.eclipse.elk.topdown.scaleCap` | — | Maximum scale factor |
| Topdown Hierarchical Node Width | `org.eclipse.elk.topdown.hierarchicalNodeWidth` | `150` | Default width for hierarchical nodes |
| Topdown Hierarchical Node Aspect Ratio | `org.eclipse.elk.topdown.hierarchicalNodeAspectRatio` | `1.414` | Default aspect ratio for hierarchical nodes |
| Topdown Size Approximator | `org.eclipse.elk.topdown.sizeApproximator` | — | Strategy for size approximation |
| Number of Size Categories | `org.eclipse.elk.topdown.sizeCategories` | — | Number of categories for size grouping |
| Hierarchical Node Weight | `org.eclipse.elk.topdown.sizeCategoriesHierarchicalNodeWeight` | — | Weight for hierarchical nodes in size grouping |

## JSON Coordinate Settings

| Option | ID | Default | Description |
|---|---|---|---|
| Shape Coords | `org.eclipse.elk.json.shapeCoords` | `INHERIT` (root: `PARENT`) | Coordinate mode for nodes/ports/labels |
| Edge Coords | `org.eclipse.elk.json.edgeCoords` | `INHERIT` (root: `CONTAINER`) | Coordinate mode for edge points/labels |

See `json-format.md` for detailed coordinate system documentation.

## Interaction & Animation

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Interactive | `org.eclipse.elk.interactive` | Boolean | `false` | Enable interactive layout (consider existing positions) |
| Interactive Layout | `org.eclipse.elk.interactiveLayout` | Boolean | `false` | Layout mode for interactive editing |
| Animate | `org.eclipse.elk.animate` | Boolean | — | Enable animation |
| Animation Time Factor | `org.eclipse.elk.animTimeFactor` | Integer | — | Speed factor for animation |
| Min Animation Time | `org.eclipse.elk.minAnimTime` | Integer | — | Minimum animation duration |
| Max Animation Time | `org.eclipse.elk.maxAnimTime` | Integer | — | Maximum animation duration |
| Debug Mode | `org.eclipse.elk.debugMode` | Boolean | `false` | Enable debug output |
| Randomization Seed | `org.eclipse.elk.randomSeed` | Integer | `1` | Seed for deterministic randomization |
| Priority | `org.eclipse.elk.priority` | Integer | varies | Element priority for layout decisions |
| Scale Factor | `org.eclipse.elk.scaleFactor` | Double | — | Scale factor for the drawing |
| Validate Graph | `org.eclipse.elk.validateGraph` | Boolean | — | Validate graph structure before layout |
| Validate Options | `org.eclipse.elk.validateOptions` | Boolean | — | Validate layout options before layout |
| Progress Bar | `org.eclipse.elk.progressBar` | Boolean | — | Show progress |
| Label Manager | `org.eclipse.elk.labels.labelManager` | — | — | Custom label manager |
| Zoom to Fit | `org.eclipse.elk.zoomToFit` | Boolean | — | Zoom to fit content |
| Softwrapping Fuzziness | `org.eclipse.elk.softwrappingFuzziness` | — | — | Fuzziness for soft wrapping |

## Font Options

| Option | ID | Description |
|---|---|---|
| Font Name | `org.eclipse.elk.font.name` | Font family name |
| Font Size | `org.eclipse.elk.font.size` | Font size in points |

## Inside Self Loops

| Option | ID | Type | Default | Description |
|---|---|---|---|---|
| Activate Inside Self Loops | `org.eclipse.elk.insideSelfLoops.activate` | Boolean | `false` | Enable inside self-loop routing |
| Inside Self Loop | `org.eclipse.elk.insideSelfLoops.yo` | Boolean | `false` | Mark a specific self-loop as inside |

## Option Key Shorthand

You can use suffixes instead of full IDs:
- `algorithm` instead of `org.eclipse.elk.algorithm`
- `direction` instead of `org.eclipse.elk.direction`

**Warning:** If the suffix is not unique across all options, the option may be silently ignored. Always use at least the `elk.` prefix (e.g., `elk.direction`) for safety.

```json
{
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT",
    "elk.spacing.nodeNode": "40"
  }
}
```
