# View test approach

How to work a View test case the user reports ("view X with preset Y looks wrong").

## Inputs

- **Model:** `/home/mark/Documents/Archi/model-repository/wiki-gemma-model/.git/temp.archimate` — the
  coArchi working copy: saved, not yet committed (views land under `model/diagrams/` only after a
  coArchi commit). Compare its mtime with when the user saved.
- **View:** a name without a folder is in `Views/Test`.
- **Preset:** ask which one was used when the user does not name it. `Test/AlgoTree` =
  `Scripts/View/presets/Test/AlgoTree.json`.
- **What actually ran:** the dialog writes the parameters of its last run to
  `Scripts/View/presets/_session.json`. Settings changed in the dialog are there, not in the preset
  file.

## Steps

1. **Preset vs. session.** When the user names a preset, show how it differs from the last run:
   `node Scripts/View/tools/preset_diff.js <preset.json>` (marks params the algorithm does not use).
2. **The view as Archi wrote it.** Element bounds and connection bendpoints from the model file
   (`<child><bounds>` relative to the parent; bendpoints relative to the source centre).
3. **Reproduce in Node.** `node Scripts/View/tools/view_harness.js <model> "Views/Test/<view>"
   Scripts/View/presets/_session.json --on-view --layout` — `--on-view` takes the relations drawn
   on the view, as Layout and Expand do. Params are masked to the algorithm's active ones, as in
   Archi. The reported size should match the view in Archi; if it does not, compare element sizes
   first. An engine whose result depends on input order: check `--reverse` and shuffled orders.
4. **Find the cause** in the adapter or engine (raw elkjs experiments:
   `Scripts/node_modules/elkjs/lib/elk.bundled.js`), change, and measure again in the harness.
5. **The user checks in Archi** — the writer and rendering are not covered by the harness.

## Test cases

| # | View | Preset | Finding | Status |
|---|---|---|---|---|
| 1 | Begraafplaatsen en crematoria | Test/AlgoTree | 20 px between Tree levels (= Element distance); Layer distance greyed out: mrtree has one spacing for siblings and levels, so `layerSpacing` was not used | Layer distance for Tree in `elk.js` (root boxes widened in the flow direction, narrowed after layout); to check in Archi |
| 2 | Begraafplaatsen en crematoria | Test/AlgoTree | Connections orthogonal-ish but slanted: mrtree routes only AVOID_OVERLAP (stub + diagonal) or MIDDLE_TO_MIDDLE; no orthogonal or splines | Routing for Tree drawn by the adapter (`_routeTreeEdges`): Orthogonal, Splines, Polyline (= mrtree); to check in Archi |
| 3 | radial; 0 Bestuur, Politiek en Ondersteuning | Test/Radial, Test/AlgoTwopi | Radial: 32 of 35 elements stacked (spanning-tree edges kept the relation direction → several roots); after that, depth-3 elements inside the first ring (ELK widens ring 1, moves only ring 2 along). Twopi: elements overlap at a small layer distance. Harness differed from Archi: it did not mask inactive params, so `connectionSpacing` enlarged the hub to 725 px | Tree edges point away from the root; Radial second ELK run with a fixed radius; Twopi `overlap=vpsc`; Radial and Twopi swapped style; harness masks params (`maskPreset`); checked in Archi |
