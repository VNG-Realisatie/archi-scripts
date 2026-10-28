# Repo guide — archi-scripts

Where things are and how scripts are put together. Rules: `ai/rules.md`. jArchi itself:
`ai/jarchi-scripting/SKILL.md`.

## Structure

| Folder | Domain |
|---|---|
| `Scripts/` (root) | Frequent utilities: merge, reverse, add properties, link to view |
| `Scripts/Appearance/` | View formatting: colour by property, reset format, toggle figure |
| `Scripts/Beheren/` | Bulk model management: unused elements / folders, duplicates |
| `Scripts/Convert to/` | Change the ArchiMate type of concepts |
| `Scripts/Develop/` | Development aids: plot ids and colours, `probeJArchiApi.ajs` |
| `Scripts/GEMMA/` | GEMMA model management |
| `Scripts/ImportExport_CSV/`, `Scripts/Sync from CSV/` | CSV import / export / sync |
| `Scripts/Layout/` | Connection layout: L/S-shaped, orthogonal, spread |
| `Scripts/Report/` | Markdown reports from views |
| `Scripts/View/` | View generation with ELK, Dagre, Graphviz (`Scripts/View/CLAUDE.md`) |
| `Scripts/_lib/` | Shared modules (below) |
| `Scripts/node_modules/` | Vendored runtime libraries (elkjs, dagre, chroma-js, papaparse, …) — no npm at runtime |
| `types/`, `jsconfig.json`, `package.json`, `tools/` | Static type checking and its verification tools (`types/README.md`) — development only |

Any script may use `Scripts/_lib/`; domain folders do not depend on each other.

## Loading modules

Every file that loads another defines `REPO_ROOT` (the `Scripts/` folder, Windows paths
normalised) and requires by path; `load()` is not used:

```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("../_lib/Common")} */   // in type-checked files (types/README.md)
const Common = require(REPO_ROOT + "_lib/Common");
```

Vendored libraries: `require("chroma-js")` (resolved from the scripts folder) or
`require(REPO_ROOT + "node_modules/elkjs/index.js")`.

## Shared modules (`Scripts/_lib/`)

Signatures are in each module's JSDoc (type-checked for Common, selection, archi_folders).

| Module | Use it for |
|---|---|
| `Common.js` | Start/finish console banner, timing, `debug` / `info` logging, `concept()` (visual → concept), `formatRelation`, UUID, column output |
| `selection.js` | Turning `$(selection)` into model concepts (`getSelection`) or visuals (`getVisualSelection`), expanding folders, views and view references |
| `archi_folders.js` | Folder paths: get-or-create (`getFolderPath`), print a path, delete empty folders |
| `doEach.js` | Bendpoint geometry: absolute bendpoints, L/S-shaped and orthogonal connections, spreading connections |
| `includeMergeConcept.js` | Merging duplicate concepts |
| `jvm-npm.js` | Legacy (Nashorn-era `require` polyfill); not loaded by any script |

## An entry script

`.ajs` files are the scripts users run; keep them thin and put logic in modules. A working
example to copy: `Scripts/View/_generate.ajs` (REPO_ROOT, require, `Common.initConsoleLog`,
one call, `Common.finishConsoleLog`). Guard `model.isSet()` when nothing else does.

## Testing

| What | How |
|---|---|
| Types and API use (View/lib, three `_lib` modules) | `npm run typecheck` (`types/README.md`) |
| View pipeline, nesting, layout graph, ELK / Dagre adapters | Node, no Archi: `node Scripts/View/tools/view_harness.js <model.archimate> "<view path>" [preset.json] --layout`; `nesting_test.js`, `rel_filter_test.js` in the same folder |
| Writer, Graphviz (needs `ProcessBuilder`), dialogs, everything else | Run the script in Archi on a small test model; golden path plus empty selection, one element, deep nesting |
| jArchi API assumptions | `Scripts/Develop/probeJArchiApi.ajs` in Archi |
| A refactor or annotation changes no behaviour | `tools/same-code.js` (code), `tools/compare-layouts.js` (layout output) — `types/README.md` |

CI (`.github/workflows/check.yml`, every push and pull request) runs the typecheck, `rel_filter_test.js`
and `nesting_test.js`; the rest of this table is by hand.

Debug output: the View pipeline logs its steps; `elk.js` logs the ELK options it uses.
