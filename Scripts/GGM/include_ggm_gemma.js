/**
 * GGM - GEMMA functions
 *
 * run from multiple (test)scripts
 *
 * todo
 * - genereren Object ID voor nieuwe objecten
 * - PROP_OBJECT_ID_SYNC - (nw) Object ID in BD->BO rel en bewaar dit in BD->DO relatie
 */

const PROP_ID = "Object ID";
const PROP_GGM_ID = "GGM-guid"; // property with original GGM-guid in business-objects
const PROP_GGM_ID_IMPORTED = "GGM-guid-imported"; // property with original GGM-guid in data-objects. different property name for ggm_import.ajs script
const PROP_OBJECT_ID_SYNC = "Object ID sync"; // property to find and sync beleidsdomein aggregations
const PROP_GGM_SYNC = "Let op";
const PROP_SPECIALIZATON = "Meer specifiek";
const PROP_GEMMA_URL = "GEMMA URL";

const PROP_GGM_NAAM = "GGM-naam"; // 	Naam van het objecttype
const PROP_GGM_DEFINITIE = "GGM-definitie"; // 	samenvattende omschrijving van de kenmerken van het object
const PROP_GGM_TOELICHTING = "GGM-toelichting"; // 	Aanvullende toelichting op de definitie
const PROP_GGM_SYNONIEMEN = "GGM-synoniemen"; // 	Alternatieve naam met min of meer dezelfde betekenis (meerdere mogelijk, comma separated)
const PROP_GGM_BRON = "GGM-bron"; // 	Extern informatiemodel waaruit GGM de definities heeft overgenomen
const PROP_GGM_UML_TYPE = "GGM-uml-type"; // Het in het GGM UML model gebruikt type, zoals class of enumeration
const PROP_GGM_GUID = "GGM-guid"; // 	Uniek en niet wijzigend id van het object
const PROP_ARCHIMATE_TYPE = "ArchiMate-type";

const GEMMA_URL = "https://gemmaonline.nl/index.php/GEMMA2/0.9/id-"; // publicatie-omgeving
// const GEMMA_URL = "https://redactie.gemmaonline.nl/index.php/GGM/id-"; // voor testen GGM import naar redactie.

const REALIZATION_LABEL = "realiseert bedrijfsobject";
const FOLDER_SYNC_GGM = "/_Sync GEMMA en project/GGM";

/**
 * Create or update a business object for every GGM data-object
 * - if prop ArchiMate-type="business-object"
 * - copy properties
 * - if duplicate name, create unique name in property Alternate-name with a postfix '(<beleidsdomein>)'
 * - create realization-relation from data-object to business object
 */
function updateBusinessObjects(dataObjects, businessObjectFolder, relsFolder, stats) {
  let processBusinessObjectsColl = $();
  console.log(`Created business-object:`);
  dataObjects
    .filter((dataObject) => dataObject.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((dataObject) => {
      let businessObject = $("business-object")
        .filter((obj) => obj.prop(PROP_GGM_ID) == dataObject.prop(PROP_GGM_ID_IMPORTED))
        .first();
      if (businessObject) {
        console.log(`> update ${businessObject}`);
        stats.nr_update += 1;
      } else {
        businessObject = model.createElement("business-object", dataObject.name, businessObjectFolder);
        // create a realization relation between the GGM data-object and created business object
        realizationRel = model.createRelationship(
          "realization-relationship",
          REALIZATION_LABEL,
          dataObject,
          businessObject,
          relsFolder
        );
        realizationRel.prop(PROP_GGM_SYNC, "Gegenereerd met ggm-gemma.ajs");

        console.log(`> create ${businessObject}`);
        stats.nr_create += 1;
      }
      updateObjectProp(dataObject, businessObject);
      addPropSpecializations(dataObject, businessObject);
      addPropGEMMA_URL(businessObject);

      processBusinessObjectsColl.add(businessObject);
    });

  addPropAlternateName(processBusinessObjectsColl);
  addPropGEMMA_URL(processBusinessObjectsColl);

  console.log();
  return;

  // document specialization-relations in property
  function addPropSpecializations(dataObject, businessObject) {
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
 * Create or update relations between business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateRelationsBusinessObject(dataObjects, relsFolder, stats) {
  debugStackPush(false);
  let index = [];

  console.log(`\nCopie data-object relations to business-object relations`);

  // process all GGM data-object relations
  dataObjects
    .rels()
    .filter((rel) => !(rel.type == "realization-relationship" && rel.name == REALIZATION_LABEL))
    .filter((rel) => rel.source.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .filter((rel) => rel.target.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((rel) => {
      // check if relation is already processed
      if (!index.some((r) => r.id == rel.id)) {
        index.push(rel);

        let businessRel = $(rel.type)
          .filter((bRel) => bRel.prop(PROP_GGM_ID) == rel.prop(PROP_GGM_ID_IMPORTED))
          .filter((bRel) => bRel.source.type == "business-object")
          .first();
        if (businessRel) {
          console.log(`> update ${printRelation(businessRel)}`);
          updateObjectProp(rel, businessRel);
          stats.nr_update += 1;
        } else {
          let source = find_GGM_GEMMA_object(rel.source);
          let target = find_GGM_GEMMA_object(rel.target);

          if (source && target) {
            let businessRel = model.createRelationship(rel.type, rel.name, source, target, relsFolder);
            updateObjectProp(rel, businessRel);

            console.log(`> create ${printRelation(businessRel)}`);
            stats.nr_create += 1;
          }
        }
      }
    });
  debugStackPop();
}

/**
 * Create or update beleidsdomein grouping for business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateRelationBeleidsdomein(dataObjects, relsFolder, stats) {
  console.log(`\nCopy Beleidsdomein-aggregations to business-object relations`);

  // process beleidsdomein relations
  dataObjects
    .rels("aggregation-relationship")
    .filter((rel) => rel.target.prop(PROP_ARCHIMATE_TYPE) == "Business object")
    .each((rel) => {
      // find copy aggregation with business-object
      let relBeleidsdomein = $("aggregation-relationship")
        .filter((aggrRel) => aggrRel.prop(PROP_OBJECT_ID_SYNC) == rel.prop(PROP_ID))
        .filter((aggrRel) => aggrRel.target.type == "business-object")
        .first();

      if (relBeleidsdomein) {
        console.log(`> update ${printRelation(relBeleidsdomein)}`);
        updateObjectProp(rel, relBeleidsdomein);
        stats.nr_update += 1;
      } else {
        let target = find_GGM_GEMMA_object(rel.target);
        if (target) {
          relBeleidsdomein = model.createRelationship(rel.type, rel.name, rel.source, target, relsFolder);
          updateObjectProp(rel, relBeleidsdomein);
          relBeleidsdomein.prop(PROP_OBJECT_ID_SYNC, rel.prop(PROP_ID));
          console.log(`> create ${printRelation(relBeleidsdomein)}`);
          stats.nr_create += 1;
        }
        // move to sync folder
      }
      relsFolder.add(relBeleidsdomein);
    });
  console.log();
}

/**
 * Copy GGM properties to the GEMMA bedrijfsobjecten and relations
 */
function updateObjectProp(from, to) {
  // update objects attributes and properties
  // Save these attribute and property value if current GEMMA value is different
  updateAttribute("name", "GGM-naam");
  updateAttribute("documentation", "GGM-definitie");

  updateProperty("GGM-toelichting", "Toelichting");
  updateProperty("GGM-bron", "Bron");

  // copy these properties from GGM
  to.prop(PROP_GGM_ID, from.prop(PROP_GGM_ID_IMPORTED));
  to.prop("GGM-uml-type", from.prop("GGM-uml-type"));
  to.prop("GGM-synoniemen", from.prop("GGM-synoniemen"));
  to.prop("GGM-datum-tijd-export", from.prop("Datum-tijd-export"));

  // Skip
  //  PROP_ID // Object ID, data- and bedrijfsobject have their own PROP_ID
  //  PROP_ARCHIMATE_TYPE
  //  "Latest Sync Date"

  // association relation are directed (show 'half' arrow in views)
  if (from.type == "association-relationship") {
    to.associationDirected = from.associationDirected;
  }
  // add a warning in every created object
  to.prop(PROP_GGM_SYNC, `"GGM-" properties worden beheerd in het GGM informatiemodel`);
  return;

  function updateAttribute(attribute, boProp) {
    if (to[attribute].trim() == "") {
      to[attribute] = from[attribute].trim();
    } else {
      if (to[attribute].trim() != from[attribute].trim()) {
        to.prop(boProp, from[attribute].trim());
      }
    }
  }

  function updateProperty(ggmProp, gemmaProp) {
    if (from.prop(ggmProp)) {
      if (!to.prop(gemmaProp)) {
        to.prop(gemmaProp, from.prop(ggmProp).trim());
      } else {
        if (to.prop(gemmaProp).trim() != from.prop(ggmProp).trim()) {
          to.prop(ggmProp, from.prop(ggmProp).trim());
        }
      }
    }
  }
}

/**
 * Find objects with duplicate name
 *  and add a property with a unique name
 */
function addPropAlternateName(archiObjColl) {
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
  const duplicate_Array = objectNameArray.filter((entry) => lookup[entry.objKey]).sort(sortObjName);

  // append suffix
  console.log(`Alternate name for duplicates`);
  if (duplicate_Array.length > 0) {
    duplicate_Array.forEach((item) => {
      // find grouping beleidsdomein
      let relBeleidsdomein = $(item.archiObj)
        .inRels("aggregation-relationship")
        .filter((rel) => rel.source.type == "grouping")
        .filter((rel) => rel.source.prop("GEMMA type") == "Beleidsdomein");

      if (relBeleidsdomein.size() == 1) {
        let alternateName = `${item.archiObj.name} (${relBeleidsdomein.first().source.name})`;
        console.log(`- ${item.archiObj.name} > ${alternateName}`);
        // item.archiObj.name = alternateName;
        item.archiObj.prop("Alternate name", alternateName);
      } else {
        console.log(
          `Warning: ${item.archiObj} does not have 1 'beleidsdomein'. Found relation(s): ${relBeleidsdomein}`
        );
      }
    });
  } else console.log(`- geen`);

  /**
   * sort entries on objKey
   */
  function sortObjName(a, b) {
    if (a.objKey < b.objKey) return -1;
    if (a.objKey > b.objKey) return 1;
    return 0;
  }
}

// add property met GEMMA online URL
function addPropGEMMA_URL(archiObj) {
  if (!archiObj.prop(PROP_ID)) {
    archiObj.prop(PROP_ID, generateUUID());
  }
  archiObj.prop(PROP_GEMMA_URL, GEMMA_URL + archiObj.prop(PROP_ID));
}

/**
 * return the from the data-object created business-object
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

function printRelation(rel, debug) {
  if (debug) {
    return `${rel.source} --${rel.name}--> ${rel.target} (${rel.type.replace("-relationship", "")})`;
  } else {
    if (rel.name) {
      return `${rel.source.name} --${rel.name}--> ${rel.target.name}`;
    } else {
      return `${rel.source.name} --${rel.type.replace("-relationship", "")}--> ${rel.target.name}`;
    }
  }
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}

/**
 * generateUUID()
 * 	return a generated UUID
 * 	from : https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
 */
function generateUUID() {
  // Public Domain/MIT
  var d = new Date().getTime(); //Timestamp
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.random() * 16; //random number between 0 and 16
    r = (d + r) % 16 | 0;
    d = Math.floor(d / 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}
