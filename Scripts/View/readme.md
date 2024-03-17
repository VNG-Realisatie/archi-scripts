# view readme

Generate and auto layout Archi view(s)

Use cases:

- quickly generate a starting point for a new view
- generate multiple context views (one element and all its related elements)
- analyse your model by generating different views.
- use nesting to find unexpected relations, see double relations, etc.

Based on "generate views using graphlib" by Herve Jouin.
See https://forum.archimatetool.com/index.php?topic=639.msg3563#msg3563

## files

file with generate_view function

- include_view.js

wrapper files with parameter for generating a specific view

- view.ajs
- view_application.ajs
- view_business.ajs
- view_motivation.ajs
- view_technology.ajs
- expand.ajs
- multiple.ajs
- layout_LR.ajs
- layout_nested.ajs
- layout_TB.ajs

## generate_view parameters

All the parameters of the generate_view function are contained in one object, the param object.

Configure the behavior of generate_view with the folowing parameters.

- Which elements and relations to include in the view
  - `action`, generate and/or layout a view
    - Generate new views
      - GENERATE_SINGLE (default)
        generate a view with the selected elements and THEIR related elements (add elements and relations `graphDepth` relations deep)
      - GENERATE_MULTIPLE
        generate a view for every selected element and ITS related elements (add elements and relations `graphDepth` relations deep)
    - Change an existing view
      - EXPAND_HERE
        expand in the view the selected element(s) with their related elements (add elements and relations 1 relation deep)
      - LAYOUT
        layout the selected view. Do not add elements or relations
  - `graphDepth`, add elements and relation to the selection `graphDepth` relation deep
    - default is 1
    - Used for the GENERATE_SINGLE and GENERATE_MULTIPLE actions
    - integer -  number of relations to follow
  - `includeElementType`, element types that will be included in the view
    - default is no filter
    - [..] (empty array) all element types are included
    - [type, type, ...] array of element types like business-actor, application-component, technology-collaboration, node, ...
  - `includeRelationType`, relationship types that will be included in the view
    - default is no filter
    - [..] (empty array) all relationship types in the model
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
  - `excludeFromView`, exclude a marked set of relations from the view
    - default is false
    - boolean [true, false]
    - in the model you 'mark' the to exclude relations with the property excludeFromView=true. The marked relation and ITS related element are skipped
- How to draw given relationship types
  - `layoutReversed`, relationship types that will be reversed in the layout
    - default none
    - [..] (empty array) no relationships are reversed
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
  - `layoutNested`, relationship types that will be rendered nested (embed target elements in the source element)
    - default none
    - [..] (empty array) no relationships are nested
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
- View to generate
  - `viewName`, name of the view to create
    - default is none
    - "" (empty string) or none, the "name of first selected object" is used as the viewName
    - "foo" is used as viewname
    - only valid in the `action` GENERATE_SINGLE, ignored for other actions
    - In the action GENERATE_MULTIPLE the individual names of the selected elements are used as the viewName
  - `viewNameSuffix`, suffix added to the viewName
    - default is no suffix
    - "" (empty string), no suffix
    - " (GGM)" string is appended to the viewName
  - `viewFolder`, view is added to the folder `/Views/<viewFolder>`
    - default is empty
    - "" (emtpy string), view is added to the folder `/Views/_Generated`
    - "/sub/sub/foldername" string starting with a `/`, containing one or more subfolders
    - don't include the main folder /Views
- How to layout and size the view
  - Dagre layout options - for more information see <https://github.com/dagrejs/dagre/wiki#configuring-the-layout>
  - `graphDirection`, direction of the graph
    - TB -   Top-Bottom (default)
    - BT -   Bottom-Top
    - LR -   Left-Right
    - RL -   right-Left
  - `graphAlign`, alignment of the graph
    - UL -   Up Left
    - UR -   Up Right
    - DL -   Down Left
    - DR -   Down Right
    - default is none which centers de graph
  - `ranker`, algorithm to assigns a rank to each node in the input graph.
    - network-simplex (default)
    - longest-path
    - tight-tree

  - `nodeWidth`, width of a drawn element
    - integer - number of pixels for the width (default NODE_WIDTH)
  - `nodeHeight`, height of a drawn element
    - integer - number of pixels for the height (default NODE_HEIGHT)
  - `hSep`, horizontal distance between two drawn elements
    - integer - number of pixels that separate nodes horizontally  (defaults to 50)
  - `vSep`, vertical distance between two drawn elements
    - integer - number of pixels that separate nodes vertically  (defaults to 50)
- For jArchi script development
  - `debug`, print debug messages on the console
    - boolean, true or false  (default is false)