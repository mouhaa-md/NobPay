import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Funding } from '@/lib/types';

let mods: {
  handle: typeof import('@/server/webhooks').handleBitnobWebhook;
  amountMatches: typeof import('@/server/webhooks').amountMatches;
  sign: typeof import('@/server/bitnob/sign').signWebhookBody;
  db: typeof import('@/server/db');
};

const SECRET = 'whsec_hardening_test';
const SATS = 613_000;

const funding = (id: string): Funding => ({
  id,
  projectId: 'p_h',
  amountCents: 500_000,
  method: 'lightning',
  status: 'pending',
  reference: `nobpay:fund:${id}`,
  mode: 'sandbox',
  createdAt: new Date().toISOString(),
  invoiceId: `inv_${id}`,
  paymentHash: id.padEnd(64, 'a'),
  amountSats: SATS,
});

const event = (eventId: string, fundingId: string, data: Record<string, unknown> = {}) =>
  JSON.stringify({ event: 'btc.lightning.received.success', event_id: eventId, data: { id: `inv_${fundingId}`, ...data } });

const send = (body: string) => mods.handle(body, mods.sign(SECRET, body));
const statusOf = async (id: string) => (await mods.db.readDb()).fundings.find((f) => f.id === id)!.status;
const addFunding = (id: string) => mods.db.withDb((db) => void db.fundings.push(funding(id)));

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-hardening-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  const webhooks = await import('@/server/webhooks');
  mods = {
    handle: webhooks.handleBitnobWebhook,
    amountMatches: webhooks.amountMatches,
    sign: (await import('@/server/bitnob/sign')).signWebhookBody,
    db: await import('@/server/db'),
  };
  await mods.db.withDb((db) => {
    db.projects.push({
      id: 'p_h',
      ownerId: 'u_aminata',
      name: 'Hardening',
      sector: 'commerce',
      city: 'Dakar',
      country: 'SN',
      budgetCents: 500_000,
      coverImage: '/x.jpg',
      managerName: 'M',
      managerToken: 'tok_h',
      approvalRule: 'owner',
      createdAt: new Date().toISOString(),
      steps: [{ id: 'p_h_s1', index: 1, title: 'Un', amountCents: 300_000, proofKinds: ['facture'], status: 'upcoming' }],
    });
  });
});

describe('an event is only "seen" once it was applied', () => {
  it('processes again an event that first found no invoice (re-sent from the dashboard)', async () => {
    const body = event('evt_late', 'late');
    const first = await send(body);
    expect(first.body.outcome).toBe('unknown_invoice');

    await addFunding('late'); // the invoice becomes known afterwards
    const second = await send(body);
    expect(second.body.duplicate).toBeUndefined();
    expect(second.body.outcome).toBe('funding_paid');
    expect(await statusOf('late')).toBe('paid');

    const db = await mods.db.readDb();
    expect(db.webhooks.filter((w) => w.eventId === 'evt_late')).toHaveLength(1); // updated, not duplicated

    const third = await send(body);
    expect(third.body.duplicate).toBe(true); // now it really is a replay
  });

  it('still never credits twice for the same funding', async () => {
    const res = await send(event('evt_late_bis', 'late'));
    expect(res.body.outcome).toBe('funding_already_paid');
    const db = await mods.db.readDb();
    expect(db.ledger.filter((e) => e.projectId === 'p_h' && e.type === 'funding_paid')).toHaveLength(1);
  });
});

describe('amount received must match the invoice', () => {
  it('refuses an under-payment: no credit, reason logged', async () => {
    await addFunding('under');
    const res = await send(event('evt_under', 'under', { amount: 600_000 }));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('amount_mismatch');
    expect(await statusOf('under')).toBe('pending');
    const rec = (await mods.db.readDb()).webhooks.find((w) => w.eventId === 'evt_under')!;
    expect(rec.note).toContain('613000');
  });

  it('refuses an over-payment', async () => {
    await addFunding('over');
    const res = await send(event('evt_over', 'over', { amount: 700_000 }));
    expect(res.body.outcome).toBe('amount_mismatch');
    expect(await statusOf('over')).toBe('pending');
  });

  it('credits when a corrected event for the same id carries the right amount', async () => {
    const res = await send(event('evt_under', 'under', { amount: SATS }));
    expect(res.body.outcome).toBe('funding_paid');
    expect(await statusOf('under')).toBe('paid');
  });

  it('accepts the right amount whatever the unit (sats, millisats, BTC) and ignores unrelated amounts such as fees', async () => {
    for (const [id, data] of [
      ['u_sats', { amount: SATS, fee: { amount: 12 } }],
      ['u_msat', { amount_msat: SATS * 1000 }],
      ['u_btc', { amount: 0.00613 }],
    ] as const) {
      await addFunding(id);
      const res = await send(event(`evt_${id}`, id, data));
      expect(res.body.outcome, id).toBe('funding_paid');
    }
  });

  it('does not refuse a signed payment that carries no readable amount', async () => {
    await addFunding('noamount');
    const res = await send(event('evt_noamount', 'noamount'));
    expect(res.body.outcome).toBe('funding_paid');
  });

  it('keeps a small tolerance and nothing more', () => {
    expect(mods.amountMatches(SATS, SATS)).toBe(true);
    expect(mods.amountMatches(SATS + 3000, SATS)).toBe(true); // 0.49 %
    expect(mods.amountMatches(SATS + 4000, SATS)).toBe(false); // 0.65 %
    expect(mods.amountMatches(5, 5)).toBe(true);
    expect(mods.amountMatches(7, 5)).toBe(false);
  });
});
