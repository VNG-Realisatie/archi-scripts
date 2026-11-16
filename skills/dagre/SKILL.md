---
name: dagre
description: Use when working with dagre or dagre-cluster-fix for directed graph layout, building graphlib graphs, configuring dagre layout options, or troubleshooting dagre layout in a JavaScript/CommonJS codebase.
---

# dagre

JavaScript directed-graph layout library — computes ranked (layered) positions for nodes and edges. Not a renderer.

| Doc | Scope |
|-----|-------|
| `dagre-reference.md` | Both packages, graphlib Graph API (layout-relevant subset), all graph/node/edge options with defaults, output format, dagre-cluster-fix divergences, known limitations |

## In jArchi (GraalJS)

This repo vendors `dagre-cluster-fix` (compound graphs): `require(REPO_ROOT + "node_modules/dagre-cluster-fix/index.js")`.

1. **Self-loops** — `dagre-cluster-fix` can throw on self-loop edges (`"k.toLowerCase is not a function"`). Lay out with them, and on an error rebuild the graph without them and run again (`Scripts/View/lib/engines/dagre.js`).
2. **Centre coordinates** — node `x`/`y` are the centre; subtract half the width/height for Archi's top-left bounds.
3. **Boundary points** — the first and last of an edge's `points` lie on the node borders; Archi does not need them as bendpoints (`points.slice(1, -1)`).
4. **Parents after nodes** — `g.setParent(child, parent)` only after both nodes exist; earlier calls are ignored silently.
5. **Parallel edges** — ArchiMate allows several relations between one pair: build the graph with `multigraph: true` and name each edge (`g.setEdge({ v, w, name: edgeId }, label)`).
