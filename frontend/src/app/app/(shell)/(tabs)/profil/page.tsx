import Link from 'next/link';
import { AppHeader } from '@/components/app/AppHeader';
import { CopyButton } from '@/components/app/CopyButton';
import { InstallCard } from '@/components/app/InstallCard';
import { ProfileActions } from '@/components/app/ProfileActions';
import { Flag } from '@/components/ui/Flag';
import { Icon } from '@/components/ui/Icon';
import { Avatar, Chip, SectionTitle } from '@/components/ui/primitives';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';
import { readDb } from '@/server/db';
import { userProjects } from '@/server/views';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Profil' };

export default async function Profile() {
  const user = (await getSessionUser())!;
  const db = await readDb();
  const summaries = userProjects(db, user.id);
  const { mode } = getConfig();
  const country = RESIDENCE_COUNTRIES.find((c) => c.code === user.country);

  return (
    <>
      <AppHeader title="Profil" user={user} />
      <main className="flex flex-col gap-space-lg px-space-md pb-28 pt-20 lg:mx-auto lg:grid lg:w-full lg:max-w-[1100px] lg:grid-cols-2 lg:items-start lg:gap-8 lg:px-8 lg:pb-12 lg:pt-8">
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
              {user.demo && <Chip tone="warning" className="ml-1">Compte démo</Chip>}
            </p>
          </div>
        </section>

        <section>
          <SectionTitle>Mode de fonctionnement</SectionTitle>
          <div className="rounded-2xl bg-surface-container-low p-4">
            <p className="mb-1 flex items-center gap-2 font-title-md text-title-md">
              <Icon name={mode === 'mock' ? 'science' : 'verified_user'} size={20} className="text-primary" />
              {mode === 'mock' ? 'Démonstration (Bitnob simulé)' : 'Sandbox Bitnob'}
            </p>
            <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
              {mode === 'mock'
                ? "Les factures Lightning et les paiements mobile money sont simulés localement : aucun argent réel ne circule. La signature des événements, la chaîne de preuves et l'ancrage sur Bitcoin (OpenTimestamps) sont, eux, réels."
                : "Les appels partent vers l'API Bitnob en mode test. Les factures et les paiements sont créés chez Bitnob ; leur résultat nous parvient par webhook signé."}
            </p>
          </div>
        </section>

        {summaries.length > 0 && (
          <section>
            <SectionTitle>Vos équipes sur place</SectionTitle>
            <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">Chaque projet a un lien privé à envoyer à la personne de confiance. Elle y dépose ses photos et factures, sans compte.</p>
            <ul className="flex flex-col gap-2">
              {summaries.map(({ project }) => (
                <li key={project.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm">
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-label-lg text-label-lg text-on-surface">{project.managerName}</span>
                    <span className="truncate font-label-sm text-label-sm text-on-surface-variant">{project.name}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Link href={`/terrain/${project.managerToken}`} className="font-label-md text-label-md font-semibold text-primary hover:underline">
                      Ouvrir
                    </Link>
                    <CopyButton value={`/terrain/${project.managerToken}`} label="Copier le lien" />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <SectionTitle>Vérifier sans compte</SectionTitle>
          <Link href="/verifier" className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-md">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
              <Icon name="fact_check" size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-title-md text-title-md">Page de vérification publique</span>
              <span className="block font-body-sm text-body-sm text-on-surface-variant">Contrôlez un dossier sans faire confiance à NobPay.</span>
            </span>
            <Icon name="chevron_right" className="text-on-surface-variant" />
          </Link>
        </section>

        <InstallCard />

        <ProfileActions demo={!!user.demo && mode === 'mock' && getConfig().allowDemo} />

        <p className="text-center font-label-sm text-label-sm text-on-surface-variant/80 lg:col-span-2">
          NobPay · prototype Code &amp; Chain Dakar · code ouvert (licence MIT)
        </p>
      </main>
    </>
  );
}
