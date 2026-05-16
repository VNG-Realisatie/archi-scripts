# Copilot adapter — archi-scripts

## Rule priority
1. Shared docs at project root — highest authority
2. `~/.github/copilot/instructions.md` — global defaults (lowest priority)

## Project-specific constraints
- Use `Common.debug()` not `console.log()` for internal diagnostics
- Use `Java.type()` for Java class references; use `__DIR__` in require()
- No Node.js APIs (no fs, path, process)
- CommonJS modules only — no ES module syntax
- No npm dependencies
