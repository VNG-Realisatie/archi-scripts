/**
 * Archi's command line (tools/archi_cli.sh) prints console.error like console.log: in a run there, mark each
 * error line "ERROR: " for tools/console_checks.js. The console's own methods cannot be replaced, so the
 * whole object is, for every module. Nothing changes in Archi's window.
 */
function markErrorsOnCommandLine() {
  if (Java.type("org.eclipse.ui.PlatformUI").isWorkbenchRunning()) return;
  const jArchiConsole = console;
  globalThis.console = /** @type {any} */ ({
    log:   (/** @type {any} */ message) => jArchiConsole.log(message),
    error: (/** @type {any} */ message) => jArchiConsole.log(`ERROR: ${message}`),
    show:  () => jArchiConsole.show(),
    clear: () => jArchiConsole.clear(),
  });
}

module.exports = { markErrorsOnCommandLine };
