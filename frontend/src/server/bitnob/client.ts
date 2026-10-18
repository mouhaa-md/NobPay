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
    const msg = json.message || json.error?.message || json.error || res.statusText;
    throw new GatewayError(`Bitnob ${res.status} sur ${method} ${path} : ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`, res.status, json);
  }
  return json;
}

const unwrap = (json: Json): Json => (json && typeof json.data === 'object' && json.data !== null && !Array.isArray(json.data) ? json.data : json);

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
  const d = unwrap(
    await request('POST', '/api/payouts/quotes', {
      amount,
      country: 'SN',
      from_asset: 'USDT',
      to_currency: 'XOF',
      source: 'offchain',
      reference: input.reference,
    }),
  );
  const quoteId = String(pick(d, 'quote_id', 'id') ?? '');
  if (!quoteId) throw new GatewayError('Réponse Bitnob inattendue pour le devis de paiement.', undefined, d);
  const settlement = Number(pick(d, 'settlement_amount'));
  const rateFromApi = Number((pick(d, 'exchange_rate') as Json | undefined)?.rate ?? pick(d, 'rate'));
  const usd = input.amountUsdCents / 100;
  const rate = Number.isFinite(rateFromApi) && rateFromApi > 0 ? rateFromApi : Number.isFinite(settlement) && usd > 0 ? settlement / usd : getConfig().usdXof;
  const fees = Number(pick(d, 'fees') ?? 0);
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

const NETWORK_LABEL: Record<Supplier['network'], string> = { wave: 'wave', orange_money: 'orange', free_money: 'free' };

function toLocalPhone(phone: string): string {
  return phone.replace(/[^0-9+]/g, '');
}

/**
 * The exact beneficiary keys depend on the country: the API publishes them at
 * /api/payouts/supported-countries/:code. We read that list and fill what we can.
 */
async function buildBeneficiary(supplier: Supplier): Promise<Json> {
  const base: Json = {
    destination_type: 'mobile_money',
    country: 'SN',
    account_name: supplier.name,
    account_number: toLocalPhone(supplier.phone),
    network: NETWORK_LABEL[supplier.network],
  };
  try {
    const details = unwrap(await request('GET', '/api/payouts/supported-countries/SN'));
    const fields = (details.fields ?? []) as unknown[];
    const names = fields
      .map((f) => (typeof f === 'string' ? f : String((f as Json)?.name ?? (f as Json)?.key ?? (f as Json)?.field ?? '')))
      .filter(Boolean);
    for (const name of names) {
      if (base[name] !== undefined) continue;
      if (/phone|msisdn|mobile/i.test(name)) base[name] = toLocalPhone(supplier.phone);
      else if (/holder|owner|beneficiary_name|full_name/i.test(name)) base[name] = supplier.name;
    }
  } catch {
    /* use the base keys; the API will tell us what is missing */
  }
  return base;
}

async function startPayout(input: PayoutStartInput): Promise<PayoutStart> {
  const beneficiary = await buildBeneficiary(input.supplier);
  const init = await request('POST', `/api/payouts/${encodeURIComponent(input.quote.quoteId)}/initialize`, {
    quote_id: input.quote.quoteId,
    reference: input.reference,
    payment_reason: input.reason,
    ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
    beneficiary,
  });
  const initPayout = (init.payout ?? unwrap(init)) as Json;
  const fin = await request('POST', `/api/payouts/${encodeURIComponent(input.quote.quoteId)}/finalize`);
  const finPayout = (fin.payout ?? unwrap(fin)) as Json;
  const payoutId = String(pick(finPayout, 'id', 'payout_id') ?? pick(initPayout, 'id', 'payout_id') ?? '') || undefined;
  return { payoutId, status: mapStatus(pick(finPayout, 'status') ?? pick(initPayout, 'status')) };
}

async function payoutStatus(payoutId: string): Promise<{ status: PayoutStatus; error?: string }> {
  const res = await request('GET', `/api/payouts/${encodeURIComponent(payoutId)}`);
  const p = (res.payout ?? unwrap(res)) as Json;
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
