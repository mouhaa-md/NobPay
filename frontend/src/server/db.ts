import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Db } from '@/lib/types';
import { getConfig } from './config';
import { buildSeed } from './seed';

/**
 * Tiny JSON-file database, good enough for a prototype running on one machine:
 *  - one in-memory copy shared through globalThis (Next may load this module several times),
 *  - writes are serialised through a promise queue,
 *  - each transaction works on a clone and only replaces the state if it succeeds.
 * Not suitable for serverless hosting (no shared disk): run it locally for the demo.
 */

interface Holder {
  db: Db | null;
  loading: Promise<Db> | null;
  queue: Promise<unknown>;
}

const g = globalThis as unknown as { __nobpay?: Holder };
const holder: Holder = (g.__nobpay ??= { db: null, loading: null, queue: Promise.resolve() });

const dbFile = () => path.join(getConfig().dataDir, 'db.json');

async function persist(db: Db): Promise<void> {
  const file = dbFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(db));
  await fs.rename(tmp, file);
}

async function load(): Promise<Db> {
  if (holder.db) return holder.db;
  holder.loading ??= (async () => {
    const file = dbFile();
    try {
      holder.db = JSON.parse(await fs.readFile(file, 'utf8')) as Db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // unreadable file: keep a copy, start again from the demo data
        await fs.rename(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
      }
      holder.db = buildSeed();
      await persist(holder.db);
    }
    return holder.db;
  })();
  return holder.loading;
}

/** Snapshot for reading (a copy: safe to keep and to pass to components). */
export async function readDb(): Promise<Db> {
  await holder.queue;
  return structuredClone(await load());
}

/** Atomic read-modify-write. If `fn` throws, nothing is changed. */
export function withDb<T>(fn: (db: Db) => T | Promise<T>): Promise<T> {
  const run = holder.queue.then(async () => {
    const current = await load();
    const draft = structuredClone(current);
    const result = await fn(draft);
    holder.db = draft;
    await persist(draft);
    return result;
  });
  holder.queue = run.catch(() => undefined);
  return run;
}

export async function resetDb(): Promise<void> {
  await withDb((db) => {
    const fresh = buildSeed();
    Object.assign(db, fresh);
  });
}
