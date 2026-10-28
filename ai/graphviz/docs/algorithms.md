# Graphviz Layout Algorithms

Invoked via `-K<engine>` flag or `layout` graph attribute. Each engine is a separate binary (`dot`, `neato`, etc.) but `dot -Kdot`, `dot -Kneato`, etc. all work.

---

## dot

**Best for:** directed flows, pipelines, dependency graphs, process models.

Hierarchical (layered) layout. Assigns nodes to ranks (layers), minimises edge crossings, then positions within ranks.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `rankdir` | `TB` | Layout direction: TB, BT, LR, RL |
| `ranksep` | `0.5` | Min distance between ranks (inches) |
| `nodesep` | `0.25` | Min horizontal space between nodes in same rank (inches) |
| `splines` | `spline` | Edge routing: `spline`, `polyline`, `ortho`, `line`, `curved`, `none` |
| `compound` | `false` | Must be `true` for inter-cluster edges; enables `lhead`/`ltail` |
| `clusterrank` | `local` | `local` (default), `global`, `none` |
| `rank` | — | `same`, `min`, `max`, `source`, `sink` — inside a subgraph |
| `constraint` | `true` | On edges: if `false`, edge doesn't affect rank assignment |
| `minlen` | `1` | On edges: minimum rank difference between tail and head |
| `weight` | `1` | On edges: higher weight = shorter, more vertical edge |
| `concentrate` | `false` | Merge parallel edges; reduces clutter |

**Cluster support:** Full. Clusters are drawn with bounding rectangles. `clusterrank=global` makes nodes in different clusters share ranks — use when clusters shouldn't stagger.

**ortho routing caveat:** Does not handle port-based edges or edge labels.

---

## neato

**Best for:** general undirected graphs, network topology, no clear hierarchy.

Spring-model layout. Nodes are virtual masses connected by springs; equilibrium position minimises edge length differences from an ideal `len`.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `sep` | `+4` | Additive margin around nodes for overlap removal (pt) |
| `esep` | — | Margin for edge routing; defaults to `sep / 0.8` |
| `len` | `1.0` | Preferred edge length (inches); per-edge attribute |
| `splines` | `line` | Default is line; `spline`/`polyline`/`curved` need `overlap=false` |
| `overlap` | — | `false` or `scale` or `prism` — set to avoid node overlap with splines |
| `model` | `shortpath` | Distance model: `shortpath`, `circuit`, `subset`, `mds` |
| `mode` | `major` | Solver: `major`, `KK`, `hier`, `ipsep` |
| `start` | — | Random seed or fixed node for deterministic results |

**Cluster support:** Partial. Clusters render but don't strongly constrain layout — nodes can drift outside cluster bounds.

**splines + neato:** When using `splines=true`, set `overlap=false` (or `overlap=prism`) to prevent edges from routing through nodes.

---

## fdp

**Best for:** force-directed clustering, medium-sized undirected graphs with cluster structure.

Similar to neato but uses a different force-directed algorithm (Fruchterman-Reingold style). Better cluster support than neato.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `sep` | `+4` | Additive node margin (pt) |
| `esep` | — | Edge routing margin; defaults to `sep / 0.8` |
| `splines` | `line` | `compound` is unique to fdp: routes edges around clusters AND nodes |
| `K` | `0.3` | Ideal spring constant; larger → more spread out |
| `maxiter` | — | Max iterations for layout convergence |

**`splines=compound` (fdp only):** Edges are routed to avoid both nodes and clusters. The only algorithm with this option.

**Cluster support:** Partial-to-good. fdp respects clusters better than neato; clusters act as layout regions.

---

## sfdp

**Best for:** large graphs (hundreds to thousands of nodes) where fdp/neato are too slow.

Scalable version of fdp using a multilevel approach. Produces similar results to fdp but much faster on large graphs.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `sep` | `+4` | Additive node margin (pt) |
| `K` | `0.3` | Spring constant |
| `repulsiveforce` | `1.0` | Strength of node repulsion |
| `smoothing` | `none` | Post-processing: `avg_dist`, `graph_dist`, `power_dist`, `rng`, `spring`, `triangle` |

**Cluster support:** None meaningful. sfdp does not honor cluster constraints.

**Use when:** graph has >200 nodes and fdp is too slow.

---

## twopi

**Best for:** radial hierarchies — trees, org charts, hub-and-spoke.

Lays out nodes in concentric circles radiating from a root node. Not suitable for graphs with many cross-edges.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `ranksep` | `1.0` | Radial distance between concentric circles (inches) |
| `root` | — | Node ID to use as center; auto-selected if omitted |
| `ratio` | — | Aspect ratio |
| `size` | — | Max bounding box (inches) |

**No equivalent for element spacing:** twopi does not support `nodesep` or `sep` in a meaningful way. Node angular separation is determined by the tree structure.

**Cluster support:** None.

---

## circo

**Best for:** cyclic structures, ring topologies, circular dependency maps.

Places nodes on circles. Each biconnected component is laid out on its own circle.

| Attribute | Default | Notes |
|-----------|---------|-------|
| `mindist` | `1.0` | Minimum separation between all nodes (inches); circo-only |
| `root` | — | Starting node |
| `ratio` | — | Aspect ratio |
| `size` | — | Max bounding box (inches) |

**Cluster support:** None.

**`mindist` vs `nodesep`/`sep`:** `mindist` is the only spacing attribute circo respects. `nodesep` has no effect.

---

## Algorithm–attribute support matrix

| Attribute | dot | neato | fdp | sfdp | twopi | circo |
|-----------|:---:|:-----:|:---:|:----:|:-----:|:-----:|
| `rankdir` | ✓ | — | — | — | — | — |
| `ranksep` | ✓ | — | — | — | ✓ (radial) | — |
| `nodesep` | ✓ | — | — | — | — | — |
| `sep` | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `esep` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `mindist` | — | — | — | — | — | ✓ |
| `compound` | ✓ | — | — | — | — | — |
| `clusterrank` | ✓ | — | — | — | — | — |
| `constraint` (edge) | ✓ | — | — | — | — | — |
| `rank` (subgraph) | ✓ | — | — | — | — | — |
| `minlen` (edge) | ✓ | — | — | — | — | — |
| `len` (edge) | — | ✓ | ✓ | — | — | — |
| `splines=ortho` | ✓ | — | — | — | — | — |
| `splines=compound` | — | — | ✓ | — | — | — |
| `ratio` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `size` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `pad` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Clusters (bb in JSON) | ✓ | partial | partial | — | — | — |
