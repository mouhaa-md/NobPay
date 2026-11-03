import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { escrowCents, type Project, type User } from '@/lib/types';

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }) }));

let edit: typeof import('@/server/projectEdit');
let services: typeof import('@/server/services');
let ledger: typeof import('@/server/ledger');
let contribution: typeof import('@/server/contribution');
let db: typeof import('@/server/db');

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
const owner: User = { id: 'u_edit', firstName: 'Invité', lastName: 'E', country: 'FR', phone: '', createdAt: new Date().toISOString(), guest: true };

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-edit-'));
  edit = await import('@/server/projectEdit');
  services = await import('@/server/services');
  ledger = await import('@/server/ledger');
  contribution = await import('@/server/contribution');
  db = await import('@/server/db');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', STRONG);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('RATE_LIMIT', '0');
  await db.resetDb();
  await db.withDb((d) => void d.users.push({ ...owner }));
});
afterEach(() => vi.unstubAllEnvs());

const create = (amounts: number[]) =>
  services.createProject(owner, {
    name: 'Plan',
    sector: 'commerce',
    city: 'Dakar',
    budgetCents: amounts.reduce((a, b) => a + b, 0) * 100,
    managerName: 'Moussa',
    steps: amounts.map((d, i) => ({ title: `Étape ${i + 1}`, amountCents: d * 100, proofKinds: ['photos'] as ['photos'] })),
  });
const get = async (id: string): Promise<Project> => (await db.readDb()).projects.find((p) => p.id === id)!;
const fund = async (projectId: string, dollars: number) => {
  const f = await services.createFunding(owner, projectId, { amountCents: dollars * 100, method: 'lightning' });
  await services.simulateFundingPaid(owner, f.id);
};
const plan = (p: Project) => p.steps.map((s) => ({ id: s.id, title: s.title, amountCents: s.amountCents }));

describe('reshaping the steps still to come', () => {
  it('edits, removes and adds upcoming steps; the budget follows; what the money touched stays', async () => {
    const p = await create([30, 30, 30]);
    await fund(p.id, 30); // step 1 opens (active): its money is committed
    const now = await get(p.id);
    expect(now.steps.map((s) => s.status)).toEqual(['active', 'upcoming', 'upcoming']);

    const updated = await edit.updateProject(owner, p.id, [
      { id: now.steps[1].id, title: 'Murs (devis revu)', amountCents: 4_000 }, // dearer
      { title: 'Finitions', amountCents: 2_000 }, // new
    ]); // the third step is dropped
    expect(updated.steps.map((s) => [s.index, s.title, s.amountCents, s.status])).toEqual([
      [1, 'Étape 1', 3_000, 'active'],
      [2, 'Murs (devis revu)', 4_000, 'upcoming'],
      [3, 'Finitions', 2_000, 'upcoming'],
    ]);
    expect(updated.budgetCents).toBe(9_000);
    expect(updated.steps[1].id).toBe(now.steps[1].id); // the same step keeps its identity
    expect(updated.steps[2].id).toBe(`${p.id}_s4`); // a new one gets an id nobody had
    expect(updated.steps[2].proofKinds).toEqual(['photos', 'facture']);
    expect(updated.steps[1].proofKinds).toEqual(['photos']); // an edited step keeps what it asked for
  });

  it('writes the change in the ledger, and the chain stays whole', async () => {
    const p = await create([30, 30]);
    await edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'Achat', amountCents: 5_000 }, { id: p.steps[1].id, title: 'Livraison', amountCents: 3_000 }]);
    const events = ledger.ledgerFor(await db.readDb(), p.id);
    const last = events[events.length - 1];
    expect(last.type).toBe('project_updated');
    expect(last.data).toMatchObject({ previousBudgetCents: 6_000, budgetCents: 8_000 });
    expect(last.data.steps).toEqual([
      { index: 1, title: 'Achat', amountCents: 5_000 },
      { index: 2, title: 'Livraison', amountCents: 3_000 },
    ]);
    expect(ledger.verifyChain(events).ok).toBe(true);
  });

  it('a step that is now covered by the escrow opens at once', async () => {
    const p = await create([50, 50]);
    await fund(p.id, 30);
    expect((await get(p.id)).steps[0].status).toBe('upcoming'); // 30 $ do not cover 50 $
    await edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'Étape 1', amountCents: 3_000 }, { id: p.steps[1].id, title: 'Étape 2', amountCents: 5_000 }]);
    expect((await get(p.id)).steps[0].status).toBe('active');
  });

  it('refuses a step the money has touched, an unknown one, a repeated one, and what makes no sense', async () => {
    const p = await create([30, 30]);
    await fund(p.id, 30);
    const [first, second] = (await get(p.id)).steps;
    await expect(edit.updateProject(owner, p.id, [{ id: first.id, title: 'x', amountCents: 3_000 }, { id: second.id, title: 'y', amountCents: 3_000 }])).rejects.toMatchObject({ status: 409, code: 'step_locked' });
    await expect(edit.updateProject(owner, p.id, [{ id: 'p_nope_s9', title: 'x', amountCents: 3_000 }])).rejects.toMatchObject({ status: 409, code: 'step_locked' });
    await expect(edit.updateProject(owner, p.id, [{ id: second.id, title: 'x', amountCents: 3_000 }, { id: second.id, title: 'y', amountCents: 3_000 }])).rejects.toMatchObject({ status: 400 });
    await expect(edit.updateProject(owner, p.id, [{ title: '   ', amountCents: 3_000 }])).rejects.toMatchObject({ status: 400 });
    await expect(edit.updateProject(owner, p.id, [{ title: 'x', amountCents: 50 }])).rejects.toMatchObject({ status: 400 });
    await expect(edit.updateProject(owner, p.id, [{ title: 'x', amountCents: 10.5 }])).rejects.toMatchObject({ status: 400 });
    await expect(edit.updateProject(owner, p.id, Array.from({ length: 12 }, (_, i) => ({ title: `s${i}`, amountCents: 100 })))).rejects.toMatchObject({ status: 400 }); // 1 fixed + 12 > 12
    expect((await get(p.id)).steps).toHaveLength(2); // nothing was half done
    expect(ledger.ledgerFor(await db.readDb(), p.id).some((e) => e.type === 'project_updated')).toBe(false);
  });

  it('keeps the budget above the minimum and under the pilot ceilings of a real-bitcoin instance', async () => {
    const p = await create([30, 30]);
    await expect(edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'a', amountCents: 100 }, { id: p.steps[1].id, title: 'b', amountCents: 100 }])).rejects.toMatchObject({ status: 400 }); // 2 $ in all
    vi.stubEnv('LIGHTNING_RAIL', 'nwc');
    vi.stubEnv('LIGHTNING_MAX_PAYOUT_USD', '50');
    vi.stubEnv('LIGHTNING_MAX_ESCROW_USD', '120');
    await expect(edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'a', amountCents: 6_000 }, { id: p.steps[1].id, title: 'b', amountCents: 3_000 }])).rejects.toMatchObject({ status: 400, code: 'pilot_cap' });
    await expect(edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'a', amountCents: 5_000 }, { id: p.steps[1].id, title: 'b', amountCents: 5_000 }, { title: 'c', amountCents: 5_000 }])).rejects.toMatchObject({ code: 'pilot_cap' }); // 150 $ > 120 $
    await expect(edit.updateProject(owner, p.id, [{ id: p.steps[0].id, title: 'a', amountCents: 5_000 }, { id: p.steps[1].id, title: 'b', amountCents: 5_000 }])).resolves.toBeTruthy();
  });

  it('is for the funder of the project only', async () => {
    const p = await create([30, 30]);
    const stranger: User = { ...owner, id: 'u_stranger', guest: undefined };
    await expect(edit.updateProject(stranger, p.id, [{ title: 'x', amountCents: 3_000 }])).rejects.toMatchObject({ status: 404 });
    await expect(edit.closeProject(stranger, p.id)).rejects.toMatchObject({ status: 404 });
  });
});

describe('closing the project', () => {
  it('stops funds, proofs, changes and the family link, keeps the escrow left for the funder, and says so in the ledger', async () => {
    const p = await create([30, 30]);
    await fund(p.id, 30);
    await contribution.enableContribution(owner, p.id);
    const before = escrowCents(await db.readDb(), await get(p.id));

    const closed = await edit.closeProject(owner, p.id);
    expect(closed.closedAt).toBeTruthy();
    expect(closed.contribution).toBeUndefined(); // the family link stops with the project
    const events = ledger.ledgerFor(await db.readDb(), p.id);
    expect(events[events.length - 1]).toMatchObject({ type: 'project_closed', data: { escrowLeftCents: before, paidSteps: 0, steps: 2 } });
    expect(ledger.verifyChain(events).ok).toBe(true);

    await expect(services.createFunding(owner, p.id, { amountCents: 1_000, method: 'lightning' })).rejects.toMatchObject({ status: 409, code: 'project_closed' });
    await expect(contribution.enableContribution(owner, p.id)).rejects.toMatchObject({ code: 'project_closed' });
    await expect(edit.updateProject(owner, p.id, [{ title: 'x', amountCents: 3_000 }])).rejects.toMatchObject({ code: 'project_closed' });
    await expect(edit.closeProject(owner, p.id)).rejects.toMatchObject({ code: 'project_closed' });
    // the field team can no longer send a proof for the step that was open
    const activeStep = (await get(p.id)).steps[0];
    await expect(services.assertCanSubmitProof({ kind: 'owner', user: owner }, p.id, activeStep.id)).rejects.toMatchObject({ status: 409, code: 'project_closed' });
    expect(escrowCents(await db.readDb(), await get(p.id))).toBe(before); // the money is where it was
  });

  it('what is left in escrow can still be taken back', async () => {
    const p = await create([30, 30]);
    await fund(p.id, 30);
    await edit.closeProject(owner, p.id);
    const { requestRefund } = await import('@/server/lightningFlows');
    const refund = await requestRefund(owner, p.id, { amountCents: 3_000, address: 'moi@wallet.example' });
    expect(refund).toMatchObject({ status: 'completed', rail: 'simulated' });
    expect(escrowCents(await db.readDb(), await get(p.id))).toBe(0);
  });

  it('a closed project opens nothing more, whatever money arrives', async () => {
    const p = await create([30, 30]);
    const f = await services.createFunding(owner, p.id, { amountCents: 3_000, method: 'lightning' }); // an invoice made before closing
    await edit.closeProject(owner, p.id);
    await services.simulateFundingPaid(owner, f.id); // ... and paid after
    const after = await get(p.id);
    expect(after.steps.map((s) => s.status)).toEqual(['upcoming', 'upcoming']); // nothing opened
    expect(escrowCents(await db.readDb(), after)).toBe(3_000); // but the money is the funder's, and refundable
  });

  it('waits for a decision that is pending: a proof being judged or a payment on its way', async () => {
    const p = await create([30, 30]);
    await fund(p.id, 30);
    await db.withDb((d) => void (d.projects.find((x) => x.id === p.id)!.steps[0].status = 'proof_submitted'));
    await expect(edit.closeProject(owner, p.id)).rejects.toMatchObject({ status: 409, code: 'decision_pending' });
    await db.withDb((d) => void (d.projects.find((x) => x.id === p.id)!.steps[0].status = 'releasing'));
    await expect(edit.closeProject(owner, p.id)).rejects.toMatchObject({ code: 'decision_pending' });
    expect((await get(p.id)).closedAt).toBeUndefined();
  });
});
