# Plan: View — every container per nesting rule, implementatie

Basis: branch `ViewGenerationPlan`, commit `9aa5552` (ontwerp vastgelegd). Bouwplan = de docs:
- `Scripts/View/docs/SPEC.md` §7 (Several parents, Managed extra occurrences), §12, appendix delta 8–10
- `Scripts/View/docs/ARCHITECTURE.md` Part A: Multi-parent resolution, Managed extra occurrences, Managed-occurrence record
- Part B: Nesting, Managed extra occurrences — target, B.7 Known gaps

Werkwijze per stap: lees eerst de genoemde doc-secties, bouw, test, werk de docs bij (*Target* → gewone tekst, punt uit B.7 weg), één commit per stap. Een stap die het ontwerp moet wijzigen: eerst de docs, dan de code.

Testdata: `/home/mark/temp/wiki-gemma-model.archimate`, view `Views/_Generated/Kennismodel (copy)` (Capability en Groep hebben twee aggregatie-ouders). Let op: `Scripts/View/presets/all.json` heeft lokale, niet-gecommitte wijzigingen van Mark (nesting aggregatie, `showInEveryContainer: true`).

## Stappen

| # | Stap | Hangt af van | Model · effort | Status |
|---|---|---|---|---|
| 1 | Schema 3: `everyContainer` per nestingregel | — | Sonnet 5.5 · medium | **klaar** (dialoog nog door Mark te controleren) |
| 2 | Nesting zonder volgorde-afhankelijkheid, kringen als lijnen | 1 | Opus 5.5 · high | **klaar** (Archi-controle door Mark) |
| 3 | Managed extra exemplaren | 1, 2 | Opus 5.5 · high | **klaar** (in Archi gecontroleerd) |
| 4 | Geen lege view als de layout faalt | — | Sonnet 5.5 · medium | **klaar** (Archi-controle door Mark) |
| 5 | Part A samenvoegen met SPEC.md | 1–3 | Opus 5.5 · high | **klaar** |

### 1 Schema 3: `everyContainer` per nestingregel

- `defs.js`: `schemaVersion` 3; `params.showInEveryContainer` weg; `everyContainer` (default false) op relatieregels, alleen zinvol voor nestingregels; tooltip/labels.
- `rel_filter.js`: veld normaliseren en weglaten bij default in de bestandsvorm; `rel_filter_test.js` uitbreiden.
- Omzetscript in `tools/` (naar het voorbeeld van `migrate_presets_relrows.js`): idempotent, alle presets + `_session.json`; globaal aan → `everyContainer: true` op elke nestingregel. Ook `all.json` van Mark (lokaal) gaat mee.
- `selection_pipeline.js`: tijdelijk "aan als een passende regel `everyContainer` heeft" — de volgorde-onafhankelijke variant is stap 2.
- Dialoog: kolom *Every* in de Nesting-tabel; vinkje bij Containers weg; Highlight repeated: voorwaarde "minstens één regel met *Every*".
- Klaar: `check_registry.js`, `gen_docs_tables.js --check`, `rel_filter_test.js` groen; dialoog in Archi gecontroleerd door Mark.

### 2 Nesting zonder volgorde-afhankelijkheid, kringen als lijnen

- Eén resolutie (pipeline), gebruikt door tellingen en layoutgraaf.
- `everyContainer` wint; anders hooguit één ouder: huidige container van user content op de view → naam → id.
- Kringen: sterk samenhangende componenten van de graaf van kandidaat-nestings; alle relaties erin worden lijnen. Dialoogregel *circular* telt ze; log noemt elke kring.
- Herbruikbare Node-harnas in `tools/` (view uit een .archimate → layoutgraaf → ELK), zodat dit en latere stappen zonder Archi te testen zijn.
- Klaar: Node-test op Kennismodel (copy) en een geconstrueerde kring; zelfde uitkomst bij omgekeerde relatievolgorde.

### 3 Managed extra exemplaren

- Markering als view-property `Managed occurrence` (formaat: Part B). Lezen bij het vastleggen van de VisualSet, herschrijven na het schrijven.
- Koppelen: user content eerst, dan managed; ontbrekend → aanmaken + markeren; overbodig managed → verwijderen (eerst controleren op user content erin).
- De beperking op het aantal exemplaren bij `LAYOUT_ONLY` verdwijnt; elk object op de view krijgt een node.
- Randgevallen (Part A): laatste exemplaar, met de hand verplaatst, user content in managed container, kopie van een view, zelfde plek twee keer.
- Klaar: in Archi door Mark — vinkje aan/uit, regel wijzigen, algoritme wisselen en terug, view kopiëren, handmatig verplaatsen/verwijderen.

### 4 Geen lege view als de layout faalt

- `NEW_VIEW`: eerst layout, dan de view aanmaken of leegmaken. SPEC §12.
- Klaar: geforceerde fout in een adapter laat de bestaande view ongemoeid.

### 5 Part A samenvoegen met SPEC.md

- Functionele details uit Part A naar SPEC.md (stijl: `feedback_spec_writing_style`, body ≤550 regels, rest in de appendix); Part A houdt alleen de ontwerpbeslissingen.
- Dubbelingen weg; links en `gen_docs_tables.js`-markers blijven kloppen.
- Klaar: B.7-punt "Part A still repeats functional content" weg; `gen_docs_tables.js --check` groen.

## Startprompts

Begin elke stap in een nieuwe sessie (`/model` op het genoemde model) met:

1. `Voer stap 1 uit van plan/view-nesting-every-container-implementation.md.`
2. `Voer stap 2 uit van plan/view-nesting-every-container-implementation.md.`
3. enzovoort.

De sessie werkt aan het eind de kolom Status en het logboek hieronder bij.

## Logboek

- 2026-10-19 — ontwerp vastgelegd (`9aa5552`); fix bendpoints bij afgekapte exemplaren (`28ada20`).
- 2026-10-19 — stap 1: schema 3, `everyContainer` per nestingregel (kolom *Every*), `tools/migrate_presets_everycontainer.js` (45 presets, ook `all.json` en `_session.json`); pipeline tijdelijk per relatie via `RuleLists.matchEveryContainer`; Highlight repeated alleen aan met een *Every*-regel. Tests/registry/docs-tabellen groen; dialoog in Archi nog te controleren.
- 2026-10-19 — stap 2: `resolveNesting` herschreven (kringen via Tarjan → alle relaties lijnen, log noemt elke kring; *Every* + hooguit één ouder: huidige container → naam → id; exemplaren ouders-eerst, kopieën van álle kinderen); `currentContainers` uit VisualSet en dialoogselectie; `tools/view_harness.js` + `tools/nesting_test.js` (Kennismodel (copy) in beide volgordes gelijk). Opgemerkt: met *Every* op alle aggregaties geeft Kennismodel (copy) 128 nodes en 3918 edges (elke relatie tussen elk paar exemplaren) — bestaand gedrag, ELK traag; kandidaat voor stap 3.
- 2026-10-19 — stap 3: ontwerpbesluit (Mark) — een gewone relatie wordt één keer getekend, tussen het dichtstbijzijnde paar exemplaren (niet de een in de ander, dan diepste gedeelde container, dan volgorde); een lijn die al op de view staat houdt zijn uiteinden. Kennismodel (copy) met *Every*: 3918 → 60 edges. Record zonder relatie: `<element> in <container> [in …]`. `classifyVisuals`/`describeVisuals` (vastleggen, randgevallen; notities/groepen tellen als user content), koppelen als stap 4 van `resolveNesting`, writer verwijdert overbodige managed exemplaren na de nodes en herschrijft de records; LAYOUT_ONLY-cap en de uitzondering 'zelfde ouder, ander visual' weg. Harnas: `--new-view`, `simulateWrite`; `nesting_test.js` dekt de randgevallen en een stabiele tweede run. In Archi nog te controleren.
- 2026-10-19 — stap 3, fix na Archi-test door Mark: op Kennismodel (copy) stond de aggregatie Kennismodel-wiki → Capability/Groep dubbel (nesting + oude lijn uit een run met één ouder). Regel: een relatie die als nesting getoond wordt verliest haar andere lijnen (`nestingConnections`, pure, getest); SPEC §5/§7/§11, Part A Writer parenthood + invariant 4 + beslissing, Part B Writer.
- 2026-10-19 — stap 3 in Archi gecontroleerd door Mark.
- 2026-10-19 — stap 4: `_generateSingle` maakt/leegt de view bij `NEW_VIEW` pas ná de layout; B.7-punt weg, SPEC §12 en Part B aangevuld. Geen Node-test voor de fout-injectie (generate_view heeft Archi `$`/`model` nodig); in Archi te controleren met een geforceerde adapterfout.
- 2026-10-19 — stap 5: functionele inhoud van Part A naar de SPEC-appendix (Dialog reference, Preset JSON schema + Rule lists, Selection run order, Counting rules, Nesting reference, Sizing refinements, Layout graph and result, Capability matrix, Console logging, Rule scopes); body 541 regels (§1 = de @keep-tekst, invariant 15 UI-only state). Part A = alleen ontwerpbeslissingen (verouderde richting-vinkjes vervangen; rationale van interactieregels, cycles, sizing, layout-voor-view toegevoegd). `gen_docs_tables.js` schrijft nu naar SPEC.md; §A-verwijzingen in code bijgewerkt; B.7-punt weg. Alle checks groen, geen gebroken ankers.
