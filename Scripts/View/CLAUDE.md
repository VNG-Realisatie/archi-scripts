# Scripts/View — subsystem references

See `Scripts/View/docs/SPEC.md` — **what**: functional specification. Behaviour changes go here first; its appendix holds the functional reference and the generated tables.
See `Scripts/View/docs/ARCHITECTURE.md` — design decisions (Part A) and **how** (Part B: realisation choices, module index, known gaps). Realisation changes go in Part B first, then code. Its "Content division" section says what belongs where.
See `ai/jarchi-scripting/SKILL.md` — jArchi pitfalls and API routing; dialogs: `ai/jarchi-scripting/swt-gtk.md`, `ai/dialog-style.md`.
See `ai/rules.md` § Conventions and `ai/repo-guide.md` — coding conventions, module loading, testing.
See `ai/view-testing.md` — test approach for a reported view (model, preset vs. `_session.json`, harness) and the test-case log.

Preset files: `presets/*.json` — plain JSON, no module.exports.
