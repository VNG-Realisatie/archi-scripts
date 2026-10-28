# View Generation — Architecture Reference

Two-part SSOT for the View subsystem.

- **Part A — Architecture & Design** is the implementation-free constraint. Code must conform to it. Changes to Part A are real architectural decisions: debate them, then change Part A first, then update Part B + code.
- **Part B — Current implementation** is how Part A is realised in jArchi 1.12 / GraalVM JS / SWT today. Every Part B section opens with `**Realises:** §A.X`. Drift between A and B is a defect.

Update both parts as part of any commit that affects behaviour, public APIs, action semantics, or shared invariants. Done log entries tag the touched sections (`**Arch impact:** §A.x, §B.y`).

## Marker conventions

This document uses two HTML-comment markers (invisible in rendered Markdown, visible in source):

| Marker | Meaning | Lifecycle |
|---|---|---|
| `<!-- @mark: ... -->` | Transient review comment for the next editor/AI to act on. | Acted on, then removed. |
| `<!-- @keep: ... -->` | Permanent guidance — the section has been reviewed and signed off; do not rewrite. | Stays in the document. |

---

# Part A — Architecture & Design

Implementation-free. No language, library, framework, or tool names. Could survive a full rewrite in any other language or UI toolkit.

## A.1 Goals & scope
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

### A.2.1 Display vocabulary

Internal names must not appear in GUI labels or button text. Tooltips may use them parenthetically. When the Preset schema (§A.4.2) is described in prose, the GUI labels below are used so a reader familiar with the dialog can map fields to controls.

| Internal | GUI label |
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
| rectpacking (in labels) | Tight packing / Pack |
| Parameter file, config file | Preset |
| Per element | One view each |
| Layout only | Re-layout |

Algorithm display names:

| Internal | GUI label |
|---|---|
| layered | Hierarchical |
| mrtree | Tree |
| force | Organic |
| box | Grid |
| stress | Balanced organic |
| radial | Radial |
| dagre | Hierarchical (nested) |
| rectpacking | Pack |

## A.3 System architecture

### Module responsibilities

Three layers, top to bottom. Each layer talks only to the one below.

```
┌──────────────────────────────────────────────────────────┐
│  Layer 1 — Entry points                                  │
│  Two sibling flavours, both produce                      │
│  (selection, preset, action) and call the layer below:   │
│    • Configuration dialog — interactive preset editing,  │
│      live counts driven by the same pipeline the         │
│      generation API uses; on confirm, invokes the API.   │
│    • Preset-bound scripts — headless. Examples:          │
│      "new view from this selection using the default     │
│      preset", "expand the selected view", "re-layout     │
│      the current view", "generate using a named preset". │
│      Each reads a preset and invokes the API.            │
│  Only the dialog flavour can edit or save presets.       │
└────────────────────────┬─────────────────────────────────┘
                         │
┌────────────────────────▼─────────────────────────────────┐
│  Layer 2 — View-generation API                           │
│  Runs the folowing orchestration:                        |
|  Validate preset → selection pipeline →                  │
│  build an engine-independent layout graph → call an      │
│  engine adapter → write the positioned result to a view. │
│  The only writer to views in the system.                 │
│  Input: (selection, preset, action).                     │
└────────────────────────┬─────────────────────────────────┘
                         │ engine-independent layout graph
                         │ (named boundary; see §A.7)
┌────────────────────────▼─────────────────────────────────┐
│  Layer 3 — Engine adapters                               │
│  One adapter per layout engine. Consumes the layout      │
│  graph, computes positions for one algorithm family,     │
│  returns positioned output. Adapters do not know about   │
│  presets, selections, or views.                          │
└──────────────────────────────────────────────────────────┘

Shared infrastructure (used by Layers 1–2, not a layer itself):
  SSOT module           ← styles, algorithms, GUI parameters,
                          per-algorithm allowed values, engine
                          parameter mappings, action and routing
                          constants, the closed set of
                          diagram-object types.
  Selection pipeline    ← selection → filter → related-elements
                          expansion → typed object set.
  Preset persistence    ← read/write preset bundles; preserve
                          UI-only state across sessions.
```

### Boundaries

- **The configuration dialog owns preset editing.** It is the only entry-point flavour permitted to mutate a preset value or write to preset storage.
- **Preset-bound entry points are read-only over presets.** They load a preset, pass it to the view-generation API, and exit. No UI, no logic.
- **The view-generation API is the only writer to views.** No other layer mutates view contents.
- **The API → adapter boundary is the engine-independent layout graph.** Adapters must not see selections, presets, or views.
- **SSOT is read-only at runtime.** Adding an algorithm, a parameter, or a diagram-object type is a single-file change.
- **Engine adapters are isolated.** Adding a new engine requires no changes to other layers or other adapters.
- **The entry-points layer is replaceable.** Any caller that can produce a validated preset + a selection can drive the view-generation API directly.

## A.4 Data model

### A.4.1 Object types

Closed enumerations. Adding a type is a deliberate decision.

- **Element types** — drawn from the modelling language; identified by a stable type string.
- **Relation types** — drawn from the modelling language; identified by a stable type string. Each has a layout-weight used by some algorithms.
- **Diagram-object types** — the closed set of canvas-only object kinds. New types require a system change.

#### Selection contents

A user selection may contain any mix of the following. The selection pipeline (§A.5, Step 1) normalises them all into the same downstream object set.

- **From the model navigator:** folders (recursed into their contents), individual elements, individual relations.
- **From a view's canvas:** VisualElements, VisualRelations, DiagramObjects, or whole views (a whole-view selection yields the view's complete visual contents, split into model concepts and diagram objects).

Mixed selections (e.g. one folder + two canvas elements + a view) are valid; the pipeline produces one combined object set.

### A.4.2 Preset

A preset is a value, not a record in a database. It validates against a schema and round-trips losslessly to/from a stored form.

Field names below are the persisted JSON keys; the inline comments use the GUI labels users see in the dialog. See §A.2.1 for the full internal-to-display mapping.

```
Preset {
  name        : string                  // saved preset's identifier
  algorithm   : enum                    // Layout style

  params {
    direction, routing, labelPosition,  // Flow direction, Relation line
    ranking,                            // style, Layer ranking — discrete
                                        // choices, gated by Layout style

    reverseRelationTypes : RelTypeId[]  // Relations drawn reversed
    nestingRelationTypes : RelTypeId[]  // Relations drawn as nesting

    innerSpacing, padding, layerSpacing,    // Level spacing,
    elementSpacing,                         // Element spacing
    elementWidth, elementHeight : numbers   // element size

    maxWidth, maxHeight, aspectRatio        // View size constraints
                : numbers                   // (0 = unconstrained)

    sortContainers,        // Sort containers alphabetically
    alignSameType,         // Align elements within same-type containers
    showInEveryContainer   // Show in every container
                : booleans
  }

  filter {
    elementTypes  : ElTypeId[]          // empty = all
    relationTypes : EncodedRelTypeId[]  // each entry: "type" | "type:in" | "type:out"
    diagramTypes  : DgTypeId[]
  }

  relatedElements {
    layers : Layer[]                    // ordered, cumulative — one entry
                                        // per Relation Level block in the GUI
  }

  view {
    name, suffix, folder : strings      // naming for the New View action
  }
}

Layer {
  depth          : int   ≥ 1            // Relation levels (hops)
  elementTypes   : ElTypeId[]           // prune this block's additions
  relationTypes  : EncodedRelTypeId[]   // direction-aware (see below)
  diagramTypes   : DgTypeId[]           // unused (diagram objects don't traverse)
}
```

#### Encoded relation type strings

Used by the `EncodedRelTypeId[]` fields above (`filter.relationTypes`, `Layer.relationTypes`).

| Encoded value | Meaning |
|---|---|
| `"type"` | both directions |
| `"type:in"` | incoming only (traversed element is the relation's target) |
| `"type:out"` | outgoing only (traversed element is the relation's source) |

The UI never produces the empty-direction state ("relation checked but neither direction lit"); at least one direction is always selected when a relation is active.

### A.4.3 Action

A runtime parameter, not preset content. Persisting it on the preset is forbidden (it would be stripped by validation and is meaningless to share across selections).

## A.5 Pipeline contract

The pipeline takes a user selection plus a validated preset plus an action and returns a typed object set ready for layout.

### The VisualSet

`VisualSet` is the triple `{ visualElements, visualRelations, diagramObjects }` — the *existing* visual objects currently on a target view, captured together with their bounds, appearance, and visual parenthood.

The writer (§A.10.11) consults the VisualSet per result object: a counterpart found in the set is **repositioned** (appearance + parenthood preserved); an object with no counterpart is **created** with default appearance. The VisualSet is captured before any model traversal, so reposition-vs-create is independent of pipeline-stage ordering.

### Action-group dispatch

Pipeline behaviour is determined by the action's group, not by the individual action. The two groups mirror the configuration dialog's action row (§A.8):

| Group | Actions | VisualSet at pipeline start | Selection's role |
|---|---|---|---|
| **Create new view** | NEW_VIEW, ONE_EACH | Empty <!-- visual elements can be used as start of a selection for creating a new view. on the new view the selected elements are created as new visuals --> | Content source: every element in the selection (and its related-elements expansion) becomes part of the fresh view. |
| **Modify selected view** | EXPAND_VIEW, LAYOUT_ONLY | Captured from the target view | Identifies the target view; when only a subset of canvas objects is selected, also scopes the expansion. All existing visuals stay; selected visuals (and any added related elements) are repositioned. |

The selection's *source* — the model tree vs a view's canvas — is orthogonal to the group but constrains validity:

- **From the model tree** (folders, elements, relations) — Create-new-view group only; nothing in a model-tree selection identifies a target view.
- **From a view's canvas** (VisualElements / VisualRelations / DiagramObjects, or a view node) — either group:
  - With Create-new-view: clone-style — the selected canvas objects (and their related elements) become a fresh view; the source view is untouched.
  - With Modify-selected-view: in-place — the targeted view *is* the view the selection came from.

### Steps

LAYOUT_ONLY runs Step 1 only; Steps 2–6 are skipped because no model expansion applies.

```
Step 1  Selection → model + diagram objects (+ VisualSet)
  Recursively expand the user's selection.
  - Folders / containers → their contained elements.
  - Views → their visual contents (split into model concepts
    and diagram objects).
  - Canvas selections → the concepts behind the visual objects.
  For the Modify-selected-view group, also populate the
  VisualSet from the target view (bounds + appearance +
  parenthood). For the Create-new-view group, the VisualSet
  is empty.

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
  in the element set AND its type is in the EFFECTIVE relation
  filter — the union of the global relation-type filter and the
  relationTypes of every active related-elements block. A block
  that declares "follow type X" implicitly says "type-X relations
  belong in the result", so the global filter must not strip them.
  Empty union ⇒ all types allowed.

Step 6  Partition diagram objects
  diagram-model-connection objects are edges, not nodes — they
  have no logical position and never reach a layout engine as
  positional input. Keep them separate from positional diagram
  objects. Layout engines reroute existing connections automatically
  when their endpoints move.
```

### Invariants

- **Pure function.** Same selection + same preset + same model state → same returned object set.
- **No view mutation.** The pipeline reads only; it never edits a view.
- **Sets, not lists.** No duplicate concepts; no duplicate relations.
- **Filter is non-destructive to nesting.** Filtering an element does not remove its descendants from the nesting structure of other elements that survive the filter.

## A.6 Action semantics

Writing a layout result is **action-agnostic**. The single writing rule (§A.10.11):

> For each result object — if a counterpart exists in the VisualSet (§A.5), **reposition** it (appearance + visual parenthood preserved). Otherwise **create** it (default appearance).

Same rule for relations: existing → rewrite bendpoints; new → create.

Actions are organised into two groups that match the dialog's action row (§A.8). Each action differs from its sibling in only two things — (1) what objects feed the layout and (2) which view is the target. The writer doesn't know or care which action invoked it.

### Create new view group

VisualSet starts **empty**. Every result object is created with default appearance. The source view (if the selection came from a canvas) is never modified.

| Action | Object set | Target view |
|---|---|---|
| **NEW_VIEW** | Model selection expanded through filter + related-elements blocks. | A new view (created, or overwritten by name) in `preset.view.folder`. Named from `preset.view.name + suffix`. |
| **ONE_EACH** | Same as NEW_VIEW, run once per selected element. | One new view per selected element, named after the element. |

### Modify selected view group

VisualSet is **captured from the target view** before model expansion runs. All existing visuals stay; the writer repositions matches and creates the rest.

| Action | Object set | Target view |
|---|---|---|
| **EXPAND_VIEW** | Selection (a whole view, or a subset of its canvas objects) drives related-elements expansion. Visuals outside the selection stay in place; selected visuals and any added related elements are repositioned. | The selected view itself. `preset.view.name` is ignored. |
| **LAYOUT_ONLY** | The selected view's current contents only — no related-elements expansion. | The selected view itself. |

What "preserved" means concretely:
- **Appearance properties** (colours, fonts, line styles, sizes overridden by the user) — never touched by the writer; the engine produces sizes only as hints, the writer only sets `bounds`.
- **Visual parenthood** (which parent VO contains this VO on the canvas) — preserved (§A.10.9); the writer never moves a VO to a different parent.
- **Bendpoints on existing relations** — *rewritten* from the layout result, because the new endpoint positions invalidate old bendpoints. Style properties of the connection are untouched.

## A.7 Engine adapter contract

A layout engine is an opaque function. The system exposes one normalised interface that every engine adapter must implement.

### Input — `LayoutGraph`

```
LayoutGraph {
  algorithm      : enum                 // names a known algorithm
  nodes : [ {
    id           : string               // unique within this graph
    label        : string               // element name; positioned
                                        //   inside the node by the
                                        //   writer (no explicit
                                        //   coordinates in the result)
    elementType  : string               // for type-aware layouts
    width        : number
    height       : number
    parent       : string | null        // id of the parent node
                                        // (nesting)
  } ]
  edges : [ {
    id           : string
    source       : nodeId               // already swapped for
    target       : nodeId               //   reversed-typed relations
    label        : string
    weight       : number               // hint to layout-quality
  } ]
  options        : preset.params        // mapped per-algorithm

  // Edge label placement (algorithms without label support ignore this)
  labelPosition  : enum                 // Head / Middle / Tail

  // View-size constraints
  maxWidth       : number               // 0 = unconstrained
  maxHeight      : number               // 0 = unconstrained
  aspectRatio    : number               // 0 = unconstrained

  alignSameType  : boolean
  sortContainers : boolean
}
```

#### Reversed edges

For each relation type listed under the preset's **Relations drawn reversed** field (§A.4.2), the pipeline swaps `source` and `target` in the LayoutGraph so the engine traverses the edge in the reversed direction — meaningful for ranking algorithms (Layered, Tree, Dot) where direction drives hierarchy.

No additional flag is carried. An ArchiMate relation has its own intrinsic direction in the model; Archi renders any VisualRelation using that direction. The writer creates the VisualRelation against the original model relation — Archi handles the arrowhead and label orientation from there. The writer reconciles bendpoint order against the model relation's source/target rather than the LayoutResult edge's, when the two disagree.

The ArchiMate relation in the model is **never modified**; reversal is purely a layout-traversal concern.

### Output — `LayoutResult`

```
LayoutResult {
  nodes : [ {
    id, x, y, width, height,
    parentId : string | null           // for absolute → parent-
                                       //   relative conversion
  } ]                                  // x, y are ABSOLUTE
  edges : [ {
    id, sourceId, targetId,
    bendpoints   : [ { x, y } ]        // ABSOLUTE
    isStraight   : boolean
    labelX, labelY : number            // engine's chosen position
                                       //   for the edge label,
                                       //   derived from
                                       //   LayoutGraph.labelPosition;
                                       //   0,0 = no label placement
                                       //   (writer falls back to its
                                       //   default)
  } ]
  viewWidth, viewHeight : number
}
```

Element labels are intrinsic to nodes — the result carries no separate element-label coordinates. The writer places each node's `label` inside the node's bounds at its standard position.

### Adapter obligations

- Honour every parameter listed as **active** for the chosen algorithm; ignore inactive ones.
- Translate the parameter values from their UI/preset form to the engine's native form.
- Apply view-size constraints (`maxWidth`, `maxHeight`, `aspectRatio`) within whatever the engine supports natively; if the engine cannot enforce a constraint, the adapter must approximate or skip with a documented loss.
- Return absolute coordinates (the orchestrator converts to parent-relative).
- Never read or write a view directly. Adapters operate only on `LayoutGraph` / `LayoutResult`.

## A.8 GUI structure

The UI is a tabbed dialog that drives the orchestrator.

### Top-to-bottom layout

1. Preset row — load · save · manage.
2. Tabs: **Selection** | **Layout**.
3. View name and location (outside tabs).
4. Action row: **Cancel** | **Create new view** group | **Modify selected view** group.

### Selection tab

The Selection tab decides *which* objects feed the layout: the counts table on top, then the global filter, then any related-elements blocks.

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
│  │ │  Element types:   [search + available | chip selector]      │    │ │
│  │ │  Relation types:  [4-col alphabetical checkbox grid]        │    │ │
│  │ │  Diagram types:   [4-col grid, aligned with relations]      │    │ │
│  │ └──────────────────────────────────────────────────────────────┘   │ │
│  │ ┌─ Related elements ──────────────────────────────────────────┐    │ │
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

The Layout tab decides *how* the objects are positioned: style and algorithm at the top, then flow / routing, nesting structure, sizing, reverse list, ranker.

```
┌─[Selection]──[Layout]──────────────────────────────────────────────┐
│  Style:     [Flow          ▼]   Algorithm: [Layered  ▼]  (engine) │
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
│  Layer ranking (when applicable):  [Balanced ▼]                   │
└────────────────────────────────────────────────────────────────────┘
```

### Action-row semantics

The two groups here are the same groups §A.6 uses to organise action semantics.

- **Cancel** — always enabled. Discards changes. Preserves UI-only state for next open.
- **Create new view** group — always enabled. Contains *New view* and *One view each*. VisualSet at pipeline start is empty (§A.5).
- **Modify selected view** group — enabled only when the selection identifies an existing view (canvas VOs or a view node from the tree). Contains *Expand view* and *Layout only*. VisualSet is captured from the target view at pipeline start (§A.5).

### Live counts in the selection table

The table shows the current selection's content: rows for Selected (raw), Containing (after recursive expansion), Filtered (after the global filter), and one row per Related-elements block (each block shows the count it ADDS, not the cumulative total).

**Counts do not have their own pipeline.** The dialog invokes the same selection-pipeline functions the view-generation API uses (§A.5), passing the current preset and selection; the count cells render whatever the pipeline returns. Determinism (§A.5 invariants — *Pure function*) guarantees the displayed counts match the post-confirm result exactly. Counts update on every change to a filter control, relation toggle, element-type filter, depth control, and block ordering operation. Spinner widgets defer recompute to value-commit (arrow click, focus loss) — not per-keystroke.

### Related-elements blocks

Dynamic, ordered list. Each block is:

- Title with reorder (up/down), collapse/expand, and remove controls.
- Relation-types control with per-relation direction toggles (`←` incoming / `→` outgoing). At least one direction must be lit when a relation is active.
- Element-type filter (block-scoped — prunes only what this block adds).
- Depth control (≥ 1).

Block N's pruned output is block N+1's base (see A.5).

### User-facing vocabulary

GUI labels and button text use the display names defined in §A.2.1. Internal engine names may appear in tooltips parenthetically.

## A.9 Algorithm capability matrix

Not all algorithms support all parameters. A parameter that is inactive for the chosen algorithm is greyed in the UI; its value is kept (preserved across algorithm changes) but ignored at runtime.

Each algorithm declares:

- A **style** (Flow / Hierarchy / Network / Circular / Compact) — used for grouping in the UI only.
- A **nesting capability** (full / partial / cluster / none) — drives whether nesting parameters are active.
- A **self-loop capability** (boolean) — whether the engine routes self-loops (edges with source = target) into bendpoints; engines that don't pass the edge through without routing, and Archi renders a default loop.
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
9. **EXPAND_VIEW preserves visual parenthood.** When repositioning an already-on-view VO, its bounds are written relative to its *current* parent in the view tree — not relative to the parent the layout engine inferred. Existing visual structure (canvas groupings, nested compositions) is preserved; only positions within each parent rearrange. New elements are added at the layout's absolute coordinates, possibly under a layout-derived parent if that parent is also being newly added.
10. **Write order is parent-first.** The write path sorts layout-result nodes so every node is processed after its parent. A child is never repositioned or added before its parent. This is what makes A.10.3 (parent-relative coordinates) hold under arbitrary engine output order, and prevents drawing-order overlap (a parent added after a child at the same level would render on top of it).
11. **Layout writing is action-agnostic.** The orchestrator decides (a) which objects feed the layout and (b) which view is the target. The writer applies one rule per result object — *exists* → reposition (bounds only; appearance + parenthood preserved); *otherwise* → create (default appearance). Same rule for relations: existing → rewrite bendpoints; new → create. There is one write function; per-action branches inside the writer are forbidden.
12. **Algorithm-capability masking.** Preset values for parameters not in the chosen algorithm's `activeParams` list are ignored at runtime. The raw preset stays intact (see §A.9: values are kept for UI restoration on algorithm switch); the orchestrator derives an effective parameter view from `(preset, algorithm.activeParams)` at entry and passes only that view to the pipeline, engine adapter, and writer. A non-empty inactive value reaching runtime is a defect — log it.

## A.11 Design decisions

Rationale-only. Each decision references the invariant or user story that motivates it.

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling for filtering, traversal, and rendering. Allowing arbitrary types would defeat the closed-set assumption in the filter UI and in `Object.keys`-style iteration. |
| Non-positional objects — Relations, VisualRelations, and diagram-model-connections — are partitioned from positional objects throughout the pipeline. | An edge has endpoints, not coordinates. Treating any of these as nodes would corrupt the layout graph; the same partition rule applies uniformly to all three kinds. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*; an action is a *verb*. Sharing presets across selections requires action-agnosticism. |
| The view name suffix is stored separately from the base name. | The suffix is algorithm-derived and updates automatically when the algorithm changes; the base name is user-chosen. Storing them combined would silently rewrite user input on algorithm switch. |
| EXPAND_VIEW's target is derived from the existing visuals, not from the preset name. | The preset name is for *creating* a view. Expanding the selected view is a verb against that specific view, not a name-resolution. (See invariant A.10.4.) |
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| The related-elements panel is multi-block with cumulative semantics. | Real exploration patterns are layered: "from processes, get applications, then services". A single block can't express this. Cumulative ordering lets each block's filter scope its own additions. |
| Per-relation direction toggles are independent (not mutually exclusive). | "Both", "incoming only", "outgoing only" are all common needs. Forcing a choice would lose the most-common case (both). |
| The "neither direction lit" state is forbidden. | It is indistinguishable from "relation off"; allowing it confuses both the user and the encoded form. |
| Spinner recomputes fire on value-commit, not on keystroke. | Live counts can be expensive (relation traversal). Per-keystroke recompute is wasteful and produces flicker. |
| Coordinate conversion is engine-agnostic via `parentId` on result nodes. | Each engine handles nesting differently. Carrying parent info on the result is the simplest way to convert without engine-specific code in the orchestrator. |

## A.12 Rules & precedence

The View subsystem operates inside a layered rule system. A change to any module is constrained by rules from every applicable scope; conflicts are resolved by **scope narrowness — narrower wins**.

### Scopes (broad → narrow)

| Scope | Governs |
|---|---|
| **User-level** | Personal collaboration defaults — response shape, edit-vs-create preference, narration discipline. Applies to every project the user works on. |
| **Cross-project shared** | Coding conventions common across the user's projects — naming, module layout, file headers, log discipline. |
| **Repo-wide** | Project entry point and vocabulary; runtime constraints (host platform / language version); repo-wide module structure; testing policy; user-facing README. |
| **Shared library** | Code-level contracts every subsystem in the repo relies on — selection helpers, common utilities, folder resolution. Treated as fixed once published. |
| **Subsystem** | Internal rules for one subsystem: its pipeline model, hard rules, platform-specific behaviours, dialog architecture, this two-part SSOT. |

### Precedence rule

For any single concern, the narrowest scope that addresses it is authoritative. Broader-scope rules apply only where narrower scopes are silent. This lets the subsystem override repo conventions for genuine local needs, and the repo override cross-project defaults, without contradiction.

### Working-directory artefacts (not rules)

Plan files and similar transient working notes are not part of the precedence chain. They link *to* the rule hierarchy as a constraint; they never override it.

§B.1 lists the concrete files that realise each scope.

---

# Part B — Current implementation

How Part A is realised in jArchi 1.12 / GraalVM JavaScript / SWT / Eclipse / Archi 5.9. Every section opens with `**Realises:** §A.X`. Where reality diverges from Part A, either Part A or the code is wrong — escalate.

## B.1 Rule files (realisation of §A.12)

**Realises:** §A.12 (rules & precedence).

Concrete files that fill each scope from §A.12. Listed broadest → narrowest; narrower wins on conflict.

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
| [`Scripts/View/CLAUDE.md`](CLAUDE.md) | Subsystem rules: pipeline model, hard rules, SWT/jArchi platform rules, `layoutDialog` architecture, relation-direction encoding contract. (Display vocabulary lives in §A.2.1.) |
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

Realise §A.4.2 (Encoded relation type strings). UI controls round-trip through these.

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
  diagramConnections, // diagram-model-connection DiagramObjects (edges)
  visualElements,     // existing canvas VisualElements (EXPAND_VIEW + LAYOUT_ONLY)
  visualRelations,    // existing canvas VisualRelations  (EXPAND_VIEW + LAYOUT_ONLY)
  existingView,       // target ArchimateView (EXPAND_VIEW + LAYOUT_ONLY) or null
}

// Also exported for the dialog's live counts:
expandLayer(base, layer)              // added elements
expandLayerCounts(base, layer)        // { elements, elemCount, relCount }
```

### Step-by-step (uniform for every action)

```
Step 1  Selection.getSelection(uiSelection, "*")  ← uniform model-tree + canvas
        _expandViews()                            ← splits result into
                                                    { modelCollection, diagramObjects }
        _collectExistingVisuals — EXPAND_VIEW + LAYOUT_ONLY only.
        Walks the selected view (or canvas VOs) and populates
        { existingView, visualElements, visualRelations }.
        Other actions get null / empty.

Step 2  _applyFilter(modelCollection, filter)        ← element/relation types
        _applyDiagramFilter(diagramObjects, filter)  ← diagram types

Step 3  Related-elements expansion — SKIPPED for LAYOUT_ONLY (the action's
        contract is to re-layout what's there, not add to it).
        For other actions:
          For each layer in preset.relatedElements.layers:
            _expandLayer(base, layer) → added ArchiElements (follows .rels())

Step 4  Drop relations, folders, view nodes from the collection.

Step 5  Compute relTypeFilter = union(global filter, every active block's relationTypes).
        _findRelationsBetween(elements, relTypeFilter).
        Realises §A.5 step 5.

Step 6  Partition: diagramConnections (type === "diagram-model-connection")
                   from diagramObjects (everything else).
```

### `_expandLayer` direction-aware traversal

Inside the traversal, for each `rel` on the current `element`:

```javascript
const isOutgoing = rel.source && rel.source.id === element.id;
if (!_matchesRelationTypeDir(rel.type, layer.relationTypes, isOutgoing)) return;
const other = isOutgoing ? rel.target : rel.source;
```

`_matchesRelationTypeDir` honours `:in` / `:out` suffixes per §A.4.2 (Encoded relation type strings).

## B.5 `generate_view` implementation

**Realises:** §A.6 (action semantics), §A.10.11 (action-agnostic writer).

### Public API

```javascript
// preset is validated inside generate_view via validatePreset() before use.
// actionId is a runtime parameter — never stored in the preset.
generate_view(preset, uiSelection, actionId) → ArchimateView[]
```

### Flow (single path)

```
_generateSingle(preset, uiSelection, actionId, viewNameOverride?):
  1. objectSet = Pipeline.buildObjectSet(uiSelection, preset, actionId)
  2. Assign each relation a role: nesting (parent-child) vs routed (line).
  3. Determine target view:
       EXPAND_VIEW / LAYOUT_ONLY → objectSet.existingView
       NEW_VIEW / ONE_EACH       → _getOrCreateView(folder, name)
  4. graph  = _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects)
  5. result = engineAdapter.layout(graph)
  6. _writeView(preset, result, objectSet, view, nestingRels)   ← single writer
```

### Key internal functions

**`_buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects)`**

- Nodes from `elements` (size from `_width/_height` if set, else preset defaults).
- Additional root-level nodes from `diagramObjects` (size from current canvas bounds).
- Skip `diagram-model-connection` objects — they are edges, not nodes (§A.5 step 6).
- Nesting via `parentMap` built from `nestingRelationTypes`; compound nodes carry `parent`.
- Edges from `routedRels`.

**`_writeView(preset, result, objectSet, view, nestingRels)` — the only writer**

Action-agnostic. Realises §A.10.11. Single rule per object:

```
build existingVoByConcept     : conceptId → VisualElement
build existingVoByVoId        : VO id     → VisualElement | DiagramObject
build existingRelByConcept    : conceptId → VisualRelation
sorted = _sortNodesParentFirst(result.nodes, nodeById)        // §A.10.10

For each rn in sorted:
  archiId = rn.id without _occ_ suffix
  existing = existingVoByConcept.get(archiId) || existingVoByVoId.get(archiId)
  IF existing:
    reposition: existing.bounds = { x: rn.x - parentAbsOff.x, y: rn.y - parentAbsOff.y, w, h }
                (parent-first sort guarantees parent's NEW bounds are in place)
    visualIndex[rn.id] = existing
  ELSE:
    el = $('#archiId').first()
    skip if not found or el.type in DIAGRAM_TYPES (phantom diagram-VO match)
    parentVisual = rn.parentId ? visualIndex[rn.parentId] : null
    visualIndex[rn.id] = (parentVisual || view).add(el, relX, relY, w, h)

For each re in result.edges:
  archiRel = $('#re.id').first()
  connection = existingRelByConcept.get(archiRel.id)
            ?? view.add(archiRel, visualIndex[re.sourceId], visualIndex[re.targetId])
  _applyEdgeStyle(connection, re, preset)   // delete-all + set bendpoints + label position

For each nestingRel:
  skip if already on view (existingRelByConcept has it)
  view.add(rel, srcV, tgtV)
```

**`_sortNodesParentFirst(nodes, nodeById)`** — copy of nodes sorted by depth (root first, stable within depth). Engine-agnostic.

**`_getParentAbsOffset(vo)`** — walks the VO's parent chain in the view tree, sums parent bounds.x/y. Under parent-first iteration the parent's NEW bounds have already been applied, so reading them yields the parent's *new* absolute position. The writer therefore needs no separate "planned position" lookup — `_getParentAbsOffset` is sufficient.

**`_applyEdgeStyle(connection, re, preset)`** — sets `textPosition` (label) and rewrites bendpoints (deleteAll + add). Style properties (colour, line width) are not touched.

### Deleted in the unified design

- `_layoutOnlyView` — replaced by the single `_generateSingle` path.
- `_applyResultToView` — replaced by the unified `_writeView` (which handles the "all-existing, none-new" LAYOUT_ONLY case via the same per-object rule).
- `_findParentNodeId` — callers use the local `nodeById[rn.parentId]` map.
- `_computeExistingParentOffset` — `_getParentAbsOffset` under parent-first iteration is sufficient.
- `_layoutOnlySet` (in pipeline) — replaced by the unified pipeline.

### Appearance preservation per object type

| Object | Action | How appearance is preserved |
|---|---|---|
| VisualElement | LAYOUT_ONLY / EXPAND_VIEW | Existing VOs: `vo.bounds` set (parent-relative); visual properties not affected by jArchi. |
| VisualElement | NEW_VIEW / new in EXPAND_VIEW | Default Archi style via `view.add(el, …)`. |
| VisualRelation | LAYOUT_ONLY / EXPAND_VIEW (existing) | `_applyEdgeStyle` rewrites bendpoints + label position; style (colour, width) untouched. |
| VisualRelation | NEW_VIEW / new in EXPAND_VIEW | `view.add(rel, srcV, tgtV)` + bendpoints; default style. |
| DiagramObject | LAYOUT_ONLY / EXPAND_VIEW (existing) | Same as VisualElement — bounds-only. |
| DiagramObject | NEW_VIEW | Not present (model selections contain no diagram objects). |

> Tested: `Scripts/View/test_visual_props.ajs` confirmed jArchi does **not** reset visual properties when `vo.bounds` is set (12 OK · 0 CHANGED). This is what makes A.10.2 (appearance preservation) hold.

## B.6 Engine adapter implementations

**Realises:** §A.7 (adapter contract).

Three adapters, one per engine. Each lives in `Scripts/View/lib/engines/` and implements `layout(graph) → result` matching A.7 shapes.

### ELK — https://eclipse.dev/elk/reference/

| Algorithm | ELK id | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|---|
| Layered | `layered` | ✓ | Orthogonal, Polyline, Straight | Full (compound graph) | ✓ (`SelfLoopDistribution` / `SelfLoopOrdering`) |
| Tree | `mrtree` | ✓ | Orthogonal | Full | — (passthrough) |
| Force | `force` | — | — | None | — (passthrough) |
| Stress | `stress` | — | — | None | — (passthrough) |
| Radial | `radial` | — | — | **None** (crashes on compound graphs; spanning-tree pre-processing required) | — (passthrough) |
| Grid | `box` | — | — | Full | — (no edge routing) |
| Pack | `rectpacking` | — | — | Full | — (no edge routing) |

Nesting: `elk.hierarchyHandling: "INCLUDE_CHILDREN"` on the graph + `parent` property on nodes. Radial pre-processing: `_spanningTree` BFS helper removes cycles, joins disconnected components with virtual edges (`id: "__span_N"`, `_archiRelId: null` so `_applyResultToView` ignores). Self-loops on algorithms marked "passthrough" emerge in the LayoutResult with empty bendpoints; Archi draws its default loop.

### Dagre — https://github.com/dagrejs/dagre/wiki

| Algorithm | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|
| Dagre | ✓ (`rankdir`) | Straight/Polyline only | Partial (`g.setParent()`) — inter-cluster edge routing limited | — (Dagre core drops self-loops; passthrough to LayoutResult with empty bendpoints) |

### Graphviz (dot binary) — https://graphviz.org/docs/attrs/

| Algorithm | GUI label | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|---|
| dot | Dot | ✓ | Orthogonal, Polyline, Straight, Spline | Cluster subgraph | ✓ (native) |
| twopi | Twopi | Radial | — | Limited (cluster) | ✓ (native) |
| neato | Neato | — | Polyline/Straight | Cluster | ✓ (native) |
| fdp | FDP | — | Polyline/Straight | Cluster | ✓ (native) |
| sfdp | SFDP | — | Polyline/Straight | None | ✓ (native) |
| circo | Circo | — | — | Limited | ✓ (native) |

## B.7 GUI dialog implementation

**Realises:** §A.8 (GUI structure). The dialog mockups and structural decisions live in §A.8; this section covers implementation only — widget classes, SWT/GTK behaviours, JS storage shapes, event policy, tooltip strings.

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
| EXPAND_VIEW target from existing visuals | Pipeline returns `existingView` populated from the selected view; `_generateSingle` uses it directly, bypassing `_getOrCreateView`. |
| Action-agnostic writer (§A.10.11) | One `_writeView` function. Per-object rule: exists → reposition (bounds only); else → create. Same rule for relations: existing → rewrite bendpoints; new → add. Deleted helpers: `_layoutOnlyView`, `_applyResultToView`, `_findParentNodeId`, `_computeExistingParentOffset`, `_layoutOnlySet`. |
| Folders and view nodes stripped before layout | `selection_pipeline.js` step 4 — excludes `type === "folder"` and `type === "archimate-diagram-model"`. |
| Related-elements panel is multi-block + cumulative | `dialog_main.js::_addRelatedBlock` / `_updateFilteredCount` — block N+1's base = block N's pruned output. |
| Per-relation direction toggles independent | `_relCheckGrid` — `←` and `→` are independent `SWT.TOGGLE` buttons (not radio). |
| "Neither direction lit" forbidden | `_relCheckGrid` toggle handlers revert a click that would unlight both. |
| Spinner recomputes on commit, not keystroke | Depth spinner binds `SWT.Selection` + `SWT.FocusOut`, not `SWT.Modify`. |
| Coordinate conversion engine-agnostic via `parentId` | Engine adapters set `parentId` on result nodes; `_writeView` applies `(rn.x - parent.x, rn.y - parent.y)` for newly-added VOs, and reads the parent's current bounds via `_getParentAbsOffset` for repositioning existing VOs (parent-first iteration ensures parent's NEW bounds are in place). |
| UI-only state partitioned (per A.10.6) | `_*`-prefixed keys (`_lastTabIndex`, …) preserved by `preset_io.readSession` after `validatePreset` strips unknowns. |
| ELK Radial spanning-tree pre-processing | `engines/elk.js::_spanningTree` — BFS over the graph; cycle edges dropped; virtual edges `id: "__span_N"` join disconnected components; `_writeView` skips virtuals (`_archiRelId: null`). |
| Cancel group `setText(" ")` | `_buildActionRow` — single space so GTK reserves title-bar height matching labelled siblings. |
| Per-block element-type filter is block-scoped | `_expandLayer` applies `layer.elementTypes` after relation traversal; block's row count and feed-forward base both reflect the pruned set. |
