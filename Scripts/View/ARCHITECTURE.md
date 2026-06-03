# View Generation — Architecture Reference

Two-part SSOT for the View subsystem.

- **Part A — Architecture & Design** is the implementation-free constraint. Code must conform to it. Changes to Part A are real architectural decisions: debate them, then change Part A first, then update Part B + code.
- **Part B — Current implementation** is how Part A is realised in jArchi 1.12 / GraalVM JS / SWT today. Every Part B section opens with `**Realises:** [section link](#section)`. Drift between A and B is a defect.

Update both parts as part of any commit that affects behaviour, public APIs, action semantics, or shared invariants. Done log entries tag the touched sections in Part A and B section links.

## Marker conventions

This document uses two HTML-comment markers (invisible in rendered Markdown, visible in source):

|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Marker&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Meaning | Lifecycle |
|---|---|---|
| `<!-- @mark: .. -->` | Transient review comment for the next editor/AI to act on. | Acted on, then removed. |
| `<!-- @keep: .. -->` | Permanent guidance — the section has been reviewed and signed off; do not rewrite. | Stays in the document. |

---

# Part A — Architecture & Design

A JavaScript script that runs in jArchi, the scripting plugin for Archi.

Part A contains the functional specification and intentionally avoids prescribing technical solutions. It defines the requirements and rules that the script implementation must fulfill.

Part B describes the current implementation, including the code structure, design decisions, architecture, rationale, and other implementation details.

## Goals & scope
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

## Vocabulary & display labels

The canonical vocabulary realises hard rule #11 in [ai/rules.md](../../ai/rules.md): one name per concept across users, docs, logs, variable names, function names, and data structures. Exceptions only for technical data-structure roles (e.g. `parentMap`, `childIds`), documented once below and reverted to the canonical term at every user-facing surface.

### Terms

Stable terms. Used in code, UI labels, and documentation. No synonyms.

| Area                | Term                 | Definition                                                                                                                                                                                                     |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model               | **element**          | A model concept (a typed thing in the modelling language).                                                                                                                                                     |
|                     | **relation**         | A directed, typed connection between two elements at the model level.                                                                                                                                          |
|                     | **view**             | A diagram: a positioned arrangement of elements, relations, and diagram objects. A model element may appear on many views.                                                                                     |
| Visual              | **VisualElement**    | The placement of one element on one view's canvas. Has bounds, may have appearance overrides, and points back to its model element.                                                                            |
|                     | **VisualRelation**   | The drawing of one relation on one view's canvas. Has endpoints (VisualElements) and bendpoints.                                                                                                               |
|                     | **occurrence**       | A visual appearance of an element in a view. A unique element normally has one occurrence; with `showInEveryContainer: true` it can have several.                                                              |
| VisualElement role  | **container**        | Drawn as a box around one or more other VisualElements.                                                                                                                                                        |
|                     | **nested element**   | Drawn inside a container; not itself a container.                                                                                                                                                              |
|                     | **standalone**       | Drawn at view root; no children, not inside anything.                                                                                                                                                          |
|                     | **extra occurrence** | Second or Nth visual appearance of the same element under another container (when `showInEveryContainer: true`). Applies whether the duplicated visual is a nested element or a sub-container.                 |
| VisualRelation role | **nesting**          | Drawn as box-in-box (the nested element sits inside the container's box; no line). Driven by `params.nestingRelationTypes`.                                                                                    |
|                     | **connection**       | Drawn as a line between two boxes. Every VisualRelation is either a nesting or a connection.                                                                                                                   |
| Canvas-only         | **diagram object**   | A canvas-only object with no model concept: note, group, image, legend, view-reference, or a connection drawn between diagram objects. Belongs to exactly one view.                                            |
| Subsystem           | **Layout**           | Algorithmic positioning of all visible objects on a view.                                                                                                                                                      |
|                     | **Preset**           | A named, persistable bundle of layout configuration (algorithm, parameters, filters, related-elements rules, and target naming).                                                                               |
|                     | **Action**           | What the system does on invocation: create a new view, create one view per element, expand an existing view, or re-layout an existing view. Runtime parameter; never stored in a preset.                       |
|                     | **Session**          | The last-used configuration, restored automatically when the UI opens.                                                                                                                                         |
| Terminology         | **Counter rule**     | *Relations* is a model-layer term. View-side counters use **nestings** and **connections**. Pipeline counters (Filtered-base, Step-N-adds) use **relations**. Total-to-view uses the nesting/connection split. |

Internal-only data-structure names (`parentMap`, `childIds`, `containerIds`, `occurrenceMap`, `routedRels`, `nestingRels`, `parentRels`) describe algorithmic structures, not counted concepts. They are an implementation concern — see [Internal data structures](#internal-data-structures) in Part B.

### Display vocabulary

Internal names must not appear in GUI labels or button text. Tooltips may use them parenthetically. When the [Preset schema](#preset-schema) is described in prose, the GUI labels below are used so a reader familiar with the dialog can map fields to controls.

| GUI label | Internal |
|---|---|
| Relation line | Edge |
| Relation line style | Edge routing |
| Diagram | Graph |
| View | Graph |
| Layout style | Algorithm, engine |
| Level | Rank, layer |
| Flow direction | Direction, orientation |
| Element alignment | Node placement |
| Level spacing | Layer spacing |
| Element spacing | Node spacing |
| Relation levels | Depth, hops |
| Layer ranking | Ranker |
| Tight packing, Pack | rectpacking |
| Preset | Parameter file, config file |
| One view each | Per element |
| Re-layout | Layout only |
| Show connection for multiple occurrences | showExtraOccurrenceConnections |
| Align width by level | alignWidthSameType |
| Snap columns to grid | snapColumnsToGrid |

## System architecture

### Module responsibilities

Three layers, top to bottom. Each layer talks only to the one below.

```text
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Layer 1 — Entry points                                                               │
│                                                                                      │
│ Two sibling entry paths. Both produce (selection, preset, action) and invoke         │
│ the View-generation API.                                                             │
│                                                                                      │
│ 1. Generate View dialog                                                              │
│    - Define selection, layout, filters, and expansion rules                          │
│    - Live counters use same selection pipeline as generation                         │
│    - On confirmation, invokes API                                                    │
│                                                                                      │
│ 2. Preset-bound scripts (headless)                                                   │
│    - Read preset and invoke API                                                      │
│    - Generate view from selection using preset                                       │
│    - Re-layout or Expand selected view                                               │
│                                                                                      │
│ Only dialog can create, edit, or save presets.                                       │
└──────────────────────────────┬───────────────────────────────────────────────────────┘
                               │
                               │ Input: (selection, preset, action)
                               │
┌──────────────────────────────▼───────────────────────────────────────────────────────┐
│ Layer 2 — View-generation API                                                        │
│                                                                                      │
│ System orchestrator and sole writer to views.                                        │
│                                                                                      │
│ 1. Validate preset                                                                   │
│ 2. Selection pipeline                                                                │
│ 3. Build layout graph                                                                │
│ 4. Call engine adapter                                                               │
│ 5. Write result to view                                                              │
│                                                                                      │
│ Uses engine-independent layout graph (see Engine adapter contract)                   │
└──────────────────────────────┬───────────────────────────────────────────────────────┘
                               │
                               │ Engine-independent layout graph
┌──────────────────────────────▼───────────────────────────────────────────────────────┐
│ Layer 3 — Engine adapter API                                                         │
│                                                                                      │
│ One adapter per engine.                                                              │
│                                                                                      │
│ 1. Consume layout graph                                                              │
│ 2. Compute positions                                                                 │
│ 3. Return positioned output                                                          │
│                                                                                      │
│ No knowledge of presets, selection, dialogs, or views.                               │
└──────────────────────────────────────────────────────────────────────────────────────┘

Shared infrastructure (used by Layers 1–2)

SSOT module
1. Styles
2. Algorithms
3. GUI parameters
4. Allowed values
5. Action/routing constants
6. Diagram-object types
7. Preset defaults

Selection pipeline
1. Selection
2. Filtering
3. Expansion
4. Typed object set

Preset persistence
1. Read preset bundles
2. Write preset bundles
3. Restore session state
```


### Boundaries

#### View-generation API (Layer 1 → Layer 2)

The public entry point is `generate_view(selection, preset, action)`. 
Three inputs:
- **Selection** — the objects the user picked in Archi. 
  - Can be model-tree items (folders, elements, relations) or canvas objects (VisualElements, VisualRelations, DiagramObjects) from a view, or a whole view node.
  - Mixed selections are valid. Passed as-is; the pipeline normalises them.
- **Preset** — a validated configuration bundle:
  - *Algorithm* — which layout engine and algorithm to use.
  - *Layout parameters* — spacing, direction, routing style, view-size constraints, nesting and reversal flags.
  - *Filters* — element types, relation types (with per-direction toggles), diagram-object types to include.
  - *Related-elements layers* — an ordered list of expansion steps, each specifying which relation types to follow, how many hops, and an element-type pruning filter.
  - *View naming* — folder and name used when creating new views.
- **Action** — a runtime verb, never part of the preset:
  - `NEW_VIEW` — create a fresh view from the full selection.
  - `ONE_EACH` — create one view per selected element.
  - `EXPAND_VIEW` — add related elements to an existing view; existing visuals stay in place.
  - `LAYOUT_ONLY` — re-layout the existing view contents without adding or removing elements.

Output: `ArchimateView` — the views that were written or updated, with all elements positioned and relations routed.

#### Engine adapter API (Layer 2 → Layer 3)

The adapter contract is `layout(LayoutGraph) → LayoutResult`. Input:
- **Nodes** — one per element or diagram object. Each carries an id, display label, element type, fixed width and height (leaf nodes) or no size (containers — the engine sizes them from their children), and an optional parent id expressing nesting.
- **Edges** — one per connection (relation drawn as a line). Each carries source and target node ids (already swapped for reversed relation types), a label, and a layout weight. Nestings (relations resolved to containment) are expressed via `parent` on the child node, not as edges.
- **Options** — algorithm-specific parameters translated by the adapter from the preset (direction, spacing, routing style, padding, etc.).
- **View-size constraints** — at most one of maxWidth, maxHeight, or aspectRatio is non-zero at a time.
- **Flags** — `alignWidthSameType`, `sortContainers`.

Output:
- **Nodes** — same ids, with absolute x/y/width/height and a parentId (for the orchestrator's parent-relative conversion).
- **Edges** — same ids, with absolute bendpoints and an optional label position. Straight edges carry `isStraight: true`.
- **viewWidth, viewHeight** — natural bounding box of the result.

#### Boundary rules

- **The entry-points layer is replaceable.** Any caller that can produce a validated preset + a selection can drive the view-generation API directly.
- **The Generate View dialog owns preset editing.** It is the only entry-point flavour permitted to change a preset value or write to preset storage.
- **Preset-bound entry points are read-only over presets.** They load a preset, pass it to the view-generation API, and exit. No UI, no logic.
- **The view-generation API is the only writer to views.** No other layer changes view contents.
- **The API → adapter boundary is the engine-independent layout graph.** Adapters must not see selections, presets, or views.
- **Engine adapters are isolated.** Adding a new engine requires no changes to other layers or other adapters.
- **Strict SSOT / adapter separation.** The SSOT contains only functional definitions: algorithm metadata, GUI parameters, display labels, allowed values, and preset defaults. All engine-specific translations — option names, unit conversions, flag values — live exclusively in the engine adapters. Adding a new algorithm requires one SSOT entry and one adapter entry; no other module changes.

## Data model

### Object types

Closed enumerations. Adding a type is a deliberate decision.

- **Element types** — drawn from the modelling language; identified by a stable type string.
- **Relation types** — drawn from the modelling language; identified by a stable type string. Each has a layout-weight used by some algorithms.
- **Diagram-object types** — the closed set of canvas-only object kinds. New types require a system change.

### Selection contents

A user selection may contain any mix of the following. The [Selection pipeline](#selection-pipeline), [Action-group dispatch](#action-group-dispatch) normalises them all into the same downstream object set.

- **From the model navigator:** folders (recursed into their contents), individual elements, individual relations.
- **From a view's canvas:** VisualElements, VisualRelations, DiagramObjects, or whole views (a whole-view selection yields the view's complete visual contents, split into model concepts and diagram objects).

Mixed selections (e.g. one folder + two canvas elements + a view) are valid; the pipeline produces one combined object set.

### Preset schema

A preset is a value, not a record in a database. It validates against a schema and round-trips losslessly to/from a stored form.

Field names below are the persisted JSON keys; the inline comments use the GUI labels users see in the dialog. See [Vocabulary & display labels](#vocabulary--display-labels) for the full internal-to-display mapping.

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

    sortContainers,                 // Sort containers alphabetically
    alignWidthSameType,             // Align width by level (key kept for back-compat)
    snapColumnsToGrid,              // Snap columns to grid
    showInEveryContainer,           // Show in every container
    showExtraOccurrenceConnections  // Show connection for multiple occurrences
                : booleans
  }

  filter {
    elementTypes  : ElTypeId[]          // empty = all
    relationTypes : EncodedRelTypeId[]  // each entry: "type" | "type:in" | "type:out"
    diagramTypes  : DgTypeId[]
  }

  relatedElements {
    steps : Step[]                      // ordered, chain — one entry per Step
                                        // block in the GUI. Step N (N≥2) traverses
                                        // from step N-1's additions only.
  }

  view {
    name, folder : strings              // naming for the New View action
  }

  viewSizeMode  : enum                  // "none" | "maxWidth" | "maxHeight" | "aspectRatio"

  appearance {
    styleByProperty {
      element {
        enabled     : boolean           // colour elements by a model property value
        elementType : ElTypeId | ""     // "" = all types
        property    : string            // property name (case-sensitive)
        colorRange  : string            // ColorBrewer scheme name
      }
      relation {
        enabled    : boolean            // colour relations by a property value
        relTypes   : EncodedRelTypeId[] // same encoding as filter.relationTypes
        property   : string             // property name on the relation (case-sensitive)
        colorRange : string             // ColorBrewer scheme name
        lineWidth  : number             // 0 = no change; 1 = Normal, 2 = Medium, 3 = Heavy
      }
    }
    styleByRelatedProperty {
      enabled    : boolean              // colour elements by a property of connected relations
      relTypes   : EncodedRelTypeId[]   // same encoding as filter.relationTypes
      property   : string              // property name on the relation (case-sensitive)
      colorRange : string              // ColorBrewer scheme name
    }
    styleByConnectedElement {
      enabled       : boolean           // colour elements by a property of connected elements
      relTypes      : EncodedRelTypeId[]// same encoding as filter.relationTypes
      elementType   : ElTypeId | ""     // "" = all target types
      property      : string            // property name on the connected element (case-sensitive)
      colorRange    : string            // ColorBrewer scheme name
      conflictColor : string            // hex fill colour when multiple targets match
    }
    nestingLevel {
      fontEnabled          : boolean    // vary font size by nesting depth
      rootFontSize         : number     // font size for root containers (pt)
      rootFontBold         : boolean    // bold at root level
      fontDecreasePerLevel : number     // pt decrease per level deeper
      colorEnabled         : boolean    // vary fill colour by nesting depth
      rootColor            : string     // hex fill colour for root containers (darkest)
      darkenPerLevel       : number     // percent lightened per level toward leaves (0–50)
    }
    highlightRepeated {
      enabled    : boolean              // assign unique colour to each element appearing > once
      colorRange : string               // ColorBrewer scheme name (Chroma.js)
    }
  }
}

Step {
  depth          : int   ≥ 1            // Recurrence (hops within this step)
  elementTypes   : ElTypeId[]           // prune this step's additions
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

Per relation type, two independent direction checkboxes are shown: **○ ←** (incoming) and **○ →** (outgoing). There is no separate "activate this relation" master toggle.

| UI state | Encoded form | Meaning |
|---|---|---|
| ☑ ← only | `"type:in"` | incoming only |
| ☑ → only | `"type:out"` | outgoing only |
| ☑ ← and ☑ → | `"type"` | both directions |
| ○ ← and ○ → | *(absent from list)* | follow all — unconstrained |

Empty selection (neither direction checked) is meaningful: the relation type is absent from the encoded list. [Step 5](#steps) treats "empty union → all types allowed", so the absent type is followed in all directions. No UI enforcement prevents the both-unchecked state; it is the idiomatic "don't filter" state.

### Action

A runtime parameter, not preset content. Persisting it on the preset is forbidden (it would be stripped by validation and is meaningless to share across selections).

### VisualSet

`VisualSet` is the triple `{ visualElements, visualRelations, diagramObjects }` — the *existing* visual objects currently on a target view, captured together with their bounds, appearance, and visual parenthood.

The writer ([Invariants](#invariants)) consults the VisualSet per result object: a counterpart found in the set is **repositioned** (appearance preserved; parenthood re-derived from [Nesting](#nesting)); an object with no counterpart is **created** with default appearance. The VisualSet is captured before any model traversal, so reposition-vs-create is independent of pipeline-stage ordering.

For actions in the **Create new view** group, the VisualSet is empty. For actions in the **Modify selected view** group, it is captured from the target view before the pipeline runs.

## Generate View dialog

The **Generate View dialog** lets you define a selection and layout, then run view generation. You can save your configuration as a named preset and reload it later. Top-to-bottom structure:

```
┌─ Generate View ──────────────────────────────────────────────────────────────┐
│  [Delete]  Preset: [Application Flow LR *  ▼]  [Save]  [Save As…]             │
│                                                                              │
│  ┌─[Selection]──[Layout]──────────────────────────────────────────────────┐  │
│  │                                                                        │  │
│  │   (Selection tab content below)                                        │  │
│  │                                                                        │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌─ Generated view ───────────────────────────────────────────────────────┐  │
│  │  Folder: [/View/_Generated________________]  Name: [Customer view____] │  │
│  │  Output:                                                               │  │
│  │    elements:    18 containers · 92 nested elements                     │  │
│  │    relations:   11 nestings · 98 connections                           │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  [Cancel]  ┌─ Create new view ─────────────────┐  ┌ Modify selected view ─┐  │
│            │  [New view]    [One view each]    │  │  [Expand ●]           │  │
│            └───────────────────────────────────┘  │  [Layout only ●]      │  │
│                                                   └───────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Preset row

The preset row sits above the tab strip. Controls, left to right:

- **[Delete]** — deletes the selected preset file after a confirm dialog. Disabled when the **Default** preset is active (Default cannot be deleted). Switches the combo to Default and reloads it after deletion.
- **Preset combo** — lists all saved presets. Selecting a preset applies it immediately; unsaved changes to the previous preset are silently discarded. When settings differ from the loaded preset, an asterisk label (`*`) appears next to the combo. The combo tooltip shows the preset's description.
- **[Save]** — silently overwrites the currently selected preset file with the current settings. Clears the modified indicator.
- **[Save As…]** — opens a dialog with Name, Folder, and Description fields. Creates a new preset file and selects it in the combo. Covers both "create new" and "rename" use cases (rename = Save As new name; old file stays and can be deleted with [Delete]).

**Default preset.** A preset named `Default` always exists; it is created on first run if absent. [Delete] is permanently disabled for Default.

**Session continuity.** On dialog open, the last-used preset is restored automatically. Session state is user-local — it is never shared as a preset. It covers the complete dialog state including UI-only fields (active tab, collapsed blocks) that are not part of the [Preset schema](#preset-schema). Session and preset are stored separately; loading a named preset does not overwrite the session's UI-only fields.

### Selection tab

The Selection tab decides *which* objects feed the layout: the counts group at the top, then the global filter, then any related-elements blocks.

```
  ┌─[Selection]──[Layout]────────────────────────────────────────────────────┐
  │  ┌─ Current selection ─────────────────────────────────────────────────┐ │
  │  │  Selected:    3 elements, 2 relations, 1 view, 1 folder;            │ │
  │  │               First object: Business Actor: Customer                │ │
  │  │  Containing:  12 elements, 8 relations                              │ │
  │  │  Filtered:    9 elements, 6 relations                               │ │
  │  │  ────────────────────────────────────────────────────────────────   │ │
  │  │  Filter element types  (empty = all included):                      │ │
  │  │  [search field]  ┊  [chip panel: × BusinessActor  × Application]    │ │
  │  │  Filter relation types:                                             │ │
  │  │  access ○← ○→  aggregation ○← ○→  assignment ○← ○→  …               │ │
  │  │  Filter diagram types:                                              │ │
  │  │  ○ group  ○ note  ○ image  ○ legend                                 │ │
  │  └─────────────────────────────────────────────────────────────────────┘ │
  │  ┌─ Related elements ─────────────────────────────────────────────────┐  │
  │  │ Expand by following relations to neighbouring elements.            │  │
  │  │ Each block below adds a step.            [+ Add related elements]  │  │
  │  │ ┌─ Step 1 ──────────────────────────────────────────────────────┐  │  │
  │  │ │  Added:  4 elements, 3 relations        [▲] [▼] [▾] [✕]       │  │  │
  │  │ │  ──────────────────────────────────────────────────────────── │  │  │
  │  │ │  access ○← ○→  aggregation ○← ○→  assignment ○← ○→  …         │  │  │
  │  │ │  Filter element types:  [chip selector]                       │  │  │
  │  │ │  Relation levels:  [1  ▲▼]                                    │  │  │
  │  │ └───────────────────────────────────────────────────────────────┘  │  │
  │  │ ┌─ Step 2 ──────────────────────────────────────────────────────┐  │  │
  │  │ │  Added:  nothing                        [▲] [▼] [▸] [✕]       │  │  │
  │  │ └───────────────────────────────────────────────────────────────┘  │  │
  │  └────────────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────┘

```

#### Current selection & live counts

The **Current selection** group shows three summary lines and a per-block counter inside each related-elements block:

- **Selected** — raw count of what the user picked in the UI. Includes a `First object: <Type>: <Name>` suffix naming the first iterated object.
- **Containing** — count after recursive expansion of folders and views.
- **Filtered** — count after the global filter is applied.
- **Added** — one counter per block, in the block's header row. Shows what the block ADDS (not cumulative). Zero-count renders as `Added: nothing`.

Only types with count > 0 are rendered on each line. Empty selection renders `Selected: nothing` (no First-object suffix).

Counts are driven by the same selection-pipeline functions the view-generation API uses ([Selection pipeline](#selection-pipeline)) — specifically `Pipeline.expandStep(stepInput, step)` per block — so the displayed counts match the post-confirm result exactly. Counts update on every change to a filter control, relation toggle, element-type filter, depth control, and block ordering operation.

Each refresh emits a grouped block to the Archi console (mirroring the pipeline's own block on action click) so the user can compare prediction to result:

```
GUI — before dialog:
  Selected:    0 elements · 0 relations · 1 view · 0 diagram objects · 0 folders
  Containing: 110 elements · 113 relations · 0 diagram objects
  Filtered:   110 elements · 113 relations · 0 diagram objects
GUI — live counters:
  Filtered base:    8 elements ·  11 relations · 0 diagram objects
  Step 1 adds:    102 elements ·  98 relations
  ──────────────────────────────────────────────
  Total to view:
    elements:    18 containers ·  92 nested elements ·   0 standalones ·   0 extra occurrences
    relations:   11 nestings   ·  98 connections
    diagram:      0 diagram objects
```

The `Total to view` row is grouped into three sub-lines: **elements** (containers / nested elements / standalones / extra occurrences), **relations** (nestings / connections), and **diagram** (diagram objects). All sub-lines always print; every subfield prints regardless of value. Column alignment is preserved across runs.

The additive rule is exact: `Filtered.elements + Σ Step N.adds.elements = Total.elements` AND `Filtered.relations + Σ Step N.adds.relations = Total.relations`. Per-step `adds.relations` is a true delta against the previous cumulative state (rels-between-cumulative under the effective filter, minus the prior count), not a count of raw-selection relations.

The on-screen "Generated view" group (folder/name fields, below the tabs) carries a multi-line `Output:` strip with the same grouped totals, **hide-zero**: subfields with value 0 are omitted, and a sub-line whose every subfield is 0 is skipped entirely. Live counter refreshes (every filter change, block edit, depth change, block reorder) push the same values to that label and to the console.

#### Global filter

Three independent filter controls below the counts. Filtering is visibility-only; it does not alter nesting structure ([Invariants](#invariants) — filter is non-destructive).

- **Filter element types** — a search field with a chip panel. Empty = all element types included.
- **Filter relation types** — per relation type, two independent direction checkboxes (○← incoming, ○→ outgoing). Empty (both unchecked) = follow all directions for that type. See [Preset schema](#preset-schema) for encoding.
- **Filter diagram types** — checkboxes for each diagram-object type in the closed set. Unchecked = included.

#### Related-elements blocks

The Related-elements group opens with a one-line explanation and a `[+ Add related elements]` button on the same row. Below it sits a dynamic, ordered list of blocks. Each block is a `Step N` group:

- **Header row**: `Added:` count label; reorder (▲ ▼); collapse/expand (▾/▸); remove (✕).
- **Relation types**: per relation type, two independent direction checkboxes (same encoding as the global filter).
- **Element-type filter** (block-scoped — prunes only what this block adds).
- **Relation levels** (≥ 1; the number of hops the block follows).

Each step's additions feed the next step's input — chain ([Steps](#steps) section Step 3). An empty step terminates the chain.

### Layout tab

The Layout tab decides *how* objects are positioned.

```
┌─[Selection]──[Layout]─────────────────────────────────────────────────────┐
│ ┌─ Algorithm ───────────────────────────────────────────────────────────┐ │
│ │      Flow:  ○ Layered   ○ Dagre    ○ Dot                              │ │
│ │ Hierarchy:  ○ Tree                                                    │ │
│ │   Network:  ○ Force     ○ Stress   ○ Neato    ○ FDP    ○ SFDP         │ │
│ │   Compact:  ○ Grid      ○ Pack                                        │ │
│ │  Circular:  ○ Radial    ○ Twopi    ○ Circo                            │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Element size and spacing ────────────────────────────────────────────┐ │
│ │  Width: [140 ▲▼]  Height: [60 ▲▼]  Element spacing: [40 ▲▼]           │ │
│ │  Layer spacing: [180 ▲▼]                                              │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Direction ───────────────────────────────────────────────────────────┐ │
│ │  Flow direction:  [Left → Right  ▼]                                   │ │
│ │  ── Reversed - draw these relation types in other direction ────────  │ │
│ │  ○ access  ○ aggregation  ○ assignment  ○ association  …              │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Connections ─────────────────────────────────────────────────────────┐ │
│ │  Routing: [Orthogonal ▼]  Label: [Middle ▼]  Cycle breaking: [Greedy ▼] │
│ │  Layer ranking: [Balanced ▼]                                          │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Nesting     ─────────────────────────────────────────────────────────┐ │
│ │  Draw these relation types as containers                              │ │
│ │  ○ access  ○ aggregation  ○ assignment  ○ association  …              │ │
│ │  ── Inside container ───────────────────────────────────────────────  │ │
│ │  Inner spacing: [10 ▲▼]  Padding: [10 ▲▼]                             │ │
│ │  ☑ Sort containers ○ Align width by level   ○ Snap columns to grid    │ │
│ │  ○ Show in every container  ○ Show connection for multiple occurrences│ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ View dimensions ─────────────────────────────────────────────────────┐ │
│ │  Hint for view sizing:  ● None   ○ Width   ○ Height   ○ Aspect ratio  │ │
│ │  Max width: [0 ▲▼]   Max height: [0 ▲▼]   Aspect ratio: [16:9 ▼]     │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

#### Algorithm selection

Algorithms are organised into five styles in a radio table. All algorithms for all styles are always visible simultaneously; no combo or dropdown is used.

| Style | Algorithms | Tooltip |
|---|---|---|
| Flow | Layered, Dagre, Dot | Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models. |
| Hierarchy | Tree | Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition. |
| Network | Force, Stress, Neato, FDP, SFDP | Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks. |
| Compact | Grid, Pack | Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries. |
| Circular | Radial, Twopi, Circo | Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures. |

Algorithm radio button tooltips:

| Algorithm | Tooltip |
|---|---|
| Layered | Process models, application flows, service interactions with strong directionality and nested containers (ELK) |
| Tree | Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK) |
| Force | Application landscapes and integration networks emphasising emergent connectivity without nesting (ELK) |
| Stress | Dependency maps and impact analysis emphasising relational distance (ELK) |
| Radial | Domain overviews and hub-and-spoke structures (ELK) |
| Grid | Portfolio overviews, catalogs and inventories with strong nesting support (ELK) |
| Pack | High-level landscape summaries and grouped overviews with strong nesting support (ELK) |
| Dagre | Fast process and application flows with limited nesting support (Dagre) |
| Dot | Structured process models and dependency flows with strong nesting support (Graphviz) |
| Neato | Integration networks and application landscapes with partial nesting support (Graphviz) |
| FDP | Clustered integration networks with partial nesting support (Graphviz) |
| SFDP | Large-scale integration networks and dependency maps without nesting support (Graphviz) |
| Twopi | Radial hierarchies like organisation charts and capability maps with limited nesting support (Graphviz) |
| Circo | Cyclic dependency and domain overviews with limited nesting support (Graphviz) |

#### Element size and spacing

| Parameter | Tooltip |
|---|---|
| Element width / height | Width / height of all elements in the view (px). |
| Element spacing | Minimum distance between elements (px). All layout types. |
| Layer spacing | Distance between hierarchy levels (px). Used in layered, tree, and flow layouts. |

#### Direction

Parameters in this group are active only for algorithms that support them (see [Algorithm capability matrix](#algorithm-capability-matrix)); unsupported parameters are greyed.

| Parameter | Tooltip |
|---|---|
| Flow direction | Direction of the main flow. Used in layered, tree, and directed flow algorithms. |

**Reversed** — a checkbox per relation type. Checked types have their source/target swapped in the layout graph so the engine traverses them in the reversed direction — meaningful for ranking algorithms where direction drives hierarchy. See [Engine adapter contract](#engine-adapter-contract).

#### Connections

Parameters in this group are active only for algorithms that support them; unsupported parameters are greyed.

| Parameter | Tooltip |
|---|---|
| Routing | How connection lines are drawn. Orthogonal: right-angle bends. Polyline: diagonal. Straight: direct line. Spline: smooth curve (Graphviz only, approximated). |
| Label | Source / Middle / Target. Natural (Graphviz only): Graphviz-computed position, avoids overlap. |
| Cycle breaking | How relation cycles are broken before layout. Greedy reverses the fewest edges; Default uses DFS-based removal. Has no effect when the diagram contains no cycles. |
| Layer ranking | Strategy for placing elements in the same level. Balanced: minimises crossing. Uniform: equal rank increments. Top-aligned: pulled to the top. |

#### Nesting

The group label is **"Draw these relation types as containers"** — a checkbox per relation type selects which types are drawn as containment (parent-child boxes) instead of lines. See [Nesting](#nesting) for nesting semantics.

**Inside container** parameters (active when at least one nesting type is selected):

| Parameter | Tooltip |
|---|---|
| Inner spacing | Minimum distance between elements inside a container (px). |
| Padding | Space between container border and contents (px). |
| Sort containers | Sort containers alphabetically within the same level. Unchecked: algorithm determines order. |
| Align width by level | Align box widths across the whole hierarchy by nesting level. Widths telescope — each level is one padding ring wider than the level inside it, anchored at the leaf width; leaves take the level width exactly, containers use it as a floor (never below their content). ELK algorithms only. See [Width alignment by level](#width-alignment-by-level). |
| Snap columns to grid | Line leaf columns up top-to-bottom by nudging ELK's layout into alignment — each column snaps to the median of where its leaves already sit, preserving ELK's spacing and adding only the small offset for alignment. Position-only post-pass; leaves are not resized. ELK algorithms only. See [Column snapping](#column-snapping). |
| Show in every container | An element in multiple containers appears in each. Default: appears only in the first. |
| Show connection for multiple occurrences | When an element has multiple nesting parents, draw a connection line from its primary occurrence to the other parent (analytical view). Off: containment only. Active only when *Show in every container* is on. |

#### View dimensions

Four radio modes: **None / Width / Height / Aspect ratio**, prefixed by the label **"Hint for view sizing:"**. Selecting a mode enables the corresponding control; the others retain their values but are greyed and ignored at runtime. Not every algorithm supports every view-size parameter; unsupported parameters are greyed regardless of mode selection (see [Algorithm capability matrix](#algorithm-capability-matrix)).

| Parameter | Tooltip |
|---|---|
| Max width / Max height | View size target (px). 0 = unconstrained. When the natural layout is smaller than the target, node positions are spread outward until the bounding box reaches the target; if already larger, no action (compression is forbidden — see [Engine adapter contract](#engine-adapter-contract)). |
| Aspect ratio | Width-to-height ratio of generated layout. 0 = free. |

`viewSizeMode` is stored in the preset ([Preset schema](#preset-schema)) so the active radio is restored on load. Old presets without this field default to the first non-zero view-size value found.

### Appearance tab

The Appearance tab applies **post-write visual styling** (fill colours, fonts, line widths) to elements and connections on the generated view. Styling runs as a separate pass after the layout writer has positioned all elements — it does not affect positions or sizes and is not subject to the [No post-layout scaling](#no-post-layout-scaling) rule.

```
┌─[Selection]──[Layout]──[Appearance]──────────────────────────────────────────┐
│ ┌─ Style by property ─────────────────────────────────────────────────────┐  │
│ │  ○ Element type: [Any ▼]                                               │  │
│ │     Property: [Status ▼]  Color: [Set1 ▼] [====]                       │  │
│ │  ○ Relation type: [Any ▼]                                              │  │
│ │     Property: [Kind ▼]  Color: [Reds ▼] [====]                         │  │
│ │     Set line width: [No change ▼]                                      │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Style by related property ─────────────────────────────────────────────┐  │
│ │  access ○← ○→  aggregation ○← ○→  …                                    │  │
│ │  Property: [Phase ▼]  Color: [OrRd ▼] [====]                           │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Style by connected element ────────────────────────────────────────────┐  │
│ │  access ○← ○→  aggregation ○← ○→  …  Target type: [Any ▼]              │  │
│ │  Property: [Domain ▼]  Color: [Purples ▼] [====]                       │  │
│ │  Multiple targets: [#FF6B35 ▪]                                         │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Style by nesting level ────────────────────────────────────────────────┐  │
│ │  (Active only when nesting relation types are configured in Layout tab)  │  │
│ │  ☑ Apply font by level   Root size: [14 ▲▼] pt  ☑ Bold                  │  │
│ │  Decrease/level: [2 ▲▼] pt                                              │  │
│ │  ☑ Apply color by level  Root color: [#2C5F8A ▪] [=====] lighter       │  │
│ │  Darken/level: [15 ▲▼] %                                               │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Highlight repeated elements ───────────────────────────────────────────┐  │
│ │  ☑ Enable  Color range: [Pastel1 ▼] [====]                             │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

Styling always runs when any feature is enabled, regardless of action (NEW_VIEW, ONE_EACH, EXPAND_VIEW, LAYOUT_ONLY). On LAYOUT_ONLY/EXPAND_VIEW, existing appearance overrides are replaced.

Precedence when multiple rules target the same element: nestingLevel → highlightRepeated → styleByProperty → styleByRelatedProperty → styleByConnectedElement. Later rules win.

Five groups (in tab order):

#### Style by property

Colors elements or relations based on a named property value. Active when a property is selected in the combo (no enable checkbox). Color range combo + gradient preview strip are disabled until a property is chosen.

**Elements sub-section:** Unique property values are sorted and mapped to evenly-spaced colours on the chosen ColorBrewer scale.

**Relations sub-section:** Colors the relation's `lineColor`. When a line width is selected (1 Normal / 2 Medium / 3 Heavy), that fixed width is applied to all matched connections; "No change" leaves `lineWidth` untouched.

#### Style by related property

Colors elements based on properties of their connected relations. Active when a property is selected. Uses the same ← → relation-type grid as the Selection tab's related-elements blocks.

For each element on the view, reads the named property from matching relations and colours the element. Multiple matching relations: last-match wins.

#### Style by connected element

Colors elements based on properties of elements they are connected to via matching relations. Active when a property is selected.

When a source element connects to exactly one matching target element, it gets the target's property value mapped to a scale color. When it connects to multiple matching targets, it gets `conflictColor`.

#### Style by nesting level

Active only when at least one nesting relation type is configured in the Layout tab. An informational label replaces the controls when nesting is not configured. All controls appear on two compact rows (one for font, one for color).

**Font rule.** Root containers (depth 0) get `rootFontSize` pt (+ bold if `rootFontBold`). Each deeper level gets `rootFontSize - depth × fontDecreasePerLevel` pt, clamped at the Archi default (9 pt). Non-containers are untouched.

**Color rule.** Root containers get `rootColor` (darkest). Each level inward is lightened by `darkenPerLevel %` (channels blended toward white). Deepest containers and leaves are not touched. Preview strip in dialog shows the gradient from element-type default (light end) to `rootColor` (dark end).

#### Highlight repeated elements

Assigns a unique fill colour from a ColorBrewer scale to each element concept that appears more than once on the view (requires `showInEveryContainer`). The enable checkbox and color range appear on a single row.

**Colour ranges.** All color-range combos use the same set of ColorBrewer scheme names available in Chroma.js (see `COLOR_RANGES` in `appearance.js`). Each combo is accompanied by a gradient preview Canvas strip that repaints on selection change.

### Generated view

Outside the tabs. The group title is "Generated view" (was "View name and location"). Fields on the first row: **Folder** and **Name**. The second row carries an always-visible multi-line `Output:` strip with the predicted on-view totals, hide-zero:

```
Output:
  elements:    18 containers · 92 nested elements
  relations:   11 nestings · 98 connections
```

The structure matches the console's `Total to view:` row (same sub-lines: elements / relations / diagram). On-screen hides subfields whose value is 0 and skips a sub-line when all its subfields are 0; the console keeps everything visible for stable log columns. The strip refreshes on every dialog change (filter toggle, block edit, depth change, block reorder) so the user sees the predicted view contents in real time — without opening a console.

| Action | Naming rule |
|---|---|
| **NEW_VIEW** | Named from `preset.view.name`. Created in `preset.view.folder`. |
| **ONE_EACH** | Named after each element — the element's name verbatim. Created in `preset.view.folder`. |
| **EXPAND_VIEW / LAYOUT_ONLY** | Folder/Name are ignored; the target is the selected view. The `Output:` strip still updates and reflects the predicted post-action contents. |

### Action row

Four controls in two groups, plus Cancel:

- **Cancel** — always enabled. Discards changes. Preserves UI-only state for next open.
- **Create new view** group — always enabled. Contains *New view* and *One view each*. VisualSet at pipeline start is empty ([VisualSet](#visualset)).
- **Modify selected view** group — enabled only when the selection identifies an existing view (canvas VOs or a view node from the tree). Contains *Expand view* and *Layout only*. VisualSet is captured from the target view at pipeline start ([VisualSet](#visualset)).

Default button: *New view* when no view is identified in the selection; *Layout only* when a view is identified.

**Error / edge cases:**
- **Empty selection** — the dialog opens normally; all action counts show zero. Actions still run (they produce an empty view).
- **Preset validation failure** — unknown keys are dropped and missing keys receive defaults. The dialog never aborts on a malformed preset; it falls back to defaults silently.

### Interaction rules

Tech-agnostic rules for all interactive controls. Platform-specific implementations are in [GUI dialog](#gui-dialog--dialog_mainjs).

| Rule | Rationale |
|---|---|
| **Preset auto-apply on selection.** Selecting a preset in the combo immediately loads its values (no separate Apply button). Unsaved changes to the previously active preset are silently discarded. | Matches the universal pattern for preset pickers (DAWs, IDEs, Lightroom). An explicit Apply button adds a click without adding safety, since overwriting a preset is a separate [Save] action. |
| **Modified indicator.** When `ctx.config` differs from the last-loaded preset file, the combo label shows an asterisk suffix (`Name *`). The indicator clears on [Save] or on selecting a different preset. | Users need to know when [Save] would do something. Without the indicator, they either never save (assuming auto-save) or always save defensively. |
| **Default preset is always present and cannot be deleted.** The application creates it on first run if absent. The [Delete] button is permanently disabled when Default is selected. | Guarantees the combo is never empty and gives users a safe fallback. |
| **Switching presets discards unsaved changes silently.** No confirm dialog on preset switch. | For a settings dialog that has [Save] and [Save As…] as explicit save actions, interrupting every preset switch with a confirm dialog would be more annoying than helpful. The modified indicator makes the loss visible before it happens. |
| **Direction checkboxes: empty = follow all.** Both-unchecked is valid. No UI enforcement prevents it. The system interprets absence from the encoded list as unconstrained ([Preset schema](#preset-schema), [Steps](#steps) step 5). | Eliminates the need for a two-level "relation on/off vs direction" interaction. Reduces friction for the common case: no filter = all relations followed. |
| **Algorithm selection uses a radio table.** All algorithms for all styles are always visible simultaneously in a style-grouped table. | Users scan the full option space without opening a combo. Makes style/algorithm relationships visible at a glance. |
| **Live counts update on value-commit, not per-keystroke.** Spinner controls fire on arrow-click or focus-loss; not on each keystroke. | Relation traversal for live counts is expensive. Per-keystroke recompute produces flicker and wasted CPU. |
| **Steps 2+ start collapsed on preset load.** When loading a preset with multiple step blocks, only step 1 is expanded; later steps start collapsed. | Each block takes significant vertical space. Collapsed steps are accessible via the expand control (▸). |

---

## Algorithm capability matrix

Not all algorithms support all parameters. A parameter that is inactive for the chosen algorithm is greyed in the UI; its value is kept (preserved across algorithm changes) but ignored at runtime.

Each algorithm declares:

- A **style** (Flow / Hierarchy / Network / Compact / Circular) — used for grouping in the UI only.
- A **nesting capability** (full / partial / cluster / none) — drives whether nesting parameters are active.
- A **self-loop capability** (boolean) — whether the engine routes self-loops into bendpoints; engines that don't pass the edge through without routing, and Archi renders a default loop.
- An **active-parameters list** — which preset.params keys are honoured.
- A **supported-options map** — for select-type parameters, the allowed values.

Adding a new algorithm requires one entry in the SSOT and one entry in the relevant engine adapter; no other module changes.

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
| **Align width by level** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| **Snap columns to grid** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| **Show in every container** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Show connection for multi-occurrence** | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | — | ✓ | ✓ | — | — |
| **Reverse relation types** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| **Label position** | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | — |

## Selection pipeline

The pipeline takes a user selection plus a validated preset plus an action and returns a typed object set ready for layout.

### Action-group dispatch

Pipeline behaviour is determined by the action's group, not by the individual action. The two groups mirror the Generate View dialog's action row ([Action row](#action-row)):

| Group | Actions | VisualSet at pipeline start | Selection's role |
|---|---|---|---|
| **Create new view** | NEW_VIEW, ONE_EACH | Empty | Content source: every element in the selection (and its related-elements expansion) becomes part of the fresh view. |
| **Modify selected view** | EXPAND_VIEW, LAYOUT_ONLY | Captured from the target view | Identifies the target view; when only a subset of canvas objects is selected, also scopes the expansion. All existing visuals stay; selected visuals (and any added related elements) are repositioned. |

The selection's *source* — the model tree vs a view's canvas — is orthogonal to the group but constrains validity:

- **From the model tree** (folders, elements, relations) — Create-new-view group only; nothing in a model-tree selection identifies a target view.
- **From a view's canvas** (VisualElements / VisualRelations / DiagramObjects, or a view node) — either group:
  - With Create-new-view: clone-style — the selected canvas objects (and their related elements) become a fresh view; the source view is untouched.
  - With Modify-selected-view: in-place — the targeted view *is* the view the selection came from.

### Shared helpers — dialog and pipeline use the same code paths

Two entry points, one set of helpers. The dialog's live counter and the full pipeline both go through `_expandStep` / `_matchesRelationType` (and the per-step wrapper `_expandStepCounts`), so a correct dialog count is a true prediction of what the pipeline will write:

```
              ┌──────────────────────────────────────────────────┐
              │   selection_pipeline.js (shared helpers)         │
              │                                                  │
              │   _expandStep ──┬──► _matchesRelationTypeDir     │
              │                 │                                │
              │   _findRelationsBetween ──► _matchesRelationType │
              │                                                  │
              │   _expandStepCounts ──► _expandStep              │
              │                      └► _matchesRelationType     │
              └──────────────────────────────────────────────────┘
                       ▲                              ▲
                       │                              │
    ┌──────────────────┴───────┐    ┌─────────────────┴──────────┐
    │  Live counter (dialog)   │    │  Full pipeline             │
    │  on every UI change      │    │  on action button click    │
    │                          │    │                            │
    │  Pipeline                │    │  Pipeline                  │
    │   .expandStep(           │    │   .buildObjectSet(         │
    │     stepInput, step)     │    │     uiSelection,           │
    │  per block (chain)       │    │     preset, actionId)      │
    │  → added elements        │    │  → object set with         │
    │                          │    │    elements + relations    │
    │                          │    │    + visuals + view        │
    └──────────────────────────┘    └────────────────────────────┘
                │                                  │
                ▼                                  ▼
        Updates the on-screen          Sent to engine → writer →
        "Filtered" / "Adds:" lines     view is created/modified
```

Both entry points compute the same EFFECTIVE relation-type filter (see Step 5 below) and log a grouped count block of the same shape to the Archi console, so prediction and result can be eyeballed side-by-side.

### Steps

**EXPAND_VIEW and LAYOUT_ONLY skip Step 2.** The element-type filter is not applied for either action in the "Modify selected view" group. These actions re-layout or expand elements already on the view; applying the filter would exclude visible element types, causing containers to be sized for only the filtered subset while the excluded elements remain at positions outside those bounds.

LAYOUT_ONLY additionally skips Step 3 (no related-elements expansion — re-layout what is already there, not add to it). EXPAND_VIEW runs Step 3 normally from the unfiltered base. See [Action-group dispatch](#action-group-dispatch) for group definitions.

```
Step 1  Selection → model + diagram objects (+ VisualSet)
  Recursively expand the user's selection.
  - Folders / containers → their contained elements.
  - Views → their visual contents (split into model concepts
    and diagram objects).
  - Canvas selections → the concepts behind the visual objects.
  For the Modify-selected-view group, also populate the
  [VisualSet](#visualset) from the target view (bounds + appearance +
  parenthood). For the Create-new-view group, the VisualSet
  is empty.

Step 2  Apply the global Filter
  Element-type filter, relation-type filter (direction-aware),
  diagram-type filter. Filter is visibility only; it does not
  alter nesting structure.

Step 3  Related-elements expansion (chain)
  For each ordered step in preset.relatedElements.steps:
    additions       = traverse(input, step)         (depth hops, pruned by elementTypes)
    final-selection = final-selection ∪ additions
    input           = additions                     (chain: next step starts here)
  Step 1's input is the filtered base.
  An empty step terminates the chain — every later step adds zero.

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
  The union runs even when the global filter is empty — an empty
  global filter does NOT mean "ignore layer rel-types"; layer
  rel-types still constrain the result. Empty union (no global
  AND no layer rel-types) ⇒ all types allowed.
  (See [Preset schema](#preset-schema) for encoding.)

Step 6  Partition diagram objects
  diagram-model-connection objects are edges, not nodes — they
  have no logical position and never reach a layout engine as
  positional input. Keep them separate from positional diagram
  objects. Layout engines reroute existing connections automatically
  when their endpoints move.
```

### Pipeline invariants

- **Pure function.** Same selection + same preset + same model state → same returned object set.
- **No view mutation.** The pipeline reads only; it never edits a view. *(Rule 4 in [ai/rules.md](../../ai/rules.md))*
- **Sets, not lists.** No duplicate concepts; no duplicate relations.
- **Filter is non-destructive to nesting.** Filtering an element does not remove its descendants from the nesting structure of other elements that survive the filter.
- **Dialog and pipeline share the effective rel-type filter.** The dialog's live per-block `Adds:` counter is a faithful preview of what Step 5 will write for that block — both compute the union of `filter.relationTypes` and every layer's `relationTypes` and apply it identically.
- **Additive equation is exact** for both elements and relations: `Filtered + Σ Step N.adds = Total` (digit-for-digit, no caveat). Per-step `adds.rels` is computed as a delta: `rels-between(cumulative-after-step-N, effective-filter) − rels-between(cumulative-before-step-N, effective-filter)`. Never a raw-selection rel count, never an orphan-counting shortcut.
- **Element categories partition `elements`.** `elements = containers + nestedElements + standalones`, by construction. The element count always matches the source selection after expansion/filter/expand — adding `showInEveryContainer: true` does not inflate it. `extraOccurrences` (extra visual appearances under multiple containers) is a **separate** field, never folded into any of the element categories.
- **Relation forms partition `relations` on the view.** Every relation in the object set is either a nesting or a connection, by construction: `relations = nestings + connections`. View-side count rows use **nestings** and **connections** — never "relations" (which is a model-layer word).
- **Single nesting algorithm.** Pipeline (`predictViewCounts`) and writer (`_buildLayoutGraph`) both call `Pipeline.resolveNesting(elements, nestingRels, params)`. No duplicated logic, no drift between prediction and result.
- **Step 3 is a chain, not cumulative.** Step N (N ≥ 2) traverses from step N-1's additions only — not the cumulative selection. Step 1's input is the filtered base. An empty step terminates the chain (every later step adds zero). Mental model: each step refines the previous step's discoveries; step N+1 cannot bypass step N's intent.

## Nesting

### Role assignment

Every relation in the pipeline's output is assigned exactly one role:

- **Nesting** — if the relation's type is in `preset.params.nestingRelationTypes`.
- **Routed** — otherwise.

The set in the preset is the only authority. Role assignment is total (no relation is left unassigned) and deterministic (same inputs → same roles).

### Parent / child direction

For a nesting relation: the **source** is the parent and the **target** is the child — unless the relation's type is also in `preset.params.reverseRelationTypes`, in which case the **target** is parent and the **source** is child. The flip applies to nesting roles in exactly the same way it applies to routed-edge layout direction ([Reversed edges](#reversed-edges)).

### Multi-parent resolution

Many nesting relations may name the same element as their child. The preset's `showInEveryContainer` boolean decides the outcome:

| `showInEveryContainer` | Behaviour |
|---|---|
| `false` (default) | **First-wins.** The first nesting relation encountered (in pipeline order) assigns the child to its parent; later nesting relations that would assign the same child to a different parent are ignored for parenthood. The relation still exists in the model but does not draw a containment line nor a connection. The writer logs the candidate/applied/skipped split (`Nestings applied: M/N (skipped: X multi-parent, Y cycle)`), which is why the on-view nesting count can be lower than the pipeline's "Total to view → relations → nestings". |

**Visual rendering rule.** Extra occurrences (`showInEveryContainer: true`) only **render as visible duplicate boxes** when the chosen algorithm draws parent-child containment — i.e. nested-style layouts (Layered, Tree, Pack, Dot, and any other algorithm marked as supporting nesting in the [Algorithm capability matrix](#algorithm-capability-matrix)). For non-nested layouts (Force, SFDP, Twopi, etc.) the writer still receives `showInEveryContainer: true` and produces occurrence ids, but the layout engine collapses them: the element is drawn once. The dialog and pipeline counters compute the `extraOccurrences` count honestly from the nesting structure; for non-nested layouts the count will be non-zero but the user should expect the visible view to show one box per concept.

**Nesting-relation rendering.** The writer anchors each nesting VisualRelation to the specific occurrence the resolver assigned it to, so it renders as containment (box-in-box, no line). The preset's `showExtraOccurrenceConnections` toggle (default `false`) adds an **extra** VisualRelation on top — without removing the containment — for each *extra* (non-primary) occurrence binding. The extra visual is `view.add(rel, primarySrcVisual, primaryTgtVisual)`: a second visualization of the same model relation between the multi-parent element's primary occurrence and the second parent's box, drawn as a line. The toggle only takes effect when `showInEveryContainer` is on (otherwise no extras exist). When the toggle is on, the **nestings** counter is unchanged (every containment binding still draws as box-in-box) and the **connections** counter grows by the number of extra bindings (the added lines). One added line per extra binding; no reverse mirror. Whether the second VisualRelation persists is subject to Archi's per-view VR dedup behaviour — if Archi collapses duplicates, the user sees containment only despite the counter increase; otherwise both visuals coexist.

**Counting rule.** `elements` always counts unique model concepts (matches the source selection after expansion + filter + step adds), and is partitioned into `containers + nestedElements + standalones` by construction. `extraOccurrences` is a **separate field** (counts extra visual appearances, role-agnostic), never folded into the element categories. The on-screen "Generated view" group's `Output:` strip and the console block's `Total to view:` row show all fields side by side.
| `true` | **Visual instances.** The element appears once under each parent. Each visual instance is a distinct node in the layout but maps back to the same model element. Layout decisions per instance are independent. |

Determinism: pipeline order is fixed (model iteration order is stable), so first-wins yields the same result on repeated runs.

### Asymmetric roles

An element may be a **parent in one relation and a child in another** — there is no contradiction. Nesting roles are per-relation, not per-element. An element with at least one nesting relation on the parent-side and at least one on the child-side is both a Container (it contains other elements) and itself contained in its own parent. Diamond and deep-chain nesting are natural consequences of [Role assignment](#role-assignment)–[Multi-parent resolution](#multi-parent-resolution) applied to multiple relations.

### Container derivation

> Rule 5 in [ai/rules.md](../../ai/rules.md).

A Container is any element that has at least one child after [Multi-parent resolution](#multi-parent-resolution). Container-ness is **derived** from the parentMap, never declared. Users do not author containers directly. The closed set of element types remains [Object types](#object-types) — being a Container does not change an element's type.

### Writer parenthood

The writer derives every visual's parent from the current run's nesting decisions, regardless of which action invoked the run:

- An element whose parentMap entry names another element → drawn **inside** that parent's visual.
- An element whose parentMap entry is absent → drawn at **view root**.
- An existing VisualElement whose current visual parent differs from the new parentMap → **re-parented** (moved under the new parent). Bounds are then expressed relative to the new parent.

There is no per-action branch; the same rule applies to NEW_VIEW, ONE_EACH, EXPAND_VIEW, and LAYOUT_ONLY. See [Invariants](#invariants) (writer invariant).

**Multi-occurrence VO pairing.** When one model concept has multiple existing VOs on the target view (extra occurrences from a prior `showInEveryContainer: true` run, or user-authored duplicates) the writer pairs each result node to a single existing VO before applying re-parenting. Pairing rule, executed per result node in the parent-first loop:

1. Strip any `_occ_N` suffix from the result-node id to recover the concept id.
2. Among existing VOs for that concept that have not yet been consumed, prefer the one whose **current parent VO's concept** matches the **new parent result node's concept** (after the same suffix strip; `null` = view root on both sides).
3. If no candidate matches by parent concept, take the first unconsumed VO in VisualSet capture order.
4. Mark the chosen VO consumed (one VO per result node).
5. The standard re-parent step runs unchanged on the picked VO — Invariant 9 is not bypassed; pairing is a lookup refinement.

Surplus existing VOs (concept over-supply — e.g. `showInEveryContainer` toggled off, or EXPAND_VIEW reducing occurrence count) are **left in place untouched**. The writer never deletes visuals outside the explicit name-overwrite path (Invariant 4). A single log line `Unpaired VOs: N (concept over-supply — kept in place)` flags the count.

### Width alignment by level

When the **Align width by level** option (preset key `alignWidthSameType`) is on, boxes that sit at the same nesting depth are given a common width, so a nested diagram reads as clean telescoping frames instead of ragged boxes. It is a sizing rule layered on top of the nesting structure; it never changes which element is parent or child.

**Definitions.**

- **Level** of a box — its nesting depth. Boxes at the view root are level 0; the children of a level-*N* container are level *N+1*. Applies to both leaves and containers.
- **Sub-nesting depth** of a box — how many levels of containment sit below it. A leaf is 0; a container holding only leaves is 1; a container holding such a container is 2; and so on.

**The width chosen for each level — telescoping.** Widths grow by one fixed step per nesting level, like a set of concentric frames. The deepest level is **anchored** at its narrowest box (the leaf base width); every level above it is exactly **one padding ring wider** than the level it contains:

```
W[deepest level] = narrowest box at that level (the leaf base width)
W[L]             = W[L+1] + ring          (ring = left + right container padding)
```

This is the width a *single-column* container of that depth would have — the tightest box that still leaves a clean, uniform margin around the level inside it. It is well-defined at every level and never depends on how wide any one busy branch happens to pack.

**How the target is applied.**

- A **leaf** is set to exactly its level's width. Leaves carry no content of their own, so they always take the level width — growing the narrow ones until every leaf at that level matches.
- A **container** treats the level width as a **floor**: it is at least that wide, but if its own side-by-side content needs more, it keeps the larger width. This is the *never-below-content* guarantee — the telescoping widths set the baseline frames, and any branch that genuinely needs more room bulges past its floor rather than clipping its contents.

**Worked example.** A view whose deepest branch is `B ⊃ B1 ⊃ B1a ⊃ leaf`, alongside a level-0 container `A` that holds two boxes side by side, and a lone level-0 leaf `C`. With a base leaf width of 200 and a ring of 20:

| Level | Level width `W[L]` | Leaves at this level | Containers at this level |
|---|---|---|---|
| 0 | 260 (= 240 + ring) | `C` → 260 | `A` → floored at 260, but **bulges** wider to fit its two side-by-side children |
| 1 | 240 (= 220 + ring) | `A2` → 240 | `A1` → floored at 240 |
| 2 | 220 (= 200 + ring) | `A1a` → 220 | `B1a` → floored at 220 |
| 3 | 200 (anchor) | `Bx` → 200 | — |

**Scope and prerequisite.** The rule needs each container's *natural* width, which only exists once the engine has sized containers from their contents. It therefore requires a first sizing pass to measure natural widths before the final placement; the adjustment happens *between* passes, never after the final layout (see [No post-layout scaling](#no-post-layout-scaling)). It is available only on engines that size containers from content — the nesting-capable ELK algorithms (Layered, Tree, Grid, Pack); see the [Algorithm capability matrix](#algorithm-capability-matrix). The engine-specific realisation is in Part B.

### Column snapping

The **Snap columns to grid** option (preset key `snapColumnsToGrid`) puts every leaf column on **one shared global grid** so columns line up top-to-bottom across the whole view. It is independent of [Width alignment by level](#width-alignment-by-level) — either can be used alone — and applies only to the nesting-capable ELK algorithms.

**A global variable-width table.** Each column is as wide as its own widest leaf (widths diverge), packed left-to-right, every leaf moved onto its column's centre so columns share an x view-wide.

**Tight first, widen only where it collides.** Gaps start at `max row need − 2×padding` (floored at one inner spacing) — tight. Then a measure-then-widen loop runs: lay leaves on the grid, re-wrap containers, find any adjacent sibling containers that actually overlap, and widen *those* boundaries by exactly the overlap; repeat until clean. So a boundary only gets a wide gap if real containers would otherwise collide there; everywhere else stays minimal.

**How it runs.** A position-only post-pass over the laid-out result:

1. **Detect columns** — sort leaves by centre; split on a >½-leaf gap (consecutive compare).
2. **Column width** = its widest member leaf.
3. **Initial gap** per boundary = `max row need − 2×padding`, floored at spacing.
4. **Iterate:** place leaves on the column grid and re-wrap containers (deepest first); find adjacent sibling containers whose actual gap is below one inner spacing; widen each offending boundary by the shortfall; repeat until no overlap.

**Guarantees and limits.** Leaves are **never resized** — only moved — so it stays within [No post-layout scaling](#no-post-layout-scaling); containers are re-wrapped (their size is derived, not authored). Columns stay globally aligned (widening a boundary shifts everything right of it, on-grid). Gaps are as tight as possible — only boundaries where containers would truly collide are widened, by exactly the amount needed.

## Action semantics

Writing a layout result is **action-agnostic**. The single writing rule ([Invariants](#invariants)):

> For each result object — if a counterpart exists in the [VisualSet](#visualset), **reposition** it (appearance preserved; parenthood re-derived from [Writer parenthood](#writer-parenthood)). Otherwise **create** it (default appearance).

Same rule for relations: existing → rewrite bendpoints; new → create.

Actions are organised into two groups (see [Action-group dispatch](#action-group-dispatch) for the group definitions). Each action differs from its sibling in only two things — (1) what objects feed the layout and (2) which view is the target. The writer doesn't know or care which action invoked it.

### Create new view group

VisualSet starts **empty**. Every result object is created with default appearance. The source view (if the selection came from a canvas) is never modified.

| Action | Object set | Target view |
|---|---|---|
| **NEW_VIEW** | Model selection expanded through filter + related-elements blocks. | A new view (created, or overwritten by name) in `preset.view.folder`. Named per [Generated view](#generated-view). |
| **ONE_EACH** | **Seed elements** = raw model elements from the Archi selection, before the preset's element-type filter and before related-elements expansion (views in the selection are expanded to their elements). For each seed, the full NEW_VIEW pipeline runs independently: filter → related-elements expansion → layout → write, with that seed as the sole input. | One new view per seed element, named per [View name and location](#view-name-and-location). |

### Modify selected view group

VisualSet is **captured from the target view** before model expansion runs. All existing visuals stay; the writer repositions matches and creates the rest.

| Action | Object set | Target view |
|---|---|---|
| **EXPAND_VIEW** | Selection (a whole view, or a subset of its canvas objects) drives related-elements expansion. Visuals outside the selection stay in place; selected visuals and any added related elements are repositioned. | The selected view itself. `preset.view.name` is ignored. |
| **LAYOUT_ONLY** | The selected view's current contents only — no related-elements expansion. | The selected view itself. |

What "preserved" / "re-derived" means concretely:
- **Appearance properties** (colours, fonts, line styles, sizes overridden by the user) — never touched by the writer.
- **Visual parenthood** — *re-derived* per run from [Writer parenthood](#writer-parenthood) (nesting rules), not preserved. An existing VisualElement may be re-parented when the new parentMap names a different parent.
- **Bendpoints on existing relations** — *rewritten* from the layout result, because the new endpoint positions invalidate old bendpoints. Style properties of the connection are untouched.

## Engine adapter contract

A layout engine is an opaque function. The system exposes one normalised interface that every engine adapter must implement.

### Input — `LayoutGraph`

```
LayoutGraph {
  algorithm      : enum                 // names a known algorithm
  nodes : [ {
    id           : string               // unique within this graph
    label        : string               // element name
    elementType  : string               // for type-aware layouts
    width        : number
    height       : number
    parent       : string | null        // id of the parent node (nesting)
  } ]
  edges : [ {
    id           : string
    source       : nodeId               // already swapped for reversed relations
    target       : nodeId
    label        : string
    weight       : number               // hint to layout quality
  } ]
  options        : object               // per-algorithm layout parameters

  labelPosition  : enum                 // Head / Middle / Tail
  maxWidth       : number               // 0 = unconstrained
  maxHeight      : number               // 0 = unconstrained
  aspectRatio    : number               // 0 = unconstrained

  alignWidthSameType : boolean
  sortContainers     : boolean
}
```

#### Reversed edges

For each relation type listed under the preset's **Reversed** field ([Preset schema](#preset-schema)), the pipeline swaps `source` and `target` in the LayoutGraph so the engine traverses the edge in the reversed direction — meaningful for ranking algorithms (Layered, Tree, Dot) where direction drives hierarchy.

No additional flag is carried. An ArchiMate relation has its own intrinsic direction in the model; Archi renders any VisualRelation using that direction. The writer creates the VisualRelation against the original model relation — Archi handles the arrowhead and label orientation from there. The writer reconciles bendpoint order against the model relation's source/target rather than the LayoutResult edge's, when the two disagree.

The ArchiMate relation in the model is **never modified**; reversal is purely a layout-traversal concern. *(Rule 6 in [ai/rules.md](../../ai/rules.md))*

### Output — `LayoutResult`

```
LayoutResult {
  nodes : [ {
    id, x, y, width, height,
    parentId : string | null           // for absolute → parent-relative conversion
  } ]                                  // x, y are ABSOLUTE
  edges : [ {
    id, sourceId, targetId,
    bendpoints   : [ { x, y } ]        // ABSOLUTE
    isStraight   : boolean
    labelX, labelY : number            // engine's chosen label position;
                                       // 0,0 = no placement (writer uses default)
  } ]
  viewWidth, viewHeight : number
}
```

Element labels are intrinsic to nodes — the result carries no separate element-label coordinates. The writer places each node's `label` inside the node's bounds at its standard position.

### View-size constraints

Three mutually exclusive parameters control how large the generated view may be ([Layout tab](#layout-tab)). Only one is active at a time — `viewSizeMode` in the preset records which one. The adapter receives only the active constraint; the others are zeroed. Old presets without a `viewSizeMode` field default to the first non-zero view-size value found.

Not every algorithm supports every view-size parameter. Unsupported parameters are deactivated in the UI regardless of mode selection (see [Algorithm capability matrix](#algorithm-capability-matrix)). None of these parameters may trigger scaling of element dimensions — see the no-scaling rule below.

### No post-layout scaling

> Rules 1 & 2 in [ai/rules.md](../../ai/rules.md).

**Scaling element sizes after layout is forbidden.** This rule has no exceptions.

- **Leaf nodes** receive `width` and `height` from the `LayoutGraph` input (set from `elementWidth` / `elementHeight` parameters). The adapter passes these unchanged to the engine. The engine must not resize them.
- **Container nodes** do not receive pre-set sizes. The engine computes container dimensions from children and padding natively.
- `LayoutResult` node dimensions must match the above: leaf sizes equal input values; container sizes come from the engine. No post-layout multiplication factor may be applied.
- No adapter may apply a uniform scale to the entire result set after `layout()` returns.

**Position spread is allowed.** Moving node centers outward from a common origin — keeping sizes fixed — is permitted as a post-layout step to fill a view-size target.

**`alignWidthSameType` exception** (UI label: *Align width by level*). This adjustment sets per-nesting-level target widths — exact widths on leaves, minimum-size floors on containers — using widths rendered in pass 1. It runs between pass 1 and pass 2 of a two-pass layout, so it is a pre-layout adjustment to pass 2's input, not a post-layout operation. (The preset key remains `alignWidthSameType` for back-compat; the behaviour is level-based, not type-based.)

### Adapter obligations

- Honour every parameter listed as **active** for the chosen algorithm ([Algorithm capability matrix](#algorithm-capability-matrix)); ignore inactive ones.
- Translate parameter values from their UI/preset form to the engine's native form.
- Apply view-size constraints without scaling element sizes (see above).
- Return absolute coordinates (the orchestrator converts to parent-relative).
- Never read or write a view directly. Adapters operate only on `LayoutGraph` / `LayoutResult`. *(Rule 3)*

### Adapter obligations

- Honour every parameter listed as **active** for the chosen algorithm ([Algorithm capability matrix](#algorithm-capability-matrix)); ignore inactive ones.
- Translate parameter values from their UI/preset form to the engine's native form.
- Apply view-size constraints without scaling element sizes (see above).
- Return absolute coordinates (the orchestrator converts to parent-relative).
- Never read or write a view directly. Adapters operate only on `LayoutGraph` / `LayoutResult`. *(Rule 3)*

## Console logging

Console output mirrors the orchestration phases. Each phase is a **step** in the log.

### Step structure

Each step:
- is preceded by one blank line
- opens with a **step header** line at root indent: `Step name:`
- has all its detail lines indented by two spaces

The final completion line of the last step (`View "…" written`) is at root indent — it belongs to no step.

### Steps

| Step header | Phase | What it covers |
|---|---|---|
| `=== generate_view ===` | Validate preset + API entry | Algorithm, action, view name + folder |
| `Pipeline — build object set:` | Selection pipeline | Filtered base, step adds, totals (containers · nested elements · standalones · extra multiple occurrences · nestings · connections · diagram objects) |
| `View target:` | Determine target view | View created, overwritten, or identified |
| `Layout graph:` | Build engine-independent layout graph | Relation roles (nestings · connections), nestings applied, cycle warnings |
| `Layout:` | Engine adapter | Engine passes, alignment summary, engine result, layout result, view size |
| `Write:` | Write positioned result to view | Nodes written (including extra multiple occurrences breakdown), connections, final object counts |

### Dialog logging

The dialog logs one block before it opens (`GUI — before dialog:` with Selected / Containing / Filtered counts). It does **not** log on widget changes — live counter updates are reflected in the dialog UI only.

### Debug flag

Verbose per-item detail from the width-alignment step is gated behind `preset.params.alignDebug: false`. When `true`, per-container/leaf lines appear inside the `Layout:` step.

## Invariants

System-wide. Code reviews catch violations.

1. **Determinism.** Same inputs → same view, always. No reliance on hash-iteration order for layout decisions. *(Rule 8 in [ai/rules.md](../../ai/rules.md))*
2. **Appearance preservation.** Updating a visual object's position does not change its appearance properties (colours, fonts, sizes, text). The system relies on this for EXPAND_VIEW and LAYOUT_ONLY.
3. **Parent-relative coordinates.** A nested visual object's bounds are expressed relative to its immediate parent visual object. The layout engine returns absolute coordinates; the orchestrator converts at write time.
4. **No silent data loss.** The orchestrator may overwrite a view's contents only when the action explicitly says so (NEW_VIEW with a name that matches an existing view in the same folder). EXPAND_VIEW must never delete existing visuals as a side effect of name resolution.
5. **Validation is total.** Every preset that enters the orchestrator has passed validation: unknown top-level keys are dropped; missing keys take defaults; option values are checked against the algorithm's supported options.
6. **UI-only state is partitioned.** The preset schema carries only configuration that affects view generation. UI-only state (last tab index, collapsed-block flags, …) rides as separate keys preserved through the same persistence file but invisible to the orchestrator.
7. **Action is not in the preset.** Sharing a preset across users and selections requires the preset to be selection- and action-agnostic.
8. **Filter is non-destructive.** Filtering hides elements from a view; it does not alter the nesting structure between elements that survive the filter.
9. **Visual parenthood is action-agnostic.** Every action derives visual parenthood from the current run's nesting decisions ([Writer parenthood](#writer-parenthood)). An existing VisualElement may be re-parented when the new parentMap dictates a different parent.
10. **Write order is parent-first.** The write path sorts layout-result nodes so every node is processed after its parent. A child is never repositioned or added before its parent. This is what makes invariant 3 (parent-relative coordinates) hold under arbitrary engine output order, and prevents drawing-order overlap.
11. **Layout writing is action-agnostic.** The orchestrator decides (a) which objects feed the layout and (b) which view is the target. The writer applies one rule per result object — *exists* → reposition (appearance preserved; parenthood re-derived from [Writer parenthood](#writer-parenthood)); *otherwise* → create (default appearance). Same rule for relations: existing → rewrite bendpoints; new → create. There is one write function; per-action branches inside the writer are forbidden. *(Rule 7 in [ai/rules.md](../../ai/rules.md))*
12. **Algorithm-capability masking.** Preset values for parameters not in the chosen algorithm's active-parameters list are ignored at runtime. The raw preset stays intact (values are kept for UI restoration on algorithm switch); the orchestrator derives an effective parameter view from `(preset, algorithm.activeParams)` at entry and passes only that view to the pipeline, engine adapter, and writer. A non-empty inactive value reaching runtime is a defect — log it.

## Design decisions

Rationale-only. Each decision references the invariant or user story that motivates it.

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling for filtering, traversal, and rendering. Allowing arbitrary types would defeat the closed-set assumption in the filter UI and in iteration. |
| Non-positional objects — Relations, VisualRelations, and diagram-model-connections — are partitioned from positional objects throughout the pipeline. | An edge has endpoints, not coordinates. Treating any of these as nodes would corrupt the layout graph; the same partition rule applies uniformly to all three kinds. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*; an action is a *verb*. Sharing presets across selections requires action-agnosticism. |
| View name is a single user-controlled field. No suffix mechanism. | An earlier separate algorithm-derived suffix was found to silently rewrite the user's typed name on algorithm switch, which surprised users. The suffix field is gone entirely — `preset.view` has only `name` and `folder`. Old preset JSON files with a `"suffix"` key load cleanly (`validatePreset` strips unknown keys) and lose the field on next save. |
| EXPAND_VIEW's target is derived from the existing visuals, not from the preset name. | The preset name is for *creating* a view. Expanding the selected view is a verb against that specific view, not a name-resolution. (See invariant 4.) |
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| The related-elements panel is multi-step with chain semantics. | Real exploration patterns are stepped: "from processes → get applications → then services". A single step can't express this. Each step's additions feed the next step's input; an empty step terminates the chain so step N+1 cannot bypass step N's intent. |
| Per-relation direction toggles are independent (not mutually exclusive). | "Both", "incoming only", "outgoing only" are all common needs. Forcing a choice would lose the most-common case (both). |
| Empty direction selection means follow all. | When neither direction checkbox is active for a relation type, the type is absent from the encoded list. [Steps](#steps) step 5 interprets the empty union as "all types allowed". The both-unchecked state is the idiomatic "don't filter this type" state, not an error. |
| Spinner recomputes fire on value-commit, not on keystroke. | Live counts can be expensive (relation traversal). Per-keystroke recompute is wasteful and produces flicker. |
| Algorithm selection uses a style-grouped radio table, not a combo. | All algorithms across all styles are always visible simultaneously. Users scan the full option space without opening a combo; style/algorithm relationships are visible at a glance. |
| Steps 2+ start collapsed when a preset is loaded. | Each step block occupies significant vertical space. Collapsing later steps on load lets the user confirm step 1 before configuring subsequent steps; all steps remain accessible via the expand control. |
| Coordinate conversion is engine-agnostic via `parentId` on result nodes. | Each engine handles nesting differently. Carrying parent info on the result is the simplest way to convert without engine-specific code in the orchestrator. |

## Rules & precedence

The View subsystem operates inside a layered rule system. A change to any module is constrained by rules from every applicable scope; conflicts are resolved by **scope narrowness — narrower wins**.

### Scopes (broad → narrow)

| Scope | Governs |
|---|---|
| **Global** | Coding conventions common across the user's projects — naming, module layout, file headers, log discipline. |
| **Repo-wide** | Project entry point and vocabulary; runtime constraints (host platform / language version); repo-wide module structure; testing policy; user-facing README. |
| **Shared library** | Code-level contracts every subsystem in the repo relies on — selection helpers, common utilities, folder resolution. Treated as fixed once published. |
| **Subsystem** | Internal rules for one subsystem: its pipeline model, hard rules, platform-specific behaviours, dialog architecture, this two-part SSOT. |

### Precedence rule

For any single concern, the narrowest scope that addresses it is authoritative. Broader-scope rules apply only where narrower scopes are silent. This lets the subsystem override repo conventions for genuine local needs, and the repo override cross-project defaults, without contradiction.

### Working-directory artefacts (not rules)

Plan files and similar transient working notes are not part of the precedence chain. They link *to* the rule hierarchy as a constraint; they never override it.

[Rule & documentation files](#rule--documentation-files) lists the concrete files that realise each scope.

---

# Part B — Current implementation

How Part A is realised in jArchi 1.12 / GraalVM JavaScript / SWT / Eclipse / Archi 5.9. Every section opens with `**Realises:** [section link](#anchor)`. Where reality diverges from Part A, either Part A or the code is wrong — escalate.

## Rule & documentation files

**Realises:** [Rules & precedence](#rules--precedence).

Concrete files that fill each scope from [Rules & precedence](#rules--precedence). Listed broadest → narrowest; narrower wins on conflict.

| Scope                             | File                                               | Role                                                                                                                          |
| --------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Global (user-level, all projects) | `~/.claude/rules.md`                               | Rule priority chain: project shared docs → `~/ai/shared/coding-standards.md` → `~/.claude/settings.md`                        |
| Global (user-level, all projects) | `~/.claude/settings.md`                            | Behaviour defaults: concise responses, prefer editing existing files, avoid diff narration                                    |
| Global (user-level, all projects) | `~/ai/shared/coding-standards.md`                  | Cross-project coding standards; overridden by repo-level rules                                                                |
| Repo-wide                         | `ai/rules.md`                                      | Tool-independent rule chain, layering model, and source references                                                            |
| Repo-wide                         | `ai/jarchi-scripting/jarchi-script-development.md` | Project standards: patterns, vocabulary, structure, runtime constraints, testing guide                                        |
| Repo-wide                         | `readme.md`                                        | User-facing project overview                                                                                                  |
| View                              | `Scripts/View/CLAUDE.md`                           | Reference-only: pointers to `ARCHITECTURE.md` and `ai/jarchi-scripting/SKILL.md`                                              |
| View                              | `Scripts/View/README.md`                           | User-facing entry point: invocation guide and preset descriptions                                                             |
| View                              | `Scripts/View/ARCHITECTURE.md`                     | Defines design constraints (Part A) and implementation state (Part B)                                                         |
| Plan                              | `~/.claude/plans/<plan-name>.md`                   | Active WIP: phases, tasks, bug fixes, Done log; not a rule file; references `ARCHITECTURE.md` without duplicating constraints |

## Module inventory

**Realises:** [Goals & scope](#goals--scope) and [System architecture](#system-architecture).

### File structure

```text id="n6ef0w"
Scripts/
├── _lib/                                # Reused shared utilities
│   ├── selection.js                     # getSelection(), getVisualSelection()
│   ├── Common.js                        # initConsoleLog(), startCounter(), endCounter()
│   └── archi_folders.js                 # getFolderPath()
└── View/
    ├── _gui.ajs                         # Open GUI dialog
    ├── _generate.ajs                    # Read session; call generate_view(new_view)
    ├── _expand.ajs                      # Read session; call generate_view(expand_view)
    ├── _layout_only.ajs                 # Read session; call generate_view(layout_only)
    │
    ├── presets/
    │   └── *.ajs                        # Wrapper: load preset → generate_view
    │
    ├── lib/
    │   ├── generate_view.js             # Orchestrator: selection → engine → view → appearance
    │   ├── defs.js                      # SSOT: algorithms, enums, defaults
    │   ├── selection_pipeline.js        # Selection → filter → expansion
    │   ├── preset_io.js                 # Preset and session I/O
    │   ├── appearance.js                # Post-write styling pass (colours, fonts)
    │   │
    │   ├── engines/
    │   │   ├── elk.js                   # ELK adapter
    │   │   ├── dagre.js                 # Dagre adapter
    │   │   ├── graphviz.js              # Graphviz adapter
    │   │   └── engine-utils.js          # Shared engine utilities
    │   │
    │   └── gui/
    │       ├── dialog_main.js           # SWT dialog
    │       │   ├── defs.js
    │       │   ├── preset_io.js
    │       │   ├── generate_view.js
    │       │   ├── selection_pipeline.js
    │       │   └── dialog_presets.js
    │       │
    │       └── dialog_presets.js        # Presets management dialog
    │
    ├── user_parameter/
    │   ├── *.json                       # Saved named presets
    │   └── _session.json                # Last-used session (gitignored)
    │
    └── test_visual_props.ajs            # Verifies bounds-set preserves visual properties
```

## Single Source Of Truth — defs.js

**Realises:** [Data model](#data-model), [Algorithm capability matrix](#algorithm-capability-matrix).

### Algorithm registry

`defs.js` exports two frozen maps: `STYLES` (style name → `{ algorithms, tooltip }`) and `ALGORITHMS` (algorithm name → `{ engine, engineAlgorithmId, style, supportsNesting, activeParams, supportedOptions, labelPositionDefault, tooltip }`).

`activeParams` is the list of preset parameter keys the algorithm honours — this directly realises [Algorithm capability matrix](#algorithm-capability-matrix) active-parameters list. `supportedOptions` restricts allowed values for select-type parameters (direction, routing, label position).

The `mapParams(algorithmName, params, mapping)` utility iterates `algorithm.activeParams` and applies mapper functions from the caller-supplied `PARAM_MAPPING` object. All engine-specific option names, unit conversions, and flag values live exclusively in each adapter's `PARAM_MAPPING` — never in `defs.js`. This is the concrete realisation of the SSOT / adapter separation boundary ([System architecture](#system-architecture)).

`DEFAULT_PRESET` is a frozen object that fills missing fields during validation. Any new `params` key must be added to `DEFAULT_PRESET.params` or it is stripped by `validatePreset`.

Ref: `lib/defs.js`.

### Diagram-object types

The canonical list of diagram-object type strings is defined in `Scripts/_lib/selection.js::DIAGRAM_OBJECT_TYPES`. `defs.js` imports this array and exposes `DIAGRAM_TYPES` as a frozen set-like object (keyed by type string, values `true`) for membership checks (`type in Defs.DIAGRAM_TYPES`) and key iteration (`Object.keys`).

The `"archimate-diagram-model"` alias is included because jArchi 1.12 reports view-reference VOs with that type string rather than `"diagram-model-reference"` — the alias prevents scattered type guards throughout the code.

Ref: `Scripts/_lib/selection.js`, `lib/defs.js`.

### Encoded relation type helpers

`encodeRelType(typeId, inSel, outSel)` and `decodeRelType(encoded)` translate between direction-checkbox state and the encoded relation type string format ([Preset schema](#preset-schema)). UI controls round-trip through these. Ref: `lib/defs.js`.

### Preset validation

`validatePreset(raw)` deep-clones `DEFAULT_PRESET`, merges in raw values, validates option values against `algorithm.supportedOptions`, drops unknown top-level keys, normalises `relatedElements.steps`, and returns the result. Realises [Invariants](#invariants) (validation is total). Old presets without a `viewSizeMode` field are handled by `_inferViewSizeMode`: the first non-zero view-size parameter determines the mode (matching the old "first set wins" behaviour). Ref: `lib/defs.js::validatePreset`.

## Selection pipeline — implementation

**Realises:** [Selection pipeline](#selection-pipeline) (pipeline contract).

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
expandStep(stepInput, step)           // added elements (chain advance)
expandStepCounts(base, step)          // { elements, elemCount, relCount }
```

### Step-by-step

```
Step 1  Selection.getSelection(uiSelection, "*") — uniform model-tree + canvas expansion.
        _expandViews() splits the result into { modelCollection, diagramObjects }.
        For EXPAND_VIEW and LAYOUT_ONLY: _collectExistingVisuals walks the selected
        view and populates { existingView, visualElements, visualRelations }.
        Other actions receive null / empty.

Step 2  _applyFilter(modelCollection, filter) — element/relation types.
        _applyDiagramFilter(diagramObjects, filter) — diagram types.
        SKIPPED for EXPAND_VIEW and LAYOUT_ONLY (see [Action-group dispatch](#action-group-dispatch)).

Step 3  Related-elements expansion (chain) — SKIPPED for LAYOUT_ONLY.
        For each step in preset.relatedElements.steps:
          added   = _expandStep(stepInput, step)   (chain: stepInput = prior added)
          stepInput = added                         (step 1's input = filtered base)
        (See [Action-group dispatch](#action-group-dispatch) for groups that skip this step.)

Step 4  Drop relations, folders, view nodes from the collection.

Step 5  Compute relTypeFilter = union(global filter, every active block's relationTypes).
        _findRelationsBetween(elements, relTypeFilter). Realises [Steps](#steps) step 5.

Step 6  Partition diagramConnections (type === "diagram-model-connection")
        from diagramObjects (everything else).
```

### Direction-aware traversal

`_expandStep` iterates the relations of each element in the current step input. For each relation, it determines the traversal direction (outgoing = element is source; incoming = element is target) and checks it against the step's `relationTypes` direction suffixes (`:in`, `:out`, or both) per [Preset schema](#preset-schema). Non-matching relations are skipped; matching relations yield the neighbouring element, which is added to the expansion set. Ref: `selection_pipeline.js::_expandStep`, `::_matchesRelationTypeDir`.

### Internal data structures

**Realises:** [Vocabulary & display labels](#vocabulary--display-labels) (the Part A note on internal-only names).

Algorithmic structures used by the pipeline (and consumed by `_buildLayoutGraph` / `_writeView` in the orchestrator). They appear only in code and code-level documentation, never in user-facing strings.

| Internal | Conceptual role | Canonical term |
|---|---|---|
| `parentMap` | child id → parent id mapping | — (data structure) |
| `childIds` | the set of element ids that have a parent | nested elements (counted) |
| `containerIds` | the set of element ids that are parents | containers (counted) |
| `occurrenceMap` | element id → list of occurrence ids | occurrences |
| `routedRels` | array of relations whose type is NOT in `nestingRelationTypes` | connections |
| `nestingRels` | array of relations whose type IS in `nestingRelationTypes` | nestings |
| `parentRels` | nesting bindings (`{rel, srcOccId, tgtOccId, isExtra}`) that survived multi-parent resolution | applied nestings |

## Orchestrator — generate_view.js

**Realises:** [Action semantics](#action-semantics), [Invariants](#invariants) (action-agnostic writer).

### Public API

```javascript
// preset is validated inside generate_view via validatePreset() before use.
// actionId is a runtime parameter — never stored in the preset.
generate_view(preset, uiSelection, actionId) → ArchimateView[]
```

### Flow

`_generateSingle(preset, uiSelection, actionId, viewNameOverride?)`:

```
1. objectSet  = Pipeline.buildObjectSet(uiSelection, preset, actionId)
2. Assign each relation a role: nesting (parent-child) vs routed (line).
3. Determine target view:
     EXPAND_VIEW / LAYOUT_ONLY → objectSet.existingView
     NEW_VIEW / ONE_EACH       → _getOrCreateView(folder, name)
4. graph  = _buildLayoutGraph(preset, elements, routedRels, nestingRels, diagramObjects)
5. result = engineAdapter.layout(graph)
6. _writeView(preset, result, objectSet, view, graph._parentRels)
7. Appearance.applyAppearance(view, preset)   [no-op if all features disabled]
```

`_buildLayoutGraph` assembles nodes from elements (using preset `elementWidth`/`elementHeight`) and from diagram objects (using current canvas bounds). `diagram-model-connection` objects are skipped (they are edges, not nodes — [Steps](#steps) step 6). Nesting is expressed via the `parent` property on nodes; the `parentMap` is built from the resolved nesting relations.

### Writer algorithm

`_writeView` is the only function that changes views ([Invariants](#invariants)). It works as follows:

Before writing, it builds three lookup maps from the [VisualSet](#visualset): existing visual elements grouped by model concept ID as **lists** (`existingVosByConcept: Map<conceptId, VisualElement[]>` — one concept can have multiple VOs from extra occurrences), existing visual elements keyed by VO ID, and existing visual relations keyed by concept ID. A `consumedVoIds` Set tracks which existing VOs have been bound to a result node, ensuring each VO is written at most once.

Nodes are processed in parent-first order (`_sortNodesParentFirst` — a stable depth-first sort ensuring every parent is processed before its children). For each node: `_pickExistingVo` selects an existing VO by `(concept id, new-parent concept id)` from the concept list (see [Writer parenthood](#writer-parenthood) for the pairing rule), or returns null if no candidate remains. **If found (reposition):** the VO is marked consumed; its bounds are updated in parent-relative coordinates ([Invariants](#invariants) parent-relative coordinates); if the new parentMap names a different parent, the VO is re-parented using the jArchi 1.10 move API. **If not found (create):** the element is retrieved from the model and added to the view under the correct parent.

After the node loop, the writer scans `existingVosByConcept` for VOs not in `consumedVoIds` and logs `Unpaired VOs: N (concept over-supply — kept in place)` if any are unbound. Surplus VOs are not mutated (Invariant 4 — no silent data loss).

Relations follow the same reposition-vs-create rule. Existing relations have their bendpoints rewritten by `_applyEdgeStyle` (deleteAll + add); new relations are added with default style. Nestings that won the multi-parent resolution are drawn on the view after all connections.

Each nesting binding from `_resolveNesting` carries `srcOccId` and `tgtOccId` aligned to the model relation's `(source, target)` so that `view.add(rel, srcV, tgtV)` preserves model direction. The writer always issues a containment add for every binding (skipped on LAYOUT_ONLY when the rel already has a VR), keying both endpoints on the occurrence visuals — Archi renders containment (no line). When `preset.params.showExtraOccurrenceConnections` is true and a binding's `isExtra` flag is set (non-primary occurrence), the writer additionally issues a second `view.add(rel, …)` keyed on the primary visuals (`visualIndex[rel.source.id]` / `visualIndex[rel.target.id]`) — Archi draws this as a connection line from the multi-parent element's primary occurrence to its other parent. The extra add is issued unconditionally per run; Archi's VR-per-view dedup behaviour determines whether the second VisualRelation persists alongside the containment.

Ref: `generate_view.js::_writeView`, `::_sortNodesParentFirst`, `::_pickExistingVo`, `::_currentParentConceptId`, `::_stripOccSuffix`, `::_applyEdgeStyle`, `::_getParentAbsOffset`.

### Appearance preservation per object type

| Object | Action | How appearance is preserved |
|---|---|---|
| VisualElement | LAYOUT_ONLY / EXPAND_VIEW | Existing VOs: `vo.bounds` set (parent-relative); visual properties not affected by jArchi. |
| VisualElement | NEW_VIEW / new in EXPAND_VIEW | Default Archi style via `view.add(el, …)`. |
| VisualRelation | LAYOUT_ONLY / EXPAND_VIEW (existing) | `_applyEdgeStyle` rewrites bendpoints + label position; style (colour, width) untouched. |
| VisualRelation | NEW_VIEW / new in EXPAND_VIEW | `view.add(rel, srcV, tgtV)` + bendpoints; default style. |
| DiagramObject | LAYOUT_ONLY / EXPAND_VIEW (existing) | Same as VisualElement — bounds-only. |
| DiagramObject | NEW_VIEW | Not present (model selections contain no diagram objects). |

> Tested: `Scripts/View/test_visual_props.ajs` confirmed jArchi does **not** reset visual properties when `vo.bounds` is set (12 OK · 0 CHANGED). This is what makes [Invariants](#invariants) (appearance preservation) hold.

## Appearance module — appearance.js

**Realises:** [Appearance tab](#appearance-tab).

`Appearance.applyAppearance(view, preset)` — step 7 in `_generateSingle`. A no-op when `preset.appearance` has all features disabled.

### Depth computation

`_computeViewDepths(view)` walks `$(view).find("element")` and for each VisualElement:
- Counts visual ancestors via `$(vo).parent().filter("element").first()` iteration → depth.
- Classifies as container (`$(vo).children("element").length > 0`) or leaf.

Returns `{ voDepths: Map<VO, depth>, voIsContainer: Map<VO, bool>, maxContainerDepth }`.

### Style by nesting level

`_applyNestingLevel(view, settings, depths, isModify)` iterates all element VOs. Non-containers are untouched by font changes. Container at depth `d`: font = `max(9, rootFontSize − d × fontDecreasePerLevel)` pt; bold (`vo.fontStyle = "bold"`) only at depth 0 when `rootFontBold`. Deepest containers (depth `maxContainerDepth`) and leaves: no fill-colour override. Container at depth `d < maxContainerDepth`: fill colour = `_lightenHex(rootColor, d × darkenPerLevel/100)` — depth 0 is darkest (factor 0), deeper levels blend toward white.

`_lightenHex(hex, factor)` — pure hex math (no Chroma), blends each RGB channel toward 255 by `factor` (0–1).

### Highlight repeated elements

`_applyHighlightRepeated` groups VOs by `vo.concept.id`; applies `Chroma.scale(range).padding([0.15,0.15]).colors(N)` to concepts that appear ≥ 2 times.

### Style by property / style by related property

Both use `Chroma.scale(range).padding([0.15,0.15]).colors(N)` where N = number of unique property values (sorted for stable order). `_applyColorByRelationProperty` uses `$(el).rels()` to walk model relations; `_matchesRelDir` checks type and direction against the encoded `relTypes` list (same encoding as `filter.relationTypes`).

Ref: `lib/appearance.js`.

### GUI Appearance tab — dialog_main.js

`_buildAppearanceTab(tabFolder, ctx)` — follows the same `_scrolledTab` / `_group` / finish pattern as the Layout tab. Four groups: **Nesting telescope**, **Colour multiple occurrences**, **Colour by element property**, **Colour element by relation property**.

**Nesting telescope active state.** `_updateNestingTelescopeState(ctx)` enables/disables the telescope controls based on `ctx.widgets.lstNestingTypes` selection. Called from:
- `_syncToUI` (after all widgets are built)
- `onParamsChange` in `_buildLayoutTab` (when nesting type checkboxes change)
- The `chkTelescopeColor` toggle listener (to enable/disable root-colour and lighten-percent fields)

**`COLOR_RANGES`** — module-level constant in `dialog_main.js`; the same ColorBrewer scheme names used by `appearance.js`. The combo items for all three colour-range combos are populated from this list.

**Colour by relation property.** The relation selector reuses `_relCheckGrid(parent, 4, onChange)` unchanged — same look, same encoded output format as the Selection tab's relation grids.

`_saveUI` / `_syncToUI` extended with `appearance` block read/write. Modified indicator fires on every Appearance control change via the same `_markModified(ctx)` pattern as all other tabs.

## Engine adapter implementations

**Realises:** [Engine adapter contract](#engine-adapter-contract).

Three adapters, one per engine. Each lives in `Scripts/View/lib/engines/` and implements `layout(graph) → result` matching the [Engine adapter contract](#engine-adapter-contract) shapes.

### ELK

| Algorithm | ELK id | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|---|
| Layered | `layered` | ✓ | Orthogonal, Polyline, Straight | Full (compound graph) | ✓ |
| Tree | `mrtree` | ✓ | Orthogonal | Full | — (passthrough) |
| Force | `force` | — | — | None | — (passthrough) |
| Stress | `stress` | — | — | None | — (passthrough) |
| Radial | `radial` | — | — | **None** (crashes on compound graphs; spanning-tree pre-processing required) | — (passthrough) |
| Grid | `box` | — | — | Full | — (no edge routing) |
| Pack | `rectpacking` | — | — | Full | — (no edge routing) |

Nesting uses `elk.hierarchyHandling: "INCLUDE_CHILDREN"` on the graph plus `parent` on each node. Radial pre-processing: `_spanningTree` (BFS) removes cycles and joins disconnected components with virtual edges (`id: "__span_N"`, `_archiRelId: null` so the writer ignores them). Self-loops on passthrough algorithms emerge with empty bendpoints; Archi renders its default loop.

Ref: `lib/engines/elk.js`.

### Dagre

| Algorithm | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|
| Dagre | ✓ (`rankdir`) | Straight/Polyline only | Partial (`g.setParent()`) — inter-cluster edge routing limited | — (Dagre core drops self-loops; passthrough to LayoutResult with empty bendpoints) |

Ref: `lib/engines/dagre.js`.

### Graphviz

| Algorithm | GUI label | Direction | Routing | Nesting | Self-loops |
|---|---|---|---|---|---|
| dot | Dot | ✓ | Orthogonal, Polyline, Straight, Spline | Cluster subgraph | ✓ (native) |
| twopi | Twopi | Radial | — | Limited (cluster) | ✓ (native) |
| neato | Neato | — | Polyline/Straight | Cluster | ✓ (native) |
| fdp | FDP | — | Polyline/Straight | Cluster | ✓ (native) |
| sfdp | SFDP | — | Polyline/Straight | None | ✓ (native) |
| circo | Circo | — | — | Limited | ✓ (native) |

Ref: `lib/engines/graphviz.js`.

## GUI dialog — dialog_main.js

**Realises:** [Generate View dialog](#generate-view-dialog).

### Preset row

**[Delete]** — `SWT.PUSH` button, leftmost. `setEnabled(false)` when `ctx.config.name === "Default"`. On click: `window.confirm` → `PresetIO.deletePreset` → load Default → `_mergePreset` + `_syncToUI` + `_clearModified` + `_updateFilteredCount`. State is updated on combo `SWT.Selection` to enable/disable for the newly loaded preset.

**Preset combo** — `SWT.DROP_DOWN | SWT.READ_ONLY`. `SWT.Selection` calls `_mergePreset` + `_syncToUI` + `_clearModified` + tooltip update, wrapped in `ctx._ready = false / true` to suppress the modified indicator during load.

**Modified indicator** — a `Label` widget with text `"*"`, initially hidden. `_markModified(ctx)` sets visible (guarded by `ctx._ready`); `_clearModified(ctx)` hides it. Both functions are called from `_updateFilteredCount` and `_updateAlgorithmControls` (covers all parameter changes).

**[Save]** — calls `_saveUI`, then `PresetIO.writePreset(name, ctx.config)`, refreshes combo, calls `_clearModified`. Silent overwrite, no dialog.

**[Save As…]** — calls `_saveUI`, then opens `dialog_presets.openSaveAs`. On confirm: updates `ctx.config.name` and `ctx.config.description`, writes via `PresetIO.writePreset`, refreshes combo, clears modified indicator.

### Action row

- Cancel group: unlabelled (`setText(" ")` for GTK height-match). Always enabled.
- Create new view: both buttons always enabled.
- Modify selected view: both buttons greyed when `hasVisual = false` (selection contains no canvas VOs and no model-tree view node).
- Default button: New view when `hasVisual = false`; Layout only when `hasVisual = true`.

### Filter group

**Element types**: SashForm with a search box + available list (left) and chip panel (right). Chips show selected types as `Button "Label  ×"`; clicking removes.

**Relation types**: 4-column checkbox grid, alphabetically sorted.

**Diagram types**: 4-column grid aligned with relation types.

### Related-elements blocks

Each block is stored as an object containing its SWT widget references: group container (title bar), body composite (hidden on collapse), count label, reorder/collapse/remove buttons, a `collapsed` boolean, and widget wrappers for the relation-check grid, element-type selector, and depth spinner.

Key functions: `_addRelatedBlock(ctx, stepData, opts?)` appends a step block; `opts.startCollapsed` collapses it on creation. `_removeRelatedBlock` disposes the block and renumbers survivors. `_moveRelatedBlock(ctx, blockObj, ±1)` swaps position in the array and reorders SWT widgets via `moveBelow`. `_toggleCollapseBlock` toggles `body.layoutData.exclude` + visibility.

Ref: `dialog_main.js::_addRelatedBlock`, `::_removeRelatedBlock`, `::_moveRelatedBlock`.

### Live counter policy

Checkboxes, direction toggles, chip add/remove, block reorder/add/remove → fire on `SWT.Selection` (immediate). Depth spinner → `SWT.Selection` (arrow click) + `SWT.FocusOut`. Not `SWT.Modify` — per-keystroke recompute is wasteful.

### Dialog state model

The dialog separates configuration (model) from UI state (view):

- **`ctx.config`** — the live parameter object; source of truth between runs. Persisted to presets and session.
- **`ctx.widgets`** — flat map of named widget references.
- **`_syncToUI()`** — pushes `config` → widgets; called after `createDialogArea` and after preset apply.
- **`_saveUI()`** — reads widgets → `config`; called before run and before preset save.
- **`_updateActionControls(action)`** — enables/disables depth spinner and view name field based on the selected action.
- **`_updateAlgoControls(algo)`** — enables/disables direction/routing/ranker controls based on `algorithm.supportedOptions`.
- **`ctx.widgets.algRadios`** — `Map<algorithmName, ButtonWidget>`. All radio buttons share the same SWT composite parent (auto-mutually-exclusive on click).
- **`_updateActionColors()`** — sets active/inactive visual state on the action toggle buttons; called from all action toggle listeners and from `_syncToUI`.

Ref: `dialog_main.js`.

### Relation filter widgets

The direction-checkbox grid (used in global filter and in each related-elements block) stores one row per relation type: the relation type ID, a checkbox widget for incoming (←), and a checkbox widget for outgoing (→). No master activation checkbox. `getEncoded()` includes only rows where at least one direction is checked. `setEncoded(list)` sets each row's checkboxes from decoded direction suffixes; rows absent from the list are left unchecked.

The reverse and nesting checkbox grids (one checkbox per relation type, no direction) are stored as arrays at `ctx.widgets[name + "_checks"]`. Ref: `dialog_main.js::createRelCheckGrid`.

### SWT interaction notes

**Radio programmatic-deselect-all.** SWT auto-groups `SWT.RADIO` buttons in the same composite parent on click, but `setSelection(true)` programmatically does NOT auto-deselect siblings. On `_syncToUI`, explicitly call `algRadios.forEach(r => r.setSelection(false))` before calling `algRadios.get(name).setSelection(true)` to prevent multiple algorithms appearing selected.

**Bold group titles.** `_group(parent, label, cols)` applies a bold font to the group title by default. Pass `{ bold: false }` for action-row groups, which sit outside the scrolled area and use their own visual weight.

**GTK background/foreground.** `setBackground(null)` / `setForeground(null)` — use explicit `SWT.COLOR_WIDGET_BACKGROUND` for inactive state; system default for active. Calls during `createDialogArea` may not render until first paint — use `display.asyncExec` in the `create()` callback.

## Engine parameter mappings

**Realises:** [Algorithm capability matrix](#algorithm-capability-matrix) — concrete realisation in each engine.

Each adapter owns a `PARAM_MAPPING` table that translates GUI parameter values into engine-specific option objects. `defs.js::mapParams` iterates `algorithm.activeParams` and applies the relevant mapper — the caller supplies its own `PARAM_MAPPING`. No engine-specific option names or conversions appear in `defs.js`.

### ELK — Layered

| GUI parameter | ELK parameter | Mapping |
|---|---|---|
| Flow direction: L→R / R→L / T→B / B→T | `elk.direction` | `RIGHT` / `LEFT` / `DOWN` / `UP` |
| Relation lines: Orthogonal / Polyline / Straight | `elk.edgeRouting` | `ORTHOGONAL` / `POLYLINE` / `POLYLINE`+`elk.layered.unnecessaryBendpoints: true` |
| Level spacing | `elk.layered.spacing.nodeNodeBetweenLayers` | direct (px) |
| Element spacing | `elk.spacing.nodeNode` | direct (px) |
| Padding | `elk.padding` | `"[top=N,left=N,bottom=N,right=N]"` |
| Nesting | (pre-processing) | parent-child + `elk.hierarchyHandling: "INCLUDE_CHILDREN"` |
| Sort containers | (pre-processing) | checked → containers first then leaves, sorted by type then name; unchecked → model order |
| Align width by level | (two-pass) | Pass 1 measures natural widths; per nesting level, target telescopes `W[L] = W[L+1] + ring` (ring = 2 × container padding), anchored at the deepest level's narrowest box. Pass 2: leaves set to the target width, containers floored via `elk.nodeSize.constraints: [MINIMUM_SIZE]` + `elk.nodeSize.minimum`. ELK-only. |
| Snap columns to grid | (post-pass) | After final layout, `_snapColumnsToGrid` mutates absolute x of result nodes onto one global variable-width column grid: detect columns, column width = widest member, initial gap = `max(spacing+padding×ancestor-walls over rows) − 2·padding` floored at spacing; then iterate place-leaves + re-wrap + widen-colliding-boundaries until no adjacent container overlaps. Position-only; leaves unresized. ELK-only. |

### Dagre

| GUI parameter | Dagre parameter | Mapping |
|---|---|---|
| Flow direction | `rankdir` | `LR` / `RL` / `TB` / `BT` |
| Layer ranking | `ranker` | `network-simplex` (Balanced) / `longest-path` (Uniform) / `tight-tree` (Top-aligned) |
| Level spacing | `ranksep` | direct (px) |
| Element spacing | `nodesep` | direct (px) |

### Graphviz

| GUI parameter | Graphviz attribute | Mapping |
|---|---|---|
| Flow direction | `rankdir` | `LR` / `RL` / `TB` / `BT` |
| Relation lines | `splines` | `ortho` / `polyline` / `line` / `spline` |
| Level spacing | `ranksep` | px ÷ 96 (inches) |
| Element spacing | `nodesep` | px ÷ 96 (inches) |
| Aspect ratio | `ratio` | float (= 1/AR); `ratio` is honoured by dot, neato, fdp, sfdp |

### View-size: per-engine behavior

| Engine | maxWidth / maxHeight | aspectRatio |
|---|---|---|
| **ELK** | Hard layout bounds: `elkGraph.width` and/or `elkGraph.height` are set; ELK places all nodes within that area without coordinate scaling. | Not supported. |
| **Graphviz** | Position-spread minimum: after `layout()`, `_applySpread()` checks whether the natural bounding box is smaller than the requested value. If so, node *centers* are spread outward until the target is reached. If already larger, nothing done — compression is forbidden. | Passed as `ratio=<1/AR>`. Graphviz adjusts positions only, not node sizes. |
| **Dagre** | Not supported. | Not supported. |

## Platform notes — View-subsystem specifics

**Realises:** [Engine adapter contract](#engine-adapter-contract) and host-platform constraints. See [`ai/jarchi-scripting/SKILL.md`](../../ai/jarchi-scripting/SKILL.md) for general jArchi / SWT / GTK rules. This section records only View-subsystem quirks not covered there.

- **`$(view).children()` does not return view-reference VOs.** Use `$(view).find(dt)` per `DIAGRAM_TYPES` key instead.
- **`$(view).find("diagram-model-reference")` returns view-reference VOs, but their `.type` property returns `"archimate-diagram-model"`** — a jArchi 1.12 partial bug fix. Both strings are aliased in `DIAGRAM_TYPES` to prevent scattered type guards.
- **`view.add(diagramObjProxy, x, y, w, h)` fails.** The 4-argument overload exists only for `ArchimateElementProxy`. Check `el.type in DIAGRAM_TYPES` before branching; use the 2-argument form for diagram objects.
- **`vo.bounds = {…}` does not reset visual properties** (colours, fonts, line styles). Verified by `Scripts/View/test_visual_props.ajs` (12 OK · 0 CHANGED). This is what makes [Invariants](#invariants) (appearance preservation) hold.
- **`vo.bounds` values are relative to the immediate parent VO**, not absolute. The layout engine returns absolute coordinates; `_writeView` converts via `parentId` and `_getParentAbsOffset`.

## Realisation of design decisions

**Realises:** [Design decisions](#design-decisions).

| Part A decision | Realised in |
|---|---|
| Diagram-object types form a closed set | `Scripts/_lib/selection.js::DIAGRAM_OBJECT_TYPES` (SSOT) → `defs.js::DIAGRAM_TYPES` set-like frozen object |
| Connections partitioned from positional diagram objects | `selection_pipeline.js` step 6 — filters `type === "diagram-model-connection"` into a separate array |
| Action is a runtime parameter | `generate_view(preset, uiSelection, actionId)` — 3rd argument, never on `preset`. `validatePreset` would strip it. Dialog stores `ctx._actionId` separately. |
| Generated view opens in Archi UI | `generate_view` calls `_openView(views[0])` after the action completes. The helper reaches past the jArchi proxy via reflection (`ArchimateDiagramModelProxy.getEObject()`) and hands the EMF model to `EditorManager.openDiagramEditor` — the proxy's own `openInUI()` is unreliable for views created in the same script run. NEW_VIEW / EXPAND_VIEW / LAYOUT_ONLY produce one view (opened). ONE_EACH produces N views; only the first opens, so users aren't flooded with tabs. |
| EXPAND_VIEW target from existing visuals | Pipeline returns `existingView` populated from the selected view; `_generateSingle` uses it directly, bypassing `_getOrCreateView`. |
| Action-agnostic writer | One `_writeView` function. Per-object rule: exists → reposition (appearance preserved; parenthood re-derived from [Writer parenthood](#writer-parenthood) — move via jArchi 1.10 API if parent changed); else → create. Same rule for relations: existing → rewrite bendpoints; new → add. |
| Folders and view nodes stripped before layout | `selection_pipeline.js` step 4 — excludes `type === "folder"` and `type === "archimate-diagram-model"`. |
| Related-elements panel is multi-step + chain | `dialog_main.js::_addRelatedBlock` / `_updateFilteredCount` — step N+1's input = step N's additions only. An empty step zeros every later step. |
| Per-relation direction toggles independent | `_relCheckGrid` — `chkIn` (←) and `chkOut` (→) are independent direction checkboxes per relation type. No master activation checkbox. |
| Empty direction selection = follow all | `getEncoded()` includes only types where `chkIn.getSelection() \|\| chkOut.getSelection()`. Absent from the list → unconstrained at runtime ([Steps](#steps) step 5: empty union → all types allowed). |
| Algorithm selection via radio table | `_buildLayoutTab` — `algTableComp` 6-col composite; `ctx.widgets.algRadios: Map<algName, ButtonWidget>`. `_syncToUI`: deselect all then `algRadios.get(name)?.setSelection(true)`. `_saveUI`: iterate algRadios to find selected; fallback `"Layered"`. |
| Step auto-collapse on preset load | `_addRelatedBlock(ctx, stepData, opts)` — when `opts.startCollapsed`: body hidden, `gd.exclude = true`, `btnCollapse.setText("▸")`, `blockObj.collapsed = true`. `_syncToUI` passes `{ startCollapsed: idx > 0 }` for preset steps. |
| Spinner recomputes on commit, not keystroke | Depth spinner binds `SWT.Selection` + `SWT.FocusOut`, not `SWT.Modify`. |
| Coordinate conversion engine-agnostic via `parentId` | Engine adapters set `parentId` on result nodes; `_writeView` applies parent-relative conversion using `_getParentAbsOffset` (parent-first iteration ensures parent's NEW bounds are in place). |
| UI-only state partitioned | `_*`-prefixed keys (`_lastTabIndex`, …) preserved by `preset_io.readSession` after `validatePreset` strips unknowns. |
| ELK Radial spanning-tree pre-processing | `engines/elk.js::_spanningTree` — BFS over the graph; cycle edges dropped; virtual edges `id: "__span_N"` join disconnected components; `_writeView` skips virtuals (`_archiRelId: null`). |
| Cancel group `setText(" ")` | `_buildActionRow` — single space so GTK reserves title-bar height matching labelled siblings. |
| Per-step element-type filter is step-scoped | `_expandStep` applies `step.elementTypes` after relation traversal; step's row count and chain-forward input both reflect the pruned set. |
