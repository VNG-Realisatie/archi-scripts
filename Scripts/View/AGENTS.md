# Scripts/View — agent instructions

View generation and layout (ELK, Dagre, Graphviz). Adds to the repo `AGENTS.md`; on a conflict this file wins for `Scripts/View/`. Documentation (not rules): `docs/SPEC.md` (what), `docs/reference/` (functional detail per subject), `docs/ARCHITECTURE.md` (decisions and how, per subject), `README.md` (user guide).

## Hard rules

No exceptions. Violating them corrupts diagrams or breaks the pipeline. Each is the operational form of a SPEC § 11 rule; on a difference in content SPEC wins.

1. **No post-layout scaling.** `LayoutResult` leaf `width`/`height` equal the `LayoutGraph` input; containers are sized by the engine. Never multiply sizes after layout; engine attributes that scale output (e.g. Graphviz `size=`) are forbidden. Archi draws elements at their exact pixel size; scaled sizes are non-standard and make diagrams unreadable. (SPEC rule 1)
2. **Position spread is the only post-layout adjustment.** Moving node *centers* outward (sizes frozen) to meet a `maxWidth`/`maxHeight` is allowed; compressing positions is forbidden. (SPEC rule 2)
3. **Adapters never read or write a view.** They operate only on `LayoutGraph` / `LayoutResult`; no Archi API calls, no selection, no preset. (SPEC rules 5–6)
4. **No view mutation in the pipeline.** It reads elements and relations; a view's content changes only through the writer at the final step. (SPEC § 3, rule 9)
5. **Container-ness is derived, never declared.** A node is a container iff `parentMap` names it as a parent — no flag, type check or pre-declared property. (SPEC rule 7)
6. **ArchiMate relations are never modified.** Edge reversal is a traversal concern only: the pipeline swaps source/target in the layout input so the engine traverses the edge differently; the model relation's source/target never changes, and the writer creates the connection against the model relation without being told. Archi draws a connection from the model relation's own direction, so no `reversed` / `flipped` / draw-direction flag on visuals or layout edges: when bendpoints come back in the other order, compare the model relation's ends with the result edge's. Do not copy model facts onto visual or intermediate shapes. (SPEC rule 8)
7. **One write path, no per-action branches.** All four actions (NEW_VIEW, ONE_EACH, EXPAND_VIEW and LAYOUT_ONLY) share one write plan and one apply. (SPEC rule 9)
8. **Determinism.** Same inputs → same view; never rely on hash-iteration order. (SPEC rule 12)
9. **`validatePreset` strips unknown keys.** A new `params` key must be in `DEFAULT_PRESET.params` in `lib/defs.js`, or it is silently dropped on load. (SPEC rule 13, § 14 Schema migration)
10. **Option semantics.** A label or value names the result, never an engine technique; an option has one meaning and a visible effect in every algorithm that offers it, else it is disabled; an adapter sets only the engine's own options, with no placement, ordering or crossing reduction of its own. (SPEC § 9, rules 18–20)

Preset files (`presets/**/*.json`) are plain JSON, no `module.exports`.

## Conventions

Defaults, not hard rules; a reason to deviate goes in a comment.

- **Tooltips.**
  - At most two short lines: what it does, then the one detail or trade-off the user needs.
  - No availability: never which algorithms use it or when it is greyed. The dialog greys the control; say why only when the reason is not obvious (*Needs a Nesting condition with Every*).
  - No list of the options a control already shows; name an option only to explain it (*Greedy: reverses as few relations as it can*).

## Docs

**What goes where**: the Division table in `docs/ARCHITECTURE.md` (canonical) — one owner per fact, values in `lib/defs.js`, doc tables generated from it, no restated code. On a conflict SPEC wins. Markers: `<!-- @mark: … -->` = act on it, then remove; `<!-- @keep: … -->` = signed off, do not rewrite.

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

A reported view that looks wrong: skill `view-testing` (`ai/view-testing/SKILL.md`); findings are logged in `docs/test-cases.md`. Test levels, judging a result, test data: `docs/ARCHITECTURE.md` § Development and testing.
