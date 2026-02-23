// config.default.js
//
// This is the default config file for import and export of csv files
// You can create a config.js file with your local settings (see example below)

/**
// Example for a config.js with your local settings

module.exports = {
  FOLDER_COLUMN: false,
  GEMMA_COLUMNS: true,
};
 */

console.log();
console.log("Default configuratie in " + __FILE__);

let _config = {
  FOLDER_COLUMN: true, // default create a folder column
  GEMMA_COLUMNS: false, // default do not create the GEMMA columns};
  importfile: "", // default import file name
  exportType: Common.OBJECT_TYPE_ELEMENT, // default export type (element, relation, view)
  exportfile: "", // default export file name
};
console.log(`Default configuratie: \n${JSON.stringify(_config, null, 2)}`);
// validateConfig(_config);

try {
  // Probeer config.js in te lezen
  const LocalConfig = require(__DIR__ + "config.js");
  Object.assign(_config, LocalConfig);
  console.log(`Lokale configuratie in /config.js: \n${JSON.stringify(LocalConfig, null, 2)}`);
  console.log();
} catch (err) {
  // Bestand ontbreekt: blijf bij lege defaults
  console.log("File /config.js niet gevonden, gebruik default configuratie");
}

module.exports = _config
