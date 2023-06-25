/**
 * Generic functions for working with the jArchi objects
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
function getArchiFolder(child, currentFolderName="") {
  // let parent = $(`#${child.id}`).parent("folder");
  let parent = $(child).parent("folder");
  if (parent.size() == 0) return `/${currentFolderName}`;

  let folderName = `${parent.first().name}/${currentFolderName}`;
  return getArchiFolder(parent.first(), folderName);
}

