import Link from 'next/link';
import { AuthForm } from '@/components/app/AuthForm';
import { FlowHeader } from '@/components/app/AppHeader';
import { Icon } from '@/components/ui/Icon';

export const metadata = { title: 'Créer un compte' };

export default function Register() {
  return (
    <main className="flex min-h-screen flex-col lg:min-h-0">
      <FlowHeader standalone title="Créer un compte" backHref="/app/bienvenue" />
      <section className="relative overflow-hidden bg-ocean px-space-md pb-space-2xl pt-space-md text-on-primary lg:hidden">
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative z-10 flex items-center justify-between">
          <span className="flex items-center gap-space-xs font-label-sm text-label-sm font-semibold uppercase tracking-wider text-surface-container-high">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10">
              <Icon name="shield_person" size={16} />
            </span>
            Inscription
          </span>
        </div>
        <div className="relative z-10 mt-space-md">
          <p className="font-label-md text-label-md text-surface-variant">Vos fonds restent en séquestre</p>
          <p className="font-headline-lg-mobile text-headline-lg-mobile font-bold tracking-tight text-surface-bright">Rejoindre la diaspora des bâtisseurs</p>
        </div>
      </section>
      <section className="relative z-20 -mt-6 flex-1 rounded-t-3xl bg-surface-container-lowest px-space-md pb-space-xl pt-space-lg shadow-[0_-8px_30px_rgba(10,15,36,0.08)] lg:mt-0 lg:flex-none lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none">
        <Link href="/app/bienvenue" className="mb-8 hidden items-center gap-1 font-label-md text-label-md text-on-surface-variant transition hover:text-primary lg:inline-flex">
          <Icon name="arrow_back" size={18} /> Retour
        </Link>
        <div className="mb-8 hidden lg:block">
          <h2 className="font-headline-xl text-headline-xl tracking-tight">
            Créer un <span className="font-accent text-[1.12em] font-normal italic tracking-normal text-primary-container">compte</span>
          </h2>
          <p className="mt-1 font-body-lg text-body-lg text-on-surface-variant">Rejoignez la diaspora des bâtisseurs. Vos fonds restent en séquestre.</p>
        </div>
        <AuthForm mode="register" />
      </section>
    </main>
  );
}
