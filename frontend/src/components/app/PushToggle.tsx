'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { Tc, useT } from '@/lib/i18n/client';

type Scope = { kind: 'owner' } | { kind: 'manager'; token: string } | { kind: 'witness'; token: string };

const bytes = (b64url: string) => {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

type State = 'unknown' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

/**
 * "Prévenez-moi" : notifications on this phone. Shown only where the instance has VAPID keys. On an iPhone the browser only
 * allows them for an app added to the home screen, so the button says so instead of failing.
 */
export function PushToggle({ scope, publicKey }: { scope: Scope; publicKey: string }) {
  const t = useT();
  const [state, setState] = useState<State>('unknown');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      if (ios && !standalone) return alive && setState('needs-install');
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return alive && setState('unsupported');
      if (Notification.permission === 'denied') return alive && setState('blocked');
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return alive && setState('unsupported'); // no service worker: a development build
      const sub = await reg.pushManager.getSubscription();
      if (alive) setState(sub && Notification.permission === 'granted' ? 'on' : 'off');
    })().catch(() => alive && setState('unsupported'));
    return () => {
      alive = false;
    };
  }, []);

  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? t('Une erreur est survenue'));
  };

  const enable = async () => {
    setBusy(true);
    setError('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'off');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(publicKey) }));
      await post('/api/push/subscribe', { scope, subscription: sub.toJSON() });
      setState('on');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError('');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await post('/api/push/unsubscribe', { scope, endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState('off');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (state === 'unknown' || state === 'unsupported') return null;

  return (
    <section className="rounded-2xl bg-surface-container-low p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon name={state === 'on' ? 'notifications_active' : 'notifications'} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-title-md text-title-md"><Tc>Notifications sur ce téléphone</Tc></p>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            {state === 'needs-install' && <Tc>Sur iPhone, ajoutez d’abord NobPay à l’écran d’accueil (Partager, puis « Sur l’écran d’accueil »), puis rouvrez cette page depuis l’icône.</Tc>}
            {state === 'blocked' && <Tc>Les notifications sont bloquées pour ce site : autorisez-les dans les réglages du navigateur.</Tc>}
            {state === 'off' && <Tc>Soyez prévenu dès qu’il se passe quelque chose, sans ouvrir l’application.</Tc>}
            {state === 'on' && <Tc>Activées. Une notification ne contient qu’une phrase : jamais de solde ni d’adresse.</Tc>}
          </p>
        </div>
      </div>
      {(state === 'off' || state === 'on') && (
        <button
          type="button"
          disabled={busy}
          onClick={state === 'on' ? disable : enable}
          className={`mt-3 inline-flex h-10 items-center gap-2 rounded-full px-4 font-label-lg text-label-lg font-semibold disabled:opacity-60 ${state === 'on' ? 'bg-surface-container text-on-surface hover:bg-surface-container-high' : 'bg-primary-container text-on-primary shadow-md'}`}
        >
          {busy ? <Spinner /> : <Icon name={state === 'on' ? 'notifications_off' : 'notifications_active'} size={18} />}
          {state === 'on' ? <Tc>Désactiver</Tc> : <Tc>Activer les notifications</Tc>}
        </button>
      )}
      <ErrorNote>{error}</ErrorNote>
    </section>
  );
}
