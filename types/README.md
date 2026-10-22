# Static type checking

The scripts stay plain JavaScript (CommonJS, GraalJS). TypeScript is used only as a checker:
JSDoc annotations in the code, `tsc --noEmit` over them. Nothing is compiled or generated, and
the scripts still run straight from a clone without npm.

## Run

```sh
npm ci              # once: installs the pinned typescript (devDependency, root package.json)
npm run typecheck   # tsc -p jsconfig.json — exit 0 = no findings
```

VS Code shows the same findings while editing (it reads `jsconfig.json`). The pinned version
(`typescript` 6.0.3) is the one VS Code bundles, so editor and command line agree.

CI (`.github/workflows/check.yml`) runs `npm ci`, the typecheck and the Node tests
`rel_filter_test.js` and `nesting_test.js` on every push and pull request (Node 22). It checks the
scope below only; a script outside it is not checked.

## What is checked

| Scope (`jsconfig.json` › `include`) | Why |
|---|---|
| `Scripts/View/lib/*.js`, `Scripts/View/lib/engines/*.js` | View subsystem: pipeline, writer, adapters |
| `Scripts/View/lib/gui/*.js` | View dialog (SWT / JFace) |
| `Scripts/_lib/Common.js`, `archi_folders.js`, `selection.js` | Shared modules the View code loads |

Not checked: `.ajs` entry scripts (tsc does not read that extension; keep them thin),
`View/tools/` (Node), other folders, and the
vendored libraries in `Scripts/node_modules/` (`maxNodeModuleJsDepth: 0`).

Settings: `strict` (no implicit `any`, null checks), ES2022 target, no DOM library, no Node types.

## Where the types come from

| File | Contents | Source |
|---|---|---|
| `ai/jarchi-scripting/jarchi.d.ts` | jArchi globals, collections, proxies, console, dialogs, constants, ArchiMate type names | jArchi plugin source (dom/model, dom/ui, js/init.js) and Archi's `archimate.ecore` |
| `types/view.d.ts` | Rules, presets, algorithm specs, pipeline shapes | `Scripts/View/lib/rel_filter.js`, `defs.js`, `selection_pipeline.js`; SPEC § Vocabulary |
| `types/layout.d.ts` | `LayoutGraph` → `LayoutResult` engine contract, nesting resolution | SPEC §8 and the adapters |
| `types/vendor.d.ts` | The members used of dagre-cluster-fix, elkjs (sync wrapper), chroma-js, Graphviz `-Tjson` | Library docs; only what the code uses |
| `types/swt.d.ts` | The SWT / JFace members the dialog uses, as `Java.type("<class>")` overloads | SWT and JFace Javadoc; only what the code uses |

`@remarks unverified` on a member means it comes from source or docs but has not been observed
in a running Archi. `Scripts/Develop/probeJArchiApi.ajs` checks those points: run it in Archi and
update the remarks.

## Writing checked code

- **Imports.** The scripts load modules with `require(REPO_ROOT + "…")`, a path tsc cannot follow.
  Put the module's type on the line above:
  `/** @type {typeof import("./defs")} */` then `const Defs = require(REPO_ROOT + "View/lib/defs");`
- **Functions.** `@param` / `@returns` on every function; shared shapes go in `types/*.d.ts`,
  named as in SPEC § Vocabulary. A shape that only one module uses can be a `@typedef` there.
- **Casts** (`/** @type {X} */ (expr)`) are assertions, not conversions: they change nothing at
  run time and switch the check off for that expression. Prefer, in this order: annotate the
  declaration; a `@typedef` / `@param`; a cast with a one-line reason; `// @ts-expect-error -- reason`
  only for a checker limitation. Never change executable code just to satisfy the checker.
- **Object maps.** Rule, preset and params shapes are type aliases (not interfaces) so code that
  reads them by key can view them as `Record<string, unknown>`.
- **Java classes.** `Java.type("<class>")` is typed for the classes listed in `types/swt.d.ts`
  and `any` for every other class. A class the code starts to use gets a minimal entry there (the
  members it calls); a Java value that stays `any` gets its type on the receiving declaration.
- **jArchi duck typing.** A proxy without a member reads it as `undefined`; the typings say so
  (`view?: undefined` on concepts, `bounds?: undefined` on connections), so `if (o.view)` narrows
  to visuals without a cast.

## Proving a change is annotation-only

- `node tools/same-code.js [--rev <git rev>] <file…>` — SAME when the file's executable code equals
  that revision (default `HEAD`) once comments and cast parentheses are removed; DIFF shows the
  first differing line.
- `node tools/compare-layouts.js <checkout> <model.archimate> "<view path>" [preset.json…]` —
  one layout digest per preset × algorithm; run it on two checkouts (`git worktree add`) and diff.

## Possible simplification: relative requires

The probe showed that `require("./x")` inside a module resolves next to that module. Requiring
`View/lib` siblings by relative path (`require("./defs")`) instead of `REPO_ROOT + "…"` would let tsc
follow the imports, and the `/** @type {typeof import(…)} */` lines could go. Entry `.ajs` scripts
keep `REPO_ROOT` (they resolve against the scripts folder). Not done: it changes how modules load,
so it needs its own change and a run in Archi.

## Extending the scope

1. Add the file (or a glob) to `include` in `jsconfig.json`.
2. Annotate its `require` lines and functions until `npm run typecheck` passes.
3. A module it loads is checked as soon as the `typeof import` annotation points at it, so bring
   modules in from the bottom of the dependency tree up.

## Limits

A passing check does not show that a script works in Archi. It does not cover: what jArchi does at
run time where the typings are `unverified`; Java interop beyond the listed classes (`Java.type`
results are `any`, `Java.super` too); SWT behaviour; the `.ajs` entry scripts; data read from files
(preset JSON is typed `PresetFile`, the validation boundary). Run the script in Archi, and the Node
harness (`Scripts/View/tools/`), as before.

Upgrading TypeScript: TypeScript 7 (the native compiler) changed parts of its JavaScript/JSDoc
support. Move the pin only together with VS Code's bundled version, and re-run the check.
