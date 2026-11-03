import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Each test gets a fresh module (the database lives in a global holder) and its own data folder. */
async function freshDb(): Promise<{ db: typeof import('@/server/db'); dir: string; file: string }> {
  const dir = mkdtempSync(path.join(tmpdir(), 'nobpay-dbfile-'));
  vi.stubEnv('DATA_DIR', dir);
  delete (globalThis as { __nobpay?: unknown }).__nobpay;
  vi.resetModules();
  const db = await import('@/server/db');
  return { db, dir, file: path.join(dir, 'db.json') };
}

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
});
afterEach(() => {
  vi.unstubAllEnvs();
  delete (globalThis as { __nobpay?: unknown }).__nobpay;
});

describe('a database file that exists but cannot be read', () => {
  it('on a demonstration: the file is kept aside and the demonstration data come back', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('LIGHTNING_RAIL', '');
    const { db, dir, file } = await freshDb();
    writeFileSync(file, '{"projects": [ truncated');
    const d = await db.readDb();
    expect(d.projects.length).toBeGreaterThan(0);
    expect(readdirSync(dir).some((n) => n.startsWith('db.json.corrupt-'))).toBe(true);
  });

  it('on a real-bitcoin instance: it is never replaced, nothing is invented, and the message says what to restore', async () => {
    vi.stubEnv('LIGHTNING_RAIL', 'nwc');
    const { db, file } = await freshDb();
    const broken = '{"projects": [ truncated';
    writeFileSync(file, broken);
    await expect(db.readDb()).rejects.toMatchObject({ name: 'DatabaseUnreadableError', message: expect.stringContaining('backup.sh') });
    expect(readFileSync(file, 'utf8')).toBe(broken); // untouched: the operator restores a backup over it
    await expect(db.withDb((d) => void d.users.push({} as never))).rejects.toMatchObject({ name: 'DatabaseUnreadableError' });
    expect(readFileSync(file, 'utf8')).toBe(broken); // and a write cannot slip through either
  });

  it('the same for a sandbox instance and for a production one without the demo', async () => {
    for (const env of [{ BITNOB_MODE: 'sandbox', ALLOW_DEMO: '' }, { BITNOB_MODE: 'mock', NODE_ENV: 'production', ALLOW_DEMO: '0' }]) {
      for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
      const { db, file } = await freshDb();
      writeFileSync(file, 'not json');
      await expect(db.readDb(), JSON.stringify(env)).rejects.toMatchObject({ name: 'DatabaseUnreadableError' });
      vi.unstubAllEnvs();
      vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
    }
  });

  it('once the file is restored, the next request reads it: no restart needed', async () => {
    vi.stubEnv('LIGHTNING_RAIL', 'nwc');
    const { db, file } = await freshDb();
    const good = JSON.stringify((await (async () => { const seed = await import('@/server/seed'); return seed.buildSeed(); })()));
    writeFileSync(file, 'garbage');
    await expect(db.readDb()).rejects.toBeTruthy();
    writeFileSync(file, good);
    expect((await db.readDb()).projects.length).toBeGreaterThan(0);
  });

  it('a first start (no file yet) is not an error, even on a real instance', async () => {
    vi.stubEnv('LIGHTNING_RAIL', 'nwc');
    const { db, dir } = await freshDb();
    mkdirSync(dir, { recursive: true });
    expect((await db.readDb()).projects.length).toBeGreaterThan(0);
  });
});

describe('writing the file', () => {
  it('leaves exactly the data and no temporary file behind', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('LIGHTNING_RAIL', '');
    const { db, dir, file } = await freshDb();
    await db.withDb((d) => void (d.users[0].firstName = 'Écrit'));
    expect(JSON.parse(readFileSync(file, 'utf8')).users[0].firstName).toBe('Écrit');
    expect(readdirSync(dir).filter((n) => n.endsWith('.tmp'))).toEqual([]);
  });
});
