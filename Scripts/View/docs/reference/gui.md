# Generate View dialog — reference

The detail behind [SPEC.md § 9 UX](../SPEC.md#9-ux--generate-view-dialog): mock-ups, per-control behaviour and the generated option tables. Labels, tooltips, defaults and "Used by" lines come from `lib/defs.js`; the tables marked *generated* are written from it by `tools/gen_docs_tables.js`.

## Display-label map

Internal names never appear in UI labels or button text; tooltips may use them in parentheses. Prose that describes the preset schema uses the GUI labels.

| GUI label | Internal | GUI label | Internal |
|---|---|---|---|
| Relation line | edge | Distance | node spacing |
| Routing | edge routing | Layer distance | layer spacing |
| Label | edge label position | Between | edge-edge / port spacing |
| View, diagram | graph | Distance to element | edge-node spacing |
| Algorithm | algorithm, engine | Padding | container padding |
| Level | rank, layer | Placement | node placement |
| Direction | direction, orientation | Ranking | ranker |
| Nesting | nesting conditions | Cycles | acyclicer |
| Reverse | reverse conditions | Pack | rectpacking |
| Layout inside | container algorithm | Wrap label at | label max line width |
| Same width per level | alignWidthSameType | Snap columns to grid | snapColumnsToGrid |
| View size › Free | no size constraint | Repeat | runs, hops |
| Layout only | re-layout | One view each | per element |
| Preset | parameter file, config file | | |

## Look and feel

These principles hold for the whole dialog (preset row, every tab, totals line, action area) and for every other dialog in the repo. How to realise them in SWT, with the gap sizes in pixels: [`dialog-style.md`](dialog-style.md). Where the dialog does not meet them yet: [ARCHITECTURE § Known gaps](../ARCHITECTURE.md#known-gaps).

**Window.** The dialog is 1000 px wide and as tall as the monitor's usable area (at most 1800 px). Each tab scrolls on its own; the preset row and the action area stay visible.

**Look**
1. **One grammar.** Groups, form rows, condition tables, notes and counts look and behave the same on every tab. The same kind of setting always gets the same kind of control, in the same place.
2. **Left to right, left-aligned.** Labels, headings, notes and column headers are left-aligned, also over several lines. Nothing is right-aligned or stretched, except free-text inputs (name, folder), wrapping notes and the closing button of the dialog (Cancel, bottom right).
3. **One group, one subject.** A group's title names its subject; an opening line of explanation is optional. Two subjects get two groups. Within a group: the main control first (e.g. a condition table), then switches, then numbers, then settings for the whole group. Groups stand out from the page with a slightly lighter background, in a light and a dark theme.
4. **Every control is named.** A label sits right before its control, or the control is a switch that names itself. A unit (px, pt, %) follows its field.
5. **What belongs together sits together.** One row holds the options on one subject. The gap between a label and its control is small; the gap between pairs is clearly larger. An option that depends on a switch sits right behind it (*☐ Use label width  Wrap label at [400]*).
6. **One vertical line per tab.** Row headings (*Size:*, *Order:*) form one column, as wide as the widest heading on the tab, so every row's fields start at the same x. Columns are aligned only within a raster: a table, a radio table, a block of checkboxes, or the first label/control pair of related groups.
7. **Controls keep their own width.** A combo is as wide as its longest item; all number fields have one width. Nothing stretches with the dialog.
8. **Fixed spacing.** One set of gaps for the whole dialog: label → control, pair → pair, heading → first pair, switch → dependent option, between rows, inside and between groups.
9. **Short text, explanation in the tooltip.** Labels and column headers fit on one line. Notes are grey, sit under their subject and wrap at the group width.
10. **Off is grey, the label too.** A setting that does not apply is greyed together with its label and keeps its value; the greying is the only sign. A disabled checkbox is drawn grey, so a ticked box never looks active when it does not apply.
11. **Never cut off.** When a table is wider than the tab, the dialog widens: only wider, within the monitor, never back. On a monitor that is too narrow, the tab scrolls horizontally.

**Feel**
1. **Immediate, honest feedback.** Every count and the totals line update on each committed change and show exactly what the action will write. `*` shows unsaved changes.
2. **No dead ends.** A greyed control says why in its tooltip; a disabled action group says what to select.
3. **Safe without nagging.** Switching presets or tabs needs no confirm. Only what destroys a saved preset asks first: Delete, and Save As or Rename onto another preset.
4. **Calm.** Counts recompute on commit, not per keystroke; the dialog does not jump or resize on every change.
5. **Self-explanatory options** ([SPEC § 9](../SPEC.md#9-ux--generate-view-dialog)): a label names the result, and a tooltip gives the effect and trade-off.

## Dialog reference

```
┌─ Generate View ────────────────────────────────────────────────────────────┐
│ Preset: [Application Flow LR  ▼] *  [Save] [Save As…] │ [Rename…] [Delete] │
│         Views of application flows, left to right             (description) │
│ ┌─[Selection]──[Layout]──[Appearance]──[Properties]─────────────────────┐  │
│ │   (tab content, below)                                                │  │
│ └───────────────────────────────────────────────────────────────────────┘  │
│ On the generated view:                 On the expanded view:               │
│   elements:    24 elements               elements:    31 elements          │
│   relations:   35 connections            relations:   44 connections       │
│ ┌ Create new view ──────────────────┐ ┌ Modify selected view ───────────┐  │
│ │ Folder [/_Generated]  Name [____] │ │ View: Customer journey          │  │
│ │ [New view]     [One view each]    │ │ [Expand view]   [Layout only]   │  │
│ └───────────────────────────────────┘ └─────────────────────────────────┘  │
│                                                         [  Cancel   ]      │
└────────────────────────────────────────────────────────────────────────────┘
```

### Preset row

Above the tab strip, left to right:

- **Preset combo**: every saved preset, also in nested folders (`folder/sub/name`); Default first. Picking one loads all its settings, including values of options its algorithm does not use, so a later Save writes back exactly what was loaded.
- **`*`**: shown while the settings differ from the saved preset, after any change. It also shows on open when the session differs from the preset it came from; the view name is not compared, because it is pre-filled from the selection. Save, Save As and loading a preset clear it.
- **Save** overwrites the current preset.
- **Save As…** asks Name, Folder and Description, writes a new preset and selects it.
- **Rename…** uses the same dialog: it renames or moves the *saved* preset and edits its description. Unsaved changes stay in the dialog and are not written.
- **Delete** deletes the saved preset after a confirm and loads Default.
- **Description line**: the preset's description, grey, under the combo; hidden when empty.

Save As and Rename ask before overwriting another preset. Default is created on first run if absent; Rename and Delete are disabled for it. A preset file holds only the [preset schema](presets.md#preset-json-schema), never the action or dialog state.

### Selection tab

Decides *which* objects feed the layout: the counts at the top, then the global filter, then the steps.

```
┌─[Selection]──[Layout]────────────────────────────────────────────────────┐
│ ┌─ Current selection ─────────────────────────────────────────────────┐  │
│ │  Selected:    3 elements, 2 relations, 1 view, 1 folder;            │  │
│ │               First object: Business Actor: Customer                │  │
│ │  Containing:  12 elements, 8 relations                              │  │
│ │  Filter selection by element type (no Include condition = keep …):  │  │
│ │   On │ Mode    │ Element type                                ✕      │  │
│ │   ☑  │ Include │ All                                         ✕      │  │
│ │   [+ Add condition]  ☐ Match property                               │  │
│ │  Filter selection by diagram type (no Include condition = keep …):  │  │
│ │   On │ Mode │ Diagram type     [+ Add condition]                    │  │
│ │  Filter selection by relations (no Include condition = keep …):     │  │
│ │   On│Mode│Source type│Relation type│Target type   [+ Add condition]  │  │
│ └─────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Expand selection ─────────────────────────────────────────────────┐   │
│ │ ┌──────────────────────────────────────────────────────────────┐   │   │
│ │ │ [▾] Step 1 · Adds: 4 elements · 3 relations   [↑] [↓]   [✕]  │   │   │
│ │ │On│Mode   │Previous step│Direction│Added         │Added    │ │   │   │
│ │ │  │       │elements     │         │relations     │elements │ │   │   │
│ │ │☑ │Include│Grouping     │Outgoing │Aggregation(3)│All (4)  │✕│   │   │
│ │ │ [+ Add condition]  ☐ Match property   Repeat: [1× ▼]         │   │   │
│ │ └──────────────────────────────────────────────────────────────┘   │   │
│ │ ┌──────────────────────────────────────────────────────────────┐   │   │
│ │ │ [▸] Step 2 · 1 condition · Adds: nothing      [↑] [↓]   [✕]  │   │   │
│ │ └──────────────────────────────────────────────────────────────┘   │   │
│ │ [+ Add step]                                                       │   │
│ └────────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Counts.**
- **Selected**: what the user picked, with a suffix `First object: <Type>: <Name>`. An empty selection shows `Selected: nothing`, without the suffix.
- **Containing**: the count after folders and views are opened up.
- **Filter conditions**: each condition's type combo shows how many it keeps on its own, *Grouping (28)*.
- **Adds**: one counter per step, in its header. It shows what the step *adds*, not a running total, and `Adds: nothing` when zero. A collapsed step also names its number of conditions.
- **Step conditions**: the chosen Added relations / Added elements type shows `(n)`, *Aggregation (3)*. That is what the step adds with only that condition (same input, same repeat), so adding or changing another condition never changes it.
- An Exclude condition shows instead what it removes from the other conditions' result.
- Only types with a count above zero are shown.
- Counts update on every change of a condition, on/off, repeat or step order. They use the same selection logic as the action ([counting rules](selection-nesting.md#counting-rules)).

**Conditions that are off.** This applies to every condition table: Selection, Nesting, Reverse and Style.
- A condition that is off is greyed, except its *On* box and ✕.
- Its count stays visible, greyed, and shows what the condition *would* keep, add or remove when switched on.
- Switching a condition on or off updates every count: the active conditions, the off conditions, the step totals and *On the generated view*.

**Global filter.** Three independent condition tables ([condition lists](presets.md#condition-lists)). Each shows the default row `Include | All` when nothing is filtered.
- **Element type**: On · Mode · Element type, plus Property · Value behind *Match property*. *Match property* is on and locked as soon as a condition uses a property.
- **Diagram type**: On · Mode · Diagram type, for the diagram objects of selected views; a view reference matches *reference*. The table is shown only when the selection holds diagram objects; its conditions are kept either way.
- **Relations**: On · Mode · Source type · Relation type · Target type: which relations between the filtered elements are drawn.

**Steps** (GUI title *Expand selection*). A one-line explanation, the ordered steps, and `[+ Add step]` under the last one. Each step is a frame:
- **Header**, on the left: the collapse triangle (▾/▸) and the bold title `Step N`; the title and summary are clickable too. Then the `Adds:` summary. On the right: move (↑ ↓) and, set apart, remove (✕). Their different place and shape keep collapsing and moving apart.
- **Condition table**: On · Mode · Previous step elements · Direction · Added relations · Added elements, plus Property of · Property · Value behind *Match property*. Property and value lists come from the step's candidates (every relation the step saw, before its conditions) that match the condition's types.
- **Footer**: `[+ Add condition]`, *Match property* and **Repeat** (`1×`–`5×` or `until nothing new`). With *until nothing new*, `Adds:` shows `(nothing new after N×)` or `(stopped at max 10×)`.

### Layout tab

Decides *how* objects are positioned; groups follow the order of deciding.

```
┌─[Selection]──[Layout]─────────────────────────────────────────────────────┐
│ ┌─ Algorithm ───────────────────────────────────────────────────────────┐ │
│ │ Flow:       ○ Layered   ○ Dagre    ○ Dot                              │ │
│ │ Hierarchy:  ○ Tree      ○ Radial                                      │ │
│ │ Network:    ○ Stress    ○ Neato    ○ FDP      ○ SFDP                  │ │
│ │ Circular:   ○ Twopi     ○ Circo                                       │ │
│ │ Compact:    ○ Grid      ○ Pack                                        │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Nesting ─────────────────────────────────────────────────────────────┐ │
│ │  Draw these relations as nesting, child inside its parent:            │ │
│ │   On │ Mode    │ Source │ Relation        │ Target │ Every │ Nested │ │ │
│ │   ☑  │ Include │ All    │ Aggregation (62)│ All    │  ☑    │ 37     │✕│ │
│ │   ☑  │ Include │ Driver │ Association (8) │ Driver │  ☐    │ 0      │✕│ │
│ │   [+ Add condition]                                                   │ │
│ │  31 matching relations are drawn as a line: the child already has a   │ │
│ │  parent. A condition with Every shows such a child in every parent.   │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Reverse ─────────────────────────────────────────────────────────────┐ │
│ │  Flip these relations:                                                │ │
│ │   On │ Mode    │ Source │ Relation         │ Target │        │       │ │
│ │   ☐  │ Include │ All    │ All              │ All    │        │ ✕     │ │
│ │   [+ Add condition]  ☐ Match property                                 │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Containers ──────────────────────────────────────────────────────────┐ │
│ │  Layout:   Layout inside [Layered ▼]  Connections [Crossing… ▼]  Padding [20] │
│ │  Options:  ☐ Sort containers                                          │ │
│ │            ☐ Same width per level     ☐ Snap columns to grid          │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Flow ────────────────────────────────────────────────────────────────┐ │
│ │  Order:    Direction [Right ▼]  Cycles [Default ▼]  Ranking [Balanced ▼] │
│ │  Layers:   Placement [Centred ▼]  Circles [One circle ▼]  Layer distance [180] │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Elements ────────────────────────────────────────────────────────────┐ │
│ │  Size:     Width [140]  ☐ Use label width  Wrap label at [400]        │ │
│ │            Height [60]                                                │ │
│ │  Spacing:  Distance [40]                                              │ │
│ │  Order:    [Selection ▼]  ☐ Cycle                                     │ │
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

- **Relation counters.** The Nesting and Reverse tables count, per condition, the relations on the predicted view that it matches on its own, after the chosen relation type: *Aggregation (62)*. An Exclude condition shows what it removes from the other conditions' matches. For nesting, *Nested* shows how many become a nesting; it is empty for a condition that is off. A grey note under Nesting says why the others are drawn as a line: the child already has a parent (one parent per child for conditions without *Every*), the nesting would be circular, or the relation is a self-relation. The counts use the same resolution as the writer.
- **Inactive settings.** A setting the chosen algorithm does not use is greyed and keeps its value; the greying is the only sign. Containers is also greyed until a Nesting condition is on, and its tooltip says so. The explanation of the Nesting and Reverse conditions is the tooltip of those boxes.
- **No Include condition.** A Nesting or Reverse list starts from nothing. With Exclude conditions but no Include condition that is on, a grey note under the table says nothing is nested (or reversed) and that an Include condition is needed. The Mode tooltip states the starting point of its list: a filter keeps all without an Include condition; a feature list picks nothing.
- **Locks.** Connections falls back to *Between containers* (greyed, reason in the tooltip) when Layout inside is Grid or Pack, or a view size is active ([nesting reference](selection-nesting.md#containers-and-connections-mode)). Width and Height are greyed while Use label width is on; Wrap label at applies only with it.
- **Empty Nesting / Reverse.** An empty table shows the default condition switched off, as an example; untouched, it is saved as `[]`. Reverse has an empty cell where Nesting has *Nested*, so the two tables line up.
- **Form rows.** Containers, Flow, Elements and Connections share the tab's heading column. Flow, Elements and Connections form one raster over their first label/control pair; Containers › Options is a full 2×2 raster.

**Algorithms** (generated): five styles in a radio table.

<!-- generated:styles -->
| Style | Algorithms | Tooltip |
|---|---|---|
| Flow | Layered, Dagre, Dot | Optimized for directional flows, dependencies and process chains. Insights: sequence, process models, application flows, service interactions, data models. |
| Hierarchy | Tree, Radial | Optimized for decomposition, containment and nesting structures. Insights: ownership, organisation charts, product breakdown structures, capability decomposition. |
| Network | Stress, Neato, FDP, SFDP | Optimized for interconnected elements without strict hierarchy or direction. Insights: connectivity, clustering, impact propagation, integration networks. |
| Circular | Twopi, Circo | Optimized for cyclic, hub-centred and concentric relationships. Insights: central elements, cycles, radial influence patterns, hub-and-spoke structures. |
| Compact | Grid, Pack | Optimized for overview, grouping and space efficiency with minimal relationship emphasis. Insights: portfolio overviews, catalogs, inventories, high-level landscape summaries. |
<!-- /generated:styles -->

<!-- generated:algorithms -->
| Algorithm | Engine | Nesting | Self-loops | Tooltip |
|---|---|---|---|---|
| Layered | ELK | full | ✓ | Process models, application flows, service interactions with strong directionality and nested containers (ELK) |
| Tree | ELK | full | — | Organisation charts, product breakdown structures, capability decomposition with hierarchical nesting (ELK) |
| Stress | ELK | none | — | Dependency maps and impact analysis emphasising relational distance (ELK) |
| Radial | ELK | none | — | Tree radiating from a central element: every depth on its own circle, each subtree in its own sector. Cycles are cut to a tree (ELK Radial) |
| Grid | ELK | full | — | Portfolio overviews, catalogs and inventories with strong nesting support (ELK) |
| Pack | ELK | full | — | High-level landscape summaries and grouped overviews with strong nesting support (ELK) |
| Dagre | Dagre | partial | ~ | Fast process and application flows with limited nesting support (Dagre) |
| Dot | Graphviz | cluster | ✓ | Hierarchical layered layout with direction control and strong cluster nesting. Supports orthogonal, polyline and spline routing (Graphviz dot) |
| Neato | Graphviz | none | ✓ | Spring-model layout for undirected networks. No nesting (use FDP) and no direction control (Graphviz neato) |
| FDP | Graphviz | cluster | ✓ | Force-directed layout with cluster nesting; connections are routed around clusters (Graphviz fdp) |
| SFDP | Graphviz | none | ✓ | Force-directed layout like FDP, built up over coarser versions of the graph: only gains over FDP on large networks (100+ elements). No nesting (Graphviz sfdp) |
| Twopi | Graphviz | none | ✓ | Network on concentric circles by distance from a central element; every connection kept. No direction control or nesting (Graphviz twopi) |
| Circo | Graphviz | none | ✓ | Elements on circles, ordered so that few connections cross. Suited to cycles (life cycles, control loops, chains that return to their start): Per cycle shows each cycle as its own circle where cycles meet in one element or one relation; One circle gives an overview in which every element counts equally. The model should have many connections spread over its elements and no dominant hub (use Twopi or Radial), hierarchy (use Tree) or flow direction (use Layered). Up to about 40 elements. No direction control or nesting (Graphviz circo) |
<!-- /generated:algorithms -->

**Layout options** (generated). Field = dialog label. Tooltip = its first two lines; the third line, "Used by", is the last column.

<!-- generated:layout-params -->
**Nesting**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Nesting | `nestingConditions` | none | Draw matching relations as nesting: the child inside its parent. — Parent = source of the relation; with Reverse, the target. A child with several parents is nested in one of them; a condition with Every shows it in every parent. Only relations an Include condition picks are nested; Exclude conditions take relations out of those, so Exclude conditions alone nest nothing. | Layered, Tree, Grid, Pack, Dagre, Dot, FDP |

**Reverse**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Reverse | `reverseConditions` | realization, serving, specialization | Flips matching relations. Flow: laid out from target to source, against the Direction in the Flow box; arrows are unchanged. — Nesting: if the relation is also nested, the target becomes the parent. Only relations an Include condition picks are reversed; Exclude conditions take relations out of those, so Exclude conditions alone reverse nothing. | Layered, Tree, Grid, Pack, Dagre, Dot, FDP |

**Containers**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Layout inside | `containerAlgorithm` | Layered | Algorithm that arranges the elements inside each container. — Grid or Pack: Connections is locked to Between containers. | Layered, Tree, Grid, Pack |
| Connections | `connectionsMode` | Between containers | Between containers: each container is laid out on its own; connections enter at its border. — Crossing containers: the whole view is one layout; connections run straight to the element inside. | Layered |
| Padding | `padding` | 20 | Space between a container's border and its contents. — px | Layered, Tree, Grid, Pack, Dot, FDP |
| Sort containers | `sortContainers` | off | Order containers by type and name, as elements always are. — Grid and Pack keep this order; the other algorithms start from it. | Layered, Tree, Grid, Pack, Dagre |
| Same width per level | `alignWidthSameType` | off | Give all boxes of one nesting level the same width. — Each parent level is one padding step wider; a container never gets narrower than its contents. | Layered, Tree, Grid, Pack |
| Snap columns to grid | `snapColumnsToGrid` | off | Line columns up top to bottom on one grid across the whole view. — Each column is as wide as its widest element; element sizes are unchanged. | Grid, Pack |

**Flow**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Direction | `direction` | Right | Direction of the main flow. | Layered, Tree, Dagre, Dot |
| Cycles | `acyclicer` | Default | How relation cycles are broken before layout. — Default: depth-first search. Greedy: a heuristic that reverses few relations. No effect without cycles. | Dagre |
| Ranking | `ranking` | Balanced | How elements are assigned to layers. — Balanced (network simplex): short connections. Uniform (longest path) and Top-aligned (tight tree): faster. | Dagre |
| Placement | `nodePlacement` | Centred | Where elements sit within their layer. — Centred: between the elements they connect to. Straight lines: lined up with one neighbour, leaning to one side. | Layered |
| Circles | `circles` | One circle | How the elements are divided over circles. | Circo |
| Layer distance | `layerSpacing` | 60 | Space between the elements of successive layers along the flow; Tree: between levels; Twopi: between rings. — px — Tree: at least Distance between elements; Twopi: a full ring is tight at element height and grows and shrinks with Layer distance; with Reserve label space a gap widens to fit its labels. | Layered, Tree, Dagre, Dot, Twopi |

**Elements**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Width | `elementWidth` | 200 | Width of every element. — px — not used with Use label width. | all algorithms |
| Height | `elementHeight` | 60 | Height of every element. — px — not used with Use label width. | all algorithms |
| Use label width | `labelSizing` | off | Size each element to its label; long labels wrap to two lines. — Replaces Width and Height. | Grid, Pack |
| Wrap label at | `labelMaxLineWidth` | 400 | Label width at which Use label width wraps to a second line. — px — only with Use label width. | Grid, Pack |
| Distance | `elementSpacing` | 40 | Minimum distance between elements, also between unconnected groups. — px — Neato, FDP, SFDP, Circo: at least 2 × Distance to element + 2, so a connection fits between two elements, and at least the shortest connection that shows both end symbols; the other value follows. | all algorithms |
| Order | `elementOrder` | Selection | Order in which the elements outside containers go into the layout; another order gives the algorithm another starting point. — Inside a container the container's own order holds. | all algorithms |
| Cycle | `cycleElementOrder` | off | Each layout of an existing view takes the next order: Selection, Name △, Type and name △, Name ▽. — A new view always starts with Selection. | all algorithms |

**Connections**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Routing | `routing` | Orthogonal | How connection lines are drawn. | Layered, Tree, Dot, Neato, FDP, SFDP, Circo |
| Label | `labelPosition` | Middle | Where the connection label sits. | Layered, Tree, Dagre, Dot, Neato, FDP, SFDP, Twopi, Circo |
| Reserve label space | `connectionLabelSpacing` | on | Keep connection labels clear of other labels, connections and elements. — A layer gap widens where a label needs label + 2 × Between. | Layered |
| Between | `connectionSpacing` | 25 | Distance between parallel connections, and between connection points on one side of an element. — px — elements grow to fit their connections; 0 = no growth. | Layered, Tree, Dagre |
| Distance to element | `connectionElementSpacing` | 40 | Minimum distance between a connection and the elements it passes. — px — the first and last bend stay at least 25 from the element, clear of the end symbol. Neato, FDP, SFDP, Circo: at most half of (Distance between elements − 2); the other value follows. | Layered, Tree, Neato, FDP, SFDP, Circo |

**View size**

| Field | Parameter | Default | Tooltip | Used by |
|---|---|---|---|---|
| Aspect ratio | `aspectRatio` | 1.78 | Arrange the layout toward this width-to-height ratio. — Element sizes are unchanged. | all algorithms except Radial, Dagre, Circo |
| Max width | `maxWidth` | 0 | The view is at most this wide: a wider layout is arranged in more rows. — px — element sizes are unchanged. | Layered, Tree, Grid, Pack |
<!-- /generated:layout-params -->

**Preset-only options** (generated) have no dialog control, because they hardly change the view. A preset can still set them, and a run logs a value that differs from the default (*"Preset values not in dialog: diagramPadding=20"*).

<!-- generated:preset-only -->
| Parameter | Default | Used by |
|---|---|---|
| `diagramPadding` (Diagram padding) | 10 | all algorithms |
<!-- /generated:preset-only -->

### Appearance tab

```
┌─[Selection]──[Layout]──[Appearance]──────────────────────────────────────────┐
│ ┌─ Style by property ─────────────────────────────────────────────────────┐  │
│ │ Color elements or relations by property values. Each condition says what  │  │
│ │ gets the color and whose property gives the value.                        │  │
│ │ On│Color          │Source  │Relation   │Target │Property of│Property│Range │  │
│ │ ☑ │Element (own…) │App Comp│ —         │ —     │ —         │Status  │Blues▓│✕ │
│ │ ☑ │Relation       │All     │Flow       │All    │Relation   │Volume  │Reds ▓│✕ │
│ │ ☑ │Source element │All     │Serving    │All    │Relation   │Priority│OrRd▓⚠│✕ │
│ │ [+ Add condition]                                                         │  │
│ │ ⚠ Conditions 3, 4 style the same objects. The last condition wins. …     │  │
│ │ Mixed values color: [#FF6B35 ▪]   Line width of styled relations: [▼]     │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Style by nesting level ────────────────────────────────────────────────┐  │
│ │  Adjust font size and color based on nesting level. Containers at the   │  │
│ │  same level look the same.                                              │  │
│ │  ☑ Change font size with nesting level [14 ▲▼]  ☑ Bold                  │  │
│ │    Decrease/level: [2 ▲▼] pt                                            │  │
│ │  ─────────────────────────────────────────────────────────────────      │  │
│ │  ☑ Change color by nesting level [#2B5796] ▪  Lighten/level: [15 ▲▼] %  │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
│ ┌─ Highlight repeated elements ───────────────────────────────────────────┐  │
│ │  Elements that have multiple occurrences get the same color.            │  │
│ │  ☑ Enable  Color range: [Pastel1 ▼] [====]                              │  │
│ └─────────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Style by property.** One condition table ([style conditions](presets.md#condition-lists)).
- A condition is active when it is on and has a property.
- Its Property combo shows how many objects on the predicted view the condition colours, *Status (14)*. Before a property is chosen, it shows just *(n)*: the objects the condition reaches.
- A condition that is off shows what it would colour and takes no part in the ⚠ check.
- Unique values are sorted and mapped to evenly spaced colours of the condition's colour range. An object with several different values gets the *mixed values* colour.
- Relations coloured by a *Color = Relation* condition take the fixed line width, when one is chosen.
- Where two conditions style the same object, the later wins, and the dialog marks both with ⚠ (computed on the predicted view).
- The row tooltip reads the condition as a sentence.
- **Reset on Expand view / Layout only**, when there is at least one style condition (on or off): first every element's fill, and every relation's line colour and width, is reset on the view. Then the active conditions colour again, so a changed condition never leaves colours of an earlier run behind. Colours set in the same pass by nesting level or highlight repeated are kept; colours set by hand on the view are lost. Without style conditions, nothing is reset.

**Style by nesting level.** Active only when a Nesting condition is on; otherwise an informational label replaces the controls. Two rows, font and colour; the spinner after the font switch is the root size, and the field after the colour switch the root colour.
- **Font.** Root containers (depth 0) get the root size, bold if set. Each deeper level gets the root size minus depth × decrease, never below the tool's default (9 pt). Containers only.
- **Colour.** Each chain uses its root container's current fill as the darkest anchor, or the root colour when the container has no fill; with neither, the chain is skipped. Each level inward is lightened by *Lighten/level* % toward white. Leaves of the chain's type are coloured at their own depth too.
- **Type chain.** Each root container defines its chain's type. Styling applies only to objects of the root's type whose whole ancestor chain back to the root has that type: font to containers, colour to containers and leaves. A container of another type breaks the chain: neither it nor any descendant is styled.

**Highlight repeated elements.** Gives each element that appears more than once on the view its own fill colour from the range. It needs a nesting condition with *Every*. Enable and range are on one row.

**Colour ranges.** Every range combo offers the same set of ColorBrewer schemes, with a gradient preview strip that repaints on change.

### Properties tab

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

- One row per property key found on any view of the model, except *Object ID*: a checkbox, the key, and an editable combo of all values found for that key. Nothing is pre-selected.
- After layout and styling, every enabled row's value is written to the generated view. An enabled row without a value removes that key from the view. Disabled rows are ignored: they never touch the view. The preset keeps every configured row, enabled or not.
- **Object ID.** When checked and the view has no *Object ID* property, a new unique id is written; an existing one is never overwritten. *One view each* gives each view its own id.

### Totals line and action area

**Totals line**: between the tabs and the actions, always visible, in two columns that start above the two action groups:
- left, *On the generated view*: what *New view* puts on a new view;
- right, *On the expanded view*: what *Expand view* leaves on the selected view; empty when *Expand view* is disabled.

*Layout only* has no column: it writes what is on the view, which *Current selection* on the Selection tab already counts. Both columns use the console's grouped form ([counting rules](selection-nesting.md#counting-rules)) with zeros hidden: a field with value 0 is omitted, and a sub-line whose fields are all 0 is skipped. A sub-line too long for its column wraps between fields and continues under its counts. They refresh on every dialog change; the selected view's content is read once, when the dialog opens.

**Action area**: two groups with the same rows (one field row, one button row), so fields and buttons line up. Cancel sits below, bottom right, as wide as a Modify button.
- **Create new view**: *Folder* and *Name* (this group only), *New view*, *One view each*.
- **Modify selected view**:
  - *View: \<name\>* names the target: the view of the selected canvas objects, or a view selected in the model tree;
  - *Expand view* is enabled only when objects on the view are selected, because it expands from them;
  - *Layout only*;
  - without a target, the line says what to select and the buttons are disabled.
- **Cancel** discards changes and remembers UI-only state (the active tab) for the next open.

| Action | View name and folder |
|---|---|
| **New view** | Name from the Name field, pre-filled with the first selected object. Folder from Folder, a path under Views (`/_Generated/Project`; empty = `/_Generated`). A view with that name in the folder is overwritten. |
| **One view each** | One view per element, named after the element plus the preset's suffix (e.g. `" (GGM)"`); Name is not used. |
| **Expand view / Layout only** | The selected view itself; Folder and Name are not used. |

### Interaction rules

The rules not covered above:

- **Commit, not keystroke.** Live counts recompute on value-commit (arrow click, focus loss).
- **Coupled distances.** For Neato, FDP, SFDP and Circo (connections run between the elements):
  - Distance (elements) stays at least twice Distance to element plus 2 px, and at least the shortest connection ([SPEC § 7](../SPEC.md#7-layout-options)).
  - The value the user changes wins; the other follows.
  - Switching to one of these algorithms, or loading a preset for one that breaks the rule, lowers Distance to element at once (and raises Distance to the shortest connection when below it). The `*` then shows the change.
- **Cycle.** An action saves the order for the next run in the session, so the dialog shows the order the next layout will use.
- **Empty selection** opens normally, with all counts zero; actions still run.
- **Malformed preset.** It never aborts the dialog: unknown keys are dropped and missing keys get defaults. An invalid session falls back to the defaults.
