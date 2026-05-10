# GUI Text Consistency Plan

## 1. Tone and Style Guide

**Voice**
Write as a knowledgeable colleague explaining a tool to another architect. Address the user directly ("you", "your"). Never write in the passive voice for instructions.

**Sentence style for labels**
Labels and headings use title-initialised nouns only — no trailing colons unless the label is followed immediately by an input control on the same row. Example: `"View name:"` is correct because the text field follows on the same line. `"Element filter"` as a group heading has no colon.

**Sentence style for descriptions and tooltips**
Full sentences. Capital letter to open, period to close. One sentence per idea. Maximum two sentences in a tooltip unless the control is genuinely complex (three is acceptable, never more).

**Active vs passive**
Always active. Not "Relations are filtered by type" — instead "Filters relations by type".

**Length guidelines**

| Text type | Target length | Hard maximum |
|---|---|---|
| Group heading | 1–3 words | 4 words |
| Field label | 1–4 words | 5 words |
| Checkbox / button text | 2–6 words | 8 words |
| Description line | 1 short sentence | 120 characters |
| Tooltip | 1–2 sentences | 3 sentences / 200 characters |

**What to avoid**
- Engine names in label text: "rectpacking", "network-simplex", "ELK", "Dagre" must not appear in a label or checkbox text. Tooltips only, parenthetically, where a user may need to look it up.
- Words from the banned vocabulary: "node", "edge", "link", "connection", "grouping", "hierarchy config", "positioning", "structure engine".
- Filler phrases: "This option...", "When enabled...", "When checked...". State the effect directly.

---

## 2. Vocabulary Mapping

### From CLAUDE.md (canonical — use exactly)

| Use this | Never use |
|---|---|
| Element | node, box, item |
| Relation | edge, link, connection |
| Nesting | grouping, hierarchy config |
| Container | group, box, region |
| Layout | structure engine, positioning |
| Elements & relations | nodes & edges |
| Nesting rules | grouping rules, hierarchy rules |

### UI-specific extensions

| Concept | Canonical UI term | Avoid |
|---|---|---|
| Traversal depth spinner | "Relation levels" | depth, hops, steps, graph depth |
| The root layout algorithm choice | "layout style" | algorithm, engine, ranker |
| Horizontal/vertical flow setting | "flow direction" | orientation, axis |
| How relation lines are drawn | "relation lines" (noun) / "line style" (label) | edge routing, connector style |
| The Dagre layer-assignment strategy | "layer ranking" | ranker, ranking algorithm |
| The rectpacking child algorithm | "tight packing" | rectpacking (in labels), rectangle packing |
| Space around content inside a container | "container padding" | inner margin, inset |
| Space between elements at the same level | "element spacing" | node spacing, node-node gap |
| Space between levels/layers | "level spacing" | layer spacing, layer separation |
| A saved configuration file | "preset" | parameter file, config file |
| Action result: create one view | "New view" | Generate view, Create view |
| Action result: re-run layout only | "Re-layout" | Layout only, Reposition, Rearrange |
| Action result: one view per element | "One view each" | Per element |

---

## 3. Section-by-Section Text Review

### Dialog title and subtitle

| | Current | Proposed |
|---|---|---|
| Window title | `"View generation and layout"` | `"Generate or lay out a view"` |
| Subtitle | `"Configure how the view is built and how elements are arranged."` | `"Choose what to generate and how to lay it out, then click Generate."` |

*Rationale: Subtitle now tells the user what to do and closes the loop with the button name.*

---

### Action bar (row 1)

| Button | Current text | Proposed text | Tooltip (proposed) |
|---|---|---|---|
| GENERATE_SINGLE | `"New view"` | `"New view"` (keep) | "Creates or updates a single view from the selected elements and their relations. Use 'View name' to set the view title." |
| GENERATE_MULTIPLE | `"Per element"` | `"One view each"` | "Creates one view per selected element. Each view is named after its element." |
| EXPAND_HERE | `"Expand"` | `"Expand view"` | "Adds elements related to the current selection to the open view. Existing elements are kept in place." |
| LAYOUT | `"Layout only"` | `"Re-layout"` | "Re-lays out all elements on the selected view. No elements or relations are added or removed." |

*The `"Generate:"` label before the buttons can be removed or replaced with `"Action:"` — the button group is self-explanatory.*

---

### View fields row (row 2)

| Widget | Label | Proposed tooltip |
|---|---|---|
| txtViewName | `"View name:"` (keep) | "Name for the view to create. Leave blank to use the first selected element's name. Only applies to 'New view'." |
| spinDepth | `"Relation levels:"` (keep) | "How many relation steps to follow from the selected elements. 1 includes only directly connected elements. Applies to New view, One view each, and Expand view." |

---

### Preset bar (row 3)

| Button | Proposed tooltip |
|---|---|
| Apply | "Replace current settings with those from the selected preset." |
| Save as… | "Save the current settings as a named preset for later use." |
| Manage… | "Edit preset descriptions or delete presets you no longer need." |

---

### Preset manager dialog

| Element | Current | Proposed |
|---|---|---|
| Shell title | `"Manage Presets"` | `"Manage presets"` |
| Subtitle | `"Click the description cell to edit it inline. Ctrl+Enter to confirm."` | `"Click any description to edit it in place. Press Ctrl+Enter to save, or Escape to cancel."` |
| Column header | `"Description — click to edit"` | `"Description"` |
| Delete confirm | `"Delete: <fname>?"` | `"Delete preset '<fname>'? This cannot be undone."` |
| Protected file alert | `"Cannot delete the default preset."` | `"'default_parameter.js' is the built-in default and cannot be deleted."` |

---

### Preset review dialog

| Element | Current | Proposed |
|---|---|---|
| Shell title | `"Preset Review"` | `"Apply preset"` |
| Dialog title | `"Review Preset: <name>"` | `"Apply preset: <name>"` |
| Subtitle | `"The following settings will change when this preset is applied."` | `"These settings will change. Review them before applying."` |
| OK button | `"Apply Changes"` | `"Apply"` |

**Human-readable key map (`promptPresetReview`):**

| Config key | Current label | Proposed label |
|---|---|---|
| `includeRelationType` | "Relationship types" | "Relation types" |
| `excludeFromView` | "Respect excluded relations" | "Skip excluded relations" |
| `layoutReversed` | "Reversed relationships" | "Reversed relations" |
| `layoutNested` | "Nested relationships" | "Nesting relations" |
| `elkEdgeRouting` | "Relation style" | "Relation line style" |
| `elkNestedAlgorithm` | "Pack containers tightly" | "Tight packing" |

*All other map entries are correct.*

---

### Tab 1 title

| Current | Proposed |
|---|---|
| `"  Selection of elements and relations  "` or `"  Element & relation filter  "` | `"  Selection  "` |

*"of elements and relations" states the obvious in an ArchiMate tool.*

---

### Group: Element filter

| Element | Current | Proposed |
|---|---|---|
| Heading | `"Element filter"` | keep |
| Description | `"Include only elements of selected types. Leave empty to include all."` | `"Include only elements of these types. Leave the list empty to include all types."` |
| Selected list label | `"Active selection — double-click to remove:"` | `"Selected types — double-click to remove:"` |
| Search placeholder | `"Type to search..."` | `"Search types..."` |

---

### Group: Relationship filter → Relation filter

| Element | Current | Proposed |
|---|---|---|
| **Heading** | `"Relationship filter"` | **`"Relation filter"`** |
| Description | `"Include and follow only relationships of selected types..."` | `"Follow only relations of these types. Leave the list empty to follow all types. Use ← and → to restrict direction."` |
| tglIn tooltip | `"Incoming only — traversed element is the target.\nSelect neither for both directions."` | `"Follow this relation type only when it arrives at the selected element (incoming). Leave both arrows active to follow both directions."` |
| tglOut tooltip | `"Outgoing only — traversed element is the source.\nSelect neither for both directions."` | `"Follow this relation type only when it leaves the selected element (outgoing). Leave both arrows active to follow both directions."` |

---

### Exclude from view

| Element | Current | Proposed |
|---|---|---|
| Description label | `"To skip specific relations regardless of type, mark them in the Archi model:"` | `"To skip individual relations regardless of type, set the property 'excludeFromView = true' on them in Archi:"` |
| Checkbox text | `"Skip relations marked as excluded"` | keep |
| Tooltip | (see current) | `"Relations with the property 'excludeFromView = true' are skipped, regardless of type. Elements reachable only through those relations are also excluded from the view."` |

---

### Debug checkbox

| Element | Current | Proposed |
|---|---|---|
| Text | `"Write detailed log to console"` | keep |
| Tooltip | `"Writes step-by-step processing details to the console. Useful for diagnosing unexpected results."` | `"Logs each step of the generation process. Use this to diagnose unexpected results."` |

---

### Tab 2 title

| Current | Proposed |
|---|---|
| `"  Layout and nesting  "` | `"  Layout  "` |

---

### Group: Layout style

**Category label tooltips:**

| Label | Proposed tooltip |
|---|---|
| `"Hierarchical:"` | "Lays out elements in ranked layers following relation direction. Best for diagrams with a clear flow or hierarchy." |
| `"Organic:"` | "Lays out elements based on relation strengths, without a fixed direction. Good for exploratory or peer-to-peer diagrams." |
| `"Packing:"` | "Arranges elements compactly without regard to relation direction. Best when elements are disconnected or loosely connected." |

**Algorithm radio tooltips:**

| Radio | Proposed tooltip |
|---|---|
| layered | "Arranges elements in ranked layers following relation direction. The most configurable style — handles complex structures and cross-container relations. Best choice for most ArchiMate views." |
| dagre | "An alternative hierarchical layout, faster on large diagrams. Try it when Layered gives unsatisfactory results. Supports layer ranking." |
| mrtree | "Best for pure tree structures and organisation charts." |
| force | "Lays out elements freely based on relation strengths. Good for exploratory overviews." |
| stress | "Similar to Force but produces more even spacing between elements." |
| radial | "Lays elements out in rings from the starting element. Ring gap is controlled by level spacing." |
| box | "Arranges elements with few or no relations in a compact grid." |
| rectpacking | "Packs elements into the smallest rectangle with no gaps. Best when all relations are nesting and no relation lines are visible." |

---

### Flow direction

**Label:** `"Flow direction:"` (keep)

| Radio | Proposed tooltip |
|---|---|
| Right | "Relations flow from left to right." |
| Down | "Relations flow downward. Best choice when using nesting." |
| Up | "Relations flow upward." |
| Left | "Relations flow from right to left." |

*Remove the cross-container placement note from the Right tooltip — it belongs in documentation.*

---

### Relation line style

**Label:** Change `"Relation style:"` → `"Relation lines:"`

| Radio | Proposed tooltip |
|---|---|
| ORTHOGONAL | "Draws relation lines with right-angle bends. Best results with Layered layout." |
| POLYLINE | "Draws relation lines with diagonal bends. Works with all layout styles." |
| STRAIGHT | "Draws relation lines as straight lines." |

---

### Layer ranking (Dagre only)

| Radio | Proposed tooltip |
|---|---|
| network-simplex / Balanced | "Minimises relation length and overlaps. Produces the most polished result. Best for most diagrams." |
| tight-tree / Uniform | "Near the same quality as Balanced but significantly faster. Good choice for large diagrams." |
| longest-path / Top-aligned | "Fastest option. Places elements as high as possible — leaf elements appear at the bottom. May produce longer relation lines." |

---

### Use relation weights

| Element | Current | Proposed |
|---|---|---|
| Checkbox text | `"Use relation weights — attract elements by relation type"` | `"Group closely related elements together"` |
| Tooltip | `"Assigns a weight to each relation type..."` | `"Pulls strongly related elements closer together. Composition and Aggregation pull the hardest; Influence the least."` |

---

### Spacing & size

| Widget | Proposed tooltip |
|---|---|
| spinWidth | "Default width for elements on the view, in pixels." |
| spinHeight | "Default height for elements on the view, in pixels." |
| spinNodeSep | "Gap between elements at the same level, in pixels." |
| spinLayerSep | "Gap between levels in the diagram, in pixels." |

*Width and height currently have no tooltips — add them.*

---

### Group: Reverse

| Element | Current | Proposed |
|---|---|---|
| Description | `"Select which relationship types should be drawn in the opposite direction in the layout."` | `"Select which relation types should flow in the opposite direction when laying out the diagram."` |

---

### Group: Nesting

| Element | Current | Proposed |
|---|---|---|
| Description | `"Select which relationship types render the related element inside a container."` | `"Select which relation types place the related element inside a container."` |
| Container padding tooltip | `"Space between the edge of a container and its child elements."` | `"Gap between a container's edge and the elements inside it, in pixels."` |
| chkMultiOcc text | `"Show element in every container"` | keep (trim trailing spaces) |
| chkMultiOcc tooltip | `"When enabled, an element that belongs to multiple containers..."` | `"An element belonging to multiple containers appears in each of them. By default it appears only in the first matching container."` |
| chkSortContainers text | `"Sort containers — may produce more whitespace inside"` | `"Sort containers alphabetically"` |
| chkSortContainers tooltip | (current) | `"Sorts containers alphabetically and places them before ungrouped elements. This can create extra whitespace inside containers. When unchecked, containers stay in model order."` |

---

### Group: Packed layout

| Element | Current | Proposed |
|---|---|---|
| spinNestedSpacing tooltip | `"Space between child elements inside a packed container."` | `"Gap between elements inside a packed container, in pixels."` |
| chkNestedPack text | `"Pack container children tightly (rectpacking)"` | `"Pack elements tightly inside containers"` |
| chkNestedPack tooltip | `"Uses rectangle packing inside each container..."` | `"Packs elements inside each container into the smallest rectangle, eliminating gaps. Best when all relations are nesting and no relation lines are visible."` |
| chkExpandToFill text | `"Equal row height — expand elements to match containers"` | `"Equal row height"` |
| chkExpandToFill tooltip | `"When a row contains both sub-containers (tall)..."` | `"In a row that mixes containers (tall) and plain elements (short), expands all items to the same height. Use this when containers and elements appear side by side and you want them visually aligned."` |
| lstExpandExclude label | `"Keep original size for (not expanded):"` | `"Never resize these element types:"` |
| lstExpandExclude tooltip | `"Element types that are never resized to match containers — they keep their natural nodeWidth × nodeHeight."` | `"Element types in this list keep their original width and height even when equal row height is on."` |

---

## 4. Tooltip Guidelines

### What belongs in a tooltip vs a label

| Content | Where it goes |
|---|---|
| The name of a control's function | Label |
| The outcome of enabling/changing the control | Tooltip — first sentence |
| When to use this control | Tooltip — second sentence |
| Caveats, warnings, side effects | Tooltip — second or third sentence |
| Default value reminders | Omit unless non-obvious |
| Technical algorithm names or property names | Tooltip only, parenthetically, only if the user may need to look it up |
| Cross-control dependencies ("only applies to X") | Tooltip — first if primary, last if secondary |

### Tooltip length

- **One sentence**: Use for controls whose label is already fully descriptive (spinners, standard checkboxes).
- **Two sentences**: Use for controls where the outcome alone is not enough — the user also needs to know when to use it.
- **Three sentences**: Reserve for complex controls with non-obvious side effects. Never exceed three.

### Tooltip sentence pattern

> **[What it does].** [When to use it or what to expect.] [Side effect or caveat, if any.]

### Capitalisation and punctuation

- First word capitalised, period at the end of each sentence.
- Do not use `\n` inside a single-sentence tooltip.
- For two-sentence tooltips, use a single space between sentences.
- For three-sentence tooltips, a `\n` before the third sentence is acceptable when it is a warning or caveat.

### What not to put in tooltips

- "When enabled, ..." / "When checked, ..." — state the effect directly.
- "This option ..." — start with the verb.
- Redundant restatements of the label.
- Code syntax except where unavoidable (e.g., the `excludeFromView` property name must appear somewhere — the tooltip is the right place).

---

## 5. Priority Order

**Priority 1 — Vocabulary violations (architects will notice immediately)**
1. `"Relationship filter"` → `"Relation filter"` (group heading)
2. `"Relationship types"` / `"Reversed relationships"` / `"Nested relationships"` in diff-table map → canonical terms
3. `"(rectpacking)"` removed from chkNestedPack label
4. All instances of "connections" in algorithm tooltips replaced with "relation lines"

**Priority 2 — Misleading or jargon-heavy text**
5. `"Per element"` → `"One view each"`
6. `"Layout only"` → `"Re-layout"`
7. Direction toggle tooltips: remove "traversed element is the target/source"
8. `"Use relation weights — attract elements by relation type"` → `"Group closely related elements together"`
9. `"Sort containers — may produce more whitespace inside"` → `"Sort containers alphabetically"`

**Priority 3 — Tooltip quality**
10. Add missing tooltips for spinWidth and spinHeight
11. Tighten chkMultiOcc tooltip
12. Tighten chkExpandToFill tooltip
13. lstExpandExclude label and tooltip

**Priority 4 — Polish**
14. Dialog title and subtitle
15. Tab titles (shorten to `"Selection"` and `"Layout"`)
16. Preset manager dialog copy
17. `"Active selection — double-click to remove:"` → `"Selected types — double-click to remove:"`
18. Remove "This is the default." from Balanced ranker tooltip
