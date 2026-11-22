# View: background view als tabel

## Context

Doel: GEMMA-views genereren op lege backgrounds, zodat elke view voorspelbaar is en dient als landkaart waarop je iets terugvindt. De kaart pas je op twee manieren aan: de background (de locaties) en het model (wat in de locaties staat).

Waargenomen in `gemma-archi-repository/.git/temp.archimate`, view "Sociaal domein" (id-a562be06…) op "Background Applicatieservices" (id-e3defc7d…):
- De background is een tabel: zes table rows × table columns inwoners / gemeente / ketenpartners, Gedeelde generieke applicatieservices over table column 1–3, rechts een table column Applicatieontwikkeling / Privacy.
- De gegenereerde view houdt de rijen, maar elke rij krijgt eigen breedtes: inwoners 330 of 645, gemeente 300, 945 of 1260. De recursieve cut van nu (`lib/arrangement.js`: eerst verticaal knippen, dan horizontaal, per deel opnieuw) legt niet vast dat de kolommen van rij 1 die van rij 2 zijn.
- Applicatieontwikkeling / Privacy staan op x=1010, y=74, tussen de rijen, in plaats van rechts van alles.

Gewenst: op een background wordt de view, en elke container van de view die een tabel krijgt, als tabel ingedeeld. Cellen kunnen een cell span hebben in beide richtingen. Groeit een cel, dan groeien zijn table row en table column mee. Tussen cellen is de ruimte altijd gelijk (Distance); in een cel mag witruimte ontstaan.

Afgewezen in `plan/view-herkenbare-achtergrond-bedrijfsfunctielagen.md` was een grid uit coördinaten met tolerantie. Dit plan neemt geen maten of posities over: gridlines volgen alleen uit overlap, het model bepaalt de inhoud.

## Besluiten (gebruiker, 2026-11-21)

- Tabel met cell spans over table rows en table columns (CSS-Grid-achtig); één tabel per container, cellen altijd op één niveau. Subgrid over niveaus: niet nu.
- Elke gridline uit overlap telt, ook als de row borders van twee table columns in elkaar grijpen. Groei verdeelt zich dan over de cellen van de andere table column. Ontkoppelen kan door de background aan te passen.
- Ruimte die een cel met een cell span nodig heeft: gelijk verdeeld over de table rows of columns die hij beslaat (CSS Grid).
- Een cel die breder wordt, wordt opnieuw gepackt; witruimte valt onderin, zoals tekst in een tabelcel vloeit. Een tabel in zo'n cel rekt mee: zijn table columns verdelen de extra breedte gelijk, tot in de diepste tabel.
- Een diagram-block houdt zijn maat in zijn cel.
- Tabeltermen volgen de gangbare tabelterminologie (§ Terminologie). `arrangement` heet voortaan `table`, overal (rule 3, één commit). De interne DP-`Table` in `tiles.js` wordt `Floorplan`.
- Elke regel bestaat één keer, op de meest specifieke plek waar hij nodig is: dit wordt een algemene werkafspraak (alle projecten).
- SPEC wordt getrapt: regels altijd lezen, de nadere specificatie pas wanneer het onderwerp speelt. Dat wordt een apart plan (zie Vervolg). Regel 1 landt waar dat plan de regels zet.

## Terminologie (SPEC § Vocabulary, Background)

| Term | NL | Betekenis | Status |
|---|---|---|---|
| table | tabel | indeling van de view of van een container van de view, afgeleid uit de background; geen maten | vervangt *arrangement* |
| table row / table column | tabelrij / tabelkolom | horizontale / verticale groep cellen. Het voorvoegsel *table* blijft, want *row* en *column* zijn al de rij en kolom van elementen | nieuw |
| cell | cel | plaats van één container, leaf of diagram-block in de tabel, met alles wat erin ligt | nieuw |
| cell span | celspan | een cel die over meer table rows of table columns loopt | nieuw |
| gridline | rasterlijn | lijn die table rows of table columns scheidt: een **row border** (horizontaal) of **column border** (verticaal) | vervangt *line* / cut |
| border | rand | buitenrand van de tabel (de binnenrand van zijn container) of van een cel (de rand van wat erin ligt) | nieuw |
| alignment | uitlijning | inhoud van een cel staat bovenaan en vult de breedte (opnieuw gepackt); een diagram-block staat linksboven | nieuw |
| stack | stapel | containers, leafs of diagram objects die elkaar overlappen: samen één cel, in leesvolgorde | bestaat |
| column / row | kolom / rij | kolom en rij van elementen (Tiles, Columns across containers); een cel heeft er 1 of meer | bestaat |
| Distance | — | ruimte tussen cellen (in tabeltermen: margin) | bestaat |
| padding | — | ruimte tussen de rand van een container en zijn inhoud; in een cel met een container is dat de cell padding | bestaat |
| band | — | wordt: een cel met een cell span over alle table columns | vervalt |

Niet gebruikt: header, header row, header cell, body, footer, caption en divider. De tabel heeft geen kopjes of secties; het label van een container blijft *label*.

## Wanneer een tabel

Alleen met een background view: Tiles, met een background view en een nesting condition, zoals nu.
- De view zelf, en elke container van de background view die een background container bevat, krijgt de tabel uit de background.
- Met *Leaves in place* krijgt elke container van de background view een tabel.
- Elke andere container, en elke view zonder background, wordt door Tiles vrij getegeld, zoals nu.
- Er komt geen nieuwe optie bij.

## Tabel afleiden uit de background

Per container van de background view (of de view zelf), over de containers, leafs en diagram objects die er direct in liggen:
1. **Wat telt.** Elke container, elke leaf en elk diagram object. Een diagram-block (een diagram object met objecten die in Archi erin genest zijn) telt als één. Diagram objects die alleen over iets heen liggen, zonder nesting, tellen apart.
2. **Cel en stapel.** Elk ervan is een cel. Wat elkaar overlapt, deelt één cel als stapel, in leesvolgorde.
3. **Borders.** Twee cellen naast elkaar (ze overlappen in hoogte, er ligt niets tussen) hebben een column border in de lege ruimte ertussen. Twee cellen boven elkaar (ze overlappen in breedte, er ligt niets tussen) hebben een row border in de lege ruimte ertussen.
4. **Gridlines.** Borders waarvan de lege ruimte overlapt, ook als ze uit verschillende delen van de tabel komen, zijn één gridline. Elke gridline loopt door de hele tabel. De binnenrand van de container is de border van de tabel.
5. **Table rows en table columns.** De ruimte tussen opeenvolgende gridlines, genummerd van links naar rechts en van boven naar onder.
6. **Cell span.** Een cel begint en eindigt op de gridline aan zijn rand. Ligt er niets achter een rand, dan eindigt de cel op de border van de tabel. Een cel die over de lege ruimte van een gridline heen loopt, heeft een cell span over die gridline.

Een rand die een paar pixels mis is, geeft hoogstens een extra dunne table row of table column. De buren hebben daar een cell span over, dus hij kost niets.

Deze regels komen expliciet in `docs/reference/selection-nesting.md` § Background view (stap 10).

**Toegepast (alle uitkomsten volgen uit regel 1–6):**
- **AS-background, Informatiearchitectuur:**
  - 4 table columns: inwoners, gemeente, ketenpartners, rechts.
  - Table rows: Bestuur … Ondersteuning. Generieke is in twee gedeeld door de row border tussen Applicatieontwikkeling en Privacy. Daaronder Gedeelde.
  - Cell spans: Applicatieontwikkeling rij 1–7, Privacy rij 8–9, de Generieke-cellen rij 7–8, Gedeelde kolom 1–3.
- **RC-background "Background alle referentiecomponenten" (id-56a7581f…), view-niveau:** 2 table columns, 7 table rows; de row borders links en rechts grijpen in elkaar.

  | Cel | Table column | Table rows |
  |---|---|---|
  | Besturende functies | 1 | 1 |
  | Primaire functies | 1 | 2–4 |
  | Ondersteunende functies | 1 | 5–6 |
  | group GEMMA referentiecomponenten (diagram-block: 3 notes) | 2 | 1–2 |
  | group Verzamelcomponent (diagram-block: note + Verzamelcomponent) | 2 | 3 |
  | Informatiearchitectuur | 2 | 4–5 |
  | Infrastructurele applicatieservices | 2 | 6 |
  | Buitengemeentelijke voorzieningen | 1–2 | 7 |

  - Informatiearchitectuur heeft daar dezelfde opbouw als in de AS-background: Applicatieontwikkeling rij 1, Privacy rij 2–3, Generieke-cellen rij 1–2, Gedeelde kolom 1–3 rij 3.
  - Buitengemeentelijke voorzieningen: Sectorale (k1 r1), VNG (k1 r2), GDI (k2 r1–2).
  - Infrastructurele applicatieservices houdt alleen leafs, dus krijgt hij geen tabel.
- **BF-background "Background bedrijfsfunctiemodel uitvoering":** bovenaan 3 table rows; Primaire functies 5 table rows; elke cel beslaat de enige table column. Geen verschil met nu.
- **Testbackground "8 GEMMA background":** Bedrijfsfunctiemodel heeft 1 table row met 3 cellen. Sturing en Ondersteuning worden even hoog als Uitvoering.

**RC-background, legenda's (aangepast door de gebruiker, 2026-11-21).** Eerst lagen de notes los over elkaar heen, en dat zou een stapel geven die onder elkaar wordt gezet. Nu zijn het twee diagram groups waarin de notes en de Verzamelcomponent in Archi genest zijn. Elke group is daardoor één diagram-block en dus één cel met vaste maat (regel 1). De table rows blijven hetzelfde: de group GEMMA referentiecomponenten (y −257…42) loopt over de row border tussen Besturende en Primaire functies (−11…0) heen. Gecontroleerd in `temp.archimate` van 09:32.

## Maten: hoe de tabel zijn beste vorm zoekt

Tiles blijft één algoritme dat de hele view in één keer van binnen naar buiten opbouwt. Er zijn geen geneste algoritmen. *Layout inside* geldt niet voor Tiles. *Columns across containers* is een stap binnen Tiles, na het plaatsen, geen eigen algoritme.

Elke container krijgt in Tiles een lijst vormen (breedte, hoogte), van smal-en-hoog tot breed-en-laag. De ouder kiest er één uit. Een tabel bouwt zijn lijst zo:
1. **Breedte stuurt, hoogte volgt** (zoals tekst in een tabel). Bij gegeven breedtes van de table columns is elke cel zo breed als de table columns die hij beslaat, plus de Distance ertussen. De cel kiest uit zijn eigen lijst de laagste vorm die past; dat is het opnieuw packen. De hoogte van een table row is het maximum van zijn cellen. Een cel met een cell span over table rows verdeelt zijn tekort gelijk, cellen met de kleinste span eerst (CSS Grid). Elke cel vult zijn hoogte; zijn inhoud staat bovenaan (alignment).
2. **Begin smal.** Elke table column is zo breed als zijn smalste cel toelaat. Een cel met een cell span over table columns verdeelt zijn tekort gelijk.
3. **Verbreed stap voor stap.** Verbreed telkens één table column tot de volgende vorm van een cel erin. Kies de table column die de witruimte (tabeloppervlak min inhoud) het meest verkleint per pixel extra breedte. Elke stap levert een vorm van de tabel. Stop als geen cel breder kan.
4. **De lijst.** Die vormen, zonder de vormen die een andere vorm in breedte én hoogte verslaat, zijn de lijst van de container. De ouder kiest, en de view kiest zoals nu (Max width, Aspect ratio).
5. **Van buiten naar binnen.** Krijgt een cel meer breedte dan zijn vorm vraagt (een andere cel maakt de table column breder), dan rekt zijn tabel mee: de extra breedte gaat gelijk over zijn table columns en de cellen daarin worden opnieuw gepackt. Een diagram-block houdt zijn maat.
6. **Columns across containers** legt daarna de elementkolommen van de hele view op één raster. Cellen die op één column border eindigen, delen die op het raster, zodat de tabel recht blijft. Het raster verschuift alleen x en breedtes; hoogtes blijven.

Dit vervangt de vaste knippen van nu. Die cut en het DP-zoeken erover (`arrangedTable`) vallen weg; Tiles zoekt vrij zoals nu voor containers zonder tabel.

## Regel 1, nieuw

Op zijn eindplek: `Scripts/View/AGENTS.md` § Hard rules, regel 1 (`plan/view-regels-op-een-plek.md`). Het Graphviz-feit ("`size=` is forbidden") gaat naar `docs/reference/engines.md` § Graphviz.

> 1. **No scaling**: a leaf keeps its size and the engine sizes the containers; no size is multiplied to reach a view size or aspect ratio. (Foundational.) A leaf grows only to fill a place the layout gives it: a width (*Same width*), a column (*Columns across containers*) or a cell (the table of a background view).

## Uitvoering

Volgorde: AGENTS § Order of change: code eerst, docs pas na goedkeuring van het resultaat.

0. **Werkafspraak** in `~/ai/shared/AGENTS.md` § Working agreements: "Each rule exists once, at the most specific place where it is needed; elsewhere link to it."
1. **Tabel afleiden** — `Scripts/View/lib/arrangement.js` → `lib/table.js`:
   - `tableOf(boxes)` past regel 1–6 toe en geeft `{ columns, rows, cells: [{ ids, column, columnSpan, row, rowSpan }] }`;
   - verder `tablesOf`, `tablesWithContainers`, `elementsOf`, `idsOf` en `describe` (log, één regel per tabel);
   - de recursieve cut (`arrangementOf`, `_bands`) vervalt.
2. **Hernoemen** (rule 3, alles in deze commit):
   - `graph.arrangements` → `graph.tables` en elke aanroeper: `selection_read.readBackground`, `selection_pipeline`, `generate_view` (`plan`, `_checkArrangements`), `layout_graph`, `node_layout`, `background.js`, `defs.js`;
   - logteksten en tests;
   - in `tiles.js` typedef `Table` → `Floorplan`.
3. **Tiles** — `lib/engines/tiles.js`:
   - `arrangedTable` → `tableShapes`: § Maten stap 1–4;
   - de rekenkern (`trackSizes`: gelijke verdeling over cell spans) als pure functie in `engine-utils.js`;
   - `placeTile` zet cellen op hun plaats in de tabel en doet stap 5;
   - `fillBands`, `Band` en `_newBand` vervallen.
4. **Raster** — `lib/engines/engine-utils.js` `alignColumnsAcrossContainers`: parameter `stretch` → groepen per column border (§ Maten stap 6).
5. **Tests** (Node):
   - `tools/arrangement_test.js` → `tools/table_test.js`:
     - de vier backgrounds hierboven, met de cellen en cell spans uit § Toegepast;
     - een pinwheel (niet in knippen te delen);
     - overlap geeft een stapel;
     - een rand een paar pixels mis geeft een extra dunne table row;
     - een diagram-block telt als één.
   - `tools/tiles_test.js`:
     - gelijke verdeling over cell spans;
     - de vormlijst loopt van smal naar breed, zonder vorm die een andere in beide maten verslaat;
     - opnieuw packen bij breder, met witruimte onderin;
     - een geneste tabel rekt mee;
     - een diagram-block houdt zijn maat;
     - gelijke Distance tussen cellen;
     - cellen in één table column even breed, in één table row even hoog.
   - `tools/background_test.js` en `rules_test.js`: nieuwe namen.
6. `npm run typecheck` exit 0.
7. **Layout in Node** (skill `view-testing`):
   - "Sociaal domein" met preset *Applicatieservices met referentiecomponenten background*:
     - de inwoners-cellen zijn alle even breed (2 elementkolommen), de gemeente-cellen ook;
     - Applicatieontwikkeling / Privacy staan rechts van alles;
     - de cellen van één table row zijn even hoog.
   - Een view op de RC-background: cellen zoals in § Toegepast, en Buitengemeentelijke voorzieningen vult met zijn tabel de volle breedte.
   - Een BF-domeinview met *Bedrijfsfunctiemodel met referentiecomponenten background*: dezelfde geometrie als nu.
8. **Baseline** (skill `view-baseline`): verwacht verschil alleen bij "Bedrijfsfuncties background Tiles"; de rest blijft gelijk. Elk ander verschil is een fout.
9. **Gebruiker in Archi:** Sociaal domein opnieuw genereren, plus een RC-view en een BF-view; beoordelen.
10. **Docs na goedkeuring**, met de code in één commit:
    - SPEC § 2 Vocabulary (§ Terminologie), § 7 Background (§ Wanneer een tabel);
    - `docs/reference/selection-nesting.md` § Background view: afleidingsregels 1–6 en de voorbeelden; § Sizing refinements: de maatregels uit § Maten, expliciet en genummerd zoals de afleidingsregels (breedte stuurt, begin smal, verbreed stap voor stap, de lijst, van buiten naar binnen, Columns across containers), elk met een voorbeeld uit Sociaal domein;
    - ARCHITECTURE § Background view en de Tiles-sectie: besluiten, met waarom (gridlines uit overlap, breedte stuurt, gelijke verdeling, geen subgrid) en de realisatie;
    - `Scripts/View/AGENTS.md` § Hard rules regel 1 (§ Regel 1); `docs/reference/engines.md` § Graphviz krijgt het feit over `size=`;
    - `node Scripts/View/tools/gen_docs_tables.js --write`.

## Uitvoering per model

De sessie begint op Opus 5.5. Binnen een blok gaan de stappen door zonder vragen. Tussen blokken vraag ik één stap aan jou (een modelwissel of een run in Archi), wacht op "done" en ga in dezelfde sessie verder.

| Blok | Model | Stappen | Waarom dit model | Einde blok |
|---|---|---|---|---|
| 1 | Sonnet 5.5 | 0, 2 (hernoemen), 6; Node-tests groen; commit | Mechanisch, breed en goed te controleren met typecheck en tests | Prompt: "Typ `/model opus`, dan done" |
| 2 | Opus 5.5 | 1, 3, 4, 5, 6, 7; commit (code, zonder docs: Order of change) | Algoritmisch: afleiding, vormzoeken, raster; hier zit het risico | Ik draai de baseline zelf (skill `view-baseline`)|
| — | ik, dan jij | 8 (ik draai de baseline zelf via `archi_cli.sh` en vergelijk), 9 (jij beoordeelt Sociaal domein, RC- en BF-view in Archi) | Beoordelen kan alleen in Archi | "Beoordeel de drie views, dan akkoord" |
| 3 | Opus 5.5 | Vervolg: plan getrapte SPEC (ontwerp, jouw keuze voor de plek van de regels) | Structuurkeuze over de hele docs-set | Prompt: "Typ `/model sonnet`, dan done" |
| 4 | Sonnet 5.5 | `plan/view-regels-op-een-plek.md` § Uitvoering (eigen commit); dan 10 (docs na akkoord, met de code in één commit); `gen_docs_tables.js --write` | Schrijfwerk naar vaste regels (AGENTS § Writing SPEC) | Klaar |

De eerste prompt na goedkeuring van dit plan: "Typ `/model sonnet`, dan done". Een nieuwe sessie is niet nodig: het plan bevat de context.

## Risico's

- Stap 3 van § Maten is gulzig: hij vindt goede vormen, niet gegarandeerd de best mogelijke. Dat is aanvaardbaar, want de background bepaalt de plaatsen; alleen de maten worden gezocht. De tests in stap 5 leggen de uitkomst voor de vier backgrounds vast.
- Columns across containers loopt na het plaatsen en verschuift x. Zonder de groepen per column border lopen cellen weer uit elkaar. Getest in stap 5 en 7.
- Eén hoge cel maakt zijn hele table row hoog (de Sociaal-domein-rij 1345). Dat is bewust: de kaart gaat voor compactheid.

## Vervolg: regels op één plek

Uitgewerkt in `plan/view-regels-op-een-plek.md` (blok 3, besluiten 2026-11-22): de regels komen in `Scripts/View/AGENTS.md` § Hard rules.

## Verificatie

Stap 5–9. Klaar wanneer:
- tests en typecheck groen zijn;
- de Node-layouts de verwachtingen van stap 7 halen;
- de baseline alleen het verwachte verschil geeft;
- de gebruiker de drie views in Archi goedkeurt.

## Overdracht (2026-11-22)

**Klaar:** blok 1 (`653c717`), blok 2 (`24e4e6c`), blok 3 (`plan/view-regels-op-een-plek.md`), daarna: kleur volgt overgenomen fill (`38664b3`), hoogte leaf-cel op getekende breedte (`7f6fb95`), blok vult zijn kolom (`01e1296`). RC-background (test case 33): code in de werkmap, niet gecommit (`layout_graph.js`, `selection_pipeline.js`, `table.js`, `engines/tiles.js`, `engines/engine-utils.js`, `types/layout.d.ts`, `tools/tiles_test.js`, `docs/test-cases.md`). Gebruiker akkoord op BF-, AS- en RC-view in Archi. Typecheck, Node-tests, `layout_checks`, fingerprints groen; Archi-baseline niet opnieuw gedraaid na test case 33.

**Afwijkingen van dit plan die de docs moeten vastleggen (blok 4):**
- Afleiding: diagonale cellen (geen overlap in beide richtingen) krijgen een rij- én kolomgrens als er niets tussen ligt.
- Maten: geen DP over knippen; twee verbreedpaden (goedkoopste stap, meeste hoogtewinst per pixel), samen Pareto-gesnoeid.
- Raster: cellen aan de buitenrand van een tabel reiken tot de rand van hun container; cellen in disjuncte tabelkolommen delen geen spoor.
- Leaf-cel: hoogte opnieuw uit het label op de getekende breedte (`_layoutFittingLeafCells`, ≤ 3 runs; ondergrens elementhoogte).
- Blok (*Per level and type*) vult zijn spoor; inhoud van een blok van één kolom gecentreerd. Vervangt "een blok houdt zijn breedte, gecentreerd".
- Keep appearance: onder een overgenomen fill volgt een child van hetzelfde type die fill, één stap lichter, ongeacht de conditiekleur.
- `layout_checks.js`: een leaf in een tabelcel mag groeien tot zijn cel.
- BF-view is 60 px smaller dan voorheen (artefact van de oude band-padding weg); hoogtes gelijk.
- Tooltip `backgroundView` in `defs.js` zegt nog "arrangement".
- Celspan over tabelrijen: niet meer gelijk verdeeld (CSS Grid). De cellen gaan op volgorde van hun laatste tabelrij; wat een cel tekortkomt gaat in die rij, zodat de tabel zo laag is als zijn cellen toelaten (§ Maten stap 1 en § Besluiten). AS-Sociaal domein: rand Applicatieontwikkeling/Privacy verschoven, maat gelijk (test case 33).
- Diagram object van de background: ligt in het element waarin het daar ligt; op het raster zet het geen spoorbreedte, maar spant de sporen van zijn cel (anders die van zijn ouder als er niets naast staat) en verbreedt alleen het laatste als ze te smal zijn. Een blok met inhoud houdt zijn breedte als minimum. Expand view en Layout only koppelen de diagram objects van de view aan die van de background op inhoud (type, naam, tekst, maat; een diagram-block ook zijn inhoud) (test case 33).

**Volgende:**
1. Blok 4 (Sonnet): eerst `plan/view-regels-op-een-plek.md` § Uitvoering (eigen commit); dan stap 10 met de afwijkingen hierboven; docs en de code van test case 33 in één commit (AGENTS § Order of change, stap 5). Daarvoor draai ik zelf de Archi-baseline (skill `view-baseline`, `archi_cli.sh`).
2. Besloten (2026-11-22): preset *Alle referentiecomponenten background* houdt *Leaves in place* uit (compacter, 11328 × 8769 px; aan kost 7 %) en nest serving. Geen werk meer open.
