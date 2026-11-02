---
name: view-baseline
description: Use when a change to Scripts/View must be checked in Archi against the committed baseline ("run the baseline", a step whose check says "Archi baseline"), or when the View test model is rebuilt or extended. The agent runs run_baseline.ajs through Archi's command line on a copy, compares in Node and judges. archi-scripts View subsystem only.
---

# View baseline check

The baseline is what Archi's writer puts on the views of the test model for a fixed matrix of runs. It checks the part Node cannot run: the writer as Archi applies it, the count promise in Archi's console, and what Archi draws. What the matrix covers and the other test levels: `Scripts/View/docs/ARCHITECTURE.md` § Development and testing.

## Files

- **Test model** `Scripts/View/test/model/view-test.archimate`, one file: `Views/Test` holds the test views (input, built by `Scripts/View/test/build_test_model.ajs` with `test_model_views.js`), `Views/Baseline` the written views of the last run (output). The committed file is the baseline.
- **Run** `Scripts/View/test/run_baseline.ajs`: deletes what `Views/Baseline` holds, runs 2 presets (`presets/Test/baseline/`) × 5 runs and 2 runs on view 4, saves the model in place.
- **Archi's command line** `Scripts/View/tools/archi_cli.sh <script.ajs> [model] [out dir]`: runs the script on a copy in the out dir, next to the user's open Archi, with the display settings of the user's Archi; the console goes to `<out dir>/<script>.console.txt`.

## Steps (agent)

1. Make sure the change is in the working tree and the typecheck and Node checks pass.
2. `OUT=$(mktemp -d)` in the scratch folder; `Scripts/View/tools/archi_cli.sh Scripts/View/test/run_baseline.ajs "" $OUT`.
3. `node Scripts/View/tools/console_checks.js $OUT/run_baseline.console.txt --check`: count promise, errors, warnings, time.
4. `node Scripts/View/tools/compare-views.js Scripts/View/test/model/view-test.archimate $OUT/view-test.archimate "Views/Baseline"` and the same for `"Views/Test"`, then judge:
   - `Views/Test` differs: a run changed the test views; a bug, never commit it.
   - `Views/Baseline` the same: the change leaves the written views as they were; nothing to commit.
   - `Views/Baseline` differs: name which views and lines, and check them against what the change was meant to do. Unexpected differences are a regression: find the cause first.
5. `archi_cli.sh Scripts/View/test/render_views.ajs $OUT/view-test.archimate $OUT`, then `node Scripts/View/tools/svg_checks.js $OUT/render $OUT/view-test.archimate --check`. `RENDER_PNG=1` for a PNG to judge readability.
6. **Commit** a new baseline only when the change is meant to alter the written views: copy `$OUT/view-test.archimate` over the test model, in the same commit as the change, with the expected differences in the commit message or plan log.

## The user

Only when a new model is copied into the repo: the user closes the test model in Archi first if it is open (Archi would not see the file changed underneath it). Ask for exactly that, and wait for "done".

## Rebuilding or extending the test model

A rebuild (`build_test_model.ajs`, saves a new model without `Views/Baseline`) gives every object a new id: every expected line and baseline view changes. To add a view, run its builder from `test_model_views.js` on a copy through `archi_cli.sh` instead, which keeps the ids; then `run_baseline.ajs` on the copy, the compares (only the new views may differ), the expected files (`write_plans.js --write`, `--variants --write`, `compare-layouts.js --write`, `layout_checks.js [--variants | --large] --write`) from the copy, and commit the builder, the model and the expected files together.
