
Hier vind je de scripts die worden gebruikt voor het beheren van de GEMMA en VNG Realisatie projectarchitecturen.

Je kunt de scripts kopieëren naar je lokale Archi Scripts folder. Enkele scripts verwijzen naar elkaar. Het beste is om de archi-scripts repository te \'clonen\'. Zie voor de locatie van deze map Edit \> Preferences \> Scripting

    cd &lt;jArchi scripts folder&gt;
    git clone git@gitlab.com:vng-realisatie/architectuur/tools/archi-scripts.git


De repo bevat onder andere de volgende scripts:

-   GEMMA/SetObjectID
    -   Scripts om te controleren of alle objecten in een model een uniek Object ID hebben.
-   mergeElement
    -   Voeg 2 concepten (van hetzelfde type) samen tot één concept. Alle relaties, view-occurences en properties worden overgezet en blijven dus bewaard.
-   copyFormat
    -   selecteer in een view een object en draai dit script. Alle objecten op de view hebben nu dezelfde opmaak
-   Beheer/deleteUnusedElements
    -   Verwijderd alle concepten die niet op een view voorkomen.
-   ImportExport_CSV
    -   scripts voor het exporteren en weer importeren van elementen, relaties en views met alle hun properties
        -   export_element - selecteer een map, view of set van objecten en draai het script
        -   open de csv met LibreOffice Calc en bewerk de waarden van de properties (of voeg met een nieuwe kolom een property toe)
        -   import - gewijzigde properties worden bijgewerkt
    -   het gebruik is veilig
        -   exporteren leest je architectuurmodel alleen
        -   importeren kan in je model van alles overschrijven, maar een simpel Ctrl-z zet alles weer terug 
-   Appearance - scripts voor het in bulk wijzigen van views
    -   toggleFigure - toggle alle figures in één of meerdere views
    -   colorByProperty - wijzige de kleur van objecten op basis van de waarde van een te kiezen property
-   etc