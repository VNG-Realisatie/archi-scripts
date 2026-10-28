# AI rules — archi-scripts

## Layer model

Rules apply in layers, narrowest wins on conflict:

| Layer | Location | Scope |
|---|---|---|
| Global | `~/ai/shared/` + tool global rules | All projects on this machine |
| Repo | `ai/rules.md` (this file) | All scripts in this repo |
| Skill | `ai/jarchi-scripting/SKILL.md` | jArchi scripting patterns and platform rules |
| Skill | `ai/elkjs/SKILL.md` | ELK graph layout options, algorithms, JSON format |
| Subsystem | `Scripts/<subfolder>/CLAUDE.md` | Rules for one subfolder only |

Tool-specific files (`.claude/rules.md`, `.cursor/rules.md`, `.github/copilot/instructions.md`) are reference-only adapters — they point here and carry no rules of their own.

## Folder structure

All AI context lives under `ai/` (tool-independent). Tool-specific adapters point here; they carry no rules.

```
~/ai/shared/                    ← global rules (all projects on this machine)
archi-scripts/
├── ai/
│   ├── rules.md                ← repo hard rules + layer model  ◄ you are here
│   ├── jarchi-scripting/
│   │   ├── SKILL.md            ← jArchi / SWT / GTK platform rules
│   │   └── ...                 ← API reference, coding standards
│   ├── elkjs/SKILL.md          ← ELK layout rules
│   ├── dagre/SKILL.md
│   └── graphviz/SKILL.md
├── Scripts/
│   └── View/
│       ├── CLAUDE.md           ← subsystem entry point (all tools)
│       └── ARCHITECTURE.md    ← full subsystem design + rationale
├── CLAUDE.md                   ← Claude Code auto-load → ai/rules.md
├── .cursorrules                ← Cursor auto-load → .cursor/rules.md
├── .cursor/rules.md            ← Cursor inline mirror of hard rules
└── .github/
    └── copilot/
        └── instructions.md     ← Copilot auto-load, inline mirror
```

When adding a new rule or skill:
- Repo-wide rule → `ai/rules.md` Hard rules section
- New technology/library → `ai/<skill>/SKILL.md` (new folder)
- Subsystem rule → `Scripts/<subfolder>/CLAUDE.md`
- Never add rules to tool adapter files (`.claude/`, `.cursor/`, `.github/`)

## Rule priority

1. `ai/jarchi-scripting/SKILL.md` — jArchi patterns, coding standards, SWT/GTK rules (highest repo authority)
2. `ai/elkjs/SKILL.md` — ELK layout rules when working on graph layout code
3. `Scripts/<subfolder>/CLAUDE.md` — subsystem-specific rules when editing that subfolder
4. Global tool defaults (lowest priority)

## Source references

| What you need | File |
|---|---|
| Repo patterns, coding standards, vocabulary, folder structure, testing | `ai/jarchi-scripting/jarchi-script-development.md` |
| Complete jArchi API (v0.1–1.12) | `ai/jarchi-scripting/jarchi-api-reference.md` |
| GraalJS / ECMAScript 2024 runtime | `ai/jarchi-scripting/graaljs-compatibility.md` |
| Java interop (`Java.type`, `Java.extend`) | `ai/jarchi-scripting/java-interop.md` |
| ELK layout skill index (algorithms, docs map) | `ai/elkjs/SKILL.md` |
| ELK Layered algorithm options | `ai/elkjs/docs/elk-layered.md` |
| ELK layout options (spacing, routing, ports) | `ai/elkjs/docs/layout-options-core.md` |
| ELK JSON graph format | `ai/elkjs/docs/json-format.md` |
| View subsystem — full architecture | `Scripts/View/ARCHITECTURE.md` |
| View subsystem — entry/references | `Scripts/View/CLAUDE.md` |

## Hard rules

These rules have no exceptions. Violating them corrupts diagrams or breaks the pipeline.

1. **No post-layout scaling.** `LayoutResult` node `width` and `height` must equal the values from `LayoutGraph` input. Never multiply sizes by any post-layout factor. Engine attributes that trigger output scaling (e.g. Graphviz `size=`) are forbidden.
2. **Position spread is the only permitted post-layout adjustment.** Moving node *centers* outward (sizes frozen) to meet a `maxWidth`/`maxHeight` target is allowed. Compressing positions (making the bounding box smaller) is forbidden.
3. **Adapters never read or write a view.** Adapters operate only on `LayoutGraph` / `LayoutResult`. No Archi API calls inside an adapter.
4. **No view mutation in the pipeline.** The pipeline reads elements and relations; it never edits a view's existing content except through the writer at the final step.
5. **Container-ness is derived, never declared.** A node is a container if and only if `parentMap` names it as a parent. No flag, type check, or pre-declared property.
6. **ArchiMate relations are never modified.** Edge reversal for layout is a traversal concern only; the model relation's source/target is never changed.
7. **One write function; no per-action branches.** NEW_VIEW, ONE_EACH, EXPAND_VIEW, and LAYOUT_ONLY all use the same writer path. Branching on action type inside the writer is forbidden.
8. **Determinism.** Same inputs → same view, always. Do not rely on hash-iteration order for layout decisions.
9. **`validatePreset` strips unknown keys.** Any new `params` key must be added to `DEFAULT_PRESET.params` in `defs.js` or it is silently dropped on preset load.
10. **Follow the AI rules structure when adding rules or skills.** See "Folder structure" above. Repo-wide rule → `ai/rules.md`. New skill → `ai/<skill>/SKILL.md`. Subsystem rule → `Scripts/<subfolder>/CLAUDE.md`. Tool adapter files carry no rules. Narrowest scope wins: global → repo → skill → subsystem.
11. **One canonical vocabulary.** A concept has one name across users, documentation, logs, variable names, function names, and data structures. No translation layer. Exceptions are allowed only when (a) the canonical term is technically inaccurate in the algorithm, (b) it would make code confusing or excessively verbose, or (c) the underlying data structure is a standard technical concept (e.g. `parentMap`, `childIds`). When an exception is taken, document it once in the relevant subsystem's vocabulary section and revert to the canonical term at every user-facing surface. Subsystem vocabulary sections (e.g. `Scripts/View/ARCHITECTURE.md` § Vocabulary) are the authority for that subsystem's terms.
12. **No backwards-compat fallback for renames.** When a name changes (preset key, function, variable, log string, on-screen label), update every site in the same commit. Do not keep dual-readers, alias exports, or "load old + write new" shims. Rename integrally so the codebase has exactly one name for the concept at all times. Exception: an external contract beyond the repo's control (a third-party API the user can't migrate). Within-repo data files (presets, sessions, user JSONs) are NOT external contracts — rewrite them in the same commit. Operational form of rule #11.
