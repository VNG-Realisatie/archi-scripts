# View Generation — Rebuild Specification

A self-contained specification for rebuilding the View subsystem from scratch. It is **implementation-free**: it states *what* the system must do and the contracts it must honour, never how a platform realises them. The functional detail per subject is in [`reference/`](#reference); the design decisions and the *how* are in [ARCHITECTURE.md](ARCHITECTURE.md). On a conflict this document wins.

---

## 1. Purpose & scope
<!-- @keep: do not rewrite this section — wording reviewed and signed off -->

### Purpose

Starting with a selection, generate or modify the layout of ArchiMate **views**. The script turns a chosen subset of the model (plus conditions for which related elements to include) into a positioned diagram.

### Use cases

- quickly generate a starting point for a new view
- generate context views: one view per element with its related elements (*One view each*), e.g. a view per GGM data object
- analyse your model by generating different views; use nesting to find unexpected relations, see double relations, etc.
- generate complex views completely from one preset — selection, layout, appearance and view properties — and regenerate them without the dialog when the model changes, e.g. the GEMMA publication views
- lay out a hand-made view again (*Layout only*) or extend it (*Expand view*), keeping what the user put there: legends, notes, hand-placed duplicates
- drive view generation from other scripts through the API, e.g. the GGM pipeline that generates, styles and sets the properties of the views per policy domain

### Scope

In scope: generating or modifying views with different layouts; storing and reusing selection and layout configurations (presets); a configuration UI; session continuity.

Out of scope: model authoring beyond what layout implies; editing element properties; exporting to image formats; view diff/merge; real-time collaborative editing.

---

## 2. Vocabulary

One name per concept across UI, docs, logs and code, grouped by subject.

**Model**
- **element**: a typed model concept.
- **relation**: a directed, typed connection between two elements at the model level.
- **view**: a diagram, a positioned arrangement of visual objects. One element may appear on many views.

**Visual**
- **VisualElement**: the placement of one element on one view. It has bounds, may carry appearance overrides, and points back to its element.
- **VisualRelation**: the drawing of one relation on one view, with endpoints and bendpoints.
- **occurrence**: a visual appearance of an element on a view. Normally there is one per view; a nesting condition set to *every container* can give an element several.
- **diagram object**: a canvas-only object with no model concept (note, group, image, legend, view-reference). It belongs to exactly one view.
- **diagram connection**: a line on a view with no relation behind it, between a diagram object and another object, such as a note's line to an element.

**VisualElement roles**
- **container**: drawn as a box around other VisualElements.
- **nested element**: drawn inside a container; not itself a container.
- **standalone**: contains nothing and is nested by no relation: drawn at view root, or only inside a diagram-block.
- **extra occurrence**: the 2nd to Nth appearance of one element under different containers; a managed occurrence or user content.

**VisualRelation roles**
- **nesting**: drawn as containment (box-in-box, no line).
- **connection**: drawn as a line between two boxes. Every VisualRelation is one or the other.
- **self-loop**: a connection whose source and target are the same element. Whether it is drawn, and how, is an algorithm capability ([§ 8](#8-engine-contract)).

**Existing view contents**: what *Expand view* and *Layout only* keep of what is already on the view ([§ 5](#5-actions)).
- **user content**: every object on the view that the system did not place itself: elements, connections and diagram objects. It is always kept; the layout decides whether it is nested and where it goes.
- **managed occurrence**: an extra occurrence the system placed itself for an *every container* condition and recorded on the view. It follows the settings. Only managed occurrences are ever removed.
- **diagram-block**: a diagram object with contents, together with everything inside it, such as a legend, or a frame with a title and elements. The layout decides only its position.

**Subsystem**
- **Layout**: algorithmic positioning of all visible objects on a view.
- **Preset**: a named, persistable bundle of selection, layout and styling configuration.
- **Step**: one ordered related-elements expansion stage inside a preset; holds a condition list.
- **condition / condition list**: a condition is a pattern over element and relation types (*All* = any), either *Include* or *Exclude*. A list keeps any Include match minus any Exclude match.
- **Action**: a runtime verb (create / per-element / expand / re-layout); never stored in a preset.
- **Session**: the last-used configuration, restored when the UI opens.
- **VisualSet**: the existing visual objects of one target view, captured before a run.

**Appearance**
- **palette**: a named list of named colours, shared by the presets; a preset picks one.
- **segment**: a run of nested elements of one type inside a chain of *Style by nesting level*; a nesting step to another type starts the next segment.

**Counter rule.** *Relations* is a model word. Selection counters (filtered base, step adds) use it; on the view, count **nestings** and **connections**, never "relations". Internal data-structure names (`parentMap`, `childIds`, `occurrenceMap`, …) are code-only and never surface in the UI or logs. GUI labels for internal terms: [display-label map](reference/gui.md#display-label-map).

---

## 3. Architecture

Three layers, top to bottom. Each layer talks only to the one below.

```
Layer 1 — Entry points      produce (preset, selection, action), call the API
  • Generate View dialog  — defines selection/layout/styling; live counts; only editor of presets
  • Preset-bound scripts  — headless: load a preset, call the API, exit
Layer 2 — View-generation API   sole orchestrator and sole writer to views
  validate preset → run selection → build layout graph → call engine → write → style
Layer 3 — Engine adapters   one per engine: layout graph in, positions out; nothing else
Shared infrastructure (Layers 1–2): SSOT (algorithms, params, enums, defaults),
  selection module, preset/session persistence.
```

**Boundary 1 — API.** `generate_view(preset, selection, action) → view[]`. The preset is validated by the API. The selection may mix model-tree items and canvas objects; the API normalises them. The action is optional, *New view* when absent. The output is the written or updated view(s), fully positioned.

**Boundary 2 — Adapter.** `layout(LayoutGraph) → LayoutResult` ([§ 8](#8-engine-contract)). Adapters see only the graph, never selections, presets or views.

**Boundary rules.**
- The entry-points layer is replaceable: any caller that produces a valid preset and selection can drive the API directly.
- The dialog is the **only** entry point allowed to edit or persist a preset; preset-bound scripts only read presets.
- The API is the **only** writer to views.
- **Only the entry points talk to the user**: a question, a confirm or a message box. The API and the layers below run without a user, so any caller can drive them headless; they report through the returned views, the console and the errors they raise.
- **Public and internal.** Callers outside the subsystem use only the API and the preset-bound run (a preset named by the script's file name, or the base preset with fixed overrides). Everything else is internal and may change without notice to them.
- **Engine-adapter registry.** Adapters register under the engine ids they implement, and the API finds the adapter for a chosen algorithm through the registry. Adding an engine is one registration plus one SSOT algorithm entry; adding an algorithm is one SSOT entry plus one adapter mapping. No other module changes.
- **SSOT/adapter separation.** The SSOT holds only functional definitions: algorithm metadata, GUI params, labels, allowed values and defaults. All engine-specific translation (option names, unit conversions, flag values) lives only in the adapters.

**Module roles**: *orchestrator* (the API and the writer), *SSOT*, *selection*, *preset/session I/O*, *appearance* (styling pass), *engine adapters* and the *GUI dialog*. The GUI consists of **per-tab modules** (selection / layout / appearance / preset row), so each surface can be tested on its own.

---

## 4. Data model

The conceptual entities and how they relate. Cardinalities use `1`, `0..N`, `1..N`.

| Entity | Relates to | Card. | Notes |
|---|---|---|---|
| **view** | VisualElement | 1 → 0..N | a view holds its placed elements |
| view | VisualRelation | 1 → 0..N | and its drawn relations |
| view | diagram object | 1 → 0..N | canvas-only objects |
| **VisualElement** | element | N → 1 | each placement realises exactly one element |
| **element** | occurrence | 1 → 0..N | one element, many appearances across views (and more than one per view under an *every container* condition) |
| **relation** | element (source, target) | N → 2 | directed; source and target are elements |
| **VisualRelation** | relation | N → 1 | draws one relation, as a *nesting* or a *connection* |
| **container** | nested element | 1 → 1..N | containment is **derived** from resolved nestings, never declared |
| **element** | container role | — | an element may be a container in one relation and a child in another |
| **diagram object** | model concept | N → 0 | realises nothing in the model |
| **Preset** | Step | 1 → 0..N | ordered list, each with its conditions; empty = no expansion |
| Preset | condition list | 1 → 6 | filter (elements, diagram objects, relations), nesting, reverse, style; empty filter = all, empty feature list = none |
| Preset | appearance config | 1 → 1 | style conditions, with a master on/off |
| **VisualSet** | view | 1 → 1 | existing visuals of one target view, captured before the run |
| **managed-occurrence record** | view | N → 1 | element + its chain of containers up to the view root; stored on the view, so it survives a view copy |
| **LayoutGraph** | element + nesting + connection | projection | engine-facing view of the object set |

**Closed enumerations.** Element and relation types come from the modelling language; the **diagram-object types** are a fixed canvas set. Extending any of them is a deliberate change. Each relation type carries a layout weight that some algorithms use.

**Object set.** Selection, filtering and expansion yield one set: `{ elements, relations, diagramObjects, diagramConnections }`, plus the captured VisualSet for a modify action.
- Relations partition into **nestings** and **connections**.
- Elements partition into **containers**, **nested** and **standalone**.
- **Extra occurrences** are counted separately and never folded into the element categories.
- Diagram objects and **diagram connections** are counted apart. Everything written is counted, the objects and lines inside a diagram-block too.

**Action** is a runtime parameter, never part of a preset; headless scripts may name it next to the preset. The stored form: [preset JSON schema](reference/presets.md#preset-json-schema).

---

## 5. Actions

Four actions in two groups. The writer is the same for all four. An action differs only in which objects feed the layout and which view is the target.

| Group | Action | Object set | Target view | VisualSet at start |
|---|---|---|---|---|
| **Create new view** | `NEW_VIEW` | full selection, expanded through filter + steps | a fresh view in the preset's folder/name (overwrites by name) | empty |
| | `ONE_EACH` | each selected element, run independently | one fresh view per element, named after the element (plus an optional preset suffix) | empty |
| **Modify selected view** | `EXPAND_VIEW` | elements selected on the view drive expansion; the whole view is laid out | the selected view, in place | captured |
| | `LAYOUT_ONLY` | the view's current contents only, no expansion | the selected view | captured |

A model-tree selection can drive only the Create group, because nothing identifies a target view. A canvas or whole-view selection can drive either group: Create clones it into a fresh view, and Modify acts in place.

**What Create takes from a view.** *New view* copies the diagram objects of a canvas or whole-view selection that the diagram filter keeps, as Expand view and Layout only keep them: size, text and appearance unchanged, a diagram-block with its contents. An element that appears only inside a diagram-block appears only there on the new view. A diagram connection is drawn when both its ends are on the new view. *One view each* takes no diagram objects: each of its views is about one element.

**New view or Layout only.** On a whole view the difference is the view object.
- *Layout only* changes the selected view in place: its id, properties and documentation stay, and so does every reference to it from other views. It keeps the appearance of the visuals and all user content, and adds nothing.
- *New view* writes into a fresh view; when the target folder already holds a view with that name, it empties that view and writes into it, which keeps that view's id and properties. The source view is not changed. Filter and steps apply, every relation between the elements is drawn, and elements get default appearance plus the preset's styling; diagram objects keep their own.

**The single writer rule.** It is action-agnostic, with no per-action branch: *for each result object, if a counterpart exists in the VisualSet, **reposition** it (appearance preserved, parenthood re-derived from the current nesting); otherwise **create** it with default appearance.* Relations follow the same rule: an existing relation gets its bendpoints rewritten, a new one is created.

**Many views.** Before *One view each* writes more than 20 views, the entry point asks the user to confirm. Selected elements of more than one type give a warning on the console; the run goes on.

Only `NEW_VIEW` overwrites a view's contents, onto a matching name. A Modify action never copies, renames or replaces its view, ignores the preset's view name and folder, and deletes only what rule 10 allows.

**What Expand view and Layout only keep.** Both take the selection from the view and lay everything out again by the Layout tab; *Expand view* first expands it when steps are set. With nesting off, the view has no nesting afterwards.
- **User content** is kept, apart from the connections rule 10 removes. The layout decides whether it is nested and where it goes; where it sat before plays no part.
- **Managed occurrences** follow the settings ([§ 7](#7-layout-options)).
- **Diagram objects** keep their size and appearance; the engine decides their position. A diagram object is never nested: nesting conditions select relations, and a diagram object has none.
- **A diagram-block** keeps its size, appearance and contents; the engine decides only its position. A relation from outside to an object inside it is laid out as a relation to the diagram-block, and drawn to the object itself.

---

## 6. Selection

**What a selection may contain.** Any mix of:
- model-tree items: folders (their contents are taken), elements and relations;
- canvas objects: VisualElements, VisualRelations, diagram objects, or a whole view. A whole view yields its complete contents, split into model concepts and diagram objects.

Mixed selections are valid and normalise into one object set.

**Filtering.** A global filter narrows what is included, in three independent condition lists:
- elements: by type, optionally with a property value;
- diagram objects: by type;
- relations: by source type, relation type and target type, among the relations drawn between the selected elements.

Filtering is **visibility-only**: hiding an element never alters the nesting structure between surviving elements. An empty list includes everything.

**Related-elements steps build on each other.** After the filtered base comes an ordered list of expansion steps.
- **Each step expands outward from the previous step's additions only**, not from the whole accumulated set. A sequence reads as "from these, reach those; from *those*, reach the next".
- A step condition reads from that set: *previous-step type → direction (outgoing / incoming / either) → added relation type → added element type*, plus an optional property value. It shows what it reaches.
- Followed relations are drawn; the added type and property only decide which elements join.
- **Repeat** runs the step 1–5 times, or *until nothing new* (at most 10 runs); each run starts from the previous run's additions.
- **An empty step ends the chain.**
- A step adds elements only. A relation whose other end is a relation (ArchiMate allows a relation on a relation) is not followed; following relations on relations is not supported yet.

**A wider filter never yields less.** An extra Include condition can only keep or grow what a step adds; an extra Exclude condition can only shrink it. There are no hidden exceptions. A condition that names an unknown type is rejected with a message, never widened to *All*.

**Modify actions are conservative.**
- `LAYOUT_ONLY` ignores the steps and never adds a missing relation: it only lays out again what is already on the view (managed occurrences excepted, [§ 7](#7-layout-options)).
- `EXPAND_VIEW` expands from the elements selected on the view and adds only what the steps reach; the rest of the view keeps its content.
- Neither applies the element-type filter, so a re-layout never strips element types that are already drawn.

**Live counts are a promise, not an estimate.** The dialog's predicted counts come from the *same* selection logic the API runs, so the displayed totals and the result on the view agree object for object ([run order](reference/selection-nesting.md#selection-run-order), [counting rules](reference/selection-nesting.md#counting-rules)). The promise holds per action:
- *New view* and *One view each*: the filtered base plus the step adds;
- *Expand view*: everything on the selected view plus what the steps add from the elements selected on it;
- *Layout only*: exactly what is on the view, relations included; nothing is added, so the selection counts are its prediction.

---

## 7. Layout options

Layout decides *how* objects are positioned. Options are grouped in the order of deciding: structure (relations, containers) first, then flow, elements, connections and view size. An option the chosen algorithm does not use is shown disabled; its value is kept but ignored ([capability matrix](reference/engines.md#capability-matrix)). Every option has one label, one explanation and a "used by" list, all from the SSOT.

**Algorithm styles.** Algorithms are grouped by the insight they give: Flow, Hierarchy, Network, Circular and Compact, all visible at once ([styles and algorithms](reference/gui.md#layout-tab)).

**Relations: nesting and reversal.**
- **Nesting.** Relations matching a nesting condition are drawn as containment: the child sits **inside** its parent's box. The view then expresses **hierarchy and ownership directly**. Because containment removes the line, **double relations and unexpected structure** stand out.
- A condition's source and target types restrict which elements may be a container (e.g. source *Grouping*). An optional property value, on the relation, its source or its target, narrows a condition further.
- **Reversal.** Relations matching a reverse condition are flipped: the flow lays them out from target to source, and a nested one has its target as parent. The model relation and its arrows stay unchanged.
- Each condition counts the relations it hits and how many become a nesting; the dialog says why the others are drawn as a line.

**Containers** (active once a nesting condition is on):
- **Layout inside**: the algorithm that arranges the children *inside* each container.
- **Connections between vs. crossing containers.**
  - *Between*: each container is laid out on its own, and connections enter at its border.
  - *Crossing*: the whole hierarchy is one layout, and connections run straight to the inner element.
  - Crossing is unavailable, and *between* is used, when the inner layout is a packing layout or a view size is set; otherwise unconnected elements would stack in one column.
- **Padding**: the space between a container's border and its contents.
- **Sort**, **same width per level** and **columns across containers** are refinements: they order the boxes, make nested frames telescope cleanly, and align columns across the view. They only position or derive sizes and never scale a leaf ([§ 8](#8-engine-contract), [sizing refinements](reference/selection-nesting.md#sizing-refinements)).
- **Sort** (Grid, Pack, Tiles) orders a view with containers, at every level, always ascending by type and name: *None* keeps the selection order, *Elements* (default) orders the elements, *Containers, then elements* the containers too and first, *All together* both in one list. A visible sort wins over **Algorithm start**. A view without containers is not sorted: Algorithm start orders it. Directed views have no Sort: the elements inside a container are ordered by type and name.

**Consequences** (not separate controls). For a nesting relation the **source is the parent** and the **target the child**; they are swapped if the type is also reversed. Container-ness is **derived**: an element is a container exactly when something resolves to be its child.

**Several parents** are never decided by condition or model order ([roles and parents](reference/selection-nesting.md#roles-and-parents)).
- A nesting condition set to **every container** places the child in *each* parent it reaches, as extra occurrences (e.g. an element filed under several groupings). Algorithms that do not draw containment draw each element once.
- The other nesting relations of one child give it **at most one** parent, the container it already sits in or else the first by name; the rest are drawn as connections.
- Nesting relations that together form a **cycle** (A contains B … contains A) are all drawn as connections.
- A relation drawn as nesting is never also drawn as a line. A connection whose ends have several occurrences is drawn **once** ([connections between occurrences](reference/selection-nesting.md#connections-between-occurrences)).

**Managed occurrences** follow from the settings, so every action, `LAYOUT_ONLY` too, reconciles them: missing ones are added and recorded on the view, recorded ones no longer asked for are removed, and switching a condition back on restores them. User content is always laid out, at view root if the settings place it nowhere ([managed occurrences](reference/selection-nesting.md#managed-occurrences)).

**Flow.**
- A main direction, for algorithms where direction drives ranking.
- For the simple ranked algorithm: how cycles are broken and how elements are assigned to layers.
- Where elements sit within a layer: **centred** between the elements they connect to, or lined up for **straight lines** while leaning to one side.
- The **layer distance**: the space between the elements of successive layers, border to border. Tree: between levels, never less than the element gap. Twopi: between rings.
- Radial sizes its rings itself: each depth on its own circle, every ring outside the one before, the first as large as its elements need.

**Twopi** puts the best-connected element of each connected part in the centre, and every other element on the ring of its distance (in relations) from there.
- Along the radius, the space between two rings is at least the layer distance, whatever the angle.
- A ring whose elements fill its circumference, side by side with the element gap, is *full*. A full ring is exactly tight at a layer distance equal to the element height, and grows and shrinks with the layer distance from there. Below that, the elements are pushed apart and the ring deforms, so the layer distance always has a visible effect.
- The order of the elements on a ring follows **Algorithm start**; twopi does not reduce crossings.

**Stress** places elements by connection length only. Elements that end up on top of each other are moved apart to the element gap afterwards, positions only.

**Circo** places elements on circles, ordered so that few connections cross.
- **Circles** chooses between:
  - *One circle* (default): all elements on one circle, connections across it; an overview in which every element counts equally;
  - *Per cycle*: each cycle on its own circle, joined where cycles meet in one element or one relation. Cycles joined by two or more relations share a circle, and elements outside a cycle hang off it. The largest cycle of each connected part is in the middle.
- Elements keep the element gap also when the view has unconnected parts (a note, a loose element).
- Which models it suits is in its tooltip; it has no direction control and no nesting.

**Elements.**
- Size: a fixed width and height, or size **by label**, wrapping long labels at a chosen width.
- The minimum **gap** between elements, also between unconnected groups.
- Where connections are routed between the elements (Neato, FDP, SFDP, Circo), the gap is at least twice the connection–element distance plus 2 px, so a connection fits between two elements. The dialog keeps the two values in step, and the one the user changed wins. There the gap is also at least the **shortest connection**, 20 px: room for both end symbols, so the relation type stays readable.

**Algorithm start**: the order in which the elements outside containers enter the layout: as selected (default), by name or by type and name. Another order gives the algorithm another starting point: an algorithm that keeps the input order (Tree, Twopi) shows it directly; others (Layered) use it only as a start. With **Cycle algorithm start** on, a new view starts with the selection order and every layout of an existing view takes the next one, so repeated *Layout only* runs step through them. It is not a sorted view and never applies inside a container; where **Sort** orders the view, the sort wins.

**Connections.** Line routing, label position, reserved space for labels, the distance between parallel connections (elements grow to fit their connections) and the clearance between a connection and the elements it passes.

**Room for the end symbols.** Archi draws a relation's end symbol (arrowhead, dot, diamond) in the direction of the last few pixels of the line; zoomed out, a very short last stretch rounds to another angle. So a curved or polyline connection has no bend within 12 px of its elements, and no two bends closer than 5 px. A connection with no bend left is drawn straight. Orthogonal lines keep their corners.

**View size.** *Free* (default), an **aspect ratio**, or a **max width**; at most one at a time. Grid and Pack offer only a max width. Tiles takes the widest arrangement within the max width, or the one closest to the aspect ratio; *Free* leans toward portrait. A target is met by **arranging elements differently** (e.g. more rows), never by scaling (rule 1). An engine that can only widen a layout offers no max width.

**Preset-only options** have no or minimal effect on the view (e.g. the canvas margin) and so no control. A preset can still set them, and a non-default value is logged.

**Settings outside the dialog.** A preset can also tune the layout engine and the label-size estimate directly, without a control ([settings outside the dialog](reference/presets.md#settings-outside-the-dialog)). A run lists each such setting that applies, and warns, saying what to do, about each one that has no effect, equals its default or overrides a dialog option.

---

## 8. Engine contract

An engine is an opaque function behind one normalised interface, `layout(LayoutGraph) → LayoutResult`. Adapters register themselves ([§ 3](#3-architecture)).

**LayoutGraph (in).**
- **nodes**: id, label, element type, and an optional parent id for nesting. Leaves have a fixed width/height; containers have no size, because the engine sizes them from their children.
- **edges**: id, source, target (already swapped for reversed types), label, weight. Nestings are expressed by the parent id on the child node, never as edges.
- **options**: algorithm-specific parameters, which the adapter translates from the preset.
- **constraints**: at most one of maxWidth / aspectRatio is non-zero.
- **flags**: width alignment, container sorting.

**LayoutResult (out).**
- **nodes**: the same ids, with **absolute** x/y/width/height and a parent id. The orchestrator converts them to parent-relative at write time.
- **edges**: the same ids, with **absolute** bendpoints, a straight-line flag, an optional label position, and optionally the points where the line leaves and enters the elements.
- **viewWidth / viewHeight**: the natural bounding box.

Element labels are intrinsic to nodes; the result carries no separate label coordinates. Field lists: [layout graph and result](reference/engines.md#layout-graph-and-result).

**Reversed edges.** For reversed relation types the graph swaps source and target, so the engine ranks them the other way. No flag travels with the edge; the writer draws the original model relation and lets it keep its model direction.

**Self-loops.** Each algorithm declares a self-loop capability:
- **none**: self-loop edges are excluded from the graph and not drawn, and removed on re-layout;
- **native**: the engine routes them;
- **partial**: the engine tries, and the writer draws a small corner loop when it fails.

**View-size constraints.** The adapter receives only the active constraint; the others are zeroed. The behaviour per engine: [per-engine view-size](reference/engines.md#per-engine-view-size).

**No post-layout scaling** (rules 1–2, no exceptions): no adapter multiplies the result by any factor or scales the set after `layout()` returns. Width alignment is a *pre*-layout adjustment, so it is not an exception.

**Adapter obligations.** Honour every option active for the chosen algorithm and ignore the rest; translate values to native form, setting only options the engine itself has (rule 18); apply size constraints without scaling; return absolute coordinates; never read or write a view (rule 5).

---

## 9. UX — Generate View dialog

The dialog defines a selection, a layout and styling, previews the result live, and runs an action. It is the only surface that edits presets. Mock-ups and per-control behaviour: [dialog reference](reference/gui.md#dialog-reference).

**Preset row.** Picking a preset **loads all its settings** at once; `*` marks settings that differ from the saved preset. Save, Save As…, Rename… and Delete manage presets; **Default** always exists and cannot be renamed or deleted. The last-used configuration and UI state are restored on open, from a user-local session that is never shared as a preset.

**Tabs.** Four tabs, each owning one concern, in separate modules:
- **Selection**: the live counts (selected → containing; per filter condition, per step), the global filter, and the ordered steps. Every condition list is a table with one condition per row. Each step shows what it adds, per condition and in total, with controls to collapse, reorder and remove it. When a preset loads, all steps start expanded.
- **Layout**: the algorithm radio table (all styles always visible), then the groups of [§ 7](#7-layout-options). Options the chosen algorithm does not use are greyed, with their values kept.
- **Appearance**: the three styling groups of [§ 10](#10-colouring--appearance), with a master on/off.
- **Properties**: key/value properties written to each generated view.

**Totals and actions.** Below the tabs, always visible, the predicted totals on the view stand above their action group: *on the generated view* for the Create group, and *on the expanded view* when *Expand view* is enabled. Two equal action groups follow: **Create new view** (folder, name; *New view*, *One view each*), always enabled; and **Modify selected view** (*Expand view*, *Layout only*), enabled only when the selection identifies a view. **Cancel** keeps the UI state.

**Self-explanatory options.** A user picks an option by its effect, without knowing the engines.
- A label or value names the **result** (where elements land, how lines look), never an engine technique or a word whose meaning hides behaviour.
- One list answers **one question**.
- Each value's tooltip gives its effect and trade-off.
- A label has the **same effect** in every algorithm. An algorithm offers it only when it has that effect there; otherwise it is disabled.

**Look and feel.** The whole dialog speaks one visual grammar: left-aligned, one subject per group, every control named, related options together, one vertical line per tab, controls at their own width, fixed spacing, short labels with the explanation in the tooltip, greyed when off, never cut off. It gives immediate, honest feedback, leaves no dead ends, asks a confirm only before destroying a saved preset, and stays calm while the user edits. The principles in full: [look and feel](reference/gui.md#look-and-feel).

**Interaction rules.** Switching presets discards unsaved changes without a confirm; the `*` is the warning. Live counts recompute on value-commit, not per keystroke. An empty selection opens normally and runs, producing an empty view. A malformed preset never aborts the dialog.

---

## 10. Colouring — Appearance

A **post-write styling pass** that sets fill colours, fonts and line widths. It runs **after** positioning and **never moves or resizes** anything, so it is exempt from the no-scaling rule.

**Master toggle.** One *Apply styling* switch enables or skips the whole pass, and persists in the preset. When it is off, no element appearance is touched, whatever the group settings. When it is on, styling applies to all four actions, and on re-layout or expand it replaces earlier styling.

Three groups, applied in this order; on the same object the later wins: **nesting level → highlight repeated → style by property**.
- **Style by property**: style conditions, applied in order. A condition says what gets the colour (an element by its own property, a relation, or the source / target element of a matching relation), whose property gives the value, and a colour scale. Several different values on one object give a *mixed values* colour; styled relations may take a fixed line width. When two conditions style one object the dialog flags it, and the last wins.
- **Style by nesting level**: varies container font size and fill colour by nesting depth. Its conditions select the nesting steps (parent type, relation and direction, child type) it follows from each root container; a step no condition selects stops it for that element and everything inside, which leaves that element its default fill. The font shrinks with the depth from the root. The fill comes per condition: the child it selects takes its colour from the preset's palette, or the type's default fill; when several conditions select one element the most specific wins, whatever their order. Each **segment** starts a set number of levels darker and lightens per level, with hue and saturation kept. A new preset follows the same-type chain from every root. It is active only when nesting conditions are configured.
- **Highlight repeated**: gives each element that appears more than once on the view its own colour. It needs a nesting condition set to *every container*.

Detail: [Appearance tab](reference/gui.md#appearance-tab).

---

## 11. Rules & invariants

System-wide, grouped by theme. Code reviews enforce them.

**Layout integrity.**
1. **No post-layout scaling**: result leaf sizes equal input sizes; the engine sizes containers; nothing is multiplied after layout. (Foundational.)
2. **Position spread only**: an outward centre-spread, with sizes frozen, is the only post-layout adjustment; compression is forbidden.
3. **Parent-relative coordinates**: a nested visual's bounds are relative to its parent. The orchestrator converts them from the engine's absolute output.
4. **Parent-first writing**: every node is written after its parent, so parent-relative conversion and draw order hold under any engine output order.

**Engine isolation.**
5. **Adapters never touch a view**: they operate only on LayoutGraph / LayoutResult.
6. **Layout-graph-only boundary**: adapters never see selections, presets or views.
7. **Container-ness is derived**: a node is a container if and only if something is its child; never a flag or a type check.
8. **Relations are never modified**: edge reversal is a traversal concern only.

**Writer discipline.**
9. **One action-agnostic writer**: if a visual exists, it is repositioned; otherwise it is created. The same holds for relations. No per-action branch.
10. **No silent data loss**: overwrite only when an action explicitly says so. A Modify action deletes no visuals except managed occurrences the settings no longer ask for (with the lines drawn to them), lines of relations drawn as nesting, and self-loops the algorithm does not draw.
11. **Appearance preservation**: repositioning a visual never changes its appearance properties; expand and re-layout rely on this.

**Determinism & validation.**
12. **Determinism**: same inputs → same view, always; no reliance on hash-iteration order. Every order "by name" uses one comparison: accents and case are ignored, and the exact text breaks a tie, so the order is the same on every machine.
13. **Total validation**: every preset entering the orchestrator is validated. Unknown keys are handled, missing keys defaulted, and option values checked against the algorithm.
14. **Capability masking**: values for options inactive on the chosen algorithm are ignored at run time. A non-empty inactive value that reaches run time is a defect and is logged.
15. **UI-only state is partitioned**: a preset holds only what affects generation. UI-only state (active tab, collapsed steps, …) is kept beside it in the session, unseen by the API.

**Vocabulary & naming.**
16. **One canonical vocabulary**: one name per concept across UI, logs and code; [§ 2](#2-vocabulary) is authoritative.
17. **Rename integrally**: a renamed key, label or string is updated everywhere in one change. No dual-readers or compatibility shims for in-repo data.

**Option semantics.**
18. **Stay within the algorithm**: an adapter sets only options the engine itself has. It may derive their values from the layout graph, but never places elements itself or adds its own ordering or crossing reduction, so the algorithms keep their own character. Accepted exceptions, where the engine lacks the option and the result is otherwise unusable: Tree's layer distance and curved routing, Radial's second run with a fixed radius, and Circo's second run when the graph has unconnected parts.
19. **One meaning per option**: an option means the same in every algorithm that uses it. Layer distance is the space between the elements of successive layers or rings, border to border; element distance is the minimum space between elements.
20. **Every active option has a visible effect** over its whole range, except where the elements themselves set a hard minimum. Options that depend on each other are kept consistent in the dialog, visibly; never corrected silently at run time.

---

## 12. Resilience & error model

- **Engine failure.** If an adapter throws or returns an unusable result, the run aborts cleanly with a logged reason. **No partial view is written**, and an existing view of that name is left as it was: a Create action creates or empties its view only after the layout succeeded. Where an algorithm is known to fail on certain graph shapes, the adapter pre-conditions the graph (e.g. cycle or forest pre-processing) rather than letting the engine crash.
- **Target resolution failure.** If a Modify action cannot identify its view, or a Create action cannot create or locate its folder, the run aborts with a message; nothing is written.
- **Empty or invalid selection.** The run proceeds and produces an empty (or unchanged) view; this is not an error.
- **Invalid preset.** Validation repairs its shape: unknown keys are dropped with a warning, missing keys defaulted, and an invalid condition is skipped with a warning. A preset with another `schemaVersion` is refused with a message naming the expected version.
- **Partial results.** Edges the engine dropped have any stale routing cleared. A nesting that cannot be drawn as containment is drawn as a connection, never left as it was.
- **A failed run** shows its reason in a message box from the entry point; the detail goes to the console. A failure is never only on the console. A preset that cannot be saved says so; the dialog does not act as if it was saved.
- **One run is one undo step.** One undo reverts everything a run changed, of a failed run too. An engine failure writes nothing (above); a failure while writing or styling can leave the view partly written, and that undo restores it.
- **Managed occurrences.** A record that no longer matches the view is dropped. Removing a managed occurrence removes the connections drawn to it, hand-drawn ones included. A view without records (made before records existed) holds only user content.

---

## 13. Verification & acceptance

A rebuild is accepted when rules 1, 3, 11 and 12 hold in tests, and:

- **Count promise**: the dialog's predicted totals equal the result on the view, object for object (`filtered base + Σ step adds = total`, for elements and for relations).
- **Preset round-trip**: writing then reading a preset yields the same configuration; unknown keys do not survive; defaults fill gaps.
- **Scale budget**: a target model size (element and relation counts) and a latency budget for the live counter are defined and tested; the live counter stays responsive at that target.

---

## 14. Development rules

- **Schema migration.** Every preset carries a `schemaVersion`. An older shape is migrated by an explicit, documented one-shot migration; an unmigrated preset is refused with a message, never silently reinterpreted. Unknown keys are reported, never dropped silently. New configuration keys are added to the defaults in the same change that introduces them.
- **Logging.** Console output mirrors the orchestration phases as named steps (validate → selection → layout graph → layout → target → write). Each step has a consistent, column-stable count block, so prediction and result can be compared at a glance ([console logging](reference/engines.md#console-logging)).
- **Rule hierarchy**: [`AGENTS.md`](../../../AGENTS.md) § Hierarchy; the View rules are in [`Scripts/View/AGENTS.md`](../AGENTS.md). This spec is the authority on what the View system does.

---

## Reference

Functional detail per subject; not part of the readable body.

| File | Holds |
|---|---|
| [reference/gui.md](reference/gui.md) | Display-label map, dialog mock-ups and per-control behaviour, generated option tables |
| [reference/presets.md](reference/presets.md) | Preset JSON schema, condition lists |
| [reference/selection-nesting.md](reference/selection-nesting.md) | Selection run order, counting rules, nesting reference, sizing refinements |
| [reference/engines.md](reference/engines.md) | Runtime and engines, layout graph and result, capability matrix, view size per engine, console logging |
