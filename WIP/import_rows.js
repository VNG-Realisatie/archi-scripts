
// load(__DIR__ + "../_lib/papaparse.min.js");

const OBJECT_TYPE_RELATION = "relations";
const OBJECT_TYPE_ELEMENT = "elements";
const OBJECT_TYPE_VIEW = "views";

class Rows {
	constructor(importFile) {
		this.fileName = importFile.split("\\").pop().split("/").pop();
		this.data = getRowsFromFile(importFile)
	}

	summary() {
		console.log(`> Loading CSV file: ${this.fileName}\n`);
	}
}


const rows = new Rows(importFile)

console.log(typeof Rows); 
console.log(typeof rows);
console.log(`rows.summary(): ${rows.summary()}`);



/**
 * 
	-data : array objects
	-header : object

	+getRowsFromFile(fileType, fileName) array objects
	+importRows()
	+readHeader()
	+validateRow() string
	+readRow()

	+printCounters()
	+saveRowsToFile(fileType, fileName)
}

class RelationRows {
	<<interface>>
	-relation_endpoint_Header
	+createHeader()
	+readHeader()
}

class ViewRows {
	<<interface>>
}
class ElementRows {
	<<interface>>
}
 */


/**
 * Read CSV file in UTF-8 encoding and return file parsed into an array
 */
function getRowsFromFile(importFile) {

	if (importFile) {
		var rows = Papa.parse(readFully(importFile, 'utf-8'), {
			header: true,
			encoding: 'utf-8',
			skipEmptyLines: true
		}).data;

	} else {
		console.log("> Canceled");
	}
	return rows
}

// Some Polyfills for Nashorn ====================================================================================
function readFully(url, charset) {
	var result = '';
	var imports = new JavaImporter(java.net, java.lang, java.io);

	with(imports) {

		var urlObj = null;

		try {
			urlObj = new URL(url);
		} catch (e) {
			// If the URL cannot be built, assume it is a file path.
			urlObj = new URL(new File(url).toURI().toURL());
		}

		var reader = new BufferedReader(new InputStreamReader(urlObj.openStream(), charset));

		var line = reader.readLine();
		while (line != null) {
			result += line + '\n';
			line = reader.readLine();
		}

		reader.close();
	}

	return result;
}