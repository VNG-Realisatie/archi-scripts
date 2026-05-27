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

## Shared Reference Libraries

Comprehensive documentation referenced by skills and shared across AI tools.

| Library | Location | Contains |
|---|---|---|
| `jarchi-scripting` | `ai/jarchi-scripting/` | Complete jArchi API (v0.1–1.12), repo development patterns, GraalJS compatibility, Java interop |

## Conflict resolution
Project shared docs override global `~/ai/shared/` when they conflict.
