'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckRow, type CheckState } from '@/components/verify/CheckRow';
import { DossierSummary } from '@/components/verify/DossierSummary';
import { NostrCheck } from '@/components/verify/NostrCheck';
import { Icon } from '@/components/ui/Icon';
import { ErrorNote, Spinner } from '@/components/ui/primitives';
import { shortHash } from '@/lib/ledgerLabels';
import { formatDateTime, formatInt } from '@/lib/money';
import { verifyDossier, type DossierReport } from '@/lib/verify';
import type { AnchorView } from '@/server/anchors';
import { Tc, useT } from '@/lib/i18n/client';

/**
 * Public verification of one anchoring. The browser downloads the dossier, recomputes its SHA-256
 * and the whole hash chain itself; only the Bitcoin lookup goes through the server (convenience).
 */
export function VerifyAnchor({ initial }: { initial: AnchorView }) {
  const t = useT();
  const [anchor, setAnchor] = useState(initial);
  const [report, setReport] = useState<DossierReport | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [btcError, setBtcError] = useState('');

  const run = useCallback(async () => {
    setReport(null);
    setLoadError('');
    try {
      const res = await fetch(`/api/anchors/${initial.id}/dossier`, { cache: 'no-store' });
      if (!res.ok) throw new Error(t('Dossier introuvable'));
      setReport(await verifyDossier(await res.text(), initial.digest));
    } catch (e) {
      setLoadError((e as Error).message);
    }
  }, [initial.id, initial.digest]);

  useEffect(() => {
    run();
  }, [run]);

  const checkBitcoin = async () => {
    setBusy(true);
    setBtcError('');
    try {
      const res = await fetch(`/api/anchors/${anchor.id}/refresh`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? t('Vérification impossible'));
      setAnchor(json.anchor);
    } catch (e) {
      setBtcError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const digestState: CheckState = !report ? (loadError ? 'bad' : 'wait') : report.digestMatches ? 'ok' : 'bad';
  const chainState: CheckState = !report ? (loadError ? 'bad' : 'wait') : report.chainOk && report.headOk ? 'ok' : 'bad';
  const btcState: CheckState = anchor.status === 'confirmed' ? (anchor.blockCheck?.state === 'mismatch' ? 'bad' : 'ok') : anchor.status === 'failed' ? 'bad' : 'pending';

  return (
    <div className="flex flex-col gap-space-lg">
      <ul className="flex flex-col gap-2.5" aria-label={t('Résultat des vérifications')}>
        <CheckRow state={digestState} title={t('Le dossier est celui qui a été ancré')}>
          {loadError ? (
            loadError
          ) : !report ? (
            t('Calcul de l’empreinte SHA-256 dans votre navigateur…')
          ) : report.digestMatches ? (
            <>
              <Tc>L&apos;empreinte recalculée chez vous est identique :</Tc> <code className="font-mono text-[11px]">{shortHash(report.digest, 12, 8)}</code>
            </>
          ) : (
            t('Le fichier ne correspond pas à l’empreinte ancrée : il a été modifié.')
          )}
        </CheckRow>
        <CheckRow state={chainState} title={t('Le registre n’a pas été modifié')}>
          {!report
            ? loadError
              ? ''
              : t('Contrôle de chaque événement…')
            : report.chainOk && report.headOk
              ? t('{eventCount} événement{s} enchaîné{s2} : chaque empreinte contient celle de la précédente.', { eventCount: report.eventCount, s: report.eventCount > 1 ? 's' : '', s2: report.eventCount > 1 ? 's' : '' })
              : report.error ?? t('La chaîne est rompue à l\'événement {v}.', { v: report.brokenAt ?? '?' })}
        </CheckRow>
        {report?.dossier && report.chainOk && <NostrCheck ledger={report.dossier.ledger} />}
        <CheckRow state={btcState} title={t('L’empreinte est dans la blockchain Bitcoin')}>
          {anchor.status === 'confirmed' ? (
            <>
              <Tc>Inscrite dans le bloc</Tc> {anchor.bitcoinBlock ? formatInt(anchor.bitcoinBlock, t) : ''}
              {anchor.confirmedAt ? t(' (constaté le {formatDateTime})', { formatDateTime: formatDateTime(anchor.confirmedAt, t) }) : ''}.
              {anchor.blockCheck?.state === 'verified' && t(' Contrôle croisé avec un explorateur public : correspond.')}
              {anchor.blockCheck?.state === 'mismatch' && t(' Non vérifié localement : le contrôle croisé ne correspond pas, utilisez l’outil officiel ci-dessous.')}
              {anchor.blockCheck?.state === 'unavailable' && t(' Contrôle croisé indisponible pour l’instant.')}
            </>
          ) : anchor.status === 'failed' ? (
            (anchor.error ?? t('L’ancrage n’a pas pu être envoyé.'))
          ) : (
            t('Envoyée aux calendriers OpenTimestamps, en attente d’un bloc Bitcoin (en général quelques heures).')
          )}
        </CheckRow>
      </ul>

      <ErrorNote>{btcError}</ErrorNote>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={run} className="inline-flex h-10 items-center gap-2 rounded-full bg-surface-container px-4 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container-high">
          <Icon name="replay" size={18} /> <Tc>Relancer le contrôle</Tc>
        </button>
        {anchor.status !== 'failed' && (
          <button type="button" onClick={checkBitcoin} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-full bg-[#F7931A] px-4 font-label-md text-label-md font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-60">
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="currency_bitcoin" size={18} />} <Tc>Interroger Bitcoin</Tc>
          </button>
        )}
      </div>

      <section className="rounded-2xl bg-surface-container-low p-4">
        <h3 className="mb-1 flex items-center gap-2 font-title-md text-title-md">
          <Icon name="verified_user" size={20} className="text-primary" /> <Tc>Vérifier sans nous faire confiance</Tc>
        </h3>
        <p className="mb-3 font-body-sm text-body-sm text-on-surface-variant">
          <Tc>Ce site pourrait mentir. Les deux fichiers ci-dessous suffisent à tout contrôler, sans NobPay :</Tc>
        </p>
        <div className="mb-3 flex flex-wrap gap-2">
          <a href={`/api/anchors/${anchor.id}/dossier`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container-lowest px-3.5 font-label-md text-label-md font-semibold text-primary shadow-sm hover:bg-surface-container">
            <Icon name="description" size={16} /> <Tc>Dossier .json</Tc>
          </a>
          {anchor.hasOts && (
            <a href={`/api/anchors/${anchor.id}/ots`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container-lowest px-3.5 font-label-md text-label-md font-semibold text-primary shadow-sm hover:bg-surface-container">
              <Icon name="download" size={16} /> <Tc>Preuve .ots</Tc>
            </a>
          )}
        </div>
        <ol className="list-decimal space-y-1 pl-5 font-body-sm text-body-sm text-on-surface-variant">
          <li>
            <Tc>Ouvrez</Tc>{' '}
            <a href="https://opentimestamps.org" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">
              <Tc>opentimestamps.org</Tc>
            </a>{' '}
            <Tc>et déposez le fichier .ots puis le fichier .json.</Tc>
          </li>
          <li>
            <Tc>Ou, en ligne de commande :</Tc> <code className="rounded bg-surface-container px-1 font-mono text-[11px]">ots verify fichier.json.ots</code>
          </li>
        </ol>
      </section>

      {report?.dossier && <DossierSummary dossier={report.dossier} />}
    </div>
  );
}
