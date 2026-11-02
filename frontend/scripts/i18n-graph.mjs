#!/usr/bin/env node
/**
 * Says, for every UI file, whether it runs in the browser ('use client'), is bundled for the browser because a client file
 * imports it ("shared"), or only ever runs on the server. It tells where the `useT()` hook (client) or `await getT()`
 * (server) can be used when translating.
 *
 * Usage:  node scripts/i18n-graph.mjs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const walk = (p) => (statSync(p).isFile() ? (/\.tsx?$/.test(p) ? [p] : []) : readdirSync(p).flatMap((n) => walk(path.join(p, n))));
const files = walk('src');
const text = Object.fromEntries(files.map((f) => [f, readFileSync(f, 'utf8')]));
const isClient = (f) => /^\s*(['"])use client\1/.test(text[f]);

const resolve = (spec, from) => {
  let base;
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ['.tsx', '.ts', path.sep + 'index.tsx', path.sep + 'index.ts']) if (text[base + ext] !== undefined) return base + ext;
  return null;
};
const imports = (f) => [...text[f].matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => resolve(m[1], f)).filter(Boolean);

// everything a client file imports (directly or not) is bundled for the browser
const inBrowser = new Set(files.filter(isClient));
for (let grew = true; grew; ) {
  grew = false;
  for (const f of [...inBrowser]) for (const r of imports(f)) if (!inBrowser.has(r)) (inBrowser.add(r), (grew = true));
}

const ui = /src[\\/](components[\\/](app|verify|ui)|app[\\/](app|terrain|recu|verifier))/;
for (const f of files.filter((f) => ui.test(f) && !f.includes('admin')).sort()) {
  const kind = isClient(f) ? 'client' : inBrowser.has(f) ? 'shared' : 'server';
  console.log(kind.padEnd(7), f.split(path.sep).join('/'));
}
