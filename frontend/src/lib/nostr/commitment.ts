import type { Event, EventTemplate } from 'nostr-tools/pure';
import { verifyEvent } from 'nostr-tools/pure';
import { fetchFromRelay, relayUrlProblem, type RelayOptions } from './relayClient';

/**
 * Commitments of the ledger on Nostr relays.
 *
 * Each event of a project's hash chain is published as a small Nostr event signed by a key made for that project. It
 * carries ONLY the position and the two hashes (no amount, no name, no type): it proves WHAT the ledger said and WHEN,
 * without revealing anything. The kind is a "regular" one (1000-9999), which relays keep as they are: unlike a
 * replaceable kind, a forged second version cannot silently take the place of the first, it shows up next to it.
 */

/** Regular kind (NIP-01: 1000 to 9999), not assigned in the NIPs repository, and with no event on the main public relays when this was chosen (8173, first choice, was already in use by another application). */
export const LEDGER_COMMIT_KIND = 8421;
export const COMMIT_TAG = 'nobpay';
/** Relays asked by the verification page besides those named by the project. */
export const DEFAULT_RELAYS = ['wss://relay.damus.io', 'wss://nos.lol', 'wss://relay.primal.net'];
const MAX_RELAYS = 6;
/** A missing commitment younger than this is "on its way", not "absent". */
const PENDING_GRACE_MS = 3 * 60_000;

const HEX64 = /^[0-9a-f]{64}$/;
export const isHex64 = (v: unknown): v is string => typeof v === 'string' && HEX64.test(v);

export interface LedgerLink {
  seq: number;
  at: string;
  hash: string;
  prevHash: string;
}

export function commitmentTemplate(e: LedgerLink): EventTemplate {
  return {
    kind: LEDGER_COMMIT_KIND,
    created_at: Math.floor(Date.parse(e.at) / 1000),
    tags: [['t', COMMIT_TAG]],
    content: JSON.stringify({ v: 1, seq: e.seq, hash: e.hash, prev: e.prevHash }),
  };
}

export interface Commitment {
  seq: number;
  hash: string;
  prev: string;
}

/** What a commitment event says, or null when it is not one of ours. */
export function parseCommitment(event: Pick<Event, 'kind' | 'content'>): Commitment | null {
  if (event.kind !== LEDGER_COMMIT_KIND) return null;
  try {
    const c = JSON.parse(event.content) as Record<string, unknown>;
    if (c.v !== 1 || !Number.isInteger(c.seq) || (c.seq as number) < 1 || !isHex64(c.hash) || !isHex64(c.prev)) return null;
    return { seq: c.seq as number, hash: c.hash as string, prev: c.prev as string };
  } catch {
    return null;
  }
}

/** The Nostr part the project's FIRST ledger event carries, so the chain itself (and its Bitcoin anchor) names the key. */
export interface NostrBinding {
  pubkey: string;
  kind: number;
  relays: string[];
}
export function bindingOf(firstEventData: unknown): NostrBinding | null {
  const n = (firstEventData as { nostr?: Partial<NostrBinding> } | undefined)?.nostr;
  if (!n || !isHex64(n.pubkey)) return null;
  return { pubkey: n.pubkey, kind: typeof n.kind === 'number' ? n.kind : LEDGER_COMMIT_KIND, relays: Array.isArray(n.relays) ? n.relays.filter((r): r is string => typeof r === 'string') : [] };
}

export type SeqState = 'confirmed' | 'pending' | 'missing' | 'conflict';

export interface CommitmentComparison {
  /** state of each ledger position, 1-based */
  perSeq: { seq: number; state: SeqState; relays: number }[];
  /** commitments with a valid signature that contradict the ledger (same position, other hashes) */
  conflicts: { seq: number; ledgerHash: string; relayHash: string }[];
  /** the relays know positions beyond the end of this ledger (normal for an older dossier) */
  beyond: number;
  /** the first position beyond the ledger links to this ledger's head (continuity), when there is one */
  continuity: boolean | null;
  /** events dropped because their signature or content was invalid */
  invalid: number;
}

/**
 * Compares a ledger with what relays published. `byRelay` maps a relay to the events it returned. Only events signed by
 * `pubkey`, with a valid signature, of our kind and shape, count.
 */
export function compareCommitments(ledger: LedgerLink[], pubkey: string, byRelay: Map<string, Event[]>, now = Date.now()): CommitmentComparison {
  // position -> hash -> relays that have it
  const seen = new Map<number, Map<string, Set<string>>>();
  const prevOf = new Map<string, string>(); // hash -> prev, to check continuity
  const signatureOk = new Map<string, boolean>(); // each event is checked once, however many relays returned it
  let invalid = 0;
  for (const [relay, events] of byRelay) {
    for (const ev of events) {
      if (ev.pubkey !== pubkey || ev.kind !== LEDGER_COMMIT_KIND) continue;
      const c = parseCommitment(ev);
      if (c && !signatureOk.has(ev.id)) signatureOk.set(ev.id, verifyEvent(ev));
      if (!c || !signatureOk.get(ev.id)) {
        invalid += 1;
        continue;
      }
      const byHash = seen.get(c.seq) ?? new Map<string, Set<string>>();
      const relays = byHash.get(c.hash) ?? new Set<string>();
      relays.add(relay);
      byHash.set(c.hash, relays);
      seen.set(c.seq, byHash);
      prevOf.set(c.hash, c.prev);
    }
  }

  const conflicts: CommitmentComparison['conflicts'] = [];
  const perSeq = ledger.map((e): CommitmentComparison['perSeq'][number] => {
    const byHash = seen.get(e.seq) ?? new Map<string, Set<string>>();
    const others = [...byHash.keys()].filter((h) => h !== e.hash);
    for (const relayHash of others) conflicts.push({ seq: e.seq, ledgerHash: e.hash, relayHash });
    const agreeing = byHash.get(e.hash)?.size ?? 0;
    // a second, different commitment for the same position is a contradiction even if the right one is also there
    if (others.length > 0) return { seq: e.seq, state: 'conflict', relays: agreeing };
    if (agreeing > 0) return { seq: e.seq, state: 'confirmed', relays: agreeing };
    return { seq: e.seq, state: now - Date.parse(e.at) < PENDING_GRACE_MS ? 'pending' : 'missing', relays: 0 };
  });

  const last = ledger[ledger.length - 1];
  const next = last ? seen.get(last.seq + 1) : undefined;
  let beyond = 0;
  for (const seq of seen.keys()) if (last && seq > last.seq) beyond += 1;
  let continuity: boolean | null = null;
  if (last && next) continuity = [...next.keys()].some((h) => prevOf.get(h) === last.hash);
  return { perSeq, conflicts, beyond, continuity, invalid };
}

export type NostrState = 'none' | 'confirmed' | 'partial' | 'conflict' | 'unreachable';

export interface NostrReport {
  state: NostrState;
  pubkey?: string;
  relays: { url: string; ok: boolean; events: number; error?: string }[];
  comparison?: CommitmentComparison;
  confirmed: number;
  total: number;
  /** positions found on fewer relays than the server wants for "published" (2), though more relays answered */
  thin: number;
}

/** A commitment counts as published once this many relays have it (NOSTR_MIN_ACKS on the server); the verifier asks no less. */
const REPLICAS_WANTED = 2;

/** The relays to ask: those named by the project, then the defaults, only the usable ones, at most a handful. */
export function relaysToAsk(named: string[], allowLocal = false): string[] {
  const out: string[] = [];
  for (const url of [...named, ...DEFAULT_RELAYS]) {
    if (relayUrlProblem(url, allowLocal) === null && !out.includes(url)) out.push(url);
    if (out.length >= MAX_RELAYS) break;
  }
  return out;
}

/**
 * Checks a ledger against the relays, from wherever it runs (the browser of a verifier, a test). Nothing here goes
 * through NobPay: the dossier names a key, the relays say what that key published.
 */
export async function verifyOnRelays(
  ledger: (LedgerLink & { data?: unknown })[],
  opts: RelayOptions & { allowLocal?: boolean; relays?: string[]; now?: number } = {},
): Promise<NostrReport> {
  const total = ledger.length;
  const binding = bindingOf(ledger[0]?.data);
  if (!binding) return { state: 'none', relays: [], confirmed: 0, total, thin: 0 };
  const urls = opts.relays ?? relaysToAsk(binding.relays, opts.allowLocal);

  const byRelay = new Map<string, Event[]>();
  const relays: NostrReport['relays'] = [];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const events = await fetchFromRelay(url, { kinds: [LEDGER_COMMIT_KIND], authors: [binding.pubkey], limit: 1_000 }, opts);
        byRelay.set(url, events);
        relays.push({ url, ok: true, events: events.length });
      } catch (e) {
        relays.push({ url, ok: false, events: 0, error: e instanceof Error ? e.message : 'erreur' });
      }
    }),
  );
  relays.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
  if (byRelay.size === 0) return { state: 'unreachable', pubkey: binding.pubkey, relays, confirmed: 0, total, thin: 0 };

  const comparison = compareCommitments(ledger, binding.pubkey, byRelay, opts.now);
  const confirmed = comparison.perSeq.filter((p) => p.state === 'confirmed').length;
  const allAccountedFor = comparison.perSeq.every((p) => p.state === 'confirmed' || p.state === 'pending');
  // "replicated" means on several relays that nobody owns together: one copy on one relay proves little (it may be the
  // operator's own). With fewer relays reachable than that, what can be asked of them is asked.
  const wanted = Math.min(REPLICAS_WANTED, byRelay.size);
  const thin = comparison.perSeq.filter((p) => p.state === 'confirmed' && p.relays < wanted).length;
  const state: NostrState = comparison.conflicts.length > 0 || comparison.continuity === false ? 'conflict' : allAccountedFor && confirmed > 0 && thin === 0 ? 'confirmed' : 'partial';
  return { state, pubkey: binding.pubkey, relays, comparison, confirmed, total, thin };
}
