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
 *    - Retain the property 'Object ID' from the primary element and discard from the duplicates
 *    - Before merging an element, remove identical relations from the duplicates
 *    - delete the merged duplicates
 *
 * Versions
 *     2019 first version
 *     2021 use Archi merge method
 *  07 2022 Retain the property 'Object ID' from the primary element and discard from the duplicates
 *  06 2023 Select one or multiple elements, all these elements will be merged.
 *  06 2023 Also merge relations. Renamed from mergeElement to mergeConcept
 *  08 2024 Before merging an element, remove identical relations from the duplicates
 *
 * (c) 2019 Mark Backer
 */
const ArchiFolders = require(__SCRIPTS_DIR__ + "Scripts/_lib/archi_folders.js");
const Selection = require(__SCRIPTS_DIR__ + "Scripts/_lib/selection.js");
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");

const PROP_ID = "Object ID";

function mergeConcept(selectedConcepts, conceptType, propfunction) {
  console.log(`Selected concepts: ${selectedConcepts}`);
  try {
    if (model == null || model.id == null) {
      throw `Nothing selected. Select one or more ${conceptType}s, or select a view or a folder containing ${conceptType}s`;
    }

    // let selectedConcepts = Selection.getSelection($(selection), conceptType);
    console.log();
    let count = { merged: 0, noduplicates: 0, skipped: 0, duplicates: 0 };

    selectedConcepts.each((concept) => _mergeConcept(concept, count, propfunction));

    console.log(`Selected ${conceptType}s: ${selectedConcepts.size()}`);
    console.log(`- merged: ${count.merged}`);
    console.log(`- has no duplicates: ${count.noduplicates}`);
    console.log(`- selected ${conceptType} was deleted as a duplicate: ${count.skipped}`);
    console.log(`Duplicates merged and deleted: ${count.duplicates}`);
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
}

function _mergeConcept(selectedConcept, count, propfunction) {
  // check if the concept still exists in the model, can be deleted as a duplicate
  if (selectedConcept.model) {
    let original = Common.concept(selectedConcept);

    let duplicateList = _getDuplicates(original);
    if (duplicateList.size() > 0) {
      if ($(original).is(Common.OBJECT_TYPE_ELEMENT)) {
        console.log(`- ${original}`);
      }
      if ($(original).is(Common.OBJECT_TYPE_RELATION)) {
        let primaryName = `${original.name ? original.name : "no-name"}`;
        let primaryString = `${original.type}:  ${original.source.name}  ===${primaryName}==>  ${original.target.name}`;
        console.log(`- ${primaryString}`);
      }
      console.log(`    folder = ${ArchiFolders.printFolderPath(original)}`);
      console.log(`    id     = ${original.id}`);
      console.log(`  has duplicates:`);

      duplicateList.each((duplicate) => {
        console.log(`    folder = ${ArchiFolders.printFolderPath(duplicate)}`);
        console.log(`    id     = ${duplicate.id}`);

        _prepareProperties(original, duplicate);
        _prepareRelations(original, duplicate);

        original.merge(duplicate);
        duplicate.delete();
        count.duplicates += 1;
      });
      // remove newlines added by Archi merge method
      original.documentation = original.documentation.trim();
      // apply additional property function if provided
      if (propfunction) propfunction(original);

      console.log(`  > ${duplicateList.size()} duplicates merged and deleted\n`);
      count.merged += 1;
    } else {
      count.noduplicates += 1;
    }
  } else {
    count.skipped += 1;
  }
}

function _getDuplicates(original) {
  let duplicateList = $();

  if ($(original).is(Common.OBJECT_TYPE_ELEMENT)) {
    duplicateList = $(`.${original.name}`).filter(original.type).not($(original));
  }
  if ($(original).is(Common.OBJECT_TYPE_RELATION)) {
    duplicateList = $(original.type)
      .not($(original))
      .filter((rel) => filterRelationDuplicates(original, rel));
  }
  return duplicateList;

  function filterRelationDuplicates(primaryRel, dupRel) {
    if (
      primaryRel.type == dupRel.type &&
      primaryRel.source.id == dupRel.source.id &&
      primaryRel.target.id == dupRel.target.id &&
      primaryRel.name.trim() == dupRel.name.trim()
    )
      return true;
    else return false;
  }
}

function _prepareProperties(original, duplicate) {
  if (original.documentation && duplicate.documentation) {
    if (original.documentation.trim() == duplicate.documentation.trim()) {
      duplicate.documentation = ``;
    } else {
      console.log(`    - INFO; documentation of duplicate appended`);
    }
  }
  let duplicatePropList = duplicate.prop();
  duplicatePropList.forEach((property) => {
    if (property == PROP_ID) {
      if (original.prop(property)) {
        duplicate.removeProp(property);
      } else {
        console.log(`    - WARNING; added property ${PROP_ID} from duplicate`);
      }
    } else {
      if (original.prop(property)) {
        if (original.prop(property).trim() == duplicate.prop(property).trim()) {
          duplicate.removeProp(property);
        } else {
          console.log(`    - INFO; appended multiple properties "${property}"`);
        }
      }
    }
  });
}

function _prepareRelations(original, duplicate) {
  console.log("    - Delete duplicate incoming relation with objects:");
  $(original)
    .inRels()
    .each((rel) => {
      let duplicateInRels = $(duplicate)
        .inRels(rel.type)
        .filter((dupRel) => filterInRel(rel, dupRel));
      duplicateInRels.each((dupRel) => {
        console.log(`      - ${dupRel.source}`);
        dupRel.delete();
      });
    });

  console.log("    - Delete duplicate outgoing relation with objects:");
  $(original)
    .outRels()
    .each((rel) => {
      let duplicateOutRels = $(duplicate)
        .outRels(rel.type)
        .filter((dupRel) => filterOutRel(rel, dupRel));
      duplicateOutRels.each((dupRel) => {
        console.log(`      - ${dupRel.target}`);
        dupRel.delete();
      });
    });

  function filterInRel(rel, dupRel) {
    if (dupRel.source.id == rel.source.id && dupRel.name.trim() == rel.name.trim()) return true;
    return false;
  }
  function filterOutRel(rel, dupRel) {
    if (dupRel.target.id == rel.target.id && dupRel.name.trim() == rel.name.trim()) return true;
    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PROP_ID,
    mergeConcept,
  };
}
