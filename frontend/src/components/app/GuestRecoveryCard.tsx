'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';
import { ShareLink } from './ShareLink';

/**
 * Profile of a guest account: its second key. A guest has no phone number, so without this link a lost cookie means a
 * lost account (and the escrow in it). The link is never printed on screen: it is copied or sent.
 */
export function GuestRecoveryCard({ path, escrowCents }: { path: string; escrowCents: number }) {
  const t = useT();
  const router = useRouter();
  const [link, setLink] = useState(path);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const renew = async () => {
    setBusy(true);
    setError('');
    const res = await fetch('/api/auth/recovery', { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as { path?: string; error?: string };
    setBusy(false);
    if (!res.ok || !body.path) return setError(body.error ?? t('Une erreur est survenue'));
    setLink(body.path);
    setConfirm(false);
    router.refresh();
  };

  return (
    <section className="rounded-2xl bg-[#FFF7ED] p-4 ring-1 ring-[#F97316]/30">
      <p className="mb-1 flex items-center gap-2 font-title-md text-title-md text-[#9A3412]">
        <Icon name="key" size={20} /> <Tc>Votre clé de récupération</Tc>
      </p>
      <p className="mb-3 font-body-sm text-body-sm text-[#7C2D12]">
        {escrowCents > 0 ? <Tc>Un espace invité n’a pas de numéro de téléphone : sans ce lien, si ce navigateur est effacé ou si vous vous déconnectez, vous ne retrouverez plus cet espace ni l’argent qui s’y trouve.</Tc> : <Tc>Un espace invité n’a pas de numéro de téléphone : sans ce lien, si ce navigateur est effacé ou si vous vous déconnectez, vous ne retrouverez plus cet espace.</Tc>}{' '}
        <Tc>Envoyez-le-vous (messagerie, e-mail) ou copiez-le dans un endroit sûr. Celui qui l’a peut ouvrir cet espace.</Tc>
      </p>
      <ShareLink path={link} text={t('Mon lien pour retrouver mon espace NobPay :')} label={t('Me l’envoyer')} copyLabel={t('Copier le lien')} />
      <div className="mt-3">
        {confirm ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="w-full font-body-sm text-body-sm text-[#7C2D12]"><Tc>L’ancien lien cessera de fonctionner. Pensez à sauvegarder le nouveau.</Tc></p>
            <button type="button" disabled={busy} onClick={renew} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#9A3412] px-4 font-label-md text-label-md font-semibold text-white disabled:opacity-60">
              {busy ? <Spinner /> : <Icon name="autorenew" size={16} />} <Tc>Oui, renouveler</Tc>
            </button>
            <button type="button" onClick={() => setConfirm(false)} className="h-9 rounded-full px-4 font-label-md text-label-md text-[#7C2D12] hover:bg-[#FFEDD5]">
              <Tc>Annuler</Tc>
            </button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirm(true)} className="font-label-md text-label-md font-semibold text-[#9A3412] underline">
            <Tc>Renouveler le lien (si vous pensez qu’il a fuité)</Tc>
          </button>
        )}
        <ErrorNote>{error}</ErrorNote>
      </div>
    </section>
  );
}
