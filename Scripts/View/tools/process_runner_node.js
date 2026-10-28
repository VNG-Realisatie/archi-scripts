/**
 * Process runner for Node: child_process. The Archi counterpart is lib/process_runner.js; both keep to
 * the ProcessRunner contract (types/layout.d.ts): input and output through temp files, a time limit,
 * the files deleted again.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

/** @type {ProcessRunner} */
function runProcess(command, args, input, timeoutSeconds) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "process-"));
  const inFile = path.join(dir, "in"), outFile = path.join(dir, "out"), errFile = path.join(dir, "err");
  try {
    fs.writeFileSync(inFile, input, "utf8");
    const fds = [fs.openSync(inFile, "r"), fs.openSync(outFile, "w"), fs.openSync(errFile, "w")];
    let run;
    try { run = spawnSync(command, args, { stdio: fds, timeout: timeoutSeconds * 1000, killSignal: "SIGKILL" }); }
    finally { fds.forEach(fd => fs.closeSync(fd)); }
    const code = run.error && /** @type {NodeJS.ErrnoException} */ (run.error).code;
    if (code === "ENOENT") return { state: "not-found", exitCode: -1, stdout: "", stderr: "" };
    if (code === "ETIMEDOUT") return { state: "timeout", exitCode: -1, stdout: "", stderr: "" };
    if (run.error) throw run.error;
    return {
      state: "finished",
      exitCode: run.status === null ? -1 : run.status,
      stdout: fs.readFileSync(outFile, "utf8"),
      stderr: fs.readFileSync(errFile, "utf8"),
    };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { runProcess };
