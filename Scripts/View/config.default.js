// config.default.js
//
// The programs the View scripts start, as found on the PATH. When Archi does not find one on its PATH
// (macOS, where a desktop app does not get the shell's PATH; Node from nvm or fnm), set its full path
// in config.js next to this file: your own settings, ignored by git. Read once per run
// (lib/view_config.js); a key not listed here stops the run with a message.
//
// Example config.js:
//
//   module.exports = {
//     nodePath: "/opt/homebrew/bin/node",   // Node layout (recommended: a layout often 10× faster)
//     dotPath:  "/opt/homebrew/bin/dot",    // Graphviz algorithms: Dot, Neato, FDP, SFDP, Twopi, Circo
//   };

module.exports = {
  nodePath: "node",
  dotPath:  "dot",
};
