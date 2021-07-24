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
 * 	add console logging of the changed concepts and relations
 * 	add property with info about conversion to converted relationships
 * 	for GraalVM compatibility: changed regular expression
 */
 let relText=''

function convertConcept(selection, filename) {
  let countConvertConcept = 0,
    countConvertNotAllowed = 0;
  let modeRelaxedSelected = false;

  // replace reg exp changed for GraalVM engine
  // let convertToType = filename.replace(/^.*\//, '').replace(/\.ajs$/, '').replace(/%20/, '-').toLowerCase();
  let convertToType = filename
    .replace(/^.*[\\\/]/, "")
    .replace(/\.ajs$/, "")
    .replace(/%20/, "-")
    .toLowerCase();

  console.log(`\nConvert selected concepts to type ${convertToType}`);

  try {
    $(selection).each(function (o) {
      console.log(`> Convert concept: ${o}`);

      // check all relation for not allowed relationships after conversion
      $(concept(o))
        .rels()
        .each(function (r) {
          relText = `${r.type}: "${r.source.name}"  -[${r.name == "" ? "empty" : r.name}]->  "${r.target.name}"`;

          if (!checkRelationship(r, o, convertToType)) {
            // Select conversion mode at first not allowed relationship
            if (!modeRelaxedSelected) {
              modeRelaxedSelected = window.confirm(
                'In "relaxed" mode, not allowed relationships are converted to associations. In "strict" mode, relationships are not changed.\n\nClick Ok for "relaxed" mode, click Cancel for "strict" mode'
              );
            }

            // In strict mode, exit at first not allowed relationship
            if (!modeRelaxedSelected) {
              window.alert(`For ${relText}\n\nConversion not allowed\n\nClick Ok to exit.`);
              console.log(`> Cancel: conversion of ${relText} not allowed`);
              console.log(`===`);
              console.log(`Converted ${countConvertConcept} concepts to type ${convertToType}.`);
              exit();
            }

            console.log(`>> Convert ${relText}`);

            convertRelationship(r, o, convertToType);
            countConvertNotAllowed++;
          }
        });
      concept(o).concept.type = convertToType;
      countConvertConcept++;
      console.log(`> Concept converted to: ${o}`);
      console.log(`===`);
    });
    if (modeRelaxedSelected) {
      console.log(
        `Converted ${countConvertConcept} concepts to type ${convertToType} and ${countConvertNotAllowed} not allowed relationships to type 'association'`
      );
    } else {
      console.log(`Converted ${countConvertConcept} concepts to type ${convertToType}.`);
    }
  } catch (error) {
    console.log(`> ${typeof error.stack == "undefined" ? error : error.stack}`);
  }
}

function checkRelationship(r, o, convertToType) {
	console.log(`Check: ${relText}`)
  if (r.source.id == o.id) {
    return $.model.isAllowedRelationship(r.type, convertToType, r.target.type);
  } else {
    return $.model.isAllowedRelationship(r.type, r.source.type, convertToType);
  }
}

function convertRelationship(r, o, convertToType) {
  let relationshipType = r.type.replace(/-relationship$/, "");
  let convertText = `Relationship type was "${relationshipType}". Element "${o.name}" converted from "${o.type}" to "${convertToType}"`;
  r.prop(`convertConcept`, convertText);
  r.type = "association-relationship";
}

function concept(o) {
  return o.concept ? o.concept : o;
}
