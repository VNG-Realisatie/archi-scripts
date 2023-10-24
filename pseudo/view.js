design
- recurseParent
  - UP - recurse over nested relations until parent without parent (circular reference possible, keep counter, stop at 2?)
    - result list of root parents
     - addNode
     - drawElement
- recurseChild
  - DOWN - recurse over nested relation until child without children (circular reference possible, or already processed)
    - 
- recurseElement


filteredElements = selectElements()
filteredElements.each(ele => processElements(P2)
{
  P2.rels().nested.each(rel => processParentRel(P2-R1)
  {

  })

})
  
    processParentRel 


Start with P2
- *processEle P2*
	- *processParentRel P2 - R1* 
		- *processEle R1*
			- drawEle R1 
			- **addNode R1** (visual ID??)
			- processRel R1 -P1
				- processEle P1
					- ..
			- processRel R1 -P2
				- processEle P2
					- draw P2
					- **addNode P2**
					- procesRel P2 
					- return P2
				- drawRel  P2 - R1
				- **add parentChild  P2 - R1** 
				- return ChildRel P2 - R1
			- 



function processEle(ele) {}
function processRel(ele) {}
function processParentRel(rel) {}
function processRel(rel) {}



