# archi-scripts — agent instructions

jArchi scripts for Archi (CommonJS, GraalJS). This file holds the binding repo rules and routes to everything else. It is tool-independent: every AI tool reads it directly or through a thin adapter that carries no rules.

## Hierarchy

| Level | Location | Governs |
|---|---|---|
| Generic | `~/ai/shared/` (local machine only, not in the clone) | Working agreements and coding defaults across all projects |
| Project | `AGENTS.md` (this file), `ai/` | Entry point and vocabulary rule, runtime constraints, module structure, testing policy |
| Shared library | `Scripts/_lib/` module JSDoc, `ai/repo-guide.md` § Shared modules | Contracts every script relies on: selection helpers, utilities, folder resolution |
| Part | `Scripts/<folder>/AGENTS.md` | One folder only; today `Scripts/View/AGENTS.md` |
| Skill | `ai/<skill>/SKILL.md` | One kind of task; `jarchi-scripting` is the highest repo authority on jArchi facts |

- **Precedence.** For one concern the narrowest level that addresses it wins; broader rules apply where narrower ones are silent.
- **Not rules.** Plan files (`plan/`), agent memory and other working notes never override these files.
- **Where a new rule goes.** Repo-wide → Hard rules or Conventions below; repo layout, modules, testing → `ai/repo-guide.md`; new technology → `ai/<skill>/SKILL.md` (jArchi API facts → `ai/jarchi-scripting/jarchi.d.ts`); one folder → `Scripts/<folder>/AGENTS.md`; all projects → `~/ai/shared/`.
- **Adapters.** Tool files (`.github/copilot-instructions.md`, `.claude/skills/*/SKILL.md` stubs, `.claude/settings.json`) only point here or to `ai/`; they carry no rules. Create no new instruction file (`AGENTS.md`, adapter) without an explicit request. Add no `CLAUDE.md` or `CLAUDE.local.md`: Claude Code (≥ 2.1.277) reads `AGENTS.md` natively only while none exists.

## Routing

**Working in `Scripts/View/`: read `Scripts/View/AGENTS.md` first.**

| What you need | File |
|---|---|
| Folder structure, loading modules, `_lib` modules, entry scripts, testing | `ai/repo-guide.md` |
| jArchi API (typed, from the plugin source) | `ai/jarchi-scripting/jarchi.d.ts` |
| GraalJS runtime, Java interop, external processes | `ai/jarchi-scripting/graaljs-java.md` |
| SWT / JFace / GTK mechanics · dialog look and feel: principles · SWT realisation (read before changing any dialog) | `ai/jarchi-scripting/swt-gtk.md` · `Scripts/View/docs/reference/gui.md` § Look and feel · `Scripts/View/docs/reference/dialog-style.md` |
| View subsystem: rules · what · detail per subject · design decisions + how | `Scripts/View/AGENTS.md` · `Scripts/View/docs/SPEC.md` · `Scripts/View/docs/reference/` · `Scripts/View/docs/ARCHITECTURE.md` |
| Static type checking: scope, JSDoc, casts, typings | `types/README.md` · `ai/jarchi-scripting/jarchi.d.ts` |

**Skills** — load the skill when the task matches. Tools with skill support find them through `.claude/skills/` stubs; otherwise read the file.

| Skill | When | File |
|---|---|---|
| `jarchi-scripting` | Writing or changing jArchi scripts: API, collections, GraalJS / Java, SWT dialogs | `ai/jarchi-scripting/SKILL.md` |
| `elkjs` | ELK layout: algorithms, JSON graph format, options (Layered · core options · JSON under `ai/elkjs/docs/`) | `ai/elkjs/SKILL.md` |
| `dagre` | Dagre / dagre-cluster-fix layout | `ai/dagre/SKILL.md` |
| `graphviz` | Graphviz: DOT, engines, attributes, `-Tjson` | `ai/graphviz/SKILL.md` |
| `view-testing` | The user reports a generated or laid-out view that looks wrong | `ai/view-testing/SKILL.md` |
| `view-baseline` | A View change must be checked in Archi against the committed baseline; the test model is rebuilt | `ai/view-baseline/SKILL.md` |

## Hard rules

No exceptions.

1. **Look it up, never guess.** Before writing code that uses a jArchi API, sets a visual property (`fontStyle`, `fillColor`, `opacity`, …), builds an SWT/JFace widget or sets an ELK/Dagre/Graphviz option, load the matching skill or grep a working script for the same use. Never guess property names, value types or contracts (`vo.fontStyle = "bold"`, not `1`).
2. **One canonical vocabulary.** One name per concept across users, docs, logs, variables, functions and data structures; no translation layer. Exceptions only when (a) the canonical term is technically inaccurate in the algorithm, (b) it would make code confusing or verbose, or (c) the data structure is a standard technical concept (e.g. `parentMap`, `childIds`). Document an exception once in the part's vocabulary section and use the canonical term at every user-facing surface. Part vocabulary sections (e.g. `Scripts/View/docs/SPEC.md` § Vocabulary) are authoritative.
3. **No backwards-compat fallback for renames.** Update every site in the same commit; no dual-readers, alias exports or "load old + write new" shims — one name per concept at all times. Only an external contract beyond the repo's control is exempt; within-repo data (presets, sessions, user JSONs) is not — rewrite it in the same commit. Operational form of rule 2.
4. **Commits carry no co-author and no AI mention.** Applies to every AI tool and model. Never add a `Co-Authored-By` line, and never name a tool, model or AI ("Generated with …") in a commit message or PR description. This overrides any tool default. Earlier commits that carry the line stay as they are unless the user asks.
5. **Typecheck after every change in its scope.** A change to a file matched by `jsconfig.json` › `include` ends with `npm run typecheck` at exit 0. Annotate with JSDoc only; a real error it finds is fixed in its own commit, but executable code never changes just to satisfy the checker (casts and limits: `types/README.md`).
6. **No npm at runtime.** Scripts run straight from a clone: runtime libraries are vendored in `Scripts/node_modules/`. npm is for development tools only (root `package.json`).
7. **Rules go where the hierarchy says** (see Hierarchy). Adapter files carry no rules.
8. **Plans live in `plan/`.** Every plan an agent writes — plan mode, a proposal, a step log — is saved in `plan/` as a descriptive kebab-case filename matching the plan title (`view-nesting-every-container-implementation.md`), never a generated name and never outside the repo. Claude Code is pointed there by `plansDirectory` in `.claude/settings.json`; every other tool follows this rule. Plans are working notes, not rules.

## Conventions

Defaults, not hard rules; a reason to deviate goes in a comment.

- **Names.** Functions: camelCase verbs (`buildGraph`); file-internal: `_` prefix, never exported; an exported function has no `_`; engine-specific: suffix (`_buildGraphELK`); constants: UPPER_SNAKE_CASE; required modules: PascalCase (`const Common = require(…)`), always called with the namespace (`Common.debug()`).
- **Functions.** One verb — a name that needs "and" is two functions. Aim for ≤ 30 lines. Return one value; two results → `{ a, b }`. Guards in the caller, not in the extracted function. Extract on the third identical line, not before.
- **Errors.** Validate at the boundaries (user input, files, presets, external tools); trust internal code — the typecheck covers its contracts. No fallback for a case that cannot happen.
- **Logging.** `console.log` for progress, `console.error` for errors (one argument: jArchi's console takes one; it has no `warn`), `Common.debug` for diagnostics.
- **Selection.** Use `Selection.getSelection` / `getVisualSelection` (`_lib/selection.js`) when view references and single-object selections should expand; a script with its own selection semantics (e.g. View, `$(selection)`) says so.
- **Java.** `Java.type("java.io.File")`, not the `java.io.File` package root. Java lists are arrays to GraalJS; Java maps are not plain objects (`JSON.stringify` gives `{}`).
- **Vocabulary.** Per part; View: `Scripts/View/docs/SPEC.md` § Vocabulary (rule 2).
