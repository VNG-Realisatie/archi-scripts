# jArchi API Reference (v0.1–1.12)

Complete jArchi API based on the official wiki at https://github.com/archimatetool/archi-scripting-plugin/wiki. Covers jArchi 0.1 (July 2018) through 1.12 (April 2026). Requires Archi 5.8+ and Java 21 (v1.12); earlier versions support older Archi releases (see version history below).

---

## Global Objects & Functions

### `$` / `jArchi()`
The main selector API. Returns an Archi collection.

```js
$(selector?: string | Collection | ArchiConcept): Collection | null
```

**Selectors:**
- **Type-based:** `"element"`, `"relationship"`, `"folder"`, `"view"`, `"concept"`
- **Type-specific:** `"business-actor"`, `"business-process"`, `"application-component"`, `"archimate-diagram-model"`, `"diagram-model-note"`, `"canvas-model-block"`, etc. (see full type list below)
- **Name-based:** `".ElementName"` — all objects named `"ElementName"`
- **ID-based:** `"#id-string"` — object with specific ID
- **Combined:** `"element.Business"` — elements with Business stereotype
- **All:** `"*"` — all objects

---

## Collection API

Collections are the main interface for querying and modifying Archi objects. Every query method returns a collection (possibly empty or null).

### Creating Collections

```js
var elements = $("element");
var byName = $(".MyElement");
var byId = $("#id-123");
var fromOther = $(anotherCollection);
var fromObject = $(singleObject);
```

### Traversing

```js
.find(selector?)          // recursive descendant search
.children(selector?)      // immediate children
.parent(selector?)        // parent of each object
.parents(selector?)       // all ancestors (since 1.7)
.viewRefs(selector?)      // views in which object is referenced
.objectRefs(selector?)    // visual objects referencing each object
```

### Relations

```js
.rels(selector?)          // all relations with each object as endpoint
.inRels(selector?)        // relations where object is target
.outRels(selector?)       // relations where object is source
.ends(selector?)          // source or target of each relation
.sourceEnds(selector?)    // sources of each relation
.targetEnds(selector?)    // targets of each relation
```

### Filtering

```js
.filter(selector | function)  // reduce to matches
.not(selector | otherCollection) // reduce to non-matches
.has(selector)            // reduce to objects containing descendant
.add(selector | otherCollection) // union with other collection
```

### Attributes & Properties

```js
.attr(name)               // get attribute value (first object)
.attr(name, value)        // set attribute on all objects
.prop()                   // list all property keys (first object)
.prop(key)                // get first property value
.prop(key, true)          // get array of all property values
.prop(key, value)         // set property on all (update)
.prop(key, value, true)   // add property even if duplicate
.removeProp(key, value?)  // remove property (all or matching value)
```

**Available attributes (via `.attr()`):**
```
access-type, association-directed, borderType, bounds, connectionRouter,
deriveLineColor, figureType, fillColor, fontColor, fontName, fontSize,
fontStyle, gradient, iconColor, id (get only), image, imagePosition,
imageSource, index (since 1.7), influence-strength, junction-type,
label-expression, label-value (get only), labelVisible, lineColor,
lineStyle (since 1.8), lineWidth, name, opacity, outlineOpacity,
purpose, relativeBendpoints (get only), showIcon, source (connections),
specialization, style, target (connections), text, textAlignment,
textPosition, type (get only), view (get only), viewpoint
```

### Iteration & Access

```js
.each(function(obj) {})   // iterate over collection
.first()                  // get first object (or null)
.get(n)                   // get nth object
.size()                   // count of objects
.is(selector)             // true if any object matches selector
.clone()                  // copy collection (not objects)
```

---

## Model API

Access the current model via the global `model` object.

```js
model.id                              // unique ID (readonly)
model.name                            // model name
model.purpose                         // model documentation
model.specializations                 // array of Specialization objects
```

### Creating Objects

```js
model.createElement(type, name, folder?)      // → ArchiElement
model.createRelationship(type, name, src, tgt, folder?) → ArchiRelation
model.createArchimateView(name, folder?)      // → ArchimateView
model.createSketchView(name, folder?)         // → SketchView
model.createCanvasView(name, folder?)         // → CanvasView
model.createImage(filePath)                   // → Image {width, height}
model.createSpecialization(name, type, image?) → Specialization
model.createFolder(name, parentFolder?)       // → Folder
```

### Querying & Manipulation

```js
model.findSpecialization(name, type)         // → Specialization or null
model.isAllowedRelationship(relType, srcType, tgtType) // → boolean
model.isSet()                                 // → true if model is current (since 1.9)
model.isModelLoaded(model)                    // → true if model is loaded (since 0.7)
model.getLoadedModels()                       // → array of loaded models (since 0.7)
model.children()                              // → collection of top-level folders (since 0.6)
```

### File & Export

```js
model.getPath()                               // → file path or null
model.save(path?)                             // save to current or specified path
model.openInUI()                              // open in Models tree
model.copy()                                  // → new model reference
model.setAsCurrent()                          // make this model the global `model`
model.merge(filePathOrModel, update, updateAll, messages?) // import another model (since 1.5)
model.duplicate(folder?)                      // → new ArchimateView (since 1.8)
```

### Rendering

```js
$.model.renderViewAsBase64(view, format, options?)  // → Base64 string (since 1.2)
$.model.renderViewToSVG(view, filePath, options?)   // save to SVG (since 1.7)
```

---

## Elements & Relationships

### ArchiElement

Base properties inherited from ArchiConcept:
```js
element.id                // unique ID (readonly)
element.type              // e.g., "business-actor" (readonly)
element.name              // element name
element.documentation     // descriptive text
element.specialization    // specialization/profile name
element.model             // parent model (readonly)
```

Methods:
```js
element.prop()            // list property keys
element.prop(key)         // get property value
element.prop(key, value)  // set property
element.removeProp(key)   // remove property
element.delete()          // delete element
element.merge(other)      // merge with another element
element.duplicate(folder?) // create copy (since 1.8) → ArchiElement
$(element).parents(selector) // ancestors (since 1.7)
```

### ArchiRelation

Extends ArchiConcept with:
```js
relation.source           // source element (ArchiElement)
relation.target           // target element (ArchiElement)
relation.type             // e.g., "composition-relationship"
relation.merge(other)     // merge with another relation
relation.duplicate(folder?) // create copy (since 1.8) → ArchiRelation
```

**Subtype-specific properties:**
- `AccessRelation.accessType` — `"read"` or `"write"` (or `"access"`, `"modify"`, `"create"`, `"delete"`)
- `InfluenceRelation.influenceStrength` — `"positive"` or `"negative"`
- `AssociationRelation.associationDirected` — `true` or `false`

### Folder

Container for model objects:
```js
folder.add(folder | element | relationship | view) // add child
folder.createFolder(name)  // → Folder
```

---

## Views

### ArchimateView

A diagram view for visualizing elements and relationships.

**Properties:**
```js
view.id                   // unique ID (readonly)
view.name                 // view name
view.documentation        // view description
view.viewpoint            // viewpoint ID (e.g., "business", "application")
view.viewpoint = value    // set viewpoint (since 0.4.1)
view.routerType           // "manual", "manhattan", or "shortest_path" (since 1.11)
view.connectionRouter     // connection routing type (alias for routerType)
```

**Adding Visual Objects:**

```js
// Create visual element
view.add(element, x, y, width, height, autoNest?)  // → VisualObject
// Overload: width or height = -1 uses default size (since 1.10)

// Add visual relation
view.add(relation, sourceVisualObject, targetVisualObject)  // → VisualConnection

// Move existing visual object to new parent (since 1.10)
newParent.add(existingVisualObject, x, y)  // → VisualObject (x, y relative to parent)
```

**Creating Diagram Objects:**

```js
view.createObject(type, x, y, width, height, autoNest?)
  // type: "diagram-model-note", "diagram-model-group", "diagram-model-legend", etc.

view.createObject("diagram-model-legend", x, y, width, height)
  // Set legend options via: legend.options = { showElements: true, rows: 10, ... } (since 1.12)

view.createViewReference(targetView, x, y, width, height)
```

**Query & Utilities:**

```js
view.isAllowedConceptForViewpoint(conceptType)  // → boolean
view.openInUI()           // open in diagram view (since 1.5)
view.duplicate(folder?)   // create copy (since 1.8) → ArchimateView
$(view).children()        // all visual objects on view
$(view).find(selector)    // search visual objects
```

### Other View Types

`SketchView` and `CanvasView` follow the same API as `ArchimateView`.

---

## Visual Objects

Visual objects are diagram elements placed on a view.

### Position & Size

```js
vo.bounds                 // get/set: { x, y, width, height }
vo.bounds = { x: 10, y: 10, width: 120, height: 60 }
// Setting width or height to -1 uses default (since 1.10)

vo.index                  // z-order: 0=back, -1=front (since 1.7)
vo.bringToFront()         // send to front (since 1.7)
vo.bringForward()         // move forward in z-order (since 1.7)
vo.sendToBack()           // send to back (since 1.7)
vo.sendBackward()         // move backward in z-order (since 1.7)
```

### Appearance

```js
vo.fillColor              // hex color "#RRGGBB" or "#AARRGGBB"
vo.fontColor              // text color
vo.fontName               // font family name
vo.fontSize               // font height (integer)
vo.fontStyle              // "normal", "bold", "italic", "bolditalic"
vo.lineColor              // outline color
vo.lineWidth              // 1=normal, 2=medium, 3=heavy
vo.lineStyle              // 0=solid, 1=dashed, 2=dotted, 3=none (since 1.8)
vo.opacity                // 0–255, where 255=fully opaque
vo.outlineOpacity         // outline opacity 0–255
vo.gradient               // -1=none, 0=top, 1=left, 2=right, 3=bottom
vo.deriveLineColor        // true to derive line from fill (since 1.6)
vo.iconColor              // color of ArchiMate icon (since 1.5)
vo.showIcon               // 0=if-no-image, 1=always, 2=never
vo.textAlignment          // 1=left, 2=center, 4=right
vo.textPosition           // 0=top, 1=center, 2=bottom
vo.labelExpression        // dynamic label expression
vo.labelValue             // computed label (readonly)
vo.labelVisible           // show/hide label on connection
```

### Appearance Constants

```js
TEXT_ALIGNMENT = { LEFT: 1, CENTER: 2, RIGHT: 4 }
TEXT_POSITION = { TOP: 0, CENTER: 1, BOTTOM: 2 }
GRADIENT = { NONE: -1, TOP: 0, LEFT: 1, RIGHT: 2, BOTTOM: 3 }
LINE_STYLE = { SOLID: 0, DASHED: 1, DOTTED: 2, NONE: 3 } // (since 1.8)
SHOW_ICON = { IF_NO_IMAGE: 0, ALWAYS: 1, NEVER: 2 }
IMAGE_SOURCE = { SPECIALIZATION: 0, CUSTOM: 1 }
IMAGE_POSITION = {
  TOP_LEFT: 0, TOP_CENTER: 1, TOP_RIGHT: 2,
  MIDDLE_LEFT: 3, MIDDLE_CENTER: 4, MIDDLE_RIGHT: 5,
  BOTTOM_LEFT: 6, BOTTOM_CENTER: 7, BOTTOM_RIGHT: 8,
  FILL: 9
}
```

### Structure & Nesting

```js
vo.view                   // parent view (readonly)
vo.concept                // linked model concept (readonly)
vo.add(element, x, y, w, h, autoNest?)  // create child visual
vo.add(existingVO, x, y)  // move child to new parent (since 1.10)
vo.createObject(type, x, y, width, height)  // create diagram-model-* child
vo.createViewReference(targetView, x, y, width, height)  // create view reference
vo.delete(keepChildren?)  // delete (keepChildren since 1.8)
$(vo).children()          // all visual children
$(vo).parent()            // parent visual object
```

### Special Element Types

**Note:**
```js
note.text                 // note content
note.borderType           // 0=dogear, 1=rectangle, 2=none
note.figureType           // shape variant (0 or 1)
```

**Group:**
```js
group.borderType          // 0=tabbed, 1=rectangle
```

**View Reference:**
```js
viewRef.refView           // target view (readonly)
```

**Diagram-Model-Legend (since 1.12):**
```js
legend.options = {
  showElements: boolean,
  showRelations: boolean,
  showSpecializationElements: boolean,
  showSpecializationRelations: boolean,
  rows: 1–100,
  offset: -200 to 200,
  color: 0=no, 1=core, 2=user,
  sort: 0=by name, 1=by category
}
```

---

## Visual Connections

Connections are visual relations between two visual objects.

```js
connection.source         // source visual object
connection.target         // target visual object
connection.concept        // linked model relation
connection.lineWidth      // line thickness
connection.relativeBendpoints // array of Bendpoint objects (readonly)
connection.absoluteBendpoints // absolute coordinates (since 1.11, readonly)
```

**Bendpoints:**

```js
// Bendpoint structure
{ startX: number, startY: number, endX: number, endY: number }
// startX/startY, endX/endY are relative to source/target centers respectively

connection.deleteAllBendpoints()
connection.deleteBendpoint(index)
connection.addRelativeBendpoint({startX, startY, endX, endY}, index)
connection.setRelativeBendpoint(values, index)  // (since 1.1)
```

**Label Position:**

```js
connection.textPosition   // 0=source, 1=middle, 2=target
```

---

## Architecture Types

Full list of ArchiMate element types (kebab-case selectors):

**Strategy:** `resource`, `capability`, `course-of-action`, `value-stream`

**Business:** `business-actor`, `business-role`, `business-collaboration`, `business-interface`, `business-process`, `business-function`, `business-interaction`, `business-event`, `business-service`, `business-object`, `contract`, `representation`, `product`

**Application:** `application-component`, `application-collaboration`, `application-interface`, `application-function`, `application-process`, `application-interaction`, `application-event`, `application-service`, `data-object`

**Technology:** `node`, `device`, `system-software`, `technology-collaboration`, `technology-interface`, `path`, `communication-network`, `technology-function`, `technology-process`, `technology-interaction`, `technology-event`, `technology-service`, `artifact`

**Physical:** `equipment`, `facility`, `distribution-network`, `material`

**Motivation:** `stakeholder`, `driver`, `assessment`, `goal`, `outcome`, `principle`, `requirement`, `constraint`, `meaning`, `value`

**Implementation & Migration:** `work-package`, `deliverable`, `implementation-event`, `plateau`, `gap`

**Other:** `location`, `grouping`, `junction`

**Relationships:** `composition-relationship`, `aggregation-relationship`, `assignment-relationship`, `realization-relationship`, `serving-relationship`, `access-relationship`, `influence-relationship`, `triggering-relationship`, `flow-relationship`, `specialization-relationship`, `association-relationship`

**Other Visual Objects:** `diagram-model-note`, `diagram-model-group`, `diagram-model-connection`, `diagram-model-image`, `diagram-model-reference`, `diagram-model-legend` (since 1.12), `sketch-model-sticky`, `sketch-model-actor`, `canvas-model-block`, `canvas-model-sticky`, `canvas-model-image`

**Views:** `archimate-diagram-model`, `sketch-model`, `canvas-model`

---

## Global Environment

### Process Info (since 1.1)

```js
$.process.engine          // script engine name (e.g., "GraalVM JavaScript")
$.process.platform        // OS platform (e.g., "mac", "windows", "linux")
$.process.release         // { archi: "5.7.0", jArchi: "1.11" } (since 1.2)
$.process.argv            // command-line arguments (since 1.1; replaces getArgs())
$args                     // alias for $.process.argv
```

### Child Process (since 1.1)

```js
$.child_process.exec(...args)  // execute system command (replaces exec(); since 1.1/1.8)
```

### Global Functions

```js
load(filePath | URL | File)    // load and execute JavaScript file
load({name: string, script: string})  // load code string

exit()                         // terminate script
quit()                         // alias for exit() (since 1.8)
getArgs()                      // DEPRECATED (removed 1.8) — use $.process.argv
exec()                         // DEPRECATED (removed 1.8) — use $.child_process.exec()
```

### Global Constants

```js
model                     // global Model object
selection                 // current user selection (Collection | null)
__DIR__                   // directory of current script
__FILE__                  // path to current script
__LINE__                  // current line number (debug)
__SCRIPTS_DIR__           // root scripts directory
```

---

## Version History & Breaking Changes

### v1.12 — April 7, 2026
- Requires Archi 5.8+, Java 21
- Support for adding Legends to views: `createObject("diagram-model-legend", ...)`
- Legend options map: `showElements`, `showRelations`, `showSpecializationElements`, `showSpecializationRelations`, `rows`, `offset`, `color`, `sort`
- Preserve connection order on Undo
- Internal fixes to proxy proxy mechanics

### v1.11 — August 28, 2025
- `diagramObject.fillColor` returns user's default if current value is null (not null)
- Support `view.routerType` get/set: `"manual"`, `"manhattan"`, `"shortest_path"`
- Fix `model.merge()` parameter usage
- Don't show script name in Undo/Redo

### v1.10 — May 6, 2025
- **New:** `.add(object, x, y)` moves existing visual object to new parent within same view
- Width/height of -1 now uses default sizes for all diagram object types (Notes, Groups, etc.)

### v1.9 — March 24, 2025
- Chrome DevTools debugger support: `debugger;` breakpoints work
- Add `model.isSet()` to check if a model is currently selected/set

### v1.8 — February 3, 2025 ⚠️ **Breaking Changes**
- Requires Archi 5.5+, update to GraalVM 24.1.2
- **Breaking:** `exec()` removed → use `$.child_process.exec()` instead
- **Breaking:** `getArgs()` removed → use `$.process.argv` instead
- Add `element.duplicate(folder?)` / `view.duplicate(folder?)`
- Add `vo.delete(false)` to delete while keeping children
- Add `vo.lineStyle` / `connection.setLineStyle()` / `getLineStyle()`: SOLID(0), DASHED(1), DOTTED(2), NONE(3)
- Require bounds width/height >= 0 (or -1 for default)
- Add `quit()` alias for `exit()`

### v1.7 — October 9, 2024
- z-order API: `vo.index`, `.bringForward()`, `.bringToFront()`, `.sendBackward()`, `.sendToBack()`
- SVG/PDF export options: `.renderViewToSVG()` with `setViewBox`, `textAsShapes`, `embedFonts`, `textOffsetWorkaround`
- Add `collection.parents(selector)` to traverse ancestors
- Increase shortcut key slots from 10 to 20

### v1.6.1 — February 22, 2024
- Add preference to enable/disable CommonJS support

### v1.6 — February 18, 2024
- Requires Archi 5.2+
- Enable CommonJS / Node.js modules support
- Add `vo.lineWidth` get/set (replaces text-based lineStyle from 0.8)
- Add `vo.deriveLineColor` get/set

### v1.5 — October 2, 2023
- Add `vo.iconColor` get/set
- Add `view.openInUI()`
- Implement `model.merge(fileOrModel, update, updateAll, messages?)`

### v1.4 — March 21, 2023
- Add shortcut keys for scripts
- Add top-level Scripts menu
- Add `window.promptSelection`
- Implement text alignment for connections

### v1.3.1 — November 4, 2022
- Fix class not found exception

### v1.3 — November 4, 2022
- Update to GraalVM 22.3
- `IMAGE_POSITION` constants: use `CENTER` not `CENTRE`
- Show detailed exception and error line numbers

### v1.2.1 — August 11, 2022
- Requires Archi 4.10+ (Eclipse 4.25)
- GraalVM is default; Nashorn deprecated
- jArchi loads lazily

### v1.2 — October 12, 2021
- Requires Archi 4.9+
- Support specializations/profiles/images
- Add `.renderViewAsBase64(view, format, options?)`
- Add `vo.gradient` get/set
- Add `$.process.release` for version strings

### v1.1.1 — August 18, 2021
- Add `view.createDiagramConnection()`
- Add `connection.textPosition` set/get
- Add `connection.style` set/get
- Add "Show Console" toolbar action

### v1.1.0 — January 12, 2021 ⚠️ **API Changes**
- Use GraalVM ProxyObject for Java Map (supports `bounds.x` and `bounds['x']`)
- Add `$.process.engine`, `$.process.platform`
- **Deprecate:** `getArgs()` → use `$.process.argv`
- **Deprecate:** `exec()` → use `$.child_process.exec()`
- Add `connection.setRelativeBendpoint()`
- Allow `__SCRIPTS_DIR__` from ACLI

### v1.0.0 — January 4, 2021
- Add GraalVM preference
- Add Junction type API
- Add label expressions
- Add relationship merge
- Rename: `note` → `diagram-model-note`, `group` → `diagram-model-group`

### v0.8.0 — June 23, 2020
- Add `setTextAlignment()` / `setTextPosition()` for visual objects
- Add `setBorderType()` for Notes and Groups
- Add `exec()` to execute system commands
- Add `__SCRIPTS_DIR__` global
- Width/height = -1 uses user preference defaults

### v0.7.2 — February 28, 2020
- Add `outlineOpacity`
- Add `labelVisible` for connections
- Add `getArgs()` for command-line arguments

### v0.7.0 — January 13, 2020
- Add `$.model.isModelLoaded()`, `$.model.getLoadedModels()`
- Add `relation.associationDirected` get/set

### v0.1.0 — July 2, 2018
- First beta release

---

## References

- **Official Wiki:** https://github.com/archimatetool/archi-scripting-plugin/wiki
- **Archi Project:** https://www.archimatetool.com
- **GraalVM Docs:** https://www.graalvm.org/latest/reference-manual/js
