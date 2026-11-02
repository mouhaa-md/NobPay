/**
 * What NobPay needs from a Lightning wallet, whatever is behind it (a Nostr Wallet Connect wallet today, any other tomorrow).
 * Amounts are whole satoshis here; the wallet protocols speak millisatoshis and the adapters convert.
 */

export type WalletNetwork = 'mainnet' | 'testnet' | 'signet' | 'regtest' | 'unknown';

export type WalletErrorCode =
  | 'insufficient_balance'
  | 'payment_failed'
  | 'not_found'
  | 'rate_limited'
  | 'quota_exceeded'
  | 'restricted'
  | 'unauthorized'
  | 'unsupported'
  | 'timeout'
  | 'network'
  | 'internal';

export class WalletError extends Error {
  constructor(
    message: string,
    public readonly code: WalletErrorCode,
    /** the request may or may not have been processed: do not conclude it failed, look the payment up */
    public readonly ambiguous = false,
  ) {
    super(message);
    this.name = 'WalletError';
  }
}

export interface WalletInvoice {
  bolt11: string;
  paymentHash: string;
  amountSats: number;
  /** ISO date */
  expiresAt: string;
}

export type WalletTxState = 'pending' | 'settled' | 'failed' | 'expired';

export interface WalletTx {
  direction: 'incoming' | 'outgoing';
  state: WalletTxState;
  paymentHash: string;
  amountSats: number;
  feesSats: number;
  /** present once settled */
  preimage?: string;
  settledAt?: string;
}

export interface LightningWallet {
  readonly kind: string;
  info(): Promise<{ network: WalletNetwork; alias?: string; /** the wallet's node key: two connections with the same key are one wallet */ pubkey?: string; methods: string[] }>;
  balanceSats(): Promise<number>;
  makeInvoice(input: { amountSats: number; description: string; expirySeconds: number }): Promise<WalletInvoice>;
  /** null when the wallet knows no payment with this hash */
  lookup(paymentHash: string): Promise<WalletTx | null>;
  /** Pays an invoice. Resolves only with a valid proof of payment (the preimage of the invoice's payment hash). */
  pay(bolt11: string): Promise<{ preimage: string; feesSats: number }>;
  close?(): void;
}
