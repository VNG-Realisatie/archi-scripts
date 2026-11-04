# View architecture model: application services and knowledge model

Done (2026-11-04): approved with one service for the five maintenance processes and a knowledge model without a view; built headless with `archi_cli.sh`. Model: `Scripts/View/docs/architecture-model/`.

## Goal

1. Application processes show the fine-grained steps of the scripts; they realise an application service, and the application service serves the business process. No application process serves a business process directly any more.
2. A knowledge model in the model: one element per element type the model uses, one relation per relation type that is used between two element types.

## Facts checked (triggers)

- Application processes: `Run View` has triggers (Validate → Read → Plan → Apply → Style, Compose → Build the layout graph → Lay out → Plan the write, dialog and headless run → Generate a view). `Run the tests` and `Maintain test data and settings` have none: the test levels and the maintenance tools are independent of each other, so no order is added.
- Business processes: `Develop a View change`, `Design`, `Version and commit` and `Diagnose a reported view` have triggers. No triggers in `Generate views` (four alternatives), nor to `Rebuild the test model` and `Migrate the preset shape` (only when needed). Those stay without a trigger.

## 1 Application services

Rule (header of `architecture_model.js` and `MODEL_PURPOSE`): an application process realises the application service it delivers; the application service serves the business process that uses it.

Folders: `/Application/Services` holds the services the business processes use (with Generate a view, which the Public API offers); the three other contracts are in `/Application/Services/Contracts`. Relations in the folder `Relations/Services`.

| Service | Realised by | Serves |
|---|---|---|
| Generate with the dialog | Run the dialog, Recount the dialog | Generate a view with the dialog |
| Keep preset files | Save, rename or delete a preset | Manage presets |
| Generate with an entry script | Run headless | Generate a view with an entry script |
| Generate a view | Generate a view | Generate GGM views |
| Check the types | Typecheck | Commit |
| Node checks | Typecheck, Unit tests, Consistency checks, Plan a real view, Compare write-plan fingerprints, Compare layout fingerprints, Check the layout rules | Run the Node checks |
| Reproduce a view in Node | Plan a real view | Reproduce in the Node harness |
| Archi checks | Check the written views, Check the rendering, Time the run in Archi | Run the Archi baseline, Rebuild the test model |
| Maintain test data and settings | Build the test model, Generate the doc tables, Rewrite expected files, Compare preset and session, Migrate presets | Rebuild the test model, Document, Rewrite the expected files, Find model, preset and session, Migrate the preset shape |
| CI check | CI check | Push |

## 2 Knowledge model

Derived by `build_architecture_model.ajs` (`_knowledgeModel`) from the content it builds, so it always matches.

- Elements: one per element type used (12), named after the ArchiMate type, key `km/<type>`, in `/<top folder>/Knowledge model`; documentation: how many elements of that type.
- Relations: one per (relation type, source type, target type) used (35), in `/Relations/Knowledge model`; documentation: how many relations it stands for.
- Groupings per top folder (Business, Application, Technology & Physical) in `/Other/Knowledge model` aggregate their types, the shape the preset `Kennismodel/Kennismodel` nests on (aggregation from a grouping).
- No view; generating one with that preset on the three groupings is not tried yet.

## Result

247 elements, 717 relations. Against HEAD every id is kept; gone are the 23 servings application process → business process; new are 114 objects (services, their relations, the knowledge model, folders).

## Triggers per level (2026-11-04)

A trigger connects two processes of one level: parts of the same process, or two top processes; the build stops on any other (`_checkTriggerLevels`). Fixed: Document → Version and commit became Develop a View change → Version and commit; Log the case → Develop a View change (fix) became Diagnose a reported view → Develop a View change (fix); Push → CI check is dropped (the service CI check serves Push). Now 247 elements, 715 relations.

## Handoff

Done. Left for the developer: generate the knowledge-model view in Archi if wanted, and commit.
