// config.default.js
//
// This is the default config file for the GGM scripts with empty values.
// The scripts will prompt for the required files and folders when executed.
// You can create a config.js file with your local settings (see example below) 

/**
// Example for a config.js with your local settings

module.exports = {
  GGM_importFolder: "/home/<user>/Documents/Archi/scripts/Werkbestanden/GGM/",
  elementCSV: "ggm_export_objects_18022026-151638.csv",
  relatieCSV: "ggm_export_relations_18022026-151638.csv",
  GEMMA_exportFolder: "/home/<user>/Documents/Archi/model-repository/gemma-ggm-archi-repository/",
};
 */

console.log("Config lokale folders");

let _config = {
  GGM_importFolder: '',
  elementCSV: '',
  relatieCSV: '',
  GEMMA_exportFolder: '',
};

try {
  // Probeer config.js in te lezen
  const LocalConfig = require(__DIR__ + "/config.js");
  Object.assign(_config, LocalConfig);
} catch (err) {
  // Bestand ontbreekt: blijf bij lege defaults
}

console.log('> GGM import folder:', _config.GGM_importFolder);
console.log('  - Element CSV:', _config.elementCSV);
console.log('  - Relatie CSV:', _config.relatieCSV);
console.log('> GEMMA export folder:', _config.GEMMA_exportFolder);
console.log();

module.exports = {
  GGM_importFolder: _config.GGM_importFolder,
  elementCSV: _config.elementCSV,
  relatieCSV: _config.relatieCSV,
  GEMMA_exportFolder: _config.GEMMA_exportFolder,
};