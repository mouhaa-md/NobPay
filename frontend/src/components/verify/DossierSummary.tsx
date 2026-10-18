import { Icon } from '@/components/ui/Icon';
import { shortHash, LEDGER_LABEL } from '@/lib/ledgerLabels';
import { formatDateTime, formatUsdShort } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import type { LedgerType, Sector } from '@/lib/types';
import type { DossierLike } from '@/lib/verify';

const STATUS_LABEL: Record<string, string> = {
  paid: 'Payée',
  releasing: 'Paiement en cours',
  proof_submitted: 'Preuve à valider',
  active: 'En attente de preuve',
  upcoming: 'À venir',
  rejected: 'Preuve à refaire',
};

function describe(type: string, data: Record<string, unknown>): string {
  const usd = (v: unknown) => (typeof v === 'number' ? formatUsdShort(v) : '');
  switch (type) {
    case 'funding_paid':
      return `${usd(data.amountCents)} reçus (${String(data.method ?? 'lightning')})`;
    case 'step_approved':
      return `Étape ${String(data.index)} validée${data.amountCents ? ` · ${usd(data.amountCents)}` : ''}`;
    case 'proof_submitted':
      return `Étape ${String(data.index)} · ${Array.isArray(data.photos) ? data.photos.length : 0} photo(s)${data.invoice ? ' + facture' : ''}`;
    case 'payout_started':
      return `Étape ${String(data.index)} · ${usd(data.amountUsdCents)} vers ${(data.supplier as { name?: string } | undefined)?.name ?? 'le fournisseur'}`;
    case 'payout_completed':
      return `Étape ${String(data.index)} · fournisseur payé`;
    case 'step_rejected':
      return `Étape ${String(data.index)}${data.note ? ` · « ${String(data.note)} »` : ''}`;
    case 'payout_failed':
      return `Étape ${String(data.index)} · ${String(data.error ?? 'refusé')}`;
    default:
      return '';
  }
}

/** Readable view of a dossier file: the project, its steps and its chronological events. */
export function DossierSummary({ dossier }: { dossier: DossierLike }) {
  const { project } = dossier;
  const sector = SECTORS[project.sector as Sector];
  const paid = project.steps.filter((s) => s.status === 'paid').length;

  return (
    <div className="flex flex-col gap-space-md">
      <section className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
        <p className="flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          {sector && <Icon name={sector.icon} size={16} />} {sector?.label ?? project.sector} · {project.city}
        </p>
        <h3 className="mt-1 font-title-lg text-title-lg">{project.name}</h3>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          Budget {formatUsdShort(project.budgetCents)} · {paid} étape{paid > 1 ? 's' : ''} payée{paid > 1 ? 's' : ''} sur {project.steps.length}
        </p>
        <ol className="mt-3 flex flex-col gap-1.5">
          {project.steps.map((s) => (
            <li key={s.index} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name={s.status === 'paid' ? 'check_circle' : 'radio_button_unchecked'} size={18} filled={s.status === 'paid'} className={s.status === 'paid' ? 'text-[#16A34A]' : 'text-outline'} />
                <span className="truncate font-label-lg text-label-lg">
                  {s.index}. {s.title}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-label-lg text-label-lg font-bold">{formatUsdShort(s.amountCents)}</span>
                <span className="block font-label-sm text-label-sm text-on-surface-variant">{STATUS_LABEL[s.status] ?? s.status}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-title-md text-title-md">événements ({dossier.ledger.length})</h3>
        <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
          {dossier.ledger.map((e) => {
            const meta = LEDGER_LABEL[e.type as LedgerType];
            return (
              <li key={e.seq} className="flex items-center gap-3 px-3.5 py-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta?.tone ?? 'bg-surface-container text-on-surface-variant'}`}>
                  <Icon name={meta?.icon ?? 'circle'} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-label-lg text-label-lg">{meta?.label ?? e.type}</span>
                  <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">{describe(e.type, e.data) || formatDateTime(e.at)}</span>
                  <span className="block font-label-sm text-label-sm text-outline">
                    N° {e.seq} · {formatDateTime(e.at)}
                  </span>
                </span>
                <span className="hidden shrink-0 font-mono text-[11px] text-outline sm:block" title={e.hash}>
                  {shortHash(e.hash, 6, 4)}
                </span>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}
