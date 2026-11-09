import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const walk = (p: string): string[] => (statSync(p).isFile() ? (/\.tsx?$/.test(p) ? [p] : []) : readdirSync(p).flatMap((n) => walk(path.join(p, n))));

/**
 * In the App Router a layout and the pages under it render side by side: the redirect of a layout does not stop its
 * pages from running. A page that writes `(await getSessionUser())!` therefore dereferences `null` for a visitor with no
 * session: the redirect still wins (307), but the server logs a TypeError on every such visit. Found by the first Docker
 * run: four tab pages did it, each logged an error whenever a robot or an expired session asked for them.
 */
describe('pages behind the session guard', () => {
  it('never assume a session with "!": they test it and redirect, as every other signed-in page does', () => {
    const offenders: string[] = [];
    for (const file of walk(path.join(process.cwd(), 'src', 'app'))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (/getSessionUser\(\)\s*\)\s*!/.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
