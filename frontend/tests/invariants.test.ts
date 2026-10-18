import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { escrowCents, fundedCents, releasedCents, reservedCents, type Db } from '@/lib/types';
import { GatewayError } from '@/server/bitnob/types';
import { HttpError } from '@/server/http';

/**
 * Randomised sequences against the real services, the real webhook receiver and an in-memory Bitnob.
 * After EVERY action the money rules must hold, whatever the order, duplication or loss of events.
 */

const started: string[] = []; // every payout reference sent to Bitnob, in order
let behaviour = { uncertain: 0 }; // share of startPayout calls whose answer is "lost"
const fake = vi.hoisted(() => ({
  quotePayout: vi.fn(),
  startPayout: vi.fn(),
  payoutStatus: vi.fn(),
  findPayoutByReference: vi.fn(),
  balances: vi.fn(),
  btcUsd: vi.fn(),
}));
vi.mock('@/server/bitnob', () => ({
  getGateway: () => ({ mode: 'sandbox', ...fake }),
  gatewayFor: () => ({ mode: 'sandbox', ...fake }),
}));

let services: typeof import('@/server/services');
let webhooks: typeof import('@/server/webhooks');
let sign: typeof import('@/server/bitnob/sign');
let ledger: typeof import('@/server/ledger');
let db: typeof import('@/server/db');
const SECRET = 'whsec_invariants';
const PID = 'p_inv';

/** small deterministic PRNG so a failing seed can be replayed */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-inv-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  process.env.RATE_LIMIT = '0';
  services = await import('@/server/services');
  webhooks = await import('@/server/webhooks');
  sign = await import('@/server/bitnob/sign');
  ledger = await import('@/server/ledger');
  db = await import('@/server/db');
});
afterAll(() => {
  delete process.env.RATE_LIMIT;
});

let n = 0;
beforeEach(async () => {
  await db.resetDb();
  started.length = 0;
  behaviour = { uncertain: 0 };
  for (const f of Object.values(fake)) f.mockReset();
  fake.balances.mockResolvedValue({ USDT: 1e9 });
  fake.btcUsd.mockResolvedValue(81_500);
  fake.findPayoutByReference.mockResolvedValue(null);
  fake.payoutStatus.mockResolvedValue({ status: 'pending' });
  fake.quotePayout.mockImplementation(async ({ amountUsdCents, reference }) => ({
    quoteId: `QT_${++n}`, reference, amountUsdCents, rate: 593, feeUsdCents: 0, amountFcfa: 1, expiresAt: new Date(Date.now() + 600_000).toISOString(), mode: 'sandbox',
  }));
  fake.startPayout.mockImplementation(async ({ reference }) => {
    started.push(reference);
    return { payoutId: `po_${reference}`, status: 'pending', ...(Math.random() < behaviour.uncertain ? { uncertain: true } : {}) };
  });
  await db.withDb((d) => {
    d.projects.push({
      id: PID, ownerId: 'u_aminata', name: 'Inv', sector: 'commerce', city: 'Dakar', country: 'SN', budgetCents: 60_000, coverImage: '/x', managerName: 'M', managerToken: 'tok_inv', approvalRule: 'owner', createdAt: new Date().toISOString(),
      steps: [1, 2, 3].map((i) => ({ id: `${PID}_s${i}`, index: i, title: `E${i}`, amountCents: 20_000, proofKinds: ['facture' as const], status: 'upcoming' as const })),
    });
    ledger.appendLedger(d, PID, 'project_created', { name: 'Inv' });
  });
});

const owner = async () => (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
const deliver = (event: string, data: Record<string, unknown>, eventId?: string) => {
  const body = JSON.stringify({ event, event_id: eventId ?? `evt_${++n}`, data });
  return webhooks.handleBitnobWebhook(body, sign.signWebhookBody(SECRET, body));
};

/** the rules that must hold in every reachable state */
async function assertInvariants(label: string) {
  const d: Db = await db.readDb();
  const p = d.projects.find((x) => x.id === PID)!;
  const funded = fundedCents(d, PID), released = releasedCents(p), reserved = reservedCents(p), escrow = escrowCents(d, p);
  const ctx = `${label} | funded ${funded} released ${released} reserved ${reserved}`;
  expect(escrow, `escrow never negative: ${ctx}`).toBeGreaterThanOrEqual(0);
  expect(released, `released <= funded: ${ctx}`).toBeLessThanOrEqual(funded);
  expect(released + reserved, `released + reserved <= funded: ${ctx}`).toBeLessThanOrEqual(funded);
  // steps are sequential: at most one in flight at a time
  expect(p.steps.filter((s) => ['active', 'proof_submitted', 'rejected', 'releasing'].includes(s.status)).length, `one open step: ${ctx}`).toBeLessThanOrEqual(1);
  // a step is paid only if its payout completed; a releasing step has a payout
  for (const s of p.steps) {
    if (s.status === 'paid') expect(s.payout?.status, `paid => completed (${s.id}): ${ctx}`).toBe('completed');
    if (s.status === 'releasing') expect(s.payout, `releasing => payout (${s.id}): ${ctx}`).toBeDefined();
    if (s.status === 'upcoming') expect(s.payout, `upcoming => no payout (${s.id}): ${ctx}`).toBeUndefined();
  }
  // each money event is recorded at most once
  const events = ledger.ledgerFor(d, PID);
  const count = (t: string, key: string) => {
    const seen = new Map<string, number>();
    for (const e of events.filter((x) => x.type === t)) seen.set(String(e.data[key]), (seen.get(String(e.data[key])) ?? 0) + 1);
    return Math.max(0, ...seen.values());
  };
  expect(count('funding_paid', 'fundingId'), `a funding is credited once: ${ctx}`).toBeLessThanOrEqual(1);
  expect(count('payout_completed', 'stepId'), `a step is paid once: ${ctx}`).toBeLessThanOrEqual(1);
  expect(ledger.verifyChain(events).ok, `ledger chain intact: ${ctx}`).toBe(true);
  // never two payouts for the same reference at the provider
  expect(new Set(started).size, `a payout reference is sent once: ${started.join(',')}`).toBe(started.length);
}

type Action = () => Promise<void>;

function actions(rand: () => number): Record<string, Action> {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const state = async () => (await db.readDb()).projects.find((x) => x.id === PID)!;
  const step = async () => (await state()).steps.find((s) => s.status === 'releasing') ?? pick((await state()).steps);
  return {
    async fund() {
      const id = `f_${++n}`;
      const cents = pick([5_000, 20_000, 40_000, 60_000]);
      await db.withDb((d) => {
        d.fundings.push({ id, projectId: PID, amountCents: cents, method: 'lightning', status: 'pending', reference: `nobpay:fund:${id}`, mode: 'sandbox', createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, paymentHash: id.padEnd(64, 'a'), amountSats: 100_000 });
      });
      const eventId = `evt_${id}`;
      await deliver('btc.lightning.received.success', { id: `inv_${id}`, amount: 100_000 }, eventId);
      if (rand() < 0.5) await deliver('btc.lightning.received.success', { id: `inv_${id}`, amount: 100_000 }, eventId); // replay
      if (rand() < 0.4) await deliver('transfer.success', { id: `inv_${id}`, amount: 100_000 }); // same payment, other name, new event id
    },
    async fundWrongAmount() {
      const id = `f_${++n}`;
      await db.withDb((d) => void d.fundings.push({ id, projectId: PID, amountCents: 20_000, method: 'lightning', status: 'pending', reference: `nobpay:fund:${id}`, mode: 'sandbox', createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, amountSats: 100_000 }));
      await deliver('btc.lightning.received.success', { id: `inv_${id}`, amount: 3 });
    },
    async proof() {
      const s = (await state()).steps.find((x) => x.status === 'active' || x.status === 'rejected');
      if (!s) return;
      const file = { id: `fl_${++n}`, name: 'f.png', mime: 'image/png', size: 1, sha256: 'ab' };
      await services.submitProof({ kind: 'owner', user: await owner() }, PID, s.id, { photos: [], invoice: file, supplier: { name: 'Fournisseur', phone: '+221771234567', network: 'wave' } });
    },
    async approve() {
      const s = (await state()).steps.find((x) => x.status === 'proof_submitted');
      if (!s) return;
      await services.quoteRelease(await owner(), PID, s.id);
      await services.confirmRelease(await owner(), PID, s.id);
    },
    async reject() {
      const s = (await state()).steps.find((x) => x.status === 'proof_submitted');
      if (s) await services.rejectProof(await owner(), PID, s.id, 'flou');
    },
    async payoutSuccessWebhook() {
      const s = await step();
      const ref = s.payout?.reference ?? 'nobpay:pay:unknown';
      await deliver('payouts.withdrawal.success', { id: s.payout?.payoutId ?? 'po_x', reference: ref, status: 'success' });
      if (rand() < 0.5) await deliver('transfer.success', { id: s.payout?.payoutId ?? 'po_x', reference: ref });
    },
    async payoutFailWebhook() {
      const s = await step();
      await deliver('payouts.withdrawal.expired', { id: s.payout?.payoutId ?? 'po_x', reference: s.payout?.reference ?? 'nobpay:pay:unknown', status: 'expired' });
    },
    async reconcileTick() {
      fake.payoutStatus.mockResolvedValue({ status: pick(['pending', 'initiated', 'completed', 'failed'] as const) });
      await services.reconcile();
    },
    async age() {
      await db.withDb((d) => {
        for (const s of d.projects.find((x) => x.id === PID)!.steps) if (s.payout) s.payout.startedAt = new Date(Date.now() - 6 * 60_000).toISOString();
      });
    },
    async lostAnswers() {
      behaviour = { uncertain: rand() < 0.5 ? 1 : 0 };
    },
  };
}

describe('money invariants hold under random orders of events', () => {
  const SEEDS = Array.from({ length: 30 }, (_, i) => 1000 + i);
  it.each(SEEDS)('seed %i: 40 random actions', async (seed) => {
    const rand = rng(seed);
    const act = actions(rand);
    const names = Object.keys(act);
    const trail: string[] = [];
    for (let i = 0; i < 40; i++) {
      const name = names[Math.floor(rand() * names.length)];
      trail.push(name);
      try {
        await act[name]();
      } catch (err) {
        // a refused action (409, 502...) is fine; a crash (TypeError...) is a bug
        if (!(err instanceof HttpError) && !(err instanceof GatewayError)) throw new Error(`seed ${seed}, step ${i} (${name}) crashed: ${(err as Error).stack}\ntrail: ${trail.join(' > ')}`);
      }
      await assertInvariants(`seed ${seed}, after ${trail.join(' > ')}`);
    }
  });

  it('applying the same webhook event twice changes nothing (idempotent)', async () => {
    const id = 'f_idem';
    await db.withDb((d) => void d.fundings.push({ id, projectId: PID, amountCents: 60_000, method: 'lightning', status: 'pending', reference: `nobpay:fund:${id}`, mode: 'sandbox', createdAt: new Date().toISOString(), invoiceId: `inv_${id}`, amountSats: 100_000 }));
    await deliver('btc.lightning.received.success', { id: `inv_${id}`, amount: 100_000 }, 'evt_idem');
    const once = JSON.stringify({ ...(await db.readDb()), webhooks: [] });
    await deliver('btc.lightning.received.success', { id: `inv_${id}`, amount: 100_000 }, 'evt_idem');
    await deliver('transfer.success', { id: `inv_${id}`, amount: 100_000 });
    expect(JSON.stringify({ ...(await db.readDb()), webhooks: [] })).toBe(once);
  });

  it('a payout event that arrives BEFORE the payout is known credits and pays nothing', async () => {
    const before = JSON.stringify({ ...(await db.readDb()), webhooks: [] });
    await deliver('payouts.withdrawal.success', { id: 'po_early', reference: 'nobpay:pay:p_inv_s1:early', status: 'success' });
    expect(JSON.stringify({ ...(await db.readDb()), webhooks: [] })).toBe(before);
    await assertInvariants('early payout event');
  });
});
