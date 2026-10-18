import type { PayoutQuote, PayoutStatus, Supplier } from '@/lib/types';
import { getConfig } from '../config';
import { buildAuthHeaders } from './sign';
import {
  GatewayError,
  type ConversionResult,
  type Gateway,
  type InvoiceInput,
  type InvoiceResult,
  type InvoiceStatus,
  type PayoutStart,
  type PayoutStartInput,
} from './types';

/* ------------------------------------------------------------------------- *
 * Low-level HTTP: every request is signed (see sign.ts).
 * The API answers are not perfectly uniform across endpoints (`data` wrapper or not),
 * so the parsers below accept both shapes.
 * ------------------------------------------------------------------------- */

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function request(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<Json> {
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
    throw new GatewayError(`Bitnob injoignable (${(err as Error).message}).`);
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
  if (/(paid|settled|complete|success)/.test(raw)) return { status: 'paid', preimage };
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
  try {
    const quantity = (input.sats / 1e8).toFixed(8);
    const base = { base_currency: 'BTC', quote_currency: 'USDT', side: 'sell', quantity };
    const q = unwrap(await request('POST', '/api/trading/quotes', base));
    const price = String(pick(q, 'price') ?? '');
    const quoteId = String(pick(q, 'id') ?? '');
    if (!price) throw new GatewayError('Devis de conversion sans prix.');
    const order = unwrap(await request('POST', '/api/trading/orders', { ...base, price, quote_id: quoteId || undefined, reference: input.reference }));
    return { status: 'done', detail: `Ordre ${String(pick(order, 'id') ?? '')} (${String(pick(order, 'status') ?? 'envoyé')})` };
  } catch (err) {
    return { status: 'failed', detail: (err as Error).message };
  }
}

/* ------------------------------------------------------------------------- *
 * Payouts: quote -> initialize -> finalize
 * ------------------------------------------------------------------------- */

const STATUS_MAP: Record<string, PayoutStatus> = {
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
    await request('POST', '/api/payouts/quotes', {
      amount,
      country: 'SN',
      from_asset: 'USDT',
      to_currency: 'XOF',
      source: 'offchain',
      payment_reason: 'vendor_payment',
      reference: input.reference,
    }),
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
  const fin = payoutOf(await request('POST', `/api/payouts/${encodeURIComponent(input.quote.quoteId)}/finalize`));
  // the payout id is the one returned by initialize (it is also the id of the quote's payout)
  const payoutId = String(pick(init, 'id', 'payout_id') ?? pick(fin, 'id', 'payout_id') ?? '') || undefined;
  return { payoutId, status: mapStatus(pick(fin, 'status') ?? pick(init, 'status')) };
}

async function payoutStatus(payoutId: string): Promise<{ status: PayoutStatus; error?: string }> {
  const p = payoutOf(await request('GET', `/api/payouts/${encodeURIComponent(payoutId)}`));
  return { status: mapStatus(pick(p, 'status')), error: pick(p, 'failure_reason', 'error', 'message') as string | undefined };
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
};
