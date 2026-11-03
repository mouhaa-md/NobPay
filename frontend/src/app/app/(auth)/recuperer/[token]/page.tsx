import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FlowHeader } from '@/components/app/AppHeader';
import { RecoverButton } from '@/components/app/RecoverButton';
import { Icon } from '@/components/ui/Icon';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';
import { getSessionUser } from '@/server/auth';
import { readDb } from '@/server/db';
import { guestForRecoveryToken } from '@/server/guestRecovery';

export const dynamic = 'force-dynamic';
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t('Retrouver mon espace'), robots: { index: false, follow: false } };
}

export default async function Recover(props: { params: Promise<{ token: string }> }) {
  const t = await getT();
  const { token } = await props.params;
  const valid = !!guestForRecoveryToken(await readDb(), decodeURIComponent(token));
  // already inside this very account: nothing to recover
  const current = await getSessionUser();
  if (valid && current?.guest && token.startsWith(`${current.id}.`)) redirect('/app/accueil');

  return (
    <main id="contenu" className="flex min-h-screen flex-col lg:min-h-0">
      <FlowHeader standalone title={t('Retrouver mon espace')} backHref="/app/bienvenue" />
      <section className="flex flex-1 flex-col gap-space-md px-space-md pb-space-xl pt-space-lg lg:flex-none lg:p-0">
        {valid ? (
          <>
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight">
              <Tc>Retrouver votre espace invité</Tc>
            </h2>
            <p className="font-body-md text-body-md text-on-surface-variant">
              <Tc>Ce lien rouvre l’espace invité où se trouvent vos projets et votre séquestre. Gardez-le comme un mot de passe : celui qui l’a peut ouvrir cet espace.</Tc>
            </p>
            <RecoverButton token={decodeURIComponent(token)} />
          </>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-2xl bg-error-container p-4 text-on-error-container">
            <p className="flex items-center gap-2 font-title-md text-title-md">
              <Icon name="link_off" size={22} /> <Tc>Ce lien n’est plus valable</Tc>
            </p>
            <p className="font-body-md text-body-md">
              <Tc>Il a été renouvelé, ou il est incomplet. Cherchez le lien le plus récent dans le profil de l’espace où vous l’avez créé.</Tc>
            </p>
            <Link href="/app/bienvenue" className="font-label-lg text-label-lg font-semibold underline">
              <Tc>Retour à l’accueil</Tc>
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
