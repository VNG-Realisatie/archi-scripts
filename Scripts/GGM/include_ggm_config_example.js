/**
 * Configuratie lokale folders
 *
 * Nog bepalen of werken met Teams share beter overdraagbaar is.
 * Bijvoorbeeld met gesynchroniseerde map
 * - C:/Users/marks/Vereniging van Nederlandse Gemeenten/Unit Architectuur en Standaarden - Documents/GEMMA ontwikkelstraat/GGM
 * - of kan gewezen worden naar GGM GitHub?
 */
console.log("Lezen configuratie lokale folders");

/**
 * Locatie GGM export bestanden
 *
 * als de var een 'null' waarde heeft, dan toont het script een 'open file' popup
 * zet voor herhaald importeren is het handig de filenaam te definiëren
 */
var GGM_CSV_DIR = __DIR__ + "../../../../Werkbestanden/GGM/Release 2.1/";
// var GGM_EXPORT_OBJECTS = GGM_CSV_DIR + "ggm_export_objects_12042024-12_57_38.csv"
// var GGM_EXPORT_OBJECTS = GGM_CSV_DIR + "ggm_export_objects_17042024-14_45_57.csv"
// var GGM_EXPORT_OBJECTS = GGM_CSV_DIR + "ggm_export_objects_14082024-08_34_36.csv"
var GGM_EXPORT_OBJECTS = null;

// var GGM_CONVERTED_RELATIONS = GGM_CSV_DIR + "gemma_import_relations (convert ggm) 2024-04-12.csv";
// var GGM_CONVERTED_RELATIONS = GGM_CSV_DIR + "gemma_import_relations (convert ggm 2.1).csv";
// var GGM_CONVERTED_RELATIONS = GGM_CSV_DIR + "2024-08-14 Converted relations 2.1.csv"
var GGM_CONVERTED_RELATIONS = null;

/**
 * Locatie van de lokale GEMMA-GGM archi-repository
 */
var GEMMA_GGM_REPO_DIR = "C:/Users/marks/Documents/Archi/model-repository/gemma-ggm-archi-repository/";
