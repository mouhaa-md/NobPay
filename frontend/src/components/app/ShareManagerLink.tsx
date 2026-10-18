'use client';

import { Icon } from '@/components/ui/Icon';
import { CopyButton } from './CopyButton';

/** Gives the private "field" link to the person on site: system share sheet when available, WhatsApp otherwise. */
export function ShareManagerLink({ token, managerName, projectName }: { token: string; managerName: string; projectName: string }) {
  const path = `/terrain/${token}`;

  const share = async () => {
    const url = `${window.location.origin}${path}`;
    const text = `Bonjour ${managerName}, voici le lien pour envoyer les photos et les factures du projet « ${projectName} » : ${url}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'NobPay', text, url });
        return;
      } catch {
        /* cancelled: nothing to do */
        return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={share}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-container px-4 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition hover:bg-primary active:scale-95"
      >
        <Icon name="share" size={16} /> Envoyer le lien
      </button>
      <CopyButton value={path} label="Copier" />
    </div>
  );
}
