/**
 * Builders of the View test model (build_test_model.ajs): the helpers that create elements, relations and a
 * flat view, and views 4 and 5. A module, so a run can add a view to the committed model without a rebuild
 * (a rebuild gives every object a new id, and every expected line and baseline view changes with them).
 *
 *   4 Parts   10 unconnected parts of different shape and size: two chains (one with a late source), a small tree, a star, a cycle,
 *             a container with four children, four single elements; self-loops: two on one element (one
 *             labelled) and one on a single element. Aspect ratio and Max width arrange parts; Container
 *             algorithm needs a container with several children; Dagre's Cycles needs a cycle.
 *   5 Large   300 elements in three nesting levels (10 systems × 4 subsystems × 6 components, 10 services
 *             at root), 442 relations; self-loops on a component and on a system. Generated from a fixed
 *             seed. For speed and scale; not in the baseline.
 *   6 GEMMA   the start of a GEMMA business function model: its root grouping; the steps of the GEMMA test presets
 *             (presets/Test/gemma/) reach the rest. Below it: superlayer groupings and domain groupings (GEMMA type /
 *             subtype, for the steps' property conditions) aggregate business functions four levels deep; a function
 *             in two parents; application services serve functions, components realize services (one service in
 *             two functions, one component in two services: managed occurrences); a long label; business objects
 *             accessed by functions; a flow and a data object the filters and steps leave out.
 *   7 GEMMA functions   two functions, the start of a preset that begins at the business functions (a step
 *             expands only from what the step before it added, so a start must not hold what the steps reach).
 *   8 GEMMA background   the background view of the GEMMA test presets: the root grouping with its superlayers
 *             side by side, their functions nested in them, each element once, with the aggregations drawn
 *             inside as on a generated view (Layout only follows the relations drawn). Not in the baseline.
 */
const PROP_DOMAIN = "domain";   // styled by the style condition in baseline.json
const GRID = { x: 20, y: 20, dx: 200, dy: 100, columns: 4, width: 160, height: 60 };

// [key, type, name, domain]
const PARTS_ELEMENTS = [
  ["order", "business-process", "Order", "Business"], ["pick", "business-process", "Pick", "Business"],
  ["pack", "business-process", "Pack", "Business"], ["ship", "business-process", "Ship", "Business"],
  ["express", "business-event", "Express", "Business"],
  ["gateway", "application-component", "Gateway", "Apps"], ["broker", "application-component", "Broker", "Apps"],
  ["store", "application-component", "Store", "Apps"],
  ["platform", "technology-service", "Platform", "Technology"], ["app1", "application-component", "App 1", "Apps"],
  ["app2", "application-component", "App 2", "Apps"], ["app3", "application-component", "App 3", "Apps"],
  ["billing", "business-process", "Billing", "Business"], ["invoicing", "business-process", "Invoicing", "Business"],
  ["hub", "application-component", "Hub", "Apps"],
  ["spoke1", "application-component", "Spoke 1", "Apps"], ["spoke2", "application-component", "Spoke 2", "Apps"],
  ["spoke3", "application-component", "Spoke 3", "Apps"], ["spoke4", "application-component", "Spoke 4", "Apps"],
  ["spoke5", "application-component", "Spoke 5", "Apps"],
  ["plan", "business-process", "Plan", "Business"], ["do", "business-process", "Do", "Business"],
  ["check", "business-process", "Check", "Business"], ["act", "business-process", "Act", "Business"],
  ["suite", "application-component", "Platform suite", "Apps"],
  ["part1", "application-component", "Part 1", "Apps"], ["part2", "application-component", "Part 2", "Apps"],
  ["part3", "application-component", "Part 3", "Apps"], ["part4", "application-component", "Part 4", "Apps"],
  ["lonerA", "business-actor", "Loner A", "Business"], ["lonerB", "data-object", "Loner B", "Data"],
  ["lonerC", "node", "Loner C", "Technology"], ["lonerD", "business-event", "Loner D", "Business"],
];
// [type, name, source, target]
const PARTS_RELATIONS = [
  ["triggering-relationship", "", "order", "pick"], ["triggering-relationship", "", "pick", "pack"],
  ["triggering-relationship", "", "pack", "ship"],                                                  // chain of 4
  ["triggering-relationship", "", "express", "ship"],   // a late source: Ranking puts it in layer 1 or next to Ship
  ["flow-relationship", "requests", "gateway", "broker"], ["flow-relationship", "", "broker", "store"], // chain of 3
  ["flow-relationship", "retry", "broker", "broker"], ["flow-relationship", "", "broker", "broker"],   // two self-loops
  ["serving-relationship", "", "platform", "app1"], ["serving-relationship", "", "platform", "app2"],
  ["serving-relationship", "", "platform", "app3"], ["serving-relationship", "", "app1", "billing"],
  ["serving-relationship", "", "app1", "invoicing"],                                                // tree
  ["flow-relationship", "", "hub", "spoke1"], ["flow-relationship", "", "hub", "spoke2"], ["flow-relationship", "", "hub", "spoke3"],
  ["flow-relationship", "", "hub", "spoke4"], ["flow-relationship", "", "hub", "spoke5"],            // star
  ["triggering-relationship", "", "plan", "do"], ["triggering-relationship", "", "do", "check"],
  ["triggering-relationship", "", "check", "act"], ["triggering-relationship", "again", "act", "plan"], // cycle
  ["composition-relationship", "", "suite", "part1"], ["composition-relationship", "", "suite", "part2"],
  ["composition-relationship", "", "suite", "part3"], ["composition-relationship", "", "suite", "part4"],
  ["flow-relationship", "", "part1", "part2"], ["flow-relationship", "", "part2", "part3"],          // container
  ["triggering-relationship", "", "lonerD", "lonerD"],                                               // self-loop on a single element
];

// [key, type, name, domain]; the GEMMA properties in GEMMA_PROPS
const GEMMA_ELEMENTS = [
  ["model", "grouping", "Bedrijfsfunctiemodel"],
  ["sturing", "grouping", "Sturing"], ["uitvoering", "grouping", "Uitvoering"], ["ondersteuning", "grouping", "Ondersteuning"],
  ["sociaal", "grouping", "Sociaal domein"], ["fysiek", "grouping", "Fysieke leefomgeving"], ["werk", "grouping", "Werk en inkomen"],
  ["strategie", "business-function", "Strategie"], ["beleid", "business-function", "Beleidsontwikkeling"],
  ["bewaking", "business-function", "Bewaking"], ["verantwoording", "business-function", "Verantwoording"],
  ["dienstverlening", "business-function", "Dienstverlening"], ["ontvangst", "business-function", "Ontvangst"],
  ["behandeling", "business-function", "Behandeling"], ["beoordeling", "business-function", "Beoordeling"],
  ["besluitvorming", "business-function", "Besluitvorming"], ["handhaving", "business-function", "Handhaving"],
  ["toezicht", "business-function", "Toezicht"],
  ["leefomgeving", "business-function", "Fysieke leefomgeving ontwikkeling en beheer"],
  ["infomanagement", "business-function", "Informatiemanagement"], ["gegevens", "business-function", "Gegevensmanagement"],
  ["archivering", "business-function", "Archivering"], ["bedrijfsvoering", "business-function", "Bedrijfsvoering"],
  ["zaakservice", "application-service", "Zaakafhandelservice"], ["klantservice", "application-service", "Klantcontactservice"],
  ["archiefservice", "application-service", "Archiveringsservice"], ["gegevensservice", "application-service", "Gegevensservice"],
  ["rapportageservice", "application-service", "Rapportageservice"],
  ["zaakcomponent", "application-component", "Zaakafhandelcomponent"], ["klantcomponent", "application-component", "Klantcontactcomponent"],
  ["archiefcomponent", "application-component", "Archiefcomponent"], ["magazijn", "application-component", "Gegevensmagazijn"],
  ["dossier", "business-object", "Klantdossier"], ["zaak", "business-object", "Zaak"], ["archiefstuk", "business-object", "Archiefstuk"],
  ["basisregistratie", "data-object", "Basisregistratie"],
];
// key → [property, value]: what the steps' property conditions of the GEMMA presets select
const GEMMA_PROPS = {
  model: ["GEMMA type", "Groep"],
  sturing: ["GEMMA type", "Bedrijfsfunctie laag"], uitvoering: ["GEMMA type", "Bedrijfsfunctie laag"], ondersteuning: ["GEMMA type", "Bedrijfsfunctie laag"],
  sociaal: ["GEMMA subtype", "Domein en doelgroep"], fysiek: ["GEMMA subtype", "Domein en doelgroep"], werk: ["GEMMA type", "Beleidsdomein"],
};
// [type, name, source, target]
const GEMMA_RELATIONS = [
  ...["sturing", "uitvoering", "ondersteuning", "sociaal", "fysiek", "werk"].map(k => ["aggregation-relationship", "", "model", k]),
  ["aggregation-relationship", "", "sturing", "strategie"], ["aggregation-relationship", "", "sturing", "verantwoording"],
  ["aggregation-relationship", "", "strategie", "beleid"], ["aggregation-relationship", "", "strategie", "bewaking"],
  ["aggregation-relationship", "", "uitvoering", "dienstverlening"], ["aggregation-relationship", "", "uitvoering", "handhaving"],
  ["aggregation-relationship", "", "uitvoering", "leefomgeving"],                                   // a leaf beside containers, long label
  ["aggregation-relationship", "", "dienstverlening", "ontvangst"], ["aggregation-relationship", "", "dienstverlening", "behandeling"],
  ["aggregation-relationship", "", "behandeling", "beoordeling"], ["aggregation-relationship", "", "behandeling", "besluitvorming"],
  ["aggregation-relationship", "", "handhaving", "toezicht"],
  ["aggregation-relationship", "", "ondersteuning", "infomanagement"], ["aggregation-relationship", "", "ondersteuning", "bedrijfsvoering"],
  ["aggregation-relationship", "", "infomanagement", "gegevens"], ["aggregation-relationship", "", "infomanagement", "archivering"],
  ["aggregation-relationship", "", "infomanagement", "ontvangst"],                                  // a function in two parents
  ["aggregation-relationship", "", "sociaal", "behandeling"], ["aggregation-relationship", "", "sociaal", "toezicht"],
  ["aggregation-relationship", "", "fysiek", "handhaving"],
  ["aggregation-relationship", "", "sociaal", "zaakservice"], ["aggregation-relationship", "", "sociaal", "klantservice"],
  ["aggregation-relationship", "", "fysiek", "zaakservice"], ["aggregation-relationship", "", "fysiek", "gegevensservice"],
  ["serving-relationship", "", "zaakservice", "beoordeling"], ["serving-relationship", "", "zaakservice", "toezicht"],  // a service in two functions
  ["serving-relationship", "", "klantservice", "ontvangst"], ["serving-relationship", "", "archiefservice", "archivering"],
  ["serving-relationship", "", "gegevensservice", "gegevens"], ["serving-relationship", "", "gegevensservice", "besluitvorming"],
  ["serving-relationship", "", "rapportageservice", "bewaking"],
  ["realization-relationship", "", "zaakcomponent", "zaakservice"], ["realization-relationship", "", "klantcomponent", "klantservice"],
  ["realization-relationship", "", "archiefcomponent", "archiefservice"],
  ["realization-relationship", "", "magazijn", "gegevensservice"], ["realization-relationship", "", "magazijn", "rapportageservice"],  // a component in two services
  ["access-relationship", "", "ontvangst", "dossier", "write"], ["access-relationship", "", "behandeling", "dossier", "read"],
  ["access-relationship", "", "behandeling", "zaak", "write"], ["access-relationship", "", "toezicht", "zaak", "read"],
  ["access-relationship", "", "archivering", "archiefstuk", "write"],
  ["flow-relationship", "aanvraag", "ontvangst", "behandeling"],                                    // left out by a relation filter
  ["access-relationship", "", "magazijn", "basisregistratie", "read"],                              // left out by the steps
];
// The background view: the root grouping, its superlayers side by side, each a column of nested functions.
const GEMMA_BACKGROUND = ["model", [
  ["sturing", [["strategie", [["beleid"], ["bewaking"]]], ["verantwoording"]]],
  ["uitvoering", [["dienstverlening", [["ontvangst"], ["behandeling", [["beoordeling"], ["besluitvorming"]]]]],
                  ["handhaving", [["toezicht"]]], ["leefomgeving"]]],
  ["ondersteuning", [["infomanagement", [["gegevens"], ["archivering"]]], ["bedrijfsvoering"]]],
]];

/**
 * @param {string[][]} defs  [key, type, name, domain]
 * @returns {Record<string, ArchiElement>}
 */
function createElements(defs) {
  /** @type {Record<string, ArchiElement>} */
  const out = {};
  for (const [key, type, name, domain] of defs) {
    out[key] = model.createElement(type, name);
    if (domain) out[key].prop(PROP_DOMAIN, domain);
  }
  return out;
}

/**
 * @param {string[][]} defs  [type, name, source key, target key, accessType]
 * @param {Record<string, ArchiElement>} els
 * @returns {ArchiRelation[]}
 */
function createRelations(defs, els) {
  return defs.map(([type, name, s, t, accessType]) => {
    const source = els[s], target = els[t];
    if (!$.model.isAllowedRelationship(type, source.type, target.type))
      throw new Error(`Not allowed in ArchiMate: ${type} from ${source.type} "${source.name}" to ${target.type} "${target.name}"`);
    const rel = model.createRelationship(type, name, source, target);
    if (accessType) rel.accessType = accessType;
    return rel;
  });
}

/**
 * A view with the elements in a grid at view root and every relation drawn.
 * @param {string} name
 * @param {Folder} folder
 * @param {ArchiElement[]} elements
 * @param {ArchiRelation[]} relations
 * @param {number} [columns]
 * @returns {ArchimateView}
 */
function flatView(name, folder, elements, relations, columns = GRID.columns) {
  const view = model.createArchimateView(name, folder);
  /** @type {Record<string, VisualObject>} */
  const visualOf = {};
  elements.forEach((el, i) => {
    const x = GRID.x + (i % columns) * GRID.dx, y = GRID.y + Math.floor(i / columns) * GRID.dy;
    visualOf[el.id] = view.add(el, x, y, GRID.width, GRID.height);
  });
  for (const rel of relations) view.add(rel, visualOf[rel.source.id], visualOf[rel.target.id]);
  console.log(`View "${name}": ${elements.length} elements · ${relations.length} relations`);
  return view;
}

/** @param {Folder} folder */
function buildParts(folder) {
  const els = createElements(PARTS_ELEMENTS);
  return flatView("4 Parts", folder, PARTS_ELEMENTS.map(d => els[d[0]]), createRelations(PARTS_RELATIONS, els), 6);
}

/** @param {Folder} folder */
function buildLarge(folder) {
  const { elements, relations } = largeDefs();
  const els = createElements(elements);
  return flatView("5 Large", folder, elements.map(d => els[d[0]]), createRelations(relations, els), 20);
}

/**
 * Views 6–8: the GEMMA elements and relations, the start views and the background view.
 * @param {Folder} folder
 * @returns {{background: ArchimateView}}
 */
function buildGemma(folder) {
  const els = createElements(GEMMA_ELEMENTS);
  for (const [key, [property, value]] of Object.entries(GEMMA_PROPS)) els[key].prop(property, value);
  const relations = createRelations(GEMMA_RELATIONS, els);
  flatView("6 GEMMA", folder, [els.model], []);
  flatView("7 GEMMA functions", folder, [els.dienstverlening, els.handhaving], []);
  console.log(`GEMMA model: ${GEMMA_ELEMENTS.length} elements · ${relations.length} relations`);
  const background = model.createArchimateView("8 GEMMA background", folder);
  const [rootKey, superlayers] = GEMMA_BACKGROUND;
  const rootSize = _boxSize(GEMMA_BACKGROUND, true);
  const root = background.add(els[rootKey], GRID.x, GRID.y, rootSize.width, rootSize.height);
  let x = BOX.padding;
  /** @type {(parent: VisualObject, child: VisualObject) => void} */
  const link = (parent, child) => {
    const rel = relations.find(r => r.type === "aggregation-relationship" && r.source.id === parent.concept.id && r.target.id === child.concept.id);
    if (rel) background.add(rel, parent, child);
  };
  for (const layer of superlayers) x += _addBox(root, layer, x, BOX.title, els, link).width + BOX.gap;
  return { background };
}

const BOX = { padding: 20, title: 40, gap: 20 };   // the background view's boxes: room around and above the children

/**
 * The size of a box of the background view: a leaf GRID.width × GRID.height; a container its children stacked
 * (side by side for the root) with room around them.
 * @param {any[]} node  [key, children?]
 * @param {boolean} [sideBySide]
 * @returns {{width: number, height: number}}
 */
function _boxSize(node, sideBySide = false) {
  const children = node[1] || [];
  if (!children.length) return { width: GRID.width, height: GRID.height };
  const sizes = children.map(c => _boxSize(c));
  const along = (/** @type {number[]} */ v) => v.reduce((s, n) => s + n, 0) + BOX.gap * (v.length - 1);
  const width = sideBySide ? along(sizes.map(s => s.width)) : Math.max(...sizes.map(s => s.width));
  const height = sideBySide ? Math.max(...sizes.map(s => s.height)) : along(sizes.map(s => s.height));
  return { width: width + 2 * BOX.padding, height: height + BOX.title + BOX.padding };
}

/**
 * A box and its children, stacked, in a parent visual; returns its size.
 * @param {VisualObject} parent
 * @param {any[]} node  [key, children?]
 * @param {number} x
 * @param {number} y
 * @param {Record<string, ArchiElement>} els
 * @param {(parent: VisualObject, child: VisualObject) => void} link  draws the relation of a box to its parent
 */
function _addBox(parent, node, x, y, els, link) {
  const size = _boxSize(node);
  const visual = parent.add(els[node[0]], x, y, size.width, size.height);
  link(parent, visual);
  let childY = BOX.title;
  for (const child of node[1] || []) childY += _addBox(visual, child, BOX.padding, childY, els, link).height + BOX.gap;
  return size;
}

/**
 * View 5's elements and relations from a fixed seed: the same model every time.
 * @returns {{elements: string[][], relations: string[][]}}
 */
function largeDefs() {
  const random = _mulberry32(20261102);
  /** @type {string[][]} */
  const elements = [], relations = [], components = [];
  for (let s = 1; s <= 10; s++) {
    elements.push([`s${s}`, "application-component", `System ${s}`, "Apps"]);
    for (let u = 1; u <= 4; u++) {
      elements.push([`s${s}u${u}`, "application-component", `Subsystem ${s}.${u}`, "Apps"]);
      relations.push(["composition-relationship", "", `s${s}`, `s${s}u${u}`]);
      for (let c = 1; c <= 6; c++) {
        const key = `s${s}u${u}c${c}`;
        elements.push([key, "application-component", `Component ${s}.${u}.${c}`, "Apps"]);
        relations.push(["composition-relationship", "", `s${s}u${u}`, key]);
        components.push(key);
      }
    }
  }
  const pick = () => components[Math.floor(random() * components.length)];
  for (let i = 0; i < 150; i++) {
    const a = pick();
    let b = pick();
    while (b === a) b = pick();
    relations.push(["flow-relationship", i % 10 ? "" : `flow ${i}`, a, b]);
  }
  for (let n = 1; n <= 10; n++) {
    elements.push([`svc${n}`, "application-service", `Service ${n}`, "Apps"]);
    relations.push(["serving-relationship", "", `svc${n}`, pick()]);
  }
  relations.push(["flow-relationship", "loop", "s1u1c1", "s1u1c1"], ["flow-relationship", "", "s2", "s2"]);   // self-loops
  return { elements, relations };
}

/**
 * A small seeded pseudo-random generator (mulberry32): numbers in [0, 1).
 * @param {number} seed
 */
function _mulberry32(seed) {
  let a = seed;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { GRID, createElements, createRelations, flatView, buildParts, buildLarge, largeDefs, buildGemma };
