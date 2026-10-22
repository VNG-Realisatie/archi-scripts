# GraalJS and Java interop in jArchi

What a script author needs from GraalJS. Source: GraalVM JavaScript docs ("JavaScript
Compatibility", "Java Interoperability"; UPL licence), narrowed to how jArchi runs it.

## How jArchi runs GraalJS

- **Engine:** GraalJS through JSR-223 (`ScriptEngine`) with `nashorn-compat` on and
  `ecmascript-version=latest` (JSProvider.java). Host access is open: Java classes, getters as
  properties, Java lists/maps usable from JS.
- **Language:** ECMAScript 2024 (classes, arrow functions, `let`/`const`, destructuring, spread,
  template literals, `async`/`await`, optional chaining, `??`, `Array.prototype.flat`, `Object.fromEntries`).
- **Modules:** CommonJS `require` when *Preferences › Scripting › Enable CommonJS* is on
  (jArchi ≥ 1.6); `commonjs-require-cwd` = the scripts folder. ES modules (`import`) are not used.
- **No event loop:** no `setTimeout`/`setInterval`. Promise callbacks only run when the engine
  drains its job queue, not while the script waits on them — keep work synchronous (this is why
  the repo's elkjs wrapper is synchronous).
- **No Node APIs:** no `fs`, `path`, `process`, `child_process`, `Buffer`. Use Java (below).
- **Debugging:** `debugger;` statements with Chrome DevTools (jArchi ≥ 1.9; the plugin disables
  it on Linux). Otherwise log with `console.log`.
- **Globals that differ from Node/browsers:** `console` is the jArchi Script Console
  (`log`, `error`, `clear`, `show`, … — no `warn`/`info`/`debug`); `window` is a small set of
  JFace dialogs; `load()`, `exit()`, `__DIR__`, `__FILE__` exist (nashorn-compat). See `jarchi.d.ts`.

## Java classes

```js
const File = Java.type("java.io.File");        // preferred: resolves once, throws if missing
const f = new File(path);
const PI = Java.type("java.lang.Math").PI;      // static field
new (Java.type("java.math.BigDecimal"))("1.1"); // parenthesise Java.type(...) before new
```

`java.io.File` and `Packages.java.io.File` also work (nashorn-compat package roots) but resolve
lazily and treat a typo as a package; use `Java.type`.

| Function | Use |
|---|---|
| `Java.type(name)` | Class object: `new`, static members. `"int[]"` gives an array type |
| `Java.from(javaListOrArray)` | Shallow copy into a JS array (often unnecessary — Java lists are array-like) |
| `Java.to(jsArray, "java.lang.String[]")` | JS array → Java array (default `Object[]`) |
| `Java.extend(Type, …)` / `Java.super(obj)` | Subclass / implement (below) |
| `Java.isJavaObject(v)`, `Java.isType(v)`, `Java.typeName(v)` | Inspect host values |

## Calling Java

- **Arguments:** JS numbers are doubles. Widening is fine; a lossy conversion (`1.1` to an `int`
  parameter) throws `TypeError`.
- **Overloads:** the narrowest lossless match wins. Force one with
  `obj["method(java.lang.String,int)"](a, b)` (fully qualified types, no spaces). Constructors
  cannot be selected this way. Ambiguous calls throw "Multiple applicable overloads found".
- **Arity:** calling a Java method with the wrong number of arguments throws
  (`Arity error - expected: 1 actual: 3` for `console.error("a", b, c)`); use a template string.
- **Java strings** are JS strings in GraalJS: `typeof element.type` is `"string"`, usable as an
  object key without `String()`. `String(x)` remains a harmless way to stringify any host value.
- **Getters/setters** read and write as properties (`file.getName()` or `file.name`; jArchi's
  `getBounds()` is `vo.bounds`).
- **Exceptions** from Java are catchable; `e.getMessage()` works on a Java exception, `e.message`
  on a JS error — `String(e)` covers both.

## Java collections from JS

| Java value | From JS |
|---|---|
| `java.util.List` (incl. jArchi collections) | A JS array to GraalJS: `Array.isArray` is true; `length`, `[i]`, `for…of`, spread and `map` work, next to `size()` / `get(i)`. Java's own methods win on a name clash (`forEach`, `add`; jArchi's `filter`, `find`) |
| Java array | `arr.length`, `arr[i]`; create with `new (Java.type("int[]"))(5)` |
| `java.util.Map` | `map.get(k)`, `map.put(k, v)`; `for (k in map)` iterates keys; with nashorn-compat `map.key` reads an entry (jArchi's `vo.bounds.x`). `JSON.stringify(map)` gives `"{}"` — copy the fields into a JS object first |

A jArchi collection is a `java.util.ArrayList` that GraalJS presents as an array, so `map`,
spread and `for…of` work. `filter` and `find` are jArchi's (selectors; `find` = descendants),
`add` is jArchi's / ArrayList's, `forEach` is Java's `Iterable.forEach`.

## Extending Java classes

```js
const Runnable = Java.type("java.lang.Runnable");
const task = new (Java.extend(Runnable))({ run() { console.log("run"); } });
```

`Java.extend(Base, Iface…)` returns an adapter class; pass an object with the methods to
override. `Java.super(instance)` calls the superclass. Inside those methods `this` is the Java
adapter, not your JS object — keep state in closure variables (or an outer object) instead of
`this`. With nashorn-compat, `new Interface({ … })` also implements an interface.

## External processes

There is no `child_process`; use `java.lang.ProcessBuilder`. Read stdout fully before
`waitFor()`, and do not leave stderr unread while doing so — a full stderr pipe blocks the
process. Redirect it to a file and read that afterwards:

```js
const ProcessBuilder = Java.type("java.lang.ProcessBuilder");
const Files          = Java.type("java.nio.file.Files");
const StandardCharsets = Java.type("java.nio.charset.StandardCharsets");
const Arrays         = Java.type("java.util.Arrays");

const errFile = Files.createTempFile("proc", ".err");
const pb = new ProcessBuilder(Arrays.asList("dot", "-Tjson", "-Kdot"));   // a Java List, not a JS array
pb.redirectError(ProcessBuilder.Redirect.to(errFile.toFile()));   // nested class: a property, not Java.type("…Redirect")
let proc;
try { proc = pb.start(); } catch (e) { throw new Error(`"dot" not found on PATH (${e})`); }

const w = new (Java.type("java.io.OutputStreamWriter"))(proc.getOutputStream(), StandardCharsets.UTF_8);
w.write(input); w.close();                                  // close stdin: the process sees EOF
const stdout = String(new (Java.type("java.lang.String"))(proc.getInputStream().readAllBytes(), StandardCharsets.UTF_8));
const code = proc.waitFor();
const stderr = String(Files.readString(errFile)); Files.deleteIfExists(errFile);
if (code !== 0) throw new Error(`Process failed (${code}): ${stderr.trim()}`);
```

`$.child_process.exec(...)` only starts a program (no output, no exit code).

## Files

```js
const Files = Java.type("java.nio.file.Files"), Paths = Java.type("java.nio.file.Paths");
const text = String(Files.readString(Paths.get(path)));     // UTF-8
$.fs.writeFile(path, text);                                 // jArchi helper (optional encoding)
```
