# Setting up node_modules (no npm required)

The scripts use CommonJS `require()` to load some libraries. You can set these up **without installing Node.js or npm** by downloading files manually.

## 1. Enable CommonJS in Archi

1. In Archi: **Edit > Preferences > Scripting**
2. Set **JavaScript engine** to **GraalVM**
3. Enable **CommonJS** (if the option is present)
4. Point the **Scripts folder** to the folder that contains `_lib`, `View`, `ImportExport_CSV`, etc. (this `Scripts` directory)

## 2. Already included (no action needed)

These are already in the repo and wired via `Scripts/node_modules/`:

- **papaparse** – uses `_lib/papaparse.min.js`
- **chroma-js** – uses `_lib/chroma.min.js`

## 3. Optional: add more modules manually

If you use scripts that need **xlsx**, **showdown**, or **ascii-table**, create the folder and file below, then download the single file from the URL into that file.

### xlsx (Excel export)

1. Create folder: `Scripts/node_modules/xlsx/`
2. Download: https://unpkg.com/xlsx/dist/xlsx.full.min.js  
3. Save as: `Scripts/node_modules/xlsx/index.js`

### showdown (Markdown)

1. Create folder: `Scripts/node_modules/showdown/`
2. Download: https://unpkg.com/showdown/dist/showdown.min.js  
3. Save as: `Scripts/node_modules/showdown/index.js`

### ascii-table

1. Create folder: `Scripts/node_modules/ascii-table/`
2. Download: https://unpkg.com/ascii-table/ascii-table.min.js  
3. Save as: `Scripts/node_modules/ascii-table/index.js`

## 4. Folder structure

```
Scripts/
├── _lib/
│   ├── Common.js
│   ├── selection.js
│   ├── archi_folders.js
│   ├── papaparse.min.js
│   ├── chroma.min.js
│   └── dagre-cluster-fix.js
├── node_modules/
│   ├── papaparse/
│   │   └── index.js          (re-exports _lib)
│   ├── chroma-js/
│   │   └── index.js          (re-exports _lib)
│   ├── xlsx/
│   │   └── index.js          (paste downloaded xlsx.full.min.js)
│   ├── showdown/
│   │   └── index.js          (paste downloaded showdown.min.js)
│   └── ascii-table/
│       └── index.js          (paste downloaded ascii-table.min.js)
├── View/
├── ImportExport_CSV/
└── ...
```

## 5. Verify

In Archi, run a script that uses e.g. CSV import/export or View generation. If you see errors about a missing module, check that the corresponding `node_modules/<name>/index.js` exists and that the Scripts folder preference points to this `Scripts` directory.

## 6. Scripts still using load()

Some scripts may still call `load()` for local `.js` files. They have been migrated to use `require()` with paths relative to the Scripts folder, for example:

- `_lib/Common.js`, `_lib/selection.js`, `_lib/archi_folders.js`
- `View/include_view.js`
- `ImportExport_CSV/include_import.js`, `ImportExport_CSV/include_export.js`
- `GGM/include_ggm_gemma.js`, `GGM/config.default.js`
- `Sync from CSV/Include_LoadAndSync.js`
- `includeMergeConcept.js`

If you run a script and see an error about `load` or a missing module, ensure CommonJS is enabled and the Scripts folder in Archi points to this `Scripts` directory.

## 7. Using npm (optional)

If you prefer to use npm:

```bash
cd Scripts
npm install papaparse xlsx showdown ascii-table chroma-js
```

Then you can remove the manual `node_modules/papaparse` and `node_modules/chroma-js` wrappers if you want; `require("papaparse")` etc. will use the npm-installed packages.
