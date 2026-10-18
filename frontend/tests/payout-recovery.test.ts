import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { escrowCents } from '@/lib/types';
import { GatewayError } from '@/server/bitnob/types';

// A fake Bitnob whose answers each test controls.
const fake = vi.hoisted(() => ({
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
const PROJECT = 'p_villa';
const STEP = 'p_villa_s3'; // proof submitted in the demo data, 18 000 $ in escrow

const user = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
const step = async () => (await db.readDb()).projects.find((p) => p.id === PROJECT)!.steps.find((s) => s.id === STEP)!;
const escrow = async () => {
  const d = await db.readDb();
  return escrowCents(d, d.projects.find((p) => p.id === PROJECT)!);
};
const ledgerTypes = async () => (await db.readDb()).ledger.filter((e) => e.projectId === PROJECT).map((e) => e.type);
const countOf = async (type: string) => (await ledgerTypes()).filter((t) => t === type).length;
const ageThePayout = (minutes: number) =>
  db.withDb((d) => {
    const s = d.projects.find((p) => p.id === PROJECT)!.steps.find((x) => x.id === STEP)!;
    s.payout!.startedAt = new Date(Date.now() - minutes * 60_000).toISOString();
  });

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-recovery-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = 'whsec_recovery';
  services = await import('@/server/services');
  db = await import('@/server/db');
});
afterAll(() => vi.unstubAllEnvs());

beforeEach(async () => {
  await db.resetDb();
  for (const f of Object.values(fake)) f.mockReset();
  fake.quotePayout.mockImplementation(async ({ amountUsdCents, reference }) => ({
    quoteId: 'QT2_test',
    reference,
    amountUsdCents,
    rate: 593.4,
    feeUsdCents: 0,
    amountFcfa: Math.round((amountUsdCents / 100) * 593.4),
    expiresAt: new Date(Date.now() + 600_000).toISOString(),
    mode: 'sandbox',
  }));
});

const approve = async () => {
  await services.quoteRelease(await user(), PROJECT, STEP);
  return services.confirmRelease(await user(), PROJECT, STEP);
};

describe('a definite refusal gives the funds back', () => {
  it('insufficient funds: step back to proof_submitted, escrow restored, one payout_failed, French message', async () => {
    const before = await escrow();
    fake.startPayout.mockRejectedValue(new GatewayError('Solde insuffisant côté Bitnob pour ce paiement.', 422, {}, 'INSUFFICIENT_FUNDS'));
    await expect(approve()).rejects.toMatchObject({ status: 502, code: 'gateway_error', message: expect.stringContaining('Solde insuffisant') });
    expect((await step()).status).toBe('proof_submitted');
    expect(await escrow()).toBe(before);
    expect(await countOf('payout_failed')).toBe(1);
  });
});

describe('an unconfirmed finalize never gives the funds back by itself', () => {
  const unconfirmed = () => fake.startPayout.mockResolvedValue({ payoutId: 'po_1', status: 'pending', uncertain: true });

  it('keeps the step releasing, funds reserved, no failure recorded', async () => {
    const before = await escrow();
    unconfirmed();
    const s = await approve();
    expect(s.status).toBe('releasing');
    expect(s.payout).toMatchObject({ payoutId: 'po_1', uncertain: true });
    expect(await escrow()).toBe(before - (await step()).amountCents);
    expect(await countOf('payout_failed')).toBe(0);
  });

  it('waits while Bitnob still shows the payout as not started, if it is recent', async () => {
    unconfirmed();
    await approve();
    await ageThePayout(1);
    fake.payoutStatus.mockResolvedValue({ status: 'initiated' });
    await services.reconcile();
    expect((await step()).status).toBe('releasing');
  });

  it('after 5 minutes of "not started", concludes it never ran: funds back, one payout_failed, explanation', async () => {
    const before = await escrow();
    unconfirmed();
    await approve();
    await ageThePayout(6);
    fake.payoutStatus.mockResolvedValue({ status: 'initiated' });
    await services.reconcile();
    await services.reconcile(); // a second pass must not record a second failure
    const s = await step();
    expect(s.status).toBe('proof_submitted');
    expect(s.payout?.error).toContain("n'a pas démarré");
    expect(await escrow()).toBe(before);
    expect(await countOf('payout_failed')).toBe(1);
  });

  it('keeps the funds reserved however old the payout is while Bitnob says it is processing', async () => {
    unconfirmed();
    await approve();
    await ageThePayout(60);
    fake.payoutStatus.mockResolvedValue({ status: 'pending' });
    await services.reconcile();
    expect((await step()).status).toBe('releasing');
    expect(await countOf('payout_failed')).toBe(0);
  });

  it('pays the step when Bitnob confirms it completed', async () => {
    const completedBefore = await countOf('payout_completed'); // the demo data already has two
    unconfirmed();
    await approve();
    await ageThePayout(1);
    fake.payoutStatus.mockResolvedValue({ status: 'completed' });
    await services.reconcile();
    expect((await step()).status).toBe('paid');
    expect(await countOf('payout_completed')).toBe(completedBefore + 1);
  });
});

describe('the process stopped between the two database writes (releasing without a payout id)', () => {
  /** startPayout never answers: the state is exactly what phase 1 left behind. */
  const crashAfterPhase1 = async () => {
    fake.startPayout.mockReturnValue(new Promise(() => undefined));
    void services.quoteRelease(await user(), PROJECT, STEP).then(async () => services.confirmRelease(await user(), PROJECT, STEP));
    await vi.waitFor(async () => expect((await step()).status).toBe('releasing'));
    expect((await step()).payout?.payoutId).toBeUndefined();
  };

  it('does not touch a recent one (the request may still be on its way)', async () => {
    await crashAfterPhase1();
    await services.reconcile();
    expect(fake.findPayoutByReference).not.toHaveBeenCalled();
    expect((await step()).status).toBe('releasing');
  });

  it('gives the funds back when Bitnob has never heard of the reference', async () => {
    const before = await escrow();
    await crashAfterPhase1();
    await ageThePayout(6);
    fake.findPayoutByReference.mockResolvedValue(null);
    await services.reconcile();
    expect((await step()).status).toBe('proof_submitted');
    expect(await escrow()).toBe(before);
    expect(await countOf('payout_failed')).toBe(1);
  });

  it('adopts the payout found by reference and follows its real status instead of failing it', async () => {
    await crashAfterPhase1();
    await ageThePayout(6);
    fake.findPayoutByReference.mockResolvedValue({ payoutId: 'po_found', status: 'pending' });
    fake.payoutStatus.mockResolvedValue({ status: 'completed' });
    await services.reconcile(); // found, still processing -> adopted, stays releasing
    expect((await step()).payout?.payoutId).toBe('po_found');
    expect((await step()).status).toBe('releasing');
    await services.reconcile(); // now polled by id -> completed
    expect((await step()).status).toBe('paid');
    expect(await countOf('payout_failed')).toBe(0);
  });

  it('does not give the funds back when the lookup itself fails (Bitnob unreachable)', async () => {
    await crashAfterPhase1();
    await ageThePayout(6);
    fake.findPayoutByReference.mockRejectedValue(new GatewayError('Bitnob injoignable', undefined, undefined, 'network_error'));
    await services.reconcile();
    expect((await step()).status).toBe('releasing');
  });
});

describe('a stale reconciliation never fails a payout that moved on', () => {
  it('leaves the step alone if its payout was replaced while Bitnob was being asked', async () => {
    fake.startPayout.mockResolvedValue({ payoutId: 'po_old', status: 'pending', uncertain: true });
    await approve();
    await ageThePayout(6);
    fake.payoutStatus.mockImplementation(async () => {
      // meanwhile the step was retried: it carries a different payout now
      await db.withDb((d) => {
        const s = d.projects.find((p) => p.id === PROJECT)!.steps.find((x) => x.id === STEP)!;
        s.payout = { ...s.payout!, reference: 'nobpay:pay:retry', payoutId: 'po_new', uncertain: false, startedAt: new Date().toISOString() };
      });
      return { status: 'failed', error: 'old payout failed' };
    });
    await services.reconcile();
    const s = await step();
    expect(s.status).toBe('releasing');
    expect(s.payout?.reference).toBe('nobpay:pay:retry');
    expect(await countOf('payout_failed')).toBe(0);
  });
});
