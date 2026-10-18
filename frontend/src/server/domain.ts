import { fundedCents, type Db, type Funding, type Project, type Step } from '@/lib/types';
import { appendLedger } from './ledger';

/**
 * Pure business rules applied to a database draft. No network, no I/O:
 * the callers (services, webhook handler) decide when to run them.
 */

export const findProject = (db: Db, id: string): Project | undefined => db.projects.find((p) => p.id === id);
export const findStep = (project: Project, stepId: string): Step | undefined => project.steps.find((s) => s.id === stepId);

const BLOCKING: Step['status'][] = ['active', 'proof_submitted', 'rejected', 'releasing'];

/**
 * Steps are sequential: the next one becomes `active` (the field manager can submit a proof)
 * only when nothing else is in progress AND the escrow already covers its amount.
 */
export function activateSteps(db: Db, project: Project): void {
  if (project.steps.some((s) => BLOCKING.includes(s.status))) return;
  const next = project.steps.find((s) => s.status === 'upcoming');
  if (!next) return;
  const paid = project.steps.filter((s) => s.status === 'paid').reduce((sum, s) => sum + s.amountCents, 0);
  if (fundedCents(db, project.id) - paid >= next.amountCents) next.status = 'active';
}

/** Credits the escrow once. Returns false if the funding was already settled (idempotent). */
export function applyFundingPaid(db: Db, funding: Funding, info: { preimage?: string; at?: string } = {}): boolean {
  if (funding.status === 'paid') return false;
  funding.status = 'paid';
  funding.paidAt = info.at ?? new Date().toISOString();
  if (info.preimage) funding.preimage = info.preimage;
  appendLedger(
    db,
    funding.projectId,
    'funding_paid',
    {
      fundingId: funding.id,
      method: funding.method,
      amountCents: funding.amountCents,
      amountSats: funding.amountSats,
      paymentHash: funding.paymentHash,
      preimage: funding.preimage,
    },
    funding.paidAt,
  );
  const project = findProject(db, funding.projectId);
  if (project) activateSteps(db, project);
  return true;
}

export function applyPayoutCompleted(
  db: Db,
  project: Project,
  step: Step,
  info: { payoutId?: string; at?: string } = {},
): boolean {
  if (!step.payout || step.status === 'paid') return false;
  const at = info.at ?? new Date().toISOString();
  step.payout.status = 'completed';
  step.payout.completedAt = at;
  if (info.payoutId) step.payout.payoutId = info.payoutId;
  step.status = 'paid';
  appendLedger(
    db,
    project.id,
    'payout_completed',
    { stepId: step.id, index: step.index, reference: step.payout.reference, payoutId: step.payout.payoutId },
    at,
  );
  activateSteps(db, project);
  return true;
}

export function applyPayoutFailed(db: Db, project: Project, step: Step, error: string): boolean {
  if (!step.payout || step.status === 'paid') return false;
  step.payout.status = 'failed';
  step.payout.error = error;
  // the funder can try again: the proof stays valid
  step.status = 'proof_submitted';
  appendLedger(db, project.id, 'payout_failed', { stepId: step.id, index: step.index, reference: step.payout.reference, error });
  return true;
}
