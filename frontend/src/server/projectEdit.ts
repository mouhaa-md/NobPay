import { escrowCents, type Db, type Project, type ProofKind, type Step, type User } from '@/lib/types';
import { formatUsdShort } from '@/lib/money';
import { getConfig } from './config';
import { withDb } from './db';
import { activateSteps, findProject } from './domain';
import { HttpError } from './http';
import { appendLedger } from './ledger';

/**
 * A project is not frozen on the day it is created: a bag of cement costs more, a step turns out to be two. The funder can
 * reshape the steps that are still to come, and close the project when it stops. Everything the money has touched stays
 * as it was (a step that is funded, waiting for a proof, being paid or paid cannot be changed), and every change is a
 * ledger event, so the public record explains why the plan at the end is not the plan at the start.
 */

const MAX_STEPS = 12;
const MAX_BUDGET_CENTS = 50_000_000;
const PROOF_KINDS: ProofKind[] = ['titre', 'photos', 'facture'];

export interface PlannedStep {
  /** the id of an upcoming step to change; none for a new step */
  id?: string;
  title: string;
  amountCents: number;
  proofKinds?: ProofKind[];
}

function owned(db: Db, owner: User, projectId: string): Project {
  const project = findProject(db, projectId);
  if (!project || project.ownerId !== owner.id) throw new HttpError(404, 'Projet introuvable');
  return project;
}

export function assertOpen(project: Pick<Project, 'closedAt'>): void {
  if (project.closedAt) throw new HttpError(409, 'Ce projet est clos.', 'project_closed');
}

/**
 * Replaces the steps that are still to come (`upcoming`) with `tail`, in this order. A step of the project that is not in
 * `tail` and is still upcoming disappears; an entry without `id` is a new step. The budget becomes what the steps add up to.
 */
export async function updateProject(owner: User, projectId: string, tail: PlannedStep[]): Promise<Project> {
  return withDb((db) => {
    const project = owned(db, owner, projectId);
    assertOpen(project);
    const fixed = project.steps.filter((s) => s.status !== 'upcoming');
    const upcoming = new Map(project.steps.filter((s) => s.status === 'upcoming').map((s) => [s.id, s]));

    if (fixed.length + tail.length < 1 || fixed.length + tail.length > MAX_STEPS) throw new HttpError(400, 'Prévoyez entre 1 et 12 étapes');
    const seen = new Set<string>();
    const planned = tail.map((p, i) => {
      const title = String(p.title ?? '').trim().slice(0, 80);
      if (!title) throw new HttpError(400, `Donnez un nom à l'étape ${fixed.length + i + 1}`);
      if (!Number.isInteger(p.amountCents) || p.amountCents < 100) throw new HttpError(400, `Montant invalide pour l'étape ${fixed.length + i + 1}`);
      const kinds = p.proofKinds?.length ? p.proofKinds.filter((k) => PROOF_KINDS.includes(k)) : undefined;
      if (p.id !== undefined) {
        if (seen.has(p.id)) throw new HttpError(400, 'Une étape est donnée deux fois.', 'invalid_input');
        seen.add(p.id);
        if (!upcoming.has(p.id)) throw new HttpError(409, 'Cette étape ne peut plus être modifiée : de l’argent ou une preuve l’a déjà touchée.', 'step_locked');
      }
      return { ...p, title, kinds };
    });

    const budgetCents = fixed.reduce((n, s) => n + s.amountCents, 0) + planned.reduce((n, p) => n + p.amountCents, 0);
    const cfg = getConfig();
    if (budgetCents < cfg.minBudgetUsd * 100 || budgetCents > MAX_BUDGET_CENTS) {
      throw new HttpError(400, `Le budget doit être compris entre ${formatUsdShort(cfg.minBudgetUsd * 100)} et ${formatUsdShort(MAX_BUDGET_CENTS)}.`, 'invalid_input');
    }
    // the same ceilings as at creation: what could never be paid or held must not be written down
    const stepCap = cfg.lightning.rail === 'nwc' ? cfg.lightning.maxPayoutUsd : cfg.maxStepUsd;
    if (stepCap > 0) {
      const over = planned.find((p) => p.amountCents > stepCap * 100);
      if (over) {
        throw new HttpError(400, `${cfg.lightning.rail === 'nwc' ? 'Pendant cette phase pilote' : 'En mode sandbox'}, un paiement est limité à ${formatUsdShort(stepCap * 100)} : l'étape « ${over.title} » (${formatUsdShort(over.amountCents)}) ne pourrait pas être payée. Réduisez son montant ou ajoutez des étapes.`, 'pilot_cap');
      }
    }
    if (cfg.lightning.rail === 'nwc' && budgetCents > cfg.lightning.maxEscrowUsd * 100) {
      throw new HttpError(400, `Pendant cette phase pilote, un projet est limité à ${formatUsdShort(cfg.lightning.maxEscrowUsd * 100)} (le séquestre total de l'instance).`, 'pilot_cap');
    }

    // a new id never repeats one that exists
    let next = Math.max(0, ...project.steps.map((s) => Number(/_s(\d+)$/.exec(s.id)?.[1] ?? 0))) + 1;
    const rebuilt: Step[] = planned.map((p) => {
      const old = p.id ? upcoming.get(p.id)! : undefined;
      return {
        id: old?.id ?? `${project.id}_s${next++}`,
        index: 0,
        title: p.title,
        amountCents: p.amountCents,
        proofKinds: p.kinds?.length ? p.kinds : old?.proofKinds ?? (['photos', 'facture'] as ProofKind[]),
        status: 'upcoming' as const,
      };
    });
    const previous = project.budgetCents;
    project.steps = [...fixed, ...rebuilt].map((s, i) => ({ ...s, index: i + 1 }));
    project.budgetCents = budgetCents;
    appendLedger(db, project.id, 'project_updated', {
      previousBudgetCents: previous,
      budgetCents,
      steps: project.steps.map((s) => ({ index: s.index, title: s.title, amountCents: s.amountCents })),
    });
    activateSteps(db, project); // a cheaper next step may now be covered by what is already in escrow
    return structuredClone(project);
  });
}

/**
 * Closes the project: no more funds, no more proofs, nothing more paid. What is left in escrow stays the funder's and can
 * be taken back (the refund works as before). Refused while a proof waits for a decision or a payment is on its way: those
 * end first, so nobody is left with a half-finished payment.
 */
export async function closeProject(owner: User, projectId: string): Promise<Project> {
  return withDb((db) => {
    const project = owned(db, owner, projectId);
    assertOpen(project);
    if (project.steps.some((s) => s.status === 'proof_submitted' || s.status === 'releasing')) {
      throw new HttpError(409, 'Une preuve attend votre décision ou un paiement est en cours : terminez-les avant de clore le projet.', 'decision_pending');
    }
    const now = new Date().toISOString();
    project.closedAt = now;
    project.contribution = undefined; // the family link stops with the project
    appendLedger(
      db,
      project.id,
      'project_closed',
      {
        escrowLeftCents: escrowCents(db, project),
        paidSteps: project.steps.filter((s) => s.status === 'paid').length,
        steps: project.steps.length,
      },
      now,
    );
    return structuredClone(project);
  });
}
