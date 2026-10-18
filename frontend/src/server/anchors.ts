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
  const db = await readDb();
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');

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
