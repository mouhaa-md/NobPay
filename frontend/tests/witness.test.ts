import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/lib/types';

// the file route reads the session cookie: there is none here (the witness has no account)
vi.mock('next/headers', () => ({
  cookies: () => ({ get: () => undefined, set: () => undefined, delete: () => undefined }),
}));

let witness: typeof import('@/server/witness');
let managerToken: typeof import('@/server/managerToken');
let services: typeof import('@/server/services');
let ledger: typeof import('@/server/ledger');
let db: typeof import('@/server/db');
let filesRoute: typeof import('@/app/api/files/[projectId]/[fileId]/route');

const STRONG = 'a-long-random-secret-of-more-than-32-characters';
const PROJECT = 'p_villa';
const PENDING = 'p_villa_s3'; // the demonstration step whose proof waits for a decision
let owner: User;

beforeAll(async () => {
  process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), 'nobpay-witness-'));
  witness = await import('@/server/witness');
  managerToken = await import('@/server/managerToken');
  services = await import('@/server/services');
  ledger = await import('@/server/ledger');
  db = await import('@/server/db');
  filesRoute = await import('@/app/api/files/[projectId]/[fileId]/route');
});
beforeEach(async () => {
  vi.stubEnv('SESSION_SECRET', STRONG);
  vi.stubEnv('BITNOB_MODE', 'mock');
  vi.stubEnv('ALLOW_DEMO', '');
  vi.stubEnv('RATE_LIMIT', '0');
  await db.resetDb();
  owner = (await db.readDb()).users.find((u) => u.id === 'u_aminata')!;
});
afterEach(() => vi.unstubAllEnvs());

const project = async () => (await db.readDb()).projects.find((p) => p.id === PROJECT)!;
const step = async (id = PENDING) => (await project()).steps.find((s) => s.id === id)!;
const invite = (name = 'Ibrahima, voisin', required = false, renew = false) => witness.inviteWitness(owner, PROJECT, { name, required, renew });

describe('the witness link', () => {
  it('opens its own project only, is signed, lasts 90 days, and is not the field team\'s link', async () => {
    const { token, expiresAt } = await invite();
    const p = await project();
    expect(witness.witnessTokenMatches(p, token)).toBe(true);
    expect(Date.parse(expiresAt) - Date.now()).toBeGreaterThan(89 * 86_400_000);
    expect(witness.findProjectByWitnessToken(await db.readDb(), token)?.id).toBe(PROJECT);

    const [id, v, exp, mac] = token.split('.');
    for (const bad of [`${id}.${v}.${Number(exp) + 99}.${mac}`, `${id}.${v}.${exp}.${mac.slice(0, -1)}${mac.endsWith('a') ? 'b' : 'a'}`, `p_other.${v}.${exp}.${mac}`, `${id}.${Number(v) + 1}.${exp}.${mac}`, '', 'x']) {
      expect(witness.witnessTokenMatches(p, bad), bad).toBe(false);
    }
    expect(witness.witnessTokenMatches(p, token, Date.now() + 91 * 86_400_000)).toBe(false);
    // neither link opens the other's door
    expect(managerToken.managerTokenMatches(p, token)).toBe(false);
    expect(witness.witnessTokenMatches(p, managerToken.managerLinkToken(p))).toBe(false);
    // and a project without a witness has no link at all
    await witness.removeWitness(owner, PROJECT);
    expect(witness.witnessTokenMatches(await project(), token)).toBe(false);
    expect(witness.witnessLinkToken(await project())).toBeNull();
  });

  it('keeps the same link when the name or the condition changes; renewing kills the old one', async () => {
    const first = await invite('Ibrahima', false);
    const edited = await invite('Ibrahima Sow', true);
    expect(edited.token).toBe(first.token);
    expect(await project()).toMatchObject({ witness: { name: 'Ibrahima Sow', required: true } });
    const renewed = await invite('Ibrahima Sow', true, true);
    expect(renewed.token).not.toBe(first.token);
    const p = await project();
    expect(witness.witnessTokenMatches(p, first.token)).toBe(false);
    expect(witness.witnessTokenMatches(p, renewed.token)).toBe(true);
  });

  it('is named by the funder of the project only, with a real name, and the name is cleaned', async () => {
    const stranger: User = { ...owner, id: 'u_stranger', phone: '+33600000000', demo: undefined };
    await expect(witness.inviteWitness(stranger, PROJECT, { name: 'Moussa', required: false })).rejects.toMatchObject({ status: 404 });
    await expect(witness.removeWitness(stranger, PROJECT)).rejects.toMatchObject({ status: 404 });
    await expect(invite('x')).rejects.toMatchObject({ status: 400 });
    await invite('  <b>Awa</b>\n  Ndiaye   ');
    expect((await project()).witness!.name).toBe('bAwa/b Ndiaye');
  });
});

describe('the witness answers', () => {
  it('confirms the proof that waits: it goes into the ledger with the name and the verdict, never with the private word', async () => {
    const { token } = await invite('Ibrahima, voisin');
    const before = ledger.ledgerFor(await db.readDb(), PROJECT).length;
    const answered = await witness.witnessRespond(token, { stepId: PENDING, verdict: 'confirmed', note: 'Je suis passé hier, tout est conforme.' });
    expect(answered.proof!.witness).toMatchObject({ verdict: 'confirmed', note: 'Je suis passé hier, tout est conforme.' });

    const events = ledger.ledgerFor(await db.readDb(), PROJECT);
    expect(events).toHaveLength(before + 1);
    const last = events[events.length - 1];
    expect(last.type).toBe('witness_response');
    expect(last.data).toEqual({ stepId: PENDING, index: 3, verdict: 'confirmed', witness: 'Ibrahima, voisin', hasNote: true });
    expect(JSON.stringify(last.data)).not.toContain('passé hier');
    expect(ledger.verifyChain(events).ok).toBe(true);
    // the public dossier does not carry the word either
    expect(ledger.buildDossier(await db.readDb(), await project()).json).not.toContain('passé hier');
  });

  it('answers once per proof: it cannot be taken back, and only the proof now waiting can be answered', async () => {
    const { token } = await invite();
    await witness.witnessRespond(token, { stepId: PENDING, verdict: 'disputed' });
    await expect(witness.witnessRespond(token, { stepId: PENDING, verdict: 'confirmed' })).rejects.toMatchObject({ status: 409, code: 'already_answered' });
    expect((await step()).proof!.witness!.verdict).toBe('disputed');
    // a step that is paid, or one that has no proof yet
    await expect(witness.witnessRespond(token, { stepId: 'p_villa_s1', verdict: 'confirmed' })).rejects.toMatchObject({ status: 409, code: 'nothing_to_answer' });
    await expect(witness.witnessRespond(token, { stepId: 'p_villa_s6', verdict: 'confirmed' })).rejects.toMatchObject({ status: 409, code: 'nothing_to_answer' });
    await expect(witness.witnessRespond(token, { stepId: 'nope', verdict: 'confirmed' })).rejects.toMatchObject({ status: 409 });
  });

  it('a wrong, renewed or removed link answers nothing', async () => {
    const { token } = await invite();
    await expect(witness.witnessRespond(`${token}x`, { stepId: PENDING, verdict: 'confirmed' })).rejects.toMatchObject({ status: 404, code: 'bad_witness_link' });
    await invite('Ibrahima', false, true); // renewed
    await expect(witness.witnessRespond(token, { stepId: PENDING, verdict: 'confirmed' })).rejects.toMatchObject({ code: 'bad_witness_link' });
    expect((await step()).proof!.witness).toBeUndefined();
  });

  it('what the witness page can show: the proof being decided, nothing when none waits', async () => {
    const { token } = await invite();
    expect(witness.viewForWitness(await db.readDb(), token)?.step?.id).toBe(PENDING);
    await db.withDb((d) => void (d.projects.find((p) => p.id === PROJECT)!.steps.find((s) => s.id === PENDING)!.status = 'rejected'));
    expect(witness.viewForWitness(await db.readDb(), token)).toMatchObject({ step: undefined });
    expect(witness.viewForWitness(await db.readDb(), 'p_villa.1.1.x')).toBeUndefined();
  });
});

describe('when the funder made the witness a condition', () => {
  const quote = () => services.quoteRelease(owner, PROJECT, PENDING);

  it('nothing is quoted or paid until the witness confirms', async () => {
    const { token } = await invite('Ibrahima', true);
    await expect(quote()).rejects.toMatchObject({ status: 409, code: 'witness_required' });
    await expect(services.confirmRelease(owner, PROJECT, PENDING)).rejects.toMatchObject({ status: 409 }); // no quote either way
    await witness.witnessRespond(token, { stepId: PENDING, verdict: 'confirmed' });
    await expect(quote()).resolves.toMatchObject({ mode: 'mock' });
    expect((await services.confirmRelease(owner, PROJECT, PENDING)).status).toBe('releasing');
  });

  it('a disputed proof stays blocked, with its own message, until the requirement is lifted', async () => {
    const { token } = await invite('Ibrahima', true);
    await witness.witnessRespond(token, { stepId: PENDING, verdict: 'disputed', note: 'Le mur du fond manque.' });
    await expect(quote()).rejects.toMatchObject({ status: 409, code: 'witness_disputed' });
    await invite('Ibrahima', false); // the funder maintains their decision: the opinion is advice again
    await expect(quote()).resolves.toBeTruthy();
  });

  it('the gate is checked again inside the transaction that reserves the money (a requirement set after the quote still holds)', async () => {
    await quote(); // quoted while no witness was required
    await invite('Ibrahima', true);
    await expect(services.confirmRelease(owner, PROJECT, PENDING)).rejects.toMatchObject({ status: 409, code: 'witness_required' });
    expect((await step()).status).toBe('proof_submitted');
    expect((await project()).steps.some((s) => s.status === 'releasing')).toBe(false);
  });

  it('removing the witness lifts the condition', async () => {
    await invite('Ibrahima', true);
    await expect(quote()).rejects.toMatchObject({ code: 'witness_required' });
    await witness.removeWitness(owner, PROJECT);
    await expect(quote()).resolves.toBeTruthy();
  });

  it('without the condition the witness is advice: the funder pays whatever the witness said', async () => {
    const { token } = await invite('Ibrahima', false);
    await witness.witnessRespond(token, { stepId: PENDING, verdict: 'disputed' });
    await expect(quote()).resolves.toBeTruthy();
    expect(witness.witnessGate(await project(), await step())).toBeNull();
  });
});

describe('what the witness may read', () => {
  const get = async (fileId: string, t?: string) => filesRoute.GET(new Request(`http://localhost/api/files/${PROJECT}/${fileId}${t ? `?t=${encodeURIComponent(t)}` : ''}`), { params: Promise.resolve({ projectId: PROJECT, fileId }) });

  it('the photos of the proof now waiting, with the link; nothing without it; nothing of the paid steps', async () => {
    const { token } = await invite();
    const p = await project();
    const pending = p.steps.find((s) => s.id === PENDING)!.proof!.photos[0];
    const paid = p.steps.find((s) => s.id === 'p_villa_s1')!.proof!.photos[0];
    expect((await get(pending.id, token)).status).toBe(200);
    expect((await get(pending.id)).status).toBe(403);
    expect((await get(pending.id, `${token}x`)).status).toBe(403);
    expect((await get(paid.id, token)).status).toBe(404); // the history of the project is not the witness's business
    // the field team's link still reads everything of its project, as before
    expect((await get(paid.id, managerToken.managerLinkToken(p))).status).toBe(200);
  });
});
