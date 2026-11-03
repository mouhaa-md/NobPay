import type { Db, Project, Step, User } from '@/lib/types';
import { hmacHex, safeEqual } from './crypto';
import { withDb } from './db';
import { findProject } from './domain';
import { HttpError } from './http';
import { appendLedger } from './ledger';
import { assertSessionSecret } from './secret';

/**
 * The independent witness: a person the funder chooses (a neighbour, a mason, a relative) who looks at each proof from
 * outside and says "confirmed" or "disputed". This is what the paid platforms sell with salaried inspectors; here it is a
 * private link, no account, and the answer goes into the ledger like everything else.
 *
 * The link `/temoin/<token>` is signed (`<projectId>.<version>.<expiresAt>.<hmac>`, a tag of its own so it cannot be
 * mistaken for the field team's link), lives 90 days, and is renewed by the funder, which kills every older one.
 * The witness sees the proof being decided and nothing else: no money, no address, no other project.
 * The answer is advice for the funder, unless the funder made it a condition (`required`): then nothing is paid before
 * the witness has confirmed.
 */

export const WITNESS_DAYS = 90;
const MAX_NAME = 40;
const MAX_NOTE = 300;

const mac = (projectId: string, version: number, exp: number) => hmacHex('sha256', assertSessionSecret(), `witness:${projectId}:${version}:${exp}`).slice(0, 32);

function issue(projectId: string, version: number, now = Date.now()): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + WITNESS_DAYS * 86400;
  return { token: `${projectId}.${version}.${exp}.${mac(projectId, version, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The token of the project's witness for the funder to share, or null when there is none (or the link ran out). */
export function witnessLinkToken(project: Pick<Project, 'id' | 'witness'>): string | null {
  const w = project.witness;
  if (!w) return null;
  const exp = Math.floor(Date.parse(w.expiresAt) / 1000);
  return Number.isFinite(exp) ? `${project.id}.${w.tokenVersion}.${exp}.${mac(project.id, w.tokenVersion, exp)}` : null;
}

export const witnessLinkExpired = (project: Pick<Project, 'witness'>, now = Date.now()): boolean => !project.witness || Date.parse(project.witness.expiresAt) <= now;

export function witnessTokenMatches(project: Project, token: string, now = Date.now()): boolean {
  const w = project.witness;
  const parts = String(token ?? '').split('.');
  if (!w || parts.length !== 4 || parts[0] !== project.id) return false;
  const version = Number(parts[1]);
  const exp = Number(parts[2]);
  if (!Number.isInteger(version) || !Number.isInteger(exp) || version !== w.tokenVersion || exp * 1000 <= now) return false;
  return Date.parse(w.expiresAt) > now && safeEqual(parts[3], mac(project.id, version, exp));
}

export function findProjectByWitnessToken(db: Pick<Db, 'projects'>, token: string, now = Date.now()): Project | undefined {
  const id = String(token ?? '').split('.')[0];
  return db.projects.find((p) => p.id === id && witnessTokenMatches(p, token, now));
}

const cleanName = (raw: string) => String(raw ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

function owned(db: Db, owner: User, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
  return project;
}

/**
 * Names, or changes, the project's witness. The same link is kept unless `renew` (or there was none): a changed name
 * or a changed condition must not break a link already sent.
 */
export async function inviteWitness(owner: User, projectId: string, input: { name: string; required: boolean; renew?: boolean }): Promise<{ token: string; expiresAt: string }> {
  const name = cleanName(input.name);
  if (name.length < 2) throw new HttpError(400, 'Donnez le nom du témoin (2 caractères au moins).', 'invalid_input');
  return withDb((db) => {
    const project = owned(db, owner, projectId);
    const previous = project.witness;
    const renew = !!input.renew || !previous || witnessLinkExpired(project);
    const version = previous ? previous.tokenVersion + (renew ? 1 : 0) : 1;
    const issued = renew ? issue(project.id, version) : { token: witnessLinkToken(project)!, expiresAt: previous!.expiresAt };
    project.witness = { name, required: !!input.required, tokenVersion: version, expiresAt: issued.expiresAt, invitedAt: previous?.invitedAt ?? new Date().toISOString() };
    return issued;
  });
}

/** Removes the witness: the link stops working at once, and a condition that depended on them goes with them. */
export async function removeWitness(owner: User, projectId: string): Promise<void> {
  await withDb((db) => {
    owned(db, owner, projectId).witness = undefined;
  });
}

/** Why a payment must wait for the witness, or null when nothing stands in the way. */
export function witnessGate(project: Pick<Project, 'witness'>, step: Pick<Step, 'proof'>): { code: 'witness_required' | 'witness_disputed'; message: string } | null {
  const w = project.witness;
  if (!w?.required) return null;
  const answer = step.proof?.witness;
  if (answer?.verdict === 'confirmed') return null;
  if (answer?.verdict === 'disputed') {
    return { code: 'witness_disputed', message: 'Le témoin conteste cette preuve. Demandez une nouvelle preuve, ou retirez l’exigence du témoin si vous maintenez votre décision.' };
  }
  return { code: 'witness_required', message: 'Le témoin doit d’abord confirmer cette preuve.' };
}

/** What the witness page shows: the proof being decided, if any. */
export interface WitnessView {
  project: Project;
  step?: Step;
}

export function viewForWitness(db: Pick<Db, 'projects'>, token: string, now = Date.now()): WitnessView | undefined {
  const project = findProjectByWitnessToken(db, token, now);
  if (!project) return undefined;
  return { project, step: project.steps.find((s) => s.status === 'proof_submitted' && s.proof) };
}

/** The witness answers about the proof now waiting for a decision. One answer per proof: it cannot be taken back. */
export async function witnessRespond(token: string, input: { stepId: string; verdict: 'confirmed' | 'disputed'; note?: string }): Promise<Step> {
  const id = String(token ?? '').split('.')[0];
  return withDb((db) => {
    const project = db.projects.find((p) => p.id === id && witnessTokenMatches(p, token));
    if (!project?.witness) throw new HttpError(404, 'Ce lien n’est pas valable (ou il a été renouvelé).', 'bad_witness_link');
    const step = project.steps.find((s) => s.id === input.stepId);
    if (!step || step.status !== 'proof_submitted' || !step.proof) throw new HttpError(409, 'Cette preuve n’attend plus d’avis : le financeur a déjà décidé, ou une autre preuve a été envoyée.', 'nothing_to_answer');
    if (step.proof.witness) throw new HttpError(409, 'Vous avez déjà répondu pour cette preuve.', 'already_answered');
    const at = new Date().toISOString();
    const note = input.note?.replace(/\s+/g, ' ').trim().slice(0, MAX_NOTE) || undefined;
    step.proof.witness = { at, verdict: input.verdict, note };
    appendLedger(
      db,
      project.id,
      'witness_response',
      { stepId: step.id, index: step.index, verdict: input.verdict, witness: project.witness.name, ...(note ? { hasNote: true } : {}), ...(project.witness.required ? { required: true } : {}) },
      at,
    );
    return structuredClone(step);
  });
}
