import type { Metadata } from 'next';
import { AutoRefresh } from '@/components/app/AutoRefresh';
import { ProofView } from '@/components/app/ProofView';
import { PushToggle } from '@/components/app/PushToggle';
import { WitnessResponder } from '@/components/app/WitnessResponder';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { formatDateTime } from '@/lib/money';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';
import { viewForWitness } from '@/server/witness';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Témoin'), robots: { index: false, follow: false } };
}

export default async function WitnessPage(props: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const token = decodeURIComponent((await props.params).token);
  const db = await readDb();
  const view = viewForWitness(db, token);

  if (!view) {
    return (
      <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest p-6 shadow-2xl">
        <Logo className="mb-4 text-[18px]" />
        <p className="flex items-center gap-2 font-title-lg text-title-lg text-error">
          <Icon name="link_off" size={24} /> <Tc>Ce lien n’est plus valable</Tc>
        </p>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          <Tc>Il a été renouvelé, retiré, ou il est arrivé à son terme. Demandez le lien le plus récent à la personne qui vous l’a envoyé.</Tc>
        </p>
      </article>
    );
  }

  const { project, step } = view;
  const witness = project.witness!;
  const owner = db.users.find((u) => u.id === project.ownerId);
  const answer = step?.proof?.witness;

  return (
    <article className="overflow-hidden rounded-[2rem] bg-surface-container-lowest shadow-2xl">
      <AutoRefresh active={!step} everyMs={15000} />
      <header className="flex items-center justify-between bg-surface-container-low px-6 py-4">
        <Logo className="text-[18px]" />
        <span className="rounded-full bg-surface-container px-3 py-1 font-label-sm text-label-sm font-semibold uppercase tracking-wider text-on-surface-variant"><Tc>Témoin</Tc></span>
      </header>

      <div className="flex flex-col gap-space-md p-6">
        <div>
          <h1 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">{t('Bonjour {name}', { name: witness.name })}</h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            {t('{owner} vous a demandé de regarder, de l’extérieur, les preuves du projet « {project} » à {city}.', { owner: owner?.firstName ?? t('Le financeur'), project: project.name, city: project.city })}
          </p>
        </div>

        {step?.proof ? (
          <>
            <section className="rounded-2xl bg-[#FFFBEB] p-4 ring-1 ring-[#F59E0B]/30">
              <p className="font-label-sm text-label-sm uppercase tracking-wider text-[#92400E]">{t('Étape {index} sur {total}', { index: step.index, total: project.steps.length })}</p>
              <p className="font-title-lg text-title-lg text-[#78350F]"><Tc>{step.title}</Tc></p>
              <p className="mt-1 font-body-sm text-body-sm text-[#92400E]">
                {t('Preuve envoyée le {date}. Ce que vous voyez ci-dessous correspond-il à ce que cette étape annonce ?', { date: formatDateTime(step.proof.submittedAt) })}
              </p>
            </section>

            <ProofView proof={step.proof} projectId={project.id} token={token} hideDestination />

            {answer ? (
              <section className={`rounded-2xl p-4 ${answer.verdict === 'confirmed' ? 'bg-[#DCFCE7] text-[#14532D]' : 'bg-error-container text-on-error-container'}`} role="status">
                <p className="flex items-center gap-2 font-title-md text-title-md">
                  <Icon name={answer.verdict === 'confirmed' ? 'check_circle' : 'report'} size={22} filled />
                  {answer.verdict === 'confirmed' ? t('Vous avez confirmé cette preuve') : t('Vous avez contesté cette preuve')}
                </p>
                <p className="mt-1 font-body-sm text-body-sm">{t('Le {date}. Merci : le financeur le voit, et c’est inscrit au registre.', { date: formatDateTime(answer.at) })}</p>
              </section>
            ) : (
              <WitnessResponder token={token} stepId={step.id} />
            )}
          </>
        ) : (
          <section className="rounded-2xl bg-surface-container-low p-4">
            <p className="flex items-center gap-2 font-title-md text-title-md">
              <Icon name="hourglass_top" size={22} className="text-primary" /> <Tc>Rien à regarder pour le moment</Tc>
            </p>
            <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">
              <Tc>Quand la personne sur place enverra une nouvelle preuve, elle apparaîtra ici. Cette page se met à jour toute seule.</Tc>
            </p>
          </section>
        )}

        {getConfig().push.enabled && <PushToggle scope={{ kind: 'witness', token }} publicKey={getConfig().push.publicKey} />}

        <p className="rounded-2xl bg-surface-container-low p-3.5 font-label-sm text-label-sm text-on-surface-variant">
          {t('Votre avis est donné au financeur et inscrit au registre public sous le nom « {name} ». Il ne déclenche aucun paiement.', { name: witness.name })}
          {witness.required && ` ${t('Le financeur a choisi de ne rien payer tant que vous n’avez pas confirmé.')}`}
        </p>
      </div>
    </article>
  );
}
