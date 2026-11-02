import { bech32 } from '@scure/base';

/**
 * A small BOLT11 invoice reader. It checks what NobPay must check before it pays or credits anything: the network,
 * the amount, the payment hash, the expiry and the description hash (LUD-06 makes that hash the proof that an invoice
 * really belongs to the LNURL metadata it was requested with). It does not verify the signature: the wallet does.
 */

export type InvoiceNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest';

export interface DecodedBolt11 {
  network: InvoiceNetwork;
  /** undefined for an amountless invoice */
  amountMsat?: bigint;
  /** seconds since epoch */
  timestamp: number;
  expirySeconds: number;
  /** ms since epoch */
  expiresAtMs: number;
  /** hex */
  paymentHash: string;
  description?: string;
  /** hex, the sha256 of the LNURL metadata when the invoice answers an LNURL-pay request */
  descriptionHash?: string;
}

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const NETWORKS: Record<string, InvoiceNetwork> = { bc: 'mainnet', tb: 'testnet', tbs: 'signet', bcrt: 'regtest' };
/** picoBTC per unit of the HRP amount multiplier (1 BTC = 10^12 pico, 1 msat = 10 pico) */
const MULTIPLIER_PICO: Record<string, bigint> = { m: 1_000_000_000n, u: 1_000_000n, n: 1_000n, p: 1n };
const SIGNATURE_WORDS = 104;

const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const wordsToNumber = (w: number[]) => w.reduce((acc, x) => acc * 32 + x, 0);

export class InvoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvoiceError';
  }
}

export function decodeBolt11(invoice: string): DecodedBolt11 {
  const text = invoice.trim().toLowerCase().replace(/^lightning:/, '');
  let decoded: { prefix: string; words: number[] };
  try {
    decoded = bech32.decode(text as `${string}1${string}`, 8192);
  } catch {
    throw new InvoiceError('Facture Lightning illisible.');
  }
  const hrp = /^ln(bcrt|bc|tbs|tb)(\d*)([munp]?)$/.exec(decoded.prefix);
  if (!hrp) throw new InvoiceError('Facture Lightning inconnue.');
  const network = NETWORKS[hrp[1]];

  let amountMsat: bigint | undefined;
  if (hrp[2]) {
    if (hrp[2].length > 1 && hrp[2].startsWith('0')) throw new InvoiceError('Montant de facture invalide.');
    const digits = BigInt(hrp[2]);
    const pico = hrp[3] ? digits * MULTIPLIER_PICO[hrp[3]] : digits * 1_000_000_000_000n;
    if (pico % 10n !== 0n) throw new InvoiceError('Montant de facture invalide (fraction de millisatoshi).');
    amountMsat = pico / 10n;
  } else if (hrp[3]) {
    throw new InvoiceError('Montant de facture invalide.');
  }

  const words = decoded.words;
  if (words.length < 7 + SIGNATURE_WORDS) throw new InvoiceError('Facture Lightning trop courte.');
  const timestamp = wordsToNumber(words.slice(0, 7));
  const data = words.slice(7, words.length - SIGNATURE_WORDS);

  let expirySeconds = 3600;
  let paymentHash: string | undefined;
  let description: string | undefined;
  let descriptionHash: string | undefined;
  for (let i = 0; i < data.length; ) {
    if (i + 3 > data.length) throw new InvoiceError('Facture Lightning tronquée.');
    const tag = CHARSET[data[i]];
    const length = data[i + 1] * 32 + data[i + 2];
    const payload = data.slice(i + 3, i + 3 + length);
    if (payload.length !== length) throw new InvoiceError('Facture Lightning tronquée.');
    i += 3 + length;
    if (tag === 'p' || tag === 'h') {
      if (length !== 52) throw new InvoiceError('Facture Lightning invalide (empreinte).');
      const bytes = bech32.fromWordsUnsafe(payload);
      if (!bytes || bytes.length !== 32) throw new InvoiceError('Facture Lightning invalide (empreinte).');
      if (tag === 'p') paymentHash = hex(bytes);
      else descriptionHash = hex(bytes);
    } else if (tag === 'd') {
      const bytes = bech32.fromWordsUnsafe(payload);
      if (bytes) description = new TextDecoder().decode(bytes);
    } else if (tag === 'x') {
      expirySeconds = wordsToNumber(payload);
    }
  }
  if (!paymentHash) throw new InvoiceError('Facture Lightning sans empreinte de paiement.');
  return { network, amountMsat, timestamp, expirySeconds, expiresAtMs: (timestamp + expirySeconds) * 1000, paymentHash, description, descriptionHash };
}

/** Sats of an invoice amount in millisatoshis, or null when the amount is not a whole number of sats. */
export const wholeSats = (amountMsat: bigint | undefined): number | null =>
  amountMsat === undefined || amountMsat % 1000n !== 0n ? null : Number(amountMsat / 1000n);
