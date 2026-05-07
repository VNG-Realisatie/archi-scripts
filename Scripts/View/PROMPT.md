# View generation scripts for Archi (jArchi/GraalVM)

## Context

jArchi script project for [Archi](https://www.archimatetool.com), running on GraalVM via the
jArchi plugin. CommonJS modules enabled. Engine must be set to GraalVM in
Edit > Preferences > Scripting.

## Files

| File | Role |
|---|---|
| `include_view.js` | Main layout engine — CommonJS module, required by wrapper scripts and the GUI |
| `_GUI.ajs` | SWT/JFace interactive dialog for setting parameters and running the engine |
| `user_parameter/*.js` | Saved parameter presets (`module.exports = {...}`) |
| `../node_modules/elkjs/index.js` | Synchronous ELK.js wrapper for GraalVM (no Worker thread — uses `Function()` + dispatcher) |
| `../node_modules/dagre-cluster-fix/` | Optional Dagre layout engine (compound + multigraph) |

## Parameter object (`param`)

```js
{
  action:           "Generate" | "GenerateMultiple" | "Expand" | "Layout" | "Regenerate",
  graphDepth:       1,          // relations to follow outward from selection
  includeElementType:  [],      // [] = all; otherwise ArchiMate type names
  includeRelationType: [],
  excludeFromView:  false,      // skip elements with property excludeFromView=true

  layoutReversed:   ["serving-relationship", ...],     // flip layout direction of these rel types
  layoutNested:     ["aggregation-relationship", ...], // render these as compound containers
  nestingMultipleOccurrences: false, // true: child duplicated inside each nesting parent

  elkAlgorithm:     "layered" | "mrtree" | "force" | "box" | "stress" | "radial" | "dagre",
  elkDirection:     "RIGHT" | "DOWN" | "UP" | "LEFT",
  elkSpacingNodeNode: 40,
  elkLayerSpacing:    180,
  elkNodePlacementAlignment: "NONE" | "LEFTUP" | "BALANCED" | "RIGHTDOWN",
  elkEdgeRouting:   "ORTHOGONAL" | "POLYLINE" | "STRAIGHT",
  elkPadding:       20,         // padding inside nested containers
  ranker:           "network-simplex", // Dagre only; not in GUI — set via preset file

  nodeWidth:  200,
  nodeHeight:  60,
  viewName:   "",
  viewNameSuffix: "",
  viewFolder: "",
  debug:      false,
}
```

## Core data structures (built by `_fillGraph`)

```
elkNodeMap     : { [id]: { id, _archiId, width, height, children[], edges[], layoutOptions? } }
elkEdgeList    : [ { id, _archiRelId, sources:[id], targets:[id] } ]
elkParentMap   : { [childId]: parentId }
elkParentRels  : [ archiRelation, ... ]           // nesting relations drawn as connections
occurrenceMap  : { [archiId]: [primaryId, occId_1, ...] }
```

Occurrence nodes have `id = "${archiId}_occ_N"` and `_archiId = archiId`. The original
ArchiMate element is always looked up via `_archiId`.

## ELK path (`_layoutAndRender`)

1. **`_fillGraph`** — recursive traversal up to `graphDepth`; calls `_createNode`, `_createEdge`, `_createParent`
2. **`_buildElkGraph`**:
   - attaches children to parents, sets `elk.padding`
   - classifies edges as **internal** (same compound parent → put in compound's `edges[]`) or **root-level**
   - propagates `layoutOptions` to every compound that has internal edges
   - **lifts** cross-hierarchy root edges to their root-level ancestor IDs — ELK `SEPARATE_CHILDREN` ignores child IDs at root level; original IDs saved in `liftedEdgesMap`
3. **`elk.layout(elkGraph)`** — synchronous call
4. **`_drawView`** — draws nodes recursively, then edges, then nesting connections

### Non-obvious constraints

- **`SEPARATE_CHILDREN`** (default ELK hierarchy mode): sub-layouts each compound independently. Internal edge bendpoints from ELK are **container-relative** and must be offset by the container's absolute position before passing to Archi (`_drawBendpoints` + `containerOffset`).
- **Lifted cross-compound edges** are drawn **straight** (bendpoints skipped): ELK routes them between compound boundaries, not between the actual child elements — those bendpoints produce wrong visuals.
- **`layoutReversed`** swaps `sources`/`targets` in the ELK edge to control layout direction, but `view.add(rel, src, tgt)` must receive the actual ArchiMate relation endpoints — swap back using `isReversed` before drawing.

## Dagre path (`_layoutAndRenderDagre`)

- Reuses `_fillGraph` (same maps). Occurrence nodes work with `nestingMultipleOccurrences=true`.
- **`_buildDagreGraph`**: maps ELK structures to `dagre.graphlib.Graph`; stores `_archiId` on each Dagre node; **skips edges where either endpoint is an occurrence node** (duplicates appear as boxes only, no relations drawn to/from them).
- **`_drawDagreView`**: uses `_archiId` for element lookup; resolves occurrence visuals for nesting connections (see below).
- Dagre coordinates are **center-based**; convert to top-left with `x - width/2`, `y - height/2`.

## Nesting + occurrence-aware connection drawing (both paths)

`elkParentRels` contains one entry per nesting relation. With `nestingMultipleOccurrences=true`
a child has a primary visual and one or more `_occ_N` visuals, each in a different parent.
The nesting connection must target the **occurrence that lives in that specific parent**:

```js
const tgtOcc = occurrenceMap[tgtId].find(occId => elkParentMap[occId] === srcId);
tgtVisual = visualElementIndex[tgtOcc];
```

Applied in both `_drawView` (ELK) and `_drawDagreView` (Dagre).

## GUI (`_GUI.ajs`)

- SWT/JFace `TitleAreaDialog` with **three tabs**: Generate / Layout / Presets
- Window sized to 88% of screen dimensions; tabs wrap in `ScrolledComposite` if content exceeds screen height
- **Persistent strip** between tab folder and button bar: "View to create or update" — `txtViewName` + `lblViewNote` always visible regardless of active tab
- Last-run params saved to `.last_gui_run_params.json` and pre-loaded next run
- Presets stored in `user_parameter/` as CommonJS modules; Presets tab shows diff before applying

### Tab 1 — Generate

- **Action** group: 4 radio buttons; graph depth spinner enabled for Generate/Expand, disabled for Layout
  - Generate (single view) — adds N relation levels of elements from selection
  - Generate (multiple views) — one view per selected element
  - Expand existing view — adds N relation levels to elements already in view
  - Layout only — re-runs layout on current view without adding elements
- **Element filter** multi-select list (`includeElementType`)
- **Relationship filter** multi-select list (`includeRelationType`)
- **Debug** checkbox (bottom of tab)

### Tab 2 — Layout

- **Algorithm** group — two-column layout:
  - Left (`cLeft`): radio list of 7 algorithms — `layered`, `mrtree`, `force`, `box`, `stress`, `radial`, `dagre`
  - Right (`cRight`): Direction / Node Placement / Edge Routing dropdowns (span 4 cols each) + Node W / Node H / Node Sep / Layer Sep spinners (2×2 grid)
  - `updateAlgoControls(algo)` enables/disables Direction, Node Placement, Edge Routing, Layer Spacing based on selected algorithm
- **Nested** group:
  - Container padding spinner (top — not algorithm-dependent, depends on nesting relations)
  - Multi-select list of relation types to render as compound containers (`layoutNested`)
  - "Multiple occurrences" checkbox (`nestingMultipleOccurrences`)
- **Show reversed** group: multi-select list of relation types to flip layout direction (`layoutReversed`)

### Tab 3 — Presets

- **Load** group: list of saved preset files + Apply button + Delete button; shows diff before applying
- **Save** group: `txtSaveName` text field + Save button
- "Save preset…" button in button bar switches to this tab and focuses `txtSaveName`

## Known limitations / suggested improvements

1. **Lifted-edge routing**: cross-compound edges draw straight between child elements. Synthetic bendpoints at compound boundary exit/entry points would improve routing without `INCLUDE_CHILDREN`.
2. **Graph-context object**: `elkNodeMap`, `elkEdgeList`, `elkParentMap`, `elkParentRels`, `occurrenceMap` are passed as five separate arguments to 7+ functions. A single `graphCtx` object would reduce noise.
3. **Dagre `ranker` in GUI**: `network-simplex` / `tight-tree` / `longest-path` noticeably affects Dagre quality but requires a preset file. A dropdown in the Layout tab when "dagre" is selected would make it discoverable.
4. **Junction elements**: sized to `JUNCTION_DIAMETER` (14 px) but treated as small nodes by ELK, not as routing points.
5. **`REGENERATE` action not in GUI**: reads saved `generate_view_param` property from the selected view and re-runs. A button in the Presets tab would make it discoverable.
6. **Undo**: view is rebuilt from scratch (all children deleted, re-added). Wrapping in a single transaction would make the whole render undoable in one step.
7. **Conflicting params**: no check prevents the same relation type appearing in both `layoutNested` and `layoutReversed`; a warning in `_setDefaultParameters` would surface this early.
