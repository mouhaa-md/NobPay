import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Funding } from '@/lib/types';

// The database lives in a temp folder; modules are imported after the env is set.
let mods: {
  handle: typeof import('@/server/webhooks').handleBitnobWebhook;
  sign: typeof import('@/server/bitnob/sign').signWebhookBody;
  db: typeof import('@/server/db');
  ledger: typeof import('@/server/ledger');
  services: typeof import('@/server/services');
};

const SECRET = 'whsec_unit_test';
const funding: Funding = {
  id: 'f_test',
  projectId: 'p_new',
  amountCents: 500_000,
  method: 'lightning',
  status: 'pending',
  reference: 'nobpay:fund:f_test',
  mode: 'sandbox',
  createdAt: new Date().toISOString(),
  invoiceId: 'inv_123',
  paymentHash: 'ab'.repeat(32),
  amountSats: 613_000,
};

const event = (id: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    event: 'btc.lightning.received.success',
    event_id: id,
    data: { id: 'inv_123', payment_hash: funding.paymentHash, preimage: 'cd'.repeat(32), ...extra },
  });

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-test-'));
  process.env.BITNOB_MODE = 'sandbox';
  process.env.BITNOB_WEBHOOK_SECRET = SECRET;
  mods = {
    handle: (await import('@/server/webhooks')).handleBitnobWebhook,
    sign: (await import('@/server/bitnob/sign')).signWebhookBody,
    db: await import('@/server/db'),
    ledger: await import('@/server/ledger'),
    services: await import('@/server/services'),
  };
  // a new project with 2 steps, waiting for money
  await mods.db.withDb((db) => {
    db.projects.push({
      id: 'p_new',
      ownerId: 'u_aminata',
      name: 'Test',
      sector: 'commerce',
      city: 'Dakar',
      country: 'SN',
      budgetCents: 800_000,
      coverImage: '/x.jpg',
      managerName: 'M',
      managerToken: 'tok',
      approvalRule: 'owner',
      createdAt: new Date().toISOString(),
      steps: [
        { id: 'p_new_s1', index: 1, title: 'Un', amountCents: 300_000, proofKinds: ['facture'], status: 'upcoming' },
        { id: 'p_new_s2', index: 2, title: 'Deux', amountCents: 500_000, proofKinds: ['facture'], status: 'upcoming' },
      ],
    });
    db.fundings.push({ ...funding });
  });
});

describe('Bitnob webhook receiver', () => {
  it('rejects a forged event: valid JSON but wrong signature (401, nothing credited)', async () => {
    const body = event('evt_forged');
    const res = await mods.handle(body, mods.sign('wrong-secret', body));
    expect(res.status).toBe(401);
    const db = await mods.db.readDb();
    expect(db.fundings.find((f) => f.id === 'f_test')!.status).toBe('pending');
  });

  it('answers 200 and does nothing for an unknown invoice', async () => {
    const body = JSON.stringify({ event: 'btc.lightning.received.success', event_id: 'evt_unknown', data: { id: 'inv_unknown', payment_hash: '00'.repeat(32) } });
    const res = await mods.handle(body, mods.sign(SECRET, body));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('unknown_invoice');
  });

  it('credits the escrow once for a valid signed event and activates the first step', async () => {
    const body = event('evt_ok');
    const res = await mods.handle(body, mods.sign(SECRET, body));
    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe('funding_paid');
    const db = await mods.db.readDb();
    const f = db.fundings.find((x) => x.id === 'f_test')!;
    expect(f.status).toBe('paid');
    expect(f.preimage).toBe('cd'.repeat(32));
    const project = db.projects.find((p) => p.id === 'p_new')!;
    expect(project.steps[0].status).toBe('active'); // 5 000 $ funded >= 3 000 $
    expect(project.steps[1].status).toBe('upcoming'); // only one step at a time
    expect(mods.ledger.verifyChain(mods.ledger.ledgerFor(db, 'p_new')).ok).toBe(true);
    expect(mods.ledger.ledgerFor(db, 'p_new').some((e) => e.type === 'funding_paid')).toBe(true);
  });

  it('ignores a replay of the same event id (no double credit)', async () => {
    const body = event('evt_ok');
    const res = await mods.handle(body, mods.sign(SECRET, body));
    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    const db = await mods.db.readDb();
    expect(mods.ledger.ledgerFor(db, 'p_new').filter((e) => e.type === 'funding_paid')).toHaveLength(1);
  });

  it('is idempotent even if the provider re-sends the paid invoice with a new event id', async () => {
    const body = event('evt_again');
    const res = await mods.handle(body, mods.sign(SECRET, body));
    expect(res.body.outcome).toBe('funding_already_paid');
    const db = await mods.db.readDb();
    expect(db.fundings.find((f) => f.id === 'f_test')!.amountCents).toBe(500_000);
    expect(mods.ledger.ledgerFor(db, 'p_new').filter((e) => e.type === 'funding_paid')).toHaveLength(1);
  });

  it('rejects malformed JSON that is correctly signed', async () => {
    const body = '{not json';
    const res = await mods.handle(body, mods.sign(SECRET, body));
    expect(res.status).toBe(400);
  });
});
