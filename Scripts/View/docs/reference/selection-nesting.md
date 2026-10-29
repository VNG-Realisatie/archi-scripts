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
- **Relations partition** on the view: `relations = nestings + connections`.
- **Extra occurrences on non-nesting algorithms** are counted, although these algorithms draw each element once.
- **Everything written is counted.** A diagram-block is laid out as one node, but its contents are counted: its diagram objects as diagram objects, an element only inside it as an element and a standalone. A diagram connection is counted when both its ends are on the view.
- The console prints every field, column-aligned; the dialog's totals line hides zeros.

## Nesting reference

### Containers and connections mode

*Layout inside* arranges the children of each container.
- *Crossing containers* (default) lays the whole hierarchy out as one graph. Connections run straight to the element inside, and crossing minimisation spans all levels.
- *Between containers* lays out each container on its own; connections enter at its border.

**Lock.** Crossing is impossible, and *between* is used (greyed, with the reason) when:
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
| only conditions without it | **One parent.** All such relations of one child together give it at most one parent: the container its user-content occurrence sits in on the view, else the first by name, then by id. The other relations are drawn as connections. |

  Example: a composition from P1 (condition without *every container*) and an aggregation from P2 (condition with it) put the child in P1 **and** in P2.
- **Cycles.**
  - Nesting candidates that together form a containment cycle are **all** drawn as connections; candidates outside the cycle are unaffected.
  - The dialog counts them as *circular*, and the log names each cycle by its elements.
  - To nest part of a cycle anyway, take the other relations out with an Exclude condition.
- **Asymmetric roles.** An element may be a parent in one relation and a child in another; roles are per relation. Diamonds and deep chains follow from the same rules.
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
| Appearance (colours, fonts, line styles): the writer never touches it. The styling pass may reset colours ([SPEC § 10](../SPEC.md#10-colouring--appearance)), never inside a diagram-block | Element size (from the Layout tab) |
| The size of diagram objects and diagram-blocks | Parenthood |
| The style of laid-out connections | Their bendpoints, from the layout result |
| Lines inside a diagram-block | — |

The Create group never modifies the view the selection came from.

## Sizing refinements

### Same width per level

Boxes at the same nesting depth get a common width, so a nested view reads as telescoping frames instead of ragged boxes. It never changes parent or child. *Level*: root boxes are 0; the children of a level-*N* container are *N+1*.

```
W[L] = W[L+1] + ring          (ring = left + right container padding)
```
The whole stack is as narrow as it can be while every level is at least as wide as its widest leaf: with equal leaf widths the deepest level is the leaf width; with *Use label width* the widest label of a level sets the stack, so no label is cut.

A **leaf** takes exactly its level width. A **container** treats it as a floor: if its side-by-side content needs more, it stays wider. In Tiles a leaf beside a container takes the width and left edge of the narrowest sibling container in its column (the boxes stacked with it), after *Columns across containers*, so a leaf among containers reads as one of them.

Example: the deepest branch is `B ⊃ B1 ⊃ B1a ⊃ Bx`; the level-0 container `A` holds two boxes side by side, `A1 ⊃ A1a` and the leaf `A2`; `C` is a lone level-0 leaf. Leaf width 200, ring 20:

| Level | `W[L]` | Leaves | Containers |
|---|---|---|---|
| 0 | 260 | `C` → 260 | `B` → 260; `A` → at least 260, wider to fit its two children |
| 1 | 240 | `A2` → 240 | `B1`, `A1` → 240 |
| 2 | 220 | `A1a` → 220 | `B1a` → 220 |
| 3 | 200 (deepest leaf) | `Bx` → 200 | — |

The widths come from the leaf widths of the layout graph, so no sizing pass is needed. The widths are set before the layout, never after it. It is available only where the engine sizes containers from content ([capability matrix](engines.md#capability-matrix)).

### Columns across containers

Puts every leaf column of the tiles on one shared grid, so columns line up top to bottom across the whole view (Tiles only; independent of the option above).
- Leaves at one x under one parent form a stack. From left to right, each stack takes the leftmost column right of every stack whose box stands beside its own (side by side under a common container), so no stack keeps a column of its own just because it stood further right.
- Each column is as wide as its widest leaf; columns are packed left to right, and every leaf moves onto its column's centre.
- Gaps start at *Distance*. They widen only where sibling boxes (containers and leaves) would overlap, by exactly the overlap, repeated until clean. Boxes that share a column are reported, not widened: a wider gap does not separate them.
- Leaves are moved, never resized; containers are re-wrapped around them.

### Sort

Orders a view with containers (Grid, Pack, Tiles), at every level, always ascending by type and name: *None* keeps the selection order; *Elements* orders the elements and leaves the containers as selected; *Containers, then elements* orders the containers too and puts them first; *All together* puts containers and elements in one list. Where it sorts, it wins over *Algorithm start*. A view without containers is not sorted: *Algorithm start* orders it. Algorithms without Sort (directed views) order the elements inside a container by type and name.
