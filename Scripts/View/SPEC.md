# View Generation — Rebuild Specification

A single, self-contained specification for rebuilding the View subsystem from scratch.
The body is **implementation-free**: it states *what* the system must do and the contracts
it must honour, never *how* a particular platform realises them. The current realisation
(jArchi / SWT / ELK / Dagre / Graphviz) and all large reference tables live in the
[Appendix](#appendix), which is not part of the ≤500-line readable body.

`✦` marks a deliberate improvement over the previous design; every `✦` is itemised in the
[Appendix delta](#delta--spec-vs-current-implementation).

---

## 1. Purpose & scope

Starting from a **selection**, generate or modify the layout of ArchiMate **views**. The
system turns a chosen subset of the model — plus rules for which related elements to pull
in — into a positioned, optionally styled diagram.

**Use cases:** quickly seed a new view; generate many context views (one element + its
neighbours each); analyse a model by re-laying it out different ways; use nesting to expose
unexpected or duplicate relations.

**In scope:** generating/modifying views with different layouts; storing and reusing
selection + layout + styling configurations (presets); a configuration UI; session
continuity.

**Out of scope:** model authoring beyond what layout implies; editing element properties;
image export; view diff/merge; real-time collaboration.

---

## 2. Vocabulary

One name per concept across UI, docs, logs, and code. Terms grouped by subject.

**Model**
- **element** — a typed model concept.
- **relation** — a directed, typed connection between two elements at the model level.
- **view** — a diagram: a positioned arrangement of visual objects. One element may appear
  on many views.

**Visual**
- **VisualElement** — the placement of one element on one view; has bounds, may carry
  appearance overrides, points back to its element.
- **VisualRelation** — the drawing of one relation on one view; has endpoints and bendpoints.
- **occurrence** — a visual appearance of an element on a view. Normally one per view; with
  *show in every container* an element may have several.
- **diagram object** — a canvas-only object with no model concept (note, group, image,
  legend, view-reference). Belongs to exactly one view.

**VisualElement roles**
- **container** — drawn as a box around other VisualElements.
- **nested element** — drawn inside a container; not itself a container.
- **standalone** — drawn at view root; contains nothing, contained by nothing.
- **extra occurrence** — the 2nd..Nth appearance of one element under different containers.

**VisualRelation roles**
- **nesting** — drawn as containment (box-in-box, no line).
- **connection** — drawn as a line between two boxes. Every VisualRelation is one or the other.
- **self-loop** ✦ — a connection whose source and target are the same element. Whether it is
  drawn, and how, is an algorithm capability (see [Engine contract](#8-engine-contract)).

**Subsystem**
- **Layout** — algorithmic positioning of all visible objects on a view.
- **Preset** — a named, persistable bundle of selection, layout, and styling configuration.
- **Step** — one ordered related-elements expansion stage inside a preset; holds a rule list.
- **rule / rule list** — a rule is a pattern over element and relation types (*All* = any),
  *Include* or *Exclude*; a list keeps any Include match minus any Exclude match.
- **Action** — a runtime verb (create / per-element / expand / re-layout); never stored in a preset.
- **Session** — the last-used configuration, restored when the UI opens.
- **VisualSet** — the existing visual objects of one target view, captured before a run.

**Counter rule.** *Relations* is a model word. On the view, count **nestings** and
**connections**; never "relations". Internal data-structure names (`parentMap`, `childIds`,
`occurrenceMap`, …) are code-only and never surface in the UI or logs.

The internal→GUI display-label map (e.g. *Relation line* = edge, *Level* = rank) is in the
[Appendix](#display-label-map).

---

## 3. Architecture

Three layers, top to bottom. Each layer talks only to the one below.

```
Layer 1 — Entry points      produce (selection, preset, action), call the API
  • Generate View dialog  — defines selection/layout/styling; live counts; only editor of presets
  • Preset-bound scripts  — headless: load a preset, call the API, exit
Layer 2 — View-generation API   sole orchestrator and sole writer to views
  validate preset → run selection → build layout graph → call engine → write → style
Layer 3 — Engine adapters   one per engine: layout graph in, positions out; nothing else
Shared infrastructure (Layers 1–2): SSOT (algorithms, params, enums, defaults),
  selection module, preset/session persistence.
```

**Boundary 1 — API.** `generateView(selection, preset, action) → view[]`. The selection may
mix model-tree items and canvas objects; the API normalises them. Output is the written or
updated view(s), fully positioned.

**Boundary 2 — Adapter.** `layout(LayoutGraph) → LayoutResult` ([§8](#8-engine-contract)).
Adapters see only the graph — never selections, presets, or views.

**Boundary rules.**
- The entry-points layer is replaceable: any caller producing a valid preset + selection can
  drive the API directly.
- The dialog is the **only** entry point allowed to edit or persist a preset. Preset-bound
  scripts are read-only over presets.
- The API is the **only** writer to views.
- ✦ **Engine-adapter registry.** Adapters self-register under the engine ids they implement;
  the API discovers the adapter for a chosen algorithm through the registry. Adding an engine
  is one registration + one SSOT algorithm entry — no edits to any other module.
- **Strict SSOT/adapter separation.** The SSOT holds only functional definitions (algorithm
  metadata, GUI params, labels, allowed values, defaults). All engine-specific translation
  (option names, unit conversions, flag values) lives only in adapters.

**Module roles** (tech-agnostic): *orchestrator* (the API + writer), *SSOT*, *selection*,
*preset/session I/O*, *appearance* (styling pass), *engine adapters*, and the *GUI dialog*.
✦ The GUI is specified as **per-tab modules** (selection / layout / appearance / preset row),
not one monolith, so each surface is independently testable.

---

## 4. Data model

The conceptual entities and how they relate. Cardinalities use `1`, `0..N`, `1..N`.

| Entity | Relates to | Card. | Notes |
|---|---|---|---|
| **view** | VisualElement | 1 → 0..N | a view holds its placed elements |
| view | VisualRelation | 1 → 0..N | and its drawn relations |
| view | diagram object | 1 → 0..N | canvas-only objects |
| **VisualElement** | element | N → 1 | each placement realises exactly one element |
| **element** | occurrence | 1 → 0..N | one element, many appearances across views (and >1 per view under *show in every container*) |
| **relation** | element (source, target) | N → 2 | directed; source and target are elements |
| **VisualRelation** | relation | N → 1 | draws one relation, as a *nesting* or a *connection* |
| **container** | nested element | 1 → 1..N | containment is **derived** from resolved nestings, never declared |
| **element** | container role | — | an element may be a container in one relation and a child in another (no contradiction) |
| **diagram object** | model concept | N → 0 | realises nothing in the model |
| **Preset** | Step | 1 → 0..N | ordered list, each with its rules; empty = no expansion |
| Preset | rule list | 1 → 6 | filter (elements, diagram objects, relations), nesting, reverse, style; empty filter = all, empty feature list = none |
| Preset | appearance config | 1 → 1 | styling rules, with a master on/off ✦ |
| **VisualSet** | view | 1 → 1 | existing visuals of one target view, captured pre-run |
| **LayoutGraph** | element + nesting + connection | projection | engine-facing view of the object set |

**Closed enumerations** (extending any is a deliberate change): element types and relation
types come from the modelling language; **diagram-object types** are a fixed canvas set. Each
relation type carries a layout weight used by some algorithms.

**Object set.** Selection + filtering + expansion yields one set: `{ elements, relations,
diagramObjects, diagramConnections }` plus, for modify actions, the captured VisualSet.
Relations partition into **nestings** and **connections**; elements partition into
**containers + nested + standalone**; **extra occurrences** are counted separately and never
folded into the element categories.

**Action** is a runtime parameter, never part of a preset (sharing a preset across selections
requires action-agnosticism); headless scripts may name it next to the preset. The concrete
persisted **preset JSON schema** is in the [Appendix](#preset-json-schema).

---

## 5. Actions

Four actions in two groups. The writer is identical for all four; an action differs only in
(a) which objects feed the layout and (b) which view is the target.

| Group | Action | Object set | Target view | VisualSet at start |
|---|---|---|---|---|
| **Create new view** | `NEW_VIEW` | full selection, expanded through filter + steps | a fresh view in the preset's folder/name (overwrites by name) | empty |
| | `ONE_EACH` | each selected element, run independently | one fresh view per element, named after the element (plus an optional preset suffix) | empty |
| **Modify selected view** | `EXPAND_VIEW` | selection drives expansion; unselected visuals stay put | the selected view, in place | captured |
| | `LAYOUT_ONLY` | the view's current contents only — no expansion | the selected view | captured |

A model-tree selection can only drive the Create group (nothing identifies a target view). A
canvas/whole-view selection can drive either group: Create clones it into a fresh view;
Modify acts in place.

**The single writer rule** (action-agnostic, no per-action branch): *for each result object —
if a counterpart exists in the VisualSet, **reposition** it (appearance preserved, parenthood
re-derived from current nesting); otherwise **create** it with default appearance.* Same for
relations: existing → rewrite bendpoints; new → create. A view's contents are overwritten only
by `NEW_VIEW` onto a matching name; Modify actions never copy, rename or replace a view, nor
delete existing visuals — the preset's view name and folder apply to new views only.

---

## 6. Selection

**What a selection may contain.** Any mix of: model-tree items (folders — recursed into their
contents; elements; relations) and canvas objects (VisualElements, VisualRelations, diagram
objects, or a whole view — which yields the view's complete contents, split into model
concepts and diagram objects). Mixed selections are valid and normalise into one object set.

**Filtering.** A global filter narrows what is included, in three independent rule lists:
elements (type, optionally a property value), diagram-object types, and relations (source
type, relation type, target type — the relations drawn between the selected elements).
Filtering is **visibility-only**: hiding an element never alters the nesting structure between
surviving elements. An empty list includes everything.

**Related-elements steps build on each other.** Beyond the filtered base, the user adds an
ordered list of expansion steps. **Each step expands outward from the previous step's
additions only** — not from the whole accumulated set — so a sequence reads as "from these,
reach those; from *those*, reach the next". A step rule reads from that set: *previous-step
type → direction (outgoing / incoming / either) → added relation type → added element type*,
plus an optional property value; it shows what it reaches. Followed relations are drawn; the
added type and property only decide which elements join. **Repeat** runs the step 1–5 times or
*until nothing new* (at most 10 runs), each run from the previous run's additions. An **empty
step ends the chain**.

**A wider filter never yields less.** An extra Include rule can only keep or grow what a step
adds; an extra Exclude rule can only shrink it — there are no hidden exceptions. A rule that
names an unknown type is rejected with a message, never widened to *All*.

**Modify actions are conservative.** `LAYOUT_ONLY` ignores the steps entirely and never adds
a missing relation — it only re-lays-out what is already on the view. `EXPAND_VIEW` expands
but leaves every unselected visual in place. Neither applies the element-type filter, so a
re-layout can never strip element types that are already drawn.

**Live counts are a promise, not an estimate** ✦ in spirit. The dialog's predicted counts are
produced by the *same* selection logic the API runs, so what the counters show is exactly what
the action will write: the displayed totals and the on-view result agree object-for-object.

---

## 7. Layout options

Layout decides *how* objects are positioned. Options are grouped in the order of deciding —
structure (relations, containers) first, then flow, elements, connections and view size.
Per-algorithm support is in the [capability matrix](#capability-matrix): an option the chosen
algorithm does not use is shown disabled, its value preserved but ignored, and each group
names the options it cannot use (*"Not used by …"*). Every option has one label, one
explanation and a "used by" list, all from the SSOT.

**Algorithm styles.** Algorithms are grouped by the insight they give, all visible at once:
**Flow** (directional flows, process chains), **Hierarchy** (decomposition, breakdown
structures), **Network** (connectivity, clustering, impact), **Compact** (portfolios,
catalogues) and **Circular** (cycles, hub-and-spoke).

**Relations — nesting and reversal.** Relations matching a **nesting** rule are drawn as
containment: the child element sits **inside** its parent's box (box-in-box). This makes the
view express **hierarchy and ownership directly**, and — because containment removes the line —
makes **double relations and unexpected structure** easy to spot. A rule's source and target
types restrict which elements may be a container (e.g. source *Grouping*); an optional
property condition — on the relation, its source or its target — narrows a rule further. Relations matching a
**reverse** rule are flipped: the flow lays them out from target to source, a nested one has
its target as parent; model relation and arrows stay unchanged. Each rule counts the relations
it hits and how many become a nesting; the dialog says why the others are drawn as a line.

**Containers** (active once a nesting type is chosen):
- **Layout inside** — the algorithm used to arrange children *inside* each container.
- **Connections between vs. crossing containers** — *between*: each container is laid out on
  its own and connections enter at its border; *crossing*: the whole hierarchy is one layout
  and connections run straight to the inner element. Crossing is unavailable — and *between*
  is used — when the inner layout is a packing layout or a view size is set (unconnected
  elements would stack in one column).
- **Padding** — space between a container's border and its contents.
- **Show in every container** — an element that is a child in several nestings is drawn inside
  each (extra occurrences) instead of only the first. ✦ Algorithms that do not draw containment
  still draw it once, though the counters report the extra occurrences — not a bug.
- **Sort containers**, **same width per level** and **snap columns to grid** — refinements that
  order containers, make nested frames telescope cleanly and align columns view-wide. They are
  **position/size-by-derivation only** and never scale a leaf (see [§8](#8-engine-contract)).

**Consequences (not separate controls).** For a nesting relation the **source is the parent**,
the **target the child** (swapped if the type is also reversed). Container-ness is **derived**:
an element is a container exactly when something resolves to be its child. When several
nestings claim the same child, the first wins unless *show in every container* is on.

**Flow.** A main direction (for algorithms where direction drives ranking); how cycles are
broken and elements assigned to layers (for the simple ranked algorithm); where elements sit
within a layer; and the gap between layers (between rings for radial layouts).

**Elements.** Fixed width and height — or size **by label**, wrapping long labels at a chosen
width; and the minimum **gap** between elements, also between unconnected groups.

**Connections.** Line routing (orthogonal / polyline / straight / curved), label position,
reserved space for labels, the distance between parallel connections (elements grow to fit
their connections) and the clearance between a connection and the elements it passes.

**View size.** *Free* (default), an **aspect ratio**, or a **max width** — at most one at a
time. A target is met by **arranging elements differently** (e.g. more rows), never by
scaling (see the no-scaling rule). An engine that can only widen a layout offers no max width.

**Preset-only options** with no or minimal effect on the view (e.g. the canvas margin) have
no control; a preset can still set them, and a non-default value is logged.

---

## 8. Engine contract

An engine is an opaque function behind one normalised interface, `layout(LayoutGraph) →
LayoutResult`. Adapters self-register ([§3](#3-architecture)).

**LayoutGraph (in).**
- **nodes** — id, label, element type, and either fixed width/height (leaves) or no size
  (containers — the engine sizes them from children); plus an optional parent id for nesting.
- **edges** — id, source, target (already swapped for reversed types), label, weight. Nestings
  are expressed via the parent id on the child node, never as edges.
- **options** — algorithm-specific parameters the adapter translates from the preset.
- **constraints** — at most one of maxWidth / aspectRatio is non-zero.
- **flags** — width-alignment, container sorting.

**LayoutResult (out).**
- **nodes** — same ids, with **absolute** x/y/width/height and a parent id (the orchestrator
  converts to parent-relative at write time).
- **edges** — same ids, with **absolute** bendpoints, a straight-line flag, and an optional
  label position.
- **viewWidth / viewHeight** — the natural bounding box.

Element labels are intrinsic to nodes; the result carries no separate label coordinates.

**Reversed edges.** For reversed relation types the graph swaps source/target so the engine
ranks them the other way. No flag travels with the edge; the writer draws the original model
relation and lets it keep its model direction.

**Self-loops** ✦. Each algorithm declares a self-loop capability: **none** — self-loop edges
are excluded from the graph and not drawn (and removed on re-layout); **native** — the engine
routes them; **partial** — the engine tries, and the writer synthesises a small corner loop on
failure. This is a first-class capability, not an afterthought.

**View-size constraints.** The adapter receives only the active constraint; the others are
zeroed. ✦ Behaviour is stated once per engine in the [Appendix table](#per-engine-view-size),
removing the previous contradiction between the capability matrix and engine behaviour.

**No post-layout scaling** (foundational, no exceptions). Leaf sizes equal the input
width/height; containers are sized by the engine from their children. No adapter may multiply
the result by any factor or scale the set after `layout()` returns. **Position spread**
(moving node centres outward, sizes frozen) is the *only* permitted post-layout adjustment;
compression is forbidden. Width-alignment is a *pre*-layout adjustment between two sizing
passes, so it is not an exception to this rule.

**Adapter obligations.** Honour every option active for the chosen algorithm and ignore the
rest; translate values to native form; apply size constraints without scaling; return absolute
coordinates; never read or write a view.

---

## 9. UX — Generate View dialog

The dialog defines a selection + layout + styling, previews the result live, and runs an
action. It is the only surface that edits presets. (Full mockup in the
[Appendix](#dialog-mockup).)

**Preset row.** Picking a preset (also from nested folders) **loads all its settings** at once
and discards unsaved edits; its description shows below. `*` marks settings that differ from
the saved preset, also a restored session. **Save** overwrites; **Save As…** and **Rename…**
(name, folder, description) ask before overwriting another preset; **Delete** confirms first.
**Default** always exists and cannot be renamed or deleted. The last-used configuration and
UI state are restored on open; this session is user-local, never shared as a preset.

**Tabs.** Three tabs, each owning one concern ✦ (separate modules):
- **Selection** — the live counts (selected → containing; per filter rule, per step), the
  global filter, and the ordered steps. Every rule list is a table with one rule per row. Each
  step shows what it adds, per rule and in total, with collapse / reorder / remove controls. On
  preset load, all steps start expanded.
- **Layout** — the algorithm radio table (all styles always visible), then the groups of
  [§7](#7-layout-options). Options unsupported by the chosen algorithm are disabled, their
  values kept, and named in the group's hint line.
- **Appearance** — the five styling groups ([§10](#10-colouring--appearance)), with a master
  on/off ✦.
- **Properties** — key/value properties written to each generated view.

**Totals and actions.** Below the tabs, an always-visible line shows the predicted on-view
totals. Two equal action groups follow: **Create new view** (folder, name; *New view*, *One
view each*) — always enabled; and **Modify selected view** (the target view's name; *Expand
view*, *Layout only*) — enabled only when the selection identifies a view, otherwise saying
what to select. Folder and name belong to the Create group only. **Cancel** sits below,
bottom right, and preserves UI state.

**Interaction rules.** Switching presets discards unsaved changes without a confirm dialog
(the `*` marker is the warning). Spinner recomputes fire on
value-commit (arrow click / focus loss), not per keystroke, because relation traversal for live
counts is costly. An empty selection opens normally and runs (producing an empty view); a
malformed preset never aborts the dialog — it falls back to defaults.

---

## 10. Colouring — Appearance

A **post-write styling pass** that sets fill colours, fonts, and line widths. It runs **after**
positioning and **never moves or resizes** anything, so it is exempt from the no-scaling rule.

✦ **Master toggle.** One *Apply styling* switch enables or skips the whole pass, and persists
in the preset (`appearance.enabled`). When off, no element appearance is touched, whatever the
individual group settings. When on, styling applies across all four actions; on re-layout /
expand it replaces prior styling overrides.

Three groups, applied in this precedence (later wins on the same object): **nesting level →
highlight repeated → style by property**.
- **Style by property** — style rules, applied in order: what gets the colour (an element by
  its own property, a relation, or the source / target element of a matching relation), whose
  property gives the value, and a colour scale. Several different values on one object give a
  *mixed values* colour; styled relations may take a fixed line width. Two rules on one object
  are flagged in the dialog; the last wins.
- **Style by nesting level** — vary container font size and fill colour by nesting depth, but
  only along an unbroken **same-type chain** from each root container; a different-type
  container breaks the chain for itself and its descendants. Active only when nesting types are
  configured.
- **Highlight repeated** — give each element that appears more than once on the view its own
  colour (needs *show in every container*).

---

## 11. Rules & invariants

System-wide, grouped by theme. Code reviews enforce them.

**Layout integrity.**
1. **No post-layout scaling** — result leaf sizes equal input sizes; containers sized by the
   engine; no post-layout multiply. (Foundational.)
2. **Position spread only** — outward centre-spread (sizes frozen) is the sole post-layout
   adjustment; compression forbidden.
3. **Parent-relative coordinates** — a nested visual's bounds are relative to its parent; the
   orchestrator converts from the engine's absolute output.
4. **Parent-first writing** — every node is written after its parent, so parent-relative
   conversion and draw order hold under any engine output order.

**Engine isolation.**
5. **Adapters never touch a view** — they operate only on LayoutGraph / LayoutResult.
6. **Layout-graph-only boundary** — adapters never see selections, presets, or views.
7. **Container-ness is derived** — a node is a container iff something is its child; never a
   flag or type check.
8. **Relations are never modified** — edge reversal is a traversal concern only.

**Writer discipline.**
9. **One action-agnostic writer** — exists → reposition; else → create; same for relations.
   No per-action branch.
10. **No silent data loss** — overwrite only when an action explicitly says so; Modify never
    deletes visuals as a naming side effect.
11. **Appearance preservation** — repositioning a visual never changes its appearance
    properties; the system relies on this for expand/re-layout.

**Determinism & validation.**
12. **Determinism** — same inputs → same view, always; no reliance on hash-iteration order.
13. **Total validation** — every preset entering the orchestrator is validated: unknown keys
    handled, missing keys defaulted, option values checked against the algorithm.
14. **Capability masking** — values for options inactive on the chosen algorithm are ignored
    at runtime; a non-empty inactive value reaching runtime is a defect and is logged.

**Vocabulary & naming.**
15. **One canonical vocabulary** — one name per concept across UI, logs, and code.
16. **Rename integrally** — a renamed key/label/string is updated everywhere in one change; no
    dual-readers or compatibility shims for in-repo data.

---

## 12. Resilience & error model ✦

Previously implicit; specified here as a contract.

- **Engine failure.** If an adapter throws or returns an unusable result, the run aborts
  cleanly with a logged reason; **no partial view is written**. Where an algorithm is known to
  fail on certain graph shapes, the adapter pre-conditions the graph (e.g. cycle/forest
  pre-processing) rather than letting the engine crash.
- **Target resolution failure.** If a Modify action cannot identify its view, or a Create
  action cannot create/locate its folder, the run aborts with a message; nothing is written.
- **Empty / invalid selection.** A run proceeds and produces an empty (or unchanged) view; this
  is not an error.
- **Invalid preset.** Validation repairs it to defaults; the run never aborts on preset shape.
- **Partial results.** Edges the engine dropped have any stale routing cleared; surplus
  existing visuals with no result counterpart are left untouched, never deleted, and the count
  is logged.

---

## 13. Verification & acceptance ✦

The system's invariants are directly testable; a rebuild is accepted when these hold.

- **Count promise** — the dialog's predicted totals equal the on-view result, object-for-object
  (`filtered base + Σ step adds = total`, for both elements and relations).
- **Determinism** — re-running the same selection + preset + model produces an identical view.
- **Preset round-trip** — write-then-read a preset yields the same configuration; unknown keys
  do not survive; defaults fill gaps.
- **Appearance preservation** — repositioning a styled visual leaves its colours/fonts/sizes
  unchanged.
- **Parent-relative coordinates** — a nested visual's stored bounds are relative to its parent.
- **No scaling** — output leaf sizes equal the configured element width/height exactly.
- **Scale budget** — define and test a target model size (element/relation counts) and a live-
  counter latency budget; the live counter must stay responsive at that target.

---

## 14. Development rules

- **SSOT/adapter separation.** Functional metadata (algorithms, params, labels, allowed values,
  defaults) lives in the SSOT; all engine-specific translation lives in adapters. Adding an
  algorithm = one SSOT entry + one adapter mapping; adding an engine = one registration.
- **Schema migration.** Every preset carries a `schemaVersion`. An older shape is migrated by an
  explicit, documented one-shot migration; loading an unmigrated preset is refused with a
  message, never silently reinterpreted. New configuration keys are added to the defaults in
  the same change that introduces them, or they are dropped by validation.
- **Vocabulary.** Follow rules 15–16; the [Vocabulary](#2-vocabulary) section is authoritative.
- **Logging.** Console output mirrors the orchestration phases as named steps (validate →
  selection → target → layout graph → layout → write), each with a consistent, column-stable
  count block so prediction and result can be compared at a glance.
- **Rule layering.** Rules apply global → repo → skill → subsystem, **narrowest wins**. This
  spec is the subsystem authority for the View system.

---

## Appendix

Not part of the ≤500-line body. Reference tables, the dialog mockup, the concrete preset
schema, the current realisation, and the delta from today.

### Display-label map

Internal names never appear in UI labels; tooltips may use them parenthetically.

| GUI label | Internal | GUI label | Internal |
|---|---|---|---|
| Routing | edge routing | Distance | node spacing |
| Label | edge label position | Layer distance | layer spacing |
| Nesting | nesting rules | Between | edge-edge / port spacing |
| Reverse | reverse rules | Distance to element | edge-node spacing |
| Layout inside | container algorithm | Padding | container padding |
| Same width per level | alignWidthSameType | Placement | node placement |
| Cycles | acyclicer | Ranking | ranker |
| View size › Free | no size constraint | Wrap label at | label max line width |
| Layout only | re-layout | One view each | per element |

### Dialog mockup

```
┌─ Generate View ────────────────────────────────────────────────────────────┐
│ Preset: [Application Flow LR  ▼] *  [Save] [Save As…] │ [Rename…] [Delete] │
│         Views of application flows, left to right             (description) │
│ ┌─[Selection]──[Layout]──[Appearance]──[Properties]─────────────────────┐  │
│ │  Current selection                                                    │  │
│ │    Selected: 3 elements, 2 relations, 1 view   First: Actor: Customer │  │
│ │    Containing: 12 elements, 8 relations                               │  │
│ │  Filter by element type   Mode | Element type          [+ Add rule] │  │
│ │  Filter by diagram type   Mode | Diagram type          [+ Add rule] │  │
│ │  Filter by relations      Mode | Source | Relation | Target  [+ …]  │  │
│ │  Expand selection                                                     │  │
│ │   ┌ ▾ Step 1 · Adds: 4 elements · 3 relations        [↑][↓]   [✕] ┐  │  │
│ │   │ Mode | Previous step | Direction | Added relations | Added …  │  │  │
│ │   │ [+ Add rule]  ☐ Property condition   Repeat [1× ▼]            │  │  │
│ │   └────────────────────────────────────────────────────────────────┘  │  │
│ │   [+ Add step]                                                        │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ On the generated view:  elements: 18 containers · 92 nested elements       │
│                         relations: 11 nestings · 98 connections            │
│ ┌ Create new view ──────────────────┐ ┌ Modify selected view ───────────┐  │
│ │ Folder [/_Generated]  Name [____] │ │ View: Customer journey          │  │
│ │ [New view]     [One view each]    │ │ [Expand view]   [Layout only]   │  │
│ └───────────────────────────────────┘ └─────────────────────────────────┘  │
│                                                                  [Cancel]  │
└────────────────────────────────────────────────────────────────────────────┘
```

Layout tab groups: *Algorithm* (style-grouped radio table), *Nesting* (nesting rules),
*Reverse* (reverse rules), *Containers* (layout inside, between/crossing, padding,
sort, show in every container, same width per level, snap columns), *Flow* (direction, cycles,
ranking, placement, layer gap), *Elements* (width, height, by label + wrap at, gap),
*Connections* (routing, label, reserve label space, between, to element), *View size* (free /
aspect ratio / max width). Each group ends with a grey "Not used by …" hint.
Appearance tab groups: *Style by property* (style rules), *Style by nesting level*, *Highlight
repeated elements*, plus the master toggle.

### Preset JSON schema

Persisted keys (GUI labels in comments). `appearance.enabled` is new ✦.

```
Preset {
  schemaVersion : 2                         // migration anchor
  name          : string
  algorithm     : enum                       // Layout style
  params {
    direction, routing, labelPosition, ranking, acyclicer, nodePlacement  // gated by algorithm
    nestingRules : RelationRule[]                    // Nesting; [] = none
    reverseRules : RelationRule[]                    // Reverse; [] = none
    containerAlgorithm   : "Layered"|"Grid"|"Pack"   // Layout inside
    connectionsMode      : "Crossing containers"|"Between containers"
    elementWidth, elementHeight, elementSpacing, layerSpacing,
    connectionSpacing, connectionElementSpacing, padding, labelMaxLineWidth : number
    diagramPadding : number                          // preset-only (no dialog control)
    maxWidth, aspectRatio : number                   // 0 = unconstrained
    viewSizeMode : "none"|"maxWidth"|"aspectRatio"   // "none" = Free
    sortContainers, alignWidthSameType, snapColumnsToGrid,
    showInEveryContainer, labelSizing, connectionLabelSpacing : boolean
  }
  filter { elementRules:ElementRule[], diagramRules:DiagramRule[], relationRules:RelationRule[] }  // [] = all
  relatedElements { steps : Step[] }               // ordered chain
  view { name, folder, suffix : string }           // Create actions only; suffix: One view each
  description : string                             // shown under the preset combo
  appearance {
    enabled : boolean                              // ✦ master styling on/off
    styleByProperty { rules:StyleRule[], mixedValuesColor:hex, lineWidth:0..3 }
    nestingLevel { font*, color*, rootColor, lightenPerLevel, … }
    highlightRepeated { enabled, colorRange }
  }
  engineParams : { ELK?{…}, Dagre?{…}, Graphviz?{…}, layout?{…} }  // ✦ typed overrides
}
Step         { repeat:1..5|"untilNothingNew", rules:StepRule[] }        // [] = follow all
ElementRule  { mode, elementType, property, value }
DiagramRule  { mode, diagramType }
RelationRule { on, mode, source, relation, target,
               propertyOf:"relation"|"source"|"target", property, value }
StepRule     { mode, previous, direction:"either"|"outgoing"|"incoming", relation, added,
               propertyOf:"added"|"relation"|"previous", property, value }
StyleRule    { on, color:"element"|"relation"|"source"|"target", source, relation, target,
               propertyOf:"element"|"relation"|"source"|"target", property, colorRange }
```

**Rule fields.** `mode` is `"include"` (default) or `"exclude"`; a type field holds a type id or
`""` (= All); `on` defaults to true. Files omit fields at their default and write one rule per
line, so a step with many rules stays readable and a diff shows one changed rule as one line.

### Capability matrix

Derived from each algorithm's active-parameter list — never hand-maintained (today generated
into ARCHITECTURE.md by `tools/gen_docs_tables.js`). The matrix maps
algorithm → { style, nesting capability (full/partial/cluster/none), self-loop capability
(native/partial/none), active params, allowed select-values }. An option absent from an
algorithm's active set is disabled in the UI and ignored at runtime. The authoritative rows for
the current engines are generated from the SSOT registry; a rebuild reproduces the matrix from
its own registry rather than copying a static table.

### Per-engine view-size

| Engine | max width | aspect ratio |
|---|---|---|
| Layered-family (ranked) and packing | upper bound, met by re-arranging (more rows); when unreachable (connection chains or the widest container set the width) the narrowest layout is used and this is reported | met approximately by re-arranging |
| Force / stress / radial | not supported | met approximately by re-arranging |
| Cluster engines (dot family) | not supported — they can only widen a layout without scaling | passed as a ratio hint |
| Simple ranked (no area) | not supported | not supported |

Engines meet a target by arranging elements differently, never by coordinate scaling. A
target that cannot be met is reported, not forced.

### Current realisation

- **Runtime:** a JavaScript script for the Archi modelling tool (jArchi 1.12 / GraalVM JS),
  SWT/GTK dialog.
- **Engines:** ELK (Layered, Tree, Force, Stress, Radial, Grid, Pack), Dagre (Dagre), Graphviz
  (Dot, Twopi, Neato, FDP, SFDP, Circo).
- **File map (target):** `lib/generate_view.js` (orchestrator + writer), `lib/defs.js` (SSOT),
  `lib/selection_pipeline.js`, `lib/preset_io.js`, `lib/appearance.js`, `lib/engines/*`
  (registered adapters), `lib/gui/*` (per-tab dialog modules), headless `_*.ajs` entry scripts,
  `user_parameter/**/*.json` presets + `_session.json`, `lib/run_preset.js` (filename-driven
  shortcut scripts), `tools/` (registry check, docs-table generator).

### Delta — spec vs current implementation

Deliberate departures a rebuild adopts:

1. **Explicit migration** also replaces silent unknown-key stripping and view-size-mode
   inference.
2. **Self-loop handling is a first-class contract** (vocabulary, capability, writer rule).
3. **`engineParams` promoted** from a hidden bag to a typed, per-engine override block in the
   schema.
4. **Engine-adapter registry** makes adapter discovery structural, not convention.
5. **GUI specified as per-tab modules** instead of one monolithic dialog file.
6. **Master Appearance on/off** (`appearance.enabled`) replaces "no-op only when every feature
   is individually off".
7. **Error/resilience model** and **verification/acceptance contract** are newly specified.

Already realised: `schemaVersion` with an offline migration (rule lists, version 2); the
capability matrix is derived from the registry; `Step.diagramTypes` is removed; one reconciled per-engine view-size table; control labels, tooltips and "used by"
lists come from one canonical SSOT set.
