import type { PayoutQuote, PayoutStatus, Supplier } from '@/lib/types';
import { getConfig } from '../config';
import { buildAuthHeaders } from './sign';
import {
  GatewayError,
  type Balances,
  type ConversionResult,
  type Gateway,
  type InvoiceInput,
  type InvoiceResult,
  type InvoiceStatus,
  type PayoutLookup,
  type PayoutStart,
  type PayoutStartInput,
} from './types';

/* ------------------------------------------------------------------------- *
 * Low-level HTTP: every request is signed (see sign.ts).
 * The API answers are not perfectly uniform across endpoints (`data` wrapper or not),
 * so the parsers below accept both shapes.
 * ------------------------------------------------------------------------- */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** One signed HTTP call, no retry. A fresh nonce and timestamp are generated each time, so a retry is never a replay. */
async function attemptRequest(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Json> {
  const cfg = getConfig();
  if (!cfg.clientId || !cfg.clientSecret) {
    throw new GatewayError('BITNOB_CLIENT_ID et BITNOB_CLIENT_SECRET sont requis en mode sandbox (voir .env.example).');
  }
  const payload = body === undefined ? '' : JSON.stringify(body);
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...buildAuthHeaders({ clientId: cfg.clientId, clientSecret: cfg.clientSecret, payload }),
  };
  if (payload) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}${path}`, {
      method,
      headers,
      body: payload || undefined,
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch (err) {
    throw new GatewayError(`Bitnob injoignable (${(err as Error).message}).`, undefined, undefined, 'network_error');
  }

  const text = await res.text();
  let json: Json = {};
  try {
    json = text ? (JSON.parse(text) as Json) : {};
  } catch {
    json = { raw: text };
  }
  if (!res.ok) {
    const code = typeof json.code === 'string' ? json.code : undefined;
    throw new GatewayError(friendlyError(res.status, json, method, path), res.status, json, code);
  }
  return json;
}

/**
 * Bitnob errors look like { type, title, status, detail, code, extensions }: `detail` carries the reason.
 * Known cases get a message the funder can act on; the raw body stays on GatewayError.body.
 */
export function friendlyError(status: number, json: Json, method: string, path: string): string {
  const detail = String(json.detail ?? json.message ?? json.error?.message ?? (typeof json.error === 'string' ? json.error : '') ?? '') || String(status);
  if (json.code === 'INSUFFICIENT_FUNDS') return "Solde insuffisant côté Bitnob pour ce paiement. Alimentez le portefeuille ou réessayez plus tard.";
  const max = /exceeds maximum of ([\d.]+) (\w+)/i.exec(detail);
  if (max) return `Ce montant dépasse la limite d'un paiement mobile money (${formatLimit(Number(max[1]))} ${max[2].toUpperCase()}). Réduisez le montant de l'étape.`;
  const min = /below minimum of ([\d.]+) (\w+)/i.exec(detail);
  if (min) return `Ce montant est inférieur au minimum d'un paiement mobile money (${formatLimit(Number(min[1]))} ${min[2].toUpperCase()}).`;
  if (status === 401 || status === 403) return `Bitnob a refusé l'authentification (${detail}). Vérifiez les clés et la liste d'adresses IP autorisées.`;
  return `Bitnob ${status} sur ${method} ${path} : ${detail}`;
}

const formatLimit = (n: number) => n.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ');

const unwrap = (json: Json): Json => (json && typeof json.data === 'object' && json.data !== null && !Array.isArray(json.data) ? json.data : json);

/* ------------------------------------------------------------------------- *
 * Retries. Only what is safe to repeat is repeated automatically:
 *  - GET always (reads change nothing);
 *  - POST only when the caller says so (`retry: true`): quotes, which are harmless to create twice;
 *  - 429 for any method: the request was refused BEFORE being processed, so it can be sent again.
 * Never for finalize, trading orders, initialize or invoice creation: an answer that got lost does not mean the
 * request was not processed, and repeating it could pay or sell twice. Those cases are handled by their callers
 * (see services.confirmRelease and attemptConversion).
 * ------------------------------------------------------------------------- */

export const RETRY = { attempts: 3, baseMs: 300, jitterMs: 200, deadlineMs: 30_000, maxRetryAfterMs: 5_000 };

let sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));
/** Tests replace the real wait. */
export function setSleepForTests(fn: ((ms: number) => Promise<void>) | null): void {
  sleep = fn ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
}

function retryDelay(attempt: number, err: GatewayError): number {
  const retryAfter = Number((err.body as Json | undefined)?.retry_after ?? 0) * 1000;
  const backoff = RETRY.baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * RETRY.jitterMs);
  return Math.min(Math.max(retryAfter, backoff), RETRY.maxRetryAfterMs);
}

async function request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, opts: { retry?: boolean } = {}): Promise<Json> {
  const started = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      return await attemptRequest(method, path, body);
    } catch (err) {
      const temporary = err instanceof GatewayError && (err.ambiguous || err.status === 429);
      const safeToRepeat = method === 'GET' || opts.retry === true || (err instanceof GatewayError && err.status === 429);
      const delay = err instanceof GatewayError ? retryDelay(attempt, err) : 0;
      if (!temporary || !safeToRepeat || attempt >= RETRY.attempts || Date.now() - started + delay > RETRY.deadlineMs) throw err;
      await sleep(delay);
    }
  }
}

/** Payout endpoints answer { data: { payout: {...} } }; older shapes had the object directly. */
const payoutOf = (json: Json): Json => (json?.data?.payout ?? json?.payout ?? unwrap(json)) as Json;

const pick = (obj: Json, ...keys: string[]): unknown => {
  for (const k of keys) if (obj?.[k] !== undefined && obj?.[k] !== null) return obj[k];
  return undefined;
};

/* ------------------------------------------------------------------------- *
 * Lightning
 * ------------------------------------------------------------------------- */

async function createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  const body: Json = { amount: input.amountSats, description: input.description, reference: input.reference };
  if (input.expirySeconds) body.expiry = input.expirySeconds;
  const d = unwrap(await request('POST', '/api/lightning/invoices', body));
  const bolt11 = String(pick(d, 'request', 'payment_request', 'bolt11', 'invoice') ?? '');
  const id = String(pick(d, 'id', 'invoice_id') ?? '');
  if (!bolt11 || !id) throw new GatewayError('Réponse Bitnob inattendue pour la création de facture Lightning.', undefined, d);
  const expiresAt = String(pick(d, 'expires_at', 'expiresAt') ?? new Date(Date.now() + (input.expirySeconds ?? 86_400) * 1000).toISOString());
  return { id, bolt11, paymentHash: pick(d, 'payment_hash', 'paymentHash') as string | undefined, expiresAt };
}

async function invoiceStatus(invoiceId: string): Promise<InvoiceStatus> {
  const d = unwrap(await request('GET', `/api/lightning/invoices/${encodeURIComponent(invoiceId)}`));
  const raw = String(pick(d, 'status') ?? '').toLowerCase();
  const preimage = pick(d, 'preimage') as string | undefined;
  const sats = Number(pick(d, 'amount_sat') ?? Number(pick(d, 'amount_msat')) / 1000);
  const amountSats = Number.isFinite(sats) && sats > 0 ? sats : undefined;
  if (/(paid|settled|complete|success)/.test(raw)) return { status: 'paid', preimage, amountSats };
  if (/(expire|cancel|fail)/.test(raw)) return { status: 'expired' };
  return { status: 'pending' };
}

/* ------------------------------------------------------------------------- *
 * Trading (BTC -> USDT) and prices
 * ------------------------------------------------------------------------- */

async function btcUsd(): Promise<number> {
  try {
    const res = await request('GET', '/api/trading/prices');
    const prices = (unwrap(res).prices ?? res.prices ?? []) as Json[];
    const p = prices.find((x) => x.base_currency === 'BTC' && (x.quote_currency === 'USDT' || x.quote_currency === 'USD'));
    const price = Number(p?.price);
    if (Number.isFinite(price) && price > 0) return price;
  } catch {
    /* fall back below */
  }
  return getConfig().btcUsd;
}

async function convertBtcToStable(input: { sats: number; reference: string }): Promise<ConversionResult> {
  const asset = getConfig().payoutAsset;
  try {
    // SELL BTC for the stablecoin; quantity is in BTC. The quote lives 5 minutes and its id goes into the order.
    const base = { base_currency: 'BTC', quote_currency: asset, side: 'sell', quantity: (input.sats / 1e8).toFixed(8) };
    const quote = (unwrap(await request('POST', '/api/trading/quotes', base, { retry: true })).quote ?? {}) as Json;
    const quoteId = String(pick(quote, 'id', 'quote_id') ?? '');
    if (!quoteId) throw new GatewayError('Devis de conversion sans identifiant.');
    const order = unwrap(await request('POST', '/api/trading/orders', { ...base, quote_id: quoteId, reference: input.reference }));
    const o = (order.order ?? order) as Json;
    return { status: 'done', detail: `Ordre ${String(pick(o, 'id') ?? '')} (${String(pick(o, 'status') ?? 'envoyé')})` };
  } catch (err) {
    if (err instanceof GatewayError) {
      // the reference is unique at the provider: a second order with it means the first one went through
      if (err.status === 409 || err.code === 'DUPLICATE_KEY_ERROR') return { status: 'done', detail: 'Ordre déjà enregistré chez Bitnob' };
      const body = JSON.stringify(err.body ?? '');
      const notCharged = /no funds were charged/i.test(body);
      const temporary = err.ambiguous || err.status === 429 || err.code === 'INSUFFICIENT_FUNDS';
      return { status: 'failed', retryable: temporary, uncertain: err.ambiguous && !notCharged, detail: err.message };
    }
    return { status: 'failed', retryable: false, detail: (err as Error).message };
  }
}

async function balances(): Promise<Balances> {
  const accounts = (unwrap(await request('GET', '/api/balances')).accounts ?? []) as Json[];
  const out: Balances = {};
  for (const a of accounts) {
    const n = Number(pick(a, 'available_balance'));
    if (typeof a.currency === 'string' && Number.isFinite(n)) out[a.currency.toUpperCase()] = n;
  }
  return out;
}

/** Orders carry the reference we gave them; looking one up by reference is not possible (the id must be a UUID), so list. */
async function findConversionByReference(reference: string): Promise<boolean> {
  const res = unwrap(await request('GET', '/api/trading/orders?limit=100'));
  const orders = (res.orders ?? res.items ?? []) as Json[];
  return orders.some((o) => o.reference === reference);
}

/* ------------------------------------------------------------------------- *
 * Payouts: quote -> initialize -> finalize
 * ------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, PayoutStatus> = {
  QUOTE: 'initiated', // a bare quote: nothing was finalized
  INITIATED: 'initiated',
  PENDING: 'pending',
  PROCESSING: 'pending',
  COMPLETED: 'completed',
  SUCCESS: 'completed',
  FAILED: 'failed',
  EXPIRED: 'failed',
};

function mapStatus(raw: unknown): PayoutStatus {
  return STATUS_MAP[String(raw ?? '').toUpperCase()] ?? 'pending';
}

async function quotePayout(input: { amountUsdCents: number; reference: string }): Promise<PayoutQuote> {
  const amount = (input.amountUsdCents / 100).toFixed(2);
  const d = payoutOf(
    await request(
      'POST',
      '/api/payouts/quotes',
      {
        amount,
        country: 'SN',
        from_asset: getConfig().payoutAsset,
        to_currency: 'XOF',
        source: 'offchain',
        payment_reason: 'vendor_payment',
        reference: input.reference,
      },
      { retry: true },
    ),
  );
  const quoteId = String(pick(d, 'quote_id') ?? '');
  if (!quoteId) throw new GatewayError('Réponse Bitnob inattendue pour le devis de paiement.', undefined, d);
  const usd = input.amountUsdCents / 100;
  const settlement = Number(pick(d, 'settlement_amount'));
  const fx = (pick(d, 'exchange_rate') as Json | undefined) ?? {};
  // effective_rate is what the supplier really gets per dollar (settlement / amount); `rate` is the raw market rate
  const rateFromApi = Number(fx.effective_rate ?? fx.rate);
  const rate = Number.isFinite(rateFromApi) && rateFromApi > 0 ? rateFromApi : Number.isFinite(settlement) && usd > 0 ? settlement / usd : getConfig().usdXof;
  const fees = Number(pick(d, 'fees') ?? 0); // in fee_currency (USD)
  return {
    quoteId,
    reference: input.reference,
    amountUsdCents: input.amountUsdCents,
    rate,
    feeUsdCents: Number.isFinite(fees) ? Math.round(fees * 100) : 0,
    amountFcfa: Number.isFinite(settlement) && settlement > 0 ? Math.round(settlement) : Math.round(usd * rate),
    expiresAt: String(pick(d, 'expires_at') ?? new Date(Date.now() + 60_000).toISOString()),
    mode: 'sandbox',
  };
}

/** Network codes accepted for Senegal mobile money (GET /api/payouts/supported-countries/SN also offers `expresso`). */
const NETWORK_LABEL: Record<Supplier['network'], string> = { wave: 'wave', orange_money: 'orange', free_money: 'free' };

/** Bitnob's own pattern for a Senegalese mobile number: 77 123 45 67, 771234567 or +221771234567. */
const SN_MOBILE = /^(\+?221[7]\d{8}|[7]\d{8})$/;

export function toSenegalNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9+]/g, '');
  if (!SN_MOBILE.test(cleaned)) {
    throw new GatewayError(`Numéro mobile money invalide : ${phone}. Indiquez un numéro sénégalais (ex. 77 123 45 67).`, 400, undefined, 'invalid_beneficiary');
  }
  return cleaned;
}

/** Fields required for SN mobile_money (read from /supported-countries/SN): account_name, account_number, network, sender{account_name,country}. */
export function buildBeneficiary(supplier: Supplier, sender: { name: string; country: string }): Json {
  return {
    destination_type: 'mobile_money',
    country: 'SN',
    account_name: supplier.name,
    account_number: toSenegalNumber(supplier.phone),
    network: NETWORK_LABEL[supplier.network],
    sender: { account_name: sender.name, country: sender.country },
  };
}

async function startPayout(input: PayoutStartInput): Promise<PayoutStart> {
  const beneficiary = buildBeneficiary(input.supplier, input.sender); // validates before any call
  const init = payoutOf(
    await request('POST', `/api/payouts/${encodeURIComponent(input.quote.quoteId)}/initialize`, {
      quote_id: input.quote.quoteId,
      reference: input.reference,
      payment_reason: input.reason,
      ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
      beneficiary,
    }),
  );
  // the payout id is the one returned by initialize (it is also the id of the quote's payout)
  const payoutId = String(pick(init, 'id', 'payout_id') ?? '') || undefined;
  let fin: Json;
  try {
    fin = payoutOf(await request('POST', `/api/payouts/${encodeURIComponent(input.quote.quoteId)}/finalize`));
  } catch (err) {
    // finalize is the step that debits. No answer (network, timeout) or a 5xx does NOT mean it failed: report it
    // as unconfirmed so the funds stay reserved until the payout status says what happened.
    if (err instanceof GatewayError && err.ambiguous) return { payoutId, status: 'pending', uncertain: true };
    throw err; // a 4xx (insufficient funds, validation...) is a definite refusal
  }
  return { payoutId: payoutId ?? (String(pick(fin, 'id', 'payout_id') ?? '') || undefined), status: mapStatus(pick(fin, 'status') ?? pick(init, 'status')) };
}

async function payoutStatus(payoutId: string): Promise<{ status: PayoutStatus; error?: string }> {
  const p = payoutOf(await request('GET', `/api/payouts/${encodeURIComponent(payoutId)}`));
  return { status: mapStatus(pick(p, 'status')), error: pick(p, 'failure_reason', 'error', 'message') as string | undefined };
}

/** Looks through the most recent payouts for our reference (a bare quote counts: it carries the reference too). */
async function findPayoutByReference(reference: string): Promise<PayoutLookup | null> {
  const res = await request('GET', '/api/payouts?limit=100');
  const items = (unwrap(res).items ?? []) as Json[];
  const found = items.find((p) => p.reference === reference);
  if (!found) return null;
  return { payoutId: String(found.id), status: mapStatus(found.status), error: pick(found, 'failure_reason', 'error', 'message') as string | undefined };
}

export const sandboxGateway: Gateway = {
  mode: 'sandbox',
  btcUsd,
  createInvoice,
  invoiceStatus,
  convertBtcToStable,
  quotePayout,
  startPayout,
  payoutStatus,
  findPayoutByReference,
  balances,
  findConversionByReference,
};
