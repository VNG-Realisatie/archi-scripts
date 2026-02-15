/**
 * Shared constants and functions for exporting and importing
 */
const Papa = require("papaparse");
const Common = require(__DIR__ + "/../_lib/Common.js");

const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_VIEW = "view";

// define a mapping object with PROP_ADD as an extra column
const PROP_ADD = "add column to export";

// If set, the import wil use the PROP_ID as the first id for matching objects (global type var, because const is block scoped)
var PROP_ID = "Object ID"; // set default tool independent identifier.

// Set a label for a folder column, leave empty to skip the 'folder' column
var FOLDER_LABEL = "folder"; // default create a folder column 'folder'

// set GEMMA_COLUMNS to false if you don't want GEMMA special columns for elements
var GEMMA_COLUMNS = false; // default do not create the GEMMA columns

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

function get_ENDPOINT_LABELS() {
  let labels = ["source.name", "source.type", "target.name", "target.type", "source.id", "target.id"];
  if (PROP_ID) {
    labels = labels.concat([`source.prop.${PROP_ID}`, `target.prop.${PROP_ID}`]);
  }
  return labels;
}

function get_LABELS_NOT_TO_UPDATE() {
  return ["type", "id", FOLDER_LABEL]
    .concat(get_ENDPOINT_LABELS())
    .concat(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL)
    .concat(GEMMA_LIST_API_LABEL);
}

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
  } else if (get_ENDPOINT_LABELS().indexOf(row_label) != -1) {
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

function parseBool(value) {
  if (typeof value === "string") {
    value = value.replace(/^\s+|\s+$/g, "").toLowerCase();
    if (value === "true" || value === "false") return value === "true";
  }
  return; // returns undefined
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    Papa,
    OBJECT_TYPE_RELATION,
    OBJECT_TYPE_ELEMENT,
    OBJECT_TYPE_VIEW,
    PROP_ADD,
    get PROP_ID() { return PROP_ID; },
    set PROP_ID(val) { PROP_ID = val; },
    get FOLDER_LABEL() { return FOLDER_LABEL; },
    set FOLDER_LABEL(val) { FOLDER_LABEL = val; },
    get GEMMA_COLUMNS() { return GEMMA_COLUMNS; },
    set GEMMA_COLUMNS(val) { GEMMA_COLUMNS = val; },
    GEMMA_PUBLICEREN_TOT_EN_MET_LABEL,
    GEMMA_LIST_API_LABEL,
    GEMMA_PUBLICEREN_VALUES,
    ATTRIBUTE_LABELS,
    ASSOCIATION_DIRECTED,
    RELATION_ATTRIBUTE_LABELS,
    get ENDPOINT_LABELS() { return get_ENDPOINT_LABELS(); },
    get LABELS_NOT_TO_UPDATE() { return get_LABELS_NOT_TO_UPDATE(); },
    set_attr_or_prop,
    get_attr_or_prop,
    parseBool,
  };
}
