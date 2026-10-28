# Restructure View docs: SPEC body, reference files, ARCHITECTURE per subject

Phase 2 of [agents-hierarchy-restructure.md](agents-hierarchy-restructure.md).

## Context

Phase 1 moved the rules to `AGENTS.md`. The View docs are still two large files that a task can only
load whole or by line range. SPEC.md is 1,057 lines: the body is 361 lines (≈ 10k tokens) and the appendix ≈ 20k.
ARCHITECTURE.md is 288 lines (≈ 10k), with 55 decisions in one flat Part A table, far from where Part B
describes how they were realised.

Goals:
- A task opens one small file for its subject.
- The text is compact: no duplication between docs, concise wording, **no loss of information**.
- Minimal duplication with the code: what the code owns is not restated, and is generated where docs need it.
- Drift from the code is fixed, and decisions that steer future changes become rules.

User decisions (2026-10-24):
1. ARCHITECTURE gets **one section per subject**: decisions (why) followed by realisation (how). Part A/B go.
2. **✦ markers and the SPEC appendix delta are merged into ARCHITECTURE § Known gaps.** Realised items and "Already realised" are dropped (git holds the history); SPEC describes only the target.
3. **When a doc contradicts the code, the code wins.** Every fix is listed in the report.

The approval workflow still applies: the docs are changed, checked and presented, and committed only after
the user's OK (no co-author line).

## Division: what is written where

One owner per fact. Others link to it, never restate it.

| Owner | Holds | Never holds |
|---|---|---|
| **Code — `lib/defs.js`** (SSOT) | Values: defaults (`DEFAULT_PRESET`), enums and value lists, labels, tooltips, algorithm capabilities and active params, constants (`CONNECTION_END_ROOM`, …) | Reasons spanning modules |
| **Code — module header and comments** | What one module or function does and why, locally; a pointer to the SPEC section for the contract it serves (`SPEC: Managed occurrences`) | The contract itself |
| **Code — adapters** | Engine option names, units and mappings | — |
| **Generated tables** (`gen_docs_tables.js`) | Every doc table that mirrors `defs.js`: styles, algorithms, layout params (+ **new: Default column**), capability matrix, **new: preset-only options** | Hand edits |
| **SPEC.md body** | The *what*: purpose, vocabulary, layers and boundaries, data model, actions, selection, layout options, engine contract, dialog in outline, appearance, rules and invariants, error model, acceptance. Implementation-free; user-visible numbers (12 px end room, 20 px shortest connection) appear **once**, here | File, function and engine-option names; values that `defs.js` holds |
| **`docs/reference/*.md`** | Functional detail per subject, needed for a rebuild: dialog mock-ups and per-control behaviour, preset file shape (the parts not generated), run order, counting, nesting, layout graph/result, view size per engine, console logging | Reasons (ARCH), realisation (ARCH), defaults and value lists (generated) |
| **ARCHITECTURE.md** | Per subject: the decision + why, then the realisation choices that span modules or are not obvious from one file (with file and exported names); module index, persistent state, platform constraints, verification, known gaps | Restated code, internal names, values, numbers already in SPEC (it links), change history |
| **`test-cases.md`** | Measurements and findings from reported views | Rules |
| **README.md** | User guide | Design, file tables (→ ARCH § Modules) |
| **`Scripts/View/AGENTS.md`** | Binding rules and the doc process | Descriptions |

This table replaces the current "Content division" table in ARCHITECTURE. `Scripts/View/AGENTS.md`
§ Docs points to it.

## Target structure

```
Scripts/View/docs/
  SPEC.md                 body §1–14 only + a short "Reference" index of the files below
  ARCHITECTURE.md         per subject (below)
  test-cases.md           + rows only where a measurement moves out of ARCH without a logged case
  reference/
    gui.md                Display-label map · Dialog reference (preset row, 4 tabs, totals/action area,
                          interaction rules) · generated styles / algorithms / layout-params tables ·
                          generated preset-only options
    presets.md            Preset file shape (params → pointer to the generated layout-params table) · Rule lists
    selection-nesting.md  Selection run order · Counting rules · Nesting reference (connections mode,
                          roles and parents, connections between occurrences, managed occurrences,
                          writer parenthood) · Sizing refinements
    engines.md            Runtime and engines · Layout graph and result · generated capability matrix ·
                          Per-engine view-size · Console logging
```

Removed from the SPEC appendix: **Rule scopes** (in `AGENTS.md`; §14 keeps one pointer line),
**Current realisation › File map** (ARCH § Modules owns it), **Delta** (→ Known gaps).
Headings keep their text, so anchors stay the same and only the file part of a link changes.

### ARCHITECTURE.md

```
Purpose                 one line: the decisions serve the purpose and use cases in SPEC §1 (link)
Division                (table above) + one line: order of change → Scripts/View/AGENTS.md § Docs
Modules                 old B.1 table + dependency rules
Run flow and identities old B.2
Per subject: **Decisions** (Decision | Why), then **Realisation** (bullets)
  Model and actions     closed types, edge partition, action not in preset, view name, Expand target
  Selection             steps, step rules, Modify skips filter, step relations · pipeline
  Nesting               every container, one-parent choice, cycles, nesting lines · resolution
  Managed occurrences   reconciled by every action, records as placements · record, capture, pairing
  Writer                re-layout from the Layout tab, diagram-blocks, diagram connections, connection
                        once, create after layout, parentId conversion · writer
  Sizing                same width per level, snap columns (realisation: link to ELK)
  Engines › SSOT        registry, effective params, engine-option order, Order
  Engines › ELK         Layered placement, Tree, Radial, Stress + SPOrE, no ELK Force · ELK adapter
  Engines › Dagre       cluster-fix, routing, self-loops (decisions: none today → realisation only)
  Engines › Graphviz    Twopi, Circo, Neato no nesting, coupled distances, end room · Graphviz adapter
  Dialog                apply on select, *, Default, labels name the result, radio table, steps
                        expanded, commit not keystroke · dialog
  Appearance            · appearance pass
  Presets               file form, schema version, migrations
Persistent state · Platform constraints · Verification · Known gaps
```

## Compaction rules

- Every sentence carries one fact; a fact appears in one place and is linked from elsewhere.
- No restating across levels: §-body = the rule in one sentence, reference = its detail, ARCH = its reason.
  A body sentence the reference repeats word for word goes from the reference.
- A "Why" keeps the argument and drops the story; a measurement already in `test-cases.md` becomes
  "(test case n)" (e.g. Circo 616–732 px → 13, Stress 82 overlaps → 8, Twopi hub on ring 3 → 4,
  Neato `ipsep` → 10).
- ARCH realisation keeps choice + why + where (file, exported name); a bullet that only says what one
  function does goes when that function's header comment already says it (otherwise it moves into that comment).
- Numbers and value lists that `defs.js` holds go from the docs; behaviour numbers stay once in SPEC.
- SPEC §1 (`@keep`) changes only in its use cases (step 2a); the rest of its wording stays.

## Steps

1. **Inventory (before any edit).** A script splits the HEAD versions of SPEC.md and ARCHITECTURE.md
   into units (sentence, bullet, table row) and writes them to a scratchpad checklist. Each unit is later
   marked with its new place: a file and heading, a code location, or "dropped: history / duplicate of X".
2. **Split SPEC.** Move each appendix section to its reference file; SPEC keeps §1–14 plus a "Reference"
   index. Rewrite the in-page appendix links (`#capability-matrix`, `#dialog-reference`,
   `#selection-run-order`, `#counting-rules`, `#nesting-reference`, `#per-engine-view-size`,
   `#layout-graph-and-result`, `#console-logging`, `#preset-json-schema`, `#display-label-map`,
   `#rule-lists`, `#containers-and-connections-mode`) to `reference/<file>.md#…`.
2a. **Use cases (SPEC §1, owner; user-approved change to the `@keep` text).** Extend them from
   README, the presets (`presets/GEMMA/*`, `presets/Bedrijfsobjecten/*`, …) and the callers
   (`Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs`). Draft:
   - quickly generate a starting point for a new view;
   - generate context views: one view per element with its related elements (*One view each*), e.g. a view per GGM data object;
   - analyse the model by generating different views; use nesting to find unexpected relations, double relations, etc.;
   - generate complex views completely from one preset (selection, layout, appearance and view properties) and regenerate them without the dialog when the model changes, e.g. the GEMMA publication views (TAenIA, standaardenlijst, publiceren…);
   - lay out a hand-made view again (*Layout only*) or extend it (*Expand view*), keeping user content: legends, notes, hand-placed duplicates;
   - drive view generation from other scripts through the API, e.g. the GGM pipeline that generates, styles and sets the properties of the views per policy domain.

   README's own use-case list is replaced by one line linking to SPEC §1 § Use cases (one owner).
3. **Delta → Known gaps.** Check each item against the code. Drop the realised ones (2 self-loops, 7 error
   model, 8–10 nesting) and their ✦ markers. The open ones go to Known gaps, merged with B.7:
   - 1: explicit migration, unknown-key stripping, `viewSizeMode`;
   - 3: typed `engineParams` (today passed through as-is, `defs.js` ~l.995);
   - 4: adapter registry;
   - 5: per-tab dialog modules;
   - **6: master `appearance.enabled`**, which is not in `DEFAULT_PRESET` and so is stripped on load.

   An open item stays in the body as the target, without ✦.
4. **Regroup and compact ARCHITECTURE** following the layout and compaction rules above.
5. **Compact SPEC body and reference files** following the compaction rules. The `params` block of the
   preset schema becomes a pointer to the generated layout-params table, which gets a Default column. The
   schema keeps the parts that no table covers: filter, steps, view, appearance, engineParams, viewProperties.
6. **Fix drift and duplication** (the code wins; each fix goes in the report list):
   - SPEC §9: "Three tabs" → four (Properties). "The five styling groups" → three (§10).
   - SPEC §9 and README: "named in the group's hint line" → "greyed". The hints were removed in commit 33132a9.
   - Interaction rules "Coupled distances: Neato, FDP and SFDP" → add Circo (`connectionsBetweenElements` in `defs.js`).
   - Display-label map "Layout style = algorithm, engine": the dialog group is *Algorithm* (`dialog_main.js:1538`).
   - SPEC rule 10 / §5: add self-loops as an exception; they are removed where the algorithm draws none (§8 already says so).
   - SPEC §12 "never aborts on preset shape" contradicts §14 "an older schema is refused". State both: the shape is repaired; an older `schemaVersion` is refused.
   - ARCH Verification `gen_docs_tables.js --check`: there is no such flag; checking is the default.
   - Duplicates: §14 "SSOT/adapter separation" and the capability matrix's "one SSOT entry plus one adapter mapping" (keep §3). Interaction-rules items that restate the Preset row or §9. README § Files → one pointer line to ARCH § Modules.
   - Further contradictions found along the way are fixed the same way and listed.
7. **Steering decisions → View rule.** Add one hard rule to `Scripts/View/AGENTS.md`, *Option semantics*:
   - labels and values name the result;
   - an option has one meaning and a visible effect in every algorithm that offers it;
   - an adapter sets only engine options (SPEC §9, rules 18–20).

   ARCH keeps only the *why*. Update § Docs:
   - Content division → the Division table in ARCH;
   - appendix → `reference/`;
   - departures → ARCH § Known gaps;
   - selective reading → "open the reference file for the subject; `gui.md` only for dialog work".
8. **Generator.** `tools/gen_docs_tables.js` gets a target file per table:
   - `styles`, `algorithms`, `layout-params` (+ Default from `DEFAULT_PRESET.params`) and the new `preset-only` (from `HIDDEN_PARAMS`, `PARAM_LABELS`, `PARAM_TOOLTIPS`) → `reference/gui.md`;
   - `capability-matrix` → `reference/engines.md`.

   Read, compare and write per file. The check and `--write` behaviour stay the same, and the header comment names the files.
9. **References** (rule 3, rename integrally):
   - Docs:
     - root `AGENTS.md` routing row (+ `docs/reference/`);
     - `Scripts/View/AGENTS.md` and README;
     - ARCH (`SPEC.md#managed-occurrences` → `reference/selection-nesting.md#…`);
     - `ai/view-testing/SKILL.md`, if it names appendix sections.
   - Code comments that name appendix sections:
     - `generate_view.js` l.180, 464, 481, 642, 721;
     - `selection_pipeline.js` l.717, 802, 873, 978;
     - `appearance.js` l.120;
     - `defs.js` l.70.

     Body references (`SPEC §5`, `§8`, `§10`, `§11`) stay valid.
10. Present the result and the report; no commit before approval.

## Verification

- **No information lost:** the step-1 checklist is complete: every unit has a new place or a reason for
  dropping it. Units marked "in code" name the file and line, which I check. The checklist goes in the report.
- **Links:** a script resolves every relative Markdown link and `#anchor` in `Scripts/View/docs/**`,
  `Scripts/View/AGENTS.md`, `Scripts/View/README.md`, `AGENTS.md` and `ai/**`.
  `grep -rn 'SPEC appendix\|SPEC.md appendix\|Appendix delta'` must return 0 outside `plan/`.
- **Generator:**
  - `node Scripts/View/tools/gen_docs_tables.js` reports every table up to date.
  - Edit one table by hand: the check reports it and `--write` restores it.
- **Code:**
  - `node tools/same-code.js` on every changed `lib/*.js` = SAME.
  - `npm run typecheck` exits 0.
  - `node Scripts/View/tools/check_registry.js`, `rel_filter_test.js` and `nesting_test.js` pass.
- **Style:**
  - SPEC body ≤ 550 lines.
  - The SPEC body names no technology (jArchi, SWT, ELK, Dagre, Graphviz).
  - No value that `defs.js` holds is written by hand in the docs (spot grep on defaults: `200`, `1.78`, `#FF6B35`, …).
- **Size table:** `wc -c` per file, old against new, and the expected load per task (dialog, engine, nesting).

## Report

Token table; the inventory checklist; the drift-fix list (doc said → code does → changed to); the delta
items, each realised or open; the measurements moved to test cases. Offered as a page.
