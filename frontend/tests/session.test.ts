import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// A tiny cookie jar instead of the Next.js request context.
const jar = vi.hoisted(() => new Map<string, { value: string; opts: Record<string, unknown> }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, opts: Record<string, unknown>) => void jar.set(name, { value, opts }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
let auth: typeof import('@/server/auth');
let config: typeof import('@/server/config');
let db: typeof import('@/server/db');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-session-'));
  auth = await import('@/server/auth');
  config = await import('@/server/config');
  db = await import('@/server/db');
});

beforeEach(() => {
  jar.clear();
  vi.stubEnv('SESSION_SECRET', STRONG);
});
afterEach(() => vi.unstubAllEnvs());

const COOKIE = 'nobpay_session';
const newUser = (id: string, extra: Record<string, unknown> = {}) =>
  db.withDb((d) => {
    const u = { id, firstName: 'T', lastName: 'U', country: 'FR', phone: `+33${id}`, createdAt: new Date().toISOString(), ...extra };
    d.users.push(u);
    return u;
  });

describe('session token', () => {
  it('round-trips and carries the user, version and expiry', () => {
    const now = Date.now();
    const parsed = auth.parseSession(auth.sessionValue('u_1', 3, now), now);
    expect(parsed).toMatchObject({ uid: 'u_1', version: 3 });
    expect(parsed!.exp).toBe(Math.floor(now / 1000) + auth.SESSION_SECONDS);
  });

  it('rejects any tampered field', () => {
    const [uid, v, exp, mac] = auth.sessionValue('u_1', 0).split('.');
    expect(auth.parseSession([uid, v, exp, mac].join('.'))).not.toBeNull();
    expect(auth.parseSession(['u_2', v, exp, mac].join('.'))).toBeNull();
    expect(auth.parseSession([uid, '1', exp, mac].join('.'))).toBeNull();
    expect(auth.parseSession([uid, v, String(Number(exp) + 86400), mac].join('.'))).toBeNull();
    expect(auth.parseSession([uid, v, exp, mac.slice(0, -1) + (mac.endsWith('a') ? 'b' : 'a')].join('.'))).toBeNull();
  });

  it('rejects an expired cookie, a legacy cookie, garbage and a cookie signed with another secret', () => {
    const issued = Date.now() - 8 * 86400_000; // 8 days ago: 7-day lifetime is over
    expect(auth.parseSession(auth.sessionValue('u_1', 0, issued))).toBeNull();
    expect(auth.parseSession('u_1.0123456789abcdef')).toBeNull(); // old format: <id>.<sig>
    expect(auth.parseSession('')).toBeNull();
    expect(auth.parseSession(undefined)).toBeNull();
    expect(auth.parseSession('a.b.c.d')).toBeNull();
    const value = auth.sessionValue('u_1', 0);
    vi.stubEnv('SESSION_SECRET', 'another-long-random-secret-of-more-than-32-chars');
    expect(auth.parseSession(value)).toBeNull();
  });
});

describe('session secret rules', () => {
  it('flags absent, default and short secrets', () => {
    expect(config.sessionSecretProblem(undefined)).toMatch(/absent/);
    expect(config.sessionSecretProblem('nobpay-dev-session-secret')).toMatch(/défaut/);
    expect(config.sessionSecretProblem('change-me')).toMatch(/défaut/);
    expect(config.sessionSecretProblem('x'.repeat(31))).toMatch(/32/);
    expect(config.sessionSecretProblem(STRONG)).toBeNull();
  });

  it('refuses to sign sessions with a weak secret in sandbox, still allows it in mock', () => {
    vi.stubEnv('SESSION_SECRET', 'change-me');
    vi.stubEnv('BITNOB_MODE', 'mock');
    expect(() => auth.sessionValue('u_1')).not.toThrow();
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    expect(() => auth.sessionValue('u_1')).toThrowError(/SESSION_SECRET/);
    vi.stubEnv('SESSION_SECRET', '');
    expect(() => auth.sessionValue('u_1')).toThrowError(/SESSION_SECRET/);
  });

  it('refuses weak secrets in production unless demo mode is on', () => {
    vi.stubEnv('SESSION_SECRET', 'change-me');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('BITNOB_MODE', 'mock');
    expect(config.sessionSecretMustBeStrong()).toBe(false); // mock demo allowed by default: plan B keeps working
    vi.stubEnv('ALLOW_DEMO', '0');
    expect(config.sessionSecretMustBeStrong()).toBe(true);
    expect(() => auth.sessionValue('u_1')).toThrowError(/SESSION_SECRET/);
  });
});

describe('cookie lifecycle', () => {
  it('sets an httpOnly, 7-day cookie; Secure only when PUBLIC_BASE_URL is https', async () => {
    const u = await newUser('u_cookie1');
    vi.stubEnv('PUBLIC_BASE_URL', 'http://localhost:3000');
    auth.startSession(u);
    expect(jar.get(COOKIE)!.opts).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: false, maxAge: 604800 });
    vi.stubEnv('PUBLIC_BASE_URL', 'https://nobpay.example.com');
    auth.startSession(u);
    expect(jar.get(COOKIE)!.opts.secure).toBe(true);
  });

  it('signs the user in, then out everywhere: the old cookie stops working', async () => {
    const u = await newUser('u_logout1');
    auth.startSession(u);
    const oldCookie = jar.get(COOKIE)!.value;
    expect((await auth.getSessionUser())?.id).toBe('u_logout1');

    await auth.endSession();
    expect(jar.has(COOKIE)).toBe(false);
    expect((await db.readDb()).users.find((x) => x.id === 'u_logout1')!.sessionVersion).toBe(1);

    jar.set(COOKIE, { value: oldCookie, opts: {} }); // the same cookie, replayed from another device
    expect(await auth.getSessionUser()).toBeNull();
    await expect(auth.requireUser()).rejects.toMatchObject({ status: 401 });

    const fresh = (await db.readDb()).users.find((x) => x.id === 'u_logout1')!;
    auth.startSession(fresh); // a new sign-in works
    expect((await auth.getSessionUser())?.id).toBe('u_logout1');
  });

  it('keeps the shared demo account signed in elsewhere when one visitor signs out', async () => {
    const u = await newUser('u_demo_shared', { demo: true });
    auth.startSession(u);
    const other = jar.get(COOKIE)!.value;
    await auth.endSession();
    expect((await db.readDb()).users.find((x) => x.id === 'u_demo_shared')!.sessionVersion).toBeUndefined();
    jar.set(COOKIE, { value: other, opts: {} });
    expect((await auth.getSessionUser())?.id).toBe('u_demo_shared');
  });

  it('renews a cookie older than a day on use, and leaves a fresh one alone', async () => {
    const u = await newUser('u_slide1');
    const old = auth.sessionValue(u.id, 0, Date.now() - 2 * 86400_000);
    jar.set(COOKIE, { value: old, opts: {} });
    await auth.requireUser();
    expect(jar.get(COOKIE)!.value).not.toBe(old);
    expect(auth.parseSession(jar.get(COOKIE)!.value)!.exp).toBeGreaterThan(auth.parseSession(old)!.exp);

    const fresh = jar.get(COOKIE)!.value;
    await auth.requireUser();
    expect(jar.get(COOKIE)!.value).toBe(fresh);
  });

  it('does not accept an unknown user or a hand-made cookie', async () => {
    jar.set(COOKIE, { value: auth.sessionValue('u_nobody', 0), opts: {} });
    expect(await auth.getSessionUser()).toBeNull();
    jar.set(COOKIE, { value: 'u_aminata', opts: {} });
    expect(await auth.getSessionUser()).toBeNull();
  });
});
