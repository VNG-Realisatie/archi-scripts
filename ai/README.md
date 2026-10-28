# AI instruction layer — archi-scripts

## Layer structure
See global model: `~/ai/README.md`

## Project-level layers

| Layer | Location | Purpose |
|---|---|---|
| Project shared | Project root (`*.md`) | System design and coding standards for this project |
| Tool adapters | `.claude/`, `.cursor/`, `.github/copilot/` | Tool-specific prioritization — no content definitions |

## Project shared files

| File | Contains |
|---|---|
| `project.md` | System purpose, domain, runtime constraints |
| `architecture.md` | Scripts/ folder organization, module boundaries |
| `coding-standards.md` | Naming, modules, Java interop, logging |
| `testing.md` | Test strategy for GraalVM/jArchi environment |

## Conflict resolution
Project shared docs override global `~/ai/shared/` when they conflict.
