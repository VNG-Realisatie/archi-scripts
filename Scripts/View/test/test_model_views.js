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

module.exports = { GRID, createElements, createRelations, flatView, buildParts, buildLarge, largeDefs };
