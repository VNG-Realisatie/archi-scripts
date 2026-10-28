# Copilot instructions — archi-scripts

See [`ai/rules.md`](../../ai/rules.md) for layer model, folder structure, and source references.

## Hard rules

1. **No post-layout scaling.** Node `width`/`height` must never be multiplied by a post-layout factor. Graphviz `size=` is forbidden.
2. **Position spread only.** Moving node centers outward (sizes frozen) is allowed; compressing is forbidden.
3. **Adapters never read or write a view.** Operate only on `LayoutGraph` / `LayoutResult`.
4. **No view mutation in the pipeline.** The pipeline reads; the writer at the final step writes.
5. **Container-ness is derived from `parentMap`, never declared.**
6. **ArchiMate relations are never modified.** Edge reversal is layout-traversal only.
7. **One write function; no per-action branches** on action type inside the writer.
8. **Determinism.** Same inputs → same view, always.
9. **`validatePreset` strips unknown keys.** Any new `params` key must be in `DEFAULT_PRESET.params` in `defs.js`.
10. **Follow the AI rules structure.** New repo rule → `ai/rules.md`. New skill → `ai/<skill>/SKILL.md`. Subsystem rule → `Scripts/<subfolder>/CLAUDE.md`. Tool adapter files carry no rules. Narrowest scope wins: global → repo → skill → subsystem.
