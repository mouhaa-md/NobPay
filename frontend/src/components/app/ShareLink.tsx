'use client';

import { Icon } from '@/components/ui/Icon';
import { CopyButton } from './CopyButton';

/**
 * Sends a link with a short message: the phone's share sheet when there is one, WhatsApp otherwise.
 * `path` is an absolute path of this site (the origin is added in the browser, so it works on any host).
 * `text` ends where the link goes: it is appended after a space.
 */
export function ShareLink({ path, text, label = 'Envoyer le lien', copyLabel = 'Copier', title = 'NobPay' }: { path: string; text: string; label?: string; copyLabel?: string; title?: string }) {
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    const message = `${text} ${url}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, text: message });
      } catch {
        /* cancelled */
      }
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-container px-4 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition hover:bg-primary active:scale-95"
      >
        <Icon name="share" size={16} /> {label}
      </button>
      <CopyButton value={path} label={copyLabel} />
    </div>
  );
}
