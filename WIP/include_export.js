/**
 * include_export.js
 *
 * Functions for exporting model elements, relations and view properties
 */

load(__DIR__ + "../_lib/SelectCollection.js");
load(__DIR__ + "include_export_import.js");

/**
 * export selected objects to a CSV file
 *
 * ToDo:
 * - select elements and their relations
 */
function exportObjects(objectType) {
	_commonShowDebugMessage.push(false);
	debug(`objectType=${objectType}`);

	try {
		let collection = $();
		if (objectType == OBJECT_TYPE_VIEW) {
			collection = selectViews($(selection));
		} else {
			collection = selectConcepts($(selection));
		}

		// filter and convert selected Archi collection to an array
		let objects = [];
		collection.filter(objectType).each((object) => objects.push(object));

		if (objects.length > 0) {
			console.log(`Creating header with columns and rows:`);
			const header = createHeader(objects, objectType);

			const data = objects.map((o) => createRow(header, o));
			console.log(`- ${data.length} rows for ${data.length} ${objectType}\n`);

			saveRowsToFile(header, data, objectType);
		} else {
			console.log(`Empty selection. No ${objectType}s found`)
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
	_commonShowDebugMessage.pop();
}

/**
 * create a row with the column labels for the exported objects
 */
function createHeader(objects, objectType) {
	// remove duplicate property labels  ### kan dit met een filter op een array?
	const propertyLabelsObject = objects.reduce((a, obj) => findPropertyLabels(a, obj), {});
	// convert object with labels to array with labels
	const propertyLabels = Object.keys(propertyLabelsObject);

	let header = ATTRIBUTE_LABELS.concat(propertyLabels);
	let columnCounters = `header with ${ATTRIBUTE_LABELS.length} attributes, ${propertyLabels.length} properties`;

	if (objectType == OBJECT_TYPE_RELATION) {
		header = header.concat(ENDPOINT_LABELS);
		columnCounters += `, ${ENDPOINT_LABELS.length} endpoints`;
	}
	if (FOLDER_LABEL) {
		header.push(FOLDER_LABEL);
		columnCounters += `, 1 ${FOLDER_LABEL}`;
	}

	debug(`header: ${header}\n`);
	console.log(`- ${header.length} columns (${columnCounters})`);

	return header;
}

/**
 * loop over all objects en find all unique property names
 */
function findPropertyLabels(accumulator, object) {
	object.prop().forEach(function (propLabel) {
		// accumulate all unique property labels.
		if (typeof accumulator[propLabel] == "undefined") {
			accumulator[propLabel] = propLabel;
			debug(`add property to accumulator: ${accumulator[propLabel]}`);
		}
	});
	return accumulator;
}

/**
 * create a CSV row for an exported object
 */
function createRow(headerRow, object) {
	let row = new Object();

	_commonShowDebugMessage.push(false);
	debug(`\n> `);
	debug(`${object}`);

	// fill row with the attributes and property values of the object
	headerRow.forEach((label) => {
		row[label] = get_attr_or_prop(object, label);
	});

	if (FOLDER_LABEL) {
		// row[FOLDER_LABEL] = get_folderPath($(`#${object.id}`), "");
		row[FOLDER_LABEL] = get_folderPath(object, "");
		debug(`row[FOLDER_LABEL]: ${row[FOLDER_LABEL]}`);
	}

	debug(`Row: ${JSON.stringify(row)}`);
	_commonShowDebugMessage.pop();
	return row;
}

/**
 * get objects folderpath by recursively walkin up the parentfolders
 */
function get_folderPath(child, currentFolderName) {
	let parent = $(`#${child.id}`).parent("folder");
	if (parent.size() == 0) return currentFolderName;

	let folderName = `${parent.first().name}/${currentFolderName}`;
	return get_folderPath(parent.first(), folderName);
}

/**
 * Save header and data to a CSV file
 */
function saveRowsToFile(header, data, objectType) {
	let fileName_suggestion = `${model.name}_${$(selection).first().name}_${objectType}`.replace(/\s/g, "-");
	if (selection.is("archimate-model")) {
		fileName_suggestion = `${model.name}_${objectType}`.replace(/\s/g, "-");
	}

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString("nl-NL")}_${fileName_suggestion}.csv`,
	});

	if (exportFile != null) {
		$.fs.writeFile(
			exportFile,
			Papa.unparse(
				{
					fields: header,
					data: data,
				},
				{ quotes: true }
			)
		);
		let exportFileName = exportFile.split("\\").pop().split("/").pop();
		let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName));
		console.log("Saved to file: " + exportFileName);
		console.log("In folder:     " + exportFilePath);
	} else {
		console.log("\nExport CSV canceled");
	}
}
