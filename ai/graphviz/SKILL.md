---
name: graphviz
description: Use when working with Graphviz layout (DOT language, layout engines, attributes, JSON output format), configuring graph/node/edge attributes, selecting layout algorithms, or parsing -Tjson output. Tool-agnostic — applies to any language or environment invoking the graphviz CLI.
---

# Graphviz

Graphviz computes positions and routes edges for graphs defined in the **DOT language**. It is a CLI tool (`dot`, `neato`, etc.), not a library. Layout is separate from rendering.

| Doc | Scope |
|-----|-------|
| `docs/dot-language.md` | DOT syntax, graph/digraph/strict, nodes, edges, subgraphs, cluster convention, attribute scoping, port/compass syntax, HTML labels, sample |
| `docs/algorithms.md` | All 6 engines (dot, neato, fdp, sfdp, twopi, circo) — purpose, unique attributes, limitations, engine-specific caveats |
| `docs/attributes.md` | Key attributes with engine-support matrix: rankdir, splines, ranksep, nodesep, sep, esep, mindist, pad, size, ratio, compound, fixedsize, weight, constraint, lp |
| `docs/json-output.md` | `-Tjson` output schema: objects array (nodes + clusters), edges array, pos/bb/lp field formats, spline notation, coordinate system (points, bottom-left origin, Y-flip) |
