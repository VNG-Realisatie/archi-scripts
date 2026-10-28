// Helper of probeJArchiApi.ajs: does require("./…") inside a module resolve next to this file, and does a "../" path?
let viaRelative;
try { viaRelative = require("./_probe_require_b.js").name; } catch (e) { viaRelative = `throws: ${e}`; }
let viaParent;
try { viaParent = require("../Develop/_probe_require_b.js").name; } catch (e) { viaParent = `throws: ${e}`; }
module.exports = { viaRelative, viaParent };
