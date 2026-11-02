'use client';

import { useRef, useState } from 'react';
import { CheckRow } from '@/components/verify/CheckRow';
import { DossierSummary } from '@/components/verify/DossierSummary';
import { NostrCheck } from '@/components/verify/NostrCheck';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote } from '@/components/ui/primitives';
import { verifyDossier, type DossierReport } from '@/lib/verify';
import { Tc, useT } from '@/lib/i18n/client';

/** Checks a dossier .json picked from the device: nothing is uploaded, everything is computed locally. */
export function VerifyFile() {
  const t = useT();
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [report, setReport] = useState<DossierReport | null>(null);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setReport(null);
    if (file.size > 5 * 1024 * 1024) return setError(t('Fichier trop lourd pour un dossier NobPay.'));
    setName(file.name);
    try {
      setReport(await verifyDossier(await file.text()));
    } catch {
      setError(t('Impossible de lire ce fichier.'));
    }
  };

  return (
    <div className="flex flex-col gap-space-md">
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          load(e.dataTransfer.files[0]);
        }}
        className={`flex flex-col items-center gap-2 rounded-3xl border-2 border-dashed p-space-lg text-center transition ${over ? 'border-primary-container bg-primary/5' : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container-low'}`}
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Icon name="upload_file" size={26} />
        </span>
        <span className="font-title-md text-title-md">{name || t('Choisir un dossier .json')}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant"><Tc>Le fichier reste sur votre appareil : rien n&apos;est envoyé.</Tc></span>
      </button>
      <input ref={input} type="file" accept=".json,application/json" aria-label={t('Choisir le fichier du dossier (.json)')} className="sr-only" onChange={(e) => load(e.target.files?.[0])} />
      <ErrorNote>{error}</ErrorNote>

      {report && (
        <>
          {report.error ? (
            <ErrorNote>{report.error}</ErrorNote>
          ) : (
            <ul className="flex flex-col gap-2.5">
              <CheckRow state={report.chainOk && report.headOk ? 'ok' : 'bad'} title={t('Le registre est cohérent')}>
                {report.chainOk && report.headOk ? t('{eventCount} événements enchaînés, aucune modification détectée.', { eventCount: report.eventCount }) : t('La chaîne est rompue à l\'événement {v} : ce dossier a été modifié.', { v: report.brokenAt ?? '?' })}
              </CheckRow>
              {report.dossier && report.chainOk && <NostrCheck ledger={report.dossier.ledger} />}
              <CheckRow state="idle" title={t('Empreinte du fichier (SHA-256)')}>
                <code className="break-all font-mono text-[11px]">{report.digest}</code>
                <span className="mt-1 block"><Tc>Comparez-la à celle de la preuve .ots sur opentimestamps.org pour savoir quand ce dossier a été ancré sur Bitcoin.</Tc></span>
              </CheckRow>
            </ul>
          )}
          {report.dossier && <DossierSummary dossier={report.dossier} />}
        </>
      )}
    </div>
  );
}
