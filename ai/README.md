# AI instruction layer — archi-scripts

## Layer structure
See global model: `~/ai/README.md`

## Project-level layers

| Layer | Location | Purpose |
|---|---|---|
| Project shared | Project root (`*.md`) | System design and coding standards for this project |
| Skills | `ai/` subfolders (e.g. `ai/jarchi-scripting/`) | Canonical, tool-independent skill definitions and reference docs |
| Tool adapters | `.claude/skills/`, `.cursor/skills/` | Discovery stubs that point to `ai/` skill definitions |

## Project shared files

| File | Contains |
|---|---|
| `project.md` | System purpose, domain, runtime constraints |
| `architecture.md` | Scripts/ folder organization, module boundaries |
| `coding-standards.md` | Naming, modules, Java interop, logging |
| `testing.md` | Test strategy for GraalVM/jArchi environment |

## Skills

Skills are canonical, tool-independent definitions with integrated reference documentation. Tools discover skills via adapters in `.claude/skills/` and `.cursor/skills/` that point to the canonical definition in `ai/`.

| Skill | Canonical location | Purpose |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/SKILL.md` | JArchi script development: complete API, repo patterns, GraalVM/Java interop |

## Shared Reference Libraries

Comprehensive documentation referenced by skills and shared across AI tools.

| Library | Location | Contains |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/` | Complete jArchi API (v0.1–1.12), repo development patterns, GraalJS compatibility, Java interop |

## Conflict resolution
Project shared docs override global `~/ai/shared/` when they conflict.
