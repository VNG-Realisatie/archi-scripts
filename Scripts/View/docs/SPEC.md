# View Generation — Rebuild Specification

A single, self-contained specification for rebuilding the View subsystem from scratch.
The body is **implementation-free**: it states *what* the system must do and the contracts
it must honour, never *how* a particular platform realises them. The current realisation
(jArchi / SWT / ELK / Dagre / Graphviz) and all large reference tables live in the
[Appendix](#appendix), which is not part of the ≤550-line readable body.

**Division.** This document is the single *what*; [ARCHITECTURE.md](ARCHITECTURE.md) holds
the design decisions with their reasons (Part A) and the *how* (Part B). On a conflict this
document wins ([Content division](ARCHITECTURE.md#content-division)).

`✦` marks a deliberate improvement over the previous design; every `✦` is itemised in the
[Appendix delta](#delta--spec-vs-current-implementation).

---

## 1. Purpose & scope
<!-- @keep: do not rewrite this section — wording reviewed and signed off -->

### Purpose

Starting with a selection, generate or modify the layout of ArchiMate **views**. The script turns a chosen subset of the model (plus rules for which related elements to include) into a positioned diagram.

### Use cases

- quickly generate a starting point for a new view
- generate multiple context views (one element and its related elements)
- analyse your model by generating different views.
- use nesting to find unexpected relations, see double relations, etc.

### Scope

In scope: generating or modifying views with different layouts; storing and reusing selection and layout configurations (presets); a configuration UI; session continuity.

Out of scope: model authoring beyond what layout implies; editing element properties; exporting to image formats; view diff/merge; real-time collaborative editing.

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
- **occurrence** — a visual appearance of an element on a view. Normally one per view; a
  nesting rule set to *every container* can give an element several.
- **diagram object** — a canvas-only object with no model concept (note, group, image,
  legend, view-reference). Belongs to exactly one view.

**VisualElement roles**
- **container** — drawn as a box around other VisualElements.
- **nested element** — drawn inside a container; not itself a container.
- **standalone** — drawn at view root; contains nothing, contained by nothing.
- **extra occurrence** — the 2nd..Nth appearance of one element under different containers.
  ✦ **Managed** when the system placed it for an *every container* rule — the system may also
  remove it; any other occurrence is **user content**.

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

**Counter rule.** *Relations* is a model word: selection counters (filtered base, step adds)
use it; on the view, count **nestings** and **connections**, never "relations". Internal data-structure names (`parentMap`, `childIds`,
`occurrenceMap`, …) are code-only and never surface in the UI or logs.

The internal→GUI display-label map (e.g. *Relation line* = edge, *Level* = rank) is in the
[Appendix](#display-label-map); the vocabulary in this section is the subsystem's authority.

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
| **element** | occurrence | 1 → 0..N | one element, many appearances across views (and >1 per view under an *every container* rule) |
| **relation** | element (source, target) | N → 2 | directed; source and target are elements |
| **VisualRelation** | relation | N → 1 | draws one relation, as a *nesting* or a *connection* |
| **container** | nested element | 1 → 1..N | containment is **derived** from resolved nestings, never declared |
| **element** | container role | — | an element may be a container in one relation and a child in another (no contradiction) |
| **diagram object** | model concept | N → 0 | realises nothing in the model |
| **Preset** | Step | 1 → 0..N | ordered list, each with its rules; empty = no expansion |
| Preset | rule list | 1 → 6 | filter (elements, diagram objects, relations), nesting, reverse, style; empty filter = all, empty feature list = none |
| Preset | appearance config | 1 → 1 | styling rules, with a master on/off ✦ |
| **VisualSet** | view | 1 → 1 | existing visuals of one target view, captured pre-run |
| **managed-occurrence record** ✦ | view | N → 1 | element + its chain of containers up to the view root; stored on the view, so it survives a view copy |
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
| **Modify selected view** | `EXPAND_VIEW` | elements selected on the view drive expansion; the whole view is laid out | the selected view, in place | captured |
| | `LAYOUT_ONLY` | the view's current contents only — no expansion | the selected view | captured |

A model-tree selection can only drive the Create group (nothing identifies a target view). A
canvas/whole-view selection can drive either group: Create clones it into a fresh view;
Modify acts in place.

**The single writer rule** (action-agnostic, no per-action branch): *for each result object —
if a counterpart exists in the VisualSet, **reposition** it (appearance preserved, parenthood
re-derived from current nesting); otherwise **create** it with default appearance.* Same for
relations: existing → rewrite bendpoints; new → create. A view's contents are overwritten only
by `NEW_VIEW` onto a matching name; Modify actions never copy, rename or replace a view, nor
delete existing visuals — the preset's view name and folder apply to new views only. ✦ The
exceptions: every action reconciles **managed extra occurrences**, and removes the lines of a
relation drawn as nesting ([§7](#7-layout-options)).

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
a missing relation — it only re-lays-out what is already on the view (managed extra
occurrences excepted, [§7](#7-layout-options)). `EXPAND_VIEW` expands
from the elements selected on the view and adds only what the steps reach; the rest of the view
keeps its content. Neither applies the element-type filter, so a
re-layout can never strip element types that are already drawn.

**Live counts are a promise, not an estimate** ✦ in spirit. The dialog's predicted counts are
produced by the *same* selection logic the API runs, so what the counters show is exactly what
the action will write: the displayed totals and the on-view result agree object-for-object.
Details: [run order](#selection-run-order) and [counting rules](#counting-rules).

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
- **Sort containers**, **same width per level** and **snap columns to grid** — refinements that
  order containers, make nested frames telescope cleanly and align columns view-wide. They are
  **position/size-by-derivation only** and never scale a leaf (see [§8](#8-engine-contract)).

**Consequences (not separate controls).** For a nesting relation the **source is the parent**,
the **target the child** (swapped if the type is also reversed). Container-ness is **derived**:
an element is a container exactly when something resolves to be its child.

**Several parents** ✦ — never decided by rule or model order. A nesting rule set to **every
container** places the child in *each* parent it reaches (extra occurrences — e.g. an element
filed under several groupings) and wins when a relation matches several rules. The other
nesting relations of one child give it **at most one** parent — the container it already sits
in, else the first by name; the rest are drawn as connections. Algorithms that do not draw
containment draw each element once, though the counters report the extra occurrences.
A connection whose ends have several occurrences is drawn **once**, between the occurrences
closest together in the container tree; one already on the view keeps its ends. A relation
drawn as nesting is never also drawn as a line: a line of it left from an earlier run is removed.
Nesting relations that together form a **cycle** (A contains B … contains A) are all drawn as
connections: a cycle is nearly always a modelling error, and lines make it visible. The
dialog counts them under *circular*; the log names each cycle.

**Managed extra occurrences** ✦. They follow from the settings, so every action — `LAYOUT_ONLY`
too — reconciles them: missing ones are added and recorded on the view, recorded ones no longer
asked for are removed, and switching back restores them. Only recorded ones are ever removed.
User content takes a parent first and is always laid out, in its current container if the
settings place it nowhere. A managed occurrence becomes user content when it is the element's
last one, the user moved it, or it contains user content. Details: [nesting
reference](#nesting-reference).

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
coordinates; never read or write a view. Field lists: [layout graph and
result](#layout-graph-and-result).

---

## 9. UX — Generate View dialog

The dialog defines a selection + layout + styling, previews the result live, and runs an
action. It is the only surface that edits presets. (Mockups and per-control behaviour:
[dialog reference](#dialog-reference).)

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
  colour (needs a nesting rule set to *every container*).

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
    deletes visuals, except managed extra occurrences the settings no longer ask for and lines
    of relations drawn as nesting ✦.
11. **Appearance preservation** — repositioning a visual never changes its appearance
    properties; the system relies on this for expand/re-layout.

**Determinism & validation.**
12. **Determinism** — same inputs → same view, always; no reliance on hash-iteration order.
13. **Total validation** — every preset entering the orchestrator is validated: unknown keys
    handled, missing keys defaulted, option values checked against the algorithm.
14. **Capability masking** — values for options inactive on the chosen algorithm are ignored
    at runtime; a non-empty inactive value reaching runtime is a defect and is logged.
15. **UI-only state is partitioned** — a preset holds only what affects generation; UI-only
    state (active tab, collapsed steps, …) rides beside it in the session, unseen by the API.

**Vocabulary & naming.**
16. **One canonical vocabulary** — one name per concept across UI, logs, and code.
17. **Rename integrally** — a renamed key/label/string is updated everywhere in one change; no
    dual-readers or compatibility shims for in-repo data.

---

## 12. Resilience & error model ✦

Previously implicit; specified here as a contract.

- **Engine failure.** If an adapter throws or returns an unusable result, the run aborts
  cleanly with a logged reason; **no partial view is written** and an existing view of that name is left as it was (a Create action creates or empties its view only after the layout succeeded). Where an algorithm is known to
  fail on certain graph shapes, the adapter pre-conditions the graph (e.g. cycle/forest
  pre-processing) rather than letting the engine crash.
- **Target resolution failure.** If a Modify action cannot identify its view, or a Create
  action cannot create/locate its folder, the run aborts with a message; nothing is written.
- **Empty / invalid selection.** A run proceeds and produces an empty (or unchanged) view; this
  is not an error.
- **Invalid preset.** Validation repairs it to defaults; the run never aborts on preset shape.
- **Partial results.** Edges the engine dropped have any stale routing cleared; ✦ a nesting
  that cannot be drawn as containment is drawn as a connection, never left as it was.
- **Managed occurrences** ✦. A record that no longer matches the view is dropped. Removing a
  managed occurrence removes connections drawn to it, hand-drawn ones included. A view without
  records (made before this feature) holds only user content.

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
- **Vocabulary.** Follow rules 16–17; the [Vocabulary](#2-vocabulary) section is authoritative.
- **Logging.** Console output mirrors the orchestration phases as named steps (validate →
  selection → layout graph → layout → target → write), each with a consistent, column-stable
  count block so prediction and result can be compared at a glance ([console
  logging](#console-logging)).
- **Rule layering.** Rules apply global → repo → skill → subsystem, **narrowest wins**
  ([scopes](#rule-scopes)). This spec is the subsystem authority for the View system.

---

## Appendix

Not part of the ≤550-line body. The functional reference behind the body — dialog, preset
schema, selection, counting, nesting, layout graph — plus the current realisation and the delta
from today. Persisted keys and engine names may appear here; function and file names stay in
[ARCHITECTURE.md](ARCHITECTURE.md) Part B.

### Display-label map

Internal names never appear in UI labels or button text; tooltips may use them
parenthetically. When the preset schema is described in prose, the GUI labels are used.

| GUI label | Internal | GUI label | Internal |
|---|---|---|---|
| Relation line | edge | Distance | node spacing |
| Routing | edge routing | Layer distance | layer spacing |
| Label | edge label position | Between | edge-edge / port spacing |
| View, diagram | graph | Distance to element | edge-node spacing |
| Layout style | algorithm, engine | Padding | container padding |
| Level | rank, layer | Placement | node placement |
| Direction | direction, orientation | Ranking | ranker |
| Nesting | nesting rules | Cycles | acyclicer |
| Reverse | reverse rules | Pack | rectpacking |
| Layout inside | container algorithm | Wrap label at | label max line width |
| Same width per level | alignWidthSameType | Snap columns to grid | snapColumnsToGrid |
| View size › Free | no size constraint | Repeat | runs, hops |
| Layout only | re-layout | One view each | per element |
| Preset | parameter file, config file | | |

### Dialog reference

The dialog is 1000 px wide and as tall as the monitor's usable area (at most 1600 px); each tab
scrolls on its own, the preset row and the action area stay visible.

```
┌─ Generate View ────────────────────────────────────────────────────────────┐
│ Preset: [Application Flow LR  ▼] *  [Save] [Save As…] │ [Rename…] [Delete] │
│         Views of application flows, left to right             (description) │
│ ┌─[Selection]──[Layout]──[Appearance]──[Properties]─────────────────────┐  │
│ │   (tab content, below)                                                │  │
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

#### Preset row

Above the tab strip, left to right:

- **Preset combo** — every saved preset, also in nested folders (`folder/sub/name`); Default
  first. Picking one loads all its settings — values of options its algorithm does not use
  included — so a later Save writes back exactly what was loaded. Unsaved changes are discarded
  without a prompt.
- **`*`** — shown while the settings differ from the saved preset: after any change, and on open
  when the session differs from the preset it came from (the view name is not compared — it is
  pre-filled from the selection). Cleared by Save, Save As or loading a preset.
- **Save** — overwrites the current preset with the current settings.
- **Save As…** — Name, Folder and Description; writes a new preset and selects it. Asks before
  overwriting another preset.
- **Rename…** — same dialog; renames or moves the *saved* preset and edits its description.
  Unsaved changes stay in the dialog and are not written. Asks before overwriting another preset.
- **Delete** — after a confirm, deletes the saved preset and loads Default.
- **Description line** — the preset's description, grey, under the combo; hidden when empty.

**Default** always exists (created on first run if absent); Rename and Delete are disabled for
it. A preset file holds only the [preset schema](#preset-json-schema) — never the action or
dialog state. On open, the last-used settings are restored from the user-local session, which
also holds UI-only state such as the active tab.

#### Selection tab

Decides *which* objects feed the layout: the counts at the top, then the global filter, then
the steps.

```
┌─[Selection]──[Layout]────────────────────────────────────────────────────┐
│ ┌─ Current selection ─────────────────────────────────────────────────┐  │
│ │  Selected:    3 elements, 2 relations, 1 view, 1 folder;            │  │
│ │               First object: Business Actor: Customer                │  │
│ │  Containing:  12 elements, 8 relations                              │  │
│ │  Filter selection by element type (none = keep all):                │  │
│ │   Mode    │ Element type                                     ✕      │  │
│ │   Include │ All                                              ✕      │  │
│ │   [+ Add rule]  ☐ Property condition                                │  │
│ │  Filter selection by diagram type (none = keep all):                │  │
│ │   Mode │ Diagram type     [+ Add rule]                              │  │
│ │  Filter selection by relations (none = keep all):                   │  │
│ │   Mode │ Source type │ Relation type │ Target type   [+ Add rule]   │  │
│ └─────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Expand selection ─────────────────────────────────────────────────┐   │
│ │ ┌──────────────────────────────────────────────────────────────┐   │   │
│ │ │ [▾] Step 1 · Adds: 4 elements · 3 relations   [↑] [↓]   [✕]  │   │   │
│ │ │ Mode   │Previous step│Direction│Added          │Added      │ │   │   │
│ │ │        │elements     │         │relations      │elements   │ │   │   │
│ │ │Include │Grouping     │Outgoing │Aggregation (3)│All (4)    │✕│   │   │
│ │ │ [+ Add rule]  ☐ Property condition   Repeat: [1× ▼]          │   │   │
│ │ └──────────────────────────────────────────────────────────────┘   │   │
│ │ ┌──────────────────────────────────────────────────────────────┐   │   │
│ │ │ [▸] Step 2 · 1 rule · Adds: nothing           [↑] [↓]   [✕]  │   │   │
│ │ └──────────────────────────────────────────────────────────────┘   │   │
│ │ [+ Add step]                                                       │   │
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Current selection.** Two summary lines; what the filter keeps shows per rule, and each step
has its own counter:

- **Selected** — what the user picked, with a `First object: <Type>: <Name>` suffix naming the
  first object. An empty selection shows `Selected: nothing` (no suffix).
- **Containing** — the count after folders and views are opened up.
- **Filter rules** — each rule's type combo shows how many it keeps on its own, *Grouping (28)*
  (an Exclude rule: how many it removes from the other rules' result).
- **Adds** — one counter per step, in its header: what the step *adds*, not cumulative;
  `Adds: nothing` when zero; a collapsed step also names its number of rules. Per rule, the
  chosen Added relations / Added elements type shows `(n)`, *Aggregation (3)*: what the step
  adds with only that rule — same input, same repeat — so adding or changing another rule never
  changes it (an Exclude rule shows what it removes from the other rules' result).

Only types with a count above zero are shown. Counts update on every rule, repeat and step-order
change, with the same selection logic the action runs ([Counting rules](#counting-rules)).

**Global filter.** Three independent rule tables ([rule lists](#rule-lists)); each shows the
default row `Include | All` when nothing is filtered.
- **Element type** — Mode · Element type, plus Property · Value behind *Property condition* (on
  and locked as soon as a rule uses a property).
- **Diagram type** — Mode · Diagram type: the diagram objects of selected views (a view
  reference matches *reference*). Shown only when the selection holds diagram objects; its
  rules are kept either way.
- **Relations** — Mode · Source type · Relation type · Target type: which relations between the
  filtered elements are drawn.

**Steps** (GUI title *Expand selection*). A one-line explanation, the ordered steps, and
`[+ Add step]` under the last one. Each step is a frame:
- **Header** — collapse triangle (▾/▸) and the bold title `Step N` on the left (title and
  summary are clickable too); the `Adds:` summary; move (↑ ↓) and, set apart, remove (✕) on the
  right — different place and shape, so collapsing and moving cannot be confused.
- **Rule table** — Mode · Previous step elements · Direction · Added relations · Added elements
  (each combo shows the rule's count after the chosen type), plus Property of · Property · Value
  behind *Property condition*. Property and value lists come from the step's candidates (every
  relation the step saw, before its rules) that match the rule's types.
- **Footer** — `[+ Add rule]`, *Property condition*, **Repeat** (`1×`–`5×` or `until nothing
  new`, at most 10 runs; `Adds:` then shows `(nothing new after N×)` or `(stopped at max 10×)`).

#### Layout tab

Decides *how* objects are positioned; groups follow the order of deciding.

```
┌─[Selection]──[Layout]─────────────────────────────────────────────────────┐
│ ┌─ Algorithm ───────────────────────────────────────────────────────────┐ │
│ │ Flow:       ○ Layered   ○ Dagre    ○ Dot                              │ │
│ │ Hierarchy:  ○ Tree      ○ Twopi                                       │ │
│ │ Network:    ○ Force     ○ Stress   ○ Neato    ○ FDP    ○ SFDP         │ │
│ │ Circular:   ○ Radial    ○ Circo                                       │ │
│ │ Compact:    ○ Grid      ○ Pack                                        │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Nesting ─────────────────────────────────────────────────────────────┐ │
│ │  Draw these relations as nesting, child inside its parent:            │ │
│ │   On │ Mode    │ Source │ Relation        │ Target │ Every │ Nested │ │ │
│ │   ☑  │ Include │ All    │ Aggregation (62)│ All    │  ☑    │ 37     │✕│ │
│ │   ☑  │ Include │ Driver │ Association (8) │ Driver │  ☐    │ 0      │✕│ │
│ │   [+ Add rule]                                                        │ │
│ │  31 matching relations are drawn as a line: the child already has a   │ │
│ │  parent. A rule with Every shows such a child in every parent.        │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Reverse ─────────────────────────────────────────────────────────────┐ │
│ │  Flip these relations:                                                │ │
│ │   On │ Mode    │ Source │ Relation         │ Target │        │       │ │
│ │   ☐  │ Include │ All    │ All              │ All    │        │ ✕     │ │
│ │   [+ Add rule]  ☐ Property condition                                  │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Containers ──────────────────────────────────────────────────────────┐ │
│ │  Layout:   Layout inside [Layered ▼]  Connections [Crossing… ▼]  Padding [20] │
│ │  Options:  ☐ Sort containers                                          │ │
│ │            ☐ Same width per level     ☐ Snap columns to grid          │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Flow ────────────────────────────────────────────────────────────────┐ │
│ │  Order:    Direction [Right ▼]  Cycles [Default ▼]  Ranking [Balanced ▼] │
│ │  Layers:   Placement [Straight ▼]  Layer distance [180]               │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Elements ────────────────────────────────────────────────────────────┐ │
│ │  Size:     Width [140]  ☐ Use label width  Wrap label at [400]        │ │
│ │            Height [60]                                                │ │
│ │  Spacing:  Distance [40]                                              │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Connections ─────────────────────────────────────────────────────────┐ │
│ │  Line:     Routing [Orthogonal ▼]  Label [Middle ▼]  ☐ Reserve label space │
│ │  Spacing:  Between [25]  Distance to element [40]                     │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ View size ───────────────────────────────────────────────────────────┐ │
│ │  ● Free   ○ Aspect ratio: [16:9 widescreen ▼]   ○ Max width: [0]      │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

- **One source.** Every label, tooltip and "Used by" line comes from the SSOT; the tables below
  are generated from it.
- **Relation counters.** The Nesting and Reverse tables count, per rule, the relations on the
  predicted view it matches on its own — after the chosen relation type, *Aggregation (62)* (an
  Exclude rule: what it removes from the other rules' matches) — and, for nesting, how many
  become a nesting (*Nested*). A grey note under Nesting says why the others are drawn as a
  line: the child already has a parent (one parent per child for rules without *Every*), the
  nesting would be circular, or the relation is a self-relation. Computed with the same
  resolution as the writer.
- **Inactive settings.** A setting the chosen algorithm does not use is greyed and keeps its
  value. Connections, Nesting, Reverse and View size end with a grey hint naming them — *"Not
  used by Dot: Reserve label space, Between, Distance to element."*, or *"Not used by Force."*
  for a whole group; Containers, Flow and Elements show it as the box's tooltip. Containers is
  also greyed, with a tooltip, until a Nesting rule is on. The explanation of the Nesting and
  Reverse rules is the tooltip of those boxes.
- **Locks.** Connections falls back to *Between containers* (greyed, reason in the tooltip) when
  Layout inside is Grid or Pack, or a view size is active ([nesting reference](#containers-and-connections-mode)).
  Width and Height are greyed while Use label width is on; Wrap label at applies only with it.
- **Empty Nesting / Reverse.** An empty table shows the default rule switched off, as an
  example; untouched it is saved as `[]`. Reverse has an empty cell where Nesting has *Nested*,
  so the two tables line up.
- **Form rows.** Containers, Flow, Elements and Connections share one heading column (*Size:*,
  *Order:*, …), as wide as the widest heading; each label sits right before its control and
  pairs follow each other. Rows that share a raster line up as a table: every column starts at
  the same x, so the controls stand below each other. Flow, Elements and Connections share a
  raster over the first label/control pair only; Containers › Options is a full 2×2 raster. All
  spinners have one width, combos keep their natural width. Nothing stretches with the dialog;
  notes and hints wrap at the box width. A rule table is never cut off: when it is wider than
  the tab, the dialog grows — only wider, within the monitor, never back — and on a monitor that
  is too narrow the tab scrolls horizontally.
- **Look.** Every group has a slightly lighter background than the page, inherited by its
  children. A control's label greys together with it.

**Algorithms** — five styles in a radio table, all algorithms always visible.

<!-- generated:styles -->
| Style | Algorithms | Tooltip |
|---|---|---|
| Flow | Layered, Dagre, Dot | Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models. |
| Hierarchy | Tree, Twopi | Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition. |
| Network | Force, Stress, Neato, FDP, SFDP | Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks. |
| Circular | Radial, Circo | Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures. |
| Compact | Grid, Pack | Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries. |
<!-- /generated:styles -->

<!-- generated:algorithms -->
| Algorithm | Engine | Nesting | Self-loops | Tooltip |
|---|---|---|---|---|
| Layered | ELK | full | ✓ | Process models, application flows, service interactions with strong directionality and nested containers (ELK) |
| Tree | ELK | full | — | Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK) |
| Force | ELK | none | — | Application landscapes and integration networks emphasising emergent connectivity without nesting (ELK) |
| Stress | ELK | none | — | Dependency maps and impact analysis emphasising relational distance (ELK) |
| Radial | ELK | none | — | Domain overviews and hub-and-spoke structures (ELK) |
| Grid | ELK | full | — | Portfolio overviews, catalogs and inventories with strong nesting support (ELK) |
| Pack | ELK | full | — | High-level landscape summaries and grouped overviews with strong nesting support (ELK) |
| Dagre | Dagre | partial | ~ | Fast process and application flows with limited nesting support (Dagre) |
| Dot | Graphviz | cluster | ✓ | Hierarchical layered layout with direction control and strong cluster nesting. Supports orthogonal, polyline and spline routing (Graphviz dot) |
| Neato | Graphviz | cluster | ✓ | Spring-model layout for undirected networks, with cluster nesting. No direction control (Graphviz neato) |
| FDP | Graphviz | cluster | ✓ | Force-directed layout with better cluster support than Neato. Unique compound edge routing around clusters (Graphviz fdp) |
| SFDP | Graphviz | none | ✓ | Scalable force-directed layout for large undirected graphs (100+ nodes). No nesting (Graphviz sfdp) |
| Twopi | Graphviz | none | ✓ | Radial layout radiating outward from a central root node. No direction control or nesting (Graphviz twopi) |
| Circo | Graphviz | none | ✓ | Circular layout: places connected groups of elements on circles. Best for rings and cyclic dependencies (Graphviz circo) |
<!-- /generated:algorithms -->

**Layout options** — Field = dialog label; Tooltip = its first two lines (the third, "Used
by", is the last column).

<!-- generated:layout-params -->
**Nesting**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Nesting | `nestingRules` | Draw matching relations as nesting: the child inside its parent. — Parent = source of the relation; with Reverse, the target. A child with several parents is nested in one of them; a rule with Every shows it in every parent. | Layered, Tree, Grid, Pack, Dagre, Dot, Neato, FDP |

**Reverse**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Reverse | `reverseRules` | Flips matching relations. Flow: laid out from target to source, against the Direction in the Flow box; arrows are unchanged. — Nesting: if the relation is also nested, the target becomes the parent. | Layered, Tree, Grid, Pack, Dagre, Dot, Neato, FDP |

**Containers**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Layout inside | `containerAlgorithm` | Algorithm that arranges the elements inside each container. — Grid or Pack: Connections is locked to Between containers. | Layered, Tree, Grid, Pack |
| Connections | `connectionsMode` | Between containers: each container is laid out on its own; connections enter at its border. — Crossing containers: the whole view is one layout; connections run straight to the element inside. | Layered |
| Padding | `padding` | Space between a container's border and its contents. — px | Layered, Tree, Grid, Pack, Dot, Neato, FDP |
| Sort containers | `sortContainers` | Order containers by type and name, as elements always are. — Grid and Pack keep this order; the other algorithms start from it. | Layered, Tree, Grid, Pack, Dagre |
| Same width per level | `alignWidthSameType` | Give all boxes of one nesting level the same width. — Each parent level is one padding step wider; a container never gets narrower than its contents. | Layered, Tree, Grid, Pack |
| Snap columns to grid | `snapColumnsToGrid` | Line columns up top to bottom on one grid across the whole view. — Each column is as wide as its widest element; element sizes are unchanged. | Grid, Pack |

**Flow**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Direction | `direction` | Direction of the main flow. | Layered, Tree, Dagre, Dot |
| Cycles | `acyclicer` | How relation cycles are broken before layout. — Default: depth-first search. Greedy: a heuristic that reverses few relations. No effect without cycles. | Dagre |
| Ranking | `ranking` | How elements are assigned to layers. — Balanced (network simplex): short connections. Uniform (longest path) and Top-aligned (tight tree): faster. | Dagre |
| Placement | `nodePlacement` | Where elements sit within their layer. | Layered |
| Layer distance | `layerSpacing` | Distance between layers along the flow; Radial and Twopi: between rings. — px — with Reserve label space a gap widens to fit its labels. | Layered, Radial, Dagre, Dot, Twopi |

**Elements**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Width | `elementWidth` | Width of every element. — px — not used with Use label width. | all algorithms |
| Height | `elementHeight` | Height of every element. — px — not used with Use label width. | all algorithms |
| Use label width | `labelSizing` | Size each element to its label; long labels wrap to two lines. — Replaces Width and Height. | Grid, Pack |
| Wrap label at | `labelMaxLineWidth` | Label width at which Use label width wraps to a second line. — px — only with Use label width. | Grid, Pack |
| Distance | `elementSpacing` | Minimum distance between elements, also between unconnected groups. — px | all algorithms except Twopi |

**Connections**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Routing | `routing` | How connection lines are drawn. | Layered, Dot, Neato, FDP, SFDP |
| Label | `labelPosition` | Where the connection label sits. | Layered, Tree, Dagre, Dot, Neato, FDP, SFDP, Twopi, Circo |
| Reserve label space | `connectionLabelSpacing` | Keep connection labels clear of other labels, connections and elements. — A layer gap widens where a label needs label + 2 × Between. | Layered |
| Between | `connectionSpacing` | Distance between parallel connections, and between connection points on one side of an element. — px — elements grow to fit their connections; 0 = no growth. | Layered, Tree, Dagre |
| Distance to element | `connectionElementSpacing` | Minimum distance between a connection and the elements it passes. — px — the first and last bend stay at least 25 from the element, clear of the end symbol. | Layered, Tree, Neato, FDP, SFDP |

**View size**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Aspect ratio | `aspectRatio` | Arrange the layout toward this width-to-height ratio. — Element sizes are unchanged. | all algorithms except Dagre |
| Max width | `maxWidth` | The view is at most this wide: a wider layout is arranged in more rows. — px — element sizes are unchanged. | Layered, Tree, Grid, Pack |
<!-- /generated:layout-params -->

**Preset-only options** have no dialog control because they hardly change the view; a preset can
still set them, and a run logs a value that differs from the default (*"Preset values not in
dialog: diagramPadding=20"*):

| Option | Effect |
|---|---|
| `diagramPadding` | Margin between the canvas origin and the outermost elements (px); shifts the whole diagram only. |

`viewSizeMode` records the selected View size radio (`"none"` = Free).

#### Appearance tab

```
┌─[Selection]──[Layout]──[Appearance]──────────────────────────────────────────┐
│ ┌─ Style by property ─────────────────────────────────────────────────────┐  │
│ │ Color elements or relations by property values. Each rule says what gets  │  │
│ │ the color and whose property gives the value.                             │  │
│ │ On│Color          │Source  │Relation   │Target │Property of│Property│Range │  │
│ │ ☑ │Element (own…) │App Comp│ —         │ —     │ —         │Status  │Blues▓│✕ │
│ │ ☑ │Relation       │All     │Flow       │All    │Relation   │Volume  │Reds ▓│✕ │
│ │ ☑ │Source element │All     │Serving    │All    │Relation   │Priority│OrRd▓⚠│✕ │
│ │ [+ Add rule]                                                              │  │
│ │ ⚠ Rules 3, 4 style the same objects. The last rule wins. …               │  │
│ │ Mixed values color: [#FF6B35 ▪]   Line width of styled relations: [▼]     │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Style by nesting level ────────────────────────────────────────────────┐  │
│ │  ☑ Apply font by level   Root size: [14 ▲▼] pt  ☑ Bold                  │  │
│ │  Decrease/level: [2 ▲▼] pt                                              │  │
│ │  ☑ Apply color by level  Root color: [#2C5F8A ▪] [=====] lighter       │  │
│ │  Lighten/level: [15 ▲▼] %                                              │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Highlight repeated elements ───────────────────────────────────────────┐  │
│ │  ☑ Enable  Color range: [Pastel1 ▼] [====]                             │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Style by property.** One rule table ([style rules](#rule-lists)). A rule is active when it is
on and has a property. Its Property combo shows the objects on the predicted view the rule
colours, *Status (14)*; before a property is chosen just *(n)*: the objects it reaches. Unique
values are sorted and mapped to evenly spaced colours of the rule's colour range; an object with
several different values gets the *mixed values* colour. Relations coloured by a *Color =
Relation* rule take the fixed line width when one is chosen. Where two rules style the same
object the later wins, and the dialog marks both with ⚠ (computed on the predicted view). The
row tooltip reads the rule as a sentence. On Expand view / Layout only, a rule that is **off**
resets what it would style (fill, or line colour and width) unless another rule styled it;
colours set by hand elsewhere are left alone.

**Style by nesting level.** Active only when a Nesting rule is on; otherwise an informational
label replaces the controls. Two compact rows, one for font, one for colour.
- **Font.** Root containers (depth 0) get the root size (bold if set); each deeper level the root
  size minus depth × decrease, never below the tool's default (9 pt). Containers only.
- **Colour.** Each chain uses its root container's current fill as the darkest anchor (or the
  root colour when it has none; with neither, the chain is skipped); each level inward is
  lightened by *Lighten/level* % toward white. Leaves of the chain's type are coloured at their
  own depth too.
- **Type chain.** Each root container defines its chain's type. Styling applies to containers
  (font) and containers and leaves (colour) whose type matches the root's and whose whole
  ancestor chain back to the root has that type. A container of another type breaks the chain:
  neither it nor any descendant is styled.

**Highlight repeated elements.** Gives each element that appears more than once on the view its
own fill colour from the range (needs a nesting rule with *Every*). Enable and range on one row.

**Colour ranges.** Every range combo offers the same set of ColorBrewer schemes, with a
gradient preview strip that repaints on change.

#### Properties tab

```
┌─[Selection]──[Layout]──[Appearance]──[Properties]───────────────────────────┐
│  Add or update properties of the generated view(s)                          │
│  ┌─ Object ID ──────────────────────────────────────────────────────────┐   │
│  │  ☐ Add unique Object ID                                              │   │
│  │     Leaves existing Object ID unchanged                              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│  ┌─ View properties ────────────────────────────────────────────────────┐   │
│  │  ☐  Domain          [  ▼]                                            │   │
│  │  ☑  Phase           [Draft               ▼]                          │   │
│  │  ☐  Status          [  ▼]                                            │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

- One row per property key found on any view of the model (except *Object ID*): a checkbox, the
  key, and an editable combo of all values found for that key. Nothing is pre-selected.
- After layout and styling, every enabled row's value is written to the generated view;
  disabled rows are ignored. The preset keeps every configured row, enabled or not.
- **Object ID.** When checked and the view has no *Object ID* property, a new unique id is
  written; an existing one is never overwritten. *One view each* gives each view its own id.

#### Totals line and action area

**Totals line** — between the tabs and the actions, always visible, the predicted on-view
totals in the console's grouped form ([Counting rules](#counting-rules)), **hide-zero**: a
field with value 0 is omitted, a sub-line whose fields are all 0 is skipped. It refreshes on
every dialog change.

**Action area** — two groups with the same rows (one field row, one button row), so fields and
buttons line up; Cancel below, bottom right.
- **Create new view** — *Folder* and *Name* (this group only), *New view*, *One view each*.
  Always enabled.
- **Modify selected view** — *View: \<name\>* names the target (the view of the selected canvas
  objects, or a view selected in the model tree); *Expand view*, *Layout only*, both in place.
  *Expand view* is enabled only when objects on the view are selected — it expands from them.
  Without a target the line says what to select and the buttons are disabled.
- **Cancel** — discards changes; remembers UI-only state (active tab) for the next open.

| Action | View name and folder |
|---|---|
| **New view** | Name from the Name field (pre-filled with the first selected object); folder from Folder, a path under Views (`/_Generated/Project`; empty = `/_Generated`). A view with that name in the folder is overwritten. |
| **One view each** | One view per element, named after the element plus the preset's suffix (e.g. `" (GGM)"`); Name is not used. |
| **Expand view / Layout only** | The selected view itself; Folder and Name are not used. |

#### Interaction rules

- **Preset auto-apply.** Selecting a preset loads its values at once; there is no Apply button.
- **Modified indicator** and **silent switch.** Switching presets discards unsaved changes
  without a confirm; the `*` is the warning.
- **Default preset** always present; it cannot be renamed or deleted.
- **Algorithm radio table.** All algorithms of all styles are always visible.
- **Commit, not keystroke.** Live counts recompute on value-commit (arrow click, focus loss).
- **Steps start expanded** on preset load; a collapsed step names its rule count.
- **Empty selection** opens normally, all counts zero; actions still run. A malformed preset
  never aborts the dialog: unknown keys are dropped, missing keys get defaults.

### Preset JSON schema

A preset is a value: it validates against this schema and round-trips losslessly to its stored
form. Keys are the persisted JSON keys; comments use the GUI labels.

```
Preset {
  schemaVersion : 3                    // 2 = rule lists; 3 = everyContainer per nesting rule ✦
  name          : string
  algorithm     : enum                 // Layout style
  params {
    direction, routing, labelPosition,           // Direction, Routing, Label
    ranking, acyclicer, nodePlacement : option   // Ranking, Cycles, Placement — gated by algorithm
    nestingRules : RelationRule[]                // Nesting; [] = none
    reverseRules : RelationRule[]                // Reverse; [] = none
    containerAlgorithm : "Layered"|"Grid"|"Pack" // Layout inside
    connectionsMode    : "Crossing containers"|"Between containers"
    elementWidth, elementHeight,                 // Width, Height
    elementSpacing, layerSpacing,                // Distance, Layer distance
    connectionSpacing, connectionElementSpacing, // Between, Distance to element
    padding, labelMaxLineWidth : number (px)     // Padding, Wrap label at
    diagramPadding : number (px)                 // preset only: canvas margin
    maxWidth, aspectRatio : number               // View size; 0 = unconstrained
    viewSizeMode : "none"|"maxWidth"|"aspectRatio"   // which View size radio; "none" = Free
    sortContainers, alignWidthSameType,          // Sort containers, Same width per level
    snapColumnsToGrid, labelSizing,              // Snap columns to grid, Use label width
    connectionLabelSpacing : boolean             // Reserve label space
  }
  filter {                                       // every list: [] = keep all
    elementRules  : ElementRule[]                // seed elements
    diagramRules  : DiagramRule[]                // diagram objects of selected views
    relationRules : RelationRule[]               // relations between the filtered elements
  }
  relatedElements { steps : Step[] }             // ordered chain, one per step block
  view {                                         // Create actions only
    name   : string                              // New view; "" = first selected object
    folder : string                              // path under Views; "" = "/_Generated"
    suffix : string                              // One view each: appended to each element name
  }
  description : string                           // shown under the preset combo
  appearance {
    enabled : boolean                            // ✦ master styling on/off
    styleByProperty {
      rules : StyleRule[]                        // in order; the later rule wins on one object
      mixedValuesColor : hex                     // fill for an object with several values
      lineWidth : 0..3                           // 0 = no change; 1 Normal, 2 Medium, 3 Heavy
    }
    nestingLevel {
      fontEnabled, rootFontBold : boolean
      rootFontSize, fontDecreasePerLevel : number (pt)
      colorEnabled : boolean
      rootColor : hex                            // fill of root containers (darkest)
      lightenPerLevel : number (%, 0–50)
    }
    highlightRepeated { enabled : boolean, colorRange : scheme name }
  }
  engineParams { ELK?, Dagre?, Graphviz?, layout? }   // ✦ typed per-engine overrides only;
                                                      // deep-merged over adapter defaults
  viewProperties {
    addObjectId : boolean                        // write a unique Object ID when the view has none
    properties : { key, value : string, enabled : boolean }[]   // key never "Object ID"
  }
}
Step { repeat : 1..5 | "untilNothingNew", rules : StepRule[] }   // [] = follow every relation
```

`repeat`: each run starts from the previous run's additions; *until nothing new* stops when a
run adds nothing, at most 10 runs.

#### Rule lists

One rule model for every list. A list keeps what matches **any active Include rule**, unless an
**Exclude rule** matches too; order has no meaning (style rules excepted: the later rule wins).
A type field holds a type id or `""` (= All); `mode` defaults to `"include"`, `on` to true,
`everyContainer` to false.

| Rule kind | Fields | Used by | Empty list |
|---|---|---|---|
| element  | mode, elementType, property, value | `filter.elementRules` | keep all |
| diagram  | mode, diagramType | `filter.diagramRules` | keep all |
| relation | on, mode, source, relation, target, propertyOf (`relation`/`source`/`target`), property, value, everyContainer (nesting rules only) | `filter.relationRules`, `params.nestingRules`, `params.reverseRules` | filter: keep all · nesting / reverse: none |
| step     | mode, previous, direction (`either`/`outgoing`/`incoming`), relation, added, propertyOf (`added`/`relation`/`previous`), property, value | `steps[].rules` | follow all |
| style    | on, color (`element`/`relation`/`source`/`target`), source, relation, target, propertyOf (`element`/`relation`/`source`/`target`), property, colorRange | `appearance.styleByProperty.rules` | no styling |

**Step rules are written from the previous step's elements.** `direction`: `outgoing` = the
previous-step element is the relation's source, `incoming` = its target, `either` (default) =
both. `previous` constrains the previous-step element's type, `added` the new element's type;
`propertyOf` says whose property must equal `value`. Which relations a step *draws*: an Include
rule matches on relation type, direction and `previous` only — `added` and the property only
decide which elements join; an Exclude rule matches in full.

**Style rules.** `color`: `element` (the element by its own property; `source` holds its type),
`relation`, `source` / `target` (that end of a matching relation — model-wide relations, so the
relation need not be on the view). `propertyOf`: whose property gives the value.

**Validation.** Each rule is normalised; an unknown key, enum value or type id skips the rule
with a warning — a typo never widens a list to All. A preset with an older shape is refused with
a message naming its migration.

**File form.** Fields at their default are omitted, a pass-all list is written as `[]`, and every
rule sits on one line, so a diff shows one changed rule as one changed line.

### Selection run order

The selection turns (selection, preset, action) into the object set for layout. Same input,
same model → same set; it reads only, never edits a view; sets, not lists (no duplicates).

1. **Open up the selection.** Folders → their contents; views → their visual contents, split into
   model concepts and diagram objects; canvas objects → the concepts behind them. A Modify action
   also captures the VisualSet of its target view (bounds, appearance, parenthood) — before any
   model traversal, so reposition-vs-create never depends on stage order.
2. **Global filter** — element rules, relation rules, diagram rules. Visibility only: hiding an
   element never changes the nesting between the elements that remain.
3. **Steps, as a chain.** Step 1 starts from the filtered base; each later step from the previous
   step's additions only; an empty step ends the chain. Within a step, each run starts from the
   previous run's additions.
4. **Elements only** — relations, folders and views leave the element set.
5. **Relations**, collected in two passes with no relation counted twice:
   - *base* — relations between filtered-base elements that the relation rules keep;
   - *per run* — relations between the run's new elements and the collection that reached them
     (the step input for the first run, the previous run's elements after that) that a step
     rule draws. Relations among one run's new elements, and to earlier-step elements outside
     that collection, are not collected.
6. **Diagram objects** — connections between diagram objects are edges, never nodes; they are
   kept apart from positional diagram objects and rerouted when their ends move.

**Modify actions.** Neither applies the element filter (2): it would hide drawn element types,
sizing containers for a subset while the hidden elements stay outside them. *Layout only*
skips the steps (3) and keeps only relations already drawn on the view. *Expand view* needs
elements selected on the view (a view from the model tree is refused), runs the steps from them,
starts from the relations drawn on the view (no missing relation between elements already there
is added) plus the relations the steps follow; then every element and diagram object of the view
joins, so the whole view is laid out.

### Counting rules

The dialog's live counts and the action use the same selection and nesting logic, so a count is
a promise. Before opening, and on every action, the console prints one grouped block:

```
Selected:    0 elements · 0 relations · 1 view · 0 diagram objects · 0 folders
Containing: 110 elements · 113 relations · 0 diagram objects
Filtered base:    8 elements ·  11 relations · 0 diagram objects
Step 1 adds:    102 elements ·  98 relations
──────────────────────────────────────────────
Total to view:
  elements:    18 containers ·  92 nested elements ·   0 standalones ·   0 extra occurrences
  relations:   11 nestings   ·  98 connections
  diagram:      0 diagram objects
```

- **Exact sums.** `Filtered base + Σ Step N adds = Total`, for elements and for relations. A
  step's relations are the new relations of its runs (per run, between the new elements and the
  collection that reached them), minus any counted before — never a count of raw selection
  relations.
- **Elements partition.** `elements = containers + nested elements + standalones`; it counts
  model elements, so *every container* never inflates it. **Extra occurrences** are a separate
  field, never folded in.
- **Relations partition** on the view: `relations = nestings + connections`. Pipeline counters
  say *relations*; view-side rows say *nestings* and *connections*.
- **Extra occurrences on non-nesting algorithms.** Only algorithms that draw containment show
  extra occurrences as boxes; the others draw each element once, while the count still reports
  them.
- The console prints every field, column-aligned; the dialog's totals line hides zeros.

### Nesting reference

#### Containers and connections mode

*Layout inside* arranges the children of each container. *Crossing containers* (default) lays
the whole hierarchy out as one graph: connections run straight to the element inside, and
crossing minimisation spans all levels. *Between containers* lays out each container on its
own; connections enter at its border. **Lock:** crossing is impossible — *between* is used,
greyed with the reason — when Layout inside is Grid or Pack (connections into a packed container
are not supported; without them the containers stack in one column) or a view size is active (a
one-graph layout does not pack unconnected elements into rows). The container choice wins; a
preset with a locked combination runs as *between*, and the log says so. With a root Grid or
Pack there are no connections between containers, so the option is inactive.

#### Roles and parents

- **Role.** A relation matching a nesting rule is a **nesting candidate**; every other relation
  is a connection. The preset is the only authority; the split is total and deterministic.
- **Direction.** For a nesting, source = parent, target = child — swapped when the relation also
  matches a reverse rule, exactly as reversal flips a connection's layout direction.
- **Several parents** — never decided by rule or model order:

| Relation matches | Outcome |
|---|---|
| a rule with *every container* (wins when the relation matches several nesting rules) | **Every parent.** The child appears inside this parent whatever its other relations do; each appearance is its own node mapping back to the same element. An extra occurrence of a container gets its own copies of the container's children. |
| only rules without it | **One parent.** All such relations of one child together give it at most one parent: the container its user-content occurrence sits in on the view, else the first by name, then by id. The other relations are drawn as connections. |

  Example: a composition from P1 (rule without *every container*) and an aggregation from P2
  (rule with it) put the child in P1 **and** in P2.
- **Cycles.** Nesting candidates that together form a containment cycle are **all** drawn as
  connections; candidates outside it are unaffected. The dialog counts them as *circular*, the
  log names each cycle by its elements. To nest part of a cycle anyway, exclude the other
  relations with an Exclude rule.
- **Asymmetric roles.** An element may be a parent in one relation and a child in another;
  roles are per relation. Diamonds and deep chains follow from the same rules.
- **Container derivation.** A container is any element with at least one child after
  resolution — derived, never declared; being a container does not change an element's type.
- **Nothing undrawn.** A nesting candidate that does not become containment is drawn as a
  connection.

#### Connections between occurrences

A connection whose source or target has several occurrences is drawn **once**:
- **already on the view** — each connection of the relation on the view keeps its two ends and is
  laid out;
- **otherwise** — between the pair of occurrences closest together in the container tree: not one
  inside the other, then the deepest common container, then the first occurrences;
- a self-relation stays a loop on one occurrence.

#### Managed extra occurrences

Every action — *Layout only* too — reconciles them:

1. **Capture.** The VisualSet's occurrences split into **managed** (matching a record on the
   view) and **user content** (everything else: hand-placed duplicates, occurrences on views made
   before records existed). The edge cases below turn some managed occurrences into user content.
2. **Resolve** — the wanted placements: per element its parents, and for extra container
   occurrences their copied children. Only user content counts as a child's current container.
3. **Pair.** Per element, user content first, then managed; each prefers the placement with its
   own container chain, then one with the same direct container, then any. A user occurrence
   left without a placement stays in its current container and is laid out there.
4. **Add and remove.** A placement without an occurrence gets a new, managed one — except the
   first, if the element has no user content. A managed occurrence left without a placement is
   removed, with the connections drawn to it.
5. **Record.** The view's records are rewritten to describe exactly its managed occurrences.

A **record** identifies a placement — the element and its chain of containers up to the view
root — not a visual object, so a copied view keeps its managed occurrences, and a managed
occurrence stays managed when another rule takes over its nesting. Edge cases:
- **Last occurrence** — an element whose occurrences are all managed has its first, in view
  order, turned into user content; an element never disappears from the view.
- **Moved by the user** — a record that no longer matches the view is dropped; the object, if
  any, is user content.
- **User content inside a managed container** — the container becomes user content (it cannot be
  removed without deleting user content); the run logs it.
- **Hand-drawn connection to a managed occurrence** — removed with it; the system cannot tell it
  from the connections it drew itself.
- **Same placement twice** — the first matching object in view order is managed, the other user
  content.

#### Writer parenthood

Each visual's parent is re-derived per run from the nesting decisions, for every action: an
occurrence with a parent is drawn inside the visual paired with that parent, otherwise at view
root; an existing visual under another parent is moved there, keeping its appearance and
connections, its bounds relative to the new parent. Each occurrence pairs with at most one
visual of its element; a leftover managed visual is removed, a leftover user visual stays and
is laid out in its current container. A nesting's visual relation between the two paired
visuals is kept, otherwise added; every other line of a relation drawn as nesting is removed.

**Preserved vs re-derived** on Modify actions: appearance (colours, fonts, line styles, sizes
set by hand) is never touched by the writer; parenthood is re-derived; bendpoints of existing
connections are rewritten from the layout result (their style untouched). The Create group
never modifies the view the selection came from.

### Sizing refinements

#### Same width per level

Boxes at the same nesting depth get a common width, so a nested view reads as telescoping
frames instead of ragged boxes. It never changes parent or child. *Level*: root boxes are 0, the
children of a level-*N* container *N+1*.

```
W[deepest level] = narrowest box at that level (the leaf base width)
W[L]             = W[L+1] + ring          (ring = left + right container padding)
```

A **leaf** takes exactly its level width. A **container** treats it as a floor: if its
side-by-side content needs more, it stays wider (never below content). Example — deepest branch
`B ⊃ B1 ⊃ B1a ⊃ leaf`, a level-0 container `A` holding two boxes side by side, a lone level-0 leaf
`C`; leaf width 200, ring 20:

| Level | `W[L]` | Leaves | Containers |
|---|---|---|---|
| 0 | 260 | `C` → 260 | `A` → at least 260, wider to fit its two children |
| 1 | 240 | `A2` → 240 | `A1` → at least 240 |
| 2 | 220 | `A1a` → 220 | `B1a` → at least 220 |
| 3 | 200 (anchor) | `Bx` → 200 | — |

It needs each container's natural width, so a first sizing pass measures it and the widths are
set *between* passes — never after the final layout. Available only where the engine sizes
containers from content ([capability matrix](#capability-matrix)).

#### Snap columns to grid

Puts every leaf column on one shared grid, so columns line up top to bottom across the whole
view (Grid and Pack only; independent of the option above). Each column is as wide as its widest
leaf, columns packed left to right, every leaf moved onto its column's centre. Gaps start tight
and widen only where sibling containers would overlap, by exactly the overlap, repeated until
clean. Leaves are moved, never resized; containers are re-wrapped around them.

### Layout graph and result

```
LayoutGraph {
  algorithm : enum
  nodes : [{ id, label, elementType, width, height,   // leaves sized; containers sized by the engine
             parent : nodeId | null }]                // nesting
  edges : [{ id, source, target,                      // already swapped for reversed relations
             label, weight }]                         // weight: hint per relation type
  options : object                                    // per-algorithm parameters
  maxWidth, aspectRatio : number                      // only the active one non-zero
  alignWidthSameType, sortContainers : boolean
}
LayoutResult {
  nodes : [{ id, x, y, width, height, parentId }]     // ABSOLUTE
  edges : [{ id, sourceId, targetId,
             bendpoints : [{ x, y }],                 // ABSOLUTE
             isStraight : boolean,
             labelX, labelY : number }]               // 0,0 = no placement
  viewWidth, viewHeight : number
}
```

The writer draws each connection against its model relation and orders bendpoints by the model
relation's source and target when the graph reversed them. Element labels sit inside their node
at the standard position. With *Reserve label space* the layout reserves room for each
connection label between element layers, and the label is drawn there.

### Capability matrix

Each algorithm declares a style (UI grouping only), a nesting capability (full / partial /
cluster / none), a self-loop capability, its active options and the allowed values of its select
options. An option outside the active set is greyed in the dialog, keeps its value, and is
ignored at runtime. Adding an algorithm is one SSOT entry plus one adapter mapping. The matrix is
generated from the registry — never edited by hand.

✓ active · — greyed out in the dialog.

<!-- generated:capability-matrix -->
| Parameter | Layered | Tree | Force | Stress | Radial | Grid | Pack | Dagre | Dot | Neato | FDP | SFDP | Twopi | Circo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nesting `nestingRules` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Reverse `reverseRules` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Layout inside `containerAlgorithm` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Connections `connectionsMode` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Padding `padding` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | — |
| Sort containers `sortContainers` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Same width per level `alignWidthSameType` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Snap columns to grid `snapColumnsToGrid` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Direction `direction` | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| Cycles `acyclicer` | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Ranking `ranking` | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Placement `nodePlacement` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Layer distance `layerSpacing` | ✓ | — | — | — | ✓ | — | — | ✓ | ✓ | — | — | — | ✓ | — |
| Width `elementWidth` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Height `elementHeight` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Use label width `labelSizing` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Wrap label at `labelMaxLineWidth` | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Distance `elementSpacing` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Routing `routing` | ✓ | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | — |
| Label `labelPosition` | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reserve label space `connectionLabelSpacing` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Between `connectionSpacing` | ✓ | ✓ | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Distance to element `connectionElementSpacing` | ✓ | ✓ | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | — | — |
| Aspect ratio `aspectRatio` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Max width `maxWidth` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Diagram padding (preset only) `diagramPadding` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Self-loops** (capability) | ✓ | — | — | — | — | — | — | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
<!-- /generated:capability-matrix -->

**Self-loops** is a capability, not an option: ✓ = routed (by the engine, or a small corner loop
drawn by the writer), ~ = partial (the engine tries, the writer draws the loop on failure), — =
not drawn (left out of the layout graph and removed on re-layout).

### Per-engine view-size

| Engine | max width | aspect ratio |
|---|---|---|
| Layered-family (ranked) and packing | upper bound, met by re-arranging (more rows); when unreachable (connection chains or the widest container set the width) the narrowest layout is used and this is reported | met approximately by re-arranging |
| Force / stress / radial | not supported | met approximately by re-arranging |
| Cluster engines (dot family) | not supported — they can only widen a layout without scaling | passed as a ratio hint |
| Simple ranked (no area) | not supported | not supported |

Engines meet a target by arranging elements differently, never by coordinate scaling. A
target that cannot be met is reported, not forced.

### Console logging

Each orchestration phase is a step: one blank line, a header at root indent (`Step name:`),
detail lines indented two spaces. The final `View "…" written` line is at root indent.

| Step header | Covers |
|---|---|
| `=== generate_view ===` | Action, algorithm, options, view name and folder, requested view size |
| `Pipeline — build object set:` | Filtered base, step adds, totals ([counting rules](#counting-rules)) |
| `Layout graph:` | Relation roles (nestings · connections), nestings applied, cycles |
| `View target:` | Modify actions: the view identified (before the layout graph) |
| `Layout:` | Engine passes, width alignment, layout result, view size |
| `View target:` | Create actions: the view created or overwritten — after the layout succeeded |
| `Write:` | Nodes written (extra occurrences included), connections, final counts |

The dialog logs one block before it opens (Selected / Containing / Filtered), not on widget
changes. There is no debug flag; width-alignment and container-offset mismatches are always
logged with `⚠`.

### Rule scopes

Rules apply in scopes, broad → narrow; for one concern the narrowest scope that addresses it
wins, broader rules apply where narrower ones are silent. Plan files and other working notes are
not rules; they never override them. The concrete files per scope are listed in the repo's
`ai/rules.md`.

| Scope | Governs |
|---|---|
| Global | Conventions across the user's projects — naming, module layout, file headers, logging. |
| Repo-wide | Entry point and vocabulary; runtime constraints; module structure; testing policy; README. |
| Shared library | Contracts every subsystem relies on — selection helpers, utilities, folder resolution. |
| Subsystem | This system's own rules: this specification and ARCHITECTURE.md. |

### Current realisation

- **Runtime:** a JavaScript script for the Archi modelling tool (jArchi 1.12 / GraalVM JS),
  SWT/GTK dialog.
- **Engines:** ELK (Layered, Tree, Force, Stress, Radial, Grid, Pack), Dagre (Dagre), Graphviz
  (Dot, Twopi, Neato, FDP, SFDP, Circo).
- **File map (target):** `lib/generate_view.js` (orchestrator + writer), `lib/defs.js` (SSOT),
  `lib/selection_pipeline.js`, `lib/preset_io.js`, `lib/appearance.js`, `lib/engines/*`
  (registered adapters), `lib/gui/*` (per-tab dialog modules), headless `_*.ajs` entry scripts,
  `presets/**/*.json` presets + `_session.json`, `lib/run_preset.js` (filename-driven
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
8. **Every container per nesting rule** replaces the global *show in every container*
   (`params.showInEveryContainer`); schema version 3, migrated offline: a preset with the global
   switch on gets `everyContainer` on each nesting rule.
9. **Order-independent parents** replace *first wins* in model order; every relation of a
   nesting cycle is drawn as a connection (today the closing one is dropped from the view).
10. **Managed extra occurrences**, recorded on the view and reconciled by every action, replace
    "surplus occurrences left in place"; unpaired user occurrences are laid out, not left behind.

Already realised: `schemaVersion` with an offline migration (rule lists, version 2); every
container per nesting rule (8); order-independent parents and cycles drawn as connections (9);
managed extra occurrences (10); the
capability matrix is derived from the registry; `Step.diagramTypes` is removed; one reconciled per-engine view-size table; control labels, tooltips and "used by"
lists come from one canonical SSOT set.
