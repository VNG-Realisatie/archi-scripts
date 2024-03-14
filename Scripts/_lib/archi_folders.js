/**
 * Functions for working with Archi folders
 *
 * (c) 2023 Mark Backer
 */
console.log("Loading archi_folders.js");
const ARCHI_FOLDERS_LOADED = true;
/**
 * get the path of an object
 *  by recursively walkin up the parentfolders
 *
 * How to call
 *     let folder = printFolderPath(object);
 *
 * @param {Archi object} child
 * @param {string} childFolderName, builds up recursively
 * @returns string with path
 */
function printFolderPath(child, childFolderName = "") {
  let parent = $(child).parent("folder").first();
  if (!parent) return `/${childFolderName}`;

  let path = `${parent.name}/${childFolderName}`;
  return printFolderPath(parent, path);
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

/**
 * Get or create the folder of the path-string
 *
 * @param {string} path
 *    Example "/Application/sub/sub"
 *    Start with 'layer' folders, like Business, Other, Relations, ..
 * @returns
 */
function getFolderPath(path) {
  const EMPTY_LABEL = "";

  let startFolder, folder;
  for (const folderLabel of path.split("/")) {
    // skip empty label from optional starting or trailing "/"
    if (folderLabel != EMPTY_LABEL) {
      if (!startFolder) {
        // set Archi layer folder
        startFolder = $(`folder.${folderLabel}`).first();
        folder = startFolder;
      } else {
        folder = $(startFolder).children(`folder.${folderLabel}`).first();
        if (!folder) {
          folder = startFolder.createFolder(folderLabel);
        }
        startFolder = folder;
      }
    }
  }
  return folder;
}
