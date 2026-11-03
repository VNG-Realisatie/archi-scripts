# View architecture model: process grouping

Done (2026-11-03): approved flat, names as proposed; the subfolders below hold every part of a top process, without deeper subfolders. Model: `Scripts/View/docs/architecture-model/`.

## Goal

Every process group has one grouping process, and the folders show it as the View subsystem does: the grouping processes at the root of a `Processes` folder, the processes they compose in a subfolder named after them.

## Rule

A process that composes others sits in a folder; its parts sit in a subfolder with its name, beside it. A part that composes others in turn gets its own subfolder (at most three levels deep).

## Business layer

New grouping process: **Generate views** (the four generate processes had none).

```
/Business/Processes
  Generate views                 (new)
  Develop a View change
  Version and commit
  Diagnose a reported view
  /Generate views                Generate a view with the dialog · … with an entry script · Manage presets · Generate GGM views
  /Develop a View change         Design · Build · Test · Approve · Document
    /Design                      Agree on the behaviour · Write a plan
    /Build                       Change the registry · Change pipeline, adapter, writer or dialog · Migrate the preset shape
    /Test                        Run the Node checks · Run the Archi baseline · Check in Archi · Rebuild the test model
  /Version and commit            Rewrite the expected files · Commit · Push
  /Diagnose a reported view      Report · Find model, preset and session · Reproduce · Find the cause · Log the case
```

## Application layer

New grouping processes: **Run View**, **Run the tests**, **Maintain test data and settings**. The 15 processes in "Test levels" are not all test levels: five maintain data.

```
/Application/Processes
  Run View                       (new)
  Run the tests                  (new)
  Maintain test data and settings (new)
  CI check
  /Run View                      Run the dialog · Run headless · Generate a view
    /Run the dialog              Recount the dialog · Save, rename or delete a preset
    /Generate a view             Validate · Read · Plan the view · Apply · Style
      /Plan the view             Compose · Build the layout graph · Lay out · Plan the write
  /Run the tests                 Typecheck · Unit · Consistency · Plan a real view · Write-plan fingerprints ·
                                 Layout fingerprints · Layout rules · Written views · Rendering · Time in Archi
  /Maintain test data and settings
                                 Build the test model · Generate the doc tables · Rewrite expected files ·
                                 Compare preset and session · Migrate presets
```

CI check keeps its aggregation of the six test levels CI runs.

## Changes

- `architecture_model.js`: 4 new processes; folder per element group as above; composition of the new grouping processes in `STRUCTURE`.
- No relation changes beyond those compositions.
- Rebuild with `build_architecture_model.ajs`; validate against Archi 5.9's relationships.

## Open for the user

- Deep nesting (Run View → Generate a view → Plan the view) or flat: every part of a top process in one subfolder.
- Names of the four new processes.
