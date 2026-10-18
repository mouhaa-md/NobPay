'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { formatFcfa, formatUsd } from '@/lib/money';

/** Big escrow balance with the hide/show eye of the Stitch design. */
export function BalanceCard({ escrowCents, rate }: { escrowCents: number; rate: number }) {
  const [hidden, setHidden] = useState(false);
  return (
    <div className="relative z-10 rounded-2xl bg-white/10 p-4 shadow-[0_8px_32px_rgba(0,0,0,0.18)] backdrop-blur-xl">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-label-sm text-label-sm font-semibold uppercase tracking-wider text-surface-variant">Total en séquestre</span>
        <button type="button" aria-label={hidden ? 'Afficher le solde' : 'Masquer le solde'} className="flex items-center text-surface-variant transition hover:text-white" onClick={() => setHidden((h) => !h)}>
          <Icon name={hidden ? 'visibility_off' : 'visibility'} size={17} />
        </button>
      </div>
      <div className="mb-1.5 font-headline-xl-mobile text-headline-xl-mobile font-bold tracking-tight text-white">{hidden ? '••••••••' : formatUsd(escrowCents)}</div>
      <div className={`font-body-sm text-body-sm font-medium text-surface-variant transition-opacity ${hidden ? 'opacity-30' : ''}`}>
        ≈ {hidden ? '••••••' : formatFcfa((escrowCents / 100) * rate)} <span className="opacity-70">(taux indicatif)</span>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-2.5">
        <Link href="/app/projets" className="flex h-12 items-center justify-center gap-2 rounded-full bg-white font-label-lg text-label-lg text-on-surface shadow-lg transition hover:bg-slate-50 active:scale-95">
          <Icon name="add_circle" size={20} className="text-primary" />
          Financer
        </Link>
        <Link href="/app/projets/nouveau" className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-label-lg text-label-lg text-on-primary shadow-lg transition hover:bg-primary-container active:scale-95">
          <Icon name="create_new_folder" size={19} />
          Nouveau projet
        </Link>
      </div>
    </div>
  );
}
