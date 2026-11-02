import { describe, expect, it } from 'vitest';
import type { Project, Proof, ProofPhoto, Step, StoredFile } from '@/lib/types';
import { proofChecks } from '@/server/proofChecks';

const SUBMITTED = Date.parse('2026-11-02T12:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();
const sha = (s: string) => s.padEnd(64, '0');

const file = (s: string, over: Partial<StoredFile> = {}): StoredFile => ({ id: `fl_${s}`, name: `${s}.jpg`, mime: 'image/jpeg', size: 10, sha256: sha(s), ...over });
const photo = (s: string, over: Partial<ProofPhoto> = {}): ProofPhoto => ({ ...file(s), takenAt: iso(SUBMITTED - 5 * 60_000), gps: { lat: 14.79, lng: -16.93 }, ...over });
const proof = (over: Partial<Proof> = {}): Proof => ({ photos: [photo('a')], submittedAt: iso(SUBMITTED), submittedBy: 'manager', ...over });
const step = (id: string, index: number, p?: Proof, over: Partial<Step> = {}): Step => ({ id, index, title: `Étape ${index}`, amountCents: 10_000, proofKinds: ['photos'], status: 'proof_submitted', proof: p, ...over });
const project = (id: string, steps: Step[], over: Partial<Project> = {}): Project =>
  ({ id, ownerId: 'u', name: id, sector: 'commerce', city: 'Thiès', country: 'SN', budgetCents: 100_000, coverImage: '', managerName: 'M', managerTokenVersion: 1, managerTokenExpiresAt: '', approvalRule: 'owner', steps, createdAt: '' }) as Project;

/** Checks of the first step of `p`, with the other projects of the database. */
const run = (p: Project, others: Project[] = [], usdXof = 600) => proofChecks({ db: { projects: [p, ...others] }, project: p, step: p.steps[0], usdXof });
const byId = (checks: ReturnType<typeof run>, id: string) => checks.find((c) => c.id === id);

describe('files already used', () => {
  it('says so when nothing was reused', () => {
    expect(byId(run(project('p1', [step('s1', 1, proof())])), 'duplicate')).toMatchObject({ level: 'ok' });
  });

  it('flags the same file sent twice in one proof', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a'), photo('a')] }))]);
    expect(byId(run(p), 'duplicate-here')).toMatchObject({ level: 'attention', text: expect.stringContaining('plusieurs fois') });
  });

  it('flags a photo used for another step of the same project, naming the step', () => {
    const p = project('p1', [step('s1', 1, proof()), step('s2', 2, proof({ photos: [photo('a')] }), { status: 'paid' })]);
    expect(byId(run(p), 'duplicate-elsewhere')).toMatchObject({ level: 'attention', text: expect.stringContaining('l’étape 2 de ce projet') });
  });

  it('flags a file used in another project without saying which', () => {
    const other = project('p2', [step('s9', 1, proof({ photos: [photo('x'), photo('a')] }), { status: 'paid' })]);
    const c = byId(run(project('p1', [step('s1', 1, proof())]), [other]), 'duplicate-elsewhere')!;
    expect(c.level).toBe('attention');
    expect(c.text).toContain('un autre projet');
    expect(c.text).not.toContain('p2');
  });

  it('also catches a reused invoice', () => {
    const inv = file('inv', { mime: 'application/pdf' });
    const p = project('p1', [step('s1', 1, proof({ invoice: inv })), step('s2', 2, proof({ invoice: inv }), { status: 'paid' })]);
    expect(byId(run(p), 'duplicate-elsewhere')).toBeDefined();
  });

  it('ignores the images bundled with the demonstration data, which are shared on purpose', () => {
    const demo = photo('d', { publicPath: '/demo/chantier.jpg' });
    const p = project('p1', [step('s1', 1, proof({ photos: [demo, demo] })), step('s2', 2, proof({ photos: [demo] }), { status: 'paid' })]);
    const checks = run(p);
    expect(byId(checks, 'duplicate-here')).toBeUndefined();
    expect(byId(checks, 'duplicate-elsewhere')).toBeUndefined();
    expect(byId(checks, 'duplicate')).toBeUndefined();
  });

  it('does not count the step itself', () => {
    const p = project('p1', [step('s1', 1, proof())]);
    expect(byId(run(p), 'duplicate-elsewhere')).toBeUndefined();
  });
});

describe('where the photos were taken', () => {
  it('ok when all are located in Senegal', () => {
    expect(byId(run(project('p1', [step('s1', 1, proof())])), 'gps')).toMatchObject({ level: 'ok' });
  });
  it('attention when none is located', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a', { gps: undefined })] }))]);
    expect(byId(run(p), 'gps')).toMatchObject({ level: 'attention' });
  });
  it('info when only some are located', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a'), photo('b', { gps: undefined })] }))]);
    expect(byId(run(p), 'gps')).toMatchObject({ level: 'info', text: expect.stringContaining('1 photo sur 2') });
  });
  it('attention when one is outside Senegal (Paris)', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a'), photo('b', { gps: { lat: 48.85, lng: 2.35 } })] }))]);
    expect(byId(run(p), 'gps-outside')).toMatchObject({ level: 'attention' });
  });
  it.each([[14.69, -17.44], [16.03, -16.5], [12.55, -12.0]])('(%d, %d) is in Senegal', (lat, lng) => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a', { gps: { lat, lng } })] }))]);
    expect(byId(run(p), 'gps-outside')).toBeUndefined();
  });
});

describe('when the photos were taken', () => {
  it('ok just before sending', () => {
    expect(byId(run(project('p1', [step('s1', 1, proof())])), 'date')).toMatchObject({ level: 'ok' });
  });
  it('attention for a photo more than a week older than the proof', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a', { takenAt: iso(SUBMITTED - 9 * 24 * 3_600_000) })] }))]);
    expect(byId(run(p), 'date-old')).toMatchObject({ level: 'attention' });
  });
  it('attention for a photo dated after the proof was sent', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a', { takenAt: iso(SUBMITTED + 3_600_000) })] }))]);
    expect(byId(run(p), 'date-future')).toMatchObject({ level: 'attention' });
  });
  it('tolerates a few minutes of clock difference', () => {
    const p = project('p1', [step('s1', 1, proof({ photos: [photo('a', { takenAt: iso(SUBMITTED + 5 * 60_000) })] }))]);
    expect(byId(run(p), 'date-future')).toBeUndefined();
  });
});

describe('the invoice amount against the step', () => {
  // 100 $ at 600 FCFA = 60 000 FCFA
  const withInvoice = (amount?: number) => project('p1', [step('s1', 1, proof({ invoice: file('inv'), invoiceAmountFcfa: amount }))]);
  it('ok within 15 %', () => {
    expect(byId(run(withInvoice(63_000)), 'invoice-amount')).toMatchObject({ level: 'ok' });
    expect(byId(run(withInvoice(51_500)), 'invoice-amount')).toMatchObject({ level: 'ok' });
  });
  it('attention beyond 15 %, with the gap', () => {
    const c = byId(run(withInvoice(90_000)), 'invoice-amount')!;
    expect(c.level).toBe('attention');
    expect(c.text).toContain('50 %');
  });
  it('info when the amount was not given', () => {
    expect(byId(run(withInvoice()), 'invoice-amount')).toMatchObject({ level: 'info' });
  });
  it('nothing about an invoice when there is none', () => {
    expect(byId(run(project('p1', [step('s1', 1, proof())])), 'invoice-amount')).toBeUndefined();
  });
});

describe('a step with no proof', () => {
  it('has no checks', () => {
    expect(run(project('p1', [step('s1', 1, undefined, { status: 'active' })]))).toEqual([]);
  });
});
