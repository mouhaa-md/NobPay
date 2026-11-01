import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_USD_XOF } from '@/server/config';
import { buildSeed } from '@/server/seed';

/**
 * The demonstration must tell one story: the picture of an invoice, the amount typed in the proof, the payout and the
 * rate shown on screen all agree. The pictures are drawn by scripts/build-demo-invoices.mjs; this test fails when a seeded
 * step or the demo rate changes without them being drawn again.
 */
describe('demonstration data', () => {
  const db = buildSeed(Date.parse('2026-11-01T12:00:00Z'));
  const manifest = JSON.parse(readFileSync(path.join(process.cwd(), 'public/demo/factures/manifest.json'), 'utf8')) as {
    rate: number;
    invoices: Record<string, { totalFcfa: number; usd: number }>;
  };

  it('uses the rate observed at Bitnob (about 593 XOF per dollar), not an invented one', () => {
    expect(DEFAULT_USD_XOF).toBe(593);
    expect(manifest.rate).toBe(DEFAULT_USD_XOF);
  });

  it('every seeded invoice is a picture whose total is the amount typed in the proof and the payout (run scripts/build-demo-invoices.mjs if not)', () => {
    let seen = 0;
    for (const project of db.projects) {
      for (const step of project.steps) {
        const invoice = step.proof?.invoice;
        if (!invoice) continue;
        seen += 1;
        const m = manifest.invoices[step.id];
        expect(m, `${step.id} has no drawn invoice`).toBeDefined();
        expect(invoice.publicPath).toBe(`demo/factures/${step.id}.png`);
        expect(existsSync(path.join(process.cwd(), 'public', invoice.publicPath!))).toBe(true);
        expect(invoice.size, step.id).toBeGreaterThan(5_000);
        expect(m.usd * 100, `${step.id}: dollars`).toBe(step.amountCents);
        expect(m.totalFcfa, `${step.id}: total at the demo rate`).toBe(Math.round((step.amountCents / 100) * DEFAULT_USD_XOF));
        expect(step.proof!.invoiceAmountFcfa, `${step.id}: typed amount`).toBe(m.totalFcfa);
        if (step.payout) expect(step.payout.amountFcfa, `${step.id}: payout`).toBe(m.totalFcfa);
      }
    }
    expect(seen).toBe(Object.keys(manifest.invoices).length); // no picture left over, none missing
  });
});
