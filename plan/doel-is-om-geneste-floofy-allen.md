# View: nesting style with background look and compound cells

Block 5 renames this file to `plan/view-nesting-style-background-look.md` (AGENTS.md hard rule 8: no generated name).

## Context

Goal: color nested views both with chosen colors and from a background view. The dialog is as unambiguous as possible; the condition rows of Selection and Appearance look and work alike.

What prompted it:
- *Keep appearance* (Layout tab) puts the whole look of the background view over Style by nesting level, except the font size. An occurrence in a container the background view does not show takes the look of the element's first occurrence there: "Klanttevredenheidsmeting en analyse" on view "Publieksdiensten" gets `#e1ebf3` also inside "Publieksdiensten applicatieservices voor gemeente".
- Without *Keep appearance* the conditions give one fill color per condition, and the per-element colors of a GEMMA background view are lost.
- Observed on "Background applicatieservices": each application service is a lighter tint of its grouping, about 66 % toward white (`#a6c3dd` → `#e1ebf3`, `#d1dab4` → `#eff2e6`, `#f2c096` → `#faeadd`; grey `#bfbfbf` → `#f2f2f2` at 80 %). *Same as parent* at 65 % gives `#e0eaf3`, `#eff2e5`, `#fae9da`: the background view's colors follow from the grouping's fill color plus a condition.
- The nesting style table would grow from 8 to about 14 columns. On the Selection tab the *Match property* checkbox keeps a table wide once one condition has a property.

Starting position:
- Appearance pass order: Style by nesting level → *Keep appearance* → Highlight repeated → Style by property; on the Appearance tab the groups run Colors → Style by property → Style by nesting level → Highlight repeated.
- *Start darker*, *Lighter per level* and *Smaller per level* are global numbers of Style by nesting level; a condition has Color, Font size and Bold.
- *Keep appearance* copies `KEPT_ATTRIBUTES` from the background view; the font size comes from the condition.
- A condition also styles a root container whose type matches its Child type (Parent type All or that type), as if the root hung under a container of its own type (`_selectsRoot` in `lib/appearance.js`).
- The nesting style table is about 960 px wide.

Uncommitted in the working copy: fill color *Same as parent*, the label *Type default*, *Lighter per level* up to 90 % (`lib/appearance.js`, `lib/gui/condition_table.js`, `lib/gui/widgets.js`, `lib/gui/tab_appearance.js`, `lib/palettes.js`, tests). Block 1 finishes that work.

## Way of working

- The plan runs in blocks (§ Blocks). Each block runs in one go, in one session, on the model it names.
- Before a block that names another model than the current session, the agent asks the user to switch model and waits for "done".
- Within a block the agent asks only for a decision only the user can make, or for a check only the user can do in Archi; everything else it runs and checks itself (Node tests, `gui_check.ajs`, the View baseline).
- Every block: code and tests → show the result → wait for approval → docs (`Scripts/View/AGENTS.md` § Order of change) → one commit → update § Handoff → say "New session", the model of the next block, and one prompt line pointing to § Handoff.
- Generic form of this way of working: block 0 adds it to `~/ai/shared/AGENTS.md` § Multi-step work and handoffs.

## Terminology (new or changed; SPEC § Vocabulary, hard rule 2)

Usage: **element** for a model element on the view, **diagram object** for an object without a model concept; **background view** for the source, **background look** only for appearance; **fill color**, never "fill" alone; **nesting level** for depth, **nesting step** for one parent → child transition, **nesting chain** for the sequence of conditions; **condition** for every rule, in selection and in styling; **retained** for what the view takes over from the background view as it is, **inherited** only for an appearance attribute taken from the parent.

| Term | Meaning | Replaces |
|---|---|---|
| **appearance attribute** | One attribute of how an object looks: fill color, opacity, gradient, line color, width and style, font name, size, style and color, figure, icon, image, text alignment and position (jArchi `VISUAL_ATTRIBUTES`). Not a model *property*. | "property" in the sense of appearance |
| **fill color** | The fill color of an element or diagram object on a view (jArchi `fillColor`). In the dialog and docs "fill color", or "color" where the context is clear. | "fill" |
| **background look** | The appearance attributes an element has on the background view (`KEPT_ATTRIBUTES`; icon and image are separate attributes). The applicable occurrence: the one in the same container, or the first occurrence when there is none there. | *Keep appearance* (switch removed) |
| **Background** (value) | In a condition: use the corresponding value from the background look. Each element keeps its own value at every nesting level; *Lighter per level* and *Smaller per level* do not apply. Fallback for an element not on the background view: Type default, 9 pt, normal. | — |
| **Type default** (fill color) | The default fill color defined for that element type in Archi. | *Default* |
| **Same as parent** (fill color) | The parent's fill color, lightened according to the condition's *Lighter per level*. The same label appears in Child type, where it means the parent's *type*; here it means the parent's *fill color*. For a root container see § Model, Root containers. | — |
| **nesting chain** | Starts at each root container and follows parent-to-child nesting steps; each step is selected by one condition, which may select several consecutive steps. A child is styled only when its parent is. The chain ends where no condition selects the next nesting step. | "chain" (in `gui.md`, now in SPEC) |
| **start element** | The element where a condition starts styling a nesting chain: the root container, or a child selected by a different condition than its parent. The condition's fill color, font size and font style apply there; deeper levels within the same condition become lighter and smaller according to its settings. *Start darker* applies at a nesting type change or nesting color change (§ Explanation and tooltips). | "the container where a condition starts" |
| **font style** | `normal`, `bold`, `italic`, `bolditalic` (jArchi `fontStyle`) or Background. In the dialog, Bold and Italic are separate switches. | column *Bold* (boolean) |
| **Color and font by nesting level** | The Appearance group that styles elements along nesting chains. | *Style by nesting level* |
| **compound cell** | A table cell that shows a summary of several fields and opens a window containing those fields when clicked. | optional columns and *Match property* |
| **property match** | The property-based criteria of a condition: *Property of* (a choice of whose property is read), *Property* and *Value*. | the same fields, now in one compound cell |
| **position** | The arrangement the background view imposes: where the parts of the view are relative to each other, represented as a table (existing terms *table*, *table row*, *table column*, *cell*). | — |

## Functions of the background view (SPEC § Background)

1. **Selection**: every element of the background view is on the generated view. Additional elements may be selected, but are not required.
2. **Position**: the background view fixes where the parts of the view are relative to each other, represented as a table: table rows, table columns and cells.
3. **Diagram objects and diagram connections**: the diagram objects of the background view (note, group, image, view reference) and, as a separate category, its diagram connections are retained as shown on the background view, except for their size: each diagram object keeps its cell and grows with the size of that cell. They serve as a title, a legend or an explanation of the view. Block 3 checks which kinds the code already handles (notes and groups since `26f3210`) and adds the others.
4. **Background look**: elements use their background look as their initial appearance; a condition can override individual appearance attributes, not necessarily the whole appearance.

### Background view on/off

An On checkbox beside the background view (Layout tab), like the On checkbox of a condition. Off: the preset keeps the reference, the run does not use the background view.
- **Selection, position, diagram objects:** off means no background elements, no table, no diagram objects of the background view; the layout runs as without a background view.
- **Background look:** off means no base layer; elements start with Archi's defaults.
- **Background in conditions:** the values stay in the preset, as the fields of a condition that is off do. The dialog shows those cells greyed. The run treats them as the fallback (Type default, 9 pt, normal) and the console says once which conditions this affects: "Background view off: conditions 1, 2 use the default for Background." Nothing is lost silently; switching it on restores everything.
- Preset: `params.backgroundView.on` (boolean, default `true`); the migration sets `on: true` on every existing background view.

## Model

- Order of the appearance pass: **background look → Color and font by nesting level → Style by property → Highlight repeated**; the later wins. Highlight repeated is an analysis option you switch on over the styling, so it comes last. The groups of the Appearance tab follow the same order from top to bottom: Colors (palette) → Color and font by nesting level → Style by property → Highlight repeated.
- The background look applies whenever the background view is on; there is no separate *Keep appearance* switch.
- A condition overrides per appearance attribute: fill color, font size, font style. The value Background means: no override. Line, font name, font color, figure, image and text always come from the background look.
- Per condition: *Start darker* (at a nesting type change or nesting color change), *Lighter per level* (each deeper nesting level within the condition; for Same as parent the one nesting step from the parent's fill color), *Smaller per level* (each deeper nesting level, never below 9 pt).
- Not applicable, so greyed in the window: *Start darker* with Background and Same as parent; *Lighter per level* with Background; *Smaller per level* with font size Background.
- Property match in a nesting style condition: Property of = `child` | `parent` | `relation`. Specificity: +1 for a property match, beside parent type, relation and direction.
- Removed: the `fromKept` rule in `followNestingChains` (a child of the same type follows a kept fill color) and the exception "only the font size comes from the condition". Same as parent and Background now say it explicitly.
- **Root containers.** A nesting step always has a parent and a child, so a root container is never the child of a nesting step. A condition still styles a root container whose type matches its Child type (Parent type All or that type); that is how a root grouping gets font size 16 and bold. The rule stays, explained as: "a condition also styles a root container of its child type". With fill color Same as parent there is no parent to take it from: the root keeps its background look, else Type default (no override), and the row shows ⚠.
- The *Font* and *Color* switches above the table stay; off greys those cells, and that appearance attribute comes only from the background look or Archi's default.

Example, GEMMA "Applicatieservices met referentiecomponenten background":

| Parent type | Relation | Child type | Fill color | Font |
|---|---|---|---|---|
| Grouping | → Aggregation | Same as parent | Background | 16, Bold |
| All | → Aggregation | Application service | Same as parent, lighter 65 % | 11 |

## Dialog

### Compound cell with a window (Selection and Appearance, one pattern) — built in block 2

- Column kind `compound` in `lib/gui/condition_table.js` (`summary`, `fields`); a click, Space or Enter opens `Widgets.openFieldsWindow`: a small modal window under the cell, on the cell's monitor, movable, titled with the field and the condition, the fields side by side, OK and Cancel.
- A choice changes only the window; OK (or Enter) applies and recounts once; Cancel, Esc and the close button undo.
- A list field (property, value) has a filter field; its names are read again only when another field changed. Choosing another property empties the value.
- A summary that does not fit ends in "…"; the cell tooltip gives the whole summary. Property of shows its short name in the summary (*Previous*, *Source*).
- A new field of a condition later is a field in the window, not a column. In block 4 the Color and Font cells use the same window (choice, color picker, spinner fields still to add to `openCompound`).

### Selection tab

- The three optional columns Property of / Property / Value become one compound cell **Property**, always shown: "—" or `Status = Actief` (with Property of: `target: Status = Actief`).
- The *Match property* checkbox goes (`opts.propCondition`, `optional`, `propOn`, `anyProperty` in `condition_table.js`).
- Applies to the filter, step, nesting and reverse tables; in the filter table greyed on a relation row.

### Appearance tab, Color and font by nesting level

Columns: On · Parent type (n) · Direction · Relation type · Child type (n) · Property · Color · Font · ⚠ · ✕ (about 1,050 px).

| Cell | Summary | Pop-up |
|---|---|---|
| Property | `child: Status = Actief` or — | Property of, Property, Value |
| Color | swatch + `Same as parent +65%`, `Blue −1 +15%`, `Background` | Fill color (picker: Background · Same as parent · Type default · palette · Other…), Start darker, Lighter per level |
| Font | `16 B I −2`, `Background`, `— −2` (continues) | Font size (Background · empty = continues · 8–24), Bold, Italic (or Background), Smaller per level |

- Counts in the type cells, as "Aggregation (62)" in the Nesting table: Parent type `(n)` = distinct parents of the nesting steps this condition styles; Child type `(n)` = elements it styles directly (one nesting level, root containers included), only nesting steps it wins.
- ⚠ column at the end of the row, the pattern of the ⚠ column of Style by property (`kind: "warn"`, `setWarnings`). The icon shows when the predicted view has children with Background that are not on the background view, or Same as parent on a root container. Its tooltip says what happens; the console says the same at the run.
- Background in the windows is greyed without a background view, or with the background view off.
- The row with *Smaller per level*, *Lighter per level* and *Start darker* under the switches goes; the *Font* and *Color* switches stay.
- Layout tab: *Keep appearance* goes; the background view gets an On checkbox; *Leaves in place* stays.

### Explanation and tooltips (draft, English as in the dialog)

Rules: a tooltip says what the field does, briefly, and repeats no choice values. The choice values (Background, Same as parent, Type default, …) are explained in the window, as a short line under the picker or as the item's tooltip.

Group title *Color and font by nesting level*, explanation:
> Each condition selects parent-to-child nesting steps and defines how each child looks. Deeper levels within a condition become lighter and smaller. With a background view, elements start with their appearance from that view. Choose Background to preserve it.

Root containers: the tooltip text "A root container counts as a child under a container of its own type" (starting position) is unclear. It becomes "a condition also styles a root container of its child type" (§ Model, Root containers), in `gui.md`, not in the column tooltip.

Nesting chain, for the explanation in `gui.md` and SPEC:
> A nesting chain starts at each root container and follows parent-to-child steps. Each step is selected by one condition. When a child is selected by a different condition than its parent, it becomes the start element of that condition. It takes that condition's fill color, Start darker, font size and font style. Deeper levels within the same condition become lighter and smaller according to its settings. The chain ends when no condition selects the next nesting step.

"Different condition than its parent" matters: one condition can select several consecutive nesting steps.

Counts: "(n)" after the chosen type is the number on the predicted view, the same pattern as "Aggregation (62)" in the Nesting table.

| Place | Tooltip |
|---|---|
| Parent type | Type of the parent container. (n): number of containers on the predicted view whose children this condition styles. |
| Child type | Type of the child element this condition styles. (n): number of matching elements on the predicted view, one nesting level deep. |
| Property | Match only when the child, parent or relation has the specified property value. Click to configure. Empty: any value. |
| Color | Fill color applied to the child. Click to configure. |
| Start darker | Darken the fill color by this many levels where the type or the fill color changes from parent to child. |
| Lighter per level | Move the fill color this percentage closer to white at each deeper level. |
| Font | Font applied to the child. Click to configure. |
| Font size | Font size applied to the start element. |
| Bold / Italic | Font style applied to the start element. Deeper levels use normal style. |
| Smaller per level | Reduce the font size by this many points at each deeper level, down to a minimum of 9 pt. |
| Warning icon | Some elements styled by this condition are not on the background view. They use default values instead. The count reflects the predicted view and the configured property match. |
| Background (greyed out) | No background view selected, or the background view is disabled on the Layout tab. |
| Property (Selection) | Match only when the object has the specified property value. Click to configure. Empty: any value. |

Window choice descriptions, worded in parallel; Background has the same text for fill color, font size and font style:

| Choice | Description |
|---|---|
| Background | Use the value from the element's background look. |
| Same as parent | Use the parent's fill color, one step lighter. |
| Type default | Use the default fill color defined for the element type in Archi. |
| Font size (empty) | Continue with the parent's font size. |

Start darker follows the existing SPEC terms *nesting type change* and *nesting color change* (§ Vocabulary): the fill color starts darker where the child has another type or another fill color than its parent, and *Lighter per level* counts from there (`depthSinceChange` in `followNestingChains`). That point need not be a start element: within one condition with Child type All a type change also starts darker, and two conditions with the same fill color and type continue the gradient. The tooltip names the trigger, not the start element.

## Presets: schemaVersion 10

- `appearance.nestingLevel.conditions[]`: `{ on, parent, direction, relation, child, propertyOf, property, value, color, darkenStart, lightenPerLevel, fontSize, fontStyle, fontDecreasePerLevel }`.
  - `color`: palette color name · hex · `""` (Type default) · `"same"` (Same as parent) · `"background"`.
  - `fontSize`: `0` (continues) · 8–24 · `"background"`; `fontStyle`: `normal` · `bold` · `italic` · `bolditalic` · `background`.
  - `propertyOf`: `child` · `parent` · `relation`.
- `params.backgroundView`: `{ id, path, on }`.
- Removed: `nestingLevel.darkenStart`, `lightenPerLevel`, `fontDecreasePerLevel`; the condition key `bold`; `params.backgroundKeepAppearance`.
- `"background"` and `"same"` are reserved: a palette color with that name is refused (`validatePalettes`).
- Background in a preset without a background view, or with it off: one warning per run; the value acts as the fallback.
- Migration `tools/migrate_presets_nesting_style.js`, idempotent, every preset including `_session.json`:
  - the global numbers go into every condition; `bold: true` → `fontStyle: "bold"`, otherwise `"normal"`; `backgroundView.on: true`.
  - `backgroundKeepAppearance: true` → every condition `color: "background"`, `fontStyle: "background"` (font size stays): the views keep their look.
  - `false` or absent: fill colors stay; the background look now does apply line, font name and figure (see baseline).
  - Affected: "Alle referentiecomponenten background", "Applicatieservices met referentiecomponenten background" (on); "Bedrijfsfunctiemodel met referentiecomponenten background", `Test/gemma/Bedrijfsfuncties background` (off).

## Blocks

### Block 0 — generic way of working (Sonnet)

Add to `~/ai/shared/AGENTS.md` § Multi-step work and handoffs, after the first bullet:
- "Split a plan into blocks that each run in one go, in one session, on one model; name the model per block."
- "Every plan or proposal states its way of working: the blocks, the model per block, where the user is asked (model switch, decisions, checks in an app) and the handoff after each block."

Commit in `~/ai`. No user step.

### Block 1 — finish Same as parent (Sonnet)

Working copy: fill color *Same as parent*, label *Type default*, *Lighter per level* up to 90 %. Docs: SPEC § Coloring, `gui.md`, `presets.md` (5–90). `gen_docs_tables.js --write`. Commit.
User: approve the result before the docs.

### Block 2 — compound cell and Selection Property (Opus)

`lib/gui/condition_table.js` (kind `compound`, pop-up; `optional`, `propCondition`, `propOn`, `anyProperty` removed), `lib/gui/widgets.js` (pop-up shell; reuse `_placeTreePopup` and the filter list of `_openTreePopup`), `lib/gui/tab_selection.js`, `types/` (ConditionTableColumn). No preset change. Docs: `gui.md` (condition table, compound cell), ARCHITECTURE § Dialog (decision: compound cell with pop-up instead of optional columns).
Checks: `gui_check.ajs` on the Selection tab, judged by the agent. User: approve the dialog before the docs.

### Block 3 — schema 10 and appearance engine (Opus)

- Schema: `lib/defs.js` (defaults, validation, `PARAMS_*`, `backgroundView.on`), `lib/rel_filter.js` (`KINDS.nestingStyle` defaults/enums/specials; `nestingStyleConditionMatches` with property match; specificity), `lib/palettes.js` (reserve `background`), `tools/migrate_presets_nesting_style.js`, every preset.
- Engine: `lib/background.js` and `lib/selection_pipeline.js` (`backgroundView.on`; background looks read whenever the background view is on, `selection_pipeline.js:267`), `lib/appearance.js` (order background look → nesting → property → highlight; background look as base layer; `followNestingChains` with per-condition numbers, Background, font style, property match; `fromKept`/`_keptColor` removed), `lib/label_size.js` (fonts before the layout, Background font size included). Diagram objects and diagram connections of the background view: check which kinds are retained, add the others.
- Dialog only as far as needed to load and save schema 10 (`lib/gui/dialog_main.js`); the new columns follow in block 4.
- Docs: SPEC (§ Vocabulary; § Background with the four functions; § Coloring), `presets.md`, `selection-nesting.md`, ARCHITECTURE (background look as base layer, background view on/off, schema 10 and its migration).
- Checks: Node tests, View baseline (agent). User: approve the baseline differences before the docs.

### Block 4 — Appearance dialog and counts (Opus)

`lib/gui/tab_appearance.js` (group order Colors → Color and font by nesting level → Style by property → Highlight repeated; columns, explanation, numbers row removed), `lib/gui/condition_table.js` (`nestingStyleConditionColumns` with compound Property, Color and Font cells, ⚠), `lib/gui/counts.js` (parents and children per condition through `followNestingChains` on the predicted nesting), `lib/gui/tab_layout.js` (*Keep appearance* removed, On checkbox), `lib/gui/dialog_main.js`. Docs: `gui.md` (tab, tooltips, window texts), ARCHITECTURE § Dialog.
Checks: `gui_check.ajs` on Appearance and Layout, `counts_test.js`. User: approve the dialog before the docs.

### Block 5 — GEMMA check and close (Sonnet)

Set up "Applicatieservices met referentiecomponenten background" as in § Model, example; generate "Publieksdiensten" and compare the fill colors with the background view. Rename this plan to `plan/view-nesting-style-background-look.md`. Commit.
User: confirm the GEMMA view in Archi.

## Verification

- `npm run typecheck` at exit 0 after every block.
- Node: `appearance_test.js` (Background per appearance attribute, fallback, Same as parent under a background look, per-condition numbers, font style, property match, no `fromKept`, pass order), `preset_test.js` (schema 10, reserved names, migration idempotent), `counts_test.js` (parents/children per condition), `rel_filter_test.js` (property match, specificity), `background_test.js` (background view off), `rules_test.js`, the other `tools/*_test.js`.
- Dialog: skill `view-testing`, `tools/gui_check.ajs` on Selection and Appearance: table width, windows (placement, OK/Cancel, filter list), greyed cells; the agent judges the screenshots itself.
- Archi: skill `view-baseline`, run by the agent; expected differences only for the two presets with *Keep appearance* off (line, font name, figure).
- GEMMA: "Applicatieservices met referentiecomponenten background" with the example above; the application services on "Publieksdiensten" get the tint of their own container (`#e0eaf3` under `#a6c3dd`), also inside "Publieksdiensten applicatieservices voor gemeente".

## Handoff

- Done: blocks 0, 1 and 2 (compound cell with a window; Property cell on the Selection and Layout tables; *Match property* removed; `gui_check.ajs` suite `compound`, run in Xvfb).
- Next: block 3 (Opus): schema 10 and the appearance engine.
- User: start a new session on Opus with the prompt line below.
