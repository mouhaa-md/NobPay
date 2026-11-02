import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { adminScope, isAdmin } from '@/server/admin';

let auth: typeof import('@/server/auth');
let db: typeof import('@/server/db');
let services: typeof import('@/server/services');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-guest-'));
  auth = await import('@/server/auth');
  db = await import('@/server/db');
  services = await import('@/server/services');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '0');
  vi.stubEnv('ADMIN_PHONES', '');
  vi.stubEnv('ALLOW_GUEST', '1');
  await db.resetDb();
});
afterEach(() => vi.unstubAllEnvs());

describe('guest accounts ("try without an account")', () => {
  it('are off unless the instance turns them on', async () => {
    vi.stubEnv('ALLOW_GUEST', '');
    await expect(auth.guestUser()).rejects.toMatchObject({ status: 403, code: 'guest_disabled' });
    vi.stubEnv('ALLOW_GUEST', '0');
    await expect(auth.guestUser()).rejects.toMatchObject({ status: 403, code: 'guest_disabled' });
  });

  it('make a new private account each time: no phone, not the demo account', async () => {
    const a = await auth.guestUser();
    const b = await auth.guestUser();
    expect(a.id).not.toBe(b.id);
    expect(a).toMatchObject({ guest: true, phone: '', firstName: 'Invité' });
    expect(a.demo).toBeUndefined();
    const stored = (await db.readDb()).users.filter((u) => u.guest);
    expect(stored.map((u) => u.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('can never be an administrator, even when the admin list is empty-ish or the demo is on', async () => {
    const guest = await auth.guestUser();
    expect(isAdmin(guest)).toBe(false);
    vi.stubEnv('ADMIN_PHONES', ' , ,');
    expect(adminScope(guest)).toBeNull();
    vi.stubEnv('ALLOW_DEMO', '1');
    expect(adminScope(guest)).toBeNull();
  });

  it('see nothing of what another guest created', async () => {
    const a = await auth.guestUser();
    const b = await auth.guestUser();
    const project = await services.createProject(a, {
      name: 'Projet de A',
      sector: 'commerce',
      city: 'Dakar',
      budgetCents: 10_000,
      managerName: 'Moussa',
      steps: [{ title: 'Étape', amountCents: 10_000 }],
    });
    await expect(services.assertProjectAccess({ kind: 'owner', user: b }, project.id)).rejects.toMatchObject({ status: 403 });
    await expect(services.createFunding(b, project.id, { amountCents: 1_000, method: 'lightning' })).rejects.toMatchObject({ status: 404 });
    await expect(services.assertProjectAccess({ kind: 'owner', user: a }, project.id)).resolves.toMatchObject({ id: project.id });
  });
});
