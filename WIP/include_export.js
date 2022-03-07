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
 *
 * @param {*} objectType type of Archi objects to export.
 * 												- Use the constants OBJECT_TYPE_RELATION, OBJECT_TYPE_ELEMENT or OBJECT_TYPE_VIEW
 * @param {*} exportFile filepath to write CSV file (optional, if empty you will be prompted)
 */
function exportObjects(objectType, exportFile) {
  debugStackPush(false);
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

      if (!exportFile) {
        let fileName_suggestion = `${model.name}_${$(selection).first().name}_${objectType}`; //.replace(/\s/g, "-");
        if (selection.is("archimate-model")) {
          fileName_suggestion = `${model.name}_${objectType}`; //.replace(/\s/g, "-").replace(/[\[\]\(\)\#\\\/\"\.:;,–]/gi, "")
        }
        fileName_suggestion = fileName_suggestion.replace(/\s/g, "-").replace(/[\[\]\(\)\#\\\/\"\.:;,–]/gi, "");


        fileType = 'xlsx'
        let datum = new Date();
        exportFile = window.promptSaveFile({
          title: `Export to .${fileType}`,
          filterExtensions: [`*.${fileType}`],
          fileName: `${datum.toLocaleDateString("nl-NL")}_${fileName_suggestion}.${fileType}`,
        });
      }

      if (exportFile) {
        // saveRowsToFile(header, data, exportFile);
        saveRowsToExcel(header, data, objectType, exportFile);
      } else {
        console.log("\nExport CSV canceled");
      }
    } else {
      console.log(`Empty selection. No ${objectType}s found`);
    }
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  debugStackPop();
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

  debugStackPush(false);
  debug(`\n> `);
  debug(`${object}`);

  // fill row with the attributes and property values of the object
  headerRow.forEach((label) => {
    row[label] = get_attr_or_prop(object, label);
  });

  if (FOLDER_LABEL) {
    // row[FOLDER_LABEL] = get_folderPath($(`#${object.id}`), "");
    row[FOLDER_LABEL] = getArchiFolder(object, "");
    debug(`row[FOLDER_LABEL]: ${row[FOLDER_LABEL]}`);
  }

  debug(`Row: ${JSON.stringify(row)}`);
  debugStackPop();
  return row;
}

/**
 * get objects folderpath by recursively walkin up the parentfolders
 */
function getArchiFolder(child, currentFolderName) {
  let parent = $(`#${child.id}`).parent("folder");
  if (parent.size() == 0) return currentFolderName;

  let folderName = `${parent.first().name}/${currentFolderName}`;
  return getArchiFolder(parent.first(), folderName);
}

/**
 * Save header and data to a CSV file
 */
function saveRowsToFile(header, data, exportFile) {
  $.fs.writeFile(exportFile, Papa.unparse({ fields: header, data: data }, { quotes: true }));
  let exportFileName = exportFile.split("\\").pop().split("/").pop();
  let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName));
  console.log("Saved to file: " + exportFileName);
  console.log("In folder:     " + exportFilePath);
}

/**
 * Save header and data to Excel
 */
function saveRowsToExcel(header, data, objectType, exportFile) {
  // load("https://unpkg.com/xlsx/dist/xlsx.core.min.js");
  load("https://unpkg.com/xlsx/dist/xlsx.full.min.js");
  // load("https://unpkg.com/xlsx/dist/xlsx.extendscript.js");
  
  console.log(`XLSX version:  ${XLSX.version}`);

  /* create a new blank workbook */
  var workbook = XLSX.utils.book_new();

  /* make worksheet */
  var ws_data = [header, data];
  var worksheet = XLSX.utils.aoa_to_sheet(ws_data);

  /* Add the worksheet to the workbook */
  XLSX.utils.book_append_sheet(workbook, worksheet, objectType);

  /* output format determined by filename */
  XLSX.writeFile(workbook, exportFile);

  let exportFileName = exportFile.split("\\").pop().split("/").pop();
  let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName));
  console.log("Saved to file: " + exportFileName);
  console.log("In folder:     " + exportFilePath);
}
