---
name: jarchi-scripting
description: This skill should be used when the user asks to "write a JArchi script", "create an Archi script", "build an .ajs script", "add a dialog to a script", "use SWT widgets", "create a JFace dialog", "use Eclipse UI in JArchi", "extend a Java class in JavaScript", "use Java.type()", "work with ArchiMate elements", "use the jArchi API", "create a library module", "use GraalJS", mentions JArchi, Archi scripting, ArchiMate modeling scripts, SWT/JFace UI, or GraalVM JavaScript for Archi.
---

# JArchi Script Development

Procedural guide for writing JArchi scripts (GraalVM GraalJS, ECMAScript 2024). Requires Archi 5.8+ and Java 21 (jArchi 1.12+); earlier versions support Archi 5.5+ with jArchi 1.8+.

## Reference Documentation

All documentation is in `ai/jarchi-scripting/`:

- **`jarchi-api-reference.md`** — Complete jArchi API (v0.1–1.12): global objects, collection methods, model API, elements & relationships, views, visual objects, constants, version history with breaking changes
- **`jarchi-script-development.md`** — Repo-specific development guide: REPO_ROOT pattern, available `_lib/` modules (Common, selection, archi_folders, doEach, includeMergeConcept), jArchi-specific rules, coding standards, minimal template
- **`graaljs-compatibility.md`** — GraalJS/ECMAScript 2024 runtime: core features, internationalization, modules, `load()` semantics, global functions, debugging
- **`java-interop.md`** — Java interoperability from GraalVM: `Java.type()`, `Java.extend()`, constructing objects, field/method access, argument conversion, explicit overload selection, arrays, maps, exceptions, promises, multithreading

## Quick Start

1. **For complete API reference**: see `jarchi-api-reference.md`
2. **For repo patterns & conventions**: see `jarchi-script-development.md` (REPO_ROOT, `_lib/` modules, coding standards)
3. **For GraalVM/Java details**: see `graaljs-compatibility.md` and `java-interop.md`

## Key Constraints

- Use `load()` for local files — **never `require()`** (resolves to `node_modules/`)
- No Web Workers, no async I/O, no `setTimeout` (unless shimmed)
- No Node.js modules (`fs`, `path`, `http`) — use `Java.type()` for Java equivalents
- `this` inside `Java.extend()` refers to the Java proxy — use object wrapper pattern (see `jarchi-script-development.md`)
