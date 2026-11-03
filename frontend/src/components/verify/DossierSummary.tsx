'use client';

import { Icon } from '@/components/ui/Icon';
import { shortHash, LEDGER_LABEL } from '@/lib/ledgerLabels';
import { formatDateTime, formatUsdShort } from '@/lib/money';
import { SECTORS } from '@/lib/templates';
import type { LedgerType, Sector } from '@/lib/types';
import type { DossierLike } from '@/lib/verify';
import { Tc, useT } from '@/lib/i18n/client';

const STATUS_LABEL: Record<string, string> = {
  paid: 'Payée',
  releasing: 'Paiement en cours',
  proof_submitted: 'Preuve à valider',
  active: 'En attente de preuve',
  upcoming: 'À venir',
  rejected: 'Preuve à refaire',
};

type T = (fr: string, vars?: Record<string, string | number>) => string;

function describe(t: T, type: string, data: Record<string, unknown>): string {
  const usd = (v: unknown) => (typeof v === 'number' ? formatUsdShort(v) : '');
  const step = String(data.index);
  switch (type) {
    case 'funding_paid':
      return typeof data.contributor === 'string' && data.contributor
        ? t('{amount} reçus de {name} ({method})', { amount: usd(data.amountCents), name: data.contributor, method: String(data.method ?? 'lightning') })
        : t('{amount} reçus ({method})', { amount: usd(data.amountCents), method: String(data.method ?? 'lightning') });
    case 'step_approved':
      return t('Étape {step} validée', { step }) + (data.amountCents ? ` · ${usd(data.amountCents)}` : '');
    case 'proof_submitted': {
      const photos = Array.isArray(data.photos) ? data.photos.length : 0;
      return t(photos > 1 ? 'Étape {step} · {photos} photos' : 'Étape {step} · {photos} photo', { step, photos }) + (data.invoice ? ` + ${t('facture')}` : '');
    }
    case 'payout_started':
      return t('Étape {step} · {amount} vers {name}', { step, amount: usd(data.amountUsdCents), name: (data.supplier as { name?: string } | undefined)?.name ?? t('le fournisseur') });
    case 'payout_completed':
      return t('Étape {step} · fournisseur payé', { step });
    case 'step_rejected':
      return `${t('Étape {step}', { step })}${data.note ? ` · « ${String(data.note)} »` : ''}`;
    case 'ai_review':
      return t('Étape {step} · avis de l’IA demandé ({model})', { step, model: String(data.model ?? '') });
    case 'witness_response':
      return t(data.verdict === 'confirmed' ? 'Étape {step} · confirmée par le témoin {name}' : 'Étape {step} · contestée par le témoin {name}', { step, name: String(data.witness ?? '') });
    case 'payout_failed':
      return t('Étape {step} · {error}', { step, error: String(data.error ?? t('refusé')) });
    default:
      return '';
  }
}

/** Readable view of a dossier file: the project, its steps and its chronological events. */
export function DossierSummary({ dossier }: { dossier: DossierLike }) {
  const t = useT();
  const { project } = dossier;
  const sector = SECTORS[project.sector as Sector];
  const paid = project.steps.filter((s) => s.status === 'paid').length;

  return (
    <div className="flex flex-col gap-space-md">
      <section className="rounded-2xl bg-surface-container-lowest p-4 shadow-sm ring-1 ring-outline-variant/30">
        <p className="flex items-center gap-2 font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
          {sector && <Icon name={sector.icon} size={16} />} {sector ? t(sector.label) : project.sector} · {project.city}
        </p>
        <h3 className="mt-1 font-title-lg text-title-lg">{project.name}</h3>
        <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
          <Tc>Budget</Tc> {formatUsdShort(project.budgetCents)} · {t(paid > 1 ? '{paid} étapes payées sur {total}' : '{paid} étape payée sur {total}', { paid, total: project.steps.length })}
        </p>
        <ol className="mt-3 flex flex-col gap-1.5">
          {project.steps.map((s) => (
            <li key={s.index} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low px-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <Icon name={s.status === 'paid' ? 'check_circle' : 'radio_button_unchecked'} size={18} filled={s.status === 'paid'} className={s.status === 'paid' ? 'text-[#16A34A]' : 'text-outline'} />
                <span className="truncate font-label-lg text-label-lg">
                  {s.index}. <Tc>{s.title}</Tc>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-label-lg text-label-lg font-bold">{formatUsdShort(s.amountCents)}</span>
                <span className="block font-label-sm text-label-sm text-on-surface-variant">{STATUS_LABEL[s.status] ? t(STATUS_LABEL[s.status]) : s.status}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section>
        <h3 className="mb-2 font-title-md text-title-md">{t(dossier.ledger.length > 1 ? 'événements ({n})' : 'événement ({n})', { n: dossier.ledger.length })}</h3>
        <ol className="flex flex-col divide-y divide-outline-variant/40 overflow-hidden rounded-2xl bg-surface-container-lowest shadow-sm ring-1 ring-outline-variant/30">
          {dossier.ledger.map((e) => {
            const meta = LEDGER_LABEL[e.type as LedgerType];
            return (
              <li key={e.seq} className="flex items-center gap-3 px-3.5 py-3">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta?.tone ?? 'bg-surface-container text-on-surface-variant'}`}>
                  <Icon name={meta?.icon ?? 'circle'} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-label-lg text-label-lg">{meta ? t(meta.label) : e.type}</span>
                  <span className="block truncate font-label-sm text-label-sm text-on-surface-variant">{describe(t, e.type, e.data) || formatDateTime(e.at)}</span>
                  <span className="block font-label-sm text-label-sm text-outline">
                    <Tc>N°</Tc> {e.seq} · {formatDateTime(e.at)}
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
