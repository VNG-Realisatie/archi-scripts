# View: regels op één plek

## Context

De View-regels staan nu twee keer: SPEC § 11 (20 regels, functioneel) en `Scripts/View/AGENTS.md` § Hard rules (9 regels, "operational form" met code- en enginedetail). Ook SPEC § 14 (Development rules) en de regel "one owner per fact" in ARCHITECTURE § Division zijn regels. Elke wijziging moet de regels kennen, maar SPEC is groot. De werkafspraak "Each rule exists once, at the most specific place where it is needed; elsewhere link to it" (`~/ai/shared/AGENTS.md`) vraagt één plek.

Komt uit `plan/view-background-table.md` § Vervolg (blok 3). Voert uit vóór stap 10 daarvan, zodat de nieuwe regel 1 meteen op zijn eindplek komt.

## Besluiten (gebruiker, 2026-11-22)

- **Plek:** `Scripts/View/AGENTS.md` § Hard rules. Dat bestand wordt bij elke wijziging in `Scripts/View/` gelezen, en de Division-tabel noemt het al eigenaar van "binding rules". Geen nieuw bestand.
- **Reikwijdte:** de 20 regels van SPEC § 11, de regels van SPEC § 14 (schema migration, logging) en de regel "one owner per fact" uit ARCHITECTURE § Division.
- **Detail:** een regel is functioneel. Het operationele detail (typenamen, engine-opties, flags) staat bij zijn onderwerp in `docs/reference/` of ARCHITECTURE, en de regel linkt ernaar.

## Doelstructuur

**`Scripts/View/AGENTS.md`**
- § Hard rules: de regels op thema, zoals SPEC § 11 nu (Layout integrity, Engine isolation, Writer discipline, Determinism & validation, Vocabulary & naming, Option semantics), plus een thema *Development* met schema migration (21) en logging (22). Nummers 1–20 blijven zoals in SPEC, zodat de meeste verwijzingen alleen hun bron wijzigen.
- Kop: "No exceptions beyond those a rule names" (regel 18 noemt zijn uitzonderingen zelf).
- Voorrang: de regels gaan voor SPEC; SPEC gaat voor `docs/reference/` en ARCHITECTURE wat betreft gedrag.
- Logging (22) neemt alleen het View-eigen deel over (wat de console per run en per view toont, met een link naar `reference/engines.md` § Console and log file). "What happened, its effect and what to do" staat al in repo-`AGENTS.md` § Conventions: daarnaar linken.
- § Docs: de regel "one owner per fact; others link to it, never restate it", als View-uitwerking van de werkafspraak, met een link naar de Division-tabel. "Preset files are plain JSON" blijft.

**`docs/SPEC.md`**
- Inleiding: niet meer "self-contained"; de regels staan in `Scripts/View/AGENTS.md` § Hard rules. "On a conflict this document wins" wordt: de regels gaan voor, daarna SPEC.
- § 11: één zin met een link. De kop blijft, zodat de nummering van §§ 12–14 gelijk blijft.
- § 13: "rules 1, 3, 11 and 12" linkt naar de regels.
- § 14: schema migration en logging vervallen (nu regels 21–22); de bullet "Rule hierarchy" vervalt (staat in de inleiding). Is § 14 leeg, dan vervalt hij en wordt § 13 de laatste.
- Body: waar een regel woordelijk herhaald wordt, komt een link (View rule N) en blijft alleen het gedrag staan. Kandidaten: § 3 *Boundary rules*, § 5 *The single writer rule*, § 8 *No post-layout scaling* en *Adapter obligations*, § 9 de regel over labels (regel 18–20), § 10 "exempt from the no-scaling rule". Per geval kiezen: gedrag blijft, de herhaalde regel gaat eruit.

**Operationeel detail van de huidige hard rules**

| Hard rule nu | Detail | Naar |
|---|---|---|
| 1 | `LayoutResult`-leafmaat = `LayoutGraph`-invoer; Graphviz `size=` verboden | `reference/engines.md` § Layout graph and result; § Graphviz-feit zoals in het tabelplan (§ Regel 1) |
| 3 | Geen Archi-API, selectie of preset in een adapter | Is regel 5–6; detail al in SPEC § 3 Boundary 2 |
| 5 | `parentMap` bepaalt container-zijn | `reference/engines.md` § Layout graph and result |
| 6 | Geen `reversed`-/draw-direction-flag; bendpoints in andere volgorde: vergelijk de uiteinden van de modelrelatie | ARCHITECTURE § Writer (besluit + waarom) |
| 9 | Labels, één betekenis, alleen eigen engine-opties | Is SPEC § 9 + regel 18–20; niets extra |
| "Archi draws elements at their exact pixel size" (waarom van 1) | | ARCHITECTURE § Sizing |

**ARCHITECTURE**
- § Division: de inleidende regelzin wordt een link naar `Scripts/View/AGENTS.md` § Docs; de tabel blijft. Rij `Scripts/View/AGENTS.md`: "Binding rules (§ Hard rules) and the doc process". "On a conflict SPEC.md wins" volgt de nieuwe voorrang.

**Verwijzingen** (rule 3: alles in dezelfde commit, geen alias)
- "SPEC rule N" → "View rule N" met link naar `Scripts/View/AGENTS.md` § Hard rules; "Scripts/View/AGENTS.md (hard) rule N" → het nieuwe nummer. "repo rule N" blijft.
- Plekken (grep `SPEC (§ 11 )?rules? [0-9]|AGENTS\.md (hard )?rule|hard rule [0-9]|#11-rules`, plannen niet): `docs/ARCHITECTURE.md` (18), `Scripts/View/AGENTS.md`, `docs/architecture-model/architecture_model.js` (ook de beschrijving van SPEC op r. 87), `lib/engines/elk.js`, `lib/write_plan.js`, `tools/layout_checks.js`, `tools/preset_test.js`, `tools/write_plans.js`, `tools/rules_test.js` (kop "§ 11").
- Repo-`AGENTS.md` § Routing: "View subsystem: rules · what · …" klopt al (rules = `Scripts/View/AGENTS.md`).
- SPEC § Reference en `repo-guide.md`: nakijken, niets verwacht.

## Uitvoering

Blok 4 (Sonnet 5.5) van `plan/view-background-table.md`, vóór stap 10:

1. Regels naar `Scripts/View/AGENTS.md` § Hard rules, met de huidige SPEC-tekst; detail naar reference/ARCHITECTURE volgens de tabel.
2. SPEC § 11, § 13, § 14, inleiding en de body-herhalingen; ARCHITECTURE § Division.
3. Verwijzingen bijwerken; daarna levert de grep alleen nog nieuwe vormen op.
4. Controle: SPEC-body ≤ 550 regels; geen technologienamen in de SPEC-body (grep, AGENTS § Writing SPEC); elke regel komt één keer voor (grep op een kernzin per regel); `npm run typecheck` en `node Scripts/View/tools/rules_test.js` groen.
5. Eigen commit `docs(View): rules in one place`. Geen gedragswijziging, dus geen Archi-check.

Daarna stap 10 van het tabelplan: de nieuwe regel 1 (§ Regel 1) komt in `Scripts/View/AGENTS.md` § Hard rules, niet in SPEC.
