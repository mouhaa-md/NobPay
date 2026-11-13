import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOBILE_NETWORKS, OPERATOR_LOGOS } from '@/lib/templates';

describe('operator logos', () => {
  it('every logo listed is a real PNG file served from /public', () => {
    for (const [network, url] of Object.entries(OPERATOR_LOGOS)) {
      expect(Object.keys(MOBILE_NETWORKS), network).toContain(network);
      const file = path.join(process.cwd(), 'public', url!);
      expect(existsSync(file), `${network}: ${file}`).toBe(true);
      expect(readFileSync(file).subarray(0, 8).toString('hex'), network).toBe('89504e470d0a1a0a'); // PNG signature
    }
  });

  it('are small files (they load on a field phone)', () => {
    for (const url of Object.values(OPERATOR_LOGOS)) expect(readFileSync(path.join(process.cwd(), 'public', url!)).length).toBeLessThan(60_000);
  });
});
