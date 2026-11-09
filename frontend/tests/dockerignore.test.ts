import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * frontend/.dockerignore decides what `COPY . .` can see in the image build. frontend/.env.local holds the developer's real
 * credentials (Bitnob keys, session secret): it must never enter a build context, nor any layer that could be pushed.
 */
const patterns = (file: string) =>
  readFileSync(path.resolve(__dirname, '..', file), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

describe('frontend/.dockerignore', () => {
  const ignored = patterns('.dockerignore');

  it('keeps every environment file and the local data out, except the example', () => {
    for (const p of ['.env', '.env.*', '.data']) expect(ignored).toContain(p);
    expect(ignored.indexOf('!.env.example')).toBeGreaterThan(ignored.indexOf('.env.*')); // the exception comes after the rule
  });

  it('keeps dependencies and the host build output out: the image installs and builds on its own', () => {
    for (const p of ['node_modules', '.next', '*.tsbuildinfo', 'next-env.d.ts']) expect(ignored).toContain(p);
  });

  it('repeats the secret and data rules of .gitignore (a file Git ignores for safety is not copied either)', () => {
    const git = patterns('.gitignore').map((p) => p.replace(/\/$/, ''));
    for (const p of ['.env', '.data']) expect(git).toContain(p);
    // .gitignore names .env.local and .env.*.local; both fall under the broader .env.* of the Docker side
    for (const p of ['.env.local', '.env.*.local']) expect(git).toContain(p);
    expect(ignored).toContain('.env.*');
  });
});
