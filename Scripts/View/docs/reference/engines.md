# Engines — reference

The detail behind [SPEC.md § 8 Engine contract](../SPEC.md#8-engine-contract).

## Runtime and engines

- **Runtime:** a JavaScript script for the Archi modelling tool (jArchi 1.12 / GraalVM JS), with an SWT/GTK dialog.
- **Node layout:** the engines run in a Node process when `node` is found (the PATH, or `config.js`), else in Archi; the same result either way.
- **Engines:**
  - ELK: Layered, Tree, Stress, Radial, Grid, Pack;
  - Tiles: Tiles (no layout engine: the adapter tiles the nesting itself);
  - Dagre: Dagre;
  - Graphviz: Dot, Twopi, Neato, FDP, SFDP, Circo.

## Layout graph and result

```
LayoutGraph {
  algorithm : enum
  nodes : [{ id, label, elementType, width, height,   // leaves sized; containers sized by the engine
             labelHeight,                             // room a container's label takes above its contents; 0 otherwise
             minWidth,                                // narrowest a container may be for its label; 0 for a leaf
             parent : nodeId | null }]                // nesting
  edges : [{ id, source, target,                      // already swapped for reversed relations
             label, labelWidth, labelHeight,          // text size of the label in its font; 0 without one
             weight }]                                // weight: hint per relation type
  options : object                                    // per-algorithm parameters
  maxWidth, aspectRatio : number                      // only the active one non-zero
  alignWidthSameType, columnsAcrossContainers : boolean
  sort? : string                                      // None | Elements | Containers, then elements | All together; absent: no Sort
}
LayoutResult {
  nodes : [{ id, x, y, width, height, parentId }]     // ABSOLUTE
  edges : [{ id, sourceId, targetId,
             bendpoints : [{ x, y }],                 // ABSOLUTE
             isStraight : boolean,
             labelX, labelY : number }]               // 0,0 = no placement
}
```

- The writer draws each connection against its model relation. When the graph reversed a relation, the writer orders the bendpoints by the model relation's source and target.
- Element labels sit inside their node at the standard position. A container's contents start below its `labelHeight` (without a label: below the padding). An engine draws a container no narrower than its `minWidth`, also on the column grid of *Columns across containers*. Dagre is the exception: it sizes a container from its children and keeps no room for its label.
- With *Reserve label space*, the layout reserves room for each connection label between element layers, and the label is drawn there. Across the flow the reserved box is only what the text needs beyond the connection spacing to keep 5 px between two labels, and between a label and an element.
- In Layered, the elements of a layer are centred on it, so elements of one width stay in a straight column when a label or a wider element widens the layer.

## Capability matrix

Each algorithm declares:
- a style (UI grouping only);
- a nesting capability (full / partial / cluster / none), optionally its number of nesting levels (Dagre: two), and a self-loop capability;
- its active options and the allowed values of its select options.

An option outside the active set is greyed in the dialog, keeps its value, and is ignored at run time. The matrix is generated from the registry. ✓ active · — greyed out in the dialog.

<!-- generated:capability-matrix -->
| Parameter | Layered | Tree | Stress | Radial | Grid | Pack | Tiles | Dagre | Dot | Neato | FDP | SFDP | Twopi | Circo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Selection order `selectionOrder` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cycle selection order `cycleSelectionOrder` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Nesting `nestingConditions` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| Reverse `reverseConditions` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| Layout inside `containerAlgorithm` | ✓ | ✓ | — | — | ✓ | ✓ | — | — | — | — | — | — | — | — |
| Connections `connectionsMode` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Padding `padding` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | ✓ | — | ✓ | — | — | — |
| Sort `sort` | — | — | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| Same width per level `alignWidthSameType` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| Columns across containers `columnsAcrossContainers` | — | — | — | — | — | — | ✓ | — | — | — | — | — | — | — |
| Direction `direction` | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | — | — |
| Cycles `acyclicer` | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Ranking `ranking` | — | — | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Placement `nodePlacement` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Circles `circles` | — | — | — | — | — | — | — | — | — | — | — | — | — | ✓ |
| Layer distance `layerSpacing` | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | — | — | — | ✓ | — |
| Width `elementWidth` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Height `elementHeight` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Use label width `labelSizing` | — | — | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| Wrap label at `labelMaxLineWidth` | — | — | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| Distance `elementSpacing` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Routing `routing` | ✓ | ✓ | — | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| Label `labelPosition` | ✓ | ✓ | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Reserve label space `connectionLabelSpacing` | ✓ | — | — | — | — | — | — | — | — | — | — | — | — | — |
| Between `connectionSpacing` | ✓ | ✓ | — | — | — | — | — | ✓ | — | — | — | — | — | — |
| Distance to element `connectionElementSpacing` | ✓ | ✓ | — | — | — | — | — | — | — | ✓ | ✓ | ✓ | — | ✓ |
| Aspect ratio `aspectRatio` | ✓ | ✓ | ✓ | — | — | — | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Max width `maxWidth` | ✓ | ✓ | — | — | ✓ | ✓ | ✓ | — | — | — | — | — | — | — |
| Diagram padding (preset only) `diagramPadding` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| **Self-loops** (capability) | ✓ | — | — | — | — | — | — | ~ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
<!-- /generated:capability-matrix -->

**Self-loops** is a capability, not an option:
- ✓ = routed, by the engine or as a small corner loop drawn by the writer;
- ~ = partial: the engine tries, and the writer draws the loop on failure;
- — = not drawn: left out of the layout graph and removed on re-layout.

## Per-engine view-size

| Engine | Max width | Aspect ratio |
|---|---|---|
| ELK Layered, Tree, Grid, Pack | Upper bound, met by re-arranging (more rows); Grid and Pack offer Max width only. When unreachable (connection chains or the widest container set the width), the narrowest layout is used and reported | Met approximately by re-arranging |
| Tiles | The widest arrangement that fits, with Columns across containers applied; when unreachable the narrowest layout is used and reported | Met approximately: the arrangements closest to it are placed and measured. Free leans toward portrait |
| ELK Stress | Not supported | Met approximately by re-arranging |
| ELK Radial | Not supported | Not supported: the engine has no such option |
| Graphviz | Not supported: it can only widen a layout without scaling | Passed as a ratio hint; not for Circo (circles would become ellipses) |
| Dagre | Not supported | Not supported |

Engines meet a target by arranging elements differently, never by scaling coordinates. A target that cannot be met is reported, not forced.

## Console and log file

The console is for the user, the log file for troubleshooting. Levels: INFO (progress and results) and WARN and ERROR go to both; DEBUG only to the log file.

**Console.** A line of `=` opens and closes every run; lines wrap at 80 characters (a path is never broken).

| Block | Lines |
|---|---|
| Start of the script | `Script:`, `Platform:` (Archi, jArchi, JavaScript engine, platform) |
| `View generation: <action>` | `Preset:` (modified, direction from the script name), `Selection:` (what is selected in Archi: kinds, where, and for *One view each* the number of views), `Settings:` (algorithm, direction, nesting, view size; preset values not in the dialog), `Target:`, `Log file:` (its name) |
| Per view: `✓` / `⚠` / `–` / `✗` and *New*, *Updated*, *Overwritten*, *Skipped* or *Failed*, the view and its folder | `Filtered base:` (or `Base:` for a Modify action), `Step adds:`, `On view:` (elements with containers and nested elements, nestings, connections, diagram objects), `Size:` (px and time); then the view's warnings and errors |
| End | `Result:` (generated, with warnings, skipped, failed), `Duration:`, `Log file:` with the full path on the line after it |

- A warning or error has three parts, each on its own line: what happened, `Effect:` and `Action:`. A warning repeated within a view (a layout run again) is shown once.
- `⚠` before a view: it has warnings. The dialog's settings and the engine's options are in the log file only.

**Log file.** One file per run in `logs/archi-scripts/` under Archi's workspace folder (`~/.archi` on Linux), named `<yyyyMMdd-HHmmss>-<preset>.log` (the script's name when a run has no single preset); the newest 20 are kept, and above 10 MB a file takes only WARN and ERROR. The first line has the start time, the last the end time and duration; every other line is `<LEVEL> [<context>] <text>`, the context `run` or `view <n> "<name>"`. It holds every console line and the orchestration steps below, each with one blank line, a header and detail lines indented two spaces:

| Step header | Covers |
|---|---|
| `=== generate_view ===` | Action, algorithm, options, view name and folder, requested view size |
| `Pipeline — build object set:` | Filtered base, step adds, totals ([counting rules](selection-nesting.md#counting-rules)) |
| `Layout graph:` | Relation roles (nestings · connections), nestings applied, cycles |
| `View target:` | Modify actions: the view identified (before the layout graph) |
| `Layout:` | Engine passes, width alignment, where the layout ran (`Layout in Node: … ms layout · … ms process`, or `Layout in Archi:` with the reason), layout result, view size |
| `View target:` | Create actions: the view created or overwritten, after the layout succeeded |
| `Write:` | Nodes written (extra occurrences included), connections, final counts, `View "…" written`; each write step that failed |
| `Timing:` | Time per phase: selection, view target, layout graph, layout, write, appearance; then `generate_view:` with the total |

- The dialog logs one block before it opens (Selected / Containing / Filtered), not on widget changes.
- There is no debug flag. Width-alignment and container-offset mismatches are always logged with `⚠`.
- A failure's stack is in the log file only.
