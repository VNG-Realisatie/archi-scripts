/**
 * Node layout: the engine call of plan() runs in a Node process (tools/node_layout_run.js) instead of
 * in the script's own JavaScript engine. GraalJS in jArchi runs without runtime compilation, so the
 * adapters' work takes about 40× as long there as in Node (ARCHITECTURE § Performance). The layout
 * graph goes to the process as JSON on stdin; the result and the adapter's console lines come back
 * on stdout. Without Node the adapter runs in the script itself, as before. Where `node` is: the
 * View configuration (Scripts/View/config.default.js, config.js), through the runtime's runner.
 */
console.log("Loading node_layout.js");

const REPO_ROOT = (() => {
  const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/");
  return p.substring(0, i === -1 ? p.length : i + 9);
})();

const NODE_BIN = "node";
const NODE_LAYOUT_SCRIPT = REPO_ROOT + "View/tools/node_layout_run.js";
// Seconds one layout may take: Archi waits on its UI thread. Graphviz keeps its own limit inside the process.
const NODE_LAYOUT_TIMEOUT_S = 120;
// The layout graph fields an adapter reads; the other fields are the pipeline's own (write plan, logging).
const ADAPTER_FIELDS = /** @type {const} */ ([
  "algorithm", "nodes", "edges", "options", "engineParams", "alignWidthSameType", "columnsAcrossContainers", "sort", "_parentMap",
]);

/**
 * @typedef {{ text: string, error: boolean }} NodeLayoutLine  one console line of the adapter, in order
 * @typedef {{ lines: NodeLayoutLine[], ms: number, result?: LayoutResult, error?: string }} NodeLayoutOutput
 */

/**
 * Lay out the graph in Node; without Node, with the adapter in the script itself.
 * @param {LayoutGraph}   graph
 * @param {string}        engineModule  the adapter's module, relative to Scripts/ (e.g. "View/lib/engines/elk")
 * @param {LayoutAdapter} adapter       the same module, loaded: runs the layout when Node is not used
 * @param {LayoutRuntime} runtime
 * @returns {LayoutResult}
 */
function layout(graph, engineModule, adapter, runtime) {
  const { runProcess, config } = runtime;
  if (runtime.inProcess) return adapter.layout(graph, runProcess);
  const t0 = Date.now();
  const input = JSON.stringify({ engineModule, config, graph: _adapterInput(graph) });
  const out = runProcess(NODE_BIN, [NODE_LAYOUT_SCRIPT], input, NODE_LAYOUT_TIMEOUT_S);   // a configured path not found throws
  if (out.state === "not-found") {
    console.log(`  Layout in Archi: '${NODE_BIN}' not found on the PATH — install Node.js (nodejs.org) for a faster layout, or set nodePath in Scripts/View/config.js`);
    return adapter.layout(graph, runProcess);
  }
  if (out.state === "timeout") {
    throw new Error(`The layout did not finish within ${NODE_LAYOUT_TIMEOUT_S} s and was stopped.\nTry another algorithm or a smaller selection.`);
  }
  if (out.exitCode !== 0) throw new Error(`Node layout exited with code ${out.exitCode}.\n${out.stderr.trim()}`);
  const output = /** @type {NodeLayoutOutput} */ (JSON.parse(out.stdout));   // Cast: written by node_layout_run.js
  for (const line of output.lines) {
    if (line.error) console.error(line.text);
    else console.log(line.text);
  }
  if (output.error !== undefined) throw new Error(output.error);
  console.log(`  Layout in Node: ${output.ms} ms layout · ${Date.now() - t0 - output.ms} ms process`);
  return /** @type {LayoutResult} */ (output.result);   // Cast: set whenever error is not
}

/**
 * The fields of the layout graph an adapter reads.
 * @param {LayoutGraph} graph
 * @returns {Pick<LayoutGraph, typeof ADAPTER_FIELDS[number]>}
 */
function _adapterInput(graph) {
  /** @type {Record<string, unknown>} */
  const input = {};
  for (const field of ADAPTER_FIELDS) input[field] = graph[field];
  return /** @type {Pick<LayoutGraph, typeof ADAPTER_FIELDS[number]>} */ (input);   // Cast: filled from ADAPTER_FIELDS
}

module.exports = { layout };
