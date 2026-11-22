# Presets — reference

The preset file behind [SPEC.md § 4 Data model](../SPEC.md#4-data-model). Keys are the persisted JSON keys; comments use the GUI labels. Defaults and allowed values are in `lib/defs.js` (`DEFAULT_PRESET`, the algorithm registry).

## Preset JSON schema

A preset is a value: it validates against this schema and round-trips losslessly to its stored form.

```
Preset {
  schemaVersion : 6                  // 2 = condition lists; 3 = everyContainer per nesting condition; 4 = keys *Rules → *Conditions;
                                     // 5 = nesting style conditions, palette; 6 = font size and bold per nesting style condition
  name, description : string         // description: shown under the preset combo
  algorithm     : enum               // Algorithm
  params {                           // one key per layout option: the Parameter column of the
                                     // generated tables in gui.md (Layout options, Preset-only options)
    viewSizeMode : "none"|"maxWidth"|"aspectRatio"   // which View size radio; "none" = Free
    backgroundView : { id, path : string }            // the background view: found by id, else by path (folders and name); "" both = none
  }
  filter {                           // every list: [] = keep all
    conditions         : FilterCondition[]     // element rows (seed elements) and relation rows (relations between the filtered elements)
    diagramConditions  : DiagramCondition[]    // diagram objects of selected views
  }
  relatedElements { steps : Step[] } // ordered chain, one per step block
  view {                             // Create actions only
    name   : string                  // New view; "" = first selected object
    folder : string                  // Custom: path under Views (or /Views/_Generated); "" = that folder itself
    suffix : string                  // One view each: appended to each element name
    mirrored : boolean               // One view each: each view in the folder that mirrors its element's; default false
    underGenerated : boolean         // the folder, Custom or Mirrored, under /Views/_Generated; default true
  }
  appearance {
    palette : string                 // name of a palette in presets/_palettes.json; default "Brewer"
    styleByProperty {
      conditions : StyleCondition[]  // in order; the later condition wins on one object
      mixedValuesColor : string      // fill for an object with several values: a color name of the palette, or a hex
      lineWidth : 0..3               // 0 = no change; 1 Normal, 2 Medium, 3 Heavy
    }
    nestingLevel {
      conditions : NestingStyleCondition[]   // nesting steps followed from each root; default [{ child: "same", fontSize: 14 }]
      fontEnabled : boolean
      fontDecreasePerLevel : number (pt)
      colorEnabled : boolean
      darkenStart : 0..3             // levels darker the fill starts at a nesting type or color change
      lightenPerLevel : number (%, 5–40)
    }
    highlightRepeated { enabled : boolean, colorRange : string }   // a range name of the palette
  }
  engineParams { ELK?, Dagre?, Graphviz?, layout? }   // settings outside the dialog, passed through as-is;
                                                      // each owner merges its section over its defaults
  viewProperties {
    addObjectId : boolean            // write a unique Object ID when the view has none
    properties : { key, value : string, enabled : boolean }[]   // key never hidden; enabled false removes the key from the view
  }
}
Step { name : string, repeat : 1..5 | "untilNothingNew", conditions : StepCondition[] }   // name "" = Step N; conditions [] = follow every relation
```

`name`: shown instead of *Step N*; a step without `name` loads as `""`. `repeat`: each run starts from the previous run's additions; *until nothing new* (`∞` in the dialog) stops when a run adds nothing, at most 10 runs.

## Settings outside the dialog

`engineParams` tunes the layout engines and the sizing by label (`layout`) without a dialog control. Per section the run merges, last wins: the defaults below → the dialog's options → `engineParams` ([ARCHITECTURE § Options across engines](../ARCHITECTURE.md#options-across-engines)). `labelMaxLineWidth` is the exception: the dialog's *Wrap label at* always wins.

Every run checks the `layout` section and the section of its own engine; another engine's section is checked by a run with that engine. The console lists each setting that applies, with the default it replaces where that is known, and adds a ⚠ line, with what to do, for each setting that:
- is unknown: a section, a key, or an id the bundled ELK does not know (ELK also takes the end of an id, `elk.spacing.nodeNode`);
- is not used: an option of another ELK algorithm (`elk.layered.*` in a Pack run), an ELK option read only on connections, ports or labels, an option the adapter sets itself after the preset, or `esep` in a Dot run;
- names one ELK option twice, under two keys;
- overrides a dialog option, or equals what the dialog or the default sets.

A value of the wrong type stops the run before the layout, with a ✗ line that names the type it needs; nothing is written. So does a section that is not an object. The type per section:

| Section | Type of a value |
|---|---|
| `layout` | a number |
| ELK | the type the bundled ELK declares for the option: a number, a whole number, `true`/`false` or a text; ELK also reads each from a text (`"12"`, `"true"`). An option of type object (`elk.padding`) is not checked. |
| Dagre | a number (`"80"` counts too: dagre converts it) for `ranksep`, `nodesep`, `edgesep`, `marginx`, `marginy`; a text for the others |
| Graphviz | `esep`: a number or a text (`"+8"`) |

An `engineParams` that is not an object is dropped by validation and reported when the preset is read, with the keys validation does not read.

ELK core options (`elk.padding`, `elk.spacing.*`, …) are not checked against the algorithm: ELK declares fewer of them than an algorithm reads. *Set by the dialog* lists the option that sets a key, with its algorithms where that is not every algorithm of the engine. ELK and Dagre take any option the engine reads; Graphviz only `esep`.

<!-- generated:engine-params -->
| Section | Key and effect | Default | Set by the dialog |
|---|---|---|---|
| ELK | `elk.layered.cycleBreaking.strategy`<br>Layered: how cycles are broken before layering | GREEDY | — |
| ELK | `elk.layered.edgeRouting.selfLoopDistribution`<br>Layered: self-loops spread over the element's sides | EQUALLY | — |
| ELK | `elk.layered.edgeRouting.selfLoopOrdering`<br>Layered: order of the self-loops on one side | SEQUENCED | — |
| ELK | `elk.layered.crossingMinimization.strategy`<br>Layered: crossing reduction by layer-by-layer sweeps | LAYER_SWEEP | — |
| ELK | `elk.layered.crossingMinimization.greedySwitch.activationThreshold`<br>Layered: element swaps that remove crossings, from this element count up (ELK: 40) | 0 | — |
| ELK | `elk.layered.thoroughness`<br>Layered: random restarts of the crossing reduction (ELK: 7) | 25 | — |
| ELK | `elk.layered.considerModelOrder.strategy`<br>Layered: the input order is not kept | NONE | — |
| ELK | `elk.layered.feedbackEdges`<br>Layered: connections against the flow leave and enter on the flow sides | true | — |
| ELK | `elk.spacing.nodeSelfLoop`<br>Distance between an element and its self-loops (px) | 40 | — |
| ELK | `elk.force.iterations`<br>Stress: iterations of the force layout it starts from (ELK: 300) | 30 | — |
| ELK | `elk.overlapRemoval.maxIterations`<br>Stress, Radial: iterations of the overlap removal after it (ELK: 64) | 16 | — |
| Dagre | `rankdir`<br>Direction of the layers: tb, bt, lr, rl | tb | Direction |
| Dagre | `ranker`<br>Layer assignment: network-simplex, tight-tree, longest-path | network-simplex | Ranking |
| Dagre | `acyclicer`<br>Cycle breaking: unset = depth-first, greedy | unset | Cycles |
| Dagre | `ranksep`<br>Distance between layers (px) | 50 | Layer distance |
| Dagre | `nodesep`<br>Distance between elements in one layer (px) | 50 | Distance |
| Dagre | `edgesep`<br>Distance between connections in one layer (px) | 20 | Between |
| Dagre | `marginx`<br>Margin left and right of the view (px) | 0 | Diagram padding |
| Dagre | `marginy`<br>Margin above and below the view (px) | 0 | Diagram padding |
| Dagre | `align`<br>Alignment in a layer: UL, UR, DL, DR; unset = centred | unset | — |
| Graphviz | `esep`<br>Distance between a connection and an element (pt, +w = per side); only Neato, FDP, SFDP, Twopi, Circo | +24 with Orthogonal routing, otherwise +8 | Distance to element (Neato, FDP, SFDP, Circo) |
| layout | `labelHPadding`<br>Room left and right of the label, beyond Archi's text margin and the type icon (px) | 4 | — |
| layout | `labelVPadding`<br>Room above and below the label, beyond Archi's text margin (px) | 4 | — |
| layout | `labelMaxLineWidth`<br>Not used here: the dialog's Wrap label at sets it | 400 | Wrap label at |
| layout | `labelMinWidth`<br>Smallest element width with Use label width (px) | 60 | — |
| layout | `labelMinHeight`<br>Smallest element height with Use label width (px) | 30 | — |
<!-- /generated:engine-params -->

## Condition lists

One condition model for every list. A list keeps what matches **any active Include condition**, unless an **Exclude condition** matches too. Order has no meaning, except for style conditions, where the later condition wins. A type field holds a type id or `""` (= All). Defaults: `mode` is `"include"`, `on` is true, `everyContainer` is false.

**On / off.** Every condition can be switched off without deleting it. An off condition keeps, adds and removes nothing. An off Include condition still counts as an Include condition, so a list whose Include conditions are all off keeps nothing (filter: no elements; step: adds nothing). Only a list without Include conditions falls back to its *Empty list* behaviour below.

| Condition kind | Fields | Used by | Empty list |
|---|---|---|---|
| filter   | on, mode, applyTo (`element`/`relation`), source, relation, target, property, value. An element row uses source (the element type), property and value; a relation row uses source, relation and target. A cell that does not apply is refused | `filter.conditions` | keep all, per applyTo |
| diagram  | on, mode, diagramType | `filter.diagramConditions` | keep all |
| relation | on, mode, source, relation, target, propertyOf (`relation`/`source`/`target`), property, value, everyContainer (nesting conditions only) | `params.nestingConditions`, `params.reverseConditions` | nesting / reverse: none |
| step     | on, mode, previous, direction (`either`/`outgoing`/`incoming`), relation, added, propertyOf (`added`/`relation`/`previous`), property, value | `steps[].conditions` | follow all, as a pass-all condition `{}`; a step without any active Include match adds nothing |
| style    | on, applyTo (`element`/`relation`/`source`/`target`), source, relation, target, propertyOf (`element`/`relation`/`source`/`target`), property, colorRange (a range name of the palette) | `appearance.styleByProperty.conditions` | no styling |
| nestingStyle | on, parent, direction (`either`/`outgoing`/`incoming`, seen from the parent), relation, child (a type, `""` = All or `"same"` = the parent's type; default `"same"`), color (a color name of the palette, a hex, or `""` = Default), fontSize (pt of the container where the condition starts; `0` = continues from its parent), bold (that container bold) | `appearance.nestingLevel.conditions` | no styling |

**Step conditions are written from the previous step's elements.**
- `direction`: `outgoing` = the previous-step element is the relation's source; `incoming` = it is the target; `either` (default) = both.
- `previous` constrains the previous-step element's type, and `added` the new element's type. `propertyOf` says whose property must equal `value`.
- Which relations a step *draws*: an Include condition matches on relation type, direction and `previous` only; `added` and the property only decide which elements join. An Exclude condition matches in full.

**Style conditions.**
- `color` says what gets the color:
  - `element`: the element, by its own property; `source` holds its type;
  - `relation`: the relation;
  - `source` / `target`: that end of a matching relation. Relations are taken model-wide, so the relation need not be on the view.
- `propertyOf` says whose property gives the value.

**Validation.** Each condition is normalised. An unknown key, enum value or type id, or a value of the wrong kind, refuses the preset with a message naming the condition (`params.nestingConditions[0]: unknown relation "…"`), so a typo never widens a list to All ([SPEC § 12](../SPEC.md#12-resilience--error-model)).

**File form.** Fields at their default are omitted, a pass-all filter list is written as `[]` (a step list is not: there `[]` adds nothing), and every condition sits on one line, so a diff shows one changed condition as one changed line.

**Nesting style conditions.** No Mode column: every condition is an Include condition. `child` is always written, so the default condition reads `{"child": "same"}`. Matching and colors: [gui.md § Appearance tab](gui.md#appearance-tab).

## Palettes

`presets/_palettes.json` holds the palettes a preset picks from (`appearance.palette`). A palette is a set of colors and color ranges that belong together: every color and color range of the Appearance tab comes from the preset's palette. There is always one; the first palette of the file is the default.

```
{ "palettes": [ { "name": "Brewer",
    "colors": [ { "name": "Blue", "hex": "#b3cde3" }, … ],
    "ranges": [ { "name": "Blues", "colors": ["#f7fbff", …, "#08306b"], "padding": [0.1, 0.4] }, … ] } ] }
```

- **colors**: named colors, for *Mixed values color* and the nesting style colors. A setting names a color; a color of its own (*Other…*) is a hex.
- **ranges**: named ranges, for the style conditions and *Highlight repeated elements*. A range interpolates between two or more colors; `padding` (optional, `[start, end]`, each below 0.5) leaves out that fraction at either end, so a dark end does not hide black text.
- Names are unique within the file, and color and range names within a palette.

| Palette | Colors | Ranges | Source |
|---|---|---|---|
| Brewer | the 9 Pastel1 tints | Pastel1, Pastel2, Set2, Set3 (qualitative); Blues, Greens, Oranges, Purples, Reds, Greys, OrRd, PuBu (sequential); RdYlBu, RdYlGn, Spectral (diverging) | ColorBrewer, as chroma-js bundles it |
| Tol | *light*: 9 colors made to fill labelled cells | Light, Pale (qualitative); Sunset, BuRd, PRGn (diverging); YlOrBr, Iridescent (sequential) | Paul Tol's schemes, color-blind safe (`tol_colors`, BSD) |
| Open Color | step 2 of each of 13 hues | Light (qualitative); steps 0–6 of each hue; Blue–Red, Teal–Orange (diverging) | Open Color 1.9.1 (MIT): equal brightness per step across hues |
| GEMMA | the default fill colors of the GEMMA Archi preferences, one per group of element types | Lagen (one color per layer); Bedrijf, Applicatie, Technologie, Strategie, Motivatie | GEMMA |

The file is read when the dialog builds its Appearance tab and at a run with styling. An unusable or missing file stops it with a message naming what is wrong. A palette, color or range a preset names that the file does not hold is replaced by the first one, in the dialog and at the run (which says so in the console).

## Hidden properties

`presets/_hidden_properties.json` lists the view property keys the Properties tab does not show and generation never touches. It is per installation: another model has other keys.

```
{ "hidden": [ "GEMMA URL", "path", … ] }
```

*Object ID*, *Managed occurrence* and *View origin* are always hidden and not listed. The file is read when the tab is built and at each run; an unusable file stops the run with a message naming what is wrong. Without the file only the two always-hidden keys apply. A preset row with a hidden key is left alone and the console says to remove it.

## View origin

The view property *View origin* holds how the view was made, as JSON, for Regenerate:

```json
{ "preset": "GEMMA/GGM/GGM bedrijfsobject specialisaties", "direction": "Down", "action": "one_each",
  "selection": [{ "id": "id-3f2a", "name": "/Business/Processen" }],
  "folder": "/_Generated/Project", "element": { "id": "id-91bc", "name": "Klant" } }
```

`id` finds the object; `name` is a label, refreshed at every regenerate. `direction`: only when the run overruled the preset. `folder`: *One view each* into Custom, the full path under Views (`"/"` = Views itself); absent when Mirrored. `underGenerated`: Mirrored under `/Views/_Generated`. `element`: *One view each*. `modified`: made with unsaved settings, or expanded since. `script`: made by that script; the origin then holds only this key.
