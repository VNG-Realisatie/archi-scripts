# Refactoring Guide for JArchi Scripts

This guide outlines the standards for refactoring and writing new JArchi scripts in this repository.

## 1. Module System: CommonJS

All scripts must use the CommonJS module system.

*   **Explicit Exports**: Use `module.exports = { func1, func2 }` to export functions and constants.
*   **No Global Mixins**: Do not use the pattern that copies exports to the global scope (`function(g) { ... }`).

## 2. Dependency Management

*   **Explicit Requires**: Load dependencies using `const Module = require(...)`.
    *   **Naming Convention**: Use **PascalCase** for the variable name assigned to the require (e.g., `const Showdown = require("showdown")`, `const Common = require(...)`).
*   **Absolute Paths**: Always use `__DIR__` for robust path resolution.
    *   Example: `const Common = require(__SCRIPTS_DIR__ + "Scripts/_lib/Common.js");`
*   **No NPM**: Do not use `npm` to manage runtime dependencies.
    *   **Manual Vendoring**: Download third-party libraries (e.g., from unpkg.com) and place them in `Scripts/node_modules/<package>/index.js`.
    *   This ensures scripts are self-contained and run in Archi without requiring a system Node.js installation.

## 3. Global Scope and Environment

*   **Avoid Global Pollution**: Do not assign variables to `global`, `window`, or `this` unless strictly necessary for polyfills.
*   **Archi Globals**: It is acceptable to use Archi's built-in globals like `model`, `selection`, `$`, and `window` (for prompts).

## 4. Java Integration

*   **Explicit Types**: Use `Java.type()` or `new package.Class()` explicitly.
*   **No `with()`**: Avoid `with(JavaImporter(...))` as it obscures dependencies and is deprecated.

## 5. File Structure

*   **Helper Scripts**: Should remain in their relevant directories (e.g., `Scripts/_lib` or `Scripts/ImportExport_CSV`).
*   **Consumer Scripts**: Scripts runnable from the Archi UI should be typically located in the feature folder (e.g., `Scripts/ImportExport_CSV/import.ajs`).
