/**
 * Export the selected elements, relations or views and their properties to a CSV file
 */
load(__DIR__ + "../_lib/selection.js");
load(__DIR__ + "../_lib/archi_folders.js");
load(__DIR__ + "include_export_import.js");

/**
 * export selected objects to a CSV file
 *
 * @param {*} objectType type of Archi objects to export (OBJECT_TYPE_RELATION, OBJECT_TYPE_ELEMENT or OBJECT_TYPE_VIEW)
 * @param {*} exportFile filepath to write CSV file (optional, if empty you will be prompted)
 * @param {object} headerMapping object with key-column mapping (key is ArchiObject attribute or property, value is export column)
 */
function exportObjects(objectType, exportFile, headerMapping, collection) {
  debugStackPush(false);
  debug(`objectType=${objectType}`);

  try {
    // create an array with all selected objects.
    let selectionList = [];
    if (collection) {
      collection.each((o) => selectionList.push(o));
    } else {
      // if folders or views are selected, then all contained objects are added to the list
      selectionList = getSelectionArray($(selection), objectType);
    }

    if (selectionList.length > 0) {
      console.log(`Create header:`);
      let propsHeader = [];
      let columnsHeader = [];
      if (headerMapping == undefined) {
        propsHeader = createHeader(selectionList, objectType);
        columnsHeader = propsHeader;
      } else {
        console.log("Header mapping (get_attr_prop=write header column):");
        Object.keys(headerMapping).forEach((key) => {
          console.log(`- ${key}=${headerMapping[key]}`);
          propsHeader.push(key);
          columnsHeader.push(headerMapping[key]);
        });
      }
      console.log(`propsHeader: ${propsHeader}`);

      console.log(`Create rows for selection:`);
      const data = selectionList.map((o) => createRow(propsHeader, o, objectType, headerMapping));
      console.log(`- ${data.length} rows for ${data.length} ${objectType}\n`);

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
  debugStackPop();
}

/**
 * create a row with the column labels for the exported objects
 */
function createHeader(objects, objectType) {
  let header = [];
  let columnLogText = "";

  const PROPERTY_LABELS = getPropertyLabels(objects);

  if (FOLDER_LABEL) {
    header.push(FOLDER_LABEL);
    columnLogText += `1 folder`;
  }
  header = header.concat(ATTRIBUTE_LABELS);
  header = header.concat(PROPERTY_LABELS);
  columnLogText += `, ${ATTRIBUTE_LABELS.length} attributes, ${PROPERTY_LABELS.length} properties`;

  switch (objectType) {
    case OBJECT_TYPE_RELATION:
      header = header.concat(ENDPOINT_LABELS);
      columnLogText += `, ${ENDPOINT_LABELS.length} endpoint labels`;
      header = header.concat(RELATION_ATTRIBUTE_LABELS);
      columnLogText += `, ${RELATION_ATTRIBUTE_LABELS.length} relation attribute labels`;
      break;
    case OBJECT_TYPE_ELEMENT:
      if (GEMMA_COLUMNS) {
        // GEMMA columns for exporting element view references
        header.push(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL);
        columnLogText += `, 1 ${GEMMA_PUBLICEREN_TOT_EN_MET_LABEL}`;
        header.push(GEMMA_LIST_API_LABEL);
        columnLogText += `, 1 ${GEMMA_LIST_API_LABEL}`;
      }
      break;
    default:
      break;
  }

  debug(`header: ${header}\n`);
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
        debug(`add property to accumulator: ${accumulator[propLabel]}`);
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

  debugStackPush(false);
  debug(`\n> `);
  debug(`${object}`);

  // fill row with the attributes and property values of the object
  if (headerMapping == undefined) {
    headerRow.forEach((label) => {
      row[label] = get_attr_or_prop(object, label);
    });
  } else {
    Object.keys(headerMapping).forEach((key) => {
      row[headerMapping[key]] = get_attr_or_prop(object, key);
    });
  }

  // fill folder column
  if (FOLDER_LABEL) {
    // row[FOLDER_LABEL] = get_folderPath($(`#${object.id}`), "");
    row[FOLDER_LABEL] = printFolderPath(object, "");
    debug(`row[FOLDER_LABEL]: ${row[FOLDER_LABEL]}`);
  }

  // GEMMA columns for checking which elements will be published
  if (GEMMA_COLUMNS && objectType == OBJECT_TYPE_ELEMENT) {
    // fill column with the 'highest' publiceren value of all the views with the object drawn
    row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL] = getGEMMA_columns(object).publicerenTotEnMet;
    debug(`row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL]: ${row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL]}`);
    row[GEMMA_LIST_API_LABEL] = getGEMMA_columns(object).GEMMA_ListAPI;
    debug(`row[GEMMA_LIST_API]: ${row[GEMMA_LIST_API_LABEL]}`);
  }
  debug(`Row: ${JSON.stringify(row)}`);
  debugStackPop();
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
        let publicerenIndex = GEMMA_PUBLICEREN_VALUES.indexOf(`${v.prop("Publiceren")}`);
        if (publicerenIndex > maxPublicerenIndex) maxPublicerenIndex = publicerenIndex;
      }
    });
  if (maxPublicerenIndex > -1) pubProp = GEMMA_PUBLICEREN_VALUES[maxPublicerenIndex];
  if (maxPublicerenIndex >= 2) naarSWC = "List API";
  return { publicerenTotEnMet: pubProp, GEMMA_ListAPI: naarSWC };
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
