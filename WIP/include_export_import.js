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
const FOLDER_LABEL = "folder";

// labels to skip when updating objects
// - don't import the attribute type  (can't be set) and
// - don't import the attribute id (can't be set) and
// - don't import the endpoints (used for finding the relation)
const LABELS_NOT_TO_UPDATE = ["type", "id", FOLDER_LABEL].concat(ENDPOINT_LABELS);

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
	_commonShowDebugMessage.push(false);
	let cell = new Object();

	// get attribute, for instance "documentation", "name",
	if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
		cell[row_label] = archi_object[row_label];
		debug(`attr archi_object.${row_label}=${cell[row_label]}`);
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
			cell[row_label] = archi_object[endpoint].prop(prop);
			debug(`endpoint archi_object[${endpoint}].prop(${prop})=${cell[row_label]}`);
		} else {
			cell[row_label] = archi_object[endpoint][attr];
			debug(`endpoint archi_object[${endpoint}][${attr}]=${cell[row_label]}`);
		}
	} else {
		// get property, for instance 'Object ID'
		cell[row_label] = archi_object.prop(row_label);
		debug(`prop archi_object.prop(${row_label})=${cell[row_label]}`);
	}

	_commonShowDebugMessage.pop();
	return cell[row_label];
}
