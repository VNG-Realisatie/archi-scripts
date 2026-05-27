# AI rules — archi-scripts

## Layer model

Rules apply in layers, narrowest wins on conflict:

| Layer | Location | Scope |
|---|---|---|
| Global | `~/ai/shared/` + tool global rules | All projects on this machine |
| Repo | `ai/rules.md` (this file) | All scripts in this repo |
| Skill | `ai/jarchi-scripting/SKILL.md` | jArchi scripting patterns and platform rules |
| Subsystem | `Scripts/<subfolder>/CLAUDE.md` | Rules for one subfolder only |

Tool-specific files (`.claude/rules.md`, `.cursor/rules.md`, `.github/copilot/instructions.md`) are reference-only adapters — they point here and carry no rules of their own.

## Rule priority

1. `ai/jarchi-scripting/SKILL.md` — jArchi patterns, coding standards, SWT/GTK rules (highest repo authority)
2. `Scripts/<subfolder>/CLAUDE.md` — subsystem-specific rules when editing that subfolder
3. Global tool defaults (lowest priority)

## Source references

| What you need | File |
|---|---|
| Repo patterns, coding standards, vocabulary, folder structure, testing | `ai/jarchi-scripting/jarchi-script-development.md` |
| Complete jArchi API (v0.1–1.12) | `ai/jarchi-scripting/jarchi-api-reference.md` |
| GraalJS / ECMAScript 2024 runtime | `ai/jarchi-scripting/graaljs-compatibility.md` |
| Java interop (`Java.type`, `Java.extend`) | `ai/jarchi-scripting/java-interop.md` |
| View subsystem — full architecture | `Scripts/View/ARCHITECTURE.md` |
| View subsystem — entry/references | `Scripts/View/CLAUDE.md` |
