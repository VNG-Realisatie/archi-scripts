# jArchi Script Development for archi-scripts

Guide to repo-specific jArchi scripting conventions. This complements `jarchi-api-reference.md` (complete API) by documenting the project's local patterns, utilities, and best practices. No duplication with API reference, GraalJS compatibility, or Java interop guides.

---

## Quick Start: REPO_ROOT Pattern

Every file that loads `_lib/` modules or other shared dependencies must define `REPO_ROOT` locally. This one-liner works at any depth in the Scripts tree and normalizes Windows paths:

```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
```

**What it does:**
1. Takes `__DIR__` (the directory of the current file)
2. Converts backslashes to forward slashes (Windows compatibility)
3. Finds `/Scripts/` in the path
4. Returns everything up to and including `/Scripts/`

This ensures that any file — whether at `Scripts/View/lib/generate_view.js` or `Scripts/_test/test.ajs` — gets the same root, and dependencies can be loaded consistently:

```js
const Common = require(REPO_ROOT + "_lib/Common.js");
const Selection = require(REPO_ROOT + "_lib/selection.js");
```

---

## Available `_lib/` Modules

The `Scripts/_lib/` folder contains shared utilities for common tasks. Use `require()` to load them (not `load()`).

### `Common.js`
General-purpose utilities and logging.

**Exports:**
- `initConsoleLog(filePath, shouldClear)` — start banner with Archi/JS engine/jArchi version
- `finishConsoleLog()` — end banner with elapsed time
- `startCounter(label)` / `endCounter(label)` — wall-clock timing for a named operation
- `check_JS_Engine(requiredEngine)` — validate engine (GraalVM vs Nashorn)
- `check_CommonJS_Support()` — validate jArchi >= 1.3
- `debug(msg)` — diagnostic output (includes function name via stack trace on GraalVM)
- `info(msg)` — informational output
- `debugStackPush(enabled)` / `debugStackPop()` — control call-stack tracking (GraalVM only)
- `concept(object)` — unwrap visual objects to their model concept
- `logInColumns(data, headers)` — tabular console output
- `generateUUID()` / `uuidv4()` — UUID generators
- `formatRelation(rel, withTypes, reversed)` — human-readable relation string with optional type/direction
- `getFormattedDateTime()` — returns `"DD-MM-YYYY HH:MM:SS"`

**Constants:**
- `OBJECT_TYPE_ELEMENT`, `OBJECT_TYPE_RELATION`, `OBJECT_TYPE_VIEW`
- `FORMAT_WITH_TYPES`, `FORMAT_NO_TYPES`, `FORMAT_REVERSED`, `FORMAT_NOT_REVERSED`

**Usage:**
```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common = require(REPO_ROOT + "_lib/Common.js");

Common.initConsoleLog(__FILE__, true);  // clear console, print start banner
Common.debug("Processing element: " + el.name);
Common.finishConsoleLog();              // print elapsed time
```

### `selection.js`
Smart selection traversal that handles edge cases.

**Exports:**
- `getSelection(startSelection, selector)` — walk selection recursively, return model concepts
- `getSelectionArray(startSelection, selector)` — same, but return plain JS array
- `getVisualSelection(startSelection, selector)` — return visual objects; if exactly one selected, expand to all of its type on that view
- `applyToCollection(collection, function, args)` — apply function to every item
- `DIAGRAM_OBJECT_TYPES` — array of diagram-model-* type strings

**Why use it:** Raw `$(selection)` misses several cases:
- Doesn't expand view references to target concepts
- Doesn't auto-expand single-object selections
- Doesn't handle diagram-model-* types consistently

**Usage:**
```js
const Selection = require(REPO_ROOT + "_lib/selection.js");

// Instead of $(selection), use:
const concepts = Selection.getSelection(selection, "*");
const visuals = Selection.getVisualSelection(selection, "element");
```

### `archi_folders.js`
Folder path navigation and manipulation.

**Exports:**
- `getFolderPath(path)` — walk a `/`-separated path string, create missing folders, return terminal folder
- `printFolderPath(childObject, childFolderName)` — walk up parent chain, return `/`-separated path
- `deleteEmptyFolders(folderObj, level, folderPath)` — recursively delete empty subfolders

**Usage:**
```js
const ArchiFolders = require(REPO_ROOT + "_lib/archi_folders.js");

// Create nested folder structure
const targetFolder = ArchiFolders.getFolderPath("Strategy/Capabilities/MyDomain");
// Navigates through folders, creating as needed

// Print where a concept is located
const path = ArchiFolders.printFolderPath(element, element.name);
console.log("Element is in: " + path);
```

### `doEach.js`
Bendpoint geometry and connection layout (GraalVM only).

**Exports:**
- `doEachElem(function)` / `doEachRel(function)` — decorator to apply function to every element or relation in selection (recurses into view children)
- `addAbsoluteBendpoint`, `setAbsoluteBendpoint`, `getAbsoluteBendpoints` — absolute-coordinate bendpoint helpers
- `getObjXY(obj)` — return `{ x, y, w, h }` of visual object including parent offsets
- `isInsideObj`, `isBetween` — geometry predicates
- `lRel`, `sRel` — create L-shaped or S-shaped orthogonal connections
- `getObjPos`, `getPointPos` — relative position/angle calculations
- `distributeConnections(obj)` — evenly space multiple connections along edges
- `dynamicSort(property)` — comparator factory for `Array.sort`
- `ortho(connection)` — make existing connection fully orthogonal
- `removeBendpoints(connection)` — delete all bendpoints

**Usage:**
```js
const DoEach = require(REPO_ROOT + "_lib/doEach.js");

// Create orthogonal connection
const orthoConn = DoEach.ortho(connection);

// Get absolute bounds
const bounds = DoEach.getObjXY(visualObject);
```

### `includeMergeConcept.js`
Deduplication and concept merging.

**Exports:**
- `mergeConcept(conceptCollection, conceptType, propertyFunction)` — merge each concept with its duplicates
- `PROP_ID` = `"Object ID"` — property key for object identity

**Usage:**
```js
const MergeConcept = require(REPO_ROOT + "_lib/includeMergeConcept.js");

// Merge all duplicate business-actors
const duplicates = $("business-actor");
MergeConcept.mergeConcept(duplicates, "business-actor", function(obj) { /* property logic */ });
```

---

## Loading Modules

### Production Scripts (`.ajs` entry points)

Use `require()` with `REPO_ROOT`:

```js
const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common = require(REPO_ROOT + "_lib/Common.js");
const Selection = require(REPO_ROOT + "_lib/selection.js");
```

### Test Scripts (`_test/` folder)

Old test scripts use `load()` — do not copy this pattern to new scripts:

```js
load(__DIR__ + "../_lib/Common.js");  // old style, avoid
```

Use `require()` instead, even in tests.

---

## jArchi-Specific Rules

Things not obvious from the API reference:

### 1. Always Check if Model is Set

Before accessing the global `model`, guard with `model.isSet()` to avoid the "Could not get the currently selected model" exception:

```js
if (!model.isSet()) {
  console.error("No model selected");
  exit();
}
// Now safe to use model
```

### 2. Use `getSelection()` / `getVisualSelection()` from `selection.js`

Raw `$(selection)` is unreliable:

```js
// Bad:
var elements = $(selection).filter("element");

// Good:
const Selection = require(REPO_ROOT + "_lib/selection.js");
var elements = Selection.getSelection(selection, "element");
```

The helper handles:
- Expanding view references to concepts
- Auto-expanding single selections
- Filtering diagram-model-* types consistently

### 3. Collections Use `.each()`, Not `.forEach()`

jArchi collections are not JS arrays. The `.forEach()` method doesn't exist:

```js
// Bad:
$("element").forEach(el => { });  // TypeError: collection.forEach is not a function

// Good:
$("element").each(el => { });
```

The contract is the same, but use the right method name.

### 4. Visual Object Move (jArchi 1.10+)

Moving a VO to a new parent doesn't require delete-and-recreate. Use the move API:

```js
// Move vo to a new parent at position (x, y) relative to parent
newParentVO.add(existingVO, x, y);
existingVO.bounds = { x: x, y: y, width: w, height: h };
```

This is **non-destructive** — no cascade-deletion, no loss of visual children or connected relations.

### 5. Cascade-Deletion: `vo.delete()` is Destructive

Calling `vo.delete()` on a visual object deletes:
- The VO itself
- All visual children (recursively)
- All VisualRelations that reference the VO as source or target

Use `vo.delete(false)` (since jArchi 1.8) to delete while keeping children:

```js
// Delete container, keep children
container.delete(false);

// Delete and cascade
element.delete();  // or vo.delete(true)
```

### 6. Java String Coercion

Model objects return Java strings. Before using them as JS object keys, coerce to JS:

```js
const el = model.createElement("business-actor", "Test");
const type = String(el.type);  // "business-actor" (JS string)

// Safe to use in JS operations:
if (type.includes("actor")) { }
```

Without coercion, property lookups can fail on complex operations.

### 7. Model Change Tracking

Changes made via jArchi scripts are added to the Undo stack if the model is open in the UI. Running scripts on a closed model (batch processing) doesn't trigger UI updates; call `view.openInUI()` or `model.openInUI()` after changes if you want to see them immediately.

---

## Fixed Vocabulary

Stable terms used in code, UI labels, and all documentation. No synonyms.

| Canonical term | Do NOT use |
|---|---|
| Element | node, box, item |
| Relation | edge, link, connection |
| Nesting | grouping, hierarchy config |
| Container | group, box, region |
| Layout | structure engine, positioning |
| Elements & relations | nodes & edges |
| Nesting rules | grouping rules, hierarchy rules |

---

## Repo Structure

| Folder | Domain |
|---|---|
| Scripts/ (root) | Frequently-used utilities: merge, reverse, add properties, link to view |
| Scripts/Appearance/ | View formatting: color by property, reset format, toggle figure display |
| Scripts/Beheren/ | Bulk model management: delete unused elements/folders, find duplicates |
| Scripts/Convert to/ | Change ArchiMate element type |
| Scripts/Develop/ | Script development aids: display IDs and color codes in views |
| Scripts/GEMMA/ | GEMMA model management |
| Scripts/ImportExport_CSV/ | Bidirectional CSV sync |
| Scripts/Layout/ | Visual relation layout: star-shaped bendpoints, spread overlapping relations |
| Scripts/Report/ | Markdown report generation from views |
| Scripts/Sync from CSV/ | Bulk object creation and update from CSV |
| Scripts/View/ | Automated view generation with graph layout (ELK, Dagre, Graphviz) |
| Scripts/_lib/ | Shared utilities: Common.js (logging), selection.js, vendored libraries |
| Scripts/_test/ | Test and validation scripts |
| Scripts/node_modules/ | Vendored dependencies (dagre, ELK, chroma-js, papaparse, showdown, underscore) |

Dependency rule: any script may depend on `Scripts/_lib/`. Domain folders do not depend on each other.

---

## Project Context

archi-scripts extends Archi (Enterprise Architecture modeling tool) with automated scripting via jArchi.

**Domains:** view generation, export/import, reporting, appearance/styling, merging, model analysis.

**Runtime constraints:**
- Runtime: jArchi plugin on GraalVM (not Node.js)
- Module system: CommonJS via require()
- No Node.js APIs — no fs, path, or process
- Java interop: Java.type(), Java.extend()
- File I/O: java.io.* or java.nio.file.*
- All scripts live under Scripts/; each subfolder is an independent domain

---

## Testing Strategy

No automated test framework — GraalVM/jArchi does not support Node test runners. All testing is manual: run scripts inside Archi.

**Test structure:**
1. Select representative model elements in Archi
2. Run script via Script Manager or _GUI.ajs
3. Verify: view generation, layout, element positions, console output

**Regression:** test the golden path (typical selection) + edge cases (empty selection, single element, deeply nested structures) after each change.

**Debug mode:** set `debug: true` in preset or via GUI to inspect intermediate graph state. ELK graph JSON is logged before and after layout when debug is on.

**Mocking:** no mocking framework. Use small isolated test diagrams in the Archi model.

---

## Coding Standards

### Modules & Loading
- CommonJS: use `require()` and `module.exports`
- Require variables: PascalCase (`const Common = require(...)`)
- Use explicit namespaces: `Common.debug()`, not bare `debug()`
- No npm; vendor in `Scripts/node_modules/` if needed
- Always use `REPO_ROOT` for relative requires

### Function Naming
- Functions: camelCase verbs (`generateView`, `buildGraph`)
- Engine-specific: suffix with engine name (`_buildGraphELK`, `_drawViewDagre`)
- Constants: UPPER_SNAKE_CASE
- Private: underscore prefix (`_helper`), not exported

### Logic Rules
- One verb per function — if the name needs "and", split it
- Target <= 30 lines
- Return one value; two results → return `{ key: value }`
- Guards in caller, not inside extracted function
- No duplication until you have three identical lines (then extract)

### Error Handling
- Validate at system boundaries only (user input, external APIs)
- Trust internal code and framework guarantees
- No fallbacks for scenarios that can't happen

### Java Interop
- Always `Java.type('java.lang.String')`, never bare `java.lang.String`
- Coerce Java strings: `String(javaString)`
- Java objects are not JS — don't spread or iterate with `for..in`

### Logging
- `Common.debug()` for diagnostic output
- `console.log()` only for user-facing progress messages

---

## Minimal Script Template

```js
"use strict";

const REPO_ROOT = (() => { const p = __DIR__.replace(/\\/g, "/"), i = p.indexOf("/Scripts/"); return p.substring(0, i === -1 ? p.length : i + 9); })();
const Common = require(REPO_ROOT + "_lib/Common.js");
const Selection = require(REPO_ROOT + "_lib/selection.js");

try {
  console.clear();
  console.show();
  Common.initConsoleLog(__FILE__, true);

  // Guard: model must be set
  if (!model.isSet()) {
    console.error("No model selected");
    return;
  }

  // Your logic here
  const elements = Selection.getSelection(selection, "element");
  console.log("Processing " + elements.size() + " elements");
  elements.each(el => {
    Common.debug("Element: " + el.name);
  });

  Common.finishConsoleLog();
} catch (error) {
  console.error("Error: " + error);
  if (error.stack) console.error(error.stack);
}
```

---

## Verification Checklist

Before submitting a script:
- [ ] `REPO_ROOT` defined locally in every file that uses it
- [ ] Dependencies loaded via `require(REPO_ROOT + "_lib/...")`, not `load()`
- [ ] Model guarded with `model.isSet()` before use
- [ ] Selection handled via `Selection.getSelection()`, not raw `$(selection)`
- [ ] Collection iteration uses `.each()`, not `.forEach()`
- [ ] No Java strings used without `String()` coercion
- [ ] Error messages use `Common.debug()` or `console.log()`, not bare `log`
- [ ] Functions are named with active verbs (no "and")
- [ ] No hardcoded file paths — use `REPO_ROOT`

---

## References

- **Complete API:** `jarchi-api-reference.md` (this folder)
- **GraalJS Compatibility:** `graaljs-compatibility.md` (this folder)
- **Java Interop:** `java-interop.md` (this folder)
- **jArchi Wiki:** https://github.com/archimatetool/archi-scripting-plugin/wiki
