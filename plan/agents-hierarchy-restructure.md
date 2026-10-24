# Restructure instructions: AGENTS.md hierarchy, harness-neutral

## Context

The rule structure looks layered but barely works in practice. What I verified (Claude Code, Copilot, Cursor and OpenCode docs, 2026-10-24):

- **Hard rules are not in the default context.** `CLAUDE.md` only says "See `ai/rules.md`". Claude Code does not follow links, only `@imports`. So hard rules 1–15 load only if the model happens to open them.
- **Dead adapters:**
  - `.claude/rules.md` and `.claude/settings.md`: Claude only reads `.claude/rules/*.md`.
  - `.cursor/rules.md`: Cursor only reads `.cursor/rules/*.mdc` and `AGENTS.md`.
  - `.github/copilot/instructions.md`: Copilot reads `.github/copilot-instructions.md`.
  - `.cursorrules`: gitignored and undocumented.
  - Global: `~/.claude/rules.md`, `~/.claude/settings.md`, `~/.cursor/rules.md`.
  - None of these files is loaded, so `~/ai/shared/coding-standards.md` never arrives anywhere.
- **Project rules live in Claude-only memory** (11 of 13 memory files). That is harness-specific, partly duplicated (no-scaling = rule 1, no-co-author = rule 13), and partly conflicting: "docs after approval" against "SPEC first, same commit" in ARCHITECTURE/View CLAUDE.md.
- **Wrong level:**
  - Hard rules 1–9 are View-specific (LayoutGraph, writer, `validatePreset`) but sit at repo level.
  - The View test approach sits in repo `ai/`.
  - SPEC §14 and its Appendix "Rule scopes" restate the rule hierarchy.
- **Small conflict:** rule 1 says "node width/height = input"; SPEC rule 1 says "leaf sizes, containers by the engine". SPEC wins.

User decisions:

1. Approval first: solution → code + verify → after approval docs → docs and code in one commit.
2. Global layer is in scope too, harness-neutral (also OpenCode). Coding standards load only for coding work. Writing projects get no coding standards.

## Principle

**`AGENTS.md` is the canonical, harness-neutral entry point at every level. A routing table in it is the baseline for every harness. Adapters add native auto-loading on top, but carry no rules.**

Verified per harness:

| Harness | Root `AGENTS.md` | Nested `AGENTS.md` | `@import` | Path-scoped | Skills |
|---|---|---|---|---|---|
| Claude Code ≥ 2.1.277 | yes, when there is no `CLAUDE.md` | yes, on Read in that folder | yes | `~/.claude/rules` `paths:` | `.claude/skills` |
| OpenCode | yes (wins over CLAUDE.md) | not documented → routing line | no | no | `.claude/skills`, `~/.claude/skills` |
| Cursor | yes | yes | – | `.mdc` globs | – |
| Copilot | coding agent: yes; review: `.github/copilot-instructions.md` | coding agent: nearest wins | – | `.github/instructions` | – |

Hierarchy: **generic** (`~/ai/shared/`) → **project** (`AGENTS.md`, `ai/`) → **part** (`Scripts/View/AGENTS.md`). The narrowest level wins. Plan files and memory are not rules.

## Target structure

```
~/ai/shared/AGENTS.md            NEW  generic: working agreements + "coding → read coding-standards.md"
~/ai/shared/coding-standards.md        unchanged (canonical)
~/ai/README.md                         layer model brought in line with reality
~/.claude/CLAUDE.md              NEW  adapter: @~/ai/shared/AGENTS.md
~/.claude/rules/coding-standards.md NEW adapter: paths: code globs + @~/ai/shared/coding-standards.md
~/.config/opencode/AGENTS.md     NEW  symlink → ~/ai/shared/AGENTS.md (OpenCode does not expand @)

AGENTS.md                        NEW  project: hierarchy, routing, repo hard rules, conventions
(CLAUDE.md)                           removed: Claude Code ≥ 2.1.277 reads AGENTS.md natively
.github/copilot-instructions.md  NEW  adapter: pointer to AGENTS.md (replaces .github/copilot/instructions.md)
.claude/skills/*/SKILL.md             adapter stubs (also read by OpenCode)
ai/repo-guide.md, ai/dialog-style.md  unchanged content, references updated
ai/jarchi-scripting/SKILL.md          + 3 pitfalls from memory
ai/{elkjs,dagre,graphviz}/            unchanged
ai/view-testing/SKILL.md         NEW  skill (from ai/view-testing.md Inputs/Steps + memory reference_view_testing)
.claude/skills/view-testing/SKILL.md NEW stub, same pattern as the other four
Scripts/View/AGENTS.md           NEW  part: View hard rules, doc workflow, spec style, reading SPEC/ARCH selectively
(Scripts/View/CLAUDE.md)              removed (same reason)
Scripts/View/docs/test-cases.md  NEW  test-case log (documentation, not loaded by default)
Scripts/View/docs/SPEC.md, ARCHITECTURE.md  stay full documentation; only process passages point to AGENTS
```

Pattern: `AGENTS.md` per level (binding rules + routing, small) · `ai/` in the project root (all skills and agent references, centrally) · `docs/` per part (human documentation: spec, architecture, logs).

### Skill, rule or reference: criterion

| Type | Loaded by | Use when | Location |
|---|---|---|---|
| **Rule** (`AGENTS.md`) | Location: always (root) or on working in that folder (nested) | Binding for everything in that scope | Level where it applies |
| **Skill** (`ai/<name>/SKILL.md`) | Task: the model picks it from name and description, or the user calls it (`/name`) | Knowledge or a procedure that a *type of task* needs, regardless of which file is open | Centrally in `ai/`, scope in name and description |
| **Reference** (`ai/*.md`, `types/README.md`) | Routing line in `AGENTS.md` or a skill | Background for a subtask that the routing names | Next to what it serves |

Central bundling of skills beats placement near the part. Discovery only works from the root (`.claude/skills/`, which OpenCode also reads), and every skill gets the same stub pattern. For harnesses without skill support (Cursor, Copilot: not verified), the skills table in the root `AGENTS.md` is the baseline: name, trigger, path.

Classification:

| Item | Becomes | Why |
|---|---|---|
| `jarchi-scripting` | Skill (stays) | Triggered by "writing jArchi code"; knowledge for all of Archi, valid for every script in the repo. If another jArchi repo ever comes along, it is a candidate for the generic level |
| `elkjs`, `dagre`, `graphviz` | Skill (stays) | Generic library knowledge plus a "In jArchi" section; triggered by engine work |
| **`view-testing`** | **Skill** (new) | The trigger is a *user report* ("view X looks wrong"), not an opened file. The nested `Scripts/View/AGENTS.md` loads only after a View file is read, so a routing line there comes too late. As a skill its description is always visible (~60 tokens), and the procedure (~2k) loads only when needed. Its scope is View: the name and description say so |
| `ai/repo-guide.md` | Reference | Structure and conventions for new scripts, modules and tests; routed from `AGENTS.md` |
| `ai/dialog-style.md` | Reference | Repo style for every SWT dialog; routed from `AGENTS.md` ("dialog code → read") and from the jarchi skill (`swt-gtk.md`) |
| `types/README.md` | Reference | Typecheck rules; routed from repo hard rule *Typecheck* |
| Test-case log | Documentation | History of findings, not an instruction → `Scripts/View/docs/test-cases.md`; the skill points to it |

### No project `CLAUDE.md`: Claude Code reads `AGENTS.md` natively

Claude Code ≥ 2.1.277 reads `AGENTS.md` itself when there is *no* `CLAUDE.md`/`CLAUDE.local.md` in the working directory or above it: at start every `AGENTS.md` from the working directory upwards; a subdirectory's `AGENTS.md` once Claude opens a file there with the Read tool. `@imports` inside it are expanded. So a project adapter is unnecessary. Both `CLAUDE.md` files (root and `Scripts/View/`) are **removed**; one remaining `CLAUDE.md` would switch native reading off again.

- **Precondition:** the terminal CLI is **2.1.186** (`~/.local/bin/claude`), too old. VS Code runs 2.1.309, which is fine. Step 0: `claude update` (by you, or by me with your OK). Older versions or a Bedrock session read only `CLAUDE.md`; the first session after the upgrade may still miss `AGENTS.md`.
- **Difference from nested `CLAUDE.md`:** a nested `AGENTS.md` loads on the *Read* tool, not on Edit or `cat`. In practice a file is always read before it is edited, so this is acceptable. The routing line in the root `AGENTS.md` ("working in `Scripts/View/` → read `Scripts/View/AGENTS.md`") is the fallback, as with OpenCode.
- **Globally** a Claude adapter is still needed: there is no native global `AGENTS.md` for Claude. `~/.claude/CLAUDE.md` (with `@~/ai/shared/AGENTS.md`) does not count for the "no CLAUDE.md" check, so it loads alongside it.
- **The difference from now:** "See `ai/rules.md`" is a link the model *may* follow; a natively read `AGENTS.md` loads *always*.

### What happens to SPEC.md and ARCHITECTURE.md

Both stay full documentation: SPEC = reconstruction description including the GUI (Appendix Dialog reference), ARCHITECTURE = decisions + realisation. They are not loaded by default. `Scripts/View/AGENTS.md` says how to read them selectively. Content stays unchanged except for these process passages, which describe how agents work and not what the system is:

| Passage | Now | Becomes |
|---|---|---|
| SPEC §14 bullet "Rule layering" | Restates the hierarchy global→repo→skill→subsystem | One sentence: "Rule hierarchy: `AGENTS.md`." |
| SPEC Appendix "Rule scopes" (table + "plan files are not rules") | Second copy of the hierarchy, deviating from `ai/rules.md` | Moves to root `AGENTS.md` §Hierarchy; the heading in SPEC keeps one pointer line |
| ARCHITECTURE §Content division, "Order of change" | SPEC first → code, same commit (conflicts with approval rule) | Approval workflow per decision 1; the rule itself is canonical in `Scripts/View/AGENTS.md` §Docs, ARCHITECTURE describes it as documentation |
| ARCHITECTURE B.6 link (line 278) | `ai/view-testing.md` | `ai/view-testing/SKILL.md` and `docs/test-cases.md` |

SPEC §11 *Rules & invariants* stays complete in SPEC (needed for reconstruction). The agent version in `Scripts/View/AGENTS.md` refers to it per rule ("SPEC rule n"). On a content conflict, SPEC wins. That overlap is deliberate.

Deleted after migration:

- `ai/rules.md`, `ai/README.md`, `ai/view-testing.md`
- `.claude/rules.md`, `.claude/settings.md`
- `.cursor/rules.md`, `.cursorrules` (local)
- `.github/copilot/instructions.md`
- `~/.claude/rules.md`, `~/.claude/settings.md`, `~/.cursor/rules.md`
- 11 memory files

`MEMORY.md` keeps one line: "Rules live in AGENTS.md / ~/ai/shared; memory holds only transient learnings".

## Contents of the new files

**Root `AGENTS.md`** (~1.7k tokens, always loaded):

1. **Hierarchy and precedence.** Scope table, merging `ai/rules.md` §Layers, `ai/README.md` and SPEC Appendix "Rule scopes". Add: "plan files are not rules"; the generic layer is `~/ai/shared/` (local only, project wins); "no new instruction files without request" (from `.claude/settings.md`); where a new rule goes.
2. **Routing.** The old "Source references" table, plus "working in `Scripts/View/` → read `Scripts/View/AGENTS.md` first" and the skills table.
3. **Repo hard rules.** Old rules 10–15, numbered anew, plus research-before-coding from memory: "load skill or grep existing scripts before writing jArchi/engine code; never guess property names".
4. **Conventions.** Unchanged.

**`Scripts/View/AGENTS.md`** (~1.4k tokens, loads when working in View):

1. **View hard rules.** Old 1–9, each with a reference "(SPEC rule n)". Rule 1 gets SPEC's leaf wording. The relation-direction note from memory goes with the relation rule: "no direction flags on layout edges; Archi draws from the model".
2. **Docs.** Content division as a short pointer (canonical: ARCHITECTURE §Content division). The approval workflow (decision 1). Spec writing style from memory: implementation-free, ER model, grouping, appendix, body ≤ 550 lines, check leakage with grep. Presets are plain JSON.
3. **Reading SPEC/ARCH selectively.** `grep -n '^#'`, then grep a keyword, then offset/limit; the Appendix Dialog reference only for dialog work.
4. **Testing.** Pointer to the `view-testing` skill and the log in `docs/test-cases.md`.

**`~/ai/shared/AGENTS.md`** (~250 tokens) contains:

- From `~/.claude/rules.md` and `settings.md`: concise; no closing summary; prefer editing over creating; rule capture "global or project?".
- From `~/.cursor/rules.md`: no unsolicited refactoring or extra features.
- From memory: plan file names; fetch docs without asking.
- The line "Coding task: read `~/ai/shared/coding-standards.md` before writing code". This is the baseline for OpenCode and Cursor. Claude Code also gets the path rule.

## Traceability matrix (old → new)

| Old | New |
|---|---|
| `CLAUDE.md` (3 See-lines) | `AGENTS.md` §Routing; `CLAUDE.md` removed |
| `ai/rules.md` §Layers + "where a new rule goes" | `AGENTS.md` §Hierarchy |
| `ai/rules.md` §Source references | `AGENTS.md` §Routing |
| `ai/rules.md` hard rules 1–9 | `Scripts/View/AGENTS.md` §Hard rules |
| `ai/rules.md` hard rules 10–15 | `AGENTS.md` §Hard rules |
| `ai/rules.md` §Conventions | `AGENTS.md` §Conventions |
| `ai/README.md` layer and skills tables | `AGENTS.md` §Hierarchy/§Routing; global part → `~/ai/README.md` |
| `.claude/rules.md`, `.cursor/rules.md`, `.cursorrules`, `.github/copilot/instructions.md` | Pointers only, no content → `.github/copilot-instructions.md`, `AGENTS.md` (native) |
| `.claude/settings.md` "check subfolder CLAUDE.md" | Native nested loading + routing line |
| `.claude/settings.md` "no new CLAUDE.md without request" | `AGENTS.md` §Hierarchy |
| `Scripts/View/CLAUDE.md` SPEC/ARCH/skill/test references, presets JSON | `Scripts/View/AGENTS.md` |
| `ai/view-testing.md` Inputs/Steps | `ai/view-testing/SKILL.md` |
| `ai/view-testing.md` Test cases | `Scripts/View/docs/test-cases.md` |
| SPEC §14 "Rule layering", Appendix "Rule scopes" | `AGENTS.md` §Hierarchy; SPEC keeps a one-line pointer |
| ARCHITECTURE "Order of change" | Brought in line with the approval workflow; canonical in `Scripts/View/AGENTS.md` §Docs |
| memory `no_scaling`, `no_coauthor` | Already View rule 1 / repo rule; `Graphviz size=` stays in rule 1 |
| memory `archi_relation_direction` | jarchi SKILL pitfall + View relation rule |
| memory `jarchi_selector_filtering` | jarchi SKILL pitfall |
| memory `research_before_coding` | `AGENTS.md` hard rule |
| memory `docs_after_approval` | `Scripts/View/AGENTS.md` §Docs (decision 1) |
| memory `spec_writing_style` | `Scripts/View/AGENTS.md` §Docs |
| memory `reference_jarchi_api` (non-existent APIs) | jarchi SKILL pitfall "APIs that do not exist" |
| memory `reference_jarchi_wiki` | jarchi SKILL "Where to look" (already there) + "consult before claims about Archi behaviour" |
| memory `reference_view_testing` | `ai/view-testing/SKILL.md` (XML reading, ELK-in-Node, Archi paths, test models) |
| memory `project_view_nesting_plan` | Completed; doc layout is in ARCHITECTURE §Content division → removed |
| memory `plan_filenames`, `webfetch_docs` | `~/ai/shared/AGENTS.md` |
| `~/.claude/rules.md`, `~/.claude/settings.md`, `~/.cursor/rules.md` | `~/ai/shared/AGENTS.md` |

## Steps

0. `claude update` for the terminal CLI (2.1.186 → ≥ 2.1.281), after your OK.
1. Create the global files and adapters. Check that `~/.config/opencode` exists.
2. Write root `AGENTS.md` and `Scripts/View/AGENTS.md`, migrating content literally where possible.
3. Write `ai/view-testing/SKILL.md`, its stub and `Scripts/View/docs/test-cases.md`. Add the jarchi SKILL pitfalls.
4. Turn the adapters into pointers. Delete the dead files.
5. Update references:
   - In `.md` files: every `ai/rules.md` and `ai/view-testing.md` (`repo-guide.md`, `dialog-style.md`, ARCHITECTURE line 260/278, SPEC §14/Appendix).
   - Code comments `ai/rules.md #11`, 5×: [selection_pipeline.js](Scripts/View/lib/selection_pipeline.js) l.75, 156, 272, 1177 and [dialog_main.js](Scripts/View/lib/gui/dialog_main.js) l.947. These become "AGENTS.md rule *One canonical vocabulary*". l.75 refers to the selector pitfall and is wrong today.
   - This follows repo rule 12: rename integrally.
6. Clean up memory and `MEMORY.md`.
7. Do not commit: you review first (decision 1). On commit: no co-author line (repo hard rule).

## Verification

- **Completeness:** a script extracts every numbered/bulleted rule from the old files and memory (before deletion, from `git show HEAD:` and a copy of memory in scratchpad) and greps a key phrase from each in the new files. Each missing hit is reported or fixed.
- **Links:** a script resolves every relative Markdown link and backticked repo path in `AGENTS.md`, `Scripts/View/AGENTS.md`, `ai/**` and `Scripts/View/docs/*`. Plus `grep -rn 'ai/rules.md\|ai/view-testing.md\|ai/README.md'` = 0 outside git history.
- **Code:**
  - `node tools/same-code.js` on both `.js` files = SAME (comment-only).
  - `npm run typecheck` exit 0.
  - `node Scripts/View/tools/rel_filter_test.js`, `nesting_test.js`.
- **Load behaviour:**
  - Claude: you check in a new session. Expect the line "no CLAUDE.md found; AGENTS.md loaded" and `/memory`. After reading a View file, `Scripts/View/AGENTS.md` must load; after reading a `.js` file, coding-standards. Check in both the VS Code extension and the terminal.
  - OpenCode and Cursor: you check by hand; I cannot run them here.
  - Size: `wc -c` per file → token table old against new.
- **Essential rules in loaded context:** every hard rule is in an always-loaded file, or in the part file that loads automatically in that part. List it explicitly in the report.

## Phase 2 (separate step afterwards): restructure SPEC and ARCHITECTURE

Advice. Not part of this execution. It gets its own plan after phase 1, because it changes `tools/gen_docs_tables.js` (code) and anchor links.

**Measured (bytes, ≈ tokens /3.8):**

| Part | Size |
|---|---|
| SPEC body §1–14 | 38 KB ≈ 10k |
| SPEC appendix, of which: | 76 KB ≈ 20k |
| · Dialog reference (incl. 3 generated tables) | 34 KB |
| · Preset schema | 6.8 KB |
| · Nesting reference | 6.7 KB |
| · Capability matrix (generated) | 3.5 KB |
| ARCHITECTURE Part A (60 decisions in one flat table) | 14.6 KB |
| ARCHITECTURE Part B (per subject) | 24 KB |

**Advice: not one document, but split by reading purpose.** The gain is mostly in selective loading: a task opens one small file instead of one 30k file. Whole files load more reliably than line ranges in every harness. Compaction itself gains maybe 10–15%.

1. **`docs/SPEC.md` = body only** (the *what*, ≤ 550 lines, ~10k). Stays the reconstruction description.
2. **Appendix → `docs/reference/` per subject**, as you suggested:
   - `gui.md`: display labels + dialog reference + the generated parameter tables. The full GUI documentation, ~10k, only for dialog work.
   - `presets.md`: schema.
   - `selection-nesting.md`: run order, counting, nesting reference, sizing refinements.
   - `engines.md`: layout graph/result, capability matrix, view size per engine, console logging.
   - `gen_docs_tables.js` then writes into `gui.md`/`engines.md`.
3. **ARCHITECTURE per subject:** regroup the Part A decisions under the same subjects as Part B (Selection, Nesting, Writer, Engines, Dialog, Appearance). Per subject you then read *decision + why + realisation* together.
4. **Remove duplication:**

   | Topic | Where it appears |
   |---|---|
   | Layers / module roles / dependency rules | SPEC §3 "Boundary rules" + "Module roles", ARCH B.1 "Dependency rules", README "Files", SPEC appendix "Current realisation / File map" |
   | Rule scopes | → `AGENTS.md` (phase 1) |
   | Content division / Marker conventions | Process → `Scripts/View/AGENTS.md`; ARCH keeps a short version |
   | Delta "Already realised" | History; git holds it |

5. **Turn steering decisions into rules.** Part A decisions that steer future changes become rules, so ARCHITECTURE keeps only the *why*. Examples:
   - "Option labels name the result, not the technique" → `Scripts/View/AGENTS.md`;
   - "an adapter sets only engine options" → already SPEC rule 18.

   Measurements in the rationale ("616–732 px on a test view") become "(test case 13)" with the details in `test-cases.md`.

**Expected per task:**

| Task | Today | After phase 2 |
|---|---|---|
| Dialog | SPEC 30k | `gui.md` ~10k + ARCH Dialog ~0.5k |
| Engine | SPEC 30k + ARCH 11k | SPEC §7–8 ~3k + `engines.md` ~2k + ARCH Engines ~3k |

Before phase 2 I read SPEC and ARCHITECTURE in full for overlap, contradictions, and drift from the code.

## Deliverables and remaining uncertainties

Deliverables: a report with the architecture description, this traceability matrix (completed with the check results), a token table, and uncertainties. Offered as a page.

Known uncertainties now:

- Whether `@import` works inside a `~/.claude/rules/` file (fallback: symlink).
- OpenCode nested `AGENTS.md` (undocumented → routing line).
- Copilot code review only sees `copilot-instructions.md` (pointer, no rules).
- Cursor global user rules are set only in Settings (manual step for you).
