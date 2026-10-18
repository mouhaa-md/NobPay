import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '@/lib/types';
import { adminOverview, isAdmin } from '@/server/admin';

beforeEach(() => {
  vi.stubEnv('SESSION_SECRET', 'a-long-random-secret-of-more-than-32-characters');
  vi.stubEnv('BITNOB_MODE', 'sandbox');
  vi.stubEnv('BITNOB_WEBHOOK_SECRET', 'whsec_x');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('ADMIN_PHONES', '');
});
afterEach(() => vi.unstubAllEnvs());

describe('isAdmin', () => {
  it('is nobody by default, signed out or signed in', () => {
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin({ phone: '+221771234567', demo: false })).toBe(false);
  });

  it('accepts the numbers listed in ADMIN_PHONES, whatever their spacing', () => {
    vi.stubEnv('ADMIN_PHONES', '+221 77 123 45 67, +33611223344');
    expect(isAdmin({ phone: '+221771234567', demo: false })).toBe(true);
    expect(isAdmin({ phone: '+33611223344', demo: false })).toBe(true);
    expect(isAdmin({ phone: '+221770000000', demo: false })).toBe(false);
  });

  it('opens to the demo account only where demo is allowed', () => {
    expect(isAdmin({ phone: '+33600000000', demo: true })).toBe(false); // sandbox without ALLOW_DEMO
    vi.stubEnv('ALLOW_DEMO', '1');
    expect(isAdmin({ phone: '+33600000000', demo: true })).toBe(true);
    expect(isAdmin({ phone: '+33600000000', demo: false })).toBe(false);
  });
});

const NOW = Date.parse('2026-06-01T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;

const po = (over: Record<string, unknown>) => ({ reference: 'ref', status: 'completed', amountFcfa: 60000, amountUsdCents: 10000, startedAt: ago(HOUR), mode: 'mock', supplier: { name: 'Mamadou', phone: '+221771234567', network: 'wave' }, ...over });

function db(parts: Partial<Record<keyof Db, unknown>>): Db {
  return { users: [{ id: 'u1' }], projects: [], fundings: [], anchors: [], webhooks: [], ...parts } as unknown as Db;
}
const project = (steps: unknown[]) => ({ id: 'p1', name: 'Villa', steps });

describe('adminOverview', () => {
  it('is quiet when everything is fine', () => {
    const o = adminOverview(db({ projects: [project([{ id: 's1', title: 'A', payout: po({ status: 'completed' }) }])] }), NOW);
    expect(o.alerts).toEqual([]);
    expect(o.counts.payouts.completed).toBe(1);
    expect(o.payouts[0].phone).not.toContain('1234');
  });

  it('flags a payout stuck for more than 5 minutes, an uncertain one and a failed one', () => {
    const steps = [
      { id: 's1', title: 'Stuck', payout: po({ reference: 'a', status: 'pending', startedAt: ago(10 * MIN) }) },
      { id: 's2', title: 'Fresh', payout: po({ reference: 'b', status: 'pending', startedAt: ago(MIN) }) },
      { id: 's3', title: 'Unsure', payout: po({ reference: 'c', status: 'pending', startedAt: ago(MIN), uncertain: true }) },
      { id: 's4', title: 'Refused', payout: po({ reference: 'd', status: 'failed', error: 'insufficient' }) },
    ];
    const o = adminOverview(db({ projects: [project(steps)] }), NOW);
    const text = o.alerts.map((a) => a.text).join('\n');
    expect(text).toContain('Stuck');
    expect(text).not.toContain('Fresh');
    expect(text).toContain('Unsure');
    expect(text).toContain('Refused');
    expect(o.alerts[0].level).toBe('error'); // the uncertain one comes first
  });

  it('flags an abandoned conversion, an uncredited funding and a slow anchor', () => {
    const o = adminOverview(
      db({
        projects: [project([])],
        fundings: [
          { projectId: 'p1', status: 'paid', amountCents: 500, method: 'lightning', mode: 'sandbox', createdAt: ago(HOUR), conversion: { status: 'failed', retryable: false, detail: 'no liquidity' } },
          { projectId: 'p1', status: 'failed', amountCents: 500, method: 'lightning', mode: 'sandbox', createdAt: ago(HOUR), note: 'amount mismatch' },
          { projectId: 'p1', status: 'paid', amountCents: 500, method: 'lightning', mode: 'sandbox', createdAt: ago(HOUR), conversion: { status: 'failed', retryable: true } },
        ],
        anchors: [
          { id: 'a1', projectId: 'p1', status: 'pending', submittedAt: ago(30 * HOUR), upToSeq: 3 },
          { id: 'a2', projectId: 'p1', status: 'pending', submittedAt: ago(2 * HOUR), upToSeq: 2 },
        ],
      }),
      NOW,
    );
    const text = o.alerts.map((a) => a.text).join('\n');
    expect(text).toContain('no liquidity');
    expect(text).toContain('amount mismatch');
    expect(text).toContain('24 h');
    expect(o.alerts).toHaveLength(3); // the retryable conversion and the 2 h anchor are not alarms
    expect(o.counts.fundings.paid).toBe(2);
    expect(o.counts.anchors.pending).toBe(2);
  });

  it('flags recent Bitnob events that were not applied, and lists the latest 25 first', () => {
    const webhooks = Array.from({ length: 30 }, (_, i) => ({ eventId: `e${i}`, type: 'payout.completed', at: ago(i * MIN), outcome: i === 3 ? 'amount_mismatch' : 'applied' }));
    const o = adminOverview(db({ webhooks }), NOW);
    expect(o.webhooks).toHaveLength(25);
    expect(o.webhooks[0].eventId).toBe('e0');
    expect(o.counts.webhooks).toBe(30);
    expect(o.alerts.some((a) => a.text.includes('1 évènement'))).toBe(true);
  });
});
