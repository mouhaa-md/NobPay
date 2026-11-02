'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner, buttonGhost } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

/** One tap into the pre-filled demo account (Aminata Sow, three projects at different stages). */
export function DemoLoginButton() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={buttonGhost}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          const res = await fetch('/api/auth/demo', { method: 'POST' });
          if (res.ok) {
            router.push('/app/accueil');
            router.refresh();
          } else {
            setError((await res.json().catch(() => ({}))).error ?? t('Compte de démonstration indisponible'));
            setBusy(false);
          }
        }}
      >
        {busy ? <Spinner /> : <Icon name="play_circle" size={20} className="text-primary" />}
        <span><Tc>Essayer avec le compte démo</Tc></span>
      </button>
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
}
