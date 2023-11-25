/**
 * GGM - GEMMA functions
 *
 * run from multiple (test)scripts
 */
load(__DIR__ + "../../_lib/selection.js");
load(__DIR__ + "../../_lib/archi_folders.js");
load(__DIR__ + "../../_lib/Common.js");

const PROP_ID = "Object ID";
const PROP_GGM_ID = "ggm-guid";
const PROP_DATA_OBJECT_ID = "Object ID data-object";
const PROP_IV3 = "domein-iv3";
const PROP_GGM_GEMMA_DATE = "Latest GGM GEMMA sync";
const PROP_GGM_SYNC = "is GGM copy"
const PROP_SPECIALIZATON = "Meer specifiek";

const CURRENT_DATE = new Date().toLocaleDateString("nl-NL");

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
        .filter((obj) => obj.prop(PROP_GGM_ID) == dataObject.prop(PROP_GGM_ID))
        .first();
      if (businessObject) {
        console.log(`> update ${businessObject}`);
      } else {
        businessObject = model.createElement("business-object", dataObject.name, businessObjectFolder);

        // create a realization relation between the GGM data-object and created business object
        model.createRelationship("realization-relationship", REALIZATION_LABEL, dataObject, businessObject, relsFolder);
        processBusinessObjectsColl.add(businessObject);
        console.log(`> create ${businessObject}`);
      }
      copyProp(dataObject, businessObject);
      addPropSpecializations(dataObject, businessObject);
      processedDataObjects.add(dataObject);
    });

  console.log();
  return processBusinessObjectsColl;

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
function updateRelationsBusinessObject(dataObjects, relsFolder, processedRelations) {
  debugStackPush(false);
  let index = [];

  console.log(`\nCopie data-object relations to business-object relations`);

  // process all GGM data-object relations
  dataObjects
    .rels()
    .filter((rel) => !(rel.type == "realization-relationship" && rel.name == REALIZATION_LABEL))
    .filter((rel) => rel.source.prop("archimate-type") == "Business object")
    .filter((rel) => rel.target.prop("archimate-type") == "Business object")
    .each((rel) => {
      // check if relation is already processed
      if (!index.some((r) => r.id == rel.id)) {
        index.push(rel);

        let businessRel = $(rel.type)
          .filter((bRel) => bRel.prop(PROP_GGM_ID) == rel.prop(PROP_GGM_ID))
          .filter((bRel) => bRel.source.type == "business-object")
          .first();
        if (businessRel) {
          console.log(`> update ${printRelation(businessRel)}`);
          copyProp(rel, businessRel);
        } else {
          let source = find_GGM_GEMMA_object(rel.source);
          let target = find_GGM_GEMMA_object(rel.target);

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
              console.log(`> create ${printRelation(businessRel)}`);
            }
          }
        }
      }
    });
    debugStackPop();
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
 * Create or update iv3 grouping for business object
 * - copy relations from corresponding data-object
 * - copy properties
 */
function updateRelationsIv3(dataObjects, relsFolder, processedRelations) {
  console.log(`\nCopie iv3-domeinen aggregations to business-object relations`);

  // process iv3 relations
  dataObjects
    .rels("aggregation-relationship")
    .filter((rel) => rel.target.prop("archimate-type") == "Business object")
    .each((rel) => {
      // find copy aggregation with business-object
      let iv3Relation = $("aggregation-relationship")
        .filter((aggrRel) => aggrRel.prop(PROP_DATA_OBJECT_ID) == rel.prop(PROP_ID))
        .filter((aggrRel) => aggrRel.target.type == "business-object")
        .first();

      if (iv3Relation) {
        console.log(`> update ${printRelation(iv3Relation)}`);
        copyProp(rel, iv3Relation);
      } else {
        let target = find_GGM_GEMMA_object(rel.target);
        iv3Relation = model.createRelationship(rel.type, rel.name, rel.source, target, relsFolder);
        copyProp(rel, iv3Relation);
        iv3Relation.prop(PROP_DATA_OBJECT_ID, rel.prop(PROP_ID));
        processedRelations.add(iv3Relation);
        console.log(`> create ${printRelation(iv3Relation)}`);
      }
    });
  console.log();
}

/**
 * Copy GGM properties to the synchronised element/relation
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
  to.prop(PROP_GGM_GEMMA_DATE, CURRENT_DATE);
  to.prop(PROP_GGM_SYNC, `Wijzigingen worden overschreven, wijzigingen via het GGM model`); 
  return;
}

/**
 * Find duplicate objects and add a property with a unique name
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
  if (searchObject.prop(PROP_GGM_ID)) {
    // find created GEMMA bedrijfsobject
    foundObject = $("business-object")
      .filter((obj) => obj.prop(PROP_GGM_ID) == searchObject.prop(PROP_GGM_ID))
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
