---
name: view-testing
description: Use when the user reports that a view generated or laid out by Scripts/View looks wrong ("view X with preset Y looks wrong") — find the model, preset and session, reproduce the layout in the Node harness, find the cause in the adapter or engine, and log the case. archi-scripts View subsystem only.
---

# View test approach

How to work a View test case the user reports. Findings are logged in `Scripts/View/docs/test-cases.md` — add a row per case and update its status.

## Inputs

- **Model:** `/home/mark/Documents/Archi/model-repository/wiki-gemma-model/.git/temp.archimate` — the coArchi working copy: saved, not yet committed (views land under `model/diagrams/` only after a coArchi commit). Compare its mtime with when the user saved. Other models live next to it, e.g. `softwarecatalogus-archi-repository/.git/temp.archimate`; such a file can be a zip archive (`file` says so) — unzip it and use `model.xml`. A test model with multi-parent aggregations: `/home/mark/temp/wiki-gemma-model.archimate`, view `Views/_Generated/Kennismodel (copy)`.
- **View:** a name without a folder is in `Views/Test` (e.g. "Burgerzaken", "Kennismodel-wiki"). A view's folder path = the `<folder name=…>` ancestors of its `ArchimateDiagramModel` element.
- **Preset:** ask which one was used when the user does not name it. `Test/AlgoTree` = `Scripts/View/presets/Test/AlgoTree.json`. Some test presets are untracked (`Test/test-preset.json`, Layered).
- **What actually ran:** the dialog writes the parameters of its last run to `Scripts/View/presets/_session.json`. Settings changed in the dialog are there, not in the preset file.
- **Archi:** install `/home/mark/Tools/Archi/` (5.10); preferences `~/.archi/.metadata/.plugins/org.eclipse.core.runtime/.settings/com.archimatetool.editor.prefs`. The user has "Use orthogonal connection anchors" on.

## Steps

1. **Preset vs. session.** When the user names a preset, show how it differs from the last run: `node Scripts/View/tools/preset_diff.js <preset.json>` (marks params the algorithm does not use).
2. **The view as Archi wrote it.** Element bounds and connection bendpoints from the model file (see Reading a view below).
3. **Reproduce in Node.** `node Scripts/View/tools/view_harness.js <model> "Views/Test/<view>" Scripts/View/presets/_session.json --on-view --layout` — `--on-view` takes the relations drawn on the view, as Layout and Expand do. Params are masked to the algorithm's active ones, as in Archi. The reported size should match the view in Archi; if it does not, compare element sizes first. An engine whose result depends on input order: check `--reverse` and shuffled orders. Graphviz algorithms do not run in the harness (its Java stand-in cannot start the `dot` process): feed `dot -K<engine> -Tjson` the DOT the adapter logs, or measure the view's geometry from the model file. To run the adapter itself in Node, compile `graphviz.js` with its process runner replaced by `child_process.execFileSync("dot", args, { input })`. Compare the console's element count with the harness: the harness leaves diagram objects (notes, groups) out, Archi lays them out — a single loose note changed circo's result.
4. **Find the cause** in the adapter or engine (raw elkjs experiments: `Scripts/node_modules/elkjs/lib/elk.bundled.js`, async `.layout()`), change, and measure again in the harness. Also `Scripts/View/tools/nesting_test.js` for nesting.
5. **The user checks in Archi** — the writer (`generate_view.js`) and rendering are not covered by the harness.

## Reading a view (python3 -I, xml.etree)

- Diagram objects: `<child>` with `<bounds x y width height>` relative to the parent → sum for absolute. `archimateElement` → element (name, `xsi:type`).
- Connections: `<sourceConnection source target archimateRelationship>` with `<bendpoint startX startY>` relative to the **source centre** → absolute = source centre + (startX, startY).
- Extract nodes (id, label, elementType) and edges (id, source, target, label = relation name) to JSON to feed an adapter.

## Running the ELK adapter in Node (from `Scripts/`)

The harness module (`view_harness.js`: loadModel, viewContents, resolve, layoutGraph, layout, summarize) is preferred; for a direct adapter call:

```js
global.Java = { type: n => n.endsWith("Files") ? { readString: p => require("fs").readFileSync(p, "utf8") } : { get: p => p } };
global.__DIR__ = process.cwd() + "/View/lib/engines/";
const ELKA = require("./View/lib/engines/elk.js"), EU = require("./View/lib/engines/engine-utils.js"), Defs = require("./View/lib/defs.js");
const P = Defs.validatePreset(JSON.parse(fs.readFileSync("View/presets/Test/test-preset.json"))).params;
// nodes: width/height = P.elementWidth/Height, then EU.expandNodeSizesForEdgeDensity(nodes, edges, P)
const r = ELKA.layout({ algorithm: "Layered", nodes, edges, engineParams: {}, options: P });
// r.edges[i]: srcPort, bendpoints, tgtPort, labelX/Y (absolute) — measure gaps, jogs, clearances
```
