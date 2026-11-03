import type { Metadata } from 'next';
import { ContributeFlow } from '@/components/app/ContributeFlow';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { SECTORS } from '@/lib/templates';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';
import { getConfig, isRealBitcoin } from '@/server/config';
import { findProjectByContributionToken, publicContributionView } from '@/server/contribution';
import { readDb } from '@/server/db';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Contribuer à un projet'), robots: { index: false, follow: false } };
}

export default async function Contribute(props: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const token = decodeURIComponent((await props.params).token);
  const db = await readDb();
  const project = findProjectByContributionToken(db, token);

  if (!project) {
    return (
      <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest p-6 shadow-2xl">
        <Logo className="mb-4 text-[18px]" />
        <p className="flex items-center gap-2 font-title-lg text-title-lg text-error">
          <Icon name="link_off" size={24} /> <Tc>Ce lien n’est plus valable</Tc>
        </p>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          <Tc>Il a été renouvelé, fermé, ou il est arrivé à son terme. Demandez le lien le plus récent à la personne qui vous l’a envoyé.</Tc>
        </p>
      </article>
    );
  }

  const view = publicContributionView(db, project);
  const cfg = getConfig();
  const real = isRealBitcoin();
  const sector = SECTORS[view.sector];
  const owner = view.ownerFirstName || t('Le financeur');

  return (
    <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-2xl">
      <div className="relative h-36 w-full overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.cover} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0F24]/85 via-[#0A0F24]/20 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-white">
          <p className="font-label-sm text-label-sm uppercase tracking-wider opacity-90"><Tc>{sector.label}</Tc> · {view.city}</p>
          <h1 className="font-headline-md text-headline-md font-bold tracking-tight">{view.name}</h1>
        </div>
      </div>

      <div className="flex flex-col gap-space-md p-6">
        <div>
          <p className="font-body-lg text-body-lg">
            {t('{owner} finance ce projet en séquestre : l’argent n’est libéré qu’étape par étape, sur preuve. Vous pouvez y ajouter votre part.', { owner })}
          </p>
          <div className="mt-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-surface-container-high" role="progressbar" aria-valuenow={view.percent} aria-valuemin={0} aria-valuemax={100} aria-label={t('Financement du projet')}>
              <div className="h-full rounded-full bg-primary-container" style={{ width: `${view.percent}%` }} />
            </div>
            <p className="mt-1 font-label-md text-label-md text-on-surface-variant">
              {t('Financé à {percent} % · {paid} étape payée sur {total}', { percent: view.percent, paid: view.paidSteps, total: view.steps })}
            </p>
          </div>
        </div>

        <ContributeFlow token={token} ownerFirstName={owner} maxUsd={real ? cfg.lightning.maxFundingUsd : 0} canSimulate={!real && cfg.allowDemo} />

        <div className="rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
          <p className="mb-1 flex items-center gap-1.5 font-label-md text-label-md font-semibold text-on-surface"><Icon name="shield_lock" size={18} className="text-primary" /> <Tc>Ce que fait cet argent</Tc></p>
          <ul className="list-disc space-y-1 pl-5">
            <li>{t('Il rejoint le séquestre du projet de {owner}, qui décide seul de chaque paiement.', { owner })}</li>
            <li>{t('Si le projet s’arrête, c’est {owner} qui peut reprendre le reste : ce n’est pas un remboursement automatique pour vous.', { owner })}</li>
            <li><Tc>Vous ne voyez pas le détail des paiements, et vous ne pouvez rien débloquer.</Tc></li>
          </ul>
        </div>
      </div>
    </article>
  );
}
