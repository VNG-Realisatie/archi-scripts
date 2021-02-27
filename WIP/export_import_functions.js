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

// scanned row actions
const PROP_ID_SYNC = "PROP_ID sync";
const ID_SYNC = "id sync";
const NAME_SYNC = "name sync";
const ENDPOINT_SYNC = "endpoint sync";
const CREATE_SYNC = "create";
const MULTIPLE_SYNC = "multiple";

const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_RELATION = "relation";

// const ENDPOINT_LABELS = {
// 	"source.id" 	: ["source"]["id"],
// 	"source.name" 	: ["source"]["name"],
// 	"target.id" 	: ["target"]["id"],
// 	"target.name"	: ["target"]["name"]
// }

/**
 * map a header for all the exported columns of an element
 * 
 * @param concepts
 */
function mapHeader(concepts) {
	// deduplicate the property labels  ### kan dit met een filter op een array?
	const propertyLabelsObject = concepts.reduce((a, concept) => deduplicatePropLabels(a, concept), {})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	const header = ATTRIBUTE_LABELS.concat(propertyLabels)

	debug(`>> header: ${header}\n`)
	console.log(`\nExported ${header.length} columns (${ATTRIBUTE_LABELS.length} attributes and ${propertyLabels.length} properties)`)

	return header
}

/**
 * map a header for all the exported columns of a relation
 * 
 * @param concepts
 */
function mapRelationHeader(concepts) {
	let header = mapHeader(concepts)

	// relation endpoint (source en target) attributes labels
	var endpointLabels = []
	ENDPOINT_LABELS.forEach(function (label) {
		ENDPOINTS.forEach(function (endpoint) {
			endpointLabels.push(`${endpoint}.${label}`)
		})
	})

	header = header.concat(endpointLabels)

	debug(`>> header: ${header}\n`)
	console.log(`Exported ${header.length} columns (added ${endpointLabels.length} relation endpoint attributes)`)

	return header
}

/**
 * uniquePropLabels
 * 	reduce function
 *  accumulate the new property labels of the given concepts
 * 
 * @param concept 
 */
function deduplicatePropLabels(a, concept) {
	concept.prop().forEach(function (propLabel) {
		// accumulate all unique property labels. 
		if (typeof a[propLabel] == 'undefined') {
			a[propLabel] = propLabel
			debug(`>>> accumulate a[${propLabel}]: ${a[propLabel]}`);
		}
	})
	return a
}

/**
 * Export an object (element of relation) as a csv row
 * 
 * @param concept 
 */
function mapData(concept, object_type) {
	let row = new Object;

	_commonShowDebugMessage.push(true);
	debug(`> ${concept}`)

	// export attributes
	ATTRIBUTE_LABELS.forEach(function (attribute) {
		row[attribute] = concept[attribute];
		debug(`>> Attr[${attribute}]: ${row[attribute]}`);
	})

	// export properties
	concept.prop().forEach(function (propertyLabel) {
		if (concept.prop(propertyLabel)) {
			row[propertyLabel] = concept.prop(propertyLabel);
			debug(`>> Prop[${propertyLabel}]: ${row[propertyLabel]}`);
		}
	})

	if (object_type == OBJECT_TYPE_RELATION) {

		// export relation endpoint (source en target) attributes
		ENDPOINTS.forEach(function (endpoint) {
			ENDPOINT_LABELS.forEach(function (label) {
				if (label != ENDPOINT_PROP_ID) {
					row[`${endpoint}.${label}`] = concept[endpoint][label];
					debug(`>> Endpoint[${endpoint}.${label}]: ${concept[endpoint][label]}`);
				} else {
					row[`${endpoint}.${label}`] = concept[endpoint].prop(PROP_ID);
					debug(`>> Endpoint[${endpoint}.${label}]: ${concept[endpoint].prop(PROP_ID)}`);
				}
			})
		})
	}

	debug(`> Row ${JSON.stringify(row)}`)

	_commonShowDebugMessage.pop();
	return row
}

/** 
 * findArchiObject
 * 	find object (element, relation or view) with PROP_ID, archi id or name respectively.
 */
function findArchiObject(row, index) {
	let foundObjects = {};

	rowNr = index + 2 // index plus 2 (header en start bij 0)

	// search with property PROP_ID
	if (row[PROP_ID]) {
		foundObjects = $(row['type']).filter(c => c.prop(PROP_ID) == row[PROP_ID])
		if (foundObjects.size() == 1) {
			return {
				modelObject: foundObjects.first(),
				row: row,
				index: rowNr,
				action: PROP_ID_SYNC
			}
		}
	}
	// search for equal archi id
	if (row['id']) {
		foundObjects = $(`#${row['id']}`)
		if (foundObjects.size() == 1) {
			return {
				modelObject: foundObjects.first(),
				row: row,
				index: rowNr,
				action: ID_SYNC
			}
		}
	}

	// search by name only for elements, not for relations
	if (!row['type'].endsWith("relationship")) {
		if (row['name'] && row['type']) {
			foundObjects = $(`.${row['name']}`).filter(row['type'])
			if (foundObjects.size() == 1) {
				return {
					modelObject: foundObjects.first(),
					row: row,
					index: rowNr,
					action: NAME_SYNC
				}
			}
		}
	} else {
		// search relation by endpoints (source and targets)
		console.log(`> row is a ${row['type']}, not supported yet`)

		source = findElement(row[`source.prop(${PROP_ID})`], row[`source.id`])
		target = findElement(row[`target.prop(${PROP_ID})`], row[`target.id`])

		if (source && target) {

			foundObjects = $(source).outRels(row['type']).filter(function (r) {
				return r.target.equals(target)
			});
			if (foundObjects.size() == 1) {
				return {
					modelObject: foundObjects.first(),
					row: row,
					index: rowNr,
					action: ENDPOINT_SYNC
				}
			}
		}
	}

	if (foundObjects.size() == 0) {
		console.log(`> No objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		return {
			modelObject: foundObjects.first(),
			row: row,
			index: rowNr,
			action: CREATE_SYNC
		}
	} else {
		console.log(`> Multiple objects found for row[${rowNr}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		foundObjects.forEach(o => console.log(`>> ${o}`))
		return {
			modelObject: foundObjects.first(),
			row: row,
			index: rowNr,
			action: MULTIPLE_SYNC
		}
	}
}

/** 
 */
function findElement(e_prop_id, e_id) {
	let foundObjects = {};

	// search with property PROP_ID
	if (e_prop_id) {
		foundObjects = $(row['type']).filter(c => c.prop(PROP_ID) == e_prop_id)
		if (foundObjects.size() == 1) {
			return foundObjects.first()
		}
	}
	// search for equal archi id
	if (e_id) {
		foundObjects = $(`#${e_id}`)
		if (foundObjects.size() == 1) {
			return foundObjects.first()
		}
	}
}

/** 
 * createObject
 * 	create an object for the row
 */
function createObject(row) {
	let line = '';

	let object = model.createElement(row.type, row.name);
	line = `> createObject: ${object}\n`

	line += syncObject(object, row)
	return line
}

/** 
 * syncObject
 * 	synchronize the model object with row values
 */
function syncObject(scan) {
	let lineUpdated = '';
	let line = '';

	object = scan.modelObject
	row = scan.row

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
		line = `> Update from row[${scan.index}]: ${object}`
		line += lineUpdated
	}

	// const endpointLabels = rowLabels.filter(label => label in ENDPOINT_LABELS);
	// line += endpointLabels.map(label => {
	// 	let line=''
	// 	if (label!="id"){ // id can't be set
	// 		// Only if value of attribute/property is different
	// 		if (row[label] != object[label]){
	// 			line = `\n>>> Set attribute [${label}]: \n${object[label]}\n${row[label]}`;
	// 			object[label] = row[label]
	// 		}
	// 	}
	// 	return line
	// })
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
function save2file(header, data, dataName) {

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
function loadData() {

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