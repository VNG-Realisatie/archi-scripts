# AI instruction layer — archi-scripts

## Layer structure
See global model: `~/ai/README.md`

## Project-level layers

| Layer | Location | Purpose |
|---|---|---|
| Project shared | Project root (`*.md`) | System design and coding standards for this project |
| Skills | `.claude/skills/`, `.cursor/skills/` | Domain-specific task helpers (e.g., `jarchi-scripting`) that reference shared docs |
| Tool adapters | `.claude/settings.json`, `.cursor/settings.json` | Tool-specific prioritization — no content definitions |

## Project shared files

| File | Contains |
|---|---|
| `project.md` | System purpose, domain, runtime constraints |
| `architecture.md` | Scripts/ folder organization, module boundaries |
| `coding-standards.md` | Naming, modules, Java interop, logging |
| `testing.md` | Test strategy for GraalVM/jArchi environment |

## Skills

Skills are domain-specific task helpers that reference shared documentation without duplication. Always active in their respective tool contexts.

| Skill | Location | Purpose |
|---|---|---|
| `jarchi-scripting` | `.claude/skills/jarchi-scripting/SKILL.md` | JArchi script development: references `ai/jarchi-scripting/` docs (API, repo patterns, GraalVM/Java interop) |

## Shared Reference Libraries

Comprehensive documentation referenced by skills and shared across AI tools.

| Library | Location | Contains |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/` | Complete jArchi API (v0.1–1.12), repo development patterns, GraalJS compatibility, Java interop |

## Conflict resolution
Project shared docs override global `~/ai/shared/` when they conflict.
