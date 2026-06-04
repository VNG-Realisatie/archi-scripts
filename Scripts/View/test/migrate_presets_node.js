#!/usr/bin/env node
/**
 * Node.js migration: convert preset JSON files from old format to new format.
 * Run: node migrate_presets_node.js
 */
const fs   = require("fs");
const path = require("path");

const PRESETS_DIR = path.join(__dirname, "user_parameter");

const ALGORITHM_MAP = {
  layered:     "Layered", mrtree: "Tree",    force:  "Force",
  stress:      "Stress",  radial: "Radial",  box:    "Grid",
  rectpacking: "Pack",    dagre:  "Dagre",   dot:    "Dot",
  neato:       "Neato",   fdp:    "FDP",     sfdp:   "SFDP",
  twopi:       "Twopi",   circo:  "Circo",
};
const ACTION_MAP = {
  Generate:         "new_view",
  GenerateMultiple: "one_each",
  Expand:           "expand_view",
  Layout:           "layout_only",
  generate_single:  "new_view",
};
const DIRECTION_MAP = {
  RIGHT: "Left → Right", LEFT: "Right → Left",
  DOWN:  "Top → Bottom", UP:   "Bottom → Top",
  LR:    "Left → Right", RL:   "Right → Left",
  TB:    "Top → Bottom", BT:   "Bottom → Top",
};
const ROUTING_MAP = {
  ORTHOGONAL: "Orthogonal", POLYLINE: "Polyline",
  STRAIGHT:   "Straight",   SPLINE:   "Spline (approximated)",
  CURVED:     "Spline (approximated)",
};
const RANKING_MAP = {
  "network-simplex": "Balanced", "longest-path": "Uniform", "tight-tree": "Top-aligned",
};
const LABEL_POS_MAP = {
  auto: "Middle", source: "Source", middle: "Middle", target: "Target",
  Source: "Source", Middle: "Middle", Target: "Target", Natural: "Natural",
};

function migratePreset(old, filename) {
  // Already new format? Check for new-style direction value
  if (old.params && old.params.direction && old.params.direction.includes("→")) {
    return null; // already migrated
  }

  const n = {
    name:      old.name || path.basename(filename, ".json"),
    algorithm: ALGORITHM_MAP[old.algorithm] || "Layered",
    params: {
      direction:             DIRECTION_MAP[old.layoutDirection]       || "Left → Right",
      routing:               ROUTING_MAP[old.edgeRouting]             || "Orthogonal",
      labelPosition:         LABEL_POS_MAP[old.labelPosition]         || "Middle",
      ranking:               RANKING_MAP[old.dagreRanker]             || "Balanced",
      reverseRelationTypes:  old.layoutReversed                       || [],
      nestingRelationTypes:  old.layoutNested                         || [],
      innerSpacing:          old.nestedNodeSpacing !== undefined ? old.nestedNodeSpacing : 20,
      padding:               old.padding          !== undefined ? old.padding           : 20,
      sortContainers:        !(old.sortLeavesOnly),  // inverted
      alignSameType:         old.sameTypeResize                       || false,
      showInEveryContainer:  old.nestingMultipleOccurrences           || false,
      layerSpacing:          old.layerSpacing    !== undefined ? old.layerSpacing    : 180,
      elementSpacing:        old.nodeSpacing     !== undefined ? old.nodeSpacing     : 40,
      elementWidth:          old.nodeWidth       !== undefined ? old.nodeWidth       : 140,
      elementHeight:         old.nodeHeight      !== undefined ? old.nodeHeight      : 60,
      maxWidth:              old.viewMaxWidth    !== undefined ? old.viewMaxWidth    : 0,
      maxHeight:             old.viewMaxHeight   !== undefined ? old.viewMaxHeight   : 0,
      aspectRatio:           old.viewAspectRatio !== undefined ? old.viewAspectRatio : 0,
    },
    filter: {
      elementTypes:  old.includeElementType  && old.includeElementType.length  > 0 ? old.includeElementType  : [],
      relationTypes: old.includeRelationType && old.includeRelationType.length > 0 ? old.includeRelationType : [],
      diagramTypes:  [],
    },
    relatedElements: {
      steps: old.graphDepth && old.graphDepth > 0 ? [{
        depth:         old.graphDepth,
        elementTypes:  old.includeElementType  || [],
        relationTypes: old.includeRelationType || [],
        diagramTypes:  [],
      }] : [],
    },
    view: {
      name:   old.viewName       || "",
      folder: old.viewFolder     || "",
    },
  };

  // Carry action if present
  if (old.action) n.action = ACTION_MAP[old.action] || "new_view";

  return n;
}

// Run
const files = fs.readdirSync(PRESETS_DIR)
  .filter(f => f.endsWith(".json") && f !== "_session.json");

let migrated = 0, skipped = 0, errors = 0;

for (const file of files) {
  const fpath = path.join(PRESETS_DIR, file);
  try {
    const old  = JSON.parse(fs.readFileSync(fpath, "utf-8"));
    const migr = migratePreset(old, file);
    if (!migr) {
      console.log(`SKIP (already new format): ${file}`);
      skipped++;
    } else {
      fs.writeFileSync(fpath, JSON.stringify(migr, null, 2), "utf-8");
      console.log(`MIGRATED: ${file}`);
      migrated++;
    }
  } catch (e) {
    console.error(`ERROR: ${file} — ${e.message}`);
    errors++;
  }
}

console.log(`\nDone. Migrated: ${migrated}  Skipped: ${skipped}  Errors: ${errors}`);
