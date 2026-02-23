/**
 * Shared constants and functions for exporting and importing
 */
const Papa = require("papaparse");
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");

// define a mapping object with PROP_ADD as an extra column
const PROP_ADD = "add column to export";

// If set, the import wil use the PROP_ID as the first id for matching objects (global type var, because const is block scoped)
const PROP_ID = "Object ID"; // set default tool independent identifier.

// Extra column labels voor export
const FOLDER_LABEL = "archi folder"; 
const GEMMA_PUBLICEREN_TOT_EN_MET_LABEL = "Publiceren tot en met";
const GEMMA_LIST_API_LABEL = "SWC API";

const GEMMA_PUBLICEREN_VALUES = [
  "Niet",
  "Redactie",
  "GEMMA Online en redactie",
  "Softwarecatalogus en GEMMA Online en redactie",
];

// labels for creating CSV column labels
const ATTRIBUTE_LABELS = ["name", "type", "documentation", "id"];
// if set, the RELATION_ATTRIBUTES will be imported and exported
// this will add 3 compulsory CSV column labels
const ASSOCIATION_DIRECTED = "associationDirected";
const RELATION_ATTRIBUTE_LABELS = ["accessType", ASSOCIATION_DIRECTED, "influenceStrength"];

const ENDPOINT_LABELS = _get_ENDPOINT_LABELS();
function _get_ENDPOINT_LABELS() {
  let labels = ["source.name", "source.type", "target.name", "target.type", "source.id", "target.id"];
  if (PROP_ID) {
    labels = labels.concat([`source.prop.${PROP_ID}`, `target.prop.${PROP_ID}`]);
  }
  return labels;
}

// labels to skip when updating objects
// - don't import the attribute type (can't be set) and
// - don't import the attribute id (can't be set) and
// - don't import the endpoints (used for finding the relation)
const COLUMNS_NOT_TO_IMPORT = ["type", "id", FOLDER_LABEL]
  .concat(ENDPOINT_LABELS)
  .concat(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL)
  .concat(GEMMA_LIST_API_LABEL);

/**
 * set an attribute or property to the value from the CSV file
 */
function set_attr_or_prop(object, row, label) {
  if (ATTRIBUTE_LABELS.indexOf(label) != -1 || RELATION_ATTRIBUTE_LABELS.indexOf(label) != -1) {
    if (label == ASSOCIATION_DIRECTED && object.type == "association-relationship") {
      object[label] = _parseBool(row[label]);
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
  Common.debugStackPush(false);
  let value = "";

  // get attribute, for instance "documentation", "name",
  if (ATTRIBUTE_LABELS.indexOf(row_label) != -1 || RELATION_ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
    Common.debug(`row_label = ${row_label}`);
    Common.debug(`archi_object = ${archi_object}`);
    Common.debug(`archi_object.name = ${archi_object.name}`);
    Common.debug(`archi_object[row_label] = ${archi_object[row_label]}`);
    if (row_label == ASSOCIATION_DIRECTED) {
      if (archi_object.type == "association-relationship") {
        value = archi_object[row_label].toString();
      }
    } else {
      value = archi_object[row_label];
    }
    Common.debug(`attr archi_object.${row_label}=${value}`);
  } else if (_get_ENDPOINT_LABELS().indexOf(row_label) != -1) {
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
      Common.debug(`endpoint archi_object[${endpoint}].prop(${prop})=${value}`);
    } else {
      value = archi_object[endpoint][attr];
      Common.debug(`endpoint archi_object[${endpoint}][${attr}]=${value}`);
    }
  } else {
      // get property, for instance 'Object ID'
      value = archi_object.prop(row_label);
      Common.debug(`prop archi_object.prop(${row_label})=${value}`);
  }

  Common.debugStackPop();
  return value;
}

function _parseBool(value) {
  if (typeof value === "string") {
    value = value.replace(/^\s+|\s+$/g, "").toLowerCase();
    if (value === "true" || value === "false") return value === "true";
  }
  return; // returns undefined
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    Papa,
    PROP_ADD,
    PROP_ID,
    GEMMA_PUBLICEREN_TOT_EN_MET_LABEL,
    GEMMA_LIST_API_LABEL,
    GEMMA_PUBLICEREN_VALUES,
    ATTRIBUTE_LABELS,
    RELATION_ATTRIBUTE_LABELS,
    FOLDER_LABEL,
    ENDPOINT_LABELS,
    ASSOCIATION_DIRECTED,
    COLUMNS_NOT_TO_IMPORT,
    set_attr_or_prop,
    get_attr_or_prop,
  };
}
