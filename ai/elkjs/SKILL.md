---
name: elkjs
description: Use when working with elkjs for automatic graph layout, configuring ELK layout algorithms, building the ELK JSON graph format, or troubleshooting elkjs layout issues in a JavaScript/TypeScript codebase.
---

# elkjs

JavaScript port of the Eclipse Layout Kernel (ELK) — computes positions and dimensions for graph elements (not a renderer).

| Doc | Scope |
|-----|-------|
| `docs/getting-started.md` | npm install, ELK constructor, layout() API, Web Workers, TypeScript imports, logging/debugging |
| `docs/json-format.md` | Node/port/label/edge structure, extended edges, edge sections, coordinate system, ELK text format |
| `docs/algorithm-selection.md` | All algorithms with IDs, descriptions, supported features, and when to use each |
| `docs/layout-options-core.md` | Shared layout options: spacing, direction, edge routing, ports, node sizing, hierarchy |
| `docs/elk-layered.md` | ELK Layered deep dive: options organized by phase (cycle breaking, layering, crossing minimization, etc.) |
| `docs/troubleshooting.md` | GWT transpilation issues, label sizing, coordinate interpretation, Web Worker setup, FAQs |

## Cross-hierarchy edges in INCLUDE_CHILDREN mode

When `elk.hierarchyHandling` is `INCLUDE_CHILDREN`, the root algorithm sees all nodes including nested ones. Cross-hierarchy edges (source inside a container, target at root level or in a different container) use the **actual nested element IDs** — not the container IDs — and are best placed in the `edges` of their lowest common ancestor container (`root` when they share none): output edge coordinates are relative to that LCA (`elk.json.edgeCoords: CONTAINER`). ELK then routes the full path including the inside-container segment.

**Common mistake**: replacing the nested source/target ID with the topmost container ID before calling `layout()`. This causes ELK to route from the container boundary only, producing a diagonal first segment in Archi because the Archi connection still references the nested element as its endpoint.

**Multi-section output**: for cross-hierarchy edges in INCLUDE_CHILDREN mode, ELK may return multiple `sections` on the result edge — one per hierarchy level crossing. Always iterate all `edge.sections` and concatenate their `bendPoints`; reading only `sections[0]` drops the inside-container routing.

**SEPARATE_CHILDREN mode** (the other hierarchy mode): each container is laid out on its own, so a cross-hierarchy edge cannot reference a nested node directly. With `layered` on both levels, split it into segments joined by a **hierarchical port** on each crossed container (`{ id }` in the container's `ports`; inner edge port↔element in the container's `edges`, outer edge node↔port one level up). The inner layout positions the port and reserves space on the element; the outer layout keeps that port position. Join the segment sections to get the full path. Without ports, the fallback is to lift the endpoint to the container — ELK then routes to the opaque container boundary only.
