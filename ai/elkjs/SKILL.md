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
