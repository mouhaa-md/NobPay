'use client';

import { npubEncode } from 'nostr-tools/nip19';
import { useCallback, useEffect, useState } from 'react';
import { CheckRow, type CheckState } from '@/components/verify/CheckRow';
import { verifyOnRelays, type NostrReport } from '@/lib/nostr/commitment';
import type { DossierEventLike } from '@/lib/verify';
import { Tc, useT } from '@/lib/i18n/client';

const STATE: Record<NostrReport['state'], CheckState> = { none: 'idle', confirmed: 'ok', partial: 'pending', conflict: 'bad', unreachable: 'idle' };

/**
 * One line of the verification checklist: does the ledger match what its Nostr key published on public relays?
 * The browser asks the relays itself and checks every signature; nothing goes through NobPay.
 */
export function NostrCheck({ ledger }: { ledger: DossierEventLike[] }) {
  const t = useT();
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
      <Tc>Relancer</Tc>
    </button>
  );

  if (!report) return <CheckRow state="wait" title={t('Le registre est répliqué sur Nostr')}><Tc>Interrogation des relais depuis votre navigateur…</Tc></CheckRow>;

  const reached = report.relays.filter((r) => r.ok).length;
  const npub = report.pubkey ? npubEncode(report.pubkey) : '';
  const cmp = report.comparison;
  const missing = cmp?.perSeq.filter((p) => p.state === 'missing').map((p) => p.seq) ?? [];
  const pending = cmp?.perSeq.filter((p) => p.state === 'pending').length ?? 0;

  const plural = (n: number, one: string, many: string) => (n > 1 ? many : one);
  const tail: string[] = [];
  if (pending > 0) tail.push(t(plural(pending, '{pending} plus récent en cours de publication.', '{pending} plus récents en cours de publication.'), { pending }));
  if (cmp && cmp.beyond > 0) {
    tail.push(
      cmp.continuity
        ? t(plural(cmp.beyond, 'Les relais connaissent {beyond} événement postérieur à ce dossier (qui prolonge bien son dernier événement).', 'Les relais connaissent {beyond} événements postérieurs à ce dossier (qui prolongent bien son dernier événement).'), { beyond: cmp.beyond })
        : t(plural(cmp.beyond, 'Les relais connaissent {beyond} événement postérieur à ce dossier.', 'Les relais connaissent {beyond} événements postérieurs à ce dossier.'), { beyond: cmp.beyond }),
    );
  }

  return (
    <CheckRow state={STATE[report.state]} title={t('Le registre est répliqué sur Nostr')}>
      {report.state === 'none' && t('Ce projet n’a pas publié son registre sur Nostr.')}
      {report.state === 'unreachable' && (
        <>
          {t('Aucun relais n’a répondu pour l’instant ({n} essayés).', { n: report.relays.length })} {retry}
        </>
      )}
      {report.state === 'confirmed' && (
        <>
          {t(plural(report.confirmed, '{n} engagement retrouvé sur {relays} relais, signé par la clé du projet', '{n} engagements retrouvés sur {relays} relais, signés par la clé du projet'), { n: report.confirmed, relays: reached })}{' '}
          <code className="font-mono text-[11px]">{npub.slice(0, 14)}…</code>
          {t(plural(report.confirmed, ', et identique à ce registre.', ', et identiques à ce registre.'))} {tail.join(' ')}
        </>
      )}
      {report.state === 'partial' && (
        <>
          {t(plural(report.total, '{n}/{total} engagement retrouvé sur {relays} relais.', '{n}/{total} engagements retrouvés sur {relays} relais.'), { n: report.confirmed, total: report.total, relays: reached })}
          {missing.length > 0 && ` ${t(plural(missing.length, 'Absent des relais : événement {list}.', 'Absents des relais : événements {list}.'), { list: missing.slice(0, 6).join(', ') + (missing.length > 6 ? '…' : '') })}`}
          {pending > 0 && ` ${t('{pending} en cours de publication (quelques secondes à quelques minutes).', { pending })}`}
          {missing.length > 0 && ` ${t('Un relais peut être lent ou ne pas tout garder : relancez, ou comparez avec un autre client Nostr.')}`} {retry}
        </>
      )}
      {report.state === 'conflict' && (
        <>
          {cmp && cmp.conflicts.length > 0
            ? t('Un engagement publié sur Nostr dit autre chose que ce registre à l’événement {seq} : le registre a pu être réécrit après coup.', { seq: cmp.conflicts[0].seq })
            : t('Le premier événement publié après ce dossier ne prolonge pas son dernier événement : l’histoire a divergé.')}{' '}
          <Tc>Conservez ce dossier et signalez-le.</Tc>
        </>
      )}
    </CheckRow>
  );
}
