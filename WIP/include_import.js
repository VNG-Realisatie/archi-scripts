/**
 * include_import.js
 *
 * Functions for importing model elements, relations and view properties
 */


// Indexing result codes
const NOT_FOUND = "object NOT found";
const NOT_FOUND_RELATION = "relation NOT found";
// const NOT_FOUND = "Endpoint missing"
const FOUND_ID = "id sync";
const FOUND_NAME = "name sync";
const FOUND_RELATION_ENDPOINTS = "relation endpoints found";
const FOUND_RELATION = "relation found";
const FOUND_MULTIPLE = "multiple";
const CREATE_NEW_OBJECT = "create";

_commonShowDebugMessage = [false];

function importObjects(objectType) {
  _commonShowDebugMessage.push(false);
  debug(`objectType=${objectType}`);

  try {
    console.log(`Importing ${objectType} of CSV\n`);

    let importFile =
      window.promptOpenFile({
        title: "Open CSV",
        filterExtensions: ["*.csv"],
        fileName: `*${objectType}.csv`,
      }) || "";
    let importFileName = importFile.split("\\").pop().split("/").pop();

    // var filePath = window.promptOpenFile({ title: "Open CSV" , filterExtensions: ["*.CSV"], fileName: "*.csv" });
    // let importPath = 'C:/D-schijf/Data/Dropbox/KING/KING ICT/Archi/Werkbestanden/ExportImport/'
    // let importFile = importPath + `2021-02-28_testMerge_Default-View_${objectType}.csv`
    // let importFile = importPath + `2021-03-02_UPL_Default-View_${objectType}.csv`
    const rows = getRowsFromFile(importFile);
    if (rows.length > 0) {
      console.log(`> Loading CSV file: ${importFileName}\n`);

      // check all rows for missing and valid value's
      const validateLog = rows
        .map((row, index) => importValidateRows(row, index))
        .filter((line) => line != "");

      if (validateLog.length == 0) {
        const importHeaderLabels = importReadHeader(rows);

        const rows_and_objects = rows.map((row, index) =>
          importIndexRows(row, index, objectType)
        );
        console.log(`Indexed ${rows_and_objects.length} rows`);
        rows_and_objects.map((row_and_object) =>
          debug(
            `row[${row_and_object.rowNr}] > "${row_and_object.resultCode}" object = ${row_and_object.archiObject}`
          )
        );

        // create Archi objects for rows which are not found
        const createRows = rows_and_objects.filter(
          (row_and_object) => row_and_object.resultCode == CREATE_NEW_OBJECT
        );
        const createdRows_Log = createRows.map((row_and_object) =>
          importCreateObject(importHeaderLabels, row_and_object, objectType)
        );
        createdRows_Log.map((LogAndRows) => debug(`${LogAndRows.line}`));

        // set properties of created Archi objects
        const update_createdRows_Log = createRows
          .map((row_and_object) =>
            importUpdateObject(importHeaderLabels, row_and_object)
          )
          .filter((line) => line != "");
        if (update_createdRows_Log.length > 0) {
          console.log(`Created ${update_createdRows_Log.length} objects:`);
          update_createdRows_Log.map((line) => console.log(line));
        }

        // update properties of found Archi objects
        const updateRows = rows_and_objects.filter(
          (row_and_object) =>
            row_and_object.resultCode == FOUND_ID ||
            row_and_object.resultCode == FOUND_NAME
        );
        const updateRows_Log = updateRows
          .map((row_and_object) =>
            importUpdateObject(importHeaderLabels, row_and_object)
          )
          .filter((line) => line != "");

        if (updateRows_Log.length > 0) {
          console.log(`Update ${updateRows_Log.length} objects:`);
          updateRows_Log.map((line) => console.log(line));
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
        console.log(`> There are ${validateLog.length} unvalid rows`);
        validateLog.map((line) => console.log(`> - ${line}`));
        console.log(`\n> Correct the data and import again\n`);
      }
    }
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }

  debug(`< `);
  _commonShowDebugMessage.pop();
}

/**
 * importValidateRows - mapping function
 * 	check importFile row for required values
 */
function importValidateRows(row, index) {
  let line = "";
  let RowNr = index + 2;

  if (!row.type) {
    line += `Row(${RowNr}): value ${row.type} in column "type" not valid`;
  }
  return line;
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
  let foundObjects,
    archiObject = new Object();
  let resultCode = "empty";

  // rowNr follows rownumbers in spreadsheet (+1 for header and +1 for row start at 1 (index starts at 0))
  rowNr = index + 2;

  _commonShowDebugMessage.push(false);

  debug(`\nRow index=${index}`);

  if (objectType == OBJECT_TYPE_RELATION) {
    // indexedRow = importCreateIndexRow(foundObjects, {}, row, index)

    foundObjects = findRelation(row);
    if (foundObjects.searchResult == NOT_FOUND_RELATION) {
      resultCode = foundObjects.searchResult;
      console.log(
        `> Can't import relation: relation or endpoints not found for row[${rowNr}] (name=${row["name"]}; id=${row["id"]}; ${PROP_ID}=${row[PROP_ID]})`
      );
    } else if (foundObjects.searchResult == FOUND_RELATION) {
      if (foundObjects.archiRelations.size() == 1) {
        resultCode = foundObjects.searchResult;
        archiObject = foundObjects.archiRelations.first();
      } else if (foundObjects.archiRelations.size() > 1) {
        resultCode = FOUND_MULTIPLE;
        console.log(
          `> Multiple relations found for row[${rowNr}] (name=${row["name"]}; id=${row["id"]}; ${PROP_ID}=${row[PROP_ID]})`
        );
      }
    } else if (foundObjects.searchResult == FOUND_RELATION_ENDPOINTS) {
      resultCode = CREATE_NEW_OBJECT;
      console.log(
        `> Create relation for row[${rowNr}] (endpoints source=${foundObjects.archiSource}), target=${foundObjects.archiTarget}`
      );
    }
  } else {
    foundObjects = findElement_or_View(row);

    // indexedRow = importCreateIndexRow({}, foundRelations, row, index)
    if (foundObjects.searchResult == NOT_FOUND) {
      resultCode = CREATE_NEW_OBJECT;
      console.log(
        `> No objects found for row[${rowNr}] (name=${row["name"]}; id=${row["id"]}; ${PROP_ID}=${row[PROP_ID]})`
      );
    } else if (
      foundObjects.searchResult == FOUND_NAME ||
      foundObjects.searchResult == FOUND_ID
    ) {
      if (foundObjects.archiObjects.size() == 1) {
        resultCode = foundObjects.searchResult;
        archiObject = foundObjects.archiObjects.first();
      } else if (foundObjects.archiObjects.size() > 1) {
        resultCode = FOUND_MULTIPLE;
        console.log(
          `> Multiple objects found for row[${rowNr}] (name=${row["name"]}; id=${row["id"]}; ${PROP_ID}=${row[PROP_ID]})`
        );
      }
    }
  }

  let indexedRow = {
    rowNr,
    archiObject,
    source: foundObjects.archiSource,
    target: foundObjects.archiTarget,
    resultCode,
    row,
  };

  debug(`rowNr:  ${rowNr}`);
  debug(`object:  ${archiObject}`); // $(archiObject)?
  debug(
    `endpoint (source,target):  (${indexedRow.source}, ${indexedRow.target})`
  );
  debug(`resultCode:  "${resultCode}" }`);

  _commonShowDebugMessage.pop();

  return indexedRow;
}

function findElement_or_View(row) {
  let archiObjects = new Object();
  let searchResult = "not set";

  // search object with id or PROP_ID
  archiObjects = search_IDs(row[PROP_ID], row["id"], row["type"]);
  if (isEmpty(archiObjects)) {
    // search element or view by name
    archiObjects = search_Name(row["name"], row["type"]);
    if (isEmpty(archiObjects)) {
      searchResult = NOT_FOUND;
    } else {
      searchResult = FOUND_NAME;
    }
  } else {
    searchResult = FOUND_ID;
  }

  return {
    searchResult,
    archiObjects,
  };
}

/**
 * findRelation
 * 	search relation by endpoints (source and targets)
 * 	searching by name not possible, relation often do not have a (unique) name
 */
function findRelation(row) {
  let archiRelations = new Object();
  let archiSource,
    archiTarget = new Object();
  let searchResult = "not set";

  // search relation with id or PROP_ID
  archiRelations = search_IDs(row[PROP_ID], row["id"], row["type"]);
  if (isEmpty(archiRelations)) {
    // search relation with endpoints
    archiSource = searchEndpoint(row, "source");
    if (isEmpty(archiSource)) {
      searchResult = NOT_FOUND_RELATION;
    } else {
      archiTarget = searchEndpoint(row, "target");
      if (isEmpty(archiTarget)) {
        searchResult = NOT_FOUND_RELATION;
      } else {
        // both endpoints found
        // find relations of with the found source and target
        archiRelations = $(archiSource)
          .outRels(row["type"])
          .filter(function (r) {
            return r.target.equals(archiTarget);
          });
        if (isEmpty(archiRelations)) {
          searchResult = FOUND_RELATION_ENDPOINTS;
          debug(
            `Not found relation, create with endpoints: source=${archiSource}, target=${archiTarget}`
          );
        } else {
          searchResult = FOUND_RELATION;
          debug(`Found relation via endpoints=${archiRelations}`);
        }
      }
    }
  } else {
    searchResult = FOUND_RELATION;
    debug(`Found relation with IDs=${archiRelations}`);
  }

  return {
    archiSource,
    archiTarget,
    searchResult,
    archiRelations,
  };
}

function searchEndpoint(row, endpointSide) {
  let ArchiObjects = new Object();
  let ArchiEndpoint = new Object();

  ArchiObjects = search_IDs(
    row[`${endpointSide}.prop.${PROP_ID}`],
    row[`${endpointSide}.id`],
    row[`${endpointSide}.type`]
  );
  if (isEmpty(ArchiObjects)) {
    debug(`Not found relation ${endpointSide}`);
  } else {
    if (ArchiObjects.size() > 1) {
      debug(
        `Not found relation: dismiss MULTIPLE ${endpointSide}s: ${ArchiObjects}`
      );
    } else {
      debug(`Found relation ${endpointSide}=${ArchiEndpoint}`);
      ArchiEndpoint = ArchiObjects.first();
    }
  }
  return ArchiEndpoint;
}

/**
 */
function search_IDs(row_prop_id, row_id, row_type) {
  let ArchiObjects = new Object();

  debug(`type=${row_type}, propID=${row_prop_id}, id=${row_id}`);

  // search with property PROP_ID
  if (row_prop_id) {
    ArchiObjects = $(row_type).filter(function (o) {
      return o.prop(PROP_ID) == row_prop_id;
    });
  }
  // a PROP_ID should be unique, but duplicates happen.
  // 0, 1 or more object returned

  if (isEmpty(ArchiObjects)) {
    // if (foundObjects.size() == 0) {
    ArchiObjects = $(`#${row_id}`);
    if (isEmpty(ArchiObjects)) {
      debug(`Not found`);
    } else {
      debug(`Found with id: ${ArchiObjects}`);
    }
  } else {
    debug(`Found with '${PROP_ID}': ${ArchiObjects}`);
  }
  return ArchiObjects;
}

/**
 */
function search_Name(row_name, row_type) {
  let ArchiObjects = new Object();

  // search with ID
  if (row_name) {
    ArchiObjects = $(`.${row_name}`).filter(row_type);
  }

  debug(`type:${row_type}, name:${row_name}): ${ArchiObjects}`);

  // names do have duplicates
  // 0, 1 or more object returned
  return ArchiObjects;
}

/**
 * importReadHeader
 * 	return a array with the column labels which will be imported
 */
function importReadHeader(rows) {
  // row is an array of {name, value} objects => get all object key names
  const headerLabels = Object.keys(rows[0]);
  debug(`headerLabels: ${headerLabels}\n`);

  // Filter the columns to be imported
  // - don't import the attribute id (can't be set) and
  // - don't import the endpoints (used for finding the relation)
  const importHeaderLabels = headerLabels.filter(
    (label) => ["id"].concat(ENDPOINT_LABELS).indexOf(label) == -1
  );
  return importHeaderLabels;
}

/**
 * importCreateObject
 * 	create a new object for the row
 */
function importCreateObject(headerRow, row_and_object, objectType) {
  let line = "";
  let archiObject;

  _commonShowDebugMessage.push(false);
  debug(`Start`);

  row = row_and_object.row;

  switch (objectType) {
    case OBJECT_TYPE_RELATION: {
      archiObject = model.createRelationship(
        row_and_object.row.type,
        row_and_object.row.name,
        row_and_object.source,
        row_and_object.target
      );
      line = `> create relation: ${archiObject}\n`;
      break;
    }
    case OBJECT_TYPE_ELEMENT: {
      archiObject = model.createElement(row.type, row.name);
      line = `> create element: ${archiObject}\n`;
      break;
    }
    case OBJECT_TYPE_VIEW: {
      line = `> INFO: View ${row.name} NOT created\n`;
      line = `> INFO: creation of views is not supported, use Archi merge function\n`;
      break;
    }
  }
  row_and_object.archiObject = archiObject; // #### mag dit. const van buiten

  _commonShowDebugMessage.pop();
  return {
    line,
    row_and_object,
  };
}

/**
 * importUpdateObject
 * 	synchronize the model object with row values
 */
function importUpdateObject(headerRow, row_and_object) {
  let lineUpdated = "";
  let line = "";

  let row = row_and_object.row;
  let archiObject = row_and_object.archiObject;
  let rowNr = row_and_object.rowNr;

  _commonShowDebugMessage.push(false);
  debug(`Start`);

  // update objects attributes and properties with the row cell values
  headerRow.map((label) => {
    // skip row cell if empty or if equal to object value
    if (row[label] && row[label] != get_attr_or_prop(archiObject, label)) {

      let attr_or_prop = (ATTRIBUTE_LABELS.indexOf(label) != -1) ? 'attribute' : 'property'

      if (get_attr_or_prop(archiObject, label)) {
        lineUpdated += `\n> update ${attr_or_prop} ${label}: \n>> from: ${get_attr_or_prop(archiObject,label)}\n>> to:   ${row[label]}`;
      } else {
        lineUpdated += `\n> set ${attr_or_prop} ${label}: ${row[label]}`;
      }
      set_attr_or_prop(archiObject, row, label);
      debug(`lineUpdated: ${lineUpdated}`);
    }
  });

  if (lineUpdated) {
    line = `${archiObject} (csv row ${rowNr})`;
    line += lineUpdated;
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

    var reader = new BufferedReader(
      new InputStreamReader(urlObj.openStream(), charset)
    );

    var line = reader.readLine();
    while (line != null) {
      result += line + "\n";
      line = reader.readLine();
    }

    reader.close();
  }

  return result;
}