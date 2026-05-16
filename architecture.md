# Architecture

## Scripts/ folder organization

| Folder | Domain |
|---|---|
| `Scripts/` (root) | Frequently-used utilities: merge elements/relations, reverse relations, add properties, link to view |
| `Scripts/Appearance/` | View formatting: color by property, reset format, toggle figure display |
| `Scripts/Beheren/` | Bulk model management: delete unused elements/folders, find duplicates, create project model |
| `Scripts/Convert to/` | Change ArchiMate element type (by layer: Strategy, Business, Application, etc.) |
| `Scripts/Develop/` | Script development aids: display IDs and color codes in views |
| `Scripts/GEMMA/` | GEMMA model management: Object IDs, release model creation, GGM CSV import/export |
| `Scripts/ImportExport_CSV/` | Bidirectional CSV sync: export/import elements, relations, views with properties |
| `Scripts/Layout/` | Visual relation layout: star-shaped bendpoints, spread overlapping relations |
| `Scripts/Report/` | Markdown report generation from views |
| `Scripts/Sync from CSV/` | Bulk object creation and update from CSV |
| `Scripts/View/` | Automated view generation with graph layout (ELK, Dagre, Graphviz) |
| `Scripts/_lib/` | Shared utilities: Common.js (logging), selection.js, vendored Node.js libraries |
| `Scripts/_test/` | Test and validation scripts |
| `Scripts/node_modules/` | Vendored dependencies (dagre, ELK, chroma-js, papaparse, showdown, underscore) |

## File types
- `.ajs` — executable Archi scripts (visible in Archi Script Manager)
- `.js` — library modules loaded via require() (not visible in Archi)

## Module pattern
- CommonJS: require() / module.exports
- Library modules in `_lib/` are shared across all domains
- Each domain folder is independent — no cross-folder dependencies
- Vendored libraries in `node_modules/` are loaded via require()

## Dependency rules
- Any script may depend on `Scripts/_lib/`
- Domain folders do not depend on each other
- View domain is the most complex: GUI → presets → layout engine → _lib

## Subsystem rule files
Each subfolder may contain a CLAUDE.md with rules specific to that subfolder.
Those rules apply only to scripts in that subfolder and override general project rules.
Currently: `Scripts/View/CLAUDE.md` (SWT dialog, layout engine, parameter model).
