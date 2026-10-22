# Vervolgstappen typecheck en jarchi-skill

Stand 2026-10-22, branch `ViewGenerationPlan`. Context voor elke nieuwe sessie: `types/README.md`,
`ai/rules.md` (regels 14–15, Conventions) en de commits sinds `25854e1`. Start per stap een nieuwe
sessie; de prompts gaan niet uit van eerdere gesprekken. Volgorde: 1 → 2 → 3 → 4 → 5 → 9 → 8;
6 en 7 wanneer het uitkomt. Verwijder dit bestand als alles af is.

Modelkeuze: **Opus** voor werk met oordeel of over veel bestanden (4, 7); **Sonnet** voor afgebakend
werk (2, 5, 6, 8).

## 1. Probe draaien in Archi — jij

- [x] Model met elementen en relaties openen, een view selecteren.
- [x] *Scripts › Develop › probeJArchiApi* draaien; console-uitvoer opslaan (bijv. `~/probe-output.txt`).

## 2. Probe-uitkomst verwerken — Sonnet (gedaan 2026-10-22, commit hieronder)

- [x] Prompt:

```
Verwerk de uitvoer van Scripts/Develop/probeJArchiApi.ajs (bijgevoegd / in ~/probe-output.txt).
Werk per punt bij:
- ai/jarchi-scripting/jarchi.d.ts: @remarks unverified → verwijderen of corrigeren (collection.length,
  for…of, forEach, each/return false, add(), $(), prop(key,true), ontbrekende members,
  console.error-arity);
- ai/jarchi-scripting/SKILL.md en graaljs-java.md waar een uitspraak niet klopt;
- ai/rules.md § Conventions (logging, Java-strings) als de uitkomst dat vraagt;
- werkt relatieve require("./x") binnen een module: noteer in types/README.md als vervolgvoorstel
  (de typeof import-regels kunnen dan vervallen) — niet doorvoeren.
Daarna npm run typecheck. Commits volgens ai/rules.md.
```

## 3. Handmatige checks in Archi — jij

- [x] Verse `git clone` zonder `npm install`, scripts-map daarop: `View/_generate.ajs` op de testview.
- [x] Graphviz-preset (Dot, Neato) op de testview — in Node niet te testen.
- [x] *Layout only* met algoritme Force (crashte vóór fix `181d748`).

Uitkomst stap 3: alle checks goed. Gevonden: uitgeschakelde rijen op de Properties-tab verwijderden
view-properties (in strijd met de SPEC) — hersteld in `bc094ee`.

## 4. Open bevindingen — jij beslist, daarna Opus (gedaan 2026-10-22)

- [x] Keuzes invullen in de prompt:

```
Voer deze beslissingen door voor de open typecheck-bevindingen in de View-subsystem
(context: types/README.md, commits sinds 25854e1):
- graphvizBin (graph.options, nooit gezet): <verwijderen | aansluiten via engineParams.Graphviz>
- preset.debug (nooit gezet): <verwijderen | echte preset-key in DEFAULT_PRESET>
- standaard-reverseRules in bestandsvorm na validatePreset: <normaliseren | laten>
- stap-kandidaat waarvan het andere uiteinde een relatie is (selection_pipeline._stepCandidate): <overslaan | laten>
- ontbrekende Views-map (generate_view._resolveFolder → null): <foutmelding | map aanmaken>
- graphviz._runDot leest stdout en stderr na elkaar: stderr naar tempbestand volgens
  ai/jarchi-scripting/graaljs-java.md
Eerst SPEC.md / ARCHITECTURE.md bijwerken waar gedrag verandert (Scripts/View/CLAUDE.md), dan code.
Per beslissing een fix-commit; verwijder de bijbehorende casts en commentaren.
Controle: npm run typecheck, node Scripts/View/tools/{rel_filter_test,nesting_test}.js,
tools/compare-layouts.js tegen de vorige HEAD.
```

Uitkomst stap 4 (`a173c70`..`b965e8a`): graphvizBin en preset.debug verwijderd; standaard-reverseRules
genormaliseerd; stap volgt geen relatie met een relatie als ander uiteinde (SPEC: relaties op relaties
nog niet ondersteund); ontbrekende Views-map → foutmelding; `_runDot` stderr via tempbestand.
Nog te doen in Archi: Graphviz-preset (Dot) opnieuw draaien — `_runDot` is in Node niet te testen.

## 5. Copilot-adapter opschonen — Sonnet

- [ ] Prompt:

```
.github/copilot/instructions.md herhaalt de harde regels uit ai/rules.md (in strijd met regel 10;
mist 11–15). Maak het een pure verwijzing zoals .claude/rules.md. Controleer .cursorrules en
.cursor/ op hetzelfde. Eén docs-commit.
```

## 6. Casts verminderen — Sonnet

- [x] Prompt:

```
In de typecheck-scope staan 157 JSDoc-casts (beleid: types/README.md), vooral in
Scripts/View/lib/selection_pipeline.js (63), engines/elk.js (33), generate_view.js (24).
Verminder ze waar een kleine gedragsneutrale refactor of betere typing het oplost
(Map.get-na-set via een helper, preciezere typedefs, overloads in types/*.d.ts).
Geen gedragswijziging; per module een commit. Bewijs: tools/same-code.js waar de code gelijk moet
blijven, tools/compare-layouts.js voor de layout-uitvoer; noem bewuste refactors in de commit.
Rapporteer het aantal casts voor/na per bestand.
```

Uitkomst stap 6 (`74721d5`..`59bd2a0`): casts 157 → 81 (selection_pipeline 62→22, elk 33→14,
generate_view 23→21, appearance 9→2, defs 8→5, preset_io 3→1, engine-utils 2→1). Layout-digests gelijk.
Rest is checkerbeperking (Partial EffectiveParams, narrowing in closures, jArchi duck typing); verder
verminderen vraagt wijziging van types/*.d.ts of herstructurering. Niet aangeraakt: rel_filter, dagre,
graphviz, selection, Common.

## 7. Scope uitbreiden naar gui/ — Opus

- [ ] Prompt:

```
Breid de typecheck uit naar Scripts/View/lib/gui/ (dialog_main.js ±2900 regels, SWT via Java.type).
Volg types/README.md § Extending: bottom-up (rule_table → dialog_presets → dialog_main), strict,
alleen JSDoc. Voeg in types/ een minimale SWT/JFace-subset toe voor wat werkelijk gebruikt wordt;
Java.type-resultaten mogen any blijven waar typing niets oplevert. Echte fouten in aparte
fix-commits. Meld het aantal meldingen vooraf en de bevindingen achteraf.
```

## 8. CI — Sonnet, na de push

- [ ] Prompt:

```
Voeg een GitHub Actions-workflow toe die bij push en PR draait: npm ci, npm run typecheck,
node Scripts/View/tools/rel_filter_test.js en nesting_test.js. Node 22.
Documenteer in types/README.md en ai/repo-guide.md § Testing. Eén commit.
```

## 9. Push en PR — jij

- [ ] Pas na 1–3 pushen, zodat de fixes in Archi bevestigd zijn. Geen AI-vermelding in commit- of
  PR-teksten (regel 13).
