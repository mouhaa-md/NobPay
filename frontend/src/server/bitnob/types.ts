import type { GatewayMode, PayoutQuote, PayoutStatus, Supplier } from '@/lib/types';

export interface InvoiceInput {
  amountSats: number;
  description: string;
  reference: string;
  expirySeconds?: number;
}

export interface InvoiceResult {
  id: string;
  bolt11: string;
  paymentHash?: string;
  expiresAt: string;
}

export interface InvoiceStatus {
  status: 'pending' | 'paid' | 'expired';
  preimage?: string;
  /** the invoice amount as Bitnob reports it, in satoshis */
  amountSats?: number;
}

export interface ConversionResult {
  status: 'done' | 'skipped' | 'failed';
  detail?: string;
}

export interface PayoutStartInput {
  quote: PayoutQuote;
  reference: string;
  supplier: Supplier;
  /** who sends the money (the funder): Bitnob requires it for Senegal mobile money */
  sender: { name: string; country: string };
  reason: string;
  callbackUrl?: string;
}

export interface PayoutStart {
  payoutId?: string;
  status: PayoutStatus;
  /** `finalize` was sent but its outcome is unknown (network cut, timeout, 5xx): the debit may have happened */
  uncertain?: boolean;
}

export interface PayoutLookup {
  payoutId: string;
  status: PayoutStatus;
  error?: string;
}

/** What the rest of the app needs from a payment gateway. Two implementations: Bitnob sandbox and a local mock. */
export interface Gateway {
  mode: GatewayMode;
  btcUsd(): Promise<number>;
  createInvoice(input: InvoiceInput): Promise<InvoiceResult>;
  invoiceStatus(invoiceId: string): Promise<InvoiceStatus>;
  convertBtcToStable(input: { sats: number; reference: string }): Promise<ConversionResult>;
  quotePayout(input: { amountUsdCents: number; reference: string }): Promise<PayoutQuote>;
  startPayout(input: PayoutStartInput): Promise<PayoutStart>;
  payoutStatus(payoutId: string): Promise<{ status: PayoutStatus; error?: string }>;
  /** Finds a payout (even a bare quote) by the reference we gave it, or null when Bitnob does not know it. */
  findPayoutByReference(reference: string): Promise<PayoutLookup | null>;
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
    /** Bitnob error code (e.g. INSUFFICIENT_FUNDS, VALIDATION_ERROR) when the API sent one */
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'GatewayError';
  }

  /** The request may or may not have been processed: no answer (network, timeout) or a server-side error. */
  get ambiguous(): boolean {
    return this.code === 'network_error' || (this.status !== undefined && this.status >= 500);
  }
}
