import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/primitives';
import { formatDateTime, formatFcfa } from '@/lib/money';
import { MOBILE_NETWORKS } from '@/lib/templates';
import { readDb } from '@/server/db';
import { findReceipt, maskPhone } from '@/server/receipt';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Reçu de paiement', robots: { index: false, follow: false } };

const LOOK = {
  done: { icon: 'check', circle: 'bg-[#16A34A] text-white', title: 'Paiement envoyé', tone: 'text-[#15803D]' },
  pending: { icon: 'sync', circle: 'bg-primary-container text-on-primary', title: 'Paiement en cours', tone: 'text-primary' },
  failed: { icon: 'close', circle: 'bg-error text-on-error', title: 'Paiement non abouti', tone: 'text-error' },
} as const;

export default async function Receipt({ params }: { params: { token: string } }) {
  const db = await readDb();
  const found = findReceipt(db, params.token);
  if (!found) notFound();
  const { project, step, payout } = found;
  const owner = db.users.find((u) => u.id === project.ownerId);

  const state = payout.status === 'completed' ? 'done' : payout.status === 'failed' ? 'failed' : 'pending';
  const look = LOOK[state];
  const simulated = payout.mode === 'mock';
  const decidedAt = step.decision?.at ?? payout.startedAt;

  const phases = [
    { label: owner ? `${owner.firstName} a validé le travail` : 'Le travail a été validé', at: decidedAt, state: 'done' as const },
    { label: 'Ordre de paiement envoyé à l’opérateur', at: payout.startedAt, state: 'done' as const },
    {
      label: state === 'failed' ? 'Paiement refusé par le réseau' : 'Paiement confirmé par Bitnob',
      at: payout.completedAt,
      state: state === 'done' ? ('done' as const) : state === 'failed' ? ('failed' as const) : ('doing' as const),
    },
  ];

  return (
    <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-2xl">
      <AutoRefresh active={state === 'pending'} everyMs={4000} />

      <header className="flex items-center justify-between bg-surface-container-low px-6 py-4">
        <Link href="/" aria-label="NobPay, accueil du site">
          <Logo className="text-[18px]" />
        </Link>
        <span className="rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant">Reçu de paiement</span>
      </header>

      <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
        <span className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${look.circle} ${state === 'done' ? 'nob-pop' : ''}`}>
          {state === 'pending' ? <Spinner className="h-8 w-8" /> : <Icon name={look.icon} size={36} />}
        </span>
        <p className={`mt-4 font-title-lg text-title-lg ${look.tone}`}>{look.title}</p>
        <p className="mt-3 font-headline-xl-mobile text-[40px] font-bold leading-none tracking-tight text-on-surface">{formatFcfa(payout.amountFcfa)}</p>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          pour <strong className="text-on-surface">{payout.supplier.name}</strong>
        </p>
        {simulated && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3 py-1 font-label-sm text-label-sm font-semibold text-[#B45309]">
            <Icon name="science" size={14} /> Démonstration : aucun argent réel
          </p>
        )}
      </div>

      <dl className="mx-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-2xl bg-surface-container-low p-4 font-body-sm text-body-sm">
        <dt className="text-on-surface-variant">De la part de</dt>
        <dd className="text-right font-medium text-on-surface">{owner ? `${owner.firstName}` : 'Un financeur NobPay'}</dd>
        <dt className="text-on-surface-variant">Pour</dt>
        <dd className="text-right font-medium text-on-surface">
          {step.title}
          <span className="block font-normal text-on-surface-variant">
            {project.name}, <Flag code="SN" className="inline-block h-2.5 w-4 align-middle" /> {project.city}
          </span>
        </dd>
        <dt className="text-on-surface-variant">Mobile money</dt>
        <dd className="text-right font-medium text-on-surface">
          {MOBILE_NETWORKS[payout.supplier.network]}
          <span className="block font-normal text-on-surface-variant">{maskPhone(payout.supplier.phone)}</span>
        </dd>
        <dt className="text-on-surface-variant">Date</dt>
        <dd className="text-right font-medium text-on-surface">{formatDateTime(payout.completedAt ?? payout.startedAt)}</dd>
        <dt className="text-on-surface-variant">Référence</dt>
        <dd className="break-all text-right font-mono text-[11px] text-on-surface">{payout.reference}</dd>
      </dl>

      <ol className="mx-6 mt-5 flex flex-col" aria-label="Suivi du paiement">
        {phases.map((p, i) => (
          <li key={p.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < phases.length - 1 && <span aria-hidden="true" className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${p.state === 'done' ? 'bg-[#16A34A]/50' : 'bg-outline-variant/60'}`} />}
            <span
              className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                p.state === 'done' ? 'bg-[#16A34A] text-white' : p.state === 'failed' ? 'bg-error text-on-error' : 'bg-primary-container text-on-primary'
              }`}
            >
              {p.state === 'done' ? <Icon name="check" size={16} /> : p.state === 'failed' ? <Icon name="close" size={16} /> : <Spinner className="h-4 w-4" />}
            </span>
            <span className="flex flex-col">
              <span className="font-label-lg text-label-lg text-on-surface">{p.label}</span>
              {p.at && <span className="font-label-sm text-label-sm text-on-surface-variant">{formatDateTime(p.at)}</span>}
            </span>
          </li>
        ))}
      </ol>

      <p className="mx-6 mb-6 mt-6 flex items-start gap-2 rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
        <Icon name="info" size={16} className="mt-px shrink-0" />
        {state === 'failed'
          ? 'Le paiement n’a pas abouti et aucun argent n’a été retiré de votre côté. Contactez la personne qui vous paie : elle peut le relancer. Gardez la référence ci-dessus.'
          : 'Ce reçu vient de NobPay. Si l’argent n’apparaît pas sur votre téléphone au bout de quelques minutes, contactez la personne qui vous paie en lui donnant la référence ci-dessus.'}
      </p>

      <footer className="border-t border-outline-variant/40 bg-surface-container-low px-6 py-4 text-center font-label-sm text-label-sm text-on-surface-variant">
        Argent en séquestre, libéré étape par étape sur preuve.{' '}
        <Link href="/" className="font-semibold text-primary underline">
          Découvrir NobPay
        </Link>
      </footer>
    </article>
  );
}
