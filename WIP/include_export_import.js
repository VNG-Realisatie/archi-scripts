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
// In the import the PROP_ID identifier takes precedence over the Archi id
const PROP_ID = "Object ID";

// const ENDPOINTS = ["source", "target"];
const ATTRIBUTE_LABELS = ["name", "type", "documentation","id"];
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

const ATTRIBUTE_LABEL = "attribute";
const PROPERTY_LABEL = "property";
// use this value in a property column to remove a property from the object
const REMOVE_PROPERTY_VALUE = "<remove>";

/**
 *
 */
function executeExportImport(filePath) {
	initConsoleLog(filePath);
	checkJavaScriptEngine(ENGINE_GRAAL_VM);

	_commonShowDebugMessage = [false];

	let fileName = filePath
		.replace(/^.*[\\\/]/, "")
		.replace(/\.ajs$/, "")
		.replace(/%20/, "-")
		.toLowerCase();

	const [executeAction, objectType] = fileName.split("_");
	debug(`Execute an "${executeAction}" with "${objectType}"`);

	let fileFormat = "Filename format is {export|import}_{element|relation|view}.ajs";
	if ([OBJECT_TYPE_ELEMENT, OBJECT_TYPE_RELATION, OBJECT_TYPE_VIEW].indexOf(objectType) == -1) {
		throw `\n>> Unknown objectType: ${objectType}. ${fileFormat}`;
	}

	try {
		switch (executeAction) {
			case "export": {
				load(__DIR__ + "../_lib/SelectCollection.js");
				load("include_export.js");
				exportObjects(objectType);
				break;
			}
			case "import": {
				load("include_import.js");
				importObjects(objectType);
				break;
			}
			default:
				throw `\n>> Unknown executeAction: ${executeAction}. ${fileFormat}`;
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
	_commonShowDebugMessage.pop();

	finishConsoleLog();
}

function isEmpty(obj) {
	if (typeof obj === "object") {
		// both jArchi en JS objects have a type object, but the jArchi object gives an error for Object.keys(jArchi object)
		if (typeof obj.size === "function") {
			// jArchi object has function size
			return obj.size() === 0;
		} else {
			// for JS object.
			return Object.keys(obj).length === 0;
		}
	} else {
		console.log(`> isEmpty(obj=${obj}, typeof=${typeof obj}): only use for jArchi objects or JS object`);
	}
}

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

	// attribute => "id", "type",
	if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
		cell[row_label] = archi_object[row_label];
		debug(`attr archi_object.${row_label}=${cell[row_label]}`);
	} else if (ENDPOINT_LABELS.indexOf(row_label) != -1) {
		// endpoint => obj.source.id, obj.target.prop("Object ID")
		const [endpoint, attr, prop] = row_label.split(".");

		if (prop) {
			cell[row_label] = archi_object[endpoint].prop(prop);
			debug(`endpoint archi_object[${endpoint}].prop(${prop})=${cell[row_label]}`);
		} else {
			cell[row_label] = archi_object[endpoint][attr];
			debug(`endpoint archi_object[${endpoint}][${attr}]=${cell[row_label]}`);
		}
	} else {
		// property Object ID
		cell[row_label] = archi_object.prop(row_label);
		debug(`prop archi_object.prop(${row_label})=${cell[row_label]}`);
	}

	_commonShowDebugMessage.pop();
	return cell[row_label];
}
