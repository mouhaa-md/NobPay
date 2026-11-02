#!/usr/bin/env node
/**
 * One-time migration tool, second pass (after i18n-wrap.mjs): wraps the French strings the screens render through
 * `t('…')`, in the places where a string is shown to the user:
 *   - the text-like attributes (placeholder, aria-label, alt, title, label), as a literal or in a condition;
 *   - literals in a condition (`ok ? 'A' : 'B'`, `x && 'A'`, `x || 'A'`) written inside JSX braces;
 *   - the argument of setError(…) and new Error(…);
 *   - template literals in those places: `${n} événements` becomes t('{n} événements', { n }).
 * It adds `const t = useT();` (client files) or `const t = await getT();` (server files, which become async) at the start of
 * the component, and the import. Files it cannot do safely are listed, to be done by hand. Running it again changes nothing.
 *
 * Usage:  node scripts/i18n-wrap-strings.mjs [--write] <file or folder> ...
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const args = process.argv.slice(2);
const write = args.includes('--write');
const targets = args.filter((a) => !a.startsWith('--'));
const ATTRS = new Set(['placeholder', 'aria-label', 'alt', 'title', 'label']);
const CALLS = new Set(['setError']);

const walk = (p) => (statSync(p).isFile() ? (/\.tsx?$/.test(p) ? [path.normalize(p)] : []) : readdirSync(p).flatMap((n) => walk(path.join(p, n))));
const all = walk('src');
const text = Object.fromEntries(all.map((f) => [f, readFileSync(f, 'utf8')]));
const isClientFile = (f) => /^\s*(['"])use client\1/.test(text[f]);
const resolveImport = (spec, from) => {
  let base;
  if (spec.startsWith('@/')) base = path.join('src', spec.slice(2));
  else if (spec.startsWith('.')) base = path.join(path.dirname(from), spec);
  else return null;
  for (const ext of ['.tsx', '.ts', path.sep + 'index.tsx', path.sep + 'index.ts']) if (text[base + ext] !== undefined) return base + ext;
  return null;
};
const inBrowser = new Set(all.filter(isClientFile));
for (let grew = true; grew; ) {
  grew = false;
  for (const f of [...inBrowser]) for (const m of text[f].matchAll(/from\s+['"]([^'"]+)['"]/g)) {
    const r = resolveImport(m[1], f);
    if (r && !inBrowser.has(r)) (inBrowser.add(r), (grew = true));
  }
}

const quote = (s) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
// loose: the string is the value of a text attribute (aria-label="Retour"), so a single plain word is text too
const looksLikeText = (s, loose = false) => {
  if (!/\p{L}{2,}/u.test(s) || /^(https?:|\/)/.test(s)) return false;
  if (loose) return !/^\w+[_.:#%@\-/][\w\-:./#%@]*$/.test(s);
  return (/\s/.test(s) || /[^\x00-\x7f]/.test(s) || /^\p{Lu}/u.test(s)) && !/^[\w\-:./#%@]+$/.test(s);
};

function nameFor(expr, used) {
  let base = 'v';
  if (ts.isIdentifier(expr)) base = expr.text;
  else if (ts.isPropertyAccessExpression(expr)) base = expr.name.text;
  else if (ts.isCallExpression(expr)) base = ts.isIdentifier(expr.expression) ? expr.expression.text : ts.isPropertyAccessExpression(expr.expression) ? expr.expression.name.text : 'v';
  else if (ts.isConditionalExpression(expr)) {
    const lit = [expr.whenTrue, expr.whenFalse].filter(ts.isStringLiteral).map((l) => l.text);
    base = lit.every((l) => l === '' || l === 's' || l === 'x') ? 's' : 'v';
  } else if (ts.isNonNullExpression(expr)) return nameFor(expr.expression, used);
  base = base.replace(/\W/g, '') || 'v';
  let name = base;
  for (let i = 2; used.has(name); i++) name = `${base}${i}`;
  used.add(name);
  return name;
}

const report = [];
let touched = 0;
let wrapped = 0;

for (const file of targets.flatMap(walk)) {
  if (file.includes('admin') || file.includes(`i18n${path.sep}`)) continue;
  const code = text[file] ?? readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const client = isClientFile(file);
  const kind = client ? 'client' : inBrowser.has(file) ? 'shared' : 'server';

  // a variable called t would be shadowed or would shadow ours
  let hasT = false;
  const alreadyIn = new Set(); // functions where an earlier run already declared our t
  const findT = (n) => {
    if ((ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isBindingElement(n)) && ts.isIdentifier(n.name) && n.name.text === 't') {
      if (ts.isVariableDeclaration(n) && n.initializer && /^(useT\(\)|await getT\(\))$/.test(n.initializer.getText(source))) {
        for (let f = n.parent; f; f = f.parent) if (ts.isFunctionDeclaration(f) || ts.isArrowFunction(f) || ts.isFunctionExpression(f)) { alreadyIn.add(f); break; }
      } else hasT = true;
    }
    ts.forEachChild(n, findT);
  };
  findT(source);

  const candidates = []; // { node, jsxAttr }
  const consider = (node, jsxAttr, loose = false) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (looksLikeText(node.text, loose)) candidates.push({ node, jsxAttr });
    } else if (ts.isTemplateExpression(node)) {
      const statics = [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(' ');
      if (looksLikeText(statics.trim()) || /\p{L}{3,}/u.test(statics)) candidates.push({ node, jsxAttr });
    }
  };
  const propagate = (node, jsxAttr, loose = false) => {
    if (!node) return;
    if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isNonNullExpression(node)) return propagate(node.expression, jsxAttr, loose);
    if (ts.isConditionalExpression(node)) {
      propagate(node.whenTrue, jsxAttr, loose);
      propagate(node.whenFalse, jsxAttr, loose);
      return;
    }
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return propagate(node.right, jsxAttr, loose);
      if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
        propagate(node.left, jsxAttr, loose);
        return propagate(node.right, jsxAttr, loose);
      }
      return;
    }
    consider(node, jsxAttr, loose);
  };
  const visit = (node) => {
    if (ts.isJsxAttribute(node) && ATTRS.has(node.name.getText(source)) && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) consider(node.initializer, true, true);
      else if (ts.isJsxExpression(node.initializer)) propagate(node.initializer.expression, false, true);
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      propagate(node.expression, false);
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CALLS.has(node.expression.text)) {
      propagate(node.arguments[0], false);
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Error') {
      propagate(node.arguments?.[0], false);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  // nested conditions can be reached twice (through the outer and the inner JSX expression)
  const seen = new Set();
  const unique = candidates.filter((c) => (seen.has(c.node.pos) ? false : (seen.add(c.node.pos), true)));
  if (unique.length === 0) continue;
  if (hasT) {
    report.push(`${file}: has its own variable named t, do by hand (${unique.length} strings)`);
    continue;
  }
  if (kind === 'shared') {
    report.push(`${file}: shared by client and server files, do by hand (${unique.length} strings)`);
    continue;
  }

  const outermost = (node) => {
    let found;
    for (let n = node.parent; n; n = n.parent) if (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isMethodDeclaration(n)) found = n;
    return found;
  };
  const edits = [];
  const fns = new Map();
  let skipped = 0;
  for (const { node, jsxAttr } of unique) {
    const fn = outermost(node);
    if (!fn || !fn.body || !ts.isBlock(fn.body)) {
      skipped += 1;
      continue;
    }
    fns.set(fn, true);
    let replacement;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) replacement = `t(${quote(node.text)})`;
    else {
      const used = new Set();
      let key = node.head.text;
      const vars = [];
      for (const span of node.templateSpans) {
        const name = nameFor(span.expression, used);
        key += `{${name}}${span.literal.text}`;
        vars.push(name === span.expression.getText(source) ? name : `${name}: ${span.expression.getText(source)}`);
      }
      replacement = `t(${quote(key)}, { ${vars.join(', ')} })`;
    }
    edits.push({ start: node.getStart(source), end: node.getEnd(), text: jsxAttr ? `{${replacement}}` : replacement });
    wrapped += 1;
  }
  if (skipped) report.push(`${file}: ${skipped} string(s) in a function without a block body, do by hand`);
  if (fns.size === 0) continue;

  for (const fn of fns.keys()) {
    if (alreadyIn.has(fn)) continue;
    const decl = kind === 'client' ? 'const t = useT();' : 'const t = await getT();';
    edits.push({ start: fn.body.getStart(source) + 1, end: fn.body.getStart(source) + 1, text: `\n  ${decl}` });
    if (kind === 'server' && !fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) {
      const at = ts.isArrowFunction(fn) ? fn.getStart(source) : fn.getChildren(source).find((c) => c.kind === ts.SyntaxKind.FunctionKeyword)?.getStart(source);
      if (at !== undefined) edits.push({ start: at, end: at, text: 'async ' });
    }
  }

  let out = code;
  for (const e of edits.sort((a, b) => b.start - a.start || b.end - a.end)) out = out.slice(0, e.start) + e.text + out.slice(e.end);

  const hook = kind === 'client' ? 'useT' : 'getT';
  const from = kind === 'client' ? '@/lib/i18n/client' : '@/lib/i18n/server';
  const existing = new RegExp(`import \\{([^}]*)\\} from '${from.replace('/', '\\/')}';`);
  if (existing.test(out)) {
    if (!new RegExp(`\\b${hook}\\b`).test(out.match(existing)[1])) out = out.replace(existing, (m, names) => `import {${names.trimEnd()}, ${hook} } from '${from}';`);
  } else {
    const imports = source.statements.filter(ts.isImportDeclaration);
    const at = imports.length ? imports[imports.length - 1].getEnd() : out.indexOf('\n', out.indexOf("'use client'") + 1);
    // the edits above all come after the imports, so the offset is still right in the edited text
    out = out.slice(0, at) + `\nimport { ${hook} } from '${from}';` + out.slice(at);
  }
  touched += 1;
  console.log(`${write ? 'wrapped' : 'would wrap'} ${String(unique.length - skipped).padStart(3)} in ${file} (${kind})`);
  if (write) writeFileSync(file, out);
}

console.log(`\n${wrapped} strings in ${touched} files.`);
if (report.length) console.log(`\nTo do by hand:\n${report.map((r) => `  - ${r}`).join('\n')}`);
