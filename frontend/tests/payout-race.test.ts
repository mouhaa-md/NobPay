import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * In the real sandbox a payout completes in well under a second, and Bitnob's `payouts.withdrawal.success` webhook
 * can reach us BEFORE confirmRelease has stored the answer of `finalize`. The step must end up paid, once.
 */

const fake = vi.hoisted(() => ({ quotePayout: vi.fn(), startPayout: vi.fn(), payoutStatus: vi.fn(), findPayoutByReference: vi.fn(), balances: vi.fn(), btcUsd: vi.fn() }));
vi.mock('@/server/bitnob', () => ({
  getGateway: () => ({ mode: 'sandbox', ...fake }),
  gatewayFor: () => ({ mode: 'sandbox', ...fake }),
}));

let services: typeof import('@/server/services');
let webhooks: typeof import('@/server/webhooks');
let sign: typeof import('@/server/bitnob/sign');
let db: typeof import('@/server/db');
const SECRET = 'whsec_race';

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-race-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  services = await import('@/server/services');
  webhooks = await import('@/server/webhooks');
  sign = await import('@/server/bitnob/sign');
  db = await import('@/server/db');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await db.resetDb();
  for (const f of Object.values(fake)) f.mockReset();
  fake.balances.mockResolvedValue({ USDT: 1e9 });
  fake.btcUsd.mockResolvedValue(81_500);
  fake.quotePayout.mockImplementation(async ({ amountUsdCents, reference }) => ({
    quoteId: 'QT_race', reference, amountUsdCents, rate: 594, feeUsdCents: 0, amountFcfa: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), mode: 'sandbox',
  }));
});

/** a real payouts.* delivery, as captured from Bitnob (shape of data.*) */
const deliver = (event: string, status: string, reference: string, payoutId: string) => {
  const body = JSON.stringify({
    event, event_id: `evt_${event}_${reference}`,
    data: { id: payoutId, quote_id: 'QT_race', reference, status, amount: '10', from_asset: 'usdc', to_currency: 'xof', settlement_amount: '5948', beneficiary: { account_name: 'T', account_number: '****4567', country: 'SN' } },
  });
  return webhooks.handleBitnobWebhook(body, sign.signWebhookBody(SECRET, body));
};
const step = async () => (await db.readDb()).projects.find((p) => p.id === 'p_villa')!.steps.find((s) => s.id === 'p_villa_s3')!;
const owner = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;

describe('the success webhook arrives before finalize has been answered', () => {
  it('ends paid with a completed payout and its id, never "paid with a pending payout"', async () => {
    fake.startPayout.mockImplementation(async ({ reference }) => {
      // Bitnob completes the payout and delivers its webhooks while our request is still in flight
      await deliver('payouts.initialized', 'initiated', reference, 'po_real');
      await deliver('payouts.processing', 'processing', reference, 'po_real');
      const res = await deliver('payouts.withdrawal.success', 'success', reference, 'po_real');
      expect(res.body.outcome).toBe('payout_completed');
      return { payoutId: 'po_real', status: 'pending' }; // finalize answers late, still saying PENDING
    });
    await services.quoteRelease(await owner(), 'p_villa', 'p_villa_s3');
    await services.confirmRelease(await owner(), 'p_villa', 'p_villa_s3');

    const s = await step();
    expect(s.status).toBe('paid');
    expect(s.payout?.status).toBe('completed');
    expect(s.payout?.payoutId).toBe('po_real');
    expect(s.payout?.completedAt).toBeDefined();
    const d = await db.readDb();
    expect(d.ledger.filter((e) => e.projectId === 'p_villa' && e.type === 'payout_completed' && e.data.stepId === 'p_villa_s3')).toHaveLength(1);
    expect((await db.readDb()).projects.find((p) => p.id === 'p_villa')!.steps.find((x) => x.id === 'p_villa_s4')!.status).toBe('active');
  });

  it('a failure webhook that beats the answer is kept too: the step goes back, the payout stays failed', async () => {
    fake.startPayout.mockImplementation(async ({ reference }) => {
      await deliver('payouts.withdrawal.expired', 'expired', reference, 'po_fail');
      return { payoutId: 'po_fail', status: 'pending' };
    });
    await services.quoteRelease(await owner(), 'p_villa', 'p_villa_s3');
    await services.confirmRelease(await owner(), 'p_villa', 'p_villa_s3');
    const s = await step();
    expect(s.status).toBe('proof_submitted');
    expect(s.payout?.status).toBe('failed');
    expect(s.payout?.payoutId).toBe('po_fail');
  });

  it('the normal order still works: answer first, webhook after', async () => {
    fake.startPayout.mockResolvedValue({ payoutId: 'po_ok', status: 'pending' });
    await services.quoteRelease(await owner(), 'p_villa', 'p_villa_s3');
    const after = await services.confirmRelease(await owner(), 'p_villa', 'p_villa_s3');
    expect(after.status).toBe('releasing');
    const ref = (await step()).payout!.reference;
    expect((await deliver('payouts.withdrawal.success', 'success', ref, 'po_ok')).body.outcome).toBe('payout_completed');
    expect((await step()).status).toBe('paid');
  });
});
