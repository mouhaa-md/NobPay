import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalize } from '@/lib/canonical';
import { sha256Hex, sha256Pure } from '@/lib/sha256';
import { verifyDossier } from '@/lib/verify';
import { appendLedger, buildDossier } from '@/server/ledger';
import type { LedgerEvent, Project } from '@/lib/types';

const project = {
  id: 'p_test',
  name: 'Villa à Thiès — été 2026',
  sector: 'immobilier',
  city: 'Thiès',
  country: 'SN',
  budgetCents: 1_000_00,
  createdAt: '2026-10-01T10:00:00.000Z',
  steps: [{ index: 1, title: 'Fondations', amountCents: 1_000_00, status: 'paid' }],
} as unknown as Project;

function sampleDossier() {
  const db = { ledger: [] as LedgerEvent[] };
  appendLedger(db, project.id, 'project_created', { name: project.name, note: 'é — ü ✓' }, '2026-10-01T10:00:00.000Z');
  appendLedger(db, project.id, 'funding_paid', { amountCents: 100_000, method: 'lightning' }, '2026-10-02T10:00:00.000Z');
  appendLedger(db, project.id, 'step_approved', { stepId: 'p_test_s1', index: 1 }, '2026-10-03T10:00:00.000Z');
  return buildDossier(db, project, '2026-10-04T10:00:00.000Z');
}

describe('sha256 for the browser', () => {
  it('pure fallback matches node for many lengths (padding edge cases)', () => {
    for (const len of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
      const bytes = randomBytes(len);
      expect(sha256Pure(bytes)).toBe(createHash('sha256').update(bytes).digest('hex'));
    }
  });

  it('hashes text as UTF-8', async () => {
    const text = 'Thiès — 1 000 $ ✓';
    expect(await sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
  });
});

describe('verifyDossier', () => {
  it('accepts an untouched dossier and matches the anchored digest', async () => {
    const built = sampleDossier();
    const report = await verifyDossier(built.json, built.digest);
    expect(report.formatOk).toBe(true);
    expect(report.digestMatches).toBe(true);
    expect(report.chainOk).toBe(true);
    expect(report.headOk).toBe(true);
    expect(report.eventCount).toBe(3);
  });

  it('is the same canonical form the server produced', () => {
    const built = sampleDossier();
    expect(canonicalize(JSON.parse(built.json))).toBe(built.json);
  });

  it('detects an edited amount: digest and chain both fail', async () => {
    const built = sampleDossier();
    const tampered = built.json.replace('"amountCents":100000', '"amountCents":999999');
    expect(tampered).not.toBe(built.json);
    const report = await verifyDossier(tampered, built.digest);
    expect(report.digestMatches).toBe(false);
    expect(report.chainOk).toBe(false);
    expect(report.brokenAt).toBe(2);
  });

  it('detects a removed event', async () => {
    const built = sampleDossier();
    const dossier = JSON.parse(built.json);
    dossier.ledger.splice(1, 1);
    const report = await verifyDossier(JSON.stringify(dossier));
    expect(report.chainOk).toBe(false);
  });

  it('rejects files that are not dossiers', async () => {
    expect((await verifyDossier('not json')).error).toMatch(/JSON/);
    expect((await verifyDossier('{"format":"other"}')).formatOk).toBe(false);
  });
});
