import type { Anchor, User } from '@/lib/types';
import { randomId } from './crypto';
import { readDb, withDb } from './db';
import { findProject } from './domain';
import { HttpError } from './http';
import { buildDossier } from './ledger';
import { checkBitcoinBlock, inspect, parseDetached, stamp, upgrade, type BlockCheck } from './ots';

/**
 * Anchoring: the ledger of a project is exported as one canonical JSON file, its SHA-256
 * is stamped on Bitcoin through OpenTimestamps. Only the digest leaves the machine.
 */

export async function createAnchor(owner: User, projectId: string): Promise<Anchor> {
  const project = findProject(await readDb(), projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
  return anchorProject(projectId);
}

/** Anchors the current ledger state of a project (no ownership check: callers decide who may). Idempotent per state. */
export async function anchorProject(projectId: string): Promise<Anchor> {
  const db = await readDb();
  const project = findProject(db, projectId);
  if (!project) throw new HttpError(404, 'Projet introuvable');

  const built = buildDossier(db, project);
  const existing = db.anchors.find((a) => a.projectId === projectId && a.upToSeq === built.upToSeq && a.status !== 'failed');
  if (existing) return existing; // same ledger state: nothing new to anchor

  const anchor: Anchor = {
    id: randomId('a', 8), // the id also acts as the unguessable link of the public verification page
    projectId,
    upToSeq: built.upToSeq,
    digest: built.digest,
    dossierJson: built.json,
    submittedAt: new Date().toISOString(),
    status: 'pending',
  };
  try {
    const { ots, calendar } = await stamp(Buffer.from(built.digest, 'hex'));
    anchor.otsBase64 = ots.toString('base64');
    anchor.calendar = calendar;
  } catch (err) {
    anchor.status = 'failed';
    anchor.error = (err as Error).message;
  }
  await withDb((d) => {
    d.anchors.push(anchor);
  });
  return anchor;
}

export interface AnchorView extends Omit<Anchor, 'dossierJson' | 'otsBase64'> {
  hasOts: boolean;
  pendingCalendars: string[];
  bitcoinBlocks: number[];
  blockCheck?: BlockCheck;
}

export function toView(anchor: Anchor): AnchorView {
  const { dossierJson: _d, otsBase64, ...rest } = anchor;
  let pendingCalendars: string[] = [];
  let bitcoinBlocks: number[] = [];
  if (otsBase64) {
    try {
      const s = inspect(parseDetached(Buffer.from(otsBase64, 'base64')).root);
      pendingCalendars = s.pending.map((p) => p.uri);
      bitcoinBlocks = s.bitcoin.map((b) => b.height);
    } catch {
      /* corrupted file: shown as failed elsewhere */
    }
  }
  return { ...rest, hasOts: !!otsBase64, pendingCalendars, bitcoinBlocks };
}

/** Ledger events that are worth a public proof on their own: money in, money out. */
const ANCHOR_AFTER = new Set(['payout_completed', 'funding_paid']);
export const AUTO_ANCHOR_RETRY_MS = 10 * 60_000;

/**
 * AUTO_ANCHOR=1: anchors a project right after money moved (a payout completed or a funding was credited), so proofs
 * start waiting for their Bitcoin block without anyone pressing a button. A failed attempt (calendar down) is retried
 * at most every 10 minutes. Opt-in: anchoring calls public OpenTimestamps calendars over the network.
 */
export async function autoAnchorProjects(now = Date.now()): Promise<void> {
  const db = await readDb();
  for (const project of db.projects) {
    const events = db.ledger.filter((e) => e.projectId === project.id);
    const last = events.reduce<(typeof events)[number] | undefined>((a, e) => (!a || e.seq > a.seq ? e : a), undefined);
    if (!last || !ANCHOR_AFTER.has(last.type)) continue;
    const forThisState = db.anchors.filter((a) => a.projectId === project.id && a.upToSeq >= last.seq);
    if (forThisState.some((a) => a.status !== 'failed')) continue;
    if (forThisState.some((a) => now - Date.parse(a.submittedAt) < AUTO_ANCHOR_RETRY_MS)) continue;
    await anchorProject(project.id);
  }
}

/** Asks the calendars about every anchor still waiting for its Bitcoin block (background job, a few times an hour). */
export async function refreshPendingAnchors(minAgeMs = 5 * 60_000): Promise<void> {
  for (const a of (await readDb()).anchors) {
    if (a.status !== 'pending' || !a.otsBase64 || Date.now() - Date.parse(a.submittedAt) < minAgeMs) continue;
    try {
      await refreshAnchor(a.id);
    } catch {
      /* a calendar being down is normal: try again at the next round */
    }
  }
}

/** Looks for the Bitcoin attestation; updates the stored file when the calendar has one. */
export async function refreshAnchor(anchorId: string, opts: { verifyBlock?: boolean } = {}): Promise<AnchorView> {
  const db = await readDb();
  const anchor = db.anchors.find((a) => a.id === anchorId);
  if (!anchor) throw new HttpError(404, 'Ancrage introuvable');
  if (!anchor.otsBase64) return toView(anchor);

  let result: Awaited<ReturnType<typeof upgrade>> | undefined;
  if (anchor.status === 'pending') {
    try {
      result = await upgrade(Buffer.from(anchor.otsBase64, 'base64'));
    } catch (err) {
      throw new HttpError(502, `Calendrier OpenTimestamps injoignable : ${(err as Error).message}`);
    }
    if (result.changed || result.status.bitcoin.length) {
      await withDb((d) => {
        const a = d.anchors.find((x) => x.id === anchorId)!;
        a.otsBase64 = result!.ots.toString('base64');
        if (result!.status.bitcoin.length) {
          a.status = 'confirmed';
          a.bitcoinBlock = Math.min(...result!.status.bitcoin.map((b) => b.height));
          a.confirmedAt = new Date().toISOString();
        }
      });
    }
  }

  const fresh = (await readDb()).anchors.find((a) => a.id === anchorId)!;
  const view = toView(fresh);
  if (opts.verifyBlock && fresh.otsBase64 && view.bitcoinBlocks.length) {
    const s = inspect(parseDetached(Buffer.from(fresh.otsBase64, 'base64')).root);
    const first = s.bitcoin[0];
    view.blockCheck = await checkBitcoinBlock(first.height, first.commitment);
  }
  return view;
}
