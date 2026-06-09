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
- **Step** — one ordered related-elements expansion rule inside a preset.
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
| **Preset** | Step | 1 → 0..N | ordered list; an empty list = no expansion |
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
requires action-agnosticism). The concrete persisted **preset JSON schema** is in the
[Appendix](#preset-json-schema); ✦ `Step.diagramTypes` is removed (it never traversed).

---

## 5. Actions

Four actions in two groups. The writer is identical for all four; an action differs only in
(a) which objects feed the layout and (b) which view is the target.

| Group | Action | Object set | Target view | VisualSet at start |
|---|---|---|---|---|
| **Create new view** | `NEW_VIEW` | full selection, expanded through filter + steps | a fresh view in the preset's folder/name (overwrites by name) | empty |
| | `ONE_EACH` | each selected element, run independently | one fresh view per element, named after the element | empty |
| **Modify selected view** | `EXPAND_VIEW` | selection drives expansion; unselected visuals stay put | the selected view (or a copy at the preset name, if set) | captured |
| | `LAYOUT_ONLY` | the view's current contents only — no expansion | the selected view | captured |

A model-tree selection can only drive the Create group (nothing identifies a target view). A
canvas/whole-view selection can drive either group: Create clones it into a fresh view;
Modify acts in place.

**The single writer rule** (action-agnostic, no per-action branch): *for each result object —
if a counterpart exists in the VisualSet, **reposition** it (appearance preserved, parenthood
re-derived from current nesting); otherwise **create** it with default appearance.* Same for
relations: existing → rewrite bendpoints; new → create. The system may overwrite a view's
contents only when an action explicitly says so (`NEW_VIEW` onto a matching name); Modify
actions never delete existing visuals as a side effect.

---

## 6. Selection

**What a selection may contain.** Any mix of: model-tree items (folders — recursed into their
contents; elements; relations) and canvas objects (VisualElements, VisualRelations, diagram
objects, or a whole view — which yields the view's complete contents, split into model
concepts and diagram objects). Mixed selections are valid and normalise into one object set.

**Filtering.** A global filter narrows what is included, in three independent parts: element
types, relation types (each with independent incoming/outgoing direction toggles), and
diagram-object types. Filtering is **visibility-only**: hiding an element never alters the
nesting structure between elements that survive the filter. An empty filter includes
everything; for a relation type, "neither direction selected" means *follow all directions*.

**Related-elements steps build on each other.** Beyond the filtered base, the user adds an
ordered list of expansion steps. **Each step expands outward from the previous step's
additions only** — not from the whole accumulated set — so a sequence reads as "from these,
reach those; from *those*, reach the next". A step specifies which relation types to follow
(direction-aware), how many hops, and an element-type filter that prunes only what that step
adds. An **empty step ends the chain**: every later step then adds nothing.

**Modify actions are conservative.** `LAYOUT_ONLY` ignores the steps entirely and never adds
a missing relation — it only re-lays-out what is already on the view. `EXPAND_VIEW` expands
but leaves every unselected visual in place. Neither applies the element-type filter, so a
re-layout can never strip element types that are already drawn.

**Live counts are a promise, not an estimate** ✦ in spirit. The dialog's predicted counts are
produced by the *same* selection logic the API runs, so what the counters show is exactly what
the action will write: the displayed totals and the on-view result agree object-for-object.

---

## 7. Layout options

Layout decides *how* objects are positioned. Options are grouped; per-algorithm support is in
the [capability matrix](#capability-matrix) (an option not supported by the chosen algorithm
is shown disabled, its value preserved but ignored).

**Algorithm styles.** Algorithms are grouped by the kind of insight they give, all visible at
once:
- **Flow** — directional flows, dependencies, process chains.
- **Hierarchy** — decomposition, containment, org/breakdown structures.
- **Network** — interconnected elements with no strict hierarchy; clustering, impact.
- **Compact** — overview/grouping with space efficiency; portfolios, catalogues.
- **Circular** — cyclic, hub-centred, concentric relationships.

**Element size & spacing.** Fixed element width/height; minimum spacing between elements; and,
for ranked layouts, spacing between levels.

**Direction & reversed relations.** A main flow direction (for algorithms where direction
drives ranking). **Reversed relation types** have their source/target swapped *for layout
traversal only*; the model relation is never modified, and the drawing keeps its intrinsic
model direction.

**Connections.** Line routing (orthogonal / polyline / straight / curved), label position, and
ranking strategy — each honoured only by the algorithms that support it.

**Nesting — what it adds.** Selecting one or more relation types as *nesting types* changes how
those relations are drawn: instead of lines, the child element is drawn **inside** the parent's
box (box-in-box). This makes the view express **hierarchy and ownership directly**, and —
because containment removes the line — it makes **double relations and unexpected structure**
easy to spot. Nesting unlocks further controls:
- **Container inner layout** — the algorithm used to arrange children *inside* each container.
- **Connections between vs. crossing containers** — whether cross-container lines route to the
  container as an opaque box, or to the specific inner element.
- **Show in every container** — when an element is a child in several nestings, draw it inside
  each (extra occurrences) instead of only the first. ✦ On algorithms that do not draw
  containment, the element is still drawn once even though the counters report the extra
  occurrences; the spec states this explicitly so the count is never read as a bug.
- **Width alignment by level** and **column snapping** — refinements that make nested frames
  telescope cleanly and align leaf columns view-wide. Both are **position/size-by-derivation
  only** and never scale a leaf (see [§8](#8-engine-contract)).

**Consequences (not separate controls).** For a nesting relation the **source is the parent**,
the **target the child** (swapped if the type is also reversed). Container-ness is **derived**:
an element is a container exactly when something resolves to be its child. When several
nestings claim the same child, the first wins unless *show in every container* is on.

**View dimensions.** At most one size hint is active at a time — max width, max height, or
aspect ratio. A hint may only **spread positions outward** to fill a target, never scale or
compress (see the no-scaling rule).

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
- **constraints** — at most one of maxWidth / maxHeight / aspectRatio is non-zero.
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

**Preset row.** A combo lists saved presets; selecting one **applies it immediately** (no
Apply button) and silently discards unsaved edits to the previous one. A modified marker
(`*`) appears whenever the live settings differ from the loaded preset. **Save** overwrites
silently; **Save As…** captures name/folder/description into a new preset. **Delete** removes
the selected preset after confirmation. A **Default** preset always exists and cannot be
deleted. **Session continuity:** on open, the last-used configuration — including UI-only state
like the active tab and which steps are collapsed — is restored; session state is user-local
and never shared as a preset.

**Tabs.** Three tabs, each owning one concern ✦ (separate modules):
- **Selection** — the live counts (selected → containing → filtered → per-step adds), the
  global filter, and the ordered related-elements steps. Each step shows what it adds, with
  reorder / collapse / remove controls and per-relation **incoming/outgoing** toggles. On
  preset load, steps after the first start collapsed.
- **Layout** — the algorithm radio table (all styles always visible), size/spacing, direction
  + reversed types, connections, nesting + its inner-container controls, and the view-dimension
  hint. Options unsupported by the chosen algorithm are disabled, their values kept.
- **Appearance** — the five styling groups ([§10](#10-colouring--appearance)), with a master
  on/off ✦.

**Control labels** ✦ are reconciled to one canonical set (e.g. the related-elements group and
its help text are named consistently in UI, logs, and this spec).

**Generated view + action row.** A *Generated view* group (folder, name) carries an
always-visible `Output:` strip with the predicted on-view totals. The action row has **Cancel**
(always enabled, preserves UI state), the **Create new view** group (always enabled), and the
**Modify selected view** group (enabled only when the selection identifies a view). The default
button is *New view* when no view is identified, *Layout only* when one is.

**Interaction rules.** Preset selection auto-applies. Switching presets discards unsaved
changes without a confirm dialog (the `*` marker is the warning). Spinner recomputes fire on
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

Five rules, applied in this precedence (later wins on the same element): **nesting level →
highlight repeated → style by property → style by related property → style by connected
element**.
- **Style by property** — colour elements (or relations) by a named property value, evenly
  mapped onto a chosen colour scale; relations may also take a fixed line width.
- **Style by related property** — colour an element by a property read from its connected
  relations (matched by type + direction).
- **Style by connected element** — colour an element by a property of the elements it connects
  to; a configurable conflict colour applies when several matching targets disagree.
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
- **Schema migration** ✦. Every preset carries a `schemaVersion`. Loading an older version runs
  an explicit, documented migration to the current shape; there are no silent inference
  fallbacks. New configuration keys are added to the defaults in the same change that
  introduces them, or they are dropped by validation.
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
| Relation line | edge | Element spacing | node spacing |
| Relation line style | edge routing | Level spacing | layer spacing |
| View / Diagram | graph | Relation levels | depth / hops |
| Layout style | algorithm / engine | Layer ranking | ranker |
| Level | rank / layer | Tight packing / Pack | rectpacking |
| Flow direction | direction | Preset | parameter / config file |
| Element alignment | node placement | One view each | per element |
| Re-layout | layout only | Align width by level | alignWidthSameType |

### Dialog mockup

```
┌─ Generate View ────────────────────────────────────────────────────────────┐
│ [Delete]  Preset: [Application Flow LR *  ▼]  [Save]  [Save As…]            │
│ ┌─[Selection]──[Layout]──[Appearance]───────────────────────────────────┐  │
│ │  Current selection                                                    │  │
│ │    Selected: 3 elements, 2 relations, 1 view   First: Actor: Customer │  │
│ │    Containing: 12 elements, 8 relations                               │  │
│ │    Filtered:   9 elements, 6 relations                                │  │
│ │  Filter element types  [search] [chips]                               │  │
│ │  Filter relation types  access ○← ○→  aggregation ○← ○→  …            │  │
│ │  Filter diagram types   ○ group  ○ note  ○ image  ○ legend            │  │
│ │  Expand selection                       [+ Add related elements]      │  │
│ │   ┌ Step 1   Added: 4 elements, 3 relations   [▲][▼][▾][✕] ┐         │  │
│ │   │  access ○← ○→  …   Element types [chips]   Levels [1 ▲▼]│         │  │
│ │   └──────────────────────────────────────────────────────┘          │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Generated view ──────────────────────────────────────────────────────┐  │
│ │  Folder: [/View/_Generated]   Name: [Customer view]                   │  │
│ │  Output:  elements: 18 containers · 92 nested                         │  │
│ │           relations: 11 nestings · 98 connections                     │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ [Cancel]   ┌ Create new view ────────────┐  ┌ Modify selected view ──┐     │
│            │ [New view] [One view each]  │  │ [Expand] [Layout only] │     │
│            └─────────────────────────────┘  └────────────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Layout tab groups: *Algorithm* (style-grouped radio table), *Element size and spacing*,
*Direction* (+ reversed types), *Connections* (routing / label / ranking), *Nesting* (nesting
types + container inner layout, between/crossing, inner spacing, padding, sort, align width,
snap columns, show in every container), *View dimensions* (none / width / height / aspect).
Appearance tab groups: *Style by property*, *Style by related property*, *Style by connected
element*, *Style by nesting level*, *Highlight repeated elements*, plus the master toggle.

### Preset JSON schema

Persisted keys (GUI labels in comments). `schemaVersion` and `appearance.enabled` are new ✦.

```
Preset {
  schemaVersion : int                       // ✦ explicit migration anchor
  name          : string
  algorithm     : enum                       // Layout style
  params {
    direction, routing, labelPosition, ranking      // gated by algorithm
    reverseRelationTypes : RelTypeId[]               // drawn reversed
    nestingRelationTypes : RelTypeId[]               // drawn as nesting
    containerAlgorithm   : "Layered"|"Grid"|"Pack"   // inside containers
    connectionsMode      : "Between containers"|"Crossing containers"
    innerSpacing, padding, layerSpacing, elementSpacing,
    elementWidth, elementHeight, nodeSizeByEdgeCount : number
    maxWidth, maxHeight, aspectRatio : number        // 0 = unconstrained
    viewSizeMode : "none"|"maxWidth"|"maxHeight"|"aspectRatio"
    sortContainers, alignWidthSameType, snapColumnsToGrid,
    showInEveryContainer, labelSizing : boolean
  }
  filter { elementTypes:ElTypeId[], relationTypes:EncRelTypeId[], diagramTypes:DgTypeId[] }
  relatedElements { steps : Step[] }               // ordered chain
  view { name, folder : string }                   // for the Create actions
  appearance {
    enabled : boolean                              // ✦ master styling on/off
    styleByProperty { element{…}, relation{… lineWidth} }
    styleByRelatedProperty { enabled, relTypes, property, colorRange }
    styleByConnectedElement { enabled, relTypes, elementType, property, colorRange, conflictColor }
    nestingLevel { font*, color*, rootColor, darkenPerLevel, … }
    highlightRepeated { enabled, colorRange }
  }
  engineParams : { ELK?{…}, Dagre?{…}, Graphviz?{…}, layout?{…} }  // ✦ typed overrides
}
Step { depth:int≥1, elementTypes:ElTypeId[], relationTypes:EncRelTypeId[] }
```

**Encoded relation-type strings.** `"type"` = both directions; `"type:in"` = incoming only;
`"type:out"` = outgoing only; **absent** = follow all directions for that type.

### Capability matrix

✦ Derived from each algorithm's active-parameter list — never hand-maintained. The matrix maps
algorithm → { style, nesting capability (full/partial/cluster/none), self-loop capability
(native/partial/none), active params, allowed select-values }. An option absent from an
algorithm's active set is disabled in the UI and ignored at runtime. The authoritative rows for
the current engines are generated from the SSOT registry; a rebuild reproduces the matrix from
its own registry rather than copying a static table.

### Per-engine view-size

✦ Single source of truth, contradiction removed.

| Engine | maxWidth / maxHeight | aspectRatio |
|---|---|---|
| Layered-family (ranked) | hard layout bounds — nodes placed within the area, no scaling | not supported |
| Compact / packing | hard bounds where the engine supports an area target | supported as a ratio hint |
| Force / network | position-spread to a minimum target; never compress | supported as a ratio hint |
| Simple ranked (no area) | not supported | not supported |

The previous design disagreed on whether the ranked engine honoured max-height and
aspect-ratio; this table is the reconciled contract — engines either set hard bounds or apply
position-spread, never coordinate scaling.

### Current realisation

- **Runtime:** a JavaScript script for the Archi modelling tool (jArchi 1.12 / GraalVM JS),
  SWT/GTK dialog.
- **Engines:** ELK (Layered, Tree, Force, Stress, Radial, Grid, Pack), Dagre (Dagre), Graphviz
  (Dot, Twopi, Neato, FDP, SFDP, Circo).
- **File map (target):** `lib/generate_view.js` (orchestrator + writer), `lib/defs.js` (SSOT),
  `lib/selection_pipeline.js`, `lib/preset_io.js`, `lib/appearance.js`, `lib/engines/*`
  (registered adapters), `lib/gui/*` (per-tab dialog modules), headless `_*.ajs` entry scripts,
  `user_parameter/*.json` presets + `_session.json`.

### Delta — spec vs current implementation

Deliberate departures a rebuild adopts:

1. **`schemaVersion` + explicit migration** replaces silent unknown-key stripping and
   view-size-mode inference.
2. **Capability matrix derived from `activeParams`**, fixing the omissions (self-loops,
   container algorithm, connections mode, label sizing, node-size-by-edge-count) and the
   ELK max-height / aspect-ratio contradiction.
3. **Self-loop handling is a first-class contract** (vocabulary, capability, writer rule).
4. **`engineParams` promoted** from a hidden bag to a typed, per-engine override block in the
   schema.
5. **`Step.diagramTypes` removed** (dead field — diagram objects never traverse).
6. **One reconciled view-size table** per engine; the matrix-vs-behaviour contradiction is gone.
7. **Engine-adapter registry** makes adapter discovery structural, not convention.
8. **GUI specified as per-tab modules** instead of one monolithic dialog file; control labels
   reconciled to one canonical set.
9. **Master Appearance on/off** (`appearance.enabled`) replaces "no-op only when every feature
   is individually off".
10. **Error/resilience model** and **verification/acceptance contract** are newly specified.
