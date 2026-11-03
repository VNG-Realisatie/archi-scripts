# View architecture model: AI development environment

Requested 2026-11-03 with modelling conventions (ArchiMate 3.2). Model: `Scripts/View/docs/architecture-model/`.

## Conventions (from the request)

| Concept | ArchiMate element | Here |
|---|---|---|
| Agent | Application component | Claude Code, GitHub Copilot (the agents the repo configures: `.claude/`, `.github/copilot-instructions.md`) |
| Skill | Application function | jarchi-scripting, elkjs, dagre, graphviz, view-testing, view-baseline (`ai/<skill>/`) |
| Skill definition | Artifact | `ai/<skill>/SKILL.md` |
| Development process | Business process | the existing steps of *Develop a View change*, *Version and commit*, *Diagnose a reported view* |
| Agent rules | Artifact | `AGENTS.md`, `Scripts/View/AGENTS.md` |

Relations: agent → skill assignment; skill → process step serving (only the steps that use it); SKILL.md → skill realization; agent rules — agent / process step association, only where it shows the steering. All checked against Archi 5.9's `relationships.xml`: an application component cannot be assigned to a business process, so the agent reaches the process only through its skills.

## Changes

1. The business actor *AI coding agent* and its assignments go: the process is modelled apart from the agent configuration. The developer's assignments stay.
2. The business objects *AGENTS.md*, *View AGENTS.md* and *Skill …* (and their access relations) become the artifacts and application functions above (repo rule 3: one concept, one element). *repo-guide* stays a business object: neither a skill nor agent rules.
3. Skill → step: jarchi-scripting, elkjs, dagre, graphviz → *Change pipeline, adapter, writer or dialog*; elkjs, dagre, graphviz → *Find the cause*; view-testing → *Find model, preset and session*, *Reproduce in the Node harness*, *Find the cause*, *Log the case*; view-baseline → *Run the Archi baseline*, *Rebuild the test model*.
4. Agent rules: *AGENTS.md* — both agents ("instructs"), *Write a plan* (rule 8), *Commit* (rules 3–5); *View AGENTS.md* — *Agree on the behaviour*, *Approve*, *Document* (order of change), *Change the registry*, *Change pipeline, adapter, writer or dialog* (hard rules).
5. Model purpose and header conventions follow; rebuild `view-architecture.archimate`.

## Step log

- 2026-11-03: steps 1–5.
- 2026-11-03: *repo-guide* (business object) becomes the agent-rules artifact *ai/repo-guide*: AGENTS.md "routes to" it; it governs *Change pipeline, adapter, writer or dialog* and *Run the Node checks*. The empty folder Business/Instructions goes.
