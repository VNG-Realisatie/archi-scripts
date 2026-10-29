# Engines — reference

The detail behind [SPEC.md § 8 Engine contract](../SPEC.md#8-engine-contract).

## Runtime and engines

- **Runtime:** a JavaScript script for the Archi modelling tool (jArchi 1.12 / GraalVM JS), with an SWT/GTK dialog.
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
             parent : nodeId | null }]                // nesting
  edges : [{ id, source, target,                      // already swapped for reversed relations
             label, weight }]                         // weight: hint per relation type
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
  viewWidth, viewHeight : number
}
```

- The writer draws each connection against its model relation. When the graph reversed a relation, the writer orders the bendpoints by the model relation's source and target.
- Element labels sit inside their node at the standard position.
- With *Reserve label space*, the layout reserves room for each connection label between element layers, and the label is drawn there.

## Capability matrix

Each algorithm declares:
- a style (UI grouping only);
- a nesting capability (full / partial / cluster / none) and a self-loop capability;
- its active options and the allowed values of its select options.

An option outside the active set is greyed in the dialog, keeps its value, and is ignored at run time. The matrix is generated from the registry. ✓ active · — greyed out in the dialog.

<!-- generated:capability-matrix -->
| Parameter | Layered | Tree | Stress | Radial | Grid | Pack | Tiles | Dagre | Dot | Neato | FDP | SFDP | Twopi | Circo |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Algorithm start `algorithmStart` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cycle algorithm start `cycleAlgorithmStart` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
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

## Console logging

Each orchestration phase is a step: one blank line, a header at root indent (`Step name:`), and detail lines indented two spaces. The final `View "…" written` line is at root indent.

| Step header | Covers |
|---|---|
| `=== generate_view ===` | Action, algorithm, options, view name and folder, requested view size |
| `Pipeline — build object set:` | Filtered base, step adds, totals ([counting rules](selection-nesting.md#counting-rules)) |
| `Layout graph:` | Relation roles (nestings · connections), nestings applied, cycles |
| `View target:` | Modify actions: the view identified (before the layout graph) |
| `Layout:` | Engine passes, width alignment, layout result, view size |
| `View target:` | Create actions: the view created or overwritten, after the layout succeeded |
| `Write:` | Nodes written (extra occurrences included), connections, final counts |
| `Timing:` | Time per phase: selection, view target, layout graph, layout, write, appearance; then `generate_view:` with the total |

- The dialog logs one block before it opens (Selected / Containing / Filtered), not on widget changes.
- There is no debug flag. Width-alignment and container-offset mismatches are always logged with `⚠`.
