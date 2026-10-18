'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CopyButton } from '@/components/app/CopyButton';
import { Icon } from '@/components/ui/Icon';
import { Chip, ErrorNote, Spinner } from '@/components/ui/primitives';
import { shortHash } from '@/lib/ledgerLabels';
import { formatDateTime, formatInt } from '@/lib/money';
import type { AnchorView } from '@/server/anchors';

/** One Bitcoin anchoring: status, downloadable proof, public link, manual refresh. */
export function AnchorCard({ initial, index }: { initial: AnchorView; index: number }) {
  const router = useRouter();
  const [anchor, setAnchor] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmed = anchor.status === 'confirmed';
  const failed = anchor.status === 'failed';

  const refresh = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/anchors/${anchor.id}/refresh`, { method: 'POST' });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Vérification impossible');
      const changed = json.anchor.status !== anchor.status;
      setAnchor(json.anchor);
      if (changed) router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-3 rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-title-md text-title-md">Ancrage n° {index}</p>
          <p className="font-label-sm text-label-sm text-on-surface-variant">Couvre les événements 1 à {anchor.upToSeq} · {formatDateTime(anchor.submittedAt)}</p>
        </div>
        {confirmed ? (
          <Chip tone="success" icon="verified">
            Bloc {anchor.bitcoinBlock ? formatInt(anchor.bitcoinBlock) : ''}
          </Chip>
        ) : failed ? (
          <Chip tone="danger" icon="error">
            Échec
          </Chip>
        ) : (
          <Chip tone="warning" icon="hourglass_top">
            En attente
          </Chip>
        )}
      </div>

      <p className="flex items-center gap-2 font-mono text-[12px] text-on-surface-variant" title={anchor.digest}>
        <Icon name="fingerprint" size={16} className="shrink-0 text-primary" />
        {shortHash(anchor.digest, 14, 10)}
      </p>

      {confirmed && (
        <p className="rounded-xl bg-[#F0FDF4] px-3 py-2 font-body-sm text-body-sm text-[#166534]">
          Cette empreinte est inscrite dans la blockchain Bitcoin{anchor.confirmedAt ? ` (constaté le ${formatDateTime(anchor.confirmedAt)})` : ''}. Personne ne peut modifier ce dossier sans que l&apos;empreinte change.
        </p>
      )}
      {!confirmed && !failed && (
        <p className="rounded-xl bg-[#FFFBEB] px-3 py-2 font-body-sm text-body-sm text-[#92400E]">
          L&apos;empreinte a été remise aux serveurs OpenTimestamps ({anchor.pendingCalendars.length || 1}). Ils l&apos;inscrivent dans un bloc Bitcoin, en général sous quelques heures. Revenez actualiser plus tard.
        </p>
      )}
      {failed && anchor.error && <p className="rounded-xl bg-error-container px-3 py-2 font-body-sm text-body-sm text-on-error-container">{anchor.error}</p>}

      {anchor.blockCheck?.state === 'verified' && (
        <p className="flex items-start gap-2 font-label-md text-label-md text-[#15803D]">
          <Icon name="task_alt" size={18} className="mt-px shrink-0" /> Contrôle croisé : le bloc public contient bien cette empreinte{anchor.blockCheck.time ? ` (bloc du ${formatDateTime(anchor.blockCheck.time)})` : ''}.
        </p>
      )}
      {anchor.blockCheck?.state === 'mismatch' && (
        <p className="flex items-start gap-2 font-label-md text-label-md text-error">
          <Icon name="warning" size={18} className="mt-px shrink-0" /> Non vérifié localement : le contrôle croisé ne correspond pas. Vérifiez avec l&apos;outil officiel OpenTimestamps.
        </p>
      )}
      {anchor.blockCheck?.state === 'unavailable' && (
        <p className="font-label-sm text-label-sm text-on-surface-variant">Contrôle croisé indisponible pour l&apos;instant ({anchor.blockCheck.reason}).</p>
      )}

      <ErrorNote>{error}</ErrorNote>
      <div className="flex flex-wrap gap-2">
        {!failed && (
          <button type="button" onClick={refresh} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary-container px-4 font-label-md text-label-md font-semibold text-on-primary shadow-sm transition active:scale-95 disabled:opacity-60">
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" size={16} />} {confirmed ? 'Revérifier' : 'Actualiser'}
          </button>
        )}
        {anchor.hasOts && (
          <a href={`/api/anchors/${anchor.id}/ots`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container-high">
            <Icon name="download" size={16} /> Preuve .ots
          </a>
        )}
        <a href={`/api/anchors/${anchor.id}/dossier`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container-high">
          <Icon name="description" size={16} /> Dossier .json
        </a>
        <Link href={`/verifier/${anchor.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-surface-container px-3.5 font-label-md text-label-md font-semibold text-primary hover:bg-surface-container-high">
          <Icon name="fact_check" size={16} /> Page publique
        </Link>
        <CopyButton value={`/verifier/${anchor.id}`} label="Copier le lien" />
      </div>
    </article>
  );
}
