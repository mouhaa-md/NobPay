import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { formatFcfa, formatUsd, relativeDay } from '@/lib/money';
import type { ActivityItem } from '@/server/views';

const ICON_BOX: Record<ActivityItem['kind'], string> = {
  funding: 'bg-[#FFEDD5] text-[#C26700]',
  step_validated: 'bg-[#DCFCE7] text-[#15803D]',
  payout: 'bg-secondary-container text-on-secondary-container',
  proof_pending: 'bg-[#FEF3C7] text-[#B45309]',
  proof_rejected: 'bg-error-container text-on-error-container',
  payout_failed: 'bg-error-container text-on-error-container',
};

const AMOUNT_TONE = { positive: 'text-[#15803D]', negative: 'text-on-surface', neutral: 'text-primary' } as const;

export function ActivityList({ items, empty = 'Aucune activité pour le moment.' }: { items: ActivityItem[]; empty?: string }) {
  if (items.length === 0) {
    return <p className="rounded-2xl bg-surface-container-low p-space-md text-center font-body-md text-on-surface-variant">{empty}</p>;
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((a) => (
        <li key={a.id}>
          <Link
            href={a.kind === 'proof_pending' ? `/app/projets/${a.projectId}` : `/app/projets/${a.projectId}`}
            className="flex items-center gap-3 rounded-2xl bg-surface-container-lowest p-3.5 shadow-sm transition hover:shadow-md"
          >
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${ICON_BOX[a.kind]}`}>
              <Icon name={a.icon} size={20} filled={a.kind !== 'payout'} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-title-md text-title-md text-on-surface">{a.title}</span>
                {a.amountCents !== undefined && (
                  <span className={`shrink-0 font-title-md text-title-md font-semibold ${AMOUNT_TONE[a.tone]}`}>
                    {a.tone === 'positive' ? '+' : a.tone === 'negative' ? '−' : ''}
                    {formatUsd(a.amountCents)}
                    {a.badge ? <span className="ml-1 font-label-sm text-label-sm font-medium text-on-surface-variant">{a.badge}</span> : null}
                  </span>
                )}
                {a.amountCents === undefined && a.badge && (
                  <span className="shrink-0 rounded-full bg-[#FEF3C7] px-2 py-0.5 font-label-sm text-label-sm font-semibold uppercase text-[#B45309]">{a.badge}</span>
                )}
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{a.subtitle}</span>
                <span className="shrink-0 font-body-sm text-body-sm text-on-surface-variant">{relativeDay(a.at)}</span>
              </span>
              {a.amountFcfa !== undefined && <span className="mt-1 font-label-sm text-label-sm text-on-surface-variant/80">−{formatFcfa(a.amountFcfa)}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
