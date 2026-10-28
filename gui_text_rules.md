# GUI text and layout rules

Rules for writing labels, tooltips and button text in `.ajs` GUI scripts.
Audience: advanced functional user — architect or engineer who knows ArchiMate but not the underlying layout engine.

---

## Language & tone

- Active voice. Describe what the setting does for the user, not how it is implemented internally.
- No library or algorithm names in visible text: no ELK, dagre, mrtree, DAG, network-simplex, elk.spacing.nodeNode, etc.
- Use functional equivalents for algorithm names:

  | Internal name | Display name |
  |---|---|
  | layered | Hierarchical |
  | mrtree | Tree |
  | force | Organic |
  | box | Grid |
  | stress | Balanced organic |
  | radial | Radial |
  | dagre | Hierarchical (nested) |

---

## Terminology

| Avoid | Use instead |
|---|---|
| Node | Element |
| Edge / edge routing | Connector / connector style |
| Graph | Diagram or View |
| Algorithm | Layout style |
| Rank / layer | Level |
| Direction | Flow direction (when referring to relation flow) |
| Node placement | Element alignment |
| Layer spacing | Level spacing |
| Node spacing | Element spacing |
| Debug trace | Write detailed log to console |

---

## Labels

- Keep labels short; the tooltip carries the explanation.
- Sentence case, not Title Case, for descriptions and group text.
- No "(px)" suffix on spinner labels — units are implied.

---

## Button text

- Verb only, no qualifier: "Load" not "Load Selected Preset", "Delete" not "Delete Selected Preset".
- The primary action button names the task: "Generate" not "Run".

---

## Tooltips

- Lead with the effect: "When enabled, ..." / "Relations are drawn as ..." / "Creates or updates ...".
- State the default explicitly where the distinction matters: "When disabled (default), ...".
- Do not repeat the label verbatim — add meaning.
- Do not mention internal parameter names, file formats, or algorithm-specific options.
- For checkboxes: describe both the enabled and disabled state when the distinction matters.
- For radio buttons: one short sentence per option is enough.

---

## Group descriptions

- Explain what the group controls and when it matters, not how it works internally.
- Full sentence with period for explanatory text; no period for short fragment headings.

---

## SWT layout

- Use `GridDataFactory.swtDefaults()` on spinners, **not** `fillDefaults()` — `fillDefaults()` sets `SWT.FILL` which stretches the widget to fill its column width.
- Set the same `hint(width, SWT.DEFAULT)` on all spinners of the same category so they are equal width. 50px fits 3-digit numbers comfortably.
- For multi-row radio option blocks: give the label column a fixed hint (e.g. 115px) and pass a `colWidth` to `createRadios` (e.g. 90px) so radio buttons align across rows.
- Use `SWT.SEPARATOR | SWT.HORIZONTAL` spanning the full width to separate logically distinct sub-sections within a group box.
- Layout order within a group: main interactive control (list builder) at the top → toggles/checkboxes below a separator → fine-tuning spinners last.
- Aggregate or global controls (e.g. container padding) go at the very bottom of their group.
- Widen Add/Remove buttons equally (95px) so the shorter "Add >" and longer "< Remove" labels both fit comfortably.
