# CLAUDE.md — archi-scripts project rules

## Environment

- **Runtime**: jArchi plugin for Archi, running on GraalVM (not Node.js). CommonJS modules via `require()`.
- **Engine setting**: Edit > Preferences > Scripting → GraalVM.
- Never use Node.js-only APIs (no `fs`, `path`, `process`). Use `java.io.*` or `java.nio.file.*` for file I/O.
- Java interop: `Java.type(...)`, `Java.extend(...)`. Java objects are not plain JS objects.

## Fixed vocabulary — use exactly these terms

These terms are stable across UI, layout engine, and rendering logic. Do not substitute synonyms.

| Canonical term | Do NOT use |
|---|---|
| **Element** | node, box, item |
| **Relation** | edge, link, connection |
| **Nesting** | grouping, hierarchy config |
| **Container** | group, box, region |
| **Layout** | structure engine, positioning |
| **Elements & relations** | nodes & edges |
| **Nesting rules** | grouping rules, hierarchy rules |

## Pipeline model (relations → diagram)

```
Relations → Nesting → Containers → Layout → Diagram
```

1. Relations are assigned a **role**: nesting / grouping / visual-only
2. Nesting rules produce **structure** (parent-child groupings)
3. Containers **represent** structure visually — no semantic meaning beyond that
4. Layout **positions** containers first, then elements inside them, then unnested elements in root space
5. Filtering affects **visibility only** — it does not alter nesting structure

## Hard rules

- Users never define containers directly — containers are always derived from nesting.
- A relation assigned to nesting takes priority over grouping, which takes priority over visual-only.
- Same inputs must always produce the same nesting, containers, and layout result (determinism).
- An element may appear in multiple containers via **visual instances** (shared nesting). Each instance belongs to exactly one container.

## UI section → pipeline stage mapping

| UI section | Pipeline stage |
|---|---|
| Element filter | visibility (elements) |
| Relationship filter | visibility + nesting rule selection |
| Nesting group | nesting rules (which relation types create containers) |
| Layout style | positioning algorithm |
| Spacing & size | layout parameters |

## One-line system definition

> Relations define nesting, nesting generates containers, containers are positioned by layout, and elements are rendered inside them.
