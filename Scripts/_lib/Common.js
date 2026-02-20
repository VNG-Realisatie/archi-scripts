/**
 * Common.js
 *
 * generic functions for use in all scripts
 * - (init|finish)ConsoleLog: log start and end messages
 * - checkEngine:             check version of jScript engine
 * - (info|debug):            log message
 */
console.log("Loading common.js");

var _commonScriptName;
var _startCounter = {};

// default console logging is on. Override in calling function with push() and pop()
let infoStack = [true];
let debugStack = [true];

const JS_NASHORN_ES6 = "jdk.nashorn.api.scripting.NashornScriptEngine";
const JS_ENGINE_GRAALVM = "com.oracle.truffle.js.scriptengine.GraalJSScriptEngine";
const JS_ENGINES = [JS_NASHORN_ES6, JS_ENGINE_GRAALVM];
const JS_ENGINES_TEXT = ["Nashorn ES6", "GraalVM"];

// Minimum jArchi version for CommonJS support
const MIN_JARCHI_VERSION_COMMONJS = "1.3";

/**
 * initConsoleLog and finishconsole
 *   first and last call in an Archi script
 *
 * @param pFile : string __FILE__ as current script
 * @param pClear : boolean for clear console
 */
function initConsoleLog(pFile, pClear) {
  startCounter("initConsoleLog");

  // Show output in the console
  console.show();
  if (pClear) {
    console.clear();
  }

  let ArchiVersion = "version older than 4.9";
  let jArchiVersion = "version older than 1.2";
  try {
    ArchiVersion = $.process.release.archiVersion;
    jArchiVersion = $.process.release.jArchiVersion;
  } catch (error) {}

  let pattern = /^.*[\\\/]/;
  _commonScriptName = pFile.replace(pattern, "");

  console.log("============================================");
  console.log(`Archi:             ${ArchiVersion}`);
  console.log(`Platform:          ${$.process.platform}`);
  console.log(`Javascript engine: ${JS_ENGINES_TEXT[JS_ENGINES.indexOf($.process.engine)]}`);
  console.log(`jArchi plugin:     ${jArchiVersion}\n`);
  console.log(`Running script:    ${_commonScriptName}\n`);
}

function finishConsoleLog() {
  console.log(`\nScript "${_commonScriptName}" finished in ${endCounter("initConsoleLog")}`);
  console.log("\n==========================================\n");
}

/**
 * startCounter and endCounter
 *   measure runtime for a block of code
 */
function startCounter(label) {
  _startCounter[label] = Date.now();
}

function endCounter(label) {
  let _endCounter = Date.now();
  let milliSeconds = parseInt(String(_endCounter - _startCounter[label]));
  let durationInSeconds = parseInt(String((_endCounter - _startCounter[label]) / 1000));
  let minutes = parseInt(String(durationInSeconds / 60));
  let seconds = parseInt(String(durationInSeconds % 60));
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  } else if (seconds > 10) {
    return `${seconds}s`;
  } else {
    return `${milliSeconds}ms`;
  }
}

/**
 * Check if script run in Archi with required JS engine
 *
 * @param {string} required_engine
 * @returns {boolean}
 */
function check_JS_Engine(required_engine) {
  var check = false;
  try {
    var js_engine = $.process.engine;
    var current_js_index = JS_ENGINES.indexOf(js_engine);
    var required_js_index = JS_ENGINES.indexOf(required_engine);
    if (current_js_index < required_js_index) {
      var line = "\nThis script needs a higher JavaScript engine";
      line += "\n- Current engine: " + JS_ENGINES_TEXT[current_js_index];
      line += "\n- Required engine: " + JS_ENGINES_TEXT[required_js_index] + "\n";
      line += "\nChange your Archi settings";
      line +=
        "\n- Go to Edit > Preferences > Scripting and select the '" +
        JS_ENGINES_TEXT[required_js_index] +
        "' JavaScript Engine";
      line += "\n- If the JavaScript engine is not selectable, first upgrade the jArchi plugin\n\n";
      console.error(line);
    } else {
      check = true;
    }
  } catch (error) {
    if (error.message == "$ is not defined") {
      console.log("Run this script in Archi");
    } else {
      console.log("error: " + error);
      return false;
    }
  }
  return check;
}

/**
 * Check if CommonJS is supported in current jArchi version
 *
 * @returns {boolean}
 */
function check_CommonJS_Support() {
  try {
    var jArchiVersion = $.process.release.jArchiVersion;

    // Parse version string (e.g., "1.3.0" -> [1, 3, 0])
    var versionParts = jArchiVersion.split(".").map(function (part) {
      return parseInt(part);
    });

    var minVersionParts = MIN_JARCHI_VERSION_COMMONJS.split(".").map(function (part) {
      return parseInt(part);
    });

    // Compare versions
    for (var i = 0; i < Math.max(versionParts.length, minVersionParts.length); i++) {
      var current = versionParts[i] || 0;
      var required = minVersionParts[i] || 0;

      if (current > required) {
        return true;
      } else if (current < required) {
        var line = "\nCommonJS is not supported in this jArchi version";
        line += "\n- Current jArchi version: " + jArchiVersion;
        line += "\n- Required jArchi version: " + MIN_JARCHI_VERSION_COMMONJS + " or higher\n";
        line += "\nPlease upgrade the jArchi plugin from:";
        line += "\n- Go to https://github.com/archimatetool/archi-plugins\n";
        console.error(line);
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking CommonJS support: " + error);
    return false;
  }
}

/**
 * info()
 *   show informational message if global infoStack is set
 * @param msg string information message
 */
function info(msg) {
  _logMessage(infoStack, "Info", msg);
}

function debugStackPush(debugSwitch) {
  debugStack.push(debugSwitch);
}

function debugStackPop() {
  debugStack.pop();
}

/**
 * debug()
 *   show debug message if global debugStack is set
 * @param msg string information message
 */
function debug(msg) {
  _logMessage(debugStack, "Debug", msg);
}

/**
 * logMessage()
 *   show message with prefix
 * @param msg string information message
 */
function _logMessage(logSwitch, logType, msg) {
  if (logSwitch[logSwitch.length - 1]) {
    if (msg.startsWith("\n")) {
      console.log();
      msg = msg.substring("\n".length);
    }

    let funcName = "";
    if (JS_ENGINES.indexOf($.process.engine) >= JS_ENGINES.indexOf(JS_ENGINE_GRAALVM)) {
      funcName = " " + _getFuncName();
    }
    console.log(`${">".repeat(logSwitch.length)} ${logType}${funcName}: ${msg}`);
  }
}

/**
 * See https://github.com/winstonjs/winston/issues/200
 */
function _getFuncName() {
  const STACK_LEVEL_START = 4; // archi > calling function > debug > logMessage

  let stack = new Error().stack;
  // console.log(`stack:\n${stack}\n\n`)

  //  let regExpString = `Error((?:\\n\\s*at )(?<functionName>[a-zA-Z0-9_.<>]+) (?<sourceFileName>\\([a-zA-Z0-9:. _/\\[\\]\\-\\\\]+\\))){${STACK_LEVEL_START}}`;
  let regExpString = `Error((?:\\n\\s*at )(?<functionName>[a-zA-Z0-9_.<>]+) (?<sourceFileName>\\([a-zA-Z0-9:. _/\\[\\]\\-\\\\]+\\)))`;
  regExpString += `{${STACK_LEVEL_START}}`;

  let funcName = stack.match(regExpString);
  if (funcName[2] == "<program>") {
    return "";
  } else {
    return `${funcName[2]}()`;
  }
}

/**
 * 	return a generated UUID
 * 	from : https://stackoverflow.com/questions/105034/how-to-create-guid-uuid
 */
function generateUUID() {
  // Public Domain/MIT
  var d = new Date().getTime(); //Timestamp
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    var r = Math.random() * 16; //random number between 0 and 16
    r = ((d + r) % 16) | 0;
    d = Math.floor(d / 16);
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/**
 * @returns UUID
 * https://stackoverflow.com/questions/105034/how-do-i-create-a-guid-uuid
 * Note: The use of any UUID generator that relies on Math.random() is strongly discouraged
 *
 * Test: console.log(uuidv4());
 *
 * Not used yet. How to load module crypto?
 *
 */
// function uuidv4() {
//   return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
//     (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)
//   );
// }
// ChatGPT improved version
function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] % 16; // Generate random number between 0-15
    const v = c === "x" ? r : (r & 0x3) | 0x8; // For 'y', ensure the variant is 10xx
    return v.toString(16);
  });
}

/**
 * returns formatted string with relation info
 */
const FORMAT_WITH_TYPES = true;
const FORMAT_NO_TYPES = false;
const FORMAT_REVERSED = true;
const FORMAT_NOT_REVERSED = false;
function formatRelation(rel, withTypes = FORMAT_NO_TYPES, reversed = FORMAT_NOT_REVERSED) {
  let relLeft = withTypes ? rel.source : rel.source.name;
  let relLabel = rel.name ? rel.name : "[geen label]";
  let relMiddle = `--${relLabel}-->`;
  let relRight = withTypes ? rel.target : rel.target.name;

  if (reversed) {
    relLeft = withTypes ? rel.target : rel.target.name;
    relMiddle = `<--${relLabel}--`;
    relRight = withTypes ? rel.source : rel.source.name;
  }
  return `${relLeft} ${relMiddle} ${relRight} (${rel.type.replace("-relationship", "")})`;
}

// 10-04-2024 17:11:29
function getFormattedDateTime() {
  const now = new Date();

  const day = now.getDate().toString().padStart(2, "0");
  const month = (now.getMonth() + 1).toString().padStart(2, "0"); // getMonth() is 0-indexed
  const year = now.getFullYear();

  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const seconds = now.getSeconds().toString().padStart(2, "0");

  return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
}

/**
 * return a concept for a visual concept or concept
 */
function concept(o) {
  return o.concept ? o.concept : o;
}

/**
 * Log a list of objects in columns.
 * @param {Array} data - The data to log
 * @param {Array} headers - The headers for the columns
 */
function logInColumns(data, headers) {
  const columnWidths = headers.map((header) =>
    Math.max(...data.map((row) => (row[header] || "").toString().length), header.length),
  );
  const headerRow = headers.map((header, i) => header.padEnd(columnWidths[i])).join(" | ");
  const separatorRow = columnWidths.map((width) => "-".repeat(width)).join("-|-");
  console.log(headerRow);
  console.log(separatorRow);
  data.forEach((row) => {
    const rowString = headers.map((header, i) => (row[header] || "").toString().padEnd(columnWidths[i])).join(" | ");
    console.log(rowString);
  });
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    initConsoleLog,
    finishConsoleLog,
    startCounter,
    endCounter,
    check_JS_Engine,
    check_CommonJS_Support,
    info,
    debug,
    debugStackPush,
    debugStackPop,
    generateUUID,
    uuidv4,
    formatRelation,
    getFormattedDateTime,
    concept,
    logInColumns,
    FORMAT_WITH_TYPES,
    FORMAT_NO_TYPES,
    FORMAT_REVERSED,
    FORMAT_NOT_REVERSED,
  };
}
