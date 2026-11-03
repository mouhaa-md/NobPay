'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

/** The witness's two buttons and an optional word for the funder. The link in the address is the credential. */
export function WitnessResponder({ token, stepId }: { token: string; stepId: string }) {
  const t = useT();
  const router = useRouter();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'confirmed' | 'disputed' | null>(null);
  const [error, setError] = useState('');

  const answer = async (verdict: 'confirmed' | 'disputed') => {
    setBusy(verdict);
    setError('');
    const res = await fetch(`/api/witness/${encodeURIComponent(token)}/respond`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stepId, verdict, note: note.trim() || undefined }),
    });
    if (res.ok) return router.refresh();
    setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('Une erreur est survenue'));
    setBusy(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="font-label-md text-label-md text-on-surface-variant"><Tc>Un mot pour le financeur (facultatif)</Tc></span>
        <textarea
          className="min-h-20 w-full resize-none rounded-2xl bg-surface-container-low p-3 font-body-md text-on-surface outline-none placeholder:text-outline focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container"
          rows={3}
          maxLength={300}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('Ex. Je suis passé : les fondations sont faites, mais pas le mur du fond.')}
        />
      </label>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => answer('confirmed')}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#15803D] font-label-lg text-label-lg font-bold text-white shadow-md transition active:scale-[0.98] disabled:opacity-60"
      >
        {busy === 'confirmed' ? <Spinner /> : <Icon name="check_circle" size={22} filled />} <Tc>Je confirme : cela correspond</Tc>
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={() => answer('disputed')}
        className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-container-lowest font-label-lg text-label-lg font-bold text-error ring-1 ring-error/40 transition active:scale-[0.98] hover:bg-error-container/40 disabled:opacity-60"
      >
        {busy === 'disputed' ? <Spinner /> : <Icon name="report" size={22} />} <Tc>Je conteste : cela ne correspond pas</Tc>
      </button>
      <ErrorNote>{error}</ErrorNote>
      <p className="text-center font-label-sm text-label-sm text-on-surface-variant"><Tc>Votre réponse ne peut pas être reprise une fois envoyée.</Tc></p>
    </div>
  );
}
