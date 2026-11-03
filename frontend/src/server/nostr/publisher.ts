import { finalizeEvent, getPublicKey } from 'nostr-tools/pure';
import { bindingOf, commitmentTemplate, LEDGER_COMMIT_KIND } from '@/lib/nostr/commitment';
import { publishToRelay, type RelayOptions } from '@/lib/nostr/relayClient';
import type { Db, LedgerEvent, NostrCommit } from '@/lib/types';
import { getConfig } from '../config';
import { readDb, withDb } from '../db';
import { ledgerFor } from '../ledger';
import { logger } from '../logger';
import { configuredRelays, nostrPublishing, projectSecretKey } from './keys';

/**
 * Publishes the commitments of every project's ledger to the relays, a few seconds after each event. Idempotent and
 * retried: a commitment is the same signed event every time, a relay that already has it says so, and a relay that
 * refused it is asked again later (with growing pauses).
 */

/** Events sent per round, so a long backlog never blocks the other jobs. */
const BATCH = 24;
const BACKOFF_MS = (attempts: number) => Math.min(60 * 60_000, 15_000 * 2 ** Math.min(attempts, 8));

/** Who asked, for tests. */
export interface PublishOptions extends RelayOptions {
  now?: number;
  relays?: string[];
}

export interface PublishSummary {
  attempted: number;
  confirmed: number;
}

/** The alarm about a key that no longer matches is repeated at most once an hour per project: this runs every few seconds. */
const KEY_ALARM_EVERY_MS = 60 * 60_000;
const lastKeyAlarm = new Map<string, number>();
/** Tests only. */
export const resetKeyAlarmsForTests = (): void => lastKeyAlarm.clear();

/** True once enough relays accepted: `minAcks`, or every configured relay when fewer are configured. */
const enough = (accepted: number, configured: number) => accepted >= Math.min(getConfig().nostr.minAcks, configured);

function commitFor(projectId: string, e: LedgerEvent, sk: Uint8Array): NostrCommit['event'] {
  const ev = finalizeEvent(commitmentTemplate(e), sk);
  return { id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at, kind: ev.kind, tags: ev.tags, content: ev.content, sig: ev.sig };
}

export async function publishCommitments(opts: PublishOptions = {}): Promise<PublishSummary> {
  const summary: PublishSummary = { attempted: 0, confirmed: 0 };
  if (!nostrPublishing()) return summary;
  const relays = opts.relays ?? configuredRelays();
  if (relays.length === 0) return summary;
  const now = opts.now ?? Date.now();

  const db = await readDb();
  const known = new Map((db.nostr ?? []).map((c) => [`${c.projectId}:${c.seq}`, c]));
  let budget = BATCH;

  for (const project of db.projects) {
    if (budget <= 0) break;
    const events = ledgerFor(db, project.id);
    const binding = bindingOf(events[0]?.data);
    if (!binding) continue; // a project created before commitments were switched on has none
    let sk: Uint8Array;
    try {
      sk = projectSecretKey(project.id);
      if (getPublicKey(sk) !== binding.pubkey) throw new Error('la clé dérivée ne correspond plus à celle inscrite dans le registre');
    } catch (err) {
      if (now - (lastKeyAlarm.get(project.id) ?? -Infinity) >= KEY_ALARM_EVERY_MS) {
        lastKeyAlarm.set(project.id, now);
        logger.error('nostr_key_mismatch', { projectId: project.id, error: err, hint: 'NOSTR_MASTER_KEY (ou SESSION_SECRET) a changé depuis la création du projet' });
      }
      continue;
    }

    for (const e of events) {
      if (budget <= 0) break;
      const rec = known.get(`${project.id}:${e.seq}`);
      if (rec?.confirmedAt) continue;
      if (rec?.lastAttemptAt && now - Date.parse(rec.lastAttemptAt) < BACKOFF_MS(rec.attempts)) continue;

      const event = rec?.event ?? commitFor(project.id, e, sk);
      const missing = relays.filter((r) => !(rec?.relays ?? []).includes(r));
      if (missing.length === 0) continue;
      budget -= 1;
      summary.attempted += 1;

      const results = await Promise.all(missing.map(async (url) => ({ url, ...(await publishToRelay(url, event, opts)) })));
      const accepted = [...new Set([...(rec?.relays ?? []), ...results.filter((r) => r.ok).map((r) => r.url)])];
      const refusals = results.filter((r) => !r.ok).map((r) => `${new URL(r.url).host}: ${r.detail}`);
      const at = new Date(now).toISOString();
      const confirmed = enough(accepted.length, relays.length);
      await withDb((d) => {
        const list = (d.nostr ??= []);
        const mine = list.find((c) => c.projectId === project.id && c.seq === e.seq);
        const next: NostrCommit = {
          projectId: project.id,
          seq: e.seq,
          event,
          relays: accepted,
          attempts: (mine?.attempts ?? rec?.attempts ?? 0) + 1,
          lastAttemptAt: at,
          lastError: refusals.length ? refusals.join(' · ').slice(0, 400) : undefined,
          confirmedAt: confirmed ? (mine?.confirmedAt ?? at) : undefined,
        };
        if (mine) Object.assign(mine, next);
        else list.push(next);
      });
      if (confirmed) summary.confirmed += 1;
      else logger.warn('nostr_publish_incomplete', { projectId: project.id, seq: e.seq, accepted: accepted.length, wanted: Math.min(getConfig().nostr.minAcks, relays.length), refusals });
    }
  }
  return summary;
}

/** What a project's owner sees: how much of the ledger is on the relays. */
export interface NostrStatus {
  enabled: boolean;
  pubkey?: string;
  kind: number;
  relays: string[];
  total: number;
  confirmed: number;
  /** NIP-03: commitments whose id is stamped on Bitcoin, and those still waiting for a block */
  attested: number;
  attestWaiting: number;
  lastError?: string;
}

export const nostrStatus = async (projectId: string): Promise<NostrStatus> => nostrStatusIn(await readDb(), projectId);

export function nostrStatusIn(db: Pick<Db, 'ledger' | 'nostr'>, projectId: string): NostrStatus {
  const events = ledgerFor(db, projectId);
  const binding = bindingOf(events[0]?.data);
  const mine = (db.nostr ?? []).filter((c) => c.projectId === projectId);
  return {
    enabled: nostrPublishing() && !!binding,
    pubkey: binding?.pubkey,
    kind: LEDGER_COMMIT_KIND,
    relays: binding?.relays ?? [],
    total: events.length,
    confirmed: mine.filter((c) => c.confirmedAt).length,
    attested: mine.filter((c) => c.attest?.status === 'confirmed').length,
    attestWaiting: mine.filter((c) => c.attest?.status === 'pending').length,
    lastError: mine.find((c) => !c.confirmedAt && c.lastError)?.lastError,
  };
}
