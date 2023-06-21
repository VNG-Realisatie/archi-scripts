/*
 * merge all elements of the same type with the same name with to the selected element
 *
 * From the jArchi .merge method (https://github.com/archimatetool/archi-scripting-plugin/wiki/jArchi-Object#merge)
 *
 *     Existing diagram instances of the other Archimate element will be replaced with this element
 *     All source and target relationships of the other element are set to this element
 *     Documentatation of the other element is appended to this element's documentation
 *     Properites of the other element are appended to this element's properties
 *
 *     The other element is not deleted
 *
 * jArchi merge method always appends the documentation and property values of the merged element
 * - This script only appends if the documentation field or de propertie value is different
 * - This script deletes the merged elements
 *
 * (c) 2019 Mark Backer
 *
 * 2019: first version
 * 2021: use Archi merge method
 * july 2022: keep masters property PROP_ID
 */

// Label of the property with the ID
const PROP_ID = "Object ID";

/**
 * merge element with other other elements of same type and name
 */
function mergeElement(selectedElement) {
	// let master gives error in nashorn, but runs fine in graalvm
  var master = concept(selectedElement);

  const mergeList = $(`.${master.name}`).filter(master.type).not($(master));

  if (mergeList.size() == 0) {
    console.log(`There are no elements with the same name and type as "${master.name}"`);
  } else {
    console.log(`Selected master element "${master}" (id=${master.id})\n`);

		console.log(`Merge all elements with name "${master.name}" and type "${master.type}"`);
    console.log(`Merged element id's:`);
    mergeList.each(function (duplicate) {
      console.log(`- ${duplicate.id}`);

      // don't append documentation if documentation strings are equal
      master.documentation = master.documentation.trim();
      duplicate.documentation = duplicate.documentation.trim();
      if (duplicate.documentation == master.documentation) {
        // console.log(`  > documentation is equal, not appended to documentation of master`);
        duplicate.documentation = ``;
      } else {
        console.log(`  > documentation appended to documentation of master`);
      }
      var duplicatePropList = duplicate.prop();
      duplicatePropList.forEach((property) => {
        // remove property PROP_ID; only keep the PROP_ID of the master
        if (property == PROP_ID) {
          if (master.prop(property)) {
            duplicate.removeProp(property);
          } else {
            console.log(`  > WARNING; master didn't have property ${PROP_ID}, added from this element`);
          }
        } else {
          // remove properties equal to master properties from duplicate
          if (master.prop(property) == duplicate.prop(property)) {
            duplicate.removeProp(property);
          } else {
            if (master.prop(property)) {
              console.log(`  > WARNING; added property ${property}. Check property ${property} of master`);
            }
          }
        }
      });

      master.merge(duplicate);
      duplicate.delete();
    });
    // remove newlines added by Archi merge method
    master.documentation = master.documentation.trim();

    console.log(`\n${mergeList.size()} duplicates merged and deleted`);
  }
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}
