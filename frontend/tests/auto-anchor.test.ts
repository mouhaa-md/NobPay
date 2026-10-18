import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ots = vi.hoisted(() => ({ stamp: vi.fn() }));
vi.mock('@/server/ots', async (orig) => ({ ...(await orig<typeof import('@/server/ots')>()), stamp: ots.stamp }));

let anchors: typeof import('@/server/anchors');
let db: typeof import('@/server/db');
let ledger: typeof import('@/server/ledger');
let jobs: typeof import('@/server/jobs');

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-autoanchor-'));
  anchors = await import('@/server/anchors');
  db = await import('@/server/db');
  ledger = await import('@/server/ledger');
  jobs = await import('@/server/jobs');
});
beforeEach(async () => {
  await db.resetDb();
  ots.stamp.mockReset();
  ots.stamp.mockResolvedValue({ ots: Buffer.from('ots-bytes'), calendar: 'https://cal.example' });
  vi.unstubAllEnvs();
});

const count = async (project = 'p_champ') => (await db.readDb()).anchors.filter((a) => a.projectId === project).length;
const addEvent = (type: 'payout_completed' | 'funding_paid' | 'proof_submitted') =>
  db.withDb((d) => void ledger.appendLedger(d, 'p_champ', type, { stepId: 'x' }));

describe('automatic anchoring after money moved', () => {
  it('anchors a project whose last event is a payout or a credit, once per ledger state', async () => {
    await addEvent('payout_completed');
    const before = await count();
    await anchors.autoAnchorProjects();
    expect(await count()).toBe(before + 1);
    await anchors.autoAnchorProjects(); // same state: nothing new
    expect(await count()).toBe(before + 1);
    await addEvent('funding_paid');
    await anchors.autoAnchorProjects(); // the ledger moved on: a new anchor
    expect(await count()).toBe(before + 2);
  });

  it('does not anchor after events that moved no money', async () => {
    await addEvent('proof_submitted');
    const before = await count();
    await anchors.autoAnchorProjects();
    expect(await count()).toBe(before); // p_champ's latest event moved no money
  });

  it('retries a failed anchor at most every 10 minutes', async () => {
    await addEvent('payout_completed');
    ots.stamp.mockRejectedValue(new Error('calendar down'));
    const t0 = Date.now();
    await anchors.autoAnchorProjects(t0);
    const failed = (await db.readDb()).anchors.filter((a) => a.status === 'failed').length;
    expect(failed).toBeGreaterThan(0);
    const calls = ots.stamp.mock.calls.length;
    await anchors.autoAnchorProjects(t0 + 60_000); // too soon
    expect(ots.stamp.mock.calls.length).toBe(calls);
    ots.stamp.mockResolvedValue({ ots: Buffer.from('ok'), calendar: 'https://cal.example' });
    await anchors.autoAnchorProjects(t0 + anchors.AUTO_ANCHOR_RETRY_MS + 1000);
    expect((await db.readDb()).anchors.some((a) => a.projectId === 'p_champ' && a.status === 'pending')).toBe(true);
  });

  it('only runs from the background loop when AUTO_ANCHOR=1', async () => {
    await addEvent('payout_completed');
    const before = await count();
    await jobs.tick();
    expect(await count()).toBe(before); // off by default: no network call by surprise
    vi.stubEnv('AUTO_ANCHOR', '1');
    await jobs.tick();
    expect(await count()).toBeGreaterThan(before);
  });
});
