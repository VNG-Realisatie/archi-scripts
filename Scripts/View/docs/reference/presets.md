# Presets — reference

The preset file behind [SPEC.md § 4 Data model](../SPEC.md#4-data-model). Keys are the persisted JSON keys; comments use the GUI labels. Defaults and allowed values are in `lib/defs.js` (`DEFAULT_PRESET`, the algorithm registry).

## Preset JSON schema

A preset is a value: it validates against this schema and round-trips losslessly to its stored form.

```
Preset {
  schemaVersion : 3                  // 2 = rule lists; 3 = everyContainer per nesting rule
  name, description : string         // description: shown under the preset combo
  algorithm     : enum               // Algorithm
  params {                           // one key per layout option: the Parameter column of the
                                     // generated tables in gui.md (Layout options, Preset-only options)
    viewSizeMode : "none"|"maxWidth"|"aspectRatio"   // which View size radio; "none" = Free
  }
  filter {                           // every list: [] = keep all
    elementRules  : ElementRule[]    // seed elements
    diagramRules  : DiagramRule[]    // diagram objects of selected views
    relationRules : RelationRule[]   // relations between the filtered elements
  }
  relatedElements { steps : Step[] } // ordered chain, one per step block
  view {                             // Create actions only
    name   : string                  // New view; "" = first selected object
    folder : string                  // path under Views; "" = "/_Generated"
    suffix : string                  // One view each: appended to each element name
  }
  appearance {
    enabled : boolean                // Apply styling: master on/off (not built yet: ARCHITECTURE § Known gaps)
    styleByProperty {
      rules : StyleRule[]            // in order; the later rule wins on one object
      mixedValuesColor : hex         // fill for an object with several values
      lineWidth : 0..3               // 0 = no change; 1 Normal, 2 Medium, 3 Heavy
    }
    nestingLevel {
      fontEnabled, rootFontBold : boolean
      rootFontSize, fontDecreasePerLevel : number (pt)
      colorEnabled : boolean
      rootColor : hex                // fill of root containers (darkest)
      lightenPerLevel : number (%, 0–50)
    }
    highlightRepeated { enabled : boolean, colorRange : scheme name }
  }
  engineParams { ELK?, Dagre?, Graphviz?, layout? }   // per-engine expert overrides, deep-merged
                                                      // over the adapter defaults; no dialog control
  viewProperties {
    addObjectId : boolean            // write a unique Object ID when the view has none
    properties : { key, value : string, enabled : boolean }[]   // key never "Object ID"
  }
}
Step { repeat : 1..5 | "untilNothingNew", rules : StepRule[] }   // [] = follow every relation
```

`repeat`: each run starts from the previous run's additions; *until nothing new* stops when a run adds nothing, at most 10 runs.

## Rule lists

One rule model for every list. A list keeps what matches **any active Include rule**, unless an **Exclude rule** matches too. Order has no meaning, except for style rules, where the later rule wins. A type field holds a type id or `""` (= All). Defaults: `mode` is `"include"`, `on` is true, `everyContainer` is false.

**On / off.** Every rule can be switched off without deleting it. An off rule keeps, adds and removes nothing. An off Include rule still counts as an Include rule, so a list whose Include rules are all off keeps nothing (filter: no elements; step: adds nothing). Only a list without Include rules falls back to its *Empty list* behaviour below.

| Rule kind | Fields | Used by | Empty list |
|---|---|---|---|
| element  | on, mode, elementType, property, value | `filter.elementRules` | keep all |
| diagram  | on, mode, diagramType | `filter.diagramRules` | keep all |
| relation | on, mode, source, relation, target, propertyOf (`relation`/`source`/`target`), property, value, everyContainer (nesting rules only) | `filter.relationRules`, `params.nestingRules`, `params.reverseRules` | filter: keep all · nesting / reverse: none |
| step     | on, mode, previous, direction (`either`/`outgoing`/`incoming`), relation, added, propertyOf (`added`/`relation`/`previous`), property, value | `steps[].rules` | follow all |
| style    | on, color (`element`/`relation`/`source`/`target`), source, relation, target, propertyOf (`element`/`relation`/`source`/`target`), property, colorRange | `appearance.styleByProperty.rules` | no styling |

**Step rules are written from the previous step's elements.**
- `direction`: `outgoing` = the previous-step element is the relation's source; `incoming` = it is the target; `either` (default) = both.
- `previous` constrains the previous-step element's type, and `added` the new element's type. `propertyOf` says whose property must equal `value`.
- Which relations a step *draws*: an Include rule matches on relation type, direction and `previous` only; `added` and the property only decide which elements join. An Exclude rule matches in full.

**Style rules.**
- `color` says what gets the colour:
  - `element`: the element, by its own property; `source` holds its type;
  - `relation`: the relation;
  - `source` / `target`: that end of a matching relation. Relations are taken model-wide, so the relation need not be on the view.
- `propertyOf` says whose property gives the value.

**Validation.** Each rule is normalised. An unknown key, enum value or type id skips the rule with a warning, so a typo never widens a list to All. A preset with another `schemaVersion` is refused with a message.

**File form.** Fields at their default are omitted, a pass-all list is written as `[]`, and every rule sits on one line, so a diff shows one changed rule as one changed line.
