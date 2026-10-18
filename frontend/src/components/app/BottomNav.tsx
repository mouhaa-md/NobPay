'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

const TABS = [
  { href: '/app/accueil', label: 'Accueil', icon: 'home' },
  { href: '/app/projets', label: 'Projets', icon: 'folder' },
  { href: '/app/portefeuille', label: 'Portefeuille', icon: 'account_balance_wallet' },
  { href: '/app/profil', label: 'Profil', icon: 'person' },
] as const;

export function BottomNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const tab = (t: (typeof TABS)[number]) => {
    const active = pathname === t.href || (t.href === '/app/projets' && pathname.startsWith('/app/projets'));
    return (
      <Link
        key={t.href}
        href={t.href}
        aria-current={active ? 'page' : undefined}
        className={`flex h-12 w-16 flex-col items-center justify-center transition-colors ${active ? 'text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
      >
        <Icon name={t.icon} filled={active} />
        <span className={`mt-0.5 font-label-sm text-label-sm ${active ? 'font-bold' : ''}`}>{t.label}</span>
      </Link>
    );
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-on-surface/40 backdrop-blur-sm" onClick={() => setOpen(false)} role="presentation">
          <div
            role="dialog"
            aria-label="Actions rapides"
            className="nob-rise mb-24 w-full max-w-[448px] rounded-3xl bg-surface-container-lowest p-space-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <Link href="/app/projets/nouveau" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-container-low">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-container text-on-primary">
                <Icon name="add_business" />
              </span>
              <span>
                <span className="block font-title-md text-title-md">Nouveau projet</span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">Immobilier, agricole ou commerce</span>
              </span>
            </Link>
            <Link href="/app/projets" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl p-3 hover:bg-surface-container-low">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed">
                <Icon name="bolt" filled />
              </span>
              <span>
                <span className="block font-title-md text-title-md">Financer un projet</span>
                <span className="block font-body-sm text-body-sm text-on-surface-variant">Choisissez le projet à alimenter</span>
              </span>
            </Link>
          </div>
        </div>
      )}
      <nav
        aria-label="Navigation principale"
        className="pb-safe fixed bottom-0 left-1/2 z-50 w-full max-w-[480px] -translate-x-1/2 bg-surface-container-lowest/90 shadow-[0_-4px_20px_-2px_rgba(10,15,36,0.08)] backdrop-blur-xl"
      >
        <div className="relative flex h-16 items-center justify-around px-space-xs">
          {tab(TABS[0])}
          {tab(TABS[1])}
          <div className="relative -top-4 flex items-center justify-center">
            <button
              type="button"
              aria-label="Créer ou financer"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-[0_10px_20px_-4px_rgba(29,78,216,0.5)] transition-transform active:scale-95"
            >
              <Icon name={open ? 'close' : 'add'} size={28} />
            </button>
          </div>
          {tab(TABS[2])}
          {tab(TABS[3])}
        </div>
      </nav>
    </>
  );
}
