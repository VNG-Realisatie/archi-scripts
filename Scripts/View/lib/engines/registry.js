/**
 * Engine-adapter registry (SPEC § 3): the adapter module of each engine id that defs.ALGORITHMS
 * names. The API finds the adapter for an algorithm here, and the Node layout process loads the same
 * module. Adding an engine is one entry here plus its algorithm entries in defs.js
 * (tools/check_registry.js checks that every algorithm's engine is registered).
 */
console.log("Loading engines/registry.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

// Adapter module per engine id, relative to Scripts/. Loaded on first use (require memoises).
/** @type {Readonly<Record<string, string>>} */
const ADAPTER_MODULES = Object.freeze({
  ELK:      "View/lib/engines/elk",
  Dagre:    "View/lib/engines/dagre",
  Graphviz: "View/lib/engines/graphviz",
  Tiles:    "View/lib/engines/tiles",
});

/** The registered engine ids. */
const ENGINES = Object.freeze(Object.keys(ADAPTER_MODULES));

/**
 * The adapter of an engine.
 * @param {string} engine  engine id (defs.ALGORITHMS[…].engine)
 * @returns {LayoutAdapter}
 */
function adapterOf(engine) {
  if (!(engine in ADAPTER_MODULES)) throw new Error(`No adapter registered for engine "${engine}" (engines/registry.js).`);
  return require(REPO_ROOT + ADAPTER_MODULES[engine]);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ENGINES, adapterOf };
}
