# View: repeatable generation

Status: done 2026-11-07. Approved by the user; code and docs in one commit.

## Handoff

- Done, committed: *Selection order* rename (`f6a1beb`); scripts and wrappers renamed, session scripts (`7990c55`). The 17 wrappers in `shortcuts/GEMMA` are git-ignored, renamed on disk only.
- Not run: `createReleaseModel.ajs` and `4_ggm_gemma_views.ajs` need the GEMMA model.

## Goal

What: a generated view can be made again with the same start, by anyone who has the model, and every way of generating answers the same four questions in the same way: what is selected, where the view is stored, which preset, which action. One stated exception: replacing a selected view in place happens only in the dialog, where the user sees it; a script follows its preset.

Why: today the start of a view is remembered nowhere. A wrapper fixes the preset and the action, but runs on whatever is selected at that moment, so nobody can say afterwards what a view was made from. And the dialog does not show which of its fields a run really uses, so the result can differ from what the user expects.

The whole in four lines:

- The preset says how, the selection from what, the action what, Folder where.
- The dialog shows what it uses: what is grey does not count.
- Every generated view remembers its origin, so Regenerate makes it again, in the same place.
- Wrappers are fixed tasks; session scripts try something on the last settings.

## The four questions

| Question | New run | Regenerate |
|---|---|---|
| What is selected | the selection | the start in the origin |
| Where the view is stored | see New view and One view each | the view stays where it is |
| Which preset | dialog or script | the preset in the origin, by name |
| Which action | dialog or script | the action in the origin |

## What is remembered where, and why

| What | Where | Why there |
|---|---|---|
| Settings: filter, steps, layout, appearance, default folder | preset | Reusable across models, so it holds nothing of one model. Shared and versioned. |
| Last dialog state: settings, open tab, chosen action, size and position | session | Belongs to the user's last work. Never a source for a repeatable run. |
| Fixed preset, action and direction | script | A named task, one key, on the current selection. |
| How a view was made: start, destination, preset name, action | origin, on the view | A start only holds in one model, so it travels with the model and with the view it describes. |
| A start by a rule, work after the run | script | A rule (all policy domains with a status) is not a list of objects, and styling after the run is not a preset setting. |

This table goes into ARCHITECTURE (see Docs).

## Behaviour

### Choosing an action

What: the dialog opens where it was closed, at that size (`_dialogBounds` in the session); when that place is on no monitor, at its default place. It keeps its two groups, Create new view and Modify selected view, each with its own two choices, Folder and Name or the view, and what the action writes; one choice is active at a time, and one run button repeats the choice and names the result (*Create view*, *Create 12 views*, *Replace view*, *Expand view*, *Layout only*). The last action is remembered in the session. When it does not fit the selection, *New view* is chosen; with a view selected, the dialog opens on *Layout only*, so replacing a view is always a deliberate choice. An action that does not fit is grey, and its tooltip says why.

Why: once the action is known, the dialog can grey what that action does not use, which is impossible with four buttons side by side. Repeating the last action stays one click.

| Chosen action | Folder | Name |
|---|---|---|
| New view | on | on |
| One view each, only elements selected | on | grey |
| One view each, a folder or view in the selection | grey | grey |
| Expand view, Layout only | grey | grey |

*New view* and *Expand view* show their counts in their group, grey when not chosen, so a group keeps its height. *One view each* shows a note in their place:

- `3 views in /_Generated/Project, named after the element.`
- `12 views each in the folder of its element. 3 replace an existing view.`

*Layout only* has no counts. With one selected view that has an origin, the Modify group shows it: `Made from /Business/Processen with preset X.` Unsaved settings get no note in the dialog: Regenerate reports them.

### New view

What: always follows Folder and Name. When that view exists it is replaced, and the run button says *Replace view*.

With one view selected, the dialog pre-fills Folder and Name with those of that view, so the result replaces it in place. Changing a field makes a copy. Scripts keep following the preset, so a script never replaces a hand-made view unseen.

### One view each

What: one view per element, named after the element. Only elements selected: all views go to Folder. A folder or view anywhere in the selection: every element, loose ones too, gets its view in the folder that mirrors its own place in the model tree, with the layer: an element in `Business/Processen/Klant` goes to `/Views/Business/Processen/Klant`.

Why: the views get the structure the model already has, and same-named elements from different folders no longer overwrite each other.

The preset decides which elements count: an element that fails its element filter gets no view, so no empty views, and the count, the note and the confirm above 20 views all say what is really written.

The same elements can get another destination: Ctrl+A on the canvas selects elements (Folder), selecting the view does not (mirrored). The dialog shows which applies.

### Regenerate

What: `_regenerate` makes the selected views again from their origin. A view stays where it is, with its name. `_regenerate_siblings` runs the start and action of the selected view again for all its siblings: the views with the same start, preset and action.

Why: a view can follow the model without the user having to remember how it was made. The dialog stays for new runs and only shows the origin; changing how a view is made goes through the preset: change it, Save, Regenerate.

The origin:

- Holds the start and the destination, on the view and not in the preset, so the view itself knows how it was made.
- A selected folder stays a folder, so new elements in it join.
- A selected view is stored as the elements on it at that moment; otherwise a view replaced in place is its own start and grows with every regenerate. Its diagram objects do not come back.
- An object is recognised by its id, because that survives a rename and a move, and a name need not be unique. Its readable path sits beside the id, is refreshed at every regenerate, and appears in the message when the object is gone. It is never used to find an object: a match on a name can silently find another one.
- The preset is referred to by name, so a better preset reaches every view.
- Only *New view* and *One view each* write it.

What Regenerate does and says:

- Scope is what is selected: one view, several views, or a folder of views. A view of *One view each* regenerates only itself.
- Hand edits are lost, as with any replaced view.
- The console shows what a regenerate uses and does not use: preset, start, where the view stays, *Not used: the dialog's settings, Folder, Name*.
- A view made with unsaved settings, or changed by *Expand view* afterwards, is marked: Regenerate says the result can differ.
- A view made by a script with work after the run is refused, naming the script, because skipping that work gives a bare view.
- A missing object or preset is reported per view; nothing is written for that view. A renamed preset is such a case, and a new run with the new name repairs the view: the repo cannot rewrite origins in models.

`_regenerate_siblings`: existing views are updated, also when moved or renamed; a new element gets a view, in the remembered Folder or its mirrored folder; a view whose element is gone is reported and not deleted.

### Scripts

Names use the words of the dialog: the preset, then the action, then the option.

The pattern is `<source>_<action>_<option>`: the source is `default` or `session`.

| Script | Does |
|---|---|
| `_default_new_view`, `_default_one_view_each`, `_default_expand_view` | That action, preset Default |
| `_default_layout_flat_right`, `_default_layout_flat_down` | Layout only, that direction, no nesting |
| `_default_layout_nested_right`, `_default_layout_nested_down` | Layout only, that direction, aggregation as nesting |
| `_session_layout_right`, `_session_layout_down` | Layout only, last settings, that direction |
| `_session_layout_flat`, `_session_layout_nested` | Layout only, last settings, nesting off or on |
| `_session_layout_cycle_selection_order` | Layout only, last settings, next selection order |
| `_regenerate`, `_regenerate_siblings` | see Regenerate |

The preset `all` is gone: Default takes its place, in `fromDefault`. A `_default_*` script is changed in `Default.json`, as Default is read-only in the dialog. In filenames the action Layout only is `layout`, everywhere.

Wrappers follow the same pattern, `<preset>_<action>_<direction>`: `AMEFF_Layout_TB` becomes `AMEFF_layout_down`, `ggmBO_Generate_LR` becomes `ggmBO_new_view_right`.

Session scripts are for quick experiments without the dialog. They are not repeatable by nature, so wrappers stay fixed tasks: `AMEFF_layout_down` must not depend on what the dialog did last. Every session script writes back, so changes stack and the dialog then shows them with `*`, for Save to keep. `_session_layout_flat` parks the conditions in the session; `_session_layout_nested` restores them, or uses aggregation when there are none.

A wrapper overrules the direction of its preset, on purpose, to try directions quickly; the console says so when they differ. Three wrappers point to a preset that no longer exists and are repointed or deleted.

### Publishing

The origin is removed from the release copy: it is working data, not publication content.

## Implementation notes

Only what the build depends on.

- `fromFilename` sets the direction. Of 30 wrappers, 22 repeat their preset, 5 differ (all `_Layout_TB`), 3 have no preset: `application_`, `grouping_` and `hiddenRel_Generate_LR`.
- `generate_view` keeps following `preset.view.folder`. The baseline runs New view on its source views and writes to `/Baseline`; writing to the selected view in the pipeline would overwrite its input. So replacing in place is a dialog pre-fill, and the pre-filled Folder must not show `*` or reach a Save, like the pre-filled name now.
- The mirrored destination needs only the element, so it goes in `_generateOneEach` and holds for the dialog and `_default_one_view_each` alike. `4_ggm_gemma_views.ajs` passes elements, so it keeps following Folder. Folders are created name by name: `getFolderPath` splits a path on `/`.
- Seeds go through the preset's element filter before counting. The result is unchanged: such a seed gives `No elements to place` today, yet `confirmViewCount` counts it. The groupings of `4_ggm_gemma_views.ajs` pass the filter of both presets.
- Script renames touch `Scripts/View/README.md`, `ai/repo-guide.md`, `readme.md`, ARCHITECTURE and the architecture model, in the same commit (rule 3).
- All 30 wrappers are renamed in one commit, one to one, each keeping its direction. `parseFilename` can no longer split on `_`, because an action now holds one (`new_view`): it matches the known action and direction words at the end of the name. `FILENAME_ACTIONS`, `FILENAME_DIRECTIONS` and the header comments of the wrappers change with it. Archi hotkeys on the old names have to be set again.
- Origin: a property with an always-hidden key (`hidden_properties.js`); its key and the terms *origin* and *siblings* go in SPEC § Vocabulary. `createReleaseModel.ajs` removes it.

```json
{ "preset": "GEMMA/GGM/GGM bedrijfsobject specialisaties",
  "direction": "Down",
  "action": "one_each",
  "selection": [{ "id": "id-3f2a", "name": "/Business/Processen" }],
  "folder": "/_Generated/Project",
  "element": { "id": "id-91bc", "name": "Klant" } }
```

`direction` only when it differs from the preset, `folder` only when not mirrored, `element` only with *One view each*, `script` and `modified` only when they apply. `opts.edit` on a wrapper also sets `modified`.

- Regenerate is an entry point (`RunPreset.fromView`), not a fifth pipeline action: it runs New view on the existing view, through the one write path.
- `fromSession` takes a `change` on the session; `fromSessionCycling` is the former `fromSession`. `_lastAction` sits beside `_lastTabIndex` in the session.
- A disabled radio is never the chosen one (the dialog falls back to *New view*), so the blue dot of a disabled GTK checkbox does not apply.

## Checks

- `npm run typecheck` and the Node checks after each step.
- Archi baseline after *One view each* and after the origin: existing views stay the same. `generate_view` without `options.origin` writes no origin, so the baseline and raw API calls are unchanged.
- By hand in Archi: every row of the table under Choosing an action; regenerate after a rename, a move and a delete of a selected element; a view replaced in place, regenerated twice, keeps its content.

## Docs

After approval, as `Scripts/View/AGENTS.md` § Order of change says: SPEC § 5, § 9 and the use case on regenerating (it says "completely from one preset — selection", while a preset holds no start), `reference/gui.md`, `reference/presets.md`, generated tables. ARCHITECTURE gets the table of what is remembered where, with its reasons.

## Decisions

Decided: the option *Algorithm start* becomes *Selection order*, *Cycle algorithm start* becomes *Cycle selection order*, in the dialog, the keys, the presets and the docs, in its own commit (rule 3): the word *algorithm* suggested another algorithm is tried.

Decided: all scripts and wrappers use the dialog's words, the wrappers renamed too; action choice with one run button, kept in the session; with a view selected the dialog pre-fills its Folder and Name and opens on *Layout only*; Regenerate through scripts, the dialog only shows the origin; the origin refers to the preset by name; all session scripts write back; the `_default_*` layout scripts stay, with the preset and `layout` in the name; the preset `all` is replaced by Default; the filter applies to the seeds up front, with a count only.
