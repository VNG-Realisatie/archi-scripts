# Eenduidig regelfilter voor de View-dialoog

## 1. Context

De View-dialoog kiest element- en relatietypes op zeven plekken, elk met een eigen widget en eigen semantiek:

| Plek | Nu |
|---|---|
| Selection, globaal | elementtypes (chips), relatietypes (vinkjes, zonder richting), diagramtypes (vinkjes) |
| Selection, stappen | relatietypes met ←/→-vakjes, toegevoegde elementtypes (chips), één property-filter |
| Layout, Relations | nestingtypes, containertypes (combo + chips), reverse-types |
| Appearance | Style by property (element, relation), Style by related property, Style by connected element |

De matchlogica staat drie keer in de code (`_matchesRelationType` en `_matchesRelationTypeDir` in `lib/selection_pipeline.js`, `_matchesRelDir` in `lib/appearance.js`), plus een inline kopie in `_updateFilteredCount` (`lib/gui/dialog_main.js:719`). "Leeg" betekent bij Style by related property "niets doen" en elders "alles". Het globale relatiefilter heeft in de code geen richting, hoewel ARCHITECTURE.md dat beweert.

## 2. Doel

Eén regelvorm die overal hetzelfde werkt, als tabel. Een regel selecteert op **brontype, relatietype en doeltype**, met include of exclude. Richting bestaat alleen waar er een uitgangsverzameling is: de vorige stap bij het uitbreiden van de selectie. Appearance krijgt daarnaast per regel een property en een kleurbereik, zodat meerdere stijlen naast elkaar kunnen.

Het moet **flexibeler en gebruiksvriendelijker** worden. Die twee wensen trekken tegen elkaar: flexibiliteit betekent meer kolommen, meer regels en meer begrippen; gebruiksgemak betekent weinig kolommen, voor de hand liggende standaardwaarden en één begrip per ding.

### Analyse van de spanningen

Gebruik in de bestaande presets (48 presets, 62 stappen) bepaalt waar flexibiliteit zijn plek krijgt:

| Spanning | Wat de data zegt | Advies |
|---|---|---|
| Eén regelvorm overal ↔ per plek passend | 6 stappen mengen richtingen per relatietype. Source/Target past niet bij "vanuit de vorige stap". | Twee presentaties van één model: Source/Relation/Target overal, perspectief (Previous step / Added) alleen bij stappen. Dat is de kleinste afwijking die klopt. |
| Eén type per veld ↔ meerdere | 41 van 62 stappen worden 1 regel; 10 stappen worden 7 tot 18 regels. | Eén type per veld houdt elke cel leesbaar. De prijs zit bij een paar grote stappen (zie 3.6). Meerdere types per veld blijft een latere optie. |
| Veel kolommen ↔ overzicht | Het property-filter wordt in 1 van 62 stappen gebruikt. | De drie property-kolommen zijn zeldzaam maar kosten veel breedte. Besluit: ze zijn verborgen tenzij een regel ze gebruikt of de gebruiker het vinkje "Property condition" onder de tabel aanzet (kolomtoggle, geen uitklapregel). Een gewone stap is dan zes kolommen breed. |
| Include/Exclude ↔ eenvoud | Geen enkele preset gebruikt iets als exclude; het is nieuw. | Default Include, zodat de gebruiker Exclude alleen ziet als hij het zoekt. De kolom blijft vanwege de kracht ("alles behalve"). |
| Eén Appearance-tabel ↔ drie herkenbare secties | 2 van 48 presets gebruiken Style by property of related/connected. | De tabel is flexibeler; de drie secties waren duidelijker. Besluit: maak de tabel zelfverklarend met volledige labels ("Element (own property)", "Relation", "Source element", "Target element") en een tooltip per kolom; zie 4.4. |
| Standaardwaarden ↔ risico op verbreden | Een typefout in een bestand zou stil "All" worden. | Onbekende types in een regel: regel overslaan met melding in de console, nooit als All behandelen. |
| Direct feedback ↔ minimalisme | De teller per stap bestaat al. | Besluit: de kolommen Added relations en Added elements tonen per regel tussen haakjes hoeveel relaties en elementen de regel oplevert, bijvoorbeeld `Aggregation (12)`. Feedback helpt begrijpen wat een regel doet. |

## 3. Functioneel

### 3.1 De regel

- **Basisregel** = `Mode | Source | Relation | Target`. Eén type per veld; "All" bovenaan de lijst. Mode = Include of Exclude.
- **Resultaat** = (OR van de include-regels) min (OR van de exclude-regels). Alleen excludes betekent "alles behalve".
- **Standaard** = één regel `Include | All | All | All` = geen filter. De lijst heeft altijd minstens één regel; de laatste verwijderen herstelt de standaardregel. Uitzetten van een functie gaat via het bestaande `enabled`-vinkje, niet via een lege lijst. Daarmee betekent "leeg" overal hetzelfde.
- **Volgorde** heeft in filterlijsten geen betekenis. Kopjes zijn gewone labels; **sorteren is niet nodig** (filterlijsten zijn kort, en de migratie schrijft grote stappen gegroepeerd per relatietype). De volgorde telt alleen in de Appearance-tabel (3.5).
- **Eén matchmodule** `lib/rel_filter.js` vervangt alle kopieën en wordt ook door de teller in de dialoog gebruikt.

### 3.2 Selection: globaal filter

Drie tabellen, elk met de standaardregel:
- **Elementen**: `Mode | Element type | Property | Value`. De property is die van het element zelf. Het property-filter op de startselectie is nieuw. Property en Value zijn verborgen tenzij een regel ze gebruikt of "Property condition" aan staat.
- **Diagramtypes**: `Mode | Diagram type`. Het filtert visuele objecten uit meegegeven views en staat los van de relatieregel (`_applyDiagramFilter`, `selection_pipeline.js:421`).
- **Relaties**: `Mode | Source | Relation | Target`. Filtert de relaties tussen de geselecteerde elementen op bron-, relatie- en doeltype. Het filter heeft dus voor het eerst echt bron en doel, geen richting.

### 3.3 Selection: stappen

Een stap breidt de verzameling van de vorige stap uit. De regel is hier geschreven vanuit die verzameling (een perspectief-regel), omdat bron en doel in "Either" per oriëntatie iets anders zouden betekenen. Voorbeeld: "voeg type B toe via Serving, in beide richtingen" is hier één regel; met Source/Target zouden het twee regels zijn, en één regel `Source=All, Target=B` zou ook alles toevoegen wanneer de vorige stap type B is.

`Mode | Previous step elements | Direction | Added relations | Added elements | Property of | Property | Value`

- **Previous step elements**: welke elementen uit de vorige stap uitbreiden. Nieuw; nu is die kant onbeperkt. Default All.
- **Direction** (default Either):
  - Outgoing: de relatie begint bij een element uit de vorige stap (vorige stap → toegevoegd).
  - Incoming: de relatie eindigt daar (toegevoegd → vorige stap).
  - Either: beide.
- **Added relations** en **Added elements**: type van de gevolgde relatie en van het toegevoegde element. Vervangt "Filter added element types".
- **Property of | Property | Value** (voorheen `propFilter`): Property of = Added element (default) / Added relation / Previous step element. Alleen aanwezige property-waarden worden toegevoegd of, bij Exclude, uitgesloten.
- **Property condition**: de kolommen Property of / Property / Value zijn verborgen tenzij een regel ze gebruikt of het vinkje "Property condition" onder de tabel aan staat. Gebruikt een regel ze, dan staat het vinkje aan en vast.
- **Aantallen per regel**: de kolommen Added relations en Added elements tonen tussen haakjes hoeveel relaties en elementen de regel zelf oplevert, bijvoorbeeld `Aggregation (12)`. De getallen gelden per regel afzonderlijk en kunnen overlappen, dus de som kan boven het totaal in de stapkop liggen. Bij een Exclude-regel is het aantal wat de regel uitsluit. De tooltip legt dit uit.
- **Repeat** blijft per stap (hoe vaak de stap draait; geen filter).
- De rijen van een stap vormen samen include/exclude zoals in 3.1.
- Relaties tussen de uiteindelijke elementen worden verzameld zoals nu.

### 3.4 Layout: nesting en reverse

- Twee tabellen `On | Mode | Source | Relation | Target`. **On** zet een regel tijdelijk uit zonder hem te verwijderen.
- **Nesting**: relaties die als nesting worden getekend (kind in ouder). Containertypes vervallen als apart concept: het containertype is het Source-veld van de nestingregel. De combo Any / Grouping only / Selected types verdwijnt.
- **Reverse for layout**: relaties die tegen hun richting worden gelegd. Zelfde regel; alleen relatie-, bron- en doeltype.
- **Reverse heeft twee effecten op dezelfde relaties**, en dat staat zo in de GUI en de tooltips:
  1. *Flow*: de relatie wordt van doel naar bron gelegd, dus tegen de Direction uit de Flow-groep in (de pijlen blijven ongewijzigd).
  2. *Nesting*: staat de relatie ook in de nestinglijst, dan is het doel de ouder in plaats van de bron.
  Een hinttekst onder de reverse-tabel en de tooltips van beide tabellen noemen beide effecten.

### 3.5 Appearance: stijlregels

Eén tabel "Style by property" vervangt Style by property (element en relation), Style by related property en Style by connected element. De secties "Style by nesting level" en "Highlight repeated" blijven ongewijzigd.

`On | Color | Source | Relation | Target | Property of | Property | Range`

- **On**: zet een regel tijdelijk uit zonder hem te verwijderen. Vervangt de aanvinkvakjes per oude functie.
- **Color** = welk object de kleur krijgt:
  - **Element**: het element zelf, op een eigen property (was Style by property → elements). Alleen het type in Source geldt; Relation, Target en Property of zijn uitgegrijsd. Het element hoeft geen relatie te hebben.
  - **Relation**: de relatie zelf (was Style by property → relations).
  - **Source** of **Target**: het element aan die kant van de relatie, voor relaties die de regel matchen (was Style by related property → elements en Style by connected element → elements).
- **Property of** = van welk object de property komt: Element, Relation, Source of Target.
  - Color = Source, Property of = Relation: was Style by related property.
  - Color = Source, Property of = Target (of omgekeerd): was Style by connected element.
- **Range**: kleurbereik over de waarden die de regel vindt. Er is geen Value-kolom.
- **Line width of styled relations**: niet nieuw (was "Set line width"); geldt voor alle relaties die door een regel met Color = Relation worden gekleurd.
- **Mixed values color** (was "Multiple targets" bij Style by connected element): een signaalkleur voor een element of relatie waarvoor de property meerdere verschillende waarden oplevert, bijvoorbeeld een Application Component die twee diensten realiseert met eigenaar A en eigenaar B. Dan past geen enkele kleur uit het bereik, en de signaalkleur laat zien dat dit object aandacht vraagt. Geldt voor alle regels.
- **Conflicten tussen regels**: als twee regels hetzelfde object stylen, signaleert de dialoog dat en lost de gebruiker het op door een regel aan te passen of uit te zetten (On). Verandert de gebruiker niets, dan geldt zoals nu: de laatste regel wint. De volgorde van toevoeging is de volgorde van evaluatie. Er is geen ▲▼ en er komt geen conflictkleur.

### 3.6 Voorspelling en migratie

- De teller in de dialoog en het resultaat gebruiken dezelfde matchfuncties ("count promise", SPEC §13).
- Bestaande presets worden eenmalig gemigreerd; `validatePreset` kent alleen het nieuwe formaat (repo-regel: geen terugval op oude sleutels). Er komt een `schemaVersion`.
- Een stap met N relatietypen × M elementtypen wordt N×M rijen. `:out` wordt Outgoing, `:in` Incoming, beide Either. Elke oude stap is exact weer te geven.

### 3.6b Het presetbestand: leesbaar en schrijfbaar

Presets zijn JSON-bestanden in `user_parameter/` die onder versiebeheer staan en ook met de hand te bewerken zijn. De vraag is of dat zo blijft.

**Wat verbetert**
- Elke regel is één zelfstandig object met herkenbare sleutels (`mode`, `relation`, `added`, `direction`). Een wijziging in een preset is in `git diff` één regel.
- Oude presets bevatten een groot blok `appearance` met velden die alleen ruimte innemen (de volledige TAenIA-preset heeft een `appearance` van circa 40 regels waarvan bijna alles uit). In het nieuwe formaat is een uitgeschakelde of ontbrekende functie een lege lijst.
- Het gedrag van een regel staat in het bestand, niet verspreid over twee lijsten die je mentaal moet kruisen.

**Wat verslechtert**
- Een stap met N relatietypen en M elementtypen was twee korte lijsten en wordt N×M regels. TAenIA stap 1 (6 relaties × 3 elementen): nu 20 regels JSON, straks 18 regels (één per rij) die elk twee waarden herhalen.
- Met de hand een grote stap schrijven is meer typewerk dan twee lijsten.

**Maatregelen om het leesbaar en schrijfbaar te houden**
1. **Standaardwaarden niet wegschrijven.** `mode: include`, `direction: either`, `previous: All`, lege property worden weggelaten. Een regel wordt `{"relation": "serving-relationship", "added": "application-component"}`.
2. **Eén regel per rij in het bestand.** `writePreset` (`lib/preset_io.js:52`, nu `JSON.stringify(obj, null, 2)`) krijgt een kleine serializer die elk regelobject op één regel zet. Dan blijft een stap met 18 regels 18 regels lang.
3. **Vaste volgorde van sleutels en rijen**, gegroepeerd per relatietype en dan per elementtype, zodat diffs klein zijn.
4. **Strenge validatie met duidelijke meldingen.** Een onbekend type, een onbekende `direction` of een ontbrekende sleutel geeft een console-melding met bestandsnaam en rijnummer en slaat de regel over. Nooit stil "All".
5. **`description` blijft het commentaarveld** (JSON kent geen opmerkingen).
6. **Als de grote stappen toch hinderen**: een bestandsnotatie waarin `relation` en `added` ook een lijst mogen zijn, die de dialoog bij het laden naar rijen uitklapt. Dat is bewust niet in dit plan: de dialoog en het bestand zouden dan van vorm verschillen en terugschrijven moet dan opnieuw comprimeren.

Een voorbeeld van het nieuwe bestand (Bedrijfsobjectmodel, drie stappen):
```json
"relatedElements": { "steps": [
  { "repeat": 1, "rules": [
      {"direction": "outgoing", "relation": "aggregation-relationship", "added": "business-object"} ] },
  { "repeat": 1, "rules": [
      {"relation": "association-relationship",     "added": "business-object"},
      {"relation": "specialization-relationship",  "added": "business-object"} ] },
  { "repeat": 1, "rules": [
      {"direction": "incoming", "relation": "aggregation-relationship", "added": "grouping"} ] }
] }
```
Deze drie stappen zijn nu 13 + 14 + 13 regels JSON; straks 8.

### 3.7 Gegevensmodel

```
Preset 1──1 Filter 1──* ElementRule      (mode, elementType, property, value)
                  1──* DiagramRule      (mode, diagramType)
                  1──* RelationRule     (mode, source, relation, target)
Preset 1──* Step   1──* StepRule        (mode, previousElements, direction, addedRelations, addedElements, propertyOf, property, value)
                       + repeat
Preset 1──* NestingRule / ReverseRule   (on, mode, source, relation, target)
Preset 1──* StyleRule                   (on, color, source, relation, target, propertyOf, property, range)
                       + lineWidth, multipleValuesColor
```

## 4. GUI

De ✕ aan het eind van elke regel is de verwijderknop (tooltip "Remove rule"). Elke tabel is een raster van comboboxen met gewone labels als kopjes. De dialoog is 1000 px breed.

### 4.1 Selection: globaal filter
```
Filter selection by element type (none = keep all):
 ┌─────────┬────────────────┬───┐
 │ Mode    │ Element type   │   │
 │ Include │ Business Actor │ ✕ │
 │ Include │ Role           │ ✕ │
 └─────────┴────────────────┴───┘
 [+ Add rule]   ☐ Property condition

Dezelfde tabel met "Property condition" aan (of zodra een regel een property gebruikt):
 ┌─────────┬────────────────┬──────────┬────────┬───┐
 │ Mode    │ Element type   │ Property │ Value  │   │
 │ Include │ Business Actor │          │        │ ✕ │
 │ Include │ Role           │ Status   │ Active │ ✕ │
 │ Exclude │ All            │ Archived │ true   │ ✕ │
 └─────────┴────────────────┴──────────┴────────┴───┘
 [+ Add rule]   ☑ Property condition

Filter selection by diagram type (none = keep all):
 ┌─────────┬────────────────┬───┐
 │ Mode    │ Diagram type   │   │
 │ Include │ ArchiMate view │ ✕ │
 └─────────┴────────────────┴───┘
 [+ Add rule]

Filter selection by relations (none = keep all):
 ┌─────────┬─────────────┬───────────────┬─────────────┬───┐
 │ Mode    │ Source type │ Relation type │ Target type │   │
 │ Include │ All         │ Serving       │ All         │ ✕ │
 │ Include │ Grouping    │ Aggregation   │ All         │ ✕ │
 │ Exclude │ All         │ Association   │ All         │ ✕ │
 └─────────┴─────────────┴───────────────┴─────────────┴───┘
 [+ Add rule]
```

### 4.2 Selection: Expand selection
Standaardweergave (Property condition uit, zes kolommen):
```
┌ Expand selection ─────────────────────────────────────────────────────────────────────────────────┐
│ Expand the selection with connected elements. Each step defines which relation to follow.         │
│                                                                                                   │
│ ┌ ▾ Step 1 · Adds: 12 elements · 20 relations ─────────────────── [↑][↓]   [✕] ┐             │
│ │ ┌────────┬────────────────┬──────────┬─────────────────────┬─────────────────────┬───┐          │
│ │ │ Mode   │ Previous step  │ Direction│ Added relations     │ Added elements      │   │          │
│ │ │        │ elements       │          │                     │                     │   │          │
│ │ │Include │ Grouping       │ Outgoing │ Aggregation    (12) │ All            (12) │ ✕ │          │
│ │ │Include │ All            │ Either   │ Serving         (8) │ App Component   (5) │ ✕ │          │
│ │ │Exclude │ All            │ Either   │ Association     (3) │ All             (3) │ ✕ │          │
│ │ └────────┴────────────────┴──────────┴─────────────────────┴─────────────────────┴───┘          │
│ │ [+ Add rule]   ☐ Property condition    Repeat: [1× ▾]                                           │
│ └───────────────────────────────────────────────────────────────────────────────────┘             │
│ ┌ ▸ Step 2 · 3 rules · Adds: 14 elements · 22 relations ──────── [↑][↓]   [✕] ┐ (ingeklapt)│
│ └───────────────────────────────────────────────────────────────────────────────────┘             │
│ [+ Add step]                                                                                      │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘
```
Met "Property condition" aan komen drie kolommen bij, na Added elements:
```
 ┌────────┬────────────────┬──────────┬────────────────┬────────────────┬─────────────┬──────────┬────────┬───┐
 │ Mode   │ Previous step  │ Direction│ Added          │ Added          │ Property of │ Property │ Value  │   │
 │        │ elements       │          │ relations      │ elements       │             │          │        │   │
 │Include │ All            │ Either   │ Serving   (8)  │ App Comp   (5) │ Added elem. │ Status   │ Active │ ✕ │
 └────────┴────────────────┴──────────┴────────────────┴────────────────┴─────────────┴──────────┴────────┴───┘
 [+ Add rule]   ☑ Property condition    Repeat: [1× ▾]
```
**Stap-kop**: het in/uitklappen en het verplaatsen zagen er te veel op elkaar uit (▲ ▼ naast ▾). Nu:
- **Klapdriehoek links** voor de titel (▾ uitgeklapt, ▸ ingeklapt), en de hele kop is klikbaar om te in/uitklappen. Dat is de vorm van een boomstructuur.
- **Verplaatsen met lijnpijlen ↑ ↓ rechts**, gescheiden van **✕** door een tussenruimte. Andere plek én andere vorm dan de driehoek.
- **Ingeklapt** toont de kop een samenvatting (`3 rules · Adds: 14 elements · 22 relations`), zodat je ziet wat er in zit.
- Tooltips: "Collapse / expand this step" (kop en driehoek), "Move this step up / down", "Remove this step".

Beide "add"-knoppen staan onder hun lijst: **[+ Add rule]** onder de regels van een stap, **[+ Add step]** onder de stappen (nu staat die rechtsboven in de groep). De uitleg staat bovenaan de groep. Stap 1 begint uitgeklapt, de rest ingeklapt, zoals nu.

Tooltips bij Direction:
- Outgoing: the relation starts at an element of the previous step.
- Incoming: the relation ends at an element of the previous step.
- Either: both (default).

**Afwegingen kolombreedte.** Standaard zijn het zes kolommen; met Property condition negen op 1000 px. Het langste elementlabel is "Application Collaboration" (≈175 px) en het langste relatielabel "Specialization" (≈110 px). De aantallen tussen haakjes kosten nog ≈30 px per kolom.
1. *Volledige koppen* ("Added relations", "Added elements"): duidelijkst, maar de koppen zijn breder dan de combo's. Dit is wat hierboven staat.
2. *Groepskop boven de kolommen* ("Previous step" | "Added" over Relations, Elements, Property of, Property, Value): de kolomnamen blijven kort. Kost één extra kopregel.
3. *Afgekorte koppen met tooltip* ("Prev. elements", "Added rel."): het smalst, maar minder leesbaar.

Begin met 1 en schakel naar 2 als de breedte knelt.

### 4.3 Layout: Relations
```
Nesting — draw these as nesting, child inside its parent:
 ┌────┬─────────┬─────────────┬───────────────┬─────────────┬───┐
 │ On │ Mode    │ Source type │ Relation type │ Target type │   │
 │ ☑  │ Include │ Grouping    │ Aggregation   │ All         │ ✕ │
 │ ☑  │ Include │ Grouping    │ Composition   │ All         │ ✕ │
 └────┴─────────┴─────────────┴───────────────┴─────────────┴───┘
 [+ Add rule]    The parent is the source — or the target if the relation is also in Reverse below.

Reverse — flip these relations:
 ┌────┬─────────┬─────────────┬───────────────┬─────────────┬───┐
 │ On │ Mode    │ Source type │ Relation type │ Target type │   │
 │ ☑  │ Include │ All         │ Serving       │ All         │ ✕ │
 └────┴─────────┴─────────────┴───────────────┴─────────────┴───┘
 [+ Add rule]    Flow: laid out from target to source, against the Direction in the Flow box (arrows unchanged).
                 Nesting: if the relation is also nested, the target becomes the parent.
```

### 4.4 Appearance

De cellen gebruiken volledige, zelfverklarende labels in plaats van kale "Source" of "Element":
- **Color** (wat de kleur krijgt): `Element (own property)` · `Relation` · `Source element` · `Target element`
- **Property of** (waar de waarde vandaan komt): `Element` · `Relation` · `Source element` · `Target element`
- Bij `Element (own property)` zijn Relation, Target en Property of uitgegrijsd ("—"); het elementtype staat in Source.

```
Style by property
 ┌────┬────────────────────────┬───────────┬─────────────┬───────────┬────────────────┬──────────┬──────────────┬───┬───┐
 │ On │ Color                  │ Source    │ Relation    │ Target    │ Property of    │ Property │ Range        │   │   │
 │ ☑  │ Element (own property) │ App Comp  │ —           │ —         │ —              │ Status   │ Blues ▓▓▓▓   │   │ ✕ │
 │ ☑  │ Relation               │ All       │ Flow        │ All       │ Relation       │ Volume   │ Reds ▓▓▓▓    │   │ ✕ │
 │ ☑  │ Source element        │ All       │ Serving     │ All       │ Relation       │ Priority │ OrRd ▓▓▓▓    │ ⚠ │ ✕ │
 │ ☑  │ Source element        │ App Comp  │ Realization │ Bus. Svc  │ Target element │ Owner    │ Purples ▓▓▓  │ ⚠ │ ✕ │
 └────┴────────────────────────┴───────────┴─────────────┴───────────┴────────────────┴──────────┴──────────────┴───┴───┘
 [+ Add rule]
 ⚠ Rows 3 and 4 both style 7 elements. The last rule wins. Change a rule or switch one off.
 Mixed values color: [#FF6B35][■]      Line width of styled relations: [No change ▾]
```
Zo leest elke rij (de tooltip van de rij toont dezelfde zin):
1. Color every *Application Component* by its own *Status*, from the *Blues* range.
2. Color every *Flow relation* by the relation's own *Volume*, from *Reds*.
3. Color the *source element* of every *Serving relation* by the relation's *Priority*, from *OrRd*.
4. Color the *source element* (an *Application Component*) of every *Realization relation* to a *Business Service* by the *Owner* of the *target element*, from *Purples*.

- ⚠ staat bij elke regel die een object stylet dat ook door een andere regel wordt gestyled. De tooltip noemt de andere regel(s) en het aantal objecten. De berekening gebruikt de voorspelde viewinhoud uit dezelfde dry-run als de tellers.
- De volgorde van de rijen is de evaluatievolgorde (laatste wint bij een conflict) en de tabel heeft geen Mode-kolom: een uitsluiting heeft geen kleur.
- Breedte: Color is met ≈150 px de breedste cel; het totaal komt op ≈960 px. Past nog in de standaardbreedte van 1000 px, maar zonder marge. Valt het krap uit, dan gaat Range naar alleen het kleurstrookje.

### 4.5 Tooltips

Elke tabel, kolomkop en knop krijgt een compacte tooltip over de werking. Tooltips komen uit `defs` (`PARAM_TOOLTIPS` en een nieuwe `RULE_TOOLTIPS`), zodat de bestaande "Used by"-regel en de registry-controle blijven werken.

| Plek | Tooltip |
|---|---|
| Mode | Include keeps what matches this rule. Exclude removes it. Result = all Include rules minus all Exclude rules. |
| Source type / Target type | Element type at the start / end of the relation. All = any type. |
| Relation type | Relationship type. All = any type. |
| Element type, Diagram type | Type to match. All = any type. |
| Property, Value | Only match objects whose property has this value. Leave empty for no condition. |
| Previous step elements | Only elements of this type from the previous step are expanded. All = any. |
| Direction | Outgoing: the relation starts at an element of the previous step. Incoming: it ends there. Either: both. |
| Added relations | Relationship types to follow from the previous step. |
| Added elements | Types of the elements this step adds. |
| Property of (step) | Where the property is read: the added element, the followed relation or the element from the previous step. |
| Repeat | (bestaande tekst) |
| On | Switch this rule on or off without deleting it. |
| ✕ | Remove this rule. |
| [+ Add rule] | Add a rule. Rules combine: a match with any Include rule is kept, unless an Exclude rule also matches. |
| [+ Add step] | Each step builds on the previous selection. |
| Nesting (tabel) | Draw matching relations as nesting: the child inside its parent. Parent = source; with Reverse, the target. |
| Reverse (tabel) | Flips matching relations. Flow: laid out from target to source, against the Direction in the Flow box; arrows unchanged. Nesting: the target becomes the parent. |
| Property condition | Show columns to match elements by a property value. Always on when a rule uses it. |
| (n) bij Added relations / elements | Relations / elements this rule matches on its own. Rules can overlap, so the sum can exceed the step total. For an Exclude rule: how many it removes. |
| Color | What gets the color: the element itself (using its own property), the relation, or the source / target element of a matching relation. |
| Property of (style) | Whose property supplies the value: the element, the relation, its source or its target. |
| Range | Colors from low to high value of the property. |
| ⚠ | Another rule styles the same object. The last rule wins. Change a rule or switch one off. |
| Mixed values color | Used when an element or relation gets more than one different value for the property, so no single color from the range applies. |
| Line width of styled relations | Line width for all relations colored by a rule with Color = Relation. |

## 5. Wat ik mis

- **Bevestiging van aannames**
  - "Previous step elements" beperkt vanaf nu welke elementen uit de vorige stap uitbreiden. Gemigreerde presets krijgen All en gedragen zich dus ongewijzigd.
  - Het globale elementfilter krijgt Property/Value; dat is een nieuwe mogelijkheid.
- **Presetschema en migratie.** Het presetschema verandert, dat is bedoeld: nieuwe sleutels en `schemaVersion` (3.6). "All" wordt niet uitgeschreven naar alle typen; het blijft één waarde "All" in de regel.
  Rijen vermenigvuldigen zich alleen waar een oude stap zowel relatietypen als elementtypen heeft. In een oude stap waren dat twee onafhankelijke lijsten ("volg A of B" en "voeg X of Y toe"). Een regel koppelt één relatietype aan één elementtype, dus "A, B" × "X, Y" worden vier regels (A–X, A–Y, B–X, B–Y). Een stap met alleen relatietypen geeft N regels, een stap met alleen elementtypen M regels.
  Gemeten over de 48 presets (62 stappen): 41 stappen worden 1 regel, 6 worden 2, 5 worden 4 en 10 stappen worden 7 tot 18 regels (maximum 18, in TAenIA en Bedrijfsprocessen en kernobjecten). Het migratiescript rapporteert dit per preset in `--dry-run`. De regels van een stap zijn daarna ongeordend en gemakkelijk te sorteren om te clusteren. Wil je dat de grote stappen compacter worden, dan kan een regel later meerdere types per veld krijgen; dat is nu bewust buiten dit plan gehouden.
- **Aantallen per regel kosten rekentijd.** Per stap wordt nu één traversal gedaan. Voor de aantallen per regel hoeft dat niet vaker: de kandidaten (relatie, uitbreidend element, nieuw element) worden eenmaal verzameld en elke regel evalueert ze in het geheugen. `expandStepFrontiers` geeft daarom de kandidatenlijst terug, naast het totaal. Bij 18 regels blijft de dry-run dus één traversal.
- **Twee begrippen "Direction".** De Flow-groep op het Layout-tab heeft al een "Direction" (richting van de hoofdstroom); de stap-kolom Direction (Outgoing/Incoming/Either) heeft een andere betekenis. De tooltips zeggen dat. Wil je het verschil in de naam, dan kan de stap-kolom "Follow" heten.
- **On alleen bij nesting, reverse en Appearance.** De Selection-tabellen hebben alleen Mode. Een On-kolom daar is eenvoudig toe te voegen als je uniformiteit wilt.
- **Property-keuzelijsten per regel.** Nu vult één dry-run per stap de property-lijst. Per regel moet die lijst gefilterd worden op het gekozen type en kant (Property of). Dat vraagt een lichte herstructurering van `refreshPropCombo` en `_buildDynamicPropCombo`.
- **Reverse heeft twee betekenissen** (ouder kiezen bij nesting, kant omdraaien in de layout). Dat blijft zo en valt buiten dit plan.
- **Zelfrelaties** (bron = doel): bij Direction = Either mogen ze niet dubbel tellen. De matchmodule moet dat afvangen; nesting behandelt ze al apart.
- **Tooltips en documentatie.** Tooltips komen uit `defs` met een gegenereerde "Used by"-regel (commit d8601df). `PARAM_WIDGETS`/`OWN_HANDLING`, `tools/check_registry.js` en `tools/gen_docs_tables.js` moeten de nieuwe parameters kennen. SPEC.md (schema §560–603, `schemaVersion`), ARCHITECTURE.md en README worden aangepast, inclusief de onjuiste claim dat het globale relatiefilter richting kent.
- **GTK.** Een raster van comboboxen met knoppen als kopjes is nieuw in deze dialoog. Er zijn nu geen tabellen of popups. De regels in `ai/jarchi-scripting/SKILL.md` gelden: expliciete hoogte-hints op kleine knoppen, `layout(true, true)` en `_resizeScrolled` na dynamische wijzigingen.

## 5b. Evaluatie tijdens de implementatie (aanvullingen op dit plan)

1. **Lege lijst per soort.** Filterlijsten (globaal, stap): leeg = alles; de GUI toont dan de standaardregel `Include | All | All | All` en schrijft `[]`. Featurelijsten (nesting, reverse, stijlregels): leeg = niets, de tabel mag leeg zijn en start leeg. Een standaardregel "All" zou daar alles nesten.
2. **Relaties binnen een stap.** Welke relaties tussen de stapelementen getekend worden: een Include-regel matcht op relatietype, Direction en Previous step elements. Added elements en de property-voorwaarde bepalen alleen welke elementen erbij komen. Een Exclude-regel matcht volledig. Zo blijft een gemigreerde stap exact gelijk (oud gedrag: alleen relatietype + richting) (`rel_filter.matchStepRelation`).
3. **Reset bij Modify-acties (gedragswijziging).** Oud: een uitgeschakelde Appearance-functie wiste bij Layout only / Expand view de vulkleur van álle elementen die ze had kunnen raken. Met elementtype "Any" waren dat alle elementen, dus ook handmatig gekleurde. Nieuw: alleen een regel die uit staat (On) zet terug wat hij zou kleuren. Handmatige kleuren blijven staan.
4. **Naam:** `appearance.styleByProperty = { rules, mixedValuesColor, lineWidth }` (in 3.7 stond `multipleValuesColor`).
5. **Migratie van Appearance.** Style by related/connected met beide richtingen wordt twee regels (Color = Source en Color = Target), elk met een eigen kleurschaal. Mixed values gaat nu over verschillende waarden, niet meer over verschillende doelelementen. Alleen 2 van 48 presets gebruiken dit.
6. **Bron/doel-kleuring gebruikt modelbrede relaties**, zoals nu: een element kan gekleurd worden via een relatie die niet op de view staat.
7. **Oude migratiescripts** (`test/migrate_presets_node.js`, `convert_old_js_presets.js`, `migrate_presets.ajs`) maken het oude formaat, dat nu met een duidelijke melding wordt geweigerd. Ze blijven staan als historie; niet meer gebruiken.

## 6. Uitvoering en verificatie

**Uitvoering**
1. `lib/rel_filter.js` (nieuw, pure functies): `defaultRows`, `normalizeRows`, `matchRows`, `matchStepRows`, `matchElementRows`, `matchDiagramRows`.
2. `lib/defs.js`: nieuwe sleutels en `schemaVersion` in `DEFAULT_PRESET` en `validatePreset`; oude sleutels verwijderen.
3. `lib/selection_pipeline.js`: `_applyFilter`, `_applyDiagramFilter`, `_expandStepFrontiers`, `_findRelationsBetween`, `_splitNestingRels`, `_resolveNesting`, `predictViewCounts` op de nieuwe functies. Match-functies exporteren.
4. `lib/appearance.js`: één stijlregel-evaluator plus `detectRuleConflicts`.
5. `lib/gui/dialog_main.js`: generieke `_ruleTable` (kolomtypes: type-combo, enum-combo, property-combo, check, kleurbereik via `_colorRangeSelector`); `_updateFilteredCount` en `_saveUI` lezen de rijen via één functie. Kolomtoggle "Property condition" per tabel (aan en vast zodra een regel een property gebruikt). Aantallen per regel in Added relations/elements uit de kandidatenlijst van `expandStepFrontiers`. `_relCheckGrid`, de relatie-`_checkboxGrid`s en de containercombo vervallen.
6. `test/migrate_presets_relrows.js` (naar het voorbeeld van `test/migrate_presets_params.js`: idempotent, `--dry-run`).
7. Docs en tooltips.

**Verificatie**
- `node Scripts/View/tools/check_registry.js` blijft groen.
- Node-tests voor `rel_filter.js` (include/exclude, alleen excludes, standaardregel, Direction, zelfrelaties, property-kolommen) en voor `detectRuleConflicts`.
- Migratiescript `--dry-run` over alle 48 presets. Daarna een voor/na-vergelijking van aantallen elementen en relaties op de testviews in `Views/Test` van het wiki-gemma-model (`.git/temp.archimate`, `user_parameter/Test/test-preset.json`).
- Handmatig in Archi: regels toevoegen, verwijderen en sorteren; de teller moet gelijk zijn aan het gegenereerde resultaat; de Appearance van een gemigreerde preset vergelijken met de oude uitkomst.