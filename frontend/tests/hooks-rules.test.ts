import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const walk = (p: string): string[] => (statSync(p).isFile() ? (/\.tsx?$/.test(p) ? [p] : []) : readdirSync(p).flatMap((n) => walk(path.join(p, n))));

/** Calls of a hook (`useT`, `useLang`) made in a function that is neither a component nor a hook: React refuses them at run time. */
function misplacedHooks(): string[] {
  const found: string[] = [];
  for (const file of walk(path.join(process.cwd(), 'src'))) {
    if (file.replace(/\\/g, '/').includes('lib/i18n/client')) continue;
    const text = readFileSync(file, 'utf8');
    if (!/\buse(T|Lang)\(\)/.test(text)) continue;
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const visit = (n: ts.Node, fn: string | null) => {
      let name = fn;
      if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
      else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && ts.isVariableDeclaration(n.parent) && ts.isIdentifier(n.parent.name)) name = n.parent.name.text;
      else if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) name = '(anonymous)';
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^use(T|Lang)$/.test(n.expression.text)) {
        const ok = name !== null && (/^[A-Z]/.test(name) || /^use[A-Z]/.test(name));
        if (!ok) found.push(`${path.relative(process.cwd(), file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} calls ${n.expression.text}() in "${name}"`);
      }
      ts.forEachChild(n, (c) => visit(c, name));
    };
    visit(sf, null);
  }
  return found;
}

describe('hooks', () => {
  it('useT() and useLang() are only called while a component renders (an event handler or a helper function would crash)', () => {
    expect(misplacedHooks()).toEqual([]);
  });
});
