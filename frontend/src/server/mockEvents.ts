import { randomUUID } from 'node:crypto';
import type { Funding, Step } from '@/lib/types';
import { getConfig } from './config';
import { signWebhookBody } from './bitnob/sign';
import { mockPreimage } from './bitnob/mock';
import { handleBitnobWebhook, type WebhookResult } from './webhooks';

/**
 * Mock mode only. The simulator builds the same kind of signed event Bitnob would send
 * and feeds it to the REAL webhook handler, so signature check, replay protection and
 * crediting logic are exercised exactly as in sandbox mode.
 */

async function deliver(event: string, data: Record<string, unknown>): Promise<WebhookResult> {
  const body = JSON.stringify({ event, event_id: randomUUID(), data });
  const signature = signWebhookBody(getConfig().webhookSecret, body);
  return handleBitnobWebhook(body, signature);
}

export function simulateInvoicePaid(funding: Funding): Promise<WebhookResult> {
  return deliver('btc.lightning.received.success', {
    id: funding.invoiceId,
    reference: funding.reference,
    payment_hash: funding.paymentHash,
    amount: funding.amountSats,
    preimage: mockPreimage(funding.reference),
    status: 'paid',
  });
}

export function simulatePayoutCompleted(step: Step): Promise<WebhookResult> {
  return deliver('payouts.withdrawal.success', {
    id: step.payout?.payoutId,
    payout_id: step.payout?.payoutId,
    reference: step.payout?.reference,
    status: 'COMPLETED',
  });
}
