/**
 * Shared constants and functions for exporting and importing
 */

load(__DIR__ + "../_lib/papaparse.min.js");

const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_VIEW = "view";

// Set the name of the property containing a tool independent identifier.
// If set, the import wil use the PROP_ID as the first id for matching objects
if (!PROP_ID) {
  var PROP_ID = "Object ID";
}

// labels for creating CSV column labels
const ATTRIBUTE_LABELS = ["name", "type", "documentation", "id"];
// if set, the RELATION_ATTRIBUTES will be imported and exported
// this will add 3 compulsory CSV column labels
const ASSOCIATION_DIRECTED = "associationDirected";
const RELATION_ATTRIBUTE_LABELS = ["accessType", ASSOCIATION_DIRECTED, "influenceStrength"];

let endpointLabels = ["source.name", "source.type", "target.name", "target.type", "source.id", "target.id"];
if (PROP_ID) {
  endpointLabels = endpointLabels.concat([`source.prop.${PROP_ID}`, `target.prop.${PROP_ID}`]);
}
const ENDPOINT_LABELS = endpointLabels;

// Set a label for a folder column, leave empty to skip the 'folder' column
const FOLDER_LABEL = "folder";
// const FOLDER_LABEL = "";

// set GEMMA_COLUMNS to false if you don't want GEMMA special columns for elements
const GEMMA_COLUMNS = false;
const GEMMA_PUBLICEREN_TOT_EN_MET_LABEL = "Publiceren tot en met";
const GEMMA_LIST_API_LABEL = "SWC API";
const GEMMA_PUBLICEREN_VALUES = [
  "Niet",
  "Redactie",
  "GEMMA Online en redactie",
  "Softwarecatalogus en GEMMA Online en redactie",
];

// labels to skip when updating objects
// - don't import the attribute type (can't be set) and
// - don't import the attribute id (can't be set) and
// - don't import the endpoints (used for finding the relation)
const LABELS_NOT_TO_UPDATE = ["type", "id", FOLDER_LABEL]
  .concat(ENDPOINT_LABELS)
  .concat(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL)
  .concat(GEMMA_LIST_API_LABEL);

/**
 * set an attribute or property to the value from the CSV file
 */
function set_attr_or_prop(object, row, label) {
  if (ATTRIBUTE_LABELS.indexOf(label) != -1 || RELATION_ATTRIBUTE_LABELS.indexOf(label) != -1) {
    if (label == ASSOCIATION_DIRECTED && object.type == "association-relationship") {
      object[label] = parseBool(row[label]);
    } else {
      object[label] = row[label];
    }
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
  if (ATTRIBUTE_LABELS.indexOf(row_label) != -1 || RELATION_ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
    debug(`row_label = ${row_label}`);
    debug(`archi_object = ${archi_object}`);
    debug(`archi_object.name = ${archi_object.name}`);
    debug(`archi_object[row_label] = ${archi_object[row_label]}`);
    if (row_label == ASSOCIATION_DIRECTED) {
      if (archi_object.type == "association-relationship") {
        value = archi_object[row_label].toString();
      }
    } else {
      value = archi_object[row_label];
    }
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

function parseBool(value) {
  if (typeof value === "string") {
    value = value.replace(/^\s+|\s+$/g, "").toLowerCase();
    if (value === "true" || value === "false") return value === "true";
  }
  return; // returns undefined
}
