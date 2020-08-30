/**
 * jbsarrodie/ConvertConcept.lib.js 
 * https://gist.github.com/jbsarrodie/45a312cff559d23cf55ed102422e8af7
 * 
 * #jArchi script to change concepts' type (and optionally convert no more valid relationships to association) 
 * 
 * This script make it really easy to convert concepts (element or relationship) from one type to another.
 * It also takes care of relationships involving the concept been converted: if after the conversion some
 * relationships are no more valid, it will (optionally) convert them to associations.
 * 
 * Mark:
 * 	changed structure to add console logging for an overview of the changed concepts and relations
 * 	add property with info about conversion to converted relationships
 */

function convertConcept(selection, filename ) {
	let i=0, j=0;
	let modeRelaxedSelected = false;
	let convertToType = filename.replace(/^.*\//, '').replace(/\.ajs$/, '').replace(/%20/, '-').toLowerCase();

	console.log(`\nConvert selected concepts to type ${convertToType}`)
	
	$(selection).each(function (o) {
		
		console.log(`> Convert concept: ${o}`)
		
		// check all relation for not allowed relationships after conversion
		$(concept(o)).rels().each(function (r) {
			
			if ( !checkRelationship(r, o, convertToType)) {

				let relationText = `${r.type}: "${r.source.name}"  -->  "${r.target.name}"${r.name == '' ? '' : ' label "' + r.name + '"'}`

				// Select conversion mode at first not allowed relationship 
				if (!modeRelaxedSelected) {
					modeRelaxedSelected = (window.confirm('In "relaxed" mode, not allowed relationships are converted to associations. In "strict" mode, relationships are not changed.\n\nClick Ok for "relaxed" mode, click Cancel for "strict" mode'))
				}
				// In strict mode, exit at first not allowed relationship 
				if (!modeRelaxedSelected) {
					window.alert(`For ${relationText}\n\nConversion not allowed\n\nClick Ok to exit.`);
					console.log(`> Cancel: conversion of ${relationText} not allowed`);
					console.log(`===`)
					console.log(`Converted ${i} concepts to type ${convertToType}.`)
					exit();
				}

				console.log(`>> Convert ${relationText}`)

				convertRelationship(r, o, convertToType);
				j++;
			}
		});
		concept(o).concept.type = convertToType;
		i++;
		console.log(`> Concept converted to: ${o}`)
		console.log(`===`)
	});
	if (modeRelaxedSelected) {
		console.log(`Converted ${i} concepts to type ${convertToType} and ${j} not allowed relationships to type 'association'`)
	} else {
		console.log(`Converted ${i} concepts to type ${convertToType}.`)
	}
}

function checkRelationship(r, o, convertToType) {
	if (r.source.id == o.id) {
		return $.model.isAllowedRelationship(r.type, convertToType, r.target.type)
	} else {
		return $.model.isAllowedRelationship(r.type, r.source.type, convertToType)
	}
}

function convertRelationship(r, o, convertToType) {
	let relationshipType = r.type.replace(/-relationship$/, '')
	let convertText = `Relationship type was "${relationshipType}". Element "${o.name}" converted from "${o.type}" to "${convertToType}"`;
	r.prop(`convertConcept`, convertText) 
	r.type = "association-relationship";
}

function concept(o) {
	return o.concept ? o.concept : o;
}