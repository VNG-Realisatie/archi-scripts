---
name: jarchi-scripting
description: This skill should be used when the user asks to "write a JArchi script", "create an Archi script", "build an .ajs script", "add a dialog to a script", "use SWT widgets", "create a JFace dialog", "use Eclipse UI in JArchi", "extend a Java class in JavaScript", "use Java.type()", "work with ArchiMate elements", "use the jArchi API", "create a library module", "use GraalJS", mentions JArchi, Archi scripting, ArchiMate modeling scripts, SWT/JFace UI, or GraalVM JavaScript for Archi.
---

# JArchi Script Development

Procedural guide for writing JArchi scripts (GraalVM GraalJS, ECMAScript 2024). Requires Archi 5.8+ and Java 21 (jArchi 1.12+); earlier versions support Archi 5.5+ with jArchi 1.8+.

For complete API reference, repo-specific patterns, and GraalVM/Java interop details, see the reference files in `ai/jarchi-scripting/`.

## Quick Links to Local References

- **`ai/jarchi-scripting/jarchi-api-reference.md`** — Complete jArchi API (v0.1–1.12)
- **`ai/jarchi-scripting/jarchi-script-development.md`** — Repo conventions: REPO_ROOT, `_lib/` modules, jArchi rules
- **`ai/jarchi-scripting/graaljs-compatibility.md`** — GraalJS/ECMAScript features
- **`ai/jarchi-scripting/java-interop.md`** — Java interoperability from GraalVM

## Constraints (NOT Node.js)

- Use `load()` for local files — **never `require()`** (it resolves to `node_modules/`)
- No Web Workers, no async I/O, no `setTimeout` (unless shimmed)
- No Node.js modules (`fs`, `path`, `http`) — use `Java.type()` for Java equivalents
- `this` inside `Java.extend()` refers to the Java proxy — use the object wrapper pattern below

## Creating a Script

Every top-level `.ajs` script: clear console, load `log.js`, IIFE, try-catch, `"use strict"`:

```javascript
/**
 * @name Script Name
 * @description Brief description
 * @version 1.0.0
 * @author Author Name
 * @lastModifiedDate YYYY-MM-DD
 */
console.clear();
console.show();

load(__DIR__ + "lib/log.js");
load(__DIR__ + "lib/swtImports.js");

(function () {
    "use strict";
    try {
        log.header("Script Name");
        // Main script logic
        log.success("Script Name: Complete.");
    } catch (error) {
        log.error("Script failed: " + error.toString());
        window.alert("Error: " + error.message);
    }
})();
```

Use **Title Case with spaces** for `.ajs` filenames (e.g., `ELK Layout.ajs`). `__DIR__` already includes trailing separator — don't add `/`.

## Creating a Library Module

To create a reusable module in `lib/`, use the dual-export IIFE with a double-load guard:

```javascript
(function() {
    "use strict";
    if (typeof globalThis !== "undefined" && typeof globalThis.myModule !== "undefined") return;
    // ... module code ...
    if (typeof globalThis !== "undefined") globalThis.myModule = myModule;
    if (typeof module !== "undefined" && module.exports) module.exports = myModule;
})();
```

To load a module: `load(__DIR__ + "lib/myModule.js");` then destructure from the global.

## Working with the Model

To get the active view, use `resolveSelection` (never `$(selection).filter("archimate-diagram-model")`):

```javascript
load(__DIR__ + "lib/resolveSelection.js");
var view = resolveSelection.activeView();           // current view
var elements = resolveSelection.selectedConcepts("element"); // selected elements
```

To query elements: `$("business-process")`. To create: `model.createElement("business-process", "Name")`. To create relationships: `model.createRelationship("serving-relationship", source, target)`.

Always handle empty names: `element.name && element.name.trim() ? element.name : "-- unnamed --"`.

## Building Dialogs

To create a dialog, use `swtImports.ExtendedTitleAreaDialog` with the object wrapper pattern. **Both `isResizable` and `getShellStyle` overrides are required** — `isResizable` alone fails because the `Java.extend` proxy isn't wired during the Java constructor. Always call `setHelpAvailable(false)` before `open()`.

```javascript
load(__DIR__ + "lib/swtImports.js");
var { SWT, Text, GridDataFactory, ExtendedTitleAreaDialog } = swtImports;

var myDialog = {
    dialog: new ExtendedTitleAreaDialog(shell, {
        configureShell: function(newShell) {
            Java.super(myDialog.dialog).configureShell(newShell);
            newShell.setText("My Dialog");
        },
        isResizable: function() { return true; },
        getShellStyle: function() {
            return SWT.CLOSE | SWT.TITLE | SWT.BORDER | SWT.APPLICATION_MODAL | SWT.RESIZE | SWT.MAX;
        },
        createDialogArea: function(parent) {
            var area = Java.super(myDialog.dialog).createDialogArea(parent);
            myDialog.dialog.setMessage("Enter information:");
            var text = new Text(area, SWT.BORDER);
            GridDataFactory.fillDefaults().grab(true, false).applyTo(text);
            myDialog._nameText = text;
            return area;
        },
        okPressed: function() {
            var value = myDialog._nameText.getText().trim();
            if (!value) { myDialog.dialog.setErrorMessage("Required"); return; }
            Java.super(myDialog.dialog).okPressed();
        }
    })
};
myDialog.dialog.setHelpAvailable(false);
if (myDialog.dialog.open() === 0) { /* user clicked OK */ }
```

For simple prompts: `window.prompt("Enter name:")`, `window.confirm("Sure?")`, `window.alert("Done.")`.

## Critical Pitfalls

1. **`Java.super(this)` fails** — always use `Java.super(myDialog.dialog)` via stored object property
2. **`require()` fails for local files** — use `load(__DIR__ + "lib/file.js")`
3. **Raw `$(selection)` misses cases** — use `resolveSelection.selectedConcepts()` / `.activeView()`
4. **Non-resizable dialogs** — override both `isResizable()` AND `getShellStyle()`
5. **Help button showing** — call `dialog.setHelpAvailable(false)` before `open()`
6. **Null element names** — always guard with `name && name.trim()` check
7. **Raw console.log** — use `log.header/info/detail/success/warn/error` from `lib/log.js`
8. **Undisposed resources** — use try/finally for Color, Font, Image
9. **Double path separator** — `__DIR__` already has trailing separator

## Reference Files

Complete documentation lives in `ai/jarchi-scripting/`:

- **`jarchi-api-reference.md`** — Complete JArchi API (v0.1–1.12): collection methods, element types, view operations, visual objects, constants, version history
- **`jarchi-script-development.md`** — Repo-specific patterns: REPO_ROOT pattern, available `_lib/` modules, jArchi-specific rules, coding standards
- **`graaljs-compatibility.md`** — GraalJS runtime: ECMAScript 2024 features, `load()` semantics, global functions
- **`java-interop.md`** — Java interoperability: `Java.type()`, `Java.extend()`, `Java.super()`, type mappings, array conversions
