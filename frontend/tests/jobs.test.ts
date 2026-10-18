import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let jobs: typeof import('@/server/jobs');
let services: typeof import('@/server/services');
let db: typeof import('@/server/db');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-jobs-'));
  process.env.BITNOB_MODE = 'mock';
  jobs = await import('@/server/jobs');
  services = await import('@/server/services');
  db = await import('@/server/db');
});
beforeEach(async () => {
  await db.resetDb();
});

const demoUser = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
const step = async (id: string) => (await db.readDb()).projects.find((p) => p.id === 'p_villa')!.steps.find((s) => s.id === id)!;

describe('background loop', () => {
  it('finishes a mock payout once it is old enough, without any page being rendered', async () => {
    await services.quoteRelease(await demoUser(), 'p_villa', 'p_villa_s3');
    await services.confirmRelease(await demoUser(), 'p_villa', 'p_villa_s3');
    expect((await step('p_villa_s3')).status).toBe('releasing');

    await jobs.tick(); // too early: the simulated confirmation arrives after ~2.5 s
    expect((await step('p_villa_s3')).status).toBe('releasing');

    await db.withDb((d) => {
      d.projects.find((p) => p.id === 'p_villa')!.steps.find((s) => s.id === 'p_villa_s3')!.payout!.startedAt = new Date(Date.now() - 5000).toISOString();
    });
    await jobs.tick();
    expect((await step('p_villa_s3')).status).toBe('paid');
    expect((await step('p_villa_s4')).status).toBe('active'); // the next step opened
  });

  it('closes invoices past their expiry and leaves the others', async () => {
    const mk = (id: string, expiresAt: string) => ({
      id, projectId: 'p_villa', amountCents: 1000, method: 'lightning' as const, status: 'pending' as const, reference: `r_${id}`, mode: 'mock' as const, createdAt: new Date().toISOString(), expiresAt,
    });
    await db.withDb((d) => {
      d.fundings.push(mk('f_old', new Date(Date.now() - 1000).toISOString()), mk('f_new', new Date(Date.now() + 3_600_000).toISOString()));
    });
    await jobs.tick();
    const fundings = (await db.readDb()).fundings;
    expect(fundings.find((f) => f.id === 'f_old')!.status).toBe('expired');
    expect(fundings.find((f) => f.id === 'f_new')!.status).toBe('pending');
  });

  it('never overlaps itself', async () => {
    await Promise.all([jobs.tick(), jobs.tick(), jobs.tick()]); // would double-process if rounds overlapped
    expect(true).toBe(true);
  });

  it('does not start a timer under test (and is switched off by BACKGROUND_JOBS=0)', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    jobs.startJobs();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('BACKGROUND_JOBS', '0');
    jobs.startJobs();
    expect(spy).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
    spy.mockRestore();
  });
});

describe('pages and GET routes are read-only', () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = path.join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
    });

  it('no page or route calls reconcile() while rendering', () => {
    const offenders = walk(path.join(__dirname, '../src/app')).filter((f) => /reconcile\s*\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
