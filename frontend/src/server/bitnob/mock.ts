import { createHash } from 'node:crypto';
import type { PayoutQuote } from '@/lib/types';
import { getConfig } from '../config';
import { hmacHex, randomId, randomToken } from '../crypto';
import type { ConversionResult, Gateway, InvoiceInput, InvoiceResult, InvoiceStatus, PayoutStart, PayoutStartInput } from './types';

/**
 * Local simulation of the Bitnob gateway. Nothing here talks to the network.
 * Invoices are NOT payable Lightning invoices: they are clearly marked `lndemo`.
 */

/** Deterministic preimage per reference, so the simulator can "reveal" it when the invoice is paid. */
export function mockPreimage(reference: string): string {
  return hmacHex('sha256', getConfig().sessionSecret, `preimage:${reference}`);
}

export function mockPaymentHash(reference: string): string {
  return createHash('sha256').update(Buffer.from(mockPreimage(reference), 'hex')).digest('hex');
}

async function createInvoice(input: InvoiceInput): Promise<InvoiceResult> {
  return {
    id: randomId('mockinv'),
    bolt11: `lndemo1${randomToken(48)}`,
    paymentHash: mockPaymentHash(input.reference),
    expiresAt: new Date(Date.now() + (input.expirySeconds ?? 86_400) * 1000).toISOString(),
  };
}

async function invoiceStatus(): Promise<InvoiceStatus> {
  // In mock mode payment only happens through the explicit "simulate" action.
  return { status: 'pending' };
}

async function convertBtcToStable(): Promise<ConversionResult> {
  return { status: 'done', detail: 'Conversion simulée en USDT' };
}

async function quotePayout(input: { amountUsdCents: number; reference: string }): Promise<PayoutQuote> {
  const rate = getConfig().usdXof;
  return {
    quoteId: randomId('mockquote'),
    reference: input.reference,
    amountUsdCents: input.amountUsdCents,
    rate,
    feeUsdCents: 0,
    amountFcfa: Math.round((input.amountUsdCents / 100) * rate),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    mode: 'mock',
  };
}

async function startPayout(_input: PayoutStartInput): Promise<PayoutStart> {
  return { payoutId: randomId('mockpo'), status: 'pending' };
}

async function payoutStatus() {
  return { status: 'pending' as const };
}

async function findPayoutByReference() {
  return null; // nothing exists outside this process in mock mode
}

export const mockGateway: Gateway = {
  mode: 'mock',
  btcUsd: async () => getConfig().btcUsd,
  createInvoice,
  invoiceStatus,
  convertBtcToStable,
  quotePayout,
  startPayout,
  payoutStatus,
  findPayoutByReference,
};
