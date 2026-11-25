# View Generation — Rebuild Specification

A self-contained specification for rebuilding the View subsystem from scratch. It is **implementation-free**: it states *what* the system must do and the contracts it must honour, never how a platform realises them. The functional detail per subject is in [`reference/`](#reference); the design decisions and the *how* are in [ARCHITECTURE.md](ARCHITECTURE.md). The rules are in [`Scripts/View/AGENTS.md`](../AGENTS.md#hard-rules) § Hard rules; on a conflict they win, then this document.

---

## 1. Purpose & scope
<!-- @keep: do not rewrite this section — wording reviewed and signed off -->

### Purpose

Starting with a selection, generate or modify the layout of ArchiMate **views**. The script turns a chosen subset of the model (plus conditions for which related elements to include) into a positioned diagram.

### Use cases

- quickly generate a starting point for a new view
- generate context views: one view per element with its related elements (*One view each*), e.g. a view per GGM data object
- analyse your model by generating different views; use nesting to find unexpected relations, see double relations, etc.
- generate complex views from one preset — filter, steps, layout, appearance and view properties — and regenerate them from what each view remembers (its generation record) when the model changes, e.g. the GEMMA publication views
- lay out a hand-made view again (*Layout only*) or extend it (*Expand view*), keeping what the user put there: legends, notes, hand-placed duplicates
- drive view generation from other scripts through the API, e.g. the GGM pipeline that generates, styles and sets the properties of the views per policy domain

### Scope

In scope: generating or modifying views with different layouts; storing and reusing selection and layout configurations (presets); making a generated view again from its generation record; a configuration UI; session continuity.

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
- **container**: a VisualElement with other VisualElements drawn inside it.
- **leaf**: a VisualElement with nothing inside it: a nested element or a standalone.
- **parent** / **child**: the container a VisualElement is directly inside / a VisualElement directly inside a container.
- **root**: a VisualElement without a parent.
- **nested element**: a leaf inside a container.
- **standalone**: contains nothing and is nested by no relation: drawn at view root, or only inside a diagram-block.
- **extra occurrence**: the 2nd to Nth appearance of one element under different containers; a managed occurrence or user content.

**VisualRelation roles**
- **nesting**: drawn as containment (the child inside its parent, no line).
- **connection**: drawn as a line between two VisualElements. Every VisualRelation is one or the other.
- **self-loop**: a connection whose source and target are the same element. Whether it is drawn, and how, is an algorithm capability ([§ 8](#8-engine-contract)).

**Existing view contents**: what *Expand view* and *Layout only* keep of what is already on the view ([§ 5](#5-actions)).
- **user content**: every object on the view that the system did not place itself: elements, connections and diagram objects. It is always kept; the layout decides whether it is nested and where it goes.
- **managed occurrence**: an extra occurrence the system placed itself for an *every container* condition and recorded on the view. It follows the settings. Only managed occurrences are ever removed.
- **diagram-block**: a diagram object with contents, together with everything inside it, such as a legend, or a group with a title and elements. The layout decides only its position.

**View template**
- **view template**: a view in the model that a generated view is made from. It gives its *content* (its elements and diagram objects are always on the generated view), its *structure* (the table of cells in which its containers keep their places) and its *look* (the appearance of its elements, the base layer of the styling). The selection fills it.
- **table**: the layout of the children of a container on the view template (or of the view itself), read from the view template: table rows and table columns of cells. It holds no sizes or positions.
- **table row**, **table column**: a horizontal, a vertical group of cells. The prefix keeps them apart from the *row* and *column* of elements.
- **cell**: the place of one container, leaf or diagram-block in the table, with everything in it. Objects that overlap on the view template share one cell as a stack, in reading order.
- **cell span**: a cell that runs over several table rows or table columns.
- **gridline**: the line between table rows (a *row border*) or table columns (a *column border*).
- **template container**: a container on the view template. It keeps its place; a leaf of the view template is only always there, unless *Leaves in place*.

**Subsystem**
- **Layout**: algorithmic positioning of all visible objects on a view.
- **Preset**: a named, persistable bundle of selection, layout and styling configuration.
- **Step**: one ordered related-elements expansion stage inside a preset; holds an optional name, a repeat and a condition list.
- **condition / condition list**: a condition is a pattern over element and relation types (*All* = any), either *Include* or *Exclude*. A list keeps any Include match minus any Exclude match.
- **Action**: a runtime verb (create / per-element / expand / re-layout); never stored in a preset.
- **Session**: the last-used configuration and dialog state (open tab, chosen action, window size and position), restored when the UI opens.
- **Generation record**: what a run records on the view it generated: the preset by name, the action, the start and the destination (folder, mirrored); for *One view each* its element; marks such as modified settings. It is the result afterwards, so the view can be made again.
- **Regenerate**: making a view again from its generation record, where it stands.
- **Siblings**: the views of one *One view each* run: the same start, preset and action.
- **VisualSet**: the existing visual objects of one target view, captured before a run.

**View recipes**
- **view recipe**: a grouping whose property `View recipe` = `view` makes it the description of exactly one generated view. Its start is the grouping itself; it carries the Object ID the view gets (`View Object ID`); its view template is the view reference inside its visual on *View recipes*, or that of its group.
- **view recipe group**: a grouping with `View recipe` = `group`. It aggregates view recipes, carries the view template for all of them and makes one view per view recipe (*One view each*). A view recipe outside a group makes one view (*New view*). The action follows from the kind.
- **View recipes** (the folder and the view): containers in which the user finds and maintains the recipes. The view also records each recipe's view template, as a view reference inside the recipe's visual. The property makes a grouping a recipe; the folder does not.
- **recipe link**: the link from a preset to one recipe: its identity, and its name as a label. `View preset` on the recipe names the preset, as information only.
- **last generated**: the date and time of the recipe run that last wrote a view (`View last generated`). Only a view made from a recipe has it.
- **stale view**: a view made from a recipe that the last run over that recipe did not write: its recipe was renamed, or its recipe or preset is gone.

**Appearance**
- **palette**: a named set of colors and color ranges that belong together, shared by the presets; a preset always names one, and every color of its styling comes from it, but for the fill colors a condition takes from the template look.
- **appearance attribute**: one attribute of how an object looks: fill color, opacity, gradient, line color, width and style, font name, size, style and color, figure, icon, image, text alignment and position. Not a model property.
- **fill color**: the fill color of an element or diagram object on a view; the dialog and docs say "fill color", or "color" where the context is clear.
- **template look**: the appearance attributes an element has on the view template: the one in the same container, or its first occurrence there. It is the base layer of the styling of every element of the view template.
- **Template** (a condition's value): use the corresponding value of the template look. Each element keeps its own value at every nesting level. Fallback for an element not on the view template, or without a view template: *Type default*, 9 pt, normal.
- **Same as parent** (a condition's value, in the fill color and the font style): the parent's value, one step lighter for a fill color; the parent's style for a font style. In *Child type* it means the parent's type.
- **start element**: the element where a condition starts styling a nesting chain: the root container, or a child selected by another condition than its parent.
- **nesting type change**: a nesting step from a container to a child of another element type.
- **nesting color change**: a nesting step where *Color and font by nesting level* gives the child another fill color than its container.
- **nesting chain**: starts at each root container and follows parent-to-child nesting steps; each step is selected by one condition, which may select several consecutive steps. A child is styled only when its parent is. The chain ends where no condition selects the next nesting step.

**Box** is no term: the dialog and the docs say container, leaf or element. In engine code a box is the rectangle of a layout node (geometry).

**Counter rule.** *Relations* is a model word. Selection counters (filtered base, step adds) use it; on the view, count **nestings** and **connections**, never "relations". Internal data-structure names (`parentMap`, `childIds`, `occurrenceMap`, …) are code-only and never surface in the UI or logs. GUI labels for internal terms: [display-label map](reference/gui.md#display-label-map).

---

## 3. Architecture

Three layers, top to bottom. Each layer talks only to the one below.

```
Layer 1 — Entry points      produce (preset, selection, action), call the API
  • Generate View dialog  — defines selection/layout/styling; live counts; only editor of presets
  • Preset-bound scripts  — headless: load a preset, call the API, exit
  • Session scripts      — headless: run the session with one change, kept in the session
  • Regenerate scripts   — headless: run what the generation record of a view holds
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
- **Public and internal.** Callers outside the subsystem use only the API and the preset-bound run (a preset named by the script's file name, or the preset Default with fixed overrides). Everything else is internal and may change without notice to them.
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
| Preset | appearance config | 1 → 1 | style conditions |
| **VisualSet** | view | 1 → 1 | existing visuals of one target view, captured before the run |
| **managed-occurrence record** | view | N → 1 | element + its chain of containers up to the view root; stored on the view, so it survives a view copy |
| **LayoutGraph** | element + nesting + connection | projection | engine-facing view of the object set |
| **view recipe group** | view recipe | 1 → 1..N | by aggregation; a view recipe is in at most one group |
| view recipe, view recipe group | view template | N → 0..1 | a view reference inside its visual on *View recipes*; a view recipe without one takes its group's |
| **Preset** | recipe | 0..1 → 0..1 | the recipe link; a recipe in a group is made through its group's preset |
| **view** | view recipe | N → 0..1 | through the recipe in its generation record, else its Object ID = the recipe's `View Object ID`; more than one: the others are stale |

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
| **Create new view** | `NEW_VIEW` | full selection, expanded through filter + steps | a view with Name in the folder (replaces by name) | empty |
| | `ONE_EACH` | each selected element, run independently | one view per element that passes the filter, named after the element (plus an optional preset suffix): in the folder, or Mirrored below it | empty |
| **Modify selected view** | `EXPAND_VIEW` | elements selected on the view drive expansion; the whole view is laid out | the selected view, in place | captured |
| | `LAYOUT_ONLY` | the view's current contents only, no expansion | the selected view | captured |

A model-tree selection can drive only the Create group, because nothing identifies a target view. A canvas or whole-view selection can drive either group: Create clones it into a fresh view, and Modify acts in place.

**What Create takes from a view.** *New view* copies the diagram objects of a canvas or whole-view selection that the diagram filter keeps, as Expand view and Layout only keep them: size, text and appearance unchanged, a diagram-block with its contents. An element that appears only inside a diagram-block appears only there on the new view. A diagram connection is drawn when both its ends are on the new view. *One view each* takes no diagram objects: each of its views is about one element.

**New view or Layout only.** On a whole view the difference is the view object.
- *Layout only* changes the selected view in place: its id, properties and documentation stay, and so does every reference to it from other views. It keeps the appearance of the visuals and all user content, and adds nothing.
- *New view* writes into a fresh view; when the target folder already holds a view with that name, it empties that view and writes into it, which keeps that view's id and properties. With one view selected the dialog pre-fills its folder and name, so the result replaces it in place; another folder or name makes a copy, and a script follows its preset. Filter and steps apply, every relation between the elements is drawn, and elements get default appearance plus the preset's styling; diagram objects keep their own.

**The single writer** (rule 9): *for each result object, if a counterpart exists in the VisualSet, **reposition** it (appearance preserved, parenthood re-derived from the current nesting); otherwise **create** it with default appearance.* Relations follow the same rule: an existing relation gets its bendpoints rewritten, a new one is created.

**Where a new view goes.** The preset names one folder under Views (`/_Generated` by default, apart from the model's own views; `/` is Views itself). The user types it or picks it from the Views tree, where a new folder can be made.
- *In the folder*: every view goes into that folder; *New view* always writes here.
- *Mirrored* (*One view each* only): each view goes below that folder, in the folder that mirrors its element's place in the model tree, the layer included. The views get the structure the model has, and same-named elements from different folders do not overwrite each other.

The console names the folder of every view written. An element the preset's element filter drops gets no view, so no view stays empty.

**Regenerate.** *New view* and *One view each* leave a **generation record** on the view: the start, the preset by name, the action, the recipe it came from and, for *One view each*, the element and where its views went. The start is what was selected: a folder stays a folder, so new elements in it join; an object selected on a view is kept with the objects nested in it, as the run takes them; a view is kept as the elements on it at that moment, so a view that replaced itself does not grow with every regenerate, and its diagram objects do not come back. Objects are found by their identity, which survives a rename and a move; their readable path is a label, never used to find them.
- *Regenerate* makes the selected views, or the views in a selected folder, again where they stand, with the saved preset; hand edits are lost. A view of *One view each* regenerates only itself. A view made from a recipe is made again through its recipe, as *Generate view recipes* does for that view alone, without removing stale views; a recipe that is gone is reported.
- *Regenerate with siblings* runs the start and action again: siblings are updated wherever they are now, a new element gets a view, and a view whose element left the start is reported and stays.
- A view with a missing object or preset is reported and not written. A renamed preset is such a case; a new run repairs the view. A view made by a script that works on after the run is refused, naming the script.
- A view made with unsaved settings, or changed by *Expand view* since, is marked; Regenerate says the result can differ. Each run reports what it uses and what it does not.
- A published release does not carry generation records: they are working data.

**View recipes.** A recipe and its linked preset together describe a publishable view. *Check view recipes* reports every inconsistency before anything is written, and writes nothing itself:
- *Recipes*: an unknown kind; a recipe without an Object ID; a view recipe in more than one group; a group without view recipes, or aggregating something that is no view recipe; a view recipe that the element filter of its group's preset drops.
- *View template*: no view *View recipes*, or more than one; a recipe not on it, or on it more than once; more than one view reference; none, while the linked preset uses a view template.
- *Links*: a preset whose recipe is not in the model; a recipe linked from several presets, or from none; a preset linked to a view recipe that its group makes; a label that no longer matches the recipe's name; `View preset` differing from the linked preset.
- *Duplicates*: a recipe's Object ID that another concept carries; a `View Object ID` on two recipes, or equal to a concept's Object ID.

Each finding names objects by folder path and name, never by identity, and says its effect and what to do. One cause gives one finding: a missing *View recipes* view, an ambiguous view template, or a view recipe in several groups is not reported again per consequence, and while no preset is linked at all that is one finding. A finding says when generate skips a recipe for it; an old label, a differing `View preset` and a recipe without a preset block nothing.

**A recipe as the start.** When the start is exactly one recipe, in the model tree or on a view, the recipe sets what it describes; any other start is ad hoc, with the preset's own settings.
- *Action and start*: a view recipe on its own makes one view (*New view*), named after it. A group makes one view per view recipe (*One view each*); a view recipe in a group makes only its own view, the group's way. The start is the view recipes, never what was clicked around them.
- *View template*: each view is made from its recipe's view template; the preset's own is kept, not used, and the preset says whether a view template is used at all.
- *Object ID*: each view gets its recipe's `View Object ID`. A recipe without one takes the view's Object ID, or a new one, so a view made before keeps its Object ID.
- *Recipe link*: Save links the preset to the recipe and writes `View preset` on every recipe the preset makes. A preset linked to another recipe asks first: move the link, or save as a new preset. Save As links the new preset to the recipe of the start, else to none. With any other start Save leaves the link as it is and refreshes its label.

**Generate view recipes.** One run makes the views of the recipes, the same way every time, by anyone, in Archi or on its command line.
- *Scope*: nothing selected, or the view or folder *View recipes*, is every preset linked to a recipe in the open model; otherwise the selected recipes, where a view recipe in a group makes only its own view. Other selected objects are reported and left out.
- *Order*: the check runs first; then each linked preset, by name, runs with its recipe as the start, as the dialog does. A recipe the check blocks is skipped and its views stay; a failed preset does not stop the others.
- *Written*: `View preset` on its recipes, and on every view its Object ID, its last generated (one date and time for the whole run) and its generation record. A view of the same name in the folder is replaced: silently when it is the view of the same recipe, with a warning otherwise.
- *Stale views*: after the run, the views made from a recipe that it wrote anew under another name, and, when it covered every linked preset, those whose recipe or preset is gone. They are listed by name, folder, last generated and Object ID, and one confirmation deletes them. Nobody is asked on the command line: there they are only listed unless deleting is asked for when it starts, and the model is saved.
- *Shared Object ID*: a view not made from a recipe that carries the Object ID of a view the run wrote, typically its old version under another name, is reported with that view; it is left as it is.
- A published release keeps last generated; it drops the recipes with the other elements that are on no published view.

**Many views.** Before *One view each* writes more than 20 views, the entry point asks the user to confirm (a recipe run from the dialog too; *Generate view recipes* never asks); the count is what passes the filter. Selected elements of more than one type give a warning on the console; the run goes on.

Only `NEW_VIEW` overwrites a view's contents, onto a matching name. A Modify action never copies, renames or replaces its view, ignores the preset's view name and folder, and deletes only what rule 10 allows.

**What Expand view and Layout only keep.** Both take the selection from the view and lay everything out again by the Layout tab; *Expand view* first expands it when steps are set. With nesting off, the view has no nesting afterwards.
- **User content** is kept, apart from the connections rule 10 removes. The layout decides whether it is nested and where it goes; where it sat before plays no part.
- **Managed occurrences** follow the settings ([§ 7](#7-layout-options)).
- **Diagram objects** keep their size and appearance; the engine decides their position. A diagram object is never nested: nesting conditions select relations, and a diagram object has none.
- **A diagram-block** keeps its size, appearance and contents; the engine decides only its position. A relation from outside to an object inside it is laid out as a relation to the diagram-block, and drawn to the object itself.
- **A view template** ([§ 7](#7-layout-options)) gives only its table: nothing is added or left out.

---

## 6. Selection

**What a selection may contain.** Any mix of:
- model-tree items: folders (their contents are taken), elements and relations;
- canvas objects: VisualElements, VisualRelations, diagram objects, or a whole view. A whole view yields its complete contents, split into model concepts and diagram objects.

Mixed selections are valid and normalise into one object set.

**Filtering.** A global filter narrows what is included. It has two condition lists:
- one list for elements and relations, each condition applying to one of the two:
  - an element condition: by type, optionally with a property value;
  - a relation condition: by source type, relation type and target type, among the relations drawn between the selected elements;
- diagram objects: by type.

Element conditions and relation conditions are independent: without an Include condition of a kind, all of that kind is kept, minus Exclude. Filtering is **visibility-only**: hiding an element never alters the nesting structure between surviving elements. An empty list includes everything.

**Related-elements steps build on each other.** After the filtered base comes an ordered list of expansion steps.
- **Each step expands outward from the previous step's additions only**, not from the whole accumulated set. A sequence reads as "from these, reach those; from *those*, reach the next".
- A step condition reads from that set: *previous-step type → direction (outgoing / incoming / either) → added relation type → added element type*, plus an optional property value. It shows what it reaches.
- Followed relations are drawn; the added type and property only decide which elements join.
- **Repeat** runs the step 1–5 times, or *until nothing new* (at most 10 runs); each run starts from the previous run's additions, and all runs together are what the next step starts from. The dialog counts per run. It belongs to the whole step: a different depth per relation takes a step of its own.
- **An empty step ends the chain.**
- A step adds elements only. A relation whose other end is a relation (ArchiMate allows a relation on a relation) is not followed; following relations on relations is not supported yet.

**A wider filter never yields less.** An extra Include condition can only keep or grow what a step adds; an extra Exclude condition can only shrink it. There are no hidden exceptions. A condition that names an unknown type is refused, never widened to *All* ([§ 12](#12-resilience--error-model)).

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
- **Nesting.** Relations matching a nesting condition are drawn as containment: the child sits **inside** its parent. The view then expresses **hierarchy and ownership directly**. Because containment removes the line, **double relations and unexpected structure** stand out.
- A condition's source and target types restrict which elements may be a container (e.g. source *Grouping*). An optional property value, on the relation, its source or its target, narrows a condition further.
- **Reversal.** Relations matching a reverse condition are flipped: the flow lays them out from target to source, and a nested one has its target as parent. The model relation and its arrows stay unchanged.
- Each condition counts the relations it hits and how many become a nesting; the dialog says why the others are drawn as a line.
- An algorithm may nest to a limited depth ([capability matrix](reference/engines.md#capability-matrix)); a nesting relation below it is drawn as a line.

**Containers** (active once a nesting condition is on):
- **Layout inside**: the algorithm that arranges the children *inside* each container.
- **Connections between vs. across containers.**
  - *Between*: each container is laid out on its own, and connections enter at its border.
  - *Across*: the whole hierarchy is one layout, and connections run straight to the inner element.
  - Across is unavailable, and *between* is used, when the inner layout is a packing layout or a view size is set; otherwise unconnected elements would stack in one column.
- **Padding**: the space between a container's border and its contents. Above its contents a container keeps room for its label: its lines wrapped at the width the container is drawn, and below them half the padding, more in proportion for a larger font.
- **Sort**, **same width** and **columns across containers** are refinements: they order the elements, give a nesting level (and, after the last nesting type change, an element type) one width, and align columns across the view. They only position or derive sizes and never scale a leaf ([§ 8](#8-engine-contract), [sizing refinements](reference/selection-nesting.md#sizing-refinements)).
- **View template** (Tiles): a view template the selection fills, so every view of one map reads alike. Its elements and diagram objects are always on the view. An element of the selection that hangs under nothing there brings its nesting parents, up to the view template; one that reaches it by no path is left out, and the console says so. The selection decides where an element nests: another parent the model gives it on the view template is not drawn. An element of the view template nests only where the view template shows it. The template container keep their places in its table; a cell is as wide as its table columns, as high as its table row needs, and what is in it is packed again at that width. Its leaves are placed by the layout, sorted and compact. **Leaves in place** keeps the place of its leaves too. Its elements start with their **template look** ([§ 10](#10-coloring--appearance)). The view template can be switched off without losing the preset's choice: then nothing of it is used (no elements, table, diagram objects or look). The model leads: an element the model puts elsewhere goes there, with a warning ([view template](reference/selection-nesting.md#view-template)).
- **Sort** (Grid, Pack, Tiles) orders a view with containers, at every level, always ascending by type and name: *None* keeps the selection order, *Elements* (default) orders the elements, *Containers, then elements* the containers too and first, *All together* both in one list. A visible sort wins over **Selection order**. A view without containers is not sorted: Selection order orders it. Directed views have no Sort: the elements inside a container are ordered by type and name.

**Consequences** (not separate controls). For a nesting relation the **source is the parent** and the **target the child**; they are swapped if the type is also reversed. Container-ness is **derived**: an element is a container exactly when something resolves to be its child.

**Several parents** are never decided by condition or model order ([roles and parents](reference/selection-nesting.md#roles-and-parents)).
- A nesting condition set to **every container** places the child in *each* parent it reaches, as extra occurrences (e.g. an element filed under several groupings). Algorithms that do not draw containment draw each element once.
- The other nesting relations of one child give it **at most one** parent: the container it already sits in, else the one that joined the view earliest (the selection first, then the related-elements steps in order), else the first by name; the rest are drawn as connections.
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
- The order of the elements on a ring follows **Selection order**; twopi does not reduce crossings.

**Stress** places elements by connection length only. Elements that end up on top of each other are moved apart to the element gap afterwards, positions only.

**Circo** places elements on circles, ordered so that few connections cross.
- **Circles** chooses between:
  - *One circle* (default): all elements on one circle, connections across it; an overview in which every element counts equally;
  - *Per cycle*: each cycle on its own circle, joined where cycles meet in one element or one relation. Cycles joined by two or more relations share a circle, and elements outside a cycle hang off it. The largest cycle of each connected part is in the middle.
- Elements keep the element gap also when the view has unconnected parts (a note, a loose element).
- Which models it suits is in its tooltip; it has no direction control and no nesting.

**Elements.**
- Size: a fixed width and height, or size **by label**: in as few lines as fit a chosen width, evenly long, with a little room around the text and clear of the type icon. A word the tool cannot break makes the element wider than that width. An element grows taller when its label does not fit.
- The minimum **gap** between elements, also between unconnected groups.
- Where connections are routed between the elements (Neato, FDP, SFDP, Circo), the gap is at least twice the connection–element distance plus 2 px, so a connection fits between two elements. The dialog keeps the two values in step, and the one the user changed wins. There the gap is also at least the **shortest connection**, 20 px: room for both end symbols, so the relation type stays readable.

**Selection order**: the order in which the elements outside containers enter the layout: as selected (default), by name or by type and name. Another order gives the algorithm another starting point: an algorithm that keeps the input order (Tree, Twopi) shows it directly; others (Layered) use it only as a start. With **Cycle selection order** on, a new view starts with the selection order and every layout of an existing view takes the next one, so repeated *Layout only* runs step through them. The next order is kept in the session, so the steps run from the dialog or from the session script; a preset-bound script runs one layout with the preset's own selection order. It is not a sorted view and never applies inside a container; where **Sort** orders the view, the sort wins.

**Connections.** Line routing, label position, reserved space for labels, the distance between parallel connections (elements grow to fit their connections) and the clearance between a connection and the elements it passes. Across the flow, reserved labels follow the distance between parallel connections and keep at least 5 px between their text.

**Label text** is sized in the font it will be drawn with: the one *Color and font by nesting level* sets, else the font of its template look, else the object's own on the view, else the tool's default view font; measured and broken into lines as the tool draws it, at the width the text gets inside its figure. Labels are never changed: a container is never narrower than a word of its label the tool cannot break, and the first line of a label the tool lets run under the type icon (left-aligned) ends before it. Each container label gets the room its lines need at the width the container is drawn.

**Room for the end symbols.** Archi draws a relation's end symbol (arrowhead, dot, diamond) in the direction of the last few pixels of the line; zoomed out, a very short last stretch rounds to another angle. So a curved or polyline connection has no bend within 12 px of its elements, and no two bends closer than 5 px. A connection with no bend left is drawn straight. Orthogonal lines keep their corners.

**View size.** *Free* (default), an **aspect ratio**, or a **max width**; at most one at a time. Grid and Pack offer only a max width. Tiles takes the widest layout within the max width, or the one closest to the aspect ratio; *Free* leans toward portrait. A target is met by **arranging elements differently** (e.g. more rows), never by scaling (rule 1). An engine that can only widen a layout offers no max width.

**Preset-only options** have no or minimal effect on the view (e.g. the canvas margin) and so no control. A preset can still set them, and a non-default value is logged.

**Settings outside the dialog.** A preset can also tune the layout engine and the sizing by label directly, without a control ([settings outside the dialog](reference/presets.md#settings-outside-the-dialog)). A run lists each such setting that applies, and warns, saying what to do, about each one that has no effect, equals its default or overrides a dialog option. A setting of the wrong type stops the run before anything is written.

---

## 8. Engine contract

An engine is an opaque function behind one normalised interface, `layout(LayoutGraph) → LayoutResult`. Adapters register themselves ([§ 3](#3-architecture)).

**LayoutGraph (in).**
- **nodes**: id, label, element type, and an optional parent id for nesting. Leaves have a fixed width/height; containers have no size, because the engine sizes them from their children. A container carries the room its label takes above its contents.
- **edges**: id, source, target (already swapped for reversed types), label with the size of its text, weight. Nestings are expressed by the parent id on the child node, never as edges.
- **options**: algorithm-specific parameters, which the adapter translates from the preset.
- **constraints**: at most one of maxWidth / aspectRatio is non-zero.
- **flags**: width alignment, container sorting.

**LayoutResult (out).**
- **nodes**: the same ids, with **absolute** x/y/width/height and a parent id. The orchestrator converts them to parent-relative at write time.
- **edges**: the same ids, with **absolute** bendpoints, a straight-line flag, an optional label position, and optionally the points where the line leaves and enters the elements.

Element labels are intrinsic to nodes; the result carries no separate label coordinates. Field lists: [layout graph and result](reference/engines.md#layout-graph-and-result).

**Reversed edges.** For reversed relation types the graph swaps source and target, so the engine ranks them the other way. No flag travels with the edge; the writer draws the original model relation and lets it keep its model direction.

**Self-loops.** Each algorithm declares a self-loop capability:
- **none**: self-loop edges are excluded from the graph and not drawn, and removed on re-layout;
- **native**: the engine routes them;
- **partial**: the engine tries, and the writer draws a small corner loop when it fails.

**View-size constraints.** The adapter receives only the active constraint; the others are zeroed. The behaviour per engine: [per-engine view-size](reference/engines.md#per-engine-view-size).

**No post-layout scaling** (rules 1–2): width alignment is a *pre*-layout adjustment, so it is not an exception.

**Adapter obligations.** Honour every option active for the chosen algorithm and ignore the rest; translate values to native form, setting only options the engine itself has (rule 18); apply size constraints without scaling; return absolute coordinates; never read or write a view (rule 5).

---

## 9. UX — Generate View dialog

The dialog defines a selection, a layout and styling, previews the result live, and runs an action. It is the only surface that edits presets. Mock-ups and per-control behaviour: [dialog reference](reference/gui.md#dialog-reference).

**Preset row.** Presets are picked from a tree of their folders, or found by typing part of the name or folder. Picking a preset **loads all its settings** at once; `*` marks settings that differ from the saved preset. Save, Save As…, Rename… and Delete manage presets; Save As… and Rename… choose the name and folder in the operating system's save dialog, and Edit… changes the description. **Default** always exists, is listed first and is read-only in the dialog: a new preset starts from it with Save As…. It selects the selection plus one ring, every element directly related to it. Its file may hold the user's own defaults; when Default is chosen, every setting in which it differs from the code defaults is reported. The last-used configuration and UI state are restored on open, from a user-local session that is never shared as a preset.

**Tabs.** Four tabs, each owning one concern, in separate modules:
- **Selection**: the live counts (selected → containing; per filter condition, per step), the global filter, and the ordered steps. Every condition list is a table with one condition per row. Each step shows its name (or its number), its repeat and what it adds, per condition and in total, with controls to rename, collapse, reorder and remove it. When a preset loads, all steps start expanded.
- **Layout**: the algorithm radio table (all styles always visible), then the groups of [§ 7](#7-layout-options). Options the chosen algorithm does not use are greyed, with their values kept.
- **Appearance**: the three styling groups of [§ 10](#10-coloring--appearance).
- **Properties**: key/value properties of each generated view: a ticked row is written, an unticked row is removed. Keys the tool owns or an installation lists as hidden are not shown and never touched.

**Actions.** Below the tabs, always visible, two equal groups: **Create new view** (*New view*, *One view each*; name, folder) and **Modify selected view** (*Expand view*, *Layout only*; the view), the latter available only when the selection identifies a view. The user chooses one action; what it does not use is greyed. Each group shows what its action writes: the predicted totals of *New view* and *Expand view*, grey when not chosen, and the folder and name it writes, or the view it changes, in bold. A Create action with nothing to place cannot run and says why. A recipe as the start ([§ 5](#5-actions)) fixes the action and the name, the view template and the Object ID; each is shown greyed with the recipe it comes from, and the Selection tab names the recipe and the one the preset belongs to. One run button names the result (*Create 12 views*, *Replace view*). The last action is remembered; with a view selected the dialog opens on *Layout only*, so replacing a view is a deliberate choice. **Cancel** keeps the UI state.

**Self-explanatory options.** A user picks an option by its effect, without knowing the engines.
- A label or value names the **result** (where elements land, how lines look), never an engine technique or a word whose meaning hides behaviour.
- One list answers **one question**.
- Each value's tooltip gives its effect and trade-off.
- A label has the **same effect** in every algorithm. An algorithm offers it only when it has that effect there; otherwise it is disabled.

**Look and feel.** The whole dialog speaks one visual grammar: left-aligned, one subject per group, every control named, related options together, one vertical line per tab, controls at their own width, fixed spacing, short labels with the explanation in the tooltip, greyed when off, never cut off. It gives immediate, honest feedback, leaves no dead ends, asks a confirm only before destroying a saved preset, and stays calm while the user edits. The principles in full: [look and feel](reference/gui.md#look-and-feel).

**Interaction rules.** Switching presets discards unsaved changes without a confirm; the `*` is the warning. Live counts recompute on value-commit, not per keystroke. An empty selection opens normally and runs, producing an empty view. A malformed preset never aborts the dialog.

---

## 10. Coloring — Appearance

A **post-write styling pass** that sets fill colors, fonts and line widths. It runs **after** positioning and **never moves or resizes** anything, so it is exempt from the no-scaling rule.

Applied in this order; on the same object the later wins: **template look → color and font by nesting level → style by property → highlight repeated**.
- **Template look**: each occurrence of an element of the view template takes the whole appearance of that element there, in the container it lies in, else of its first. It is the base layer; every run takes it again. A Modify action does not reset it.
- **Color and font by nesting level**: a condition overrides per appearance attribute: fill color, font size and font style. Its conditions select the nesting steps (parent type, relation and direction, child type, and a property match on the child, the parent or the relation) it follows from each root container; a step no condition selects stops it for that element and everything inside, which leaves that element its template look, else its default. A condition also styles a root container of its child type. Fill color, font and the numbers come per condition; there are no switches for color or font, and the values *Type default* (fill color) and *Default* (font size and font style: the default view font configured in Archi) leave an attribute at the element type's or Archi's default. The child it selects takes the fill color from the preset's palette or a color of its own, *Type default*, *Same as parent* (its parent's fill color, lightened by the condition's *Child lighter per level*; a root container has no parent and keeps its template look, else *Type default*) or *Template*. At a nesting type change or a nesting color change the fill color starts *Darken start container* levels darker and lightens per level deeper. The start element takes the condition's font size and font style; each level deeper in the same condition is smaller by *Child smaller per level* (never below 9 pt) and normal. A font size of *Same as parent* continues from the parent; a font style of *Same as parent* is the parent's. A leaf beside a container counts as a container. The font is the tool's default view font of the run with that size and style, so a re-layout follows a changed default; a re-layout gives every element a condition reaches but gives no font (*Default*) its template look's or the default font. When several conditions select one element the most specific wins, whatever their order. A property match counts as one more point. It is active only when nesting conditions are configured.
- **Style by property**: style conditions, applied in order. A condition says what gets the color (an element by its own property, a relation, or the source / target element of a matching relation), whose property gives the value, and a color scale. Several different values on one object give a *mixed values* color; styled relations may take a fixed line width. When two conditions style one object the dialog flags it, and the last wins.
- **Highlight repeated**: gives each element that appears more than once on the view its own color, over the styling before it. It needs a nesting condition set to *every container*.

Detail: [Appearance tab](reference/gui.md#appearance-tab).

---

## 11. Rules & invariants

The rules of the system (layout integrity, engine isolation, writer discipline, determinism, vocabulary, option semantics, development) are the numbered **View rules** in [`AGENTS.md`](../AGENTS.md#hard-rules) § Hard rules. They go before this specification. This document cites them as *rule N*.

---

## 12. Resilience & error model

- **Engine failure.** If an adapter throws or returns an unusable result, that view fails with its reason. **No partial view is written**, and an existing view of that name is left as it was: a Create action creates or empties its view only after the layout succeeded. Where an algorithm is known to fail on certain graph shapes, the adapter pre-conditions the graph (e.g. cycle or forest pre-processing) rather than letting the engine crash.
- **Target resolution failure.** If a Modify action cannot identify its view, or a Create action cannot create or locate its folder, the run aborts with a message; nothing is written.
- **Empty or invalid selection.** Nothing to place is not an error: the view is skipped with the reason and what to do; no view is written, and a Modify action leaves its view unchanged. Without a selected model the run does not start, and says so.
- **Invalid preset.** Validation repairs its shape: unknown keys are dropped with a warning and missing keys defaulted. It refuses, with a message naming what is wrong and where, a preset with another `schemaVersion` (the message names the expected version) and a condition with an unknown key, type or value: a condition is never skipped, so a typo cannot widen a list to *All*. A refused preset is not loaded; the dialog says so, and a run stops before anything is written.
- **Partial results.** Edges the engine dropped have any stale routing cleared. A nesting that cannot be drawn as containment is drawn as a connection, never left as it was.
- **A failed view** stays with that view: a run of several views (*One view each*, *Regenerate*) makes the others. A failure before the views (an invalid preset or configuration, no folder for new views) stops the run before anything is written.
- **The user is told.** A failed run shows its reason on the console and in a message box from the entry point; the detail goes to the log file. A run ends with a message box when a view failed or was skipped, or no view was written, so the user does not look for a view that is not there; warnings alone stay on the console. A preset that cannot be saved says so; the dialog does not act as if it was saved.
- **One run is one undo step.** One undo reverts everything a run changed, of a failed run too. An engine failure writes nothing (above); a failure while writing or styling can leave the view partly written, and that undo restores it.
- **Managed occurrences.** A record that no longer matches the view is dropped. Removing a managed occurrence removes the connections drawn to it, hand-drawn ones included. A view without records (made before records existed) holds only user content.

---

## 13. Verification & acceptance

A rebuild is accepted when rules 1, 3, 11 and 12 ([§ 11](#11-rules--invariants)) hold in tests, and:

- **Count promise**: the dialog's predicted totals equal the result on the view, object for object (`filtered base + Σ step adds = total`, for elements and for relations).
- **Preset round-trip**: writing then reading a preset yields the same configuration; unknown keys do not survive; defaults fill gaps.
- **Engine failure**: a run whose layout fails writes no view and leaves an existing one as it was ([§ 12](#12-resilience--error-model)).

---

## 14. Development rules

Schema migration and logging are View rules 21 and 22 ([§ 11](#11-rules--invariants)). The rule hierarchy: [`AGENTS.md`](../../../AGENTS.md) § Hierarchy.

---

## Reference

Functional detail per subject; not part of the readable body.

| File | Holds |
|---|---|
| [reference/gui.md](reference/gui.md) | Display-label map, dialog mock-ups and per-control behaviour, generated option tables |
| [reference/presets.md](reference/presets.md) | Preset JSON schema, condition lists |
| [reference/selection-nesting.md](reference/selection-nesting.md) | Selection run order, counting rules, nesting reference, sizing refinements |
| [reference/engines.md](reference/engines.md) | Runtime and engines, layout graph and result, capability matrix, view size per engine, console and log file |
