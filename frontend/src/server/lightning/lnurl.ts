import { createHash } from 'node:crypto';
import { decodeBolt11, InvoiceError, type InvoiceNetwork } from './bolt11';
import { parsePublicHttpsUrl, safeGetJson, UnsafeUrlError } from './safeFetch';

/**
 * Pays "someone@domain": the LNURL-pay protocol (LUD-06) behind a Lightning address (LUD-16). We ask the domain for an
 * invoice of EXACTLY the amount we decided, then check the invoice ourselves before any money moves: network, amount,
 * payment hash, expiry, and the description hash that ties it to the metadata the domain announced. A server that
 * answers with another amount, another network or a forged description gets nothing.
 */

export class LnurlError extends Error {
  constructor(
    message: string,
    public readonly code: 'bad_address' | 'unreachable' | 'bad_answer' | 'out_of_range' | 'refused' | 'wrong_invoice' | 'unsafe',
  ) {
    super(message);
    this.name = 'LnurlError';
  }
}

/** LUD-16: lowercase letters, digits, "-", "_" and "." before the "@"; a real domain name after it. */
export const LIGHTNING_ADDRESS = /^[a-z0-9._-]{1,64}@([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/;

export function normalizeLightningAddress(raw: string): string | null {
  const address = String(raw ?? '').trim().toLowerCase().replace(/^lightning:/, '');
  return LIGHTNING_ADDRESS.test(address) && address.length <= 128 ? address : null;
}

export type FetchJson = (url: string) => Promise<unknown>;

export interface LnurlInvoice {
  bolt11: string;
  paymentHash: string;
  amountSats: number;
  /** ISO date */
  expiresAt: string;
  address: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Asks `address` for an invoice of `amountSats`, and verifies it. */
export async function requestInvoice(
  rawAddress: string,
  amountSats: number,
  ctx: { network: InvoiceNetwork; fetchJson?: FetchJson; now?: () => number },
): Promise<LnurlInvoice> {
  const address = normalizeLightningAddress(rawAddress);
  if (!address) throw new LnurlError('Adresse Lightning invalide (exemple : nom@domaine.com).', 'bad_address');
  if (!Number.isSafeInteger(amountSats) || amountSats < 1) throw new LnurlError('Montant invalide.', 'out_of_range');
  const fetchJson = ctx.fetchJson ?? ((url: string) => safeGetJson(url));
  const now = ctx.now ?? Date.now;
  const [user, domain] = address.split('@');
  const amountMsat = BigInt(amountSats) * 1000n;

  const get = async (url: string): Promise<Record<string, unknown>> => {
    let json: unknown;
    try {
      json = await fetchJson(url);
    } catch (err) {
      if (err instanceof UnsafeUrlError) throw new LnurlError('Cette adresse Lightning n’est pas accessible de façon sûre.', 'unsafe');
      throw new LnurlError('Le fournisseur Lightning ne répond pas. Vérifiez l’adresse ou réessayez.', 'unreachable');
    }
    if (!isObject(json)) throw new LnurlError('Réponse inattendue du fournisseur Lightning.', 'bad_answer');
    if (json.status === 'ERROR') {
      throw new LnurlError(`Le fournisseur Lightning refuse : ${String(json.reason ?? 'raison inconnue').slice(0, 120)}`, 'refused');
    }
    return json;
  };

  // 1. what the domain announces
  const pay = await get(`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`);
  if (pay.tag !== 'payRequest' || typeof pay.callback !== 'string' || typeof pay.metadata !== 'string') {
    throw new LnurlError('Cette adresse n’accepte pas les paiements Lightning (réponse inattendue).', 'bad_answer');
  }
  const min = Number(pay.minSendable);
  const max = Number(pay.maxSendable);
  if (!Number.isFinite(min) || !Number.isFinite(max) || amountMsat < BigInt(Math.ceil(min)) || amountMsat > BigInt(Math.floor(max))) {
    throw new LnurlError(
      `Cette adresse n’accepte que des paiements de ${Math.ceil(min / 1000)} à ${Math.floor(max / 1000)} sats (ici : ${amountSats}).`,
      'out_of_range',
    );
  }
  const metadata = pay.metadata;
  try {
    const entries = JSON.parse(metadata) as unknown;
    if (!Array.isArray(entries)) throw new Error('not a list');
    // LUD-16: when the domain names the identifier, it must be the one we were given
    const named = entries.find((e) => Array.isArray(e) && (e[0] === 'text/identifier' || e[0] === 'text/email'));
    if (named && String(named[1]).toLowerCase() !== address) throw new LnurlError('Cette adresse Lightning ne correspond pas à celle annoncée par le fournisseur.', 'bad_answer');
  } catch (err) {
    if (err instanceof LnurlError) throw err;
    throw new LnurlError('Réponse inattendue du fournisseur Lightning (métadonnées).', 'bad_answer');
  }

  // 2. the invoice, for exactly our amount
  let callback: URL;
  try {
    callback = parsePublicHttpsUrl(pay.callback);
  } catch {
    throw new LnurlError('Cette adresse Lightning n’est pas accessible de façon sûre.', 'unsafe');
  }
  callback.searchParams.set('amount', amountMsat.toString());
  const answer = await get(callback.toString());
  if (typeof answer.pr !== 'string') throw new LnurlError('Le fournisseur Lightning n’a pas renvoyé de facture.', 'bad_answer');

  // 3. do not trust it: read it
  let invoice;
  try {
    invoice = decodeBolt11(answer.pr);
  } catch (err) {
    throw new LnurlError(err instanceof InvoiceError ? 'La facture reçue est illisible.' : 'La facture reçue est invalide.', 'wrong_invoice');
  }
  if (invoice.network !== ctx.network) throw new LnurlError('La facture reçue est sur un autre réseau Bitcoin : paiement refusé.', 'wrong_invoice');
  if (invoice.amountMsat !== amountMsat) throw new LnurlError('La facture reçue ne correspond pas au montant demandé : paiement refusé.', 'wrong_invoice');
  const expected = createHash('sha256').update(metadata, 'utf8').digest('hex');
  if (invoice.descriptionHash !== expected) throw new LnurlError('La facture reçue ne correspond pas à l’adresse demandée : paiement refusé.', 'wrong_invoice');
  if (invoice.expiresAtMs - now() < 60_000) throw new LnurlError('La facture reçue expire trop tôt. Réessayez.', 'wrong_invoice');

  return { bolt11: answer.pr.trim(), paymentHash: invoice.paymentHash, amountSats, expiresAt: new Date(invoice.expiresAtMs).toISOString(), address };
}
