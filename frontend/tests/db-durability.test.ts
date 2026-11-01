import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let db: typeof import('@/server/db');
let goodDir: string;

beforeAll(async () => {
  goodDir = mkdtempSync(path.join(tmpdir(), 'nobpay-dur-'));
  process.env.DATA_DIR = goodDir;
  db = await import('@/server/db');
});
afterEach(() => {
  process.env.DATA_DIR = goodDir;
});

describe('the database never gets ahead of its file', () => {
  it('a failed disk write leaves the state unchanged, and later writes still work', async () => {
    await db.resetDb();
    const before = (await db.readDb()).users.length;

    // a "directory" that is really a file: the write cannot succeed
    const notADir = path.join(goodDir, 'iam-a-file');
    writeFileSync(notADir, 'x');
    process.env.DATA_DIR = path.join(notADir, 'sub');
    await expect(db.withDb((d) => void d.users.push({ id: 'u_ghost' } as never))).rejects.toThrow();
    expect((await db.readDb()).users.some((u) => u.id === 'u_ghost')).toBe(false);
    expect((await db.readDb()).users.length).toBe(before);

    // the disk is back: the same write now goes through
    process.env.DATA_DIR = goodDir;
    await db.withDb((d) => void d.users.push({ id: 'u_real' } as never));
    expect((await db.readDb()).users.some((u) => u.id === 'u_real')).toBe(true);
  });

  it('an error inside the transaction changes nothing either', async () => {
    const before = (await db.readDb()).users.length;
    await expect(
      db.withDb((d) => {
        d.users.push({ id: 'u_half' } as never);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect((await db.readDb()).users.length).toBe(before);
    vi.restoreAllMocks();
  });
});
