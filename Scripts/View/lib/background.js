/**
 * Background view: the selection fills a background that is always on the view.
 *   1. Every element of the background view is on the view, with the nesting it shows: an element
 *      in the box of its parent, through a nesting relation between them in the model. Another
 *      relation between two of its elements comes only when the selection follows it.
 *   2. The selection (start and steps) fills it, with the relations it followed.
 *   3. An element of the selection that does not hang under the background through those relations
 *      brings its nesting parents from the model, up to an element of the background (the path):
 *      parents only, never their other children.
 *   4. An element that reaches the background by no path is left out.
 * Only these relations are drawn: an element the selection put under one of its own elements does
 * not also go under another background element the model nests it in. "Hangs under" follows the
 * nesting conditions: the parent is the source, or the target of a reversed relation (nesting.js).
 *
 * Pure: Node loads it (tools/background_test.js).
 */

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();
/** @type {typeof import("../../_lib/log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading background.js");

/** @type {typeof import("./nesting")} */
const Nesting = require(REPO_ROOT + "View/lib/nesting");
/** @type {typeof import("./table")} */
const Table = require(REPO_ROOT + "View/lib/table");

/**
 * @typedef {{ elements: ArchiElement[], relations: ArchiRelation[], parents: ArchiElement[], dropped: ArchiElement[] }} BackgroundComposed
 *   elements: on the view, the selection first; parents: what rule 3 brought up; dropped: left out by rule 4
 */

/**
 * The elements and relations on the view with a background view.
 * @param {ArchiElement[]}  selected    the selection after filter and steps, in the order it joined
 * @param {ArchiRelation[]} relations   the relations the selection collected
 * @param {Pick<BackgroundSnapshot, "elements" | "tables">} backgroundView  its elements, and its boxes' tables (which box holds which)
 * @param {RelationIndex}   relationsOf
 * @param {EffectiveParams} params      nesting and reverse conditions
 * @returns {BackgroundComposed}
 */
function compose(selected, relations, backgroundView, relationsOf, params) {
  const background = backgroundView.elements;
  const onBackground = new Set(background.map(e => e.id));
  /** @param {ArchiElement} e @returns {ArchiRelation[]} its nesting relations to a parent element, in the model */
  const upward = e => relationsOf(e).filter(r => Nesting.isNesting(r, params) && _child(r, params).id === e.id && _isElement(_parent(r, params)));

  const selectedIds = new Set(selected.map(e => e.id));
  const all = [...selected, ...background.filter(e => !selectedIds.has(e.id))];
  /** @type {ArchiRelation[]} */
  const drawn = [];
  const seen = new Set();
  const draw = (/** @type {ArchiRelation} */ r) => { if (!seen.has(r.id)) { seen.add(r.id); drawn.push(r); } };
  relations.forEach(draw);
  const shown = _shownNesting(backgroundView.tables);
  for (const e of background) for (const r of upward(e)) if (shown.has(`${_parent(r, params).id}>${e.id}`)) draw(r);

  /** @type {ArchiElement[]} */
  const parents = [];
  const known = new Set(all.map(e => e.id));
  const reaches = _reachesBackground(onBackground, upward, params);
  let attached = _attached(all, drawn, onBackground, params);
  // In the order the selection joined: an element under an earlier one attaches with it and climbs not itself.
  for (const e of selected) {
    if (attached.has(e.id) || !reaches(e)) continue;
    _collectPath(e, reaches, upward, params, known, parents, draw);
    attached = _attached([...all, ...parents], drawn, onBackground, params);
  }

  const dropped = selected.filter(e => !attached.has(e.id));
  const kept = [...all, ...parents].filter(e => attached.has(e.id));
  const ids = new Set(kept.map(e => e.id));
  return { elements: kept, relations: drawn.filter(r => ids.has(r.source.id) && ids.has(r.target.id)), parents, dropped };
}

/**
 * The elements of the list that hang under the background through the drawn nesting relations.
 * @param {ArchiElement[]}  list
 * @param {ArchiRelation[]} drawn
 * @param {Set<string>}     onBackground
 * @param {EffectiveParams} params
 * @returns {Set<string>}
 */
function _attached(list, drawn, onBackground, params) {
  const inList = new Set(list.map(e => e.id));
  /** @type {Map<string, string[]>} */
  const children = new Map();
  for (const r of drawn) {
    if (!Nesting.isNesting(r, params)) continue;
    const p = _parent(r, params).id, c = _child(r, params).id;
    if (!inList.has(p) || !inList.has(c)) continue;
    const list = children.get(p);
    if (list) list.push(c); else children.set(p, [c]);
  }
  const attached = new Set(list.filter(e => onBackground.has(e.id)).map(e => e.id));
  const queue = [...attached];
  while (queue.length) {
    for (const c of children.get(/** @type {string} */ (queue.shift())) || []) if (!attached.has(c)) { attached.add(c); queue.push(c); }
  }
  return attached;
}

/**
 * Whether an element reaches the background through its nesting parents (any parents, in the model).
 * A cycle of parents reaches nothing through itself.
 * @param {Set<string>}                          onBackground
 * @param {(e: ArchiElement) => ArchiRelation[]} upward
 * @param {EffectiveParams}                      params
 * @returns {(e: ArchiElement) => boolean}
 */
function _reachesBackground(onBackground, upward, params) {
  /** @type {Map<string, boolean>} */
  const memo = new Map();
  /** @type {Set<string>} */
  const visiting = new Set();
  /** @param {ArchiElement} e @returns {boolean} */
  const reaches = e => {
    if (onBackground.has(e.id)) return true;
    const known = memo.get(e.id);
    if (known !== undefined) return known;
    if (visiting.has(e.id)) return false;
    visiting.add(e.id);
    let found = false;
    for (const r of upward(e)) if (reaches(/** @type {ArchiElement} */ (_parent(r, params)))) found = true;   // Cast: upward keeps element parents
    visiting.delete(e.id);
    memo.set(e.id, found);
    return found;
  };
  return reaches;
}

/**
 * Draw the nesting relations from an element to its parents that reach the background, and add
 * those parents and theirs, up to the background.
 * @param {ArchiElement}                         e
 * @param {(e: ArchiElement) => boolean}         reaches
 * @param {(e: ArchiElement) => ArchiRelation[]} upward
 * @param {EffectiveParams}                      params
 * @param {Set<string>}                          known    ids on the view so far; extended
 * @param {ArchiElement[]}                       parents  extended with the parents added
 * @param {(r: ArchiRelation) => void}           draw
 */
function _collectPath(e, reaches, upward, params, known, parents, draw) {
  for (const r of upward(e)) {
    const parent = /** @type {ArchiElement} */ (_parent(r, params));   // Cast: upward keeps element parents
    if (!reaches(parent)) continue;
    draw(r);
    if (known.has(parent.id)) continue;
    known.add(parent.id);
    parents.push(parent);
    _collectPath(parent, reaches, upward, params, known, parents, draw);
  }
}

/**
 * The nesting the background view shows: "parent>child" for every box in the box of another.
 * @param {Tables} tables
 * @returns {Set<string>}
 */
function _shownNesting(tables) {
  /** @type {Set<string>} */
  const out = new Set();
  for (const [parent, a] of Object.entries(tables)) {
    if (parent !== Table.ROOT) for (const child of Table.idsOf(a)) out.add(`${parent}>${child}`);
  }
  return out;
}

/** @param {ArchiRelation} r @param {EffectiveParams} params */
function _parent(r, params) {
  return Nesting.isReversed(r, params) ? r.target : r.source;
}

/** @param {ArchiRelation} r @param {EffectiveParams} params */
function _child(r, params) {
  return Nesting.isReversed(r, params) ? r.source : r.target;
}

/** @param {ArchiConcept} o  a relation's end: an element, or a relation (a relation on a relation) */
function _isElement(o) {
  return !!o && !String(o.type).endsWith("-relationship");
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { compose };
}
