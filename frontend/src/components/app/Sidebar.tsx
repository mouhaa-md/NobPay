'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/primitives';
import { RESIDENCE_COUNTRIES } from '@/lib/templates';
import type { FrameUser } from './AppFrame';

const ITEMS = [
  { href: '/app/accueil', label: 'Accueil', icon: 'home', match: (p: string) => p === '/app/accueil' },
  { href: '/app/projets', label: 'Projets', icon: 'folder', match: (p: string) => p.startsWith('/app/projets') || p.startsWith('/app/certificat') },
  { href: '/app/portefeuille', label: 'Portefeuille', icon: 'account_balance_wallet', match: (p: string) => p === '/app/portefeuille' },
  { href: '/app/notifications', label: 'Notifications', icon: 'notifications', match: (p: string) => p === '/app/notifications' },
  { href: '/app/profil', label: 'Profil', icon: 'person', match: (p: string) => p === '/app/profil' },
];

/** Left navigation of the computer layout. Hidden on phones, where the bottom bar does the job. */
export function Sidebar({ user, mode }: { user: FrameUser; mode: 'mock' | 'sandbox' }) {
  const pathname = usePathname();
  const country = RESIDENCE_COUNTRIES.find((c) => c.code === user.country)?.name;

  return (
    <aside className="fixed left-0 top-0 z-50 hidden h-screen w-[260px] flex-col justify-between bg-surface-container-lowest p-space-md shadow-[0_1px_8px_rgba(0,0,0,0.06)] lg:flex" aria-label="Menu principal">
      <div className="flex flex-col gap-space-lg">
        <Link href="/app/accueil" className="px-space-xs pt-space-xs" aria-label="NobPay, accueil">
          <Logo className="text-[22px]" />
        </Link>

        <Link
          href="/app/projets/nouveau"
          className="inline-flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-primary-container font-label-lg text-label-lg text-on-primary shadow-[0_4px_16px_rgba(29,78,216,0.25)] transition hover:bg-primary active:scale-95"
        >
          <Icon name="add" size={20} /> Nouveau projet
        </Link>

        <nav className="flex flex-col gap-space-2xs">
          {ITEMS.map((item) => {
            const active = item.match(pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-space-sm rounded-full px-space-md py-space-sm font-label-lg text-label-lg transition-all ${active ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container hover:text-on-surface'}`}
              >
                <Icon name={item.icon} size={20} filled={active} /> {item.label}
              </Link>
            );
          })}
          <div className="my-space-xs h-px bg-outline-variant/40" />
          <Link href="/verifier" className="flex items-center gap-space-sm rounded-full px-space-md py-space-sm font-label-lg text-label-lg text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface">
            <Icon name="fact_check" size={20} /> Vérifier un dossier
            <Icon name="north_east" size={14} className="ml-auto opacity-60" />
          </Link>
        </nav>
      </div>

      <div className="flex flex-col gap-space-xs">
        <p className={`flex items-center gap-1.5 rounded-xl px-space-sm py-space-xs font-label-sm text-label-sm ${mode === 'mock' ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#DCFCE7] text-[#15803D]'}`}>
          <Icon name={mode === 'mock' ? 'science' : 'verified_user'} size={16} />
          {mode === 'mock' ? 'Mode démonstration : paiements simulés' : 'Sandbox Bitnob'}
        </p>
        <Link href="/app/profil" className="flex items-center gap-space-xs rounded-lg bg-surface-container-low p-space-sm transition hover:bg-surface-container">
          <Avatar first={user.firstName} last={user.lastName} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-label-md text-label-md text-on-surface">
              {user.firstName} {user.lastName}
            </span>
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{country ?? 'Diaspora'}</span>
          </span>
        </Link>
      </div>
    </aside>
  );
}
