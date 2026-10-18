import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '@/lib/types';

const jar = vi.hoisted(() => new Map<string, { value: string }>());
vi.mock('next/headers', () => ({
  cookies: () => ({
    get: (n: string) => (jar.has(n) ? { name: n, value: jar.get(n)!.value } : undefined),
    set: (n: string, value: string) => void jar.set(n, { value }),
    delete: (n: string) => void jar.delete(n),
  }),
}));

let mt: typeof import('@/server/managerToken');
let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
let filesRoute: typeof import('@/app/api/files/[projectId]/[fileId]/route');
let auth: typeof import('@/server/auth');

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-mtoken-'));
  mt = await import('@/server/managerToken');
  services = await import('@/server/services');
  db = await import('@/server/db');
  filesRoute = await import('@/app/api/files/[projectId]/[fileId]/route');
  auth = await import('@/server/auth');
});
beforeEach(async () => {
  jar.clear();
  vi.stubEnv('SESSION_SECRET', STRONG);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  await db.resetDb();
});
afterEach(() => vi.unstubAllEnvs());

const project = (extra: Partial<Project> = {}): Project => ({
  id: 'p_abc123', ownerId: 'u_aminata', name: 'T', sector: 'commerce', city: 'Dakar', country: 'SN', budgetCents: 1, coverImage: '/x',
  managerName: 'M', approvalRule: 'owner', steps: [], createdAt: new Date().toISOString(), managerTokenVersion: 1, ...extra,
});

describe('signed link token', () => {
  it('opens its own project, lasts 90 days, and carries nothing reusable in the database', () => {
    const now = Date.now();
    const { token, expiresAt } = mt.issueManagerToken('p_abc123', 1, now);
    expect(Date.parse(expiresAt) - now).toBeGreaterThan(89 * 86_400_000);
    expect(Date.parse(expiresAt) - now).toBeLessThanOrEqual(90 * 86_400_000);
    expect(mt.managerTokenMatches(project({ managerTokenExpiresAt: expiresAt }), token, now)).toBe(true);
  });

  it('refuses another project, another version, an expired link and any tampering', () => {
    const now = Date.now();
    const { token } = mt.issueManagerToken('p_abc123', 1, now);
    const p = project();
    expect(mt.managerTokenMatches(project({ id: 'p_other' }), token, now)).toBe(false);
    expect(mt.managerTokenMatches(project({ managerTokenVersion: 2 }), token, now)).toBe(false); // renewed since
    expect(mt.managerTokenMatches(p, token, now + 91 * 86_400_000)).toBe(false); // expired
    const [pid, v, exp, mac] = token.split('.');
    expect(mt.managerTokenMatches(p, [pid, v, String(Number(exp) + 99999), mac].join('.'), now)).toBe(false);
    expect(mt.managerTokenMatches(p, [pid, v, exp, mac.slice(0, -1) + (mac.endsWith('a') ? 'b' : 'a')].join('.'), now)).toBe(false);
    expect(mt.managerTokenMatches(p, '', now)).toBe(false);
    expect(mt.managerTokenMatches(p, 'p_abc123.1.9999999999.deadbeef', now)).toBe(false);
  });

  it('is signed with the server secret: a token made with another secret is refused', () => {
    const { token } = mt.issueManagerToken('p_abc123', 1);
    vi.stubEnv('SESSION_SECRET', 'another-long-random-secret-of-more-than-32-chars');
    expect(mt.managerTokenMatches(project(), token)).toBe(false);
  });

  it('can be shown again to the owner (derived from what is stored)', () => {
    const issued = mt.issueManagerToken('p_abc123', 3);
    const p = project({ managerTokenVersion: 3, managerTokenExpiresAt: issued.expiresAt });
    expect(mt.managerLinkToken(p)).toBe(issued.token);
    expect(mt.findProjectByManagerToken({ projects: [p] }, issued.token)).toBe(p);
    expect(mt.findProjectByManagerToken({ projects: [p] }, 'p_abc123.3.1.xx')).toBeUndefined();
  });
});

describe('legacy plaintext links', () => {
  it('keep working for projects that have one (existing links do not break)', () => {
    const p = project({ managerToken: 'a1b2c3d4e5f6a1b2c3d4e5f6', managerTokenVersion: undefined });
    expect(mt.managerTokenMatches(p, 'a1b2c3d4e5f6a1b2c3d4e5f6')).toBe(true);
    expect(mt.managerTokenMatches(p, 'a1b2c3d4e5f6a1b2c3d4e5f7')).toBe(false);
    expect(mt.managerLinkToken(p)).toBe('a1b2c3d4e5f6a1b2c3d4e5f6');
    expect(mt.findProjectByManagerToken({ projects: [p] }, 'a1b2c3d4e5f6a1b2c3d4e5f6')).toBe(p);
  });

  it('demo projects public tokens only work while demo mode is allowed', () => {
    const p = project({ demo: true, managerToken: 'demo-villa-thies', managerTokenVersion: undefined });
    expect(mt.managerTokenMatches(p, 'demo-villa-thies')).toBe(true); // mock: demo allowed by default
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    expect(mt.managerTokenMatches(p, 'demo-villa-thies')).toBe(false);
    vi.stubEnv('ALLOW_DEMO', '1');
    expect(mt.managerTokenMatches(p, 'demo-villa-thies')).toBe(true);
  });
});

describe('creating, using and renewing a link', () => {
  const owner = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
  const create = async () =>
    services.createProject(await owner(), { name: 'Test', sector: 'commerce', city: 'Dakar', budgetCents: 20_000, managerName: 'Moussa', steps: [{ title: 'Un', amountCents: 20_000, proofKinds: ['facture'] }] });

  it('a new project stores no plaintext token, only a version and an expiry', async () => {
    const p = await create();
    const stored = (await db.readDb()).projects.find((x) => x.id === p.id)!;
    expect(stored.managerToken).toBeUndefined();
    expect(stored.managerTokenVersion).toBe(1);
    expect(Date.parse(stored.managerTokenExpiresAt!)).toBeGreaterThan(Date.now() + 89 * 86_400_000);
    expect(JSON.stringify(await db.readDb())).not.toContain(mt.managerLinkToken(stored)); // the link itself is not in the file
  });

  it('the link gives access to the project, and only to that one', async () => {
    const p = await create();
    const token = mt.managerLinkToken(p);
    await expect(services.assertProjectAccess({ kind: 'manager', token }, p.id)).resolves.toMatchObject({ id: p.id });
    await expect(services.assertProjectAccess({ kind: 'manager', token }, 'p_villa')).rejects.toMatchObject({ status: 403 });
    await expect(services.assertProjectAccess({ kind: 'manager', token: 'nope' }, p.id)).rejects.toMatchObject({ status: 403 });
  });

  it('renewing kills the old link at once and the new one works', async () => {
    const p = await create();
    const oldToken = mt.managerLinkToken(p);
    const renewed = await mt.rotateManagerToken(await owner(), p.id);
    expect(renewed.token).not.toBe(oldToken);
    await expect(services.assertProjectAccess({ kind: 'manager', token: oldToken }, p.id)).rejects.toMatchObject({ status: 403 });
    await expect(services.assertProjectAccess({ kind: 'manager', token: renewed.token }, p.id)).resolves.toBeDefined();
    const stored = (await db.readDb()).projects.find((x) => x.id === p.id)!;
    expect(mt.managerLinkToken(stored)).toBe(renewed.token); // the owner sees the new link
  });

  it('renewing also retires a legacy plaintext link, and only its owner can renew', async () => {
    const legacy = 'oldlink0123456789abcdef01';
    await db.withDb((d) => {
      const p = d.projects.find((x) => x.id === 'p_champ')!;
      p.demo = false;
      p.managerToken = legacy;
    });
    await expect(mt.rotateManagerToken({ id: 'u_stranger' } as never, 'p_champ')).rejects.toMatchObject({ status: 404 });
    await mt.rotateManagerToken(await owner(), 'p_champ');
    const p = (await db.readDb()).projects.find((x) => x.id === 'p_champ')!;
    expect(mt.managerTokenMatches(p, legacy)).toBe(false);
  });

  it('serves proof files to the link holder (query t) but not to an old link or a stranger', async () => {
    const p = await create();
    const token = mt.managerLinkToken(p);
    const file = { id: 'fl_x', name: 'a.png', mime: 'image/png', size: 1, sha256: 'ab', publicPath: '/brand/logo.svg' };
    await db.withDb((d) => {
      const x = d.projects.find((y) => y.id === p.id)!;
      x.steps[0].proof = { photos: [{ ...file, takenAt: new Date().toISOString() }], submittedAt: new Date().toISOString(), submittedBy: 'manager' };
    });
    const get = (t?: string) => filesRoute.GET(new Request(`http://localhost/api/files/${p.id}/fl_x${t ? `?t=${encodeURIComponent(t)}` : ''}`), { params: { projectId: p.id, fileId: 'fl_x' } });
    expect((await get(token)).status).not.toBe(403);
    expect((await get('wrong')).status).toBe(403);
    expect((await get()).status).toBe(403);
    await mt.rotateManagerToken(await owner(), p.id);
    expect((await get(token)).status).toBe(403); // the old link no longer opens files
    void auth;
  });
});
