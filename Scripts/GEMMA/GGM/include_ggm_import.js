/**
 * GGM Import configuration for Beleidsdomeinen and Data-objecten
 */
const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");
const GgmGemma = require(__DIR__ + "include_ggm_gemma.js");
const ArchiFolders = require(__SCRIPTS_DIR__ + "Scripts/_lib/archi_folders.js");

function getImportFile(Config) {
  let importFile = Config.GGM_importFolder + Config.elementCSV;
  if (!Config.elementCSV || !Config.GGM_importFolder) {
    importFile = window.promptOpenFile({
      title: "Open GGM export objects CSV",
      filterExtensions: ["*.csv"],
    });
  }
  return importFile;
}

function getConfiguration(importFile) {
  const beleidsdomeinen = {
    label: "Beleidsdomeinen",
    csv: importFile,
    targetType: "grouping",
    targetFolder: ArchiFolders.getFolderPath("/Other" + GgmGemma.FOLDER_SYNC_GGM + GgmGemma.FOLDER_BELEIDSDOMEIN),
    getId: function (element) {
      return element.name;
    },
    setId: function (element, row) {
      element.name = row["_id"];
    },
    id: "domein-iv3", // per id wordt een object aangemaakt
    name: "domein-iv3",
    documentation: "geen",
    propMapping: {
      [GgmGemma.PROP_ID]: function (element) {
        if (!element.prop(GgmGemma.PROP_ID)) {
          return Common.generateUUID();
        }
      },
      [GgmGemma.LABEL_DATUM_TIJD]: "datum-tijd-export",
      [GgmGemma.PROP_GEMMA_TYPE]: function (element) {
        if (!element.prop(GgmGemma.PROP_GEMMA_TYPE)) {
          return "te bepalen";
        }
      },
      [GgmGemma.PROP_GGM_TYPE]: function (element) {
        if (!element.prop(GgmGemma.PROP_GGM_TYPE)) {
          return GgmGemma.GGM_TYPE_BELEIDSDOMEIN;
        }
      },
    },
    relations: {},
  };

  const dataobjecten = {
    label: "Dataobject",
    csv: importFile,
    targetType: "data-object",
    targetFolder: ArchiFolders.getFolderPath("/Application" + GgmGemma.FOLDER_GGM_DATAOBJECT),
    getId: function (element) {
      return element.prop(GgmGemma.PROP_GGM_ID_IMPORTED);
    },
    setId: function (element, row) {
      element.prop(GgmGemma.PROP_GGM_ID_IMPORTED, row["_id"]);
    },
    id: GgmGemma.PROP_GGM_ID,
    name: "GGM-naam",
    documentation: "GGM-definitie",
    propMapping: {
      [GgmGemma.PROP_ID]: function (element) {
        if (!element.prop(GgmGemma.PROP_ID)) {
          return Common.generateUUID();
        }
      },
      [GgmGemma.PROP_GGM_UML_TYPE]: GgmGemma.PROP_GGM_UML_TYPE,
      [GgmGemma.PROP_GGM_TOELICHTING]: GgmGemma.PROP_GGM_TOELICHTING,
      [GgmGemma.PROP_GGM_SYNONIEMEN]: GgmGemma.PROP_GGM_SYNONIEMEN,
      [GgmGemma.PROP_GGM_BRON]: GgmGemma.PROP_GGM_BRON,
      [GgmGemma.PROP_GGM_ID_IMPORTED]: GgmGemma.PROP_GGM_ID,
      [GgmGemma.PROP_ARCHIMATE_TYPE]: function (element) {
        if (!element.prop(GgmGemma.PROP_ARCHIMATE_TYPE)) {
          return "te bepalen";
        }
      },
      [GgmGemma.LABEL_DATUM_TIJD]: "datum-tijd-export",
    },
    relations: {
      beleidsdomeinen_rel: {
        column: "domein-iv3",
        reference: beleidsdomeinen,
        targetType: "aggregation-relationship",
        targetFolder: ArchiFolders.getFolderPath("/Relations" + GgmGemma.FOLDER_GGM_BELEIDSDOMEIN),
        isReversed: true,
        propMapping: {
          [GgmGemma.PROP_ID]: function (relationship) {
            if (!relationship.prop(GgmGemma.PROP_ID)) {
              return Common.generateUUID();
            }
          },
          [GgmGemma.PROP_GEMMA_TYPE]: function (relationship) {
            return GgmGemma.GEMMA_TYPE_BELEIDSDOMEIN;
          },
        },
      },
    },
  };

  return { beleidsdomeinen, dataobjecten };
}

module.exports = {
  getImportFile,
  getConfiguration,
};
