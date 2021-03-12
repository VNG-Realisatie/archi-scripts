class Book {
	constructor(title, author){ 
	   this.title = title;
	   this.author = author;
	} 
	summary() {
	   console.log(`${this.title} written by ${this.author}`);
	}
 }
 class Rows {
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

class Index {
	<<interface>>
	-indexedData : array
	+indexRows() indexed rows
	+readIndexRows()
}

class ArchiWrapper {
	<<abstract>>
	-attributeHeader
	-propertyHeader
	+selectObjects() array objects
	-exportObjects()
	+get_attr_or_prop()
	+set_attr_or_prop()
	+createHeader() object
	+createRow() object
	+createObject() string
	+updateObject() string
	+findObject() object
}

class RelationWrapper {
	<<interface>>
	-endpointHeader
	+createRow()
	+readRow()
	+validateRow()
	+createObject()
	+createHeader()
	+updateObject() string
	+findObject() object
}

class ElementWrapper {
	<<interface>>
}
class ViewWrapper {
	<<interface>>
}

