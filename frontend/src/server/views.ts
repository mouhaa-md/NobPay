import {
  currentStep,
  escrowCents,
  fundedCents,
  refundedCents,
  progressPercent,
  releasedCents,
  type Db,
  type Project,
  type Step,
} from '@/lib/types';
import { translate } from '@/lib/i18n/messages';
import { SUPPLIER_NETWORKS } from '@/lib/templates';
import { ledgerFor } from './ledger';

/** Read models for the screens: everything shown in the app is computed here from the one database. */

export interface ProjectSummary {
  project: Project;
  funded: number;
  released: number;
  escrow: number;
  progress: number;
  current?: Step;
  /** proofs waiting for the funder's decision */
  waitingDecision: number;
}

export function summarize(db: Db, project: Project): ProjectSummary {
  return {
    project,
    funded: fundedCents(db, project.id) - refundedCents(db, project.id),
    released: releasedCents(project),
    escrow: escrowCents(db, project),
    progress: progressPercent(project),
    current: currentStep(project),
    waitingDecision: project.steps.filter((s) => s.status === 'proof_submitted').length,
  };
}

export function userProjects(db: Db, userId: string): ProjectSummary[] {
  return db.projects
    .filter((p) => p.ownerId === userId)
    .map((p) => summarize(db, p))
    // what needs a decision comes first, then the most recent projects
    .sort((a, b) => Number(b.waitingDecision > 0) - Number(a.waitingDecision > 0) || Date.parse(b.project.createdAt) - Date.parse(a.project.createdAt));
}

export interface Totals {
  escrow: number;
  released: number;
  budget: number;
  projects: number;
  stepsPaid: number;
  stepsTotal: number;
  anchorsConfirmed: number;
  anchorsTotal: number;
  waitingDecision: number;
}

export function totalsOf(db: Db, summaries: ProjectSummary[]): Totals {
  const ids = new Set(summaries.map((s) => s.project.id));
  const anchors = db.anchors.filter((a) => ids.has(a.projectId) && a.status !== 'failed');
  return {
    escrow: summaries.reduce((n, s) => n + s.escrow, 0),
    released: summaries.reduce((n, s) => n + s.released, 0),
    budget: summaries.reduce((n, s) => n + s.project.budgetCents, 0),
    projects: summaries.length,
    stepsPaid: summaries.reduce((n, s) => n + s.project.steps.filter((x) => x.status === 'paid').length, 0),
    stepsTotal: summaries.reduce((n, s) => n + s.project.steps.length, 0),
    anchorsConfirmed: anchors.filter((a) => a.status === 'confirmed').length,
    anchorsTotal: anchors.length,
    waitingDecision: summaries.reduce((n, s) => n + s.waitingDecision, 0),
  };
}

export interface ActivityItem {
  id: string;
  projectId: string;
  at: string;
  kind: 'funding' | 'step_validated' | 'payout' | 'proof_pending' | 'proof_rejected' | 'payout_failed';
  title: string;
  subtitle: string;
  icon: string;
  amountCents?: number;
  amountFcfa?: number;
  tone: 'positive' | 'negative' | 'neutral';
  badge?: string;
}

const METHOD_LABEL: Record<string, string> = { lightning: 'Lightning', usdt: 'USDT', usdc: 'USDC' };

/** Turns a French sentence into the visitor's language (the pages pass their `t`; French is the default). */
export type Translate = (fr: string, vars?: Record<string, string | number>) => string;
const inFrench: Translate = (fr, vars) => translate('fr', fr, vars);

export function buildActivity(db: Db, userId: string, limit = 12, t: Translate = inFrench): ActivityItem[] {
  const items: ActivityItem[] = [];
  for (const p of db.projects.filter((x) => x.ownerId === userId)) {
    const stepById = new Map(p.steps.map((s) => [s.id, s]));
    for (const e of ledgerFor(db, p.id)) {
      const step = typeof e.data.stepId === 'string' ? stepById.get(e.data.stepId) : undefined;
      const base = { id: `${p.id}:${e.seq}`, projectId: p.id, at: e.at };
      switch (e.type) {
        case 'funding_paid':
          items.push({
            ...base,
            kind: 'funding',
            title: t('Financement reçu · {method}', { method: METHOD_LABEL[String(e.data.method)] ?? 'Lightning' }),
            subtitle: p.name,
            icon: 'bolt',
            amountCents: Number(e.data.amountCents),
            tone: 'positive',
          });
          break;
        case 'step_approved':
          if (step) {
            items.push({ ...base, kind: 'step_validated', title: t('Étape validée · {title}', { title: t(step.title) }), subtitle: p.name, icon: 'verified', amountCents: step.amountCents, tone: 'neutral', badge: t('libérés') });
          }
          break;
        case 'payout_completed':
          if (step?.payout) {
            items.push({
              ...base,
              kind: 'payout',
              title: t('Paiement fournisseur · {network}', { network: SUPPLIER_NETWORKS[step.payout.supplier.network] }),
              subtitle: step.payout.supplier.name,
              icon: 'payments',
              amountCents: step.payout.amountUsdCents,
              amountFcfa: step.payout.amountFcfa,
              tone: 'negative',
            });
          }
          break;
        case 'payout_failed':
          if (step) items.push({ ...base, kind: 'payout_failed', title: t('Paiement non abouti · {title}', { title: t(step.title) }), subtitle: p.name, icon: 'error', tone: 'neutral', badge: t('à relancer') });
          break;
        case 'step_rejected':
          if (step) items.push({ ...base, kind: 'proof_rejected', title: t('Preuve refusée · {title}', { title: t(step.title) }), subtitle: p.name, icon: 'undo', tone: 'neutral', badge: t('à refaire') });
          break;
        default:
          break;
      }
    }
    for (const s of p.steps) {
      if (s.status === 'proof_submitted' && s.proof) {
        items.push({
          id: `${p.id}:pending:${s.id}`,
          projectId: p.id,
          at: s.proof.submittedAt,
          kind: 'proof_pending',
          title: t('Preuve en attente de revue'),
          subtitle: `${p.name} · ${t(s.title)}`,
          icon: 'pending',
          tone: 'neutral',
          badge: t('À valider'),
        });
      }
    }
  }
  return items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, limit);
}
