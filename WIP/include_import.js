/**
 * include_import.js
 *
 * Functions for importing model elements, relations and view properties
 * Import elements before relations
 */

// Indexing result codes
const NOT_SET = "NOT_SET";
const UPDATE = "UPDATE";
const SKIP = "SKIP";
const CREATE = "CREATE";

/**
 * import the CSV file
 * - first validate and index the rows
 * - then create or update an archi object for each row
 */
function importObjects(objectType) {
	_commonShowDebugMessage.push(false);
	debug(`objectType=${objectType}`);

	try {
		console.log(`Importing ${objectType} of CSV\n`);

		let importFile =
			window.promptOpenFile({
				title: "Open CSV",
				filterExtensions: ["*.csv"],
				fileName: `*.csv`,
			}) || "";
		// let importFileName = importFile.split("\\").pop().split("/").pop();
		let importFileName = importFile.replace(/^.*[\\\/]/, "");

		const rows = getRowsFromFile(importFile);
		console.log(`> Loaded CSV file: ${importFileName}\n`);

		if (rows.length > 0) {
			debug("\n> check header for missing columns");

			if (checkHeader(rows)) {
				const labelsToUpdate = readHeader(rows);

				debug("\n> check all rows for missing value's");
				const validateLog = rows.map((row, index) => checkRows(row, index)).filter((line) => line != "");
				console.log(`validateLog; ${validateLog}`);

				if (validateLog.length == 0) {
					debug("\n> index rows, find necesary action for every row");
					const rowIndex = rows.map((row, index) => indexRows(row, index));
					debug(`\nIndexed ${rowIndex.length} rows`);
					rowIndex.map((obj) =>
						debug(
							`row[${obj.index + 2}] > ${obj.actionCode}; ${rows[obj.index].type}: ${rows[obj.index].name} (id=${
								rows[obj.index].id
							}, Object id=${rows[obj.index][`${PROP_ID}`]})`
						)
					);

					debug(`\n> filter rows for actionCode CREATE`);
					const createRows = rowIndex.filter((obj) => obj.actionCode == CREATE);
					const createRows_Log = createRows.map((obj) => createObject(labelsToUpdate, rows[obj.index], obj));
					if (createRows_Log.length > 0) {
						console.log("\n== create Archi objects ==");
						createRows_Log.map((line) => console.log(`${line}`));
					}

					debug(`\n> filter rows for actionCode UPDATE to update`);
					const updateRows = rowIndex.filter((obj) => obj.actionCode == UPDATE);
					const updateRows_Log = updateRows
						.map((obj) => updateObject(labelsToUpdate, rows[obj.index], obj))
						.filter((line) => line != "");
					if (updateRows_Log.length > 0) {
						console.log("\n== update Archi objects ==");
						updateRows_Log.map((line) => console.log(line));
					}

					const skippedRows = rowIndex.filter((obj) => obj.actionCode == SKIP);
					// if (skippedRows.length > 0) {
					// 	console.log("\n== skipped rows ==");
					// 	skippedRows.map((row) => console.log(`row[${obj.index + 2}] > ${obj.actionCode}; ${rows[obj.index].type}: ${rows[obj.index].name}`))
					// }

					console.log("\n>> ======== ");
					console.log(`> Imported CSV file: ${importFileName}\n`);
					console.log("> Import finished");
					console.log(`>> rows processed : ${rows.length}`);
					console.log(`>> ${objectType} updated : ${updateRows_Log.length}`);
					console.log(`>> ${objectType} created : ${createRows.length}`);
					console.log(`>> ${objectType} skipped : ${skippedRows.length}`);
					console.log("");
				} else {
					console.log("\n> ======== ");
					console.log(`> Unvalid data in CSV file: ${importFileName}`);
					console.log(`> There are ${validateLog.length} unvalid rows`);
					validateLog.map((line) => console.log(`> - ${line}`));
					console.log(`\n> Correct the data and import again\n`);
				}
			} else {
				console.log(`\n> Add missing columns and run import script again`);
				console.log(`> Use export script to create a CSV file with all required columns\n`);
			}
		} else {
			console.log("\n> ======== ");
			console.log(`> no data in CSV file: ${importFileName}`);
			console.log(`\n> Select another file and import again\n`);
		}
	} catch (error) {
		console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
	}
	debug(`< `);
	_commonShowDebugMessage.pop();
}

/**
 * check importFile for missing columns
 */
function checkHeader(rows) {
	let lineAttr = "";
	let lineEndpoint = "";
	// papaparse stores a row in an array with {name, value} objects
	const headerLabels = Object.keys(rows[0]);
	console.log(`\nCSV file columns:`);
	headerLabels.map((label) => console.log(`- ${label}`));
	console.log();

	ATTRIBUTE_LABELS.forEach(function (label) {
		if (headerLabels.indexOf(label) == -1) {
			lineAttr += `- ${label}`;
		}
	});

	if (lineAttr) {
		console.log(`>> UNVALID CSV file <<\nMissing attribute columns:`);
		console.log(lineAttr);
		return false;
	}

	const relations = rows.filter((row) => row.type.endsWith("relationship"));
	if (relations.length > 0) {
		ENDPOINT_LABELS.forEach(function (label) {
			if (headerLabels.indexOf(label) == -1) {
				lineEndpoint += `- ${label}\n`;
			}
		});
	}

	if (lineEndpoint) {
		console.log(`>> UNVALID CSV file <<\nMissing columns for relations`);
		console.log(lineEndpoint);
		return false;
	}
	return true;
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
function checkRows(row, index) {
	let line = "";
	let rowNr = index + 2;

	// if we can't search by id or archi id
	if (!row.id && !row[`${PROP_ID}`]) {
		// if we can't search by name and type
		if (!row.name || !row.type) {
			// and it's not a relation
			if (!row.type.endsWith("relationship")) {
				line += `row[${rowNr}]: missing data, cannot search for object by id or by ${PROP_ID} or by name and type`;
			} else {
				// if we can't search relation by endpoints id's
				["source", "target"].forEach(function (endpoint) {
					if (!row[`${endpoint}.id`] && !row[`${endpoint}.prop.${PROP_ID}`]) {
						// and we can't search by name and type
						if (!row[`${endpoint}.name`] || !row[`${endpoint}.type`]) {
							line += `row[${rowNr}]: missing relation data, cannot search ${endpoint}-endpoint by id or by ${PROP_ID} or by name and type`;
						}
					}
				});
			}
		}
	}
	return line;
}

/**
 * importIndexRows
 * loop over all rows and index what action to perform for the row
 *
 * 	find object (element, relation or view)
 *  - first try search with Object ID => if multiple found throw error in model
 *  - next search with Archi id
 *  - next search by name
 *  if FOUND one
 *    return action update object
 *  else
 *    if relation
 *      search by endpoints
 *
 *  if found multiple objects
 *    return action skip row
 *  if not found
 *    return action create object
 */
function indexRows(row, index) {
	let archiObjects = $();
	let archiObject = $();
	let actionCode = NOT_SET;
	// rowNr follows rownumbers in spreadsheet (+1 for header and +1 for row start at 1 (index starts at 0))
	let rowNr = index + 2;
	_commonShowDebugMessage.push(false);

	archiObjects = findObjects(row.type, row.name, row[PROP_ID], row.id);
	if (archiObjects.size() == 1) {
		archiObject = archiObjects.first();
		actionCode = UPDATE;
	} else {
		if (row.type.endsWith("relationship")) {
			// search relation with endpoints
			archiObjects = findRelation(row);
			if (archiObjects.size() == 1) {
				archiObject = archiObjects.first();
				actionCode = UPDATE;
			}
		}
	}

	if (archiObjects.size() > 1) {
		console.log(`> Skip row[${rowNr}]: multiple objects found (${row.type}: ${row.name}`);
		archiObjects.each((obj) => console.log(`> - ${obj} with id=${obj.id}`));
		actionCode = SKIP;
	} else if (archiObjects.size() == 0) {
		actionCode = CREATE;
	}

	debug(`actionCode: ${actionCode}`);
	_commonShowDebugMessage.pop();

	return {
		index,
		actionCode,
		archiObject,
	};
}

function findObjects(row_type, row_name, row_prop_id, row_id) {
	let archiObjects = $();

	debug(`type=${row_type}, name:${row_name}, ${PROP_ID}=${row_prop_id}, id=${row_id}`);

	// search with property PROP_ID
	if (row_prop_id) {
		archiObjects = $(row_type).filter(function (o) {
			return o.prop(PROP_ID) == row_prop_id;
		});
	}

	// a PROP_ID has to be unique
	if (archiObjects.size() > 1) {
		let logLine = `\n>> Found multiple objects with '${PROP_ID}': ${archiObjects}`;
		logLine += `\n>> Duplicate '${PROP_ID}' are not allowed`;
		logLine += `\n>> Use script setObjectID.ajs to find and resolve duplicates`;
		throw logLine;
	}

	if (archiObjects.size() == 1) {
		debug(`Found with '${PROP_ID}': ${archiObjects.first()}; ${PROP_ID}=${archiObjects.first().prop(PROP_ID)}`);
	} else {
		// search with Archi id
		archiObjects = $(`#${row_id}`);
		if (archiObjects.size() == 1) {
			debug(`Found with id: ${archiObjects.first()}; id=${archiObjects.first().id}`);
		} else {
			// search with name and type
			if (row_name && row_type) {
				debug(`row_name: ${row_name}`);
				archiObjects = $(`.${row_name}`).filter(row_type);
				if (archiObjects.size() > 0) {
					debug(`Found with name: ${archiObjects}`);
				} else {
					debug(`Not found`);
				}
			}
		}
	}
	return archiObjects;
}

/**
 * findRelation
 * 	search relation by endpoints (source and targets)
 */
function findRelation(row) {
	let archiRelations = $();
	let archiEndpoint = [];

	debug(`Find relation with endpoints`);
	["source", "target"].forEach(function (endpoint) {
		archiEndpoint[endpoint] = $();
		archiEndpoint[endpoint] = findObjects(
			row[`${endpoint}.type`],
			row[`${endpoint}.name`],
			row[`${endpoint}.prop.${PROP_ID}`],
			row[`${endpoint}.id`]
		);
		debug(`>> ${endpoint}: ${archiEndpoint[endpoint]}`);
	});

	if (archiEndpoint["source"].size() > 0 && archiEndpoint["target"].size() > 0) {
		// find relations with the source and target
		archiRelations = archiEndpoint["source"].outRels(row.type).filter(function (outRel) {
			// return archiTargets.has(r.target).size() > 0; // ????
			let foundRel = archiEndpoint["target"].inRels(row.type).filter(function (inRel) {
				if (outRel.id == inRel.id) {
					debug(`outRel=${outRel} ${outRel.id} inRel=${inRel} ${inRel.id}`);
				}
				return outRel.id == inRel.id;
			});
			debug(`foundRel=${foundRel}`);
			return foundRel.size() > 0;
		});
		debug(`archiRelations=${archiRelations}`);
		if (archiRelations.size() > 0) {
			debug(`Found relation via endpoints=${archiRelations}`);
		} else {
			debug(`Not found relation`);
		}
	}
	return archiRelations;
}

/**
 * 	create a new object for the row
 *  if row is a relation the source and target have to exist
 */
function createObject(labelsToUpdate, row, obj) {
	let line = "";
	let newObject = { index: obj.index, actionCode: obj.actionCode };

	_commonShowDebugMessage.push(false);
	// debug(`\nStart`);
	// debug(`check index row[${obj.index +2}] = ${JSON.stringify(row)}`);
	// debug(`check index obj = ${JSON.stringify(obj.archiObject)}`);

	if (row.type.endsWith("relationship")) {
		let archiSources = $();
		let archiTargets = $();
		archiSources = findObjects(row["source.type"], row["source.name"], row[`source.prop.${PROP_ID}`], row["source.id"]);
		archiTargets = findObjects(row["target.type"], row["target.name"], row[`target.prop.${PROP_ID}`], row["target.id"]);

		if (archiSources.size() == 1 && archiTargets.size() == 1) {
			newObject.archiObject = model.createRelationship(row.type, row.name, archiSources.first(), archiTargets.first());
			line += updateObject(labelsToUpdate, row, newObject);
		} else {
			line += `> relation not created, row does not point to a unique source and target\n`;
			line += `> found sources: ${archiSources}\n`;
			line += `> found targets: ${archiSources}\n`;
		}
	} else if (row.type == "archimate-diagram-model") {
		line += `> INFO: View ${row.name} NOT created\n`;
		line += `> INFO: creation of views is not supported, use Archi merge function\n`;
	} else {
		newObject.archiObject = model.createElement(row.type, row.name);
		line = `row[${obj.index + 2}] > ${obj.actionCode} ${newObject.archiObject}`;
		line += updateObject(labelsToUpdate, row, newObject);
	}

	_commonShowDebugMessage.pop();
	return line;
}

/**
 * 	return an array with the column labels in the CSV file
 */
function readHeader(rows) {
	// papaparse stores a row in an array with {name, value} objects
	const headerLabels = Object.keys(rows[0]);
	debug(`\nheaderLabels: ${headerLabels}`);

	// Filter the columns to be imported
	// - don't import the attribute id (can't be set) and
	// - don't import the endpoints (used for finding the relation)
	const skipLabels = ["type", "id"].concat(ENDPOINT_LABELS);

	// const labelsToUpdate = headerLabels.filter((label) => skipLabels.indexOf(label) === -1);
	let labelsToUpdate = headerLabels.filter((label) => !skipLabels.includes(label));
	debug(`\nlabelsToUpdate: ${labelsToUpdate}`);

	return labelsToUpdate;
}

/**
 * importUpdateObject
 * 	update the attributes and properties of the object with the CSV row values
 */
function updateObject(labelsToUpdate, row, obj) {
	let lineUpdated = "";
	let line = "";

	_commonShowDebugMessage.push(false);
	// debug(`row = ${JSON.stringify(row)}`);
	// debug(`obj = ${JSON.stringify(obj.archiObject)}`);

	// update objects attributes and properties with the row cell values
	labelsToUpdate.map((label) => {
		let labelType = ATTRIBUTE_LABELS.indexOf(label) != -1 ? ATTRIBUTE_LABEL : PROPERTY_LABEL;

		// remove properties with the value REMOVE_PROPERTY
		if (labelType == PROPERTY_LABEL && row[label] == REMOVE_PROPERTY_VALUE) {
			if (obj.archiObject.prop().indexOf(label) != -1) {
				lineUpdated += `\n> remove ${labelType} ${label}: ${get_attr_or_prop(obj.archiObject, label)}`;
				obj.archiObject.removeProp(label);
			} //else lineUpdated += `\n> remove ${labelType} ${label}: no property`
		} else {
			// skip row cell if empty or if equal to object value
			if (row[label] && row[label] != get_attr_or_prop(obj.archiObject, label)) {
				// if (row[label] != get_attr_or_prop(obj.archiObject, label)) {
				if (get_attr_or_prop(obj.archiObject, label)) {
					lineUpdated += `\n> update ${labelType} ${label}:`;
					lineUpdated += `\n>> from: ${get_attr_or_prop(obj.archiObject, label)}`;
					lineUpdated += `\n>> to:   ${row[label]}`;
				} else {
					lineUpdated += `\n> set ${labelType} ${label}: ${row[label]}`;
				}
				set_attr_or_prop(obj.archiObject, row, label);
			}
		}
	});

	if (lineUpdated) {
		if (obj.actionCode == UPDATE) {
			line = `row[${obj.index + 2}] > ${obj.actionCode} ${obj.archiObject}`;
		}
		line += lineUpdated;
		debug(`line: ${line}`);
	}

	_commonShowDebugMessage.pop();
	return line;
}

/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function getRowsFromFile(importFile) {
	let rows = [];
	if (importFile) {
		rows = Papa.parse(readFully(importFile, "utf-8"), {
			header: true,
			encoding: "utf-8",
			skipEmptyLines: true,
		}).data;
	} else {
		console.log("> Canceled");
	}
	return rows;
}

// Some Polyfills for Nashorn ====================================================================================
function readFully(url, charset) {
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

function stripBom(string) {
	if (typeof string !== "string") {
		throw new TypeError(`Expected a string, got ${typeof string}`);
	}
	// Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
	// conversion translates it to FEFF (UTF-16 BOM).
	if (string.charCodeAt(0) === 0xfeff) {
		debug("Ignored BOM from CSV file");
		return string.slice(1);
	}
	return string;
}
