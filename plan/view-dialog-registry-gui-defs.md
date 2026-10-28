# View-dialog: registry, koppeling GUI ↔ defs, indeling, labels, tooltips, docs

## Context

De View-dialog ([dialog_main.js](Scripts/View/lib/gui/dialog_main.js)) is gegroeid tot ±30 layout-params over 14 algoritmen. De registry in [defs.js](Scripts/View/lib/defs.js) (`ALGORITHMS.activeParams` / `supportedOptions` / `paramConflicts` / `DEFAULT_PRESET`) is de SSOT, maar engines, GUI en [ARCHITECTURE.md](Scripts/View/ARCHITECTURE.md) zijn daarvan weggegroeid. Doel: één consistente registry, een GUI die precies doet wat de registry zegt, en een indeling en teksten die zichzelf verklaren en minder complex zijn.

Scope: hoofdvenster (presetrij, Generated view, actieknoppen) + Layout-tab. Selection, Appearance en Properties volgen later (alleen evidente tekstfouten nu meenemen).

Volgorde van uitvoeren: **eerst correctheid (registry, load/save), dan het aantal params verkleinen, dan de indeling (hoofdvenster → Layout-tab), dan labels, dan tooltips, als laatste docs.** De indeling hangt af van welke params er overblijven; labels hangen af van de indeling; tooltips beschrijven de labels; docs beschrijven het eindresultaat.

---

## Fase 0 — Inventarisatie (gedaan) en bevindingen

### 0.1 Param → defs → GUI → load/save → engine

| param | GUI-widget (groep) | load/save | actief in (defs) | werkelijk engine-gebruik | bevinding |
|---|---|---|---|---|---|
| direction | cmbDirection (Flow) | ✓/✓ | Layered Tree Dagre Dot | ELK, Dagre, Dot | ok |
| nodePlacement | cmbNodePlacement (Flow) | ✓/✓ | Layered | ELK layered | tooltip ontbreekt op label, alleen op items |
| ranking | cmbRanking (Flow) | ✓/✓ | Dagre | Dagre `ranker` | ok |
| acyclicer | cmbAcyclicer (Flow) | ✓/✓ | Dagre | **dood**: `DEFAULT_DAGRE_PARAMS {acyclicer:"greedy"}` wordt ná de mapping gemerged en door `Number()` → `NaN` ([dagre.js:113-117](Scripts/View/lib/engines/dagre.js#L113-L117)) → altijd DFS | **bug** |
| reverseRelationTypes | lstReverseTypes (Flow) | ✓/✓ | alle behalve Force/Stress/Radial/SFDP/Circo | generate_view (randrichting) + pipeline (nesting-ouder) | Twopi: actief maar zonder effect (ongericht, geen nesting) |
| routing | cmbRouting (Connections) | ✓/✓ | Layered Dot Neato FDP SFDP | ELK, Graphviz | ok |
| labelPosition | cmbLabelPosition (Connections) | ✓/✓ | Layered Tree Dagre + alle GV | ELK, Dagre, GV | ok |
| connectionLabelSpacing | chk (Connections) | ✓/✓ | Layered | ELK layered | ok |
| connectionSpacing | spin "Between" | ✓/✓ | Layered Tree Dagre **Dot** | ELK, Dagre `edgesep` | **Dot: geen mapping** in graphviz.js → dood |
| connectionElementSpacing | spin "To element" | ✓/✓ | Layered Tree Dot Neato FDP SFDP | ELK; GV `sep`/`esep` | Dot → `sep`, wordt door dot genegeerd (te verifiëren in Graphviz-docs) |
| elementSpacing | spin "Element" | ✓/✓ | bijna alle | ELK, Dagre, GV | **Grid/Pack: dood** – ELK mapt daar `innerSpacing`, niet `elementSpacing` |
| layerSpacing | spin "Layer" | ✓/✓ | Layered Radial Dagre Dot Twopi | ELK, Dagre, GV `ranksep`; Radial = `radius` | betekenis verschilt per algoritme (laag vs. ring) |
| elementWidth/Height | spin (Elements) | ✓/✓ | alle | generate_view, GV | ok |
| labelSizing / labelMaxLineWidth | chk/spin (Elements) | ✓/✓ | Grid Pack | engine-utils | label "Max width" botst met View "Max width" |
| nestingRelationTypes | grid (Nesting) | ✓/✓ | ELK-nesting, Dagre, Dot Neato FDP | pipeline | ok |
| nestingContainerTypes | combo+selector (Nesting) | ✓/✓ | idem | pipeline | ok |
| innerSpacing | spin "Inner spacing" | ✓/✓ | Grid Pack Dot Neato FDP | ELK Grid/Pack = afstand tussen elementen (óók root!); GV = clustermarge (= padding) | **dubbele betekenis**, overlapt met elementSpacing én padding |
| padding | spin "Padding" | ✓/✓ | ELK-nesting | ELK containers; GV leest `options.padding` voor cluster-BB maar param is daar inactief → altijd 20 | GV inconsistent |
| sortContainers | chk | ✓/✓ | ELK-nesting, Dagre | ELK, Dagre | ok |
| alignWidthSameType | chk | ✓/✓ | ELK-nesting | ELK | ok |
| snapColumnsToGrid | chk | ✓/✓ | Grid Pack (+ in PARAMS_ELK_NESTING? nee: los) | ELK | ok |
| showInEveryContainer | chk | ✓/✓ | ELK-nesting | pipeline | ok |
| containerAlgorithm | combo | ✓/✓ | ELK-nesting | ELK | Tree: opties Grid/Pack, default "Layered" → validatePreset laat ongeldige default staan |
| connectionsMode | combo | ✓/✓ | Layered | ELK | `_syncToUI` fallback "Between", default is "Crossing" |
| alignDebug | **geen widget** | –/– | ELK-nesting | ELK + generate_view (debug-log) | overbodig sinds het resultaat in het archimate-bestand gecontroleerd wordt → verwijderen |
| maxWidth / aspectRatio / viewSizeMode | radio+spin/combo (View) | ✓/✓ | zie defs | ELK calibratie; GV: maxWidth = **minimum** (spread), aspectRatio → `ratio` | "Max width" is voor Graphviz feitelijk "Min width"; Radial: aspectRatio actief, calibratie werkt generiek (ok) |
| diagramPadding | spin (View) | ✓/✓ | alle | alle | ok |

### 0.2 Overige bevindingen GUI-code
- **Data-verlies bij preset laden**: `_mergePreset` ([dialog_main.js:3100](Scripts/View/lib/gui/dialog_main.js#L3100)) houdt voor params die inactief zijn in het nieuwe algoritme de *oude sessiewaarde* aan i.p.v. de presetwaarde. Daarna overschrijft "Save" de preset met die vreemde waarden.
- Dubbele actie-afhandeling: `buttonPressed` en `_runAction` hebben elk een eigen `ACTION_MAP`; alleen `_runAction` wordt gebruikt (custom knoppen) → `buttonPressed`-pad is dood behalve Cancel.
- `_syncToUI` fallbacks (`||`) wijken af van `DEFAULT_PRESET` (connectionsMode, containerAlgorithm) — overbodig na `validatePreset`.
- Hardgecodeerde spinner-defaults in de builder (140, 60, 40, 180 …) dupliceren `DEFAULT_PRESET`.

### 0.4 Params in de preset maar niet (of overbodig) in de GUI — analyse en advies

Tellingen over alle 39 presets (incl. submappen; 30 Layered, 8 Pack, 2 Dot — de andere 11 algoritmen worden in geen enkele preset gebruikt).

**Nu al preset-only (geen widget):**
| sleutel | wat | advies |
|---|---|---|
| `params.alignDebug` | debuglog (2× true): pass-1/target-breedtes per box, absolute node-coördinaten, ELK-bendpoints vóór/na omrekening, container-offsets bij het verzamelen van lijnen | **verwijderen** (besloten) — de eindtoestand (bounds, bendpoints, nesting) staat in het archimate-bestand. Wat verloren gaat zijn tussenwaarden (pass-1 natuurlijke breedte, target); die zijn reproduceerbaar door elk.js in Node op de testview te draaien. De `⚠ MISMATCH`-regels van alignByLevel worden nu al altijd gelogd en blijven; de `⚠ [edge-collect] … offset forced to (0,0)`-waarschuwing wordt onvoorwaardelijk |
| `params.viewSizeMode` | stand van de radio's | intern, ok |
| `engineParams.{ELK,Dagre,Graphviz,layout}` | expert-overrides (14 sleutels, elk 1–2 presets) | preset-only houden. **Let op:** `Dagre.acyclicer` gaat door dezelfde `Number()`-bug → NaN |
| `relatedElements.steps[].diagramTypes` | GUI schrijft altijd `[]`, pipeline leest het niet | **dood** → uit schema en validatePreset |
| `action`, `_lastTabIndex` | sessiestate, maar lekt via Save naar 28–32 presets | **lek** → `writePreset` schrijft alleen schemavelden + description |
| `view.name` | wordt bij openen altijd overschreven door het eerste geselecteerde object | in de preset zinloos; zie 0.5 |

**Kandidaten om uit de GUI te halen.** Criterium (besloten): **geen of minimaal effect op de view.** Hoe vaak een waarde in presets voorkomt, telt niet: Dagre is nog onvoldoende getest en presets zeggen daar niets over.

| param | effect op de view | advies |
|---|---|---|
| `diagramPadding` | alleen de afstand van het hele diagram tot de oorsprong van het canvas. Archi heeft geen canvasrand, dus layout en vorm veranderen niet | **verbergen**, vaste default |
| `connectionElementSpacing` | afstand van een lijn tot de elementen waar hij langs loopt | **houden** (besloten, in gebruik) |
| `ranking`, `acyclicer` (Dagre) | veranderen de laagindeling / de breuk van cycli → zichtbaar | **houden**; acyclicer-bug fixen |
| `labelPosition` | plaats van het lijnlabel → zichtbaar | houden |
| `padding`, `connectionSpacing`, `nodePlacement`, `sortContainers`, `alignWidthSameType`, `snapColumnsToGrid`, `labelSizing`, … | zichtbaar | houden |

**Advies:** wenselijk, maar de winst is klein: 1 control (Diagram padding). De echte vereenvoudiging komt uit fase 1, waar params verdwijnen die voor het gekozen algoritme *niets* doen terwijl de GUI ze actief toont: `innerSpacing` (opgeheven), `elementSpacing` bij Grid/Pack (dood), `connectionSpacing` bij Dot (dood), `reverseRelationTypes` bij Twopi (geen effect), `maxWidth` bij Graphviz, en "Cycles", dat nooit werkte. Voorwaarden voor verbergen:
1. Een verborgen param blijft in `DEFAULT_PRESET` en `validatePreset`, zodat een preset hem kan overschrijven (net als `engineParams`).
2. Een afwijkende verborgen waarde wordt bij het genereren gelogd ("Preset values not in dialog: diagramPadding=20"), zodat hij niet onzichtbaar meespeelt.
3. ARCHITECTURE.md krijgt een tabel *Preset-only parameters*.

### 0.5 Hoofdvenster (presetrij, Generated view, actieknoppen) — analyse en advies

**Huidig:** `Delete | Preset: [combo] * | Save | Save As…` → tabs → groep *Generated view* (Folder, Name, totalen) → `[Cancel] [Create new view: New view, One view each] [Modify selected view: Expand view, Layout only]`.

Bevindingen:
1. **Gevaarlijk:** Name wordt altijd gevuld met het eerste geselecteerde object. Bij *Expand view* / *Layout only* met een Name die afwijkt van de geselecteerde view kopieert generate_view de view naar Folder/Name en verwijdert een bestaande view met die naam ([generate_view.js:209-226](Scripts/View/lib/generate_view.js#L209-L226)). Selecteer je een element op het canvas, dan heet het doel "naam van het element" in `/Views/_Generated`. De gebruiker ziet nergens dat "Modify selected view" een kopie maakt. (In Archi verifiëren.)
2. Folder/Name staan los tussen de tabs en de knoppen, terwijl ze alleen voor *New view* gelden. Bij *One view each* wordt Name genegeerd, bij Modify zou het genegeerd moeten worden.
3. *Delete* staat links vooraan als eerste knop van het venster: destructief en zonder visuele scheiding.
4. Bij openen toont de combo de presetnaam uit de sessie, maar de waarden zijn de (mogelijk gewijzigde) sessiewaarden, zonder `*`. "Ongewijzigd" klopt dan niet.
5. *Save As* overschrijft een bestaande preset met dezelfde naam zonder te waarschuwen. `movePreset` (rename/verplaatsen) bestaat in preset_io, maar heeft geen GUI.
6. De description is alleen zichtbaar als tooltip van de combo.
7. Cancel staat links in een groep met een lege titel `" "`. Gebruikelijk is rechts, los van de acties.
8. Uitgeschakelde Modify-knoppen zeggen niet waarom.
9. De header-comment van dialog_main noemt een "⚙ gear menu" dat niet meer bestaat. `buttonPressed` en `_runAction` dupliceren de ACTION_MAP.

**Advies — nieuwe indeling:**
```
Preset: [ folder/name ▼ ] *   [Save] [Save As…] [⋯ ▼ Rename… / Delete]
        <description, 1 regel grijs>
┌ tabs ───────────────────────────────────────────────┐
└─────────────────────────────────────────────────────┘
On the generated view: 12 elements · 3 containers · 18 connections
┌ Create new view ─────────────────┐ ┌ Modify view: "<naam>" ──┐
│ Folder [/Views/_Generated]       │ │ [Expand view]           │
│ Name   [Business Actor X]        │ │ [Layout only]           │
│ [New view]  [One view each]      │ │ (works on this view in  │
└──────────────────────────────────┘ │  place)                 │
                                     └─────────────────────────┘
                                                      [Cancel]
```
- Folder/Name in de groep *Create new view*. Modify werkt **altijd in place** (`preset.view.name` wordt bij Modify niet gebruikt), dus het kopieer-en-verwijderpad verdwijnt uit generate_view. De titel van de Modify-groep toont de doelview; uitgeschakeld → tooltip "Select a view, or elements on a view, first."
- *One view each* → tooltip "Names each view after its element; Name is ignored."
- Totaalregel boven de actiegroepen: hij geldt voor beide.
- Delete en een nieuwe *Rename…* (hergebruik `openSaveAs` + `movePreset`) in een `⋯`-menu, of rechts na Save As met een scheiding.
- Description als grijze regel onder de presetrij.
- Bij openen: de sessie vergelijken met de opgeslagen preset en zo nodig `*` tonen.
- Save As: bestaande naam → `window.confirm("Overwrite …?")`.
- Dialogtitel/-boodschap: "Generate View" / "Choose what to include (Selection), how to arrange it (Layout), then an action below."

### 0.6 Docs
De capability-matrix in ARCHITECTURE.md is verouderd t.o.v. `activeParams`: bevat verwijderde rijen (*Max height*, *Node size by edge count*), mist rijen (nodePlacement, connectionSpacing, connectionElementSpacing, connectionLabelSpacing, nestingContainerTypes, diagramPadding), en wijkt per cel af (Padding bij Dagre/Dot/Neato/FDP ✓ terwijl defs dat niet heeft; Twopi in "Circular" terwijl defs "Hierarchy" zegt). Ook de algoritme-tooltiptabel, de ASCII-mockup (Size by label in Nesting, defaults 10/10) en de Nesting-tabel lopen achter.

---

## Fase 1 — Registry en engines rechtzetten (defs.js + engines)

1. **Dagre acyclicer** repareren: `DEFAULT_DAGRE_PARAMS` niet door `Number()` halen en vóór de mapping mergen (mapping wint); "Default" = DFS echt laten werken.
2. **innerSpacing opheffen** (besloten): Grid/Pack mappen `elementSpacing` (root + container) op `elk.spacing.nodeNode` (+ de bestaande compaction-opties); `padding` blijft de rand binnen een container (al gemapt via `_PAD_CONTAINER`). Graphviz: `padding` toevoegen aan `PARAMS_GV_CLUSTER` en gebruiken voor zowel de clustermarge van Dot/FDP (`graph [margin]`, [graphviz.js:141](Scripts/View/lib/engines/graphviz.js#L141)) als de kaders die we zelf afleiden voor Neato ([graphviz.js:325](Scripts/View/lib/engines/graphviz.js#L325), nu altijd 20). `innerSpacing` verdwijnt uit `DEFAULT_PRESET`, activeParams, GUI en `_colSnap` (`options.innerSpacing || options.elementSpacing`). Migratie via [test/migrate_presets.ajs](Scripts/View/test/migrate_presets.ajs) (16 presets): Grid/Pack-presets `innerSpacing` → `elementSpacing`, overige: key verwijderen. Geen legacy-fallback in `validatePreset`.
3. **Graphviz maxWidth uitzetten** (besloten): `PARAMS_VIEW_SIZE` vervangen door alleen `aspectRatio` bij Dot/Neato/FDP/SFDP/Twopi/Circo; `_applySpread` + `maxWidth`-pad in graphviz.js verwijderen (het enige wat het deed was uitspreiden, als de layout smaller was dan de waarde).
3b. **Dot**: `connectionSpacing` uit activeParams (geen mapping); `connectionElementSpacing` alleen houden als dot `sep`/`esep` echt gebruikt (verifiëren op graphviz.org, anders weg).
4. **Twopi**: `reverseRelationTypes` uit activeParams.
5. **containerAlgorithm**: `validatePreset` zet ongeldige waarde (ook de default) op `supportedOptions[0]`; Tree krijgt geldige default.
6. **alignDebug**: verwijderen (zie fase 2b.2).
7. **ROUTING-tooltips** in defs corrigeren (Splines = alleen Layered; Polyline ≠ "all algorithms").

## Fase 2 — Koppeling GUI ↔ defs (load/save)

1. `_mergePreset`: preset volledig overnemen (geen behoud van inactieve sessiewaarden), of alleen sleutels behouden die *ontbreken* in de preset-JSON.
2. Spinner/combo-defaults in de builders uit `DEFAULT_PRESET.params` halen.
3. `_syncToUI` fallbacks weg (validatePreset garandeert waarden).
4. Dode `buttonPressed`-ACTION_MAP verwijderen; één pad via `_runAction`.
5. Zelf-check (Node-script, read-only op defs): elke key in elke `activeParams` bestaat in `DEFAULT_PRESET.params` en heeft een widget-key in een `PARAM_WIDGETS`-tabel; elke `supportedOptions`-key is actief.

## Fase 2b — Minder params in de GUI (zie 0.4)

1. `HIDDEN_PARAMS` in defs: `diagramPadding`. Blijft in activeParams/DEFAULT_PRESET (de engine gebruikt hem); de GUI slaat hem over en `_saveUI` laat de presetwaarde ongemoeid.
2. `alignDebug` verwijderen: uit `PARAMS_ELK_NESTING`, `DEFAULT_PRESET`, elk.js (`debugLog`-pad, regels ~417/491/525-537/1000-1004/1143-1150), engine-utils `alignWidthsByLevel(…, debugLog)`, generate_view (`_dbgW`, `_dbg`). De edge-collect-waarschuwing onvoorwaardelijk maken. ARCHITECTURE.md: korte notitie "Debugging: inspect the result in the .archimate file; intermediate values via elk.js in Node (see view-testing)". Migratie verwijdert de sleutel uit de presets.
3. Log van afwijkende verborgen waarden in generate_view.
4. `steps[].diagramTypes` uit schema/validatePreset/_saveUI; `writePreset` filtert sessievelden (`action`, `_*`); migratiescript schoont de 39 presets op.

## Fase 3a — Indeling hoofdvenster (zie 0.5)

1. `_buildViewRow` + `_buildActionRow` samenvoegen tot totaalregel + groep *Create new view* (Folder, Name, New view, One view each) + groep *Modify view: "<naam>"* + Cancel rechts.
2. generate_view: bij EXPAND_VIEW/LAYOUT_ONLY `preset.view.name` negeren (in place); het kopieer- en verwijderpad vervalt.
3. Presetrij: Save, Save As…, `⋯`-menu (Rename…, Delete); description-regel; `*` bij openen bepalen; overschrijfwaarschuwing in Save As.
4. Header-comment bijwerken; dode `buttonPressed`-ACTION_MAP weg.

## Fase 3b — Indeling Layout-tab (verbetervoorstellen)

Leidraad: volgorde = volgorde van beslissen; één plek per concept. **Inactief gedrag (besloten): grijs + hint-regel.** Elke groep krijgt onderaan een label (`w.hint<Group>`) dat alleen zichtbaar is (via `exclude`, zoals `_updateNestContainerBox`) als ≥1 control in de groep inactief is: *"Not used by Force: Direction, Ranking, …"* of, als de hele groep inactief is, *"Not used by Force."*. Tekst gegenereerd uit `activeParams` + een tabel param → GUI-label (dezelfde tabel als de zelfcheck in fase 2.5). Containers-groep: hint *"Check a relation type under 'Show as container' first."* als er geen nesting-type is aangevinkt.

Voorgestelde groepen:
1. **Algorithm** (ongewijzigd, radiotabel per stijl).
2. **Relations** — twee checkbox-grids naast/onder elkaar: *Show as container* (nu Nesting) en *Reverse for layout* (nu in Flow). Beide zijn "per relatietype"-keuzes; reverse beïnvloedt ook de nesting-ouder. Container types-combo eronder.
3. **Containers** — container layout, connections mode, padding, en de vier checkboxen. Alleen zichtbaar/actief als er een nesting-type aangevinkt is.
4. **Flow** — direction, placement, cycles, ranking, layer gap (layer spacing verhuist hierheen: het is een flow-begrip).
5. **Elements** — width, height, by label + wrap-breedte, gap.
6. **Connections** — routing, label, reserve label space, between, to element.
7. **View size** — aspect ratio / max width (alleen ELK) / none. Diagram padding is verborgen.

Verder: twee checkbox-rijen in Containers in een 2×2 met korte labels; "Inside container"-separator vervalt (de groep heet al zo).

## Fase 4 — Labels

| nu | voorstel | reden |
|---|---|---|
| Elements › Max width (label-wrap) | Wrap at | botst met View › Max width |
| Spacing › Layer | Flow › Layer gap (Radial/Twopi: tooltip "ring distance") | concept hoort bij Flow |
| Spacing › Element | Gap | rij-kop zegt al "Spacing" |
| Reversed - draw these relation types in other direction | Reverse for layout | tekenrichting verandert níet (richting is intrinsiek), alleen de layout-volgorde en nesting-ouder |
| Draw these relation types as containers | Show as container | korter, zelfde vorm als "Reverse for layout" |
| Container layout / Connections | Layout inside / Connections | groep heet al Containers |
| Align widths by level | Same width per level | |
| View dimensions | View size | |
| Diagram padding | Margin | |
| Selection: "Filter selection by element type:" | gelijk trekken met de andere twee "(none = keep all)" | inconsistent |
| Appearance: "relationships" | "relations" | vocabulaire-regel ai/rules.md #11 |

## Fase 5 — Tooltips

1. Eén formaat, elk deel op een eigen regel (`\n`):
   ```
   <wat het doet>
   <eenheid / bereik, bv. "px, 0 = off">
   <Used by: Layered, Tree, Dagre>
   ```
   Max. 3 korte regels; geen lopende zinnen over meerdere onderwerpen.
2. "Geldt voor"-deel genereren uit `activeParams` (helper `_activeIn(param)`), zodat tooltips nooit meer van defs afwijken.
3. Inhoudelijke correcties: Cycles ("Greedy" ≠ "fewest edges"; het is een heuristiek), Splines/Polyline, Snap columns (tooltip zegt "gaps tightened", docs zeggen "median nudge" — engine controleren en één versie kiezen), Max width (Graphviz-zin weg, nu ELK-only), Inner spacing vervalt, Padding ("space between container border and its contents — all engines with containers").
4. Spelfouten Appearance: "which colors is used" → "which colors are used", "whose selected property have" → "has".
5. Algoritme-tooltips in `ALGORITHMS[*].tooltip` gelijktrekken met `supportsNesting` (Neato "partial" vs "cluster").

## Fase 6 — Docs

1. Capability-matrix in ARCHITECTURE.md regenereren uit `activeParams` (Node-script dat de markdown-tabel print; rijnamen = GUI-labels uit fase 4).
2. Mockup, Elements/Flow/Connections/Nesting/View-tabellen en algoritme-tooltiptabel bijwerken naar fase 3–5.

---

## Kritieke bestanden
- [Scripts/View/lib/defs.js](Scripts/View/lib/defs.js) — registry, DEFAULT_PRESET, validatePreset
- [Scripts/View/lib/gui/dialog_main.js](Scripts/View/lib/gui/dialog_main.js) — `_buildLayoutTab`, `_syncToUI`, `_saveUI`, `_updateAlgorithmControls`, `_mergePreset`
- [Scripts/View/lib/engines/dagre.js](Scripts/View/lib/engines/dagre.js), [elk.js](Scripts/View/lib/engines/elk.js) (PARAM_MAPPING Grid/Pack), [graphviz.js](Scripts/View/lib/engines/graphviz.js) (PARAM_MAPPING, clusterMargin, padding)
- [Scripts/View/test/migrate_presets.ajs](Scripts/View/test/migrate_presets.ajs) + `user_parameter/*.json`
- [Scripts/View/ARCHITECTURE.md](Scripts/View/ARCHITECTURE.md)

## Verificatie
- Node-zelfcheck (fase 2.5) en matrixgenerator (fase 6.1) draaien zonder afwijkingen.
- elk.js in Node op de testviews in `.git/temp.archimate` (zie reference_view_testing): Grid/Pack met gewijzigde spacing vóór/na vergelijken.
- In Archi via `_gui.ajs`: per stijl één algoritme kiezen, controleren dat alleen relevante controls zichtbaar/actief zijn; preset laden → opslaan → JSON diffen (geen vreemde waarden); Dagre met Cycles = Greedy vs Default geeft verschillende `acyclicer` in de log.
- Elke fase is een eigen commit; na fase 1 eerst de bevindingen laten bevestigen voordat fase 3 start.
