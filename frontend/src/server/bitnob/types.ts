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
}

export interface ConversionResult {
  status: 'done' | 'skipped' | 'failed';
  detail?: string;
}

export interface PayoutStartInput {
  quote: PayoutQuote;
  reference: string;
  supplier: Supplier;
  reason: string;
  callbackUrl?: string;
}

export interface PayoutStart {
  payoutId?: string;
  status: PayoutStatus;
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
}

export class GatewayError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'GatewayError';
  }
}
