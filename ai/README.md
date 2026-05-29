# AI instruction layer — archi-scripts

## Layer structure
See global model: `~/ai/README.md`

## Project-level layers

| Layer | Location | Purpose |
|---|---|---|
| Rules | `ai/rules.md` | Tool-independent rule chain and source references |
| Skills | `ai/` subfolders (e.g. `ai/jarchi-scripting/`) | Canonical, tool-independent skill definitions, API reference, repo patterns, coding standards, vocabulary, testing guide |
| Tool adapters | `.claude/`, `.cursor/`, `.github/copilot/` | Thin adapters pointing to `ai/rules.md` and `ai/` skills |

## Skills

Skills are canonical, tool-independent definitions with integrated reference documentation. Tools discover skills via adapters in `.claude/skills/` and `.cursor/skills/` that point to the canonical definition in `ai/`.

| Skill | Canonical location | Purpose |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/SKILL.md` | JArchi script development: complete API, repo patterns, GraalVM/Java interop |
| `elkjs` | `ai/elkjs/SKILL.md` | ELK graph layout: layout algorithms, JSON graph format, layout options |
| `dagre` | `ai/dagre/SKILL.md` | Dagre/dagre-cluster-fix graph layout: graphlib API, layout options, output format, known limitations |

## Shared Reference Libraries

Comprehensive documentation referenced by skills and shared across AI tools.

| Library | Location | Contains |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/` | Complete jArchi API (v0.1–1.12), repo development patterns, GraalJS compatibility, Java interop |
| `elkjs` | `ai/elkjs/` | ELK layout algorithms, JSON graph format, layout options (layered, spacing, routing, ports) |
| `dagre` | `ai/dagre/` | dagre & dagre-cluster-fix API, graphlib Graph API, layout options, output format, known limitations |

## Conflict resolution
Project shared docs override global `~/ai/shared/` when they conflict.
