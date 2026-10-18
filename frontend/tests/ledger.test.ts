import { describe, expect, it } from 'vitest';
import type { LedgerEvent } from '@/lib/types';
import { canonicalize } from '@/server/crypto';
import { appendLedger, GENESIS, ledgerFor, verifyChain } from '@/server/ledger';
import { buildSeed } from '@/server/seed';

describe('canonicalize', () => {
  it('sorts keys and drops undefined so hashes are stable', () => {
    expect(canonicalize({ b: 1, a: { d: [3, 2], c: undefined } })).toBe('{"a":{"d":[3,2]},"b":1}');
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }));
  });
});

describe('ledger hash chain', () => {
  const fresh = () => ({ ledger: [] as LedgerEvent[] });

  it('chains events from a genesis hash', () => {
    const db = fresh();
    const a = appendLedger(db, 'p1', 'project_created', { name: 'x' }, '2026-10-01T10:00:00.000Z');
    const b = appendLedger(db, 'p1', 'funding_paid', { amountCents: 100 }, '2026-10-01T11:00:00.000Z');
    expect(a.seq).toBe(1);
    expect(a.prevHash).toBe(GENESIS);
    expect(b.prevHash).toBe(a.hash);
    expect(verifyChain(ledgerFor(db, 'p1')).ok).toBe(true);
  });

  it('keeps projects independent', () => {
    const db = fresh();
    appendLedger(db, 'p1', 'project_created', {});
    appendLedger(db, 'p2', 'project_created', {});
    expect(ledgerFor(db, 'p1')).toHaveLength(1);
    expect(ledgerFor(db, 'p2')[0].prevHash).toBe(GENESIS);
  });

  it('detects any edit of a past event', () => {
    const db = fresh();
    appendLedger(db, 'p1', 'project_created', { budgetCents: 100 });
    appendLedger(db, 'p1', 'funding_paid', { amountCents: 50 });
    appendLedger(db, 'p1', 'step_approved', { stepId: 's1' });
    const events = structuredClone(ledgerFor(db, 'p1'));
    events[1].data = { amountCents: 5000 }; // someone inflates a payment
    const check = verifyChain(events);
    expect(check.ok).toBe(false);
    expect(check.brokenAt).toBe(2);
  });

  it('detects a removed or reordered event', () => {
    const db = fresh();
    for (let i = 0; i < 4; i++) appendLedger(db, 'p1', 'funding_paid', { i });
    const events = ledgerFor(db, 'p1');
    expect(verifyChain([events[0], events[2], events[3]]).ok).toBe(false);
    expect(verifyChain([events[1], events[0], events[2], events[3]]).ok).toBe(false);
  });
});

describe('demo data', () => {
  const db = buildSeed(Date.UTC(2026, 9, 17, 12));

  it('has three consistent projects with valid ledgers', () => {
    expect(db.projects.map((p) => p.name)).toEqual(['Résidence à Thiès', 'Pépinière à Kaolack', 'Import de stock à Dakar']);
    for (const p of db.projects) {
      expect(verifyChain(ledgerFor(db, p.id)).ok).toBe(true);
      expect(p.steps.reduce((s, x) => s + x.amountCents, 0)).toBe(p.budgetCents);
    }
  });

  it('matches the documented figures (COPY-RULES.md)', () => {
    const funded = (id: string) => db.fundings.filter((f) => f.projectId === id && f.status === 'paid').reduce((s, f) => s + f.amountCents, 0);
    const released = (id: string) =>
      db.projects.find((p) => p.id === id)!.steps.filter((s) => s.status === 'paid').reduce((s, x) => s + x.amountCents, 0);
    expect(funded('p_villa')).toBe(2_400_000);
    expect(released('p_villa')).toBe(600_000);
    expect(released('p_champ')).toBe(540_000);
    expect(released('p_boutique')).toBe(100_000);
  });
});
