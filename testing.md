# Testing strategy

## Environment
No automated test framework available — GraalVM/jArchi runtime does not support Node test runners.
All testing is manual: run scripts inside Archi.

## Test structure
1. Select representative model elements in Archi
2. Run script via Script Manager or `_GUI.ajs`
3. Verify: view generation, layout, element positions, console output

## Regression strategy
- Test the golden path (typical selection) after each change
- Test edge cases: empty selection, single element, deeply nested structures
- After parameter changes: check console for errors or unexpected warnings

## Debug mode
Set `debug: true` in preset or via GUI to inspect intermediate graph state.
ELK graph JSON is logged before and after layout when debug is on.

## Mocking strategy
No mocking framework. Use small isolated test diagrams in the Archi model.
