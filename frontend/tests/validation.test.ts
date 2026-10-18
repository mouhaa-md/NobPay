import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string) => void jar.set(n, { value }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

type Route = (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>;
const routes: Record<string, Route> = {};
let services: typeof import('@/server/services');
let mt: typeof import('@/server/managerToken');
let auth: typeof import('@/server/auth');
let db: typeof import('@/server/db');
let dataDir: string;

beforeAll(async () => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'nobpay-valid-'));
  process.env.DATA_DIR = dataDir;
  routes.otp = (await import('@/app/api/auth/otp/route')).POST as unknown as Route;
  routes.login = (await import('@/app/api/auth/login/route')).POST as unknown as Route;
  routes.register = (await import('@/app/api/auth/register/route')).POST as unknown as Route;
  routes.projects = (await import('@/app/api/projects/route')).POST as unknown as Route;
  routes.fundings = (await import('@/app/api/projects/[id]/fundings/route')).POST as unknown as Route;
  routes.quote = (await import('@/app/api/projects/[id]/steps/[stepId]/quote/route')).POST as unknown as Route;
  routes.reject = (await import('@/app/api/projects/[id]/steps/[stepId]/reject/route')).POST as unknown as Route;
  routes.proof = (await import('@/app/api/projects/[id]/steps/[stepId]/proof/route')).POST as unknown as Route;
  services = await import('@/server/services');
  mt = await import('@/server/managerToken');
  auth = await import('@/server/auth');
  db = await import('@/server/db');
});
beforeEach(async () => {
  jar.clear();
  vi.stubEnv('RATE_LIMIT', '0');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  await db.resetDb();
});
afterEach(() => vi.unstubAllEnvs());

const json = (body: unknown | string) =>
  new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const signIn = async () => {
  const user = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
  auth.startSession(user);
  return user;
};
const expect400 = async (res: Response, code = 'invalid_input') => {
  const body = await res.json();
  expect(res.status, JSON.stringify(body)).toBe(400);
  expect(body.code).toBe(code);
  expect(typeof body.error).toBe('string');
  return body.error as string;
};

describe('JSON bodies', () => {
  it('rejects unreadable JSON and bodies that are too big (413)', async () => {
    await expect400(await routes.otp(json('{not json')), 'bad_json');
    const big = await routes.register(json({ firstName: 'x'.repeat(200_000) }));
    expect(big.status).toBe(413);
  });

  it('refuses wrong types, absurd lengths and unknown fields on sign-in routes, in French', async () => {
    expect(await expect400(await routes.otp(json({ phone: 123456789 })))).toContain('phone');
    expect(await expect400(await routes.otp(json({ phone: 'x'.repeat(10_000) })))).toContain('Numéro');
    expect(await expect400(await routes.otp(json({ phone: '+33611223344', admin: true })))).toContain('inattendu');
    await expect400(await routes.login(json({ phone: '+33611223344', otp: { $gt: '' } })));
    await expect400(await routes.login(json({ phone: '+33611223344', otp: 'x'.repeat(500) })));
    expect(await expect400(await routes.register(json({ firstName: '', lastName: 'B', country: 'FR', phone: '+33611223344', otp: '123456' })))).toContain('Prénom');
    expect(await expect400(await routes.register(json({ firstName: 'A', lastName: 'B', country: 'France', phone: '+33611223344', otp: '123456' })))).toContain('Pays');
  });
});

describe('project creation', () => {
  const ok = { name: 'Boutique', sector: 'commerce', city: 'Dakar', budgetCents: 20_000, managerName: 'Moussa', managerPhone: '+221771234567', steps: [{ title: 'Stock', amountCents: 10_000, proofKinds: ['facture'] }, { title: 'Local', amountCents: 10_000, proofKinds: ['photos', 'facture'] }] };

  it('accepts exactly what the screen sends (including no managerPhone and no proofKinds)', async () => {
    await signIn();
    expect((await routes.projects(json(ok))).status).toBe(200);
    const { managerPhone: _p, ...noPhone } = ok;
    const bare = { ...noPhone, steps: [{ title: 'Tout', amountCents: 20_000 }] };
    expect((await routes.projects(json(bare))).status).toBe(200);
  });

  it.each([
    ['steps is not an array', { ...ok, steps: 'x' }],
    ['steps contain numbers', { ...ok, steps: [1, 2] }],
    ['no steps', { ...ok, steps: [] }],
    ['13 steps', { ...ok, steps: Array.from({ length: 13 }, () => ({ title: 't', amountCents: 100 })) }],
    ['budget as a string', { ...ok, budgetCents: '20000' }],
    ['budget below the minimum', { ...ok, budgetCents: 99 }],
    ['budget above the maximum', { ...ok, budgetCents: 50_000_001 }],
    ['fractional amount', { ...ok, steps: [{ title: 'a', amountCents: 100.5 }] }],
    ['negative amount', { ...ok, steps: [{ title: 'a', amountCents: -500 }] }],
    ['name is an object', { ...ok, name: { a: 1 } }],
    ['name too long', { ...ok, name: 'n'.repeat(5000) }],
    ['unknown sector', { ...ok, sector: 'crypto' }],
    ['unknown proof kind', { ...ok, steps: [{ title: 'a', amountCents: 100, proofKinds: ['video'] }] }],
    ['extra top-level field', { ...ok, ownerId: 'u_someone' }],
    ['extra step field', { ...ok, steps: [{ title: 'a', amountCents: 100, status: 'paid' }] }],
  ])('refuses: %s', async (_name, body) => {
    await signIn();
    await expect400(await routes.projects(json(body)));
  });

  it('refuses a budget written as 1e999 (Infinity once parsed)', async () => {
    await signIn();
    await expect400(await routes.projects(json('{"name":"ab","sector":"commerce","city":"c","budgetCents":1e999,"managerName":"m","steps":[{"title":"t","amountCents":100}]}')));
  });

  it('keeps the funder-friendly messages for the common mistakes', async () => {
    await signIn();
    expect(await expect400(await routes.projects(json({ ...ok, budgetCents: 99 })))).toBe('Le budget doit être compris entre 100 $ et 500 000 $');
    expect(await expect400(await routes.projects(json({ ...ok, sector: 'x' })))).toBe('Secteur invalide');
  });
});

describe('fundings, quotes and rejections', () => {
  it('accept the screen payloads and refuse absurd ones', async () => {
    await signIn();
    const ctx = { params: { id: 'p_champ', stepId: 'p_champ_s1' } };
    expect((await routes.fundings(json({ amountCents: 5000, method: 'lightning' }), ctx)).status).toBe(200);
    for (const body of [{ amountCents: '5000' }, { amountCents: -1 }, { amountCents: 1e12 }, { amountCents: 500, method: 'cash' }, { amountCents: 500, x: 1 }, {}]) {
      await expect400(await routes.fundings(json(body), ctx));
    }
    await expect400(await routes.fundings(json('{"amountCents":1e999}'), ctx));
    await expect400(await routes.quote(json({ simulate: 'yes' }), ctx));
    await expect400(await routes.reject(json({ note: 42 }), ctx));
    await expect400(await routes.reject(json({ note: 'n'.repeat(5000) }), ctx));
  });
});

describe('proof upload (multipart)', () => {
  const setup = async () => {
    const owner = await signIn();
    const project = await services.createProject(owner, { name: 'Preuve', sector: 'commerce', city: 'Dakar', budgetCents: 20_000, managerName: 'M', steps: [{ title: 'Un', amountCents: 20_000, proofKinds: ['facture'] }] });
    await db.withDb((d) => void (d.projects.find((p) => p.id === project.id)!.steps[0].status = 'active'));
    jar.clear();
    return { project, token: mt.managerLinkToken(project), ctx: { params: { id: project.id, stepId: project.steps[0].id } } };
  };
  const png = new Blob([Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(30, 7)])], { type: 'image/png' });
  const form = (token: string, extra: Record<string, string | Blob> = {}) => {
    const f = new FormData();
    f.set('token', token);
    f.set('photoMeta', JSON.stringify([{ takenAt: new Date().toISOString(), lat: 14.79, lng: -16.93, accuracy: 12 }]));
    f.set('supplierName', 'Quincaillerie Ndiaye');
    f.set('supplierPhone', '+221776543210');
    f.set('supplierNetwork', 'wave');
    f.append('photos', png, 'p.png');
    f.set('invoice', png, 'f.png');
    for (const [k, v] of Object.entries(extra)) f.set(k, v);
    return new Request('http://localhost/x', { method: 'POST', body: f });
  };

  it('accepts the form the field screen sends', async () => {
    const { token, ctx } = await setup();
    const res = await routes.proof(form(token), ctx);
    expect(res.status, JSON.stringify(await res.clone().json())).toBe(200);
  });

  it.each([
    ['latitude out of range', { photoMeta: JSON.stringify([{ lat: 999, lng: 0 }]) }],
    ['photoMeta is not JSON', { photoMeta: '{oops' }],
    ['photoMeta is not an array', { photoMeta: '{"lat":1}' }],
    ['a photo date that is not a date', { photoMeta: JSON.stringify([{ takenAt: 'yesterday-ish' }]) }],
    ['a photo date in the future', { photoMeta: JSON.stringify([{ takenAt: '2999-01-01T00:00:00Z' }]) }],
    ['unknown meta field', { photoMeta: JSON.stringify([{ lat: 1, lng: 1, evil: true }]) }],
    ['an operator that does not exist', { supplierNetwork: 'paypal' }],
    ['a supplier name of 100 000 characters', { supplierName: 'x'.repeat(100_000) }],
    ['an invoice amount that is not a number', { invoiceAmountFcfa: 'abc' }],
    ['a note of 100 000 characters', { note: 'n'.repeat(100_000) }],
  ])('refuses %s, before any file is written', async (_n, extra) => {
    const { project, token, ctx } = await setup();
    await expect400(await routes.proof(form(token, extra as Record<string, string>), ctx));
    expect(existsSync(path.join(dataDir, 'uploads', project.id))).toBe(false);
  });

  it('stores the photo date normalised as an ISO date', async () => {
    const { project, token, ctx } = await setup();
    const res = await routes.proof(form(token, { photoMeta: JSON.stringify([{ takenAt: '2026-10-17 14:30:00', lat: 1, lng: 2 }]) }), ctx);
    expect(res.status).toBe(200);
    const step = (await db.readDb()).projects.find((p) => p.id === project.id)!.steps[0];
    expect(step.proof!.photos[0].takenAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
