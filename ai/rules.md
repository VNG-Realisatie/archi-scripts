# AI rules — archi-scripts

## Layers and placement

Narrowest scope wins on conflict. All AI context lives under `ai/` (tool-independent); tool adapter files (`.claude/`, `.cursor/`, `.cursorrules`, `.github/copilot/`) only point here and carry no rules.

| Layer | Location | Scope |
|---|---|---|
| Global | `~/ai/shared/` + tool global rules | All projects on this machine |
| Repo | `ai/rules.md` (this file) | All scripts in this repo |
| Skill | `ai/jarchi-scripting/SKILL.md` | jArchi plugin: runtime, pitfalls, API, GraalJS/Java, SWT/GTK (highest repo authority) |
| Skill | `ai/elkjs/SKILL.md`, `ai/dagre/SKILL.md`, `ai/graphviz/SKILL.md` | Engine layout rules, when working on that engine |
| Subsystem | `Scripts/<subfolder>/CLAUDE.md` | One subfolder only |

Where a new rule goes: repo-wide → Hard rules or Conventions below; repo layout, modules, testing → `ai/repo-guide.md`; new technology → `ai/<skill>/SKILL.md` (jArchi API facts → `ai/jarchi-scripting/jarchi.d.ts`); subsystem → `Scripts/<subfolder>/CLAUDE.md`.

## Source references

| What you need | File |
|---|---|
| Folder structure, loading modules, `_lib` modules, entry scripts, testing | `ai/repo-guide.md` |
| jArchi plugin: runtime, pitfalls, routing to the API | `ai/jarchi-scripting/SKILL.md` |
| jArchi API (typed, from the plugin source) | `ai/jarchi-scripting/jarchi.d.ts` |
| GraalJS runtime, Java interop, external processes | `ai/jarchi-scripting/graaljs-java.md` |
| SWT / JFace / GTK mechanics · this repo's dialog style | `ai/jarchi-scripting/swt-gtk.md` · `ai/dialog-style.md` |
| ELK: skill index · Layered options · layout options · JSON format | `ai/elkjs/SKILL.md` · `docs/elk-layered.md` · `docs/layout-options-core.md` · `docs/json-format.md` (under `ai/elkjs/`) |
| View subsystem: what · design decisions + how · entry | `Scripts/View/docs/SPEC.md` · `Scripts/View/docs/ARCHITECTURE.md` · `Scripts/View/CLAUDE.md` |
| Static type checking: scope, JSDoc, casts, typings | `types/README.md` · `ai/jarchi-scripting/jarchi.d.ts` |

## Hard rules

No exceptions. Violating them corrupts diagrams or breaks the pipeline.

1. **No post-layout scaling.** `LayoutResult` node `width`/`height` equal the `LayoutGraph` input. Never multiply sizes after layout; engine attributes that scale output (e.g. Graphviz `size=`) are forbidden.
2. **Position spread is the only post-layout adjustment.** Moving node *centers* outward (sizes frozen) to meet a `maxWidth`/`maxHeight` is allowed; compressing positions is forbidden.
3. **Adapters never read or write a view.** They operate only on `LayoutGraph` / `LayoutResult`; no Archi API calls.
4. **No view mutation in the pipeline.** It reads elements and relations; a view's content changes only through the writer at the final step.
5. **Container-ness is derived, never declared.** A node is a container iff `parentMap` names it as a parent — no flag, type check or pre-declared property.
6. **ArchiMate relations are never modified.** Edge reversal is a traversal concern only; the model relation's source/target never changes.
7. **One write function, no per-action branches.** NEW_VIEW, ONE_EACH, EXPAND_VIEW and LAYOUT_ONLY share one writer path.
8. **Determinism.** Same inputs → same view; never rely on hash-iteration order.
9. **`validatePreset` strips unknown keys.** A new `params` key must be in `DEFAULT_PRESET.params` in `defs.js`, or it is silently dropped on load.
10. **Add rules and skills where the layers say** (see Layers and placement). Tool adapter files carry no rules.
11. **One canonical vocabulary.** One name per concept across users, docs, logs, variables, functions and data structures; no translation layer. Exceptions only when (a) the canonical term is technically inaccurate in the algorithm, (b) it would make code confusing or verbose, or (c) the data structure is a standard technical concept (e.g. `parentMap`, `childIds`). Document an exception once in the subsystem's vocabulary section and use the canonical term at every user-facing surface. Subsystem vocabulary sections (e.g. `Scripts/View/docs/SPEC.md` § Vocabulary) are authoritative.
12. **No backwards-compat fallback for renames.** Update every site in the same commit; no dual-readers, alias exports or "load old + write new" shims — one name per concept at all times. Only an external contract beyond the repo's control is exempt; within-repo data (presets, sessions, user JSONs) is not — rewrite it in the same commit. Operational form of rule 11.
13. **Commits carry no co-author and no AI mention.** Applies to every AI tool and model (Claude, Copilot, Cursor, any other). Never add a `Co-Authored-By` line, and never name a tool, model or AI ("Generated with …") in a commit message or PR description. This overrides any tool default.
14. **Typecheck after every change in its scope.** A change to a file matched by `jsconfig.json` › `include` ends with `npm run typecheck` at exit 0. Annotate with JSDoc only; a real error it finds is fixed in its own commit, but executable code never changes just to satisfy the checker (casts and limits: `types/README.md`).
15. **No npm at runtime.** Scripts run straight from a clone: runtime libraries are vendored in `Scripts/node_modules/`. npm is for development tools only (root `package.json`).

## Conventions

Defaults, not hard rules; a reason to deviate goes in a comment.

- **Names.** Functions: camelCase verbs (`buildGraph`); private: `_` prefix, not exported; engine-specific: suffix (`_buildGraphELK`); constants: UPPER_SNAKE_CASE; required modules: PascalCase (`const Common = require(…)`), always called with the namespace (`Common.debug()`).
- **Functions.** One verb — a name that needs "and" is two functions. Aim for ≤ 30 lines. Return one value; two results → `{ a, b }`. Guards in the caller, not in the extracted function. Extract on the third identical line, not before.
- **Errors.** Validate at the boundaries (user input, files, presets, external tools); trust internal code — the typecheck covers its contracts. No fallback for a case that cannot happen.
- **Logging.** `console.log` for progress, `console.error` for errors (one argument: jArchi's console takes one; it has no `warn`), `Common.debug` for diagnostics.
- **Selection.** Use `Selection.getSelection` / `getVisualSelection` (`_lib/selection.js`) when view references and single-object selections should expand; a script with its own selection semantics (e.g. View, `$(selection)`) says so.
- **Java.** `Java.type("java.io.File")`, not the `java.io.File` package root. Java lists are arrays to GraalJS; Java maps are not plain objects (`JSON.stringify` gives `{}`).
- **Vocabulary.** Per subsystem; View: `Scripts/View/docs/SPEC.md` § Vocabulary (rule 11).
