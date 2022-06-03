/**
 * Export the selected elements, relations or views and their properties to a CSV file
 */

load(__DIR__ + "../_lib/SelectCollection.js");
load(__DIR__ + "include_export_import.js");

/**
 * export selected objects to a CSV file
 *
 * @param {*} objectType type of Archi objects to export (OBJECT_TYPE_RELATION, OBJECT_TYPE_ELEMENT or OBJECT_TYPE_VIEW)
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
      console.log(`Create header:`);
      const header = createHeader(objects, objectType);

      console.log(`Create rows for selection:`);
      const data = objects.map((o) => createRow(header, o, objectType));
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
        saveRowsToFile(header, data, exportFile);
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
      columnLogText += `, ${ENDPOINT_LABELS.length} endpoints`;
      break;
    case OBJECT_TYPE_ELEMENT:
      // GEMMA columns for exporting element view references
      if (GEMMA_PUBLICEREN_TOT_EN_MET_LABEL) {
        header.push(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL);
        columnLogText += `, 1 ${GEMMA_PUBLICEREN_TOT_EN_MET_LABEL}`;
      }
      if (GEMMA_LIST_API_LABEL) {
        header.push(GEMMA_LIST_API_LABEL);
        columnLogText += `, 1 ${GEMMA_LIST_API_LABEL}`;
      }
      if (GEMMA_PUBLICEREN_NO_LABEL) {
        header.push(GEMMA_PUBLICEREN_NO_LABEL);
        columnLogText += `, 1 ${GEMMA_PUBLICEREN_NO_LABEL}`;
      }
      if (GEMMA_PUBLICEREN_LABELS.length > 0) {
        GEMMA_PUBLICEREN_LABELS.forEach((publiceren_label) => header.push(publiceren_label));
        columnLogText += `, ${GEMMA_PUBLICEREN_LABELS.length} GEMMA publiceren`;
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
  // remove duplicate property labels  ### kan dit met een filter op een array?
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
function createRow(headerRow, object, objectType) {
  let row = new Object();

  debugStackPush(false);
  debug(`\n> `);
  debug(`${object}`);

  // fill row with the attributes and property values of the object
  headerRow.forEach((label) => {
    row[label] = get_attr_or_prop(object, label);
  });

  // fill folder column
  if (FOLDER_LABEL) {
    // row[FOLDER_LABEL] = get_folderPath($(`#${object.id}`), "");
    row[FOLDER_LABEL] = getArchiFolder(object, "");
    debug(`row[FOLDER_LABEL]: ${row[FOLDER_LABEL]}`);
  }

  // GEMMA columns for checking which elements will be published
  if (objectType == OBJECT_TYPE_ELEMENT) {
    // fill column with the 'highest' publiceren value of all the views with the object drawn
    if (GEMMA_PUBLICEREN_TOT_EN_MET_LABEL) {
      row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL] = getPublicerenTotEnMet(object);
      debug(`row[PUBLICEREN_TOT_EN_MET]: ${row[GEMMA_PUBLICEREN_TOT_EN_MET_LABEL]}`);
    }
    if (GEMMA_LIST_API_LABEL) {
      row[GEMMA_LIST_API_LABEL] = getGEMMA_ListAPI(object);
      debug(`row[GEMMA_LIST_API]: ${row[GEMMA_LIST_API_LABEL]}`);
    }
    // fill publiceren columns with the view names of the elements view references
    if (GEMMA_PUBLICEREN_LABELS.length > 0) {
      $(object)
        .viewRefs()
        .each((v) => {
          let headerLabel = v.prop("Publiceren");
          if (!headerLabel) {
            headerLabel = GEMMA_PUBLICEREN_NO_LABEL;
          } else {
            if (!GEMMA_PUBLICEREN_LABELS.includes(headerLabel)) {
              console.log(`ERROR: ${v} met ongeldige property Publiceren = ${headerLabel}`);
            }
          }
          // first cell value without a separator
          if (!row[headerLabel]) row[headerLabel] = `${v.name}`;
          else row[headerLabel] += `, ${v.name}`;
        });
    }
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
 * get the 'highest' publiceren value of the elements view references
 */
function getPublicerenTotEnMet(object) {
  let maxPublicerenIndex = -1;
  let pubProp = "Geen view";

  $(object)
    .viewRefs()
    .each(function (v) {
      if (!v.prop("Publiceren") && maxPublicerenIndex == -1) {
        pubProp = "Geen view met publiceren";
      } else {
        let publicerenIndex = GEMMA_PUBLICEREN_LABELS.indexOf(`${v.prop("Publiceren")}`);
        if (publicerenIndex > maxPublicerenIndex) maxPublicerenIndex = publicerenIndex;
      }
    });
  if (maxPublicerenIndex > -1) pubProp = GEMMA_PUBLICEREN_LABELS[maxPublicerenIndex];
  return pubProp;
}

/**
 * get wether the element will be published by the list API
 */
function getGEMMA_ListAPI(object) {
  let maxPublicerenIndex = -1;

  $(object)
    .viewRefs()
    .each(function (v) {
      let publicerenIndex = GEMMA_PUBLICEREN_LABELS.indexOf(`${v.prop("Publiceren")}`);
      if (publicerenIndex > maxPublicerenIndex) maxPublicerenIndex = publicerenIndex;
    });
  if (maxPublicerenIndex >= 2) return "List API";
  else return "Niet";
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
