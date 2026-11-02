import { finalizeEvent } from 'nostr-tools/pure';
import { LEDGER_COMMIT_KIND } from '@/lib/nostr/commitment';
import { publishToRelay } from '@/lib/nostr/relayClient';
import type { NostrAttestation, NostrCommit } from '@/lib/types';
import { getConfig } from '../config';
import { readDb, withDb } from '../db';
import { logger } from '../logger';
import { inspect, parseDetached, reduceToBitcoin, stamp, upgrade } from '../ots';
import { configuredRelays, nostrPublishing, projectSecretKey } from './keys';
import type { PublishOptions } from './publisher';

/**
 * NIP-03: the id of a commitment event is stamped on Bitcoin through OpenTimestamps, and the proof is published as a
 * kind 1040 event pointing at it. Anyone with a NIP-03 client can then see that the commitment existed before a given
 * Bitcoin block, with no trust in NobPay or in the relays. Only the events where money moved are stamped.
 */

/** NIP-03 attestation event. */
export const OTS_KIND = 1040;
export const ATTEST_AFTER = new Set(['funding_paid', 'payout_completed', 'refund_completed']);
/** Calendars are polled for the block at this pace (a block takes a few hours). */
const CHECK_EVERY_MS = 10 * 60_000;
const MIN_AGE_BEFORE_CHECK_MS = 5 * 60_000;
/** New stamps per round, so a backlog does not hammer the calendars. */
const STAMPS_PER_ROUND = 3;

export const attestationEnabled = (): boolean => nostrPublishing() && process.env.NOSTR_ATTEST !== '0';

export interface AttestSummary {
  stamped: number;
  confirmed: number;
  published: number;
}

/** The kind 1040 event for a proof: `e` points at the stamped event, `k` says its kind, the content is the .ots file in base64. */
function proofEventFor(commit: NostrCommit, reducedOts: Buffer): NostrCommit['event'] {
  const sk = projectSecretKey(commit.projectId);
  const ev = finalizeEvent(
    {
      kind: OTS_KIND,
      created_at: Math.floor(Date.now() / 1000),
      tags: [
        ['e', commit.event.id],
        ['k', String(LEDGER_COMMIT_KIND)],
      ],
      content: reducedOts.toString('base64'),
    },
    sk,
  );
  return { id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at, kind: ev.kind, tags: ev.tags, content: ev.content, sig: ev.sig };
}

export async function attestCommitments(opts: PublishOptions = {}): Promise<AttestSummary> {
  const summary: AttestSummary = { stamped: 0, confirmed: 0, published: 0 };
  if (!attestationEnabled()) return summary;
  const now = opts.now ?? Date.now();
  const db = await readDb();
  const typeOf = new Map(db.ledger.map((e) => [`${e.projectId}:${e.seq}`, e.type]));
  const patch = (c: NostrCommit, fn: (a: NostrAttestation) => void) =>
    withDb((d) => {
      const mine = d.nostr?.find((x) => x.projectId === c.projectId && x.seq === c.seq);
      if (mine?.attest) fn(mine.attest);
    });

  // 1. stamp the id of the commitments where money moved
  let budget = STAMPS_PER_ROUND;
  for (const c of db.nostr ?? []) {
    if (budget <= 0) break;
    if (c.attest || !c.confirmedAt || !ATTEST_AFTER.has(typeOf.get(`${c.projectId}:${c.seq}`) ?? '')) continue;
    budget -= 1;
    const at = new Date(now).toISOString();
    let attest: NostrAttestation;
    try {
      const { ots } = await stamp(Buffer.from(c.event.id, 'hex'));
      attest = { otsBase64: ots.toString('base64'), status: 'pending', submittedAt: at, proofRelays: [] };
      summary.stamped += 1;
    } catch (err) {
      // a calendar being down is normal: try again at a later round
      logger.warn('nostr_stamp_failed', { projectId: c.projectId, seq: c.seq, error: err });
      continue;
    }
    await withDb((d) => {
      const mine = d.nostr?.find((x) => x.projectId === c.projectId && x.seq === c.seq);
      if (mine && !mine.attest) mine.attest = attest;
    });
  }

  // 2. ask the calendars whether a Bitcoin block has the stamp, and prepare the proof event
  for (const c of (await readDb()).nostr ?? []) {
    const a = c.attest;
    if (!a || a.status !== 'pending') continue;
    if (now - Date.parse(a.submittedAt) < MIN_AGE_BEFORE_CHECK_MS) continue;
    if (a.lastCheckAt && now - Date.parse(a.lastCheckAt) < CHECK_EVERY_MS) continue;
    try {
      const up = await upgrade(Buffer.from(a.otsBase64, 'base64'));
      const reduced = reduceToBitcoin(up.ots);
      if (!reduced) {
        await patch(c, (x) => {
          x.otsBase64 = up.ots.toString('base64');
          x.lastCheckAt = new Date(now).toISOString();
        });
        continue;
      }
      const block = Math.min(...inspect(parseDetached(reduced).root).bitcoin.map((b) => b.height));
      const proofEvent = proofEventFor(c, reduced);
      await patch(c, (x) => {
        x.otsBase64 = up.ots.toString('base64');
        x.status = 'confirmed';
        x.bitcoinBlock = block;
        x.proofEvent = proofEvent;
        x.lastCheckAt = new Date(now).toISOString();
      });
      summary.confirmed += 1;
    } catch (err) {
      await patch(c, (x) => void (x.lastCheckAt = new Date(now).toISOString()));
      logger.warn('nostr_upgrade_failed', { projectId: c.projectId, seq: c.seq, error: err });
    }
  }

  // 3. publish the proof events that have not reached enough relays yet
  const relays = opts.relays ?? configuredRelays();
  const enough = Math.min(getConfig().nostr.minAcks, relays.length);
  for (const c of (await readDb()).nostr ?? []) {
    const a = c.attest;
    if (!a || a.status !== 'confirmed' || !a.proofEvent || a.proofRelays.length >= enough) continue;
    const missing = relays.filter((r) => !a.proofRelays.includes(r));
    const results = await Promise.all(missing.map(async (url) => ({ url, ...(await publishToRelay(url, a.proofEvent!, opts)) })));
    const accepted = [...new Set([...a.proofRelays, ...results.filter((r) => r.ok).map((r) => r.url)])];
    await patch(c, (x) => void (x.proofRelays = accepted));
    if (accepted.length >= enough) summary.published += 1;
  }
  return summary;
}
