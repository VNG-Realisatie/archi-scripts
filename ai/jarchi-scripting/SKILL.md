---
name: jarchi-scripting
description: Use when writing or changing jArchi scripts for Archi (.ajs files, CommonJS modules run by jArchi), using the jArchi API ($, collections, model, views, visual objects), GraalJS / Java interop (Java.type, Java.extend), or SWT / JFace dialogs in jArchi.
---

# jArchi scripting

**Runtime.** jArchi 1.12 runs scripts in GraalJS (ECMAScript 2024) through JSR-223 with
nashorn-compat. Modules: CommonJS `require` (preference "Enable CommonJS", jArchi ≥ 1.6). No
Node APIs, no timers, no event loop — work synchronously; Java via `Java.type`. Java getters
read as properties (`vo.fillColor`), Java lists are array-like.

## Pitfalls

1. **A collection is a `java.util.ArrayList`, not an array**: `each`, `filter`, `first`, `size`, `get`; no `map`/`reduce`. `each` ignores the return value — `return false` does not stop it.
2. **`.find()` = every descendant**, not `Array.find`; `.children()` = direct children only.
3. **Selectors keep their side**: on a view or visual, `"element"` / `"relation"` select *visuals*; in the model, *concepts*. `$("#id")` and `$("*")` can return visuals too.
4. **`add(collection)` changes the receiver** (and returns it), though the plugin source comments "new collection".
5. **Concept ↔ visual**: `vo.concept` (null for notes, groups); `$(concept).objectRefs()` / `.viewRefs()`.
6. **Guard `model.isSet()`** (≥ 1.9) before touching the global `model`.
7. **`vo.delete()` cascades** to children and connections; `vo.delete(false)` keeps the children (≥ 1.8).
8. **Move, don't recreate**: `newParent.add(vo, x, y)` re-parents a visual with its children and connections (≥ 1.10).
9. **`bounds` reads a copy** — assign a whole or partial object (`vo.bounds = { x, y }`); width/height −1 = default size.
10. **Missing members read as `undefined`** (`concept.view`, `connection.bounds`) — usable to tell visuals from concepts and boxes from lines.
11. **`console` is the jArchi Script Console**: `log`, `error`, `clear`, `show`, … — no `warn`/`info`; `error()` takes one argument.
12. **Modal SWT dialog**: no console output inside its handlers (it blocks until close); open child dialogs on `dlg.getShell()`, not `shell`.
13. **`prop(key, true)`** returns all values (a list) or null; `prop(key)` the first value or null.
14. **`view.viewpoint`** reads `{ id, name }`; assign an id string. **`fillColor`** reads the effective colour (≥ 1.11); assign null to reset.
15. **Relationship ends can be relationships** (`rel.source` / `rel.target`) — check `.type` before treating an end as an element.
16. **`exit()`** stops the script by throwing; Archi shows "Exited".
17. **Undo and UI**: changes to a model open in Archi go on its undo stack; changes to a model only loaded by the script are not shown until `model.openInUI()` / `view.openInUI()`.

## Where to look

| File | Read when |
|---|---|
| `jarchi.d.ts` | Any API question: members, signatures, constants, ArchiMate type names. Derived from the plugin source; `@remarks unverified` = not yet observed in Archi |
| `graaljs-java.md` | `Java.type` / `Java.extend`, Java lists and maps, overloads, files, external processes |
| `swt-gtk.md` | Building dialogs with SWT / JFace (GTK behaviour, fonts, layouts, `TitleAreaDialog`) |
| [Plugin wiki](https://github.com/archimatetool/archi-scripting-plugin/wiki) | Examples and prose; where it disagrees with `jarchi.d.ts`, the plugin source decides |

## Version notes

- 1.10 move API `add(vo, x, y)` · 1.9 `model.isSet()` · 1.8 `delete(false)`, `lineStyle`, `duplicate()`; **removed** `exec()` → `$.child_process.exec()`, `getArgs()` → `$.process.argv`
- 1.7 `parents()`, z-order, SVG/PDF options · 1.6 CommonJS · 1.3 `IMAGE_POSITION.CENTER` (not `CENTRE`)
- 1.0 type names `note` → `diagram-model-note`, `group` → `diagram-model-group`
