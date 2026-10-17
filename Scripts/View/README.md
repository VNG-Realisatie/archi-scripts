# View — generate and lay out Archi views

Generate and automatically lay out ArchiMate views from a selection.

Use cases:

- quickly generate a starting point for a new view
- generate many context views (one element and its related elements each)
- analyse your model by laying it out in different ways
- use nesting to find unexpected relations, double relations, etc.

Based on "generate views using graphlib" by Hervé Jouin
(<https://forum.archimatetool.com/index.php?topic=639.msg3563#msg3563>).

## Getting started

1. Select elements, a folder, or a view (in the model tree or on a canvas).
2. Run **`_gui.ajs`**. The *Generate View* dialog opens:
   - **Selection** — filter the selection and add related elements in steps;
   - **Layout** — algorithm, nesting, flow, element size, connections, view size;
   - **Appearance** — colour elements and relations by property or nesting level;
   - **Properties** — properties written to the generated view.
3. Click an action:
   - **New view** / **One view each** — create view(s) in *Folder* with *Name*;
   - **Expand view** / **Layout only** — change the selected view in place.

Hover over any setting for what it does and which algorithms use it. Settings the chosen
algorithm does not use are greyed and named in the group's hint line.

## Presets

A preset is a saved set of dialog settings: `user_parameter/<folder>/<name>.json` (plain JSON).
Create and change presets in the dialog — *Save*, *Save As…*, *Rename…*, *Delete*. The last-used
settings are kept in `user_parameter/_session.json` (local, not in git).

## Shortcut scripts

Run a preset without the dialog.

**Last-used settings** (session):

| Script | Action |
|---|---|
| `_generate.ajs` | New view |
| `_generate_multiple.ajs` | One view each |
| `_expand.ajs` | Expand view |
| `_layout_only.ajs` | Layout only |
| `_layout_LR.ajs`, `_layout_TB.ajs` | Layout only, direction Right / Down |
| `_layout_nested_LR.ajs`, `_layout_nested_TB.ajs` | Layout only with preset `nested` |

**Named preset**: name a script `<preset>_<Action>_<Direction>.ajs` and give it these lines:

```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common    = require(REPO_ROOT + "_lib/Common");
const RunPreset = require(REPO_ROOT + "View/lib/run_preset");

Common.initConsoleLog(__FILE__, true);
RunPreset.fromFilename(__FILE__, $(selection), { folder: "GEMMA views" });  // folder optional
Common.finishConsoleLog();
```

- `<preset>` — preset name (with `folder`: `user_parameter/<folder>/<preset>.json`)
- `<Action>` — `Generate` (New view), `GenerateMultiple` (One view each), `Expand`, `Layout`
- `<Direction>` — `LR`, `RL`, `TB` or `BT`; overrides the preset's direction

Example: `TAenIA_Layout_TB.ajs` lays out the selected view with preset
`GEMMA views/TAenIA`, top to bottom. Use `{ preset: "folder/name" }` to name the preset
explicitly (see `Scripts/GEMMA/GGM/ggmBO_Layout_LR.ajs`).

## Scripting

```js
const PresetIO   = require(REPO_ROOT + "View/lib/preset_io");
const GenView    = require(REPO_ROOT + "View/lib/generate_view");
const { ACTION } = require(REPO_ROOT + "View/lib/defs");

const preset = PresetIO.readPreset("gemma/ggm/GGM data-object specialisaties");
preset.view.folder = "/Data-objecten (GGM)";
preset.view.suffix = " (GGM)";                       // One view each: appended to each name
const views = GenView.generate_view(preset, $(selection), ACTION.ONE_EACH.id);  // → view[]
```

`ACTION`: `NEW_VIEW`, `ONE_EACH`, `EXPAND_VIEW`, `LAYOUT_ONLY`. See
`Scripts/GEMMA/GGM/4_ggm_gemma_views.ajs` for a complete example.

## Files

| Path | Role |
|---|---|
| `lib/defs.js` | single source of truth: algorithms, parameters, labels, tooltips, preset defaults |
| `lib/generate_view.js` | the API: selection → layout → write the view |
| `lib/selection_pipeline.js` | filter and related-element steps |
| `lib/engines/` | layout engines: ELK, Dagre, Graphviz |
| `lib/appearance.js` | styling pass |
| `lib/preset_io.js` | presets and session |
| `lib/run_preset.js` | filename-driven shortcut scripts |
| `lib/gui/` | the Generate View dialog |
| `tools/check_registry.js` | checks that registry, defaults, dialog widgets, labels and groups agree |
| `tools/gen_docs_tables.js` | writes the parameter tables and capability matrix in ARCHITECTURE.md |

Documentation: [ARCHITECTURE.md](ARCHITECTURE.md) (design and implementation, incl. all
parameters per algorithm) and [SPEC.md](SPEC.md) (rebuild specification).
