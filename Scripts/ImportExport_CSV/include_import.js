/**
 * Import elements, relations or views and their properties
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
 * Import elements before relations. You can't create relations without a source and target
 *
 */
console.log("Loading include_import.js");
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");
const ExportImport = require(__DIR__ + "include_export_import.js");

// use this value in a property column to remove a property from the object
const REMOVE_PROPERTY_VALUE = "<remove>";

// find object codes
const FOUND = "found";
const NOT_FOUND = `Not found`;

// processing error codes
const SUCCES = 0;
const WARNING = 1;
const ERROR = 2;

// Indexing result codes
const NOTHING_TO_UPDATE = "NOTHING_TO_UPDATE";
const SKIP = "SKIP";
const UPDATE = "UPDATE";
const CREATE = "CREATE";

const ADD_SYNC_PROPERTIES = true;
const PROP_IMPORT = "Latest Import Date";
const PROP_IMPORT_DELETED = "Import deleted";
const PROP_IMPORT_CREATED = "Import created";
const PROP_IMPORT_UPDATED = "Import updated";

// Compute the date which will appear in every new or updated concepts - Has to be
var currentDateTime = Common.getFormattedDateTime();

/**
 * import the CSV file
 * - process the given CSV file and for every row create or update an archi object
 *
 * @param {string} importFile -  filepath to CSV file to import (optional, if empty you will be prompted)
 * @param {boolean} sync  - add PROP_IMPORT properties
 * @param {*} transformRowFn - mapping function for data
 */
function importObjects(importFile, sync = false, transformRowFn) {
  Common.debugStackPush(false);

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

      console.log(`\nTry to match object types (elements, relations and views):`);
      if (ExportImport.PROP_ID) console.log(`- property '${ExportImport.PROP_ID}' and if not found with the 'Archi id'`);
      else console.log(`- with the Archi id`);
      console.log(`if object not found, try to match:`);
      console.log(`- elements and views with a combination of name and type`);
      console.log(`- relations with the endpoints and type`);

      let rows = _getRowsFromFile(importFile, transformRowFn);
      if (rows.length == 0) {
        console.log("\n> ======== ");
        console.log(`> no data in CSV file: ${importFileName}`);
        console.log(`\n> Select another file and import again\n`);
      } else {
        Common.debug("\n> check header for missing columns");
        let headerLabels = _get_headerLabels(rows);
        if (headerLabels.length == 0) {
          console.log(`\n> Add missing columns and run import script again`);
          console.log(`> Use export script to create a CSV file with all required columns\n`);
        } else {
          Common.debug("\n> process all rows, find necesary action for every row");

          // process all rows from CSV file
          Common.startCounter("importObjects");
          let results = rows.map((row, index) => _processRow(row, index, headerLabels, sync));
          Common.debug(`importObjects ${results.length} rows (${Common.endCounter("importObjects")}`);

          let skipped = results.filter((result) => result.resultCode === SKIP);
          let created = results.filter((result) => result.resultCode === CREATE);
          let updated = results.filter((result) => result.resultCode === UPDATE);
          let nothing_to_update = results.filter((result) => result.resultCode === NOTHING_TO_UPDATE);

          if (skipped.length > 0) {
            console.log("\nRows skipped with a WARNING or ERROR:");
            skipped.map((result) => console.log(result.line));
          }
          if (created.length > 0) {
            console.log("\nRows with objects to create:");
            created.map((result) => console.log(result.line));
          }
          if (updated.length > 0) {
            console.log("\nRows with object updates:");
            updated.map((result) => console.log(result.line));
          }

          console.log(`\n>> rows without updates : ${nothing_to_update.length}`);
          console.log(`>> rows skipped :         ${skipped.length}`);
          console.log(`>> objects created :      ${created.length}`);
          console.log(`>> objects updated :      ${updated.length}`);
          console.log(`>> Total rows processed : ${rows.length}`);

          if (sync) {
            _tagDeletedConcepts();
            console.log(`\n> CSV file: ${importFileName} synchronized`);
          } else {
            console.log(`\n> CSV file: ${importFileName} imported`);
          }
        }
      }
    }
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  Common.debug(`< `);
  Common.debugStackPop();
}

function _tagDeletedConcepts() {
  console.log("INFO - Looking for deleted elements or relationships and tagging them as deleted...");
  var deleted = 0;

  $("concept")
    .filter(function (c) {
      lastUpdateDate = c.prop(PROP_IMPORT);
      if (lastUpdateDate) {
        return lastUpdateDate != currentDateTime;
      } else {
        return false;
      }
    })
    .each(function (c) {
      if (!c.prop(PROP_IMPORT_DELETED)) {
        c.name = `[DELETED] ${c.name}`;
        c.prop(PROP_IMPORT_DELETED, currentDateTime);
        deleted++;
      }
    });

  console.log(`INFO - ${deleted} elements or relationships have been tagged as deleted`);
}

/**
 * check importFile for missing columns
 * return array with header labels to update objects
 */
function _get_headerLabels(rows) {
  // check if there is a column for the attributes
  const allHeaderLabels = Object.keys(rows[0]);
  let attrCheck = _checkLabel(ExportImport.ATTRIBUTE_LABELS, "attribute", allHeaderLabels);

  // and for relations if the endpoints columns are present
  let endpointCheck = true;
  let relationRows = rows.filter((row) => row.type.endsWith("relationship"));
  if (relationRows.length > 0) {
    endpointCheck = _checkLabel(ExportImport.ENDPOINT_LABELS, "endpoint", allHeaderLabels);
  }

  let headerLabels = [];
  if (attrCheck && endpointCheck) {
    headerLabels = allHeaderLabels.filter((label) => !ExportImport.COLUMNS_NOT_TO_IMPORT.includes(label));
    Common.debug(`\nlabelsToUpdate: ${headerLabels}`);
  }
  return headerLabels;

  function _checkLabel(labels, labelType, allHeaderLabels) {
    let line = "";
    labels.forEach((label) => {
      if (!allHeaderLabels.includes(label)) line += `- ${label}\n`;
    });
    if (line) {
      console.log(`\n>> UNVALID CSV file <<\nMissing ${labelType} columns:`);
      console.log(line);
      return false;
    }
    return true;
  }
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
function _processRow(row, index, rowLabels, sync) {
  Common.startCounter("processRow");

  let findResult;
  let result = {};

  Common.debugStackPush(false);
  Common.debug(`row[${index + 2}] ${row.type}: ${row.name}`);

  // Search without whitespaces
  row.type = row.type.trim();
  row.name = row.name.trim();
  row.id = row.id.trim();
  findResult = _findObject(row.type, row.name, row[ExportImport.PROP_ID], row.id, row);
  Common.debug(`findResult: ${JSON.stringify(findResult)}`);

  if (findResult.findCode == FOUND) {
    result = _updateObject(row, index, rowLabels, findResult, "uitzoeken", sync);
  } else {
    if (findResult.errorCode == SUCCES) {
      result = _createObject(row, index, rowLabels, sync);
    } else {
      result.resultCode = SKIP;
      result.line = `row[${index + 2}] ${SKIP}\n`;
      result.line += `  > ${findResult.errorText}\n`;
    }
  }

  Common.debug(`>> processRow: ${Common.endCounter("processRow")}\n`);
  Common.debugStackPop();

  return result;
}

/**
 * 	find object
 *  - by property PROP_ID
 *  - by id
 *  - by name and type
 */
function _findObject(row_type, row_name, row_prop_id, row_id, row) {
  Common.startCounter("findObjects");
  let archiColl = $();
  let rowHasKey = false;
  let findCode = NOT_FOUND;
  let findText = "";
  let errorCode = SUCCES;
  let errorText = "";

  // search with property PROP_ID
  if (row_prop_id) {
    rowHasKey = true;
    if (!row_type) row_type = "*";
    archiColl = $(row_type).filter((obj) => obj.prop(ExportImport.PROP_ID) == row_prop_id);
    // a PROP_ID has to be unique
    if (archiColl.size() == 1) {
      findCode = FOUND;
      findText = `found with '${ExportImport.PROP_ID}'`;
      Common.debug(`${findText}: ${archiColl.first()}; prop(${ExportImport.PROP_ID})=${archiColl.first().prop(row_prop_id)}`);
    } else if (archiColl.size() > 1) {
      errorCode += ERROR;
      errorText += `Error: Multiple objects with prop(${ExportImport.PROP_ID})=${row_prop_id}`;
      archiColl.each((obj) => (errorText += `> - ${obj}\n`));
      errorText += `>> Use script setObjectID.ajs to find and resolve duplicates\n`;

      Common.debug(errorText);
    }
  }
  // search with Archi id
  if (row_id && findCode == NOT_FOUND) {
    rowHasKey = true;
    archiColl = $(`#${row_id}`);
    if (archiColl.size() == 1) {
      findCode = FOUND;
      findText = `found with 'id'`;
      Common.debug(`${findText}: ${archiColl.first()}; id=${archiColl.first().id}`);
    }
  }

  // search relation with endpoints
  if (findCode == NOT_FOUND && row_type.endsWith("relationship")) {
    rowHasKey = true; // if row endpoints are not complete, it's signaled in the function
    let findRelResult = _findWithEndpoints(row);
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
        Common.debug(`${findText}: ${archiColl.first()}`);
      } else if (archiColl.size() > 1) {
        errorCode += WARNING;
        errorText += `Warning: Multiple objects with name=${row_name}\n`;
        archiColl.each((obj) => (errorText += `  - ${obj}\n`));
      }
    }
  }

  if (findCode == NOT_FOUND && row_type == "archimate-diagram-model") {
    errorCode += WARNING;
    errorText += `Warning: View not found with name=${row_name}\n`;
    errorText += `- creation of a view is not supported\n`;
    errorText += `- only update of a views properties\n`;
  }

  if (!rowHasKey) {
    errorCode += ERROR;
    errorText += `Error: missing search key\n`;
    if (ExportImport.PROP_ID) errorText += `- search keys are ${ExportImport.PROP_ID}, 'id' or the combination of name and type\n`;
    else errorText += `- search keys are 'id' or the combination of name and type (PROP_ID skipped)\n`;
    Common.debug(errorText);
  }

  let archiObj = archiColl.first();
  Common.debug(`>>> findObjects: ${Common.endCounter("findObjects")}`);

  // returns the object and how it was found
  return { findCode: findCode, findText: findText, errorCode: errorCode, errorText: errorText, archiObj: archiObj };
}

/**
 * 	find relation with endpoint values
 * 	- for finding source and target the function findObjects is used
 * 	- source and target columns must have a valid search key
 */
function _findWithEndpoints(row) {
  Common.startCounter("findRelation");
  let archiRels = $();
  let findCode = NOT_FOUND;
  let findText = "";
  let errorCode = SUCCES;
  let errorText = "";

  Common.debug(`Row source`);
  let findSrc = _findObject(row["source.type"], row["source.name"], row[`source.prop.${ExportImport.PROP_ID}`], row["source.id"]);
  if (findSrc.errorCode != SUCCES) {
    errorCode += findSrc.errorCode;
    errorText += `- Error in row source.<endpoint> columns > `;
    errorText += `${findSrc.errorText}\n`;
    Common.debug(errorText);
  }
  Common.debug(`Row target`);
  let findTgt = _findObject(row["target.type"], row["target.name"], row[`target.prop.${ExportImport.PROP_ID}`], row["target.id"]);
  if (findTgt.errorCode != SUCCES) {
    errorCode += findTgt.errorCode;
    errorText += `- Error in row target.<endpoint> columns > `;
    errorText += `${findTgt.errorText}`;
    Common.debug(errorText);
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

    archiRels.each((rel) => {
      if (findCode != FOUND) {
        if (row[`prop.${ExportImport.PROP_ID}`]) {
          findText = `not found. There is no relation with the rows ${ExportImport.PROP_ID}`;
        } else {
          if (row.name == rel.name && row.type == rel.type) {
            findCode = FOUND;
            findText = `found relation with 'endpoints' and name and type`;
          } else {
            findText = `not found; found a relation with 'endpoints', but different name and type`;
          }
        }
      }
    });

    // if (archiRels.size() == 1) {
    //   if (row[`prop.${ExportImport.PROP_ID}`]) {
    //     findText = `not found. There is no relation with the rows ${ExportImport.PROP_ID}`;
    //   } else {
    //     if (row.name == archiRels.first().name && row.type == archiRels.first().type) {
    //       findCode = FOUND;
    //       findText = `found relation with 'endpoints' and name and type`;
    //     } else {
    //       findText = `not found; found a relation with 'endpoints', but different name and type`;
    //     }
    //   }
    // } else if (archiRels.size() > 1) {
    //   errorCode += WARNING;
    //   errorText += `Warning: Multiple relations with source ${srcColl} and target ${tgtColl}\n`;
    //   archiRels.each((obj) => (errorText += `  - ${obj}\n`));
    //   debug(errorText);
    // }
  }

  Common.debug(`>>> findRelation: ${Common.endCounter("findRelation")}`);
  return { findCode: findCode, findText: findText, errorCode: errorCode, errorText: errorText, archiObj: archiRels };
}

/**
 * 	create a new object for the row
 *  if row is a relation the source and target have to exist
 */
function _createObject(row, index, rowLabels, sync) {
  Common.debugStackPush(false);
  Common.startCounter("createObject");
  let line = "";
  let resultCode = SKIP;
  let archiObj = {};

  if (row.type.endsWith("relationship")) {
    let findSrc = _findObject(row["source.type"], row["source.name"], row[`source.prop.${ExportImport.PROP_ID}`], row["source.id"]);
    Common.debug(`findSrc: ${JSON.stringify(findSrc)}`);
    let findTgt = _findObject(row["target.type"], row["target.name"], row[`target.prop.${ExportImport.PROP_ID}`], row["target.id"]);
    Common.debug(`findTgt: ${JSON.stringify(findTgt)}`);

    if (findSrc.findCode == FOUND && findTgt.findCode == FOUND) {
      archiObj = model.createRelationship(row.type, row.name, findSrc.archiObj, findTgt.archiObj);
    } else {
      line += `row[${index + 2}] ${SKIP}\n`;
      line += `  Relation not created, no (unique) source and/or target\n`;
      line += `  - found source(s): ${findSrc.archiObj}\n`;
      line += `  - found target(s): ${findTgt.archiObj}`;
    }
  } else {
    archiObj = model.createElement(row.type, row.name);
  }

  if (Object.keys(archiObj).length > 0) {
    line += `row[${index + 2}] ${CREATE}\n`;
    line += `  ${archiObj}\n`;
    createResult = { archiObj: archiObj };
    let result = _updateObject(row, index, rowLabels, createResult, CREATE, sync);
    line += result.line;
    resultCode = CREATE;
  }
  if (sync) archiObj.prop(PROP_IMPORT_CREATED, currentDateTime);
  Common.debugStackPop();
  Common.debug(`createObject: ${resultCode} ${Common.endCounter("createObject")}`);
  return { index: index, resultCode: resultCode, line: line };
}

/**
 * 	update the attributes and properties of the object with the CSV row values
 */
function _updateObject(row, index, rowLabels, findResult, calledFrom, sync) {
  Common.startCounter("updateObject");
  const ATTRIBUTE_TEXT = "attribute";
  const PROPERTY_TEXT = "property";
  let lineUpdated = "";
  let line = "";
  let resultCode = NOTHING_TO_UPDATE;

  let archiObj = findResult.archiObj;
  let lineRowUpdate = `row[${index + 2}] ${UPDATE}\n`;
  lineRowUpdate += `  ${archiObj} (${findResult.findText})\n`;

  Common.debugStackPush(false);
  Common.debug(`row = ${JSON.stringify(row)}`);
  Common.debug(`obj = ${archiObj}`);

  // update objects attributes and properties with the row cell values
  rowLabels.map((label) => {
    let labelType =
    ExportImport.ATTRIBUTE_LABELS.includes(label) || ExportImport.RELATION_ATTRIBUTE_LABELS.includes(label) ? ATTRIBUTE_TEXT : PROPERTY_TEXT;
    let attr_or_prop_value = ExportImport.get_attr_or_prop(archiObj, label);

    // remove whitespace from imported values
    row[label] = row[label].trim();
    // remove properties with the value REMOVE_PROPERTY
    if (labelType == PROPERTY_TEXT && row[label] == REMOVE_PROPERTY_VALUE) {
      if (archiObj.prop().includes(label)) {
        lineUpdated += `  - remove ${labelType} ${label}: ${attr_or_prop_value}\n`;
        archiObj.removeProp(label);
      }
    } else {
      if (label != ExportImport.ASSOCIATION_DIRECTED || (label == ExportImport.ASSOCIATION_DIRECTED && archiObj.type == "association-relationship")) {
        // skip row cell if empty or if equal to object value
        if (row[label] && row[label] != attr_or_prop_value) {
          if (attr_or_prop_value) {
            lineUpdated += `  - update ${labelType} ${label}:\n`;
            lineUpdated += `    - from: "${attr_or_prop_value}"\n`;
            lineUpdated += `    - to:   "${row[label]}"\n`;
          } else {
            lineUpdated += `  - add ${labelType} ${label}: "${row[label]}"\n`;
          }
          ExportImport.set_attr_or_prop(archiObj, row, label);
        }
      }
    }
  });
  if (lineUpdated) {
    resultCode = UPDATE;
    if (calledFrom != CREATE) line += lineRowUpdate; // there is already a row create line
    line += lineUpdated;
    Common.debug(`line: ${line}`);
    if (sync && calledFrom != CREATE) archiObj.prop(PROP_IMPORT_UPDATED, currentDateTime);
  }
  if (sync) archiObj.prop(PROP_IMPORT, currentDateTime);
  Common.debug(`updateObject: ${Common.endCounter("updateObject")}`);
  Common.debugStackPop();

  return { index: index, resultCode: resultCode, line: line };
}

/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function _getRowsFromFile(importFile, transformRowFn) {
  let debugFlag = false;
  Common.debugStackPush(debugFlag);

  Common.startCounter("getRowsFromFile");
  const parsed = ExportImport.Papa.parse(_readFully_csv(importFile, "utf-8"), {
    header: true,
    preview: debugFlag ? 20 : 0,
    encoding: "utf-8",
    skipEmptyLines: true,
  }).data;

  Common.debug("");
  Common.debug("Rows before transform");
  Common.debug(`${JSON.stringify(parsed, null, 2)}`);
  Common.debug("");

  console.log("\nShowing the first row as an example:\n", JSON.stringify(parsed[0], null, 2));

  let rows;
  if (typeof transformRowFn === "function") {
    // Only map when needed
    rows = parsed.map((row) => transformRowFn(row));
    console.log("\nTransforming input CSV… showing transformed row:\n", JSON.stringify(rows[0], null, 2));
    console.log();
  } else {
    rows = parsed;
  }
  Common.debug("");
  Common.debug("Rows after transform");
  Common.debug(JSON.stringify(rows, null, 2));
  Common.debug("");

  Common.debug(`getRowsFromFile: ${Common.endCounter("getRowsFromFile")}`);

  Common.debugStackPop();
  return rows;
}

// Some Polyfills for Nashorn =================================
function _readFully_csv(url, charset) {
  // From https://github.com/sindresorhus/strip-bom
  function stripBom(string) {
    if (typeof string !== "string") {
      throw new TypeError(`Expected a string, got ${typeof string}`);
    }
    // Catches EFBBBF (UTF-8 BOM) because the buffer-to-string
    // conversion translates it to FEFF (UTF-16 BOM).
    if (string.charCodeAt(0) === 0xfeff) {
      Common.debug("Strip BOM from CSV file");
      return string.slice(1);
    }
    return string;
  }

  var result = "";
  // var imports = new JavaImporter(java.net, java.lang, java.io);

  // with (imports) {
    var urlObj = null;

    try {
      urlObj = new java.net.URL(url);
    } catch (e) {
      // If the URL cannot be built, assume it is a file path.
      urlObj = new java.net.URL(new java.io.File(url).toURI().toURL());
    }

    var reader = new java.io.BufferedReader(new java.io.InputStreamReader(urlObj.openStream(), charset));
    var line = reader.readLine();
    line = stripBom(line);
    while (line != null) {
      result += line + "\n";
      line = reader.readLine();
    }
    reader.close();
  // }
  return result;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { importObjects };
}
