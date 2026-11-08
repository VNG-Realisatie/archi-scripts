# View architecture model

An ArchiMate model (no views) of the View subsystem and its wrappers: modules, dependencies, contracts, data, and the workflows to run, design, build, test, version and commit. Application processes are the fine-grained steps of the scripts; they realise application services, which serve the business processes.

The build adds a knowledge model, derived from the content: one element per element type used and one relation per relation type used between two element types (folders `Knowledge model`), with a grouping per top folder that aggregates its types; the documentation gives the counts.

| File | What |
|---|---|
| `architecture_model.js` | The content: elements, dependencies, structure and relations as tables. Edit this. |
| `build_architecture_model.ajs` | Builds the model and saves `view-architecture.archimate` with stable ids. |
| `view-architecture.archimate` | The built model. Generated: never edit by hand. |
| `sync_architecture_model.ajs` | After an import into another model: removes what an earlier export added and this one no longer has. |

## Build

Run `build_architecture_model.ajs` in Archi (no selection; close the architecture model first if it is open), or headless (skill `jarchi-scripting` § Running headless; no `--loadModel`).

Every object keeps its id from build to build (how: the header of `build_architecture_model.ajs`). Renaming a key in `architecture_model.js`, or changing a relation's type, ends or name, gives that object a new id: after the next import it is a new object.

## Import into another model

1. The first time, and after a change to the builder: on a copy of the target model.
2. Select the target model in the model tree, then *File › Import › Another model into selected model…*, choose `view-architecture.archimate` and turn on updating existing objects. Archi merges by id: a new export updates what an earlier one added.
3. Run `sync_architecture_model.ajs` on the target model. It lists in the console what carries an older export date (no longer in the export) and deletes it, also from views, after confirmation; then the empty folders of an older export.
4. Check the result and commit (coArchi).

An element you made by hand before the first import is not linked to the export: it appears twice once. Merge it into the imported one in Archi; from then on the ids stay.

The approach follows the GEMMA-kenniswerkplek export (skill `gemma-archimate-model-archimate-export`); the sync script is adapted from its `wiki-gemma-model-sync.ajs`.
