import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { allocateBudget, SECTORS, STEP_TEMPLATES } from '@/lib/templates';
import type { ProofKind, Sector } from '@/lib/types';
import { projectSchema } from '@/server/validation';

const ALL = ['immobilier', 'agricole', 'commerce', 'scolarite', 'approvisionnement'] as const satisfies readonly Sector[];
const KINDS: ProofKind[] = ['titre', 'photos', 'facture'];

describe('the five sectors (three corridors on one engine)', () => {
  it('each has a label, a tagline, an icon, a cover that exists, and a template', () => {
    expect(Object.keys(SECTORS).sort()).toEqual([...ALL].sort());
    expect(Object.keys(STEP_TEMPLATES).sort()).toEqual([...ALL].sort());
    for (const id of ALL) {
      const s = SECTORS[id];
      expect(s.id).toBe(id);
      expect(s.label.length).toBeGreaterThan(2);
      expect(s.tagline.length).toBeGreaterThan(10);
      expect(existsSync(path.join(process.cwd(), 'public', s.cover)), s.cover).toBe(true);
    }
  });

  it.each(ALL)('%s: the shares add up to the whole budget and every step asks for a valid proof', (id) => {
    const template = STEP_TEMPLATES[id];
    expect(template.reduce((n, t) => n + t.share, 0)).toBeCloseTo(1, 10);
    for (const t of template) {
      expect(t.title.trim().length).toBeGreaterThan(2);
      expect(t.proofKinds.length).toBeGreaterThan(0);
      for (const k of t.proofKinds) expect(KINDS).toContain(k);
    }
  });

  it.each(ALL)('%s: any budget from 10 $ up is split exactly, in whole dollars, with no step under 1 $', (id) => {
    for (const budget of [10, 11, 15, 37, 100, 333, 1_000, 24_000]) {
      const amounts = allocateBudget(budget * 100, STEP_TEMPLATES[id]);
      expect(amounts.reduce((a, b) => a + b, 0), `${id} ${budget}`).toBe(budget * 100);
      for (const a of amounts) {
        expect(a % 100, `${id} ${budget}`).toBe(0);
        expect(a, `${id} ${budget}`).toBeGreaterThanOrEqual(100);
      }
    }
  });

  it('the school-fees corridor is paid per term against the school\'s receipt, and the restock one on delivery', () => {
    const school = STEP_TEMPLATES.scolarite.map((t) => t.title);
    expect(school.some((t) => /trimestre/i.test(t))).toBe(true);
    expect(STEP_TEMPLATES.scolarite.every((t) => t.proofKinds.includes('facture'))).toBe(true);
    const restock = STEP_TEMPLATES.approvisionnement;
    expect(restock.find((t) => /livraison/i.test(t.title))!.proofKinds).toEqual(expect.arrayContaining(['photos', 'facture']));
  });

  it('the server accepts a project of every sector and refuses an unknown one', () => {
    const base = { name: 'Projet', city: 'Dakar', budgetCents: 10_000, managerName: 'Moussa', steps: [{ title: 'Étape', amountCents: 10_000 }] };
    for (const sector of ALL) expect(projectSchema.safeParse({ ...base, sector }).success, sector).toBe(true);
    expect(projectSchema.safeParse({ ...base, sector: 'casino' }).success).toBe(false);
    expect(projectSchema.safeParse({ ...base, sector: '__proto__' }).success).toBe(false);
  });
});
