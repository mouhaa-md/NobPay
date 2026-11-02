import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUICK_TRIAL, QUICK_TRIAL_BUDGET_CENTS } from '@/lib/templates';
import type { User } from '@/lib/types';

let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
const owner: User = { id: 'u_trial', firstName: 'Invité', lastName: 'ESSAI', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-trial-'));
  services = await import('@/server/services');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'mock');
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...owner }));
});
afterEach(() => vi.unstubAllEnvs());

const trialInput = (over: Partial<Parameters<typeof services.createProject>[1]> = {}) => ({
  name: QUICK_TRIAL.name,
  sector: QUICK_TRIAL.sector,
  city: QUICK_TRIAL.city,
  managerName: QUICK_TRIAL.managerName,
  budgetCents: QUICK_TRIAL_BUDGET_CENTS,
  steps: QUICK_TRIAL.steps.map((s) => ({ title: s.title, amountCents: s.amountCents, proofKinds: [...s.proofKinds] })),
  ...over,
});

describe('the "essai rapide" preset', () => {
  it('is a complete, valid project: steps add up to the budget, each step is fundable and payable by photo alone', () => {
    expect(QUICK_TRIAL.steps.reduce((n, s) => n + s.amountCents, 0)).toBe(QUICK_TRIAL_BUDGET_CENTS);
    expect(QUICK_TRIAL_BUDGET_CENTS).toBe(1_500);
    for (const s of QUICK_TRIAL.steps) {
      expect(s.amountCents).toBeGreaterThanOrEqual(500); // the smallest funding is 5 $
      expect(s.proofKinds).toEqual(['photos']); // nobody needs an invoice file to try it
    }
  });

  it('is accepted where the minimum budget is low (simulation and real bitcoin)', async () => {
    const project = await services.createProject(owner, trialInput());
    expect(project.budgetCents).toBe(1_500);
    expect(project.steps.map((s) => s.amountCents)).toEqual([500, 500, 500]);
  });
});

describe('minimum budget of an instance', () => {
  it('is 10 $ by default and 100 $ on the Bitnob sandbox, where a payout has real limits', async () => {
    await expect(services.createProject(owner, trialInput({ budgetCents: 900, steps: [{ title: 'Seule', amountCents: 900 }] }))).rejects.toMatchObject({ status: 400, message: 'Le budget doit être compris entre 10 $ et 500 000 $' });
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    await expect(services.createProject(owner, trialInput())).rejects.toMatchObject({ status: 400, message: 'Le budget doit être compris entre 100 $ et 500 000 $' });
  });

  it('can be set for the instance (MIN_BUDGET_USD)', async () => {
    vi.stubEnv('MIN_BUDGET_USD', '50');
    await expect(services.createProject(owner, trialInput())).rejects.toMatchObject({ status: 400, message: 'Le budget doit être compris entre 50 $ et 500 000 $' });
    vi.stubEnv('MIN_BUDGET_USD', 'not a number');
    await expect(services.createProject(owner, trialInput())).resolves.toMatchObject({ budgetCents: 1_500 });
  });
});
