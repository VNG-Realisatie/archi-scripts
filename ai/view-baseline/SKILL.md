---
name: view-baseline
description: Use when a change to Scripts/View must be checked in Archi against the committed baseline ("run the baseline", "I ran the baseline", a step whose check says "Archi baseline"), or when the View test model is rebuilt. The user runs run_baseline.ajs in Archi, the agent compares in Node and judges. archi-scripts View subsystem only.
---

# View baseline check

The baseline is what Archi's writer puts on the views of the test model for a fixed matrix of runs. It checks the part Node cannot run: the writer as Archi applies it. What the matrix covers and the other test levels: `Scripts/View/docs/ARCHITECTURE.md` § Development and testing.

## Files

- **Test model** `Scripts/View/test/model/view-test.archimate`, one file: `Views/Test` holds the test views (input, built by `Scripts/View/test/build_test_model.ajs`), `Views/Baseline` the written views of the last run (output). The committed file is the baseline.
- **Run** `Scripts/View/test/run_baseline.ajs` (Archi): deletes what `Views/Baseline` holds, runs 2 presets (`presets/Test/baseline/`) × 5 runs, saves the model in place.
- **Compare** `node Scripts/View/tools/compare-views.js --head` (Node): the test model against its committed version, `Views/Baseline` and `Views/Test`; exit 0 when all are the same. Visual ids are left out, so a run that changes nothing shows no difference.

## Who does what

1. **Agent:** before asking, make sure the change is in the working tree and the typecheck and Node tests pass. Do not touch the model file while Archi may have it open (no `git restore` or `checkout` of it).
2. **User:** in Archi, select the test model (`View test`) and run `run_baseline.ajs`; say when it is done. The model stays open for the next run: a second run in the same session writes the same views (checked 2026-10-28). Archi still marks the model `*` after the script's save; saving again writes the same file.
3. **Agent:** `node Scripts/View/tools/compare-views.js --head`, then judge:
   - `Views/Test` differs: a run changed the test views; a bug, never commit it.
   - `Views/Baseline` the same: the change leaves the written views as they were. The model file still differs in visual ids; it is not committed (leave it, or ask the user to reopen the file before restoring it).
   - `Views/Baseline` differs: name which views and lines, and check them against what the change was meant to do (the expected views, e.g. only view 2's Modify runs). Unexpected differences are a regression: find the cause first.
4. **Commit** a new baseline only when the change is meant to alter the written views, in the same commit as the change, with the expected differences in the commit message or plan log.

## Rebuilding the test model

`build_test_model.ajs` saves a new model without `Views/Baseline` (the user closes the test model first). Then `run_baseline.ajs` on it, the compare (only the intended test-view changes and the baseline views that follow from them may differ), and commit the script, the model and the new digests (`write_plans.js`, `compare-layouts.js`) together.
