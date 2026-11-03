import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/types';

let route: typeof import('@/app/.well-known/nostr.json/route');
let services: typeof import('@/server/services');
let keys: typeof import('@/server/nostr/keys');
let db: typeof import('@/server/db');

const owner: User = { id: 'u_nip05', firstName: 'Invité', lastName: 'N', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };
const ask = async (query: string) => {
  const res = await route.GET(new Request(`http://localhost/.well-known/nostr.json${query}`));
  return { res, body: (await res.json()) as { names: Record<string, string> } };
};

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-nip05-'));
  route = await import('@/app/.well-known/nostr.json/route');
  services = await import('@/server/services');
  keys = await import('@/server/nostr/keys');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('NOSTR_MASTER_KEY', 'ab'.repeat(32));
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...owner }));
});
afterEach(() => vi.unstubAllEnvs());

const newProject = () =>
  services.createProject(owner, { name: 'Essai', sector: 'commerce', city: 'Dakar', budgetCents: 1_500, managerName: 'Moi', steps: [{ title: 'Achat', amountCents: 1_500, proofKinds: ['photos'] }] });

describe('NIP-05 (project@domain names the key of the project)', () => {
  it('answers the key the project\'s first ledger event names, for the asked-for name only', async () => {
    vi.stubEnv('NOSTR_PUBLISH', '1');
    const p = await newProject();
    const { res, body } = await ask(`?name=${p.id}`);
    expect(res.headers.get('access-control-allow-origin')).toBe('*'); // a Nostr client asks from a browser
    expect(body.names).toEqual({ [p.id]: keys.projectPublicKey(p.id) });
    expect((await ask(`?name=${p.id.toUpperCase()}`)).body.names[p.id]).toBe(keys.projectPublicKey(p.id)); // names are not case sensitive
  });

  it('never lists the projects: no name, an unknown name or a bad one gives an empty answer', async () => {
    vi.stubEnv('NOSTR_PUBLISH', '1');
    await newProject();
    for (const q of ['', '?name=', '?name=nobody', '?name=p_villa', '?name=../../etc', `?name=${'a'.repeat(80)}`]) expect((await ask(q)).body.names, q).toEqual({});
  });

  it('a project that never published on Nostr has no name (nothing to point at)', async () => {
    vi.stubEnv('NOSTR_PUBLISH', '');
    const p = await newProject();
    expect((await ask(`?name=${p.id}`)).body.names).toEqual({});
  });
});
