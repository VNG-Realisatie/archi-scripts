/**
 * Functions for working with Archi folders
 *
 * (c) 2023 Mark Backer
 *
 */

/**
 * get objects folderpath by recursively walkin up the parentfolders
 *
 * How to call
 *     let folder = getArchiFolder(object, "");
 */
function getArchiFolder(child, currentFolderName = "") {
  // let parent = $(`#${child.id}`).parent("folder");
  let parent = $(child).parent("folder");
  if (parent.size() == 0) return `/${currentFolderName}`;

  let folderName = `${parent.first().name}/${currentFolderName}`;
  return getArchiFolder(parent.first(), folderName);
}

/**
 * delete empty folders by recursing over the folder tree
 *
 * @param {object} folderObj - current folder to traverse. For root folder, use $(model).first()
 * @param {integer} level - current level of recursion
 * @param {string} folderPath - path of traversed parent folders
 */
function deleteEmptyFolders(folderObj, level = 0, folderPath = "") {
  // stop if folder has no subfolders
  let subFolders = $(folderObj).children("folder");
  if (subFolders.size() == 0) return;

  subFolders.each((subFolder) => {
    deleteEmptyFolders(subFolder, level + 1, `${folderPath}/${subFolder.name}`);

    // delete empty folder
    if ($(subFolder).children().size() == 0 && level > 0) {
      console.log(` - ${subFolder.name != "" ? `${folderPath}/${subFolder.name}` : `${folderPath}/## no name ##`}`);
      subFolder.delete();
    }
  });
}

function getFolder(layer, folderName) {
  let folder = findFolder(layer, folderName);

  if (!folder) {
    let layerFolder = $(model)
      .children()
      .filter("folder." + layer)
      .first();
    folder = layerFolder.createFolder(folderName);
  }

  return folder;
}

function findFolder(layer, folderName) {
  let layerFolder = $(model)
    .children()
    .filter("folder." + layer)
    .first();
  let folder = $(layerFolder)
    .children()
    .filter("folder." + folderName)
    .first();

  return folder;
}
