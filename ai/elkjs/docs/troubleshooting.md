# Troubleshooting & Gotchas

## Common Issues

### "g is not defined" Error

This is a known GWT transpilation issue. The underlying ELK code is transpiled from Java to JavaScript using GWT, which can cause issues with certain bundlers.

**Fix:** Check your bundler configuration. If using webpack, you may need to adjust module resolution settings. See [elkjs#127](https://github.com/kieler/elkjs/issues/127).

### "Can't resolve web-worker"

When using Web Workers with bundlers like webpack, the `web-worker` package may not resolve correctly.

**Fix for node.js:** Install `web-worker` manually:
```bash
npm install web-worker
```

**Fix for bundlers:** Use the bundled version (`elk.bundled.js`) or configure your bundler to handle the worker file. See [elkjs#141](https://github.com/kieler/elkjs/issues/141), [elkjs#142](https://github.com/kieler/elkjs/issues/142).

### React/Webpack/Vite Integration Issues

elkjs's module system is somewhat outdated due to GWT transpilation.

**Workarounds:**
- Use `elkjs/lib/elk.bundled.js` for the simplest import path
- For TypeScript: `import ELK from 'elkjs/lib/elk.bundled.js'`
- If using Web Workers with a bundler, use `workerFactory` instead of `workerUrl`:
```js
const ELK = require('elkjs/lib/elk-api.js')
const elk = new ELK({
  workerFactory: function(url) {
    const { Worker } = require('elkjs/lib/elk-worker.js')
    return new Worker(url)
  }
})
```

### Layout produces unexpected results / no visible change

1. **Check node dimensions:** Nodes must have `width` and `height` set before layout. ELK does not auto-size nodes.
2. **Check algorithm:** Ensure `elk.algorithm` is set. Without it, ELK may use the default algorithm which may not suit your graph.
3. **Check `layoutOptions` placement:** Options on the wrong element have no effect. Most algorithm-level options go on the root/parent node.

### Labels overlap or are positioned incorrectly

**ELK does not estimate text size.** You must set `width` and `height` on all labels manually:
```json
{
  "text": "My Label",
  "width": 60,
  "height": 15
}
```

Without dimensions, labels are treated as zero-size and will overlap other elements.

### Edges connect to wrong positions

- Check that port IDs in `sources`/`targets` match actual port `id` values
- For port-based edges, ensure `elk.portConstraints` is set appropriately (at least `FIXED_SIDE`)
- Remember: edge coordinates in the output are relative to the edge's container (lowest common ancestor of endpoints), not the source/target node

### Node positions are all zero or overlapping

- Ensure you're reading the resolved `x`/`y` from the Promise result, not the original graph object (elkjs mutates the input graph in-place)
- Check that `elk.spacing.nodeNode` is set to a non-zero value
- If using hierarchical graphs, check `elk.hierarchyHandling`

## Layout Option Mistakes

### Using wrong option key format

```json
// WRONG - missing elk. prefix, may be ambiguous
{ "algorithm": "layered", "direction": "RIGHT" }

// CORRECT - use elk. prefix
{ "elk.algorithm": "layered", "elk.direction": "RIGHT" }

// ALSO CORRECT - full identifier
{ "org.eclipse.elk.algorithm": "layered", "org.eclipse.elk.direction": "RIGHT" }
```

### Using `source`/`target` instead of `sources`/`targets`

```json
// WRONG - legacy primitive edge format
{ "id": "e1", "source": "n1", "target": "n2" }

// CORRECT - extended edge format
{ "id": "e1", "sources": ["n1"], "targets": ["n2"] }
```

### Setting spacing as numbers instead of strings

Both work in elkjs — layout option values can be strings or appropriate JS types:
```json
{
  "elk.spacing.nodeNode": "40",
  "elk.spacing.nodeNode": 40
}
```

### Expecting edge routing without port constraints

When using ports, set `elk.portConstraints` to at least `FIXED_SIDE` for meaningful edge routing:
```json
{
  "layoutOptions": {
    "elk.portConstraints": "FIXED_SIDE"
  }
}
```

Without port constraints, the algorithm places ports freely, which may not match your visual expectations.

### Spacing seems to affect the wrong axis

For left-to-right layouts (`elk.direction: RIGHT`), the layered algorithm creates **vertical** layers. This means:
- `elk.spacing.nodeNode` controls **vertical** spacing (within a layer)
- `elk.layered.spacing.nodeNodeBetweenLayers` controls **horizontal** spacing (between layers)

This is counterintuitive. The `*BetweenLayers` options always control the spacing in the **layout direction**, while the base spacing options control the perpendicular axis. For `DOWN` direction, the axes are transposed.

### Node is too small for its ports

If ports are squeezed together on a node, you need to enable auto-sizing:
```json
{
  "layoutOptions": {
    "elk.nodeSize.minimum": "(40, 40)",
    "elk.nodeSize.constraints": "[PORTS, MINIMUM_SIZE]"
  }
}
```

Without `PORTS` in `nodeSize.constraints`, the algorithm won't enlarge a node to fit its ports — it just squeezes them.

### Inside self-loops: node size ignored

When `elk.insideSelfLoops.activate` is `true`, ELK internally converts the node to a hierarchical node. This means setting `width`/`height` directly won't work. You must use `nodeSize.minimum` and `nodeSize.constraints: "MINIMUM_SIZE"` instead.

### Mixed directions require SEPARATE_CHILDREN

If you want different `elk.direction` values for different hierarchy levels, you **must** set `elk.hierarchyHandling: "SEPARATE_CHILDREN"` on the child node with the different direction. Otherwise, `INCLUDE_CHILDREN` forces the parent direction everywhere.

### Disconnected components laid out separately

By default (`elk.separateConnectedComponents: true`), disconnected components are laid out independently and then packed together using `elk.box`. Control spacing between them with `elk.spacing.componentComponent`.

## Coordinate System Confusion

### Edge coordinates reference the container, not the source node

By default, edge bend points and section coordinates are relative to the edge's **container** (lowest common ancestor of all endpoints). For simple same-level edges, this is the parent node. For hierarchy-crossing edges, it's a higher ancestor.

If coordinates seem offset, check `org.eclipse.elk.json.edgeCoords` — you can set it to `PARENT` or `ROOT` for easier interpretation.

### Node coordinates are relative to parent

Node `x`/`y` values are relative to their parent node, not the root. To get absolute coordinates, accumulate parent offsets up the hierarchy.

## Performance

### Layout is slow for large graphs

- Reduce `elk.layered.thoroughness` (default `7`, lower = faster)
- Use Web Workers to avoid blocking the UI thread
- Consider simpler algorithms (`force`, `stress`) for very large graphs where layered quality isn't needed
- Reduce `elk.force.iterations` (default `300`) for force-directed layouts

### Web Worker not improving performance

- Verify the worker is actually being used (check for the "web-worker not installed" warning in console)
- For node.js: install the `web-worker` package
- Web Workers have overhead for small graphs — benefit shows for larger layouts

## Dynamic / Interactive Layout

- elkjs does **not** natively support incremental layout (adding nodes/edges to an existing layout). You must re-run layout on the full graph. See [elkjs#100](https://github.com/kieler/elkjs/issues/100).
- Standalone edge routing (computing routes without repositioning nodes) is not supported. See [elk#315](https://github.com/eclipse/elk/issues/315).
- elkjs is a **layout engine only** — no rendering, styling, or interaction. Use a diagramming framework (sprotty, reaflow, reactflow, cytoscape with elkjs adapter) for the visual layer. See [elkjs#85](https://github.com/kieler/elkjs/issues/85).

## Versioning

elkjs versions are partly synchronized with ELK: the minor version matches, but patch versions may diverge. For example, elkjs 0.3.2 may differ from ELK 0.3.2 since elkjs may have independent fixes.
