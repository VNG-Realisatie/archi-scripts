/**
 * Process runner for Archi: Java ProcessBuilder. The Node counterpart is tools/process_runner_node.js;
 * both keep to the ProcessRunner contract (types/layout.d.ts): input and output through temp files,
 * a time limit, the files deleted again.
 */
console.log("Loading process_runner.js");

/** @type {ProcessRunner} */
function runProcess(command, args, input, timeoutSeconds) {
  const ProcessBuilder   = Java.type("java.lang.ProcessBuilder");
  const Arrays           = Java.type("java.util.Arrays");
  const Files            = Java.type("java.nio.file.Files");
  const StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
  const TimeUnit         = Java.type("java.util.concurrent.TimeUnit");

  // Input and both outputs go through files: no pipe can block, so the timed wait is the only wait.
  const inFile  = Files.createTempFile("process", ".in");
  const outFile = Files.createTempFile("process", ".out");
  const errFile = Files.createTempFile("process", ".err");
  try {
    Files.writeString(inFile, input, StandardCharsets.UTF_8);
    const pb = new ProcessBuilder(Arrays.asList(command, ...args));
    pb.redirectInput(inFile.toFile());
    pb.redirectOutput(outFile.toFile());
    pb.redirectError(errFile.toFile());
    let proc;
    try { proc = pb.start(); }
    catch (e) { return { state: "not-found", exitCode: -1, stdout: "", stderr: "" }; }

    if (!proc.waitFor(timeoutSeconds, TimeUnit.SECONDS)) {
      proc.destroyForcibly().waitFor(5, TimeUnit.SECONDS);   // let go of the files before they are deleted
      return { state: "timeout", exitCode: -1, stdout: "", stderr: "" };
    }
    return {
      state: "finished",
      exitCode: proc.exitValue(),
      stdout: String(Files.readString(outFile, StandardCharsets.UTF_8)),
      stderr: String(Files.readString(errFile, StandardCharsets.UTF_8)),
    };
  } finally {
    Files.deleteIfExists(inFile);
    Files.deleteIfExists(outFile);
    Files.deleteIfExists(errFile);
  }
}

module.exports = { runProcess };
