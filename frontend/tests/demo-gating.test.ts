import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string) => void jar.set(name, { value }),
    delete: (name: string) => void jar.delete(name),
  }),
}));

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
const post = (init?: { json?: unknown }) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init?.json ?? {}) });
// Next always hands a Request to a route; calls without one get a plain POST
const withRequest = (fn: unknown) => (req?: Request) => (fn as (r: Request) => Promise<Response>)(req ?? post());

let routes: Record<'demo' | 'otp' | 'login' | 'register' | 'reset' | 'health', (req?: Request) => Promise<Response>>;
let services: typeof import('@/server/services');
let db: typeof import('@/server/db');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-demo-'));
  routes = {
    demo: withRequest((await import('@/app/api/auth/demo/route')).POST),
    otp: withRequest((await import('@/app/api/auth/otp/route')).POST),
    login: (await import('@/app/api/auth/login/route')).POST as never,
    register: (await import('@/app/api/auth/register/route')).POST as never,
    reset: (await import('@/app/api/dev/reset/route')).POST as never,
    health: ((get) => (req?: Request) => get(req ?? new Request('http://localhost/api/health')))((await import('@/app/api/health/route')).GET as (r: Request) => Promise<Response>),
  };
  services = await import('@/server/services');
  db = await import('@/server/db');
});
beforeEach(() => {
  jar.clear();
  vi.stubEnv('SESSION_SECRET', STRONG);
});
afterEach(() => vi.unstubAllEnvs());

const sandboxWithoutDemo = () => {
  vi.stubEnv('BITNOB_MODE', 'sandbox');
  vi.stubEnv('BITNOB_WEBHOOK_SECRET', 'whsec_x');
  vi.stubEnv('ALLOW_DEMO', '');
};

describe('sandbox without ALLOW_DEMO: every demo convenience is closed', () => {
  it('demo account: 403', async () => {
    sandboxWithoutDemo();
    const res = await routes.demo();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe('demo_disabled');
    expect(jar.size).toBe(0); // no cookie issued
  });

  it('SMS code: no code is announced and the shared code is not accepted', async () => {
    sandboxWithoutDemo();
    const otp = await routes.otp();
    expect(otp.status).toBe(503);
    expect(await otp.json()).not.toHaveProperty('demoCode');

    const usersBefore = (await db.readDb()).users.length;
    const login = await routes.login(post({ json: { phone: '+221700000000', otp: '123456' } }));
    expect(login.status).toBe(503);
    const reg = await routes.register(post({ json: { firstName: 'A', lastName: 'B', country: 'FR', phone: '+33699999999', otp: '123456' } }));
    expect(reg.status).toBe(503);
    expect((await db.readDb()).users).toHaveLength(usersBefore); // no account was created
  });

  it('data reset and simulated payments: 403', async () => {
    sandboxWithoutDemo();
    expect((await routes.reset()).status).toBe(403);
    await expect(services.simulateFundingPaid({ id: 'u_aminata' } as never, 'f_x')).rejects.toMatchObject({ status: 403 });
  });

  it('"Continuer en simulation" (simulated payout quote): 403 instead of writing a fake payout in a real ledger', async () => {
    sandboxWithoutDemo();
    const user = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
    await expect(services.quoteRelease(user, 'p_villa', 'p_villa_s3', { simulate: true })).rejects.toMatchObject({ status: 403, code: 'demo_disabled' });
  });

  it('/api/health tells the screens that demo is off', async () => {
    sandboxWithoutDemo();
    expect(await (await routes.health()).json()).toMatchObject({ mode: 'sandbox', demo: false });
  });
});

describe('demo allowed (mock by default, or ALLOW_DEMO=1)', () => {
  it('mock mode needs no setting: demo account, shared code and health flag all work', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('ALLOW_DEMO', '');
    const demo = await routes.demo();
    expect(demo.status).toBe(200);
    expect(jar.has('nobpay_session')).toBe(true);
    expect(await (await routes.otp()).json()).toMatchObject({ sent: true, demo: true, demoCode: '123456' });
    expect(await (await routes.health()).json()).toMatchObject({ mode: 'mock', demo: true });
  });

  it('sandbox with ALLOW_DEMO=1 brings the demo conveniences back', async () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('BITNOB_WEBHOOK_SECRET', 'whsec_x');
    vi.stubEnv('ALLOW_DEMO', '1');
    expect((await routes.demo()).status).toBe(200);
    expect((await (await routes.otp()).json()).demoCode).toBe('123456');
  });

  it('mock with ALLOW_DEMO=0 closes them too', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('ALLOW_DEMO', '0');
    expect((await routes.demo()).status).toBe(403);
    expect((await routes.otp()).status).toBe(503);
  });
});

describe('/api/health?detail=1 never reveals balances to the public', () => {
  const detail = () => routes.health(new Request('http://localhost/api/health?detail=1'));

  it('gives the same answer as without detail when nobody is signed in', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    const body = await (await detail()).json();
    expect(body).not.toHaveProperty('balances');
    expect(body).not.toHaveProperty('solvency');
    expect(body).not.toHaveProperty('payoutAsset');
  });

  it('adds the detail for a signed-in demo account', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    await routes.demo(); // signs the demo account in (cookie jar)
    const body = await (await detail()).json();
    expect(body).toMatchObject({ mode: 'mock', payoutAsset: 'USDT' });
    expect(body).toHaveProperty('solvency');
  });
});
