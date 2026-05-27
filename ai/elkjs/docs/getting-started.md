# Installation & API

## Installation

```bash
npm install elkjs
```

Development version (ELK master branch):
```bash
npm install elkjs@next
```

## Files

- `elk-api.js` — API only (pair with `elk-worker.js` for Web Worker usage)
- `elk-worker.js` — Layout engine (GWT-transpiled from Java ELK)
- `elk.bundled.js` — Bundled version of both, exposes global `ELK` in browsers
- `main.js` — Node.js entry point (`require('elkjs')`)

## Constructor

```js
const ELK = require('elkjs')
const elk = new ELK(options)
```

Options (all optional):
- `defaultLayoutOptions` — object of key-value pairs applied to every `layout()` call unless overridden. Default: `{}`
- `algorithms` — array of algorithm ID suffixes to include. Default: `['layered', 'stress', 'mrtree', 'radial', 'force', 'disco']`. The `box`, `fixed`, and `random` algorithms are always included.
- `workerUrl` — path to `elk-worker.js` to use a Web Worker for layout. Default: `undefined` (no worker)

## layout(graph, options)

```js
elk.layout(graph, options)
   .then(layoutedGraph => { /* ... */ })
   .catch(err => { /* ... */ })
```

**Parameters:**
- `graph` — ELK JSON graph object (see `json-format.md`). **Mandatory.**
- `options` — optional configuration object:
  - `layoutOptions` — global layout options applied to every element unless the element specifies the option itself
  - `logging` — `boolean` (default `false`). Return logging info as part of the result.
  - `measureExecutionTime` — `boolean` (default `false`). Return execution time (in seconds) as part of the result.

**Returns:** A `Promise` that resolves with the laid-out graph (same structure, with `x`, `y`, `width`, `height` populated on nodes/ports/labels, and `sections` on edges).

### Global Layout Options

Three ways to set layout options, in order of precedence (highest first):
1. `layoutOptions` on individual graph elements
2. `layoutOptions` in the `layout()` call's second argument
3. `defaultLayoutOptions` in the `ELK` constructor

```js
// Constructor defaults
const elk = new ELK({
  defaultLayoutOptions: { 'elk.algorithm': 'layered' }
})

// Per-call globals
elk.layout(graph, {
  layoutOptions: { 'elk.direction': 'RIGHT' }
})

// Per-element (highest priority)
const graph = {
  id: 'root',
  layoutOptions: { 'elk.algorithm': 'stress' },
  children: [/* ... */]
}
```

## Other Methods

- `knownLayoutOptions()` — returns array of known layout options with metadata (`id`, `group`, etc.)
- `knownLayoutAlgorithms()` — returns array of registered algorithms with metadata
- `knownLayoutCategories()` — returns array of registered layout categories
- `terminateWorker()` — calls the Web Worker's `terminate()` method (if a worker is in use)

## Web Worker Setup

### Node.js (without worker)
```js
const ELK = require('elkjs')
const elk = new ELK()
elk.layout(graph).then(console.log)
```

### Node.js (with worker)
```js
const ELK = require('elkjs')
const elk = new ELK({
  workerUrl: './node_modules/elkjs/lib/elk-worker.min.js'
})
elk.layout(graph).then(console.log)
```

Requires the `web-worker` npm package (a wrapper around Node's `worker_threads`). Not installed automatically — elkjs falls back to non-worker mode with a warning if missing.

### Browser (bundled)
```html
<script src="./elk.bundled.js"></script>
<script>
  const elk = new ELK()
  elk.layout(graph).then(g => console.log(g))
</script>
```

### Browser (with worker)
```html
<script src="./elk-api.js"></script>
<script>
  const elk = new ELK({ workerUrl: './elk-worker.js' })
  elk.layout(graph).then(g => console.log(g))
</script>
```

### TypeScript
```ts
import ELK from 'elkjs/lib/elk.bundled.js'
const elk = new ELK()
```

```ts
import ELK from 'elkjs/lib/elk-api'
const elk = new ELK({ workerUrl: './elk-worker.min.js' })
```

## Logging & Execution Times

```js
elk.layout(graph, {
  layoutOptions: { 'algorithm': 'layered' },
  logging: true,
  measureExecutionTime: true
})
```

Result includes a `logging` object:
```js
{
  "id": "root",
  "children": [ /* ... */ ],
  "logging": {
    "name": "Recursive Graph Layout",
    "executionTime": 0.000096,
    "children": [{
      "name": "Layered layout",
      "logs": [
        "ELK Layered uses the following 17 modules:",
        "   Slot 01: org.eclipse.elk.alg.layered.p1cycles.GreedyCycleBreaker",
        // ...
      ],
      "executionTime": 0.000072,
      "children": [
        { "name": "Greedy cycle removal", "executionTime": 0.000002 },
        // ...
      ]
    }]
  }
}
```

Execution times are in **seconds** (internally milliseconds in JS, unlike nanoseconds in Java ELK). Small graphs may report `0`.

## Debugging

Use non-minified versions for proper stack traces:
```js
const ELK = require('elkjs/lib/elk-api.js')
const elk = new ELK({
  workerFactory: function(url) {
    const { Worker } = require('elkjs/lib/elk-worker.js') // non-minified
    return new Worker(url)
  }
})
```

## Basic Example

```js
const ELK = require('elkjs')
const elk = new ELK()

const graph = {
  id: "root",
  layoutOptions: { 'elk.algorithm': 'layered' },
  children: [
    { id: "n1", width: 30, height: 30 },
    { id: "n2", width: 30, height: 30 },
    { id: "n3", width: 30, height: 30 }
  ],
  edges: [
    { id: "e1", sources: ["n1"], targets: ["n2"] },
    { id: "e2", sources: ["n1"], targets: ["n3"] }
  ]
}

elk.layout(graph)
   .then(console.log)
   .catch(console.error)
```
