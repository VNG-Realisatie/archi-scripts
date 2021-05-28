/**
 * include_import.js
 *
 * Functions for importing model elements, relations and view properties
 *
 * You can use this script for
 * - roundtripping; use the export and import script to bulk update properties
 * - synchronize objects between models. In order the objects are searched with:
 * 		- the property PROP_ID is equal or
 * 		- the Archi id is equal or (if so, you probably better use the Archi import function)
 * 		- the name and type are equal
 * - bulk create objects from another source.
 *
 * To see a valid CSV file with all the used column names, just create one with the export script
 * - you can add columns. The column header will be imported as a property name
 * - you can change the objects name, documentation and all properties
 * - empty cells are ignored
 * 		- to remove a property, use the value REMOVE_PROPERTY_VALUE
 * 		- you cannot remove an attribute, but you can use a single space as a value
 *
 * Updated are the attributes name and documentation and the properties
 *
 * Make sure you import elements before relations. You can't create relations without a source and target
 *
 */
load(__DIR__ + "include_export_import.js");

// use this value in a property column to remove a property from the object
const REMOVE_PROPERTY_VALUE = "<remove>";

// Indexing result codes
const UPDATE = "UPDATE";
const SKIP = "SKIP";
const CREATE = "CREATE";

/**
 * import the CSV file
 * - first validate and index the rows
 * - then create or update an archi object for each row
 */
function importObjects(importFile) {
	_commonShowDebugMessage.push(false);

	try {
		console.log(`Importing objects of CSV`);

		if (!importFile) {
			importFile = window.promptOpenFile({
				title: "Open CSV",
				filterExtensions: ["*.csv"],
				fileName: "*.csv",
			});
		}
		if (!importFile) {
			console.log("> Canceled");
		} else {
			let importFileName = importFile.replace(/^.*[\\\/]/, "");
			console.log(`> Loaded CSV file: ${importFileName}`);

			let rows = getRowsFromFile(importFile);
			if (rows.length == 0) {
				console.log("\n> ======== ");
				console.log(`> no data in CSV file: ${importFileName}`);
				console.log(`\n> Select another file and import again\n`);
			} else {
				debug("\n> check header for missing columns");
				let rowLabels = get_labelsToUpdate(rows);
				if (rowLabels.length == 0) {
					console.log(`\n> Add missing columns and run import script again`);
					console.log(`> Use export script to create a CSV file with all required columns\n`);
				} else {
					debug("\n> check all rows for missing value's");
					startCounter("checkRows");
					let checkRowLog = rows.map((row, index) => checkRow(row, index)).filter((line) => line != "");
					debug(`checkRows: ${endCounter("checkRows")}`);
					if (checkRowLog.length > 0) {
						console.log("\n> ======== ");
						console.log(`> Unvalid data in CSV file: ${importFileName}`);
						console.log(`> There are ${checkRowLog.length} unvalid rows`);
						checkRowLog.map((line) => console.log(`> - ${line}`));
						console.log(`\n> Correct the data and import again\n`);
					} else {
						debug("\n> index rows, find necesary action for every row");

						// process all rows from CSV file
						startCounter("importObjects");
						let allResults = rows.map((row, index) => processRow(row, index, rowLabels));
						debug(`importObjects ${allResults.length} rows (${endCounter("importObjects")}`);

						let results = allResults.filter((result) => result.line != "");
						if (results.length > 0) console.log("\nRows with changes:");
						else console.log("\nNo changes in CSV file");
						results.map((result) => console.log(result.line));

						console.log(`\n> Imported CSV file: ${importFileName}`);
						console.log(`>> rows processed :  ${rows.length}`);
						console.log(`>> rows skipped :    ${results.filter((result) => result.actionCode === SKIP).length}`);
						console.log(`>> objects updated : ${results.filter((result) => result.actionCode === UPDATE).length}`);
						console.log(`>> objects created : ${results.filter((result) => result.actionCode === CREATE).length}`);
					}
				}
			}
			rows = null;
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
	debug(`< `);
	_commonShowDebugMessage.pop();
}

/**
 * check importFile for missing columns
 * return array with column labels to update objects
 */
function get_labelsToUpdate(rows) {
	let rowLabels = [];

	function checkLabel(labels, labelType) {
		let line = "";
		labels.forEach(function (label) {
			if (headerLabels.indexOf(label) == -1) line += `- ${label}`;
		});
		if (line) {
			console.log(`\n>> UNVALID CSV file <<\nMissing ${labelType} columns:`);
			console.log(line);
			return false;
		}
		return true;
	}

	// papaparse stores a row in an array with {name, value} objects
	let headerLabels = Object.keys(rows[0]);
	console.log(`\nCSV file columns:`);
	headerLabels.map((label) => console.log(`- ${label}`));

	// check if there is a column for the attributes
	let attrCheck = checkLabel(ATTRIBUTE_LABELS, "attribute");

	// check for relations if the endpoints columns are present
	let endpointCheck = true;
	let relations = rows.filter((row) => row.type.endsWith("relationship"));
	if (relations.length > 0) {
		endpointCheck = checkLabel(ENDPOINT_LABELS, "endpoint");
	}
	if (attrCheck && endpointCheck) {
		rowLabels = headerLabels.filter((label) => !LABELS_NOT_TO_UPDATE.includes(label));
		debug(`\nlabelsToUpdate: ${rowLabels}`);
	}
	return rowLabels;
}

/**
 * check importFile for rows with missing data
 * a valid row can be found or can be created
 * - finding an object:
 *  - by id: object id or archi id is present
 *  - by name: name and type are present
 * - relation are also searched by endpoints
 *  - by endpoints: for source and target same rules as for finding an object
 */
function checkRow(row, index) {
	let line = "";
	// if we can't search by id or archi id
	if (!row.id && !row[`${PROP_ID}`]) {
		// if we can't search by name and type
		if (!row.name || !row.type) {
			// and it's not a relation
			if (!row.type.endsWith("relationship")) {
				line += `row[${index + 2}]: missing data, cannot search for object by id or by ${PROP_ID} or by name and type`;
			} else {
				// if we can't search relation by endpoints id's
				["source", "target"].forEach(function (endpoint) {
					if (!row[`${endpoint}.id`] && !row[`${endpoint}.prop.${PROP_ID}`]) {
						// and we can't search endpoints by name and type
						if (!row[`${endpoint}.name`] || !row[`${endpoint}.type`]) {
							line += `row[${
								index + 2
							}]: missing relation data, cannot search ${endpoint}-endpoint by id or by ${PROP_ID} or by name and type`;
						}
					}
				});
			}
		}
	}
	return line;
}

/**
 * loop over all rows and index what action to perform for the row
 *
 * 	find object (element, relation or view)
 *  - first try search with Object ID => if multiple found throw error in model
 *  - next search with Archi id
 *  - next search by name
 *  if FOUND one
 *    update object
 *  else
 *    if relation
 *      search by endpoints
 * 			if found update relation
 *
 *  if found multiple objects
 *    skip row
 *  if not found
 *    create object
 *
 * 	return result object with log info
 */
function processRow(row, index, rowLabels) {
	startCounter("processRow");

	let archiObjects = $();
	let result = {};

	_commonShowDebugMessage.push(false);
	debug(`row[${index + 2}] ${row.type}: ${row.name}`);

	archiObjects = findObjects(row.type, row.name, row[PROP_ID], row.id);
	if (archiObjects.size() == 1) {
		result = updateObject(row, index, rowLabels, archiObjects.first(), UPDATE);
	} else {
		if (row.type.endsWith("relationship")) {
			// search relation with endpoints
			archiObjects = findRelation(row);
			if (archiObjects.size() == 1) {
				result = updateObject(row, index, rowLabels, archiObjects.first(), UPDATE);
			}
		}
	}

	if ((archiObjects.size() == 0 && row.type == "archimate-diagram-model") || archiObjects.size() > 1) {
		result = skipObjects(row, index, archiObjects);
	} else if (archiObjects.size() == 0) {
		result = createObject(row, index, rowLabels);
	}

	debug(`>> processRow: ${endCounter("processRow")}\n`);
	_commonShowDebugMessage.pop();

	return result;
}

function findObjects(row_type, row_name, row_prop_id, row_id) {
	startCounter("findObjects");
	let archiObjects = $();
	let rowKeys = false;

	// search with property PROP_ID
	if (row_prop_id) {
		rowKeys = true;
		archiObjects = $("*").filter((obj) => obj.prop(PROP_ID) == row_prop_id);
	}

	// a PROP_ID has to be unique
	if (archiObjects.size() > 1) {
		let logLine = `\n>> Error in model.`;
		logLine += `\n>> Found objects with duplicate '${PROP_ID}':`;
		archiObjects.each((obj) => (logLine += `\n>> - ${obj} with id=${obj.id}`));
		logLine += `\n>> Use script setObjectID.ajs to find and resolve duplicates`;
		throw logLine;
		// return archiObjects;
	}

	if (archiObjects.size() == 1) {
		debug(`Found with '${PROP_ID}': ${archiObjects.first()}; ${PROP_ID}=${archiObjects.first().prop(PROP_ID)}`);
	} else {
		// search with Archi id
		if (row_id) {
			rowKeys = true;
			archiObjects = $(`#${row_id}`);
		}
		if (archiObjects.size() == 1) {
			debug(`Found with id: ${archiObjects.first()}; id=${archiObjects.first().id}`);
		} else {
			// search with name and type
			if (row_name && row_type) {
				rowKeys = true;
				archiObjects = $(`.${row_name}`).filter(row_type);
				if (archiObjects.size() > 0) {
					debug(`Found with name: ${archiObjects}`);
				} else {
					debug(`Not found name`);
				}
			} else {
				debug(`Not found, no name`);
			}
		}
	}
	if (!row_type.endsWith("relationship") && !rowKeys) {
		console.log(`row[${10 + 2}]: missing data, cannot search for object by id or by ${PROP_ID} or by name and type`);
	}
	debug(`>>> findObjects: ${endCounter("findObjects")}`);
	return archiObjects;
}

/**
 * 	find relation with endpoints (source and targets)
 */
function findRelation(row) {
	startCounter("findRelation");
	let archiRelations = $();
	let archiSources,
		archiTargets = $();
	debug(`Row source`);
	archiSources = findObjects(row["source.type"], row["source.name"], row[`source.prop.${PROP_ID}`], row["source.id"]);
	debug(`Row target`);
	archiTargets = findObjects(row["target.type"], row["target.name"], row[`target.prop.${PROP_ID}`], row["target.id"]);

	if (archiSources.size() > 0 && archiTargets.size() > 0) {
		// find relations with the source and target
		archiRelations = archiSources.outRels(row.type).filter(function (outRel) {
			// return archiTargets.has(r.target).size() > 0; // ????
			let relationWithEndpoints = archiTargets.inRels(row.type).filter(function (inRel) {
				if (outRel.id == inRel.id) {
					debug(`outRel=${outRel} ${outRel.id} inRel=${inRel} ${inRel.id}`);
				}
				return outRel.id == inRel.id;
			});
			debug(`foundRel=${relationWithEndpoints}`);
			return relationWithEndpoints.size() > 0;
		});

		if (archiRelations.size() > 0) {
			debug(`Found via endpoints=${archiRelations}`);
		} else {
			debug(`Not found relation`);
		}
	}
	debug(`>>> findRelation: ${endCounter("findRelation")}`);
	return archiRelations;
}

/**
 * 	create a new object for the row
 *  if row is a relation the source and target have to exist
 */
function createObject(row, index, rowLabels) {
	startCounter("createObject");
	let line = "";
	let archiObject = {};
	// let newObject = { index: index, actionCode: actionCode };

	_commonShowDebugMessage.push(false);
	// debug(`\nStart`);
	// debug(`check index row[${index +2}] = ${JSON.stringify(row)}`);
	// debug(`check index obj = ${JSON.stringify(archiObject)}`);

	if (row.type.endsWith("relationship")) {
		let archiSources,
			archiTargets = $();
		archiSources = findObjects(row["source.type"], row["source.name"], row[`source.prop.${PROP_ID}`], row["source.id"]);
		archiTargets = findObjects(row["target.type"], row["target.name"], row[`target.prop.${PROP_ID}`], row["target.id"]);

		if (archiSources.size() == 1 && archiTargets.size() == 1) {
			archiObject = model.createRelationship(row.type, row.name, archiSources.first(), archiTargets.first());
			line += `row[${index + 2}] > ${CREATE} ${archiObject}`;
			let result = updateObject(row, index, rowLabels, archiObject, CREATE);
			line += result.line;
		} else {
			line += `row[${index + 2}] > relation not created, no (unique) source and/or target\n`;
			line += `> found source(s): ${archiSources}\n`;
			line += `> found target(s): ${archiTargets}`;
		}
	} else {
		archiObject = model.createElement(row.type, row.name);
		line += `row[${index + 2}] > ${CREATE} ${archiObject}`;
		let result = updateObject(row, index, rowLabels, archiObject, CREATE);
		line += result.line;
	}
	_commonShowDebugMessage.pop();
	debug(`createObject: ${endCounter("createObject")}`);
	return { index: index, actionCode: CREATE, line: line };
}

/**
 * 	update the attributes and properties of the object with the CSV row values
 */
function updateObject(row, index, rowLabels, archiObject, actionCode) {
	startCounter("updateObject");
	const ATTRIBUTE_TEXT = "attribute";
	const PROPERTY_TEXT = "property";
	let lineUpdated = "";
	let line = "";
	let lineBeforeUpdate = `row[${index + 2}] > ${UPDATE} ${archiObject}`;

	_commonShowDebugMessage.push(false);
	// debug(`row = ${JSON.stringify(row)}`);
	// debug(`obj = ${JSON.stringify(archiObject)}`);

	// update objects attributes and properties with the row cell values
	rowLabels.map((label) => {
		let labelType = ATTRIBUTE_LABELS.indexOf(label) != -1 ? ATTRIBUTE_TEXT : PROPERTY_TEXT;
		let attr_or_prop_value = get_attr_or_prop(archiObject, label);

		// remove properties with the value REMOVE_PROPERTY
		if (labelType == PROPERTY_TEXT && row[label] == REMOVE_PROPERTY_VALUE) {
			if (archiObject.prop().indexOf(label) != -1) {
				lineUpdated += `\n> remove ${labelType} ${label}: ${attr_or_prop_value}`;
				archiObject.removeProp(label);
			}
		} else {
			// skip row cell if empty or if equal to object value
			if (row[label] && row[label] != attr_or_prop_value) {
				// if (row[label] != attr_or_prop_value) {
				if (attr_or_prop_value) {
					lineUpdated += `\n> update ${labelType} ${label}:`;
					lineUpdated += `\n>> from: ${attr_or_prop_value}`;
					lineUpdated += `\n>> to:   ${row[label]}`;
				} else {
					lineUpdated += `\n> set ${labelType} ${label}: ${row[label]}`;
				}
				set_attr_or_prop(archiObject, row, label);
			}
		}
	});
	if (lineUpdated) {
		if (actionCode != CREATE) {
			line = lineBeforeUpdate;
		}
		line += lineUpdated;
		debug(`line: ${line}`);
	}
	debug(`updateObject: ${endCounter("updateObject")}`);
	_commonShowDebugMessage.pop();

	return { index: index, actionCode: UPDATE, line: line };
}

/**
 * 	log skipped rows
 */
function skipObjects(row, index, archiObjects) {
	let line = "";

	if (row.type == "archimate-diagram-model") {
		line += `row[${index + 2}] > SKIP create view ${row.name}\n`;
		line += `> creation of views is not supported`;
	} else {
		line += `row[${index + 2}] > SKIP multiple objects found (${row.type}: ${row.name})`;
		archiObjects.each((obj) => (line += `\n> - ${obj} with id=${obj.id}`));
	}

	return { index: index, actionCode: SKIP, line: line };
}

/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function getRowsFromFile(importFile) {
	let rows = [];

	startCounter("getRowsFromFile");
	rows = Papa.parse(readFully(importFile, "utf-8"), {
		header: true,
		encoding: "utf-8",
		skipEmptyLines: true,
	}).data;
	debug(`getRowsFromFile: ${endCounter("getRowsFromFile")}`);

	return rows;
}

// Some Polyfills for Nashorn =================================
function readFully(url, charset) {
	// From https://github.com/sindresorhus/strip-bom
	function stripBom(string) {
		if (typeof string !== "string") {
			throw new TypeError(`Expected a string, got ${typeof string}`);
		}
		// Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
		// conversion translates it to FEFF (UTF-16 BOM).
		if (string.charCodeAt(0) === 0xfeff) {
			debug("Strip BOM from CSV file");
			return string.slice(1);
		}
		return string;
	}

	var result = "";
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
		line = stripBom(line);
		while (line != null) {
			result += line + "\n";
			line = reader.readLine();
		}
		reader.close();
	}
	return result;
}
