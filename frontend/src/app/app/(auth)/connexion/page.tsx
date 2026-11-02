import Link from 'next/link';
import { AuthForm } from '@/components/app/AuthForm';
import { FlowHeader } from '@/components/app/AppHeader';
import { getConfig } from '@/server/config';
import { DemoLoginButton } from '@/components/app/DemoLoginButton';
import { Icon } from '@/components/ui/Icon';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

// read at request time: the demo button depends on ALLOW_DEMO, which must not be frozen at build time
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Connexion' };

export default async function Login() {
  const t = await getT();
  return (
    <main id="contenu" className="flex min-h-screen flex-col lg:min-h-0">
      <FlowHeader standalone title={t('Connexion')} backHref="/app/bienvenue" />
      <section className="flex-1 px-space-md pb-space-xl pt-space-lg lg:flex-none lg:p-0">
        <Link href="/app/bienvenue" className="mb-8 hidden items-center gap-1 font-label-md text-label-md text-on-surface-variant transition hover:text-primary lg:inline-flex">
          <Icon name="arrow_back" size={18} /> <Tc>Retour</Tc>
        </Link>
        <h2 className="mb-1 font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight lg:font-headline-xl lg:text-headline-xl">
          <Tc>Bon</Tc> <span className="font-accent text-[1.12em] font-normal italic tracking-normal text-primary-container"><Tc>retour</Tc></span>
        </h2>
        <p className="mb-space-lg font-body-md text-body-md text-on-surface-variant lg:mb-8 lg:font-body-lg lg:text-body-lg"><Tc>Entrez votre numéro pour retrouver vos projets.</Tc></p>
        <AuthForm mode="login" />
        {getConfig().allowDemo && (
          <div className="mt-space-lg border-t border-outline-variant/40 pt-space-lg">
            <DemoLoginButton />
          </div>
        )}
      </section>
    </main>
  );
}
