# Statische typecontrole voor archi-scripts (JSDoc + tsc --noEmit)

## Context

De scripts zijn plain CommonJS-JavaScript voor jArchi/GraalJS. Er is geen statische controle, geen CI
(`.github/` bevat alleen copilot-instructies) en de enige automatische test is de Node-harness
`Scripts/View/tools/view_harness.js`. Doel: een reproduceerbare `npm run typecheck` die fouten vóór
uitvoering vindt, zonder buildstap en zonder het runtimegedrag te veranderen.

## Bevindingen uit het onderzoek

| # | Bevinding | Gevolg |
|---|---|---|
| F1 | Alle modules laden elkaar met `require(REPO_ROOT + "…")` (dynamisch pad) | tsc kan dat niet volgen → elk geïmporteerd module is `any`. Opgelost met een JSDoc-regel `/** @type {typeof import("…")} */` boven de `require` (alleen commentaar). In-memory getest: werkt, ook met de `if (typeof module …) module.exports = …`-guard. |
| F2 | Entry-scripts hebben extensie `.ajs` | tsc accepteert geen `.ajs`. Entry-scripts vallen buiten de controle; ze zijn dun (3–8 regels) in View. |
| F3 | `rchevallier/jarchi-lib` `globals.d.ts` (Apache-2.0, 263 regels) | Beschrijft jArchi **1.2**, laatst gewijzigd 2023-04; repo gebruikt 1.10+/1.12 (`add(vo,x,y)`-move, `parents()`, `delete(keepChildren)` ontbreken). Alleen als checklist gebruiken, niet overnemen. |
| F4 | Repo-referentie `ai/jarchi-scripting/jarchi-api-reference.md` (v0.1–1.12, uit de wiki) | Bron voor de nieuwe typings; afwijkingen tegen wiki/broncode controleren. |
| F5 | TypeScript 6 zet `strict` standaard aan | Strikt: ±667 meldingen in GUI/_lib, honderden in View/lib (vooral impliciete `any`). Niet-strikt: 21 meldingen in View/lib + `_lib/Common.js` + `archi_folders.js`. |
| F6 | Conventie "No npm; vendor in `Scripts/node_modules/`"; `.gitignore` negeert élke `package.json` | Een ontwikkel-`package.json` in de root is een (te documenteren) afwijking en vergt een `.gitignore`-uitzondering. |
| F7 | `Scripts/` wordt als geheel naar Archi gedistribueerd | Typings en config horen buiten `Scripts/` (repo-root). |

### Classificatie van de 21 niet-strikte meldingen (baseline, View/lib + 2 libs)

| Plaats | Klasse | Toelichting |
|---|---|---|
| `_lib/archi_folders.js:14` | echte fout (documentatie) | Ongeldige JSDoc `{Archi object}`; geen runtime-effect. |
| `selection_pipeline.js:72` | echte inconsistentie, geen runtimebug | Vroege return mist `visuals`; aanroeper (`generate_view.js:211`) stopt eerder op `existingView === null`. |
| `elk.js:1032-1034` (9×) | beperking typechecker | Tuple `[horz, vert, "y"]` wordt als union-array afgeleid. |
| `rel_filter.js:294-295` | beperking typechecker | `PRESET_RULE_LISTS`-tuples idem. |
| `selection_pipeline.js:151-154` | beperking typechecker | Heterogene `rows`-array; type uit eerste element. |
| `selection_pipeline.js:443` | beperking typechecker | `let existingView = null` in closure toegewezen → `never`. |
| `selection_pipeline.js:796-798` | beperking typechecker | `[root, 0]`-tuple als `(string|number)[]`. |

Alle beperkingen zijn met JSDoc op te lossen (zie B9); geen codewijziging nodig. De `visuals`-inconsistentie wordt wél in de code opgelost (B6).

### Conventie "No npm" — argumenten

| Voor (runtime) | Tegen / grenzen |
|---|---|
| Gebruikers kopiëren `Scripts/` naar Archi; geen installatiestap. | Vendored `node_modules/` (o.a. ±480 underscore-bestanden) vervuilt git en wordt handmatig bijgewerkt. |
| GraalJS + `jvm-npm` gebruikt toch geen npm-resolutie; vendoring is wat echt laadt. | Geen lockfile/integrity: herkomst en versie van vendored libs staan nergens in de repo (`Scripts/package.json` is gitignored). |
| Geen supply-chainrisico tijdens uitvoering; code is reviewbaar in git. | De regel zegt niets over ontwikkelgereedschap, en wordt nu ook toegepast waar hij niets oplevert. |

Conclusie: de conventie klopt voor de **runtime** en blijft daar ongewijzigd. **Harde eis: gebruikers draaien de scripts direct na `git clone`, zonder npm.** De root-`package.json` raakt dat niet: hij staat buiten `Scripts/`, heeft alleen een devDependency, en niets in `Scripts/` leest uit de root-`node_modules/`. Typecheck is alleen nodig voor ontwikkelaars. Regeltekst wordt: "No npm at runtime: scripts run straight from a clone; vendor runtime libs in `Scripts/node_modules/`. Development tools (typecheck) only via the root `package.json`." Vervolgaanbeveling (buiten scope): `Scripts/package.json` tracken als herkomstregistratie van de vendored versies (alleen metadata, geen installatiestap).

## Spoor B — jarchi-skill opschonen (minimale context, maximale sturing)

Los van de typecheck uit te voeren. Het raakt wel de typecheck, omdat de API-typings in de skill komen (B-D1).

### Huidige stand

| Bestand | Regels | Inhoud | Probleem |
|---|---|---|---|
| `SKILL.md` | 158 (12 KB, laadt bij elke trigger) | ProcessBuilder-recept, 4 "Key Constraints", SWT/GTK-regels, **12 dialoog-opmaakregels van deze repo** | Vooral SWT en repo-UI-stijl, weinig jArchi. Bevat fouten (zie onder) |
| `jarchi-api-reference.md` | 615 | API v0.1–1.12 uit de wiki | 120 regels versiegeschiedenis; **ontbreekt**: `console`, `window`-dialogen, `require`/CommonJS-voorkeur, `shell` |
| `jarchi-script-development.md` | 534 | REPO_ROOT, `_lib`-index, regels, standaarden, vocabulaire, repo-structuur, engines | Grotendeels **archi-scripts-specifiek**, niet jArchi (zie evaluatie hieronder) |
| `graaljs-compatibility.md` | 341 | Kopie van de GraalJS-documentatie | ±60% gaat over embedding en de js-shell (Intl, `.mjs`, js-shell-functies, Nashorn scripting mode): niet relevant voor scriptschrijvers |
| `java-interop.md` | 401 | Kopie van de GraalVM-documentatie | Polyglot Context, JSR-223, JS vanuit Java, Promises vanuit Java en multithreading gaan over de Java-kant: niet relevant |

### Fouten en tegenstrijdigheden in de skill

1. `SKILL.md` "Use `load()` — **never `require()`**": in strijd met de hele repo (overal `require`) en met jArchi ≥ 1.6 (CommonJS). **Schadelijk**: stuurt een agent de verkeerde kant op.
2. `SKILL.md` "object wrapper pattern (see `jarchi-script-development.md`)": dat patroon staat daar niet (dode verwijzing).
3. ProcessBuilder: stdout en daarna stderr na elkaar uitlezen kan alsnog vastlopen als stderr vol raakt. Juist: stderr naar een bestand/`DISCARD` leiden, of op een aparte thread lezen.
4. API-referentie mist API's die de repo gebruikt (`console.*`, `window.*`, `require`).
5. De `description` van de skill somt ±90 woorden triggers op; korter kan met dezelfde dekking.

### Doelindeling

`ai/jarchi-scripting/` alleen over **jArchi-plugin, API en runtime**. Elk bestand heeft één reden om het te laden:

| Bestand | Doel | Laden wanneer | Omvang (doel) |
|---|---|---|---|
| `SKILL.md` | Runtimemodel in 5 regels; **±15 harde valkuilen**, elk één regel "fout → goed" (collecties zijn geen arrays: `each`/`filter`/`find` = descendants; `model.isSet()`; `vo.delete()` cascadeert → `delete(false)`; verplaatsen met `add(vo,x,y)`; bounds −1; geen `setTimeout`/Node-API's; `require` i.p.v. `load`; console in modaal SWT-handler blokkeert; kinddialoog op `dlg.getShell()`; …); routeringstabel | altijd (bij trigger) | ≤ 90 regels, ≤ 4 KB |
| `jarchi.d.ts` | **De API-referentie als typings**: globals, collecties, concepten, views, visuals, connections, constanten, `console`, `window`; JSDoc met `@since`, en waar onzeker `@remarks unverified` | API-vraag of code schrijven | ±400–500 regels |
| `graaljs-java.md` | Samengevoegd en ingekort: ES2024-niveau, `Java.type`/`extend`/`from`/`to`, arrays/lists/maps, strings, exceptions, overloads, externe processen (gecorrigeerd recept) | Java-interop | ±200 regels |
| `swt-gtk.md` | Generieke SWT/JFace/GTK-regels (huidige "Core SWT Behaviours", fonts, tabs, spinners, TitleAreaDialog) | dialogen bouwen | ±70 regels |

**B-D1 (aanbeveling): `jarchi.d.ts` vervangt `jarchi-api-reference.md`.** Eén bron die zowel gelezen als door tsc gecontroleerd wordt; compacter dan markdown en niet meer handmatig te synchroniseren. De versiegeschiedenis wordt `@since`-tags plus een lijst van 10 regels met breaking changes (1.1, 1.8) in `SKILL.md`. Gevolg voor de typecheck: `jsconfig.json` neemt `ai/jarchi-scripting/jarchi.d.ts` op, en `types/` bevat alleen repo-typen (`view.d.ts`, `layout.d.ts`). Stap 3 schrijft daarom eerst het in scope gebruikte deel; de rest volgt in spoor B.

**Naar elders (repo-specifiek, uit de skill)**:
- Dialoog-opmaakregels 1–12, volgorde binnen een groep en knopbreedte 95 px → `ai/dialog-style.md` (repo-UI-stijl), met een verwijzing in `ai/rules.md` § Source references.
- `jarchi-script-development.md` → opgesplitst (zie evaluatie hieronder): regels naar `ai/rules.md` § Conventions (±25 regels), en een compacte module-index plus REPO_ROOT, repo-structuur en testen naar `ai/repo-guide.md` (±60 regels).
- Engine-regels in jArchi → `ai/dagre/SKILL.md` en `ai/elkjs/SKILL.md`.

**Index compacter?** Ja. De `_lib`-index (±120 regels met export-lijsten en voorbeelden) wordt één tabelrij per module: *module · doel · gebruik wanneer*. Dat is ±8 regels. Signatures komen uit JSDoc (bij modules in scope door tsc gecontroleerd); een agent opent het modulebestand alleen als hij het echt gebruikt.

**Resultaat (schatting)**: per trigger geladen 12 KB → ≤ 4 KB (±−70%); hele skill 86 KB → ±35 KB (±−60%). Bronnen GraalVM-docs (UPL) vermelden in `graaljs-java.md`.

### Evaluatie `ai/jarchi-scripting/jarchi-script-development.md`

Het document mengt drie dingen: **regels** (§ jArchi-Specific Rules, Coding Standards, Checklist, Template), een **index van gedeelde modules** (§ Available `_lib/` Modules, ±120 regels, een handmatige kopie van de exports) en **engine-regels** (§ Graph Layout Engines, ±90 regels, horen bij de dagre/elkjs-skills). De export-lijsten kloppen nu nog met de code, maar worden met de hand onderhouden. Met typecontrole wordt JSDoc in de module de bron.

| Regel | Effect | Wat ervoor terugkomt |
|---|---|---|
| "No npm; vendor…" | Goed voor runtime, maar telt ook ontwikkelgereedschap mee | Afbakenen tot runtime (zie hierboven) |
| REPO_ROOT + `require(REPO_ROOT + …)` overal | Werkt in Archi, maar tsc kan het pad niet volgen (F1). Elke import wordt `any`, behalve met een extra `typeof import`-regel | Behouden (geen runtimewijziging in deze opdracht). Probe (stap 7) test of jArchi relatieve `require("./defs")` vanuit een module goed oplost. Zo ja: vervolgvoorstel om naar statische relatieve paden over te gaan, en dan vervallen de `typeof import`-regels |
| #2 + checklist "Selection via `Selection.getSelection()`, not raw `$(selection)`" | Te absoluut: View geeft bewust `$(selection)` door (`View/_generate.ajs`) en heeft eigen selectiesemantiek | "Gebruik de helpers als je view-refs en enkelvoudige selectie wilt uitbreiden; een script met eigen selectiesemantiek documenteert dat" |
| Logging + checklist "errors via `Common.debug()`/`console.log()`" | Strijdig met de praktijk (21× `console.error` in View) en met het eigen template | `console.error` voor fouten, `console.log` voor voortgang, `Common.debug` voor diagnose |
| Minimal Script Template | `return` op topniveau buiten een functie (syntaxfout in een gewoon script; te verifiëren), en dubbel console legen | Verwijzen naar een bestaand werkend entry-script (`View/_generate.ajs`) in plaats van een eigen template |
| #6 "Java strings: altijd `String()`" | Onzeker: GraalJS zet `java.lang.String` meestal om naar een JS-string. Bepaalt ook de typings (`string` of niet) | Laten testen door de probe (stap 7); regel aanscherpen of schrappen op basis van de uitkomst |
| Fixed Vocabulary | Kopie van een View-vocabulaire in een repo-breed document, strijdig met harde regel 11 (SPEC § Vocabulary is leidend) en met de uitzondering nodes/edges in de layout graph | Verwijderen; verwijzen naar `Scripts/View/docs/SPEC.md` § Vocabulary |
| Testing Strategy "no automated tests, all manual" | Verouderd: `View/tools/view_harness.js`, `nesting_test.js`, `rel_filter_test.js` draaien in Node | Beschrijven: Node-harness, `npm run typecheck`, en wat alleen in Archi te testen is |
| "Test Scripts (`_test/`) use `load()`" | `_test/` is gitignored; dode instructie | Verwijderen |
| "Target ≤ 30 lines" | Norm zonder controle; wordt in de grote modules niet gehaald | Richtlijn noemen, niet als regel |
| "Validate at boundaries only; trust internal code" | Goed; typecontrole maakt "trust internal code" nu controleerbaar | Behouden, met verwijzing naar typecheck |
| Repo Structure "_lib: vendored libraries" | Onjuist (die staan in `Scripts/node_modules/`) | Corrigeren |

De bestemming per onderdeel staat in "Doelindeling" hierboven. jArchi-regels #1, #3–#5 en #7 gaan naar de valkuilen in `SKILL.md`; #2 en #6 na aanpassing ook. Het bestand `jarchi-script-development.md` vervalt.

### Omvang van de wijziging (schatting)

Scope: 7.035 regels, 261 benoemde functies (187 `function`, 74 arrow-consts), 109 bestaande `@param`-regels, 58 `{Object}`-annotaties.
- JSDoc op ±180 nog niet of deels geannoteerde functies, 2–5 regels elk: **+500–800 regels**.
- `typeof import`-regels boven `require`: **±35 regels**.
- ±319 inline callbacks: meestal geen annotatie nodig, want het type volgt uit de context zodra arrays/collecties getypeerd zijn.
- Typedefs in `types/` (buiten `Scripts/`, niet gedistribueerd): jarchi ±200, view ±150, layout ±60, runtime ±40 → **±450 regels**.
- Totaal in de `.js`: **±+10–13%**. Er verandert geen uitvoerbare regel, behalve de B6-fix.

## Beslispunten

Vastgesteld met de gebruiker: B1, B2, B3, B8. Overige volgens aanbeveling.

- **B1 Scope** — `Scripts/View/lib/**` zonder `gui/`, plus `_lib/Common.js` en `_lib/archi_folders.js` (13 bestanden, ±7.000 regels). Buiten scope: `.ajs` (F2), `View/lib/gui/` (SWT via `Java.type`), `View/tools/` (Node-runtime), overige mappen.
- **B2 Levering tsc** — (zie "Conventie No npm" hierboven) root-`package.json` met alleen `devDependencies: { typescript: <exact> }` + `package-lock.json`, `npm run typecheck`; `.gitignore`: `!/package.json`, `!/package-lock.json`, `/node_modules/`. Afwijking van "No npm" documenteren: alleen ontwikkelgereedschap, raakt runtime/distributie niet.
- **B3 Strengheid** — **direct `strict: true`**. Gemeten in scope: **1089 meldingen** (zonder globals): TS7006 545 (parameter impliciet `any`), TS2339 213 (grotendeels bestaande JSDoc `{Object}` zonder velden), TS7053 147 (indexeren met `string`), TS7005/7034/7008 134 (impliciete `any`-variabelen/velden), rest <30. Per bestand: elk 251, selection_pipeline 245, generate_view 109, engine-utils 82, rel_filter 81, graphviz 79, appearance 77, defs 71, dagre 51, Common 24, preset_io 8, run_preset 7, archi_folders 4. Opgelost met JSDoc (`@param`, `@typedef`, `@type`-casts) — geen codewijzigingen; `// @ts-expect-error <reden>` alleen bij aantoonbare checkerbeperking en geteld in het rapport. Typings (stap 3) en cross-module imports (stap 4) leggen extra meldingen bloot.
- **Migratievolgorde (gevolg van B3)** — bottom-up, zodat `npm run typecheck` na elke commit groen is: `jsconfig.include` groeit per gemigreerd bestand, en een module krijgt `typeof import`-annotaties alleen naar al gemigreerde modules (een geïmporteerd bestand wordt anders mee gecontroleerd). Volgorde: `defs` → `Common` → `archi_folders` → `engine-utils` → `rel_filter` → `dagre` → `graphviz` → `elk` → `selection_pipeline` → `appearance` → `preset_io` → `generate_view` → `run_preset`. Eén commit per module.
- **B4 Typings** — **zelf schrijven** in `types/jarchi.d.ts` (alleen in scope gebruikte API) en `types/runtime.d.ts` (globals `$`, `model`, `selection`, `__DIR__`, `__FILE__`, `Java`, `console`, `require`/`module`). Elk lid krijgt `@since`; niet in de runtime geverifieerde leden krijgen `@remarks unverified`. Geen `any` behalve `Java.type()`-resultaat.
- **B5 Data-contracten** — **`types/layout.d.ts` met `LayoutGraph`/`LayoutResult`** (SPEC §8) en daarmee de adapters `layout()` annoteren; dit borgt harde regels 1–3 statisch.
- **B6 Echte fouten in code oplossen** — De vroege return in `selection_pipeline.js:72` krijgt `visuals: []` en `visualRelations` in dezelfde vorm als de normale return (`:178`), via één gedeelde `@typedef` voor het resultaat. Dat verandert het gedrag niet: de aanroeper stopt nu al op `existingView === null`. Het herstelt wel het contract voor toekomstige aanroepers. Andere echte fouten: dezelfde aanpak, elk in een eigen commit en in het rapport. De ongeldige JSDoc in `archi_folders.js:14` wordt hersteld.
- **B9 Geen casts waar het anders kan** — Een JSDoc-cast `/** @type {X} */ (expr)` is een *type-assertie*: alleen commentaar, geen runtime-conversie. Het risico is dat hij de checker ongecontroleerd overrulet. Voorkeursvolgorde: (1) de **declaratie** annoteren (`/** @type {[Fn, Fn, "x"|"y"][]} */ const JOG_AXES = …`; checker controleert de waarde), (2) een `@typedef`/`@param`/`@returns`, (3) alleen als er geen declaratie is: een cast, met een regel uitleg. `@ts-expect-error` alleen bij een aantoonbare checkerbeperking. Casts en `@ts-expect-error` worden geteld in het rapport. Waar (1) een inline literal naar een const zou moeten verplaatsen (bv. `elk.js:1031`), is dat een gedragsneutrale refactor; die wordt apart vermeld.
- **B7 CI** — **niet toevoegen**: er is geen CI-infrastructuur. Vermelden als vervolgstap.
- **B8 Claude Code** — harde regel in `ai/rules.md` ("na wijziging in een bestand binnen de typecheck-scope: `npm run typecheck`, exit 0"). Geen hook.

## Implementatiestappen (elk afzonderlijk te committen)

1. **Gereedschap** — `package.json` (root, `private: true`, script `typecheck: "tsc -p jsconfig.json"`), lockfile, `.gitignore`-uitzonderingen, `jsconfig.json` (root):
   `allowJs, checkJs, noEmit, strict:true, target ES2022, module commonjs, lib ["ES2023"], types []`, `include`: `types/**/*.d.ts` + de reeds gemigreerde bestanden (groeit per stap 6). Geen `dom`-lib (GraalJS heeft geen DOM).
2. **Runtime-globals** — `types/runtime.d.ts`; doel: meldingen TS2304/2584/2592 (globals) naar 0.
3. **jArchi-typings** — `ai/jarchi-scripting/jarchi.d.ts` (B-D1; deze stap alleen het deel dat in scope wordt gebruikt, plus de runtime-globals uit stap 2): `ArchiCollection<T>` (`each`, `filter(selector|fn)`, `find` = descendants, `children`, `parent(s)`, `rels/inRels/outRels`, `ends`, `first`, `get`, `size`, `is`, `not`, `add`, `clone`, `attr`, `prop`, `delete`), `ArchiConcept`, `ArchiElement`, `ArchiRelation`, `ArchimateView`, `VisualObject`, `VisualConnection`, `Folder`, `Model`, `Bounds`. Volgorde: grep in scope welke leden echt gebruikt worden; alleen die opnemen.
4. **Cross-module typing** — boven elke `require(REPO_ROOT + …)` in scope `/** @type {typeof import("<relatief pad>")} */`. Voorbeeld: `Scripts/View/lib/generate_view.js:21-30`. Destructurerende requires idem.
5. **Contracten** — `types/layout.d.ts`; JSDoc op `_buildLayoutGraph` (`generate_view.js`) en `layout()` in `engines/elk.js`, `dagre.js`, `graphviz.js`.
6. **Migratie per module (strict)** — in de volgorde uit B3: bestand toevoegen aan `include`, `typeof import`-annotaties (stap 4) voor dat bestand, JSDoc aanvullen tot 0 meldingen, `view_harness` draaien, commit. Gedeelde vormen (preset, params, rule, occurrence, stepCounts) als `@typedef` in `types/view.d.ts`, namen volgens SPEC § Vocabulary (harde regel 11). Elke melding die geen checkerbeperking of ontbrekende annotatie is, wordt in het rapport geclassificeerd (echte fout / typing / beperking / runtime).
7. **Runtime-verificatie** — `Scripts/Develop/probeCollectionApi.ajs` (gecommit, niet in het gitignored `_test/`): logt in Archi op de testview (coArchi `.git/temp.archimate`, Views/Test) het gedrag van `.each()` (callback-args, `return false`), `.filter(fn)`, `.find()` vs `.children()`, `.first()` op lege collectie, `for…of`/`.map` op collectie, `prop()` zonder sleutel, `bounds`, `typeof el.type` (Java- of JS-string), en of `require("./x")` vanuit een module relatief aan die module oplost. Resultaat terug in `@remarks` van de typings (unverified → verified). **Vereist jouw uitvoering in Archi.**
8. **Documentatie** — `types/README.md` (installatie, gebruik, scope, beperkingen, typings uitbreiden, wat `unverified` betekent); harde regel + bronverwijzing in `ai/rules.md`; afgebakende "No npm at runtime"-regel.
8b. **Spoor B, in commits**: (i) dode/foute regels herstellen (fouten 1–3, direct); (ii) `swt-gtk.md` + `ai/dialog-style.md` uit `SKILL.md` halen; (iii) `graaljs-java.md` samenvoegen en inkorten; (iv) `jarchi.d.ts` aanvullen tot volledige API, daarna `jarchi-api-reference.md` verwijderen; (v) `jarchi-script-development.md` verdelen over `ai/rules.md`, `ai/repo-guide.md` en de engine-skills, daarna verwijderen; (vi) `SKILL.md` herschrijven (valkuilen + routering), description inkorten, adapters in `.claude/skills/` gelijk houden. De regels over Java-strings en relatieve `require` pas definitief maken nadat de probe (stap 7) is uitgevoerd. Na elke stap: grep op verwijzingen naar verwijderde bestanden (`ai/`, `.claude/`, `.cursor/`, `.github/copilot/`, `Scripts/**/CLAUDE.md`) → 0 treffers. Herschikte content mag niet verloren gaan: per verwijderd bestand een controlelijst kop → bestemming.
9. **Rapport** — gecontroleerde scripts en API's, gevonden fouten, onzekere API's, onderhoudslast, wat nog Archi vereist.

## Verificatie

- **Draaien na clone**: verse `git clone` zonder `npm install` → `View/_generate.ajs` draait in Archi op de testview (scripts-map wijst naar de clone).
- `npm ci && npm run typecheck` op schone checkout → exit 0.
- `git status` na typecheck leeg (noEmit, geen gegenereerde bestanden).
- Negatieve test: tijdelijk een fout aanroepen (bijv. `Defs.validatePreset()` met verkeerd type / onbekend lid) → tsc meldt het; daarna terugdraaien.
- Gedragsneutraliteit: `node Scripts/View/tools/view_harness.js` op de testview vóór en ná, uitvoer gelijk. `git diff` in scope bevat alleen commentaar, de B6-fixes en eventuele vermelde B9-refactors.
- Probe-script in Archi uitvoeren (stap 7) en uitkomst vastleggen.
- Commits: kleine stappen, geen co-author en geen AI-vermelding (harde regel 13).
