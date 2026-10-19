# View Generation — Architecture Reference

## Content division

| Document | Holds | Never holds |
|---|---|---|
| [SPEC.md](SPEC.md) | **What** — functional behaviour, contracts, vocabulary, invariants. Implementation-free. | Technology, file or function names |
| ARCHITECTURE.md, Part A | Functional detail beyond SPEC.md (dialog, counting rules, option semantics) and the design decisions with their reasons. Implementation-free. | Realisation |
| ARCHITECTURE.md, Part B | **How** — realisation choices with why and where, module index, known gaps. | Restated code, internal function or variable names, tables the code or a generator holds, change history |
| Code | The details; a header comment per module. | — |
| [README.md](../README.md) | User guide: scripts, presets, tools. | Design |

**Target.** SPEC.md is the single *what*; ARCHITECTURE.md is the *how* (Part B) plus the design decisions. Part A's functional detail moves into SPEC.md, after which Part A holds only the design decisions. Until then, SPEC.md wins on a conflict.

**Order of change.** A behaviour change is written in SPEC.md / Part A first, a realisation change in Part B first, then the code. Docs and code change in the same commit.

## Marker conventions

This document uses two HTML-comment markers (invisible in rendered Markdown, visible in source):

|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Marker&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Meaning | Lifecycle |
|---|---|---|
| `<!-- @mark: .. -->` | Transient review comment for the next editor/AI to act on. | Acted on, then removed. |
| `<!-- @keep: .. -->` | Permanent guidance — the section has been reviewed and signed off; do not rewrite. | Stays in the document. |

---

# Part A — Architecture & Design

A JavaScript script that runs in jArchi, the scripting plugin for Archi.

Part A is functional and implementation-free: requirements, rules, design decisions. Realisation is in [Part B](#part-b--realisation).

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

The canonical vocabulary realises hard rule #11 in [ai/rules.md](../../../ai/rules.md): one name per concept across users, docs, logs, variable names, function names, and data structures. Exceptions only for technical data-structure roles (e.g. `parentMap`, `childIds`), documented once below and reverted to the canonical term at every user-facing surface.

### Terms

Stable terms. Used in code, UI labels, and documentation. No synonyms.

| Area                | Term                 | Definition                                                                                                                                                                                                     |
| ------------------- | -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model               | **element**          | A model concept (a typed thing in the modelling language).                                                                                                                                                     |
|                     | **relation**         | A directed, typed connection between two elements at the model level.                                                                                                                                          |
|                     | **view**             | A diagram: a positioned arrangement of elements, relations, and diagram objects. A model element may appear on many views.                                                                                     |
| Visual              | **VisualElement**    | The placement of one element on one view's canvas. Has bounds, may have appearance overrides, and points back to its model element.                                                                            |
|                     | **VisualRelation**   | The drawing of one relation on one view's canvas. Has endpoints (VisualElements) and bendpoints.                                                                                                               |
|                     | **occurrence**       | A visual appearance of an element in a view. A unique element normally has one occurrence; a nesting rule with *every container* (`everyContainer: true`) can give it several.                                                              |
| VisualElement role  | **container**        | Drawn as a box around one or more other VisualElements.                                                                                                                                                        |
|                     | **nested element**   | Drawn inside a container; not itself a container.                                                                                                                                                              |
|                     | **standalone**       | Drawn at view root; no children, not inside anything.                                                                                                                                                          |
|                     | **extra occurrence** | Second or Nth visual appearance of the same element under another container (from a nesting rule with `everyContainer: true`). Applies whether the duplicated visual is a nested element or a sub-container. **Managed** when the system placed it and recorded it on the view ([Managed-occurrence record](#managed-occurrence-record)); every other occurrence is **user content**.                 |
| VisualRelation role | **nesting**          | Drawn as box-in-box (the nested element sits inside the container's box; no line). Driven by `params.nestingRules`.                                                                                    |
|                     | **connection**       | Drawn as a line between two boxes. Every VisualRelation is either a nesting or a connection.                                                                                                                   |
| Canvas-only         | **diagram object**   | A canvas-only object with no model concept: note, group, image, legend, view-reference, or a connection drawn between diagram objects. Belongs to exactly one view.                                            |
| Subsystem           | **Layout**           | Algorithmic positioning of all visible objects on a view.                                                                                                                                                      |
|                     | **Preset**           | A named, persistable bundle of layout configuration (algorithm, parameters, filters, related-elements rules, and target naming).                                                                               |
|                     | **Action**           | What the system does on invocation: create a new view, create one view per element, expand an existing view, or re-layout an existing view. Runtime parameter; never stored in a preset.                       |
|                     | **Session**          | The last-used configuration, restored automatically when the UI opens.                                                                                                                                         |
| Terminology         | **Counter rule**     | *Relations* is a model-layer term. View-side counters use **nestings** and **connections**. Pipeline counters (Filtered-base, Step-N-adds) use **relations**. Total-to-view uses the nesting/connection split. |

Internal-only data-structure names (`parentMap`, `childIds`, `containerIds`, `occurrenceMap`, `routedRels`, `nestingRels`, `parentRels`) describe algorithmic structures, not counted concepts. They are code-only.

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
| Repeat | Runs, hops |
| Layer ranking | Ranker |
| Tight packing, Pack | rectpacking |
| Preset | Parameter file, config file |
| One view each | Per element |
| Re-layout | Layout only |
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
  - *Related-elements layers* — an ordered list of expansion steps, each specifying which relation types to follow, how often to repeat, and an element-type pruning filter.
  - *View naming* — folder and name used when creating new views.
- **Action** — a runtime verb, never part of the preset:
  - `NEW_VIEW` — create a fresh view from the full selection.
  - `ONE_EACH` — create one view per selected element.
  - `EXPAND_VIEW` — add the elements related to the elements selected on a view (and the relations the steps follow) to that view, in place, and lay out the whole view. The rest of the view keeps its content.
  - `LAYOUT_ONLY` — re-layout the existing view contents in place, without adding or removing elements.

Output: `ArchimateView` — the views that were written or updated, with all elements positioned and relations routed.

#### Engine adapter API (Layer 2 → Layer 3)

The adapter contract is `layout(LayoutGraph) → LayoutResult`. Input:
- **Nodes** — one per element or diagram object. Each carries an id, display label, element type, fixed width and height (leaf nodes) or no size (containers — the engine sizes them from their children), and an optional parent id expressing nesting.
- **Edges** — one per connection (relation drawn as a line). Each carries source and target node ids (already swapped for reversed relation types), a label, and a layout weight. Nestings (relations resolved to containment) are expressed via `parent` on the child node, not as edges.
- **Options** — algorithm-specific parameters translated by the adapter from the preset (direction, spacing, routing style, padding, etc.).
- **View-size constraints** — at most one of maxWidth or aspectRatio is non-zero at a time.
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
  schemaVersion : 3                     // 2 = rule lists; 3 = everyContainer per nesting rule
                                        // (replaces params.showInEveryContainer). Older presets are
                                        // migrated offline and refused unmigrated
  name        : string                  // saved preset's identifier
  algorithm   : enum                    // Layout style

  params {                              // dialog labels: defs.PARAM_LABELS
    direction, routing, labelPosition,  // Direction, Routing, Label
    ranking, acyclicer, nodePlacement   // Ranking, Cycles (Dagre), Placement (Layered)
                : option strings        // allowed values: ALGORITHMS[*].supportedOptions

    nestingRules : RelationRule[]       // Nesting — relations drawn as nesting; [] = none
    reverseRules : RelationRule[]       // Reverse — flipped relations; [] = none

    elementWidth, elementHeight,        // Width, Height
    elementSpacing, layerSpacing,       // Distance, Layer distance
    connectionSpacing,                  // Between
    connectionElementSpacing,           // Distance to element
    padding,                            // Padding (container border ↔ contents)
    labelMaxLineWidth : numbers (px)    // Wrap label at (with Use label width)
    diagramPadding    : number (px)     // preset-only (HIDDEN_PARAMS): canvas margin

    maxWidth, aspectRatio : numbers     // View size (0 = unconstrained)
    viewSizeMode : "none" | "maxWidth" | "aspectRatio"   // which View size radio; "none" = Free

    sortContainers,                        // Sort containers
    alignWidthSameType,                    // Same width per level (key kept for back-compat)
    snapColumnsToGrid, labelSizing,        // Snap columns to grid, Use label width
    connectionLabelSpacing : booleans      // Reserve label space

    containerAlgorithm : string     // Layout inside: "Layered" | "Grid" | "Pack"
    connectionsMode    : string     // "Crossing containers" | "Between containers"
  }

  filter {                              // every list: empty = keep all
    elementRules  : ElementRule[]       // seed elements
    diagramRules  : DiagramRule[]       // diagram objects of selected views
    relationRules : RelationRule[]      // relations between the filtered elements
  }

  relatedElements {
    steps : Step[]                      // ordered, chain — one entry per Step
                                        // block in the GUI. Step N (N≥2) traverses
                                        // from step N-1's additions only.
  }

  view {                                // Create new view actions only
    name   : string                     // New view: view name ("" = first selected element)
    folder : string                     // path under /Views, e.g. "/_Generated/Test";
                                        // "" = GENERATED_VIEW_FOLDER ("/_Generated")
    suffix : string                     // One view each: appended to each element name
  }

  description : string                  // shown under the preset combo

  appearance {
    styleByProperty {
      rules            : StyleRule[]    // applied in order; the later rule wins on one object
      mixedValuesColor : string         // hex fill for an object that gets several values
      lineWidth        : number         // 0 = no change; 1 = Normal, 2 = Medium, 3 = Heavy —
                                        // for relations colored by a Color = Relation rule
    }
    nestingLevel {
      fontEnabled          : boolean    // vary font size by nesting depth
      rootFontSize         : number     // font size for root containers (pt)
      rootFontBold         : boolean    // bold at root level
      fontDecreasePerLevel : number     // pt decrease per level deeper
      colorEnabled         : boolean    // vary fill colour by nesting depth
      rootColor            : string     // hex fill colour for root containers (darkest)
      lightenPerLevel      : number     // percent lightened per level toward leaves (0–50)
    }
    highlightRepeated {
      enabled    : boolean              // assign unique colour to each element appearing > once
      colorRange : string               // ColorBrewer scheme name (Chroma.js)
    }
  }

  engineParams {                        // per-engine native-option overrides; overrides only —
    ELK?, Dagre?, Graphviz?, layout?    // defaults live in each adapter. Deep-merged before
  }                                     // layout. See Part B, SSOT and engine options.

  viewProperties {
    addObjectId : boolean               // if true and the view has no "Object ID" property,
                                        // generate a UUID and write it. Existing value is
                                        // never overwritten.
    properties : Array<{
      key     : string                  // property name (never "Object ID")
      value   : string                  // value to write to the view
      enabled : boolean                 // only enabled rows are written at generation time
    }>
  }
}

Step {
  repeat         : 1..5 | "untilNothingNew"
                                        // runs of this step; each run starts from the previous
                                        // run's additions. "untilNothingNew" stops when a run adds
                                        // nothing, capped at REPEAT_MAX (10) runs
  rules          : StepRule[]           // [] = follow every relation
}
```

#### Rule lists

One rule model for every filter.
A list keeps what matches **any active Include rule**, unless an **Exclude rule** matches too;
order has no meaning (style rules excepted: the later rule wins). A type field holds a type id
or `""` (= All); `mode` defaults to `"include"`, `on` to true.

| Rule kind | Fields | Used by | Empty list |
|---|---|---|---|
| `element`  | mode, elementType, property, value | `filter.elementRules` | keep all |
| `diagram`  | mode, diagramType | `filter.diagramRules` | keep all |
| `relation` | on, mode, source, relation, target, propertyOf, property, value, everyContainer (nesting rules only, default false) | `filter.relationRules`, `params.nestingRules`, `params.reverseRules` | filter: keep all · nesting/reverse: none |
| `step`     | mode, previous, direction, relation, added, propertyOf, property, value | `steps[].rules` | follow all |
| `style`    | on, color, source, relation, target, propertyOf, property, colorRange | `appearance.styleByProperty.rules` | no styling |

**Step rules are written from the previous step's elements.** `direction`: `outgoing` = the
previous-step element is the relation's source, `incoming` = its target, `either` (default) =
both. `previous` constrains the previous-step element's type, `added` the new element's type;
`propertyOf` (`added` / `relation` / `previous`) says whose property must equal `value`. Which
relations a step *draws* (`matchStepRelation`): an Include rule matches on relation type,
direction and `previous` only — `added` and the property only decide which elements join;
an Exclude rule matches in full. This keeps a migrated step exactly equal to its old form.

**Style rules.** `color`: `element` (the element by its own property; `source` holds its type),
`relation`, `source` / `target` (that end of a matching relation — model-wide relations, so a
relation need not be on the view). `propertyOf`: `element` (the styled element), `relation`,
`source`, `target`. Several distinct values on one object → `mixedValuesColor`.

**Validation.** `validatePreset` normalises each rule; an unknown key, enum value or type id
skips the rule with a console warning — a typo never widens a filter to All. A preset with the
old keys (`filter.elementTypes`, `steps[].relationTypes`, `params.nestingRelationTypes`, …) is
refused with a message naming the migration script.

**File form.** `rel_filter.stringifyPreset` (used by `preset_io.writeJSON`) omits fields at their
default, writes a pass-all filter list as `[]` and puts every rule on one line.

### Action

A runtime parameter, not preset content: `generate_view(preset, selection, actionId)`. Preset files never store it. A script named `<preset>_<Generate|GenerateMultiple|Expand|Layout>_<LR|RL|TB|BT>.ajs` takes preset, action and direction from its file name; the `View/_*.ajs` scripts run the base preset `all` (or the code defaults when it is absent) with fixed overrides.

### VisualSet

`VisualSet` is the triple `{ visualElements, visualRelations, diagramObjects }` — the *existing* visual objects currently on a target view, captured together with their bounds, appearance, and visual parenthood.

The writer ([Invariants](#invariants)) consults the VisualSet per result object: a counterpart found in the set is **repositioned** (appearance preserved; parenthood re-derived from [Nesting](#nesting)); an object with no counterpart is **created** with default appearance. The VisualSet is captured before any model traversal, so reposition-vs-create is independent of pipeline-stage ordering.

For actions in the **Create new view** group, the VisualSet is empty. For actions in the **Modify selected view** group, it is captured from the target view before the pipeline runs.

### Managed-occurrence record

The view records which extra occurrences the system placed ([Managed extra occurrences](#managed-extra-occurrences)). A record identifies a **placement** — element, its chain of containers up to the view root, and the nesting relation — not a visual object, so a copied view keeps its managed occurrences. The system rewrites the records after every run; the user does not edit them. Storage: [Part B](#managed-extra-occurrences--target).

## Generate View dialog

The **Generate View dialog** lets you define a selection and layout, then run view generation. You can save your configuration as a named preset and reload it later. Top-to-bottom structure:

```
┌─ Generate View ──────────────────────────────────────────────────────────────┐
│  Preset: [Application Flow LR  ▼] *  [Save] [Save As…] │ [Rename…] [Delete]  │
│          Views of application flows, left to right        (description)      │
│                                                                              │
│  ┌─[Selection]──[Layout]──[Appearance]──[Properties]──────────────────────┐  │
│  │   (tab content below)                                                  │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│  On the generated view:                                                      │
│    elements:    18 containers · 92 nested elements                           │
│    relations:   11 nestings · 98 connections                                 │
│  ┌─ Create new view ─────────────────────┐ ┌─ Modify selected view ───────┐  │
│  │ Folder: [/_Generated___] Name: [____] │ │ View: Customer journey       │  │
│  │ [New view]        [One view each]     │ │ [Expand view]  [Layout only] │  │
│  └───────────────────────────────────────┘ └──────────────────────────────┘  │
│                                                                   [Cancel]   │
└──────────────────────────────────────────────────────────────────────────────┘
```

The dialog is 1000 px wide and as tall as the monitor's usable area (at most 1600 px); each tab scrolls on its own, the preset row and the action area stay visible.

### Preset row

The preset row sits above the tab strip. Controls, left to right:

- **Preset combo** — lists every saved preset, also in nested folders (`folder/sub/name`); Default first. Picking a preset loads all its settings — values of params the preset's algorithm does not use included — so a later Save writes back exactly what was loaded. Unsaved changes are discarded without a prompt.
- **`*`** — shown while the settings differ from the saved preset: after any change, and on open when the session differs from the preset it came from (the view name is not compared — it is pre-filled from the selection).
- **[Save]** — overwrites the current preset with the current settings.
- **[Save As…]** — Name, Folder and Description; writes a new preset and selects it. Asks before overwriting another preset.
- **[Rename…]** — same dialog; renames or moves the *saved* preset and edits its description. Unsaved changes stay in the dialog and are not written. Asks before overwriting another preset.
- **[Delete]** — after a confirm, deletes the saved preset and loads Default.
- **Description line** — the preset's description, grey, under the combo; hidden when empty.

**Default preset.** A preset named `Default` always exists; it is created on first run if absent. Rename and Delete are disabled for Default.

**What a preset file holds.** Only the [Preset schema](#preset-schema) — never the action or dialog state.

**Session continuity.** On dialog open, the last-used settings are restored from the session file (`_session.json`, user-local, never shared as a preset). It also holds UI-only state such as the active tab.

### Selection tab

The Selection tab decides *which* objects feed the layout: the counts group at the top, then the global filter, then any related-elements blocks.

```
  ┌─[Selection]──[Layout]────────────────────────────────────────────────────┐
  │  ┌─ Current selection ─────────────────────────────────────────────────┐ │
  │  │  Selected:    3 elements, 2 relations, 1 view, 1 folder;            │ │
  │  │               First object: Business Actor: Customer                │ │
  │  │  Containing:  12 elements, 8 relations                              │ │
  │  │  ────────────────────────────────────────────────────────────────   │ │
  │  │  Filter selection by element type (none = keep all):                │ │
  │  │   Mode    │ Element type                                     ✕      │ │
  │  │   Include │ All                                              ✕      │ │
  │  │   [+ Add rule]  ☐ Property condition                                │ │
  │  │  Filter selection by diagram type (none = keep all):                │ │
  │  │   Mode │ Diagram type     [+ Add rule]                              │ │
  │  │  Filter selection by relations (none = keep all):                   │ │
  │  │   Mode │ Source type │ Relation type │ Target type   [+ Add rule]   │ │
  │  └─────────────────────────────────────────────────────────────────────┘ │
  │  ┌─ Expand selection ─────────────────────────────────────────────────┐  │
  │  │ Expand the selection with connected elements. Each step defines    │  │
  │  │ which relation to follow.                                          │  │
  │  │ ┌──────────────────────────────────────────────────────────────┐   │  │
  │  │ │ [▾] Step 1 · Adds: 4 elements · 3 relations   [↑] [↓]   [✕]  │   │  │
  │  │ │ ──────────────────────────────────────────────────────────── │   │  │
  │  │ │ Mode   │Previous step│Direction│Added          │Added      │ │   │  │
  │  │ │        │elements     │         │relations      │elements   │ │   │  │
  │  │ │Include │Grouping     │Outgoing │Aggregation (3)│All (4)    │✕│   │  │
  │  │ │ [+ Add rule]  ☐ Property condition   Repeat: [1× ▼]          │   │  │
  │  │ └──────────────────────────────────────────────────────────────┘   │  │
  │  │ ┌──────────────────────────────────────────────────────────────┐   │  │
  │  │ │ [▸] Step 2 · 1 rule · Adds: nothing           [↑] [↓]   [✕]  │   │  │
  │  │ └──────────────────────────────────────────────────────────────┘   │  │
  │  │ [+ Add step]                                                       │  │
  │  └────────────────────────────────────────────────────────────────────┘  │
  └──────────────────────────────────────────────────────────────────────────┘

```

#### Current selection & live counts

The **Current selection** group shows two summary lines; what the filter keeps shows per rule in the filter tables' type combos, and each related-elements block has its own counter:

- **Selected** — raw count of what the user picked in the UI. Includes a `First object: <Type>: <Name>` suffix naming the first iterated object.
- **Containing** — count after recursive expansion of folders and views.
- **Filter rules** — each rule's type combo shows how many it keeps on its own, e.g. *Grouping (28)* (no separate *Filtered* line).
- **Adds** — one counter per block, in the block's header row. Shows what the block ADDS (not cumulative). Zero-count renders as `Adds: nothing`; a collapsed block also names its number of rules. Per rule, the chosen Added relations / Added elements type shows `(n)` in its combo, e.g. *Aggregation (3)*: what the step adds with only that rule — same input, same repeat — so adding or changing another rule never changes it (rules may overlap; an Exclude rule shows what it removes from the other rules' result). Counts per rule are cached per rule and step input.

Only types with count > 0 are rendered on each line. Empty selection renders `Selected: nothing` (no First-object suffix).

Counts are driven by the same selection-pipeline functions the view-generation API uses ([Selection pipeline](#selection-pipeline)) — so the displayed counts match the post-confirm result exactly. Counts update on every rule change, repeat change and block ordering operation.

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

The additive rule is exact: `Filtered.elements + Σ Step N.adds.elements = Total.elements` AND `Filtered.relations + Σ Step N.adds.relations = Total.relations`. Per-step `adds.relations` is the count of new relations found in that step's pass: relations of the step's type where at least one endpoint was in the cumulative set *before* this step (old×old, old→new, new→old — new×new excluded), minus any already counted in a prior pass. Not a count of raw-selection relations.

The on-screen [totals line](#totals-line) (below the tabs) carries the same grouped totals, **hide-zero**: subfields with value 0 are omitted, and a sub-line whose every subfield is 0 is skipped entirely. Live counter refreshes (every filter change, block edit, repeat change, property/value filter change, block reorder) push the same values to that label and to the console.

#### Global filter

Three independent rule tables below the counts ([Rule lists](#rule-lists)). Each rule's type combo shows how many it keeps on its own, *Grouping (28)* (an Exclude rule: how many it removes from the other rules' result). Filtering is visibility-only; it does not alter nesting structure ([Invariants](#invariants) — filter is non-destructive). Each table shows the default row `Include | All` when nothing is filtered.

- **Element type** — Mode · Element type, plus Property · Value behind *Property condition* (on and locked as soon as a rule uses a property).
- **Diagram type** — Mode · Diagram type: the diagram objects of selected views (a view reference matches *reference*). Shown only when the selection holds diagram objects; its rules are kept either way.
- **Relations** — Mode · Source type · Relation type · Target type: which relations between the filtered elements are drawn.

#### Related-elements blocks

The Related-elements group (GUI title: **Expand selection**) opens with a one-line explanation; below it sits a dynamic, ordered list of blocks and, under the last one, `[+ Add step]`. Each block is a frame:

- **Header row**: collapse/expand triangle (▾/▸) and the bold title `Step N` on the left (title and summary are clickable too); the `Adds:` summary; move (↑ ↓) and, set apart, remove (✕) on the right. Different place and shape, so collapsing and moving cannot be confused.
- **Rule table** (kind `step`): Mode · Previous step elements · Direction · Added relations · Added elements (each combo shows the rule's count after the chosen type), plus Property of · Property · Value behind *Property condition*. Property and Value lists come from the step's candidates (every relation the step saw, before its rules) that match the rule's types.
- **Footer**: `[+ Add rule]`, *Property condition*, **Repeat** (`1×`–`5×` or `until nothing new`, max 10 runs; the `Adds:` label then shows `(nothing new after N×)` or `(stopped at max 10×)`).

Each step's additions feed the next step's input — chain ([Steps](#steps) section Step 3). An empty step terminates the chain.

### Layout tab

The Layout tab decides *how* objects are positioned. Groups follow the order of deciding — structure first (Nesting, Reverse, Containers), then Flow, Elements, Connections and View size.

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
│ │  parent. Every container on a rule shows such a child in every parent.│ │
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
│ │  Spacing:  Between [25]  Distance to element [40]                │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ View size ───────────────────────────────────────────────────────────┐ │
│ │  ● Free   ○ Aspect ratio: [16:9 widescreen ▼]   ○ Max width: [0]       │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```

**One source.** Every label, tooltip and "Used by" line comes from the SSOT; the tables below are generated from it ([Part B, SSOT](#ssot-and-engine-options)).

**Relation counters.** The Nesting and Reverse tables count, per rule, the relations on the predicted view it matches on its own — shown after the chosen relation type, *Aggregation (62)* (an Exclude rule: what it removes from the other rules' matches) — and, for nesting, how many of them become a nesting (*Nested*). A grey note under Nesting says why matching relations are drawn as a line instead: the child already has a parent (one parent per child for rules without *Every container*), the nesting would be circular, or the relation is a self-relation. Computed with the same nesting split and resolution as the writer.

**Inactive settings.** A setting the chosen algorithm does not use (not in its `activeParams`) is greyed and keeps its value. Connections, Nesting, Reverse and View size end with a grey hint naming them — *"Not used by Dot: Reserve label space, Between, Distance to element."*, or *"Not used by Force."* for a whole group; Containers, Flow and Elements show the same text as the box's tooltip. Containers settings are also greyed, with a tooltip, until a Nesting rule is on. The explanation of the Nesting and Reverse rules (parent = source, what Reverse does in Flow and Nesting) is the tooltip of those boxes.

**Form rows.** Containers, Flow, Elements and Connections share one heading column (*Size:*, *Order:*, …), as wide as the widest heading; after it each label sits right before its control (6 px) and pairs follow each other (20 px). Rows that share a raster key line up as a table: every column starts at the same x, labels as wide as the widest label of their column, so the controls stand below each other. Flow, Elements and Connections share a raster over the first label/control pair only — the fields behind it follow on as in a plain row; Containers › Options is a full 2×2 raster. Spinners have one width (65 px), combos keep their natural width. Nothing stretches with the dialog: combos and spinners keep their width, the algorithm radios and rule tables their natural column widths; notes and hints wrap at the box width. A rule table is never cut off: when it is wider than the tab (Property condition on), the dialog grows — only wider, within the monitor, never back — and on a monitor that is too narrow the tab scrolls horizontally.

**Look.** Every group has a slightly lighter background than the page, inherited by its children. A combo or spinner's label greys together with it.

**Empty Nesting / Reverse.** An empty table shows the default rule switched off, as an example; untouched it is saved as `[]`. Reverse has an empty cell where Nesting has *Nested*, so the two tables line up.

**Locks.** Connections falls back to *Between containers* (greyed, reason in the tooltip) when Layout inside is Grid or Pack, or a view size is active — see [Container algorithm and connections mode](#container-algorithm-and-connections-mode). Width and Height are greyed while Use label width is on; Wrap label at only applies with Use label width.

#### Algorithm selection

Algorithms are organised into five styles in a radio table; all algorithms are always visible.

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

#### Layout parameters

Field = dialog label; Tooltip = its first two lines (the third, "Used by", is the last column).

<!-- generated:layout-params -->
**Nesting**

| Field | Parameter | Tooltip | Used by |
|---|---|---|---|
| Nesting | `nestingRules` | Draw matching relations as nesting: the child inside its parent. — Parent = source of the relation; with Reverse, the target. | Layered, Tree, Grid, Pack, Dagre, Dot, Neato, FDP |

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
| Show in every container | `showInEveryContainer` | An element nested in several containers appears in each of them. — Off: it appears in the first container only. | Layered, Tree, Grid, Pack |
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

**Preset-only parameters** (`HIDDEN_PARAMS`) have no dialog control because they hardly change the view; a preset can still set them, and `generate_view` logs a value that differs from the default (*"Preset values not in dialog: diagramPadding=20"*):

| Parameter | Effect |
|---|---|
| `diagramPadding` | Margin between the canvas origin and the outermost elements (px); shifts the whole diagram only. |

`viewSizeMode` records the selected View size radio (`"none"` = Free). Older presets without it get the first non-zero view-size value.

### Appearance tab

The Appearance tab applies **post-write visual styling** (fill colours, fonts, line widths) to elements and connections on the generated view. Styling runs as a separate pass after the layout writer has positioned all elements — it does not affect positions or sizes and is not subject to the [No post-layout scaling](#no-post-layout-scaling) rule.

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
│ │  (Active only when a Nesting rule is configured in the Layout tab)       │  │
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

Styling always runs when any feature is enabled, regardless of action (NEW_VIEW, ONE_EACH, EXPAND_VIEW, LAYOUT_ONLY). On LAYOUT_ONLY/EXPAND_VIEW, existing appearance overrides are replaced.

Precedence when several groups target the same element: nestingLevel → highlightRepeated → styleByProperty (its rules in list order). Later wins.

Three groups (in tab order):

#### Style by property

One rule table (kind `style`, [Rule lists](#rule-lists)); it replaced the former Style by property (element / relation), Style by related property and Style by connected element groups:

| Color | Property of | Was |
|---|---|---|
| Element (own property) | — (the element) | Style by property → elements |
| Relation | Relation / Source element / Target element | Style by property → relations |
| Source / Target element | Relation | Style by related property |
| Source / Target element | the other end | Style by connected element |

A rule is active when it is on and has a property. Its Property combo shows feedback after the chosen name, *Status (14)*: the objects on the predicted view the rule colors; before a property is chosen, just *(n)*: the objects it reaches. Unique values are sorted and mapped to evenly spaced colours on the rule's ColorBrewer range; an object with several different values gets the **mixed values color**. Relations colored by a `Color = Relation` rule take the fixed **line width** when one is chosen. Rules apply in list order; where two rules style the same object the later wins, and the dialog marks both with ⚠ (computed on the predicted view contents). The row tooltip reads the rule as a sentence.

On EXPAND_VIEW / LAYOUT_ONLY a rule that is **off** resets what it would style (fill, or line colour and width) unless another rule styled it; manually set colours elsewhere are left alone.

#### Style by nesting level

Active only when a Nesting rule is on in the Layout tab. An informational label replaces the controls when nesting is not configured. All controls appear on two compact rows (one for font, one for color).

**Font rule.** Root containers (depth 0) get `rootFontSize` pt (+ bold if `rootFontBold`). Each deeper level gets `rootFontSize - depth × fontDecreasePerLevel` pt, clamped at the Archi default (9 pt). Non-containers are untouched. Only containers in the same-type chain from their subtree root are affected (see Type chain rule below).

**Color rule.** Each chain uses the depth-0 root container's current fill color as the gradient anchor (darkest). Each level inward is lightened by `lightenPerLevel %` (channels blended toward white). If the root has no fill and no `rootColor` is configured, that chain is skipped. Leaf elements of the same type as their parent container chain are also colored at their own depth. Only elements in the same-type chain from their subtree root are affected (see Type chain rule below).

**Type chain rule.** Each depth-0 container defines its own subtree root type (its ArchiMate element type). Color is applied to containers **and leaf elements** whose type matches their subtree root's type and whose entire ancestor chain back to that root is also of the same type. Font scaling is applied to containers only. A container of a different type breaks the chain: it receives no style change and neither do any of its descendants, regardless of their own type.

#### Highlight repeated elements

Assigns a unique fill colour from a ColorBrewer scale to each element concept that appears more than once on the view (requires a nesting rule with `everyContainer`). The enable checkbox and color range appear on a single row.

**Colour ranges.** All color-range combos use the same set of ColorBrewer scheme names available in Chroma.js (see `COLOR_RANGES` in `appearance.js`). Each combo is accompanied by a gradient preview Canvas strip that repaints on selection change.

### View properties tab

Writes key/value properties to each generated view and optionally assigns a unique Object ID.

```
┌─[Selection]──[Layout]──[Appearance]──[View properties]──────────────────────┐
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

**How it works:**

- On tab build, every property found on any view in the current model is scanned (excluding `"Object ID"`). Each unique key becomes one row in the grid.
- A row is a checkbox (enable/disable), a property-name label, and an editable combo pre-filled with all values found for that key across all model views.
- Nothing is pre-selected by default; the user opts in per property.
- On action: every enabled row's value is written to the generated view with `view.prop(key, value)`. Disabled rows are ignored.
- Styled properties are written as a post-write pass, after layout and appearance passes.

**Object ID rule:** When *Add unique Object ID* is checked and the target view has no `"Object ID"` property, `Common.generateUUID()` generates a UUID and writes it. If the view already has an Object ID it is left unchanged. For *One view each*, each view receives its own independent UUID.

**Preset storage:** `preset.viewProperties.properties` stores all rows the user has configured (enabled or not) so combo selections survive preset round-trips. Only rows with `enabled: true` are written to the view at generation time.

### Totals line

Outside the tabs, above the action groups: an always-visible multi-line line with the predicted on-view totals, hide-zero:

```
On the generated view:
  elements:    18 containers · 92 nested elements
  relations:   11 nestings · 98 connections
```

The structure matches the console's `Total to view:` row (same sub-lines: elements / relations / diagram). On-screen hides subfields whose value is 0 and skips a sub-line when all its subfields are 0; the console keeps everything visible for stable log columns. The line refreshes on every dialog change (filter toggle, block edit, repeat change, block reorder, nesting / reverse change).

### Action area

Two groups with the same rows (one field row, one button row) so fields and buttons line up; Cancel below, bottom right.

- **Create new view** — *Folder* and *Name* (these apply to this group only), *New view*, *One view each*. Always enabled. VisualSet at pipeline start is empty ([VisualSet](#visualset)).
- **Modify selected view** — *View: \<name\>* names the target view (the view of the selected canvas objects, or a view selected in the model tree); *Expand view*, *Layout only*. Both work on that view **in place**. *Expand view* is enabled only when objects on the view are selected — it expands from them. Without a target view the line says what to select and the buttons are disabled. VisualSet is captured from the target view at pipeline start.
- **Cancel** — discards changes; remembers UI-only state (active tab) for the next open.

| Action | View name and folder |
|---|---|
| **New view** | Name from the Name field (pre-filled with the first selected object); folder from Folder, a path under Views (`/_Generated/Project`; empty = `/_Generated`). A view with that name in the folder is overwritten. |
| **One view each** | One view per element, named after the element plus `preset.view.suffix` (e.g. `" (GGM)"`); Name is not used. |
| **Expand view / Layout only** | The selected view itself; Folder and Name are not used. |

**Error / edge cases:**
- **Empty selection** — the dialog opens normally; all counts show zero. Actions still run (they produce an empty view).
- **Preset validation failure** — unknown keys are dropped and missing keys receive defaults. The dialog never aborts on a malformed preset; it falls back to defaults silently.

### Interaction rules

Tech-agnostic rules for all interactive controls. Realisation: [Part B, Dialog](#dialog).

| Rule | Rationale |
|---|---|
| **Preset auto-apply on selection.** Selecting a preset in the combo immediately loads its values (no separate Apply button). Unsaved changes to the previously active preset are silently discarded. | Matches the universal pattern for preset pickers (DAWs, IDEs, Lightroom). An explicit Apply button adds a click without adding safety, since overwriting a preset is a separate [Save] action. |
| **Modified indicator.** An asterisk next to the combo while the settings differ from the saved preset — after a change, or on open when the session differs from it. It clears on Save, Save As or loading a preset. | Users need to know when [Save] would do something. Without the indicator, they either never save (assuming auto-save) or always save defensively. |
| **Default preset is always present and cannot be renamed or deleted.** The application creates it on first run if absent. Rename and Delete are disabled when Default is selected. | Guarantees the combo is never empty and gives users a safe fallback. |
| **Switching presets discards unsaved changes silently.** No confirm dialog on preset switch. | For a settings dialog that has [Save] and [Save As…] as explicit save actions, interrupting every preset switch with a confirm dialog would be more annoying than helpful. The modified indicator makes the loss visible before it happens. |
| **Direction checkboxes: empty = follow all.** Both-unchecked is valid. No UI enforcement prevents it. The system interprets absence from the encoded list as unconstrained ([Preset schema](#preset-schema), [Steps](#steps) step 5). | Eliminates the need for a two-level "relation on/off vs direction" interaction. Reduces friction for the common case: no filter = all relations followed. |
| **Algorithm selection uses a radio table.** All algorithms for all styles are always visible simultaneously in a style-grouped table. | Users scan the full option space without opening a combo. Makes style/algorithm relationships visible at a glance. |
| **Live counts update on value-commit, not per-keystroke.** Spinner controls fire on arrow-click or focus-loss; not on each keystroke. | Relation traversal for live counts is expensive. Per-keystroke recompute produces flicker and wasted CPU. |
| **Steps start expanded on preset load.** Every step block opens expanded, so all rules and counts are visible at once. | The user collapses a block (▾) when it is in the way; a collapsed block names its rule count. |

---

## Algorithm capability matrix

Not all algorithms support all parameters. A parameter that is inactive for the chosen algorithm is greyed in the UI; its value is kept (preserved across algorithm changes) but ignored at runtime.

Each algorithm declares:

- A **style** (Flow / Hierarchy / Network / Compact / Circular) — used for grouping in the UI only.
- A **nesting capability** (full / partial / cluster / none) — drives whether nesting parameters are active.
- A **self-loop capability** (`true` / `false` / `"partial"`) — whether self-loop connections appear on the view and how they are routed. `false`: self-loop edges are excluded from the layout graph and are not drawn on the view; existing self-loop connections are removed when the algorithm re-lays out the view. `true`: the engine routes them natively or the writer synthesises a NE-corner loop. `"partial"`: the engine attempts routing; the writer synthesises on failure.
- An **active-parameters list** — which preset.params keys are honoured.
- A **supported-options map** — for select-type parameters, the allowed values.

Adding a new algorithm requires one entry in the SSOT and one entry in the relevant engine adapter; no other module changes.

### Algorithm × parameter compatibility

✓ active · — greyed out in the dialog. Generated from each algorithm's `activeParams` in `defs.js` by `tools/gen_docs_tables.js`; do not edit by hand.

<!-- generated:capability-matrix -->
| Parameter | Layered | Tree | Force | Stress | Radial | Grid | Pack | Dagre | Dot | Neato | FDP | SFDP | Twopi | Circo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Nesting `nestingRules` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Reverse `reverseRules` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Layout inside `containerAlgorithm` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
| Connections `connectionsMode` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Padding `padding` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | ✓ | ✓ | ✓ | — | — | — |
| Sort containers `sortContainers` | ✓ | ✓ | — | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Show in every container `showInEveryContainer` | ✓ | ✓ | — | — | — | ✓ | ✓ | — | — | — | — | — | — | — |
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

The **Self-loops** row is a capability, not a GUI parameter: ✓ = routed (engine-native or
writer-synthesised), ~ = partial (engine attempts, writer synthesises on failure), — = not
drawn (self-loop edges excluded from the layout graph and removed on re-layout). Source:
`ALGORITHMS[*].supportsSelfLoops` in `defs.js`.

## Selection pipeline

The pipeline takes a user selection plus a validated preset plus an action and returns a typed object set ready for layout.

### Action-group dispatch

Pipeline behaviour is determined by the action's group, not by the individual action. The two groups mirror the Generate View dialog's action area ([Action area](#action-area)):

| Group | Actions | VisualSet at pipeline start | Selection's role |
|---|---|---|---|
| **Create new view** | NEW_VIEW, ONE_EACH | Empty | Content source: every element in the selection (and its related-elements expansion) becomes part of the fresh view. |
| **Modify selected view** | EXPAND_VIEW, LAYOUT_ONLY | Captured from the target view | Identifies the target view. EXPAND_VIEW: the selected canvas elements are the steps' input; every visual stays and the whole view (with the added elements) is laid out. |

The selection's *source* — the model tree vs a view's canvas — is orthogonal to the group but constrains validity:

- **From the model tree** (folders, elements, relations) — Create-new-view group only; nothing in a model-tree selection identifies a target view.
- **From a view's canvas** (VisualElements / VisualRelations / DiagramObjects, or a view node) — either group:
  - With Create-new-view: clone-style — the selected canvas objects (and their related elements) become a fresh view; the source view is untouched.
  - With Modify-selected-view: in-place — the targeted view *is* the view the selection came from.

### Shared helpers — dialog and pipeline use the same code paths

Two entry points, one set of helpers. The dialog's live counter and the full pipeline use the same step expansion and relation collection, matching with the one rule model, so a correct dialog count is a true prediction of what the pipeline will write:

```
              ┌──────────────────────────────────────────────────────┐
              │   selection_pipeline.js (shared helpers)             │
              │                                                      │
              │   _expandStepWithRelations                           │
              │     ├─► _expandStepFrontiers ──► RuleLists.matchStep │
              │     └─► _findRelationsBetween ─► matchStepRelation   │
              │   _findRelationsBetween (base) ─► matchRelation      │
              │   _applyFilter ──► matchElement · _diagramPasses     │
              └──────────────────────────────────────────────────────┘
                       ▲                              ▲
                       │                              │
    ┌──────────────────┴───────┐    ┌─────────────────┴──────────┐
    │  Live counter (dialog)   │    │  Full pipeline             │
    │  on every UI change      │    │  on action button click    │
    │                          │    │                            │
    │  Pipeline                │    │  Pipeline                  │
    │   .expandStepWith-       │    │   .buildObjectSet(         │
    │     Relations(…)         │    │     uiSelection,           │
    │  per block (chain)       │    │     preset, actionId)      │
    │  → added + candidates    │    │  → object set with         │
    │  + per-rule runs         │    │    elements + relations    │
    │                          │    │    + visuals + view        │
    └──────────────────────────┘    └────────────────────────────┘
                │                                  │
                ▼                                  ▼
        Updates the on-screen          Sent to engine → writer →
        filter / step / layout counts  view is created/modified
```

Both entry points apply the same per-step rules (see Step 5 below) and log a grouped count block of the same shape to the Archi console, so prediction and result can be eyeballed side-by-side.

### Steps

**EXPAND_VIEW and LAYOUT_ONLY skip Step 2.** The element-type filter is not applied for either action in the "Modify selected view" group. These actions re-layout or expand elements already on the view; applying the filter would exclude visible element types, causing containers to be sized for only the filtered subset while the excluded elements remain at positions outside those bounds.

LAYOUT_ONLY additionally skips Step 3 (no related-elements expansion) and, after Step 5, filters `relations` down to only those that already have a visual on the existing view — so LAYOUT_ONLY never adds missing relations. EXPAND_VIEW requires elements selected on the view (a view from the model tree is refused). It runs Step 3 from the selected elements; its base relations are the relations drawn on the view (no missing relations between elements already on it are added), plus the relations the steps follow. Steps 4–6 then take every element and diagram object on the view, so the whole view is laid out. See [Action-group dispatch](#action-group-dispatch) for group definitions.

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
  Element rules (type, property), relation rules (source type,
  relation type, target type), diagram rules. Filter is visibility
  only; it does not alter nesting structure.

Step 3  Related-elements expansion (chain)
  For each ordered step in preset.relatedElements.steps:
    hops   = expand the step from input          (one array per run; stops early on an empty run;
                                                  a relation is followed when a step rule accepts it)
    additions = hops.flat()
    final-selection = final-selection ∪ additions
    prevHopFrontier = step input (for hop 1); previous hop's elements (for hop 2+)
    For each hop frontier in hops:
      stepRelations += relations between hop-frontier and prevHopFrontier
                       that a step rule accepts (type + direction)
      cumulative    += hop-frontier
      prevHopFrontier = hop-frontier
    input = additions                              (chain: next step starts here)
  Step 1's input is the filtered base.
  An empty step terminates the chain — every later step adds zero.

  Relation collection per hop (rule direction honoured):
    hop 1: stepInput ↔ hop1  ✓  |  hop 2: hop1 ↔ hop2 ✓  |  hopN×hopN ✗
    Earlier-step elements outside the triggering collection are not iterated.

Step 4  Separate the element set
  Drop relations, folders, view nodes. What remains is the set
  of elements that will be placed by the layout engine.

Step 5  Find relations between elements (collected incrementally in Step 3)
  Relations are collected in two passes:
  · Base pass: relations between the filtered-base elements that match the
    global relation rules.
  · Per-step pass (inside Step 3's loop): for each hop, collect the relations
    between two collections — the current hop's discovered elements and the
    collection that triggered their discovery (the step input for hop 1; the
    previous hop's elements for hop 2+) — that matchStepRelation accepts:
    relation type, direction and previous-step type of an Include rule
    (added type and property only decide which elements join); an Exclude
    rule in full. Relations between the new hop's elements and earlier-step
    elements outside the triggering collection are not collected. An empty
    rule list applies no restriction from the step side.
  A shared seenRelIds set prevents double-counting across passes.
  (See [Rule lists](#rule-lists).)

Step 6  Partition diagram objects
  diagram-model-connection objects are edges, not nodes — they
  have no logical position and never reach a layout engine as
  positional input. Keep them separate from positional diagram
  objects. Layout engines reroute existing connections automatically
  when their endpoints move.
```

### Pipeline invariants

- **Pure function.** Same selection + same preset + same model state → same returned object set.
- **No view mutation.** The pipeline reads only; it never edits a view. *(Rule 4 in [ai/rules.md](../../../ai/rules.md))*
- **Sets, not lists.** No duplicate concepts; no duplicate relations.
- **Filter is non-destructive to nesting.** Filtering an element does not remove its descendants from the nesting structure of other elements that survive the filter.
- **Dialog and pipeline share the per-step rules.** The dialog's live per-block `Adds:` counter is a faithful preview of what Step 5 will collect for that block — both call `expandStepWithRelations` (frontiers, then `findRelationsBetween` per hop) identically, using the previous hop's frontier as the iteration collection so inter-hop relations (hop1→hop2, etc.) are included and intra-step cross-relations to earlier-step elements are excluded.
- **Additive equation is exact** for both elements and relations: `Filtered + Σ Step N.adds = Total` (digit-for-digit, no caveat). Per-step `adds.rels` is the sum across all runs (hops) of new relations found in each hop's pass (between the hop's frontier and its triggering collection, new×new per-hop excluded), minus any already counted in a prior pass. Never a raw-selection rel count, never an orphan-counting shortcut.
- **Element categories partition `elements`.** `elements = containers + nestedElements + standalones`, by construction. The element count always matches the source selection after expansion/filter/expand — a nesting rule with `everyContainer: true` does not inflate it. `extraOccurrences` (extra visual appearances under multiple containers) is a **separate** field, never folded into any of the element categories.
- **Relation forms partition `relations` on the view.** Every relation in the object set is either a nesting or a connection, by construction: `relations = nestings + connections`. View-side count rows use **nestings** and **connections** — never "relations" (which is a model-layer word).
- **Single nesting algorithm.** Predicted counts and the writer use one nesting resolution. No duplicated logic, no drift between prediction and result.
- **Step 3 is a chain, not cumulative.** Step N (N ≥ 2) traverses from step N-1's additions only — not the cumulative selection. Step 1's input is the filtered base. An empty step terminates the chain (every later step adds zero). Mental model: each step refines the previous step's discoveries; step N+1 cannot bypass step N's intent.

## Nesting

### Container algorithm and connections mode

When nesting is active:

- **Layout inside** (`containerAlgorithm`: Layered, Grid, Pack) arranges the children inside each container.
- **Connections** (`connectionsMode`). *Crossing containers* (default) lays the whole hierarchy out as one graph: connections run straight to the element inside and crossing minimisation spans all levels. *Between containers* lays out each container on its own; connections enter at its border.
- **Lock.** *Crossing containers* is impossible — *Between containers* is used and shown greyed with the reason — when the layout inside is Grid or Pack (connections into a packed container are not supported; without them the containers stack in one column), or when a view size is active (a one-graph layout does not pack unconnected elements into rows). The container choice wins. A preset file with a locked combination runs as *Between containers*, and the log says so.
- With root Grid or Pack there are no connections between containers, so the option is inactive.

Realisation: [ELK adapter](#elk-adapter).

### Role assignment

Every relation in the pipeline's output is assigned an initial role:

- **Nesting** — if the relation matches `preset.params.nestingRules` (relation type, source type, target type; the parent is the source, or the target for a reversed relation). A rule's source type is how a container type is restricted (e.g. source *Grouping*).
- **Routed** — otherwise.

Both the writer and the dialog counters use `splitNestingRels` (selection_pipeline.js) for this split.

The set in the preset is the only authority. Initial role assignment is total (no relation is left unassigned) and deterministic (same inputs → same roles).

**Reclassification.** A nesting relation that fails [Multi-parent resolution](#multi-parent-resolution) (the child got its one parent from another relation, or the relation is part of a [cycle](#multi-parent-resolution)) is reclassified to **Routed** at layout time so the model relation remains visible as a connection line. No nesting relation is ever left undrawn.

### Parent / child direction

For a nesting relation: the **source** is the parent and the **target** is the child — unless the relation also matches a reverse rule, in which case the **target** is parent and the **source** is child. The flip applies to nesting roles in exactly the same way it applies to routed-edge layout direction ([Reversed edges](#reversed-edges)).

### Multi-parent resolution

Many nesting relations may name the same element as their child. Each nesting rule's `everyContainer` flag decides the outcome. The result never depends on rule order or model iteration order.

| Relation matches | Behaviour |
|---|---|
| a rule with `everyContainer: true` (wins when the relation matches several nesting rules) | **Every parent.** The child appears inside this parent, whatever its other relations do. Each appearance is a distinct node in the layout that maps back to the same model element; an extra occurrence of a container receives its own copies of the container's children. |
| only rules without `everyContainer` | **One parent.** All such relations of one child together give it at most one parent: (1) the container its user-content occurrence already sits in on the view, (2) otherwise the first parent by name, then by id. The other relations are reclassified as connections so the model relation stays visible. |

Example: a composition from P1 (rule without *every container*) and an aggregation from P2 (rule with it) put the child in P1 **and** in P2.

**Cycles.** Nesting relations that together form a containment cycle (A contains B … contains A) are **all** reclassified as connections; nesting relations outside the cycle are unaffected. The rule is order-independent, and nothing disappears from the view. A cycle is nearly always a modelling error or a double relation; lines between boxes that would contain each other make that visible, where breaking it at one relation would hide it. The dialog's Nesting note counts them as *circular*; the log names each cycle by its element names. To nest part of a cycle anyway, exclude the other relations with an Exclude rule.

**Visual rendering rule.** Extra occurrences only **render as visible duplicate boxes** when the chosen algorithm draws parent-child containment — i.e. nested-style layouts (Layered, Tree, Pack, Dot, and any other algorithm marked as supporting nesting in the [Algorithm capability matrix](#algorithm-capability-matrix)). For non-nested layouts (Force, SFDP, Twopi, etc.) the engine collapses them: the element is drawn once. The dialog and pipeline counters compute the `extraOccurrences` count honestly from the nesting structure; for non-nested layouts the count will be non-zero but the user should expect the visible view to show one box per concept.

**Counting rule.** `elements` always counts unique model concepts (matches the source selection after expansion + filter + step adds), and is partitioned into `containers + nestedElements + standalones` by construction. `extraOccurrences` is a **separate field** (counts extra visual appearances, role-agnostic), never folded into the element categories. The on-screen [totals line](#totals-line) and the console block's `Total to view:` row show all fields side by side.

Determinism: the parent choice uses only names, ids and the current view, so the same inputs give the same parents.

### Managed extra occurrences

Extra occurrences follow from the settings (nesting rules with `everyContainer`), not from the user's choice. Every action — `LAYOUT_ONLY` included — therefore **reconciles** them, so trying another rule, algorithm or layout never leaves stale copies behind, and switching back restores them. This is the one exception to "Modify actions never add or delete visuals" ([Invariants](#invariants) 4).

1. **Capture.** The VisualSet's occurrences are split into **managed** (matching a [Managed-occurrence record](#managed-occurrence-record) on the view) and **user content** (everything else, including duplicates placed by hand and occurrences on views made before this feature).
2. **Resolve.** [Multi-parent resolution](#multi-parent-resolution) gives the wanted placements: per element its parents, and for extra container occurrences their copied children.
3. **Pair.** User content is paired first, each occurrence preferring the placement matching its current container; a user occurrence left without a placement stays in its current container and is laid out there. Managed occurrences fill the remaining placements, again preferring their current container.
4. **Add and remove.** A placement with no occurrence gets a new, managed one. A managed occurrence left without a placement is removed, with the connections drawn to it.
5. **Record.** The view's records are rewritten to describe exactly the managed occurrences after the run.

Edge cases:
- **Last occurrence.** A managed occurrence that is the element's only one left (the user deleted the others) becomes user content — an element never disappears from the view.
- **Moved by the user.** A record that no longer matches the view (the object was moved or deleted by hand) is dropped; the object, if any, is user content.
- **User content inside a managed container.** The container cannot be removed without deleting user content, so it becomes user content itself and the run logs it.
- **Hand-drawn connection to a managed occurrence.** Removed with the occurrence; the system cannot tell it from the connections it drew itself.
- **Same placement twice.** If two objects match one record, the first in view order is managed, the other user content.

### Asymmetric roles

An element may be a **parent in one relation and a child in another** — there is no contradiction. Nesting roles are per-relation, not per-element. An element with at least one nesting relation on the parent-side and at least one on the child-side is both a Container (it contains other elements) and itself contained in its own parent. Diamond and deep-chain nesting are natural consequences of [Role assignment](#role-assignment)–[Multi-parent resolution](#multi-parent-resolution) applied to multiple relations.

### Container derivation

> Rule 5 in [ai/rules.md](../../../ai/rules.md).

A Container is any element that has at least one child after [Multi-parent resolution](#multi-parent-resolution). Container-ness is **derived** from the parentMap, never declared. Users do not author containers directly. The closed set of element types remains [Object types](#object-types) — being a Container does not change an element's type.

### Writer parenthood

The writer derives every visual's parent from the current run's nesting decisions, regardless of which action invoked the run:

- An element whose parentMap entry names another element → drawn **inside** that parent's visual.
- An element whose parentMap entry is absent → drawn at **view root**.
- An existing VisualElement whose current visual parent differs from the new parentMap → **re-parented** (moved under the new parent). Bounds are then expressed relative to the new parent.
- **Exception — same parent element, other visual.** When the parent element is unchanged but another of its visuals is paired, the child stays where it is: moving it would detach it from its nesting connection, and Archi would draw that as a line.

There is no per-action branch; the same rule applies to NEW_VIEW, ONE_EACH, EXPAND_VIEW, and LAYOUT_ONLY. See [Invariants](#invariants) (writer invariant).

**Pairing.** When an element has several visuals on the view, each occurrence is paired with one visual, preferring the visual whose current parent has the occurrence's parent element. Visuals left over: a **managed** one is removed, a **user-content** one stays and is laid out in its current container ([Managed extra occurrences](#managed-extra-occurrences)). Outside that, the writer deletes visuals only through the explicit name-overwrite path (Invariant 4).

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

The **Snap columns to grid** option (preset key `snapColumnsToGrid`) puts every leaf column on **one shared global grid** so columns line up top-to-bottom across the whole view. It is independent of [Width alignment by level](#width-alignment-by-level) — either can be used alone — and applies only to the Compact ELK algorithms (Grid and Pack), the only algorithms with `snapColumnsToGrid` in their `activeParams`.

**A global variable-width table.** Each column is as wide as its own widest leaf (widths diverge), packed left-to-right, every leaf moved onto its column's centre so columns share an x view-wide.

**Tight first, widen only where it collides.** Gaps start at `max row need − 2×padding` (floored at one element spacing) — tight. Then a measure-then-widen loop runs: lay leaves on the grid, re-wrap containers, find any adjacent sibling containers that actually overlap, and widen *those* boundaries by exactly the overlap; repeat until clean. So a boundary only gets a wide gap if real containers would otherwise collide there; everywhere else stays minimal.

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
| **NEW_VIEW** | Model selection expanded through filter + related-elements blocks. | A new view (created, or overwritten by name) in `preset.view.folder`. Named per [Action area](#action-area). |
| **ONE_EACH** | **Seed elements** = raw model elements from the Archi selection, before the preset's element-type filter and before related-elements expansion (views in the selection are expanded to their elements). For each seed, the full NEW_VIEW pipeline runs independently: filter → related-elements expansion → layout → write, with that seed as the sole input. | One new view per seed element, named after the element plus `preset.view.suffix` ([Action area](#action-area)). |

### Modify selected view group

VisualSet is **captured from the target view** before model expansion runs. All existing visuals stay — managed extra occurrences excepted ([Managed extra occurrences](#managed-extra-occurrences)); the writer repositions matches and creates the rest.

| Action | Object set | Target view |
|---|---|---|
| **EXPAND_VIEW** | Elements selected on the view (not the view in the model tree) drive related-elements expansion. Added: the step elements and the relations the steps follow. The whole view is laid out; its existing content is unchanged. | The selected view itself, changed in place. `preset.view.name` / `folder` are not used (they apply to new views only); a view is never copied or replaced by name. |
| **LAYOUT_ONLY** | The selected view's current contents only — no related-elements expansion. Managed extra occurrences are reconciled with the current nesting rules. | Same as EXPAND_VIEW: the selected view, in place. |

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
  maxWidth       : number               // 0 = unconstrained (ELK only)
  aspectRatio    : number               // 0 = unconstrained

  alignWidthSameType : boolean
  sortContainers     : boolean
}
```

#### Reversed edges

For each relation type listed under the preset's **Reversed** field ([Preset schema](#preset-schema)), the pipeline swaps `source` and `target` in the LayoutGraph so the engine traverses the edge in the reversed direction — meaningful for ranking algorithms (Layered, Tree, Dot) where direction drives hierarchy.

No additional flag is carried. An ArchiMate relation has its own intrinsic direction in the model; Archi renders any VisualRelation using that direction. The writer creates the VisualRelation against the original model relation — Archi handles the arrowhead and label orientation from there. The writer reconciles bendpoint order against the model relation's source/target rather than the LayoutResult edge's, when the two disagree.

The ArchiMate relation in the model is **never modified**; reversal is purely a layout-traversal concern. *(Rule 6 in [ai/rules.md](../../../ai/rules.md))*

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

#### Connection labels

With *Reserve label space* (Layered), the layout reserves room for each connection label between element layers, and the label is drawn in that room. Realisation: [ELK adapter](#elk-adapter), [Writer](#writer).

### View-size constraints

Two mutually exclusive parameters (max width, aspect ratio) control how large the generated view may be ([Layout tab](#layout-tab)). Only one is active at a time — `viewSizeMode` in the preset records which one. The adapter receives only the active constraint; the others are zeroed. Old presets without a `viewSizeMode` field default to the first non-zero view-size value found.

Not every algorithm supports every view-size parameter. Unsupported parameters are deactivated in the UI regardless of mode selection (see [Algorithm capability matrix](#algorithm-capability-matrix)). None of these parameters may trigger scaling of element dimensions — see the no-scaling rule below. An engine meets a target by arranging elements differently (re-running its layout with other packing settings); how each engine does it is in SPEC.md's per-engine view-size table and [ELK adapter](#elk-adapter).

### No post-layout scaling

> Rules 1 & 2 in [ai/rules.md](../../../ai/rules.md).

**Scaling element sizes after layout is forbidden.** This rule has no exceptions.

- **Leaf nodes** receive `width` and `height` from the `LayoutGraph` input (set from `elementWidth` / `elementHeight` parameters). The adapter passes these unchanged to the engine. The engine must not resize them.
- **Container nodes** do not receive pre-set sizes. The engine computes container dimensions from children and padding natively.
- `LayoutResult` node dimensions must match the above: leaf sizes equal input values; container sizes come from the engine. No post-layout multiplication factor may be applied.
- No adapter may apply a uniform scale to the entire result set after `layout()` returns.

**Position spread is allowed** in principle — moving node centers outward from a common origin, sizes fixed. No adapter uses it any more: Graphviz's spread could only widen a layout, never narrow it, so Graphviz has no max width.

**`alignWidthSameType` exception** (UI label: *Same width per level*). This adjustment sets per-nesting-level target widths — exact widths on leaves, minimum-size floors on containers — using widths rendered in pass 1. It runs between pass 1 and pass 2 of a two-pass layout, so it is a pre-layout adjustment to pass 2's input, not a post-layout operation. (The preset key remains `alignWidthSameType` for back-compat; the behaviour is level-based, not type-based.)

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

There is no debug flag (the former `alignDebug` was removed): inspect the result in the `.archimate` file, and intermediate values (pass-1 widths, ELK sections) by running `elk.js` in Node on the view. Mismatches in width alignment and container offsets in edge collection are always logged with `⚠`.

## Invariants

System-wide. Code reviews catch violations.

1. **Determinism.** Same inputs → same view, always. No reliance on hash-iteration order for layout decisions. *(Rule 8 in [ai/rules.md](../../../ai/rules.md))*
2. **Appearance preservation.** Updating a visual object's position does not change its appearance properties (colours, fonts, sizes, text). The system relies on this for EXPAND_VIEW and LAYOUT_ONLY.
3. **Parent-relative coordinates.** A nested visual object's bounds are expressed relative to its immediate parent visual object. The layout engine returns absolute coordinates; the orchestrator converts at write time.
4. **No silent data loss.** The orchestrator may overwrite a view's contents only when the action explicitly says so (NEW_VIEW with a name that matches an existing view in the same folder). EXPAND_VIEW must never delete existing visuals as a side effect of name resolution. The only visuals a Modify action removes are managed extra occurrences the settings no longer ask for ([Managed extra occurrences](#managed-extra-occurrences)).
5. **Validation is total.** Every preset that enters the orchestrator has passed validation: unknown top-level keys are dropped; missing keys take defaults; option values are checked against the algorithm's supported options.
6. **UI-only state is partitioned.** The preset schema carries only configuration that affects view generation. UI-only state (last tab index, collapsed-block flags, …) rides as separate keys preserved through the same persistence file but invisible to the orchestrator.
7. **Action is not in the preset.** Sharing a preset across users and selections requires the preset to be selection- and action-agnostic.
8. **Filter is non-destructive.** Filtering hides elements from a view; it does not alter the nesting structure between elements that survive the filter.
9. **Visual parenthood is action-agnostic.** Every action derives visual parenthood from the current run's nesting decisions ([Writer parenthood](#writer-parenthood)). An existing VisualElement may be re-parented when the new parentMap dictates a different parent.
10. **Write order is parent-first.** The write path sorts layout-result nodes so every node is processed after its parent. A child is never repositioned or added before its parent. This is what makes invariant 3 (parent-relative coordinates) hold under arbitrary engine output order, and prevents drawing-order overlap.
11. **Layout writing is action-agnostic.** The orchestrator decides (a) which objects feed the layout and (b) which view is the target. The writer applies one rule per result object — *exists* → reposition (appearance preserved; parenthood re-derived from [Writer parenthood](#writer-parenthood)); *otherwise* → create (default appearance). Same rule for relations: existing → rewrite bendpoints; new → create. There is one write function; per-action branches inside the writer are forbidden. *(Rule 7 in [ai/rules.md](../../../ai/rules.md))*
12. **Algorithm-capability masking.** Preset values for parameters not in the chosen algorithm's active-parameters list are ignored at runtime. The raw preset stays intact (values are kept for UI restoration on algorithm switch); the orchestrator derives an effective parameter view from `(preset, algorithm.activeParams)` at entry and passes only that view to the pipeline, engine adapter, and writer. A non-empty inactive value reaching runtime is a defect — log it.

## Design decisions

Rationale-only. Each decision references the invariant or user story that motivates it.

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling for filtering, traversal, and rendering. Allowing arbitrary types would defeat the closed-set assumption in the filter UI and in iteration. |
| Non-positional objects — Relations, VisualRelations, and diagram-model-connections — are partitioned from positional objects throughout the pipeline. | An edge has endpoints, not coordinates. Treating any of these as nodes would corrupt the layout graph; the same partition rule applies uniformly to all three kinds. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*; an action is a *verb*. Sharing presets across selections requires action-agnosticism. |
| View name is a single user-controlled field. `view.suffix` applies to One view each only. | An earlier algorithm-derived suffix silently rewrote the user's typed name on algorithm switch. The current `view.suffix` is a fixed preset value appended to each element name in One view each (e.g. the GGM views' `" (GGM)"`); the Name field is never changed. |
| EXPAND_VIEW's target is derived from the existing visuals, not from the preset name. | The preset name is for *creating* a view. Expanding the selected view is a verb against that specific view, not a name-resolution. (See invariant 4.) |
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| The related-elements panel is multi-step with chain semantics. | Real exploration patterns are stepped: "from processes → get applications → then services". A single step can't express this. Each step's additions feed the next step's input; an empty step terminates the chain so step N+1 cannot bypass step N's intent. |
| Per-relation direction toggles are independent (not mutually exclusive). | "Both", "incoming only", "outgoing only" are all common needs. Forcing a choice would lose the most-common case (both). |
| Empty direction selection means follow all. | When neither direction checkbox is active for a relation type, the type is absent from the encoded list. [Steps](#steps) step 5 interprets the empty union as "all types allowed". The both-unchecked state is the idiomatic "don't filter this type" state, not an error. |
| Spinner recomputes fire on value-commit, not on keystroke. | Live counts can be expensive (relation traversal). Per-keystroke recompute is wasteful and produces flicker. |
| Algorithm selection uses a style-grouped radio table, not a combo. | All algorithms across all styles are always visible simultaneously. Users scan the full option space without opening a combo; style/algorithm relationships are visible at a glance. |
| Steps start expanded when a preset is loaded. | All rules and their counts are visible at once; a block is collapsed on demand. |
| *Every container* is a per-nesting-rule flag, not a global switch. | Whether a child may have several parents depends on the relation: a composition has one whole, an aggregation or grouping may have many. A global switch could not express both in one view. |
| A relation matching several nesting rules gets *every container* if any of them has it. | Rule order then has no meaning, as for every other rule list; an extra rule can only add occurrences ("a wider filter never yields less"). |
| One-parent choice uses the current view, then names — never model or rule order. | Re-layout keeps elements where the user has them; a fresh view is reproducible and predictable. |
| Extra occurrences are managed and reconciled by every action, including Layout only. | Layout only is for trying layouts without changing the view's content. Extra occurrences are a consequence of the settings, not content; letting them go stale (or not appear) made the *every container* option seem broken on re-layout. |
| Managed occurrences are recorded on the view as placements (element, container chain, relation), not as visual-object ids. | A view copy gives every visual a new id; placements survive it. Only recorded occurrences are removed, so hand-placed duplicates are never lost. |
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

[ai/rules.md](../../../ai/rules.md) lists the concrete files of each scope.

---

# Part B — Realisation

How the View subsystem realises [SPEC.md](SPEC.md) and Part A in jArchi 1.12 (GraalVM JS), SWT and Archi 5. Per subject: the **choice**, **why**, and **where**. The code documents itself; this part is the index and the reasoning behind it.

**Rules for this part.**
- A realisation change is written here **first**, then built. Planned realisation is marked *Target*; what the code does today and SPEC does not want yet is listed under [Known gaps](#b7-known-gaps).
- Not here: internal function or variable names, restated code, tables that the code or `tools/gen_docs_tables.js` already hold, change history (git).
- Point to files and exported names only.

## B.1 Modules

| Module | Responsibility | Uses |
|---|---|---|
| `View/_*.ajs`, `presets/**/<preset>_<Action>_<Dir>.ajs` | Entry scripts: base or named preset + fixed overrides → API | `run_preset` |
| `lib/run_preset.js` | Preset, action and direction from the file name, or the base preset `all` | `preset_io`, `generate_view`, `defs` |
| `lib/generate_view.js` | The API and the **only** view writer: target view, layout graph, engine call, write, styling, view properties | `selection_pipeline`, `defs`, `appearance`, adapters, `_lib/*` |
| `lib/selection_pipeline.js` | Selection → object set; nesting split and resolution; predicted counts. Shared by API and dialog | `_lib/selection`, `defs`, `rel_filter` |
| `lib/defs.js` | SSOT: algorithms, params, labels, tooltips, defaults, enums; preset validation; effective params | `_lib/selection`, `rel_filter` |
| `lib/rel_filter.js` | Rule model: normalise, match, file form | — |
| `lib/preset_io.js` | Preset and session files | `defs`, `rel_filter` |
| `lib/appearance.js` | Post-write styling pass | `defs`, `rel_filter`, chroma-js |
| `lib/engines/elk.js`, `dagre.js`, `graphviz.js` | One adapter per engine: layout graph → layout result | `defs`, `engine-utils`, engine library |
| `lib/engines/engine-utils.js` | Engine-independent sizing and ordering | `defs` |
| `lib/gui/dialog_main.js` | Generate View dialog, all tabs | all of the above except the adapters |
| `lib/gui/rule_table.js` | The widget for every rule list | `rel_filter` |
| `lib/gui/dialog_presets.js` | Save As / Rename dialog | `preset_io` |
| `tools/`, `test/` | Checks, generators, migrations; Archi test scripts | — |

**Dependency rules.**
- Only `generate_view` changes a view. The dialog collects settings; the action runs after it closes.
- Adapters see only the layout graph — no `$`, no selection, no preset file — so they run unchanged in Node.
- `rel_filter` is pure (no Archi, no Java).
- Engine option names live only in the adapters; `defs` holds functional metadata only. The adapter is picked by the algorithm's engine name and loaded on first use.

## B.2 Run flow and identities

```
selection ─► selection_pipeline ─► object set: elements, relations, diagram objects, VisualSet
                                    split: nesting candidates | connections
                                    resolve nesting → parents, occurrences, nesting bindings
          ─► generate_view ───────► layout graph: nodes = occurrences, edges = routed relations
          ─► adapter ─────────────► layout result, absolute coordinates
          ─► generate_view ───────► write: pair occurrences with visuals, reposition / create,
                                    bendpoints, nestings ─► appearance ─► view properties
```

| Id | Value | Valid in |
|---|---|---|
| model id | element or relation id | object set, nesting bindings, model lookup |
| occurrence id | element id for the first occurrence, `<element id>_occ_N` for extra ones | layout graph, layout result, nesting bindings |
| visual id | id of an object on the view | VisualSet, writer |

- An edge carries an occurrence-unique id (`<relation id>_<i>_<j>` when an end has several occurrences) **and** the relation id; the writer looks the model up by the relation id.
- The writer maps occurrence → visual once; coordinates, bendpoints and nestings all go through that map.
- **Every nesting binding names occurrences that exist as nodes.** A binding whose occurrence has no node is turned into a connection when the graph is built — otherwise the relation is neither nested nor routed and its visual keeps stale bendpoints.

## B.3 Realisation choices

### SSOT and engine options

- **One registry per algorithm** (engine, style, nesting and self-loop capability, active params, allowed values). Dialog enabling, validation and the tables in Part A derive from it.
- **Effective params.** Inactive params are dropped and locks applied (connections mode) before the pipeline, adapter or writer sees the preset.
- **Engine options, last wins:** engine defaults → GUI params through the adapter's mapping → `engineParams.<Engine>` from the preset (expert override, no dialog control). `engineParams.layout` tunes the engine-independent label sizing.
- `tools/check_registry.js` checks registry ↔ defaults ↔ dialog widgets; `tools/gen_docs_tables.js` writes the generated tables in Part A.

### Presets and rule lists

- **File form.** Plain JSON, one rule per line, defaults omitted — a changed rule is one changed line in a diff.
- **Schema version gates loading.** A different `schemaVersion` is refused with a message. A shape change ships with a one-shot, idempotent Node migration in `tools/` that rewrites every preset, `_session.json` included. No conversion at load time.
- *Target:* version 3 — `everyContainer` per nesting rule replaces `params.showInEveryContainer`; the migration sets it on every nesting rule of a preset whose global switch was on.

### Selection pipeline

- **Prediction = result.** The dialog's counts and the API call the same exported helpers: step expansion, relation collection, nesting split and resolution, predicted counts.
- **Step relations come from the triggering frontier**, not from everything selected so far. Otherwise relations back to earlier steps would be drawn and could create spurious extra occurrences.

### Nesting

- **One resolution**, used by the predicted counts and the layout graph.
- Extra occurrences of a container get copies of its children, breadth-first, each with its own occurrence id.
- *Target* (SPEC §7, Part A [Multi-parent resolution](#multi-parent-resolution)): `everyContainer` per rule wins over rules without it; otherwise one parent by current container → name → id; cycles found as strongly connected components of the candidate-nesting graph, and all their relations routed. No step depends on relation or rule order.

### Writer

- **Parent-first.** Nodes are written after their parent, so the parent's new bounds exist when a child is converted to parent-relative coordinates.
- **Pairing.** Per element, the visual whose current parent has the new parent's element is preferred; each visual is used once.
- **Re-parenting** uses the jArchi 1.10 move (`parent.add(existingVisual, x, y)`), which keeps the visual, its appearance and its connections. When the parent element is unchanged but another visual of it was paired, the child is not moved: the nesting connection still points at the old parent visual, and Archi would draw it as a line.
- **Bendpoints** are Archi relative bendpoints (offsets from source and target centres). For reversed relations their order is flipped back to the model direction.
- **Middle labels.** Archi puts a Middle label at the middle point *by index* of source anchor, bendpoints, target anchor. To put it where the engine reserved space, the writer makes the label point a bendpoint and adds collinear bendpoints on the shorter side until both sides hold as many. The drawn route is unchanged.
- **Self-loops** are deleted from the view for algorithms without self-loop support; otherwise the engine's route is used, or a small corner loop when the engine returns none.
- **Connections the engine did not route** get their bendpoints cleared, so switching algorithms leaves no stale routing.
- Appearance and view properties run after the write. Setting bounds keeps a visual's appearance (verified by `test/test_visual_props.ajs`).

### Managed extra occurrences — target

Realises SPEC §7 and Part A [Managed extra occurrences](#managed-extra-occurrences).

- **Record:** one view property per managed occurrence.
  ```
  key   : "Managed occurrence"
  value : "<element id> in <container element id> [in <its container element id> …] via <relation id>"
  ```
  The container chain runs from the direct container up to the view root. Model ids survive a view copy (Archi gives every visual a new id); visual ids would not.
- **Where:** records are matched when the VisualSet is captured, before anything changes (pipeline). Wanted placements come from nesting resolution. Pairing, adding and removing happen in the writer; the records are rewritten at the end of the write. The predicted counts include this, so the dialog's totals stay exact.
- **Removal** deletes the visual, and Archi removes its connections and children with it. The writer first checks it holds no user content.
- **Every visual gets a node.** An unpaired user visual keeps its current parent in the layout graph; nothing is left behind unpositioned.

### ELK adapter

- **Hierarchy.** *Crossing containers* = `INCLUDE_CHILDREN` (one layered graph, crossing minimisation across levels). *Between containers* = `SEPARATE_CHILDREN` (each container on its own).
- **Edges live in their lowest common ancestor container;** ELK's coordinates are relative to it and are offset back.
- **Hierarchical ports.** With *Between containers* and Layered root and container, a cross-container edge is split into segments joined by a port on every crossed container: the inner layout reserves the port, the outer layout connects to it, and the writer gets one joined path. A connection that ends on a container itself also gets an explicit port; otherwise ELK puts it in the container's top-left corner. With other algorithms, the ends are lifted to the containers directly under the common ancestor.
- **Connections-mode lock.** Grid or Pack inside containers (ELK rejects connections into `box` / `rectpacking`) and an active view size (a hierarchical layout does not pack unconnected children into rows) force *Between containers*.
- An edge between a container and its own descendant cannot be laid out; it is drawn unrouted.
- **View size.** ELK has no width bound for nested layouts, and top-down layout scales (forbidden). The lever is `elk.aspectRatio` in every scope: it sets how wide unconnected children pack, and its effect compounds over levels. The adapter therefore searches one ratio for all scopes (log scale, then bisection), measures each run, and repeats the best run with routing. Rectpacking hangs at high ratios, so Pack is capped at 3. Where the ratio has no effect (connection chains set the width, or *Crossing containers*) the target is logged as not reachable.
- **Reserve label space** (Layered). Each connection label is an inline ELK label with its estimated size. Layer spacing becomes the connection spacing, and every edge gets a label box (empty ones invisible), so a gap between element layers is `max(layer spacing, label + 2 × connection spacing)`.
- **Jogs** under 5 px right after a port, left by node placement, are straightened onto the longer segment.
- **Same width per level** runs ELK twice: measure natural widths, then set leaf widths and container minimum sizes and lay out again. **Snap columns to grid** (Grid, Pack) is a position-only pass on the result; leaves are moved, never resized.
- **Radial** cannot take compound graphs and needs a tree: a breadth-first spanning tree, with virtual edges joining the components that are never written.

### Dagre and Graphviz adapters

- **Dagre:** `dagre-cluster-fix` for compound graphs; straight and polyline routing only; Dagre itself drops self-loops.
- **Graphviz:** runs the `dot` binary as a process (`-K<engine> -Tjson`); clusters for nesting. No max width — Graphviz `size` scales nodes. Aspect ratio is passed as `ratio`.

### Appearance

- A separate pass that reads only the written view and the model, so it behaves the same for every action.
- Style by property shares its target computation with the dialog's ⚠ check.

### Dialog

- **Configuration is the source of truth;** widgets are a view on it, with one sync in and one save out. Layout params are table-driven (`PARAM_WIDGETS`: param → widget kind), so loading, saving, enabling and tooltips are one loop. Labels, tooltips and "used by" come from `defs`.
- **One rule-table widget** for every rule list.
- **Live counts recompute on commit** (selection events, spinner focus-out), never per keystroke.
- **The action runs after the dialog closes:** the settings are saved to the session, then `generate_view` runs.

## B.4 Persistent state

| What | Where | Notes |
|---|---|---|
| Presets | `presets/**/*.json` | Folders allowed. `_Default` = the code defaults, hidden. `all` = base preset of `View/_*.ajs`. |
| Session | `presets/_session.json` | Last settings plus UI state (`_`-prefixed keys); git-ignored |
| View properties | the generated view | From the Properties tab; optional object-id property |
| Managed-occurrence records | view property `Managed occurrence` | *Target* |

Overwriting a view by name (`NEW_VIEW`) empties it but keeps the view and its properties.

## B.5 Platform constraints

View-specific jArchi behaviour; general jArchi / SWT / GTK rules are in [`ai/jarchi-scripting/SKILL.md`](../../../ai/jarchi-scripting/SKILL.md).

- `$(view).children()` misses view references — find them per diagram type.
- A view reference reports type `"archimate-diagram-model"` instead of `"diagram-model-reference"`; both are in `DIAGRAM_TYPES`.
- `view.add(obj, x, y, w, h)` works for elements only; diagram objects take the 2-argument form.
- Bounds are relative to the parent visual. Setting bounds keeps the appearance.
- `openInUI()` is unreliable for a view created in the same run; the view is opened through its EMF model (`EditorManager.openDiagramEditor`).

## B.6 Verification

| How | Covers |
|---|---|
| `node Scripts/View/tools/rel_filter_test.js` | Rule model |
| `node Scripts/View/tools/check_registry.js` | Registry ↔ defaults ↔ dialog widgets |
| `node Scripts/View/tools/gen_docs_tables.js --check` / `--write` | Generated tables in Part A |
| Node harness: stub `Java` and `__DIR__`, feed a view exported from a model | Pipeline, nesting, layout graph, adapters — not the writer, not rendering |
| `test/test_visual_props.ajs`, `test/_test_self_loops.ajs` (in Archi) | Appearance kept by bounds; self-loop drawing |
| Run the action in Archi on a test view | Writer and rendering |

## B.7 Known gaps

Code that does not yet meet SPEC.md or Part A. Fixing one removes it here.

1. `NEW_VIEW` creates or empties the target view **before** the layout runs, so an engine failure leaves an empty view (SPEC §12: no partial view).
2. Nesting follows relation order (first wins), uses the global `showInEveryContainer`, and drops the closing relation of a cycle (SPEC §7).
3. Managed extra occurrences are not built: `LAYOUT_ONLY` caps occurrences at the visuals on the view, and unpaired visuals are left unpositioned.
4. `viewSizeMode` is inferred for old presets instead of migrated (SPEC delta 1).
5. Adapters are chosen by a fixed switch, not a registry (SPEC delta 4); the dialog is one module (SPEC delta 5).
6. Part A still repeats functional content of SPEC.md — see the [content division](#content-division).
