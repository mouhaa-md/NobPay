import { describe, expect, it, vi } from 'vitest';
import type { Project, ProofPhoto, Step } from '@/lib/types';
import { translate } from '@/lib/i18n/messages';
import { comparisons, type Opinion } from '@/server/aiReview';
import { proofChecks } from '@/server/proofChecks';

// the language of the request, as the cookie and the browser would say it
const request = vi.hoisted(() => ({ lang: 'fr' as 'fr' | 'en' }));
vi.mock('@/lib/i18n/server', () => ({ getLang: async () => request.lang }));

const { HttpError, respond } = await import('@/server/http');

describe('error messages sent by the server', () => {
  it('are in French by default and in English when the visitor reads English', async () => {
    const fail = () => respond(async () => {
      throw new HttpError(404, 'Projet introuvable', 'not_found');
    });
    request.lang = 'fr';
    expect(await (await fail()).json()).toEqual({ error: 'Projet introuvable', code: 'not_found' });
    request.lang = 'en';
    expect(await (await fail()).json()).toEqual({ error: 'Project not found', code: 'not_found' });
  });

  it('a message with no English wording stays in French rather than disappearing, and the status is kept', async () => {
    request.lang = 'en';
    const res = await respond(async () => {
      throw new HttpError(409, 'Une phrase que personne n’a traduite', 'x');
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Une phrase que personne n’a traduite');
  });

  it('an unexpected failure says so in the visitor\'s language and gives a reference, never the details', async () => {
    request.lang = 'en';
    const res = await respond(async () => {
      throw new Error('secret database path /var/x');
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/^Something went wrong on our side\. Try again in a moment\. \(reference [0-9a-f]{8}\)$/);
    expect(JSON.stringify(body)).not.toContain('secret');
  });
});

describe('the points made about a proof', () => {
  const en = (fr: string, vars?: Record<string, string | number>) => translate('en', fr, vars);
  const file = (s: string) => ({ id: `fl_${s}`, name: `${s}.jpg`, mime: 'image/jpeg', size: 10, sha256: s.padEnd(64, '0') });
  const photo = (s: string, over: Partial<ProofPhoto> = {}): ProofPhoto => ({ ...file(s), takenAt: '2026-11-02T11:55:00Z', gps: { lat: 14.79, lng: -16.93 }, ...over });
  const step = (proof: Step['proof']): Step => ({ id: 's1', index: 1, title: 'x', amountCents: 10_000, proofKinds: ['photos'], status: 'proof_submitted', proof });
  const project = (s: Step): Project => ({ id: 'p1', ownerId: 'u', name: 'P', sector: 'commerce', city: 'Dakar', country: 'SN', budgetCents: 10_000, coverImage: '', managerName: 'M', managerTokenVersion: 1, managerTokenExpiresAt: '', approvalRule: 'owner', steps: [s], createdAt: '' }) as Project;

  it('come out in English when asked, with the same levels', () => {
    const s = step({ photos: [photo('a', { gps: undefined })], submittedAt: '2026-11-02T12:00:00Z', submittedBy: 'manager' });
    const p = project(s);
    const french = proofChecks({ db: { projects: [p] }, project: p, step: s, usdXof: 600 });
    const english = proofChecks({ db: { projects: [p] }, project: p, step: s, usdXof: 600, t: en });
    expect(english.map((c) => c.level)).toEqual(french.map((c) => c.level));
    expect(french.find((c) => c.id === 'gps')!.text).toContain('position');
    expect(english.find((c) => c.id === 'gps')!.text).toBe('No position was attached to the photos: there is no way to know where the proof was sent from.');
  });

  it('the comparisons made on what the AI read are translated too', () => {
    const opinion: Opinion = {
      summary: 's',
      photos: [],
      invoice: { readable: true, supplier_name: 'Aliou Ba', total_amount: 95_000, currency: 'FCFA', date: null, reference: null, items_summary: null, concerns: ['none'] },
      flags: [],
    };
    const ctx = { declaredAmountFcfa: 60_000, expectedFcfa: 60_000, declaredSupplier: 'Moussa Diop', submittedAt: '2026-11-02T12:00:00Z' };
    const texts = comparisons(opinion, { ...ctx, t: en }).map((c) => c.text);
    expect(texts.join(' ')).toContain('The AI reads');
    expect(texts.join(' ')).toContain('The invoice is in the name of “Aliou Ba”, but the payment will go to “Moussa Diop”.');
    expect(texts.join(' ')).not.toContain('facture');
  });
});
