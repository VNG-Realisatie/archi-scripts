// Helper of probeJArchiApi.ajs: does require("./…") inside a module resolve next to this file?
let viaRelative;
try { viaRelative = require("./_probe_require_b.js").name; } catch (e) { viaRelative = `throws: ${e}`; }
module.exports = { viaRelative };
