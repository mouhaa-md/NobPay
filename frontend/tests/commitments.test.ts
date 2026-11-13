import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, ProofPhoto, StoredFile } from '@/lib/types';
import { commit, newSalt, noteLedgerData, opensCommitment, proofSubmittedData, sealNote } from '@/server/commitments';

/**
 * What the public ledger may say about a position and a note: only sealed fingerprints. The dossier is public (anybody with the link
 * downloads it, its SHA-256 is anchored on Bitcoin), so no coordinate and no word of free text may be in it.
 */

describe('sealed fingerprints', () => {
  const gps = { lat: 14.7123, lng: -17.4567, accuracy: 8 };

  it('are the same for the same salt and value, whatever the order of the keys, and differ as soon as one thing changes', () => {
    const salt = newSalt();
    expect(commit('gps', salt, gps)).toBe(commit('gps', salt, { accuracy: 8, lng: -17.4567, lat: 14.7123 }));
    expect(commit('gps', salt, gps)).toMatch(/^[0-9a-f]{64}$/);
    expect(commit('gps', salt, { ...gps, lat: 14.7124 })).not.toBe(commit('gps', salt, gps)); // one metre away: another fingerprint
    expect(commit('gps', newSalt(), gps)).not.toBe(commit('gps', salt, gps)); // another salt
    expect(commit('note', salt, 'x')).not.toBe(commit('gps', salt, 'x')); // another kind of data never gives the same fingerprint
  });

  it('use a fresh 128-bit salt each time', () => {
    const salts = new Set(Array.from({ length: 50 }, newSalt));
    expect(salts.size).toBe(50);
    for (const s of salts) expect(s).toMatch(/^[0-9a-f]{32}$/);
  });

  it('can be opened with the value and the salt, and with nothing else', () => {
    const salt = newSalt();
    const sealed = commit('gps', salt, gps);
    expect(opensCommitment(sealed, 'gps', salt, gps)).toBe(true);
    expect(opensCommitment(sealed, 'gps', salt, { ...gps, lat: 15 })).toBe(false);
    expect(opensCommitment(sealed, 'gps', newSalt(), gps)).toBe(false);
    expect(opensCommitment(sealed, 'note', salt, gps)).toBe(false);
    expect(opensCommitment(sealed, 'gps', '', gps)).toBe(false); // no salt, no opening
  });

  it('cannot be found by trying positions: without the salt, the unsalted fingerprint of the same value is not the one recorded', () => {
    const salt = newSalt();
    const unsalted = commit('gps', '', gps);
    expect(unsalted).not.toBe(commit('gps', salt, gps));
  });

  it('a note is sealed only when there is one', () => {
    expect(sealNote(undefined)).toEqual({});
    expect(sealNote('')).toEqual({});
    const s = sealNote('Mur fini');
    expect(s.note).toBe('Mur fini');
    expect(s.noteSalt).toMatch(/^[0-9a-f]{32}$/);
    expect(noteLedgerData(undefined, undefined)).toEqual({});
    expect(noteLedgerData(s.note, s.noteSalt)).toEqual({ hasNote: true, noteCommit: commit('note', s.noteSalt!, 'Mur fini') });
  });
});

describe('the public ledger and the dossier', () => {
  let services: typeof import('@/server/services');
  let db: typeof import('@/server/db');
  let ledger: typeof import('@/server/ledger');

  beforeAll(async () => {
    process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-commit-'));
    services = await import('@/server/services');
    db = await import('@/server/db');
    ledger = await import('@/server/ledger');
  });
  beforeEach(async () => {
    vi.stubEnv('RATE_LIMIT', '0');
    vi.stubEnv('BITNOB_MODE', 'mock');
    vi.stubEnv('ALLOW_DEMO', '');
    await db.resetDb();
  });
  afterEach(() => vi.unstubAllEnvs());

  const NOTE = 'Les murs sont chez Moussa Diallo, a cote de la mosquee';
  const REASON = 'Photo floue, la maison de Fatou est a gauche';
  const file = (id: string): StoredFile => ({ id, name: `${id}.png`, mime: 'image/png', size: 10, sha256: id.padEnd(64, '0') });

  async function openProject() {
    const owner = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
    const project = await services.createProject(owner, { name: 'Maison', sector: 'immobilier', city: 'Thies', budgetCents: 20_000, managerName: 'Moussa', steps: [{ title: 'Murs', amountCents: 20_000, proofKinds: ['photos', 'facture'] }] });
    await db.withDb((d) => void (d.projects.find((p) => p.id === project.id)!.steps[0].status = 'active'));
    return { owner, project, step: project.steps[0] };
  }
  const submit = async (owner: Awaited<ReturnType<typeof openProject>>['owner'], project: Project, stepId: string, note = NOTE) =>
    services.submitProof({ kind: 'owner', user: owner }, project.id, stepId, {
      photos: [{ ...file('p1'), takenAt: new Date().toISOString(), gps: { lat: 14.71234, lng: -17.45678, accuracy: 8 } } as ProofPhoto],
      invoice: file('inv'),
      invoiceAmountFcfa: 118_600,
      note,
      supplier: { name: 'Quincaillerie Ndiaye', phone: '+221776543210', network: 'wave' },
    });
  const eventOf = async (projectId: string, type: string) => ledger.ledgerFor(await db.readDb(), projectId).filter((e) => e.type === type).pop()!;

  it('a proof is recorded with the fingerprint of its position and of its note, never the position or the words', async () => {
    const { owner, project, step } = await openProject();
    await submit(owner, project, step.id);
    const ev = await eventOf(project.id, 'proof_submitted');
    const json = JSON.stringify(ev.data);
    expect(json).not.toMatch(/14\.7|17\.4|"lat"|"lng"|accuracy|gps"/);
    expect(json).not.toContain('Moussa');
    expect(json).not.toContain('mosquee');
    expect(ev.data.hasNote).toBe(true);
    const photos = ev.data.photos as { sha256: string; takenAt: string; gpsCommit?: string }[];
    expect(photos[0].gpsCommit).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the private record keeps the position, the note and their salts, and they open the public fingerprints', async () => {
    const { owner, project, step } = await openProject();
    await submit(owner, project, step.id);
    const stored = (await db.readDb()).projects.find((p) => p.id === project.id)!.steps[0].proof!;
    const ev = await eventOf(project.id, 'proof_submitted');
    const photo = stored.photos[0];
    expect(photo.gps).toEqual({ lat: 14.71234, lng: -17.45678, accuracy: 8 });
    expect(stored.note).toBe(NOTE);
    const [p0] = ev.data.photos as { gpsCommit: string }[];
    expect(opensCommitment(p0.gpsCommit, 'gps', photo.gpsSalt!, photo.gps)).toBe(true);
    expect(opensCommitment(ev.data.noteCommit as string, 'note', stored.noteSalt!, stored.note)).toBe(true);
    // a record changed afterwards no longer opens the fingerprint that was anchored
    expect(opensCommitment(p0.gpsCommit, 'gps', photo.gpsSalt!, { ...photo.gps!, lat: 15 })).toBe(false);
    expect(opensCommitment(ev.data.noteCommit as string, 'note', stored.noteSalt!, `${NOTE}.`)).toBe(false);
  });

  it('a proof with no position and no note records neither fingerprint', async () => {
    const { owner, project, step } = await openProject();
    await services.submitProof({ kind: 'owner', user: owner }, project.id, step.id, {
      photos: [{ ...file('p2'), takenAt: new Date().toISOString() } as ProofPhoto],
      invoice: file('inv2'),
      supplier: { name: 'Quincaillerie Ndiaye', phone: '+221776543210', network: 'wave' },
    });
    const ev = await eventOf(project.id, 'proof_submitted');
    expect(ev.data.hasNote).toBeUndefined();
    expect(ev.data.noteCommit).toBeUndefined();
    expect((ev.data.photos as { gpsCommit?: string }[])[0].gpsCommit).toBeUndefined();
  });

  it('a refusal is recorded without its reason, the reason stays in the private record and opens the fingerprint', async () => {
    const { owner, project, step } = await openProject();
    await submit(owner, project, step.id);
    await services.rejectProof(owner, project.id, step.id, REASON);
    const ev = await eventOf(project.id, 'step_rejected');
    expect(JSON.stringify(ev.data)).not.toContain('floue');
    expect(JSON.stringify(ev.data)).not.toContain('Fatou');
    expect(ev.data.hasNote).toBe(true);
    const decision = (await db.readDb()).projects.find((p) => p.id === project.id)!.steps[0].decision!;
    expect(decision.note).toBe(REASON);
    expect(opensCommitment(ev.data.noteCommit as string, 'note', decision.noteSalt!, REASON)).toBe(true);
    // a refusal without a reason says nothing more
    await db.withDb((d) => {
      const s = d.projects.find((p) => p.id === project.id)!.steps[0];
      s.status = 'proof_submitted';
    });
    await services.rejectProof(owner, project.id, step.id);
    const bare = await eventOf(project.id, 'step_rejected');
    expect(bare.data.hasNote).toBeUndefined();
  });

  it('the dossier that anybody can download holds no coordinate and no note, for a new proof and for the demonstration data', async () => {
    const { owner, project, step } = await openProject();
    await submit(owner, project, step.id);
    await services.rejectProof(owner, project.id, step.id, REASON);
    const fresh = ledger.buildDossier(await db.readDb(), (await db.readDb()).projects.find((p) => p.id === project.id)!);
    expect(fresh.json).not.toMatch(/14\.7|17\.4|"lat"|"lng"|Moussa|mosquee|floue|Fatou/);

    // the demonstration project has positions and a note in its private records
    const dbNow = await db.readDb();
    const villa = dbNow.projects.find((p) => p.id === 'p_villa')!;
    expect(villa.steps.some((s) => s.proof?.photos.some((p) => p.gps))).toBe(true);
    expect(villa.steps.some((s) => s.proof?.note)).toBe(true);
    const demo = ledger.buildDossier(dbNow, villa);
    expect(demo.json).not.toMatch(/"lat"|"lng"|accuracy|14\.78|16\.92|parpaings|quincaillerie\.|rez-de-chauss/i);
    expect(demo.json).toContain('gpsCommit');
    expect(demo.json).toContain('noteCommit');
    expect(ledger.verifyChain(demo.dossier.ledger).ok).toBe(true);
  });

  it('the demonstration fingerprints open with the private records (and are the same at every reset)', async () => {
    const dbNow = await db.readDb();
    const villa = dbNow.projects.find((p) => p.id === 'p_villa')!;
    const s3 = villa.steps[2];
    const ev = ledger.ledgerFor(dbNow, villa.id).find((e) => e.type === 'proof_submitted' && e.data.stepId === s3.id)!;
    const [p0] = ev.data.photos as { gpsCommit: string }[];
    expect(opensCommitment(p0.gpsCommit, 'gps', s3.proof!.photos[0].gpsSalt!, s3.proof!.photos[0].gps)).toBe(true);
    expect(opensCommitment(ev.data.noteCommit as string, 'note', s3.proof!.noteSalt!, s3.proof!.note)).toBe(true);
    const direct = proofSubmittedData(s3, s3.proof!);
    expect(direct.noteCommit).toBe(ev.data.noteCommit);
  });
});
