'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'nobpay-install-dismissed';

/**
 * "Add to Home Screen" card.
 *  - Chrome / Edge / Android: real install prompt (beforeinstallprompt).
 *  - iPhone / iPad (Safari): no API exists, so we show the two taps to do.
 */
export function InstallCard() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      /* storage blocked: still show the card */
    }
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
    if (standalone) return;
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIos(isIos);
    if (isIos) setHidden(false);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setHidden(false);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', () => setHidden(true));
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
  };

  if (hidden) return null;

  return (
    <div className="relative flex items-start gap-3 rounded-2xl bg-surface-container-low p-4 shadow-sm">
      <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon name="install_mobile" size={22} />
      </div>
      <div className="min-w-0 pr-6">
        <p className="mb-1 font-title-md text-title-md text-on-surface">Installer NobPay sur votre écran d&apos;accueil</p>
        <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
          Accès direct en plein écran, comme une application.
          {showHelp && ios && (
            <>
              {' '}
              Dans Safari, touchez <Icon name="ios_share" size={14} className="align-text-bottom" /> <strong>Partager</strong>, puis <strong>Sur l&apos;écran d&apos;accueil</strong>.
            </>
          )}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            className="h-8 rounded-full bg-primary px-4 font-label-sm text-label-sm font-semibold text-on-primary shadow-sm transition hover:bg-primary-container active:scale-95"
            onClick={async () => {
              if (event) {
                await event.prompt();
                const choice = await event.userChoice;
                if (choice.outcome === 'accepted') setHidden(true);
                setEvent(null);
              } else {
                setShowHelp(true);
              }
            }}
          >
            Installer
          </button>
          <button type="button" className="h-8 px-3 font-label-sm text-label-sm text-on-surface-variant hover:text-on-surface" onClick={dismiss}>
            Plus tard
          </button>
        </div>
      </div>
      <button type="button" aria-label="Fermer" className="absolute right-3 top-3 rounded-full p-1 text-on-surface-variant hover:text-on-surface" onClick={dismiss}>
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
