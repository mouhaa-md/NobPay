import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { Spinner } from '@/components/ui/primitives';
import { formatDateTime, formatFcfa, formatSats } from '@/lib/money';
import { maskAddress } from '@/lib/supplierLabel';
import { OperatorLogo } from '@/components/ui/OperatorLogo';
import { SUPPLIER_NETWORKS } from '@/lib/templates';
import { readDb } from '@/server/db';
import { findReceipt, maskPhone } from '@/server/receipt';
import { Tc } from '@/lib/i18n/client';
import { fr } from '@/lib/i18n/messages';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Reçu de paiement'), robots: { index: false, follow: false } };
}

const LOOK = {
  done: { icon: 'check', circle: 'bg-[#16A34A] text-white', title: fr('Paiement envoyé'), tone: 'text-[#15803D]' },
  pending: { icon: 'sync', circle: 'bg-primary-container text-on-primary', title: fr('Paiement en cours'), tone: 'text-primary' },
  failed: { icon: 'close', circle: 'bg-error text-on-error', title: fr('Paiement non abouti'), tone: 'text-error' },
} as const;

export default async function Receipt(props: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const params = await props.params;
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
    { label: owner ? t('{name} a validé le travail', { name: owner.firstName }) : t('Le travail a été validé'), at: decidedAt, state: 'done' as const },
    { label: payout.lightning ? t('Paiement envoyé sur le réseau Lightning') : t('Ordre de paiement envoyé à l’opérateur'), at: payout.startedAt, state: 'done' as const },
    {
      label: state === 'failed' ? t('Paiement refusé par le réseau') : payout.lightning ? t('Paiement confirmé par le réseau Lightning') : t('Paiement confirmé par Bitnob'),
      at: payout.completedAt,
      state: state === 'done' ? ('done' as const) : state === 'failed' ? ('failed' as const) : ('doing' as const),
    },
  ];

  return (
    <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-2xl">
      <AutoRefresh active={state === 'pending'} everyMs={4000} />

      <header className="flex items-center justify-between bg-surface-container-low px-6 py-4">
        <Link href="/" aria-label={t('NobPay, accueil du site')}>
          <Logo className="text-[18px]" />
        </Link>
        <span className="rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant"><Tc>Reçu de paiement</Tc></span>
      </header>

      <div className="flex flex-col items-center px-6 pb-6 pt-8 text-center">
        <span className={`flex h-16 w-16 items-center justify-center rounded-full shadow-lg ${look.circle} ${state === 'done' ? 'nob-pop' : ''}`}>
          {state === 'pending' ? <Spinner className="h-8 w-8" /> : <Icon name={look.icon} size={36} />}
        </span>
        <p className={`mt-4 font-title-lg text-title-lg ${look.tone}`}>{t(look.title)}</p>
        <p className="mt-3 font-headline-xl-mobile text-[40px] font-bold leading-none tracking-tight text-on-surface">{payout.lightning ? formatSats(payout.lightning.amountSats, t) : formatFcfa(payout.amountFcfa, t)}</p>
        {payout.lightning && <p className="mt-1 font-label-md text-label-md text-on-surface-variant">≈ {formatFcfa(payout.amountFcfa, t)} <Tc>(taux indicatif)</Tc></p>}
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          <Tc>pour</Tc> <strong className="text-on-surface">{payout.supplier.name}</strong>
        </p>
        {simulated && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#FEF3C7] px-3 py-1 font-label-sm text-label-sm font-semibold text-[#B45309]">
            <Icon name="science" size={14} /> <Tc>Démonstration : aucun argent réel</Tc>
          </p>
        )}
      </div>

      <dl className="mx-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 rounded-2xl bg-surface-container-low p-4 font-body-sm text-body-sm">
        <dt className="text-on-surface-variant"><Tc>De la part de</Tc></dt>
        <dd className="text-right font-medium text-on-surface">{owner ? `${owner.firstName}` : t('Un financeur NobPay')}</dd>
        <dt className="text-on-surface-variant"><Tc>Pour</Tc></dt>
        <dd className="text-right font-medium text-on-surface">
          <Tc>{step.title}</Tc>
          <span className="block font-normal text-on-surface-variant">
            {project.name}, <Flag code="SN" className="inline-block h-2.5 w-4 align-middle" /> {project.city}
          </span>
        </dd>
        <dt className="text-on-surface-variant">{payout.lightning ? t('Destination') : t('Mobile money')}</dt>
        <dd className="text-right font-medium text-on-surface">
          <OperatorLogo network={payout.supplier.network} size={18} className="mr-1.5" />
          {SUPPLIER_NETWORKS[payout.supplier.network]}
          <span className="block font-normal text-on-surface-variant">{payout.lightning ? maskAddress(payout.lightning.address) : maskPhone(payout.supplier.phone)}</span>
        </dd>
        {payout.lightning && (
          <>
            <dt className="text-on-surface-variant"><Tc>Empreinte du paiement</Tc></dt>
            <dd className="break-all text-right font-mono text-[11px] text-on-surface">{payout.lightning.paymentHash}</dd>
          </>
        )}
        <dt className="text-on-surface-variant"><Tc>Date</Tc></dt>
        <dd className="text-right font-medium text-on-surface">{formatDateTime(payout.completedAt ?? payout.startedAt, t)}</dd>
        <dt className="text-on-surface-variant"><Tc>Référence</Tc></dt>
        <dd className="break-all text-right font-mono text-[11px] text-on-surface">{payout.reference}</dd>
      </dl>

      <ol className="mx-6 mt-5 flex flex-col" aria-label={t('Suivi du paiement')}>
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
              {p.at && <span className="font-label-sm text-label-sm text-on-surface-variant">{formatDateTime(p.at, t)}</span>}
            </span>
          </li>
        ))}
      </ol>

      <p className="mx-6 mb-6 mt-6 flex items-start gap-2 rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
        <Icon name="info" size={16} className="mt-px shrink-0" />
        {state === 'failed'
          ? t('Le paiement n’a pas abouti et aucun argent n’a été retiré de votre côté. Contactez la personne qui vous paie : elle peut le relancer. Gardez la référence ci-dessus.')
          : t('Ce reçu vient de NobPay. Si l’argent n’apparaît pas sur votre téléphone au bout de quelques minutes, contactez la personne qui vous paie en lui donnant la référence ci-dessus.')}
      </p>

      <footer className="border-t border-outline-variant/40 bg-surface-container-low px-6 py-4 text-center font-label-sm text-label-sm text-on-surface-variant">
        <Tc>Argent en séquestre, libéré étape par étape sur preuve.</Tc>{' '}
        <Link href="/" className="font-semibold text-primary underline">
          <Tc>Découvrir NobPay</Tc>
        </Link>
      </footer>
    </article>
  );
}
