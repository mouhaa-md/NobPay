import type { Db, Payout, Project, Step } from '@/lib/types';
import { hmacHex, safeEqual } from './crypto';
import { assertSessionSecret } from './secret';

/**
 * The supplier's receipt page (`/recu/<token>`): the only thing the person who gets paid ever sees of NobPay.
 *
 * Nothing is stored: the token is `<stepId>.<hmac>`, signed with the server secret over the step AND the payout
 * reference. So it cannot be guessed, it only exists once a payout does, and when a failed payout is retried (new
 * reference) the old link stops working instead of showing a stale status.
 */

const mac = (stepId: string, reference: string) => hmacHex('sha256', assertSessionSecret(), `receipt:${stepId}:${reference}`).slice(0, 32);

/** The token to give the supplier, or null while the step has no payout yet. */
export function receiptToken(step: Pick<Step, 'id' | 'payout'>): string | null {
  return step.payout ? `${step.id}.${mac(step.id, step.payout.reference)}` : null;
}

export interface ReceiptMatch {
  project: Project;
  step: Step;
  payout: Payout;
}

export function findReceipt(db: Pick<Db, 'projects'>, token: string): ReceiptMatch | undefined {
  const dot = token.lastIndexOf('.');
  if (dot < 1) return undefined;
  const stepId = token.slice(0, dot);
  const given = token.slice(dot + 1);
  for (const project of db.projects) {
    const step = project.steps.find((s) => s.id === stepId);
    if (step?.payout && safeEqual(given, mac(step.id, step.payout.reference))) return { project, step, payout: step.payout };
  }
  return undefined;
}

/** +221 77 123 45 67 -> +221 77 ••• •• 67 (the receipt is a link that gets forwarded: do not print the whole number). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, '');
  if (digits.length < 6) return '••••';
  const cc = phone.trim().startsWith('+') ? `+${digits.slice(0, 3)} ` : '';
  const rest = phone.trim().startsWith('+') ? digits.slice(3) : digits;
  return `${cc}${rest.slice(0, 2)} ••• •• ${rest.slice(-2)}`;
}
