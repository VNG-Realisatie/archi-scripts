/**
 * GEMMA specific functions
 *
 * Version 1: 25-5-2024
 *
 * (c) 2024 Mark Backer
 */

// Label of the property with the ID
const PROP_ID = "Object ID";
const PROP_RELEASE = "Release";

/**
 * Gather all objects in the model, excluding folders.
 * @returns {Array} Array of objects
 */
function gatherObjects() {
  let objects = [];
  objects.push(model);
  $("*")
    .not("folder")
    .each((o) => objects.push(o));
  return objects;
}

/**
 * Set Object IDs for objects without ID or with invalid ID.
 * @param {Array} objects - Array of objects with IDs to check
 * @returns {Boolean} true if all Object ID's are set
 */
function setObjectID(objects) {
  const objectsWithID = objects.filter((object) => object.prop(PROP_ID));
  const objectsWithoutID = objects.filter((object) => !object.prop(PROP_ID));

  console.log(`Checking property ${PROP_ID}'s in ${model}`);
  console.log(`Total number of objects to check: \t${objects.length}`);

  // Check for duplicates
  const objectsWithDuplicateID = checkDuplicateID(objectsWithID);
  if (objectsWithDuplicateID.length > 0) {
    console.log(`Not all objects have a valid ${PROP_ID}\n`);
    console.log(`Resolve the reported duplicate ${PROP_ID} by deleting one of them\n`);
    return false;
  } else {
    // Check for invalid IDs
    const objectsWithUnvalidID = checkUnvalidID(objectsWithID);
    if (objectsWithUnvalidID.length > 0) {
      console.log(
        `Replacing ${PROP_ID} in ${objectsWithUnvalidID.length} object${objectsWithUnvalidID.length > 1 ? "s" : ""}\n`
      );
      const replacedIDs = objectsWithUnvalidID.sort().map((o) => {
        let id_generated = generateUUID();
        const oldID = o.prop(PROP_ID);
        o.prop(PROP_ID, id_generated);
        return { Object: o.toString(), "Old Object ID": oldID, "New Object ID": id_generated };
      });
      logInColumns(replacedIDs, ["Object", "Old Object ID", "New Object ID"]);
      console.log();
    }

    if (objectsWithoutID.length > 0) {
      console.log(
        `\nAdding ${PROP_ID} to ${objectsWithoutID.length} object${objectsWithoutID.length > 1 ? "s" : ""}\n`
      );
      const newIDs = objectsWithoutID.sort().map((o) => {
        let id_generated = generateUUID();
        o.prop(PROP_ID, id_generated);
        return { Object: o.toString(), "New Object ID": id_generated };
      });
      logInColumns(newIDs, ["Object", "New Object ID"]);
      console.log();
    }
    console.log(`Summary:`);
    console.log(`- added ${PROP_ID}: \t${objectsWithoutID.length}`);
    console.log(`- replaced ${PROP_ID}: \t${objectsWithUnvalidID.length}`);
    console.log(`All objects now have a valid ${PROP_ID}\n`);
    return true;
  }
}

/**
 * Check all objects for duplicate Object IDs.
 * @param {Array} objectsWithID - Array of objects with IDs to check for duplicates
 * @returns {Array} An array of objects with duplicate IDs
 */
function checkDuplicateID(objects) {
  const objectsWithID = objects.filter((object) => object.prop(PROP_ID));
  const lookup = objectsWithID.reduce((acc, obj) => {
    acc[obj.prop(PROP_ID)] = acc[obj.prop(PROP_ID)] + 1 || 0;
    return acc;
  }, {});

  const objWithDupID = objectsWithID.filter(obj => lookup[obj.prop(PROP_ID)] ).map(obj => ({
    "Object ID": obj.prop(PROP_ID),
    "Objects": obj.name
  }));

  if (objWithDupID.length > 0) {
    console.log(`\nDuplicates found`);
    console.log(`- ${objWithDupID.length} object${objWithDupID.length > 1 ? "s" : ""} with duplicate ${PROP_ID}`);
    logInColumns(objWithDupID, ["Object ID", "Objects"]);
  }

  return objWithDupID;
}

/**
 * Check all objects for invalid Object IDs.
 * @param {Array} objectsWithID - Array of objects with IDs to check for invalid IDs
 * @returns {Array} An array of objects with invalid IDs
 */
function checkUnvalidID(objects) {
  const objectsWithID = objects.filter((object) => object.prop(PROP_ID));
  const objectsWithUnvalidID = objectsWithID.filter((object) => unvalidGUID(object));
  function unvalidGUID(o) {
    let oGUID = o.prop(PROP_ID);
    return !(
      RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", "i").test(oGUID) ||
      RegExp("^[0-9a-f]{32}$", "i").test(oGUID) ||
      RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}-pv$", "i").test(oGUID) ||
      RegExp("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{10}$", "i").test(oGUID)
    );
  }

  if (objectsWithUnvalidID.length > 0) {
    console.log(`\nInvalid GUIDs found`);
    console.log(
      `- ${objectsWithUnvalidID.length} object${objectsWithUnvalidID.length > 1 ? "s" : ""} with invalid GUID`
    );
    logInColumns(objectsWithUnvalidID, ["Object ID", "Object"]);
  }

  return objectsWithUnvalidID;
}

/**
 * Log a list of objects in columns.
 * @param {Array} data - The data to log
 * @param {Array} headers - The headers for the columns
 */
function logInColumns(data, headers) {
  const columnWidths = headers.map((header) =>
    Math.max(...data.map((row) => (row[header] || "").toString().length), header.length)
  );
  const headerRow = headers.map((header, i) => header.padEnd(columnWidths[i])).join(" | ");
  const separatorRow = columnWidths.map((width) => "-".repeat(width)).join("-|-");
  console.log(headerRow);
  console.log(separatorRow);
  data.forEach((row) => {
    const rowString = headers.map((header, i) => (row[header] || "").toString().padEnd(columnWidths[i])).join(" | ");
    console.log(rowString);
  });
}
