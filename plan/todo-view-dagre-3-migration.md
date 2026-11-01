# TODO: View — Dagre to @dagrejs/dagre 3.x

Status: TODO, not started. Decided 2026-11-01: do not switch yet.

## Goal

Replace the unmaintained `dagre-cluster-fix` 0.9.0 (last release 2022) with the supported `@dagrejs/dagre` 3.x (3.1.3, 2026-10-24). Dagre becomes the engine for flat flow views; nesting goes to Dot and ELK.

## Findings (harness, 2026-11-01, Node only)

- Edges touching a container throw in 3.x (`setting 'rank'`): element → container and container → container; dagre-cluster-fix lays these out. Container → own child and a self-loop on a container throw in both.
- Test model with the baseline preset set to Dagre: 1 Nesting (new_view), 2 Edited (layout_only, expand_view) throw in 3.x; 3 Network 1770 × 800 → 1770 × 826.
- GEMMA: Beleidsdomeinen ingedeeld in Iv3 equal (342 → 240 ms), ICT bedrijfsobjectmodel 1618 → 1623 px high, wiki Kennismodel equal; GEMMA domeinen (TAenIA) throws in both.
- Container size still comes from the children: no label room (the `padding` fields in the types are not read by the layout), so the step 4 limit of `view-text-sizes-from-archi-fonts.md` stays.
- Self-loops on an element: both route (7 points); the adapter's retry stays.
- 3.x calls `structuredClone` in the ordering step (on a tie in crossings); presumably missing in GraalJS — check in Archi, else shim it before loading.
- Packaging: ESM-first; `dist/dagre.cjs` requires `@dagrejs/graphlib` by bare name; `dist/dagre.js` bundles graphlib but sets a global `var dagre` (needs a `module.exports` line). 107 KB, no lodash (cluster-fix 385 KB).
- New in 3.x: per-cluster `rankdir` / `ranksep` / `nodesep` / `align` (cluster collapsed onto its children in a quick test), `rankalign`, order `constraints`, `customOrder`.
- `ai/dagre/dagre-reference.md` is wrong that `@dagrejs/dagre` has no compound graphs: clusters work, edges at a cluster do not.

## Pros and cons

Better:

- Supported: releases through 2026; cluster-fix unchanged since 2022.
- Smaller and faster: 107 KB instead of 385 KB, no lodash; 342 → 240 ms on 561 nodes.
- New options: per-cluster direction and spacing (immature: cluster collapses onto its children), `rankalign`, order `constraints` / `customOrder` (could give a sort within a layer).
- Same result on views without edges at containers (at most 26 px difference).

Worse:

- Edges at a container throw (element → container, container → container): 3 of 4 nested baseline runs fail. The adapter must keep them out of the layout and write them unrouted, else Dagre only works on views without them.
- `structuredClone` in the ordering step: presumably missing in GraalJS (not checked in Archi); needs a shim.
- Vendoring: ESM-first package; a small wrapper or added `module.exports` line.

Unchanged:

- Container size from the children; no room for the container label.
- Self-loops: same routing on an element, same throw on a container; the adapter's retry stays.

## Steps

1. Vendor `@dagrejs/dagre` 3.x as `Scripts/node_modules/dagre/` (bundled build + `module.exports`), remove `dagre-cluster-fix` and the unused dagre 1.0.4; update `ai/repo-guide.md` § libraries.
2. Adapter (`View/lib/engines/dagre.js`): edges with a container at either end stay out of the Dagre graph and are written unrouted (as the self-loop fallback); console line with their count. `structuredClone` shim if Archi lacks it.
3. `defs.js` Dagre capabilities and tooltip: nesting partial, no edges at containers; docs (`reference/engines.md`, SPEC capability matrix) after approval (`Scripts/View/AGENTS.md` § Order of change).
4. Fix `ai/dagre/SKILL.md` and `dagre-reference.md`: package, loading, cluster-edge limit, new options.
5. Check: typecheck, `check_registry.js`, `nesting_test.js`, harness on the views above against cluster-fix, then Dagre in Archi (GraalJS).

## Handoff

- Done: research only.
- Next: step 1 when the user decides to switch.
- User: decide when.
