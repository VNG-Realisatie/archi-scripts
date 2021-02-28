/**
 * 
 * @param { * } selection 
 * @param {*} filename 
 */
function executeExportImport(selection, filename ) {
	let objectType = filename.replace(/^.*[\\\/]/, '').replace(/\.ajs$/, '').replace(/%20/, '-').toLowerCase();

	console.log(`Export ${objectType}`)

	switch (objectType) {
		case 'element': {

			break;
		}
		case 'relation': {

			break;
		}
		case 'view': {

			break;
		}
	}


}
