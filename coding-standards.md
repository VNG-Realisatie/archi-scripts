# Coding standards

## Modules
- CommonJS: require() / module.exports
- PascalCase for require variables: `const View = require(...)`
- Use explicit namespaces: `Common.debug()`, not bare `debug()`
- No npm; vendor dependencies in `Scripts/node_modules/`
- Use `__DIR__` for path resolution in require()

## Naming
- Functions: camelCase verbs (`generateView`, `buildGraph`)
- Engine-specific functions: suffix with engine name (`_buildGraphELK`, `_drawViewDagre`)
- Constants: UPPER_SNAKE_CASE
- Private functions: underscore prefix (`_helper()`), not exported
- Name changes are carried through integrally across all files; no compat shims or aliases. Logic changes are conservative: rename only, do not refactor behaviour in the same step.

## Function rules
- Single responsibility: one verb per function — if the name needs "and", split it
- Target ≤ 30 lines; a function that exceeds this probably tells two stories
- Named inner closures belong at module scope, not defined inside a calling function
- Return one value; if a block produces two results, return a small `{ key: value }` object
- Guards after a function call stay in the caller, not inside the extracted function
- Private functions: prefix `_`, not in module.exports
- Public functions: standard naming, explicitly listed in module.exports

## DRY
- Extract repeated logic only when it has a clear name
- Three similar lines is better than a premature abstraction

## Java interop
- Always use `Java.type()` for Java class references
- Coerce Java strings to JS with `String()` before property lookups
- Java objects are not plain JS — do not spread or use for..in

## Logging
- `Common.debug()` for internal diagnostic output
- `console.log()` only for user-facing progress messages

## Error handling
- Validate at system boundaries only (user input, external APIs)
- Trust internal code and framework guarantees
- No fallbacks for scenarios that cannot happen
