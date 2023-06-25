// set GEMMA_COLUMNS to false if you don't want GEMMA special columns for elements
const GEMMA_COLUMNS = false;
const GEMMA_PUBLICEREN_TOT_EN_MET_LABEL = "Publiceren tot en met";
const GEMMA_LIST_API_LABEL = "SWC API";
const GEMMA_PUBLICEREN_VALUES = [
  "Niet",
  "Redactie",
  "GEMMA Online en redactie",
  "Softwarecatalogus en GEMMA Online en redactie",
];

// labels to skip when updating objects
// - don't import the attribute type (can't be set) and
// - don't import the attribute id (can't be set) and
// - don't import the endpoints (used for finding the relation)
const LABELS_NOT_TO_UPDATE = ["type", "id", FOLDER_LABEL]
  .concat(ENDPOINT_LABELS)
  .concat(GEMMA_PUBLICEREN_TOT_EN_MET_LABEL)
  .concat(GEMMA_LIST_API_LABEL);
