import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let auth: typeof import('@/server/auth');
let recovery: typeof import('@/server/guestRecovery');
let db: typeof import('@/server/db');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-recover-'));
  auth = await import('@/server/auth');
  recovery = await import('@/server/guestRecovery');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_GUEST', '1');
  await db.resetDb();
});
afterEach(() => vi.unstubAllEnvs());

describe('the recovery link of a guest account (its second key)', () => {
  it('opens the account it was made for, after a sign-out and from anywhere', async () => {
    const guest = await auth.guestUser();
    const token = recovery.recoveryTokenOf(guest)!;
    expect(token).toMatch(/^u_guest_[0-9a-f]{12}\.0\.[0-9a-f]{32}$/);
    // signing out raises the session version: the cookie is dead, the link is not
    await db.withDb((d) => void (d.users.find((u) => u.id === guest.id)!.sessionVersion = 1));
    expect((await recovery.recoverGuest(token)).id).toBe(guest.id);
  });

  it('is refused when it is altered, cut, made for another account, or from another server secret', async () => {
    const a = await auth.guestUser();
    const b = await auth.guestUser();
    const token = recovery.recoveryTokenOf(a)!;
    const [id, version, mac] = token.split('.');
    for (const bad of [`${id}.${version}.${'0'.repeat(32)}`, `${b.id}.${version}.${mac}`, `${id}.1.${mac}`, `${id}.${version}`, `${id}.${version}.${mac}.x`, '', `u_guest_x.0.${mac}`, `${id}.-1.${mac}`]) {
      await expect(recovery.recoverGuest(bad), bad).rejects.toMatchObject({ status: 404, code: 'bad_recovery' });
    }
    vi.stubEnv('SESSION_SECRET', 'another-long-random-secret-of-more-than-32-characters');
    await expect(recovery.recoverGuest(token)).rejects.toMatchObject({ code: 'bad_recovery' });
  });

  it('only exists for guest accounts: a phone account or the demo account cannot be opened this way', async () => {
    const real = { id: 'u_phone', firstName: 'Awa', lastName: 'D', country: 'FR', phone: '+33611223344', createdAt: new Date().toISOString() };
    await db.withDb((d) => void d.users.push({ ...real }));
    expect(recovery.recoveryTokenOf(real)).toBeNull();
    await expect(recovery.recoverGuest(`u_phone.0.${'a'.repeat(32)}`)).rejects.toMatchObject({ code: 'bad_recovery' });
    await expect(recovery.recoverGuest(`u_aminata.0.${'a'.repeat(32)}`)).rejects.toMatchObject({ code: 'bad_recovery' });
    await expect(recovery.renewRecovery(real)).rejects.toMatchObject({ status: 403, code: 'not_guest' });
  });

  it('renewing it kills the old link at once and gives a new working one', async () => {
    const guest = await auth.guestUser();
    const old = recovery.recoveryTokenOf(guest)!;
    const fresh = await recovery.renewRecovery(guest);
    expect(fresh).not.toBe(old);
    expect(fresh.split('.')[1]).toBe('1');
    await expect(recovery.recoverGuest(old)).rejects.toMatchObject({ code: 'bad_recovery' });
    expect((await recovery.recoverGuest(fresh)).id).toBe(guest.id);
  });
});
