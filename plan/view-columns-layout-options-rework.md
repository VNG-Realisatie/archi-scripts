# View columns: layout options rework

Status: code and docs done 2026-10-29, uncommitted.

## Goal

Views with nested containers that read well in a browser: a fixed number of equal columns (narrow), height free, boxes of one nesting level equal in size, little white space, and a layout that runs in seconds in Archi.

## What the options do

| Option | Parameter | Goal | When |
|---|---|---|---|
| Layout inside | `containerAlgorithm` | How children are placed in each container (Layered, Grid, Pack) | In ELK, before |
| Padding | `padding` | Space between a container's border and its contents | In ELK, before |
| Sort containers | `sortContainers` | Order of containers (type, name) as input to the layout | Before |
| Element width / height / Use label width | `elementWidth`, `labelSizing` | Size of a leaf | Before |
| Same width per level | `alignWidthSameType` | Boxes of one nesting level get the same width; frames telescope | Before: sets leaf widths and container minimums, then ELK runs |
| View size | `aspectRatio`, `maxWidth` | Target shape of the whole view | Search around ELK: up to 10 runs with a searched `elk.aspectRatio` |
| Snap columns to grid | `snapColumnsToGrid` | Leaf columns line up top to bottom on one grid | **Post-processing** on the ELK result: moves leaves, re-wraps containers |

Only Snap is post-processing. Everything else is input to ELK.

## How Same width per level is influenced

- **Padding.** One level is `2 × padding` wider than the level it contains.
- **Element width.** The deepest level is anchored at its narrowest box (`elementWidth` when labels are not sized); all levels above are derived from it.
- **Use label width.** Widths from labels are overridden: leaves get the level width exactly, so a long label may not fit (by code reading, not run).
- **Layout inside.** Containers get a minimum width only; a container with several columns bulges past its level width, so the level width is a floor, not a rule.
- **Snap columns.** Opposed: Same width makes leaf widths differ per level, Snap takes the widest leaf as the column width and centres the others. Measured on "Fysieke leefomgeving": Snap alone gives 5 uniform columns of 300 (2140 × 3170); both on give `[460, 460, 500, 340, 460]` and 2700 × 3790 against 2400 × 3790 without Snap.
- **View size.** No direct link, but Snap runs after the search, so the ratio found no longer holds.

## What works together, what is in the way

- Good: Layout inside Pack or Grid + Padding + Same width + View size (Max width).
- Good: Snap + equal leaf widths (Same width off).
- In the way: Snap + Same width (staircase inside a column, gaps from the worst row).
- In the way: Use label width + Same width (labels overridden).
- Snap's gap per column boundary is the worst case of the whole view and only grows; one collision widens it for every row.

## Speed (separate from the above)

- One ELK run: about 70 ms in Node, about 2.8 s in Archi (GraalJS). The View size search does 9 measuring runs plus a final run: about 28 s for 160 boxes. Snap and Same width cost milliseconds.
- Candidates: fewer runs (start estimate, no edge probe, reuse the measured run as the final run, wider tolerance); `elk.rectpacking.widthApproximation.targetWidth` (to test); ELK outside GraalJS; own column algorithm without ELK.

## Names for the Snap option (with "columns")

- Align columns
- Columns on one grid
- Column grid
- Equal columns
- Columns across containers
- Fixed columns (if the number of columns is set)

## Decisions (interview)

- **Width, not ratio.** The shape of a column view is set by Max width (pixels); the user wants columns that stay readable in a browser, height free. Aspect ratio leaves the dialog.
- **Snap stays a separate option, made level-aware.** It must work with Same width: the column takes the width of its outermost frame, not of its widest leaf, and boxes of one level stay equal.
- **Name:** Columns across containers (replaces "Snap columns to grid").
- **Gap between columns:** one fixed value for every boundary (not the worst row, no growth per collision).
- **Containers over several columns** keep their own shape; only leaves sit on the grid.
- **Use label width + Same width:** the widest label on a level sets that level's width; longer labels wrap.
- **Speed:** fewer ELK runs only (start estimate, no edge probe, reuse the measured run as the final run, wider tolerance); no new engine, no Node process.
- **Kept as they are:** Cycle, Sort containers.

## Steps

1. **Fewer runs.** Rework `_fitViewSize` (`elk.js`): start estimate, drop the edge probe, final run reuses the best measured run. Check: run count and time in the Node harness on "Fysieke leefomgeving" (model `/home/mark/Documents/Archi/model-repository/gemma-archi-repository/.git/temp.archimate`).
2. **Same width with labels.** Level width from the widest label on the level (labels wrap); anchor no longer the narrowest deepest leaf.
3. **Level-aware, uniform columns.** Rework `snapColumnsToGrid` (`engine-utils.js`): column from the outermost frame, one fixed gap, containers keep their shape, run before the size search or feed the search with the snapped size.
4. **Aspect ratio off for Pack and Grid** (done instead of removing it: Layered, Tree, Stress and the Graphviz algorithms have no other view-size lever). Grid and Pack offer Max width only; the one preset that used a ratio on Pack now has Max width 2400.
5. **Rename** `snapColumnsToGrid` → `columnsAcrossContainers` (function `alignColumnsAcrossContainers`) at every code, type and preset site. Label and tooltip texts keep the old wording until approval (`Scripts/View/AGENTS.md` § Order of change).
6. **Docs.** `Scripts/View/docs/reference/gui.md`, `selection-nesting.md`, `ARCHITECTURE.md`, `engines.md` (generated tables via `tools/gen_docs_tables.js`).
7. **Checks.** `npm run typecheck`, the Node tests, the Archi baseline (skill `view-baseline`) because layouts change.

## Added after the first code pass

- **Tiles algorithm** (`lib/engines/tiles.js`, no ELK; first built as Columns with a column-count search, replaced): the children of every container are tiled in their sorted order, so the order reads left to right and down. Ordered slicing floorplan (Stockmeyer): each box has a list of shapes (width, height) no other beats in both; a run of neighbours is cut in two, side by side or one above the other, and the best shapes of every run follow by dynamic programming. A container settles on a shape only when its parent knows the room. The view takes the root shape that fits Max width and is closest to portrait (0.75). Same width per level and Use label width work as before. Test: `tools/tiles_test.js`.
- Measured (leaf area / view area, Same width, Sort on): Sociaal domein Pack 17%, Tiles 29%; Publieksdiensten Pack 16%, Tiles 23%; Fysieke leefomgeving Pack 17%, Tiles 23%; 30–40 ms in Node instead of 0.2–1.5 s.
- Provisional: the algorithm tooltip in `defs.js` and the docs until the user approves (`Scripts/View/AGENTS.md` § Order of change).

## Sorting (second round)

- **Sort inside containers** (param `sortInsideContainers`, replaces the check `sortContainers`; presets rewritten): `Elements` (elements ordered by type and name, containers in selection order), `Containers, then elements` (containers ordered by type and name too, and first), `All together` (containers and elements of a parent in one list, ordered by **Order**: Selection, Name, Type and name; so Order now also holds inside containers in this mode).
- Measured on Publieksdiensten, Sociaal domein, Fysieke leefomgeving: All together gives the same size and fill as Containers, then elements (e.g. 1710 × 2440, 23.4%).
- **Columns across containers** works with Tiles too (post-pass on the tiles): Publieksdiensten 1710 × 2440 → 2010 × 2440, fill 23.4% → 19.9%.
- `None` added: everything stays in selection order (also the leaves); the default stays `Elements`.
- **Columns across containers**: the gaps start at Distance (10) and widen only where siblings (containers and leaves) collide, by the overlap; the one-gap rule is dropped (it widened every boundary to the worst one: 130 px in Fysieke leefomgeving, 190 px in GEMMA domeinen). A collision between boxes that share a column is reported, not widened. Tiles + snap: Fysieke leefomgeving 2030 × 3230 (fill 21.9%, gaps 30/10/70), GEMMA domeinen 4700 × 7430 (23.7%, before 5880 × 7430 and 18.9%). Pack + snap on GEMMA domeinen was already broken before (13450 wide, 9 overlaps at HEAD) and is 9520 wide now with the same 9 overlaps: ELK Pack gives no column structure on 800 nodes.
- Provisional texts (label, tooltip) until approval.

## Third round (dialog, start order, sort)

- **Algorithm start** (`algorithmStart`, was Order/Start order) and **Cycle algorithm start** (`cycleAlgorithmStart`): in the Algorithm box; greyed where Sort applies and is not None (the visible sort wins).
- **Sort** (`sort`, was `sortInsideContainers`): in the Containers group (it only has an effect in a view with containers; a flat Grid, Pack or Tiles view is ordered by Algorithm start); values None, Elements, Containers then elements, All together; always ascending by type and name, at every level including the root. Offered for Grid, Pack and Tiles; directed views (Layered, Tree, Dagre, Graphviz) have no Sort and keep the old behaviour (leaves inside containers by type and name).
- Columns across containers: Tiles only. Disabled checkboxes are drawn grey (`Widgets.checkBox`, `Widgets.canvasCheck`): all dialog checkboxes.
- Docs (SPEC, reference, ARCHITECTURE, generated tables) are not updated for this round.

## Max width in Tiles

- Max width is the width the view takes, up to the limit: the widest root shape whose view, after Columns across containers (which widens it), still fits. Before: the best portrait shape under the limit, so 3000 gave under 2000 on Fysieke leefomgeving. Now 3000 → 2960, 4000 → 3980 (snap off); with snap on the widths jump with the column detection (2000 → 1560).
- Tiles also offers Aspect ratio: the 8 root shapes closest to it are placed and measured (the grid can change the ratio), the closest wins. Free is a preference for portrait (area × (1 + ln²(ratio / 0.75))), not a target: measured 0.6–0.85.
- The root keeps 96 shapes (other runs 32), each placed and measured.

## Open

- Whether Max width gets a column count shown next to it in the dialog.
- Whether presets that use Aspect ratio (this repo) map to a Max width, and which.

## Handoff

- **Done:** all rounds in code and docs (SPEC, `docs/reference/`, ARCHITECTURE, generated tables, `Scripts/View/AGENTS.md` § Conventions for tooltips). Typecheck, `check_registry` and the Node tests pass.
- **Open:** after an action the model, not the view, is selected in the model tree (all algorithms, also New view); ARCHITECTURE § Known gaps 12.
- **User:** check the dialog in Archi, then say when to commit (one commit, docs and code).
