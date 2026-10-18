import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/primitives';
import { formatFcfa, formatUsdShort, relativeDay } from '@/lib/money';
import { MOBILE_NETWORKS, PROOF_LABEL } from '@/lib/templates';
import type { Step } from '@/lib/types';

interface Look {
  circle: string;
  icon: string;
  label: string;
  labelTone: string;
}

const LOOK: Record<Step['status'], Look> = {
  paid: { circle: 'bg-[#16A34A] text-white', icon: 'check', label: 'Payée', labelTone: 'text-[#15803D]' },
  releasing: { circle: 'bg-primary-container text-on-primary', icon: 'sync', label: 'Paiement en cours', labelTone: 'text-primary' },
  proof_submitted: { circle: 'bg-[#F59E0B] text-white', icon: 'photo_camera', label: 'Preuve à valider', labelTone: 'text-[#B45309]' },
  rejected: { circle: 'bg-error text-on-error', icon: 'undo', label: 'Preuve à refaire', labelTone: 'text-error' },
  active: { circle: 'bg-primary-container text-on-primary', icon: 'hourglass_top', label: 'En attente de la preuve', labelTone: 'text-primary' },
  upcoming: { circle: 'bg-surface-container-high text-on-surface-variant', icon: 'lock', label: 'À venir', labelTone: 'text-on-surface-variant' },
};

/** Vertical stepper of a project: one card per step, each linking to its own screen. */
export function StepTimeline({ projectId, steps }: { projectId: string; steps: Step[] }) {
  return (
    <ol className="relative flex flex-col">
      {steps.map((step, i) => {
        const look = LOOK[step.status];
        const last = i === steps.length - 1;
        const supplier = step.payout?.supplier ?? step.proof?.supplier;
        return (
          <li key={step.id} className="relative flex gap-3 pb-3">
            {!last && <span aria-hidden="true" className={`absolute left-[17px] top-9 h-[calc(100%-1.5rem)] w-0.5 ${step.status === 'paid' ? 'bg-[#16A34A]/50' : 'bg-outline-variant/60'}`} />}
            <span className={`z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${look.circle}`}>
              {step.status === 'releasing' ? <Spinner className="h-5 w-5" /> : <Icon name={look.icon} size={20} />}
            </span>
            <Link
              href={`/app/projets/${projectId}/etapes/${step.id}`}
              className={`min-w-0 flex-1 rounded-2xl p-3.5 shadow-sm transition hover:shadow-md ${step.status === 'proof_submitted' ? 'bg-[#FFFBEB] ring-1 ring-[#F59E0B]/40' : 'bg-surface-container-lowest'}`}
            >
              <span className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-label-sm text-label-sm text-on-surface-variant">Étape {step.index}</span>
                  <span className="block truncate font-title-md text-title-md text-on-surface">{step.title}</span>
                </span>
                <span className="shrink-0 font-title-md text-title-md font-bold text-on-surface">{formatUsdShort(step.amountCents)}</span>
              </span>
              <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                <span className={`font-label-md text-label-md font-semibold ${look.labelTone}`}>{look.label}</span>
                <span className="font-label-sm text-label-sm text-on-surface-variant">
                  {step.status === 'paid' && step.payout?.completedAt && relativeDay(step.payout.completedAt)}
                  {step.status === 'upcoming' && step.proofKinds.map((k) => PROOF_LABEL[k]).join(' · ')}
                  {step.status === 'active' && 'Preuve attendue'}
                  {step.status === 'proof_submitted' && step.proof && relativeDay(step.proof.submittedAt)}
                </span>
              </span>
              {step.status === 'paid' && step.payout && (
                <span className="mt-1.5 flex items-center gap-1.5 font-label-sm text-label-sm text-on-surface-variant">
                  <Icon name="payments" size={14} /> {supplier?.name} · {supplier && MOBILE_NETWORKS[supplier.network]} · {formatFcfa(step.payout.amountFcfa)}
                </span>
              )}
              {step.status === 'rejected' && step.decision?.note && <span className="mt-1.5 block font-label-sm text-label-sm text-error">« {step.decision.note} »</span>}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
