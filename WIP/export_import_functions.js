/**
/**
 * export_import_functions.js
 * 
 * Functions for exporting and importing model elements, relations and view properties
 * 
 */

// Property with a logical key (your own unique ID's, independent of used architecture tool)
const PROP_ID = "Object ID";

const ATTRIBUTE_LABELS = ["id", "type", "name", "documentation"];
const SKIP_IMPORT_LABELS = ["id", "source.name", "target.name", "source.id", "target.id", "source.prop('Object ID')", "target.prop('Object ID')"]

const ENDPOINTS = ["source", "target"];
const ENDPOINT_PROP_ID = `prop('${PROP_ID}')`
const ENDPOINT_LABELS = ["name", "id", ENDPOINT_PROP_ID];

// Indexing result codes
const FOUND_PROP_ID = "PROP_ID sync";
const FOUND_ID = "id sync";
const FOUND_NAME = "name sync";
const FOUND_ENDPOINT = "endpoint sync";
const FOUND_MULTIPLE = "multiple";
const CREATE_NEW_OBJECT = "create";

const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_VIEW = "view";

// const ENDPOINT_LABELS = {
// 	"source.id" 	: ["source"]["id"],
// 	"source.name" 	: ["source"]["name"],
// 	"target.id" 	: ["target"]["id"],
// 	"target.name"	: ["target"]["name"]
// }

function selectedObjects (selection) {

	_commonShowDebugMessage.push(false);

	// add selected objects of the model to an array. 
	// Skip folders, properties of folders are not exported
	function exportArray(objects) {
		let lookup = {};
		let exportArray = []
	
		if (objects) {
			objects.each(function (object) {
				if (!lookup[object.id]) {
					exportArray.push(useConcept(object)) // useConcept for view ???
					debug(`> exportArray object: ${object}`)
					lookup[object.id] = true
				}
			})
		}
		return exportArray
	}
	
	let selectedRelations;
	let selectedElements;
	let selectedViews;
	
	if ($(selection).is('archimate-model')) {
		selectedRelations = $('relation');
		selectedElements = $('element');
		selectedViews = $('view');
	} else if ($(selection).is('element')) {
		selectedElements = $(selection)
		selectedRelations = selectedElements.rels()
		selectedViews = selectedElements.viewRefs()
	} else if ($(selection).is('relation')) {
		selectedRelations = $(selection)
		selectedElements = selectedRelations.ends()
	} else if ($(selection).is('folder')) {
		let folders = $(selection)
		selectedElements = folders.find('element')
		selectedViews =  folders.find('view')
		selectedRelations = folders.find('relation')
		// if no relations found, its not a relation folder
		if (!selectedRelations) {
			selectedRelations = selectedElements.rels()
		}
	} else if ($(selection).is('archimate-diagram-model')) {
		selectedViews = $(selection)
		selectedElements = selectedViews.find('element')
		selectedRelations = selectedElements.rels()
	}
	
	elements = exportArray(selectedElements)
	relations = exportArray(selectedRelations)
	views = exportArray(selectedViews)

	_commonShowDebugMessage.pop(false);

	return {elements, relations, views}
}

function exportSelectedObjects(objects, object_type) {

	const data = objects.map(o => exportCreateRows(o, object_type))
	const header = exportCreateHeader(objects, object_type)

	if (data.length > 0) {
		console.log(`Exported ${data.length} rows\n`)
		saveFile(header, data, `${model.name}-${$(selection).first().name}-${object_type}s`)
	} else {
		console.log(`Nothing to export`)
	}
}

/**
 * exportCreateHeader
 * create a row with the column labels for the exported objects
 * 
 * @param objects
 */
function exportCreateHeader(objects, object_type) {
	// deduplicate the property labels  ### kan dit met een filter op een array?
	const propertyLabelsObject = objects.reduce((a, concept) => exportDeduplicateHeader(a, concept), {})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	let header = ATTRIBUTE_LABELS.concat(propertyLabels)
	let endpointLabels = []

	if (object_type == OBJECT_TYPE_RELATION) {
		// relation endpoint (source en target) attributes labels
		ENDPOINT_LABELS.forEach(function (label) {
			ENDPOINTS.forEach(function (endpoint) {
				endpointLabels.push(`${endpoint}.${label}`)
			})
		})

		header = header.concat(endpointLabels)
	}

	debug(`>> header: ${header}\n`)
	console.log(`\nExported ${header.length} columns (${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties, ${endpointLabels.length} endpoints)`)

	return header
}

/**
 * uniquePropLabels
 * 	reduce function
 *  accumulate the new property labels of the given concepts
 * 
 * @param object 
 */
function exportDeduplicateHeader(a, object) {
	object.prop().forEach(function (propLabel) {
		// accumulate all unique property labels. 
		if (typeof a[propLabel] == 'undefined') {
			a[propLabel] = propLabel
			debug(`>>> accumulate a[${propLabel}]: ${a[propLabel]}`);
		}
	})
	return a
}

/**
 * exportCreateRows
 * create a CSV row for an exported object
 * 
 * @param object 
 */
function exportCreateRows(object, object_type) {
	let row = new Object;

	_commonShowDebugMessage.push(false);
	debug(`> ${object}`)

	// export attributes
	ATTRIBUTE_LABELS.forEach(function (attribute) {
		row[attribute] = object[attribute];
		debug(`>> Attr[${attribute}]: ${row[attribute]}`);
	})

	// export properties
	object.prop().forEach(function (propertyLabel) {
		if (object.prop(propertyLabel)) {
			row[propertyLabel] = object.prop(propertyLabel);
			debug(`>> Prop[${propertyLabel}]: ${row[propertyLabel]}`);
		}
	})

	if (object_type == OBJECT_TYPE_RELATION) {

		// export relation endpoint (source en target) attributes
		ENDPOINTS.forEach(function (endpoint) {
			ENDPOINT_LABELS.forEach(function (label) {
				if (label != ENDPOINT_PROP_ID) {
					row[`${endpoint}.${label}`] = object[endpoint][label];
					debug(`>> Endpoint[${endpoint}.${label}]: ${object[endpoint][label]}`);
				} else {
					row[`${endpoint}.${label}`] = object[endpoint].prop(PROP_ID);
					debug(`>> Endpoint[${endpoint}.${label}]: ${object[endpoint].prop(PROP_ID)}`);
				}
			})
		})
	}

	debug(`> Row ${JSON.stringify(row)}`)

	_commonShowDebugMessage.pop();
	return row
}

/** 
 * indexRowsWithObjects
 * 	find object (element, relation or view) 
 *  - first try to find the object with IDs
 *	 	- search with PROP_ID first. The logical PROP_ID precedes. Signal if multiple objects are found
 * 		- search with Archi id if there is no match with PROP_ID. If found, there is exactly one object found
 * 	- if object not found
 *  	- search relation objects with their endpoints
 * 		- search other objects by name
 * create and return an indexRow for further processing
 */
function indexRowsWithObjects(row, index, object_type) {
	let foundObjects = {};
	let searchResult = ''

	let foundEndpoints = {};

	foundObjects = search_PROP_ID(row['type'], row[PROP_ID])
	searchResult = FOUND_PROP_ID
	if (foundObjects.size() == 0) {
		foundObjects = search_ID(row['id'])
		searchResult = FOUND_ID
	}

	// search relation by endpoints (source and targets)
	if (foundObjects.size() == 0 && object_type == OBJECT_TYPE_RELATION) {
		let source = {}
		let target = {}

		source = search_PROP_ID(row['source.type'], row[`source.prop(${PROP_ID})`]) // ### source.type ontbreekt nog
		if (source.size() != 1) {
			source = search_ID(row['source.id'])
		}
		target = search_PROP_ID(row['target.type'], row[`target.prop(${PROP_ID})`]) // ### target.type ontbreekt nog
		if (target.size() != 1) {
			target = search_ID(row['target.id'])
		}

		if (source && target) {

			foundObjects = $(source).outRels(row['type']).filter(function (r) {
				return r.target.equals(target)
			});
			foundEndpoints = {
				source,
				target
			};
		}
		searchResult = FOUND_ENDPOINT
	} else {
		// search by name
		foundObjects = search_Name(row['name'], row['type'])
		searchResult = FOUND_NAME
	}

	return createIndexObject(foundObjects, foundEndpoints, searchResult, row, index)
}


/** 
 */
function search_PROP_ID(row_type, row_prop_id) {

	let foundObjects = {};

	// search with property PROP_ID
	if (row_prop_id) {
		foundObjects = $(row_type).filter(o => o.prop(PROP_ID) == row_prop_id)
	}
	// a PROP_ID should be unique, but duplicates happen. 
	// 0, 1 or more object returned
	return foundObjects
}

/** 
 */
function search_ID(row_id) {

	let foundObjects = {};

	// search with Archi id
	if (object_id) {
		foundObjects = $(`#${row_id}`)
	}
	// the Archi id is unique
	// 0 or 1 object returned
	return foundObjects
}

/** 
 */
function search_Name(row_type, row_name) {

	let foundObjects = {};

	// search with ID
	if (row_name) {
		foundObjects = $(`.${row_name}`).filter(row_type)
	}
	// names do have duplicates
	// 0, 1 or more object returned
	return foundObjects
}


function createIndexObject(objects, endpoints, searchResult, row, index) {
	let resultCode = ''
	rowNr = index + 2 // index plus 2 (header en start bij 0)

	if (objects.size() == 1) {
		resultCode = searchResult
		object = objects.first()
	} else if (objects.size() == 0) {
		console.log(`> No objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		resultCode = CREATE_NEW_OBJECT
	} else if (objects.size() > 1) {
		console.log(`> Multiple objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		resultCode = FOUND_MULTIPLE
	}

	let indexObject = {
		object, // what if empty?
		endpoints, // what if empty?
		resultCode,
		row,
		rowNr
	}
	return indexObject
}

/** 
 * importCreateObject
 * 	create a new object for the row
 */
function importCreateObject(indexObject, object_type) {
	let line = '';

	// object = scan.modelObject
	row = indexObject.row

	if (object_type == OBJECT_TYPE_RELATION) {
		let object = model.createRelation(row.type, row.name, row.endpoints.source, row.endpoints.target);
		line = `> createObject: ${object}\n`

	} else {
		let object = model.createElement(row.type, row.name);
		line = `> createObject: ${object}\n`
	}

	line += importUpdateObject(object, row)
	return line
}

/** 
 * importUpdateObject
 * 	synchronize the model object with row values
 */
function importUpdateObject(indexObject) {
	let lineUpdated = '';
	let line = '';

	object = indexObject.modelObject
	row = indexObject.row

	// convert object key's to an array
	const rowLabels = Object.keys(row);
	// don't import the attribute id, as it can't be changed
	const importlabels = rowLabels.filter(label => (SKIP_IMPORT_LABELS.indexOf(label) == -1));

	// update objects attributes and properties with the row cell values
	importlabels.map(label => {
		// skip row cell if empty or if equal to object value
		if ((row[label]) && (row[label] != get_attr_or_prop(object, label))) {
			if (get_attr_or_prop(object, label)) {
				lineUpdated += `\n>> Update [${label}]: \n${get_attr_or_prop(object, label)}\n${row[label]}`;
			} else {
				lineUpdated += `\n>> Set [${label}]: \n${row[label]}`;
			}
			set_attr_or_prop(object, row, label)
		}
	})

	if (lineUpdated) {
		line = `> Update from row[${indexObject.index}]: ${object}`
		line += lineUpdated
	}
	return line
}

function get_attr_or_prop(object, label) {
	if (ATTRIBUTE_LABELS.indexOf(label) != -1) {
		return object[label]
	} else {
		return object.prop(label)
	}
}

function set_attr_or_prop(object, row, label) {
	if (ATTRIBUTE_LABELS.indexOf(label) != -1) {
		object[label] = row[label]
	} else {
		object.prop(label, row[label])
	}
}

/**
 * Always return the concept, also if a diagram occurence is given
 */
function useConcept(o) {
	if (o.concept)
		return o.concept;
	else
		return o;
}

/**
 * Save header and data to a CSV file
 */
function saveFile(header, data, dataName) {

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString('nl-NL')} ${dataName}.csv`
	});

	if (exportFile != null) {
		$.fs.writeFile(exportFile, Papa.unparse({
			fields: header,
			data: data
		}));
		console.log("Saved to file : " + exportFile);
	} else {
		console.log("\nExport CSV canceled");
	}
}

/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function loadFile() {

	if (filePath) {
		console.log(`> Loading ${filePath} from CSV...`);
		var rows = Papa.parse(readFully(filePath, 'utf-8'), {
			header: true,
			encoding: 'utf-8',
			skipEmptyLines: true
		}).data;

	} else {
		console.log("> Canceled");
	}
	return rows
}

// Some Polyfills for Nashorn ====================================================================================
function readFully(url, charset) {
	var result = '';
	var imports = new JavaImporter(java.net, java.lang, java.io);

	with(imports) {

		var urlObj = null;

		try {
			urlObj = new URL(url);
		} catch (e) {
			// If the URL cannot be built, assume it is a file path.
			urlObj = new URL(new File(url).toURI().toURL());
		}

		var reader = new BufferedReader(new InputStreamReader(urlObj.openStream(), charset));

		var line = reader.readLine();
		while (line != null) {
			result += line + '\n';
			line = reader.readLine();
		}

		reader.close();
	}

	return result;
}