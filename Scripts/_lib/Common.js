/**
 * Common.js
 *
 * generic functions for use in all scripts
 * - checkEngine:  check version of jScript engine
 * - counters, UUID, relation and date formatting
 * Logging (console and log file) is in log.js.
 */
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
/** @type {typeof import("./log")} */
const Log = require(REPO_ROOT + "_lib/log");
Log.debug("Loading common.js");

const OBJECT_TYPE_RELATION = "relation";
const OBJECT_TYPE_ELEMENT = "element";
const OBJECT_TYPE_VIEW = "view";

/** @type {Record<string, number>} */
var _startCounter = {};

const JS_NASHORN_ES6 = "jdk.nashorn.api.scripting.NashornScriptEngine";
const JS_ENGINE_GRAALVM = "com.oracle.truffle.js.scriptengine.GraalJSScriptEngine";
const JS_ENGINES = [JS_NASHORN_ES6, JS_ENGINE_GRAALVM];
const JS_ENGINES_TEXT = ["Nashorn ES6", "GraalVM"];


/**
 * startCounter and endCounter
 *   measure runtime for a block of code
 * @param {string} label
 */
function startCounter(label) {
  _startCounter[label] = Date.now();
}

/**
 * @param {string} label
 * @returns {string} elapsed time since startCounter(label), e.g. "2m5s", "12s", "340ms"
 */
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
      Log.error(line);
    } else {
      check = true;
    }
  } catch (error) {
    if (/** @type {{ message?: string }} */ (error).message == "$ is not defined") {
      Log.error("Run this script in Archi");
    } else {
      Log.error("error: " + error);
      return false;
    }
  }
  return check;
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

// returns formatted string with relation info
const FORMAT_WITH_TYPES = true;
const FORMAT_NO_TYPES = false;
const FORMAT_REVERSED = true;
const FORMAT_NOT_REVERSED = false;
/**
 * Formatted string with relation info.
 * @param {ArchiRelation} rel
 * @param {boolean} [withTypes]  print the ends as objects (with their type) instead of names
 * @param {boolean} [reversed]   print target → source
 * @returns {string}
 */
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
 * (a visual without a concept, such as a note or group, is returned as is)
 * @param {ArchiObject} o
 * @returns {ArchiObject}
 */
function concept(o) {
  return o.concept ? o.concept : o;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    startCounter,
    endCounter,
    check_JS_Engine,
    generateUUID,
    formatRelation,
    getFormattedDateTime,
    concept,
    OBJECT_TYPE_RELATION,
    OBJECT_TYPE_ELEMENT,
    OBJECT_TYPE_VIEW,
    FORMAT_WITH_TYPES,
    FORMAT_NO_TYPES,
    FORMAT_REVERSED,
    FORMAT_NOT_REVERSED,
  };
}
