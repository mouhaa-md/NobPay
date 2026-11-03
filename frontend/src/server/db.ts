import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { Db } from '@/lib/types';
import { getConfig, sessionSecretMustBeStrong } from './config';
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

/** The database file exists but cannot be read, on an instance where that must never be hidden. */
export class DatabaseUnreadableError extends Error {
  constructor(file: string, cause: unknown) {
    super(
      `Le fichier de données ${file} est illisible (${(cause as Error)?.message ?? 'erreur inconnue'}). Il n'a pas été touché : restaurez la dernière sauvegarde (deploy/backup.sh) avant de redémarrer. Repartir de zéro ferait disparaître les séquestres de l'écran alors que l'argent est dans le portefeuille.`,
    );
    this.name = 'DatabaseUnreadableError';
  }
}

async function persist(db: Db): Promise<void> {
  const file = dbFile();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  // the bytes must be on the disk before the rename makes them THE file: after a power cut a renamed but unwritten file is an empty database
  const handle = await fs.open(tmp, 'w');
  try {
    await handle.writeFile(JSON.stringify(db));
    await handle.sync();
  } finally {
    await handle.close();
  }
  await fs.rename(tmp, file);
  try {
    const dir = await fs.open(path.dirname(file), 'r');
    try {
      await dir.sync(); // and the rename itself (not possible on every platform: best effort)
    } finally {
      await dir.close();
    }
  } catch {
    /* Windows cannot open a directory */
  }
}

async function load(): Promise<Db> {
  if (holder.db) return holder.db;
  holder.loading ??= (async () => {
    const file = dbFile();
    try {
      holder.db = JSON.parse(await fs.readFile(file, 'utf8')) as Db;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // A file that exists but cannot be read. On an instance that holds real money, never start again from the demo data
        // (the escrows would vanish from the screens while the sats are in the wallet): stop, say why, leave the file as it is.
        if (sessionSecretMustBeStrong()) {
          holder.loading = null; // the operator restores the file; the next request reads it again, no restart needed
          throw new DatabaseUnreadableError(file, err);
        }
        // a demonstration: keep a copy, start again from the demo data
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
    // Disk first, memory second: if the write fails, what the app believes still equals what the file holds
    // (the other way round, a payment recorded in memory only would vanish at the next restart).
    await persist(draft);
    holder.db = draft;
    return result;
  });
  holder.queue = run.catch(() => undefined);
  return run;
}

export async function resetDb(): Promise<void> {
  await withDb((db) => {
    const fresh = buildSeed();
    // optional collections the seed does not carry must not survive a reset
    delete db.refunds;
    delete db.nostr;
    Object.assign(db, fresh);
  });
}
