/**
 * jbsarrodie/ConvertConcept.lib.js
 * https://gist.github.com/jbsarrodie/45a312cff559d23cf55ed102422e8af7
 *
 * #jArchi script to change concepts' type (and optionally convert no more valid relationships to association)
 *
 * This script make it really easy to convert concepts (element or relationship) from one type to another.
 * It also takes care of relationships involving the concept been converted: if after the conversion some
 * relationships are no more valid, it will (optionally) convert them to associations.
 *
 * Mark:
 *  - no popup, only relaxed mode
 *  - try to minimize conversion of relations to associations
 *    - when both source and target are converted
 *      - try to restore the converted relation to the original type
 *      - works for example for aggregations between elements of same type
 *  - still converted relation have a property with original relation type
 *  - and are shown in the console with a red warning
 */

console.show();
console.clear();

const ORG_TYPE_PROPERTY_NAME = "Type before conversion";
const CONVERT_TO_TYPE = "association-relationship";

function convertConcept(selection, filename) {
  try {
    let convertToType = getTypeFromFilename(filename);

    console.log(`Convert selected objects to ${convertToType}\n`);
    console.log(`Objects:`);

    // convert selected objects
    $(selection).each(function (o) {
      // first convert invalid relation types to associations
      $(concept(o))
        .outRels()
        .each(function (r) {
          if (!$.model.isAllowedRelationship(r.type, convertToType, r.target.type)) convertRelationType(r);
        });
      $(concept(o))
        .inRels()
        .each(function (r) {
          if (!$.model.isAllowedRelationship(r.type, r.source.type, convertToType)) convertRelationType(r);
        });
      // then convert the object
      concept(o).concept.type = convertToType;
    });

    // when possible, convert converted relations back to original type
    $(selection).each(function (o) {
      console.log(`> ${o}`);
      $(concept(o))
        .rels(CONVERT_TO_TYPE)
        .filter((r) => hasProperty(r, ORG_TYPE_PROPERTY_NAME))
        .each((r) => convertBackRelationType(r));
    });

    console.log(`\nAll selected objects converted\n`);
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
}

function hasProperty(r, ORG_RELATION_TYPE) {
  return r.prop(ORG_RELATION_TYPE) != undefined;
}

function convertRelationType(r) {
  r.prop(ORG_TYPE_PROPERTY_NAME, r.type);
  r.type = CONVERT_TO_TYPE;
}

function convertBackRelationType(r) {
  // console.log(`  > r: ${r}`);
  if ($.model.isAllowedRelationship(r.prop(ORG_TYPE_PROPERTY_NAME), r.source.type, r.target.type)) {
    r.type = r.prop(ORG_TYPE_PROPERTY_NAME);
    r.removeProp(ORG_TYPE_PROPERTY_NAME);
    // console.log(`    Restored: ${r.type} ${r.source} -> ${r.target}`);
  } else {
    console.error(`  > ${r.prop(ORG_TYPE_PROPERTY_NAME)} changed to type ${r.type}`);
    console.error(`    ${r.source} -> ${r.target}`);
  }
}

function getTypeFromFilename(filename) {
  return filename
    .replace(/^.*[\/\\]/, "")
    .replace(/\.ajs$/, "")
    .replace(/(%20|\s)/g, "-")
    .toLowerCase();
}

function concept(o) {
  return o.concept ? o.concept : o;
}
