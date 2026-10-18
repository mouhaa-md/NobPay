'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/app/CopyButton';

/** QR code + copy button of the page being viewed, to hand the verification to someone else. */
export function PageQr() {
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(window.location.href), []);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
      <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-outline-variant/40">{url ? <QRCodeSVG value={url} size={96} level="M" marginSize={0} title="QR code de cette page" /> : <div className="h-24 w-24" />}</div>
      <div className="min-w-0">
        <p className="font-title-md text-title-md">Montrer cette vérification</p>
        <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant">Une banque, un notaire, un proche : ils peuvent scanner et contrôler eux-mêmes.</p>
        <CopyButton value={url || '/'} label="Copier le lien" />
      </div>
    </div>
  );
}
