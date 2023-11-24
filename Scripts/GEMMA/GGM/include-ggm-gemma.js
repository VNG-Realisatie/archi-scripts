load(__DIR__ + "../../_lib/selection.js");
load(__DIR__ + "../../_lib/archi_folders.js");
load(__DIR__ + "../../_lib/Common.js");

const PROP_ID = "Object ID";
const PROP_IV3 = "domein-iv3";
const PROP_GGM_GEMMA = "Latest GGM GEMMA sync";
const PROP_SPECIALIZATON = "Meer specifiek";
const GGM_ID = "ggm-guid";
const FOLDER_NAME = "GGM bedrijfsobjecten";
const currentDate = new Date().toLocaleDateString("nl-NL");

/**
 * Create or update a business object for every GGM data-object
 * - if prop archimate-type="business-object"
 * - copy properties
 * - if duplicate name, create unique name in property alternateName (or add postfix (domein-iv3))
 * - create realization-relation from data-object to business object
 */
function updateBusinessObjects(
  dataObjects,
  businessObjectFolder,
  relsFolder,
  processedDataObjects,
  processBusinessObjectsColl
) {
  console.log(`Created business-object:`);
  dataObjects
    .filter((dataObject) => dataObject.prop("archimate-type") == "Business object")
    .each((dataObject) => {
      let businessObject = $("business-object")
        .filter((obj) => obj.prop(GGM_ID) == dataObject.prop(GGM_ID))
        .first();
      if (businessObject) {
        console.log(`> update ${businessObject}`);
      } else {
        businessObject = model.createElement("business-object", dataObject.name, businessObjectFolder);

        // create a realization relation between the GGM data-object and created business object
        model.createRelationship("realization-relationship", REALIZATION_LABEL, dataObject, businessObject, relsFolder);
        processBusinessObjectsColl.add(businessObject);
        console.log(`> Create ${businessObject}`);
      }
      copyProp(dataObject, businessObject);
      documentSpecializations(dataObject, businessObject);
      processedDataObjects.add(dataObject);
    });

  console.log();
  return processBusinessObjectsColl;
}

function documentSpecializations(dataObject, businessObject) {
  // document specialization-relations in property
  let meerSpecifiek = "";
  $(dataObject)
    .inRels("specialization-relationship")
    .each((rel) => {
      if (meerSpecifiek) {
        meerSpecifiek += " ," + rel.source.name;
      } else {
        meerSpecifiek += rel.source.name;
      }
    });
  businessObject.prop(PROP_SPECIALIZATON, meerSpecifiek);
}

/**
 * Create or update relations between business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateRelations(dataObjects, relsFolder, processedRelations) {
  let index = [];

  console.log(`\nCopie data-object relations to business-object relations`);

  // process all GGM data-object relations
  dataObjects
    .rels()
    .not("folder")
    .filter((rel) => !(rel.type == "realization-relationship" && rel.name == REALIZATION_LABEL))
    .not("aggregation-relationship")
    .each((rel) => {
      // check if relation is already processed
      if (!index.some((r) => r.id == rel.id)) {
        index.push(rel);

        let businessRel = $(rel.type)
          .filter((bRel) => bRel.prop(GGM_ID) == rel.prop(GGM_ID))
          .filter((bRel) => bRel.source.type == "business-object")
          .first();
        if (businessRel) {
          console.log(`> update ${businessRel.source.name} --${businessRel.name}--> ${businessRel.target.name}`);
          copyProp(rel, businessRel);
        } else {
          let source = find_GGM_GEMMA_object(rel.source);
          let target = find_GGM_GEMMA_object(rel.target);
          // debug(`> ${source} --${rel.name}--> ${target}`);

          // ### fout #### aggregation verdubbelen
          if (source && target) {
            if (source.type == "data-object" || target.type == "data-object") {
              debug(`>>> SKIP relation with data-object ${source} --${rel.name}--> ${target}`);
            } else {
              let businessRel = model.createRelationship(rel.type, rel.name, source, target, relsFolder);
              copyProp(rel, businessRel);
              if (rel.type == "association-relationship") {
                businessRel.associationDirected = rel.associationDirected;
              }
              processedRelations.add(businessRel);
              console.log(`> create ${businessRel.source.name} --${businessRel.name}--> ${businessRel.target.name}`);
            }
          }
        }
      }
    });

  console.log(`\nCopie iv3-domeinen aggregations to business-object relations`);

  // process iv3 relations
  dataObjects.rels("aggregation-relationship").each((rel) => {
    // check if relation is already processed
    if (!index.some((r) => r.id == rel.id)) {
      index.push(rel);

      let target = find_GGM_GEMMA_object(rel.target);

      if (target) {
        if (target.type == "business-object") {
          businessRel = $("aggregation-relationship")
            .filter((bRel) => bRel.source.id == rel.source.id)
            .filter((bRel) => bRel.target.id == rel.target.id)
            .first();
          console.log(`> update ${businessRel.source} --${businessRel.name}--> ${businessRel.target}`);
          copyProp(rel, businessRel);
        } else {
          let businessRel = model.createRelationship(rel.type, rel.name, source, target, relsFolder);
          copyProp(rel, businessRel);
          processedRelations.add(businessRel);
          console.log(`> create ${businessRel.source.name} --${businessRel.name}--> ${businessRel.target.name}`);
        }
      }
    }
  });
  console.log();
}

/**
 * Copy GGM properties to the synchronised object
 * - new properties will be added
 * - update is overwrite
 * - no deletion of properties
 */
function copyProp(from, to) {
  to.name = from.name;
  to.documentation = from.documentation;
  from.prop().forEach((curProperty) => {
    if (curProperty != PROP_ID) {
      to.prop(curProperty, from.prop(curProperty));
    }
  });
  // maak 
  if (!to.prop(PROP_ID)) {

  }
  to.prop(
    PROP_GGM_GEMMA,
    `Op ${currentDate} gesynchroniseerd. Wijzigingen via het GGM model, wijzigingen in GGM ArchiMate-model worden overgeschreven`
  );
  return;
}

/**
 * Append a suffix after the name of duplicate objects
 */
function appendSuffix(archiObjColl) {
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
      let alternateName = `${item.archiObj.name} (${item.archiObj.prop(PROP_IV3)})`;
      console.log(`- ${item.archiObj.name} > ${alternateName}`);
      // item.archiObj.name = alternateName;
      item.archiObj.prop("alternate name", alternateName);
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

/**
 * return - if available - the created business-object replacing the data-object
 */
function find_GGM_GEMMA_object(searchObject) {
  let foundObject;
  if (searchObject.prop(GGM_ID)) {
    // find created GEMMA bedrijfsobject
    foundObject = $("business-object")
      .filter((obj) => obj.prop(GGM_ID) == searchObject.prop(GGM_ID))
      .first();
  }
  if (foundObject) {
    return foundObject;
  } else {
    // other object, like data-objects, groupings, etc
    return searchObject;
  }
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
