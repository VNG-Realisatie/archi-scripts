# View: view recipes and view templates

## Prompt

> Make a plan for repeatable, publishable GEMMA views from **view recipes** in the model, beside unchanged ad hoc generation.
>
> **Read first:** `Scripts/View/AGENTS.md`; SPEC § Vocabulary and Regenerate; `plan/view-repeatable-generation.md`; `lib/run_preset.js`, `lib/view_origin.js`, `lib/generate_view.js` (`_targetView`, `_getOrCreateView`, `applyViewProperties`); `lib/background.js`; `Scripts/GEMMA/createReleaseModel.ajs`. In the saved model (`gemma-archi-repository/.git/temp.archimate`): the view *View recipes*, its groupings, aggregations and nested view references, and the Object IDs they carry.
>
> **Given:**
> - A recipe is a grouping with metadata (`View recipe` = `view` | `group`, its own `Object ID`, `View Object ID` for the view, `View preset` as information only). A folder and the view *View recipes* are containers for finding and maintaining recipes.
> - The view template of a recipe is the view reference nested in its visual on *View recipes*: a reference inside the model, which survives renames.
> - The link runs from preset to recipe: the preset holds the recipe's id and its name as a label (the `backgroundView` pattern). Save writes it when the start is exactly one recipe; the dialog refreshes the label; a run never writes a preset.
> - A recipe as the start sets the action (from its kind), the view template and the Object ID, visibly in the dialog. Any other start is ad hoc, as now, with the view template from the Layout tab.
> - Generate-all goes over the presets that are linked to a recipe in the open model. Stale views are found by `View last generated` and deleted after confirmation.
> - Renames: background view → view template, origin → generation record (property `View generation record`).
> - Publication through `createReleaseModel.ajs`. Headless-ready, no CI.
>
> **Plan contents:** terms with definitions (quote the current SPEC); objective; requirements; what is stored where, one carrier per row; dialog behaviour; check, generate, sync, Regenerate; how it connects to existing code; blocks with model and user checks, following the order of change; verification.

Status: approved 2026-11-25; blocks 0 and 1 done.

## Context

Publishable GEMMA views must be made the same way every time: by a colleague, by a jArchi script over all views, later perhaps headless in CI. Today the parts of that are spread out:

- **Preset:** says how. It also holds the background view as id + path; the paths have gone stale since the views moved.
- **Model:** the view *View recipes* shows the start groupings and, nested in their visuals, view references to the view templates. Nothing reads them.
- **Origin** (renamed to generation record here): records afterwards what a run did; there is no description beforehand.

What is missing is a recipe in the model (start, view template, Object ID), a fixed link from a preset to its recipe, and a script that generates all views from them. Ad hoc generation for analysis stays as it is.

## The reasoning: where each link lives

A link survives a rename on the side where it uses an id, and breaks on the side where it uses a name.

| Link | Where | Survives |
|---|---|---|
| preset → recipe | the preset: recipe id + name as label | renaming or moving the recipe in the model; renaming the preset (inside the repo) |
| recipe → view template | the view reference on *View recipes*, nested in the recipe's visual | renaming or moving the view template; it is a reference inside the model |
| recipe → view | `View Object ID` on the recipe = `Object ID` on the view | renaming the recipe (a new view with the same Object ID; the old one becomes stale) |
| recipe → preset | `View preset` on the recipe, **information only** | not needed: nothing reads it |

What it costs, accepted on purpose:
- A linked preset is bound to one model and to one recipe, as presets with a view template already are.
- A new publishable view means a change in two places: a recipe in the model, and a preset saved in archi-scripts.

## Terms

Definitions go into `Scripts/View/docs/SPEC.md` § Vocabulary (hard rule 2); the current definitions they replace are quoted.

**view recipe**
A grouping whose metadata (property `View recipe` = `view`) make it the description of exactly one generated view.
- Its start is the grouping itself; the preset's steps follow its relations.
- It carries the Object ID the view gets.
- Its view template is the view reference nested in its visual on *View recipes*, or that of its group.

**view recipe group**
A grouping whose metadata (`View recipe` = `group`) make it a set of view recipes. It aggregates them, carries the view template for all of them, and makes one view per view recipe (*One view each*). A single view recipe makes one view (*New view*). The action follows from the kind.

**View recipes** (the folder and the view)
Containers in which the user can find and maintain the recipes easily. The view also records each recipe's view template, as a view reference nested in the recipe's visual. The metadata make a grouping a recipe; the folder does not.

**recipe link**
The link from a preset to one recipe: its id, and its name as a label. Save writes it.

**view template**
Replaces *background view*. Current definition: "a view a preset names as the map a generated view is drawn on: its elements are always on the view, the selection fills it".

New definition: a view in the model that a generated view is made from. It gives three things:
- *content*: its elements and diagram objects are always on the generated view;
- *structure*: the table of cells in which its containers keep their places;
- *look*: the appearance of its elements, as the base layer of the styling.

The selection fills it.

Derived terms, renamed the same way:
- *template look* (was *background look*);
- *template container* (was *background container*);
- the condition value *Template* (was *Background*);
- *Leaves in place* stays.

**generation record**
Replaces *origin*. Current definition: "how a generated view was made (start, destination, preset, action), kept on the view, so it can be made again".

New definition: what a run records on the view it generated:
- preset (by name), action, start, destination (folder, mirrored);
- for *One view each*, its element;
- the recipe it came from;
- marks such as modified settings.

*Regenerate* makes a view again from its generation record. A recipe is the description beforehand; the generation record is the result afterwards.

**last generated**
The date and time of the run that last wrote the view.

**stale view**
A view generated from a recipe that the last run over that recipe did not write: its name changed, or its recipe or preset is gone.

## Objective

1. A recipe in the model and a linked preset together fully describe a publishable view.
2. The dialog recognises a recipe as the start and applies it visibly; any other start is ad hoc, as now.
3. One script generates the views for all linked presets, or the selected ones, in Archi and headless, and keeps every view's Object ID.
4. Sync: stale views are reported and removed after confirmation.

## Requirements

- **Visible and manageable in Archi.** Recipes are groupings with properties, their members and their view template are visible on *View recipes*, and `View preset` shows which preset makes each recipe.
- **No circular truth.** Each link has one source (§ The reasoning). `View preset` is derived information, written by Save and by generate, and never read.
- **Checkable.** A check reports every inconsistency before anything is written. Generate runs it first and writes nothing for a recipe that fails it.
- **Object ID stays.**
  - The Object ID of a view comes from its view recipe (`View Object ID`); generate writes a new one when it is missing.
  - The recipe grouping has its own `Object ID`, as every element in the GEMMA repo must. That is why the view's Object ID has its own key.
- **No ids shown.** The dialog, the console and the check show names and paths; ids live only in the files.
- **Visible, never silent** (View hard rule 20). What a recipe overrules (action, view template, Object ID) is shown greyed, with "from recipe X".
- **A run never writes a preset.** Only Save does, so a generate leaves no diff in archi-scripts.
- **Versioned.** Recipes are versioned in the model repo (coArchi), presets and links in archi-scripts.
- **Deterministic.** Presets run in name order, using the comparison of View hard rule 12.
- **Publication.** Already covered by `createReleaseModel.ajs`:
  - it keeps only views with `Publiceren` and deletes elements that are on no view, so recipes fall out;
  - it removes the generation record (key renamed in block 2);
  - `View last generated` stays.
- **Headless-ready, no CI.** The script also runs through Archi's command line.

## What is stored where

| Carrier | Stores |
|---|---|
| **Preset** (archi-scripts) | filter, steps, layout, appearance, view properties, default folder; `viewTemplate` (id, path, on) for ad hoc runs; `recipe` (id, name) = the recipe link |
| **Model: view recipe** (grouping, properties) | `View recipe` = `view`; `Object ID` (its own); `View Object ID`; `View preset` (information only) |
| **Model: view recipe group** (grouping, properties) | `View recipe` = `group`; `Object ID` (its own); `View preset` (information only) |
| **Model: relations** | aggregation view recipe group → view recipe; from a view recipe to its start content |
| **Model: view *View recipes*** | the recipes with their members; per recipe or group, a view reference to its view template nested in its visual |
| **Model: generated view** (properties) | `Object ID`; `View last generated`; `View generation record` (with `recipe`) |
| **Script** (archi-scripts) | check, generate, sync |

## Dialog

**The start is exactly one recipe** (a view recipe or a view recipe group, in the model tree or on a view):

| Where | What the dialog shows |
|---|---|
| Selection tab | "Recipe: X" (view recipe group: "Recipe group: X, n view recipes") |
| Actions | the action of its kind (*New view* / *One view each*); the other one and *Modify* are greyed, with the reason |
| Layout tab | view template "from recipe X", greyed; the preset's own choice is kept, not used |
| Properties tab | Object ID "from recipe X" |

Save writes the recipe link into the preset and `View preset` onto the recipe.

**The preset is linked to recipe A, and recipe B is the start:**
- the run uses B, and the dialog says "the preset belongs to recipe A";
- Save asks:
  - *move the link to B* (A becomes orphaned, the check reports it);
  - or *save as a new preset*.

**Any other start** (elements, an ordinary group, a folder, a view, several recipes): ad hoc, as now.
- The view template comes from the Layout tab.
- The preset's link stays and is not used; the dialog says "the preset belongs to recipe A; this run is ad hoc".
- Save leaves the link alone.

**Opening the dialog:** it finds the linked recipe and the view template by id and shows their current names. Save writes those names as labels. A recipe that cannot be found is reported in the dialog.

## The script

`Scripts/View/lib/view_recipe.js` (recognise a recipe, its kind, members, view template and Object ID; pure where possible, testable in Node), with two entry scripts in `Scripts/View/`.

**Check** (`_view_recipes_check.ajs`; also the first step of generate). Each finding says what is wrong, its effect, and what to do.

*Recipes in the model:*
- `View recipe` has an unknown value;
- a recipe has no `Object ID`;
- a view recipe is in two groups, or a group has no view recipes;
- a view recipe in a group that the preset's element filter drops.

*View template:*
- the preset uses a view template, but the recipe or its group has no view reference on *View recipes*;
- there are several view references, or the recipe is not on *View recipes*.

*Links:*
- a preset whose recipe is not found;
- two presets linked to the same recipe;
- a recipe that no preset is linked to (orphaned);
- a stale label in a preset, reported for the next Save;
- `View preset` on a recipe that differs from the linked preset.

*Duplicates:* an `Object ID` or `View Object ID` that appears twice. The recipe groupings now carry copied Object IDs, such as "Applicatieservices publieksdiensten" = Publieksdiensten.

**Generate** (`_view_recipes_generate.ajs`):

*Scope, by selection:*
- nothing selected, or *View recipes* selected = every preset linked to a recipe in the open model;
- a recipe, or a recipe group = its linked preset;
- a view recipe in a group = only that view, with its group's preset, still as *One view each*.

*For each recipe that passes the check:*
1. It writes a `View Object ID` if it is missing, and writes `View preset`.
2. It runs the preset through `RunPreset` with the recipe as the start (the same path as the dialog with a recipe).
3. On the view it writes `Object ID`, `View last generated` (one timestamp per run) and the generation record.

**Sync.** After generating, a view is stale when all of these hold:
- it has `View last generated`;
- it belongs to this run's recipes (by Object ID or by the recipe in its generation record), or the run covered everything;
- it was not written in this run.

The console lists the stale views with name, folder, last generated and Object ID. One confirmation deletes them. Headless only lists them, unless `deleteStale` is set.

## Regenerate and recipes

Regenerate runs the saved preset again on the start in the generation record; objects are found by id.

It picks up:
- changes reachable from the start through the steps (elements, relations, names, properties);
- new elements in a selected folder;
- a changed view template;
- a changed preset.

It does not pick up:
- a new start, a new name or folder;
- for *One view each*, new or removed members (that is *Regenerate with siblings*).

Use:
- For ad hoc views it stays the way to make a view again.
- For a view from a recipe, generate covers everything Regenerate does, plus renames, new recipes and stale views. `_regenerate` on such a view therefore runs its recipe for this view only (one route); a recipe that is gone is reported.

## How it connects to what exists

- **Selection** (`lib/selection_read.js` / `selection_pipeline.js`): recognises "exactly one recipe" through `view_recipe.js`. That gives the start, the action, the view template and the Object ID.
- **`lib/background.js`** → `lib/view_template.js`: the view comes from the recipe when the start is one, otherwise from the preset (as now).
- **Preset I/O and schema 12** (one-shot migration, View hard rule 21):
  - `backgroundView` → `viewTemplate`;
  - `backgroundLeavesInPlace` → `templateLeavesInPlace`;
  - condition value `"background"` → `"template"`;
  - new: `recipe` (id, name; default none).
- **`RunPreset`** (`lib/run_preset.js`): a run with a recipe start, used by the dialog and by generate. Not through `opts.edit`.
- **`lib/view_origin.js`** → `lib/generation_record.js`:
  - `PROP_ORIGIN` (`"View origin"`) → `PROP_GENERATION_RECORD` (`"View generation record"`), with the new field `recipe: { id, name }`;
  - `createReleaseModel.ajs` and `hidden_properties.js` follow;
  - the property on views in existing models is renamed by a one-shot jArchi script in `Scripts/View/tools/`. Model data is outside the repo, so this is a migration, not a dual reader (repo hard rule 3).
- **`lib/generate_view.js`:** the Object ID from the recipe goes before `addObjectId`; the target stays `_getOrCreateView` (same name in the preset's folder, so the Archi id and properties stay).
- **Dialog** (`lib/gui/`): the recipe display in the Selection, Layout and Properties tabs and in the actions; Save writes the link and `View preset`; the move-or-new question.
- **Not renamed:** a widget's background colour in SWT.

## Blocks and way of working

All blocks run on **Opus 5.5**.

Within each block, the order of change from `Scripts/View/AGENTS.md`:
1. code and checks;
2. the user approves;
3. docs (SPEC, `docs/reference/`, ARCHITECTURE, `gen_docs_tables.js --write`);
4. one commit.

The user is asked only for checks in Archi and for that approval. After each block, a handoff here.

**Session.**
- *This session*: small, and the context of this interview helps.
- *New session*: the block reads many files and needs a clean context. Prompt: "Do block N of `plan/view-recipes-and-view-templates.md`; start with § Handoff."

| # | Block | Session | What the user does |
|---|---|---|---|
| 0 | **Repair the view template paths in the presets** (the ids still resolve). Checked in `.git/temp.archimate` of 2026-11-25 09:20:<br>• `2. Bedrijfsarchitectuur/Bedrijfsfuncties met referentiecomponenten` → `/Views/Beheer/View templates/Bedrijfsfunctiemodel uitvoering`<br>• `3. Informatiearchitectuur/Alle referentiecomponenten` → `/Views/Beheer/View templates/Alle referentiecomponenten`<br>• `3. Informatiearchitectuur/Applicatieservices met referentiecomponenten` → `/Views/Beheer/View templates/Applicatieservices`<br>• `4. Technische architectuur/Technologiecomponenten en -services` → `/Views/Beheer/View templates/Technologiecomponenten en -services`<br>`Test/gemma/Bedrijfsfuncties background` points to the test model and stays.<br>Also: rename this plan file and commit it. | this session, right after approval | Nothing; a commit of its own |
| 1 | **Background view → view template**, schema 12 without the recipe link: code, dialog labels, presets, session, migration, `tools/background_test.js` → `view_template_test.js` | new (a rename over ±50 files) | Check the dialog in Archi (skill `view-testing`); baseline (skill `view-baseline`); approve |
| 2 | **Origin → generation record**: `lib/generation_record.js`, the property `View generation record`, `createReleaseModel.ajs`, `hidden_properties.js`, the one-shot model script | new | Run the model script in Archi; agent verifies through `.git/temp.archimate`; approve |
| 3 | **`lib/view_recipe.js` + `_view_recipes_check.ajs`** (recognise, check); pure part with Node tests on a fixture | new | Run the check on the GEMMA model; approve |
| 4 | **Model in order** (user, in Archi, guided by the check): `View recipe` on the groupings, one view reference per recipe, unique Object IDs, remove loose elements | same session as block 3 (it uses the check's report) | Repair until the model part of the check is clean; agent verifies through `.git/temp.archimate` |
| 5 | **Recipe as the start in the dialog**: recognition, overruled action, view template and Object ID shown, Save writes the link, the move-or-new question; schema 12 + `recipe` | new (GUI work, reads `docs/reference/gui.md`) | Link each GEMMA preset to its recipe by Save; check with `gui_check.ajs`; approve |
| 6 | **`_view_recipes_generate.ajs`**: generate, Object ID, last generated, sync with confirmation, Regenerate through the recipe, headless; `README.md` + `presets/GEMMA/README.md` for colleagues | new | Generate all; rename one recipe → stale view reported and deleted; approve |

## Verification

- `npm run typecheck` exit 0 after every block (repo hard rule 5).
- **Block 1:**
  - the migration is idempotent;
  - `grep -rn -i background Scripts/View` only hits widget colours;
  - the baseline is unchanged apart from the names.
- **Block 2:** after the model script, every view that had `View origin` has `View generation record` with the same content (script over `.git/temp.archimate`); Regenerate still works.
- **Block 3:** Node tests per check on a fixture model.
- **Block 5:** a recipe as the start gives the same view as generate; any other start gives the same as before (baseline).
- **Block 6:**
  - the `Object ID` of every GEMMA view is the same before and after;
  - a second run writes the same views;
  - a renamed recipe keeps its link (by id), gives a new view with the same Object ID, and the old view is reported as stale;
  - headless gives the same result as in Archi.

## Decisions (interview 2026-11-24/25)

- A recipe is a grouping with metadata `View recipe` = `view` | `group`. The folder and the view *View recipes* are containers for finding and maintaining recipes; the view also records the view template through a view reference.
- The action follows from the kind.
- The link runs from preset to recipe (id + name as label), written by Save with exactly one recipe as the start. The dialog refreshes the label; a run never writes a preset.
- `View preset` on the recipe is information only.
- A preset linked to A with B as the start: B runs, and Save asks to move the link or to save as a new preset.
- Any other start: ad hoc, as now, with the view template from the Layout tab.
- Stale views: report, delete after confirmation.
- Background view → view template; origin → generation record, taken into this plan because recipes change it anyway.
- Publication through `createReleaseModel.ajs`; CI is outside this plan.

## Handoff

- Done: interview, plan, block 0, block 1 (background view → view template, schema 12; code, docs, presets, test model; checks in the commit message).
- Pre-existing, not from block 1: `write_plans --variants` 2 lines (Tiles, columnsAcrossContainers); baseline views `2 Edited` expand/layout differ from the committed baseline by a `Segoe UI Symbol` font; with nothing selected the nesting style windows show the "view template is off" note while On is ticked.
- Next: block 2 in a new session.
- User: start a new session with the prompt in § Blocks and way of working (N = 2).
