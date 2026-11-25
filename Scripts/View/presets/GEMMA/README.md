# GEMMA presets

Presets for the views of the GEMMA model. The numbered folders (`1. Strategie en motivatie` … `4. Technische architectuur`) hold the presets of publishable views; most of them are linked to a view recipe in the GEMMA model. How recipes work: [View README § View recipes](../../README.md#view-recipes).

## Making the publishable views

1. Open the GEMMA model in Archi and pull the latest version (coArchi).
2. Run `Scripts/View/_view_recipes_check.ajs`. Repair what it reports in the model, or in the preset it names.
3. Select nothing and run `Scripts/View/_view_recipes_generate.ajs`. Every view of a linked preset is made again; each keeps its Object ID.
4. Read the stale views on the console, and confirm to delete them when they are indeed no longer needed.
5. Check the views, then commit and push the model (coArchi).

A release is then made with `Scripts/GEMMA/createReleaseModel.ajs`: it keeps the views marked `Publiceren` and drops the recipes and the generation records.

## A new publishable view

A new view needs a change in two places:

1. **In the model**: a grouping in the folder *View recipes* with the property `View recipe` = `view`, its own `Object ID`, and relations to what the view starts from. Put it on the view *View recipes* with a view reference to its view template inside it. For one view per element, aggregate the view recipes from a grouping with `View recipe` = `group`, and put the view reference inside the group.
2. **In this folder**: select the recipe (or the group), open `Scripts/View/_gui.ajs`, set up the preset and *Save* it (or *Save As…* for a new preset). Save links the preset to the recipe; commit the preset to archi-scripts.

Run the check afterwards: it reports a recipe without a preset, a preset without a recipe, and Object IDs that appear twice.

## Renaming

- **A recipe**: the link holds (it is by id). The next generate makes a view with the new name and the same Object ID, and lists the old view as stale.
- **A preset**: rename it in the dialog (*Rename…*); the link is in the preset itself, so it moves with it. *View preset* on the recipe is updated by the next generate or Save.
