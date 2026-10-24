# View Generation — Architecture Reference

## Content division

| Document | Holds | Never holds |
|---|---|---|
| [SPEC.md](SPEC.md) | **What** — functional behaviour, contracts, vocabulary, invariants; its appendix holds the functional reference (dialog, preset schema, counting, nesting, generated tables). Implementation-free. | File or function names |
| ARCHITECTURE.md, Part A | The design decisions, each with its reason. | Functional behaviour (SPEC.md), realisation (Part B) |
| ARCHITECTURE.md, Part B | **How** — realisation choices with why and where, module index, known gaps. | Restated code, internal function or variable names, tables the code or a generator holds, change history |
| Code | The details; a header comment per module. | — |
| [README.md](../README.md) | User guide: scripts, presets, tools. | Design |

On a conflict SPEC.md wins.

**Order of change.** A change is agreed with the user and built and verified in code first; after the user's approval the behaviour goes in SPEC.md (its reason in Part A) and the realisation in Part B. Docs and code change in the same commit. The binding steps are in [`Scripts/View/AGENTS.md`](../AGENTS.md) § Docs.

## Marker conventions

The docs use two HTML-comment markers (invisible in rendered Markdown, visible in source):

|&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Marker&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; | Meaning | Lifecycle |
|---|---|---|
| `<!-- @mark: .. -->` | Transient review comment for the next editor/AI to act on. | Acted on, then removed. |
| `<!-- @keep: .. -->` | Permanent guidance — the section has been reviewed and signed off; do not rewrite. | Stays in the document. |

---

# Part A — Design decisions

Why the system behaves as [SPEC.md](SPEC.md) describes, where the choice was not obvious. A changed decision changes SPEC.md in the same commit.

| Decision | Why |
|---|---|
| The set of diagram-object types is closed. | Each type needs explicit handling for filtering, traversal, and rendering. Allowing arbitrary types would defeat the closed-set assumption in the filter UI and in iteration. |
| Non-positional objects — Relations, VisualRelations, and diagram-model-connections — are partitioned from positional objects throughout the pipeline. | An edge has endpoints, not coordinates. Treating any of these as nodes would corrupt the layout graph; the same partition rule applies uniformly to all three kinds. |
| Action is a runtime parameter, not preset content. | A preset is a *configuration*; an action is a *verb*. Sharing presets across selections requires action-agnosticism. |
| View name is a single user-controlled field. `view.suffix` applies to One view each only. | An earlier algorithm-derived suffix silently rewrote the user's typed name on algorithm switch. The current `view.suffix` is a fixed preset value appended to each element name in One view each (e.g. the GGM views' `" (GGM)"`); the Name field is never changed. |
| EXPAND_VIEW's target is derived from the existing visuals, not from the preset name. | The preset name is for *creating* a view. Expanding the selected view is a verb against that specific view, not a name-resolution (SPEC §11, no silent data loss). |
| Folders and view nodes are stripped from the element set before layout. | They are containers in the model browser, not placeable on a canvas. |
| The related-elements panel is multi-step with chain semantics. | Real exploration patterns are stepped: "from processes → get applications → then services". A single step can't express this. Each step's additions feed the next step's input; an empty step terminates the chain so step N+1 cannot bypass step N's intent. |
| A step rule's direction is *either*, *outgoing* or *incoming*, default *either*; an empty step rule list follows every relation. | All three are common needs and *either* is the most common, so the default asks nothing; no rules means no restriction, like every other rule list. |
| A step's Include rule draws a relation on type, direction and previous-step type only; the added type and property only decide which elements join. | Keeps a step's drawn relations predictable from its relation column, and kept migrated steps exactly equal to their old form. |
| Modify actions skip the element filter. | Applying it would hide element types already drawn, sizing containers for a subset while the hidden elements stay outside their bounds. |
| Step relations come from the collection that reached the new elements, not from everything selected so far. | Relations back to earlier steps would otherwise be drawn and could create spurious extra occurrences. |
| Spinner recomputes fire on value-commit, not on keystroke. | Live counts can be expensive (relation traversal). Per-keystroke recompute is wasteful and produces flicker. |
| Selecting a preset applies it at once; there is no Apply button. | The universal pattern for preset pickers (DAWs, IDEs, Lightroom). Apply adds a click without adding safety, since overwriting a preset is a separate Save. |
| A `*` marks settings that differ from the saved preset; switching presets discards changes without a confirm. | Users need to know when Save would do something; with Save and Save As explicit, a confirm on every switch would annoy more than help — the `*` shows the loss before it happens. |
| A Default preset always exists and cannot be renamed or deleted. | The combo is never empty and there is always a safe fallback. |
| Option labels and values name the result, not the engine technique; each value's tooltip gives its trade-off (SPEC §9). | Users choose by what they see. *Straight* and *Compact* named techniques: in a tree *Straight* gave no straighter lines than *Compact*, and its lean towards one corner was not visible from the name. |
| An option is offered for an algorithm only when it has its effect there; where the engine lacks it, the adapter provides it only as a named exception to staying within the algorithm (SPEC rule 18): Tree's layer distance and curved routing, Radial's second run. | One control must behave the same in every algorithm. Tree's engine has neither a layer distance nor line routing; with both greyed out, levels sat at element distance with slanted lines and nothing could be set. |
| An adapter sets only the engine's own options; it may compute their values from the layout graph, but adds no placement, ordering or crossing reduction of its own (SPEC rule 18). | Otherwise the algorithms converge: Twopi, Circo and Radial would each become the adapter's own radial layout, and choosing an algorithm would stop mattering. |
| Tree routing offers *Straight* (no bendpoints; Archi draws the line) and *Splines*; the adapter-drawn orthogonal and polyline lines are gone. | Drawn by hand between mrtree's end points they looked poor next to Layered's routing; a straight line is what the tree itself implies. |
| Layer distance is the space between elements, border to border, in every algorithm (SPEC rule 19). | Twopi's own ring distance is centre to centre, so the same value gave a far tighter view than in Layered; one meaning lets a user move between algorithms without re-tuning. |
| Twopi's centre is the best-connected element of each connected part. | Twopi's own choice ("most central node") can be an element at the edge: on a test view it put the hub on ring 3 with 19 neighbours spread round the outer ring, every line crossing the view. |
| A full Twopi ring is tight at layer distance = element height and follows the layer distance from there, also below (elements then overlap and are pushed apart). | With a fixed minimum the layer distance did nothing on a star (one full ring), against SPEC rule 20. Element height as the reference makes the default spacing a good start. |
| Circo offers **Circles**: *One circle* (default) or *Per cycle*. | Per cycle is circo's own behaviour: on a model with a hub it gave a star with arcs (a hub with 23 of 39 relations). One circle gives a readable overview with the fewest crossings (6 against 13 on that view); Per cycle is what shows separate cycles joined at a shared element or relation. Both are legitimate, so the user chooses. |
| Circo *Per cycle* puts an element of each part's largest cycle in the middle. | Circo's own choice can be an element outside every cycle; circo then sets everything hanging from it as far out as the largest part hanging there. On a test view five roles sat 616–732 px from their team; with the largest cycle in the middle the longest line went from 732 to 343 px and the view from 1772 × 2242 to 1272 × 1317 px. |
| Circo runs a second time when its graph has unconnected parts (SPEC rule 18, named exception). | Circo removes overlap only in a graph of one part; one loose note was enough to leave six pairs of elements overlapping and every line straight. The second run is Graphviz's own overlap removal and routing on circo's positions. A graph of one part gets no second run: it only spread a good layout further. |
| Circo has no aspect ratio. | A ratio stretches the circles into ellipses, and the circle is what circo is for. |
| For Neato, FDP, SFDP and Circo the dialog keeps element distance ≥ 2 × connection–element distance + 2 px; the value the user changed wins. Layered and Tree are free. | Graphviz's router gives up — silently, with straight lines — when a connection with its clearance on both sides does not fit between two elements. Correcting it at run time would hide the dependency (SPEC rule 20); in Layered and Tree connections run between the layers, not between elements of one layer. At exactly 2 × the overlap removal leaves elements exactly `sep` apart, which the router reads as touching; +1 px still failed, +2 px routed in every combination measured on two views. |
| Where connections run between elements (Neato, FDP, SFDP, Circo) element distance is at least 20 px, the shortest connection. | Two ArchiMate end symbols of about 10 px each must fit, or the relation type cannot be read: an assignment's dot and arrowhead lay on top of each other on a 15 px line. |
| Bendpoints of non-orthogonal lines stay 12 px from their elements and 5 px from each other; a line left without bendpoints is drawn straight. | Archi takes an end symbol's direction from the last few pixels of the line. Graphviz's curves start on the element border, so the first sampled bendpoint lay 0–4 px from it: fine at 100 % zoom, a turned arrowhead at 50 %. Orthogonal corners are the route itself and stay. |
| Network has no ELK Force. | Same principle as FDP, but slower, messier, without overlap removal and without routing around elements; Stress stays as the Network algorithm that needs no Graphviz. |
| Stress runs ELK SPOrE after the layout. | ELK Stress ignores the element distance and has no overlap removal (82 overlapping pairs on a 28-element view); SPOrE moves elements apart, positions only — within the no-scaling rule. |
| Neato does not nest. | Neato places elements ignoring clusters in every mode, so a container's box covers elements outside it; `mode=ipsep`, the experimental mode meant for this, crashes (Graphviz 14.1). FDP nests. |
| **Order** (elements outside containers) is separate from **Sort containers**; *Cycle* starts every new view with Selection. | They serve different goals: Sort containers makes a grid read alphabetically, Order gives the algorithm another starting point. Starting each new view from the selection keeps a new view reproducible; cycling on re-layout lets the user click through alternatives. |
| Placement offers *Centred* (default) and *Straight lines*, no balanced straight-line variant. | Measured: the balanced variant equals *Centred* in a tree and gives the fewest straight lines in other graphs — a choice without a distinct result. *Centred* is at least as good in a tree and puts the root in the middle. |
| Algorithm selection uses a style-grouped radio table, not a combo. | All algorithms across all styles are always visible simultaneously. Users scan the full option space without opening a combo; style/algorithm relationships are visible at a glance. |
| Steps start expanded when a preset is loaded. | All rules and their counts are visible at once; a block is collapsed on demand. |
| *Every container* is a per-nesting-rule flag, not a global switch. | Whether a child may have several parents depends on the relation: a composition has one whole, an aggregation or grouping may have many. A global switch could not express both in one view. |
| A relation matching several nesting rules gets *every container* if any of them has it. | Rule order then has no meaning, as for every other rule list; an extra rule can only add occurrences ("a wider filter never yields less"). |
| One-parent choice uses the current view, then names — never model or rule order. | Re-layout keeps elements where the user has them; a fresh view is reproducible and predictable. |
| Extra occurrences are managed and reconciled by every action, including Layout only. | Layout only is for trying layouts without changing the view's content. Extra occurrences are a consequence of the settings, not content; letting them go stale (or not appear) made the *every container* option seem broken on re-layout. |
| Managed occurrences are recorded on the view as placements (element and container chain), not as visual-object ids. | A view copy gives every visual a new id; placements survive it. Only recorded occurrences are removed, so hand-placed duplicates are never lost. |
| Expand view and Layout only lay everything out again by the Layout tab; user content is kept, but its container and position come from the layout. | One source: laying out twice gives the same view, and a setting always shows its effect. Keeping the old container showed a relation both nested and as a line when its nesting rule was off, and with an algorithm that does not nest it left objects outside their container's box, hidden by Archi. |
| A diagram-block keeps its size, appearance and contents; only its position is laid out. | A legend or a titled frame is made by hand; its contents have no relation a nesting rule could select. Laid out one by one, a legend fell apart into loose example elements beside an empty box. |
| A diagram object's connection is laid out with the relations. | Left out, a note had no connection for the layout and was placed loose beside the view (673 px from its element), its line running across it. |
| A relation drawn as nesting loses its other lines on the view. | Containment already shows the relation; a left-over line (from a run where the child had another parent) shows it twice and reads as a second relation. |
| Nesting relations forming a cycle are all drawn as connections. | A cycle is nearly always a modelling error or a double relation; lines between boxes that would contain each other make it visible, where breaking it at one relation would hide it. Nothing disappears, and the rule is order-independent. |
| A connection is drawn once per relation, between the occurrences closest together; one already on the view keeps its ends. | A relation is one fact about two elements; every pair of occurrences multiplied the lines (3,918 for 60 relations on a 128-occurrence test view). The closest pair keeps the line local; keeping the user's ends means re-layout never moves a line to other boxes. |
| A Create action creates or empties its view only after the layout succeeded. | An engine failure must not leave an empty view or destroy the one being overwritten (SPEC §12). |
| Same width per level telescopes from the deepest level (one padding ring per level) and floors containers. | The width a single-column container of that depth would have: well-defined at every level, independent of how wide one busy branch packs; a container that needs more bulges instead of clipping. |
| Snap columns to grid starts tight and widens only where containers collide. | Gaps stay minimal everywhere except where real containers would overlap. |
| Coordinate conversion is engine-agnostic via `parentId` on result nodes. | Each engine handles nesting differently. Carrying parent info on the result is the simplest way to convert without engine-specific code in the orchestrator. |

---

# Part B — Realisation

How the View subsystem realises [SPEC.md](SPEC.md) in jArchi 1.12 (GraalVM JS), SWT and Archi 5. Per subject: the **choice**, **why**, and **where**. The code documents itself; this part is the index and the reasoning behind it.

**Rules for this part.**
- A realisation change is written here after the user approved the built change, in the same commit (order: [Content division](#content-division)). Planned realisation is marked *Target*; what the code does today and SPEC does not want yet is listed under [Known gaps](#b7-known-gaps).
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
                                    resolve nesting → parents, occurrences, nesting bindings,
                                    pairing with the visuals
          ─► generate_view ───────► layout graph: nodes = occurrences, edges = routed relations
          ─► adapter ─────────────► layout result, absolute coordinates
          ─► generate_view ───────► write: reposition / create / remove, bendpoints, nestings,
                                    records ─► appearance ─► view properties
```

| Id | Value | Valid in |
|---|---|---|
| model id | element or relation id | object set, nesting bindings, model lookup |
| occurrence id | element id for the first occurrence, `<element id>_occ_N` for extra ones (an unpaired user visual continues the numbering) | layout graph, layout result, nesting bindings |
| visual id | id of an object on the view | VisualSet, writer |

- An edge carries an edge id (the relation id; `<relation id>_<k>` for the k-th further connection of a relation drawn more than once on the view) **and** the relation id; the writer looks the model up by the relation id.
- Pairing maps occurrence → visual once (pipeline); coordinates, bendpoints and nestings all go through that map.
- **Every nesting binding names occurrences that exist as nodes.** A binding whose occurrence has no node is turned into a connection when the graph is built — otherwise the relation is neither nested nor routed and its visual keeps stale bendpoints.

## B.3 Realisation choices

### SSOT and engine options

- **One registry per algorithm** (engine, style, nesting and self-loop capability, active params, allowed values). Dialog enabling, validation and the generated tables in the SPEC.md appendix derive from it.
- **Effective params.** Inactive params are dropped and locks applied (connections mode) before the pipeline, adapter or writer sees the preset.
- **Engine options, last wins:** engine defaults → GUI params through the adapter's mapping → `engineParams.<Engine>` from the preset (expert override, no dialog control). `engineParams.layout` tunes the engine-independent label sizing.
- **Order** is applied while building the layout graph: the elements outside containers are sorted in place among themselves, and with a sorted order the relations follow the order of their elements. The ELK and Dagre adapters keep that input order outside containers and sort by type and name only inside a container.
- `tools/check_registry.js` checks registry ↔ defaults ↔ dialog widgets; `tools/gen_docs_tables.js` writes the generated tables in the SPEC.md appendix.

### Presets and rule lists

- **File form.** Plain JSON, one rule per line, defaults omitted — a changed rule is one changed line in a diff.
- **Schema version gates loading.** A different `schemaVersion` is refused with a message. A shape change ships with a one-shot, idempotent Node migration in `tools/` that rewrites every preset, `_session.json` included. No conversion at load time.
- Version 3: `everyContainer` per nesting rule replaces `params.showInEveryContainer`; `tools/migrate_presets_everycontainer.js` sets it on every nesting rule of a preset whose global switch was on.

### Selection pipeline

- **Prediction = result.** The dialog's counts and the API call the same exported helpers: step expansion, relation collection, nesting split and resolution, predicted counts.
- **Diagram-blocks** are found on the target view of a Modify action from the parent chain: a diagram object with no diagram object above it, with everything below it. Their contents stay out of the pairing and the layout graph; an element that appears only inside diagram-blocks is not laid out.

### Nesting

- **One resolution** (`resolveNesting`), used by the predicted counts, the dialog's rule counts and the layout graph. No step depends on relation, rule or element order: candidates are taken in relation-id order and every choice compares names and ids.
- **Cycles first.** Strongly connected components (Tarjan) of the candidate graph parent → child; every candidate inside one component is routed and the cycle logged by its element names. What remains is acyclic, so later steps need no cycle checks.
- **Parents per child.** Every parent reached by a relation that matches a rule with `everyContainer` (`RuleLists.matchEveryContainer`: Exclude rules still veto), plus at most one parent from the other relations — a container the child sits in on the target view (`currentContainers`, from the VisualSet; the dialog takes it from the selected view), else by name, then id. All candidates between a chosen parent and the child nest; the rest are routed.
- **Occurrences, parents first.** An element gets one occurrence under each occurrence of each of its parents, so an extra occurrence of a container gets copies of all its children. The first occurrence keeps the element id, the others are `<id>_occ_N`, numbered in parent order.
- **Pairing is part of the resolution**, so the predicted counts, the dialog and the layout graph see the same occurrences, unpaired user visuals included (each a node at view root).
- **Connections between occurrences** (layout graph): an existing visual relation maps its two visuals to their nodes; otherwise the pair is chosen over all source × target occurrences by: not one containing the other, then the deepest common container, then occurrence order.

### Writer

- **Parent-first.** Nodes are written after their parent, so the parent's new bounds exist when a child is converted to parent-relative coordinates.
- **Pairing** comes from the resolution; the writer only follows it. Diagram objects are matched by their own id.
- **Re-parenting** uses the jArchi 1.10 move (`parent.add(existingVisual, x, y)`), which keeps the visual, its appearance and its connections.
- **Connections** are matched per visual pair, each visual relation used once; a visual relation between other visuals is not reused for another pair.
- **Bendpoints** are Archi relative bendpoints (offsets from source and target centres). For reversed relations their order is flipped back to the model direction.
- **Middle labels.** Archi puts a Middle label at the middle point *by index* of source anchor, bendpoints, target anchor. To put it where the engine reserved space, the writer makes the label point a bendpoint and adds collinear bendpoints on the shorter side until both sides hold as many. The drawn route is unchanged.
- **Self-loops** are deleted from the view for algorithms without self-loop support; otherwise the engine's route is used, or a small corner loop when the engine returns none.
- **Connections the engine did not route** get their bendpoints cleared, so switching algorithms leaves no stale routing.
- **Every container counts** when the writer decides whether a visual must move: an element, a group or a note. Only element containers used to be seen, so an element inside a group was written at view-root coordinates while it stayed in the group.
- **Ends inside a diagram-block.** An edge with such an end is laid out at the diagram-block; the layout graph keeps the visual at that end, and the writer connects to it. A line with both ends inside one diagram-block keeps its bendpoints.
- **End room.** Before the label points are added, bendpoints of non-orthogonal lines within 12 px of their element or 5 px of the previous one are dropped. Label points are added from 12 px outside the point where Archi lets the line leave the element (the line from its centre towards the first bendpoint).
- **Nesting connections** (`nestingConnections`, pipeline — pure, tested in Node): per binding the visual relation between the two paired visuals is kept; every other visual relation of a nested relation is deleted.
- Appearance and view properties run after the write. Setting bounds keeps a visual's appearance (verified by `test/test_visual_props.ajs`).

### Managed occurrences

Realises SPEC §7 and its [managed occurrences](SPEC.md#managed-occurrences) reference.

- **Record:** one view property per managed occurrence (duplicate keys, `prop(key, value, true)`).
  ```
  key   : "Managed occurrence"
  value : "<element id> in <container element id> [in <its container element id> …]"
  ```
  The container chain runs from the direct container up to the view root. Model ids survive a view copy (Archi gives every visual a new id); visual ids would not.
- **Capture** (`describeVisuals`, pipeline): per visual its element, parent visual and container chain, and whether it is managed — matched against the records before anything changes, then the edge cases applied (no user content → first visual; user content inside → its containers). The pure part (`classifyVisuals`) runs in Node. The dialog captures the same from the selected view.
- **Pairing** (`resolveNesting`), **adding and removing** (writer, after the nodes are written so a moved child is out first) and **records** (rewritten at the end of the write) follow the SPEC.md steps. The predicted counts include the unpaired user visuals, so the dialog's totals stay exact.
- **Removal** deletes the visual, and Archi removes its connections and children with it; by construction it holds no user content.
- **Every visual gets a node.** An unpaired user visual is laid out at view root; nothing is left behind unpositioned.

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
- **Placement.** *Centred* = network-simplex placement: the shortest total connection length centres an element between its neighbours. *Straight lines* = Brandes-Köpf: each element is aligned with one neighbour, computed from four corners, and the smallest result is kept — hence the lean towards a corner.
- **Tree** (mrtree) has one spacing for siblings and levels, and only two line styles of its own (a stub then a diagonal, or centre to centre); it ignores the general edge-routing option — ELK silently ignores every option an algorithm does not declare. **Layer distance:** every root-level box is widened in the flow direction by layer distance − element distance (a container by padding on both flow sides) and narrowed back after layout, centred — positions only, sizes unchanged; connection ends in the widened part move onto the real side. **Routing:** *Straight* sends no bendpoints, so Archi draws a straight line between the elements; *Splines* is a cubic curve between the end points mrtree chose, sampled to bendpoints. mrtree takes the order of siblings from the order of the relations, not of the elements.
- **Radial** cannot take compound graphs and needs a tree: a breadth-first spanning tree from the best-connected element, with virtual edges joining the components that are never written. Every tree edge points away from the root — ELK takes each node without an incoming edge as a root and stacks those subtrees on one spot — and is turned back to the relation's direction in the result.
- **Radial rings.** ELK puts ring *k* at *k* × step (the largest element diagonal). When the first ring is too small for its elements ELK widens it and moves only the second ring along; deeper rings stay inside the first. The adapter then runs ELK a second time with a fixed radius *R* = (first ring + step) / 2: the first ring keeps its size, the second lands at first ring + *R*, ring *k* ≥ 3 at *k* × *R*, one step outside the ring before. No layer distance (a fixed radius from the dialog has the same flaw) and no compactor (radial compaction depends on input order and can pull a child inside its parent's ring; wedge compaction spreads a depth over several radii). How wide each element's sector on a ring is follows its subtree (Eades) and is not adjustable.

### Dagre and Graphviz adapters

- **Dagre:** `dagre-cluster-fix` for compound graphs; straight and polyline routing only; Dagre itself drops self-loops.
- **Graphviz:** runs the `dot` binary from the PATH as a process (`-K<engine> -Tjson`; stderr goes to a temp file so a full pipe cannot block it); clusters for nesting. No max width — Graphviz `size` scales nodes. Aspect ratio is passed as `ratio`.
- **Line ends.** The start and end of each Graphviz line (the arrow tips when present) are passed to the writer as the points where it leaves and enters the elements; samples of a short curve that round to the same pixel are merged.
- **Spacing in Graphviz units.** `sep` and `esep` are margins in points on every side of an element: `sep` is half the element distance (two elements share it), `esep` the whole connection–element distance (a line has no margin of its own). When `esep` is not below `sep` the router falls back to straight lines with only a warning on stderr — hence the dialog coupling (Part A).
- **Overlap removal.** Neato, FDP and SFDP get `overlap=prism`, which keeps the layout's shape (`vpsc` turned a test view into one tall column); without it Neato keeps overlapping elements and FDP / SFDP leave some closer than `sep`, so the router draws straight lines. FDP with clusters gets none: it removes overlap within clusters itself, and prism only spread the view (+30 %).
- **Cluster boxes** come from Graphviz (dot and fdp emit one per cluster); there is no derivation from member positions.
- **Twopi.** Per connected part the best-connected element gets `root=true`. The ring radii go as a `ranksep` list (radius of ring 1, then each step), computed from a breadth-first walk from the centres: step = layer distance + the largest half diagonal on both rings (a rectangle on a slant reaches further than half its width); a full ring's radius = Σ(width + element distance) / 2π + (layer distance − element height). One list serves every part, so each ring takes the largest radius over the parts. `overlap=vpsc` with `sep` pushes elements that still touch apart (twopi divides a ring by subtree size, not evenly), positions only. `prism` was rejected: it re-spreads the whole layout and pulls the rings together.
- **Circo.** *One circle* is `oneblock=true`. Element distance goes to `mindist` and, as for Neato, to `overlap=prism` with `sep`: `mindist` alone left wide elements overlapping. *Per cycle*: per connected part the element with the most connections inside the largest biconnected component (Tarjan; first in input order on a tie) gets `root=true`; a part without a cycle keeps circo's choice. A graph of more than one part runs `-Kcirco -Tdot`, then `-Kneato -n1` on that output: neato keeps the positions, applies the same `overlap` and `sep`, and routes the lines.

### Appearance

- A separate pass that reads only the written view and the model, so it behaves the same for every action.
- Objects inside a diagram-block are skipped: they keep their appearance.
- Style by property shares its target computation with the dialog's ⚠ check.

### Dialog

- **Configuration is the source of truth;** widgets are a view on it, with one sync in and one save out. Layout params are table-driven (`PARAM_WIDGETS`: param → widget kind), so loading, saving, enabling and tooltips are one loop. Labels, tooltips and "used by" come from `defs`.
- **One rule-table widget** for every rule list. Its checkboxes are drawn on a Canvas: a disabled GTK checkbox keeps its blue tick and looks active, a drawn one turns grey. Counts of an off rule are computed with the rule switched on.
- **Live counts recompute on commit** (selection events, spinner focus-out), never per keystroke.
- **The action runs after the dialog closes:** the settings are saved to the session, then `generate_view` runs. With *Cycle* on, the run's order is set first (Selection for a Create action) and the session gets the next one.
- **Coupled distances** react to the spinners' Selection event, which only the user fires (not `setSelection`), and to every algorithm update — which also runs after a preset is loaded.

## B.4 Persistent state

| What | Where | Notes |
|---|---|---|
| Presets | `presets/**/*.json` | Folders allowed. `_Default` = the code defaults, hidden. `all` = base preset of `View/_*.ajs`. |
| Session | `presets/_session.json` | Last settings plus UI state (`_`-prefixed keys); git-ignored |
| View properties | the generated view | From the Properties tab; optional object-id property |
| Managed-occurrence records | view property `Managed occurrence` | Rewritten by every run; not for editing |

Overwriting a view by name (`NEW_VIEW`) empties it but keeps the view and its properties. The view is created or emptied only **after** the layout succeeded; an engine failure leaves an existing view as it was and creates none.

## B.5 Platform constraints

View-specific jArchi behaviour; general jArchi rules are in [`ai/jarchi-scripting/SKILL.md`](../../../ai/jarchi-scripting/SKILL.md), SWT / GTK in [`swt-gtk.md`](../../../ai/jarchi-scripting/swt-gtk.md) and the repo's dialog style in [`ai/dialog-style.md`](../../../ai/dialog-style.md).

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
| `node Scripts/View/tools/gen_docs_tables.js --check` / `--write` | Generated tables in the SPEC.md appendix |
| `node Scripts/View/tools/nesting_test.js [model.archimate]` | Nesting resolution: several parents, every container, cycles, order independence (also on a model's view in both relation orders); managed occurrences: capture, pairing, connections between occurrences |
| `node Scripts/View/tools/view_harness.js <model.archimate> <view path> [preset] [--on-view] [--layout]` | A view from a model file → pipeline input → nesting → layout graph → engine — not the writer, not rendering; not Graphviz either (its Java stand-in cannot start the `dot` process) |
| `node Scripts/View/tools/preset_diff.js <preset.json> [other.json]` | What a preset and the last dialog run (`_session.json`) differ in, after defaults; params the algorithm does not use are marked |
| Skill `view-testing` ([`ai/view-testing/SKILL.md`](../../../ai/view-testing/SKILL.md)) | Test approach for a reported view |
| [test-cases.md](test-cases.md) | Log of reported view test cases: finding, cause, change, status |
| `test/test_visual_props.ajs`, `test/_test_self_loops.ajs` (in Archi) | Appearance kept by bounds; self-loop drawing |
| Run the action in Archi on a test view | Writer and rendering |

## B.7 Known gaps

Code that does not yet meet SPEC.md. Fixing one removes it here.

1. `viewSizeMode` is inferred for old presets instead of migrated (SPEC delta 1).
2. Adapters are chosen by a fixed switch, not a registry (SPEC delta 4); the dialog is one module (SPEC delta 5).
