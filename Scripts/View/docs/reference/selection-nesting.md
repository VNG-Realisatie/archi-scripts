# Selection and nesting — reference

The detail behind [SPEC.md § 6 Selection](../SPEC.md#6-selection) and the nesting part of [§ 7 Layout options](../SPEC.md#7-layout-options).

## Selection run order

The selection turns (selection, preset, action) into the object set for layout. Same input and model → same set. It only reads, never edits a view, and works with sets, not lists (no duplicates).

1. **Open up the selection.** Folders → their contents. Views → their visual contents, split into model concepts and diagram objects. Canvas objects → the concepts behind them. A Modify action also captures the VisualSet of its target view (bounds, appearance, parenthood), before any model traversal, so reposition-vs-create never depends on stage order.
2. **Global filter**: element conditions, relation conditions, diagram conditions (visibility only, SPEC § 6).
3. **Steps**, as a chain (SPEC § 6); step 1 starts from the filtered base.
4. **Elements only**: relations, folders and views leave the element set.
5. **Relations**, collected in two passes, with no relation counted twice:
   - *base*: relations between filtered-base elements that the relation conditions keep;
   - *per run*: relations that a step condition draws between the run's new elements and the collection that reached them. That collection is the step input for the first run and the previous run's elements after that. Relations among one run's new elements, and to earlier-step elements outside that collection, are not collected.
6. **Diagram objects.** A connection of a diagram object (a note's line to an element) is an edge, never a node, and is laid out with the other connections, so the note stays next to what it is about. A Modify action also finds the diagram-blocks on the view; their contents are not laid out.

**Modify actions** skip stage 2 (SPEC § 6); *Layout only* also skips stage 3 and keeps only the relations already drawn on the view. *Expand view* needs elements selected on the view (a view selected in the model tree is refused) and runs the steps from them. It starts from the relations drawn on the view, so no missing relation between elements already there is added, and adds the relations the steps follow. Then every element and diagram object of the view joins, so the whole view is laid out.

## Counting rules

The dialog's live counts and the action use the same selection and nesting logic, so a count is a promise. Before the dialog opens, and on every action, the console prints one grouped block:

```
Selected:    0 elements · 0 relations · 1 view · 0 diagram objects · 0 folders
Containing: 110 elements · 113 relations · 0 diagram objects
Filtered base:    8 elements ·  11 relations · 0 diagram objects
Step 1 adds:    102 elements ·  98 relations
──────────────────────────────────────────────
Total to view:
  elements:    18 containers ·  92 nested elements ·   0 standalones ·   0 extra occurrences
  relations:   11 nestings   ·  98 connections
  diagram:      0 diagram objects · 0 diagram connections
```

- **Exact sums.** `Filtered base + Σ Step N adds = Total`, for elements and for relations. A step's relations are the new relations of its runs (run order step 5), minus any counted before; never a count of raw selection relations.
- **Elements partition.** `elements = containers + nested elements + standalones`. It counts model elements, so *every container* never inflates it. **Extra occurrences** are a separate field.
- **Relations partition** on the view: `relations = nestings + connections`. A self-loop the algorithm does not draw is not on the view, so neither total counts it (its step still does).
- **Extra occurrences on non-nesting algorithms** are counted, although these algorithms draw each element once.
- **Everything written is counted.** A diagram-block is laid out as one node, but its contents are counted: its diagram objects as diagram objects, an element only inside it as an element and a standalone. A diagram connection is counted when both its ends are on the view.
- The console prints every field, column-aligned; the dialog's totals line hides zeros.

## Nesting reference

### Containers and connections mode

*Layout inside* arranges the children of each container.
- *Across containers* (default) lays the whole hierarchy out as one graph. Connections run straight to the element inside, and crossing minimisation spans all levels.
- *Between containers* lays out each container on its own; connections enter at its border.

**Lock.** Across is impossible, and *between* is used (greyed, with the reason) when:
- Layout inside is Grid or Pack: connections into a packed container are not supported, and without them the containers stack in one column;
- a view size is active: a one-graph layout does not pack unconnected elements into rows.

The container choice wins. A preset with a locked combination runs as *between*, and the log says so. With a root Grid or Pack there are no connections between containers, so the option is inactive.

### Roles and parents

- **Role.** A relation matching a nesting condition is a **nesting candidate**; every other relation is a connection. The preset is the only authority; the split is total and deterministic.
- **Direction.** For a nesting, source = parent and target = child. They are swapped when the relation also matches a reverse condition, exactly as reversal flips a connection's layout direction.
- **Several parents**, never decided by condition or model order:

| Relation matches | Outcome |
|---|---|
| a condition with *every container* (wins when the relation matches several nesting conditions) | **Every parent.** The child appears inside this parent whatever its other relations do. Each appearance is its own node mapping back to the same element. An extra occurrence of a container gets its own copies of the container's children. |
| only conditions without it | **One parent.** All such relations of one child together give it at most one parent: the container its user-content occurrence sits in on the view, else the one that joined the object set in the earliest run (the selection first, then each run of each related-elements step in order), else the first by name, then by id. The other relations are drawn as connections. |

  Example: a composition from P1 (condition without *every container*) and an aggregation from P2 (condition with it) put the child in P1 **and** in P2.

  Example: C is part of P1 (composition) and of P2 (aggregation), both conditions without *every container*. Selecting P1 puts C in P1, and P2, reached through C in a later step, gets a line to C; selecting P2 puts C in P2. The selected element is the subject of the view.
- **Cycles.**
  - Nesting candidates that together form a containment cycle are **all** drawn as connections; candidates outside the cycle are unaffected.
  - The dialog counts them as *circular*, and the log names each cycle by its elements.
  - To nest part of a cycle anyway, take the other relations out with an Exclude condition.
- **Asymmetric roles.** An element may be a parent in one relation and a child in another; roles are per relation. Diamonds and deep chains follow from the same rules.
- **Nesting levels.** An algorithm may lay out a limited number of nesting levels (Dagre: two; the view root's elements are level 1). A parent that would put its child deeper is dropped: its relations are drawn as connections, the child sits at the root and can contain its own children. The dialog counts them, and the log names the limit.
- **Container derivation.** A container is any element with at least one child after resolution. It is derived, never declared, and being a container does not change an element's type.
- **Nothing undrawn.** A nesting candidate that does not become containment is drawn as a connection.

### Connections between occurrences

A connection whose source or target has several occurrences is drawn **once**:
- **already on the view**: each connection of the relation on the view keeps its two ends and is laid out;
- **otherwise**: between the pair of occurrences closest together in the container tree. Taken in order: not one inside the other, then the deepest common container, then the first occurrences;
- a self-relation stays a loop on one occurrence.

### Managed occurrences

Every action, *Layout only* too, reconciles them:

1. **Capture.** The VisualSet's occurrences split into **managed** (matching a record on the view) and **user content** (everything else: hand-placed duplicates, occurrences on views made before records existed). The edge cases below turn some managed occurrences into user content. Objects inside a diagram-block take no part: they are neither paired nor removed.
2. **Resolve** the wanted placements: per element its parents, and for extra container occurrences their copied children. Only user content counts as a child's current container.
3. **Pair.** Per element, user content first, then managed. Each prefers the placement with its own container chain, then one with the same direct container, then any. A user occurrence left without a placement stays on the view, at root.
4. **Add and remove.** A placement without an occurrence gets a new, managed one, except the first if the element has no user content. A managed occurrence left without a placement is removed, with the connections drawn to it.
5. **Record.** The view's records are rewritten to describe exactly its managed occurrences.

A **record** identifies a placement: the element and its chain of containers up to the view root, not a visual object. So a copied view keeps its managed occurrences, and a managed occurrence stays managed when another condition takes over its nesting.

Edge cases:
- **Last occurrence.** When all of an element's occurrences are managed, the first in view order becomes user content, so an element never disappears from the view.
- **Moved by the user.** A record that no longer matches the view is dropped; the object, if any, is user content.
- **User content inside a managed container.** The container becomes user content, because it cannot be removed without deleting user content. The run logs it.
- **Hand-drawn connection to a managed occurrence.** It is removed with the occurrence: the system cannot tell it from the connections it drew itself.
- **Same placement twice.** The first matching object in view order is managed; the other is user content.

### Writer parenthood

Each visual's container is decided anew in every run, by the nesting conditions only:
- An occurrence with a parent is drawn inside the visual paired with that parent. Otherwise it goes to view root, also when it sat inside an element or a diagram object before.
- An existing visual under another parent is moved there. It keeps its appearance and connections; its bounds become relative to the new parent.
- Objects inside a diagram-block keep their parent.
- Each occurrence pairs with at most one visual of its element. A leftover managed visual is removed; a leftover user visual stays on the view, at root.
- A nesting's visual relation between the two paired visuals is kept, otherwise added. Every other line of a relation drawn as nesting is removed.

**Kept and decided anew** on Modify actions:

| Kept | Decided anew |
|---|---|
| Appearance (colors, fonts, line styles): the writer never touches it. The styling pass may reset colors ([SPEC § 10](../SPEC.md#10-coloring--appearance)), never inside a diagram-block | Element size (from the Layout tab) |
| The size of diagram objects and diagram-blocks | Parenthood |
| The style of laid-out connections | Their bendpoints, from the layout result |
| Lines inside a diagram-block | — |

The Create group never modifies the view the selection came from.

## Background view

A preset names a background view by its path in the dialog; it is kept by its identity, so a rename or move keeps it, and a path not in the model stops the run with a message. Tiles only, with a nesting condition on (without one nothing can hang under it, and the console says it has no effect). The view the action runs with names it: *Layout only* follows the background view of the current settings, not the one the view was made with.

**What is on the view** (*New view*, *One view each*):
1. Every element of the background view, with the nesting relations between them, and its diagram objects (a diagram-block as one).
2. The selection: start and steps, with the relations they followed.
3. An element of the selection that does not hang under the background view through those relations brings its nesting parents from the model, up to an element of the background view, with the relations between them: parents only, never their other children. The elements are taken in the order they joined, so an element under an earlier one joins with it and climbs not itself.
4. An element that reaches the background view by no path is left out: the start that only asks (a domain grouping) is typical. The console names them.

Only these relations are drawn. An element the selection put under one of its own elements does not also go under another element of the background view the model nests it in.

**Arrangement.** The children of every container on the background view, and the roots of the view itself, are cut by lines that cross no element: a vertical line first, so the children form columns, left to right; else a horizontal line, so they form rows, top to bottom; each part is cut again the same way. A band across its container leaves no vertical cut, so bands become rows, and a column of bands beside another column stays a column. Children no line separates form one stack in reading order. No tolerance in pixels decides it, only overlap.

**Places.**
- A container keeps its arrangement when one of its children on the background view is a container. The children of the other containers are only there: the layout places them, sorted and compact. With **Leaves in place** every container keeps its arrangement.
- In a kept arrangement the children one above the other form a band: as wide as each other, and with nothing beside them as wide as their container, also a leaf. A diagram object keeps its size. The extra width costs nothing, so the layout gives the children of an arrangement their wide shapes too.
- A child the background view does not hold in a kept arrangement comes last, tiled freely; an arranged element not on the view drops out, and an emptied part with it.
- An element of the background view is styled as a container (*Style by nesting level*), also with nothing in it.

**Model and background view differ.** The model leads. A child the background view has under another parent goes where the model puts it; a child of a kept arrangement that is not on the background view comes last. Both are warned on the console, with what to move on the background view.

**Expand view, Layout only** lay out the view in the arrangement of the background view, for the containers on it; they add and leave out nothing.

## Sizing refinements

### Same width

*Off*, *Per level* or *Per level and type* (the last in Tiles only). It is available only where the engine sizes containers from content ([capability matrix](engines.md#capability-matrix)); the widths are set before the layout, never after it.

**Per level.** Elements at one nesting depth get one width, so nested containers telescope. *Level*: roots are 0; the children of a level-*N* container are *N+1*.

```
W[L] = W[L+1] + ring          (ring = left + right container padding)
```
- The stack is as narrow as it can be while every level holds its widest leaf (with *Use label width*: its widest label).
- A leaf takes its level width; a container takes it as a minimum and grows for its contents.
- A diagram object keeps its size: it neither takes nor sets a level width.

Example, leaf width 200, ring 20: deepest branch `B ⊃ B1 ⊃ B1a ⊃ Bx`; `A` holds `A1 ⊃ A1a` and the leaf `A2` side by side; `C` is a lone root leaf.

| Level | `W[L]` | Leaves | Containers |
|---|---|---|---|
| 0 | 260 | `C` → 260 | `B` → 260; `A` → at least 260, wider to fit its two children |
| 1 | 240 | `A2` → 240 | `B1`, `A1` → 240 |
| 2 | 220 | `A1a` → 220 | `B1a` → 220 |
| 3 | 200 (deepest leaf) | `Bx` → 200 | — |

**Per level and type.** As Per level, and at the last [nesting type change](../SPEC.md#2-vocabulary) one width per element type, as narrow as it allows.
- A **block** is an element at a nesting type change with no container at a nesting type change inside it, and not a root's child. In GEMMA: an application service under a business function.
- Every element of a type in a block gets one width: a leaf its own width (a component 240), a container one column of its children plus padding (a service 270, also without children). A block with more columns of children is wider.
- Inside a block, children stacked in one column are centred in their container.

### Columns across containers

One set of columns over the whole view, so columns line up top to bottom (Tiles only). Built on the CSS Grid subgrid model.
- **Columns.** Every leaf stands in one column; a container spans the columns of its contents. Leaves at one x under one parent form a stack; each stack takes the leftmost column right of every stack whose branch stands beside its own.
- **Spacing.** Elements side by side stand *Distance* apart at every depth. A column is as wide as its widest leaf plus the padding of each container edge in it.
- **Padding.** An element lies the paddings of its own ancestors in from a column line where they share that edge; an edge facing a sibling lies on the line. A container drawn to its parent's edge afterwards (a band of a background view with nothing beside it) counts as reaching that edge.
- **Leaves fill their column**, so a row has *Distance* between its leaves. The last leaf of a row at its container's edge is narrower by that container's padding.
- **A leaf beside containers** takes the columns of the narrowest container stacked with it, unless its nearest neighbour left or right is a leaf: then it belongs to that row and fills its own column.
- **A leaf beside a spanning leaf** stays out of the columns that leaf spans.
- **Blocks** (Per level and type) keep their width. A block whose children stand in one column is one element to the grid, centred in its column; one with more columns spans them and closes around its children with its padding, its children each in their column.
- **Centring.** An element that does not fill its column is centred in the part of the column inside its nearest ancestor that is no block, and never in its own parent's padding. So the components of the services in one column line up.
- A container narrower than its label needs widens its last column.

### Sort

Orders a view with containers (Grid, Pack, Tiles), at every level, always ascending by type and name: *None* keeps the selection order; *Elements* orders the elements and leaves the containers as selected; *Containers, then elements* orders the containers too and puts them first; *All together* puts containers and elements in one list. Where it sorts, it wins over *Selection order*. A view without containers is not sorted: *Selection order* orders it. Algorithms without Sort (directed views) order the elements inside a container by type and name.

In Tiles, of arrangements equally compact the simplest wins, with the fewest changes between side by side and one above the other; then the one with full parts first and the rest last. So a sorted container reads in whole columns or rows, and its shortest column or row is the last.
