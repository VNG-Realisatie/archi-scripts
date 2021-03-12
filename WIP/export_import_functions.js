/**
 * export_import_functions.js
 * 
 * Functions for exporting and importing model elements, relations and view properties
 * 
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
	`source.prop.${PROP_ID}`, `target.prop.${PROP_ID}`
]

// Indexing result codes
const NOT_FOUND = "object NOT found"
const NOT_FOUND_RELATION = "relation NOT found"
// const NOT_FOUND = "Endpoint missing"
const FOUND_ID = "id sync";
const FOUND_NAME = "name sync";
const FOUND_RELATION_ENDPOINTS = "relation endpoints found";
const FOUND_RELATION = "relation found"
const FOUND_MULTIPLE = "multiple";
const CREATE_NEW_OBJECT = "create";

const OBJECT_TYPE_RELATION = "relations";
const OBJECT_TYPE_ELEMENT = "elements";
const OBJECT_TYPE_VIEW = "views";

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
				exportObjects(objectType)
				break
			}
			case "import": {
				importObjects(objectType)
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

function exportObjects(objectType) {

	_commonShowDebugMessage.push(false);
	debug(`objectType=${objectType}`)

	try {
		// selection is a global Archi variable with a collection of Archi objects
		let objects = exportSelectObjects(selection, objectType)

		console.log(`Exporting selected ${objectType} or ${objectType} in selected folder or view\n`)

		console.log(`Creating columns and rows:`)
		const header = exportCreateHeader(objects, objectType)
		const data = objects.map(o => exportCreateRows(header, o))

		if (data.length > 0) {
			console.log(`- ${data.length} rows for ${data.length} ${objectType}\n`)
			saveRowsToFile(header, data, objectType)
		} else {
			console.log(`- No rows, nothing to export`)
		}

	} catch (error) {
		console.log(`> ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}
	debug(`< `)
	_commonShowDebugMessage.pop();
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

	// remove duplicate property labels  ### kan dit met een filter op een array?
	const propertyLabelsObject = objects.reduce((a, concept) => exportHeaderProperties(a, concept), {})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	let header = ATTRIBUTE_LABELS.concat(propertyLabels)

	if (objectType == OBJECT_TYPE_RELATION) {
		header = header.concat(ENDPOINT_LABELS)
	}

	debug(`header: ${header}\n`)
	console.log(`- ${header.length} columns (header with ${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties, ${ENDPOINT_LABELS.length} endpoints)`)

	return header
}

/**
 * exportHeaderProperties
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
			debug(`accumulate a[${propLabel}]: ${a[propLabel]}`);
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
function exportCreateRows(headerRow, object) {
	let row = new Object;

	_commonShowDebugMessage.push(false);
	debug(`\n> `)
	debug(`${object}`)

	// fill row with the attributes and property values of the object
	headerRow.forEach(label => {
		row[label] = get_attr_or_prop(object, label)
	})

	debug(`Row: ${JSON.stringify(row)}`)
	_commonShowDebugMessage.pop();
	return row
}

function exportSelectObjects(ArchiSelection, objectType) {

	_commonShowDebugMessage.push(false);

	let selectedRelations, selectedElements, selectedViews;

	if ($(ArchiSelection).is('archimate-model')) {
		selectedRelations = $('relation');
		selectedElements = $('element');
		selectedViews = $('view');
		console.log(`- selection is ${$(ArchiSelection)}`)
	} else if ($(ArchiSelection).is('element')) {
		selectedElements = $(ArchiSelection)
		selectedRelations = selectedElements.rels()
		selectedViews = selectedElements.viewRefs()
	} else if ($(ArchiSelection).is('relation')) {
		selectedRelations = $(ArchiSelection)
		selectedElements = selectedRelations.ends()
	} else if ($(ArchiSelection).is('folder')) {
		let folders = $(ArchiSelection)
		selectedElements = folders.find('element')
		selectedViews = folders.find('view')
		selectedRelations = folders.find('relation')
		// if no relations found, its not a relation folder
		if (!selectedRelations) {
			selectedRelations = selectedElements.rels()
		}
	} else if ($(ArchiSelection).is('archimate-diagram-model')) {
		selectedViews = $(ArchiSelection)
		selectedElements = selectedViews.find('element')
		selectedRelations = selectedElements.rels()
	}
	console.log(`Selected object(s): ${$(ArchiSelection)}\n`)

	// add selected objects of the model to an array. 
	// Skip folders, properties of folders are not exported
	function exportArray(objects) {
		let lookup = {};
		let exportArray = []

		if (!isEmpty(objects)) {
			objects.each(function (object) {
				if (!lookup[object.id]) {
					exportArray.push(useConcept(object)) // useConcept for view ???
					debug(`selectObjects() > exportArray(): ${object}`)
					lookup[object.id] = true
				}
			})
		}
		debug(`${objects.length} Archi objects in array returned`)
		return exportArray
	}

	let selectedObjects
	switch (objectType) {
		case OBJECT_TYPE_ELEMENT:
			selectedObjects = exportArray(selectedElements)
			break;
		case OBJECT_TYPE_RELATION:
			selectedObjects = exportArray(selectedRelations)
			break;
		case OBJECT_TYPE_VIEW:
			selectedObjects = exportArray(selectedViews)
			break;
	}
	_commonShowDebugMessage.pop();

	return selectedObjects
}

function importObjects(objectType) {

	_commonShowDebugMessage.push(true);
	debug(`objectType=${objectType}`)

	try {
		console.log(`Importing ${objectType} of CSV\n`)

		let importFile = window.promptOpenFile({
			title: "Open CSV",
			filterExtensions: ["*.csv"],
			fileName: `*${objectType}.csv`
		})  || '';
		let importFileName = importFile.split("\\").pop().split("/").pop();

		// var filePath = window.promptOpenFile({ title: "Open CSV" , filterExtensions: ["*.CSV"], fileName: "*.csv" });
		// let importPath = 'C:/D-schijf/Data/Dropbox/KING/KING ICT/Archi/Werkbestanden/ExportImport/'
		// let importFile = importPath + `2021-02-28_testMerge_Default-View_${objectType}.csv`
		// let importFile = importPath + `2021-03-02_UPL_Default-View_${objectType}.csv`
		const rows = getRowsFromFile(importFile)
		if (rows.length > 0) {

			console.log(`> Loading CSV file: ${importFileName}\n`);
	
			// check all rows for missing and valid value's
			const validateLog = rows.map((row, index) => importValidateRows(row, index)).filter((line) => line != '')
	
			if (validateLog.length == 0) {
	
				const importHeaderLabels = importReadHeader(rows)
	
				const rows_and_objects = rows.map((row, index) => importIndexRows(row, index, objectType))
				console.log(`Indexed ${rows_and_objects.length} rows`)
				rows_and_objects.map(row_and_object => debug(`row[${row_and_object.rowNr}] > "${row_and_object.resultCode}" object = ${row_and_object.archiObject}`))
	
				// create Archi objects for rows which are not found
				const createRows = rows_and_objects.filter(row_and_object => row_and_object.resultCode == CREATE_NEW_OBJECT)
				const createdRows_Log = createRows.map(row_and_object => importCreateObject(importHeaderLabels, row_and_object, objectType))
				createdRows_Log.map(LogAndRows => debug(`${LogAndRows.line}`))
	
				// set properties of created Archi objects
				const update_createdRows_Log = createRows.map(row_and_object => importUpdateObject(importHeaderLabels, row_and_object)).filter(line => line != '')
				if (update_createdRows_Log.length > 0) {
					console.log(`Created ${update_createdRows_Log.length} objects:`)
					update_createdRows_Log.map(line => console.log(line))
				}
	
				// update properties of found Archi objects
				const updateRows = rows_and_objects.filter(row_and_object => (row_and_object.resultCode == FOUND_ID) || (row_and_object.resultCode == FOUND_NAME))
				const updateRows_Log = updateRows.map(row_and_object => importUpdateObject(importHeaderLabels, row_and_object)).filter(line => line != '')
	
				if (updateRows_Log.length > 0) {
					console.log(`Updated ${updateRows_Log.length} objects:`)
					updateRows_Log.map(LogAndRows => console.log(`updateRows_Log: ${LogAndRows.line}`))
				}
	
				console.log("\n>> ======== ");
				console.log(`> Imported CSV file: ${importFileName}\n`);
				console.log("> Import finished");
				console.log(`>> rows processed : ${rows.length}`);
				console.log(`>> ${objectType} updated   : ${updateRows_Log.length}`);
				console.log(`>> ${objectType} created   : ${createRows.length}`);
				console.log("");
			} else {
				console.log("\n> ======== ");
				console.log(`> Unvalid data in CSV file: ${importFileName}`);
				console.log(`> There are ${validateLog.length} unvalid rows`)
				validateLog.map(line => console.log(`> - ${line}`))
				console.log(`\n> Correct the data and import again\n`);
			}
		} 
	} catch (error) {
		console.log(`> ${typeof error.stack == 'undefined' ? error : error.stack}`);
	}

	debug(`< `)
	_commonShowDebugMessage.pop();
}

/**
 * importValidateRows - mapping function
 * 	check importFile row for required values
 */
function importValidateRows(row, index) {
	let line = '';
	let RowNr = index + 2

	if (!row.type) {
		line += `Row(${RowNr}): value ${row.type} in column "type" not valid`
	}
	return line
}

/** 
 * importIndexRows
 * 	find object (element, relation or view) 
 *  - first try to find the object with IDs
 *	 	- search with PROP_ID first. The logical PROP_ID precedes. Signal if multiple objects are found
 * 		- search with Archi id if there is no match with PROP_ID. If found, there is exactly one object found
 * 	- if object not found
 *  	- search relation objects with their endpoints
 * 		- search other objects by name
 * create and return an indexRow for further processing
 */
function importIndexRows(row, index, objectType) {
	let foundObjects, archiObject = new Object;
	let resultCode = 'empty'

	// rowNr follows rownumbers in spreadsheet (+1 for header and +1 for row start at 1 (index starts at 0))
	rowNr = index + 2

	_commonShowDebugMessage.push(true);

	debug(`\nRow index=${index}`)

	if (objectType == OBJECT_TYPE_RELATION) {

		// indexedRow = importCreateIndexRow(foundObjects, {}, row, index)

		foundObjects = findRelation(row)
		if (foundObjects.searchResult == NOT_FOUND_RELATION) {
			resultCode = foundObjects.searchResult
			console.log(`> Can't import relation: relation or endpoints not found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		} else if (foundObjects.searchResult == FOUND_RELATION) {

			if (foundObjects.archiRelations.size() == 1) {

				resultCode = foundObjects.searchResult
				archiObject = foundObjects.archiRelations.first()

			} else if (foundObjects.archiRelations.size() > 1) {
				resultCode = FOUND_MULTIPLE
				console.log(`> Multiple relations found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
			}
		} else if (foundObjects.searchResult == FOUND_RELATION_ENDPOINTS) {
			resultCode = CREATE_NEW_OBJECT
			console.log(`> Create relation for row[${rowNr}] (endpoints source=${foundObjects.archiSource}), target=${foundObjects.archiTarget}`)
		}
	} else {
		foundObjects = findElement_or_View(row)

		// indexedRow = importCreateIndexRow({}, foundRelations, row, index)
		if (foundObjects.searchResult == NOT_FOUND) {
			resultCode = CREATE_NEW_OBJECT
			console.log(`> No objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		} else if ((foundObjects.searchResult == FOUND_NAME) || (foundObjects.searchResult == FOUND_ID)) {
			if (foundObjects.archiObjects.size() == 1) {

				resultCode = foundObjects.searchResult
				archiObject = foundObjects.archiObjects.first()

			} else if (foundObjects.archiObjects.size() > 1) {
				resultCode = FOUND_MULTIPLE
				console.log(`> Multiple objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
			}
		}
	}

	let indexedRow = {
		rowNr,
		archiObject,
		source: foundObjects.archiSource,
		target: foundObjects.archiTarget,
		resultCode,
		row
	}

	debug(`rowNr:  ${rowNr}`)
	debug(`object:  ${archiObject}`) // $(archiObject)?
	debug(`endpoint (source,target):  (${indexedRow.source}, ${indexedRow.target})`)
	debug(`resultCode:  "${resultCode}" }`)

	_commonShowDebugMessage.pop();

	return indexedRow
}

function findElement_or_View(row) {
	let archiObjects = new Object;
	let searchResult = 'not set'

	// search object with id or PROP_ID
	archiObjects = search_IDs(row[PROP_ID], row['id'], row['type'])
	if (isEmpty(archiObjects)) {
		// search element or view by name
		archiObjects = search_Name(row['name'], row['type'])
		if (isEmpty(archiObjects)) {
			searchResult = NOT_FOUND
		} else {
			searchResult = FOUND_NAME
		}

	} else {
		searchResult = FOUND_ID
	}

	return {
		searchResult,
		archiObjects
	}
}

/**
 * findRelation
 * 	search relation by endpoints (source and targets)
 * 	searching by name not possible, relation often do not have a (unique) name
 */
function findRelation(row) {
	let archiRelations = new Object;
	let archiSource, archiTarget = new Object;
	let searchResult = 'not set'

	// search relation with id or PROP_ID
	archiRelations = search_IDs(row[PROP_ID], row['id'], row['type'])
	if (isEmpty(archiRelations)) {
		// search relation with endpoints
		archiSource = searchEndpoint(row, 'source')
		if (isEmpty(archiSource)) {
			searchResult = NOT_FOUND_RELATION
		} else {
			archiTarget = searchEndpoint(row, 'target')
			if (isEmpty(archiTarget)) {
				searchResult = NOT_FOUND_RELATION
			} else {
				// both endpoints found
				// find relations of with the found source and target
				archiRelations = $(archiSource).outRels(row['type']).filter(function (r) {
					return r.target.equals(archiTarget)
				});
				if (isEmpty(archiRelations)) {
					searchResult = FOUND_RELATION_ENDPOINTS
					debug(`Not found relation, create with endpoints: source=${archiSource}, target=${archiTarget}`)
				} else {
					searchResult = FOUND_RELATION
					debug(`Found relation via endpoints=${archiRelations}`)
				}
			}
		}
	} else {
		searchResult = FOUND_RELATION
		debug(`Found relation with IDs=${archiRelations}`)
	}

	return {
		archiSource,
		archiTarget,
		searchResult,
		archiRelations
	}
}

function searchEndpoint(row, endpointSide) {
	let ArchiObjects = new Object;
	let ArchiEndpoint = new Object;

	ArchiObjects = search_IDs(row[`${endpointSide}.prop.${PROP_ID}`], row[`${endpointSide}.id`], row[`${endpointSide}.type`], )
	if (isEmpty(ArchiObjects)) {
		debug(`Not found relation ${endpointSide}`)
	} else {
		if (ArchiObjects.size() > 1) {
			debug(`Not found relation: dismiss MULTIPLE ${endpointSide}s: ${ArchiObjects}`)
		} else {
			debug(`Found relation ${endpointSide}=${ArchiEndpoint}`)
			ArchiEndpoint = ArchiObjects.first()
		}
	}
	return ArchiEndpoint
}

/** 
 */
function search_IDs(row_prop_id, row_id, row_type) {

	let ArchiObjects = new Object;

	debug(`type=${row_type}, propID=${row_prop_id}, id=${row_id}`)

	// search with property PROP_ID
	if (row_prop_id) {
		ArchiObjects = $(row_type).filter(function (o) {
			return (o.prop(PROP_ID) == row_prop_id)
		})
	}
	// a PROP_ID should be unique, but duplicates happen. 
	// 0, 1 or more object returned

	if (isEmpty(ArchiObjects)) {
		// if (foundObjects.size() == 0) {
		ArchiObjects = $(`#${row_id}`)
		if (isEmpty(ArchiObjects)) {
			debug(`Not found`)
		} else {
			debug(`Found with id: ${ArchiObjects}`)
		}
	} else {
		debug(`Found with PROP_ID: ${ArchiObjects}`)
	}
	return ArchiObjects
}

/** 
 */
function search_Name(row_name, row_type) {

	let ArchiObjects = new Object;

	// search with ID
	if (row_name) {
		ArchiObjects = $(`.${row_name}`).filter(row_type)
	}

	debug(`type:${row_type}, name:${row_name}): ${ArchiObjects}`)

	// names do have duplicates
	// 0, 1 or more object returned
	return ArchiObjects
}

/** 
 * importReadHeader
 * 	return a array with the column labels which will be imported
 */
function importReadHeader(rows) {

	// row is an array of {name, value} objects => get all object key names
	const headerLabels = Object.keys(rows[0]);
	debug(`headerLabels: ${headerLabels}\n`)

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
	let archiObject

	_commonShowDebugMessage.push(true);
	debug(`Start`)

	row = row_and_object.row

	switch (objectType) {
		case OBJECT_TYPE_RELATION: {
			archiObject = model.createRelationship(row_and_object.row.type, row_and_object.row.name, row_and_object.source, row_and_object.target);
			line = `> create relation: ${archiObject}\n`
			break;
		}
		case OBJECT_TYPE_ELEMENT: {
			archiObject = model.createElement(row.type, row.name);
			line = `> create element: ${archiObject}\n`
			break;
		}
		case OBJECT_TYPE_VIEW: {
			line = `> INFO: View ${row.name} NOT created\n`
			line = `> INFO: creation of views is not supported, use Archi merge function\n`
			break;
		}
	}
	row_and_object.archiObject = archiObject // #### mag dit. const van buiten

	_commonShowDebugMessage.pop();
	return {
		line,
		row_and_object
	}
}

/** 
 * importUpdateObject
 * 	synchronize the model object with row values
 */
function importUpdateObject(headerRow, row_and_object) {
	let lineUpdated = '';
	let line = '';

	let row = row_and_object.row
	let archiObject = row_and_object.archiObject
	let rowNr = row_and_object.rowNr

	_commonShowDebugMessage.push(false);
	debug(`Start`)

	// update objects attributes and properties with the row cell values
	headerRow.map(label => {
		// skip row cell if empty or if equal to object value
		if ((row[label]) && (row[label] != get_attr_or_prop(archiObject, label))) {
			if (get_attr_or_prop(archiObject, label)) {
				lineUpdated += `\n>> Update [${label}]: \n${get_attr_or_prop(archiObject, label)}\n${row[label]}`;
			} else {
				lineUpdated += `\n>> Set [${label}]: \n${row[label]}`;
			}
			set_attr_or_prop(archiObject, row, label)
			debug(`lineUpdated: ${lineUpdated}`)
		}
	})

	if (lineUpdated) {
		line = `> Update from row[${rowNr}]: ${archiObject}`
		line += lineUpdated
	}
	_commonShowDebugMessage.pop();
	return line
}

function get_attr_or_prop(archi_object, row_label) {
	let cell = new Object;

	if (ATTRIBUTE_LABELS.indexOf(row_label) != -1) {
		// attribute => "id", "type",

		debug(`Start ATTRIBUTE_LABELS: ${row_label})`)
		cell[row_label] = archi_object[row_label]

	} else if (ENDPOINT_LABELS.indexOf(row_label) != -1) {
		// Endpoint => "target.id", `source.prop.${PROP_ID}`
		// let endpoint = label.substring(0, label.indexOf('.'))
		// let attr_label = label.substring(label.indexOf('.'))

		const [endpoint, attr, prop] = row_label.split('.');
		debug(`Start ENDPOINT_LABELS, endpoint, attr, prop: ${row_label}, [${endpoint}, ${attr}, ${prop}])`)

		if (prop) {
			cell[row_label] = archi_object[endpoint].prop(prop)
		} else {
			cell[row_label] = archi_object[endpoint][attr]
		}
	} else {
		// property Object ID
		debug(`Start (PROPERTY LABEL: ${row_label})`)
		cell[row_label] = archi_object.prop(row_label)
	}

	return cell[row_label]
}

/**
 * Save header and data to a CSV file
 */
function saveRowsToFile(header, data, objectType) {

	let fileName_suggestion = `${model.name}_${$(selection).first().name}_${objectType}`.replace(/\s/g, "-")

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString('nl-NL')}_${fileName_suggestion}.csv`
	});

	if (exportFile != null) {

		$.fs.writeFile(exportFile, Papa.unparse({
			fields: header,
			data: data
		}));

		let exportFileName = exportFile.split("\\").pop().split("/").pop();
		let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName))
		console.log("Saved to file: " + exportFileName);
		console.log("In folder:     " + exportFilePath);
	} else {
		console.log("\nExport CSV canceled");
	}
}

/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function getRowsFromFile(importFile) {

	let rows = []
	if (importFile) {
		rows = Papa.parse(readFully(importFile, 'utf-8'), {
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

function isEmpty(obj) {
	if (typeof obj === 'object') {
		// both jArchi en JS objects have a type object, but the jArchi object gives an error for Object.keys(jArchi object)
		if (typeof obj.size === 'function') {
			// jArchi object has function size
			return obj.size() === 0
		} else {
			// for JS object. 
			return Object.keys(obj).length === 0
		}
	} else {
		console.log(`> isEmpty(obj=${obj}, typeof=${typeof obj}): only use for jArchi objects or JS object`)
	}
}