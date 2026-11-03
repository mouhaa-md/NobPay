'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

async function post(url: string, fallback: string): Promise<void> {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? fallback);
  }
}

/** Logout and (demo) reset buttons of the profile screen. A guest is asked to be sure: signing out closes its only door. */
export function ProfileActions({ demo, guest = false }: { demo: boolean; guest?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [busy, setBusy] = useState<'logout' | 'reset' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [error, setError] = useState('');

  const run = async (kind: 'logout' | 'reset') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'logout') {
        await post('/api/auth/logout', t('Une erreur est survenue'));
        router.replace('/app/bienvenue');
      } else {
        await post('/api/dev/reset', t('Une erreur est survenue'));
        setConfirmReset(false);
      }
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <ErrorNote>{error}</ErrorNote>
      {demo && (
        <div className="rounded-2xl bg-surface-container-low p-4">
          <p className="mb-1 font-title-md text-title-md"><Tc>Réinitialiser la démonstration</Tc></p>
          <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant"><Tc>Remet les trois projets d&apos;exemple dans leur état de départ. Les projets que vous avez créés sont effacés.</Tc></p>
          {confirmReset ? (
            <div className="flex gap-2">
              <button type="button" disabled={busy !== null} onClick={() => run('reset')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-error font-label-lg text-label-lg font-semibold text-on-error transition active:scale-[0.98] disabled:opacity-60">
                {busy === 'reset' ? <Spinner /> : <Icon name="restart_alt" size={20} />} <Tc>Oui, réinitialiser</Tc>
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className="h-11 rounded-full px-5 font-label-lg text-label-lg text-on-surface-variant hover:bg-surface-container">
                <Tc>Annuler</Tc>
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmReset(true)} className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-surface-container font-label-lg text-label-lg font-semibold text-on-surface transition hover:bg-surface-container-high">
              <Icon name="restart_alt" size={20} /> <Tc>Réinitialiser les données</Tc>
            </button>
          )}
        </div>
      )}
      {guest && confirmLogout ? (
        <div className="rounded-2xl bg-error-container p-4 text-on-error-container">
          <p className="mb-1 font-title-md text-title-md"><Tc>Se déconnecter d’un espace invité ?</Tc></p>
          <p className="mb-3 font-body-sm text-body-sm"><Tc>Cet espace n’a pas de numéro de téléphone. Si vous n’avez pas gardé votre lien de récupération (carte orange ci-dessus), vous ne le retrouverez plus, ni l’argent qui s’y trouve.</Tc></p>
          <div className="flex gap-2">
            <button type="button" disabled={busy !== null} onClick={() => run('logout')} className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full bg-error font-label-lg text-label-lg font-semibold text-on-error transition active:scale-[0.98] disabled:opacity-60">
              {busy === 'logout' ? <Spinner /> : <Icon name="logout" size={20} />} <Tc>Oui, me déconnecter</Tc>
            </button>
            <button type="button" onClick={() => setConfirmLogout(false)} className="h-11 rounded-full px-5 font-label-lg text-label-lg hover:bg-error/10">
              <Tc>Rester</Tc>
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => (guest ? setConfirmLogout(true) : run('logout'))}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-surface-container-lowest font-label-lg text-label-lg font-semibold text-error shadow-sm ring-1 ring-error/30 transition active:scale-[0.98] hover:bg-error-container/40 disabled:opacity-60"
        >
          {busy === 'logout' ? <Spinner /> : <Icon name="logout" size={20} />} <Tc>Se déconnecter</Tc>
        </button>
      )}
    </div>
  );
}
