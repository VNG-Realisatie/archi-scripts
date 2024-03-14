// Sync Model from CSV.ajs
//
// Requires jArchi - https://www.archimatetool.com/blog/2018/07/02/jarchi/
//
// This script allows easy integration of data coming from other systems through CSV files.
// Each CSV file is described through a configuration object that you can later load and sync.
// Most of the mapping informations (Id, Name, Documentation, Properties...) can be expressed through
// the name of a column from the CSV file or through a function (which allows more advanced computation).
//
// Dataset used as example comes from https://datahub.io/core/country-codes
// v0.5 - jb.sarrodie@accenture.com
//        Cast property's value to String to avoid ambiguity between prop(String, String) and prop(String, boolean)
//        propMapping's values can now be functions
//        Now prints a message at the end of the synchronisation
//        A target folder can be defined on data sources (if defined, elements will be moved to this folder)
//        Tag elements and relationships that used to be synced but are no more in source files
//        Check rowid for null (don't index)
// v0.4 - jb.sarrodie@accenture.com
//        'id' can now be a function and is result is stored
//        as a '_id' property of each 'row'
//        Now imports all datasources
// v0.3 - jb.sarrodie@accenture.com
//        Configuration is now done using JS object syntaxe
//        (easier to read/write for a Human)
// v0.2 - jb.sarrodie@accenture.com
//        Is now fully configuration (includes relationships) and
//        updates an existing model instead of creating a new one
// v0.1 - jb.sarrodie@accenture.com
//        First version which is partly configurable and successfully
//        loads (some) CSV into an empty ArchiMate model
//
// Copyright (c) 2020  JB Sarrodie & La Poste (www.laposte.fr)
//
// Permission is hereby granted, free of charge, to any person
// obtaining a copy of this software and associated documentation
// files (the "Software"), to deal in the Software without
// restriction, including without limitation the rights to use,
// copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the
// Software is furnished to do so, subject to the following
// conditions:
//
// The above copyright notice and this permission notice shall be
// included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
// EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
// OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
// HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
// WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
// OTHER DEALINGS IN THE SOFTWARE.

// Changes
// MB : trim spaces for all csv values

// Don't change this unless you really know what you are doing ==================================================
var syncPropName = "Latest Sync Date";
var deletedPropName = "Deleted from CSV Datasource";
// Compute the date which will appear in every new or updated concepts - Has to be
var currentDateTime = new Date();
currentDateTime =
  lpad(currentDateTime.getDate()) +
  "/" +
  lpad(currentDateTime.getMonth() + 1) +
  "/" +
  currentDateTime.getFullYear() +
  " " +
  lpad(currentDateTime.getHours()) +
  ":" +
  lpad(currentDateTime.getMinutes()) +
  ":" +
  lpad(currentDateTime.getSeconds());

// In production I recommend dowloading papaparse.min.js and load it locally
//load(__DIR__+'papaparse.min.js');
load("https://unpkg.com/papaparse@latest/papaparse.min.js");

// Functions ====================================================================================================
function loadAndSync(dataSource) {
  loadData(dataSource);
  buildModelIndex(dataSource);
  syncModelElements(dataSource);
}

function lpad(text) {
  return ("0" + text).substr(-2);
}

function loadData(dataSource) {
  if (dataSource._loaded) {
    console.log('WARNING - Datasource "', dataSource.label, '" has already been loaded');
    return;
  }

  console.log('INFO - Loading "', dataSource.label, '" from CSV...');

  var rows = Papa.parse(readFully(dataSource.csv, "utf-8"), {
    header: true,
    encoding: "utf-8",
    skipEmptyLines: true,
    transform: function (value) {
      return value.trim();
    },
  }).data;
  dataSource.rows = {};

  for (var i = 0; i < rows.length; i++) {
    var filter = typeof dataSource.filter === "function" ? dataSource.filter(rows[i]) : true;
    var id = typeof dataSource.id === "function" ? dataSource.id(rows[i]) : rows[i][dataSource.id];
    if (filter) {
      if (id) {
        dataSource.rows[id] = rows[i];
        dataSource.rows[id]["_id"] = id;
      } else {
        console.log("ERROR - Row #", i, " of ", dataSource.label, " doesn't have a valid id");
      }
    } else {
      // console.log(`Skipped: filter=${filter}`);
    }
  }

  dataSource._loaded = true;
}

function buildModelIndex(dataSource) {
  if (dataSource._modelIndexed) {
    console.log('WARNING - Model elements associated with "', dataSource.label, '" have already been indexed');
    return;
  }

  console.log('INFO - Indexing "', dataSource.label, '" from model...');

  dataSource.model = {};

  $(dataSource.targetType).each(function (element) {
    var id = dataSource.getId(element);
    if (id) {
      dataSource.model[id] = element;
    }
  });

  dataSource._modelIndexed = true;
}

function syncModelElements(dataSource) {
  if (dataSource._modelElementsSynced) {
    console.log('WARNING - Datasource "', dataSource.label, '" has already been synced');
    return;
  }

  console.log('INFO - Syncing "', dataSource.label, '" elements from CSV with model...');
  var created = 0;
  var updated = 0;

  for (var id in dataSource.rows) {
    var row = dataSource.rows[id];
    var element = dataSource.model[id];
    var name = typeof dataSource.name === "function" ? dataSource.name(row) : row[dataSource.name];
    var documentation =
      typeof dataSource.documentation === "function" ? dataSource.documentation(row) : row[dataSource.documentation];

    if (element) {
      updated++;
    } else {
      element = model.createElement(dataSource.targetType, name);
      dataSource.setId(element, row);
      dataSource.model[id] = element;
      created++;
    }

    // Brute force update
    if (dataSource.targetFolder) {
      dataSource.targetFolder.add(element);
    }
    element.prop(syncPropName, currentDateTime);
    element.name = name;
    element.documentation = documentation;
    for (var propName in dataSource.propMapping) {
      var propValue =
        typeof dataSource.propMapping[propName] === "function"
          ? dataSource.propMapping[propName](row)
          : row[dataSource.propMapping[propName]];
      // Cast propValue to String to avoid ambiguity between prop(String, String) and prop(String, boolean) in rare occasions
      if (propValue) element.prop(propName, String(propValue));
    }
  }

  dataSource._modelElementsSynced = true;
  console.log(
    'INFO - Datasource "',
    dataSource.label,
    '" has been synced: ',
    created,
    " element(s) created and ",
    updated,
    " updated"
  );
}

function syncModelRelationships(dataSource) {
  if (dataSource._modelRelationshipsSynced) {
    console.log('WARNING - Model relationships associated with "', dataSource.label, '" have already been synced');
    return;
  }

  console.log('INFO - Syncing "', dataSource.label, '" relationships from CSV with model...');
  var createdOrUpdated = 0;

  for (var id in dataSource.rows) {
    var row = dataSource.rows[id];
    var element = dataSource.model[id];

    if (!element) {
      console.log(
        'WARNING - No element found for "',
        dataSource.label,
        '" with id=',
        id,
        " (maybe model elements haven't been synced before?)"
      );
    } else {
      for (var relationName in dataSource.relations) {
        var relation = dataSource.relations[relationName];
        var otherEndsIds = row[relation.column];
        if (otherEndsIds) {
          otherEndsIds = otherEndsIds.split("\n");

          for (var i = 0; i < otherEndsIds.length; i++) {
            var otherEnd = relation.reference.model[otherEndsIds[i]];
            if (!otherEnd) {
              console.log(
                'WARNING - Element "',
                dataSource.label,
                '" with id=',
                id,
                " references another element ",
                relation.reference.label,
                " with id=",
                otherEndsIds[i],
                " which doesn't exist (maybe model elements haven't been synced before?)"
              );
            } else {
              if (relation.isReversed) {
                createOrUpdateRelationship(relation, otherEnd, relation.targetType, element);
              } else {
                createOrUpdateRelationship(relation, element, relation.targetType, otherEnd);
              }

              createdOrUpdated++;
            }
          }
        }
      }
    }
  }

  dataSource._modelRelationshipsSynced = true;
  console.log(
    "INFO - ",
    createdOrUpdated,
    ' relationship(s) associated with datasource "',
    dataSource.label,
    '" have been created or updated'
  );
}

function tagDeletedConcepts() {
  console.log("INFO - Looking for deleted elements or relationships and tagging them as deleted...");
  var deleted = 0;

  $("concept")
    .filter(function (c) {
      lastUpdateDate = c.prop(syncPropName);
      if (lastUpdateDate) {
        return lastUpdateDate != currentDateTime;
      } else {
        return false;
      }
    })
    .each(function (c) {
      if (!c.prop(deletedPropName)) {
        c.name = "[DELETED] " + c.name;
        c.prop(deletedPropName, currentDateTime);
        deleted++;
      }
    });

  console.log("INFO - ", deleted, " elements or relationships have been tagged as deleted");
}

function createOrUpdateRelationship(config, source, type, target) {
  var relationship = $(source)
    .outRels(type)
    .filter(function (r) {
      return r.target.equals(target);
    })
    .filter(function (r) {
      return r.prop(syncPropName);
    })
    .first();

  if (!relationship) {
    relationship = model.createRelationship(type, "", source, target);
  }

  relationship.prop(syncPropName, currentDateTime);

  for (var propName in config.propMapping) {
    if (typeof config.propMapping[propName] === "function") {
      var propValue = config.propMapping[propName](relationship);
      // Cast propValue to String to avoid ambiguity between prop(String, String) and prop(String, boolean) in rare occasions
      if (propValue) relationship.prop(propName, String(propValue));
    }
  }

  if (type == "access-relationship") {
    relationship.accessType = config.accessType;
  }

  if (type == "association-relationship") {
    relationship.associationDirected = config.associationDirected;
  }
  if (config.targetFolder) {
    config.targetFolder.add(relationship);
  }
}

function getFolder(layer, folderName) {
  layerFolder = $(model)
    .children()
    .filter("folder." + layer)
    .first();
  folder = $(layerFolder)
    .children()
    .filter("folder." + folderName)
    .first();

  if (!folder) {
    folder = layerFolder.createFolder(folderName);
  }

  return folder;
}

// Some Polyfills for Nashorn ====================================================================================
function readFully(url, charset) {
  var result = "";
  var imports = new JavaImporter(java.net, java.lang, java.io);

  with (imports) {
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
      result += line + "\n";
      line = reader.readLine();
    }

    reader.close();
  }

  return result;
}
