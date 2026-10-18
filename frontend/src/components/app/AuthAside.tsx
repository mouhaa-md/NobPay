import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';

const POINTS = [
  { icon: 'fact_check', title: 'Chaque paiement exige une preuve', text: 'Photos, facture, titre foncier : vous regardez, puis vous validez.' },
  { icon: 'smartphone', title: 'Le fournisseur est payé directement', text: 'En mobile money, sans que l’argent passe par un intermédiaire sur place.' },
  { icon: 'currency_bitcoin', title: 'Un dossier que tout le monde peut vérifier', text: 'Son empreinte est ancrée sur Bitcoin, contrôlable sans compte.' },
];

/** Brand panel of the sign-in screens on a computer (hidden on phones, where each page has its own hero). */
export function AuthAside({ mode }: { mode: 'mock' | 'sandbox' }) {
  return (
    <aside className="relative hidden overflow-hidden bg-ocean text-on-primary lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:px-12 lg:py-10 xl:px-16">
      <div className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary-container/30 blur-3xl" />
      <div className="pointer-events-none absolute -right-28 top-1/3 h-96 w-96 rounded-full bg-[#F7931A]/15 blur-3xl" />

      <div className="relative z-10 flex items-center justify-between">
        <Link href="/" aria-label="NobPay, accueil du site">
          <Logo tone="light" className="text-[24px]" />
        </Link>
        <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-label-sm text-label-sm text-primary-fixed backdrop-blur-md">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          {mode === 'mock' ? 'Mode démo' : 'Sandbox Bitnob'}
        </span>
      </div>

      <div className="relative z-10 flex flex-col gap-8">
        <div>
          <h2 className="font-headline-xl text-[clamp(40px,4.4vw,60px)] font-semibold leading-[1.04] tracking-tight">
            Investissez au pays.
            <br />
            <span className="font-accent text-[1.12em] font-normal italic tracking-normal text-primary-fixed-dim">Avec preuve.</span>
          </h2>
          <p className="mt-4 max-w-md font-body-lg text-body-lg text-surface-variant">
            L&apos;argent de la diaspora reste en séquestre. Il n&apos;est libéré qu&apos;étape par étape, sur preuve.
          </p>
        </div>

        {/* Three sectors, one promise */}
        <div className="relative mx-auto h-[300px] w-full max-w-[470px] self-start xl:h-[330px] [@media(max-height:620px)]:hidden">
          <div data-nm-float="a" className="absolute left-0 top-8 h-[210px] w-[190px] -rotate-3 xl:h-[235px] xl:w-[210px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/immobilier.jpg" alt="Projet immobilier" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <div data-nm-float="b" className="absolute right-4 top-0 h-[150px] w-[190px] rotate-3 xl:h-[165px] xl:w-[210px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/agricole.jpg" alt="Pépinière, projet agricole" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <div data-nm-float="a" className="absolute bottom-0 right-0 h-[130px] w-[220px] -rotate-2 xl:h-[145px] xl:w-[240px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/covers/commerce.jpg" alt="Port et conteneurs, projet de commerce" className="h-full w-full rounded-3xl border-4 border-white/20 object-cover shadow-2xl" />
          </div>
          <span className="absolute bottom-7 left-1 flex -rotate-3 items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-label-md text-label-md text-on-surface shadow-lg backdrop-blur-md">
            <Icon name="verified" filled size={18} className="text-[#F7931A]" /> Preuve ancrée sur Bitcoin
          </span>
          <span className="absolute right-6 top-[165px] flex rotate-3 items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 py-1.5 font-label-md text-label-md text-on-surface shadow-lg backdrop-blur-md">
            Immobilier · Agricole · Commerce
          </span>
        </div>
      </div>

      <ul className="relative z-10 grid gap-4 [@media(max-height:780px)]:hidden">
        {POINTS.map((p) => (
          <li key={p.title} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-primary-fixed backdrop-blur-md">
              <Icon name={p.icon} size={20} />
            </span>
            <span>
              <span className="block font-title-md text-title-md text-white">{p.title}</span>
              <span className="block font-body-sm text-body-sm text-surface-variant/90">{p.text}</span>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
