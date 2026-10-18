import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const fake = vi.hoisted(() => ({ quotePayout: vi.fn(), startPayout: vi.fn(), payoutStatus: vi.fn(), findPayoutByReference: vi.fn(), balances: vi.fn(), btcUsd: vi.fn(), convertBtcToStable: vi.fn(), findConversionByReference: vi.fn() }));
vi.mock('@/server/bitnob', async () => {
  const real = await vi.importActual<typeof import('@/server/bitnob/mock')>('@/server/bitnob/mock');
  return {
    getGateway: (forceMock?: boolean) => (forceMock ? real.mockGateway : { mode: 'sandbox', ...fake }),
    gatewayFor: (mode: string) => (mode === 'mock' ? real.mockGateway : { mode: 'sandbox', ...fake }),
  };
});

let services: typeof import('@/server/services');
let webhooks: typeof import('@/server/webhooks');
let sign: typeof import('@/server/bitnob/sign');
let db: typeof import('@/server/db');
const SECRET = 'whsec_sim';

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-sim-'));
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  services = await import('@/server/services');
  webhooks = await import('@/server/webhooks');
  sign = await import('@/server/bitnob/sign');
  db = await import('@/server/db');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(async () => {
  vi.stubEnv('BITNOB_MODE', 'sandbox');
  vi.stubEnv('ALLOW_DEMO', '1');
  await db.resetDb();
  for (const f of Object.values(fake)) f.mockReset();
  fake.btcUsd.mockResolvedValue(81_500);
  fake.balances.mockResolvedValue({ USDT: 0, USDC: 0, BTC: 0 });
});

const owner = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
const ledgerOf = async (pid: string, type: string) => (await db.readDb()).ledger.filter((e) => e.projectId === pid && e.type === type);
const pendingFunding = async (id: string, extra: Record<string, unknown> = {}) => {
  await db.withDb((d) => void d.fundings.push({ id, projectId: 'p_champ', amountCents: 10_000, method: 'lightning', status: 'pending', reference: `nobpay:fund:${id}`, mode: 'sandbox', createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, amountSats: 122_000, ...extra }));
};

describe('the demo button in sandbox', () => {
  it('credits the escrow with an event signed by NobPay, and marks the funding AND the ledger as simulated', async () => {
    await pendingFunding('f_sim1');
    const f = await services.simulateFundingPaid(await owner(), 'f_sim1');
    expect(f).toMatchObject({ status: 'paid', simulated: true, mode: 'sandbox' });
    const ev = (await ledgerOf('p_champ', 'funding_paid')).filter((e) => e.data.fundingId === 'f_sim1');
    expect(ev).toHaveLength(1);
    expect(ev[0].data.simulated).toBe(true);
  });

  it('is refused without ALLOW_DEMO, and the funding is left alone', async () => {
    vi.stubEnv('ALLOW_DEMO', '');
    await pendingFunding('f_sim2');
    await expect(services.simulateFundingPaid(await owner(), 'f_sim2')).rejects.toMatchObject({ status: 403, code: 'demo_disabled' });
    expect((await db.readDb()).fundings.find((x) => x.id === 'f_sim2')!.status).toBe('pending');
  });

  it('a simulated credit is not real money: not counted in solvency, never converted', async () => {
    await pendingFunding('f_sim3');
    await services.simulateFundingPaid(await owner(), 'f_sim3');
    expect(services.sandboxLiabilityCents(await db.readDb())).toBe(0);
    await services.convertPaidFundings();
    expect(fake.convertBtcToStable).not.toHaveBeenCalled();
    expect((await services.checkSolvency()).violated).toBe(false);
  });

  it('still cannot pay a supplier with money the wallet does not hold (the real balance is checked)', async () => {
    await pendingFunding('f_sim4');
    await services.simulateFundingPaid(await owner(), 'f_sim4');
    fake.balances.mockResolvedValue({ USDC: 1, USDT: 1 });
    await expect(services.quoteRelease(await owner(), 'p_champ', (await db.readDb()).projects.find((p) => p.id === 'p_champ')!.steps.find((s) => s.status === 'proof_submitted' || s.status === 'active')!.id)).rejects.toBeDefined();
  });
});

describe('what is real is not marked', () => {
  it('a payment reported by a Bitnob webhook leaves no `simulated` key (and its hash is unchanged by this feature)', async () => {
    await pendingFunding('f_real1');
    const body = JSON.stringify({ event: 'btc.lightning.received.success', event_id: 'evt_real1', data: { id: 'inv_f_real1', amount: 122_000 } });
    expect((await webhooks.handleBitnobWebhook(body, sign.signWebhookBody(SECRET, body))).body.outcome).toBe('funding_paid');
    const ev = (await ledgerOf('p_champ', 'funding_paid')).filter((e) => e.data.fundingId === 'f_real1')[0];
    expect(ev.data).not.toHaveProperty('simulated');
    expect((await db.readDb()).fundings.find((x) => x.id === 'f_real1')!.simulated).toBeUndefined();
  });

  it('a real sandbox payout is not marked, a simulated one ("continue in simulation") is', async () => {
    fake.balances.mockResolvedValue({ USDC: 1e6, USDT: 1e6 });
    fake.quotePayout.mockImplementation(async ({ amountUsdCents, reference }) => ({ quoteId: 'QT', reference, amountUsdCents, rate: 594, feeUsdCents: 0, amountFcfa: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), mode: 'sandbox' }));
    fake.startPayout.mockResolvedValue({ payoutId: 'po_real', status: 'pending' });
    await services.quoteRelease(await owner(), 'p_villa', 'p_villa_s3');
    await services.confirmRelease(await owner(), 'p_villa', 'p_villa_s3');
    const real = (await ledgerOf('p_villa', 'payout_started')).filter((e) => e.data.stepId === 'p_villa_s3')[0];
    expect(real.data).not.toHaveProperty('simulated');

    await db.resetDb();
    await services.quoteRelease(await owner(), 'p_villa', 'p_villa_s3', { simulate: true });
    await services.confirmRelease(await owner(), 'p_villa', 'p_villa_s3');
    const sim = (await ledgerOf('p_villa', 'payout_started')).filter((e) => e.data.stepId === 'p_villa_s3')[0];
    expect(sim.data.simulated).toBe(true);
    expect((await ledgerOf('p_villa', 'step_approved')).filter((e) => e.data.stepId === 'p_villa_s3')[0].data.simulated).toBe(true);
  });

  it('in mock mode every money event is marked, so a mock demo dossier can never pass for real', async () => {
    vi.stubEnv('BITNOB_MODE', 'mock');
    await db.resetDb();
    await pendingFunding('f_mock1', { mode: 'mock' });
    await services.simulateFundingPaid(await owner(), 'f_mock1');
    const ev = (await ledgerOf('p_champ', 'funding_paid')).filter((e) => e.data.fundingId === 'f_mock1')[0];
    expect(ev.data.simulated).toBe(true);
  });
});
