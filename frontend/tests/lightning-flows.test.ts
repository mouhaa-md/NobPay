import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUICK_TRIAL, QUICK_TRIAL_BUDGET_CENTS } from '@/lib/templates';
import { escrowCents, type Project, type User } from '@/lib/types';
import { setWalletsForTests } from '@/server/lightning';
import { setPriceSourcesForTests } from '@/server/lightning/price';
import { encodeBolt11 } from './helpers/bolt11';
import { defaultLnurl, fakeLnurlServer, type LnurlBehaviour } from './helpers/fakeLnurl';
import { FakeWallet, sha256Hex } from './helpers/fakeWallet';

// The supplier's domain is fake: every LNURL request goes to our scripted server (the real client refuses private hosts).
const lnurl = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/server/lightning/safeFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/lightning/safeFetch')>()),
  safeGetJson: (url: string) => lnurl.get(url),
}));

let services: typeof import('@/server/services');
let flows: typeof import('@/server/lightningFlows');
let db: typeof import('@/server/db');
let wallet: FakeWallet;
let behaviour: LnurlBehaviour;

const BTC_USD = 100_000; // $60 = 60 000 sats
const ADDRESS = 'moussa@wallet.example';
const owner: User = { id: 'u_ln', firstName: 'Invité', lastName: 'TEST', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-ln-'));
  services = await import('@/server/services');
  flows = await import('@/server/lightningFlows');
  db = await import('@/server/db');
});

beforeEach(async () => {
  vi.stubEnv('LIGHTNING_RAIL', 'nwc');
  vi.stubEnv('NWC_RECEIVE_URL', 'nostr+walletconnect://x');
  vi.stubEnv('ALLOW_DEMO', '0');
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('RATE_LIMIT', '0');
  vi.stubEnv('LIGHTNING_MAX_FUNDING_USD', '500');
  vi.stubEnv('LIGHTNING_MAX_PAYOUT_USD', '500');
  vi.stubEnv('LIGHTNING_MAX_ESCROW_USD', '2000');
  wallet = new FakeWallet();
  behaviour = defaultLnurl();
  lnurl.get.mockReset();
  lnurl.get.mockImplementation(fakeLnurlServer(wallet, behaviour));
  setWalletsForTests({ receive: wallet, payout: wallet });
  setPriceSourcesForTests(async () => ({ ok: true, json: async () => ({ USD: BTC_USD }) }));
  flows.resetLightningStateForTests();
  await db.resetDb();
  await db.withDb((d) => {
    d.users.push({ ...owner });
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  setWalletsForTests(null);
  setPriceSourcesForTests(null);
});

/** Two steps of $60. */
async function newProject(): Promise<Project> {
  return services.createProject(owner, {
    name: 'Essai',
    sector: 'commerce',
    city: 'Dakar',
    budgetCents: 12_000,
    managerName: 'Moussa',
    steps: [60, 60].map((d, i) => ({ title: `Étape ${i + 1}`, amountCents: d * 100, proofKinds: ['photos'] as ['photos'] })),
  });
}
const state = async (projectId: string) => {
  const d = await db.readDb();
  return { project: d.projects.find((p) => p.id === projectId)!, db: d };
};
const escrowOf = async (projectId: string) => {
  const { project, db: d } = await state(projectId);
  return escrowCents(d, project);
};
const ledger = async (projectId: string, type: string) => (await db.readDb()).ledger.filter((e) => e.projectId === projectId && e.type === type);

async function fund(projectId: string, cents = 6_000) {
  const f = await services.createFunding(owner, projectId, { amountCents: cents, method: 'lightning' });
  wallet.settle(f.paymentHash!);
  await flows.settleLightningFunding(f.id);
  return f;
}
async function proof(project: Project, index = 0, supplier: Partial<{ network: 'lightning' | 'wave'; phone: string; lightningAddress: string }> = {}) {
  return services.submitProof({ kind: 'owner', user: owner }, project.id, project.steps[index].id, {
    photos: [{ id: 'fl_x', name: 'p.jpg', mime: 'image/jpeg', size: 10, sha256: 'a'.repeat(64), takenAt: new Date().toISOString() }],
    supplier: { name: 'Moussa Diop', phone: '', network: 'lightning', lightningAddress: ADDRESS, ...supplier },
  });
}
async function approved(project: Project, index = 0) {
  await proof(project, index);
  await services.quoteRelease(owner, project.id, project.steps[index].id);
  return services.confirmRelease(owner, project.id, project.steps[index].id);
}
const stepOf = async (projectId: string, index = 0) => (await state(projectId)).project.steps[index];
const ageThePayout = (projectId: string, index: number, minutes: number) =>
  db.withDb((d) => {
    const s = d.projects.find((p) => p.id === projectId)!.steps[index];
    s.payout!.startedAt = new Date(Date.now() - minutes * 60_000).toISOString();
  });

describe('funding with real bitcoin', () => {
  it('makes an invoice for the dollar amount at the price of the moment, valid one hour', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    expect(f).toMatchObject({ mode: 'nwc', status: 'pending', amountSats: 60_000, btcUsd: BTC_USD });
    expect(f.bolt11).toMatch(/^lnbc/);
    expect(f.invoiceId).toBe(f.paymentHash);
    expect(Date.parse(f.expiresAt!) - Date.now()).toBeGreaterThan(55 * 60_000);
    expect(Date.parse(f.expiresAt!) - Date.now()).toBeLessThanOrEqual(60 * 60_000 + 1_000);
    expect(wallet.makeInvoiceCalls).toBe(1);
  });

  it('credits the escrow only when the wallet says the invoice is settled, once, and unlocks the first step', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    await flows.settleLightningFunding(f.id); // nothing paid yet
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('pending');
    expect(await escrowOf(project.id)).toBe(0);

    wallet.settle(f.paymentHash!);
    await flows.settleLightningFunding(f.id);
    await flows.settleLightningFunding(f.id); // a second look credits nothing more
    const after = (await db.readDb()).fundings.find((x) => x.id === f.id)!;
    expect(after.status).toBe('paid');
    expect(after.preimage).toBeTruthy();
    expect(sha256Hex(after.preimage!)).toBe(f.paymentHash);
    expect(await escrowOf(project.id)).toBe(6_000);
    expect((await stepOf(project.id)).status).toBe('active');
    const events = await ledger(project.id, 'funding_paid');
    expect(events).toHaveLength(1);
    expect(events[0].data).toMatchObject({ amountCents: 6_000, amountSats: 60_000, paymentHash: f.paymentHash });
    expect(events[0].data.simulated).toBeUndefined(); // real money is never marked simulated
  });

  it('the screen asking (refreshFunding) credits it too, so nobody waits for the background loop', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    wallet.settle(f.paymentHash!);
    expect((await services.refreshFunding(owner, f.id)).status).toBe('paid');
  });

  it('credits nothing when the wallet reports less than the invoice, and says why', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    wallet.settle(f.paymentHash!, { reportedSats: 59_000 });
    await flows.settleLightningFunding(f.id);
    const after = (await db.readDb()).fundings.find((x) => x.id === f.id)!;
    expect(after.status).toBe('pending');
    expect(after.note).toContain('59000');
    expect(await escrowOf(project.id)).toBe(0);
  });

  it('credits nothing when the proof of payment does not match the invoice', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    wallet.settle(f.paymentHash!, { badPreimage: true });
    await flows.settleLightningFunding(f.id);
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('pending');
  });

  it('an invoice left unpaid expires', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    await db.withDb((d) => void (d.fundings.find((x) => x.id === f.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()));
    await services.expireFundings();
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('expired');
  });

  it('a payment that lands just after the invoice was closed as expired is still credited (the funder\'s sats are not lost)', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    await db.withDb((d) => void (d.fundings.find((x) => x.id === f.id)!.expiresAt = new Date(Date.now() - 1000).toISOString()));
    await services.expireFundings(); // the clock closes it...
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('expired');
    wallet.settle(f.paymentHash!); // ...and the wallet reports the payment afterwards
    await flows.pollPendingLightningFundings();
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('paid');
    expect(await escrowOf(project.id)).toBe(6_000);
    expect((await ledger(project.id, 'funding_paid'))).toHaveLength(1);
  });

  it('an expired invoice nobody paid stays expired, and is only asked about for a day', async () => {
    const project = await newProject();
    const f = await services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' });
    const past = (ms: number) => new Date(Date.now() - ms).toISOString();
    await db.withDb((d) => void (d.fundings.find((x) => x.id === f.id)!.expiresAt = past(1000)));
    await services.expireFundings();
    await flows.pollPendingLightningFundings();
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('expired');
    // two days later it is no longer polled: a settled payment is then a case for a person
    await db.withDb((d) => void (d.fundings.find((x) => x.id === f.id)!.expiresAt = past(48 * 3_600_000)));
    flows.resetLightningStateForTests();
    wallet.settle(f.paymentHash!);
    await flows.pollPendingLightningFundings();
    expect((await db.readDb()).fundings.find((x) => x.id === f.id)!.status).toBe('expired');
  });

  it('refuses the demo account (shared by everybody) and an amount above the pilot ceiling', async () => {
    const project = await newProject();
    const demo = { ...owner, demo: true };
    await expect(services.createFunding(demo, project.id, { amountCents: 6_000, method: 'lightning' })).rejects.toMatchObject({ status: 403, code: 'demo_no_real_sats' });
    vi.stubEnv('LIGHTNING_MAX_FUNDING_USD', '50');
    await expect(services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' })).rejects.toMatchObject({ status: 400, code: 'pilot_cap' });
  });

  it('stops at the total escrow ceiling of the pilot', async () => {
    const project = await newProject();
    await fund(project.id, 6_000);
    vi.stubEnv('LIGHTNING_MAX_ESCROW_USD', '100');
    await expect(services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' })).rejects.toMatchObject({ status: 409, code: 'pilot_cap' });
  });

  it('suspends funding and payouts when the wallet holds less than what is owed', async () => {
    const project = await newProject();
    await fund(project.id, 6_000);
    wallet.balance = 0;
    const s = await flows.checkWalletSolvency();
    expect(s).toMatchObject({ violated: true, liabilityCents: 6_000, assetsCents: 0 });
    await expect(services.createFunding(owner, project.id, { amountCents: 6_000, method: 'lightning' })).rejects.toMatchObject({ status: 503, code: 'payments_paused' });
    await proof(project);
    await expect(services.quoteRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ status: 503, code: 'payments_paused' });
    wallet.balance = 5_000_000;
    expect((await flows.checkWalletSolvency())!.violated).toBe(false);
  });

  it('does not count one wallet twice when both connections point at it (same public key)', async () => {
    const project = await newProject();
    await fund(project.id, 6_000);
    const sameWalletOtherConnection = new FakeWallet(); // another connection string, same wallet: same key, same balance
    sameWalletOtherConnection.pubkey = wallet.pubkey;
    wallet.balance = sameWalletOtherConnection.balance = 30_000; // $30 held for $60 owed
    setWalletsForTests({ receive: wallet, payout: sameWalletOtherConnection });
    expect(await flows.checkWalletSolvency()).toMatchObject({ assetsCents: 3_000, liabilityCents: 6_000, violated: true });

    const otherWallet = new FakeWallet(); // a genuinely different wallet does add up
    otherWallet.pubkey = 'bb'.repeat(32);
    otherWallet.balance = 30_000;
    setWalletsForTests({ receive: wallet, payout: otherWallet });
    expect(await flows.checkWalletSolvency()).toMatchObject({ assetsCents: 6_000, violated: false });
  });

  it('a mobile money supplier cannot be chosen where only real bitcoin runs, and a bad address is refused', async () => {
    const project = await newProject();
    await fund(project.id);
    await expect(proof(project, 0, { network: 'wave', phone: '+221771234567', lightningAddress: undefined })).rejects.toMatchObject({ status: 400, code: 'lightning_only' });
    await expect(proof(project, 0, { lightningAddress: 'pas une adresse' })).rejects.toMatchObject({ status: 400 });
    const s = await proof(project, 0, { lightningAddress: '  Moussa@Wallet.Example ' });
    expect(s.proof!.supplier).toMatchObject({ network: 'lightning', phone: '', lightningAddress: ADDRESS });
  });
});

describe('paying a supplier at a Lightning address', () => {
  it('quotes the exact sats and the checked invoice, short-lived', async () => {
    const project = await newProject();
    await fund(project.id);
    await proof(project);
    const q = await services.quoteRelease(owner, project.id, project.steps[0].id);
    expect(q.mode).toBe('nwc');
    expect(q.lightning).toMatchObject({ amountSats: 60_000, btcUsd: BTC_USD, address: ADDRESS });
    expect(q.lightning!.bolt11).toMatch(/^lnbc/);
    expect(Date.parse(q.expiresAt) - Date.now()).toBeLessThanOrEqual(121_000);
    expect(wallet.paid).toHaveLength(0); // quoting never moves money
  });

  it('pays, completes at once, and writes the proof of payment in the ledger without the full address', async () => {
    const project = await newProject();
    await fund(project.id);
    const before = await escrowOf(project.id);
    const step = await approved(project);
    expect(step.status).toBe('paid');
    expect(wallet.paid).toHaveLength(1);
    expect(await escrowOf(project.id)).toBe(before - 6_000);
    expect(step.payout).toMatchObject({ status: 'completed', mode: 'nwc' });
    expect(sha256Hex(step.payout!.lightning!.preimage!)).toBe(step.payout!.lightning!.paymentHash);
    expect(step.payout!.lightning!.feesSats).toBe(1);

    const started = (await ledger(project.id, 'payout_started'))[0].data;
    expect(started).toMatchObject({ rail: 'lightning', amountSats: 60_000, lightningDomain: 'wallet.example' });
    expect(JSON.stringify(started)).not.toContain('moussa@'); // the address itself stays private
    const done = (await ledger(project.id, 'payout_completed'))[0].data;
    expect(done).toMatchObject({ rail: 'lightning', amountSats: 60_000, paymentHash: step.payout!.lightning!.paymentHash });
    expect(sha256Hex(done.preimage as string)).toBe(done.paymentHash);
    expect(done.simulated).toBeUndefined();
    expect((await stepOf(project.id, 1)).status).toBe('upcoming'); // the next step needs its own funds
  });

  it('a refusal by the network gives the funds back, once, with a French message', async () => {
    const project = await newProject();
    await fund(project.id);
    const before = await escrowOf(project.id);
    wallet.payMode = 'fail';
    await expect(approved(project)).rejects.toMatchObject({ status: 502, code: 'gateway_error', message: expect.stringContaining('Paiement non exécuté') });
    expect((await stepOf(project.id)).status).toBe('proof_submitted');
    expect(await escrowOf(project.id)).toBe(before);
    expect(await ledger(project.id, 'payout_failed')).toHaveLength(1);
  });

  it('a wallet without enough funds is a refusal too', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'insufficient';
    await expect(approved(project)).rejects.toMatchObject({ status: 502 });
    expect((await stepOf(project.id)).status).toBe('proof_submitted');
  });

  it('a lost answer keeps the funds reserved; the wallet later says it was paid, and the step completes (never paid twice)', async () => {
    const project = await newProject();
    await fund(project.id);
    const before = await escrowOf(project.id);
    wallet.payMode = 'timeout-sent';
    const step = await approved(project);
    expect(step.status).toBe('releasing');
    expect(step.payout).toMatchObject({ status: 'pending', uncertain: true });
    expect(await escrowOf(project.id)).toBe(before - 6_000);
    expect(await ledger(project.id, 'payout_failed')).toHaveLength(0);

    await ageThePayout(project.id, 0, 1);
    await services.reconcile();
    const done = await stepOf(project.id);
    expect(done.status).toBe('paid');
    expect(done.payout!.lightning!.preimage).toBeTruthy();
    expect(wallet.paid).toHaveLength(1);
    await services.reconcile();
    expect(await ledger(project.id, 'payout_completed')).toHaveLength(1);
  });

  it('a lost answer for a payment the wallet never saw: still reserved until the invoice can no longer be paid', async () => {
    const project = await newProject();
    await fund(project.id);
    const before = await escrowOf(project.id);
    wallet.payMode = 'timeout-not-sent';
    await approved(project);

    // The supplier's invoice lives ten minutes. A wallet that was offline may still process the request it was sent:
    // until the invoice has expired, "the wallet knows nothing of it" must not hand the escrow back (it would be paid twice).
    for (const minutes of [1, 6, 9]) {
      await ageThePayout(project.id, 0, minutes);
      await services.reconcile();
      expect((await stepOf(project.id)).status, `${minutes} min`).toBe('releasing');
      expect(await escrowOf(project.id)).toBe(before - 6_000);
    }

    await ageThePayout(project.id, 0, 11);
    await services.reconcile();
    expect((await stepOf(project.id)).status).toBe('proof_submitted');
    expect(await escrowOf(project.id)).toBe(before);
    expect(await ledger(project.id, 'payout_failed')).toHaveLength(1);
  });

  it('an invoice that lives a long time is waited for, but never more than six hours', () => {
    const invoice = (expiry: number) => encodeBolt11({ amountMsat: 1_000_000n, paymentHash: 'ab'.repeat(32), expiry, timestamp: Math.floor(Date.now() / 1000), network: 'mainnet' });
    expect(flows.unconfirmedWaitMs(invoice(60))).toBe(5 * 60_000); // never shorter than the usual five minutes
    expect(flows.unconfirmedWaitMs(invoice(3_600))).toBe(3_600_000);
    expect(flows.unconfirmedWaitMs(invoice(7 * 86_400))).toBe(6 * 3_600_000);
    expect(flows.unconfirmedWaitMs('not an invoice')).toBe(5 * 60_000);
  });

  describe('a wallet that says "failed" while the payment is still on its way', () => {
    it('keeps the escrow reserved while the wallet shows it pending, and completes when it settles (never paid twice)', async () => {
      const project = await newProject();
      await fund(project.id);
      const before = await escrowOf(project.id);
      wallet.payMode = 'fail-in-flight';
      const step = await approved(project); // no "payment not executed" error: we do not know that
      expect(step).toMatchObject({ status: 'releasing' });
      expect(step.payout).toMatchObject({ status: 'pending', uncertain: true });
      expect(await escrowOf(project.id)).toBe(before - 6_000);
      expect(await ledger(project.id, 'payout_failed')).toHaveLength(0);

      await ageThePayout(project.id, 0, 600);
      await services.reconcile();
      expect((await stepOf(project.id)).status).toBe('releasing'); // pending is not failed, however old

      const hash = step.payout!.lightning!.paymentHash;
      wallet.outgoing.set(hash, { state: 'settled', preimage: wallet.preimageFor(hash)!, feesSats: 1, amountSats: 60_000 });
      await services.reconcile();
      expect((await stepOf(project.id)).status).toBe('paid');
      expect(wallet.paid).toHaveLength(1);
    });

    it('takes the payment as made when the wallet shows it settled with a valid proof', async () => {
      const project = await newProject();
      await fund(project.id);
      wallet.payMode = 'fail-but-paid';
      const step = await approved(project);
      expect(step.status).toBe('paid');
      expect(sha256Hex(step.payout!.lightning!.preimage!)).toBe(step.payout!.lightning!.paymentHash);
      expect(await ledger(project.id, 'payout_failed')).toHaveLength(0);
      expect(wallet.paid).toHaveLength(1);
    });

    it('keeps it reserved when the wallet cannot be asked', async () => {
      const project = await newProject();
      await fund(project.id);
      const before = await escrowOf(project.id);
      wallet.payMode = 'fail-in-flight';
      wallet.failLookupsAfterPay = true;
      const step = await approved(project);
      expect(step.status).toBe('releasing');
      expect(await escrowOf(project.id)).toBe(before - 6_000);
    });

    it('a failure the wallet does not contradict still gives the escrow back', async () => {
      const project = await newProject();
      await fund(project.id);
      const before = await escrowOf(project.id);
      wallet.payMode = 'fail';
      await expect(approved(project)).rejects.toMatchObject({ status: 502 });
      expect(await escrowOf(project.id)).toBe(before);
    });
  });

  it('keeps waiting while the wallet shows the payment as pending, however old', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'timeout-not-sent';
    await approved(project);
    const hash = (await stepOf(project.id)).payout!.lightning!.paymentHash;
    wallet.outgoing.set(hash, { state: 'pending', preimage: '', feesSats: 0, amountSats: 60_000 });
    await ageThePayout(project.id, 0, 600);
    await services.reconcile();
    expect((await stepOf(project.id)).status).toBe('releasing');
  });

  it('a wallet that cannot be reached during reconcile changes nothing', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'timeout-sent';
    await approved(project);
    wallet.failLookups = true;
    await ageThePayout(project.id, 0, 10);
    await services.reconcile();
    expect((await stepOf(project.id)).status).toBe('releasing');
  });

  describe('an invoice from the supplier\'s domain that is not what was asked is never paid', () => {
    it.each([
      ['another amount', (b: LnurlBehaviour) => void (b.amountOffsetMsat = 1_000_000n)],
      ['another network', (b: LnurlBehaviour) => void (b.network = 'testnet')],
      ['a forged description', (b: LnurlBehaviour) => void (b.badDescriptionHash = true)],
    ])('%s', async (_name, tweak) => {
      const project = await newProject();
      await fund(project.id);
      await proof(project);
      tweak(behaviour);
      await expect(services.quoteRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ status: 409, code: 'lightning_address' });
      expect(wallet.paid).toHaveLength(0);
      expect((await stepOf(project.id)).payout).toBeUndefined();
    });

    it('a domain that is down: a clear 502, nothing reserved', async () => {
      const project = await newProject();
      await fund(project.id);
      await proof(project);
      behaviour.down.add('wallet.example');
      await expect(services.quoteRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ status: 502, code: 'lightning_address' });
      expect(await escrowOf(project.id)).toBe(6_000);
    });
  });

  it('respects the pilot ceiling per payment, and an empty payout wallet', async () => {
    const project = await newProject();
    await fund(project.id);
    await proof(project);
    vi.stubEnv('LIGHTNING_MAX_PAYOUT_USD', '50');
    await expect(services.quoteRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ status: 409, code: 'pilot_cap' });
    vi.stubEnv('LIGHTNING_MAX_PAYOUT_USD', '500');
    wallet.balance = 100;
    await expect(services.quoteRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ status: 409, code: 'insufficient_balance' });
  });

  it('an expired quote is refused and nothing is paid', async () => {
    const project = await newProject();
    await fund(project.id);
    await proof(project);
    await services.quoteRelease(owner, project.id, project.steps[0].id);
    await db.withDb((d) => void (d.projects.find((p) => p.id === project.id)!.steps[0].quote!.expiresAt = new Date(Date.now() - 1000).toISOString()));
    await expect(services.confirmRelease(owner, project.id, project.steps[0].id)).rejects.toMatchObject({ code: 'quote_expired' });
    expect(wallet.paid).toHaveLength(0);
  });
});

describe('the "essai rapide" with real sats', () => {
  it('runs the whole path: 15 $ in, three 5 $ steps paid in sats, a refund of nothing left', async () => {
    const trial = await services.createProject(owner, {
      name: QUICK_TRIAL.name,
      sector: QUICK_TRIAL.sector,
      city: QUICK_TRIAL.city,
      managerName: QUICK_TRIAL.managerName,
      budgetCents: QUICK_TRIAL_BUDGET_CENTS,
      steps: QUICK_TRIAL.steps.map((s) => ({ title: s.title, amountCents: s.amountCents, proofKinds: [...s.proofKinds] })),
    });
    const funding = await fund(trial.id, QUICK_TRIAL_BUDGET_CENTS);
    expect(funding.amountSats).toBe(15_000);
    expect((await stepOf(trial.id, 0)).status).toBe('active');

    for (let i = 0; i < 3; i++) {
      const step = await approved(trial, i);
      expect(step.status).toBe('paid');
      expect(step.payout!.lightning!.amountSats).toBe(5_000);
    }
    expect(wallet.paid).toHaveLength(3);
    expect(await escrowOf(trial.id)).toBe(0);
    await expect(flows.requestRefund(owner, trial.id, { amountCents: 100, address: 'moi@wallet.example' })).rejects.toMatchObject({ code: 'insufficient_escrow' });
    const { verifyChain, ledgerFor } = await import('@/server/ledger');
    expect(verifyChain(ledgerFor(await db.readDb(), trial.id)).ok).toBe(true);
  });
});

describe('taking unused escrow back', () => {
  const refund = (projectId: string, amountCents: number, address = 'maman@wallet.example') => flows.requestRefund(owner, projectId, { amountCents, address });

  it('sends the sats to the funder\'s address, leaves the escrow first, and records proof in the ledger', async () => {
    const project = await newProject();
    await fund(project.id);
    const r = await refund(project.id, 2_500);
    expect(r).toMatchObject({ status: 'completed', rail: 'lightning', amountCents: 2_500 });
    expect(r.lightning).toMatchObject({ amountSats: 25_000 });
    expect(sha256Hex(r.lightning!.preimage!)).toBe(r.lightning!.paymentHash);
    expect(await escrowOf(project.id)).toBe(3_500);
    expect(wallet.paid).toHaveLength(1);
    expect((await ledger(project.id, 'refund_started'))).toHaveLength(1);
    const done = (await ledger(project.id, 'refund_completed'))[0].data;
    expect(done).toMatchObject({ amountCents: 2_500, amountSats: 25_000, rail: 'lightning' });
    expect(JSON.stringify(await ledger(project.id, 'refund_started'))).not.toContain('maman@');
  });

  it('cannot take more than the escrow, and cannot take what a later refund no longer has', async () => {
    const project = await newProject();
    await fund(project.id);
    await expect(refund(project.id, 6_100)).rejects.toMatchObject({ status: 409, code: 'insufficient_escrow' });
    await refund(project.id, 6_000);
    expect(await escrowOf(project.id)).toBe(0);
    await expect(refund(project.id, 100)).rejects.toMatchObject({ status: 409, code: 'insufficient_escrow' });
  });

  it('is refused while a proof waits for a decision or a payment is in flight', async () => {
    const project = await newProject();
    await fund(project.id);
    await proof(project);
    await expect(refund(project.id, 1_000)).rejects.toMatchObject({ status: 409, code: 'decision_pending' });
  });

  it('a refused payment gives the money back to the escrow', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'fail';
    await expect(refund(project.id, 2_500)).rejects.toMatchObject({ status: 502 });
    expect(await escrowOf(project.id)).toBe(6_000);
    const failed = (await db.readDb()).refunds![0];
    expect(failed.status).toBe('failed');
    expect(await ledger(project.id, 'refund_failed')).toHaveLength(1);
    wallet.payMode = 'ok';
    expect((await refund(project.id, 2_500)).status).toBe('completed'); // and a new try works
  });

  it('a lost answer keeps it reserved, then completes once the wallet confirms (never sent twice)', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'timeout-sent';
    const r = await refund(project.id, 2_500);
    expect(r).toMatchObject({ status: 'pending', uncertain: true });
    expect(await escrowOf(project.id)).toBe(3_500);
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('completed');
    expect(wallet.paid).toHaveLength(1);
    await flows.reconcileRefunds();
    expect(await ledger(project.id, 'refund_completed')).toHaveLength(1);
  });

  it('a lost answer for a payment the wallet never saw is given back only once the invoice can no longer be paid', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'timeout-not-sent';
    await refund(project.id, 2_500);
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('pending');
    // ten-minute invoice: after six minutes a late wallet could still pay it, so the money stays reserved
    await db.withDb((d) => void (d.refunds![0].createdAt = new Date(Date.now() - 6 * 60_000).toISOString()));
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('pending');
    expect(await escrowOf(project.id)).toBe(3_500);
    await db.withDb((d) => void (d.refunds![0].createdAt = new Date(Date.now() - 11 * 60_000).toISOString()));
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('failed');
    expect(await escrowOf(project.id)).toBe(6_000);
  });

  it('a wallet that says "failed" while the payment is on its way keeps the refund reserved (never sent twice)', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'fail-in-flight';
    const r = await refund(project.id, 2_500); // no error: the outcome is not known
    expect(r).toMatchObject({ status: 'pending', uncertain: true });
    expect(await escrowOf(project.id)).toBe(3_500);
    await db.withDb((d) => void (d.refunds![0].createdAt = new Date(Date.now() - 600 * 60_000).toISOString()));
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('pending'); // pending at the wallet: not failed, however old

    const hash = r.lightning!.paymentHash;
    wallet.outgoing.set(hash, { state: 'settled', preimage: wallet.preimageFor(hash)!, feesSats: 1, amountSats: 25_000 });
    await flows.reconcileRefunds();
    expect((await db.readDb()).refunds![0].status).toBe('completed');
    expect(wallet.paid).toHaveLength(1);
  });

  it('a "failed" answer for a refund the wallet shows as settled is a completed refund', async () => {
    const project = await newProject();
    await fund(project.id);
    wallet.payMode = 'fail-but-paid';
    const r = await refund(project.id, 2_500);
    expect(r.status).toBe('completed');
    expect(await ledger(project.id, 'refund_failed')).toHaveLength(0);
    expect(wallet.paid).toHaveLength(1);
  });

  it('money handed back cannot unlock the next step', async () => {
    const project = await newProject();
    await fund(project.id, 6_000);
    await fund(project.id, 6_000); // $120 in escrow: both steps are covered
    await refund(project.id, 6_000); // $60 leave
    expect(await escrowOf(project.id)).toBe(6_000);
    await approved(project); // step 1 paid with the $60 that stayed
    expect((await stepOf(project.id)).status).toBe('paid');
    expect(await escrowOf(project.id)).toBe(0);
    expect((await stepOf(project.id, 1)).status).toBe('upcoming'); // nothing left to cover step 2
    await fund(project.id, 6_000);
    expect((await stepOf(project.id, 1)).status).toBe('active'); // new money does
  });

  it('keeps the ledger chain intact through payments and refunds', async () => {
    const project = await newProject();
    await fund(project.id);
    await approved(project);
    await fund(project.id);
    await refund(project.id, 6_000);
    const { verifyChain, ledgerFor } = await import('@/server/ledger');
    const d = await db.readDb();
    expect(verifyChain(ledgerFor(d, project.id)).ok).toBe(true);
  });

  it('where nothing is real (mock or sandbox) a refund is simulated and says so', async () => {
    vi.stubEnv('LIGHTNING_RAIL', '');
    setWalletsForTests(null);
    const project = await newProject();
    await db.withDb((x) => {
      x.fundings.push({ id: 'f_demo', projectId: project.id, amountCents: 6_000, method: 'lightning', status: 'paid', reference: 'r', mode: 'mock', createdAt: new Date().toISOString() });
    });
    const r = await refund(project.id, 2_000, 'anything@example.com');
    expect(r).toMatchObject({ status: 'completed', rail: 'simulated' });
    expect((await ledger(project.id, 'refund_completed'))[0].data.simulated).toBe(true);
    expect(await escrowOf(project.id)).toBe(4_000);
  });
});
