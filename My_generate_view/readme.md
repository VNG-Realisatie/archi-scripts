## generate_view readme

JArchi function for generating and auto layout of an Archi view

Use cases:
- quickly generate a starting point for a new view
- generate multiple context views (one element and all its related elements)
- analyse your model by generating different views.
- Use nesting to find unexpected relations, see double relations, etc.

### generate_view parameters
All the parameters of the generate_view function are contained in one object, the param object.

Configure the behavior of generate_view with the folowing parameters. 

- Parameters describing which elements and relations to included in the view
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
  - `elementFilter`, element types that will be included in the view 
    - default is no filter
    - [..] (empty array) all element types are included
    - [type, type, ...] array of element types like business-actor, application-component, technology-collaboration, node, ...
  - `relationFilter`, relationship types that will be included in the view
    - default is no filter
    - [..] (empty array) all relationship types in the model
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
  - `viewName`, name of the view to create
    - default is "name of first selected object"
    - only used in the `action` GENERATE_SINGLE
    - string - viewname
- Parameters with relationship types to draw different
  - `drawReversed`, relationship types that will be reversed in the layout
    - default none
    - [..] (empty array) no relationships are reversed
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
  - `drawNested`, relationship types that will be rendered nested (embed target elements in the source element)
    - default none
    - [..] (empty array) no relationships are nested
    - [type, type, ...] array of relationship types like realization-relationship, assignment-relationship, ...
- Dagre layout options
  For more information see https://github.com/dagrejs/dagre/wiki#configuring-the-layout
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

### wrapper files
include_generate_view.js


context_views.ajs
expand_view_LR.ajs
generate_multiple_views.ajs
generate_view.ajs
generate_view_application.ajs
generate_view_business.ajs
generate_view_motivation.ajs
generate_view_technology.ajs
layout_view_LR.ajs
layout_view_nested.ajs
layout_view_TB.ajs
