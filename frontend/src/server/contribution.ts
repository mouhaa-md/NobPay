import { fundedCents, type Db, type Funding, type Project, type User } from '@/lib/types';
import { hmacHex, safeEqual } from './crypto';
import { readDb, withDb } from './db';
import { findProject } from './domain';
import { HttpError } from './http';
import { assertSessionSecret } from './secret';
import { createFunding, refreshFunding, simulateFundingPaid } from './services';

/**
 * The family link: a brother in Paris, an aunt in Montreal and a cousin in Dakar each add to the same project's escrow,
 * from any Lightning wallet, with nothing to install and no account. It does one thing: add money. It does not show the
 * balance, the proofs, the supplier or any payment, and it cannot release or take anything back; the funder of the
 * project stays the only one who decides (and the only one a refund goes back to, which the page says plainly).
 *
 * The link `/contribuer/<token>` is signed (`<projectId>.<version>.<expiresAt>.<hmac>`, its own tag), lasts 90 days and is
 * renewed or removed by the funder. The contributor's first name is optional; when given it is written in the public
 * ledger next to the amount received, and the page says so before the invoice is made.
 */

export const CONTRIBUTION_DAYS = 90;
export const MIN_CONTRIBUTION_CENTS = 500;
/** An invoice per click is cheap to make and nobody pays it: only a few may wait at the same time for one project. */
export const MAX_PENDING_CONTRIBUTIONS = 5;
const MAX_NAME = 30;

const mac = (projectId: string, version: number, exp: number) => hmacHex('sha256', assertSessionSecret(), `contribution:${projectId}:${version}:${exp}`).slice(0, 32);

function issue(projectId: string, version: number, now = Date.now()): { token: string; expiresAt: string } {
  const exp = Math.floor(now / 1000) + CONTRIBUTION_DAYS * 86400;
  return { token: `${projectId}.${version}.${exp}.${mac(projectId, version, exp)}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function contributionLinkToken(project: Pick<Project, 'id' | 'contribution'>): string | null {
  const c = project.contribution;
  if (!c) return null;
  const exp = Math.floor(Date.parse(c.expiresAt) / 1000);
  return Number.isFinite(exp) ? `${project.id}.${c.tokenVersion}.${exp}.${mac(project.id, c.tokenVersion, exp)}` : null;
}

export const contributionLinkExpired = (project: Pick<Project, 'contribution'>, now = Date.now()): boolean => !project.contribution || Date.parse(project.contribution.expiresAt) <= now;

export function contributionTokenMatches(project: Project, token: string, now = Date.now()): boolean {
  const c = project.contribution;
  const parts = String(token ?? '').split('.');
  if (!c || parts.length !== 4 || parts[0] !== project.id) return false;
  const version = Number(parts[1]);
  const exp = Number(parts[2]);
  if (!Number.isInteger(version) || !Number.isInteger(exp) || version !== c.tokenVersion || exp * 1000 <= now) return false;
  return Date.parse(c.expiresAt) > now && safeEqual(parts[3], mac(project.id, version, exp));
}

export function findProjectByContributionToken(db: Pick<Db, 'projects'>, token: string, now = Date.now()): Project | undefined {
  const id = String(token ?? '').split('.')[0];
  return db.projects.find((p) => p.id === id && contributionTokenMatches(p, token, now));
}

function owned(db: Db, owner: User, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
  return project;
}

/** Opens the family link (or renews it: every older link stops working). */
export async function enableContribution(owner: User, projectId: string, opts: { renew?: boolean } = {}): Promise<{ token: string; expiresAt: string }> {
  return withDb((db) => {
    const project = owned(db, owner, projectId);
    const previous = project.contribution;
    const renew = !!opts.renew || !previous || contributionLinkExpired(project);
    if (!renew) return { token: contributionLinkToken(project)!, expiresAt: previous!.expiresAt };
    const version = (previous?.tokenVersion ?? 0) + 1;
    const issued = issue(project.id, version);
    project.contribution = { tokenVersion: version, expiresAt: issued.expiresAt, createdAt: previous?.createdAt ?? new Date().toISOString() };
    return issued;
  });
}

export async function disableContribution(owner: User, projectId: string): Promise<void> {
  await withDb((db) => {
    owned(db, owner, projectId).contribution = undefined;
  });
}

const cleanName = (raw: unknown) => String(raw ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);

/** What the public page may show: the project's face and how far along its funding is, no amounts held, no proofs. */
export function publicContributionView(db: Db, project: Project) {
  const owner = db.users.find((u) => u.id === project.ownerId);
  const funded = fundedCents(db, project.id);
  return {
    name: project.name,
    city: project.city,
    sector: project.sector,
    cover: project.coverImage,
    ownerFirstName: owner?.firstName ?? '',
    budgetCents: project.budgetCents,
    percent: project.budgetCents > 0 ? Math.min(100, Math.round((funded / project.budgetCents) * 100)) : 0,
    steps: project.steps.length,
    paidSteps: project.steps.filter((s) => s.status === 'paid').length,
  };
}

function ownerOf(db: Db, project: Project): User {
  const owner = db.users.find((u) => u.id === project.ownerId);
  if (!owner) throw new HttpError(404, 'Projet introuvable');
  return owner;
}

/** What the contributor's screen needs about an invoice (never anything of the funder's account). */
export interface ContributionInvoice {
  id: string;
  status: Funding['status'];
  amountCents: number;
  amountSats?: number;
  bolt11?: string;
  expiresAt?: string;
  mode: Funding['mode'];
}
const invoiceOf = (f: Funding): ContributionInvoice => ({ id: f.id, status: f.status, amountCents: f.amountCents, amountSats: f.amountSats, bolt11: f.bolt11, expiresAt: f.expiresAt, mode: f.mode });

export async function createContribution(token: string, input: { amountCents: number; name?: string }): Promise<ContributionInvoice> {
  const db = await readDb();
  const project = findProjectByContributionToken(db, token);
  if (!project) throw new HttpError(404, 'Ce lien n’est pas valable (ou il a été renouvelé).', 'bad_contribution_link');
  const amountCents = Math.round(Number(input.amountCents));
  if (!Number.isFinite(amountCents) || amountCents < MIN_CONTRIBUTION_CENTS) throw new HttpError(400, 'Montant minimum : 5 $');
  const waiting = db.fundings.filter((f) => f.projectId === project.id && f.status === 'pending' && f.contributor && (!f.expiresAt || Date.parse(f.expiresAt) > Date.now())).length;
  if (waiting >= MAX_PENDING_CONTRIBUTIONS) {
    throw new HttpError(429, 'Plusieurs cotisations attendent déjà leur paiement. Patientez quelques minutes, ou payez l’une d’elles.', 'too_many_pending');
  }
  const name = cleanName(input.name);
  const funding = await createFunding(ownerOf(db, project), project.id, { amountCents, method: 'lightning', contributor: name ? { name } : {} });
  return invoiceOf(funding);
}

/** The state of one invoice made through the link (the link and the invoice must go together). */
export async function contributionStatus(token: string, fundingId: string): Promise<ContributionInvoice> {
  const db = await readDb();
  const project = findProjectByContributionToken(db, token);
  const funding = db.fundings.find((f) => f.id === fundingId);
  if (!project || !funding || funding.projectId !== project.id || !funding.contributor) throw new HttpError(404, 'Versement introuvable');
  return invoiceOf(await refreshFunding(ownerOf(db, project), fundingId));
}

/** Demonstration instances only: "pays" the invoice, as the owner's own screen can. */
export async function simulateContribution(token: string, fundingId: string): Promise<ContributionInvoice> {
  const db = await readDb();
  const project = findProjectByContributionToken(db, token);
  const funding = db.fundings.find((f) => f.id === fundingId);
  if (!project || !funding || funding.projectId !== project.id || !funding.contributor) throw new HttpError(404, 'Versement introuvable');
  return invoiceOf(await simulateFundingPaid(ownerOf(db, project), fundingId));
}

/** For the funder's card: who added what. */
export function contributionsOf(db: Pick<Db, 'fundings'>, projectId: string): { id: string; name?: string; amountCents: number; at: string }[] {
  return db.fundings
    .filter((f) => f.projectId === projectId && f.contributor && f.status === 'paid')
    .map((f) => ({ id: f.id, name: f.contributor?.name, amountCents: f.amountCents, at: f.paidAt ?? f.createdAt }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

