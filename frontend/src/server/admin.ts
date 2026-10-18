import type { AnchorStatus, Db, FundingStatus, PayoutStatus, User, WebhookRecord } from '@/lib/types';
import { getConfig } from './config';
import { maskPhone } from './receipt';

/**
 * Back-office. There are no roles in the database on purpose: an administrator is someone whose phone number is
 * listed in ADMIN_PHONES. In demo mode (mock, or ALLOW_DEMO=1) the demonstration account also gets the page, so the
 * jury can see it. Everything here is READ-ONLY: it shows what is stuck, it never moves money.
 */

const digitsOnly = (phone: string) => phone.replace(/[^0-9+]/g, '');

export function isAdmin(user: Pick<User, 'phone' | 'demo'> | null | undefined): boolean {
  if (!user) return false;
  const cfg = getConfig();
  if (cfg.adminPhones.includes(digitsOnly(user.phone))) return true;
  return cfg.allowDemo && !!user.demo;
}

export interface AdminAlert {
  level: 'error' | 'warn';
  text: string;
  href?: string;
}

export interface AdminPayoutRow {
  at: string;
  project: string;
  projectId: string;
  stepTitle: string;
  stepId: string;
  supplier: string;
  phone: string;
  amountFcfa: number;
  amountUsdCents: number;
  status: PayoutStatus;
  mode: string;
  reference: string;
  error?: string;
}

export interface AdminFundingRow {
  at: string;
  project: string;
  projectId: string;
  amountCents: number;
  status: FundingStatus;
  method: string;
  mode: string;
  simulated: boolean;
  conversion?: string;
  note?: string;
}

export interface AdminAnchorRow {
  id: string;
  at: string;
  project: string;
  upToSeq: number;
  status: AnchorStatus;
  bitcoinBlock?: number;
}

export interface AdminOverview {
  counts: {
    users: number;
    projects: number;
    fundings: Record<FundingStatus, number>;
    payouts: Record<PayoutStatus, number>;
    anchors: Record<AnchorStatus, number>;
    webhooks: number;
  };
  alerts: AdminAlert[];
  payouts: AdminPayoutRow[];
  fundings: AdminFundingRow[];
  anchors: AdminAnchorRow[];
  webhooks: WebhookRecord[];
}

const STUCK_PAYOUT_MS = 5 * 60_000;
const SLOW_ANCHOR_MS = 24 * 3_600_000;
const BAD_OUTCOME = /mismatch|unknown|invalid|rejected|failed/;

const zero = <K extends string>(keys: K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** Everything the back-office shows, computed from one snapshot of the database (pure: easy to test). */
export function adminOverview(db: Db, now = Date.now()): AdminOverview {
  const projectName = new Map(db.projects.map((p) => [p.id, p.name]));
  const counts: AdminOverview['counts'] = {
    users: db.users.length,
    projects: db.projects.length,
    fundings: zero<FundingStatus>(['pending', 'paid', 'expired', 'failed']),
    payouts: zero<PayoutStatus>(['initiated', 'pending', 'completed', 'failed']),
    anchors: zero<AnchorStatus>(['pending', 'confirmed', 'failed']),
    webhooks: db.webhooks.length,
  };
  const alerts: AdminAlert[] = [];
  const payouts: AdminPayoutRow[] = [];

  for (const p of db.projects) {
    for (const s of p.steps) {
      const po = s.payout;
      if (!po) continue;
      counts.payouts[po.status] += 1;
      payouts.push({
        at: po.completedAt ?? po.startedAt,
        project: p.name,
        projectId: p.id,
        stepTitle: s.title,
        stepId: s.id,
        supplier: po.supplier.name,
        phone: maskPhone(po.supplier.phone),
        amountFcfa: po.amountFcfa,
        amountUsdCents: po.amountUsdCents,
        status: po.status,
        mode: po.mode,
        reference: po.reference,
        error: po.error,
      });
      const href = `/app/projets/${p.id}/etapes/${s.id}`;
      const where = `« ${s.title} », ${p.name}`;
      if ((po.status === 'initiated' || po.status === 'pending') && now - Date.parse(po.startedAt) > STUCK_PAYOUT_MS) {
        alerts.push({ level: 'warn', text: `Paiement en cours depuis plus de 5 minutes : ${where}.`, href });
      }
      if (po.uncertain) alerts.push({ level: 'error', text: `Paiement incertain (Bitnob n'a pas répondu clairement) : ${where}. Les fonds restent réservés.`, href });
      if (po.status === 'failed') alerts.push({ level: 'warn', text: `Paiement refusé${po.error ? ` (${po.error})` : ''} : ${where}.`, href });
    }
  }

  const fundings: AdminFundingRow[] = db.fundings.map((f) => {
    counts.fundings[f.status] += 1;
    const name = projectName.get(f.projectId) ?? f.projectId;
    if (f.conversion?.status === 'failed' && f.conversion.retryable === false) {
      alerts.push({ level: 'error', text: `Conversion en stablecoin abandonnée pour un versement de ${name} : ${f.conversion.detail ?? 'raison inconnue'}.`, href: `/app/projets/${f.projectId}` });
    }
    if (f.note) alerts.push({ level: 'warn', text: `Versement non crédité pour ${name} : ${f.note}.`, href: `/app/projets/${f.projectId}` });
    return {
      at: f.paidAt ?? f.createdAt,
      project: name,
      projectId: f.projectId,
      amountCents: f.amountCents,
      status: f.status,
      method: f.method,
      mode: f.mode,
      simulated: !!f.simulated,
      conversion: f.conversion?.status,
      note: f.note,
    };
  });

  const anchors: AdminAnchorRow[] = db.anchors.map((a) => {
    counts.anchors[a.status] += 1;
    if (a.status === 'pending' && now - Date.parse(a.submittedAt) > SLOW_ANCHOR_MS) {
      alerts.push({ level: 'warn', text: `Ancrage Bitcoin en attente depuis plus de 24 h : ${projectName.get(a.projectId) ?? a.projectId}.`, href: `/verifier/${a.id}` });
    }
    return { id: a.id, at: a.submittedAt, project: projectName.get(a.projectId) ?? a.projectId, upToSeq: a.upToSeq, status: a.status, bitcoinBlock: a.bitcoinBlock };
  });

  const recentWebhooks = [...db.webhooks].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 25);
  const badHooks = recentWebhooks.filter((w) => BAD_OUTCOME.test(w.outcome));
  if (badHooks.length) alerts.push({ level: 'warn', text: `${badHooks.length} évènement${badHooks.length > 1 ? 's' : ''} Bitnob récent${badHooks.length > 1 ? 's' : ''} non appliqué${badHooks.length > 1 ? 's' : ''} (voir le journal ci-dessous).` });

  const byDate = <T extends { at: string }>(rows: T[]) => rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  alerts.sort((a, b) => Number(b.level === 'error') - Number(a.level === 'error'));
  return { counts, alerts, payouts: byDate(payouts), fundings: byDate(fundings), anchors: byDate(anchors), webhooks: recentWebhooks };
}
