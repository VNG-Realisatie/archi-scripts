# Nesting level style conditions

Status: done — approved by the user 2026-10-28; docs and code in one commit.

## Problem

Style by nesting level follows only a same-type chain from each root container. A hierarchy that starts with one or more grouping levels and continues with other types (Bedrijfsfunctiemodel met referentiecomponenten: grouping → business function → application service → application component) gets styling on the groupings only.

## Behaviour

- **Chain.** Every root container (depth 0) starts a chain. A nesting step parent → child is followed when an active nesting style condition matches it; an unmatched step stops the chain for that child and all its descendants.
- **Condition.** Fields: on, parent (type, `""` = All), direction (`either` / `outgoing` / `incoming`, seen from the parent), relation (type, `""` = All), child (type, `""` = All, `"same"` = same type as parent, shown as *= Parent*), color (colour name from the colour list, `""` = Default).
- **Relation match.** A model relation of the condition's relation type between the parent's and the child's element, in the condition's direction. Needed because reverse conditions can make the child the relation's source.
- **Segment.** A run of same-type steps. A type-change step starts a new segment.
- **Colour.** A row's colour is the colour of its **parent type** (the user's model): a segment of type T takes the colour of the last active row with a colour and parent T, else of the last with parent All, else Default = the element type's default fill (not a fill set by hand: a rerun with Layout only would shade it again). Shading in HSL lightness, saturation kept (KK01 views): each level lighter closes *Lighten/level* % of the distance to white; one level darker is its inverse, but never darker than closing the same fraction toward lightness 0.6, so orange #f9c268 stays light; a darker yellow (hue 40–80) also shifts 4° per level toward orange (ochre). A segment starts *Darken start* levels darker (default 1, 0–3). #ffffcc at 30 %, Darken start 2: #fff197 → #fffab6 → #ffffcc → #ffffdb (KK01: #fff29b → #fff8b7 → #ffffcc → #ffffe6). Containers and leaves reached by a followed step are coloured.
- **Font.** Unchanged rules (root size, bold, decrease per level, min 9 pt), applied to containers in a followed chain, by total depth from the root (does not restart at a type change).
- **Overlap.** Rows with the same parent type and different colours: the later row wins; the run logs the types (no ⚠ in the dialog: the predicted view has no nesting tree).
- **Default row.** A new preset has one row: Parent All · Relation All · Child = Parent · Color Default — today's behaviour, now visible in the table.
- **Unchanged.** Order nesting level → highlight repeated → style by property; reset on Expand view / Layout only; active only when a nesting condition is on.

## Colour lists

- New file `Scripts/View/presets/_palettes.json`: named lists of named colours. The preset stores the list name (`appearance.palette`) and per row the colour name.
- Chosen in a *Color list* combo at the top of the Appearance tab (for all of Appearance; style by property can use it later).
- First list **GEMMA**, from the default fill colours in the user's Archi preferences (the model itself sets no fill colours):

| Name | Hex | Archi types |
|---|---|---|
| Bedrijf actief | #ffffdd | Business actor, role, collaboration, interface |
| Bedrijf gedrag | #ffffcc | Business process, function, interaction, event, service |
| Bedrijf passief | #fefeb4 | Business object, contract, representation, product |
| Applicatie actief | #daeef3 | Application component, collaboration, interface |
| Applicatie gedrag | #b7dee8 | Application process, function, interaction, event, service |
| Data | #92cddc | Data object |
| Technologie actief | #def6e3 | Node, device, system software, technology collaboration, interface, path, communication network |
| Technologie gedrag | #c6efce | Technology process, function, interaction, event, service |
| Artefact | #a0e4ad | Artifact |
| Fysiek | #cfde7a | Equipment, facility, distribution network, material |
| Locatie | #f5aa27 | Location |
| Strategie | #f9c268 | Capability, course of action, resource |
| Waardestroom | #dad5f0 | Value stream |
| Motivatie | #cab5ea | Stakeholder, driver, assessment, goal, outcome, principle, requirement, constraint |
| Grouping | #f6f6f6 | Grouping, group |

## Dialog

- Appearance tab: *Color list* combo at the top (None + lists from `_palettes.json`).
- Style by nesting level: condition table On · Parent · Direction · Relation · Child · Color above the font and colour rows. The Root color field is removed; *Darken start* (levels) sits before *Lighten/level*.
- **Colour picker — the standard for choosing a colour or colour range** (user, 2026-10-28): a button with the chosen item's swatch or gradient strip and its name, and a menu with every item's swatch (an SWT Combo shows text only on GTK). `Widgets.colorPicker` / `colorRangePicker`; used for the nesting style Color (Default + the list's colours), the style condition Range, Highlight repeated range and Mixed values color (the list's colours + *Other…* = the system colour dialog, a hex value). Replaces `colorRangeSelector`, `rangeCell`, `solidColorSwatch`. Goes into `docs/reference/dialog-style.md` as the rule for colour choices.

## Schema

- `appearance.palette: ""`; `appearance.nestingLevel.conditions: [default row]`; `rootColor` removed.
- New condition kind in `rel_filter.js`; `schemaVersion` 5; every preset under `presets/` rewritten in the same commit (AGENTS rule 3) by `tools/migrate_presets_nesting_style.js` (default row, `darkenStart: 0` = today's colours). `rootColor` was never used: jArchi always reads an effective fill. The 3 → 4 migration is removed (only the latest is kept).

## Steps

1. User approves this design.
2. `_palettes.json` + loader; condition kind; `defs.js` schema and migration of the presets.
3. `appearance.js`: chain walk by conditions, segments, colour from the list.
4. Dialog: colour-list combo, condition table, prediction / ⚠.
5. Typecheck; the user checks in Archi with Bedrijfsfunctiemodel met referentiecomponenten.
6. After approval: SPEC, `docs/reference/gui.md` + `presets.md`, ARCHITECTURE, generated tables; one commit.

## Handoff

Done: all steps. Code, presets (schema 5), palette file, colour picker for every colour choice, docs (SPEC § 2 Appearance + § 10, gui.md Appearance tab, presets.md schema + nestingStyle + Palettes, dialog-style.md Colour choices, ARCHITECTURE Appearance + schema version 5 + persistent state, README Presets), one commit. Nothing left for the user.
