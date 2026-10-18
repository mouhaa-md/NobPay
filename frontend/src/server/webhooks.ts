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

const SUCCESS = /(success|succeeded|completed|complete|paid|settled|received)/;
const FAILURE = /(fail|expire|cancel|reject|declin)/;

function route(db: Db, type: string, payload: Json): string {
  const t = type.toLowerCase();
  const failed = FAILURE.test(t);
  const succeeded = SUCCESS.test(t) && !failed;

  if (/lightning|invoice/.test(t)) {
    if (!succeeded) return 'ignored';
    const ids = collectValues(payload, ['id', 'invoice_id', 'payment_hash', 'paymentHash', 'reference']);
    const funding = db.fundings.find(
      (f) => ids.has(f.reference) || (f.invoiceId && ids.has(f.invoiceId)) || (f.paymentHash && ids.has(f.paymentHash)),
    );
    if (!funding) return 'unknown_invoice';
    const preimage = [...collectValues(payload, ['preimage', 'payment_preimage'])][0];
    return applyFundingPaid(db, funding, { preimage }) ? 'funding_paid' : 'funding_already_paid';
  }

  if (/payout|withdrawal|transfer/.test(t)) {
    if (!succeeded && !failed) return 'ignored';
    const ids = collectValues(payload, ['id', 'payout_id', 'quote_id', 'reference']);
    for (const project of db.projects) {
      for (const step of project.steps) {
        const p = step.payout;
        if (!p) continue;
        const match = ids.has(p.reference) || (p.payoutId && ids.has(p.payoutId)) || ids.has(p.quoteId);
        if (!match) continue;
        if (succeeded) return applyPayoutCompleted(db, project, step, { payoutId: [...collectValues(payload, ['payout_id'])][0] }) ? 'payout_completed' : 'payout_already_completed';
        const reason = [...collectValues(payload, ['failure_reason', 'reason', 'message'])][0] ?? 'Paiement refusé par le réseau';
        return applyPayoutFailed(db, project, step, reason) ? 'payout_failed' : 'payout_already_settled';
      }
    }
    return 'unknown_payout';
  }

  return 'ignored';
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
    // 2. replay protection
    if (db.webhooks.some((w) => w.eventId === eventId)) {
      return { status: 200, body: { received: true, duplicate: true } };
    }
    // 3. known resource, then apply
    const outcome = route(db, type, payload);
    db.webhooks.push({ eventId, type, at: new Date().toISOString(), outcome });
    if (db.webhooks.length > 500) db.webhooks.splice(0, db.webhooks.length - 500);
    return { status: 200, body: { received: true, outcome } };
  });
}
