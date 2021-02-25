/**
/**
 * export_import_functions.js
 * 
 * Functions for exporting and importing model elements, relations and view properties
 * 
 */

const ATTRIBUTE_LABELS = ["id", "type", "name", "documentation"];
const ENDPOINT_LABELS = ["source", "target"];
const ENDPOINT_ATTRIBUTE_LABELS = ["name", "id"];

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
 * Create a header for all the exported columns of an element
 * 
 * @param concepts
 */
function elementHeader(concepts)
{	
	// accumulate all unique labels to one object
	const propertyLabelsObject	= concepts.reduce((a, concept) => uniquePropLabels(a, concept),{})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	const header = ATTRIBUTE_LABELS.concat(propertyLabels)

	debug(`>> header: ${header}\n`)
	console.log(`\nExported ${header.length} columns (${ATTRIBUTE_LABELS.length} attributes and ${propertyLabels.length} properties)`)

	return header
}

/**
 * Export an element as a csv row
 * 
 * @param concept 
 */
function elementData(concept) {
	let row = new Object;

	ATTRIBUTE_LABELS.forEach(function (attribute) {
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
 * Create a header for all the exported columns of a relation
 * 
 * @param concepts
 */
function relationHeader(concepts)
{	
	// accumulate all unique labels to one object
	const propertyLabelsObject	= concepts.reduce((a, concept) => uniquePropLabels(a, concept),{})
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject)

	// relation endpoint (source en target) attributes labels
	var endpointLabels = []
	ENDPOINT_ATTRIBUTE_LABELS.forEach(function (attribute) {
		ENDPOINT_LABELS.forEach(function (endpoint) {
			endpointLabels.push(`${endpoint}.${attribute}`)
		})
	})

	const header = ATTRIBUTE_LABELS.concat(propertyLabels).concat(endpointLabels)

	debug(`>> header: ${header}\n`)
	console.log(`\nExported ${header.length} columns (${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties and ${endpointLabels.length} endpoint attributes)`)

	return header
}

/**
 * Export relation of given concepts
 * 
 * @param concept 
 */
function relationData(concept) {
	let row = new Object;

	// export relation attributes
	ATTRIBUTE_LABELS.forEach(function (attribute) {
		row[attribute] = `${concept[attribute]}`;
	})

	// export relation properties
	debug(`>> ${concept}`)
	concept.prop().forEach(function (propertyLabel) {
		if (concept.prop(propertyLabel)) {
			row[propertyLabel] = concept.prop(propertyLabel);
			debug(`>> Row[${propertyLabel}]: ${row[propertyLabel]}`);
		}
	})

	// export relation endpoint (source en target) attributes
	ENDPOINT_LABELS.forEach(function (endpoint) {
		ATTRIBUTE_LABELS.forEach(function (attribute) {
			// ### headerLabel(`${endpoint}.${attribute}`)

			row[`${endpoint}.${attribute}`] = concept[endpoint][attribute];
			debug(`>>>> Row[${endpoint}.${attribute}]: ${concept[endpoint][attribute]}`);
		})
	})

	debug(`>> Row ${JSON.stringify(row)}`)

	return row
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
 * Always return the concept, also if a diagram occurence is given
 */
function useConcept(o) {
	if (o.concept)
		return o.concept;
	else
		return o;
}