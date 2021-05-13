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
const ATTRIBUTE_LABELS = ["id", "type", "name", "documentation"];
const ENDPOINT_LABELS = [
	"source.name",
	"target.name",
	"source.type",
	"target.type",
	"source.id",
	"target.id",
	`source.prop.${PROP_ID}`,
	`target.prop.${PROP_ID}`,
];

_commonShowDebugMessage = [false];

/**
 *
 */
function executeExportImport(filePath) {
	initConsoleLog(filePath);
	checkJavaScriptEngine(ENGINE_GRAAL_VM);

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

function set_attr_or_prop(object, row, label) {
  if (ATTRIBUTE_LABELS.indexOf(label) != -1) {
    object[label] = row[label];
  } else {
    object.prop(label, row[label]);
  }
}


function get_attr_or_prop(archi_object, row_label) {
	let cell = new Object();

	if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
		// attribute => "id", "type",

		debug(`Start ATTRIBUTE_LABELS: ${row_label})`);
		cell[row_label] = archi_object[row_label];
	} else if (ENDPOINT_LABELS.indexOf(row_label) != -1) {
		// Endpoint => "target.id", `source.prop.${PROP_ID}`
		// let endpoint = label.substring(0, label.indexOf('.'))
		// let attr_label = label.substring(label.indexOf('.'))

		const [endpoint, attr, prop] = row_label.split(".");
		debug(`Start ENDPOINT_LABELS, endpoint, attr, prop: ${row_label}, [${endpoint}, ${attr}, ${prop}])`);

		if (prop) {
			cell[row_label] = archi_object[endpoint].prop(prop);
		} else {
			cell[row_label] = archi_object[endpoint][attr];
		}
	} else {
		// property Object ID
		debug(`Start (PROPERTY LABEL: ${row_label})`);
		cell[row_label] = archi_object.prop(row_label);
	}

	return cell[row_label];
}

