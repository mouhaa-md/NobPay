import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICONS } from '@/components/ui/icons.generated';

function* sources(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* sources(p);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('icons.generated.ts')) yield p;
  }
}

describe('icons', () => {
  it('every icon written in the code exists in the generated set (else run scripts/build-icons.mjs)', () => {
    const wanted = new Map<string, string>();
    for (const file of sources(path.join(process.cwd(), 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/<Icon[^>]*?\bname=["']([a-z0-9_]+)["']/g)) wanted.set(m[1], file);
      for (const m of text.matchAll(/\bicon(?:=|: ?)["']([a-z0-9_]+)["']/g)) wanted.set(m[1], file);
    }
    expect(wanted.size).toBeGreaterThan(30); // the scan itself works
    const missing = [...wanted].filter(([name]) => !ICONS[name]).map(([name, file]) => `${name} (${path.relative(process.cwd(), file)})`);
    expect(missing).toEqual([]);
  });

  it('every entry is a drawable path, and the whole set stays small (it replaces a 1.1 MB font)', () => {
    for (const [name, [outlined, filled]] of Object.entries(ICONS)) {
      expect(outlined, name).toMatch(/^[Mm][\d\s.,\-a-zA-Z]+$/);
      if (filled) expect(filled, name).toMatch(/^[Mm][\d\s.,\-a-zA-Z]+$/);
    }
    const size = readFileSync(path.join(process.cwd(), 'src/components/ui/icons.generated.ts')).length;
    expect(size).toBeLessThan(120 * 1024);
  });
});
