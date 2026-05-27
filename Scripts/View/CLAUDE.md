# Scripts/View — subsystem references

See `Scripts/View/ARCHITECTURE.md` — full subsystem architecture, design decisions, and implementation notes.
See `ai/jarchi-scripting/SKILL.md` — SWT/GTK platform rules, jArchi scripting patterns.
See `coding-standards.md` — naming and module conventions.
See `Scripts/View/PROMPT.md` — data structures, ELK/Dagre path, parameter reference.

Preset files: `user_parameter/*.json` — plain JSON, no module.exports.

## Content moved

The following sections have been consolidated into their canonical locations:

| Section | Now in |
|---|---|
| Pipeline model | ARCHITECTURE.md §A.5 |
| Hard rules | ARCHITECTURE.md §A.11 |
| UI section → pipeline stage mapping | ARCHITECTURE.md §A.5 |
| One-line system definition | ARCHITECTURE.md §A.1 |
| GUI display vocabulary | ARCHITECTURE.md §A.2.1 |
| SWT / GTK platform rules | `ai/jarchi-scripting/SKILL.md` §SWT / GTK Platform Rules |
| layoutDialog architecture | ARCHITECTURE.md §B.7 (layoutDialog state contract) |
| Relation filter direction encoding | ARCHITECTURE.md §A.4.2 (Encoded relation type strings) |
| `_relTypeRows` data structure | ARCHITECTURE.md §B.7 (Relation filter widget shapes) |
| Checkbox grids | ARCHITECTURE.md §B.7 (Checkbox grids) |
| elkSortLeavesOnly / chkSortContainers | ARCHITECTURE.md §B.8 (Sort containers parameter) |
| elkSameTypeResize / chkSameTypeResize | ARCHITECTURE.md §B.8 (Align same type parameter) |
| Known GTK behaviours | `ai/jarchi-scripting/SKILL.md` §SWT / GTK Platform Rules |
