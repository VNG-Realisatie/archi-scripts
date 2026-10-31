# View — text sizes from Archi fonts

## Goal

The layout reserves room for text from the font Archi will draw it with, measured, instead of from fixed estimates. Agreed with the user (2026-10-31): the fixed text values go; a new view takes Archi's default view font, *Layout only* and *Expand view* the font of the object on the view, and a font that *Style by nesting level* will set wins. Connection labels follow the connection spacing across the flow and keep at least 5 px between two labels.

## Facts the design rests on

- Fixed text values today: `LABEL_SIZING_DEFAULTS` (`lib/defs.js`: char width 8, line height 24, padding 16 / 8, minimum 60 × 30) for *Use label width* and the connection-label box of *Reserve label space* (`elk.js` `_labelBox`); `CONTAINER_LABEL_CLEARANCE` 30 (`lib/defs.js`) as extra top padding of every container in ELK and Tiles. Dagre reserves no room for a container label; Graphviz gives dot the cluster label, measured with dot's own font.
- *Style by nesting level* sets fonts after the write (`appearance.js` `_applyNestingLevel`), so the layout does not know them. `followNestingChains` is pure over the nesting tree, which the layout graph already holds.
- Archi (5.10, `com.archimatetool.editor.jar`): `FontFactory.getViewFont(String fontData)` is the font a figure draws with (font scaling included), `FontFactory.getDefaultUserViewFont()` the default view font. Text control margin 4 px (`AbstractTextControlContainerFigure.getTextControlMarginWidth/Height`). With the text at the top and the type icon shown, centred text keeps `iconOffset − 4` clear on both sides; `getIconOffset` is 16–27 px per element figure (Grouping and Business object 20).
- jArchi 1.12 (`DiagramModelComponentProxy`): `fontName`, `fontSize`, `fontStyle` give `FontFactory.getDefaultUserViewFontData()` when the object has no font of its own, so a visual always reads as its effective font. `fontStyle`: `normal`, `bold`, `italic`, `bolditalic`.
- Model file: a visual's font is the attribute `font="1|<name>|<size>|<style bits>|…"`; no attribute = Archi's default.

## Design

- **Font of a node.** One pure function per occurrence: the font *Style by nesting level* sets or resets (one shared function in `appearance.js`, also used by its own pass), else the font of the visual it is paired with, else Archi's default view font (`null`).
- **Measuring.** `LayoutRuntime.measureText(text, font)` → one line's `{ width, height }` in px. Archi: SWT `GC.textExtent` with `FontFactory`'s font (`lib/text_measure.js`). Node harness: an estimate from the point size (`tools/text_measure_node.js`). Lines wrap at word boundaries like Archi's text flow.
- **Label height.** Every `LayoutNode` gets `labelHeight`: Archi's text margin plus its wrapped lines. Wrap width: a leaf its own width; a container the narrowest it can be (widest child plus padding on both sides), less the icon offset on both sides — a container drawn wider gets fewer lines than reserved, never more.
- **Container label room.** A container's top padding = padding + its `labelHeight` (ELK, Tiles); `CONTAINER_LABEL_CLEARANCE` goes.

## Steps

1. **Measure; container label room (ELK, Tiles).** `TextFont`, `TextMeasure`, `LayoutRuntime.measureText`, `LayoutNode.labelHeight` (`types/layout.d.ts`); the font function shared with Appearance; Archi and Node measurers; `buildLayoutGraph` sets `labelHeight`; ELK and Tiles use it. Check: typecheck, `check_registry.js`, `nesting_test.js`, `rel_filter_test.js`, `tiles_test.js`, `compose_test.js`, `counts_test.js`, harness on a nested view with *Style by nesting level* font on (a GEMMA view), `compare-layouts.js` HEAD vs work tree.
2. **Connection labels.** *Reserve label space* boxes from the measured label in the connection's font (the connection on the view, else the default); across the flow the box is `max(0, text height + 5 − connection spacing)`, so labels follow the connection spacing and stay 5 px apart. The same minimum between a label and an element. Check: harness on GEMMA `ICT` (labels 53 px apart today, ports 20).
3. **Use label width.** Measured width and height; `labelCharWidth` and `labelLineHeight` leave `LABEL_SIZING_DEFAULTS`, presets that set them are rewritten (repo hard rule 3). Open: should a leaf without *Use label width* grow when its text does not fit (14 pt)?
4. **Dagre and Graphviz.** Container label room from `labelHeight` (Dagre); Graphviz clusters get the Archi font size.
5. **Appearance font name.** *Style by nesting level* writes "Segoe UI" (`appearance.js`), not Archi's default view font (here "Segoe UI Symbol"). Open: write only size and style, so the name stays the default.
6. **Docs after approval** (`Scripts/View/AGENTS.md` § Order of change): SPEC § 8 (a node carries its label height), `reference/engines.md` (layout graph fields), `reference/presets.md` (label sizing keys), ARCHITECTURE (measuring in Archi, wrap width, the shared font function).

## Log

- Step 1 code (uncommitted): `lib/label_size.js` (fonts, wrap, label heights), `lib/text_measure.js` (SWT), `tools/text_measure_node.js` (estimate), `appearance.js` `nestingFont` / `nestingFonts`, `buildLayoutGraph(…, labels)`, ELK `_boxSizes` / Tiles `topOf`; `CONTAINER_LABEL_CLEARANCE` removed. Typecheck and the six Node tests pass.
- Harness, HEAD → work tree (top of a container to its first child, padding 20): ICT (Layered, 10 pt bold) 50 → 42 on all 4 containers; Beleidsdomeinen ingedeeld in Iv3 (Tiles) 50 → 42–64; GEMMA domeinen (Tiles, 16/14/12/10 pt bold, 435 containers) 50 → 40–74, view 5240 × 7700 → 5340 × 7582.
- Seen: the wrap width is the narrowest the container can be, so a label that fits on one line of the drawn width can get room for two ("Openbare orde en veiligheidontwikkeling": 2 lines reserved, 500 px drawn).

- Archi baseline (2026-10-31): `Views/Test` the same; `Views/Baseline` 3 of 12 differ, exactly the ELK runs with containers (`1 Nesting` new view, `2 Edited` expand and layout only): first child 50 → 45 px below the container top (padding 20 + margin 4 + one 9 pt line, which SWT measures 21 px here), containers 5 px lower, what lies below moves with them. Graphviz views unchanged. The new baseline goes in the step 1 commit.
- Harness line height set to Archi's measurement (1.75 em): the harness now gives 45 on `1 Nesting` too.

- User check in Archi, GEMMA domeinen: all 435 containers got the room of their lines in their font, but containers whose label fits one line at the drawn width got two ("Openbare orde en veiligheidontwikkeling", "Uitvoering openbare orde en veiligheid", "Ondersteunen beheer toepasbare regels"), and leaves with a two-line label in a larger nesting font did not fit 60 px ("Ontwikkeling beheerbeleid / exploitatiebeleid fysieke leefomgeving"); ICT and Afval still had extra bendpoints for connection labels.
- Fixes: the text width per figure as Archi computes it (icon offset per element type from the Archi figures, figure type, text alignment and position, icon shown; a new grouping left-aligned, other elements taken as centred); a second layout (`generate_view._layoutFittingLabels`) with each container's label at its drawn width, a third with the larger of the two when a container came out narrower, kept only when every label fits; a leaf grows to fit its label (`label_size.leafHeightForLabel`).
- Step 2 done too: `LayoutEdge.labelWidth / labelHeight` from the connection's font (the one on the view, else the default), height = lines × the font size in px (the visible text); ELK `_labelBox` across the flow `max(0, text + 5 − connection spacing, text + 10 − 2 × connection–element spacing)`. Harness ICT: labels 53 → 26 px apart (the port pitch there is 25), bendpoints 56 → 49 (54 without Reserve label space); Afval 32 (32 without).
- A console line gives Archi's measure of the default view font, to set the harness estimate.

- User check 2: ICT good. GEMMA domeinen: "Tonen en bijwerken lopende zaken en mijn gegevens" still two lines reserved (the third layout took the larger of two needs); the room between label and first child too large — half the padding is enough. Afval: a 5 px jog in "ophalen".
- Archi measures here: 9 pt = 15 px (120 dpi), a line 21 px, "Archi" 34 px; the harness estimate is set to that.
- Fixes: `engine-utils.containerTop` = label + half the padding (the padding without a label), ELK and Tiles; up to 4 layouts, each with the labels' need at the widths of the layout before, the last with the most any layout needed, the first that fits kept.
- Afval "ophalen": reproduced with connection spacing 25 (Archi's run; heights ×1.25 against the preset's 20). Not the label room: without Reserve label space the same connection jogs 89 px. Route's two and Fractie's five ports, centred, cannot all line up; ELK keeps "gaat langs" straight.

- User check 3: GEMMA domeinen good; under a large bold title ("Bewaking") the gap may be larger. Fix: the gap below a container's label is half the padding times the font size over Archi's default view font size (`label_size.containerLabelRoom`, part of `labelHeight`; `containerTop` = labelHeight, or the padding without a label). Padding 20: 10 px at 9 pt, 16 at 14 pt, 18 at 16 pt.

- Archi baseline (2026-10-31, after the font-scaled gap): `Views/Test` the same; 6 of 12 `Views/Baseline` differ. With containers (`1 Nesting`, `2 Edited` expand and layout only) only the containers changed size, 15 px lower per level (top 50 → 35 = margin 4 + line 21 + half padding 10); in the views without containers (`3 Network` and its two One view each) only positions and bendpoints, from the measured label boxes. Committed as the new baseline. User approved; docs written (SPEC § 7–8, `reference/engines.md`, ARCHITECTURE § Sizing, ELK, Appearance, Runtimes, Known gaps 12–13, test cases 22–24).

## Handoff

- Done: steps 1, 2 and 6 for them, committed with the new baseline.
- Next: steps 3 (Use label width measured), 4 (Dagre and Graphviz container label room) and 5 (Appearance font name) — ARCHITECTURE Known gap 13.
- User: nothing.
