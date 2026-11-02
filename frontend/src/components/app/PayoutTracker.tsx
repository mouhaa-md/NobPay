import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/primitives';
import { formatDateTime, formatFcfa, formatRate, formatSats, formatUsd } from '@/lib/money';
import { supplierRoute } from '@/lib/supplierLabel';
import { SUPPLIER_NETWORKS } from '@/lib/templates';
import type { Step } from '@/lib/types';

type Phase = { label: string; detail?: string; state: 'done' | 'doing' | 'todo' | 'failed' };

/** Three-line tracker of a supplier payout, followed by the receipt once it is done. */
export function PayoutTracker({ step }: { step: Step }) {
  const payout = step.payout;
  if (!payout) return null;
  const done = payout.status === 'completed';
  const failed = payout.status === 'failed';

  const phases: Phase[] = [
    { label: 'Preuve validée', detail: step.decision ? formatDateTime(step.decision.at) : undefined, state: 'done' },
    { label: payout.lightning ? 'Paiement envoyé sur le réseau Lightning' : 'Paiement demandé à Bitnob', detail: formatDateTime(payout.startedAt), state: 'done' },
    {
      label: 'Reçu par le fournisseur',
      detail: done && payout.completedAt ? formatDateTime(payout.completedAt) : failed ? payout.error : `${SUPPLIER_NETWORKS[payout.supplier.network]} · en cours`,
      state: done ? 'done' : failed ? 'failed' : 'doing',
    },
  ];

  return (
    <div className="flex flex-col gap-space-md">
      <ol className="flex flex-col rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30" aria-label="Suivi du paiement">
        {phases.map((p, i) => (
          <li key={p.label} className="relative flex gap-3 pb-4 last:pb-0">
            {i < phases.length - 1 && <span aria-hidden="true" className={`absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-0.5 ${p.state === 'done' ? 'bg-[#16A34A]/50' : 'bg-outline-variant/60'}`} />}
            <span
              className={`z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                p.state === 'done' ? 'bg-[#16A34A] text-white' : p.state === 'failed' ? 'bg-error text-on-error' : p.state === 'doing' ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {p.state === 'done' ? <Icon name="check" size={16} /> : p.state === 'failed' ? <Icon name="close" size={16} /> : p.state === 'doing' ? <Spinner className="h-4 w-4" /> : <span className="h-2 w-2 rounded-full bg-current" />}
            </span>
            <span className="flex flex-col">
              <span className={`font-label-lg text-label-lg ${p.state === 'todo' ? 'text-on-surface-variant' : 'text-on-surface'}`}>{p.label}</span>
              {p.detail && <span className={`font-label-sm text-label-sm ${p.state === 'failed' ? 'text-error' : 'text-on-surface-variant'}`}>{p.detail}</span>}
            </span>
          </li>
        ))}
      </ol>

      {done && (
        <section className="rounded-2xl bg-[#F0FDF4] p-4 ring-1 ring-[#16A34A]/20">
          <p className="mb-3 flex items-center gap-2 font-title-md text-title-md text-[#15803D]">
            <Icon name="check_circle" filled /> Fournisseur payé
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 font-body-sm text-body-sm">
            <Item k="Bénéficiaire" v={payout.supplier.name} />
            <Item k={payout.lightning ? 'Destination' : 'Opérateur'} v={supplierRoute(payout.supplier)} />
            <Item k="Montant reçu" v={payout.lightning ? formatSats(payout.lightning.amountSats) : formatFcfa(payout.amountFcfa)} strong />
            <Item k="Débité" v={formatUsd(payout.amountUsdCents)} />
            {payout.lightning ? (
              <Item k="Prix du bitcoin" v={`1 BTC = ${Math.round(payout.lightning.btcUsd).toLocaleString('fr-FR')} $`} />
            ) : (
              <Item k="Taux" v={`1 $ = ${formatRate(payout.rate)} FCFA`} />
            )}
            <Item k="Référence" v={payout.reference} mono />
            {payout.lightning ? (
              <>
                <Item k="Empreinte du paiement" v={payout.lightning.paymentHash} mono />
                {payout.lightning.preimage && <Item k="Preuve de paiement" v={payout.lightning.preimage} mono />}
              </>
            ) : (
              payout.payoutId && <Item k="Identifiant Bitnob" v={payout.payoutId} mono />
            )}
            <Item k="Mode" v={payout.mode === 'mock' ? 'Simulation (aucun argent réel)' : payout.mode === 'nwc' ? 'Bitcoin réel (Lightning)' : 'Sandbox Bitnob (test)'} />
          </dl>
        </section>
      )}
    </div>
  );
}

function Item({ k, v, strong, mono }: { k: string; v: string; strong?: boolean; mono?: boolean }) {
  return (
    <>
      <dt className="text-on-surface-variant">{k}</dt>
      <dd className={`min-w-0 break-words text-right ${strong ? 'font-bold text-on-surface' : 'font-medium text-on-surface'} ${mono ? 'font-mono text-[11px]' : ''}`}>{v}</dd>
    </>
  );
}
