'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';
import { formatDate, formatUsdShort } from '@/lib/money';
import { ShareLink } from './ShareLink';

interface Props {
  projectId: string;
  projectName: string;
  /** `/contribuer/<token>` when the family link is open and valid, null otherwise */
  path: string | null;
  /** the link existed and has run out */
  expired: boolean;
  contributions: { id: string; name?: string; amountCents: number; at: string }[];
}

/** The funder opens a link the family can use to add to the escrow, and sees who added what. */
export function ContributionCard({ projectId, projectName, path, expired, contributions }: Props) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const call = async (what: string, init: RequestInit) => {
    setBusy(what);
    setError('');
    const res = await fetch(`/api/projects/${projectId}/contribution`, { ...init, headers: { 'content-type': 'application/json' } });
    setBusy(null);
    if (!res.ok) return setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('Une erreur est survenue'));
    router.refresh();
  };

  return (
    <section className="rounded-2xl bg-surface-container-low p-4 lg:p-6">
      <div className="mb-2 flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFEDD5] text-[#C26700]">
          <Icon name="groups" size={24} />
        </span>
        <div className="min-w-0">
          <p className="font-title-md text-title-md"><Tc>Cotisation familiale</Tc></p>
          <p className="font-body-sm text-body-sm text-on-surface-variant"><Tc>Un lien pour que la famille ajoute sa part au séquestre, depuis n’importe quel portefeuille Lightning.</Tc></p>
        </div>
      </div>

      {path ? (
        <div className="flex flex-col gap-3">
          <ShareLink path={path} text={t('Voici le lien pour participer au projet « {name} » :', { name: projectName })} label={t('Envoyer le lien')} copyLabel={t('Copier le lien')} />
          <p className="font-label-sm text-label-sm text-on-surface-variant"><Tc>Ce lien ne permet que d’ajouter de l’argent : il ne montre ni le solde ni les preuves, et ne débloque rien. Vous restez seul à décider, et seul à pouvoir reprendre le reste du séquestre.</Tc></p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-label-md text-label-md">
            <button type="button" disabled={busy !== null} onClick={() => call('renew', { method: 'POST', body: JSON.stringify({ renew: true }) })} className="font-semibold text-primary hover:underline disabled:opacity-60">
              {busy === 'renew' ? <Spinner /> : <Tc>Renouveler le lien</Tc>}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => call('close', { method: 'DELETE' })} className="font-semibold text-error hover:underline disabled:opacity-60">
              {busy === 'close' ? <Spinner /> : <Tc>Fermer le lien</Tc>}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {expired && <p className="rounded-xl bg-[#FEF3C7] px-3 py-2 font-label-md text-label-md text-[#B45309]"><Tc>Le lien est arrivé à son terme : ouvrez-en un nouveau.</Tc></p>}
          <button type="button" disabled={busy !== null} onClick={() => call('open', { method: 'POST', body: '{}' })} className="inline-flex h-11 w-fit items-center gap-2 rounded-full bg-primary-container px-5 font-label-lg text-label-lg font-bold text-on-primary shadow-md disabled:opacity-60">
            {busy === 'open' ? <Spinner /> : <Icon name="add_link" size={20} />} <Tc>Ouvrir le lien famille</Tc>
          </button>
        </div>
      )}

      {contributions.length > 0 && (
        <ul className="mt-3 flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-xl bg-surface-container-lowest">
          {contributions.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 font-body-sm text-body-sm">
              <span className="min-w-0 truncate">{c.name || t('Un proche')}</span>
              <span className="shrink-0 text-on-surface-variant">{formatDate(c.at)}</span>
              <strong className="shrink-0 text-[#15803D]">+{formatUsdShort(c.amountCents)}</strong>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
