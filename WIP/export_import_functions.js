/**
/**
 * export_import_functions.js
 * 
 * Functions for exporting and importing model elements, relations and view properties
 * 
 */

const IMPORT_ATTRIBUTE_LABELS = ["type", "name", "documentation"];
const EXPORT_ATTRIBUTE_LABELS = ["id"].concat(IMPORT_ATTRIBUTE_LABELS)
const ENDPOINT_LABELS = ["source", "target"];
const ENDPOINT_ATTRIBUTE_LABELS = ["name", "id"];

// const ENDPOINT_LABELS = {
// 	"source.id" 	: ["source"]["id"],
// 	"source.name" 	: ["source"]["name"],
// 	"target.id" 	: ["target"]["id"],
// 	"target.name"	: ["target"]["name"]
// }

// var header = [];
// var data = [];

/**
 * uniquePropLabels
 * 	reduce function
 *  accumulate the new property labels of the given concepts
 * 
 * @param concept 
 */
function uniquePropLabels(a, concept) {
	concept.prop().forEach(function (propLabel) {
		// accumulate all unique property labels. 
		if (typeof a[propLabel] == 'undefined' ) {
			a[propLabel] = propLabel
			debug(`>>> accumulate a[${propLabel}]: ${a[propLabel]}`);
		}
	})
	return a
}

/**
 * map a header for all the exported columns of an element
 * 
 * @param concepts
 */
function mapHeader(concepts)
{	
	// accumulate all unique labels to one object
	const propertyLabelsObject	= concepts.reduce((a, concept) => uniquePropLabels(a, concept),{})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	const header = EXPORT_ATTRIBUTE_LABELS.concat(propertyLabels)

	debug(`>> header: ${header}\n`)
	console.log(`\nExported ${header.length} columns (${EXPORT_ATTRIBUTE_LABELS.length} attributes and ${propertyLabels.length} properties)`)

	return header
}

/**
 * map a header for all the exported columns of a relation
 * 
 * @param concepts
 */
function mapRelationHeader(concepts)
{	
	let header = mapHeader(concepts)

	// relation endpoint (source en target) attributes labels
	var endpointLabels = []
	ENDPOINT_ATTRIBUTE_LABELS.forEach(function (attribute) {
		ENDPOINT_LABELS.forEach(function (endpoint) {
			endpointLabels.push(`${endpoint}.${attribute}`)
		})
	})

	header = header.concat(endpointLabels)

	debug(`>> header: ${header}\n`)
	console.log(`Exported ${header.length} columns (added ${endpointLabels.length} relation endpoint attributes)`)

	return header
}

/**
 * Export an element as a csv row
 * 
 * @param concept 
 */
function mapData(concept) {
	let row = new Object;

	EXPORT_ATTRIBUTE_LABELS.forEach(function (attribute) {
		row[attribute] = concept[attribute];
	})

	debug(`>> ${concept}`)
	concept.prop().forEach(function (propertyLabel) {
		if (concept.prop(propertyLabel)) {
			row[propertyLabel] = concept.prop(propertyLabel);
			debug(`>> Row[${propertyLabel}]: ${row[propertyLabel]}`);
		}
	})

	debug(`>> Row ${JSON.stringify(row)}`)
	return row
}

/**
 * Export relation of given concepts
 * 
 * @param concept 
 */
function mapRelationData(concept) {
	_commonShowDebugMessage.push(false);

	let row = mapData(concept)

	// export relation endpoint (source en target) attributes
	ENDPOINT_LABELS.forEach(function (endpoint) {
		EXPORT_ATTRIBUTE_LABELS.forEach(function (attribute) {
			row[`${endpoint}.${attribute}`] = concept[endpoint][attribute];
			debug(`>>>> Row[${endpoint}.${attribute}]: ${concept[endpoint][attribute]}`);
		})
	})

	debug(`>> Row ${JSON.stringify(row)}`)

	_commonShowDebugMessage.pop();
	return row
}

/** 
 * findObject
 * 	find object with PROP_ID, archi id or name, in that order.
 */
function findObject(row, index) {
	let foundObjects={};

	// search with property PROP_ID
	if (row[PROP_ID]) {
		foundObjects = $(row['type']).filter(c => c.prop(PROP_ID) == row[PROP_ID])
		if (foundObjects.size()==1) {
			return {modelObject: foundObjects.first(), row:row, index:index, action:PROP_ID_SYNC}
		}
	}
	// search for equal archi id
	if (row['id']) {
		foundObjects = $(`#${row['id']}`)
		if (foundObjects.size()==1) {
			return {modelObject: foundObjects.first(), row:row, index:index, action:ID_SYNC}
		}
	} 

	if (row['type'].endsWith("relationship")) {
		// ####
		console.log(`> row is a ${row['type']}, not supported yet`)
		// var relationships = $(source).outRels(type).filter(function(r) 
		// 	{return r.target.equals(target)}).filter(function(r) {return r.prop(syncPropName)}).first();
		// voor relaties zoeken op source en target
	} else {
		// search by name. for  an object of the same type by name (and solve if more than one object with name exists)
		if (row['name']) {
			foundObjects = $(`.${row['name']}`).filter(row['type'])
			if (foundObjects.size()==1) {
				return {modelObject: foundObjects.first(), row:row, index:index, action:ID_SYNC}
			}
		}
	}

	if (foundObjects.size()==0) {
		console.log(`> No objects found for row[${index}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		return {modelObject: foundObjects.first(), row:row, index:index, action:CREATE_SYNC}
	} else {
		console.log(`> Multiple objects found for row[${index}] (name=${row['name']}; id=${row['id']}; ${PROP_ID}=${row[PROP_ID]})`)
		foundObjects.forEach(o => console.log(`>> ${o}`))
		return {modelObject: foundObjects.first(), row:row, index:index, action:MULTIPLE_SYNC}
	}
}

/** 
 * syncObject
 * 	synchronize the model object with row values
 */
function syncObject(object, row) {
	let line = `> Sync: ${object}`;

	// convert object to key's array
	const rowLabels = Object.keys(row);

	// synchronize object attributes with row values (attribute id cannot be changed, so skip)
	const attributes = rowLabels.filter(label => (IMPORT_ATTRIBUTE_LABELS.indexOf(label) != -1 ));
	attributes.map(label => {
		// if row has a value and row value is different than object value
		if ((row[label]) && (row[label] != object[label])) {
			if (object[label]) {
				line += `\n>>> Update attribute [${label}]: \n${object[label]}\n${row[label]}`;
			} else {
				line += `\n>>> Set attribute [${label}]: \n${row[label]}`;
			}
			object[label] = row[label]
		}
	})
	
	// synchronize object properties with row values
	const properties  = rowLabels.filter(label => (EXPORT_ATTRIBUTE_LABELS.indexOf(label) == -1 ));
	properties.map(label => {
		// Only if value of attribute/property is different
		if ((row[label]) && (row[label] != object.prop(label))) {
			if (object.prop(label)) {
				line += `\n>>> Update property [${label}]: \n${object.prop(label)}\n${row[label]}`;
			} else {
				line += `\n>>> Add property [${label}]: \n${row[label]}`;
			}
			object.prop(label,row[label])
		}
	});
	
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

// function syncLabel(label, objectLabel, rowLabel, labelType, line) {
// 	debug(`label, objectLabel, rowLabel, labelType: ${label}, ${Object.entries(objectLabel)}, ${Object.entries(rowLabel)}, ${labelType}`)
// 	// if row has a value and row value is different than object value
// 	if ((rowLabel) && (rowLabel != objectLabel)) {
// 		line += `\n>>> Set attribute [${label}]: \n${objectLabel}\n${rowLabel}`;
// 		objectLabel = rowLabel
// 	}
// }

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
		$.fs.writeFile(exportFile, Papa.unparse({ fields: header, data: data }));
		console.log(`Exported ${data.length} rows`)
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
		var rows = Papa.parse(readFully(filePath, 'utf-8'), { header: true, encoding: 'utf-8', skipEmptyLines: true }).data;

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