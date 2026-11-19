# View console-output en logbestand

Status: **afgerond 2026-11-19** — code, docs en verificatie; één commit.

## Context

De console van een View-run is nu een dump van ~250 technische regels: pipeline-telblokken, engine-opties en timings. Daardoor zie je niet in één oogopslag wat er gebeurde. De gebruiker wil op de console alleen wat een eindgebruiker nodig heeft: wat de run doet, waarop, met welke instellingen, het resultaat per view, en wat aandacht vraagt. Alle diagnostiek gaat ongewijzigd naar een roterend logbestand. De console is voor de eindgebruiker; het log is voor debuggen en troubleshooting. Selectie, filters, presets en layout blijven gelijk. Het foutgedrag verandert alleen waar dat hieronder beargumenteerd wordt.

## Beslissingen (ronde 1)

- **Taal**: alles Engels, de console ook. Regel 2 blijft intact: de termen komen uit SPEC § 2 Vocabulary, inclusief de Counter rule (op de view tel je *nestings* en *connections*, nooit "relations"; selectietellers gebruiken *relations*).
- **Logplaats**: de gebruikersmap van Archi, `<Archi user data>/logs/archi-scripts/` (Linux `~/.archi`, Windows `%APPDATA%\Archi`, macOS `~/Library/Application Support/Archi`). De map wordt gelezen via Archi's eigen klasse `ArchiPlugin`. De exacte methode wordt vóór gebruik in de Archi-bron opgezocht (hard rule 1). Geen logs in de repo.
- **Messagebox** aan het eind van een View-run zodra ten minste één view mislukt of overgeslagen is, of als er niets is geschreven. Bij een fout met fout-icoon, anders met waarschuwingsicoon. Waarschuwingen alleen geven geen box.
- **Geen tijdstempel per logregel**: bovenaan het log de starttijd, onderaan de eindtijd en de duur.
- **Platform en versies op de console**: één regel in het startblok.
- **Consolebreedte** maximaal `CONSOLE_WIDTH = 80` (constante in `log.js`). Langere regels lopen door met een hangende inspringing. *Effect* en *Action* staan elk op een eigen regel.
- **Ook `_lib` meenemen** (ronde 3): alle logging verhuist uit `Common.js` naar `log.js`, ook `initConsoleLog`/`finishConsoleLog`. Scripts gebruiken `Log` direct. Het debug-onderscheid in de console (`debugStackPush/Pop`) vervalt.
- **Logbestandsnaam** (ronde 3): eerst datum en tijd (sorteerbaar), dan alleen de presetnaam: `20261119-141502-standaardenlijst.log`.
- **Startblok en afronding** (ronde 3): de platformregel krijgt het label `Platform:`, uitgelijnd met de andere labels. De duur staat op een eigen regel `Duration:`, los van de tellers.

## Uitgangssituatie (onderzocht)

- **Geen centrale logger.** ~250 losse `console.log`/`console.error`-aanroepen in `Scripts/View/lib/**`, waarvan 37 `Loading <module>.js`. jArchi-console: alleen `log`, `error`, `show`, `clear`, één argument, geen `warn`. Tijdens een modale dialoog blokkeert de console; een bestand schrijven blokkeert niet. Bestanden worden al via Java geschreven (`preset_io.writeJSON`).
- **Twee runtimes.** Dezelfde modules draaien in Archi en in Node (de harness en `tools/node_layout_run.js`, dat adapterregels als `{ text, error }` teruggeeft aan `lib/node_layout.js`).
- **Testtooling leest de console.** `tools/console_checks.js` parseert `<script>.console.txt` van `tools/archi_cli.sh`: de telbelofte (`Total to view:` tegen `Objects on view:` en `View "…" written`), `Timing:`, `##### <run>`, ⚠ en `Warning:` (tegen `test/expected/*-warnings.txt`) en `ERROR: ` (gemarkeerd door `test/cli_console.js`).
- **Foutmodel nu** (SPEC § 12, ARCHITECTURE § Errors): `run_preset.showFailure` toont de reden in een messagebox en de stack op de console. *One view each*, Regenerate en Regenerate siblings stoppen bij de eerste fout.

### `_lib`-modules die View gebruikt, en de impact van meenemen

| Module | Wat View gebruikt | Logging erin | Andere gebruikers | Impact van meenemen |
|---|---|---|---|---|
| `Common.js` | `initConsoleLog`, `finishConsoleLog` (42 View-entries), `startCounter`/`endCounter`, `generateUUID` | versiekop, `finished in`, `info`/`debug` met `debugStack` en functienaam, `logInColumns`, `check_JS_Engine`/`check_CommonJS_Support` (console.error) | 97 scripts buiten View roepen `initConsoleLog` aan (90× met `true`, 3× `false`, 6× zonder tweede argument); 8 gebruiken `Common.debug` (63 aanroepen) met `debugStackPush`/`Pop` (29 aanroepen): `Appearance/setDefaultFormat.ajs`, `reverseRelation.ajs`, `GEMMA/include_GEMMA.js`, `GEMMA/GGM/4_ggm_gemma_views.ajs`, `GEMMA/GGM/include_ggm_gemma.js`, `ImportExport_CSV/include_{export_import,import,export}.js`; `logInColumns` 4 aanroepen; `Common.info` 0 | **Alle logging gaat uit `Common.js` naar `log.js`** (ronde 3). `initConsoleLog`/`finishConsoleLog` worden `Log.start(__FILE__, clear)`/`Log.finish()`. `Common.debug` wordt `Log.debug`, met de functienaam (`_getFuncName` verhuist mee). `logInColumns` wordt `Log.columns`, op INFO. De meldingen van `check_*` worden `Log.error`. `info`, `debugStackPush`/`Pop` en `_logMessage` vervallen. Alle aanroepers worden in dezelfde commit omgezet (regel 3: geen shim): ~140 entry-scripts (één `require` plus twee regels), de 8 debug-bestanden (63 aanroepen omzetten, 29 push/pop weg) en de 4 `logInColumns`-aanroepen. Elk script krijgt het startblok (platform en versies op de console) en een logbestand. In `Common.js` blijven `startCounter`/`endCounter`, `generateUUID`, `formatRelation`, `getFormattedDateTime`, `concept` en de constanten. De eigen `console.log` van scripts buiten View (836 aanroepen in 142 bestanden) verandert niet; die later migreren valt buiten scope. |
| `selection.js` | `getSelection`, `getSelectionArray`, `getVisualSelection` | `Loading`, `Collection: …`, `Select …`, `Selected …`, `Apply …` | 8 scripts buiten View (o.a. `addProperty.ajs`, `merge*.ajs`, `Beheren/*`, `GEMMA/GGM/*`) | Selectieregels worden `Log.debug`: ook in de andere 8 scripts verdwijnen ze van de console naar het log. `applyToCollection` (`Apply …`/`… applied to n objects`) is voor die scripts gebruikersinformatie en wordt `Log.info`. |
| `archi_folders.js` | `getFolderPath`, `printFolderPath` | `Loading`; `deleteEmptyFolders` toont verwijderde mappen | `Beheren/*` | `Loading` wordt `Log.debug`. De mappenlijst is gebruikersinformatie en wordt `Log.info` (blijft op de console). |
| `doEach.js`, `includeMergeConcept.js`, `jvm-npm.js` | niet | — | andere scripts | Buiten scope, behalve de `Loading`-regel als die er is. |

## 1. Inventarisatie en classificatie

Niveaus: **INFO** gebruikersvoortgang en -resultaat (console + log) · **WARN** afwijking die de gebruiker aangaat (console + log) · **ERROR** een view of de run mislukt (console + log) · **DEBUG** techniek (alleen log). *Samengevat* betekent dat de regel naar DEBUG gaat en dat de inhoud terugkomt in het startblok, de statusregel per view of de afronding. DEBUG-teksten blijven letterlijk zoals ze nu zijn.

### Overal

| Waar | Melding nu | Niveau |
|---|---|---|
| 37 View-modules + `_lib`, regel 1 | `Loading <module>.js` | DEBUG |
| `Common.initConsoleLog` → `Log.start` | versiekop, `Running script:` | INFO, compact: `Platform:` en `Script:` |
| `Common.finishConsoleLog` → `Log.finish` | `Script "…" finished in …` | INFO: `Duration:` in de afronding |

### Start en instellingen

| Waar | Melding nu | Niveau |
|---|---|---|
| `run_preset` 92, 108, 127, 145 | `Preset "…" action …` / `Session action …` | INFO, samengevat (startblok) |
| `run_preset` 87 | richting uit de scriptnaam gaat voor | INFO, samengevat (`direction Right (script name; preset: Down)`) |
| `generate_view` 144–146, 175, 181 | kop, `Action:`, `Algorithm:`, `Name/Folder`, `View size requested:` | INFO, samengevat |
| `generate_view` 157 | `Params: dir=… routing=… spacing=…` | DEBUG |
| `generate_view` 140, 142 | genegeerde inactieve params, verbindingsmodus vergrendeld | DEBUG |
| `generate_view` 168 | `Preset values not in dialog:` | INFO in het startblok (`Also active, not in the dialog: …`) |
| `generate_view` 171 | engineParams: gewoon / `⚠` / `✗` | DEBUG / WARN / ERROR (de run stopt) |
| `preset_io` 149, `defs` 1036, `rel_filter` 104 | onbekende presetsleutel / waarde niet ondersteund / ongeldige conditie overgeslagen | WARN |
| `preset_io` 174, 208 | `Preset saved`, `Created Default preset.` | INFO |
| `preset_io` 234 | Default wijkt af van de code-defaults | INFO één regel + DEBUG-details |
| `preset_io` 267, 279 | sessie ongeldig / niet opgeslagen | WARN |
| `view_config` 35, `hidden_properties` 56 | lokale config-waarden, verborgen sleutels | DEBUG |
| `dialog_main` 216 | blok `GUI — before dialog:` | DEBUG |
| `dialog_main` 281, `tab_appearance` 103, 148 | preset niet vergeleken, stijlconditie niet geteld, paletten niet gelezen | WARN |
| `dialog_main` 495 | `Counts failed:` + stack | ERROR (reden); stack DEBUG |
| `dialog_main` 347, `run_preset` 218, 329 | `One view each cancelled: nothing written.` | INFO |

### Selectie en objectverzameling

| Waar | Melding nu | Niveau |
|---|---|---|
| `selection_read` 45, 206, 356 | `Current selection:`, views uitgeklapt, bestaand op de view | DEBUG; samengevat als `Selection` |
| `selection_pipeline` 48 | filter overgeslagen bij een Modify-actie | INFO, samengevat (`filter not applied: the whole view`) |
| `selection_pipeline` 270, 361–390, 204 | stapcondities, filtercondities, diagram-blocks | DEBUG |
| `selection_pipeline` 273 | stap gestopt op het maximum aantal runs | WARN |
| `selection_pipeline` 334–354 | telblok `Pipeline — build object set:` | DEBUG (ongewijzigd: `console_checks` leest het); samengevat per view |
| `generate_view` 526, 530 | geen elementen / meer elementtypen (One view each) | WARN |

### Layout

| Waar | Melding nu | Niveau |
|---|---|---|
| `generate_view` 363, 379, 377, 440 | kopjes, voorbeeldmaat label, containerlabels opnieuw | DEBUG |
| `generate_view` 371 | niets te plaatsen | WARN; de view telt als *skipped* |
| `generate_view` 458 | geen layout past elk containerlabel | WARN |
| `generate_view` 472, 478, 484, 493 | relatierollen, toegepaste nestings, resultaat, viewgrootte | DEBUG; samengevat per view |
| `layout_graph` 88, 97 | circulaire nesting (met namen); te diepe nesting als connection | WARN |
| `node_layout` 48 | Node niet gevonden, de layout draait in Archi | WARN (*Action*: Node installeren of `nodePath` instellen) |
| `node_layout` 57–58, 61 | adapterregels uit het Node-proces; timing | per niveau van de adapterregel; DEBUG |
| `elk` 278, 291 e.v., 442–455, 611–615, 659, 1098 | engine, config, passes, mismatches, size clamp | DEBUG |
| `elk` 404, 408, 1249 | max width / aspect ratio niet gehaald; relatie niet gerouteerd | WARN |
| `dagre`, `graphviz`, `tiles`, `engine-utils` (alle) | geladen, berekenen, DOT, bb, vorm, kolommen | DEBUG |

### Schrijven, opmaak en afronding

| Waar | Melding nu | Niveau |
|---|---|---|
| `generate_view` 289–303 | `View target:`, `Using: …`, `Write:` | DEBUG; samengevat in de statusregel |
| `generate_view` 595, 674 / 668 | `Regenerating` / `Created view` / `Overwriting view` | INFO status *Updated* / *New*; WARN status *Overwritten* |
| `view_writer` 67, 185, 205, 249, 267, 69 | occurrences, schrijven, `Objects on view`, `View "…" written` | DEBUG (ongewijzigd: `console_checks`); samengevat per view |
| `view_writer` 88, 219, 287, 124 | object of connection niet geschreven / niet gekopieerd | detail in het log op WARN; op de console één samenvattende WARN per view |
| `appearance` 82–92, 355–393, 514, 553 | instellingen en tellingen | DEBUG |
| `appearance` 83, 319, 323, 457, 475, 557, 574 | palet of bereik ontbreekt, condities overlappen, relaties niet gelezen | WARN |
| `generate_view` 245, 224 | verborgen eigenschap in de preset; view niet geopend in de UI | WARN |
| `generate_view` 262, 320, 195 | eigenschappen, `Timing:`, totaal | DEBUG (ongewijzigd); de duur komt in INFO |
| `run_preset` 165, 260–265 | `Regenerated n of m`; regeneratieblok | INFO samengevat; `Not used` DEBUG; *made with unsaved settings* WARN |
| `run_preset` 184, 199, 216, 240, 245, 275, 277 | geen origin / start weg / preset niet gevonden | WARN; de view telt als *skipped* |
| `run_preset` 340 | `Run failed:` + stack | ERROR: de reden op de console, de stack alleen in het log |

## 2. Foutgedrag: beargumenteerde wijziging

**Nu:** een fout in één view van *One view each*, Regenerate of Regenerate siblings stopt de hele run. De overige views worden niet gemaakt, en de console toont een stack.

**Voorstel:** een fout van één view blijft bij die view. De view wordt *failed*: de reden staat op de console, de stack in het log, en de run gaat door met de volgende view. Fouten op runniveau stoppen de run nog steeds vóór er iets geschreven is: preset of `engineParams` ongeldig, config-pad niet gevonden, geen `Views`-map, Modify-actie zonder view.

**Waarom:**
- Eén lastig element (bijvoorbeeld een layout-timeout) blokkeert nu 20 andere views.
- De samenvatting kan precies zeggen wat gelukt, overgeslagen en mislukt is.
- Er is geen technische stack meer nodig op de console.

**Wat blijft gelden (SPEC § 12):**
- Een engine-fout schrijft niets voor die view.
- Een fout tijdens het schrijven kan die ene view half geschreven laten (zoals nu).
- De hele run blijft één undo-stap.

**Kosten:** bij meerdere timeouts duurt een run langer (120 s per view). De console toont elke mislukte view direct.

**Plaats van de wijziging:** `generate_view._generateOneEach` en de lussen in `run_preset.fromView` en `_regenerateSiblings` vangen per view af. Dat is een nieuwe vang-grens, die in ARCHITECTURE § Errors komt.

## 3. Ontwerp console-output

**Conventies.**
- Engels, met termen uit SPEC § 2.
- Geen tijdstempels; breedte maximaal 80 tekens.
- Statustekens: `✓` gelukt, `⚠` waarschuwing, `✗` fout, `–` overgeslagen.
- Kop op wortelniveau, details twee spaties ingesprongen.
- Elke WARN en ERROR heeft drie delen, elk op een eigen regel: wat er gebeurde, `Effect:` en `Action:`.

### Voorbeeld 1 — geslaagde run (dialoog, *New view*)

```
View generation: New view
  Platform:   Archi 5.10.0 · jArchi 1.12.0 · GraalVM · Linux
  Script:     _gui.ajs
  Preset:     GEMMA/TAenIA (modified, not saved)
  Selection:  1 view in the model tree: "Zaakgericht werken"
  Settings:   ELK Layered · direction Right · nesting: 2 conditions
              · max width 1800 px
  Target:     new view in /Views/_Generated/Gemma
  Log file:   ~/.archi/logs/archi-scripts/20261119-140312-TAenIA.log

✓ New: "Zaakgericht werken" in /Views/_Generated/Gemma
    Filtered base: 42 elements · 57 relations (5 elements filtered out)
    Step adds:     26 elements · 34 relations
    On view:       68 elements (12 containers, 41 nested elements)
                   · 41 nestings · 50 connections · 3 diagram objects
    Size:          2400 × 1350 px · 1.8 s

Result:   1 generated · 0 skipped · 0 with warnings · 0 failed
Duration: 2.1 s
```

### Voorbeeld 2 — deels mislukte run (snelkoppeling, *One view each*)

```
View generation: One view each
  Platform:   Archi 5.10.0 · jArchi 1.12.0 · GraalVM · Linux
  Script:     standaardenlijst_new_view_right.ajs
  Preset:     GEMMA/standaardenlijst · direction Right (script name;
              preset: Down)
  Selection:  25 elements in the model tree (2 element types) → 25 views
  Settings:   Graphviz Dot · no nesting · view size free
  Target:     a view per element, in its element's folder, under
              /Views/_Generated
  Log file:   ~/.archi/logs/archi-scripts/20261119-141502-standaardenlijst.log

⚠ The selection holds 2 element types (Application Component, Data
  Object).
    Effect: the views of the two types are built differently.
    Action: select one type, or filter the preset on one type.

✓ Updated: "Burgerzaken" in /Views/_Generated/Applicaties
    On view: 14 elements · 18 connections · 1200 × 640 px · 0.9 s
⚠ Overwritten: "Belastingen" in /Views/_Generated/Applicaties
    On view: 9 elements · 11 connections · 980 × 520 px · 0.7 s
    ⚠ 1 image not copied: jArchi cannot create an image.
      Action: put it back by hand.
– Skipped: "Archief"
    Nothing to place: the element filter keeps no element.
    Action: change the element filter.
✗ Failed: "Zaken"
    The layout did not finish within 120 s and was stopped.
    Effect: no view for "Zaken"; the run went on.
    Action: try another algorithm or a smaller selection.
            Details: log file, search for "ERROR".
✓ New: "Zorg" in /Views/_Generated/Applicaties
    ...

Result:   22 generated (1 with warnings) · 1 skipped · 1 failed
Duration: 41.0 s
Log file: ~/.archi/logs/archi-scripts/20261119-141502-standaardenlijst.log
```

A path is never broken in the middle: a line with a path may run past 80 characters.

Daarna volgt een messagebox (fout-icoon), titel *View run: 1 failed, 1 skipped*. De box toont de resultaatregel en de namen van de mislukte en overgeslagen views, en verwijst naar de console.

### Voorbeeld 3 — lege selectie

```
View generation: New view
  ...
– Skipped: no view written
    Nothing to place: nothing is selected.
    Action: select elements or a view in the model tree or on a view.

Result:   0 generated · 1 skipped · 0 with warnings · 0 failed
Duration: 0.2 s
```

Daarna volgt een messagebox (waarschuwingsicoon): *No view written*.

### Varianten

- **Expand view / Layout only**: `Target: the selected view "X" (in place)` en statusregel `✓ Updated:`. Bij `Filtered base` staat `filter not applied: the whole view`.
- **Regenerate**: het startblok noemt per view de preset uit de origin en de plek waar de view blijft. *Made with unsaved settings* is een WARN.
- **Scripts buiten View** (via `Log.start`/`Log.finish`): het startblok bevat `Platform:`, `Script:` en `Log file:`, en aan het eind staat `Duration:`.
- **De afronding staat er altijd**, ook na een fout op runniveau: `Log.finish` draait in een `finally`.

## 4. Ontwerp logbestand

- **Plaats**: `<Archi user data>/logs/archi-scripts/`, één bestand per run.
- **Naam**: `<yyyyMMdd-HHmmss>-<name>.log`. Datum en tijd staan vooraan, zodat de bestanden op naam sorteren.
  - *name* is het laatste deel van de presetnaam (`GEMMA/TAenIA` → `TAenIA`).
  - Zonder één preset is het de scriptnaam zonder `.ajs`: Regenerate van views met verschillende presets, of een script buiten View.
  - In de dialoog is de preset pas bekend na het sluiten. Daarom maakt `Log` het bestand pas aan bij `Log.name(name)`, of uiterlijk bij `finish`. Tot dan worden de regels gebufferd. Archi blijft draaien bij een scriptfout en `finish` staat in een `finally`, dus de buffer gaat niet verloren.
- **Kop**: `Started 2026-11-19 14:03:12`, het script, Archi, jArchi, engine, platform. **Voet**: `Finished 2026-11-19 14:03:53 (41.0 s)`, of `Stopped by an error` bij een onverwachte fout.
- **Regel**: `LEVEL [context] text`, bijvoorbeeld `DEBUG [view 2 "Belastingen"] Pipeline — build object set:`. De context (`run`, of `view n "name"`) koppelt consolemeldingen aan logregels. Elke INFO, WARN en ERROR van de console staat met dezelfde tekst in het log, tussen de DEBUG-regels van dezelfde stap. Het log wordt niet afgebroken op 80 tekens.
- **Inhoud**: alle huidige technische regels letterlijk, plus stacks en de details achter samengevatte WARN's.
- **Rotatie**: na het openen blijven de nieuwste `LOG_KEEP = 20` bestanden staan. Per bestand geldt `LOG_MAX_MB = 10`: daarboven volgt één regel *log full*, daarna nog alleen WARN en ERROR.
- **Buffer**: regels van vóór `start` (de `Loading`-regels) en van vóór `name` worden bij het aanmaken weggeschreven. Een script zonder `start` schrijft geen bestand.
- **Configuratie**: `CONSOLE_WIDTH`, `LOG_KEEP`, `LOG_MAX_MB` en de logmap staan als constanten bovenaan `log.js`, op één plek. Er is geen schakelaar meer om DEBUG op de console te zetten.

## 5. Implementatie

- **Nieuw: `Scripts/_lib/log.js`, de enige plek voor logging.**
  - API: `start(scriptFile, clear)`, `finish()`, `name(name)`, `info`, `warn`, `error`, `debug`, `detail(level, text)` (alleen in het bestand), `columns(data, headers)`, `beginView(name)`, `endView(status)` en `summary()` (tellers en duur).
  - Een pure kern met twee sinks. In Archi schrijft de console-sink met de 80-tekenwrap en schrijft een bestands-sink via Java (`java.io.FileWriter`, append, flush per regel, net als `preset_io.writeJSON`). In Node gaat alles naar de console met `LEVEL` als voorvoegsel.
  - Komt in `jsconfig.json` › `include`.
- **`_lib/Common.js` zonder logging.**
  - `initConsoleLog`, `finishConsoleLog`, `info`, `debug`, `debugStackPush`/`Pop`, `_logMessage`, `_getFuncName` en `logInColumns` verdwijnen eruit. `check_*` meldt via `Log.error`.
  - Alle aanroepers worden in dezelfde commit omgezet, mechanisch, en daarna gecontroleerd met grep op `Common\.(initConsoleLog|finishConsoleLog|debug|info|debugStack|logInColumns)` = 0:
    - ~140 entry-scripts: `const Log = require(REPO_ROOT + "_lib/log")`; `Common.initConsoleLog(__FILE__, x)` → `Log.start(__FILE__, x)`; `Common.finishConsoleLog()` → `Log.finish()`;
    - 8 bestanden: `Common.debug` → `Log.debug`, en de push/pop-aanroepen weg;
    - 4 aanroepen: `Common.logInColumns` → `Log.columns`.
  - Een `require` van `Common` die daarna ongebruikt is, verdwijnt ook.
- **`_lib/selection.js`, `_lib/archi_folders.js`**: de regels worden `Log.debug` of `Log.info` volgens de tabel.
- **View-modules**: elke `console.*` wordt `Log.<level>` volgens § 1. DEBUG-teksten blijven gelijk; nieuwe Engelse teksten alleen voor INFO, WARN en ERROR. Het startblok, de statusregel per view en de afronding worden op één plek opgemaakt: `generate_view.js` per view (uit data die er al is: het pipeline-telblok, `_logObjectsOnView`, `_logLayoutResult`, `_getOrCreateView`, `_phaseTimer`) en `run_preset.js` voor start en afronding.
- **Foutgedrag** (§ 2): vangen per view in `_generateOneEach`, `fromView` en `_regenerateSiblings`. `showFailure` schrijft de reden op ERROR, de stack met `detail`, en sluit de view of de run af.
- **Lognaam**: `run_preset` (`fromFilename`, `fromDefault`, de sessie-entries) en de dialoogrun roepen `Log.name(presetName)` aan zodra de preset bekend is.
- **Messagebox**: een nieuwe functie `run_preset.reportOutcome(summary)`, aangeroepen door de View-entries (`_reported`, `fromView`, `fromViewSiblings`, de dialoogrun) na `generate_view`. Het entry-punt praat met de gebruiker (SPEC § 3). Zonder workbench (command line) geen box. Bij een fout op runniveau blijft de bestaande box van `showFailure`, dus geen dubbele box.
- **Node-layoutproces**: `node_layout_run.js` geeft `{ level, text }` terug en `node_layout.js` speelt het af via `Log`.
- **Testtooling**:
  - `archi_cli.sh` haalt het pad uit de regel `Log file:` op de console en kopieert het log als `<script>.log` naar de out-map.
  - `console_checks.js` leest dat log (voorvoegsel eraf; WARN en ERROR op niveau in plaats van `⚠`/`Warning:`/`ERROR: `).
  - `test/cli_console.js` vervalt.
  - `test/expected/*-warnings.txt` wordt opnieuw geschreven (`expected.js --write`) na review van het verschil.

## 6. Docs (na akkoord op de code; `Scripts/View/AGENTS.md` § Order of change)

- SPEC § 12: per-view-fouten, messagebox, detail in het log.
- SPEC § 14: Logging.
- `docs/reference/engines.md` § Console logging: console en logbestand.
- ARCHITECTURE: § Logging, § Errors (nieuwe vang-grens), § Runtimes (`log.js` in Node) en § Persistent state (logmap).
- README: waar het log staat.
- `repo-guide.md` § Shared modules: `log.js`, en de verdwenen `Common.info`/`debugStack`.
- Docs en code gaan in één commit.

## Verificatie

1. `npm run typecheck` met exit 0.
2. Een Node-unittest `Scripts/View/tools/log_test.js`: niveaus, buffer vóór start, de 80-tekenwrap, context, rotatie (keep 20), plafond, kop en voet.
3. Node-harness: layouts identiek aan vóór de wijziging (`tools/layout_checks.js`, `write_plans.js` met `--check`).
4. Diagnostiek behouden: van elke testrun de oude `console.txt` (vóór de wijziging) tegen het nieuwe log, regel voor regel. Elke oude regel staat erin, op `Loading` na.
5. Archi headless (`tools/archi_cli.sh`):
   - `test/run_baseline.ajs` met `console_checks.js` op het log: de telbelofte gelijk en geen ERROR;
   - plus scenario's: een normale *New view*, een lege selectie, *One view each* met twee typen en een view zonder iets te plaatsen, een mislukte view (een te korte timeout in een testpreset, of een ongeldig `dotPath` voor een fout op runniveau), en Regenerate op een view zonder origin.
   - Ik controleer per scenario de console (breedte ≤ 80, geen DEBUG) en het log.
6. Baseline in Archi (skill `view-baseline`; de gebruiker start de run, ik vergelijk): views identiek.
7. Messagebox en dialoogrun in Archi met de GUI (skill `view-testing`, `gui_check.ajs`, screenshots): een box bij *failed* of *skipped*, geen box bij alleen warnings.
8. Steekproef buiten View, headless: `reverseRelation.ajs` (debug), een `ImportExport_CSV`-script (debug en `Log.columns`) en een script met `initConsoleLog(__FILE__, false)`. Te zien: het startblok en `Duration:` op de console, de debugregels in het log, en `node --check` en de typecheck schoon voor alle omgezette bestanden.

## Stappen

| # | Stap | Status |
|---|---|---|
| 1 | Inventarisatie en classificatie | gedaan |
| 2 | Ontwerp; akkoord van de gebruiker | gedaan (ronde 3) |
| 3 | `_lib/log.js` + `log_test.js`; logmap via `ArchiPlugin` opzoeken in de Archi-bron | gedaan |
| 4 | Logging uit `Common.js`; 102 aanroepers, 8 debug-bestanden en 4 `logInColumns` omgezet; `selection.js`, `archi_folders.js` | gedaan |
| 5 | View-modules omzetten volgens § 1 | gedaan |
| 6 | Startblok, statusregel per view, afronding, `reportOutcome`; per-view-fouten (§ 2) | gedaan |
| 7 | Node-layoutproces; testtooling naar het log; `test/cli_console.js` weg | gedaan |
| 8 | Verificatie 1–6 en 8 (6 headless: `compare-views` 14 + 5 views gelijk) | gedaan |
| 9 | Verificatie 7 in Archi met de gebruiker: messagebox en dialoogrun | gedaan (box bij niets geselecteerd, foutbox zonder model, CommonJS-melding) |
| 10 | Presenteren; na akkoord de docs (§ 6, plus: `AGENTS.md` Conventions › Logging en Names, `repo-guide.md` voorbeeld-entry, `Scripts/View/README.md` voorbeeld, `skills/view-baseline/SKILL.md` (`.log` i.p.v. `console.txt`), `docs/architecture-model/architecture_model.js` + model (`cli_console` weg, `log.js` erbij)) en één commit | gedaan |

## Log

- 2026-11-19 — Inventarisatie en ontwerp ronde 1.
- 2026-11-19 — Ronde 2:
  - alles Engels;
  - log in de gebruikersmap van Archi;
  - messagebox bij failed of skipped;
  - geen tijdstempel per regel, wel start en eind;
  - platform op de console;
  - breedte 80;
  - *Action* op een eigen regel;
  - per-view-fouten;
  - `_lib` meegenomen via `Common.js`; debugStack vervalt.
- 2026-11-19 — Ronde 3:
  - alle logging uit `Common.js` naar `log.js` (`Log.start`/`finish`), aanroepers omgezet;
  - logbestand `<datum-tijd>-<preset>.log`;
  - `Platform:`-label;
  - `Duration:` op een eigen regel.
- 2026-11-19 — Uitvoering stap 3–8. Afwijkingen van het ontwerp:
  - logmap via `ArchiPlugin.getWorkspaceFolder()` (`-Dosgi.instance.area`, ~/.archi, naast Archi's eigen `.metadata/.log`), niet `getUserDataFolder()` (dat is ~/Documents/Archi): zo komt het log waar gekozen;
  - `Log.debug` zet geen functienaam meer voor de regel (het oude `Common.debug` deed dat via een stacktrace per regel): te duur voor de honderden View-regels; de context `[run]`/`[view n]` vervangt het;
  - `selection.js` "One concept selected, apply to all concepts of type …" is DEBUG, niet INFO: in View beschrijft het een interne uitbreiding en verwarde het bij Expand view;
  - `GenerateOptions.presetName` erbij: de naam voor console en log bij een sessierun, die geen origin achterlaat;
  - een herhaalde WARN binnen één view komt één keer op de console (de containerlabel-lus legt tot 6× opnieuw uit);
  - kolommen: waarden op kolom 17, de details van een view op kolom 15 onder de statusregel; platformversies zonder buildnummer.
- 2026-11-19 — Verificatie: typecheck schoon; Node-tests, `write_plans --check` (504) en `layout_checks --check` (504, 0 overtredingen) gelijk; baseline headless: telbelofte 14/14, geen ERROR, `compare-views` Baseline 14 en Test 5 gelijk aan de gecommitte baseline; oude console (899 regels) tegen het nieuwe log: alleen de bedoelde herschreven regels ontbreken (versiekop, eindregel, één waarschuwing); scenario's headless: lege selectie, overschrijven, mislukte view, Regenerate met overgeslagen view, fout op runniveau; rotatie (20) en plafond (10 MB, voet blijft); scripts buiten View (`reverseRelation`, `countFontInModel`, `Log.columns`, include-bestanden). `test/expected/run_baseline-warnings.txt` herschreven (nieuwe teksten; circular nesting is nu WARN).
- 2026-11-19 — Ronde 4 (check van de gebruiker in Archi: waarschuwingsbox bij niets geselecteerd werkt):
  - `log.js` generiek: `beginItem(kind, name)` / `endItem(status, headline, details)` met status `done`/`skipped`/`failed`; View geeft `kind` "view" mee en noemt `done` op de console "generated";
  - een regel `=` (80) markeert begin en eind van elke run, zoals de strepen van het oude `initConsoleLog`;
  - het startblok noemt alleen de naam van het logbestand; aan het eind staat het volledige pad (zoals het platform het schrijft, geen `~`) alleen op de regel na `Log file:`, om te kopiëren; de messagebox geeft hetzelfde pad; `archi_cli.sh` leest het pad van die regel;
  - zonder geselecteerd model: `RunPreset.requireModel()` in `_reported` en vóór de dialoog opent, met de tekst "No model selected. Select a starting point in a model (elements, a view or a folder) before running this script." in plaats van jArchi's melding.
- 2026-11-19 — Ronde 5 (foutbox zonder model bevestigd door de gebruiker):
  - CommonJS-check in elk `.ajs` dat `require` gebruikt (168), één identieke regel vóór `REPO_ROOT`/de eerste `require`: zonder `require` een `window.alert` met de voorkeur en `exit()`. Opgezocht in jArchi 1.12: voorkeur "Enable CommonJS Support" (sleutel `commonJSEnabled`); alleen dan zet `JSProvider` `js.commonjs-require` aan, anders bestaat `require` niet. De check kan niet in een module: die laadt pas via `require`;
  - `Common.check_CommonJS_Support` en `MIN_JARCHI_VERSION_COMMONJS` weg: geen aanroepers, en het kon nooit werken (het zit in een module die `require` nodig heeft);
  - docs (stap 10) erbij: de regel in het voorbeeld-entryscript van `repo-guide.md` en de jArchi-skill.
  - Gevonden, niet aangeraakt: syntaxfouten in HEAD in `GEMMA/used_once/change_AF2AS.ajs` (losse `}`) en `Sync from CSV/Sync BF BO.ajs` regel 69 (`element.id prop(…)`).
- 2026-11-19 — Ronde 6 (CommonJS-melding bevestigd door de gebruiker): de melding noemt de minimale versie, jArchi 1.11. Afgeleid uit de skill en `jarchi.d.ts`: 1.6 CommonJS (alle scripts), 1.9 `model.isSet()`, 1.10 visual verplaatsen met `add(vo, x, y)` (View-writer), 1.11 `fillColor` leest de effectieve kleur na reset (View-opmaak, Appearance-scripts); 1.12 alleen voor legenda's (stille catch zonder). Getest met 1.12. Docs (stap 10): de minimale versie in `Scripts/View/README.md` en `repo-guide.md`.
- 2026-11-19 — Ronde 7: versiecontrole los van CommonJS in `Log.start` (elk script roept het aan zodra `require` werkt): jArchi ouder dan `MIN_JARCHI` ("1.11", één constante in `log.js`) → ERROR op de console, in Archi een `window.alert`, `finish()` en `exit()` (bestaat in alle versies; `quit()` is het alias sinds 1.8). `versionBelow` vergelijkt getal voor getal (getest in `log_test.js`).
- 2026-11-19 — De CommonJS-check valt zonder venster (Archi's command line: geen `shell`, `window.alert` faalt) terug op `console.error`; headless getest met CommonJS uit: de melding en "Exited". Open: met CommonJS weer aan de baseline headless, die ook de normale start met de versiecontrole doorloopt.
- 2026-11-19 — Docs: SPEC § 12 en § 14, `reference/engines.md` § Console and log file, ARCHITECTURE § Errors, § Logging, § Persistent state, § Development and testing, View README (vereisten, voorbeeld, console en logbestand), `repo-guide.md`, `AGENTS.md` (Conventions › Logging, Names; Hierarchy), `types/README.md`, skills `view-baseline` en `jarchi-scripting`; architectuurmodel bijgewerkt (afhankelijkheden van `log`, `log.js`, `log_test.js`, data-object Log file; `cli_console` weg) en opnieuw gebouwd. Alle checks groen.

