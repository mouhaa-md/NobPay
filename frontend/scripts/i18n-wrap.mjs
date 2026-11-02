#!/usr/bin/env node
/**
 * One-time migration tool: wraps the plain text nodes of JSX files in <T>…</T> (server pages and layouts) or
 * <Tc>…</Tc> (components, which may run on either side), so the sentences can be translated through the dictionary in
 * src/lib/i18n/en.ts. It only touches JSX text between tags: attributes, string literals and text mixed with
 * expressions are handled by hand with t(). Running it again changes nothing.
 *
 * Usage:  node scripts/i18n-wrap.mjs [--write] [--keys keys.json] <file or folder> ...
 * Without --write it only reports. With --keys it also writes every sentence it found, with the files it is in.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const write = args.includes('--write');
const keysAt = args.includes('--keys') ? args[args.indexOf('--keys') + 1] : null;
const targets = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--keys');

const SKIP_TAGS = new Set(['code', 'pre', 'script', 'style', 'T', 'Tc']);
const ENTITIES = { '&apos;': "'", '&quot;': '"', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&#39;': "'" };
const decode = (s) => s.replace(/&(apos|quot|amp|lt|gt|nbsp|#39);/g, (m) => ENTITIES[m]);

function files(p) {
  const st = statSync(p);
  if (st.isFile()) return /\.tsx$/.test(p) ? [path.normalize(p)] : [];
  return readdirSync(p).flatMap((n) => files(path.join(p, n)));
}

const found = new Map(); // sentence -> Set(files)
let changed = 0;
let wrapped = 0;

for (const file of targets.flatMap(files)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.includes('admin')) continue; // the operator's back-office stays in French
  const isClient = /^\s*(['"])use client\1/.test(text);
  const isServerEntry = /[\\/]src[\\/]app[\\/]/.test(file) && !isClient;
  const tag = isServerEntry ? 'T' : 'Tc';
  const edits = [];

  const visit = (node, skip) => {
    let inSkip = skip;
    if (ts.isJsxElement(node)) {
      const name = node.openingElement.tagName.getText(source);
      if (SKIP_TAGS.has(name)) inSkip = true;
    }
    if (ts.isJsxText(node) && !inSkip && !node.containsOnlyTriviaWhiteSpaces) {
      const raw = node.getText(source);
      const core = raw.trim();
      if (/\p{L}/u.test(core)) {
        const lead = raw.slice(0, raw.indexOf(core));
        const trail = raw.slice(raw.indexOf(core) + core.length);
        edits.push({ start: node.getStart(source), end: node.getEnd(), replacement: `${lead}<${tag}>${core}</${tag}>${trail}` });
        const key = decode(core).replace(/\s+/g, ' ').trim();
        if (!found.has(key)) found.set(key, new Set());
        found.get(key).add(path.relative(process.cwd(), file).replace(/\\/g, '/'));
      }
    }
    ts.forEachChild(node, (c) => visit(c, inSkip));
  };
  visit(source, false);
  if (edits.length === 0) continue;

  let out = text;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  const importLine = isServerEntry ? "import { T } from '@/lib/i18n/server';" : "import { Tc } from '@/lib/i18n/client';";
  if (!out.includes(importLine)) {
    // after the last import statement
    const imports = source.statements.filter(ts.isImportDeclaration);
    const at = imports.length ? imports[imports.length - 1].getEnd() : out.indexOf('\n', out.indexOf("'use client'") + 1);
    const shift = out.length - text.length; // edits come after the imports, so offsets before them are unchanged
    void shift;
    out = out.slice(0, at) + `\n${importLine}` + out.slice(at);
  }
  changed += 1;
  wrapped += edits.length;
  console.log(`${write ? 'wrapped' : 'would wrap'} ${String(edits.length).padStart(3)} in ${path.relative(process.cwd(), file)} (${tag})`);
  if (write) writeFileSync(file, out);
}

console.log(`\n${wrapped} text nodes in ${changed} files, ${found.size} distinct sentences.`);
if (keysAt) writeFileSync(keysAt, JSON.stringify([...found].map(([key, fs]) => ({ key, files: [...fs] })), null, 1));
