import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';
import { Chip, SectionTitle } from '@/components/ui/primitives';
import { formatDateTime, formatFcfa, formatSats, formatUsd, formatUsdShort } from '@/lib/money';
import type { Funding } from '@/lib/types';
import { getSessionUser } from '@/server/auth';
import { INSTANCE } from '@/lib/instance';
import { getConfig, instanceMode } from '@/server/config';
import { currentUsdXof } from '@/server/lightning/price';
import { readDb } from '@/server/db';
import { totalsOf, userProjects } from '@/server/views';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Portefeuille') };
}

const METHOD: Record<Funding['method'], string> = { lightning: 'Bitcoin Lightning', usdt: 'USDT', usdc: 'USDC' };
const STATUS: Record<Funding['status'], { label: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }> = {
  paid: { label: 'Crédité', tone: 'success' },
  pending: { label: 'En attente', tone: 'warning' },
  expired: { label: 'Expiré', tone: 'neutral' },
  failed: { label: 'Échoué', tone: 'danger' },
};
const OUTCOME: Record<string, string> = {
  funding_paid: 'Versement reçu',
  funding_already_paid: 'Doublon ignoré',
  unknown_invoice: 'Facture inconnue',
  payout_completed: 'Paiement fournisseur terminé',
  payout_already_completed: 'Doublon ignoré',
  payout_failed: 'Paiement refusé',
  payout_already_settled: 'Doublon ignoré',
  unknown_payout: 'Paiement inconnu',
  ignored: 'événement sans effet',
};

export default async function Wallet() {
  const t = await getT();
  const user = (await getSessionUser())!;
  const db = await readDb();
  const summaries = userProjects(db, user.id);
  const totals = totalsOf(db, summaries);
  const { mode } = getConfig();
  const usdXof = currentUsdXof();
  const ids = new Set(summaries.map((s) => s.project.id));
  const nameOf = new Map(summaries.map((s) => [s.project.id, s.project.name]));
  const deposited = summaries.reduce((n, s) => n + s.funded, 0);
  const fundings = db.fundings.filter((f) => ids.has(f.projectId)).sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const webhooks = [...db.webhooks].reverse().slice(0, 8);

  return (
    <>
      <AppHeader title={t('Portefeuille')} user={user} />
      <main id="contenu" className="flex flex-col gap-space-lg px-space-md pb-28 pt-20 lg:mx-auto lg:grid lg:w-full lg:max-w-[1100px] lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-8 lg:pb-12 lg:pt-8">
        {/* Total */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A0F24] via-[#0B132B] to-[#1E40AF] p-5 text-white shadow-xl lg:col-span-2 lg:p-8">
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary-container/25 blur-3xl" />
          <p className="relative font-label-sm text-label-sm font-semibold uppercase tracking-wider text-surface-variant"><Tc>En séquestre</Tc></p>
          <p className="relative mt-1 font-headline-xl-mobile text-headline-xl-mobile font-bold tracking-tight">{formatUsd(totals.escrow)}</p>
          <p className="relative mt-1 font-body-sm text-body-sm text-surface-variant">≈ {formatFcfa((totals.escrow / 100) * usdXof)} <span className="opacity-70"><Tc>(taux indicatif)</Tc></span></p>
          <div className="relative mt-5 grid grid-cols-3 gap-2 text-center">
            <Mini label={t('Déposé')} value={formatUsdShort(deposited)} />
            <Mini label={t('Libéré')} value={formatUsdShort(totals.released)} />
            <Mini label={t('Budget')} value={formatUsdShort(totals.budget)} />
          </div>
        </section>

        {/* Per project */}
        <section>
          <SectionTitle><Tc>Par projet</Tc></SectionTitle>
          {summaries.length === 0 ? (
            <p className="rounded-2xl bg-surface-container-low p-space-md text-center font-body-md text-on-surface-variant"><Tc>Aucun projet.</Tc></p>
          ) : (
            <ul className="flex flex-col gap-2">
              {summaries.map((s) => {
                const toFund = Math.max(0, s.project.budgetCents - s.funded);
                const pct = (v: number) => (s.project.budgetCents > 0 ? Math.min(100, (v / s.project.budgetCents) * 100) : 0);
                return (
                  <li key={s.project.id}>
                    <Link href={`/app/projets/${s.project.id}/financer`} className="block rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-md">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate font-title-md text-title-md">{s.project.name}</span>
                        <span className="flex shrink-0 items-center gap-1 font-label-md text-label-md font-semibold text-primary">
                          <Tc>Financer</Tc> <Icon name="chevron_right" size={16} />
                        </span>
                      </div>
                      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-container-high" aria-label={t('Répartition du budget')}>
                        <span className="bg-[#16A34A]" style={{ width: `${pct(s.released)}%` }} title={t('Libéré')} />
                        <span className="bg-primary-container" style={{ width: `${pct(s.escrow)}%` }} title={t('En séquestre')} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-label-sm text-label-sm text-on-surface-variant">
                        <Legend color="bg-[#16A34A]" label={t('Libéré')} value={formatUsdShort(s.released)} />
                        <Legend color="bg-primary-container" label={t('Séquestre')} value={formatUsdShort(s.escrow)} />
                        <Legend color="bg-surface-container-high ring-1 ring-outline-variant" label={t('À financer')} value={formatUsdShort(toFund)} />
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Fundings */}
        <section>
          <SectionTitle><Tc>Versements</Tc></SectionTitle>
          {fundings.length === 0 ? (
            <p className="rounded-2xl bg-surface-container-low p-space-md text-center font-body-md text-on-surface-variant"><Tc>Aucun versement pour le moment.</Tc></p>
          ) : (
            <ul className="flex flex-col gap-2">
              {fundings.map((f) => (
                <li key={f.id} className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
                    <Icon name="bolt" size={20} filled />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-title-md text-title-md">{formatUsd(f.amountCents)}</span>
                      <Chip tone={STATUS[f.status].tone}><Tc>{STATUS[f.status].label}</Tc></Chip>
                    </span>
                    <span className="truncate font-body-sm text-body-sm text-on-surface-variant">
                      {nameOf.get(f.projectId)} · {METHOD[f.method]}
                      {f.amountSats ? ` · ${formatSats(f.amountSats)}` : ''}
                    </span>
                    <span className="font-label-sm text-label-sm text-on-surface-variant/80">{formatDateTime(f.paidAt ?? f.createdAt)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 font-label-sm text-label-sm text-on-surface-variant">
            <Tc>Bitcoin Lightning uniquement : le versement se fait en bitcoin sur le réseau Lightning.</Tc>
          </p>
        </section>

        {/* Bitnob journal */}
        <section className="lg:col-span-2">
          <SectionTitle action={<Chip tone={INSTANCE[instanceMode()].tone}><Tc>{INSTANCE[instanceMode()].short}</Tc></Chip>}><Tc>Journal des événements</Tc></SectionTitle>
          <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
            <Tc>Chaque événement reçu de Bitnob est vérifié (signature HMAC) puis appliqué une seule fois. Les doublons sont ignorés.</Tc>
          </p>
          {webhooks.length === 0 ? (
            <p className="rounded-2xl bg-surface-container-low p-space-md text-center font-body-md text-on-surface-variant"><Tc>Aucun événement reçu.</Tc></p>
          ) : (
            <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm">
              {webhooks.map((w) => (
                <li key={w.eventId} className="flex items-center justify-between gap-3 px-3.5 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-label-md text-label-md text-on-surface">{OUTCOME[w.outcome] ?? w.outcome}</span>
                    <span className="truncate font-label-sm text-label-sm text-on-surface-variant">{w.type}</span>
                  </span>
                  <span className="shrink-0 font-label-sm text-label-sm text-on-surface-variant">{formatDateTime(w.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-2.5 backdrop-blur">
      <span className="block font-label-sm text-label-sm text-surface-variant">{label}</span>
      <span className="block truncate font-label-lg text-label-lg font-bold">{value}</span>
    </div>
  );
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      {label} <strong className="font-semibold text-on-surface">{value}</strong>
    </span>
  );
}
