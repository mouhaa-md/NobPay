import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

export const metadata = { title: 'Page introuvable' };

/** The 404 page, in French and with the way back (the Next.js default is English and has no link). */
export default async function NotFound() {
  const t = await getT();
  const primary = 'inline-flex h-11 items-center justify-center rounded-full bg-primary-container px-6 font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25';
  const secondary = 'inline-flex h-11 items-center justify-center rounded-full bg-surface-container px-5 font-label-lg text-label-lg font-semibold text-primary hover:bg-surface-container-high';
  return (
    <main id="contenu" className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <Link href="/" aria-label={t('NobPay, retour à l’accueil')}>
        <Logo className="text-[28px]" />
      </Link>
      <p className="font-label-md text-label-md font-semibold uppercase tracking-widest text-primary"><Tc>Erreur 404</Tc></p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface"><Tc>Cette page n’existe pas.</Tc></h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        <Tc>Le lien est peut-être périmé ou mal recopié. Rien n’est perdu : vos projets et vos fonds ne sont pas touchés.</Tc>
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={primary}>
          <Tc>Retour à l’accueil</Tc>
        </Link>
        <Link href="/app/accueil" className={secondary}>
          <Tc>Mon espace</Tc>
        </Link>
        <Link href="/verifier" className={secondary}>
          <Tc>Vérifier un dossier</Tc>
        </Link>
      </div>
    </main>
  );
}
