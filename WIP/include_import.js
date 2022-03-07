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

const FOUND = "found";
const NOT_FOUND = `Not found`;

const SUCCES = 0;
const INFO = 1;
const WARNING = 2;
const ERROR = 3;

// Indexing result codes
const UPDATE = "UPDATE";
const NOTHING_TO_UPDATE = "NOTHING_TO_UPDATE";
const SKIP = "SKIP";
const CREATE = "CREATE";

/**
 * import the CSV file
 * - process the given CSV file and for every row create or update an archi object
 * 
 * @param {*} importFile filepath to CSV file to import (optional, if empty you will be prompted)
 */
function importObjects(importFile) {
  debugStackPush(false);

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

      console.log(`\nTry to find objects with the keys:`);
      console.log(`- first with property ${PROP_ID},`);
      console.log(`- next with id,`);
      console.log(`- next with a combination of name and type`);
      console.log(`- next with the source- and target endpoints (if it's a relation)`);

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
          debug("\n> process all rows, find necesary action for every row");

          // process all rows from CSV file
          startCounter("importObjects");
          let results = rows.map((row, index) => processRow(row, index, rowLabels));
          debug(`importObjects ${results.length} rows (${endCounter("importObjects")}`);

          let skipped = results.filter((result) => result.resultCode === SKIP);
          let created = results.filter((result) => result.resultCode === CREATE);
          let updated = results.filter((result) => result.resultCode === UPDATE);
          let nothing_to_update = results.filter((result) => result.resultCode === NOTHING_TO_UPDATE);

          if (skipped.length > 0) {
            console.log("\nRows skipped:");
            skipped.map((result) => console.log(result.line));
          }
					if (created.length > 0) {
						console.log("\nObjects created:");
						created.map((result) => console.log(result.line));
					}
          if (updated.length > 0) {
            console.log("\nObjects updated:");
            updated.map((result) => console.log(result.line));
          }

          console.log(`\n>> rows without updates : ${nothing_to_update.length}`);
          console.log(`>> rows skipped :         ${skipped.length}`);
          console.log(`>> objects created :      ${created.length}`);
          console.log(`>> objects updated :      ${updated.length}`);
          console.log(`>> Total rows processed : ${rows.length}`);

          console.log(`\n> CSV file: ${importFileName} imported`);
        }
      }
    }
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  debug(`< `);
  debugStackPop();
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

  let findResult;
  let result = {};

  debugStackPush(true);
  debug(`row[${index + 2}] ${row.type}: ${row.name}`);

  findResult = findObject(row.type, row.name, row[PROP_ID], row.id, row);
  debug(`findResult: ${JSON.stringify(findResult)}`);

  if (findResult.findCode == FOUND) {
    result = updateObject(row, index, rowLabels, findResult);
  } else {
    if (findResult.errorCode == SUCCES) {
      result = createObject(row, index, rowLabels);
    } else {
      result.resultCode = SKIP;
      result.line = `row[${index + 2}] > SKIP ${findResult.errorText}\n`;
    }
  }

  debug(`>> processRow: ${endCounter("processRow")}\n`);
  debugStackPop();

  return result;
}

/**
 * 	find object
 *  - by property PROP_ID
 *  - by id
 *  - by name and type
 */
function findObject(row_type, row_name, row_prop_id, row_id, row) {
  startCounter("findObjects");
  let archiColl = $();
  let rowHasKey = false;
  let findCode = NOT_FOUND;
  let findText = "";
  let errorCode = SUCCES;
  let errorText = "";

  // search with property PROP_ID
  if (row_prop_id) {
    rowHasKey = true;
    archiColl = $("*").filter((obj) => obj.prop(PROP_ID) == row_prop_id);
    // a PROP_ID has to be unique
    if (archiColl.size() == 1) {
      findCode = FOUND;
      findText = `found with '${PROP_ID}'`;
      debug(`${findText}: ${archiColl.first()}; prop(${PROP_ID})=${archiColl.first().prop(row_prop_id)}`);
    } else if (archiColl.size() > 1) {
      errorCode += ERROR;
      errorText += `Error: Multiple objects with prop(${PROP_ID})=${row_prop_id}`;
      archiColl.each((obj) => (errorText += `\n> - ${obj}`));
      errorText += `\n>> Use script setObjectID.ajs to find and resolve duplicates`;

      debug(errorText);
    }
  }
  // search with Archi id
  if (row_id && findCode == NOT_FOUND) {
    rowHasKey = true;
    archiColl = $(`#${row_id}`);
    if (archiColl.size() == 1) {
      findCode = FOUND;
      findText = `found with 'id'`;
      debug(`${findText}: ${archiColl.first()}; id=${archiColl.first().id}`);
    }
  }

	// search relation with endpoints
  if (findCode == NOT_FOUND && row_type.endsWith("relationship")) {
    rowHasKey = true; // if row endpoints are not complete, it's signaled in the function
    let findRelResult = findWithEndpoints(row);
    findCode = findRelResult.findCode;
    findText = findRelResult.findText;
    if (findRelResult.errorCode != SUCCES) {
      if (errorCode < findRelResult.errorCode) errorCode = findRelResult.errorCode;
      errorText += findRelResult.errorText;
    }
    archiColl = findRelResult.archiObj;
  } else {
		// search other objects with name and type
		if (row_name && row_type && findCode == NOT_FOUND) {
			rowHasKey = true;
			archiColl = $(`.${row_name}`).filter(row_type);
			if (archiColl.size() == 1) {
				findCode = FOUND;
				findText = `found with 'name'`;
				debug(`${findText}: ${archiColl.first()}`);
			} else if (archiColl.size() > 1) {
				errorCode += WARNING;
				errorText += `Warning: Multiple objects with name=${row_name}`;
				archiColl.each((obj) => (errorText += `\n> - ${obj}`));
			}
		}
	}


  if (findCode == NOT_FOUND && row_type == "archimate-diagram-model") {
    errorCode += WARNING;
    errorText += `Warning: view not found with name=${row_name}`;
    errorText += `\n- creation of a view is not supported`;
  }

  if (!rowHasKey) {
    errorCode += ERROR;
    errorText += `Error: missing search key`;
    errorText += `\n- search keys are ${PROP_ID}, id or the combination of name and type`;
    debug(errorText);
  }

  let archiObj = archiColl.first();
  debug(`>>> findObjects: ${endCounter("findObjects")}`);

  // returns the object and how it was found
  return { findCode: findCode, findText: findText, errorCode: errorCode, errorText: errorText, archiObj: archiObj };
}

/**
 * 	find relation with endpoint values
 * 	- for finding source and target the function findObjects is used
 * 	- source and target columns must have a valid search key
 */
function findWithEndpoints(row) {
  startCounter("findRelation");
  let archiRels = $();
  let findCode = NOT_FOUND;
  let findText = "";
  let errorCode = SUCCES;
  let errorText = "";

  debug(`Row source`);
  let findSrc = findObject(row["source.type"], row["source.name"], row[`source.prop.${PROP_ID}`], row["source.id"]);
  if (findSrc.errorCode != SUCCES) {
    errorCode += findSrc.errorCode;
    errorText += `\n- Error in row source.<endpoint> columns > `;
    errorText += `${findSrc.errorText}`;
    debug(errorText);
  }
  debug(`Row target`);
  let findTgt = findObject(row["target.type"], row["target.name"], row[`target.prop.${PROP_ID}`], row["target.id"]);
  if (findTgt.errorCode != SUCCES) {
    errorCode += findTgt.errorCode;
    errorText += `\n- Error in row target.<endpoint> columns > `;
    errorText += `${findTgt.errorText}`;
    debug(errorText);
  }

  if (findSrc.findCode == FOUND && findTgt.findCode == FOUND) {
    // find relations with the source and target
    srcColl = $(`#${findSrc.archiObj.id}`);
    tgtColl = $(`#${findTgt.archiObj.id}`);

		archiRels = srcColl.outRels(row.type).filter(function (outRel) {
      // return archiTargets.has(r.target).size() > 0; // ????
      let relationWithEndpoints = tgtColl.inRels(row.type).filter(function (inRel) {
        return outRel.id == inRel.id;
      });
      return relationWithEndpoints.size() > 0;
    });

    if (archiRels.size() == 1) {
			if (row.name == archiRels.name) {
				findCode = FOUND;
				findText = `found with 'endpoints'`;
				debug(`${findText}: ${archiRels.first()}`);
			} else {
				errorCode += INFO;
				errorText += `Info: found relation with 'endpoints', but other name=${archiRels.name}`;
				debug(`${findText}: ${archiRels.first()}`);
			}
    } else if (archiRels.size() > 1) {
      errorCode += WARNING;
      errorText += `Warning: Multiple relations with source ${srcColl} and target ${tgtColl}`;
      archiRels.each((obj) => (errorText += `\n> - ${obj}`));
      debug(errorText);
    }
  }

  debug(`>>> findRelation: ${endCounter("findRelation")}`);
  return { findCode: findCode, findText: findText, errorCode: errorCode, errorText: errorText, archiObj: archiRels };
}

/**
 * 	create a new object for the row
 *  if row is a relation the source and target have to exist
 */
function createObject(row, index, rowLabels) {
  startCounter("createObject");
  let line = "";
  let resultCode = SKIP;
  let archiObject = {};
  // let newObject = { index: index, resultCode: resultCode };

  debugStackPush(false);
  // debug(`\nStart`);
  // debug(`check index row[${index +2}] = ${JSON.stringify(row)}`);
  // debug(`check index obj = ${JSON.stringify(archiObject)}`);

  if (row.type.endsWith("relationship")) {
    let findSrc = findObject(row["source.type"], row["source.name"], row[`source.prop.${PROP_ID}`], row["source.id"]);
    debug(`findSrc: ${JSON.stringify(findSrc)}`);
    let findTgt = findObject(row["target.type"], row["target.name"], row[`target.prop.${PROP_ID}`], row["target.id"]);
    debug(`findTgt: ${JSON.stringify(findTgt)}`);

    if (findSrc.findCode == FOUND && findTgt.findCode == FOUND) {
      archiObject = model.createRelationship(row.type, row.name, findSrc.archiObj, findTgt.archiObj);
    } else {
      line += `row[${index + 2}] > relation not created, no (unique) source and/or target\n`;
      line += `> found source(s): ${findSrc.archiObj}\n`;
      line += `> found target(s): ${findTgt.archiObj}`;
    }
  } else {
    archiObject = model.createElement(row.type, row.name);
  }

  if (Object.keys(archiObject).length > 0) {
    line += `row[${index + 2}] > ${CREATE} ${archiObject}`;
    createResult = { archiObj: archiObject };
    let result = updateObject(row, index, rowLabels, createResult, CREATE);
    line += result.line;
    resultCode = CREATE;
  }
  debugStackPop();
  debug(`createObject: ${resultCode} ${endCounter("createObject")}`);
  return { index: index, resultCode: resultCode, line: line };
}

/**
 * 	update the attributes and properties of the object with the CSV row values
 */
function updateObject(row, index, rowLabels, findResult, calledFrom) {
  startCounter("updateObject");
  const ATTRIBUTE_TEXT = "attribute";
  const PROPERTY_TEXT = "property";
  let lineUpdated = "";
  let line = "";
  let resultCode = NOTHING_TO_UPDATE;

  let archiObj = findResult.archiObj;
  let lineRowUpdate = `row[${index + 2}] > ${UPDATE} ${archiObj} (${findResult.findText})`;

  debugStackPush(false);
  debug(`row = ${JSON.stringify(row)}`);
  debug(`obj = ${archiObj}`);

  // update objects attributes and properties with the row cell values
  rowLabels.map((label) => {
    let labelType = ATTRIBUTE_LABELS.indexOf(label) != -1 ? ATTRIBUTE_TEXT : PROPERTY_TEXT;
    let attr_or_prop_value = get_attr_or_prop(archiObj, label);

    // remove properties with the value REMOVE_PROPERTY
    if (labelType == PROPERTY_TEXT && row[label] == REMOVE_PROPERTY_VALUE) {
      if (archiObj.prop().indexOf(label) != -1) {
        lineUpdated += `\n> remove ${labelType} ${label}: ${attr_or_prop_value}`;
        archiObj.removeProp(label);
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
        set_attr_or_prop(archiObj, row, label);
      }
    }
  });
  if (lineUpdated) {
    resultCode = UPDATE;
    if (calledFrom != CREATE) line += lineRowUpdate; // there is already a row create line
    line += lineUpdated;
    debug(`line: ${line}`);
  }
  debug(`updateObject: ${endCounter("updateObject")}`);
  debugStackPop();

  return { index: index, resultCode: resultCode, line: line };
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
