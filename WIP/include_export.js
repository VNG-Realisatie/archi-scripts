/**
 * include_export.js
 *
 * Functions for exportingmodel elements, relations and view properties
 */

_commonShowDebugMessage = [false];

function exportObjects(objectType) {
	_commonShowDebugMessage.push(false);
	debug(`objectType=${objectType}`);

	try {
		// selection is a global Archi variable with a collection of Archi objects
		// let objects = exportSelectObjects(selection, objectType);
		let collection = selectConcepts($(selection));

		// filter and convert selected Archi collection to an array
		let objects = [];
		collection.filter(objectType).each((object) => objects.push(object));

		console.log(`Creating columns and rows:`);
		const header = exportCreateHeader(objects, objectType);
		const data = objects.map((o) => exportCreateRows(header, o));

		if (data.length > 0) {
			console.log(`- ${data.length} rows for ${data.length} ${objectType}\n`);
			saveRowsToFile(header, data, objectType);
		} else {
			console.log(`- No rows, nothing to export`);
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
	debug(`< `);
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
	const propertyLabelsObject = objects.reduce((a, concept) => exportHeaderProperties(a, concept), {});
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject);

	let header = ATTRIBUTE_LABELS.concat(propertyLabels);

	if (objectType == OBJECT_TYPE_RELATION) {
		header = header.concat(ENDPOINT_LABELS);
	}

	debug(`header: ${header}\n`);
	console.log(
		`- ${header.length} columns (header with ${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties, ${ENDPOINT_LABELS.length} endpoints)`
	);

	return header;
}

/**
 * exportHeaderProperties
 * 	reduce function
 *  accumulate the new property labels of the given concepts
 *
 * @param object
 */
function exportHeaderProperties(accumulator, object) {
	object.prop().forEach(function (propLabel) {
		// accumulate all unique property labels.
		if (typeof accumulator[propLabel] == "undefined") {
			accumulator[propLabel] = propLabel;
			debug(`accumulate a[${propLabel}]: ${accumulator[propLabel]}`);
		}
	});
	return accumulator;
}

/**
 * exportCreateRows
 * create a CSV row for an exported object
 *
 * @param object
 */
function exportCreateRows(headerRow, object) {
	let row = new Object();

	_commonShowDebugMessage.push(false);
	debug(`\n> `);
	debug(`${object}`);

	// fill row with the attributes and property values of the object
	headerRow.forEach((label) => {
		row[label] = get_attr_or_prop(object, label);
	});

	debug(`Row: ${JSON.stringify(row)}`);
	_commonShowDebugMessage.pop();
	return row;
}

/**
 * Save header and data to a CSV file
 */
function saveRowsToFile(header, data, objectType) {
	let fileName_suggestion = `${model.name}_${$(selection).first().name}_${objectType}`.replace(/\s/g, "-");

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString("nl-NL")}_${fileName_suggestion}.csv`,
	});

	if (exportFile != null) {
		$.fs.writeFile(
			exportFile,
			Papa.unparse({
				fields: header,
				data: data,
			})
		);

		let exportFileName = exportFile.split("\\").pop().split("/").pop();
		let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName));
		console.log("Saved to file: " + exportFileName);
		console.log("In folder:     " + exportFilePath);
	} else {
		console.log("\nExport CSV canceled");
	}
}

/**
 * Always return the concept, also if a diagram occurence is given
 */
function useConcept(o) {
	if (o.concept) return o.concept;
	else return o;
}
