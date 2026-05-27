# JSON Graph Format & Coordinates

## Overview

The ELK JSON format describes graphs using five element types: **nodes**, **ports**, **labels**, **edges**, and **edge sections**. This is the format elkjs accepts and returns.

## Nodes

```json
{
  "id": "n1",
  "width": 100,
  "height": 50,
  "layoutOptions": { "elk.direction": "RIGHT" },
  "labels": [{ "text": "Node 1", "width": 40, "height": 15 }],
  "ports": [
    { "id": "p1", "width": 5, "height": 5 }
  ],
  "children": [
    { "id": "n1_child", "width": 30, "height": 30 }
  ],
  "edges": [
    { "id": "e1", "sources": ["n1_child"], "targets": ["n1_child2"] }
  ]
}
```

- `id` — **required** (string or integer), must be unique
- `width`, `height` — node dimensions; should be set before layout
- `layoutOptions` — key-value pairs for layout configuration
- `labels` — array of label objects
- `ports` — array of port objects
- `children` — array of child nodes (for hierarchical/compound graphs)
- `edges` — edges contained within this node

After layout, `x` and `y` are populated with the computed position.

## Ports

```json
{ "id": "p1", "width": 5, "height": 5, "labels": [{ "text": "in" }] }
```

- `id` — **required**, unique
- `width`, `height` — port dimensions
- `labels` — optional labels

After layout, `x` and `y` are populated relative to the owning node.

## Labels

```json
{ "text": "A label", "width": 60, "height": 15 }
```

- `text` — label content
- `width`, `height` — **must be set manually** (ELK does not estimate text size)

After layout, `x` and `y` are populated.

## Edges (Extended Format)

The standard edge format uses `sources` and `targets` arrays:

```json
{
  "id": "e1",
  "sources": ["n1"],
  "targets": ["n2"],
  "labels": [{ "text": "edge label", "width": 50, "height": 10 }]
}
```

- `id` — **required**, unique
- `sources` — array of source node/port IDs. **Mandatory.**
- `targets` — array of target node/port IDs. **Mandatory.**
- `labels` — optional edge labels

This format supports hyperedges (multiple sources/targets), though most algorithms only support single source and single target.

After layout, edges get `sections` describing the routing.

### Connecting to Ports

Reference the port ID directly in `sources`/`targets`:

```json
{
  "id": "e1",
  "sources": ["n1.p1"],
  "targets": ["n2.p2"]
}
```

Or simply use the port's ID if unique:
```json
{
  "id": "e1",
  "sources": ["p1"],
  "targets": ["p2"]
}
```

## Edge Sections (Layout Output)

After layout, edges contain `sections` describing the routing path:

```json
{
  "id": "e1",
  "sources": ["n1"],
  "targets": ["n2"],
  "sections": [{
    "id": "s1",
    "startPoint": { "x": 40, "y": 25 },
    "endPoint": { "x": 100, "y": 25 },
    "bendPoints": [
      { "x": 60, "y": 25 },
      { "x": 60, "y": 50 }
    ]
  }]
}
```

- `startPoint` — where the edge begins
- `endPoint` — where the edge ends
- `bendPoints` — intermediate routing points (may be empty for straight edges)
- `junctionPoints` — split/merge points for hyperedges

## Primitive Edges (Legacy)

The older format uses singular `source`/`target`. Avoid in new code:

```json
{
  "id": "e1",
  "source": "n1",
  "target": "n2",
  "sourcePort": "p1",
  "targetPort": "p2"
}
```

## Complete Example

```json
{
  "id": "root",
  "layoutOptions": {
    "elk.algorithm": "layered",
    "elk.direction": "RIGHT"
  },
  "children": [
    {
      "id": "n1",
      "width": 100,
      "height": 50,
      "ports": [
        { "id": "n1_out", "width": 5, "height": 5 }
      ],
      "labels": [{ "text": "Source", "width": 40, "height": 15 }]
    },
    {
      "id": "n2",
      "width": 100,
      "height": 50,
      "ports": [
        { "id": "n2_in", "width": 5, "height": 5 }
      ],
      "labels": [{ "text": "Target", "width": 40, "height": 15 }]
    }
  ],
  "edges": [
    {
      "id": "e1",
      "sources": ["n1_out"],
      "targets": ["n2_in"]
    }
  ]
}
```

## Coordinate System

### Relative Coordinates

Coordinates of nodes, ports, and labels are **relative to their parent element**:
- Node `x`/`y` is relative to its parent node
- Port `x`/`y` is relative to its owning node
- Label `x`/`y` is relative to the element it belongs to

### Shape Coordinates Setting (`org.eclipse.elk.json.shapeCoords`)

Controls how node/port/label coordinates are interpreted:
- `PARENT` (default at root) — coordinates relative to the parent element
- `ROOT` — coordinates relative to the root node (global)
- `INHERIT` (default elsewhere) — inherits from parent

### Edge Coordinates Setting (`org.eclipse.elk.json.edgeCoords`)

Controls how edge points and edge label coordinates are interpreted:
- `CONTAINER` (default at root) — coordinates relative to the edge's container node (lowest common ancestor of endpoints)
- `PARENT` — coordinates relative to the JSON parent node where the edge is defined
- `ROOT` — global coordinates
- `INHERIT` (default elsewhere) — inherits from parent

When using `CONTAINER` mode, ELK adds a `container` property to the edge with the container node's ID.

### Important

The edge container is the **lowest common ancestor** of all edge endpoints. For simple edges (same-level source and target), this is the parent node. For hierarchy-crossing edges, it can be a higher ancestor.

## ELK Text Format

An alternative text-based format (`.elkt`) for describing graphs. Useful for testing with [ELK Live](https://rtsys.informatik.uni-kiel.de/elklive/). Key differences from JSON:

- Node IDs must start with a letter
- Default node sizes are applied automatically (unlike JSON)
- Uses `node`, `edge`, `port`, `label` keywords

```
node n1 {
  layout [ size: 100, 50 ]
  port p1
  label "Source"
}
node n2 {
  layout [ size: 100, 50 ]
  port p2
  label "Target"
}
edge n1.p1 -> n2.p2
```

Layout options in ELKT:
```
algorithm: layered
elk.direction: RIGHT
node n1 { /* ... */ }
```
