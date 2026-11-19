# View: herkenbare achtergrond van bedrijfsfunctielagen

## Context

De GEMMA-platen delen één kaart: BA01, de domeinviews XX01/XX02 en de poster **RC00 Alle referentiecomponenten**, die gemeenten afdrukken en ophangen. RC00 laat de hele kaart zien:
- **Lagen.** De zeven bedrijfsfunctielagen staan als banden onder elkaar, in vaste volgorde.
- **Superlagen.** Achtergrondnotes groeperen de lagen: Besturende, Primaire en Ondersteunende bedrijfsfuncties.
- **Rechterkolom.** Een kolom "Generieke applicatieservices" met groupings van services.
- **Legenda.** Een blok met uitlegnotes.

De gegenereerde view `Fysieke leefomgeving` verliest die kaart. Het doel is views genereren op deze kaart: de complete poster, en per domein een plaat waarop het domein de kaart invult. De eisen:
- De structuur van het model is leidend.
- Een ondiep sjabloon legt de top vast.
- Het script blijft generiek, zonder complexiteit in de GUI of in het GEMMA-model.
- Het resultaat is herhaalbaar en voorspelbaar.

## 1. Het probleem

Waargenomen in `gemma-archi-repository/.git/temp.archimate`:

| Aspect | RC00, FL02 (handwerk) | Gegenereerd |
|---|---|---|
| Top | Superlagen → lagen (banden) → functies; rechts de services | Domeingrouping als frame; die staat op geen enkele BF-plaat |
| Lagen | Alle, vaste volgorde, onder elkaar | Geen; Tiles kan banden naast elkaar zetten |
| Onder de lagen | Dicht gepakt; Ondersteuning mag alfabetisch | Alfabetisch en dicht gepakt: **gaat al goed** |

Daaruit volgen vier tekorten:
- **T1. Indeling van de top.** Niets legt de plaatsing van superlagen, lagen, servicekolom en legenda vast.
- **T2. Domein → kaart.** De domeingrouping bepaalt welk deel van de kaart wordt ingevuld. De functies die ze bereikt, hangen op niveau 2 of 3 (Strategie, Ontvangst, Uitvoering fysieke leefomgeving). Het pad omhoog naar de laag komt niet mee: stappen ketenen, en een stap omhoog na een stap omlaag trekt broers en zussen mee (`lib/selection_pipeline.js:258`).
- **T3. De domeingrouping zelf.** Die is de vraag, niet de inhoud, en hoort niet op de plaat. Het filter laat haar niet weg, want het draait vóór de stappen.
- **T4. Relaties tussen takken (te verifiëren).** Relaties tussen nieuwe elementen van één run worden volgens de run order niet verzameld. SPEC § 5 zegt daarentegen dat *New view* elke relatie tekent.

**Niet nodig:** gelijke breedte voor alle leafs. Leafs volgen de breedte van hun niveau, want visuele rust weegt zwaarder.

## 2. Afgewogen benaderingen

| | A. Volgorde-property | B. Sjabloon met posities, oprekken | C. Model + ondiep sjabloon als achtergrond |
|---|---|---|---|
| Idee | `Volgorde` op elke functie, sorteren, bandenregel | Grid uit de coördinaten van een view, oprekken | Het model bepaalt inhoud en nesting; het sjabloon de achtergrond en de indeling van de top |
| Model leidend | ✓ | ✗ | ✓ |
| Domein vult de kaart | Steps + filters per preset | Snoeien van het sjabloon | Eén regel: zie § 3 |
| Voorspelbaar | ✓ | Nee: tolerantie | ✓: overlapregel |
| Model | Property per functie | 0 | 0, plus de superlaag-groupings die je zelf wilt |
| Script | Klein | Groot | Middel |

**Tolerantie (B).** Een marge in pixels waarbinnen twee vakken als "zelfde rij" gelden. In BA01 staan de vakken van één rij op y = 17, 19, 20 en 21. Met een marge van 3 px vallen ze in één rij, met 2 px niet. Valt die marge verkeerd, dan komt een functie stil in een andere rij.

## 3. Aanbeveling: C, het sjabloon als achtergrond die de selectie invult

### Modelwijziging (jouw voorstel)

De achtergrondnotes van RC00 worden groupings in het model:
- de superlagen Besturende, Primaire en Ondersteunende bedrijfsfuncties, met aggregatie naar hun lagen;
- "Generieke applicatieservices", met aggregatie naar de servicegroupings.

Het legendablok wordt een diagram-groep met de notes erin. Dat is een diagram-block: de layout laat het heel en bepaalt alleen de plek.

### Het sjabloon

Het sjabloon is een view met alleen de top: de superlaag-groupings, de lagen, Generieke applicatieservices met haar servicegroupings, en de legenda. De canonieke term is **background view**: in de dialoog en de console heet hij *Background*.

**Zo komt hij in een preset.** De Layout-tab krijgt één tekstveld, *Background*. Je typt er het pad van de view in, net zoals bij het veld voor de map van nieuwe views. Een leeg veld betekent: geen background view, en dan verandert er niets.

**Opslag.** De preset bewaart `backgroundView` als `{ id, path }`. Het id vindt de view terug, ook als hij hernoemd of verplaatst is; het pad is alleen een label. Bij het opslaan wordt het id bij het pad opgezocht.

**Fouten.** Een pad dat niet bestaat, of een id dat niet meer bestaat, stopt de run met een melding: wat er misging, het gevolg en wat je kunt doen.

**Regenerate.** View origin legt de background view vast, zodat Regenerate dezelfde gebruikt.

### Eén regel voor wat er getekend wordt

1. **De achtergrond staat er altijd.** Alle elementen van het sjabloon staan op de view. Daarmee zijn er altijd alle lagen.
2. **De selectie vult de achtergrond.** De start en de stappen werken zoals nu.
3. **Het pad naar de achtergrond komt mee.** Voor elk element volgt het script de nestingrelaties omhoog tot een element van het sjabloon. De elementen en relaties op dat pad komen erbij; dit pad zijn de voorouders. Paden die het sjabloon niet bereiken, voegen niets toe. Zo komt bijvoorbeeld Strategie → Sturing mee.
4. **Wat niet onder de achtergrond hangt, staat er niet.** De console meldt hoeveel elementen er zijn weggelaten, en waarom. De domeingrouping valt hier vanzelf onder: ze is de vraag, ze hangt boven de functies en niet eronder.

Deze regel lost T2, T3 en T4 in één keer op:
- Het domein bepaalt welk deel van de kaart wordt ingevuld; het sjabloon bepaalt de kaart.
- De GUI krijgt geen stappenoptie en geen extra filter.
- De pas zit in de selectie-pipeline, dus de tellingen in de dialoog volgen vanzelf.
- De relaties op het pad worden expliciet toegevoegd, dus T4 speelt voor het pad niet.

| Plaat | Start | Resultaat |
|---|---|---|
| RC00-poster | De superlaag-groupings en Generieke applicatieservices: die zijn zelf achtergrond | Alles hangt eronder, dus alles wordt ingevuld; regel 3 en 4 doen niets |
| FL-plaat | De domeingrouping "Fysieke leefomgeving" | Alle lagen staan erop; alleen wat het domein bereikt wordt ingevuld, met het pad naar de laag; de grouping zelf valt weg |

**Wat het model levert, laat het zien.** De domeingrouping aggregeert nu Strategie en Ontvangst in hun geheel. De gegenereerde FL-plaat toont daardoor ook Kaderstelling en Strategische planning, en onder Ontvangst onder meer de Gebruikersbeheercomponent. FL02 toont daar alleen Strategievorming fysieke leefomgeving en de Meldingen openbare ruimtecomponent. Moet de plaat zo precies worden als FL02, dan hoort de domeingrouping die precieze functies te aggregeren. Dat zijn modelgegevens, geen structuur.

### Indeling van de top: de overlapregel, zonder tolerantie

- **Rij.** Twee vakken horen in één rij als hun verticale bereik overlapt.
- **Kolom.** Binnen een rij vormen vakken met een overlappend horizontaal bereik een kolom.
- **Stapel.** Binnen een kolom staan de vakken van boven naar onder.

Dit levert per sjablooncontainer een **indeling**: welke kinderen naast elkaar staan en welke onder elkaar. Een indeling zegt niets over maten of posities, en ook niet welke elementen er staan; dat laatste bepaalt de selectie.

Tiles werkt intern al met zo'n indeling. Voor elke container zoekt het de verdeling in rijen en kolommen die de minste witruimte geeft; in de code en de literatuur heet dat een *slicing tree*. Voor een sjablooncontainer zoekt Tiles niet zelf, maar neemt het de indeling van het sjabloon over. Afmetingen, groei en uitlijning rekent Tiles uit zoals nu: een rij wordt zo hoog als haar hoogste vak, en een cel groeit met haar inhoud. Het sjabloon wordt gelezen in de pipeline en als data in de LayoutGraph gezet; zo blijft harde regel 3 (adapters lezen geen view) heel.

Onder het sjabloon werkt Tiles zoals nu: gesorteerd op type en naam en zo dicht gepakt dat er zo min mogelijk witruimte overblijft.

### Afwijkingen tussen model en sjabloon

Het sjabloon wordt onderhouden bij een wijziging in het model. Het script maakt een afwijking zichtbaar:

| Situatie | Wat het script doet |
|---|---|
| Kind van een sjablooncontainer dat niet op het sjabloon staat | Achteraan, op type en naam, met de waarschuwing "staat niet op het sjabloon" |
| Element dat in het model onder een andere ouder valt dan op het sjabloon | Het model wint, met een waarschuwing die beide ouders noemt |
| Element weggelaten volgens regel 4 | Het aantal en de namen staan in de console; de details in het logbestand |

### Kosten

- Achtergrond en pad, als pas in `lib/selection_pipeline.js`: ongeveer 80 regels.
- De overlapregel als pure module: ongeveer 80 regels.
- Tiles neemt de indeling van het sjabloon over: ongeveer 60 regels.
- Inlezen, registratie, waarschuwingen en origin: ongeveer 50 regels.
- GUI: één tekstveld op de Layout-tab.

### Faalt wanneer

- Vakken in het sjabloon schuin overlappen, zodat twee bedoelde rijen samenvallen. Het resultaat is dan deterministisch maar ongewenst; de oplossing is het sjabloon netjes zetten. De debug-log toont de afgeleide rijen.
- Een element via geen enkel pad onder de achtergrond hangt. Het valt dan weg, en de console meldt dat.
- Een functie meerdere ouders heeft. Dan geldt de bestaande regel voor *every container*: hij komt onder elke ouder die het sjabloon bereikt.

## 4. Uitvoering

Voor elke stap gelden de regels van `Scripts/View/AGENTS.md` § Order of change. Na elke wijziging draait `npm run typecheck`, en elke stap krijgt een eigen commit.

1. **Model (jij, in Archi).** De superlaag-groupings en Generieke applicatieservices aanleggen, en het sjabloon maken uit RC00.
2. **De overlapregel** als pure module, met Node-tests op het sjabloon.
3. **`backgroundView`.** De optie in `lib/defs.js`, het veld *Background* in `lib/gui/tab_layout.js`, validatie en het opzoeken van het id in `lib/preset_io.js`, inlezen in de pipeline, data in `lib/layout_graph.js`, vastleggen in `lib/view_origin.js`.
4. **Tiles volgt de indeling** van de sjablooncontainers (`lib/engines/tiles.js`).
5. **Achtergrondregel** (regels 1–4) in `lib/selection_pipeline.js`, met tellingen en meldingen.
6. **Presets.** "RC00 poster" en een domeinpreset, beide met hetzelfde sjabloon. Archi-check: de poster naast RC00, de FL-plaat naast FL02.

## Besluiten (gebruiker, 2026-11-19)

1. **Background view in de preset.** Via een padveld *Background* op de Layout-tab; opgeslagen als id plus pad.
2. **Legenda.** Wordt een diagram-groep met de uitlegnotes erin: één diagram-block.
3. **Precisie van de domeinplaten.** Het model wordt aangescherpt: de domeingroupings aggregeren precies de functies van het domein. Het script blijft eenvoudig.
4. **Term.** *background view*, in SPEC § Vocabulary. In de canonieke termen komt "laag" niet voor: de bedrijfsfunctielagen zijn gewone elementen op de background view.

Werk voor jou in Archi, vóór stap 6: de superlaag-groupings, de grouping Generieke applicatieservices, de background view uit RC00 met de legenda als diagram-groep, en de domeingroupings aanscherpen.

## Verificatie

- **Node.**
  - Overlapregel: overlap geeft dezelfde rij; een stapel in een kolom.
  - Achtergrondregel: het pad omhoog komt mee zonder broers en zussen; een element zonder pad valt weg, met een melding; de domeingrouping valt weg; de RC00-start laat alles staan.
  - Tiles met een opgegeven indeling: volgorde behouden, geen schaling (harde regel 1).
  - Harness-runs van de poster en de FL-plaat.
- **Archi.**
  - De poster naast RC00 en de FL-plaat naast FL02: lagen en servicekolom op hun plek, Ondersteuning dicht gepakt.
  - Twee keer Regenerate geeft dezelfde view.
  - De baseline (skill `view-baseline`) voor presets zonder `backgroundView`: ongewijzigd.
- **Typecheck.** `npm run typecheck` geeft exit 0.

## Uitkomst (2026-11-19)

Gebouwd en door de gebruiker goedgekeurd; het ontwerp week op deze punten af van het plan hierboven (de docs beschrijven de stand: SPEC § 7 Containers, `docs/reference/selection-nesting.md` § Background view, ARCHITECTURE § Background view en § Tiles):
- **Indeling:** recursive XY-cut, kolommen vóór rijen, in plaats van de overlapregel "eerst rijen". Die las de top van RC00 verkeerd.
- **Vaste plekken:** alleen containers met een frame houden hun indeling; met het vinkje *Every box in place* houden alle containers hun indeling.
- **Relaties:** getekend worden alleen die van de selectie, het pad omhoog en die binnen de background view, niet elke nestingrelatie.
- **Banden en Tiles:** banden zijn even breed, ook een lege laag. Binnen een indeling geldt geen oppervlakdrempel. Bij gelijke maat wint de eenvoudigste vorm met volle delen eerst; dat geldt voor alle Tiles-views, de expected files zijn herschreven.
- **Layout only en Expand view:** volgen de indeling van de background view uit de huidige instellingen.
- **View origin:** ongewijzigd; de preset bevat de background view.

Open:
- **Voor de gebruiker:** Gegevensmanagement op de background view verplaatsen naar Ondersteuning.
- **Known gap 17:** ELK met *Same width per level* en diagram objects.
