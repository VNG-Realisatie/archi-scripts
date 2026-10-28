# Presets — reference

The preset file behind [SPEC.md § 4 Data model](../SPEC.md#4-data-model). Keys are the persisted JSON keys; comments use the GUI labels. Defaults and allowed values are in `lib/defs.js` (`DEFAULT_PRESET`, the algorithm registry).

## Preset JSON schema

A preset is a value: it validates against this schema and round-trips losslessly to its stored form.

```
Preset {
  schemaVersion : 5                  // 2 = condition lists; 3 = everyContainer per nesting condition; 4 = keys *Rules → *Conditions;
                                     // 5 = nesting style conditions, palette
  name, description : string         // description: shown under the preset combo
  algorithm     : enum               // Algorithm
  params {                           // one key per layout option: the Parameter column of the
                                     // generated tables in gui.md (Layout options, Preset-only options)
    viewSizeMode : "none"|"maxWidth"|"aspectRatio"   // which View size radio; "none" = Free
  }
  filter {                           // every list: [] = keep all
    elementConditions  : ElementCondition[]    // seed elements
    diagramConditions  : DiagramCondition[]    // diagram objects of selected views
    relationConditions : RelationCondition[]   // relations between the filtered elements
  }
  relatedElements { steps : Step[] } // ordered chain, one per step block
  view {                             // Create actions only
    name   : string                  // New view; "" = first selected object
    folder : string                  // path under Views; "" = "/_Generated"
    suffix : string                  // One view each: appended to each element name
  }
  appearance {
    enabled : boolean                // Apply styling: master on/off (not built yet: ARCHITECTURE § Known gaps)
    palette : string                 // name of a palette in presets/_palettes.json; "" = none
    styleByProperty {
      conditions : StyleCondition[]  // in order; the later condition wins on one object
      mixedValuesColor : hex         // fill for an object with several values
      lineWidth : 0..3               // 0 = no change; 1 Normal, 2 Medium, 3 Heavy
    }
    nestingLevel {
      conditions : NestingStyleCondition[]   // nesting steps followed from each root; default [{ child: "same" }]
      fontEnabled, rootFontBold : boolean
      rootFontSize, fontDecreasePerLevel : number (pt)
      colorEnabled : boolean
      darkenStart : 0..3             // levels darker a segment starts than its colour
      lightenPerLevel : number (%, 5–40)
    }
    highlightRepeated { enabled : boolean, colorRange : scheme name }
  }
  engineParams { ELK?, Dagre?, Graphviz?, layout? }   // settings outside the dialog, passed through as-is;
                                                      // each owner merges its section over its defaults
  viewProperties {
    addObjectId : boolean            // write a unique Object ID when the view has none
    properties : { key, value : string, enabled : boolean }[]   // key never "Object ID"
  }
}
Step { repeat : 1..5 | "untilNothingNew", conditions : StepCondition[] }   // [] = follow every relation
```

`repeat`: each run starts from the previous run's additions; *until nothing new* stops when a run adds nothing, at most 10 runs.

## Settings outside the dialog

`engineParams` tunes the layout engines and the label-size estimate (`layout`) without a dialog control. Per section the run merges, last wins: the defaults below → the dialog's options → `engineParams` ([ARCHITECTURE § Options across engines](../ARCHITECTURE.md#options-across-engines)). `labelMaxLineWidth` is the exception: the dialog's *Wrap label at* always wins.

Every run checks the `layout` section and the section of its own engine; another engine's section is checked by a run with that engine. The console lists each setting that applies, with the default it replaces where that is known, and adds a ⚠ line, with what to do, for each setting that:
- is unknown: a section, a key, or an id the bundled ELK does not know (ELK also takes the end of an id, `elk.spacing.nodeNode`);
- is not used: an option of another ELK algorithm (`elk.layered.*` in a Pack run), an ELK option read only on connections, ports or labels, an option the adapter sets itself after the preset, or `esep` in a Dot run;
- names one ELK option twice, under two keys;
- overrides a dialog option, or equals what the dialog or the default sets.

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
| layout | `labelCharWidth`<br>Width of one character in the label-width estimate (px) | 8 | — |
| layout | `labelLineHeight`<br>Height of one label line (px) | 24 | — |
| layout | `labelHPadding`<br>Room left and right of the label (px) | 16 | — |
| layout | `labelVPadding`<br>Room above and below the label (px) | 8 | — |
| layout | `labelMaxLineWidth`<br>Not used here: the dialog's Wrap label at sets it | 400 | Wrap label at |
| layout | `labelMinWidth`<br>Smallest element width with Use label width (px) | 60 | — |
| layout | `labelMinHeight`<br>Smallest element height with Use label width (px) | 30 | — |
<!-- /generated:engine-params -->

## Condition lists

One condition model for every list. A list keeps what matches **any active Include condition**, unless an **Exclude condition** matches too. Order has no meaning, except for style conditions, where the later condition wins. A type field holds a type id or `""` (= All). Defaults: `mode` is `"include"`, `on` is true, `everyContainer` is false.

**On / off.** Every condition can be switched off without deleting it. An off condition keeps, adds and removes nothing. An off Include condition still counts as an Include condition, so a list whose Include conditions are all off keeps nothing (filter: no elements; step: adds nothing). Only a list without Include conditions falls back to its *Empty list* behaviour below.

| Condition kind | Fields | Used by | Empty list |
|---|---|---|---|
| element  | on, mode, elementType, property, value | `filter.elementConditions` | keep all |
| diagram  | on, mode, diagramType | `filter.diagramConditions` | keep all |
| relation | on, mode, source, relation, target, propertyOf (`relation`/`source`/`target`), property, value, everyContainer (nesting conditions only) | `filter.relationConditions`, `params.nestingConditions`, `params.reverseConditions` | filter: keep all · nesting / reverse: none |
| step     | on, mode, previous, direction (`either`/`outgoing`/`incoming`), relation, added, propertyOf (`added`/`relation`/`previous`), property, value | `steps[].conditions` | follow all |
| style    | on, color (`element`/`relation`/`source`/`target`), source, relation, target, propertyOf (`element`/`relation`/`source`/`target`), property, colorRange | `appearance.styleByProperty.conditions` | no styling |
| nestingStyle | on, parent, direction (`either`/`outgoing`/`incoming`, seen from the parent), relation, child (a type, `""` = All or `"same"` = the parent's type; default `"same"`), color (a colour name of the palette, `""` = Default) | `appearance.nestingLevel.conditions` | no styling |

**Step conditions are written from the previous step's elements.**
- `direction`: `outgoing` = the previous-step element is the relation's source; `incoming` = it is the target; `either` (default) = both.
- `previous` constrains the previous-step element's type, and `added` the new element's type. `propertyOf` says whose property must equal `value`.
- Which relations a step *draws*: an Include condition matches on relation type, direction and `previous` only; `added` and the property only decide which elements join. An Exclude condition matches in full.

**Style conditions.**
- `color` says what gets the colour:
  - `element`: the element, by its own property; `source` holds its type;
  - `relation`: the relation;
  - `source` / `target`: that end of a matching relation. Relations are taken model-wide, so the relation need not be on the view.
- `propertyOf` says whose property gives the value.

**Validation.** Each condition is normalised. An unknown key, enum value or type id skips the condition with a warning, so a typo never widens a list to All. A preset with another `schemaVersion` is refused with a message.

**File form.** Fields at their default are omitted, a pass-all list is written as `[]`, and every condition sits on one line, so a diff shows one changed condition as one changed line.

**Nesting style conditions.** No Mode column: every condition is an Include condition. `child` is always written, so the default condition reads `{"child": "same"}`. Matching and colours: [gui.md § Appearance tab](gui.md#appearance-tab).

## Palettes

`presets/_palettes.json` holds the palettes every preset can pick from (`appearance.palette`). A palette is a name and a list of named colours; names are unique within the file and within a palette.

```
{ "palettes": [ { "name": "GEMMA", "colors": [ { "name": "Bedrijf gedrag", "hex": "#ffffcc" }, … ] } ] }
```

The file is read when the dialog builds its Appearance tab and at a run that uses a palette colour. An unusable file is reported in the console, naming what is wrong, and the run uses Default. Without the file there are no palettes. The GEMMA palette holds the default fill colours of the GEMMA Archi preferences, one per group of element types.
