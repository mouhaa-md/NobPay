import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GatewayError } from '@/server/bitnob/types';

const fake = vi.hoisted(() => ({
  convertBtcToStable: vi.fn(),
  findConversionByReference: vi.fn(),
  balances: vi.fn(),
  btcUsd: vi.fn(),
  quotePayout: vi.fn(),
  startPayout: vi.fn(),
  payoutStatus: vi.fn(),
  findPayoutByReference: vi.fn(),
}));
vi.mock('@/server/bitnob', () => ({
  getGateway: () => ({ mode: 'sandbox', ...fake }),
  gatewayFor: () => ({ mode: 'sandbox', ...fake }),
}));

let services: typeof import('@/server/services');
let db: typeof import('@/server/db');
const SATS = 122_630;
let n = 0;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-conv-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = 'whsec_conv';
  services = await import('@/server/services');
  db = await import('@/server/db');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(async () => {
  await db.resetDb();
  for (const f of Object.values(fake)) f.mockReset();
  fake.btcUsd.mockResolvedValue(81_500);
  fake.balances.mockResolvedValue({ BTC: 0, USDT: 0, USDC: 0 });
});

const paidFunding = async (extra: Record<string, unknown> = {}) => {
  const id = `f_conv${++n}`;
  await db.withDb((d) => {
    d.fundings.push({
      id, projectId: 'p_champ', amountCents: 10_000, method: 'lightning', status: 'paid', reference: `nobpay:fund:${id}`, mode: 'sandbox',
      createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, amountSats: SATS, paidAt: new Date().toISOString(), ...extra,
    });
  });
  return id;
};
const get = async (id: string) => (await db.readDb()).fundings.find((f) => f.id === id)!;

describe('conversion after the invoice is paid', () => {
  it('converts once, with a stable reference, and records it', async () => {
    const id = await paidFunding();
    fake.convertBtcToStable.mockResolvedValue({ status: 'done', detail: 'Ordre o1 (ok)' });
    await services.convertPaidFundings();
    await services.convertPaidFundings(); // already done: no second order
    expect(fake.convertBtcToStable).toHaveBeenCalledTimes(1);
    expect(fake.convertBtcToStable).toHaveBeenCalledWith({ sats: SATS, reference: `nobpay:conv:${id}` });
    expect((await get(id)).conversion).toMatchObject({ status: 'done', attempts: 1 });
  });

  it('survives a closed tab: it needs no screen, only the paid funding', async () => {
    const id = await paidFunding();
    fake.convertBtcToStable.mockResolvedValue({ status: 'done' });
    await services.convertPaidFundings(); // what the background loop does
    expect((await get(id)).conversion?.status).toBe('done');
  });

  it('a temporary refusal is retried later with a growing delay, then succeeds', async () => {
    const id = await paidFunding();
    const t0 = Date.now();
    fake.convertBtcToStable.mockResolvedValueOnce({ status: 'failed', retryable: true, detail: 'Service indisponible' });
    await services.convertPaidFundings(t0);
    let c = (await get(id)).conversion!;
    expect(c).toMatchObject({ status: 'failed', attempts: 1, retryable: true });
    expect(Date.parse(c.nextAttemptAt!) - t0).toBe(services.CONVERSION_BACKOFF_MS[0]);

    await services.convertPaidFundings(t0 + 1000); // too early
    expect(fake.convertBtcToStable).toHaveBeenCalledTimes(1);

    fake.convertBtcToStable.mockResolvedValueOnce({ status: 'failed', retryable: true, detail: 'encore' });
    await services.convertPaidFundings(t0 + services.CONVERSION_BACKOFF_MS[0] + 1);
    c = (await get(id)).conversion!;
    expect(c.attempts).toBe(2);
    expect(Date.parse(c.nextAttemptAt!) - (t0 + services.CONVERSION_BACKOFF_MS[0] + 1)).toBe(services.CONVERSION_BACKOFF_MS[1]);

    fake.convertBtcToStable.mockResolvedValueOnce({ status: 'done' });
    await services.convertPaidFundings(t0 + 10 * 60_000);
    expect((await get(id)).conversion).toMatchObject({ status: 'done', attempts: 3 });
  });

  it('gives up on a definite refusal and after the last attempt, leaving it visible', async () => {
    const id = await paidFunding();
    fake.convertBtcToStable.mockResolvedValue({ status: 'failed', retryable: false, detail: 'paire refusée' });
    await services.convertPaidFundings();
    await services.convertPaidFundings(Date.now() + 86_400_000);
    expect(fake.convertBtcToStable).toHaveBeenCalledTimes(1);
    expect((await get(id)).conversion).toMatchObject({ status: 'failed', retryable: false });

    const id2 = await paidFunding({ conversion: { status: 'failed', attempts: services.CONVERSION_MAX_ATTEMPTS - 1, retryable: true } });
    fake.convertBtcToStable.mockResolvedValue({ status: 'failed', retryable: true, detail: 'toujours' });
    await services.convertPaidFundings();
    expect((await get(id2)).conversion).toMatchObject({ status: 'failed', retryable: false, attempts: services.CONVERSION_MAX_ATTEMPTS });
  });

  it('never sells twice: after an unanswered attempt it looks for the order first', async () => {
    const id = await paidFunding();
    fake.convertBtcToStable.mockResolvedValueOnce({ status: 'failed', retryable: true, uncertain: true, detail: 'délai dépassé' });
    await services.convertPaidFundings();
    fake.findConversionByReference.mockResolvedValue(true); // it did reach Bitnob
    await services.convertPaidFundings(Date.now() + 3_600_000);
    expect(fake.findConversionByReference).toHaveBeenCalledWith(`nobpay:conv:${id}`);
    expect(fake.convertBtcToStable).toHaveBeenCalledTimes(1); // no second order
    expect((await get(id)).conversion?.status).toBe('done');
  });

  it('after a crash mid-attempt (status pending) it also looks first, and sells if there is no order', async () => {
    const id = await paidFunding({ conversion: { status: 'pending', attempts: 1 } });
    fake.findConversionByReference.mockResolvedValue(false);
    fake.convertBtcToStable.mockResolvedValue({ status: 'done' });
    await services.convertPaidFundings();
    expect(fake.findConversionByReference).toHaveBeenCalledTimes(1);
    expect(fake.convertBtcToStable).toHaveBeenCalledTimes(1);
    expect((await get(id)).conversion).toMatchObject({ status: 'done', attempts: 2 });
  });

  it('does not sell when it cannot check (Bitnob unreachable): it waits for the next round', async () => {
    const id = await paidFunding({ conversion: { status: 'pending', attempts: 1 } });
    fake.findConversionByReference.mockRejectedValue(new GatewayError('Bitnob injoignable', undefined, undefined, 'network_error'));
    await expect(services.convertPaidFundings()).rejects.toThrow();
    expect(fake.convertBtcToStable).not.toHaveBeenCalled();
    expect((await get(id)).conversion?.status).toBe('pending');
  });

  it('ignores simulated and unpaid fundings', async () => {
    await paidFunding({ mode: 'mock' });
    await paidFunding({ status: 'pending' });
    await services.convertPaidFundings();
    expect(fake.convertBtcToStable).not.toHaveBeenCalled();
  });
});

describe('a payout is refused when the wallet cannot cover it', () => {
  const quoteOf = (reference: string) => ({ quoteId: 'QT', reference, amountUsdCents: 600_000, rate: 593, feeUsdCents: 0, amountFcfa: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), mode: 'sandbox' });
  const user = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;

  it('says the conversion is probably still running, and does not even ask for a quote', async () => {
    fake.balances.mockResolvedValue({ USDT: 12.5 });
    await expect(services.quoteRelease(await user(), 'p_villa', 'p_villa_s3')).rejects.toMatchObject({
      status: 409,
      code: 'insufficient_balance',
      message: expect.stringContaining('conversion est en cours'),
    });
    expect(fake.quotePayout).not.toHaveBeenCalled();
  });

  it('lets it through when the balance covers the step', async () => {
    fake.balances.mockResolvedValue({ USDT: 6000 });
    fake.quotePayout.mockImplementation(async ({ reference }) => quoteOf(reference));
    await expect(services.quoteRelease(await user(), 'p_villa', 'p_villa_s3')).resolves.toMatchObject({ quoteId: 'QT' });
  });

  it('re-checks at confirmation: the balance may have dropped since the quote', async () => {
    fake.balances.mockResolvedValue({ USDT: 6000 });
    fake.quotePayout.mockImplementation(async ({ reference }) => quoteOf(reference));
    await services.quoteRelease(await user(), 'p_villa', 'p_villa_s3');
    fake.balances.mockResolvedValue({ USDT: 100 });
    await expect(services.confirmRelease(await user(), 'p_villa', 'p_villa_s3')).rejects.toMatchObject({ code: 'insufficient_balance' });
    expect(fake.startPayout).not.toHaveBeenCalled();
    const step = (await db.readDb()).projects.find((p) => p.id === 'p_villa')!.steps.find((s) => s.id === 'p_villa_s3')!;
    expect(step.status).toBe('proof_submitted'); // nothing was reserved
  });

  it('does not block when Bitnob cannot be asked for balances', async () => {
    fake.balances.mockRejectedValue(new GatewayError('Bitnob injoignable', undefined, undefined, 'network_error'));
    fake.quotePayout.mockImplementation(async ({ reference }) => quoteOf(reference));
    await expect(services.quoteRelease(await user(), 'p_villa', 'p_villa_s3')).resolves.toBeDefined();
  });
});

describe('solvency invariant: what NobPay owes never exceeds what the wallets hold', () => {
  it('computes only real sandbox money: demo fundings and simulated payouts are left out', async () => {
    const d = await db.readDb();
    expect(services.sandboxLiabilityCents(d)).toBe(0); // the demo data is all simulated
    await paidFunding(); // 100 $ really received
    expect(services.sandboxLiabilityCents(await db.readDb())).toBe(10_000);
  });

  it('is fine while the wallets cover the debt (bitcoin counted at market price), with a little slack', async () => {
    await paidFunding();
    fake.balances.mockResolvedValue({ BTC: 0.0012263, USDT: 0, USDC: 0 }); // ~ 99.9 $
    expect((await services.checkSolvency()).violated).toBe(false);
  });

  it('is violated, and payments pause, when the wallets hold far less than the debt', async () => {
    await paidFunding();
    fake.balances.mockResolvedValue({ BTC: 0, USDT: 20, USDC: 0 });
    const s = await services.checkSolvency();
    expect(s).toMatchObject({ violated: true, liabilityCents: 10_000, assetsCents: 2000 });
    const user = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
    await expect(services.quoteRelease(user, 'p_villa', 'p_villa_s3')).rejects.toMatchObject({ status: 503, code: 'payments_paused' });
  });

  it('resumes by itself once the books add up again', async () => {
    await paidFunding();
    fake.balances.mockResolvedValue({ USDT: 150 });
    expect((await services.checkSolvency()).violated).toBe(false);
    const user = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
    fake.balances.mockResolvedValue({ USDT: 6000 });
    fake.quotePayout.mockImplementation(async ({ reference }) => ({ quoteId: 'QT', reference, amountUsdCents: 600_000, rate: 593, feeUsdCents: 0, amountFcfa: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), mode: 'sandbox' }));
    await expect(services.quoteRelease(user, 'p_villa', 'p_villa_s3')).resolves.toBeDefined();
  });
});
