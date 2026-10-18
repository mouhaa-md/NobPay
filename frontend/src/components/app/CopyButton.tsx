'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';

/** Copies `value` (a path is turned into an absolute URL) and confirms for two seconds. */
export function CopyButton({ value, label = 'Copier', doneLabel = 'Copié', className = '' }: { value: string; label?: string; doneLabel?: string; className?: string }) {
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState(false);

  const copy = async () => {
    const text = value.startsWith('/') ? `${window.location.origin}${value}` : value;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked (http, old browser): fall back to a hidden textarea
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        if (!ok) throw new Error('copy failed');
      } catch {
        setFailed(true);
        setTimeout(() => setFailed(false), 2500);
        return;
      }
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={copy}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary transition hover:bg-surface-container-high active:scale-95 ${className}`}
    >
      <Icon name={done ? 'check' : 'content_copy'} size={16} />
      {failed ? 'Copie impossible' : done ? doneLabel : label}
    </button>
  );
}
