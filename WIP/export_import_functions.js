/**
/**
 * export_import_functions.js
 * 
 * Functions for exporting and importing model elements, relations and view properties
 * 
 */
load(__DIR__ + "../_lib/papaparse.min.js");
// load(__DIR__ + "../_lib/Common.js"); loaded in wrapper-script

// The property PROP_ID is used as a tool independent identifier.
// In the import the PROP_ID identifier takes precedence over the Archi id
const PROP_ID = "Object ID";

// const ENDPOINTS = ["source", "target"];
const ATTRIBUTE_LABELS = ["id", "type", "name", "documentation"];
const ENDPOINT_LABELS = [
	"source.name", "target.name",
	"source.type", "target.type",
	"source.id", "target.id",
	`source.prop.${PROP_ID}`, `source.prop.${PROP_ID}`
]

// const ENDPOINT_PROP_ID = `prop('${PROP_ID}')`
// const ENDPOINT_LABELS = ["name", "id", ENDPOINT_PROP_ID];

// Indexing result codes
const FOUND_PROP_ID = "PROP_ID sync";
const FOUND_ID = "id sync";
const FOUND_NAME = "name sync";
const FOUND_ENDPOINT = "endpoint sync";
const FOUND_MULTIPLE = "multiple";
const CREATE_NEW_OBJECT = "create";

// const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_RELATION = "relations";
// const OBJECT_TYPE_VIEW = "view";


_commonShowDebugMessage = [false];

/**
 * 
 */
function executeExportImport(filePath) {

	initConsoleLog(filePath)
	checkJavaScriptEngine(ENGINE_GRAAL_VM)

	let fileName = filePath.replace(/^.*[\\\/]/, '').replace(/\.ajs$/, '').replace(/%20/, '-').toLowerCase();

	const [executeAction, objectType] = fileName.split('_');
	debug(`Execute an "${executeAction}" with "${objectType}"`)

	let fileFormat = 'Filename format is {export|import}_{elements|relations|views}.ajs'
	if (["elements", OBJECT_TYPE_RELATION, "views"].indexOf(objectType) == -1) {
		throw (`>> Unknown objectType: ${objectType}. ${fileFormat}`);
	}

	try {
		switch (executeAction) {
			case "export": {
				mainExport(objectType)
				break
			}
			case "import": {
				mainImport(objectType)
				break
			}
			default:
				throw (`>> Unknown executeAction: ${executeAction}. ${fileFormat}`);
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}

	finishConsoleLog()
}

function mainExport(objectType) {

	_commonShowDebugMessage.push(false);
	debug(`> mainExport objectType=${objectType} ======`)


	try {
		console.log(`Exporting selected ${objectType}`)

		let objects = [];
		objects = selectObjects(selection)[objectType]

		exportObjects(objects, objectType)

	} catch (error) {
		console.log(`> ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}
	debug(`< mainExport`)
	_commonShowDebugMessage.pop();
}

function mainImport(objectType) {

	_commonShowDebugMessage.push(true);
	debug(`> mainImport objectType=${objectType} ======`)

	try {
		console.log(`Importing ${objectType} of CSV\n`)

		let importFile = window.promptOpenFile({ title: "Open CSV" , filterExtensions: ["*.csv"], fileName: `*${objectType}.csv` });
		let importFilePath = importFile.split("\\");
		let importFileName = importFilePath[importFilePath.length - 1];
	
		// var filePath = window.promptOpenFile({ title: "Open CSV" , filterExtensions: ["*.CSV"], fileName: "*.csv" });
		// let importPath = 'C:/D-schijf/Data/Dropbox/KING/KING ICT/Archi/Werkbestanden/ExportImport/'
		// let importFile = importPath + `2021-02-28_testMerge_Default-View_${objectType}.csv`
		// let importFile = importPath + `2021-03-02_UPL_Default-View_${objectType}.csv`

		const rows = loadFile(importFile)
		console.log(`> Loading CSV file: ${importFileName}\n`);

		// try to find a concept for every row
		const rows_and_objects = rows.map((row, index) => indexRowsWithObjects(row, index))
		console.log(`Indexed ${rows_and_objects.length} rows`)
		rows_and_objects.map(row_and_object => debug(`> mainImport object = ${row_and_object.object} ==> action is "${row_and_object.resultCode}" with row[${row_and_object.rowNr}]`))

		const importHeaderLabels = importReadHeader(rows)

		const createRows = rows_and_objects.filter(row_and_object => row_and_object.resultCode == CREATE_NEW_OBJECT)
		const createdRows_Log = createRows.map(row_and_object => importCreateObject(importHeaderLabels, row_and_object, objectType))
		createdRows_Log.map(LogAndRows => debug(`createdRows_Log: ${LogAndRows.line}`))

		const update_createdRows_Log = createRows.map(row_and_object => importUpdateObject(importHeaderLabels, row_and_object, objectType)).filter(line => line != '')
		if (update_createdRows_Log.length > 0) {
			console.log(`Created ${update_createdRows_Log.length} objects:`)
			update_createdRows_Log.map(line => console.log(line))
		}

		const updateRows = rows_and_objects.filter(row_and_object => (row_and_object.resultCode == FOUND_PROP_ID) || (row_and_object.resultCode == FOUND_ID) || (row_and_object.resultCode == FOUND_NAME))
		const updateRows_Log = updateRows.map(row_and_object => importUpdateObject(importHeaderLabels, row_and_object, objectType)).filter(line => line != '')
		
		if (updateRows_Log.length > 0) {
			console.log(`Updated ${updateRows_Log.length} objects:`)
			updateRows_Log.map(LogAndRows => console.log(`updateRows_Log: ${LogAndRows.line}`))
		}

		console.log("\n>> ======== ");
		console.log(`> Imported CSV file: ${importFileName}\n`);
		console.log(">> Import finished");
		console.log(`>>> rows processed : ${rows.length}`);
		console.log(`>>> ${objectType} updated   : ${updateRows_Log.length}`);
		console.log(`>>> ${objectType} created   : ${createRows.length}`);
		console.log("");

	} catch (error) {
		console.log(`> ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}

	debug(`< mainImport`)
	_commonShowDebugMessage.pop();
}

function selectObjects(selection) {

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
					debug(`> selectObjects() > exportArray(): ${object}`)
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
		selectedViews = folders.find('view')
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

	_commonShowDebugMessage.pop();

	return {
		elements,
		relations,
		views
	}
}

function exportObjects(objects, objectType) {

	console.log(`Exported:`)
	const header = exportCreateHeader(objects, objectType)
	const data = objects.map(o => exportCreateRows(header, o, objectType))

	if (data.length > 0) {
		console.log(`- Rows for ${data.length} objects\n`)
		fileName = `${model.name}_${$(selection).first().name}_${objectType}`
		saveFile(header, data, fileName.replace(/\s/g, "-"))
	} else {
		console.log(`- No rows, nothing to export`)
	}
}

/**
 * exportCreateHeader
 * create a row with the column labels for the exported objects
 * - attributes are prefixed with attr (ex id, id)
 * - prop are prefixed with prop (ex prop.Object ID)
 * - endpoints are prefixed with source en target (source.id, source.prop.Object ID)
 * 
 */
function exportCreateHeader(objects, objectType) {
	// deduplicate the property labels  ### kan dit met een filter op een array?
	const propertyLabelsObject = objects.reduce((a, concept) => exportHeaderProperties(a, concept), {})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	let header = ATTRIBUTE_LABELS.concat(propertyLabels)

	// let endpointLabels = []

	if (objectType == OBJECT_TYPE_RELATION) {
		// // relation endpoint (source en target) attributes labels
		// ENDPOINT_LABELS.forEach(function (label) {
		// 	ENDPOINTS.forEach(function (endpoint) {
		// 		endpointLabels.push(`${endpoint}.${label}`)
		// 	})
		// })

		// header = header.concat(endpointLabels)
		header = header.concat(ENDPOINT_LABELS)
	}

	debug(`>> header: ${header}\n`)
	console.log(`- Header for ${header.length} columns (${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties, ${ENDPOINT_LABELS.length} endpoints)`)

	return header
}

/**
 * uniquePropLabels
 * 	reduce function
 *  accumulate the new property labels of the given concepts
 * 
 * @param object 
 */
function exportHeaderProperties(a, object) {
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
function exportCreateRows(headerRow, object, objectType) {
	let row = new Object;

	_commonShowDebugMessage.push(false);
	debug(`\n> exportCreateRows()`)
	
	debug(`> ${object}`)

	// fill row with the attributes and property values of the object
	headerRow.forEach(label => {
		row[label] = get_attr_or_prop(object, label)
	})
	
	// // export attributes
	// ATTRIBUTE_LABELS.forEach(function (attribute) {
		// 	row[attribute] = object[attribute];
		// 	debug(`>> Attr[${attribute}]: ${row[attribute]}`);
		// })

	// // export properties
	// object.prop().forEach(function (propertyLabel) {
		// 	if (object.prop(propertyLabel)) {
			// 		row[propertyLabel] = object.prop(propertyLabel);
	// 		debug(`>> Prop[${propertyLabel}]: ${row[propertyLabel]}`);
	// 	}
	// })
	
	// if (objectType == OBJECT_TYPE_RELATION) {
		
	// 	// export relation endpoint (source en target) attributes
	// 	ENDPOINTS.forEach(function (endpoint) {
		// 		ENDPOINT_LABELS.forEach(function (label) {
			// 			if (label != ENDPOINT_PROP_ID) {
				// 				row[`${endpoint}.${label}`] = object[endpoint][label];
				// 				debug(`>> Endpoint[${endpoint}.${label}]: ${object[endpoint][label]}`);
				// 			} else {
					// 				row[`${endpoint}.${label}`] = object[endpoint].prop(PROP_ID);
	// 				debug(`>> Endpoint[${endpoint}.${label}]: ${object[endpoint].prop(PROP_ID)}`);
	// 			}
	// 		})
	// 	})
	// }
	
	debug(`> Row ${JSON.stringify(row)}`)

	debug(`< exportCreateRows()\n`)
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
function indexRowsWithObjects(row, index) {
	let foundObjects, foundEndpoints, indexedRow = new Object;
	let searchResult = ''

	_commonShowDebugMessage.push(true);
	debug(`\n> indexRowsWithObjects(index=${index})`)

	foundObjects = search_PROP_ID(row['type'], row[PROP_ID])
	searchResult = FOUND_PROP_ID
	if (isEmpty(foundObjects)) {
		foundObjects = search_ID(row['id'])
		searchResult = FOUND_ID
	}

	if (isEmpty(foundObjects)) {
		// search relation by endpoints (source and targets)
		if (row['type'].endsWith("relationship")) {
			let source = {}
			let target = {}

			// ### mismatch in aanpak met ENDPOINT_LABELS
			source = search_PROP_ID(row['source.type'], row[`source.prop(${PROP_ID})`])
			if (source.size() != 1) {
				source = search_ID(row['source.id'])
			}
			target = search_PROP_ID(row['target.type'], row[`target.prop(${PROP_ID})`])
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
	}
	indexedRow = createIndexedRow(foundObjects, foundEndpoints, searchResult, row, index)

	debug(`< indexRowsWithObjects foundObjects: ${foundObjects}, searchResult: "${searchResult}"`)
	_commonShowDebugMessage.pop();

	return indexedRow
}


/** 
 */
function search_PROP_ID(row_type, row_prop_id) {

	let foundObjects = new Object;

	// search with property PROP_ID
	if (row_prop_id) {
		foundObjects = $(row_type).filter(function (o) { return (o.prop(PROP_ID) == row_prop_id) })
	}
	debug(`> search_PROP_ID(type:${row_type}, propID:${row_prop_id}): ${foundObjects}`)
	// a PROP_ID should be unique, but duplicates happen. 
	// 0, 1 or more object returned
	return foundObjects
}

/** 
 */
function search_ID(row_id) {

	let foundObjects = new Object;

	// search with Archi id
	if (row_id) {
		foundObjects = $(`#${row_id}`)
	}
	debug(`> search_ID(id:${row_id}): ${foundObjects}`)

	// the Archi id is unique
	// 0 or 1 object returned
	return foundObjects
}

/** 
 */
function search_Name(row_type, row_name) {

	let foundObjects = new Object;

	// search with ID
	if (row_name) {
		foundObjects = $(`.${row_name}`).filter(row_type)
	}

	debug(`> search_name(type:${row_type}, name:${row_name}): ${foundObjects}`)

	// names do have duplicates
	// 0, 1 or more object returned
	return foundObjects
}


function createIndexedRow(objects, endpoints, searchResult, row, index) {
	let resultCode = 'empty'
	let object = new Object;
	rowNr = index + 2 // index plus 2 (header en start bij 0)

	_commonShowDebugMessage.push(true);
	debug(`\n> createIndexedRow(index=${index})`)

	if (isEmpty(objects)) {
		console.log(`> No objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		resultCode = CREATE_NEW_OBJECT
	} else if (objects.size() == 1) {
		resultCode = searchResult
		object = objects.first()
	} else if (objects.size() > 1) {
		console.log(`> Multiple objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		resultCode = FOUND_MULTIPLE
	}

	let indexedRow = {
		rowNr,
		object, // what if empty?
		endpoints, // what if empty?
		resultCode,
		row
	}

	debug(`< return indexedRow {`)
	debug(`< rowNr:  ${rowNr}`)
	debug(`< object:  ${object}`)
	debug(`< endpoints:  ${endpoints}`)
	debug(`< row.length:  ${row.length}`)
	debug(`< resultCode:  "${resultCode}" }`)
	_commonShowDebugMessage.pop();

	return indexedRow
}

/** 
 * importReadHeader
 * 	return a array with the column labels which will be imported
 */
function importReadHeader(rows) {

	// row is an array of {name, value} objects => get all object key names
	const headerLabels = Object.keys(rows[0]);
	debug(`> importReadHeader headerLabels: ${headerLabels}\n`)

	// Filter the columns to be imported
	// - don't import the attribute id (can't be set) and 
	// - don't import the endpoints (used for finding the relation)
	const importHeaderLabels = headerLabels.filter(label => (["id"].concat(ENDPOINT_LABELS).indexOf(label) == -1));
	return importHeaderLabels
}

/** 
 * importCreateObject
 * 	create a new object for the row
 */
function importCreateObject(headerRow, row_and_object, objectType) {
	let line = '';
	let object

	_commonShowDebugMessage.push(true);
	debug(`importCreateObject()`)

	row = row_and_object.row

	if (objectType == OBJECT_TYPE_RELATION) {
		object = model.createRelation(row.type, row.name, row.endpoints.source, row.endpoints.target);
		line = `> createObject: ${object}\n`

	} else {
		object = model.createElement(row.type, row.name);
		line = `> createObject: ${object}\n`
	}

	row_and_object.object = object // #### mag dit. const van buiten

	// return createdObjects en in mainImport weer concat.
	// line += importUpdateObject(headerRow, row_and_object, objectType)
	_commonShowDebugMessage.pop();
	return { line, row_and_object }
}

/** 
 * importUpdateObject
 * 	synchronize the model object with row values
 */
// function importUpdateObject(object, row, rowNr) {
function importUpdateObject(headerRow, row_and_object, objectType) {
	let lineUpdated = '';
	let line = '';

	let row = row_and_object.row
	let object = row_and_object.object
	let rowNr = row_and_object.rowNr
	
	_commonShowDebugMessage.push(true);
	debug(`importUpdateObject()`)

	// update objects attributes and properties with the row cell values
	headerRow.map(label => {
		// skip row cell if empty or if equal to object value
		if ((row[label]) && (row[label] != get_attr_or_prop(object, label))) {
			if (get_attr_or_prop(object, label)) {
				lineUpdated += `\n>> Update [${label}]: \n${get_attr_or_prop(object, label)}\n${row[label]}`;
			} else {
				lineUpdated += `\n>> Set [${label}]: \n${row[label]}`;
			}
			set_attr_or_prop(object, row, label)
			debug(`lineUpdated: ${lineUpdated}`)
		}
	})

	if (lineUpdated) {
		line = `> Update from row[${rowNr}]: ${object}`
		line += lineUpdated
	}
	_commonShowDebugMessage.pop();
	return line
}

function get_attr_or_prop(archi_object, row_label) {
	let cell = new Object;

	if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
		// attribute => "id", "type",

		debug(`get_attr_or_prop(ATTRIBUTE_LABELS: ${row_label})`)
		cell[row_label] = archi_object[row_label]

	} else if (ENDPOINT_LABELS.indexOf(row_label) != -1) {
		// Endpoint => "target.id", `source.prop.${PROP_ID}`
		// let endpoint = label.substring(0, label.indexOf('.'))
		// let attr_label = label.substring(label.indexOf('.'))

		const [endpoint, attr, prop] = row_label.split('.');
		debug(`get_attr_or_prop(ENDPOINT_LABELS, endpoint, attr, prop: ${row_label}, [${endpoint}, ${attr}, ${prop}])`)

		if (prop) {
			cell[row_label] = archi_object[endpoint].prop(prop)
		} else {
			cell[row_label] = archi_object[endpoint][attr]
		}
	} else {
		// property Object ID
		debug(`get_attr_or_prop(PROPERTY LABEL: ${row_label})`)
		cell[row_label] = archi_object.prop(row_label)
	}

	return cell[row_label]
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
function saveFile(header, data, filename) {

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString('nl-NL')}_${filename}.csv`
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
function loadFile(importFile) {

	if (importFile) {
		var rows = Papa.parse(readFully(importFile, 'utf-8'), {
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

	with (imports) {

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

function isEmpty(obj) {
    return Object.keys(obj).length === 0;
}