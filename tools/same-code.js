#!/usr/bin/env node
/**
 * Does a file's executable code still equal an earlier revision? Compares after removing
 * comments (JSDoc included) and the parentheses of JSDoc casts, so annotation-only changes pass.
 * Proof that a typecheck change did not change behaviour (types/README.md).
 *
 * Run (repo root): node tools/same-code.js [--rev <git rev>] <file…>     default rev: HEAD
 * Exit 0 = every file SAME; 1 = a DIFF (first differing line shown); NEW = file absent in rev.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repo = path.resolve(__dirname, "..");
const ts = require(path.join(repo, "node_modules/typescript"));

const args = process.argv.slice(2);
let rev = "HEAD";
const i = args.indexOf("--rev");
if (i >= 0) { rev = args[i + 1]; args.splice(i, 2); }
if (!args.length) { console.log("usage: node tools/same-code.js [--rev <git rev>] <file…>"); process.exit(2); }

/** Source printed without comments and without JSDoc-cast parentheses. */
function normalise(src, name) {
  const sf = ts.createSourceFile(name, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const strip = ctx => root => {
    const visit = n => (ts.isParenthesizedExpression(n) && ts.getJSDocTypeTag(n))
      ? ts.visitNode(n.expression, visit)
      : ts.visitEachChild(n, visit, ctx);
    return ts.visitNode(root, visit);
  };
  const out = ts.transform(sf, [strip]).transformed[0];
  // The printer writes "(x) =>" for "x =>": the same code.
  return ts.createPrinter({ removeComments: true }).printFile(out).replace(/\((\w+)\) =>/g, "$1 =>");
}

let differing = 0;
for (const file of args) {
  let old;
  try { old = execFileSync("git", ["-C", repo, "show", `${rev}:${file}`], { encoding: "utf8" }); }
  catch { console.log(`NEW  ${file}`); continue; }
  const a = normalise(old, file).split("\n");
  const b = normalise(fs.readFileSync(path.join(repo, file), "utf8"), file).split("\n");
  const at = a.findIndex((line, k) => line !== b[k]);
  if (at < 0 && a.length === b.length) { console.log(`SAME ${file}`); continue; }
  differing++;
  const k = at < 0 ? Math.min(a.length, b.length) : at;
  console.log(`DIFF ${file}\n  - ${a[k]}\n  + ${b[k]}`);
}
process.exit(differing ? 1 : 0);
