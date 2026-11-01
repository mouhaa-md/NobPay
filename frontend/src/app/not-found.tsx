import Link from 'next/link';
import { Logo } from '@/components/ui/Logo';

export const metadata = { title: 'Page introuvable' };

/** The 404 page, in French and with the way back (the Next.js default is English and has no link). */
export default function NotFound() {
  const primary = 'inline-flex h-11 items-center justify-center rounded-full bg-primary-container px-6 font-label-lg text-label-lg font-bold text-on-primary shadow-lg shadow-primary/25';
  const secondary = 'inline-flex h-11 items-center justify-center rounded-full bg-surface-container px-5 font-label-lg text-label-lg font-semibold text-primary hover:bg-surface-container-high';
  return (
    <main id="contenu" className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-5 px-6 py-12 text-center">
      <Link href="/" aria-label="NobPay, retour à l’accueil">
        <Logo className="text-[28px]" />
      </Link>
      <p className="font-label-md text-label-md font-semibold uppercase tracking-widest text-primary">Erreur 404</p>
      <h1 className="font-headline-lg text-headline-lg text-on-surface">Cette page n’existe pas.</h1>
      <p className="font-body-md text-body-md text-on-surface-variant">
        Le lien est peut-être périmé ou mal recopié. Rien n’est perdu : vos projets et vos fonds ne sont pas touchés.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link href="/" className={primary}>
          Retour à l’accueil
        </Link>
        <Link href="/app/accueil" className={secondary}>
          Mon espace
        </Link>
        <Link href="/verifier" className={secondary}>
          Vérifier un dossier
        </Link>
      </div>
    </main>
  );
}
