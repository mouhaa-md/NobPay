import { createHash } from 'node:crypto';
import type { Db } from '@/lib/types';
import { getConfig } from './config';
import { withDb } from './db';
import { applyFundingPaid, applyPayoutCompleted, applyPayoutFailed } from './domain';
import { verifyWebhookSignature } from './bitnob/sign';

/**
 * Bitnob webhook receiver. The checks run in this order, and nothing is credited before all pass:
 *   1. HMAC-SHA512 signature of the RAW body, constant-time comparison  -> 401 otherwise
 *   2. event id never seen (replay protection, stored in the database)   -> 200, nothing done
 *   3. the invoice / payout is known                                     -> 200, nothing to credit
 * Valid events always get a 200 so Bitnob does not keep retrying them.
 * An event is only "seen" once it was applied: deliveries that found no resource yet (or whose amount did
 * not match) are logged but can be processed again, e.g. when the same event is re-sent from the dashboard.
 */

type Json = Record<string, unknown>;

export interface WebhookResult {
  status: number;
  body: Record<string, unknown>;
}

/** Collects every string/number found under the given keys, at any depth. */
export function collectValues(value: unknown, keys: string[], out: Set<string> = new Set(), depth = 0): Set<string> {
  if (depth > 6 || value === null || typeof value !== 'object') return out;
  if (Array.isArray(value)) {
    for (const v of value) collectValues(v, keys, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(value as Json)) {
    if (keys.includes(k) && (typeof v === 'string' || typeof v === 'number') && String(v)) out.add(String(v));
    else collectValues(v, keys, out, depth + 1);
  }
  return out;
}

export function extractEventType(payload: Json): string {
  const t = payload.event ?? payload.event_type ?? payload.type ?? payload.name;
  return typeof t === 'string' ? t : 'unknown';
}

/** Prefer an explicit event id; otherwise the hash of the raw body (a redelivery is byte-identical). */
export function extractEventId(payload: Json, rawBody: string): string {
  const explicit = payload.event_id ?? payload.eventId ?? (payload.data as Json | undefined)?.event_id;
  if (typeof explicit === 'string' && explicit) return explicit;
  return `body:${createHash('sha256').update(rawBody).digest('hex')}`;
}

/** Outcomes that do not consume the event id: the same event may be processed again later. */
const REPROCESSABLE = new Set(['unknown_invoice', 'unknown_payout', 'unknown_transfer', 'amount_mismatch']);

/** Amount fields seen or expected in payment events; their unit is not documented, see amountMatches. */
const AMOUNT_KEYS = ['amount', 'amount_sats', 'amountSats', 'sats', 'amount_msat', 'amount_msats', 'amountMsat', 'msats', 'amount_received'];

/**
 * True when `received` equals the expected invoice amount in satoshis, read as sats, millisats or BTC
 * (the real unit is confirmed in sandbox, task B0.5). Tolerance: 0.5 %, at least 1 sat.
 */
export function amountMatches(received: number, expectedSats: number): boolean {
  const tolerance = Math.max(1, Math.round(expectedSats * 0.005));
  return [received, received / 1000, received * 1e8].some((sats) => Math.abs(sats - expectedSats) <= tolerance);
}

/** 'unknown' when the event carries no amount we can read: we do not refuse a signed payment on a guess. */
export function checkReceivedAmount(payload: Json, expectedSats: number | undefined): 'ok' | 'mismatch' | 'unknown' {
  if (!expectedSats) return 'unknown';
  const received = [...collectValues(payload, AMOUNT_KEYS)].map(Number).filter((n) => Number.isFinite(n) && n > 0);
  if (received.length === 0) return 'unknown';
  // several amounts can appear (fees, totals...): the invoice amount must be one of them
  return received.some((n) => amountMatches(n, expectedSats)) ? 'ok' : 'mismatch';
}

interface Routed {
  outcome: string;
  note?: string;
}

const SUCCESS = /(success|succeeded|completed|complete|paid|settled|received)/;
const FAILURE = /(fail|expire|cancel|reject|declin)/;

/**
 * Which resource an event is about is decided by the identifiers in its content, not by its name: Bitnob may report an
 * incoming Lightning payment as `btc.lightning.received.success` or as a generic `transfer.success`, and a payout as
 * `payouts.withdrawal.success` or `transfer.success`. The name only says success or failure. Events named after a
 * payout (`payout`, `withdrawal`) are never matched against fundings.
 */
function route(db: Db, type: string, payload: Json): Routed {
  const t = type.toLowerCase();
  const failed = FAILURE.test(t);
  const succeeded = SUCCESS.test(t) && !failed;
  const payoutNamed = /payout|withdrawal/.test(t);
  const lightningNamed = /lightning|invoice/.test(t);
  const transferNamed = /transfer|deposit/.test(t);

  if (!payoutNamed && (lightningNamed || transferNamed)) {
    if (!succeeded) return { outcome: 'ignored' };
    const ids = collectValues(payload, ['id', 'invoice_id', 'payment_hash', 'paymentHash', 'reference']);
    const funding = db.fundings.find(
      (f) => ids.has(f.reference) || (f.invoiceId && ids.has(f.invoiceId)) || (f.paymentHash && ids.has(f.paymentHash)),
    );
    if (funding) {
      if (funding.status !== 'paid' && checkReceivedAmount(payload, funding.amountSats) === 'mismatch') {
        const received = [...collectValues(payload, AMOUNT_KEYS)].join(', ');
        console.warn(`[webhook] amount mismatch on ${funding.id}: expected ${funding.amountSats} sats, event carries ${received}`);
        return { outcome: 'amount_mismatch', note: `attendu ${funding.amountSats} sats, reçu ${received}` };
      }
      const preimage = [...collectValues(payload, ['preimage', 'payment_preimage'])][0];
      return { outcome: applyFundingPaid(db, funding, { preimage }) ? 'funding_paid' : 'funding_already_paid' };
    }
    if (lightningNamed) return { outcome: 'unknown_invoice' };
    // a generic transfer that is not one of our invoices may be one of our payouts: fall through
  }

  if (payoutNamed || transferNamed) {
    if (!succeeded && !failed) return { outcome: 'ignored' };
    const ids = collectValues(payload, ['id', 'payout_id', 'quote_id', 'reference']);
    for (const project of db.projects) {
      for (const step of project.steps) {
        const p = step.payout;
        if (!p) continue;
        const match = ids.has(p.reference) || (p.payoutId && ids.has(p.payoutId)) || ids.has(p.quoteId);
        if (!match) continue;
        if (succeeded) return { outcome: applyPayoutCompleted(db, project, step, { payoutId: [...collectValues(payload, ['payout_id'])][0] }) ? 'payout_completed' : 'payout_already_completed' };
        const reason = [...collectValues(payload, ['failure_reason', 'reason', 'message'])][0] ?? 'Paiement refusé par le réseau';
        return { outcome: applyPayoutFailed(db, project, step, reason) ? 'payout_failed' : 'payout_already_settled' };
      }
    }
    return { outcome: payoutNamed ? 'unknown_payout' : 'unknown_transfer' };
  }

  return { outcome: 'ignored' };
}

export async function handleBitnobWebhook(rawBody: string, signature: string | null | undefined): Promise<WebhookResult> {
  const { webhookSecret } = getConfig();
  if (!webhookSecret) {
    return { status: 503, body: { error: 'BITNOB_WEBHOOK_SECRET non configuré' } };
  }
  // 1. signature
  if (!verifyWebhookSignature({ secret: webhookSecret, rawBody, signature })) {
    return { status: 401, body: { error: 'Signature invalide' } };
  }
  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch {
    return { status: 400, body: { error: 'Corps JSON invalide' } };
  }
  const eventId = extractEventId(payload, rawBody);
  const type = extractEventType(payload);

  return withDb((db) => {
    // 2. replay protection: only an event that was applied (or is final) counts as seen
    const seen = db.webhooks.find((w) => w.eventId === eventId);
    if (seen && !REPROCESSABLE.has(seen.outcome)) {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    // 3. known resource, then apply
    const { outcome, note } = route(db, type, payload);
    const record = { eventId, type, at: new Date().toISOString(), outcome, ...(note ? { note } : {}) };
    if (seen) Object.assign(seen, record);
    else db.webhooks.push(record);
    if (db.webhooks.length > 500) db.webhooks.splice(0, db.webhooks.length - 500);
    return { status: 200, body: { received: true, outcome } };
  });
}
