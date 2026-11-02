#!/usr/bin/env node
/**
 * Lists the sentences the app shows (text in <T>…</T> / <Tc>…</Tc>, and literals passed to t('…')) that have no English
 * translation in src/lib/i18n/en.ts, and the dictionary entries nothing uses any more.
 *
 * Usage:  node scripts/i18n-missing.mjs [--unused] [--check]   (--check exits with 1 when a sentence is missing)
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const showUnused = process.argv.includes('--unused');
const check = process.argv.includes('--check');
const ENTITIES = { '&apos;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" };
const decode = (s) => s.replace(/&(apos|quot|amp|lt|gt|nbsp|#39);/g, (m) => ENTITIES[m]);
const norm = (s) => s.replace(/\s+/g, ' ').trim();

function walk(p) {
  const st = statSync(p);
  if (st.isFile()) return /\.tsx?$/.test(p) ? [p] : [];
  return readdirSync(p).flatMap((n) => walk(path.join(p, n)));
}

const dictSource = ts.transpileModule(readFileSync('src/lib/i18n/en.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { EN } = await import('data:text/javascript,' + encodeURIComponent(dictSource));

const used = new Map(); // sentence -> files
const add = (s, file) => {
  const key = norm(decode(s));
  if (!key || !/\p{L}/u.test(key)) return;
  if (!used.has(key)) used.set(key, new Set());
  used.get(key).add(file.replace(/\\/g, '/'));
};

for (const file of walk('src')) {
  if (file.includes(`i18n${path.sep}`)) continue;
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (node) => {
    if (ts.isJsxElement(node)) {
      const name = node.openingElement.tagName.getText(source);
      if (name === 'T' || name === 'Tc') {
        const inner = node.children.map((c) => (ts.isJsxText(c) ? c.getText(source) : '')).join('');
        add(inner, file);
      }
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 't') {
      const arg = node.arguments[0];
      if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) add(arg.text, file);
      // t(cond ? 'a' : 'b')
      if (arg && ts.isConditionalExpression(arg)) for (const branch of [arg.whenTrue, arg.whenFalse]) if (ts.isStringLiteral(branch) || ts.isNoSubstitutionTemplateLiteral(branch)) add(branch.text, file);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const missing = [...used].filter(([k]) => !Object.prototype.hasOwnProperty.call(EN, k));
console.log(`${used.size - missing.length}/${used.size} sentences translated, ${missing.length} missing.`);
for (const [k, files] of missing) console.log(JSON.stringify(k), '<-', [...files].map((f) => f.split('/').pop()).join(', '));
if (showUnused) {
  const unused = Object.keys(EN).filter((k) => !used.has(k));
  console.log(`\n${unused.length} dictionary entries are not used by any <T>/<Tc>/t():`);
  for (const k of unused) console.log('  ', JSON.stringify(k));
}
if (check && missing.length > 0) process.exit(1);
