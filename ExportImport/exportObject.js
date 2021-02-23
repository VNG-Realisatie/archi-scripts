/**
 * ExportObject.ajs
 * 
 * Export Object_ID, id and other object properties of selection
 * The applyToModelContent function allows for multiple kinds of selections
 * 
 * export
 * 	exportElement
 * 
 * 
 * row
 * 	rowElement
 * 	rowRelation
 * 	rowView
 * 
 * 
 * 
 */
load(__DIR__ + "../lib/papaparse.min.js");

load(__DIR__ + "../Common/Common.ajs");
load(__DIR__ + "../Common/ApplyToSelection.ajs");

_commonShowDebugMessage = [false];
// exportString += `"${pObject.id}", "${pObject.type}", "${pObject.name}","${pObject.prop("GEMMA type")}", "${pObject.prop("Object ID")}"\n`;

// Class export
function Export() {

	header = new Set(["id", "type", "name", "documentation"]);
	data = [];

	get headerRow() {
			let headerArray = [];

			let i = 0;
			for (let columnLabel of this.header) {
				headerArray[i] = columnLabel;
				i++;
			}

			return headerArray;
		},

		get dataRows() { //idem
			return this.data;
		}
};

Export.prototype.exportConcept = function (pObject) {
	let Row = new Object;
	for (let attribute of this.header) {
		Row[attribute] = pObject.concept[attribute];
	}
	for (let i = 0; i < pObject.prop().length; i++) {
		let PropertyLabel = pObject.prop()[i];
		if (pObject.prop(PropertyLabel)) {
			this.header.add(PropertyLabel)
			Row[PropertyLabel] = pObject.prop(PropertyLabel);
			debug(`Row[${PropertyLabel}]: ${Row[PropertyLabel]}`);
		}
	}

	this.data.push(Row)
};

function exportElement() {

	this.exportData = {
		header = new Set(["id", "type", "name", "documentation"]),
		data = []
	};
};
function exportRelation() {

	this.exportData = {
		header = new Set(["id", "type", "name", "documentation"]),
		data = []
	};
};
function exportView() {

	this.exportData = {
		header = new Set(["id", "type", "name", "documentation"]),
		data = []
	};
};
// end Class export

Export.prototype.importConcept = function (pObject) {};

function importRelation() {

	this.exportData = {
		header = new Set(["id", "type", "name", "documentation"]),
		data = []
	};
};



Export.prototype.writeCSV = function (exportFile) {
	this.exportFile = exportFile;
}
Export.prototype.writeExcel = function (exportFile) {
	this.exportFile = exportFile;
}


initConsoleLog(__FILE__)

try {

	let exportList = new Export();

	applyToModelContent($(selection), exportList.row);

	let datum = new Date();
	let exportFile = window.promptSaveFile({
		title: "Export to CSV",
		filterExtensions: ["*.csv"],
		fileName: `${datum.toLocaleDateString('nl-NL')} ${model.name}-${$(selection).first().name}.csv`
	});
	if (exportFile != null) {

		debug(exportData.headerRow);

		$.fs.writeFile(exportFile, Papa.unparse({
			fields: exportData.headerRow,
			data: exportData.dataRows
		}));

		console.log(">>> saved in : " + exportFile);
	} else {
		console.log("> Save CSV canceled");
	}

} catch (error) {
	console.log(`> ${error}`);
}
finishConsoleLog()