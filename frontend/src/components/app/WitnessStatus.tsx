import { Icon } from '@/components/ui/Icon';
import { formatDateTime } from '@/lib/money';
import type { Project, Step } from '@/lib/types';
import { Tc } from '@/lib/i18n/client';
import { getT } from '@/lib/i18n/server';

/** On the step of a proof waiting for the funder: what the independent witness said (or that we are waiting for them). */
export async function WitnessStatus({ project, step }: { project: Pick<Project, 'witness'>; step: Pick<Step, 'proof'> }) {
  const t = await getT();
  const w = project.witness;
  if (!w) return null;
  const answer = step.proof?.witness;
  if (!answer) {
    return (
      <div className="flex items-start gap-3 rounded-2xl bg-[#E0F2FE] p-3.5 text-[#0C4A6E] ring-1 ring-[#0369A1]/20">
        <Icon name="hourglass_top" size={22} className="mt-0.5 shrink-0" />
        <p className="font-body-sm text-body-sm">
          {t('Le témoin ({name}) n’a pas encore répondu.', { name: w.name })}{' '}
          {w.required ? <strong><Tc>Aucun paiement tant qu’il n’a pas confirmé.</Tc></strong> : <Tc>Vous pouvez décider sans attendre.</Tc>}
        </p>
      </div>
    );
  }
  const ok = answer.verdict === 'confirmed';
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-3.5 ${ok ? 'bg-[#DCFCE7] text-[#14532D] ring-1 ring-[#16A34A]/25' : 'bg-error-container text-on-error-container'}`} role={ok ? 'status' : 'alert'}>
      <Icon name={ok ? 'check_circle' : 'report'} size={22} filled className="mt-0.5 shrink-0" />
      <div className="font-body-sm text-body-sm">
        <p>
          <strong>{ok ? t('Le témoin ({name}) confirme cette preuve.', { name: w.name }) : t('Le témoin ({name}) conteste cette preuve.', { name: w.name })}</strong>{' '}
          <span className="opacity-80">{formatDateTime(answer.at, t)}</span>
        </p>
        {answer.note && <p className="mt-1 italic">« {answer.note} »</p>}
      </div>
    </div>
  );
}
