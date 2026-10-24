# View test approach

How to work a View test case the user reports ("view X with preset Y looks wrong").

## Inputs

- **Model:** `/home/mark/Documents/Archi/model-repository/wiki-gemma-model/.git/temp.archimate` — the
  coArchi working copy: saved, not yet committed (views land under `model/diagrams/` only after a
  coArchi commit). Compare its mtime with when the user saved. Other models live next to it, e.g.
  `softwarecatalogus-archi-repository/.git/temp.archimate`; such a file can be a zip archive
  (`file` says so) — unzip it and use `model.xml`.
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
   Graphviz algorithms do not run in the harness (its Java stand-in cannot start the `dot`
   process): feed `dot -K<engine> -Tjson` the DOT the adapter logs, or measure the view's geometry
   from the model file. To run the adapter itself in Node, compile `graphviz.js` with its process
   runner replaced by `child_process.execFileSync("dot", args, { input })`. Compare the console's
   element count with the harness: the harness leaves diagram objects (notes, groups) out, Archi
   lays them out — a single loose note changed circo's result.
4. **Find the cause** in the adapter or engine (raw elkjs experiments:
   `Scripts/node_modules/elkjs/lib/elk.bundled.js`), change, and measure again in the harness.
5. **The user checks in Archi** — the writer and rendering are not covered by the harness.

## Test cases

| # | View | Preset | Finding | Status |
|---|---|---|---|---|
| 1 | Begraafplaatsen en crematoria | Test/AlgoTree | 20 px between Tree levels (= Element distance); Layer distance greyed out: mrtree has one spacing for siblings and levels, so `layerSpacing` was not used | Layer distance for Tree in `elk.js` (root boxes widened in the flow direction, narrowed after layout); to check in Archi |
| 2 | Begraafplaatsen en crematoria | Test/AlgoTree | Connections orthogonal-ish but slanted: mrtree routes only AVOID_OVERLAP (stub + diagonal) or MIDDLE_TO_MIDDLE; no orthogonal or splines | Routing for Tree drawn by the adapter (`_routeTreeEdges`): Orthogonal, Splines, Polyline (= mrtree); to check in Archi |
| 3 | radial; 0 Bestuur, Politiek en Ondersteuning | Test/Radial, Test/AlgoTwopi | Radial: 32 of 35 elements stacked (spanning-tree edges kept the relation direction → several roots); after that, depth-3 elements inside the first ring (ELK widens ring 1, moves only ring 2 along). Twopi: elements overlap at a small layer distance. Harness differed from Archi: it did not mask inactive params, so `connectionSpacing` enlarged the hub to 725 px | Tree edges point away from the root; Radial second ELK run with a fixed radius; Twopi `overlap=vpsc`; Radial and Twopi swapped style; harness masks params (`maskPreset`); checked in Archi |
| 4 | twopi-new | Test/AlgoTwopi | Twopi chose an element at the edge (Heffing) as centre: hub Besluitvorming on ring 3, its 19 neighbours round the outer ring, lines across the view (23 crossings, 11 lines over elements). Layer distance was centre to centre; a full ring was a fixed minimum, so Layer distance had no effect on a star | Centre = best-connected element per part (`root=true`); ring radii as a `ranksep` list: step = Layer distance + largest half diagonal on both rings, full ring tight at element height and following Layer distance; checked in Archi |
| 5 | twopi-new and others | Test/AlgoTwopi, Neato/FDP/SFDP | Element distance had no effect: `sep`/`esep` were passed as inches but Graphviz reads points per side (gap 0 px); Neato kept 103 overlapping pairs (no `overlap`); with `esep` ≥ `sep` the router fell back to straight lines (also before) | `sep` = ½ Element distance, `esep` = Distance to element, in pt; Neato `overlap=prism`; dialog keeps Element distance ≥ 2 × Distance to element for Neato/FDP/SFDP; measured gap = Element distance |
| 6 | Begraafplaatsen en crematoria | Test/AlgoTree | Hand-drawn orthogonal and polyline Tree lines looked poor next to Layered | Tree routing Straight (no bendpoints) and Splines only; to check in Archi |
| 7 | twopi-new, Begraafplaatsen | Test/AlgoTwopi, Test/AlgoTree | No way to try another starting order | Order (Selection, Name △, Type and name △, Name ▽) and Cycle; Tree follows the relation order, so a sorted order also sorts the relations; every algorithm gives a different layout per order; checked in Archi |
| 8 | Views/Test/network/* | session (Network algorithms) | Stress: 82 overlapping pairs on 480×537 (ELK Stress ignores Element distance; edge length 100 < element width; no overlap removal). Neato/FDP/SFDP: straight lines through elements also with Polyline/Splines — at Element distance = 2 × Distance to element `sep` = `esep` and the router falls back; FDP/SFDP without `overlap` still fell back at times. Force slow and messy (45 crossings, 14 lines through elements) | Stress + ELK SPOrE (0 overlap, 990×1104); dialog keeps Element distance ≥ 2 × Distance to element + 2; `overlap=prism` for Neato, FDP, SFDP (FDP with clusters: none); Force removed; to check in Archi |
| 9 | FDP | Test/FDP | Nothing nested: the nesting list held only an Exclude rule (aggregation, target Grouping); a feature list starts from nothing | Not a bug. Mode tooltip per kind of list, filter labels say "no Include rule = keep all, minus Exclude", note under Nesting / Reverse when no Include rule is on; to check in Archi |
| 10 | 0 Bestuur, Politiek en Ondersteuning | aggregation + composition nesting, Neato | 28 of 32 nested elements outside their container: neato places elements ignoring clusters (every mode; `mode=ipsep` crashes in Graphviz 14.1), and the adapter's derived cluster box held only the container and its first child | Neato does not nest (Nesting, Padding, Reverse greyed); cluster-box derivation removed (dot and fdp emit boxes); FDP nests with 0 outside |
| 11 | circo | Test/Circo | Messy result: elements overlapping (`mindist` only), lines straight through elements (no routing), circles stretched by the aspect ratio; on a model with a hub circo gave a star with arcs | Circo: `overlap=prism` + `sep`, Routing and Distance to element, no aspect ratio; option Circles (One circle, default / Per cycle); tooltip says which models suit it | checked in Archi |
| 12 | DevOps en rollen (copy) | Test/Circo | A relation floating towards DevOps team: user copies stayed in their old container while circo laid them out flat, at negative coordinates, clipped by Archi. A line starting inside Release: Graphviz passed no line ends, so the label points were interpolated from the element centre | User content the settings place nowhere goes to view root; Graphviz passes where each line leaves and enters the elements | checked in Archi |
| 13 | DevOps en rollen (copy) | Test/Circo | At 50 % zoom arrowheads turned; on Tester → Test (15 px) dot and arrowhead lay on top of each other. Six pairs of elements overlapping: one loose note made two parts, and circo then skips overlap removal. Five roles 616–732 px from their team: circo's centre was an element outside every cycle. The note far from its element: its line was not laid out | Bendpoints 12 px from elements, 5 px apart; shortest connection 20 px (dialog floor for Element distance); circo second run (`neato -n1`) for a graph of more parts; Per cycle centre in the largest cycle; diagram connections laid out | checked in Archi |
| 14 | Applicatiearchitectuur MVP (copy) | Test/Circo | The legend (a group with seven example elements) fell apart: the elements spread over the view, an empty group box left | Diagram-blocks: a diagram object with contents is laid out as one, keeping its size, appearance and contents; every container (also a group) counts when the writer moves a visual | to check in Archi |
