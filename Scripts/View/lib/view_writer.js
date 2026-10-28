/**
 * View writer for the View subsystem: applies a write plan (write_plan.js) to the target view. The
 * only code that changes what is on a view; it decides nothing, it follows the plan step by step.
 * Archi side: jArchi calls only. A step that fails is logged and the write goes on.
 */
console.log("Loading view_writer.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

/** @type {typeof import("./defs")} */
const Defs = require(REPO_ROOT + "View/lib/defs");
const { PROP_MANAGED_OCCURRENCE } = Defs;

/** Attributes of a visual a copy takes over; for an element visual, name, documentation and properties are its element's and are left alone. */
const VISUAL_ATTRIBUTES = ["text", "labelExpression", "fillColor", "fontColor", "fontName", "fontSize", "fontStyle",
  "lineColor", "lineWidth", "lineStyle", "opacity", "outlineOpacity", "gradient", "figureType", "textAlignment",
  "textPosition", "showIcon", "iconColor", "imageSource", "imagePosition", "deriveLineColor", "borderType"];
/** Attributes of a connection a copy takes over (a relation's name and documentation are the relation's). */
const CONNECTION_ATTRIBUTES = ["labelExpression", "fontColor", "fontName", "fontSize", "fontStyle", "lineColor",
  "lineWidth", "textPosition", "textAlignment", "labelVisible", "style"];
/** Diagram object types createObject makes. */
const CREATE_OBJECT_TYPES = ["diagram-model-note", "diagram-model-group", "diagram-model-legend"];

/**
 * Apply a write plan to the target view, in the plan's order: self-loops removed, nodes written
 * parents first (keep, move, create, copy), managed occurrences removed, connections restyled,
 * created or copied, nestings, lines inside copied diagram-blocks, unrouted connections cleared,
 * managed-occurrence records rewritten.
 * @param {ArchimateView} view
 * @param {WritePlan}     plan
 * @returns {Map<string, VisualObject>}  node id → its visual on the view
 */
function applyWritePlan(view, plan) {
  /** @type {Map<string, VisualObject | VisualConnection>} */
  const onView = new Map();   // what is on the view before the write, by id
  $(view).find().each(o => onView.set(String(o.id), o));
  for (const id of plan.removedSelfLoops) _attempt(`remove self-loop ${id}`, () => _get(onView, id).delete());

  const written = _writeNodes(view, plan.nodes, onView);
  let removed = 0;
  // Removed after the nodes are written, so a child moved elsewhere is out first; Archi removes their connections with them.
  for (const id of plan.removedVisuals) if (_attempt(`remove managed occurrence ${id}`, () => _get(onView, id).delete())) removed++;

  /** @type {(ref: VisualRef) => VisualObject | VisualConnection | undefined} */
  const end = ref => ("node" in ref ? written.get(ref.node) : onView.get(ref.visual));
  _writeConnections(view, plan, onView, end);
  _writeNestings(view, plan, onView, end);
  for (const line of plan.copiedLines) {
    const copy = _copyConnection(view, line, end);
    if (copy) _attempt(`copy the bendpoints of ${line.source.id}`, () => line.source.relativeBendpoints.forEach((bp, i) => copy.addRelativeBendpoint(bp, i)));
  }
  for (const id of plan.clearedConnections) {
    _attempt(`clear the bendpoints of ${id}`, () => /** @type {VisualConnection} */ (_get(onView, id)).deleteAllBendpoints());   // Cast: a connection id
  }

  _attempt("write the managed-occurrence records", () => {
    view.removeProp(PROP_MANAGED_OCCURRENCE);
    for (const r of plan.records) view.prop(PROP_MANAGED_OCCURRENCE, r, true);
  });
  const kept = plan.nodes.filter(w => "visual" in w && written.has(w.node)).length;
  const copied = plan.nodes.filter(w => "source" in w && written.has(w.node)).length;
  const atRoot = plan.userAtRoot ? ` · ${plan.userAtRoot} user content the settings place nowhere, at view root` : "";
  const copiedNote = copied ? ` · ${copied} copied from the view read` : "";
  console.log(`  Occurrences: ${kept} kept · ${written.size - kept - copied} created${copiedNote} · ${removed} managed removed · ${plan.records.length} managed on view${atRoot}`);
  _logObjectsOnView(view, plan.connections.length);
  console.log(`View "${view.name}" written`);
  return written;
}

/**
 * Write the nodes, parents first: an existing visual is moved when its container changes and gets
 * its new bounds; a new one is added to its container. A node whose container was not written is
 * left out.
 * @param {ArchimateView}                                   view
 * @param {NodeWrite[]}                                     nodes
 * @param {Map<string, VisualObject | VisualConnection>}    onView
 * @returns {Map<string, VisualObject>}  node id → its visual
 */
function _writeNodes(view, nodes, onView) {
  _logNodes(nodes);
  /** @type {Map<string, VisualObject>} */
  const written = new Map();
  for (const w of nodes) {
    const container = w.parent ? written.get(w.parent) : view;
    if (!container) { console.error(`Not written: ${w.node}, its container ${w.parent} was not written`); continue; }
    const b = w.bounds;
    if ("visual" in w) {
      const visual = /** @type {VisualObject} */ (_get(onView, w.visual));   // Cast: a kept node's visual is an object
      _attempt(`${w.move ? "re-parent" : "reposition"} ${w.node}`, () => {
        if (w.move) container.add(visual, b.x, b.y);   // jArchi 1.10 move: keeps the visual, its appearance and connections
        visual.bounds = b;
        written.set(w.node, visual);
      });
    } else if ("source" in w) {
      const copy = _copyVisual(container, w.source, b);
      if (copy) written.set(w.node, copy);
    } else {
      _attempt(`add element ${w.node}`, () => written.set(w.node, container.add(w.element, b.x, b.y, b.width, b.height)));
    }
  }
  return written;
}

/**
 * A copy of a visual of the view read, in its container: an element visual, note, group, legend or
 * view reference, with the attributes that differ from a fresh one. An image cannot be created with
 * jArchi and is left out.
 * @param {ArchimateView | VisualObject} container
 * @param {VisualObject}                 source
 * @param {Bounds}                       b
 * @returns {VisualObject | null}
 */
function _copyVisual(container, source, b) {
  const type = source.type;
  /** @type {VisualObject | null} */
  let copy = null;
  _attempt(`copy ${type} ${source.id}`, () => {
    if (source.concept) copy = container.add(source.concept, b.x, b.y, b.width, b.height);
    else if (CREATE_OBJECT_TYPES.includes(type)) copy = container.createObject(type, b.x, b.y, b.width, b.height);
    else if (type === "diagram-model-reference" || type === "archimate-diagram-model") copy = container.createViewReference(source.refView, b.x, b.y, b.width, b.height);
    else console.log(`  Not copied: ${type} "${source.name || source.id}" (jArchi cannot create it)`);
  });
  if (!copy) return null;
  const made = /** @type {VisualObject} */ (copy);   // Cast: tsc does not follow the assignment inside the step
  _copyAttributes(source, made, VISUAL_ATTRIBUTES, !source.concept);
  if (type === "diagram-model-legend") _attempt(`copy the legend options of ${source.id}`, () => { made.options = source.options; });
  if (!source.concept) _attempt(`copy the image of ${source.id}`, () => { const image = $(source).attr("image"); if (image) $(made).attr("image", image); });
  return made;
}

/**
 * A copy of a connection of the view read between two written visuals: a relation's connection, or a
 * diagram connection (a note's line), with the attributes that differ from a fresh one.
 * @param {ArchimateView}                                                view
 * @param {CopiedConnection}                                             c
 * @param {(ref: VisualRef) => VisualObject | VisualConnection | undefined} end
 * @returns {VisualConnection | null}
 */
function _copyConnection(view, c, end) {
  const from = end(c.from), to = end(c.to);
  if (!from || !to) return null;
  const relation = c.source.concept;
  /** @type {VisualConnection | null} */
  let copy = null;
  _attempt(`copy connection ${c.source.id}`, () => { copy = relation ? view.add(relation, from, to) : view.createConnection(from, to); });
  if (!copy) return null;
  const made = /** @type {VisualConnection} */ (copy);   // Cast: tsc does not follow the assignment inside the step
  _copyAttributes(c.source, made, CONNECTION_ATTRIBUTES, !relation);
  return made;
}

/**
 * Copy the attributes whose value differs from the copy's, so a default stays a default; a diagram
 * object also takes its name, documentation and properties.
 * @param {DiagramComponent} source
 * @param {DiagramComponent} copy
 * @param {string[]}         attributes
 * @param {boolean}          own  the visual is a diagram object: name, documentation and properties are its own
 */
function _copyAttributes(source, copy, attributes, own) {
  // Casts: the attributes are read and set by name; a type without one reads undefined.
  const from = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (source));
  const to   = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (copy));
  for (const a of [...(own ? ["name", "documentation"] : []), ...attributes]) {
    if (from[a] === undefined || from[a] === to[a]) continue;
    _attempt(`copy ${a} of ${source.id}`, () => { to[a] = from[a]; });
  }
  if (!own) return;
  _attempt(`copy the properties of ${source.id}`, () => {
    for (const key of source.prop()) for (const value of source.prop(key, true) || []) copy.prop(key, value, true);
  });
}

/**
 * Laid-out connections: one on the view restyled, a missing one created and styled.
 * @param {ArchimateView}                                                view
 * @param {WritePlan}                                                    plan
 * @param {Map<string, VisualObject | VisualConnection>}                 onView
 * @param {(ref: VisualRef) => VisualObject | VisualConnection | undefined} end
 */
function _writeConnections(view, plan, onView, end) {
  console.log(`  Writing ${plan.connections.length} connections · ${plan.nestings.length + plan.keptNestings} nestings...`);
  for (const c of plan.connections) {
    const connection = "id" in c ? /** @type {VisualConnection} */ (_get(onView, c.id))   // Cast: a connection id
      : "from" in c ? _copyConnection(view, c, end) : _addConnection(view, c, end);
    if (connection) _style(connection, c.style);
  }
}

/**
 * Nesting connections: the missing ones created; other lines of nested relations removed.
 * @param {ArchimateView}                                                view
 * @param {WritePlan}                                                    plan
 * @param {Map<string, VisualObject | VisualConnection>}                 onView
 * @param {(ref: VisualRef) => VisualObject | VisualConnection | undefined} end
 */
function _writeNestings(view, plan, onView, end) {
  let created = 0, removed = 0;
  for (const n of plan.nestings) if (_addConnection(view, n, end)) created++;
  for (const id of plan.removedLines) if (_attempt(`remove line of nested relation ${id}`, () => _get(onView, id).delete())) removed++;
  const linesNote = removed ? ` · ${removed} line${removed !== 1 ? "s" : ""} of nested relations removed` : "";
  console.log(`  Nestings: ${created} created · ${plan.keptNestings} existing${linesNote}`);
}

/**
 * Draw a relation between two written visuals.
 * @param {ArchimateView}                                                view
 * @param {NewConnection}                                                c
 * @param {(ref: VisualRef) => VisualObject | VisualConnection | undefined} end
 * @returns {VisualConnection | null}
 */
function _addConnection(view, c, end) {
  const source = end(c.source), target = end(c.target);
  if (!source || !target) return null;
  try { return view.add(c.relation, source, target); }
  catch (e) { console.error(`Failed to add relation ${c.relation.id}: ${e}`); return null; }
}

/**
 * Set the label position and replace the bendpoints. Colour and line width are untouched.
 * @param {VisualConnection} connection
 * @param {ConnectionStyle}  style
 */
function _style(connection, style) {
  if (style.textPosition !== null) _attempt(`set the label position of ${connection.id}`, () => { connection.textPosition = /** @type {number} */ (style.textPosition); });
  _attempt(`clear the bendpoints of ${connection.id}`, () => connection.deleteAllBendpoints());
  _attempt(`add the bendpoints of ${connection.id}`, () => style.bendpoints.forEach((bp, i) => connection.addRelativeBendpoint(bp, i)));
}

/**
 * @param {NodeWrite[]} nodes
 */
function _logNodes(nodes) {
  const containers = new Set(nodes.map(w => w.parent).filter(Boolean));
  const extra = nodes.filter(w => w.node.includes("_occ_"));
  let line = `  Writing ${nodes.length} nodes`;
  if (extra.length > 0) {
    const xContainers = extra.filter(w => containers.has(w.node)).length;
    const xElements   = extra.length - xContainers;
    /** @type {string[]} */
    const parts = [];
    if (xContainers > 0) parts.push(`${xContainers} container${xContainers !== 1 ? "s" : ""}`);
    if (xElements   > 0) parts.push(`${xElements} element${xElements !== 1 ? "s" : ""}`);
    line += ` (${extra.length} extra multiple occurrence${extra.length !== 1 ? "s" : ""}: ${parts.join(" · ")})`;
  }
  console.log(line + "...");
}

/**
 * Count the objects on the written view. find("relation") gives connections + nestings; a mismatch
 * with the pipeline's "Total to view" usually means nesting candidates were dropped by Archi's
 * one-parent-per-child rule (see "Nestings applied").
 * @param {ArchimateView} view
 * @param {number}        connections  laid-out connections written
 */
function _logObjectsOnView(view, connections) {
  let elements = 0, relations = 0, diagramObjects = 0;
  $(view).find("element").each(() => elements++);
  $(view).find("relation").each(() => relations++);
  // A type a view cannot hold finds nothing or throws: a silent catch (ARCHITECTURE § Errors).
  Object.keys(Defs.DIAGRAM_TYPES).forEach(dt => { try { $(view).find(dt).each(() => diagramObjects++); } catch (e) {} });
  console.log(`  Objects on view: ${elements} elements · ${connections} connections · ${relations - connections} nestings · ${diagramObjects} diagram objects`);
}

/**
 * The object with this id on the view before the write; a plan names only those.
 * @param {Map<string, VisualObject | VisualConnection>} onView
 * @param {string} id
 */
function _get(onView, id) {
  return /** @type {VisualObject | VisualConnection} */ (onView.get(id));   // Cast: the plan was made from this view
}

/**
 * Run one write step; a failure is logged with what failed and the write goes on.
 * @param {string}     what
 * @param {() => void} step
 * @returns {boolean}  the step succeeded
 */
function _attempt(what, step) {
  try { step(); return true; }
  catch (e) { console.error(`Failed to ${what}: ${e}`); return false; }
}

module.exports = { applyWritePlan };
