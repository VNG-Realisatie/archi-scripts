/*
 * Merge the selected (set of) concept(s) with its duplicates
 *  - duplicate elements have the same type and the same name
 *  - duplicate relations have the same type, source, target and name
 *  - the selected concepts are kept, the duplicates are merged and then deleted
 *
 * This script uses the jArchi .merge method
 *  - https://github.com/archimatetool/archi-scripting-plugin/wiki/jArchi-Object#merge
 *  - Existing diagram instances of the other Archimate element will be replaced
 *    with this element
 *  - All source and target relationships of the other element are set to this element
 *  - Documentatation of the other element is appended to this element's documentation
 *  - Properties of the other element are appended to this element's properties
 *  - Changed merge behavior of this script:
 *    - append the duplicates documentation only if the value is different
 *    - idem for properties
 *    - if the selected concept has a property Object ID, the Object ID's of duplicates are ignored
 *    - delete the merged duplicates
 *
 * Versions
 *     2019 first version
 *     2021 use Archi merge method
 *  07 2022 keep one property Object ID, drop the other Object ID's
 *  06 2023 Select one or multiple elements, all these elements will be merged.
 *  06 2023 Renamed from mergeElement to mergeConcept. Also merge relations
 *
 * (c) 2019 Mark Backer
 */
load(__DIR__ + "_lib/archi_folders.js");
load(__DIR__ + "_lib/selection.js");

const PROP_ID = "Object ID";
const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_ELEMENT = "element";

initConsoleLog(__FILE__);

function mergeElementOrRelation(conceptType) {
  try {
    if (model == null || model.id == null) {
      throw `Nothing selected. Select one or more ${conceptType}s, or select a view or a folder containing ${conceptType}s`;
    }

    let selectedConcepts = getSelection($(selection), (selector = conceptType));
    console.log()
    let count = { merged: 0, noduplicates: 0, skipped: 0, duplicates: 0 };
  
    selectedConcepts.each((concept) => mergeConcept(concept, count));
  
    console.log(`Selected ${conceptType}s: ${selectedConcepts.size()}`);
    console.log(`- merged: ${count.merged}`);
    console.log(`- has no duplicates: ${count.noduplicates}`);
    console.log(`- selected ${conceptType} was deleted as a duplicate: ${count.skipped}`);
    console.log(`Duplicates merged and deleted: ${count.duplicates}`);
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
}

finishConsoleLog();

/**
 * merge a concept with its duplicates
 */
function mergeConcept(selectedConcept, count) {
  // check if the concept still exists in the model, can be deleted as a duplicate
  if (selectedConcept.model) {
    let primary = concept(selectedConcept);

    let duplicateList = getDuplicates(primary);
    if (duplicateList.size() > 0) {
      if ($(primary).is(OBJECT_TYPE_ELEMENT)) {
        console.log(`- ${primary}`);
      }
      if ($(primary).is(OBJECT_TYPE_RELATION)) {
        let primaryName = `${primary.name ? primary.name : "no-name"}`;
        let primaryString = `${primary.type}:  ${primary.source.name}  ===${primaryName}==>  ${primary.target.name}`;
        console.log(`- ${primaryString}`);
      }
      console.log(`    folder = ${printFolderPath(primary)}`);
      console.log(`    id     = ${primary.id}`);
      console.log(`  has duplicates:`);

      duplicateList.each((duplicate) => {
        console.log(`    folder = ${printFolderPath(duplicate)}`);
        console.log(`    id     = ${duplicate.id}`);

        prepareProperties(primary, duplicate);

        primary.merge(duplicate);
        duplicate.delete();
        count.duplicates += 1;
      });
      // remove newlines added by Archi merge method
      primary.documentation = primary.documentation.trim();

      console.log(`  > ${duplicateList.size()} duplicates merged and deleted\n`);
      count.merged += 1;
    } else {
      count.noduplicates += 1;
    }
  } else {
    // console.log(`Already merged concept ${selectedConcept}`);
    count.skipped += 1;
  }
}

function getDuplicates(primary) {
  let duplicateList = $();

  if ($(primary).is(OBJECT_TYPE_ELEMENT)) {
    duplicateList = $(`.${primary.name}`).filter(primary.type).not($(primary));
  }
  if ($(primary).is(OBJECT_TYPE_RELATION)) {
    duplicateList = $(primary.type)
      .not($(primary))
      .filter((rel) => filterRelationDuplicates(rel));
  }
  return duplicateList;

  function filterRelationDuplicates(rel) {
    if (primary.source.id == rel.source.id && primary.target.id == rel.target.id && primary.name.trim() == rel.name.trim())
      return true;
    else return false;
  }
}

function prepareProperties(primary, duplicate) {
  // don't append documentation if documentation strings are equal
  if ((primary.documentation) && (duplicate.documentation)) {
    if (primary.documentation.trim() == duplicate.documentation.trim()) { 
      // console.log(`    - documentation is equal, not appended`);
      duplicate.documentation = ``;
    } else {
      console.log(`    - INFO; documentation of duplicate appended`);
    }
  }

  // merge primary properties with duplicate properties
  let duplicatePropList = duplicate.prop();
  duplicatePropList.forEach((property) => {
    if (property == PROP_ID) {
      // remove property PROP_ID; only keep the PROP_ID of the primary
      if (primary.prop(property)) {
        duplicate.removeProp(property);
      } else {
        console.log(`    - WARNING; added property ${PROP_ID} from duplicate`);
      }
    } else {
      // remove properties equal to primary properties from duplicate
      if (primary.prop(property)) {
        if (primary.prop(property).trim() == duplicate.prop(property).trim()) {
          duplicate.removeProp(property);
        } else {
          console.log(`    - INFO; appended multiple properties "${property}"`);
        }
      }
    }
  });
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
