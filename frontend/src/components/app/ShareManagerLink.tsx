'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { CopyButton } from './CopyButton';

/** Gives the private "field" link to the person on site: system share sheet when available, WhatsApp otherwise. */
export function ShareManagerLink({ token, managerName, projectName, projectId }: { token: string; managerName: string; projectName: string; projectId?: string }) {
  const router = useRouter();
  const path = `/terrain/${token}`;
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  /** The old link stops working at once; the new one lasts 90 days. */
  const renew = async () => {
    if (!projectId) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/manager-token`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Renouvellement impossible');
      setAsking(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    const text = `Bonjour ${managerName}, voici le lien pour envoyer les photos et les factures du projet « ${projectName} » : ${url}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'NobPay', text, url });
        return;
      } catch {
        /* cancelled: nothing to do */
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-container px-4 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition hover:bg-primary active:scale-95"
      >
        <Icon name="share" size={16} /> Envoyer le lien
      </button>
      <CopyButton value={path} label="Copier" />
      {projectId && !asking && (
        <button type="button" onClick={() => setAsking(true)} className="font-label-md text-label-md font-semibold text-on-surface-variant underline underline-offset-4 hover:text-primary">
          Renouveler le lien
        </button>
      )}
      {asking && (
        <span className="flex w-full flex-wrap items-center gap-2 rounded-2xl bg-tertiary-fixed/50 p-2.5 font-body-sm text-body-sm text-on-tertiary-fixed">
          L&apos;ancien lien cessera de fonctionner. Renouveler ?
          <button type="button" disabled={busy} onClick={renew} className="font-semibold underline disabled:opacity-60">
            {busy ? 'Un instant…' : 'Oui, renouveler'}
          </button>
          <button type="button" disabled={busy} onClick={() => setAsking(false)} className="font-semibold underline">
            Annuler
          </button>
        </span>
      )}
      {error && <span className="w-full font-body-sm text-body-sm text-error">{error}</span>}
    </div>
  );
}
