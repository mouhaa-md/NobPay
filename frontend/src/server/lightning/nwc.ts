import { createHash } from 'node:crypto';
import {
  NWCClient,
  Nip47PublishError,
  Nip47PublishTimeoutError,
  Nip47TimeoutError,
  Nip47NetworkError,
  Nip47WalletError,
  type Nip47Transaction,
} from '@getalby/sdk/nwc';
import { scrub } from '../logger';
import { decodeBolt11 } from './bolt11';
import { WalletError, type LightningWallet, type WalletNetwork, type WalletTx } from './wallet';

/**
 * A Lightning wallet reached with Nostr Wallet Connect (NIP-47): the wallet runs anywhere (Alby Hub, a node, a
 * custodian that speaks NWC), NobPay only holds a connection string whose rights the wallet owner chose. The protocol
 * counts in millisatoshis; this adapter counts in satoshis. Whatever the wallet answers is checked before it is believed:
 * an invoice must be for the amount asked, a payment is only accepted with a preimage that hashes to the invoice.
 */

const sha256Hex = (hexBytes: string) => createHash('sha256').update(Buffer.from(hexBytes, 'hex')).digest('hex');
const isoFromSeconds = (s: number) => new Date(s * 1000).toISOString();

function networkOf(raw: string | undefined): WalletNetwork {
  const n = (raw ?? '').toLowerCase();
  if (n === 'mainnet' || n === 'bitcoin' || n === 'main') return 'mainnet';
  if (n === 'testnet' || n === 'testnet3' || n === 'testnet4') return 'testnet';
  if (n === 'signet') return 'signet';
  if (n === 'regtest') return 'regtest';
  return 'unknown';
}

/** Turns whatever the SDK throws into a WalletError that says whether the request may have been processed. */
export function mapWalletError(err: unknown, forPayment: boolean): WalletError {
  if (err instanceof WalletError) return err;
  if (err instanceof Nip47WalletError) {
    switch (err.code) {
      case 'INSUFFICIENT_BALANCE':
        return new WalletError('Le portefeuille Lightning n’a pas assez de fonds.', 'insufficient_balance');
      case 'PAYMENT_FAILED':
        return new WalletError('Le paiement Lightning a échoué (aucune route, destinataire injoignable ou refus).', 'payment_failed');
      case 'NOT_FOUND':
        return new WalletError('Paiement introuvable dans le portefeuille.', 'not_found');
      case 'RATE_LIMITED':
        return new WalletError('Le portefeuille limite le nombre de requêtes : réessayez dans un instant.', 'rate_limited');
      case 'QUOTA_EXCEEDED':
        return new WalletError('Le plafond de dépense de la connexion au portefeuille est atteint.', 'quota_exceeded');
      case 'RESTRICTED':
        return new WalletError('La connexion au portefeuille n’a pas le droit de faire cette opération.', 'restricted');
      case 'UNAUTHORIZED':
        return new WalletError('Le portefeuille refuse cette connexion (révoquée ou expirée).', 'unauthorized');
      case 'NOT_IMPLEMENTED':
        return new WalletError('Ce portefeuille ne sait pas faire cette opération.', 'unsupported');
      default:
        // INTERNAL / OTHER: the wallet may have started the payment before failing
        return new WalletError(`Le portefeuille a répondu par une erreur (${err.code}).`, 'internal', forPayment);
    }
  }
  // the request never reached any relay: nothing was processed
  if (err instanceof Nip47PublishError) return new WalletError('Aucun relais n’a accepté la requête vers le portefeuille.', 'network');
  if (err instanceof Nip47PublishTimeoutError || err instanceof Nip47TimeoutError) {
    return new WalletError('Le portefeuille Lightning ne répond pas.', 'timeout', forPayment);
  }
  if (err instanceof Nip47NetworkError) return new WalletError('Connexion au portefeuille Lightning impossible.', 'network');
  // Never the library's own text to a user: some libraries repeat the connection string, which holds the spending secret
  // (the SDK's "Invalid URL: …" does). It goes to the logs, scrubbed, and nowhere else.
  return new WalletError('Le portefeuille Lightning a répondu de façon inattendue.', 'internal', forPayment, err instanceof Error ? scrub(err.message) : undefined);
}

function toTx(tx: Nip47Transaction, nowMs: number): WalletTx {
  const raw = String(tx.state ?? '');
  let state: WalletTx['state'];
  if (raw === 'settled') state = 'settled';
  else if (raw === 'failed') state = 'failed';
  else if (raw === 'expired') state = 'expired';
  else state = tx.type === 'incoming' && tx.expires_at && tx.expires_at * 1000 < nowMs ? 'expired' : 'pending';
  return {
    direction: tx.type,
    state,
    paymentHash: tx.payment_hash,
    amountSats: Math.floor((tx.amount ?? 0) / 1000),
    feesSats: Math.ceil((tx.fees_paid ?? 0) / 1000),
    preimage: tx.preimage || undefined,
    settledAt: tx.settled_at ? isoFromSeconds(tx.settled_at) : undefined,
  };
}

export function nwcWallet(connectionUrl: string, deps: { client?: NWCClient; now?: () => number } = {}): LightningWallet {
  let client = deps.client;
  const now = deps.now ?? Date.now;
  const c = () => (client ??= new NWCClient({ nostrWalletConnectUrl: connectionUrl }));

  return {
    kind: 'nwc',

    async info() {
      try {
        const i = await c().getInfo();
        return { network: networkOf(i.network), alias: i.alias || undefined, pubkey: i.pubkey || undefined, methods: i.methods ?? [] };
      } catch (err) {
        throw mapWalletError(err, false);
      }
    },

    async balanceSats() {
      try {
        return Math.floor((await c().getBalance()).balance / 1000);
      } catch (err) {
        throw mapWalletError(err, false);
      }
    },

    async makeInvoice({ amountSats, description, expirySeconds }) {
      let tx: Nip47Transaction;
      try {
        tx = await c().makeInvoice({ amount: amountSats * 1000, description, expiry: expirySeconds });
      } catch (err) {
        throw mapWalletError(err, false);
      }
      const decoded = decodeBolt11(tx.invoice);
      if (decoded.amountMsat !== BigInt(amountSats) * 1000n) {
        throw new WalletError('Le portefeuille a créé une facture d’un autre montant : elle est refusée.', 'internal');
      }
      if (tx.payment_hash && tx.payment_hash.toLowerCase() !== decoded.paymentHash) {
        throw new WalletError('Le portefeuille a renvoyé une facture incohérente : elle est refusée.', 'internal');
      }
      return { bolt11: tx.invoice, paymentHash: decoded.paymentHash, amountSats, expiresAt: new Date(decoded.expiresAtMs).toISOString() };
    },

    async lookup(paymentHash) {
      try {
        return toTx(await c().lookupInvoice({ payment_hash: paymentHash }), now());
      } catch (err) {
        if (err instanceof Nip47WalletError && err.code === 'NOT_FOUND') return null;
        throw mapWalletError(err, false);
      }
    },

    async pay(bolt11) {
      const decoded = decodeBolt11(bolt11);
      let res: { preimage: string; fees_paid?: number };
      try {
        res = await c().payInvoice({ invoice: bolt11 });
      } catch (err) {
        throw mapWalletError(err, true);
      }
      // The only acceptable proof of a Lightning payment: a preimage that hashes to the invoice. Anything else and we
      // do not say "paid": the caller looks the payment up instead.
      if (!/^[0-9a-f]{64}$/i.test(res.preimage ?? '') || sha256Hex(res.preimage) !== decoded.paymentHash) {
        throw new WalletError('Le portefeuille n’a pas fourni de preuve de paiement valable.', 'internal', true);
      }
      return { preimage: res.preimage.toLowerCase(), feesSats: Math.ceil((res.fees_paid ?? 0) / 1000) };
    },

    close() {
      client?.close();
    },
  };
}
