# View — generate and lay out Archi views

Generate and automatically lay out ArchiMate views from a selection.

Use it to:

- quickly generate a starting point for a new view;
- generate complex views completely from one preset — selection, layout, appearance and view properties — and regenerate them when the model changes;
- analyse your model: generate different views, and use nesting to find unexpected or double relations.

All use cases: [SPEC.md § 1](docs/SPEC.md#use-cases).

Started from "generate views using graphlib" by Hervé Jouin (<https://forum.archimatetool.com/index.php?topic=639.msg3563#msg3563>).

## Requirements

- **Archi with jArchi** (tested: Archi 5, jArchi 1.12). In *Preferences › Scripting*: *Enable CommonJS* on, and GraalVM as the JavaScript engine where jArchi offers a choice.
- **Graphviz** on the PATH (the `dot` program), only for the algorithms Dot, Neato, FDP, SFDP, Twopi and Circo. The others need nothing outside this repository.

The scripts run straight from a clone: the layout libraries are included in `Scripts/node_modules/`.

## Getting started

1. Select elements, a folder, or a view (in the model tree or on a canvas).
2. Run **`_gui.ajs`**. The *Generate View* dialog opens:
   - **Selection** — filter the selection and add related elements in steps;
   - **Layout** — algorithm, nesting, flow, element size, connections, view size;
   - **Appearance** — colour elements and relations by property or nesting level;

   Every filter — global filter, steps, nesting, reverse, style by property — is a table of conditions: *Source type · Relation type · Target type*, each condition *Include* or *Exclude*. *All* matches any type. A step's conditions read from the previous step's elements: *Previous step elements · Direction · Added relations · Added elements*.
   - **Properties** — properties written to the generated view.
3. Click an action:
   - **New view** / **One view each** — create view(s) in *Folder* with *Name*;
   - **Expand view** / **Layout only** — change the selected view in place.

Hover over any setting for what it does and which algorithms use it. Settings the chosen algorithm does not use are greyed.

## Presets

A preset is a saved set of dialog settings: `presets/<folder>/<name>.json` (plain JSON). Create and change presets in the dialog — *Save*, *Save As…*, *Rename…*, *Delete*. The last-used settings are kept in `presets/_session.json` (local, not in git). Files starting with `_` are not listed in the dialog; `_Default.json` holds the code defaults.

Presets have a `schemaVersion`. A preset in an older format is refused with a message; bring a version 4 preset up to date with `node Scripts/View/tools/migrate_presets_nesting_style.js` (`--dry-run` first). A version 3 preset: check out commit `deb432c` and run its `tools/migrate_presets_conditions.js` first. Older: check out commit `61c9c52`, run its `tools/migrate_presets_relrows.js` (to version 2) and `migrate_presets_everycontainer.js` (to version 3), then continue with the newer steps.

**Palettes** — `presets/_palettes.json` holds named colours (the GEMMA palette: the GEMMA default fill colours); pick a palette at the top of the Appearance tab and its colours in *Style by nesting level*. Add a palette or colour by editing the file.

## Shortcut scripts

Run a saved preset without the dialog.

**Base preset** — the preset `all` (edit it in the dialog; without it the code defaults `_Default`):

| Script | Action |
|---|---|
| `_generate.ajs` | New view |
| `_generate_multiple.ajs` | One view each |
| `_expand.ajs` | Expand view — from the elements selected on a view; the whole view is laid out |
| `_layout_only.ajs` | Layout only |
| `_layout_LR.ajs`, `_layout_TB.ajs` | Layout only, direction Right / Down, no nesting |
| `_layout_nested_LR.ajs`, `_layout_nested_TB.ajs` | Layout only, direction Right / Down, aggregation as nesting |

**Named preset**: put a script in `shortcuts/` (or a sub-folder; `presets/` holds only the JSON), name it `<preset>_<Action>_<Direction>.ajs` and give it these lines:

```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common    = require(REPO_ROOT + "_lib/Common");
const RunPreset = require(REPO_ROOT + "View/lib/run_preset");

Common.initConsoleLog(__FILE__, true);
RunPreset.fromFilename(__FILE__, $(selection), { folder: "GEMMA" });  // folder optional
Common.finishConsoleLog();
```

- `<preset>` — preset name (with `folder`: `presets/<folder>/<preset>.json`)
- `<Action>` — `Generate` (New view), `GenerateMultiple` (One view each), `Expand`, `Layout`
- `<Direction>` — `LR`, `RL`, `TB` or `BT`; overrides the preset's direction

Example: `TAenIA_Layout_TB.ajs` lays out the selected view with preset `GEMMA views/TAenIA`, top to bottom. Use `{ preset: "folder/name" }` to name the preset explicitly (see `Scripts/GEMMA/GGM/ggmBO_Layout_LR.ajs`), and `{ edit: preset => { … } }` to change the preset in the script before it runs (e.g. `preset.view.folder = "/Generated"`).

## Scripting

```js
const PresetIO   = require(REPO_ROOT + "View/lib/preset_io");
const GenView    = require(REPO_ROOT + "View/lib/generate_view");
const { ACTION } = require(REPO_ROOT + "View/lib/defs");

const preset = PresetIO.readPreset("GEMMA/GGM/GGM data-object specialisaties");
preset.view.folder = "/Data-objecten (GGM)";
preset.view.suffix = " (GGM)";                       // One view each: appended to each name
const views = GenView.generate_view(preset, $(selection), ACTION.ONE_EACH.id);  // → view[]
```

`ACTION`: `NEW_VIEW`, `ONE_EACH`, `EXPAND_VIEW`, `LAYOUT_ONLY`. See `Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs` for a complete example.

## Files

Layers and modules: [ARCHITECTURE.md § Structure](docs/ARCHITECTURE.md#structure); tools and tests: [§ Development and testing](docs/ARCHITECTURE.md#development-and-testing). Documentation: [SPEC.md](docs/SPEC.md), what the subsystem does, with the detail per subject in [docs/reference/](docs/reference/); [ARCHITECTURE.md](docs/ARCHITECTURE.md), the design decisions and how they are realised, per subject.
