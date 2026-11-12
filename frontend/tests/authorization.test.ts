import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  headers: async () => new Headers(), // the AI-opinion route asks for the language of the request
  cookies: () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string) => void jar.set(n, { value }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

/**
 * Who may do what, route by route. Every route that works on a project, a step, a funding or a proof file is called by:
 *  - the owner (control: the call is real, the ids exist, it is not refused for being a stranger);
 *  - a signed-in stranger (refused with 403/404 and NOTHING changes in the database);
 *  - nobody, or somebody holding only a field link (401: the owner's routes do not take a field link).
 * A refusal that leaves the database untouched is the property that matters for an escrow: no stranger can move, read or
 * decide anything on a project that is not theirs.
 */

type Route = (req: Request, ctx?: { params: Record<string, string> }) => Promise<Response>;
interface Case {
  name: string;
  load: () => Promise<Record<string, unknown>>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  params?: Record<string, string>;
  body?: unknown;
  /** statuses a signed-out caller gets (default 401) */
  signedOut?: number[];
  /** settings this route needs before it looks at who is calling (a feature switched off answers first) */
  env?: Record<string, string>;
  /** the owner's own call goes to an outside service: it is covered elsewhere, with a fake one */
  skipOwner?: boolean;
}

const PROJECT = 'p_villa';
const STEP = { id: 'p_villa', stepId: 'p_villa_s3' }; // a step with a proof waiting for a decision
const FILE = 'seed-facture-villa-s3';

const cases: Case[] = [
  { name: 'project state', load: () => import('@/app/api/projects/[id]/state/route'), method: 'GET', params: { id: PROJECT } },
  { name: 'add funds', load: () => import('@/app/api/projects/[id]/fundings/route'), method: 'POST', params: { id: PROJECT }, body: { amountCents: 5000, method: 'lightning' } },
  { name: 'edit the plan', load: () => import('@/app/api/projects/[id]/plan/route'), method: 'PUT', params: { id: PROJECT }, body: { steps: [{ title: 'Autre', amountCents: 10_000 }] } },
  { name: 'close the project', load: () => import('@/app/api/projects/[id]/close/route'), method: 'POST', params: { id: PROJECT } },
  { name: 'open the family link', load: () => import('@/app/api/projects/[id]/contribution/route'), method: 'POST', params: { id: PROJECT }, body: {} },
  { name: 'close the family link', load: () => import('@/app/api/projects/[id]/contribution/route'), method: 'DELETE', params: { id: PROJECT } },
  { name: 'renew the field link', load: () => import('@/app/api/projects/[id]/manager-token/route'), method: 'POST', params: { id: PROJECT } },
  { name: 'refund', load: () => import('@/app/api/projects/[id]/refund/route'), method: 'POST', params: { id: PROJECT }, body: { amountCents: 500, address: 'awa@example.com' } },
  { name: 'anchor on Bitcoin', load: () => import('@/app/api/projects/[id]/anchors/route'), method: 'POST', params: { id: PROJECT } },
  { name: 'invite a witness', load: () => import('@/app/api/projects/[id]/witness/route'), method: 'POST', params: { id: PROJECT }, body: { name: 'Awa Ba', required: false } },
  { name: 'remove the witness', load: () => import('@/app/api/projects/[id]/witness/route'), method: 'DELETE', params: { id: PROJECT } },
  { name: 'quote a payout', load: () => import('@/app/api/projects/[id]/steps/[stepId]/quote/route'), method: 'POST', params: STEP, body: {} },
  { name: 'refuse a proof', load: () => import('@/app/api/projects/[id]/steps/[stepId]/reject/route'), method: 'POST', params: STEP, body: { note: 'flou' } },
  { name: 'release the payout', load: () => import('@/app/api/projects/[id]/steps/[stepId]/release/route'), method: 'POST', params: STEP },
  { name: 'ask the AI opinion', load: () => import('@/app/api/projects/[id]/steps/[stepId]/review/route'), method: 'POST', params: STEP, env: { AI_REVIEW: '1', ANTHROPIC_API_KEY: 'test-key-not-real' }, skipOwner: true },
  { name: 'send a proof as the funder', load: () => import('@/app/api/projects/[id]/steps/[stepId]/proof/route'), method: 'POST', params: STEP },
  { name: 'read a funding', load: () => import('@/app/api/fundings/[id]/route'), method: 'GET', params: { id: '$funding' } },
  { name: 'simulate a funding', load: () => import('@/app/api/fundings/[id]/simulate/route'), method: 'POST', params: { id: '$funding' } },
  { name: 'read a proof file', load: () => import('@/app/api/files/[projectId]/[fileId]/route'), method: 'GET', params: { projectId: PROJECT, fileId: FILE }, signedOut: [403] },
];

let auth: typeof import('@/server/auth');
let db: typeof import('@/server/db');
let mt: typeof import('@/server/managerToken');

const STRANGER = { id: 'u_stranger', firstName: 'Awa', lastName: 'Ba', country: 'SN', phone: '+221771110000', createdAt: new Date().toISOString() };

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-authz-'));
  auth = await import('@/server/auth');
  db = await import('@/server/db');
  mt = await import('@/server/managerToken');
});
beforeEach(async () => {
  jar.clear();
  vi.stubEnv('RATE_LIMIT', '0');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  // nothing in this file may reach the network: a refused call must not even try, and the owner's calls work offline
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('the network is off in this test'))));
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...STRANGER }));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const signInAs = async (id: string) => {
  jar.clear();
  await auth.startSession((await db.readDb()).users.find((u) => u.id === id)!);
};
const snapshot = async () => JSON.stringify(await db.readDb());

async function call(c: Case, headers: Record<string, string> = {}): Promise<Response> {
  for (const [k, v] of Object.entries(c.env ?? {})) vi.stubEnv(k, v);
  const mod = await c.load();
  const handler = mod[c.method] as Route;
  const fundingId = (await db.readDb()).fundings.find((f) => f.projectId === PROJECT)!.id;
  const params = Object.fromEntries(Object.entries(c.params ?? {}).map(([k, v]) => [k, v === '$funding' ? fundingId : v]));
  const hasBody = c.method === 'POST' || c.method === 'PUT';
  const isProof = c.name.startsWith('send a proof');
  const url = c.name === 'read a proof file' ? `http://localhost/api/files/${params.projectId}/${params.fileId}` : 'http://localhost/x';
  const request = new Request(url, {
    method: c.method,
    headers: { 'content-type': isProof ? 'multipart/form-data; boundary=x' : 'application/json', ...headers },
    body: hasBody && !isProof ? JSON.stringify(c.body ?? {}) : undefined,
  });
  return handler(request, { params });
}

describe('every route that works on a project', () => {
  it.each(cases.filter((c) => !c.skipOwner))('$name: the owner reaches it', async (c) => {
    await signInAs('u_aminata');
    const res = await call(c);
    // not turned away as a stranger (a 4xx about the step state or the body is fine: the call was understood and attributed)
    expect([401, 403, 404], `${c.name} → ${res.status} ${await res.clone().text()}`).not.toContain(res.status);
    expect(res.status).toBeLessThan(500);
  });

  it.each(cases)('$name: a signed-in stranger is refused (403/404) and nothing changes', async (c) => {
    await signInAs('u_stranger');
    const before = await snapshot();
    const res = await call(c);
    const text = await res.text();
    expect([403, 404], `${c.name} → ${res.status} ${text}`).toContain(res.status);
    expect(text).not.toMatch(/Villa|villa|Aminata|\+33612345678/); // the refusal does not describe what it protects
    expect(await snapshot()).toBe(before);
  });

  it.each(cases)('$name: nobody signed in is refused and nothing changes', async (c) => {
    jar.clear();
    const before = await snapshot();
    const res = await call(c);
    expect(c.signedOut ?? [401], `${c.name} → ${res.status}`).toContain(res.status);
    expect(await snapshot()).toBe(before);
  });

  it.each(cases.filter((c) => !c.name.startsWith('send a proof') && c.name !== 'read a proof file'))('$name: a field link is not a key to the funder\'s routes (401)', async (c) => {
    jar.clear();
    const project = (await db.readDb()).projects.find((p) => p.id === PROJECT)!;
    const before = await snapshot();
    const res = await call(c, { 'x-manager-token': mt.managerLinkToken(project) });
    expect(res.status, c.name).toBe(401);
    expect(await snapshot()).toBe(before);
  });
});

describe('a field link belongs to one project', () => {
  it('does not open another project\'s proof route nor its files', async () => {
    const villa = (await db.readDb()).projects.find((p) => p.id === 'p_villa')!;
    const token = mt.managerLinkToken(villa);
    const proof = (await import('@/app/api/projects/[id]/steps/[stepId]/proof/route')).POST as unknown as Route;
    const files = (await import('@/app/api/files/[projectId]/[fileId]/route')).GET as unknown as Route;
    const before = await snapshot();

    const other = await proof(new Request('http://localhost/x', { method: 'POST', headers: { 'x-manager-token': token, 'content-type': 'multipart/form-data; boundary=x' } }), { params: { id: 'p_champ', stepId: 'p_champ_s1' } });
    expect([401, 403, 404]).toContain(other.status);

    // the same token reads its own project's file, and not the file of another project
    const own = await files(new Request(`http://localhost/api/files/p_villa/${FILE}?t=${encodeURIComponent(token)}`), { params: { projectId: 'p_villa', fileId: FILE } });
    expect(own.status).toBe(200);
    const foreign = await files(new Request(`http://localhost/api/files/p_champ/${FILE}?t=${encodeURIComponent(token)}`), { params: { projectId: 'p_champ', fileId: FILE } });
    expect([403, 404]).toContain(foreign.status);
    expect(await snapshot()).toBe(before);
  });

  it('a file id of one project does not open under another project the stranger owns', async () => {
    // a signed-in stranger who owns their own project still cannot read the funder's file through it
    await db.withDb((d) => {
      d.projects.push({ ...d.projects.find((p) => p.id === 'p_champ')!, id: 'p_strangers', ownerId: 'u_stranger', steps: [] });
    });
    await signInAs('u_stranger');
    const files = (await import('@/app/api/files/[projectId]/[fileId]/route')).GET as unknown as Route;
    const res = await files(new Request(`http://localhost/api/files/p_strangers/${FILE}`), { params: { projectId: 'p_strangers', fileId: FILE } });
    expect(res.status).toBe(404);
  });
});
