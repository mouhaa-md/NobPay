'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner, buttonPrimary } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

/** Opens a guest account again with the recovery link of this page. */
export function RecoverButton({ token }: { token: string }) {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={buttonPrimary}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const res = await fetch('/api/auth/recover', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });
          if (res.ok) {
            router.push('/app/accueil');
            router.refresh();
          } else {
            setError((await res.json().catch(() => ({}))).error ?? t('Une erreur est survenue'));
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <Icon name="lock_open" size={20} />}
        <span><Tc>Retrouver mon espace</Tc></span>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
