// config.default.js

// This is the default config file for the GGM scripts
// Empty values for csv file will cause a pop-up to select the file when running the script

// Copy this file as config.js and fill in your local settings
// - keep the DefaultConfig object and rename it to Config

const DefaultConfig = {
  folderPath: "",
  csvFiles: {
    elements: "ggm_export_objects_04062025-090332.csv",
    relations: "converted relations.csv"
  },
  getPath: function (fileKey) {
    if (this.folderPath !== "") {
      return this.folderPath + "/" + this.csvFiles[fileKey];
    } else {
      return "";
    }
  }
};

module.exports = DefaultConfig;