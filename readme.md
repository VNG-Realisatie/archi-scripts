
Hier vind je de Archi scripts die worden gebruikt bij maken en onderhouden van het [GEMMA ArchiMate-model](https://github.com/VNG-Realisatie/GEMMA-Archi-repository) en VNG Realisatie projectarchitecturen (zie bijvoorbeeld de [omgevingswet](https://github.com/VNG-Realisatie/Omgevingswet-Archi-repository)).

Zie de pagina [Archi scripting](https://redactie.gemmaonline.nl/index.php/Archi_scripting) voor een handleiding installeren van de jArchi plugin.


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