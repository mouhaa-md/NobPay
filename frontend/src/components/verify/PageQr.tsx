'use client';

import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useState } from 'react';
import { CopyButton } from '@/components/app/CopyButton';
import { Tc, useT } from '@/lib/i18n/client';

/** QR code + copy button of the page being viewed, to hand the verification to someone else. */
export function PageQr() {
  const t = useT();
  const [url, setUrl] = useState('');
  useEffect(() => setUrl(window.location.href), []);
  return (
    <div className="flex items-center gap-4 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
      <div className="shrink-0 rounded-xl bg-white p-2 ring-1 ring-outline-variant/40">{url ? <QRCodeSVG value={url} size={96} level="M" marginSize={0} title={t('QR code de cette page')} /> : <div className="h-24 w-24" />}</div>
      <div className="min-w-0">
        <p className="font-title-md text-title-md"><Tc>Montrer cette vérification</Tc></p>
        <p className="mb-2 font-body-sm text-body-sm text-on-surface-variant"><Tc>Une banque, un notaire, un proche : ils peuvent scanner et contrôler eux-mêmes.</Tc></p>
        <CopyButton value={url || '/'} label={t('Copier le lien')} />
      </div>
    </div>
  );
}
