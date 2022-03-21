/**
 * include_export_import.js
 *
 * Functions for exporting and importing model elements, relations and view properties
 */

load(__DIR__ + "../_lib/papaparse.min.js");

const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_VIEW = "view";

// The property PROP_ID is used as a tool independent identifier.
const PROP_ID = "Object ID";

// labels for creating CSV column labels
const ATTRIBUTE_LABELS = ["name", "type", "documentation", "id"];
const ENDPOINT_LABELS = [
  "source.name",
  "source.type",
  "target.name",
  "target.type",
  "source.id",
  `source.prop.${PROP_ID}`,
  "target.id",
  `target.prop.${PROP_ID}`,
];

// Leave empty if you don't want a 'folder' column
const FOLDER_LABEL = "Folder";

// Leave empty if you don't want GEMMA special columns
const PUBLICEREN_TOT_EN_MET = "Publiceren tot en met";
const GEMMA_PUBLICEREN_LABELS = [
  "Niet",
  "Redactie",
  "GEMMA Online en redactie",
  "Softwarecatalogus en GEMMA Online en redactie",
];

// labels to skip when updating objects
// - don't import the attribute type  (can't be set) and
// - don't import the attribute id (can't be set) and
// - don't import the endpoints (used for finding the relation)
const LABELS_NOT_TO_UPDATE = ["type", "id", FOLDER_LABEL]
  .concat(ENDPOINT_LABELS)
  .concat(PUBLICEREN_TOT_EN_MET)
  .concat(GEMMA_PUBLICEREN_LABELS);

//////////////////////////////////////////////////////////////////////////////////////////
/**
 * set an attribute or property to the value from the CSV file
 */
function set_attr_or_prop(object, row, label) {
  if (ATTRIBUTE_LABELS.indexOf(label) != -1) {
    object[label] = row[label];
  } else {
    object.prop(label, row[label]);
  }
}

/**
 * get the given attribute or property value of an Archi object
 */
function get_attr_or_prop(archi_object, row_label) {
  debugStackPush(false);
  let value = "";

  // get attribute, for instance "documentation", "name",
  if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
    debug(`row_label = ${row_label}`);
    debug(`archi_object = ${archi_object}`);
    debug(`archi_object.name = ${archi_object.name}`);
    debug(`archi_object[row_label] = ${archi_object[row_label]}`);
    value = archi_object[row_label];
    debug(`attr archi_object.${row_label}=${value}`);
  } else if (ENDPOINT_LABELS.indexOf(row_label) != -1) {
    // get endpoint label, for instance source.id, target.prop.Object ID
    // const [endpoint, attr, prop] = row_label.split("."); // GRAALVM only
    const endpoint = row_label.substring(0, row_label.indexOf("."));
    const secondSubString = row_label.substring(row_label.indexOf(".") + 1, row_label.lastIndexOf("."));
    if (secondSubString == "prop") {
      var prop = row_label.substring(row_label.lastIndexOf(".") + 1);
    } else {
      var attr = row_label.substring(row_label.lastIndexOf(".") + 1);
    }

    if (secondSubString == "prop") {
      value = archi_object[endpoint].prop(prop);
      debug(`endpoint archi_object[${endpoint}].prop(${prop})=${value}`);
    } else {
      value = archi_object[endpoint][attr];
      debug(`endpoint archi_object[${endpoint}][${attr}]=${value}`);
    }
  } else {
    // get property, for instance 'Object ID'
    value = archi_object.prop(row_label);
    debug(`prop archi_object.prop(${row_label})=${value}`);
  }

  debugStackPop();
  return value;
}
