/** GGM import en export definies 
 * 
 * mapping CSV importbestand relaties (objecten gaan met Sync GGM)
 * mapping functies CSV exportbestanden
*/

// matchen op ID ggm-guid ipv Object ID
var PROP_ID = "ggm-guid";


function headerMapping(header) {

  let exportMapping = {
    "name": "naam"
    "definitie": "definitie"
    "uml-type": 
    "ggm-guid": 
    "ggm-source-guid": source.prop.ggm-guid
    "ggm-target-guid": target.prop.ggm-guid
    "toelichting": 
    "archimate-type": 
    "gemma-guid": 
    "gemma-source-guid": 
    "gemma-target-guid": 
    "datum-tijd-export": 
  }

  let importMapping = {
    "naam": name
    "definitie": "definitie"
    "uml-type": 
    "ggm-guid": 
    "ggm-source-guid": source.prop.ggm-guid
    "ggm-target-guid": target.prop.ggm-guid
    "toelichting": 
    "archimate-type": 
    "gemma-guid": 
    "gemma-source-guid": 
    "gemma-target-guid": 
    "datum-tijd-export": 
  }

  
  return modifiedHeader
}
