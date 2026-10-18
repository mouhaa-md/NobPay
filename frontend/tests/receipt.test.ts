import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db, Payout, Project, Step } from '@/lib/types';
import { findReceipt, maskPhone, receiptToken } from '@/server/receipt';

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
beforeEach(() => vi.stubEnv('SESSION_SECRET', STRONG));
afterEach(() => vi.unstubAllEnvs());

const payout = (reference: string): Payout =>
  ({ reference, status: 'completed', amountFcfa: 60000, amountUsdCents: 10000, startedAt: new Date().toISOString(), mode: 'mock', supplier: { name: 'Mamadou', phone: '+221771234567', network: 'wave' } }) as unknown as Payout;

const step = (id: string, p?: Payout): Step => ({ id, index: 1, title: 'Fondations', amountCents: 10000, status: 'paid', proofKinds: ['photo'], payout: p }) as unknown as Step;
const dbWith = (...steps: Step[]): Pick<Db, 'projects'> => ({ projects: [{ id: 'p_1', steps } as unknown as Project] });

describe('supplier receipt token', () => {
  it('only exists once the step has a payout', () => {
    expect(receiptToken(step('s_1'))).toBeNull();
    expect(receiptToken(step('s_1', payout('ref-1')))).toMatch(/^s_1\.[0-9a-f]{32}$/);
  });

  it('finds its own payout and nothing else', () => {
    const s = step('s_1', payout('ref-1'));
    const token = receiptToken(s)!;
    const found = findReceipt(dbWith(s, step('s_2', payout('ref-2'))), token);
    expect(found?.payout.reference).toBe('ref-1');
    expect(found?.step.id).toBe('s_1');
  });

  it('refuses a tampered, truncated, foreign or empty token', () => {
    const s = step('s_1', payout('ref-1'));
    const db = dbWith(s);
    const token = receiptToken(s)!;
    expect(findReceipt(db, token.slice(0, -1) + (token.endsWith('0') ? '1' : '0'))).toBeUndefined();
    expect(findReceipt(db, token.slice(0, -4))).toBeUndefined();
    expect(findReceipt(db, 's_9.' + token.split('.')[1])).toBeUndefined();
    expect(findReceipt(db, 's_1')).toBeUndefined();
    expect(findReceipt(db, '')).toBeUndefined();
    expect(findReceipt(db, '.')).toBeUndefined();
  });

  it('stops working when the payout is retried under a new reference', () => {
    const old = receiptToken(step('s_1', payout('ref-1')))!;
    expect(findReceipt(dbWith(step('s_1', payout('ref-2'))), old)).toBeUndefined();
  });

  it('does not validate under another server secret', () => {
    const s = step('s_1', payout('ref-1'));
    const token = receiptToken(s)!;
    vi.stubEnv('SESSION_SECRET', 'another-long-random-secret-of-more-than-32-chars');
    expect(findReceipt(dbWith(s), token)).toBeUndefined();
  });
});

describe('maskPhone', () => {
  it('hides the middle of the number', () => {
    expect(maskPhone('+221771234567')).toBe('+221 77 ••• •• 67');
    expect(maskPhone('771234567')).toBe('77 ••• •• 67');
    expect(maskPhone('12')).toBe('••••');
    expect(maskPhone('+221771234567')).not.toContain('1234');
  });
});
