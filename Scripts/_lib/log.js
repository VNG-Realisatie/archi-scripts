/**
 * log.js — the one place for logging in the scripts.
 *
 * The console is for the user: what a run does, its result, and what needs attention (INFO, WARN,
 * ERROR). The log file is for troubleshooting: everything, DEBUG included, one file per run in
 * <Archi workspace>/logs/archi-scripts/, named <yyyyMMdd-HHmmss>-<name>.log; the newest LOG_KEEP stay.
 *
 * A script starts and finishes a run:
 *   const Log = require(REPO_ROOT + "_lib/log");
 *   Log.start(__FILE__, true);   // shows (and clears) the console, prints Script and Platform, then an empty line
 *   …
 *   Log.finish();                // prints Duration and Log file, closes the file
 *
 * Lines before start() (the "Loading …" lines of required modules) and before the file is named are
 * kept and written when the file is made: at name(), or at finish() with the script's name. A line of
 * "=" marks the start and the end of a run on the console; the end gives the log file's full path on a
 * line of its own, to copy. An empty line follows the header; an empty line right after another is
 * left out, so a script can start its own block with one.
 * A run can consist of items (a script's units of work, e.g. the views of a View run): inside an item
 * (beginItem … endItem) the console lines are held and printed under the item's status line, and the
 * run counts its items as done, skipped or failed (summary()). The core is pure: in Node (harness, layout process) every line goes to the console,
 * or to a sink a caller sets.
 *
 * (c) 2026 Mark Backer
 */

/** @typedef {"DEBUG" | "INFO" | "WARN" | "ERROR"} Level */
/** @typedef {"done" | "skipped" | "failed"} ItemStatus */
/** @typedef {{ effect?: string, action?: string }} Advice  what it means for the result, and what the user can do */
/** @typedef {{ status: ItemStatus, headline: string, reason: string }} ItemProblem  an item skipped or failed, and the first reason given */
/** @typedef {{ done: number, withWarnings: number, skipped: number, failed: number, ms: number, problems: ItemProblem[] }} RunSummary */
/** @typedef {(level: Level, text: string) => void} Sink */

// ── Settings ──────────────────────────────────────────────────────────────────

const CONSOLE_WIDTH = 80;        // console lines wrap at this width; a word (a path) is never broken
const VALUE_COLUMN  = 17;        // where the value of a "Label: value" line starts (field())
const DETAIL_COLUMN = 15;        // the same within an item's details, under its status line
const LOG_KEEP      = 20;        // log files kept, newest first
const LOG_MAX_MB    = 10;        // above this a log file takes only WARN and ERROR
const LOG_FOLDER    = "logs/archi-scripts";   // under Archi's workspace folder (~/.archi on Linux)
const PENDING_MAX   = 10000;     // lines kept while no file is open (a script without start())
const RULE          = "=".repeat(CONSOLE_WIDTH);   // marks the start and the end of a run
// The oldest jArchi the scripts run on (1.11: fillColor reads the effective color; 1.10 the move API,
// 1.6 CommonJS). The CommonJS check at the top of every .ajs names it too: it runs before any module.
const MIN_JARCHI    = "1.11";

/** @type {Record<Level, string>} */
const ICON = { DEBUG: "", INFO: "", WARN: "⚠", ERROR: "✗" };

// ── State of the run ──────────────────────────────────────────────────────────

/** @type {Sink | null} */
let _sink = null;                 // set by a caller in Node (layout process); none = the default
let _started = false;
let _t0 = Date.now();
let _timed = _t0;                 // where the duration counts from: the start, or restartDuration()
let _script = "";
/** @type {string[]} */
let _pending = [];                // file lines while no file is open
/** @type {any} */
let _writer = null;               // java.io.Writer
let _path = "";
let _bytes = 0;
let _full = false;
let _fileFailed = false;
let _context = "run";
let _blank = false;               // the last console line was empty: an empty line after it is left out
/** @type {string[] | null} */
let _held = null;                 // console blocks of the current item
let _itemWarnings = 0;
let _itemIndex = 0;
let _itemName = "";
let _itemReason = "";             // the first WARN or ERROR of the current item, its first line
/** @type {Set<string>} */
let _warned = new Set();          // WARN texts of this item (or of the run outside items): each on the console once
/** @type {RunSummary} */
let _counts = { done: 0, withWarnings: 0, skipped: 0, failed: 0, ms: 0, problems: [] };

// jArchi's globals, read through globalThis so that this file stays pure (Node loads it).
/** @type {any} */
const _g = globalThis;
const _inArchi = () => typeof _g.$ !== "undefined" && typeof _g.Java !== "undefined";

// ── Run ───────────────────────────────────────────────────────────────────────

/**
 * Start a run: show the console (and clear it), print the script and the platform.
 * @param {string}  scriptFile  __FILE__ of the script
 * @param {boolean} [clear]     clear the console first
 */
function start(scriptFile, clear = false) {
  const pending = _pending;
  _reset();
  _pending = pending;               // the "Loading …" lines of this run
  _started = true;
  _script = String(scriptFile).replace(/^.*[\\/]/, "");
  if (_inArchi() && !_sink) {
    console.show();
    if (clear) console.clear();
  }
  _pending.unshift(`Started ${_dateTime(new Date())}`);   // the header above the lines kept
  info(RULE);
  info(field("Script:", _script));
  info(field("Platform:", _platform()));
  if (_inArchi() && !_sink) _requireJArchi();
  info("");                         // the header stands apart from what the script prints
}

/**
 * Stop the script when jArchi is older than MIN_JARCHI: the user gets the reason, not an error halfway.
 */
function _requireJArchi() {
  const version = String(_g.$.process.release.jArchiVersion);
  if (!versionBelow(version, MIN_JARCHI)) return;
  const message = `This script needs jArchi ${MIN_JARCHI} or later; this Archi has jArchi ${version.replace(/\.\d{8,}$/, "")}. Update the jArchi plugin, then run the script again.`;
  error(message);
  if (_g.Java.type("org.eclipse.ui.PlatformUI").isWorkbenchRunning()) _g.window.alert(message);
  finish();
  _g.exit();
}

/**
 * A dotted version is lower than another, number by number ("1.9.2" < "1.11").
 * @param {string} version
 * @param {string} min
 */
function versionBelow(version, min) {
  const a = version.split(".").map(n => parseInt(n, 10) || 0), b = min.split(".").map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < b.length; i++) if ((a[i] || 0) !== b[i]) return (a[i] || 0) < b[i];
  return false;
}

/**
 * Name the log file of this run (a preset name: its last part), and make it now.
 * @param {string} [name]  none: the script's name
 * @returns {string} the log file's name, without its folder ("" when none); finish() gives the path
 */
function name(name) {
  _open(name ? String(name).replace(/^.*\//, "") : _scriptBase());
  return _path.replace(/^.*[\\/]/, "");
}

/** The script's name without its extension. */
function _scriptBase() {
  return _script.replace(/\.[^.]*$/, "") || "script";
}

/**
 * Finish the run: print the duration and the log file, close the file.
 */
function finish() {
  if (_held) _flushItem();
  const ms = Date.now() - _timed;
  _open(_scriptBase());
  info(field("Duration:", _seconds(ms)));
  if (_path) { info("Log file:"); info(_path); }   // the path alone on its line: a triple click copies it
  info(RULE);
  _file(`Finished ${_dateTime(new Date())} (${_seconds(ms)})`);
  _close();
  _started = false;
}

/**
 * Count the duration from now: a dialog that is open for minutes before the user runs the action is not
 * part of the run. The log file keeps its start time.
 */
function restartDuration() {
  _timed = Date.now();
}

/** @returns {string} the log file's full path, as the platform writes it ("" when none) */
function path() {
  return _path;
}

// ── Lines ─────────────────────────────────────────────────────────────────────

/** Technical detail: the log file only. @param {string} text */
function debug(text) { write("DEBUG", text); }

/** Progress and results for the user. @param {string} text */
function info(text) { write("INFO", text); }

/**
 * Something the user should know: what happened, its effect, what to do.
 * @param {string} text
 * @param {Advice} [advice]
 */
function warn(text, advice) { write("WARN", _withAdvice(text, advice)); }

/**
 * An item or the run failed: what happened, its effect, what to do. The stack goes to detail().
 * @param {string} text
 * @param {Advice} [advice]
 */
function error(text, advice) { write("ERROR", _withAdvice(text, advice)); }

/**
 * A line for the log file only, at any level: the detail behind a line the console summarises.
 * @param {Level}  level
 * @param {string} text
 */
function detail(level, text) { _file(text, level); }

/**
 * One line at a level: the console (not DEBUG) and the log file.
 * @param {Level}  level
 * @param {string} text
 */
function write(level, text) {
  if (level !== "DEBUG" && !_held) {
    if (text === "" && _blank) return;
    _blank = text === "";
  }
  if (level === "WARN") {
    if (_warned.has(text)) { _file(text, level); return; }   // a layout run again repeats its warnings
    _warned.add(text);
    if (_held) _itemWarnings++;
  }
  if ((level === "WARN" || level === "ERROR") && _held && !_itemReason) _itemReason = text.split("\n")[0];
  if (_sink) { _sink(level, text); return; }
  _file(text, level);
  if (!_inArchi()) { _nodeConsole(level, text); return; }
  if (level === "DEBUG") return;
  const block = _render(level, text);
  if (_held) _held.push(block);
  else _console(level, block);
}

/**
 * A table, column-aligned, as INFO.
 * @param {Record<string, string | number | boolean | null | undefined>[]} data
 * @param {string[]} headers
 */
function columns(data, headers) {
  const widths = headers.map(h => Math.max(...data.map(row => String(row[h] ?? "").length), h.length));
  info(headers.map((h, i) => h.padEnd(widths[i])).join(" | "));
  info(widths.map(w => "-".repeat(w)).join("-|-"));
  for (const row of data) info(headers.map((h, i) => String(row[h] ?? "").padEnd(widths[i])).join(" | "));
}

/**
 * A "Label: value" line with the value at a column: VALUE_COLUMN, the same for every line of a run.
 * @param {string} label   with its colon
 * @param {string} value
 * @param {number} [indent]
 * @param {number} [column]  another column, for a block of its own (an item's details)
 */
function field(label, value, indent = 0, column = VALUE_COLUMN) {
  const lead = " ".repeat(indent) + label;
  return lead.padEnd(Math.max(column, lead.length + 1)) + value;
}

/** Send every line to this sink instead (the Node layout process). @param {Sink | null} sink */
function setSink(sink) { _sink = sink; }

// ── Items ─────────────────────────────────────────────────────────────────────

/**
 * Start an item: its console lines are held until endItem prints them under its status line. The
 * item already started (same name) goes on: a caller can start it before the code that does the work.
 * @param {string} kind  what the items are, for the log file's context, e.g. "view"
 * @param {string} name
 */
function beginItem(kind, name) {
  if (_held && _itemName === name) return;
  if (_held) _flushItem();
  _itemIndex++;
  _itemName = name;
  _itemReason = "";
  _context = `${kind} ${_itemIndex} "${name}"`;
  _held = [];
  _itemWarnings = 0;
  _warned = new Set();
}

/**
 * End an item: count it, print its status line, its details and the lines held.
 * @param {ItemStatus} status
 * @param {string}     headline  e.g. `New: "X" in /Views` (the icon is added)
 * @param {string[]}   [details] lines under the headline
 */
function endItem(status, headline, details = []) {
  if (status === "done") { _counts.done++; if (_itemWarnings) _counts.withWarnings++; }
  else { _counts[status]++; _counts.problems.push({ status, headline, reason: _itemReason }); }
  const icon = status === "failed" ? "✗" : status === "skipped" ? "–" : _itemWarnings ? "⚠" : "✓";
  const held = _held || [];
  const lines = [`${icon} ${headline}`, ...details.map(d => "    " + d)];
  if (_sink) for (const l of lines) _sink("INFO", l);
  else {
    _file(lines.join("\n"), status === "failed" ? "ERROR" : "INFO");
    if (_inArchi()) console.log([...lines, ...held.map(b => _indent(b, 4))].map(_wrap).join("\n"));
    else _nodeConsole("INFO", lines.join("\n"));   // Node printed the held lines already
  }
  _held = null;
  _blank = false;
  _itemName = "";
  _context = "run";
  _warned = new Set();
}

/** @returns {RunSummary} the items of this run so far, and its duration */
function summary() {
  return { ..._counts, problems: [..._counts.problems], ms: Date.now() - _timed };
}

/** Duration as the console shows it. @param {number} ms */
function seconds(ms) { return _seconds(ms); }

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @param {Advice} [advice]
 */
function _withAdvice(text, advice) {
  const lines = [text];
  if (advice && advice.effect) lines.push(`  Effect: ${advice.effect}`);
  if (advice && advice.action) lines.push(`  Action: ${advice.action}`);
  return lines.join("\n");
}

/**
 * The console block of a line: WARN and ERROR get their icon, continuation lines align under it.
 * @param {Level}  level
 * @param {string} text
 */
function _render(level, text) {
  const icon = ICON[level];
  if (!icon) return text;
  const [first, ...rest] = text.split("\n");
  return [`${icon} ${first}`, ...rest].join("\n");
}

/** @param {string} block @param {number} n */
function _indent(block, n) {
  const pad = " ".repeat(n);
  return block.split("\n").map(l => pad + l).join("\n");
}

/**
 * Wrap one console line at CONSOLE_WIDTH. Continuation lines hang under the value of a
 * "Label: value" line, under the text after an icon, or two spaces in; words are never broken.
 * @param {string} line
 * @returns {string}
 */
function _wrap(line) {
  if (line.includes("\n")) return line.split("\n").map(_wrap).join("\n");
  if (line.length <= CONSOLE_WIDTH) return line;
  const lead = (line.match(/^\s*/) || [""])[0];
  const rest = line.substring(lead.length);
  const icon = /^[✓⚠✗–] /.test(rest);
  const label = icon ? null : rest.match(/^[A-Z][A-Za-z ]{0,20}:\s+/);
  const hang = lead.length + (label ? label[0].length : 2);
  const words = rest.split(" ");
  const out = [];
  let current = lead + /** @type {string} */ (words.shift());
  for (const word of words) {
    // A word that does not fit on a line of its own either (a path) stays where it is.
    if (current.length + 1 + word.length > CONSOLE_WIDTH && hang + word.length <= CONSOLE_WIDTH && current.trim().length) {
      out.push(current);
      current = " ".repeat(hang) + word;
    } else current += " " + word;
  }
  out.push(current);
  return out.join("\n");
}

/** @param {Level} level @param {string} block */
function _console(level, block) {
  if (level === "ERROR") console.error(_wrap(block));
  else console.log(_wrap(block));
}

/** Node: the text as is, so the harness and the tests see what they saw. @param {Level} level @param {string} text */
function _nodeConsole(level, text) {
  if (level === "ERROR") console.error(text);
  else console.log(text);
}

function _flushItem() {
  for (const block of _held || []) console.log(_wrap(_indent(block, 4)));
  _held = null;
  _blank = false;
  _itemName = "";
  _context = "run";
}

// ── Log file ──────────────────────────────────────────────────────────────────

/**
 * A line for the log file: written when it is open, else kept.
 * @param {string} text
 * @param {Level}  [level]  none: a header or footer line
 */
function _file(text, level) {
  if (!_inArchi() || _sink) return;
  const prefix = level ? `${level.padEnd(5)} [${_context}] ` : "";
  const lines = String(text).split("\n").map(l => prefix + l);
  if (!_writer) {
    _pending.push(...lines);
    if (_pending.length > PENDING_MAX) _pending.splice(0, _pending.length - PENDING_MAX);
    return;
  }
  if (_full && level && level !== "WARN" && level !== "ERROR") return;   // the header and footer always
  _append(lines);
}

/** @param {string[]} lines */
function _append(lines) {
  try {
    for (const line of lines) { _writer.write(line); _writer.newLine(); _bytes += line.length + 1; }
    _writer.flush();
    if (!_full && _bytes > LOG_MAX_MB * 1024 * 1024) {
      _full = true;
      _writer.write(`Log full (${LOG_MAX_MB} MB): from here only WARN and ERROR`); _writer.newLine(); _writer.flush();
    }
  } catch (e) { _fail(e); }
}

/**
 * Make the log file of this run (once), write the lines kept, remove the oldest files.
 * @param {string} baseName
 */
function _open(baseName) {
  if (_writer || _fileFailed || !_started || !_inArchi() || _sink) return;
  try {
    const File = _g.Java.type("java.io.File");
    const ArchiPlugin = _g.Java.type("com.archimatetool.editor.ArchiPlugin");
    const folder = new File(ArchiPlugin.getInstance().getWorkspaceFolder(), LOG_FOLDER);
    folder.mkdirs();
    const safe = baseName.replace(/[^A-Za-z0-9._-]+/g, "_") || "script";
    let file = new File(folder, `${_stamp(new Date(_t0))}-${safe}.log`);
    for (let n = 2; file.exists(); n++) file = new File(folder, `${_stamp(new Date(_t0))}-${safe}-${n}.log`);   // two runs in one second
    const Writer = _g.Java.type("java.io.BufferedWriter");
    const StreamWriter = _g.Java.type("java.io.OutputStreamWriter");
    const Stream = _g.Java.type("java.io.FileOutputStream");
    _writer = new Writer(new StreamWriter(new Stream(file, true), "UTF-8"));
    _path = String(file.getAbsolutePath());
    const pending = _pending;
    _pending = [];
    _append(pending);
    _rotate(folder);
  } catch (e) { _fail(e); }
}

/** Keep the newest LOG_KEEP log files. @param {any} folder  java.io.File */
function _rotate(folder) {
  const names = (folder.list() || []).map(String).filter((/** @type {string} */ n) => /^\d{8}-\d{6}-.*\.log$/.test(n)).sort().reverse();
  const File = _g.Java.type("java.io.File");
  for (const old of names.slice(LOG_KEEP)) new File(folder, old).delete();
}

function _close() {
  try { if (_writer) _writer.close(); } catch (e) { /* closing a stream that failed: nothing left to save */ }
  _writer = null;
}

/** A log file that cannot be written: said once, the run goes on. @param {unknown} e */
function _fail(e) {
  if (_fileFailed) return;
  _fileFailed = true;
  _writer = null;
  _pending = [];
  console.error(`Log file not written: ${e}`);
}

function _reset() {
  _close();
  _t0 = _timed = Date.now();
  _pending = []; _path = ""; _bytes = 0; _full = false; _fileFailed = false;
  _context = "run"; _held = null; _blank = false; _itemWarnings = 0; _itemIndex = 0; _warned = new Set();
  _itemName = ""; _itemReason = "";
  _counts = { done: 0, withWarnings: 0, skipped: 0, failed: 0, ms: 0, problems: [] };
}

// ── Formatting ────────────────────────────────────────────────────────────────

function _platform() {
  if (!_inArchi()) return "Node";
  const engine = String(_g.$.process.engine).includes("Graal") ? "GraalVM" : String(_g.$.process.engine).includes("Nashorn") ? "Nashorn" : String(_g.$.process.engine);
  const version = (/** @type {unknown} */ v) => String(v).replace(/\.\d{8,}$/, "");   // without the build qualifier
  return `Archi ${version(_g.$.process.release.archiVersion)} · jArchi ${version(_g.$.process.release.jArchiVersion)} · ${engine} · ${_g.$.process.platform}`;
}

/** @param {number} ms */
function _seconds(ms) {
  return ms < 1000 ? `${ms} ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.floor(ms / 60000)} min ${Math.round((ms % 60000) / 1000)} s`;
}

/** @param {number} n */
const _two = n => String(n).padStart(2, "0");
/** yyyy-MM-dd HH:mm:ss @param {Date} d */
const _dateTime = d => `${d.getFullYear()}-${_two(d.getMonth() + 1)}-${_two(d.getDate())} ${_two(d.getHours())}:${_two(d.getMinutes())}:${_two(d.getSeconds())}`;
/** yyyyMMdd-HHmmss @param {Date} d */
const _stamp = d => `${d.getFullYear()}${_two(d.getMonth() + 1)}${_two(d.getDate())}-${_two(d.getHours())}${_two(d.getMinutes())}${_two(d.getSeconds())}`;

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    start, name, finish, path, restartDuration,
    debug, info, warn, error, detail, write, columns, field, setSink,
    beginItem, endItem, summary, seconds,
    CONSOLE_WIDTH, DETAIL_COLUMN, MIN_JARCHI, versionBelow,
    _wrap,   // log_test.js
  };
}
