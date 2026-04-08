const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");
const GEMMA = require(__SCRIPTS_DIR__ + "Scripts/GEMMA/include_GEMMA.js");

console.log("Loading include_ggm_gemma.js");

// folders in GEMMA ArchiMate-model
const FOLDER_SYNC_GGM = "/_Sync GEMMA en project/GGM";
const FOLDER_GGM_DATAOBJECT = "/Data-objecten (GGM)";
const FOLDER_GGM_BELEIDSDOMEIN = "/Beleidsdomeinen (GGM)";
const FOLDER_BELEIDSDOMEIN = "/Beleidsdomeinen";
const FOLDER_BEDRIJFSOBJECT = "/Bedrijfsobjecten";

const VIEW_NAME_SUFFIX = " (GGM)";

// GGM imported properties
const PROP_OBJECT_ID_SYNC = "Object ID sync"; // property to find and sync beleidsdomein aggregations
const PROP_GGM_ID = "GGM-guid"; // Uniek en niet wijzigend id van geïmporteerde GGM objecten
const PROP_GGM_ID_IMPORTED = "GGM-guid-imported"; // property with original GGM-guid in data-objects. different property name for ggm_import.ajs script
const PROP_GGM_NAAM = "GGM-naam"; // 	Naam van het objecttype
const PROP_GGM_DEFINITIE = "GGM-definitie"; // 	samenvattende omschrijving van de kenmerken van het object
const PROP_GGM_TOELICHTING = "GGM-toelichting"; // 	Aanvullende toelichting op de definitie
const PROP_GGM_SYNONIEMEN = "GGM-synoniemen"; // 	Alternatieve naam met min of meer dezelfde betekenis (meerdere mogelijk, comma separated)
const PROP_GGM_BRON = "GGM-bron"; // 	Extern informatiemodel waaruit GGM de definities heeft overgenomen
const PROP_GGM_UML_TYPE = "GGM-uml-type"; // Het in het GGM UML model gebruikt type, zoals class of enumeration
const PROP_GGM_TYPE = "GGM-type"; // toegevoegd type voor de in het GGM UML model aangeleverde beleidsdomeinen of iv3-domeinen
const PROP_GGM_DATUM_TIJD = "GGM-datum-tijd-export";

const PROP_GGM_SYNC = "Latest Sync Date";
const PROP_GGM_SYNC_DELETED = "Sync deleted";
const PROP_GGM_SYNC_CREATED = "Sync created";

const PROP_GGM_IMPORT = "Latest Import Date";
const PROP_GGM_IMPORT_DELETED = "Import deleted";
const PROP_GGM_IMPORT_CREATED = "Import created";

// GGM afgeleid gegeven
const PROP_SPECIALIZATON = "GGM-specialisaties";
const PROP_ALTERNATE_NAME = "Alternate name";

// GEMMA properties
const PROP_ID = "Object ID"; // property with GEMMA GUID, assigned to all objects and relations
const PROP_SYNC_WARNING = "Let op";
const PROP_ARCHIMATE_TYPE = "ArchiMate-type";
const PROP_BRON = "Bron";
const PROP_GEMMA_URL = "GEMMA URL";
const PROP_GEMMA_TYPE = "GEMMA type";
const PROP_GEMMA_GGM_STATUS = "GEMMA-GGM status";
const LABEL_DATUM_TIJD = "Datum-tijd-export"; // Label voor column met export datum

// Values
const GGM_MEMO_TEXT = "<memo>";
const GGM_TYPE_BELEIDSDOMEIN = "Beleidsdomein";
const GEMMA_URL = "https://gemmaonline.nl/index.php/GEMMA/id-"; // publicatie-omgeving
// const GEMMA_URL = "https://redactie.gemmaonline.nl/index.php/GGM/id-"; // voor testen GGM import naar redactie.
const REALIZATION_LABEL = "realiseert bedrijfsobject";
const GEMMA_TYPE_BELEIDSDOMEIN = "Beleidsdomein";
const GEMMA_TYPE_BEDRIJFSOBJECT = "Bedrijfsobject";
const GEMMA_TYPE_TE_BEPALEN = "te bepalen";
const GEMMA_GGM_STATUS_LEEG = "Leeg";
const GEMMA_GGM_STATUS_NIEUW = "Nieuw";

/**
 * Create or update a business object for every GGM data-object
 * - if prop ArchiMate-type="business-object"
 * - copy properties
 * - if duplicate name, create unique name in property Alternate-name with a postfix '(<beleidsdomein>)'
 * - create realization-relation from data-object to business object
 */
function updateBusinessObjects(dataObjects, businessObjectFolder, realizesBedrijfsobjectFolder, stats) {
  let updatedBusinessObjects = $();
  console.log(`\n===================================`);
  console.log(`Created and updated business-object:`);
  dataObjects
    .filter((dataObject) => dataObject.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((dataObject) => {
      let businessObject = $("business-object")
        .filter((obj) => obj.prop(PROP_GGM_ID) == dataObject.prop(PROP_GGM_ID_IMPORTED))
        .first();
      if (businessObject) {
        // update GEMMA with GGM properties
        console.log(`> update ${businessObject}`);
        if (_updateObjectProp(dataObject, businessObject)) {
          stats.nr_update += 1;
        } else {
          stats.nr_no_updates += 1;
        }
      } else {
        console.log(`> create business-object from ${dataObject}`);
        businessObject = model.createElement("business-object", dataObject.name, businessObjectFolder);
        // update GEMMA bedrijfsobject with GGM properties
        _updateObjectProp(dataObject, businessObject);
        // add a warning in every created object
        businessObject.prop(PROP_SYNC_WARNING, `"GGM-" properties worden beheerd in het GGM informatiemodel`);
        businessObject.prop(PROP_GEMMA_TYPE, GEMMA_TYPE_BEDRIJFSOBJECT);

        _createRealizationRel(dataObject, businessObject, realizesBedrijfsobjectFolder);

        stats.nr_create += 1;
      }

      // set GEMMA properties
      GEMMA.setObjectID([businessObject]);
      _addPropSpecializations(dataObject, businessObject);
      // GEMMA online URL
      businessObject.prop(PROP_GEMMA_URL, GEMMA_URL + businessObject.prop(PROP_ID));

      updatedBusinessObjects.add(businessObject);
    });
  console.log();
  return updatedBusinessObjects;

  // create a realization relation between the GGM data-object and created business object
  function _createRealizationRel(dataObject, businessObject, realizesBedrijfsobjectFolder) {
    let realizationRel = model.createRelationship(
      "realization-relationship",
      REALIZATION_LABEL,
      dataObject,
      businessObject,
      realizesBedrijfsobjectFolder,
    );
    // set realizationRel properties
    GEMMA.setObjectID([realizationRel]);
    realizationRel.prop(PROP_SYNC_WARNING, "Gegenereerd met GGM script");
  }

  // document specialization-relations in property
  function _addPropSpecializations(dataObject, businessObject) {
    let meerSpecifiek = "";
    $(dataObject)
      .inRels("specialization-relationship")
      .each((rel) => {
        if (meerSpecifiek) {
          meerSpecifiek += ", " + rel.source.name;
        } else {
          meerSpecifiek += rel.source.name;
        }
      });
    if (meerSpecifiek) {
      businessObject.prop(PROP_SPECIALIZATON, meerSpecifiek);
      console.log(`  > added property ${PROP_SPECIALIZATON}`);
    }
  }
}

/**
 * Delete business object for GGM data-object with changed ArchiMate-type
 */
function deleteBusinessObjects(dataObjects, stats) {
  Common.debugStackPush(false);
  console.log(`Delete business object for GGM data-object with changed ArchiMate-type:`);

  dataObjects
    .filter((dataObject) => dataObject.prop(PROP_ARCHIMATE_TYPE) == "Data object")
    .outRels("realization-relationship")
    .each((rel) => {
      Common.debug(`rel.target: ${rel.target}`);
      if (rel.name == REALIZATION_LABEL) {
        console.log(`> delete business-object ${rel.target}`);
        rel.target.delete();
        stats.nr_delete += 1;
      }
    });
  Common.debugStackPop();
}

/**
 * Create or update relations between business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateBusinessObjectRelations(dataObjects, relsFolder, stats) {
  Common.debugStackPush(false);
  let index = [];

  console.log(`\n=============================================================`);
  console.log(`Processing data-object relations to business-object relations`);

  // process all GGM data-object relations
  dataObjects
    .rels()
    .filter((rel) => !(rel.type == "realization-relationship" && rel.name == REALIZATION_LABEL))
    .filter((rel) => rel.source.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .filter((rel) => rel.target.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((rel) => {
      // check if relation is already processed
      Common.debug(`Processing relation ${rel} (${rel.type}) from ${rel.source} to ${rel.target})`);
      if (!index.some((r) => r.id == rel.id)) {
        index.push(rel);

        let businessRel = $(rel.type)
          .filter((bRel) => bRel.prop(PROP_GGM_ID) == rel.prop(PROP_GGM_ID_IMPORTED))
          .filter((bRel) => bRel.source.type == "business-object")
          .first();
        if (businessRel) {
          console.log(`> update ${Common.formatRelation(businessRel)}`);
          stats.nr_update += 1;
        } else {
          let source = find_GGM_GEMMA_object(rel.source);
          let target = find_GGM_GEMMA_object(rel.target);

          if (source && target) {
            businessRel = model.createRelationship(rel.type, rel.name, source, target, relsFolder);

            console.log(`> create ${Common.formatRelation(businessRel)}`);
            stats.nr_create += 1;
          }
        }
        if (businessRel) {
          _updateObjectProp(rel, businessRel);
          GEMMA.setObjectID([businessRel]);
          // add a warning in every created object
          businessRel.prop(PROP_SYNC_WARNING, `"GGM-" properties worden beheerd in het GGM informatiemodel`);
        }
      }
    });
  Common.debugStackPop();
}

/**
 * Create or update beleidsdomein grouping for business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateBeleidsdomeinRelations(dataObjects, relsFolder, stats) {
  console.log(`\n=============================================================`);
  console.log(`Processing Beleidsdomein-aggregations to business-object relations`);

  // process beleidsdomein relations
  dataObjects
    .rels("aggregation-relationship")
    .filter((rel) => rel.target.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((rel) => {
      // find copy aggregation with business-object
      let relBeleidsdomein = $("aggregation-relationship")
        .filter((bRel) => bRel.prop(PROP_OBJECT_ID_SYNC) == rel.prop(PROP_ID))
        .first();

      if (relBeleidsdomein) {
        console.log(`> update ${Common.formatRelation(relBeleidsdomein)}`);
        stats.nr_update += 1;
      } else {
        let target = find_GGM_GEMMA_object(rel.target);
        if (target) {
          relBeleidsdomein = model.createRelationship(rel.type, rel.name, rel.source, target, relsFolder);
          relBeleidsdomein.prop(PROP_OBJECT_ID_SYNC, rel.prop(PROP_ID));
          relBeleidsdomein.prop(PROP_SYNC_WARNING, "Gegenereerd met GGM script");
          console.log(`> create ${Common.formatRelation(relBeleidsdomein)}`);
          stats.nr_create += 1;
        }
      }
      if (relBeleidsdomein) {
        _updateObjectProp(rel, relBeleidsdomein);
        GEMMA.setObjectID([relBeleidsdomein]);
        // move to sync folder
        relsFolder.add(relBeleidsdomein);
        // init, verplaatsen naar create tak
        relBeleidsdomein.prop(PROP_GEMMA_TYPE, GEMMA_TYPE_BELEIDSDOMEIN);
      }
    });
  console.log();
}

/**
 * Update GEMMA bedrijfsobjecten and relations properties with GGM properties
 */
function _updateObjectProp(from, to) {
  // update objects attributes and properties
  let updatedFlag = false;

  // copy imported GGM_ID and GGM export date
  to.prop(PROP_GGM_ID, from.prop(PROP_GGM_ID_IMPORTED));
  to.prop(PROP_GGM_DATUM_TIJD, from.prop(LABEL_DATUM_TIJD));

  // update attribute and property to a GGM-property, keep the GEMMA value
  updatedFlag = _updateAttribute("name", PROP_GGM_NAAM);
  updatedFlag = _updateAttribute("documentation", PROP_GGM_DEFINITIE);
  updatedFlag = _updateProperty("Toelichting", PROP_GGM_TOELICHTING, updatedFlag);
  updatedFlag = _updateProperty(PROP_BRON, PROP_GGM_BRON, updatedFlag);
  updatedFlag = _updateProperty("Synoniemen", PROP_GGM_SYNONIEMEN, updatedFlag);

  // copy these properties from GGM
  updatedFlag = _copyProperty(PROP_GGM_UML_TYPE, updatedFlag);

  // beleidsdomein relaties
  updatedFlag = _updateProperty("Synoniemen", PROP_GGM_SYNONIEMEN, updatedFlag);

  // don't copy these properties to GEMMA bedrijfsobjecten
  // - PROP_ARCHIMATE_TYPE
  // - "Latest Sync Date"

  // association relation are directed (show 'half' arrow in views)
  if (from.type == "association-relationship") {
    to.associationDirected = from.associationDirected;
  }

  return updatedFlag;

  function _updateAttribute(attribute, ggmProp) {
    let updated = false;
    if (to[attribute].trim() == "" && from[attribute] != "") {
      console.log(`  > ${attribute}:\n  > new: ${from[attribute].trim()}`);
      to[attribute] = from[attribute].trim();
      updated = true;
    } else {
      if (to[attribute].trim() != from[attribute].trim()) {
        if (to.prop(ggmProp) != from[attribute].trim()) {
          console.log(`  > ${attribute}:`);
          console.log(`    > GEMMA ${attribute}: ${to[attribute].trim()}`);
          console.log(`    > GGM ${attribute}:   ${from[attribute].trim()}`);
          console.log(`    > previous ${ggmProp}:    ${to.prop(ggmProp) ? to.prop(ggmProp) : "none"}`);
          to.prop(ggmProp, from[attribute].trim());
          updated = true;
        }
      }
    }
    return updated;
  }

  function _updateProperty(gemmaProp, ggmProp, updated = false) {
    if (from.prop(ggmProp) && from.prop(ggmProp) != GGM_MEMO_TEXT) {
      if (!to.prop(gemmaProp)) {
        console.log(`  > ${gemmaProp}:`);
        console.log(`    > new: ${from.prop(ggmProp).trim()}`);
        to.prop(gemmaProp, from.prop(ggmProp).trim());
        updated = true;
      } else {
        if (to.prop(gemmaProp).trim() != from.prop(ggmProp).trim()) {
          // check if ggmProp is changed and log
          updated = _copyProperty(ggmProp, updated);
        }
      }
    }
    return updated;
  }

  function _copyProperty(property, updated = false) {
    if (from.prop(property)) {
      if (to.prop(property) != from.prop(property).trim()) {
        console.log(`  > ${property}:`);
        console.log(`    > from: ${to.prop(property)}`);
        console.log(`    > to:   ${from.prop(property).trim()}`);
        to.prop(property, from.prop(property).trim());
        updated = true;
      }
    }
    return updated;
  }
}

/**
 * Set view properties
 *  - GEMMA online view table filtering
 *  - publiceren
 */
function updateViewProp(view) {
  view.prop("Scope", "Gemeente");
  view.prop("Detailniveau", "Samenhang");
  view.prop("Viewtype", "Basis");
  view.prop("GEMMA thema", "Data");

  if (view.name.endsWith(VIEW_NAME_SUFFIX)) {
    view.prop(PROP_BRON, "GGM");
    view.prop("Architectuurlaag", "Applicatiearchitectuur");
  } else {
    // Bedrijfsobjectmodellen publiceren
    view.prop("Architectuurlaag", "Bedrijfsarchitectuur");
    view.prop(PROP_GEMMA_URL, GEMMA_URL + view.prop(PROP_ID));
  }
  view.prop("Publiceren", "GEMMA Online en redactie");
  view.removeProp("generate_view_param");
  // set property beleidsdomein
  view.removeProp("Beleidsdomein");
  $(view)
    .children("grouping")
    .filter((grouping) => grouping.prop(PROP_GEMMA_TYPE) == GEMMA_TYPE_BELEIDSDOMEIN)
    .each((grouping) => {
      if (view.prop("Beleidsdomein")) {
        view.prop("Beleidsdomein", `${view.prop("Beleidsdomein")}, ${grouping.name}`);
      } else {
        view.prop("Beleidsdomein", grouping.name);
      }
    });
  GEMMA.setObjectID([view]);
}

/**
 * Find objects with duplicate name
 *  and add a property with a unique name
 */
function updateAlternateName(archiObjColl) {
  // start without, delete prop alternateName
  archiObjColl.each((obj) => obj.removeProp(PROP_ALTERNATE_NAME));

  // find objects with equal names
  const duplicateNames = _findDuplicateNames(archiObjColl);

  // add property with alternate name (suffix Beleidsdomein)
  if (duplicateNames.length > 0) {
    duplicateNames.forEach((duplicateItem) => {
      // find grouping beleidsdomein
      let relBeleidsdomein = $(duplicateItem.archiObj)
        .inRels("aggregation-relationship")
        .filter((rel) => rel.source.type == "grouping")
        .filter((rel) => rel.source.prop(PROP_GEMMA_TYPE) == GEMMA_TYPE_BELEIDSDOMEIN);

      if (relBeleidsdomein.size() == 1) {
        let alternateName = `${duplicateItem.archiObj.name} (${relBeleidsdomein.first().source.name})`;
        Common.debug(`- ${duplicateItem.archiObj.name} > ${alternateName}`);
        // log als alternateName is gewijzigd
        console.log(`  > ${duplicateItem.archiObj.name} => ${alternateName}`);
        duplicateItem.archiObj.prop(PROP_ALTERNATE_NAME, alternateName);
      } else {
        console.log(
          `  > Warning: ${duplicateItem.archiObj} does not have 1 'beleidsdomein'. Found relation(s): ${relBeleidsdomein}`,
        );
      }
    });
  } else console.log(`- geen`);

  function _findDuplicateNames(archiObjColl) {
    let archiObjArray = [];
    archiObjColl.each((o) => archiObjArray.push(o));

    const objectNameArray = archiObjArray.map((obj) => ({ objKey: obj.name.toLowerCase(), archiObj: obj }));

    // create list of duplicates
    const lookup = objectNameArray.reduce((accumulator, entry) => {
      // reduce objects to lookup table with count of occurrences - 1
      accumulator[entry.objKey] = accumulator[entry.objKey] + 1 || 0;
      return accumulator;
    }, {});
    // If the lookup entry is 0 (false), it was only seen once and filter omits it from the result set, else it's kept
    return objectNameArray.filter((entry) => lookup[entry.objKey]).sort(_sortObjName);

    /**
     * sort entries on objKey
     */
    function _sortObjName(a, b) {
      if (a.objKey < b.objKey) return -1;
      if (a.objKey > b.objKey) return 1;
      return 0;
    }
  }
}

/**
 * Find the from the data-object created business-object
 */
function find_GGM_GEMMA_object(searchObject) {
  let foundObject;
  if (searchObject.prop(PROP_GGM_ID_IMPORTED)) {
    // find created GEMMA bedrijfsobject
    foundObject = $("business-object")
      .filter((obj) => obj.prop(PROP_GGM_ID) == searchObject.prop(PROP_GGM_ID_IMPORTED))
      .first();
  } else {
    console.log(`ERROR: searchobject=${searchObject} zonder "${PROP_GGM_ID_IMPORTED}"`);
  }
  return foundObject;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    FOLDER_SYNC_GGM,
    FOLDER_GGM_DATAOBJECT,
    FOLDER_GGM_BELEIDSDOMEIN,
    FOLDER_BELEIDSDOMEIN,
    FOLDER_BEDRIJFSOBJECT,
    VIEW_NAME_SUFFIX,
    PROP_OBJECT_ID_SYNC,
    PROP_GGM_ID,
    PROP_GGM_ID_IMPORTED,
    PROP_GGM_NAAM,
    PROP_GGM_DEFINITIE,
    PROP_GGM_TOELICHTING,
    PROP_GGM_SYNONIEMEN,
    PROP_GGM_BRON,
    PROP_GGM_UML_TYPE,
    PROP_GGM_TYPE,
    PROP_GGM_DATUM_TIJD,
    PROP_GGM_SYNC,
    PROP_GGM_SYNC_DELETED,
    PROP_GGM_SYNC_CREATED,
    PROP_GGM_IMPORT,
    PROP_GGM_IMPORT_DELETED,
    PROP_GGM_IMPORT_CREATED,
    PROP_SPECIALIZATON,
    PROP_ALTERNATE_NAME,
    PROP_ID,
    PROP_SYNC_WARNING,
    PROP_ARCHIMATE_TYPE,
    PROP_BRON,
    PROP_GEMMA_URL,
    PROP_GEMMA_TYPE,
    PROP_GEMMA_GGM_STATUS,
    LABEL_DATUM_TIJD,
    GGM_MEMO_TEXT,
    GGM_TYPE_BELEIDSDOMEIN,
    GEMMA_URL,
    REALIZATION_LABEL,
    GEMMA_TYPE_BELEIDSDOMEIN,
    GEMMA_TYPE_BEDRIJFSOBJECT,
    GEMMA_GGM_STATUS_LEEG,
    GEMMA_GGM_STATUS_NIEUW,
    updateBusinessObjects,
    deleteBusinessObjects,
    updateBusinessObjectRelations,
    updateBeleidsdomeinRelations,
    updateViewProp,
    updateAlternateName,
    find_GGM_GEMMA_object,
  };
}
