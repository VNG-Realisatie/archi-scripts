# Graphviz Attribute Reference

Attributes are set as `key=value` or `key="value"` inside `[...]`. Values with spaces or commas must be quoted.

**Scope codes:** G = graph, N = node, E = edge, C = cluster subgraph

---

## Layout control (graph-level)

### `rankdir` (dot only)
Direction of graph layout.
- **Scope:** G
- **Values:** `TB` (default), `BT`, `LR`, `RL`
- **Engine:** dot only

### `ranksep`
- **Scope:** G
- **dot:** Minimum distance between ranks (inches). Default `0.5`. Min `0.02`.
  - Keyword variant: `"1.0 equally"` — centers all ranks at equal intervals
- **twopi:** Radial distance between concentric circles (inches). Default `1.0`.
  - List variant: `"0.5 0.75 1.0"` — per-circle radii (first = inner radius, rest = increments)

### `nodesep` (dot only)
- **Scope:** G
- Minimum horizontal space between adjacent nodes in the **same rank** (inches). Default `0.25`. Min `0.02`.
- In non-dot engines: affects spacing between self-loop edges and parallel edges only.

### `sep`
- **Scope:** G
- **Engines:** neato, fdp, sfdp, circo, twopi
- Margin added around nodes during overlap removal. Default `+4` (points).
- **`+w` prefix (additive):** adds `w` points to each side of the node bounding box.
- **Without `+` (multiplicative):** node bounding box scales by `1 + w` in each dimension.
- Point format: `"+w,h"` — different x/y margins.

### `esep`
- **Scope:** G
- **Engines:** all
- Margin for edge routing (same format as `sep`). Default: derived as `sep × 0.8`.
- In dot: used to keep edges away from nodes when routing.

### `mindist` (circo only)
- **Scope:** G
- Minimum separation between all nodes (inches). Default `1.0`. Min `0.0`.

### `splines`
- **Scope:** G
- Controls edge routing style.

| Value | Meaning |
|-------|---------|
| `spline` / `true` | Bézier splines routed around nodes |
| `line` / `false` | Straight line segments |
| `polyline` | Polyline (diagonal segments) |
| `ortho` | Axis-aligned right-angle segments (dot only; no port/label support) |
| `curved` | Curved arcs |
| `none` / `""` | Edges not drawn |
| `compound` | Routes around clusters AND nodes (fdp only) |

- **dot default:** `spline`
- **All other engines default:** `line`
- Using splines with neato/fdp/sfdp requires `overlap=false` or `overlap=prism`.

### `compound` (dot only)
- **Scope:** G
- Default: `false`. Must be `true` to draw edges between clusters (using `lhead`/`ltail` on edges).

### `pad`
- **Scope:** G
- Extra space (inches) added around the graph drawing. Default `0.0555` (~4pt).
- Point format: `"w,h"` for asymmetric padding.
- Filled with `bgcolor` if set.

### `size`
- **Scope:** G
- Maximum width,height of drawing in inches: `"w,h"` or `"w,h!"` (force exact fit).
- Without `!`: drawing scales down to fit but never up.
- With `!`: drawing is scaled to exactly fill the box (may distort).

### `ratio`
- **Scope:** G
- Aspect ratio of the drawing (height/width).
- Numeric value: e.g. `0.75` means height = 0.75 × width.
- Keywords:
  - `fill` — scale x/y independently to fill `size` (may shrink text)
  - `compress` — tighter packing to fit `size` (dot only)
  - `expand` — scale up uniformly when smaller than `size` (dot only)
  - `auto` — ideal size for multi-page output (dot only)
- Adjusted before `size` constraints are applied.

### `clusterrank` (dot only)
- **Scope:** G
- Default: `local`. Controls how clusters affect rank assignment.
- `local` — nodes inside clusters are ranked independently.
- `global` — cluster nodes share ranks with the rest of the graph.
- `none` — clusters not drawn (subgraphs treated as plain subgraphs).

---

## Node attributes

### `shape`
Common values: `ellipse` (default), `box`/`rectangle`, `circle`, `diamond`, `point`, `record`, `plaintext`, `none`.

### `width` / `height`
Node dimensions in **inches**. Default: `0.75` / `0.5`.

### `fixedsize`
- `false` (default): node expands to fit its label.
- `true`: node size is exactly `width` × `height`; label may be clipped.
- `shape`: node shape fixes to `width`/`height`; label size still computed (advanced).

### `label`
Text to display. Default is `\N` (node ID). Use `label=""` for no label.
Supports `\n` for line breaks, `\l` (left-align), `\r` (right-align).

### `style`
Comma-separated: `filled`, `dashed`, `dotted`, `bold`, `rounded`, `diagonals`, `invis`.

### `color` / `fillcolor`
Node border color / fill color. `fillcolor` requires `style=filled`.
Formats: named (`red`, `lightblue`), hex (`#rrggbb`), HSV (`"0.5 0.5 0.8"`).

---

## Edge attributes

### `weight`
- Integer or double. Default `1`.
- dot: higher weight → shorter edge, more vertical routing, higher rank priority.
- neato/fdp: affects spring length.

### `constraint` (dot only)
- `true` (default): edge participates in rank assignment.
- `false`: edge is drawn but doesn't affect rank — useful for cross-rank aesthetic edges.

### `minlen` (dot only)
- Minimum difference in rank between tail and head. Default `1`.
- `minlen=2` forces a gap of at least 2 ranks.

### `len` (neato, fdp)
- Preferred edge length in inches. Default `1.0` (neato), `0.3` (fdp).

### `label` / `xlabel`
- `label`: attached to edge path; dot positions it near the center and may affect routing.
- `xlabel`: external label; positioned after layout without affecting routing. Use `xlabel` to avoid routing artefacts.

### `lp`
- Output only (JSON). Position of the label center: `"x,y"` in points.

### `pos`
- Output only (JSON). Spline control points — see `json-output.md`.

### `dir`
- `forward` (default for digraph), `back`, `both`, `none`.

### `style`
`solid`, `dashed`, `dotted`, `bold`, `invis`.

---

## Cluster subgraph attributes

Applied inside `subgraph "cluster_..." { graph [...] }`.

### `margin`
- Internal padding around cluster contents (points). Default `8.0`.
- Point format: `"h,v"` for asymmetric.
- Unit is **points** (not inches): convert from pixels → `px × 0.75` (96dpi → 72pt/inch).

### `label`
Text label displayed at the cluster border.

### `style`
`filled`, `rounded`, `dashed`, `dotted`, `bold`.

### `color` / `fillcolor` / `bgcolor`
Border and fill colors for the cluster bounding box.

---

## Unit conversions

| From | To | Factor |
|------|----|--------|
| Inches | Points | × 72 |
| Inches | Pixels (96dpi) | × 96 |
| Points | Pixels (96dpi) | × 96/72 = × 1.333… |
| Pixels (96dpi) | Inches | ÷ 96 |
| Pixels (96dpi) | Points | × 72/96 = × 0.75 |

Graphviz attribute inputs (`width`, `height`, `ranksep`, `nodesep`, `pad`, `size`, `len`) use **inches**.
`sep`, `esep` with `+` prefix use **points**.
`cluster margin` uses **points**.
JSON output (`pos`, `bb`) uses **points**.
