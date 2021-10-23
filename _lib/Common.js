/**
 * Common.js
 *
 * generic functions for use in all scripts
 * - (init|finish)ConsoleLog: log start and end messages
 * - checkEngine:             check version of jScript engine
 * - (info|debug):            log message
 */

var _commonScriptName;
var _startCounter = {};

// default console logging is off. Override in calling function with push() and pop()
let _logInfoMessage = [false];
let _logDebugMessage = [false];

const JS_NASHORN_ES6 = "jdk.nashorn.api.scripting.NashornScriptEngine";
const JS_ENGINE_GRAALVM = "com.oracle.truffle.js.scriptengine.GraalJSScriptEngine";
const JS_ENGINES = [ JS_NASHORN_ES6, JS_ENGINE_GRAALVM];
const JS_ENGINES_TEXT = [ "Nashorn ES6", "GraalVM"];

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

  let pattern = /^.*[\\\/]/;
  _commonScriptName = pFile.replace(pattern, "");

  console.log("============================================");
  console.log(`Executing script "${_commonScriptName}"...`);
  console.log(`Platform: ${$.process.platform}`);
  console.log(`Engine:   ${JS_ENGINES_TEXT[JS_ENGINES.indexOf($.process.engine)]}\n`);
}

function finishConsoleLog() {
  console.log(`\nScript "${_commonScriptName}" finished in ${endCounter("initConsoleLog")}`);
  console.log("==========================================\n");
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
  let milliSeconds = parseInt(_endCounter - _startCounter[label]);
  let durationInSeconds = parseInt((_endCounter - _startCounter[label]) / 1000);
  let minutes = parseInt(durationInSeconds / 60);
  let seconds = parseInt(durationInSeconds % 60);
  if (minutes > 0) {
    return `${minutes}m${seconds}s`;
  } else if (seconds > 0) {
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
        "\n- Go to Edit > Preferences > Scripting and select the '" + JS_ENGINES_TEXT[required_js_index] + "' JavaScript Engine";
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
 * info()
 *   show informational message if global _logInfoMessage is set
 * @param msg string information message
 */
function info(msg) {
  logMessage(_logInfoMessage, "Info", msg);
}

function debugPush(debugSwitch) {
  _logDebugMessage.push(debugSwitch);
}

function debugPop() {
  _logDebugMessage.pop();
}

/**
 * debug()
 *   show debug message if global _logDebugMessage is set
 * @param msg string information message
 */
function debug(msg) {
  logMessage(_logDebugMessage, "Debug", msg);
}

/**
 * logMessage()
 *   show message with prefix
 * @param msg string information message
 */
function logMessage(logSwitch, logType, msg) {
  if (logSwitch[logSwitch.length - 1]) {
    if (msg.startsWith("\n")) {
      console.log();
      msg = msg.substring("\n".length);
    }

    let funcName = "";
    if (JS_ENGINES.indexOf($.process.engine) >= JS_ENGINES.indexOf(JS_ENGINE_GRAALVM)) {
      funcName = " " + getFuncName();
    }
    console.log(`${">".repeat(logSwitch.length)} ${logType}${funcName}: ${msg}`);
  }
}

/**
 * See https://github.com/winstonjs/winston/issues/200
 */
function getFuncName() {
  let stack = new Error().stack;
  let stackLevel = 4; // archi > calling function > debug > logMessage

  // console.log(`stack:\n${stack}\n\n`)

  // escaped regEx /Error((?:\n\s*at )(?<functionName>[a-zA-Z0-9_.<>]+) (?<sourceFileName>\([a-zA-Z0-9:. _/\[\]\-\\]+\))){6}/
  let regExpString = `Error((?:\\n\\s*at )(?<functionName>[a-zA-Z0-9_.<>]+) (?<sourceFileName>\\([a-zA-Z0-9:. _/\\[\\]\\-\\\\]+\\))){${stackLevel}}`;

  let funcName = stack.match(regExpString);

  // In Archi <program> is matched in a map/reduce/filter function
  if (funcName[2] == "<program>") {
    return "";
  } else {
    return `${funcName[2]}()`;
  }
}

/**
 * stack()
 *   show stack message and error stack trace
 * @param msg string information message
 */
function stack(msg) {
  console.log("Error: " + msg);
  console.log("Stack: " + new Error().stack);
}

/**
 * slash()
 *  return OS dependent filepath separator
 */
function slash() {
  var System = Java.type("java.lang.System");
  var nameOS = System.getProperty("os.name", "");

  if (nameOS.indexOf("Win") != -1) {
    return "\\";
  } else {
    if (nameOS.indexOf("Mac") != -1 || nameOS.indexOf("X11") != -1 || nameOS.indexOf("Linux") != -1) {
      return "/";
    } else {
      throw `>> Unknown OS: ${nameOS}`;
    }
  }
}

/**
 * function table
 *   generate text table strings suitable for printing to stdout
 *   usage: var s = table(rows, opts={})
 *
 * based on https://www.npmjs.com/package/text-table
 *
 * options are
 *   opts.markdown - generate a markdown table
 *   opts.hsep     - separator to use between columns, default '  '
 *   opts.align    - array of alignment types for each column, default ['l','l',...]
 *   opts.stringLength - callback function to use when calculating the string length
 *
 * alignment types are:
 *   'l' - left
 *   'r' - right
 *   'c' - center
 *   '.' - decimal
 *
 * @param {*} tData 2 dimensional array with rows and columns
 * @param {*} opts object with layout options
 * @returns string with table
 */
function table(tData, opts) {
  const cLineChar = "-";
  const cIndexTitle = 1;
  const cIndexLine = 2;

  if (!opts) opts = {};
  var markDown = opts.markdown === true ? true : false;
  if (markDown) {
    var hsep = " | ";
  } else {
    var hsep = opts.hsep === undefined ? "  " : opts.hsep;
  }
  var align = opts.align || [];
  var stringLength =
    opts.stringLength ||
    function (s) {
      return String(s).length;
    };

  // if option markdown is set, create and insert a row with the markdown title separator
  var rows_ = [];
  if (markDown) {
    var i_rowsTitle = 0;
    for (let i_row = 0; i_row < tData.length; i_row++) {
      rows_[i_rowsTitle] = tData[i_row];
      i_rowsTitle++;
      if (i_row == 0) {
        rows_[i_rowsTitle] = [];
        for (let i_cell = 0; i_cell < tData[i_row].length; i_cell++) {
          rows_[i_rowsTitle][i_cell] = cLineChar;
        }
        i_rowsTitle++;
      }
    }
  } else {
    rows_ = tData;
  }

  var dotsizes = reduce(
    rows_,
    function (acc, row) {
      forEach(row, function (c, ix) {
        let n = dotindex(c);
        if (!acc[ix] || n > acc[ix]) acc[ix] = n;
      });
      return acc;
    },
    []
  );

  // for collumns with '.', find the dot and fill out to the right
  var irow = 0;
  var rows = map(rows_, function (row) {
    irow++;
    return map(row, function (c_, ix) {
      let c = String(c_);
      if (
        align[ix] === "." &&
        (!markDown || // there is no title
          (markDown && irow != cIndexTitle && irow != cIndexLine)) // skip the Title rows
      ) {
        let index = dotindex(c);
        let size = dotsizes[ix] + (/\./.test(c) ? -1 : 0) - (stringLength(c) - index);

        return c + Array(size).join(" ");
      } else return c;
    });
  });

  var sizes = reduce(
    rows,
    function (acc, row) {
      forEach(row, function (c, ix) {
        let n = stringLength(c);
        if (!acc[ix] || n > acc[ix]) acc[ix] = n;
      });
      return acc;
    },
    []
  );

  var irow = 0;
  var tableString = map(rows, function (row) {
    irow++;
    return (
      `${markDown ? "| " : ""}` +
      map(row, function (c, ix) {
        let n = sizes[ix] - stringLength(c) || 0;
        let s = Array(Math.max(n + 1, 1)).join(" ");
        if (markDown && irow == cIndexLine) {
          return c + Array(Math.max(n + 1, 1)).join(cLineChar);
        }
        if (align[ix] === "c" || (markDown && irow == cIndexTitle)) {
          return Array(Math.ceil(n / 2 + 1)).join(" ") + c + Array(Math.floor(n / 2 + 1)).join(" ");
        }
        if (align[ix] === "r" || align[ix] === ".") {
          return s + c;
        }
        return c + s;
      }).join(hsep)
    ); //.replace(/\s+$/, '');
  }).join(`${markDown ? " |" : ""}\n`);
  return tableString + `${markDown ? " |" : ""}\n`;
}

function dotindex(c) {
  let m = /\.[^.]*$/.exec(c);
  return m ? m.index + 1 : c.length;
}

function reduce(xs, f, init) {
  if (xs.reduce) return xs.reduce(f, init);
  let i = 0;
  let acc = arguments.length >= 3 ? init : xs[i++];
  for (; i < xs.length; i++) {
    f(acc, xs[i], i);
  }
  return acc;
}

function forEach(xs, f) {
  if (xs.forEach) return xs.forEach(f);
  for (let i = 0; i < xs.length; i++) {
    f.call(xs, xs[i], i);
  }
}

function map(xs, f) {
  if (xs.map) return xs.map(f);
  let res = [];
  for (let i = 0; i < xs.length; i++) {
    res.push(f.call(xs, xs[i], i));
  }
  return res;
}
