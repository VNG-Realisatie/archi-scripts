# View Generation — Architecture Reference

Two-part SSOT for the View subsystem.

- **Part A — Architecture & Design** is the implementation-free constraint. Code must conform to it. Changes to Part A are real architectural decisions: debate them, then change Part A first, then update Part B + code.
- **Part B — Current implementation** is how Part A is realised in jArchi 1.12 / GraalVM JS / SWT today. Every Part B section opens with `**Realises:** §A.X`. Drift between A and B is a defect.

Update both parts as part of any commit that affects behaviour, public APIs, action semantics, or shared invariants. Done log entries tag the touched sections (`**Arch impact:** §A.x, §B.y`).

---

# Part A — Architecture & Design

Implementation-free. No language, library, framework, or tool names. Could survive a full rewrite in any other language or UI toolkit.

## A.1 Goals & scope

### Purpose

Generate, modify, and re-lay out ArchiMate **views** from the user's current selection. The system turns a chosen subset of the model (plus rules for which related elements to include and how to lay them out) into a positioned diagram.

### User stories

- **Starting point for a new view.** *As an architect, I want to quickly generate a starting-point view from a folder or selection, so I can iterate visually instead of placing every element by hand.*
- **Context views per element.** *As an architect, I want one view per selected element showing each element with its related neighbours, so I can hand stakeholders a small focused diagram per concern.*
- **Model analysis through alternative views.** *As an analyst, I want to generate the same elements under different layout styles and filters, so I can spot patterns (clusters, hubs, dead ends) that one fixed view hides.*
- **Nesting reveals model quality issues.** *As a modeller, I want nesting rules that turn containment-style relations into parent-child boxes, so I can see unexpected relations, double relations, and orphaned elements at a glance.*

### Scope

In scope: producing/modifying/re-laying-out views; storing and reusing layout configurations (presets); a configuration UI; session continuity.

Out of scope: model authoring beyond what layout implies; editing element properties; exporting to image formats; view diff/merge; real-time collaborative editing.

## A.2 Vocabulary

Stable terms. Used in code, UI labels, and documentation. No synonyms.

| Term | Definition |
|---|---|
| **Element** | A model concept (a typed thing in the modelling language). |
| **Relation** | A directed, typed connection between two elements at the model level. |
| **View** | A diagram: a positioned arrangement of elements, relations, and diagram objects. A model element may appear on many views. |
| **VisualElement** | The placement of one element on one view's canvas. Has bounds, may have appearance overrides; points back to its model element. |
| **VisualRelation** | The drawing of one relation on one view's canvas. Has endpoints (VisualElements) and bendpoints. |
| **DiagramObject** | A canvas-only object that has no model concept: note, group, image, legend, view-reference, or a connection drawn between diagram objects. Belongs to exactly one view. |
| **Nesting** | The act of drawing a relation as a parent-child containment (one box inside another) rather than as a line. Driven by per-relation-type rules in the preset. |
| **Container** | A VisualElement that visually nests other VisualElements as a consequence of nesting rules. Containers are never authored directly. |
| **Layout** | The algorithmic positioning of all visible objects on a view. |
| **Preset** | A named, persistable bundle of layout configuration (algorithm choice + parameters + filters + related-elements rules + target naming). |
| **Action** | What the system does on invocation: create a new view, create one view per element, expand an existing view, or re-lay-out an existing view. A runtime parameter — never stored in a preset. |
| **Session** | The last-used configuration, restored automatically next time the UI opens. |

## A.3 System architecture

### Module responsibilities

```
┌──────────────────────────────────────────────────────────┐
│  Entry points                                            │
│  Capture the user's selection, choose an action, hand    │
│  off to the orchestrator. No business logic.             │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Orchestrator                                            │
│  validate preset → build object set → assign nesting     │
│  roles → build layout graph → call engine adapter →      │
│  write to view.                                          │
└──┬───────────────────────────────────────────────────────┘
   │
   ├─ SSOT module          ← styles, algorithms, GUI parameters,
   │                          per-algorithm-allowed values, engine
   │                          parameter mappings, action and routing
   │                          constants, the closed set of diagram-
   │                          object types.
   │
   ├─ Selection pipeline   ← selection → filter → related-elements
   │                          expansion → typed object set.
   │
   ├─ Preset persistence   ← read/write preset bundles; preserve
   │                          UI-only state across sessions.
   │
   └─ Engine adapters      ← one adapter per layout engine.
                             Each implements one normalised contract.

  Configuration UI         ← drives the orchestrator via the SSOT
                             and the preset persistence module. Live
                             counts are computed via the same
                             pipeline the orchestrator uses.
```

### Boundaries

- **Entry points contain no logic** — they exist to be visible in the host tool's script menu. They read the session preset, call the orchestrator with the chosen action, and exit.
- **Orchestrator is the only writer to views.** No other module mutates view contents.
- **SSOT is read-only at runtime.** Adding an algorithm, a parameter, or a diagram-object type is a single-file change.
- **Engine adapters are isolated.** Adding a new engine requires no changes to the orchestrator, pipeline, UI, or other adapters.
- **The UI is replaceable.** Any caller that can produce a validated preset + a selection can drive the orchestrator.

## A.4 Data model

### A.4.1 Object types

Closed enumerations. Adding a type is a deliberate decision.

- **Element types** — drawn from the modelling language; identified by a stable type string.
- **Relation types** — drawn from the modelling language; identified by a stable type string. Each has a layout-weight used by some algorithms.
- **Diagram-object types** — the closed set of canvas-only object kinds. New types require a system change.

### A.4.2 Preset

A preset is a value, not a record in a database. It validates against a schema and round-trips losslessly to/from a stored form.

```
Preset {
  name        : string                  // identifier for saved presets
  algorithm   : enum                    // a known layout algorithm

  params {
    direction, routing, labelPosition,  // discrete choices, gated
    ranking,                            // by algorithm capabilities

    reverseRelationTypes : RelTypeId[]  // direction-flipping
    nestingRelationTypes : RelTypeId[]  // drawn as containment

    innerSpacing, padding, layerSpacing,
    elementSpacing, elementWidth,
    elementHeight, maxWidth, maxHeight, aspectRatio : numbers

    sortContainers, alignSameType,
    showInEveryContainer : booleans
  }

  filter {
    elementTypes  : ElTypeId[]          // empty = all
    relationTypes : EncodedRelTypeId[]  // each entry: "type" | "type:in" | "type:out"
    diagramTypes  : DgTypeId[]
  }

  relatedElements {
    layers : Layer[]                    // ordered, cumulative
  }

  view {
    name, suffix, folder : strings      // naming for NEW_VIEW
  }
}

Layer {
  depth          : int   ≥ 1            // relation hops to follow
  elementTypes   : ElTypeId[]           // prune block's additions
  relationTypes  : EncodedRelTypeId[]   // direction-aware
  diagramTypes   : DgTypeId[]           // unused (diagram objects
                                        // don't traverse)
}
```

### A.4.3 Encoded relation type strings

| Encoded value | Meaning |
|---|---|
| `"type"` | both directions |
| `"type:in"` | incoming only (traversed element is the relation's target) |
| `"type:out"` | outgoing only (traversed element is the relation's source) |

The UI never produces the empty-direction state ("relation checked but neither direction lit"); at least one direction is always selected when a relation is active.

### A.4.4 Action

A runtime parameter, not preset content. Persisting it on the preset is forbidden (it would be stripped by validation and is meaningless to share across selections).

## A.5 Pipeline contract

The pipeline takes a user selection plus a validated preset plus an action and returns a typed object set ready for layout.

### Steps

```
Step 0  (LAYOUT_ONLY only)
  Collect the existing visual contents of the target view.
  Returns: { visualElements, visualRelations, diagramObjects }.
  Skip steps 1–6.

Step 1  Selection → model + diagram objects
  Recursively expand the user's selection.
  - Folders / containers → their contained elements.
  - Views → their visual contents (split into model concepts
    and diagram objects).
  - Canvas selections → the concepts behind the visual objects.

Step 2  Apply the global Filter
  Element-type filter, relation-type filter (direction-aware),
  diagram-type filter. Filter is visibility only; it does not
  alter nesting structure.

Step 3  Related-elements expansion
  For each ordered layer in preset.relatedElements.layers:
    additions = traverse(base, layer)
    base      = base ∪ (additions pruned by layer.elementTypes)
  Block N's pruned output is block N+1's base. Cumulative.

Step 4  Separate the element set
  Drop relations, folders, view nodes. What remains is the set
  of elements that will be placed by the layout engine.

Step 5  Find relations between elements
  Walk the model. Include a relation iff both endpoints are
  in the element set AND it matches the global relation-type
  filter.

Step 6  Partition diagram objects
  diagram-model-connection objects are edges, not nodes; keep
  them separate from positional diagram objects.

Step 7  (EXPAND_VIEW only)  Existing visuals
  Collect the existing VisualElements and VisualRelations on
  the target view so the orchestrator can reuse them in place.
```

### Invariants

- **Pure function.** Same selection + same preset + same model state → same returned object set.
- **No view mutation.** The pipeline reads only; it never edits a view.
- **Sets, not lists.** No duplicate concepts; no duplicate relations.
- **Filter is non-destructive to nesting.** Filtering an element does not remove its descendants from the nesting structure of other elements that survive the filter.

## A.6 Action semantics

Four actions. Each action is a contract about what the orchestrator does to the target view and what it preserves.

| Action | Target view | What is added | What is preserved | What is removed |
|---|---|---|---|---|
| **NEW_VIEW** | A new view (created in the configured folder; named from `preset.view.name` + `suffix`). If a view by that name already exists in that folder, its contents are replaced. | All elements + relations from the pipeline. | n/a (new view). | n/a (new view). |
| **ONE_EACH** | One new view per selected element. Each invocation is a NEW_VIEW with the per-element selection. | As NEW_VIEW per element. | As NEW_VIEW. | As NEW_VIEW. |
| **EXPAND_VIEW** | **The selected view itself.** Derived from the existing visual objects in the selection, NOT from `preset.view.name`. The name field is ignored. | Newly-added elements from the pipeline; new relations to/from them. Defaults appearance only. | Every existing visual element, visual relation, and diagram object: kept in place with original colours, fonts, sizes. Only `bounds` change as the layout repositions them. Existing relations reroute as their endpoints move. | Nothing. Duplicates are not produced; the action is idempotent. |
| **LAYOUT_ONLY** | The selected view itself. | Nothing. | All appearance properties. Bendpoints are rewritten by the new layout. | Nothing. |

EXPAND_VIEW is the only action that mixes "kept" and "added" visuals on the same view.

## A.7 Engine adapter contract

A layout engine is an opaque function. The system exposes one normalised interface that every engine adapter must implement.

### Input — `LayoutGraph`

```
LayoutGraph {
  algorithm      : enum                 // names a known algorithm
  nodes : [ {
    id           : string               // unique within this graph
    label        : string
    elementType  : string               // for type-aware layouts
    width        : number
    height       : number
    parent       : string | null        // id of the parent node
                                        // (nesting)
  } ]
  edges : [ {
    id           : string
    source       : nodeId
    target       : nodeId
    label        : string
    weight       : number               // hint to layout-quality
    reversed     : boolean              // logically flip for layout
  } ]
  options        : preset.params        // mapped per-algorithm
  alignSameType  : boolean
  sortContainers : boolean
}
```

### Output — `LayoutResult`

```
LayoutResult {
  nodes : [ {
    id, x, y, width, height,
    parentId : string | null           // for absolute → parent-
                                       // relative conversion
  } ]                                  // x, y are ABSOLUTE
  edges : [ {
    id, sourceId, targetId,
    bendpoints   : [ { x, y } ]        // ABSOLUTE
    isStraight   : boolean
    labelX, labelY : number
  } ]
  viewWidth, viewHeight : number
}
```

### Adapter obligations

- Honour every parameter listed as **active** for the chosen algorithm; ignore inactive ones.
- Translate the parameter values from their UI/preset form to the engine's native form.
- Return absolute coordinates (the orchestrator converts to parent-relative).
- Never read or write a view directly. Adapters operate only on `LayoutGraph` / `LayoutResult`.

## A.8 GUI structure

The UI is a tabbed dialog that drives the orchestrator.

```
Preset row                     load · save · manage
[Selection tab] [Layout tab]
  Selection:                   counts table, global filter,
                               related-elements blocks (dynamic)
  Layout:                      style, algorithm, direction, routing,
                               nesting, spacing, sizing
View name and location         outside tabs
Action row                     Cancel | Create new view group |
                               Modify selected view group
```

### Action-row semantics

- **Cancel** — always enabled. Discards changes. Preserves UI-only state for next open.
- **Create new view** group — always enabled. Contains *New view* and *One view each*.
- **Modify selected view** group — enabled only when the selection identifies an existing view (canvas VOs or a view node from the tree). Contains *Expand view* and *Layout only*.

### Live counts in the selection table

The table shows the current selection's content: rows for Selected (raw), Containing (after recursive expansion), Filtered (after the global filter), and one row per Related-elements block (each block shows the count it ADDS, not the cumulative total).

The counts must reflect the same pipeline the orchestrator will run. They update on every change to a filter control, relation toggle, element-type filter, depth control, and block ordering operation. Spinner widgets defer recompute to value-commit (arrow click, focus loss) — not per-keystroke.

### Related-elements blocks

Dynamic, ordered list. Each block is:

- Title with reorder (up/down), collapse/expand, and remove controls.
- Relation-types control with per-relation direction toggles (`←` incoming / `→` outgoing). At least one direction must be lit when a relation is active.
- Element-type filter (block-scoped — prunes only what this block adds).
- Depth control (≥ 1).

Block N's pruned output is block N+1's base (see A.5).

### User-facing vocabulary

Internal engine names must not appear in labels or button text. They may appear in tooltips parenthetically.

| Internal | Display |
|---|---|
| Edge, edge routing | Relation line, relation line style |
| Graph | Diagram or View |
| Algorithm, engine | Layout style |
| Rank / layer | Level |
| Direction / orientation | Flow direction |
| Node placement | Element alignment |
| Layer spacing | Level spacing |
| Node spacing | Element spacing |
| Depth, hops | Relation levels |
| Ranker | Layer ranking |
| Parameter file, config file | Preset |
| Per element | One view each |
| Layout only | Re-layout |

## A.9 Algorithm capability matrix

Not all algorithms support all parameters. A parameter that is inactive for the chosen algorithm is greyed in the UI; its value is kept (preserved across algorithm changes) but ignored at runtime.

Each algorithm declares:

- A **style** (Flow / Hierarchy / Network / Circular / Compact) — used for grouping in the UI only.
- A **nesting capability** (full / partial / cluster / none) — drives whether nesting parameters are active.
- An **active-parameters list** — which preset.params keys are honoured.
- A **supported-options map** — for select-type parameters (e.g. direction, routing, label position), the allowed values.

Adding a new algorithm = add one entry to the SSOT + one engine adapter (if a new engine) or extend an existing adapter. No other module changes.

## A.10 Invariants

System-wide. Code reviews catch violations.

1. **Determinism.** Same inputs → same view, always. No reliance on hash-iteration order for layout decisions.
2. **Appearance preservation.** Updating a visual object's position does not change its appearance properties (colours, fonts, sizes, text). The system relies on this for EXPAND_VIEW and LAYOUT_ONLY.
3. **Parent-relative coordinates.** A nested visual object's bounds are expressed relative to its immediate parent visual object. The layout engine returns absolute coordinates; the orchestrator converts at write time.
4. **No silent data loss.** The orchestrator may overwrite a view's contents only when the action explicitly says so (NEW_VIEW with a name that matches an existing view in the same folder). EXPAND_VIEW must never delete existing visuals as a side effect of name resolution.
5. **Validation is total.** Every preset that enters the orchestrator has passed validation: unknown top-level keys are dropped; missing keys take defaults; option values are checked against the algorithm's supported options.
6. **UI-only state is partitioned.** The preset schema carries only configuration that affects view generation. UI-only state (last tab index, collapsed-block flags, …) rides as separate keys preserved through the same persistence file but invisible to the orchestrator.
7. **Action is not in the preset.** Sharing a preset across users and selections requires the preset to be selection- and action-agnostic.
8. **Filter is non-destructive.** Filtering hides elements from a view; it does not alter the nesting structure between elements that survive the filter.

## A.11 Design decisions

Rationale-only. Each decision references the invariant or user story that motivates it.

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling for filtering, traversal, and rendering. Allowing arbitrary types would defeat the closed-set assumption in the filter UI and in `Object.keys`-style iteration. |
| Diagram-connection objects are partitioned from positional diagram objects in the pipeline. | Connections have no position; treating them as nodes would corrupt the layout graph. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*; an action is a *verb*. Sharing presets across selections requires action-agnosticism. |
| The view name suffix is stored separately from the base name. | The suffix is algorithm-derived and updates automatically when the algorithm changes; the base name is user-chosen. Storing them combined would silently rewrite user input on algorithm switch. |
| EXPAND_VIEW's target is derived from the existing visuals, not from the preset name. | The preset name is for *creating* a view. Expanding the selected view is a verb against that specific view, not a name-resolution. (See invariant A.10.4.) |
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| The related-elements panel is multi-block with cumulative semantics. | Real exploration patterns are layered: "from processes, get applications, then services". A single block can't express this. Cumulative ordering lets each block's filter scope its own additions. |
| Per-relation direction toggles are independent (not mutually exclusive). | "Both", "incoming only", "outgoing only" are all common needs. Forcing a choice would lose the most-common case (both). |
| The "neither direction lit" state is forbidden. | It is indistinguishable from "relation off"; allowing it confuses both the user and the encoded form. |
| Spinner recomputes fire on value-commit, not on keystroke. | Live counts can be expensive (relation traversal). Per-keystroke recompute is wasteful and produces flicker. |
| Coordinate conversion is engine-agnostic via `parentId` on result nodes. | Each engine handles nesting differently. Carrying parent info on the result is the simplest way to convert without engine-specific code in the orchestrator. |

---

# Part B — Current implementation

How Part A is realised in jArchi 1.12 / GraalVM JavaScript / SWT / Eclipse / Archi 5.9. Every section opens with `**Realises:** §A.X`. Where reality diverges from Part A, either Part A or the code is wrong — escalate.

## B.1 Rule files & precedence

**Realises:** §A.3 (boundaries — what constrains a change to this subsystem).

Documents and code that constrain how the View subsystem is built and modified. Listed by scope; narrower scopes override broader ones.

### Global (user-level, all projects)

| File | Role |
|---|---|
| `~/.claude/rules.md` | Rule priority chain (project shared docs → `~/ai/shared/coding-standards.md` → `~/.claude/settings.md`). |
| `~/.claude/settings.md` | Behaviour defaults: concise responses, edit existing files over creating new, do not narrate diffs. |
| `~/ai/shared/coding-standards.md` | Cross-project coding defaults. Repo-level `coding-standards.md` overrides on conflict. |

### Repo-wide

| File | Role |
|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | Project entry point. Fixed vocabulary. Pointers to other rule files. |
| [`project.md`](../../project.md) | Runtime constraints (jArchi 1.12 / GraalVM JS / Archi 5.9), domain scope. |
| [`architecture.md`](../../architecture.md) | Repo-wide module structure: `Scripts/<subsystem>/` organisation; entry-point vs library split. |
| [`coding-standards.md`](../../coding-standards.md) | Naming, module/export conventions, file headers, console-log discipline. |
| [`testing.md`](../../testing.md) | When/where/how to test. |
| [`readme.md`](../../readme.md) | User-facing intro. |

### Shared library (`Scripts/_lib/`)

Code, not documentation, but treated as fixed contract.

| File | Contract |
|---|---|
| [`Scripts/_lib/selection.js`](../_lib/selection.js) | `getSelection` / `getVisualSelection` recurse via `$(obj).children()`; canvas VOs handled by testing `.concept` against the selector. SSOT for `DIAGRAM_OBJECT_TYPES`. |
| [`Scripts/_lib/Common.js`](../_lib/Common.js) | `initConsoleLog`, `startCounter`, `endCounter`, `concept(obj)` (model-concept resolver). |
| [`Scripts/_lib/archi_folders.js`](../_lib/archi_folders.js) | `getFolderPath(path)` — resolves and lazily creates folder paths. |

### View subsystem

| File | Role |
|---|---|
| [`Scripts/View/CLAUDE.md`](CLAUDE.md) | Subsystem rules: pipeline model, hard rules, GUI display vocabulary, SWT/jArchi platform rules, `layoutDialog` architecture, relation-direction encoding contract. |
| [`Scripts/View/README.md`](README.md) | User-facing: how to invoke the scripts, what each preset does. |
| [`Scripts/View/ARCHITECTURE.md`](ARCHITECTURE.md) | **This file.** Part A is the design constraint; Part B tracks code reality. |

### Plan file (working directory only)

`~/.claude/plans/<plan-name>.md` — active WIP (pending phases, bug fixes, Done log). Not a rule file. Links to ARCHITECTURE.md as a constraint; does not duplicate it.

## B.2 Module inventory

**Realises:** §A.3 (module responsibilities) and §A.1 (scope).

### Module diagram

```
Entry points (.ajs — visible in Archi Script Manager)
┌─────────────────────────────────────────────────────────┐
│  _gui.ajs          Open GUI dialog                      │
│  _generate.ajs     New view, last preset                │
│  _expand.ajs       Expand view, last preset             │
│  _layout_only.ajs  Layout only — current view           │
│  presets/*.ajs     Wrapper: load preset → generate_view │
└───────────────────────────┬─────────────────────────────┘
                            │ calls
Library (.js — via require)
┌───────────────────────────▼─────────────────────────────┐
│  generate_view.js   Orchestrates selection → engine → view │
└──┬─────────────────────────────────────────────────────┘
   │
   ├─ defs.js (SSOT)            ← styles, algorithms, DIAGRAM_TYPES, ENGINE_MAPPING
   ├─ selection_pipeline.js     ← selection → filter → expansion → typed object set
   ├─ preset_io.js              ← read/write preset JSON; session persistence
   └─ engines/elk.js | dagre.js | dot.js   ← engine adapters

gui/dialog_main.js
  ├─ defs.js
  ├─ preset_io.js
  ├─ generate_view.js
  ├─ selection_pipeline.js      ← expandLayer + expandLayerCounts for live counts
  └─ gui/dialog_presets.js

Reused from _lib/
  selection.js       getSelection(), getVisualSelection()
  Common.js          initConsoleLog(), startCounter(), endCounter()
  archi_folders.js   getFolderPath() — resolves preset.view.folder
```

### Files inventory

| File | Role |
|---|---|
| `Scripts/View/_gui.ajs` | Open GUI dialog |
| `Scripts/View/_generate.ajs` | Read session; call `generate_view` with action `new_view` |
| `Scripts/View/_expand.ajs` | Read session; call `generate_view` with action `expand_view` |
| `Scripts/View/_layout_only.ajs` | Read session; call `generate_view` with action `layout_only` |
| `Scripts/View/presets/*.ajs` | Wrapper: load named preset → `generate_view` |
| `Scripts/View/lib/defs.js` | SSOT (Part A.9 algorithms; A.4 closed enums; ENGINE_MAPPING for A.7 adapters) |
| `Scripts/View/lib/generate_view.js` | Orchestrator (Part A.6 action semantics) |
| `Scripts/View/lib/selection_pipeline.js` | Pipeline (Part A.5 contract) |
| `Scripts/View/lib/preset_io.js` | Preset I/O + session passthrough |
| `Scripts/View/lib/engines/elk.js` | ELK adapter (Part A.7) |
| `Scripts/View/lib/engines/dagre.js` | Dagre adapter (Part A.7) |
| `Scripts/View/lib/engines/dot.js` | Graphviz adapter (Part A.7) |
| `Scripts/View/lib/gui/dialog_main.js` | SWT dialog (Part A.8) |
| `Scripts/View/lib/gui/dialog_presets.js` | Preset management sub-dialog |
| `Scripts/View/user_parameter/*.json` | Saved named presets |
| `Scripts/View/user_parameter/_session.json` | Last-used session (gitignored) |
| `Scripts/View/test_visual_props.ajs` | Verifies bounds-set does not reset visual properties (validates A.10.2) |

## B.3 SSOT realisations

**Realises:** §A.4 (data model) and §A.9 (algorithm capability matrix).

### Algorithms and styles

Defined in `Scripts/View/lib/defs.js`:

- `STYLES` — frozen map: style name → `{ algorithms: [...], tooltip }`.
- `ALGORITHMS` — frozen map: algorithm name → `{ engine, engineAlgorithmId, style, supportsNesting, activeParams, supportedOptions, labelPositionDefault, tooltip }`.
- `DEFAULT_PRESET` — frozen object that fills missing fields during validation.

### Diagram-object types

Single source of truth lives outside the View subsystem so non-View scripts can share it:

```javascript
// Scripts/_lib/selection.js
const DIAGRAM_OBJECT_TYPES = [
  "diagram-model-group", "diagram-model-connection", "diagram-model-note",
  "diagram-model-image", "diagram-model-legend", "diagram-model-reference",
  "archimate-diagram-model",   // jArchi 1.12 alias for view-reference VOs
];
```

`Scripts/View/lib/defs.js` imports this and exposes it as a set-like frozen object:

```javascript
const DIAGRAM_TYPES = Object.freeze(
  Object.fromEntries(DIAGRAM_OBJECT_TYPES.map(t => [t, true]))
);
```

Membership check: `type in Defs.DIAGRAM_TYPES`. Iteration: `Object.keys(Defs.DIAGRAM_TYPES)`.

**Why `"archimate-diagram-model"` is in the set.** jArchi 1.12 partly fixed a long-standing bug where view-reference VOs report their `.type` as `"archimate-diagram-model"` (the ArchimateView node type) rather than `"diagram-model-reference"`. The alias prevents scattered `=== "archimate-diagram-model"` guards throughout the code.

### Encoded relation type helpers

```javascript
encodeRelType(typeId, inSel, outSel)
decodeRelType(encoded) → { type, inSel, outSel }
```

Realise §A.4.3. UI controls round-trip through these.

### Preset validation

`validatePreset(raw)` deep-clones `DEFAULT_PRESET`, merges in raw values, validates option values against `algorithm.supportedOptions`, drops unknown top-level keys, normalises `relatedElements.layers`, and returns the result. Realises §A.10.5.

## B.4 Selection pipeline implementation

**Realises:** §A.5 (pipeline contract).

### Public API

```javascript
// Scripts/View/lib/selection_pipeline.js

buildObjectSet(uiSelection, preset, actionId) → {
  elements,           // ArchiElement[] — model elements (no folders, no view nodes)
  relations,          // ArchiRelation[] — between elements
  diagramObjects,     // DiagramObject[] — nodes only (no connections)
  diagramConnections, // diagram-model-connection DiagramObjects (drawn as edges)
  visualElements,     // existing canvas VisualElements (non-empty for EXPAND_VIEW + LAYOUT_ONLY)
  visualRelations,    // existing canvas VisualRelations  (non-empty for EXPAND_VIEW + LAYOUT_ONLY)
}

// Also exported for the dialog's live counts:
expandLayer(base, layer)              // added elements
expandLayerCounts(base, layer)        // { elements, elemCount, relCount }
```

### Step-by-step (NEW_VIEW / EXPAND_VIEW)

```
Step 0  LAYOUT_ONLY → _layoutOnlySet() → { visualElements, visualRelations, diagramObjects }
        Skip steps 1–6.

Step 1  Selection.getSelection(uiSelection, "*")  ← uniform model-tree + canvas
        _expandViews()                            ← splits result into
                                                    { modelCollection, diagramObjects }

Step 2  _applyFilter(modelCollection, filter)        ← element/relation types
        _applyDiagramFilter(diagramObjects, filter)  ← diagram types

Step 3  For each layer in preset.relatedElements.layers:
          _expandLayer(base, layer) → added ArchiElements (follows .rels())

Step 4  Drop relations, folders, view nodes from the collection.

Step 5  _findRelationsBetween(elements, relTypeFilter)

Step 6  Partition: diagramConnections (type === "diagram-model-connection")
                   from diagramObjects (everything else).

Step 7  (EXPAND_VIEW only)
        $(view).find("element") → visualElements
        $(view).find("relation") → visualRelations
```

### `_expandLayer` direction-aware traversal

Inside the traversal, for each `rel` on the current `element`:

```javascript
const isOutgoing = rel.source && rel.source.id === element.id;
if (!_matchesRelationTypeDir(rel.type, layer.relationTypes, isOutgoing)) return;
const other = isOutgoing ? rel.target : rel.source;
```

`_matchesRelationTypeDir` honours `:in` / `:out` suffixes per §A.4.3.

### `_layoutOnlySet`

Uses `$(view).find()` per type rather than `children()` (the latter misses view-references in jArchi 1.12).

## B.5 `generate_view` implementation

**Realises:** §A.6 (action semantics).

### Public API

```javascript
// preset is validated inside generate_view via validatePreset() before use.
// actionId is a runtime parameter — never stored in the preset.
generate_view(preset, uiSelection, actionId) → ArchimateView[]
```

### Action dispatch

| Action | Source | Engine | View target |
|---|---|---|---|
| `new_view` | Pipeline Elements (model selections contain no diagram objects) | Yes | New ArchimateView |
| `one_each` | One pipeline call per Element | Yes | One new ArchimateView per Element |
| `expand_view` | Existing VisualElements + VisualRelations + existing DiagramObjects (repositioned in place) + pipeline element additions | Yes | The selected view, in place (NOT a name lookup) |
| `layout_only` | Existing VisualElements + VisualRelations + DiagramObjects only | Yes | The selected view, in place |

### Key internal functions

**`_layoutOnlyView(preset, visualElements, visualRelations, diagramObjects)`**

- VisualElements → push raw `concept` (size controlled by layout).
- VisualRelations → push `concept`.
- DiagramObjects → push proxy with `_width/_height` from current bounds (size preserved).
- Build `voById: conceptId/voId → VisualElement/DiagramObject` for result lookup.
- Call `_buildLayoutGraph`, then `_applyResultToView(result, view, voById)`.

**`_buildLayoutGraph(preset, elements, routedRels, nestingRels, visualElements, diagramObjects)`**

- Nodes from `elements` (size from `_width/_height` if set, else preset defaults).
- Additional root-level nodes from `diagramObjects`.
- Nesting: `parentMap` built from `nestingRelationTypes`.
- Edges from `routedRels`.

**`_writeView(preset, result, elements, routedRels, nestingRels, viewName, diagramObjects, existingVoMap)`**

```
For each result node:
  existingVoMap[archiId] found?
    → reposition existing VisualElement (bounds-only, parent-relative)    ← EXPAND_VIEW
  el = $('#archiId').first(); el.type in DIAGRAM_TYPES?
    → skip (no recreation — diagram objects exist only on the source canvas)
  el && el.id (ArchiElement)?
    → view.add(el, x, y, w, h) or parentVisual.add(el, relX, relY, w, h) ← new VisualElement

After nodes: draw VisualRelations (view.add(relation, srcVE, tgtVE))
After relations: draw nesting connections.
```

**`_applyResultToView(result, view, extraVoById)`**

- Build `nodeById` map for parent lookup.
- For each result node: convert absolute → parent-relative via `rn.parentId`, set `vo.bounds`.
- For edges: `connection.deleteAllBendpoints()`, set new bendpoints.

### Appearance preservation per object type

| Object | Action | How appearance is preserved |
|---|---|---|
| VisualElement | LAYOUT_ONLY | Repositioned via `_applyResultToView` — `vo.bounds` set directly (parent-relative); visual properties not affected. |
| VisualElement | EXPAND_VIEW | Existing VOs: same repositioning. New VOs: default Archi style (`view.add(el, …)`). |
| VisualRelation | LAYOUT_ONLY | `connection.deleteAllBendpoints()` + new bendpoints set; style properties untouched. |
| VisualRelation | EXPAND_VIEW | Existing connections repositioned automatically when endpoints move; new connections: default style. |
| DiagramObject | LAYOUT_ONLY | Same as VisualElement — bounds-only. |
| DiagramObject | EXPAND_VIEW | Existing: repositioned via `vo.bounds`. New ones: not created (NEW_VIEW selections originate from the model, which has no diagram objects). |
| DiagramObject | NEW_VIEW | Not present (model selections contain no diagram objects). |

> Tested: `Scripts/View/test_visual_props.ajs` confirmed jArchi does **not** reset visual properties when `vo.bounds` is set (12 OK · 0 CHANGED). This is what makes A.10.2 (appearance preservation) hold.

## B.6 Engine adapter implementations

**Realises:** §A.7 (adapter contract).

Three adapters, one per engine. Each lives in `Scripts/View/lib/engines/` and implements `layout(graph) → result` matching A.7 shapes.

### ELK — https://eclipse.dev/elk/reference/

| Algorithm | ELK id | Direction | Routing | Nesting |
|---|---|---|---|---|
| Layered | `layered` | ✓ | Orthogonal, Polyline, Straight | Full (compound graph) |
| Tree | `mrtree` | ✓ | Orthogonal | Full |
| Force | `force` | — | — | None |
| Stress | `stress` | — | — | None |
| Radial | `radial` | — | — | **None** (crashes on compound graphs; spanning-tree pre-processing required) |
| Grid | `box` | — | — | Full |
| Pack | `rectpacking` | — | — | Full |

Nesting: `elk.hierarchyHandling: "INCLUDE_CHILDREN"` on the graph + `parent` property on nodes. Radial pre-processing: `_spanningTree` BFS helper removes cycles, joins disconnected components with virtual edges (`id: "__span_N"`, `_archiRelId: null` so `_applyResultToView` ignores).

### Dagre — https://github.com/dagrejs/dagre/wiki

| Algorithm | Direction | Routing | Nesting |
|---|---|---|---|
| Dagre | ✓ (`rankdir`) | Straight/Polyline only | Partial (`g.setParent()`) — inter-cluster edge routing limited |

### Graphviz (dot binary) — https://graphviz.org/docs/attrs/

| Algorithm | GUI label | Direction | Routing | Nesting |
|---|---|---|---|---|
| dot | Dot | ✓ | Orthogonal, Polyline, Straight, Spline | Cluster subgraph |
| twopi | Twopi | Radial | — | Limited (cluster) |
| neato | Neato | — | Polyline/Straight | Cluster |
| fdp | FDP | — | Polyline/Straight | Cluster |
| sfdp | SFDP | — | Polyline/Straight | None |
| circo | Circo | — | — | Limited |

## B.7 GUI dialog implementation

**Realises:** §A.8 (GUI structure).

### Top-to-bottom layout

1. Preset row (Load… · Save · Manage…)
2. Tabs: [Selection] [Layout]
3. View name and location (outside tabs)
4. Action row: [Cancel] | [Create new view group] | [Modify selected view group]

### Selection tab

```
┌─ Generate View ──────────────────────────────────────────────────────────┐
│  Preset: [Application Flow LR  ▼]  [Load…]  [Save]  [Manage…]           │
│  ┌─[Selection]──[Layout]──────────────────────────────────────────────┐ │
│  │ ┌─ Current selection ──────────────────────────────────────────┐   │ │
│  │ │               Elements  Relations  Diagrams  Views  Folders  │   │ │
│  │ │  Selected        [n]      [n]       [n]      [—]    [—]     │   │ │
│  │ │  Containing      [n]      [n]       [n]      [—]    [—]     │   │ │
│  │ │  Filtered        [n]      [n]       [n]      [—]    [—]     │   │ │
│  │ │  Related elem.1  [+n]     [+n]      [—]      [—]    [—]     │   │ │
│  │ │  Related elem.2  [+n]     [+n]      [—]      [—]    [—]     │   │ │
│  │ └──────────────────────────────────────────────────────────────┘   │ │
│  │ ┌─ Filter  (empty = all included) ────────────────────────────┐    │ │
│  │ │  Element types:   [search+available | chip selector]        │    │ │
│  │ │  Relation types:  [4-col alphabetical checkbox grid]        │    │ │
│  │ │  Diagram types:   [4-col grid, aligned with relations]      │    │ │
│  │ └──────────────────────────────────────────────────────────────┘   │ │
│  │ ┌─ Related elements ──────────────────────────────────────────┐    │ │
│  │ │  Add related elements to build up the selection from        │    │ │
│  │ │  connected model objects beyond the current filter.         │    │ │
│  │ │  [+ Add related elements]                                   │    │ │
│  │ │  ┌─ Related elements 1 ─[▲][▼]─[▾]─[✕]──────────────────┐ │    │ │
│  │ │  │  Relation types:                                       │ │    │ │
│  │ │  │  ☐ access [←][→]  ☐ aggregation [←][→]  …             │ │    │ │
│  │ │  │  Filter element types:  [chip selector]                │ │    │ │
│  │ │  │  Depth:  [1  ▲▼]                                       │ │    │ │
│  │ │  └────────────────────────────────────────────────────────┘ │    │ │
│  │ └──────────────────────────────────────────────────────────────┘   │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  ┌─ View name and location ───────────────────────────────────────────┐ │
│  │  Name: [_____________________________]  Suffix: [Layered         ] │ │
│  │  Folder: [/View/_Generated_________________________________________]│ │
│  └────────────────────────────────────────────────────────────────────┘ │
│  [Cancel]  ┌─ Create new view ─────────────┐  ┌─ Modify selected view ─┐│
│            │  [New view]  [One view each]   │  │  [Expand view ●]       ││
│            └───────────────────────────────┘  │  [Layout only  ●]      ││
│                                               └────────────────────────┘│
└──────────────────────────────────────────────────────────────────────────┘
```

### Layout tab

```
┌─[Selection]──[Layout]──────────────────────────────────────────────┐
│  Style:     [Flow          ▼]   Algorithm: [Layered  ▼]  (ELK)    │
│  Hierarchical layout optimized for directional flows and …         │
│  ──────────────────────────────────────────────────────────────    │
│  Flow direction:  [Left → Right  ▼]                                │
│  Relation lines:  [Orthogonal    ▼]   Label:  [Middle  ▼]          │
│  ──────────────────────────────────────────────────────────────    │
│  ┌─ Nesting structure ───────────────────────────────────────┐    │
│  │  ☐ access  ☐ aggregation  ☐ assignment  …                │    │
│  └───────────────────────────────────────────────────────────┘    │
│  ┌─ Container appearance ─┐  ┌─ Size and spacing ┐  ┌─ View size ┐│
│  │  spacing, checkboxes   │  │  spacing, width   │  │  max, ratio││
│  └────────────────────────┘  └───────────────────┘  └────────────┘│
│  ┌─ Reverse relation types ─────────────────────────────────────┐ │
│  │  ☐ access  ☐ aggregation  …                                  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│  Layer ranking (Dagre only):  [Balanced ▼]                        │
└────────────────────────────────────────────────────────────────────┘
```

### Action row

- Cancel group: unlabelled (`setText(" ")` for GTK height-match). Always enabled.
- Create new view: both buttons always enabled.
- Modify selected view: both buttons greyed when `hasVisual = false` (selection contains no canvas VOs and no model-tree view node).
- Default button: New view when `hasVisual = false`; Layout only when `hasVisual = true`.

### Filter group details

- **Element types**: SashForm with search box + available list (left) and chip panel (right). Chips show selected types as `Button` `"Label  ×"`; clicking removes.
- **Relation types**: 4-column checkbox grid, alphabetically sorted.
- **Diagram types**: 4-column grid aligned with Relation types.

### Related-elements blocks

Each block stored as:

```js
{
  container, body, titleLabel,
  btnUp, btnDown, btnCollapse, btnRemove,
  collapsed: boolean,
  relCheckGrid: { getEncoded, setEncoded, enable },
  typeSelector: { getSelected, setSelected, enable },
  depthSpinner,
  tableRow: { container, lblName, lblElems, lblRels },
}
```

- `_addRelatedBlock(ctx, layerData?)` — append block + table row.
- `_removeRelatedBlock(ctx, blockObj)` — dispose both; renumber survivors.
- `_moveRelatedBlock(ctx, blockObj, ±1)` — swap in array + reorder SWT widgets via `moveBelow`.
- `_toggleCollapseBlock(blockObj)` — sets `body.layoutData.exclude` + visibility.
- `_renumberAndReorderRelBlocks(ctx)` — fixes titles, table-row order, up/down button enabled state.

### Live counter trigger policy

- Checkboxes, direction toggles, chip add/remove, block reorder/add/remove → fire on `SWT.Selection` (immediate).
- Depth spinner → `SWT.Selection` (arrow click) + `SWT.FocusOut`. **Not** `SWT.Modify` — per-keystroke recompute is wasteful.

### GUI parameter tooltips

| Parameter | Tooltip |
|---|---|
| Flow direction | Direction of the main flow. Used in layered, tree, and directed flow algorithms. |
| Relation line style | How relation lines are drawn. Orthogonal: right-angle bends. Polyline: diagonal. Straight: direct line. Spline: smooth curve (Graphviz only, approximated). |
| Layer ranking | Strategy for placing elements in the same level. Balanced: minimises crossing. Uniform: equal rank increments. Top-aligned: pulled to the top. |
| Level spacing | Distance between hierarchy levels (px). Used in layered, tree, and flow layouts. |
| Element spacing | Minimum distance between elements (px). All layout types. |
| Element width / Element height | Width / height of all elements in the view (px). |
| Max width / Max height | Maximum view dimensions (px). 0 = unlimited. Graphviz scales output to fit when set. |
| Aspect ratio | Width-to-height ratio of generated layout. 0 = free. |
| Nesting relation types | Relations of these types are drawn as containment (parent-child boxes), not as lines. |
| Inner spacing | Minimum distance between elements inside a container (px). |
| Padding | Space between container border and contents (px). |
| Sort containers | Sort containers alphabetically within the same level. Unchecked: algorithm determines order. |
| Align same type | Resize leaf elements to match the tallest in their row, within same-type containers only. |
| Show in every container | An element in multiple containers appears in each. Default: appears only in the first. |
| Reverse relation types | Reverse direction before layout. Use to flip layout direction of specific relations. |
| Label position | Source / Middle / Target. Natural (Graphviz only): Graphviz-computed position, avoids overlap. |

## B.8 Engine parameter mappings

**Realises:** §A.9 (algorithm capability matrix) — concrete realisation in each engine.

### Algorithm × parameter compatibility

✓ active · — greyed out in GUI

| Parameter | Layered | Tree | Force | Stress | Radial | Grid | Pack | Dagre | Dot | Twopi | Neato | FDP | SFDP | Circo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Flow direction** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| **Relation line style** | ✓ | ✓ | — | — | — | — | — | — | ✓ | — | ✓ | ✓ | ✓ | — |
| **Layer ranking** | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| **Level spacing** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | ✓ | — | — | — | — |
| **Element spacing** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Element width/height** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Max width** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Max height** | — | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Aspect ratio** | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Nesting relation types** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Inner spacing** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Padding** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Sort containers** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| **Align same type** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| **Show in every container** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Reverse relation types** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| **Label position** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |

### ELK — Layered

| GUI parameter | ELK parameter | Mapping |
|---|---|---|
| Flow direction: L→R / R→L / T→B / B→T | `elk.direction` | `RIGHT` / `LEFT` / `DOWN` / `UP` |
| Relation lines: Orthogonal / Polyline / Straight | `elk.edgeRouting` | `ORTHOGONAL` / `POLYLINE` / `POLYLINE`+`elk.layered.unnecessaryBendpoints: true` |
| Level spacing | `elk.layered.spacing.nodeNodeBetweenLayers` | direct (px) |
| Element spacing | `elk.spacing.nodeNode` | direct (px) |
| Padding | `elk.padding` | `"[top=N,left=N,bottom=N,right=N]"` |
| Nesting | (pre-processing) | parent-child + `elk.hierarchyHandling: "INCLUDE_CHILDREN"` |
| Sort containers (checkbox) | `elk.layered.sortLeavesOnly` | checked → `false`; unchecked → `true` |
| Align same type | (two-pass post-processing) | Resize leaves to match tallest same-type sibling |

### Dagre

| GUI parameter | Dagre parameter | Mapping |
|---|---|---|
| Flow direction | `rankdir` | `LR` / `RL` / `TB` / `BT` |
| Layer ranking | `ranker` | `network-simplex` (Balanced) / `longest-path` (Uniform) / `tight-tree` (Top-aligned) |
| Level spacing | `ranksep` | direct (px) |
| Element spacing | `nodesep` | direct (px) |

### Graphviz — Dot

| GUI parameter | Graphviz attribute | Mapping |
|---|---|---|
| Flow direction | `rankdir` | `LR` / `RL` / `TB` / `BT` |
| Relation lines | `splines` | `ortho` / `polyline` / `line` / `spline` |
| Level spacing | `ranksep` | px ÷ 96 (inches) |
| Element spacing | `nodesep` | px ÷ 96 (inches) |
| Max width + Max height | `size` | `"W,H"` (inches) |
| Aspect ratio | `ratio` | float or `compress` |
| Nesting | `subgraph cluster_X` | pre-processing builds cluster subgraph |

## B.9 jArchi 1.12 / GraalVM platform notes

Implementation-only quirks of the host platform. None of these correspond to a Part A concept; they exist because the host has rough edges.

- `$(view).children()` does NOT return view-reference VOs → use `$(view).find(dt)` per `DIAGRAM_TYPES` key.
- `$(view).find("diagram-model-reference")` finds them but `.type` returns `"archimate-diagram-model"` → alias both keys in `DIAGRAM_TYPES`.
- `view.add(diagramObjProxy, x, y, w, h)` fails — 4-arg overload exists only for `ArchimateElementProxy`. Check `el.type in DIAGRAM_TYPES` before branching.
- `vo.bounds = …` does NOT reset visual properties (colors, fonts). Verified by `Scripts/View/test_visual_props.ajs` (12 OK · 0 CHANGED). This is what makes A.10.2 hold.
- `vo.bounds` is **relative to immediate parent** — view for root VOs, parent VO for nested. Engine outputs absolute coords; convert via `parentId`.
- `SWT.TOGGLE` `setSelection` programmatically does NOT fire a Selection event. Safe to set siblings without re-entry guards.
- GTK `setBackground(null)` / `setForeground(null)` — set explicit `SWT.COLOR_WIDGET_BACKGROUND` for inactive, system default for active.
- GTK rendering: `setBackground`/`setForeground` during `createDialogArea` may not render until first paint — use `display.asyncExec` in `create()` callback.
- `Java.extend(JavaClass, methods)` — 2-arg form required; methods baked into subclass at definition time.
- `Java.to(idxs, "int[]")` for explicit type to avoid GraalVM `setSelection(int[])` ambiguity.
- No `+1` on width/height. `view.add()` and `vo.bounds` accept exact values.

## B.10 Realisation of design decisions

**Realises:** §A.11 (design decisions) — where each decision lives in code.

| Part A decision | Realised in |
|---|---|
| Diagram-object types form a closed set | `Scripts/_lib/selection.js::DIAGRAM_OBJECT_TYPES` (SSOT) → `defs.js::DIAGRAM_TYPES` set-like frozen object |
| Connections partitioned from positional diagram objects | `selection_pipeline.js` step 6 — filters `type === "diagram-model-connection"` into a separate array |
| Action is a runtime parameter | `generate_view(preset, uiSelection, actionId)` — 3rd argument, never on `preset`. `validatePreset` would strip it. Dialog stores `ctx._actionId` separately. |
| View name suffix stored separately | `preset.view.suffix` separate from `preset.view.name`. `VIEW_NAME_SEPARATOR` is added by `_resolveViewName` when building the final name. Suffix auto-updates on algorithm change in `_updateViewNameAlgorithm`. |
| EXPAND_VIEW target from existing visuals | `_generateSingle` derives target view from `visualElements[0].view || diagramObjects[0].view`; `_writeView` accepts `existingView` parameter to bypass `_getOrCreateView`. |
| Folders and view nodes stripped before layout | `selection_pipeline.js` step 4 — excludes `type === "folder"` and `type === "archimate-diagram-model"`. |
| Related-elements panel is multi-block + cumulative | `dialog_main.js::_addRelatedBlock` / `_updateFilteredCount` — block N+1's base = block N's pruned output. |
| Per-relation direction toggles independent | `_relCheckGrid` — `←` and `→` are independent `SWT.TOGGLE` buttons (not radio). |
| "Neither direction lit" forbidden | `_relCheckGrid` toggle handlers revert a click that would unlight both. |
| Spinner recomputes on commit, not keystroke | Depth spinner binds `SWT.Selection` + `SWT.FocusOut`, not `SWT.Modify`. |
| Coordinate conversion engine-agnostic via `parentId` | Engine adapters set `parentId` on result nodes; `_applyResultToView` / `_writeView` apply `(rn.x - parent.x, rn.y - parent.y)`. |
| UI-only state partitioned (per A.10.6) | `_*`-prefixed keys (`_lastTabIndex`, …) preserved by `preset_io.readSession` after `validatePreset` strips unknowns. |
| ELK Radial spanning-tree pre-processing | `engines/elk.js::_spanningTree` — BFS over the graph; cycle edges dropped; virtual edges `id: "__span_N"` join disconnected components; `_applyResultToView` skips virtuals (`_archiRelId: null`). |
| Cancel group `setText(" ")` | `_buildActionRow` — single space so GTK reserves title-bar height matching labelled siblings. |
| Per-block element-type filter is block-scoped | `_expandLayer` applies `layer.elementTypes` after relation traversal; block's row count and feed-forward base both reflect the pruned set. |
