import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-limit-'));
  services = await import('@/server/services');
  db = await import('@/server/db');
});
beforeEach(() => {
  vi.stubEnv('MAX_STEP_USD', '');
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters'); // sandbox refuses weak secrets
  vi.stubEnv('BITNOB_WEBHOOK_SECRET', 'whsec_limit');
});
afterEach(() => vi.unstubAllEnvs());

const owner = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
const create = async (stepsUsd: number[]) =>
  services.createProject(await owner(), {
    name: 'Limite', sector: 'commerce', city: 'Dakar', budgetCents: stepsUsd.reduce((a, b) => a + b, 0) * 100, managerName: 'M',
    steps: stepsUsd.map((u, i) => ({ title: `Étape ${i + 1}`, amountCents: u * 100 })),
  });

describe('largest step in sandbox (Bitnob refuses mobile money payouts above ~336 $)', () => {
  it('refuses a step above 330 $ when the project is created, saying which one and why', async () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    await expect(create([100, 500])).rejects.toMatchObject({
      status: 400,
      code: 'step_over_payout_limit',
      message: expect.stringMatching(/« Étape 2 » \(500\s\$\).*ne pourrait pas être payée/),
    });
  });

  it('accepts steps up to the limit, and many steps for a big budget', async () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    await expect(create([330, 330, 100])).resolves.toMatchObject({ budgetCents: 76_000 });
    await expect(create(Array(12).fill(300))).resolves.toBeDefined();
  });

  it('does not limit the mock demo: its big realistic amounts stay', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    await expect(create([6000, 18_000])).resolves.toBeDefined();
  });

  it('can be set or switched off with MAX_STEP_USD', async () => {
    vi.stubEnv('BITNOB_MODE', 'sandbox');
    vi.stubEnv('MAX_STEP_USD', '0');
    await expect(create([6000])).resolves.toBeDefined();
    vi.stubEnv('MAX_STEP_USD', '200');
    await expect(create([250])).rejects.toMatchObject({ code: 'step_over_payout_limit' });
    await expect(create([200])).resolves.toBeDefined();
  });
});
