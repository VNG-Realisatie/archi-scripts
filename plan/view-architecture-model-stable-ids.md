# View architecture model: stable ids for import

Approved 2026-11-03 (option A). Done 2026-11-03: steps 1–4; the sync script's confirm dialog itself is not run headless (its selection is). Top-level folders get no export date (the import carried it onto the target's own). Model: `Scripts/View/docs/architecture-model/`.

## Goal

The View architecture model can be imported into another model (Archi: *Import › Another model into selected model*, which merges by id) and re-imported after a rebuild without duplicates: every object keeps its id across builds, and objects a newer build no longer has can be removed.

## Approach (after GEMMA-kenniswerkplek, `wikis/gemma-archimate-model`, skill `gemma-archimate-model-archimate-export`)

- jArchi cannot set an id. The builder saves the model as before, then rewrites every id in the saved file to `"id-" + uuid5(namespace, key)`:
  - element: `element/<key in architecture_model.js>`;
  - relation: `relation/<type>/<source key>/<target key>/<name>`;
  - folder: `folder/<path>`; the model: `model`.
  An id the builder did not map stops the build.
- Every element, relation and folder gets the property `view-architecture export date` (ISO time of the build).
- `sync_architecture_model.ajs`, adapted from GEMMA's `wiki-gemma-model-sync.ajs`: on the target model after the import, deletes what carries an older export date (relations first), then the stale folders left empty; shows the list and asks first.
- `README.md` in the model folder: build, import, sync.

## Limits

- Renaming a key gives a new id (no alias field until one is needed).
- The first import does not know hand-made copies of these elements in the target model: they appear twice once.

## Steps

1. Builder: export date, id map, uuid5, rewrite the saved file. Check: two builds give the same ids; uuid5 equals Node's for a sample key.
2. Sync script.
3. README.
4. Check: import into a copy of a model through `model.merge` in Archi's command line, twice, and the sync script's selection.
