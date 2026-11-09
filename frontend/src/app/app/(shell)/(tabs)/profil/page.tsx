import type { Metadata } from 'next';
import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { CopyButton } from '@/components/app/CopyButton';
import { InstallCard } from '@/components/app/InstallCard';
import { GuestRecoveryCard } from '@/components/app/GuestRecoveryCard';
import { ProfileActions } from '@/components/app/ProfileActions';
import { PushToggle } from '@/components/app/PushToggle';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Chip, SectionTitle } from '@/components/ui/primitives';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import { isAdmin } from '@/server/admin';
import { getSessionUser } from '@/server/auth';
import { INSTANCE } from '@/lib/instance';
import { getConfig, instanceMode } from '@/server/config';
import { recoveryTokenOf } from '@/server/guestRecovery';
import { managerLinkToken } from '@/server/managerToken';
import { readDb } from '@/server/db';
import { userProjects } from '@/server/views';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Profil') };
}

export default async function Profile() {
  const t = await getT();
  const user = (await getSessionUser())!;
  const db = await readDb();
  const summaries = userProjects(db, user.id);
  const { mode } = getConfig();
  const country = RESIDENCE_COUNTRIES.find((c) => c.code === user.country);

  return (
    <>
      <AppHeader title={t('Profil')} user={user} />
      <main id="contenu" className="flex flex-col gap-space-lg px-space-md pb-28 pt-20 lg:mx-auto lg:grid lg:w-full lg:max-w-[1100px] lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-8 lg:pb-12 lg:pt-8">
        <section className="flex items-center gap-4 rounded-3xl bg-surface-container-lowest p-4 shadow-sm">
          <Avatar first={user.firstName} last={user.lastName} size="lg" />
          <div className="min-w-0">
            <p className="truncate font-title-lg text-title-lg">
              {user.firstName} {user.lastName}
            </p>
            <p className="truncate font-body-sm text-body-sm text-on-surface-variant">{user.phone}</p>
            <p className="mt-1 flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
              {country && <Flag code={country.code} className="h-3.5 w-5 rounded-sm" />}
              {country?.name ?? 'Diaspora'}
              {user.demo && <Chip tone="warning" className="ml-1"><Tc>Compte démo</Tc></Chip>}
            </p>
          </div>
        </section>

        {user.guest && <GuestRecoveryCard path={`/app/recuperer/${recoveryTokenOf(user)}`} escrowCents={summaries.reduce((n, s) => n + s.escrow, 0)} />}

        <section>
          <SectionTitle><Tc>Mode de fonctionnement</Tc></SectionTitle>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="mb-1 flex items-center gap-2 font-title-md text-title-md">
              <Icon name={INSTANCE[instanceMode()].icon} size={20} className="text-primary" />
              {mode === 'mock' ? t('Démonstration (Bitnob simulé)') : t(INSTANCE[instanceMode()].short)}
            </p>
            <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
              <Tc>{INSTANCE[instanceMode()].about}</Tc>
            </p>
          </div>
        </section>

        {summaries.length > 0 && (
          <section>
            <SectionTitle><Tc>Vos équipes sur place</Tc></SectionTitle>
            <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant"><Tc>Chaque projet a un lien privé à envoyer à la personne de confiance. Elle y dépose ses photos et factures, sans compte.</Tc></p>
            <ul className="flex flex-col gap-2">
              {summaries.map(({ project }) => (
                <li key={project.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-label-lg text-label-lg text-on-surface">{project.managerName}</span>
                    <span className="truncate font-label-sm text-label-sm text-on-surface-variant">{project.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Link href={`/terrain/${managerLinkToken(project)}`} className="font-label-md text-label-md font-semibold text-primary hover:underline">
                      <Tc>Ouvrir</Tc>
                    </Link>
                    <CopyButton value={`/terrain/${managerLinkToken(project)}`} label={t('Copier le lien')} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle><Tc>Vérifier sans compte</Tc></SectionTitle>
          <Link href="/verifier" className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
              <Icon name="fact_check" size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-title-md text-title-md"><Tc>Page de vérification publique</Tc></span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant"><Tc>Contrôlez un dossier sans faire confiance à NobPay.</Tc></span>
            </span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Link>
        </section>

        {isAdmin(user) && (
          <section>
            <SectionTitle><Tc>Administration</Tc></SectionTitle>
            <Link href="/app/admin" className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-md">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container text-primary">
                <Icon name="admin_panel_settings" size={22} />
              </span>
              <span className="flex-1">
                <span className="block font-title-md text-title-md"><Tc>Tableau de bord administrateur</Tc></span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant"><Tc>Paiements, versements, ancrages et alertes. Lecture seule.</Tc></span>
              </span>
              <Icon name="chevron_right" className="text-on-surface-variant" />
            </Link>
          </section>
        )}

        <InstallCard />

        {getConfig().push.enabled && <PushToggle scope={{ kind: 'owner' }} publicKey={getConfig().push.publicKey} />}

        <ProfileActions demo={!!user.demo && mode === 'mock' && getConfig().allowDemo} guest={!!user.guest} />

        <p className="text-center font-label-sm text-label-sm text-on-surface-variant/80 lg:col-span-2">
          <Tc>NobPay · prototype · code ouvert (licence MIT)</Tc>
        </p>
      </main>
    </>
  );
}
