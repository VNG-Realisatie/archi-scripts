# Scripts/View — agent instructions

View generation and layout (ELK, Dagre, Graphviz). Adds to the repo `AGENTS.md`; on a conflict this file wins for `Scripts/View/`. The rules are § Hard rules below. Documentation (not rules): `docs/SPEC.md` (what), `docs/reference/` (functional detail per subject), `docs/ARCHITECTURE.md` (decisions and how, per subject), `README.md` (user guide).

## Hard rules

System-wide, grouped by theme; code reviews enforce them. They go before `docs/SPEC.md` (what) and the rest of the docs. The only exceptions are the ones a rule names itself. Violating them corrupts diagrams or breaks the pipeline.

**Layout integrity.**
1. **No scaling**: a leaf keeps its size and the engine sizes the containers; no size is multiplied to reach a view size or aspect ratio. (Foundational.) A leaf grows only to fill a place the layout gives it: a width (*Same width*), a column (*Columns across containers*) or a cell (the table of a view template). Engine facts: [layout graph and result](docs/reference/engines.md#layout-graph-and-result); why: [ARCHITECTURE § Sizing](docs/ARCHITECTURE.md#sizing).
2. **Position spread only**: an outward centre-spread, with sizes frozen, is the only post-layout adjustment; compression is forbidden.
3. **Parent-relative coordinates**: a nested visual's bounds are relative to its parent. The orchestrator converts them from the engine's absolute output.
4. **Parent-first writing**: every node is written after its parent, so parent-relative conversion and draw order hold under any engine output order.

**Engine isolation.**
5. **Adapters never touch a view**: they operate only on LayoutGraph / LayoutResult.
6. **Layout-graph-only boundary**: adapters never see selections, presets or views.
7. **Container-ness is derived**: a node is a container if and only if something is its child; never a flag or a type check ([layout graph](docs/reference/engines.md#layout-graph-and-result)).
8. **Relations are never modified**: edge reversal is a traversal concern only; the writer draws each connection from the model relation's own direction ([ARCHITECTURE § Writer](docs/ARCHITECTURE.md#writer)).

**Writer discipline.**
9. **One action-agnostic writer**: if a visual exists, it is repositioned; otherwise it is created. The same holds for relations. No per-action branch.
10. **No silent data loss**: overwrite only when an action explicitly says so. A Modify action deletes no visuals except managed occurrences the settings no longer ask for (with the lines drawn to them), lines of relations drawn as nesting, and self-loops the algorithm does not draw.
11. **Appearance preservation**: repositioning a visual never changes its appearance properties; expand and re-layout rely on this.

**Determinism & validation.**
12. **Determinism**: same inputs → same view, always; no reliance on hash-iteration order. Every order "by name" uses one comparison: accents and case are ignored, and the exact text breaks a tie, so the order is the same on every machine.
13. **Total validation**: every preset entering the orchestrator is validated. Unknown keys are handled, missing keys defaulted, and option values checked against the algorithm.
14. **Capability masking**: values for options inactive on the chosen algorithm are ignored at run time. A non-empty inactive value that reaches run time is a defect and is logged.
15. **UI-only state is partitioned**: a preset holds only what affects generation. UI-only state (active tab, chosen action, window size and position, collapsed steps, …) is kept beside it in the session, unseen by the API.

**Vocabulary & naming.**
16. **One canonical vocabulary**: one name per concept across UI, logs and code; [SPEC § 2](docs/SPEC.md#2-vocabulary) is authoritative.
17. **Rename integrally**: a renamed key, label or string is updated everywhere in one change. No dual-readers or compatibility shims for in-repo data.

**Option semantics.**
18. **Stay within the algorithm**: an adapter sets only options the engine itself has. It may derive their values from the layout graph, but never places elements itself or adds its own ordering or crossing reduction, so the algorithms keep their own character. Accepted exceptions, where the engine lacks the option and the result is otherwise unusable: Tree's layer distance and curved routing, Radial's second run with a fixed radius, Circo's second run when the graph has unconnected parts, and Neato's and SFDP's second run for an aspect ratio, which they ignore on a graph with unconnected parts.
19. **One meaning per option**: an option means the same in every algorithm that uses it. Layer distance is the space between the elements of successive layers or rings, border to border; element distance is the minimum space between elements.
20. **Every active option has a visible effect** over its whole range, except where the elements themselves set a hard minimum. Options that depend on each other are kept consistent in the dialog, visibly; never corrected silently at run time.

**Development.**
21. **Schema migration**: every preset carries a `schemaVersion`. An older shape is migrated by an explicit, documented one-shot migration; an unmigrated preset is refused with a message, never silently reinterpreted. Unknown keys are reported, never dropped silently. New configuration keys are added to the defaults in the same change that introduces them.
22. **Logging**: the console is for the user: per run the action, preset, selection, settings and target; per view a status line (new, updated, overwritten, skipped, failed) with what came from the selection, what the steps added, what is on the view and its size; at the end the result and the duration. Each warning and error says what happened, its effect and what to do (repo `AGENTS.md` § Conventions). Everything else goes to a log file per run, with column-stable count blocks so prediction and result can be compared ([console and log file](docs/reference/engines.md#console-and-log-file)).

Preset files (`presets/**/*.json`) are plain JSON, no `module.exports`.

## Docs

**What goes where**: the Division table in `docs/ARCHITECTURE.md` (canonical). Each fact has one owner and the others link to it, never restate it (the working agreement in `~/ai/shared/AGENTS.md`); values live in `lib/defs.js`, doc tables are generated from it, no restated code. On a conflict about behaviour the rules above win, then SPEC. Markers: `<!-- @mark: … -->` = act on it, then remove; `<!-- @keep: … -->` = signed off, do not rewrite.

**Order of change — approval first.**
1. Agree on the behaviour or solution with the user.
2. Change and verify the code.
3. Present it and wait for the user's approval. Until then no change to SPEC, `docs/reference/`, ARCHITECTURE, the generated tables, or the `lib/defs.js` tooltip and label texts that feed them.
4. After approval: behaviour in SPEC (detail in `docs/reference/`), the decision and realisation in ARCHITECTURE under its subject, then `node Scripts/View/tools/gen_docs_tables.js --write`.
5. Docs and code go in one commit.

**Writing SPEC** (and other specs or design docs here). The spec is a rebuild blueprint: readability and a clean conceptual model matter more than restating the implementation.
- Implementation-free, functional body: what the system does and the contracts it honours — no step numbers, helper or function names, per-hop maths. Technology names (jArchi, SWT, ELK, Dagre, Graphviz) only in `docs/reference/` and ARCHITECTURE.
- Data models as entity-relationship models (entities, relations, cardinalities); the concrete JSON schema goes in `docs/reference/presets.md`.
- Group related content: vocabulary by subject, rules by theme — no single flat numbered list.
- Frame a feature by what it adds, as a sub-option of the larger concept (nesting under layout), not as its own heavyweight section.
- Reference tables, mock-ups and full schemas go in `docs/reference/`; the SPEC body stays ≤ 550 lines. Check body length and technology-term leakage with grep before presenting.
- Compact: one fact per sentence, each fact in one place; link instead of restating; no values that `lib/defs.js` holds.
- A rewrite is research-backed: cross-check the doc against the live code first, resolve drift and contradictions, and list every part of SPEC the code does not meet yet in ARCHITECTURE § Known gaps.

**Reading the docs selectively.** Open the file for the subject: `docs/reference/gui.md` only for dialog work, `presets.md`, `selection-nesting.md` or `engines.md` otherwise; in SPEC and ARCHITECTURE, `grep -n '^#'` for the outline, then read only the section of the subject.

## Testing

A reported view that looks wrong: skill `view-testing` (`skills/view-testing/SKILL.md`); findings are logged in `docs/test-cases.md`. Test levels, judging a result, test data: `docs/ARCHITECTURE.md` § Development and testing.
