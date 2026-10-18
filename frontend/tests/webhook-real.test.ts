import { readFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

/** Real deliveries captured from the Bitnob sandbox on 2026-10-18 (identifiers replaced), replayed with a signature we compute. */
const raw = (name: string) => readFileSync(path.join(__dirname, 'fixtures/bitnob', `${name}.json`), 'utf8').trim();
const SECRET = 'whsec_real_shapes';

let handle: typeof import('@/server/webhooks').handleBitnobWebhook;
let sign: typeof import('@/server/bitnob/sign').signWebhookBody;
let db: typeof import('@/server/db');
const send = (name: string) => {
  const body = raw(name);
  return handle(body, sign(SECRET, body));
};
const step = async () => (await db.readDb()).projects.find((p) => p.id === 'p_villa')!.steps.find((s) => s.id === 'p_villa_s3')!;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-real-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  handle = (await import('@/server/webhooks')).handleBitnobWebhook;
  sign = (await import('@/server/bitnob/sign')).signWebhookBody;
  db = await import('@/server/db');
  // the step the captured payout belongs to: in flight, with the reference the payload carries
  await db.withDb((d) => {
    const s = d.projects.find((p) => p.id === 'p_villa')!.steps.find((x) => x.id === 'p_villa_s3')!;
    s.status = 'releasing';
    s.payout = { reference: 'nobpay:pay:p_villa_s3:real', quoteId: 'QT2_21053114', status: 'pending', amountUsdCents: 1000, amountFcfa: 5948, rate: 594.8, feeUsdCents: 0, supplier: { name: 'Test Fournisseur', network: 'wave', phone: '+221771234567' }, mode: 'sandbox', startedAt: new Date().toISOString() };
  });
});

describe('real Bitnob deliveries', () => {
  it('a deposit.success (stablecoin deposit) is accepted and changes nothing: deposits are not a funding source yet', async () => {
    const res = await send('webhook-deposit-success');
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unknown_transfer');
  });

  it('payouts.initialized and payouts.processing are acknowledged without effect', async () => {
    expect((await send('webhook-payouts-initialized')).body.outcome).toBe('ignored');
    expect((await send('webhook-payouts-processing')).body.outcome).toBe('ignored');
    expect((await step()).status).toBe('releasing');
  });

  it('payouts.withdrawal.success completes the payout found by our reference, and records the payout id', async () => {
    const res = await send('webhook-payouts-withdrawal-success');
    expect(res.body.outcome).toBe('payout_completed');
    const s = await step();
    expect(s.status).toBe('paid');
    expect(s.payout).toMatchObject({ status: 'completed', payoutId: '00000000-0000-4000-8000-0000000000a1' });
  });

  it('delivering the same event again is a duplicate', async () => {
    expect((await send('webhook-payouts-withdrawal-success')).body.duplicate).toBe(true);
  });

  it('the real signature shape is accepted: 128 hex characters (HMAC-SHA512), and a wrong one is not', async () => {
    const body = raw('webhook-payouts-processing');
    expect(sign(SECRET, body)).toMatch(/^[0-9a-f]{128}$/);
    expect((await handle(body, sign('another-secret', body))).status).toBe(401);
  });
});
