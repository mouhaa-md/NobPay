import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { escrowCents, type User } from '@/lib/types';

let contribution: typeof import('@/server/contribution');
let ledger: typeof import('@/server/ledger');
let db: typeof import('@/server/db');

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
const PROJECT = 'p_champ'; // a demonstration project of the demonstration funder
let owner: User;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-contrib-'));
  contribution = await import('@/server/contribution');
  ledger = await import('@/server/ledger');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', STRONG);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('RATE_LIMIT', '0');
  await db.resetDb();
  owner = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
});
afterEach(() => vi.unstubAllEnvs());

const project = async () => (await db.readDb()).projects.find((p) => p.id === PROJECT)!;
const escrow = async () => {
  const d = await db.readDb();
  return escrowCents(d, d.projects.find((p) => p.id === PROJECT)!);
};
const open = async (renew = false) => (await contribution.enableContribution(owner, PROJECT, { renew })).token;

describe('the family link', () => {
  it('is signed, opens its own project only, lasts 90 days, and is not one of the other links', async () => {
    const token = await open();
    const p = await project();
    expect(contribution.contributionTokenMatches(p, token)).toBe(true);
    expect(contribution.findProjectByContributionToken(await db.readDb(), token)?.id).toBe(PROJECT);
    expect(Date.parse(p.contribution!.expiresAt) - Date.now()).toBeGreaterThan(89 * 86_400_000);

    const [id, v, exp, mac] = token.split('.');
    for (const bad of [`${id}.${v}.${Number(exp) + 9}.${mac}`, `${id}.${v}.${exp}.${mac.slice(0, -1)}${mac.endsWith('a') ? 'b' : 'a'}`, `p_other.${v}.${exp}.${mac}`, `${id}.9.${exp}.${mac}`, '', 'x']) {
      expect(contribution.contributionTokenMatches(p, bad), bad).toBe(false);
    }
    expect(contribution.contributionTokenMatches(p, token, Date.now() + 91 * 86_400_000)).toBe(false);
    const { managerLinkToken } = await import('@/server/managerToken');
    const { witnessLinkToken, inviteWitness } = await import('@/server/witness');
    await inviteWitness(owner, PROJECT, { name: 'Ibrahima', required: false });
    const withWitness = await project();
    expect(contribution.contributionTokenMatches(withWitness, managerLinkToken(withWitness))).toBe(false);
    expect(contribution.contributionTokenMatches(withWitness, witnessLinkToken(withWitness)!)).toBe(false);
  });

  it('is opened and renewed by the funder of the project only; renewing, closing or running out kills the old link', async () => {
    const first = await open();
    expect(await open()).toBe(first); // opening again keeps the link already sent
    const stranger: User = { ...owner, id: 'u_stranger', demo: undefined };
    await expect(contribution.enableContribution(stranger, PROJECT)).rejects.toMatchObject({ status: 404 });
    await expect(contribution.disableContribution(stranger, PROJECT)).rejects.toMatchObject({ status: 404 });
    const renewed = await open(true);
    expect(renewed).not.toBe(first);
    await expect(contribution.createContribution(first, { amountCents: 1_000 })).rejects.toMatchObject({ status: 404, code: 'bad_contribution_link' });
    await contribution.disableContribution(owner, PROJECT);
    await expect(contribution.createContribution(renewed, { amountCents: 1_000 })).rejects.toMatchObject({ code: 'bad_contribution_link' });
  });
});

describe('adding to the escrow with the link', () => {
  it('makes an invoice for the project, credits the escrow once it is paid, and writes the first name next to the amount in the ledger', async () => {
    const token = await open();
    const before = await escrow();
    const invoice = await contribution.createContribution(token, { amountCents: 2_500, name: '  <b>Awa</b>  ' });
    expect(invoice).toMatchObject({ status: 'pending', amountCents: 2_500, mode: 'mock' });
    expect(invoice.bolt11).toBeTruthy();
    expect(await escrow()).toBe(before); // nothing is credited before the payment

    expect((await contribution.contributionStatus(token, invoice.id)).status).toBe('pending');
    expect((await contribution.simulateContribution(token, invoice.id)).status).toBe('paid');
    expect(await escrow()).toBe(before + 2_500);

    const d = await db.readDb();
    const paid = ledger.ledgerFor(d, PROJECT).filter((e) => e.type === 'funding_paid').pop()!;
    expect(paid.data).toMatchObject({ amountCents: 2_500, contributor: 'bAwa/b' });
    expect(ledger.verifyChain(ledger.ledgerFor(d, PROJECT)).ok).toBe(true);
    expect(contribution.contributionsOf(d, PROJECT)).toEqual([{ id: invoice.id, name: 'bAwa/b', amountCents: 2_500, at: expect.any(String) }]);
  });

  it('a contribution without a name leaves no name in the ledger', async () => {
    const token = await open();
    const invoice = await contribution.createContribution(token, { amountCents: 1_000 });
    await contribution.simulateContribution(token, invoice.id);
    const paid = ledger.ledgerFor(await db.readDb(), PROJECT).filter((e) => e.type === 'funding_paid').pop()!;
    expect(paid.data).not.toHaveProperty('contributor');
  });

  it('refuses less than five dollars, and only a few invoices at a time wait for one project', async () => {
    const token = await open();
    await expect(contribution.createContribution(token, { amountCents: 499 })).rejects.toMatchObject({ status: 400 });
    for (let i = 0; i < contribution.MAX_PENDING_CONTRIBUTIONS; i++) await contribution.createContribution(token, { amountCents: 1_000 });
    await expect(contribution.createContribution(token, { amountCents: 1_000 })).rejects.toMatchObject({ status: 429, code: 'too_many_pending' });
  });

  it('the link reads the invoices made through it, and nothing else of the project', async () => {
    const token = await open();
    const invoice = await contribution.createContribution(token, { amountCents: 1_000 });
    // an invoice the funder made on their own screen is not readable with the family link
    const { createFunding } = await import('@/server/services');
    const own = await createFunding(owner, PROJECT, { amountCents: 1_000, method: 'lightning' });
    await expect(contribution.contributionStatus(token, own.id)).rejects.toMatchObject({ status: 404 });
    await expect(contribution.simulateContribution(token, own.id)).rejects.toMatchObject({ status: 404 });
    // another project's link does not read this project's invoices either
    const other = (await contribution.enableContribution(owner, 'p_villa')).token;
    await expect(contribution.contributionStatus(other, invoice.id)).rejects.toMatchObject({ status: 404 });
    expect(Object.keys(await contribution.contributionStatus(token, invoice.id)).sort()).toEqual(['amountCents', 'amountSats', 'bolt11', 'expiresAt', 'id', 'mode', 'status']);
  });

  it('the public page shows the project\'s face and its funding level, never the money held or the proofs', async () => {
    await open();
    const d = await db.readDb();
    const view = contribution.publicContributionView(d, await project());
    expect(Object.keys(view).sort()).toEqual(['budgetCents', 'city', 'cover', 'name', 'ownerFirstName', 'paidSteps', 'percent', 'sector', 'steps']);
    expect(JSON.stringify(view)).not.toMatch(/escrow|supplier|phone|payout/i);
  });

  it('simulating is a demonstration feature: refused where the demonstration is switched off', async () => {
    const token = await open();
    const invoice = await contribution.createContribution(token, { amountCents: 1_000 });
    vi.stubEnv('ALLOW_DEMO', '0');
    await expect(contribution.simulateContribution(token, invoice.id)).rejects.toMatchObject({ status: 403, code: 'demo_disabled' });
  });
});
