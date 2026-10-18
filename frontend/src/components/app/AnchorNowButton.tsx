'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';

/** Anchors the current ledger state on Bitcoin. Disabled when the last anchoring already covers everything. */
export function AnchorNowButton({ projectId, upToDate }: { projectId: string; upToDate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/anchors`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "L'ancrage a échoué");
      if (json.anchor?.status === 'failed') throw new Error(json.anchor.error ?? "Les serveurs OpenTimestamps n'ont pas répondu");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <ErrorNote>{error}</ErrorNote>
      <button
        type="button"
        onClick={run}
        disabled={busy || upToDate}
        className="flex h-12 w-full items-center justify-center gap-space-xs rounded-full bg-[#F7931A] font-label-lg text-label-lg font-bold text-white shadow-lg shadow-[#F7931A]/30 transition hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Spinner /> : <Icon name="currency_bitcoin" size={22} />} {upToDate ? 'Dernier état déjà ancré' : 'Ancrer l’état actuel sur Bitcoin'}
      </button>
    </div>
  );
}
