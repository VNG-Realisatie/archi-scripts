#!/usr/bin/env node
/**
 * Node layout, the process side (lib/node_layout.js starts it): reads { engine, config, graph } as JSON
 * from stdin, runs the adapter's layout, writes { lines, ms, result } or { lines, ms, error } as JSON
 * to stdout. `lines` are the adapter's console lines in order; the caller replays them. Exit code 0
 * for both: a non-zero exit means this process itself failed (stderr says why).
 *
 * The layout runs in a worker thread, so this thread stays free to watch the caller: Archi stops the
 * process when its time limit passes, but a process whose Archi is gone (closed, killed) would go on
 * computing; it stops itself once its parent process is gone.
 */
const fs   = require("fs");
const path = require("path");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");

// How often the caller is checked (ms).
const PARENT_CHECK_MS = 1000;

if (isMainThread) _watch();
else _runLayout(workerData);

/** Start the layout in a worker; write its output, or stop when the caller is gone. */
function _watch() {
  const input = JSON.parse(fs.readFileSync(0, "utf8"));
  const parent = process.ppid;
  const worker = new Worker(__filename, { workerData: input });
  const timer = setInterval(() => { if (!_alive(parent)) process.exit(2); }, PARENT_CHECK_MS);
  worker.on("message", output => {
    clearInterval(timer);
    process.stdout.write(JSON.stringify(output), () => process.exit(0));   // exit once written: a pipe takes 64 KB at a time
  });
  worker.on("error", e => {
    clearInterval(timer);
    process.stderr.write(String(e && e.stack || e));
    process.exit(1);
  });
}

/**
 * The caller still runs: reparenting changes ppid (POSIX); signal 0 tests the pid (Windows keeps ppid).
 * @param {number} pid
 */
function _alive(pid) {
  if (process.ppid !== pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (e) { return e.code === "EPERM"; }
}

/**
 * The worker: load the adapter, run its layout, post the output.
 * @param {{ engine: string, config: ViewConfig, graph: LayoutGraph }} input
 */
function _runLayout(input) {
  global.__DIR__ = path.join(__dirname, "..", "lib") + "/";
  // The vendored elkjs reads its worker through Java I/O (node_modules/elkjs/index.js).
  global.Java = {
    type: n => n.endsWith("Files") ? { readString: p => fs.readFileSync(String(p), "utf8") } : { get: p => p },
  };
  console.log = () => {};   // the modules' "Loading …" lines: Archi loads and logs the adapter itself
  const ViewConfig = require("../lib/view_config");
  // dot from the configured path, as in Archi
  const runProcess = ViewConfig.programRunner(require("./process_runner_node").runProcess, input.config);
  const adapter = require("../lib/engines/registry").adapterOf(input.engine);

  /** @type {{ text: string, error: boolean }[]} */
  const lines = [];
  console.log   = (...a) => lines.push({ text: a.join(" "), error: false });
  console.error = (...a) => lines.push({ text: a.join(" "), error: true });

  const t0 = Date.now();
  let output;
  try {
    output = { lines, result: adapter.layout(input.graph, runProcess) };
  } catch (e) {
    output = { lines, error: e instanceof Error ? e.message : String(e) };
  }
  output.ms = Date.now() - t0;
  parentPort.postMessage(output);
}
