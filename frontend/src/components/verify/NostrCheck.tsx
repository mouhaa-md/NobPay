'use client';

import { npubEncode } from 'nostr-tools/nip19';
import { useCallback, useEffect, useState } from 'react';
import { CheckRow, type CheckState } from '@/components/verify/CheckRow';
import { verifyOnRelays, type NostrReport } from '@/lib/nostr/commitment';
import type { DossierEventLike } from '@/lib/verify';

const STATE: Record<NostrReport['state'], CheckState> = { none: 'idle', confirmed: 'ok', partial: 'pending', conflict: 'bad', unreachable: 'idle' };

/**
 * One line of the verification checklist: does the ledger match what its Nostr key published on public relays?
 * The browser asks the relays itself and checks every signature; nothing goes through NobPay.
 */
export function NostrCheck({ ledger }: { ledger: DossierEventLike[] }) {
  const [report, setReport] = useState<NostrReport | null>(null);

  const run = useCallback(async () => {
    setReport(null);
    setReport(await verifyOnRelays(ledger));
  }, [ledger]);

  useEffect(() => {
    void run();
  }, [run]);

  const retry = (
    <button type="button" onClick={() => void run()} className="ml-1 font-semibold text-primary underline">
      Relancer
    </button>
  );

  if (!report) return <CheckRow state="wait" title="Le registre est répliqué sur Nostr">Interrogation des relais depuis votre navigateur…</CheckRow>;

  const reached = report.relays.filter((r) => r.ok).length;
  const npub = report.pubkey ? npubEncode(report.pubkey) : '';
  const cmp = report.comparison;
  const missing = cmp?.perSeq.filter((p) => p.state === 'missing').map((p) => p.seq) ?? [];
  const pending = cmp?.perSeq.filter((p) => p.state === 'pending').length ?? 0;

  return (
    <CheckRow state={STATE[report.state]} title="Le registre est répliqué sur Nostr">
      {report.state === 'none' && 'Ce projet n’a pas publié son registre sur Nostr.'}
      {report.state === 'unreachable' && (
        <>
          Aucun relais n’a répondu pour l’instant ({report.relays.length} essayés).{retry}
        </>
      )}
      {report.state === 'confirmed' && (
        <>
          {report.confirmed} engagement{report.confirmed > 1 ? 's' : ''} retrouvé{report.confirmed > 1 ? 's' : ''} sur {reached} relais, signé{report.confirmed > 1 ? 's' : ''} par la clé du projet{' '}
          <code className="font-mono text-[11px]">{npub.slice(0, 14)}…</code>, et identique{report.confirmed > 1 ? 's' : ''} à ce registre.
          {pending > 0 && ` ${pending} plus récent${pending > 1 ? 's' : ''} en cours de publication.`}
          {cmp && cmp.beyond > 0 && ` Les relais connaissent ${cmp.beyond} événement${cmp.beyond > 1 ? 's' : ''} postérieur${cmp.beyond > 1 ? 's' : ''} à ce dossier${cmp.continuity ? ' (qui prolongent bien son dernier événement)' : ''}.`}
        </>
      )}
      {report.state === 'partial' && (
        <>
          {report.confirmed}/{report.total} engagement{report.total > 1 ? 's' : ''} retrouvé{report.confirmed > 1 ? 's' : ''} sur {reached} relais.
          {missing.length > 0 && ` Absents des relais : événement${missing.length > 1 ? 's' : ''} ${missing.slice(0, 6).join(', ')}${missing.length > 6 ? '…' : ''}.`}
          {pending > 0 && ` ${pending} en cours de publication (quelques secondes à quelques minutes).`}
          {missing.length > 0 && ' Un relais peut être lent ou ne pas tout garder : relancez, ou comparez avec un autre client Nostr.'} {retry}
        </>
      )}
      {report.state === 'conflict' && (
        <>
          {cmp && cmp.conflicts.length > 0
            ? `Un engagement publié sur Nostr dit autre chose que ce registre à l’événement ${cmp.conflicts[0].seq} : le registre a pu être réécrit après coup.`
            : 'Le premier événement publié après ce dossier ne prolonge pas son dernier événement : l’histoire a divergé.'}{' '}
          Conservez ce dossier et signalez-le.
        </>
      )}
    </CheckRow>
  );
}
