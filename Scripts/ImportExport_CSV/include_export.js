/**
 * Export the selected elements, relations or views and their properties to a CSV file
 */
const Selection = require(__SCRIPTS_DIR__ + "Scripts/_lib/selection.js");
const ArchiFolders = require(__SCRIPTS_DIR__ + "Scripts/_lib/archi_folders.js");
const ExportImport = require(__DIR__ + "/include_export_import.js");
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");

/**
 * export selected objects to a CSV file
 *
 * @param {*} objectType type of Archi objects to export (OBJECT_TYPE_RELATION, OBJECT_TYPE_ELEMENT or OBJECT_TYPE_VIEW)
 * @param {*} exportFile filepath to write CSV file (optional, if empty you will be prompted)
 * @param {Archi collection} collection with objects to export (optional, if empty $(selection) is used)
 * @param {object} headerMapping object with key-column mapping (optional)
 *          Mapping object keys are used as ArchiObject attribute or property, values as CSV column header)
 */
function exportObjects(objectType, exportFile, collection, headerMapping) {
  Common.debugStackPush(false);
  Common.debug(`objectType=${objectType}`);

  try {
    // create an array with all selected objects.
    let selectionList = [];
    if (collection) {
      collection.each((o) => selectionList.push(o));
    } else {
      // if folders or views are selected, then all contained objects are added to the list
      selectionList = Selection.getSelectionArray($(selection), objectType);
    }

    if (selectionList.length > 0) {
      let propsHeader = [];
      let columnsHeader = [];
      if (headerMapping == undefined) {
        console.log(`Create header:`);
        columnsHeader = createHeader(selectionList, objectType);
        // column labels are equal to property labels
        propsHeader=columnsHeader 
      } else {
        console.log("Mapping (property=CSV column header):");
        Object.keys(headerMapping).forEach((headerKey) => {
          if (headerKey == ExportImport.PROP_ADD) {
            console.log(`- ${ExportImport.PROP_ADD}=${headerMapping[headerKey].key}`);
            propsHeader.push(ExportImport.PROP_ADD);
            columnsHeader.push(headerMapping[headerKey].key);
          } else {
            console.log(`- ${headerKey}=${headerMapping[headerKey]}`);
            propsHeader.push(headerKey);
            columnsHeader.push(headerMapping[headerKey]);
          }
        });
      }

      console.log(`Create rows for selection:`);
      const data = selectionList.map((o) => createRow(propsHeader, o, objectType, headerMapping));
      console.log(`- ${data.length} rows created\n`);

      if (!exportFile) {
        let fileName_suggestion = `${model.name}_${$(selection).first().name}_${objectType}`; //.replace(/\s/g, "-");
        if (selection.is("archimate-model")) {
          fileName_suggestion = `${model.name}_${objectType}`; //.replace(/\s/g, "-").replace(/[\[\]\(\)\#\\\/\"\.:;,–]/gi, "")
        }
        fileName_suggestion = fileName_suggestion.replace(/\s/g, "-").replace(/[\[\]\(\)\#\\\/\"\.:;,–]/gi, "");

        // fileType = 'xlsx'
        fileType = "csv";
        let datum = new Date();
        exportFile = window.promptSaveFile({
          title: `Export to .${fileType}`,
          filterExtensions: [`*.${fileType}`],
          fileName: `${datum.toLocaleDateString("nl-NL")}_${fileName_suggestion}.${fileType}`,
        });
      }

      if (exportFile) {
        saveRowsToFile(columnsHeader, data, exportFile);
        // saveRowsToExcel(header, data, objectType, exportFile);
      } else {
        console.log("\nExport CSV canceled");
      }
    } else {
      console.log(`Empty selection. No ${objectType}s found`);
    }
  } catch (error) {
    console.error(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
  Common.debugStackPop();
}

/**
 * create a row with the column labels for the exported objects
 */
function createHeader(objects, objectType) {
  let header = [];
  let columnLogText = "";

  const PROPERTY_LABELS = getPropertyLabels(objects);

  if (ExportImport.FOLDER_LABEL) {
    header.push(ExportImport.FOLDER_LABEL);
    columnLogText += `1 folder`;
  }
  header = header.concat(ExportImport.ATTRIBUTE_LABELS);
  header = header.concat(PROPERTY_LABELS);
  columnLogText += `, ${ExportImport.ATTRIBUTE_LABELS.length} attributes, ${PROPERTY_LABELS.length} properties`;

  switch (objectType) {
    case ExportImport.OBJECT_TYPE_RELATION:
      header = header.concat(ExportImport.ENDPOINT_LABELS);
      columnLogText += `, ${ExportImport.ENDPOINT_LABELS.length} endpoint labels`;
      header = header.concat(ExportImport.RELATION_ATTRIBUTE_LABELS);
      columnLogText += `, ${ExportImport.RELATION_ATTRIBUTE_LABELS.length} relation attribute labels`;
      break;
    case ExportImport.OBJECT_TYPE_ELEMENT:
      if (ExportImport.GEMMA_COLUMNS) {
        // GEMMA columns for exporting element view references
        header.push(ExportImport.GEMMA_PUBLICEREN_TOT_EN_MET_LABEL);
        columnLogText += `, 1 ${ExportImport.GEMMA_PUBLICEREN_TOT_EN_MET_LABEL}`;
        header.push(ExportImport.GEMMA_LIST_API_LABEL);
        columnLogText += `, 1 ${ExportImport.GEMMA_LIST_API_LABEL}`;
      }
      break;
    default:
      break;
  }

  console.log(`- ${header.length} columns (${columnLogText})`);

  return header;
}

function getPropertyLabels(objects) {
  // remove duplicate property labels
  let propertyLabelsObject = objects.reduce((a, obj) => findPropertyLabels(a, obj), {});
  // convert object with labels to array with labels
  return Object.keys(propertyLabelsObject);

  /**
   * loop over all objects en find all unique property names
   */
  function findPropertyLabels(accumulator, obj) {
    obj.prop().forEach(function (propLabel) {
      // accumulate all unique property labels.
      if (typeof accumulator[propLabel] == "undefined") {
        accumulator[propLabel] = propLabel;
        Common.debug(`add property to accumulator: ${accumulator[propLabel]}`);
      }
    });
    return accumulator;
  }
}

/**
 * create a CSV row for an exported object
 */
function createRow(headerRow, object, objectType, headerMapping) {
  let row = new Object();

  Common.debugStackPush(false);
  Common.debug(`\n> `);
  Common.debug(`${object}`);

  // fill row with the attributes and property values of the object
  if (headerMapping == undefined) {
    headerRow.forEach((label) => {
      row[label] = ExportImport.get_attr_or_prop(object, label);
    });
  } else {
    Object.keys(headerMapping).forEach((headerKey) => {
      if (headerKey == ExportImport.PROP_ADD) {
        Common.debug(`headerMapping[headerKey].key: ${headerMapping[headerKey].key}`);
        Common.debug(`headerMapping[headerKey].value: ${headerMapping[headerKey].value}`);
        // fill row with in mapping defined function or value
        if (typeof headerMapping[headerKey].value === "function") {
          row[headerMapping[headerKey].key] = headerMapping[headerKey].value(); // Call the function
        } else {
          row[headerMapping[headerKey].key] = headerMapping[headerKey].value;
        }
      } else {
        row[headerMapping[headerKey]] = ExportImport.get_attr_or_prop(object, headerKey);
      }
    });
  }

  // fill folder column
  if (ExportImport.FOLDER_LABEL) {
    // row[FOLDER_LABEL] = get_folderPath($(`#${object.id}`), "");
    row[ExportImport.FOLDER_LABEL] = ArchiFolders.printFolderPath(object, "");
    Common.debug(`row[FOLDER_LABEL]: ${row[ExportImport.FOLDER_LABEL]}`);
  }

  // GEMMA columns for checking which elements will be published
  if (ExportImport.GEMMA_COLUMNS && objectType == ExportImport.OBJECT_TYPE_ELEMENT) {
    // fill column with the 'highest' publiceren value of all the views with the object drawn
    row[ExportImport.GEMMA_PUBLICEREN_TOT_EN_MET_LABEL] = getGEMMA_columns(object).publicerenTotEnMet;
    Common.debug(`row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL]: ${row[ExportImport.GEMMA_PUBLICEREN_TOT_EN_MET_LABEL]}`);
    row[ExportImport.GEMMA_LIST_API_LABEL] = getGEMMA_columns(object).GEMMA_ListAPI;
    Common.debug(`row[GEMMA_LIST_API]: ${row[ExportImport.GEMMA_LIST_API_LABEL]}`);
  }
  Common.debug(`Row: ${JSON.stringify(row)}`);
  Common.debugStackPop();
  return row;
}

/**
 * get the 'highest' publiceren value of the elements view references
 * - determine if the element will be published to the wiki
 * - and the API
 *
 * @param {*} object
 * @returns object with values for two columns
 */
function getGEMMA_columns(object) {
  let maxPublicerenIndex = -1;
  let pubProp = "Geen view";
  let naarSWC = "Niet";

  $(object)
    .viewRefs()
    .each(function (v) {
      if (!v.prop("Publiceren") && maxPublicerenIndex == -1) {
        pubProp = "Geen view met publiceren";
      } else {
        let publicerenIndex = ExportImport.GEMMA_PUBLICEREN_VALUES.indexOf(`${v.prop("Publiceren")}`);
        if (publicerenIndex > maxPublicerenIndex) maxPublicerenIndex = publicerenIndex;
      }
    });
  if (maxPublicerenIndex > -1) pubProp = ExportImport.GEMMA_PUBLICEREN_VALUES[maxPublicerenIndex];
  if (maxPublicerenIndex >= 2) naarSWC = "List API";
  return { publicerenTotEnMet: pubProp, GEMMA_ListAPI: naarSWC };
}

/**
 * Save header and data to a CSV file
 */
function saveRowsToFile(header, data, exportFile) {
  $.fs.writeFile(exportFile, ExportImport.Papa.unparse({ fields: header, data: data }, { quotes: true }));
  let exportFileName = exportFile.split("\\").pop().split("/").pop();
  let exportFilePath = exportFile.substring(0, exportFile.indexOf(exportFileName));
  console.log("Folder: " + exportFilePath);
  console.log("Saved to file: " + exportFileName);
}

/**
 * Save header and data to Excel
 */
function saveRowsToExcel(header, data, objectType, exportFile) {
  var XLSX;
  try {
    XLSX = require("xlsx");
  } catch (e) {
    load("https://unpkg.com/xlsx/dist/xlsx.full.min.js");
    var g = typeof global !== "undefined" ? global : typeof window !== "undefined" ? window : this;
    XLSX = g.XLSX;
  }
  if (!XLSX) throw "XLSX not loaded. Add node_modules/xlsx (see SETUP_NODE_MODULES.md) or allow load from unpkg.";

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
  console.log("Folder: " + exportFilePath);
  console.log("Saved to file: " + exportFileName);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    exportObjects,
    saveRowsToFile,
    saveRowsToExcel,
    OBJECT_TYPE_ELEMENT: ExportImport.OBJECT_TYPE_ELEMENT,
    OBJECT_TYPE_RELATION: ExportImport.OBJECT_TYPE_RELATION,
    OBJECT_TYPE_VIEW: ExportImport.OBJECT_TYPE_VIEW
  };
}
