load(__DIR__ + "../../_lib/selection.js");
load(__DIR__ + "../../_lib/archi_folders.js");
load(__DIR__ + "../../_lib/Common.js");

const PROP_ID = "Object ID";
const PROP_IV3 = "domein-iv3";
const PROP_GGM_GEMMA = "Latest GGM GEMMA sync";
const GGM_ID = "ggm-guid";
const FOLDER_NAME = "GGM bedrijfsobjecten";
const currentDate = new Date().toLocaleDateString("nl-NL");

function copyProp(from, to) {
  to.documentation = from.documentation;
  from.prop().forEach((curProperty) => {
    if (curProperty != PROP_ID) {
      to.prop(curProperty, from.prop(curProperty));
    }
  });
  to.prop(PROP_GGM_GEMMA, `Op ${currentDate} gesynchroniseerd. Wijzigingen via het GGM model, wijzigingen in GGM ArchiMate-model worden overgeschreven`);
  return;
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
