import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DemoLoginButton } from '@/components/app/DemoLoginButton';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { buttonPrimary, buttonSecondary } from '@/components/ui/primitives';
import { getSessionUser } from '@/server/auth';
import { getConfig } from '@/server/config';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bienvenue' };

export default async function Welcome() {
  if (await getSessionUser()) redirect('/app/accueil');
  const mode = getConfig().mode;

  return (
    <main className="flex min-h-screen flex-col">
      <section className="relative overflow-hidden bg-ocean px-6 pb-14 pt-6 text-on-primary pt-safe">
        <div className="pointer-events-none absolute -left-16 -top-16 h-56 w-56 rounded-full bg-primary-container/30 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 top-1/3 h-64 w-64 rounded-full bg-[#F7931A]/20 blur-3xl" />

        <div className="relative z-10 flex items-center justify-between">
          <Logo tone="light" className="text-[20px]" />
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-label-sm text-label-sm text-primary-fixed backdrop-blur-md">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            {mode === 'mock' ? 'Mode démo' : 'Sandbox Bitnob'}
          </span>
        </div>

        {/* Three sectors, one promise: photo collage */}
        <div className="relative z-10 mx-auto my-6 h-[290px] w-full max-w-[320px]">
          <div data-nm-float="a" className="absolute left-0 top-6 h-[190px] w-[170px] -rotate-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/villa-thies.jpg" alt="Chantier de villa à Thiès" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <div data-nm-float="b" className="absolute right-0 top-0 h-[140px] w-[150px] rotate-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/champ-kaolack.jpg" alt="Champ de mil à Kaolack" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <div data-nm-float="a" className="absolute bottom-0 right-3 h-[120px] w-[190px] -rotate-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/boutique-sandaga.jpg" alt="Boutique à Sandaga, Dakar" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <span className="absolute -left-1 bottom-6 flex -rotate-3 items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-label-md text-label-md text-on-surface shadow-lg backdrop-blur-md">
            <Icon name="verified" filled size={18} className="text-[#F7931A]" /> Preuve ancrée sur Bitcoin
          </span>
          <span className="absolute right-0 top-[150px] flex rotate-3 items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-label-md text-label-md text-on-surface shadow-lg backdrop-blur-md">
            Immobilier · Agricole · Commerce
          </span>
        </div>
      </section>

      <section className="relative z-20 -mt-8 flex flex-1 flex-col rounded-t-[32px] bg-surface-container-lowest px-6 pb-8 pt-7 shadow-[0_-8px_30px_rgba(10,15,36,0.12)] pb-safe">
        <div className="mb-5 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="h-1.5 w-7 rounded-full bg-primary" />
          <span className="h-1.5 w-1.5 rounded-full bg-surface-variant" />
          <span className="h-1.5 w-1.5 rounded-full bg-surface-variant" />
        </div>
        <div className="mb-7 flex flex-col gap-2.5 text-center">
          <h2 className="font-headline-xl-mobile text-headline-xl-mobile tracking-tight text-on-surface">
            Investissez au pays.
            <br />
            <span className="text-primary-container">Avec preuve.</span>
          </h2>
          <p className="mx-auto max-w-sm font-body-md text-body-md leading-relaxed text-on-surface-variant">
            Financez vos projets immobiliers, agricoles et commerciaux au pays. Vos fonds restent en séquestre et ne sont libérés que sur preuve.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Link href="/app/inscription" className={buttonPrimary}>
            <span>Créer un compte</span>
            <Icon name="arrow_forward" size={18} />
          </Link>
          <Link href="/app/connexion" className={buttonSecondary}>
            Connexion
          </Link>
          <DemoLoginButton />
        </div>

        <div className="mt-6 flex flex-col items-center gap-3">
          <Link href="/verifier" className="inline-flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant underline decoration-outline-variant underline-offset-4 hover:text-primary">
            <Icon name="search_check" size={16} /> Vérifier un dossier sans compte
          </Link>
          <p className="flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
            <Icon name="lock" size={15} className="text-tertiary-container" /> Fonds en séquestre, libérés étape par étape sur preuve
          </p>
        </div>
      </section>
    </main>
  );
}
