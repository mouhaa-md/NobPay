'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner, buttonGhost, buttonPrimary } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

/** "Try without an account": a private guest account for this browser, nothing to type. */
export function GuestLoginButton({ primary = false }: { primary?: boolean }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={primary ? buttonPrimary : buttonGhost}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const res = await fetch('/api/auth/guest', { method: 'POST' });
          if (res.ok) {
            router.push('/app/accueil');
            router.refresh();
          } else {
            setError((await res.json().catch(() => ({}))).error ?? t('Compte invité indisponible'));
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <Icon name="person_add" size={20} className={primary ? '' : 'text-primary'} />}
        <span><Tc>Essayer sans compte</Tc></span>
      </button>
      <p className="px-2 text-center font-label-sm text-label-sm text-on-surface-variant">
        <Tc>Un compte invité privé, sans numéro de téléphone. Il reste dans ce navigateur : c’est votre clé.</Tc>
      </p>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
